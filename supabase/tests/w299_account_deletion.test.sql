-- =====================================================================
-- W299 — account self-deletion gate (runs in CI against the EPHEMERAL local stack).
--
-- ON_ERROR_STOP=1: any RAISE EXCEPTION below fails the job. Everything runs inside one
-- transaction that is ROLLED BACK, so fixtures never persist. Each case runs in its own
-- SAVEPOINT so an expected exception doesn't abort the rest.
-- =====================================================================
BEGIN;
SET client_min_messages = warning;

-- ── 1. Grants: service_role only ────────────────────────────────────────────────────────
DO $$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY['public.delete_account_data(uuid)', 'public.account_deletion_preflight(uuid)'] LOOP
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
  RAISE NOTICE 'grants: OK';
END $$;

-- An authenticated caller calling it directly is refused by the grant, not by luck.
SAVEPOINT s_auth;
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  BEGIN
    PERFORM public.delete_account_data('a2999999-0000-0000-0000-000000000001');
    RAISE EXCEPTION 'W299 gate FAILED: authenticated could call delete_account_data';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'authenticated direct call refused: OK';
  END;
END $$;
ROLLBACK TO SAVEPOINT s_auth;
RESET ROLE;

-- ── 2. Fixtures (superuser, FK triggers suppressed so no auth.users rows are needed) ────
SET session_replication_role = 'replica';

INSERT INTO tenants (id, name, slug, primary_color, accent_color) VALUES
  ('a2990000-0000-0000-0000-00000000000a', 'W299 Club', 'w299-club', '#000000', '#ffffff');

-- U = the user deleting themselves; A = a second admin; S = the club's system owner;
-- X = a bystander rider whose rows must be untouched.
INSERT INTO accounts (id, email, name, phone) VALUES
  ('a2999999-0000-0000-0000-000000000001', 'w299-user@test.local', 'Una User', '+15550000001'),
  ('a2999999-0000-0000-0000-000000000002', 'w299-admin@test.local', 'Ada Admin', '+15550000002'),
  ('a2999999-0000-0000-0000-000000000003', 'former-member+a2990000-0000-0000-0000-00000000000a@system.vechelon.invalid', 'Former member', NULL),
  ('a2999999-0000-0000-0000-000000000004', 'w299-bystander@test.local', 'Bea Bystander', '+15550000004');

INSERT INTO account_tenants (account_id, tenant_id, role, status) VALUES
  ('a2999999-0000-0000-0000-000000000001', 'a2990000-0000-0000-0000-00000000000a', 'admin', 'affiliated'),
  ('a2999999-0000-0000-0000-000000000004', 'a2990000-0000-0000-0000-00000000000a', 'member', 'affiliated');

INSERT INTO rides (id, tenant_id, name, type, start_coords, qr_code, created_by) VALUES
  ('a2991111-0000-0000-0000-000000000001', 'a2990000-0000-0000-0000-00000000000a', 'U ride', 'adhoc', point(0,0), '', 'a2999999-0000-0000-0000-000000000001'),
  ('a2991111-0000-0000-0000-000000000002', 'a2990000-0000-0000-0000-00000000000a', 'X ride', 'adhoc', point(0,0), '', 'a2999999-0000-0000-0000-000000000004');

INSERT INTO route_library (tenant_id, name, file_path, created_by) VALUES
  ('a2990000-0000-0000-0000-00000000000a', 'U route', 'w299/u.gpx', 'a2999999-0000-0000-0000-000000000001');

INSERT INTO ride_support (ride_id, account_id) VALUES
  ('a2991111-0000-0000-0000-000000000002', 'a2999999-0000-0000-0000-000000000001');

INSERT INTO ride_participants (ride_id, account_id, display_name, email, phone, role, last_lat, last_long) VALUES
  ('a2991111-0000-0000-0000-000000000001', 'a2999999-0000-0000-0000-000000000001', 'Una User', 'w299-user@test.local', '+15550000001', 'captain', 1.0, 2.0),
  ('a2991111-0000-0000-0000-000000000002', 'a2999999-0000-0000-0000-000000000004', 'Bea Bystander', 'w299-bystander@test.local', '+15550000004', 'member', NULL, NULL);
-- A guest row under U's email with no account link (the claim-by-email case).
INSERT INTO ride_participants (ride_id, account_id, display_name, email, phone, role) VALUES
  ('a2991111-0000-0000-0000-000000000002', NULL, 'Una (guest)', 'W299-User@test.local', '+15550000001', 'guest');

