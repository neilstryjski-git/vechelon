// Deno-compatible mirror of admin/src/lib/extractSlug.ts.
// Keep these two files in sync — both are pure string manipulation, no
// browser/Node-specific APIs, so a literal duplicate is the simplest path
// vs a shared module across two build environments.

const TENANT_HOST_SUFFIX = '.vechelon.ca';
const NON_TENANT_SUBDOMAINS = new Set(['admin', 'www']);

// Transition mapping: legacy production host → slug.
// Removable after MT-S0-13 (W136) cuts production over to *.vechelon.ca.
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
