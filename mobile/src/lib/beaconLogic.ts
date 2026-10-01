// Pure Support Beacon rules (W173). No react-native imports — these run under
// `node --test` (type-stripped) as well as in the app.
//
// The safety-critical invariant lives here: SD-011 — beacon_cancelled_by NULL
// is reserved for SYSTEM ERROR only. Every user-initiated cancel writes the
// actor's UUID (the rider's OWN uuid on self-cancel), so a null in the audit
// trail is always distinguishable from a failed write.
//
// Erasable-syntax TypeScript only (no enums/namespaces).

import type { FleetParticipant, RideRole, TacticalState } from './roleVisibility';

const isCommand = (role?: RideRole) => role === 'captain' || role === 'support';

// §4.1 SUPPORT BEACON visibility (amended W206, ratified 2026-06-15):
//  - every rider always sees their OWN beacon state;
//  - Captain/SAG see ALL beacons (command overview);
//  - a COMMAND rider's beacon (a Captain/SAG SOS) is visible to EVERYONE. The
//    Captain/SAG marker is already on every rider's map (§4.1), so surfacing
//    their SOS *state change* on that marker is a safety extension, not new
//    peer visibility.
// PEER (member→member) beacons remain hidden from other riders — F-07 (full
// peer-beacon visibility) is still a PENDING Brain decision and is NOT opened
// here. `beaconOwnerRole` is optional for back-compat; absent it, a non-command
// viewer only sees their own beacon (the pre-W206 behavior).
export function canSeeBeacon(
  myRole: RideRole,
  myRiderId: string,
  beaconRiderId: string,
  beaconOwnerRole?: RideRole,
): boolean {
  if (beaconRiderId === myRiderId) return true; // own beacon — every role
  if (isCommand(myRole)) return true; // Captain/SAG see all beacons
  return isCommand(beaconOwnerRole); // W206: everyone sees a Captain/SAG SOS
}

// §4.1: cancel own beacon — every role; cancel ANY rider's beacon — Captain/SAG
// (R3-22 names SAG explicitly; the matrix grants Captain the same).
export function canCancelBeacon(
  myRole: RideRole,
  myRiderId: string,
  beaconRiderId: string,
): boolean {
  if (beaconRiderId === myRiderId) return true;
  return isCommand(myRole);
}

export interface BeaconCancelPatch {
  beacon_cancelled_by: string;
  beacon_cancelled_at: string;
}

// Builds the audit-trail UPDATE for a user cancel. THROWS on a missing actor
// rather than ever emitting null (SD-011): a cancel without a known actor is a
// client bug and must fail loudly, not poison the audit trail with the
// system-error sentinel. Self-cancel passes the rider's own UUID (R3-21);
// Captain/SAG cancel passes theirs (R3-20).
export function buildCancelPatch(actorId: string | null | undefined, at: Date): BeaconCancelPatch {
  if (!actorId) {
    throw new Error(
      'SD-011 violation: beacon cancel requires the acting user UUID — null is reserved for system error',
    );
  }
  return { beacon_cancelled_by: actorId, beacon_cancelled_at: at.toISOString() };
}

// D-55 / DoD-05 latency instrumentation: delta between the sender's trigger
// timestamp (carried in the Broadcast payload) and local receipt. Across two
// devices this includes clock skew, so the SENDER's own self-echo (broadcast
// self: true) is the skew-free measure; receiver-side deltas are indicative.
// Negative skew artifacts clamp to 0 so logs/aggregates stay sane.
export function latencyDeltaMs(sentAtMs: number, receivedAtMs: number): number {
  if (!Number.isFinite(sentAtMs) || !Number.isFinite(receivedAtMs)) return 0;
  return Math.max(0, receivedAtMs - sentAtMs);
}

// ---------------------------------------------------------------------------------------------
// W282 (Ledger slate 7 / A4) — beacon CURRENT STATE lives on ride_participants.beacon_active.
// beacon_alerts stays the R3-19..22 AUDIT record (history); it is never replayed into state.
// ---------------------------------------------------------------------------------------------

export interface BeaconRaisePatch {
  beacon_active: true;
  last_lat?: number;
  last_long?: number;
  last_ping?: string;
}

// A4: the raise forces a last-known write in the SAME update as the flag, so the alert always
// has a position to anchor it. No coordinates yet (beacon before the first fix) → flag only and
// last_* untouched: self still renders at the OS dot (D79) and the fleet falls back as before.
export function buildRaisePatch(
  coords: { lat: number; lng: number } | null,
  at: Date,
): BeaconRaisePatch {
  if (!coords) return { beacon_active: true };
  return { beacon_active: true, last_lat: coords.lat, last_long: coords.lng, last_ping: at.toISOString() };
}

// Cancel clears the flag ONLY — last_* stay (they are the fleet's fallback; the Hard Purge owns
// their deletion, R3-36).
export const BEACON_CLEAR_PATCH = { beacon_active: false } as const;

// Where a rendered participant's position came from. Presentation input for the §5.3 overlay
// only — NEVER a TacticalState (A3: the ladder has five rungs and 'stale' is not one of them).
export type PositionSource = 'live' | 'lastKnown';

