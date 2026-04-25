import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { useAppStore } from '../../store/useAppStore';
import { useToast } from '../../store/useToast';

interface RideRow {
  id: string;
  name: string;
  scheduled_start: string;
  start_label: string | null;
  thumbnail_url: string | null;
  status: string;
}

function useNextRide(enabled: boolean) {
  return useQuery<RideRow | null>({
    queryKey: ['next-ride'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('rides')
        .select('id, name, scheduled_start, start_label, thumbnail_url, status')
        .gte('scheduled_start', new Date().toISOString())
        .in('status', ['created', 'active'])
        .order('scheduled_start', { ascending: true })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled,
  });
}

function useUpcomingRides(enabled: boolean) {
  const thirtyDaysOut = new Date();
  thirtyDaysOut.setDate(thirtyDaysOut.getDate() + 30);
  return useQuery<RideRow[]>({
    queryKey: ['upcoming-rides'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('rides')
        .select('id, name, scheduled_start, start_label, thumbnail_url, status')
        .gte('scheduled_start', new Date().toISOString())
        .lte('scheduled_start', thirtyDaysOut.toISOString())
        .eq('status', 'created')
        .order('scheduled_start', { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
    enabled,
  });
}

function useMyParticipations(rideIds: string[]) {
  return useQuery<Set<string>>({
    queryKey: ['my-participations', rideIds],
    queryFn: async () => {
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
      return new Set((data ?? []).map((r: any) => r.ride_id as string));
    },
    enabled: rideIds.length > 0,
  });
}

const RiderHome: React.FC = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { addToast } = useToast();
  const userTier = useAppStore((s) => s.userTier);
  const joinRide = useAppStore((s) => s.joinRide);
  const setSelectedRideId = useAppStore((s) => s.setSelectedRideId);

  const tenant = queryClient.getQueryData<{ name?: string; logo_url?: string }>(['tenant-config']);

  const isGuest = userTier === 'guest';
  const isInitiated = userTier === 'initiated';
  const isAffiliated = userTier === 'affiliated';

  // Initiated: single next ride
  const { data: nextRide, isLoading: nextRideLoading } = useNextRide(isInitiated);

  // Affiliated: scrollable upcoming list (next 30 days, created only)
  const { data: upcomingRides = [], isLoading: upcomingLoading } = useUpcomingRides(isAffiliated);
  const rideIds = upcomingRides.map(r => r.id);
  const { data: myParticipations = new Set<string>() } = useMyParticipations(rideIds);

  const [joiningRides, setJoiningRides] = useState<Set<string>>(new Set());

  const handleJoin = async (ride: RideRow) => {
    setJoiningRides(prev => new Set(prev).add(ride.id));
    try {
      await joinRide(ride.id);
      addToast('RSVP confirmed.', 'success');
      queryClient.invalidateQueries({ queryKey: ['my-participations'] });
    } catch (e: any) {
      addToast(`Failed to RSVP: ${e.message}`, 'error');
    } finally {
      setJoiningRides(prev => {
        const next = new Set(prev);
        next.delete(ride.id);
        return next;
      });
    }
  };

  const [sessionConfirmed, setSessionConfirmed] = useState(false);
  const [sessionExists, setSessionExists] = useState(false);
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSessionExists(!!data.session);
      setSessionConfirmed(true);
    });
  }, []);

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });

  const formatTime = (iso: string) =>
    new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

  return (
    <div className="space-y-16 animate-in fade-in duration-700">

      {/* Hero */}
      <section className="text-center space-y-4 pt-8">
        <p className="font-label text-[10px] uppercase tracking-[0.3em] text-on-surface-variant">
          Welcome to the Portal
        </p>
        <h1 className="font-headline font-extrabold text-5xl md:text-7xl tracking-tighter italic text-on-background uppercase">
          {tenant?.name || 'VECHELON'}
        </h1>
        <p className="font-body text-sm text-on-surface-variant max-w-md mx-auto leading-relaxed">
          Tactical command for the {tenant?.name || 'club'} peloton. Coordinate rides, track your history, and stay mission-ready.
        </p>
      </section>

      {/* Affiliated: scrollable upcoming rides list */}
      {isAffiliated && (
        <section className="max-w-lg mx-auto">
          <p className="font-label text-[10px] uppercase tracking-[0.2em] text-on-surface-variant mb-4">
            Upcoming Rides
          </p>

          {upcomingLoading ? (
            <div className="space-y-3">
              {[0, 1, 2].map(i => (
                <div key={i} className="h-32 rounded-2xl bg-surface-container-low animate-pulse" />
              ))}
            </div>
          ) : upcomingRides.length === 0 ? (
            <div className="bg-surface-container-lowest rounded-2xl p-8 text-center border border-dashed border-outline-variant/30 space-y-4">
              <p className="font-label text-xs text-on-surface-variant opacity-60">
                — No upcoming missions in the next 30 days —
              </p>
              <button
                onClick={() => navigate('/calendar')}
                className="font-label text-[10px] uppercase tracking-widest text-brand-primary hover:opacity-70 transition-opacity flex items-center gap-1.5 mx-auto"
              >
                <span className="material-symbols-outlined text-sm">calendar_month</span>
                View Full Calendar
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {upcomingRides.map(ride => {
                const joined = myParticipations.has(ride.id);
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
                        {ride.start_label && (
                          <p className="font-body text-xs text-on-surface-variant mt-1">
                            <span className="material-symbols-outlined text-[12px] align-middle mr-1">location_on</span>
                            {ride.start_label}
                          </p>
                        )}
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
            </div>
          )}
        </section>
      )}

      {/* Initiated: single next ride card */}
      {isInitiated && (
        <section className="max-w-lg mx-auto">
          <p className="font-label text-[10px] uppercase tracking-[0.2em] text-on-surface-variant mb-4">
            Next Scheduled Ride
          </p>

          {nextRideLoading ? (
            <div className="h-48 rounded-2xl bg-surface-container-low animate-pulse" />
          ) : nextRide ? (
            <div className="bg-surface-container-lowest rounded-2xl shadow-ambient overflow-hidden border border-outline-variant/10">
              {nextRide.thumbnail_url && (
                <div className="h-40 w-full overflow-hidden">
                  <img src={nextRide.thumbnail_url} alt={nextRide.name} className="w-full h-full object-cover" />
                </div>
              )}
              <div className="p-6 space-y-4">
                <div>
                  <h3 className="font-headline font-bold text-xl text-on-background">{nextRide.name}</h3>
                  <p className="font-label text-[10px] text-on-surface-variant uppercase tracking-widest mt-1">
                    {formatDate(nextRide.scheduled_start)} · {formatTime(nextRide.scheduled_start)}
                  </p>
                  {nextRide.start_label && (
                    <p className="font-body text-xs text-on-surface-variant mt-1">
                      <span className="material-symbols-outlined text-[12px] align-middle mr-1">location_on</span>
                      {nextRide.start_label}
                    </p>
                  )}
                </div>
                <div className="space-y-4 pt-2">
                  <p className="font-label text-[10px] text-on-surface-variant/60 italic leading-relaxed uppercase tracking-wide">
                    Your membership is pending tactical activation.
                    Full RSVP access will unlock once command validates your status.
                  </p>
                  <button
                    disabled
                    className="w-full bg-surface-container-high text-on-surface-variant/40 py-3 rounded-xl font-headline font-bold uppercase tracking-widest text-[10px] cursor-not-allowed border border-outline-variant/10"
                  >
                    Awaiting Activation
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-surface-container-lowest rounded-2xl p-8 text-center border border-dashed border-outline-variant/30">
              <p className="font-label text-xs text-on-surface-variant opacity-60">— No upcoming missions scheduled —</p>
            </div>
          )}
        </section>
      )}

      {/* Authenticated but no club record yet */}
      {isGuest && sessionConfirmed && sessionExists && (
        <section className="max-w-lg mx-auto">
          <div className="bg-surface-container-low rounded-2xl p-8 space-y-4 border border-outline-variant/10 text-center">
            <span className="material-symbols-outlined text-on-surface-variant text-3xl">refresh</span>
            <p className="font-headline font-bold text-on-background">Setting up your account…</p>
            <p className="font-body text-sm text-on-surface-variant">Your session is active but your membership record is still initializing.</p>
            <button
              onClick={() => window.location.reload()}
              className="signature-gradient text-on-primary px-6 py-3 rounded-xl font-headline font-bold uppercase tracking-widest text-sm hover:opacity-90 transition-all"
            >
              Reload
            </button>
          </div>
        </section>
      )}

      {/* Guest conversion CTA */}
      {isGuest && sessionConfirmed && !sessionExists && (
        <section className="max-w-lg mx-auto">
          <div className="bg-surface-container-low rounded-2xl p-8 space-y-6 border border-outline-variant/10">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                <span className="material-symbols-outlined text-primary text-xl">group</span>
              </div>
              <div>
                <h3 className="font-headline font-bold text-lg text-on-background">Join the Club</h3>
                <p className="font-label text-[10px] uppercase tracking-widest text-on-surface-variant">
                  Membership Portal
                </p>
              </div>
            </div>
            <div className="grid grid-cols-1 gap-3">
              {[
                { icon: 'route', label: 'Access the full route library' },
                { icon: 'calendar_month', label: 'See and RSVP to all rides' },
                { icon: 'group', label: 'Connect with the peloton' },
              ].map(({ icon, label }) => (
                <div key={icon} className="flex items-center gap-3">
                  <span className="material-symbols-outlined text-tertiary text-base">{icon}</span>
                  <span className="font-body text-sm text-on-surface-variant">{label}</span>
                </div>
              ))}
            </div>
            <button
              onClick={() => navigate('/auth')}
              className="w-full signature-gradient text-on-primary py-3.5 rounded-xl font-headline font-bold flex items-center justify-center gap-2 hover:opacity-90 transition-all active:scale-[0.98]"
            >
              <span className="material-symbols-outlined text-lg">login</span>
              Sign In / Register
            </button>
          </div>
        </section>
      )}

    </div>
  );
};

export default RiderHome;
