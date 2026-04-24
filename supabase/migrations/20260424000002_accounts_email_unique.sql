-- 1. Sync accounts.email to match auth.users.email (two rows drifted during manual cleanup)
UPDATE public.accounts a
SET email = u.email
FROM auth.users u
WHERE a.id = u.id AND a.email IS DISTINCT FROM u.email;

-- 2. Add UNIQUE constraint on accounts.email to enforce 1:1 email:account at the DB level
ALTER TABLE public.accounts ADD CONSTRAINT accounts_email_key UNIQUE (email);

-- 3. Update ensure_account_exists to also sync email on conflict so auth email changes propagate
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

  BEGIN
    INSERT INTO public.accounts (id, email, name, phone, session_cookie_id)
    VALUES (v_uid, v_email, null, null, p_session_cookie_id)
    ON CONFLICT (id) DO UPDATE
      SET email = EXCLUDED.email,
          session_cookie_id = COALESCE(public.accounts.session_cookie_id, p_session_cookie_id);
  EXCEPTION WHEN unique_violation THEN
    NULL;
  END;

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
