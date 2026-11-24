# Rail 3 Sprint 2 (G37): Decision Brief, the five readings (brief §8)

**Prepared:** 2026-11-23 · **Ticket:** W316 · **Trunk:** `rail3-integration` @ `648ab3b` (after W193 and W315).
Read-only work: nothing was changed to produce these answers. Where today's behaviour differs
from a Pillar it is flagged, not fixed.

| # | Reading | Answer |
|-|-|-|
| 1 | A Sleeping rider still receives Captain and SAG positions when the app is open | **Yes.** Receiving does not depend on the rider's own tracking state |
| 2 | What the map draws for a beaconing rider who goes Sleeping | **A red pulsing beacon marker at the last position sent. The Sleeping style is not drawn.** Three of the four Sleeping conditions in Pillar II are not built (flagged) |
| 3 | What travels on the public web channel | **Nothing.** The code was unused and W310 deleted it |
| 4 | Whether `beacon_active` is reset at ride end or at purge | **At ride end**, by a database trigger. The purge does not touch it |
| 5 | No production account holds two memberships | **FALSE. Three production accounts hold two or more memberships.** This contradicts the Brain's inference (Ledger §16.7 item 4). Flagged, not fixed |

## 1. A Sleeping rider still receives Captain and SAG positions when the app is open

**Yes, on the trunk and on staging.**

- Captain and SAG positions travel on the `rail3:lead:<ride>` topic. The server lets a device
  receive on it when the caller is on the ride (first-open mark, not departed, affiliated):
  `supabase/migrations/20261123000000_w193_role_scoped_channels.sql:97`. The rule does not read
  the rider's tracking state, background permission or last ping.
- The app joins `lead` for every role as soon as the ride is open:
  `mobile/src/screens/RideMapScreen.tsx:124`. Nothing in that path looks at `backgroundReady`
  or at the rider's own state.
- "Sleeping" is what OTHER devices are told about a rider: a rider without background tracking
  sends one sleeping ping as the app goes to the background
  (`mobile/src/hooks/useFleetPositions.ts:753`). It does not change what that rider receives.
- Limit, already known: while the app is in the background the phone's JavaScript is suspended
  and receives nothing. With the app open again the rider receives leaders' positions at once,
  and their own next ping clears Sleeping for everyone else.
- Proof on the server: rule T3 (a rider on the ride receives the Captain's and the SAG's
  position) passes in CI and on staging. No test sets the Sleeping state first, because the
  server rule has no such input.

## 2. What the map draws today for a beaconing rider who goes Sleeping

**The beacon wins on the marker. The Sleeping look never shows while the beacon is active.**

- The sleeping ping is an ordinary position message carrying `state: 'sleeping'`
  (`mobile/src/lib/backgroundLocation.ts`, `sendSleepingPing`). With the rider's beacon active
  it is sent to the leaders (`crew`) and to everyone on the ride (`sos`):
  `mobile/src/lib/channelLayout.ts` (`sendKinds`).
- Every viewer who may see the beacon draws the beacon marker: red fill, white border,
  pulsing ring, full opacity. The beacon style replaces the violet Sleeping style
  (`mobile/src/components/RiderMarker.tsx:138`, `:159`, `:170`). So Pillar II condition 4,
  "a beacon outranks it", holds for the marker.
- The marker stays at the last position sent. Sleeping is sticky on the receiver: it never
  decays to Dark (`mobile/src/state/riderState.ts:125`).
- Bottom sheet, Captain or SAG: the state chip reads `SLEEPING`, with phone, Dial, Navigate
  and Cancel Beacon. **No age of the position is shown.**
- Bottom sheet, another rider (new in W315): `Needs help`, and a position line that does give
  the age (`Last seen {n} min ago`).

**Flagged against Pillar II Feature 4 (the four Sleeping conditions), not fixed:**

