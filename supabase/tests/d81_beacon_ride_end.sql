-- D81 regression test: a Beacon must not outlive its ride, and only the server writes the close
-- reason. Runs in one transaction and rolls back; nothing persists. Needs a database with the
-- Rail 3 schema and both D81 migrations applied (staging, or a local stack from rail3-integration).
-- Run with:  psql "$DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/d81_beacon_ride_end.sql
-- (or send it as one Management API query). Any failed check raises and aborts.
BEGIN;

-- Fixtures: six active rides in a tenant that has an affiliated member, one open Beacon each,
-- and that member's participant row with beacon_active = true. FK triggers off for fixtures only.
CREATE TEMP TABLE d81_fx ON COMMIT DROP AS
SELECT at.account_id AS member, at.tenant_id AS tenant
  FROM public.account_tenants at WHERE at.status = 'affiliated' LIMIT 1;

SET session_replication_role = 'replica';
INSERT INTO public.rides (id, tenant_id, name, type, start_coords, qr_code, created_by, status, actual_start)
SELECT v.id::uuid, f.tenant, 'D81 fixture ' || v.n, 'adhoc', point(0,0), 'd81-fx-' || v.n, f.member, 'active', now()
  FROM d81_fx f, (VALUES ('dddd0081-0000-0000-0000-000000000001','sys'),
                         ('dddd0081-0000-0000-0000-000000000002','cap'),
                         ('dddd0081-0000-0000-0000-000000000003','api'),
                         ('dddd0081-0000-0000-0000-000000000004','apiend'),
                         ('dddd0081-0000-0000-0000-000000000005','multi'),
                         ('dddd0081-0000-0000-0000-000000000006','empty')) v(id, n);
INSERT INTO public.beacon_alerts (id, tenant_id, ride_id, rider_id, lat, long)
SELECT ('eeee0081-0000-0000-0000-00000000000' || n)::uuid, f.tenant,
       ('dddd0081-0000-0000-0000-00000000000' || n)::uuid, f.member, 1, 1
  FROM d81_fx f, generate_series(1,4) n;
-- Ride 5: two open Beacons plus one a person already cancelled (must keep its actor/time).
INSERT INTO public.beacon_alerts (id, tenant_id, ride_id, rider_id, lat, long, beacon_cancelled_at, beacon_cancelled_by)
SELECT v.id::uuid, f.tenant, 'dddd0081-0000-0000-0000-000000000005', f.member, 1, 1, v.at, v.by
  FROM d81_fx f, (VALUES ('eeee0081-0000-0000-0000-000000000051', NULL::timestamptz, NULL::uuid),
                         ('eeee0081-0000-0000-0000-000000000052', NULL, NULL),
                         ('eeee0081-0000-0000-0000-000000000053', '2026-01-01T00:00:00Z', (SELECT member FROM d81_fx))) v(id, at, by);
INSERT INTO public.ride_participants (ride_id, account_id, beacon_active)
SELECT ('dddd0081-0000-0000-0000-00000000000' || n)::uuid, f.member, true
  FROM d81_fx f, generate_series(1,4) n;
SET session_replication_role = 'origin';

