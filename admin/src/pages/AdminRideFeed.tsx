import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAppStore } from '../store/useAppStore';
import { useToast } from '../store/useToast';
import { parsePoint } from '../lib/maps';
import PageHeader from '../components/PageHeader';

const PAGE_SIZE = 10;

interface RideRow {
  id: string;
  name: string;
  scheduled_start: string;
  start_label: string | null;
  start_coords: string | null;
  thumbnail_url: string | null;
  status: string;
}

const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });

const formatTime = (iso: string) =>
  new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

const AdminRideFeed: React.FC = () => {
  const navigate = useNavigate();
  const { addToast } = useToast();

  const isAdmin       = useAppStore((s) => s.isAdmin);
  const joinRide      = useAppStore((s) => s.joinRide);
  const setSelectedRideId = useAppStore((s) => s.setSelectedRideId);
  const currentTenantId   = useAppStore((s) => s.currentTenantId);

  const [rides, setRides]               = useState<RideRow[]>([]);
  const [offset, setOffset]             = useState(0);
  const [hasMore, setHasMore]           = useState(true);
  const [loading, setLoading]           = useState(false);
  const [joiningRides, setJoiningRides] = useState<Set<string>>(new Set());
  const [myParticipations, setMyParticipations] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!isAdmin) navigate('/');
  }, [isAdmin]);

  useEffect(() => {
    if (!currentTenantId) return;
    fetchPage(0);
  }, [currentTenantId]);

  const refreshParticipations = async (rideIds: string[]) => {
    if (rideIds.length === 0) return;
    const { data: { user } } = await supabase.auth.getUser();
    const sessionCookieId = useAppStore.getState().sessionCookieId;

    const query = supabase
      .from('ride_participants')
      .select('ride_id')
      .in('ride_id', rideIds);

    if (user) {
      query.eq('account_id', user.id);
    } else {
      query.eq('session_cookie_id', sessionCookieId).is('account_id', null);
    }

    const { data } = await query;
    setMyParticipations(new Set((data ?? []).map((r: any) => r.ride_id as string)));
  };

  const fetchPage = async (pageOffset: number) => {
    if (!currentTenantId) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('rides')
        .select('id, name, scheduled_start, start_label, start_coords, thumbnail_url, status')
        .eq('tenant_id', currentTenantId)
        .gte('scheduled_start', new Date().toISOString())
        .in('status', ['created'])
        .order('scheduled_start', { ascending: true })
        .range(pageOffset, pageOffset + PAGE_SIZE - 1);

      if (error) throw error;

      const rows = (data ?? []) as RideRow[];
      const accumulated = pageOffset === 0 ? rows : [...rides, ...rows];

      setRides(accumulated);
      setHasMore(rows.length === PAGE_SIZE);
      setOffset(pageOffset + rows.length);

      await refreshParticipations(accumulated.map((r) => r.id));
    } catch (e: any) {
      addToast(`Failed to load rides: ${e.message}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleJoin = async (ride: RideRow) => {
    setJoiningRides((prev) => new Set(prev).add(ride.id));
    try {
      await joinRide(ride.id);
      addToast('RSVP confirmed.', 'success');
      await refreshParticipations(rides.map((r) => r.id));
    } catch (e: any) {
      addToast(`Failed to RSVP: ${e.message}`, 'error');
    } finally {
      setJoiningRides((prev) => {
        const next = new Set(prev);
        next.delete(ride.id);
        return next;
      });
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-700">
      <PageHeader
        label="Admin"
        title="Ride Feed"
        description="All upcoming rides for your club."
      />

      {loading && rides.length === 0 && (
        <div className="space-y-3 max-w-2xl">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-32 rounded-2xl bg-surface-container-low animate-pulse" />
          ))}
        </div>
      )}

      {!loading && rides.length === 0 && (
        <div className="bg-surface-container-lowest rounded-2xl p-8 text-center border border-dashed border-outline-variant/30 space-y-4 max-w-2xl">
          <span className="material-symbols-outlined text-3xl text-on-surface-variant/40">
            event_busy
          </span>
          <p className="font-label text-xs text-on-surface-variant opacity-60">
            — No upcoming rides —
          </p>
        </div>
      )}

      {rides.length > 0 && (
        <div className="space-y-3 max-w-2xl">
          {rides.map((ride) => {
            const joined  = myParticipations.has(ride.id);
            const joining = joiningRides.has(ride.id);
            return (
              <div key={ride.id} className="bg-surface-container-lowest rounded-2xl overflow-hidden border border-outline-variant/10 shadow-ambient">
                {ride.thumbnail_url && (
                  <div className="h-32 w-full overflow-hidden">
                    <img src={ride.thumbnail_url} alt={ride.name} className="w-full h-full object-cover" />
                  </div>
                )}
                <div className="p-5 space-y-3">
                  <div>
                    <h3 className="font-headline font-bold text-lg text-on-background">{ride.name}</h3>
                    <p className="font-label text-[10px] text-on-surface-variant uppercase tracking-widest mt-0.5">
                      {formatDate(ride.scheduled_start)} · {formatTime(ride.scheduled_start)}
                    </p>
                    {ride.start_label && (() => {
                      const coords = parsePoint(ride.start_coords);
                      const mapsUrl = coords
                        ? `https://maps.google.com/?q=${coords.lat},${coords.lng}`
                        : `https://maps.google.com/?q=${encodeURIComponent(ride.start_label)}`;
                      return (
                        <a href={mapsUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-body text-xs text-brand-primary/70 hover:text-brand-primary mt-1 transition-colors">
                          <span className="material-symbols-outlined text-[12px] align-middle">location_on</span>
                          {ride.start_label}
                        </a>
                      );
                    })()}
                  </div>
                  <div className="flex items-center gap-3">
                    {joined ? (
                      <div className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-tertiary/10 text-tertiary rounded-xl border border-tertiary/20">
                        <span className="material-symbols-outlined text-base">check_circle</span>
                        <span className="font-headline font-bold uppercase tracking-widest text-[10px]">RSVP Confirmed</span>
                      </div>
                    ) : (
                      <button
                        onClick={() => handleJoin(ride)}
                        disabled={joining}
                        className="flex-1 signature-gradient text-on-primary py-2.5 rounded-xl font-headline font-bold flex items-center justify-center gap-2 hover:opacity-90 transition-all active:scale-[0.98] disabled:opacity-50 text-[11px] uppercase tracking-widest"
                      >
                        <span className="material-symbols-outlined text-base">event_available</span>
                        {joining ? 'Synchronizing…' : 'RSVP Now'}
                      </button>
                    )}
                    <button
                      onClick={() => setSelectedRideId(ride.id)}
                      className="px-4 py-2.5 rounded-xl border border-outline-variant/30 font-label text-[10px] uppercase tracking-widest text-on-surface-variant hover:bg-surface-container-low hover:text-brand-primary transition-colors whitespace-nowrap"
                    >
                      View Details
                    </button>
                  </div>
                </div>
              </div>
            );
          })}

          {hasMore && (
            <button
              onClick={() => fetchPage(offset)}
              disabled={loading}
              className="w-full py-3 rounded-2xl border border-outline-variant/30 font-label text-[10px] uppercase tracking-widest text-on-surface-variant hover:bg-surface-container-low transition-colors disabled:opacity-50"
            >
              {loading ? 'Loading…' : 'Load More'}
            </button>
          )}
        </div>
      )}
    </div>
  );
};

export default AdminRideFeed;
