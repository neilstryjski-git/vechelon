[Vechelon Rail 3] Pillar IV: The Ledger (v1.1.3)
Project: Vechelon Rail 3 — Mobile Tactical | Current Version: v1.1.3 | Last Sync Date: 2026-09-13 | Status: COMMITTED

---

## Change Log
| Version | Date | Time | MACD Action | Decision | Trio Lead |
|---|---|---|---|---|---|
| v0.1.0 | 2026-05-12 | — | ADD | Rail 3 Pillar set initialized. Platform strategy, PoC approach, infrastructure architecture, risks, and LOE committed from Brain session. | TPM |
| v1.0.0 | 2026-05-12 | — | ADD | Full day of Brain sessions complete. Pillars I, II, and III promoted to COMMITTED. All session decisions, new Sprint 0 tasks, and pending Brain decisions captured. Ledger promoted DRAFT → COMMITTED. | TPM |
| v1.1.3 | 2026-09-13 | — | CHANGE | Sprint 0 taxonomy ruled and written into §6. Sprint 0 is a phase of however many tickets LLD discovery requires, not a closed list; wTBDn is the Brain's suggested sequence and represents the tickets Sprint 0 needs; S0-nnn and wTBDn are the same concept under two naming eras, not two registers. Ticketing in Stride stated as the Hands' job for the first time inside the Bedrock. wTBD1 and wTBD2 registered in §6 where they belong, resolving the defect where a Sprint 0 measurement task was filed only in §14. | TPM |
| v1.1.2 | 2026-09-13 | — | CHANGE | Hands-readiness pass. F-07, Support Beacon visibility to other riders, RESOLVED as Captain and SAG only; PDoD-04 and S0-010 discharged; the Pending Brain Decisions list is now empty. Hands item 22, threshold configuration owners, RULED and discharged, with the reconciling clause written into Pillar II §3 Feature 4. Findings F-3, F-4 and F-5 closed by correction. S0-001 corrected from expo-location to the Transistorsoft engine. The Bedrock is Hands-ready. | TPM |
| v1.1.1 | 2026-09-13 | — | CHANGE | F-08, Dark state last known position retention, DISCHARGED. Resolved as purged with all other location data, no exemption. Not a new decision: committed R3-36 has listed last_lat, last_long and last_ping among the fields permanently deleted at T+4h since v1.0.0; B2's purge scope reaffirmed it; and C1's two-class retention model enumerates rail3_breadcrumb as the only purge-exempt class. Discharged at §2, §5, §6 (S0-011), §8.5 and §10; finding F-16 closed. Pending Brain Decisions now stand at one, F-07. | TPM |
| v1.1.0 | 2026-09-13 | — | CHANGE | G33 arc enshrinement. Forty-four rulings across Sessions A, B, C and D written as finished entries in new §8 to §15. Guest access receipt transcribed verbatim. C1 breadcrumb dissent recorded. R3-02 successor criterion recorded verbatim for the Rail 3a successor. Thirty second seed-to-live target recorded as a design target with its test-plan criterion and reopening trigger. Deferred and parked register consolidated. Twenty-three Hands items carried. Nine session-two findings and six session-three findings logged. SD-005 retention, SD-008 guest resolution, SD-012 QR display, §5 guest join row and S0-009 superseded under [DELETED - 2026-09-13] tags. PDoD-03 and S0-009 discharged, not deferred. Ledger Receipt covering all three MACD sessions added at §15. | TPM |

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
**Retention:** [DELETED - 2026-09-13] 4-hour Hard Purge applies to all Rail 3 location data (inherited architectural decision). Superseded by C1, breadcrumb, which established a two-class retention model: T+4h personal data, and purge-exempt club artifacts. rail3_breadcrumb survives the Hard Purge as a club-owned artifact. Current model in Pillar II §2 retention and Pillar III R3-36 and R3-70. See §8 ruling C1 and §9 dissent record.

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
**Production resolution:** [DELETED - 2026-09-13] Full guest join flow (parking lot QR, email capture, one-ride session) is a Sprint 0 task for the Rail 3a production Brain session. See PDoD-03 in Pillar III. Superseded by R-GUEST, guest access model, as amended by D-QR-5, guest email capture. There is no Rail 3a production guest join to resolve: guests are portal-side participants only and never hold the native app, so the Brain session this pointed at will not happen. PDoD-03 is discharged in Pillar III v1.1.0 and S0-009 is discharged at §6 below. The one-ride-session clause is superseded outright. Full model at §8 ruling R-GUEST and the verbatim receipt at §11.

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
**Decision:** [DELETED - 2026-09-13] QR display (full screen) is available to Captain, SAG, and Rider. Not restricted to Captain only.
**Rationale:** [DELETED - 2026-09-13] Any participant may need to display the QR to allow late joiners to scan. No security risk — QR links to an active ride that any authenticated user can join.
**Superseding decision (2026-09-13):** D-QR-7, QR display is Captain and SAG. Rider is excluded. The rationale above is false under the closed guest model: the code is the authorisation gate for guest self-registration onto a roster that carries leaders' phone numbers, so an arbitrary rider authorising strangers onto that roster is the exposure case. Two named leadership roles is not. Committed in Pillar II §3 Feature 3, §4.1 and §4.2 at v1.1.0. See §8 ruling D-QR-7.

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

**Status 2026-09-13: this list is empty.** Both F-07 and F-08 are resolved; the rows below are retained under Immutable Numbering with their resolutions recorded. No build-and-test gate remains open against the Rail 3 Bedrock.

| ID | Decision Required | Flagged In | Resolution Path |
|---|---|---|---|
| F-07 | [DELETED - 2026-09-13] Support Beacon visibility to other riders — visible or Captain/SAG only? **RESOLVED 2026-09-13: Captain and SAG only.** See §8.5. | Pillar III §2 Global Rules | **Resolved. No Brain session required.** |
| F-08 | [DELETED - 2026-09-13] Dark state last known position — retained beyond Hard Purge or purged with all other location data? **DISCHARGED 2026-09-13: purged, no exemption.** See §8.5. | Pillar III §2 Global Rules | **Resolved. No Brain session required.** |

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
| Guest join flow (parking lot QR) | [DELETED - 2026-09-13] Rail 3a production Brain session | [DELETED - 2026-09-13] Sideloaded APK not viable for parking lot joins. Full flow requires Brain session — see PDoD-03. Superseded and discharged: R-GUEST places guests portal-side only, and the self-registration surface is Rails 1 and 2 work per D-QR-4, not deferred Rail 3 value. See §8 and §14 item 18. |
| F-07: Beacon visibility to other riders | [DELETED - 2026-09-13] Rail 3a Brain session | [DELETED - 2026-09-13] Unresolved — must not be built until decided. **Resolved 2026-09-13: Captain and SAG only.** Not deferred value; a committed exclusion. See §8.5. |
| F-08: Dark state last known position retention | [DELETED - 2026-09-13] Rail 3a Brain session | [DELETED - 2026-09-13] Unresolved — current purge rule assumed until resolved. **Discharged 2026-09-13:** the committed purge rule was not an assumption, it was the answer. Purged with all other location data, no exemption. See §8.5. |
| UX label copy (status labels) | Stride milestone | Architectural names committed. Copy subject to Voice & Tone review — PDoD-06. |
| ThemeProvider library choice | Sprint 0 — The Hands | LLD decision |
| SAG mid-ride reassignment | Post MVP | Schema supports multiple SAG records — not in MVP |

---

## §6. Sprint 0 Tasks — LLD Unknowns for The Hands

**What Sprint 0 is.** A phase, not a closed list. It runs for however many tickets are required to discover the implementation detail the LLD needs, and the register below is a starting set rather than a cap. The Hands add tickets to it as discovery reveals them. The boundary holds: Sprint 0 exists to build foundational context and resolve LLD unknowns, and is not a route back to the Brain for strategy. That path is the Pillar V Amendment Protocol.

**Whose job the ticketing is.** The Hands'. Each entry below becomes a real ticket in Stride, where Stride is available. Where it is not, this register is the source of truth and the Hands track status here. The Brain does not create tickets; it names the unknowns and proposes the order.

**The two ID formats are one concept.** S0-nnn and wTBDn are the same thing under two naming eras, not two registers:

- **S0-nnn** was the original numbering, written 2026-05-12 before the convention existed. Those numbers are immutable and stay as they are.
- **wTBDn** is the convention instilled 2026-07-27 and used for everything the Brain has proposed since. A wTBDn is a **suggested sequence**: it names a ticket Sprint 0 needs and encodes the order the Brain proposes, with no real ticket number attached because the Brain does not assign them.

**The substitution rule.** At actual ticketing the Hands assign the real W-number and **record each substitution** against the wTBDn placeholder, so a later reader can trace a Stride ticket back to the Brain proposal that produced it. This applies to wTBDn entries; S0-nnn entries carry their own IDs and need no substitution.

