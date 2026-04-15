-- DEV BYPASS: allow affiliate_member to run without auth (mirrors waypoints bypass)
-- Only enforces admin check when a user is actually authenticated
CREATE OR REPLACE FUNCTION affiliate_member(target_account_id UUID)
RETURNS VOID AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND NOT is_tenant_admin(get_my_tenant_id()) THEN
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
