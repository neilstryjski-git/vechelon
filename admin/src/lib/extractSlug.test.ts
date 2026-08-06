import { describe, it, expect, vi, afterEach } from 'vitest';
import { extractSlug, resolveTenantSlug } from './extractSlug';

describe('extractSlug', () => {
  it('returns the slug for a known club subdomain', () => {
    expect(extractSlug('racer-sportif.vechelon.ca')).toBe('racer-sportif');
    expect(extractSlug('bikes-and-beers.vechelon.ca')).toBe('bikes-and-beers');
  });

  it('returns null for the apex', () => {
    expect(extractSlug('vechelon.ca')).toBeNull();
  });

  it('returns null for admin and www', () => {
    expect(extractSlug('admin.vechelon.ca')).toBeNull();
    expect(extractSlug('www.vechelon.ca')).toBeNull();
  });

  it('returns null for localhost and 127.0.0.1', () => {
    expect(extractSlug('localhost')).toBeNull();
    expect(extractSlug('127.0.0.1')).toBeNull();
  });

  it('returns null for vercel preview deploys', () => {
    expect(extractSlug('vechelon.vercel.app')).toBeNull();
    expect(extractSlug('vechelon-git-w124-team.vercel.app')).toBeNull();
  });

  it('returns null for unrelated domains', () => {
    expect(extractSlug('example.com')).toBeNull();
    expect(extractSlug('vechelon.com')).toBeNull();
  });

  it('returns null for null/undefined/empty input', () => {
    expect(extractSlug(null)).toBeNull();
    expect(extractSlug(undefined)).toBeNull();
    expect(extractSlug('')).toBeNull();
  });

  it('is case-insensitive', () => {
    expect(extractSlug('Racer-Sportif.Vechelon.CA')).toBe('racer-sportif');
  });

  it('strips a trailing dot', () => {
    expect(extractSlug('racer-sportif.vechelon.ca.')).toBe('racer-sportif');
  });

  it('rejects multi-level subdomains under vechelon.ca', () => {
    expect(extractSlug('foo.bar.vechelon.ca')).toBeNull();
  });

  it('maps legacy production host to racer-sportif during transition', () => {
    expect(extractSlug('vechelon.productdelivered.ca')).toBe('racer-sportif');
  });
});

describe('resolveTenantSlug (W192 — VITE_TENANT_SLUG_OVERRIDE)', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('falls back to host-based extraction when the override is unset', () => {
    expect(resolveTenantSlug('racer-sportif.vechelon.ca')).toBe('racer-sportif');
    expect(resolveTenantSlug('some-preview.vercel.app')).toBeNull();
    expect(resolveTenantSlug('localhost')).toBeNull();
  });

  it('serves the overridden tenant on any host when set (the staging case)', () => {
    vi.stubEnv('VITE_TENANT_SLUG_OVERRIDE', 'racer-sportif');
    expect(resolveTenantSlug('vechelon-rail3-staging.vercel.app')).toBe('racer-sportif');
    expect(resolveTenantSlug('localhost')).toBe('racer-sportif');
    expect(resolveTenantSlug('vechelon.ca')).toBe('racer-sportif');
  });

  it('normalizes override case and surrounding whitespace', () => {
    vi.stubEnv('VITE_TENANT_SLUG_OVERRIDE', '  Racer-Sportif  ');
    expect(resolveTenantSlug('x.vercel.app')).toBe('racer-sportif');
  });

  it('ignores an empty/whitespace override and falls back to the host', () => {
    vi.stubEnv('VITE_TENANT_SLUG_OVERRIDE', '   ');
    expect(resolveTenantSlug('racer-sportif.vechelon.ca')).toBe('racer-sportif');
    expect(resolveTenantSlug('x.vercel.app')).toBeNull();
  });
});
