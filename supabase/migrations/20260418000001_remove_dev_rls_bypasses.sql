-- SECURITY: Remove all dev RLS bypasses before production use
-- These were added during prototyping to allow unauthenticated access.
-- All anonymous shortcuts are removed; proper auth is now required.

-- 1. Drop anonymous SELECT bypass policies (added in 20260412000002_dev_rls_bypass.sql)
DROP POLICY IF EXISTS dev_public_select_rides ON rides;
DROP POLICY IF EXISTS dev_public_select_accounts ON accounts;
DROP POLICY IF EXISTS dev_public_select_account_tenants ON account_tenants;
DROP POLICY IF EXISTS dev_public_select_routes ON route_library;
DROP POLICY IF EXISTS dev_public_select_tenants ON tenants;

-- 2. Restore get_my_tenant_id() — remove fallback to first tenant when unauthenticated
CREATE OR REPLACE FUNCTION get_my_tenant_id()
RETURNS UUID AS $$
  SELECT tenant_id FROM public.account_tenants WHERE account_id = auth.uid() LIMIT 1;
$$ LANGUAGE sql SECURITY DEFINER;

-- 3. Restore is_tenant_admin() — remove auth.uid() IS NULL → TRUE bypass
CREATE OR REPLACE FUNCTION is_tenant_admin(t_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.account_tenants
    WHERE tenant_id = t_id
    AND account_id = auth.uid()
    AND role = 'admin'
  );
$$ LANGUAGE sql SECURITY DEFINER;

-- 4. Restore waypoints_modify_policy — remove anonymous write access
DROP POLICY IF EXISTS waypoints_modify_policy ON waypoints;
CREATE POLICY waypoints_modify_policy ON waypoints
    FOR ALL USING (
        ride_id IN (
            SELECT id FROM rides
            WHERE created_by = auth.uid()
               OR get_my_role() = 'admin'
        )
    )
    WITH CHECK (
        ride_id IN (
            SELECT id FROM rides
            WHERE created_by = auth.uid()
               OR get_my_role() = 'admin'
        )
    );

-- 5. Restore route_library_admin_all — remove anonymous bypass
DROP POLICY IF EXISTS route_library_admin_all ON route_library;
CREATE POLICY route_library_admin_all ON route_library
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.account_tenants
            WHERE tenant_id = route_library.tenant_id
            AND account_id = auth.uid()
            AND role = 'admin'
        )
    );

-- 6. Restore affiliate_member() — always require admin auth
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
