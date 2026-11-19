// W309 — denial-suite harness: target resolution, real signed-in users, wire helpers,
// fixtures and cleanup. See README.md in this folder.
//
// Rules for this file:
//   * The service-role client (`admin`) builds and removes fixtures and reads back the truth
//     after an attempt. It is never the actor in a rule: RLS is bypassed for it.
//   * Every actor is a real auth user with a real JWT. Realtime authorization is cached per
//     connection, so every subscription opens a FRESH client (its own socket).
//   * Production is refused outright. Staging is the one hosted target allowed.
//   * Everything the suite creates carries the `w309-` marker and is removed by id; the
//     sweep only ever matches that marker.

import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

export const PROD_REF = 'drktcxggaizkbvqccfhp';
export const STAGING_REF = 'xybgtbybdhxuwqjfcfkc';
export const MARK = 'w309-';
const EMAIL_DOMAIN = 'test.local';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// A rule that is not satisfied (the thing being tested is wrong today).
export class Red extends Error {}
// The suite could not establish what it needed to judge the rule (fixture or control failed).
export class HarnessError extends Error {}

export function rule(cond, msg) {
  if (!cond) throw new Red(msg);
}
export function control(cond, msg) {
  if (!cond) throw new HarnessError(`control failed: ${msg}`);
}

// ── Target ───────────────────────────────────────────────────────────────────
export async function resolveTarget(name) {
  if (name === 'local') {
    const url = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321';
    if (!['127.0.0.1', 'localhost', '::1', '[::1]'].includes(new URL(url).hostname)) {
      throw new Error(`--target local refuses a non-local SUPABASE_URL (${url})`);
    }
    const anon = process.env.SUPABASE_ANON_KEY;
    const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!anon || !service) {
      throw new Error('local target needs SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY (supabase status -o env)');
    }
    return { name, url, anon, service, timeouts: { join: 8000, deliver: 6000, quiet: 1500 } };
  }
  if (name === 'staging') {
    // The project ref is fixed here on purpose: it cannot be pointed anywhere else by env.
    const ref = STAGING_REF;
    if (ref === PROD_REF) throw new Error('refusing production');
    const token =
      process.env.SUPABASE_ACCESS_TOKEN ??
      readFileSync(join(homedir(), '.supabase', 'access-token'), 'utf8').trim();
    const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/api-keys?reveal=true`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error(`could not read staging API keys (HTTP ${res.status})`);
    const keys = await res.json();
    const pick = (n) => keys.find((k) => k.name === n)?.api_key;
    const anon = pick('anon');
    const service = pick('service_role');
    if (!anon || !service) throw new Error('staging anon / service_role keys not returned');
    // Keys live in memory for this process only; nothing is written to disk.
    return {
      name,
      url: `https://${ref}.supabase.co`,
      anon,
      service,
      timeouts: { join: 12000, deliver: 9000, quiet: 2500 },
    };
  }
  throw new Error(`unknown target "${name}" (local | staging)`);
}

export function makeAdmin(target) {
  if (target.url.includes(PROD_REF)) throw new Error('refusing production');
  return createClient(target.url, target.service, { auth: { persistSession: false, autoRefreshToken: false } });
}

// ── Clients ──────────────────────────────────────────────────────────────────
// A fresh client (own socket). `user` null = an unauthenticated visitor on the anon key.
export function freshClient(target, user) {
  const opts = { auth: { persistSession: false, autoRefreshToken: false } };
  if (user) opts.accessToken = async () => user.token;
  return createClient(target.url, target.anon, opts);
}

function ok(res, label) {
  if (res.error) throw new HarnessError(`${label}: ${res.error.message ?? JSON.stringify(res.error)}`);
  return res.data;
}

export const needle = () => `w309n${randomBytes(6).toString('hex')}`;

