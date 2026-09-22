# Vercel → Cloudflare migration — Phase 1 inventory

**Status:** DELIVERED for approval — nothing has been changed. Phase 2 does not start until Neil approves this document.
**Date:** 2026-09-22 · **Stride:** G35 / W294 · **Brief:** `vercel_to_cloudflare_migration_brief.md` (Google Drive `rail3/`, issued 2026-09-22)
**Scope:** everything Product Delivered Inc. and Vechelon run on Vercel. Outcome: nothing remains on Vercel; no hostname changes.

Every fact below names the command that produced it. Values of env vars, tokens and keys are deliberately absent — names and environments only. The explorer's full per-command trail is in the Stride task record; the raw probe outputs are reproducible with the commands shown.

---

## 0. Summary of surprises (read this first)

| # | Finding | Why it matters | Column |
|---|---|---|---|
| S1 | **`blog.productdelivered.ca` does not exist in DNS** (NXDOMAIN from the Porkbun authoritative servers, confirmed by Google and Cloudflare resolvers). The brief lists it as a Hashnode CNAME. | Either it was never created or it was removed. Nothing to carry over unless Neil supplies the Hashnode target. | decision |
| S2 | **The staging Race Control runs on a Vercel-owned hostname** (`vechelon-rail3-staging.vercel.app`, an alias on the `vechelon` project). The staging Supabase project's `site_url` and `uri_allow_list` point at it. | This is the one hostname that *must* change. Proposed new home: `rail3-staging.vechelon.ca` (record does not exist today). | port + external config |
| S3 | **`itin-wizard` has a live custom domain**, `itin-wizard.productdelivered.ca` (HTTP 200 from Vercel). The brief only mentions the marketing site and the Vechelon apps. | Third project to move; same account-level policy exposure. | redeploy as-is |
| S4 | **Two apex redirects are served by Vercel, not by DNS:** `productdelivered.ca` → 307 → `www.productdelivered.ca` (apex is not attached to any project; Vercel answers because the A record points at it), and `vechelon.ca` → 308 → `vechelon.productdelivered.ca` (a project-level domain redirect). | Both disappear when the apex records move. Must be recreated as Cloudflare Redirect Rules; the `vechelon.ca` apex is a flattened alias (see §1.2), so Cloudflare needs a proxied placeholder / flattened CNAME on the apex plus the Redirect Rule, not two static A records. | port |
| S5 | **No wildcard `*.vechelon.ca` record exists.** Each club is a separate Porkbun CNAME plus a Vercel "add domain" (`racer-sportif`, `bikes-and-beers`, `lakeside-wheelers`, `admin`). An unknown slug does not resolve at all. | Cloudflare allows a wildcard CNAME + Worker route, which removes the per-club onboarding step. Recommendation, not a requirement. | port (routing) |
| S6 | **`vechelon.productdelivered.ca` has no email records.** The brief says "DNS and email configured (DKIM via Resend)" for it; in fact DKIM/SPF live on `vechelon.ca` (`resend._domainkey`, `send.vechelon.ca`) and the Resend default From is `notifications@vechelon.ca`. | Fewer records to protect than the brief implies; the ones that matter are all on `vechelon.ca`. | redeploy (records) |
| S7 | **`productdelivered.ca` has no SPF, DKIM or DMARC** while its MX is Google Workspace and Neil sends from `neil@productdelivered.ca`. Pre-existing gap, not caused by Vercel. | The brief says "recreate exactly". Adding Google SPF/DKIM/DMARC at Cloudflare would be an *addition* — needs Neil's yes. | decision |
| S8 | **Web Analytics and Speed Insights are switched on for all three Vercel projects** (dashboard-level), but no `@vercel/analytics` / `@vercel/speed-insights` package or script exists in any repo. | Dashboard data is lost at decommission; nothing in code breaks. Cloudflare Web Analytics (free) is the drop-in if wanted. | external config (accept loss) |
| S9 | **Deployment Protection (Vercel Authentication) is on for `neil-branding` and `itin-wizard`** (`all_except_custom_domains`): preview URLs require a Vercel login. `vechelon` previews are public. | Cloudflare previews on `*.workers.dev` are public unless fronted by Cloudflare Access. Decide whether previews need gating. | decision |
| S10 | **The `redesign` branch of neil-branding still carries the old `vercel.json`** alongside its new `wrangler.jsonc`. | Harmless until Phase 5 clean-up, but it must be deleted deliberately, not forgotten. | port (cleanup) |
| S11 | **`VITE_JOIN_BASE_URL` is read by the web app but is not set in any Vercel environment.** The code falls back to deriving the base from the current host. | No action; recorded so Phase 3 does not "fix" it. | none |

