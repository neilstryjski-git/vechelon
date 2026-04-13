-- CLEANUP: Remove broken policies that reference deleted accounts.tenant_id column
-- And replace them with correct implementations for the prototype

-- 1. Drop broken policies
DROP POLICY IF EXISTS tenant_isolation ON tenants;
DROP POLICY IF EXISTS account_tenant_isolation ON accounts;
DROP POLICY IF EXISTS ride_tenant_isolation ON rides;
DROP POLICY IF EXISTS route_library_isolation ON route_library;

-- 2. Ensure robust Route Library policies
-- Note: route_library_affiliated_select already exists for SELECT
DROP POLICY IF EXISTS route_library_admin_all ON route_library;
CREATE POLICY route_library_admin_all ON route_library
    FOR ALL USING (
        (auth.uid() IS NULL) -- DEV BYPASS: Allow anonymous for prototype
        OR
        EXISTS (
            SELECT 1 FROM public.account_tenants 
            WHERE tenant_id = route_library.tenant_id 
            AND account_id = auth.uid() 
            AND role = 'admin'
        )
    );

-- 3. Ensure robust Ride policies
-- Note: ride_tiered_select, ride_admin_insert, ride_admin_modify already exist
-- We just need to make sure they don't conflict with the ones we dropped.

-- 4. Fix is_tenant_admin to handle prototype anonymous mode
CREATE OR REPLACE FUNCTION is_tenant_admin(t_id UUID)
RETURNS BOOLEAN AS $$
  BEGIN
    -- If not logged in, we are "admin" for the prototype
    IF auth.uid() IS NULL THEN
      RETURN TRUE;
    END IF;

    RETURN EXISTS (
      SELECT 1 FROM public.account_tenants 
      WHERE tenant_id = t_id 
      AND account_id = auth.uid() 
      AND role = 'admin'
    );
  END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
