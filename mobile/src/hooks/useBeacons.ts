import { useCallback, useEffect, useRef, useState } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import * as Haptics from 'expo-haptics';

import { supabase } from '../lib/supabase';
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
      const { data } = await supabase
        .from('beacon_alerts')
        .select('id, rider_id, triggered_at')
        .eq('ride_id', rideId)
        .is('beacon_cancelled_at', null);
      if (cancelled || !data) return;
      const seed: Record<string, ActiveBeacon> = {};
      for (const row of data) {
        seed[row.rider_id] = {
          beaconId: row.id,
          riderId: row.rider_id,
          triggeredAt: Date.parse(row.triggered_at),
        };
      }
      setBeacons(seed);
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

    const beaconId =
      globalThis.crypto?.randomUUID?.() ??
      `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const sentAt = Date.now();
    void channel.send({
      type: 'broadcast',
      event: BEACON_EVENT,
      payload: { riderId: myRiderId, active: true, beaconId, sentAt } as BeaconPayload,
    });
    // Optimistic local state so the rider's own confirmation never waits.
    setBeacons((prev) => ({
      ...prev,
      [myRiderId]: { beaconId, riderId: myRiderId, triggeredAt: sentAt },
    }));

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
    let { error: insErr } = await supabase.from('beacon_alerts').insert(row);
    if (insErr) {
      ({ error: insErr } = await supabase.from('beacon_alerts').insert(row)); // one retry
    }
    if (insErr) {
      // The alert already fanned out — keep the beacon live, but say loudly
      // that the audit record is missing.
      setError(`Beacon alert sent, but the audit write failed: ${insErr.message}`);
      console.error('[Rail3] beacon_alerts insert failed after retry', insErr);
    }
  }, [rideId, tenantId, myRiderId, channel, getMyCoords]);

  // R3-20/21/22: audit write FIRST with the acting user's UUID (own uuid on
  // self-cancel — never null), then fan out; medium haptic for the actor.
  const cancelBeacon = useCallback(
    async (beacon: ActiveBeacon) => {
      if (!myRiderId || !channel) return;
      setError(null);

      const patch = buildCancelPatch(myRiderId, new Date()); // throws before ever writing null (SD-011)
      const { error: updErr } = await supabase
        .from('beacon_alerts')
        .update(patch)
        .eq('id', beacon.beaconId)
        .is('beacon_cancelled_at', null); // idempotent under racing cancels
      if (updErr) {
        setError(`Beacon cancel failed: ${updErr.message}`);
        console.error('[Rail3] beacon cancel update failed', updErr);
        return; // no broadcast: maps must not clear a beacon whose audit row still says active
      }

      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
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
      setBeacons((prev) => {
        const next = { ...prev };
        delete next[beacon.riderId];
        return next;
      });
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
