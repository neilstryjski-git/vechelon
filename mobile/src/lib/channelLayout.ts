// W193 — the ONE place the app decides which Broadcast topic an event goes on and which
// topics a device joins. Pure (no React, no Supabase) so it is unit-tested, and mirrored by
// mobile/tests/denial/layout.mjs, which the server denial suite proves the same rules with.
//
// Four private topics per ride (migration 20261123000000_w193_role_scoped_channels.sql):
//
//   crew  riders' positions             receive: Captain, SAG              send: anyone on the ride
//   lead  Captain and SAG positions     receive: anyone on the ride        send: Captain, SAG
//   all   beacon, depart, ride ended    receive: on the ride + club admins send: anyone on the ride
//   sos   a beaconing rider's position  receive: on the ride + club admins send: rider with an active beacon
//
// The server enforces every row of that table. This file only keeps the app from asking for
// things it would be refused: a rider never subscribes to crew, and a rider's position goes
// to sos only while their own beacon is active (the server refuses it otherwise).

export type ChannelKind = 'crew' | 'lead' | 'all' | 'sos';
export const CHANNEL_KINDS: readonly ChannelKind[] = ['crew', 'lead', 'all', 'sos'];

// Kept local (not imported from the hooks) so this file stays dependency-free.
export const POSITION_EVENT_NAME = 'pos';

export function rideTopic(kind: ChannelKind, rideId: string): string {
  return `rail3:${kind}:${rideId}`;
}

// The single channel used before W193 and still used by the versionCode 4 build. The new
// app neither joins it nor sends on it; its policies are dropped at the cutover.
export function legacyRideTopic(rideId: string): string {
  return `rail3:ride:${rideId}`;
}

// ride_participants.role → does this device act as a leader on the channels?
export function isLeaderRole(role: string | null | undefined): boolean {
  return role === 'captain' || role === 'support';
}

// The topic kinds a device joins. Leaders hear riders (crew) and each other (lead); they do
// not join sos because crew already carries a beaconing rider's position.
export function receiveKinds(role: string | null | undefined): ChannelKind[] {
  return isLeaderRole(role) ? ['all', 'lead', 'crew'] : ['all', 'lead', 'sos'];
}

// The topic kinds a device publishes `event` on.
export function sendKinds(
  role: string | null | undefined,
  event: string,
  state: { beaconActive?: boolean } = {},
): ChannelKind[] {
  if (event !== POSITION_EVENT_NAME) return ['all'];
  if (isLeaderRole(role)) return ['lead'];
  return state.beaconActive ? ['crew', 'sos'] : ['crew'];
}

// Which topic kinds can carry `event` to a listener: where a receive handler must be bound.
export function listenKinds(event: string): ChannelKind[] {
  return event === POSITION_EVENT_NAME ? ['lead', 'sos', 'crew'] : ['all'];
}

// ── Send context ─────────────────────────────────────────────────────────────────────────
// restBroadcast is called from the location engine's handler and from non-React code, which
// know the ride and the rider but not the rider's role or beacon state. The ride screen
// publishes those here. Unknown ride or nothing set = an ordinary rider with no beacon, the
// least-exposed routing (crew only): a Captain whose role has not loaded yet is briefly
// invisible to riders rather than a rider being briefly visible to them.
interface SendContext {
  rideId: string;
  role: string | null;
  beaconActive: boolean;
}
let sendContext: SendContext | null = null;

export function setSendContext(next: SendContext | null): void {
  sendContext = next;
}

export function sendTopicsFor(rideId: string, event: string): string[] {
  const ctx = sendContext && sendContext.rideId === rideId ? sendContext : null;
  return sendKinds(ctx?.role ?? null, event, { beaconActive: ctx?.beaconActive ?? false }).map((k) =>
    rideTopic(k, rideId),
  );
}
