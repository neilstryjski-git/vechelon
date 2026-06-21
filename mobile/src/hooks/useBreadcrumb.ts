import { useEffect, useRef, useState } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';

import { supabase } from '../lib/supabase';
import { POSITION_EVENT } from './useFleetPositions';
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
// Two load-bearing rules from the brief:
//  1. Source from the RAW 'pos' broadcasts (piggybacks the shared ride channel —
//     NO new channel), NOT from useFleetPositions' pings map. That map is wiped on
//     channel re-subscribe (setPings({})), and screen-lock drops the websocket —
//     deriving the trail from it would make the line VANISH on reconnect instead of
//     freezing. The accumulator here is only reset on rideId change, so it survives
//     re-subscribe.
//  2. Leader is resolved ONCE and FIXED for the session (first captain to join).
//     Never re-resolved, so the trail can't splice two captains' paths. If the
//     leader goes Dark the append simply stops and the line freezes at last-known.
export function useBreadcrumb(
  rideId: string | null,
  channel: RealtimeChannel | null,
): { trail: LatLng[]; leaderId: string | null } {
  const [leaderId, setLeaderId] = useState<string | null>(null);
  // Read in the broadcast handler (bound once per channel) without re-binding when
  // the leader resolves a moment after the channel — avoids a duplicate handler.
  const leaderIdRef = useRef<string | null>(null);
  leaderIdRef.current = leaderId;

  const trailRef = useRef<LatLng[]>([]);
  const [trail, setTrail] = useState<LatLng[]>([]);

  // Resolve the leader ONCE per ride: the first captain to join (earliest
  // joined_at). Resetting the trail here (and ONLY here) ties the accumulator's
  // lifetime to the ride, not the volatile channel.
  useEffect(() => {
    trailRef.current = [];
    setTrail([]);
    setLeaderId(null);
    if (!rideId) return;
    let cancelled = false;
    void (async () => {
      const { data } = await supabase
        .from('ride_participants')
        .select('account_id')
        .eq('ride_id', rideId)
        .eq('role', 'captain')
        .order('joined_at', { ascending: true })
        .limit(1)
        .maybeSingle();
      if (!cancelled && data?.account_id) setLeaderId(data.account_id);
    })();
    return () => {
      cancelled = true;
    };
  }, [rideId]);

  // Append the leader's positions from the shared 'pos' broadcast. Bound once per
  // channel object (re-binds when useRideChannel recreates the channel on
  // re-subscribe) and reads leaderId via a ref. trailRef is intentionally NOT reset
  // here, so the trail is durable across screen-lock / reconnect.
  useEffect(() => {
    if (!channel) return;
    channel.on('broadcast', { event: POSITION_EVENT }, ({ payload }) => {
      const lid = leaderIdRef.current;
      if (!lid) return;
      const p = payload as { riderId?: string; lat?: number; lng?: number };
      if (p?.riderId !== lid || typeof p.lat !== 'number' || typeof p.lng !== 'number') return;

      const next: LatLng = { lat: p.lat, lng: p.lng };
      const arr = trailRef.current;
      const last = arr[arr.length - 1];
      // Distance-threshold decimation: skip fixes too close to the last kept point.
      if (last && haversineDistanceM(last, next) < BREADCRUMB_MIN_GAP_M) return;

      let updated = [...arr, next];
      if (updated.length > BREADCRUMB_MAX_POINTS) {
        // Keep the recent tail at full resolution; coarsen the older head by half.
        const tail = updated.slice(-Math.floor(BREADCRUMB_MAX_POINTS / 2));
        const head = updated
          .slice(0, updated.length - tail.length)
          .filter((_, i) => i % 2 === 0);
        updated = [...head, ...tail];
      }
      trailRef.current = updated;
      setTrail(updated);
    });
    // Broadcast handlers bind dynamically post-subscribe; the old channel (and its
    // handlers) is discarded by useRideChannel's removeChannel on re-bind.
  }, [channel]);

  return { trail, leaderId };
}
