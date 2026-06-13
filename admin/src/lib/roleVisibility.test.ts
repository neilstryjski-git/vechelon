import { describe, it, expect } from 'vitest';
import {
  visibleParticipants,
  canOpenSheet,
  canSeePhone,
  canExpandCluster,
  type FleetParticipant,
  type RideRole,
} from './roleVisibility';

function p(riderId: string, role: RideRole): FleetParticipant {
  return {
    riderId,
    displayName: riderId,
    role,
    phone: '555',
    accountStatus: 'active',
    state: 'active',
    position: { lat: 0, lng: 0 },
    lastPingAt: 1,
  };
}

const fleet: FleetParticipant[] = [
  p('cap', 'captain'),
  p('sag', 'support'),
  p('r1', 'member'),
  p('r2', 'guest'),
];

describe('visibleParticipants (§4.1 map visibility)', () => {
  it('captain sees every other rider', () => {
    const ids = visibleParticipants('captain', 'cap', fleet).map((x) => x.riderId).sort();
    expect(ids).toEqual(['r1', 'r2', 'sag']);
  });

  it('support (SAG) sees every other rider', () => {
    const ids = visibleParticipants('support', 'sag', fleet).map((x) => x.riderId).sort();
    expect(ids).toEqual(['cap', 'r1', 'r2']);
  });

  it('a rider sees only command roles (captain + SAG), never other riders', () => {
    const ids = visibleParticipants('member', 'r1', fleet).map((x) => x.riderId).sort();
    expect(ids).toEqual(['cap', 'sag']);
  });

  it('a guest rider has identical visibility to a member rider', () => {
    const ids = visibleParticipants('guest', 'r2', fleet).map((x) => x.riderId).sort();
    expect(ids).toEqual(['cap', 'sag']);
  });

  it('the operator role with a sentinel self id ("") sees the whole fleet', () => {
    // This is the race-control case: OPERATOR_ROLE=captain, OPERATOR_ID=''.
    const ids = visibleParticipants('captain', '', fleet).map((x) => x.riderId).sort();
    expect(ids).toEqual(['cap', 'r1', 'r2', 'sag']);
  });
});

describe('canOpenSheet / canSeePhone (§4.1 contact gate)', () => {
  it('captain can open riders and SAG, but not other captains', () => {
    expect(canOpenSheet('captain', 'member')).toBe(true);
    expect(canOpenSheet('captain', 'support')).toBe(true);
    expect(canOpenSheet('captain', 'captain')).toBe(false);
  });

  it('SAG can open riders and captain, but not other SAG', () => {
    expect(canOpenSheet('support', 'member')).toBe(true);
    expect(canOpenSheet('support', 'captain')).toBe(true);
    expect(canOpenSheet('support', 'support')).toBe(false);
  });

  it('a rider can only open command roles', () => {
    expect(canOpenSheet('member', 'captain')).toBe(true);
    expect(canOpenSheet('member', 'support')).toBe(true);
    expect(canOpenSheet('member', 'member')).toBe(false);
    expect(canOpenSheet('member', 'guest')).toBe(false);
  });

  it('phone visibility tracks the sheet gate', () => {
    expect(canSeePhone('captain', 'member')).toBe(true);
    expect(canSeePhone('captain', 'captain')).toBe(false);
    expect(canSeePhone('member', 'member')).toBe(false);
  });
});

describe('canExpandCluster', () => {
  it('is command-only', () => {
    expect(canExpandCluster('captain')).toBe(true);
    expect(canExpandCluster('support')).toBe(true);
    expect(canExpandCluster('member')).toBe(false);
    expect(canExpandCluster('guest')).toBe(false);
  });
});
