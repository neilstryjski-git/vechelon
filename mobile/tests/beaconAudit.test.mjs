// W173 — DB-backed audit-trail tests for beacon_alerts (R3-19/20/21 + SD-011),
// run against the LOCAL Supabase stack in rail3-ci (same env contract and
// local-only guard as rlsIsolation.test.mjs; skips when the held Rail 3 schema
// is absent, hard-fails under EXPECT_RAIL3).
//
// These exercise the REAL policies and grants as signed-in users:
//   - rider trigger INSERTs the lat/long/triggered_at snapshot (R3-19)
//   - self-cancel UPDATEs beacon_cancelled_by = rider's OWN uuid (R3-21)
//   - captain cancel UPDATEs beacon_cancelled_by = captain's uuid (R3-20)
//   - a cancelled row is never re-cancelled (the .is(cancelled_at, null) guard)

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';

const SUPA_URL = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321';
const ANON_KEY = process.env.SUPABASE_ANON_KEY;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!['127.0.0.1', 'localhost', '::1', '[::1]'].includes(new URL(SUPA_URL).hostname)) {
  console.error(`Refusing to run: SUPABASE_URL is not a local address (${SUPA_URL}).`);
  process.exit(1);
}
if (!ANON_KEY || !SERVICE_KEY) {
  console.error('Missing SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY — see tests/rlsIsolation.test.mjs.');
  process.exit(1);
}

const admin = createClient(SUPA_URL, SERVICE_KEY, { auth: { persistSession: false } });
const RUN = `w173-${Date.now()}`;

const fx = { schema: false, tenant: null, rider: null, captain: null, ride: null, firstBeaconId: null };

async function signedIn(email, password) {
  const c = createClient(SUPA_URL, ANON_KEY, { auth: { persistSession: false } });
  const { error } = await c.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`sign-in failed for ${email}: ${error.message}`);
  return c;
}

before(async () => {
  {
    const { error } = await admin.from('beacon_alerts').select('id').limit(1);
    fx.schema = !error;
    if (error && process.env.EXPECT_RAIL3) {
      console.error(`EXPECT_RAIL3 set but beacon_alerts probe failed: ${error.code ?? error.message}`);
      process.exit(1);
    }
    if (!fx.schema) return;
  }

  const { data: tenant, error: tErr } = await admin
    .from('tenants')
    .insert({ name: `W173 ${RUN}`, slug: RUN, primary_color: '#111111', accent_color: '#222222' })
    .select('id')
    .single();
  assert.ifError(tErr);
  fx.tenant = tenant;

  const password = `Pw-${RUN}-secret`;
  for (const [key, role] of [['rider', 'member'], ['captain', 'member']]) {
    const email = `${RUN}-${key}@test.local`;
    const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    assert.ifError(error);
    const id = data.user.id;
    assert.ifError((await admin.from('accounts').upsert({ id, email, phone: '000' })).error);
    assert.ifError(
      (await admin.from('account_tenants').insert({ account_id: id, tenant_id: tenant.id, role, status: 'affiliated' })).error,
    );
    fx[key] = { id, client: await signedIn(email, password) };
  }

  const { data: ride, error: rErr } = await admin
    .from('rides')
    .insert({ tenant_id: tenant.id, name: `W173 ride ${RUN}`, type: 'route', start_coords: '(-79.38,43.65)', qr_code: `${RUN}-qr`, created_by: fx.rider.id })
    .select('id')
    .single();
  assert.ifError(rErr);
  fx.ride = ride;

  // ride_participants roles: rider is a member participant, captain is captain.
  assert.ifError(
    (await admin.from('ride_participants').insert([
      { ride_id: ride.id, account_id: fx.rider.id, role: 'member', status: 'rsvpd' },
      { ride_id: ride.id, account_id: fx.captain.id, role: 'captain', status: 'rsvpd' },
    ])).error,
  );
});

after(async () => {
  try {
    if (!fx.tenant) return;
    await admin.from('beacon_alerts').delete().eq('tenant_id', fx.tenant.id);
    await admin.from('ride_participants').delete().eq('ride_id', fx.ride?.id ?? '');
    await admin.from('rides').delete().eq('tenant_id', fx.tenant.id);
    for (const u of [fx.rider, fx.captain]) {
      if (!u) continue;
      await u.client?.auth.signOut();
      await admin.from('account_tenants').delete().eq('account_id', u.id);
      await admin.from('accounts').delete().eq('id', u.id);
      await admin.auth.admin.deleteUser(u.id);
    }
    await admin.from('tenants').delete().eq('id', fx.tenant.id);
  } catch (e) {
    console.warn('teardown (non-fatal):', e.message);
  }
});

