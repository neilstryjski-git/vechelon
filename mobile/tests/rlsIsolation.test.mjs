// Rail 3 — DoD-12 cross-tenant isolation matrix (W182)
// =====================================================================
// Behavioral proof that NO cross-tenant access to Rail 3 data is possible,
// across BOTH enforcement layers (Sprint-0 gap G-1):
//   1. DB RLS        — beacon_alerts / rider_states reads (W169 policies)
//   2. Broadcast authz — private `rail3:ride:<uuid>` channel subscription
//                        (W170 realtime.messages policies)
// plus the ISOLATION regression control: existing web-app in-tenant access on
// shared tables (rides / ride_participants / tenants) is unaffected by the
// Rail 3 schema.
//
// Runs with Node's built-in test runner (no jest):  cd mobile && npm test
// Target: the LOCAL Supabase stack ONLY (CI: .github/workflows/rail3-ci.yml).
// It refuses to run against any non-local URL — never point it at the hosted
// production project (drktcxggaizkbvqccfhp) or rail3-staging.
//
// RESILIENT (same pattern as supabase/tests/rail3_rls_isolation.test.sql):
// when the held Rail 3 migrations are not applied (e.g. a master-based PR),
// the Rail 3 assertions SKIP rather than fail; the web-regression control
// still runs. The full matrix executes on any branch carrying the W169+W170
// migrations — and permanently once they merge at the promotion gate.
//
// Env (exported by CI from `supabase status -o env`):
//   SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';

const SUPA_URL = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321';
const ANON_KEY = process.env.SUPABASE_ANON_KEY;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// ── Guardrails ────────────────────────────────────────────────────────────────
if (!['127.0.0.1', 'localhost', '::1', '[::1]'].includes(new URL(SUPA_URL).hostname)) {
  console.error(`Refusing to run: SUPABASE_URL is not a local address (${SUPA_URL}).`);
  console.error('This isolation matrix runs against the local stack only.');
  process.exit(1);
}
if (!ANON_KEY || !SERVICE_KEY) {
  console.error('Missing SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY.');
  console.error('Start the stack and export env:  npx supabase start && eval "$(npx supabase status -o env)"');
  console.error('then: SUPABASE_URL=$API_URL SUPABASE_ANON_KEY=$ANON_KEY SUPABASE_SERVICE_ROLE_KEY=$SERVICE_ROLE_KEY npm test');
  process.exit(1);
}

const admin = createClient(SUPA_URL, SERVICE_KEY, { auth: { persistSession: false } });

// Unique suffix so reruns never collide on unique columns (tenants.slug, rides.qr_code).
const RUN = `w182-${Date.now()}`;

// Fixture state populated in before()
const fx = {
  rail3SchemaPresent: false,
  telemetrySchemaPresent: false, // W284 tables (20260915000000_rail3_telemetry)
  tenantA: null,
  tenantB: null,
  userA: null, // { id, email, client }  — member of tenant A only
  userA2: null, // second member of tenant A, participant of ride A (W282 own-row negative tests)
  userB: null, // member of tenant B only
  rideA: null,
  rideB: null,
};

// Sign in a seeded user and return an authed client (its own auth storage).
async function signedInClient(email, password) {
  const client = createClient(SUPA_URL, ANON_KEY, { auth: { persistSession: false } });
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`sign-in failed for ${email}: ${error.message}`);
  // Make sure the realtime connection authenticates as this user, not anon.
  await client.realtime.setAuth(data.session.access_token);
  return client;
}

// Subscribe to a topic as `client` and resolve with the terminal status.
// A denied private-channel join surfaces as CHANNEL_ERROR (or TIMED_OUT).
function subscribeStatus(client, topic, timeoutMs = 8000) {
  return new Promise((resolve) => {
    const ch = client.channel(topic, { config: { private: true, broadcast: { self: true, ack: true } } });
    const timer = setTimeout(() => {
      client.removeChannel(ch);
      resolve('TIMED_OUT');
    }, timeoutMs);
    ch.subscribe((status) => {
      if (status === 'SUBSCRIBED' || status === 'CHANNEL_ERROR' || status === 'CLOSED') {
        clearTimeout(timer);
        resolve(status);
      }
    });
  });
}

