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

// W293: 'sleeping' (was 'dormant' — the engine's idle motion detection is now 'stationary').
export type TacticalState = 'active' | 'stopped' | 'inactive' | 'dark' | 'sleeping';

export interface FleetParticipant {
  riderId: string;
  displayName: string;
  role: RideRole;
  phone: string | null;
  accountStatus: string | null; // account_tenants.status, surfaced in the sheet
  state: TacticalState;
  position: { lat: number; lng: number } | null;
  lastPingAt: number | null; // epoch ms
  // W282: where `position` came from — presentation input for the §5.3 "stale under beacon"
  // overlay ONLY. Never a TacticalState (A3): the ladder is not extended by this.
  source?: 'live' | 'lastKnown';
}

const isCommand = (role: RideRole) => role === 'captain' || role === 'support';

// §4.1 MAP & VISIBILITY:
//   Captain/SAG → all riders. Rider/Guest → Captain + SAG icons only (own blue
//   dot is the OS location dot, not a marker, so self never appears here).
// W315 (Pillar II v1.2.0 §4.1, Feature 2): a Rider/Guest ALSO sees any rider on the ride whose
// Support Beacon is active, for as long as it is active. `beaconing` is the set of rider ids
// with an active beacon; the moment an id leaves it, that rider is gone from a Rider's map.
// This is display only: what a Rider's device RECEIVES is decided by the server (W193).
export function visibleParticipants(
  myRole: RideRole,
  myRiderId: string,
  fleet: FleetParticipant[],
  beaconing?: ReadonlySet<string>,
): FleetParticipant[] {
  const others = fleet.filter((p) => p.riderId !== myRiderId);
  if (isCommand(myRole)) return others;
  return others.filter((p) => isCommand(p.role) || Boolean(beaconing?.has(p.riderId)));
}

// W315: which sheet a tap opens.
//   'full'    — the §4.1 sheet (contact, dial, navigate, cancel), unchanged.
//   'reduced' — a Rider tapping ANOTHER RIDER whose beacon is active: name, position and
//               beacon state only. No phone, no dial; the phone is not even fetched (the
//               roster function sends a Rider only the leaders' numbers).
//   'none'    — no sheet.
export type SheetMode = 'full' | 'reduced' | 'none';
export function sheetMode(myRole: RideRole, targetRole: RideRole, targetBeaconActive: boolean): SheetMode {
  if (canOpenSheet(myRole, targetRole)) return 'full';
  if (!isCommand(myRole) && !isCommand(targetRole) && targetBeaconActive) return 'reduced';
  return 'none';
}

// W315: who the open sheet shows. `selected` is the participant as tapped (a snapshot);
// the sheet is drawn from the same rider in the CURRENT visible fleet so position and state
// stay live. If the rider is no longer visible to this viewer: a viewer entitled to the full
// sheet keeps the snapshot (a leader's phone and Dial survive a departure); anyone else gets
// no sheet. A visible rider who warrants no sheet for this viewer (a Rider's reduced sheet
// after the beacon clears) also gets none.
export function resolveSheetParticipant(
  myRole: RideRole,
  selected: FleetParticipant | null,
  visible: ReadonlyArray<FleetParticipant>,
  beaconActive: (riderId: string) => boolean,
): FleetParticipant | null {
  if (!selected) return null;
  const live = visible.find((p) => p.riderId === selected.riderId) ?? null;
  const who = live ?? selected;
  const mode = sheetMode(myRole, who.role, live != null && beaconActive(who.riderId));
  if (mode === 'full') return who;
  if (mode === 'reduced') return live;
  // 'none': a leader may still have opened it to cancel a beacon on a co-leader.
  return live && isCommand(myRole) && beaconActive(who.riderId) ? live : null;
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
// (canSeePhone), not Navigate. A Rider's only sheet on another rider is the reduced
// beacon sheet (W315), which has no Navigate. Distinct from isCommand on purpose — this is narrower than Captain+SAG.
export function canNavigateToRider(myRole: RideRole): boolean {
  return myRole === 'support';
}

// §4.1: cluster expand on tap is Captain/SAG only. (Riders render Captain + SAG and, since
// W315, any beaconing rider, never clustered — this
// predicate makes the gate explicit rather than incidental.)
export function canExpandCluster(myRole: RideRole): boolean {
  return isCommand(myRole);
}
