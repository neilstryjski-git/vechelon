-- W308: schema fingerprint for what `supabase db dump` leaves out.
--
-- `supabase db dump` skips the platform schemas (auth, storage, realtime, cron ...),
-- but migrations put objects there: Broadcast policies on realtime.messages, triggers
-- on auth.users, storage policies and buckets, cron jobs. This read-only query
-- returns one JSON document listing them, so two databases can be compared: one
-- built from migrations (Rail 3 CI publishes it) and a hosted one.
--
-- Read-only. One SELECT, one row, one column. Works through psql and through the
-- Management API query endpoint. cron.job is read through query_to_xml so the
-- statement still parses where pg_cron is not installed.
SELECT jsonb_build_object(
  'policies_outside_public', (
    SELECT coalesce(jsonb_agg(jsonb_build_object(
             'table', schemaname || '.' || tablename, 'policy', policyname,
             'cmd', cmd, 'permissive', permissive, 'roles', roles::text,
             'using', qual, 'with_check', with_check)
           ORDER BY schemaname, tablename, policyname), '[]'::jsonb)
    FROM pg_policies
    WHERE schemaname NOT IN ('public', 'cron')
  ),
  'triggers_outside_public', (
    SELECT coalesce(jsonb_agg(jsonb_build_object(
             'table', t.tgrelid::regclass::text, 'trigger', t.tgname,
             'def', pg_get_triggerdef(t.oid))
           ORDER BY t.tgrelid::regclass::text, t.tgname), '[]'::jsonb)
    FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_proc p ON p.oid = t.tgfoid
    JOIN pg_namespace pn ON pn.oid = p.pronamespace
    WHERE NOT t.tgisinternal AND n.nspname <> 'public' AND pn.nspname = 'public'
  ),
  'storage_buckets', (
    SELECT CASE WHEN to_regclass('storage.buckets') IS NULL THEN 'absent'
      ELSE (xpath('/row/j/text()', query_to_xml(
        $q$SELECT coalesce(jsonb_agg(jsonb_build_object('id', id, 'public', public) ORDER BY id), '[]'::jsonb) AS j FROM storage.buckets$q$,
        false, true, '')))[1]::text END
  ),
  'cron_jobs', (
    SELECT CASE WHEN to_regclass('cron.job') IS NULL THEN 'absent'
      ELSE (xpath('/row/j/text()', query_to_xml(
        $q$SELECT coalesce(jsonb_agg(jsonb_build_object('jobname', jobname, 'schedule', schedule, 'command', command, 'active', active) ORDER BY jobname), '[]'::jsonb) AS j FROM cron.job$q$,
        false, true, '')))[1]::text END
  ),
  'realtime_publication_tables', (
    SELECT coalesce(jsonb_agg(schemaname || '.' || tablename ORDER BY schemaname, tablename), '[]'::jsonb)
    FROM pg_publication_tables WHERE pubname = 'supabase_realtime'
  ),
  'extensions', (
    SELECT jsonb_agg(extname ORDER BY extname) FROM pg_extension
  ),
  'migration_versions', (
    SELECT jsonb_agg(version ORDER BY version) FROM supabase_migrations.schema_migrations
  )
) AS fingerprint;
