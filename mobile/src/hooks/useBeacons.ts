import { useCallback, useEffect, useRef, useState } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import * as Haptics from 'expo-haptics';
import * as Crypto from 'expo-crypto';

import { supabase } from '../lib/supabase';
import { isCurrentIdentity } from '../lib/identity';
import type { RideChannelStatus } from './useRideChannel';
import {
  buildCancelPatch,
  buildRaisePatch,
  latencyDeltaMs,
  mergeSeededBeacons,
  BEACON_CLEAR_PATCH,
  type ActiveBeacon,
} from '../lib/beaconLogic';
import { persistMyParticipantPatch } from '../lib/lastKnown';
import type { LatLng } from '../lib/geo';
import { logFetchResult, logResumeSignal } from '../lib/lifecycle';
import { useResume } from './useResume';
import type { ResumeSource } from '../lib/resumeDetector';

// Broadcast event name for beacon state changes on the rail3:ride:<id> channel.
export const BEACON_EVENT = 'beacon';
// W282: mirrors the fleet's LAST_KNOWN_REFETCH_DEBOUNCE_MS — mount + first SUBSCRIBED, or an
// AppState flap, must not double-read; a real activation later always runs.
const SEED_DEBOUNCE_MS = 3000;

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

// W282: the current-state record moved to beaconLogic.ts (pure, node-tested); re-exported so
// consumers keep importing it from here.
export type { ActiveBeacon } from '../lib/beaconLogic';

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
//
// W282 (Ledger slate 7 / A4): CURRENT STATE lives on ride_participants.beacon_active — read on
// mount, on every resume and on channel activation, superseded on clear. beacon_alerts is the
// audit record only and is never replayed into state. Raising writes the flag AND a fresh
// last-known on MY row in ONE update (A4) so the alert always has a position to anchor it;
// that write never gates the alert. Cancel: audit row first, THEN the flag clear — never the
// other way round.
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
  // Mirror for the seed closure (bound once per ride): the pending-raise re-assert must only run
  // while MY beacon is still live locally — never after any cancel, local or remote, even one
  // whose broadcast was missed while pocketed.
  const beaconsRef = useRef(beacons);
  beaconsRef.current = beacons;
  const [lastLatencyMs, setLastLatencyMs] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const myRiderIdRef = useRef(myRiderId);
  myRiderIdRef.current = myRiderId;
  // Read inside the resume subscriber (bound once) without re-binding on ride change.
  const rideIdRef = useRef<string | null>(rideId);
  rideIdRef.current = rideId;

  // W282 SEED — current beacon state from ride_participants.beacon_active (+ last_* as the
  // R3-55 anchor). A meaningful event, never per-ping: mount, every resume (D75 — the field
  // failure was an SOS active during a pocket that never surfaced on unlock), and channel
  // activation. §4.1-gated SERVER-SIDE by participant_tactical_select (a Rider reads own +
  // Captain/SAG rows, which is exactly canSeeBeacon's shape). The seed is AUTHORITATIVE for
  // absence: a beacon settled while this device was blind is dropped and never re-raised from
  // beacon_alerts history (mergeSeededBeacons owns the two race exceptions).
  //
  // The seed closure lives inside the [rideId] effect with a `cancelled` guard (so an in-flight
  // read can't setBeacons after unmount/ride-change), and a ref bridges it to the stable resume
  // subscriber — the same discipline useFleetPositions uses for its last-known refetch.
  const seedRef = useRef<((source?: ResumeSource | 'channel') => void) | null>(null);
  // riderId -> when THIS device last cancelled that rider's beacon; lets a seed that started
  // before the cancel not re-add it (seed racing a live cancel).
  const settledAtRef = useRef<Record<string, number>>({});
  // The raise-time flag write that FAILED (after its retry) for my live beacon. While set, the
  // seed re-asserts it before reading and never drops my own beacon on its say-so: a row that
  // still reads beacon_active=false must not silence an alert that already went out.
  const pendingRaiseRef = useRef<{ rideId: string; patch: ReturnType<typeof buildRaisePatch> } | null>(null);
  useEffect(() => {
    if (!rideId) return;
    let cancelled = false;
    let lastSeedMs = 0;
    const seed = async (source?: ResumeSource | 'channel') => {
      const seedStartedAt = Date.now();
      // Debounce like the fleet's last-known refetch: mount + first SUBSCRIBED, or an AppState
      // flap, must not storm the DB. A real activation later always runs.
      if (seedStartedAt - lastSeedMs < SEED_DEBOUNCE_MS) return;
      lastSeedMs = seedStartedAt;
      // Reconcile a known-failed raise write BEFORE reading, so the read can confirm it. FLAG
      // ONLY: the throttle/stop path keeps last_* fresh on the same row, so replaying the
      // raise-time fix minutes later would move my last-known BACK in time (review round 2).
      // Gated on my beacon still being live locally: a cancel of any kind drops it, and a
      // dropped beacon must never be re-asserted into a zombie.
      const pending = pendingRaiseRef.current;
      const me = myRiderIdRef.current;
      if (pending && pending.rideId === rideId) {
        if (!me || !beaconsRef.current[me]) {
          pendingRaiseRef.current = null;
        } else {
          const ok = await persistMyParticipantPatch(rideId, { beacon_active: true }, 'beacon');
          if (ok) pendingRaiseRef.current = null;
          if (cancelled) return;
        }
      }
      const { data, error: seedErr } = await supabase
        .from('ride_participants')
        .select('account_id, beacon_active, last_lat, last_long, last_ping')
        .eq('ride_id', rideId)
        .eq('beacon_active', true);
      logFetchResult(rideId, 'beacon', {
        rows: data?.length ?? 0,
        cancelled,
        ...(source ? { source } : {}),
        ...(seedErr ? { err: seedErr.message } : {}),
      });
      if (cancelled) return;
      if (seedErr || !data) {
        console.warn('[Rail3] beacon seed read failed', seedErr);
        return;
      }
      const active: Record<string, ActiveBeacon> = {};
      for (const row of data) {
        if (!row.account_id) continue;
        const anchored = row.last_lat != null && row.last_long != null && row.last_ping;
        active[row.account_id] = {
          beaconId: null, // the flag carries no audit id; cancel is keyed by rider
          riderId: row.account_id,
          triggeredAt: row.last_ping ? Date.parse(row.last_ping) : seedStartedAt,
          anchor: anchored ? { lat: row.last_lat, lng: row.last_long, ts: Date.parse(row.last_ping) } : null,
        };
      }
      const protectedIds =
        pendingRaiseRef.current && myRiderIdRef.current ? [myRiderIdRef.current] : [];
      setBeacons((prev) =>
        mergeSeededBeacons(prev, active, seedStartedAt, settledAtRef.current, undefined, protectedIds),
      );
    };
    void seed();
    seedRef.current = (source) => {
      void seed(source);
    };
    return () => {
      cancelled = true;
      seedRef.current = null;
      settledAtRef.current = {};
      pendingRaiseRef.current = null;
    };
  }, [rideId]);

  // W282: channel activation is a read point too (slate 7) — a reconnect after a dead channel
  // is exactly when a beacon may have been raised or settled unseen.
  useEffect(() => {
    if (channelStatus === 'SUBSCRIBED') seedRef.current?.('channel');
  }, [channelStatus]);

  // D75: re-seed on resume, the same recovery wiring the fleet/breadcrumb/channel consumers use
  // (W269). Without this, an SOS that a Captain/SAG missed while pocketed stayed invisible when
  // they glanced back — the safety path's worst failure.
  const onResume = useCallback((source: ResumeSource) => {
    logResumeSignal(rideIdRef.current, source, 'beacon');
    seedRef.current?.(source);
  }, []);
  useResume(rideId, onResume);

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
          [p.riderId]: {
            beaconId: p.beaconId,
            riderId: p.riderId,
            triggeredAt: p.sentAt,
            anchor: prev[p.riderId]?.anchor ?? null, // the seed / fleet fetch supplies it
          },
        }));
      } else {
        setBeacons((prev) => {
          const next = { ...prev };
          delete next[p.riderId];
          return next;
        });
        // Any cancel of MY beacon — local or remote — supersedes a pending raise re-assert
        // ("superseded on clear"; review round 2: a Captain cancel after a failed raise write
        // must not be re-raised by the next seed).
        if (p.riderId === myRiderIdRef.current) pendingRaiseRef.current = null;
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
    const coords = getMyCoords();
    setBeacons((prev) => ({
      ...prev,
      [myRiderId]: {
        beaconId,
        riderId: myRiderId,
        triggeredAt: sentAt,
        anchor: coords ? { lat: coords.lat, lng: coords.lng, ts: sentAt } : null,
      },
    }));

    // W282 (A4): durable current state + raise-time last-known on MY row, ONE update, issued
    // before the send and never awaited by it — fire-and-forget with one retry; a failure is a
    // sink row and a console error, never a gate on the alert and never composed into setError
    // (the alert path's message must stay about the ALERT).
    const raisePatch = buildRaisePatch(coords, new Date(sentAt));
    pendingRaiseRef.current = null;
    void persistMyParticipantPatch(rideId, raisePatch, 'beacon', 1).then((ok) => {
      if (ok) return;
      // Keep the alert, reconcile the record: the seed re-asserts this before every read and
      // protects my local beacon until the row agrees. Tell the rider — a sterner alert-path
      // message (if any) is kept, this only fills an empty slot.
      console.error('[Rail3] beacon flag/last-known write failed after retry — will re-assert on seed');
      pendingRaiseRef.current = { rideId, patch: raisePatch };
      setError(
        (prev) =>
          prev ??
          'Beacon alert sent, but its status flag was not saved — other devices may lose it on refresh until it is re-saved.',
      );
    });

    // Audit insert runs CONCURRENTLY with the send acknowledgment — the alert
    // never blocks the audit, and the audit never blocks the alert.
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
      // D77 — identity invariant. Checked HERE, inside the already-concurrent audit write, so
      // it adds ZERO latency to the alert itself: an SOS must never be blocked, delayed, or
      // suppressed by a consistency check. Unlike a position ping we still SEND on a mismatch
      // and merely RECORD it — a suppressed beacon is a safety failure, a mis-attributed one is
      // only a data failure. Fire-and-forget: we log the fact, we do not gate on it.
      void isCurrentIdentity(myRiderId, rideId, 'beacon');
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
      if (!rideId || !myRiderId || !channel) return;
      setError(null);

      // W282: clear the durable flag on the RIDER's row — after the audit write, never before.
      // Double-scoped (ride_id + that rider's account_id): a Captain/SAG clearing someone
      // else's beacon touches exactly that one row (participant_update_policy permits it via
      // is_captain_or_support; a rider can only ever hit their own). Patch = the flag ONLY.
      const clearFlag = async (): Promise<boolean> => {
        if (beacon.riderId === myRiderId) pendingRaiseRef.current = null; // cancelling supersedes a pending raise
        const { error: flagErr } = await supabase
          .from('ride_participants')
          .update(BEACON_CLEAR_PATCH)
          .eq('ride_id', rideId)
          .eq('account_id', beacon.riderId);
        if (flagErr) console.error('[Rail3] beacon flag clear failed', flagErr);
        settledAtRef.current[beacon.riderId] = Date.now();
        return !flagErr;
      };
      const dropLocal = () =>
        setBeacons((prev) => {
          const next = { ...prev };
          delete next[beacon.riderId];
          return next;
        });

      try {
        const patch = buildCancelPatch(myRiderId, new Date()); // throws before ever writing null (SD-011)
        // Keyed by RIDER, not audit id: a beacon adopted from the participant flag carries no
        // id, and one account raising on two devices leaves two open rows — settle them all.
        const { data: touched, error: updErr } = await supabase
          .from('beacon_alerts')
          .update(patch)
          .eq('ride_id', rideId)
          .eq('rider_id', beacon.riderId)
          .is('beacon_cancelled_at', null) // idempotent under racing cancels
          .select('id');
        if (updErr) {
          setError(`Beacon cancel failed: ${updErr.message}`);
          console.error('[Rail3] beacon cancel update failed', updErr);
          return; // no broadcast, no flag change: the audit row still says active
        }
        const auditId = touched?.[0]?.id ?? beacon.beaconId ?? 'unaudited';
        if (!touched || touched.length === 0) {
          console.warn('[Rail3] beacon cancel matched no active audit row — settled or never audited', beacon.riderId);
          // The raise-time flag write is independent of the audit insert, so an unaudited own
          // beacon can still carry beacon_active=true: clear it regardless (false→false is a
          // no-op under racing cancels).
          const flagOk = await clearFlag();
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
                beaconId: auditId,
                cancelledBy: myRiderId,
                sentAt: Date.now(),
              } as BeaconPayload,
            });
          }
          // Otherwise: settled by a racing canceller — their fan-out clears
          // maps and delivers the owner's haptic; re-broadcasting doubles both.
          if (!flagOk) setError('Beacon status flag not cleared; it may reappear on other devices until re-cancelled.');
          dropLocal();
          return;
        }

        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        const fanout = {
          type: 'broadcast' as const,
          event: BEACON_EVENT,
          payload: {
            riderId: beacon.riderId,
            active: false,
            beaconId: auditId,
            cancelledBy: myRiderId,
            sentAt: Date.now(),
          } as BeaconPayload,
        };
        // Flag clear and fan-out run CONCURRENTLY — both strictly after the audit write, and
        // neither gates the other.
        const flagPromise = clearFlag();
        let sent = await channel.send(fanout);
        if (sent !== 'ok') sent = await channel.send(fanout); // one retry
        const flagOk = await flagPromise;
        if (sent !== 'ok') {
          // Audit row is settled (fail-safe direction) but other maps may
          // still pulse until their next seed — say so.
          setError('Beacon cancelled in the record, but other devices may still show it (no signal).');
          console.error(`[Rail3] beacon cancel fan-out failed (${sent})`);
        } else if (!flagOk) {
          setError('Beacon cancelled, but its status flag was not cleared; it may reappear on other devices until re-cancelled.');
        }
        dropLocal();
      } catch (e) {
        // Includes the SD-011 guard throw — loud, never a stranded silent state.
        const msg = e instanceof Error ? e.message : String(e);
        setError(`Beacon cancel failed: ${msg}`);
        console.error('[Rail3] beacon cancel error', e);
      }
    },
    [rideId, myRiderId, channel],
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
