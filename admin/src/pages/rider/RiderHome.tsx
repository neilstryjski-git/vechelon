import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { useAppStore } from '../../store/useAppStore';
import { useToast } from '../../store/useToast';

interface NextRide {
  id: string;
  name: string;
  scheduled_start: string;
  start_label: string | null;
  thumbnail_url: string | null;
  status: string;
}

function useNextRide() {
  return useQuery<NextRide | null>({
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
  });
}

const RiderHome: React.FC = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { addToast } = useToast();
  const userTier = useAppStore((s) => s.userTier);
  const joinRide = useAppStore((s) => s.joinRide);
  const { data: nextRide, isLoading } = useNextRide();

  const tenant = queryClient.getQueryData<{ name?: string, logo_url?: string }>(['tenant-config']);

  const [isJoining, setIsJoining] = useState(false);

  // Check if already joined
  const { data: participation } = useQuery({
    queryKey: ['my-participation', nextRide?.id],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      const sessionCookieId = useAppStore.getState().sessionCookieId;
      if (!nextRide?.id) return null;

      const query = supabase
        .from('ride_participants')
        .select('id')
        .eq('ride_id', nextRide.id);

      if (user) {
        query.eq('account_id', user.id);
      } else {
        query.eq('session_cookie_id', sessionCookieId).is('account_id', null);
      }

      const { data } = await query.maybeSingle();
      return data;
    },
    enabled: !!nextRide?.id,
  });

  const handleJoin = async () => {
    if (!nextRide) return;
    setIsJoining(true);
    try {
      await joinRide(nextRide.id);
      addToast(nextRide.status === 'active' ? 'You have joined the ride!' : 'RSVP confirmed.', 'success');
      queryClient.invalidateQueries({ queryKey: ['my-participation', nextRide.id] });
      queryClient.invalidateQueries({ queryKey: ['ride-participants', nextRide.id] });
    } catch (e: any) {
      addToast(`Failed to join: ${e.message}`, 'error');
    } finally {
      setIsJoining(false);
    }
  };

  const isGuest = userTier === 'guest';
  const isInitiated = userTier === 'initiated';

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString('en-GB', {
      weekday: 'long', day: 'numeric', month: 'long',
    });

  const formatTime = (iso: string) =>
    new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

  return (
    <div className="space-y-16 animate-in fade-in duration-700">

      {/* Hero - Dynamic Branding */}
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

      {/* Next Ride Card — visible to initiated + affiliated */}
      {!isGuest && (
        <section className="max-w-lg mx-auto">
          <p className="font-label text-[10px] uppercase tracking-[0.2em] text-on-surface-variant mb-4">
            Next Scheduled Ride
          </p>

          {isLoading ? (
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

                {isInitiated ? (
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
                ) : participation ? (
                  <div className="flex items-center justify-center gap-2 py-3 bg-tertiary/10 text-tertiary rounded-xl border border-tertiary/20">
                    <span className="material-symbols-outlined text-lg">check_circle</span>
                    <span className="font-headline font-bold uppercase tracking-widest text-[10px]">
                      {nextRide.status === 'active' ? 'Joined' : 'RSVP Confirmed'}
                    </span>
                  </div>
                ) : (
                  <div className="flex gap-3">
                    <button
                      onClick={handleJoin}
                      disabled={isJoining}
                      className="flex-1 signature-gradient text-on-primary py-3 rounded-xl font-headline font-bold flex items-center justify-center gap-2 hover:opacity-90 transition-all active:scale-[0.98] disabled:opacity-50 shadow-ambient"
                    >
                      <span className="material-symbols-outlined text-lg">
                        {nextRide.status === 'active' ? 'play_circle' : 'event_available'}
                      </span>
                      {isJoining ? 'Synchronizing…' : (nextRide.status === 'active' ? 'Join Ride' : 'RSVP Now')}
                    </button>
                    <button
                      onClick={() => navigate('/calendar')}
                      className="px-4 py-3 rounded-xl border border-outline-variant/30 text-on-surface-variant hover:bg-surface-container-low transition-colors"
                      title="View Full Calendar"
                    >
                      <span className="material-symbols-outlined text-lg">calendar_month</span>
                    </button>
                  </div>
                )}

                <button
                  onClick={() => navigate(`/ride/${nextRide.id}`)}
                  className="w-full flex items-center justify-center gap-1.5 font-label text-[10px] uppercase tracking-widest text-on-surface-variant hover:text-brand-primary transition-colors pt-1"
                >
                  <span className="material-symbols-outlined text-sm">arrow_forward</span>
                  View Tactical Details
                </button>
              </div>
            </div>
          ) : (
            <div className="bg-surface-container-lowest rounded-2xl p-8 text-center border border-dashed border-outline-variant/30">
              <p className="font-label text-xs text-on-surface-variant opacity-60">— No upcoming missions scheduled —</p>
            </div>
          )}
        </section>
      )}

      {/* Guest conversion CTA */}
      {isGuest && (
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
