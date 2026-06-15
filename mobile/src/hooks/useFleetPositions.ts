import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import * as Location from 'expo-location';

import type { RealtimeChannel } from '@supabase/supabase-js';

import { supabase } from '../lib/supabase';
import { logMeasurement } from '../lib/measure';
import {
  sendDormantPing,
  restBroadcast,
  startRail3BackgroundLocation,
  stopRail3BackgroundLocation,
} from '../lib/backgroundLocation';
import { startBgGeo, stopBgGeo } from '../lib/bgGeo';
import type { BgEngine } from '../lib/bgEngine';
import type { RideChannelStatus } from './useRideChannel';
import { haversineDistanceM, LatLng } from '../lib/geo';
import type { FleetParticipant, RideRole, TacticalState } from '../lib/roleVisibility';
import {
  SenderStateTracker,
  deriveRenderState,
  StateThresholds,
  DEFAULT_THRESHOLDS,
} from '../state/riderState';

// Broadcast event name for position pings on the rail3:ride:<id> channel.
export const POSITION_EVENT = 'pos';

// Foreground ping cadence while the map screen is open (D-54 validation targets
// are W179's scope; these are the working defaults). Background GPS / screen-lock
// continuation is W176/W179 — this hook publishes while the app is foregrounded.
const PING_INTERVAL_MS = 5000;

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
// Dark needs no inbound data to happen — re-derive every 15s (cheap: a state
// bump re-runs the in-memory join; no DB, no network).
const STATE_TICK_MS = 15000;

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
  // Dual-engine TRIAL selector (debug A/B): which background-location engine drives this
  // ride — 'expo' (foreground watch + FGS task) or 'tsbg' (Transistorsoft). Only the
  // selected engine broadcasts; both carry the channel-status-decoupling fix.
  bgEngine: BgEngine = 'tsbg',
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
  const lastSentRef = useRef(0);
  // Live refs so the broadcast receive handler (subscribed once, on [channel])
  // can read the current ride/rider for W180 latency logging WITHOUT re-binding
  // the subscription (which would reset pings) when these props change.
  const rideIdRef = useRef(rideId);
  rideIdRef.current = rideId;
  const myRiderIdRef = useRef(myRiderId);
  myRiderIdRef.current = myRiderId;

  // Re-derive render states as time passes — a rider goes Stopped→…→Dark
  // precisely when NO data arrives, so something must still trigger renders.
  const [, setStateTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setStateTick((n) => n + 1), STATE_TICK_MS);
    return () => clearInterval(t);
  }, []);

  // Receive: fold every position broadcast into the ping map, keyed by rider.
  useEffect(() => {
    if (!channel) return;
    setPings({});

    channel.on('broadcast', { event: POSITION_EVENT }, ({ payload }) => {
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
    // Broadcast/Presence handlers may bind after subscribe() (useRideChannel
    // already subscribed); postgres_changes may not — none are used here.
  }, [channel]);

  // Publish: watch the device position in the foreground and broadcast pings.
  // RC4: this expo-location FOREGROUND watch (src:'fg') runs UNLESS the Transistorsoft engine
  // is the selected background engine AND background tracking is active — in which case tsbg
  // owns foreground+background and this would double-send. For the 'expo' engine it stays on
  // (handles foreground; the expo FGS task handles background). Also the path for
  // foreground-only riders (no "Allow all the time").
  useEffect(() => {
    if (backgroundReady && bgEngine === 'tsbg') return;
    if (!channel || status !== 'SUBSCRIBED' || !myRiderId || !rideId) return;
    let sub: Location.LocationSubscription | null = null;
    let heartbeat: ReturnType<typeof setInterval> | null = null;
    let cancelled = false;
    // Sender half of the W174 state machine — fresh per (ride, thresholds).
    const tracker = new SenderStateTracker(thresholds);
    let lastPublished: LatLng | null = null;

    (async () => {
      const { status: perm } = await Location.requestForegroundPermissionsAsync();
      if (perm !== 'granted' || cancelled) return;

      // BACKGROUND-location permission + the AppState foreground↔background
      // handoff live in a SEPARATE effect (D63), gated on the W176 explainer flow
      // via `backgroundReady`. This effect owns ONLY the foreground socket publish
      // path — no inline background request (that staging shortcut is gone).

      // W174 publish seam: state computed from own movement (Dark is
      // receiver-derived and intentionally absent here). Shared by the OS
      // callback and the stationary heartbeat below.
      const publishSample = (coords: LatLng, distanceFromLastM: number, now: number) => {
        // RC3: the FGS owns broadcasting while backgrounded; this socket path owns the
        // foreground. Guard so the two (both alive for the whole ride) never double-send.
        if (AppState.currentState !== 'active') return;
        if (now - lastSentRef.current < PING_INTERVAL_MS) return;
        lastSentRef.current = now;
        const state = tracker.sample({ distanceFromLastM, atMs: now });
        lastPublished = coords;
        const payload: PositionPayload = {
          riderId: myRiderId,
          state,
          lat: coords.lat,
          lng: coords.lng,
          ts: now,
        };
        // Ephemeral fan-out only — the send is RLS-authorized server-side
        // (W170 rail3_broadcast_tenant_send). Never a DB write.
        void channel.send({ type: 'broadcast', event: POSITION_EVENT, payload });
        // W202 (PoC/staging-only sink): record the SENDER's own send so token-survival
        // is measurable from the sender, not just flaky receivers. Both this send AND
        // this sink write need a valid token — a gap = the token refresh failed.
        void logMeasurement({ rideId, kind: 'gps_ping', payload: { src: 'fg', state } });
      };

      let lastCallbackAtMs = 0;
      sub = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.Balanced,
          timeInterval: PING_INTERVAL_MS,
          // 0, NOT a distance filter (review finding): a distance filter
          // suppresses OS callbacks while stationary — exactly the condition
          // Stopped/Inactive describe — starving the state machine and making
          // a stopped rider indistinguishable from a Dark one. Movement vs
          // jitter is judged by MOVE_EPSILON_M in the tracker, not by the OS.
          distanceInterval: 0,
        },
        (loc) => {
          const coords = { lat: loc.coords.latitude, lng: loc.coords.longitude };
          setMyCoords(coords);
          const now = Date.now();
          lastCallbackAtMs = now;
          publishSample(
            coords,
            lastPublished ? haversineDistanceM(lastPublished, coords) : Infinity,
            now,
          );
        },
      );
      if (cancelled) {
        // Effect tore down while the watcher await was in flight — don't leak
        // the watcher or start a heartbeat the cleanup can no longer reach.
        sub.remove();
        return;
      }

      // Stationary heartbeat: if the OS still withholds callbacks (OEM
      // batching, Battery Saver — W177 territory), keep feeding the tracker
      // zero-movement samples at the ping cadence so Stopped/Inactive can
      // actually transition AND receivers keep getting pings (a silent sender
      // would read as Dark, collapsing the Stopped-vs-Dark distinction).
      heartbeat = setInterval(() => {
        const now = Date.now();
        if (now - lastCallbackAtMs < PING_INTERVAL_MS * 2) return; // OS is feeding us
        if (!lastPublished) return; // no fix yet — nothing truthful to send
        publishSample(lastPublished, 0, now);
      }, PING_INTERVAL_MS);
    })();

    return () => {
      cancelled = true;
      sub?.remove();
      if (heartbeat) clearInterval(heartbeat);
    };
  }, [channel, status, rideId, myRiderId, thresholds, backgroundReady, bgEngine]);

  // RC4 (Option A, engine swap) — Transistorsoft Background Geolocation owns location for
  // the WHOLE ride when background tracking is active. RC3 proved expo-location's FGS could
  // be *started* legally, but Android Doze still BATCHED its updates (saffron/30ab walks:
  // wake-time bursts, not a live stream — a documented, unfixed expo limitation). This is the
  // Garmin/Life360-class native engine that streams through Doze. We keep OUR transport (REST
  // broadcast + sink), so receivers/instrumentation are unchanged; this just replaces the
  // location SOURCE. Gated on backgroundReady; the foreground expo path (above) yields to it.
  // Started while foregrounded at ride join, stopped on leave. FREE in this debug/trial build
  // (no license); a release build needs the $399 Starter key.
  //
  // CRITICAL (field-test bug, 2026-06-15): do NOT gate this on the realtime channel `status`.
  // On screen-lock the websocket channel drops (status leaves 'SUBSCRIBED' → the "channel denied"
  // message), and if this effect depended on status it would re-run and TEAR DOWN the foreground
  // service (stopBgGeo) at exactly the moment we need it — killing the FGS (notification vanishes)
  // and stopping all location ~1–2 min after lock. The two are independent: location broadcasts go
  // over REST (restBroadcast), which never needs the websocket channel. So the FGS runs for the
  // whole ride regardless of channel state; it stops only on leaving the ride / losing background
  // permission / unmount.
  useEffect(() => {
    if (!backgroundReady || !rideId || !myRiderId) return;

    if (bgEngine === 'expo') {
      // EXPO engine: the foreground watch (above) sends 'fg'; this FGS TaskManager task sends
      // 'bg' while backgrounded (AppState-gated so the two never overlap). Started in the
      // foreground, runs the whole ride, decoupled from channel status (the field-test fix).
      void startRail3BackgroundLocation({ rideId, riderId: myRiderId });
      return () => {
        void stopRail3BackgroundLocation();
      };
    }

    // TSBG engine: Transistorsoft is the unified source (foreground + background), broadcasting
    // 'tsbg'. Sender-half state machine fresh per (ride, thresholds), same as the fg path.
    const tracker = new SenderStateTracker(thresholds);
    let last: LatLng | null = null;
    void startBgGeo((fix) => {
      const coords = { lat: fix.lat, lng: fix.lng };
      setMyCoords(coords);
      const dist = last ? haversineDistanceM(last, coords) : Infinity;
      last = coords;
      const state = tracker.sample({ distanceFromLastM: dist, atMs: fix.ts });
      // OUR transport (REST broadcast on the rail3 topic) + the same sink, so receivers
      // and instrumentation are unchanged. src:'tsbg' separates Transistorsoft pings in
      // the sink so a walk's cadence is directly comparable to the old fg/bg streams.
      void restBroadcast(rideId, { riderId: myRiderId, state, lat: coords.lat, lng: coords.lng, ts: fix.ts });
      void logMeasurement({ rideId, kind: 'gps_ping', payload: { src: 'tsbg', state } });
    });
    return () => {
      void stopBgGeo();
    };
  }, [backgroundReady, rideId, myRiderId, thresholds, bgEngine]);

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

  // Staging diagnostic: log who is RECEIVED (pings) vs known to the ROSTER vs
  // surviving into the FLEET (received AND in roster), whenever those sets
  // change — so we can tell REMOTELY whether a rider is dropped at the roster
  // join (a roster miss) or makes it into the fleet (then any no-show is a pure
  // render issue). Fires only on set changes, so it's not per-ping spam.
  const pingKeys = Object.keys(pings).sort().join(',');
  const rosterKeys = Object.keys(roster).sort().join(',');
  useEffect(() => {
    if (!rideId) return;
    const pIds = pingKeys ? pingKeys.split(',') : [];
    const rIds = rosterKeys ? rosterKeys.split(',') : [];
    const fIds = pIds.filter((id) => roster[id]);
    void logMeasurement({
      rideId,
      kind: 'app_state_change',
      payload: { event: 'fleet_compose', pings: pIds, roster: rIds, fleet: fIds },
    });
    // roster intentionally omitted from deps — keyed via rosterKeys string.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pingKeys, rosterKeys, rideId]);

  // Join pings to the server-gated roster. Unknown riderIds are dropped — for
  // a Rider, "unknown" is exactly the set RLS hid (other riders), so the §4.1
  // visibility boundary holds even before the client-side role filter runs.
  const fleet: FleetParticipant[] = [];
  for (const [riderId, p] of Object.entries(pings)) {
    const entry = roster[riderId];
    if (!entry) {
      // Likely a mid-ride joiner — ask for a (debounced) roster refresh; the
      // ping stays hidden until the server-gated roster can identify them.
      onUnknownRider?.();
      continue;
    }
    fleet.push({
      riderId,
      displayName: entry.displayName,
      role: entry.role,
      phone: entry.phone,
      accountStatus: entry.participantStatus,
      // W174 receiver half: staleness past the dark threshold overrides the
      // last self-reported state; the marker stays greyed AT the last known
      // position (p.lat/lng below) — exactly the committed Dark rendering.
      state: deriveRenderState(p.state ?? 'active', p.receivedAtMs, Date.now(), thresholds),
      position: { lat: p.lat, lng: p.lng },
      lastPingAt: p.ts,
    });
  }

  return { fleet, myCoords, channelStatus: status };
}
