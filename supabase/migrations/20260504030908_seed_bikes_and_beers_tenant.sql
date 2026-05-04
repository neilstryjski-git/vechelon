-- W128 / MT-S0-05: Seed the Bikes and Beers test tenant.
--
-- Pillar I §6 — B&B is the test tenant for cross-tenant RLS isolation,
-- IA tenant_id verification, and reproducing admin-reported issues.
-- Pillar II §3.1 step 1 — insert tenants row.
-- Branding assets supplied by Sr PM (no placeholders per VMT-D-36).
--
-- Idempotent via ON CONFLICT (slug) DO NOTHING per supabase-patterns Pattern 5
-- so re-running the migration on a fresh deploy does not error.

INSERT INTO public.tenants (
  name,
  slug,
  primary_color,
  accent_color,
  logo_url,
  enrollment_mode,
  show_calendar_to_pending
) VALUES (
  'Bikes and Beers',
  'bikes-and-beers',
  '#F2B23A',
  '#264530',
  '/portal/bikes-and-beers-logo.png',
  'open',
  false
)
ON CONFLICT (slug) DO NOTHING;
