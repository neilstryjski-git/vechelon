// W309 — the ONE place the denial suite learns how the app talks to the server.
//
// Pillar II §2 (Real-time Pattern) leaves the channel layout to the Hands' LLD, and the
// rider-facing roster path is W313's to build. The rules in rules.mjs are written against
// these functions, never against a literal topic or table, so when W193 / D94 / W313 change
// the layout they edit THIS file and the same rules prove the new behaviour.
// W313 moved the two roster readers to get_ride_roster.
//
// Today (before W193): one private channel per ride, `rail3:ride:<id>`, carrying every event
// to every affiliated club member. The roster is read straight off ride_participants.

export const LAYOUT = 'single-channel, club-wide (pre-W193)';

// Event names on the wire (mobile/src/hooks: useFleetPositions, useBeacons, useRideChannel).
export const EVENTS = { pos: 'pos', beacon: 'beacon', depart: 'depart', rideEnded: 'ride_ended' };

// The pre-W193 topic. It stays in allTopics() for good: if a later layout leaves it open,
// T1 / T2 / T9 must still catch it.
export function legacyTopic(rideId) {
  return `rail3:ride:${rideId}`;
}

// Topics a device in `role` subscribes to. role: 'rider' | 'captain' | 'sag' | 'admin'
// ('admin' = a club admin watching from Race Control, not a participant).
export function receiveTopics(role, rideId) {
  return [legacyTopic(rideId)];
}

// Topics a device in `role` publishes `event` on. `state.beaconActive` is true while the
// sender's own Support Beacon is active (§4.1: that rider's live position reaches riders then).
export function sendTopics(role, event, rideId, state = {}) {
  return [legacyTopic(rideId)];
}

// Every topic that exists for the ride, in any role. Used by the "cannot subscribe to ANY
// channel of that ride" rules.
export function allTopics(rideId) {
  const set = new Set([legacyTopic(rideId)]);
  for (const role of ['rider', 'captain', 'sag', 'admin']) {
    for (const t of receiveTopics(role, rideId)) set.add(t);
    for (const ev of Object.values(EVENTS)) {
      for (const t of sendTopics(role, ev, rideId, { beaconActive: true })) set.add(t);
      for (const t of sendTopics(role, ev, rideId, { beaconActive: false })) set.add(t);
    }
  }
  return [...set];
}

// The old public web channel. Its only users (admin useRideRealtime, lib/simulation) were dead
// code and were removed in W310. Kept here for the advisory probe T15.2 only.
export function publicWebTopic(rideId) {
  return `ride:${rideId}`;
}
export const PUBLIC_WEB_POSITION_EVENT = 'location_update';

// The roster as a RIDER's device reads it. Returns rows of
//   { account_id, name, role, joined, departed, phone }
// W313: the server function RosterScreen.tsx calls. One function serves every role; the server
// decides which phones the caller may have.
const fromRosterFn = (r) => ({
  participant_id: r.participant_id,
  account_id: r.account_id,
  name: r.name,
  role: r.role,
  participation: r.participation,
  joined: r.participation === 'app_tracked' || (r.participation === 'departed' && r.rail3_joined_at != null),
  departed: r.participation === 'departed',
  phone: r.phone,
});
export async function riderRoster(client, rideId) {
  const { data, error } = await client.rpc('get_ride_roster', { p_ride_id: rideId });
  if (error) return { rows: [], error };
  return { rows: (data ?? []).map(fromRosterFn), error: null, raw: data ?? [] };
}

// The roster as a Captain's or SAG's device reads it: every participant, guests included,
// with a phone. Returns rows of { participant_id, account_id, name, phone }. Same function.
export async function leaderRoster(client, rideId) {
  return riderRoster(client, rideId);
}
