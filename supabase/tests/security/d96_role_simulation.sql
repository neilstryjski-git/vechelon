-- D96 security regression: role-simulated checks for the 2026-10-30 audit findings.
--
-- SAFE TO RUN AGAINST ANY PROJECT: everything runs in ONE transaction that ends
-- in ROLLBACK. It needs one tenant with an affiliated admin AND an affiliated
-- non-admin member; it creates a throwaway second tenant inside the transaction.
--
-- Run (returns one row per case: test | expected | outcome | pass):
--   Management API  POST /v1/projects/<ref>/database/query  {"query": <this file>}
--   or: psql "$DB_URL" -f supabase/tests/security/d96_role_simulation.sql
--
-- Every row must have pass = true.

BEGIN;

CREATE TEMP TABLE _r (test text, expected text, outcome text);
CREATE TEMP TABLE _fx (k text PRIMARY KEY, v uuid);
GRANT ALL ON _r, _fx TO anon, authenticated;

-- Fixtures: tenant T with admin A + member M (both affiliated, M not admin) and a
-- second affiliated member B.
INSERT INTO _fx
SELECT 't', a.tenant_id FROM public.account_tenants a
WHERE a.role = 'admin' AND a.status = 'affiliated'
  AND EXISTS (SELECT 1 FROM public.account_tenants m
              WHERE m.tenant_id = a.tenant_id AND m.role = 'member' AND m.status = 'affiliated')
LIMIT 1;
INSERT INTO _fx SELECT 'a', account_id FROM public.account_tenants
  WHERE tenant_id = (SELECT v FROM _fx WHERE k='t') AND role='admin' AND status='affiliated' LIMIT 1;
INSERT INTO _fx SELECT 'm', account_id FROM public.account_tenants
  WHERE tenant_id = (SELECT v FROM _fx WHERE k='t') AND role='member' AND status='affiliated'
    AND account_id NOT IN (SELECT account_id FROM public.account_tenants WHERE role='admin')
  ORDER BY joined_at LIMIT 1;
INSERT INTO _fx SELECT 'b', account_id FROM public.account_tenants
  WHERE tenant_id = (SELECT v FROM _fx WHERE k='t') AND role='member' AND status='affiliated'
    AND account_id <> (SELECT v FROM _fx WHERE k='m')
  ORDER BY joined_at LIMIT 1;
INSERT INTO _fx VALUES
  ('t2', 'bbbbbbbb-0000-4000-8000-0000000000d6'),
  ('r2', 'aaaaaaaa-0000-4000-8000-0000000000d2'),  -- in T, created by admin A
  ('r3', 'aaaaaaaa-0000-4000-8000-0000000000d3'),  -- in T, created by member M (ad hoc)
  ('r4', 'aaaaaaaa-0000-4000-8000-0000000000d4');  -- in T2 (foreign club)

INSERT INTO public.tenants (id, slug, name, primary_color, accent_color)
VALUES ((SELECT v FROM _fx WHERE k='t2'), 'zz-d96-regression', 'D96 Regression Club', '#111111', '#222222');

INSERT INTO public.rides (id, tenant_id, name, created_by, status, type, start_coords, qr_code)
SELECT (SELECT v FROM _fx WHERE k=x.r), (SELECT v FROM _fx WHERE k=x.t), 'd96 ' || x.r,
       (SELECT v FROM _fx WHERE k=x.c), 'created', 'adhoc', point(0,0), ''
FROM (VALUES ('r2','t','a'), ('r3','t','m'), ('r4','t2','a')) AS x(r,t,c);

-- participant_update_policy only lets the row owner or ride CREW update rows, so
-- admin A must be crew on r2 for cases 09/10 to reach the trigger at all
-- (otherwise RLS filters the UPDATE to 0 rows and nothing is tested).
INSERT INTO public.ride_participants (ride_id, account_id, role, status, email)
VALUES ((SELECT v FROM _fx WHERE k='r2'), (SELECT v FROM _fx WHERE k='a'), 'captain', 'rsvpd', 'd96-fx-admin@test.invalid');

