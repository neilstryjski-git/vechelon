import { describe, it, expect } from 'vitest';

import {
  appendLeaderFix,
  haversineM,
  BREADCRUMB_MIN_GAP_M,
  BREADCRUMB_MAX_POINTS,
  type LatLng,
} from './useBreadcrumb';

// A degree of latitude is ~111.32 km, so this is a convenient "metres → Δlat".
const M_PER_DEG_LAT = 111_320;
const base: LatLng = { lat: 43.6572651, lng: -79.4863787 };
const north = (m: number): LatLng => ({ lat: base.lat + m / M_PER_DEG_LAT, lng: base.lng });

describe('haversineM', () => {
  it('measures a short northward hop to ~the expected metres', () => {
    const d = haversineM(base, north(30));
    expect(d).toBeGreaterThan(28);
    expect(d).toBeLessThan(32);
  });
});

describe('appendLeaderFix', () => {
  it('appends the first point unconditionally', () => {
    const out = appendLeaderFix([], base);
    expect(out).toEqual([base]);
  });

  it('decimates a fix within the gap (returns the SAME array — no re-render)', () => {
    const trail = [base];
    const out = appendLeaderFix(trail, north(BREADCRUMB_MIN_GAP_M - 5));
    expect(out).toBe(trail); // identity — caller skips setState
  });

  it('keeps a fix beyond the gap', () => {
    const trail = [base];
    const out = appendLeaderFix(trail, north(BREADCRUMB_MIN_GAP_M + 5));
    expect(out).not.toBe(trail);
    expect(out).toHaveLength(2);
  });

  it('caps the array and coarsens the head on overflow, preserving the origin', () => {
    // Build a trail already at the cap, each point well beyond the gap.
    let trail: LatLng[] = [];
    for (let i = 0; i < BREADCRUMB_MAX_POINTS; i++) trail = appendLeaderFix(trail, north(i * 30));
    expect(trail).toHaveLength(BREADCRUMB_MAX_POINTS);
    const origin = trail[0];

    // One more push trips the cap → length shrinks, origin survives (coarsened head).
    const out = appendLeaderFix(trail, north(BREADCRUMB_MAX_POINTS * 30));
    expect(out.length).toBeLessThan(BREADCRUMB_MAX_POINTS);
    expect(out[0]).toEqual(origin);
    // The newest fix is retained at the tail.
    expect(out[out.length - 1]).toEqual(north(BREADCRUMB_MAX_POINTS * 30));
  });
});