before(async () => {
  // Detect whether the held Rail 3 migrations (W169/W170) are applied here.
  {
    const { error } = await admin.from('beacon_alerts').select('id').limit(1);
    fx.rail3SchemaPresent = !error;
    if (error && process.env.EXPECT_RAIL3) {
      // The workflow saw rail3 migrations on this branch, so an unreachable
      // beacon_alerts is a real failure — never let it silently downgrade the
      // full matrix to a green run of skips.
      console.error(`EXPECT_RAIL3 is set but the schema probe failed: ${error.code ?? error.message}`);
      process.exit(1);
    }
    if (error) console.log(`beacon_alerts not reachable (${error.code ?? error.message}) — Rail 3 assertions will SKIP.`);
  }
  {
    // W284: the telemetry migration is a separate file; probe it separately so the matrix
    // skips (never fails) on a branch that carries W169/W170 but not W284.
    const { error } = await admin.from('rail3_telemetry_events').select('id').limit(1);
    fx.telemetrySchemaPresent = !error;
    if (error) console.log(`rail3_telemetry_events not reachable (${error.code ?? error.message}) — W284 assertions will SKIP.`);
  }

  // Two tenants
  const { data: tenants, error: tErr } = await admin
    .from('tenants')
    .insert([
      { name: `W182 Tenant A ${RUN}`, slug: `${RUN}-a`, primary_color: '#111111', accent_color: '#222222' },
      { name: `W182 Tenant B ${RUN}`, slug: `${RUN}-b`, primary_color: '#333333', accent_color: '#444444' },
    ])
    .select('id, slug');
  assert.ifError(tErr);
  fx.tenantA = tenants.find((t) => t.slug.endsWith('-a'));
  fx.tenantB = tenants.find((t) => t.slug.endsWith('-b'));

  // Two real auth users (password auth is local-stack-only test plumbing; the
  // app itself uses magic links). Each is a member of exactly ONE tenant, so
  // get_my_tenant_id() — the helper every Rail 3 policy scopes by — is
  // deterministic per user.
  const password = `Pw-${RUN}-secret`;
  for (const [key, tenant] of [['userA', fx.tenantA], ['userA2', fx.tenantA], ['userB', fx.tenantB]]) {
    const email = `${RUN}-${key}@test.local`;
    const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    assert.ifError(error);
    const id = data.user.id;
    const { error: aErr } = await admin.from('accounts').upsert({ id, email, phone: '000' });
    assert.ifError(aErr);
    const { error: mErr } = await admin
      .from('account_tenants')
      .insert({ account_id: id, tenant_id: tenant.id, role: 'member', status: 'affiliated' });
    assert.ifError(mErr);
    fx[key] = { id, email, client: await signedInClient(email, password) };
  }

  // One ride per tenant + user A participates in ride A (web-regression fixture).
  const { data: rides, error: rErr } = await admin
    .from('rides')
    .insert([
      // ride_type enum is {route, adhoc, meetup} — 'scheduled' was renamed by
      // migration 20260415000000 (the stale-enum trap PR #56 hit in seed.sql).
      // Ride B is ADHOC so the Ad Hoc channel edge case is exercised directly:
      // the cross-tenant deny AND the in-tenant subscribe both run on its channel.
      { tenant_id: fx.tenantA.id, name: `W182 ride A ${RUN}`, type: 'route', start_coords: '(45.50,-73.60)', qr_code: `${RUN}-qr-a`, created_by: fx.userA.id },
      { tenant_id: fx.tenantB.id, name: `W182 ride B ${RUN}`, type: 'adhoc', start_coords: '(45.51,-73.61)', qr_code: `${RUN}-qr-b`, created_by: fx.userB.id },
    ])
    .select('id, tenant_id');
  assert.ifError(rErr);
  fx.rideA = rides.find((r) => r.tenant_id === fx.tenantA.id);
  fx.rideB = rides.find((r) => r.tenant_id === fx.tenantB.id);

  const { error: pErr } = await admin
    .from('ride_participants')
    .insert([
      { ride_id: fx.rideA.id, account_id: fx.userA.id, role: 'member', status: 'rsvpd' },
      { ride_id: fx.rideA.id, account_id: fx.userA2.id, role: 'member', status: 'rsvpd' },
    ]);
  assert.ifError(pErr);

  // Rail 3 rows for tenant B ONLY — so tenant A doubles as the
  // "tenant with no Rail 3 data yet" edge case.
  if (fx.rail3SchemaPresent) {
    const { error: bErr } = await admin.from('beacon_alerts').insert({
      tenant_id: fx.tenantB.id, ride_id: fx.rideB.id, rider_id: fx.userB.id,
    });
    assert.ifError(bErr);
    const { error: sErr } = await admin.from('rider_states').insert({
      tenant_id: fx.tenantB.id, ride_id: fx.rideB.id, rider_id: fx.userB.id, state: 'active',
    });
    assert.ifError(sErr);
  }
});

