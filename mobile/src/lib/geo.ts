// Pure geo helpers for the live fleet map (W172). No react-native imports —
// these run under `node --test` (type-stripped) as well as in the app.
//
// Erasable-syntax TypeScript only (no enums/namespaces): the unit tests load
// this file directly via Node's --experimental-strip-types.

export interface LatLng {
  lat: number;
  lng: number;
}

// Matches react-native-maps' Region shape without importing the library.
export interface MapRegion {
  latitude: number;
  longitude: number;
  latitudeDelta: number;
  longitudeDelta: number;
}

// Parses a Supabase POINT into {lat, lng}. Mirrors admin/src/lib/maps.ts
// parsePoint exactly — the prod convention is '(lng,lat)' (Postgres (x,y)),
// and PostgREST may surface either the string form or an {x,y} object.
export function parsePoint(
  point: string | { x?: number; y?: number; lat?: number; lng?: number; lon?: number } | null | undefined,
): LatLng | null {
  if (!point) return null;

  if (typeof point === 'string') {
    const match = point.match(/\((.*),(.*)\)/);
    if (!match) return null;
    const lng = parseFloat(match[1]);
    const lat = parseFloat(match[2]);
    if (Number.isNaN(lat) || Number.isNaN(lng)) return null;
    return { lat, lng };
  }

  const lng = point.x ?? point.lon ?? point.lng;
  const lat = point.y ?? point.lat;
  if (typeof lng === 'number' && typeof lat === 'number') {
    return { lat, lng };
  }
  return null;
}

const EARTH_RADIUS_M = 6371000;
const toRad = (deg: number) => (deg * Math.PI) / 180;
const toDeg = (rad: number) => (rad * 180) / Math.PI;

// Great-circle distance in metres (Haversine — Pillar II Feature 1: no routing
// engine, $0 cost).
export function haversineDistanceM(a: LatLng, b: LatLng): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(s)));
}

// W211 — Google Maps directions deep link to a destination. Universal https form:
// resolves to the Maps app when installed (browser otherwise), works cross-platform
// (future-proofs Rail 3b iOS over the Android-only `google.navigation:` scheme).
// `origin` is omitted so Maps routes from the device's CURRENT location; driving
// mode because the SAG responds in a vehicle. Pure + unit-testable.
export function buildMapsDirUrl(dest: LatLng): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${dest.lat},${dest.lng}&travelmode=driving`;
}

// Initial great-circle bearing from `from` to `to`, in degrees clockwise from
// true north, normalized to [0, 360).
export function initialBearingDeg(from: LatLng, to: LatLng): number {
  const φ1 = toRad(from.lat);
  const φ2 = toRad(to.lat);
  const Δλ = toRad(to.lng - from.lng);
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

// Whether a coordinate is inside the visible map region (with a small margin so
// the Edge Indicator doesn't flicker for points sitting exactly on the border).
export function regionContains(region: MapRegion, point: LatLng, marginFraction = 0.02): boolean {
  const latHalf = (region.latitudeDelta / 2) * (1 - marginFraction);
  const lngHalf = (region.longitudeDelta / 2) * (1 - marginFraction);
  return (
    Math.abs(point.lat - region.latitude) <= latHalf &&
    Math.abs(point.lng - region.longitude) <= lngHalf
  );
}

export interface EdgeAnchor {
  // Position of the indicator's centre, in the map view's pixel space.
  x: number;
  y: number;
  // Rotation for the arrow glyph, degrees clockwise (0 = pointing up/north
  // relative to the screen; the map is north-up so screen-up == north).
  rotationDeg: number;
}

// Places the Edge Indicator on the viewport boundary along the bearing from the
// viewport centre, inset from the edge so the arrow is fully visible.
// Pure 2D screen math: bearing 0° = up, 90° = right (north-up map).
export function edgeAnchorForBearing(
  bearingDeg: number,
  viewWidth: number,
  viewHeight: number,
  inset = 28,
): EdgeAnchor {
  const cx = viewWidth / 2;
  const cy = viewHeight / 2;
  const halfW = cx - inset;
  const halfH = cy - inset;
  const θ = toRad(bearingDeg);
  // Direction in screen space (y grows downward).
  const dx = Math.sin(θ);
  const dy = -Math.cos(θ);
  // Scale the direction vector until it hits the inset rectangle boundary.
  const scale = 1 / Math.max(Math.abs(dx) / halfW, Math.abs(dy) / halfH, 1e-9);
  return { x: cx + dx * scale, y: cy + dy * scale, rotationDeg: bearingDeg };
}
