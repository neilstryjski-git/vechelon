import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { Session } from '@supabase/supabase-js';

import { supabase } from '../lib/supabase';
import { resetMeasureIdentity } from '../lib/measure';
import { resetTelemetryIdentity } from '../lib/telemetry';
import { isIdentityChange } from '../lib/identityDelta';
import { TENANT_SLUG } from '../lib/env';
import { getActiveRide, clearActiveRide } from '../lib/activeRide';
import { clearRosterCache } from '../lib/rosterCache';
import { runIdentityTransition, runSignOutSequence } from '../lib/signOutSequence';
// NOTE: backgroundLocation is imported LAZILY inside signOut, NOT at module top level.
// AuthProvider mounts at app launch (App.tsx), so a static import here would pull
// backgroundLocation + its useRideChannel/identity/useResume subtree into the LAUNCH import
// sequence — which is not launch-safe and rolled back the D87 OTA on boot (ee6a927: 0 devices
// ever ran it). That subtree only ever loaded on the ride screen before; keep it that way.

// Auto-join the build's tenant on sign-in (W191 — staging PoC onboarding).
//
// The mobile OTP sign-in creates an auth user but NOT a public.accounts row or a tenant
// membership — those are created only web/edge-side via ensure_account_exists. So a
// tester would sign in and see an empty, tenant-scoped fleet. Here we resolve the tenant
// from the build's slug and call the SAME ensure_account_exists RPC the web rider flow
// uses, so a tester auto-joins (e.g. racer-sportif) and appears in the fleet — no
// pre-provisioning, no emails. The membership INSERT is ON CONFLICT DO NOTHING, so an
// existing member's role is preserved (the captain stays admin); new testers land as
// 'member'. p_tenant_id is REQUIRED (D39 multi-tenant safety); p_session_cookie_id is a
// web guest-claim concern and is null on mobile.
//
// Idempotent, so it's safe on every sign-in / cold-start restore and repairs a
// previously cold-signed-in (account-less) user on next launch.
//
// STAGING-ONLY: this auto-join must never ship in a prod build — anyone who signed in
// would auto-join a club. The Rail 3 PoC build points at a fixed staging slug.
async function ensureTenantMembership(): Promise<void> {
  if (!TENANT_SLUG) return;
  try {
    const { data: tenant } = await supabase
      .from('tenants')
      .select('id')
      .eq('slug', TENANT_SLUG)
      .maybeSingle();
    if (!tenant?.id) return;
    await supabase.rpc('ensure_account_exists', {
      p_session_cookie_id: null,
      p_tenant_id: tenant.id,
    });
  } catch {
    // Best-effort onboarding — never block the session on it.
  }
}

