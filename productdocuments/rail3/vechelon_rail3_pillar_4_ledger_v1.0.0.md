[Vechelon Rail 3] Pillar IV: The Ledger (v1.0.0)
Project: Vechelon Rail 3 — Mobile Tactical | Current Version: v1.0.0 | Last Sync Date: 2026-05-12 | Status: COMMITTED

---

## Change Log
| Version | Date | Time | MACD Action | Decision | Trio Lead |
|---|---|---|---|---|---|
| v0.1.0 | 2026-05-12 | — | ADD | Rail 3 Pillar set initialized. Platform strategy, PoC approach, infrastructure architecture, risks, and LOE committed from Brain session. | TPM |
| v1.0.0 | 2026-05-12 | — | ADD | Full day of Brain sessions complete. Pillars I, II, and III promoted to COMMITTED. All session decisions, new Sprint 0 tasks, and pending Brain decisions captured. Ledger promoted DRAFT → COMMITTED. | TPM |

---

## §1. Strategic Decisions

### SD-001: Production Stack — React Native Expo (Path C)
**Date:** 2026-05-12
**Decision:** Production Rail 3 (Android and iOS) will be built as a pure React Native Expo app from scratch.
**Rationale:** Safety-critical, GPS-heavy, live fleet tracking product requires native performance. WebView ceiling of Capacitor eliminated where it matters most — background GPS and live map performance both require native plugins regardless of wrapper choice, eliminating the code reuse advantage of Capacitor.
**Alternatives Rejected:**
- Path B (Capacitor): WebView ceiling on fleet map and GPS load. Code reuse benefit eliminated at the layers that matter.
- PWA: Background GPS fails on Android screen lock. iOS excluded entirely — WebKit mandates no Geolocation API in Service Workers.

---

### SD-002: PoC Stack — React Native Expo (not PWA)
**Date:** 2026-05-12
**Decision:** The Rail 3 PoC will be built in React Native Expo, consistent with the principle that the PoC stack must be as close to production as possible.
**Rationale:** A PWA PoC would not validate background GPS (the most critical capability), would not test real device UX during a ride, and would produce throwaway code. React Native Expo PoC validates all three north star requirements and carries significant code forward to production.

**PoC North Star:**
1. Tested on a real device during a real ride (Racer Sportif)
2. Background GPS validation
3. Role functionality (captain / support / rider)

---

### SD-003: PoC Distribution — Expo Development Build (No Play Store)
**Date:** 2026-05-12
**Decision:** PoC distributed via Expo Development Build sideloaded APK. No Play Store submission for PoC phase.
**Rationale:** Play Store submission is production overhead not required for a controlled field test with Racer Sportif.

---

### SD-004: iOS Excluded from PoC
**Date:** 2026-05-12
**Decision:** iOS explicitly excluded from Rail 3 PoC. Rail 3b (iOS) follows Rail 3a Android validation.
**Rationale:** Apple mandates WebKit for all iOS browsers. WebKit does not expose the Geolocation API to Service Workers. Background GPS is impossible in any iOS context — PWA or otherwise — during the PoC phase. Testing on iOS would produce a false negative on the product's most critical capability. React Native Expo handles iOS cleanly in production via expo-location.

---

### SD-005: Supabase Architecture — Same Project, Broadcast Pattern
**Date:** 2026-05-12
**Decision:** Rail 3 uses the same Supabase project as Rails 1 & 2. New Rail 3 tables added alongside existing schema. Supabase Broadcast (not Postgres Changes) used for real-time location fan-out. Location pings are ephemeral — Broadcast channel only, no DB write per ping. Database writes occur at meaningful events only: beacon alert trigger, beacon cancel, ride start, ride end, final rider state.
**New Rail 3 Tables:** beacon_alerts, rider_states.
**Retention:** 4-hour Hard Purge applies to all Rail 3 location data (inherited architectural decision).

---

