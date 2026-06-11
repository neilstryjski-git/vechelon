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

const URL = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321';
const ANON_KEY = process.env.SUPABASE_ANON_KEY;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// ── Guardrails ────────────────────────────────────────────────────────────────
if (!/127\.0\.0\.1|localhost/.test(URL)) {
  console.error(`Refusing to run: SUPABASE_URL is not a local address (${URL}).`);
  console.error('This isolation matrix runs against the local stack only.');
  process.exit(1);
}
if (!ANON_KEY || !SERVICE_KEY) {
  console.error('Missing SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY.');
  console.error('Start the stack and export env:  npx supabase start && eval "$(npx supabase status -o env)"');
  console.error('then: SUPABASE_URL=$API_URL SUPABASE_ANON_KEY=$ANON_KEY SUPABASE_SERVICE_ROLE_KEY=$SERVICE_ROLE_KEY npm test');
  process.exit(1);
}

const admin = createClient(URL, SERVICE_KEY, { auth: { persistSession: false } });

// Unique suffix so reruns never collide on unique columns (tenants.slug, rides.qr_code).
const RUN = `w182-${Date.now()}`;

// Fixture state populated in before()
const fx = {
  rail3SchemaPresent: false,
  tenantA: null,
  tenantB: null,
  userA: null, // { id, email, client }  — member of tenant A only
  userB: null, // member of tenant B only
  rideA: null,
  rideB: null,
};

// Sign in a seeded user and return an authed client (its own auth storage).
async function signedInClient(email, password) {
  const client = createClient(URL, ANON_KEY, { auth: { persistSession: false } });
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
    const ch = client.channel(topic, { config: { private: true, broadcast: { self: true } } });
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
    if (error) console.log(`beacon_alerts not reachable (${error.code ?? error.message}) — Rail 3 assertions will SKIP.`);
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
  for (const [key, tenant] of [['userA', fx.tenantA], ['userB', fx.tenantB]]) {
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
      { tenant_id: fx.tenantA.id, name: `W182 ride A ${RUN}`, type: 'route', start_coords: '(45.50,-73.60)', qr_code: `${RUN}-qr-a`, created_by: fx.userA.id },
      { tenant_id: fx.tenantB.id, name: `W182 ride B ${RUN}`, type: 'route', start_coords: '(45.51,-73.61)', qr_code: `${RUN}-qr-b`, created_by: fx.userB.id },
    ])
    .select('id, tenant_id');
  assert.ifError(rErr);
  fx.rideA = rides.find((r) => r.tenant_id === fx.tenantA.id);
  fx.rideB = rides.find((r) => r.tenant_id === fx.tenantB.id);

  const { error: pErr } = await admin
    .from('ride_participants')
    .insert({ ride_id: fx.rideA.id, account_id: fx.userA.id, role: 'member', status: 'rsvpd' });
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
    for (const u of [fx.userA, fx.userB]) {
      if (!u) continue;
      await u.client?.auth.signOut();
      u.client?.realtime.disconnect();
    }
    if (fx.rail3SchemaPresent) {
      await admin.from('rider_states').delete().in('tenant_id', [fx.tenantA.id, fx.tenantB.id]);
      await admin.from('beacon_alerts').delete().in('tenant_id', [fx.tenantA.id, fx.tenantB.id]);
    }
    await admin.from('ride_participants').delete().eq('ride_id', fx.rideA?.id ?? '');
    await admin.from('rides').delete().in('id', [fx.rideA?.id, fx.rideB?.id].filter(Boolean));
    for (const u of [fx.userA, fx.userB]) {
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
  const ch = fx.userB.client.channel(topic, { config: { private: true, broadcast: { self: true } } });
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
