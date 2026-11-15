[Vechelon Rail 3] Pillar IV: The Ledger (v1.2.0)
Project: Vechelon Rail 3 — Mobile Tactical | Current Version: v1.2.0 | Last Sync Date: 2026-11-15 | Status: COMMITTED

---

## Change Log
| Version | Date | Time | MACD Action | Decision | Trio Lead |
|---|---|---|---|---|---|
| v0.1.0 | 2026-05-12 | — | ADD | Rail 3 Pillar set initialized. Platform strategy, PoC approach, infrastructure architecture, risks, and LOE committed from Brain session. | TPM |
| v1.0.0 | 2026-05-12 | — | ADD | Full day of Brain sessions complete. Pillars I, II, and III promoted to COMMITTED. All session decisions, new Sprint 0 tasks, and pending Brain decisions captured. Ledger promoted DRAFT → COMMITTED. | TPM |
| v1.2.0 | 2026-11-15 | — | CHANGE | MACD sync for the Brain session of 2026-11-14 to 2026-11-15. SD-011 amended per the approved Pillar V amendment for D81, with the `actor_deleted` reason. New §16, the session decision record: production gate A and B, EU gate, launch countries Canada and the US; four code-versus-Bedrock contradictions ruled, with the D100 24-hour sweep logged as a known nonconformance; Support Beacon visibility widened, superseding F-07 and W206; G33 ruling C1 reversed on its purge exemption; Sprint 1 (G34) closed as build complete on unvalidated write-backs; Charter $0 exceptions; derived ride artifacts parked; multi-membership pulled forward; next sprint goal ratified. New §17, the G34 write-back record for §14 items 10, 11, 15, 16 and 23. §9.1 beacon retention dissent. §12.2 A4 cadence and R3-42 window rows. §13.4 findings F-17 to F-24. §14 items 12 and 21 closed, items 24 to 35 added. O-08 write-back discharged. §16.12 lists fifteen items the register did not settle, seven of them ruled or confirmed by the Senior PM at commit. Receipt at §18. | TPM |
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
**New Rail 3 Tables:** beacon_alerts, rider_states. rider_states retired 2026-11-15; see §16.8.
**Retention:** [DELETED - 2026-09-13] 4-hour Hard Purge applies to all Rail 3 location data (inherited architectural decision). Superseded by C1, breadcrumb, which established a two-class retention model: T+4h personal data, and purge-exempt club artifacts. rail3_breadcrumb survives the Hard Purge as a club-owned artifact. Current model in Pillar II §2 retention and Pillar III R3-36 and R3-70. See §8 ruling C1 and §9 dissent record. Amended again 2026-11-15: the breadcrumb exemption is reversed and beacon records move to a 30-day rule; see §16.2.

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
**Decision:** When a rider cancels their own Support Beacon, beacon_cancelled_by is written with the rider's own UUID — not null. [DELETED - 2026-11-15] Null is reserved for system error only. Rationale: null is indistinguishable from a failed write. Rider UUID is a valid FK, requires no schema change, and produces an unambiguous audit trail on a safety event.

**Amended 2026-11-15 (D81).** Pillar V amendment approved by the Senior PM 2026-11-14; enshrinement confirmed 2026-11-15.

> `beacon_cancelled_by` holds the acting user whenever a person caused the close. A beacon closed because its ride ended carries `beacon_cancel_reason = 'ride_ended'`, with the actor being whoever ended the ride, or blank if the system ended the ride. When account deletion blanks the actor on a row with no reason, it sets the reason to `actor_deleted`; rows already marked `ride_ended` keep that reason. A blank actor with a blank reason remains reserved for system error.

| `beacon_cancelled_by` | `beacon_cancel_reason` | Meaning |
|---|---|---|
| a person | blank | Cancelled by that person |
| a person | `ride_ended` | Closed when that person ended the ride |
| blank | `ride_ended` | Closed by the system at ride end, or the person who ended it has since deleted their account |
| blank | `actor_deleted` | Cancelled by a person whose account has since been deleted |
| blank | blank | System error |

**Rationale.** SD-011 exists so an audit row is never ambiguous: a blank actor must not be mistakable for a failed write. The reason column keeps that guarantee and also records why a beacon closed. Rejected alternative (Senior PM, 2026-11-14): a dedicated System account as the actor. It would put a fake identity in `accounts`, the real-user table, where every listing, count, deletion path and RLS check would have to account for it, and it would misattribute closes a real person caused by ending the ride.

**Wording.** The text says "the system ended the ride" and names no mechanism. The amendment's own rationale cited the D100 24-hour sweep, which is ruled out under Contradiction 1 at §16.2. The rule does not depend on the mechanism: a system-ended ride closes its beacons with reason `ride_ended` and a blank actor, whatever ended the ride.

**State of the build.** `ride_ended` is built in D81 (migrations 20261114000000 and 20261114010000 on `rail3-integration`), simulated on staging, unvalidated in the field. `actor_deleted` is not built: account deletion (W299) blanks the actor today, so those rows read as system error until it ships. As built, a beacon written after its ride has ended is recorded already closed, with `ride_ended` and a blank actor; that case is in the approved amendment's table and was not separately ruled in session (§16.12 U-11). The audit meaning of these fields is only as trustworthy as the write path, which any affiliated club member can rewrite until the cancel-field tightening ships (Gate B, §16.1).

