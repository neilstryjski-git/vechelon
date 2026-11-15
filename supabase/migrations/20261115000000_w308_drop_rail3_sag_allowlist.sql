-- W308 (Sprint 2 item 2): drop rail3_sag_allowlist, its trigger and its function.
--
-- These three objects were applied to staging by hand during the proof of concept
-- (supabase/staging/w214_sag_allowlist.sql, now removed) and exist in no migration.
-- Any participant whose email was on the list was given the 'support' (SAG) role
-- on insert: a role-granting side door outside reviewed code. Ledger v1.2.0 rules
-- "Drop". The SAG role is granted through the reviewed path only: a club admin,
-- the ride creator or existing crew, checked by ride_participants_guard_role (D96).
--
-- On a database built from migrations (CI, production) none of the three exist, so
-- every statement is a no-op there.
--
-- Safety: the migration refuses to run if the table still holds rows, so a live
-- allowlist entry is never dropped silently. Staging held 0 rows on 2026-11-15.
--
-- W299: delete_my_account() reads the table only behind a to_regclass() guard with
-- dynamic SQL, so it keeps working once the table is gone.
--
-- supabase-patterns:
--   Pattern 5 (idempotency): IF EXISTS on every drop; re-running is a no-op.
--   Patterns 1, 2, 7: not applicable (no policy, view or new object).

DO $$
DECLARE
  n bigint;
BEGIN
  -- The table has RLS on and no policies. A role subject to RLS would count 0 rows
  -- whatever the table holds; with row_security off it gets an error instead.
  SET LOCAL row_security = off;
  IF to_regclass('public.rail3_sag_allowlist') IS NOT NULL THEN
    EXECUTE 'SELECT count(*) FROM public.rail3_sag_allowlist' INTO n;
    IF n > 0 THEN
      RAISE EXCEPTION 'W308: rail3_sag_allowlist holds % row(s); review them before dropping the table', n;
    END IF;
  END IF;
END;
$$;

-- Order: trigger, then the function it calls, then the table the function reads.
DROP TRIGGER  IF EXISTS rail3_sag_allowlist_promote_trg ON public.ride_participants;
DROP FUNCTION IF EXISTS public.rail3_sag_allowlist_promote();
DROP TABLE    IF EXISTS public.rail3_sag_allowlist;
