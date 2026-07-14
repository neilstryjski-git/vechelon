import { useEffect, useState } from 'react';

import { supabase } from '../lib/supabase';
import { parsePoint, LatLng } from '../lib/geo';
import type { RideRole } from '../lib/roleVisibility';
import { StateThresholds, thresholdsFromTenant } from '../state/riderState';
import { rideLeaderId } from '../lib/rideControlsLogic';

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
  // D80 — the ride LEADER: the account that started the ride. Server truth, read from the ride
  // row itself, so every surface resolves the SAME leader. This replaces the old "first row in
  // the roster with role='captain'" scan, which elected a phantom: ride_participants.role is a
  // CLUB-level designation present on every ride's roster, so a club captain who never opened
  // the app could win, and the scan ran over an unordered object so web and mobile could elect
  // DIFFERENT leaders for the same ride.
  //
  // Falls back to created_by when started_by is NULL (rides that predate the D80 migration and
  // were never backfilled). null only when the ride row itself is unavailable.
  leaderId: string | null;
  // Which field leaderId actually came from — instrumentation, so a leader resolved via the
  // FALLBACK is visible in the sink rather than being reported as authoritative. The fallback is
  // the path that could still elect an off-ride account (a scheduled ride's authoring admin), so
  // it is the one we most need to be able to see.
  leaderSource: 'ride.started_by' | 'ride.created_by_fallback';
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
      // D80: drop the previous ride BEFORE fetching the new one. Without this, a ride→ride
      // transition without a remount leaves `ride` (and therefore ride.leaderId) holding the
      // OLD ride's leader for the duration of the fetch — the reader would filter the new
      // ride's broadcasts against a stale leader, and the writer could upsert to the new
      // ride_id while not being its leader. Exactly the stale-snapshot shape D80 and D77 are
      // both about, so we make it structurally impossible rather than argue it's unreachable.
      setRide(null);

      const [{ data: auth }, rideRes, starterRes] = await Promise.all([
        supabase.auth.getUser(),
        supabase
          .from('rides')
          // Single string literal — supabase-js infers row types from it.
          .select(
            'id, name, status, tenant_id, start_coords, finish_coords, qr_code, created_by, tenants(rail3_stopped_threshold_minutes, rail3_inactive_threshold_minutes, rail3_dark_threshold_minutes)',
          )
          .eq('id', rideId)
          .maybeSingle(),
        // D80 — started_by is read in its OWN query, and this query is ALLOWED TO FAIL.
        //
        // The client is untyped (lib/supabase.ts creates it with no Database generic), so a
        // column named in a select string is validated only by PostgREST, at runtime. If this
        // build ever runs against a database where the D80 migration has not been applied,
        // naming started_by in the main select would 400 the WHOLE ride read — and this hook
        // bails to `ride: null` on error, which means no map, no thresholds, no ride screen at
        // all. That is strictly worse than the defect D80 fixes: a degraded breadcrumb becomes
        // a dead ride.
        //
        // Isolating it means the worst case is a missing leader (breadcrumb draws nothing —
        // fail-closed, which is exactly what we want) while the ride itself still loads. Runs
        // in the same Promise.all, so it costs no extra latency on the happy path.
        supabase.from('rides').select('started_by').eq('id', rideId).maybeSingle(),
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
      // A failed started_by read (unmigrated DB) is indistinguishable from "not started" here,
      // and both mean the same thing to us: we have no recorded starter, so use the fallback.
      const startedBy = starterRes.error ? null : (starterRes.data?.started_by ?? null);
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
        // D80: resolved through the ONE shared rule (rideControlsLogic.rideLeaderId) so the
        // reader and the breadcrumb writer can never drift apart on who the leader is. A failed
        // started_by read (unmigrated DB) degrades to created_by, not to a broken ride.
        leaderId: rideLeaderId({ started_by: startedBy, created_by: row.created_by }),
        leaderSource: startedBy ? 'ride.started_by' : 'ride.created_by_fallback',
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
