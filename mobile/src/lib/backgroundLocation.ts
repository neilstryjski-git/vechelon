import * as TaskManager from 'expo-task-manager';
import * as Location from 'expo-location';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { SUPABASE_URL, SUPABASE_ANON_KEY } from './env';
import { supabase } from './supabase';
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

  // Fresh user token authorizes the send RLS (rail3_broadcast_tenant_send →
  // tenant member). getSession refreshes an expired token; rides can outlive the
  // 1-hour access token, so this is load-bearing for long rides.
  const { data: s } = await supabase.auth.getSession();
  const token = s.session?.access_token;
  if (!token) return;

  const payload = {
    riderId: ctx.riderId,
    state: 'active',
    lat: loc.coords.latitude,
    lng: loc.coords.longitude,
    ts: Date.now(),
  };
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
          { topic: rail3RideTopic(ctx.rideId), event: POSITION_EVENT, private: true, payload },
        ],
      }),
    });
  } catch (e) {
    console.warn('[Rail3][bg] broadcast failed', e);
  }
});

// Start the foreground-service-backed background location stream for an active
// ride. Idempotent. Caller must already hold BACKGROUND location permission.
export async function startRail3BackgroundLocation(ctx: BgLocationCtx): Promise<void> {
  await AsyncStorage.setItem(CTX_KEY, JSON.stringify(ctx));
  const running = await Location.hasStartedLocationUpdatesAsync(RAIL3_BG_LOCATION_TASK).catch(
    () => false,
  );
  if (running) return;
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
}

// Stop the background stream + clear context (the foreground socket path resumes).
export async function stopRail3BackgroundLocation(): Promise<void> {
  const running = await Location.hasStartedLocationUpdatesAsync(RAIL3_BG_LOCATION_TASK).catch(
    () => false,
  );
  if (running) await Location.stopLocationUpdatesAsync(RAIL3_BG_LOCATION_TASK);
  await AsyncStorage.removeItem(CTX_KEY);
}
