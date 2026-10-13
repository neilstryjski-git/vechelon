# Rail 3a Sprint 1 (G34): Sprint Handoff

Project: Vechelon Rail 3 | Goal: G34, board 116 | Base branch: `rail3-integration` | Compiled: 2026-10-13 | Status: DRAFT, a Hands working artifact and not Bedrock

**Goal sentence (ratified 2026-09-30):** "Build and verify the device-side Rail 3a behaviour ruled in the G33 arc against Pillar II v1.1.1 and Pillar III v1.1.1, on the staging build."

**What this document is for.** It is one of the three inputs for shaping the next sprint, alongside Neil's UAT and the running backlog. Sprints are planned just-in-time, so this document does not propose a Sprint 2 plan or goal.

Primary source: the G34 entries in `mobile/log_of_changes.md` (W279 through W285). Brain-facing items are collected in `brain_writeback_packet.md` in this folder.

---

## 1. Status: built vs validated

**Headline.** The build half of the goal sentence is done. The verify half has not started.

| State | Tickets |
|---|---|
| Code merged to `rail3-integration` | All 14 code tickets (W279–W293). PRs #105 and #112–#125 |
| Completed in Stride | **W283 only** (its value was confirmed by the Senior PM on 2026-10-03; it has no device step) |
| Built, unvalidated (`in_progress`, `FIELD RUN: _pending_` in the log) | W279, W280, W281, W282, W284, W285, W286, W287, W288, W289, W290, W291, W292, W293 |
| Built and inert | **W285**: inert until the `rail3_operator_config` android row carries W279's confirmed values. **W289**: the roster cache is inert, failing closed, on any binary without `expo-secure-store`. Build ff53208f includes the module, so it should be active on that build. Confirm this on device. |
| Not yet run | **W279 Battery Saver matrix**: Saver ON/OFF × cold/warm × device. The wTBD2 brief has both values `_PENDING_`. |

**Field-build state.**
- EAS build `ff53208f-6405-4fed-ac27-167f68474a9f`, profile `validate`, off `dd4054e` (code `993020f`). It was installed on Neil's phone on 2026-10-13. Android quota: 14 builds left for October.
- Staging (`xybgtbybdhxuwqjfcfkc`) has migrations 20260915, 20260916, 20260917 and 20260918 pushed and verified (2026-10-04). Staging `schema_migrations` now logs all 8 Rail 3 migrations.
- **Every handset must be on this build before the field run.** Older builds misread two things:
  - the W290 `{brk:1}` breadcrumb sentinel;
  - the W293 `'sleeping'` wire value. An old receiver has no style for it and would throw.

**Nothing in G34 is done until it is field-validated** (the "fixed = built AND validated" rule). The sprint also cannot close until these are done:
- the Pillar IV §14 write-backs for items 10, 11, 15 and 16 (drafted in the packet);
- the F-7 return to the Brain.

---

## 2. Per-ticket one-liners

