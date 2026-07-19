import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import * as Location from 'expo-location';

import type { RealtimeChannel } from '@supabase/supabase-js';

import { supabase } from '../lib/supabase';
import { logMeasurement } from '../lib/measure';
import { sendDormantPing, restBroadcast } from '../lib/backgroundLocation';
import { startBgGeo, stopBgGeo, nudgeBgGeo } from '../lib/bgGeo';
import { setActiveRide } from '../lib/activeRide';
import type { RideChannelStatus } from './useRideChannel';
import { haversineDistanceM, LatLng } from '../lib/geo';
import { appendTrailPoint } from '../lib/breadcrumbTrail';
import type { FleetParticipant, RideRole, TacticalState } from '../lib/roleVisibility';
import { logFetchResult, logResumeSignal } from '../lib/lifecycle';
import { useResume, noteChannelActivity, notePeerCount, noteChannelStatus } from './useResume';
import type { ResumeSource } from '../lib/resumeDetector';
import {
  SenderStateTracker,
  deriveRenderState,
  StateThresholds,
  DEFAULT_THRESHOLDS,
} from '../state/riderState';

// Broadcast event name for position pings on the rail3:ride:<id> channel.
export const POSITION_EVENT = 'pos';
// D87: a rider signalling they've deliberately LEFT (sign-out / leave-ride). Receivers drop the
// rider's marker on this event, distinct from the passive greying of a rider who just went quiet.
// Mirrored (inlined) in backgroundLocation.ts to avoid a circular import — keep in sync.
export const DEPARTED_EVENT = 'depart';

// The ping payload is MINIMAL by design (review finding, W172): no phone, no
// display name, no self-reported role. Identity attributes come from the
// RLS-gated roster (useRideRoster) — W170's channel authz is tenant-level, so
// anything in the payload is readable by every tenant member regardless of
// role; the §4.1 gates must therefore bind to server-enforced data, not to
// whatever a client chooses to broadcast.
interface PositionPayload {
  riderId: string;
  state: TacticalState;
  lat: number;
  lng: number;
  ts: number;
}

export interface RideRosterEntry {
  role: RideRole;
  displayName: string;
  phone: string | null;
  participantStatus: string | null;
}

export type RideRoster = Record<string, RideRosterEntry>;

// RLS-gated roster read at meaningful events only — never per ping.
// participant_tactical_select encodes the §4.1 matrix server-side for
// non-affiliated tenants (Captain/SAG: every row; Rider: Captain/SAG + self),
// and role/name/phone are server-truth, immune to payload spoofing. CAVEAT
// (review 90480ee): the policy's RP-16 affiliated-tenant disjunct returns ALL
// participant rows (incl. phone) to affiliated Riders, so there the phone gate
// is client-side only — pre-existing policy breadth, tracked as a follow-up
// defect to column-restrict RP-16.
export function useRideRoster(rideId: string | null): {
  roster: RideRoster;
  refetchRoster: () => void;
} {
  const [roster, setRoster] = useState<RideRoster>({});
  const [fetchTick, setFetchTick] = useState(0);
  const lastFetchRef = useRef(0);

  // A ping from a rider the roster can't identify usually means someone joined
  // mid-ride (e.g. scanned the QR after this viewer opened the map) — refetch,
  // debounced so a storm of unknown pings still costs one read (DB reads stay
  // at meaningful events, per Pillar II §2).
  const refetchRoster = useCallback(() => {
    const now = Date.now();
    if (now - lastFetchRef.current < ROSTER_REFETCH_DEBOUNCE_MS) return;
    lastFetchRef.current = now;
    setFetchTick((t) => t + 1);
  }, []);

  useEffect(() => {
    if (!rideId) return;
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from('ride_participants')
        .select('account_id, role, display_name, phone, status')
        .eq('ride_id', rideId);
      if (cancelled || error || !data) return;

      const next: RideRoster = {};
      for (const row of data) {
        if (!row.account_id) continue; // guest session rows without an account
        next[row.account_id] = {
          role: (row.role as RideRole) ?? 'member',
          displayName: row.display_name ?? 'Rider',
          phone: row.phone ?? null,
          participantStatus: row.status ?? null,
        };
      }
      setRoster(next);
    })();
    return () => {
      cancelled = true;
    };
  }, [rideId, fetchTick]);

  return { roster, refetchRoster };
}