SET session_replication_role = 'origin';

-- ── 3. Last admin is blocked ────────────────────────────────────────────────────────────
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

-- A second active admin lifts the block.
INSERT INTO account_tenants (account_id, tenant_id, role, status) VALUES
  ('a2999999-0000-0000-0000-000000000002', 'a2990000-0000-0000-0000-00000000000a', 'admin', 'affiliated');

-- ── 4. Missing system owner fails closed (nothing changes) ─────────────────────────────
SAVEPOINT s_owner;
UPDATE accounts SET email = 'someone-else@test.local' WHERE id = 'a2999999-0000-0000-0000-000000000003';
DO $$
BEGIN
  BEGIN
    PERFORM public.delete_account_data('a2999999-0000-0000-0000-000000000001');
    RAISE EXCEPTION 'W299 gate FAILED: deleted without a system owner';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM NOT LIKE 'system_owner_missing:%' THEN RAISE; END IF;
    RAISE NOTICE 'missing system owner fails closed: OK';
  END;
END $$;
ROLLBACK TO SAVEPOINT s_owner;

-- ── 5. Happy path ───────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  r jsonb;
  n integer;
  u uuid := 'a2999999-0000-0000-0000-000000000001';
  s uuid := 'a2999999-0000-0000-0000-000000000003';
BEGIN
  r := public.delete_account_data(u);
  IF (r->>'participants_anonymised')::int <> 2 THEN
    RAISE EXCEPTION 'W299 gate FAILED: expected 2 participant rows anonymised, got %', r;
  END IF;

  IF EXISTS (SELECT 1 FROM accounts WHERE id = u) THEN RAISE EXCEPTION 'W299 gate FAILED: accounts row survived'; END IF;
  IF EXISTS (SELECT 1 FROM account_tenants WHERE account_id = u) THEN RAISE EXCEPTION 'W299 gate FAILED: membership survived'; END IF;

  -- Reassigned, not lost.
  IF (SELECT created_by FROM rides WHERE id = 'a2991111-0000-0000-0000-000000000001') <> s THEN
    RAISE EXCEPTION 'W299 gate FAILED: ride not reassigned to the system owner';
  END IF;
  IF (SELECT created_by FROM route_library WHERE name = 'U route') <> s THEN
    RAISE EXCEPTION 'W299 gate FAILED: route not reassigned';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM ride_support WHERE ride_id = 'a2991111-0000-0000-0000-000000000002' AND account_id = s) THEN
    RAISE EXCEPTION 'W299 gate FAILED: ride_support not reassigned';
  END IF;

  -- Nothing identifies U any more.
  SELECT count(*) INTO n FROM ride_participants
  WHERE account_id = u OR lower(email) = 'w299-user@test.local' OR phone = '+15550000001'
     OR display_name ILIKE 'una%';
  IF n <> 0 THEN RAISE EXCEPTION 'W299 gate FAILED: % participant row(s) still identify the user', n; END IF;
  IF EXISTS (SELECT 1 FROM ride_participants WHERE display_name = 'Deleted rider' AND (last_lat IS NOT NULL OR last_long IS NOT NULL)) THEN
    RAISE EXCEPTION 'W299 gate FAILED: last position kept on an anonymised row';
  END IF;

  -- The bystander and the system owner are untouched; the owner has no club powers.
  IF NOT EXISTS (SELECT 1 FROM ride_participants WHERE account_id = 'a2999999-0000-0000-0000-000000000004' AND email = 'w299-bystander@test.local') THEN
    RAISE EXCEPTION 'W299 gate FAILED: bystander participant row changed';
  END IF;
  IF EXISTS (SELECT 1 FROM account_tenants WHERE account_id = s) THEN
    RAISE EXCEPTION 'W299 gate FAILED: system owner holds a membership';
  END IF;

  -- Idempotent: a second call for the same (now absent) user changes nothing and doesn't error.
  r := public.delete_account_data(u);
  IF (r->>'participants_anonymised')::int <> 0 THEN
    RAISE EXCEPTION 'W299 gate FAILED: second call changed rows: %', r;
  END IF;

  RAISE NOTICE 'happy path (delete / reassign / anonymise / idempotent): OK';
END $$;

-- ── 6. Platform admins cannot self-delete ───────────────────────────────────────────────
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
