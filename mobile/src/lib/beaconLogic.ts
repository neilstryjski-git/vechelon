// Pure Support Beacon rules (W173). No react-native imports — these run under
// `node --test` (type-stripped) as well as in the app.
//
// The safety-critical invariant lives here: SD-011 — beacon_cancelled_by NULL
// is reserved for SYSTEM ERROR only. Every user-initiated cancel writes the
// actor's UUID (the rider's OWN uuid on self-cancel), so a null in the audit
// trail is always distinguishable from a failed write.
//
// Erasable-syntax TypeScript only (no enums/namespaces).

import type { RideRole } from './roleVisibility';

const isCommand = (role: RideRole) => role === 'captain' || role === 'support';

// §4.1 SUPPORT BEACON visibility: Captain/SAG see others' beacons; every rider
// sees their OWN beacon state. Other riders never see a beacon (F-07 is a
// PENDING Brain decision — Captain/SAG-only is the committed rule; W173
// pitfall: do not build rider-visible beacons).
export function canSeeBeacon(myRole: RideRole, myRiderId: string, beaconRiderId: string): boolean {
  if (beaconRiderId === myRiderId) return true;
  return isCommand(myRole);
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
