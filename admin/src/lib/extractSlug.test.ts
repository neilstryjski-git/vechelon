import { describe, it, expect } from 'vitest';
import { extractSlug, effectiveHostname, hostNamespace } from './extractSlug';

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

describe('host namespaces (preview / staging)', () => {
  it('maps <name>.preview.vechelon.ca to the production club', () => {
    expect(extractSlug('racer-sportif.preview.vechelon.ca')).toBe('racer-sportif');
    expect(extractSlug('racer-sportif.staging.vechelon.ca')).toBe('racer-sportif');
  });

  it('keeps admin/www non-tenant inside a namespace', () => {
    expect(extractSlug('admin.preview.vechelon.ca')).toBeNull();
    expect(extractSlug('www.staging.vechelon.ca')).toBeNull();
  });

  it('maps legacy.<ns> to the legacy production host and its slug', () => {
    expect(effectiveHostname('legacy.preview.vechelon.ca')).toBe('vechelon.productdelivered.ca');
    expect(extractSlug('legacy.preview.vechelon.ca')).toBe('racer-sportif');
  });

  it('reports the namespace, and null for production hosts', () => {
    expect(hostNamespace('racer-sportif.preview.vechelon.ca')).toBe('preview');
    expect(hostNamespace('legacy.staging.vechelon.ca')).toBe('staging');
    expect(hostNamespace('racer-sportif.vechelon.ca')).toBeNull();
    expect(hostNamespace('vechelon.productdelivered.ca')).toBeNull();
    expect(hostNamespace('localhost')).toBeNull();
  });

  it('does not treat a bare or nested namespace host as a club', () => {
    expect(extractSlug('preview.vechelon.ca')).toBe('preview'); // a club literally named "preview" — unchanged behaviour
    expect(extractSlug('a.b.preview.vechelon.ca')).toBeNull();
    expect(hostNamespace('a.b.preview.vechelon.ca')).toBeNull();
  });

  it('leaves every production host exactly as before', () => {
    expect(effectiveHostname('racer-sportif.vechelon.ca')).toBe('racer-sportif.vechelon.ca');
    expect(effectiveHostname('admin.vechelon.ca')).toBe('admin.vechelon.ca');
    expect(effectiveHostname('vechelon.productdelivered.ca')).toBe('vechelon.productdelivered.ca');
    expect(effectiveHostname('vechelon.ca')).toBe('vechelon.ca');
    expect(effectiveHostname('localhost')).toBe('localhost');
  });
});
