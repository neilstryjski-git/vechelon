import { useCallback, useEffect, useRef, useState } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';

import { POSITION_EVENT } from './useFleetPositions';
import { supabase } from '../lib/supabase';
import { logMeasurement } from '../lib/measure';
import { LatLng } from '../lib/geo';
import { appendTrailPoint } from '../lib/breadcrumbTrail';
import { logFetchResult, logResumeSignal } from '../lib/lifecycle';
import { useResume } from './useResume';
import type { ResumeSource } from '../lib/resumeDetector';

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
): { trail: LatLng[]; leaderId: string | null } {
  // Read in the broadcast handler (bound once per channel) without re-binding.
  const leaderIdRef = useRef<string | null>(leaderId);
  leaderIdRef.current = leaderId;
  const rideIdRef = useRef<string | null>(rideId);
  rideIdRef.current = rideId;

  const trailRef = useRef<LatLng[]>([]);
  const [trail, setTrail] = useState<LatLng[]>([]);
  // D67 instrumentation: count pings so we snapshot match-state periodically (no per-ping spam).
  const pingCountRef = useRef(0);

  // Reset the trail ONLY on ride change.
  useEffect(() => {
    trailRef.current = [];
    setTrail([]);
    pingCountRef.current = 0;
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
    const path = (data?.path as LatLng[] | null) ?? [];
    logFetchResult(rid, 'breadcrumb', {
      found: !!data,
      pathLen: path.length,
      haveLen: trailRef.current.length,
      adopted: !error && !!data && path.length >= trailRef.current.length,
      ...(error ? { err: error.message } : {}),
    });
    if (error || !data) return;
    if (path.length >= trailRef.current.length) {
      trailRef.current = path;
      setTrail(path);
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
  }, [rideId, leaderId, fetchRoute]);
  // W269: the resume signal — not AppState alone — drives the catch-up fetch, so a resume that the
  // OS never reports still refetches. This is the path that left rogers with an empty trail through
  // the 2026-07-09 morning ride: it mounted when the breadcrumb was seconds old, pocketed, and
  // never refetched. (The 2026-07-10 bench showed 'active' DOES fire on both handsets at a desk, so
  // why it didn't refetch in the field is still open — W271 logs the fetch result to find out.)
  const onResume = useCallback(
    (source: ResumeSource) => {
      logResumeSignal(rideIdRef.current, source, 'breadcrumb');
      void fetchRoute();
    },
    [fetchRoute],
  );
  useResume(rideId, onResume);

  // Live forward-extension: append the leader's broadcast single-points so the trail tip
  // tracks the marker in real time between the ~60s table upserts. Bound once per channel;
  // reads leaderId/rideId via refs so it never re-binds (which would stack handlers).
  useEffect(() => {
    if (!channel) return;
    channel.on('broadcast', { event: POSITION_EVENT }, ({ payload }) => {
      const lid = leaderIdRef.current;
      const p = payload as { riderId?: string; lat?: number; lng?: number };
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
            trailLen: trailRef.current.length,
          },
        });
      }

      if (!lid || p?.riderId !== lid || typeof p.lat !== 'number' || typeof p.lng !== 'number') return;
      const updated = appendTrailPoint(trailRef.current, { lat: p.lat, lng: p.lng });
      if (updated !== trailRef.current) {
        trailRef.current = updated;
        setTrail(updated);
      }
    });
  }, [channel]);

  return { trail, leaderId };
}
