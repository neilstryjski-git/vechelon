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
- **Now (The Hands, no Pillar touch):** B (defect), C/3623 (server-side fix + API regression;
  pending Brain scope call), the role-gate data-layer regression assertions, D ops checklist.
- **Rail 3a Brain session inputs:** A (fan-out economics + Option A) · the A/C shared
  "enforcement/topology" theme · the two Charter touchpoints (fan-out $0 cost; S0-011 retention)
  · E (S0-009/010/011).

## References
- Stride: **W190** (web fleet view), **W192** (staging hosting/override), **W193** (fan-out scaling),
  defect **3623** (RP-16). PRs **#70** (W190), **#73** (W192, stacked).
- Pillars: `productdocuments/rail3/vechelon_rail3_pillar_1_charter.md` (§3 $0 cost, 4-h purge),
  `..._pillar_2_specs_v1.0.2.md` (§2 transport/NFRs, §4.1 matrix, Feature 1/2),
  `..._pillar_3_quality_gate_v1.0.0.md` (R3-xx, V-004).

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

**Ride selection at scale — the PoC list is the right foundation, but it's visibility-scoped and single-tenant-pinned (design discussion 2026-06-16).** Stride W210. HomeScreen's "tap a ride from the list" pattern is correct and *should be kept*: ride selection has an in-app, contextual, plural-aware surface (a list + user pick), which is exactly what the launcher icon lacks — so multiple simultaneous active rides are handled by listing them, not by the app guessing. But the PoC simplification borrows against the real world, and the maturation path should be recorded so the simplification isn't mistaken for the finished design:
- **Visibility-scoped → participation-scoped.** Today the query is roughly *"all `active` rides I can see (RLS-scoped to club), newest first, limit 20"* — it shows every active club ride, not the ride(s) I'm on. At scale (a busy morning, several concurrent group rides) the ride I'm actually riding gets buried. Join `ride_participants` and surface **"rides I'm on"** as the primary set, with **"rides I could join in my club(s)"** as a secondary, discoverable tier.
- **Reframe the hard case.** "One person on multiple *simultaneous* rides" is data-possible but physically rare (a cyclist rides one at a time). The common hard case is the inverse: *many rides exist; surface **mine** instantly.* Design for "find my one ride fast among many," with graceful handling of the rare multi as the tail.
- **Smart default keeps PoC-feel.** Exactly one active ride I'm on → **deep-link straight in** (skip the list). More than one → show the list, **relevance-ranked** (rides I'm on, by nearest start; captain/SAG role bumping prominence).
- **Multi-membership → sections, which is the tenant-context fix in disguise.** For a multi-club user the list groups **by club**, and each section carries that club's tenant context (branding, §4.1 gating, broadcast auth). So "section the list by club" and the multi-membership rule **"derive the active tenant from the *selected ride*, never from a build-time pin (`EXPO_PUBLIC_TENANT_SLUG`) or a `LIMIT 1` membership guess"** are the same piece of work — and it depends on the `LIMIT 1` → `account_tenants` membership `EXISTS` change already flagged for broadcast (Stride W196 class; same fix needed on the ride-read path).
- **The link often bypasses the list.** A QR/deep-link arrival points at one specific ride, skipping selection — so the list is the *discovery/fallback* surface, not the only path, which lowers how hard it must scale.

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
