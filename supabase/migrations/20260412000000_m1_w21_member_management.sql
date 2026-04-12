-- M1-W21: Member Directory Management
-- Adds admin visibility policies and affiliate_member RPC

-- 1. Admins can see all account_tenants rows for their tenant
--    (existing policy only allows users to see their own row)
CREATE POLICY account_tenants_admin_select ON account_tenants
    FOR SELECT USING (
        is_tenant_admin(tenant_id)
    );

-- 2. Admins can see all accounts belonging to their tenant
CREATE POLICY account_admin_select ON accounts
    FOR SELECT USING (
        is_tenant_admin(get_my_tenant_id())
        AND id IN (
            SELECT account_id FROM public.account_tenants
            WHERE tenant_id = get_my_tenant_id()
        )
    );

-- 3. affiliate_member RPC — admin-only, promotes initiated → affiliated
CREATE OR REPLACE FUNCTION affiliate_member(target_account_id UUID)
RETURNS VOID AS $$
BEGIN
  IF NOT is_tenant_admin(get_my_tenant_id()) THEN
    RAISE EXCEPTION 'Permission denied: only admins can affiliate members';
  END IF;

  UPDATE account_tenants
  SET status = 'affiliated'
  WHERE account_id = target_account_id
    AND tenant_id = get_my_tenant_id()
    AND status = 'initiated';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Member not found or not in initiated state';
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
