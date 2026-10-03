// W290 — unit tests for the pure breadcrumb segment rules (Ledger slate 9/10, item 17, C1; Pillar III
// R3-72). Runs via `npm test` (node --experimental-strip-types --test). Distance is the real
// haversine from geo.ts (the mapLogic precedent) so the 20 m decimation is exercised honestly.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { haversineDistanceM } from '../src/lib/geo.ts';
import {
  BREAK,
  BREADCRUMB_MAX_POINTS,
  isBreak,
  isPoint,
  normalisePath,
  pointCount,
  splitSegments,
  appendBreak,
  capTrail,
  capSegments,
  appendTipPoint,
  mergePriorAndSession,
  adoptIfLonger,
  isGapBreak,
  deriveBreadcrumbLiveness,
} from '../src/lib/breadcrumbSegments.ts';

// Points ~111 m apart along a meridian (0.001° lat) — comfortably above the 20 m gap.
const P = (i) => ({ lat: 45 + i * 0.001, lng: -73.5 });
const pts = (n, from = 0) => Array.from({ length: n }, (_, i) => P(from + i));
const MIN_GAP = 20;
const dist = haversineDistanceM;

test('isBreak / isPoint: the sentinel is exactly {brk:1}; a point needs finite numeric lat+lng', () => {
  assert.equal(isBreak(BREAK), true);
  assert.equal(isBreak({ brk: 1, extra: 'no' }), true, 'extra keys are tolerated on read');
  assert.equal(isBreak({ brk: true }), false);
  assert.equal(isBreak(null), false);
  assert.equal(isPoint(P(0)), true);
  assert.equal(isPoint({ lat: NaN, lng: 1 }), false);
  assert.equal(isPoint({ lat: '45', lng: 1 }), false);
  assert.equal(isPoint(BREAK), false, 'a sentinel is never a point');
  assert.deepEqual(Object.keys(BREAK), ['brk'], 'no identity, no timestamp on the sentinel');
});

test('normalisePath: non-array → []; garbage dropped; consecutive breaks collapse; leading/trailing breaks stripped', () => {
  assert.deepEqual(normalisePath(null), []);
  assert.deepEqual(normalisePath('x'), []);
  const raw = [BREAK, P(0), { lat: 'bad' }, P(1), BREAK, BREAK, { brk: 1 }, P(2), null, BREAK];
  assert.deepEqual(normalisePath(raw), [P(0), P(1), BREAK, P(2)]);
  assert.deepEqual(normalisePath([BREAK, BREAK]), []);
  // A pre-W290 flat path reads unchanged (point values copied, not referenced).
  const flat = pts(3);
  const n = normalisePath(flat);
  assert.deepEqual(n, flat);
  assert.notEqual(n[0], flat[0]);
});

test('pointCount excludes sentinels; splitSegments never joins across a break and drops empties', () => {
  const path = [P(0), P(1), BREAK, P(2), BREAK, P(3), P(4)];
  assert.equal(pointCount(path), 5);
  assert.deepEqual(splitSegments(path), [[P(0), P(1)], [P(2)], [P(3), P(4)]]);
  assert.deepEqual(splitSegments([]), []);
  assert.deepEqual(splitSegments([P(0), BREAK]), [[P(0)]]);
  // No point is synthesised across a break: the segments share no element.
  const segs = splitSegments([P(0), BREAK, P(5)]);
  assert.equal(segs.length, 2);
  assert.deepEqual(segs[0], [P(0)]);
  assert.deepEqual(segs[1], [P(5)]);
});

test('appendBreak is idempotent: same ref on an empty path and right after a break (two breaks collapse to one)', () => {
  const empty = [];
  assert.equal(appendBreak(empty), empty, 'a path never starts with a break');
  const one = [P(0)];
  const broken = appendBreak(one);
  assert.deepEqual(broken, [P(0), BREAK]);
  assert.equal(appendBreak(broken), broken, 'depart, rejoin, depart with nothing captured = ONE sentinel');
  assert.deepEqual(one, [P(0)], 'input not mutated');
});

test('capTrail is unchanged (coarsens the head, keeps the origin, same ref under the cap)', () => {
  const under = pts(BREADCRUMB_MAX_POINTS);
  assert.equal(capTrail(under), under);
  const over = pts(BREADCRUMB_MAX_POINTS + 100);
  const capped = capTrail(over);
  assert.ok(capped.length < over.length);
  assert.deepEqual(capped[0], over[0], 'session-start origin kept');
  assert.deepEqual(capped[capped.length - 1], over[over.length - 1]);
});

