import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { supabase } from '../lib/supabase';
import { useRideChannel, type RideChannelStatus } from './useRideChannel';
import type { FleetParticipant, RideRole, TacticalState } from '../lib/roleVisibility';

// Broadcast event name for position pings on the rail3:ride:<id> channel.
export const POSITION_EVENT = 'pos';

// How long a rider may go without a ping before the race-control view treats
// their last-known marker as STALE. Foreground publishers ping every ~5s
// (PING_INTERVAL_MS on the mobile side), so three missed pings = stale. This is
// a PRESENTATION concern owned by the web consumer; the mobile tactical-state
// machine (stopped/inactive/dark transitions) is W174 and out of scope here.
export const FLEET_STALE_AFTER_MS = 15000;

const ROSTER_REFETCH_DEBOUNCE_MS = 10000;

// The ping payload is MINIMAL by design (review finding, W172): no phone, no
// display name, no self-reported role. Identity attributes come from the
// RLS-gated roster (useRideRoster) — W170's channel authz is tenant-level, so
// anything in the payload is readable by every tenant member regardless of
// role; the §4.1 gates must therefore bind to server-enforced data, not to
// whatever a client chooses to broadcast.
export interface PositionPayload {
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

// Guards a raw broadcast payload before it folds into fleet state. A spoofed or
// truncated ping with no riderId / non-numeric coords is dropped rather than
// rendered at (0,0). Exported so the validation is unit-testable.
export function isValidPositionPayload(p: unknown): p is PositionPayload {
  if (!p || typeof p !== 'object') return false;
  const c = p as Record<string, unknown>;
  return (
    typeof c.riderId === 'string' &&
    c.riderId.length > 0 &&
    typeof c.lat === 'number' &&
    typeof c.lng === 'number'
  );
}

// A rider's last ping is stale once it is older than the threshold. `null`
// (never pinged / no timestamp) counts as stale. Pure + exported for testing.
export function isStalePing(
  lastPingAt: number | null,
  now: number,
  thresholdMs: number = FLEET_STALE_AFTER_MS,
): boolean {
  if (lastPingAt == null) return true;
  return now - lastPingAt > thresholdMs;
}

// Joins received position pings to the server-gated roster, producing the
// renderable fleet. Unknown riderIds (not in the roster the server let us read)
// are dropped — for a Rider viewer, "unknown" is exactly the set RLS hid, so the
// §4.1 visibility boundary holds even before the client-side role filter runs.
// Pure function — exported for unit testing.
export function deriveFleet(
  pings: Record<string, PositionPayload>,
  roster: RideRoster,
): FleetParticipant[] {
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
  return fleet;
}

// Pings whose rider the server-gated roster can't identify — usually a mid-ride
// joiner the caller should (debounced) refetch the roster for. Pure + exported
// for testing; the hook wires the side effect into a post-commit useEffect so no
// state update fires during render.
export function unknownRiderIds(
  pings: Record<string, PositionPayload>,
  roster: RideRoster,
): string[] {
  return Object.keys(pings).filter((riderId) => !roster[riderId]);
}

// RLS-gated roster read at meaningful events only — never per ping.
// For the admin (race-control) viewer, existing ride_participants read access
// already permits the full roster; the same query is used by RideDetailSideSheet
// and AdminRideFeed. role/name/phone are server-truth, immune to payload
// spoofing. CAVEAT (defect 3623 / RP-16): an affiliated-tenant rider viewer can
// over-read participant rows incl. phone — the §4.1 phone gate (canSeePhone) is
// therefore enforced client-side, which is why the detail panel must consult it.
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

// Live fleet state for a ride, CONSUME-ONLY (W190 web port of the mobile hook):
// subscribes to the tenant-authorized Broadcast channel (W170) and renders ONLY
// from received broadcasts joined against the RLS-gated roster — no DB row per
// ping (Pillar II §2 / W172 pitfall) and NO publishing (the mobile expo-location
// watch/`channel.send()` half is intentionally absent; race control observes,
// it never reports a position).
export function useFleetPositions(
  rideId: string | null,
  roster: RideRoster,
  onUnknownRider?: () => void,
): {
  fleet: FleetParticipant[];
  channelStatus: RideChannelStatus;
} {
  const { channel, status } = useRideChannel(rideId);
  const [pings, setPings] = useState<Record<string, PositionPayload>>({});

  // Receive: fold every position broadcast into the ping map, keyed by rider.
  useEffect(() => {
    if (!channel) return;
    setPings({});

    channel.on('broadcast', { event: POSITION_EVENT }, ({ payload }) => {
      if (!isValidPositionPayload(payload)) return;
      setPings((prev) => ({ ...prev, [payload.riderId]: payload }));
    });
    // Broadcast handlers may bind after subscribe() (useRideChannel already
    // subscribed); postgres_changes may not — none are used here.
  }, [channel]);

  const fleet = useMemo(() => deriveFleet(pings, roster), [pings, roster]);

  // Mid-ride joiner detection runs post-commit, never during render: a ping
  // from a rider the roster can't identify asks for a (debounced) roster
  // refresh. Keyed on the set of unknown ids so a steady stream of the same
  // unknown rider doesn't re-fire beyond the debounce.
  const unknownKey = unknownRiderIds(pings, roster).join(',');
  useEffect(() => {
    if (unknownKey) onUnknownRider?.();
  }, [unknownKey, onUnknownRider]);

  return { fleet, channelStatus: status };
}