| # | Task | Owner | Status | Pillar Trace |
|---|---|---|---|---|
| S0-001 | [DELETED - 2026-09-13] Validate expo-location background task on stock Android, Samsung One UI, secondary OEM. **Corrected:** validate the **Transistorsoft background geolocation engine** on stock Android, Samsung One UI, secondary OEM. Record GPS survival, time-to-kill, manual intervention required per device. expo-location is superseded by the purchased Transistorsoft licence (2026-08-01) and is ended. | The Hands | Pending | Pillar II §2, R3-01, R3-02, V-002 |
| S0-002 | Validate Supabase Broadcast channel performance under full volunteer group simultaneous load during PoC field test. Record fan-out latency, stability. | The Hands | Pending | Pillar II §2, V-004 |
| S0-003 | Confirm react-native-maps performance with N simultaneous moving markers at PoC participant count. Record render stability and latency. | The Hands | Pending | Pillar II §2, V-003 |
| S0-004 | Confirm Expo Development Build sideload process on target Android devices before field test day. | The Hands | Pending | Pillar II §1 |
| S0-005 | Wire Support Beacon latency instrumentation: client-side timestamp at trigger (rider device), timestamp at receipt (Captain/SAG device), delta logged. Required before PoC field test. | The Hands | Pending | Pillar III DoD-05, SD-016 |
| S0-006 | Implement in-app explainer shown on first ride join — plain language, one-time, dismissible. Explains Foreground Service Notification consequence of dismissal. | The Hands | Pending | Pillar II §2, SD-009 |
| S0-007 | Implement OEM battery optimisation exclusion prompt on first ride join — OEM-specific instructions where possible. | The Hands | Pending | Pillar II §2, SD-010 |
| S0-008 | ThemeProvider library selection and implementation — React Native Paper, custom context, or equivalent. Fetches primary_colour, accent_colour, logo_url from tenants table at app init. | The Hands | Pending | Pillar II §5.2, SD-014 |
| S0-009 | [DELETED - 2026-09-13] Rail 3a Brain session — guest join flow resolution. Parking lot QR, email capture, one-ride session, account promotion path. Required before Rail 3a production build. **DISCHARGED, not deferred.** Its entire subject was Rail 3a production guest join; under R-GUEST as amended there is none. The guest model is closed at Charter level and the registration surface is Rails 1 and 2 work (§14 item 18). | Brain | **Discharged 2026-09-13** | Pillar III PDoD-03 (discharged), SD-008 (superseded) |
| S0-010 | [DELETED - 2026-09-13] Rail 3a Brain session — F-07 resolution: Support Beacon visibility to other riders. **DISCHARGED:** ruled at arc close; no Brain session required. | Brain | **Discharged 2026-09-13** | Pillar III PDoD-04, F-07 (both discharged) |
| S0-011 | [DELETED - 2026-09-13] Rail 3a Brain session — F-08 resolution: Dark state last known position retention beyond Hard Purge. **DISCHARGED, not deferred.** The committed text already answered it; no Brain session is required. | Brain | **Discharged 2026-09-13** | Pillar III PDoD-05, F-08 (both discharged) |
| wTBD1 | Rail 3 BDD survey and drift-finding input. First ticket proposed under the wTBDn convention. Returned as the survey artifact carrying thirty-six scenarios (R3-37 to R3-73, R3-64 retired) and drift findings (a) to (g), which the G33 arc consumed at the slate 14 enshrinement pass. Thirty of those scenarios are now committed in Pillar III. If the real W-number substitution was not recorded at ticketing, record it retrospectively. | The Hands | **Delivered** | Pillar III §2; Pillar IV §8.4 slate 14 |
| wTBD2 | Saver-at-start measurement. Measure engine start to first accepted fix under Android Battery Saver. Report the distribution, not a sample: Saver on versus off (off is the control), cold versus warm start, per device and Android version, recording device model, OEM, Saver state, indoor or outdoor, and time to first fix, plus any run that produced no fix at all and how long it ran. Returns a Decision Brief recommending **two** values per the Session D scope extension: the startup clock ceiling as originally scoped, and a proposed steady-state threshold derived from the same run data. Out of scope: do not tune, fix or work around the startup delay, do not select the threshold, do not edit the Pillars. Log the work in `log_of_changes.md`. Done when the Brief is delivered and the Senior PM confirms both values. Assign the W-number and record the substitution. | The Hands | Pending | Pillar IV §8.3 D4, §8.4 wTBD2 scope extension, §12.2; §14 item 9 |

---

## §7. Ledger Receipt — Full Day

| Version | Date | Time | MACD Action | Decision | Trio Lead |
|---|---|---|---|---|---|
| v0.1.0 | 2026-05-12 | AM | ADD | Rail 3 Pillar set initialized. Platform strategy session complete. SD-001 through SD-007 committed. R-001 through R-003 logged. LOE captured. | TPM |
| v1.0.0 | 2026-05-12 | EOD | ADD | All four Brain sessions complete. Pillar I (v1.0.0), Pillar II (v1.0.2), Pillar III (v1.0.0) promoted to COMMITTED. SD-008 through SD-016 committed. F-07 and F-08 formally flagged as pending. Sprint 0 tasks S0-001 through S0-011 captured. Pillar IV promoted DRAFT → COMMITTED. | TPM |

---

## §8. G33 Arc Decision Record

Forty-four rulings across Sessions A, B, C and D, plus the rulings taken in the MACD sessions themselves. All are Senior PM rulings unless marked otherwise. Closed. Flag conflicts rather than absorb them.

### 8.1 Session A (four rulings)

**A1, guest boundary.** The PoC was not exposed to guests. Observed guest rows are records produced by the existing portal add-guest capability, not captain-seeded test data. The captain-seeded characterisation carried into Session A from the 2026-07-30 ruling is corrected.

**R-GUEST, guest access model (Charter level).** Guests are portal-side participants only: roster presence, no native app, no fleet map render. Native app access is a benefit of club membership, entitled at tenant level. Registration and affiliation is the conversion path. Amended in the MACD session by D-QR-5. Verbatim receipt at §11.

**A2, ride-end reachability.** Teardown and notification are separate axes. Engine teardown reaches every participant device regardless of app state; the in-app ride-end notification stays foreground-only and is never a teardown precondition. Teardown fires only on an affirmative read of persisted ride status Saved, never on Captain departure, app shutdown, or channel loss. Enshrined in Pillar III R3-69.

**R-S17, partial fleet representation.** Superseded by slate 17. The map coverage chip, its additive arithmetic reading, its suppression at zero, its Captain and SAG scoping, its display-only property and its never-reclassifying denominator constraint are all retired. Surviving unchanged: partiality is a property of the ride rather than of a rider; roster-only participants are a structural and permanent population; the roster is the authoritative participant record; the fleet map is a declared partial projection; the single no-app class taxonomy with no iOS-specific treatment; the roster button retained as entry point for all roles.

### 8.2 Session B (ten rulings)

**A3, stale and self-health. Accepted, scope-reduced.** Not a fifth fleet state. No ladder change, no sixth swatch. R3-41, Captain and SAG stale distinction, is survey-only and is not enshrined. R3-40, rider self-health warning, is enshrined: a binary overlay on the rider's own blue dot, additive, anchored to live GPS always, carrying state only and never a second position. The rider surface renders exactly one position, ever; stale-position display is a navigation hazard and is ruled out. On the command surface the stale overlay renders only in coincidence with Beacon Active, never as general fleet state. Notification is an unlock-and-focus prompt issued only while the condition persists and the rider can act. Self-heal is silent, with no post-heal message. Two clocks: steady state counts from last successful fix; startup counts from engine start, bounded by a measured ceiling.

**D-G33-A3-01, badge geometry. Ruled by Design, passed to the Hands.** Static badge, upper right at roughly 1:30 to 2 o'clock, screen-anchored so it does not rotate with map bearing, non-concentric because the beacon pulse and OS accuracy halo own that channel, above the beacon pulse in z-order, fixed colour outside tenant theming and distinct from beacon colour, no animation, roughly half marker diameter with a legibility floor. Suppressed only while the marker is collapsed into a cluster at low zoom. Self clusters like any other marker, no extraction. Exact dp and colour token are a design pass.

**A4, periodic last-known write. Accepted, ratified as a named exception.** Last known is a first-class fallback to live and renders on read-channel activation until live arrives. Single-row overwrite, never accumulated: that is what keeps it a position rather than a trail. Cadence bound stated as a shape, a ceiling for privacy and a floor for fallback quality; the value is a Hands item (§14 item 21). Verification finding recorded: Pillar II §2's Inherited Tables line already permitted ride_participants location writes while the meaningful-events line forbade them. Reconciled at MACD as a named exception.

**B1, layer 3 recovery. Accepted, split. autoSync excluded.** Device-side native heartbeat and headless task proceed now; the licence is held and nothing shared is touched. Server-side staleness detector and FCM wake sit behind B2's scheduler, with the detector reading last_ping under the A4 exception and adding no new persistence. autoSync is excluded by ruling: it persists per-rider location trails server-side, breaching the ephemeral-pings commitment; it addresses transport failure while the engine works, not engine death; and its one honest use, leader breadcrumb continuity under process death, is retired by C1's ruling that gaps are acceptable. R3-48's invariant and R3-40's cause clause take final wording from device-side findings; R3-40 carries a PENDING flag in Pillar III v1.1.0 accordingly.

**B2, lifecycle machinery. Accepted, split three ways.** A ride closes when its Captain ends it, with End Ride available to every Captain on the ride. The backstop is inactivity only: no pings from any participant for N hours, tenant-configurable. No wall-clock sweep. Midnight UTC, committed in the C2 container diagram, is superseded; 3am UTC was considered and withdrawn, because a global product carries no safe wall clock. The scheduler carries three jobs: auto-start, inactivity auto-close, purge. Purge scope extends hard purge to Rail 3 tables and to ride_participants location fields, with rail3_breadcrumb surviving per C1.

**B2 known gap, paired with the twelve hour envelope.** A device still pinging after its rider went home holds the ride open. Recorded as a known gap rather than papered over. A duration-cap parameter is available to this Ledger if field data warrants it. It is paired here with slate 1's twelve hour design envelope because the two are the same question read from opposite ends: the envelope forbids any architecture assuming a ride ends by a particular time, and the known gap is the cost of honouring that. Taking the duration cap would reintroduce a wall clock the envelope's second clause forbids, so it is available only as a parameter on evidence, never as a default.

**B3, screen-lock Battery Saver check. Accepted, restore.** Restore the wiring. R3-49 holds: prompt, never a precondition. Collision ruled: at unlock the self-health notification takes precedence; the Saver advisory suppresses while it fires and stands alone when Saver is on but tracking is healthy. Device advisories sit outside Pillar II §5.1's live-ride alert prohibition.

**C1, breadcrumb. Accepted. Dissent recorded, see §9.** The breadcrumb is an autonomous club record of the ride, decoupled from personal identity, and survives the Hard Purge as a club-owned artifact, companion to the AI ride summary. Ownership: the Captain who starts the ride is the breadcrumb owner, sole and non-transferable, for the ride's duration. If that Captain departs and returns, capture resumes; the gap is acceptable and intended. Read-side backfill enshrined as expected behaviour: fetch on open and resume when not rendered locally, live tip extension from position broadcasts, distinct from the excluded write-side autoSync. Honesty constraint: the roster is retained and the ride names its Captain, so the surviving breadcrumb is pseudonymous, not anonymous, and is re-linkable by anyone with club access. Frame it as an artifact-class change, a person's trail becoming a ride's route with no identity fields in the table; do not claim non-attributability. The Captain accepts attribution by starting the ride, and the documentation says so. Retention becomes two-class: T+4h personal data, purge-exempt club artifacts. AI summary generation sequences before any scrub that touches its inputs.

