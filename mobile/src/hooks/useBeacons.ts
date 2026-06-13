import { useCallback, useEffect, useRef, useState } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import * as Haptics from 'expo-haptics';
import * as Crypto from 'expo-crypto';

import { supabase } from '../lib/supabase';
import type { RideChannelStatus } from './useRideChannel';
import { buildCancelPatch, latencyDeltaMs } from '../lib/beaconLogic';
import type { LatLng } from '../lib/geo';

// Broadcast event name for beacon state changes on the rail3:ride:<id> channel.
export const BEACON_EVENT = 'beacon';

// Wire contract for a beacon state change. Like position pings (W172), the
// payload carries NO identity attributes beyond riderId — receivers join it to
// their RLS-gated roster. `sentAt` feeds the D-55 latency instrumentation.
interface BeaconPayload {
  riderId: string;
  active: boolean;
  beaconId: string;
  cancelledBy?: string; // actor uuid on cancel — display/diagnostic only; the DB row is the audit record
  sentAt: number;
}

export interface ActiveBeacon {
  beaconId: string;
  riderId: string;
  triggeredAt: number;
}

// Support Beacon state + actions for a ride (W173, Pillar II Feature 2).
//
// Transport vs record (the load-bearing split): the Broadcast event is the
// <500ms alert path (D-55/DoD-05); the beacon_alerts row is the AUDIT record.
// On trigger the broadcast goes FIRST — distress latency beats bookkeeping —
// then the insert; an insert failure retries once and is surfaced loudly, but
// never blocks the alert. On cancel the DB write goes first (no urgency; the
// audit row must carry the actor before anyone's map clears), then the fan-out.
//
// SD-011: beacon_cancelled_by NULL means SYSTEM ERROR only. buildCancelPatch
// throws rather than emit null, and the UPDATE never executes without an actor.
export function useBeacons(
  rideId: string | null,
  tenantId: string | null,
  myRiderId: string | null,
  channel: RealtimeChannel | null,
  channelStatus: RideChannelStatus,
  getMyCoords: () => LatLng | null,
): {
  // riderId -> active beacon. Consumers gate visibility with canSeeBeacon.
  beacons: Record<string, ActiveBeacon>;
  myBeacon: ActiveBeacon | null;
  triggerBeacon: () => Promise<void>;
  cancelBeacon: (beacon: ActiveBeacon) => Promise<void>;
  lastLatencyMs: number | null;
  error: string | null;
}{
  const [beacons, setBeacons] = useState<Record<string, ActiveBeacon>>({});
  const [lastLatencyMs, setLastLatencyMs] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const myRiderIdRef = useRef(myRiderId);
  myRiderIdRef.current = myRiderId;

  // Seed from the audit table at mount (a meaningful event — late joiners and
  // reconnects must see beacons triggered before they subscribed). Live
  // updates then arrive via Broadcast only.
  useEffect(() => {
    if (!rideId) return;
    let cancelled = false;
    (async () => {
      const { data, error: seedErr } = await supabase
        .from('beacon_alerts')
        .select('id, rider_id, triggered_at')
        .eq('ride_id', rideId)
        .is('beacon_cancelled_at', null);
      if (cancelled) return;
      if (seedErr || !data) {
        console.warn('[Rail3] beacon seed read failed', seedErr);
        return;
      }
      const seed: Record<string, ActiveBeacon> = {};
      for (const row of data) {
        seed[row.rider_id] = {
          beaconId: row.id,
          riderId: row.rider_id,
          triggeredAt: Date.parse(row.triggered_at),
        };
      }
      // Merge UNDER live state: a broadcast that arrived during this fetch
      // (trigger broadcasts before inserting) must not be clobbered.
      setBeacons((prev) => ({ ...seed, ...prev }));
    })();
    return () => {
      cancelled = true;
    };
  }, [rideId]);

  // Receive beacon broadcasts: maintain state, log D-55 latency, and fire the
  // R3-24 medium haptic on the RIDER'S device when someone else (Captain/SAG)
  // cancels their beacon — the cancel broadcast is how that device finds out.
  useEffect(() => {
    if (!channel) return;

    channel.on('broadcast', { event: BEACON_EVENT }, ({ payload }) => {
      const p = payload as BeaconPayload;
      if (!p?.riderId || !p.beaconId) return;

      const delta = latencyDeltaMs(p.sentAt, Date.now());
      setLastLatencyMs(delta);
      // Sender's own echo (broadcast self:true) is the skew-free measurement;
      // receiver-side deltas include device clock skew (see beaconLogic).
      const kind = p.riderId === myRiderIdRef.current ? 'self-echo (skew-free)' : 'receiver';
      console.log(`[Rail3][D-55] beacon ${p.active ? 'trigger' : 'cancel'} latency ${delta}ms (${kind})`);

      if (p.active) {
        setBeacons((prev) => ({
          ...prev,
          [p.riderId]: { beaconId: p.beaconId, riderId: p.riderId, triggeredAt: p.sentAt },
        }));
      } else {
        setBeacons((prev) => {
          const next = { ...prev };
          delete next[p.riderId];
          return next;
        });
        // My beacon, cancelled by someone other than me → R3-24 medium haptic.
        if (p.riderId === myRiderIdRef.current && p.cancelledBy && p.cancelledBy !== myRiderIdRef.current) {
          void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        }
      }
    });
  }, [channel]);

  // R3-19/R3-23: single tap, no confirmation — strong haptic, broadcast, then
  // the audit insert (lat/long snapshot at trigger time; cancel fields null
  // because the beacon is ACTIVE, not because of SD-011's error sentinel).
  const triggerBeacon = useCallback(async () => {
    if (!rideId || !tenantId || !myRiderId || !channel) return;
    setError(null);

    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);

    // expo-crypto, NOT globalThis.crypto (D52): Hermes has no Web Crypto, so
    // globalThis.crypto.randomUUID is undefined and the old fallback produced a
    // non-UUID string that the uuid `id` column rejected — failing both the audit
    // insert and the cancel's .eq('id', …).
    const beaconId = Crypto.randomUUID();
    const sentAt = Date.now();
    const alertPayload = {
      type: 'broadcast' as const,
      event: BEACON_EVENT,
      payload: { riderId: myRiderId, active: true, beaconId, sentAt } as BeaconPayload,
    };
    // Optimistic local state so the rider's own confirmation never waits —
    // but the ALERT must be acknowledged, not assumed (review critical): with
    // broadcast ack:true on the channel (useRideChannel), send() resolves on
    // the SERVER's acknowledgment, so a dead-zone failure is detectable.
    setBeacons((prev) => ({
      ...prev,
      [myRiderId]: { beaconId, riderId: myRiderId, triggeredAt: sentAt },
    }));

    // Audit insert runs CONCURRENTLY with the send acknowledgment — the alert
    // never blocks the audit, and the audit never blocks the alert.
    const coords = getMyCoords();
    const row = {
      id: beaconId,
      tenant_id: tenantId,
      ride_id: rideId,
      rider_id: myRiderId,
      lat: coords?.lat ?? null,
      long: coords?.lng ?? null,
      triggered_at: new Date(sentAt).toISOString(),
    };
    const insertPromise = (async () => {
      let { error: insErr } = await supabase.from('beacon_alerts').insert(row);
      if (insErr) {
        ({ error: insErr } = await supabase.from('beacon_alerts').insert(row)); // one retry
      }
      return insErr ?? null;
    })();

    let sent = channelStatus === 'SUBSCRIBED' ? await channel.send(alertPayload) : 'error';
    if (sent !== 'ok') {
      sent = await channel.send(alertPayload); // one retry (REST fallback when not joined)
    }
    const insErr = await insertPromise;

    // Compose ONE truthful message — never let a softer failure overwrite
    // NO SIGNAL with an 'alert sent' claim (review important #2).
    if (sent !== 'ok' && insErr) {
      setError('NO SIGNAL — your beacon did NOT go out. Retry when you have any signal.');
    } else if (sent !== 'ok') {
      setError('NO SIGNAL — your beacon may NOT have reached the Captain/SAG. Retry when you have signal.');
    } else if (insErr) {
      setError(`Beacon alert sent, but the audit write failed: ${insErr.message}`);
    }
    if (sent !== 'ok') console.error(`[Rail3] beacon alert send failed (${sent}), channel ${channelStatus}`);
    if (insErr) console.error('[Rail3] beacon_alerts insert failed after retry', insErr);
  }, [rideId, tenantId, myRiderId, channel, channelStatus, getMyCoords]);

  // R3-20/21/22: audit write FIRST with the acting user's UUID (own uuid on
  // self-cancel — never null), then fan out; medium haptic for the actor.
  const cancelBeacon = useCallback(
    async (beacon: ActiveBeacon) => {
      if (!myRiderId || !channel) return;
      setError(null);

      try {
        const patch = buildCancelPatch(myRiderId, new Date()); // throws before ever writing null (SD-011)
        const { data: touched, error: updErr } = await supabase
          .from('beacon_alerts')
          .update(patch)
          .eq('id', beacon.beaconId)
          .is('beacon_cancelled_at', null) // idempotent under racing cancels
          .select('id');
        if (updErr) {
          setError(`Beacon cancel failed: ${updErr.message}`);
          console.error('[Rail3] beacon cancel update failed', updErr);
          return; // no broadcast: maps must not clear a beacon whose audit row still says active
        }
        if (!touched || touched.length === 0) {
          console.warn('[Rail3] beacon cancel matched no active row — settled or never audited', beacon.beaconId);
          if (beacon.riderId === myRiderId) {
            // OWN beacon with no active row = the trigger's audit insert never
            // landed (compound dead-zone failure) — there is no racing actor
            // whose fan-out will clear other maps, so still broadcast the
            // cancel. A true racing self-cancel is impossible (we are the self).
            void channel.send({
              type: 'broadcast',
              event: BEACON_EVENT,
              payload: {
                riderId: beacon.riderId,
                active: false,
                beaconId: beacon.beaconId,
                cancelledBy: myRiderId,
                sentAt: Date.now(),
              } as BeaconPayload,
            });
          }
          // Otherwise: settled by a racing canceller — their fan-out clears
          // maps and delivers the owner's haptic; re-broadcasting doubles both.
          setBeacons((prev) => {
            const next = { ...prev };
            delete next[beacon.riderId];
            return next;
          });
          return;
        }

        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        const fanout = {
          type: 'broadcast' as const,
          event: BEACON_EVENT,
          payload: {
            riderId: beacon.riderId,
            active: false,
            beaconId: beacon.beaconId,
            cancelledBy: myRiderId,
            sentAt: Date.now(),
          } as BeaconPayload,
        };
        let sent = await channel.send(fanout);
        if (sent !== 'ok') sent = await channel.send(fanout); // one retry
        if (sent !== 'ok') {
          // Audit row is settled (fail-safe direction) but other maps may
          // still pulse until their next seed — say so.
          setError('Beacon cancelled in the record, but other devices may still show it (no signal).');
          console.error(`[Rail3] beacon cancel fan-out failed (${sent})`);
        }
        setBeacons((prev) => {
          const next = { ...prev };
          delete next[beacon.riderId];
          return next;
        });
      } catch (e) {
        // Includes the SD-011 guard throw — loud, never a stranded silent state.
        const msg = e instanceof Error ? e.message : String(e);
        setError(`Beacon cancel failed: ${msg}`);
        console.error('[Rail3] beacon cancel error', e);
      }
    },
    [myRiderId, channel],
  );

  return {
    beacons,
    myBeacon: myRiderId ? beacons[myRiderId] ?? null : null,
    triggerBeacon,
    cancelBeacon,
    lastLatencyMs,
    error,
  };
}
