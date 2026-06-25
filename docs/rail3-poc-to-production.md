# Rail 3 — PoC → Rail 3a Production: Brain-Input Dossier

**Status:** living handoff doc. **This is NOT a Pillar edit.** It is the single capture
point for lessons from the Rail 3 PoC (mobile tactical app + the W190/W192 web
"Race Control" fleet view) that feed the **Rail 3a production Brain session**, which
authors the production Pillar set. The PoC Pillars (`productdocuments/rail3/`) stay a
frozen, accurate record of what the PoC built — Pillar II §2 already states its NFRs
are "validation targets… PoC validates or revises them," so these lessons are *inputs*,
not retro-amendments.

**Governance call (Three Amigos, 2026-06-13):** nothing in this pile is a MACD
amendment to the PoC Pillars. Routing = defects (now) + ops checklist + Rail 3a Brain
inputs. The only item that *could* have been a Bedrock amendment — position-data
confidentiality — was **ratified by the Brain as render-only (NOT confidential at the
data layer), so no amendment is required.**

**How to read this (synthesis added 2026-06-24).** This document is the **technical
grounding for the Rail 3a Brain session that authors the production Pillar set.** The
**Pillar-authoring map** immediately below is the synthesis — *decided inputs* (constrain
the Pillars), *open decisions the Brain owns* (mapped to the Pillar each becomes), and
*build-sizing*. **§A–§K** are the dated evidence behind every line of that map. The map is
the entry point; the sections are the depth. Nothing here edits a PoC Pillar.

---

## Ratified decisions

- **Production transport — two-channel role-scoped Broadcast is REQUIRED (Brain, 2026-06-13).**
  Riders subscribe to a **command-only sub-channel** carrying just Captain/SAG positions;
  Captain/SAG subscribe to the **full** ride channel; riders still *publish* their own position
  to the full channel. **Primary driver: scaling** — it bounds the O(N²) fan-out (see A).
  **Secondary benefit: confidentiality** — because riders no longer *receive* peer positions,
  the design also delivers position confidentiality at the data layer (a welcome byproduct,
  not the requirement).
- **Position confidentiality is not a hard requirement (Brain, 2026-06-13).** Render-only is
  acceptable, so the two-channel design stays an **LLD/architecture decision, not a Pillar
  amendment.** (If the Rail 3a Pillars later choose to *promise* data-layer position
  confidentiality as an invariant, that's new production-Pillar authoring — still not a PoC
  amendment.)
- **No amendments to the PoC Pillars.** They correctly describe the PoC as-built.

---

## Pillar-authoring map — the synthesis

*Read this as the map; §A–§K below are the evidence. This is input to authoring the **production** Pillar set, not an edit to the PoC Pillars.*

### 1. Decided inputs — constrain the Pillars; do not relitigate
- **Transport:** two-channel role-scoped Broadcast is the production design — scaling-driven, confidentiality a byproduct; position confidentiality is **render-only**, not a data-layer invariant (unless the prod Pillars choose to promise it). *(§A, W193, Ratified decisions.)*
- **Background-GPS engine:** **Transistorsoft** `react-native-background-geolocation`, validated; license binds to the production bundle id — decide that id before purchase. *(§H, W204.)*
- **Multi-tenancy of the data layer is DONE (small case A3, not C2):** `beacon_alerts` / `rider_states` already carry `tenant_id` + tenant RLS; pings are ephemeral; the per-ride channel is already tenant-gated (W170). *(§K.)*
- **Surface architecture (Fork B — RESOLVED):** **two disjoint surfaces** — web owns onboarding/auth/desktop/app-less; a **deliberately narrow native app** owns the in-saddle tactical/safety surface (Option C). Web is the auth front door; the email-keyed account is the only cross-surface link. **No WebView embedding, no auth bridge.** *(§J — supersedes the Option-1/2/3 + auth-bridge exploration in that section.)*
- **Captain tooling model:** roster = searchable source-of-truth; map = live subset; **three-state model** — **Live** / **Dark** (greyed at last-known) / **Untracked** (roster-only). *(§J.)*
- **iOS reality:** native is **Android-only** (SD-004) → every iPhone rider is web/roster-only, never on the live map or the safety net. Any safety claim must be **Android-scoped**. *(§J.)*

### 2. Open decisions the Brain owns — these become Pillar content
- **Pillar I — Charter:**
  - Fan-out cost vs the **$0 operating-cost target**, and a **target max fleet size**. *(§A.)*
  - **F-08 — Dark last-known retention vs the 4-hour Hard Purge** (Charter touch vs privacy-as-product D-03). *(§E, §J.)*
  - **THE governing call: is rider safety a *headline commitment* or a *quiet operational aid*?** Cascades into F-08, the abrupt-dark alarm, and Fork A persistence. *(§J.)*
- **Pillar II — Specs:**
  - **Fork A — is a completed ride a durable artifact or ephemeral?** Gates ride-history / GPX-export / post-ride review; "durable" is a **§2 amendment** (ephemerality is load-bearing). *(§J.)*
  - **Abrupt-dark-at-speed alarm** — net-new, faster than the 15-min Dark. *(§J.)*
  - **SAG marker shape + in-app SAG designation** — re-authors Feature 1 + the "SAG set before start, no mid-ride reassign" rule. *(§H: W213/W211/W214.)*
  - **Ride-selection at scale + multi-membership** — participation-scoped list; derive active tenant from the *selected ride* (app-layer **resolution**, distinct from the done data-layer scoping). *(§H, W210.)*
  - **Breadcrumb full-history for late joiners** — broadcast-only options, no §2 break. *(§H.)*
  - **Onboarding paths + the field-set / membership-gating model** — mandatory name/email/phone, optional emergency; affiliation = details + (club-optional) approval. *(§J — Product-Trio-pending.)*
  - **Web spectator mode** — viewer role derived from `ride_participants`; hard-blocked by the §C server-side gate. *(§E.)*
- **Pillar III — Quality Gate:**
  - **Innovation Accounting** — value/growth experiments (V1–V4, G1–G3) + pivot-or-persevere thresholds, with **E1–E8** as NFR enablers. *(§I.)*
  - **Data-layer role-gate regression assertions** (the 3623 class). *(QA structural lesson, §C.)*
  - Production telemetry home + privacy/retention posture. *(§I.)*
- **Pillar IV — Ledger:** record the SDs resolved in §1 (engine, surface architecture, three-state model, data-layer tenant-scoping-done).

### 3. Build-sizing the Pillars should assume — Hands work, mostly not Pillar decisions
- **#1 critical — background GPS is NOT built** (§F): Android Foreground Service + Transistorsoft background task + per-OEM battery allow-listing. Must precede any real field test.
- **Wire the built-but-dead battery/FGS UX** (§G, W176/W177).
- **Server-side role gate + API regression** for the RP-16/phone over-read (§C, 3623) — prerequisite for web spectator mode *and* the safety roster.
- **D58 deep-link / environment-aware ride-join URL** (§H); identity hydration at join (§B); remove orphaned `expo-task-manager` (§H, W209).

---

## Lessons & routing

### A. Real-time fan-out is O(N²) — scaling/cost (Stride W193)
One shared Broadcast channel per ride (`rail3:ride:<id>`), tenant-gated at the realtime
layer (W170). §4.1 visibility is client-side, so **every subscriber receives every rider's
position ping**; role only hides them in render. Delivery ≈ O(N²) in fleet size.
- **Measured (W192 20-rider GPX load test):** 20 riders × ~600 ticks (1 ping/3 s, 30 min)
  ≈ **12,000 sends**; with all N phones watching, ≈ N× that in deliveries (~240k/30 min at 20).
