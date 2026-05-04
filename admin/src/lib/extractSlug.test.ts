import { describe, it, expect } from 'vitest';
import { extractSlug } from './extractSlug';

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
