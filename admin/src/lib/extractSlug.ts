const TENANT_HOST_SUFFIX = '.vechelon.ca';
const NON_TENANT_SUBDOMAINS = new Set(['admin', 'www']);

// Non-production host namespaces. `<name>.preview.vechelon.ca` (Cloudflare
// preview of the production build) and `<name>.staging.vechelon.ca` (staging
// Race Control, staging Supabase) behave exactly like `<name>.vechelon.ca`.
// `legacy.<ns>.vechelon.ca` stands in for the legacy production host
// vechelon.productdelivered.ca (landing page + /portal base).
const HOST_NAMESPACES = ['preview', 'staging'] as const;
const LEGACY_PRODUCTION_HOST = 'vechelon.productdelivered.ca';

// Transition mapping: legacy production host → slug.
// Removable after MT-S0-13 (W136) cuts production over to *.vechelon.ca and
// vechelon.productdelivered.ca redirects upstream.
const LEGACY_HOST_SLUGS: Record<string, string> = {
  [LEGACY_PRODUCTION_HOST]: 'racer-sportif',
};

function normalise(hostname: string | null | undefined): string | null {
  if (!hostname) return null;
  return hostname.toLowerCase().replace(/\.$/, '');
}

/** The namespace ('preview' | 'staging') a host lives in, or null for production hosts. */
export function hostNamespace(hostname: string | null | undefined): string | null {
  const host = normalise(hostname);
  if (!host) return null;
  for (const ns of HOST_NAMESPACES) {
    const suffix = `.${ns}${TENANT_HOST_SUFFIX}`;
    if (host.endsWith(suffix)) {
      const name = host.slice(0, -suffix.length);
      if (name && !name.includes('.')) return ns;
    }
  }
  return null;
}

/** Map a namespaced host to the production host it mimics; production hosts pass through. */
export function effectiveHostname(hostname: string | null | undefined): string | null {
  const host = normalise(hostname);
  if (!host) return null;
  const ns = hostNamespace(host);
  if (!ns) return host;
  const name = host.slice(0, -`.${ns}${TENANT_HOST_SUFFIX}`.length);
  return name === 'legacy' ? LEGACY_PRODUCTION_HOST : `${name}${TENANT_HOST_SUFFIX}`;
}

export function extractSlug(hostname: string | null | undefined): string | null {
  const host = effectiveHostname(hostname);
  if (!host) return null;

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
