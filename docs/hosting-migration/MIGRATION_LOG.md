# Vercel → Cloudflare migration log

Single log for all affected repos (`vechelon`, `neil-branding`, `itin-wizard`), per the brief. Every change records what, where, when, why. Stride goal G35.

| When (UTC) | Phase | What | Where | Why |
|---|---|---|---|---|
| 2026-09-22 | 1 | Inventory produced: `docs/hosting-migration/inventory.md`. No infrastructure changed. | vechelon repo, branch W294 | Brief Phase 1 gate — surprises on paper before production. |
| 2026-09-22 | 1 | Read-only probes: NS/records via Google + Cloudflare DoH; HTTPS headers per host; Vercel REST (projects, env names, domains, aliases, tokens, webhooks, drains); Supabase Management API auth config (prod + staging); Supabase secrets names; repo greps. | external APIs, three local repos | Facts for the inventory. No values or tokens recorded. |
| 2026-09-22 | 1 | Review round 1 corrections: `/privacy` rewrite added from `master:vercel.json` (explorer had read the `rail3-integration` copy); `vechelon.ca` apex re-recorded as a flattened alias, not static A; cutover-record Port row added. | inventory.md | Reviewer findings. |
| 2026-09-22 | 1 | Review round 2 (cap): fixes verified; cutover-record count corrected to nine (post-cap minor, no further round); criterion 2 (Porkbun export) remains a recorded gap. | inventory.md | Reviewer findings. |
| 2026-09-22 | 1 | Decisions recorded: S1 blog.productdelivered.ca dropped from scope (never existed); S9 public Cloudflare previews accepted. | inventory.md | Neil, in review of the inventory. |
| 2026-09-22 | 1 | Stride goal G35 created (W294–W298, one task per phase). | Stride board 116 | Track the work. |

Pending (not yet done): Porkbun zone export (Neil) — until it lands, acceptance criterion 2 of W294 (full record set exported) is a documented gap, and the `vechelon.ca` apex record type is unconfirmed; decisions S5/S7; Maps referrer list; Play-hold confirmation; Cloudflare account choice.
