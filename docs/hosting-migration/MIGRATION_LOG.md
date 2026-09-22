# Vercel → Cloudflare migration log

Single log for all affected repos (`vechelon`, `neil-branding`, `itin-wizard`), per the brief. Every change records what, where, when, why. Stride goal G35.

| When (UTC) | Phase | What | Where | Why |
|---|---|---|---|---|
| 2026-09-22 | 1 | Inventory produced: `docs/hosting-migration/inventory.md`. No infrastructure changed. | vechelon repo, branch W294 | Brief Phase 1 gate — surprises on paper before production. |
| 2026-09-22 | 1 | Read-only probes: NS/records via Google + Cloudflare DoH; HTTPS headers per host; Vercel REST (projects, env names, domains, aliases, tokens, webhooks, drains); Supabase Management API auth config (prod + staging); Supabase secrets names; repo greps. | external APIs, three local repos | Facts for the inventory. No values or tokens recorded. |
| 2026-09-22 | 1 | Stride goal G35 created (W294–W298, one task per phase). | Stride board 116 | Track the work. |

Pending (not yet done): Porkbun zone export (Neil); decisions S1/S5/S7/S9; Maps referrer list; Play-hold confirmation; Cloudflare account choice.
