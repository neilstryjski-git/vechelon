# Vechelon — Brain Session Supplement: verified facts

Compiled: 2026-11-15 by The Hands | Companion to `brain_session_agenda_2026-11-14.md` | Status: **DRAFT, a Hands working artifact and not Bedrock**

**The Hands have edited no Pillar and changed no database.** This answers the Brain's eight requests. The Brain has no repo or ticket access, so policy text, ticket bodies and rulings are quoted here in full.

**How each fact was checked**

| Label | Meaning |
|---|---|
| Repo | Read from `rail3-integration` at `6d81d12`, or `master`, on 2026-11-14 |
| Live | Read from the running databases through the Supabase Management API on 2026-11-14 (read-only queries): staging `rail3-staging`, production `Vechelon` |
| Ticket | Quoted from the Stride ticket as it stood on 2026-11-14 |
| Estimate | The Hands' judgement, not measured |

Nothing here was exercised on a phone. "Works" claims about the app are read from code, not observed.

---

## 0. Findings that change the agenda

Read these first. Each one corrects or sharpens something in the agenda document.

1. **D100 runs a wall-clock sweep, on staging and on production.** It ends any ride still active 24 hours after it started. Pillar II Feature 3 and Ledger B2 say the backstop is inactivity only, with no wall-clock sweep. This is a contradiction with committed Bedrock. Detail in §6.
2. **D100 also diverges from the Bedrock on retention, twice.** It keeps Beacon rows permanently and their coordinates for 30 days; Pillar II §2 and R3-36 say `beacon_alerts` is deleted at T+4h. It deletes the leader breadcrumb after 4 hours; Pillar II §2 calls `rail3_breadcrumb` a purge-exempt club artifact. Both came from Senior PM decisions on 2026-11-09 and are published in the privacy policy, but neither is recorded in a Pillar or the Ledger. Detail in §6.
3. **W206 was never written into the Bedrock.** The ruling exists only in a commit message, a code comment and a Stride ticket. The F-07 resolution of 2026-09-13 postdates it and its text contradicts what the app does. Detail in §5.
4. **D93 is already blocked, on both databases.** A trigger added by the D96 security fix stops a rider from giving themselves a command role. The ticket is still open and the agenda listed it as a gap. Detail in §1.2.
5. **`account_member_names_select` is already gone from both databases.** The agenda said it was still on staging. The W259 ticket warns that the mobile roster must switch to an RPC *before* this happens; it has not switched. The staging roster appears to keep working only because of a staging-only trigger that no migration creates. Detail in §1.6.
6. **Staging clubs are on manual enrolment, not open.** All three staging clubs have `enrollment_mode = 'manual'` (Live). Strangers land as pending.
7. **W196 is effectively done.** The W304 migration replaced the `get_my_tenant_id()` equality with a membership check in every Rail 3 policy, which is what W196 asked for. The ticket is still open.
8. **Two staging objects exist in no migration.** A production built from the repo would not have them. Detail in §7.3.

---

## 1. Enforcement gaps

For reference, two helpers appear throughout (Live, identical on both databases):

```sql
-- is_captain_or_support(target_ride_id): SECURITY DEFINER
SELECT EXISTS (SELECT 1 FROM public.ride_participants
               WHERE ride_id = target_ride_id AND account_id = auth.uid()
                 AND role IN ('captain', 'support'));

-- get_my_tenant_id(): SECURITY DEFINER
SELECT tenant_id FROM public.account_tenants WHERE account_id = auth.uid() LIMIT 1;
```

```sql
-- rail3_is_affiliated(t_id): SECURITY DEFINER, staging only (W304 migration)
SELECT t_id IS NOT NULL AND EXISTS (
  SELECT 1 FROM public.account_tenants
  WHERE account_id = auth.uid() AND tenant_id = t_id AND status = 'affiliated');
```

### 1.1 D50 — participant phone numbers readable by any affiliated member

**Status: confirmed open, on production and staging.**

Policy as live on both databases (it was last rewritten by the D96 fix on `master`; `rail3-integration` does not carry that migration file, see §7):

```sql
CREATE POLICY participant_tactical_select ON public.ride_participants
  FOR SELECT                       -- no TO clause: applies to every role
  USING (
    public.is_captain_or_support(ride_id)
    OR account_id = auth.uid()
    OR public.get_tenant_status(
         (SELECT rides.tenant_id FROM public.rides WHERE rides.id = ride_participants.ride_id)
       ) = 'affiliated'::public.account_status
  );
```

The third branch returns every participant row of every ride in the club to any affiliated member. Row-level security cannot hide columns, so the row includes `phone`, `email`, `last_lat`, `last_long`, `last_ping` and `beacon_active`. The §4.1 rule that a rider sees only Captain and SAG contacts and positions is applied in the app, not the database.

**Where staging differs:** the policy is identical. Staging has more columns on the table (`rail3_joined_at`, `departed_at`) and a staging-only trigger that copies each account's name, email and phone onto the participant row (§1.6), so the phone column is populated more often on staging than on production.

**Fix shape (Estimate: medium, several days, mostly web regression):**
- Remove the third branch; replace it with a narrower one: a participant of the ride may read the rows of that ride's Captain and SAG.
- Serve the "who is coming" attendee list (names only, rule RP-16) through a function that returns names without contact or position fields.
- Repoint the readers. The D50 ticket counts 14 read sites in the web admin; the mobile roster, fleet seed and Beacon seed also read this table.
- The ticket records the Senior PM's roster rule (2026-07-03): riders see only Captain and SAG with phones; Captain and SAG see the whole roster with phones.

### 1.2 D93 — rider self-promotion to Captain

**Status: the escalation is blocked on production and staging. The ticket is stale.**

Policy as live:

```sql
-- production
CREATE POLICY participant_update_policy ON ride_participants FOR UPDATE
  USING (account_id = auth.uid() OR is_captain_or_support(ride_id));

-- staging (extra third branch)
  USING (account_id = auth.uid() OR is_captain_or_support(ride_id)
         OR is_tenant_admin((SELECT rides.tenant_id FROM rides WHERE rides.id = ride_participants.ride_id)));
```

Neither has a `WITH CHECK`, which is what D93 reported. But the D96 fix (applied to production 2026-11-06, and present on staging) added a trigger, `ride_participants_guard_role`, that runs on every insert and update by an app user:

- A command role (`captain` or `support`) may be assigned only by an admin of the ride's club, the ride's creator, or existing command crew on that ride.
- `ride_id` and `account_id` on an existing row may be changed only by a club admin.

So a rider updating their own row to `role = 'captain'` is rejected. Existing crew can still promote within the crew (a SAG can make themselves Captain); the Senior PM ratified that as-is during the security audit.

**Where staging differs:** the extra `is_tenant_admin` branch. It comes from an unmerged branch (`d70-participant-update-rls`, migration `20260704120000_d70_participant_update_admin_role.sql`, 2026-07-04) that was applied to staging by hand so a club admin can change a participant's role. It is in no trunk. Defect D70 ("Rider role change doesn't take effect") is still open.

**Remaining work (Estimate: small):** decide whether D70's admin branch goes to production; run one probe to confirm the self-promotion is rejected; close D93.

### 1.3 D94 — Broadcast is club-scoped, not ride-scoped

**Status: confirmed open on staging. Production has no Rail 3 broadcast policies at all.**

Policies as live on staging (W304 migration on `rail3-integration`):

```sql
CREATE POLICY rail3_broadcast_tenant_receive ON realtime.messages
  FOR SELECT TO authenticated
  USING (realtime.topic() LIKE 'rail3:ride:%'
         AND public.rail3_is_affiliated(public.rail3_topic_tenant_id(realtime.topic())));

CREATE POLICY rail3_broadcast_tenant_send ON realtime.messages
  FOR INSERT TO authenticated
  WITH CHECK (realtime.topic() LIKE 'rail3:ride:%'
              AND public.rail3_is_affiliated(public.rail3_topic_tenant_id(realtime.topic())));
```

Any affiliated member of the club can subscribe to, and send on, the channel of any ride in that club, whether or not they joined it. The channel carries every rider's live position and the Beacon events.

**What changed since the ticket was written:** the predicate used to be `= get_my_tenant_id()`; W304 made it membership-and-status aware, so pending members are now excluded. The ride-scoping gap is unchanged.

**There are two separate layers here, and they are different sizes:**

| Layer | What it closes | Shape | Estimate |
|---|---|---|---|
| Ride scoping (D94) | A club member who is not on the ride can no longer listen or send | Add a participation check to both policies. A helper already exists (`is_rail3_ride_participant`). Web Race Control operators are not participants, so admins need their own branch | Small: one migration plus tests |
| Role scoping (W193) | A rider on the ride can no longer receive other riders' positions over the wire | Two channels per ride: one for command crew, one for everyone. Changes how the app sends and receives | Medium to large: app and server |

