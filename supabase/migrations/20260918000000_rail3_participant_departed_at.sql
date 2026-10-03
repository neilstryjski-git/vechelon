-- =====================================================================
-- W292 — Rail 3 durable DEPARTED mark on the participant row (Ledger C3 item 7; Pillar III
-- R3-65 / R3-67 / R3-68 / R3-70). Base branch rail3-integration; HELD off the prod
-- `db push --linked` pipeline until promotion (W259), like every Rail 3 migration.
--
-- Additive, nullable, no backfill, no policy / grant / trigger change (precedent: 20260916000000
-- rail3_participant_joined_at). participant_update_policy (20260410000001) already permits the
-- own-row write the app makes (`account_id = auth.uid()`, no column list) — nothing on the RLS
-- surface moves, so the recursion check is nil by construction.
--
-- supabase-patterns: Pattern 5 (idempotent — ADD COLUMN IF NOT EXISTS; COMMENT ON is naturally
-- idempotent). Pattern 7 n/a (no new table or view).
--
-- Why a column and not a status value: ride_participant_status is the RSVP/attendance ladder
-- shared with the web; "departed" is a Rail 3 RENDER/roster state (R3-70: departure changes
-- rendering, never retention). A timestamp carries both the mark and the sender-clock instant the
-- fleet needs for "departure beats seed, not rejoin": a live ping renders only if its own ts is
-- newer than this value. NEVER a coordinate (Pillar II §2 / A4).
--
-- DEPLOY ORDER — stronger than W288: from this build on THREE paths name the column —
-- useFleetPositions.fetchLastKnown (SELECT), RosterScreen.load (SELECT) and broadcastDeparture
-- (UPDATE). Without it on staging xybgtbybdhxuwqjfcfkc the last-known fleet fallback errors
-- out entirely, the roster falls to the W289 cache, and the departure UPDATE fails atomically
-- (PGRST204) so last_* is NOT nulled either → the D87 phantom returns. Apply BEFORE the field build.
-- =====================================================================

ALTER TABLE public.ride_participants
  ADD COLUMN IF NOT EXISTS departed_at timestamptz;

COMMENT ON COLUMN public.ride_participants.departed_at IS
  'W292 (C3 item 7, R3-65/67/68/70): set by broadcastDeparture on a TRUE departure (Leave Ride, sign-out) in the same own-row UPDATE that nulls last_lat/last_long/last_ping; NOT set on a ride-end teardown (W287, R3-70 — a Saved ride keeps last_* to the T+4h purge). Cleared by the in-app rejoin (markRail3Rejoined), which also refreshes rail3_joined_at. NULL = present or never departed. Client-clock ISO like rail3_joined_at: viewers compare it against the SAME sender''s ping timestamps (a ping renders only if newer). A timestamp only — never a coordinate. Never a deletion: the row, its contact fields and its purge schedule are untouched.';

-- W292 widens the W288 semantic: a rejoin after a departure refreshes this stamp (a plain re-open
-- without a departure still never moves it).
COMMENT ON COLUMN public.ride_participants.rail3_joined_at IS
  'W288 (slate 17): moment this participant opened the ride in the Rail 3 app — set by the in-app self-RSVP insert or by markRail3Joined() on an existing row; W292: refreshed by markRail3Rejoined() on a fresh join AFTER a departure (departed_at cleared in the same statement); a re-open without a departure never moves it. NULL = roster-only (guest, web-linked member, admin-added crew, every iOS rider until Rail 3b). NOT joined_at: that column is NOT NULL DEFAULT now() on every insert path including web and says nothing about the app. Never derived from ping or beacon state. No backfill.';
