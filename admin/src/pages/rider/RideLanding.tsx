import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { parsePoint } from '../../lib/maps';
import { useAppStore } from '../../store/useAppStore';
import { useToast } from '../../store/useToast';

// ---------------------------------------------------------------------------
// BDD Scenarios (living documentation)
// ---------------------------------------------------------------------------
//
// Feature: QR Code → Ride Landing (Scenario I)
//
//   Background:
//     Given a ride exists with a known rideId
//     And the QR code at /portal/ride/:rideId is scanned or shared
//
//   Scenario: Pre-ride RSVP (created)
//     Given the ride status is "created"
//     And I am an affiliated member
//     When I land on /ride/:rideId
//     Then I see the ride card with date, time, start point
//     And I can RSVP via the "RSVP Now" button
//
//   Scenario: Race-day join (active)
//     Given the ride status is "active"
//     And I am an affiliated member
//     When I land on /ride/:rideId
//     Then I see the ride card with a live "Join Ride" button
//
//   Scenario: Post-ride summary (saved)
//     Given the ride status is "saved"
//     When I land on /ride/:rideId
//     Then I see the Pro-Tour AI summary and attendance count
//
//   Scenario: Unauthenticated guest
//     Given I am not signed in
//     When I land on /ride/:rideId
//     Then I see the ride card and a sign-in prompt instead of the action button
//
//   Scenario: Cancelled ride
//     Given the ride status is "cancelled"
//     When I land on /ride/:rideId
//     Then I see a graceful "This ride was cancelled" message
//
//   Scenario: Unknown ride
//     Given the rideId does not exist
//     When I land on /ride/:rideId
//     Then I see a "Ride not found" message

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface RideRow {
  id: string;
  name: string;
  scheduled_start: string;
  start_label: string | null;
  start_coords: string | null;
  external_url: string | null;
  thumbnail_url: string | null;
  status: 'created' | 'active' | 'saved' | 'cancelled';
  actual_end: string | null;
}

interface RideSummary {
  post_ride_summary: string | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', {
    weekday: 'long', day: 'numeric', month: 'long',
  });
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function RideCardSkeleton() {
  return (
    <div className="max-w-lg mx-auto">
      <div className="bg-surface-container-lowest rounded-2xl overflow-hidden border border-outline-variant/10 animate-pulse">
        <div className="h-40 bg-surface-container-high" />
        <div className="p-6 space-y-4">
          <div className="h-5 w-2/3 rounded bg-surface-container-high" />
          <div className="h-3 w-1/2 rounded bg-surface-container-high" />
          <div className="h-12 rounded-xl bg-surface-container-high" />
        </div>
      </div>
    </div>
  );
}

