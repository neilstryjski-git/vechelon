# Pillar V: The Hands Amendment (retroactive)
Project: Vechelon Rail 3 — Mobile Tactical | Date: 2026-11-15 | Status: APPROVED (Senior PM) — awaiting Brain ratification of the per-ride phone rule

**Retroactive.** This amendment should have been raised on 2026-11-09, before D100 shipped. It was not. It is owed under Ledger v1.2.0 §14 item 24 and the process finding F-17 (§13.4). It records what D100 changed against the Bedrock as it stood then (v1.1.x), and how each departure was ruled at the Brain session of 2026-11-14 to 2026-11-15. It proposes no new behaviour. One item, the per-ride phone copy, is still unwritten in any Pillar (Ledger §16.12 U-7) and is the only open request to the Brain.

## The Pivot
D100 is the migration `20261109010000_d100_location_retention_purge.sql`. It created the function `rail3_retention_purge()` and scheduled it in the database every 30 minutes. It is applied to production and to staging. Four of its steps departed from the committed Bedrock.

| # | D100 step | What was built | What the Bedrock said at v1.1.x | Ruling, 2026-11-15 |
|---|---|---|---|---|
| 1 | Step 0, ride close | Any ride still active 24 hours after it started is ended by the job (`auto_closed = true`) | Pillar II Feature 3, Ledger §8.2 B2 and §8.3 slate 1: no wall-clock close | **Bedrock stands** (§16.2 Contradiction 1). The sweep is replaced by the inactivity close of Feature 3. Until that ships the sweep stays live as a recorded nonconformance (§14 item 28) |
| 2 | Step 2, Support Beacon record | Beacon coordinates cleared 30 days after the beacon was raised; the row kept permanently as an audit record | Pillar II §2 and R3-36: beacon data deleted 4 hours after ride end | **Bedrock amended** (§16.2 Contradiction 2): the whole beacon row is deleted 30 days after it was raised. The built job clears coordinates and keeps the row, so it does not yet match (§14 item 27) |
| 3 | Step 1b, leader breadcrumb | `rail3_breadcrumb` rows deleted 4 hours after their last update | Pillar II §2 and Feature 11, G33 ruling C1: the breadcrumb is a purge-exempt club artifact | **Bedrock amended** (§16.2 Contradiction 3): the raw breadcrumb is deleted, 4 hours after ride end (§16.12 U-1). The built clock runs from last update, so it does not yet match (§14 item 35) |
| 4 | Step 1, per-ride phone copy | `ride_participants.phone` cleared 4 hours after ride end, with the last position. The profile phone on the account is untouched | In no Pillar. R3-36 says guest roster records are retained | **Not ruled as Pillar text** (§16.12 U-7). Senior PM decision of 2026-11-09 on the D100 ticket. Requested below |

Unchanged by this amendment: step 1's clearing of last position and last ping 4 hours after ride end (Scenario 28, already committed), and step 3's telemetry retention (Ledger §8.5).

**Requested of the Brain for item 4:** write the per-ride phone rule into Pillar II §2 retention, and reconcile it with R3-36. Proposed text:

> The phone number copied onto a ride participant row is cleared 4 hours after the ride ends, with that participant's last position. The phone on the rider's profile is not affected. A guest's roster record is retained without its phone number.

## The Reason
D100 was a privacy defect fix. The purge described in the privacy policy had never run: the edge function that held the logic was never scheduled, and 47 ended-ride positions were stored on the staging database behind the Play open test. The fix moved the purge into the database so no service key sits in the scheduler.

Each departure had a reason at the time, and none was taken to the Bedrock:

- **24-hour sweep.** Added at review. A ride nobody ends never reaches the 4-hour purge, so its positions would be kept indefinitely. The inactivity close that Feature 3 calls for was not built.
- **Beacon retention.** A Senior PM decision of 2026-11-09: keep a beacon's location 30 days for safety follow-up.
- **Breadcrumb deletion.** The rule already ran on staging as a hand-made scheduled job. D100 put it under version control so the privacy-policy claim rested on reviewed code.
- **Phone clearing.** A Senior PM decision of 2026-11-09: the per-ride copy of a phone number should not outlive the ride.

The failure was one of process. The Hands treated Senior PM decisions on a ticket as sufficient and shipped. A Senior PM decision that departs from the Specs still needs a Pillar V amendment before it ships.

## Impact on Existing Pillars
| Pillar | Section | Impact |
|---|---|---|
| II Specs | §3 Feature 3 | None. The text stands; the code is the nonconformance |
| II Specs | §2 retention, beacon rows | Already amended at v1.2.0 |
| II Specs | §2 and Feature 11, breadcrumb | Already amended at v1.2.0 |
| II Specs | §2 retention, per-ride phone | **Open.** Proposed text above |
| III Quality Gate | R3-36 | **Open.** "Guest roster records are retained" needs the phone exception, if the text above is accepted |
| IV Ledger | §14 item 24 | Discharged by this file once approved |
| IV Ledger | §16.12 U-7 | Closed once the phone rule is written |

## Tech Lead Assessment
The job is live on both databases and matches the migration. Three pieces of rework are already recorded and are **not** in Sprint 2 (brief §5):

- Replace step 0 with the inactivity close (§14 item 28). A Gate B requirement.
- Change step 2 from clearing coordinates to deleting the row at 30 days (§14 item 27).
- Move step 1b's clock from last update to ride end (§14 item 35). Until then a Captain away from the ride for more than 4 hours loses the trace mid-ride.

The phone clearing needs no rework. Roster reads of an ended ride after 4 hours return no per-ride phone, which is the intent.

## QA Engineer Assessment
No test changes follow from this amendment itself. Tests follow the three rework items when they are built: an inactivity-close scenario replacing the 24-hour case, a beacon row deleted at 30 days, and a breadcrumb that survives a long Captain absence and is deleted 4 hours after ride end. If the phone rule is written, R3-36 gains a check that a guest row is retained with its phone cleared.

## Senior PM Decision
Status: APPROVED | Date: 2026-11-15
Notes: Approved by the Senior PM as a retroactive record. Discharges Ledger §14 item 24. The Brain is asked to write the per-ride phone rule into Pillar II §2 and reconcile R3-36 (Ledger §16.12 U-7).
