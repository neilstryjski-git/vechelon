-- W308 (Sprint 2 item 1): capture the hand-made drop of the profile sync trigger.
--
-- 20260414000004_profile_sync_trigger.sql creates trg_sync_account_to_participants
-- on accounts and its function sync_account_to_participants(). The function filters
-- on rides.status NOT IN ('completed', 'cancelled'), but the ride_status enum is
-- ('created', 'active', 'saved'). Postgres rejects the comparison at run time, so on
-- any database that has the trigger every change to an account's name or phone
-- fails. A database built from the migrations (CI, a fresh deploy) has it.
--
-- Staging hit this on 2026-06-14. The Senior PM ruled that profile edits must not
-- depend on ride status, and the trigger and function were dropped on staging by
-- hand. That drop was never written down as a migration, so staging and the trunk
-- disagreed. This migration records it. A rider's identity reaches
-- ride_participants when they join a ride, not through a profile-edit sync.
--
-- On a database where both are already gone (staging) every statement is a no-op.
--
-- supabase-patterns:
--   Pattern 5 (idempotency): IF EXISTS on both drops.
--   Patterns 1, 2, 7: not applicable (no policy, view or new object).

DROP TRIGGER  IF EXISTS trg_sync_account_to_participants ON public.accounts;
DROP FUNCTION IF EXISTS public.sync_account_to_participants();
