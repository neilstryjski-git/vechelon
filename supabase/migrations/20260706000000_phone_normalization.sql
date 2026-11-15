-- Member data hygiene #1: normalize phone numbers to E.164 (default region +1).
--
-- A pure normalize_phone() plus BEFORE INSERT/UPDATE triggers on accounts and
-- pending_members (phone + emergency_contact_phone), and a one-time backfill.
-- This is the foundation for phone-based dedup — a phone is unique to a rider, so
-- "+1.416.558.6231", "416-558-6231", "(416) 558-6231" must all collapse to one
-- canonical value before duplicates can be caught.
--
-- supabase-patterns: Pattern 5 — DROP ... IF EXISTS at the top for idempotent
-- fresh replays. No new tables/views (Pattern 7 N/A), no RLS/policies, no upserts.
-- normalize_phone is IMMUTABLE (deterministic, no I/O) — safe for an expression
-- index later when the hard unique constraint goes on.

-- ── Idempotency ────────────────────────────────────────────────────────────
DROP TRIGGER  IF EXISTS accounts_normalize_phones ON public.accounts;
DROP TRIGGER  IF EXISTS pending_members_normalize_phones ON public.pending_members;
DROP FUNCTION IF EXISTS public.tg_normalize_phones();
DROP FUNCTION IF EXISTS public.normalize_phone(text);

-- ── Normalizer ─────────────────────────────────────────────────────────────
-- NANP-first (every current tenant is +1): strip to digits; keep an explicit '+'
-- or an 11-digit '1…' as the country code; a bare 10-digit number is assumed +1;
-- anything else is '+' + digits (best effort).
CREATE FUNCTION public.normalize_phone(raw text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  had_plus boolean;
  digits   text;
BEGIN
  IF raw IS NULL OR btrim(raw) = '' THEN
    RETURN NULL;
  END IF;
  had_plus := left(btrim(raw), 1) = '+';
  digits   := regexp_replace(raw, '[^0-9]', '', 'g');
  IF digits = '' THEN
    RETURN NULL;
  END IF;
  IF had_plus THEN
    RETURN '+' || digits;                        -- explicit international
  ELSIF length(digits) = 11 AND left(digits, 1) = '1' THEN
    RETURN '+' || digits;                        -- 1 + NANP
  ELSIF length(digits) = 10 THEN
    RETURN '+1' || digits;                        -- bare NANP → default +1
  ELSE
    RETURN '+' || digits;                        -- best effort
  END IF;
END;
$$;

-- ── Trigger: normalize on every write ──────────────────────────────────────
CREATE FUNCTION public.tg_normalize_phones()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.phone                   := public.normalize_phone(NEW.phone);
  NEW.emergency_contact_phone := public.normalize_phone(NEW.emergency_contact_phone);
  RETURN NEW;
END;
$$;

CREATE TRIGGER accounts_normalize_phones
  BEFORE INSERT OR UPDATE ON public.accounts
  FOR EACH ROW EXECUTE FUNCTION public.tg_normalize_phones();

CREATE TRIGGER pending_members_normalize_phones
  BEFORE INSERT OR UPDATE ON public.pending_members
  FOR EACH ROW EXECUTE FUNCTION public.tg_normalize_phones();

-- ── One-time backfill (the trigger re-normalizes; idempotent) ──────────────
UPDATE public.accounts
   SET phone                   = public.normalize_phone(phone),
       emergency_contact_phone = public.normalize_phone(emergency_contact_phone)
 WHERE phone IS NOT NULL OR emergency_contact_phone IS NOT NULL;

UPDATE public.pending_members
   SET phone                   = public.normalize_phone(phone),
       emergency_contact_phone = public.normalize_phone(emergency_contact_phone)
 WHERE phone IS NOT NULL OR emergency_contact_phone IS NOT NULL;
