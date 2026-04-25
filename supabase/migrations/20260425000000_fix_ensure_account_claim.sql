-- When a user's auth account is deleted and Supabase creates a new one with the same
-- email (new UUID), the INSERT hits accounts_email_key. Previously we silently skipped,
-- leaving the new auth user authenticated but accountless. Now we claim the old account
-- by transferring all FK references to the new UUID, preserving role/status/joined_at.
CREATE OR REPLACE FUNCTION public.ensure_account_exists(p_session_cookie_id TEXT DEFAULT NULL)
RETURNS void AS $$
DECLARE
  v_tenant_id    UUID;
  v_enroll_mode  public.enrollment_mode;
  v_uid          UUID;
  v_email        TEXT;
  v_old_id       UUID;
  v_old_role     TEXT;
  v_old_status   public.account_status;
  v_old_joined   TIMESTAMPTZ;
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
      SET session_cookie_id = COALESCE(public.accounts.session_cookie_id, p_session_cookie_id);
  EXCEPTION WHEN unique_violation THEN
    -- Email already owned by a different account row (stale UUID from deleted auth user).
    -- Claim it: transfer all FK references to the new auth UID, then update the PK.
    SELECT id INTO v_old_id FROM public.accounts WHERE email = v_email;
    IF v_old_id IS NOT NULL THEN
      SELECT role, status, joined_at
        INTO v_old_role, v_old_status, v_old_joined
        FROM public.account_tenants
       WHERE account_id = v_old_id AND tenant_id = v_tenant_id;

      -- Transfer FKs before updating PK to avoid FK violations
      DELETE FROM public.account_tenants  WHERE account_id = v_old_id;
      UPDATE public.ride_participants SET account_id = v_uid WHERE account_id = v_old_id;
      UPDATE public.rides             SET created_by = v_uid WHERE created_by = v_old_id;
      UPDATE public.ride_support      SET account_id = v_uid WHERE account_id = v_old_id;
      UPDATE public.route_library     SET created_by = v_uid WHERE created_by = v_old_id;
      UPDATE public.accounts          SET id         = v_uid WHERE id         = v_old_id;

      -- Restore membership preserving original joined_at
      IF v_old_joined IS NOT NULL THEN
        INSERT INTO public.account_tenants (account_id, tenant_id, role, status, joined_at)
        VALUES (v_uid, v_tenant_id, v_old_role, v_old_status, v_old_joined)
        ON CONFLICT DO NOTHING;
      END IF;
      RETURN;
    END IF;
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
