import { useEffect, useState, type ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';

import { supabase } from '../lib/supabase';
import { useAppStore } from '../store/useAppStore';

type AuthState = 'checking' | 'anon' | 'authed';

function Centered({ children }: { children: ReactNode }) {
  return (
    <div className="p-16 text-center font-label text-on-surface-variant flex flex-col items-center justify-center min-h-[60vh]">
      {children}
    </div>
  );
}

// Access gate for the Race Control surface (W192). Race control exposes the full
// fleet + contact details that §4.1 reserves for command roles, so it's admin-only
// — but a LOGGED-OUT visitor must be OFFERED sign-in rather than told they're not an
// admin. Distinguishes: checking session → loading; no session → Sign in; signed in
// but tier still resolving → brief "verifying"; signed in and not an organizer →
// restricted; organizer → render.
export default function RaceControlGate({ children }: { children: ReactNode }) {
  const isAdmin = useAppStore((s) => s.isAdmin);
  const isPlatformAdmin = useAppStore((s) => s.isPlatformAdmin);
  const location = useLocation();
  const [auth, setAuth] = useState<AuthState>('checking');
  const [graceOver, setGraceOver] = useState(false);

  useEffect(() => {
    let cancelled = false;
    supabase.auth.getSession().then(({ data }) => {
      if (!cancelled) setAuth(data.session ? 'authed' : 'anon');
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Once signed in, give tier detection (useTierDetection in AdaptiveLayout) a
  // moment to resolve role before declaring "not an organizer", so an admin
  // doesn't flash the restricted message on first paint.
  useEffect(() => {
    if (auth !== 'authed') return;
    const t = setTimeout(() => setGraceOver(true), 2500);
    return () => clearTimeout(t);
  }, [auth]);

  const isOrganizer = isAdmin || isPlatformAdmin;

  if (auth === 'checking') {
    return (
      <Centered>
        <span className="material-symbols-outlined text-3xl mb-2 animate-spin text-on-surface-variant/30">sync</span>
        <p className="text-[10px] uppercase tracking-widest">Loading…</p>
      </Centered>
    );
  }

  if (auth === 'anon') {
    const redirectTo = location.pathname + location.search;
    return (
      <Centered>
        <span className="material-symbols-outlined text-4xl mb-3 text-primary/40">login</span>
        <p className="text-[11px] uppercase tracking-widest font-bold text-on-surface">Sign in to open Race Control</p>
        <p className="text-xs mt-2 opacity-70 max-w-xs">Race Control is for club organizers. Sign in with your admin email to continue.</p>
        <Link
          to={`/auth?redirectTo=${encodeURIComponent(redirectTo)}`}
          className="mt-6 signature-gradient text-on-primary px-8 py-3 rounded-md font-headline font-bold shadow-lg uppercase tracking-widest text-xs"
        >
          Sign in
        </Link>
      </Centered>
    );
  }

  if (isOrganizer) return <>{children}</>;

  if (!graceOver) {
    return (
      <Centered>
        <span className="material-symbols-outlined text-3xl mb-2 animate-spin text-on-surface-variant/30">sync</span>
        <p className="text-[10px] uppercase tracking-widest">Verifying access…</p>
      </Centered>
    );
  }

  return (
    <Centered>
      <span className="material-symbols-outlined text-4xl mb-3 text-on-surface-variant/40">lock</span>
      <p className="text-[11px] uppercase tracking-widest font-bold">Race Control is for organizers</p>
      <p className="text-xs mt-2 opacity-70">This live fleet view is restricted to club admins.</p>
    </Centered>
  );
}
