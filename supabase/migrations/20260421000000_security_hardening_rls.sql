-- SECURITY HARDENING: Enable RLS on all public tables
-- Fulfills Supabase Security Linter requirements.
-- Ensures that policies are enforced and data is not exposed via PostgREST.

-- 1. Drop any remaining "dev bypass" policies to ensure strict enforcement
-- These policies were identified in the Supabase Security Linter report.
DROP POLICY IF EXISTS dev_public_read_tenants ON public.account_tenants;
DROP POLICY IF EXISTS dev_public_read_accounts ON public.accounts;
DROP POLICY IF EXISTS dev_public_read_rides ON public.rides;
DROP POLICY IF EXISTS dev_public_read_participants ON public.ride_participants;
DROP POLICY IF EXISTS dev_public_read_routes ON public.route_library;

-- Also catch variations found in older migrations
DROP POLICY IF EXISTS dev_public_select_rides ON public.rides;
DROP POLICY IF EXISTS dev_public_select_accounts ON public.accounts;
DROP POLICY IF EXISTS dev_public_select_account_tenants ON public.account_tenants;
DROP POLICY IF EXISTS dev_public_select_routes ON public.route_library;
DROP POLICY IF EXISTS dev_public_select_tenants ON public.tenants;
DROP POLICY IF EXISTS dev_public_delete_routes ON public.route_library;
DROP POLICY IF EXISTS dev_public_insert_routes ON public.route_library;

-- 2. Enable RLS on core tables identified as vulnerable
ALTER TABLE public.accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.account_tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rides ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ride_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.route_library ENABLE ROW LEVEL SECURITY;

-- 3. Ensure RLS is enabled on auxiliary tables (safety check)
ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ride_support ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.waypoints ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ride_summaries ENABLE ROW LEVEL SECURITY;

-- 4. Final Verification of Functions
-- Ensure security definer is used only where strictly necessary and safe.
-- get_my_tenant_id() is SECURITY DEFINER which is correct for RLS bypass logic.
