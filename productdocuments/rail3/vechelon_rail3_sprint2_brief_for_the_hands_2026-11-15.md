# Vechelon Rail 3: Sprint 2 Brief for the Hands

Written 2026-11-15 by the Brain | Derived from Pillars I to IV at v1.2.0 | Status: **Issued. The v1.2.0 Pillars were committed by the Senior PM 2026-11-15.**

The Pillars are the source of truth. This brief points at them and adds nothing to them. Where the two disagree, the Pillars win; say so in `log_of_changes.md` and flag it.

---

## 1. Goal

Ratified by the Senior PM 2026-11-15 (Ledger §16.10):

> **Enforce the Pillar II §4.1 visibility and contact rules on the server, as amended at this session's MACD sync, and prove it with denial tests on a staging database rebuilt from the merged trunk.**

Today the §4.1 rules hold in the app only. The database and the broadcast channel hand a rider's device more than its role is allowed to see, and the app hides it. After this sprint a role's device never receives what its column denies.

## 2. Done means

- Staging is rebuilt from one trunk and matches it. Nothing on staging exists outside a migration.
- Every rule in section 4 has a denial test that fails before the change and passes after, run against that staging database.
- The app behaves to the widened beacon rule, and the in-app disclosure says what the wire now does.
- `log_of_changes.md` records what was built. Deviations from the Pillars arrive as a Pillar V amendment, not as code.

## 3. Scope, for you to decompose

Ticketing and sequencing are yours. Record each W-number against the item it came from.

| # | Work | Pillar trace | State today, per your supplement of 2026-11-15 |
|---|---|---|---|
| 1 | Merge `master` into `rail3-integration`: one ordered set of 77 migrations. Rebuild staging from it | Ledger §16.1 Gate A | Trunks diverged both ways; staging is neither |
| 2 | Resolve the three staging-only objects: drop the identity hydration trigger (after item 8), drop `rail3_sag_allowlist`, capture the D70 admin branch in a migration | Ledger §16.8 | All three applied by hand, in no migration |
| 3 | W193: role-scoped broadcast channels, with club admin access for Race Control and the widened beacon rule | Pillar II §2 Real-time Pattern, §3 Feature 2, §4.1 | One club-scoped channel per ride carries every position to every member |
| 4 | D94: ride scoping on subscribe and send | Pillar II §2 Real-time Pattern | Any affiliated club member can listen and send on any ride |
| 5 | D50: participant rows readable to §4.1, position columns included | Pillar II §4.1 ROSTER and CONTACT | The affiliated branch returns every column of every row |
| 6 | Beacon insert and cancel-field tightening | Pillar II §2 schema; Ledger §1 SD-011 | Any member can insert for another rider and rewrite any column but the reason |
| 7 | `actor_deleted`: account deletion sets the reason when it blanks the actor on a row with no reason. Rows marked `ride_ended` keep theirs | Ledger §1 SD-011 | Not built; W299 leaves those rows reading as system error |
| 8 | Mobile roster on the contacts function, plus a rider-facing version returning leaders' contacts | Pillar II §4.1 ROSTER | Roster still embeds `accounts(name, phone)`; works on staging only through the hydration trigger |
| 9 | Public web `ride:<id>` channel: establish what travels on it, then close it | Ledger §16.1 Gate B | Unverified. Recorded as bypassing realtime RLS |
| 10 | App: riders see every beacon on their ride, with the reduced bottom sheet. In-app disclosure wording changes in the same build | Pillar II §3 Features 1 and 2 | App still hides rider beacons from riders. Copy waits on Voice and Tone (section 7) |

**Build D50 to Pillar II §4.1, not to the ticket.** The D50 ticket's roster rule of 2026-07-03 (riders see only Captain and Support) is superseded. Every role sees the full roster by name and participation state. Phones: leaders' numbers to everyone, every number to Captain and SAG. Nobody but Captain and SAG reads another rider's last position or last ping.

## 4. The rules the tests must prove

"On the ride" means a participant of that ride who has opened it in the app and has not left it; the first-open mark is the signal. "Off the ride" means an affiliated member of the same club who has not joined it.

