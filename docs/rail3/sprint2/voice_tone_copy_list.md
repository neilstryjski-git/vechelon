# Rail 3 Sprint 2 (G37): Voice & Tone copy list

**Prepared:** 2026-11-18 · **Branch:** `rail3-integration` @ `e0e2eb8` · **For:** the Senior PM, for the Voice & Tone pass with the Brain (Ledger §16.11).
**Scope:** every user-facing string Sprint 2 adds or changes, plus the Play-facing sentences that stop being true when the widened build ships.
**Status:** the **Proposed placeholder** column is the Hands' wording, offered so the build is not blocked. Voice & Tone decides. Nothing here has been changed in the app, the Play listing or the Play forms.

**PASSED 2026-11-23 by the Senior PM: the whole list, as proposed.** The Proposed placeholder column is now the approved wording, row 3.7 included. **The wording changes need a new build:** nothing here is live until the app strings ship in the next build (W315 applies them on `rail3-integration`) and the Play-facing sentences in section 4 are updated with that build's release. The Play open-test build (versionCode 4) keeps its current wording until then.

This list sits beside `docs/rail3/sprint1/voice_tone_copy_list.md` and does not replace it. The tone rules summarised at the top of that list apply here unchanged. Where a string is already on the Sprint 1 list, the row says so.

Legend: ⚠ **SAFETY**: the rider reads this while something is wrong. **BLOCKS**: brief item 10 (the app change, W315) cannot ship its wording until this row is decided.

---

## What changed in the rules, in one paragraph

Until now a rider's position and beacon reached the Captain and SAG only (the app hid other riders' beacons). The rulings of 2026-11-15 widen the beacon: when a rider raises one, **everyone on the ride** sees it on their map, and sees that rider's **live position** until the beacon is cancelled or the ride ends. Club admins also see beacons in Race Control. Phone numbers do not widen: a rider looking at another rider's beacon gets name, position and beacon state, with no phone and no dial (Pillar II §3 Features 1 and 2, §4.1). Outside a beacon, a rider's position still goes to the Captain and SAG only, and Sprint 2 makes the server enforce that.

**"Everyone on the ride" means everyone on it in the app.** The Pillar's words are "every app participant on the ride": a guest, or a rider who joined on the web and never opened the ride in the app, sees no beacon and no position. The proposals below say "everyone on the ride" for plainness. Whether rider-facing copy should carry the limit (for example "everyone on the ride using the app") is question 6.

## 1. In-app location disclosure (brief item 10) — BLOCKS

Shown once before the system location prompt, on first ride join. A modal with two buttons. Row 1.2 is the sentence Google's prominent-disclosure policy reads; it must name the data, the purpose and the background use. Row 1.3 is the sentence that becomes untrue.

| # | Current text (exact) | Where | file:line | Flag | Proposed placeholder | Note |
|-|-|-|-|-|-|-|
| 1.1 | `Share your location during rides` | Modal title | `mobile/src/components/LocationDisclosure.tsx:53` | | (no change) | |
| 1.2 | `Vechelon collects location data to show your position to your club during a ride, even when the app is closed or not in use.` | Policy sentence | `LocationDisclosure.tsx:33-34` | | (no change) | "to your club" already covers the widened rule. The same sentence is quoted in the Play background-location declaration and its video script, so changing it means re-recording the video. Recommend leaving it |
| 1.3 | `Only your club's ride captain and support crew can see your position, and only while a ride is active — so they can keep the group together and reach you if you need help. You can turn this off any time.` | Who sees it, and why | `LocationDisclosure.tsx:61-63` | **BLOCKS** | `During a ride, your position is shared with your ride's Captain and support crew so they can keep the group together. If you raise a Beacon, everyone on the ride can see where you are until it's cancelled or the ride ends, so help can reach you. You can turn location sharing off any time.` | "Only … can see your position" is false once a beacon shows the rider to the whole ride. Capitalisation of Captain differs from the current text; the keep-list has "Captain". Does the sentence need to mention club admins (they see beacons in Race Control)? Web Race Control is not built in this sprint |
| 1.4 | `Allow` / `Not now` | Buttons | `LocationDisclosure.tsx:71`, `:79` | | (no change) | Two explicit choices are a policy requirement |
| 1.5 | `Keep sharing your position while pocketed?` / `Vechelon shares your position with your ride Captain and SAG while a ride is active, even when your screen is locked.` / `Allow` · `Cancel` | Android background-permission rationale (system-style dialog, before the "Allow all the time" step) | `mobile/src/lib/bgGeo.ts:447-451` | **BLOCKS** | Message: `Vechelon shares your position with your ride's Captain and support crew while a ride is active, even when your screen is locked. If you raise a Beacon, the riders on your ride see it too.` | Second who-sees sentence in the app; it must agree with 1.3. Says "SAG" where 1.3 says "support crew" |
| 1.6 | `Vechelon — sharing your position` / `Live with your ride Captain while the ride is active.` | Persistent Android notification while tracking | `mobile/src/lib/bgGeo.ts:454-455` | | Text: `Shared with your ride's Captain and support crew while the ride is active.` | Names the Captain only, which is already incomplete (SAG sees it too). Tone rule 2 applies (the tracking notification). Whether it should mention the beacon is a Voice & Tone call; a notification is short |