---

## 1. Domains

### 1.1 Authoritative DNS (verified_by: `curl https://dns.google/resolve?name=<d>&type=NS` and `https://cloudflare-dns.com/dns-query?name=<d>&type=NS`)

| Domain | Registrar | Authoritative NS today | On Vercel nameservers? | Vercel-side zone |
|---|---|---|---|---|
| productdelivered.ca | Porkbun | curitiba / fortaleza / maceio / salvador `.ns.porkbun.com` | **No** | Vercel holds an inactive zone (`zone: true`) containing only 5 system records (ALIAS @ and *, 3 CAA) — nothing user-authored. Verified_by: `GET /v4/domains/productdelivered.ca/records`. |
| vechelon.ca | Porkbun | same four | **No** | No Vercel zone (`zone: false`). |

**Conclusion:** neither domain has a Vercel DNS dependency. The record set to recreate lives entirely in Porkbun's panel.

### 1.2 Record set as observed from outside (verified_by: DoH probes of 36 candidate names, `A/AAAA/CNAME/MX/TXT/CAA`, 2026-09-22)

A zone cannot be enumerated from outside. The table below is what public resolvers return for every name we know about. **The authoritative Porkbun export is still required** (see §6) and will be diffed against this table.

**productdelivered.ca**

| Name | Type | Value | TTL | Points at | Note |
|---|---|---|---|---|---|
| @ | A | 216.198.79.1 | 600 | Vercel | Vercel answers 307 → www. Not attached to a project. |
| @ | MX | 1 smtp.google.com | 3600 | Google Workspace | **Email — preserve exactly.** |
| @ | TXT | `google-site-verification=…` | 600 | Google | Preserve. |
| www | CNAME | `32741a363a8128ad.vercel-dns-017.com` | 600 | Vercel (neil-branding) | Cutover record. |
| vechelon | CNAME | `cname.vercel-dns.com` | 600 | Vercel (vechelon) | Cutover record. |
| itin-wizard | CNAME | `cname.vercel-dns.com` | 600 | Vercel (itin-wizard) | Cutover record. |
| blog | — | **NXDOMAIN** | — | — | See S1. |
| _dmarc, @ SPF, any DKIM | — | **absent** | — | — | See S7. |

**vechelon.ca**

