-- D100: location retention, scheduled in the database (Sr PM decision 2026-11-09, option C).
--
-- Scenario 28 / Pillar II §5 (ratified): 4 hours after a ride ends, each participant's last
-- position AND the per-ride phone copy are cleared (Sr PM 2026-11-09: purge the phone from the
-- ride; the profile phone stays and is copied to a ride roster as needed). Participant status
-- is left unchanged (the edge function also set 'purged'; not needed for retention). The logic lived
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
-- It covers hard-purge-location's participant purge (positions + per-ride phone) and its W284
-- telemetry retention, and adds the Beacon rule. The hard-purge-location edge function is
-- SUPERSEDED by this job: don't run it by hand (it also sets participant status 'purged', which
-- this job deliberately does not).
-- Active rides are never touched: only rides with status 'saved' and actual_end older than 4 hours.
--
-- Review r1 additions:
--  * Rides nobody ends would keep positions forever (auto-close-rides is not scheduled either), so
--    this job also ends any ride still 'active' 24 hours after it started (status 'saved',
--    actual_end = now(), auto_closed = true). That fires the existing ride_closed analytics event
--    with auto_closed = true, which it already supports. This is a safety net, not Scenario 29's
--    midnight close.
--  * The leader-route purge (rail3-breadcrumb-purge) existed only as a hand-applied staging cron
--    job. Its rule (delete rail3_breadcrumb rows not updated for 4 hours) is folded in here, so the
--    privacy-policy claim rests on versioned code, and the hand-made job is unscheduled.
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
  n_auto_closed  integer := 0;
  n_routes       integer := 0;
  n_participants integer := 0;
  n_beacons      integer := 0;
  n_tel_deleted  integer := 0;
  n_tel_stripped integer := 0;
BEGIN
  -- 0) Safety net: end rides left running 24 hours after they started, so they reach step 1.
  UPDATE public.rides
     SET status = 'saved', actual_end = now(), auto_closed = true
   WHERE status = 'active'
     AND COALESCE(actual_start, scheduled_start, created_at) < now() - interval '24 hours';
  GET DIAGNOSTICS n_auto_closed = ROW_COUNT;

  -- 1) Scenario 28: participants of rides that ended more than 4 hours ago.
  UPDATE public.ride_participants rp
     SET last_lat = NULL, last_long = NULL, last_ping = NULL, phone = NULL
    FROM public.rides r
   WHERE r.id = rp.ride_id
     AND r.status = 'saved'
     AND r.actual_end < now() - interval '4 hours'
     AND (rp.last_lat IS NOT NULL OR rp.last_long IS NOT NULL OR rp.last_ping IS NOT NULL
          OR rp.phone IS NOT NULL);
  GET DIAGNOSTICS n_participants = ROW_COUNT;

  -- 1b) Leader route (W234 rail3_breadcrumb): deleted 4 hours after its last update.
  IF to_regclass('public.rail3_breadcrumb') IS NOT NULL THEN
    DELETE FROM public.rail3_breadcrumb WHERE updated_at < now() - interval '4 hours';
    GET DIAGNOSTICS n_routes = ROW_COUNT;
  END IF;

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
    'rides_auto_closed', n_auto_closed,
    'leader_routes_deleted', n_routes,
    'participants_purged', n_participants,
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
  -- Superseded hand-applied staging job (same rule now lives in rail3_retention_purge).
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'rail3-breadcrumb-purge') THEN
    PERFORM cron.unschedule('rail3-breadcrumb-purge');
  END IF;
  PERFORM cron.schedule('rail3-retention-purge', '*/30 * * * *',
                        'SELECT public.rail3_retention_purge()');
END $$;
