import * as TaskManager from 'expo-task-manager';
import * as Location from 'expo-location';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState } from 'react-native';

import { SUPABASE_URL, SUPABASE_ANON_KEY } from './env';
import { supabase } from './supabase';
import { logMeasurement } from './measure';
import { rail3RideTopic } from '../hooks/useRideChannel';

// Mirror of useFleetPositions.POSITION_EVENT — inlined to avoid a circular import
// (useFleetPositions imports the start/stop helpers below). Keep in sync.
const POSITION_EVENT = 'pos';

export const RAIL3_BG_LOCATION_TASK = 'rail3-bg-location';
const CTX_KEY = 'rail3.bgLocationCtx';

export interface BgLocationCtx {
  rideId: string;
  riderId: string;
}

// W179 — keep TRANSMITTING the rider's position while the app is backgrounded /
// the phone is pocketed, so the Captain/SAG app AND the web race-control view see
// CURRENT positions. (The rider's OWN view may be stale until they reopen the app
// — explicitly acceptable per Sr PM; only the sender must stay live.)
//
// A foreground service (persistent notification) keeps GPS flowing while
// backgrounded; this headless task fans each fix out as an EPHEMERAL broadcast
// (no DB write per ping — Pillar II §2). REST (HTTP), NOT the websocket, because a
// Doze/background context can't be trusted to keep a socket alive — but it's the
// SAME `rail3:ride:<id>` topic + `pos` event the foreground socket path uses, so
// receivers can't tell the two apart. AppState gates foreground(socket) vs
// background(this) so they never double-send.
TaskManager.defineTask(RAIL3_BG_LOCATION_TASK, async ({ data, error }) => {
  if (error) {
    console.warn('[Rail3][bg] location task error', error);
    return;
  }
  const { locations } = (data ?? {}) as { locations?: Location.LocationObject[] };
  const loc = locations?.[locations.length - 1];
  if (!loc) return;

  const raw = await AsyncStorage.getItem(CTX_KEY);
  if (!raw) return; // not in an active ride — nothing to broadcast
  let ctx: BgLocationCtx;
  try {
    ctx = JSON.parse(raw) as BgLocationCtx;
  } catch {
    return;
  }
  if (!ctx.rideId || !ctx.riderId) return;

  // Double-send guard (RC3): the FGS now runs for the WHOLE ride (started in the
  // foreground — Android 12+ forbids starting it from the background), so this task
  // fires in the foreground too. While the UI is foregrounded, the socket path in
  // useFleetPositions owns broadcasting (it carries the tactical state machine), so
  // the FGS only BROADCASTS once we're actually backgrounded — the two never overlap.
  if (AppState.currentState === 'active') return;

  const sent = await restBroadcast(ctx.rideId, {
    riderId: ctx.riderId,
    state: 'active',
    lat: loc.coords.latitude,
    lng: loc.coords.longitude,
    ts: Date.now(),
  });
  // W202 (PoC/staging-only sink): record the BACKGROUND send. This is the half that
  // proves token survival WHILE POCKETED — the send + this sink write share the same
  // refreshed token, so a gap in bg gps_ping rows pinpoints a background refresh failure.
  // `sent:false` here = the FGS task ran but had no token / the POST failed (distinct from
  // the task never running at all — that shows as an absence of these rows).
  void logMeasurement({ rideId: ctx.rideId, kind: 'gps_ping', payload: { src: 'bg', sent } });
});

// Shared REST broadcast on the rail3 ride topic. REST (HTTP), NOT the websocket —
// a Doze/background context can't be trusted to keep a socket alive (W179), and the
// JS engine is frozen the instant the screen locks, so a websocket flush races the
// freeze and usually loses. A fresh user token authorizes the send RLS
// (rail3_broadcast_tenant_send → tenant member); getSession refreshes an expired
// one — load-bearing because a ride can outlive the 1-hour access token.
// Returns true if the POST went out, false if there was no token or it threw.
export async function restBroadcast(rideId: string, payload: Record<string, unknown>): Promise<boolean> {
  const { data: s } = await supabase.auth.getSession();
  const token = s.session?.access_token;
  if (!token) return false;
  try {
    await fetch(`${SUPABASE_URL}/realtime/v1/api/broadcast`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messages: [
          { topic: rail3RideTopic(rideId), event: POSITION_EVENT, private: true, payload },
        ],
      }),
    });
    return true;
  } catch (e) {
    console.warn('[Rail3][bg] broadcast failed', e);
    return false;
  }
}

// One-shot "I pocketed my phone" ping for the NO-background-tracking path (rider
// declined "Allow all the time"). Sent over REST so it actually escapes before the
// OS freezes the JS engine on screen-lock — the websocket path it replaced did not.
export async function sendDormantPing(args: {
  rideId: string;
  riderId: string;
  lat: number;
  lng: number;
}): Promise<void> {
  const sent = await restBroadcast(args.rideId, {
    riderId: args.riderId,
    state: 'dormant',
    lat: args.lat,
    lng: args.lng,
    ts: Date.now(),
  });
  void logMeasurement({
    rideId: args.rideId,
    kind: 'app_state_change',
    payload: { event: 'dormant_sent', sent },
  });
}

// Start the foreground-service-backed background location stream for an active
// ride. Idempotent. Caller must already hold BACKGROUND location permission.
export async function startRail3BackgroundLocation(ctx: BgLocationCtx): Promise<void> {
  await AsyncStorage.setItem(CTX_KEY, JSON.stringify(ctx));
  const running = await Location.hasStartedLocationUpdatesAsync(RAIL3_BG_LOCATION_TASK).catch(
    () => false,
  );
  if (running) {
    void logMeasurement({ rideId: ctx.rideId, kind: 'app_state_change', payload: { event: 'bg_start', ok: true, already: true } });
    return;
  }
  // PoC/staging instrumentation: the FGS start was previously un-try/caught, so an
  // Android 14+ foreground-service-type rejection (or a missing "Allow all the time"
  // grant) failed SILENTLY — exactly the invisible failure that produced zero bg pings
  // on the field walk. Log ok/error so the next walk says, from the sink, whether the
  // service even started.
  try {
    await Location.startLocationUpdatesAsync(RAIL3_BG_LOCATION_TASK, {
      accuracy: Location.Accuracy.Balanced,
      timeInterval: 5000, // matches the foreground PING_INTERVAL_MS
      distanceInterval: 0,
      pausesUpdatesAutomatically: false,
      showsBackgroundLocationIndicator: true,
      foregroundService: {
        notificationTitle: 'VEcheLOn — sharing your position',
        notificationBody: 'Your location is shared with your ride Captain while the ride is active.',
        notificationColor: '#16A34A',
      },
    });
    void logMeasurement({ rideId: ctx.rideId, kind: 'app_state_change', payload: { event: 'bg_start', ok: true } });
  } catch (e) {
    void logMeasurement({
      rideId: ctx.rideId,
      kind: 'app_state_change',
      payload: { event: 'bg_start', ok: false, error: String(e).slice(0, 200) },
    });
    console.warn('[Rail3][bg] startLocationUpdatesAsync failed', e);
  }
}

// Stop the background stream + clear context (the foreground socket path resumes).
export async function stopRail3BackgroundLocation(): Promise<void> {
  const running = await Location.hasStartedLocationUpdatesAsync(RAIL3_BG_LOCATION_TASK).catch(
    () => false,
  );
  if (running) await Location.stopLocationUpdatesAsync(RAIL3_BG_LOCATION_TASK);
  await AsyncStorage.removeItem(CTX_KEY);
}
