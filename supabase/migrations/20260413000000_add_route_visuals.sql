-- Add route visual fields to route_library and rides tables
-- Fulfills Task W45

-- 1. Add columns to route_library
ALTER TABLE public.route_library
ADD COLUMN IF NOT EXISTS external_url TEXT,
ADD COLUMN IF NOT EXISTS thumbnail_url TEXT;

-- 2. Add columns to rides
ALTER TABLE public.rides
ADD COLUMN IF NOT EXISTS external_url TEXT,
ADD COLUMN IF NOT EXISTS thumbnail_url TEXT;

-- 3. Force PostgREST cache reload
NOTIFY pgrst, 'reload schema';
