import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import { useAppStore } from '../store/useAppStore';
import { supabase } from '../lib/supabase';

interface ActiveRide {
  id: string;
  name: string | null;
  scheduled_start: string | null;
  start_label: string | null;
}

// Race Control landing (W192): lists the tenant's ACTIVE rides as clickable
// cards so an operator picks a ride without hand-copying a UUID. Each card
// links to the live fleet view at /race-control/:rideId.
export default function RaceControlIndex() {
  const currentTenantId = useAppStore((s) => s.currentTenantId);
  const [rides, setRides] = useState<ActiveRide[] | null>(null);

  useEffect(() => {
    if (!currentTenantId) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('rides')
        .select('id, name, scheduled_start, start_label')
        .eq('tenant_id', currentTenantId)
        .eq('status', 'active')
        .order('created_at', { ascending: false });
      if (!cancelled) setRides((data as ActiveRide[]) ?? []);
    })();
    return () => {
      cancelled = true;
    };
  }, [currentTenantId]);

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <header className="mb-4">
        <h1 className="font-label text-[11px] uppercase tracking-widest font-bold text-on-surface">
          Race Control
        </h1>
        <p className="text-[10px] text-on-surface-variant/70 mt-0.5">Pick an active ride to track its fleet live.</p>
      </header>

      {rides === null || !currentTenantId ? (
        <div className="font-label text-[10px] uppercase tracking-widest text-on-surface-variant animate-pulse py-10 text-center">
          Loading active rides…
        </div>
      ) : rides.length === 0 ? (
        <div className="flex flex-col items-center justify-center text-center font-label py-16 text-on-surface-variant">
          <span className="material-symbols-outlined text-4xl mb-3 text-on-surface-variant/40">satellite_alt</span>
          <p className="text-[11px] uppercase tracking-widest font-bold">No active rides</p>
          <p className="text-xs mt-2 opacity-70 max-w-xs">
            A ride shows up here once it's live. Start an Ad Hoc ride from the mobile app, then refresh.
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {rides.map((r) => (
            <li key={r.id}>
              <Link
                to={`/race-control/${r.id}`}
                className="flex items-center justify-between gap-3 p-4 rounded-lg border border-outline-variant/40 hover:bg-surface-container-high/60 transition-colors"
              >
                <span className="min-w-0">
                  <span className="block text-sm text-on-surface truncate">{r.name || 'Untitled ride'}</span>
                  <span className="block font-label text-[9px] uppercase tracking-wider text-green-600 mt-1">
                    ● Live{r.start_label ? ` · ${r.start_label}` : ''}
                  </span>
                </span>
                <span className="material-symbols-outlined text-on-surface-variant/50 shrink-0">chevron_right</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
