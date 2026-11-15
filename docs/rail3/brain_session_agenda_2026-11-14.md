# Vechelon — Brain Session Agenda (seed)

Compiled: 2026-11-14 by The Hands | Status: **DRAFT, a Hands working artifact and not Bedrock**

**The Hands have edited no Pillar.** This document collects what is waiting on The Brain and the Senior PM, with the current facts for each item and where the source material lives. Nothing here is ticketed; every item is a decision or a ratification.

Where a fact was checked today it says so. Where it comes from an earlier record it gives the date.

---

## 0. Where things stand (2026-11-14)

| Area | State |
|---|---|
| Play open test | Submitted 2026-11-14, in Google review. Release "0.1.0 (4) — open test 1", target API 36, full rollout to 177 countries plus rest of world. Managed publishing is off, so it goes live automatically on approval. |
| What the open test runs on | **Staging** (`rail3-staging`), including the EAS "production" profile. Clubs on staging: Racer Sportif, Bikes and Beers, and the B&B Reviewer club. |
| Production web | `master`, on Cloudflare. Has no Rail 3 schema. Lakeside Wheelers exists on production only. |
| Mobile code | `rail3-integration`. All Sprint 1 (G34) code is merged there and is in the open-test build. |
| Sprint 1 (G34) | **Built, not completed.** Verify half not started; ride tests on hold since 2026-11-07. See item 2. |
| Rail 3 Bedrock | Charter v1.1.0, Specs v1.1.1, Quality Gate v1.1.1, Ledger v1.1.3 in `productdocuments/rail3/`. Ledger unchanged since the sprint opened, apart from the PROPOSED SD-011 row. |
| Supabase plan | Production and staging share one **free** org: no backups, about one day of logs, auto-pause risk. |
| Branches | Cleaned up today. `master` and `rail3-integration` are the two trunks; the June hold-stack is retired (see item 1). |

---

## 1. The production move (Rail 3 → production backend)

**This is the main item.** Everything downstream waits on it: the W259 promotion, Lakeside Wheelers, and the public Play listing.

**Standing direction (Senior PM):**
- The public Play listing arrives only as the outcome of the proper production move. No staging-backed promotion and no launch-only lane (2026-11-07).
- The Rail 3 integration stands on its own Bedrock, Brain-led (2026-07-07).
- Promotion is a scoped effort, not a `git merge` (2026-07-04): de-stage the config, bring the Rail 3 migrations into the production pipeline reviewed, and run a Three-Amigos review. A rushed merge caused the 2026-06-29 portal outage.
- Launching to production without the held ride tests is acceptable, to be re-assessed as progress is made (2026-11-07).
- After the move, staging returns to a free org and production becomes the only paid project (2026-11-10).

**For the Brain to settle:**
1. **Sequence and gate.** What must be true before production promotion starts? In particular: does it wait for the Sprint 1 field run, or go ahead with those tickets open as built-unvalidated?
2. **Rulings the next sprint depends on.** The Brain is asked to suggest the next sprint goal at the end of this session (item 7); the order of the work below is what that suggestion draws on. Deferred out of Sprint 1 and still unscheduled: the D2 scheduler set (auto-start, inactivity auto-close, 24-hour ride list, joinable state), the R3-36 purge-scope extension, the server staleness detector with FCM wake, guest self-registration (Ledger §14 item 18), QR credential routing (item 19), and the PWA-to-native deep link.
3. **Server-side enforcement at the move.** Several visibility and role rules are enforced in the app UI only. On staging that was accepted; on production it is a decision. **These have since been verified against the code and both live databases; see `brain_session_supplement_2026-11-14.md` §1, which corrects two of the lines below (D93 is already blocked by a trigger; `account_member_names_select` is already removed from staging).** As listed from Stride on 2026-11-14:
   - D50: participant phone numbers readable by any affiliated member (the phone gate is client-side).
   - D93: `participant_update_policy` has no `WITH CHECK`; a rider can change their own role.
   - D94: Broadcast authorization is tenant-scoped, not ride-scoped.
   - Beacon rows and the ride broadcast reach every affiliated club member; the Captain/SAG-only rule is applied in the app (see item 3).
   - Any affiliated member can rewrite a Beacon's cancelled-at / cancelled-by fields (found during D81).
   - `account_member_names_select` lets a co-member read full account rows on staging; the fix is coupled to the roster RPC switch planned for W259.
4. **Club resolution at production.** The open-test build resolves the club by a fixed rule: Racer Sportif member → Racer Sportif, everyone else → Bikes and Beers as pending. Production needs membership-derived resolution (W221) before any third club, including Lakeside Wheelers, can use the app.

