-- ensure_account_exists(text) was never created in production — only the no-arg version from
-- 20260414000002 exists. The CREATE OR REPLACE in 20260414000003 produced a different overload
-- that was never committed. Drop the stale no-arg version and recreate the correct signature.

DROP FUNCTION IF EXISTS public.ensure_account_exists();

CREATE OR REPLACE FUNCTION public.ensure_account_exists(p_session_cookie_id TEXT DEFAULT NULL)
RETURNS void AS $$
DECLARE
  v_tenant_id UUID;
  v_enroll_mode public.enrollment_mode;
  v_uid UUID;
  v_email TEXT;
BEGIN
  v_uid   := auth.uid();
  v_email := auth.email();

  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT id, enrollment_mode INTO v_tenant_id, v_enroll_mode FROM public.tenants LIMIT 1;

  INSERT INTO public.accounts (id, email, name, phone, session_cookie_id)
  VALUES (v_uid, v_email, null, null, p_session_cookie_id)
  ON CONFLICT (id) DO UPDATE
  SET session_cookie_id = COALESCE(public.accounts.session_cookie_id, p_session_cookie_id);

  IF NOT EXISTS (
    SELECT 1 FROM public.account_tenants
    WHERE account_id = v_uid AND tenant_id = v_tenant_id
  ) THEN
    INSERT INTO public.account_tenants (account_id, tenant_id, role, status)
    VALUES (
      v_uid,
      v_tenant_id,
      'member',
      CASE WHEN v_enroll_mode = 'open' THEN 'affiliated'::account_status ELSE 'initiated'::account_status END
    );
  END IF;

  IF p_session_cookie_id IS NOT NULL THEN
    UPDATE public.ride_participants
    SET account_id = v_uid
    WHERE session_cookie_id = p_session_cookie_id
      AND account_id IS NULL;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.ensure_account_exists(text) TO authenticated;