-- Run `stmt` as an API role with `uid` as auth.uid(); record ALLOWED/BLOCKED.
CREATE FUNCTION pg_temp.try_as(p_role text, p_uid uuid, p_test text, p_expected text, p_stmt text)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE v_out text; v_n bigint;
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', p_uid, 'role', p_role)::text, true);
  PERFORM set_config('role', p_role, true);
  BEGIN
    EXECUTE p_stmt;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    -- A statement RLS filtered to zero rows never reached the guard: that is
    -- neither ALLOWED nor BLOCKED, so it must fail either expectation.
    v_out := CASE WHEN v_n = 0 THEN 'NO-OP (0 rows — RLS filtered, guard not exercised)' ELSE 'ALLOWED' END;
  EXCEPTION WHEN others THEN
    v_out := 'BLOCKED: ' || SQLERRM;
  END;
  PERFORM set_config('role', 'none', true);
  INSERT INTO _r VALUES (p_test, p_expected, v_out);
END $$;

-- Same, but records a single scalar the statement returns.
CREATE FUNCTION pg_temp.count_as(p_role text, p_uid uuid, p_test text, p_expected text, p_sql text)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE v_n bigint; v_out text;
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', p_uid, 'role', p_role)::text, true);
  PERFORM set_config('role', p_role, true);
  BEGIN
    EXECUTE p_sql INTO v_n;
    v_out := v_n::text;
  EXCEPTION WHEN others THEN
    v_out := 'BLOCKED: ' || SQLERRM;
  END;
  PERFORM set_config('role', 'none', true);
  INSERT INTO _r VALUES (p_test, p_expected, v_out);
END $$;

DO $$
DECLARE
  t uuid := (SELECT v FROM _fx WHERE k='t');   t2 uuid := (SELECT v FROM _fx WHERE k='t2');
  a uuid := (SELECT v FROM _fx WHERE k='a');   m uuid := (SELECT v FROM _fx WHERE k='m');
  b uuid := (SELECT v FROM _fx WHERE k='b');
  r2 uuid := (SELECT v FROM _fx WHERE k='r2'); r3 uuid := (SELECT v FROM _fx WHERE k='r3');
  r4 uuid := (SELECT v FROM _fx WHERE k='r4');
