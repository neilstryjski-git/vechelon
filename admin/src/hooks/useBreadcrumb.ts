import { useEffect, useRef, useState } from 'react';

import type { FleetParticipant } from '../lib/roleVisibility';
import type { RideRoster } from './useFleetPositions';

export interface LatLng {
  lat: number;
  lng: number;
}

// Mirror the mobile constants (mobile/src/hooks/useBreadcrumb.ts) so the trail
// looks identical on both surfaces. Append a leader fix only when it is at least
// this far from the last KEPT point; hard-cap the array and coarsen the older
// head on overflow so a long ride can't grow it without bound.
export const BREADCRUMB_MIN_GAP_M = 20;
export const BREADCRUMB_MAX_POINTS = 1500;
const EARTH_RADIUS_M = 6_371_000;

export function haversineM(a: LatLng, b: LatLng): number {
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

// Pure decimation + cap. Returns the SAME array reference when `next` is within
// the decimation gap of the last kept point (so callers can skip a re-render);
// otherwise returns a new array with `next` appended and, on overflow, the older
// head coarsened (halved) rather than dropped — keeping the session-start origin
// at lower fidelity behind the leader. Exported pure for unit testing.
export function appendLeaderFix(trail: LatLng[], next: LatLng): LatLng[] {
  const last = trail[trail.length - 1];
  if (last && haversineM(last, next) < BREADCRUMB_MIN_GAP_M) return trail;
  let updated = [...trail, next];
  if (updated.length > BREADCRUMB_MAX_POINTS) {
    const tail = updated.slice(-Math.floor(BREADCRUMB_MAX_POINTS / 2));
    const head = updated
      .slice(0, updated.length - tail.length)
      .filter((_, i) => i % 2 === 0);
    updated = [...head, ...tail];
  }
  return updated;
}

// Ride-leader breadcrumb (W215) — the web Race Control port of mobile W212.
// Accumulates the FIRST CAPTAIN's positions into a DURABLE trail the operator
// can follow on the fleet map.
//
// Carries over the validated mobile D67 fix: the leader is resolved from the
// ROSTER (the RLS-gated participant list), NOT from the live pings. A captain
// who is in the roster but whose marker hasn't rendered yet must still resolve
// as the leader. The leader's POSITION then comes from the fleet, which is built
// from the SAME raw 'pos' broadcasts the markers use — so this piggybacks the
// existing web channel and opens no new one.
//
// Load-bearing rules mirrored from the brief:
//  1. DURABLE accumulator in a ref, reset ONLY on rideId change — survives
//     channel re-subscribe so the line isn't lost on reconnect.
//  2. Leader fixed for the session (no mid-ride switch); if it goes Dark the
//     append stops and the line freezes at last-known.
//  3. Memory-only — never reads location_pings (Pillar II §2).
export function useBreadcrumb(
  rideId: string | null,
  roster: RideRoster,
  fleet: FleetParticipant[],
): { trail: LatLng[]; leaderId: string | null } {
  const [leaderId, setLeaderId] = useState<string | null>(null);
  const trailRef = useRef<LatLng[]>([]);
  const [trail, setTrail] = useState<LatLng[]>([]);

  // Reset the accumulator ONLY on ride change — ties the trail's lifetime to the
  // ride, not the volatile channel (durable across re-subscribe).
  useEffect(() => {
    trailRef.current = [];
    setTrail([]);
    setLeaderId(null);
  }, [rideId]);

  // Resolve the leader ONCE per ride from the ROSTER: the first captain entry.
  // Runs whenever the roster updates until a captain is found and fixed.
  useEffect(() => {
    if (leaderId) return; // already fixed for this ride
    const captainId =
      Object.keys(roster).find((id) => roster[id]?.role === 'captain') ?? null;
    if (captainId) setLeaderId(captainId);
  }, [roster, leaderId]);

  // Append the leader's latest position when it has moved beyond the decimation
  // gap. Keyed on the leader's lat/lng so it fires once per new fix. Leader Dark
  // → we stop appending → the line freezes at last-known.
  const leader = leaderId ? fleet.find((p) => p.riderId === leaderId) : undefined;
  const lat = leader?.position?.lat ?? null;
  const lng = leader?.position?.lng ?? null;
  const isDark = leader?.state === 'dark';
  useEffect(() => {
    if (lat == null || lng == null || isDark) return;
    const updated = appendLeaderFix(trailRef.current, { lat, lng });
    if (updated === trailRef.current) return; // decimated — no change, no re-render
    trailRef.current = updated;
    setTrail(updated);
  }, [lat, lng, isDark]);

  return { trail, leaderId };
}
