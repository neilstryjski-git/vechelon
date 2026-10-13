# Rail 3a Sprint 1 (G34): Brain Write-back Packet

Project: Vechelon Rail 3 | Goal: G34 | Compiled: 2026-10-13 by The Hands | Status: **DRAFT. Every Pillar text below is PROPOSED, for MACD ratification.**

**The Hands have edited no Pillar.** Everything here is proposed text, or a question for The Brain or Senior PM. The TPM, or the MACD session, writes the ratified result into `productdocuments/rail3/`.

Sources:
- the G34 entries in `mobile/log_of_changes.md`;
- Pillar IV Ledger v1.1.3 (§2, §6, §8, §10, §12.2, §13, §14);
- Pillar III v1.1.1 (R3-42, R3-45, R3-66, R3-74);
- `docs/rail3/decision_briefs/`;
- `mobile/src/lib/bgGeo.ts` at `993020f`.

**Caveat on every "built" claim below.** The code is merged to `rail3-integration` and installed on the field build (EAS ff53208f). None of it is **field-validated** yet. Each proposed write-back says "built"; where Senior PM prefers to write back only on validated behaviour, hold the text until the field run is recorded.

---

## A. Pillar IV §14 write-backs: items 10, 11, 15, 16

Sprint completion includes these four write-backs (scope note at G34 ratification). The item numbers match the Ledger v1.1.3 §14 table exactly.

### A.1 Item 10: current build's power posture (slate 2 interim posture record)

**Current text (§14, verbatim):**
> | 10 | Confirm the current build's power posture at write-back (slate 2 interim posture record). |

**Context.** Slate 2 (§8.3 / §10) defers the choice between D88 force-track and D90 stopTimeout-stationary. Current build behaviour stands as the **interim** posture, recorded as interim. It reopens only on Racer Sportif trial evidence. No G34 ticket was scoped to change the posture. W286 and W287 added recovery and teardown reads on the heartbeat; they did not change the posture.

**Proposed write-back (PROPOSED):**
> | 10 | **Written back 2026-10-__ (G34, build 993020f / EAS ff53208f).** Interim posture as built, recorded as interim per slate 2:
> - **Engagement.** The engine starts at join with a one-shot `changePace(true)` (D90). This is not forced streaming: `disableStopDetection` is not set, so the SDK's motion detection and stop timeout return a genuinely stopped rider to stationary (services off). The stop timeout is the SDK default; it is not pinned in code.
> - **Cadence.** Distance-based: `distanceFilter` 40 m with elasticity disabled, `locationUpdateInterval` / `fastestLocationUpdateInterval` 5 s as a rate cap, high accuracy.
> - **Liveness.** `heartbeatInterval` 60 s (the Android floor), with no `preventSuspend`. On each beat:
>   - if `getState().enabled` is false, the engine is re-asserted (W286);
>   - otherwise the D88 self-check samples a position while stationary and forces moving past 40 m.
> - **Survival.** `foregroundService: true`, `stopOnTerminate: false`, `enableHeadless: true` (W286 headless re-assert on heartbeat / terminate / providerchange), `startOnBoot: false`.
> - **Exclusion.** `autoSync` / `url` / `batchSync` are absent per B1.
>
> Neither D88 force-track nor D90 is superseded. The always-on telemetry tier (W284) is live on staging, so the slate 2 evidence trigger is reachable. |

**Blocked by this:** nothing in-sprint. The posture stays deferred on its own trigger.

### A.2 Item 11: beacon schema confirmation (slate 7)

**Current text (§14, verbatim):**
> | 11 | Beacon schema confirmation: durable current-state flag, raise-time last-known write (slate 7). |

