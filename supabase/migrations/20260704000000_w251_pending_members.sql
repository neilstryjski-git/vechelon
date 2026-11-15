-- W251 (Goal G31): Phone-shell member onboarding — data foundation.
--
-- Adds a phone-only "shell" concept for onboarding a rider the club has only a
-- phone number for. A shell is deliberately NOT an accounts row: public.accounts
-- requires a NOT NULL email that is FK-synced to auth.users (magic-link identity),
-- so a phone-only contact cannot be an account. The shell lives here until the
-- rider completes their profile (supplying the email that becomes their auth
-- identity), at which point an edge function provisions a real account and marks
-- the shell completed + linked. "Invalid until completed" is therefore structural:
-- no email => no auth identity => cannot log in.
--
-- supabase-patterns:
--   * Pattern 1 — RLS admin gate uses the EXISTING is_tenant_admin(uuid)
--     SECURITY DEFINER helper (bypasses RLS on the account_tenants read), so no
--     policy on pending_members references pending_members: zero recursion risk.
--   * Pattern 5 — DROP ... IF EXISTS at the top so fresh deploys / db reset replay
--     cleanly (idempotent even though this is a greenfield object).
--   * Pattern 7 — explicit role-matched GRANTs. pending_members is admin-facing
--     and service-role-written, NOT rider-facing: authenticated gets SELECT only
--     (admins list shells in Members.tsx), service_role gets full CRUD (the mint /
--     complete edge functions), and anon gets NOTHING (the public completion path
--     goes through a service-role edge function, never client RLS).
--   * Vault secret accessor mirrors get_rider_hash_secret(): vault.decrypted_secrets
--     is not exposed via PostgREST, so a SECURITY DEFINER helper (service_role only)
--     reads it. The secret VALUE ('completion_token_secret') is seeded out-of-band
--     via the Management API, never committed to a migration.

-- ── Idempotency (Pattern 5) ────────────────────────────────────────────────────
-- DROP TABLE cascades its policies + indexes, so no standalone DROP POLICY (which
-- would itself require the table to exist and break a fresh replay).
DROP FUNCTION IF EXISTS public.get_completion_token_secret();
DROP TABLE    IF EXISTS public.pending_members;
DROP TYPE     IF EXISTS public.pending_member_status;

-- ── Status enum ────────────────────────────────────────────────────────────────
CREATE TYPE public.pending_member_status AS ENUM (
  'pending',    -- shell created, awaiting completion via the one-time link
  'completed',  -- rider completed their profile; account_id is set
  'expired',    -- link lapsed (>7 days) before completion
  'revoked'     -- admin cancelled the shell
);

-- ── Table ──────────────────────────────────────────────────────────────────────
CREATE TABLE public.pending_members (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  phone                    text NOT NULL,
  name                     text,
  emergency_contact_name   text,
  emergency_contact_phone  text,
  token_hash               text NOT NULL,       -- HMAC of the one-time token; raw token never stored
  status                   public.pending_member_status NOT NULL DEFAULT 'pending',
  expires_at               timestamptz NOT NULL,
  created_by               uuid REFERENCES public.accounts(id) ON DELETE SET NULL,
  account_id               uuid REFERENCES public.accounts(id) ON DELETE SET NULL,  -- set on completion
  completed_at             timestamptz,
  created_at               timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.pending_members IS
  'W251/G31: phone-only member shells awaiting profile completion via a one-time link. NOT an account (no email/auth identity) until status=completed and account_id is set.';

-- Admin roster listing is scoped by tenant + status; token lookups are by hash.
CREATE INDEX pending_members_tenant_status_idx
  ON public.pending_members (tenant_id, status);
CREATE UNIQUE INDEX pending_members_token_hash_key
  ON public.pending_members (token_hash);

-- ── RLS ────────────────────────────────────────────────────────────────────────
ALTER TABLE public.pending_members ENABLE ROW LEVEL SECURITY;

-- Grants (Pattern 7): role-matched, minimal. On pre-2026-10-30 projects Supabase
-- STILL auto-grants anon+authenticated full CRUD via ALTER DEFAULT PRIVILEGES, so
-- an additive GRANT does not restrict — REVOKE explicitly first, then grant only
-- what each role needs. anon gets NOTHING; authenticated gets SELECT only.
REVOKE ALL                           ON public.pending_members FROM anon, authenticated;
GRANT SELECT                         ON public.pending_members TO authenticated;  -- admins list shells
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pending_members TO service_role;   -- mint/complete edge fns

-- Admins of the shell's tenant may SELECT it (list in Members.tsx). Writes happen
-- only via the service-role edge functions (which bypass RLS), so no authenticated
-- INSERT/UPDATE/DELETE policy is granted — minimal surface (Pattern 1: the gate is
-- the existing SECURITY DEFINER helper, never a self-referencing subquery).
CREATE POLICY "pending_members_admin_select"
  ON public.pending_members
  FOR SELECT TO authenticated
  USING (public.is_tenant_admin(tenant_id));

-- ── Vault accessor for the completion-token HMAC secret ────────────────────────
-- Mirrors get_rider_hash_secret(): service_role only, reads vault.decrypted_secrets
-- (not reachable via PostgREST). Seed the secret out-of-band:
--   SELECT vault.create_secret('<random>', 'completion_token_secret');
CREATE OR REPLACE FUNCTION public.get_completion_token_secret()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT decrypted_secret
  FROM vault.decrypted_secrets
  WHERE name = 'completion_token_secret'
  LIMIT 1;
$$;

-- REVOKE FROM PUBLIC alone does NOT remove the explicit default-privilege EXECUTE
-- grants Supabase adds to anon+authenticated — name them so the vault secret is
-- reachable by service_role ONLY (a SECURITY DEFINER leak to anon would expose the
-- HMAC signing key).
REVOKE ALL    ON FUNCTION public.get_completion_token_secret() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_completion_token_secret() TO service_role;
