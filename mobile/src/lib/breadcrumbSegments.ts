// W290 — pure breadcrumb SEGMENT rules (Ledger slate 9 / slate 10 / item 17 / C1; Pillar III R3-72).
// Erasable TypeScript, `import type` only — the distance function is INJECTED (precedent:
// fleetCompose.ts / beaconLogic.ts), so node's --experimental-strip-types can import this module
// without a runtime specifier. Exercised by tests/breadcrumbSegments.test.mjs. The I/O bindings are
// hooks/useFleetPositions.ts (writer) and hooks/useBreadcrumb.ts (reader).
//
// THE SHAPE. rail3_breadcrumb.path stays a FLAT jsonb array of points, with a BREAK SENTINEL
// `{ brk: 1 }` between capture sessions (and across an in-session fix gap ≥ the Dark threshold).
// Why flat + sentinel and not an array of segments: a sentinel appears only on a ride where a gap was
// actually captured, so pre-W290 installs are exposed only on those rides; a segments shape would
// change the top-level type on EVERY write. The sentinel carries NOTHING else — no identity, no
// timestamp (club artifact, purge-exempt, pseudonymous by design). No migration: the column is
// unconstrained jsonb.
//
// THE HONESTY RULE (C1): the path is the concatenation of capture sessions separated by breaks;
// consecutive breaks collapse; the path never starts or ends with a break; prior elements are never
// removed or reordered; and NOTHING is ever drawn or synthesised across a break — a gap renders as a
// gap. 'stopped'/'stale'/'departed' are breadcrumb LIVENESS states, not TacticalStates (A3).

import type { LatLng } from './geo';

export interface BreakMark {
  brk: 1;
}
export type TrailElement = LatLng | BreakMark;
export type TrailPath = TrailElement[]; // the rail3_breadcrumb.path shape

export const BREAK: Readonly<BreakMark> = Object.freeze({ brk: 1 });

// Hard cap on an accumulated SEGMENT so a long ride can't grow it without bound. On hit we
// COARSEN the older head (halve its resolution) rather than drop the oldest point, so the line
// keeps its session-start origin — just at lower fidelity. (Moved from breadcrumbTrail.ts, W212.)
export const BREADCRUMB_MAX_POINTS = 1500;

export function isBreak(e: unknown): e is BreakMark {
  return typeof e === 'object' && e !== null && (e as { brk?: unknown }).brk === 1;
}

export function isPoint(e: unknown): e is LatLng {
  if (typeof e !== 'object' || e === null) return false;
  const p = e as { lat?: unknown; lng?: unknown };
  return typeof p.lat === 'number' && Number.isFinite(p.lat) && typeof p.lng === 'number' && Number.isFinite(p.lng);
}

// Defensive read of whatever the table (or an older build) holds: non-array → []; drop anything
// that is neither a point nor a break; collapse consecutive breaks; strip leading/trailing breaks.
export function normalisePath(raw: unknown): TrailPath {
  if (!Array.isArray(raw)) return [];
  const out: TrailPath = [];
  for (const e of raw) {
    if (isPoint(e)) {
      out.push({ lat: e.lat, lng: e.lng });
    } else if (isBreak(e)) {
      if (out.length > 0 && !isBreak(out[out.length - 1])) out.push(BREAK);
    }
  }
  while (out.length > 0 && isBreak(out[out.length - 1])) out.pop();
  return out;
}

// Sentinels excluded — the W234 "adopt only if longer" rule compares POINTS, not elements.
export function pointCount(path: TrailPath): number {
  let n = 0;
  for (const e of path) if (!isBreak(e)) n += 1;
  return n;
}

// Never joins across a break; empty segments dropped.
export function splitSegments(path: TrailPath): LatLng[][] {
  const segs: LatLng[][] = [];
  let cur: LatLng[] = [];
  for (const e of path) {
    if (isBreak(e)) {
      if (cur.length > 0) segs.push(cur);
      cur = [];
    } else {
      cur.push(e);
    }
  }
  if (cur.length > 0) segs.push(cur);
  return segs;
}

