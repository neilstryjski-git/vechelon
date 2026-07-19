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
import { isIdentityChange } from '../lib/identityDelta';
import { TENANT_SLUG } from '../lib/env';
import { broadcastDeparture } from '../lib/backgroundLocation';
import { getActiveRide, clearActiveRide } from '../lib/activeRide';

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
      resetMeasureIdentity(userChanged);

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
        // D87: if we were tracking a ride, tell the fleet we've LEFT before the session dies —
        // the departure broadcast + last-known clear both need this still-valid JWT. Never let a
        // failed departure block sign-out. Clear the holder so a later sign-out can't re-depart.
        const active = getActiveRide();
        if (active) {
          try {
            await broadcastDeparture(active.rideId, active.riderId);
          } catch {
            // best-effort — a missed departure just leaves the pre-existing greying phantom
          }
          clearActiveRide();
        }
        await supabase.auth.signOut();
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
