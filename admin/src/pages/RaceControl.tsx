import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';

import {
  useRideRoster,
  useFleetPositions,
  isStalePing,
} from '../hooks/useFleetPositions';
import {
  visibleParticipants,
  type RideRole,
} from '../lib/roleVisibility';
import FleetMap, { type FleetMapMarker } from '../components/FleetMap';

// The race-control operator is an admin observing the whole fleet, so the §4.1
// matrix is evaluated at the highest-visibility role: Captain sees every rider.
const OPERATOR_ROLE: RideRole = 'captain';
// Sentinel "self" id — the operator is not a rider on the map, so nothing is
// filtered out as self by visibleParticipants.
const OPERATOR_ID = '';

const ROLE_LABEL: Record<RideRole, string> = {
  captain: 'Captain',
  support: 'SAG',
  member: 'Rider',
  guest: 'Guest',
};

// Re-evaluate staleness / "Ns ago" on this cadence even when no ping arrives, so
// a rider who stops broadcasting visibly degrades to STALE instead of freezing.
const STALENESS_TICK_MS = 5000;

function secondsAgo(lastPingAt: number | null, now: number): string {
  if (lastPingAt == null) return '—';
  const s = Math.max(0, Math.round((now - lastPingAt) / 1000));
  return `${s}s ago`;
}

