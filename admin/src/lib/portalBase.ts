// Host-aware routing base. Lets the SPA serve at:
//   vechelon.productdelivered.ca/portal/*    (legacy production URL)
//   *.vechelon.ca/*                          (per-club subdomain)
//
// without a forced cutover. Removable after MT-S0-13 (W136) when productdelivered
// traffic actually moves to the subdomains.

const isLegacyHost =
  typeof window !== 'undefined' &&
  window.location.hostname === 'vechelon.productdelivered.ca';

/** React Router basename for the current host. */
export const PORTAL_BASE = isLegacyHost ? '/portal' : '/';

/** href for the auth page on the current host. */
export const AUTH_HREF = isLegacyHost ? '/portal/auth' : '/auth';

/** Build a shareable ride URL for the current host. Honors VITE_JOIN_BASE_URL. */
export function buildRideUrl(
  rideId: string,
  source: 'ridecard' | 'broadcast'
): string {
  const origin =
    (import.meta.env.VITE_JOIN_BASE_URL as string | undefined) ??
    (typeof window !== 'undefined' ? window.location.origin : '');
  const pathPrefix = isLegacyHost ? '/portal' : '';
  return `${origin}${pathPrefix}/ride/${rideId}?source=${source}`;
}
