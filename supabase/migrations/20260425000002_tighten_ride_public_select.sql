-- Tighten ride_public_select to apply ONLY to unauthenticated callers.
-- Previously USING (true) allowed every authenticated user to SELECT every ride
-- across tenants — a data sovereignty violation against Admin Pillar II §11/§12.
--
-- The original intent (per migration 20260418000002) was to allow a guest who
-- received a ride URL via QR/invite to land on the ride page. That use case
-- still works because unauthenticated callers retain SELECT access.
--
-- Authenticated users now fall back to:
--   ride_tiered_select (FOR SELECT USING (can_view_calendar(tenant_id)))   — tenant members
--   ride_admin_modify  (FOR ALL USING (is_tenant_admin(tenant_id) OR ...)) — admins / creators
--
-- Both are tenant-scoped, so authed users only see rides at their own tenant(s).

DROP POLICY IF EXISTS ride_public_select ON rides;

CREATE POLICY ride_unauth_public_select ON rides
    FOR SELECT USING (auth.uid() IS NULL);