**C2, roster page. Accepted, enshrined, with correction.** Enshrined in Pillar II §3 feature index and §4.1 matrix at current role gating. Correction over the build and over the first receipt: guests are not excluded on the roster. The roster is the complete participant record including guests, marked as non-app users, visible to Captain and Support; guests see the roster via their PWA-only access; guests never render on the map. The roster deliberately diverges from the map on guest inclusion and the matrix row states the divergence. Purpose recorded: the roster extends safety functionality to non-app users and non-broadcasting riders. It is the safety floor. Every failure mode ruled in the arc degrades to "call them", and the roster is where that path lives; it is also what makes inactivity-only auto-close safe. The dependency is stated in Pillar II so the phone column is protected from future removal.

**C3, departure. Accepted, enshrined as a first-class action.** Navigation off the map is the deliberate invocation. Leaving the map means leaving the ride. Teardown as built is committed: engine stop, depart broadcast, last_* null-out, roster marked departed, rejoin available. No confirmation gate. No rider's departure, including the Captain's, ends the ride for others: Leave is individual and universal, End is the explicit Captain close.

**D1, account-swap phantom. Accepted as a ticket.** Departure invoked on the auth transition, fire-and-forget, never blocking the swap. Extended by R3-58 and slate 11: departure executes before session end, and the roster cache clears after departure, never before.

**D2, ride-list window. Accepted, corrected; final model.** The list shows rides in the next 24 hours as a rolling window, not calendar-today, so an early morning ride is visible the evening before. No multi-day browse; discovery is Rail 2's job. RSVP is a planning action signalling intent; Join is the single runtime action confirming active riding, taken at the venue. No RSVP-to-roster conversion exists or is wanted, so every roster row is a confirmed rider. Rides auto-start around an hour before schedule. A Captain may start an ad-hoc ride. Join is legitimate from both PWA and app. Engine start ties to ride start and device engagement, never to join alone.

### 8.3 Session C (thirteen rulings)

**D3, dead code removal. Accept.** No standalone deletion pass. Removals fold into the B3 Battery Saver restoration ticket so code being restored is never deleted by mistake. Removals narrow to lastStatus plus post-restoration residue. autoSync residue is named removable per the B1 exclusion, so future contributors cannot wire up what a ruling closed.

**D4, Saver-at-start measurement. Accept.** Ticketed as Sprint 0 measurement task wTBD2. Measures engine start to first accepted fix under Android Battery Saver as a distribution, not a sample. Output is a Decision Brief with a recommended ceiling. Senior PM confirms; the value lands here, never in Pillar III. Scope extended by Session D, see 8.4.

**D5, stopTimeout versus Inactive desync. Accept, documentation-level.** Two independent five-minute timers, engine stationary detection and UI Inactive rendering, coincide by accident. They answer different questions and may legitimately diverge; the failure is that nobody knows they interact. Coupling stated in the Pillar II §3 Feature 4 threshold table, including what drifts if set independently. No code, no ticket.

**Slate 1, ride-duration envelope. Accept. Charter level.** Twelve hour design envelope: the app must sustain continuous tracking for twelve hours, and nothing in the architecture may assume a ride ends by any particular time. The second clause forbids reintroducing any wall clock and is consistent with inactivity-only close. Battery target and power posture re-derive from the envelope in Pillar II. The envelope makes the rider-facing battery conversation real rather than theoretical.

**Slate 2, power posture during active rides. Defer, with trigger.** D88 force-track versus D90 stopTimeout-stationary remains undecided. Current build behaviour stands as the interim posture, recorded as interim. Both remain live inputs, neither superseded. Reopens on ride-test evidence from the Racer Sportif trial only: battery outcomes across trial rides, or any dark-rider incident implicating the posture. **Argument alone cannot reopen it.** Both evidence outcomes are wins: an implicating incident flips toward liveness; quiet accumulation means the interim posture is fine and the session may never be needed. Candidate design parked: duration-adaptive posture, liveness early, stationary-tolerant late, crossover configurable, reshaped by the twelve hour envelope. The always-on telemetry tier ruled at slate 6 is what makes this trigger reachable.

**Slate 3, background wake and recovery. Accept, settled by B1, one addition.** The FCM wake path is built as a general server-to-device wake channel, sized for staleness recovery now, architecturally open to teardown reachability (R3-69, slate 13) and SOS push (O-08) without pre-ruling either. Consumers scoped to ride-integrity functions for Rail 3. General push messaging is recognised as a possible future consumer of the same infrastructure, not committed; that is a product-level decision outside Rail 3.

**Slate 4, self-health thresholds. Accept. Rules, not values.** Both clocks committed as rules. Tenant exposure explicitly declined: no club admin can reason about these numbers, and a wrong value either spams false warnings or silences a safety signal. Operator-level configuration, server-side, adjustable without an app release, keyed per platform. Startup clock: measured Saver-at-start ceiling from wTBD2 plus a stated margin. Steady-state clock: above normal fix cadence, gated above the Saver-at-start window. Android values proposed from wTBD2 and Racer Sportif trial evidence, Senior PM confirmed, recorded here. **iOS key reserved, empty**, populated by an equivalent measurement pass when the iOS rail opens; Battery Saver does not exist on iOS and distributions will differ. Rules stated once in Pillar III, platform-independent; only values are per-platform.

**Slate 5, stale versus Dark presentation. Accept, settled by A3.** No new presentation. Fleet ladder unchanged: moving, stopped, Dark. The declined option was a fourth rung insertion, not a reduction. Packet consequence found and applied at the walk, see 8.4 packet 7.4.

**Slate 6, telemetry as requirement. Accept, Senior PM amendment, two tiers.** Telemetry becomes a Pillar II requirement: operational self-reporting covering engine lifecycle events, fix gaps, warning firings, wake attempts and outcomes, teardown completions. Scope boundary: device operational state, never rider position history; the position-trail prohibition is stated in the requirement, the same line A4 and the autoSync exclusion drew. No rider-facing surface; invisible to every persona. Senior PM amendment: telemetry is switchable, not continuous. Two tiers rather than one switch: an always-on tier carrying cheap counters only, engine started, engine died, warning fired; plus the operator-switched full-capture tier, a test-and-calibration mode for intense ride testing, never a permanent stream. Rationale on record: slate 2 and slate 12 both defer on field-evidence triggers that fire during unplanned incidents. With a single switch, an incident occurring with the switch off produces no record, the trigger cannot fire, and the deferral never resolves. The always-on tier is what makes this arc's deferrals reachable.

**Slate 7, missed-while-dead reconciliation and the beacon horn. Accept, narrow.** Beacon state gets a durable current-state read path; general position reconciliation beyond last known stays parked with D72. Beacon status lives on the participant record, read on focus and channel activation, superseded on clear; no event history, no replay. Raising a beacon forces a last-known position write in the same breath, so the alert always has a position to anchor it. A returning device renders the beacon at last known with the stale overlay until live supersedes. Safety asymmetry decided it: a missed position costs nothing; a missed beacon is the app failing at the one moment it exists for.

**Slate 8, cross-surface session handoff. Accept, Senior PM override on routing.** The Senior PM overrode the Trio's defer-to-substrate recommendation: the experience is Rail 3's to commit now; only token plumbing goes to the substrate pass. PWA and native remain separate session containers by platform design, committed to behave as one identity. PWA to native is the key moment: a deep-link token carries ride context and auth across the crossing, built and tested to the ride-start friction budget. Native to PWA deprioritised: silent re-auth covers it opportunistically, no dedicated build, no scenario, no test priority. QR discarded, because it hands sessions between people and this is one rider across two surfaces. Three Senior PM scenarios enshrined verbatim in Pillar III v1.1.0 as R3-75, R3-76 and R3-77; they supersede R3-61, which is tagged and retired.

**Slate 8 rider, phone visibility. Accept, Senior PM, non-negotiable.** Leaders' name and phone are visible to every roster viewer, including PWA-only riders. This enshrines existing build behaviour. The §4.1 matrix under-described it: its "phone visibility Captain and SAG" was the leaders-see-riders direction only, wrongly read as exhaustive, the same failure class as the guest null-check. Matrix row amended to state both directions explicitly: leaders see everyone, everyone sees leaders. Rider-to-rider contact stays parked with O-07.

**Slate 9, command-coverage bundle. Accept, captainless-degraded.** No role transfer on Captain departure, no promotion, no designation ceremony; transfer was declined outright. The ride survives per C3; roster, map, SOS and the Support surface all continue under existing role envelopes. Degraded means nobody holds Captain powers, not that surfaces vanish. End Ride: any Captain on the ride; if none remains, the ride closes by the inactivity backstop, which was designed to make exactly this safe. Breadcrumb capture stops on owner departure per C1 and resumes on return. Trace auto-switch unparked for this single behaviour: breadcrumb viewers move to route overlay on Captain departure, cue framed as Captain-departure news, never silent. A returning Captain restores everything. The one-role-envelope principle survives intact: nobody's powers change mid-ride. Rationale for declining transfer, recorded: transfer ceremonies fire at the worst moment, and auto-transfer grants unaccepted command.

### 8.4 Session D (seventeen rulings)

**Slate 10, breadcrumb design residue. Accept as staged.** Closed as settled by C1, whose committed language is the holistic answer: one breadcrumb per ride, with a visible hole where the Captain was away, rather than a fresh trace on return. Start-fresh is rejected as contradicting C1. Cosmetic residue ruled with it: the gap renders as a visible break, never interpolated or smoothed, per the C1 honesty constraint. R3-72 is now fully traceable and slate 10 dies as an open item.