**Proposed write-back (PROPOSED):**
> | 11 | **Written back 2026-10-__ (G34 / W282).** Confirmed with **no schema change**: the durable current-state flag is the existing `ride_participants.beacon_active` (boolean, default false), previously unused.
> - **Raise.** Writes `{beacon_active: true, last_lat, last_long, last_ping}` in **one** own-row UPDATE before the alert is broadcast. With no fix yet, only the flag is written (D79).
> - **Cancel.** Writes the `beacon_alerts` audit row first (SD-011 named actor), then `beacon_active = false`.
> - **Read path.** The flag is read on mount, focus/resume and channel activation, and the seed is authoritative for absence. There is no event history and no replay; a beacon settled while the device was blind is never re-raised.
> - **Returning device.** It renders the beacon at the raise-time last-known with a dashed stale overlay (Captain/SAG viewers only) until live supersedes.
> - **RLS.** The existing `participant_update_policy` permits the own-row raise and a Captain/SAG clear; there is no new policy and no recursion surface.
> - **Open.** The server-side ride-end cancel is D81, still open. W282 fixed the client contract it must follow. Hard-purge-location does not yet null `beacon_active` or `last_ping`, which is carried to the R3-36 purge-scope extension. |

### A.3 Item 15: roster per-row participation state (slate 17)

**Current text (§14, verbatim):**
> | 15 | Roster per-row participation state (slate 17). Widen the existing non-app-user mark; confirm at write-back. |

(Item 23, the treatment of the non-app-user mark, is closely related. The proposal below also covers it, for the Brain to take or split.)

**Proposed write-back (PROPOSED):**
> | 15 | **Written back 2026-10-__ (G34 / W288, extended by W292).** Built as one per-row state: the C2 non-app-user mark widened to the slate 17 population, a single state with no new class.
> - **Signal.** New nullable column `ride_participants.rail3_joined_at` (migration 20260916000000), stamped only when the participant first opens the ride in the Rail 3 app.
>   - Web and edge-function inserts leave it NULL by construction.
>   - There is no backfill, because no historical signal separates app openers.
> - **Derivation.** **Roster only** when there is no account or `rail3_joined_at` is NULL; otherwise **App tracked**.
>   - It is never derived from current ping state; the input type carries no ping field.
>   - An app rider who is not currently producing a position stays with the fleet ladder and is not duplicated into the roster.
> - **Departure.** W292 adds a third value, **Left ride**, from the durable `departed_at` mark (migration 20260918000000). Rows are retained, never deleted (R3-70).
> - **Treatment (item 23).** A neutral grey chip, never red and never failure framing (R3-74). Wording is the Hands': "App tracked" / "Roster only" / "Left ride". This is placeholder copy pending Voice & Tone.
> - **Visibility.** Every role sees every row (§4.1). Phone numbers follow §4.1: command sees all, and everyone sees the leaders' (slate 8). The roster is ride-scoped and closes on Saved (slate 11). |

**Note for the Brain:** items D and E below are residues of this same ticket.

### A.4 Item 16: built sign-out ordering

**Current text (§14, verbatim):**
> | 16 | Confirm the built sign-out ordering, departure before session end, and record it. |

**Context.** R3-58 says "The PoC already implements this ordering". The W281 pre-flight found that this was **true in order but not in bound**, and that there was an R3-57 gap. Both were fixed before the ordering was pinned.

**Proposed write-back (PROPOSED):**
> | 16 | **Written back 2026-10-__ (G34 / W281, cache clear completed by W289).** Built ordering, pinned in `mobile/src/lib/signOutSequence.ts` (node-tested):
> 1. Departure is issued under the still-valid session.
> 2. The wait for it is bounded at 3 s. The call keeps running; a hung or rejected departure never blocks sign-out.
> 3. The active-ride holder is cleared.
> 4. `supabase.auth.signOut()` runs.
> 5. On the resulting user-id change, the roster cache is cleared and its key rotated.
>
> "Fire-and-forget" is implemented as "never wait for acknowledgement", not as firing after the identity is gone. A departure that outlives the window re-checks the live identity and writes nothing under a different account. The cache clear sits after the departure by construction (R3-58 / slate 11).
>
> Correction to the R3-58 note:
> - **Before W281**, the departure was awaited unbounded, so a hung request blocked sign-out.
> - **Before W281**, an account swap that bypassed sign-out did not clear the holder, so the new account inherited the old binding (R3-57).
>
> Both are fixed.
>
> Known limits:
> - A swap that bypasses sign-out leaves the old row un-departed until the deferred server staleness detector.
> - A rider who declined background permission has no holder, so no departure fires. |