**Cascade.** Pillar II §2 schema and §3 Feature 2 at v1.2.0; Pillar III R3-78.

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
| F-07 | [DELETED - 2026-09-13] Support Beacon visibility to other riders — visible or Captain/SAG only? **RESOLVED 2026-09-13: Captain and SAG only.** See §8.5. **Superseded 2026-11-15:** every app participant on the ride, plus club admins in Race Control. See §16.3. | Pillar III §2 Global Rules | **Resolved. No Brain session required.** |
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
| F-07: Beacon visibility to other riders | [DELETED - 2026-09-13] Rail 3a Brain session | [DELETED - 2026-09-13] Unresolved — must not be built until decided. **Resolved 2026-09-13: Captain and SAG only.** Not deferred value; a committed exclusion. See §8.5. Superseded 2026-11-15; see §16.3. |
| F-08: Dark state last known position retention | [DELETED - 2026-09-13] Rail 3a Brain session | [DELETED - 2026-09-13] Unresolved — current purge rule assumed until resolved. **Discharged 2026-09-13:** the committed purge rule was not an assumption, it was the answer. Purged with all other location data, no exemption. See §8.5. |
| UX label copy (status labels) | Stride milestone | Architectural names committed. Copy subject to Voice & Tone review — PDoD-06. |
| ThemeProvider library choice | Sprint 0 — The Hands | LLD decision |
| SAG mid-ride reassignment | Post MVP | Schema supports multiple SAG records — not in MVP |
| Derived ride artifacts: ride shape, save as route | Parked, no timing | Deferred value from the breadcrumb reversal of 2026-11-15. See §16.6. |
| Multi-membership: one rider, more than one club | Directly after the production move | Pulled forward 2026-11-15 from its v3.0 roadmap slot. One amendment, web and app parts shipping together. See §16.7. |
| EU distribution and EU clubs | Behind the EU gate | Production launches in Canada and the US. See §16.1. |
| Route overlay on the live map (Feature 6) | Unscheduled | No-route behaviour accepted 2026-11-15 until it is built. See §16.4, item E.6. |

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
| wTBD2 | Saver-at-start measurement. Measure engine start to first accepted fix under Android Battery Saver. Report the distribution, not a sample: Saver on versus off (off is the control), cold versus warm start, per device and Android version, recording device model, OEM, Saver state, indoor or outdoor, and time to first fix, plus any run that produced no fix at all and how long it ran. Returns a Decision Brief recommending **two** values per the Session D scope extension: the startup clock ceiling as originally scoped, and a proposed steady-state threshold derived from the same run data. Out of scope: do not tune, fix or work around the startup delay, do not select the threshold, do not edit the Pillars. Log the work in `log_of_changes.md`. Done when the Brief is delivered and the Senior PM confirms both values. Assign the W-number and record the substitution. **Substitution recorded 2026-11-15: wTBD2 is W279.** The measurement run has not happened. | The Hands | Pending | Pillar IV §8.3 D4, §8.4 wTBD2 scope extension, §12.2; §14 item 9 |

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

**B2, lifecycle machinery. Accepted, split three ways.** A ride closes when its Captain ends it, with End Ride available to every Captain on the ride. The backstop is inactivity only: no pings from any participant for N hours, tenant-configurable. No wall-clock sweep. Midnight UTC, committed in the C2 container diagram, is superseded; 3am UTC was considered and withdrawn, because a global product carries no safe wall clock. The scheduler carries three jobs: auto-start, inactivity auto-close, purge. Purge scope extends hard purge to Rail 3 tables and to ride_participants location fields, with rail3_breadcrumb surviving per C1. [Superseded 2026-11-15: the breadcrumb is in purge scope; see §16.2.]

**B2 known gap, paired with the twelve hour envelope.** A device still pinging after its rider went home holds the ride open. Recorded as a known gap rather than papered over. A duration-cap parameter is available to this Ledger if field data warrants it. It is paired here with slate 1's twelve hour design envelope because the two are the same question read from opposite ends: the envelope forbids any architecture assuming a ride ends by a particular time, and the known gap is the cost of honouring that. Taking the duration cap would reintroduce a wall clock the envelope's second clause forbids, so it is available only as a parameter on evidence, never as a default.

**B3, screen-lock Battery Saver check. Accepted, restore.** Restore the wiring. R3-49 holds: prompt, never a precondition. Collision ruled: at unlock the self-health notification takes precedence; the Saver advisory suppresses while it fires and stands alone when Saver is on but tracking is healthy. Device advisories sit outside Pillar II §5.1's live-ride alert prohibition.

**C1, breadcrumb. Accepted. Dissent recorded, see §9.** **Purge exemption REVERSED 2026-11-15, see §16.2. Read the retention sentences below as superseded; capture ownership, continuity, the visible gap and read-side backfill stand.** The breadcrumb is an autonomous club record of the ride, decoupled from personal identity, and survives the Hard Purge as a club-owned artifact, companion to the AI ride summary. Ownership: the Captain who starts the ride is the breadcrumb owner, sole and non-transferable, for the ride's duration. If that Captain departs and returns, capture resumes; the gap is acceptable and intended. Read-side backfill enshrined as expected behaviour: fetch on open and resume when not rendered locally, live tip extension from position broadcasts, distinct from the excluded write-side autoSync. Honesty constraint: the roster is retained and the ride names its Captain, so the surviving breadcrumb is pseudonymous, not anonymous, and is re-linkable by anyone with club access. Frame it as an artifact-class change, a person's trail becoming a ride's route with no identity fields in the table; do not claim non-attributability. The Captain accepts attribution by starting the ride, and the documentation says so. Retention becomes two-class: T+4h personal data, purge-exempt club artifacts. AI summary generation sequences before any scrub that touches its inputs.

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

**F-07, Support Beacon visibility to other riders. RESOLVED 2026-09-13. Captain and SAG only.** **SUPERSEDED 2026-11-15, see §16.3.**

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

**C1 addendum, 2026-11-15.** The override is reversed on retention: the raw breadcrumb is deleted with personal data (§16.2). The record above is retained as history. Derived ride artifacts, which may in time replace what the exemption kept, are parked at §16.6.

