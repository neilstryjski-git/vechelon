# W277 — Architecture & State Machine Survey (Hands Brief, rev 3)

Project: Vechelon Rail 3 — Mobile Tactical | Parent: G33 (id 5381) | W277 (id 5380) | Brief date: 2026-07-27
Companion file: `wTBD1_rail3_bdd_survey_input_HANDS.md` (the BDD scenario set — 36 scenarios, findings (a)–(g), SURVEY CHECK index SC-1–8, mechanism inventory). Where this brief and that file overlap, the BDD file is the detailed authority.

> **Rev 3 changes from rev 2:** drift findings extended (a)–(d) → (a)–(g); auth contract and guest boundary added to the integration surface; pre-registered findings now reference the BDD file rather than restating; BDD set is now DELIVERED (was pending).

**Authority:** This is an assessment task. You are surveying and reporting, not fixing. No code changes, no schema changes, no refactors — findings only.

---

## CHANGE REQUEST — apply before survey work begins (Stride record edits, Senior PM-approved 2026-07-27)

1. **G33 (id 5381), description:** replace the candidate-example sentence ("Candidate example: unifying the three re-engagement detectors…") with: "Candidate example: the engine-lifecycle consolidation proven by D91 (decouple engine start/stop from threshold data; resume re-asserts send as well as receive; self-health backstop) — with the D86–D90 detector cluster as the documented journey that led there, and the unticketed Saver-at-start delay (~3–4 min, self-recovering) as a known open behavior."
2. **W277 (id 5380), `why` field:** append, do not rewrite: "NOTE (added 2026-07-27): D91 (field-validated, reviewed) supersedes the D86–D90 changePace cluster — the engine was tearing itself down via the thresholds dep; the nudges were no-ops. The unification thesis below stands as the documented journey; the survey should assess the engine lifecycle against D91's root cause as current truth. Residual open behavior: Saver-at-start delay (~3–4 min, self-recovering), unticketed."
3. **Reading rule for this brief:** wherever W277's existing verification steps reference "the three re-engagement detectors" as the flagship redundancy example, read them through the NOTE above — the expected finding class is *dead detector code on a fixed engine*, not detectors awaiting unification. Assess and report what the code actually shows.
4. **wTBDn convention (methodology addition, Senior PM-instilled):** Brain-proposed tasks carry `wTBDn` placeholders, where *n* is the proposed sequence. Real W-numbers are assigned only when you actually ticket the work in Stride — not at receipt of a proposal. On ticketing, record the substitution (wTBDn → Wxxx) so the trace chain survives. The delivered BDD artifact is **wTBD1**; expect future Brain proposals (e.g., post-session enshrinement and refactor items) as wTBD2 onward.

---

## Objective

Produce two artifacts for a Strategic Re-engagement session.

### Artifact 1 — Current State Overview

Document the Rail 3 state engine as it actually is today, across all six domains: identity, tracking-engine lifecycle, power/OEM throttle, channel/resume, fleet add/grey/remove, departures. For each domain: states, transitions, triggers, and the detectors/timers that drive them.

**Drift:** explicitly flag anywhere implementation has drifted from or extended the committed Specs (Pillar II) — drift is a finding, not a defect to fix in-flight. Confirm, refute, or detail the pre-registered drift findings **(a)–(g)** and answer the SURVEY CHECKs **SC-1–SC-8** — both defined in the BDD file's §2 and §4. Confirm the re-engagement mechanism inventory (BDD file §3) against the code, especially which Layer 2 detectors remain wired.

**Rails 1 & 2 integration surface (in scope):** the Supabase contracts, events, and data flows through which the portals drive Rail 3 state (identity, fleet, departures), including:
- the **auth contract** — token issuance, lifetime, refresh semantics, RLS interaction;
- the **ride-list read contract** — current query and presentation window (R3-73);
- the **guest boundary** — Rails 1 & 2 own guest identities and RSVP data; confirm guest records are structurally invisible to every Rail 3 surface (SC-4), and note anything in the participant model or roster design that would require rework to support guest participants (incl. on the roster page) when the Rail 3a Brain session ratifies guest join.

The internal architecture of Rails 1 & 2 is out of scope; if you find issues there, log them as findings for the Brain session — do not survey further.

### Artifact 2 — Recommendations for Brain Session

Proposed consolidations and refactors. Each recommendation must state: (a) the problem it solves, (b) the states/detectors it touches, (c) its Bedrock impact — affected Pillar II sections and BDD scenarios (committed R3-01–36 and/or the delivered set R3-37–73). Recommendations without a Bedrock impact mapping will be returned.

Candidate example for calibration: the engine-lifecycle consolidation proven by D91 — with the D86–D90 detector cluster as the documented journey, including whether their now-superseded detector code should be removed, and the unticketed Saver-at-start delay as a known open behavior warranting a ticket recommendation. Do not anchor the survey around this example — it is one candidate, not the thesis.

---

## Inputs

1. TS (Transistorsoft) documentation — vendor-hosted, no attachment: the SDK reference (transistorsoft.github.io/react-native-background-geolocation), the repo wiki incl. Philosophy of Operation (github.com/transistorsoft/react-native-background-geolocation), and the FAQ (docs.transistorsoft.com). Pay particular attention to Philosophy of Operation and stopTimeout semantics — R3-37, R3-50, and the mechanism inventory grade against them.
2. This brief's scope definition
3. **The BDD scenario set — DELIVERED** (`wTBD1_rail3_bdd_survey_input_HANDS.md`): Brain-authored, dual-sourced by explicit ruling (Pillar II/III 2026-05-12 as committed intent; Stride D-records D72, D86–D91 as field truth; tags distinguish). Treat tag classes accordingly when grading.
4. Access to the Supabase project (schema, RLS policies, Edge Functions, Broadcast channel topology) and the Rails 1 & 2 code as needed to read the integration surface. **No contract document exists** — the integration contract is currently implicit in schema and code; documenting it is an Artifact 1 deliverable, not an input to this task.
5. The committed Rail 3 Pillars — `vechelon\productdocuments\rail3` (Pillar II v1.0.2, Pillar III v1.0.0, 2026-05-12). These are the drift baseline: Artifact 1's "drifted from or extended the committed Specs" grades against these files as they stand. Read-only per Edit Authority.

## Sequencing

Apply the CHANGE REQUEST first. Then Artifact 1. The comparison pass against the BDD set and the drafting of Artifact 2 follow.

## Format

Markdown, Mermaid for all state and flow diagrams (versioned per the Mermaid Standard). C3-level detail is yours to include where it clarifies internal logic; C1/C2 assertions belong to the Brain — if your findings suggest a C2 change, that is a recommendation, not a diagram edit.

## Edit authority

The Four Pillars are read-only to you. The Stride edits in the CHANGE REQUEST are the only record modifications authorized by this brief. Log survey activity in log_of_changes.md as usual. Anything you're tempted to fix while you're in there — including the dead D86–D90 detector code: write it down, leave it alone.

## Done means

Both artifacts delivered, every domain covered, every recommendation carrying its Bedrock impact, integration surface documented (auth, ride-list, and guest boundary included), pre-registered drift findings (a)–(g) confirmed or refuted with evidence, SC-1–8 answered, zero code changed.
