-- Rail 3 — Automated RLS isolation gate
-- =====================================================================
-- Executed by .github/workflows/rail3-ci.yml against the LOCAL Supabase
-- stack ONLY (never the hosted production project drktcxggaizkbvqccfhp).
--
-- Run with: psql "$DB_URL" -v ON_ERROR_STOP=1 -f <this file>
-- ON_ERROR_STOP=1 means any RAISE EXCEPTION below fails the CI job — so this
-- file is a pass/fail merge gate, not a manual checklist (cf. the older,
-- comment-only rls_verification.sql in this directory).
--
-- Scope: this proves the HARNESS — real cross-tenant RLS denial, executed in
-- CI. The full Rail 3 behavioral isolation matrix (beacon_alerts / rider_states
-- cross-tenant + Broadcast deny) is task W182/3549 (DoD-12), which depends on
-- this harness and on the W169 Rail 3 schema. The assertions here deliberately
-- target schema-simple, self-scoped policies (id = auth.uid()) so the gate is
-- robust and does not hinge on the intricate ride-tier policies.
-- =====================================================================

BEGIN;
SET client_min_messages = warning;

-- ── 1. Structural guarantee: RLS is ENABLED on every tenant-scoped table ──────
-- A disabled RLS flag is the most basic isolation hole; assert it can never ship.
-- We check relrowsecurity (ENABLED), not relforcerowsecurity (FORCE), on purpose:
-- FORCE only matters for the table *owner*, and the behavioral assertions below run
-- as the non-owner `authenticated` role — exactly how PostgREST connects in prod —
-- so RLS is fully enforced there regardless of FORCE. FORCE is intentionally out of
-- scope for this gate.
DO $$
DECLARE
  tbl text;
  tenant_scoped text[] := ARRAY['tenants','accounts','account_tenants','rides','ride_participants'];
BEGIN
  FOREACH tbl IN ARRAY tenant_scoped LOOP
    IF NOT EXISTS (
      SELECT 1
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = tbl AND c.relrowsecurity
    ) THEN
      RAISE EXCEPTION 'RLS gate FAILED: row-level security is NOT enabled on public.%', tbl;
    END IF;
  END LOOP;
  RAISE NOTICE 'RLS enabled on all tenant-scoped tables: OK';
END $$;

-- ── 2. Fixtures ───────────────────────────────────────────────────────────────
-- Load as the superuser (CI connects as postgres) with FK triggers disabled, so
-- we can seed accounts/memberships WITHOUT creating auth.users rows. NOT NULL and
-- CHECK constraints still apply; only referential triggers are suppressed.
SET session_replication_role = 'replica';

-- Tenant A member and Tenant B member (membership = account_tenants, the current
-- source of truth for tenant scoping).
INSERT INTO accounts (id, tenant_id, email, phone) VALUES
  ('a1111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'rls-a@test.local', '000'),
  ('b1111111-1111-1111-1111-111111111111', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'rls-b@test.local', '000');

INSERT INTO account_tenants (account_id, tenant_id, role, status) VALUES
  ('a1111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'member', 'affiliated'),
  ('b1111111-1111-1111-1111-111111111111', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'member', 'affiliated');

SET session_replication_role = 'origin';

-- ── 3. Behavioral cross-tenant denial, as an authenticated Tenant-A member ────
-- Become the authenticated role and present Tenant-A member's JWT. RLS now
-- evaluates exactly as it would for a real signed-in rider.
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

  RAISE NOTICE 'Cross-tenant denial + in-tenant access: OK';
END $$;

RESET ROLE;
ROLLBACK;  -- leave the database untouched; fixtures never persist

\echo '=================================================='
\echo ' Rail 3 RLS isolation gate: PASSED'
\echo '=================================================='