**Inputs already recorded on W259:** the hold-stack branches were deleted today after verifying their content is in `rail3-integration`. One exception: PR #55 (`W171`, hard purge for `beacon_alerts` and `rider_states`) holds a commit that never reached `rail3-integration`; decide whether it is still needed given W299 account deletion and the D100 retention purge.

**Senior PM decision that rides along (not a Brain item):** Supabase Pro. Recommended before any production-move migration; roughly $25/month for the org, more with a second project. Realtime volume is tied to this: a long 20-rider ride is about 4–6 million messages against a 2 million free-plan hard limit.

---

## 2. Sprint 1 (G34) close

**Source:** `docs/rail3/sprint1/brain_writeback_packet.md` (compiled 2026-10-13) and its companion `docs/rail3/sprint1/sprint1_handoff.md`. The packet's decision summary is the checklist; it is not repeated in full here.

| Packet item | Decision | Blocks |
|---|---|---|
| A.1–A.4 | Ratify the Pillar IV §14 write-backs for items 10, 11, 15 (+23) and 16 | G34 sprint close |
| B | F-7: how R3-45's third clause is met | W284 acceptance line |
| C.1 | Self-health fallback: config-only vs a shipped, Ledger-confirmed fallback | Matters at W259 |
| C.2 | Ratify or override "permission-denied = inert" | Nothing |
| D | R3-66 parenthetical vs §4.1 / R3-74 | Clean R3-66 grade |
| E.1 | Co-Captain phone: roster and map disagree | Clean R3-66 grade |
| E.2 | R3-42 recovery window value | R3-42 pass criterion |
| E.4 | Confirm the two Saver values after measurement | W279, W285, W280 |
| E.6 | Accept no-route behaviour pending Feature 6 | Nothing |
| E.8 | Captain-departure banner: third §5.1 exception or non-text cue | Voice & Tone copy pass |
| E.9 | Ratify "Sleeping" as a visible status label | Voice & Tone copy pass |

**What has changed since the packet was written:**
- The packet says the code is "installed on the field build (EAS ff53208f)". It is now also in the Play open-test build (versionCode 4), in Google review.
- Ride tests remain on hold, so nothing the packet calls "built" has been field-validated.
- E.4 cannot be decided in the session: the Battery Saver measurement run has not happened.

**The one timing choice (Senior PM):** ratify the A.1–A.4 write-backs now on built behaviour, with "built, unvalidated" written into the Ledger entries, or hold them until a field run is recorded. Holding them keeps Sprint 1 open for as long as ride tests are on hold.

---

## 3. Beacon visibility — re-open F-07

**Raised by the Senior PM, 2026-11-10:** "I think a beacon shouldn't be limited to captain and support."

**Current ruling:** F-07, resolved 2026-09-13: Captain and SAG only; other riders never see another rider's beacon. Recorded in Pillar III v1.1.1, Ledger §8.5, and Pillar II v1.1.1 §4.1.

**What the code does (verified 2026-11-10):**
- You see your own beacon. Captain and SAG see all beacons.
- A Captain's or SAG's beacon is visible to everyone (W206, ratified 2026-06-15).
- A rider's beacon is hidden from other riders, and so is that rider's map marker.

**For the Brain to settle:**
1. Should riders see other riders' beacons? If yes, do they also see that rider's position? That changes the §4.1 rule that riders see only the Captain and SAG.
2. Does F-07 as worded conflict with W206? "Other riders never see another rider's beacon" versus a Captain's beacon shown to everyone.
3. Is server-side enforcement required at the production move? Today the rule is applied in the app, not in the database (item 1, point 3).

**Cascade if widened:** Pillar II §4.1, Pillar III scenario 22, the Ledger entry, the in-app disclosure ("Only your club's ride captain and support crew can see your position"), the Play listing, the Data Safety form, and the background-location declaration. The last three are already submitted to Google.

---

## 4. SD-011 amendment — enshrine

**Approved by the Senior PM, 2026-11-14.** A Beacon closed because its ride ended records `beacon_cancel_reason = 'ride_ended'`. The actor is whoever ended the ride, or blank if the system ended it. A blank actor with a blank reason stays reserved for system error.

