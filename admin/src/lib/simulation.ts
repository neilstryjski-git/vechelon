import { supabase } from './supabase';

/**
 * Tactical simulation utility for testing the Rider State Machine.
 * Broadcasts mock location updates to a specific ride channel.
 */
export const simulateRiderPing = async (rideId: string, riderData: {
  id: string;
  displayName: string;
  lat: number;
  long: number;
}) => {
  const channel = supabase.channel(`ride:${rideId}`);
  
  await channel.send({
    type: 'broadcast',
    event: 'location_update',
    payload: {
      id: riderData.id,
      displayName: riderData.displayName,
      lastLat: riderData.lat,
      lastLong: riderData.long,
      beaconActive: false
    }
  });
};

/**
 * Simulation Runner for a fleet of mock riders.
 */
export const startFleetSimulation = (rideId: string, count: number = 5) => {
  const riders = Array.from({ length: count }).map((_, i) => ({
    id: `sim-rider-${i}`,
    displayName: `Rider ${i + 1}`,
    lat: 43.65 + (Math.random() * 0.01),
    long: -79.38 + (Math.random() * 0.01)
  }));

  const interval = setInterval(() => {
    riders.forEach(rider => {
      // Small jitter to simulate movement
      rider.lat += (Math.random() - 0.5) * 0.0001;
      rider.long += (Math.random() - 0.5) * 0.0001;
      
      simulateRiderPing(rideId, rider);
    });
  }, 5000); // 5s active ping

  return () => clearInterval(interval);
};
