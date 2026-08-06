const TENANT_HOST_SUFFIX = '.vechelon.ca';
const NON_TENANT_SUBDOMAINS = new Set(['admin', 'www']);

// Transition mapping: legacy production host → slug.
// Removable after MT-S0-13 (W136) cuts production over to *.vechelon.ca and
// vechelon.productdelivered.ca redirects upstream.
const LEGACY_HOST_SLUGS: Record<string, string> = {
  'vechelon.productdelivered.ca': 'racer-sportif',
};

export function extractSlug(hostname: string | null | undefined): string | null {
  if (!hostname) return null;
  const host = hostname.toLowerCase().replace(/\.$/, '');

  if (LEGACY_HOST_SLUGS[host]) return LEGACY_HOST_SLUGS[host];

  if (host === 'vechelon.ca') return null;

  if (host.endsWith(TENANT_HOST_SUFFIX)) {
    const subdomain = host.slice(0, -TENANT_HOST_SUFFIX.length);
    if (!subdomain || subdomain.includes('.')) return null;
    if (NON_TENANT_SUBDOMAINS.has(subdomain)) return null;
    return subdomain;
  }

  return null;
}

// Tenant resolution with a build-time override (W192). When
// VITE_TENANT_SLUG_OVERRIDE is set, the SPA serves that tenant regardless of
// host — this lets a deployment on a host extractSlug can't resolve (e.g. a
// *.vercel.app preview, or localhost) still load the club. Used by the Rail 3
// staging fleet-view deployment so race control opens at a real URL without a
// dedicated *.vechelon.ca subdomain. Mirrors the mobile app's
// EXPO_PUBLIC_TENANT_SLUG. MUST stay UNSET in the production project — prod
// resolves tenants strictly from the *.vechelon.ca subdomain (extractSlug).
export function resolveTenantSlug(hostname: string | null | undefined): string | null {
  const override = import.meta.env.VITE_TENANT_SLUG_OVERRIDE;
  if (typeof override === 'string' && override.trim()) {
    return override.trim().toLowerCase();
  }
  return extractSlug(hostname);
}