| Condition | Today |
|-|-|
| (1) The state is stored on the ride record so every viewer agrees | **Not built.** Sleeping exists only in the one broadcast. A device that opens or reconnects to the ride afterwards never learns it: it draws that rider from the stored last position as Stopped, then Dark (`mobile/src/lib/fleetCompose.ts:129`). No column or table holds Sleeping |
| (2) The bottom sheet shows the age of the position | **Partly.** The reduced sheet a rider gets shows it. The Captain's and SAG's full sheet does not |
| (3) Race Control shows it | **Not built.** There is no Race Control on the trunk (W310's note) |
| (4) A beacon outranks it, shown as a beacon with the age of the position | **Marker: yes. Age: only on the reduced sheet**, and for a Captain or SAG the "stale under beacon" overlay appears only when the position came from the stored last-known, not from a sleeping ping |

The Sprint 2 brief lists the Sleeping conditions among work left for a later sprint (brief
line 76), so these are known gaps, recorded here so the Decision Brief carries them.

## 3. What travels on the public web channel

**Nothing. No code used it, and W310 removed it.** Full answer, with the two things the Brain
and the Senior PM should know (public channels are still relayed by the Realtime service
unless `private_only` is set; web Race Control is not on the trunk):
`docs/rail3/sprint2/brief_section8_answers.md`. One update since that was written:
`private_only` is now set on staging. Production was not checked for this brief.

## 4. Whether `beacon_active` is reset at ride end or at purge

**At ride end. The purge never touches it.**

- When a ride's status becomes ended, the trigger `trg_rail3_close_beacons_on_ride_end` closes
  every open beacon row for the ride with reason `ride_ended` and sets `beacon_active = false`
  on every participant row of the ride, in the same transaction:
  `supabase/migrations/20261114000000_d81_close_beacons_on_ride_end.sql:66-88`. A second
  trigger closes a beacon inserted after the ride ended (`:122`).
- The retention purge (`supabase/migrations/20261109010000_d100_location_retention_purge.sql`)
  clears last position, last ping and phone four hours after ride end, and beacon coordinates
  after 30 days. It has no statement that reads or writes `beacon_active`.
- The flag is also cleared on a cancel, by the app, beside the cancel record.
- Staging, read-only, 2026-11-23 (`~/vechelon-backups/w316/readings-staging.json`):

| Query | Result |
|-|-|
| Trigger `trg_rail3_close_beacons_on_ride_end` present and enabled | Yes |
| Participant rows with `beacon_active` true on an ended ride | 0 |
| Participant rows with `beacon_active` true anywhere | 0 |
| Beacon rows still open on an ended ride | 0 |
| Beacon rows closed with reason `ride_ended` | 10 |

- Proof: rule T14 (a ride ending with an open beacon closes it and clears the flag) passes in
  CI and on staging.
- Production was not read for this item.

## 5. No production account holds two memberships

**False. The count is 3.**

- Query, run against PRODUCTION (`drktcxggaizkbvqccfhp`) on 2026-11-23 by the Senior PM from
  his own shell, read-only, one statement:

      select count(*) from (
        select account_id from account_tenants group by account_id having count(*) > 1
      ) t;

  Result: `[{"count":3}]`. A count only; no row and no personal data was read.
- The same count on staging is 0 (`~/vechelon-backups/w316/readings-staging.json`).

**FLAGGED against the Ledger, not fixed.** Ledger §16.7 says production launches on "one
rider, one club" and records (item 4) that the Brain inferred from the web guard, not from
data, that no production account holds two memberships; §14 item 32 asked the Hands to
confirm. The data does not confirm it: three accounts already hold two or more memberships.

What this brief does NOT establish, because the ticket allows a count only:
- who the three accounts are, or which clubs;
- the status of each membership (the count includes every row, whatever its status, so a
  suspended, pending or archived second membership would count);
- how they came to exist despite the web guard (before the guard, by an admin, by an import,
  or by a test).

Why it matters for the production move: the mobile app resolves ONE active club per account
at runtime (W303), and the Rail 3 rules assume a rider acts in one club. An account with two
live memberships is the multi-membership case the Ledger scheduled for directly after the
production move. For the Brain and the Senior PM to decide before W317's production step:
whether these three are test or founder accounts to be tidied, or real riders for whom "one
rider, one club" is already untrue.
