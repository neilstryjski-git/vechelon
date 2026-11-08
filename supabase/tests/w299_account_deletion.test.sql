-- =====================================================================
-- W299 — account self-deletion gate (runs in CI against the EPHEMERAL local stack).
--
-- ON_ERROR_STOP=1: any RAISE EXCEPTION below fails the job. Everything runs inside one
-- transaction that is ROLLED BACK, so fixtures never persist. Each expected-failure case
-- runs in its own SAVEPOINT.
--
-- Not covered here: the Rail 3 branches (rides.started_by, beacon_alerts,
-- rail3_sag_allowlist). This CI stack runs master's migrations, which have no Rail 3
-- schema; those branches are checked on staging before W299 closes.
-- =====================================================================
BEGIN;
SET client_min_messages = warning;

-- ── 1. Grants: service_role only ────────────────────────────────────────────────────────
DO $$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY['public.delete_account_data(uuid)', 'public.account_deletion_preflight(uuid)',
                           'public.register_system_owner(uuid)'] LOOP
    IF to_regprocedure(f) IS NULL THEN RAISE EXCEPTION 'W299 gate FAILED: % missing', f; END IF;
    IF has_function_privilege('anon', f, 'EXECUTE') THEN
      RAISE EXCEPTION 'W299 gate FAILED: anon can EXECUTE %', f;
    END IF;
    IF has_function_privilege('authenticated', f, 'EXECUTE') THEN
      RAISE EXCEPTION 'W299 gate FAILED: authenticated can EXECUTE %', f;
    END IF;
    IF NOT has_function_privilege('service_role', f, 'EXECUTE') THEN
      RAISE EXCEPTION 'W299 gate FAILED: service_role cannot EXECUTE %', f;
    END IF;
  END LOOP;
  IF has_table_privilege('anon', 'public.tenant_system_owners', 'SELECT')
     OR has_table_privilege('authenticated', 'public.tenant_system_owners', 'SELECT') THEN
    RAISE EXCEPTION 'W299 gate FAILED: an API role can read tenant_system_owners';
  END IF;
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.tenant_system_owners'::regclass)
     OR EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'tenant_system_owners') THEN
    RAISE EXCEPTION 'W299 gate FAILED: tenant_system_owners must have RLS on and no policies';
  END IF;
  RAISE NOTICE 'grants: OK';
END $$;

-- ── 2. Fixtures ─────────────────────────────────────────────────────────────────────────
-- Club T1 and club T2.
-- U = the user deleting themselves (admin of T1, member of T2); A = second T1 admin;
-- S1 = T1's genuine system owner (admin-API markers, random address); F = a look-alike: a
-- REAL account given an owner-style address for T2 (what change-member-email or a magic-link
-- sign-up allows) with no markers; X = a bystander.
SET session_replication_role = 'replica';  -- skip the accounts/participants sync triggers

INSERT INTO tenants (id, name, slug, primary_color, accent_color) VALUES
  ('a2990000-0000-0000-0000-00000000000a', 'W299 Club One', 'w299-club-1', '#000000', '#ffffff'),
  ('a2990000-0000-0000-0000-00000000000b', 'W299 Club Two', 'w299-club-2', '#000000', '#ffffff');

INSERT INTO auth.users (id, email, aud, role, raw_app_meta_data, banned_until) VALUES
  ('a2999999-0000-0000-0000-000000000001', 'w299-user@test.local', 'authenticated', 'authenticated', '{}', NULL),
  ('a2999999-0000-0000-0000-000000000002', 'w299-admin@test.local', 'authenticated', 'authenticated', '{}', NULL),
  ('a2999999-0000-0000-0000-000000000003', 'former-member+a2990000-0000-0000-0000-00000000000a@system.vechelon.invalid',
     'authenticated', 'authenticated',
     '{"system_owner": true, "tenant_id": "a2990000-0000-0000-0000-00000000000a"}', now() + interval '100 years'),
  ('a2999999-0000-0000-0000-000000000004', 'w299-bystander@test.local', 'authenticated', 'authenticated', '{}', NULL),
  ('a2999999-0000-0000-0000-000000000005', 'former-member+a2990000-0000-0000-0000-00000000000b@system.vechelon.invalid',
     'authenticated', 'authenticated', '{"provider": "email"}', NULL);