- **Disposition: DECIDED (Brain) — the two-channel role-scoped design is the required
  production approach** (see Ratified decisions). LLD ticket (**W193**), not an amendment.
  Riders subscribe to a command-only sub-channel (Captain/SAG positions only); Captain/SAG keep
  the full channel; riders still publish their own position to the full channel. Drops rider-side
  fan-out from O(N²) to ~O(N) **and** removes peer-position receipt (confidentiality byproduct).
  Stays within Pillar II §2 transport (Broadcast, no DB write/ping). Build target: Rail 3a.
- **Charter touch (Rail 3a):** fan-out cost vs Pillar I §3 **$0 operating-cost target** + free-tier
  Realtime quota. Decide a target max fleet size.

### B. Mobile Ad Hoc/QR join leaves `ride_participants.email`/`display_name` NULL — DEFECT
Markers show "Rider" with blank contact until backfilled. Acceptance already exists
(R3-15 / R3-32). Fix = hydrate identity from `accounts` at join. → **Stride defect.**

### C. RP-16 over-read in `participant_tactical_select` (Stride defect 3623) — DEFECT (security)
Affiliated riders can read all participant rows incl. **phone**; the §4.1 contact gate is
client-side there. This is a **defect against R3-32 as written** — R3-32 traces to Pillar
Summary §1.3 "**API-level enforcement**," so the spec already requires server-side. Fix =
gate server-side + an **API-layer regression test**. **Not** an amendment. Live PII on shared
prod ⇒ recommend fix-now. **(Distinct from A — this is phone, not position.)**

### D. Ops / config — runbook + tickets (no Bedrock)
`VITE_RAIL3_FLEET_ENABLED` promotion gate · Google Maps key HTTP-referrer allow-list
(staging host needs adding) · PWA stale-cache (staging build self-destructs the SW;
prod keeps PWA) · Supabase Auth redirect allow-list (prod uses `*.vechelon.ca`) ·
free-tier Realtime quota watch · **"fit all riders" map control** — BUILT IN POC (web +
mobile, RC1/W201). Three Amigos 2026-06-14 reclassified it as **Bedrock-neutral, NOT a
Pillar amendment**: it only reframes the camera over markers §4.1 already makes visible
(role-gated `visible` set, never raw `fleet`), adding zero new data exposure — a sibling of
the Centre button (R3-12). Carried as a **built-in-PoC lesson** → in Rail 3a it becomes a
formal R3-xx acceptance criterion in the *production* Pillar authoring (net-new prod scope,
not a PoC amendment). PoC Pillars stay frozen/untouched.

**Profile edits must NOT be gated by ride status (Sr PM Neil 2026-06-14).** Staging carried a
`trg_sync_account_to_participants` trigger (on `accounts`) that pushed name/phone changes onto
live-ride `ride_participants` rows; it referenced a `ride_status` value (`completed`/`cancelled`)
that doesn't exist in the enum (`{created, active, saved}`), so **any profile edit for a user with
a live ride aborted** ("write could not be committed / ride is completed"). **Dropped on staging**
(trigger + function) — profile changes are now decoupled from ride state. **Prod is NOT affected**
(neither the trigger nor the function exists on `drktcxggaizkbvqccfhp`; verified 2026-06-14), and
there are no live rides in prod yet — so this is a **Rail 3 production-launch note, not a prod
incident.** For Rail 3a: identity reaches `ride_participants` at JOIN time only (the insert-time
hydration approach, ref Lesson B / W195); do NOT introduce an account→participant sync that makes a
profile save depend on ride status. A live profile edit need not reflect on an in-progress ride.

**Ride onboarding / sign-up route (Sr PM 2026-06-14).** D58 (ride-join QR → prod URL) is **NOT
required for the PoC** — testers are pre-onboarded and join **in-app via tap-to-join**, and the QR is
hidden in the field build. For **production**, the QR's real value is **onboarding people who don't
yet have the app / haven't signed up** (e.g. a rider at the start line who wants in). So Rail 3a needs
TWO distinct join paths:
- **(a) Tap-to-join in-app** — for signed-in app users (the PoC path, already working).
- **(b) QR → install/sign-up → deep-link into the specific ride** — for the app-less. Scanning routes
  a new user to app install / web sign-up; an existing signed-in app user goes straight in via deep
  link. The deep-link half is the deferred **D58** fix (`rail3://ride/<id>`); the new part is a public
  landing that detects app-installed-vs-not and routes accordingly, with **post-install deep-linking
  into the correct ride** (the hard bit — deferred-deep-link / install-referrer).

### E. Deferred Brain items — already routed to Rail 3a (do not pre-empt)
Hooked in the PoC Pillars via PENDING/PDoD markers; each resolution returns as an
amendment to the **future Rail 3a** Pillars, not the PoC set:
- **S0-009** guest/parking-lot join (Pillar II §1, PDoD-03, R3-33 note)
- **S0-010** beacon visibility to other riders (F-07 PENDING; would overturn §4.1 "beacon icon: Rider ✗")
- **S0-011** dark-state retention (F-08 PENDING; **Charter touch** vs Pillar I §3 4-hour Hard Purge)
- **Web spectator mode** (NET-NEW, not yet Pillar-hooked — Sr PM Neil 2026-06-14): let club
  members who can't attend watch a ride from home on web Race Control. Web today hardcodes the
  viewer as captain (`RaceControl.tsx` `OPERATOR_ROLE='captain'`); the vision derives the viewer's
  role from their `ride_participants` row so a non-command member sees **only Captain + SAG** (the
  ride "envelope"), exactly as §4.1 already specifies — **matrix-faithful, NOT an amendment**
  (web/mobile share `roleVisibility.ts`). **Original operator-only intent is intact; deferred to
  production promotion.** Two notes: (1) **hard-blocked by C** — broadening the audience from
  trusted operators to ordinary members turns today's client-side §4.1 gate into a real PII leak,
  so server-side enforcement is a prerequisite, not optional; (2) view-parity ≠ control-parity —
  ship viewer/visibility parity first, treat web captain *controls* as a separate call.

### F. Background GPS — NOT BUILT — ⚠ CRITICAL PoC GAP
Position publishing is **foreground-only** (`useFleetPositions`: `requestForegroundPermissionsAsync`
+ `watchPositionAsync`). **Verified absent** on master AND the held W172/W175 chain: no
`TaskManager`/`startLocationUpdatesAsync`/`ACCESS_BACKGROUND_LOCATION`/foreground service.
- **Why it matters:** the real field scenario is the phone in a jersey pocket, screen locked, app
  backgrounded, reviewed on demand. Foreground-only stops publishing the moment the app
  backgrounds — so **the PoC cannot validate its primary use case as built.** The repeated
  "marker stops moving" in testing is this gap.
- **Deferral history:** W172 did foreground first; W176 (FGS explainer) + W177 (battery prompts)
  built supporting UX; the **actual background-location task + OEM field validation** (W179/W180/W181,
  Stride 3546 "background GPS across OEMs") were never built. Note the sequencing inversion:
  validation tasks exist for a capability that was never implemented.
- **Build:** Android Foreground Service (persistent notification) + expo-location TaskManager
  background task + `ACCESS_BACKGROUND_LOCATION` + per-OEM battery-optimization allow-listing
  (Samsung/Xiaomi/etc.). iOS excluded (SD-004). **#1 production-critical capability — must be built
  and OEM-validated before any meaningful field test. Needs Brain prioritization.**