### SD-006: PoC is Sprint 0-1 of Production Build
**Date:** 2026-05-12
**Decision:** The Rail 3 PoC is not a throwaway exercise. It is Sprint 0-1 of the production build — built rough but in the correct stack. Upon PoC validation, the production build hardens what exists rather than starting over.
**What carries forward:** Components, navigation patterns, real-time sync hooks, map integration, Rail 3 schema.

---

### SD-007: Rail 3 is the Fourth Pillar Set
**Date:** 2026-05-12
**Decision:** Rail 3 constitutes the fourth independent Pillar set for Vechelon.
**Existing sets:**
- Set 1: Rail 1 — Admin Portal (committed)
- Set 2: Rail 2 — Rider Portal (committed)
- Set 3: VoC / Innovation Accounting / Multi-tenancy (committed)
- Set 4: Rail 3 — Mobile Tactical (this set)
**Inheritance:** Rail 3 Pillars reference Sets 1-3 rather than duplicate them.

---

### SD-008: PoC Participants — Registered Members Only
**Date:** 2026-05-12
**Decision:** Guest join flow is explicitly out of scope for the PoC. Sideloaded APKs are not viable for parking lot joins. PoC participants must be registered members with the APK pre-installed.
**Production resolution:** Full guest join flow (parking lot QR, email capture, one-ride session) is a Sprint 0 task for the Rail 3a production Brain session. See PDoD-03 in Pillar III.

---

### SD-009: Android Foreground Service Notification — Required Platform Constraint
**Date:** 2026-05-12
**Decision:** Android requires a persistent notification for any app running a background process including GPS. This notification must be present for the full duration of the ride. If dismissed by the rider, Android kills the GPS service and the rider goes Dark at their last known position. This is a platform constraint, not a design choice.
**Design requirements:** Notification copy must communicate the consequence of dismissal without alarming. In-app explainer shown on first ride join — plain language, one-time, dismissible. Final copy subject to Voice & Tone review.

---

### SD-010: Battery Saver Detection — Intercept on Join and Screen Lock
**Date:** 2026-05-12
**Decision:** On ride join and on screen lock, the app checks for Battery Saver mode. If active, a prompt directs the rider to turn it off with a direct link to device battery settings where the OS permits. Battery Saver and OEM battery optimisation are separate system toggles — both require their own intercept.

---

### SD-011: beacon_cancelled_by — Rider UUID on Self-Cancel, Null Reserved for System Error
**Date:** 2026-05-12
**Decision:** When a rider cancels their own Support Beacon, beacon_cancelled_by is written with the rider's own UUID — not null. Null is reserved for system error only. Rationale: null is indistinguishable from a failed write. Rider UUID is a valid FK, requires no schema change, and produces an unambiguous audit trail on a safety event.

---

### SD-012: QR Display — All Roles
**Date:** 2026-05-12
**Decision:** QR display (full screen) is available to Captain, SAG, and Rider. Not restricted to Captain only.
**Rationale:** Any participant may need to display the QR to allow late joiners to scan. No security risk — QR links to an active ride that any authenticated user can join.

---

### SD-013: UX Status Label Copy — Deferred to Stride Milestone
**Date:** 2026-05-12
**Decision:** Architectural state names (Active, Stopped, Inactive, Dark, Beacon Active) are committed and used in schema, glossary, and internal logic. Final UX label copy is deferred to a Stride milestone and applied via MACD before Rail 3a production launch. See PDoD-06 in Pillar III.

---

### SD-014: Tenant Branding in React Native — ThemeProvider
**Date:** 2026-05-12
**Decision:** At app initialisation, the app fetches brand config from the tenants table (primary_colour, accent_colour, logo_url) and injects it into a React Native ThemeProvider via React Context. All themed components consume the ThemeProvider. Google Maps canvas excluded from tenant branding in MVP. Library choice (React Native Paper ThemeProvider, custom context, or other) is an LLD decision — Sprint 0 task for The Hands.

