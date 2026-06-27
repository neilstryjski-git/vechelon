import { haversineDistanceM, LatLng } from './geo';

// Shared breadcrumb-trail decimation (W212 origin; extracted in W233 so the SENDER
// — the captain accumulating its OWN recent-window trail to broadcast — and the
// RECEIVER use one implementation instead of duplicating it).

// Append a fix only when it's at least this far from the last KEPT point. TS
// background-geo cadence is variable/event-driven, so distance-keyed decimation
// (not "every Nth fix") is the right bound — O(1) per fix and angular choppiness
// stays near the native ping spacing (accepted for the PoC).
export const BREADCRUMB_MIN_GAP_M = 20;

// Hard cap on the RECEIVER's accumulated trail so a long ride can't grow it without
// bound. On hit we COARSEN the older head (halve its resolution) rather than drop the
// oldest point, so the line keeps its session-start origin — just at lower fidelity.
export const BREADCRUMB_MAX_POINTS = 1500;

// How many recent decimated points the SENDER (captain) re-broadcasts each cycle so a
// receiver that was locked/late can fill the portion it missed. Bounded for PERFORMANCE
// (W233 / Sr PM): the whole trail is ~50KB; this window is ~8KB. It's a recent slice, so
// a rider locked LONGER than the window covers gets a jump for the un-covered older part
// (accepted: "only the portion since lock screen being sent"). At ~20m decimation, 250
// points ≈ 5km of route — roughly a 12-minute pocket at riding speed (longer when slower).
// This is the primary UAT performance/coverage tuning knob.
export const BREADCRUMB_WINDOW_POINTS = 250;

// Coarsen-the-head cap (pure). Returns the same array if under the cap.
export function capTrail(trail: LatLng[]): LatLng[] {
  if (trail.length <= BREADCRUMB_MAX_POINTS) return trail;
  const tail = trail.slice(-Math.floor(BREADCRUMB_MAX_POINTS / 2));
  const head = trail
    .slice(0, trail.length - tail.length)
    .filter((_, i) => i % 2 === 0);
  return [...head, ...tail];
}

// Distance-decimated append with capping. PURE: returns a NEW array when the point is
// kept, or the SAME array reference when skipped (too close) — so callers can cheaply
// detect "did the trail change?" by identity. Used by the SENDER to build its window
// and by the RECEIVER's legacy single-point fallback.
export function appendTrailPoint(trail: LatLng[], next: LatLng): LatLng[] {
  const last = trail[trail.length - 1];
  if (last && haversineDistanceM(last, next) < BREADCRUMB_MIN_GAP_M) return trail;
  return capTrail([...trail, next]);
}