**Slate 11, roster viewability window. Accept ride-scoped only.** The Rail 3 roster is available while the ride is live and through ride end, and goes with the ride. No historical roster browsing, no roster for rides the viewer is not on. Rationale: C2 recorded the roster's purpose as a safety floor, reach into this ride's participants, and that purpose expires when the ride does. A roster that persists past the ride is a club member directory with phone numbers in it, which is a different product and a portal-side decision. **Scope boundary, stated explicitly at Senior PM instruction:** this ruling governs the Rail 3 roster surface, including its PWA rendering under slate 8 scenario three. It does not touch, amend or constrain roster views committed in Rail 1, Admin Portal, or Rail 2, Rider Desktop Portal. Those behaviours stand untouched. Forward note: what closes at ride end is the surface, not the underlying participant record. A future consumer such as an AI ride summary reads the durable participant record, governed by B2's purge scope, and does not require this surface reopened.

**Slate 11, offline roster cache. Accept. Single-slot, resilience only.** Device-local cache holding exactly one ride, the most recent this device joined. Cleared by supersession on the next join, and by auth transition per D1. Cleared by nothing else; departure does not clear it. No TTL, no scheduled sweep, no scheduler interaction. Correction taken in session: the first Trio recommendation cleared on departure per C3, which was wrong and reintroduced the exact stranding it was meant to prevent, since a rider who leaves and rejoins or is bounced by an OS kill would lose the roster at the worst moment. Storage must be durable, not in-memory: process death mid-ride is the named failure vector in this domain and would wipe an in-memory cache. Contact fields live in encrypted device storage. Renders from cache are marked last-known rather than live, per the A3 honesty register. Privacy ratification recorded on the narrow reading: device-local, one ride, no position data of any kind, server-side Hard Purge commitments untouched. Volume is bounded by construction rather than by policy. Post-ride viewing explicitly declined; the surface closes at ride end even though the bytes persist.

**Slate 12, seed-to-live ceiling, R3-62. Accept. Invariant to Pillar III, number here.** See §12 for the target, criterion and trigger. Principle recorded and applied three times this arc: **unmeasured numbers do not enter Pillar III.** Consistent with slate 4 and D4. Provenance correction: the seed attributed the underlying ruling to Session B; its actual source is the seed-until-live ruling in the Brain-session companion section 5, dated 2026-07-27, which predates Session A.

**Slate 13, ride-end teardown reachability, R3-69. Accept convergent teardown.** Teardown is convergent, not message-dependent. Server-initiated wake over slate 3's general channel is the fast path, with bounded retry sized and scheduled per B2. The device carries an independent check firing on connectivity resumption or app focus, reading persisted ride status and tearing down on an affirmative Saved. This applies A2 device-side rather than adding a mechanism; the check hangs on B1's heartbeat. No rider-facing surface beyond the foreground service notification clearing, which must not announce itself as a recovery. **Accepted limit recorded:** a device with neither connectivity nor app focus continues until one of those changes, bounded only by the inactivity backstop and the rider's return to signal. Not closable by design.

**Slate 15, platform-substrate home. Accept. Routing line.** Supabase Auth contract, token lifetime, refresh, RLS interaction, and the session-handoff contract all route to the G33 successor's definition pass. The fifth Pillar set versus shared-substrate section question is decided there, not here. Slate 8's committed handoff experience travels as a constraint the token mechanics must satisfy, not a question they may revisit. Rail 3 owns session-lifecycle conduct only. Cargo carried: slate 11's roster cache is keyed to identity and clears on auth transition, a Rail 3 behaviour requiring nothing from the substrate pass, but the pass should hold the fact when it defines the auth contract.

**Slate 16, presentation window. Skip. Settled by D2.** Twenty-four hour rolling window per D2. There is no separate presentation window to decide.

**Slate 16, visual treatments. Accept.** Started versus scheduled carries the visual weight, because it is the distinction that changes what the rider does next. RSVP'd versus not is a quiet secondary mark rather than a treatment, since RSVP carries no runtime consequence and dressing it up implies a gate the committed RSVP ruling explicitly removed. Binding constraint holds: treatments never affect joinability.

**Slate 16, joinability threshold. Accept, amended in session.** Joinability binds to the started state. A ride is joinable from the moment it enters that state, whichever path put it there, the auto-start job at roughly an hour before schedule or an ad-hoc Captain start at any time, and remains joinable until the ride closes. Before that it renders as scheduled with RSVP available. Joinability reads the state rather than computing an offset from schedule time, keeping a single threshold rather than two that must be held in agreement; the two-timer failure class named by D5 is the rationale. Correction taken in session: the first statement anchored joinability to the auto-start job by name and omitted D2's ad-hoc Captain start, which would have left a Captain-started ride live on the map and closed to joins. Caught by Senior PM; anchor moved from the job to the state. Design consequence: the visual transition and the behaviour transition fire at the same instant, so no ride is ever styled as live while closed to joins, or as scheduled while quietly open. Consistency check against Session A: presentation is D2's twenty-four hour rolling window, joinability is the started state. Two knobs, distinct, as Session A required. Recorded as a gap closed in D2, not a change to it.

**Slate 17, partial fleet representation. Amend. Session A R-S17 chip superseded.** The partial-representation fact expresses per participant rather than as an aggregate count. Each roster row carries whether that participant is app-tracked or roster-only. Roster-only is a permanent state, guests and non-installing members and every iOS rider until Rail 3b, and is distinct in treatment from an app participant not currently producing a position, which stays with the fleet ladder and is not duplicated into the roster. Senior PM reasoning on record: an aggregate count tells the Captain a number is wrong without telling them who, and the recovery action is per-person. It also implies a mid-ride pause that will not happen. A named list answers both questions in one glance. C2's roster matrix partiality column reservation stands unchanged as the Bedrock declaration of the roster-versus-map divergence.

**Slate 6, telemetry tier question. Accept two tiers.** Ruled at Session D, substance recorded at 8.3 slate 6 above. Scope and retention resolved at MACD, see 8.5.

**wTBD2 scope extension. Accept.** The wTBD2 Decision Brief returns two recommended values: the startup clock ceiling as originally scoped, and a proposed steady-state threshold derived from the same run data, since the distribution yields normal fix cadence alongside the Saver-at-start window. Both are proposals; the Senior PM confirms both; both land here, never in Pillar III. Racer Sportif trial evidence then confirms or corrects real numbers rather than filling blanks. The measurement scope itself does not change, only what the brief reports. Avoided outcome, recorded: shipping the field trial on a guessed steady-state threshold.

**R3-58, sign-out. Accept. Sign-out fires departure, ordered before session end.** Sign-out fires departure per D1, and departure executes before the session ends. The ordering is the load-bearing part and must be stated, because the reverse order is the defect: departure requires an authenticated session to write the roster state change and complete the R3-67 teardown, and tearing the session down first leaves the departure without credentials, producing exactly the phantom D1 was ruled to close. Fire-and-forget per D1 holds and is not in tension with the ordering: it means not waiting for acknowledgement, not licence to fire after the identity is gone. The PoC already implements this ordering, so this enshrines built behaviour rather than requesting new work. Contradiction resolved: R3-58 as authored in wTBD1 stated that no ride action is triggered by sign-out, and companion section 5 recorded sign-out as session-only; D1 superseded both. Consequence for slate 11's roster cache: the cache clears on auth transition, which sits after departure in the sequence, stated so the Hands do not clear the cache first and strand the departure.

### 8.5 MACD session rulings (2026-09-08 and 2026-09-13)

**Deviation on record.** The session-one seed instructed that no new decisions be taken and that authoring gaps be surfaced and stopped on. The QR thread produced a gap with no answer in the decision record. The Senior PM instructed that it be decided in-session rather than routed to a dedicated Trio session. Recorded as a deliberate deviation, not a process failure. All D-QR rulings below are stamped 2026-09-08.

**D-QR-1. QR is not a member ride-join path.** Slate 8 stands. R3-68's struck QR parenthetical stays struck. Members join in-app. Nothing is gained by a QR path an authenticated member does not need, and reopening a closed ruling for no gain was declined.

**D-QR-2. A QR is the guest's delivery path to the PWA roster page.** R-GUEST commits that a guest sees the PWA roster page for their ride but never states how the guest reaches it. With no email and no account there is no link to send. The QR fills that unstated gap. It carries no identity across a surface boundary, so R3-61's origin-independence commitment is untouched and slate 8 is not engaged.

**D-QR-3. The Captain displaying the code is the authorisation gate.** Engineering raised that a QR is a photograph, that the roster carries leaders' phone numbers visible to all roster viewers by non-negotiable Senior PM ruling, and that an unbound URL would publish those numbers to anyone who scans or is forwarded the image. Resolved by authorisation rather than by token design: the ride's leadership decides who may join by choosing to show the code. Composes with slate 11, roster viewability window, at no cost: the roster surface closes at ride end, so a photographed URL is live only for that ride's duration.

**D-QR-4. The guest self-registers through the leader-shown QR.** Name and phone. The guest creates their own roster row on scan; the row is not portal-created. Showing the code is the club's authorisation, preserving R-GUEST's commitment that the club remains the authorising party. Ruled after an initial ruling of the opposite option, which the Senior PM's subsequent description contradicted; the Agent surfaced the mismatch rather than absorbing it. The self-registration surface is Rails 1 and 2 work, consistent with R-GUEST's own out-of-scope list.

**D-QR-5. Guest capture takes email, optional. R-GUEST's no-email commitment AMENDED.** Reversal recorded in full, because the path matters. R-GUEST committed guests as name and phone, no email, restated in its Rails 1 and 2 list. The Agent raised this as a blocking Contradiction Detection when email was floated, on the grounds that no-email is load bearing to R-GUEST's architectural argument line, which rests on R3-60: Rail 3 binds to an existing identity and creates none. The Senior PM first ruled option (b), confirm the Bedrock, no email. The Senior PM then reversed, ruling that email is optional at guest entry and that where supplied a signup email is sent. **Final ruling as it stands:** guest entry takes name and phone mandatory, email optional; where an email is supplied the signup email sends; email confirmation never gates joining or riding; the PWA roster page carries a signup link as a second conversion path for guests who decide later; a guest who takes neither path rides as a guest, undegraded. **Guard clause**, authored into Charter §4 at Engineering's request and Senior PM confirmation: any email held against a guest record is a conversion payload, not an identity. It authorises nothing and creates no account, per R3-60. This is what keeps the identity fork closed now that an account key can sit in a guest record. Both the (b) ruling and its reversal are recorded here deliberately, so the path is visible rather than the final state appearing to have been obvious.

