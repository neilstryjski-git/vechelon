import { useEffect, useRef, useState } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';

import { POSITION_EVENT, type RideRoster } from './useFleetPositions';
import { logMeasurement } from '../lib/measure';
import { haversineDistanceM, LatLng } from '../lib/geo';

// Append a leader fix only when it's at least this far from the last KEPT point.
// TS background-geo cadence is variable/event-driven, so distance-keyed decimation
// (not "every Nth fix") is the right bound — O(1) per fix and angular choppiness
// stays near the native ping spacing (accepted for the PoC).
const BREADCRUMB_MIN_GAP_M = 20;
// Hard cap so a long ride can't grow the array without bound. On hit we COARSEN
// the older head (halve its resolution) rather than drop the oldest point, so the
// line keeps its session-start origin — just at lower fidelity behind the rider.
const BREADCRUMB_MAX_POINTS = 1500;

// Ride-leader breadcrumb (W212). Accumulates the FIRST CAPTAIN's broadcast
// positions into a DURABLE trail so members can follow the leader's path.
//
// D67 FIX: the leader is resolved from the ROSTER (the same RLS-gated read the
// fleet markers already use), NOT a standalone `ride_participants … role='captain'
// maybeSingle()` query. The trail drew on the captain's OWN device but never on a
// remote SAG, even though the SAG received the captain's pings AND rendered the
// captain's dot — i.e. the roster contained the captain on the SAG while the
// standalone query did not take effect there. Sourcing the leader from the roster
// removes that divergence. (PoC: first captain entry found; multi-captain
// joined_at ordering is a follow-up — there is one captain in the PoC.)
//
// Two load-bearing rules from the brief still hold:
//  1. Source from the RAW 'pos' broadcasts (piggyback the shared channel — no new
//     channel), accumulated in a DURABLE ref reset only on rideId change, so the
//     line survives screen-lock / reconnect.
//  2. Leader fixed for the session; if it goes Dark the append stops and the line
//     freezes at last-known.
export function useBreadcrumb(
  rideId: string | null,
  channel: RealtimeChannel | null,
  roster: RideRoster,
): { trail: LatLng[]; leaderId: string | null } {
  const [leaderId, setLeaderId] = useState<string | null>(null);
  // Read in the broadcast handler (bound once per channel) without re-binding.
  const leaderIdRef = useRef<string | null>(null);
  leaderIdRef.current = leaderId;
  const rideIdRef = useRef<string | null>(rideId);
  rideIdRef.current = rideId;

  const trailRef = useRef<LatLng[]>([]);
  const [trail, setTrail] = useState<LatLng[]>([]);
  // D67 instrumentation: count pings so we can snapshot match-state periodically
  // to the sink without per-ping spam.
  const pingCountRef = useRef(0);

  // Reset the accumulator ONLY on ride change — ties the trail's lifetime to the
  // ride, not the volatile channel (durable across re-subscribe / screen-lock).
  useEffect(() => {
    trailRef.current = [];
    setTrail([]);
    setLeaderId(null);
    pingCountRef.current = 0;
  }, [rideId]);

  // Resolve the leader ONCE per ride from the ROSTER: the first captain entry.
  // Runs whenever the roster updates until a captain is found and fixed.
  useEffect(() => {
    if (leaderIdRef.current) return; // already fixed for this ride
    const captainId =
      Object.keys(roster).find((id) => roster[id]?.role === 'captain') ?? null;
    if (captainId) {
      setLeaderId(captainId);
      void logMeasurement({
        rideId: rideIdRef.current ?? '',
        kind: 'app_state_change',
        payload: { event: 'breadcrumb_leader', leaderId: captainId, source: 'roster' },
      });
    }
  }, [roster]);

  // Append the leader's positions from the shared 'pos' broadcast. Bound once per
  // channel; reads leaderId/rideId via refs so it never re-binds (which would add a
  // duplicate handler). trailRef is NOT reset here — durable across re-subscribe.
  useEffect(() => {
    if (!channel) return;
    channel.on('broadcast', { event: POSITION_EVENT }, ({ payload }) => {
      const lid = leaderIdRef.current;
      const p = payload as { riderId?: string; lat?: number; lng?: number };
      pingCountRef.current += 1;

      // D67 instrumentation: snapshot the match-state every 15th ping so a remote
      // failure (lid null? riderId mismatch?) is diagnosable from the sink alone.
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

      if (!lid) return;
      if (p?.riderId !== lid || typeof p.lat !== 'number' || typeof p.lng !== 'number') return;

      const next: LatLng = { lat: p.lat, lng: p.lng };
      const arr = trailRef.current;
      const last = arr[arr.length - 1];
      // Distance-threshold decimation: skip fixes too close to the last kept point.
      if (last && haversineDistanceM(last, next) < BREADCRUMB_MIN_GAP_M) return;

      let updated = [...arr, next];
      if (updated.length > BREADCRUMB_MAX_POINTS) {
        const tail = updated.slice(-Math.floor(BREADCRUMB_MAX_POINTS / 2));
        const head = updated
          .slice(0, updated.length - tail.length)
          .filter((_, i) => i % 2 === 0);
        updated = [...head, ...tail];
      }
      trailRef.current = updated;
      setTrail(updated);
    });
  }, [channel]);

  return { trail, leaderId };
}