| # | Rule | Pillar |
|---|---|---|
| T1 | A member off the ride cannot subscribe to, or send on, any channel of that ride | II §2 Real-time Pattern |
| T2 | A rider on the ride does not receive other riders' positions over the wire. Receiving and hiding does not pass | II §4.1 MAP |
| T3 | A rider on the ride receives Captain and SAG positions | II §4.1 MAP |
| T4 | A rider on the ride receives beacon state for any rider on that ride, and that rider's live position while the beacon is active. It stops on cancel and on ride end | II §3 Feature 2 |
| T5 | A rider cannot read another rider's phone, last position or last ping by any database path | II §4.1 CONTACT, ROSTER |
| T6 | A rider can read every roster row's name and participation state, and the leaders' names and phones | II §4.1 ROSTER |
| T7 | Captain and SAG read the full roster with every phone. Co-Captains read each other's | II §4.1 ROSTER, CONTACT |
| T8 | A club admin who is not a participant can subscribe for Race Control and sees beacons. An admin of another club cannot | II §2, §4.1 |
| T9 | Beacon rows and beacon events reach riders with the app on that ride and the club's admins, and nobody else. A participant who never opened the ride in the app is denied on every path | II §3 Feature 2 |
| T10 | A beacon insert naming a rider other than the caller is rejected | II §2 schema |
| T11 | A beacon update is rejected unless the caller is the beacon's own rider or the ride's Captain or SAG; unless it touches only the two cancel fields; unless it moves them from empty to set; and unless `beacon_cancelled_by` is the caller | II §2 schema; IV §1 SD-011 |
| T12 | No client can write `beacon_cancel_reason` | II §2 schema |
| T13 | Deleting an account sets `actor_deleted` on that person's past cancels and leaves `ride_ended` rows alone | IV §1 SD-011 |
| T14 | A ride ending with an open beacon closes it with `ride_ended` and clears it from every map | III R3-78 |
| T15 | The public web ride channel carries nothing §4.1 denies, or no longer exists | IV §16.1 |
| T16 | Cross-tenant isolation still holds after every change above | III DoD-12, V-012 |

T1 to T9 are the goal. T10 to T13 make the SD-011 audit fields trustworthy. T14 is built in D81 and wants its test recorded. T16 is the regression guard.

## 5. Not in this sprint

Ruled, unscheduled, and not to be built ahead (Ledger §16.10, §16.1):

- The production migration, Supabase Pro, the fallback club, config de-staging.
- The inactivity close that replaces the D100 24-hour sweep. The sweep stays live as a known nonconformance.
- The D100 change from clearing beacon coordinates to deleting the row at 30 days.
- The D100 change moving breadcrumb deletion to 4 hours after ride end.
- Sleeping conditions, the background-tracking-off indicator, the fourth roster value, the co-Captain map alignment.
- Multi-membership. EU work. Derived ride artifacts.

Do not build enforcement that forecloses them. In particular the roster functions should not make the fourth roster value, shown to Captain and SAG only, impossible to add.

## 6. Constraints carried from the tickets

- Recursion is the first risk. `is_captain_or_support` reads `ride_participants`; realtime policies evaluate per message, so any helper must be cheap and non-recursive.
- `get_my_tenant_id()` is not edited. Fix at the policy.
- D50 touches 14 read sites in the web admin, plus the mobile roster, fleet seed and beacon seed. The web attendee list (names only, RP-16) must keep working.
- Race Control operators are not ride participants. They need their own branch on the channel policies.
- The D96 restrictive policy on `rides` is AND-ed with the Captain end-ride policy. That is Gate A work, not this sprint, but the staging rebuild will surface it.
- Ten of the twelve held Rail 3 migrations are dated earlier than migrations already applied. Expect the CLI to refuse them by default.

## 7. Dependencies and risk

- **Disclosure copy.** The beacon disclosure sentence is placeholder until the Voice and Tone pass, which needs your copy list. Send the list early; item 10's wording is blocked on it, the rest is not.
- **Size.** If the decomposition is too large, W193 stays and the roster work (item 8) moves.

## 8. Confirm and report back

Not blockers. Answers go in the sprint's Decision Brief.

1. A Sleeping rider still receives Captain and SAG positions when the app is open.
2. What the map draws today for a beaconing rider who goes Sleeping.
3. What travels on the public web channel (item 9 answers it).
4. Whether `beacon_active` is reset at ride end or at purge.
5. No production account holds two memberships today.

## 9. Owed alongside, outside the sprint goal

- Retroactive Pillar V amendment for D100: the 24-hour sweep, the beacon retention change, the breadcrumb deletion, and the per-ride phone clearing.
- Probe and close D93. Close W196, done by W304.
- Close PR #55 (W171) without merging.
- W259 rewritten to the confirmed gate (Ledger §16.1); W197 closed into it.

## 10. Standing rules

You do not edit the Pillars. You keep `log_of_changes.md`. A technical necessity that departs from the Specs is documented there and proposed as a Pillar V amendment before it ships. D100 and W206 are the two cases on record where that did not happen.
