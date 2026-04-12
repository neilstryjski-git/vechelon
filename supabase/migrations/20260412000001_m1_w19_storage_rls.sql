-- M1-W19: GPX Storage RLS
-- Secures the gpx-routes bucket via RLS on storage.objects

-- Admins can upload GPX files into their tenant's folder ({tenant_id}/*)
CREATE POLICY gpx_admin_upload ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'gpx-routes'
    AND is_tenant_admin(get_my_tenant_id())
    AND (storage.foldername(name))[1] = get_my_tenant_id()::text
  );

-- Affiliated members can read their tenant's GPX files
CREATE POLICY gpx_member_read ON storage.objects
  FOR SELECT USING (
    bucket_id = 'gpx-routes'
    AND get_tenant_status(get_my_tenant_id()) = 'affiliated'
    AND (storage.foldername(name))[1] = get_my_tenant_id()::text
  );

-- Admins can delete their tenant's GPX files
CREATE POLICY gpx_admin_delete ON storage.objects
  FOR DELETE USING (
    bucket_id = 'gpx-routes'
    AND is_tenant_admin(get_my_tenant_id())
    AND (storage.foldername(name))[1] = get_my_tenant_id()::text
  );