DO $$
DECLARE fx record; b record; flag boolean; caught boolean;
BEGIN
  SELECT * INTO fx FROM d81_fx;
  IF fx.member IS NULL THEN RAISE EXCEPTION 'D81 test setup: no affiliated member to use'; END IF;

  -- 1. System ride end (no signed-in user): closed, reason ride_ended, no actor, flag cleared.
  PERFORM set_config('request.jwt.claims', '', true);
  UPDATE public.rides SET status = 'saved', actual_end = now() WHERE id = 'dddd0081-0000-0000-0000-000000000001';
  SELECT * INTO b FROM public.beacon_alerts WHERE id = 'eeee0081-0000-0000-0000-000000000001';
  SELECT beacon_active INTO flag FROM public.ride_participants WHERE ride_id = 'dddd0081-0000-0000-0000-000000000001';
  IF b.beacon_cancelled_at IS NULL OR b.beacon_cancel_reason IS DISTINCT FROM 'ride_ended'
     OR b.beacon_cancelled_by IS NOT NULL OR flag THEN
    RAISE EXCEPTION 'D81 FAILED (system end): at=% reason=% by=% flag=%', b.beacon_cancelled_at, b.beacon_cancel_reason, b.beacon_cancelled_by, flag;
  END IF;

  -- 2. A person ends the ride: that person is the actor.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', fx.member, 'role', 'authenticated')::text, true);
  UPDATE public.rides SET status = 'saved', actual_end = now() WHERE id = 'dddd0081-0000-0000-0000-000000000002';
  SELECT * INTO b FROM public.beacon_alerts WHERE id = 'eeee0081-0000-0000-0000-000000000002';
  IF b.beacon_cancel_reason IS DISTINCT FROM 'ride_ended' OR b.beacon_cancelled_by IS DISTINCT FROM fx.member THEN
    RAISE EXCEPTION 'D81 FAILED (person end): reason=% by=% expected=%', b.beacon_cancel_reason, b.beacon_cancelled_by, fx.member;
  END IF;
  PERFORM set_config('request.jwt.claims', '', true);

  -- 3. Late Beacon on an ended ride arrives closed.
  INSERT INTO public.beacon_alerts (id, tenant_id, ride_id, rider_id, lat, long)
  VALUES ('eeee0081-0000-0000-0000-000000000009', fx.tenant, 'dddd0081-0000-0000-0000-000000000001', fx.member, 1, 1);
  SELECT * INTO b FROM public.beacon_alerts WHERE id = 'eeee0081-0000-0000-0000-000000000009';
  IF b.beacon_cancelled_at IS NULL OR b.beacon_cancel_reason IS DISTINCT FROM 'ride_ended' THEN
    RAISE EXCEPTION 'D81 FAILED (late beacon): at=% reason=%', b.beacon_cancelled_at, b.beacon_cancel_reason;
  END IF;

  -- 4. Late beacon_active re-assert on an ended ride is coerced back to false.
  UPDATE public.ride_participants SET beacon_active = true WHERE ride_id = 'dddd0081-0000-0000-0000-000000000001';
  SELECT beacon_active INTO flag FROM public.ride_participants WHERE ride_id = 'dddd0081-0000-0000-0000-000000000001';
  IF flag THEN RAISE EXCEPTION 'D81 FAILED (flag re-assert on ended ride stayed true)'; END IF;
  -- ...but an active ride still accepts it.
  UPDATE public.ride_participants SET beacon_active = true WHERE ride_id = 'dddd0081-0000-0000-0000-000000000003';
  SELECT beacon_active INTO flag FROM public.ride_participants WHERE ride_id = 'dddd0081-0000-0000-0000-000000000003';
  IF NOT flag THEN RAISE EXCEPTION 'D81 FAILED (flag on an active ride was cleared)'; END IF;

  -- 4b. A status write that stays 'active' is a no-op; ending a ride with several Beacons closes
  --     every open one and leaves a person's earlier cancel untouched; a ride with no Beacons ends cleanly.
  UPDATE public.rides SET status = 'active' WHERE id = 'dddd0081-0000-0000-0000-000000000005';
  IF EXISTS (SELECT 1 FROM public.beacon_alerts WHERE ride_id = 'dddd0081-0000-0000-0000-000000000005'
              AND beacon_cancel_reason IS NOT NULL) THEN
    RAISE EXCEPTION 'D81 FAILED (active -> active closed a Beacon)';
  END IF;
  UPDATE public.rides SET status = 'saved', actual_end = now() WHERE id = 'dddd0081-0000-0000-0000-000000000005';
  IF (SELECT count(*) FROM public.beacon_alerts WHERE ride_id = 'dddd0081-0000-0000-0000-000000000005'
       AND beacon_cancel_reason = 'ride_ended' AND beacon_cancelled_at IS NOT NULL) <> 2 THEN
    RAISE EXCEPTION 'D81 FAILED (not every open Beacon on a multi-Beacon ride was closed)';
  END IF;
  SELECT * INTO b FROM public.beacon_alerts WHERE id = 'eeee0081-0000-0000-0000-000000000053';
  IF b.beacon_cancel_reason IS NOT NULL OR b.beacon_cancelled_by IS DISTINCT FROM fx.member
     OR b.beacon_cancelled_at <> '2026-01-01T00:00:00Z'::timestamptz THEN
    RAISE EXCEPTION 'D81 FAILED (a person''s earlier cancel was overwritten): reason=% by=% at=%', b.beacon_cancel_reason, b.beacon_cancelled_by, b.beacon_cancelled_at;
  END IF;
  UPDATE public.rides SET status = 'saved', actual_end = now() WHERE id = 'dddd0081-0000-0000-0000-000000000006';

  -- 5. Trigger functions are not callable through the API.
  IF has_function_privilege('authenticated', 'public.rail3_close_beacons_on_ride_end()', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.rail3_close_late_beacon()', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.rail3_guard_beacon_cancel_reason()', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.rail3_no_beacon_flag_after_ride_end()', 'EXECUTE') THEN
    RAISE EXCEPTION 'D81 FAILED (authenticated can EXECUTE a D81 trigger function)';
  END IF;
END $$;

-- 6. As an affiliated member over the API role: the app's own cancel still works, but writing
--    beacon_cancel_reason is refused (insert and update) by the guard itself (checked by its
--    message, because an RLS refusal shares SQLSTATE 42501).
SELECT set_config('request.jwt.claims', json_build_object('sub', member, 'role', 'authenticated')::text, true) FROM d81_fx;
SET LOCAL ROLE authenticated;
DO $$
DECLARE caught boolean; n int; me uuid := auth.uid(); t uuid;
BEGIN
  SELECT tenant_id INTO t FROM public.beacon_alerts WHERE id = 'eeee0081-0000-0000-0000-000000000003';
  UPDATE public.beacon_alerts SET beacon_cancelled_at = now(), beacon_cancelled_by = me
   WHERE id = 'eeee0081-0000-0000-0000-000000000003';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN RAISE EXCEPTION 'D81 FAILED (app cancel path updated % rows, expected 1)', n; END IF;

  caught := false;
  BEGIN
    UPDATE public.beacon_alerts SET beacon_cancel_reason = 'ride_ended' WHERE id = 'eeee0081-0000-0000-0000-000000000003';
  EXCEPTION WHEN insufficient_privilege THEN caught := SQLERRM LIKE '%server only%';
  END;
  IF NOT caught THEN RAISE EXCEPTION 'D81 FAILED (authenticated UPDATE of beacon_cancel_reason was allowed)'; END IF;

  caught := false;
  BEGIN
    INSERT INTO public.beacon_alerts (tenant_id, ride_id, rider_id, lat, long, beacon_cancelled_at, beacon_cancel_reason)
    VALUES (t, 'dddd0081-0000-0000-0000-000000000003', me, 1, 1, now(), 'ride_ended');
  EXCEPTION WHEN insufficient_privilege THEN caught := SQLERRM LIKE '%server only%';
  END;
  IF NOT caught THEN RAISE EXCEPTION 'D81 FAILED (authenticated INSERT with beacon_cancel_reason was allowed)'; END IF;

  -- The ride creator ends ride 4 through the API: the D81 trigger closes its Beacon (the guard
  -- lets the SECURITY DEFINER trigger through) with the creator as actor.
  UPDATE public.rides SET status = 'saved', actual_end = now() WHERE id = 'dddd0081-0000-0000-0000-000000000004';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN RAISE EXCEPTION 'D81 FAILED (API ride end updated % rides, expected 1)', n; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.beacon_alerts WHERE id = 'eeee0081-0000-0000-0000-000000000004'
                  AND beacon_cancel_reason = 'ride_ended' AND beacon_cancelled_by = me) THEN
    RAISE EXCEPTION 'D81 FAILED (API ride end did not close the Beacon with the ender as actor)';
  END IF;

  -- The app inserts a late Beacon (no reason) on that ended ride: accepted, and it arrives closed.
  INSERT INTO public.beacon_alerts (id, tenant_id, ride_id, rider_id, lat, long)
  VALUES ('eeee0081-0000-0000-0000-000000000049', t, 'dddd0081-0000-0000-0000-000000000004', me, 1, 1);
  IF NOT EXISTS (SELECT 1 FROM public.beacon_alerts WHERE id = 'eeee0081-0000-0000-0000-000000000049'
                  AND beacon_cancel_reason = 'ride_ended' AND beacon_cancelled_at IS NOT NULL) THEN
    RAISE EXCEPTION 'D81 FAILED (late Beacon from the app was not closed)';
  END IF;

  RAISE NOTICE 'D81 regression test OK';
END $$;
RESET ROLE;

ROLLBACK;
