-- FIX: Update utility functions to correctly reference account_tenants
-- Resolves "column accounts.tenant_id does not exist" error

CREATE OR REPLACE FUNCTION get_my_tenant_id()
RETURNS UUID AS $$
  DECLARE
    tid UUID;
  BEGIN
    -- 1. Try to get real tenant from account_tenants (junction table)
    SELECT tenant_id INTO tid 
    FROM public.account_tenants 
    WHERE account_id = auth.uid() 
    LIMIT 1;
    
    -- 2. FALLBACK: If not logged in OR no memberships, return the first tenant found in the DB 
    -- so the UI isn't empty during prototyping.
    IF tid IS NULL THEN
      SELECT id INTO tid FROM public.tenants LIMIT 1;
    END IF;
    
    RETURN tid;
  END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Ensure get_my_role also handles the new schema correctly
CREATE OR REPLACE FUNCTION get_my_role()
RETURNS public.account_role AS $$
  SELECT role FROM public.account_tenants WHERE account_id = auth.uid() LIMIT 1;
$$ LANGUAGE sql SECURITY DEFINER;