test('capSegments caps PER segment and preserves every break; same ref when nothing capped', () => {
  const small = [P(0), BREAK, P(1), P(2)];
  assert.equal(capSegments(small), small);
  const big = [...pts(BREADCRUMB_MAX_POINTS + 100), BREAK, P(5000), P(5001), P(5002)];
  const out = capSegments(big);
  const segs = splitSegments(out);
  assert.equal(segs.length, 2, 'the break survives');
  assert.ok(segs[0].length < BREADCRUMB_MAX_POINTS + 100, 'oversized segment coarsened');
  assert.deepEqual(segs[1], [P(5000), P(5001), P(5002)], 'the short segment after the break is untouched');
  assert.equal(pointCount(out), segs[0].length + 3);
});

test('appendTipPoint: same ref when the tip is closer than the gap; appends unconditionally right after a break; never reads the sentinel as a point', () => {
  const base = [P(0)];
  const close = { lat: 45.00001, lng: -73.5 }; // ~1 m
  assert.equal(appendTipPoint(base, close, MIN_GAP, dist), base);
  const far = appendTipPoint(base, P(1), MIN_GAP, dist);
  assert.deepEqual(far, [P(0), P(1)]);
  // After a break the NEXT point starts the new segment even if it is 1 m from the frozen tail —
  // the sentinel is not a point, and nothing is drawn between the two segments.
  const broken = appendBreak(base);
  const resumed = appendTipPoint(broken, close, MIN_GAP, dist);
  assert.deepEqual(resumed, [P(0), BREAK, close]);
  assert.deepEqual(splitSegments(resumed), [[P(0)], [close]]);
  // The appended point is a copy, never the caller's object.
  assert.notEqual(resumed[2], close);
});

test('mergePriorAndSession: never truncates prior; one break between; empties pass through by reference', () => {
  const prior = [P(0), P(1), P(2)];
  const session = [P(10), P(11)];
  const merged = mergePriorAndSession(prior, session);
  assert.deepEqual(merged, [P(0), P(1), P(2), BREAK, P(10), P(11)]);
  for (let i = 0; i < prior.length; i += 1) assert.deepEqual(merged[i], prior[i], `prior element ${i} identical by index`);
  assert.equal(mergePriorAndSession(prior, []), prior, 'nothing captured yet → the table path untouched');
  assert.equal(mergePriorAndSession([], session), session, 'leader departs before the first upsert → no leading break, nothing lost');
  // A prior that already ends in a break (normalisePath strips these, but be safe) → exactly one break.
  assert.deepEqual(mergePriorAndSession([P(0), BREAK], session), [P(0), BREAK, P(10), P(11)]);
  // A session carrying its own in-session gap break is preserved as-is.
  assert.deepEqual(mergePriorAndSession(prior, [P(10), BREAK, P(20)]), [P(0), P(1), P(2), BREAK, P(10), BREAK, P(20)]);
});

test('adoptIfLonger compares POINT counts (sentinels excluded); ties adopt the fetched path', () => {
  const local = [P(0), P(1), P(2)];
  const fetchedMoreSentinelsFewerPoints = [P(0), BREAK, P(1)];
  assert.equal(adoptIfLonger(local, fetchedMoreSentinelsFewerPoints), local);
  const tie = [P(0), BREAK, P(1), P(2)];
  assert.equal(adoptIfLonger(local, tie), tie, 'the table is authoritative on segmentation');
  const longer = [...local, P(3)];
  assert.equal(adoptIfLonger(local, longer), longer);
});

test('isGapBreak: a first fix is never a gap; the boundary is inclusive', () => {
  assert.equal(isGapBreak(null, 1000, 10), false);
  assert.equal(isGapBreak(0, 9, 10), false);
  assert.equal(isGapBreak(0, 10, 10), true);
  assert.equal(isGapBreak(0, 11, 10), true);
});

test('deriveBreadcrumbLiveness: departed wins; never-heard or past the Dark threshold → stale; tenant override honoured', () => {
  const T = 1_700_000_000_000;
  assert.equal(deriveBreadcrumbLiveness({ leaderDeparted: true, lastLeaderPingAtMs: T, nowMs: T, darkMinutes: 15 }), 'departed');
  assert.equal(deriveBreadcrumbLiveness({ leaderDeparted: false, lastLeaderPingAtMs: null, nowMs: T, darkMinutes: 15 }), 'stale');
  assert.equal(deriveBreadcrumbLiveness({ leaderDeparted: false, lastLeaderPingAtMs: T - 15 * 60_000 + 1, nowMs: T, darkMinutes: 15 }), 'live');
  assert.equal(deriveBreadcrumbLiveness({ leaderDeparted: false, lastLeaderPingAtMs: T - 15 * 60_000, nowMs: T, darkMinutes: 15 }), 'stale');
  assert.equal(deriveBreadcrumbLiveness({ leaderDeparted: false, lastLeaderPingAtMs: T - 6 * 60_000, nowMs: T, darkMinutes: 5 }), 'stale', 'tenant darkMinutes override');
  assert.equal(deriveBreadcrumbLiveness({ leaderDeparted: false, lastLeaderPingAtMs: T - 6 * 60_000, nowMs: T, darkMinutes: 15 }), 'live');
});
