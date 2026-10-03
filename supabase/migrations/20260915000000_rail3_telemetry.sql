-- =====================================================================
-- W284 — Rail 3 always-on telemetry tier + operator-level config
-- (Ledger v1.1.3 slate 6, §8.5 telemetry retention, §14 items 20 and 22, F-7;
--  Pillar III R3-45, R3-54). Base branch rail3-integration; HELD off the prod
--  `db push --linked` pipeline until promotion (W259), like every Rail 3 migration.
--
-- Two tiers (slate 6):
--   * always_on  — cheap counters only: engine_started, engine_died, warning_fired.
--                  A permanent floor, never switched off. Survives the Hard Purge with
--                  identity stripped at T+4h (account_id -> NULL), keyed to ride /
--                  platform / device class.
--   * full_capture — operator-switched PER RIDE (rail3_operator_config.full_capture_ride_id
--                  names the ride); device operational state from engine start to teardown;
--                  personal-data class, DELETED at T+4h from ride close. Never fleet-wide.
--
-- Scope boundary enforced AT THE SCHEMA: device operational state, never rider position —
-- no coordinate columns, and a CHECK that rejects coordinate keys in `payload`.
--
-- supabase-patterns walkthrough:
--   * Pattern 1 (recursion): the only predicates are public.get_my_tenant_id() (SECURITY
--     DEFINER over account_tenants) and public.rail3_ride_tenant_id() (SECURITY DEFINER over
--     rides, defined below); no policy reads its own table or ride_participants.
--   * Pattern 5 (idempotency): CREATE TABLE IF NOT EXISTS, named inline CHECKs, DROP POLICY
--     IF EXISTS before every CREATE POLICY, ON CONFLICT DO NOTHING on the seed.
--   * Pattern 7 (explicit grants): INSERT-only to authenticated on events (reads are
--     service_role only — no rider-facing surface); SELECT-only to authenticated on the
--     config (writes are service_role only — operator-level by ruling, item 22).
-- =====================================================================

-- 1. Always-on + full-capture event rows.
CREATE TABLE IF NOT EXISTS public.rail3_telemetry_events (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES public.tenants(id)   ON DELETE CASCADE,
  ride_id       uuid NOT NULL REFERENCES public.rides(id)     ON DELETE CASCADE,
  -- Nullable BY DESIGN: the T+4h identity strip sets it NULL on always_on rows (§8.5).
  -- Clients must always write their own uid (policy below); only the purge writes NULL.
  account_id    uuid REFERENCES public.accounts(id) ON DELETE SET NULL,
  platform      text NOT NULL,
  device_class  text NOT NULL,   -- "<manufacturer>/<model>" lowercased; never a device id
  kind          text NOT NULL,
  tier          text NOT NULL DEFAULT 'always_on',
  client_ts     timestamptz NOT NULL,          -- device clock at the event
  payload       jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT rail3_telemetry_events_platform_check
    CHECK (platform IN ('android', 'ios')),
  CONSTRAINT rail3_telemetry_events_tier_check
    CHECK (tier IN ('always_on', 'full_capture')),
  -- The always-on tier carries EXACTLY the three counters; full-capture rows may carry
  -- other lifecycle event names (fix gaps, wake attempts, teardown steps — Pillar II §2).
  CONSTRAINT rail3_telemetry_events_kind_check
    CHECK (kind ~ '^[a-z_]{1,64}$'
           AND (tier = 'full_capture' OR kind IN ('engine_started', 'engine_died', 'warning_fired'))),
  CONSTRAINT rail3_telemetry_events_payload_object
    CHECK (jsonb_typeof(payload) = 'object'),
  -- Scope boundary: no position data in either tier (top-level keys; the client guard strips
  -- nested ones as well).
  CONSTRAINT rail3_telemetry_events_payload_no_coords
    CHECK (NOT (payload ?| ARRAY['lat', 'lng', 'long', 'latitude', 'longitude', 'coords', 'path']))
);
CREATE INDEX IF NOT EXISTS rail3_telemetry_events_ride_idx   ON public.rail3_telemetry_events (ride_id);
CREATE INDEX IF NOT EXISTS rail3_telemetry_events_tenant_idx ON public.rail3_telemetry_events (tenant_id);

ALTER TABLE public.rail3_telemetry_events ENABLE ROW LEVEL SECURITY;

-- Ride → tenant lookup for the ride-scope clause below. SECURITY DEFINER so the policy never
-- subqueries `rides` under the caller's RLS (Pattern 1: no policy chain reaches
-- ride_participants); STABLE so Postgres evaluates it once per statement; search_path pinned.
CREATE OR REPLACE FUNCTION public.rail3_ride_tenant_id(p_ride_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT tenant_id FROM public.rides WHERE id = p_ride_id;
$$;
REVOKE ALL ON FUNCTION public.rail3_ride_tenant_id(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rail3_ride_tenant_id(uuid) TO authenticated, service_role;

-- Tenant- AND ride-scoped INSERT, pinned to the writer's own uid: the row's tenant must be
-- mine, the ride must belong to that tenant, and account_id must be me (D77: a latched
-- identity must not be able to file rows under another account; a member of tenant A cannot
-- file rows against a tenant-B ride uuid). NO SELECT / UPDATE / DELETE policy for
-- authenticated: reads are service_role only (no rider-facing surface, slate 6).
DROP POLICY IF EXISTS rail3_telemetry_events_tenant_insert ON public.rail3_telemetry_events;
CREATE POLICY rail3_telemetry_events_tenant_insert ON public.rail3_telemetry_events
  FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id = public.get_my_tenant_id()
    AND tenant_id = public.rail3_ride_tenant_id(ride_id)
    AND account_id = auth.uid()
  );

GRANT INSERT                         ON public.rail3_telemetry_events TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.rail3_telemetry_events TO service_role;

-- 2. Operator-level config, per platform (item 22): adjustable server-side without an app
-- release; shared with the slate 4 self-health clocks (reserved, populated by W285). Never
-- tenant-exposed for writes.
CREATE TABLE IF NOT EXISTS public.rail3_operator_config (
  platform                   text PRIMARY KEY,
  -- The ONE ride (if any) under full capture on this platform. ON DELETE SET NULL: a purged
  -- ride can never keep capture switched on.
  full_capture_ride_id       uuid REFERENCES public.rides(id) ON DELETE SET NULL,
  startup_ceiling_s          integer,   -- reserved: slate 4 startup clock (W279 brief → W285)
  steady_state_threshold_s   integer,   -- reserved: slate 4 steady-state threshold
  updated_at                 timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT rail3_operator_config_platform_check CHECK (platform IN ('android', 'ios'))
);

ALTER TABLE public.rail3_operator_config ENABLE ROW LEVEL SECURITY;

-- Any signed-in rider may READ the config (the app needs the flag and the clocks); nobody
-- but service_role may write it.
DROP POLICY IF EXISTS rail3_operator_config_select ON public.rail3_operator_config;
CREATE POLICY rail3_operator_config_select ON public.rail3_operator_config
  FOR SELECT TO authenticated USING (true);

GRANT SELECT                         ON public.rail3_operator_config TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.rail3_operator_config TO service_role;

-- Both platform rows present from day one; the iOS row is empty by ruling (item 22).
INSERT INTO public.rail3_operator_config (platform) VALUES ('android'), ('ios')
  ON CONFLICT (platform) DO NOTHING;
