import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { parsePoint, downloadGpx } from '../../lib/maps';
import { useAppStore } from '../../store/useAppStore';
import { useToast } from '../../store/useToast';
import {
  firePortalRsvp,
  firePortalGpxDownload,
  firePortalNavExternal,
} from '../../lib/analyticsEvents';

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
  type: 'route' | 'meetup' | 'adhoc';
  scheduled_start: string;
  start_label: string | null;
  start_coords: string | null;
  finish_label: string | null;
  finish_coords: string | null;
  external_url: string | null;
  gpx_path:     string | null;
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
  const setSelectedRideId = useAppStore((s) => s.setSelectedRideId);
  const joinRide = useAppStore((s) => s.joinRide);

  // Affiliated members use the ride card side sheet — redirect them to the calendar
  React.useEffect(() => {
    if (userTier === 'affiliated' && rideId) {
      setSelectedRideId(rideId);
      navigate('/calendar', { replace: true });
    }
  }, [userTier, rideId, setSelectedRideId, navigate]);

  const tenant = queryClient.getQueryData<{ name?: string, logo_url?: string }>(['tenant-config']);

  const [isJoining, setIsJoining] = useState(false);
  const [guestName, setGuestName] = useState('');
  const [guestEmail, setGuestEmail] = useState('');

  // -------------------------------------------------------------------------
  // Fetch ride
  // -------------------------------------------------------------------------

  const { data: ride, isLoading, isError } = useQuery<RideRow | null>({
    queryKey: ['ride-landing', rideId],
    queryFn: async () => {
      if (!rideId) return null;
      const { data, error } = await supabase
        .from('rides')
        .select('id, name, type, scheduled_start, start_label, start_coords, finish_label, finish_coords, external_url, gpx_path, thumbnail_url, status, actual_end')
        .eq('id', rideId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!rideId,
  });

  // -------------------------------------------------------------------------
  // Route stats — present when ride.gpx_path matches a route_library file_path
  // -------------------------------------------------------------------------

  const { data: routeStats } = useQuery<{ distance_km: number | null; elevation_gain_m: number | null } | null>({
    queryKey: ['ride-route-stats', ride?.gpx_path],
    queryFn: async () => {
      if (!ride?.gpx_path) return null;
      const { data } = await supabase
        .from('route_library')
        .select('distance_km, elevation_gain_m')
        .eq('file_path', ride.gpx_path)
        .maybeSingle();
      return data;
    },
    enabled: !!ride?.gpx_path,
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

  const handleJoin = async (nameOverride?: string, emailOverride?: string) => {
    if (!ride) return;
    setIsJoining(true);
    try {
      await joinRide(ride.id, nameOverride, emailOverride);
      addToast(
        ride.status === 'active' ? 'You have joined the ride!' : 'RSVP confirmed.',
        'success',
      );
      queryClient.invalidateQueries({ queryKey: ['my-participation', ride.id] });
      // W131 / IA-S0-03: portal_rsvp fires after a successful RSVP. rider_type
      // is 'member' for affiliated, 'guest' for everyone else. Session ref hash
      // (if present) carries through automatically via attributionFromSession.
      const tenantId = useAppStore.getState().currentTenantId;
      const tier = useAppStore.getState().userTier;
      if (tenantId) {
        void firePortalRsvp({
          tenantId,
          rideId: ride.id,
          riderType: tier === 'affiliated' ? 'member' : 'guest',
        });
      }
    } catch (e: any) {
      addToast(`Failed: ${e.message}`, 'error');
    } finally {
      setIsJoining(false);
    }
  };

  // W131 / IA-S0-03: portal_gpx_download for the rider download path.
  // download_source is 'broadcast' here because GPX downloads from the rider
  // landing originate from a broadcast/share link (vs the route library which
  // is admin-curated).
  const handleGpxDownload = () => {
    if (!ride?.gpx_path) return;
    downloadGpx(ride.gpx_path, ride.name);
    const tenantId = useAppStore.getState().currentTenantId;
    if (tenantId) {
      void firePortalGpxDownload({
        tenantId,
        rideId: ride.id,
        downloadSource: 'broadcast',
      });
    }
  };

  // W131 / IA-S0-03: portal_nav_external for clicks on external nav links
  // (Google Maps for meetup/finish, Garmin/Strava for the route).
  const handleNavExternal = (navType: 'google_maps' | 'garmin' | 'other') => {
    if (!ride) return;
    const tenantId = useAppStore.getState().currentTenantId;
    if (tenantId) {
      void firePortalNavExternal({ tenantId, rideId: ride.id, navType });
    }
  };

  // -------------------------------------------------------------------------
  // Render states
  // -------------------------------------------------------------------------

  if (isLoading) return (
    <div className="space-y-12 py-12 animate-in fade-in duration-500">
      <div className="max-w-lg mx-auto text-center space-y-4">
        <div className="w-12 h-12 border-4 border-brand-primary/10 border-t-brand-primary rounded-full animate-spin mx-auto" />
        <p className="font-label text-[10px] uppercase tracking-[0.3em] text-on-surface-variant animate-pulse">Establishing Tactical Link...</p>
      </div>
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
      <div className="space-y-12 py-8 animate-in fade-in duration-700">
        <div className="max-w-lg mx-auto space-y-8">

          {/* Dynamic Branding Header */}
          <div className="flex items-center gap-4 border-b border-outline-variant/10 pb-6">
            {tenant?.logo_url ? (
              <img src={tenant.logo_url} alt={tenant.name} className="h-10 w-auto object-contain" />
            ) : (
              <div className="w-10 h-10 bg-brand-logo bg-contain bg-no-repeat bg-center grayscale contrast-125 opacity-30" />
            )}
            <div>
              <p className="font-label text-[10px] uppercase tracking-[0.2em] text-on-surface-variant">
                Tactical Mission Summary
              </p>
              <h2 className="font-headline font-extrabold text-2xl tracking-tighter text-on-background uppercase italic">
                {tenant?.name || 'VECHELON'}
              </h2>
            </div>
          </div>

          <div className="space-y-6">
            <div>
              <h3 className="font-headline font-bold text-2xl text-on-background tracking-tight">
                {ride.name}
              </h3>
              {ride.actual_end && (
                <p className="font-label text-[10px] text-on-surface-variant uppercase tracking-widest mt-1">
                  Completed on {formatDate(ride.actual_end)}
                </p>
              )}
              {participantCount !== undefined && (
                <div className="flex items-center gap-2 mt-2">
                  <span className="font-label text-[9px] bg-surface-container-high text-on-surface-variant px-2 py-0.5 rounded-full uppercase tracking-widest font-bold">
                    {participantCount} Operators
                  </span>
                </div>
              )}
            </div>

            {/* AI Summary */}
            {summary?.post_ride_summary ? (
              <div className="bg-surface-container-lowest rounded-2xl p-8 border border-outline-variant/10 space-y-4 shadow-ambient">
                <p className="font-label text-[10px] uppercase tracking-widest text-brand-primary font-bold">
                  After-Action Report
                </p>
                <p className="font-body text-sm text-on-background leading-relaxed whitespace-pre-line italic">
                  "{summary.post_ride_summary}"
                </p>
              </div>
            ) : (
              <div className="bg-surface-container-low/50 rounded-2xl p-12 border border-dashed border-outline-variant/20 text-center">
                <span className="material-symbols-outlined text-on-surface-variant/20 text-4xl mb-3 animate-pulse">psychology</span>
                <p className="font-label text-[10px] uppercase tracking-widest text-on-surface-variant/40">— AI Intelligence Processing —</p>
              </div>
            )}

            <button
              onClick={() => navigate('/')}
              className="flex items-center gap-2 font-label text-[10px] uppercase tracking-[0.2em] text-on-surface-variant hover:text-brand-primary transition-colors"
            >
              <span className="material-symbols-outlined text-sm">arrow_back</span>
              Return to Command Centre
            </button>
          </div>
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // Created / Active (pre-ride RSVP or race-day join)
  // -------------------------------------------------------------------------

  const isActive = ride.status === 'active';

  return (
    <div className="space-y-12 py-8 animate-in fade-in duration-700">

      {/* Dynamic Branding Header */}
      <div className="max-w-lg mx-auto flex items-center justify-between">
        <div className="flex items-center gap-3">
          {tenant?.logo_url ? (
            <img src={tenant.logo_url} alt={tenant.name} className="h-8 w-auto object-contain" />
          ) : (
            <div className="w-8 h-8 bg-brand-logo bg-contain bg-no-repeat bg-center grayscale contrast-125 opacity-30" />
          )}
          <span className="font-headline text-lg font-black tracking-tighter text-on-background uppercase italic">
            {tenant?.name || 'VECHELON'}
          </span>
        </div>
        <button
          onClick={() => navigate('/')}
          className="font-label text-[10px] uppercase tracking-widest text-on-surface-variant hover:text-brand-primary transition-colors"
        >
          Dashboard
        </button>
      </div>

      {/* Ride card */}
      <div className="max-w-lg mx-auto space-y-6">
        <div className="bg-surface-container-lowest rounded-2xl shadow-ambient overflow-hidden border border-outline-variant/10">
          {ride.thumbnail_url && (
            <div className="h-56 w-full overflow-hidden relative">
              <img src={ride.thumbnail_url} alt={ride.name} className="w-full h-full object-cover" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
              <div className="absolute bottom-6 left-6 right-6 text-white">
                <h3 className="font-headline font-bold text-2xl tracking-tight">{ride.name}</h3>
                <p className="font-body text-sm opacity-90 mt-1">
                  {formatDate(ride.scheduled_start)} · {formatTime(ride.scheduled_start)}
                </p>
              </div>
            </div>
          )}

          {!ride.thumbnail_url && (
            <div className="p-8 border-b border-outline-variant/10">
              <h3 className="font-headline font-bold text-2xl tracking-tight text-on-background">{ride.name}</h3>
              <p className="font-body text-sm text-on-surface-variant mt-1">
                {formatDate(ride.scheduled_start)} · {formatTime(ride.scheduled_start)}
              </p>
            </div>
          )}

          {isActive && (
            <div className="flex items-center gap-2 px-8 pt-6">
              <span className="w-2.5 h-2.5 rounded-full bg-tertiary animate-pulse shadow-[0_0_10px_rgba(0,110,53,0.5)]" />
              <span className="font-label text-[10px] uppercase tracking-[0.2em] text-tertiary font-bold">Tactical Session Active</span>
            </div>
          )}

          <div className="p-8 space-y-8">
            <div className="grid grid-cols-1 gap-4">
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
                    onClick={() => handleNavExternal('google_maps')}
                    className="flex items-center gap-4 p-4 bg-surface-container-low rounded-xl border border-outline-variant/5 hover:border-brand-primary/30 transition-colors group"
                  >
                    <div className="w-10 h-10 rounded-full bg-brand-primary/10 flex items-center justify-center shrink-0">
                      <span className="material-symbols-outlined text-brand-primary">location_on</span>
                    </div>
                    <div className="overflow-hidden">
                      <span className="font-label text-[9px] uppercase tracking-widest text-on-surface-variant block mb-0.5">Start Point</span>
                      <span className="font-body text-sm font-semibold text-on-background block truncate group-hover:text-brand-primary transition-colors">
                        {ride.start_label}
                      </span>
                    </div>
                  </a>
                );
              })()}

              {(() => {
                const finishValue = ride.finish_label
                  ? ride.finish_label
                  : (ride.type === 'meetup' ? 'Loop' : null);
                if (!finishValue) return null;
                const isLoop = !ride.finish_label;
                const finishCoords = parsePoint(ride.finish_coords);
                const finishMapsUrl = ride.finish_label
                  ? (finishCoords
                      ? `https://maps.google.com/?q=${finishCoords.lat},${finishCoords.lng}`
                      : `https://maps.google.com/?q=${encodeURIComponent(ride.finish_label)}`)
                  : null;
                const Inner = (
                  <>
                    <div className="w-10 h-10 rounded-full bg-brand-primary/10 flex items-center justify-center shrink-0">
                      <span className="material-symbols-outlined text-brand-primary">{isLoop ? 'loop' : 'flag'}</span>
                    </div>
                    <div className="overflow-hidden">
                      <span className="font-label text-[9px] uppercase tracking-widest text-on-surface-variant block mb-0.5">Finish Point</span>
                      <span className="font-body text-sm font-semibold text-on-background block truncate group-hover:text-brand-primary transition-colors">
                        {finishValue}
                      </span>
                    </div>
                  </>
                );
                return finishMapsUrl ? (
                  <a
                    href={finishMapsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => handleNavExternal('google_maps')}
                    className="flex items-center gap-4 p-4 bg-surface-container-low rounded-xl border border-outline-variant/5 hover:border-brand-primary/30 transition-colors group"
                  >
                    {Inner}
                  </a>
                ) : (
                  <div className="flex items-center gap-4 p-4 bg-surface-container-low rounded-xl border border-outline-variant/5">
                    {Inner}
                  </div>
                );
              })()}

              {(routeStats?.distance_km != null || routeStats?.elevation_gain_m != null) && (
                <div className="flex gap-6 px-1 py-2">
                  {routeStats?.distance_km != null && (
                    <div className="flex items-center gap-2">
                      <span className="material-symbols-outlined text-on-surface-variant text-base">straighten</span>
                      <span className="font-label text-xs text-on-surface-variant">{routeStats.distance_km.toFixed(1)} km</span>
                    </div>
                  )}
                  {routeStats?.elevation_gain_m != null && (
                    <div className="flex items-center gap-2">
                      <span className="material-symbols-outlined text-on-surface-variant text-base">landscape</span>
                      <span className="font-label text-xs text-on-surface-variant">{routeStats.elevation_gain_m} m gain</span>
                    </div>
                  )}
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                {ride.external_url && (
                  <a
                    href={ride.external_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => handleNavExternal(ride.external_url!.includes('garmin.com') ? 'garmin' : 'other')}
                    className="flex items-center gap-3 p-4 bg-surface-container-low rounded-xl border border-outline-variant/5 hover:border-brand-primary/30 transition-colors group"
                  >
                    <span className="material-symbols-outlined text-brand-primary text-xl">route</span>
                    <span className="font-label text-[10px] uppercase tracking-widest font-bold group-hover:text-brand-primary transition-colors">Route</span>
                  </a>
                )}
                {ride.gpx_path && (
                  <button
                    onClick={handleGpxDownload}
                    className="flex items-center gap-3 p-4 bg-surface-container-low rounded-xl border border-outline-variant/5 hover:border-brand-primary/30 transition-colors group"
                  >
                    <span className="material-symbols-outlined text-brand-primary text-xl">download</span>
                    <span className="font-label text-[10px] uppercase tracking-widest font-bold group-hover:text-brand-primary transition-colors">GPX</span>
                  </button>
                )}
              </div>
            </div>

            {/* Action area — branches on tier */}
            <div className="pt-2 border-t border-outline-variant/10">
              {isGuest && (
                !participation ? (
                  <div className="space-y-4 animate-in slide-in-from-bottom-2 duration-500">
                    <div>
                      <h4 className="font-headline font-bold text-sm text-on-background mb-1">Guest RSVP</h4>
                      <p className="font-label text-[9px] uppercase tracking-widest text-on-surface-variant">Identify for the ride roster</p>
                    </div>
                    <div className="space-y-3">
                      <input
                        type="text"
                        value={guestName}
                        onChange={(e) => setGuestName(e.target.value)}
                        placeholder="Operator Name *"
                        className="w-full bg-surface-container-low border border-outline-variant/30 rounded-xl px-5 py-4 font-body text-sm text-on-background placeholder:text-on-surface-variant/30 focus:outline-none focus:border-brand-primary transition-all"
                      />
                      <input
                        type="email"
                        value={guestEmail}
                        onChange={(e) => setGuestEmail(e.target.value)}
                        placeholder="Email (for history synchronization)"
                        className="w-full bg-surface-container-low border border-outline-variant/30 rounded-xl px-5 py-4 font-body text-sm text-on-background placeholder:text-on-surface-variant/30 focus:outline-none focus:border-brand-primary transition-all"
                      />
                      <button
                        onClick={() => handleJoin(guestName.trim(), guestEmail.trim() || undefined)}
                        disabled={isJoining || !guestName.trim()}
                        className="w-full signature-gradient text-on-primary py-4 rounded-xl font-headline font-bold uppercase tracking-widest text-sm flex items-center justify-center gap-3 hover:opacity-90 transition-all active:scale-[0.98] disabled:opacity-50 shadow-ambient"
                      >
                        <span className="material-symbols-outlined">
                          {isActive ? 'play_circle' : 'event_available'}
                        </span>
                        {isJoining ? 'Synchronizing…' : (isActive ? 'Join Tactical Session' : 'Confirm RSVP')}
                      </button>
                      <div className="pt-2 text-center">
                        <button 
                          onClick={() => {
                            const baseUrl = window.location.origin + window.location.pathname;
                            const redirectUrl = `${baseUrl}`;
                            navigate(`/auth?redirectTo=${encodeURIComponent(redirectUrl)}`);
                          }} 
                          className="font-label text-[9px] uppercase tracking-widest text-on-surface-variant hover:text-brand-primary transition-colors"
                        >
                          Already an operator? <span className="font-bold underline">Sign in</span>
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4 animate-in zoom-in-95 duration-500">
                    <div className="flex items-center justify-center gap-3 py-5 bg-tertiary/10 text-tertiary rounded-xl border border-tertiary/20 shadow-sm">
                      <span className="material-symbols-outlined text-2xl">check_circle</span>
                      <span className="font-headline font-bold uppercase tracking-[0.2em] text-xs">
                        {isActive ? 'Operator Active' : 'RSVP Synchronized'}
                      </span>
                    </div>
                    <button
                      onClick={() => {
                        const baseUrl = window.location.origin + window.location.pathname;
                        navigate(`/auth?redirectTo=${encodeURIComponent(baseUrl)}`);
                      }}
                      className="w-full bg-surface-container-high text-on-surface py-4 rounded-xl font-label text-[10px] uppercase tracking-[0.2em] font-bold flex items-center justify-center gap-3 hover:bg-surface-container-highest transition-all border border-outline-variant/20 shadow-sm"
                    >
                      <span className="material-symbols-outlined text-lg">login</span>
                      Authorize Account to Link History
                    </button>
                  </div>
                )
              )}

              {isInitiated && (
                <div className="space-y-4 p-6 bg-primary/5 rounded-2xl border border-primary/10">
                  <div className="flex items-center gap-3 text-primary">
                    <span className="material-symbols-outlined text-xl animate-pulse">pending</span>
                    <span className="font-headline font-bold uppercase tracking-widest text-xs italic">Affiliation Pending</span>
                  </div>
                  <p className="font-body text-sm text-on-surface-variant leading-relaxed">
                    Your operator status is currently awaiting command validation. 
                    Tactical RSVP access will unlock once your membership is activated.
                  </p>
                </div>
              )}

              {!isGuest && !isInitiated && (
                participation ? (
                  <div className="flex items-center justify-center gap-3 py-5 bg-tertiary/10 text-tertiary rounded-xl border border-tertiary/20 shadow-sm animate-in zoom-in-95 duration-500">
                    <span className="material-symbols-outlined text-2xl">check_circle</span>
                    <span className="font-headline font-bold uppercase tracking-[0.2em] text-xs">
                      {isActive ? 'Tactical Session Active' : 'RSVP Confirmed'}
                    </span>
                  </div>
                ) : (
                  <button
                    onClick={() => handleJoin()}
                    disabled={isJoining}
                    className="w-full signature-gradient text-on-primary py-4 rounded-xl font-headline font-bold uppercase tracking-widest text-sm flex items-center justify-center gap-3 hover:opacity-90 transition-all active:scale-[0.98] disabled:opacity-50 shadow-ambient animate-in slide-in-from-bottom-2 duration-500"
                  >
                    <span className="material-symbols-outlined">
                      {isActive ? 'play_circle' : 'event_available'}
                    </span>
                    {isJoining ? 'Establishing Link…' : (isActive ? 'Join Mission' : 'Commit RSVP')}
                  </button>
                )
              )}
            </div>
          </div>
        </div>
      </div>

    </div>
  );
};

export default RideLanding;
