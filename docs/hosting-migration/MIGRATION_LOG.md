# Vercel → Cloudflare migration log

Single log for all affected repos (`vechelon`, `neil-branding`, `itin-wizard`), per the brief. Every change records what, where, when, why. Stride goal G35.

| When (UTC) | Phase | What | Where | Why |
|---|---|---|---|---|
| 2026-09-22 | 1 | Inventory produced: `docs/hosting-migration/inventory.md`. No infrastructure changed. | vechelon repo, branch W294 | Brief Phase 1 gate — surprises on paper before production. |
| 2026-09-22 | 1 | Read-only probes: NS/records via Google + Cloudflare DoH; HTTPS headers per host; Vercel REST (projects, env names, domains, aliases, tokens, webhooks, drains); Supabase Management API auth config (prod + staging); Supabase secrets names; repo greps. | external APIs, three local repos | Facts for the inventory. No values or tokens recorded. |
| 2026-09-22 | 1 | Review round 1 corrections: `/privacy` rewrite added from `master:vercel.json` (explorer had read the `rail3-integration` copy); `vechelon.ca` apex re-recorded as a flattened alias, not static A; cutover-record Port row added. | inventory.md | Reviewer findings. |
| 2026-09-22 | 1 | Review round 2 (cap): fixes verified; cutover-record count corrected to nine (post-cap minor, no further round); criterion 2 (Porkbun export) remains a recorded gap. | inventory.md | Reviewer findings. |
| 2026-09-22 | 1 | Decisions recorded: S1 blog.productdelivered.ca dropped from scope (never existed); S9 public Cloudflare previews accepted. | inventory.md | Neil, in review of the inventory. |
| 2026-09-22 | 1 | Decisions recorded: S7 add Google SPF/DKIM/DMARC to productdelivered.ca at Cloudflare (logged addition, Phase 2); S5 wildcard *.vechelon.ca (Phase 3). | inventory.md | Neil. |
| 2026-09-22 | 1 | Authoritative zone exports pulled from the Porkbun API and committed (`dns-export-*.json`). Diff vs probes: +1 Google verification CNAME on productdelivered.ca; vechelon.ca apex = ALIAS confirmed. Acceptance criterion 2 of W294 now satisfied. | docs/hosting-migration/ | Phase 2 source of truth. |
| 2026-09-22 | 1 | Play-verification hold on vechelon.productdelivered.ca cleared by Neil; Phase 4 cuts all hosts together. | inventory.md | Neil. |
| 2026-09-22 | 1 | Cloudflare account created by Neil (neil@productdelivered.ca, id aa40d158e471dc915ede763a273688cd); scoped API token created and verified (`/user/tokens/verify` = active). Zero zones. | Cloudflare | Phase 2 prerequisite. |
| 2026-09-22 | 1 | Stride goal G35 created (W294–W298, one task per phase). | Stride board 116 | Track the work. |

Pending (not yet done): Google DKIM key for productdelivered.ca (Step 4); Maps referrer list (Step 5, Phase 3); inventory approval in Stride (Step 6).