Ride scoping alone does not make §4.1 true on the wire. A rider on the ride still receives every position and the app hides them. W193 is titled "two-channel role-scoped broadcast (DECIDED)" and is open and unscheduled.

### 1.4 Beacon rows and Beacon broadcast visibility

**Status: confirmed. The Captain/SAG-only rule is applied in the app only.**

Policies as live on staging:

```sql
CREATE POLICY beacon_alerts_tenant_select ON public.beacon_alerts
  FOR SELECT TO authenticated USING (public.rail3_is_affiliated(tenant_id));
CREATE POLICY beacon_alerts_tenant_insert ON public.beacon_alerts
  FOR INSERT TO authenticated WITH CHECK (public.rail3_is_affiliated(tenant_id));
CREATE POLICY beacon_alerts_tenant_update ON public.beacon_alerts
  FOR UPDATE TO authenticated USING (public.rail3_is_affiliated(tenant_id))
                              WITH CHECK (public.rail3_is_affiliated(tenant_id));
```

A Beacon is visible to a rider through three server paths, none of them role-gated:

| Path | What it exposes | Who can read it |
|---|---|---|
| `beacon_alerts` rows | Who raised it, when, where (lat/long), who cancelled | Any affiliated member of the club, for every ride |
| `ride_participants.beacon_active` flag | Current Beacon state per rider, with last-known position | Any affiliated member (the D50 branch) |
| Broadcast `beacon` event on the ride channel | `{riderId, active, beaconId, sentAt}`; no coordinates in the payload | Any affiliated member (the D94 policies) |

The app then filters with `canSeeBeacon` (§5).

**Where production differs:** production has no `beacon_alerts` table. It does have the `beacon_active` column on `ride_participants` (from the original schema), unused.

**Fix shape depends on the F-07 answer (agenda item 3):**

| If the Brain rules | Server work | Estimate |
|---|---|---|
| Captain and SAG only (current F-07), with the W206 Captain exception | Narrow the `beacon_alerts` read policy to own rows, command crew, and rows raised by command crew; move `beacon_active` out of general reach (rides with D50); carry rider Beacon events on a command-only channel (rides with W193) | Medium to large; the broadcast part needs W193 |
| Every rider on the ride sees every Beacon | Scope `beacon_alerts` and the broadcast to ride participants (rides with D94) | Small |

So widening Beacon visibility makes the server-side fix smaller, because the rule to enforce becomes "on the ride" rather than "by role".

### 1.5 Beacon cancel-field rewrite

**Status: confirmed open on staging.**

The update policy in §1.4 lets any affiliated member update any column of any Beacon row in the club. One column is protected: `beacon_cancel_reason` is server-only, by a guard trigger added in D81 (`trg_rail3_beacon_reason_guard`). Everything else is writable, so a member can:

- mark someone else's open Beacon as cancelled, naming any account as the canceller;
- reopen a closed Beacon by clearing `beacon_cancelled_at`;
- change `rider_id`, `triggered_at` or the coordinates.

The insert policy has the same shape: a member can insert a Beacon row naming another rider.

The app itself behaves: it always writes its own user id as the canceller, and only Captain and SAG are offered the control to cancel someone else's Beacon.

**Fix shape (Estimate: small, one migration plus tests, no app change):**
- Insert: `rider_id` must be the caller.
- Update: only the Beacon's own rider or the ride's command crew; only the two cancel fields may change, only from empty to set, and `beacon_cancelled_by` must be the caller.
- This matters to SD-011 (agenda item 4): the audit meaning of `beacon_cancelled_by` is only as trustworthy as this write path.

### 1.6 `account_member_names_select`

**Status: already removed on production and on staging. The agenda was wrong on this.**

Original policy (migration `20260420000002`), now dropped:

```sql
CREATE POLICY account_member_names_select ON accounts FOR SELECT USING (
  EXISTS (SELECT 1 FROM account_tenants viewer
          JOIN account_tenants target ON viewer.tenant_id = target.tenant_id
          WHERE viewer.account_id = auth.uid() AND viewer.status = 'affiliated'
            AND target.account_id = accounts.id));
```

It let any affiliated member read the whole account row (email, phone, emergency contacts) of every co-member. The D96 fix dropped it and added two functions in its place:

- `get_member_directory(tenant)`: id, name and avatar only, for affiliated members and admins.
- `get_ride_roster_contacts(ride)`: name and phone per participant, returned only to that ride's command crew and club admins.

Live policies on `accounts`, identical on both databases: own row; club admin; platform admin. Nothing else.

**The open problem this leaves.** The mobile roster on `rail3-integration` still reads names and phones the old way (Repo, `mobile/src/screens/RosterScreen.tsx:127`):

```ts
.from('ride_participants')
.select('id, account_id, display_name, phone, role, rail3_joined_at, departed_at, accounts(name, phone)')
```

With the policy gone, the `accounts(name, phone)` part returns nothing for anyone who is not a club admin. The roster still has `display_name` and `phone` from the participant row itself. On staging those are filled in by a trigger, `rail3_hydrate_participant_identity`, which copies the account's name, email and phone onto the participant row on every insert and update.

That trigger exists only on staging. No migration creates it (§7.3). So:

- On staging, the roster most likely still shows names and phones, through the copied columns. Not verified on a phone.
- On a production built from the repo, the copied columns would be empty and the roster would lose names.
- The copied phone lands in the column that D50's branch exposes to every affiliated member, and that D100 clears 4 hours after the ride ends.

**Fix shape (Estimate: small to medium):** switch the mobile roster to the contacts function, and add a rider-facing equivalent that returns only Captain and SAG contacts to participants (the existing function returns nothing to a plain rider). Then decide whether the hydration trigger is captured in a migration or retired.

### 1.7 Summary

| Gap | Production | Staging | Fix size (Estimate) | Depends on |
|---|---|---|---|---|
| D50 phone and position via the affiliated branch | Open | Open | Medium | — |
| D93 self-promotion | Blocked by trigger | Blocked by trigger | Small (close-out) | D70 decision |
| D94 broadcast not ride-scoped | No Rail 3 policies | Open | Small | — |
| Positions visible to riders on the wire | No Rail 3 | Open | Medium to large (W193) | — |
| Beacon rows, flag and events | No Rail 3 table | Open | Small or medium-to-large | F-07 ruling |
| Beacon cancel fields rewritable | No Rail 3 table | Open | Small | — |
| Member account rows | Closed | Closed | Small to medium (mobile roster) | Hydration trigger decision |

---

## 2. W259 as written

**Title:** Rail 3 promotion: merge validated field branch to master + retire hold-stack
**Status:** open, unclaimed, priority medium, complexity small, no dependencies, no parent goal. Last updated 2026-11-14.

**Why (ticket field):** "Collapse Rail 3 branch sprawl to one trunk once the field PoC is proven; the promotion is the gate for the prod Rail 3 launch."

**Description (verbatim):**

