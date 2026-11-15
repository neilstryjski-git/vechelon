import { describe, it, expect } from 'vitest';
// Imports the edge-function helper directly — it is pure TS with no Deno APIs.
import { escapeHtml, safeHexColor, safeHttpsUrl } from '../../../supabase/functions/_shared/html';

describe('email HTML escaping helpers (D96)', () => {
  it('escapes the five HTML-significant characters', () => {
    expect(escapeHtml(`<a href="x" onclick='y'>&</a>`)).toBe(
      '&lt;a href=&quot;x&quot; onclick=&#39;y&#39;&gt;&amp;&lt;/a&gt;'
    );
    expect(escapeHtml(null)).toBe('');
    expect(escapeHtml(undefined)).toBe('');
    expect(escapeHtml('Bikes & Beers')).toBe('Bikes &amp; Beers');
  });

  it('accepts only #rgb / #rrggbb colours', () => {
    expect(safeHexColor('#5f5e5e', '#000')).toBe('#5f5e5e');
    expect(safeHexColor('#abc', '#000')).toBe('#abc');
    expect(safeHexColor('red;background:url(x)', '#000')).toBe('#000');
    expect(safeHexColor('"><script>', '#000')).toBe('#000');
    expect(safeHexColor(null, '#000')).toBe('#000');
  });

  it('accepts only https URLs, escaped', () => {
    expect(safeHttpsUrl('https://vechelon.ca/logo.png')).toBe('https://vechelon.ca/logo.png');
    expect(safeHttpsUrl('javascript:alert(1)')).toBe('');
    expect(safeHttpsUrl('http://vechelon.ca/logo.png')).toBe('');
    expect(safeHttpsUrl('data:image/png;base64,AAAA')).toBe('');
    expect(safeHttpsUrl('not a url')).toBe('');
    expect(safeHttpsUrl('https://x.test/a"b')).not.toContain('"');
  });
});
