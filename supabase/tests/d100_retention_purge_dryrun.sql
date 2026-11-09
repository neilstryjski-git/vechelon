-- D100 dry run: apply the retention purge inside a transaction, run it twice, report, and roll
-- back. Nothing persists. Run with:  psql "$DB_URL" -v ON_ERROR_STOP=1 -f <this file>
-- (or paste into the Management API with the migration prepended and the final RAISE as output).
BEGIN;
\i supabase/migrations/20261109010000_d100_location_retention_purge.sql
DO $$
DECLARE res jsonb; res2 jsonb; left_pos int; left_bc int; recent_bc int; active_young int; job int; old_job int; can_exec boolean;
BEGIN
  res  := public.rail3_retention_purge();
  res2 := public.rail3_retention_purge();
  SELECT count(*) INTO left_pos FROM ride_participants rp JOIN rides r ON r.id = rp.ride_id
   WHERE r.status = 'saved' AND r.actual_end < now() - interval '4 hours' AND (rp.last_lat IS NOT NULL OR rp.phone IS NOT NULL);
  SELECT count(*) FILTER (WHERE lat IS NOT NULL AND triggered_at <  now() - interval '30 days'),
         count(*) FILTER (WHERE lat IS NOT NULL AND triggered_at >= now() - interval '30 days')
    INTO left_bc, recent_bc FROM beacon_alerts;
  SELECT count(*) INTO active_young FROM rides
   WHERE status = 'active' AND COALESCE(actual_start, scheduled_start, created_at) >= now() - interval '24 hours';
  SELECT count(*) INTO job     FROM cron.job WHERE jobname = 'rail3-retention-purge';
  SELECT count(*) INTO old_job FROM cron.job WHERE jobname = 'rail3-breadcrumb-purge';
  SELECT has_function_privilege('authenticated', 'public.rail3_retention_purge()', 'EXECUTE') INTO can_exec;
  IF res2 <> jsonb_build_object('rides_auto_closed',0,'leader_routes_deleted',0,'participants_purged',0,
      'beacon_locations_cleared',0,'telemetry_full_capture_deleted',0,'telemetry_always_on_stripped',0)
     OR left_pos <> 0 OR left_bc <> 0 OR job <> 1 OR old_job <> 0 OR can_exec THEN
    RAISE EXCEPTION 'D100 dry run FAILED: run1=% run2=% left_pos=% left_bc=% job=% old_job=% authenticated_exec=%',
      res, res2, left_pos, left_bc, job, old_job, can_exec;
  END IF;
  RAISE NOTICE 'D100 dry run OK: run1=% | recent beacons kept=% | young active rides kept=%', res, recent_bc, active_young;
END $$;
ROLLBACK;