after(async () => {
  // Best-effort teardown (local throwaway stack; CI destroys it anyway).
  try {
    for (const u of [fx.userA, fx.userA2, fx.userB]) {
      if (!u) continue;
      await u.client?.auth.signOut();
      u.client?.realtime.disconnect();
    }
    if (fx.rail3SchemaPresent) {
      await admin.from('rider_states').delete().in('tenant_id', [fx.tenantA.id, fx.tenantB.id]);
      await admin.from('beacon_alerts').delete().in('tenant_id', [fx.tenantA.id, fx.tenantB.id]);
    }
    if (fx.telemetrySchemaPresent) {
      await admin.from('rail3_telemetry_events').delete().in('tenant_id', [fx.tenantA.id, fx.tenantB.id]);
    }
    // W284: flipping ride B to 'saved' in the purge replica fires trg_ride_closed, which writes an
    // analytics_events row (tenant FK, no ON DELETE) — remove it or the tenants delete below fails.
    await admin.from('analytics_events').delete().in('tenant_id', [fx.tenantA.id, fx.tenantB.id]);
    await admin.from('ride_participants').delete().eq('ride_id', fx.rideA?.id ?? '');
    await admin.from('rides').delete().in('id', [fx.rideA?.id, fx.rideB?.id].filter(Boolean));
    for (const u of [fx.userA, fx.userA2, fx.userB]) {
      if (!u) continue;
      await admin.from('account_tenants').delete().eq('account_id', u.id);
      await admin.from('accounts').delete().eq('id', u.id);
      await admin.auth.admin.deleteUser(u.id);
    }
    await admin.from('tenants').delete().in('id', [fx.tenantA?.id, fx.tenantB?.id].filter(Boolean));
  } catch (e) {
    console.warn('teardown (non-fatal):', e.message);
  }
});

// ── Layer 1: DB RLS on Rail 3 tables (W169) ──────────────────────────────────

test('cross-tenant beacon_alerts read returns zero rows', async (t) => {
  if (!fx.rail3SchemaPresent) return t.skip('Rail 3 schema not applied');
  const { data, error } = await fx.userA.client
    .from('beacon_alerts').select('id').eq('tenant_id', fx.tenantB.id);
  assert.ifError(error);
  assert.equal(data.length, 0, `LEAK: tenant-A user read ${data.length} tenant-B beacon_alerts row(s)`);
});

test('cross-tenant rider_states read returns zero rows', async (t) => {
  if (!fx.rail3SchemaPresent) return t.skip('Rail 3 schema not applied');
  const { data, error } = await fx.userA.client
    .from('rider_states').select('id').eq('tenant_id', fx.tenantB.id);
  assert.ifError(error);
  assert.equal(data.length, 0, `LEAK: tenant-A user read ${data.length} tenant-B rider_states row(s)`);
});

test('in-tenant Rail 3 access works (no false-positive lockout)', async (t) => {
  if (!fx.rail3SchemaPresent) return t.skip('Rail 3 schema not applied');
  const { data, error } = await fx.userB.client
    .from('beacon_alerts').select('id').eq('tenant_id', fx.tenantB.id);
  assert.ifError(error);
  assert.ok(data.length >= 1, 'over-block: tenant-B member cannot see their own tenant beacon_alerts');
});

test('tenant with no Rail 3 data yet reads cleanly (empty, no error)', async (t) => {
  if (!fx.rail3SchemaPresent) return t.skip('Rail 3 schema not applied');
  for (const table of ['beacon_alerts', 'rider_states']) {
    const { data, error } = await fx.userA.client
      .from(table).select('id').eq('tenant_id', fx.tenantA.id);
    assert.ifError(error);
    assert.equal(data.length, 0, `expected empty ${table} for a tenant with no Rail 3 activity`);
  }
});

