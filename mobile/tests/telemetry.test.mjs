// W284 — unit tests for the always-on telemetry tier's pure half (Ledger slate 6, F-7;
// R3-45). Runs via `npm test` (node --experimental-strip-types --test).

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  COORDINATE_KEYS,
  hasCoordinateKeys,
  sanitizePayload,
  isFullCaptureEnabled,
  classifyEngineRun,
  deviceClass,
} from '../src/lib/telemetryPure.ts';

// --- payload guard: no position data in either tier ------------------------------------------

test('every coordinate key is stripped at the top level, case-insensitively; other keys survive', () => {
  for (const k of COORDINATE_KEYS) {
    const out = sanitizePayload({ [k]: 1, [k.toUpperCase()]: 2, reason: 'x' });
    assert.deepEqual(out, { reason: 'x' }, `key ${k}`);
  }
});

test('coordinate keys are stripped at every depth, including inside arrays', () => {
  const out = sanitizePayload({ a: { b: { lat: 1, keep: 2 } }, list: [{ lng: 3, n: 4 }, 5], coords: [1, 2] });
  assert.deepEqual(out, { a: { b: { keep: 2 } }, list: [{ n: 4 }, 5] });
  assert.equal(hasCoordinateKeys(out), false);
});

test('non-object payloads become {} and the guard never throws', () => {
  for (const v of [null, undefined, 1, 'x', [1, 2], () => {}]) assert.deepEqual(sanitizePayload(v), {});
  const cyc = {}; cyc.self = cyc;
  assert.deepEqual(sanitizePayload(cyc), {}); // recursion blows → caught → {}
});

test('hasCoordinateKeys detects nested and array-held keys; clean payloads pass', () => {
  assert.equal(hasCoordinateKeys({ ok: { deeper: { Latitude: 0 } } }), true);
  assert.equal(hasCoordinateKeys([{ path: [] }]), true);
  assert.equal(hasCoordinateKeys({ reason: 'enabled_false', gps: false }), false);
});

// --- R3-45 / F-7 classifier -------------------------------------------------------------------

test('classifier: {} → never_engaged; {started, died} → torn_down; {started} → suspended_or_healthy', () => {
  assert.deepEqual(classifyEngineRun([]), { cls: 'never_engaged', warnings: 0 });
  assert.deepEqual(classifyEngineRun(['engine_started', 'engine_died']), { cls: 'torn_down', warnings: 0 });
  assert.deepEqual(classifyEngineRun(['engine_started']), { cls: 'suspended_or_healthy', warnings: 0 });
  assert.deepEqual(classifyEngineRun(['engine_started', 'warning_fired']), { cls: 'suspended_or_healthy', warnings: 1 });
  assert.deepEqual(classifyEngineRun(['engine_died']), { cls: 'torn_down', warnings: 0 });
});

test('F-7 recorded: a healthy run and an OEM-suspended run produce the same counter set', () => {
  // Both leave {engine_started} with no engine_died — the floor alone cannot separate them.
  assert.equal(classifyEngineRun(['engine_started']).cls, classifyEngineRun(['engine_started']).cls);
});

// --- full-capture gating (per ride, never fleet-wide) -----------------------------------------

test('isFullCaptureEnabled is true only when the flag names exactly this ride', () => {
  const cfg = { platform: 'android', full_capture_ride_id: 'ride-1', startup_ceiling_s: null, steady_state_threshold_s: null };
  assert.equal(isFullCaptureEnabled(cfg, 'ride-1'), true);
  assert.equal(isFullCaptureEnabled(cfg, 'ride-2'), false);
  assert.equal(isFullCaptureEnabled({ ...cfg, full_capture_ride_id: null }, 'ride-1'), false);
  assert.equal(isFullCaptureEnabled(null, 'ride-1'), false);
  assert.equal(isFullCaptureEnabled(cfg, null), false);
});

// --- device_class convention --------------------------------------------------------------------

test('deviceClass is "<manufacturer>/<model>" lowercased with whitespace collapsed, unknown fallbacks', () => {
  assert.equal(deviceClass('Samsung', 'SM-G781B'), 'samsung/sm-g781b');
  assert.equal(deviceClass('  Google ', 'Pixel 7 Pro'), 'google/pixel-7-pro');
  assert.equal(deviceClass(null, undefined), 'unknown/unknown');
});
