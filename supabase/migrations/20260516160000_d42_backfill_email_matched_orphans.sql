-- D42 backfill: link orphan ride_participants rows to their matching accounts
--
-- Companion to the guest-rsvp EF change that auto-links account_id when the
-- submitted email matches an existing accounts.email (W141). The EF fix is
-- forward-looking; this migration cleans up rows created before the fix
-- shipped — including the two known cases:
--   - valdemar.nickel@icloud.com (admin since 2026-04-16; RSVP'd as guest 2026-05-16)
--   - ayottedg@gmail.com (account created 2026-05-10; RSVP'd as guest 2026-05-09)
--
-- Idempotency: WHERE account_id IS NULL ensures re-running the migration is
-- a no-op for already-claimed rows. No DROP IF EXISTS needed since this is
-- DML, not DDL.
--
-- Collision safety: the uniq_ride_participants_ride_email partial index
-- already prevents two rows from sharing (ride_id, email), so a matched
-- account cannot have BOTH an orphan row AND a self-inserted row on the
-- same ride at the same time — the UPDATE cannot create a duplicate.
--
-- Attribution note: this changes the surfaced identity of historical
-- guest RSVPs from 'guest John (no account)' to 'John (member)' wherever
-- the email matches. Attendance counts are unchanged; only the display
-- name source shifts. Accepted per the simpler design agreed for D42.

UPDATE public.ride_participants rp
SET
  account_id = a.id,
  role       = 'member'
FROM public.accounts a
WHERE rp.account_id IS NULL
  AND rp.email IS NOT NULL
  AND lower(rp.email) = lower(a.email);

-- Verification (intentionally executed but not asserted — surfaces row count
-- in the migration log so we can confirm the sweep size at deploy time):
DO $$
DECLARE
  remaining_orphans INTEGER;
BEGIN
  SELECT count(*) INTO remaining_orphans
  FROM public.ride_participants rp
  WHERE rp.account_id IS NULL
    AND rp.email IS NOT NULL
    AND EXISTS (SELECT 1 FROM public.accounts a WHERE lower(a.email) = lower(rp.email));
  IF remaining_orphans > 0 THEN
    RAISE NOTICE 'D42 backfill: % rows still orphaned after sweep (unexpected)', remaining_orphans;
  ELSE
    RAISE NOTICE 'D42 backfill: sweep complete, no remaining email-matched orphans';
  END IF;
END $$;