// ── Layer 2: Broadcast authorization on private channels (W170 / G-1) ────────
// NOTE: a DB-only matrix would PASS even if channel subscription leaked — these
// subscriptions go through the real Realtime server's authorization check.

test('cross-tenant Broadcast channel subscription is DENIED', async (t) => {
  if (!fx.rail3SchemaPresent) return t.skip('Rail 3 schema not applied');
  const status = await subscribeStatus(fx.userA.client, `rail3:ride:${fx.rideB.id}`);
  assert.notEqual(status, 'SUBSCRIBED',
    `LEAK (G-1): tenant-A user subscribed to tenant-B's private ride channel`);
});

test('in-tenant Broadcast channel subscription succeeds and can send', async (t) => {
  if (!fx.rail3SchemaPresent) return t.skip('Rail 3 schema not applied');
  const topic = `rail3:ride:${fx.rideB.id}`;
  const ch = fx.userB.client.channel(topic, { config: { private: true, broadcast: { self: true, ack: true } } });
  const status = await new Promise((resolve) => {
    const timer = setTimeout(() => resolve('TIMED_OUT'), 8000);
    ch.subscribe((s) => {
      if (s === 'SUBSCRIBED' || s === 'CHANNEL_ERROR' || s === 'CLOSED') { clearTimeout(timer); resolve(s); }
    });
  });
  assert.equal(status, 'SUBSCRIBED', 'over-block: in-tenant rider denied their own ride channel');
  const sent = await ch.send({ type: 'broadcast', event: 'w182-ping', payload: { ok: true } });
  assert.equal(sent, 'ok', 'in-tenant rider could not broadcast on their own ride channel');
  await fx.userB.client.removeChannel(ch);
});

test('unknown-ride topic is fail-closed (denied even for a valid member)', async (t) => {
  if (!fx.rail3SchemaPresent) return t.skip('Rail 3 schema not applied');
  // Covers the Ad Hoc edge: an Ad Hoc ride only gets a channel once its rides row
  // exists — any rail3:ride:<uuid> topic with no backing ride authorizes NOBODY.
  const status = await subscribeStatus(fx.userB.client, 'rail3:ride:00000000-0000-0000-0000-000000000000');
  assert.notEqual(status, 'SUBSCRIBED', 'fail-open: channel for a nonexistent ride accepted a subscriber');
});

// ── ISOLATION regression control: existing web-app access unaffected ─────────
// These mimic the admin/ web app's in-tenant queries on SHARED tables. They run
// regardless of Rail 3 schema presence; if the Rail 3 migrations ever regress
// them, this control — not just the field PoC — catches it.

test('web regression: member still sees their tenant rides', async () => {
  const { data, error } = await fx.userA.client
    .from('rides').select('id, name').eq('tenant_id', fx.tenantA.id);
  assert.ifError(error);
  assert.ok(data.some((r) => r.id === fx.rideA.id), 'REGRESSION: member lost visibility of their own tenant ride');
});

test('web regression: member still sees their own ride_participants row', async () => {
  const { data, error } = await fx.userA.client
    .from('ride_participants').select('id, account_id').eq('account_id', fx.userA.id);
  assert.ifError(error);
  assert.ok(data.length >= 1, 'REGRESSION: member lost visibility of their own participant row');
});

test('web regression: tenant public select still works', async () => {
  const { data, error } = await fx.userA.client
    .from('tenants').select('id, name').eq('id', fx.tenantA.id);
  assert.ifError(error);
  assert.equal(data.length, 1, 'REGRESSION: tenant row no longer publicly selectable');
});

test('web regression: rides cross-tenant boundary unchanged (no widening)', async () => {
  // The Rail 3 schema must not have WIDENED existing access either: tenant-A's
  // member must still NOT see tenant-B's rides.
  const { data, error } = await fx.userA.client
    .from('rides').select('id').eq('tenant_id', fx.tenantB.id);
  assert.ifError(error);
  assert.equal(data.length, 0, 'REGRESSION: Rail 3 changes widened cross-tenant rides visibility');
});

// ── W282: ride_participants.beacon_active own-row scoping (participant_update_policy) ────────
// Base-schema table, so these run even without the Rail 3 migrations. Row counts only.

