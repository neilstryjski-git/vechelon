-- W308: role-simulated check of the Rail 3 app's data paths (club, ride list, join,
-- roster, leave) for a signed-in member. It does what the app's queries do, as the
-- `authenticated` role with the member's id as auth.uid().
--
-- SAFE TO RUN AGAINST ANY PROJECT: one transaction that ends in ROLLBACK. It needs
-- one tenant with an affiliated non-admin member. It is not a device test: it does
-- not cover the OTP email, the app build or Realtime.
--
-- Run (one row per case: test | expected | outcome | pass):
--   Management API  POST /v1/projects/<ref>/database/query  {"query": <this file>}
--   or: psql "$DB_URL" -f supabase/tests/w308_app_data_paths.sql
--
-- Every row must have pass = true.

BEGIN;

CREATE TEMP TABLE _r (test text, expected text, outcome text);
CREATE TEMP TABLE _fx (k text PRIMARY KEY, v uuid);
GRANT ALL ON _r, _fx TO anon, authenticated;

-- Member M: affiliated, not an admin anywhere. T is M's club. R is a throwaway ride.
INSERT INTO _fx
SELECT 'm', at.account_id FROM public.account_tenants at
WHERE at.role = 'member' AND at.status = 'affiliated'
  AND at.account_id NOT IN (SELECT account_id FROM public.account_tenants WHERE role = 'admin')
ORDER BY at.joined_at LIMIT 1;
INSERT INTO _fx SELECT 't', tenant_id FROM public.account_tenants
  WHERE account_id = (SELECT v FROM _fx WHERE k='m') AND status = 'affiliated' LIMIT 1;
INSERT INTO _fx SELECT 'a', account_id FROM public.account_tenants
  WHERE tenant_id = (SELECT v FROM _fx WHERE k='t') AND role = 'admin' AND status = 'affiliated' LIMIT 1;
INSERT INTO _fx VALUES ('r', 'aaaaaaaa-0000-4000-8000-000000000308');

INSERT INTO public.rides (id, tenant_id, name, created_by, status, type, start_coords, qr_code)
VALUES ((SELECT v FROM _fx WHERE k='r'), (SELECT v FROM _fx WHERE k='t'), 'w308 smoke',
        (SELECT v FROM _fx WHERE k='a'), 'created', 'adhoc', point(0,0), '');

CREATE FUNCTION pg_temp.count_as(p_role text, p_uid uuid, p_test text, p_expected text, p_sql text)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE v_n bigint; v_out text;
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', p_role)::text, true);
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
  m uuid := (SELECT v FROM _fx WHERE k='m');
  t uuid := (SELECT v FROM _fx WHERE k='t');
  r uuid := (SELECT v FROM _fx WHERE k='r');
BEGIN
  INSERT INTO _r SELECT '00 precondition: an affiliated non-admin member exists', '>0', (SELECT count(*) FROM _fx WHERE k IN ('m','t'))::text;

  -- Club resolution (club/ClubContext.tsx) and branding (theme/ThemeProvider.tsx)
  PERFORM pg_temp.count_as('authenticated', m, '01 member reads own memberships', '>0',
    format($q$SELECT count(*) FROM account_tenants WHERE account_id = %L$q$, m));
  PERFORM pg_temp.count_as('anon', NULL, '02 anon reads club branding', '1',
    format($q$SELECT count(*) FROM tenants WHERE id = %L$q$, t));
  PERFORM pg_temp.count_as('authenticated', m, '03 member reads own account', '1',
    format($q$SELECT count(*) FROM accounts WHERE id = %L$q$, m));

  -- Ride list (screens/HomeScreen.tsx)
  PERFORM pg_temp.count_as('authenticated', m, '04 member lists rides of own club', '>0',
    format($q$SELECT count(*) FROM rides WHERE tenant_id = %L$q$, t));

  -- Join (lib/rideJoin.ts): the same insert the app sends
  PERFORM pg_temp.count_as('authenticated', m, '05 member joins a ride', '1',
    format($q$WITH i AS (INSERT INTO ride_participants (ride_id, account_id, role, status, rail3_joined_at)
                         VALUES (%L, %L, 'member', 'rsvpd', now()) RETURNING 1) SELECT count(*) FROM i$q$, r, m));
  PERFORM pg_temp.count_as('authenticated', m, '06 member stamps own row (markRail3Rejoined shape)', '1',
    format($q$WITH u AS (UPDATE ride_participants SET rail3_joined_at = now() WHERE ride_id = %L AND account_id = %L RETURNING 1) SELECT count(*) FROM u$q$, r, m));

  -- Roster (screens/RosterScreen.tsx): participant rows of the ride
  PERFORM pg_temp.count_as('authenticated', m, '07 member reads the roster', '>0',
    format($q$SELECT count(*) FROM ride_participants WHERE ride_id = %L$q$, r));
  PERFORM pg_temp.count_as('authenticated', m, '08 roster rows carry the role and joined stamp', '1',
    format($q$SELECT count(*) FROM ride_participants WHERE ride_id = %L AND account_id = %L AND role = 'member' AND rail3_joined_at IS NOT NULL$q$, r, m));

  -- Leave (20260702000000: a rider may delete their own RSVP row)
  PERFORM pg_temp.count_as('authenticated', m, '09 member cancels own RSVP', '1',
    format($q$WITH d AS (DELETE FROM ride_participants WHERE ride_id = %L AND account_id = %L RETURNING 1) SELECT count(*) FROM d$q$, r, m));
END $$;

SELECT test, expected, outcome,
       CASE expected
         WHEN '>0' THEN outcome ~ '^[0-9]+$' AND outcome::bigint > 0
         ELSE outcome = expected
       END AS pass
FROM _r ORDER BY test;

ROLLBACK;
