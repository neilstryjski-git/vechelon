-- =====================================================================
-- W288 — Rail 3 per-row participation state signal (Ledger slate 17 / C2 item 23;
-- Pillar II §4.1 ROSTER; Pillar III R3-74). Base branch rail3-integration; HELD off the prod
-- `db push --linked` pipeline until promotion (W259), like every Rail 3 migration.
--
-- Additive, nullable, no backfill, no policy or grant change (precedent: 20260610000000
-- rail3_schema §2 "Additive columns on inherited tables"; comments per 20260428000000).
--
-- supabase-patterns: Pattern 5 (idempotent — ADD COLUMN IF NOT EXISTS); no RLS touched, so no
-- recursion surface (participant_update_policy's `account_id = auth.uid()` branch already
-- permits the own-row write the app makes; the insert policy carries no column list).
--
-- DEPLOY ORDER: the app's self-RSVP INSERT names this column from W288 on — apply to staging
-- BEFORE the next field build or every in-app join fails (PGRST204, the D83 failure class).
-- =====================================================================

ALTER TABLE public.ride_participants
  ADD COLUMN IF NOT EXISTS rail3_joined_at timestamptz;

COMMENT ON COLUMN public.ride_participants.rail3_joined_at IS
  'W288 (slate 17): first moment this participant opened the ride in the Rail 3 app — set by the in-app self-RSVP insert or by markRail3Joined() on an existing row. NULL = roster-only (guest, web-linked member, admin-added crew, every iOS rider until Rail 3b). NOT joined_at: that column is NOT NULL DEFAULT now() on every insert path including web and says nothing about the app. Never derived from ping or beacon state. No backfill: existing rows read roster-only until the rider opens the app.';
