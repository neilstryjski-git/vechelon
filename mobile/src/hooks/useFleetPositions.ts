import { useEffect, useRef, useState } from 'react';
import * as Location from 'expo-location';

import { supabase } from '../lib/supabase';
import { useRideChannel } from './useRideChannel';
import type { LatLng } from '../lib/geo';
import type { FleetParticipant, RideRole, TacticalState } from '../lib/roleVisibility';

// Broadcast event name for position pings on the rail3:ride:<id> channel.
export const POSITION_EVENT = 'pos';

// Foreground ping cadence while the map screen is open (D-54 validation targets
// are W179's scope; these are the working defaults). Background GPS / screen-lock
// continuation is W176/W179 — this hook publishes while the app is foregrounded.
const PING_INTERVAL_MS = 5000;
const PING_DISTANCE_M = 10;

// The ping payload is MINIMAL by design (review finding, W172): no phone, no
// display name, no self-reported role. Identity attributes come from the
// RLS-gated roster (useRideRoster) — W170's channel authz is tenant-level, so
// anything in the payload is readable by every tenant member regardless of
// role; the §4.1 gates must therefore bind to server-enforced data, not to
// whatever a client chooses to broadcast.
interface PositionPayload {
  riderId: string;
  state: TacticalState;
  lat: number;
  lng: number;
  ts: number;
}

export interface RideRosterEntry {
  role: RideRole;
  displayName: string;
  phone: string | null;
  participantStatus: string | null;
}

export type RideRoster = Record<string, RideRosterEntry>;

// One-shot, RLS-gated roster read at mount (a meaningful event — never per
// ping). participant_tactical_select already encodes the §4.1 visibility
// matrix server-side: Captain/SAG receive every participant row; a Rider
// receives only Captain/SAG rows + their own. So the roster a client can see
// IS the set of riders it is allowed to identify — role, name, and phone are
// server-truth, immune to payload spoofing.
export function useRideRoster(rideId: string | null): { roster: RideRoster } {
  const [roster, setRoster] = useState<RideRoster>({});

  useEffect(() => {
    if (!rideId) return;
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from('ride_participants')
        .select('account_id, role, display_name, phone, status')
        .eq('ride_id', rideId);
      if (cancelled || error || !data) return;

      const next: RideRoster = {};
      for (const row of data) {
        if (!row.account_id) continue; // guest session rows without an account
        next[row.account_id] = {
          role: (row.role as RideRole) ?? 'member',
          displayName: row.display_name ?? 'Rider',
          phone: row.phone ?? null,
          participantStatus: row.status ?? null,
        };
      }
      setRoster(next);
    })();
    return () => {
      cancelled = true;
    };
  }, [rideId]);

  return { roster };
}

// Live fleet state for a ride: subscribes to the tenant-authorized Broadcast
// channel (W170) and renders ONLY from received broadcasts joined against the
// RLS-gated roster — no DB row per ping (Pillar II §2 / W172 pitfall). Pings
// from a rider NOT in the caller's roster are dropped: if the server didn't
// let us identify them, we don't render them.
//
// Tactical-state TRANSITIONS (stopped/inactive/dark by threshold) are W174's
// scope; until it lands every published ping carries state 'active' and the
// renderer draws whatever state arrives, so W174 plugs in without touching
// the map.
export function useFleetPositions(
  rideId: string | null,
  myRiderId: string | null,
  roster: RideRoster,
): {
  fleet: FleetParticipant[];
  myCoords: LatLng | null;
  channelStatus: ReturnType<typeof useRideChannel>['status'];
} {
  const { channel, status } = useRideChannel(rideId);
  const [pings, setPings] = useState<Record<string, PositionPayload>>({});
  const [myCoords, setMyCoords] = useState<LatLng | null>(null);
  const lastSentRef = useRef(0);

  // Receive: fold every position broadcast into the ping map, keyed by rider.
  useEffect(() => {
    if (!channel) return;
    setPings({});

    channel.on('broadcast', { event: POSITION_EVENT }, ({ payload }) => {
      const p = payload as PositionPayload;
      if (!p?.riderId || typeof p.lat !== 'number' || typeof p.lng !== 'number') return;
      setPings((prev) => ({ ...prev, [p.riderId]: p }));
    });
    // Broadcast/Presence handlers may bind after subscribe() (useRideChannel
    // already subscribed); postgres_changes may not — none are used here.
  }, [channel]);

  // Publish: watch the device position in the foreground and broadcast pings.
  useEffect(() => {
    if (!channel || status !== 'SUBSCRIBED' || !myRiderId || !rideId) return;
    let sub: Location.LocationSubscription | null = null;
    let cancelled = false;

    (async () => {
      const { status: perm } = await Location.requestForegroundPermissionsAsync();
      if (perm !== 'granted' || cancelled) return;

      sub = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.Balanced,
          timeInterval: PING_INTERVAL_MS,
          distanceInterval: PING_DISTANCE_M,
        },
        (loc) => {
          const coords = { lat: loc.coords.latitude, lng: loc.coords.longitude };
          setMyCoords(coords);

          // Throttle sends independently of the OS callback cadence.
          const now = Date.now();
          if (now - lastSentRef.current < PING_INTERVAL_MS) return;
          lastSentRef.current = now;

          const payload: PositionPayload = {
            riderId: myRiderId,
            state: 'active',
            lat: coords.lat,
            lng: coords.lng,
            ts: now,
          };
          // Ephemeral fan-out only — the send is RLS-authorized server-side
          // (W170 rail3_broadcast_tenant_send). Never a DB write.
          void channel.send({ type: 'broadcast', event: POSITION_EVENT, payload });
        },
      );
    })();

    return () => {
      cancelled = true;
      sub?.remove();
    };
  }, [channel, status, rideId, myRiderId]);

  // Join pings to the server-gated roster. Unknown riderIds are dropped — for
  // a Rider, "unknown" is exactly the set RLS hid (other riders), so the §4.1
  // visibility boundary holds even before the client-side role filter runs.
  const fleet: FleetParticipant[] = [];
  for (const [riderId, p] of Object.entries(pings)) {
    const entry = roster[riderId];
    if (!entry) continue;
    fleet.push({
      riderId,
      displayName: entry.displayName,
      role: entry.role,
      phone: entry.phone,
      accountStatus: entry.participantStatus,
      state: p.state ?? 'active',
      position: { lat: p.lat, lng: p.lng },
      lastPingAt: p.ts,
    });
  }

  return { fleet, myCoords, channelStatus: status };
}
