-- Security hotfix — Step A (2026-11-06)
-- Re-verified findings from the 2026-10-30 read-only audit. Applied to prod via the
-- Management API first (incident hotfix), committed here so fresh deploys match.
-- Idempotent: every artifact is dropped/revoked before it is (re)created (Pattern 5).

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Vault-reading SECURITY DEFINER functions were EXECUTE-able by anon.
--    `REVOKE ... FROM PUBLIC` alone does NOT remove Supabase's default-privilege
--    grants to anon/authenticated — revoke those explicitly.
--    Only callers: rider-hash + voc-submit edge functions, via service_role.
--    reverse_rider_hash has no app caller (server-side/manual use only).
-- ─────────────────────────────────────────────────────────────────────────────
REVOKE ALL ON FUNCTION public.get_github_voc_pat()      FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_rider_hash_secret()   FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.reverse_rider_hash(text)  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_github_voc_pat()     TO service_role;
GRANT EXECUTE ON FUNCTION public.get_rider_hash_secret()  TO service_role;
GRANT EXECUTE ON FUNCTION public.reverse_rider_hash(text) TO service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. platform_admin was self-updatable (account_update_policy = id = auth.uid(),
--    no column restriction). Column-level REVOKE is ineffective while table-level
--    UPDATE is granted, so guard with a trigger: API roles may never set/change it.
--    SECURITY DEFINER callers run as their owner (postgres) and are unaffected;
--    none of them write platform_admin.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.tg_guard_platform_admin()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF current_user IN ('anon', 'authenticated') THEN
    IF TG_OP = 'INSERT' AND COALESCE(NEW.platform_admin, false) THEN
      RAISE EXCEPTION 'permission_denied: platform_admin cannot be set via the API'
        USING ERRCODE = '42501';
    ELSIF TG_OP = 'UPDATE' AND NEW.platform_admin IS DISTINCT FROM OLD.platform_admin THEN
      RAISE EXCEPTION 'permission_denied: platform_admin cannot be changed via the API'
        USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS accounts_guard_platform_admin ON public.accounts;
CREATE TRIGGER accounts_guard_platform_admin
  BEFORE INSERT OR UPDATE ON public.accounts
  FOR EACH ROW EXECUTE FUNCTION public.tg_guard_platform_admin();

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. gpx-routes (private bucket) had "Public Upload/Select/Delete" policies —
--    anyone, incl. anon, could read/write/delete every club's routes.
--    The pre-existing tenant policies keyed on get_my_tenant_id() (LIMIT 1), so a
--    multi-club member could only reach ONE club's files; rebuild them keyed on the
--    object's own folder tenant via the existing SECURITY DEFINER helpers
--    (is_tenant_admin / get_tenant_status take an explicit tenant id — no recursion).
--    Path convention: `<tenant_id>/<route_id>.gpx` (RideFormModal, RouteLibrary).
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.storage_folder_tenant(object_name text)
RETURNS uuid
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN (storage.foldername(object_name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      THEN ((storage.foldername(object_name))[1])::uuid
    ELSE NULL
  END;
$$;

DROP POLICY IF EXISTS "Public Upload"    ON storage.objects;
DROP POLICY IF EXISTS "Public Select"    ON storage.objects;
DROP POLICY IF EXISTS "Public Delete"    ON storage.objects;
DROP POLICY IF EXISTS gpx_admin_upload   ON storage.objects;
DROP POLICY IF EXISTS gpx_member_read    ON storage.objects;
DROP POLICY IF EXISTS gpx_admin_delete   ON storage.objects;

CREATE POLICY gpx_member_read ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'gpx-routes'
    AND (
      public.is_tenant_admin(public.storage_folder_tenant(name))
      OR public.get_tenant_status(public.storage_folder_tenant(name)) = 'affiliated'::public.account_status
      OR public.is_platform_admin()
    )
  );

CREATE POLICY gpx_admin_upload ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'gpx-routes'
    AND public.is_tenant_admin(public.storage_folder_tenant(name))
  );

CREATE POLICY gpx_admin_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'gpx-routes'
    AND public.is_tenant_admin(public.storage_folder_tenant(name))
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. avatars (public bucket): upload allowed anon (`uid IS NOT NULL OR IS NULL`),
--    update allowed anyone to overwrite any avatar. Scope writes to the caller's
--    own folder — Profile.tsx writes `<auth.uid()>/avatar.jpg` (all 7 existing
--    objects already follow this). Public read (avatars_read) is unchanged.
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS avatars_upload ON storage.objects;
DROP POLICY IF EXISTS avatars_update ON storage.objects;

CREATE POLICY avatars_upload ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = (auth.uid())::text
  );

CREATE POLICY avatars_update ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = (auth.uid())::text
  )
  WITH CHECK (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = (auth.uid())::text
  );

COMMIT;
