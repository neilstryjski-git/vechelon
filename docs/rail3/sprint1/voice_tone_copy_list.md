# Rail 3 Sprint 1 (G34): Voice & Tone copy list

**Prepared:** 2026-10-13 · **Branch:** `rail3-integration` @ `dd4054e` · **Scope:** user-facing strings introduced or changed by G34 (W279–W293, PRs #105, #112–#125), diffed against `7332411^`.
**Status:** for Voice & Tone review. The **Proposed** column is blank by design. A **Note** appears only where a stated rule or an obvious inconsistency applies.

Legend: ⚠ **SAFETY**: the rider reads this while something is wrong (they can't be seen, the ride ended, a beacon is involved). Tone matters most on these rows.
Only two strings are explicitly marked *"placeholder — Voice & Tone pending"* in code or in `mobile/log_of_changes.md`: the self-health prompt (W285) and the Captain-departure cue (W290). The log says the other new strings are "the Hands' wording", meaning nothing committed them, so they are listed here as well.

---

## Tone rules that apply (summary)

1. **Plain, warm, cycling-native language, with no military or tactical voice.** *Voice & Tone Amendment 001* was ratified on 2026-05-05 (`scratchfiles/voice_amendment_001_remove_tactical_tone.md`, executed as G24). Keep **Roster · Captain · Peloton · Beacon**. "Operator" in UX copy becomes "Rider". "Something went wrong" style replaces jargon.
2. **Communicate the consequence without alarming. Plain language.** This is the rule for device advisories and the tracking notification (Pillar II §2 Background GPS; Ledger SD-012 design requirements). Self-heal is silent, with no post-heal message (Pillar II §5.1).
3. **Glanceable: no text alerts, modals or banners during a live ride.** The exceptions are the device advisories: the self-health unlock prompt (R3-40) and the Battery Saver advisory (R3-49). They are prompts, never preconditions. Self-health wins at collision (Pillar II §5.1).
4. **Status labels.** The architectural names (Active, Stopped, Inactive, Dark, Beacon Active) are committed, and the final UX label copy is deferred to a Stride milestone plus MACD (Ledger SD-013, Pillar III PDoD-06). Overlays are presentations, never states (Pillar II §5.3).
5. **Brand name is "Vechelon"**, with normal capitalisation and never the mixed-case "VEcheLOn" (Sr PM ruling, 2026-06-15).

---

## 1. Ride map: self-health overlay and unlock prompt (W285, R3-40)

Who sees it: any participant whose **own** device is tracked (rider, Captain, SAG). It appears at unlock, only while the device is not reaching the group, and comes back on every unlock while that lasts. It is an Alert over the map.

| # | Current text (exact) | Where / when | file:line | Ticket | Who | Flag | Proposed | Note |
|-|-|-|-|-|-|-|-|-|
| 1.1 | `Your position isn't reaching the group` | Alert title, on unlock while not reaching | `mobile/src/hooks/useSelfHealth.ts:64` | W285 | all (own device) | ⚠ SAFETY · placeholder | | Code comment: "Placeholder copy — Voice & Tone pending (SD-013 / PDoD-06)" |
| 1.2 | `Vechelon hasn't had a GPS fix for a while, so your Captain can't see where you are. Keep Vechelon open and on screen for a moment so tracking can recover. If this keeps happening, check that Location is on and Battery Saver is off.` | Alert body | `mobile/src/hooks/useSelfHealth.ts:65-67` | W285 | all (own device) | ⚠ SAFETY · placeholder | | Rule 2 (consequence without alarming) applies most directly to "your Captain can't see where you are". |
| 1.3 | `OK` | Alert button (dismiss) | `mobile/src/hooks/useSelfHealth.ts:69` | W285 | all | ⚠ SAFETY · placeholder | | |
| 1.4 | `Open settings` | Alert button that opens the **app's** system settings (`Linking.openSettings`) | `mobile/src/hooks/useSelfHealth.ts:71` | W285 | all | ⚠ SAFETY · placeholder | | The body names Location and Battery Saver, but this button opens the app settings page. The pre-existing pocketed-permission alert writes `Open Settings` with a capital S (`RideMapScreen.tsx:271`). |
| 1.5 | `!` | Badge glyph on the rider's own blue dot while not reaching | `mobile/src/components/SelfHealthBadge.tsx:55` | W285 | all (own device) | ⚠ SAFETY | | Glyph rather than words. Geometry and colour are a design pass (§5.3). |
| 1.6 | `Your position may not be reaching the group` | Screen-reader label on the badge | `mobile/src/components/SelfHealthBadge.tsx:51` | W285 | all (a11y) | ⚠ SAFETY | | Says "may not be", while the alert title (1.1) says "isn't". |

## 2. Ride map: Captain-departure cue (W290, slate 9)

Who sees it: every participant **except** the departed leader. It shows only when the ride's leading Captain leaves (not on a ride end, not when a non-leader Captain leaves), only while the ride is live. It clears itself when the Captain's pings resume and can be dismissed. It is a floating banner at the top of the map.

| # | Current text (exact) | Where / when | file:line | Ticket | Who | Flag | Proposed | Note |
|-|-|-|-|-|-|-|-|-|
| 2.1 | `Captain has left the ride` | Banner title | `mobile/src/screens/RideMapScreen.tsx:660` | W290 | rider, SAG, other Captains | ⚠ SAFETY · placeholder | | Log and code: "placeholder copy — Voice & Tone pending". This is a text banner during a live ride; slate 9 requires it ("never silent"), but it is not one of the two §5.1 named exceptions (see Ambiguities). |
| 2.2 | `Their trail is frozen where they left it.` | Banner body | `mobile/src/screens/RideMapScreen.tsx:661` | W290 | rider, SAG, other Captains | ⚠ SAFETY · placeholder | | |
| 2.3 | `✕` / a11y `Dismiss` | Banner dismiss control | `mobile/src/screens/RideMapScreen.tsx:665-668` | W290 | same | | | Same pattern as the existing bottom-sheet `Dismiss`. |

## 3. Ride ended notice (W287, moved from RideMapScreen)

Who sees it: participants whose app is **in the foreground** when the ride is ended or when they reopen a ride that has already been saved. Captains tear down silently (`rideEndCheck.ts` `decideRideEndAction`), and backgrounded devices are silent. The text predates G34. W287 moved it into the new convergent watch, so it now also fires from the heartbeat or resume read path, and W291 means **any** Captain can now end the ride.

| # | Current text (exact) | Where / when | file:line | Ticket | Who | Flag | Proposed | Note |
|-|-|-|-|-|-|-|-|-|
| 3.1 | `Ride ended` | Alert title, after which the map closes | `mobile/src/hooks/useRideEndWatch.ts:91` | W287 | rider, SAG | ⚠ SAFETY | | |
| 3.2 | `The captain has ended this ride.` | Alert body when the end arrived live (ride_ended event) | `mobile/src/hooks/useRideEndWatch.ts:92` | W287 | rider, SAG | ⚠ SAFETY | | "captain" is lowercase, but "Captain" is capitalised in 1.2, 2.1 and 4.2. With co-Captains (W291), "The captain" no longer names one person. |
| 3.3 | `This ride has already ended.` | Alert body when found on a read (resume, heartbeat, open) | `mobile/src/hooks/useRideEndWatch.ts:92` | W287 | rider, SAG | ⚠ SAFETY | | |

## 4. Ride controls: End Ride failure (W291, B2)

Who sees it: Captains. It is an inline error under the End Ride chip, after the two-tap confirm, when the end did not land. The ride stays live.

| # | Current text (exact) | Where / when | file:line | Ticket | Who | Flag | Proposed | Note |
|-|-|-|-|-|-|-|-|-|
| 4.1 | `Could not confirm the ride ended — check your connection and try again.` | End Ride wrote 0 rows and the status read also failed | `mobile/src/screens/RideControls.tsx:76` | W291 | Captain | ⚠ SAFETY | | |
| 4.2 | `End Ride wasn’t accepted for your account — another Captain or the organiser can end it.` | End Ride rejected by policy (ride not saved) | `mobile/src/screens/RideControls.tsx:77` | W291 | Captain | ⚠ SAFETY | | Uses a curly apostrophe. "organiser" is UK spelling; elsewhere the app uses US spelling (`primary_color`), and the copy convention is not stated. |

## 5. Ride map: Support Beacon error chip (W282, slate 7)

Who sees it: the device that raised or cancelled the beacon. It is a text chip on the map (`RideMapScreen.tsx:740-742` renders `beaconError`). It appears only when the durable `beacon_active` flag write fails after a retry. The alert itself has already gone out.

| # | Current text (exact) | Where / when | file:line | Ticket | Who | Flag | Proposed | Note |
|-|-|-|-|-|-|-|-|-|
| 5.1 | `Beacon alert sent, but its status flag was not saved — other devices may lose it on refresh until it is re-saved.` | After raising SOS: flag write failed | `mobile/src/hooks/useBeacons.ts:296` | W282 | rider who raised (any role) | ⚠ SAFETY | | Uses system words ("status flag", "re-saved") in a moment of distress. Rules 1 and 2 suggest plainer wording. The rider has no action to take, because the app re-asserts the flag itself. |
| 5.2 | `Beacon status flag not cleared; it may reappear on other devices until re-cancelled.` | Cancel was settled by a racing canceller, but the flag clear failed | `mobile/src/hooks/useBeacons.ts:415` | W282 | canceller (the rider or Captain/SAG) | ⚠ SAFETY | | Same "status flag" wording. |
| 5.3 | `Beacon cancelled, but its status flag was not cleared; it may reappear on other devices until re-cancelled.` | Cancel succeeded and fanned out, but the flag clear failed | `mobile/src/hooks/useBeacons.ts:444` | W282 | canceller (the rider or Captain/SAG) | ⚠ SAFETY | | Same wording. |

## 6. Battery Saver advisory: now also at unlock (W280, B3, R3-06)

The text predates G34 (W177). W280 brings back a **new moment** to see it: at unlock after a screen lock, while Battery Saver is on and the self-health prompt is not firing. It still shows at join (R3-05). Who sees it: every Android participant.

| # | Current text (exact) | Where / when | file:line | Ticket | Who | Flag | Proposed | Note |
|-|-|-|-|-|-|-|-|-|
| 6.1 | `Battery Saver is on` | Alert title at join, and at unlock after a lock | `mobile/src/lib/batteryGuards.ts:60` | W280 | all (Android) | ⚠ SAFETY | | |
| 6.2 | `Battery Saver can pause location updates and make you disappear from your captain's map mid-ride. For reliable tracking, turn it off for this ride.` | Alert body | `mobile/src/lib/batteryGuards.ts:61-62` | W280 | all (Android) | ⚠ SAFETY | | "captain's" is lowercase (see 3.2). Check "disappear" against rule 2 (without alarming). |
| 6.3 | `Not now` / `Open settings` | Alert buttons; the second opens the Battery Saver settings | `mobile/src/lib/batteryGuards.ts:64-65` | W280 | all (Android) | | | `settings` is lowercase here; the pocketed-permission alert uses `Open Settings`. |

## 7. Rider bottom sheet: tactical-state chip (W293)

| # | Current text (exact) | Where / when | file:line | Ticket | Who | Flag | Proposed | Note |
|-|-|-|-|-|-|-|-|-|
| 7.1 | `SLEEPING` (was `DORMANT`) | State chip in a participant's bottom sheet when that rider gracefully backgrounded. The text is `participant.state.toUpperCase()`. | `mobile/src/components/RiderBottomSheet.tsx:73` (value from `mobile/src/state/riderState.ts:31`) | W293 | whoever can open that marker (role-scoped, §4.1) | | | The chip renders the raw architectural name. "Sleeping" is not in the §5.3 committed ladder (Active/Stopped/Inactive/Dark/Beacon Active), and SD-013 defers UX label copy. W293's log notes "UX label copy untouched (SD-013 deferred)", but the visible chip did change. |

## 8. Ride roster screen (W288, W289, W292)

Who sees it: everyone on the ride. Every row is visible to every role (W288, `rowVisibleTo`).

| # | Current text (exact) | Where / when | file:line | Ticket | Who | Flag | Proposed | Note |
|-|-|-|-|-|-|-|-|-|
| 8.1 | `Everyone on the ride, tracked or not. Leaders' numbers are always shown.` | Subtitle under the ride name (replaces "Everyone on the ride — tap to call. Works whether or not the ride is being tracked.") | `mobile/src/screens/RosterScreen.tsx:293` | W288 | all | | | "Leaders" is a new umbrella term for Captain + SAG that appears nowhere else in the UI. It uses a straight `'`, while 4.2 and 8.8 use a curly `’`. |
| 8.2 | `APP TRACKED` | Per-row state chip (`'App tracked'` uppercased) | `mobile/src/lib/rosterLogic.ts:47` · rendered `RosterScreen.tsx:261` | W288 | all | | | Log: "the mark's wording is the Hands'"; nothing committed it. |
| 8.3 | `ROSTER ONLY` | Per-row state chip for a guest or non-app participant | `mobile/src/lib/rosterLogic.ts:47` · rendered `RosterScreen.tsx:261` | W288 | all | | | R3-74: a neutral structural state, never a warning. The tone should read as neutral. |
| 8.4 | `LEFT RIDE` | Per-row state chip after a deliberate departure | `mobile/src/lib/rosterLogic.ts:46` · rendered `RosterScreen.tsx:261` | W292 | all | ⚠ SAFETY | | R3-65 "left ≠ lost at a glance". Deliberately avoids the Dark/lost vocabulary. |
| 8.5 | `YOU` | Chip on the viewer's own row | `mobile/src/screens/RosterScreen.tsx:250` | W288 | all | | | |
| 8.6 | `Last-known roster — saved {timeAgo}. Not live; pull down to retry.` | Banner when the live load fails and the encrypted offline slot is shown | `mobile/src/screens/RosterScreen.tsx:299` | W289 | all | ⚠ SAFETY | | Log: "copy is the Hands' — none is committed". This is the A3 honesty register. |
| 8.7 | `just now` · `{n} min ago` · `{n} h ago` · `{n} days ago` | The `{timeAgo}` fragments inside 8.6 | `mobile/src/screens/RosterScreen.tsx:85-88` | W289 | all | | | `h` is abbreviated while `min` and `days` are not. |
| 8.8 | `This roster has closed — the ride has ended.` | Body when the ride is saved | `mobile/src/screens/RosterScreen.tsx:311` | W288 | all | | | |
| 8.9 | `You’re not on this ride.` | Body when the viewer is not a participant and the ride is live | `mobile/src/screens/RosterScreen.tsx:311` | W288 | non-participants | | | |

**Count: 35 strings in 30 rows** (rows 2.3, 6.3 and 8.7 group several fragments). 10 strings in sections 1 and 2 are explicitly marked placeholder, and 20 rows are flagged ⚠ SAFETY.

---

## Appendix A: unchanged text whose display logic G34 touched (for context, not counted)

| Current text | file:line | Touched by | Note |
|-|-|-|-|
| `Contact held by the ride team` | `mobile/src/screens/RosterScreen.tsx:235` | W288 (new phone rule) | Wording unchanged. |
| `No number on file` | `mobile/src/screens/RosterScreen.tsx:238` | W288 | Wording unchanged. |
| `Could not load the roster.` | `mobile/src/screens/RosterScreen.tsx:164` | W289 (now only when there is no cache) | Wording unchanged. |
| `Beacon alert sent, but the audit write failed: {msg}` | `mobile/src/hooks/useBeacons.ts:338` | pre-G34 | Shows a raw error message to the rider. |
| `Beacon cancelled in the record, but other devices may still show it (no signal).` / `Beacon cancel failed: {msg}` | `mobile/src/hooks/useBeacons.ts:441`, `:450` | pre-G34 | Same chip as section 5. Consider reviewing it alongside section 5. |
| `RIDE ROSTER`, `‹ Back` | `mobile/src/screens/RosterScreen.tsx:285,287` | pre-G34 | |

## Appendix B: Pillar-flagged V&T-pending copy on Rail 3 that G34 did not touch

- Foreground-service notification: `Vechelon — sharing your position` / `Live with your ride Captain while the ride is active.` (`mobile/src/lib/bgGeo.ts:454-455`). Pillar II §2 says the final copy is subject to Voice & Tone. The brand capitalisation is already correct here.
- Background-permission rationale: `Keep sharing your position while pocketed?` (`mobile/src/lib/bgGeo.ts:447-449`).
- Pocketed-permission alert: `Stay on the map when pocketed` (`mobile/src/screens/RideMapScreen.tsx:267-268`).
- First-ride explainer (`mobile/src/components/FirstRideExplainer.tsx`, W176): placeholder copy pending V&T.
- Map status labels (SD-013 / PDoD-06): the whole ladder, which also covers 7.1.

---

## Ambiguities for the reviewer

1. **The Captain-departure banner versus §5.1 "no banners during a live ride."** §5.1 names only two exceptions (self-health and Battery Saver). Slate 9 requires the departure cue ("never silent"). Decide whether 2.1/2.2 counts as a third sanctioned exception, which would be a TPM/MACD reconciliation and not a copy choice.
2. **The beacon error chips (section 5)** are also text during a live ride. They are error surfaces and not state communication, so it is unclear whether §5.1 covers them.
3. **"Sleeping" (7.1)** is user-visible but missing from the §5.3 committed ladder. It needs a label decision under SD-013 and should not be treated as copy polish only.
4. **Capitalisation of Captain.** The convention is undecided: "Captain" in the newer copy, "captain" in 3.2 and 6.2. The same goes for "Open settings" versus "Open Settings".
5. **The "Leaders" umbrella term (8.1)** is new vocabulary. The amendment's keep-list has Captain and Beacon but no term for Captain + SAG together.