**D-QR-6. One code, credential-routed. Member branch left unruled.** The QR is a single code; the scanner's credentials determine the destination. A scanner without an account reaches guest self-registration. What a member scan resolves to is deliberately left unruled, so D-QR-1 is not reversed in a text-authoring session and the credential check stands as the extension point for later surfaces. Design raised and then withdrew an objection that credential-dependent behaviour is opaque to the leader holding the code, withdrawn on the grounds that the scanner always knows which branch applies to them. Residual, retained: if a scan fails, the leader cannot see why. Support-path concern, not a design flaw, and applies to any QR.

**D-QR-7. QR display is Captain and SAG. Rider excluded. Pillar II v1.0.0 "all roles" ruling amended.** Raised as a blocking Contradiction Detection at the Pillar II handshake: committed §3 Feature 3 and §4.1 granted QR display to all three roles, which made D-QR-3's authorisation gate false. Senior PM first ruled Captain only, then one turn later restored SAG, on the grounds that SAG in a vehicle is the leader actually available to a latecomer. Rider stays excluded because an arbitrary rider authorising strangers onto a roster carrying leaders' phone numbers is the exposure case; two named leadership roles is not. D-QR-3's gate widens accordingly: the ride's leadership authorises, not the Captain alone. Consistent with the matrix pairing Captain and SAG on every situational-awareness capability. SD-012 above is tagged superseded by this ruling.

**D-QR-8. The shared code carries the routing.** Committed Pillar II §3 states the Rail 3 QR is the same code Rails 1 and 2 generate for that ride. Senior PM ruled: the shared code already resolves by scanner credentials; Rails 1 and 2 own the resolution logic; Rail 3 displays it. Line stands unamended. Hands item 19 carries the verification that every branch reaches a defined destination.

**Accepted limit, guest QR exposure.** Within a live ride, a forwarded photograph of the code reaches the roster. Exposure is bounded by time via slate 11, not by person. Recorded as an accepted limit rather than papered over.

**Telemetry scope and retention. Trio guidance, Senior PM approved.** Slate 6 and Session D ruled two tiers and an operator-level, server-side, per-platform switch, but left unstated the scope of full capture when on and the retention class of either tier. Trio proposed, Senior PM approved: full capture scope when on is per ride, with the operator flag naming the ride and capture running engine start to teardown for every device on it; fleet-wide capture is out, as it would be the permanent stream slate 6 ruled against. Full-capture output is attributable per-device operational history, personal-data class, T+4h Hard Purge from ride close; export before purge if wanted for calibration, purge is the default and export is the act. Always-on counters survive the purge with identity stripped at T+4h, keyed to ride, platform and device class, with account and participant identifiers scrubbed, the same pattern as the breadcrumb. Engineering's reasoning: the tier exists so an unplanned incident leaves a record, and purging at T+4h defeats it, but the counters are per-device and therefore attributable.

**Slate 17 verification resolved: extends ruling C2's mark. Single state, population widened.** The question was whether slate 17's per-row participation state extends ruling C2's committed non-app-user mark or adds a new state. Finding: the mark was never committed text. Ruling C2, roster page, accepted it and queued it for MACD; committed Pillar II §3 had no roster feature and committed §4.1 had no roster row. Reconciled against the two rulings rather than against committed text: ruling C2 marks guests as non-app users; slate 17 marks every row app-tracked or roster-only with roster-only's population being guests, non-installing members, and every iOS rider until Rail 3b. Same binary, wider population, one state, per slate 17's own single no-app class taxonomy. Both authored together in the Pillar II §4.1 ROSTER section.

**Amendment Protocol assessed and NOT triggered. Reasoned decline.** Session A anticipated the Amendment Protocol would trigger on the Charter's guest access change. Assessed at MACD as not triggering. Grounds: Pillar V is a Hands-originated instrument for surfacing execution pivots to an absent Brain. This was the Brain amending its own Charter by ordinary MACD with the Senior PM present. Senior PM confirmed. Recorded so the Session A note does not read as a skipped step.

**R3-36 guest retention, contradiction closed (2026-09-13).** R3-36's committed clause read "And guest account records are retained", which asserted retention of a record type the amended guest model says does not exist. Parked as unresolved out of session two under AMIP option (c). Senior PM ruled option (a) at session three: the clause is amended to name guest roster records rather than accounts. Guests hold no account per Charter §4 at v1.1.0 and per D-QR-5's guard clause. The roster record is the retained artifact. Committed in Pillar III v1.1.0.

**F-08, Dark state last known position retention. DISCHARGED 2026-09-13. Not a new decision.**

F-08 was flagged at v1.0.0 as a Pending Brain Decision: is the Dark-state last known position retained beyond the Hard Purge, or purged with all other location data? It is discharged as **purged, with no exemption.**

Three committed sources answer it and always did. Pillar III R3-36 has listed last_lat, last_long and last_ping among the fields permanently deleted from ride_participants at T+4h since v1.0.0, which is precisely the data the Dark state renders. B2, lifecycle machinery, reaffirmed this by extending hard purge scope to Rail 3 tables and to the ride_participants location fields handed to it by A4. And C1, breadcrumb, established the two-class retention model and enumerated its single exemption: rail3_breadcrumb, as a club-owned artifact carrying no identity fields. Dark-state last known is per-rider position data and therefore sits in the personal-data class by definition.

Nothing in the arc grants it a second exemption. Granting one silently would be exactly what C1's honesty constraint exists to prevent, and it would reopen the position-versus-trail distinction A4 and the autoSync exclusion both drew.

Recorded as a discharge rather than a ruling, because the Brain was not required to decide anything: the question had been answered by committed text and stayed flagged because nothing forced a re-read of the pending list against the Bedrock. Taken on Senior PM instruction at arc close. The related PDoD-05 pointer and S0-011 Sprint 0 task are discharged with it.

**F-07, Support Beacon visibility to other riders. RESOLVED 2026-09-13. Captain and SAG only.**

Flagged at v1.0.0 and untouched by the entire G33 arc. Ruled at arc close: beacon state is visible to Captain and SAG only. Other riders never see another rider's beacon. The beaconing participant continues to see their own icon in the alerted pulsing state.

Senior PM reasoning on record: opening beacon visibility to all riders would change the privacy rules governing what one rider may learn about another, and that is a larger change than the feature appears to be. The conservative setting is the safer default. If real-world use shows it wrong, it can be widened.

The Trio notes, and the Senior PM accepted, that this asymmetry is deliberate and worth stating: widening is the change that will need justifying later, not keeping it narrow. A narrow default that proves insufficient surfaces as a feature request; a wide default that proves wrong surfaces as a privacy incident. Recorded so a future session does not read the narrow setting as an unconsidered legacy.

Consistent with the committed §4.1 matrix, which already gated "see pulsing beacon icon (others)" to Captain and SAG, and with the roster's safety-floor purpose: the rider-facing degradation path is phone reach through the roster, not peer surveillance. Rider-to-rider contact remains parked with O-07 on the same reasoning.

Discharged in Pillar III v1.1.1: PDoD-04 struck, both `[PENDING — F-07 Brain Decision]` markers struck at the §2 Global Rules entry and at inherited Scenario 22, lifting the build-and-test gate. S0-010 discharged at §6 above.

**Hands item 22, threshold configuration owners. RULED 2026-09-13.**

The question was why Feature 4 fleet-state thresholds are tenant-level while slate 4's self-health clocks are operator-level, server-side and never tenant-exposed. They sit close together in Pillar II with opposite owners and nothing said why.

Ruled: the two are different classes of number.

Fleet-state thresholds are a **presentation preference.** They determine when a marker changes appearance on a Captain's map, and clubs legitimately differ: a racing peloton and a touring group that stops at every café want different stopped thresholds. A wrong value degrades glanceability, visibly, and the club retunes it.

Self-health clocks are a **safety guarantee and an evidence instrument.** A wrong value silences the one signal telling a rider they have gone invisible, and it fails silently rather than visibly. Beyond that, the always-on telemetry tier ruled at slate 6 exists to make slate 2's and slate 12's deferrals reachable through field evidence; if the self-health clock varied per tenant, the warning-fired counter would mean something different in every club and that evidence base would be corrupted. This second reason is architectural rather than a judgement about admin competence, and it is the stronger of the two.

**Consolidation is per platform, not global.** Slate 4 keys the configuration per platform and reserves an empty iOS key because Battery Saver does not exist on iOS and the distributions will differ. A reconciling sentence claiming a single consolidated figure would have led the Hands to build one global value with nowhere to put the iOS number.

**The two clocks do not interact.** Fleet state derives from ping receipt; self-health derives from fix production. Different inputs, no coupling. Stated explicitly because D5's finding was precisely that two independent timers which do interact must be documented, and a reader who has absorbed D5 will otherwise assume coupling here too.

Clause written into Pillar II §3 Feature 4 at v1.1.1. Hands item 22 discharged.

**Sprint 0 and the wTBDn convention. Taxonomy RULED 2026-09-13.**

Raised by the Senior PM at handoff: does the Bedrock make clear that Sprint 0 ticketing is the Hands' job, and are Sprint 0 tasks and wTBDn placeholders the same concept?

Two defects found. First, ticketing in Stride is stated nowhere in the four Pillars. The rule lives in the PTAP framework, which the Hands never receive, because the handoff gives them the Bedrock and nothing else. A coder opening the four files would know the work was theirs and not know where to put it. Second, wTBD2 is described throughout the decision record as a Sprint 0 measurement task but was filed only in §14, outside the Sprint 0 register, under a different ID format, with nothing explaining the relationship. That was introduced by the Pillar IV pass, not inherited.

