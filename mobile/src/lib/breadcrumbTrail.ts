import { haversineDistanceM, LatLng } from './geo';

// Shared breadcrumb-trail decimation (W212 origin). Used by the SENDER — the captain
// accumulating its OWN full decimated route to UPSERT to rail3_breadcrumb (W234) — and by
// the RECEIVER appending the leader's live single-point broadcasts to extend the tip.

// Append a fix only when it's at least this far from the last KEPT point. TS
// background-geo cadence is variable/event-driven, so distance-keyed decimation
// (not "every Nth fix") is the right bound — O(1) per fix and angular choppiness
// stays near the native ping spacing (accepted for the PoC).
export const BREADCRUMB_MIN_GAP_M = 20;

// Hard cap on the RECEIVER's accumulated trail so a long ride can't grow it without
// bound. On hit we COARSEN the older head (halve its resolution) rather than drop the
// oldest point, so the line keeps its session-start origin — just at lower fidelity.
export const BREADCRUMB_MAX_POINTS = 1500;

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
// detect "did the trail change?" by identity. Used by the captain to build its route for
// the table upsert and by the receiver to extend the trail tip with live broadcasts.
export function appendTrailPoint(trail: LatLng[], next: LatLng): LatLng[] {
  const last = trail[trail.length - 1];
  if (last && haversineDistanceM(last, next) < BREADCRUMB_MIN_GAP_M) return trail;
  return capTrail([...trail, next]);
}
