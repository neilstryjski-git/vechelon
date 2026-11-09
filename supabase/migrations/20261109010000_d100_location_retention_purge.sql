-- D100: location retention, scheduled in the database (Sr PM decision 2026-11-09, option C).
--
-- Scenario 28 / Pillar II §5 (ratified): 4 hours after a ride ends, each participant's last
-- position is cleared. (The edge function also cleared the per-ride phone copy and set status
-- 'purged'; Sr PM 2026-11-09: leave the phone copy — this job clears POSITIONS ONLY and does
-- not change participant status.) The logic lived
-- only in the hard-purge-location edge function, whose cron entry was never scheduled
-- (supabase/tests/cron_verification.sql keeps it commented out), so the purge has never run.
-- On staging (which backs the Play open test), 47 ended-ride positions were still stored,
-- against privacy.html §4.
--
-- New rule (Sr PM, 2026-11-09): a Beacon's location is kept 30 days for safety follow-up, then the
-- coordinates are cleared. The alert row (who, when, cancel) stays as the audit record.
--
-- Design: one SECURITY DEFINER SQL function scheduled with pg_cron. It runs inside the database,
-- so no service-role key is stored in cron.job (scheduling the edge function would require that).
-- It covers the location part of hard-purge-location plus its W284 telemetry retention, and adds
-- the Beacon rule. The edge function stays callable for manual runs, and both are idempotent.
-- Active rides are never touched: only rides with status 'saved' and actual_end older than 4 hours.
--
-- supabase-patterns: no RLS policy or view is created (Patterns 1, 2, 7 n/a). Pattern 5: CREATE OR
-- REPLACE, plus unschedule-if-exists before scheduling.

CREATE EXTENSION IF NOT EXISTS pg_cron;

CREATE OR REPLACE FUNCTION public.rail3_retention_purge()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  n_participants integer := 0;
  n_beacons      integer := 0;
  n_tel_deleted  integer := 0;
  n_tel_stripped integer := 0;
BEGIN
  -- 1) Scenario 28: participants of rides that ended more than 4 hours ago.
  UPDATE public.ride_participants rp
     SET last_lat = NULL, last_long = NULL, last_ping = NULL
    FROM public.rides r
   WHERE r.id = rp.ride_id
     AND r.status = 'saved'
     AND r.actual_end < now() - interval '4 hours'
     AND (rp.last_lat IS NOT NULL OR rp.last_long IS NOT NULL OR rp.last_ping IS NOT NULL);
  GET DIAGNOSTICS n_participants = ROW_COUNT;

  -- 2) Beacon location: kept 30 days, then cleared (row kept as the audit record).
  IF to_regclass('public.beacon_alerts') IS NOT NULL THEN
    UPDATE public.beacon_alerts
       SET lat = NULL, long = NULL
     WHERE triggered_at < now() - interval '30 days'
       AND (lat IS NOT NULL OR long IS NOT NULL);
    GET DIAGNOSTICS n_beacons = ROW_COUNT;
  END IF;

  -- 3) W284 telemetry retention (Ledger §8.5), same as hard-purge-location: full-capture rows
  --    deleted at T+4h, always-on rows keep counters with identity stripped.
  IF to_regclass('public.rail3_telemetry_events') IS NOT NULL THEN
    DELETE FROM public.rail3_telemetry_events t
     USING public.rides r
     WHERE r.id = t.ride_id AND r.status = 'saved'
       AND r.actual_end < now() - interval '4 hours'
       AND t.tier = 'full_capture';
    GET DIAGNOSTICS n_tel_deleted = ROW_COUNT;

    UPDATE public.rail3_telemetry_events t
       SET account_id = NULL
      FROM public.rides r
     WHERE r.id = t.ride_id AND r.status = 'saved'
       AND r.actual_end < now() - interval '4 hours'
       AND t.tier = 'always_on' AND t.account_id IS NOT NULL;
    GET DIAGNOSTICS n_tel_stripped = ROW_COUNT;
  END IF;

  IF to_regclass('public.rail3_operator_config') IS NOT NULL THEN
    UPDATE public.rail3_operator_config c
       SET full_capture_ride_id = NULL
      FROM public.rides r
     WHERE r.id = c.full_capture_ride_id AND r.status = 'saved'
       AND r.actual_end < now() - interval '4 hours';
  END IF;

  RETURN jsonb_build_object(
    'participant_positions_cleared', n_participants,
    'beacon_locations_cleared', n_beacons,
    'telemetry_full_capture_deleted', n_tel_deleted,
    'telemetry_always_on_stripped', n_tel_stripped
  );
END;
$$;

REVOKE ALL ON FUNCTION public.rail3_retention_purge() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rail3_retention_purge() TO service_role;

-- Every 30 minutes, so a position is gone at most about 4.5 hours after the ride ends.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'rail3-retention-purge') THEN
    PERFORM cron.unschedule('rail3-retention-purge');
  END IF;
  PERFORM cron.schedule('rail3-retention-purge', '*/30 * * * *',
                        'SELECT public.rail3_retention_purge()');
END $$;
