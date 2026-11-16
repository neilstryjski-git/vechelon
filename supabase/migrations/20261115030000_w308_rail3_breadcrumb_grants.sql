-- W308 (Sprint 2 item 1): make the rail3_breadcrumb table grants match staging.
--
-- 20260718000000_rail3_breadcrumb_capture.sql captured a table that had been made
-- on staging by hand. Its header says the grants are "role-matched to the live
-- grants": authenticated may SELECT, INSERT and UPDATE (clients only upsert, never
-- delete) and anon gets nothing. But it only GRANTs. On a database built from the
-- migrations the platform's default privileges have already given anon and
-- authenticated every privilege on the new table, and nothing takes them away. So
-- a trunk-built database was looser than staging: anon and authenticated held ALL.
-- Row level security still decided which rows; the table grant did not match.
--
-- This revokes first and then grants what the capture migration intended. On
-- staging the grants are already exactly these, so it changes nothing there.
--
-- supabase-patterns:
--   Pattern 7 (grants): REVOKE before GRANT, because an additive GRANT cannot
--     narrow a default-privilege grant. Role-matched to the table's policies, which
--     are all TO authenticated; no anon policy exists, so anon gets no grant.
--   Pattern 5 (idempotency): REVOKE and GRANT give the same result on every run.
--   Patterns 1, 2: not applicable (no policy or view).

REVOKE ALL ON public.rail3_breadcrumb FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE         ON public.rail3_breadcrumb TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.rail3_breadcrumb TO service_role;