**Support Beacon record retention, 2026-11-15. The Senior PM ruled against the Trio's proposal.** The Trio proposed keeping the beacon row for 24 months, on limitation-period grounds. The Senior PM ruled 30 days, whole row, for alignment with the existing 30-day coordinate rule. Accepted trade-off, recorded: an incident raised more than 30 days later has no beacon record.

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
| **O-07, contact scope (rider-to-rider)** | Parked | Dedicated Trio session. Untouched by the slate 8 phone ruling, which covers leaders only. Reaffirmed 2026-11-15: the widened beacon rule gives riders no phone number for each other. |
| **O-08, SOS push** | Parked | Dedicated Trio session. Same-day write-back to the Hands confirming parked status is still owed, flagged a third time. **Discharged 2026-11-15: this entry is the write-back. O-08 remains parked.** Slate 3's general wake channel is architecturally open to it without pre-ruling it. |
| **D72, general position reconciliation** | Parked | Pending Pillar II §2 privacy ratification. Slate 7 carved out beacon state only; the enshrinement pass narrowed R3-55 accordingly. |
| **C3 parked modal** | Parked | Confirmation modal on Captain leave offering End Ride. Requires a Pillar II §5.1 confirmation-gate amendment if taken; declining it leaves like any rider, which is the C1 gap case and already acceptable. |
| **Trace-source toggle** | Parked | Except the single behaviour slate 9 unparked. Per-rider toggle, per-ride default reset versus sticky, and the no-route fallback all stay parked. |
| **Roster positive rendering indication** | Parked | New at Session D. A future enhancement where each app participant's roster row confirms they are actually rendered on the map, not only that they hold the app. Distinct from slate 17, which states participation type rather than render state. |
| **Slate 15, platform-substrate home** | Routed | To the G33 successor's definition pass, carrying slate 8's token mechanics and slate 11's identity-keyed cache fact. Dies as a Rail 3 item. |
| **D-03, "Privacy as product"** | Deferred, cross-Pillar-set | D-03 is not defined in any Rail 3 Pillar. Session B's D-03 items, two-class retention, pseudonymity honesty framing, and the position-versus-trail distinction, are carried in substance by Pillar II §2. The D-03 amendment itself is a cross-Pillar-set item, almost certainly the Rail 1 Charter, and cannot be resolved from inside the Rail 3 set. Pillar III R3-36's trace cites D-03 and that citation is left in place, to be reconciled when the amendment lands. |
| **Inherited Scenario 1 conflict** | Deferred, cross-Pillar-set | Same treatment as D-03, by ruling. Discharging PDoD-03 removed the only substantive Rail 3 reference to inherited Scenario 1. The Scenario Numbering Reference in Pillar III claims inherited scenarios "1, 4, 5, 11–29, 34" while the inherited list itself starts at Scenario 4 and never carries Scenario 1. Correcting an inherited-set claim without the source Pillar in hand is the mis-stated-committed-text hazard, so the claim is left untouched and the conflict is recorded here. |
| **F-07, beacon visibility to other riders** | **Resolved 2026-09-13** | Captain and SAG only. Other riders never see another rider's beacon. No longer pending, no longer deferred. Full entry at §8.5. **Superseded 2026-11-15**, full entry at §16.3. |
| **F-08, Dark state last known retention** | **Discharged 2026-09-13** | Resolved as purged with all other location data, no exemption. No longer deferred, no longer pending. Full entry at §8.5. |
| **Derived ride artifacts** | Parked, no timing | Ride shape and save as route. To rule when picked up: the ride shape kept automatically, the route elected. The privacy policy and Data Safety form need a sentence before either ships. Full entry at §16.6. |
| **G34 verification** | Open | Reopens when ride tests resume. G34 closed 2026-11-15 as build complete on unvalidated write-backs. Record at §17. |
| **The two Saver values (wTBD2, W279)** | Open | Waits on the measurement run. Until both are confirmed the self-health warning is off in production. |
| **Multi-membership** | Pulled forward | Directly after the production move. Full entry at §16.7. |
| **Deferred list, agenda item 1.2** | Unscheduled | The Hands' agenda list of 2026-11-14. Not itemised in the session register. |
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
| A4 cadence bound | Senior PM, 2026-10-03 (W283) | **60 seconds, confirmed**, within the 30 to 120 second bound. Closes §14 item 21. [DELETED - 2026-11-15] Pending. Session B states the shape, a ceiling for privacy and a floor for fallback quality, and no number. |
| R3-42 recovery window, Android | Brain proposal, 2026-11-15 | **120 seconds: two heartbeats at the 60 second interval**, for an app that is still alive. Not a measured value. Held here and kept out of Pillar III on the standing principle that unmeasured numbers do not enter it. |
| Heartbeat interval, Android | As built in G34 | 60 seconds, the Android floor. The steady-state self-health threshold must exceed it or the liveness check flaps. |

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
| F-7 | **R3-45 reversal condition.** Three always-on counters were ruled sufficient until shown otherwise. If they cannot distinguish engine-never-engaged, engine-torn-down and OEM-suspension, R3-45 returns to the Brain. No Hands item raised. **RULED 2026-11-15:** the condition was met, the counters could not make the distinction. See §16.4, item B. |
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

### 13.4 Findings raised at the 2026-11-15 MACD sync

| # | Finding |
|---|---|
| F-17 | **Behaviour shipped ahead of the Bedrock, four times.** The D100 retention job shipped a wall-clock ride close, a beacon retention change and a breadcrumb deletion with no Pillar V amendment. W206 was ratified on 2026-06-15 with no Bedrock entry, and the F-07 resolution three months later was written without knowledge of it. The Sleeping state likewise ran in code with no ruling until this session. A retroactive Pillar V for D100 is owed (§14 item 24). |
| F-18 | **Sixth carry-forward of a wall-clock close, and the first in running code.** F-8 and F-10 counted five in drafted or characterised text. The D100 24-hour sweep is the same class in a migration, live on both databases. Ruled at §16.2, Contradiction 1. |
| F-19 | **R3-27 still grants QR display to all roles.** Pillar III R3-27 and V-011 read "Captain, SAG, or Rider", against D-QR-7 at §8.5 and Pillar II §4.1. Present since the September sync, which amended Pillar II and this Ledger and missed the scenario. Same class as F-13. Untouched: outside this sync's seed. |
| F-20 | **F-08 still reads as open in Pillar III.** PDoD-05 and the `[PENDING — F-08 Brain Decision]` note under R3-36 survive, although F-08 was discharged here at v1.1.1. Untouched: outside this sync's seed. |
| F-21 | **C2 diagram escaping.** In the Pillar II working copy the Mermaid block carries escaped underscores (`Container\\\_Boundary`), which will not render. The Charter's C1 block is clean. Likely an export artifact. The escaping was preserved so the diff against v1.1.1 stays readable; it should be checked against the Git copy. |
| F-22 | **The register's cascade list under-listed its destinations.** Section 12 of the register named six Pillar III changes. The same rulings also made R3-10, R3-17, R3-19, R3-31, R3-70, DoD-08 and V-008 false, and in the Charter the Hard Purge line, the Paddy persona and two glossary rows. Conformed and listed in each change log. A cascade list is a characterisation and gets verified against the files like any other. |
| F-23 | **Label collision, again.** The register's contradictions C1 to C4 collide with G33 rulings C1 to C3. Handled by the label note at §16. Same class as the C2 collision listed at §13.3. |
| F-24 | **The D50 ticket carried a rule the Bedrock did not.** The ticket's roster rule of 2026-07-03, riders see only Captain and Support, was narrower than committed Pillar II §4.1. Ruled for §4.1 at §16.4, item D. A fix built to the ticket would have removed roster rows the Bedrock grants. |

---

## §14. Hands Work List