const ROSTER_REFETCH_DEBOUNCE_MS = 10000;
// W262: coalesce focus-triggered last-known fetches so a rapid active-state flap costs one
// read. Short (a real re-focus after minutes of background still refetches); only kills flaps.
const LAST_KNOWN_REFETCH_DEBOUNCE_MS = 3000;
// Dark needs no inbound data to happen — re-derive every 15s (cheap: a state
// bump re-runs the in-memory join; no DB, no network).
const STATE_TICK_MS = 15000;
// W234: how often the captain upserts its route to rail3_breadcrumb (throttled — not per
// fix, to keep writes cheap; receivers fetch on open/resume and extend live in between).
const BREADCRUMB_UPSERT_INTERVAL_MS = 60000;
// W266: how often EVERY device overwrites its last-known position while actively riding. The
// SDK stop transition also writes it, but on real rides stopTimeout rarely fires, so without
// this periodic write the fallback is stale at ride-start. One OVERWRITTEN row per rider (the
// last place we knew you were) — not a coordinate trail, so within the Pillar II §2 last-known
// exception; live pings still win on receivers, this only matters once transmission stops.
const LAST_KNOWN_WRITE_INTERVAL_MS = 60000;

// Persist MY last-known position to ride_participants — the fleet's FALLBACK when live pings
// stop (a rider goes quiet on stop / screen-lock / dead-zone). Shared by the periodic throttle
// (onLocation) and the SDK stop transition (onMotionChange). SCOPE TO MY ROW EXPLICITLY:
// participant_update_policy also lets a captain update anyone, so an unscoped update from a
// captain would clobber the whole fleet's last position. RLS already permits
// account_id = auth.uid() — pure client write, no migration (W261/W266).
//
// D77: this reads the LIVE session for `uid` and always did — that was half the split. The
// broadcast beside it carried a MOUNT-TIME snapshot, so after an account swap the same GPS fix
// went out as rider A while landing in rider B's row. Both sides now resolve to the live
// session (myRiderId flows from useAuth), so they agree by construction rather than by luck.
async function persistLastKnown(
  rideId: string,
  lat: number,
  lng: number,
  ts: number,
  trigger: 'stop' | 'throttle',
): Promise<void> {
  const { data } = await supabase.auth.getSession();
  const uid = data.session?.user?.id;
  if (!uid) return;
  const { error } = await supabase
    .from('ride_participants')
    .update({ last_lat: lat, last_long: lng, last_ping: new Date(ts).toISOString() })
    .eq('ride_id', rideId)
    .eq('account_id', uid);
  void logMeasurement({
    rideId,
    kind: 'last_position_write',
    payload: { ok: !error, trigger, ...(error ? { err: error.message } : {}) },
  });
}

