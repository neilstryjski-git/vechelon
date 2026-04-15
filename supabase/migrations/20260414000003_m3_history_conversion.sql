-- M3: History Conversion Logic (Scenario G2)
-- Fulfills Task W59: Implement Linked History Logic (Post-Registration)

-- 1. Update ensure_account_exists to support session linking
CREATE OR REPLACE FUNCTION ensure_account_exists(p_session_cookie_id TEXT DEFAULT NULL)
RETURNS void AS $$
DECLARE
  v_tenant_id UUID;
  v_uid UUID;
  v_email TEXT;
BEGIN
  v_uid   := auth.uid();
  v_email := auth.email();

  -- Require auth
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Resolve tenant (dev: first tenant)
  SELECT id INTO v_tenant_id FROM public.tenants LIMIT 1;

  -- Upsert account row (and sync session cookie if provided)
  INSERT INTO public.accounts (id, email, name, phone, session_cookie_id)
  VALUES (v_uid, v_email, null, null, p_session_cookie_id)
  ON CONFLICT (id) DO UPDATE 
  SET session_cookie_id = COALESCE(public.accounts.session_cookie_id, p_session_cookie_id);

  -- Create tenant membership if not already present
  IF NOT EXISTS (
    SELECT 1 FROM public.account_tenants
    WHERE account_id = v_uid AND tenant_id = v_tenant_id
  ) THEN
    INSERT INTO public.account_tenants (account_id, tenant_id, role, status)
    VALUES (v_uid, v_tenant_id, 'member', 'initiated');
  END IF;

  -- Scenario G2: Link history from session cookie
  IF p_session_cookie_id IS NOT NULL THEN
    UPDATE public.ride_participants
    SET account_id = v_uid
    WHERE session_cookie_id = p_session_cookie_id
      AND account_id IS NULL;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
