import { SUPABASE_URL, SUPABASE_ANON_KEY } from './env';
import type { RiderTacticalState } from '../state/riderState';
import { supabase } from './supabase';
import { logMeasurement } from './measure';
import { isCurrentIdentity } from './identity';
import { rail3RideTopic } from '../hooks/useRideChannel';

// Mirror of useFleetPositions.POSITION_EVENT / DEPARTED_EVENT — inlined to avoid a circular
// import. Keep these in sync with the exports in useFleetPositions.ts.
const POSITION_EVENT = 'pos';
const DEPARTED_EVENT = 'depart';

// Shared REST broadcast on the rail3 ride topic. REST (HTTP), NOT the websocket —
// a Doze/background context can't be trusted to keep a socket alive (W179), and the
// JS engine is frozen the instant the screen locks, so a websocket flush races the
// freeze and usually loses. A fresh user token authorizes the send RLS
// (rail3_broadcast_tenant_send → tenant member); getSession refreshes an expired one —
// load-bearing because a ride can outlive the 1-hour access token. Returns true if the
// POST went out, false if there was no token or it threw.
//
// USED BY: the Transistorsoft engine (bgGeo, via useFleetPositions) for every position
// ping, and by sendSleepingPing below. (The old expo-location FGS TaskManager path that
// also used this was removed in W203 once Transistorsoft became the sole engine.)
export async function restBroadcast(
  rideId: string,
  payload: Record<string, unknown>,
  event: string = POSITION_EVENT,
): Promise<boolean> {
  // The try wraps getSession() TOO, not just the fetch. It used to cover only the fetch, so the
  // contract above ("false if there was no token or it threw") was a lie: getSession() can REJECT
  // — auth-js takes the processLock configured in supabase.ts and throws on a lock-acquire
  // timeout, and it rethrows non-AuthErrors from a token refresh. That rejection propagated
  // straight out of restBroadcast into the Transistorsoft location handler, which calls this
  // fire-and-forget (`void restBroadcast(...)`) — an unhandled rejection, and a rider silently
  // stranded off the fleet map with nothing logged. Now every failure mode returns false: one
  // dropped ping, the next fix is seconds away.
  try {
    const { data: s } = await supabase.auth.getSession();
    const token = s.session?.access_token;
    if (!token) return false;
    // D77 — the identity invariant, enforced at the ONE point where the CLAIMED rider and the
    // token that will actually sign the request meet. These could disagree: the payload carried a
    // snapshot taken at map-mount while this token comes from the live session, so after an
    // account swap the app broadcast as A over B's credentials — data the server cannot reject,
    // because the signature is genuinely B's. REFUSE rather than send: a wrong-identity position
    // corrupts every receiver's fleet, and dropping one ping costs nothing. Reuse the session we
    // already hold — no second read on the hot ping path.
    const claimed = typeof payload.riderId === 'string' ? payload.riderId : null;
    const ok = await isCurrentIdentity(claimed, rideId, 'broadcast', s.session?.user?.id ?? null);
    if (!ok) return false;
    await fetch(`${SUPABASE_URL}/realtime/v1/api/broadcast`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messages: [
          { topic: rail3RideTopic(rideId), event, private: true, payload },
        ],
      }),
    });
    return true;
  } catch (e) {
    console.warn('[Rail3] broadcast failed', e);
    return false;
  }
}

// One-shot "I pocketed my phone" ping for the NO-background-tracking path (rider
// declined "Allow all the time", so the Transistorsoft FGS never starts). Sent over
// REST so it escapes before the OS freezes the JS engine on screen-lock — the fleet
// sees them go to SLEEP on purpose (calm) rather than decay into the alarming Dark.
// W293: wire value 'sleeping' (was 'dormant'); receivers on the previous build do not know it —
// one-release exposure, bounded by "all handsets on the new build before the field run".
export async function sendSleepingPing(args: {
  rideId: string;
  riderId: string;
  lat: number;
  lng: number;
}): Promise<void> {
  const sent = await restBroadcast(args.rideId, {
    riderId: args.riderId,
    // Typed against the receiver's union (type-only import, no runtime cycle) so a future rename of
    // RiderTacticalState fails tsc here instead of silently demoting Sleeping senders (review r1).
    state: 'sleeping' satisfies RiderTacticalState,
    lat: args.lat,
    lng: args.lng,
    ts: Date.now(),
  });
  void logMeasurement({
    rideId: args.rideId,
    kind: 'app_state_change',
    payload: { event: 'sleeping_sent', sent }, // W293: was 'dormant_sent' (historical sink rows keep the old string)
  });
}