test('W282: a plain member cannot update another participant\'s beacon_active (0 rows)', async () => {
  const { data, error } = await fx.userA.client
    .from('ride_participants')
    .update({ beacon_active: false })
    .eq('ride_id', fx.rideA.id)
    .eq('account_id', fx.userA2.id)
    .select('account_id');
  assert.ifError(error);
  assert.deepEqual(data, []);
});

test('W282: a tenant-B user cannot touch a tenant-A participant row (0 rows)', async () => {
  const { data, error } = await fx.userB.client
    .from('ride_participants')
    .update({ beacon_active: false })
    .eq('ride_id', fx.rideA.id)
    .eq('account_id', fx.userA.id)
    .select('account_id');
  assert.ifError(error);
  assert.deepEqual(data, []);
});

test('W282: a member CAN set beacon_active on their own row (1 row)', async () => {
  const { data, error } = await fx.userA.client
    .from('ride_participants')
    .update({ beacon_active: true })
    .eq('ride_id', fx.rideA.id)
    .eq('account_id', fx.userA.id)
    .select('account_id');
  assert.ifError(error);
  assert.equal(data.length, 1);
});

test('W282: a captain CAN clear beacon_active on a rider\'s row in their ride (1 row), via is_captain_or_support', async () => {
  assert.ifError((await admin.from('ride_participants').update({ role: 'captain' }).eq('ride_id', fx.rideA.id).eq('account_id', fx.userA.id)).error);
  try {
    const { data, error } = await fx.userA.client
      .from('ride_participants')
      .update({ beacon_active: false })
      .eq('ride_id', fx.rideA.id)
      .eq('account_id', fx.userA2.id)
      .select('account_id');
    assert.ifError(error);
    assert.equal(data.length, 1);
  } finally {
    await admin.from('ride_participants').update({ role: 'member' }).eq('ride_id', fx.rideA.id).eq('account_id', fx.userA.id);
  }
});

// ── W284: always-on telemetry tier + operator config (DoD-12 extension) ─────────────────────
// Row counts / error codes only. Reads of rail3_telemetry_events are service_role ONLY: with no
// SELECT grant for authenticated, PostgREST answers 42501 (not an empty set) — asserted on purpose.

const telemetryRow = (tenantId, rideId, accountId, extra = {}) => ({
  tenant_id: tenantId, ride_id: rideId, account_id: accountId,
  platform: 'android', device_class: 'test/device', kind: 'engine_started', tier: 'always_on',
  client_ts: new Date().toISOString(), payload: { reason: 'start_resolved' }, ...extra,
});

test('W284: same-tenant always_on INSERT as the writer succeeds (bare insert, no select)', async (t) => {
  if (!fx.telemetrySchemaPresent) return t.skip('W284 telemetry schema not applied');
  const { error } = await fx.userB.client.from('rail3_telemetry_events').insert(telemetryRow(fx.tenantB.id, fx.rideB.id, fx.userB.id));
  assert.ifError(error);
  const { data } = await admin.from('rail3_telemetry_events').select('id, account_id').eq('ride_id', fx.rideB.id);
  assert.equal(data.length, 1);
  assert.equal(data[0].account_id, fx.userB.id);
});

test('W284: cross-tenant INSERT is denied (42501)', async (t) => {
  if (!fx.telemetrySchemaPresent) return t.skip('W284 telemetry schema not applied');
  const { error } = await fx.userA.client.from('rail3_telemetry_events').insert(telemetryRow(fx.tenantB.id, fx.rideB.id, fx.userA.id));
  assert.ok(error, 'expected an RLS rejection');
  assert.equal(error.code, '42501');
});

test('W284: INSERT under another account_id in my own tenant is denied (42501) — identity pinned', async (t) => {
  if (!fx.telemetrySchemaPresent) return t.skip('W284 telemetry schema not applied');
  const { error } = await fx.userA.client.from('rail3_telemetry_events').insert(telemetryRow(fx.tenantA.id, fx.rideA.id, fx.userA2.id));
  assert.ok(error);
  assert.equal(error.code, '42501');
});

test('W284: authenticated cannot READ telemetry at all (no SELECT grant → 42501)', async (t) => {
  if (!fx.telemetrySchemaPresent) return t.skip('W284 telemetry schema not applied');
  const { error } = await fx.userB.client.from('rail3_telemetry_events').select('id').eq('ride_id', fx.rideB.id);
  assert.ok(error);
  assert.equal(error.code, '42501');
});

