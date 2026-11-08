// W303 — which club a signed-in rider uses (Sr PM decision 2026-11-08).
//
// The open-testing build is not pinned to one club. After sign-in:
//   1. a membership in the PRIMARY club (Racer Sportif on staging) wins;
//   2. otherwise a membership in the FALLBACK club (Bikes and Beers on staging);
//   3. otherwise the rider is joined to the FALLBACK club (auto-join, Sr PM: yes).
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
  // Never auto-join a club the rider was removed from (inactive row present).
  if (fallbackSlug && !memberships.some((m) => m.slug === fallbackSlug)) {
    return { kind: 'join-fallback', slug: fallbackSlug };
  }
  return { kind: 'none' };
}