### G. Battery-saver advisory + FGS explainer — BUILT but UNWIRED (W176/W177 dead code) — DEFECT
`batteryGuards.ts` (W177: `isBatterySaverOn`/`promptIfBatterySaverOn`/`watchBatterySaverOnScreenLock`
via expo-battery) and `FirstRideExplainer.tsx` (W176) **exist but are called/mounted from nowhere** —
verified no caller on master, origin/W172, or origin/W175. The intended wiring ("mount on ride join —
lands on the W172 chain") was never completed even on the held chain.
- **Effect:** the app never warns when battery saver is on (observed by Brain 2026-06-13), and the
  FGS explainer never shows. Two "done" tasks (W176, W177) delivered unreachable code.
- **Fix:** wire `promptIfBatterySaverOn` on ride join + `watchBatterySaverOnScreenLock` + mount
  `FirstRideExplainer` in `RideMapScreen` (held chain) + a mobile build to verify. → defect.
- **Compounds F:** battery saver is *the* thing that kills Android background location — so the
  advisory is only half the safeguard; the background task (F) is the other half. Both are needed
  for a pocket-device field test.

---

## QA structural lesson (authorable now, no Brain cycle)
R3-10 / R3-17 / R3-31 / R3-32 are UI-observable black boxes that a **client-side-only gate
passes** — which is exactly how 3623 slipped through. Add **data-layer negative regression
assertions** for each role gate (assert the RPC/query does not return gated fields to a
Rider session), not just UI checks.

---

## What ships now vs feeds the Brain
*The full Brain-input planning view is the **Pillar-authoring map** at the top (it spans §A–§K). This is just the near-term execution split:*
- **Ship now (Hands, no Pillar touch):** §B identity-hydration + §C/3623 server-side gate & API regression (defects), the role-gate data-layer regression assertions, and the §D ops checklist. The critical pre-field-test build is background GPS (§F) + the §G wiring.
- **Everything else feeds the Brain** — see the map's §2 (open decisions, by Pillar).

## Later Brain inputs — §H–§K (added 2026-06-15 → 06-24)
*Dated evidence accumulated after the original A–G pass; every item is folded into the Pillar-authoring map at the top. References moved to the end of the document.*

### H. Production considerations — flagged during RC4 testing (2026-06-15)

**Background-GPS engine = Transistorsoft (DECIDED + validated 2026-06-15).** Stride W204.
Free `expo-location` cannot track with the screen off / app backgrounded (Android Doze; proven
on-device — 24-min dead gap). Transistorsoft `react-native-background-geolocation` streams
continuously through screen-on, locked, AND backgrounded-behind-another-app (validated two-device,
incl. RWGPS recording). Full record: `docs/rail3-transistorsoft-trial-test.md`.
- **Action for production:** purchase the **$399 Starter** license; **+$199/yr optional** for
  ongoing OEM/Android-version updates (effectively required — that ongoing OEM coverage is the whole
  value). Debug builds run the SDK free, unlicensed; only a **release** build needs the key.
- **Gotcha:** the key is **permanently bound to ONE bundle/package id.** PoC is `ca.vechelon.rail3`.
  **Decide the production package id BEFORE buying** so the key isn't stranded on the PoC id. One
  app + runtime branding (the Vechelon ThemeProvider model) = one key covers all clubs/tenants;
  per-club white-label apps would each need their own key (Venture tier).

**Ride-join URL / deep-link strategy needed for production.** Stride D58.
On staging, the ride-join QR points at prod `vechelon.ca` → "ride cannot be found" (wrong
environment). Production needs a deliberate strategy, not a hardcoded host:
- Environment-aware ride-join base URL (staging vs prod) so QR/links resolve to the right backend.
- Reliable hand-off from the web link into the mobile app (deep link / app-link), consistent with
  the D48 OTP/deep-link decisions — the join flow must land the user in-app on the correct ride.
- Define the canonical public ride-join URL shape and who owns the domain mapping.

**Remove the orphaned `expo-task-manager` dependency before release.** Stride W209. Unused since the W203 engine swap (no JS imports), but it autolinks a `BOOT_COMPLETED` receiver + background `TaskJobService` + `RECEIVE_BOOT_COMPLETED` — unwanted Play-review/footprint surface; kept through PoC field builds only to preserve a known-good dep set, so remove it in its own native-EAS-verified commit.

**Ride selection with multi-tenancy *and* at scale — the PoC list is the right foundation, but it's single-tenant-pinned and visibility-scoped (design discussion 2026-06-16).** Stride W210. This is two intertwined problems, not just one: **(a) multi-tenancy** — a multi-club user's rides span clubs, so the active tenant context (branding, §4.1 gating, broadcast auth) must be derived from the *selected ride*, not a build-time pin or a `LIMIT 1` guess; and **(b) scale** — many simultaneous active rides mean the user's own ride gets buried in a flat "all active" list. HomeScreen's "tap a ride from the list" pattern is correct and *should be kept*: ride selection has an in-app, contextual, plural-aware surface (a list + user pick), which is exactly what the launcher icon lacks — so multiple simultaneous active rides are handled by listing them, not by the app guessing. But the PoC simplification borrows against the real world on both axes, and the maturation path should be recorded so the simplification isn't mistaken for the finished design:
- **Visibility-scoped → participation-scoped.** Today the query is roughly *"all `active` rides I can see (RLS-scoped to club), newest first, limit 20"* — it shows every active club ride, not the ride(s) I'm on. At scale (a busy morning, several concurrent group rides) the ride I'm actually riding gets buried. Join `ride_participants` and surface **"rides I'm on"** as the primary set, with **"rides I could join in my club(s)"** as a secondary, discoverable tier.
- **Reframe the hard case.** "One person on multiple *simultaneous* rides" is data-possible but physically rare (a cyclist rides one at a time). The common hard case is the inverse: *many rides exist; surface **mine** instantly.* Design for "find my one ride fast among many," with graceful handling of the rare multi as the tail.
- **Smart default keeps PoC-feel.** Exactly one active ride I'm on → **deep-link straight in** (skip the list). More than one → show the list, **relevance-ranked** (rides I'm on, by nearest start; captain/SAG role bumping prominence).
- **Multi-membership → sections, which is the tenant-context fix in disguise.** For a multi-club user the list groups **by club**, and each section carries that club's tenant context (branding, §4.1 gating, broadcast auth). So "section the list by club" and the multi-membership rule **"derive the active tenant from the *selected ride*, never from a build-time pin (`EXPO_PUBLIC_TENANT_SLUG`) or a `LIMIT 1` membership guess"** are the same piece of work — and it depends on the `LIMIT 1` → `account_tenants` membership `EXISTS` change already flagged for broadcast (Stride W196 class; same fix needed on the ride-read path).
- **The link often bypasses the list.** A QR/deep-link arrival points at one specific ride, skipping selection — so the list is the *discovery/fallback* surface, not the only path, which lowers how hard it must scale.