// §5.3 "Stale under beacon": the beacon is anchored at the rider's last-known (no live fix yet)
// — shown on Captain/SAG surfaces only, and only in coincidence with Beacon Active. Cleared the
// moment a live fix supersedes (source flips to 'live'). Never general fleet state.
export function isStaleUnderBeacon(
  source: PositionSource | undefined,
  beaconActive: boolean,
  viewerRole: RideRole, // required and FAIL-CLOSED: a caller that cannot name the viewer gets no overlay
): boolean {
  if (!beaconActive || source !== 'lastKnown') return false;
  return isCommand(viewerRole);
}

// Current-state record for one active beacon. `beaconId` is the beacon_alerts audit row id when
// this device saw the trigger (live or own); NULL when adopted from the participant flag — the
// flag carries no id, and cancel is keyed by rider, not id (see useBeacons). `anchor` is the
// raise-time last-known (or the seed's last_*), the R3-55 recovery position.
export interface ActiveBeacon {
  beaconId: string | null;
  riderId: string;
  // Live / own records: the trigger's sentAt. Flag-adopted records: a LOWER BOUND only — the
  // row's last_ping, which the 60 s throttle keeps overwriting after the raise — or the seed
  // read time when the row has no last_ping. Nothing ranks beacons by it; the merge's grace
  // check reads it only on live records.
  triggeredAt: number;
  anchor: { lat: number; lng: number; ts: number } | null;
}

// Grace for a LIVE trigger that landed just before/while a seed read ran: the sender's clock and
// the concurrent own-row flag write can both trail the read start by a few seconds.
export const SEED_RACE_GRACE_MS = 10_000;

// Merge a flag seed into live state. The seed is AUTHORITATIVE for ABSENCE — a beacon that was
// settled server-side while this device was blind is dropped and NEVER re-raised (no history
// replay) — with two race exceptions: (a) a live record newer than the read start (grace) is
// kept even if the seed missed it; (b) a seed row for a rider this device cancelled AFTER the
// read started is not re-added (seed racing a live cancel). Where both exist, the live record's
// beaconId wins and the seed supplies the anchor it lacks.
// `protectedRiderIds`: local records the seed may NOT drop — the own beacon whose raise-time
// flag write is known to have failed (so the row still says false while the alert is live);
// useBeacons keeps re-asserting that write and lifts the protection once it lands.
export function mergeSeededBeacons(
  prev: Record<string, ActiveBeacon>,
  seed: Record<string, ActiveBeacon>,
  seedStartedAtMs: number,
  settledAtMs: Record<string, number>,
  graceMs: number = SEED_RACE_GRACE_MS,
  protectedRiderIds: ReadonlyArray<string> = [],
): Record<string, ActiveBeacon> {
  const next: Record<string, ActiveBeacon> = {};
  for (const riderId of Object.keys(seed)) {
    const settled = settledAtMs[riderId];
    if (settled !== undefined && settled > seedStartedAtMs) continue;
    const live = prev[riderId];
    next[riderId] = live
      ? {
          ...seed[riderId],
          ...live,
          beaconId: live.beaconId ?? seed[riderId].beaconId,
          anchor: live.anchor ?? seed[riderId].anchor,
        }
      : seed[riderId];
  }
  for (const riderId of Object.keys(prev)) {
    if (riderId in next) continue;
    if (protectedRiderIds.includes(riderId) || prev[riderId].triggeredAt >= seedStartedAtMs - graceMs) {
      next[riderId] = prev[riderId];
    }
  }
  return next;
}

export interface AnchorRosterEntry {
  displayName: string;
  role: RideRole;
  phone: string | null;
  participantStatus: string | null;
}

// R3-55, render half: anchor a beaconed rider at the RAISE-TIME last-known carried by the
// beacon record whenever that is newer than the position the fleet holds (the fleet's own
// last-known fetch runs on mount/resume, not on channel activation, so after a foreground
// reconnect it can lag the raise). Also surfaces a beaconed rider the fleet does not list at
// all (no ping, no fetched row yet) from the roster, as last-known. A LIVE fix newer than the
// anchor always wins — the overlay clears the moment live supersedes. Riders absent from the
// roster are skipped: RLS hid them, the §4.1 boundary holds.
export function anchorBeaconedFleet(
  fleet: ReadonlyArray<FleetParticipant>,
  beacons: Record<string, ActiveBeacon>,
  rosterEntry: (riderId: string) => AnchorRosterEntry | null,
  stateFor: (anchorTs: number) => TacticalState,
): FleetParticipant[] {
  const out: FleetParticipant[] = fleet.map((p) => {
    const anchor = beacons[p.riderId]?.anchor;
    if (!anchor) return p;
    if (p.lastPingAt != null && p.lastPingAt >= anchor.ts) return p; // fleet is at least as fresh
    return {
      ...p,
      state: stateFor(anchor.ts),
      position: { lat: anchor.lat, lng: anchor.lng },
      lastPingAt: anchor.ts,
      source: 'lastKnown',
    };
  });
  const listed = new Set(out.map((p) => p.riderId));
  for (const riderId of Object.keys(beacons)) {
    const anchor = beacons[riderId]?.anchor;
    if (!anchor || listed.has(riderId)) continue;
    const entry = rosterEntry(riderId);
    if (!entry) continue;
    out.push({
      riderId,
      displayName: entry.displayName,
      role: entry.role,
      phone: entry.phone,
      accountStatus: entry.participantStatus,
      state: stateFor(anchor.ts),
      position: { lat: anchor.lat, lng: anchor.lng },
      lastPingAt: anchor.ts,
      source: 'lastKnown',
    });
  }
  return out;
}
