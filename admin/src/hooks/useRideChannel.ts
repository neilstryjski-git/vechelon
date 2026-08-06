import { useEffect, useState } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';

import { supabase } from '../lib/supabase';

// Supabase realtime subscribe lifecycle states.
export type RideChannelStatus =
  | 'SUBSCRIBED'
  | 'TIMED_OUT'
  | 'CLOSED'
  | 'CHANNEL_ERROR'
  | null;

// The Rail 3 live-ride Broadcast topic. Distinct `rail3:ride:` prefix (NOT the web
// app's pre-existing public `ride:<id>` topic in useRideRealtime.ts) so the two
// never collide. (W170 / ported for W190.)
export function rail3RideTopic(rideId: string): string {
  return `rail3:ride:${rideId}`;
}

// Subscribes to a ride's live Broadcast channel, tenant-authorized at the realtime
// layer (W170 / Sprint-0 gap G-1). The channel is PRIVATE, so Supabase Realtime checks
// the realtime.messages RLS policies — which only let a session whose tenant matches the
// ride's tenant receive (SELECT) or send (INSERT) on `rail3:ride:<rideId>`. A viewer in
// another tenant cannot join the channel; a denied subscription surfaces as a
// `CHANNEL_ERROR` status (the security gate is enforced server-side regardless).
//
// W190 note: the web race-control viewer is CONSUME-ONLY — it attaches a
// `.on('broadcast', { event: 'pos' }, …)` handler and never calls `.send()`. The
// `self: true` flag below is therefore inert for this consumer (kept for parity with
// the mobile publisher). Do NOT use this channel for postgres_changes (those must bind
// before subscribe(); only Broadcast/Presence bind dynamically afterwards).
export function useRideChannel(rideId: string | null): {
  channel: RealtimeChannel | null;
  status: RideChannelStatus;
} {
  const [channel, setChannel] = useState<RealtimeChannel | null>(null);
  const [status, setStatus] = useState<RideChannelStatus>(null);

  useEffect(() => {
    if (!rideId) {
      setChannel(null);
      setStatus(null);
      return;
    }

    const topic = rail3RideTopic(rideId);
    const ch = supabase.channel(topic, {
      // private: true → realtime evaluates the realtime.messages RLS (the tenant gate).
      config: { private: true, broadcast: { self: true } },
    });

    ch.subscribe((s, err) => {
      setStatus(s as RideChannelStatus);
      if (s === 'CHANNEL_ERROR' || s === 'TIMED_OUT') {
        // A cross-tenant / no-membership viewer is denied here (server-side gate).
        console.warn(`[Rail3] ride channel "${topic}" subscription ${s}`, err);
      }
    });
    setChannel(ch);

    return () => {
      supabase.removeChannel(ch);
      setChannel(null);
      setStatus(null);
    };
  }, [rideId]);

  return { channel, status };
}
