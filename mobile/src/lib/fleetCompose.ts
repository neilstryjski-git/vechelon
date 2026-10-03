// W292 — pure fleet composition (Ledger C3 item 7; Pillar III R3-65 / R3-68 / R3-70; Pillar II
// §4.1 / R3-74). Erasable TypeScript, `import type` only — node's --experimental-strip-types needs
// full specifiers for runtime imports between pure modules, so the state derivation is INJECTED
// (precedent: beaconLogic.anchorBeaconedFleet). Exercised by tests/fleetCompose.test.mjs; the I/O
// binding is hooks/useFleetPositions.ts, which hands this module its pings, last-known rows,
// roster and departed marks and renders whatever comes back.
//
// This is the W262/W270 inline join — (pings ∪ lastKnown) ∩ roster, live wins when fresher — lifted
// out verbatim with exactly ONE new rule, the departed mark:
//
//   DEPARTURE BEATS SEED, NEVER REJOIN. A rider id carrying a departed mark is NEVER rendered from
//   stored last-known (a late persistLastKnown write that re-seeds coordinates onto a departed row
//   cannot resurrect them — R3-65 "no lastKnown seed resurrects a departed participant"). A LIVE
//   ping renders them only if its `ts` is STRICTLY newer than the mark (R3-68: a rejoin is a fresh
//   join, and its first ping is newer by construction). Both instants are the SAME sender device's
//   clock — `ts` is stamped by the departing/rejoining device, `departed_at` was written by it as
//   new Date().toISOString(), and the depart broadcast carries its Date.now() — so the comparison
//   needs no receiver-clock assumption. Collision case (same account live on a SECOND device):
//   two clocks; skew suppresses that device for at most |skew| + one ping interval, then its
//   monotonically increasing ts wins — self-healing; the rejoin clears the server mark anyway.
//
// 'departed' is NOT a TacticalState (A3): the ladder is not extended, deriveRenderState is not
// consulted for it, FleetParticipant gains no field. Departed riders simply are not in the fleet;
// the roster (rosterLogic.participationState) is where the mark is SHOWN. Never a deletion
// (R3-70): the row and its purge schedule are untouched by anything here.

import type { FleetParticipant, RideRole, TacticalState } from './roleVisibility';

export interface LivePing {
  riderId: string;
  state?: TacticalState;
  lat: number;
  lng: number;
  ts: number; // sender clock (device Date.now() / SDK fix.ts)
  receivedAtMs: number; // receiver clock
}

export interface LastKnownEntry {
  lat: number;
  lng: number;
  ts: number; // sender clock (ride_participants.last_ping)
}

// atMs: the DEPARTING device's clock — Date.parse(departed_at) or the depart broadcast's payload.ts.
// seenAtMs: THIS device's clock when the mark was learned (fetch completion / broadcast receipt).
export interface DepartedMark {
  atMs: number;
  seenAtMs: number;
}

export interface ComposeRosterEntry {
  role: RideRole;
  displayName: string;
  phone: string | null;
  participantStatus: string | null;
}

export interface ComposeInput {
  pings: Record<string, LivePing>;
  lastKnown: Record<string, LastKnownEntry>;
  roster: Record<string, ComposeRosterEntry>;
  departed: Record<string, DepartedMark>;
  nowMs: number;
  // Injected (no runtime import of ../state/riderState): (reported, lastPingAtMs, nowMs) => state.
  deriveState: (reported: TacticalState, lastPingAtMs: number | null, nowMs: number) => TacticalState;
}

export interface ComposeResult {
  fleet: FleetParticipant[];
  unknownLiveRiderIds: string[]; // live ping, no roster entry → the caller refetches the roster
  departedSuppressed: string[]; // ids dropped by the departed rule (evidence only, never coords)
}

// THE RULE: true iff the ping is strictly newer than the departure, both on the sender's clock.
export function pingBeatsDeparture(pingTs: number, mark: DepartedMark | undefined): boolean {
  return !mark || pingTs > mark.atMs;
}

