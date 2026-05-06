-- Add banner_url to tenants for login-page hero branding.
-- Populated per-tenant; NULL = no banner (existing behaviour unchanged).

ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS banner_url TEXT;

-- Bikes and Beers banner asset (800×446 optimised PNG shipped in /portal/)
UPDATE public.tenants
SET banner_url = '/portal/bikes-and-beers-banner.png'
WHERE slug = 'bikes-and-beers';
