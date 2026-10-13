# Rail 3 Sprint 1 (G34) field run sheet: one ordinary ride

**Build:** Android APK "Vechelon (Staging)", code **993020f**, on staging. **Covers:** W279–W293 (not W283, which needs no device).
**Shape:** one normal group ride, plus about 10 minutes before and 5 after. There is no test session.

**Phones**
- **A (you):** you create and start the ride, so you are the Captain and the breadcrumb leader.
- **B (a riding friend):** joins as an ordinary **Member**.
- **C (optional third phone):** an account that is a **Captain on this ride but did not create it and is not a club admin**. C ends the ride, which is the D83 check.
  - *Two phones only:* make B that co-Captain instead. Skip the lines marked **[rider view]** and B ends the ride.

**How to note evidence:** write the **time (hh:mm)** and **what you saw** on the line under each check. I pull everything else from the staging DB afterwards.
**Never write down a location, an address, a street or coordinates.** Times and observations only.

---

## If you only do five things
The rest of the sheet is a menu, not a script. These five close the two open defects and the riskiest new behavior:
1. **Co-Captain ends the ride** and the creator's map reacts at once (§5). *(D83, W291)*
2. **A rider leaves while you're pocketed:** no ghost on unlock, and the roster says "Left ride" (§3). *(D87, W292)*
3. **That rider rejoins:** exactly one marker (§3). *(W292)*
4. **You (Captain) leave and rejoin:** others see "Captain has left the ride", then one trail with a gap (§4). *(W290)*
5. **After the ride is ended:** pocketed phones drop their tracking notification silently within about 3 min (§5). *(W287)*

---

## 0. Before you leave (Claude, not you)
- ~~Staging migrations pushed~~: **DONE 2026-10-04** (W284, W288, W291, W292 all on staging).
- Tell Claude the ride name, and Claude switches on full capture for this one ride (W284).
- The W285 badge stays **off** until the W279 values are confirmed. Skip every W285 line unless Claude says the badge is on.

## 1. Before the ride (about 10 min)
- [ ] **Every phone** is on 993020f: the Home screen version reads 993020f. Older builds misread the new trail gaps and the 'sleeping' state. *(W290, W293)*
  → note: ___
- [ ] Every phone: Battery is **Unrestricted**, Location is **"Allow all the time"**, and you are signed in.
  → note: ___
- [ ] **Staging web** (racer-sportif.staging.vechelon.ca): edit and save today's ride (for example, change the description). The save goes through. *(W291 ownership guard must not block an admin)*
  → note: ___
- [ ] **Staging web:** create a throwaway ride and **end it** from the web. It ends cleanly. *(W291)*
  → note: ___
- [ ] On the web roster for today's ride, add one **guest** or a **web-RSVP member who won't open the app**, so the roster has a non-app row. *(W288)*
  → note: ___
- [ ] **B joins with Battery Saver ON** (fresh app launch, so close Vechelon from Recents first). Note the join time and whether B is indoors or outdoors. Lock B's screen within a few seconds. A Saver prompt appears at join, and the join still goes through. *(W279 one Saver-ON run, W280 R3-05)*
  → note (join time, indoor/outdoor, prompt seen?): ___
- [ ] *(Only if the badge is on)* B sees no badge and no "position isn't reaching" prompt during start-up. *(W285)*
  → note: ___
- [ ] A and C join normally, with Saver OFF. *(W279 control run, W284 engine_started)*
  → note (join times): ___
- [ ] **Roster on A (Captain):** every row has a phone number and Call button. Each row is marked **App tracked** or **Roster only**, and the guest row is Roster only, shown in neutral grey, not as an error. *(W288)*
  → note: ___
- [ ] **[rider view] Roster on B:** B sees all rows, but phone numbers only for Captains/SAG. B's own row has a **YOU** chip. *(W288)*
  → note: ___
