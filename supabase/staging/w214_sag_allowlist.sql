-- =============================================================================
-- W214 — Standing SAG allowlist (PoC test rig)
-- =============================================================================
-- ⚠️  STAGING ONLY (xybgtbybdhxuwqjfcfkc). NEVER PROMOTE TO PRODUCTION. ⚠️
--
-- This is deliberately NOT a numbered migration in supabase/migrations/, so the
-- prod `db push --linked` pipeline can never replay it. Apply it to STAGING only,
-- via the Management API, exactly like the existing staging-only
-- rail3_hydrate_participant_identity trigger.
--
-- WHAT IT DOES: any email on rail3_sag_allowlist is auto-assigned the 'support'
-- (SAG) role whenever it joins ANY ride — so testers don't need per-ride manual
-- SQL to stand up a SAG. CAPTAIN BEATS SAG: a captain self-RSVP is never
-- overridden. No email on the row/account → no promotion.
--
-- WHY IT MUST NOT SHIP: a standing auto-promote list is a privilege-escalation
-- hole in production. There, SAG is per-ride and operator-assigned (the
-- production maturation path is recorded in docs/rail3-poc-to-production.md §H).
-- =============================================================================

-- 1. The allowlist. Only the SECURITY DEFINER trigger reads it; RLS is ON with no
--    policies, so app roles (anon/authenticated) can't read or write it even with
--    Supabase's implicit Data-API grants. Managed via SQL / service_role only.
CREATE TABLE IF NOT EXISTS public.rail3_sag_allowlist (
  email      text PRIMARY KEY,
  note       text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.rail3_sag_allowlist ENABLE ROW LEVEL SECURITY;

-- 2. Promotion trigger fn. Resolves the joining email (from the inserted row or
--    the linked account, mirroring rail3_hydrate_participant_identity) and, UNLESS
--    this is a captain row, promotes an allowlisted email to 'support'.
--    SECURITY DEFINER so it can read the allowlist + accounts past the caller's RLS.
CREATE OR REPLACE FUNCTION public.rail3_sag_allowlist_promote()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  resolved_email text;
BEGIN
  -- Captain always wins — never override a captain self-RSVP.
  IF NEW.role = 'captain' THEN
    RETURN NEW;
  END IF;

  resolved_email := lower(COALESCE(
    NEW.email,
    (SELECT email FROM public.accounts WHERE id = NEW.account_id)
  ));

  -- No email → no role change (matches "no email, no SAG/captain" PoC rule).
  IF resolved_email IS NULL THEN
    RETURN NEW;
  END IF;

  IF EXISTS (SELECT 1 FROM public.rail3_sag_allowlist WHERE email = resolved_email) THEN
    NEW.role := 'support';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.rail3_sag_allowlist_promote() FROM PUBLIC;

-- 3. Fire BEFORE INSERT. Trigger names fire in alphabetical order, and
--    'rail3_sag…' sorts AFTER 'rail3_hydrate…', so NEW.email is already hydrated
--    by the time this runs (we also resolve it ourselves, so order isn't load-bearing).
DROP TRIGGER IF EXISTS rail3_sag_allowlist_promote_trg ON public.ride_participants;
CREATE TRIGGER rail3_sag_allowlist_promote_trg
  BEFORE INSERT ON public.ride_participants
  FOR EACH ROW EXECUTE FUNCTION public.rail3_sag_allowlist_promote();

-- 4. Seed the current tester (rogers = SAG), idempotently.
INSERT INTO public.rail3_sag_allowlist (email, note)
VALUES ('neilstryjski@rogers.com', 'PoC SAG tester (W214 seed)')
ON CONFLICT (email) DO NOTHING;