BEGIN
  -- (c) ride_participants command-role guard
  PERFORM pg_temp.try_as('authenticated', m, '01 member self-inserts CAPTAIN on own-club ride', 'BLOCKED',
    format($q$INSERT INTO ride_participants (ride_id, account_id, role, status, email) VALUES (%L,%L,'captain','rsvpd','d96-01@test.invalid')$q$, r2, m));
  PERFORM pg_temp.try_as('authenticated', m, '02 member self-inserts SUPPORT on foreign-club ride', 'BLOCKED',
    format($q$INSERT INTO ride_participants (ride_id, account_id, role, status, email) VALUES (%L,%L,'support','rsvpd','d96-02@test.invalid')$q$, r4, m));
  PERFORM pg_temp.try_as('authenticated', m, '03 member self-inserts MEMBER on own-club ride', 'ALLOWED',
    format($q$INSERT INTO ride_participants (ride_id, account_id, role, status, email) VALUES (%L,%L,'member','rsvpd','d96-03@test.invalid')$q$, r2, m));
  PERFORM pg_temp.try_as('authenticated', m, '04 member updates own row to CAPTAIN', 'BLOCKED',
    format($q$UPDATE ride_participants SET role='captain' WHERE ride_id=%L AND account_id=%L$q$, r2, m));
  PERFORM pg_temp.try_as('authenticated', m, '05 member moves own row to another ride', 'BLOCKED',
    format($q$UPDATE ride_participants SET ride_id=%L WHERE ride_id=%L AND account_id=%L$q$, r3, r2, m));
  PERFORM pg_temp.try_as('authenticated', m, '06 member benign own-row update', 'ALLOWED',
    format($q$UPDATE ride_participants SET status=status WHERE ride_id=%L AND account_id=%L$q$, r2, m));
  PERFORM pg_temp.try_as('authenticated', m, '07 ride creator self-inserts CAPTAIN (Rail 3 ad hoc)', 'ALLOWED',
    format($q$INSERT INTO ride_participants (ride_id, account_id, role, status, email) VALUES (%L,%L,'captain','rsvpd','d96-07@test.invalid')$q$, r3, m));
  PERFORM pg_temp.try_as('authenticated', a, '08 club admin adds member as SUPPORT', 'ALLOWED',
    format($q$INSERT INTO ride_participants (ride_id, account_id, role, status, email) VALUES (%L,%L,'support','rsvpd','d96-08@test.invalid')$q$, r2, b));
  PERFORM pg_temp.try_as('authenticated', a, '09 club admin promotes member row to CAPTAIN', 'ALLOWED',
    format($q$UPDATE ride_participants SET role='captain' WHERE ride_id=%L AND account_id=%L$q$, r2, m));
  PERFORM pg_temp.try_as('authenticated', a, '10 club admin moves a captain row to a FOREIGN-club ride', 'BLOCKED',
    format($q$UPDATE ride_participants SET ride_id=%L WHERE ride_id=%L AND account_id=%L$q$, r4, r2, m));

  -- (c) rides tenant scope
  PERFORM pg_temp.try_as('authenticated', m, '11 member creates a ride in a FOREIGN club', 'BLOCKED',
    format($q$INSERT INTO rides (tenant_id, name, created_by, status, type, start_coords, qr_code) VALUES (%L,'x',%L,'created','adhoc',point(0,0),'')$q$, t2, m));
  PERFORM pg_temp.try_as('authenticated', m, '12 member creates an ad hoc ride in OWN club', 'ALLOWED',
    format($q$INSERT INTO rides (tenant_id, name, created_by, status, type, start_coords, qr_code) VALUES (%L,'x',%L,'created','adhoc',point(0,0),'')$q$, t, m));
  PERFORM pg_temp.try_as('authenticated', m, '13 ride creator re-homes own ride into a FOREIGN club', 'BLOCKED',
    format($q$UPDATE rides SET tenant_id=%L WHERE id=%L$q$, t2, r3));

  -- (c) crew rows no longer world-readable
  PERFORM pg_temp.count_as('anon', NULL, '14 anon: captain/support rows visible', '0',
    $q$SELECT count(*) FROM ride_participants WHERE role IN ('captain','support')$q$);
  PERFORM pg_temp.count_as('authenticated', m, '15 member: crew rows visible on own-club ride (>0)', '>0',
    format($q$SELECT count(*) FROM ride_participants WHERE ride_id=%L AND role IN ('captain','support')$q$, r2));

  -- (e) member directory
  PERFORM pg_temp.count_as('authenticated', m, '16 member: other members'' full accounts rows', '0',
    format($q$SELECT count(*) FROM accounts WHERE id <> %L$q$, m));
  PERFORM pg_temp.count_as('authenticated', m, '17 member: directory RPC rows for own club (>0)', '>0',
    format($q$SELECT count(*) FROM get_member_directory(%L)$q$, t));
  PERFORM pg_temp.count_as('authenticated', m, '18 member: directory RPC rows for foreign club', '0',
    format($q$SELECT count(*) FROM get_member_directory(%L)$q$, t2));
  PERFORM pg_temp.try_as('anon', NULL, '19 anon calls directory RPC', 'BLOCKED',
    format($q$SELECT get_member_directory(%L)$q$, t));
  PERFORM pg_temp.count_as('authenticated', a, '20 admin: member accounts rows via account_admin_select (>0)', '>0',
    format($q$SELECT count(*) FROM accounts WHERE id <> %L$q$, a));

  -- (e) Rail 3 roster contacts RPC
  PERFORM pg_temp.count_as('authenticated', a, '21 admin: roster contacts for own-club ride (>0)', '>0',
    format($q$SELECT count(*) FROM get_ride_roster_contacts(%L)$q$, r2));
  PERFORM pg_temp.count_as('authenticated', b, '22 crew-less member: roster contacts', '0',
    format($q$SELECT count(*) FROM get_ride_roster_contacts(%L)$q$, r3));

  -- Step A
  PERFORM pg_temp.try_as('authenticated', m, '23 member sets own platform_admin', 'BLOCKED',
    format($q$UPDATE accounts SET platform_admin=true WHERE id=%L$q$, m));
  PERFORM pg_temp.try_as('anon', NULL, '24 anon calls get_rider_hash_secret', 'BLOCKED',
    $q$SELECT get_rider_hash_secret()$q$);
  PERFORM pg_temp.count_as('anon', NULL, '25 anon: gpx-routes objects visible', '0',
    $q$SELECT count(*) FROM storage.objects WHERE bucket_id='gpx-routes'$q$);
END $$;

SELECT test, expected, outcome,
       CASE expected
         WHEN 'ALLOWED' THEN outcome = 'ALLOWED'
         WHEN 'BLOCKED' THEN outcome LIKE 'BLOCKED%'
         WHEN '>0'      THEN outcome ~ '^[0-9]+$' AND outcome::bigint > 0
         ELSE outcome = expected
       END AS pass
FROM _r ORDER BY test;

ROLLBACK;
