# [Vechelon Rail 3] G33 Brain-Session Companion — Slates, Revisions & Session Record

Project: Vechelon Rail 3 — Mobile Tactical | Parent: G33 | Compiled: 2026-07-27 | Status: BRAIN-SESSION SEED — DOES NOT SHIP TO THE HANDS

> Companion to `wTBD1_rail3_bdd_survey_input_HANDS.md`. This file holds the deliberation record and decision slate for the Strategic Re-engagement session that consumes W277's outputs. Seed the session with: this file + the Hands artifact + W277's two returned artifacts + the committed Pillars.

---

## 1. Committed-Set Revision Slate (queued [CHANGE]s — Immutable Numbering respected)

| Item | Nature | Session action |
|---|---|---|
| R3-34, R3-35 | Name expo-location/expo-task-manager; build runs Transistorsoft. Intent (send starts at join, stops at end, notification cleared) fully valid; only the mechanism is stale. | Ratify draft text at §7.1/7.2 (decision-independent); record the build-vs-buy decision (finding a) in Pillar II §2. |
| R3-01 | Valid; provably true only because of uncommitted work (D91). | Ratify trace repoint at §7.3 (decision-independent). |
| R3-04 | Chain correct; "rider may not be aware tracking has stopped" is the masking problem D88/D90 made a requirement. | Fill brackets from slate 4/5 decisions, then ratify draft at §7.4. |
| R3-02 | Stays as measurement exercise. Tension: D88 reclassified silent invisibility on a compliant device as core-guarantee failure. | Decide the Rail 3a successor criterion; adopt or discard the option at §7.5. |
| R3-05/06 | Behaviourally intact; non-blocking rule preserved. Tension: "Saver is the threat" theory partly a red herring per D91. | No change; note the theory shift in the Ledger. |

## 2. Killed Scenario Record

