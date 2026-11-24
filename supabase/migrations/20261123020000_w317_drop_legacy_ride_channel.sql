-- W317 — remove the legacy single ride channel (Sprint 2 cutover; written under W193).
--
-- ┌───────────────────────────────────────────────────────────────────────────────────────┐
-- │ STAGING: APPLY ONLY AT THE W317 CUTOVER, WITH THE SENIOR PM'S OK AT THAT STEP.          │
-- │ rail3:ride:<id> is the only channel the Play open-test build (versionCode 4) uses.     │
-- │ Removing its two policies cuts that build off from live positions and beacons.         │
-- └───────────────────────────────────────────────────────────────────────────────────────┘
--
-- This file was held at supabase/cutover/w193_drop_legacy_ride_channel.sql, outside the
-- migrations folder, until W317. It is a migration now so the trunk (local, CI, a fresh
-- project) has no legacy channel. On staging a bulk `supabase db push` still cannot reach it
-- early: 20261118030000 (the hydration trigger drop) sorts before it and refuses to run
-- until the cutover session says so. Staging migrations are applied one file at a time.
--
-- After this file nothing can subscribe to or send on rail3:ride:<id>: no policy on
-- realtime.messages matches the topic (rail3_channel_receive / rail3_channel_send, W193,
-- match only rail3:crew, rail3:lead, rail3:all and rail3:sos). The helper
-- rail3_topic_tenant_id is left in place (harmless, used by nothing else);
-- rail3_topic_ride_id is still used by the W193 policies.
--
-- Denial suite: T2.3 (a rider and a Captain on the ride are refused the legacy topic).
--
-- supabase-patterns: Pattern 5 (idempotency): IF EXISTS on both statements. Nothing is
-- created, so Patterns 1, 2 and 7 do not apply.

DROP POLICY IF EXISTS rail3_broadcast_tenant_receive ON realtime.messages;
DROP POLICY IF EXISTS rail3_broadcast_tenant_send ON realtime.messages;
