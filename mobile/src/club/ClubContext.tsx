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

async function fetchMemberships(uid: string): Promise<(Membership & { name: string })[]> {
  const { data, error } = await supabase
    .from('account_tenants')
    .select('tenant_id, role, status, tenants!inner(slug, name)')
    .eq('account_id', uid);
  if (error || !data) return [];
  return (data as Row[]).flatMap((r) => {
    const t = Array.isArray(r.tenants) ? r.tenants[0] : r.tenants;
    return t ? [{ tenantId: r.tenant_id, slug: t.slug, name: t.name, role: r.role, status: r.status }] : [];
  });
}

async function ensureMembership(tenantId: string): Promise<void> {
  await supabase.rpc('ensure_account_exists', { p_session_cookie_id: null, p_tenant_id: tenantId });
}

async function resolveClub(uid: string): Promise<Club | null> {
  let memberships = await fetchMemberships(uid);
  let choice = chooseActiveClub(memberships, PRIMARY_CLUB_SLUG, FALLBACK_CLUB_SLUG);
  if (choice.kind === 'join-fallback') {
    const { data: tenant } = await supabase
      .from('tenants')
      .select('id')
      .eq('slug', choice.slug)
      .maybeSingle();
    if (!tenant?.id) return null;
    await ensureMembership(tenant.id);
    memberships = await fetchMemberships(uid);
    choice = chooseActiveClub(memberships, PRIMARY_CLUB_SLUG, FALLBACK_CLUB_SLUG);
  } else if (choice.kind === 'member') {
    // Idempotent: keeps the accounts row + D43 orphan claim the old per-build join did.
    await ensureMembership(choice.membership.tenantId).catch(() => {});
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
  const [value, setValue] = useState<ClubContextValue>({ club: null, resolving: false });

  useEffect(() => {
    // Identity change (incl. sign-out): drop the previous rider's club immediately so
    // nothing renders another account's club or admin rights.
    if (!uid) {
      setValue({ club: null, resolving: false });
      return;
    }
    let cancelled = false;
    setValue({ club: null, resolving: true });
    resolveClub(uid)
      .catch(() => null)
      .then((club) => {
        if (!cancelled) setValue({ club, resolving: false });
      });
    return () => {
      cancelled = true;
    };
  }, [uid]);

  return <ClubContext.Provider value={value}>{children}</ClubContext.Provider>;
};

export function useClub(): ClubContextValue {
  return useContext(ClubContext);
}
