const fs = require('fs');
const gpxParser = require('gpxparser');

/**
 * Validates and parses a GPX string to extract coordinates.
 * This is a copy of the logic in admin/src/lib/validation.ts for verification.
 */
const parseGPXCoords = (gpxString) => {
  try {
    const gpx = new gpxParser();
    gpx.parse(gpxString);

    if (gpx.tracks.length === 0 || gpx.tracks[0].points.length === 0) {
      return null;
    }

    const track  = gpx.tracks[0];
    const points = track.points;

    return {
      name:           gpx.metadata?.name || track.name || null,
      start:          { lat: points[0].lat, lon: points[0].lon },
      end:            { lat: points[points.length - 1].lat, lon: points[points.length - 1].lon },
      points:         points.map(p => ({ lat: p.lat, lon: p.lon })),
      pointCount:     points.length,
      distance_km:    track.distance.total / 1000,
      elevation_gain: Math.round(track.elevation.pos || 0),
    };
  } catch (e) {
    console.error('[GPX Error]', e);
    return null;
  }
};

// Test with sample GPX
const gpxContent = fs.readFileSync('../productdocuments/COURSE_301884978.gpx', 'utf8');
const result = parseGPXCoords(gpxContent);

if (result) {
  console.log('✅ GPX Parse Successful');
  console.log('Name:', result.name);
  console.log('Start:', result.start);
  console.log('End:', result.end);
  console.log('Points:', result.pointCount);
  console.log('Distance:', result.distance_km.toFixed(2), 'km');
  
  // Verification logic
  const expectedStart = { lat: 43.65706999786198, lon: -79.4864589907229 };
  const expectedEnd = { lat: 43.10661993920803, lon: -79.07110995613039 };
  
  const startMatch = Math.abs(result.start.lat - expectedStart.lat) < 0.000001 && 
                     Math.abs(result.start.lon - expectedStart.lon) < 0.000001;
  const endMatch   = Math.abs(result.end.lat - expectedEnd.lat) < 0.000001 && 
                     Math.abs(result.end.lon - expectedEnd.lon) < 0.000001;
                     
  if (startMatch && endMatch) {
    console.log('✅ Coordinates match expected values');
  } else {
    console.error('❌ Coordinates mismatch!');
    process.exit(1);
  }
} else {
  console.error('❌ GPX Parse Failed');
  process.exit(1);
}