**Network resilience on a degraded link — ENHANCEMENT CANDIDATE (if feasible), not a defect (2026-06-18).** No Stride ticket yet. An on-device login failed (an "edge error" reaching the auth edge function) while the phone was tethered to **another phone's cellular hotspot**; the same build/flow worked clean on home Wi-Fi. **Not a Vechelon bug** — a hotspot is a degenerate path (double-NAT + the host carrier proxying TLS), worse than anything the real field ride sees, so it isn't worth chasing as a defect. But it surfaces a real production-hardening question: should the app degrade gracefully on a flaky link instead of dead-ending on a one-shot request?
- **Reject app-level cellular-forcing (decision, do not relitigate).** The OS owns radio selection and defaults to Wi-Fi when both are up. Forcing cellular is possible on Android (`requestNetwork` `TRANSPORT_CELLULAR` + `bindProcessToNetwork`) but **barely supported on iOS**, burns the user's data deliberately, costs battery, and adds complexity — solving a rare case at the common case's expense. Also moot for the field: a pocketed ride is **already on cellular** (no Wi-Fi), and on a cleaner path than the failed hotspot.
- **The actual enhancement is network-agnostic resilience** (helps on hotspot, congested cellular, *and* weak Wi-Fi alike): **retry-with-backoff** on sends (login OTP and in-ride pings), **queue-and-forward** so a failed position fix is held and re-sent on recovery rather than dropped, and **honest error/recovery UI** instead of a terminal "edge error."
- **Same family as E6 (Network resilience) and the background-GPS retry concern** — a pocketed phone *will* hit tunnels/dead zones; the answer there is also retry/queue, not radio-picking. Fold into the Rail 3a resilience design; E6 is its validation hypothesis.

**SAG distinctive map marker — production "wholesome" version (2026-06-21). Stride W213 = PoC interim.**
The PoC ships an interim (W213): beef up the SAG role **badge** (glyph/size/contrast) without touching the
state-colored dot, so it stays inside committed Feature 1 ("icon by tactical state only"). The production
version the Rail3a Brain should author: a genuinely **distinct SAG marker SHAPE** (a van/vehicle pin) so the
support vehicle reads at a glance from the uniform rider dots — well-motivated (the SAG is *the help*; it's
vehicle-based; riders only ever see Captain + SAG on their map). Design rule: keep state and role
**orthogonal** — **shape = role, color = tactical state** — so the SAG marker still shows active/stopped/Dark
and the SOS-red override. This **re-authors Pillar II Feature 1's "Icon differentiation: by tactical state
only" rule (line 208)** — a deliberate committed-text change, hence Rail3a authoring, not a PoC amendment.
**Bundle with W211** (SAG navigate-to-rider) so the Brain re-authors all SAG visibility/affordance rules in
one pass. Invariants to preserve: W172 marker-bitmap render (no invisible markers), red = distress only,
own = OS blue dot.

**SAG (support) designation for ad-hoc rides — PoC has NO assignment path; field test must SEED it (2026-06-21).**
`ride_participants.role` is **per-ride**, so `support` is correctly a per-ride role (a SAG is a plain member on any
other ride — not an account/membership type). But the **only** way to set `role='support'` today is the web
**RideBuilder → "Add Crew"** modal (affiliated-member directory, gated to `status='created'` = pre-start scheduled
rides). The **ad-hoc PoC flow never touches it** — creator→captain, joiners→member/guest, no in-app "make SAG."
Staging proof: 32 captain + 15 member, **0 support ever**. So no SAG has existed in the PoC, and the SAG features
(W213 van marker, W211 Navigate) have nobody to render on until one is assigned.
- **PoC operationalization (field-test prep):** seed via Management API —
  `UPDATE ride_participants SET role='support' WHERE ride_id=… AND account_id=…` — **before** the SAG opens the ride
  map (`myRole` is read once at load in `useRideDetails`; set it late and they render with member powers).
- **Rail 3a product gap:** ad-hoc rides need an in-app **SAG-designation** path (captain taps a participant →
  "Make SAG"). This brushes the committed MVP rule *"SAG configured before ride start, cannot be reassigned
  mid-ride"* (Pillar II §4.x) — a Brain/Pillar decision, not a bolt-on.
- **PoC interim (Stride W214):** a **standing per-tenant SAG-email allowlist** + a BEFORE-INSERT trigger on
  `ride_participants` that stamps `support` on join (captain-by-creation wins; crew requires an email). **Test-rig
  ONLY — staging, strip at promotion (§5 Part-A).** Production reverts to **per-ride** SAG designation (above).

**Breadcrumb full-history for late joiners — post-PoC enhancement (2026-06-21).**
PoC behaviour (W212): the ride-leader trail is built from LIVE broadcasts the viewer receives, **no backfill** — so a
late joiner's line starts from THEIR join, not ride start (different viewers see different-length lines for the same
leader). **Confirmed fine for PoC.** Post-PoC, to render the leader's FULL trail for late joiners, keep it
**broadcast-only** so §2 ephemerality (no DB-per-ping) is preserved:
- **Recommended — catch-up broadcast (LOE ~1–2 days):** on a new joiner (presence/roster change), the newcomer
  requests — or the leader detects and sends — a one-shot `breadcrumb_snapshot` broadcast carrying the leader's
  decimated trail; the newcomer seeds its accumulator from it, dedups against live pings, then continues. Handle:
  leader offline/Dark → no catch-up (acceptable degradation); long-trail payload → cap (e.g. last N pts) or chunk;
  handshake/live overlap → dedup by point order. No schema, stays ephemeral.
- **Simpler — periodic full-trail rebroadcast (LOE ~1 day):** the leader re-sends its full decimated trail every N s;
  any subscriber self-heals within N s. No handshake, but re-sends to everyone (bandwidth).
- **Avoid — persist + backfill (LOE ~2–3 days):** writes leader positions to a table, reads on join — crosses §2 and
  loses the ephemeral property. Only if the trail must also survive a full app restart.

### I. Brain session — Rail 3 IA (Innovation Accounting)

**Ask (product owner, 2026-06-15):** run a dedicated Brain session on the Rail 3 app's **Innovation
Accounting** (Lean Startup sense): name the **leap-of-faith assumptions**, choose **actionable (not
vanity) metrics**, define the build–measure–learn **experiments** that validate them, and set
explicit **pivot-or-persevere thresholds**. Value/growth experiments come first — they prove the
product *matters*; the technical/NFR validations only prove it *works*. (The PoC sink + decision
records like `docs/rail3-transistorsoft-trial-test.md` are early validated-learning instances; this
session makes the accounting deliberate.)

**Leap-of-faith assumptions:**
- **Value hypothesis** — live fleet awareness materially helps a club run a ride (captains manage
  the group, fewer riders dropped/lost, riders feel safer) enough that clubs keep using it
  ride-over-ride.
- **Growth hypothesis** — adoption compounds (club-by-club, captain-led rider invites, retention)
  without per-ride hand-holding.

**Value-hypothesis experiments (the primary set):**
- **V1 — Captain actually uses it.** % of active rides where the Captain opens the fleet view and
  acts on it (taps a rider, responds to a beacon). Pivot signal: built-but-unused.
- **V2 — Moves the real-world outcome.** Does Rail 3 reduce "lost/dropped rider" incidents vs
  control rides (captain debrief)? The job it claims to do.
- **V3 — Rider retention ride-over-ride.** % of riders who join again on the club's next ride.
- **V4 — Keep/pay intent (persevere test).** After N rides, do pilot clubs keep running it — and
  would they pay?

**Growth-hypothesis experiments:**
- **G1 — Join/activation conversion (D58 funnel).** QR scan → app → joined-ride.
- **G2 — Captain→rider invite loop.** Does one captain reliably onboard a full roster; riders/ride.
- **G3 — Club-to-club spread.** Do pilot clubs seed/refer other clubs.

**Viability / NFR enablers (E1–E8) — necessary, not sufficient.** The technical baseline the
value/growth metrics ride on; the PoC sink already emits their primitives (`gps_ping` {fg/bg/tsbg},
`broadcast_latency`, beacon `D-55`, `fleet_compose`, `app_state_change`):

- **E1 — Position freshness (the core "live" promise).** H: a viewer sees every fleet member's
  position fresh within the cadence target for ≥95% of an active ride. Experiment: per-rider
  staleness distribution (receiver receipt − ping `ts`), max gap, segmented by
  foreground/locked/backgrounded/network. Validate: P95 staleness ≤ target; ~zero false "Dark".

