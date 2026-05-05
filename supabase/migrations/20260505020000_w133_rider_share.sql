-- W133 Rider Share
--
-- Two changes:
--  1. Add 'rider_share' to the authenticated INSERT allowlist on analytics_events.
--  2. Create reverse_rider_hash(text) → uuid — service-role-only lookup that
--     accepts a 12-char base32 hash and returns the matching account_id.
--     Uses pgcrypto hmac() to reproduce the Edge Function's HMAC-SHA256 + base32.
--
-- Idempotency (Pattern 5): DROP IF EXISTS at top of every created artifact.

-- ─── Prerequisites ────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ─── Pattern 5: drop before recreate ─────────────────────────────────────────
DROP POLICY   IF EXISTS analytics_events_insert_authenticated ON public.analytics_events;
DROP FUNCTION IF EXISTS public.reverse_rider_hash(text);

-- ─── 1. Tighten INSERT policy: add rider_share ────────────────────────────────
-- Carries the same tenant-scope guard as the W142 policy.
-- rider_share fires from authenticated affiliated members only (RideDetailSideSheet).
CREATE POLICY analytics_events_insert_authenticated ON public.analytics_events
  FOR INSERT TO authenticated
  WITH CHECK (
    event_type IN (
      'portal_visit',
      'portal_rsvp',
      'portal_gpx_download',
      'portal_nav_external',
      'broadcast_copy',
      'rider_share'
    )
    AND tenant_id IN (
      SELECT tenant_id FROM public.account_tenants WHERE account_id = auth.uid()
    )
  );

-- ─── 2. reverse_rider_hash ────────────────────────────────────────────────────
-- Given a 12-char lowercase base32 hash, return the account.id that produced it.
-- Called only from service-role contexts (analytics pipeline, admin tooling).
-- SECURITY DEFINER so it can read vault.decrypted_secrets without exposing that
-- access to the caller's role.
CREATE OR REPLACE FUNCTION public.reverse_rider_hash(p_hash text)
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_secret     text;
  v_account_id uuid;
  v_hmac       bytea;
  v_chars      text    := 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  v_encoded    text;
  v_bit_buf    integer := 0;
  v_bit_count  integer := 0;
  v_byte       integer;
  v_i          integer;
BEGIN
  SELECT decrypted_secret INTO v_secret
  FROM vault.decrypted_secrets
  WHERE name = 'rider_hash_secret'
  LIMIT 1;

  IF v_secret IS NULL THEN
    RAISE EXCEPTION 'rider_hash_secret not found in vault';
  END IF;

  FOR v_account_id IN SELECT id FROM public.accounts LOOP
    v_hmac      := hmac(v_account_id::text, v_secret, 'sha256');
    v_encoded   := '';
    v_bit_buf   := 0;
    v_bit_count := 0;

    FOR v_i IN 1..length(v_hmac) LOOP
      v_byte      := get_byte(v_hmac, v_i - 1);
      v_bit_buf   := (v_bit_buf << 8) | v_byte;
      v_bit_count := v_bit_count + 8;
      WHILE v_bit_count >= 5 LOOP
        v_bit_count := v_bit_count - 5;
        v_encoded   := v_encoded || substr(v_chars, ((v_bit_buf >> v_bit_count) & 31) + 1, 1);
      END LOOP;
    END LOOP;

    IF v_bit_count > 0 THEN
      v_encoded := v_encoded || substr(v_chars, ((v_bit_buf << (5 - v_bit_count)) & 31) + 1, 1);
    END IF;

    IF lower(left(v_encoded, 12)) = lower(p_hash) THEN
      RETURN v_account_id;
    END IF;
  END LOOP;

  RETURN NULL;
END;
$$;

REVOKE ALL   ON FUNCTION public.reverse_rider_hash(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reverse_rider_hash(text) TO service_role;
