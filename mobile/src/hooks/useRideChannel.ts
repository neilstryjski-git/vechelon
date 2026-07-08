import { useEffect, useState } from 'react';
import { AppState } from 'react-native';
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

// D57 — broadcast event the captain emits when ending a ride, so other participants'
// RideMapScreen leaves the live map in real time (ride end is ephemeral, no DB read
// per client; a fresh open also reads ride.status as a fallback).
export const RIDE_ENDED_EVENT = 'ride_ended';

// D73/W266: debounce foreground channel rebuilds so an iOS active/inactive flap or a rapid
// lock/unlock coalesces into ONE rebuild instead of thrashing the realtime socket.
const FOREGROUND_REBUILD_DEBOUNCE_MS = 1200;

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
    let cancelled = false;
    let ch: RealtimeChannel | null = null;
    let attempt = 0;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let foregroundTimer: ReturnType<typeof setTimeout> | null = null;
    let lastStatus: RideChannelStatus = null;

    // D55: a PRIVATE channel makes Realtime evaluate the realtime.messages RLS, which
    // needs the signed-in user's JWT ON THE REALTIME SOCKET so get_my_tenant_id()
    // resolves. We set it EXPLICITLY from the CURRENT session before every (re)subscribe
    // — getSession() returns a live token (refreshing an expired one), which is the
    // crux of the 2026-07-05 field failure: a ride outlives the 1h token, and a
    // reconnect that re-auths with a STALE token is denied by the tenant RLS and dies
    // with CHANNEL_ERROR. AuthContext also pushes refreshed tokens onto the socket.
    const connect = async () => {
      if (cancelled) return;
      const { data } = await supabase.auth.getSession();
      if (cancelled) return;
      if (data.session?.access_token) {
        supabase.realtime.setAuth(data.session.access_token);
      }
      if (ch) {
        const stale = ch;
        ch = null;
        supabase.removeChannel(stale);
      }
      const thisCh = supabase.channel(topic, {
        // private: true → realtime evaluates the realtime.messages RLS (the tenant gate).
        // self: true so the captain also sees their own broadcasts on the map.
        // ack: true → channel.send() resolves on SERVER acknowledgment (load-bearing
        // for W173's Support Beacon NO SIGNAL detection). Position pings are void-sent.
        config: { private: true, broadcast: { self: true, ack: true } },
      });
      ch = thisCh;
      setChannel(thisCh);
      thisCh.subscribe((s, err) => {
        if (cancelled || ch !== thisCh) return; // drop callbacks from a superseded channel
        lastStatus = s as RideChannelStatus;
        setStatus(lastStatus);
        if (s === 'SUBSCRIBED') {
          attempt = 0; // recovered — reset backoff
        } else if (s === 'CHANNEL_ERROR' || s === 'TIMED_OUT' || s === 'CLOSED') {
          // A drop is now RECOVERABLE, not terminal. Previously this was a bare
          // console.warn with no retry — so a screen-lock/dead-zone drop (esp. after
          // token expiry) left the channel dead for the rest of the ride. Reconnect.
          console.warn(`[Rail3] ride channel "${topic}" ${s} — reconnecting`, err);
          scheduleReconnect();
        }
      });
    };

    // Capped exponential backoff (2s→4s→8s→15s) with JITTER. Jitter is load-bearing at
    // fleet scale: a whole peloton exits the same dead-zone together, so without it
    // every device reconnects in lockstep and thundering-herds the realtime server.
    const scheduleReconnect = () => {
      if (cancelled || retryTimer) return;
      attempt += 1;
      const base = Math.min(15000, 1000 * 2 ** Math.min(attempt, 4));
      const delay = base / 2 + Math.random() * (base / 2);
      retryTimer = setTimeout(() => {
        retryTimer = null;
        void connect();
      }, delay);
    };

    // Foreground recovery (D73 root cause, field-confirmed 2026-07-08): while backgrounded the
    // JS thread is SUSPENDED, so the realtime websocket can die SILENTLY — no subscribe()
    // callback ever fires, so `lastStatus` stays frozen at 'SUBSCRIBED' and any socket-liveness
    // flag (readyState) may be stale on resume. The old guard trusted `lastStatus !==
    // 'SUBSCRIBED'` and therefore SKIPPED the reconnect after a real pocket, leaving the channel
    // DEAD for the rest of the ride: no live markers, no Support Beacon received, even once
    // foregrounded. So on EVERY return to foreground we UNCONDITIONALLY rebuild — a dead channel
    // is a safety failure; a ~1s re-subscribe blink is not (and W262's last-known refetch fires
    // on the SAME 'active' event, so stopped riders repaint immediately and moving riders on
    // their next ping). Trailing-debounced so a flap/rapid-unlock costs one rebuild, not a thrash.
    const appSub = AppState.addEventListener('change', (next) => {
      if (next !== 'active' || cancelled) return;
      if (foregroundTimer) clearTimeout(foregroundTimer);
      foregroundTimer = setTimeout(() => {
        foregroundTimer = null;
        if (cancelled) return;
        if (retryTimer) {
          clearTimeout(retryTimer);
          retryTimer = null;
        }
        void connect();
      }, FOREGROUND_REBUILD_DEBOUNCE_MS);
    });

    void connect();

    return () => {
      cancelled = true;
      appSub.remove();
      if (retryTimer) clearTimeout(retryTimer);
      if (foregroundTimer) clearTimeout(foregroundTimer);
      if (ch) supabase.removeChannel(ch);
      setChannel(null);
      setStatus(null);
    };
  }, [rideId]);

  return { channel, status };
}
