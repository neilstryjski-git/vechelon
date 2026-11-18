# QA log

Validation records against Pillar III and the sprint briefs. Newest first.

## 2026-11-18 — W309: denial suite T1 to T16, baseline before enforcement

Suite: `mobile/tests/denial/` (36 cases across 16 rules; see its README). Source of the rules:
Sprint 2 brief §4, Pillar II §2, §3 Feature 2, §4.1, Ledger SD-011 and §16.1, Pillar III R3-78,
DoD-12, V-012.

Channel layout under test: one private channel per ride, open to every affiliated club member
(before W193).

### Baseline per rule

| Rule | Before enforcement | What the run showed | Closed by |
|---|---|---|---|
| T1 | **Fails** | A member off the ride, and a rider who has left, can subscribe; an off-ride member's broadcast is delivered | W193, D94 |
| T2 | **Fails** | A rider's socket receives another rider's position | W193 |
| T3 | Passes | Rider receives Captain and SAG positions. Passes only because the one channel carries everything; it becomes a real proof when T2 turns green beside it | must stay green through W193 |
| T4 | **Fails** | Beacon state and the beaconing rider's position reach riders (passes, same caveat as T3). They do not stop on cancel or on ride end | W193 |
| T5 | **Fails** | A rider reads another rider's phone, email, last position and last ping from `ride_participants`, and again through `ride_participants_pa_view` | D50 |
| T6 | Passes | A rider reads every row's name and state and the leaders' phones. Passes through the same over-wide read T5 fails on; it must stay green when D50 closes T5 | W313 keeps it green |
| T7 | Passes | Captain and SAG read every phone through `get_ride_roster_contacts`; co-Captains read each other's | — |
| T8 | Passes | Club admin subscribes and sees a beacon; another club's admin is refused. The admin half passes only because any member may subscribe | must stay green through W193 |
| T9 | **Fails** | An off-ride member reads the ride's beacon rows. A participant who never opened the ride reads beacon rows and flags and can subscribe | W193, D94, W311 |
| T10 | **Fails** | A rider inserted a beacon in the Captain's name | W311 |
| T11 | **Fails** | Another rider, an off-ride member, a never-opened participant and a club admin each cancelled a rider's beacon. Non-cancel fields can be rewritten, a closed beacon re-opened or overwritten, a cancel written with no actor or with someone else as actor. The permitted cancels (own rider, Captain, SAG) work | W311 |
| T12 | Passes | No client could set `beacon_cancel_reason`, on insert or update (D81 guard) | — |
| T13 | **Fails** | After deletion the person's past cancel reads reason `null`, not `actor_deleted`. The `ride_ended` row is left alone | W312 |
| T14 | Passes | Captain ends the ride: the open beacon closes with `ride_ended`, the ender recorded, beacon flags cleared. Built in D81 | — |
| T15 | **Fails** (provisional) | An unauthenticated listener on the public `ride:<id>` channel received a position sent to it. Probe only; W310 owns the finding and the final test | W310 |
| T16 | **Fails** | Cross-tenant reads are all refused, both directions, and so are channel joins. One write gets through: a member of another club can insert a beacon row under their own club that points at this club's ride | W311 |

Eight rules pass and eight fail (17 cases green, 19 red, 0 errors).

### Where it ran

| Target | Result |
|---|---|
| Local stack, migration-only database (Rail 3 CI run 44423732591) | Baseline above |
| Local stack, seeded database (same run, diagnostic step since removed) | Identical |
| Staging | See the staging entry below |

### Findings beyond the expected baseline

1. **T16 was expected to pass and does not.** The beacon insert policy checks only that the
   caller is affiliated with the row's `tenant_id`, not that the ride belongs to that club. No
   read crosses a club boundary. Recorded on W311, which tightens that insert.
2. **`ride_participants_pa_view` is a second path to a rider's phone and position** for an
   ordinary rider. D50 has to close it along with the table policy.
3. **A club admin who is not on the ride can cancel a rider's beacon.** Pillar II names the
   own rider, the Captain and the SAG only.

### Not covered

- The fourth participation value (tracks only while the app is open), which §4.1 gives to
  Captain and SAG only. It has no server field to test yet.
- T14 "cleared from every map": the server side is tested (row closed, flag cleared). What a
  device draws is app behaviour and is not asserted here.
- T13 runs the deletion routine as the service role, not through the `delete-account` function.
- T15 is a probe until W310 reports.
