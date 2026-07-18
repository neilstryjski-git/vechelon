-- D82: capture rail3_breadcrumb (table + RLS policies + is_rail3_* helper functions) that
-- existed ONLY as staging drift, and tighten its write policy to the D80 leader rule.
--
-- BACKGROUND. The rail3_breadcrumb table, its three RLS policies, and the two is_rail3_*
-- SECURITY DEFINER helpers were applied directly to the staging pooler and never captured in
-- a migration (verified: git log --all -S finds nothing). A fresh deploy — and the Rail 3
-- promotion to prod specifically — would therefore NEVER create them, so the captain
-- breadcrumb would silently do nothing anywhere but that one staging project. This migration
-- is the capture, mirroring the live staging definitions exactly (introspected 2026-07-18).
--
-- IDEMPOTENT + NON-DESTRUCTIVE (supabase-patterns Pattern 5): CREATE TABLE IF NOT EXISTS and
-- CREATE OR REPLACE / DROP POLICY IF EXISTS, so re-running never drops the table or its rows.
-- On a FRESH database it creates everything; on staging the table already exists (IF NOT
-- EXISTS is a no-op) so only the policies + functions are reconciled to the tightened rule.

-- 1) TABLE — one row per ride, the leader's decimated route, upserted on ride_id.
-- Captured exactly as it exists on staging: PK only, no FK to rides (matching live so fresh
-- deploys and staging stay identical; a rides FK is a separate hardening, out of scope here).
CREATE TABLE IF NOT EXISTS public.rail3_breadcrumb (
  ride_id    uuid        NOT NULL PRIMARY KEY,
  path       jsonb       NOT NULL DEFAULT '[]'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.rail3_breadcrumb ENABLE ROW LEVEL SECURITY;

-- 2) HELPER FUNCTIONS (supabase-patterns Pattern 1 — SECURITY DEFINER bypasses RLS for the
-- inner read, so the policies below never recurse and the gate can't be defeated by the
-- caller's row visibility). The first two are captured verbatim from staging; is_rail3_ride_
-- leader is NEW for the D80 tightening below. NOTE: after that tightening is_rail3_ride_captain
-- no longer gates THIS table (read = participant, write = leader) — retained for staging parity
-- (and any other rail3 policy that may use it), but it gates nothing in rail3_breadcrumb.
CREATE OR REPLACE FUNCTION public.is_rail3_ride_captain(target_ride_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.ride_participants
    WHERE ride_id = target_ride_id AND account_id = auth.uid() AND role = 'captain'
  );
$$;

CREATE OR REPLACE FUNCTION public.is_rail3_ride_participant(target_ride_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.ride_participants
    WHERE ride_id = target_ride_id AND account_id = auth.uid()
  );
$$;

-- D80/D82: the breadcrumb leader is the account that STARTED the ride (rides.started_by), NOT
-- any captain-roled participant. Mirrors rideLeaderId() (client) so the reader and the writer
-- cannot drift on who the leader is. SECURITY DEFINER bypasses rides' RLS for the check.
CREATE OR REPLACE FUNCTION public.is_rail3_ride_leader(target_ride_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.rides
    WHERE id = target_ride_id AND started_by = auth.uid()
  );
$$;

REVOKE ALL ON FUNCTION public.is_rail3_ride_captain(uuid)     FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_rail3_ride_participant(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_rail3_ride_leader(uuid)      FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_rail3_ride_captain(uuid)     TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_rail3_ride_participant(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_rail3_ride_leader(uuid)      TO authenticated;

-- 3) POLICIES. DROP IF EXISTS first so this reconciles staging's live (untightened) policies
-- and is safe to replay (Pattern 5). Read = any participant; WRITE = the ride's leader only.
DROP POLICY IF EXISTS rail3_breadcrumb_select ON public.rail3_breadcrumb;
DROP POLICY IF EXISTS rail3_breadcrumb_insert ON public.rail3_breadcrumb;
DROP POLICY IF EXISTS rail3_breadcrumb_update ON public.rail3_breadcrumb;

-- Read: any participant of the ride sees the leader's trail (unchanged from staging).
CREATE POLICY rail3_breadcrumb_select ON public.rail3_breadcrumb
  FOR SELECT TO authenticated
  USING (public.is_rail3_ride_participant(ride_id));

-- Write (TIGHTENED, D80): only the account that STARTED the ride may write its breadcrumb —
-- not any captain-roled participant. Closes the server-side gap where two captain-roled
-- participants (incl. the phantom club captain D80 was about) could clobber the same
-- onConflict:ride_id row; the one-ride-one-leader invariant was holding only because the
-- client was the sole writer.
CREATE POLICY rail3_breadcrumb_insert ON public.rail3_breadcrumb
  FOR INSERT TO authenticated
  WITH CHECK (public.is_rail3_ride_leader(ride_id));

CREATE POLICY rail3_breadcrumb_update ON public.rail3_breadcrumb
  FOR UPDATE TO authenticated
  USING (public.is_rail3_ride_leader(ride_id))
  WITH CHECK (public.is_rail3_ride_leader(ride_id));

-- 4) TABLE GRANTS (supabase-patterns Pattern 7 — RLS gates rows, GRANT gates table access;
-- required for fresh/post-2026-10-30 deploys where the implicit grant is gone). Role-matched
-- to the live grants: authenticated writes/reads (no DELETE — clients only upsert); service_
-- role full CRUD (the 4h purge runs as service_role); NOT anon (the mobile app is authenticated).
GRANT SELECT, INSERT, UPDATE         ON public.rail3_breadcrumb TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.rail3_breadcrumb TO service_role;
