-- VEcheLOn Pillar V: Schema Amendments
-- Fulfills Amendment A-01 and A-02

-- 1. [A-02] Update tenants table
ALTER TABLE tenants
ADD COLUMN show_calendar_to_pending BOOLEAN DEFAULT FALSE;

-- 2. [A-01] Create account_tenants junction table
CREATE TABLE account_tenants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    role account_role NOT NULL DEFAULT 'member',
    status account_status NOT NULL DEFAULT 'initiated',
    joined_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    UNIQUE(account_id, tenant_id) -- Ensure one relationship per club
);

-- 3. [A-01] Data Migration (for existing accounts)
-- Move current single tenant_id/role into the junction table
INSERT INTO account_tenants (account_id, tenant_id, role, status)
SELECT id, tenant_id, role, status FROM accounts;

-- 4. Drop policies that depend on accounts.tenant_id / accounts.role before dropping columns
DROP POLICY IF EXISTS account_select_policy ON accounts;
DROP POLICY IF EXISTS account_update_policy ON accounts;

-- 5. Update utility functions to read from account_tenants instead of accounts
CREATE OR REPLACE FUNCTION get_my_tenant_id()
RETURNS UUID AS $$
  SELECT tenant_id FROM public.account_tenants WHERE account_id = auth.uid() LIMIT 1;
$$ LANGUAGE sql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION get_my_role()
RETURNS public.account_role AS $$
  SELECT role FROM public.account_tenants WHERE account_id = auth.uid() LIMIT 1;
$$ LANGUAGE sql SECURITY DEFINER;

-- 6. [A-01] Cleanup accounts table — columns are now in account_tenants
ALTER TABLE accounts DROP COLUMN tenant_id;
ALTER TABLE accounts DROP COLUMN role;
ALTER TABLE accounts DROP COLUMN status;

-- 7. RE-ENABLE RLS on junction table
ALTER TABLE account_tenants ENABLE ROW LEVEL SECURITY;

-- 8. RLS for account_tenants — users see only their own memberships
CREATE POLICY account_tenants_select_policy ON account_tenants
    FOR SELECT USING (account_id = auth.uid());

-- 9. Recreate account policies using updated functions (no direct tenant_id reference)
CREATE POLICY account_select_policy ON accounts
    FOR SELECT USING (
        id IN (
            SELECT account_id FROM public.account_tenants
            WHERE tenant_id = get_my_tenant_id()
        )
    );

CREATE POLICY account_update_policy ON accounts
    FOR UPDATE USING (id = auth.uid());
