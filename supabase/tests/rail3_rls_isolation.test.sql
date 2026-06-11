-- Rail 3 — Automated RLS isolation gate
-- =====================================================================
-- Executed by .github/workflows/rail3-ci.yml against the LOCAL Supabase
-- stack ONLY (never the hosted production project drktcxggaizkbvqccfhp).
--
-- Run with: psql "$DB_URL" -v ON_ERROR_STOP=1 -f <this file>
-- ON_ERROR_STOP=1 means any RAISE EXCEPTION below fails the CI job — so this
-- file is a pass/fail merge gate, not a manual checklist.
--
-- RESILIENT: the Rail 3-table checks (beacon_alerts / rider_states) are guarded by
-- to_regclass() existence, so this same gate passes BOTH on master (where the held
-- Rail 3 schema migration is not yet applied — those tables are skipped) AND on a
-- branch/deploy that has the schema (those tables are asserted). The full behavioral
-- Broadcast-denial matrix is W182/3549.
-- =====================================================================

BEGIN;
SET client_min_messages = warning;

-- ── 1. Structural guarantee: RLS is ENABLED on every tenant-scoped table that EXISTS.
-- An existing table with RLS off is the most basic isolation hole; absent tables (e.g.
-- Rail 3 tables on master) are skipped rather than failing the gate.
DO $$
DECLARE
  tbl text;
  rls boolean;
  tenant_scoped text[] := ARRAY[
    'tenants','accounts','account_tenants','rides','ride_participants',
    'beacon_alerts','rider_states'
  ];
BEGIN
  FOREACH tbl IN ARRAY tenant_scoped LOOP
    SELECT c.relrowsecurity INTO rls
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = tbl;

    IF rls IS NULL THEN
      RAISE NOTICE 'table public.% absent — skipped (schema not applied here)', tbl;
    ELSIF NOT rls THEN
      RAISE EXCEPTION 'RLS gate FAILED: row-level security is NOT enabled on public.%', tbl;
    END IF;
  END LOOP;
  RAISE NOTICE 'RLS enabled on all present tenant-scoped tables: OK';
END $$;

-- ── 2. Fixtures ───────────────────────────────────────────────────────────────
-- Load as the superuser (CI connects as postgres) with FK triggers disabled, so we
-- can seed accounts/memberships WITHOUT creating auth.users rows. NOT NULL and CHECK
-- constraints still apply; only referential triggers are suppressed.
SET session_replication_role = 'replica';

-- Tenant A member and Tenant B member. Membership lives in account_tenants — the
-- current source of truth (accounts.tenant_id/role/status were dropped by migration
-- 20260411000000, so accounts is just id/email/phone here).
INSERT INTO accounts (id, email, phone) VALUES
  ('a1111111-1111-1111-1111-111111111111', 'rls-a@test.local', '000'),
  ('b1111111-1111-1111-1111-111111111111', 'rls-b@test.local', '000');

INSERT INTO account_tenants (account_id, tenant_id, role, status) VALUES
  ('a1111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'member', 'affiliated'),
  ('b1111111-1111-1111-1111-111111111111', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'member', 'affiliated');

-- Rail 3 (W169) fixtures — only when the schema is present. A Tenant-B beacon + rider
-- state that W169's tenant-scoped RLS must hide from a Tenant-A user.
DO $$
BEGIN
  IF to_regclass('public.beacon_alerts') IS NOT NULL THEN
    INSERT INTO beacon_alerts (id, tenant_id, ride_id, rider_id, triggered_at) VALUES
      ('cccccccc-cccc-cccc-cccc-cccccccccccc', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
       '11111111-1111-1111-1111-111111111111', 'b1111111-1111-1111-1111-111111111111', now());
    INSERT INTO rider_states (id, tenant_id, ride_id, rider_id, state) VALUES
      ('dddddddd-dddd-dddd-dddd-dddddddddddd', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
       '11111111-1111-1111-1111-111111111111', 'b1111111-1111-1111-1111-111111111111', 'active');
  END IF;
END $$;

SET session_replication_role = 'origin';

-- ── 3. Behavioral cross-tenant denial, as an authenticated Tenant-A member ────
SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"a1111111-1111-1111-1111-111111111111","role":"authenticated"}',
  true  -- transaction-local
);

DO $$
DECLARE n integer;
BEGIN
  -- (a) Tenant-A member must NOT see Tenant-B's membership row.
  SELECT count(*) INTO n FROM account_tenants
    WHERE tenant_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
  IF n <> 0 THEN
    RAISE EXCEPTION 'cross-tenant LEAK: Tenant-A user saw % account_tenants row(s) for Tenant B (expected 0)', n;
  END IF;

  -- (b) Tenant-A member must NOT see Tenant-B's account.
  SELECT count(*) INTO n FROM accounts
    WHERE id = 'b1111111-1111-1111-1111-111111111111';
  IF n <> 0 THEN
    RAISE EXCEPTION 'cross-tenant LEAK: Tenant-A user saw Tenant-B account (expected 0)';
  END IF;

  -- (c) Not over-blocked: Tenant-A member CAN see their own membership row.
  SELECT count(*) INTO n FROM account_tenants
    WHERE account_id = 'a1111111-1111-1111-1111-111111111111';
  IF n < 1 THEN
    RAISE EXCEPTION 'over-block: Tenant-A user cannot see their own account_tenants row (expected >= 1)';
  END IF;

  -- (d)/(e) W169 Rail 3 tables — only asserted when present.
  IF to_regclass('public.beacon_alerts') IS NOT NULL THEN
    SELECT count(*) INTO n FROM beacon_alerts
      WHERE tenant_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
    IF n <> 0 THEN
      RAISE EXCEPTION 'cross-tenant LEAK: Tenant-A user saw % beacon_alerts row(s) for Tenant B (expected 0)', n;
    END IF;

    SELECT count(*) INTO n FROM rider_states
      WHERE tenant_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
    IF n <> 0 THEN
      RAISE EXCEPTION 'cross-tenant LEAK: Tenant-A user saw % rider_states row(s) for Tenant B (expected 0)', n;
    END IF;
  END IF;

  RAISE NOTICE 'Cross-tenant denial + in-tenant access (incl. Rail 3 tables when present): OK';
END $$;

RESET ROLE;
ROLLBACK;  -- leave the database untouched; fixtures never persist

\echo '=================================================='
\echo ' Rail 3 RLS isolation gate: PASSED'
\echo '=================================================='