INSERT INTO accounts (id, email, name, phone, session_cookie_id) VALUES
  ('a2999999-0000-0000-0000-000000000001', 'w299-user@test.local', 'Una User', '+15550000001', 'w299-cookie-u'),
  ('a2999999-0000-0000-0000-000000000002', 'w299-admin@test.local', 'Ada Admin', '+15550000002', NULL),
  ('a2999999-0000-0000-0000-000000000004', 'w299-bystander@test.local', 'Bea Bystander', '+15550000004', NULL),
  ('a2999999-0000-0000-0000-000000000005', 'former-member+a2990000-0000-0000-0000-00000000000b@system.vechelon.invalid', 'Fay Fake', NULL, NULL);

INSERT INTO account_tenants (account_id, tenant_id, role, status) VALUES
  ('a2999999-0000-0000-0000-000000000001', 'a2990000-0000-0000-0000-00000000000a', 'admin', 'affiliated'),
  ('a2999999-0000-0000-0000-000000000001', 'a2990000-0000-0000-0000-00000000000b', 'member', 'affiliated'),
  ('a2999999-0000-0000-0000-000000000002', 'a2990000-0000-0000-0000-00000000000b', 'admin', 'affiliated'),
  ('a2999999-0000-0000-0000-000000000004', 'a2990000-0000-0000-0000-00000000000a', 'member', 'affiliated'),
  ('a2999999-0000-0000-0000-000000000005', 'a2990000-0000-0000-0000-00000000000b', 'admin', 'affiliated');

INSERT INTO rides (id, tenant_id, name, type, start_coords, qr_code, created_by) VALUES
  ('a2991111-0000-0000-0000-000000000001', 'a2990000-0000-0000-0000-00000000000a', 'U ride', 'adhoc', point(0,0), '', 'a2999999-0000-0000-0000-000000000001'),
  ('a2991111-0000-0000-0000-000000000002', 'a2990000-0000-0000-0000-00000000000a', 'X ride', 'adhoc', point(0,0), '', 'a2999999-0000-0000-0000-000000000004'),
  ('a2991111-0000-0000-0000-000000000003', 'a2990000-0000-0000-0000-00000000000b', 'U ride in T2', 'adhoc', point(0,0), '', 'a2999999-0000-0000-0000-000000000001');

INSERT INTO route_library (tenant_id, name, file_path, created_by) VALUES
  ('a2990000-0000-0000-0000-00000000000a', 'U route', 'w299/u.gpx', 'a2999999-0000-0000-0000-000000000001');

INSERT INTO ride_participants (ride_id, account_id, display_name, email, phone, role, last_lat, last_long) VALUES
  ('a2991111-0000-0000-0000-000000000001', 'a2999999-0000-0000-0000-000000000001', 'Una User', 'w299-user@test.local', '+15550000001', 'captain', 1.0, 2.0),
  ('a2991111-0000-0000-0000-000000000002', 'a2999999-0000-0000-0000-000000000004', 'Bea Bystander', 'w299-bystander@test.local', '+15550000004', 'member', NULL, NULL);
-- Guest rows with no account link: one under U's email (claim-by-email) — anonymised; and two
-- that must NOT be touched: someone else on U's browser (same session cookie) and a guest
-- who shares U's phone number.
INSERT INTO ride_participants (ride_id, account_id, display_name, email, phone, role, session_cookie_id) VALUES
  ('a2991111-0000-0000-0000-000000000002', NULL, 'Una (guest)', 'W299-User@test.local', '+15550000001', 'guest', NULL),
  ('a2991111-0000-0000-0000-000000000002', NULL, 'Bo Sharedbrowser', NULL, NULL, 'guest', 'w299-cookie-u'),
  ('a2991111-0000-0000-0000-000000000002', NULL, 'Phil Sharedphone', NULL, '+15550000001', 'guest', NULL);