---

## B. F-7: R3-45 third clause (from W284)

**Question.** The always-on floor alone cannot tell an OEM-suspended engine from a healthy one. Is R3-45's third clause satisfied, and if not, how should it be met?

**Context.**
- Ledger §13.1 F-7: "If [the three counters] cannot distinguish engine-never-engaged, engine-torn-down and OEM-suspension, R3-45 returns to the Brain."
- W284 built exactly the three counters: `engine_started`, `engine_died` (with a `reason` that splits plugin-disabled from location-services-off), and `warning_fired`. They separate:
  - **never-engaged**: no rows;
  - **torn-down**: started + died.
- But an OEM-killed process runs no JS and **emits nothing**. A row with started and no died is therefore one bucket, `suspended_or_healthy`. In that bucket, OEM suspension, a healthy run and a started-but-no-fix run look the same. The fix signal lives only in the staging-only `engine_first_fix` sink.
- R3-45's third clause ("a ride that produces no fixes leaves sufficient always-on telemetry to distinguish …") is therefore **not met by the floor as ruled**. The reviewer also flagged R3-54's last clause on the same ground.

**Options (neutral):**
1. **Split via `fixes_seen` on `warning_fired`.** W285 has already built this, carried as plain data: a count, never coordinates. 0 = produced nothing; >0 = produced fixes, then stopped. It adds no fourth counter, but it only exists when a warning fires, which needs W285's values to be live.
2. **Add a fourth always-on counter**, for example a first-fix or fix-count heartbeat. That amends slate 6's "these counters only".
3. **Accept the limit.** Restate R3-45's third clause so OEM suspension is distinguished by the *absence* of a warning or teardown record together with captain-side silence, or by the server staleness detector once it is built. That is a Pillar III amendment.
4. **Defer** the clause to the staleness-detector / FCM sprint, where server-side observation can supply the missing signal.

**Hands' observation (log, W284):** option 1, "without a new counter". W285 already ships `fixes_seen`, pending a ruling; Neil's 2026-10-03 note said to leave it out until ruled, but it was built in. **Hands' recommendation:** option 1, with an explicit note that it is conditional on W285's thresholds being populated.

**Queued by Neil for sprint end (2026-10-03). No urgency.**

**Blocked by this:** no ticket's code. The R3-45 acceptance line on W284 (and R3-54 on the reviewer's reading) cannot be marked met until it is ruled.

---

## C. W285: the "committed fallback" question (plus the permission-denied deviation)

**Question 1 (log, W285 review r1 item d).** Once W279's two values are Ledger-confirmed, should they **also ship as committed first-load fallbacks in the app**? Or should self-health stay config-only, and therefore inert, whenever the `rail3_operator_config` row is NULL or the first load fails?

**Context.**
- W285's security consideration 3 says "fail closed to committed defaults, never to no warning". Its pitfall 1 says unmeasured numbers never enter the app.
- Today there are no committed defaults (wTBD2 is unmeasured), so a NULL row or a first-load failure is **inert**: no badge and no prompt.
- What does hold now: `telemetry.ts` keeps the previous cache on a later fetch failure, so a transient error after one successful load never regresses to inert.
- Slate 4 / item 22 rule that the clocks are operator-level and server-side. A shipped fallback is a second, client-side home for the same value.

**Options:**
1. **Config-only (as built).** One source of truth, operator-owned. Accept inert-on-first-load-failure.
2. **Ship the Ledger-confirmed values as a client fallback**, used only when config is unavailable. That needs a rule for drift when the operator later changes the server value.
3. **Fail to "not reaching" on missing config.** This was rejected by the Hands: it would warn every rider whenever config failed to load.

**Hands' recommendation:** none stated in the log. It is framed as "a Decision Brief question for the Brain, not a Hands change".

**Blocked by this:** nothing now. It becomes relevant at production promotion (W259), where a failed first config load on a real ride would leave self-health silent.

