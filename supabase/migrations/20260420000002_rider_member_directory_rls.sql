-- Allow affiliated members to read other members' names and avatars within their tenant.
-- Fulfills 1.12: Rider Desktop Portal — member directory (names only).
-- Scope: affiliated members only; initiated and guest see nothing beyond their own record.
CREATE POLICY account_member_names_select ON accounts
    FOR SELECT USING (
        EXISTS (
            SELECT 1
            FROM account_tenants viewer
            JOIN account_tenants target ON viewer.tenant_id = target.tenant_id
            WHERE viewer.account_id = auth.uid()
              AND viewer.status = 'affiliated'
              AND target.account_id = accounts.id
        )
    );
