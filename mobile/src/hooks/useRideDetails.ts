import { useEffect, useState } from 'react';

import { supabase } from '../lib/supabase';
import { parsePoint, LatLng } from '../lib/geo';
import type { RideRole } from '../lib/roleVisibility';
import { StateThresholds, thresholdsFromTenant } from '../state/riderState';

export interface RideDetails {
  id: string;
  name: string;
  status: string;
  tenantId: string; // denormalized onto beacon_alerts rows (W173)
  thresholds: StateThresholds; // per-tenant rider-state thresholds (W174)
  qrCode: string | null; // rides.qr_code — full-screen display (W175/R3-27)
  start: LatLng | null; // rides.start_coords — initial map frame before the first GPS fix (W244)
  finish: LatLng | null; // null ⇒ no Edge Indicator (R3-14, e.g. Ad Hoc rides)
  myRole: RideRole;
}

// Loads the ride row plus the signed-in user's participant role for it.
// One-shot reads at meaningful moments (screen mount) — live positions are
// Broadcast-only and never come from the DB (Pillar II §2).
export function useRideDetails(rideId: string | null): {
  ride: RideDetails | null;
  loading: boolean;
  error: string | null;
} {
  const [ride, setRide] = useState<RideDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!rideId) {
      setRide(null);
      setLoading(false);
      return;
    }
    let cancelled = false;

    (async () => {
      setLoading(true);
      setError(null);

      const [{ data: auth }, rideRes] = await Promise.all([
        supabase.auth.getUser(),
        supabase
          .from('rides')
          // Single string literal — supabase-js infers row types from it.
          .select(
            'id, name, status, tenant_id, start_coords, finish_coords, qr_code, tenants(rail3_stopped_threshold_minutes, rail3_inactive_threshold_minutes, rail3_dark_threshold_minutes)',
          )
          .eq('id', rideId)
          .maybeSingle(),
      ]);

      if (cancelled) return;
      if (rideRes.error || !rideRes.data) {
        setError(rideRes.error?.message ?? 'Ride not found');
        setLoading(false);
        return;
      }

      // W244 render-first: publish the ride the instant its row resolves, with
      // myRole defaulted to 'member', and clear loading NOW. The participant-role
      // read below is taken OFF the critical path — RideMapScreen renders the live
      // map immediately and the role hydrates a beat later. The momentary 'member'
      // default is FAIL-CLOSED on both consumers of myRole: it hides captain-only
      // chrome (RideControls), AND it restricts visibleParticipants to the §4.1
      // most-restrictive set (Captain+SAG only) — so it can only ever UNDER-show,
      // never leak peer positions. Real role only ever patches UP. Lane-A latency win.
      const row = rideRes.data;
      setRide({
        id: row.id,
        name: row.name,
        status: row.status,
        tenantId: row.tenant_id,
        qrCode: row.qr_code ?? null,
        // PostgREST embeds the FK'd tenants row; per-field default fallback.
        thresholds: thresholdsFromTenant(
          row.tenants as Parameters<typeof thresholdsFromTenant>[0],
        ),
        start: parsePoint(row.start_coords),
        finish: parsePoint(row.finish_coords),
        myRole: 'member',
      });
      setLoading(false);

      // Hydrate the real role asynchronously and patch it onto the already-rendered
      // ride. Guarded against a ride change mid-flight (cur.id === row.id).
      const userId = auth.user?.id;
      if (!userId) return;
      const { data: me } = await supabase
        .from('ride_participants')
        .select('role')
        .eq('ride_id', rideId)
        .eq('account_id', userId)
        .maybeSingle();
      if (cancelled || !me?.role) return;
      setRide((cur) => (cur && cur.id === row.id ? { ...cur, myRole: me.role as RideRole } : cur));
    })();

    return () => {
      cancelled = true;
    };
  }, [rideId]);

  return { ride, loading, error };
}
