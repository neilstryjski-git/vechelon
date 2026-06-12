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
            'id, name, status, tenant_id, finish_coords, qr_code, tenants(rail3_stopped_threshold_minutes, rail3_inactive_threshold_minutes, rail3_dark_threshold_minutes)',
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

      const userId = auth.user?.id;
      let myRole: RideRole = 'member';
      if (userId) {
        const { data: me } = await supabase
          .from('ride_participants')
          .select('role')
          .eq('ride_id', rideId)
          .eq('account_id', userId)
          .maybeSingle();
        if (me?.role) myRole = me.role as RideRole;
      }

      if (cancelled) return;
      setRide({
        id: rideRes.data.id,
        name: rideRes.data.name,
        status: rideRes.data.status,
        tenantId: rideRes.data.tenant_id,
        qrCode: rideRes.data.qr_code ?? null,
        // PostgREST embeds the FK'd tenants row; per-field default fallback.
        thresholds: thresholdsFromTenant(
          rideRes.data.tenants as Parameters<typeof thresholdsFromTenant>[0],
        ),
        finish: parsePoint(rideRes.data.finish_coords),
        myRole,
      });
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [rideId]);

  return { ride, loading, error };
}
