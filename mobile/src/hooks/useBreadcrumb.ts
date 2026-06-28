import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import type { RealtimeChannel } from '@supabase/supabase-js';

import { POSITION_EVENT, type RideRoster } from './useFleetPositions';
import { supabase } from '../lib/supabase';
import { logMeasurement } from '../lib/measure';
import { LatLng } from '../lib/geo';
import { appendTrailPoint } from '../lib/breadcrumbTrail';

// Ride-leader breadcrumb (W212 → W234). Draws the CAPTAIN's route so members can follow it.
//
// W234 — the route now persists in the anonymized, 4h-purged `rail3_breadcrumb` table
// (keyed by ride_id, no person-id; written only by the captain). The receiver FETCHES the
// full route on open AND on app-resume — so a device that was locked/away for any duration
// gets the COMPLETE route in a single read (replaces the transient W233 broadcast window).
// Between fetches, the leader's live single-point broadcasts extend the tip in real time.
//
// D67: the leader is resolved from the ROSTER (the same RLS-gated read the fleet markers
// use), so the live tip extends on every device incl. a remote SAG (not just the captain's).
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
  // D67 instrumentation: count pings so we snapshot match-state periodically (no per-ping spam).
  const pingCountRef = useRef(0);

  // Reset the trail ONLY on ride change.
  useEffect(() => {
    trailRef.current = [];
    setTrail([]);
    setLeaderId(null);
    pingCountRef.current = 0;
  }, [rideId]);

  // Resolve the leader ONCE per ride from the ROSTER (first captain) — used to filter which
  // live broadcasts extend the tip. The table fetch is keyed by ride_id and needs no leaderId.
  useEffect(() => {
    if (leaderIdRef.current) return;
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
    if (error || !data) return;
    const path = (data.path as LatLng[] | null) ?? [];
    if (path.length >= trailRef.current.length) {
      trailRef.current = path;
      setTrail(path);
    }
  }, []);

  // Fetch on mount / ride change, and again whenever the app returns to the foreground
  // (the lock-independent catch-up: one read restores the whole route after any absence).
  useEffect(() => {
    void fetchRoute();
  }, [rideId, fetchRoute]);
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') void fetchRoute();
    });
    return () => sub.remove();
  }, [fetchRoute]);

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