Supersedes the Session D summary section 8 list. Items 1 to 17 carried, 18 to 23 added at the MACD sessions. [DELETED - 2026-11-15] The list ends at 23; session two and session three raised no new Hands items. Items 24 to 35 added 2026-11-15 from the Brain session's follow-ups. They are follow-ups, not tickets: whether each becomes a ticket is the Senior PM's call.

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
| 10 | Confirm the current build's power posture at write-back (slate 2 interim posture record). **Written back 2026-11-15, built and unvalidated. Record at §17.1.** |
| 11 | Beacon schema confirmation: durable current-state flag, raise-time last-known write (slate 7). **Written back 2026-11-15, built and unvalidated. Record at §17.2.** |
| 12 | O-08 same-day write-back confirming parked status: still owed, flagged a third time. **Discharged 2026-11-15.** O-08 stays parked; the §10 entry is the write-back. |
| 13 | Roster cache implementation. Single slot, durable not in-memory, encrypted device storage, cleared by supersession and auth transition only, renders marked last-known. |
| 14 | Convergent teardown. Device-side status check on the B1 heartbeat, plus bounded server retry on the wake path. |
| 15 | Roster per-row participation state (slate 17). Widen the existing non-app-user mark; confirm at write-back. **Written back 2026-11-15, built and unvalidated. Record at §17.3.** |
| 16 | Confirm the built sign-out ordering, departure before session end, and record it. **Written back 2026-11-15, built and unvalidated. Record at §17.4.** |
| 17 | Breadcrumb gap render as a visible break, never interpolated. |
| 18 | **Guest self-registration surface (Rails 1 and 2).** Scan-to-register: name and phone mandatory, email optional. Signup email on supply. Signup link on the PWA roster page. Row is guest-created, leader-authorised. |
| 19 | **QR credential routing.** Every branch reaches a defined destination, including unauthenticated non-guest and cross-tenant member. No branch lands on an error. |
| 20 | **Telemetry scope and retention.** Per-ride full capture; full-capture output personal-data class T+4h; always-on counters survive purge with identity stripped at T+4h, keyed to ride, platform, device class. |
| 21 | **A4 cadence bound value.** Session B states the shape, a ceiling for privacy and a floor for fallback quality, and no number. Pillar II carries the shape only. Value to be stated, source to be found or measured. **Closed 2026-11-15:** 60 seconds, confirmed by the Senior PM 2026-10-03. Row at §12.2. |
| 22 | **DISCHARGED 2026-09-13.** Threshold configuration owners, documentation. Pillar II Feature 4 fleet-state thresholds are tenant-level; slate 4's self-health clocks are operator-level, server-side, per-platform, never tenant-exposed. Different clocks, no contradiction, but they sit close together with opposite owners and nothing in the record says why. Ruled and written into Pillar II §3 Feature 4 at v1.1.1. See §8.5. |
| 23 | **Non-app-user roster mark, treatment.** "Marked as non-app users" is now committed in three Pillars. No committed text describes the mark itself. Per-row treatment, widened to the roster-only state per slate 17. **Written back 2026-11-15, built and unvalidated. Record at §17.3.** |
| 24 | **Retroactive Pillar V amendment for D100.** The 24-hour sweep, the beacon retention change and the breadcrumb deletion shipped with none. The per-ride phone clearing belongs in it too (§16.12 U-7). |
| 25 | Probe and close D93. Close W196, done by W304. |
| 26 | Verify what travels on the public web `ride:<id>` channel, and close it. |
| 27 | Change D100 step 2 from clearing coordinates to deleting the whole beacon row 30 days after raise. |
| 28 | Replace D100 step 0, the 24-hour sweep, with the inactivity close of Pillar II Feature 3. Known nonconformance until it ships (§16.2). |
| 29 | Sleeping: store the state on the ride record, show the age of the position, Race Control parity, beacon outranks it. |
| 30 | Passive background-tracking-off indicator on the rider's own dot. Fourth roster value for Captain and SAG. |
| 31 | Align the map bottom sheet to the roster for co-Captain phone. |
| 32 | Confirm no production account holds two memberships. |
| 33 | Housekeeping per §16.8. |
| 34 | Confirm three Brain readings not verified in code: a Sleeping rider still receives Captain and SAG positions when the app is open; what the map draws for a beaconing rider who goes Sleeping; what travels on the public web channel. |
| 35 | Align the breadcrumb deletion in D100 step 1b to 4 hours after ride end, from 4 hours after last update (§16.12 U-1, ruled 2026-11-15). |

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

## §16. Brain Session Decision Record, 2026-11-14 to 2026-11-15

Session opened 2026-11-14 on the Hands' agenda; decisions completed 2026-11-15. Seven agenda items, all ruled. All are Senior PM rulings unless marked otherwise. Written into the Pillars at the MACD sync of 2026-11-15: Charter v1.2.0, Specs v1.2.0, Quality Gate v1.2.0 and this Ledger v1.2.0. Source record: the session rulings register dated 2026-11-15, with the Sprint 1 write-back packet, the SD-011 Pillar V amendment and the Hands' supplement of verified facts. Closed. Flag conflicts rather than absorb them.

**Label note.** The register numbers its four code-versus-Bedrock contradictions C1 to C4. Those labels collide with G33 rulings C1 (breadcrumb), C2 (roster page) and C3 (departure) at §8.2. In this Ledger the session's four are written "Contradiction 1" to "Contradiction 4", and a bare C1, C2 or C3 always means the G33 ruling.

### 16.1 Production gate, EU gate, launch countries

Pre-settled by standing direction of 2026-11-07: the Sprint 1 field run is not a gate.

| Gate | Must be true |
|---|---|
| **A: before the first production migration** | Supabase Pro with a verified backup |
| | Beacon visibility ruled (done, §16.3) |
| | Contradictions 2 and 3 written into the Bedrock (done at this sync, §16.2) |
| | `master` merged into `rail3-integration`, one ordered set of 77 migrations |
| | Each staging-only object captured in a migration or dropped (ruled, §16.8) |
| | Captain End Ride covered against the D96 restrictive policy (W259 pitfall 2) |
| | Three-Amigos review held |
| **B: before a production-backed build reaches Play** | W193 role-scoped channels, with Race Control admin access |
| | D50 closed, including position columns, built to Pillar II §4.1 |
| | D94 ride scoping |
| | Beacon insert and cancel-field tightening, with the `actor_deleted` rule |
| | Public web `ride:<id>` channel verified and closed |
| | Mobile roster on the contacts function, with a rider-facing leader-contacts version |
| | The inactivity close replacing the 24-hour sweep (Contradiction 1) |
| | Production fallback club pointed at a demo club, not Bikes and Beers |
| | Config de-staged |
| | Privacy policy and in-app disclosure updated: beacon visibility, 30-day beacon retention, breadcrumb deletion |
| **EU gate: before any EU distribution or EU club** | Privacy policy gains lawful basis, EU rights including complaint to the Irish DPC, and a transfer note naming Canada and the US |
| | An Art. 27 representative is appointed |
| | A privacy lawyer has reviewed the policy and the retention periods |
| **Not a gate** | Sprint 1 field run; the D2 scheduler set beyond the inactivity close; derived ride artifacts; the Sleeping conditions; the roster tracking value; multi-membership |

