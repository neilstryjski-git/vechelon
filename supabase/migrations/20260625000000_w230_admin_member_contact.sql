-- W230: Admin completes member contact details -> auto-promote initiated -> affiliated
--
-- Additive: one new SECURITY DEFINER RPC. No schema/table changes, no new grants
-- to anon/authenticated on tables (so the 2026-10-30 Data-API grant rule does not apply).
--
-- Today an admin can VIEW a member's contact details (Members.tsx) but has no way to
-- EDIT them, and completing details has no effect on membership status. This RPC lets a
-- tenant admin write a member's contact details AND, in the same transaction, promote
-- initiated -> affiliated when BOTH name and phone are present. The name+phone rule
-- mirrors the bulk-import provisioning logic (W216) so the two paths agree.
--
-- supabase-patterns:
--   * Pattern 1 — SECURITY DEFINER bypasses RLS for the inner writes; admin gate uses the
--     existing is_tenant_admin()/get_my_tenant_id() helpers (themselves SECURITY DEFINER),
--     so there is no self-referencing RLS recursion. SET search_path = public.
--   * Pattern 5 — DROP FUNCTION IF EXISTS at the top for idempotent fresh deploys.
--   * REVOKE ALL FROM PUBLIC / GRANT EXECUTE TO authenticated (explicit minimal grant).

DROP FUNCTION IF EXISTS public.admin_update_member_contact(uuid, text, text, text, text);

CREATE OR REPLACE FUNCTION public.admin_update_member_contact(
  target_account_id          uuid,
  p_name                     text,
  p_phone                    text,
  p_emergency_contact_name   text,
  p_emergency_contact_phone  text
)
RETURNS text  -- the resulting account_tenants.status (so the UI can report a promotion)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id uuid := get_my_tenant_id();
  v_name      text := NULLIF(btrim(p_name), '');
  v_phone     text := NULLIF(btrim(p_phone), '');
  v_ec_name   text := NULLIF(btrim(p_emergency_contact_name), '');
  v_ec_phone  text := NULLIF(btrim(p_emergency_contact_phone), '');
  v_status    public.account_status;
BEGIN
  -- Admin gate: only a tenant admin may edit member contact details.
  IF NOT is_tenant_admin(v_tenant_id) THEN
    RAISE EXCEPTION 'Permission denied: only tenant admins can edit member contact details';
  END IF;

  -- Target must be a member of the caller's tenant (prevents editing arbitrary global accounts).
  SELECT status INTO v_status
  FROM account_tenants
  WHERE account_id = target_account_id
    AND tenant_id  = v_tenant_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Member not found in your tenant';
  END IF;

  -- Write the contact details to the (global) accounts profile.
  UPDATE accounts
  SET name                    = v_name,
      phone                   = v_phone,
      emergency_contact_name  = v_ec_name,
      emergency_contact_phone = v_ec_phone
  WHERE id = target_account_id;

  -- Auto-promote: initiated -> affiliated ONLY when both name and phone are present.
  -- Never downgrade; never touch suspended / archived / deleted members.
  IF v_status = 'initiated' AND v_name IS NOT NULL AND v_phone IS NOT NULL THEN
    UPDATE account_tenants
    SET status = 'affiliated'
    WHERE account_id = target_account_id
      AND tenant_id  = v_tenant_id
      AND status     = 'initiated';
    v_status := 'affiliated';
  END IF;

  RETURN v_status::text;
END;
$$;

REVOKE ALL    ON FUNCTION public.admin_update_member_contact(uuid, text, text, text, text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.admin_update_member_contact(uuid, text, text, text, text) TO authenticated;
