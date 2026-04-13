-- Add file_hash to route_library for duplicate detection
ALTER TABLE public.route_library ADD COLUMN IF NOT EXISTS file_hash TEXT;
NOTIFY pgrst, 'reload schema';
