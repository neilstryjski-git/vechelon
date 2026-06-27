import { useEffect, useRef, useState } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';

import { POSITION_EVENT, type RideRoster } from './useFleetPositions';
import { logMeasurement } from '../lib/measure';
import { LatLng } from '../lib/geo';
import { appendTrailPoint, capTrail } from '../lib/breadcrumbTrail';

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
  // W233: highest captain trail SEQ we've merged. Lets the window-merge append only
  // genuinely-new points (and detect a gap bigger than the broadcast window).
  const lastSeqRef = useRef<number>(-1);
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
    lastSeqRef.current = -1;
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
      const p = payload as {
        riderId?: string;
        lat?: number;
        lng?: number;
        trail?: LatLng[];
        trailBaseSeq?: number;
      };
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

      if (!lid || p?.riderId !== lid) return;

      // W233 — preferred path: the captain attaches a bounded recent WINDOW of its
      // decimated trail + the seq of the window's first point. Merge by seq so we append
      // only points newer than what we already have. This is what makes the breadcrumb
      // lock-independent: a rider unlocking/late gets the missed portion from the next
      // single broadcast (bounded by the window — a lock LONGER than the window leaves a
      // straight jump for the un-covered older part, accepted per Sr PM).
      if (Array.isArray(p.trail) && typeof p.trailBaseSeq === 'number') {
        const base = p.trailBaseSeq;
        const tipSeq = base + p.trail.length - 1;
        if (tipSeq <= lastSeqRef.current) return; // nothing newer than we have
        // Points we don't yet have. If our last seq is within the window, slice the
        // genuinely-new tail; if we fell behind the window (long lock), take it whole.
        const startIdx = Math.max(0, lastSeqRef.current + 1 - base);
        const fresh = p.trail.slice(startIdx);
        if (fresh.length === 0) return;
        const updated = capTrail([...trailRef.current, ...fresh]);
        trailRef.current = updated;
        lastSeqRef.current = tipSeq;
        setTrail(updated);
        return;
      }

      // Legacy fallback (a captain on an older build that broadcasts only a single
      // point): receiver-side decimated single-point append, as before.
      if (typeof p.lat !== 'number' || typeof p.lng !== 'number') return;
      const updated = appendTrailPoint(trailRef.current, { lat: p.lat, lng: p.lng });
      if (updated !== trailRef.current) {
        trailRef.current = updated;
        setTrail(updated);
      }
    });
  }, [channel]);

  return { trail, leaderId };
}