-- A phone shell U graduated from.
INSERT INTO pending_members (tenant_id, phone, name, token_hash, status, expires_at, account_id) VALUES
  ('a2990000-0000-0000-0000-00000000000a', '+15550000001', 'Una (shell)', 'w299-token-hash', 'completed',
   now() + interval '7 days', 'a2999999-0000-0000-0000-000000000001');

SET session_replication_role = 'origin';

-- ── 3. register_system_owner: genuine owner registers (idempotently); look-alike refused ─
DO $$
DECLARE v uuid;
BEGIN
  v := public.register_system_owner('a2990000-0000-0000-0000-00000000000a');
  IF v IS DISTINCT FROM 'a2999999-0000-0000-0000-000000000003'::uuid THEN
    RAISE EXCEPTION 'W299 gate FAILED: genuine owner not registered (got %)', v;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM accounts WHERE id = v AND name = 'Former member') THEN
    RAISE EXCEPTION 'W299 gate FAILED: owner accounts row not created';
  END IF;
  IF public.register_system_owner('a2990000-0000-0000-0000-00000000000a') IS DISTINCT FROM v THEN
    RAISE EXCEPTION 'W299 gate FAILED: registration not idempotent';
  END IF;
  RAISE NOTICE 'genuine owner registered: OK';
END $$;

-- Marker users that fail one leg are not owners either: a short ban, or an address that
-- isn't the owner pattern.
SET session_replication_role = 'replica';
INSERT INTO auth.users (id, email, aud, role, raw_app_meta_data, banned_until) VALUES
  ('a2999999-0000-0000-0000-000000000007', 'former-member+short-ban@system.vechelon.invalid', 'authenticated', 'authenticated',
   '{"system_owner": true, "tenant_id": "a2990000-0000-0000-0000-00000000000b"}', now() + interval '1 day'),
  ('a2999999-0000-0000-0000-000000000008', 'w299-wrong-address@test.local', 'authenticated', 'authenticated',
   '{"system_owner": true, "tenant_id": "a2990000-0000-0000-0000-00000000000b"}', now() + interval '100 years');
SET session_replication_role = 'origin';

SAVEPOINT s_fake;
DO $$
BEGIN
  BEGIN
    PERFORM public.register_system_owner('a2990000-0000-0000-0000-00000000000b');
    RAISE EXCEPTION 'W299 gate FAILED: a look-alike account was registered as system owner';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM NOT LIKE 'system_owner_unverified:%' THEN RAISE; END IF;
    RAISE NOTICE 'look-alike owner refused: OK';
  END;
END $$;
ROLLBACK TO SAVEPOINT s_fake;

-- ── 4. Last admin is blocked ────────────────────────────────────────────────────────────
SAVEPOINT s_last_admin;
DO $$
BEGIN
  BEGIN
    PERFORM public.delete_account_data('a2999999-0000-0000-0000-000000000001');
    RAISE EXCEPTION 'W299 gate FAILED: last admin was allowed to delete';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'last_admin' THEN RAISE; END IF;
    RAISE NOTICE 'last admin blocked: OK';
  END;
END $$;
ROLLBACK TO SAVEPOINT s_last_admin;

-- A second active T1 admin lifts the block.
INSERT INTO account_tenants (account_id, tenant_id, role, status) VALUES
  ('a2999999-0000-0000-0000-000000000002', 'a2990000-0000-0000-0000-00000000000a', 'admin', 'affiliated');

-- ── 5. T2 has no REGISTERED owner (only the look-alike) → fails closed, nothing changes ─
SAVEPOINT s_owner;
DO $$
BEGIN
  BEGIN
    PERFORM public.delete_account_data('a2999999-0000-0000-0000-000000000001');
    RAISE EXCEPTION 'W299 gate FAILED: deleted without a registered system owner';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM NOT LIKE 'system_owner_missing:%' THEN RAISE; END IF;
    RAISE NOTICE 'unregistered owner (look-alike present) fails closed: OK';
  END;