> **Decision (Neil, 2026-07-04): promote the validated field branch into master; retire the hold-stack.**
>
> Collapse the Rail 3 mobile branch sprawl to a single trunk. Promote `w204-production-profile` (off `fieldbuild`) — the app field-validated on-device 2026-06-30 — into `master`. The original clean stacked hold-PRs (#52 schema → #53 channel → #55 → #58 → #60 map; `W172` etc.) become reference/history and are DELETABLE. The `master` mobile stub and `W172` are retired.
>
> NOT a `git merge` — the field branch is not prod-clean. Prerequisites:
> 1. De-stage config: eas.json staging URLs + `racer-sportif`, `ca.vechelon` variant, diagnostic/ping toggles, disabled D58 QR, license/registry setup → parameterize/gate for prod.
> 2. Rail 3 migrations (beacon_alerts, rider_states, participant_tactical_select) enter the prod `db push --linked` pipeline on promotion — the thing deliberately held off. Include reviewed, WITH the server-side D50 fix (role-scoped phone; today the app only gates phone client-side).
> 3. Three-Amigos review (large prod change; rushed merges caused the 2026-06-29 portal outage).
> 4. After merge: delete W172 + hold-stack branches; verify one-trunk state.
>
> **Timing: AFTER the field ride (not urgent, not tonight).** Blocks nothing operational; unblocks branch simplicity + the prod Rail 3 launch (ties to G29 product-prep).
>
> **Branch cleanup 2026-11-14 (inputs for this ticket):**
> - Step 4 is largely done early: the hold-stack branches (W169, W170, W172-W175, W180, W182, W189, W191, D51-D55) were deleted and their PRs closed, after verifying their content is already in rail3-integration.
> - EXCEPTION - W171 (PR #55, 'Extend Hard Purge to Rail 3 tables: beacon_alerts, rider_states') has one commit that never reached rail3-integration. Branch and PR kept. Decide at promotion whether the Rail 3 hard-purge extension is still needed (W299 account deletion and the D100 retention purge may cover it) and carry it in or close it.
> - wip/W196 on origin holds an uncommitted broadcast-membership-fix migration (20260614000000) that was sitting in a worktree; check it against the W196 ticket before promotion.

**Pitfalls recorded on the ticket (verbatim):**

> 1. D96 (prod 2026-11-06) dropped accounts.account_member_names_select: Rail 3 RosterScreen (mobile/src/screens/RosterScreen.tsx) embeds accounts(name, phone) through it and MUST switch to the get_ride_roster_contacts(p_ride_id) RPC before master migrations reach staging — otherwise the roster loses names/phones.
> 2. D96 RESTRICTIVE policy rides_tenant_scope_update is AND-ed with rail3-integration rides_rail3_captain_end: a captain who is neither affiliated with nor an admin of the ride tenant cannot end an active Rail 3 ride. Decide/cover this before promotion; do not push master migrations to staging until both D96 items are handled.

**Where the ticket is out of date (Hands' reading):**

| Ticket says | As found |
|---|---|
| Promote `w204-production-profile` off `fieldbuild` | Both are fully contained in `rail3-integration`, which has since taken all of Sprint 1 and the Play work. `rail3-integration` is now the branch to promote |
| "Do not push master migrations to staging until both D96 items are handled" | The D96 migrations are already on staging (Live). Pitfall 1 was not handled first; see §1.6 |
| "Timing: AFTER the field ride" | Ride tests are on hold; the Senior PM has said launching without them is acceptable, to be re-assessed |
| Rail 3 migrations listed as three objects | Twelve migrations are held; see §7 |
| Complexity: small | The ticket's own text calls it a scoped effort with a Three-Amigos review |

Also on the ticket's path: the D50 fix is named as a promotion prerequisite here, and D50's own ticket says it is "LOCKED as a hard dependency of the W197 promotion gate". W197 ("Rail 3 — PoC→Prod promotion gate") is a second, older promotion ticket, still open and marked blocked. The two overlap.

---

## 3. W221, W258 and the fixed club-resolution rule

### 3.1 W221 — [Production] Rekey tenant resolution: build-slug → rider's club membership

**Status:** open, unclaimed, priority medium, complexity medium, parent goal G29 (Product Prep). Full body in Appendix A.

**What it asks for:** resolve the active club from the signed-in rider's memberships instead of a value baked into the build; Vechelon default if no club; branding follows the resolved club.

**Its recorded findings (2026-06-25), three forks to decide:**
1. **Pre-sign-in branding.** Membership is only known after sign-in, so a pure membership rule shows default branding on the sign-in screen for every club.
2. **Missing membership row.** At the time, mobile sign-in never created a membership row, so every mobile-onboarded rider would resolve to the default.
3. **Multi-membership.** There is no "primary club" flag; a rider in two clubs is ambiguous.

**What has changed since (Repo):** W303 and W304 already built a runtime resolution. Fork 2 is closed: the app now creates the membership itself. Forks 1 and 3 are answered by a fixed preference order rather than a design.

### 3.2 W258 — [MVP] Enable multi-club membership for a single email

**Status:** open, unclaimed, priority medium, complexity medium, no parent. Full body in Appendix A.

**What it asks for:** web only. Let a club admin add an email that already belongs to another club, and make the database resolve the *current* club per request from the subdomain the user is on, validated against their memberships, instead of `LIMIT 1`.

**Trade-off accepted by the Senior PM (2026-07-04):** the subdomain is the club selector. No club picker, no single session across clubs.

**Explicitly out of scope on the ticket:** mobile and Rail 3. The ticket's pitfall reads "Do NOT touch mobile/Rail 3 (tenant is baked per build via EXPO_PUBLIC_TENANT_SLUG) — web admin only". That premise is now out of date: the mobile app resolves at runtime (§3.3).

**Its why:** "Multi-membership is the final pending Brain artifact." The ticket was written before the amendment it depends on; work is blocked until the amendment is drafted.

### 3.3 The fixed club-resolution rule, in code (Repo)

The rule lives in one pure function, `mobile/src/lib/clubResolution.ts` (`chooseActiveClub`). After sign-in:

1. An approved (`affiliated`) membership beats a pending one, in any club.
2. Within that tier: the **primary** club wins; then the **fallback** club; then any club where the rider is an admin; then the first other membership.
3. If the rider has no usable membership and was never in the fallback club, the app **joins them to the fallback club**.
4. Suspended, archived and deleted memberships do not count, and a rider removed from the fallback club is never re-joined.

Primary and fallback are build configuration, not logic. In every build profile (`mobile/eas.json`): primary `racer-sportif`, fallback `bikes-and-beers`.

The code comment records a production hazard: "on prod Bikes and Beers is a real club, so a prod build must point FALLBACK at a demo club, not at Bikes and Beers."

**What the rule touches:**

| Piece | File | What it does with the resolved club |
|---|---|---|
| Resolution and join | `mobile/src/club/ClubContext.tsx` | Reads the rider's memberships, applies the rule, and joins the fallback club through the same `ensure_account_exists` function the web rider flow uses. Re-checks identity at every network step so a stale resolution can never join one rider to another's club |
| Branding | `mobile/src/theme/ThemeProvider.tsx` | Logo and colours follow the resolved club after sign-in. Before sign-in there is no club |
| Home screen | `mobile/src/screens/HomeScreen.tsx` | Shows the club's rides to approved members, "awaiting approval" to pending members, and a no-club state otherwise |
| Ride creation | `mobile/src/components/AdHocCreator.tsx` | New ad-hoc rides are created in the resolved club; the admin check reads the rider's role in that club |
| Sign-in | `mobile/src/auth/AuthContext.tsx`, `mobile/App.tsx` | Provider order; the club is stored with the user id it was resolved for |
| Server | `rail3_is_affiliated` in every Rail 3 policy | The database enforces the same approved-only line the home screen draws |

**What the rule does not do:**
- No rider-facing choice. A rider in two clubs gets the primary club, always.
- A role change takes effect only after an app restart (the club is resolved once per sign-in).
- Web is unaffected; it resolves from the subdomain.

**Why Lakeside Wheelers cannot use the open-test build:** it is not on staging, and even if it were, a Lakeside member who is also in neither primary nor fallback would resolve to Lakeside only by rule 2's "first other membership". Anyone with no membership is auto-joined to Bikes and Beers.

**How W221, W258 and multi-membership meet:** W221's question ("which club is this rider in?") is now answered in mobile by a preference order; W258 answers the same question for web by subdomain. Neither gives a rider in two clubs a way to choose on mobile. That is the piece that needs a ruling.

---

## 4. PR #55 (W171)

**The stranded commit:** `bedfbe9`, "W171: Extend Hard Purge to Rail 3 tables (beacon_alerts, rider_states)", 2026-06-10. One file, `supabase/functions/hard-purge-location/index.ts`, 41 lines added.

**What it does.** Inside the existing 4-hour purge edge function, for rides that ended more than 4 hours ago:
1. also clears `last_ping` alongside the last position;
2. **deletes** every `beacon_alerts` row for those rides;
3. **deletes** every `rider_states` row for those rides;
4. reports the counts, and never lets a Rail 3 failure break the existing web purge.

This is a direct implementation of R3-36 as committed (quoted in §6.2).

**Is it covered by W299 and D100?**

| W171 behaviour | W299 (account deletion) | D100 (retention job) | Covered? |
|---|---|---|---|
| Clear `last_ping` at T+4h | No | Yes, with last position and the per-ride phone | **Yes** |
| Delete `beacon_alerts` rows at T+4h | Only the deleting user's own rows, when they delete their account | **No, deliberately.** Coordinates cleared after 30 days; the row is kept as an audit record | **No — and the two disagree** |
| Delete `rider_states` rows at T+4h | Only the deleting user's own rows | No | No, but moot: see below |

Two further facts:
- **The function W171 extends is dead.** `hard-purge-location` was never scheduled (Live: each database has exactly one cron job, `rail3-retention-purge`). D100's header says it is superseded and must not be run by hand, because it also sets participant status to `purged`, which D100 deliberately does not.
- **`rider_states` is unused.** No code in the mobile app or the web admin reads or writes it (Repo), and it holds 0 rows on staging (Live). Rider state travels in the broadcast payload instead.

**Hands' reading:** PR #55 should not be merged; its target is superseded. But it is the only code that implements R3-36's Beacon deletion, and closing it leaves a recorded divergence: the Bedrock says delete Beacon rows at T+4h, the database keeps them. That is a Bedrock question (§6.2), not a merge question.

---

## 5. W206

**What exists.** There is no Pillar or Ledger entry. A search of `productdocuments/` for "W206" returns nothing. The ruling is recorded in three places:

**1. The Stride ticket** (created 2026-06-16 01:25 UTC, completed 2026-06-16 02:42 UTC):

> **Title:** Rail 3 mobile — Captain SOS/beacon must be visible to other riders
> **Description:** UX: when a Captain presses SOS (support beacon), it should be visible to other riders on the fleet, not just SAG/Captain. Currently the beacon visibility may be role-scoped such that riders do not see a Captain in distress. Confirm intended audience and surface the Captain SOS to the appropriate riders. Raised by product owner 2026-06-15.
> **Completion summary:** Captain/SAG SOS beacon now visible to all riders; peer beacons still hidden (F-07 not opened).

**2. The commit** (`d73fde9`, dated 2026-06-15):

> W206: Captain/SAG SOS beacon visible to all riders (§4.1 amended)
>
> A command rider's (Captain/SAG) Support Beacon is now visible to every rider, not just to Captain/SAG. The Captain/SAG marker is already on every rider's map (§4.1), so surfacing their SOS state change there is a safety extension, not new peer visibility. Peer member->member beacons stay hidden — F-07 (full peer visibility) remains a pending Brain decision and is NOT opened here.
>
> Ratified by Sr PM (Neil) 2026-06-15. Cancel rights unchanged (riders still cannot cancel a Captain's beacon).

**3. The code** (`mobile/src/lib/beaconLogic.ts`, on `rail3-integration` and in the open-test build):

```ts
// §4.1 SUPPORT BEACON visibility (amended W206, ratified 2026-06-15):
//  - every rider always sees their OWN beacon state;
//  - Captain/SAG see ALL beacons (command overview);
//  - a COMMAND rider's beacon (a Captain/SAG SOS) is visible to EVERYONE.
// PEER (member→member) beacons remain hidden from other riders — F-07 ... is NOT opened here.
export function canSeeBeacon(myRole, myRiderId, beaconRiderId, beaconOwnerRole?) {
  if (beaconRiderId === myRiderId) return true;   // own beacon — every role
  if (isCommand(myRole)) return true;             // Captain/SAG see all beacons
  return isCommand(beaconOwnerRole);              // W206: everyone sees a Captain/SAG SOS
}
```

**The conflict with F-07.** The commit says "§4.1 amended", but §4.1 was not amended. Pillar II v1.1.1, committed three months later, still reads:

> **Visibility:** Captain and SAG only. Other riders do not see beacon state. Beaconing rider sees own icon in pulsing state only. *(Feature 2)*
>
> | See pulsing beacon icon (others) | Captain ✓ | SAG ✓ | Rider ✗ | Guest ✗ | *(§4.1 matrix)*

And the F-07 resolution, Ledger §8.5, 2026-09-13:

> **F-07, Support Beacon visibility to other riders. RESOLVED 2026-09-13. Captain and SAG only.**
>
> Flagged at v1.0.0 and untouched by the entire G33 arc. Ruled at arc close: beacon state is visible to Captain and SAG only. Other riders never see another rider's beacon. The beaconing participant continues to see their own icon in the alerted pulsing state.
>
> Senior PM reasoning on record: opening beacon visibility to all riders would change the privacy rules governing what one rider may learn about another, and that is a larger change than the feature appears to be. The conservative setting is the safer default. If real-world use shows it wrong, it can be widened.

"Other riders never see another rider's beacon" has no exception for a Captain's or SAG's Beacon. The app shows exactly that case to every rider. So one of three things is true and the Bedrock should say which:

1. W206 stands as an exception F-07 did not mention, and Feature 2, the §4.1 matrix and Scenario 22 need the exception written in.
2. F-07 as ruled overrides W206, and the app is out of line with the Bedrock.
3. The Senior PM's 2026-11-10 note ("a beacon shouldn't be limited to captain and support") widens both, and W206 becomes a subset of the new rule.

---

## 6. D100 — how the retention job closes a ride

### 6.1 The wall-clock question

**Answer: yes, it runs on a wall clock.** This contradicts committed Bedrock.

The job is one database function, `rail3_retention_purge()`, scheduled every 30 minutes by `pg_cron`. Its first step (Repo, `supabase/migrations/20261109010000_d100_location_retention_purge.sql`):

```sql
-- 0) Safety net: end rides left running 24 hours after they started, so they reach step 1.
UPDATE public.rides
   SET status = 'saved', actual_end = now(), auto_closed = true
 WHERE status = 'active'
   AND COALESCE(actual_start, scheduled_start, created_at) < now() - interval '24 hours';
```

The test is elapsed time since the ride started (or was scheduled, or was created). It does not look at pings or participant activity.

**It is live on both databases** (Live): job `rail3-retention-purge`, schedule `*/30 * * * *`, active, on staging and on production.

**What it has done so far** (Live): production has 0 active rides and 0 auto-closed rides, so it has never fired there. Staging has 1 auto-closed ride and 1 currently active ride.

**Why it was added** (migration header): "Rides nobody ends would keep positions forever (auto-close-rides is not scheduled either), so this job also ends any ride still 'active' 24 hours after it started ... This is a safety net, not Scenario 29's midnight close." It came in at review round 1 of D100, on 2026-11-09.

**The committed text it contradicts:**

> Backstop is inactivity only: no pings from any participant for N hours, tenant-configurable. No wall-clock sweep; a global product carries no safe wall clock
> — Pillar II v1.1.1, Feature 3

> **B2, lifecycle machinery. Accepted, split three ways.** A ride closes when its Captain ends it, with End Ride available to every Captain on the ride. The backstop is inactivity only: no pings from any participant for N hours, tenant-configurable. No wall-clock sweep. Midnight UTC, committed in the C2 container diagram, is superseded; 3am UTC was considered and withdrawn, because a global product carries no safe wall clock.
> — Ledger §8.2

> **Slate 1, ride-duration envelope. Accept. Charter level.** Twelve hour design envelope: the app must sustain continuous tracking for twelve hours, and nothing in the architecture may assume a ride ends by any particular time. The second clause forbids reintroducing any wall clock and is consistent with inactivity-only close.
> — Ledger §8.4

A 24-hours-from-start rule is not a time-of-day sweep, and it sits outside the twelve-hour envelope. But it is a wall clock, it does assume a ride ends by a particular time, and Slate 1 forbids exactly that at Charter level. The Ledger's findings log already counts five earlier places where a superseded wall-clock close was carried forward by mistake (F-8, F-10). This is a sixth, and the first in running code.

**The related state of the committed mechanism.** The inactivity auto-close the Bedrock calls for is not built. It is part of the D2 scheduler set, deferred out of Sprint 1. An older edge function, `auto-close-rides`, exists and is not scheduled.

**What this means for the SD-011 amendment (agenda item 4).** The amendment's rationale reads: "the D100 retention job auto-closes rides left active for 24 hours". The rule itself does not depend on the mechanism: a system-ended ride closes its Beacons with reason `ride_ended` and a blank actor, whatever ended the ride. The trigger fires on any ride leaving `active`. Only the amendment's description of *why* a system close happens names the wall clock, and that sentence would enshrine the contradiction if transcribed as written.

**Ways to resolve it (for the Brain to choose):**

| Option | Effect | Cost |
|---|---|---|
| A. Amend the Bedrock to permit a long elapsed-time safety net until the inactivity close exists | Running code becomes compliant. Needs a Charter-level change to Slate 1 | Ruling only |
| B. Replace step 0 with the inactivity rule | Matches Feature 3. `ride_participants.last_ping` is the available signal, written by the app's periodic last-known write. N needs a per-club setting. A ride whose riders never ran the app has no pings at all, which Feature 3 already treats as closable ("a no-show ride produces no pings and the inactivity backstop closes it") | Small: one migration on both databases |
| C. Remove step 0 | Compliant, but a ride nobody ends keeps positions indefinitely until the inactivity close is built. This is the privacy-policy problem step 0 was added to prevent | Small, with a known gap |

### 6.2 Two retention divergences found on the way

These were not asked about, but they sit in the same function and in the same Pillar section.

**Beacon rows.** Committed:

> | beacon_alerts | Support Beacon events with location snapshot, cancellation actor and timestamp | 4-hour Hard Purge (personal-data class) |
> — Pillar II §2

> Then all records in beacon_alerts for that ride_id are permanently deleted ... And no location or beacon data is recoverable after purge
> — Pillar III R3-36

As built (D100, step 2): Beacon coordinates are cleared 30 days after the Beacon was raised; the row is kept permanently as an audit record. Source: Senior PM decision 2026-11-09, "option C", recorded on the D100 ticket and published in the privacy policy ("The location is deleted after 30 days; the record that a Beacon was raised remains"). Staging holds 119 Beacon rows, 6 of them still carrying coordinates (Live).

This matters to SD-011: the amendment is about the audit meaning of fields on a row that R3-36 says should not exist 4 hours after the ride.

**Leader breadcrumb.** Committed:

> Club artifacts, purge-exempt: rail3_breadcrumb and the AI ride summary.
> — Pillar II §2

As built (D100, step 1b): `rail3_breadcrumb` rows are deleted 4 hours after their last update. Published in the privacy policy ("deleted within 5 hours of the ride ending").

Neither change has a Pillar V amendment or a Ledger entry.

### 6.3 The whole job, for reference

| Step | Rule | Matches Bedrock? |
|---|---|---|
| 0 | End rides still active 24h after start | **No** (§6.1) |
| 1 | 4h after a ride ends: clear each participant's last position, last ping, and the per-ride phone copy | Yes for position (R3-36, Scenario 28). The phone clearing is a Senior PM decision of 2026-11-09 |
| 1b | Delete the leader breadcrumb 4h after its last update | **No** (§6.2) |
| 2 | Clear Beacon coordinates after 30 days; keep the row | **No** (§6.2) |
| 3 | Telemetry: delete full-capture rows at T+4h; strip identity from always-on counters | Yes (Ledger §8.5) |

---

## 7. Migration inventory

### 7.1 Held off production, in order

Twelve migrations exist on `rail3-integration` and not on `master`. All twelve are applied on staging (Live: staging's migration ledger lists each one). None is on production.

| # | Migration | From | What it creates or changes | Depends on |
|---|---|---|---|---|
| 1 | `20260610000000_rail3_schema` | W169 | Tables `beacon_alerts`, `rider_states`; club threshold columns; position columns on `ride_participants` (already present on production); tenant-scoped policies; grants | Base schema only |
| 2 | `20260610010000_rail3_broadcast_authorization` | W170 | `rail3_topic_tenant_id()`; the two broadcast policies | #1 |
| 3 | `20260714000000_rail3_ride_started_by` | D80 | `rides.started_by`, its trigger, and a backfill from `created_by` for started rides | Base schema |
| 4 | `20260718000000_rail3_breadcrumb_capture` | D82 | Table `rail3_breadcrumb`; helpers `is_rail3_ride_captain`, `is_rail3_ride_participant`, `is_rail3_ride_leader`; policies | #3 |
| 5 | `20260915000000_rail3_telemetry` | W284 | Tables `rail3_telemetry_events`, `rail3_operator_config`; `rail3_ride_tenant_id()` | Base schema |
| 6 | `20260916000000_rail3_participant_joined_at` | W288 | `ride_participants.rail3_joined_at` | — |
| 7 | `20260917000000_rail3_any_captain_end_ride` | W291 | Policy `rides_rail3_captain_end`; ownership guard trigger on `rides` | #4 |
| 8 | `20260918000000_rail3_participant_departed_at` | W292 | `ride_participants.departed_at` | — |
| 9 | `20261108020000_d98_rail3_telemetry_grants` | D98 | Tightens grants on the two telemetry tables | #5 |
| 10 | `20261109000000_w304_rail3_affiliated_only` | W304 | `rail3_is_affiliated()`; rewrites every Rail 3 policy from #1, #2, #4, #5 to require an approved membership | #1, #2, #4, #5 |
| 11 | `20261114000000_d81_close_beacons_on_ride_end` | D81 | `beacon_cancel_reason` column and check; ride-end trigger; late-Beacon trigger; backfill | #1, and the D96 guard trigger (on production already) |
| 12 | `20261114010000_d81_guard_beacon_close_fields` | D81 | Server-only guard on `beacon_cancel_reason`; no Beacon flag after ride end | #11 |

**Not in this list, because it is already on production:** `20261109010000_d100_location_retention_purge` (D100). It is on both trunks and both databases. It guards each Rail 3 table with an existence check, so on production today it runs steps 0 and 1 only.

**Do any of the twelve depend on staging-only objects?** No. Read in order, each one creates what it needs or depends only on an earlier migration in the list or on something production already has. Migration #4 exists precisely because the breadcrumb table had been created on staging by hand; it was written to capture that.

**Three things to know before they run on production:**
- **Ten of the twelve are dated earlier than migrations production has already applied** (production's latest is 20261109010000). The Supabase CLI refuses out-of-order migrations by default and has to be told to include them. Expected behaviour, not verified in this pass.
- **Migration #7's header is out of date.** It says "no RESTRICTIVE policy exists on rides". The D96 fix has since added two. The new Captain end-ride policy is combined with them: a Captain can end a ride only if they are an approved member or an admin of the ride's club. This is the second pitfall on W259.
- **Migration #3 backfills** `started_by` from `created_by` for every ride that has ever started. On production that touches real club rides. It is harmless by design but it is a data write to existing rows.

### 7.2 The two trunks have diverged in both directions

`master` carries eight migrations that `rail3-integration` does not:

| Migration | On production | On staging |
|---|---|---|
| `20260625000000_w230_admin_member_contact` | Yes | **No** |
| `20260702000000_participant_self_cancel_rsvp` | Yes | **No** |
| `20260704000000_w251_pending_members` | Yes | Not in the ledger; the table exists |
| `20260706000000_phone_normalization` | Yes | Not in the ledger; the function and trigger exist |
| `20261106000000_security_hotfix_step_a` | Yes | Yes |
| `20261106000100_security_d96_step_b` | Yes | Yes |
| `20261108000000_w299_account_self_deletion` | Yes | Yes |
| `20261108010000_d97_tenants_ai_api_key_private` | Yes | Yes |

So staging is neither trunk. It has every Rail 3 migration, four of master's eight applied properly, two applied by hand, and two missing. One visible consequence: on production a rider can delete their own RSVP row (the self-cancel migration); on staging they cannot.

Before promotion, `master` has to be merged into `rail3-integration` so one branch holds all 77 migrations in a single order.

### 7.3 Staging-only objects (in no migration, on neither trunk)

| Object | What it does | Why it matters at promotion |
|---|---|---|
| Trigger `rail3_hydrate_participant_identity_trg` on `ride_participants`, and its function | On every insert or update, copies the account's name, email and phone onto the participant row where those are empty | The mobile roster and map read names from these columns. Without it on production, names would be missing (§1.6). It also copies phone numbers into a column D50 exposes |
| Table `rail3_sag_allowlist` (email, note, created_at) with trigger `rail3_sag_allowlist_promote_trg` on `ride_participants` | Any participant whose email is on the list is given the SAG role automatically. Row security is on with no policies, so app users cannot read or write it. It holds 0 rows | A role-granting side door that exists in no reviewed code. The W299 deletion function knows about it and cleans it up if present |
| Third branch on `participant_update_policy` | Lets a club admin update any participant row | From the unmerged D70 branch (§1.2) |

All three were applied to staging by hand during the proof of concept. Each needs a decision: capture in a migration, or drop from staging.

---

## Appendix A — ticket bodies in full

Fields are quoted as stored. Empty fields are omitted.

### A.1 W221 — [Production] Rekey tenant resolution: build-slug -> rider's club membership

Status: open | Type: work | Priority: medium | Complexity: medium | Last updated: 2026-11-14

**Description:**

```text
Multi-tenant production: resolve the active tenant from the signed-in rider's account_tenants membership instead of build-time EXPO_PUBLIC_TENANT_SLUG; Vechelon default if no club. In-app logo/colours (W178 ThemeProvider) + web favicon follow the resolved club. B2B2C, scales to any club from the DB.

--- 2026-06-25: DEFERRED TO THE PRODUCTION LANE (Sr PM decision). NOT a closed-test gate.
The closed test is single-tenant (Racer Sportif) on staging, where build-slug resolution
(EXPO_PUBLIC_TENANT_SLUG=racer-sportif) already brands correctly — membership resolution
returns the same tenant. The rekey only earns its keep when ONE build serves MANY clubs
(production B2B2C). Retitled [Closed Test] -> [Production]. Re-sized small -> medium.

EXPLORATION FINDINGS (banked for the production session; full map in session transcript):
- account_tenants RLS is SAFE for a direct mobile SELECT: policy account_tenants_select_policy
  USING (account_id = auth.uid()) — no recursion, no SECURITY DEFINER wrapper needed.
- tenants brand columns (American spelling): name, slug, primary_color, accent_color, logo_url.
  tenant_public_select_policy = anon SELECT true (pre-auth branding works).
- THREE FORKS to decide at build time:
  1) PRE-AUTH BRANDING: membership is only known post-login, and ThemeProvider sits OUTSIDE
     AuthProvider in the tree (mobile/App.tsx) — so a pure membership rekey makes SignInScreen
     show Vechelon default for every club (clubs lose login-screen branding). Hybrid fix:
     keep slug pre-auth, resolve membership post-auth (needs tree restructure or a session
     subscription inside ThemeProvider).
  2) MISSING-ROW GAP (real blocker): mobile OTP sign-in NEVER creates an account_tenants row
     — only the web AuthPage does (ensure_account_exists RPC). A mobile-onboarded rider has
     ZERO membership rows -> resolution defaults everyone to Vechelon. Production rekey must
     wire membership-row creation into the mobile auth flow (extra scope; likely its own ticket).
  3) MULTI-MEMBERSHIP: account_tenants has NO is_primary flag; a rider in 2 clubs is ambiguous
     (LIMIT 1 is non-deterministic). Likely a small schema amendment when multi-club ships.
- SUGGESTED SPLIT for the production session: (a) hybrid slug-pre-auth + membership-post-auth
  resolution mechanism; (b) mobile membership-row creation (the gap); (c) is_primary amendment.
- Web reference pattern: admin/src/hooks/useTierDetection.ts + admin/src/pages/rider/AuthPage.tsx
  (note: web resolves tenant FROM the subdomain first, then checks membership — opposite
  direction to what mobile needs; do not copy verbatim).
```

### A.2 W258 — [MVP] Enable multi-club membership for a single email

Status: open | Type: work | Priority: medium | Complexity: medium | Last updated: 2026-11-14

**Description:**

```text
Closes the last pending Brain artifact: let ONE email/identity belong to more than one club. The data model already supports this (account_tenants junction with UNIQUE(account_id, tenant_id); accounts.email is globally unique on accounts = auth.users; ensure_account_exists() is already multi-tenant-aware). NO data-model migration is required. Two things block it today: (1) a deliberate product guard that rejects cross-club emails, and (2) RLS tenant resolution via LIMIT 1, which resolves a multi-club user to an ARBITRARY club and would leak data across tenants if the guard were simply removed. This MVP delivers only: an admin at Club B can add an email that already exists at Club A, and that person can use both clubs, each reached via that club's own subdomain.

=== NOTE — TRADE-OFF ACCEPTED (2026-07-04, Neil) ===
The MVP uses SUBDOMAIN-AS-CLUB-SELECTOR. The club a user is viewing is whichever subdomain is in the address bar (clubA.vechelon.ca vs clubB.vechelon.ca). There is deliberately NO 'which club?' picker and NO single session that spans clubs. Consequences accepted:
  - A dual-club user has, in effect, one login per club (sessions are stored per-subdomain). They reach each club through that club's own front door.
  - The normal path is a CLICK, not typing: club-branded invite links land them on the right subdomain, after which browser autocomplete / history / bookmarks make return visits a non-event. The only person who must know-and-type a slug cold is someone on a fresh device with no link, no history, no bookmark.
  - Bare-domain entry (typing vechelon.ca with no subdomain) has no club context and is NOT handled in this MVP — no picker is built. A typo'd slug just fails to resolve (annoyance, not a data-safety issue — RLS still only ever shows clubs the user belongs to).
WHY this trade-off: it is what keeps the MVP to ~3-4.5 dev-days. The alternative (sign-in-then-pick-your-club, one session hopping between clubs) forces the DB to carry tenant in the session/JWT instead of just echoing the subdomain in a request header — materially more RLS work and the exact scope creep this ticket refuses. If a real user ever gets stuck on the bare domain, the fix is a separate ~0.5-day 'enter your club' redirect screen, tracked as its own follow-up — NOT part of this ticket.
============================================

UX model recap: subdomain-as-selector reached via club-branded invite links + browser autocomplete/bookmarks. Sessions stay one-per-subdomain (that is what keeps this light).
```

**What:**

```text
Invert the cross-club provisioning guard so an existing email is ADDED to the second club (new account_tenants row) instead of rejected; and make RLS resolve the CURRENT tenant per request (from the subdomain the client is already on) instead of LIMIT 1, validated against the caller's memberships so it can only ever select a club the user actually belongs to.
```

**Why:**

```text
Multi-membership is the final pending Brain artifact. Real riders/staff belong to more than one club and today are told to use a second email ('This email is already registered on the Vechelon platform. Please use a dedicated email for this club.' — W127 / Pillar II 2.3). One identity across clubs removes that friction without a schema change.
```

**Acceptance criteria:**

```text
An admin can add an email that already belongs to another club; a second account_tenants row is created instead of a rejection
Re-adding an existing membership is idempotent (no error, no duplicate)
A dual-club user, signed in per subdomain, sees ONLY the club matching the subdomain they are on — verified in both directions on staging
Existing single-club users see no behavioural change (header-absent fallback preserves current RLS resolution)
No RLS policy referencing get_my_tenant_id() recurses or loses tenant scope after the new migration
Cross-club rejection copy (CROSS_CLUB_MESSAGE) is removed/replaced; invite copy reflects 'added to <club>'
OUT OF SCOPE and explicitly not built: club switcher, single session across clubs, bare-domain 'pick your club' screen, JWT/app_metadata tenant claim, mobile/Rail 3, merging pre-existing duplicate accounts
```

**Pitfalls:**

```text
- Do NOT remove the cross-club guard without shipping the get_my_tenant_id() fix in the same change — doing so leaks data across tenants for multi-club users
- Do NOT edit get_my_tenant_id() in place in the old migration; write a new dated migration with DROP/CREATE OR REPLACE so fresh deploys are idempotent
- Do NOT trust the x-tenant-id header blindly — always validate it is in the caller's account_tenants; an unvalidated header is a tenant-spoof vector
- Do NOT drop the LIMIT 1 fallback — single-club users and header-absent requests must keep working unchanged
- Do NOT introduce a self-referencing RLS policy while re-scoping (the W126 recursion incident pattern)
- Do NOT expand scope into a club switcher, cross-club roster visibility, single-session-across-clubs, or JWT tenant claims — those are the heavy version and are explicitly deferred
- Do NOT touch mobile/Rail 3 (tenant is baked per build via EXPO_PUBLIC_TENANT_SLUG) — web admin only
- Keep the two duplicated guards (_shared/member-provision.ts and admin-complete-guest) behaviourally in sync — fixing one and not the other reopens the bug on one path
```

**Key files:**

```text
- `supabase/functions/_shared/member-provision.ts` — provisionMember() rejects crossClub at the guard (returns failed_cross_club, CROSS_CLUB_MESSAGE). Invert: when the email has an account but no membership at this tenant, INSERT an account_tenants row (idempotent if already a member) instead of rejecting. lookupMembership() already computes crossClub.
- `supabase/functions/admin-complete-guest/index.ts` — Same cross-club guard is duplicated here (~lines 114-141). Apply the identical inversion; keep the two paths behaviourally in sync.
- `supabase/migrations/20260413000002_fix_tenant_functions.sql` — PATTERN/REFERENCE ONLY — current get_my_tenant_id() body uses `... account_tenants WHERE account_id = auth.uid() LIMIT 1`. Do NOT edit in place; write a NEW dated migration that supersedes it (defensive CREATE OR REPLACE) resolving tenant from the x-tenant-id request header, validated against the caller's account_tenants, falling back to the existing LIMIT 1 behaviour when the header is absent/invalid so single-club users are unaffected.
- `admin/src/lib/extractSlug.ts` — Client already derives current tenant from the subdomain. The x-tenant-id header sent to the DB should carry this same resolved tenant id — do not invent a second source of truth.
- `admin/src/App.tsx` — currentTenantId is set here (~168-184) from extractSlug. Wire the resolved tenant id into the supabase-js client's global headers (x-tenant-id) so every RLS-governed request carries it.
```

**Patterns to follow:**

```text
RLS: write a NEW dated migration with defensive CREATE OR REPLACE (never edit 20260413000002 in place) — see the incident-response convention in CLAUDE.md and prior tenant-function migrations (20260504170234 only set search_path; keep that search_path hardening)
Multi-tenant awareness already done right in supabase/migrations/20260506020000_d39_ensure_account_tenant_aware.sql (takes explicit p_tenant_id, preserves memberships across ALL tenants) — mirror that posture
Invoke the supabase-patterns skill BEFORE touching any migration or edge function (RLS recursion is the #1 incident source here); extend the reviewer prompt with explicit recursion-check focus per CLAUDE.md
Client tenant resolution already lives in admin/src/lib/extractSlug.ts + App.tsx — reuse currentTenantId, do not add a parallel source of truth
```

**Testing strategy:**

```text
- coverage_target: 100% of the get_my_tenant_id() resolution branches and the member-provision cross-club branch
- edge_cases: User belongs to 3+ clubs; Spoofed/typo'd x-tenant-id header; Bare-domain entry (no subdomain) for a multi-club user — acceptable to fall back / not-resolve for MVP; document behaviour, do NOT build a picker; Guest (ride_participants) email that later becomes a cross-club member
- integration_tests: get_my_tenant_id() returns the x-tenant-id value when it is one of the caller's memberships; get_my_tenant_id() ignores a spoofed x-tenant-id the caller is NOT a member of and falls back to prior behaviour; get_my_tenant_id() with no header behaves exactly as the current LIMIT 1 implementation
- manual_tests: Dual-club UAT on staging with a genuinely two-club test account (RS staging tenant + a second seeded tenant) — verify no cross-club bleed either direction; Club-branded invite link click lands the dual-club user on the correct subdomain
- unit_tests: member-provision: existing email + no membership at tenant -> outcome adds account_tenants row (not failed_cross_club); member-provision: existing email + already a member at tenant -> idempotent no-op, no unique-violation surfaced; member-provision: brand-new email -> unchanged happy-path provisioning
```

**Verification steps:**

```text
- On staging, as a Club A admin, invite an email that is ALREADY a Club A member into Club B (or vice versa) via invite-member / bulk-create-members. → expected: No 'use a dedicated email' rejection; a second account_tenants row is created; the person receives a Club-B-branded invite. Re-inviting the same email is a no-op (idempotent), not a duplicate row error.
- Sign in as the dual-club account at clubA.vechelon.ca, then separately at clubB.vechelon.ca. → expected: At each subdomain the user sees ONLY that club's data (members, rides). No rows from the other club appear in either direction. Branding matches the subdomain.
- Diff every RLS policy that references get_my_tenant_id() before/after the new migration (grep the migrations tree for get_my_tenant_id). → expected: Every referencing policy still compiles and enforces tenant scope; no policy self-references its own table in a way that recurses; single-club users' resolution is unchanged from LIMIT 1 behaviour.
- Regression: sign in as an existing SINGLE-club user (no header change path) on staging. → expected: Behaviour identical to production — no change in what they see; header-absent fallback path exercised.
```

**Where:**

```text
Supabase edge functions (_shared/member-provision.ts, admin-complete-guest), the RLS helper get_my_tenant_id() (new migration), and the admin web supabase client (x-tenant-id header). No mobile/Rail 3 scope.
```

### A.3 D50 — participant_tactical_select RP-16 disjunct exposes all participant phone numbers to affiliated Riders

Status: open | Type: defect | Priority: high | Complexity: small | Last updated: 2026-11-14

**Description:**

```text
Found during W172 review (commit 90480ee re-review). participant_tactical_select (migration 20260411000001, lines 73-83) has a 4th disjunct implementing RP-16 (attendee list visible to Affiliated riders): get_tenant_status(...) = affiliated returns ALL ride_participants rows to an affiliated Rider. RLS is row-level, so the row includes the phone column — meaning in affiliated tenants any Rider can read every participant phone number via direct PostgREST, and the Rail 3 §4.1 contact gate (Rider sees Captain/SAG numbers only) holds client-side only. PRE-EXISTING (April 2026 policy, affects web too); W172 strictly NARROWED exposure by removing phones from Broadcast payloads and joining against this RLS-gated roster. Fix direction: column-restrict RP-16 — e.g. a names-only attendee VIEW (security_invoker) for the attendee-list use case, and tighten the policy disjunct so phone reaches Captain/SAG + self only. Same hardening class as W120 (analytics_events WITH CHECK true). Touches web attendee-list reads — verify admin/ usages before tightening.

-----
DEFERRED 2026-06-14 (Sr PM agreed): NOT required for the PoC. This is a PRE-EXISTING prod policy change (participant_tactical_select, app-wide since Apr 2026) touching 14 ride_participants read sites in admin/ — the correct fix (tighten disjunct 4 + names-only SECURITY DEFINER RPC/view + repoint rider attendee-list reads) is a coordinated web+RLS change that must NOT be rushed mid-PoC (would break the live affiliated-rider attendee list if done naively). Residual leak = an affiliated rider reading peers' phones via direct PostgREST; W172 already removed phones from broadcast payloads. LOCKED as a hard dependency of the W197 promotion gate, so it cannot be orphaned — gets its own careful cycle (audit reads -> RPC -> tighten -> repoint web -> validate) BEFORE promotion.

---
## ROSTER VIEW RULES — correct-behaviour spec (Neil, 2026-07-03)
The roster follows the SAME view rules as the live map:
- **Riders** see ONLY **captain + support** (their support contacts + phones).
- **Captain + support** see the **WHOLE roster** — every participant + phone (to call anyone who needs help).

This is the fix criteria for this defect: `participant_tactical_select` must role-scope phone exposure so affiliated Riders no longer see all participant phones — only captain/support do (and captain/support see all).

Cross-ref: W249 (member onboarding contact model) collects/confirms the rider phone this roster depends on; phone is optional at bulk import and rider-confirmed at verify-to-finish.

—— SCOPE WIDENED 2026-07-06 (W262 review): now also exposes last-known POSITION, not just phone ——
W261 writes ride_participants.last_lat/last_long/last_ping (last-known-on-stop) and W262 fetches them through THIS SAME participant_tactical_select policy. So the RP-16 affiliated-tenant disjunct (returns ALL rows to an affiliated Rider) now leaks other riders' last-known COORDINATES, not only phone numbers — directly relevant to Vechelon's no-coordinate-storage privacy posture. The column-restriction fix MUST scope last_lat/last_long (and last_ping) alongside phone. Not a W262 regression (pre-existing policy breadth + Pillar II §2 persistence); tracked here.
```

**What:**

```text
Column-restrict the RP-16 affiliated-attendee-list path so phone never reaches Rider clients server-side
```

**Why:**

```text
Rail 3 §4.1 contact gating must be server-enforced; current policy makes it client-only in affiliated tenants
```

**Acceptance criteria:**

```text
Affiliated Rider can still read attendee display names (RP-16 preserved)
Affiliated Rider cannot read other riders phone via any PostgREST path
Captain/SAG phone access unchanged
Web attendee-list surfaces verified unbroken
Regression assertion added to the W182 isolation matrix
```

### A.4 D93 — RLS: participant_update_policy has no WITH CHECK — a rider can self-promote to captain

Status: open | Type: defect | Priority: high | Complexity: small | Last updated: 2026-11-14

**Description:**

```text
Found during the W277 architecture survey (finding only — not fixed in W277).

supabase/migrations/20260410000001_rls_refinement.sql:91-96 defines participant_update_policy FOR UPDATE USING (account_id = auth.uid() OR is_captain_or_support(ride_id)) — with NO WITH CHECK clause. Postgres then reuses USING as the check. That blocks reassigning account_id to someone else, but does NOT constrain the `role` column. An authenticated rider can UPDATE their own ride_participants row setting role='captain'; the new row still satisfies account_id = auth.uid().

The escalation is immediate because is_captain_or_support() (same file, :16-25) derives command role from this very table: SELECT EXISTS (SELECT 1 FROM ride_participants WHERE ride_id=$1 AND account_id=auth.uid() AND role IN ('captain','support')).

Verified: the policy is created exactly once across all migrations and never amended.

Post-escalation the rider gains server-side:
  - participant_tactical_select -> every participant row for the ride, including phone
  - participant_update_policy   -> UPDATE any participant row in that ride
  - participant_delete_policy   -> DELETE participants (20260425000001:6-11)
  - client-side End Ride / Ad Hoc controls unlock (gated on myRole === 'captain')

Not total: the rides UPDATE is separately gated by ride_admin_modify (tenant admin OR created_by), so End Ride still fails server-side. The phone/roster exposure and participant tampering are real.

SCOPE: shared Rails 1 & 2 schema, LIVE ON PRODUCTION (the rail3_* tables are not on prod yet).

Violates Pillar II §4.1 (Captain/SAG are designated roles, never acquired) and Rail 3 BDD R3-60/R3-66.

Likely fix: add WITH CHECK pinning role and account_id to their existing values on the self-update branch, keeping the captain/SAG branch for legitimate beacon-cancel writes. INVOKE THE supabase-patterns SKILL FIRST — is_captain_or_support already self-references ride_participants, so recursion risk is live.
```

**Why:**

```text
A rider can grant themselves command role with a single UPDATE, defeating the §4.1 role envelope server-side. Phone numbers are the sensitive payload. On production schema today.
```

**Acceptance criteria:**

```text
A migration adds WITH CHECK to participant_update_policy such that: (1) a rider updating their own row CANNOT change role or account_id; (2) a rider CAN still update their own last_lat/last_long/last_ping/beacon_active (the Rail 3 write path must keep working — see persistLastKnown); (3) Captain/SAG can still update other participants' rows for beacon cancel; (4) no RLS recursion introduced; (5) a probe proves the self-promotion UPDATE is rejected.
```

**Key files:**

```text
- `supabase/migrations/20260410000001_rls_refinement.sql` — participant_update_policy (:91-96) and is_captain_or_support (:16-25). Created once, never amended.
- `mobile/src/hooks/useFleetPositions.ts` — persistLastKnown (:141-161) — the legitimate self-update write path that must keep working.
- `supabase/migrations/20260425000001_participant_delete_policy.sql` — DELETE rights the escalation also unlocks.
```

### A.5 D94 — Rail 3 Broadcast authz is tenant-scoped, not ride-scoped — any tenant member can receive any ride's live GPS

Status: open | Type: defect | Priority: high | Complexity: small | Last updated: 2026-11-14

**Description:**

```text
Found during the W277 architecture survey (finding only — not fixed in W277).

supabase/migrations/20260610010000_rail3_broadcast_authorization.sql:52-68 defines rail3_broadcast_tenant_receive (SELECT) and rail3_broadcast_tenant_send (INSERT) on realtime.messages with the predicate: realtime.topic() LIKE 'rail3:ride:%' AND rail3_topic_tenant_id(realtime.topic()) = get_my_tenant_id().

It resolves the topic's ride to its tenant and compares to the caller's tenant. Nothing consults ride_participants. Consequences:
  - Any authenticated tenant member can subscribe to ANY ride channel in that tenant, including rides they never joined and rides they cannot see under ride_tiered_select.
  - Broadcast carries live GPS, so this is live rider-location exposure to the whole club.
  - The policy also permits INSERT, so a non-participant can inject position/depart events into a ride channel they are not on.

Aggravating: get_my_tenant_id() is SELECT tenant_id FROM account_tenants WHERE account_id=auth.uid() LIMIT 1 (20260418000001:13-17) — an UNORDERED LIMIT 1, so a multi-tenant account is authorized against whichever tenant Postgres returns.

Partial mitigation already in the client: the ping payload is minimal by design and all identity attributes come from the RLS-gated roster (useFleetPositions.ts:33-45); unknown riderIds are dropped at the roster join, so a spoofed ping from a non-roster account does not render. What is NOT mitigated is passive receive — a non-participant subscribing and reading every rider's coordinates off the wire.

Violates Pillar II §4.1 (fleet map, all riders = Captain/SAG only) and Rail 3 BDD R3-66.

ALSO WORTH CONFIRMING SEPARATELY: the migration header (:11-13) records that the WEB app uses public 'ride:<id>' channels that bypass realtime.messages RLS entirely.

Likely fix: add a ride-participation check to the predicate — an is_rail3_ride_participant-style SECURITY DEFINER helper already exists (20260718000000:44-51) for rail3_breadcrumb. INVOKE THE supabase-patterns SKILL FIRST — realtime.messages policies evaluate per message, so the helper must be cheap and non-recursive.
```

**Why:**

```text
Live GPS for every rider on a ride is readable by any authenticated member of the tenant whether or not they are on that ride. Privacy is a stated product pillar (D-03) and §4.1 explicitly denies riders the full fleet view — this hands it to them over the wire.
```

**Acceptance criteria:**

```text
A migration narrows both rail3_broadcast policies so only participants of that specific ride may subscribe or send on rail3:ride:<id>. Verified: (1) a tenant member NOT on the ride is denied subscribe; (2) a participant subscribes and receives normally; (3) send is participant-gated; (4) the multi-tenant get_my_tenant_id LIMIT 1 ambiguity is resolved or explicitly documented as out of scope; (5) no measurable added latency on the broadcast hot path; (6) no RLS recursion.
```

**Key files:**

```text
- `supabase/migrations/20260610010000_rail3_broadcast_authorization.sql` — The two over-broad policies (:52-68) and rail3_topic_tenant_id (:26-45).
- `supabase/migrations/20260718000000_rail3_breadcrumb_capture.sql` — is_rail3_ride_participant (:44-51) — existing participant-scoped helper to model the fix on.
- `supabase/migrations/20260418000001_remove_dev_rls_bypasses.sql` — get_my_tenant_id (:13-17) — unordered LIMIT 1 tenant resolution.
- `mobile/src/hooks/useFleetPositions.ts` — Receive path; minimal-payload posture mitigates spoofing but not passive receive.
```

### A.6 W196 — Rail 3: Fix broadcast policies -- replace get_my_tenant_id() LIMIT-1 equality with account_tenants membership EXISTS

Status: open | Type: work | Priority: medium | Complexity: small | Last updated: 2026-11-14

**What:**

```text
In both Rail 3 Broadcast Realtime-Authorization policies (rail3_broadcast_tenant_receive USING + rail3_broadcast_tenant_send WITH CHECK on realtime.messages), replace `rail3_topic_tenant_id(topic) = get_my_tenant_id()` with an EXISTS membership check against public.account_tenants for the ride's tenant -- authorizing 'member of the ride's tenant' regardless of how many tenants the user belongs to. Additive migration, held off the prod pipeline.
```

**Why:**

```text
get_my_tenant_id() resolves a single tenant via LIMIT 1 (arbitrary first row) and has a prod-unsafe `IF tid IS NULL THEN first-tenant` fallback. A rider who belongs to >1 tenant can be denied their own ride's channel or matched to the wrong tenant. Fixing the helper is the wrong lever (load-bearing app-wide); fix at the policy. Plan section 5 Part B #5 + section 6 Tech Lead note. Promotion-gate item -- NOT field-build-blocking.
```

**Acceptance criteria:**

```text
Both rail3 broadcast policies authorize via account_tenants membership of the ride's tenant (not get_my_tenant_id equality)
A multi-tenant rider can subscribe AND publish on their own ride's channel regardless of membership order
A cross-tenant rider is still denied (DoD-12 / V-012 cross-tenant isolation holds on the prod schema)
Additive, idempotent (DROP POLICY IF EXISTS + recreate), recursion-free (Pattern 1)
Migration stays held off the prod db push --linked pipeline until promotion
get_my_tenant_id() itself is NOT modified
```

**Pitfalls:**

```text
- Do NOT touch get_my_tenant_id() itself -- it is load-bearing app-wide. Fix at the policy only.
- Verify account_tenants column names (account_id, tenant_id) and that auth.uid() maps to account_tenants.account_id.
- Re-run DoD-12 / V-012 RLS cross-tenant isolation against the PROD schema before promotion (W182 harness).
- Held migration -- must NOT enter the prod db push --linked pipeline until the promotion gate.
- Also flag the prod-unsafe `IF tid IS NULL THEN first-tenant` fallback in get_my_tenant_id for the promotion checklist (separate from this policy fix).
```

**Key files:**

```text
- `supabase/migrations/20260610010000_rail3_broadcast_authorization.sql` — REFERENCE / DO NOT EDIT -- the two policies (rail3_broadcast_tenant_receive, rail3_broadcast_tenant_send) to supersede; on origin/W172..origin/W175
- `supabase/migrations/20260610000000_rail3_schema.sql` — REFERENCE -- rail3_topic_tenant_id() helper + table policies that also use get_my_tenant_id
- `supabase/migrations/` — EDIT -- add a NEW additive migration here (DROP POLICY IF EXISTS + CREATE POLICY)
```

**Patterns to follow:**

```text
USING/WITH CHECK: realtime.topic() LIKE 'rail3:ride:%' AND EXISTS (SELECT 1 FROM public.account_tenants at WHERE at.account_id = auth.uid() AND at.tenant_id = public.rail3_topic_tenant_id(realtime.topic())). Keep rail3_topic_tenant_id (SECURITY DEFINER, fail-closed). Pattern 1 (reads account_tenants, never realtime.messages -> no recursion), Pattern 5 (idempotent). INVOKE the supabase-patterns skill FIRST. Reviewer prompt: explicit recursion-check focus (self-referencing RLS is the #1 incident source here).
```

**Testing strategy:**

```text
- manual_tests: Run the W182 DoD-12 cross-tenant isolation harness against the updated policies
```

**Verification steps:**

```text
- Apply migration to local/staging; with a user seeded into two tenants, subscribe+publish on a ride whose tenant is the SECOND membership → expected: Subscribe and publish succeed (no realtime authorization denial)
- Attempt subscribe on a ride belonging to a tenant the user is NOT a member of → expected: Denied -- cross-tenant isolation holds
```

**Where:**

```text
supabase/migrations on the held W172 chain. NEW additive migration. Schema/security lane (other agent), NOT the mobile lane. Held OUT of the prod `db push --linked` pipeline until the promotion gate.
```

W259, W171, W206, D100 and D81 are quoted in full in §2, §4, §5 and §6 above.
