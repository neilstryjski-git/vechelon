-- W129 — Platform Admin: INSERT policies + create_club RPC
--
-- Enables platform_admin to INSERT into tenants and account_tenants,
-- and provides a SECURITY DEFINER create_club function for atomic
-- club provisioning (slug + name + enrollment_mode + first admin).

-- ─────────────────────────────────────────────────────────────────────────────
-- Idempotency (Pattern 5 — DROP IF EXISTS before every artifact this creates)
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY   IF EXISTS "platform_admin_insert_tenant"         ON public.tenants;
DROP POLICY   IF EXISTS "platform_admin_insert_account_tenant" ON public.account_tenants;
DROP FUNCTION IF EXISTS public.create_club(text, text, text, text);

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. INSERT policy on tenants — platform_admin only
-- ─────────────────────────────────────────────────────────────────────────────
-- Pattern 1: uses is_platform_admin() SECURITY DEFINER helper, NOT an inline
-- EXISTS on accounts (which would recurse through accounts RLS).
CREATE POLICY "platform_admin_insert_tenant"
  ON public.tenants FOR INSERT TO authenticated
  WITH CHECK (public.is_platform_admin());

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. INSERT policy on account_tenants — platform_admin only
-- ─────────────────────────────────────────────────────────────────────────────
CREATE POLICY "platform_admin_insert_account_tenant"
  ON public.account_tenants FOR INSERT TO authenticated
  WITH CHECK (public.is_platform_admin());

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. create_club — SECURITY DEFINER function for atomic club provisioning
-- ─────────────────────────────────────────────────────────────────────────────
-- Combines the two INSERTs so the client never makes two separate round-trips.
-- Looks up the first admin by email through accounts.email (accessible via
-- SECURITY DEFINER without the self-referencing recursion risk).
-- Returns jsonb { tenant_id, admin_linked } so the caller knows whether the
-- first-admin account_tenants row was created or is pending invite.
CREATE OR REPLACE FUNCTION public.create_club(
  p_slug             text,
  p_name             text,
  p_enrollment_mode  text,
  p_first_admin_email text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id    uuid;
  v_account_id   uuid;
  v_admin_linked boolean := false;
BEGIN
  -- Gate: platform_admin only
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'permission_denied: platform admin required';
  END IF;

  -- Slug validation: URL-safe lowercase + hyphens, no leading/trailing hyphen
  IF p_slug !~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?$' THEN
    RAISE EXCEPTION 'invalid_slug: must be lowercase letters, numbers, and hyphens (no leading/trailing hyphen)';
  END IF;

  -- Block neil.stryjski@gmail.com as first admin (VMT-D-32)
  IF lower(trim(p_first_admin_email)) = 'neil.stryjski@gmail.com' THEN
    RAISE EXCEPTION 'first_admin_email_blocked: this email cannot be the first admin of a new club (VMT-D-32)';
  END IF;

  -- Insert tenant with stub branding (Sr PM supplies final assets per VMT-D-36)
  INSERT INTO public.tenants (slug, name, enrollment_mode, primary_color, accent_color)
  VALUES (
    lower(trim(p_slug)),
    trim(p_name),
    p_enrollment_mode::public.enrollment_mode,
    '#3B82F6',
    '#10B981'
  )
  RETURNING id INTO v_tenant_id;

  -- Attempt to link first admin by email
  SELECT id INTO v_account_id
  FROM public.accounts
  WHERE lower(email) = lower(trim(p_first_admin_email))
  LIMIT 1;

  IF v_account_id IS NOT NULL THEN
    INSERT INTO public.account_tenants (tenant_id, account_id, role, status)
    VALUES (v_tenant_id, v_account_id, 'admin', 'affiliated')
    ON CONFLICT (account_id, tenant_id) DO UPDATE
      SET role = 'admin', status = 'affiliated';
    v_admin_linked := true;
  END IF;

  RETURN jsonb_build_object(
    'tenant_id',    v_tenant_id,
    'admin_linked', v_admin_linked
  );
END;
$$;

REVOKE ALL ON FUNCTION public.create_club(text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_club(text, text, text, text) TO authenticated;

COMMENT ON FUNCTION public.create_club(text, text, text, text) IS
  'Atomic club provisioning for platform_admin. Inserts a new tenant with stub branding colors (Sr PM supplies final assets per VMT-D-36). Looks up first_admin_email in accounts.email; if found, creates account_tenants row with role=admin. If not found, admin_linked=false and the checklist prompts an invite. Blocks neil.stryjski@gmail.com as first_admin_email per VMT-D-32. Returns {tenant_id, admin_linked}.';
