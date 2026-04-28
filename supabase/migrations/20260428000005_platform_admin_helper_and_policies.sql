-- W126 redo (post-hotfix) — Platform Admin RLS via SECURITY DEFINER helper
--
-- INCIDENT: The original W126 migration (20260428000002_platform_admin_rls.sql)
-- created six SELECT policies that used `EXISTS (SELECT 1 FROM accounts a WHERE
-- a.id = auth.uid() AND a.platform_admin = true)`. The accounts policy itself
-- was self-referencing — Postgres' RLS evaluation on the inner SELECT either
-- erred with "infinite recursion in policy" or returned NULL silently, which
-- poisoned downstream queries (notably useTierDetection's account_tenants
-- lookup) and broke login on production for affiliated members.
--
-- HOTFIX (2026-04-28 ~16:00 UTC): All six policies + the view dropped via
-- ad-hoc Management API DROP. Login restored immediately.
--
-- THIS MIGRATION: re-introduces Platform Admin read-all access using a
-- SECURITY DEFINER helper function that bypasses RLS for the inner check.
-- This is the standard Supabase pattern for self-referencing policies.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Helper function — SECURITY DEFINER bypasses RLS on the accounts read
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.is_platform_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT platform_admin FROM public.accounts WHERE id = auth.uid()),
    false
  );
$$;

COMMENT ON FUNCTION public.is_platform_admin() IS
  'Returns true if the calling JWT belongs to a platform_admin account. SECURITY DEFINER bypasses accounts RLS so this can be safely called from RLS policies without triggering self-referencing recursion. Replaces the inline EXISTS pattern in the original W126 migration which broke login by recursing through accounts RLS.';

REVOKE ALL ON FUNCTION public.is_platform_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_platform_admin() TO authenticated, anon;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Re-create the six platform_admin SELECT policies — additive, non-recursive
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Defensive idempotency for fresh deploys: the original W126 migration
-- (20260428000002) creates policies with these same names. Production was
-- hotfixed via Management API DROP, but local dev / fresh-deploy environments
-- replay both migrations in sequence and would otherwise fail on duplicate
-- policy names. Drop-if-exists makes this migration idempotent against any
-- starting state.

DROP POLICY IF EXISTS "platform_admin_read_all_tenants"          ON public.tenants;
DROP POLICY IF EXISTS "platform_admin_read_all_rides"            ON public.rides;
DROP POLICY IF EXISTS "platform_admin_read_all_accounts"         ON public.accounts;
DROP POLICY IF EXISTS "platform_admin_read_all_account_tenants"  ON public.account_tenants;
DROP POLICY IF EXISTS "platform_admin_read_all_route_library"    ON public.route_library;
DROP POLICY IF EXISTS "platform_admin_read_all_ride_participants" ON public.ride_participants;
DROP VIEW   IF EXISTS public.ride_participants_pa_view;

CREATE POLICY "platform_admin_read_all_tenants"
  ON public.tenants FOR SELECT TO authenticated
  USING (public.is_platform_admin());

CREATE POLICY "platform_admin_read_all_rides"
  ON public.rides FOR SELECT TO authenticated
  USING (public.is_platform_admin());

CREATE POLICY "platform_admin_read_all_accounts"
  ON public.accounts FOR SELECT TO authenticated
  USING (public.is_platform_admin());

CREATE POLICY "platform_admin_read_all_account_tenants"
  ON public.account_tenants FOR SELECT TO authenticated
  USING (public.is_platform_admin());

CREATE POLICY "platform_admin_read_all_route_library"
  ON public.route_library FOR SELECT TO authenticated
  USING (public.is_platform_admin());

CREATE POLICY "platform_admin_read_all_ride_participants"
  ON public.ride_participants FOR SELECT TO authenticated
  USING (public.is_platform_admin());

COMMENT ON POLICY "platform_admin_read_all_ride_participants" ON public.ride_participants IS
  'Grants SELECT to platform_admin across tenant boundaries. Application discipline (W129 + ride_participants_pa_view) enforces the location-field exclusion required by Pillar II §4.3 and CP-MT-03 — RLS is row-level, not column-level. Always query ride_participants_pa_view from the Platform Admin UI for ALL ride_participants reads, including reads of the platform_admin''s own tenant. Do not branch on tenant_id = my_tenant_id and bypass the view; the privacy contract applies globally regardless of tenant membership. W129 must add a build-time grep audit to enforce the contract automatically.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Re-create the privacy-safe ride_participants view
-- ─────────────────────────────────────────────────────────────────────────────
-- Excludes live tracking columns (last_lat, last_long, last_ping, beacon_active).
-- security_invoker = true ensures RLS evaluates as the calling user, so the
-- platform_admin SELECT policy above governs access through the view.

CREATE OR REPLACE VIEW public.ride_participants_pa_view
WITH (security_invoker = true) AS
SELECT
  id,
  ride_id,
  account_id,
  session_cookie_id,
  display_name,
  phone,
  role,
  status,
  joined_at,
  group_id
FROM public.ride_participants;

COMMENT ON VIEW public.ride_participants_pa_view IS
  'Privacy-safe projection of ride_participants for the Platform Admin surface (W129). Excludes last_lat / last_long / last_ping / beacon_active. The 4-hour purge applies universally per VMT-D-07; this view enforces the privacy contract at the read interface in addition. Platform Admin UI MUST query this view, never the table directly. See VoC/MT/IA Pillar II §4.3 + Pillar III CP-MT-03.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. analytics_events explicitly NOT covered
-- ─────────────────────────────────────────────────────────────────────────────
-- Same as the original W126 — no platform_admin policy on analytics_events
-- per VMT-D-23 / Pillar II §4.3. Sr PM accesses via service_role only.
