ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS qr_mark_url TEXT;

-- B&B uses the badge PNG; RS stays null (canvas "78" fallback in the SPA)
UPDATE public.tenants
SET qr_mark_url = '/portal/bikes-and-beers-logo.png'
WHERE slug = 'bikes-and-beers';
