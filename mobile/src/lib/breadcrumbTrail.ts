import { haversineDistanceM, LatLng } from './geo';

// Shared breadcrumb-trail decimation (W212 origin). Used by the SENDER — the captain
// accumulating its OWN full decimated route to UPSERT to rail3_breadcrumb (W234) — and by
// the RECEIVER appending the leader's live single-point broadcasts to extend the tip.

// Append a fix only when it's at least this far from the last KEPT point. TS
// background-geo cadence is variable/event-driven, so distance-keyed decimation
// (not "every Nth fix") is the right bound — O(1) per fix and angular choppiness
// stays near the native ping spacing (accepted for the PoC).
export const BREADCRUMB_MIN_GAP_M = 20;

// W290: the cap moved to the dependency-free pure module (breadcrumbSegments.ts) so node can test
// it beside the segment rules; re-exported here for existing importers.
export { capTrail, BREADCRUMB_MAX_POINTS } from './breadcrumbSegments';
import { capTrail } from './breadcrumbSegments';

// Distance-decimated append with capping. PURE: returns a NEW array when the point is
// kept, or the SAME array reference when skipped (too close) — so callers can cheaply
// detect "did the trail change?" by identity. Used by the captain to build its route for
// the table upsert and by the receiver to extend the trail tip with live broadcasts.
export function appendTrailPoint(trail: LatLng[], next: LatLng): LatLng[] {
  const last = trail[trail.length - 1];
  if (last && haversineDistanceM(last, next) < BREADCRUMB_MIN_GAP_M) return trail;
  return capTrail([...trail, next]);
}
