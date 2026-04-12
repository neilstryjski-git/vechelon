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

-- 4. [A-01] Cleanup accounts table
-- Remove the single-tenant fields as they are now in the junction
ALTER TABLE accounts DROP COLUMN tenant_id;
ALTER TABLE accounts DROP COLUMN role;
ALTER TABLE accounts DROP COLUMN status;

-- 5. RE-ENABLE RLS on junction table
ALTER TABLE account_tenants ENABLE ROW LEVEL SECURITY;

-- 6. Updated RLS Policy for account_tenants
CREATE POLICY account_tenants_select_policy ON account_tenants
    FOR SELECT USING (account_id = auth.uid());

-- NOTE: All functions like get_my_tenant_id() will need updating 
-- in the next phase to handle multiple results or specific context.