**Ruled.** Sprint 0 is a phase, expected to carry whatever number of tickets LLD discovery requires; the register is a starting set, not a cap, and the Hands extend it. wTBDn is a suggested sequence representing the tickets Sprint 0 needs. S0-nnn and wTBDn are therefore the same concept under two naming eras rather than two registers, the S0 numbers predating the convention by roughly two months. Ticketing is the Hands' job, in Stride where available, with this register as the source of truth where it is not. The substitution rule stands and applies to wTBDn entries.

Written into the §6 preamble. wTBD1 and wTBD2 registered as §6 rows, wTBD1 marked delivered. §14 item 9 retained as a pointer under Immutable Numbering. No renumbering: the collision was a naming artifact that needed stating, not a structure that needed rebuilding.

---

## §9. Dissent and Correction Records

### 9.1 Dissent carried

**C1, breadcrumb. Senior PM overrode the Trio's purge recommendation.** Recorded here in the fullest form on record, from the Session B summary section 3, and carried unchanged through Sessions C and D.

The Trio recommended that breadcrumb coordinates purge at T+4h with only the derived summary surviving. The Senior PM ruled that the breadcrumb is an autonomous club record of the ride, decoupled from personal identity, and survives the Hard Purge as a club-owned artifact, companion to the AI ride summary.

The Trio's position and the honesty constraint it produced are both retained, because the override did not dissolve the concern: the roster is retained and the ride names its Captain, so the surviving breadcrumb is pseudonymous, not anonymous, and is re-linkable by anyone with club access. The agreed framing is an artifact-class change, a person's trail becoming a ride's route with no identity fields in the table. The documentation does not claim non-attributability, and states that the Captain accepts attribution by starting the ride. No new dissent was recorded in Sessions C or D.

### 9.2 Corrections recorded across the arc

1. **Arc ruling count.** The Session D seed stated twenty-eight rulings for Sessions A through C; the actual figure is twenty-seven. Third instance of a count error in a seed prompt.
2. **Roster cache clear-on-departure.** The first Trio recommendation cleared the cache on departure, reintroducing the stranding it was designed to prevent. Corrected to supersession and auth transition only.
3. **Joinability anchor.** The first statement bound joinability to the auto-start job and omitted D2's ad-hoc Captain start. Caught by Senior PM; anchor moved from the job to the state.
4. **Packet 7.2 stale parenthetical.** Drafted text carried midnight auto-close, superseded by B2. Caught at the walk.
5. **R3-58 versus D1.** wTBD1 and companion section 5 both recorded sign-out as session-only; D1 superseded both. Found during the enshrinement pass.
6. **Enshrinement cut grounds.** Two invalid grounds used in the first pass, corrected on Senior PM challenge; three scenarios restored. Recorded so they are not reused: Hands ownership of a mechanism is compatible with Brain ownership of the obligation, which is the HLD and LLD split, not a reason to drop a scenario; and a soft number argues for stripping the number, not for dropping the scenario. The correct test is that survey-only removes enforcement, not opportunity.
7. **Slate 12 provenance.** The seed attributed the seed-until-live ruling to Session B; its source is the Brain-session companion section 5, dated 2026-07-27.
8. **Slate 17, the material one.** Session A ruled the coverage chip as map chrome with a full specification. The Session C summary condensed that ruling and dropped the map-chrome sentence, leaving placement reading as an open surface question. Session D then ruled the surface without the source text and reached the opposite answer, and the Agent initially declared the apparent conflict dissolved while reasoning from the condensed chain rather than the source. Caught only by the targeted Session A read reserved for close of arc. Two failure points: condensation in the chain, and reasoning from a summary where a source read was warranted. The Senior PM subsequently amended the ruling on its merits, so the outcome stands; the path to it is the finding.
9. **Receipt dates, Session D.** In-session receipts carried 2026-08-08 in error; corrected to 2026-08-10.
10. **Invented date stamp, MACD session one.** The Agent stamped every ruling 2026-09-05 with no source, and the stamp reached committed text in two Pillars before the actual date was supplied. Corrected to 2026-09-08 before the Pillar II bump.
11. **Invented date stamp, MACD session two.** The Agent reported 2026-09-09 at handshake, taken from a container filesystem timestamp on uploaded files and presented as the session clock. It was wrong, and was caught only when Drive metadata contradicted it late in the session. All tags corrected to 2026-09-13 before output. **The container filesystem clock is not a date source.** Two instances of invented timestamps are now on record; the seed rule reads "no invented timestamps of any granularity", and the Agent states at handshake what date it is working from and where it got it.
12. **Inference from a qualifier.** The Agent read "QR handoff was discarded" and recommended that QR-as-join survived, without reading R3-68's primary text. A targeted grep reversed it. Same class as the arc's mis-statement instances: characterisation accepted in place of source.
13. **A/B option labels obscured a ruling.** D-QR-4 was ruled A, then described in terms that were B. The Agent caught it. Option labels should be restated in substance at the point of ruling, not referenced by letter.
14. **Working-record version drift.** The session-one seed carried Pillar II v1.0.3 and Pillar III v1.0.1 as committed. No such files exist. The handshake version check caught it at zero cost.
15. **Folder is not inventory.** Session two concluded two committed Pillars were missing because it searched one folder of two. Both Pillar III v1.0.0 and Pillar IV v1.0.0 existed byte-identical in both folders under different file IDs. Resolved at session three: the Pillars folder is authoritative and the working-folder mirrors are flagged for deletion.
16. **Confirm-gate granularity.** The one-item-at-a-time rule was written for ruling sessions. Applied uniformly to a transcription pass it converted the Senior PM into a rubber stamp, putting bracket escaping and residue logging through the same gate as the session's four real decisions. The Senior PM called this out directly. Fix adopted: if the decision record answers it, the Agent executes and reports in a batch; if the record does not answer it, or two parts conflict, it stops.

---

## §10. Deferred and Parked Register

Finished entries. Items here are closed to argument and reopen only on their stated trigger, where one exists.

| Item | Status | Trigger or condition |
|---|---|---|
| **Slate 2, power posture** | Deferred | Ride-test evidence from the Racer Sportif trial only: battery outcomes across trial rides, or a dark-rider incident implicating the posture. Argument alone cannot reopen it. Full entry at §8.3. |
| **O-07, contact scope (rider-to-rider)** | Parked | Dedicated Trio session. Untouched by the slate 8 phone ruling, which covers leaders only. |
| **O-08, SOS push** | Parked | Dedicated Trio session. Same-day write-back to the Hands confirming parked status is still owed, flagged a third time. Slate 3's general wake channel is architecturally open to it without pre-ruling it. |
| **D72, general position reconciliation** | Parked | Pending Pillar II §2 privacy ratification. Slate 7 carved out beacon state only; the enshrinement pass narrowed R3-55 accordingly. |
| **C3 parked modal** | Parked | Confirmation modal on Captain leave offering End Ride. Requires a Pillar II §5.1 confirmation-gate amendment if taken; declining it leaves like any rider, which is the C1 gap case and already acceptable. |
| **Trace-source toggle** | Parked | Except the single behaviour slate 9 unparked. Per-rider toggle, per-ride default reset versus sticky, and the no-route fallback all stay parked. |
| **Roster positive rendering indication** | Parked | New at Session D. A future enhancement where each app participant's roster row confirms they are actually rendered on the map, not only that they hold the app. Distinct from slate 17, which states participation type rather than render state. |
| **Slate 15, platform-substrate home** | Routed | To the G33 successor's definition pass, carrying slate 8's token mechanics and slate 11's identity-keyed cache fact. Dies as a Rail 3 item. |
| **D-03, "Privacy as product"** | Deferred, cross-Pillar-set | D-03 is not defined in any Rail 3 Pillar. Session B's D-03 items, two-class retention, pseudonymity honesty framing, and the position-versus-trail distinction, are carried in substance by Pillar II §2. The D-03 amendment itself is a cross-Pillar-set item, almost certainly the Rail 1 Charter, and cannot be resolved from inside the Rail 3 set. Pillar III R3-36's trace cites D-03 and that citation is left in place, to be reconciled when the amendment lands. |
| **Inherited Scenario 1 conflict** | Deferred, cross-Pillar-set | Same treatment as D-03, by ruling. Discharging PDoD-03 removed the only substantive Rail 3 reference to inherited Scenario 1. The Scenario Numbering Reference in Pillar III claims inherited scenarios "1, 4, 5, 11–29, 34" while the inherited list itself starts at Scenario 4 and never carries Scenario 1. Correcting an inherited-set claim without the source Pillar in hand is the mis-stated-committed-text hazard, so the claim is left untouched and the conflict is recorded here. |
| **F-07, beacon visibility to other riders** | **Resolved 2026-09-13** | Captain and SAG only. Other riders never see another rider's beacon. No longer pending, no longer deferred. Full entry at §8.5. |
| **F-08, Dark state last known retention** | **Discharged 2026-09-13** | Resolved as purged with all other location data, no exemption. No longer deferred, no longer pending. Full entry at §8.5. |
| **Seniors SaaS concept** | Untouched | No Charter ADD; the e-ink surface intent remains the load-bearing open question before one. |
| **Successor goal** | Open | The integration successor opens seeded from G33 outputs and this register. |
| **Methodology harvest** | Open | After G33 closes, harvest process findings to the public repo with dates. Candidates listed at §13.3. |

---

## §11. Guest Access Model — Verbatim Receipt

Lifted from `g33_session_a_decision_summary.md` section 2, ruling R-GUEST, and section 4, per the reserved check at close of arc. Transcribed here as the Session D summary directed. **Read with D-QR-5 at §8.5, which amends the no-email commitment; the amendment is noted inline below.**

**Ruling.** Guests are portal-side participants only: roster presence with name and phone, no email, no account, no native app. A guest sees the PWA roster page for their ride. Captain and Support see guests on the native app roster, clearly marked as non-app users. Guests never render on the fleet map.

