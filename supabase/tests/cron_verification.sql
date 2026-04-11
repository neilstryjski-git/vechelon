-- VEcheLOn Cron Scheduling & Verification
-- To be executed in Supabase SQL Editor

-- 1. Enable pg_cron if not already enabled
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- 2. Schedule Auto-close Function (Every day at 00:00 UTC)
-- Replace [PROJECT_ID] and [ANON_KEY] with real values
-- SELECT cron.schedule(
--   'auto-close-rides-midnight',
--   '0 0 * * *',
--   $$
--   SELECT
--     net.http_post(
--       url:='https://[PROJECT_ID].supabase.co/functions/v1/auto-close-rides',
--       headers:='{"Content-Type": "application/json", "Authorization": "Bearer [SERVICE_ROLE_KEY]"}'
--     ) as request_id;
--   $$
-- );

-- 3. Schedule Hard Purge Function (Every hour)
-- SELECT cron.schedule(
--   'hard-purge-hourly',
--   '0 * * * *',
--   $$
--   SELECT
--     net.http_post(
--       url:='https://[PROJECT_ID].supabase.co/functions/v1/hard-purge-location',
--       headers:='{"Content-Type": "application/json", "Authorization": "Bearer [SERVICE_ROLE_KEY]"}'
--     ) as request_id;
--   $$
-- );

-- 4. MOCK DATA FOR VERIFICATION
-- Create a ride that should be auto-closed
INSERT INTO rides (tenant_id, name, type, status, start_coords, qr_code, created_by)
VALUES (
  (SELECT id FROM tenants LIMIT 1),
  'Expired Active Ride',
  'scheduled',
  'active',
  '(0,0)',
  'expired-qr',
  (SELECT id FROM accounts LIMIT 1)
);

-- Create a ride that ended > 4 hours ago and needs purging
INSERT INTO rides (tenant_id, name, type, status, start_coords, actual_end, qr_code, created_by)
VALUES (
  (SELECT id FROM tenants LIMIT 1),
  'Old Saved Ride',
  'scheduled',
  'saved',
  '(0,0)',
  now() - interval '5 hours',
  'old-qr',
  (SELECT id FROM accounts LIMIT 1)
) RETURNING id as old_ride_id;

-- Add a participant to the old ride with location data
-- INSERT INTO ride_participants (ride_id, display_name, last_lat, last_long, status)
-- VALUES ('[old_ride_id]', 'Test Rider', 43.65, -79.38, 'active');
