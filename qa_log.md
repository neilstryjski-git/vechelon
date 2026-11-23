# QA log

Validation records against Pillar III and the sprint briefs. Newest first.

## 2026-11-22 — D50: participant rows readable to §4.1, rules T5, T6, T7

Change: migration `20261122010000_d50_participant_rows_section_4_1.sql`, three mobile read
sites and two web read sites. Results are from Rail 3 CI on the D50 pull request (local stack).

| Case | Before D50 | After (CI) | What it proves |
|---|---|---|---|
| T5.1 | Fails | Passes | A rider cannot read another rider's phone, position or ping from the table |
| T5.2 | Fails | Passes | Nor by any other path (accounts, embeds, contact function, admin view, roster, fleet seed, attendee list) |
| T5.3 | Fails | Passes | Nobody off the ride reads a rider's phone or position |
| T5.5 (new) | n/a | Passes | Fleet seed: a rider gets positions for leaders and active beacons only; nothing off the ride |
| T5.6 (new) | n/a | Passes | Attendee list: club members get names only; another club gets nothing |
| T6, T7 | Pass | Pass | Riders still read the roster and leaders' phones; Captain and SAG read everything |
| T16 | Pass | Pass | Cross-club isolation holds |

Not on staging: the Play build (versionCode 4) reads the table directly for its roster, fleet
seed and beacon seed, so this waits for the cutover (W317). Not on production.

**Review r1, fixed in the same pull request:** the member calendar's head count (missed read
site), seeds that ran before the join was written, empty-result fallbacks on the web, and
signed-out reads erroring instead of returning nothing. T5.5 now also proves Captain, SAG and
the club admin get a rider's position; T5.6 proves an email-shaped name is withheld, the
calendar counts, the admin and Captain table reads, and a signed-out read.

**Ruled by the Senior PM 2026-11-22 (accepted):** a club admin can read position and ping
columns of their club's participant rows (see the dev log). Every member could before D50.

Not yet run: the changed web pages in a browser; the changed app reads on a device.

## 2026-11-22 — D94: ride scoping on the channel, rule T1

Change: migration `20261122000000_d94_ride_scoped_broadcast.sql`. Results from Rail 3 CI on
pull request #170 (local stack).

| Case | Before D94 | After (CI) | What it proves |
|---|---|---|---|
| T1.1 | Fails | Passes | A club member off the ride cannot subscribe to the ride's channel |
| T1.2 | Fails | Passes | Nobody off the ride (off-ride member, departed rider, member who never opened it) can send on it, by REST or socket |
| T1.3 | Fails | Passes | A rider who has left cannot subscribe again |
| T3.1, T3.2, T4.1 | Pass | Pass | People on the ride still receive leaders' positions and beacon state |
| T8.1, T8.2 | Pass | Pass | A club admin who is not on the ride still subscribes (Race Control); another club's admin does not |
| T16.1 to T16.4 | Pass | Pass | Cross-club isolation holds |

Rules after D94 on the local stack: 12 pass, 4 fail (T2, T4, T5, T9: W193 and D50).

The older isolation matrix (`mobile/tests/rlsIsolation.test.mjs`) asserted the old rule, that
any club member could join a ride's channel. It now asserts the new one: a rider on the ride
joins and sends; a member with an RSVP who never opened the ride is refused.

**Play build (versionCode 4) compatibility, read from the code, not yet seen on a device.**
The app opens the channel at the same moment it writes its join. With D94 on the server, a
first open of a ride (or a rejoin after leaving) is refused once and connects on the app's
own retry about 2 seconds later; the map shows the "CHANNEL DENIED" chip for that moment.
Leaving is unaffected: the app sends its departure message before it writes the departure
mark. The next build opens the channel after the join has settled, so it never sees the chip.

**Review r1 (2026-11-22), fixed in the same pull request.**

