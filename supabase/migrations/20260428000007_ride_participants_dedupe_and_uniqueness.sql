-- D37 — Roster duplicate prevention (email-strict)
--
-- Per Sr PM clarification (2026-04-28): email uniqueness must hold across the
-- entire ride participant set, not just within guest rows. A captain or
-- support already on the roster should NOT permit a new RSVP with the same
-- email address (whether that new RSVP is authenticated or guest).
--
-- Strategy:
--   1. Backfill — populate `email` on existing member rows from auth.users
--      so all rows have an email when the underlying user has one. Lowercase
--      for case-insensitive uniqueness via index.
--   2. Dedupe by (ride_id, lower(email)) regardless of account_id. Keep
--      latest joined_at per (ride_id, email).
--   3. Also dedupe by (ride_id, account_id) for any account_id rows that
--      happen to have email NULL (rare — auth.users.email shouldn't be null,
--      but defensive).
--   4. Two UNIQUE INDEXes:
--      - (ride_id, email) WHERE email IS NOT NULL — primary email-uniqueness
--      - (ride_id, account_id) WHERE account_id IS NOT NULL AND email IS NULL
--        — fallback for the rare null-email case
--
-- App-side (joinRide):
--   - Always store email — for authenticated users, sourced from
--     supabase.auth.getUser().email and lowercased
--   - Upsert with onConflict on (ride_id, email)

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Normalise existing emails to lowercase
-- ─────────────────────────────────────────────────────────────────────────────

UPDATE public.ride_participants
SET email = lower(email)
WHERE email IS NOT NULL AND email <> lower(email);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Backfill member rows with their auth email
-- ─────────────────────────────────────────────────────────────────────────────
-- Safe across tenants: account_id matches auth.users.id 1:1; one auth identity
-- has one email, copied onto all that user's ride_participants rows regardless
-- of tenant. No cross-tenant pollution.

UPDATE public.ride_participants rp
SET email = lower(u.email)
FROM auth.users u
WHERE rp.account_id = u.id
  AND rp.email IS NULL
  AND u.email IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Dedupe by (ride_id, lower(email)) — keep latest joined_at
-- ─────────────────────────────────────────────────────────────────────────────

WITH ranked_by_email AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY ride_id, lower(email)
      ORDER BY joined_at DESC NULLS LAST, id DESC
    ) AS rn
  FROM public.ride_participants
  WHERE email IS NOT NULL
)
DELETE FROM public.ride_participants
WHERE id IN (SELECT id FROM ranked_by_email WHERE rn > 1);

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Defensive dedupe on (ride_id, account_id) for email-NULL rows
-- ─────────────────────────────────────────────────────────────────────────────

WITH ranked_by_account AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY ride_id, account_id
      ORDER BY joined_at DESC NULLS LAST, id DESC
    ) AS rn
  FROM public.ride_participants
  WHERE account_id IS NOT NULL AND email IS NULL
)
DELETE FROM public.ride_participants
WHERE id IN (SELECT id FROM ranked_by_account WHERE rn > 1);

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Add UNIQUE INDEXes
-- ─────────────────────────────────────────────────────────────────────────────

CREATE UNIQUE INDEX IF NOT EXISTS uniq_ride_participants_ride_email
  ON public.ride_participants (ride_id, email)
  WHERE email IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_ride_participants_ride_account_no_email
  ON public.ride_participants (ride_id, account_id)
  WHERE account_id IS NOT NULL AND email IS NULL;

COMMENT ON INDEX public.uniq_ride_participants_ride_email IS
  'D37 — Email uniqueness per ride, regardless of auth state. A captain or support already on the roster cannot be re-RSVPed with the same email (member or guest). Email is normalised to lowercase by joinRide so case variations collide.';

COMMENT ON INDEX public.uniq_ride_participants_ride_account_no_email IS
  'D37 — Defensive fallback for the rare case where an authenticated user has no auth.users.email. Should not trigger in normal operation.';
