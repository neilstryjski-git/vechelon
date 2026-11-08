import React, { createContext, useContext, useEffect, useState } from 'react';

import { useAuth } from '../auth/AuthContext';
import { supabase } from '../lib/supabase';
import { PRIMARY_CLUB_SLUG, FALLBACK_CLUB_SLUG } from '../lib/env';
import { chooseActiveClub, type Membership } from '../lib/clubResolution';

// W303 — the signed-in rider's active club, resolved at runtime (replaces the build-pinned
// TENANT_SLUG for branding, ride creation and the admin check). Rule: lib/clubResolution.ts.
//
// Joining goes through the SAME ensure_account_exists RPC the web rider flow uses (it also
// upserts the accounts row and claims orphan ride_participants by email — D43), so it is
// called for the chosen club on every resolution, not only on a fresh join. Membership rows
// are inserted with ON CONFLICT DO NOTHING server-side, so an existing role (admin) is never
// downgraded. Best-effort: a failure leaves club null (Vechelon branding) and never blocks
// the session.

export type Club = {
  tenantId: string;
  slug: string;
  name: string;
  role: string;
};

type ClubContextValue = {
  club: Club | null;
  // True from sign-in until the first resolution settles (success or failure).
  resolving: boolean;
};

const ClubContext = createContext<ClubContextValue>({ club: null, resolving: false });

type Row = {
  tenant_id: string;
  role: string;
  status: string;
  tenants: { slug: string; name: string } | { slug: string; name: string }[] | null;
};

// Throws on a query error: an error must never read as "no memberships", or a transient
// network failure would auto-join a Racer Sportif member into the fallback club.
async function fetchMemberships(uid: string): Promise<(Membership & { name: string })[]> {
  const { data, error } = await supabase
    .from('account_tenants')
    .select('tenant_id, role, status, tenants!inner(slug, name)')
    .eq('account_id', uid);
  if (error || !data) throw new Error('membership lookup failed');
  return (data as Row[]).flatMap((r) => {
    const t = Array.isArray(r.tenants) ? r.tenants[0] : r.tenants;
    return t ? [{ tenantId: r.tenant_id, slug: t.slug, name: t.name, role: r.role, status: r.status }] : [];
  });
}

class Superseded extends Error {}

// D77 discipline: every network step re-checks that this resolution still belongs to the
// CURRENT identity. ensure_account_exists runs under whatever JWT is live, so a stale
// resolution must never call it after an account swap (it would join B to A's club).
async function assertCurrent(uid: string, isCancelled: () => boolean): Promise<void> {
  if (isCancelled()) throw new Superseded();
  const { data } = await supabase.auth.getSession();
  if (data.session?.user?.id !== uid || isCancelled()) throw new Superseded();
}

async function ensureMembership(
  uid: string,
  tenantId: string,
  isCancelled: () => boolean,
): Promise<void> {
  await assertCurrent(uid, isCancelled);
  const { error } = await supabase.rpc('ensure_account_exists', {
    p_session_cookie_id: null,
    p_tenant_id: tenantId,
  });
  if (error) throw new Error('ensure_account_exists failed');
}

async function resolveClub(uid: string, isCancelled: () => boolean): Promise<Club | null> {
  await assertCurrent(uid, isCancelled);
  let memberships = await fetchMemberships(uid);
  let choice = chooseActiveClub(memberships, PRIMARY_CLUB_SLUG, FALLBACK_CLUB_SLUG);
  if (choice.kind === 'join-fallback') {
    const { data: tenant } = await supabase
      .from('tenants')
      .select('id')
      .eq('slug', choice.slug)
      .maybeSingle();
    if (!tenant?.id) return null;
    await ensureMembership(uid, tenant.id, isCancelled);
    await assertCurrent(uid, isCancelled);
    memberships = await fetchMemberships(uid);
    choice = chooseActiveClub(memberships, PRIMARY_CLUB_SLUG, FALLBACK_CLUB_SLUG);
  } else if (choice.kind === 'member') {
    // Idempotent: keeps the accounts row + D43 orphan claim the old per-build join did.
    await ensureMembership(uid, choice.membership.tenantId, isCancelled).catch((e) => {
      if (e instanceof Superseded) throw e;
    });
  }
  if (choice.kind !== 'member') return null;
  const chosen = choice.membership;
  const found = memberships.find((m) => m.tenantId === chosen.tenantId);
  return {
    tenantId: chosen.tenantId,
    slug: chosen.slug,
    name: found?.name ?? chosen.slug,
    role: chosen.role,
  };
}

export const ClubProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { session } = useAuth();
  const uid = session?.user?.id ?? null;
  // The club is stored WITH the uid it was resolved for, and exposed only while that uid is
  // still the live one — derived during render, so even the first render after an account
  // swap can never show the previous rider's club, branding or admin rights.
  const [state, setState] = useState<{ uid: string | null; club: Club | null; done: boolean }>({
    uid: null,
    club: null,
    done: false,
  });

  useEffect(() => {
    if (!uid) return;
    let cancelled = false;
    resolveClub(uid, () => cancelled)
      .catch(() => null)
      .then((club) => {
        if (!cancelled) setState({ uid, club, done: true });
      });
    return () => {
      cancelled = true;
    };
  }, [uid]);

  const current = uid !== null && state.uid === uid;
  const value: ClubContextValue = {
    club: current ? state.club : null,
    resolving: uid !== null && !(current && state.done),
  };

  return <ClubContext.Provider value={value}>{children}</ClubContext.Provider>;
};

export function useClub(): ClubContextValue {
  return useContext(ClubContext);
}
