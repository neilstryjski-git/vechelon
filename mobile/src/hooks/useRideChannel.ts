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
// app's public `ride:<id>` topic) so the two never collide. (W170)
export function rail3RideTopic(rideId: string): string {
  return `rail3:ride:${rideId}`;
}

// Subscribes to a ride's live Broadcast channel, tenant-authorized at the realtime
// layer (W170 / Sprint-0 gap G-1). The channel is PRIVATE, so Supabase Realtime checks
// the realtime.messages RLS policies — which only let a rider whose tenant matches the
// ride's tenant receive (SELECT) or send (INSERT) on `rail3:ride:<rideId>`. A rider
// cannot join another tenant's live ride channel; a denied subscription surfaces as a
// `CHANNEL_ERROR` status (the security gate is enforced server-side regardless).
//
// Returns the channel and its live subscription `status` so consumers can react to a
// rejected/timed-out subscription. Location/beacon fan-out (Broadcast, no DB write per
// Pillar II §2) rides on the channel; feature tasks (fleet map, Support Beacon) attach
// `.on('broadcast', { event }, …)` handlers and `.send({ type: 'broadcast', … })` calls.
// NOTE: only Broadcast (and Presence) bindings may be attached after subscribe(); they
// bind dynamically. Do NOT use this channel for postgres_changes (those must bind first).
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
    let ch: RealtimeChannel | null = null;
    let cancelled = false;

    // D55: a PRIVATE channel makes Realtime evaluate the realtime.messages RLS, which
    // needs the signed-in user's JWT ON THE REALTIME SOCKET so get_my_tenant_id()
    // resolves. supabase-js auto-syncs that token, but NOT reliably right after a fresh
    // sign-in (e.g. a 2nd rider who just signed in / auto-joined via W191) — the socket
    // can still be anon when the channel subscribes, so the tenant send/receive policies
    // fail: that rider neither broadcasts nor receives, and the Captain never sees them
    // (cross-device fleet appears broken). Set the auth EXPLICITLY from the current
    // session before subscribing.
    void (async () => {
      const { data } = await supabase.auth.getSession();
      if (cancelled) return;
      if (data.session?.access_token) {
        supabase.realtime.setAuth(data.session.access_token);
      }
      ch = supabase.channel(topic, {
        // private: true → realtime evaluates the realtime.messages RLS (the tenant gate).
        // self: true so the captain also sees their own broadcasts on the map.
        // ack: true → channel.send() resolves on SERVER acknowledgment instead of
        // unconditionally 'ok' (realtime-js socket path). Load-bearing for W173:
        // the Support Beacon's NO SIGNAL detection is only real with server acks.
        // Position pings share the channel and are void-sent — the per-ping ack
        // costs nothing client-side.
        config: { private: true, broadcast: { self: true, ack: true } },
      });
      ch.subscribe((s, err) => {
        setStatus(s as RideChannelStatus);
        if (s === 'CHANNEL_ERROR' || s === 'TIMED_OUT') {
          // A cross-tenant / no-membership rider is denied here (server-side gate).
          console.warn(`[Rail3] ride channel "${topic}" subscription ${s}`, err);
        }
      });
      setChannel(ch);
    })();

    return () => {
      cancelled = true;
      if (ch) supabase.removeChannel(ch);
      setChannel(null);
      setStatus(null);
    };
  }, [rideId]);

  return { channel, status };
}