test('W284: a payload carrying a coordinate key is rejected at the schema (23514)', async (t) => {
  if (!fx.telemetrySchemaPresent) return t.skip('W284 telemetry schema not applied');
  const { error } = await fx.userB.client.from('rail3_telemetry_events').insert(
    telemetryRow(fx.tenantB.id, fx.rideB.id, fx.userB.id, { payload: { lat: 1 } }),
  );
  assert.ok(error);
  assert.equal(error.code, '23514');
});

test('W284: authenticated can READ the operator config (android + ios rows present)', async (t) => {
  if (!fx.telemetrySchemaPresent) return t.skip('W284 telemetry schema not applied');
  const { data, error } = await fx.userA.client.from('rail3_operator_config').select('platform');
  assert.ifError(error);
  assert.deepEqual(data.map((r) => r.platform).sort(), ['android', 'ios']);
});

test('W284: authenticated cannot WRITE the operator config (42501) — operator-level by ruling', async (t) => {
  if (!fx.telemetrySchemaPresent) return t.skip('W284 telemetry schema not applied');
  const { error } = await fx.userA.client.from('rail3_operator_config').update({ full_capture_ride_id: fx.rideA.id }).eq('platform', 'android');
  assert.ok(error);
  assert.equal(error.code, '42501');
});

test('W284: INSERT against a ride that belongs to another tenant is denied (42501) — ride-scoped', async (t) => {
  if (!fx.telemetrySchemaPresent) return t.skip('W284 telemetry schema not applied');
  // tenant_id is MY tenant (passes the tenant clause) but ride_id is a tenant-B ride.
  const { error } = await fx.userA.client.from('rail3_telemetry_events').insert(telemetryRow(fx.tenantA.id, fx.rideB.id, fx.userA.id));
  assert.ok(error);
  assert.equal(error.code, '42501');
});

// Replicates hard-purge-location's three telemetry statements as service_role (the function
// itself needs deno + the local stack; its SQL is what matters). LAST in the file: it marks
// ride B 'saved' with an old actual_end, which the earlier channel tests must not see.
test('W284: purge strips identity from always_on rows and deletes full_capture rows past T+4h; a second run is a no-op', async (t) => {
  if (!fx.telemetrySchemaPresent) return t.skip('W284 telemetry schema not applied');
  const fiveHoursAgo = new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString();
  assert.ifError((await admin.from('rides').update({ status: 'saved', actual_end: fiveHoursAgo }).eq('id', fx.rideB.id)).error);
  assert.ifError((await admin.from('rail3_telemetry_events').insert([
    telemetryRow(fx.tenantB.id, fx.rideB.id, fx.userB.id),
    telemetryRow(fx.tenantB.id, fx.rideB.id, fx.userB.id, { tier: 'full_capture', kind: 'heartbeat_check' }),
  ])).error);
  assert.ifError((await admin.from('rail3_operator_config').update({ full_capture_ride_id: fx.rideB.id }).eq('platform', 'android')).error);

  const fourHoursAgo = new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString();
  const run = async () => {
    const { data: rides } = await admin.from('rides').select('id').eq('status', 'saved').lt('actual_end', fourHoursAgo).eq('id', fx.rideB.id);
    const ids = rides.map((r) => r.id);
    const { data: deleted, error: e1 } = await admin.from('rail3_telemetry_events').delete().in('ride_id', ids).eq('tier', 'full_capture').select('id');
    assert.ifError(e1);
    const { data: stripped, error: e2 } = await admin.from('rail3_telemetry_events').update({ account_id: null }).in('ride_id', ids).eq('tier', 'always_on').not('account_id', 'is', null).select('id');
    assert.ifError(e2);
    const { error: e3 } = await admin.from('rail3_operator_config').update({ full_capture_ride_id: null }).in('full_capture_ride_id', ids);
    assert.ifError(e3);
    return { deleted: deleted.length, stripped: stripped.length };
  };
  const first = await run();
  assert.ok(first.deleted >= 1, 'full_capture row deleted');
  assert.ok(first.stripped >= 1, 'always_on identity stripped');
  const { data: rows } = await admin.from('rail3_telemetry_events').select('tier, account_id').eq('ride_id', fx.rideB.id);
  assert.ok(rows.every((r) => r.tier === 'always_on' && r.account_id === null));
  const { data: cfg } = await admin.from('rail3_operator_config').select('full_capture_ride_id').eq('platform', 'android').single();
  assert.equal(cfg.full_capture_ride_id, null);
  const second = await run();
  assert.deepEqual(second, { deleted: 0, stripped: 0 });
});

