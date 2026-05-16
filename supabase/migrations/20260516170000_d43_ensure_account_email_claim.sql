-- D43: ensure_account_exists also claims orphan ride_participants by email
--
-- Companion to D42 (guest-rsvp EF email auto-link). D42 handles the forward
-- case "user RSVPs with email that matches an existing account". D43 handles
-- the cross-device case: user RSVPs as anonymous guest in browser A (no
-- account yet), later creates an account via magic link in browser B —
-- session_cookie_id never matches across browsers, so the previous
-- session_cookie_id-only claim logic left the row orphaned forever.
--
-- The claim path is authenticated (this RPC runs as the just-signed-in user
-- via SECURITY DEFINER + auth.uid()/auth.email()), so claiming by email is
-- an ownership-proven attribution — the user has just demonstrated control
-- of this email via the magic-link click-through.
--
-- Also harmonizes the role update: both the session_cookie_id claim path
-- (existing) and the new email claim path now set role='member' on claim,
-- not just account_id. Previously the session path left role='guest', which
-- caused claimed-but-guest rows to show with confusing legacy display.
--
-- Pattern 5 (idempotency): CREATE OR REPLACE FUNCTION is inherently
-- idempotent for re-apply. Backfill UPDATE at the bottom is idempotent via
-- WHERE clause (only acts on remaining role='guest' rows).

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

  -- D43: claim orphan ride_participants by both session_cookie_id (same-
  -- browser case, existing) AND lower(email) match (cross-device case, new).
  -- Both paths set role='member' so the claimed row stops displaying as a
  -- legacy guest entry. The OR allows a single UPDATE to cover both claim
  -- vectors; idempotent via account_id IS NULL filter.
  UPDATE public.ride_participants
  SET account_id = v_uid,
      role       = 'member'
  WHERE account_id IS NULL
    AND (
      (p_session_cookie_id IS NOT NULL AND session_cookie_id = p_session_cookie_id)
      OR
      (v_email IS NOT NULL AND email IS NOT NULL AND lower(email) = lower(v_email))
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.ensure_account_exists(text, uuid) TO authenticated;

-- One-off backfill: harmonize the 2 existing claimed-but-role='guest' rows
-- with the new claim semantics. Idempotent via the role='guest' filter —
-- already-member rows are untouched, and re-running the migration is a no-op.
UPDATE public.ride_participants
SET role = 'member'
WHERE account_id IS NOT NULL
  AND role = 'guest';

DO $$
DECLARE
  remaining_inconsistent INTEGER;
BEGIN
  SELECT count(*) INTO remaining_inconsistent
  FROM public.ride_participants
  WHERE account_id IS NOT NULL AND role = 'guest';
  IF remaining_inconsistent > 0 THEN
    RAISE NOTICE 'D43 backfill: % claimed-but-guest rows remain (unexpected)', remaining_inconsistent;
  ELSE
    RAISE NOTICE 'D43 backfill: role harmonization complete';
  END IF;
END $$;