// ── Wire ─────────────────────────────────────────────────────────────────────
// Open a fresh connection as `user` and try to join each topic. Collects every broadcast.
export async function listen(ctx, user, topics, { priv = true } = {}) {
  const client = freshClient(ctx.target, user);
  // Authenticate the socket explicitly as this user before any join (the proven pattern in
  // tests/rlsIsolation.test.mjs); a private channel joined as anon is refused for everyone.
  if (user) await client.realtime.setAuth(user.token);
  const msgs = [];
  const statuses = {};
  const reasons = {};
  const channels = {};
  await Promise.all(
    topics.map(
      (topic) =>
        new Promise((resolve) => {
          const ch = client.channel(topic, { config: { private: priv, broadcast: { self: false, ack: false } } });
          channels[topic] = ch;
          ch.on('broadcast', { event: '*' }, (m) => msgs.push({ topic, event: m.event, payload: m.payload }));
          const timer = setTimeout(() => {
            statuses[topic] ??= 'TIMED_OUT';
            resolve();
          }, ctx.target.timeouts.join);
          ch.subscribe((status, err) => {
            if (statuses[topic]) return;
            if (err?.message) reasons[topic] = err.message;
            if (status === 'SUBSCRIBED' || status === 'CHANNEL_ERROR' || status === 'CLOSED') {
              statuses[topic] = status;
              clearTimeout(timer);
              resolve();
            }
          });
        }),
    ),
  );
  const joined = topics.filter((t) => statuses[t] === 'SUBSCRIBED');
  // A join that failed because Realtime could not be reached is not a refusal. It makes the
  // case an error, never a pass or a finding.
  const transport = topics.filter((t) => /transport|unavailable|unreachable|websocket/i.test(reasons[t] ?? ''));
  if (transport.length) {
    try {
      await client.removeAllChannels();
      client.realtime.disconnect();
    } catch { /* nothing to close */ }
    throw new HarnessError(`Realtime could not be reached (${reasons[transport[0]]})`);
  }
  const l = {
    msgs,
    statuses,
    joined,
    // Why a join did not succeed, for the report (status plus the server's reason if any).
    why: () => topics.map((t) => `${statuses[t]}${reasons[t] ? ` (${reasons[t]})` : ''}`).join(', '),
    saw: (n) => JSON.stringify(msgs).includes(n),
    // Send over this socket (only meaningful on a joined topic).
    sendSocket: async (topic, event, payload) => {
      try {
        return await channels[topic].send({ type: 'broadcast', event, payload });
      } catch {
        return 'error';
      }
    },
    close: async () => {
      try {
        await client.removeAllChannels();
        client.realtime.disconnect();
      } catch {
        /* closing a denied channel can throw; nothing to do */
      }
    },
  };
  ctx.open.add(l);
  return l;
}

