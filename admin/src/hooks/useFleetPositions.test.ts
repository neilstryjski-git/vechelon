import { describe, it, expect } from 'vitest';
import {
  deriveFleet,
  unknownRiderIds,
  isValidPositionPayload,
  isStalePing,
  FLEET_STALE_AFTER_MS,
  type PositionPayload,
  type RideRoster,
} from './useFleetPositions';

const roster: RideRoster = {
  cap: { role: 'captain', displayName: 'Cap', phone: '555-1', email: 'cap@club.test', participantStatus: 'active' },
  r1: { role: 'member', displayName: 'Rider One', phone: '555-2', email: 'r1@club.test', participantStatus: 'active' },
};

function ping(riderId: string, ts = 1000): PositionPayload {
  return { riderId, state: 'active', lat: 43.6, lng: -79.4, ts };
}

describe('isValidPositionPayload', () => {
  it('accepts a well-formed ping', () => {
    expect(isValidPositionPayload(ping('r1'))).toBe(true);
  });

  it('rejects missing riderId, non-numeric coords, and non-objects', () => {
    expect(isValidPositionPayload({ state: 'active', lat: 1, lng: 2, ts: 1 })).toBe(false);
    expect(isValidPositionPayload({ riderId: 'r1', lat: '1', lng: 2, ts: 1 })).toBe(false);
    expect(isValidPositionPayload({ riderId: '', lat: 1, lng: 2, ts: 1 })).toBe(false);
    expect(isValidPositionPayload(null)).toBe(false);
    expect(isValidPositionPayload('nope')).toBe(false);
  });
});

describe('deriveFleet', () => {
  it('joins pings to the roster (identity comes from the roster, not the payload)', () => {
    const fleet = deriveFleet({ cap: ping('cap'), r1: ping('r1') }, roster);
    const byId = Object.fromEntries(fleet.map((f) => [f.riderId, f]));
    expect(fleet).toHaveLength(2);
    expect(byId.cap.displayName).toBe('Cap');
    expect(byId.cap.role).toBe('captain');
    expect(byId.r1.phone).toBe('555-2');
    expect(byId.r1.position).toEqual({ lat: 43.6, lng: -79.4 });
  });

  it('drops a ping from a rider not in the roster', () => {
    const fleet = deriveFleet({ ghost: ping('ghost'), r1: ping('r1') }, roster);
    expect(fleet.map((f) => f.riderId)).toEqual(['r1']);
  });
});

describe('unknownRiderIds', () => {
  it('lists ping riders absent from the roster (mid-ride joiners)', () => {
    expect(unknownRiderIds({ ghost: ping('ghost'), r1: ping('r1') }, roster)).toEqual(['ghost']);
  });

  it('is empty when every ping resolves against the roster', () => {
    expect(unknownRiderIds({ cap: ping('cap'), r1: ping('r1') }, roster)).toEqual([]);
  });
});

describe('isStalePing', () => {
  it('is fresh within the threshold and stale beyond it', () => {
    const now = 100000;
    expect(isStalePing(now - (FLEET_STALE_AFTER_MS - 1), now)).toBe(false);
    expect(isStalePing(now - (FLEET_STALE_AFTER_MS + 1), now)).toBe(true);
  });

  it('treats a never-pinged rider (null) as stale', () => {
    expect(isStalePing(null, 100000)).toBe(true);
  });
});