// ── W288: the app-tracked join signal (ride_participants.rail3_joined_at) ───────────────────
// Skip-guarded on the COLUMN (migration 20260916000000), independent of the Rail 3 table probe.

test('W288: a rider stamps rail3_joined_at on their OWN row once; a second mark matches 0 rows; another rider\'s row is untouchable', async (t) => {
  const probe = await admin.from('ride_participants').select('rail3_joined_at').limit(1);
  if (probe.error) return t.skip('W288 rail3_joined_at column not applied');
  const stamp = (client, accountId) => client
    .from('ride_participants')
    .update({ rail3_joined_at: new Date().toISOString() })
    .eq('ride_id', fx.rideA.id)
    .eq('account_id', accountId)
    .is('rail3_joined_at', null)
    .select('account_id, rail3_joined_at');
  const first = await stamp(fx.userA.client, fx.userA.id);
  assert.ifError(first.error);
  assert.equal(first.data.length, 1, 'first open stamps the row');
  const ts = first.data[0].rail3_joined_at;
  const second = await stamp(fx.userA.client, fx.userA.id);
  assert.ifError(second.error);
  assert.deepEqual(second.data, [], 'rejoin leaves the first-open timestamp alone');
  const { data: still } = await admin.from('ride_participants').select('rail3_joined_at').eq('ride_id', fx.rideA.id).eq('account_id', fx.userA.id).single();
  assert.equal(still.rail3_joined_at, ts);
  const other = await stamp(fx.userA.client, fx.userA2.id);
  assert.ifError(other.error);
  assert.deepEqual(other.data, [], 'participant_update_policy: a member cannot stamp another rider\'s row');
});

// ── W291: any Captain on the ride can End Ride (rides_rail3_captain_end) ──────────────────────
// userA created ride A (so userA takes the ride_admin_modify path); userA2 is neither creator nor
// tenant admin — exactly the co-Captain the new policy exists for. Denial under RLS is 0 rows, not
// an error, so every negative asserts on the row count AND re-reads status as admin.

const endRideAs = (client) => client
  .from('rides')
  .update({ status: 'saved', actual_end: new Date().toISOString() })
  .eq('id', fx.rideA.id)
  .eq('status', 'active')
  .select('id');
const rideAStatus = async () => (await admin.from('rides').select('status').eq('id', fx.rideA.id).single()).data.status;
const setRideA = async (status) => assert.ifError((await admin.from('rides').update({ status, actual_end: null }).eq('id', fx.rideA.id)).error);
const setRoleA2 = async (role) => assert.ifError((await admin.from('ride_participants').update({ role }).eq('ride_id', fx.rideA.id).eq('account_id', fx.userA2.id)).error);

test('W291: a co-Captain who is neither creator nor tenant admin CAN end an ACTIVE ride (1 row → saved)', async (t) => {
  const probe = await admin.from('ride_participants').select('rail3_joined_at').limit(1);
  if (probe.error) return t.skip('Rail 3 migrations not applied');
  const before = await rideAStatus(); // fixture inserts rideA with the DEFAULT 'created'
  await setRideA('active'); await setRoleA2('captain');
  try {
    const { data, error } = await endRideAs(fx.userA2.client);
    assert.ifError(error);
    assert.equal(data.length, 1);
    assert.equal(await rideAStatus(), 'saved');
  } finally {
    await setRoleA2('member'); await setRideA(before);
  }
});

test('W291: a Captain closing a ride cannot reassign created_by or tenant_id in the same statement (ownership guard, 42501)', async (t) => {
  const probe = await admin.from('ride_participants').select('rail3_joined_at').limit(1);
  if (probe.error) return t.skip('Rail 3 migrations not applied');
  const before = await rideAStatus();
  await setRideA('active'); await setRoleA2('captain');
  try {
    const { error } = await fx.userA2.client
      .from('rides')
      .update({ status: 'saved', actual_end: new Date().toISOString(), created_by: fx.userA2.id })
      .eq('id', fx.rideA.id)
      .eq('status', 'active')
      .select('id');
    assert.ok(error, 'the ownership guard must reject the statement');
    assert.equal(error.code, '42501');
    assert.equal(await rideAStatus(), 'active');
    const { data: row } = await admin.from('rides').select('created_by').eq('id', fx.rideA.id).single();
    assert.equal(row.created_by, fx.userA.id, 'creator unchanged');
  } finally {
    await setRoleA2('member'); await setRideA(before);
  }
});

