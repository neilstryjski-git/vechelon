-- Expand route library visibility to initiated (Tier 2) members, not just affiliated (Tier 3).
-- Routes are non-sensitive club content — restricting to Tier 3 reduced value for pending members.
-- Delete remains admin-only via route_library_admin_all policy.
DROP POLICY IF EXISTS route_library_affiliated_select ON route_library;
CREATE POLICY route_library_member_select ON route_library
    FOR SELECT USING (
        get_tenant_status(tenant_id) IN ('affiliated', 'initiated')
    );
