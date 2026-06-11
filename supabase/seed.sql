-- SEED DATA: Populate VEcheLOn with initial prototyping data
-- Fulfills unblocking the Dashboard and UI components
-- Updated to include auth.users entries to satisfy foreign key constraints

-- 0. LOCAL-ONLY grant alignment (D49). Newer supabase CLI versions provision the
-- local stack with implicit anon/authenticated grants REVOKED (the post-2026-05-30
-- hosted behavior), which broke the rail3-ci gate: "permission denied for table
-- account_tenants". Both hosted projects (prod + rail3-staging) verified to carry
-- full table grants for these roles, so local was the only divergent environment.
-- Granting here restores parity and keeps RLS — not table grants — as the access
-- layer the harness tests. seed.sql is applied ONLY by local `supabase start` /
-- `db reset`; `db push` never runs it, so hosted projects are untouched.
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL TABLES    IN SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO anon, authenticated;

-- 1. Create a Primary Tenant (Racer Sportif)
INSERT INTO tenants (id, name, slug, primary_color, accent_color)
VALUES (
  '00000000-0000-0000-0000-000000000001', 
  'Racer Sportif', 
  'racer-sportif', 
  '#5f5e5e', 
  '#006e35'
) ON CONFLICT (id) DO NOTHING;

-- 2. Create Mock Admin in Supabase Auth
INSERT INTO auth.users (id, email, raw_user_meta_data, aud, role)
VALUES (
  '00000000-0000-0000-0000-00000000000a',
  'admin@vechelon.app',
  '{"name": "Dispatcher Prime"}',
  'authenticated',
  'authenticated'
) ON CONFLICT (id) DO NOTHING;

-- Create Mock Admin in public.accounts
INSERT INTO public.accounts (id, email, phone, name)
VALUES (
  '00000000-0000-0000-0000-00000000000a',
  'admin@vechelon.app',
  '555-0199',
  'Dispatcher Prime'
) ON CONFLICT (id) DO NOTHING;

-- Link Admin to Tenant via junction table
INSERT INTO public.account_tenants (account_id, tenant_id, role, status)
VALUES (
  '00000000-0000-0000-0000-00000000000a',
  '00000000-0000-0000-0000-000000000001',
  'admin',
  'affiliated'
) ON CONFLICT (account_id, tenant_id) DO NOTHING;

-- 3. Create initial Rides
-- Active Ride
INSERT INTO rides (name, type, status, start_coords, qr_code, created_by, tenant_id)
VALUES (
  'Sunday Morning Club Run',
  'route',
  'active',
  '(43.6532,-79.3832)',
  'MOCK_QR_ACTIVE',
  '00000000-0000-0000-0000-00000000000a',
  '00000000-0000-0000-0000-000000000001'
);

-- Upcoming Ride
INSERT INTO rides (name, type, status, start_coords, qr_code, created_by, tenant_id, scheduled_start)
VALUES (
  'Tuesday Tactical Sprints',
  'route',
  'created',
  '(43.6532,-79.3832)',
  'MOCK_QR_UPCOMING',
  '00000000-0000-0000-0000-00000000000a',
  '00000000-0000-0000-0000-000000000001',
  NOW() + INTERVAL '2 days'
);

-- 4. Create Mock Member in Supabase Auth
INSERT INTO auth.users (id, email, raw_user_meta_data, aud, role)
VALUES (
  '00000000-0000-0000-0000-00000000000b',
  'new-rider@gmail.com',
  '{"name": "Pending Pete"}',
  'authenticated',
  'authenticated'
) ON CONFLICT (id) DO NOTHING;

-- Create Mock Member in public.accounts
INSERT INTO public.accounts (id, email, phone, name)
VALUES (
  '00000000-0000-0000-0000-00000000000b',
  'new-rider@gmail.com',
  '555-0200',
  'Pending Pete'
) ON CONFLICT (id) DO NOTHING;

-- Link Pending Member to Tenant
INSERT INTO public.account_tenants (account_id, tenant_id, role, status)
VALUES (
  '00000000-0000-0000-0000-00000000000b',
  '00000000-0000-0000-0000-000000000001',
  'member',
  'initiated'
) ON CONFLICT (account_id, tenant_id) DO NOTHING;
