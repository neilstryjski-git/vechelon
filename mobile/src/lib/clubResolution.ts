// W303 — which club a signed-in rider uses (Sr PM decision 2026-11-08).
//
// The open-testing build is not pinned to one club. After sign-in:
//   1. a membership in the PRIMARY club (Racer Sportif on staging) wins;
//   2. otherwise a membership in the FALLBACK club (Bikes and Beers on staging);
//   3. otherwise an active membership in any other club (e.g. the Play reviewer's demo
//      club) — admin rows first — so nobody already in a club is pushed into the fallback;
//   4. otherwise the rider is joined to the FALLBACK club (auto-join, Sr PM: yes).
// A rider in both clubs gets the primary. Inactive memberships (suspended / archived /
// deleted) don't count. Both slugs are BUILD CONFIG (eas.json), never literals in logic:
// on prod Bikes and Beers is a real club, so a prod build must point FALLBACK at a demo
// club, not at Bikes and Beers. Pure — no I/O — so it is unit-tested directly.

export type Membership = {
  tenantId: string;
  slug: string;
  role: string;
  status: string;
};

export type ClubChoice =
  | { kind: 'member'; membership: Membership }
  | { kind: 'join-fallback'; slug: string }
  | { kind: 'none' };

const INACTIVE = new Set(['suspended', 'archived', 'deleted']);

export function isActiveMembership(m: Membership): boolean {
  return !INACTIVE.has(m.status);
}

export function chooseActiveClub(
  memberships: readonly Membership[],
  primarySlug: string,
  fallbackSlug: string,
): ClubChoice {
  const active = memberships.filter(isActiveMembership);
  const find = (slug: string) => (slug ? active.find((m) => m.slug === slug) : undefined);
  const primary = find(primarySlug);
  if (primary) return { kind: 'member', membership: primary };
  const fallback = find(fallbackSlug);
  if (fallback) return { kind: 'member', membership: fallback };
  const other = active.find((x) => x.role === 'admin') ?? active[0];
  if (other) return { kind: 'member', membership: other };
  // Never auto-join a club the rider was removed from (inactive row present).
  if (fallbackSlug && !memberships.some((m) => m.slug === fallbackSlug)) {
    return { kind: 'join-fallback', slug: fallbackSlug };
  }
  return { kind: 'none' };
}

// W304 — what the home screen may show for the resolved club. Only an AFFILIATED member
// sees the club's rides; a pending ('initiated') member gets the "awaiting approval" state,
// and a rider with no usable club gets the "no club" state. The server enforces the same
// line (rail3_is_affiliated RLS) — this only decides which screen to render.
export type ClubAccess = 'loading' | 'member' | 'pending' | 'none';

export function clubAccess(
  club: { status: string } | null,
  resolving: boolean,
): ClubAccess {
  if (resolving) return 'loading';
  if (!club) return 'none';
  if (club.status === 'affiliated') return 'member';
  if (club.status === 'initiated') return 'pending';
  return 'none';
}