| Ticket | PR | One-liner | Field validation owed |
|---|---|---|---|
| W279 (= wTBD2) | #105 | Instrumentation for engine-start→first-fix (`engine_first_fix` MeasureKind, pure tracker `engineFirstFix.ts`) plus a brief skeleton. Measurement only. | The Saver matrix itself → two values → Senior PM confirmation |
| W280 | #112 | Restores the screen-lock Battery Saver advisory, which had **zero callers** before. Adds the pure §5.1 collision gate (`advisoryPolicy.ts`) and removes D3 dead code. Absorbs D89. | R3-06 / R3-47 / R3-49 / D89 |
| W281 | #113 | Sign-out order pinned and bounded: departure (3 s wait) → holder clear → signOut → roster-cache clear on an identity delta (`signOutSequence.ts`). | R3-58 / R3-57 / R3-56: `departed_sent{sent,cleared}` before SIGNED_OUT |
| W282 | #114 | Beacon current state lives on `ride_participants.beacon_active` (the seed is authoritative, with no history replay). Raising a beacon writes last-known in the same breath. Stale-under-beacon dashed ring. No migration. | R3-55 pocketed-Captain recovery, R3-20/21/22 cancel paths, D81 interplay |
| W283 | #115 | A4 last-known cadence of 60 s is stated once (`lastKnown.ts`), and the brief was delivered. **Completed**: confirmed 60 s within [30 s, 120 s]. | Single-row check rides along with the field run |
| W284 | #116 | Always-on telemetry tier (three counters), operator-level per-platform config, per-ride full capture, and the T+4h identity strip in hard-purge. Migration 20260915. | Counters on a healthy ride; `engine_died` on a force-stopped FGS; full-capture toggle |
| W286 | #117 | Device-side recovery chain: heartbeat engine re-assert plus an Android headless task (`enableHeadless:true`), and a durable `rail3:active-ride` holder. | Swipe-away → `wake_attempt` / `engine_started{headless_reassert}`; Leave → zero rows |
| W287 | #118 | Convergent ride-end teardown on an affirmative `saved` read, wired into the watch, heartbeat and headless paths. R3-70 is fixed: last-known is no longer nulled at ride end. | Airplane → reconnect, background → focus, Captain Leave ≠ teardown, FGS notification clears |
| W288 | #119 | Per-row roster participation state ("App tracked" / "Roster only"), the `rail3_joined_at` stamp, the leaders-to-all phone rule, and a ride-scoped roster. Migration 20260916. | Rider and Captain views, closed at ride end, web-RSVP flips on first open |
| W289 | #120 | Single-slot AES-256-GCM roster cache. The key is held in `expo-secure-store` (a **new native dep**) and the ciphertext in AsyncStorage. Cleared by supersession or auth transition only. | Offline banner, survives Leave, cleared on account swap, closes offline at end |
| W291 | #121 | Any Captain can End Ride (narrow `rides_rail3_captain_end` policy plus the `trg_rail3_guard_ride_ownership` trigger). Captainless-degraded command model. Migration 20260917. | Co-Captain (not creator) ends the ride; creator's map reacts; member and SAG see no chip |
| W292 | #122 | Durable `departed_at` mark. Departure beats the seed and never deletes. Clean rejoin. Pure `fleetCompose.ts`. Migration 20260918. | D87 closure: rider leaves while Captain pocketed; rejoin → one entry |
| W290 | #123 | Breadcrumb honesty: Captain-departure cue, frozen/dashed stopped trace, and visible capture gaps (flat jsonb + `{brk:1}`). Rejoin no longer truncates the trail. | Leader leave/rejoin, pocketed > Dark, non-leader leave → no cue |
| W293 | #124 | Renames the UI state `'dormant'` → `'sleeping'` and the engine idle state → "stationary". One-release receive shim. | Two devices, Sleeping renders violet, old build interoperates |
| W285 | #125 | R3-40 self-health overlay: binary badge, two operator clocks, unlock-and-focus prompt, and a live §5.1 gate. **Inert until W279's values are in config.** | Badge after ceiling + margin with FGS killed; prompt on unlock; silent repair; exactly one `warning_fired` per episode |

---

## 3. Discoveries (codebase facts and surprises found while building)

**Data and server**
- **Breadcrumb upsert replaced the whole path.** The leader's 60 s upsert wrote the whole session path, so a rejoin truncated the route. The reader adopted on element count and ignored the ping timestamp. Fixed in W290.
- **A co-Captain could not End Ride.** The only UPDATE-capable `rides` policy was `ride_admin_modify` (creator or tenant admin). Worse:
  - a denied UPDATE returns 0 rows with no error, so a co-Captain got a **silent false success**: RIDE_ENDED was broadcast and the map was left while the ride stayed active;
  - RIDE_ENDED was bound for non-captains only, so a second Captain's map never reacted.

  Both fixed in W291.