export function composeFleet(input: ComposeInput): ComposeResult {
  const { pings, lastKnown, roster, departed, nowMs, deriveState } = input;
  const fleet: FleetParticipant[] = [];
  const unknownLiveRiderIds: string[] = [];
  const departedSuppressed: string[] = [];
  const riderIds = new Set([...Object.keys(pings), ...Object.keys(lastKnown)]);
  for (const riderId of riderIds) {
    const entry = roster[riderId];
    if (!entry) {
      // Only a LIVE ping from an unidentified rider signals a mid-ride joiner. A stored last-known
      // with no roster row is just a rider RLS hid from us — stay quiet; the §4.1 boundary holds.
      if (pings[riderId]) unknownLiveRiderIds.push(riderId);
      continue;
    }
    const mark = departed[riderId];
    let live: LivePing | undefined = pings[riderId];
    let lk: LastKnownEntry | undefined = lastKnown[riderId];
    if (mark) {
      lk = undefined; // departure beats seed, unconditionally
      if (live && !pingBeatsDeparture(live.ts, mark)) live = undefined; // an OLDER ping is pre-departure
      if (!live) {
        departedSuppressed.push(riderId);
        continue;
      }
    }
    // PRECEDENCE (W262): stored last-known is a FALLBACK; a FRESHER live ping must win so nobody
    // renders frozen at a rest stop after they roll again. Both ts are the same sender's clock.
    if (live && (!lk || live.ts >= lk.ts)) {
      fleet.push({
        riderId,
        displayName: entry.displayName,
        role: entry.role,
        phone: entry.phone,
        accountStatus: entry.participantStatus,
        // W174 receiver half: staleness past the dark threshold overrides the last self-reported
        // state; the marker stays greyed AT the last known position.
        state: deriveState(live.state ?? 'active', live.receivedAtMs, nowMs),
        position: { lat: live.lat, lng: live.lng },
        lastPingAt: live.ts,
        source: 'live',
      });
    } else if (lk) {
      fleet.push({
        riderId,
        displayName: entry.displayName,
        role: entry.role,
        phone: entry.phone,
        accountStatus: entry.participantStatus,
        // Last-known is written on the STOP transition (W261), carrying no self-reported state, so
        // render it as 'stopped' and let receiver staleness derive Dark as it ages.
        state: deriveState('stopped', lk.ts, nowMs),
        position: { lat: lk.lat, lng: lk.lng },
        lastPingAt: lk.ts,
        source: 'lastKnown',
      });
    }
  }
  return { fleet, unknownLiveRiderIds, departedSuppressed };
}

export interface LastKnownRow {
  account_id: string | null;
  last_lat: number | null;
  last_long: number | null;
  last_ping: string | null;
  departed_at: string | null;
}

// Splits a ride_participants last-known fetch into renderable seeds and departed marks. A row
// with departed_at set goes to `departed` and is NEVER a seed, even if coordinates survive on it
// (a late write after the departure's null-out) — that is the whole point of the durable mark.
// `usable` keeps the W271 meaning "rows that can render a marker"; `departedCount` is new evidence.
export function lastKnownFromRows(
  rows: ReadonlyArray<LastKnownRow>,
  seenAtMs: number,
): { lastKnown: Record<string, LastKnownEntry>; departed: Record<string, DepartedMark>; usable: number; departedCount: number } {
  const lastKnown: Record<string, LastKnownEntry> = {};
  const departed: Record<string, DepartedMark> = {};
  let usable = 0;
  let departedCount = 0;
  for (const row of rows) {
    if (row.account_id == null) continue;
    if (row.departed_at) {
      const atMs = Date.parse(row.departed_at);
      if (!Number.isNaN(atMs)) {
        departed[row.account_id] = { atMs, seenAtMs };
        departedCount += 1;
        continue;
      }
    }
    if (row.last_lat == null || row.last_long == null || !row.last_ping) continue;
    const ts = Date.parse(row.last_ping);
    if (Number.isNaN(ts)) continue;
    lastKnown[row.account_id] = { lat: row.last_lat, lng: row.last_long, ts };
    usable += 1;
  }
  return { lastKnown, departed, usable, departedCount };
}

// The fetch result is authoritative — EXCEPT a mark learned by broadcast AFTER the fetch STARTED
// survives (receiver clock vs receiver clock). Closes the pre-existing D87 race where a slow fetch
// that read the row before the departure landed re-materialised a just-departed rider, and lets a
// rejoin (fetch says "not departed", mark older than the fetch) drop the local mark.
export function mergeDepartedMarks(
  fetched: Record<string, DepartedMark>,
  local: Record<string, DepartedMark>,
  fetchStartedAtMs: number,
): Record<string, DepartedMark> {
  const next: Record<string, DepartedMark> = { ...fetched };
  for (const [id, mark] of Object.entries(local)) {
    if (mark.seenAtMs > fetchStartedAtMs && !(id in next)) next[id] = mark;
  }
  return next;
}
