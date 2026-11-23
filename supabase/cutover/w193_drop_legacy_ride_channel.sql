-- W193 — remove the legacy single ride channel. NOT A MIGRATION YET: held for the W317 cutover.
--
-- This file lives outside supabase/migrations on purpose, so no `db push` or `db reset` can
-- run it early. At W317, with the Senior PM's OK, copy it into supabase/migrations under a
-- new timestamp and apply it.
--
-- rail3:ride:<id> is the only channel the Play open-test build (versionCode 4) uses. Removing
-- its two policies (D94) cuts that build off from live positions and beacons. After this file
-- nothing can subscribe to or send on rail3:ride:<id>: no policy matches it. The helpers
-- rail3_topic_tenant_id / rail3_topic_ride_id are left in place (harmless).
--
-- supabase-patterns: Pattern 5 (idempotency): IF EXISTS on both statements. Nothing is created.

DROP POLICY IF EXISTS rail3_broadcast_tenant_receive ON realtime.messages;
DROP POLICY IF EXISTS rail3_broadcast_tenant_send ON realtime.messages;