- **A policy's WITH CHECK cannot see OLD, so a trigger was needed.** The new End Ride policy pinned the status transition but not the payload. A crafted PostgREST UPDATE could have set `created_by = auth.uid()` while closing the ride and so inherited `ride_admin_modify`. Fixed with the `trg_rail3_guard_ride_ownership` BEFORE UPDATE trigger. `started_by` is deliberately unguarded because of alphabetical trigger order against `trg_set_ride_started_by`.
- **The staging migration ledger had drifted.** `schema_migrations` listed only 20260610000000 of the Rail 3 set, although the objects from 0610010000, 0714 and 0718 existed (applied out of band). It was repaired with `migration repair --status applied` and is now clean. Staging-only objects remain:
  - `rail3_sag_allowlist` exists on staging but in no migration;
  - `participant_update_policy` on staging has an extra `OR is_tenant_admin(…)` clause that the repo lacks.
- **`ride_participants.beacon_active` existed but was never used.** Nothing read or wrote it. The beacon seed replayed `beacon_alerts` history, which could resurrect a beacon cancelled while the device was blind. Fixed in W282.
- **`rides.status` has only `created | active | saved`.** `'purged'` is a participant status, so the headless `'purged'` branch was dead code (W287).
- **`participant_tactical_select` returns all rows, including phone numbers, to affiliated riders** (D50 / RP-16). The UI gate is the only gate there. Non-affiliated riders get command rows plus their own row only. Recorded honestly in W288; it was not papered over.
- **The `query_timeout` analytics carrier is staging-only** (stripped for prod). W279's `engine_first_fix` rides it, so the wTBD2 measurement works only on staging. W284 telemetry deliberately does not use it.
- **`hard-purge-location` gaps:**
  - it nulls `last_lat` / `last_long` / `phone` but **not `last_ping` or `beacon_active`**, while R3-36 lists all three (W282, W283);
  - it re-selects already-purged rides on every run, so its new W284 steps had to be idempotent.

**Device and engine**
- **`watchBatterySaverOnScreenLock` had zero callers.** R3-06 was silently unmet while R3-05 (the join prompt) still fired (W280).
- **No `autoSync`, `url` or `batchSync` residue existed anywhere** in `mobile/src`. A B1 exclusion comment was added at `BG.ready()` instead (W280).
- **Sign-out was not fire-and-forget.** The departure was fully awaited with no bound, so a hung REST call blocked sign-out. Separately, the onAuthStateChange user-id-delta path did not clear the active-ride holder, so on a swap account B inherited A's ride binding (W281).
- **R3-67 hole: nothing cleared the active-ride holder on Leave Ride.** A durable holder would have re-engaged a departed session (W286).
- **R3-70 hole: the ride-ended goBack ran `broadcastDeparture`, which nulled last-known.** That wiped a value that must persist to T+4h. Fixed in W287.
- **The SDK does not document whether `BG.stop()` dismisses the Android FGS notification.** It is a device-validation item (R3-35, W287).
- **No connectivity signal exists** (no NetInfo dependency). "Connectivity resumption" is approximated by the W269 resume sources. A native module would cost a build (W287).
- **Our own `stopBgGeo()` disables the plugin**, so a naive `onEnabledChange(false)` would count every clean ride end as an engine death. This is guarded by `stopping`, `engineRunning` and `diedReported` (W284).
- **Android heartbeat floor is 60 s.** The effective device-side recovery window is roughly the heartbeat interval plus `start()` latency. An OEM kill of the FGS runs no JS, so it is **non-recoverable device-side** (W286).
- **The OS blue dot is drawn by the Maps SDK, not by our `myCoords`.** `myCoords` freezes at the last engine fix. W285's first anchor would have shown a frozen badge beside a moving dot (a D79 violation). Fixed by anchoring to `onUserLocationChange` (W285 review r1/r2).
- **A `start()` rejection emitted nothing.** It read as "never started", so the overlay would have stayed inert. Fixed with `noteEngineIntent()` (W285).
- **Log drift.** D91 (the thresholds-dep teardown fix) has no log entry, but the code carries it. Treat the code as current (W279).