**State:** built and applied to staging (D81; PRs #152 and #155). The PROPOSED Ledger row is on `rail3-integration`. The Pillar V amendment file is at `productdocuments/rail3/pillar_v_amendment_sd011-beacon-ride-end-close_2026-11-14.md` (merged today, PR #157).

**For the Brain to do:**
1. Rewrite Ledger §1 SD-011 to match.
2. Add a Pillar III scenario: ride end closes an open Beacon.
3. Decide the deleted-actor case. Account deletion (W299) nulls `beacon_cancelled_by`, which then reads as "system error". One option is an `actor_deleted` reason.

---

## 5. EU / GDPR readiness, and Lakeside Wheelers

**Raised by the Senior PM, 2026-11-14. Not urgent for Lakeside; the Senior PM is not engaging them about the app yet.**

**Facts (verified 2026-11-14):**
- The open test is being distributed in Ireland and the EU (177 countries plus rest of world) and goes live automatically on Google's approval.
- `privacy.html` cites only PIPEDA.
- Both Supabase projects are in us-east-1.
- A Lakeside rider cannot use the open test: Lakeside is not on staging, and club resolution is fixed (item 1, point 4). The default path is that Lakeside works at the production move.

**For the Brain to settle:**
1. GDPR additions to the privacy policy: lawful basis (consent for background location? contract for the account?), EU rights including complaint to the Irish DPC, and an international-transfer note.
2. Whether Product Delivered Inc. needs an EU representative (GDPR Art. 27).
3. Whether to narrow the open-test countries in the meantime.

**Hands recommendation on point 3:** narrow the open test to Canada (plus the US if wanted) in Play Console now, without waiting for the session. It removes the exposure and can be widened once the policy is settled. This is a Senior PM call.

**Cascade:** `privacy.html`, the Data Safety form, and the Play requirements in the integration Bedrock.

---

## 6. Multi-membership

**Pending since 2026-04.** Parked at v3.0 in `docs/Roadmap/vechelon_internal_roadmap.md` and deferred in VoC/MT/IA Pillar I §2 ("riders belong to one club"). No amendment has been drafted.

**Evidence that it is more pressing than the roadmap says:** Tom-style guest scenarios, the cross-tenant ride visibility bug, the Senior PM already operating across Racer Sportif and Bikes and Beers, and the rejected "soft-pending" experiment. The open test adds one more: its fixed club-resolution rule exists because the app cannot yet express "this rider belongs to these clubs".

**For the Brain to settle:** whether to pull multi-membership forward, and whether it belongs inside the production move (it shares ground with item 1, point 4) or after it. A related ticket exists, W258 ("Enable multi-club membership for a single email"), but work is blocked until the amendment is drafted.

---

## 7. Next sprint goal — Brain to suggest

**Requested by the Senior PM, 2026-11-14.** Until now the Hands proposed the goal sentence at a sprint's opening and the Senior PM ratified it. For the next sprint the Senior PM wants the Brain to suggest the goal. Ratification stays with the Senior PM.

**What is asked of the Brain:** one goal sentence for the next sprint, in the form of the two already ratified:
- G34 (2026-09-30): "Build and verify the device-side Rail 3a behaviour ruled in the G33 arc against Pillar II v1.1.1 and Pillar III v1.1.1, on the staging build."
- G36 (2026-11-07): Play open-testing readiness — a public, club-gated listing, staging-backed.

**Constraints that still hold:**
- One goal per sprint, and one sprint at a time. No multi-sprint plan.
- The goal traces to committed Pillar text, or names the amendment it depends on.
- The Hands decompose it into tickets only after the Senior PM ratifies it.

**What the suggestion has to weigh (inputs, not a recommendation):**
- Sprint 1 is built and unverified; its verify half needs ride tests, which are on hold.
- The production move (item 1) is what the public Play listing and Lakeside Wheelers wait on.
- The server-side enforcement gaps (item 1, point 3) are prerequisites for production, whichever sprint carries them.
- G36 is submitted and waiting on Google; a rejection would pull work back into it.

---

## Suggested order

Item 7 comes last: the goal suggestion depends on the answers to everything before it.

1. Item 1, the production move. Its answers shape items 3, 5 and 6.
2. Item 2, Sprint 1 close. Mostly ratification; the packet is ready.
3. Item 3, Beacon visibility. Decide before production, because the server-side enforcement question in item 1 depends on it.
4. Item 4, SD-011. Short; already approved.
5. Item 5, EU/GDPR.
6. Item 6, multi-membership.
7. Item 7, the Brain's suggested goal for the next sprint.

## Source documents

| What | Where |
|---|---|
| Sprint 1 Brain write-back packet | `docs/rail3/sprint1/brain_writeback_packet.md` |
| Sprint 1 handoff (built vs validated, per ticket) | `docs/rail3/sprint1/sprint1_handoff.md` |
| Field run sheet (held) | `docs/rail3/sprint1/field_run_sheet.md` |
| Voice & Tone copy list | `docs/rail3/sprint1/voice_tone_copy_list.md` |
| Rail 3 Bedrock | `productdocuments/rail3/` |
| SD-011 amendment | `productdocuments/rail3/pillar_v_amendment_sd011-beacon-ride-end-close_2026-11-14.md` |
| Previous handback (G33) | `docs/rail3/g33_handback/` |
| Play submission documents | `docs/play/` |
| Promotion ticket | Stride W259 |
