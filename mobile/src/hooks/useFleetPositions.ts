import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import * as Location from 'expo-location';

import type { RealtimeChannel } from '@supabase/supabase-js';

import { supabase } from '../lib/supabase';
import { logMeasurement } from '../lib/measure';
import { sendSleepingPing, restBroadcast } from '../lib/backgroundLocation';
import { startBgGeo, stopBgGeo, nudgeBgGeo, isEngineSessionActive } from '../lib/bgGeo';
// W285: the self-health clocks read these engine signals from a module-level store, so the engine
// effect below feeds it from its callbacks WITHOUT any dep change (D91).
import {
  noteFix,
  noteMotion,
  noteHeartbeat,
  noteEngineStarted,
  noteEngineDied,
  resetSelfHealthSignals,
} from '../lib/selfHealthSignals';
import { setActiveRide } from '../lib/activeRide';
import { persistLastKnown, LAST_KNOWN_WRITE_INTERVAL_MS } from '../lib/lastKnown';
import { recordCounter, fullCaptureEvent, loadOperatorConfig } from '../lib/telemetry';
import type { RideChannelStatus } from './useRideChannel';
import { haversineDistanceM, LatLng } from '../lib/geo';
import { BREADCRUMB_MIN_GAP_M } from '../lib/breadcrumbTrail';
import {
  appendTipPoint,
  appendBreak,
  mergePriorAndSession,
  capSegments,
  pointCount,
  splitSegments,
  normalisePath,
  isGapBreak,
} from '../lib/breadcrumbSegments';
import type { TrailPath } from '../lib/breadcrumbSegments';
import type { FleetParticipant, RideRole, TacticalState } from '../lib/roleVisibility';
import { composeFleet, lastKnownFromRows, mergeDepartedMarks } from '../lib/fleetCompose';
import type { DepartedMark } from '../lib/fleetCompose';
import { logFetchResult, logResumeSignal } from '../lib/lifecycle';
import { useResume, noteChannelActivity, notePeerCount, noteChannelStatus } from './useResume';
import type { ResumeSource } from '../lib/resumeDetector';
import {
  SenderStateTracker,
  deriveRenderState,
  StateThresholds,
  DEFAULT_THRESHOLDS,
  normaliseReportedState,
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
  // W293: the WIRE may still carry the legacy Sleeping value from a previous-build sender for one
  // release; normaliseReportedState maps it at the one inbound entry (the POSITION handler).
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
// W290 (review r1): the leader's breadcrumb writes are serialised PER RIDE at module level (the
// awaitPendingDeparture precedent) so (a) the effect cleanup can FLUSH the throttled tail on Leave
// Ride without losing up to one throttle window, and (b) a remount's seed read waits for any write
// still in flight from the previous engine session — the seed never reads a stale path, so the next
// write can never be shorter than what the table holds. Module-level because the new effect instance
// cannot see the old instance's locals.
const inFlightBreadcrumbWrites = new Map<string, Promise<void>>();
// W282/W283: persistLastKnown and the A4 cadence constant LAST_KNOWN_WRITE_INTERVAL_MS live in
// ../lib/lastKnown — the ONE place the cadence is declared (Ledger A4, §14 item 21; Decision
// Brief docs/rail3/decision_briefs/a4_last_known_cadence_decision_brief.md).

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
  // position to the "going to sleep" ping without re-binding on every GPS update.
  const myCoordsRef = useRef<LatLng | null>(null);
  myCoordsRef.current = myCoords;
  // Live refs so the broadcast receive handler (subscribed once, on [channel])
  // can read the current ride/rider for W180 latency logging WITHOUT re-binding
  // the subscription (which would reset pings) when these props change.
  const rideIdRef = useRef(rideId);
  rideIdRef.current = rideId;
  const myRiderIdRef = useRef(myRiderId);
  myRiderIdRef.current = myRiderId;
  // D91: thresholds feed the STATE MACHINE, never the engine lifecycle. Held in refs so a tenant-
  // thresholds update (which lands ~1s after ride start via useRideDetails, as a fresh object)
  // can NEVER re-run the engine effect and tear down the FGS. That teardown — the effect cleanup's
  // stopBgGeo() racing its own unawaited restart on the native bridge, Battery Saver biasing the
  // loser to `enabled:false` — killed captain tracking for a whole ride (2026-07-19 walk, proven
  // in the native TSLocationManager log: started 17:46:08.840, disabled 17:46:09.100, never back).
  const thresholdsRef = useRef(thresholds);
  thresholdsRef.current = thresholds;
  const trackerRef = useRef<SenderStateTracker | null>(null);
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
  // W292 (C3 item 7, R3-65/68): the DURABLE departed marks — read from ride_participants.departed_at
  // on the same fetch, and learned live from the 'depart' broadcast. A marked rider is never seeded
  // from last-known and renders only from a live ping newer than the mark (fleetCompose.ts). Keyed by
  // account_id like everything else; carries two timestamps and nothing positional.
  const [departed, setDeparted] = useState<Record<string, DepartedMark>>({});
  // Bridges the ride-scoped fetch closure to the stable resume subscriber below.
  const resumeFetchRef = useRef<((source: ResumeSource) => void) | null>(null);
  useEffect(() => {
    if (!rideId) return;
    let cancelled = false;
    // Debounce the focus fetch: an Android/iOS active-state flap (or a quick app switch)
    // must not storm the DB. Mirrors ROSTER_REFETCH_DEBOUNCE_MS / the background-only gate on
    // the sleeping-ping handler. Per-effect-run state (resets on rideId change → a new ride fetches
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
      // W292: a mark learned by broadcast AFTER this instant outranks what the fetch reads (the fetch
      // may have read the row before the departure landed — the pre-existing D87 race).
      const fetchStartedAtMs = Date.now();
      const { data, error } = await supabase
        .from('ride_participants')
        .select('account_id, last_lat, last_long, last_ping, departed_at')
        .eq('ride_id', rideId);
      // W271: distinguish "the query ran and found nothing" from "the query never ran". `usable`
      // is the count that survives the null-coordinate filter — the number that can actually render
      // a marker (W292: a departed row never can, whatever it carries). No coordinates logged
      // (Pillar II §2), only counts.
      const split = lastKnownFromRows(data ?? [], Date.now());
      logFetchResult(rideId, 'lastKnown', {
        rows: data?.length ?? 0,
        usable: split.usable,
        departed: split.departedCount,
        cancelled,
        ...(resumeSource ? { source: resumeSource } : {}),
        ...(error ? { err: error.message } : {}),
      });
      if (cancelled || error || !data) return;
      setLastKnown(split.lastKnown);
      setDeparted((local) => mergeDepartedMarks(split.departed, local, fetchStartedAtMs));
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
    // W287: a torn-down engine (ride-end teardown, slate 13) must not be poked back by a resume —
    // nudge only while bgGeo owns a live engine session.
    const active = isEngineSessionActive();
    if (active) void nudgeBgGeo();
    const rid = rideIdRef.current;
    if (rid) void logMeasurement({ rideId: rid, kind: 'bg_nudge', payload: { reason: 'resume', source, skipped: !active } });
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
      const raw = payload as Omit<PositionPayload, 'state'> & { state?: unknown };
      if (!raw?.riderId || typeof raw.lat !== 'number' || typeof raw.lng !== 'number') return;
      // W293: the ONE place a wire state string enters the app — legacy 'dormant' → 'sleeping'.
      const p: PositionPayload = { ...raw, state: normaliseReportedState(raw.state) };
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
      // W292: record the mark LOCALLY too (sender clock from the payload — the departing device's
      // Date.now(), the same clock its pings carry), so a stored last-known cannot re-seed this rider
      // on the next fetch and only a ping NEWER than the departure (a rejoin) re-adds them.
      const payloadTs = (payload as { ts?: unknown })?.ts;
      const atMs = typeof payloadTs === 'number' && Number.isFinite(payloadTs) ? payloadTs : Date.now();
      setDeparted((prev) => ({ ...prev, [riderId]: { atMs, seenAtMs: Date.now() } }));
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
          payload: { event: 'departed_recv', riderId, self: riderId === myRiderIdRef.current, hadTs: typeof payloadTs === 'number' },
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
  // sleeping-ping effect below covers their backgrounding.
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
    // Sender half of the W174 state machine — fresh per ride. Thresholds come from trackerRef
    // (rebuilt by the effect below when tenant thresholds land) so they never gate this engine.
    trackerRef.current = new SenderStateTracker(thresholdsRef.current);
    let last: LatLng | null = null;
    // W234 — captain breadcrumb ROUTE TABLE: the captain accumulates its OWN decimated
    // route (full, capped) and UPSERTS it to rail3_breadcrumb on a ~60s throttle, so any
    // device can FETCH the complete route on open — lock-independent for ANY duration. The
    // broadcast is back to a single point; the table carries history, not the broadcast.
    // W290 (slate 10 / C1): ONE breadcrumb per ride. `session` is THIS engine session's capture
    // only; `prior` is what the table already held when this session seeded (null = not yet
    // seeded → writes are HELD, never a shorter path than the table). The upsert payload is
    // prior ++ [break] ++ session (mergePriorAndSession), so a rejoin never truncates the earlier
    // route — the gap renders as a visible break. A within-session fix gap ≥ the tenant Dark
    // threshold is also a break (the same constant that turns the marker Dark and the reader's
    // trace stale). The seed fetch starts lazily on the first fix where the leader gate passes
    // (leaderIdRef is a ref, not a dep — D80/D91); fail CLOSED on error and retry in 10 s.
    let session: TrailPath = [];
    let lastFixTs: number | null = null;
    let prior: TrailPath | null = null;
    let seeding = false;
    let nextSeedAttemptMs = 0;
    let cancelled = false;
    let dirty = false; // session points not yet written
    const SEED_RETRY_MS = 10_000;
    const seedPrior = () => {
      if (seeding || Date.now() < nextSeedAttemptMs) return;
      seeding = true;
      // Wait for any write still in flight from the previous engine session (remount), then read.
      // D69: .then() so the request actually fires.
      void Promise.resolve(inFlightBreadcrumbWrites.get(rideId))
        .then(() => supabase.from('rail3_breadcrumb').select('path').eq('ride_id', rideId).maybeSingle())
        .then(({ data, error }) => {
          seeding = false;
          if (cancelled) return; // a late result after the effect re-ran → discard
          if (error) {
            nextSeedAttemptMs = Date.now() + SEED_RETRY_MS;
            logFetchResult(rideId, 'breadcrumb_seed', { found: false, err: error.message });
            return; // FAIL CLOSED: prior stays null, nothing is written
          }
          prior = normalisePath(data?.path);
          logFetchResult(rideId, 'breadcrumb_seed', {
            found: !!data,
            priorPts: pointCount(prior),
            priorSegs: splitSegments(prior).length,
          });
        });
    };
    let lastUpsertMs = 0;
    // The ONE writer: prior ++ [break] ++ session, capped per segment, queued behind the previous
    // write for this ride. `reason` is evidence only ('throttle' = the 60 s cadence, 'flush' =
    // the effect cleanup persisting the tail on Leave Ride / remount).
    const upsertPath = (reason: 'throttle' | 'flush') => {
      if (prior === null) return;
      const path = capSegments(mergePriorAndSession(prior, session));
      const priorPts = pointCount(prior);
      dirty = false;
      // D69 ROOT CAUSE: this was `void supabase.from(...).upsert(...)`. supabase-js v2
      // query builders are LAZY thenables — the HTTP request only fires on await/.then().
      // A bare `void <builder>` builds the query but NEVER executes it, so rail3_breadcrumb
      // was never written for ANY ride (0 client writes in pg_stat_statements; no error,
      // because the request was never sent). Every other DB call here is awaited; this lone
      // bare-void was the bug. Fix: chain .then() so the request actually fires, and log the
      // result (no longer fire-and-forget) so a silent failure can never hide again and the
      // validation walk can confirm the write landed.
      const run: Promise<void> = Promise.resolve(inFlightBreadcrumbWrites.get(rideId))
        .then(() =>
          supabase
            .from('rail3_breadcrumb')
            .upsert({ ride_id: rideId, path, updated_at: new Date().toISOString() }, { onConflict: 'ride_id' }),
        )
        .then(({ error }) => {
          void logMeasurement({
            rideId,
            kind: 'breadcrumb_upsert',
            // counts only — never coordinates (Pillar II §2)
            payload: {
              ok: !error,
              reason,
              pts: pointCount(path),
              segs: splitSegments(path).length,
              priorPts,
              ...(error ? { err: error.message } : {}),
            },
          });
        })
        .catch(() => undefined); // never rejects: the chain must stay usable for the next write
      inFlightBreadcrumbWrites.set(rideId, run);
      void run.finally(() => {
        if (inFlightBreadcrumbWrites.get(rideId) === run) inFlightBreadcrumbWrites.delete(rideId);
      });
    };
    // W266: separate throttle for the every-device last-known write (distinct from the
    // captain-only breadcrumb upsert above).
    let lastLastKnownMs = 0;
    // W284: operator config (full-capture flag + slate 4 clocks) loaded once per ride open and
    // cached; offline keeps the previous cache. Counters never depend on it.
    void loadOperatorConfig();
    void startBgGeo((fix) => {
      noteFix(fix.ts, fix.isMoving); // W285 (covers the heartbeat re-engage synthetic fix too)
      const coords = { lat: fix.lat, lng: fix.lng };
      setMyCoords(coords);
      const dist = last ? haversineDistanceM(last, coords) : Infinity;
      last = coords;
      const state = trackerRef.current!.sample({ distanceFromLastM: dist, atMs: fix.ts });

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
      // W290: an in-session capture gap ≥ the Dark threshold is a break (fix.ts vs fix.ts — the
      // sender's own clock); consecutive breaks collapse inside appendBreak.
      if (isGapBreak(lastFixTs, fix.ts, thresholdsRef.current.darkMinutes * 60_000)) session = appendBreak(session);
      lastFixTs = fix.ts;
      const grown = appendTipPoint(session, coords, BREADCRUMB_MIN_GAP_M, haversineDistanceM);
      if (grown !== session) {
        session = grown;
        dirty = true;
      }
      if (leaderIdRef.current && myRiderId === leaderIdRef.current) {
        if (prior === null) {
          seedPrior(); // hold the write; `session` keeps accumulating, so nothing is lost
        } else {
          const now = Date.now();
          if (dirty && now - lastUpsertMs >= BREADCRUMB_UPSERT_INTERVAL_MS) {
            lastUpsertMs = now;
            upsertPath('throttle');
          }
        }
      }
    }, (isMoving, motionFix) => {
      noteMotion(Date.now(), isMoving); // W285: the stationary-exemption input
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
      noteHeartbeat(Date.now(), hb.engineMoving); // W285: engine liveness evidence while stationary
      // D88 MIDDLE GROUND — engine self-check outcome. Instrument every heartbeat so we can
      // confirm ON-DEVICE that (a) the heartbeat fires at all while backgrounded/stationary
      // (the open question on aggressive OEMs) and (b) whether it re-engaged tracking. A
      // `reengaged: true` row is the fix working: the SDK's motion detector missed the start
      // of movement and our self-check caught it. Zero heartbeat_check rows during a
      // backgrounded stop = the OS killed the FGS → captain-side detection territory.
      void logMeasurement({ rideId, kind: 'app_state_change', payload: { event: 'heartbeat_check', ...hb } });
      // W284 full-capture tier: engine self-check outcomes (no coordinates — movedM is a
      // distance) when the operator flag names THIS ride; no-op otherwise.
      fullCaptureEvent(rideId, 'heartbeat_check', { ...hb });
    }, (ff) => {
      // W279 (wTBD2) — engine start → first fix, one row per engine run (or a no_fix row with the
      // run's duration). Ids and deltas only; device/OS/build fields ride on every measurement.
      void logMeasurement({
        rideId,
        kind: 'engine_first_fix',
        value: ff.delta_ms,
        payload: {
          outcome: ff.outcome,
          saver_on: ff.saver_on,
          cold_start: ff.cold_start,
          engine_start_client_ts: ff.engine_start_ts,
        },
      });
      fullCaptureEvent(rideId, 'engine_first_fix', {
        outcome: ff.outcome, delta_ms: ff.delta_ms, saver_on: ff.saver_on, cold_start: ff.cold_start,
      });
    }, (ev) => {
      // W285: the startup clock restarts on EVERY engine_started (a heartbeat_reassert is a fresh
      // BG.start() — same acquisition window as a cold start — and it is what clears engineDied after
      // a successful self-heal so the badge cannot stick); engine_died is not-reaching at once.
      if (ev.kind === 'engine_started') noteEngineStarted(Date.now());
      else if (ev.kind === 'engine_died') noteEngineDied();
      // W284 — always-on tier (slate 6, R3-45): engine_started on start() resolve, engine_died
      // when the plugin or location services go off while the process lives. warning_fired is
      // W285's (self-health) via the same recordCounter API. Fire-and-forget, ids only.
      // W286: 'wake_attempt' is full-capture ONLY — the always-on floor carries exactly three
      // counters. An engine_started with reason 'heartbeat_reassert' IS a counter.
      if (ev.kind !== 'wake_attempt') recordCounter(rideId, ev.kind, { reason: ev.reason, ...(ev.detail ?? {}) });
      // Mirrored into full capture so a flagged ride's engine lifecycle is observable in that
      // tier too (the toggle has something to show); no-op unless the flag names this ride.
      fullCaptureEvent(rideId, ev.kind, { reason: ev.reason, ...(ev.detail ?? {}) });
    });
    // D89: D86's watchBatterySaverCleared (a foreground-only Saver ON->OFF listener) is REMOVED —
    // it missed the backgrounded toggle (field-confirmed to never fire) and is superseded by the
    // unified resume-nudge in onResume above, which re-asserts the engine on every unlock
    // regardless of cause (Saver, OEM-suspend, warm-up strand).
    return () => {
      cancelled = true; // W290: a late seed result must not land on the next session's state
      // W290 (review r1): persist the throttled tail — Leave Ride must not lose up to 60 s of the
      // leader's route, and a remount's seed waits for this write (serialised per ride above).
      if (dirty && prior !== null && leaderIdRef.current && myRiderId === leaderIdRef.current) upsertPath('flush');
      void stopBgGeo();
      resetSelfHealthSignals(); // W285: one reset point per engine session
    };
    // D91: thresholds REMOVED from deps — the engine starts/stops on ride identity + permission
    // ONLY, never on tenant-threshold data. This is the fix for the +1s engine teardown.
  }, [backgroundReady, rideId, myRiderId]);

  // D91: rebuild the sender state tracker when tenant thresholds change, WITHOUT restarting the
  // engine — preserves the old "fresh tracker per thresholds" behavior now that thresholds no
  // longer gate the engine effect above. No-op until that effect has created the tracker.
  useEffect(() => {
    if (trackerRef.current) trackerRef.current = new SenderStateTracker(thresholds);
  }, [thresholds]);

  // Sleeping signal for the NO-background-tracking path. A rider who declined "Allow all
  // the time" has no FGS, so on AppState settling into 'background' fire ONE reliable (REST,
  // not the freeze-racing websocket) "sleeping" ping with the last fix — the fleet sees them
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
        payload: { event: 'handoff', branch: backgroundReady ? 'fgs' : 'sleeping', backgroundReady, hadCoords: !!c }, // W293: was 'dormant'
      });
      if (!backgroundReady && c) {
        void sendSleepingPing({ rideId, riderId: myRiderId, lat: c.lat, lng: c.lng });
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
  const departedKeys = Object.keys(departed).sort().join(',');
  useEffect(() => {
    if (!rideId) return;
    const pIds = pingKeys ? pingKeys.split(',') : [];
    const rIds = rosterKeys ? rosterKeys.split(',') : [];
    const lkIds = lastKnownKeys ? lastKnownKeys.split(',') : [];
    const dIds = departedKeys ? departedKeys.split(',') : [];
    // W292: ONE rule, one place — the log runs the same composeFleet the render does, so `source`
    // and `fleet` can never disagree with the map (they used to be a hand-mirrored loop). READER
    // BEWARE: `source` is accurate at emit time, but this effect fires on SET changes only — a flip
    // driven purely by a `ts` change (a stop rewrites an existing lastKnown row fresher than a
    // still-present stale ping) re-renders without re-emitting, so a rider's last-logged source can
    // lag the map. Trust `source` at the moment of its row, not as a running state.
    const composed = composeFleet({
      pings,
      lastKnown,
      roster,
      departed,
      nowMs: Date.now(),
      deriveState: (s, t, n) => deriveRenderState(s, t, n, thresholds),
    });
    const fIds = composed.fleet.map((f) => f.riderId).sort();
    const source: Record<string, 'live' | 'lastKnown'> = {};
    for (const f of composed.fleet) source[f.riderId] = f.source ?? 'live';
    void logMeasurement({
      rideId,
      kind: 'app_state_change',
      // ids and source only — never coordinates (Pillar II §2). `departed` = ids carrying a mark;
      // `suppressed` = the subset the departed rule actually kept off the map this time.
      payload: {
        event: 'fleet_compose',
        pings: pIds,
        roster: rIds,
        lastKnown: lkIds,
        departed: dIds,
        suppressed: composed.departedSuppressed.sort(),
        fleet: fIds,
        source,
      },
    });
    // pings/roster/lastKnown/departed intentionally omitted from deps — keyed via the sorted key
    // strings, so this fires on SET changes only, not on every ping that moves a rider a few metres.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pingKeys, rosterKeys, lastKnownKeys, departedKeys, rideId]);

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
  // W292: the join lives in lib/fleetCompose.ts (pure, node-tested) — (pings ∪ lastKnown) ∩ roster,
  // live wins when fresher, plus the departed rule: a marked rider is never seeded from last-known
  // and renders only from a live ping newer than the mark. deriveRenderState is injected so the pure
  // module has no runtime import; 'departed' is NOT a TacticalState (A3) — such riders are simply
  // absent from the fleet, and the roster is where the mark is shown.
  const composed = composeFleet({
    pings,
    lastKnown,
    roster,
    departed,
    nowMs: Date.now(),
    deriveState: (s, t, n) => deriveRenderState(s, t, n, thresholds),
  });
  const fleet: FleetParticipant[] = composed.fleet;
  // Only a LIVE ping from an unidentified rider signals a mid-ride joiner (refetch the roster,
  // debounced in useRideRoster). A stored last-known with no roster row is a rider RLS hid from us.
  if (composed.unknownLiveRiderIds.length > 0) onUnknownRider?.();

  return { fleet, myCoords, channelStatus: status };
}