- **E2 — Background continuity across the OEM matrix (W179).** H: Transistorsoft sustains
  continuous background tracking across Samsung/Pixel/etc. and battery settings. Experiment:
  multi-device pocketed rides; `tsbg` continuity per device/OEM/battery; broaden the screen-off +
  app-switch scenarios already proven on one Samsung. Validate: max-gap within target per OEM;
  capture per-OEM battery-exclusion setup needs.

- **E3 — Fan-out scaling / cost (W193, the O(N²) concern).** H: the two-channel role-scoped
  broadcast keeps fan-out latency and per-device message volume ~O(N) as fleet size grows.
  Experiment: rides at N≈5/15/30/50; `broadcast_latency` + per-device message volume vs N;
  single-channel vs two-channel. Validate: latency < target; volume scales linearly, not O(N²).

- **E4 — Beacon (SOS) alert latency (D-55 / DoD-05).** H: an SOS reaches all intended recipients
  <500ms, including under load and under the new command-visible-to-all rule (W206). Experiment:
  trigger→render latency across recipients at varying N; sender self-echo as the skew-free measure.
  Validate: P95 < 500ms.

- **E5 — Tactical-state accuracy (W174).** H: Active/Stopped/Inactive/Dark match ground truth — a
  stopped rider reads Stopped (not Dark), a backgrounded rider doesn't false-Dark, a truly dead
  device goes Dark. Experiment: scripted ride/stop/pocket/kill/dead-zone runs; rendered state vs
  actual. Validate: transitions land within threshold windows; no false Dark from backgrounding.

- **E6 — Network resilience.** H: through a dead zone, tracking self-heals within X s and gaps are
  bounded (cf. the observed ~24s transmission blip that recovered on its own). Experiment: induced
  dead zones mid-ride; gap size + recovery time. Validate: recovery < target; no permanent desync.

- **E7 — Battery cost.** H: continuous background GPS drains ≤ X%/hour — acceptable for a
  multi-hour ride. Experiment: battery delta over a fixed ride per device and accuracy setting
  (BestForNavigation vs Balanced). Validate: drain within bound; tune accuracy if needed.

- **E8 — Join / onboarding funnel (D58).** H: QR scan → app open → auth → joined-ride conversion is
  high, and the URL/deep-link strategy works across environments. Experiment: instrument the funnel
  stages; measure drop-off. Validate: conversion target; pinpoint drop steps.

**Cross-cutting for the session:** the **baseline** (current metric values), **actionable-vs-vanity**
for each metric, and the explicit **pivot-or-persevere threshold** per leap-of-faith assumption.
Plus the plumbing: the PoC debug sink is removed before production (Stride W208) and *replaced* by
the deliberate instrumentation this session defines — decide whether `analytics_events` + `ia_*`
views are its home or Rail 3 needs its own, and set the privacy/retention posture for
position/beacon telemetry at production scale.

### J. Rail 3 → Vechelon integration: three surfaces, first-ride onboarding, and the Dark-marker safety reframe (Brain inputs, 2026-06-22)

**Framing (design discussion, Sr PM + Hands, 2026-06-21/22).** A Hands pass on "integrate the mobile ride into Vechelon as a whole" — how the Rail 3 app stops being a standalone PoC and becomes part of the product across Vechelon's **three surfaces (admin web · rider PWA · mobile native)**. It surfaced **two interlocking strategic forks** plus an onboarding reframe and a safety reframe — all Rail 3a Brain inputs, no PoC-Pillar touch. The threads independently converged on already-flagged Brain items (S0-009 parking-lot join; F-08/S0-011 Dark retention), which is the dossier working as intended.

**Originating thread — RWGPS-style GPX export is gated by persistence, not formatting.** Writing a RideWithGPS-style GPX (trkpt lat/lon/ele/time under the RWGPS/ClueTrust header) is trivial and RN-safe (string templating; no DOMParser — unlike the *read* path). The real cost is the source: a completed Rail 3 ride **leaves no durable trace** (positions Broadcast-only per §2; breadcrumb memory-only; the 4-hour Hard Purge wipes the rest). So "export a real ride" is impossible today not for formatting reasons but because **nothing is persisted to export** — which makes it the persistence fork (A), not a feature.

**Fork A — Is a completed ride a durable artifact, or ephemeral?** Everything downstream (GPX export, ride history, post-ride review, the web/native handoff, and the Dark-marker safety case below) cascades from this one call. *Durable* → new schema + ride-end write path + RLS + a **Pillar II §2 amendment** (the "ephemeral, never persisted" line is load-bearing) + interaction with the 4-hour Hard Purge / F-08. *Ephemeral stays* → export/history are off the table; the ride is live-only. This is the **same bytes as F-08** (see Dark-marker, below).

**Fork B — Surface architecture: the on-phone split.** On a phone a rider has two possible homes (rider PWA + native app) that overlap awkwardly. **Forcing function that removes options: live route-ride tracking is physically native-only** — a PWA cannot do background GPS with the screen off (the proven reason Rail 3 went native/Transistorsoft, §H). So "serve route rides from the PWA" was never on the table; the only question is **where the seam falls**. The route-ride *journey* (discover → join → ride live → review) should feel continuous; since its core is forced-native, on a phone the journey wants to live in the app, with the PWA receding to what only web does well (zero-install onboarding, desktop operators, at-home spectating §E). Counter-weight the Brain must weigh: leaning native costs web reach — zero-install onboarding, the productdelivered.ca funnel, spectators, desktop operators.

**Strava is the precedent.** Fully native phone app (recording is native-only; web never records), web retained as a *desktop* surface (analysis + route builder → sync to phone), dual-build tax accepted. The "two homes on one phone" problem dissolves because **web doesn't court the phone** — split by *job* (create/analyze = web, record/ride = native) and *device* (desktop = web, phone = app). Vechelon is already Strava-shaped on the authoring axis (admin builds route → mobile rides it).

> **⚠ Superseded — see "Fork B — RESOLVED" later in this section.** The Option-1/2/3 analysis and the auth-bridge deep-dive that follow are the *reasoning trail*; the decision is **two disjoint surfaces / a narrow native app (Option C)**, which deletes the auth bridge entirely. Kept for the Brain's context, not as live options.

**Three convergence options + LOE** (numbers firm up with a screen-by-screen rider-web↔mobile overlap map):
- **Option 1 — smart routing / thin PWA (~1–2 wk *incremental*).** PWA detects the installed app and deep-links ride actions in; native owns in-saddle. Mostly glue on top of work already in flight. Risk: Android deep-linking already bit us once (D48 https→`rail3://` 302 drop). Two-icon smell partly remains.
- **Option 2 — native shell + embedded WebView (~3–6 wk). Highest value-per-effort here.** One native app; non-tracking rider screens are the existing rider web in a WebView (reuse *all* rider-portal code, no rewrite), only the live map/tracking is native. Single icon, seam hidden. **Long pole = the auth-session bridge** (below).
- **Option 3 — full native rider app (~2–4+ mo + permanent ~1.5–2× feature tax).** Rebuild every rider screen in RN; unless rider-web is killed, every future rider feature is built twice. Heaviest QA/OEM surface. Strava lives here and pays the tax deliberately.
- **Hands lean: Option 2** *(⚠ walked back — see "Fork B — critical reframe" at the end of this section)*. Vechelon is near-best-case — the expensive part (live map) is *already* native, and the rest of the rider surface is low-interactivity, shared-Supabase-auth content (browse/RSVP/profile/routes; web "maps" today are just external links + thumbnails) — exactly what embeds cleanly. The PWA already has a service worker (fast/resilient WebView loads). Apple's thin-wrapper rule (4.2) is a non-issue Android-first and is satisfied anyway by the genuine native map.

