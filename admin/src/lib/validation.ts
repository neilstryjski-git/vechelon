import QRCode from 'qrcode';
import { buildRideUrl } from './portalBase';

interface GpxPoint { lat: number; lon: number; ele: number | null; }

const EARTH_RADIUS_M = 6_371_000;

// Great-circle distance between two lat/lon points, in metres.
function haversineMeters(a: GpxPoint, b: GpxPoint): number {
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLon = ((b.lon - a.lon) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

// First <name> that is a DIRECT child of the given parent element. Avoids
// accidentally picking up <author><name> (Strava puts the athlete name there).
function directChildName(parent: Element | null): string | null {
  if (!parent) return null;
  for (const child of Array.from(parent.children)) {
    if (child.localName === 'name') return child.textContent?.trim() || null;
  }
  return null;
}

/**
 * Validates and parses a GPX string to extract coordinates.
 * Fulfills S0-04 / Decision D-11.
 *
 * D44: rewritten to parse with the native DOMParser + getElementsByTagName
 * instead of the `gpxparser` library. Two reasons:
 *   1. gpxparser's queryDirectSelector has an undeclared-variable bug
 *      (`for(idx in ...)`) that throws "ReferenceError: idx is not defined"
 *      under ES-module strict mode whenever a parent contains >1 matching
 *      descendant — which every Strava export triggers, because Strava puts a
 *      <link> in both <author> and <metadata>. That crashed all Strava imports.
 *   2. getElementsByTagName matches by local name and is namespace-agnostic in
 *      every browser, unlike gpxparser's namespace-sensitive querySelector path.
 * Distance (haversine) and elevation gain (sum of positive deltas) are computed
 * locally; verified to match gpxparser's prior output exactly on real exports.
 * Falls back from <trkpt> (recorded activity) to <rtept> (planned route).
 */
export const parseGPXCoords = (gpxString: string) => {
  try {
    const doc = new DOMParser().parseFromString(gpxString, 'application/xml');

    // The native DOMParser does not throw on malformed XML — it returns a
    // document containing a <parsererror> node. Surface that distinctly rather
    // than letting it fall through to a misleading "no track data" message.
    if (doc.getElementsByTagName('parsererror').length > 0) {
      throw new Error('GPX file is not valid XML');
    }

    // Prefer recorded-activity track points; fall back to planned-route points.
    let kind: 'trk' | 'rte' = 'trk';
    let ptEls = Array.from(doc.getElementsByTagName('trkpt'));
    if (ptEls.length === 0) {
      kind = 'rte';
      ptEls = Array.from(doc.getElementsByTagName('rtept'));
    }
    if (ptEls.length === 0) {
      throw new Error('GPX file contains no track or route points');
    }

    const points: GpxPoint[] = [];
    for (const el of ptEls) {
      const lat = parseFloat(el.getAttribute('lat') ?? '');
      const lon = parseFloat(el.getAttribute('lon') ?? '');
      if (Number.isNaN(lat) || Number.isNaN(lon)) continue;
      const eleEl = el.getElementsByTagName('ele')[0];
      const ele = eleEl ? parseFloat(eleEl.textContent ?? '') : NaN;
      points.push({ lat, lon, ele: Number.isNaN(ele) ? null : ele });
    }
    if (points.length === 0) {
      throw new Error('GPX file contains no valid coordinates');
    }

    let distanceM = 0;
    let elevationGain = 0;
    for (let i = 1; i < points.length; i++) {
      distanceM += haversineMeters(points[i - 1], points[i]);
      const prev = points[i - 1].ele;
      const cur = points[i].ele;
      if (prev != null && cur != null && cur > prev) elevationGain += cur - prev;
    }

    const metadata = doc.getElementsByTagName('metadata')[0] ?? null;
    const container = doc.getElementsByTagName(kind)[0] ?? null;
    const name = directChildName(metadata) || directChildName(container) || null;

    return {
      name,
      start:          { lat: points[0].lat, lon: points[0].lon },
      end:            { lat: points[points.length - 1].lat, lon: points[points.length - 1].lon },
      points:         points.map(p => ({ lat: p.lat, lon: p.lon })),
      pointCount:     points.length,
      distance_km:    distanceM / 1000,
      elevation_gain: Math.round(elevationGain),
    };
  } catch (error) {
    console.error('GPX Parsing Error:', error);
    return null;
  }
};

/**
 * Generates a Data URL for a ride-specific QR code.
 * Fulfills S0-05 / Decision D-13.
 */
export const generateRideQR = async (rideId: string) => {
  try {
    // URL structure for guest join: [domain]([/portal])/ride/[rideId]?source=ridecard
    // Source param drives IA H2/H4 attribution per VMT-D-37 / W117 LOE.
    // /portal/ prefix preserved on legacy host until W136 cutover (see portalBase.ts).
    const joinUrl = buildRideUrl(rideId, 'ridecard');
    const qrDataUrl = await QRCode.toDataURL(joinUrl, {
      width: 400,
      margin: 2,
      color: {
        dark: '#000000',
        light: '#ffffff',
      },
    });
    return qrDataUrl;
  } catch (error) {
    console.error('QR Generation Error:', error);
    return null;
  }
};

/**
 * Validates the Open-Meteo response mapping.
 * Fulfills S0-06 / Decision D-20.
 */
export const validateWeatherMapping = (apiResponse: any) => {
  return {
    temp: apiResponse.current_weather?.temperature,
    conditionCode: apiResponse.current_weather?.weathercode,
    isDay: apiResponse.current_weather?.is_day === 1,
    high: apiResponse.daily?.temperature_2m_max?.[0],
    low: apiResponse.daily?.temperature_2m_min?.[0]
  };
};
