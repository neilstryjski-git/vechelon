-- =====================================================================
-- D97 — tenants.ai_api_key is service-role only (CI gate, ephemeral local stack).
-- ON_ERROR_STOP=1: any RAISE fails the job. Read-only, plus one rolled-back write probe.
-- =====================================================================
BEGIN;
SET client_min_messages = warning;

DO $$
DECLARE r text;
BEGIN
  FOREACH r IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF has_column_privilege(r, 'public.tenants', 'ai_api_key', 'SELECT') THEN
      RAISE EXCEPTION 'D97 gate FAILED: % can SELECT tenants.ai_api_key', r;
    END IF;
    IF has_column_privilege(r, 'public.tenants', 'ai_api_key', 'UPDATE')
       OR has_column_privilege(r, 'public.tenants', 'ai_api_key', 'INSERT') THEN
      RAISE EXCEPTION 'D97 gate FAILED: % can write tenants.ai_api_key', r;
    END IF;
    -- Branding must still load before sign-in.
    IF NOT has_column_privilege(r, 'public.tenants', 'name', 'SELECT')
       OR NOT has_column_privilege(r, 'public.tenants', 'logo_url', 'SELECT')
       OR NOT has_column_privilege(r, 'public.tenants', 'primary_color', 'SELECT') THEN
      RAISE EXCEPTION 'D97 gate FAILED: % lost SELECT on tenants branding columns', r;
    END IF;
    IF has_table_privilege(r, 'public.tenants', 'TRUNCATE') THEN
      RAISE EXCEPTION 'D97 gate FAILED: % can TRUNCATE tenants', r;
    END IF;
  END LOOP;

  -- Platform-admin edits (RLS-gated) still have their column privileges.
  IF NOT has_column_privilege('authenticated', 'public.tenants', 'primary_color', 'UPDATE')
     OR NOT has_column_privilege('authenticated', 'public.tenants', 'name', 'INSERT') THEN
    RAISE EXCEPTION 'D97 gate FAILED: authenticated lost INSERT/UPDATE on ordinary tenants columns';
  END IF;
  IF has_column_privilege('anon', 'public.tenants', 'primary_color', 'UPDATE') THEN
    RAISE EXCEPTION 'D97 gate FAILED: anon can UPDATE tenants';
  END IF;

  IF NOT has_column_privilege('service_role', 'public.tenants', 'ai_api_key', 'SELECT')
     OR NOT has_column_privilege('service_role', 'public.tenants', 'ai_api_key', 'UPDATE') THEN
    RAISE EXCEPTION 'D97 gate FAILED: service_role lost access to tenants.ai_api_key';
  END IF;
  RAISE NOTICE 'D97 grants: OK';
END $$;

-- Behavioural probe: anon selecting the key is refused (42501), not filtered.
SAVEPOINT s_anon;
SET LOCAL ROLE anon;
DO $$
BEGIN
  BEGIN
    PERFORM ai_api_key FROM public.tenants LIMIT 1;
    RAISE EXCEPTION 'D97 gate FAILED: anon SELECT ai_api_key succeeded';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'anon SELECT ai_api_key refused: OK';
  END;
  PERFORM name, logo_url FROM public.tenants LIMIT 1;  -- branding still readable
END $$;
RESET ROLE;
ROLLBACK TO SAVEPOINT s_anon;

ROLLBACK;
