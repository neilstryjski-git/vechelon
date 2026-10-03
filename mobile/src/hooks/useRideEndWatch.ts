// W287 — device-side CONVERGENT ride-end teardown, foreground half (Ledger slate 13, A2;
// Pillar III R3-69 / R3-35 / R3-67 / R3-70).
//
// Teardown must never depend on a message arriving. This hook re-reads persisted rides.status
// on mount, on every W269 resume signal (appstate / clockgap / stale — there is NO connectivity
// (NetInfo) signal in this app and none is added here, so "connectivity resumption" is
// approximated by clockgap + stale), and whenever the D57 RIDE_ENDED broadcast arrives (as a
// TRIGGER for the read, never as the decision). On an affirmative 'saved' it tears down:
// local beacon state cleared (D81; local only — R3-70 forbids touching participant data),
// durable active-ride holder cleared (R3-67: no recovery mechanism may re-engage), then
// navigation.goBack() — unmounting the map removes the channel (useRideChannel cleanup) and
// stops the engine (useFleetPositions cleanup → stopBgGeo, which also clears the FGS
// notification). Foregrounded: the existing Alert stays as the A2 foreground-only notification.
// Backgrounded: silent — no Alert, toast or sound.
//
// Accepted limit (slate 13): a device with neither connectivity nor app focus continues until
// one changes, bounded by the inactivity backstop. The server-initiated wake fast path is OUT
// (behind B2's scheduler).

import { useCallback, useEffect, useRef } from 'react';
import { Alert, AppState } from 'react-native';

import { useResume } from './useResume';
import type { ResumeSource } from '../lib/resumeDetector';
import { decideRideEndAction, readStatusWithRetry, type RideEndAction } from '../lib/rideEndCheck';
import { fetchRideStatus } from '../lib/rideStatus';
import { clearPersistedActiveRide } from '../lib/activeRide';
import { logMeasurement } from '../lib/measure';
import { logResumeSignal } from '../lib/lifecycle';

export type RideEndTrigger = 'mount' | ResumeSource | 'ride_ended_event' | 'manual';

export function useRideEndWatch(
  rideId: string | null,
  navigation: { goBack: () => void },
  opts: {
    clearLocalBeacons: () => void;
    iAmCaptain?: boolean;
    // The mount read waits for this (the ride row, hence the viewer's role) so the notify/silent
    // decision is never made with a pre-load default role. Defaults to true.
    ready?: boolean;
    onTeardown?: (trigger: RideEndTrigger, action: RideEndAction) => void;
  },
): {
  endedRef: React.MutableRefObject<boolean>;
  checkNow: (trigger: RideEndTrigger) => void;
  markEnded: () => void;
} {
  const endedRef = useRef(false); // idempotency: one teardown per mount
  const inFlightRef = useRef(false); // single-flight: a signal during a read is dropped, the next retries
  const mountedRef = useRef(true);
  const rideIdRef = useRef(rideId);
  rideIdRef.current = rideId;
  const optsRef = useRef(opts);
  optsRef.current = opts;
  const navRef = useRef(navigation);
  navRef.current = navigation;

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const checkNow = useCallback((trigger: RideEndTrigger) => {
    const rid = rideIdRef.current;
    if (!rid || endedRef.current || inFlightRef.current) return;
    inFlightRef.current = true;
    void (async () => {
      try {
        const status = await readStatusWithRetry(() => fetchRideStatus(rid));
        if (!mountedRef.current || endedRef.current) return;
        const action = decideRideEndAction({
          status,
          appState: AppState.currentState,
          iAmCaptain: optsRef.current.iAmCaptain,
        });
        if (action === 'none') return; // incl. a failed read (null): retried on the next signal
        endedRef.current = true;
        try {
          optsRef.current.clearLocalBeacons();
        } catch {
          // local state only; never block the teardown
        }
        clearPersistedActiveRide();
        optsRef.current.onTeardown?.(trigger, action);
        void logMeasurement({ rideId: rid, kind: 'ride_end_teardown', payload: { trigger, action } });
        if (action === 'teardown_notify') {
          Alert.alert(
            'Ride ended',
            trigger === 'ride_ended_event' ? 'The captain has ended this ride.' : 'This ride has already ended.',
          );
        }
        navRef.current.goBack();
      } catch (e) {
        console.warn('[Rail3] ride-end check failed', e);
      } finally {
        inFlightRef.current = false;
      }
    })();
  }, []);

  // Mount: a fresh open of an already-saved ride converges as soon as the role is known (replaces
  // the one-shot ride.status effect the screen used to carry).
  const ready = opts.ready ?? true;
  useEffect(() => {
    if (!rideId) return;
    endedRef.current = false;
  }, [rideId]);
  useEffect(() => {
    if (!rideId || !ready) return;
    checkNow('mount');
  }, [rideId, ready, checkNow]);

  // Every resume signal — the W269 bus the fleet, channel and beacon consumers already ride.
  const onResume = useCallback(
    (source: ResumeSource) => {
      logResumeSignal(rideIdRef.current, source, 'ride_end');
      checkNow(source);
    },
    [checkNow],
  );
  useResume(rideId, onResume);

  // The Captain's own End Ride path: the ride is over by their action; no read needed, but the
  // departure that follows must keep last_* (R3-70) — so mark it.
  const markEnded = useCallback(() => {
    endedRef.current = true;
  }, []);

  return { endedRef, checkNow, markEnded };
}
