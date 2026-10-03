import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';

import { POSITION_EVENT, DEPARTED_EVENT } from './useFleetPositions';
import { supabase } from '../lib/supabase';
import { logMeasurement } from '../lib/measure';
import { LatLng, haversineDistanceM } from '../lib/geo';
import { BREADCRUMB_MIN_GAP_M } from '../lib/breadcrumbTrail';
import {
  adoptIfLonger,
  appendBreak,
  appendTipPoint,
  deriveBreadcrumbLiveness,
  isGapBreak,
  normalisePath,
  pointCount,
  splitSegments,
} from '../lib/breadcrumbSegments';
import type { BreadcrumbLiveness, TrailPath } from '../lib/breadcrumbSegments';
import { mergeDepartedMarks, pingBeatsDeparture } from '../lib/fleetCompose';
import type { DepartedMark } from '../lib/fleetCompose';
import { DEFAULT_THRESHOLDS } from '../state/riderState';
import type { StateThresholds } from '../state/riderState';
import { logFetchResult, logResumeSignal } from '../lib/lifecycle';
import { useResume } from './useResume';
import type { ResumeSource } from '../lib/resumeDetector';

// W290 (R3-72): staleness needs no inbound data to happen — re-derive on a tick (mirrors
// useFleetPositions STATE_TICK_MS; a state bump only re-runs the in-memory derivation).
const LIVENESS_TICK_MS = 15000;

