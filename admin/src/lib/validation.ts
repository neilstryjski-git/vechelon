import gpxParser from 'gpxparser';
import QRCode from 'qrcode';

/**
 * Validates and parses a GPX string to extract coordinates.
 * Fulfills S0-04 / Decision D-11.
 */
export const parseGPXCoords = (gpxString: string) => {
  try {
    const gpx = new gpxParser();
    gpx.parse(gpxString);
    
    if (gpx.tracks.length === 0 || gpx.tracks[0].points.length === 0) {
      throw new Error('No track points found in GPX');
    }

    const track  = gpx.tracks[0];
    const points = track.points;
    
    return {
      // Robust name extraction: check metadata first, then track name
      name:           gpx.metadata?.name || track.name || null,
      start:          { lat: points[0].lat, lon: points[0].lon },
      end:            { lat: points[points.length - 1].lat, lon: points[points.length - 1].lon },
      points:         points.map(p => ({ lat: p.lat, lon: p.lon })),
      pointCount:     points.length,
      distance_km:    track.distance.total / 1000,
      elevation_gain: Math.round(track.elevation.pos ?? 0),
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
    // URL structure for guest join: [domain]/join/[rideId]
    const joinUrl = `${window.location.origin}/join/${rideId}`;
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