**Why the Option-2 auth bridge is the real cost (not a 5-line `setSession`).** Native (OTP, AsyncStorage) and the embedded web (localStorage) are two independent supabase-js clients sharing one identity → a small distributed-session subsystem. Hazards, all field-intermittent (demos green, fails on timing): **(1) refresh-token rotation race** — two auto-refreshing clients; whichever refreshes first invalidates the other's rotated token → random "Invalid Refresh Token" logouts (fix: native = sole owner; web client `autoRefreshToken:false`/`persistSession:false`; native pushes fresh *access* tokens in). **(2) storage isolation + boot-timing race** — the web app reads empty localStorage on load and can render `/auth` or fire an unauth query before the injected token lands → needs inject-before-content or an **embedded-mode bootstrap** that waits for a host handshake. **(3) the web app assumes it owns its session** (reads storage, self-refreshes, PKCE exchange, `ensure_account_exists`) — embedding inverts that to "host owns it," invasive in the scariest spot. **(4) long-session access-token expiry (~1h)** → native must push on refresh + on WebView focus and handle the in-flight 401. **(5) sign-out coherence** both directions (native global signOut / D33 revokes server-side; the WebView must hear it). **(6) tenant coherence** — injected session carries identity, not tenant; native (`EXPO_PUBLIC_TENANT_SLUG`) and web must land on the same club (sharp once multi-membership / W210 lands). Deserves named engineering + a deliberate test plan (long-idle, bg/fg, mid-session expiry, sign-out-while-embedded, multi-tenant switch).

**Parking-lot / first-ride onboarding — the walk-up *is* the membership-acquisition moment (extends S0-009 + §H two-path onboarding / D58).** Reframe: a walk-up *without* the app is not an install scramble to minimize, it's a motivated human to convert. So the parking-lot path is **web-first, zero-install, self-serve by QR**: sign up as a club member + capture details + join *this* ride — and the app is **optional / not expected** (a post-join upsell, not a gate). Consequences:
- **Decouples membership growth from app adoption** — the roster grows on the zero-friction surface; the app is an upsell for engaged riders, not the front door. The parking-lot success path has **zero app-install dependency**.
- **Capture the safety-critical trio at join — name, phone, emergency contact — required; defer the rest** (avatar/bio/full profile → "finish later"). New web flow: today's guest RSVP is name+email only and emergency contact is optional on a separate authed page; the lot wants a single ~30-second signup+safety+join pass.
- **Membership semantics:** a lot signup lands as **initiated** (pending club approval) but **rides today regardless** (ride-join is already separable from tier). Open Q for the Brain: do **captains approve on the spot** (→ instant affiliated) or does approval always route to a club admin? (Decides whether the lot flow needs a captain-side action at all.)
- **Eases identity reconciliation** — minting a real **email-keyed** account means a later app OTP with the same email collapses onto the same account/roster (no ghost/duplicate participant — cf. Lesson B identity hydration).

**Captain/SAG roster + the three-state model (map = live only; roster = searchable source-of-truth).** Under the web-first onboarding model **most of the roster is untracked** (never installs the app) → the live map is *structurally incomplete*, so the **roster becomes the captain's primary tool** and the map a live overlay on the tracked subset. Decision: **do NOT put untracked riders on the map** (also the current behavior — the map only renders broadcasters); they are **searchable on the roster, identified as not-live, callable.** Three states (Sr PM chose the three-state map, 2026-06-22):
- **Live** — broadcasting within freshness window → colored marker.
- **Dark** — was live, ping-silent past threshold → **greyed marker kept at last-known on the map** + *not-live* on the roster. (Greyed marker is **kept, not aged off** — see safety reframe.)
- **Untracked** — never broadcast → **no marker, ever**; roster-only, searchable, callable.
Searchable roster matters at scale (15–50+). Role-gated to captain/SAG via existing `roleVisibility.ts` — **prerequisite: tighten the server-side RP-16 over-read (Lesson C / defect 3623) first**, since this surface makes phones more prominent.

**The Dark marker is a SAFETY feature — "the scene of a possible crash / hit-and-run" (Sr PM 2026-06-22).** This elevates the Dark state from convenience to safety and **reverses any "age-off for clutter": never silently drop a possible incident scene** (the longest-Dark rider is the one you can least afford to hide). Committed thresholds confirmed (`pillar_2_specs §3:280-282`): **2 / 5 / 15 min** (Stopped/Inactive/Dark), tenant-configurable; **Dark = 15-min ping silence → greyed at last-known**, recovers to Active on any ping. Two axes — **movement** (Stopped/Inactive, still pinging = alive — the beer stop) vs **liveness** (Dark = silence = phone dead/crashed); the "Stopped ≠ Dark" distinction already encodes the safety intuition. The reframe pushes on the committed design in two places:
- **Retention = F-08, already pending (S0-011).** *"Dark last-known retained beyond Hard Purge, or purged with all location data?"* — today the 4-hour Hard Purge wipes it (Pillar I Charter, R3-36). The safety framing is the argument **for** a scoped retention exception (hand EMS the coordinate; record for club/family/authorities) — a **Charter touch vs Pillar I privacy-as-product (D-03)**, a genuine values trade. The product side independently rediscovered F-08.
- **Detection speed = net-new.** 15 min is far too slow for crash response, and you **cannot just lower the threshold** (false-Dark from backgrounding / dead zones — E5). Needs a **separate, faster abrupt-dark-at-speed alarm** (was moving fast → instant silence), distinct from generic Dark and tuned not to false-alarm on a merely-backgrounded phone. *Inference from signal-loss, NOT true sensor crash-detection* — set expectations honestly (it will miss some, false-alarm on others).
- **Reframes the app's reason-to-install** from "see the live map" (weak) → **"if something happens, the group can find you"** (strong, honest) — ties to growth **G1** / value **V2**. **Honest limit to state plainly:** the net only covers app-runners; the untracked majority have **no coverage** — must not imply otherwise; "aid, not a guarantee."

**Last-ping data lives on the bottom sheet when a rider is selected (Sr PM 2026-06-22).** Keep the marker clean (just greyed); surface detail on-demand in `RiderBottomSheet` (already the per-rider card: name/role/state/phone/Dial). **Unifies access** — tap the greyed Dark marker OR a roster row → the same sheet, with a **conditional last-ping block** present only when there is ping data (Dark = last-known + staleness; untracked = identity + call only). For Dark riders it is the **incident-response card**: **EMS-grade copyable/shareable coordinates**, **prominent staleness ("last seen X ago" = how much to trust the fix)**, and the **emergency-contact fallback** (SAG/captain only). **Sourcing nuance = the same F-08 bytes:** the live ping store is volatile (wiped on channel re-subscribe — `useFleetPositions.ts:168 setPings({})`), so a reconnect can lose last-known right when it is needed; the durable source is the participant row's `last_lat/last_long/last_ping` (exactly what the Hard Purge targets). So this UI choice **reinforces Fork A / F-08** rather than sidestepping it.
- **Sr PM lean — persist the Dark-rider last-known so the incident card is reliable (2026-06-22).** The bottom-sheet last-known should read from a **durable source**, not the volatile ping store. Two scopes, distinct: **(i) within-session durability** — write last-known to the participant row so a reconnect / channel re-subscribe can't drop it mid-ride; even this brushes Pillar II §2 ("no DB write per ping"), so do it **cheaply — write on the transition to Dark (or throttled), not per-ping** (the `last_lat/last_long/last_ping` fields already exist). **(ii) beyond-purge retention** — whether that last-known *survives the 4-hour Hard Purge* for incident/EMS/post-mortem is **F-08 proper** (Charter touch vs Pillar I D-03), still the Brain's call. The Sr PM lean lands firmly on (i) and is a concrete **down-payment on the "headline safety" branch** of the governing decision below — but record it as a Pillar-brush, not a free LLD choice.

