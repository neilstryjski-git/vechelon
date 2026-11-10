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
    'beacon_alerts','rider_states',
    'rail3_telemetry_events','rail3_operator_config'  -- W284
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
  ('b1111111-1111-1111-1111-111111111111', 'rls-b@test.local', '000'),
  ('b2222222-2222-2222-2222-222222222222', 'rls-b-pending@test.local', '000');  -- W304

INSERT INTO account_tenants (account_id, tenant_id, role, status) VALUES
  ('a1111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'member', 'affiliated'),
  ('b1111111-1111-1111-1111-111111111111', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'member', 'affiliated'),
  -- W304: a PENDING (initiated) member of Tenant B — not yet approved by an organiser.
  ('b2222222-2222-2222-2222-222222222222', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'member', 'initiated');

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

-- W304 fixtures: a Tenant-B ride the PENDING member has joined (the web self-RSVP lets
-- them), plus a Captain breadcrumb for it.
DO $$
BEGIN
  IF to_regclass('public.rail3_breadcrumb') IS NOT NULL THEN
    INSERT INTO rides (id, tenant_id, name, type, start_coords, qr_code, created_by, status) VALUES
      ('11111111-1111-1111-1111-111111111111', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
       'W304 fixture ride', 'adhoc', point(0, 0), 'w304-fixture',
       'b1111111-1111-1111-1111-111111111111', 'active');
    INSERT INTO ride_participants (ride_id, account_id) VALUES
      ('11111111-1111-1111-1111-111111111111', 'b2222222-2222-2222-2222-222222222222'),
      ('11111111-1111-1111-1111-111111111111', 'b1111111-1111-1111-1111-111111111111');
    INSERT INTO rail3_breadcrumb (ride_id) VALUES ('11111111-1111-1111-1111-111111111111');
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

-- ── 4. W304: a PENDING member of Tenant B sees none of Tenant B's Rail 3 live data,
-- while an AFFILIATED Tenant-B member still does (no over-block).
DO $$
DECLARE n integer;
BEGIN
  IF to_regprocedure('public.rail3_is_affiliated(uuid)') IS NULL THEN
    RAISE NOTICE 'rail3_is_affiliated absent — W304 pending-member checks skipped';
    RETURN;
  END IF;

  PERFORM set_config('request.jwt.claims',
    '{"sub":"b2222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT count(*) INTO n FROM beacon_alerts;
  IF n <> 0 THEN
    RAISE EXCEPTION 'pending LEAK: initiated member saw % beacon_alerts row(s) (expected 0)', n;
  END IF;
  SELECT count(*) INTO n FROM rider_states;
  IF n <> 0 THEN
    RAISE EXCEPTION 'pending LEAK: initiated member saw % rider_states row(s) (expected 0)', n;
  END IF;
  IF public.rail3_is_affiliated('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb') THEN
    RAISE EXCEPTION 'pending LEAK: rail3_is_affiliated() true for an initiated member (broadcast gate open)';
  END IF;
  IF to_regclass('public.rail3_breadcrumb') IS NOT NULL THEN
    -- Joined the ride, but still must not read the Captain's route.
    SELECT count(*) INTO n FROM rail3_breadcrumb;
    IF n <> 0 THEN
      RAISE EXCEPTION 'pending LEAK: initiated participant saw % rail3_breadcrumb row(s) (expected 0)', n;
    END IF;
    -- ...nor write into the club's telemetry sink.
    BEGIN
      INSERT INTO rail3_telemetry_events (tenant_id, ride_id, account_id, platform, device_class, kind, client_ts)
      VALUES ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '11111111-1111-1111-1111-111111111111',
              'b2222222-2222-2222-2222-222222222222', 'android', 'test', 'engine_started', now());
      RAISE EXCEPTION 'pending LEAK: initiated member inserted rail3_telemetry_events';
    EXCEPTION
      WHEN insufficient_privilege THEN NULL;  -- 42501 = RLS denial, expected
      WHEN others THEN  -- anything else (e.g. an FK error) means RLS let the row through
        RAISE EXCEPTION 'pending LEAK: initiated member passed rail3_telemetry_events RLS (%)', SQLSTATE;
    END;
    -- Broadcast receive policy itself, evaluated on the ride's topic.
    PERFORM set_config('realtime.topic', 'rail3:ride:11111111-1111-1111-1111-111111111111', true);
    IF to_regclass('realtime.messages') IS NOT NULL AND EXISTS (
      SELECT 1 FROM pg_policies WHERE schemaname = 'realtime' AND policyname = 'rail3_broadcast_tenant_receive'
    ) AND public.rail3_is_affiliated(public.rail3_topic_tenant_id(realtime.topic())) THEN
      RAISE EXCEPTION 'pending LEAK: broadcast receive gate open for an initiated member';
    END IF;
  END IF;
  EXECUTE 'RESET ROLE';

  PERFORM set_config('request.jwt.claims',
    '{"sub":"b1111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT count(*) INTO n FROM beacon_alerts;
  IF n <> 1 THEN
    RAISE EXCEPTION 'over-block: affiliated Tenant-B member saw % beacon_alerts row(s) (expected 1)', n;
  END IF;
  SELECT count(*) INTO n FROM rider_states;
  IF n <> 1 THEN
    RAISE EXCEPTION 'over-block: affiliated Tenant-B member saw % rider_states row(s) (expected 1)', n;
  END IF;
  IF to_regclass('public.rail3_breadcrumb') IS NOT NULL THEN
    SELECT count(*) INTO n FROM rail3_breadcrumb;
    IF n <> 1 THEN
      RAISE EXCEPTION 'over-block: affiliated participant saw % rail3_breadcrumb row(s) (expected 1)', n;
    END IF;
    IF NOT public.rail3_is_affiliated(public.rail3_topic_tenant_id(realtime.topic())) THEN
      RAISE EXCEPTION 'over-block: broadcast receive gate closed for an affiliated member';
    END IF;
  END IF;
  EXECUTE 'RESET ROLE';

  RAISE NOTICE 'W304 pending-member denial + affiliated access: OK';
END $$;

RESET ROLE;
ROLLBACK;  -- leave the database untouched; fixtures never persist

\echo '=================================================='
\echo ' Rail 3 RLS isolation gate: PASSED'
\echo '=================================================='