// D87 — DELIBERATE departure. On sign-out or leaving a ride, tell the fleet the rider is GONE
// so their marker is removed, rather than lingering as a greying phantom at their last-known
// position (the fleet is otherwise additive — it never drops a rider, only greys them, so a
// deliberate leave was indistinguishable from a signal loss). TWO mechanisms, both needed:
//   1. a live `depart` broadcast → receivers currently subscribed drop the marker at once;
//   2. clear MY persisted last-known (ride_participants) → a receiver that only fetches later
//      (on resume) doesn't re-materialise the marker from the stale fallback.
// MUST run BEFORE supabase.auth.signOut() — both the broadcast RLS and the row update need the
// still-valid JWT. Scoped to my own row (account_id = auth.uid()), and restBroadcast's D77
// identity check ensures we only ever depart AS ourselves. Never throws; a failed departure
// just leaves the pre-existing (greying) phantom — strictly no worse than today.
//
// COLLISION-SAFE: if the same account is still live on another device, that device's live pings
// re-add the rider on the receiver and repopulate last-known — so this correctly removes only a
// TRULY departed rider, and self-heals when a second device is still present.
// W287 (R3-70): `clearLastKnown: false` on a RIDE-END teardown — the 'departed' broadcast still
// goes out (harmless; clears my marker on any peer not yet torn down) but last_lat / last_long /
// last_ping are NOT nulled: on a Saved ride they persist to the T+4h Hard Purge. Default true
// (a Leave Ride mid-ride is a real departure and clears them as before).
// W292 (C3 item 7, R3-65/68/70): the SAME own-row update now also stamps `departed_at` — the
// DURABLE departed mark a viewer who fetches later reads to tell "left" from "never pinged", and the
// sender-clock instant the fleet compares live pings against (departure beats seed, never rejoin —
// fleetCompose.ts). One statement, so the mark and the null-out land or fail together (a PGRST204
// on a staging without the migration fails BOTH — see the migration's DEPLOY ORDER). Ride-end
// teardown skips the whole branch, so a Saved ride never marks anyone departed (R3-70).
// W292 (review r1): the departure issued from beforeRemove is fire-and-forget and lands departed_at
// only after restBroadcast + getSession + the UPDATE round-trip, while a quick re-open's join effect
// SELECTs departed_at on mount. If that SELECT read NULL before the UPDATE committed, the rejoin
// branch would be skipped and the mark would land on a rider who is present and pinging — with
// nothing left to clear it (roster 'Left ride' for a live rider; peers drop them instead of Dark).
// So every departure registers its in-flight promise per ride, and the join path awaits it
// (bounded) before reading the row. Module-level, like the D77 caches: it must outlive the screen.
const inFlightDepartures = new Map<string, Promise<void>>();
export const DEPARTURE_SETTLE_MAX_WAIT_MS = 3000;

// Resolves when the pending departure for `rideId` has settled (or after `maxWaitMs`, whichever is
// first). Never rejects; no pending departure → resolves immediately.
export function awaitPendingDeparture(rideId: string, maxWaitMs = DEPARTURE_SETTLE_MAX_WAIT_MS): Promise<void> {
  const pending = inFlightDepartures.get(rideId);
  if (!pending) return Promise.resolve();
  return new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, maxWaitMs);
    void pending.finally(() => {
      clearTimeout(timer);
      resolve();
    });
  });
}

export async function broadcastDeparture(
  rideId: string,
  riderId: string,
  opts: { clearLastKnown?: boolean } = {},
): Promise<void> {
  const run = departureBody(rideId, riderId, opts);
  inFlightDepartures.set(rideId, run);
  try {
    await run;
  } finally {
    if (inFlightDepartures.get(rideId) === run) inFlightDepartures.delete(rideId);
  }
}

async function departureBody(
  rideId: string,
  riderId: string,
  opts: { clearLastKnown?: boolean },
): Promise<void> {
  // W290: a RIDE-END teardown still broadcasts 'depart' (W287 — clears my marker on peers not yet
  // torn down) but it is NOT Captain-departure news: flag it so the breadcrumb reader does not show
  // the "Captain has left" cue for a ride that just ended. useFleetPositions ignores the extra key
  // (the marker drop is unchanged). No identity in the flag.
  const sent = await restBroadcast(
    rideId,
    { riderId, ts: Date.now(), ...(opts.clearLastKnown === false ? { rideEnd: true } : {}) },
    DEPARTED_EVENT,
  );
  let cleared = false;
  let departedAt: string | null = null; // W292: the durable mark actually written (a timestamp, not a coordinate)
  try {
    const { data } = await supabase.auth.getSession();
    const uid = data.session?.user?.id;
    // W281 (R3-58 "never fires after the identity is gone", R3-57): the row write runs only
    // while the session STILL belongs to the rider we are departing AS. Sign-out waits a bounded
    // window for this call, so it can outlive the session: with no session there is no uid and
    // nothing is written; after an account swap uid is B's and this must not null B's row.
    if (opts.clearLastKnown !== false && uid && uid === riderId) {
      departedAt = new Date().toISOString();
      const { error } = await supabase
        .from('ride_participants')
        .update({ last_lat: null, last_long: null, last_ping: null, departed_at: departedAt })
        .eq('ride_id', rideId)
        .eq('account_id', uid);
      cleared = !error;
      if (error) {
        departedAt = null;
        console.warn('[Rail3] departure clear rejected', error.message);
      }
    }
  } catch (e) {
    console.warn('[Rail3] departure clear failed', e);
  }
  // Evidence row for the sign-out ordering (W281 SC-1): records what actually happened rather
  // than that we tried. `sent` is restBroadcast's verdict (false = no token / identity refused /
  // fetch threw), `cleared` = the last-known null-out succeeded under our own uid.
  void logMeasurement({
    rideId,
    kind: 'app_state_change',
    payload: { event: 'departed_sent', riderId, sent, cleared, departedAt },
  });
}
