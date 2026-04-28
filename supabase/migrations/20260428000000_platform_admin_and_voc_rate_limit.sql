-- W119 (MT-S0-06) — Platform Admin flag + VoC rate-limit timestamp on accounts
--
-- Brain-defined HLD schema extension per VoC/MT/IA Pillar II §4.1 + §5.3.
-- No Pillar V Amendment required (per VMT-D-13).
--
-- platform_admin: gates access to admin.vechelon.ca; does NOT determine
-- access level within a tenant (that is inherited from account_tenants role
-- per VMT-D-31 / VMT-D-39).
--
-- last_voc_submission: rate-limit clock for VoC submissions (5/hour per
-- account per VMT-D-10). Updated on successful submission only.

ALTER TABLE public.accounts
  ADD COLUMN IF NOT EXISTS platform_admin     BOOLEAN     NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS last_voc_submission TIMESTAMPTZ;

COMMENT ON COLUMN public.accounts.platform_admin IS
  'Operator-level flag granting access to admin.vechelon.ca. Access level within each tenant is inherited from account_tenants — not granted by this flag. See VoC/MT/IA Pillar II §4.2 / VMT-D-31.';

COMMENT ON COLUMN public.accounts.last_voc_submission IS
  'Timestamp of the last successful VoC submission. Used for the 5/hour per-account rate limit (VMT-D-10). NULL = no submissions yet. Updated only on success — never on rejection or GitHub API failure.';