- [ ] **Offline roster on B:** open the roster, turn on airplane mode, swipe Vechelon away from Recents, relaunch and open the roster. Rows show with a "Last-known roster… Not live" banner. Turn airplane mode off. *(W289)*
  → note: ___

## 2. Start / first kilometres
- [ ] While locked and still in the pocket, B turns **Battery Saver OFF from the lock screen** without unlocking. B keeps riding normally and stays live on A's map. *(W280 R3-47)*
  → note (time toggled): ___
- [ ] A and B each see the other moving normally. Nobody shows violet or Dark. *(W284 healthy ride: zero engine_died)*
  → note: ___
- [ ] *(Only if the badge is on)* While **moving**, no black "!" badge appears next to your own blue dot. If one ever appears, it moves with the dot and never sits behind it. *(W285)*
  → note: ___

## 3. During the ride
- [ ] **A turns Battery Saver ON**, locks, then unlocks a bit later. **One** Saver advisory appears on unlock. Dismiss it and nothing else changes. Turn Saver back OFF. *(W280 R3-06, R3-49)*
  → note: ___
- [ ] **Pocketed SOS:** A pockets the phone for at least 2 min. B raises SOS (Support Beacon) during that time. A unlocks. The beacon shows on B with a **dashed ring** until B's next live fix, then a normal SOS. *(W282 R3-55)*
  → note (SOS time, unlock time, dashed?): ___
- [ ] A cancels B's SOS from B's bottom sheet. B feels a haptic. After A locks and unlocks again, the SOS does **not** come back. *(W282 R3-20)*
  → note: ___
- [ ] **App swiped away:** B swipes Vechelon out of Recents and keeps riding with the phone pocketed for about 5 min. On A, B stays on the map (possibly at last-known), then live again. *(W286 headless re-assert)*
  → note (swipe time): ___
- [ ] **Café or regroup stop of 6+ min:** *(only if the badge is on)* no badge or prompt on anyone who is just stopped. *(W285)*
  → note: ___
- [ ] **B leaves while A's phone is pocketed:** B taps back off the map (Leave Ride). A unlocks later. B is **not** on A's map (no ghost), and A's roster shows B as **"Left ride"** with details still visible. *(W292, D87)*
  → note (leave time, A unlock time): ___
- [ ] Right after leaving, B swipes Vechelon from Recents and waits about 2 min. Nothing restarts and no tracking notification returns. *(W286 zero rows after Leave)*
  → note: ___
- [ ] **B rejoins.** Exactly **one** B on A's map, live again, and the roster no longer says Left ride. *(W292 R3-68)*
  → note (rejoin time): ___

## 4. Captain leaves and rejoins (A)
- [ ] A taps back off the map (**Leave Ride**, not End). On B: the banner **"Captain has left the ride"** appears, and the Captain's trail stops and turns **dashed or dimmed**. *(W290)*
  → note (leave time, cue seen on B?): ___
- [ ] While A is out: the ride stays active on B. B's map, roster and SOS all still work, nobody is promoted, and B has **no** End Ride button. B's phone does **not** tear down. *(W291 R3-71, W287)*
  → note: ___
- [ ] *(Phone C)* If C is a Captain, C stays a plain participant and has no new powers. *(W291 no promotion)*
  → note: ___
- [ ] A rides on **at least 300 m** and then rejoins. On B: **one** trail with a visible **gap** (no straight line bridging it), the cue clears, and A's End Ride button is back. *(W290, W291)*
  → note (rejoin time): ___
- [ ] *(Phone C)* C leaves and rejoins briefly. B gets **no** Captain-left banner, because C is not the trail leader. *(W290)*
  → note: ___

## 5. End of ride
- [ ] Just before ending, **B signs out:** go Home, then Sign Out. On A, B's marker drops within seconds. B signs back in and rejoins. *(W281 R3-58)*
  → note (sign-out time): ___
- [ ] B raises **SOS** and leaves it up, then **pockets and locks** the phone with data on. *(W282/W287 D81)*
  → note: ___