type AuthContextValue = {
  session: Session | null;
  // True until the initial getSession() resolves — gates the splash screen so we
  // don't flash the sign-in screen before a persisted session is restored.
  initializing: boolean;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [session, setSession] = useState<Session | null>(null);
  const [initializing, setInitializing] = useState(true);
  // Run the tenant auto-join once per signed-in user (idempotent server-side anyway).
  const ensuredForUserRef = useRef<string | null>(null);
  // D77 — the last user id we saw, so an auth event can be classified as a genuine identity
  // CHANGE (sign-out, or a swap to a different account) versus a routine token refresh.
  const lastUserIdRef = useRef<string | null>(null);

  // Whenever a session is established (fresh sign-in or cold-start restore), ensure the
  // user is a member of the build's tenant so they show up in the (tenant-scoped) fleet.
  useEffect(() => {
    const uid = session?.user?.id ?? null;
    if (!uid || ensuredForUserRef.current === uid) return;
    ensuredForUserRef.current = uid;
    void ensureTenantMembership();
  }, [session]);

  useEffect(() => {
    let mounted = true;

    // Restore a persisted session on cold start (AsyncStorage-backed).
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      lastUserIdRef.current = data.session?.user?.id ?? null;
      setSession(data.session);
      setInitializing(false);
    });

    // React to sign-in (including deep-link magic-link exchange), sign-out, and
    // token refresh for the lifetime of the app.
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      // D77 — detect an IDENTITY CHANGE, and drive off the user-id DELTA rather than `_event`.
      // The id is the fact; the event name is only a hint: SIGNED_IN fires both for a genuinely
      // new user and for a same-user re-auth, and TOKEN_REFRESHED (~hourly, and mid-ride) must
      // never read as a swap. Comparing ids is therefore strictly safer than trusting the name.
      const nextUserId = nextSession?.user?.id ?? null;
      const userChanged = isIdentityChange(lastUserIdRef.current, nextUserId);
      lastUserIdRef.current = nextUserId;

      // Module-level caches outlive the React tree, so the RootNavigator remount below cannot
      // clear them — they must be reset explicitly, and BEFORE setSession, so nothing that
      // reacts to the new session can still read the old user's id.
      //
      // W281 (R3-58 last clause, R3-57): on a user-id DELTA this also clears the active-ride
      // holder and the roster cache (hook point; W289 builds the cache). ORDER IS LOAD-BEARING:
      // this is the auth transition, which sits AFTER the departure — signOut() below issues
      // the departure under the outgoing JWT and only then revokes the session that emits the
      // SIGNED_OUT event landing here. Clearing the holder here is also what stops account B
      // inheriting account A's binding on a swap that never went through signOut() (SIGNED_IN
      // as B, server-side expiry): A's JWT is gone by then, so no departure can be sent for it.
      // Never on TOKEN_REFRESHED — same id, `userChanged` is false, nothing clears.
      runIdentityTransition(userChanged, {
        resetMeasure: (changed) => {
          resetMeasureIdentity(changed);
          resetTelemetryIdentity(changed); // W284: same D77 discipline for the telemetry caches
        },
        clearActive: clearActiveRide,
        clearRosterCache,
      });

      setSession(nextSession);
      // Keep the REALTIME socket's JWT current on every auth event that carries a
      // session (SIGNED_IN, TOKEN_REFRESHED). Without this the socket keeps whatever
      // token it held at first channel-subscribe; once it expires (~1h) any websocket
      // reconnect (screen-lock / dead-zone) re-auths with a STALE token, the Rail 3
      // tenant RLS (get_my_tenant_id) denies, and the channel dies with a permanent
      // CHANNEL_ERROR. Field ride 2026-07-05 (108km out-and-back): a rider's channel
      // died ~20 min in and never recovered — receive-blind the whole ride. Refreshing
      // the socket auth here is half the fix; useRideChannel now also re-subscribes.
      if (nextSession?.access_token) {
        supabase.realtime.setAuth(nextSession.access_token);
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      initializing,
      // Default scope ('global') revokes the session server-side. NEVER pass
      // scope: 'local' here — that leaves the server session alive and the user
      // gets silently re-authenticated (supabase-patterns D33 sign-out scope).
      signOut: async () => {
        // D87 / W281 (R3-58, D1) — ORDER IS LOAD-BEARING and pinned by tests/signOutSequence:
        //   1. departure (depart broadcast + last-known null-out) under this STILL-VALID JWT,
        //   2. clear the active-ride holder,
        //   3. supabase.auth.signOut()  — revokes the session; the SIGNED_OUT transition then
        //      clears the roster cache (see onAuthStateChange).
        // Reordering 1 and 3 leaves the departure without credentials — the D1 phantom.
        // Fire-and-forget = sign-out waits a BOUNDED window (3s) for the departure, never for
        // acknowledgement; a rejected or hung departure never blocks sign-out. It is never
        // issued after the session is gone, and broadcastDeparture re-checks the identity
        // before its row write, so a late-arriving departure cannot touch the next account.
        await runSignOutSequence({
          getActive: getActiveRide,
          departure: (rideId, riderId) => {
            // Lazy require — see the note by the imports. Loading backgroundLocation's subtree
            // here (runtime, post-launch) instead of at module load keeps it out of the app
            // launch sequence, where it is not safe to eval. Matches bgGeo.ts's lazy-require.
            // eslint-disable-next-line @typescript-eslint/no-var-requires
            const { broadcastDeparture } = require('../lib/backgroundLocation');
            return broadcastDeparture(rideId, riderId);
          },
          clearActive: clearActiveRide,
          // Default scope ('global') — see the D33 note above. Never scope: 'local'.
          signOut: () => supabase.auth.signOut(),
        });
      },
    }),
    [session, initializing],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return ctx;
}