## 2. Reduced beacon bottom sheet, rider viewing another rider (brief item 10) — BLOCKS

New in Sprint 2. Today a rider never sees another rider's beacon, so this sheet does not exist yet. Pillar II fixes its content: name, position and beacon state; no phone, no dial. Rows 2.1 to 2.4 are the strings it would show, built from the existing sheet (`mobile/src/components/RiderBottomSheet.tsx`).

| # | Current text (exact) | Where | file:line | Flag | Proposed placeholder | Note |
|-|-|-|-|-|-|-|
| 2.1 | `Rider` · `Guest Rider` · `Captain` · `SAG` | Role chip under the name | `RiderBottomSheet.tsx:35-40` | | (no change) | |
| 2.2 | (none today: the chip shows the tracking state, e.g. `ACTIVE`, `DARK`, `SLEEPING`; a beacon is shown by the marker only) | Beacon state on the sheet | `RiderBottomSheet.tsx:73` | ⚠ SAFETY · **BLOCKS** | `Needs help` | The reduced sheet must show beacon state in words, and no string for it exists. Status labels are deferred to Voice & Tone under SD-013 |
| 2.3 | `Contact hidden for this role.` | Where the phone would be | `RiderBottomSheet.tsx:103` | ⚠ SAFETY · **BLOCKS** | `Your Captain and support crew can see this Beacon.` | The current line reads as a refusal at the moment a rider is trying to help. The proposal avoids promising that anyone has been reached: a ride can have no SAG, and a leader who has not opened the ride in the app receives nothing (Pillar II Feature 2). Even "can see" assumes a leader is on the ride in the app. Alternative: show nothing |
| 2.4 | (none today) | Position line: where the rider is, or how old the position is | new | ⚠ SAFETY | `On the map now` / `Last seen {n} min ago` | The sheet must show position. Riders get no Navigate button (that stays SAG-only), so this is a text line. For a Sleeping rider the age is required (Pillar II Feature 4) |
| 2.5 | `Cancel Support` | Cancel button on a beacon sheet (own beacon, or Captain/SAG) | `RiderBottomSheet.tsx:84` | ⚠ SAFETY | `Cancel Beacon` | Not new, but now seen next to a sheet where a rider has **no** cancel button. "Support" here means the beacon; elsewhere it means the SAG. A rider viewing another rider's beacon does not get this button (cancel rights are unchanged) |

## 3. Messages a rider can now see when the server says no

Sprint 2 moves the rules to the server. Each row is a place where a refusal that could not happen before can now reach the screen.

| # | Current text (exact) | Where / when | file:line | Flag | Proposed placeholder | Note |
|-|-|-|-|-|-|-|
| 3.1 | `CHANNEL DENIED` | Chip on the ride map when the live connection is refused | `mobile/src/screens/RideMapScreen.tsx:745` | ⚠ SAFETY | `Not connected to this ride` | After W193 and D94 this is a real path: a member who has left the ride, or was removed, is refused. All caps and "denied" break tone rule 1 |
| 3.2 | `CONNECTING…` | Same chip while connecting or reconnecting | `RideMapScreen.tsx:745` | | `Connecting…` | Listed for the pair; only the capitals change |
| 3.3 | `Beacon cancel failed: {server message}` | Error chip after a cancel is refused | `mobile/src/hooks/useBeacons.ts:385`, `:450` | ⚠ SAFETY | `Couldn't cancel this Beacon. Ask your Captain or support crew.` | Already on the Sprint 1 list as pre-existing. New since W311: the server message can now be one of the three in 3.4, shown raw |
| 3.4 | `permission_denied: a beacon cannot be inserted already cancelled` · `permission_denied: only beacon_cancelled_at and beacon_cancelled_by can be changed` · `permission_denied: this beacon is already closed` · `permission_denied: a cancel sets beacon_cancelled_at and records the caller as beacon_cancelled_by` | Server refusals added by W311 (four), visible only through 3.3 (the three update refusals) and 3.5 (the insert refusal) | `supabase/migrations/20261118000000_w311_beacon_write_guard.sql` | | (not copy: never show) | Recommend the app stops printing server text and uses 3.3's wording. The app's own cancel never triggers these; they are for tampering |
| 3.5 | `Beacon alert sent, but the audit write failed: {server message}` | Error chip after raising, when the record could not be saved | `useBeacons.ts:338` | ⚠ SAFETY | `Your Beacon went out, but we couldn't save a record of it.` | On the Sprint 1 list as pre-existing. After W311 the server message can be a row-security refusal. Same recommendation: no raw server text |
| 3.6 | `Could not load the roster.` | Roster screen, when the roster cannot be read | `mobile/src/screens/RosterScreen.tsx:164` | | (no change proposed) | W313 moves the roster to a server function and D50 narrows the rows; a refusal lands here. The code shows the raw error message when there is one, and this text only as a fallback, so rule 4 below applies |
| 3.7 | `Not connected to the ride yet — your beacon did NOT go out. Try again in a moment.` | Error chip when the Beacon button is tapped before the ride connection exists | `mobile/src/hooks/useBeacons.ts` (`NOT_CONNECTED_MSG`) | ⚠ SAFETY | (as written) | Added by D94 on 2026-11-22, after this list was prepared. Before D94 the tap did nothing and said nothing |