| Finding | Fix | Proof |
|---|---|---|
| The admin branch tested the role only, so a suspended or archived admin (who keeps the role) could subscribe to every ride of the club; W304 had refused them | New helper `rail3_ride_admin`: admin role AND `affiliated` status | New case T8.3; SQL gate now evaluates the expression the policy uses |
| A beacon tap before the channel opened did nothing and said nothing | The tap now shows an error saying the beacon did not go out | Read from code; not on a device |
| The participant lookup had no usable index | Plain index on (ride_id, account_id) | CI |

**Known limits, not closed by D94 (carried to W193).**
- T1.3 proves a NEW subscription by a departed rider is refused. Realtime checks at join, so a
  connection admitted earlier and kept open after its rider leaves keeps receiving until it
  reconnects. The app closes its channel on leave; a modified client would not.
- The departure mark is per account. One account live on two devices: when one leaves, the
  other is refused until it re-opens the ride.
- Acceptance criterion 6 (the Play build still connects with D94 on staging) is shown by
  reading the code only. A slow first open can be refused more than once before it connects.

**Staging apply, 2026-11-22 (Senior PM approved "option 1": apply now).** Target
`xybgtbybdhxuwqjfcfkc` named on every command; production untouched. Method as for W311/W312:
Management API, one rolled-back trial (policies read back, no helper left behind), then
`BEGIN; file; schema_migrations row; COMMIT`. No ride was active at the time (one planned
ride, nobody had opened it). Evidence: `~/vechelon-backups/d94-staging/`.

Denial suite against staging (`--target staging --only T1,T3,T8,T16`), zero leftover rows:

| Case | Staging result |
|---|---|
| T1.1, T1.2, T1.3 | Pass (were failing on staging before the apply) |
| T3.1, T3.2 | Pass |
| T8.1, T8.2, T8.3 | Pass |
| T16.2, T16.3, T16.4 | Pass |
| T16.1 | Error, not a D94 result: its in-club control read calls `get_ride_roster` (W313), which is not on staging. The cross-club half did not run. |

**Device check by the Senior PM, 2026-11-22 evening (23 Nov 03:24 to 03:36 UTC), D94 live on
staging.** Galaxy S23 on the Play open-test build (versionCode 4, commit `bbbde56`) as
Captain; Galaxy S21 as rider on the older validation build (`3892439`, not versionCode 4).
Server rows read back from staging for each step.

| Step | Ride | Result |
|---|---|---|
| First open (Captain, S23) | Jigsaw, then Lantern | Connected. On Lantern the Senior PM watched for the "CHANNEL DENIED" chip and did not see it |
| First open (rider, S21) | Jigsaw | Connected; the rider's beacon reached the Captain 34 s after the rider's first open |
| Raise and cancel own beacon (Captain) | Jigsaw | Row written and closed by the Captain |
| Rider raises, Captain cancels | Jigsaw | Row closed by the Captain |
| Leave, then rejoin (Captain) | Jigsaw | Departure mark set 03:28:43, cleared on rejoin 03:31:11 |
| Leave (rider) | Jigsaw | Departure mark set; last position cleared |
| End Ride (Captain, after rejoin) | Jigsaw | Ride saved 03:32:19; no beacon left open |

Criterion 6 (the Play build still connects with D94 on staging): met on the S23. The S21
shows the older build connects too; it is not evidence for versionCode 4.

## 2026-11-22 — W313: roster on the server function, rules T5 to T7

Change: `get_ride_roster(ride)` (migration `20261118020000`), the mobile roster screen switched
to it, and a held migration (`20261118030000`) that drops the staging-only identity hydration
trigger at cutover. The CI database is built from migrations alone, so the hydration trigger
is absent there: these results are the roster working without it.

