import { SUPABASE_URL, SUPABASE_ANON_KEY } from './env';
import { supabase } from './supabase';
import { logMeasurement } from './measure';
import { rail3RideTopic } from '../hooks/useRideChannel';

// Mirror of useFleetPositions.POSITION_EVENT — inlined to avoid a circular import.
const POSITION_EVENT = 'pos';

// Shared REST broadcast on the rail3 ride topic. REST (HTTP), NOT the websocket —
// a Doze/background context can't be trusted to keep a socket alive (W179), and the
// JS engine is frozen the instant the screen locks, so a websocket flush races the
// freeze and usually loses. A fresh user token authorizes the send RLS
// (rail3_broadcast_tenant_send → tenant member); getSession refreshes an expired one —
// load-bearing because a ride can outlive the 1-hour access token. Returns true if the
// POST went out, false if there was no token or it threw.
//
// USED BY: the Transistorsoft engine (bgGeo, via useFleetPositions) for every position
// ping, and by sendDormantPing below. (The old expo-location FGS TaskManager path that
// also used this was removed in W203 once Transistorsoft became the sole engine.)
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
    console.warn('[Rail3] broadcast failed', e);
    return false;
  }
}

// One-shot "I pocketed my phone" ping for the NO-background-tracking path (rider
// declined "Allow all the time", so the Transistorsoft FGS never starts). Sent over
// REST so it escapes before the OS freezes the JS engine on screen-lock — the fleet
// sees them go to SLEEP on purpose (calm) rather than decay into the alarming Dark.
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
