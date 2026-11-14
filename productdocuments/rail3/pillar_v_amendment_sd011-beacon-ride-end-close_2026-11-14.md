# Pillar V: The Hands Amendment
Project: Vechelon Rail 3 — Mobile Tactical | Date: 2026-11-14 | Status: APPROVED (Senior PM) — awaiting Brain ratification

## The Pivot
Ledger SD-011 (2026-05-12) says: "When a rider cancels their own Support Beacon, beacon_cancelled_by is written with the rider's own UUID — not null. **Null is reserved for system error only.**"

D81 closes a Beacon automatically when its ride ends. Sometimes no person caused that close (the D100 retention job auto-closes rides left active for 24 hours; a Beacon written after its ride already ended). Recording NULL for those would break the letter of SD-011.

Amended text:

> **SD-011 (amended 2026-11-14, D81):** `beacon_cancelled_by` holds the acting user whenever a person caused the close. A Beacon closed because its ride ended carries `beacon_cancel_reason = 'ride_ended'`, with the actor being whoever ended the ride, or blank if the system ended it. A blank actor with a blank reason remains reserved for system error.

| beacon_cancelled_by | beacon_cancel_reason | Meaning |
|---|---|---|
| a person | NULL | Cancelled by that person in the app (unchanged) |
| a person | `ride_ended` | Closed when that person ended the ride |
| NULL | `ride_ended` | Closed by the system at ride end (auto-close, or a Beacon raised after the ride ended) |
| NULL | NULL | System error (SD-011's original guarantee) |

## The Reason
SD-011 exists so an audit row is never ambiguous: a NULL actor must not be mistakable for a failed write. The new reason column preserves that guarantee and also records why a Beacon closed. The alternative, a dedicated "System" account as the actor, was rejected (Sr PM, 2026-11-14). It would put a fake identity in `accounts`, the real-user table, where every listing, count, deletion path (W299) and RLS check would have to account for it. It would also misattribute closes that a real person caused by ending the ride.

## Impact on Existing Pillars
| Pillar | Section | Impact |
|---|---|---|
| IV Ledger | §1 SD-011 | Decision text amended as above (Brain to enshrine) |
| II Specs | Support Beacon / ride end | Beacons close when the ride ends; implicit today, so no spec text conflicts. Brain to confirm whether a sentence is added |
| III Quality Gate | Beacon scenarios | New scenario: "a ride ends with an open Beacon → the Beacon is closed with reason ride_ended and cleared from every map" |

Known side effect, deferred: W299 account deletion sets `beacon_cancelled_by` to NULL on a deleted user's past cancels, so those rows read as "system error". This predates D81 and is out of scope here; the Brain may want a reason value for it (e.g. `actor_deleted`).

## Tech Lead Assessment
Implemented in D81 as migration `20261114000000_d81_close_beacons_on_ride_end.sql` (rail3-integration):
- an additive column with a CHECK constraint
- an AFTER UPDATE OF status trigger on `rides` (active → not active), with the actor resolved through `accounts` so it can never block ending a ride
- a BEFORE INSERT guard for late Beacons
- a backfill of the 9 orphans on staging

No RLS change, no trigger loop. Simulated on staging in rolled-back transactions (system path, Captain path, late-Beacon path). stride:task-reviewer r1: no critical findings; the minor findings were fixed; the important finding was this amendment.

## QA Engineer Assessment
Existing user-cancel path unchanged (`buildCancelPatch` still throws without an actor). Add a Pillar III scenario for ride-end closure. Manual check: end a ride with an open Beacon; the Captain map and web Race Control clear it, and the row shows reason `ride_ended`.

## Senior PM Decision
Status: APPROVED | Date: 2026-11-14
Notes: Neil chose the reason-column option over a System account ("accepted for d81"). Brain to enshrine the amended SD-011 text in the Ledger at the next Strategic Re-engagement.
