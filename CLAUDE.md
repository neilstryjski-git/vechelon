# Vechelon — Claude Code conventions

This file holds **Vechelon-specific bindings only.** Product Trio Agentic governance — Sprint 0, the Three-Amigos/review model (code review = `stride:task-reviewer`), MACD / Pillar immutability, and the Amendment Protocol — is provided by the **product-trio plugin** and is not restated here.

- **Install:** `/plugin marketplace add neilstryjski-git/product-trio-agentic-process` then `/plugin install product-trio@product-trio` (auto-installs the `stride` dependency on Claude Code ≥ v2.1.143).
- **Fallback when the product-trio plugin isn't active in a session:** follow the operating model in `~/.claude/projects/-home-neil-stryjski-vechelon/memory/feedback_operating_model.md`, and run the Stride task lifecycle directly via the `stride:stride-workflow` skill.
- **Sr PM (Neil) is in the loop only for** strategic ambiguity, Pillar/MACD ratifications, and UAT-style validation of grouped UX flows.

## Stack
- **Frontend:** React + Vite (`admin/`), Vercel-hosted, deployed on push to `master`
- **Backend:** Supabase (PostgreSQL + RLS + Edge Functions in Deno)
- **Auth:** Supabase magic-link (no passwords)
- **Project tracking:** Stride board **116** (https://www.stridelikeaboss.com/boards/116)
- **Supabase project:** `drktcxggaizkbvqccfhp` (Vechelon)
- **GitHub:** `neilstryjski-git/vechelon` (default branch `master`)

## Project conventions
- **`required_capabilities` is empty by default.** The capability-routing model (Gemini vs Claude) was deprecated 2026-04-28. Don't add `database_design`, `security_analysis`, `api_design`, or `ui_design` to new task specs — those gates blocked Claude unnecessarily.
- **Pillar set source of truth:** `productdocuments/vechelon_voc_mt_ia_pillar_*_v1.3.2.md` (current set). Earlier `vechelon_pillar_*` files are the original Bedrock — additive, untouched except by formal MACD amendment.

## Supabase work — ALWAYS invoke `supabase-patterns` skill first

**Before** writing or modifying any of the following, invoke the `supabase-patterns` skill:
- `supabase/migrations/**.sql` — RLS policies, indexes, constraints, triggers, views
- `supabase/functions/**/index.ts` — Edge Functions
- `admin/src/**` code that calls `supabase.from(...).upsert(...)`, `supabase.auth.signOut(...)`, or constructs an RLS-aware query

The skill captures six patterns that have caused real production incidents (W126 RLS recursion, D33 sign-out scope, D37 partial-index upsert). The PreToolUse hook in `.claude/settings.local.json` emits a reminder when you `Write` or `Edit` a Supabase file — heed it.

## Stride — Vechelon specifics

Run the task lifecycle via the `stride:stride-workflow` skill (don't hand-assemble it); review depth follows that skill's decision matrix. Vechelon-specific overrides:
- For RLS migrations, extend the reviewer prompt with **explicit recursion-check focus** — self-referencing RLS is the #1 source of incidents here.
- After merge: `npx supabase db push --linked` for migrations; `npx supabase functions deploy <name> --project-ref drktcxggaizkbvqccfhp` for edge functions.

## Stride bookkeeping gotchas
- Defects (`type: "defect"`) sometimes reject `claim` on the first call — usually after recent state changes. Retrying once or PATCHing dependencies/needs_review off has worked.
- `mark_reviewed` requires the task to be in Review column AND `review_status` set first. Order: `complete` → `set review_status=approved` → `mark_reviewed`.
- `needs_review=true` on a task makes claim flakey. Set it AFTER claim, not before.

## Production incident response
1. Diagnose via Supabase Management API (`https://api.supabase.com/v1/projects/drktcxggaizkbvqccfhp/database/query`) using the access token at `~/.supabase/access-token`
2. **Hotfix first** via Management API SQL DROP — restore service, do not wait for a clean migration
3. Then file the proper fix migration with **defensive `DROP IF EXISTS`** so fresh deploys don't reintroduce the bug
4. Three-Amigos review the fix with explicit "incident postmortem" framing — reviewer should look for the root cause, not just the patch
5. Update memory under `feedback_*` or `project_*incident*` so future sessions don't repeat

## Useful one-liners
```sh
# Production query via Management API
ACCESS_TOKEN=$(cat ~/.supabase/access-token)
curl -sS -X POST "https://api.supabase.com/v1/projects/drktcxggaizkbvqccfhp/database/query" \
  -H "Authorization: Bearer $ACCESS_TOKEN" -H "Content-Type: application/json" \
  -d '{"query":"SELECT count(*) FROM accounts;"}'

# Stride: list G22 child tasks
curl -sS "https://www.stridelikeaboss.com/api/tasks?board_id=116&parent_id=1772&limit=30" \
  -H "Authorization: Bearer stride_dev_..." -H "User-Agent: Stride-CLI/1.0"
```

## Memory pointers
- `MEMORY.md` lives at `~/.claude/projects/-home-neil-stryjski-vechelon/memory/`
- Active milestone: `project_g22_voc_mt_ia_sprint0.md`
- Pending Brain artifacts: `project_pending_brain_artifacts.md`
- Operating model: `feedback_operating_model.md`
