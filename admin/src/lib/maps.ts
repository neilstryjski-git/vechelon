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
 * Parses a Supabase POINT string '(x,y)' into a {lat, lng} object.
 * Note: Supabase POINT stores as (lon, lat) usually, following (x, y) convention.
 */
export const parsePoint = (pointStr: string | null) => {
  if (!pointStr) return null;
  const match = pointStr.match(/\((.*),(.*)\)/);
  if (!match) return null;
  return {
    lng: parseFloat(match[1]),
    lat: parseFloat(match[2]),
  };
};

/**
 * Formats a {lat, lng} object into a Supabase POINT string '(lon,lat)'.
 */
export const formatPoint = (coords: { lat: number; lng: number }) => {
  return `(${coords.lng},${coords.lat})`;
};