END $$;
ROLLBACK TO SAVEPOINT s_owner;

-- Give T2 a genuine owner (S2), and make S1 already a supporter of X's ride so the
-- ride_support move has to de-duplicate.
SET session_replication_role = 'replica';
INSERT INTO auth.users (id, email, aud, role, raw_app_meta_data, banned_until) VALUES
  ('a2999999-0000-0000-0000-000000000006', 'former-member+5b2e9c1a-random@system.vechelon.invalid', 'authenticated', 'authenticated',
   '{"system_owner": true, "tenant_id": "a2990000-0000-0000-0000-00000000000b"}', now() + interval '100 years');
-- A NEWER genuine marker user (a concurrent attempt's spare): the oldest must win.
INSERT INTO auth.users (id, email, aud, role, raw_app_meta_data, banned_until, created_at) VALUES
  ('a2999999-0000-0000-0000-000000000009', 'former-member+spare@system.vechelon.invalid', 'authenticated', 'authenticated',
   '{"system_owner": true, "tenant_id": "a2990000-0000-0000-0000-00000000000b"}', now() + interval '100 years', now() + interval '1 minute');
UPDATE auth.users SET created_at = now() WHERE id = 'a2999999-0000-0000-0000-000000000006';
SET session_replication_role = 'origin';
DO $$
BEGIN
  IF public.register_system_owner('a2990000-0000-0000-0000-00000000000b') IS DISTINCT FROM 'a2999999-0000-0000-0000-000000000006'::uuid THEN
    RAISE EXCEPTION 'W299 gate FAILED: register did not pick the oldest genuine owner';
  END IF;
  RAISE NOTICE 'oldest genuine owner registered: OK';
END $$;

INSERT INTO ride_support (ride_id, account_id) VALUES
  ('a2991111-0000-0000-0000-000000000002', 'a2999999-0000-0000-0000-000000000001'),
  ('a2991111-0000-0000-0000-000000000002', 'a2999999-0000-0000-0000-000000000003');

-- ── 6. Happy path ───────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  r  jsonb;
  n  integer;
  u  uuid := 'a2999999-0000-0000-0000-000000000001';
  s1 uuid := 'a2999999-0000-0000-0000-000000000003';
  s2 uuid := 'a2999999-0000-0000-0000-000000000006';
BEGIN
  r := public.delete_account_data(u);
  IF (r->>'participants_anonymised')::int <> 2 THEN
    RAISE EXCEPTION 'W299 gate FAILED: expected 2 participant rows anonymised, got %', r;
  END IF;

  IF EXISTS (SELECT 1 FROM accounts WHERE id = u) THEN RAISE EXCEPTION 'W299 gate FAILED: accounts row survived'; END IF;
  IF EXISTS (SELECT 1 FROM account_tenants WHERE account_id = u) THEN RAISE EXCEPTION 'W299 gate FAILED: membership survived'; END IF;
  IF EXISTS (SELECT 1 FROM pending_members WHERE token_hash = 'w299-token-hash') THEN
    RAISE EXCEPTION 'W299 gate FAILED: graduated phone shell survived';
  END IF;

  -- Reassigned per club, not lost.
  IF (SELECT created_by FROM rides WHERE id = 'a2991111-0000-0000-0000-000000000001') <> s1 THEN
    RAISE EXCEPTION 'W299 gate FAILED: T1 ride not reassigned to T1''s owner';
  END IF;
  IF (SELECT created_by FROM rides WHERE id = 'a2991111-0000-0000-0000-000000000003') <> s2 THEN
    RAISE EXCEPTION 'W299 gate FAILED: T2 ride not reassigned to T2''s owner';
  END IF;
  IF (SELECT created_by FROM route_library WHERE name = 'U route') <> s1 THEN
    RAISE EXCEPTION 'W299 gate FAILED: route not reassigned';
  END IF;
  SELECT count(*) INTO n FROM ride_support WHERE ride_id = 'a2991111-0000-0000-0000-000000000002';
  IF n <> 1 OR NOT EXISTS (SELECT 1 FROM ride_support WHERE ride_id = 'a2991111-0000-0000-0000-000000000002' AND account_id = s1) THEN
    RAISE EXCEPTION 'W299 gate FAILED: ride_support not de-duplicated onto the owner (% rows)', n;
  END IF;

  -- Nothing identifies U any more.
  SELECT count(*) INTO n FROM ride_participants
  WHERE account_id = u OR lower(email) = 'w299-user@test.local' OR display_name ILIKE 'una%';
  IF n <> 0 THEN RAISE EXCEPTION 'W299 gate FAILED: % participant row(s) still identify the user', n; END IF;
  IF EXISTS (SELECT 1 FROM ride_participants WHERE display_name = 'Deleted rider' AND (last_lat IS NOT NULL OR last_long IS NOT NULL)) THEN
    RAISE EXCEPTION 'W299 gate FAILED: last position kept on an anonymised row';
  END IF;

  -- Bystanders untouched — including the guest who only shares U's phone number.
  IF NOT EXISTS (SELECT 1 FROM ride_participants WHERE account_id = 'a2999999-0000-0000-0000-000000000004' AND email = 'w299-bystander@test.local') THEN
    RAISE EXCEPTION 'W299 gate FAILED: bystander participant row changed';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM ride_participants WHERE display_name = 'Phil Sharedphone' AND phone = '+15550000001') THEN
    RAISE EXCEPTION 'W299 gate FAILED: a phone-only match anonymised someone else';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM ride_participants WHERE display_name = 'Bo Sharedbrowser' AND session_cookie_id = 'w299-cookie-u') THEN
    RAISE EXCEPTION 'W299 gate FAILED: a cookie-only match anonymised someone else';
  END IF;
  IF EXISTS (SELECT 1 FROM account_tenants WHERE account_id IN (s1, s2)) THEN
    RAISE EXCEPTION 'W299 gate FAILED: a system owner holds a membership';
  END IF;

  -- Idempotent: a second call for the same (now absent) user changes nothing and doesn't error.
  r := public.delete_account_data(u);
  IF (r->>'participants_anonymised')::int <> 0 THEN
    RAISE EXCEPTION 'W299 gate FAILED: second call changed rows: %', r;
  END IF;

  RAISE NOTICE 'happy path (two clubs / reassign / dedupe / anonymise / shells / idempotent): OK';