Nothing is shown when a cancel changes no row (someone else cancelled first, or the caller has no standing). That is deliberate and unchanged.

## 4. Play-facing sentences that need new wording when the widened build ships

**Club admins.** Pillar II gives club admins sight of beacons in Race Control. The proposals in rows 4.2 to 4.4 name them (as "the club's organisers", the listing's existing word), so the Play text does not promise fewer viewers than the server will allow. The in-app rows 1.3, 1.5 and 1.6 do not name them yet: that is question 1, and whatever is ruled there applies to every who-sees sentence. Web Race Control is not built this sprint, but the server grants the access in this sprint (W193).

**Do not change these now.** The build on Play (versionCode 4) still behaves as they say. They change in the same release as section 1. Proposed wording is offered so the Play update is not a second copy round.

| # | Current text (exact) | Where | Proposed placeholder | Note |
|-|-|-|-|-|
| 4.1 | `A live map while the ride is on: Captains and support crew see every rider, and riders see their Captain and support crew` | Store listing, "On the ride" · `docs/play/store_listing.md:50-51` | (no change) | Still true |
| 4.2 | `A Beacon lets a rider signal they need help, so the Captain and support crew know to look for them` | Store listing · `store_listing.md:54-55` | `A Beacon lets a rider signal they need help. Everyone on the ride, and the club's organisers, can see where they are until it's cancelled` | |
| 4.3 | `Vechelon uses your location only while you're in an active ride. It's shared live with your ride's Captain and support crew.` | Store listing, "Your location, plainly" · `store_listing.md:58-59` | `Vechelon uses your location only while you're in an active ride. It's shared live with your ride's Captain and support crew, and with everyone on the ride and your club's organisers if you raise a Beacon.` | |
| 4.4 | `Live group-ride map. While a club ride is active, Vechelon shares each rider's position with the ride's Captain and support crew so they can keep the group together, see who has dropped off the back, and find a rider who needs help.` | Background-location declaration, "Which feature uses background location?" · `docs/play/background_location_declaration.md:14-16` | Add: `If a rider raises a Beacon, their position is also shown to the other riders on that ride, and to the club's organisers, until it is cancelled.` | The declaration video shows the disclosure screen; if row 1.3 changes, the video is re-recorded |
| 4.5 | Data Safety form, Precise location: `Shared with third parties: No` · purpose `App functionality (live group ride map, safety)` | `docs/play/data_safety.md:11` | (form answer, not copy; no change proposed) | Other riders on the same ride are users of the app, not third parties, so the answer should stand. Worth one look by the Senior PM when the form is next opened, since more people now receive a position |
| 4.6 | `Beacon location … Coordinates cleared after 30 days; the alert record stays` | Data Safety retention table · `data_safety.md:29` | `Beacon record, with its location: deleted 30 days after it was raised` | **Not a wording question.** Pillar II v1.2.0 §2 now says the whole beacon row is deleted 30 days after raise. Our own note says the record stays. The privacy policy and this table need to match whichever the retention job does at the time of the Play update |

## 5. Carried from Sprint 1, still waiting on the same pass

Ledger §16.11 names three items for this pass. Two are not built in Sprint 2 but belong in the same sitting:

| Item | Where it is listed | State |
|-|-|-|
| The `SLEEPING` state label | Sprint 1 list, row 7.1 | Enshrined as a fifth state on 2026-11-15; label still placeholder |
| The fourth roster value ("tracks only while the app is open", Captain and SAG only) | Pillar II §4.1 | Not built yet; no string exists. Proposed placeholder: `App-open only` |
| The beacon disclosure sentence | This list, row 1.3 | Blocks brief item 10 |

## Questions for the Voice & Tone pass

1. **Row 1.3** is the one that blocks the build. Is the proposed sentence acceptable? **Club admins:** they will be able to see beacons (Race Control), so a sentence that lists who sees a beacon and leaves them out promises too little. Should rows 1.3, 1.5 and 1.6 name them, as the proposals for 4.2 to 4.4 do? The Hands' recommendation is yes for 1.3; the policy sentence 1.2 already says "to your club".
2. **Row 2.3:** what does a rider see where the phone number would be: a reassurance, or nothing?
3. **Row 2.2:** the rider-facing label for a beacon on someone else.
4. **Rows 3.3 to 3.6:** agree the rule that the app never prints server error text to a rider. If agreed, the Hands replace those strings in the item 10 build.
5. **Row 2.5:** "Cancel Support" or "Cancel Beacon".
6. **Rows 1.3, 1.5, 4.2, 4.3:** "everyone on the ride" or "everyone on the ride using the app"? Only riders in the app see a beacon.
7. **Rows 1.5 and 1.6:** the system dialog and the tracking notification each say who sees the position, in different words from 1.3. One wording for all three?