**Launch countries: Canada and the US** (ruled 2026-11-15), for the open-test narrowing and for the production launch. The EU opens only through the EU gate.

**Dropped from the gate: D93.** A trigger from the D96 fix already blocks rider self-promotion on both databases. Probe and close.

### 16.2 Contradictions between running code and committed Bedrock

**Contradiction 1, wall-clock ride close. Bedrock stands.** The D100 retention job ends any ride still active 24 hours after it started, on staging and on production. Pillar II Feature 3, B2 at §8.2 and slate 1 at §8.3 forbid any wall clock. Ruled AMIP option (b): the Bedrock is correct. The sweep is replaced by the inactivity rule of Feature 3. Slate 1 is not amended. **Known nonconformance, recorded:** the 24-hour sweep stays live in running code until the inactivity close ships, which is a Gate B requirement and is not in the next sprint.

**Contradiction 2, Support Beacon record retention. Amended.** As built, beacon rows were kept permanently with coordinates cleared at 30 days; Pillar II §2 and R3-36 said deleted at T+4h. Ruled AMIP option (a): the whole beacon row is deleted 30 days after it was raised. One rule, no separate audit record. This replaces "the record remains" in the privacy policy. Dissent recorded at §9.1.

**Contradiction 3, breadcrumb retention. Amended. G33 ruling C1 reversed on its purge exemption.** As built, the breadcrumb is deleted after 4 hours; Pillar II §2 and Feature 11 made it a purge-exempt club artifact. Ruled AMIP option (a): the raw breadcrumb is deleted. What may replace it is recorded at §16.6. Capture during the ride is unchanged.

**Contradiction 4, the W206 exception. Superseded with F-07.** W206, ratified 2026-06-15, made a Captain's or SAG's beacon visible to every rider. It was never written into the Bedrock and conflicted with F-07 as resolved 2026-09-13. Both are superseded by the beacon visibility ruling at §16.3.

**Process finding.** Contradictions 1, 2 and 3 shipped in D100 with no Pillar V amendment, and W206 was ratified with no Bedrock entry. A retroactive Pillar V amendment for D100 is owed by the Hands (§14 item 24). Logged at §13.4 as F-17.

### 16.3 Support Beacon visibility. F-07 and W206 superseded

| Question | Ruling |
|---|---|
| Who sees a beacon | Every app participant on the ride, plus club admins in Race Control |
| PWA roster page | Does not show beacons. Guests and riders without the app see none |
| Position | The beaconing rider's live position goes to everyone on the ride while the beacon is active, ending on cancel or ride end |
| Contact | Between riders only: a rider seeing another rider's beacon gets name, position and beacon state, with no phone number and no dial button. O-07 stays parked. Captain and SAG see phone numbers as always |
| Cancel rights | Unchanged: the beaconing rider, Captain and SAG |
| F-07 and W206 | Superseded by the rule above |
| Enforcement | Server-side, in Gate B, on the W193 channels |
| W193 | A Gate B requirement. Grounds: the disclosure must be true on the wire, message cost grows with the square of ride size on one channel, and the 100-rider ceiling in Pillar II depends on it |
| Beacon and Sleeping together | A beacon outranks Sleeping on every map. The marker shows as a beacon with the age of the position until cancelled. Senior PM reasoning: the rider is reachable by phone and unlikely to have moved with a beacon active |

The F-07 entry at §8.5 recorded that widening would be the change needing justification. On record: the Senior PM's note of 2026-11-10, that a beacon should not be limited to Captain and Support, opened the question, and the ruling scopes the widening to the ride, not the club.

The build in Google review at the time of the ruling still hides rider beacons, so what was submitted is accurate. The cascade to the in-app disclosure, the Play listing, the Data Safety form and the background-location declaration applies when the widened build ships.

Written into Pillar II §3 Features 1 and 2, §4.1 and §4.2, and into Pillar III Global Rules, the Scenario 22 annotation, R3-10, R3-17, R3-19 and R3-31.

### 16.4 Sprint 1 (G34) close

**Timing.** The write-backs are ratified now on built behaviour, each marked "built, unvalidated". G34 closes as build complete. Verification is carried as a named open item that reopens when ride tests resume (§10).

| Packet item | Ruling |
|---|---|
| A.1, §14 item 10, power posture | Ratified as built, unvalidated. Record at §17.1 |
| A.2, §14 item 11, beacon data | Ratified as built, unvalidated. Closing bullet redrafted at this sync: D81 is built, and D100 clears `last_ping`. Record at §17.2 |
| A.3, §14 items 15 and 23, roster row state | Ratified as built, unvalidated. Record at §17.3 |
| A.4, §14 item 16, sign-out order | Ratified as built, unvalidated. Record at §17.4 |
| B, finding F-7, R3-45 third clause | Adopt the built `fixes_seen` count. R3-45's third clause amended to assign the killed-app case to the server staleness detector. That part of the clause is unmet until the detector ships |
| C.1, self-health fallback | Ship Ledger-confirmed values as a client fallback once they exist. The server value wins when it loads. Until E.4 is measured the warning is off, **a known production limitation, recorded here** |
| C.2, permission-denied rider | No warning, ratified as built. A passive indicator is added on the rider's own dot, a third overlay in Pillar II §5.3: background tracking is off, tap opens Settings, no prompt |
| D, R3-66 against §4.1 | R3-66's parenthetical reworded to defer to §4.1. §4.1 stands and **supersedes the D50 ticket note of 2026-07-03**: every role sees the full roster by name, phones for leaders only. The R3-74 leader-contact point is moot |
| E.1, co-Captain phone | Co-Captains see each other's numbers on both roster and map. The map aligns to the roster |
| E.2, R3-42 recovery window | Two heartbeats, 120 seconds, for an app that is still alive. A killed app is the staleness detector's case. The 120 is a Brain proposal from the 60-second interval, not a measured value. Value at §12.2 |
| E.4, two Saver values | Open. The measurement run has not happened |
| E.6, no-route behaviour | Accepted until Feature 6 is built |
| E.8, text banners | Third named exception in Pillar II §5.1, limited to Captain departure and return, and to telling a user an action they just took has failed |
| E.9, Sleeping | Enshrined as a fifth state in Pillar II Feature 4 and §5.3, a named exception to the ping-derived rule. Meaning: the rider's app is not tracking in the background and the position shown is the last one known. Conditions for the Hands: (1) stored on the ride record so every viewer agrees, (2) the bottom sheet shows the age of the position, (3) Race Control shows it (W198), (4) a beacon outranks it. The label goes to Voice and Tone |
| Roster tracking value, raised in session | A fourth roster participation value, "tracks only while the app is open", shown to Captain and SAG only. It records the standing fact, not the momentary Sleeping state, so the §4.1 line against duplicating ladder state into the roster holds. Wording to Voice and Tone |

