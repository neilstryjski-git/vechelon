/**
 * Innovation Accounting client-side instrumentation
 *
 * Fires events to public.analytics_events for the IA hypotheses (H1–H5)
 * defined in VoC/MT/IA Pillar II §6.3. Fire-and-forget — never blocks UI.
 *
 * Event semantics (W131 / IA-S0-03):
 *  - portal_visit: ONCE per session arrival (VMT-D-42). Reads source/ref/ride_id
 *    from the URL on initial load and persists them in sessionStorage for
 *    downstream H5 attribution. Internal route changes do NOT fire portal_visit.
 *  - portal_rsvp / portal_gpx_download / portal_nav_external: fire on rider action.
 *    Each carries the session ref hash (if present) so H5 can credit the sharer.
 *
 * tenant_id is always set. user_id is null for unauthenticated callers.
 */
import { supabase } from './supabase';

const SESSION_KEY_REF = 'vechelon_ia_ref';
const SESSION_KEY_SOURCE = 'vechelon_ia_source';
const SESSION_KEY_FIRED = 'vechelon_ia_visit_fired';

const VALID_SOURCES = ['broadcast', 'social', 'ridecard', 'captain', 'direct', 'unknown'] as const;
export type SourceValue = (typeof VALID_SOURCES)[number];
export type RiderType = 'member' | 'guest' | 'unknown';

function readSession(key: string): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeSession(key: string, value: string) {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(key, value);
  } catch {
    /* Safari private mode — fire-and-forget */
  }
}

function parseSource(value: string | null): SourceValue {
  if (!value) return 'direct';
  return (VALID_SOURCES as readonly string[]).includes(value)
    ? (value as SourceValue)
    : 'unknown';
}

/**
 * Fires portal_visit ONCE per session arrival. Subsequent calls in the same
 * browser session are no-ops. Page refresh / new tab counts as a new session.
 */
export async function firePortalVisitOnce(opts: { tenantId: string; riderType: RiderType }): Promise<void> {
  if (typeof window === 'undefined') return;
  if (readSession(SESSION_KEY_FIRED) === '1') return;

  const params = new URLSearchParams(window.location.search);
  const source = parseSource(params.get('source'));
  const ref = params.get('ref');

  // Extract ride_id from /portal/ride/<id> or /ride/<id> path. UUID match keeps
  // pathological values out of metadata (e.g. trailing slashes, query bleed).
  const match = window.location.pathname.match(/\/ride\/([0-9a-fA-F-]{36})/);
  const rideId = match ? match[1] : null;

  writeSession(SESSION_KEY_SOURCE, source);
  if (ref) writeSession(SESSION_KEY_REF, ref);
  writeSession(SESSION_KEY_FIRED, '1');

  const metadata: Record<string, unknown> = {
    source,
    rider_type: opts.riderType,
  };
  if (ref) metadata.ref = ref;
  if (rideId) metadata.ride_id = rideId;

  await insertEvent('portal_visit', opts.tenantId, metadata);
}

export async function firePortalRsvp(opts: {
  tenantId: string;
  rideId: string;
  riderType: 'member' | 'guest';
}): Promise<void> {
  await insertEvent('portal_rsvp', opts.tenantId, {
    ride_id: opts.rideId,
    rider_type: opts.riderType,
    ...attributionFromSession(),
  });
}

export async function firePortalGpxDownload(opts: {
  tenantId: string;
  rideId: string;
  downloadSource: 'broadcast' | 'route_library';
}): Promise<void> {
  await insertEvent('portal_gpx_download', opts.tenantId, {
    ride_id: opts.rideId,
    download_source: opts.downloadSource,
    ...attributionFromSession(),
  });
}

export async function firePortalNavExternal(opts: {
  tenantId: string;
  rideId: string;
  navType: 'google_maps' | 'garmin' | 'other';
}): Promise<void> {
  await insertEvent('portal_nav_external', opts.tenantId, {
    ride_id: opts.rideId,
    nav_type: opts.navType,
    ...attributionFromSession(),
  });
}

/**
 * W132 / IA-S0-04: broadcast_copy fires when an admin clicks Copy Broadcast.
 * Drives H1 (Admin Adoption — time-to-broadcast) and H4 (Information Diversion
 * — attendance vs broadcast click ratio). Does NOT use session attribution —
 * broadcast_copy is admin-fired, not rider-fired.
 *
 * minutes_since_ride_created is computed at fire time and rounded to 1 decimal
 * to match the H1 SQL view (ia_h1_time_to_broadcast).
 */
export async function fireBroadcastCopy(opts: {
  tenantId: string;
  rideId: string;
  rideCreatedAt: string;
  adminUserId: string;
}): Promise<void> {
  const ageMs = Date.now() - new Date(opts.rideCreatedAt).getTime();
  const minutesSinceRideCreated = Math.round((ageMs / 60_000) * 10) / 10;
  await insertEvent('broadcast_copy', opts.tenantId, {
    ride_id: opts.rideId,
    minutes_since_ride_created: minutesSinceRideCreated,
  }, opts.adminUserId);
}

function attributionFromSession(): Record<string, string> {
  const out: Record<string, string> = {};
  const ref = readSession(SESSION_KEY_REF);
  const source = readSession(SESSION_KEY_SOURCE);
  if (ref) out.ref = ref;
  if (source) out.source = source;
  return out;
}

async function insertEvent(
  eventType: string,
  tenantId: string,
  metadata: Record<string, unknown>,
  userIdOverride?: string,
): Promise<void> {
  try {
    let userId: string | null = userIdOverride ?? null;
    if (!userIdOverride) {
      const { data } = await supabase.auth.getUser();
      userId = data.user?.id ?? null;
    }
    await supabase.from('analytics_events').insert({
      event_type: eventType,
      user_id: userId,
      tenant_id: tenantId,
      metadata,
    });
  } catch (err) {
    // Fire-and-forget — never surface or retry IA failures (CP-IA-01: events
    // must fire reliably, but a single failure must not block UI).
    if (import.meta.env.DEV) {
      console.warn('[ia]', eventType, 'insert failed:', err);
    }
  }
}
