-- W154-follow-up: storage policies for tenant-assets bucket
-- platform_admin can upload/replace/delete; public bucket handles reads.

DROP POLICY IF EXISTS "platform_admin_insert_tenant_assets" ON storage.objects;
DROP POLICY IF EXISTS "platform_admin_update_tenant_assets" ON storage.objects;
DROP POLICY IF EXISTS "platform_admin_delete_tenant_assets" ON storage.objects;

CREATE POLICY "platform_admin_insert_tenant_assets"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'tenant-assets' AND public.is_platform_admin());

CREATE POLICY "platform_admin_update_tenant_assets"
  ON storage.objects FOR UPDATE TO authenticated
  USING     (bucket_id = 'tenant-assets' AND public.is_platform_admin())
  WITH CHECK (bucket_id = 'tenant-assets' AND public.is_platform_admin());

CREATE POLICY "platform_admin_delete_tenant_assets"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'tenant-assets' AND public.is_platform_admin());
