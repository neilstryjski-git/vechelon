import { useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAppStore } from '../store/useAppStore';

/**
 * Tactical Real-time Hook for live ride monitoring.
 * Fulfills W23: Fleet Heartbeat & Rider State Machine.
 * Fulfills W15: Real-time Support Beacon loop.
 */
export const useRideRealtime = (rideId: string | undefined) => {
  const { 
    addActiveBeacon, 
    removeActiveBeacon, 
    processLocationUpdate,
    runHeartbeat 
  } = useAppStore();

  useEffect(() => {
    if (!rideId) return;

    // 1. Establish tactical channel for this specific ride
    const channel = supabase.channel(`ride:${rideId}`, {
      config: {
        broadcast: { self: true },
      },
    });

    // 2. SUPPORT BEACON LISTENERS
    channel
      .on('broadcast', { event: 'beacon_fired' }, ({ payload }: { payload: any }) => {
        console.log('Tactical Alert: Support Beacon Fired', payload);
        addActiveBeacon(payload.participantId);
      })
      .on('broadcast', { event: 'beacon_cancelled' }, ({ payload }: { payload: any }) => {
        console.log('Tactical Update: Beacon Cancelled', payload);
        removeActiveBeacon(payload.participantId);
      });

    // 3. LOCATION / STATE MACHINE LISTENERS
    channel
      .on('broadcast', { event: 'location_update' }, ({ payload }: { payload: any }) => {
        // payload: { id, displayName, lastLat, lastLong, beaconActive }
        processLocationUpdate(rideId, payload);
      });

    channel.subscribe();

    // 4. THE FLEET HEARTBEAT (Temporal Loop)
    // Runs every 10s to calculate temporal degradation (Stopped -> Inactive -> Dark)
    const heartbeatInterval = setInterval(() => {
      runHeartbeat(rideId);
    }, 10000);

    return () => {
      clearInterval(heartbeatInterval);
      supabase.removeChannel(channel);
    };
  }, [rideId, addActiveBeacon, removeActiveBeacon, processLocationUpdate, runHeartbeat]);
};
