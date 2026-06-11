import { useCallback, useEffect, useRef, useState } from 'react';
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

// RLS-gated roster read at meaningful events only — never per ping.
// participant_tactical_select encodes the §4.1 matrix server-side for
// non-affiliated tenants (Captain/SAG: every row; Rider: Captain/SAG + self),
// and role/name/phone are server-truth, immune to payload spoofing. CAVEAT
// (review 90480ee): the policy's RP-16 affiliated-tenant disjunct returns ALL
// participant rows (incl. phone) to affiliated Riders, so there the phone gate
// is client-side only — pre-existing policy breadth, tracked as a follow-up
// defect to column-restrict RP-16.
export function useRideRoster(rideId: string | null): {
  roster: RideRoster;
  refetchRoster: () => void;
} {
  const [roster, setRoster] = useState<RideRoster>({});
  const [fetchTick, setFetchTick] = useState(0);
  const lastFetchRef = useRef(0);

  // A ping from a rider the roster can't identify usually means someone joined
  // mid-ride (e.g. scanned the QR after this viewer opened the map) — refetch,
  // debounced so a storm of unknown pings still costs one read (DB reads stay
  // at meaningful events, per Pillar II §2).
  const refetchRoster = useCallback(() => {
    const now = Date.now();
    if (now - lastFetchRef.current < ROSTER_REFETCH_DEBOUNCE_MS) return;
    lastFetchRef.current = now;
    setFetchTick((t) => t + 1);
  }, []);

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
  }, [rideId, fetchTick]);

  return { roster, refetchRoster };
}

const ROSTER_REFETCH_DEBOUNCE_MS = 10000;

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
  onUnknownRider?: () => void,
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
    if (!entry) {
      // Likely a mid-ride joiner — ask for a (debounced) roster refresh; the
      // ping stays hidden until the server-gated roster can identify them.
      onUnknownRider?.();
      continue;
    }
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
