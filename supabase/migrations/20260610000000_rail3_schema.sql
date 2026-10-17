-- Rail 3 — schema foundation (W169)
-- =====================================================================
-- Adds the new Rail 3 tables (beacon_alerts, rider_states), additive location
-- fields on the inherited ride_participants, and tenant-level state thresholds,
-- with tenant-scoped RLS enforcing full tenant isolation (DoD-12).
--
-- ISOLATION (primary milestone principle): Rail 3 shares the prod data model.
-- This migration is ADDITIVE ONLY — it adds new tables/columns and NEW policies.
-- It never alters, drops, or replaces any existing table, column, or RLS policy
-- on rides / ride_participants / tenants / accounts, so existing web behaviour is
-- unchanged.
--
-- Patterns applied (supabase-patterns):
--   * Pattern 1 (no RLS recursion): new-table RLS scopes by a denormalized
--     tenant_id compared to public.get_my_tenant_id() — a SECURITY DEFINER helper
--     that reads account_tenants and never references these tables. No policy here
--     queries the table it is on, or a table whose policy queries back.
--   * Pattern 5 (idempotency): IF EXISTS / IF NOT EXISTS guards throughout so a
--     fresh `supabase db reset` replays cleanly.
--   * Pattern 7 (explicit grants): rail3-staging is a post-2026-05-30 project, so
--     implicit anon/authenticated grants are OFF — the new tables carry explicit,
--     role-matched GRANTs or they would 42501.
-- =====================================================================

-- 1. Rider live-state enum (Active / Stopped / Inactive / Dark) — idempotent.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'rider_live_state') THEN
    CREATE TYPE public.rider_live_state AS ENUM ('active', 'stopped', 'inactive', 'dark');
  END IF;
END $$;

-- 2. Additive columns on inherited tables (nullable / defaulted — web unchanged).
-- ride_participants: last known location, written at meaningful events only
-- (per Pillar II §2 — live pings are Broadcast-only, never per-ping DB writes).
ALTER TABLE public.ride_participants
  ADD COLUMN IF NOT EXISTS last_lat  double precision,
  ADD COLUMN IF NOT EXISTS last_long double precision,
  ADD COLUMN IF NOT EXISTS last_ping timestamptz;

-- tenants: configurable rider-state thresholds (defaults 2 / 5 / 15 min — Pillar II §3).
-- Prefixed rail3_ to signal Rail 3 ownership and avoid any collision.
ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS rail3_stopped_threshold_minutes  integer NOT NULL DEFAULT 2,
  ADD COLUMN IF NOT EXISTS rail3_inactive_threshold_minutes integer NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS rail3_dark_threshold_minutes     integer NOT NULL DEFAULT 15;