**Governing decision for the Brain (the call everything bends around): is rider safety a headline product commitment, or a quiet operational aid?** *Headline* → resolve **F-08 toward a scoped retention exception**, authorize the **abrupt-dark alarm** as net-new scope, lean **Fork A toward persistence/durable last-known**, and make safety the app's stated value proposition (with honest limits). *Quiet aid* → F-08 stays full-purge, 15-min Dark as-is, no alarm, ephemeral. This single answer sets how far Forks A/B and the onboarding/roster/Dark threads ripple.

**Fork B — critical reframe: the question is "destination vs niche tool," and web is the auth step (Sr PM + Hands, 2026-06-22).** The Option-2 lean above was pressure-tested and **partly walked back** — recorded here so the Brain gets the corrected version, not the oversell:
- **The real upstream question the 1/2/3 framing dodged: is the native app the rider's *home*, or a *niche tactical/safety tool* for the few who install it?** Option 2 (embed the whole rider web in a native shell) only pays off under "home." But the **web-first onboarding decision above already says the app is a minority/enthusiast upsell** = "niche tool." Under "niche tool," the right answer is a **fourth option I'd omitted: keep the native app deliberately narrow** (auth + live map + roster + safety), and let the rich rider surface stay on web where the majority already are. Cheaper, and it avoids the auth bridge.
- **Correction — Strava argues *against* the WebView hybrid, not for it.** Strava is Option 3 (fully native) and **does not embed its web** — web is a separate *desktop* surface. The precedent supports "narrow/native app + web stays web," not embed-web-in-shell. The earlier paragraph conflated "native-first on phone" with "embed web in native."
- **Synthesis the Sr PM is steering to — thin native client + WEB AS THE AUTHENTICATION (and signup) STEP.** The app delegates auth + onboarding to web (one front door for *every* rider, in-app or pure-web — consistent with web-first) and goes native only for the tactical surface. This **reverses the hard bridge direction**: web stays the *unmodified* session authority (it already owns/refreshes its session on its battle-tested path — no invasive "make the web a thin consumer" surgery on the most defect-prone code in the repo, D32/D40/D48 — which removes the worst auth-bridge hazard), and **native becomes the thin consumer**, receiving the token from the WebView for its native Supabase work (broadcast/roster). Bonus: native can **drop its own OTP/deep-link auth (the D48 path)** — one fewer maintained auth path.
- **Critical objection to the synthesis (the real work): refresh ownership during a long ride.** Web cannot be *sole* refresher while the native map runs for hours with the WebView not loaded — the ~1 h access token expires mid-ride and the realtime socket needs a refreshed JWT (`setAuth`) or the broadcast channel drops. So session ownership **hands off**: web owns it during auth/browse, native during the ride. This is race-free **only because one surface is active at a time** (you are either in the WebView or the native map, never both refreshing at once) — which holds here, and is what makes the design sound. So the engineering is "**active-surface-owns-refresh, re-sync on handoff**," not "pass a token." Secondary: a WebView-gated *first* login adds a **network dependency at the start line** (cf. §H hotspot edge error) — mitigate by caching the session hard post-login; and you still have a WebView + token crossing, just in the easy direction.
- **Correction — the service worker is a likely *liability*, not the asset I claimed.** SWs in a WebView are unreliable and a caching SW risks **stale content** — see §D's own PWA stale-cache note. Do not count it as a speed win.
- **Net for the Brain:** Fork B is **not** "pick mechanism 1/2/3." It is: **settle destination-vs-niche-tool first** (the onboarding decision already leans *niche → narrow app*), then make **web the single authentication/onboarding step** for both pure-web and in-app riders, with the **active-surface-owns-refresh handoff** as the one piece of real engineering. LOE still needs the rider-web↔mobile overlap map before any number is trustworthy.