**R3-64 (mid-ride portal greying) — KILLED 2026-07-27.** Authored on a misreading: "grey" in the field records is the render state (Feature 4's ladder), not a portal admin action; no portal-greying feature exists in any record. Covered by the committed Feature 4 table + R3-62. Number retired, not reused. (Process note: inference hardened into a scenario without evidence — caught by Senior PM review; the "admin greys a rider mid-ride" framing was also scrubbed from session notes.)

## 3. Brain-Session Decision Slate

1. **Ride-duration envelope** — commit it (includes >9h rides); re-derive battery target and power posture from it. Committed nowhere; Charter-level candidate. Envelope also multiplies token-refresh exposure (R3-51) and reshapes self-health/battery arithmetic.
2. **Power posture during active rides** — D88 force-track vs D90 stopTimeout-stationary: CONFLICTING field postures. Evaluate against the envelope; possibly duration-adaptive. R3-50 encodes the invariants both must satisfy. Pre-registered Engineering lean (priced on the short envelope, weakened by the >9h fact): bias toward liveness — now explicitly duration-dependent.
3. **Background wake / recovery mechanism** (R3-42) — TS heartbeat/headless/autoSync and/or server-initiated FCM wake. Shares infrastructure with parked O-08 (SOS push) and teardown reachability (R3-69 / slate 13) — one infrastructure answer likely covers all three. Caveats recorded: network reach limits server wake (dead-zone riders — R3-39 remains fallback); nothing is guaranteed against an OEM killing the FGS outright (D88), so R3-40/41 stay non-negotiable regardless; sizing needs post-D91 field data on how often re-asserts actually fire.
4. **Self-health thresholds** (R3-40/43) — value selection; must sit above or gate on the Saver-at-start window (~3–4 min residual, unticketed — ticket recommendation queued in the W277 brief).
5. **Stale-vs-Dark presentation** (R3-41/44) — fifth state vs Dark refinement vs overlay. Design note on record: glanceability budget argues against a fourth/fifth visual state lightly added.
6. **Telemetry as requirement** (R3-45) — candidate Pillar II addition; Engineering's strongest advocacy on record ("zero fixes and no way to know why" is the worst state this domain produced, twice).
7. **Missed-while-dead reconciliation** (R3-55) — DB-snapshot-on-focus (parked in D72 pending Pillar II §2 privacy ratification). Beacon horn: fire-and-forget Broadcast loses a beacon raised during receive-blindness — decide whether beacon state gets a durable read path distinct from position ephemera. Privacy tension with Hard-Purge ethos is why D72 parked it.
8. **Session handoff, cross-surface** (R3-61) — deep-link token vs QR-carried vs silent re-auth; friction budget at ride start is the binding constraint. PWA/native are separate session containers — nothing extends automatically.
9. **Command-coverage bundle** — ONE decision covering: End Ride authority after Captain departure, command visibility, breadcrumb sourcing/handoff, and (dependent) the trace-toggle auto-switch trigger. Options each answer all four together: role transfers to Support / captainless-degraded / Captain designates.
10. **Breadcrumb design** (finding g, scenario R3-72) — Senior PM lean, not decided: disappears on Captain departure (no handoff, no frozen trace); on rejoin, resumes holistically or starts fresh. Resume-vs-restart carries different Hard-Purge postures ("comes back holistically" requires server-side path survival; ephemeral-by-design leans starts-again). Design trade on record: disappearance is maximally honest but trades away the fleet's shared route memory (Route Overlay covers the planned-route case). R3-72's final clause ("follows the ratified command-coverage design") is the BDD hook this decision fills; the parked trace-source toggle (§4) — including breadcrumb auto-switching to route overlay on Captain departure — is the candidate mechanism and should be decided alongside or explicitly deferred.
11. **Roster page extension** — beyond Captain/Support; viewability outside active rides; PWA+native shared surface; offline caching (cached phone numbers vs Hard-Purge ethos — privacy ratification required). Surviving rationale legs after the ride-scoped correction: safety reach into this ride's participants (guests strengthen it), iOS bridge via PWA. Guest intent (Senior PM): the integrated app will support guest participants, including their presence on the roster page — participant model and roster design must accommodate guests without rework; guest join itself stays gated behind PDoD-03's Brain session.
12. **Seed-to-live ceiling** (R3-62: ≤30s) — hard NFR vs guideline vs test observation. The 30s–2min ambiguity window was weighed and accepted (passive transitions, human judgment, glanceability); re-opens only on field evidence of Captains burned inside the window.
13. **Ride-end teardown reachability** (R3-69) — how the end signal reaches locked/unreachable devices; "no engine tracks a ride that no longer exists." Same infrastructure family as slate 3.
14. **Rule on the committed-set revision slate** (§1 above) and enshrine load-bearing wTBD1 scenarios into Pillar III via MACD.
15. **Platform-substrate home** — Supabase Auth contract (token lifetime, refresh, RLS interaction) and the session-handoff contract have no Bedrock home; four rail/product-scoped Pillar sets exist, no platform set. Routes to the G33 successor's definition pass (fifth Pillar set vs shared-substrate section — decide there, not here).
16. **Ride presentation surface** (R3-73) — the ride-list contract's open values: how far ahead "upcoming" reaches (presentation window), and the visual treatments for scheduled-vs-started and RSVP'd-vs-not (treatments never affect joinability, per committed RSVP ruling). Survey returns the current query and window as baseline.

## 4. Parked Items (future sessions — NOT this slate)

- **Trace-source toggle:** breadcrumb (default — riders carry planned routes on Garmin/Strava; breadcrumb is Vechelon's differentiated signal: "Vechelon is the OS") / route overlay / no trace, per-rider. On Captain departure, breadcrumb viewers auto-switch to route overlay with a visible cue framed as Captain-departure news ("Captain has left" is the news; the trace swap is the consequence). Fallback no-trace when no route exists (R3-14 case). Open sub-question: per-ride default reset vs sticky preference (lean: per-ride reset — conservative for a tactical instrument; lean inference, not Senior PM statement). Joins the command-coverage bundle as a dependent. Cautions on record: third interactive control on a glanceable surface; auto-switch is an uninitiated mode change and must not be silent.
- **Rail 3 contact-scope** (O-07) — parked, dedicated Trio session.
- **SOS push notification** (O-08) — parked; same-day write-back to Hands required; co-justifies with slate 3's infrastructure if ratified.
- **Seniors SaaS concept** — untouched this session; e-ink surface intent remains the load-bearing open question before a first Charter ADD.

## 5. Session Decisions & Rulings Record (2026-07-27)

| Ruling | Content |
|---|---|
| AMIP contradiction → (b) | 2026-05-12 Pillar II v1.0.2 / Pillar III v1.0.0 confirmed committed Bedrock; engine evolution is Hands-resolved, un-enshrined; dual-sourcing established. |
| G33 candidate-example [CHANGE] | Detector-unification thesis superseded by D91; Stride edits delegated to the Hands via the rev 2 brief's CHANGE REQUEST. |
| Build-vs-buy | Transistorsoft license: buy won over expo-location; driver was Android background shutdown. To be recorded in Pillar II at enshrinement (finding a). |
| Roster model | Roster = record of joins, not a gate; joiners not on roster are added, Rider role only; RSVP never a precondition; guests portal-side only (RSVP/planning), invisible to Rail 3 until PDoD-03 session. |
| Departure model | Leave Ride is the trigger (built); sign-out is session-only; ride survives any departure incl. Captain; last-participant exemption considered and dropped (auto-close backstop). |
| Seed-until-live | Design ruled solid; ≤30s ceiling; 30s–2min window considered-and-accepted; masking demoted to test-plan consideration. |
| Duration envelope | Rides may exceed 9 hours; envelope uncommitted — slate 1. |
| Authentication domain | Shared platform substrate; Rail 3 owns session-lifecycle conduct only. |

## 6. Open Non-Blocking Items

- D77 and D87 Stride transcriptions (trace-hardening only; scenarios drafted defensively without them).
- wTBDn convention instilled (Senior PM): Brain-proposed tasks carry wTBDn placeholders encoding proposed sequence; the Hands assign real W-numbers only at actual ticketing and record each substitution. The BDD artifact is wTBD1; future Brain proposals number from wTBD2 in proposed order. Generalizable PTAP methodology addition — flows to the public repo per the one-way valve.
- Count record: 36 scenarios (R3-37–R3-73; R3-64 retired). Prior notes of 28 and 35 superseded — 28 was an arithmetic error; 35 predates R3-73's addition.
- Second review round (2026-07-27, Senior PM-approved): R3-43 delay-window reword; R3-44 thresholds changed to tenant-configured references; R3-53 reworded and R3-62 gained the canonical last-known-until-superseded clause; R3-65/67 revised — departure retains the roster entry (marked departed, details available to Captain and Support) and removes from the fleet map only; R3-73 added; clarifying trace notes on R3-39, R3-55, R3-68. Enshrinement note for slate 14: the roster-retention revision means departure is a roster state change, never a deletion.

## 7. [DRAFT] MACD Packet — Committed-Set Revisions (ratify at session; nothing below touches Pillar III until MACD)

Status: DRAFT / UNDER AUDIT (Broken Link discipline: committed text and these drafts intentionally diverge until the sync). Immutable Numbering respected — same numbers, amended content. Each entry: committed original → proposed replacement.

### 7.1 R3-34 [CHANGE — decision-independent, ready to ratify]

**Committed (v1.0.0):**
```
Given a registered member taps Join on an active ride
When the join action completes
Then the expo-location background task is registered via expo-task-manager
And the app begins broadcasting GPS positions to the ride-scoped Supabase Broadcast channel
```

**Proposed:**
```
Given a registered member taps Join on an active ride
When the join action completes
Then the Transistorsoft background geolocation engine is started for the ride
And the engine is deterministically engaged per R3-37
And the app begins broadcasting GPS positions to the ride-scoped Supabase Broadcast channel
```
*Proposed trace: Pillar II §2 — "Background task registered at ride Join" (intent unchanged); mechanism per the ratified build-vs-buy decision (drift finding a). Cross-ref R3-37/38 for engagement and lifecycle-independence semantics.*

### 7.2 R3-35 [CHANGE — decision-independent, ready to ratify]

**Committed (v1.0.0):**
```
Given a ride participant is in an active ride with background GPS running
When the ride transitions to Saved (Captain ends ride or midnight auto-close)
Then the expo-location background task is de-registered
And the app stops broadcasting GPS positions
And the Foreground Service Notification is dismissed
```

**Proposed:**
```
Given a ride participant is in an active ride with background GPS running
When the ride transitions to Saved (Captain ends ride or midnight auto-close)
Then the Transistorsoft background geolocation engine is stopped and its background task de-registered
And the app stops broadcasting GPS positions
And the Foreground Service Notification is dismissed
And teardown of backgrounded or unreachable devices completes per R3-69
```
*Proposed trace: Pillar II §2 — "Task de-registered at ride End or session expiry" (intent unchanged); mechanism per drift finding (a); reachability per R3-69 [final clause contingent on slate item 13's ratified mechanism — strike if the session defers R3-69's teardown design].*

### 7.3 R3-01 [CHANGE — trace-only, decision-independent, ready to ratify]

Scenario text: **unchanged.** Trace amended from:
> *Pillar II §2 Background GPS — task lifecycle, background task registered at ride Join*

to:
> *Pillar II §2 Background GPS — task lifecycle (Transistorsoft engine per drift finding a); continuous background tracking guaranteed by the D91 lifecycle decoupling (R3-38) and deterministic engagement at join (R3-37).*

### 7.4 R3-04 [CHANGE — decision-dependent: self-health threshold (slate 4) and stale presentation (slate 5)]

**Committed (v1.0.0):** (unchanged through the Dark-transition clause) ends:
```
And the rider's own screen continues to show their blue dot at their actual current GPS position
```

**Proposed — append two clauses:**
```
And the rider self-health warning fires once no fix has been produced for the self-health threshold [PENDING slate 4 — threshold value]
And Captain and SAG surfaces present the rider per the ratified stale presentation [PENDING slate 5] in advance of the Dark transition
```
*Proposed trace addition: D88/D90 — the OS blue dot masks a dead service; notification dismissal is one member of the silent-invisibility class R3-40/41/48 close.*

### 7.5 R3-02 [OPTION — decision-dependent: slate item, Rail 3a successor criterion]

Committed scenario: **unchanged for PoC** (measurement exercise stands). Bracketed option for the Rail 3a successor scenario, if the session adopts a pass criterion:
```
[Option] Then in addition to the recorded outcomes, the run passes only if:
  - the GPS task survived to ride end, OR
  - the rider was warned per R3-40 and surfaced per R3-41 within the self-health threshold
[i.e., kill may occur; silent kill may not]
```
*Rationale on record: D88 reclassified silent invisibility on a compliant device as core-guarantee failure; measurement remains valid, the bar moves from "observed" to "never silent."*

### 7.6 Ratification order at session

1. Ratify 7.1–7.3 as a block (no dependencies).
2. Decide slate items 4 and 5 → fill 7.4's brackets → ratify.
3. Decide the R3-02 successor question → adopt or discard 7.5.
4. One MACD sync commits the block to Pillar III (version bump, Change Log entry, Ledger Receipt) alongside the wTBD1 enshrinement of slate item 14.

---

*Seed packet component for the G33 Strategic Re-engagement session. Not Bedrock; becomes Ledger material via the session's MACD sync.*
