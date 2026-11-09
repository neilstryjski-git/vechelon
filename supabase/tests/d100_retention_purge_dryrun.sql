-- D100 dry run: apply the retention purge inside a transaction, run it twice, report, and roll
-- back. Nothing persists. Run with:  psql "$DB_URL" -v ON_ERROR_STOP=1 -f <this file>
-- (or paste into the Management API with the migration prepended and the final RAISE as output).
BEGIN;
\i supabase/migrations/20261109010000_d100_location_retention_purge.sql
-- Synthetic stale ride (review r2): active, started 25h ago, with one participant position.
-- FK triggers off only for the fixture insert; everything rolls back.
SET session_replication_role = 'replica';
INSERT INTO rides (id, tenant_id, name, type, start_coords, qr_code, created_by, status, actual_start)
SELECT 'dddd0100-0000-0000-0000-000000000001', id, 'D100 stale fixture', 'adhoc', point(0,0),
       'd100-fixture', (SELECT id FROM accounts LIMIT 1), 'active', now() - interval '25 hours' FROM tenants LIMIT 1;
INSERT INTO ride_participants (ride_id, last_lat, last_long, last_ping, phone)
VALUES ('dddd0100-0000-0000-0000-000000000001', 1, 1, now() - interval '25 hours', '000');
SET session_replication_role = 'origin';

DO $$
DECLARE stale_status text; stale_auto boolean; stale_pos int; closed_events int; saved_no_end int;
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
  SELECT status::text, auto_closed INTO stale_status, stale_auto FROM rides WHERE id = 'dddd0100-0000-0000-0000-000000000001';
  SELECT count(*) INTO stale_pos FROM ride_participants WHERE ride_id = 'dddd0100-0000-0000-0000-000000000001' AND last_lat IS NOT NULL;
  SELECT count(*) INTO closed_events FROM analytics_events WHERE event_type = 'ride_closed'
     AND metadata->>'ride_id' = 'dddd0100-0000-0000-0000-000000000001' AND (metadata->>'auto_closed')::boolean;
  SELECT count(*) INTO saved_no_end FROM ride_participants rp JOIN rides r ON r.id = rp.ride_id
   WHERE r.status = 'saved' AND r.actual_end IS NULL AND (rp.last_lat IS NOT NULL OR rp.phone IS NOT NULL);
  -- The stale ride is auto-closed, emits one ride_closed event, and KEEPS its position this run
  -- (actual_end = now(), so its 4-hour clock has only just started).
  IF stale_status <> 'saved' OR NOT stale_auto OR stale_pos <> 1 OR closed_events <> 1 OR saved_no_end <> 0 THEN
    RAISE EXCEPTION 'D100 dry run FAILED (auto-close): status=% auto=% pos_kept=% events=% saved_without_end=%',
      stale_status, stale_auto, stale_pos, closed_events, saved_no_end;
  END IF;
  SELECT has_function_privilege('authenticated', 'public.rail3_retention_purge()', 'EXECUTE') INTO can_exec;
  IF (res->>'rides_auto_closed')::int < 1 OR res2 <> jsonb_build_object('rides_auto_closed',0,'leader_routes_deleted',0,'participants_purged',0,
      'beacon_locations_cleared',0,'telemetry_full_capture_deleted',0,'telemetry_always_on_stripped',0)
     OR left_pos <> 0 OR left_bc <> 0 OR job <> 1 OR old_job <> 0 OR can_exec THEN
    RAISE EXCEPTION 'D100 dry run FAILED: run1=% run2=% left_pos=% left_bc=% job=% old_job=% authenticated_exec=%',
      res, res2, left_pos, left_bc, job, old_job, can_exec;
  END IF;
  RAISE NOTICE 'D100 dry run OK: run1=% | recent beacons kept=% | young active rides kept=%', res, recent_bc, active_young;
END $$;
ROLLBACK;
