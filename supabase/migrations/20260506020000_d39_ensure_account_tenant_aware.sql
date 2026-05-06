-- D39 — ensure_account_exists() resolves tenant via LIMIT 1 (multi-tenant unsafe)
--
-- The previous definition (20260425000000_fix_ensure_account_claim.sql) used
-- `SELECT id FROM public.tenants LIMIT 1` to resolve the user's tenant. This
-- was correct in single-tenant deployment but broke once B&B and admin.vechelon.ca
-- existed: any user signing in at a non-row-1 subdomain ended up with an
-- account_tenants row at the wrong tenant.
--
-- Fix: add p_tenant_id parameter, raise an explicit exception if it is NULL.
-- The SPA passes useAppStore.currentTenantId from AuthPage. Callers that don't
-- update fail loudly rather than silently writing to the wrong tenant.
--
-- Per supabase-patterns Pattern 5 (migration idempotency for fresh deploys):
-- DROP both the old single-arg signature AND the new two-arg signature at the
-- top so a fresh `supabase db reset` replay never collides on signature.

DROP FUNCTION IF EXISTS public.ensure_account_exists(text);
DROP FUNCTION IF EXISTS public.ensure_account_exists(text, uuid);

CREATE OR REPLACE FUNCTION public.ensure_account_exists(
  p_session_cookie_id TEXT DEFAULT NULL,
  p_tenant_id         UUID DEFAULT NULL
)
RETURNS void AS $$
DECLARE
  v_tenant_id    UUID;
  v_enroll_mode  public.enrollment_mode;
  v_uid          UUID;
  v_email        TEXT;
  v_old_id       UUID;
  v_memberships  JSONB;
BEGIN
  v_uid   := auth.uid();
  v_email := auth.email();

  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_tenant_id IS NULL THEN
    RAISE EXCEPTION 'p_tenant_id is required (multi-tenant safety — see D39)';
  END IF;

  -- Resolve enrollment_mode from the explicit tenant. Raise if the tenant
  -- doesn't exist so a stale/invalid client tenantId can't silently no-op.
  SELECT enrollment_mode INTO v_enroll_mode
  FROM public.tenants
  WHERE id = p_tenant_id;

  IF v_enroll_mode IS NULL THEN
    RAISE EXCEPTION 'Tenant % not found', p_tenant_id;
  END IF;

  v_tenant_id := p_tenant_id;

  BEGIN
    INSERT INTO public.accounts (id, email, name, phone, session_cookie_id)
    VALUES (v_uid, v_email, null, null, p_session_cookie_id)
    ON CONFLICT (id) DO UPDATE
      SET email = EXCLUDED.email,
          session_cookie_id = COALESCE(public.accounts.session_cookie_id, p_session_cookie_id);
  EXCEPTION WHEN unique_violation THEN
    -- Email already owned by a different account row (stale UUID from deleted
    -- auth user). Claim it: transfer all FK references to the new auth UID,
    -- then update the PK. accounts.id is the single auth identity globally —
    -- preserve ALL existing memberships (across all tenants) so a multi-tenant
    -- user does not silently lose memberships when the email-claim path runs.
    SELECT id INTO v_old_id FROM public.accounts WHERE email = v_email;
    IF v_old_id IS NOT NULL THEN
      -- Snapshot every existing membership before we delete them. JSONB is
      -- used so we can survive the PK change and re-INSERT cleanly.
      SELECT jsonb_agg(jsonb_build_object(
        'tenant_id', tenant_id,
        'role',      role::text,
        'status',    status::text,
        'joined_at', joined_at
      ))
      INTO v_memberships
      FROM public.account_tenants
      WHERE account_id = v_old_id;

      DELETE FROM public.account_tenants  WHERE account_id = v_old_id;
      UPDATE public.ride_participants SET account_id = v_uid WHERE account_id = v_old_id;
      UPDATE public.rides             SET created_by = v_uid WHERE created_by = v_old_id;
      UPDATE public.ride_support      SET account_id = v_uid WHERE account_id = v_old_id;
      UPDATE public.route_library     SET created_by = v_uid WHERE created_by = v_old_id;
      UPDATE public.accounts          SET id         = v_uid WHERE id         = v_old_id;

      -- Restore every captured membership under the new account_id, preserving
      -- role/status/joined_at across all tenants.
      IF v_memberships IS NOT NULL THEN
        INSERT INTO public.account_tenants (account_id, tenant_id, role, status, joined_at)
        SELECT
          v_uid,
          (m->>'tenant_id')::uuid,
          (m->>'role')::public.account_role,
          (m->>'status')::public.account_status,
          (m->>'joined_at')::timestamptz
        FROM jsonb_array_elements(v_memberships) m
        ON CONFLICT DO NOTHING;
      END IF;

      -- If the resolving tenant has no membership row yet (claimed account was
      -- never a member at this tenant), fall through to the normal create path
      -- below by NOT returning early.
      IF EXISTS (
        SELECT 1 FROM public.account_tenants
        WHERE account_id = v_uid AND tenant_id = v_tenant_id
      ) THEN
        RETURN;
      END IF;
    END IF;
  END;

  -- Create membership at the resolving tenant if missing. Status reflects that
  -- tenant's enrollment_mode (open → affiliated, manual → initiated).
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

GRANT EXECUTE ON FUNCTION public.ensure_account_exists(text, uuid) TO authenticated;
