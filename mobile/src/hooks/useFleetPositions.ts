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

interface PositionPayload {
  riderId: string;
  displayName: string;
  role: RideRole;
  phone: string | null;
  accountStatus: string | null;
  state: TacticalState;
  lat: number;
  lng: number;
  ts: number;
}

// Live fleet state for a ride: subscribes to the tenant-authorized Broadcast
// channel (W170) and renders ONLY from received broadcasts — no DB row per ping
// (Pillar II §2 / W172 pitfall). Also publishes this device's own position so
// every subscribed Captain/SAG sees it.
//
// Tactical-state TRANSITIONS (stopped/inactive/dark by threshold) are W174's
// scope; until it lands every published ping carries state 'active' and the
// renderer simply draws whatever state arrives, so W174 plugs in without
// touching the map.
export function useFleetPositions(
  rideId: string | null,
  me: { riderId: string; displayName: string; role: RideRole; phone: string | null } | null,
): {
  fleet: FleetParticipant[];
  myCoords: LatLng | null;
  channelStatus: ReturnType<typeof useRideChannel>['status'];
} {
  const { channel, status } = useRideChannel(rideId);
  const [fleetMap, setFleetMap] = useState<Record<string, FleetParticipant>>({});
  const [myCoords, setMyCoords] = useState<LatLng | null>(null);
  const lastSentRef = useRef(0);

  // Receive: fold every position broadcast into the fleet map, keyed by rider.
  useEffect(() => {
    if (!channel) return;
    setFleetMap({});

    channel.on('broadcast', { event: POSITION_EVENT }, ({ payload }) => {
      const p = payload as PositionPayload;
      if (!p?.riderId) return;
      setFleetMap((prev) => ({
        ...prev,
        [p.riderId]: {
          riderId: p.riderId,
          displayName: p.displayName,
          role: p.role,
          phone: p.phone,
          accountStatus: p.accountStatus,
          state: p.state ?? 'active',
          position: { lat: p.lat, lng: p.lng },
          lastPingAt: p.ts,
        },
      }));
    });
    // Broadcast/Presence handlers may bind after subscribe() (useRideChannel
    // already subscribed); postgres_changes may not — none are used here.
  }, [channel]);

  // Publish: watch the device position in the foreground and broadcast pings.
  useEffect(() => {
    if (!channel || status !== 'SUBSCRIBED' || !me || !rideId) return;
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
            riderId: me.riderId,
            displayName: me.displayName,
            role: me.role,
            phone: me.phone,
            accountStatus: null,
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
  }, [channel, status, rideId, me?.riderId]);

  return { fleet: Object.values(fleetMap), myCoords, channelStatus: status };
}

// Loads the signed-in user's identity for publishing: display name + phone from
// accounts (self-readable under RLS), role from ride_participants.
export function useMyFleetIdentity(rideId: string | null): {
  me: { riderId: string; displayName: string; role: RideRole; phone: string | null } | null;
} {
  const [me, setMe] = useState<{
    riderId: string;
    displayName: string;
    role: RideRole;
    phone: string | null;
  } | null>(null);

  useEffect(() => {
    if (!rideId) return;
    let cancelled = false;
    (async () => {
      const { data: auth } = await supabase.auth.getUser();
      const userId = auth.user?.id;
      if (!userId || cancelled) return;

      const [{ data: account }, { data: part }] = await Promise.all([
        supabase.from('accounts').select('name, email, phone').eq('id', userId).maybeSingle(),
        supabase
          .from('ride_participants')
          .select('role')
          .eq('ride_id', rideId)
          .eq('account_id', userId)
          .maybeSingle(),
      ]);
      if (cancelled) return;

      setMe({
        riderId: userId,
        displayName: account?.name ?? account?.email ?? 'Rider',
        role: (part?.role as RideRole) ?? 'member',
        phone: account?.phone ?? null,
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [rideId]);

  return { me };
}