test('R3-19: rider trigger inserts the audit snapshot (lat/long/triggered_at, cancel fields null)', async (t) => {
  if (!fx.schema) return t.skip('Rail 3 schema not applied');
  const { data: inserted, error } = await fx.rider.client.from('beacon_alerts').insert({
    tenant_id: fx.tenant.id, ride_id: fx.ride.id, rider_id: fx.rider.id,
    lat: 43.65, long: -79.38, triggered_at: new Date().toISOString(),
  }).select('id').single();
  assert.ifError(error);
  fx.firstBeaconId = inserted.id;

  const { data } = await admin.from('beacon_alerts')
    .select('lat, long, triggered_at, beacon_cancelled_by, beacon_cancelled_at')
    .eq('id', fx.firstBeaconId).single();
  assert.equal(data.lat, 43.65);
  assert.equal(data.long, -79.38);
  assert.ok(data.triggered_at);
  assert.equal(data.beacon_cancelled_by, null); // active beacon — not the SD-011 sentinel
  assert.equal(data.beacon_cancelled_at, null);
});

test('R3-21: self-cancel writes the rider OWN uuid — never null (SD-011)', async (t) => {
  if (!fx.schema) return t.skip('Rail 3 schema not applied');
  const { error } = await fx.rider.client.from('beacon_alerts')
    .update({ beacon_cancelled_by: fx.rider.id, beacon_cancelled_at: new Date().toISOString() })
    .eq('id', fx.firstBeaconId)
    .is('beacon_cancelled_at', null);
  assert.ifError(error);

  const { data } = await admin.from('beacon_alerts')
    .select('beacon_cancelled_by').eq('id', fx.firstBeaconId).single();
  assert.equal(data.beacon_cancelled_by, fx.rider.id, 'audit trail must carry the self-cancelling rider uuid');
});

test('R3-20/R3-22: captain cancel writes the CAPTAIN uuid as actor', async (t) => {
  if (!fx.schema) return t.skip('Rail 3 schema not applied');
  // Fresh beacon by the rider; cancelled by the captain (in-tenant UPDATE is
  // RLS-permitted; role gating is client-side in the PoC per W169 §5 note).
  const { data: beacon, error: insErr } = await admin.from('beacon_alerts').insert({
    tenant_id: fx.tenant.id, ride_id: fx.ride.id, rider_id: fx.rider.id, triggered_at: new Date().toISOString(),
  }).select('id').single();
  assert.ifError(insErr);

  const { error } = await fx.captain.client.from('beacon_alerts')
    .update({ beacon_cancelled_by: fx.captain.id, beacon_cancelled_at: new Date().toISOString() })
    .eq('id', beacon.id)
    .is('beacon_cancelled_at', null);
  assert.ifError(error);

  const { data } = await admin.from('beacon_alerts')
    .select('beacon_cancelled_by').eq('id', beacon.id).single();
  assert.equal(data.beacon_cancelled_by, fx.captain.id, 'actor must be the cancelling captain, not the rider');
});

test('cancelled beacons are not re-cancelled (idempotency guard)', async (t) => {
  if (!fx.schema) return t.skip('Rail 3 schema not applied');
  // The rider's beacon was self-cancelled above; a second cancel matching
  // .is(beacon_cancelled_at, null) must touch zero rows, preserving the
  // original audit actor.
  const { data, error } = await fx.captain.client.from('beacon_alerts')
    .update({ beacon_cancelled_by: fx.captain.id, beacon_cancelled_at: new Date().toISOString() })
    .eq('id', fx.firstBeaconId)
    .is('beacon_cancelled_at', null)
    .select('id');
  assert.ifError(error);
  assert.equal(data.length, 0, 'a settled cancel must not be overwritten');

  const { data: row } = await admin.from('beacon_alerts')
    .select('beacon_cancelled_by').eq('id', fx.firstBeaconId).single();
  assert.equal(row.beacon_cancelled_by, fx.rider.id, 'original self-cancel actor preserved');
});
