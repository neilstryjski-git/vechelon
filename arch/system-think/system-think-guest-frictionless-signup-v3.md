# System Think: Guest (Tier 1 → Initiated/Affiliated) — Frictionless Sign Up v3 (G20)
**Version:** v1
**Date:** 2026-05-05
**Project:** Vechelon (VEcheLOn)
**Snapshot version used:** 2 (2026-05-05)
**Supersedes:** n/a

---

## Flow Summary

A guest lands on a specific ride URL (`{slug}.vechelon.ca/ride/<id>`), sees ride details (route, meetup, time), and RSVPs by entering email only — no account, no name. The backend records the RSVP, fires a magic link in parallel, and shows the rider a "ride card" success state plus magic-link confirmation. On magic-link click the rider is authenticated, promoted from guest → initiated/affiliated (per the club's enrollment_mode), and prompted for a name if their profile has none. Authenticated tier-2 (Initiated) users on the same URL also get an RSVP path — the previous "Affiliation Pending" block is removed.

**Assumptions made:**
- "What's been built" = production state on `master` as of commit `8eaf257` (today). The earlier mocks at `productdocuments/frictionless_sign_up_action_plan_v3.md` are aspirational and may not match shipping code.
- Open vs manual enrollment policy still applies: manual-mode clubs reject anonymous guest RSVPs at the `guest-rsvp` Edge Function (current behavior).
- "Existing profile" in the action plan v3 refers to a row in `accounts` keyed by email — not by `auth.users.id`.

---

## Architecture Findings

### Conflicts

#### C1 — `ensure_account_exists()` resolves tenant via `LIMIT 1` — multi-tenant unsafe (HIGH)
**Where:** `supabase/migrations/20260425000000_fix_ensure_account_claim.sql:24`
```sql
SELECT id, enrollment_mode INTO v_tenant_id, v_enroll_mode FROM public.tenants LIMIT 1;
```
A B&B rider clicks a magic link → AuthPage calls `ensure_account_exists` → an `account_tenants` row is created at **whichever tenant is row-1 in `tenants`** (almost certainly Racer Sportif), not at B&B. The rider's tier detection then finds no record at B&B and they're stuck as `guest`. This already affects sign-in across tenants today; G20 amplifies it because frictionless RSVP becomes the primary onboarding surface.

This is the same issue the snapshot already flags ("Snapshot Note 7"). It is not a G20-specific bug, but G20 cannot ship cleanly until it is fixed.

#### C2 — Two parallel magic-link paths, only one is anti-scanner-safe (HIGH)
**Where:** `admin/src/pages/rider/RideLanding.tsx:316–319` vs `supabase/functions/send-magic-link/index.ts`

- **RideLanding** (frictionless-RSVP path) calls `supabase.auth.signInWithOtp({ emailRedirectTo: window.location.href })` — uses Supabase's **default** transactional email template, not the branded EF, and not the click-through wrapper that defeats Gmail/Outlook SafeLinks pre-fetch.
- **AuthPage** (deliberate sign-in path) invokes `send-magic-link` Edge Function which wraps the OTP behind `${origin}${pathname}?c=<base64>` so scanners can't consume the one-time token.

D32 (closed) was the email-scanner-pre-fetches-OTP defect. The frictionless path re-introduces it. Every guest who RSVPs on Gmail will have their magic link consumed by Google's link checker before they can click it.

#### C3 — `send-magic-link` click-through lands on `pathname`, but only AuthPage handles `?c=` (HIGH)
**Where:** `supabase/functions/send-magic-link/index.ts:64`, `admin/src/pages/rider/AuthPage.tsx:44–55`

If the action plan's W104 routes through `send-magic-link` with `redirectTo = /ride/<id>`, the click-through URL becomes `/ride/<id>?c=<base64>`. RideLanding has **no handler for `?c=`** — only AuthPage decodes and forwards. Either:
- RideLanding adds the same click-through forwarder, or
- The click-through always lands on `/auth?c=<...>&redirectTo=/ride/<id>` (the existing pattern when navigating to AuthPage from elsewhere — see `RideLanding.tsx:735, 757`).

The action plan v3 mermaid diagram is silent on this — it shows a single "Verify Token & Set Session Cookie" step.

#### C4 — W104 as scoped contradicts the existing safe pattern (HIGH)
**Where:** Stride W104 (in_progress) acceptance criterion: *"New email creates a placeholder profile with account_status = initiated"*

This contradicts shipping architecture in two ways:
1. **Schema:** `accounts.id REFERENCES auth.users(id)` — a row in `accounts` requires a corresponding `auth.users` row first. Magic link is the auth-user creation mechanism. There is no FK-safe way to create a placeholder accounts row before the email is verified. (And `account_status` isn't a column — status lives on `account_tenants`.)
2. **Phishing/spam vector:** Creating an `account_tenants` row prior to email verification means anyone could pre-claim email addresses at any club. The existing `guest-rsvp` EF correctly avoids this — it inserts `ride_participants` with `account_id=NULL` keyed by `session_cookie_id`, and only `ensure_account_exists` (post-magic-link-click) creates the `accounts`/`account_tenants` rows.

W104 should be re-scoped: the backend already does the right thing for guest RSVPs. The only missing piece is firing the branded magic-link via the existing `send-magic-link` EF instead of `signInWithOtp`. No new "placeholder profile" backend EF needed.

#### C5 — D34 unresolved: authenticated user filling guest form (MEDIUM)
**Where:** `admin/src/store/useAppStore.ts:212–226` (the authenticated branch of `joinRide`)

Today, an authenticated user who fills out the guest RSVP form (entering someone else's name+email) creates a `ride_participants` row with `account_id=auth.uid()` and `display_name=<typed name>`. Discovered as D34 during 2026-04-28 testing — Sr PM "Georgie" attribution incident. The frictionless flow makes this worse because the form will be presented even more aggressively.

D34 needs a Sr PM-ratified policy (reject / convert to genuine guest row / prompt) before W104 / W105 ship.

#### C6 — Manual-enrollment clubs reject guest RSVPs entirely (MEDIUM)
**Where:** `supabase/functions/guest-rsvp/index.ts:80–85`

Today: `if (tenant.enrollment_mode === 'manual') return 403`. The action plan v3 envisions every guest on every ride URL getting the frictionless RSVP. For manual-mode clubs (likely B&B, future production clubs) this conflicts head-on. Either:
- Frictionless RSVP is open-mode-only (acceptable, but the action plan should say so), or
- Manual mode behavior changes (Pillar amendment territory).

#### C7 — W106 violates Rider Portal Pillar I §4 (Tier 2 cannot RSVP) — Bedrock change (HIGH)
**Where:** Rider Pillar I §4 Tier 2: *"What they cannot see: RSVP button"*. W106 acceptance criterion: *"Initiated-tier users see the RSVP Now or Join Ride button"*.

This is a doctrine change, not a feature enhancement. Per the Trio Protocol it requires Brain ratification (a MACD amendment) before The Hands implement. W106's task description acknowledges the conflict but doesn't reference the Pillar ratification gate. Sr PM is "The Brain" here — needs explicit ratification.

#### C8 — Cross-club email policy silent on self-onboarding (MEDIUM)
**Where:** VMT-D-33 (Pillar IV) governs **admin invites**: *"Cross-club email associations not permitted."* W104 wants to *"match existing profile by email"* on guest RSVP. If a rider with `accounts.email = X` at Racer Sportif arrives at `bikes-and-beers.vechelon.ca/ride/<id>` and RSVPs with email X, what happens?
- Match-and-attribute = silent cross-club association (violates VMT-D-33's spirit).
- Reject = surface "this email belongs to another club" (data-sovereignty conflict per VMT-D-33's error-message rule).
- Allow guest-row only, no account match = current behavior (`guest-rsvp` EF), works.

Brain decision needed before W104 can be scoped correctly.

#### C9 — D35 (sign-out unreachable mid-flow) compounds with G20 (MEDIUM)
G20 creates new mid-flow surfaces: post-RSVP success state, magic-link sent confirmation, name-prompt (W107). D35 is open. Each new surface is another place a user can get stuck without a sign-out affordance — recovery requires browser DevTools localStorage purge (Sr PM hit this on 2026-04-28). Fix D35 alongside G20, not after.

### Gaps

#### G1 — No name-prompt page exists (W107 is net-new)
After magic-link click, the rider needs to provide a name if their profile is missing one. This is an entirely new surface. Open design: dedicated route (`/auth/name`?), inline modal on first-portal-page, or replace the post-RSVP success state. Design dependency on W105's success state.

#### G2 — Supabase `uri_allow_list` coverage for ride URLs unknown
For `signInWithOtp({ emailRedirectTo: window.location.href })` to work, `racer-sportif.vechelon.ca/ride/<uuid>` must be allow-listed at Supabase Auth. Per snapshot the allow-list is `*.vechelon.ca, admin.vechelon.ca`. Whether Supabase wildcard treats path-bearing subdomain URLs as valid is an operational unknown — needs verification.

#### G3 — No idempotency guarantee on the magic-link send
Today RideLanding fires `signInWithOtp` fire-and-forget. If the rider RSVPs twice (refresh + resubmit, or D37's duplicate-RSVP-handled-as-no-op path), they'll get two magic links. Resend rate limits will eventually kick in. Acceptable for now; flag for monitoring.

### Integration Points

#### I1 — `guest-rsvp` Edge Function (existing, multi-tenant-safe)
Tenant resolution from Origin/Referer header, manual-mode rejection, RLS-tightened insert with `account_id=NULL` and `session_cookie_id`. **Keep as-is — wire G20 around it.**

#### I2 — `send-magic-link` Edge Function (existing, anti-scanner-safe)
Already tenant-aware (derives slug from `redirectTo` host). Already branded (uses tenant logo + primary color). Already wraps OTP in click-through. **Use this for the parallel magic-link fire, not `signInWithOtp` directly.**

#### I3 — `ensure_account_exists()` RPC (existing, partially safe)
Handles `auth.uid()`, session-cookie history conversion, and enrollment-mode-aware status. **Must be fixed for tenant resolution (C1) before the click-through path returns to AuthPage and triggers it under non-RS subdomain.**

#### I4 — IA events (existing)
`firePortalRsvp` fires on successful RSVP — keep. `portal_visit` fires on initial page load with `?source=` taxonomy — keep. The frictionless flow does not introduce new event types.

#### I5 — `useTierDetection` hook (existing)
Optimistically promotes authenticated users to `initiated` while `account_tenants` query in-flight. This dovetails well with the frictionless flow — the rider's UI should snap to the right tier as soon as the magic-link redirect lands.

### Open Decisions

- **OD1 — Cross-club email on guest RSVP** (C8): match / reject / guest-row-only? Brain decision.
- **OD2 — Authenticated user filling guest form** (C5 / D34): policy ratification.
- **OD3 — Tier 2 RSVP visibility** (C7 / W106): MACD amendment to Rider Pillar I §4? Or scope-restrict W106?
- **OD4 — Frictionless RSVP at manual-enrollment clubs** (C6): open-only, or expand?
- **OD5 — Name-prompt surface design** (G1): dedicated route, modal, or post-RSVP card overlay?
- **OD6 — Email-only form vs email+optional-name** (W105 spec): action plan says email-only; existing form has optional name. Removing the optional name field loses a natural capture point that Tier-3 conversion later can't reproduce silently.

---

## Milestone Plan

### Milestone 1 — Resolve foundational conflicts (do first)
**Goal:** Multi-tenant sign-in is correct and the magic-link path doesn't get eaten by email scanners.
**Depends on:** none — these block G20 and the broader multi-tenant correctness story.

#### Tasks
| ID | Task | Description | Type | Notes |
|----|------|-------------|------|-------|
| frs-01 | Fix `ensure_account_exists` tenant resolution | Replace `LIMIT 1` with a tenant lookup driven by an explicit param (the SPA passes `currentTenantId`) or by deriving slug from a passed-in URL/host. RPC signature changes to take `p_tenant_id UUID`. Migration + AuthPage callsite update. | Eng | C1. Touches every callsite of the RPC (3 in AuthPage). High-impact migration — supabase-patterns skill required. |
| frs-02 | Unify magic-link path through `send-magic-link` EF | Replace `supabase.auth.signInWithOtp` calls in RideLanding (and any other callsites) with `supabase.functions.invoke('send-magic-link', { email, redirectTo })`. Confirms anti-scanner click-through wrapping for every magic-link delivery. | Eng | C2. RideLanding line 316, 359. |
| frs-03 | Decide click-through landing strategy | Either: (a) extend RideLanding to handle `?c=` like AuthPage, or (b) always route click-through through `/auth?c=...&redirectTo=...`. (b) is less invasive. | Decision | C3. |
| frs-04 | Verify Supabase uri_allow_list covers ride URLs | Operational check on Supabase Auth dashboard. May require pattern update. | Research | G2. Cheap. |

### Milestone 2 — Resolve Pillar / policy conflicts (Brain ratifications)
**Goal:** No code is written that drifts from Bedrock or undocumented behavior.
**Depends on:** Sr PM availability — these are decisions, not code.

#### Tasks
| ID | Task | Description | Type | Notes |
|----|------|-------------|------|-------|
| frs-05 | Ratify cross-club email policy for guest RSVP | Brain decision: match / reject / guest-row-only when email exists at another club. Update VMT-D-33 to extend or constrain to admin invites only. | Decision | C8 / OD1. |
| frs-06 | Ratify D34 policy | Reject / convert to genuine guest / prompt clarification when authenticated user fills guest form. Memorialize as a Pillar IV ledger entry. | Decision | C5 / OD2. |
| frs-07 | Ratify or scope-restrict W106 | Either MACD amendment to Rider Pillar I §4 (Tier 2 may RSVP) or rescind W106 in favour of a different fix (e.g., redirect Tier 2 to a "your membership is pending" CTA on the ride URL). | Decision | C7 / OD3. |
| frs-08 | Ratify frictionless RSVP for manual-mode clubs | Open-mode only? Or change manual-mode behavior at the ride URL specifically? | Decision | C6 / OD4. |

### Milestone 3 — Re-scope W104 and ship the backend
**Goal:** The "atomic" guest-RSVP-with-magic-link works without creating accounts rows pre-verification.
**Depends on:** M1 (frs-02, frs-03 close out the magic-link plumbing). M2 OD1.

#### Tasks
| ID | Task | Description | Type | Notes |
|----|------|-------------|------|-------|
| frs-09 | Re-scope W104 in Stride | Replace "create placeholder profile" acceptance criteria with "guest-rsvp EF inserts ride_participants row + send-magic-link EF dispatches OTP — both invoked from the SPA in parallel." Drop the new EF idea. | Eng | C4. PATCH Stride task description + AC. |
| frs-10 | Wire RideLanding to call guest-rsvp + send-magic-link in parallel | The SPA fires both EFs after form submit. ride_participants is the source of truth for "RSVP'd"; magic-link delivery is a best-effort side-channel. Handle send-magic-link failure gracefully (toast: "RSVP confirmed, but we couldn't send your sign-in link — try resending"). | Eng | Replaces W104 implementation. |

### Milestone 4 — Frontend frictionless surface (W105 + W107 + D35)
**Goal:** The rider-facing flow matches the action plan v3 mermaid (once corrected).
**Depends on:** M1, M2, M3.

#### Tasks
| ID | Task | Description | Type | Notes |
|----|------|-------------|------|-------|
| frs-11 | Update RideLanding form to email-only with optional name (or email-only, per OD6) | Form simplification per W105. Submit disabled until valid email. After submit, render Ride Card success state + "Magic link sent to [email]" copy. | Eng | W105. Awaits OD6. |
| frs-12 | Implement post-verification name prompt | Net-new surface. Recommendation: simple `/auth/name` route, only reachable when authenticated and profile.full_name is null. After save, navigate to `redirectTo`. | Eng + Design | W107 / G1 / OD5. |
| frs-13 | Fix D35 — sign-out reachable from every authenticated rider page | UX audit. Add sign-out affordance to RideLanding (post-auth state), AuthPage (post-auth state), and the new name-prompt page. | Eng | D35. Compound risk multiplier with G20. |

### Milestone 5 — Tier 2 RSVP unblock (W106) — conditional on frs-07
**Goal:** If ratified, Initiated tier can RSVP at the ride URL and on RiderHome.
**Depends on:** frs-07 ratifying the Pillar change.

#### Tasks
| ID | Task | Description | Type | Notes |
|----|------|-------------|------|-------|
| frs-14 | Remove "Awaiting Activation" gate on RideLanding for Tier 2 | If ratified per frs-07. Change render branch + RLS verification. | Eng | W106. |
| frs-15 | Allow Tier 2 RSVP from RiderHome | Same render-branch fix. | Eng | W106. |

### Milestone 6 — Documentation + UAT
**Goal:** Action plan, mermaid, and BDDs reflect the resolved architecture.
**Depends on:** M1–M5 substantially complete.

#### Tasks
| ID | Task | Description | Type | Notes |
|----|------|-------------|------|-------|
| frs-16 | Update mermaid diagram in `frictionless_sign_up_action_plan_v3.md` | Reflect resolved magic-link path, name-prompt step, and tier-promotion conditions. | Design | W103. |
| frs-17 | Run UAT scenarios (W102) | Includes a B&B-as-second-tenant scenario to prove frs-01 fix works. | Eng + Sr PM | W102. Human-task. |

---

## Outstanding Questions for Human Review

1. **Cross-club email on guest RSVP (OD1)** — When email X exists at Club A and a guest RSVPs at Club B with email X: match silently, reject with opaque error, or always create a guest row keyed by session-cookie regardless of email match? My lean: **always guest-row; never match account by email at RSVP time.** Account-match happens only on magic-link verification, where Supabase already enforces email-as-identity.
2. **Tier 2 RSVP (OD3 / W106)** — Are you ratifying the Rider Pillar I §4 change? If not, W106 should be re-scoped to "Tier 2 sees a clear 'pending approval — RSVP unlocks once approved' card on ride URLs" rather than the actual RSVP button.
3. **D34 policy (OD2)** — When an authenticated rider fills the guest form: my lean is **reject** with a "you're already signed in — RSVP as yourself" toast. Anything else creates attribution chaos in the roster.
4. **Manual-mode frictionless (OD4)** — Open mode only, or extend? My lean: **open-only**. Manual mode requires admin approval — frictionless self-onboarding is conceptually incompatible.
5. **Form scope (OD6)** — Email-only or email + optional name? My lean: **email + optional name**. Capturing name at RSVP time means the roster reads correctly from second one; W107 becomes a fallback, not the primary capture surface.
6. **W104 re-scope (frs-09)** — Confirm OK to PATCH the in-progress task to drop the "placeholder profile EF" approach in favor of wiring existing EFs?
7. **frs-01 priority** — The `ensure_account_exists` tenant bug affects ALL multi-tenant sign-in today, not just G20. Should this be split into its own urgent goal/defect rather than nested under G20?