// Ride-leader breadcrumb (W212 → W234 → D80). Draws the LEADER's route so members can follow it.
//
// W234 — the route persists in the anonymized, 4h-purged `rail3_breadcrumb` table (keyed by
// ride_id, no person-id; written only by the leader). The receiver FETCHES the full route on
// open AND on app-resume — so a device that was locked/away for any duration gets the COMPLETE
// route in a single read (replaces the transient W233 broadcast window). Between fetches, the
// leader's live single-point broadcasts extend the tip in real time.
//
// D80 — WHO the leader is is now a recorded FACT, passed in from the ride row (rides.started_by
// via useRideDetails), not re-derived here. THE RULE, which was always the rule: the leader is
// THE ACCOUNT THAT STARTED THE RIDE.
//
// What this replaces, and why it had to go: this hook used to elect the leader itself, by
// scanning the roster for the first entry with role === 'captain' and LATCHING it for the rest
// of the ride. Two independent defects fell out of that.
//   1. ride_participants.role is a CLUB-level designation stamped onto every ride's roster — not
//      a per-ride leader. A club captain who never opened the app still sits in the roster and
//      could win the election. In staging one such account was captain on 25 rides with zero
//      pings ever, and on 2026-07-13 it was elected leader of a ride it was not on. Every live
//      broadcast was then compared against that phantom's id and DISCARDED — including the real
//      captain's own — so the trail never extended live and latency ran to ~6 minutes.
//   2. The scan ran over an UNORDERED object (Object.keys of a roster built from a SELECT with
//      no ORDER BY), so it was non-deterministic: on the same ride, the same roster and the same
//      code, web elected the real captain while mobile elected the phantom.
// The latch made both permanent — an early or partial roster snapshot pinned the wrong leader
// for the whole ride, the same failure shape as the D77 identity latch.
//
// D67's security property is PRESERVED: the leader is still server-derived (the ride row is
// RLS-gated, exactly as the roster was), never taken from a broadcast payload — a spoofed `pos`
// payload still cannot make anyone the leader. The change is WHICH server fact we read, not
// whether we trust the client.
export function useBreadcrumb(
  rideId: string | null,
  channel: RealtimeChannel | null,
  leaderId: string | null,
  // D80 instrumentation only: which field the leader actually came from. The whole point of the
  // leader log is that a WRONG leader shows up in the sink instead of having to be inferred from
  // a missing trail — so it must not hardcode 'started_by' and then report that during the very
  // fallback case where the leader might be wrong. Defaults to the fallback, the pessimistic read.
  leaderSource: 'ride.started_by' | 'ride.created_by_fallback' = 'ride.created_by_fallback',
  thresholds: StateThresholds = DEFAULT_THRESHOLDS,
): {
  // W290: the trail is SEGMENTS now — one polyline each, never joined across a break (C1).
  segments: LatLng[][];
  // Breadcrumb LIVENESS (not a TacticalState): 'departed' = the leader's own 'depart' / departed_at
  // is held (Captain-departure NEWS → the cue); 'stale' = no leader ping within the Dark threshold
  // (styled stopped, no cue); 'live' otherwise. `live` is the render shortcut.
  liveness: BreadcrumbLiveness;
  live: boolean;
  leaderDeparted: boolean;
  // Sender-clock instant of the held departure (null when none) — lets the screen key the cue's
  // dismissal to ONE departure, so a later departure re-shows it.
  departedAtMs: number | null;
  leaderId: string | null;
} {
  // Read in the broadcast handler (bound once per channel) without re-binding.
  const leaderIdRef = useRef<string | null>(leaderId);
  leaderIdRef.current = leaderId;
  const rideIdRef = useRef<string | null>(rideId);
  rideIdRef.current = rideId;

  const trailRef = useRef<TrailPath>([]);
  const [path, setPath] = useState<TrailPath>([]);
  // W290: the leader's departure mark (sender clock, like the fleet's) and the last leader ping
  // (receiver clock) — the two inputs to liveness. Refs for the channel handler, state for render.
  const departedRef = useRef<DepartedMark | null>(null);
  const [departedAtMs, setDepartedAtMs] = useState<number | null>(null);
  const lastLeaderPingAtRef = useRef<number | null>(null);
  const [lastLeaderPingAt, setLastLeaderPingAt] = useState<number | null>(null);
  const thresholdsRef = useRef(thresholds);
  thresholdsRef.current = thresholds;
  const [, setLivenessTick] = useState(0);
  // D67 instrumentation: count pings so we snapshot match-state periodically (no per-ping spam).
  const pingCountRef = useRef(0);

  // Reset the trail ONLY on ride change.
  useEffect(() => {
    trailRef.current = [];
    setPath([]);
    pingCountRef.current = 0;
    departedRef.current = null;
    setDepartedAtMs(null);
    lastLeaderPingAtRef.current = null;
    setLastLeaderPingAt(null);
  }, [rideId]);

  useEffect(() => {
    if (!rideId) return;
    const t = setInterval(() => setLivenessTick((n) => n + 1), LIVENESS_TICK_MS);
    return () => clearInterval(t);
  }, [rideId]);

  // D80 instrumentation: record the leader we were GIVEN (and its source) so a wrong leader is
  // visible in the sink instead of having to be inferred from a missing trail — which is how the
  // phantom-captain election hid for as long as it did. Re-logs if the leader ever changes,
  // which under the new model should only happen on ride change.
  useEffect(() => {
    if (!leaderId) return;
    void logMeasurement({
      rideId: rideIdRef.current ?? '',
      kind: 'app_state_change',
      payload: { event: 'breadcrumb_leader', leaderId, source: leaderSource },
    });
  }, [leaderId, leaderSource]);

  // W234 — fetch the captain's full route from the table. ADOPT only if it's at least as long
  // as what we have, so a fetch can never truncate a fresher live-extended tail (on resume the
  // table is authoritative + longer because we were away; foreground stays on live appends).
  const fetchRoute = useCallback(async () => {
    const rid = rideIdRef.current;
    if (!rid) return;
    const { data, error } = await supabase
      .from('rail3_breadcrumb')
      .select('path')
      .eq('ride_id', rid)
      .maybeSingle();
    // W271: a query that returned no row and a query that was never issued used to look identical
    // in the sink — which is why the 2026-07-09 morning breadcrumb had no recorded cause.
    // W290: defensive read (garbage/old shapes tolerated); adopt-only-if-longer on POINT count,
    // sentinels excluded; the table is authoritative on segmentation (ties adopt).
    const fetched = normalisePath(data?.path);
    const adopted = !error && !!data && adoptIfLonger(trailRef.current, fetched) === fetched;
    logFetchResult(rid, 'breadcrumb', {
      found: !!data,
      pathLen: pointCount(fetched),
      segs: splitSegments(fetched).length,
      haveLen: pointCount(trailRef.current),
      adopted,
      ...(error ? { err: error.message } : {}),
    });
    if (error || !data || !adopted) return;
    trailRef.current = fetched;
    setPath(fetched);
  }, []);

  // W290: catch-up for a viewer who missed the leader's 'depart' broadcast (pocketed, reconnecting,
  // opened late) — read the leader's durable departed_at (W292) beside the route fetch. Merged with
  // the live mark by the same rule the fleet uses (a broadcast learned after/just before this fetch
  // started outranks what the fetch read; a rejoin's cleared column drops a stale local mark).
  const fetchLeaderDeparture = useCallback(async () => {
    const rid = rideIdRef.current;
    const lid = leaderIdRef.current;
    if (!rid || !lid) return;
    const startedAt = Date.now();
    const { data, error } = await supabase
      .from('ride_participants')
      .select('departed_at')
      .eq('ride_id', rid)
      .eq('account_id', lid)
      .maybeSingle();
    if (rid !== rideIdRef.current || lid !== leaderIdRef.current) return; // ride/leader changed meanwhile
    const atMs = data?.departed_at ? Date.parse(data.departed_at) : NaN;
    const fetched: Record<string, DepartedMark> = Number.isNaN(atMs) ? {} : { [lid]: { atMs, seenAtMs: Date.now() } };
    const local: Record<string, DepartedMark> = departedRef.current ? { [lid]: departedRef.current } : {};
    const merged = error ? local : mergeDepartedMarks(fetched, local, startedAt);
    const next = merged[lid] ?? null;
    const wasDeparted = departedRef.current !== null;
    departedRef.current = next;
    setDepartedAtMs(next ? next.atMs : null);
    logFetchResult(rid, 'leaderDeparture', {
      found: !!data,
      departed: next !== null,
      ...(error ? { err: error.message } : {}),
    });
    if (next && !wasDeparted) {
      void logMeasurement({ rideId: rid, kind: 'app_state_change', payload: { event: 'breadcrumb_stopped', source: 'departed_at' } });
    }
  }, []);

  // Fetch on mount / ride change, and again on every resume (the lock-independent catch-up: one
  // read restores the whole route after any absence).
  //
  // D80: also refetch when leaderId RESOLVES. The ride row arrives asynchronously, so there is a
  // brief window where leaderId is null and the live tip-extension below correctly refuses to
  // append (fail-closed). Any leader points broadcast during that window are lost to this device
  // — they are in the table, but nothing would re-read it until the next resume. Refetching on
  // leader arrival closes the window; the adopt-only-if-longer guard above makes the extra fetch
  // free of risk (it can never shorten a fresher trail).
  useEffect(() => {
    void fetchRoute();
    void fetchLeaderDeparture();
  }, [rideId, leaderId, fetchRoute, fetchLeaderDeparture]);
  // W269: the resume signal — not AppState alone — drives the catch-up fetch, so a resume that the
  // OS never reports still refetches. This is the path that left rogers with an empty trail through
  // the 2026-07-09 morning ride: it mounted when the breadcrumb was seconds old, pocketed, and
  // never refetched. (The 2026-07-10 bench showed 'active' DOES fire on both handsets at a desk, so
  // why it didn't refetch in the field is still open — W271 logs the fetch result to find out.)
  const onResume = useCallback(
    (source: ResumeSource) => {
      logResumeSignal(rideIdRef.current, source, 'breadcrumb');
      void fetchRoute();
      void fetchLeaderDeparture();
    },
    [fetchRoute, fetchLeaderDeparture],
  );
  useResume(rideId, onResume);

  // Live forward-extension: append the leader's broadcast single-points so the trail tip
  // tracks the marker in real time between the ~60s table upserts. Bound once per channel;
  // reads leaderId/rideId via refs so it never re-binds (which would stack handlers).
  useEffect(() => {
    if (!channel) return;
    channel.on('broadcast', { event: POSITION_EVENT }, ({ payload }) => {
      const lid = leaderIdRef.current;
      const p = payload as { riderId?: string; lat?: number; lng?: number; ts?: unknown };
      pingCountRef.current += 1;

      if (pingCountRef.current % 15 === 0) {
        void logMeasurement({
          rideId: rideIdRef.current ?? '',
          kind: 'app_state_change',
          payload: {
            event: 'breadcrumb_status',
            lid,
            pingRider: p?.riderId ?? null,
            match: p?.riderId === lid,
            trailLen: pointCount(trailRef.current),
            liveness: departedRef.current ? 'departed' : 'live_or_stale',
          },
        });
      }

      if (!lid || p?.riderId !== lid || typeof p.lat !== 'number' || typeof p.lng !== 'number') return;
      // W290: a ping that is OLDER than a held departure is a pre-departure echo — it must never
      // extend a frozen trail (sender clock vs sender clock, the fleet's own rule).
      const ts = typeof p.ts === 'number' && Number.isFinite(p.ts) ? p.ts : Date.now();
      const mark = departedRef.current;
      if (mark && !pingBeatsDeparture(ts, mark)) return;
      const now = Date.now();
      let next = trailRef.current;
      if (mark) {
        // The Captain is BACK (R3-72 / C1): resume into the SAME breadcrumb, behind a local break so
        // the live tip is not joined to the frozen tail before the writer's next table shape arrives.
        departedRef.current = null;
        setDepartedAtMs(null);
        next = appendBreak(next);
        void logMeasurement({ rideId: rideIdRef.current ?? '', kind: 'app_state_change', payload: { event: 'breadcrumb_resumed' } });
      } else if (isGapBreak(lastLeaderPingAtRef.current, now, thresholdsRef.current.darkMinutes * 60_000)) {
        // Passive loss and return (no departure): the gap is still a gap — never drawn across.
        next = appendBreak(next);
      }
      lastLeaderPingAtRef.current = now;
      setLastLeaderPingAt(now);
      next = appendTipPoint(next, { lat: p.lat, lng: p.lng }, BREADCRUMB_MIN_GAP_M, haversineDistanceM);
      if (next !== trailRef.current) {
        trailRef.current = next;
        setPath(next);
      }
    });
    // W290: the leader's OWN departure (Leave Ride / sign-out) is Captain-departure news. Filtered
    // to the leader (a non-leader Captain leaving is not), and a ride-end teardown's depart
    // (`rideEnd`, W287/W290) is not news either — the ride-end watch handles that.
    channel.on('broadcast', { event: DEPARTED_EVENT }, ({ payload }) => {
      const p = payload as { riderId?: string; ts?: unknown; rideEnd?: unknown };
      if (!p?.riderId || p.riderId !== leaderIdRef.current || p.rideEnd) return;
      const atMs = typeof p.ts === 'number' && Number.isFinite(p.ts) ? p.ts : Date.now();
      departedRef.current = { atMs, seenAtMs: Date.now() };
      setDepartedAtMs(atMs);
      void logMeasurement({ rideId: rideIdRef.current ?? '', kind: 'app_state_change', payload: { event: 'breadcrumb_stopped', source: 'broadcast' } });
    });
  }, [channel]);

  const segments = useMemo(() => splitSegments(path), [path]);
  const liveness = deriveBreadcrumbLiveness({
    leaderDeparted: departedAtMs !== null,
    lastLeaderPingAtMs: lastLeaderPingAt,
    nowMs: Date.now(),
    darkMinutes: thresholds.darkMinutes,
  });

  return {
    segments,
    liveness,
    live: liveness === 'live',
    leaderDeparted: liveness === 'departed',
    departedAtMs,
    leaderId,
  };
}