function NotFound({ message }: { message: string }) {
  const navigate = useNavigate();
  return (
    <div className="max-w-lg mx-auto text-center space-y-6 pt-16">
      <div className="w-16 h-16 rounded-full bg-surface-container-high flex items-center justify-center mx-auto">
        <span className="material-symbols-outlined text-on-surface-variant text-3xl">search_off</span>
      </div>
      <div>
        <h2 className="font-headline font-bold text-xl text-on-background">{message}</h2>
        <p className="font-body text-sm text-on-surface-variant mt-2">
          The ride may have been removed or the link may be outdated.
        </p>
      </div>
      <button
        onClick={() => navigate('/')}
        className="font-label text-[10px] uppercase tracking-widest text-primary hover:opacity-70 transition-opacity"
      >
        ← Return to Portal
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

const RideLanding: React.FC = () => {
  const { rideId } = useParams<{ rideId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { addToast } = useToast();
  const userTier = useAppStore((s) => s.userTier);
  const joinRide = useAppStore((s) => s.joinRide);

  const [isJoining, setIsJoining] = useState(false);

  // -------------------------------------------------------------------------
  // Fetch ride
  // -------------------------------------------------------------------------

  const { data: ride, isLoading, isError } = useQuery<RideRow | null>({
    queryKey: ['ride-landing', rideId],
    queryFn: async () => {
      if (!rideId) return null;
      const { data, error } = await supabase
        .from('rides')
        .select('id, name, scheduled_start, start_label, start_coords, external_url, thumbnail_url, status, actual_end')
        .eq('id', rideId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!rideId,
  });

  // -------------------------------------------------------------------------
  // Fetch summary (saved rides only)
  // -------------------------------------------------------------------------

  const { data: summary } = useQuery<RideSummary | null>({
    queryKey: ['ride-summary', rideId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('ride_summaries')
        .select('post_ride_summary')
        .eq('ride_id', rideId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: ride?.status === 'saved',
  });

  // -------------------------------------------------------------------------
  // Fetch participant count (saved rides)
  // -------------------------------------------------------------------------

  const { data: participantCount } = useQuery<number>({
    queryKey: ['ride-participant-count', rideId],
    queryFn: async () => {
      const { count, error } = await supabase
        .from('ride_participants')
        .select('*', { count: 'exact', head: true })
        .eq('ride_id', rideId);
      if (error) throw error;
      return count ?? 0;
    },
    enabled: ride?.status === 'saved',
  });

  // -------------------------------------------------------------------------
  // Check if already joined (active / created)
  // -------------------------------------------------------------------------

  const { data: participation } = useQuery({
    queryKey: ['my-participation', rideId],
    queryFn: async () => {
      if (!rideId) return null;
      const { data: { user } } = await supabase.auth.getUser();
      const sessionCookieId = useAppStore.getState().sessionCookieId;

      const query = supabase
        .from('ride_participants')
        .select('id')
        .eq('ride_id', rideId);

      if (user) {
        query.eq('account_id', user.id);
      } else {
        query.eq('session_cookie_id', sessionCookieId).is('account_id', null);
      }

      const { data } = await query.maybeSingle();
      return data;
    },
    enabled: !!rideId && (ride?.status === 'created' || ride?.status === 'active'),
  });

  // -------------------------------------------------------------------------
  // Actions
  // -------------------------------------------------------------------------

  const handleJoin = async () => {
    if (!ride) return;
    setIsJoining(true);
    try {
      await joinRide(ride.id);
      addToast(
        ride.status === 'active' ? 'You have joined the ride!' : 'RSVP confirmed.',
        'success',
      );
      queryClient.invalidateQueries({ queryKey: ['my-participation', ride.id] });
    } catch (e: any) {
      addToast(`Failed: ${e.message}`, 'error');
    } finally {
      setIsJoining(false);
    }
  };

  // -------------------------------------------------------------------------
  // Render states
  // -------------------------------------------------------------------------

  if (isLoading) return (
    <div className="space-y-12 py-8">
      <RideCardSkeleton />
    </div>
  );

  if (isError || !ride) return (
    <div className="py-8">
      <NotFound message="Ride not found" />
    </div>
  );

  if (ride.status === 'cancelled') return (
    <div className="py-8">
      <NotFound message="This ride was cancelled" />
    </div>
  );

  const isGuest     = userTier === 'guest';
  const isInitiated = userTier === 'initiated';

  // -------------------------------------------------------------------------
  // Saved (post-ride) view
  // -------------------------------------------------------------------------

  if (ride.status === 'saved') {
    return (
      <div className="space-y-12 py-8">
        <div className="max-w-lg mx-auto space-y-6">

          {/* Header */}
          <div>
            <p className="font-label text-[10px] uppercase tracking-[0.2em] text-on-surface-variant mb-2">
              Ride Complete
            </p>
            <h2 className="font-headline font-extrabold text-3xl tracking-tighter text-on-background">
              {ride.name}
            </h2>
            {ride.actual_end && (
              <p className="font-label text-[10px] text-on-surface-variant uppercase tracking-widest mt-1">
                {formatDate(ride.actual_end)}
              </p>
            )}
            {participantCount !== undefined && (
              <p className="font-body text-sm text-on-surface-variant mt-1">
                <span className="material-symbols-outlined text-[13px] align-middle mr-1">group</span>
                {participantCount} rider{participantCount !== 1 ? 's' : ''} participated
              </p>
            )}
          </div>

          {/* AI Summary */}
          {summary?.post_ride_summary ? (
            <div className="bg-surface-container-lowest rounded-2xl p-6 border border-outline-variant/10 space-y-3">
              <p className="font-label text-[9px] uppercase tracking-widest text-on-surface-variant">
                Pro-Tour Summary
              </p>
              <p className="font-body text-sm text-on-background leading-relaxed whitespace-pre-line">
                {summary.post_ride_summary}
              </p>
            </div>
          ) : (
            <div className="bg-surface-container-lowest rounded-2xl p-6 border border-dashed border-outline-variant/20 text-center">
              <p className="font-label text-xs text-on-surface-variant/60">— Summary generating —</p>
            </div>
          )}

          <button
            onClick={() => navigate('/')}
            className="font-label text-[10px] uppercase tracking-widest text-primary hover:opacity-70 transition-opacity"
          >
            ← Back to Portal
          </button>
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // Created / Active (pre-ride RSVP or race-day join)
  // -------------------------------------------------------------------------

  const isActive = ride.status === 'active';

  return (
    <div className="space-y-12 py-8">

      {/* Page label */}
      <div className="max-w-lg mx-auto">
        <p className="font-label text-[10px] uppercase tracking-[0.2em] text-on-surface-variant mb-4">
          {isActive ? 'Ride in Progress' : 'Upcoming Ride'}
        </p>

        {/* Ride card */}
        <div className="bg-surface-container-lowest rounded-2xl shadow-ambient overflow-hidden border border-outline-variant/10">
          {ride.thumbnail_url && (
            <div className="h-40 w-full overflow-hidden">
              <img src={ride.thumbnail_url} alt={ride.name} className="w-full h-full object-cover" />
            </div>
          )}

          {isActive && (
            <div className="flex items-center gap-2 px-6 pt-4">
              <span className="w-2 h-2 rounded-full bg-tertiary animate-pulse" />
              <span className="font-label text-[9px] uppercase tracking-widest text-tertiary">Live Now</span>
            </div>
          )}

          <div className="p-6 space-y-4">
            <div>
              <h3 className="font-headline font-bold text-xl text-on-background">{ride.name}</h3>
              <p className="font-label text-[10px] text-on-surface-variant uppercase tracking-widest mt-1">
                {formatDate(ride.scheduled_start)} · {formatTime(ride.scheduled_start)}
              </p>
              {ride.start_label && (() => {
                const coords = parsePoint(ride.start_coords);
                const mapsUrl = coords
                  ? `https://maps.google.com/?q=${coords.lat},${coords.lng}`
                  : `https://maps.google.com/?q=${encodeURIComponent(ride.start_label)}`;
                return (
                  <a
                    href={mapsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-body text-xs text-primary hover:underline mt-1 flex items-center gap-1"
                  >
                    <span className="material-symbols-outlined text-[12px]">location_on</span>
                    {ride.start_label}
                  </a>
                );
              })()}
              {ride.external_url && (
                <a
                  href={ride.external_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-body text-xs text-primary hover:underline mt-1 flex items-center gap-1"
                >
                  <span className="material-symbols-outlined text-[12px]">route</span>
                  Route
                </a>
              )}
            </div>

            {/* Action area — branches on tier */}
            {isGuest && (
              !participation ? (
                <div className="space-y-4">
                  <button
                    onClick={handleJoin}
                    disabled={isJoining}
                    className="w-full signature-gradient text-on-primary py-3 rounded-xl font-headline font-bold flex items-center justify-center gap-2 hover:opacity-90 transition-all active:scale-[0.98] disabled:opacity-50"
                  >
                    <span className="material-symbols-outlined text-lg">
                      {isActive ? 'play_circle' : 'event_available'}
                    </span>
                    {isJoining ? 'Joining…' : (isActive ? 'Join as Guest' : 'RSVP as Guest')}
                  </button>
                  <p className="text-center font-label text-[9px] text-on-surface-variant/60">
                    Join now and claim your history later by <button onClick={() => navigate('/auth')} className="underline font-bold">signing in</button>.
                  </p>
                </div>
              ) : (
                <div className="flex flex-col gap-3">
                  <div className="flex items-center justify-center gap-2 py-3 bg-tertiary/10 text-tertiary rounded-xl border border-tertiary/20">
                    <span className="material-symbols-outlined text-lg">check_circle</span>
                    <span className="font-headline font-bold uppercase tracking-widest text-[10px]">
                      {isActive ? 'Joined as Guest' : 'Guest RSVP Confirmed'}
                    </span>
                  </div>
                  <button
                    onClick={() => navigate('/auth')}
                    className="w-full bg-surface-container-high text-on-surface py-2.5 rounded-xl font-label text-[10px] uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-surface-container-highest transition-all"
                  >
                    <span className="material-symbols-outlined text-sm">login</span>
                    Sign In to Claim History
                  </button>
                </div>
              )
            )}

            {isInitiated && (
              <p className="font-label text-[10px] text-on-surface-variant/60 italic">
                Full access available once your membership is confirmed.
              </p>
            )}

            {!isGuest && !isInitiated && (
              participation ? (
                <div className="flex items-center justify-center gap-2 py-3 bg-tertiary/10 text-tertiary rounded-xl border border-tertiary/20">
                  <span className="material-symbols-outlined text-lg">check_circle</span>
                  <span className="font-headline font-bold uppercase tracking-widest text-[10px]">
                    {isActive ? 'Joined' : 'RSVP Confirmed'}
                  </span>
                </div>
              ) : (
                <button
                  onClick={handleJoin}
                  disabled={isJoining}
                  className="w-full signature-gradient text-on-primary py-3 rounded-xl font-headline font-bold flex items-center justify-center gap-2 hover:opacity-90 transition-all active:scale-[0.98] disabled:opacity-50"
                >
                  <span className="material-symbols-outlined text-lg">
                    {isActive ? 'play_circle' : 'event_available'}
                  </span>
                  {isJoining ? 'Processing…' : (isActive ? 'Join Ride' : 'RSVP Now')}
                </button>
              )
            )}
          </div>
        </div>
      </div>

    </div>
  );
};

export default RideLanding;