Record-only: E.3, the 60-second last-known write confirmed 2026-10-03, gets its §12.2 row and closes §14 item 21. E.5, the purge gap, is overtaken by D100. E.7, the O-08 write-back the Brain owed, is discharged at §10 and §14 item 12.

### 16.5 SD-011

Amended and enshrined at §1. One new scenario in Pillar III, R3-78. One sentence in Pillar II Feature 2, and the schema row for `beacon_cancel_reason`.

### 16.6 Deferred value: derived ride artifacts

Parked, no timing. Two artifacts, both derived from the breadcrumb before its 4-hour deletion:

- **Ride shape.** A record of what the club rode that day. It carries no connection to any person.
- **Save as route.** The Captain elects to save the ride's trail to the route library, so it can be posted again as a future ride.

Binding on both: no timestamps, no per-point identity, and the raw breadcrumb is still deleted. Capture gaps show as breaks.

Precision differs by artifact, by Senior PM correction of 2026-11-15: the ride shape is reduced in precision; a saved route keeps full precision, because it has to be rideable.

To rule when picked up: the ride shape would be kept automatically, the route is elected. The privacy policy and the Data Safety form need a sentence before either ships.

### 16.7 EU, US and multi-membership

**EU.** Its own gate (§16.1). Product position on lawful basis, for the lawyer to confirm: contract for the account and ride participation; consent for background location, supported by the app working when a rider declines; legitimate interest for beacon rows and telemetry with stated retention. Transfers: Canada under the EU adequacy finding for PIPEDA organisations; the US database under Supabase's Standard Contractual Clauses.

**US.** With the US in the launch countries, the privacy policy wants a short US line. It cites only PIPEDA today. For the lawyer's review; not a gate.

**Multi-membership.**

1. Not in the production move. Production launches on "one rider, one club".
2. Pulled forward to directly after production, ahead of its v3.0 roadmap slot.
3. One amendment, two parts that ship together: the web change as W258 describes it, and a rider's choice of club in the app.
4. The Hands confirm no production account holds two memberships today. The Brain inferred this from the web guard, not from data (§14 item 32).

### 16.8 Housekeeping rulings

Accepted by the Senior PM on 2026-11-15.

| Item | Ruling |
|---|---|
| PR #55 (W171) | Close without merging |
| `rider_states` table | Retired in Pillar II. Rider state travels in the broadcast. The Hands decide whether the table is dropped |
| Identity hydration trigger (staging-only) | Drop, after the roster moves to the contacts function |
| `rail3_sag_allowlist` (staging-only) | Drop |
| D70 admin branch (staging-only) | Capture in a migration |
| W197 and W259 | One ticket. W259 rewritten to the confirmed gate; W197 closed into it |

### 16.9 Charter §3, the $0 operating cost target

Amendment approved. The inherited $0 target stands, with three named exceptions: Supabase Pro for production, with staging returning to a free org after the move; the Transistorsoft licence, purchased 2026-08-01; the domain registration at Porkbun. The list is open. Further exceptions are added as the Senior PM decides them, each named in the Charter. Written into Pillar I §3 at v1.2.0.

### 16.10 Next sprint goal. Ratified 2026-11-15

> **Enforce the Pillar II §4.1 visibility and contact rules on the server, as amended at this session's MACD sync, and prove it with denial tests on a staging database rebuilt from the merged trunk.**

Covers, for the Hands to decompose: trunk merge and staging rebuilt to match, with the three staging-only objects resolved; W193 including Race Control access and the widened beacon rule; D50, D94, beacon insert and cancel tightening, `actor_deleted`; the public web channel check; the roster on the contacts function with the leader-contacts version. The in-app disclosure wording changes in the same build.

Leaves out: the production migration, Supabase Pro, the inactivity close, the fallback club, and the deferred list from agenda item 1.2. Those stay unscheduled.

Dependency: the goal traces to Pillar text that does not exist until this MACD sync is committed. Risk: if the decomposition is too large, W193 stays and the roster work moves.

### 16.11 Still open after the session

| Item | Owner |
|---|---|
| Narrow the open-test countries to Canada and the US in Play Console | Senior PM |
| Voice and Tone pass on placeholder copy, including the Sleeping label, the fourth roster value and the beacon disclosure sentence. Needs the Hands' copy list. Before the sprint builds the disclosure change | Senior PM with the Brain |
| E.4, the two Saver values | Waits on the measurement run |
| G34 verification | Reopens when ride tests resume |
| Retroactive Pillar V for D100 | Hands |
| Privacy lawyer review | Senior PM, before the EU gate |
| Brain readings not verified in code (§14 item 34) | Hands to confirm |
| The deferred list in agenda item 1.2 | Unscheduled |

### 16.12 Not settled by the register, raised at text authoring

The MACD seed barred new decisions. Each item below is something the register does not answer. The text was written the way stated. Seven were ruled or confirmed by the Senior PM on 2026-11-15 before commit and are marked; the other eight stay open and are carried as stated in the last column.