| Case | Before W313 | After (CI) | What it proves |
|---|---|---|---|
| T5.4 (new) | — | Passes | Through the function: a rider gets no other rider's, guest's or departed rider's phone, no position, no extra columns; a club member off the roster and another club's member and admin get no rows |
| T6.1, T6.2 | Pass (table read) | Pass | Now read through the function: every row by name and state; the Captain's, co-Captain's and SAG's phones |
| T6.3 (new) | — | Passes | The guest is marked roster-only; a rider gets their own phone back; only the three known participation values reach a rider |
| T7.1 to T7.3 | Pass (table read plus contacts function) | Pass | Now through the function: Captain and SAG read every phone, the guest's included; co-Captains read each other's |
| T5.1 to T5.3 | Fail | Fail (expected) | The table itself still returns phones and positions to club members. That is D50, not this ticket |

Source: Rail 3 CI run 45054913692 on pull request #169; zero leftover rows.

Unit tests: `mobile/tests/rosterLogic.test.mjs`, seven new cases for the mapping from the
function result to roster rows per role (29 pass with the roster cache tests).

Not yet run: the roster on a development build as rider, Captain and SAG (manual). Staging:
the function is additive and can be applied; the trigger drop is held for the cutover.

## 2026-11-18 — W312: the `actor_deleted` reason, rule T13

Change: one migration, `20261118010000_w312_beacon_actor_deleted.sql`. Results below are from
Rail 3 CI on the pull request (local stack). Staging is recorded when the migration is applied.

| Case | Before W312 | After (CI) | What it proves |
|---|---|---|---|
| T13.1 | Fails | Passes | Deleting an account turns that person's past cancels into `actor_deleted`; a `ride_ended` row is unchanged |
| T13.2 (new) | — | Passes | A client cannot get `actor_deleted` written, directly or by blanking the actor |

