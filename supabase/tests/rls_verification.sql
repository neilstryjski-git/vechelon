-- VEcheLOn RLS Verification Script
-- Mocks data and tests isolation rules

-- 1. Setup Mock Data (Tenants & Accounts)
-- Tenant A
INSERT INTO tenants (id, name, slug, primary_color, accent_color) 
VALUES ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Tenant A', 'tenant-a', '#000000', '#ffffff');

-- Tenant B
INSERT INTO tenants (id, name, slug, primary_color, accent_color) 
VALUES ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Tenant B', 'tenant-b', '#111111', '#eeeeee');

-- Admin A
INSERT INTO accounts (id, tenant_id, email, phone, role, status)
VALUES ('a1111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'admin@a.com', '123', 'admin', 'affiliated');

-- Member A (Captain)
INSERT INTO accounts (id, tenant_id, email, phone, role, status)
VALUES ('a2222222-2222-2222-2222-222222222222', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'captain@a.com', '456', 'member', 'affiliated');

-- Rider A
INSERT INTO accounts (id, tenant_id, email, phone, role, status)
VALUES ('a3333333-3333-3333-3333-333333333333', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'rider@a.com', '789', 'member', 'affiliated');

-- Rider B
INSERT INTO accounts (id, tenant_id, email, phone, role, status)
VALUES ('b1111111-1111-1111-1111-111111111111', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'rider@b.com', '000', 'member', 'affiliated');

-- 2. Mock Rides
INSERT INTO rides (id, tenant_id, name, type, status, start_coords, qr_code, created_by)
VALUES ('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Ride A', 'scheduled', 'active', '(0,0)', 'qr-a', 'a1111111-1111-1111-1111-111111111111');

-- 3. Mock Participants
-- Captain A
INSERT INTO ride_participants (ride_id, account_id, role, status)
VALUES ('11111111-1111-1111-1111-111111111111', 'a2222222-2222-2222-2222-222222222222', 'captain', 'active');

-- Rider A
INSERT INTO ride_participants (ride_id, account_id, role, status)
VALUES ('11111111-1111-1111-1111-111111111111', 'a3333333-3333-3333-3333-333333333333', 'member', 'active');

-- 4. TEST SCENARIOS (Manual SQL Verification logic)

-- [SCENARIO 1] Tenant Isolation: Rider B should see 0 rides from Tenant A
-- SET auth.uid() = 'b1111111-1111-1111-1111-111111111111';
-- SELECT count(*) FROM rides; -- Expected: 0

-- [SCENARIO 2] Role Visibility: Rider A should see Captain A but not self-details of others
-- SET auth.uid() = 'a3333333-3333-3333-3333-333333333333';
-- SELECT * FROM ride_participants; -- Expected: sees Captain A and self.

-- [SCENARIO 3] Captain Visibility: Captain A should see all participants
-- SET auth.uid() = 'a2222222-2222-2222-2222-222222222222';
-- SELECT * FROM ride_participants; -- Expected: sees Captain A and Rider A.
