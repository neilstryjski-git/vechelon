import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, AppStateStatus } from 'react-native';

import type { RealtimeChannel } from '@supabase/supabase-js';

import { supabase } from '../lib/supabase';
import { logMeasurement } from '../lib/measure';
import { sendDormantPing, restBroadcast } from '../lib/backgroundLocation';
import { startBgGeo, stopBgGeo } from '../lib/bgGeo';
import type { RideChannelStatus } from './useRideChannel';
import { haversineDistanceM, LatLng } from '../lib/geo';
import { appendTrailPoint } from '../lib/breadcrumbTrail';
import type { FleetParticipant, RideRole, TacticalState } from '../lib/roleVisibility';
import {
  SenderStateTracker,
  deriveRenderState,
  StateThresholds,
  DEFAULT_THRESHOLDS,
} from '../state/riderState';

// Broadcast event name for position pings on the rail3:ride:<id> channel.
export const POSITION_EVENT = 'pos';

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
// W234: how often the captain upserts its route to rail3_breadcrumb (throttled — not per
// fix, to keep writes cheap; receivers fetch on open/resume and extend live in between).
const BREADCRUMB_UPSERT_INTERVAL_MS = 60000;

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
  // W234: read MY current role in the send handler (to decide whether to upsert the
  // captain's route to rail3_breadcrumb) WITHOUT making roster an effect dep — that would
  // re-bind the FGS send effect on every roster refresh and churn the foreground service.
  const rosterRef = useRef(roster);
  rosterRef.current = roster;

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
    // Sender half of the W174 state machine — fresh per (ride, thresholds).
    const tracker = new SenderStateTracker(thresholds);
    let last: LatLng | null = null;
    // W234 — captain breadcrumb ROUTE TABLE: the captain accumulates its OWN decimated
    // route (full, capped) and UPSERTS it to rail3_breadcrumb on a ~60s throttle, so any
    // device can FETCH the complete route on open — lock-independent for ANY duration. The
    // broadcast is back to a single point; the table carries history, not the broadcast.
    let myPath: LatLng[] = [];
    let lastUpsertMs = 0;
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

      // Accumulate the decimated route on EVERY device (cheap, bounded) so the captain's
      // route is captured from the very first fix — even before useRideRoster resolves the
      // role. Only the CAPTAIN upserts it to rail3_breadcrumb (throttled). REST/Supabase
      // writes escape the screen-lock freeze, so the route records even while pocketed; we set
      // updated_at on every upsert so the 4h purge tracks LAST activity, not first insert.
      myPath = appendTrailPoint(myPath, coords);
      if (rosterRef.current[myRiderId]?.role === 'captain') {
        const now = Date.now();
        if (now - lastUpsertMs >= BREADCRUMB_UPSERT_INTERVAL_MS) {
          lastUpsertMs = now;
          void supabase
            .from('rail3_breadcrumb')
            .upsert(
              { ride_id: rideId, path: myPath, updated_at: new Date().toISOString() },
              { onConflict: 'ride_id' },
            );
        }
      }
    });
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