Rule T13 passes on the local stack (Rail 3 CI run 44451287671, pull request #168); zero
leftover rows.

Account deletion with no beacon history: `supabase/tests/w299_account_deletion.test.sql` runs
in the same CI job and passed. The CI database has every migration applied, so the beacon
table and the new trigger exist there; the test's accounts have no beacon rows, so the
deletion's beacon update matches nothing and the deletion completes.

**Staging, 2026-11-22** (Senior PM approved the apply). Trialled in a rolled-back transaction,
then applied on its own and recorded in the migration history (version 20261118010000). Run
against staging afterwards: T13.1, T13.2, T12.1 and T14.1 pass; zero leftover rows. The
ticket's check, closed rows with a blank actor and a blank reason: 0 before, 0 after.
Evidence: `~/vechelon-backups/w311-w312-staging/`.

## 2026-11-18 — W311: beacon insert and cancel tightening, rules T10 to T12

Change: one migration, `20261118000000_w311_beacon_write_guard.sql`. The "After" column is the
result of Rail 3 CI on pull request #166 (local stack, every migration replayed). Staging and
the on-device check on the Play build are recorded below when run.

| Case | Before W311 | After (CI) | What it proves |
|---|---|---|---|
| T10.1 | Fails | Passes | A rider cannot insert a beacon in another rider's name |
| T10.2 (new) | — | Passes | A beacon cannot be inserted already cancelled |
| T11.0 (control) | Passes | Passes | Own rider, Captain and SAG can each still cancel |
| T11.1 | Fails | Passes | A club admin off the ride, or another rider, cannot cancel |
| T11.2 | Fails | Passes | Position, time and rider columns cannot be rewritten |
| T11.3 | Fails | Passes | A closed beacon cannot be re-opened or overwritten |
| T11.4 | Fails | Passes | The canceller recorded is the caller, never blank or someone else |
| T12.1 | Passes | Passes | No client writes `beacon_cancel_reason` |
| T14.1 | Passes | Passes | Ride end still closes open beacons with `ride_ended` |
| T14.2 (new) | — | Passes | A rider's delayed raise after ride end is still recorded, closed with `ride_ended` |
| T16.2 | Fails | Passes | Another club's member cannot attach a beacon to this club's ride |

Rules after W311 on the local stack: 10 pass (T3, T6, T7, T8, T10, T11, T12, T14, T15, T16),
6 fail (T1, T2, T4, T5, T9, T13).

**Staging, 2026-11-22** (Senior PM approved the apply). The migration was trialled in a
rolled-back transaction, then applied on its own and recorded in the migration history
(version 20261118000000). Staging had 0 open beacons. Run against staging afterwards:
T10.1, T10.2, T11.0 to T11.4, T12.1, T14.1, T14.2 and T16.1 to T16.4 all pass; zero leftover
rows; beacon count unchanged at 119. Evidence: `~/vechelon-backups/w311-w312-staging/`
(state before and after, and the run report).

Not yet run: raise, self-cancel and Captain or SAG cancel on the Play build (versionCode 4),
by the Senior PM.

Also recorded: staging was set to private realtime channels only on 2026-11-18 (Senior PM
approved). Checked on staging the same day: T3, T4.1 and T8 pass (private channels work) and
T15.2 passes (a public channel is refused). Production is owed the same setting at Gate B.

## 2026-11-18 — W310: public web `ride:<id>` channel, rule T15

Finding: the channel had one subscriber and one sender in the web app, both dead code (never
imported). Nothing in mobile, the Worker or the edge functions used it. Detail and payload
fields: `docs/rail3/sprint2/brief_section8_answers.md`, item 3.

Change: both files deleted. No behaviour changes, because nothing ran them.

| Case | Before W310 | After W310 | What it proves |
|---|---|---|---|
| T15.1 | (provisional probe, failed) | **Passes** | No app source opens a realtime channel without `private: true`, and none names a `ride:` topic. Shown to fail when the old hook is put back |
| T15.2 (advisory) | — | Fails | The Realtime service still relays a public channel between unauthenticated clients. Outside rule T15: nothing in the product sends on one. Turns green when the project is set to private channels only |

Rule T15 now passes. Baseline after W310: 7 rules pass, 9 fail (39 cases: 19 green, 20 red,
one of the red advisory).

Web pages: the web build gate passed with the two files removed. No page imported them, so
there is no page behaviour to re-test. Web Race Control is not on the trunk (see the answers
file), so the ticket's manual Race Control step has nothing to run against.

## 2026-11-18 — W309: denial suite T1 to T16, baseline before enforcement

Suite: `mobile/tests/denial/` (38 cases across 16 rules; see its README). Source of the rules:
Sprint 2 brief §4, Pillar II §2, §3 Feature 2, §4.1, Ledger SD-011 and §16.1, Pillar III R3-78,
DoD-12, V-012.

Channel layout under test: one private channel per ride, open to every affiliated club member
(before W193).

### Baseline per rule

| Rule | Before enforcement | What the run showed | Closed by |
|---|---|---|---|
| T1 | **Fails** | A member off the ride, and a rider who has left, can subscribe. Broadcasts from an off-ride member, a departed rider and a never-opened participant are all delivered, by REST and by socket | W193, D94 |
| T2 | **Fails** | A rider's socket receives another rider's position | W193 |
| T3 | Passes | Rider receives Captain and SAG positions. Passes only because the one channel carries everything; it becomes a real proof when T2 turns green beside it | must stay green through W193 |
| T4 | **Fails** | Beacon state and the beaconing rider's position reach riders (passes, same caveat as T3). They do not stop on cancel or on ride end, on a connection that was open at the time or on a fresh one | W193 |
| T5 | **Fails** | A rider on the ride reads another rider's phone, last position and last ping from `ride_participants`, and again through `ride_participants_pa_view`. So do an off-ride member, a departed rider and a never-opened participant | D50 |
| T6 | Passes | A rider reads every row's name and state, the guest included, and the leaders' phones. Passes through the same over-wide read T5 fails on; it must stay green when D50 closes T5 | W313 keeps it green |
| T7 | Passes | Captain and SAG read every phone, the guest's included; co-Captains read each other's. Members' phones come from `get_ride_roster_contacts`; a guest's comes from the participant row | must stay green through D50 |
| T8 | Passes | Club admin subscribes and sees a beacon; another club's admin is refused. The admin half passes only because any member may subscribe | must stay green through W193 |
| T9 | **Fails** | An off-ride member and a departed rider read the ride's beacon rows and flags. A participant who never opened the ride reads beacon rows and flags and can subscribe | W193, D94, W311 |
| T10 | **Fails** | A rider inserted a beacon in the Captain's name | W311 |
| T11 | **Fails** | Another rider, an off-ride member, a never-opened participant and a club admin each cancelled a rider's beacon. Non-cancel fields can be rewritten, a closed beacon re-opened or overwritten, a cancel written with no actor or with someone else as actor. The permitted cancels (own rider, Captain, SAG) work | W311 |
| T12 | Passes | No client could set `beacon_cancel_reason`, on insert or update (D81 guard) | — |
| T13 | **Fails** | After deletion the person's past cancel reads reason `null`, not `actor_deleted`. The `ride_ended` row is left alone | W312 |
| T14 | Passes | Captain ends the ride: the open beacon closes with `ride_ended`, the ender recorded, beacon flags cleared. Built in D81 | — |
| T15 | **Fails** (provisional) | An unauthenticated listener on the public `ride:<id>` channel received a position sent to it. Probe only; W310 owns the finding and the final test | W310 |
| T16 | **Fails** | Cross-tenant reads are all refused in both directions, as are channel joins, broadcasts, telemetry writes, and a channel for a ride that does not exist. One write gets through: a member of another club can insert a beacon row under their own club that points at this club's ride | W311 |

Six rules pass and ten fail (18 cases green, 20 red, 0 errors).

### Where it ran

| Target | Result |
|---|---|
| Local stack, migration-only database (Rail 3 CI run 44426316001) | Baseline above |
| Local stack, seeded database (run 44423732591, an early version of the suite; diagnostic step since removed) | Same result per rule |
| Staging `xybgtbybdhxuwqjfcfkc`, 2026-11-18 (Senior PM approved the run) | Identical to the baseline, case for case. No staging exception was needed |

### Staging run

One run, about two minutes. It created two test clubs, twelve test users (one more deleted by
T13 as designed), three test rides and their rows, all marked `w309`, and removed them. Counted
afterwards by the runner and again by a separate `--sweep`: zero test clubs, accounts, rides,
participant rows and auth users. No real club, member or ride was read into a test or written
to; the only rows created on staging since 2026-11-15 are two real ad hoc rides and one real
sign-in, none from today. Report copy: `~/vechelon-backups/w309-denial/`.

The hydration trigger that staging still carries (recorded exception until W313 / W317) did
not change any result: the fixtures write name and phone on participant rows the way the app
does at join, so local and staging start from the same data.

### Findings beyond the expected baseline

1. **T16 was expected to pass and does not.** The beacon insert policy checks only that the
   caller is affiliated with the row's `tenant_id`, not that the ride belongs to that club. No
   read crosses a club boundary. Recorded on W311, which tightens that insert.
2. **`ride_participants_pa_view` is a second path to a rider's phone and position** for an
   ordinary rider. D50 has to close it along with the table policy.
3. **A club admin who is not on the ride can cancel a rider's beacon.** Pillar II names the
   own rider, the Captain and the SAG only.

4. **A rider also reads another rider's email** from `ride_participants`. The brief's T5 lists
   phone, last position and last ping, so the test does not fail on email; it is noted here
   for D50.

### Not covered

- A rider who was connected, then left the ride, and keeps the socket open. Realtime caches
  authorization per connection, so whether that connection can be cut off is a W193 design
  question. The suite tests a departed rider joining and sending afresh.
- `rail3_breadcrumb` (the leader route): no case writes or probes it.

- The fourth participation value (tracks only while the app is open), which §4.1 gives to
  Captain and SAG only. It has no server field to test yet.
- T14 "cleared from every map": the server side is tested (row closed, flag cleared). What a
  device draws is app behaviour and is not asserted here.
- T13 runs the deletion routine as the service role, not through the `delete-account` function.
- T15 is a probe until W310 reports.