**Question 2 (deviation, for ratification or override).** W285 treats a **permission-denied or never-started** rider as INERT, rather than "not reaching after the ceiling, with a Settings prompt" as the ticket's edge case suggested.
- Reasoning: R3-40 is gated on "the app's state says tracking should be active", which is false here. That rider is already told at join with a Settings link, and peers see them Sleeping (violet), not Dark.
- A `no_background_permission` warning would fire every ride for a rider who deliberately declined, with no clock to bound it.

**Options:**
1. **Ratify inert.** The Hands' choice, as built.
2. **Require a bounded per-ride reminder** for permission-denied riders. Needs a rule and copy.

**Blocked:** nothing.

---

## D. R3-66 vs §4.1 / R3-74 residue (from W288)

**Question.** Reconcile R3-66's parenthetical with committed §4.1 and R3-74.

**Context.**
- R3-66 says "no surface widens a role's visibility (*a rider cannot see other riders on the roster page any more than on the map*)".
- Pillar II §4.1 ROSTER v1.1.1 and R3-74 give **every role the complete roster record**.
- Ledger F-12 already ruled for the committed §4.1 text, and W288 is built to §4.1 / R3-74. The R3-66 wording was flagged, not absorbed.

Separately, R3-74's "Captain and SAG see that participant's contact details; a rider does not" sits against slate 8 (leaders' phone visible to all). W288 judges this **moot**: a roster-only leader does not occur. The Brain may want to confirm that.

**Options:**
1. **Amend R3-66's parenthetical** to defer to §4.1 (for example, "a rider sees exactly the roster record §4.1 grants").
2. **Strike the parenthetical.**
3. **Reverse F-12** and narrow the roster. That would be a rebuild of W288's visibility.

**Hands' recommendation:** none stated in the log beyond "built to §4.1 / R3-74; awaits the TPM's reconciliation". Option 3 would contradict an existing ruling.

**Blocked:** no code. R3-66 cannot be graded cleanly against the roster until it is reconciled.

---

## E. Other "returns to Brain" / TPM residue from the G34 entries

**E.1 Roster vs map phone divergence for co-Captains (W288). New; not previously flagged to the Brain.**
- The roster shows command (Captain/SAG) every number, *including co-Captains to each other* (a call sheet).
- The map bottom sheet's `canSeePhone` hides captain↔captain.
- R3-66 requires "each role sees exactly what the committed envelope grants, identically on every surface".
- Options:
  - align the map to the roster;
  - align the roster to the map;
  - rule that captain↔captain phone is in the envelope and record it.
- **Blocked:** a clean R3-66 grade in the field run.

**E.2 R3-42 recovery window is UNTRACED (W286).**
- R3-42's source note reads "Mechanism and recovery window [UNTRACED — Brain-session item]", and §12.2 carries no value.
- W286 records mechanism facts only. The effective device-side window is roughly the 60 s heartbeat floor plus `start()` latency. An OEM kill of the FGS is non-recoverable device-side and is covered only by captain-side silence detection until the deferred staleness detector and FCM wake exist.
- Question: state a window value, or record the mechanism bound as the trace.
- **Blocked:** the R3-42 pass criterion in the field run has no number to grade against.

**E.3 A4 cadence: ALREADY CONFIRMED. Note only.**
- The Senior PM confirmed 60 s within [30 s, 120 s] on 2026-10-03 (W283; brief §6 ticked).
- **Remaining:** the TPM records the §12.2 row and closes §14 item 21. The proposed row text is in `docs/rail3/decision_briefs/a4_last_known_cadence_decision_brief.md` §6.
- Nothing is blocked.

**E.4 wTBD2 two values (W279). Senior PM confirmation pending measurement.**
- After the field matrix runs, the brief proposes the startup clock ceiling and the steady-state threshold.
- The Senior PM confirms both, and the TPM writes §12.2 and the §6 wTBD2 status. The wTBD2 → W279 substitution is recorded on the ticket and in the log; the §6 register can carry it.
- Constraint from W285: the steady threshold must exceed the 60 s heartbeat or the liveness check flaps.
- **Blocks:** W279 completion, W285 activation and validation, and W280's live §5.1 collision path.

