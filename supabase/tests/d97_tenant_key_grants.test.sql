-- =====================================================================
-- D97 — AI provider keys live only in the service-only tenant_ai_secrets table
-- (CI gate, ephemeral local stack). ON_ERROR_STOP=1: any RAISE fails the job. Read-only.
-- =====================================================================
DO $$
DECLARE r text;
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name = 'tenants' AND column_name = 'ai_api_key') THEN
    RAISE EXCEPTION 'D97 gate FAILED: tenants.ai_api_key still exists';
  END IF;

  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.tenant_ai_secrets'::regclass) THEN
    RAISE EXCEPTION 'D97 gate FAILED: RLS is off on tenant_ai_secrets';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'tenant_ai_secrets') THEN
    RAISE EXCEPTION 'D97 gate FAILED: tenant_ai_secrets has an RLS policy';
  END IF;

  FOREACH r IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF has_table_privilege(r, 'public.tenant_ai_secrets', 'SELECT')
       OR has_table_privilege(r, 'public.tenant_ai_secrets', 'INSERT')
       OR has_table_privilege(r, 'public.tenant_ai_secrets', 'UPDATE')
       OR has_table_privilege(r, 'public.tenant_ai_secrets', 'DELETE') THEN
      RAISE EXCEPTION 'D97 gate FAILED: % has privileges on tenant_ai_secrets', r;
    END IF;
    -- Branding is untouched and still readable before sign-in.
    IF NOT has_table_privilege(r, 'public.tenants', 'SELECT') THEN
      RAISE EXCEPTION 'D97 gate FAILED: % lost SELECT on tenants', r;
    END IF;
  END LOOP;

  IF NOT has_table_privilege('service_role', 'public.tenant_ai_secrets', 'SELECT') THEN
    RAISE EXCEPTION 'D97 gate FAILED: service_role cannot read tenant_ai_secrets';
  END IF;
  RAISE NOTICE 'D97: OK';
END $$;
