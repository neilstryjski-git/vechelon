// W286 — Android headless task (Ledger B1 device-side; R3-42 / R3-48 / R3-67).
//
// With `stopOnTerminate: false` + `enableHeadless: true` the Transistorsoft FGS keeps running after
// the user swipes the app away, and the SDK boots a HEADLESS JS context (no React, no navigation,
// no Alert) to deliver heartbeat / terminate / providerchange events. This task re-asserts a
// disabled engine for the DURABLE active ride and posts the A4 last-known write under the
// persisted session. No durable ride → inert (that is how R3-67's "de-registered" is honoured,
// since AppRegistry registration is permanent).
//
// LAUNCH SAFETY (the D87 OTA rollback lesson, see AuthContext.tsx): this module is imported at
// bundle eval from index.ts, so its top-level imports are react-native + TYPES only. The ONE eager
// addition to the launch path is the Transistorsoft SDK, required once inside registerRail3HeadlessTask
// (unavoidable: registerHeadlessTask is an SDK call; wrapped in try/catch so a missing native module
// degrades to "no headless task", never a crash). supabase / telemetry / lastKnown / activeRide /
// headlessLogic are `require`d INSIDE the task, which only ever runs after the app has been running.
//
// BOUNDARY: this fires only while the FGS lives. An OEM that kills the FGS outright runs no JS —
// that class is non-recoverable device-side (captain-side silence detection now; server-side
// staleness + FCM wake deferred behind B2's scheduler to a later sprint).

import { Platform } from 'react-native';
import type BackgroundGeolocationType from 'react-native-background-geolocation';
import type { HeadlessEvent } from 'react-native-background-geolocation';

type BG = typeof BackgroundGeolocationType;

export function registerRail3HeadlessTask(): void {
  if (Platform.OS !== 'android') return;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const BG = require('react-native-background-geolocation').default as BG;
    BG.registerHeadlessTask((event: HeadlessEvent) => runHeadlessEvent(BG, event));
  } catch (e) {
    console.warn('[Rail3][headless] registration skipped', e);
  }
}

// Every step is try/catch'd; this promise never rejects (the SDK finishes the task when it
// resolves, so every write we need is AWAITED here).
export async function runHeadlessEvent(BG: BG, event: HeadlessEvent): Promise<void> {
  try {
    const eventName = String(event?.name ?? '');
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const logic = require('./headlessLogic') as typeof import('./headlessLogic');
    // enableHeadless delivers EVERY SDK event here (location, motionchange, http, ...). Only the
    // three recovery events proceed; everything else exits BEFORE any storage read, session read,
    // REST call or write — a moving terminated device must not pay the prelude on every fix.
    if (!logic.isRecoveryEvent(eventName)) return;
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { readPersistedActiveRide } = require('./activeRide') as typeof import('./activeRide');

    const ride = await readPersistedActiveRide();
    if (!ride) return; // R3-67: nothing to recover, stay silent

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { supabase } = require('./supabase') as typeof import('./supabase');
    // Session gate. While this task runs the app JS is dead, so this headless context is the only
    // live token refresher; the further getSession() calls inside the telemetry / last-known
    // writers are serialised by the same in-context processLock. No session → no write, no
    // re-assert.
    const { data } = await supabase.auth.getSession();
    if (!data.session?.user?.id) return;
    if (data.session.user.id !== ride.riderId) return; // D77: never act for a stale identity

    // W287: the shared persisted-status read with bounded retry. null (RLS-hidden / failed) is
    // never Saved → the normal recovery path; an affirmative 'saved' → teardown below.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { readStatusWithRetry } = require('./rideEndCheck') as typeof import('./rideEndCheck');
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { fetchRideStatus } = require('./rideStatus') as typeof import('./rideStatus');
    const rideStatus = await readStatusWithRetry(() => fetchRideStatus(ride.rideId));

    let enabledBefore: boolean | null = null;
    try {
      enabledBefore = (await BG.getState()).enabled;
    } catch {
      enabledBefore = null;
    }

    const action = logic.decideHeadlessAction({
      event: eventName,
      persistedRide: ride,
      engineEnabled: enabledBefore !== false, // unknown reads as enabled: no blind re-assert
      rideStatus,
    });

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const telemetry = require('./telemetry') as typeof import('./telemetry');
    // Cold JS context: the operator-config cache is empty, and fullCapture is a no-op without it.
    await telemetry.loadOperatorConfig();

    const wake = (outcome: import('./headlessLogic').WakeOutcome, err?: string) =>
      telemetry.writeFullCaptureEvent(
        ride.rideId,
        'wake_attempt',
        logic.buildWakeAttemptPayload({
          outcome,
          reason: enabledBefore === false ? 'enabled_false' : 'enabled_true',
          event: eventName,
          engineEnabledBefore: enabledBefore,
          context: 'headless',
          err,
        }),
      );

    if (action === 'teardown') {
      // W287 (slate 13 / A2 / R3-35): affirmative Saved → stop the engine (clears the FGS
      // notification), THEN clear the durable holder — on success only, so a failed stop leaves
      // the holder for the next beat to retry rather than going inert with the engine still
      // streaming. No re-assert, no last-known write, no rider-facing surface.
      try {
        await BG.stop();
      } catch (e) {
        await wake('teardown_failed', e instanceof Error ? e.message : String(e));
        return;
      }
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { clearPersistedActiveRide } = require('./activeRide') as typeof import('./activeRide');
      clearPersistedActiveRide();
      await wake('torn_down_saved');
      return;
    }

    if (action === 'noop') {
      await wake('noop');
      return;
    }

    if (action === 'reassert' || action === 'reassert_and_write_last_known') {
      // Mirrors bgGeo.reassertEngine: start() alone decides success; the engine_started counter is
      // written as soon as it resolves; changePace is its own, distinctly-reported step.
      let started = false;
      try {
        await BG.start();
        started = true;
      } catch (e) {
        await wake('failed', e instanceof Error ? e.message : String(e));
      }
      if (started) {
        await telemetry.writeCounter(ride.rideId, 'engine_started', { reason: 'headless_reassert', event: eventName });
        try {
          await BG.changePace(true);
          await wake('ok');
        } catch (e) {
          await wake('ok_no_pace', e instanceof Error ? e.message : String(e));
        }
      }
    }

    if (action === 'write_last_known' || action === 'reassert_and_write_last_known') {
      try {
        // Same probe the in-process heartbeat uses; persist:false so it never doubles as a ping.
        const loc = await BG.getCurrentPosition({ samples: 1, persist: false, timeout: 30 });
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { persistLastKnown } = require('./lastKnown') as typeof import('./lastKnown');
        await persistLastKnown(ride.rideId, loc.coords.latitude, loc.coords.longitude, Date.now(), 'headless');
      } catch (e) {
        console.warn('[Rail3][headless] last-known write skipped', e);
      }
    }
  } catch (e) {
    console.warn('[Rail3][headless] event handling failed', e);
  }
}
