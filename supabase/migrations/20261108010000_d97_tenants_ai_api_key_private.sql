-- =====================================================================
-- D97 — move tenants.ai_api_key out of the world-readable tenants table.
--
-- Before: tenant_public_select_policy is `FOR SELECT TO public USING (true)` (branding must
-- load before sign-in), and anon/authenticated hold table-level privileges on tenants, so
-- tenants.ai_api_key was readable by anyone. RLS can't hide one column. 0 of 3 tenants stored
-- a key on prod and on staging (verified 2026-11-08), so nothing has leaked.
--
-- Why a separate table, not column-level grants: column grants would hide every column ADDED
-- to tenants later until someone remembered to grant it (the Rail 3 promotion adds three that
-- the app embeds), and a table-level REVOKE leaves any column-level grant in place. A
-- service-only table has neither problem: tenants' grants are untouched.
--
--   public.tenant_ai_secrets  one row per tenant; RLS on with NO policies; no anon or
--                             authenticated privileges; service_role only (generate-ride-summary).
--
-- Idempotent (Pattern 5): IF NOT EXISTS, the column move runs only while the column exists.
-- Pattern 7: the new table carries explicit, role-matched grants. Ends with a post-condition
-- that fails the migration (so `db push` fails closed) if the key is still exposed.
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.tenant_ai_secrets (
  tenant_id  uuid PRIMARY KEY REFERENCES public.tenants(id) ON DELETE CASCADE,
  ai_api_key text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.tenant_ai_secrets IS
  'D97: per-tenant AI provider keys. Service role only (no policies, no API-role grants). Never join into client-visible queries.';

ALTER TABLE public.tenant_ai_secrets ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.tenant_ai_secrets FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tenant_ai_secrets TO service_role;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name = 'tenants' AND column_name = 'ai_api_key') THEN
    INSERT INTO public.tenant_ai_secrets (tenant_id, ai_api_key)
    SELECT id, ai_api_key FROM public.tenants WHERE ai_api_key IS NOT NULL
    ON CONFLICT (tenant_id) DO NOTHING;
    ALTER TABLE public.tenants DROP COLUMN ai_api_key;
  END IF;
END $$;

-- Post-condition: fail the migration if the key is reachable through the Data API.
DO $$
DECLARE r text;
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name = 'tenants' AND column_name = 'ai_api_key') THEN
    RAISE EXCEPTION 'D97: tenants.ai_api_key still exists';
  END IF;
  FOREACH r IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF has_table_privilege(r, 'public.tenant_ai_secrets', 'SELECT')
       OR has_table_privilege(r, 'public.tenant_ai_secrets', 'INSERT')
       OR has_table_privilege(r, 'public.tenant_ai_secrets', 'UPDATE') THEN
      RAISE EXCEPTION 'D97: % has privileges on tenant_ai_secrets', r;
    END IF;
  END LOOP;
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'tenant_ai_secrets') THEN
    RAISE EXCEPTION 'D97: tenant_ai_secrets must have no RLS policies';
  END IF;
END $$;
