# Decision Brief — A4 periodic last-known write cadence (W283)

**Ticket:** W283 (Stride board 116, goal G34). **Hands item:** Pillar IV §14 item 21.
**Bedrock trace:** Rail 3 Ledger v1.1.3 §8.2 A4 (named exception; cadence stated as a shape — a ceiling for privacy, a floor for fallback quality — with no number), §12.1 (30 s seed-to-live design target, not a gate), §12.2 "A4 cadence bound — pending"; Pillar II v1.1.1 §2 last-known exception and retention model; Pillar III v1.1.1 R3-62, R3-36.
**Status:** VALUE CONFIRMED by the Senior PM 2026-10-03 (60 000 ms within [30 s, 120 s]); the TPM records it in Pillar IV §12.2. The field build's sink rows (`last_position_write`) will confirm the write rate in practice.
**Authority:** the Hands propose, the Senior PM confirms, the TPM records the confirmed value in Pillar IV §12.2. Nothing here enters a Pillar by the Hands' edit.

---

## 1. What is being decided

The interval at which every tracking device overwrites its own `ride_participants.last_lat / last_long / last_ping` row while actively riding — the fleet's fallback position once a rider's live pings stop (screen-lock freeze, dead zone, stop). A4 commits this as a named exception to the no-coordinate-persistence rule and fixes its SHAPE; this brief supplies the NUMBER.

## 2. What the build does today (confirmed 2026-09-30 on rail3-integration cb996be)

**One row per rider, overwritten, never accumulated.** Every write is an `UPDATE … WHERE ride_id = ? AND account_id = <live session uid>` through one helper (`mobile/src/lib/lastKnown.ts`, `persistMyParticipantPatch`); there is no INSERT path, no `location_pings` table, no coordinate in any telemetry or sink row (the sink records `{ok, trigger, fields}` only). Four writers compose on that single row:

| Writer | Trigger | Effect on the periodic clock |
|---|---|---|
| Periodic (`'throttle'`) | a GPS fix arrives and ≥ `LAST_KNOWN_WRITE_INTERVAL_MS` has elapsed since the last write | restarts it |
| Stop transition (`'stop'`) | Transistorsoft `onMotionChange(isMoving=false)` | restarts it (a stop write counts as the periodic write) |
| Beacon raise (`'beacon'`, W282) | rider raises the Support Beacon — `{beacon_active, last_*}` in one update | does not touch it; the next periodic write supersedes the raise-time position, which is correct: the anchor follows the rider |
| Departure (D87 / W281) | leave or sign-out — nulls `last_lat`, `last_long`, `last_ping` under the still-valid JWT | n/a (row cleared) |

Two facts bound what "periodic" can mean here. Fixes only arrive on movement (`distanceFilter: 40` m, update interval 5 s), so a STATIONARY rider receives no periodic writes at all — the stop write is what covers them, and the Transistorsoft 60 s heartbeat does not write last-known. And the fleet's receivers read the row only on meaningful events (open, every resume, now also beacon seed on channel activation), never per ping.

As of W283 the constant is declared once, in `lib/lastKnown.ts`, and imported by `useFleetPositions`.

## 3. The shape, with the numbers that bound it

**Ceiling for privacy.** The row is a POSITION, not a TRAIL, by construction — overwritten in place, no history — and that holds at any cadence. What the cadence governs is how closely the server-held row shadows live tracking. The ceiling is therefore: never write more often than the live ping cadence the fleet already receives over the ephemeral Broadcast channel. The committed Stopped/Inactive ping interval is **30 s** (Ledger §1 SD-015, the D-54 Performance NFRs — a PoC validation target confirmed in field testing, not a production guarantee; the ceiling inherits that framing). Writing faster than that would make the persisted row a second, denser channel than the ephemeral one it backs up. **Ceiling: ≥ 30 s.**

**Floor for fallback quality.** A returning viewer seeds the fleet from this row (R3-62: "each participant with any known position is seeded immediately from lastKnown … remains at their last known position until superseded"). The row's age at seed time is bounded by the cadence plus the time since the rider went quiet. The first rung of the state ladder is **Stopped at 2 min** (`DEFAULT_THRESHOLDS.stoppedMinutes = 2`; Inactive 5, Dark 15). If the cadence exceeded 2 min, a rider who had just gone quiet could be rendered Stopped at a position older than the rung that labels them. **Floor: ≤ 120 s.**

**Spatial sanity check.** At 30 km/h a 60 s cadence bounds the fallback's positional error at ~500 m at the moment transmission stops; at 120 s, ~1 km. The §12.1 30 s seed-to-live target then governs how fast the fallback is upgraded in place once the channel is healthy, independent of this cadence.

## 4. Proposed value

| Quantity | Proposed | Bound | Source |
|---|---|---|---|
| `LAST_KNOWN_WRITE_INTERVAL_MS` | **60 000 ms (60 s)** — the value the build has carried since W266, now declared once | [30 s, 120 s] | ceiling = 30 s Stopped/Inactive ping interval (Ledger §1 SD-015, PoC validation target); floor = 2-min Stopped threshold (`riderState.ts` defaults); composition per §2 above |

60 s sits in the middle of the band: it halves the floor's worst-case fallback age without approaching the ping cadence, and it coincides with the breadcrumb upsert and heartbeat intervals already running on the device, so it adds no new wake pattern. The stop write and the beacon raise are the only out-of-band writes, and both are ruled (A4 / slate 7).

## 5. Open item surfaced while confirming (not fixed here — outside W283's scope)

**Hard-purge scope does not match R3-36.** `supabase/functions/hard-purge-location` nulls `last_lat`, `last_long` and `phone` and sets `status = 'purged'`, but leaves `last_ping` (and, since W282, `beacon_active`) in place. Pillar III R3-36 and the Ledger's retention line say `last_lat`, `last_long` AND `last_ping` are deleted at T+4h. A timestamp without coordinates is not a position, so this is a scope gap rather than a privacy breach, but the purge extension already queued under R3-36 / W259 sequencing should add `last_ping = null, beacon_active = false`. No scheduler runs the purge today (the only `cron.schedule` is commented out in `supabase/tests/cron_verification.sql`), which is the known B2 deferral.

## 6. Senior PM confirmation

- [x] A4 cadence confirmed: 60 000 ms, on 2026-10-03, by Neil Stryjski
- [x] Bound confirmed: [30 s, 120 s] — noting the 30 s ceiling is anchored to the SD-015 PoC validation target (confirmed as proposed, 2026-10-03)
- [ ] TPM records the confirmed value in Pillar IV §12.2 (the Hands do not edit the Pillar) — proposed row text: `| A4 cadence bound | 60 s (LAST_KNOWN_WRITE_INTERVAL_MS = 60 000), bound [30 s, 120 s] | Confirmed 2026-10-03 (Senior PM). Ceiling = SD-015 30 s Stopped/Inactive ping interval (PoC validation target); floor = 2-min Stopped threshold. Brief: docs/rail3/decision_briefs/a4_last_known_cadence_decision_brief.md (W283). |`