// Send the way the app's background engine does: REST broadcast with the user's own JWT
// (mobile/src/lib/backgroundLocation.ts). Returns the HTTP status per topic.
export async function restSend(ctx, user, topics, event, payload, { priv = true } = {}) {
  const out = [];
  for (const topic of topics) {
    const res = await fetch(`${ctx.target.url}/realtime/v1/api/broadcast`, {
      method: 'POST',
      headers: {
        apikey: ctx.target.anon,
        Authorization: `Bearer ${user ? user.token : ctx.target.anon}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ messages: [{ topic, event, private: priv, payload }] }),
    });
    out.push(res.status);
  }
  return out;
}

// True when every REST broadcast was accepted by the server.
export const accepted = (statuses) => statuses.length > 0 && statuses.every((c) => c >= 200 && c < 300);

// Try to join `topics` as `user` and report the listener, having first shown in the same
// case that Realtime is up (a permitted user joins) and that every refusal is a real refusal:
// a join that merely timed out is not evidence of a denial.
export async function joinAttempt(ctx, user, topics, permitted, permittedTopics) {
  const c = await listen(ctx, permitted, permittedTopics);
  control(c.joined.length === permittedTopics.length, `a permitted user could not join: ${c.why()}`);
  const l = await listen(ctx, user, topics);
  const timedOut = topics.filter((t) => l.statuses[t] === 'TIMED_OUT');
  control(timedOut.length === 0, `a join was neither accepted nor refused (timed out): ${timedOut.join(', ')}`);
  return l;
}

// Realtime restarts after a database reset and can take a while to answer. Wait until a
// permitted user can join their ride's channel and a message sent to it arrives.
export async function waitForRealtime(ctx, ms = 120000) {
  const { users: u, rides } = ctx.fx;
  const topic = `rail3:ride:${rides.main.id}`;
  const end = Date.now() + ms;
  let last = 'not tried';
  while (Date.now() < end) {
    try {
      const l = await listen(ctx, u.captain, [topic]);
      if (l.joined.length) {
        const n = needle();
        const sent = await restSend(ctx, u.captain, [topic], 'w309-ready', { marker: n });
        // self:false, so the captain's own send does not echo; a second listener receives it.
        const l2 = await listen(ctx, u.coCaptain, [topic]);
        const n2 = needle();
        await restSend(ctx, u.captain, [topic], 'w309-ready', { marker: n2 });
        const got = accepted(sent) && (await arrives(ctx, l2, n2, 4000));
        await closeAll(ctx);
        if (got) return;
        last = `joined, but a message did not arrive (HTTP ${sent.join(', ')})`;
      } else {
        last = l.why();
        await closeAll(ctx);
      }
    } catch (e) {
      last = e.message;
      await closeAll(ctx);
    }
    await sleep(3000);
  }
  throw new HarnessError(`Realtime did not become ready in ${ms / 1000}s: ${last}`);
}

// Wait until `listener` has a message containing `n`, or time out.
export async function arrives(ctx, listener, n, ms = ctx.target.timeouts.deliver) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (listener.saw(n)) return true;
    await sleep(100);
  }
  return listener.saw(n);
}

// After a control listener has the message, give a denied listener the same chance.
export const quiet = (ctx) => sleep(ctx.target.timeouts.quiet);

export async function closeAll(ctx) {
  for (const l of [...ctx.open]) await l.close();
  ctx.open.clear();
}

// A position payload shaped like the app's (useFleetPositions PositionPayload), plus a
// unique marker so a delivery can be traced to one send.
export function posPayload(user, n) {
  return { riderId: user.id, state: 'active', lat: 43.6532, lng: -79.3832, ts: Date.now(), marker: n };
}
export function beaconPayload(user, active, beaconId, n) {
  return { riderId: user.id, active, beaconId, sentAt: Date.now(), marker: n };
}

// ── Fixtures ─────────────────────────────────────────────────────────────────
const USERS = [
  // key, club, club role
  ['riderA', 'x', 'member'],
  ['riderB', 'x', 'member'],
  ['offRide', 'x', 'member'], // affiliated member, no participant row
  ['departed', 'x', 'member'], // opened the ride, then left it
  ['neverOpened', 'x', 'member'], // participant row, never opened the ride in the app
  ['captain', 'x', 'member'],
  ['coCaptain', 'x', 'member'],
  ['sag', 'x', 'member'],
  ['clubAdmin', 'x', 'admin'], // club admin, not a participant
  ['actor', 'x', 'member'], // cancels beacons, then deletes their account (T13)
  ['otherAdmin', 'y', 'admin'], // admin of another club
  ['otherMember', 'y', 'member'],
];

async function signIn(target, admin, email) {
  const link = ok(await admin.auth.admin.generateLink({ type: 'magiclink', email }), `generateLink ${email}`);
  const c = createClient(target.url, target.anon, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await c.auth.verifyOtp({ token_hash: link.properties.hashed_token, type: 'magiclink' });
  if (error) throw new HarnessError(`sign-in ${email}: ${error.message}`);
  return data.session.access_token;
}

export async function buildFixtures(ctx) {
  const { admin, target, run } = ctx;
  const fx = { run, users: {}, tenants: {}, rides: {} };
  ctx.fx = fx;

  const tenants = ok(
    await admin
      .from('tenants')
      .insert([
        { name: `W309 TEST ${run} X`, slug: `${run}-x`, primary_color: '#111111', accent_color: '#222222' },
        { name: `W309 TEST ${run} Y`, slug: `${run}-y`, primary_color: '#333333', accent_color: '#444444' },
      ])
      .select('id, slug'),
    'tenants',
  );
  fx.tenants.x = tenants.find((t) => t.slug.endsWith('-x'));
  fx.tenants.y = tenants.find((t) => t.slug.endsWith('-y'));

  let i = 0;
  for (const [key, club, role] of USERS) {
    i += 1;
    const email = `${run}-${key.toLowerCase()}@${EMAIL_DOMAIN}`;
    const created = ok(await admin.auth.admin.createUser({ email, email_confirm: true }), `createUser ${key}`);
    const id = created.user.id;
    const phoneIn = `+1416555${String(1000 + i)}`;
    ok(await admin.from('accounts').upsert({ id, email, name: `W309 ${key}`, phone: phoneIn }), `account ${key}`);
    ok(
      await admin
        .from('account_tenants')
        .insert({ account_id: id, tenant_id: fx.tenants[club].id, role, status: 'affiliated' }),
      `membership ${key}`,
    );
    // Read the phone back: a normalisation trigger may have rewritten it.
    const acct = ok(await admin.from('accounts').select('name, phone').eq('id', id).single(), `account read ${key}`);
    fx.users[key] = { key, id, email, name: acct.name, phone: acct.phone, club, token: await signIn(target, admin, email) };
  }
  const u = fx.users;

  const rideRow = (club, label, creator) => ({
    tenant_id: fx.tenants[club].id,
    name: `W309 TEST ${run} ${label}`,
    type: 'adhoc',
    status: 'active',
    start_coords: '(43.65,-79.38)',
    qr_code: `${run}-qr-${label}`,
    created_by: creator.id,
  });
  const rides = ok(
    await admin
      .from('rides')
      .insert([rideRow('x', 'main', u.captain), rideRow('x', 'ending', u.captain), rideRow('y', 'other', u.otherAdmin)])
      .select('id, name'),
    'rides',
  );
  fx.rides.main = rides.find((r) => r.name.endsWith('main'));
  fx.rides.ending = rides.find((r) => r.name.endsWith('ending'));
  fx.rides.other = rides.find((r) => r.name.endsWith('other'));

  // Participant rows as the app writes them at join (mobile/src/lib/rideJoin.ts): name, email
  // and phone on the row, and the first-open mark. "On the ride" = rail3_joined_at set and
  // departed_at null (Pillar II §2).
  const now = new Date().toISOString();
  const part = (ride, user, role, extra = {}) => ({
    ride_id: ride.id,
    account_id: user.id,
    role,
    status: 'active',
    display_name: user.name,
    email: user.email,
    phone: user.phone,
    rail3_joined_at: now,
    ...extra,
  });
  ok(
    await admin.from('ride_participants').insert([
      part(fx.rides.main, u.captain, 'captain'),
      part(fx.rides.main, u.coCaptain, 'captain'),
      part(fx.rides.main, u.sag, 'support'),
      part(fx.rides.main, u.actor, 'support'),
      part(fx.rides.main, u.riderA, 'member', { last_lat: POS.lat, last_long: POS.lng, last_ping: now }),
      part(fx.rides.main, u.riderB, 'member'),
      part(fx.rides.main, u.departed, 'member', { departed_at: now }),
      part(fx.rides.main, u.neverOpened, 'member', { rail3_joined_at: null, status: 'rsvpd' }),
      // A guest: no account, no app. On the roster only (Pillar II §4.1 ROSTER).
      {
        ride_id: fx.rides.main.id, account_id: null, role: 'guest', status: 'rsvpd',
        display_name: GUEST.name, email: `${run}-guest@${EMAIL_DOMAIN}`, phone: GUEST.phone,
      },
      part(fx.rides.ending, u.captain, 'captain'),
      part(fx.rides.ending, u.riderA, 'member'),
      part(fx.rides.ending, u.riderB, 'member'),
      part(fx.rides.other, u.otherAdmin, 'captain'),
      part(fx.rides.other, u.otherMember, 'member'),
    ]),
    'participants',
  );
  return fx;
}

export const GUEST = { name: 'W309 guest', phone: '+14165559999' };

// Rider A's stored last position. Distinctive values so a leak is unmistakable in any JSON.
export const POS = { lat: 43.7001309, lng: -79.4163309 };

// ── Fixture helpers used inside rules (service role: setup and truth only) ───
export async function adminBeacon(ctx, ride, rider, fields = {}) {
  const row = ok(
    await ctx.admin
      .from('beacon_alerts')
      .insert({ tenant_id: ctx.fx.tenants[rider.club].id, ride_id: ride.id, rider_id: rider.id, lat: 43.66, long: -79.39, ...fields })
      .select('*')
      .single(),
    'beacon fixture',
  );
  return row;
}
export async function beaconTruth(ctx, id) {
  const { data } = await ctx.admin.from('beacon_alerts').select('*').eq('id', id).maybeSingle();
  return data;
}
export async function clearBeacons(ctx, ride) {
  await ctx.admin.from('beacon_alerts').delete().eq('ride_id', ride.id);
  await ctx.admin.from('ride_participants').update({ beacon_active: false }).eq('ride_id', ride.id).eq('beacon_active', true);
}
export async function setBeaconFlag(ctx, ride, rider, on) {
  ok(
    await ctx.admin.from('ride_participants').update({ beacon_active: on }).eq('ride_id', ride.id).eq('account_id', rider.id),
    'beacon flag',
  );
}

// ── Cleanup ──────────────────────────────────────────────────────────────────
// Removes everything carrying the marker: this run's rows, and any left by a crashed run.
// It selects by marker first and deletes by the ids it found; it never deletes by a broad
// predicate.
export async function sweep(admin, log = () => {}) {
  // A failed read here must never look like "nothing to remove".
  const tenants = ok(await admin.from('tenants').select('id, slug').like('slug', `${MARK}%`), 'sweep: read test clubs');
  const tIds = tenants.map((t) => t.id);
  const accounts = ok(
    await admin.from('accounts').select('id, email').like('email', `${MARK}%@${EMAIL_DOMAIN}`),
    'sweep: read test accounts',
  );
  const aIds = new Set(accounts.map((a) => a.id));

  for (const usr of await markedAuthUsers(admin)) aIds.add(usr.id);

  if (tIds.length) {
    const rides = ok(await admin.from('rides').select('id').in('tenant_id', tIds), 'sweep: read test rides');
    const rIds = rides.map((r) => r.id);
    const del = async (table, col, ids) => {
      if (!ids.length) return;
      const { error } = await admin.from(table).delete().in(col, ids);
      // Tables that are absent on a target (or already empty) are not a failure.
      if (error && !['42P01', 'PGRST205'].includes(error.code)) log(`sweep ${table}: ${error.message}`);
    };
    await del('beacon_alerts', 'tenant_id', tIds);
    await del('rider_states', 'tenant_id', tIds);
    await del('rail3_telemetry_events', 'tenant_id', tIds);
    await del('rail3_breadcrumb', 'ride_id', rIds);
    await del('analytics_events', 'tenant_id', tIds);
    await del('ride_participants', 'ride_id', rIds);
    await del('rides', 'id', rIds);
    await del('account_tenants', 'tenant_id', tIds);
  }
  for (const id of aIds) {
    await admin.from('account_tenants').delete().eq('account_id', id);
    await admin.from('accounts').delete().eq('id', id);
    await admin.auth.admin.deleteUser(id);
  }
  if (tIds.length) {
    const { error } = await admin.from('tenants').delete().in('id', tIds);
    if (error) log(`sweep tenants: ${error.message}`);
  }
  return leftovers(admin);
}

// Auth users carrying the marker. Throws if the list cannot be read.
async function markedAuthUsers(admin) {
  const out = [];
  for (let page = 1; page < 50; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new HarnessError(`could not list auth users: ${error.message}`);
    const users = data?.users ?? [];
    out.push(...users.filter((usr) => usr.email?.startsWith(MARK) && usr.email.endsWith(`@${EMAIL_DOMAIN}`)));
    if (users.length < 200) break;
  }
  return out;
}

// What still carries the marker. All zeros = clean. Throws if any count cannot be read:
// an unreadable count is never reported as zero.
export async function leftovers(admin) {
  const count = async (q) => {
    const { count: n, error } = await q;
    if (error || n == null) throw new HarnessError(`could not count leftovers: ${error?.message ?? 'no count returned'}`);
    return n;
  };
  const out = {
    tenants: await count(admin.from('tenants').select('id', { count: 'exact', head: true }).like('slug', `${MARK}%`)),
    accounts: await count(
      admin.from('accounts').select('id', { count: 'exact', head: true }).like('email', `${MARK}%@${EMAIL_DOMAIN}`),
    ),
    rides: await count(admin.from('rides').select('id', { count: 'exact', head: true }).like('name', 'W309 TEST %')),
    participants: await count(
      admin.from('ride_participants').select('id', { count: 'exact', head: true }).like('email', `${MARK}%@${EMAIL_DOMAIN}`),
    ),
    auth_users: (await markedAuthUsers(admin)).length,
  };
  return out;
}