> **AMENDED 2026-09-08 by D-QR-5:** "no email" is superseded. Email is optional at guest entry, and where supplied a signup email sends. Email confirmation never gates joining or riding. "No account" stands unchanged and is load bearing: any email held against a guest record is a conversion payload, not an identity, and creates no account, per R3-60. D-QR-2 supplies the delivery path to the PWA roster page the ruling assumes but never states, and D-QR-4 supplies the self-registration mechanism.

Native app access is a benefit of club membership. Entitlement is tenant-level: the club pays and access is available to its members, not purchased per rider. This keeps entitlement single-axis and leaves section 4.1's role envelope untouched.

Registration and affiliation is the conversion path. Auto-affiliation is a tenant configuration, on or off, determining whether an admin must manually accept the membership. The club remains the authorising party.

**Two independent lines of argument converged, both recorded.**
1. Architectural. R3-60 commits that Rail 3 binds to an existing identity and creates none. A guest without an account has no binding. Supporting guests in the app forks the identity model across R3-56 to R3-61 and requires a parallel RLS surface. R3-61 explicitly commits that downstream guarantees hold without an origin-dependent variant.
2. Commercial. App access is what membership buys, and clubs may not want it given to guests.

**Zero-Friction position, corrected in session.** Committed section 1 loads friction onto participation itself: Play Store install, account creation, email verification, in a parking lot. The ratified model puts zero friction on participation and moves all friction onto app access, which the guest elects. This honours Rail 1 Pillar I section 2 more faithfully than the committed text does, and the amendment should say so.