- [ ] **C ends the ride** (two taps: End Ride, then Confirm). If there is no C, B ends it as co-Captain. A's map reacts **at once** with an ended notice and leaves the map. *(W291, D83)*
  → note (end time, A reaction delay, any double alert?): ___
- [ ] Without unlocking B: within about 3 min, B's tracking notification **disappears silently**, with no sound or alert. *(W287 R3-69, R3-35)*
  → note (time it cleared): ___
- [ ] B unlocks and reopens the ride. Nothing pulses, so the SOS is gone. *(W287, W282 D81)*
  → note: ___
- [ ] Nobody saw a Captain-left banner when the ride ended. *(W290)*
  → note: ___

## 6. After the ride (2 min)
- [ ] Try to open the roster for the ended ride on A and B. It shows **closed**, not a live list. *(W288, W289)*
  → note: ___
- [ ] Send Claude the ride name, the phone models and Android versions, and this sheet. Claude pulls engine_first_fix, telemetry counts, departed_at, beacon_active and the breadcrumb row. *(W279, W282, W284, W290, W292)*

---

## Optional extras (about 2 min each, only if you have the appetite)
- **Force-stop the location service** from Settings > Apps > Vechelon while the app stays open. The engine comes back by itself within about 1 min, with no tap needed. *(W286 R3-42, W284 engine_died, W285 badge + unlock prompt if on)*
- **OEM kill** (Samsung Battery > Sleeping apps). No self-recovery is expected, because this is documented as non-recoverable. *(W286, W285 warns if on)*
- **Sign out in airplane mode** during a ride. Sign-out completes immediately and nothing crashes. *(W281)*
- **Account swap:** sign out, sign in as another rider on the same phone and open the roster offline. There is no cached roster from the first account. *(W281 R3-57, W289)*
- **No-background-permission rider:** set Location to "Only while using the app", join and pocket the phone. Others see calm **violet Sleeping**, never Dark. *(W293)*
- **Captain silent for more than 15 min** (the Dark threshold): A in airplane mode at a long stop. B sees the trail dashed but **no** Captain-left banner. *(W290)*
- **More Saver runs:** any extra join with Saver ON or OFF just adds rows. Note the join time and indoor/outdoor for each. *(W279)*

## Ticket coverage
| Ticket | Covered by | Not coverable on an ordinary ride (optional extra) |
|---|---|---|
| W279 | §1 B Saver-ON join, A/C control joins | Full 12-run matrix: more Saver runs, about 2 min each |
| W280 | §1 join prompt, §2 lock-screen toggle, §3 A Saver lock/unlock | none |
| W281 | §5 sign-out with A watching | Airplane-mode sign-out, account swap |
| W282 | §3 pocketed SOS + cancel, §5 SOS at end | none |
| W284 | Healthy-ride counters (all joins), full capture set by Claude | engine_died needs force-stop; T+4h purge is DB-side |
| W285 | **Only if the badge is on:** §1, §2, §3 stop | Force-stop FGS → badge + prompt |
| W286 | §3 swipe-away, §3 Leave then swipe | Force-stop service, OEM kill |
| W287 | §4 Captain Leave (no teardown), §5 pocketed end + SOS | Airplane-at-end variant; inactivity auto-close (hours, DB-side) |
| W288 | §1 rosters (Captain + rider view), §6 closed | Web-RSVP member flipping to App tracked on first open needs that member to open the app |
| W289 | §1 offline roster, §6 closed | Account swap; offline-after-Leave |
| W290 | §4 leader leave/rejoin + C leave, §5 end | Captain Dark for more than 15 min |
| W291 | §1 web edit/end, §4 captainless, §5 co-Captain end (D83) | none (with C or B as co-Captain) |
| W292 | §3 leave/ghost/rejoin (D87) | Dark rider beside a departed rider (third phone off) |
| W293 | Indirect (all on new build) | No-permission rider → violet Sleeping. The ticket's old-build interop step is **dropped**: every handset must be on 993020f |
