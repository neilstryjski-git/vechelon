// Role-gated visibility rules for the live fleet map (W172).
// Single source of truth for Pillar II §4.1 (Role Capability Matrix) — the
// screens consume these predicates instead of re-deriving the matrix, so the
// rules are unit-testable without rendering (tests/mapLogic.test.mjs).
//
// THE rule (§4.1 + pitfall): ROLE gates access, not account type. A Guest
// Rider and a Member Rider have identical capability. Icon rendering differs
// by tactical state only — role surfaces as a badge/label, account type only
// inside the Bottom Sheet.
//
// Erasable-syntax TypeScript only — loaded by Node's --experimental-strip-types.

// ride_participants.role enum (existing prod schema). 'support' is SAG.
export type RideRole = 'member' | 'captain' | 'support' | 'guest';

export type TacticalState = 'active' | 'stopped' | 'inactive' | 'dark' | 'dormant';

export interface FleetParticipant {
  riderId: string;
  displayName: string;
  role: RideRole;
  phone: string | null;
  accountStatus: string | null; // account_tenants.status, surfaced in the sheet
  state: TacticalState;
  position: { lat: number; lng: number } | null;
  lastPingAt: number | null; // epoch ms
}

const isCommand = (role: RideRole) => role === 'captain' || role === 'support';

// §4.1 MAP & VISIBILITY:
//   Captain/SAG → all riders. Rider/Guest → Captain + SAG icons only (own blue
//   dot is the OS location dot, not a marker, so self never appears here).
export function visibleParticipants(
  myRole: RideRole,
  myRiderId: string,
  fleet: FleetParticipant[],
): FleetParticipant[] {
  const others = fleet.filter((p) => p.riderId !== myRiderId);
  if (isCommand(myRole)) return others;
  return others.filter((p) => isCommand(p.role));
}

// §4.1 Bottom Sheet rows:
//   Captain → riders + SAG (not other captains; '—' in the matrix is self).
//   SAG     → riders + Captain.
//   Rider   → Captain + SAG only; "cannot tap other riders" (R3-10/R3-17).
export function canOpenSheet(myRole: RideRole, targetRole: RideRole): boolean {
  if (myRole === 'captain') return targetRole !== 'captain';
  if (myRole === 'support') return targetRole !== 'support';
  return isCommand(targetRole);
}

// §4.1 CONTACT: phone visibility and Dial follow the same gate as the sheet —
// Captain/SAG see any visible target's number; Riders see Captain/SAG numbers.
// Kept as a separate predicate so a future divergence (e.g. hiding numbers but
// allowing the sheet) only touches this function.
export function canSeePhone(myRole: RideRole, targetRole: RideRole): boolean {
  return canOpenSheet(myRole, targetRole);
}

// W211 §4.1 (new row): NAVIGATE to a rider (launch Maps directions) is SAG ONLY.
// A Captain rides a bike and won't run turn-by-turn; the SAG is the support
// VEHICLE whose job is reaching a stranded/Dark/dropped rider. Captain keeps Dial
// (canSeePhone), not Navigate. Riders never reach a peer sheet, so they never see
// it. Distinct from isCommand on purpose — this is narrower than Captain+SAG.
export function canNavigateToRider(myRole: RideRole): boolean {
  return myRole === 'support';
}

// §4.1: cluster expand on tap is Captain/SAG only. (Riders render at most
// Captain+SAG markers, so clusters are unreachable for them anyway — this
// predicate makes the gate explicit rather than incidental.)
export function canExpandCluster(myRole: RideRole): boolean {
  return isCommand(myRole);
}