END $$;

-- ── 7. An owner that gains a membership is refused ──────────────────────────────────────
SAVEPOINT s_owner_member;
INSERT INTO account_tenants (account_id, tenant_id, role, status) VALUES
  ('a2999999-0000-0000-0000-000000000003', 'a2990000-0000-0000-0000-00000000000a', 'member', 'affiliated');
UPDATE rides SET created_by = 'a2999999-0000-0000-0000-000000000004' WHERE id = 'a2991111-0000-0000-0000-000000000002';
DO $$
BEGIN
  BEGIN
    PERFORM public.delete_account_data('a2999999-0000-0000-0000-000000000004');
    RAISE EXCEPTION 'W299 gate FAILED: reassigned to an owner that holds a membership';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM NOT LIKE 'system_owner_invalid:%' THEN RAISE; END IF;
    RAISE NOTICE 'owner with membership refused: OK';
  END;
END $$;
ROLLBACK TO SAVEPOINT s_owner_member;

-- ── 8. Platform admins cannot self-delete ───────────────────────────────────────────────
SAVEPOINT s_platform;
SET session_replication_role = 'replica';
UPDATE accounts SET platform_admin = true WHERE id = 'a2999999-0000-0000-0000-000000000002';
SET session_replication_role = 'origin';
DO $$
BEGIN
  BEGIN
    PERFORM public.delete_account_data('a2999999-0000-0000-0000-000000000002');
    RAISE EXCEPTION 'W299 gate FAILED: platform admin was allowed to self-delete';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'platform_admin' THEN RAISE; END IF;
    RAISE NOTICE 'platform admin blocked: OK';
  END;
END $$;
ROLLBACK TO SAVEPOINT s_platform;

ROLLBACK;  -- fixtures never persist