// Live fleet state for a ride: subscribes to the tenant-authorized Broadcast
// channel (W170) and renders ONLY from received broadcasts joined against the
// RLS-gated roster — no DB row per ping (Pillar II §2 / W172 pitfall). Pings
// from a rider NOT in the caller's roster are dropped: if the server didn't
// let us identify them, we don't render them.
//
// Tactical state (W174): the SENDER publishes Active/Stopped/Inactive computed
// from its own movement (SenderStateTracker); DARK is derived RECEIVER-side
// from ping staleness — a Dark rider can't broadcast, so it can never be
// self-reported. A periodic tick re-derives so markers grey out with no new
// data arriving. Transitions are passive: state feeds icons only, no alerts.
export function useFleetPositions(
  rideId: string | null,
  myRiderId: string | null,
  roster: RideRoster,
  // D80 — the ride LEADER (rides.started_by, via useRideDetails): the account that STARTED the
  // ride. Gates the rail3_breadcrumb upsert below. This MUST be the same fact useBreadcrumb
  // reads: if the writer and the reader disagree about who the leader is, either nobody writes
  // the trail or two "captains" clobber the same ride_id row.
  leaderId: string | null,
  // Per-tenant thresholds (tenants.rail3_*_threshold_minutes via useRideDetails).
  thresholds: StateThresholds = DEFAULT_THRESHOLDS,
  // The ride channel is created ONCE by the screen (useRideChannel) and shared
  // with every consumer hook (positions here, beacons in useBeacons) — two
  // useRideChannel calls would open two subscriptions to the same topic.
  channel: RealtimeChannel | null,
  status: RideChannelStatus,
  onUnknownRider?: () => void,
  // True once the rider has seen the W176 explainer and granted BACKGROUND
  // location (owned by RideMapScreen, D63). Gates the AppState background handoff
  // below so we never request background permission or start the foreground
  // service inline (that staging-only shortcut is removed for promotion).
  backgroundReady = false,
): {
  fleet: FleetParticipant[];
  myCoords: LatLng | null;
  channelStatus: RideChannelStatus;
} {
  // Each ping is stored with its RECEIPT time: Dark staleness is measured on
  // the receiver's clock (skew-free), never against the sender's `ts`.
  const [pings, setPings] = useState<Record<string, PositionPayload & { receivedAtMs: number }>>({});
  const [myCoords, setMyCoords] = useState<LatLng | null>(null);
  // Live ref to the latest fix so the AppState handoff can attach a last-known
  // position to the "going dormant" ping without re-binding on every GPS update.
  const myCoordsRef = useRef<LatLng | null>(null);
  myCoordsRef.current = myCoords;
  // Live refs so the broadcast receive handler (subscribed once, on [channel])
  // can read the current ride/rider for W180 latency logging WITHOUT re-binding
  // the subscription (which would reset pings) when these props change.
  const rideIdRef = useRef(rideId);
  rideIdRef.current = rideId;
  const myRiderIdRef = useRef(myRiderId);
  myRiderIdRef.current = myRiderId;
  // D80: read the LEADER in the send handler (to decide whether to upsert the leader's route to
  // rail3_breadcrumb) WITHOUT making it an effect dep — a dep here would re-bind the FGS send
  // effect and churn the foreground service. This used to be a rosterRef holding the whole
  // roster, read as `rosterRef.current[myRiderId]?.role === 'captain'`; that club-level role
  // check is exactly what let a phantom captain (and, in principle, EVERY club captain on the
  // roster) pass the write gate and clobber the same ride_id row. One ride, one leader, one
  // writer.
  const leaderIdRef = useRef(leaderId);
  leaderIdRef.current = leaderId;

  // W244 perceived-start: seed myCoords from the OS last-known fix the instant the
  // map opens, so the camera frames the rider and the Centre/Fit controls enable
  // WITHOUT waiting for the first live TS fix (~2–5s cold acquisition). The
  // functional update never clobbers a real fix that already landed (cur ?? …), so
  // the live position always wins the moment it arrives. Requires foreground
  // permission; returns null otherwise — RideMapScreen then frames ride.start. This
  // is read-only (no tracking started), so it's safe before the explainer/D63 flow.
  useEffect(() => {
    let cancelled = false;
    void Location.getLastKnownPositionAsync()
      .then((pos) => {
        if (cancelled || !pos) return;
        setMyCoords((cur) => cur ?? { lat: pos.coords.latitude, lng: pos.coords.longitude });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  // Re-derive render states as time passes — a rider goes Stopped→…→Dark
  // precisely when NO data arrives, so something must still trigger renders.
  const [, setStateTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setStateTick((n) => n + 1), STATE_TICK_MS);
    return () => clearInterval(t);
  }, []);

  // W262: persisted last-known positions (the W261 write), keyed by account_id like pings
  // and the roster. A rider who STOPS goes quiet (un-forced SDK → no more live pings), so on
  // FOCUS the fleet loop below renders them at this last-known spot instead of dropping them.
  // §4.1-gated SERVER-SIDE by participant_tactical_select (same policy as the roster read) —
  // RLS returns only rows this viewer may see; same RP-16 affiliated-tenant breadth caveat as
  // useRideRoster applies. Fetched on open and on every return-to-foreground: a MEANINGFUL
  // event, never per-ping (Pillar II §2).
  const [lastKnown, setLastKnown] = useState<Record<string, { lat: number; lng: number; ts: number }>>({});
  // Bridges the ride-scoped fetch closure to the stable resume subscriber below.
  const resumeFetchRef = useRef<((source: ResumeSource) => void) | null>(null);
  useEffect(() => {
    if (!rideId) return;
    let cancelled = false;
    // Debounce the focus fetch: an Android/iOS active-state flap (or a quick app switch)
    // must not storm the DB. Mirrors ROSTER_REFETCH_DEBOUNCE_MS / the background-only gate on
    // the dormant handler. Per-effect-run state (resets on rideId change → a new ride fetches
    // fresh); the first call always runs since lastFetchMs starts at 0.
    let lastFetchMs = 0;
    // `resumeSource` marks the call as a recovery attempt and carries WHICH emitter detected it.
    // The signal is logged INSIDE the debounce gate, after it passes: a resume_signal must mean the
    // refetch actually ran, otherwise a debounced no-op looks identical to a real recovery. It must
    // also carry the true source — a hardcoded 'appstate' here would make a clock-gap rescue look
    // like AppState fired, which is precisely the question W268/W269 exist to answer.
    const fetchLastKnown = async (resumeSource?: ResumeSource) => {
      const now = Date.now();
      if (now - lastFetchMs < LAST_KNOWN_REFETCH_DEBOUNCE_MS) return;
      lastFetchMs = now;
      if (resumeSource) logResumeSignal(rideId, resumeSource, 'fleet');
      const { data, error } = await supabase
        .from('ride_participants')
        .select('account_id, last_lat, last_long, last_ping')
        .eq('ride_id', rideId);
      // W271: distinguish "the query ran and found nothing" from "the query never ran". `usable`
      // is the count that survives the null-coordinate filter below — the number that can actually
      // render a marker. No coordinates logged (Pillar II §2), only counts.
      const usable = (data ?? []).filter(
        (r) => r.account_id != null && r.last_lat != null && r.last_long != null && r.last_ping,
      ).length;
      logFetchResult(rideId, 'lastKnown', {
        rows: data?.length ?? 0,
        usable,
        cancelled,
        ...(resumeSource ? { source: resumeSource } : {}),
        ...(error ? { err: error.message } : {}),
      });
      if (cancelled || error || !data) return;
      const next: Record<string, { lat: number; lng: number; ts: number }> = {};
      for (const row of data) {
        if (row.account_id == null || row.last_lat == null || row.last_long == null || !row.last_ping) continue;
        next[row.account_id] = { lat: row.last_lat, lng: row.last_long, ts: Date.parse(row.last_ping) };
      }
      setLastKnown(next);
    };
    void fetchLastKnown();
    resumeFetchRef.current = (source: ResumeSource) => {
      void fetchLastKnown(source);
    };
    return () => {
      cancelled = true;
      resumeFetchRef.current = null;
    };
  }, [rideId]);

  // W269: last-known refetch now rides the shared resume signal (clock-gap + AppState + staleness),
  // so it can no longer be skipped by an 'active' event that never arrives. The ref keeps the
  // subscriber stable across ride changes. Logging lives in fetchLastKnown, behind the debounce —
  // logging here instead would emit a resume_signal for a refetch that never ran.
  const onResume = useCallback((source: ResumeSource) => {
    resumeFetchRef.current?.(source);
    // D89 + D90 (prong 2) — UNIFIED engine re-assert. On every resume, nudge the tracking engine
    // back to moving. This ONE idempotent action subsumes three previously-separate concerns:
    //   • D90 warm-up strand — a ride can start dark if the phone is locked before the engine
    //     leaves stationary (ride f51f7add: 21 min, zero fixes; the mid-ride unlock did NOT revive
    //     it because resume restored the channel but never re-asserted the engine). Now it does.
    //   • D89 / D86 Saver-off — Battery Saver toggled off while backgrounded is caught here on the
    //     next unlock, replacing D86's watchBatterySaverCleared (a foreground-only listener that
    //     missed the backgrounded toggle — field-confirmed to never fire).
    //   • OEM background-suspend — a foreground return re-engages a suspended engine.
    // No need to detect WHY: changePace(true) is a no-op on a healthy/moving engine and a no-op if
    // the engine was never configured, so an unconditional resume-nudge is safe. stopTimeout still
    // returns a genuinely-parked engine to stationary, so battery is preserved.
    void nudgeBgGeo();
    const rid = rideIdRef.current;
    if (rid) void logMeasurement({ rideId: rid, kind: 'bg_nudge', payload: { reason: 'resume', source } });
  }, []);
  useResume(rideId, onResume);

  // The staleness sweep only fires when there is someone else to hear from — riding alone, a quiet
  // channel is correct, and rebuilding it would be pure cost. Excludes self.
  useEffect(() => {
    const peers = Object.keys(roster).filter((id) => id !== myRiderId).length;
    notePeerCount(peers);
  }, [roster, myRiderId]);

  // D85 — feed channel health to the staleness sweep so it never rebuilds a SUBSCRIBED-but-quiet
  // channel (the post-ride 5-min metronome). A dead channel reads as CHANNEL_ERROR/CLOSED and is
  // still swept.
  useEffect(() => {
    noteChannelStatus(status);
  }, [status]);

  // Receive: fold every position broadcast into the ping map, keyed by rider.
  useEffect(() => {
    if (!channel) return;
    setPings({});

    channel.on('broadcast', { event: POSITION_EVENT }, ({ payload }) => {
      // W269: liveness evidence for the staleness sweep. Recorded BEFORE validation — a malformed
      // payload still proves the socket is carrying traffic, which is all the sweep asks.
      noteChannelActivity();
      const p = payload as PositionPayload;
      if (!p?.riderId || typeof p.lat !== 'number' || typeof p.lng !== 'number') return;
      const receivedAtMs = Date.now();
      setPings((prev) => ({ ...prev, [p.riderId]: { ...p, receivedAtMs } }));

      // W180 PoC validation — broadcast fan-out latency. The payload's `ts` is the
      // sender's send time (device clock); receivedAtMs is ours. The delta is the
      // cross-device fan-out latency — it carries sender↔receiver CLOCK SKEW (the
      // documented caveat: indicative, not skew-free). Each device's server offset
      // (client_ts vs created_at) is derivable from its own sink rows for post-hoc
      // correction. Fire-and-forget; writes only to the staging-only measurement sink.
      const rid = rideIdRef.current;
      if (rid && typeof p.ts === 'number') {
        void logMeasurement({
          rideId: rid,
          kind: 'broadcast_latency',
          value: receivedAtMs - p.ts,
          payload: {
            sender_id: p.riderId,
            receiver_id: myRiderIdRef.current,
            self: p.riderId === myRiderIdRef.current,
          },
        });
      }
    });
    // D87: a rider signalled a DELIBERATE departure (sign-out / leave-ride) — drop their marker
    // now, from BOTH the live ping map and the persisted last-known fallback, so they don't
    // linger as a greying phantom. A later live ping (e.g. the same account still active on a
    // second device — the collision case) simply re-adds them, so this only removes a truly
    // gone rider. Passive signal-loss is unaffected: no `depart` event fires, so those still grey.
    channel.on('broadcast', { event: DEPARTED_EVENT }, ({ payload }) => {
      const riderId = (payload as { riderId?: string })?.riderId;
      if (!riderId) return;
      setPings((prev) => {
        if (!(riderId in prev)) return prev;
        const next = { ...prev };
        delete next[riderId];
        return next;
      });
      setLastKnown((prev) => {
        if (!(riderId in prev)) return prev;
        const next = { ...prev };
        delete next[riderId];
        return next;
      });
      const rid = rideIdRef.current;
      if (rid) {
        void logMeasurement({
          rideId: rid,
          kind: 'app_state_change',
          payload: { event: 'departed_recv', riderId, self: riderId === myRiderIdRef.current },
        });
      }
    });
    // Broadcast/Presence handlers may bind after subscribe() (useRideChannel
    // already subscribed); postgres_changes may not — none are used here.
  }, [channel]);

  // Publish: Transistorsoft Background Geolocation is the SOLE location source for the ride —
  // foreground AND background, broadcasting 'tsbg'. The expo-location foreground watch and FGS
  // TaskManager task were removed once TS was validated (W203): TS streams continuously through
  // Doze where expo-location batched (the saffron/30ab + 2026-06-15 walks). We keep OUR transport
  // (REST broadcast + the measurement sink), so receivers/instrumentation are unchanged; TS just
  // owns the location SOURCE.
  //
  // Gated on `backgroundReady`: the FGS must be STARTED while foregrounded (Android 12+ forbids
  // starting it from the background), which the W176 explainer / D63 permission flow guarantees;
  // a returning rider (permission already granted) starts TS immediately on join. A rider who
  // declines "Allow all the time" never flips backgroundReady → TS doesn't start here, and the
  // dormant-ping effect below covers their backgrounding.
  //
  // CRITICAL (field-test fix, 2026-06-15): do NOT gate this on the realtime channel `status`. On
  // screen-lock the websocket drops (status leaves 'SUBSCRIBED' → "channel denied"); if this
  // depended on status it would re-run and stopBgGeo() — tearing down the FGS exactly when we need
  // it. Broadcasts go over REST (restBroadcast), which never needs the channel, so the FGS runs the
  // whole ride regardless of channel state; it stops only on leave / lost permission / unmount.
  useEffect(() => {
    if (!backgroundReady || !rideId || !myRiderId) return;
    // D87: remember the ride we're tracking so AuthContext.signOut can broadcast a departure
    // for it even after this screen unmounts (sign-out happens from Home). Not cleared on
    // cleanup — it must survive Home → Sign Out; overwritten when the next ride starts.
    setActiveRide({ rideId, riderId: myRiderId });
    // Sender half of the W174 state machine — fresh per (ride, thresholds).
    const tracker = new SenderStateTracker(thresholds);
    let last: LatLng | null = null;
    // W234 — captain breadcrumb ROUTE TABLE: the captain accumulates its OWN decimated
    // route (full, capped) and UPSERTS it to rail3_breadcrumb on a ~60s throttle, so any
    // device can FETCH the complete route on open — lock-independent for ANY duration. The
    // broadcast is back to a single point; the table carries history, not the broadcast.
    let myPath: LatLng[] = [];
    let lastUpsertMs = 0;
    // W266: separate throttle for the every-device last-known write (distinct from the
    // captain-only breadcrumb upsert above).
    let lastLastKnownMs = 0;
    void startBgGeo((fix) => {
      const coords = { lat: fix.lat, lng: fix.lng };
      setMyCoords(coords);
      const dist = last ? haversineDistanceM(last, coords) : Infinity;
      last = coords;
      const state = tracker.sample({ distanceFromLastM: dist, atMs: fix.ts });

      // Single-point broadcast — live position for the fleet marker and the live breadcrumb
      // tip. No trail in the payload; the route lives in the table.
      void restBroadcast(rideId, { riderId: myRiderId, state, lat: coords.lat, lng: coords.lng, ts: fix.ts });
      void logMeasurement({ rideId, kind: 'gps_ping', payload: { src: 'tsbg', state } });

      // W266: refresh MY last-known on a throttle so the fleet has a FRESH fallback the instant
      // I stop transmitting — every device, independent of the SDK's rarely-firing stopTimeout.
      // Overwrites one row; live pings still win on receivers while I'm broadcasting.
      const lknNow = Date.now();
      if (lknNow - lastLastKnownMs >= LAST_KNOWN_WRITE_INTERVAL_MS) {
        lastLastKnownMs = lknNow;
        void persistLastKnown(rideId, coords.lat, coords.lng, fix.ts, 'throttle');
      }

      // Accumulate the decimated route on EVERY device (cheap, bounded) so the leader's route is
      // captured from the very first fix — even before useRideDetails resolves the ride row.
      // Only the LEADER upserts it to rail3_breadcrumb (throttled). REST/Supabase writes escape
      // the screen-lock freeze, so the route records even while pocketed; we set updated_at on
      // every upsert so the 4h purge tracks LAST activity, not first insert.
      //
      // D80: gate on identity ("am I the account that started this ride?"), not on club role.
      // Fails CLOSED — while leaderId is still null (ride row in flight) nobody writes, which is
      // correct: a write from a non-leader is worse than a slightly late first write, and the
      // path is accumulated regardless so nothing is lost by waiting.
      myPath = appendTrailPoint(myPath, coords);
      if (leaderIdRef.current && myRiderId === leaderIdRef.current) {
        const now = Date.now();
        if (now - lastUpsertMs >= BREADCRUMB_UPSERT_INTERVAL_MS) {
          lastUpsertMs = now;
          // D69 ROOT CAUSE: this was `void supabase.from(...).upsert(...)`. supabase-js v2
          // query builders are LAZY thenables — the HTTP request only fires on await/.then().
          // A bare `void <builder>` builds the query but NEVER executes it, so rail3_breadcrumb
          // was never written for ANY ride (0 client writes in pg_stat_statements; no error,
          // because the request was never sent). Every other DB call here is awaited; this lone
          // bare-void was the bug. Fix: chain .then() so the request actually fires, and log the
          // result (no longer fire-and-forget) so a silent failure can never hide again and the
          // validation walk can confirm the write landed.
          void supabase
            .from('rail3_breadcrumb')
            .upsert(
              { ride_id: rideId, path: myPath, updated_at: new Date().toISOString() },
              { onConflict: 'ride_id' },
            )
            .then(({ error }) => {
              void logMeasurement({
                rideId,
                kind: 'breadcrumb_upsert',
                payload: { ok: !error, pts: myPath.length, ...(error ? { err: error.message } : {}) },
              });
            });
        }
      }
    }, (isMoving, motionFix) => {
      // W261: the SDK's moving↔stationary transition (un-forced in bgGeo.ts). On STOP,
      // persist last-known position (Pillar II §2 — last-known at a MEANINGFUL EVENT, not a
      // per-ping trail) and send ONE 'stopped' ping so the fleet sees the stop immediately
      // instead of waiting to decay into Dark on staleness. On resume, onLocation takes over.
      void logMeasurement({ rideId, kind: 'motion_change', payload: { isMoving } });
      if (isMoving) return;
      const coords = motionFix ? { lat: motionFix.lat, lng: motionFix.lng } : myCoordsRef.current;
      if (!coords) return;
      const ts = motionFix?.ts ?? Date.now();
      void restBroadcast(rideId, { riderId: myRiderId, state: 'stopped', lat: coords.lat, lng: coords.lng, ts });
      // Persist last-known via the shared helper (scopes to my row; see persistLastKnown). Reset
      // the throttle so onLocation's periodic write doesn't immediately re-fire after this one.
      lastLastKnownMs = Date.now();
      void persistLastKnown(rideId, coords.lat, coords.lng, ts, 'stop');
    }, (hb) => {
      // D88 MIDDLE GROUND — engine self-check outcome. Instrument every heartbeat so we can
      // confirm ON-DEVICE that (a) the heartbeat fires at all while backgrounded/stationary
      // (the open question on aggressive OEMs) and (b) whether it re-engaged tracking. A
      // `reengaged: true` row is the fix working: the SDK's motion detector missed the start
      // of movement and our self-check caught it. Zero heartbeat_check rows during a
      // backgrounded stop = the OS killed the FGS → captain-side detection territory.
      void logMeasurement({ rideId, kind: 'app_state_change', payload: { event: 'heartbeat_check', ...hb } });
    });
    // D89: D86's watchBatterySaverCleared (a foreground-only Saver ON->OFF listener) is REMOVED —
    // it missed the backgrounded toggle (field-confirmed to never fire) and is superseded by the
    // unified resume-nudge in onResume above, which re-asserts the engine on every unlock
    // regardless of cause (Saver, OEM-suspend, warm-up strand).
    return () => {
      void stopBgGeo();
    };
  }, [backgroundReady, rideId, myRiderId, thresholds]);

  // Sleeping signal for the NO-background-tracking path. A rider who declined "Allow all
  // the time" has no FGS, so on AppState settling into 'background' fire ONE reliable (REST,
  // not the freeze-racing websocket) "dormant" ping with the last fix — the fleet sees them
  // go to SLEEP on purpose (calm violet), not decay into the alarming Dark. backgroundReady
  // riders are already covered by the whole-ride FGS above, so they skip this. An OEM kill
  // never reaches this handler, so a true unexpected death still derives Dark (the wanted
  // distinction); a later Active ping on reopen wakes them. '=== background' (not '!= active')
  // so an iOS 'inactive' flap can't churn it.
  useEffect(() => {
    if (!channel || status !== 'SUBSCRIBED' || !myRiderId || !rideId) return;
    const appStateSub = AppState.addEventListener('change', (next: AppStateStatus) => {
      if (next !== 'background') return;
      const c = myCoordsRef.current;
      // PoC/staging instrumentation: record which branch we take and its inputs the instant
      // we background, so the sink tells us — without eyeballing a notification — exactly
      // what happened on each screen-lock.
      void logMeasurement({
        rideId,
        kind: 'app_state_change',
        payload: { event: 'handoff', branch: backgroundReady ? 'fgs' : 'dormant', backgroundReady, hadCoords: !!c },
      });
      if (!backgroundReady && c) {
        void sendDormantPing({ rideId, riderId: myRiderId, lat: c.lat, lng: c.lng });
      }
    });
    return () => {
      appStateSub.remove();
    };
  }, [backgroundReady, channel, status, rideId, myRiderId]);

  // Staging diagnostic: log who is RECEIVED (pings) vs restored from LAST-KNOWN vs known to the
  // ROSTER vs surviving into the FLEET — so we can tell REMOTELY whether a rider is dropped at the
  // roster join (a roster miss) or makes it into the fleet (then any no-show is a pure render
  // issue). Fires only on set changes, so it's not per-ping spam.
  //
  // W270: this used to compute `fleet` as pings∩roster and key only on [pingKeys, rosterKeys] —
  // blind to last-known. A rider rendered purely from ride_participants.last_* never appeared, and
  // a lastKnown change emitted nothing at all. That blindness produced two wrong conclusions: on
  // the 2026-07-09 morning ride `fleet=[]` was read as "the last-known render never fired", and the
  // 2026-07-10 bench disproved it — rogers logged `fleet=[] pings=[]` at unlock while Neil watched
  // the captain's marker render from a 4-minute-old last-known row. `fleet=[]` was exactly what a
  // WORKING last-known render looked like here. The log now mirrors what actually reaches the map.
  const pingKeys = Object.keys(pings).sort().join(',');
  const rosterKeys = Object.keys(roster).sort().join(',');
  const lastKnownKeys = Object.keys(lastKnown).sort().join(',');
  useEffect(() => {
    if (!rideId) return;
    const pIds = pingKeys ? pingKeys.split(',') : [];
    const rIds = rosterKeys ? rosterKeys.split(',') : [];
    const lkIds = lastKnownKeys ? lastKnownKeys.split(',') : [];
    // Mirror the render's join below: (pings ∪ lastKnown) ∩ roster, live winning when fresher.
    const fIds = [...new Set([...pIds, ...lkIds])].filter((id) => roster[id]).sort();
    // Same precedence as the render join below. READER BEWARE: `source` is accurate at emit time,
    // but this effect fires on SET changes only — a flip driven purely by a `ts` change (a stop
    // rewrites an existing lastKnown row fresher than a still-present stale ping) re-renders
    // without re-emitting, so a rider's last-logged source can lag the map. Trust `source` at the
    // moment of its row, not as a running state.
    const source: Record<string, 'live' | 'lastKnown'> = {};
    for (const id of fIds) {
      const live = pings[id];
      const lk = lastKnown[id];
      source[id] = live && (!lk || live.ts >= lk.ts) ? 'live' : 'lastKnown';
    }
    void logMeasurement({
      rideId,
      kind: 'app_state_change',
      // ids and source only — never coordinates (Pillar II §2).
      payload: { event: 'fleet_compose', pings: pIds, roster: rIds, lastKnown: lkIds, fleet: fIds, source },
    });
    // pings/roster/lastKnown intentionally omitted from deps — keyed via the sorted key strings, so
    // this fires on SET changes only, not on every ping that moves a rider a few metres.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pingKeys, rosterKeys, lastKnownKeys, rideId]);

  // Join LIVE pings + persisted last-known (W262) to the server-gated roster. Unknown
  // riderIds are dropped — for a Rider, "unknown" is exactly the set RLS hid (other riders),
  // so the §4.1 visibility boundary holds even before the client-side role filter runs.
  //
  // PRECEDENCE (the bug that bites if missed): a rider's stored last-known is a FALLBACK; the
  // instant they broadcast a FRESHER live ping it must win, so nobody renders frozen at a rest
  // stop after they roll again. We pick the more RECENT of the two per rider — both timestamps
  // are the SAME sender's own clock (p.ts and last_ping were both stamped Date.now() on that
  // device), so they're directly comparable. A moving rider (fresh pings, no/older last-known)
  // renders from live exactly as before; a stopped rider (gone quiet) renders from last-known.
  const nowMs = Date.now();
  const fleet: FleetParticipant[] = [];
  const riderIds = new Set([...Object.keys(pings), ...Object.keys(lastKnown)]);
  for (const riderId of riderIds) {
    const entry = roster[riderId];
    if (!entry) {
      // Only a LIVE ping from an unidentified rider signals a mid-ride joiner (refetch the
      // roster, debounced). A stored last-known with no roster row is just a rider RLS hid
      // from us — stay quiet; the §4.1 boundary holds.
      if (pings[riderId]) onUnknownRider?.();
      continue;
    }
    const live = pings[riderId];
    const lk = lastKnown[riderId];
    if (live && (!lk || live.ts >= lk.ts)) {
      fleet.push({
        riderId,
        displayName: entry.displayName,
        role: entry.role,
        phone: entry.phone,
        accountStatus: entry.participantStatus,
        // W174 receiver half: staleness past the dark threshold overrides the last
        // self-reported state; the marker stays greyed AT the last known position.
        state: deriveRenderState(live.state ?? 'active', live.receivedAtMs, nowMs, thresholds),
        position: { lat: live.lat, lng: live.lng },
        lastPingAt: live.ts,
      });
    } else if (lk) {
      fleet.push({
        riderId,
        displayName: entry.displayName,
        role: entry.role,
        phone: entry.phone,
        accountStatus: entry.participantStatus,
        // Last-known is written on the STOP transition (W261), carrying no self-reported
        // state, so render it as 'stopped' and let receiver staleness derive Dark as it ages.
        // ts is the sender's clock; nowMs is ours — the skew is negligible at the 2/5/15-min
        // thresholds this feeds.
        state: deriveRenderState('stopped', lk.ts, nowMs, thresholds),
        position: { lat: lk.lat, lng: lk.lng },
        lastPingAt: lk.ts,
      });
    }
  }

  return { fleet, myCoords, channelStatus: status };
}
