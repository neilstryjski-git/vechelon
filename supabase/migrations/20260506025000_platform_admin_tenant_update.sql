-- W154 — Platform Admin: interactive provisioning checklist
--
-- Adds two provisioning-state columns to tenants and an UPDATE policy
-- so platform_admin can save branding, mark subdomain verified, and
-- mark RLS tested directly from admin.vechelon.ca.

-- ─────────────────────────────────────────────────────────────────────────────
-- Idempotency (Pattern 5)
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "platform_admin_update_tenant" ON public.tenants;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Provisioning state columns
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS subdomain_verified BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS rls_tested         BOOLEAN NOT NULL DEFAULT false;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. UPDATE policy — platform_admin only
-- ─────────────────────────────────────────────────────────────────────────────
-- Pattern 1: uses is_platform_admin() SECURITY DEFINER helper.
-- tenants has no policy that references accounts, so there is no recursion
-- risk here — but we use the helper anyway for consistency and future safety.
CREATE POLICY "platform_admin_update_tenant"
  ON public.tenants FOR UPDATE TO authenticated
  USING     (public.is_platform_admin())
  WITH CHECK (public.is_platform_admin());

COMMENT ON POLICY "platform_admin_update_tenant" ON public.tenants IS
  'Allows platform_admin to UPDATE tenant records (branding fields, subdomain_verified, rls_tested) from admin.vechelon.ca. Gated via is_platform_admin() SECURITY DEFINER helper per Pattern 1.';
