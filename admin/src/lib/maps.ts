import { supabase } from './supabase';
import { parseGPXCoords } from './validation';

/**
 * Encodes a series of coordinates into a Google Maps encoded polyline string.
 * Based on the algorithm: https://developers.google.com/maps/documentation/utilities/polylinealgorithm
 */
export const encodePolyline = (points: { lat: number; lon: number }[]) => {
  const encodeValue = (value: number) => {
    let res = Math.round(value * 1e5);
    res = res << 1;
    if (res < 0) res = ~res;
    let str = '';
    while (res >= 0x20) {
      str += String.fromCharCode((0x20 | (res & 0x1f)) + 63);
      res >>= 5;
    }
    str += String.fromCharCode(res + 63);
    return str;
  };

  let lastLat = 0;
  let lastLon = 0;
  let result = '';

  for (const point of points) {
    const lat = point.lat;
    const lon = point.lon;
    result += encodeValue(lat - lastLat);
    result += encodeValue(lon - lastLon);
    lastLat = lat;
    lastLon = lon;
  }

  return result;
};

/**
 * Generates a Google Static Maps URL for a given set of coordinates.
 * Fulfills G11 / Decision D-Design.
 */
export const getStaticMapUrl = (points: { lat: number; lon: number }[], options: { width?: number; height?: number; color?: string; weight?: number } = {}) => {
  const { 
    width = 600, 
    height = 300, 
    color = '0x006e35ff', // Racer Sportif Green
    weight = 4 
  } = options;

  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
  if (!apiKey) return null;

  // For complex routes, we encode the polyline to avoid URL length limits
  const encodedPath = encodePolyline(points);
  
  return `https://maps.googleapis.com/maps/api/staticmap?size=${width}x${height}&path=color:${color}|weight:${weight}|enc:${encodedPath}&key=${apiKey}`;
};

/**
 * Downloads a GPX file from Supabase storage and parses it into coordinates.
 */
export const fetchGpxPoints = async (filePath: string) => {
  const { data, error } = await supabase.storage
    .from('gpx-routes')
    .download(filePath);

  if (error) throw error;
  if (!data) return [];
  
  const text = await data.text();
  const parsed = parseGPXCoords(text);
  
  if (!parsed || !parsed.points) return [];
  
  // Convert {lat, lon} to {lat, lng} for Google Maps
  return parsed.points.map(p => ({ lat: p.lat, lng: p.lon }));
};

/**
 * Generates a Google Static Maps URL centred on a single pin location.
 * Used for meetup ride thumbnails and any ride without a GPX polyline.
 * Zoom 16 gives approximately 200m of context around the pin.
 */
export const getStaticMapPinUrl = (lat: number, lng: number, options: { width?: number; height?: number } = {}) => {
  const { width = 600, height = 300 } = options;

  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
  if (!apiKey) return null;

  return `https://maps.googleapis.com/maps/api/staticmap?center=${lat},${lng}&zoom=16&size=${width}x${height}&markers=color:red%7C${lat},${lng}&key=${apiKey}`;
};

/**
 * Parses a Supabase POINT string '(x,y)' or object {x, y} into a {lat, lng} object.
 * Note: Supabase POINT stores as (lon, lat) usually, following (x, y) convention.
 */
export const parsePoint = (point: string | { x?: number; y?: number; lat?: number; lng?: number; lon?: number } | null | undefined) => {
  if (!point) return null;
  
  // Handle string format '(lng,lat)'
  if (typeof point === 'string') {
    const match = point.match(/\((.*),(.*)\)/);
    if (!match) return null;
    return {
      lng: parseFloat(match[1]),
      lat: parseFloat(match[2]),
    };
  }
  
  // Handle object format {x, y} or {lon, lat}
  const lng = point.x ?? point.lon ?? point.lng;
  const lat = point.y ?? point.lat;
  
  if (typeof lng === 'number' && typeof lat === 'number') {
    return { lat, lng };
  }
  
  return null;
};

/**
 * Formats a {lat, lng} object into a Supabase POINT string '(lon,lat)'.
 */
export const formatPoint = (coords: { lat: number; lng: number }) => {
  if (!coords || typeof coords.lat !== 'number' || typeof coords.lng !== 'number') return null;
  return `(${coords.lng},${coords.lat})`;
};

/**
 * Returns a short-lived signed URL for a GPX file in the gpx-routes storage bucket.
 * Expires in 1 hour — enough for a rider to download before roll-out.
 */
export const getSignedGpxUrl = async (filePath: string): Promise<string> => {
  const { data, error } = await supabase.storage
    .from('gpx-routes')
    .createSignedUrl(filePath, 3600);
  if (error) throw error;
  return data.signedUrl;
};

/**
 * Gets a signed URL for a GPX file and triggers a browser download.
 * filename should not include the .gpx extension — it is appended automatically.
 */
export const downloadGpx = async (filePath: string, filename: string): Promise<void> => {
  const url = await getSignedGpxUrl(filePath);
  const res = await fetch(url);
  const blob = await res.blob();
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = objectUrl;
  a.download = `${filename}.gpx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(objectUrl);
};