---

### SD-015: D-54 — Performance NFRs (PoC Validation Targets)
**Date:** 2026-05-12
**Decision:** The following are validation targets confirmed during PoC field testing — not production guarantees. Results feed Rail 3a production decisions.

| Metric | Target |
|---|---|
| Active ping interval | 5 seconds |
| Stopped / Inactive ping interval | 30 seconds |
| Dark ping interval | 60 seconds |
| Max concurrent participants | 100 |
| Battery drain | < 10% per hour on modern devices |

---

### SD-016: D-55 — Support Beacon Alert Latency
**Date:** 2026-05-12
**Decision:** Support Beacon alert latency target is <500ms. Supabase Broadcast confirmed as the transport. Client-side instrumentation required: timestamp at trigger on rider's device, timestamp at receipt on Captain/SAG device, delta logged. Sprint 0 task for The Hands to wire instrumentation before PoC field test. See DoD-05 in Pillar III.

---

## §2. Pending Brain Decisions

These items were explicitly flagged during Brain sessions and must be resolved before Rail 3a production build begins. They must not be built or tested until resolved.

| ID | Decision Required | Flagged In | Resolution Path |
|---|---|---|---|
| F-07 | Support Beacon visibility to other riders — visible or Captain/SAG only? | Pillar III §2 Global Rules | Rail 3a Brain session |
| F-08 | Dark state last known position — retained beyond Hard Purge or purged with all other location data? | Pillar III R3-36 | Rail 3a Brain session |

---

## §3. Risks Log

### R-001: Background GPS on OEM Android
**Severity:** High
**Detail:** Samsung, Xiaomi, and Huawei run aggressive battery optimisation that kills background processes outside Google's standard. A rider on a mid-range Samsung could silently drop off the fleet map without error.
**Mitigation:** Explicit multi-device OEM testing as a PoC validation requirement. Battery Saver detection and OEM optimisation exclusion prompt added to the app (SD-010). Minimum test set: stock Android, Samsung One UI, secondary OEM if available from volunteers.

### R-002: Supabase Broadcast Under Fleet Scale Load
**Severity:** High
**Detail:** Multiple riders pinging location simultaneously, broadcasting to all other riders — high-frequency fan-out pattern. Not load-tested at Vechelon fleet scale.
**Mitigation:** Explicit PoC validation item (V-004). All volunteer participants broadcasting simultaneously during field test. Measurement feeds Rail 3a NFR validation.

### R-003: UX Fidelity — Glanceable Mobile UI
**Severity:** Medium
**Detail:** Live ride UX must work one-handed, in sunlight, on a moving bike. Cannot be validated in a browser or emulator.
**Mitigation:** React Native Expo PoC on real devices during a real ride. V-007 (SAG glanceable assessment) is an explicit PoC validation item.

---

## §4. LOE Estimate — Rail 3 PoC

| Component | Effort |
|---|---|
| Expo setup + Supabase auth integration | 2 days |
| Rail 3 schema additions | 1 day |
| Background GPS (expo-location + expo-task-manager) | 3 days |
| Supabase Broadcast integration | 3 days |
| react-native-maps live fleet markers | 4 days |
| Role-based rendering (captain / support / rider) | 3 days |
| Support Beacon flow | 2 days |
| Captain mobile controls | 2 days |
| Rider states and edge indicators | 2 days |
| Expo Development Build + sideload setup | 1 day |
| Field testing — Racer Sportif | 4 days |
| **Total** | **~5-6 weeks** |

---

## §5. Deferred Value — Roadmap