**Ledger entries, verbatim substance.**
- Observed guest rows are records produced by the existing portal add-guest capability, not captain-seeded test data. This corrects the characterisation carried into Session A from the 2026-07-30 ruling.
- Accepted trade, guest access. A guest is an untracked rider: no position to SAG, no Support Beacon, nothing surfaced if they drop off the back. Mitigation is two-way phone reach through the roster row. Baseline corrected in session: the status quo on most club rides is a stranger nobody can identify or phone, so this is contact reach without position reach, a net gain over the status quo and short of member-level tracking. Both halves recorded deliberately.
- Reversal condition weakened, consciously. The Trio's original falsifier was that if guests become a large share of the peloton, the fleet map stops depicting the ride and the trade inverts. Under the commercial framing that same evidence reads as the conversion funnel working. The decision is materially harder to reverse. Recorded as a purchase, not a side effect.
- Racer Sportif's guest and platform mix is the field data that would test both the above.
- Product-perception risk. Until Rail 3b ships, an entire platform is structurally untracked. The roster tag is what prevents an honest signal from reading as a defect. (Session D note: Session A's sentence named the chip and the roster tag; the chip is superseded, the roster tag now carries this alone.)

**Bedrock impact carried from Session A.** Pillar I Charter: membership-benefit commitment. Pillar II section 1 Guest Join Flow: production resolution replaced, and the committed clause giving no-email riders a one-ride session with no conversion path is superseded. PDoD-03: its entire subject was Rail 3a production guest join; there is none; discharged rather than deferred.

**Rails 1 and 2 items, not Rail 3 work.** Member-only validation on Captain and Support designation; until it exists an admin can designate a non-app participant to either role, producing a hollow role. Auto-affiliation tenant configuration and its seat-count consequence. Continued guest add flow.

---

## §12. Design Targets, Measured Values and Successor Recommendations

### 12.1 Seed-to-live, thirty seconds. Design target, not a gate.

**Target.** A seeded participant render upgrades in place to live position within thirty seconds or less on the healthy path.

**Why it is here and not in Pillar III.** Pillar III R3-62 states the invariant only: every rendered participant is seeded from lastKnown and remains at last known position until superseded by a newer fix. The number carries no measurement behind it, and the arc's standing principle is that unmeasured numbers do not enter Pillar III. Recording the target here means a miss is visible in a Decision Brief without gating the Quality Gate.

**Test-plan criterion.** Validation must distinguish live renders from stale seeds when grading. A render that has not upgraded is not a pass merely because a marker is present. The thirty second to two minute ambiguity window is considered-and-accepted by design, on the grounds of passive transitions, human judgment and glanceability.

**Reopening trigger.** Field evidence of Captains burned inside the thirty second to two minute window, which is Racer Sportif trial work. Provenance: the seed-until-live ruling in the Brain-session companion section 5, dated 2026-07-27, which predates Session A.

### 12.2 Measured values pending

| Value | Source | Status |
|---|---|---|
| Saver-at-start ceiling, Android | wTBD2 Decision Brief | Pending. Field observation puts it at roughly 3 to 4 minutes, unmeasured and unsourced. Feeds slate 4's startup clock plus a stated margin. |
| Steady-state fix cadence threshold, Android | wTBD2, scope extension | Pending. Derived from the same run data. Senior PM confirms both values. |
| Self-health thresholds, iOS | Equivalent measurement pass | **Reserved, empty.** Populated when the iOS rail opens. Battery Saver does not exist on iOS and distributions will differ. |
| A4 cadence bound | To be stated or measured | Pending. Session B states the shape, a ceiling for privacy and a floor for fallback quality, and no number. §14 item 21. |

### 12.3 R3-02 successor pass criterion. Standing recommendation, verbatim.

Discarded from the MACD packet at entry 7.5 and recorded here for the Rail 3a successor to adopt when its Pillar set opens. Two reasons on record: the criterion cites R3-41, which is survey-only by ruling and therefore absent from Pillar III, so the reference would dangle; and it is a Rail 3a criterion being committed from a rail whose successor Pillar set does not exist, the same category error slate 15 routed away from. The never-silent principle is unaffected, already carried by R3-40 and R3-48.

Verbatim, from the Brain-session companion section 7.5:

```
[Option] Then in addition to the recorded outcomes, the run passes only if:
  - the GPS task survived to ride end, OR
  - the rider was warned per R3-40 and surfaced per R3-41 within the self-health threshold
[i.e., kill may occur; silent kill may not]
```

**Rationale for the successor to carry with it:** D88 reclassified silent invisibility on a compliant device as a core-guarantee failure. Measurement remains valid; the bar moves from "observed" to "never silent." R3-02 itself remains a measurement exercise and its committed scenario is unchanged for the PoC.

---

## §13. Findings Log

Recorded, not acted on. Each needs a ruling or a later pass.

### 13.1 Findings carried from the session-two Pillar III pass

| # | Finding |
|---|---|
| F-1 | **Inherited Scenario 1 conflict.** Routed to the deferred register at §10 as a cross-Pillar-set item. |
| F-2 | **Scenario Numbering Reference, Pillar III.** Claims inherited scenarios "1, 4, 5, 11–29, 34"; the inherited list starts at Scenario 4 and never carries Scenario 1. Left untouched by ruling. |
| F-3 | **CLOSED 2026-09-13 by correction in Pillar II v1.1.1.** Raised as: Pillar II §2 Task lifecycle residue. Committed Pillar II v1.1.0 still reads "Background task registered at ride Join" and "Task de-registered at ride End or session expiry". Session one corrected the Library line to the Transistorsoft engine and left this block. The two lines now read as the Transistorsoft engine started at Join and stopped at ride End, matching the ratified packet 7.1 and 7.2 wording that R3-34 and R3-35 carry. This was the one place the Bedrock contradicted itself: both scenarios trace to these lines. |
| F-4 | **CLOSED 2026-09-13 by correction in Pillar III v1.1.1.** Raised as: Pillar III R3-33 residue. Reads "And the background GPS task is registered", the same superseded framing packet 7.1 corrects in R3-34. Corrected to the Transistorsoft engine per R3-34 on Senior PM ruling. The original reason for leaving it, that no ruling covered R3-33, was thin: the ratified decision corrected the framing wherever it appears, and leaving one instance meant two join scenarios described the same mechanism two different ways. |
| F-5 | **R3-04 threshold asymmetry.** Pillar III carries "(default 15 minutes)" for the Dark threshold, a tenant fleet-state clock, two lines above a ratified clause that deliberately carries no number. Different clock from the self-health threshold; nothing in the record strikes it. **CLOSED 2026-09-13:** the value stands, qualified as "(tenant-configurable, default 15 minutes)" so the asymmetry against the adjacent operator-level clause is self-explaining rather than something a reader has to infer. No change to the committed number. |
| F-6 | **D-03 trace reference.** Pillar III R3-36's trace cites "D-03 — Privacy as product", which is not defined in any Rail 3 Pillar. Citation left in place, recorded alongside the §10 deferred entry. |
| F-7 | **R3-45 reversal condition.** Three always-on counters were ruled sufficient until shown otherwise. If they cannot distinguish engine-never-engaged, engine-torn-down and OEM-suspension, R3-45 returns to the Brain. No Hands item raised. |
| F-8 | **The midnight carry-forward was pointed at the wrong line.** The session-one record named Pillar III R3-36's trace as the third location of the superseded mechanism. That reference cites inherited Scenario 29 by its actual title and is accurate. The real defect was R3-36's own Given clause, since corrected. The same analysis applies to the two inherited-scenario citations, which were left alone. |
| F-9 | **Pillar III v1.0.0 change log understated its own committed set** by one scenario, stating R3-01 through R3-35 where it ran to R3-36. Left untouched by ruling; the correction is stated in the v1.1.0 row. A change log is a characterisation and gets verified against the file like any other. |

### 13.2 Findings raised in the session-three Pillar III and Pillar IV pass

| # | Finding |
|---|---|
| F-10 | **R3-71 carried midnight auto-close.** Its committed line read "End Ride (R3-25/26) and midnight auto-close (R3-36) are the only ride-ending events". Session D lists R3-71 as unamended, so a verbatim transcription would have re-committed the mechanism B2 superseded. Corrected to inactivity auto-close by Senior PM ruling, matching the treatment applied to R3-36's Given clause. **Fifth instance on the arc of drafted or characterised text lagging a closed ruling.** |
| F-11 | **Session two paraphrased ratified wording.** R3-34 and R3-35 were written from the Session D summary's description rather than the companion section 7 draft, which was not in that session's working set, and both bodies came out shorter than the ratified text. Restored at session three once the packet was held. This is the concrete cost of the "ratify as drafted, without the draft" hazard. |
| F-12 | **R3-74's expression is wider than Session A specified.** Session A framed roster-only participants as rendering "on the roster to Captain and SAG". Committed Pillar II §4.1 at v1.1.0 marks the per-row participation state visible to Captain, SAG, Rider and Guest via PWA, with only contact details gated to Captain and SAG. R3-74 as enshrined matches Pillar II, not Session A. Verification item closed in favour of the committed text. |
| F-13 | **SD-012, QR display to all roles, was still live in this Ledger** after D-QR-7 amended it in Pillar II. Tagged superseded at §1 in this pass. Pillar IV was not checked against the D-QR rulings at session one, when only Pillars I and II were in scope. |
| F-14 | **SD-005's retention line was still live** stating a single 4-hour Hard Purge for all Rail 3 location data, after C1 established the two-class model. Tagged superseded at §1 in this pass. Same class as F-13. |
| F-15 | **§4 LOE names expo-location and expo-task-manager.** Left untouched: the LOE is a historical estimate recording what was believed at 2026-05-12, and editing it would rewrite a record rather than correct a commitment. Recorded so the reference is not mistaken for a live mechanism. |
| F-16 | **CLOSED 2026-09-13.** Raised as: F-08 may be answered by B2 and is not formally discharged. Ruled and discharged the same day; see §8.5. The finding itself stands as a pattern worth keeping: a question can sit flagged as open for months after the committed text has answered it, because nothing in the protocol forces a periodic re-read of the pending list against the Bedrock. **Recommended practice: check the Pending Brain Decisions list against committed text at every arc close.** |

### 13.3 Methodology harvest candidates

For the public repo after G33 closes, with dates. Duplicate-file hazard in the summary chain. Resequencing recorded as deliberate. Artifact mis-citation failure class, twice. Receipt-versus-ruling correction class. The read-discipline seed pattern, with grep named as a first-class option rather than treating file opens as atomic. The wTBDn convention. The decision-to-destination map format. Count and arithmetic errors in seed prompts, three instances. Condensation loss in the summary chain, the slate 17 case. Drafted packet text lagging closed rulings, five instances. The enshrinement test, enforcement not opportunity. Invented timestamps, two instances, and the handshake rule that fixes them. Label collision across artifact types, where "C2" is both a container diagram and a roster-page ruling. Confirm-gate granularity, and the two-tier fix. Bare reference codes are not reviewable at the point of decision. "Ratify as drafted" is unusable without the draft. Ratification passes should be checked against each other, not only against the Pillars. Folder is not inventory.

---

## §14. Hands Work List

Supersedes the Session D summary section 8 list. Items 1 to 17 carried, 18 to 23 added at the MACD sessions. The list ends at 23; session two and session three raised no new Hands items.

| # | Item |
|---|---|
| 1 | Self-marker component question (D-G33-A3-01 context): carried, non-blocking. |
| 2 | dormant violet: naming collision fix, engine "dormant" versus UI "dormant". |
| 3 | Multi-Captain schema and role derivation (End Ride extension, B2). |
| 4 | Roster guest null-check correction (C2). |
| 5 | D2 schema set: pre-start joinable state, auto-start job, 24-hour rolling-window query. Extended by slate 16: the joinable state reads the started transition and must serve both the auto-start job and ad-hoc Captain start. |
| 6 | RSVP planning-side only; confirm no Rail 3 write path. |
| 7 | D1 ticket, departure on auth transition, fire-and-forget. Extended by R3-58 and slate 11: departure executes before session end; the roster cache clears after departure, not before. |
| 8 | Dead-code work: merged into the B3 restoration ticket; autoSync residue removable per B1. |
| 9 | wTBD2, Saver-at-start measurement. **Now registered at §6 as a Sprint 0 ticket, which is where it belongs**; this entry is retained as a pointer under Immutable Numbering. Assign the W-number, record the substitution, report two values. Full task definition at §6. |
| 10 | Confirm the current build's power posture at write-back (slate 2 interim posture record). |
| 11 | Beacon schema confirmation: durable current-state flag, raise-time last-known write (slate 7). |
| 12 | O-08 same-day write-back confirming parked status: still owed, flagged a third time. |
| 13 | Roster cache implementation. Single slot, durable not in-memory, encrypted device storage, cleared by supersession and auth transition only, renders marked last-known. |
| 14 | Convergent teardown. Device-side status check on the B1 heartbeat, plus bounded server retry on the wake path. |
| 15 | Roster per-row participation state (slate 17). Widen the existing non-app-user mark; confirm at write-back. |
| 16 | Confirm the built sign-out ordering, departure before session end, and record it. |
| 17 | Breadcrumb gap render as a visible break, never interpolated. |
| 18 | **Guest self-registration surface (Rails 1 and 2).** Scan-to-register: name and phone mandatory, email optional. Signup email on supply. Signup link on the PWA roster page. Row is guest-created, leader-authorised. |
| 19 | **QR credential routing.** Every branch reaches a defined destination, including unauthenticated non-guest and cross-tenant member. No branch lands on an error. |
| 20 | **Telemetry scope and retention.** Per-ride full capture; full-capture output personal-data class T+4h; always-on counters survive purge with identity stripped at T+4h, keyed to ride, platform, device class. |
| 21 | **A4 cadence bound value.** Session B states the shape, a ceiling for privacy and a floor for fallback quality, and no number. Pillar II carries the shape only. Value to be stated, source to be found or measured. |
| 22 | **DISCHARGED 2026-09-13.** Threshold configuration owners, documentation. Pillar II Feature 4 fleet-state thresholds are tenant-level; slate 4's self-health clocks are operator-level, server-side, per-platform, never tenant-exposed. Different clocks, no contradiction, but they sit close together with opposite owners and nothing in the record says why. Ruled and written into Pillar II §3 Feature 4 at v1.1.1. See §8.5. |
| 23 | **Non-app-user roster mark, treatment.** "Marked as non-app users" is now committed in three Pillars. No committed text describes the mark itself. Per-row treatment, widened to the roster-only state per slate 17. |

---

## §15. Ledger Receipt — G33 Arc

| Version | Date | Time | MACD Action | Strategic Decision / Pivot | Trio Lead |
|---|---|---|---|---|---|
| v1.1.0 | 2026-09-08 | — | CHANGE | **MACD session one.** Pillar I Charter v1.0.0 to v1.1.0 COMMITTED: twelve hour operational envelope, guest persona split and Slim Shadey rewritten per R-GUEST as amended, Krys QR sentence replaced, C1 System Context diagram to v1.1.0. Pillar II Specs v1.0.2 to v1.1.0 COMMITTED: Transistorsoft engine throughout, guest join flow resolution replaced, cross-surface handoff, beacon read path, two-class retention, telemetry two tiers, roster feature and matrix ROSTER section, QR display narrowed to Captain and SAG, C2 container diagram to v1.1.0 with inactivity auto-close replacing midnight UTC. Eight D-QR rulings taken in-session as a recorded deviation. Amendment Protocol assessed and declined with reasons. | TPM |
| v1.1.0 | 2026-09-13 | — | CHANGE | **MACD session two.** Pillar III part 1, drafted not committed. PDoD-03 discharged; R3-01 and R3-04 traces ratified per packets 7.3 and 7.4; R3-33, R3-34, R3-35 and R3-36 mechanism corrected to the Transistorsoft engine and inactivity auto-close; eight §2.1 promotions enshrined. Zero expo references remaining in Pillar III. Blocked on B1 and the companion section 7 packet, neither of which was in the working set. R3-36's guest retention contradiction parked under AMIP option (c). | TPM |
| v1.1.3 | 2026-09-13 | — | CHANGE | **Sprint 0 taxonomy.** Sprint 0 ruled a phase of however many tickets LLD discovery requires. wTBDn ruled a suggested sequence representing those tickets. S0-nnn and wTBDn stated as one concept under two naming eras. Stride ticketing stated as the Hands' job inside the Bedrock for the first time. wTBD1 and wTBD2 registered in §6. | TPM |
| v1.1.2 | 2026-09-13 | — | CHANGE | **Hands-readiness pass.** F-07 resolved as Captain and SAG only, emptying the Pending Brain Decisions list. Hands item 22 ruled and its clause written into Pillar II. Findings F-3, F-4 and F-5 closed by correction across Pillars II and III. S0-001 corrected off expo-location. Pillar II to v1.1.1, Pillar III to v1.1.1, Pillar IV to v1.1.2. The Bedrock carries no internal contradiction and no open build gate; it is ready for The Hands. | TPM |
| v1.1.1 | 2026-09-13 | — | CHANGE | **Arc close sweep.** F-08 discharged as purged with no exemption, on the finding that committed text had answered it since v1.0.0. PDoD-05 and S0-011 discharged with it. Pending Brain Decisions reduced to one, F-07. | TPM |
| v1.1.0 | 2026-09-13 | — | CHANGE | **MACD session three.** Both blockers cleared. Pillar III v1.1.0 COMMITTED: R3-40 and R3-48 promoted with the B1 split and slate 13 convergence applied, twenty further promotions across §2.2, §2.5 and §2.6, R3-74 authored fresh, slate 8's three scenarios enshrined verbatim as R3-75 to R3-77, R3-61 tagged and retired under Immutable Numbering, R3-34 and R3-35 restored to ratified wording and retitled with R3-58, R3-71 corrected under B2, and R3-36's guest clause amended to roster records, closing the one open contradiction of the arc. Pillar IV v1.0.0 to v1.1.0 COMMITTED: this record. Four Pillars now stand at v1.1.0 and the G33 Bedrock is closed. | TPM |

**Arc totals.** Forty-four rulings across Sessions A, B, C and D, plus twelve taken in the MACD sessions. Seventy scenario entries in Pillar III: thirty-six committed at v1.0.0, thirty enshrined from wTBD1, three from slate 8, one retired number. Twenty-three Hands items. Sixteen findings logged. Fifteen entries in the deferred and parked register. Zero Pending Brain Decisions carried: F-07 and F-08 both discharged at arc close. No build-and-test gate remains open against the Rail 3 Bedrock.

---

*End of [Vechelon Rail 3] Pillar IV: The Ledger (v1.1.3)*
