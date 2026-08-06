# Rail 3 — Broadcast tenant-authorization (G-1 resolution)

**Task W170.** LLD resolution of Sprint-0 gap **G-1**: Rail 3's live GPS/beacon fan-out
uses Supabase **Broadcast** (ephemeral, no DB write per Pillar II §2), so ordinary table
RLS does *not* govern who can subscribe to a ride's live channel. Without an explicit
gate, a rider could join another tenant's live ride channel — violating the Pillar I §3
multi-tenancy constraint at the realtime layer.

## Mechanism — native Supabase Realtime Authorization ($0)

1. **Private channels.** Rail 3 subscribes to each ride on a **private** channel
   (`config.private = true`) named **`rail3:ride:<ride_uuid>`** — a distinct prefix from
   the web app's public `ride:<id>` channels. (`mobile/src/hooks/useRideChannel.ts`)

2. **RLS on `realtime.messages`.** Private channels make Realtime evaluate the RLS
   policies on `realtime.messages`. Two policies (`migrations/20260610010000_…`) authorize
   a rail3 topic only when the connected rider's tenant equals the ride's tenant:
   - `rail3_broadcast_tenant_receive` (SELECT — receive fan-out)
   - `rail3_broadcast_tenant_send` (INSERT — send a broadcast)

3. **Tenant resolution.** Both compare `public.get_my_tenant_id()` (the rider's tenant,
   from `account_tenants`) with `public.rail3_topic_tenant_id(realtime.topic())` — a
   `SECURITY DEFINER` helper that safe-parses the topic's ride id and returns the ride's
   tenant (bypassing `rides` RLS so the gate is by tenant *ownership*, not tiered
   visibility). Both helpers are SECURITY DEFINER and read `account_tenants` / `rides` —
   never `realtime.messages` — so there is no RLS recursion.

The binding is to the **session JWT's** tenant claim (resolved live per connection), not
a long-lived broadcast token.

## Why this is isolation-safe

`realtime.messages` already had RLS enabled (deny-all, 0 policies). The web app's live
HUD uses **public** `ride:<id>` channels (`admin/src/hooks/useRideRealtime.ts`,
`lib/simulation.ts`), which **bypass `realtime.messages` RLS entirely**. These policies
only ever evaluate `rail3:ride:*` topics, so the web app's realtime is untouched. No
existing policy is altered; the change is purely additive.

## Verification

- **Cross-tenant denial** (G-1 / DoD-12): a rider from tenant A subscribing to a tenant-B
  `rail3:ride:<id>` channel is denied at the realtime layer — the behavioral integration
  test lives in **W182** (it needs live Realtime clients, not a plain SQL harness).
- **In-tenant fan-out:** same-tenant riders receive position/beacon broadcasts.
