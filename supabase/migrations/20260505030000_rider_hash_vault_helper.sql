-- W133 hotfix: vault.decrypted_secrets is not exposed via PostgREST
-- (only public and graphql_public schemas are). The rider-hash EF used
-- adminClient.schema('vault')... which fails with PGRST106.
--
-- Solution: SECURITY DEFINER helper in public schema that the EF calls via
-- adminClient.rpc(). Runs as function owner (postgres) which has vault access.
-- Restricted to service_role — never callable by anon or authenticated clients.

DROP FUNCTION IF EXISTS public.get_rider_hash_secret();

CREATE OR REPLACE FUNCTION public.get_rider_hash_secret()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT decrypted_secret
  FROM vault.decrypted_secrets
  WHERE name = 'rider_hash_secret'
  LIMIT 1;
$$;

REVOKE ALL   ON FUNCTION public.get_rider_hash_secret() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_rider_hash_secret() TO service_role;

-- Same pattern for the GitHub VoC PAT used by voc-submit EF
DROP FUNCTION IF EXISTS public.get_github_voc_pat();

CREATE OR REPLACE FUNCTION public.get_github_voc_pat()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT decrypted_secret
  FROM vault.decrypted_secrets
  WHERE name = 'github_voc_pat'
  LIMIT 1;
$$;

REVOKE ALL   ON FUNCTION public.get_github_voc_pat() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_github_voc_pat() TO service_role;