-- 3. beacon_alerts — Support Beacon events (Pillar II §2 schema). 4-hour Hard Purge.
-- tenant_id is denormalized (from the ride's tenant) so RLS can scope without
-- subquerying rides (recursion-safe, fast).
CREATE TABLE IF NOT EXISTS public.beacon_alerts (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL REFERENCES public.tenants(id)  ON DELETE CASCADE,
  ride_id             uuid NOT NULL REFERENCES public.rides(id)    ON DELETE CASCADE,
  rider_id            uuid NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  triggered_at        timestamptz NOT NULL DEFAULT now(),
  lat                 double precision,  -- location snapshot at trigger
  long                double precision,
  -- Rider's OWN uuid on self-cancel; Captain/SAG uuid when they cancel.
  -- NULL is reserved for system error ONLY (SD-011) — never written on a user cancel.
  -- ON DELETE RESTRICT (explicit): SET NULL is unavailable here because NULL has the
  -- reserved system-error meaning, and we won't silently rewrite the cancel actor.
  -- In practice the 4-hour Hard Purge clears these well before any account deletion.
  beacon_cancelled_by uuid REFERENCES public.accounts(id) ON DELETE RESTRICT,
  beacon_cancelled_at timestamptz
);
CREATE INDEX IF NOT EXISTS beacon_alerts_ride_idx   ON public.beacon_alerts (ride_id);
CREATE INDEX IF NOT EXISTS beacon_alerts_tenant_idx ON public.beacon_alerts (tenant_id);

-- 4. rider_states — active state per rider during a live ride. 4-hour Hard Purge.
-- One row per (ride_id, rider_id). Position is held on ride_participants.last_*;
-- this table holds the state-machine value (no Dark last-known retention beyond
-- the Hard Purge — full purge is the committed rule, F-08 pending).
CREATE TABLE IF NOT EXISTS public.rider_states (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  uuid NOT NULL REFERENCES public.tenants(id)  ON DELETE CASCADE,
  ride_id    uuid NOT NULL REFERENCES public.rides(id)    ON DELETE CASCADE,
  rider_id   uuid NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  state      public.rider_live_state NOT NULL DEFAULT 'active',
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (ride_id, rider_id)
);
CREATE INDEX IF NOT EXISTS rider_states_ride_idx   ON public.rider_states (ride_id);
CREATE INDEX IF NOT EXISTS rider_states_tenant_idx ON public.rider_states (tenant_id);

-- 5. RLS — tenant isolation (DoD-12). Scoped by the denormalized tenant_id vs the
-- SECURITY DEFINER helper get_my_tenant_id() (reads account_tenants; no recursion).
-- Within-tenant role-gating (e.g. Captain/SAG-only beacon visibility) is layered in
-- the feature tasks (W173/W175) on top of this tenant boundary.
ALTER TABLE public.beacon_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rider_states  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS beacon_alerts_tenant_select ON public.beacon_alerts;
DROP POLICY IF EXISTS beacon_alerts_tenant_insert ON public.beacon_alerts;
DROP POLICY IF EXISTS beacon_alerts_tenant_update ON public.beacon_alerts;
CREATE POLICY beacon_alerts_tenant_select ON public.beacon_alerts
  FOR SELECT TO authenticated USING (tenant_id = public.get_my_tenant_id());
CREATE POLICY beacon_alerts_tenant_insert ON public.beacon_alerts
  FOR INSERT TO authenticated WITH CHECK (tenant_id = public.get_my_tenant_id());
CREATE POLICY beacon_alerts_tenant_update ON public.beacon_alerts
  FOR UPDATE TO authenticated USING (tenant_id = public.get_my_tenant_id())
                              WITH CHECK (tenant_id = public.get_my_tenant_id());

DROP POLICY IF EXISTS rider_states_tenant_select ON public.rider_states;
DROP POLICY IF EXISTS rider_states_tenant_insert ON public.rider_states;
DROP POLICY IF EXISTS rider_states_tenant_update ON public.rider_states;
CREATE POLICY rider_states_tenant_select ON public.rider_states
  FOR SELECT TO authenticated USING (tenant_id = public.get_my_tenant_id());
CREATE POLICY rider_states_tenant_insert ON public.rider_states
  FOR INSERT TO authenticated WITH CHECK (tenant_id = public.get_my_tenant_id());
CREATE POLICY rider_states_tenant_update ON public.rider_states
  FOR UPDATE TO authenticated USING (tenant_id = public.get_my_tenant_id())
                              WITH CHECK (tenant_id = public.get_my_tenant_id());

-- 6. GRANTs (Pattern 7). Registered members write as `authenticated`; `service_role`
-- (edge functions + the 4-hour Hard Purge) gets full CRUD. NOT anon — the PoC is
-- registered-members-only (SD-008). DELETE is reserved for the Hard Purge.
GRANT SELECT, INSERT, UPDATE         ON public.beacon_alerts TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.beacon_alerts TO service_role;
GRANT SELECT, INSERT, UPDATE         ON public.rider_states  TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.rider_states  TO service_role;