| # | Item | How the text was written |
|---|---|---|
| U-1 | **Breadcrumb deletion clock.** The register puts the breadcrumb in the personal-data class, which is T+4h from ride close. D100 step 1b deletes it 4 hours after its last update. Inside the twelve hour envelope those differ: a Captain away for more than 4 hours loses the trace mid-ride, and the committed resume into the same breadcrumb has nothing to resume into | Written as T+4h from ride close. **Ruled 2026-11-15: 4 hours after ride end.** The built clock is a nonconformance until the Hands align it (§14 item 35) |
| U-2 | **Scope of the C1 reversal.** The register says "G33 C1 is reversed" in a row about retention | Read as the purge exemption only. Capture ownership, continuity, the visible gap and read-side backfill left standing. **Confirmed 2026-11-15:** the breadcrumb during the ride does not change from what it does today; the session's discussion was post-ride only, the two derived artifacts at §16.6 |
| U-3 | **Where the 120 seconds lives.** The register lists the R3-42 window under Pillar III and calls the number unmeasured. The standing principle at §8.4 slate 12 keeps unmeasured numbers out of Pillar III | Rule in R3-42 (two heartbeat intervals, app alive); value at §12.2. **Confirmed 2026-11-15** |
| U-4 | **Stale overlay for riders.** Pillar II §5.3 commits "stale under beacon" to Captain and SAG surfaces. Riders now see beacons. Only the beacon-with-Sleeping case is ruled for every map | Left at Captain and SAG, with the Sleeping case stated separately |
| U-5 | **Sleeping detail.** The register gives the meaning and four conditions. It does not say what ends the state, or whether a Sleeping rider ages to Dark | Recovery written as "valid ping → Active". Precedence against Dark not written. With §14 item 34 for the Hands to confirm |
| U-6 | **Fourth roster value, other viewers.** Shown to Captain and SAG only. What a rider or guest sees on that row is not ruled | Not written |
| U-7 | **Per-ride phone copy.** D100 step 1 clears the participant row's phone at T+4h, a Senior PM decision of 2026-11-09 on the D100 ticket. It is in no Pillar and not in the register. It may touch R3-36's "guest roster records are retained" | Not written. Belongs in the retroactive Pillar V for D100 |
| U-8 | **Race Control.** Named by three rulings and defined nowhere in the Rail 3 Bedrock | Only what the rulings touch: beacon and Sleeping visibility for club admins, and channel access. **Named 2026-11-15:** a Charter §5 glossary row defines Race Control as the live ride view in the web admin portal, for club admins. What it shows beyond beacons and Sleeping stays undefined |
| U-9 | **Charter cascade.** The register lists Charter §3 only. The rulings also made the §3 Hard Purge line, the Paddy persona and two glossary rows false | Conformed, minimally, and listed in the Charter change log. The $0 target itself is inherited from the Rail 1 Charter, which is untouched. **Confirmed 2026-11-15**, with the Senior PM's reasoning on the first: beacons carry more value than other data, and 30 days is an exception that aligns with an existing timer |
| U-10 | **Amendment Protocol shape.** The framework has an approved Pillar V summarised in the Charter with Pillars II and III left static. The register rules edits to II, III and IV and none to the Charter | Register followed. **Confirmed 2026-11-15:** the Pillars are complete on their own |
| U-11 | **Late beacon.** The approved Pillar V table covers a beacon written after its ride ended. The register's table does not mention it | Noted at §1 as built behaviour; not in R3-78. **Confirmed 2026-11-15** |
| U-12 | **R3-54's last clause** relies on R3-45 and inherits its limit. The packet's reviewer flagged it; the register is silent | Untouched |
| U-13 | **`beacon_active` after ride end.** The inputs do not say whether the flag is reset at ride end or at purge | Stated as unconfirmed at §17.2 |
| U-14 | **Inactivity N.** Feature 3 says N hours, tenant-configurable. No default is recorded anywhere. Needed before the inactivity close is built | Not written |
| U-15 | **"App participant" on the server.** Beacons are ruled visible to every app participant on the ride, with the PWA roster page showing none. A roster-only member with a web session is still a ride participant to the database | **Ruled 2026-11-15:** the server lets riders with the app on that ride see beacons. Written into Pillar II Feature 2 as a participant who has opened the ride in the app and has not left it, plus the club's admins. The first-open mark (§17.3) is the signal |

---

## §17. G34 Write-back Record

Sprint 1 (G34) write-backs to the §14 items, ratified by the Senior PM on 2026-11-15 on built behaviour. **Every entry is built and unvalidated.** The code is merged to `rail3-integration` and installed on the field build (build 993020f, EAS ff53208f); none of it is field-validated. G34 verification reopens when ride tests resume (§10). Text is the Hands' proposed write-back from the Sprint 1 packet, with the item 11 closing bullet redrafted as ruled.

### 17.1 Item 10: interim power posture (slate 2)

Interim posture as built, recorded as interim per slate 2. No G34 ticket changed the posture; W286 and W287 added recovery and teardown reads on the heartbeat.

- **Engagement.** The engine starts at join with a one-shot `changePace(true)` (D90). This is not forced streaming: `disableStopDetection` is not set, so the SDK's motion detection and stop timeout return a genuinely stopped rider to stationary, services off. The stop timeout is the SDK default; it is not pinned in code.
- **Cadence.** Distance-based: `distanceFilter` 40 m with elasticity disabled, `locationUpdateInterval` and `fastestLocationUpdateInterval` 5 s as a rate cap, high accuracy.
- **Liveness.** `heartbeatInterval` 60 s, the Android floor, with no `preventSuspend`. On each beat: if `getState().enabled` is false the engine is re-asserted (W286); otherwise the D88 self-check samples a position while stationary and forces moving past 40 m.
- **Survival.** `foregroundService: true`, `stopOnTerminate: false`, `enableHeadless: true` (W286 headless re-assert on heartbeat, terminate and providerchange), `startOnBoot: false`.
- **Exclusion.** `autoSync`, `url` and `batchSync` are absent per B1.

Neither D88 force-track nor D90 is superseded. The always-on telemetry tier (W284) is live on staging, so the slate 2 evidence trigger is reachable. The posture stays deferred on its own trigger (§10).

### 17.2 Item 11: beacon schema confirmation (slate 7)

Confirmed in G34 (W282) with no schema change: the durable current-state flag is the existing `ride_participants.beacon_active` (boolean, default false), previously unused.

