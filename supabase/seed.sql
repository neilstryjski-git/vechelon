-- SEED DATA: Populate VEcheLOn with initial prototyping data
-- Fulfills unblocking the Dashboard and UI components
-- Updated to include auth.users entries to satisfy foreign key constraints

-- 0. LOCAL-ONLY grant alignment (D49). Newer supabase CLI versions provision the
-- local stack with implicit grants REVOKED for anon, authenticated AND service_role
-- (the post-2026-05-30 hosted behavior), which broke the rail3-ci gate:
-- "permission denied for table account_tenants" (authenticated) and
-- "permission denied for table tenants" (service_role via PostgREST). Both hosted
-- projects (prod + rail3-staging) verified via the Management API to carry full
-- 7-privilege table grants for ALL THREE roles, so local was the only divergent
-- environment. Granting here restores parity and keeps RLS — not table grants —
-- as the access layer the harness tests. seed.sql is applied ONLY by local
-- `supabase start` / `db reset`; `db push` never runs it, so hosted is untouched.
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL TABLES    IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO anon, authenticated, service_role;
-- Cover tables added by later `supabase migration up` on a long-lived local stack
-- (without this, only a full `db reset` would re-apply the grants above).
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES    TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;

-- 0b. The blanket function grant above must NOT undo revokes that migrations made on
-- purpose — hosted prod doesn't have them (verified 2026-11-08: anon cannot EXECUTE
-- get_rider_hash_secret on prod). Re-apply them so local matches prod and the CI gates
-- test the real grants (W299). Keep in step with the REVOKEs in supabase/migrations.
DO $$
DECLARE
  f text;
  service_only text[] := ARRAY[
    'public.get_github_voc_pat()', 'public.get_rider_hash_secret()', 'public.reverse_rider_hash(text)',
    'public.account_deletion_preflight(uuid)',
    'public.delete_account_data(uuid)', 'public.register_system_owner(uuid)'
  ];
  authenticated_only text[] := ARRAY[
    'public.is_ride_tenant_admin(uuid)', 'public.can_assign_ride_command(uuid)',
    'public.get_ride_roster_contacts(uuid)', 'public.get_member_directory(uuid)'
  ];
BEGIN
  FOREACH f IN ARRAY service_only LOOP
    IF to_regprocedure(f) IS NOT NULL THEN
      EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated', f);
    END IF;
  END LOOP;
  FOREACH f IN ARRAY authenticated_only LOOP
    IF to_regprocedure(f) IS NOT NULL THEN
      EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon', f);
    END IF;
  END LOOP;
  -- Service-only table (W299): RLS with no policies is the real gate; drop the blanket grant too.
  IF to_regclass('public.tenant_system_owners') IS NOT NULL THEN
    REVOKE ALL ON public.tenant_system_owners FROM PUBLIC, anon, authenticated;
  END IF;
END $$;

-- 0c. D97: the blanket table grant above would hand anon/authenticated the service-only AI
-- key table. Re-apply the migration's revoke so CI tests the real grants.
DO $$
BEGIN
  IF to_regclass('public.tenant_ai_secrets') IS NOT NULL THEN
    REVOKE ALL ON public.tenant_ai_secrets FROM PUBLIC, anon, authenticated;
  END IF;
END $$;

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
