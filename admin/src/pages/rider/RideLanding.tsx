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
  fireQueryTimeout,
} from '../../lib/analyticsEvents';

// D41: hard ceiling on mount-time fetches. The headline iOS Safari incident
// (2026-05-15) sat on an eternal spinner because the network silently stalled
// — neither resolved nor rejected. 10s gives 3G the room to succeed while
// keeping a hung request from holding the spinner forever.
const RIDE_FETCH_TIMEOUT_MS = 10_000;

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

// D41: rendered when the ride query failed or timed out after React Query's
// automatic retries. Distinct from NotFound (which signals "this ride does
// not exist") — RideFetchError signals "we couldn't reach the server."
// Copy escalates after the second consecutive failed manual retry so the
// user gets actionable feedback when the network is truly down.
function RideFetchError({ failedManualRetries, onRetry }: { failedManualRetries: number; onRetry: () => void }) {
  const escalate = failedManualRetries >= 2;
  return (
    <div className="max-w-lg mx-auto text-center space-y-6 pt-16">
      <div className="w-16 h-16 rounded-full bg-surface-container-high flex items-center justify-center mx-auto">
        <span className="material-symbols-outlined text-on-surface-variant text-3xl">wifi_off</span>
      </div>
      <div>
        <h2 className="font-headline font-bold text-xl text-on-background">
          {escalate ? "Still can't reach the server" : 'Trouble loading the ride'}
        </h2>
        <p className="font-body text-sm text-on-surface-variant mt-2">
          {escalate
            ? 'Check your connection and try again, or open this link from a different network.'
            : 'This is taking longer than expected. Tap below to try again.'}
        </p>
      </div>
      <button
        onClick={onRetry}
        className="font-label text-[10px] uppercase tracking-widest text-primary hover:opacity-70 transition-opacity"
      >
        Retry →
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

  const source = React.useMemo(
    () => new URLSearchParams(window.location.search).get('source'),
    []
  );
  const isSocialSource = source === 'social';

  // For ?source=social: resolve session state before showing the magic-link
  // form so signed-in users (whose userTier starts as 'guest' before
  // useTierDetection resolves) are not shown the form at all — tier detection
  // will update their tier and fire the affiliated redirect instead.
  const [sessionChecked, setSessionChecked] = useState(false);
  const [hasSession, setHasSession] = useState(false);

  React.useEffect(() => {
    if (!isSocialSource) { setSessionChecked(true); return; }
    supabase.auth.getSession().then(({ data: { session } }) => {
      setHasSession(!!session);
      setSessionChecked(true);
    });
  }, [isSocialSource]);

  const [isJoining, setIsJoining] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [rsvpDone, setRsvpDone] = useState(false);
  const [guestName, setGuestName] = useState('');
  const [guestEmail, setGuestEmail] = useState('');
  const [magicEmail, setMagicEmail] = useState('');
  const [magicSent, setMagicSent] = useState(false);
  const [isSendingMagicLink, setIsSendingMagicLink] = useState(false);

  // -------------------------------------------------------------------------
  // Fetch ride
  // -------------------------------------------------------------------------

  // D41: track manual retry count so the error UI can escalate its copy after
  // two consecutive failed manual retries. Reset on a successful fetch via the
  // useEffect below so a transient failure doesn't poison the copy forever.
  const [failedManualRetries, setFailedManualRetries] = useState(0);

  // D41: tracks cumulative attempt count (auto + manual) for telemetry. A ref
  // not state because the queryFn closure binds the value at first invocation
  // — destructuring failureCount from useQuery would be stale across React
  // Query's internal retry loop (it does not re-create the queryFn between
  // retries). Reset to 0 on success, same as failedManualRetries.
  const attemptRef = React.useRef(0);

  const { data: ride, isLoading, isError, refetch } = useQuery<RideRow | null>({
    queryKey: ['ride-landing', rideId],
    // D41: React Query v5 passes a per-query AbortSignal via the queryFn
    // context. We pair it with a setTimeout that aborts the controller on
    // RIDE_FETCH_TIMEOUT_MS so a silently-stalled network (the iOS Safari
    // incident, 2026-05-15) surfaces as a rejection — not an eternal spinner.
    queryFn: async ({ signal }) => {
      if (!rideId) return null;
      const attempt = attemptRef.current;
      attemptRef.current = attempt + 1;
      const start = Date.now();
      const controller = new AbortController();
      // Distinguish the abort cause: timeout vs unmount/navigation. Both end
      // up calling controller.abort(), so signal.aborted alone can't tell
      // them apart — we set timedOut at the moment setTimeout fires.
      let timedOut = false;
      const onUpstreamAbort = () => controller.abort();
      signal.addEventListener('abort', onUpstreamAbort);
      const timeoutId = window.setTimeout(() => {
        timedOut = true;
        controller.abort();
      }, RIDE_FETCH_TIMEOUT_MS);

      try {
        // FunctionInvokeOptions.signal aborts the underlying fetch when the
        // controller fires — no orphaned in-flight request.
        const { data, error } = await supabase.functions.invoke('guest-view-ride', {
          body: { ride_id: rideId },
          signal: controller.signal,
        });
        if (error) throw error;
        return (data?.ride as RideRow) ?? null;
      } catch (err) {
        const elapsedMs = Date.now() - start;
        // unmount (upstream signal fired before our timeout) is benign noise
        // and would pollute the IA signal — skip telemetry in that case.
        const isUnmount = signal.aborted && !timedOut;
        if (!isUnmount) {
          const trigger: 'timeout' | 'error' = timedOut ? 'timeout' : 'error';
          const tenantId = useAppStore.getState().currentTenantId;
          if (tenantId) {
            void fireQueryTimeout({
              tenantId,
              queryKey: 'ride-landing',
              trigger,
              attempt,
              elapsedMs,
              rideId,
            });
          }
        }
        throw err;
      } finally {
        window.clearTimeout(timeoutId);
        signal.removeEventListener('abort', onUpstreamAbort);
      }
    },
    enabled: !!rideId,
    // D41: 2 automatic retries with exponential backoff (~1s, ~3s) before the
    // error UI shows. Global default is `retry: false` (App.tsx:77) — overridden
    // here only for the critical ride query so other surfaces aren't affected.
    retry: 2,
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 3000),
  });

  // D41: reset the manual-retry counter and the cumulative attempt counter as
  // soon as a fetch succeeds so a transient failure followed by a recovery
  // doesn't keep the escalated copy armed for the next mount.
  React.useEffect(() => {
    if (ride) {
      setFailedManualRetries(0);
      attemptRef.current = 0;
    }
  }, [ride]);

  const handleRideFetchRetry = React.useCallback(() => {
    setFailedManualRetries((n) => n + 1);
    void refetch();
  }, [refetch]);

  // -------------------------------------------------------------------------
  // Route stats — present when ride.gpx_path matches a route_library file_path
  // -------------------------------------------------------------------------

  const { data: routeStats } = useQuery<{ distance_km: number | null; elevation_gain_m: number | null } | null>({
    queryKey: ['ride-route-stats', ride?.gpx_path],
    // D41: pass the React Query signal to abortSignal so unmount cancels the
    // in-flight request. Auxiliary query — failure degrades gracefully (no
    // route stats badge); no error UI or retry needed.
    queryFn: async ({ signal }) => {
      if (!ride?.gpx_path) return null;
      const { data } = await supabase
        .from('route_library')
        .select('distance_km, elevation_gain_m')
        .eq('file_path', ride.gpx_path)
        .abortSignal(signal)
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
    queryFn: async ({ signal }) => {
      const { data, error } = await supabase
        .from('ride_summaries')
        .select('post_ride_summary')
        .eq('ride_id', rideId)
        .abortSignal(signal)
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
    queryFn: async ({ signal }) => {
      const { count, error } = await supabase
        .from('ride_participants')
        .select('*', { count: 'exact', head: true })
        .eq('ride_id', rideId)
        .abortSignal(signal);
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
    // D41: supabase.auth.getUser() does NOT accept an AbortSignal, so the auth
    // call itself can stall on a marginal network independent of the PostgREST
    // call. This is auxiliary (controls only the join-button render state) and
    // out of scope for D41 — the page already renders without it. abortSignal
    // is still threaded into the PostgREST query so unmount cancels cleanly.
    queryFn: async ({ signal }) => {
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

      const { data } = await query.abortSignal(signal).maybeSingle();
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
      setRsvpDone(true);
      addToast(
        ride.status === 'active' ? 'You have joined the ride!' : 'RSVP confirmed.',
        'success',
      );
      queryClient.invalidateQueries({ queryKey: ['my-participation', ride.id] });
      // W131 / IA-S0-03: portal_rsvp fires after a successful RSVP.
      const tenantId = useAppStore.getState().currentTenantId;
      const tier = useAppStore.getState().userTier;
      if (tenantId) {
        void firePortalRsvp({
          tenantId,
          rideId: ride.id,
          riderType: tier === 'affiliated' ? 'member' : 'guest',
        });
      }
      // Fire-and-forget magic link via send-magic-link EF so the OTP is wrapped
      // in the ?c= click-through (D32 / D40). Click-through lands on /auth which
      // exchanges the code, runs ensure_account_exists, then forwards to the
      // ride URL preserved in redirectTo.
      // redirectTo is path+search only so React Router's navigate() treats it
      // as in-app routing (full URLs break navigate()).
      if (emailOverride) {
        const ridePath = window.location.pathname + window.location.search;
        const authRedirect = `${window.location.origin}/auth?redirectTo=${encodeURIComponent(ridePath)}`;
        void supabase.functions.invoke('send-magic-link', {
          body: { email: emailOverride, redirectTo: authRedirect },
        }).catch((err) => {
          console.warn('[RideLanding] Magic link send failed:', err);
        });
      }
    } catch (e: any) {
      addToast(`Failed: ${e.message}`, 'error');
    } finally {
      setIsJoining(false);
    }
  };

  // Guest cancels the RSVP they made from this browser. anon has no DELETE on
  // ride_participants, so this routes through the guest-cancel-rsvp Edge Function
  // (service role), mirroring the guest-rsvp create path. Ownership is proven by
  // session_cookie_id — the same token the "already joined" check reads.
  const handleGuestCancel = async () => {
    if (!ride) return;
    setIsCancelling(true);
    try {
      const sessionCookieId = useAppStore.getState().sessionCookieId;
      const { error } = await supabase.functions.invoke('guest-cancel-rsvp', {
        body: { ride_id: ride.id, session_cookie_id: sessionCookieId },
      });
      if (error) {
        let message = 'Unable to cancel RSVP. Please try again.';
        try {
          const body = await (error as { context?: Response }).context?.json?.();
          if (body?.error) message = body.error;
        } catch { /* ignore */ }
        throw new Error(message);
      }
      setRsvpDone(false);
      addToast('RSVP cancelled.', 'success');
      queryClient.invalidateQueries({ queryKey: ['my-participation', ride.id] });
    } catch (e: any) {
      addToast(`Failed: ${e.message}`, 'error');
    } finally {
      setIsCancelling(false);
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

  const handleSendMagicLink = async () => {
    if (!magicEmail.trim()) return;
    setIsSendingMagicLink(true);
    try {
      // Route through send-magic-link EF for the ?c= click-through wrapper
      // (D32 / D40). Click-through lands on /auth which exchanges the code,
      // runs ensure_account_exists, then forwards to the ride URL.
      // redirectTo is path+search only so React Router's navigate() treats it
      // as in-app routing.
      const ridePath = window.location.pathname + window.location.search;
      const authRedirect = `${window.location.origin}/auth?redirectTo=${encodeURIComponent(ridePath)}`;
      const { data, error } = await supabase.functions.invoke('send-magic-link', {
        body: { email: magicEmail.trim().toLowerCase(), redirectTo: authRedirect },
      });
      if (error) {
        // Try to extract a structured error message from the EF response body
        let msg = error.message;
        try {
          const body = await (error as { context?: Response }).context?.json?.();
          if (body?.error) msg = body.error;
        } catch { /* ignore */ }
        throw new Error(msg);
      }
      if (data?.error) throw new Error(data.error);
      setMagicSent(true);
    } catch (e: any) {
      addToast(`Could not send link: ${e.message}`, 'error');
    } finally {
      setIsSendingMagicLink(false);
    }
  };

  // -------------------------------------------------------------------------
  // Render states
  // -------------------------------------------------------------------------

  if (isLoading) return (
    <div className="space-y-12 py-12 animate-in fade-in duration-500">
      <div className="max-w-lg mx-auto text-center space-y-4">
        <div className="w-12 h-12 border-4 border-brand-primary/10 border-t-brand-primary rounded-full animate-spin mx-auto" />
        <p className="font-label text-[10px] uppercase tracking-[0.3em] text-on-surface-variant animate-pulse">Loading…</p>
      </div>
      <RideCardSkeleton />
    </div>
  );

  // D41: distinguish "fetch failed" (network / server / timeout — show retry)
  // from "ride genuinely does not exist" (returned null — show NotFound).
  if (isError) return (
    <div className="py-8">
      <RideFetchError failedManualRetries={failedManualRetries} onRetry={handleRideFetchRetry} />
    </div>
  );

  if (!ride) return (
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
                Ride Summary
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
                    {participantCount} Riders
                  </span>
                </div>
              )}
            </div>

            {/* AI Summary */}
            {summary?.post_ride_summary ? (
              <div className="bg-surface-container-lowest rounded-2xl p-8 border border-outline-variant/10 space-y-4 shadow-ambient">
                <p className="font-label text-[10px] uppercase tracking-widest text-brand-primary font-bold">
                  Ride Recap
                </p>
                <p className="font-body text-sm text-on-background leading-relaxed whitespace-pre-line italic">
                  "{summary.post_ride_summary}"
                </p>
              </div>
            ) : (
              <div className="bg-surface-container-low/50 rounded-2xl p-12 border border-dashed border-outline-variant/20 text-center">
                <span className="material-symbols-outlined text-on-surface-variant/20 text-4xl mb-3 animate-pulse">psychology</span>
                <p className="font-label text-[10px] uppercase tracking-widest text-on-surface-variant/40">— AI recap pending —</p>
              </div>
            )}

            <button
              onClick={() => navigate('/')}
              className="flex items-center gap-2 font-label text-[10px] uppercase tracking-[0.2em] text-on-surface-variant hover:text-brand-primary transition-colors"
            >
              <span className="material-symbols-outlined text-sm">arrow_back</span>
              Return to Dashboard
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
              <span className="font-label text-[10px] uppercase tracking-[0.2em] text-tertiary font-bold">Ride in Progress</span>
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
                  isSocialSource && sessionChecked && !hasSession ? (
                    /* Social share path: confirmed no session — show magic-link form */
                    <div className="space-y-4 animate-in slide-in-from-bottom-2 duration-500">
                      {magicSent ? (
                        <div className="space-y-3 text-center">
                          <span className="material-symbols-outlined text-3xl text-primary block">mark_email_read</span>
                          <h4 className="font-headline font-bold text-sm text-on-background">Check your inbox</h4>
                          <p className="font-body text-xs text-on-surface-variant leading-relaxed">
                            We sent a secure link to <strong>{magicEmail}</strong>. Click it to sign in and claim your spot on this ride.
                          </p>
                        </div>
                      ) : (
                        <>
                          <div>
                            <h4 className="font-headline font-bold text-sm text-on-background mb-1">Member-Shared Ride</h4>
                            <p className="font-label text-[9px] uppercase tracking-widest text-on-surface-variant">
                              Sign in to RSVP — no password needed
                            </p>
                          </div>
                          <div className="space-y-3">
                            <input
                              type="email"
                              value={magicEmail}
                              onChange={(e) => setMagicEmail(e.target.value)}
                              placeholder="Your email address"
                              className="w-full bg-surface-container-low border border-outline-variant/30 rounded-xl px-5 py-4 font-body text-sm text-on-background placeholder:text-on-surface-variant/30 focus:outline-none focus:border-brand-primary transition-all"
                            />
                            <button
                              onClick={handleSendMagicLink}
                              disabled={isSendingMagicLink || !magicEmail.trim()}
                              className="w-full signature-gradient text-on-primary py-4 rounded-xl font-headline font-bold uppercase tracking-widest text-sm flex items-center justify-center gap-3 hover:opacity-90 transition-all active:scale-[0.98] disabled:opacity-50 shadow-ambient"
                            >
                              <span className="material-symbols-outlined">
                                {isSendingMagicLink ? 'hourglass_top' : 'send'}
                              </span>
                              {isSendingMagicLink ? 'Sending…' : 'Send Access Link'}
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  ) : (
                    /* Standard frictionless RSVP (ridecard / broadcast / captain) */
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
                          placeholder="Your name *"
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
                          disabled={isJoining || rsvpDone || !guestName.trim()}
                          className={`w-full py-4 rounded-xl font-headline font-bold uppercase tracking-widest text-sm flex items-center justify-center gap-3 transition-all active:scale-[0.98] shadow-ambient disabled:opacity-90 ${rsvpDone ? 'bg-tertiary text-white' : 'signature-gradient text-on-primary hover:opacity-90 disabled:opacity-50'}`}
                        >
                          <span className="material-symbols-outlined">
                            {rsvpDone ? 'check_circle' : (isActive ? 'play_circle' : 'event_available')}
                          </span>
                          {rsvpDone ? 'RSVP Confirmed' : isJoining ? 'Joining…' : (isActive ? 'Join Ride' : 'Confirm RSVP')}
                        </button>
                        {rsvpDone && guestEmail.trim() ? (
                          <p className="pt-2 text-center font-label text-[9px] uppercase tracking-widest text-on-surface-variant">
                            Check your email to link your history
                          </p>
                        ) : (
                          <div className="pt-2 text-center">
                            <button
                              onClick={() => {
                                const baseUrl = window.location.origin + window.location.pathname;
                                navigate(`/auth?redirectTo=${encodeURIComponent(baseUrl)}`);
                              }}
                              className="font-label text-[9px] uppercase tracking-widest text-on-surface-variant hover:text-brand-primary transition-colors"
                            >
                              Already have an account? <span className="font-bold underline">Sign in</span>
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  )
                ) : (
                  <div className="space-y-4 animate-in zoom-in-95 duration-500">
                    <div className="flex items-center justify-center gap-3 py-5 bg-tertiary/10 text-tertiary rounded-xl border border-tertiary/20 shadow-sm">
                      <span className="material-symbols-outlined text-2xl">check_circle</span>
                      <span className="font-headline font-bold uppercase tracking-[0.2em] text-xs">
                        {isActive ? "You're in" : 'RSVP Confirmed'}
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
                      Sign in to save your ride history
                    </button>
                    <button
                      onClick={handleGuestCancel}
                      disabled={isCancelling}
                      className="w-full py-3 rounded-xl font-label text-[10px] uppercase tracking-[0.2em] font-bold flex items-center justify-center gap-2 text-on-surface-variant hover:text-error hover:bg-error/10 transition-colors disabled:opacity-50"
                    >
                      <span className="material-symbols-outlined text-base">event_busy</span>
                      {isCancelling ? 'Cancelling…' : 'Cancel RSVP'}
                    </button>
                  </div>
                )
              )}

              {isInitiated && (
                <div className="space-y-4 p-6 bg-primary/5 rounded-2xl border border-primary/10">
                  <div className="flex items-center gap-3 text-primary">
                    <span className="material-symbols-outlined text-xl animate-pulse">pending</span>
                    <span className="font-headline font-bold uppercase tracking-widest text-xs italic">Awaiting admin approval</span>
                  </div>
                  <p className="font-body text-sm text-on-surface-variant leading-relaxed">
                    Your account is awaiting admin approval.
                    RSVP access will unlock once your membership is activated.
                  </p>
                </div>
              )}

              {!isGuest && !isInitiated && (
                participation ? (
                  <div className="flex items-center justify-center gap-3 py-5 bg-tertiary/10 text-tertiary rounded-xl border border-tertiary/20 shadow-sm animate-in zoom-in-95 duration-500">
                    <span className="material-symbols-outlined text-2xl">check_circle</span>
                    <span className="font-headline font-bold uppercase tracking-[0.2em] text-xs">
                      {isActive ? 'Ride in Progress' : 'RSVP Confirmed'}
                    </span>
                  </div>
                ) : (
                  <button
                    onClick={() => handleJoin()}
                    disabled={isJoining || rsvpDone}
                    className={`w-full py-4 rounded-xl font-headline font-bold uppercase tracking-widest text-sm flex items-center justify-center gap-3 transition-all active:scale-[0.98] shadow-ambient disabled:opacity-90 animate-in slide-in-from-bottom-2 duration-500 ${rsvpDone ? 'bg-tertiary text-white' : 'signature-gradient text-on-primary hover:opacity-90 disabled:opacity-50'}`}
                  >
                    <span className="material-symbols-outlined">
                      {rsvpDone ? 'check_circle' : (isActive ? 'play_circle' : 'event_available')}
                    </span>
                    {rsvpDone ? 'RSVP Confirmed' : isJoining ? 'Joining…' : (isActive ? 'Join Ride' : 'RSVP')}
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