- **Raise.** Writes `{beacon_active: true, last_lat, last_long, last_ping}` in one own-row UPDATE before the alert is broadcast. With no fix yet, only the flag is written (D79).
- **Cancel.** Writes the `beacon_alerts` audit row first, with the SD-011 named actor, then `beacon_active = false`.
- **Read path.** The flag is read on mount, on focus or resume, and on channel activation, and the seed is authoritative for absence. There is no event history and no replay; a beacon settled while the device was blind is never re-raised.
- **Returning device.** It renders the beacon at the raise-time last-known with a dashed stale overlay, for Captain and SAG viewers only as built, until live supersedes.
- **RLS.** The existing `participant_update_policy` permits the own-row raise and a Captain or SAG clear; there is no new policy and no recursion surface.
- **Ride end and purge.** Redrafted 2026-11-15. The server-side ride-end close is built (D81): a beacon open when its ride ends is closed with reason `ride_ended`, and no beacon flag can be set after ride end. The retention job (D100) clears `last_ping` with the last position at T+4h. The superseded `hard-purge-location` function is not the purge path. Not stated in the session inputs: whether `beacon_active` is reset at ride end or at purge. The Hands confirm (§16.12 U-13).

This write-back predates the beacon visibility ruling at §16.3. The viewer scope in the fourth bullet is as built; who sees the stale overlay under the widened rule is open (§16.12 U-4).

### 17.3 Items 15 and 23: roster per-row participation state and its treatment (slate 17)

Built in G34 (W288, extended by W292) as one per-row state: the ruling C2 non-app-user mark widened to the slate 17 population, a single state with no new class.

- **Signal.** New nullable column `ride_participants.rail3_joined_at` (migration 20260916000000), stamped only when the participant first opens the ride in the Rail 3 app. Web and edge-function inserts leave it NULL by construction. There is no backfill, because no historical signal separates app openers.
- **Derivation.** Roster only when there is no account or `rail3_joined_at` is NULL; otherwise App tracked. It is never derived from current ping state; the input type carries no ping field. An app rider who is not currently producing a position stays with the fleet ladder and is not duplicated into the roster.
- **Departure.** W292 adds a third value, Left ride, from the durable `departed_at` mark (migration 20260918000000). Rows are retained, never deleted (R3-70).
- **Treatment (item 23).** A neutral grey chip, never red and never failure framing (R3-74). Wording is the Hands': "App tracked", "Roster only", "Left ride". Placeholder copy pending Voice and Tone.
- **Visibility.** Every role sees every row (§4.1). Phone numbers follow §4.1: command sees all, and everyone sees the leaders' (slate 8). The roster is ride-scoped and closes on Saved (slate 11).

The fourth value ruled in session, "tracks only while the app is open", is not part of this write-back. It is new work (§14 item 30).

### 17.4 Item 16: built sign-out ordering

Built in G34 (W281, cache clear completed by W289). Ordering pinned in `mobile/src/lib/signOutSequence.ts`, node-tested:

1. Departure is issued under the still-valid session.
2. The wait for it is bounded at 3 s. The call keeps running; a hung or rejected departure never blocks sign-out.
3. The active-ride holder is cleared.
4. `supabase.auth.signOut()` runs.
5. On the resulting user-id change, the roster cache is cleared and its key rotated.

"Fire-and-forget" is implemented as "never wait for acknowledgement", not as firing after the identity is gone. A departure that outlives the window re-checks the live identity and writes nothing under a different account. The cache clear sits after the departure by construction (R3-58, slate 11).

Correction to the R3-58 note that the PoC already implemented this ordering. It was true in order but not in bound. Before W281 the departure was awaited unbounded, so a hung request blocked sign-out; and an account swap that bypassed sign-out did not clear the holder, so the new account inherited the old binding (R3-57). Both are fixed.

Known limits: a swap that bypasses sign-out leaves the old row un-departed until the deferred server staleness detector; a rider who declined background permission has no holder, so no departure fires.

---

## §18. Ledger Receipt: Brain Session 2026-11-14 to 2026-11-15

**Status of this receipt: COMMITTED.** Text authored 2026-11-15 and approved by the Senior PM the same day, after ruling U-1 and U-15 and confirming five text readings (§16.12). A Race Control glossary row in Charter §5 and two wording corrections to Pillar II were folded into v1.2.0 at the Senior PM's review the same day, before the files reached Drive or Git: the rider-visible numbers are named as the Captain's and SAG's in Feature 2 and §4.1, and the §2 Real-time Pattern subscribe rule is tightened to the Feature 2 server line. Date source: the session clock supplied with the Senior PM's message, 2026-11-15, America/Toronto. No time of day is recorded.

| Version | Date | Time | MACD Action | Strategic Decision / Pivot | Trio Lead |
|---|---|---|---|---|---|
| Pillar I v1.2.0 | 2026-11-15 | — | CHANGE | Charter §3: three named exceptions to the $0 operating cost target, list open. Hard Purge line gains the 30-day beacon record exception. Persona and glossary conformed to the beacon and Sleeping rulings. | TPM |
| Pillar II v1.2.0 | 2026-11-15 | — | CHANGE | Retention model amended: beacon records whole-row at 30 days, breadcrumb to the personal-data class, `rider_states` retired. `beacon_cancel_reason` added. Beacon visibility widened to every app participant on the ride plus club admins in Race Control, enforced on the server. Sleeping enshrined as a fifth state. §4.1 matrix, §5.1 third exception, §5.3 third overlay. C2 container diagram to v1.2.0. | TPM |
| Pillar III v1.2.0 | 2026-11-15 | — | CHANGE | Beacon visibility scenarios amended. R3-36 and R3-70 retention amended. R3-45 third clause, R3-42 window, R3-66 parenthetical. R3-78 added, ride-end beacon close. Seventy-one scenario entries. | TPM |
| Pillar IV v1.2.0 | 2026-11-15 | — | CHANGE | SD-011 amended. §16 session decision record, §17 G34 write-back record. Production gate, EU gate and launch countries. G33 ruling C1 reversed on retention; F-07 superseded. Contradiction 1 logged as a known nonconformance. Beacon retention dissent recorded. Deferred value and next sprint goal recorded. §14 items 10, 11, 12, 15, 16, 21 and 23 closed; items 24 to 35 added. Findings F-17 to F-24 logged. | TPM |

**Session totals.** Seven agenda items ruled. Four code-versus-Bedrock contradictions resolved: one Bedrock stands, two amend, one superseded. Fifteen items left unsettled by the register and listed at §16.12; seven ruled or confirmed at commit, eight carried. One known nonconformance in running code, the 24-hour sweep. One known production limitation, the self-health warning being off until its values are measured.

---

*End of [Vechelon Rail 3] Pillar IV: The Ledger (v1.2.0)*