export default function RaceControl() {
  const { rideId } = useParams<{ rideId: string }>();

  const { roster, refetchRoster } = useRideRoster(rideId ?? null);
  const { fleet, channelStatus } = useFleetPositions(rideId ?? null, roster, refetchRoster);

  const [now, setNow] = useState(() => Date.now());
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), STALENESS_TICK_MS);
    return () => clearInterval(t);
  }, []);

  const visible = useMemo(
    () => visibleParticipants(OPERATOR_ROLE, OPERATOR_ID, fleet),
    [fleet],
  );

  const markers: FleetMapMarker[] = useMemo(
    () =>
      visible
        .filter((p) => p.position != null)
        .map((p) => ({
          id: p.riderId,
          position: p.position!,
          label: `${p.displayName} · ${ROLE_LABEL[p.role]}`,
          role: p.role,
          stale: isStalePing(p.lastPingAt, now),
        })),
    [visible, now],
  );

  const liveCount = markers.filter((m) => !m.stale).length;

  const selectedRider = useMemo(
    () => visible.find((p) => p.riderId === selectedId) ?? null,
    [visible, selectedId],
  );
  // The race-control operator is an admin DISPATCHER, not a peer rider — the §4.1
  // contact matrix (which hides e.g. captain↔captain) does not apply here. The
  // operator sees every visible rider's contact when it's on file.
  const canContactSelected = selectedRider != null;

  if (!rideId) {
    return (
      <div className="p-20 text-center font-label text-error">No ride selected.</div>
    );
  }

  // Server denied the private channel (cross-tenant viewer, no membership, or
  // realtime authz unavailable in this environment). The W170 gate is enforced
  // server-side regardless of what the client renders.
  const denied = channelStatus === 'CHANNEL_ERROR' || channelStatus === 'TIMED_OUT';
  const connecting = channelStatus == null || channelStatus === 'CLOSED';

  return (
    <div className="flex flex-col h-full min-h-[70vh]">
      <header className="flex items-center justify-between px-4 py-3 border-b border-outline-variant/40">
        <div>
          <h1 className="font-label text-[11px] uppercase tracking-widest font-bold text-on-surface">
            Race Control
          </h1>
          <p className="text-[10px] text-on-surface-variant/70 mt-0.5">Ride {rideId}</p>
        </div>
        <div className="flex items-center gap-2 font-label text-[10px] uppercase tracking-wider">
          <span
            className={`inline-block w-2 h-2 rounded-full ${
              denied ? 'bg-error' : connecting ? 'bg-amber-400 animate-pulse' : 'bg-green-500'
            }`}
            aria-hidden
          />
          <span className="text-on-surface-variant">
            {denied ? 'Denied' : connecting ? 'Connecting' : `${liveCount} live`}
          </span>
        </div>
      </header>

      {denied ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center font-label p-10 text-on-surface-variant">
          <span className="material-symbols-outlined text-4xl mb-3 text-error/60">wifi_off</span>
          <p className="text-[11px] uppercase tracking-widest font-bold">Channel access denied</p>
          <p className="text-xs mt-2 max-w-sm opacity-70">
            The live ride channel could not be joined. This ride may belong to another club, or live
            tracking is not available in this environment.
          </p>
        </div>
      ) : (
        <div className="flex-1 flex flex-col md:flex-row min-h-0">
          <div className="flex-1 relative min-h-[300px]">
            <FleetMap markers={markers} onMarkerClick={setSelectedId} className="w-full h-full" />
            {connecting && (
              <div className="absolute inset-0 flex items-center justify-center bg-surface/40 font-label text-[10px] uppercase tracking-widest text-on-surface-variant animate-pulse">
                Connecting to live ride…
              </div>
            )}
            {!connecting && markers.length === 0 && (
              <div className="absolute inset-x-0 top-3 flex justify-center pointer-events-none">
                <span className="font-label text-[10px] uppercase tracking-widest bg-surface-container-high/90 text-on-surface-variant px-3 py-1.5 rounded-full">
                  Waiting for riders to go live…
                </span>
              </div>
            )}
            {selectedRider && (
              <div className="absolute bottom-3 left-3 right-3 md:right-auto md:w-80 bg-surface border border-outline-variant/50 rounded-lg shadow-lg p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-on-surface truncate">{selectedRider.displayName}</p>
                    <p className="font-label text-[9px] uppercase tracking-wider text-on-surface-variant/70 mt-0.5">
                      {ROLE_LABEL[selectedRider.role]} ·{' '}
                      <span className={isStalePing(selectedRider.lastPingAt, now) ? 'text-error/80' : 'text-green-600'}>
                        {isStalePing(selectedRider.lastPingAt, now) ? 'Stale' : 'Live'}
                      </span>{' '}
                      · {secondsAgo(selectedRider.lastPingAt, now)}
                    </p>
                  </div>
                  <button
                    onClick={() => setSelectedId(null)}
                    className="text-on-surface-variant/60 hover:text-on-surface shrink-0"
                    aria-label="Close"
                  >
                    <span className="material-symbols-outlined text-lg">close</span>
                  </button>
                </div>
                <div className="mt-2 space-y-1.5">
                  {canContactSelected && selectedRider.email && (
                    <a href={`mailto:${selectedRider.email}`} className="flex items-center gap-2 text-xs text-primary hover:underline break-all">
                      <span className="material-symbols-outlined text-sm shrink-0">mail</span>
                      {selectedRider.email}
                    </a>
                  )}
                  {canContactSelected && selectedRider.phone && (
                    <a href={`tel:${selectedRider.phone}`} className="flex items-center gap-2 text-xs text-primary hover:underline">
                      <span className="material-symbols-outlined text-sm shrink-0">call</span>
                      {selectedRider.phone}
                    </a>
                  )}
                  {canContactSelected && !selectedRider.email && !selectedRider.phone && (
                    <p className="text-[10px] text-on-surface-variant/60 font-label uppercase tracking-wider">No contact on file</p>
                  )}
                  {!canContactSelected && (
                    <p className="text-[10px] text-on-surface-variant/60 font-label uppercase tracking-wider">Contact hidden for this role</p>
                  )}
                </div>
              </div>
            )}
          </div>

          <aside className="w-full md:w-72 border-t md:border-t-0 md:border-l border-outline-variant/40 overflow-y-auto">
            <h2 className="font-label text-[10px] uppercase tracking-widest font-bold text-on-surface-variant px-4 py-2.5 sticky top-0 bg-surface">
              Fleet · {visible.length}
            </h2>
            {visible.length === 0 ? (
              <p className="px-4 py-3 text-xs text-on-surface-variant/60 font-label">No riders broadcasting.</p>
            ) : (
              <ul>
                {visible.map((p) => {
                  const stale = isStalePing(p.lastPingAt, now);
                  const showPhone = p.phone; // operator (dispatcher) sees all contact
                  return (
                    <li
                      key={p.riderId}
                      onClick={() => setSelectedId(p.riderId)}
                      className={`px-4 py-2.5 border-b border-outline-variant/20 cursor-pointer hover:bg-surface-container-high/50 ${
                        selectedId === p.riderId ? 'bg-surface-container-high/70' : ''
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm text-on-surface truncate">{p.displayName}</span>
                        <span className="font-label text-[9px] uppercase tracking-wider text-on-surface-variant/70 shrink-0">
                          {ROLE_LABEL[p.role]}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-2 mt-1">
                        <span
                          className={`font-label text-[9px] uppercase tracking-wider ${
                            stale ? 'text-error/80' : 'text-green-600'
                          }`}
                        >
                          {stale ? 'Stale' : 'Live'} · {secondsAgo(p.lastPingAt, now)}
                        </span>
                        {showPhone && (
                          <a
                            href={`tel:${p.phone}`}
                            onClick={(e) => e.stopPropagation()}
                            className="font-mono text-[10px] text-primary hover:underline shrink-0"
                          >
                            {p.phone}
                          </a>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </aside>
        </div>
      )}
    </div>
  );
}
