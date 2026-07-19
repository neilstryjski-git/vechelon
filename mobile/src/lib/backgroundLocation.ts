import { SUPABASE_URL, SUPABASE_ANON_KEY } from './env';
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
// ping, and by sendDormantPing below. (The old expo-location FGS TaskManager path that
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
export async function sendDormantPing(args: {
  rideId: string;
  riderId: string;
  lat: number;
  lng: number;
}): Promise<void> {
  const sent = await restBroadcast(args.rideId, {
    riderId: args.riderId,
    state: 'dormant',
    lat: args.lat,
    lng: args.lng,
    ts: Date.now(),
  });
  void logMeasurement({
    rideId: args.rideId,
    kind: 'app_state_change',
    payload: { event: 'dormant_sent', sent },
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
export async function broadcastDeparture(rideId: string, riderId: string): Promise<void> {
  await restBroadcast(rideId, { riderId, ts: Date.now() }, DEPARTED_EVENT);
  try {
    const { data } = await supabase.auth.getSession();
    const uid = data.session?.user?.id;
    if (uid) {
      await supabase
        .from('ride_participants')
        .update({ last_lat: null, last_long: null, last_ping: null })
        .eq('ride_id', rideId)
        .eq('account_id', uid);
    }
  } catch (e) {
    console.warn('[Rail3] departure clear failed', e);
  }
  void logMeasurement({ rideId, kind: 'app_state_change', payload: { event: 'departed_sent', riderId } });
}
