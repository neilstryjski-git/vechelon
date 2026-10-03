// W288 — pure roster rules (Ledger slate 17 / C2 item 23 / slate 8 / slate 11; Pillar II §4.1
// ROSTER; Pillar III R3-74, R3-32). Erasable TypeScript, no react-native imports: exercised by
// tests/rosterLogic.test.mjs under `node --experimental-strip-types --test`.
//
// The roster is the COMPLETE participant record for every role (§4.1); the fleet map is a
// declared partial projection of it (R3-74). Each row carries a participation STATE derived from
// a durable signal only — never from current ping state: a pocketed app rider is app-tracked, a
// guest or a member who has never opened the app is roster-only, and roster-only is a declared
// structural state, never a failure.

import type { RideRole } from './roleVisibility';

export type ParticipationState = 'app_tracked' | 'roster_only';

export interface RosterRowLike {
  accountId: string | null;
  // ride_participants.rail3_joined_at — set only by the in-app join path (W288). NOT joined_at.
  rail3JoinedAt: string | null;
}

// roleVisibility's isCommand is module-private; redefined here on the same two roles.
const isCommand = (r: RideRole): boolean => r === 'captain' || r === 'support';

// One binary state, widened population (item 23): no account OR never opened the app ⇒ roster-only.
// The input deliberately carries NO ping/position/state field — slate 17 forbids deriving from it.
export function participationState(row: RosterRowLike): ParticipationState {
  if (!row.accountId || !row.rail3JoinedAt) return 'roster_only';
  return 'app_tracked';
}

// Mark copy is ours to choose (item 23: "no committed text describes the mark itself"). Neutral,
// never a failure framing (R3-74).
export function participationLabel(state: ParticipationState): string {
  return state === 'app_tracked' ? 'App tracked' : 'Roster only';
}

// §4.1 ROSTER: every row is visible to every role — the single home for that envelope, kept as a
// function so a future widening or narrowing is a committed change here, not a page design.
export function rowVisibleTo(_myRole: RideRole, _row: { role: RideRole }): boolean {
  return true;
}

// Phone rule: leaders' (Captain, SAG) numbers are visible to EVERY roster viewer (slate 8,
// non-negotiable); every participant's number is visible to command (Captain/SAG) — a call sheet,
// so command also sees co-captains (deliberate divergence from the map's canSeePhone, which hides
// captain↔captain on the bottom sheet). Rider-to-rider contact stays parked (O-07).
export function phoneVisibleTo(myRole: RideRole, targetRole: RideRole): boolean {
  return isCommand(myRole) || isCommand(targetRole);
}

// Slate 11: the roster is available while the ride is live and through ride end, then closed; no
// historical browsing; no roster for rides the viewer is not on. 'created' is open to participants
// (the pre-start roster IS the call sheet). rides.status 'saved' = closed.
export function rosterOpenFor(rideStatus: string | null | undefined, iAmParticipant: boolean): boolean {
  if (!iAmParticipant) return false;
  return rideStatus === 'created' || rideStatus === 'active';
}
