// D96: escaping helpers for values interpolated into transactional email HTML.
// Pure string functions (no Deno APIs) — covered by admin/src/lib/emailHtml.test.ts,
// which imports this file directly.

const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

/** Escape a value for HTML text or a double-quoted attribute. */
export function escapeHtml(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value).replace(/[&<>"']/g, (c) => HTML_ESCAPES[c]);
}

/** A CSS colour from the DB, accepted only as #rgb / #rrggbb, else the fallback. */
export function safeHexColor(value: unknown, fallback: string): string {
  return typeof value === 'string' && /^#(?:[0-9a-fA-F]{3}){1,2}$/.test(value) ? value : fallback;
}

/** An https URL for href/src, escaped; anything else (javascript:, data:, junk) → ''. */
export function safeHttpsUrl(value: unknown): string {
  if (typeof value !== 'string') return '';
  try {
    const u = new URL(value);
    return u.protocol === 'https:' ? escapeHtml(u.toString()) : '';
  } catch {
    return '';
  }
}