**Build and tooling**
- **The `preview` EAS profile lacks the licence.** It has neither `RNBG_LICENSE` nor the Maps key, so field builds must use the **`validate`** profile (node 22 plus production env).
- **`expo-secure-store` is a new native module** (W289). An OTA cannot deliver it, and `runtimeVersion` is fixed, so the cache runs inert on any older binary.
- **Two test files fail on every run** (`beaconAudit`, `rlsIsolation`) because they need the local Supabase stack, and Docker is down here. All DB-backed cases for W282, W284, W288, W291 and W292 are written but **have not been run**. They are for the staging/CI pass.
- **Deno is not installed locally**, so the W284 `hard-purge-location` changes were not type-checked (review was by reading).
- **Stride claim-hook gotcha.** The claim curl must be piped through `| tee`. Piping into `head` or redirecting to `/dev/null` truncates what the hook reads, and `before_doing` never runs.

---

## 4. Deviations from spec (recorded on tickets and in the log)

| Ticket | Deviation | Why |
|---|---|---|
| W280 | R3-06 "on screen lock event" is implemented as: the **lock arms** the check, and the **next unlock** reads Saver and surfaces the advisory. | RN Android defers an Alert raised while paused until resume anyway. Reading at unlock catches Saver turned on while locked and never nags a rider who turned it off from the lock screen (R3-47). |
| W281 | "Fire-and-forget" is implemented as "never wait for acknowledgement" (a bounded 3 s wait), not as a bare `void` after signOut. | A bare `void` would race the token revoke (D1 / R3-58 ordering). |
| W283 | No node test. | `lastKnown.ts` imports the supabase client and cannot load under node. Verified by grep plus tsc. |
| W284 | The INSERT policy is ride-scoped as well as tenant-scoped, via a new SECURITY DEFINER `rail3_ride_tenant_id(uuid)`. | Review r1 security: a member could otherwise file rows against another tenant's ride uuid. |
| W285 | **Permission-denied / never-started is INERT**, not "not-reaching after the ceiling with a Settings prompt" as the ticket's edge case suggested. | R3-40 is gated on "the app's state says tracking should be active". A permission-denier is told at join and renders Sleeping. *Returned to the Brain in the packet, item C.* |
| W285 | "Fail closed to committed defaults" (security consideration 3) **cannot hold**, because there are no committed defaults. A NULL row or first-load failure means inert. | Unmeasured numbers never enter the app. *Packet item C.* |
| W287 | A failed status read never tears down; only an affirmative `saved` does. The status read runs on every 3rd beat while enabled (about 3 min worst case). | A2 "affirmative read". The cadence is ours and is bounded by the inactivity backstop. |
| W288 | The SELF row is shown on the roster (with a YOU chip, no phone). | Slate 17's point is seeing your own state, and §4.1 says complete record. |
| W288 | **The roster shows co-Captains each other's phone numbers**, while the map bottom sheet (`canSeePhone`) hides captain↔captain. | A call sheet for command. *A surface divergence against R3-66; packet item E.* |
| W288 | The integration test "rejoin refreshes it" is read as first-open semantics (the stamp never moves). | Accepted by the reviewer. W292 later refreshes it on a rejoin after departure. |
| W288 | Built to §4.1 / R3-74 (all rows for every role), **not** to R3-66's parenthetical. | Ledger F-12 ruled for §4.1. *Residue returned, packet item D.* |
| W289 | Adding `departed_at` to cached rows did **not** bump the slot version. | A version bump would strand an offline rider who upgraded between loads (§9.2 #2). |
| W290 | **The route overlay is not built.** The deliverable is the cue plus a frozen stopped breadcrumb. | `rides.gpx_path` has no mobile consumer and needs a GPX parser on Hermes plus verified storage RLS. This is a Feature 6 dependency. |
| W290 | jsonb shape is a flat array with a `{brk:1}` sentinel, not an array of segments. | No migration, and old readers are exposed only on rides with a gap. |
| W291 | The policy is **narrower** than the ticket: `status = 'active'` → `'saved'` only. | A Captain can never flip a `created` ride straight to saved or edit a saved ride. |
| W291 | The ride-end watch is called with `iAmCaptain: false`. A Captain opening an already-saved ride sees the rider "already ended" notice. | Co-Captains are told like everyone else; judged acceptable. |
| W293 | The wire value changed, and a one-release receive shim (`LEGACY_SLEEPING_WIRE_VALUE`) was added. | Remove it in the release after this one ships. |

---

## 5. Recorded-but-unfixed minors and residues

- **W281:**
  - `restBroadcast` never checks `res.ok`, so a non-2xx (for example a 401 on an expired JWT) reads as `sent:true`.
  - A rider who declined background permission never sets the holder, so no departure fires at sign-out.
  - On a swap that bypasses `signOut()`, A's row stays un-departed until the server staleness detector (deferred).
- **W282:**
  - A beacon whose rider has no last-known at all cannot be placed on the Captain/SAG map.
  - A Captain-cancelled own beacon that the rider learns about via the seed (because they were pocketed) gives no R3-24 haptic.
- **W284:**
  - The config read exposes the full-capture ride uuid to any signed-in rider (it carries no position data).
  - `get_my_tenant_id()` is `LIMIT 1` with no ORDER BY. This is a pre-existing single-tenant assumption.
  - Housekeeping: consider gitignoring `supabase/.temp/`.
- **W286:**
  - `enableHeadless` also delivers `location` events headless; they exit early. This is a possible future A4 carrier.
  - The `supabase.ts:33` comment still names a TaskManager path that no longer exists.
- **W287:** A device with neither connectivity nor focus keeps tracking until one of them changes, bounded by the inactivity backstop. This is an accepted limit.
- **W288:**
  - A rider-wide roster read for non-affiliated tenants would need a server change (→ TPM).
  - `selfRsvpWithIdentity` does not lowercase email, although the dedupe index comment assumes it does.
- **W290:**
  - `useBreadcrumb`'s channel effect binds without cleanup (pre-existing).
  - The per-segment cap of 1500 means the total can exceed 1500 points.
  - `lineDashPattern` rendering is **device-unverified**; the dim colour is the fallback.
- **W291:** A RIDE_ENDED self-echo with `self:true` means two Captains ending at the same moment get a redundant Alert plus an unhandled GO_BACK. The fix is `onRideEnded()` before the send. It was recorded and not fixed because the review round cap was reached.
- **W292:**
  - W291's `commandState(rows, departedIds)` still has **no caller**.
  - A stale coordinate can sit on a departed row until the T+4h purge (one overwritten row, within A4).
  - Same-account-on-two-devices clock skew can suppress the second device for at most |skew| plus one ping interval.
- **W285:**
  - After a warm restart, a carry-over fix is counted by its receipt clock.
  - The badge can appear up to 5 s after the exact boundary.
  - If no OS location has arrived, no badge is shown (the prompt still covers the rider).
- **W279:** For W285 not to flap, the steady threshold W279 picks must be **greater than the 60 s heartbeat interval**.
- **Placeholder copy (Voice & Tone pending):**
  - W285 self-health prompt;
  - W290 "Captain has left the ride" cue;
  - W289 "Last-known roster" banner;
  - W288/W292 chip labels "App tracked" / "Roster only" / "Left ride". These are the Hands' wording per item 23.
- **Pre-existing:** 2 `deepLinkAuth` tsc errors (unchanged across the sprint).

---

## 6. Deferred out of the sprint (by scope note at goal ratification)

- The D2 scheduler set: auto-start, inactivity auto-close, the 24 h ride list, and joinable = started.
- **R3-36 purge-scope extension.** Server-side; sequence with W259. Must include `last_ping` and `beacon_active`.
- The server-side staleness detector plus the FCM wake path (B1/B2). W287 explicitly leaves the server-initiated wake fast path out.
- Guest self-registration (Rails 1 and 2, Ledger item 18).
- QR credential routing (item 19).
- PWA→native deep-link (R3-75/76/77, substrate pass).
- The W278 trail toggle (PARKED post-integration). Its auto-switch behaviour was split out to W290.
- Feature 6 GPX route overlay. This is a dependency surfaced by W290, not built.
- Production promotion (W259, via Neil's Brain session).

---

## 7. Running-backlog items surfaced this sprint

These are candidates for the backlog, not tickets. Ticketing them is Neil's call.

- **D81:** server-side cancel of open beacons at ride end. W282 fixed the client contract it depends on: named actor, `cancelled_at`, then `beacon_active=false`.
- **D83:** co-Captain End Ride. The fix is on the base, but the defect is still `in_progress` in Stride. Close it on W291 field evidence.
- **D87:** phantom departed marker. Closed by code in W292; close in Stride on field evidence only.
- **W291 two-Captains self-echo follow-up:** take it only if the field run shows it.
- **`restBroadcast` `res.ok` check:** a hot-path change (W281 residue).
- **D50 / RP-16 server-side phone column fix:** the security lane (W288 residue).
- **`get_my_tenant_id()` determinism:** relevant to multi-tenancy, in the same family as the W120 note in memory.
- **Remove the W293 legacy wire shim** in the release after this build ships.
- **W208 production-readiness items still open:** `logLevel` verbose is still on, and the v5 compound-config migration is deferred.
- **Gitignore `supabase/.temp/`.**
- **Staging-only drift to reconcile:** `rail3_sag_allowlist` with no migration, and the extra `is_tenant_admin` clause on `participant_update_policy`.
- **Run the stack-gated DB tests** for W282/W284/W288/W291/W292 on staging/CI.

---

## 8. Risks to production promotion (W259)

1. **Eight Rail 3 migrations are held off the prod `db push --linked` pipeline.** Four came this sprint (20260915–18) and need a reviewed additive promotion, including the D50 fix. Prod has no Rail 3 schema.
2. **Staging is not a faithful mirror of the repo.** It has `rail3_sag_allowlist` (in no migration) and the extra `is_tenant_admin` clause on `participant_update_policy`. Its ledger was repaired by hand. Validation on staging may pass on objects that prod will not get.
3. **Deploy-order hazard (the PGRST204 / D83 class).** The app names `rail3_joined_at` (W288) and `departed_at` (W292) in its INSERT, SELECT and UPDATE paths. If a binary ships ahead of the migrations:
   - every in-app join fails;
   - the last-known fallback errors;
   - the departure UPDATE fails atomically, which brings back the D87 phantom.
4. **Mixed-build fleets break.**
   - Old readers misread the W290 `{brk:1}` sentinel and have no style for W293's `'sleeping'`. On staging this is managed by putting every handset on the new build.
   - In production a mixed fleet is the norm, so this needs a rollout rule or a version gate.
   - W289 also needs a binary (not an OTA) for `expo-secure-store`.
5. **`hard-purge-location` changed in W284**, but no staging function deploy is recorded in the log. Verify before relying on T+4h behaviour. Its purge scope is also incomplete against R3-36 (`last_ping`, `beacon_active`).
6. **Self-health is inert with no committed fallback.** Production needs W279's values in the prod `rail3_operator_config` row (operator SQL in the W285 log entry), and Brain packet item C answered.
7. **The measurement path is staging-only.** `engine_first_fix` rides the `query_timeout` carrier, which is stripped for prod. Any production calibration needs the W284 full-capture tier instead.
8. **The roster's privacy floor is UI-only.** `participant_tactical_select` hands phone numbers to affiliated riders (D50 / RP-16).
9. **Untested server paths.** The DB-backed RLS tests (W282/W284/W288/W291/W292) have not been executed anywhere yet, and the Deno purge changes were never type-checked.
10. **Carried from earlier sprints (memory, not G34).**
    - The prod switch needs the send-magic-link OTP redeploy.
    - The SignInScreen divergence between the integration line and master must be reconciled at promotion.