**Fork B — RESOLVED toward two SEPARATE surfaces: keep the PWA + a NARROW native (Option C), NOT embedded (Sr PM 2026-06-22).** Destination-vs-niche is answered — **niche tool**, via two *disjoint* surfaces (the Strava model, which now genuinely fits: split by job + device, web owns onboarding/desktop/app-less, native owns in-saddle). This **supersedes the Option-2 lean and the WebView/auth-bridge synthesis above.**
- **PWA stays live for three roles:** (i) **desktop** (operators, route building, at-home spectating §E); (ii) **first-time account creation / authentication / onboarding** — incl. the parking-lot signup ("web as the auth step" = web owns *sign-up + onboarding*); (iii) **app-less riders' entire experience** (the web-first majority).
- **Native app = Option C, natively built but DELIBERATELY NARROW in scope** — only the tactical/safety surface web fundamentally cannot do (live map, roster, safety, breadcrumb) + lightweight returning-user sign-in. **Native *construction*, minimal *surface* — NOT the "rebuild every rider screen" maximal Option 3.** It does not re-implement the rider portal.
- **This ELIMINATES the Option-2 auth bridge (does not solve — deletes it).** No embedded WebView → no session injection, no active-surface-owns-refresh handoff, no service-worker-in-WebView stale-cache risk. The surfaces are disjoint; the **only** cross-surface link is the **email-keyed account** (created on web, signed into on native with the same email → reconciles, cf. Lesson B). The hard problem of the three turns above is removed, not engineered around.
- **The "dual-build tax" warning evaporates — because the surfaces are disjoint by function.** The tax only applies when web features are rebuilt natively; here web does portal/onboarding/desktop and native does the GPS-tactical surface web *cannot* do, so overlap ≈ 0, tax ≈ 0. **Guardrail (ongoing governance, not a one-time call):** this holds only while the app stays narrow — every "just add ride-history / profile in-app" re-incurs a slice of the tax and re-blurs the surfaces. Rule: **native = tactical/safety only; everything else stays web.**
- **Boundary to pin:** native keeps its **lightweight OTP sign-in** (already built — web owns *sign-up*, native owns returning *sign-in* to an existing account) — recommended — vs deferring even sign-in to a web→app token handoff (drags back the D48 deep-link pain). Recommend native OTP.
- **Residual real-world friction (acceptable, keep off the critical path):** an enthusiast who wants the live app *in the parking lot* hits **two email round-trips** (web account-creation, then native OTP) on bad signal — tolerable only because the app is optional/not-expected there.
- **LOE note:** the rider-web↔mobile overlap map is **no longer needed to choose a mechanism** (there's no embedding to size); what matters now is the **narrow native tactical build**, which is the PoC's core work already in flight (W172 chain) — not net-new integration scope.

**Parking-lot / ride-join onboarding — canonical paths + the iOS coverage truth (Sr PM 2026-06-22).** Three join paths, **not two** — the missing one is "account but no app," which is *structural, not an edge case* (it's every iPhone rider):
1. **PWA — no account (first-timer):** QR (encodes ride + tenant) → app-link routes to PWA → ~30-sec **sign-up-and-join** capturing **name, email, phone (mandatory)** + **emergency-contact name & phone (optional but requested)** → real **email-keyed account**, **on the roster immediately** (pending/initiated tier — *no magic-link round-trip required to be listed*; rides today, claims full membership later) → captain/SAG roster as **not-live, callable**. App offered as an optional upsell, not expected.
2. **PWA — account exists, no app (returning):** no account creation — sign in (magic-link / existing session), **just join this ride** → roster **not-live, callable**. **This is the PERMANENT path for 100% of iPhone riders (SD-004: no iOS app yet) and any Android rider who hasn't installed.**
3. **Android app + account:** the same QR **deep-links into the app, into this ride** (D58; native OTP if the session lapsed) → **tap to join** → **live** on map + roster. **Android-only.**

**Platform-coverage truth to state plainly for the Brain:** the native app — and therefore the **live map, broadcasting, and the entire Dark-marker safety net — is Android-only**. Until an iOS app exists (SD-004), **every iPhone rider is permanently Path 2**: on the roster, callable, but **never on the live map, never broadcasting, never covered by the safety net.** Consequences:
- **(a) The captain's roster majority is not-live** in a mixed-platform group (all iPhones + Android-non-installers); only Android-app-users render as live dots. *Reinforces roster = source of truth, map = a platform-limited subset — harder than "some won't install": an entire platform can't.*
- **(b) The "get the app for safety" upsell is Android-only** — iPhone users have nothing to install, so the install nudge / funnel reframe reaches at most the Android half.
- **(c) It sharpens the safety caution toward decisive.** "If something happens, the group can find you" is **false for every iPhone rider** — headline safety positioning would promise platform-wide protection the system *structurally cannot deliver to ~half the users.* Strong push toward **quiet aid** over **headline**, or at minimum scrupulously **Android-scoped** honesty in any safety language.
- **This reinforces (does not complicate) the surface decision:** keeping the PWA live is not "serving a minority who won't install" — for iOS it is the *only* surface that will ever exist pre-iOS-app, so web-first is the only way to reach iPhone riders at all.
- **NOTE — onboarding data capture is for the PRODUCT TRIO to weigh in on (open note, NOT a decision).** The goal is genuinely two-sided: keep RSVP/join **frictionless**, *and* capture enough useful information to **progress the rider toward full membership**. Proposed field set to weigh: *mandatory* — **name, email, phone**; *optional but requested* — **emergency-contact name & phone**. The Trio balances join-friction vs membership-progression vs the Dark-marker emergency-contact fallback. Recorded here as an **open note awaiting Product Trio input**, not a ratified decision.
  - **Membership-gating model (refined with Sr PM 2026-06-23 — still Product-Trio-pending, NOT a decision):**
    - **Email is free** — a magic-link sign-in *is* the email verification; no separate gate.
    - **Affiliation requires BOTH, order-independent:** (a) **required contact details present** (the universal floor — name + phone; email already verified) **AND** (b) **admin approval** — but (b) **only** for clubs that switch the approval rule on (maps to `tenants.enrollment_mode`). Non-approval club → affiliation = details complete. Approval club → details **and** approval, applied in *any order*, both required. *Implication:* affiliation becomes a guarded transition computed from both conditions, not the single `affiliate_member` click flipping it directly (today it does).
    - **No new status needed** — "authenticated but incomplete" is just the existing pre-affiliated **RSVP'd / guest** bucket; "complete" = required fields present, a *condition for* affiliation, not a distinct state.
    - **Gate affiliation, NOT ride-join** — a guest/RSVP'd rider stays on the roster frictionlessly; the details requirement only bites at the crossing into **full membership**. (Also tightens the current open-enrollment path, which today auto-affiliates on bare email.)
    - **Prompt incomplete members to complete (proposed):** on **sign-in** (contextual, **non-blocking** — never gates participation) **and** via **email** re-engagement (reaches the "signed in once, never returned" cohort where conversion leaks; email already verified, channel is free). **Cadence / copy / one-off-vs-drip / insistence = open (Product Trio / Brain), same as the install-prompt "how."**
- **NOTE — post-join app-install prompt: the *how* is the BRAIN's to decide.** After roster join, a rider on a platform that *has* an app (Android; iPhone has none, SD-004) should be **prompted to install it** — but the mechanics, timing, copy, and insistence of that prompt are **deferred to the Brain**, not specified here. Recorded as a deferral, not a designed flow.

### K. Brain Q&A — do the existing PoC tables carry tenant context? (2026-06-24)

**Q (Brain):** State of the existing PoC tables — factual, to size the work. Do `location_pings`, `beacon_alerts`, `rider_states` already carry tenant context, or did they ship single-club? Single-club → tenant-scoping is a migration **plus a Broadcast-channel rework** (the **C2** item). Already-scoped → **A3** is much smaller. Which is it?

**A (Hands — factual, read from the schema): they ALREADY carry tenant context. They did NOT ship single-club → the small case (A3), not C2.**
- **`beacon_alerts`** and **`rider_states`** each carry **`tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE`**, **denormalized from the ride's tenant**, with **tenant-scoped RLS** (`tenant_id = public.get_my_tenant_id()` — a SECURITY DEFINER helper that reads `account_tenants`, no recursion) and a `*_tenant_idx`. Source: **`supabase/migrations/20260610000000_rail3_schema.sql`** (`beacon_alerts` L51–68; `rider_states` L74–113). Multi-tenant from day one — no tenant-scoping migration owed.
- **`location_pings` is not a persisted table at all** — no migration creates it. Live positions are **ephemeral (Supabase Broadcast only, no DB write per ping)** per Pillar II §2, so there is nothing to scope. Last-known position lives on **`ride_participants.last_*`** (an existing, already tenant-scoped table). The "location_pings table" in the breadcrumb seed was a hypothetical backfill source that doesn't exist.
- **Broadcast channel is already tenant-gated at the realtime layer** — the per-ride channel `rail3:ride:<id>` is authorized by `realtime.messages` RLS against tenant membership (**W170**). So there is **no tenancy-driven Broadcast rework owed**; the only Broadcast change on the table is the **two-channel role-scoped split (W193)**, which is a *scaling/confidentiality* change (§A), **independent of tenancy**.

**Sizing verdict:** **A3 is the small case.** No tenant-scoping migration on the persisted tables (already done), and no Broadcast rework for tenancy (W170 already gates per-tenant). The C2 "migration + Broadcast rework" scenario does **not** apply.

**One caveat — state, not design:** these tables are **held off prod** (they live on `origin/W172`, applied to **staging** `xybgtbybdhxuwqjfcfkc` and verified, not the prod project). So "as-built they are tenant-scoped" is true on the held branch + staging; promoting them to prod is the additive-migration step already gated in the Rail 3 hold — not net tenant-scoping work.

---

## References
- **Stride:** W190 (web fleet view), W192 (staging hosting/override), W193 (fan-out scaling), W204 (Transistorsoft engine), W210 (ride-selection at scale), W211/W213/W214 (SAG), W216 (bulk member import); defects 3623 (RP-16), D48 (deep-link/OTP), D58 (ride-join URL). PRs #70 (W190), #73 (W192), #85 (W216).
- **PoC Pillars (frozen):** `productdocuments/rail3/vechelon_rail3_pillar_1_charter.md` (§3 $0 cost, 4-h purge), `..._pillar_2_specs_v1.0.2.md` (§2 transport/NFRs, §4.1 matrix, Feature 1/2), `..._pillar_3_quality_gate_v1.0.0.md` (R3-xx, V-004), `..._pillar_4_ledger_v1.0.0.md` (F-07/F-08, S0-009/010/011).
- **Companion docs:** `docs/rail3-transistorsoft-trial-test.md` (engine validation), `docs/rail3-breadcrumb-hands-seed.md`, `docs/rail3-forward-plan.md`, `supabase/migrations/20260610000000_rail3_schema.sql` (rail3 schema, held on origin/W172).