**E.5 R3-36 purge-scope extension (W282, W283).**
- `hard-purge-location` nulls `last_lat` / `last_long` / `phone` but not `last_ping` or `beacon_active`, which R3-36 lists.
- This is already deferred to the R3-36 purge-scope extension, sequenced with W259. Flagged so the Brain sees that the gap is concrete, not hypothetical.

**E.6 Feature 6 dependency surfaced (W290).**
- The C1 / slate 9 "fall back to the route" behaviour cannot be built: `rides.gpx_path` has no mobile consumer, there is no GPX parser on Hermes, and storage RLS for riders is unverified.
- W290 delivered the no-route behaviour (cue plus frozen trace). It is recorded as a dependency, not as a Pillar change.
- Question: confirm that this is acceptable as the Rail 3a deliverable until Feature 6 lands.

**E.7 §14 item 12, O-08 same-day write-back.** This is a Brain-owed write-back to the Hands confirming O-08's parked status. §10 and §14 flag it "still owed, flagged a third time". It has not been touched by G34; it is listed so the arc-close check (F-16 practice) catches it.

**E.8 Voice & Tone (not Brain; listed for routing).** The copy for these is placeholder:
- the W285 self-health prompt;
- the W290 "Captain has left the ride" cue;
- the W289 last-known roster banner;
- the W288/W292 chip labels.

---

### E.8 Captain-departure banner vs Pillar II §5.1 (from the V&T copy list)
- **Question:** §5.1 allows no text alerts or banners during a live ride except the two device advisories (self-health, Battery Saver). Slate 9 / W290 requires the "Captain has left the ride" banner ("never silent"). Is it a ratified third exception, or should the cue be non-text (trail styling only)? The W282 beacon error chips raise the same question.
- **Options:** (a) add it to §5.1 as a named exception; (b) cue without text; (c) defer, ship as built for staging.
- **Blocks:** nothing in staging; the V&T copy pass on this banner.

### E.9 "Sleeping" as a visible status label (from the V&T copy list)
- **Question:** W293 renamed the state; the bottom sheet shows the raw state name, so riders now see "SLEEPING". Status-label copy is deferred under SD-013 / PDoD-06 and "Sleeping" is not in the committed §5.3 list. Ratify the label, or name the wording.
- **Blocks:** nothing; the V&T copy pass.

## Decision summary

| # | Decision | Owner | Blocks |
|---|---|---|---|
| A.1–A.4 | Ratify the §14 write-backs for items 10, 11, 15 (+23) and 16 (now, or after the field run) | Senior PM / MACD → TPM writes | G34 sprint close |
| B | F-7: how R3-45's third clause is met (`fixes_seen` / fourth counter / restate / defer) | Brain | W284 R3-45 acceptance line |
| C.1 | Self-health fallback: config-only vs shipped Ledger-confirmed fallback | Brain | Nothing now; matters at W259 |
| C.2 | Ratify or override "permission-denied = inert" | Brain / Senior PM | Nothing |
| D | R3-66 parenthetical vs §4.1 / R3-74 (and confirm the R3-74 leader-contact point is moot) | TPM / Brain | Clean R3-66 grade |
| E.1 | Co-Captain phone: roster vs map divergence | Brain / Senior PM | Clean R3-66 grade |
| E.2 | R3-42 recovery window value or trace | Brain | R3-42 pass criterion |
| E.4 | Confirm the wTBD2 two values after measurement | Senior PM | W279, W285, W280 completion |
| E.6 | Accept no-route behaviour pending Feature 6 | Brain | Nothing |
| E.8 | Captain-departure banner: third §5.1 exception or non-text cue | Brain | V&T copy pass |
| E.9 | Ratify "Sleeping" as a visible status label (SD-013) | Brain / Senior PM | V&T copy pass |
| E.3, E.5, E.7 | Record only (A4 §12.2 row; purge gap noted; O-08 write-back owed) | TPM / Brain | Nothing |
