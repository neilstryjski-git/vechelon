-- =====================================================================
-- D97 — tenants.ai_api_key must not be readable or writable through the Data API.
--
-- Before: anon and authenticated held table-level SELECT/INSERT/UPDATE on public.tenants
-- (the pre-2026-10-30 implicit grants), and tenant_public_select_policy is
-- `FOR SELECT TO public USING (true)` (branding must load before sign-in). RLS can't hide
-- one column, so ai_api_key was world-readable. 0 of 3 tenants store a key today on both
-- projects (verified 2026-11-08), so nothing has leaked.
--
-- Fix: a column-level REVOKE does nothing while a table-level grant exists, so revoke at
-- table level and re-grant every column EXCEPT ai_api_key:
--   anon           SELECT (all columns but the key)
--   authenticated  SELECT, INSERT, UPDATE (all columns but the key). RLS still decides
--                  which rows: only platform admins have INSERT/UPDATE policies.
--   service_role   untouched (full): supabase/functions/_shared/ai-provider.ts reads the key.
-- TRUNCATE/TRIGGER/REFERENCES are dropped for anon/authenticated (nothing uses them; TRUNCATE
-- would bypass RLS). DELETE is left as it was (no DELETE policy exists, so RLS denies it).
--
-- The column list is built at run time, so prod and staging (which have different tenants
-- columns) both get it right. A column ADDED to tenants later is NOT exposed to the API
-- until it is granted: re-run `SELECT public.apply_tenant_api_grants();` in that migration.
-- supabase/seed.sql also calls it after its blanket local grants, so CI tests these grants.
--
-- supabase-patterns: Pattern 7 (explicit, role-matched grants); Pattern 5 (idempotent:
-- CREATE OR REPLACE + re-runnable REVOKE/GRANT).
-- =====================================================================

CREATE OR REPLACE FUNCTION public.apply_tenant_api_grants()
RETURNS void
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_cols text;
BEGIN
  SELECT string_agg(quote_ident(column_name), ', ' ORDER BY ordinal_position)
  INTO v_cols
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'tenants' AND column_name <> 'ai_api_key';

  EXECUTE 'REVOKE SELECT, INSERT, UPDATE, TRUNCATE, TRIGGER, REFERENCES ON public.tenants FROM PUBLIC, anon, authenticated';
  EXECUTE format('GRANT SELECT (%s) ON public.tenants TO anon, authenticated', v_cols);
  EXECUTE format('GRANT INSERT (%s), UPDATE (%s) ON public.tenants TO authenticated', v_cols, v_cols);
  EXECUTE 'GRANT ALL ON public.tenants TO service_role';
END;
$$;

-- Owner-only helper: it only re-applies grants, but no API role needs to call it.
REVOKE ALL ON FUNCTION public.apply_tenant_api_grants() FROM PUBLIC, anon, authenticated;

SELECT public.apply_tenant_api_grants();