test('W291: a member cannot end the ride; a tenant-B user cannot; a Captain cannot flip a CREATED ride (0 rows each)', async (t) => {
  const probe = await admin.from('ride_participants').select('rail3_joined_at').limit(1);
  if (probe.error) return t.skip('Rail 3 migrations not applied');
  const before = await rideAStatus();
  await setRideA('active');
  const member = await endRideAs(fx.userA2.client);
  assert.ifError(member.error); assert.deepEqual(member.data, []); assert.equal(await rideAStatus(), 'active');
  const foreign = await endRideAs(fx.userB.client);
  assert.ifError(foreign.error); assert.deepEqual(foreign.data, []); assert.equal(await rideAStatus(), 'active');
  await setRideA('created'); await setRoleA2('captain');
  try {
    const { data, error } = await fx.userA2.client.from('rides').update({ status: 'saved', actual_end: new Date().toISOString() }).eq('id', fx.rideA.id).select('id');
    assert.ifError(error); assert.deepEqual(data, []); assert.equal(await rideAStatus(), 'created');
  } finally {
    await setRoleA2('member'); await setRideA(before);
  }
});

// ── W292: the durable departed mark (ride_participants.departed_at) ─────────────────────────────
// Skip-guarded on the COLUMN (migration 20260918000000). The app's exact statement shapes: the
// departure is ONE own-row UPDATE (mark + last_* null-out together); the rejoin clears the mark and
// refreshes rail3_joined_at guarded on `departed_at IS NOT NULL`. The negative uses a MEMBER actor
// (participant_update_policy's captain/support branch would allow a Captain; the app never does that).

test('W292: a member marks their OWN row departed (one statement with the null-out); another member\'s row is untouchable (0 rows); rejoin clears it once', async (t) => {
  const probe = await admin.from('ride_participants').select('departed_at').limit(1);
  if (probe.error) return t.skip('W292 departed_at column not applied');
  const iso = new Date().toISOString();
  const depart = (client, accountId) => client
    .from('ride_participants')
    .update({ departed_at: iso, last_lat: null, last_long: null, last_ping: null })
    .eq('ride_id', fx.rideA.id)
    .eq('account_id', accountId)
    .select('account_id, departed_at');
  const rejoin = (client, accountId) => client
    .from('ride_participants')
    .update({ departed_at: null, rail3_joined_at: new Date().toISOString() })
    .eq('ride_id', fx.rideA.id)
    .eq('account_id', accountId)
    .not('departed_at', 'is', null)
    .select('account_id, departed_at, rail3_joined_at');
  try {
    const own = await depart(fx.userA.client, fx.userA.id);
    assert.ifError(own.error);
    assert.equal(own.data.length, 1);
    assert.equal(new Date(own.data[0].departed_at).toISOString(), iso);
    const other = await depart(fx.userA.client, fx.userA2.id);
    assert.ifError(other.error);
    assert.deepEqual(other.data, [], 'a member cannot mark another rider departed');
    const { data: untouched } = await admin.from('ride_participants').select('departed_at').eq('ride_id', fx.rideA.id).eq('account_id', fx.userA2.id).single();
    assert.equal(untouched.departed_at, null);
    const back = await rejoin(fx.userA.client, fx.userA.id);
    assert.ifError(back.error);
    assert.equal(back.data.length, 1, 'rejoin clears the mark');
    assert.equal(back.data[0].departed_at, null);
    assert.ok(back.data[0].rail3_joined_at, 'rejoin refreshes the app-tracked stamp');
    const again = await rejoin(fx.userA.client, fx.userA.id);
    assert.ifError(again.error);
    assert.deepEqual(again.data, [], 'a plain re-open (no departure) matches 0 rows — W288 first-open rule intact');
  } finally {
    await admin.from('ride_participants').update({ departed_at: null }).eq('ride_id', fx.rideA.id).in('account_id', [fx.userA.id, fx.userA2.id]);
  }
});