// Idempotent: SAME ref when the path is empty (a path never starts with a break) or already ends
// with a break (two breaks in a row collapse to one sentinel).
export function appendBreak(path: TrailPath): TrailPath {
  if (path.length === 0 || isBreak(path[path.length - 1])) return path;
  return [...path, BREAK];
}

// Coarsen-the-head cap (pure). Returns the same array if under the cap. (Moved verbatim.)
export function capTrail(trail: LatLng[]): LatLng[] {
  if (trail.length <= BREADCRUMB_MAX_POINTS) return trail;
  const tail = trail.slice(-Math.floor(BREADCRUMB_MAX_POINTS / 2));
  const head = trail
    .slice(0, trail.length - tail.length)
    .filter((_, i) => i % 2 === 0);
  return [...head, ...tail];
}

// capTrail PER SEGMENT, breaks preserved; SAME ref when nothing needed capping.
export function capSegments(path: TrailPath): TrailPath {
  const segs = splitSegments(path);
  let changed = false;
  const capped = segs.map((s) => {
    const c = capTrail(s);
    if (c !== s) changed = true;
    return c;
  });
  if (!changed) return path;
  const out: TrailPath = [];
  capped.forEach((s, i) => {
    if (i > 0) out.push(BREAK);
    out.push(...s);
  });
  return out;
}

// Distance-decimated append of the TIP point. SAME ref when the last element is a point closer
// than minGapM (so callers detect "did the trail change?" by identity). Right after a break the
// point is appended unconditionally — the new segment starts with exactly this point, and the
// sentinel is never read as a point. Never looks past a break.
export function appendTipPoint(
  path: TrailPath,
  next: LatLng,
  minGapM: number,
  distanceM: (a: LatLng, b: LatLng) => number,
): TrailPath {
  const last = path[path.length - 1];
  if (last && !isBreak(last) && distanceM(last, next) < minGapM) return path;
  return capSegments([...path, { lat: next.lat, lng: next.lng }]);
}

// The writer's table payload: prior (what the table already held at seed) ++ [break] ++ this
// session. session empty → prior (same ref); prior empty → session (a leader who departs before the
// first upsert loses nothing and gets no leading break). Prior elements are never removed or
// reordered — truncation is a data-loss defect (slate 10).
export function mergePriorAndSession(prior: TrailPath, session: TrailPath): TrailPath {
  if (session.length === 0) return prior;
  if (prior.length === 0) return session;
  return [...appendBreak(prior), ...session];
}

// W234 adopt-only-if-longer, on POINT count (sentinels excluded); ties adopt the fetched path (the
// table is authoritative on segmentation).
export function adoptIfLonger(local: TrailPath, fetched: TrailPath): TrailPath {
  return pointCount(fetched) >= pointCount(local) ? fetched : local;
}

// An in-session capture gap at least `gapMs` long is a break (writer: fix.ts vs fix.ts; reader:
// receive clock vs receive clock). A first fix has no previous one, so it is never a gap.
export function isGapBreak(prevTs: number | null, nextTs: number, gapMs: number): boolean {
  return prevTs !== null && nextTs - prevTs >= gapMs;
}

// Breadcrumb LIVENESS — not a TacticalState. 'departed' = the leader's own 'depart' (or their
// departed_at) is held and no newer ping has arrived; 'stale' = no leader ping within the SAME Dark
// threshold that turns the leader's marker Dark (StateThresholds.darkMinutes), or never heard from;
// 'live' otherwise. Only 'departed' is Captain-departure NEWS (the cue); 'stale' is styled stopped
// with no cue (R3-72: no rider is shown a frozen trace as the Captain's current line).
export type BreadcrumbLiveness = 'live' | 'stale' | 'departed';

export function deriveBreadcrumbLiveness(a: {
  leaderDeparted: boolean;
  lastLeaderPingAtMs: number | null;
  nowMs: number;
  darkMinutes: number;
}): BreadcrumbLiveness {
  if (a.leaderDeparted) return 'departed';
  if (a.lastLeaderPingAtMs === null) return 'stale';
  if (a.nowMs - a.lastLeaderPingAtMs >= a.darkMinutes * 60_000) return 'stale';
  return 'live';
}