| Item | Deferred To | Reason |
|---|---|---|
| iOS Rail 3b | Post Rail 3a Play Store validation | Android-first strategy |
| Play Store submission | Post PoC validation | PoC uses sideloaded APK |
| App Store submission | Rail 3b | Post iOS development |
| Guest join flow (parking lot QR) | Rail 3a production Brain session | Sideloaded APK not viable for parking lot joins. Full flow requires Brain session — see PDoD-03. |
| F-07: Beacon visibility to other riders | Rail 3a Brain session | Unresolved — must not be built until decided |
| F-08: Dark state last known position retention | Rail 3a Brain session | Unresolved — current purge rule assumed until resolved |
| UX label copy (status labels) | Stride milestone | Architectural names committed. Copy subject to Voice & Tone review — PDoD-06. |
| ThemeProvider library choice | Sprint 0 — The Hands | LLD decision |
| SAG mid-ride reassignment | Post MVP | Schema supports multiple SAG records — not in MVP |

---

## §6. Sprint 0 Tasks — LLD Unknowns for The Hands

| # | Task | Owner | Status | Pillar Trace |
|---|---|---|---|---|
| S0-001 | Validate expo-location background task on stock Android, Samsung One UI, secondary OEM. Record GPS survival, time-to-kill, manual intervention required per device. | The Hands | Pending | Pillar II §2, R3-01, R3-02, V-002 |
| S0-002 | Validate Supabase Broadcast channel performance under full volunteer group simultaneous load during PoC field test. Record fan-out latency, stability. | The Hands | Pending | Pillar II §2, V-004 |
| S0-003 | Confirm react-native-maps performance with N simultaneous moving markers at PoC participant count. Record render stability and latency. | The Hands | Pending | Pillar II §2, V-003 |
| S0-004 | Confirm Expo Development Build sideload process on target Android devices before field test day. | The Hands | Pending | Pillar II §1 |
| S0-005 | Wire Support Beacon latency instrumentation: client-side timestamp at trigger (rider device), timestamp at receipt (Captain/SAG device), delta logged. Required before PoC field test. | The Hands | Pending | Pillar III DoD-05, SD-016 |
| S0-006 | Implement in-app explainer shown on first ride join — plain language, one-time, dismissible. Explains Foreground Service Notification consequence of dismissal. | The Hands | Pending | Pillar II §2, SD-009 |
| S0-007 | Implement OEM battery optimisation exclusion prompt on first ride join — OEM-specific instructions where possible. | The Hands | Pending | Pillar II §2, SD-010 |
| S0-008 | ThemeProvider library selection and implementation — React Native Paper, custom context, or equivalent. Fetches primary_colour, accent_colour, logo_url from tenants table at app init. | The Hands | Pending | Pillar II §5.2, SD-014 |
| S0-009 | Rail 3a Brain session — guest join flow resolution. Parking lot QR, email capture, one-ride session, account promotion path. Required before Rail 3a production build. | Brain | Pending | Pillar III PDoD-03, SD-008 |
| S0-010 | Rail 3a Brain session — F-07 resolution: Support Beacon visibility to other riders. | Brain | Pending | Pillar III PDoD-04, F-07 |
| S0-011 | Rail 3a Brain session — F-08 resolution: Dark state last known position retention beyond Hard Purge. | Brain | Pending | Pillar III PDoD-05, F-08 |

---

## §7. Ledger Receipt — Full Day

| Version | Date | Time | MACD Action | Decision | Trio Lead |
|---|---|---|---|---|---|
| v0.1.0 | 2026-05-12 | AM | ADD | Rail 3 Pillar set initialized. Platform strategy session complete. SD-001 through SD-007 committed. R-001 through R-003 logged. LOE captured. | TPM |
| v1.0.0 | 2026-05-12 | EOD | ADD | All four Brain sessions complete. Pillar I (v1.0.0), Pillar II (v1.0.2), Pillar III (v1.0.0) promoted to COMMITTED. SD-008 through SD-016 committed. F-07 and F-08 formally flagged as pending. Sprint 0 tasks S0-001 through S0-011 captured. Pillar IV promoted DRAFT → COMMITTED. | TPM |
