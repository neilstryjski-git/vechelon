import { useEffect, useState } from 'react';

import { supabase } from '../lib/supabase';
import { parsePoint, LatLng } from '../lib/geo';
import type { RideRole } from '../lib/roleVisibility';

export interface RideDetails {
  id: string;
  name: string;
  status: string;
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
          .select('id, name, status, finish_coords')
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
