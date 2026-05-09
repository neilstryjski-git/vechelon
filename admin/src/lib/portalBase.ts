// Host-aware routing base. Lets the SPA serve at:
//   vechelon.productdelivered.ca/portal/*    (legacy production URL)
//   *.vechelon.ca/*                          (per-club subdomain)
//
// without a forced cutover. Removable after MT-S0-13 (W136) when productdelivered
// traffic actually moves to the subdomains.

import { extractSlug } from './extractSlug';

const isLegacyHost =
  typeof window !== 'undefined' &&
  window.location.hostname === 'vechelon.productdelivered.ca';

/** React Router basename for the current host. */
export const PORTAL_BASE = isLegacyHost ? '/portal' : '/';

/** href for the auth page on the current host. */
export const AUTH_HREF = isLegacyHost ? '/portal/auth' : '/auth';

/** Build a shareable ride URL pointing at the tenant's rider portal.
 *
 * The admin always runs on vechelon.productdelivered.ca regardless of which
 * club is active, so window.location.origin would produce the wrong domain.
 * extractSlug maps the legacy host → the correct tenant slug, and per-club
 * subdomains return their own slug, so we derive the rider-portal origin from
 * the slug in both cases.
 */
export function buildRideUrl(
  rideId: string,
  source: 'ridecard' | 'broadcast' | 'social',
  ref?: string
): string {
  const refParam = ref ? `&ref=${ref}` : '';

  // Explicit override wins (useful for local dev / staging)
  if (import.meta.env.VITE_JOIN_BASE_URL) {
    const origin = import.meta.env.VITE_JOIN_BASE_URL as string;
    const pathPrefix = isLegacyHost ? '/portal' : '';
    return `${origin}${pathPrefix}/ride/${rideId}?source=${source}${refParam}`;
  }

  // Derive rider portal origin from tenant slug — works on both the legacy
  // host (extractSlug maps it to 'racer-sportif') and per-club subdomains.
  const slug = typeof window !== 'undefined' ? extractSlug(window.location.hostname) : null;
  if (slug) {
    return `https://${slug}.vechelon.ca/ride/${rideId}?source=${source}${refParam}`;
  }

  // Fallback: unknown host (localhost without VITE_JOIN_BASE_URL)
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  return `${origin}/ride/${rideId}?source=${source}${refParam}`;
}
