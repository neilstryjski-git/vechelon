import { useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { useAppStore } from '../store/useAppStore';

/**
 * Hook to manage real-time ride events via Supabase Broadcast.
 * Fulfills W15: notification latency < 500ms.
 */
export const useRideRealtime = (rideId: string | null) => {
  const addActiveBeacon = useAppStore((state) => state.addActiveBeacon);
  const removeActiveBeacon = useAppStore((state) => state.removeActiveBeacon);
  const channelRef = useRef<any>(null);

  useEffect(() => {
    if (!rideId) return;

    // Initialize real-time channel with broadcast enabled
    const channel = supabase.channel(`ride:${rideId}`, {
      config: {
        broadcast: { self: true },
      },
    });

    channel
      .on('broadcast', { event: 'beacon_fired' }, ({ payload }: { payload: any }) => {
        console.log('Tactical Alert: Support Beacon Fired', payload);
        addActiveBeacon(payload.participantId);
      })
      .on('broadcast', { event: 'beacon_cancelled' }, ({ payload }: { payload: any }) => {
        console.log('Tactical Update: Beacon Cancelled', payload);
        removeActiveBeacon(payload.participantId);
      })
      .subscribe();

    channelRef.current = channel;

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
      }
    };
  }, [rideId, addActiveBeacon, removeActiveBeacon]);

  // Utility to fire a beacon (for the spike verification)
  const triggerBeacon = (participantId: string) => {
    if (channelRef.current) {
      channelRef.current.send({
        type: 'broadcast',
        event: 'beacon_fired',
        payload: { participantId, timestamp: new Date().toISOString() },
      });
    }
  };

  const cancelBeacon = (participantId: string) => {
    if (channelRef.current) {
      channelRef.current.send({
        type: 'broadcast',
        event: 'beacon_cancelled',
        payload: { participantId, timestamp: new Date().toISOString() },
      });
    }
  };

  return { triggerBeacon, cancelBeacon };
};
