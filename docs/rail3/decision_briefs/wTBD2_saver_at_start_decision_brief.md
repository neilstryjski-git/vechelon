# Decision Brief — wTBD2: Saver-at-start engine-start-to-first-fix (W279)

**Ticket:** W279 (Stride board 116, goal G34). **wTBDn substitution:** wTBD2 = W279, recorded 2026-09-13.
**Bedrock trace:** Rail 3 Ledger v1.1.3 §6 wTBD2, §8.3 D4, §8.4 wTBD2 scope extension, §12.2 measured values pending; Pillar III R3-43.
**Status:** MEASUREMENT PENDING — instrumentation merged; field runs not yet collected. Values below are placeholders until the distribution exists.
**Authority:** the Hands propose, the Senior PM confirms, the TPM records confirmed values in Pillar IV §12.2. Nothing in this brief enters Pillar III (unmeasured numbers do not enter Pillar III).

---

## 1. What is being measured

Time from the Transistorsoft engine's `start()` to the first accepted GPS fix, per engine run, under Android Battery Saver on versus off, cold versus warm start, per device and Android version. Every run that produced no fix at all is a first-class row carrying how long it ran.

**Out of scope by ruling (D4):** no tuning, fixing or working around the startup delay; no threshold selection by the Hands; no Pillar edits.

## 2. Instrumentation (merged under W279)

One `engine_first_fix` measurement row per engine run, written through the existing fire-and-forget sink (`analytics_events`, carrier `event_type = 'query_timeout'`, `metadata.m = 'rail3'`).

| Field | Where | Meaning |
|---|---|---|
| `metadata.value` | sink | delta in ms: engine start → first fix, or → stop for a `no_fix` run |
| `metadata.payload.outcome` | sink | `fix` or `no_fix` |
| `metadata.payload.saver_on` | sink | Battery Saver at `start()`; `null` = unreadable within 1.5 s |
| `metadata.payload.cold_start` | sink | `true` = first `ready()` in this process; `false` = warm re-start |
| `metadata.payload.engine_start_client_ts` | sink | device clock at engine start |
| `metadata.device`, `manufacturer`, `os_version`, `build_*` | sink (every row) | device matrix keys |
| `metadata.client_ts` | sink | device clock at row write; never `created_at` |

Source: `mobile/src/lib/engineFirstFix.ts` (pure tracker, unit-tested), `mobile/src/lib/bgGeo.ts` (sampling and reporting), `mobile/src/hooks/useFleetPositions.ts` (sink call). No coordinates are recorded.

**Timestamp discipline:** the start timestamp is taken after `start()` resolves unless a fix arrived while `start()` was still resolving, in which case the pre-start timestamp stands. Saver state is sampled once, at `start()`; a toggle during warm-up is deliberately not tracked (that is R3-47's domain, not this measurement's).

## 3. Run protocol

Field build off `rail3-integration` (staging-backed). Each cell needs several runs; report the distribution, not a sample.

| Dimension | Values |
|---|---|
| Battery Saver at start | ON / OFF (OFF is the control) |
| Start type | cold (fresh app launch) / warm (rejoin or second ride without relaunch) |
| Device | Pixel (stock) / Samsung One UI / secondary OEM if available; record model + Android version |
| Environment | indoor / outdoor (note it per run; it is not in the row) |
| Screen | lock within a few seconds of Join (the R3-37 case) |

Per run: note device, Android version, Saver state, cold/warm, indoor/outdoor, and the wall-clock time of Join so the row can be matched. A run with no fix: leave the ride after a stated wait (suggest 5, 10 and 20 minutes across runs) so the `no_fix` row carries a meaningful duration.

## 4. Extraction query (staging, Management API, service role)

```sql
select
  metadata->>'device'                         as device,
  metadata->>'os_version'                     as os_version,
  metadata->'payload'->>'saver_on'            as saver_on,
  metadata->'payload'->>'cold_start'          as cold_start,
  metadata->'payload'->>'outcome'             as outcome,
  count(*)                                    as runs,
  percentile_cont(0.5) within group (order by (metadata->>'value')::numeric)  as p50_ms,
  percentile_cont(0.9) within group (order by (metadata->>'value')::numeric)  as p90_ms,
  max((metadata->>'value')::numeric)          as max_ms,
  min((metadata->>'value')::numeric)          as min_ms
from analytics_events
where metadata->>'m' = 'rail3'
  and metadata->>'kind' = 'engine_first_fix'
  and metadata->>'ride_id' in (/* test ride ids */)
group by 1,2,3,4,5
order by 1,2,3,4,5;
```

Row-level listing for the appendix: same filter, select `metadata->>'ride_id'`, `metadata->>'session_id'`, `client_ts`, `value`, `payload`.

## 5. Results

_PENDING. Tables per cell (device × Android × Saver × cold/warm): runs, p50, p90, max, no-fix count with durations. Indoor/outdoor from the run notes._

## 6. Recommended values (proposals, both require Senior PM confirmation)

| Value | Proposal | Derivation |
|---|---|---|
| Startup clock ceiling, Android (slate 4 startup clock) | _PENDING_ | measured Saver-ON p90 (or max, stated) plus a stated margin |
| Steady-state fix-cadence threshold, Android (wTBD2 scope extension) | _PENDING_ | derived from the same run data: normal fix cadence once engaged, gated above the Saver-at-start window |

Both land in Pillar IV §12.2 on confirmation. iOS key stays reserved and empty (slate 4).

## 7. Senior PM confirmation

- [ ] Startup clock ceiling confirmed: ______ ms, on ______ (date), by Neil Stryjski
- [ ] Steady-state threshold confirmed: ______ ms, on ______ (date), by Neil Stryjski

Date source for this brief: stated explicitly at each edit (never the container clock). Instrumentation section written 2026-09-13.
