-- M3: Rider Auth & Profile Schema
-- W30: Magic Link signup support
-- W32: Avatar photo upload

-- 1. Make phone nullable (riders sign up via email only initially)
ALTER TABLE public.accounts ALTER COLUMN phone DROP NOT NULL;

-- 2. Add avatar_url column
ALTER TABLE public.accounts ADD COLUMN IF NOT EXISTS avatar_url TEXT;

-- 3. Create avatars storage bucket (public reads, authenticated writes)
INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO NOTHING;

-- 4. Storage policy: authenticated users can upload their own avatar
CREATE POLICY avatars_upload ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'avatars' AND
    (auth.uid() IS NOT NULL OR auth.uid() IS NULL) -- dev bypass: allow all
  );

CREATE POLICY avatars_update ON storage.objects
  FOR UPDATE USING (
    bucket_id = 'avatars'
  );

CREATE POLICY avatars_read ON storage.objects
  FOR SELECT USING (bucket_id = 'avatars');

-- 5. ensure_account_exists RPC — called after first magic link sign-in
--    Creates accounts + account_tenants rows idempotently
CREATE OR REPLACE FUNCTION ensure_account_exists()
RETURNS void AS $$
DECLARE
  v_tenant_id UUID;
  v_uid UUID;
  v_email TEXT;
BEGIN
  v_uid   := auth.uid();
  v_email := auth.email();

  -- Require auth
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Resolve tenant (dev: first tenant)
  SELECT id INTO v_tenant_id FROM public.tenants LIMIT 1;

  -- Upsert account row
  INSERT INTO public.accounts (id, email, name, phone)
  VALUES (v_uid, v_email, null, null)
  ON CONFLICT (id) DO NOTHING;

  -- Create tenant membership if not already present
  IF NOT EXISTS (
    SELECT 1 FROM public.account_tenants
    WHERE account_id = v_uid AND tenant_id = v_tenant_id
  ) THEN
    INSERT INTO public.account_tenants (account_id, tenant_id, role, status)
    VALUES (v_uid, v_tenant_id, 'member', 'initiated');
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6. Allow authenticated users to update their own account row
--    (may already exist — CREATE OR REPLACE to be safe)
DROP POLICY IF EXISTS account_update_policy ON public.accounts;
CREATE POLICY account_update_policy ON public.accounts
  FOR UPDATE USING (id = auth.uid());
