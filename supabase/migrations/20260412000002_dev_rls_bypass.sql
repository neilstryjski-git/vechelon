-- DEV BYPASS: Allow public read access for prototyping without Auth
-- Fulfills unblocking the Dashboard and Route Library pages

-- 1. Update utility function to handle unauthenticated sessions
CREATE OR REPLACE FUNCTION get_my_tenant_id()
RETURNS UUID AS $$
  DECLARE
    tid UUID;
  BEGIN
    -- Try to get real tenant from account
    SELECT tenant_id INTO tid FROM public.accounts WHERE id = auth.uid();
    
    -- FALLBACK: If not logged in, return the first tenant found in the DB 
    -- so the UI isn't empty during prototyping.
    IF tid IS NULL THEN
      SELECT id INTO tid FROM public.tenants LIMIT 1;
    END IF;
    
    RETURN tid;
  END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Add Public Select Policies
-- RIDES
CREATE POLICY dev_public_select_rides ON rides FOR SELECT USING (true);

-- ACCOUNTS
CREATE POLICY dev_public_select_accounts ON accounts FOR SELECT USING (true);

-- ACCOUNT_TENANTS
CREATE POLICY dev_public_select_account_tenants ON account_tenants FOR SELECT USING (true);

-- ROUTE_LIBRARY
CREATE POLICY dev_public_select_routes ON route_library FOR SELECT USING (true);

-- TENANTS
CREATE POLICY dev_public_select_tenants ON tenants FOR SELECT USING (true);
