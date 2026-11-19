-- W312 — the `actor_deleted` reason (Sprint 2 brief item 7, rule T13; Ledger §1 SD-011 as
-- amended 2026-11-15).
--
-- SD-011: a blank beacon_cancelled_by with a blank beacon_cancel_reason is reserved for
-- system error. Account deletion (W299, delete_account_data) blanks beacon_cancelled_by on
-- the deleted person's past cancels, so until now those rows read as system error. The
-- amended SD-011: "When account deletion blanks the actor on a row with no reason, it sets
-- the reason to actor_deleted; rows already marked ride_ended keep that reason."
--
-- How: a BEFORE UPDATE trigger on beacon_alerts, not an edit to delete_account_data.
--   * The rule then holds in the same statement that blanks the actor, whoever the server
--     caller is, so the blank/blank state never exists, even for a moment.
--   * delete_account_data is a 280-line function; re-declaring it here to change one line
--     would fork it from W299, and a later edit to either copy could drop the rule.
--   * The foreign key on beacon_cancelled_by is ON DELETE RESTRICT (20260610000000), not SET
--     NULL, so the deletion function's own UPDATE is the only path that blanks an actor. If
--     the key is ever changed to SET NULL, this trigger covers that path too.
--   The trigger is therefore a little wider than "account deletion": any SERVER update that
--   removes the actor from a closed row with no reason marks it actor_deleted. No such
--   writer exists today besides the deletion function. Recorded in mobile/log_of_changes.md.
--
-- The reason stays server-only:
--   * API roles (anon, authenticated) get nothing from this trigger: it returns at once for
--     them, so a client cannot use it to have a reason written on its behalf. A client
--     cannot blank an actor at all once W311's guard is applied, and cannot write the
--     reason under the D81 guard (unchanged).
--   * delete_account_data is SECURITY DEFINER and is called by the delete-account edge
--     function with the service role, so current_user there is never an API role.
--
-- ride_ended rows are never rewritten: the trigger acts only when the reason is blank.
--
-- supabase-patterns walkthrough:
--   * Pattern 1 (recursion): no policy created or changed. The trigger function reads and
--     writes no table; it edits only its own NEW row. No trigger loop.
--   * Pattern 5 (idempotency): the check constraint is dropped IF EXISTS and re-added; CREATE
--     OR REPLACE FUNCTION; DROP TRIGGER IF EXISTS before CREATE.
--   * Pattern 7 (grants): no new table or view. EXECUTE on the trigger function is revoked.
--
-- No backfill: staging has no closed row with a blank actor and a blank reason (checked
-- 2026-11-18), and one that did exist could not be told apart from a real system error.
--
-- Scope: Rail 3 schema (rail3-integration + staging), off the production push until promotion.

ALTER TABLE public.beacon_alerts
  DROP CONSTRAINT IF EXISTS beacon_alerts_cancel_reason_check;
ALTER TABLE public.beacon_alerts
  ADD CONSTRAINT beacon_alerts_cancel_reason_check
  CHECK (beacon_cancel_reason IS NULL OR beacon_cancel_reason IN ('ride_ended', 'actor_deleted'));

COMMENT ON COLUMN public.beacon_alerts.beacon_cancel_reason IS
  'Why the beacon closed when no acting person is recorded, or when the ride ended. '
  'ride_ended: closed because its ride ended (D81). actor_deleted: cancelled by a person '
  'whose account has since been deleted (W312). NULL with a NULL beacon_cancelled_by on a '
  'closed row is reserved for system error (SD-011). Written by the server only.';

CREATE OR REPLACE FUNCTION public.rail3_mark_beacon_actor_deleted()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  -- SECURITY INVOKER on purpose: current_user is the real caller. API roles get nothing.
  IF current_user IN ('anon', 'authenticated') THEN
    RETURN NEW;
  END IF;

  IF OLD.beacon_cancelled_by IS NOT NULL
     AND NEW.beacon_cancelled_by IS NULL
     AND NEW.beacon_cancelled_at IS NOT NULL
     AND NEW.beacon_cancel_reason IS NULL THEN
    NEW.beacon_cancel_reason := 'actor_deleted';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.rail3_mark_beacon_actor_deleted() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_rail3_beacon_actor_deleted ON public.beacon_alerts;
CREATE TRIGGER trg_rail3_beacon_actor_deleted
  BEFORE UPDATE OF beacon_cancelled_by ON public.beacon_alerts
  FOR EACH ROW
  EXECUTE FUNCTION public.rail3_mark_beacon_actor_deleted();

COMMENT ON FUNCTION public.rail3_mark_beacon_actor_deleted() IS
  'W312 / SD-011: when the server removes the actor from a closed beacon that has no reason '
  '(account deletion), the reason becomes actor_deleted in the same statement. Rows with a '
  'reason (ride_ended) are left alone. API roles pass through untouched.';