| Name | Type | Value | TTL | Points at | Note |
|---|---|---|---|---|---|
| @ | ALIAS / flattened CNAME → `cname.vercel-dns.com` (observed as A answers that rotate every query: 66.33.60.x / 76.76.21.x, TTL 60–300, tracking `cname.vercel-dns.com`'s own A set) | — | Vercel (vechelon) | Vercel answers 308 → vechelon.productdelivered.ca (project domain redirect). **Record type to be confirmed by the Porkbun export; do not recreate the snapshot IPs as static A records.** Verified_by: three consecutive `dns.google` A queries + `cname.vercel-dns.com` A. |
| admin | CNAME | `cname.vercel-dns.com` | 600 | Vercel (vechelon) | Cutover record. |
| racer-sportif | CNAME | `cname.vercel-dns.com` | 600 | Vercel (vechelon) | Cutover record (club). |
| bikes-and-beers | CNAME | `cname.vercel-dns.com` | 600 | Vercel (vechelon) | Cutover record (club). |
| lakeside-wheelers | CNAME | `cname.vercel-dns.com` | 3600 | Vercel (vechelon) | Cutover record (club). Note the longer TTL — lower it in Phase 2. |
| send | MX | 10 feedback-smtp.us-east-1.amazonses.com | 600 | Resend/SES | **Email — preserve exactly.** |
| send | TXT | `v=spf1 include:amazonses.com ~all` | 600 | Resend/SES | **Email — preserve exactly.** |
| resend._domainkey | TXT | `p=MIGfMA0G…` (DKIM public key) | 600 | Resend | **Email — preserve exactly.** Cloudflare's import scan is known to miss this and `send`. |
| _dmarc | TXT | `v=DMARC1; p=none;` | 600 | — | Preserve. |
| www, rail3-staging, staging, api, mail, app, portal, `*` | — | **absent** | | | No wildcard (S5). |

CAA answers seen on the CNAME'd names are the CNAME target's (Vercel's) records, not zone records; the bare apexes carry no CAA. No AAAA anywhere.

### 1.3 What each hostname serves today (verified_by: `curl -sI https://<host>/`)

| Host | Result | Served by |
|---|---|---|
| productdelivered.ca | 307 → https://www.productdelivered.ca/ | Vercel |
| www.productdelivered.ca | 200 text/html | Vercel · neil-branding |
| vechelon.productdelivered.ca | 200 text/html (landing.html via host rewrite) | Vercel · vechelon |
| itin-wizard.productdelivered.ca | 200 text/html | Vercel · itin-wizard |
| blog.productdelivered.ca | no DNS | — |
| vechelon.ca | 308 → https://vechelon.productdelivered.ca/ | Vercel |
| www.vechelon.ca | no DNS | — |
| admin.vechelon.ca | 200 text/html | Vercel · vechelon |
| racer-sportif.vechelon.ca, bikes-and-beers.vechelon.ca, lakeside-wheelers.vechelon.ca | 200 text/html (portal via slug host rewrite) | Vercel · vechelon |
| any unknown slug.vechelon.ca | no DNS | — |
| vechelon.productdelivered.ca/.well-known/assetlinks.json | **404** | Vercel (nothing exists; path is servable once a file is added) |
| vechelon.productdelivered.ca/portal/rides (deep link) | 200 text/html | Vercel SPA rewrite |

---

## 2. Vercel projects (team `neilstryjski-gits-projects`, `team_2wOt0nCFjC0ESTYD5IIzQIw3`)

Verified_by: `vercel project ls`, `vercel project inspect <name>`, `GET /v9/projects`, `GET /v9/projects/:id/env`, `GET /v9/projects/:id/domains`, `GET /v6/deployments`, `GET /v4/aliases`, plus repo reads.

### 2.1 `vechelon` — Admin Portal + Rider Portal (one build serves both)

| Item | Value |
|---|---|
| Repo / branch | `github.com/neilstryjski-git/vechelon` (public) · production branch `master` · Vercel GitHub integration, no deploy hooks |
| Framework / node | Preset "Other" · Node 24.x · Vite 7 + React 19 in `admin/`, `base: '/portal/'` |
| Build (from `vercel.json`) | `npm run build` → `dist_production/` (root script builds `admin/`, copies to `dist_production/portal/`, plus `landing.html`, `prototype.html`, `roadmap.html`, `echelon-logo-v10.html`, `privacy.html`, logos) |
| Custom domains | `vechelon.productdelivered.ca`, `admin.vechelon.ca`, `racer-sportif.vechelon.ca`, `bikes-and-beers.vechelon.ca`, `lakeside-wheelers.vechelon.ca`, `vechelon.ca` (**308 redirect → vechelon.productdelivered.ca**), `vechelon.vercel.app` |
| Notable aliases | `vechelon-rail3-staging.vercel.app` (S2) + ~30 `vechelon-git-<branch>-…vercel.app` preview aliases |
| Env vars (name · environments) | `VITE_SUPABASE_URL` · prod/preview/dev · `VITE_SUPABASE_ANON_KEY` · prod/preview/dev · `VITE_GOOGLE_MAPS_API_KEY` · prod/preview/dev. (`VITE_JOIN_BASE_URL` used in code, unset — S11.) |
| Functions / API / middleware | **None.** No `api/`, no `middleware.*`, no `_redirects`/`_headers`, no `.well-known`. |
| Crons | None (`crons.definitions: []`). |
| Rewrites (`vercel.json`) | `/portal/:path*` → `/portal/index.html` (SPA) · `/` on host `vechelon.productdelivered.ca` → `/landing.html` · `/(.*)` on host `(?<slug>[a-z0-9-]+).vechelon.ca` → `/portal/index.html` · `/prototype` → `/prototype.html` · `/roadmap` → `/roadmap.html` · `/privacy` → `/privacy.html` (on `master` since 4d86c88, 2026-06-23; absent from the `rail3-integration` copy — verified_by: `git diff rail3-integration W294 -- vercel.json`). Source of truth for this table is `git show master:vercel.json`. |
| Redirects (`vercel.json`) | `/admin/` → `/portal/` (301) · `/admin/:path*` → `/portal/:path*` (301) · `/ride/:path*` on host `vechelon.productdelivered.ca` → `/portal/ride/:path*` (307) |
| Headers | None. |
| All rewrite/redirect targets exist in `dist_production/` | Yes — no dead rules (verified_by: file-exists loop). |
| Vercel-specific features | Web Analytics + Speed Insights enabled at dashboard level, **no SDK in code** (S8). Preview deployments per branch are used as a workflow (staging Race Control recipe: `vercel deploy --build-env …` + alias). Deployment Protection: off. Fluid compute / iad1 defaults, unused (no functions). |
| Latest production deploy | commit `ae139a5` on `master`, READY, 77 days old |
| CI | `.github/workflows/web-build.yml` (build guard) and `rail3-ci.yml` — neither deploys to Vercel. `rail3-ci.yml` has a *comment* saying the web app ships via Vercel. |
| Hostname logic in code (unchanged hostnames → no change, listed so Phase 3 knows) | `admin/src/lib/extractSlug.ts` (legacy-host map `vechelon.productdelivered.ca` → `racer-sportif`, `.vechelon.ca` suffix), `admin/src/lib/portalBase.ts`, `admin/src/components/RideFormModal.tsx:60-61`, `admin/src/App.tsx:169-176` (`isAdminHost`), duplicate `supabase/functions/_shared/extractSlug.ts`. |

### 2.2 `neil-branding` — productdelivered.ca marketing site

| Item | Value |
|---|---|
| Repo / branch | `github.com/neilstryjski-git/neil-branding` (private) · production branch `master` · not linked locally (`.vercel/` absent in `~/neil_branding`) |
| Framework / node | "Other" · Node 24.x · plain static HTML/CSS/JS, **no package.json** on master |
| Build | none (static) · output = repo root |
| Custom domains | `www.productdelivered.ca`, `neil-branding.vercel.app`. The bare apex is **not attached** (S4). |
| Env vars | none |
| Functions / crons / headers | none |
| Rewrites (`vercel.json`) | `/ptap` → `/ptap.html` · `/jack-hanger` → `/jack-hanger.html` |
| Vercel-specific features | Web Analytics + Speed Insights (dashboard, no SDK). **Deployment Protection ON** (`all_except_custom_domains`, S9). |
| Latest production deploy | commit `24408d6` ("Jack Hanger page"), READY (age not parseable from CLI; ~4 months by timestamp) |
| In-flight rebuild | `~/neil_branding-redesign` worktree, branch `redesign`: Astro 5 static, `site: https://www.productdelivered.ca`, `wrangler.jsonc` for Workers static assets already present; stale `vercel.json` still tracked (S10). Preview alias `neil-branding-git-redesign-…vercel.app` exists. |

### 2.3 `itin-wizard`

| Item | Value |
|---|---|
| Repo / branch | `github.com/neilstryjski-git/itin-wizard` (public) · production branch **`main`** · not linked locally |
| Framework / node | "Vite" (auto-detected) · Node 24.x · Vite + React 18 + shadcn (Lovable scaffold) |
| Build | Vercel Vite defaults (`vite build` → `dist/`) |
| Custom domains | `itin-wizard.productdelivered.ca`, `itin-wizard.vercel.app` |
| Env vars (name · environments) | `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_SUPABASE_PROJECT_ID` · each prod/preview/dev (a different Supabase project from Vechelon's) |
| Functions / crons / headers | none |
| Rewrites (`vercel.json`) | `/itin-wizard/(.*)` → `/index.html` |
| Vercel-specific features | Web Analytics + Speed Insights (dashboard, no SDK). **Deployment Protection ON** (S9). |
| Latest production deploy | commit `122f740` on `main`, READY (redeploy), ~5 months |

### 2.4 Account-level (verified_by: Vercel REST `GET /v5/domains`, `/v1/webhooks`, `/v5/user/tokens`, `/v1/edge-config`, `/v2/integrations/log-drains`; `gh api repos/…/hooks`)

- Team domains: `vechelon.ca`, `productdelivered.ca` (both "external", Porkbun NS; Vercel's intended NS for productdelivered.ca is `ns1/ns2.vercel-dns.com` — never adopted).
- Webhooks: none. API tokens: none listed. Edge Configs: none. Log drains: none. Deploy hooks: none.
- GitHub: no repo webhooks on any of the three repos (the Vercel GitHub **App** installation is inferred from the `githubDeployment` metadata on every prod deploy; `gh api user/installations` returned 403, so confirm in GitHub → Settings → Applications during Phase 5).
- Integrations endpoint returned 400 — check the Vercel dashboard Integrations tab in Phase 5.

---

## 3. External services that reference a hosted URL

| Service | Reference | Hostname changes? | Action |
|---|---|---|---|
| Supabase Auth — **prod** `drktcxggaizkbvqccfhp` (verified_by: `GET /v1/projects/:ref/config/auth`) | `site_url = https://racer-sportif.vechelon.ca/auth`; `uri_allow_list = https://*.vechelon.ca/**, https://vechelon.productdelivered.ca/portal/**, http://localhost:5173/**` | No | Phase 3: **add** the Cloudflare preview hostname(s) so UAT can sign in. Nothing removed. |
| Supabase Auth — **staging** `xybgtbybdhxuwqjfcfkc` | `site_url = https://vechelon-rail3-staging.vercel.app`; `uri_allow_list = rail3://auth, https://vechelon-rail3-staging.vercel.app/**`; SMTP = smtp.resend.com, sender "Rail 3 TEST" | **Yes (S2)** | Phase 3: point both at the new staging hostname. |
| Supabase Edge Function secrets — prod (verified_by: `npx supabase secrets list`, names only) | `PORTAL_URL` set (three functions fall back to the literal `https://vechelon.productdelivered.ca/portal` if unset); `RESEND_API_KEY` | No | None. Hostname is unchanged. |
| Edge functions hard-coding hostnames | `mint-completion-link`, `_shared/member-provision.ts`, `_shared/resend.ts` (From `notifications@vechelon.ca`), `_shared/extractSlug.ts`, `notify-crew-added` (`https://${slug}.vechelon.ca/…`, no override), `complete-profile-submit`, `guest-view-ride` | No | None. Out of scope by the brief (Supabase untouched). |
| Resend | Sending domain `vechelon.ca` (DKIM `resend._domainkey`, `send.vechelon.ca` SPF/MX). No Resend records on `productdelivered.ca` or `vechelon.productdelivered.ca`. | No | Phase 2: records recreated exactly; verify `dkim=pass` after NS change. |
| Google Workspace | `productdelivered.ca` MX + site-verification TXT | No | Phase 2: recreate exactly. S7 addition needs a decision. |
| Google Maps Platform key (`VITE_GOOGLE_MAPS_API_KEY`, Static Maps API in `admin/src/lib/maps.ts`) | HTTP-referrer restrictions live in the Google Cloud console — **not readable from here** | No for prod hosts | **Neil to paste the current referrer list.** Phase 3 adds the preview hostname(s). Expected today: `*.vechelon.ca`, `vechelon.productdelivered.ca`, `admin.vechelon.ca`. |
| Google Play listing | privacy-policy URL = `https://vechelon.productdelivered.ca/privacy` (mobile `src/lib/env.ts` on `rail3-integration`; `privacy.html` is in `dist_production/`) | No | None, but the path must keep serving 200 on Cloudflare — today that 200 depends on the `/privacy` → `/privacy.html` rewrite (§2.1), which is in the Port column (§4), not only on `privacy.html` existing. The 2026-08-30 note "hold vechelon.productdelivered.ca on Vercel until Play verification settles" — **Neil to confirm whether that hold still applies**; if so, Phase 4 carves that one record out until it clears. |
| Mobile app (Rail 3) | Talks to Supabase directly; only web URL is the privacy link above. `assetlinks.json` (App Links) will be needed at `https://vechelon.productdelivered.ca/.well-known/assetlinks.json` — 404 today, no file exists. | No | Phase 3: make the path servable (direct 200, `application/json`, no redirect). |
| Tenant records (`tenants.logo_url`, prod) | `racer-sportif` and `bikes-and-beers` use relative `/portal/<name>-logo.png` (served by the web build); `lakeside-wheelers` uses Supabase Storage | No | None. Same-origin relative paths keep working on Cloudflare. |
| Hashnode | `blog.productdelivered.ca` — no record exists (S1) | — | Decision. |

---

## 4. Classification

**Redeploy as-is** (static output, no Vercel runtime dependency)

| Item | Note |
|---|---|
| `vechelon` build output (`dist_production/`, 26 files) | Zero functions. |
| `neil-branding` static site (master) / Astro `redesign` build | The redesign already targets Workers static assets. |
| `itin-wizard` Vite build | One SPA rewrite only. |
| All DNS records not pointing at Vercel (MX, SPF, DKIM, DMARC, site-verification) | Recreate verbatim in Phase 2. |
| Supabase (everything) | Untouched by the brief. |

**Port** (depends on Vercel's runtime; needs an equivalent on Cloudflare)

| Item | Cloudflare equivalent (Phase 3 decides the detail) |
|---|---|
| `vercel.json` host-conditioned rewrites: slug host → `/portal/index.html`; `vechelon.productdelivered.ca/` → `/landing.html` | Worker host router in front of static assets (Cloudflare `_redirects` cannot match hostnames). |
| `vercel.json` path rules: `/portal/*` SPA fallback, `/admin/*` → `/portal/*` 301, `/ride/*` → `/portal/ride/*` 307 (host-scoped), `/prototype`, `/roadmap`, `/privacy` (Play privacy URL) | `_redirects` for path-only rules; Worker for the host-scoped `/ride` rule. |
| The nine Vercel-pointing cutover records: `www`, `vechelon`, `itin-wizard` CNAMEs and the apex A under `productdelivered.ca`; `admin` CNAME and the flattened apex under `vechelon.ca`; plus the club CNAMEs below | Phase 2 recreates them grey-cloud pointing at Vercel; Phase 4 re-points each to its Worker custom domain (hostnames unchanged). |
| `neil-branding` rewrites `/ptap`, `/jack-hanger` | `_redirects` (or Astro routes on the redesign). |
| `itin-wizard` rewrite `/itin-wizard/(.*)` → `/index.html` | `_redirects` or assets `not_found_handling: single-page-application`. |
| Apex redirect `productdelivered.ca` → `www` (307) | Cloudflare Redirect Rule (needs a proxied placeholder record on the apex). |
| Apex redirect `vechelon.ca` → `vechelon.productdelivered.ca` (308) | Cloudflare Redirect Rule. |
| Per-club subdomains (4 Vercel domain entries + 4 Porkbun CNAMEs) | Wildcard `*.vechelon.ca` CNAME + Worker route (recommended, S5), or 1:1 records. |
| Staging Race Control alias `vechelon-rail3-staging.vercel.app` (+ `vercel deploy --build-env` recipe) | Second Worker / environment on `rail3-staging.vechelon.ca`; staging Supabase auth updated. |
| Git-push deploys (master → prod, branch → preview) via the Vercel GitHub App | Cloudflare Workers Builds GitHub integration (prod branch + preview branches). |
| Deployment Protection on `neil-branding` / `itin-wizard` previews | Cloudflare Access on the preview hostnames, or accept public previews (S9). |
| `.well-known/assetlinks.json` (does not exist yet) | Add to `dist_production/.well-known/` in the build; verify direct 200 JSON. |
| Stale `vercel.json` on neil-branding `redesign` | Delete (S10). |

**Remove rather than port (dead or replaceable)**

| Item | Reason |
|---|---|
| Vercel Web Analytics / Speed Insights on all three projects | No code dependency; dashboard-only data. Optional replacement: Cloudflare Web Analytics. |
| ~30 stale `vechelon-git-<branch>` preview aliases, `*.vercel.app` project domains | Go with the projects in Phase 5. |
| Fluid compute / function region settings | No functions exist. |

**External config** (lives in a third party; must be updated)

| Item | When |
|---|---|
| Supabase prod `uri_allow_list` — add preview host(s) | Phase 3 |
| Supabase staging `site_url` + `uri_allow_list` — new staging host | Phase 3 |
| Google Maps key referrers — add preview host(s) (list pending from Neil) | Phase 3 |
| Porkbun nameservers → Cloudflare | Phase 2 (Neil's registrar login) |
| GitHub: Vercel App installation removal; Cloudflare Workers Builds app installation | Phase 5 / Phase 3 |
| Play listing privacy URL | unchanged; verify 200 after Phase 4 |

---

## 5. Cloudflare account and product (for Phase 3, recorded here so the choice is visible at approval)

Standing decision (2026-08-29): **Workers with static assets, Free plan**, one Worker per site. Reasons: unlimited static bandwidth, no commercial-use restriction, wildcard hostnames via Worker routes (Pages has no wildcard custom domains), and the `neil-branding` redesign is already built for it. No Cloudflare account details were needed or touched in Phase 1.

---

## 6. Open items that block Phase 2 (all need Neil)

1. **Approve this inventory** (the brief's gate).
2. **Porkbun zone export for both domains** — the record tables in §1.2 are from outside probes and cannot prove completeness. Either enable Porkbun API access on both domains and share the key pair privately, or export the record lists from the Porkbun panel into Drive `rail3/`.
3. **Decisions:** S1 (blog: recreate with a Hashnode target, or drop), S7 (add Google SPF/DKIM/DMARC to productdelivered.ca at Cloudflare, or keep "exactly as today"), S9 (gate previews with Cloudflare Access, or public), S5 (wildcard `*.vechelon.ca`, or 1:1 club records).
4. **Google Maps key referrer list** (paste or screenshot) — needed in Phase 3, not Phase 2.
5. **Play-verification hold** on `vechelon.productdelivered.ca` — still in force or cleared?
6. **Cloudflare account** — which account owns the zones (Product Delivered Inc.), and whether Neil creates it or I do under his login.
