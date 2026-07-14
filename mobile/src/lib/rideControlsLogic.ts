// Pure ride-control rules (W175, Pillar II Feature 3). No react-native
// imports — runs under `node --test` (type-stripped) as well as in the app.
// Erasable-syntax TS only.

import type { LatLng } from './geo';

// The ride join URL — SAME shape the web mints (admin/src/lib/portalBase.ts
// buildRideUrl with source 'ridecard'): the QR encodes the Rails 1/2 join URL,
// never a new scheme (W175 pitfall). Slug comes from runtime env config
// (EXPO_PUBLIC_TENANT_SLUG) — no hardcoded tenant anywhere.
export function buildRideJoinUrl(rideId: string, tenantSlug: string): string {
  return `https://${tenantSlug}.vechelon.ca/ride/${rideId}?source=ridecard`;
}

// End Ride → Saved. MIRRORS the web flow (admin/src/store/useAppStore.ts
// endRide): status='saved' + actual_end=now + finish_coords from the device
// fix. BOTH status AND actual_end matter — hard-purge-location keys its 4-hour
// window off `status='saved' AND actual_end` (distinct from the 2-hour ad-hoc
// proximity safeguard below).
export interface EndRidePatch {
  status: 'saved';
  actual_end: string;
  finish_coords?: string;
}

export function endRidePatch(at: Date, coords: LatLng | null): EndRidePatch {
  const patch: EndRidePatch = { status: 'saved', actual_end: at.toISOString() };
  if (coords) {
    // Prod point convention is '(lng,lat)' — see admin/src/lib/maps.ts formatPoint.
    patch.finish_coords = `(${coords.lng},${coords.lat})`;
  }
  return patch;
}

export const AD_HOC_PROXIMITY_HOURS = 2;

// Scenario 12: the 2-hour proximity safeguard. A scheduled ride whose
// scheduled_start falls within ±2h of now means the Captain is probably about
// to duplicate a real ride — warn and require explicit confirmation. Both
// directions count: one starting soon, or one that should already be rolling.
export function adHocProximityConflict(
  scheduledStarts: Array<string | null>,
  nowMs: number,
  windowHours: number = AD_HOC_PROXIMITY_HOURS,
): boolean {
  const windowMs = windowHours * 3_600_000;
  return scheduledStarts.some((s) => {
    if (!s) return false;
    const t = Date.parse(s);
    if (Number.isNaN(t)) return false;
    return Math.abs(t - nowMs) <= windowMs;
  });
}

// A small curated list of friendly, distinct words for Ad Hoc ride names.
// A bare date collides the moment a captain starts more than one ride in a day
// (and reads the same on every card); a random word is unique enough at a
// glance and friendlier on the fleet list — e.g. "Ad Hoc Ride — Trampoline".
export const AD_HOC_RIDE_WORDS = [
  'Trampoline', 'Avalanche', 'Boomerang', 'Compass', 'Lantern', 'Meteor',
  'Cyclone', 'Galaxy', 'Harbour', 'Igloo', 'Jubilee', 'Kestrel',
  'Lighthouse', 'Mango', 'Nebula', 'Otter', 'Pelican', 'Quartz',
  'Rocket', 'Saffron', 'Tundra', 'Umbrella', 'Velvet', 'Walrus',
  'Yodel', 'Zephyr', 'Bumblebee', 'Cinnamon', 'Domino', 'Falcon',
  'Glacier', 'Hammock', 'Jigsaw', 'Kayak', 'Lollipop', 'Maverick',
] as const;

// Pick a random ride word. `rng` is injectable so the picker stays testable.
export function randomRideWord(rng: () => number = Math.random): string {
  return AD_HOC_RIDE_WORDS[Math.floor(rng() * AD_HOC_RIDE_WORDS.length)];
}

// Ad Hoc ride name (Pillar II Feature 3) — a friendly random word instead of a
// date stamp. The caller picks the word (via randomRideWord) and passes it so
// this stays a pure formatter.
export function adHocRideName(word: string): string {
  return `Ad Hoc Ride — ${word}`;
}

// The row an Ad Hoc creation inserts. Same schema/lifecycle as scheduled rides
// (pattern): type 'adhoc', Active immediately, start from the device GPS, no
// finish (so the Edge Indicator stays suppressed per R3-14), qr_code is the
// rendered PNG data-URL of the join URL — the same convention the web stores
// and displays via <img src>.
export interface AdHocRideRow {
  id: string;
  tenant_id: string;
  name: string;
  type: 'adhoc';
  status: 'active';
  start_coords: string;
  start_label: string;
  qr_code: string;
  created_by: string;
  // D80 — the account that STARTED this ride, recorded at the moment it starts. This is the
  // breadcrumb leader. It equals created_by here because starting an Ad Hoc ride and authoring
  // it are the same act by the same account; they are NOT the same concept, and a scheduled
  // ride started by someone other than its author will set these differently. Writing it
  // explicitly is the point: the leader is a recorded FACT, never re-derived from roster roles.
  started_by: string;
  actual_start: string;
}

// D80 — THE LEADER RULE, in one place: the ride captain whose route the breadcrumb draws is the
// account that STARTED the ride. Pure so it is testable and so both the reader (useBreadcrumb)
// and the writer (useFleetPositions breadcrumb upsert) resolve the leader through the SAME
// function — a reader/writer disagreement means either nobody writes the trail or two
// "captains" clobber the same ride_id row.
//
// created_by is the FALLBACK, not a synonym. It means "who authored the ride"; for every ride
// that exists today it happens to equal the starter (the ad-hoc creator both authors and starts
// it), which is why the D80 backfill is exact. It will diverge the moment a scheduled ride is
// started by someone other than its author — at which point started_by is already correct and
// this fallback simply stops being reached.
//
// Returns null when neither is present, and callers MUST fail closed on null (write nothing,
// draw nothing) rather than guess a leader — guessing a leader is the entire defect.
export function rideLeaderId(row: {
  started_by?: string | null;
  created_by?: string | null;
}): string | null {
  return row.started_by ?? row.created_by ?? null;
}

export function adHocRideRow(args: {
  rideId: string;
  tenantId: string;
  createdBy: string;
  coords: LatLng;
  qrDataUrl: string;
  at: Date;
  name: string;
}): AdHocRideRow {
  return {
    id: args.rideId,
    tenant_id: args.tenantId,
    name: args.name,
    type: 'adhoc',
    status: 'active',
    start_coords: `(${args.coords.lng},${args.coords.lat})`,
    start_label: 'Ad Hoc start',
    qr_code: args.qrDataUrl,
    created_by: args.createdBy,
    started_by: args.createdBy,
    actual_start: args.at.toISOString(),
  };
}
