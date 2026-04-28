-- W126 (MT-S0-07) — Platform Admin RLS read-all bypass policies
--
-- Per VoC/MT/IA Pillar II §4.3. Additive SELECT policies grant cross-tenant
-- read access to platform_admin=true accounts. Existing tenant-scoped policies
-- remain in force for non-platform-admin users.
--
-- Tables covered: tenants, rides, accounts, account_tenants, route_library,
-- ride_participants (non-location fields enforced at the application layer +
-- via the ride_participants_pa_view defined below).
--
-- Tables EXPLICITLY EXCLUDED:
--   analytics_events — Sr PM service-role only per VMT-D-23 / Pillar II §4.3.
--                      No platform_admin policy here, by design.
--
-- Privacy guarantee for ride_participants location data:
--   The 4-hour purge applies universally including platform_admin (Pillar I §2,
--   VMT-D-07). Platform Admin UI (W129) MUST query ride_participants_pa_view
--   for ride_participant data — never the table directly. The view excludes
--   last_lat / last_long / last_ping / beacon_active. RLS at the table level
--   technically allows reading those columns; the view + UI discipline is the
--   privacy contract per CP-MT-03.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. SELECT bypass policies (additive — do NOT modify existing tenant-scoped
--    policies; they continue to apply to non-platform-admin users)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE POLICY "platform_admin_read_all_tenants"
  ON public.tenants
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.accounts a
      WHERE a.id = auth.uid() AND a.platform_admin = true
    )
  );

CREATE POLICY "platform_admin_read_all_rides"
  ON public.rides
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.accounts a
      WHERE a.id = auth.uid() AND a.platform_admin = true
    )
  );

CREATE POLICY "platform_admin_read_all_accounts"
  ON public.accounts
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.accounts a
      WHERE a.id = auth.uid() AND a.platform_admin = true
    )
  );

CREATE POLICY "platform_admin_read_all_account_tenants"
  ON public.account_tenants
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.accounts a
      WHERE a.id = auth.uid() AND a.platform_admin = true
    )
  );

CREATE POLICY "platform_admin_read_all_route_library"
  ON public.route_library
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.accounts a
      WHERE a.id = auth.uid() AND a.platform_admin = true
    )
  );

CREATE POLICY "platform_admin_read_all_ride_participants"
  ON public.ride_participants
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.accounts a
      WHERE a.id = auth.uid() AND a.platform_admin = true
    )
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Privacy-safe ride_participants view for Platform Admin queries
-- ─────────────────────────────────────────────────────────────────────────────
-- Excludes live tracking columns (last_lat, last_long, last_ping, beacon_active).
-- The Platform Admin UI (W129) MUST use this view, never the table directly.
-- A grep audit during W129 implementation enforces the contract.

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
  'Privacy-safe projection of ride_participants for the Platform Admin surface (W129). Excludes last_lat / last_long / last_ping / beacon_active. The 4-hour purge applies universally per VMT-D-07 — this view enforces the privacy contract at the read interface in addition. Platform Admin UI MUST query this view, not the table directly. See VoC/MT/IA Pillar II §4.3 + Pillar III CP-MT-03.';

-- View is created WITH (security_invoker = true) so RLS evaluates against
-- the calling user's role, not the view owner's. The platform_admin SELECT
-- policy above grants read through this view as well, while preserving
-- tenant-scoped policies for non-platform-admin callers.

COMMENT ON POLICY "platform_admin_read_all_ride_participants" ON public.ride_participants IS
  'Grants SELECT to platform_admin across tenant boundaries. Application discipline (W129 + ride_participants_pa_view) enforces the location-field exclusion required by Pillar II §4.3 and CP-MT-03 — RLS is row-level, not column-level, so this policy alone does not exclude last_lat / last_long / last_ping. Always query ride_participants_pa_view from the Platform Admin UI for ALL ride_participants reads — including reads of the platform_admin''s own tenant. Do not branch on tenant_id = my_tenant_id and bypass the view; the privacy contract applies globally regardless of tenant membership. W129 must add a build-time grep audit (e.g., a test scanning admin-app source for raw `from(''ride_participants'')` calls in PlatformAdmin/ paths) to enforce the contract automatically.';
