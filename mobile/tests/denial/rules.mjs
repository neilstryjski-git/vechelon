// W309 — the denial rules T1 to T16 (Sprint 2 brief §4; Pillar II §2, §3 Feature 2, §4.1;
// Ledger SD-011, §16.1; Pillar III R3-78, DoD-12, V-012).
//
// The array order is the run order: T14 ends a ride that T4.4 then builds on, and T13
// deletes a fixture account.
//
// Each case acts as a real signed-in user. A case ends one of three ways:
//   green — the rule holds
//   red   — the rule does not hold (rule(...) threw)
//   error — the suite could not judge it (a fixture or a control failed)
// A denial is only believed when its control passes in the same case: the same message
// reaches someone who is allowed it, or the same write succeeds for someone who is allowed.
//
// "On the ride" = participant with rail3_joined_at set and departed_at null.
// "Off the ride" = affiliated member of the same club with no participant row.

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  rule, control, needle, listen, joinAttempt, restSend, accepted, arrives, quiet, freshClient, posPayload,
  beaconPayload, adminBeacon, beaconTruth, clearBeacons, setBeaconFlag, POS, GUEST,
} from './harness.mjs';
import {
  EVENTS, receiveTopics, sendTopics, allTopics, publicWebTopic, PUBLIC_WEB_POSITION_EVENT,
  riderRoster, leaderRoster,
} from './layout.mjs';

// Source the product ships: web, mobile, the edge Worker and the edge functions.
const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const SOURCE_DIRS = ['admin/src', 'mobile/src', 'worker', 'supabase/functions'];
function sourceFiles(dir) {
  if (!existsSync(dir)) return [];
  const out = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...sourceFiles(p));
    else if (/\.(ts|tsx|js|jsx|mjs)$/.test(e.name) && !/\.test\./.test(e.name)) out.push(p);
  }
  return out;
}

const db = (ctx, user) => freshClient(ctx.target, user);
const leaks = (data, ...values) => {
  const s = JSON.stringify(data ?? null);
  return values.filter((v) => v != null && s.includes(String(v)));
};
const iso = () => new Date().toISOString();
// Rows a user can read. A permission refusal is an empty answer; any other failure (network,
// 5xx, a mistyped name) is an error in the suite and never counts as a denial.
const read = async (q) => {
  const { data, error } = await q;
  control(!error || error.code === '42501', `a read failed for a reason other than permission: ${error?.code} ${error?.message}`);
  return data ?? [];
};
// A permitted joiner for a ride, used to show Realtime is answering before a refusal is believed.
const permitted = (ctx, ride) =>
  ride.id === ctx.fx.rides.other.id
    ? [ctx.fx.users.otherAdmin, receiveTopics('captain', ride.id)]
    : [ctx.fx.users.captain, receiveTopics('captain', ride.id)];
const refused = (ctx, user, ride) => joinAttempt(ctx, user, allTopics(ride.id), ...permitted(ctx, ride));

// Send `payload` as `sender` and confirm `allowed` receives it; then report which of
// `denied` also received it. The control makes a silent, undelivered send impossible to
// mistake for a denial.
async function deliver(ctx, { sender, topics, event, payload, n, allowed, denied }) {
  for (const l of denied) {
    control(l.unclear().length === 0, `a listener's join was neither accepted nor refused by policy (${l.why()}), so its silence proves nothing`);
  }
  const sent = await restSend(ctx, sender, topics, event, payload);
  control(accepted(sent), `the server did not accept the send (HTTP ${sent.join(', ')})`);
  control(await arrives(ctx, allowed, n), `the message never reached a listener who is allowed it (${event})`);
  await quiet(ctx);
  return denied.filter((l) => l.saw(n));
}

export const cases = [
  // ── T1 ─────────────────────────────────────────────────────────────────────
  {
    id: 'T1.1', rule: 'T1',
    title: 'A member off the ride cannot subscribe to any channel of that ride',
    run: async (ctx) => {
      const { users: u, rides } = ctx.fx;
      const l = await refused(ctx, u.offRide, rides.main);
      rule(l.joined.length === 0, `off-ride member joined: ${l.joined.join(', ')}`);
    },
  },
  {
    id: 'T1.2', rule: 'T1',
    title: 'Nobody off the ride can send on any channel of that ride (REST and socket)',
    run: async (ctx) => {
      const { users: u, rides } = ctx.fx;
      const topics = allTopics(rides.main.id);
      const cap = await listen(ctx, u.captain, [...new Set([...receiveTopics('captain', rides.main.id), ...topics])]);
      control(cap.joined.length > 0, `captain could not join: ${cap.why()}`);
      // Control: a rider on the ride reaches the captain.
      const c = needle();
      await restSend(ctx, u.riderA, sendTopics('rider', EVENTS.pos, rides.main.id), EVENTS.pos, posPayload(u.riderA, c));
      control(await arrives(ctx, cap, c), 'an on-ride position never reached the captain');
      // Attempt: an off-ride member, a rider who left, and a participant who never opened
      // the ride, each by REST and over a socket.
      const sent = [];
      for (const who of [u.offRide, u.departed, u.neverOpened]) {
        const n1 = needle();
        await restSend(ctx, who, topics, EVENTS.pos, posPayload(who, n1));
        const n2 = needle();
        const l = await listen(ctx, who, topics);
        for (const t of l.joined) await l.sendSocket(t, EVENTS.pos, posPayload(who, n2));
        sent.push([who, n1, n2]);
      }
      // The captain's connection is still live: a second on-ride position arrives.
      const c2 = needle();
      await restSend(ctx, u.riderA, sendTopics('rider', EVENTS.pos, rides.main.id), EVENTS.pos, posPayload(u.riderA, c2));
      control(await arrives(ctx, cap, c2), 'the captain\'s connection went quiet during the case');
      await quiet(ctx);
      const got = [];
      for (const [who, n1, n2] of sent) {
        if (cap.saw(n1)) got.push(`${who.key} by REST`);
        if (cap.saw(n2)) got.push(`${who.key} by socket`);
      }
      rule(got.length === 0, `a broadcast from someone off the ride was delivered: ${got.join(', ')}`);
    },
  },
  {
    id: 'T1.3', rule: 'T1',
    title: 'A rider who has left the ride cannot subscribe to any channel of that ride',
    run: async (ctx) => {
      const { users: u, rides } = ctx.fx;
      const l = await refused(ctx, u.departed, rides.main);
      rule(l.joined.length === 0, `departed rider joined: ${l.joined.join(', ')}`);
    },
  },

  // ── T2 ─────────────────────────────────────────────────────────────────────
  {
    id: 'T2.1', rule: 'T2',
    title: 'A rider on the ride receives no other rider\'s position over the wire',
    run: async (ctx) => {
      const { users: u, rides } = ctx.fx;
      const id = rides.main.id;
      const cap = await listen(ctx, u.captain, receiveTopics('captain', id));
      const rb = await listen(ctx, u.riderB, receiveTopics('rider', id));
      control(rb.joined.length > 0, `rider B (on the ride) could not join the rider channels: ${rb.why()}`);
      const n = needle();
      const got = await deliver(ctx, {
        sender: u.riderA, topics: sendTopics('rider', EVENTS.pos, id), event: EVENTS.pos,
        payload: posPayload(u.riderA, n), n, allowed: cap, denied: [rb],
      });
      rule(got.length === 0, 'rider B\'s socket received rider A\'s position');
    },
  },
  {
    id: 'T2.2', rule: 'T2',
    title: 'A rider cannot get other riders\' positions by joining a channel meant for another role',
    run: async (ctx) => {
      const { users: u, rides } = ctx.fx;
      const id = rides.main.id;
      const cap = await listen(ctx, u.captain, receiveTopics('captain', id));
      const rb = await listen(ctx, u.riderB, allTopics(id));
      const n = needle();
      const got = await deliver(ctx, {
        sender: u.riderA, topics: sendTopics('rider', EVENTS.pos, id), event: EVENTS.pos,
        payload: posPayload(u.riderA, n), n, allowed: cap, denied: [rb],
      });
      rule(got.length === 0, `rider B received rider A's position after joining: ${rb.joined.join(', ')}`);
    },
  },

  // ── T3 ─────────────────────────────────────────────────────────────────────
  {
    id: 'T3.1', rule: 'T3',
    title: 'A rider on the ride receives the Captain\'s position',
    run: async (ctx) => {
      const { users: u, rides } = ctx.fx;
      const id = rides.main.id;
      const rb = await listen(ctx, u.riderB, receiveTopics('rider', id));
      rule(rb.joined.length > 0, `rider B could not join the rider channels: ${rb.why()}`);
      const n = needle();
      const sent = await restSend(ctx, u.captain, sendTopics('captain', EVENTS.pos, id), EVENTS.pos, posPayload(u.captain, n));
      rule(accepted(sent), `the Captain's position was not accepted by the server (HTTP ${sent.join(', ')})`);
      rule(await arrives(ctx, rb, n), 'rider B did not receive the Captain\'s position');
    },
  },
  {
    id: 'T3.2', rule: 'T3',
    title: 'A rider on the ride receives the SAG\'s position',
    run: async (ctx) => {
      const { users: u, rides } = ctx.fx;
      const id = rides.main.id;
      const rb = await listen(ctx, u.riderB, receiveTopics('rider', id));
      rule(rb.joined.length > 0, `rider B could not join the rider channels: ${rb.why()}`);
      const n = needle();
      const sent = await restSend(ctx, u.sag, sendTopics('sag', EVENTS.pos, id), EVENTS.pos, posPayload(u.sag, n));
      rule(accepted(sent), `the SAG's position was not accepted by the server (HTTP ${sent.join(', ')})`);
      rule(await arrives(ctx, rb, n), 'rider B did not receive the SAG\'s position');
    },
  },

  // ── T4 ─────────────────────────────────────────────────────────────────────
  {
    id: 'T4.1', rule: 'T4',
    title: 'A rider on the ride receives beacon state for another rider on that ride',
    run: async (ctx) => {
      const { users: u, rides } = ctx.fx;
      const id = rides.main.id;
      try {
        const b = await adminBeacon(ctx, rides.main, u.riderA);
        await setBeaconFlag(ctx, rides.main, u.riderA, true);
        const rb = await listen(ctx, u.riderB, receiveTopics('rider', id));
        rule(rb.joined.length > 0, `rider B could not join the rider channels: ${rb.why()}`);
        const n = needle();
        await restSend(ctx, u.riderA, sendTopics('rider', EVENTS.beacon, id, { beaconActive: true }), EVENTS.beacon,
          beaconPayload(u.riderA, true, b.id, n));
        rule(await arrives(ctx, rb, n), 'rider B did not receive rider A\'s beacon event');
      } finally {
        await clearBeacons(ctx, rides.main);
      }
    },
  },
  {
    id: 'T4.2', rule: 'T4',
    title: 'While a rider\'s beacon is active, riders on the ride receive that rider\'s live position',
    run: async (ctx) => {
      const { users: u, rides } = ctx.fx;
      const id = rides.main.id;
      try {
        await adminBeacon(ctx, rides.main, u.riderA);
        await setBeaconFlag(ctx, rides.main, u.riderA, true);
        const rb = await listen(ctx, u.riderB, receiveTopics('rider', id));
        const n = needle();
        await restSend(ctx, u.riderA, sendTopics('rider', EVENTS.pos, id, { beaconActive: true }), EVENTS.pos, posPayload(u.riderA, n));
        rule(await arrives(ctx, rb, n), 'rider B did not receive the beaconing rider\'s position');
      } finally {
        await clearBeacons(ctx, rides.main);
      }
    },
  },
  {
    id: 'T4.3', rule: 'T4',
    title: 'After the beacon is cancelled, riders stop receiving that rider\'s position',
    run: async (ctx) => {
      const { users: u, rides } = ctx.fx;
      const id = rides.main.id;
      const both = [...new Set([
        ...sendTopics('rider', EVENTS.pos, id, { beaconActive: false }),
        ...sendTopics('rider', EVENTS.pos, id, { beaconActive: true }),
      ])];
      try {
        // Rider B is already connected while the beacon is active, and is receiving.
        const b = await adminBeacon(ctx, rides.main, u.riderA);
        await setBeaconFlag(ctx, rides.main, u.riderA, true);
        const cap = await listen(ctx, u.captain, receiveTopics('captain', id));
        const rb = await listen(ctx, u.riderB, receiveTopics('rider', id));
        const n0 = needle();
        await restSend(ctx, u.riderA, sendTopics('rider', EVENTS.pos, id, { beaconActive: true }), EVENTS.pos, posPayload(u.riderA, n0));
        control(await arrives(ctx, rb, n0), 'rider B was not receiving the beaconing rider before the cancel');
        // Rider A cancels their own beacon, as the app does: audit row, flag, then the event.
        const cancel = await db(ctx, u.riderA).from('beacon_alerts')
          .update({ beacon_cancelled_at: iso(), beacon_cancelled_by: u.riderA.id }).eq('id', b.id).is('beacon_cancelled_at', null);
        control(!cancel.error && (await beaconTruth(ctx, b.id))?.beacon_cancelled_at, 'rider A could not cancel their own beacon');
        await setBeaconFlag(ctx, rides.main, u.riderA, false);
        await restSend(ctx, u.riderA, sendTopics('rider', EVENTS.beacon, id, { beaconActive: true }), EVENTS.beacon,
          beaconPayload(u.riderA, false, b.id, needle()));
        // Rider A keeps sending on every path a rider has. Neither the connection that was
        // open during the beacon nor a fresh one may receive it.
        const rb2 = await listen(ctx, u.riderB, receiveTopics('rider', id));
        const n = needle();
        const got = await deliver(ctx, {
          sender: u.riderA, topics: both, event: EVENTS.pos, payload: posPayload(u.riderA, n), n, allowed: cap, denied: [rb, rb2],
        });
        rule(!got.includes(rb), 'rider B\'s open connection still received rider A\'s position after the cancel');
        rule(!got.includes(rb2), 'a fresh rider connection received rider A\'s position after the cancel');
      } finally {
        await clearBeacons(ctx, rides.main);
      }
    },
  },

  // ── T5 ─────────────────────────────────────────────────────────────────────
  {
    id: 'T5.1', rule: 'T5',
    title: 'A rider cannot read another rider\'s phone, last position or last ping from ride_participants',
    run: async (ctx) => {
      const { users: u, rides } = ctx.fx;
      const { data: truth } = await ctx.admin.from('ride_participants').select('phone, last_lat, last_long, last_ping')
        .eq('ride_id', rides.main.id).eq('account_id', u.riderA.id).single();
      control(truth?.phone && truth?.last_lat != null && truth?.last_ping, 'rider A\'s row has no phone / position to protect');
      const data = await read(db(ctx, u.riderB).from('ride_participants').select('*').eq('ride_id', rides.main.id).eq('account_id', u.riderA.id));
      const row = data[0];
      const got = [];
      if (row?.phone) got.push('phone');
      if (row?.last_lat != null || row?.last_long != null) got.push('last position');
      if (row?.last_ping) got.push('last ping');
      rule(got.length === 0, `rider B read rider A's ${got.join(', ')} from ride_participants`);
    },
  },
  {
    id: 'T5.2', rule: 'T5',
    title: 'A rider cannot read another rider\'s phone or position by any other database path',
    run: async (ctx) => {
      const { users: u, rides } = ctx.fx;
      const c = db(ctx, u.riderB);
      const secrets = [u.riderA.phone, POS.lat, POS.lng];
      const found = [];
      const probe = async (label, q) => {
        if (leaks(await read(q), ...secrets).length) found.push(label);
      };
      await probe('accounts', c.from('accounts').select('*').eq('id', u.riderA.id));
      // The embed the old roster screen used. Its policy is gone, so the request itself may
      // be rejected; only a returned phone matters here.
      const embed = await c.from('ride_participants').select('account_id, accounts(name, phone)').eq('ride_id', rides.main.id);
      if (leaks(embed.data, ...secrets).length) found.push('accounts embed');
      await probe('get_ride_roster_contacts', c.rpc('get_ride_roster_contacts', { p_ride_id: rides.main.id }));
      await probe('ride_participants_pa_view', c.from('ride_participants_pa_view').select('*').eq('ride_id', rides.main.id));
      const roster = await riderRoster(c, rides.main.id);
      const a = roster.rows.find((r) => r.account_id === u.riderA.id);
      if (a?.phone || leaks(roster.rows, POS.lat, POS.lng).length) found.push('rider roster path');
      rule(found.length === 0, `rider B read rider A's phone or position through: ${found.join(', ')}`);
    },
  },

  {
    id: 'T5.3', rule: 'T5',
    title: 'Nobody off the ride (off-ride member, departed rider, never-opened participant) can read a rider\'s phone or position',
    run: async (ctx) => {
      const { users: u, rides } = ctx.fx;
      const secrets = [u.riderA.phone, POS.lat, POS.lng];
      const found = [];
      for (const who of [u.offRide, u.departed, u.neverOpened]) {
        const c = db(ctx, who);
        const probes = {
          ride_participants: c.from('ride_participants').select('*').eq('ride_id', rides.main.id),
          accounts: c.from('accounts').select('*').eq('id', u.riderA.id),
          get_ride_roster_contacts: c.rpc('get_ride_roster_contacts', { p_ride_id: rides.main.id }),
          ride_participants_pa_view: c.from('ride_participants_pa_view').select('*').eq('ride_id', rides.main.id),
        };
        for (const [label, q] of Object.entries(probes)) {
          if (leaks(await read(q), ...secrets).length) found.push(`${who.key}: ${label}`);
        }
      }
      rule(found.length === 0, `rider A's phone or position was read by: ${found.join(', ')}`);
    },
  },

  // ── T6 ─────────────────────────────────────────────────────────────────────
  {
    id: 'T6.1', rule: 'T6',
    title: 'A rider can read every roster row\'s name and participation state',
    run: async (ctx) => {
      const { users: u, rides } = ctx.fx;
      const { count } = await ctx.admin.from('ride_participants').select('id', { count: 'exact', head: true }).eq('ride_id', rides.main.id);
      const roster = await riderRoster(db(ctx, u.riderB), rides.main.id);
      rule(!roster.error, `roster read failed: ${roster.error?.message}`);
      rule(roster.rows.length === count, `rider B sees ${roster.rows.length} of ${count} roster rows`);
      const nameless = roster.rows.filter((r) => !r.name);
      rule(nameless.length === 0, `${nameless.length} roster row(s) have no name`);
      const byId = Object.fromEntries(roster.rows.map((r) => [r.account_id, r]));
      rule(byId[u.riderA.id]?.joined === true && byId[u.riderA.id]?.departed === false, 'app-tracked state missing for rider A');
      rule(byId[u.neverOpened.id]?.joined === false, 'roster-only state missing for the rider who never opened the ride');
      rule(byId[u.departed.id]?.departed === true, 'left-ride state missing for the departed rider');
      rule(roster.rows.some((r) => r.account_id == null && r.name === GUEST.name), 'the guest is missing from the rider\'s roster');
    },
  },
  {
    id: 'T6.2', rule: 'T6',
    title: 'A rider can read the leaders\' names and phones',
    run: async (ctx) => {
      const { users: u, rides } = ctx.fx;
      const roster = await riderRoster(db(ctx, u.riderB), rides.main.id);
      rule(!roster.error, `roster read failed: ${roster.error?.message}`);
      const missing = [];
      for (const leader of [u.captain, u.coCaptain, u.sag]) {
        const r = roster.rows.find((x) => x.account_id === leader.id);
        if (!r?.name || r?.phone !== leader.phone) missing.push(leader.key);
      }
      rule(missing.length === 0, `rider B cannot read name and phone for: ${missing.join(', ')}`);
    },
  },

  // ── T7 ─────────────────────────────────────────────────────────────────────
  ...['captain', 'sag'].map((who, i) => ({
    id: `T7.${i + 1}`, rule: 'T7',
    title: `${who === 'captain' ? 'The Captain' : 'The SAG'} reads the full roster with every phone`,
    run: async (ctx) => {
      const { users: u, rides } = ctx.fx;
      const roster = await leaderRoster(db(ctx, u[who]), rides.main.id);
      rule(!roster.error, `leader roster read failed: ${roster.error?.message}`);
      const missing = [];
      for (const p of [u.captain, u.coCaptain, u.sag, u.riderA, u.riderB, u.departed, u.neverOpened]) {
        const r = roster.rows.find((x) => x.account_id === p.id);
        if (!r || r.phone !== p.phone || !r.name) missing.push(p.key);
      }
      const { data: guest } = await ctx.admin.from('ride_participants').select('id, phone')
        .eq('ride_id', rides.main.id).is('account_id', null).single();
      control(guest?.phone, 'the guest fixture has no phone');
      const g = roster.rows.find((x) => x.participant_id === guest.id);
      if (!g?.name || g.phone !== guest.phone) missing.push('guest');
      rule(missing.length === 0, `${who} cannot read name and phone for: ${missing.join(', ')}`);
    },
  })),
  {
    id: 'T7.3', rule: 'T7',
    title: 'Co-Captains read each other\'s phone',
    run: async (ctx) => {
      const { users: u, rides } = ctx.fx;
      const a = await leaderRoster(db(ctx, u.captain), rides.main.id);
      const b = await leaderRoster(db(ctx, u.coCaptain), rides.main.id);
      rule(a.rows.find((x) => x.account_id === u.coCaptain.id)?.phone === u.coCaptain.phone, 'Captain cannot read the co-Captain\'s phone');
      rule(b.rows.find((x) => x.account_id === u.captain.id)?.phone === u.captain.phone, 'co-Captain cannot read the Captain\'s phone');
    },
  },

  // ── T8 ─────────────────────────────────────────────────────────────────────
  {
    id: 'T8.1', rule: 'T8',
    title: 'A club admin who is not a participant can subscribe for Race Control and sees beacons',
    run: async (ctx) => {
      const { users: u, rides } = ctx.fx;
      const id = rides.main.id;
      try {
        const b = await adminBeacon(ctx, rides.main, u.riderA);
        await setBeaconFlag(ctx, rides.main, u.riderA, true);
        const adm = await listen(ctx, u.clubAdmin, receiveTopics('admin', id));
        rule(adm.joined.length > 0, `the club admin could not subscribe: ${adm.why()}`);
        const n = needle();
        await restSend(ctx, u.riderA, sendTopics('rider', EVENTS.beacon, id, { beaconActive: true }), EVENTS.beacon,
          beaconPayload(u.riderA, true, b.id, n));
        rule(await arrives(ctx, adm, n), 'the club admin did not receive the beacon event');
      } finally {
        await clearBeacons(ctx, rides.main);
      }
    },
  },
  {
    id: 'T8.2', rule: 'T8',
    title: 'An admin of another club cannot subscribe to any channel of the ride',
    run: async (ctx) => {
      const { users: u, rides } = ctx.fx;
      const l = await refused(ctx, u.otherAdmin, rides.main);
      rule(l.joined.length === 0, `another club's admin joined: ${l.joined.join(', ')}`);
    },
  },

  // ── T9 ─────────────────────────────────────────────────────────────────────
  {
    id: 'T9.1', rule: 'T9',
    title: 'Beacon rows reach a rider with the app on that ride, and the club\'s admins',
    run: async (ctx) => {
      const { users: u, rides } = ctx.fx;
      try {
        const b = await adminBeacon(ctx, rides.main, u.riderA);
        const r1 = await db(ctx, u.riderB).from('beacon_alerts').select('id').eq('id', b.id);
        const r2 = await db(ctx, u.clubAdmin).from('beacon_alerts').select('id').eq('id', b.id);
        rule(r1.data?.length === 1, 'a rider on the ride cannot read the beacon row');
        rule(r2.data?.length === 1, 'the club admin cannot read the beacon row');
      } finally {
        await clearBeacons(ctx, rides.main);
      }
    },
  },
  {
    id: 'T9.2', rule: 'T9',
    title: 'A member off the ride, and a rider who has left, cannot read the ride\'s beacon rows or beacon flags',
    run: async (ctx) => {
      const { users: u, rides } = ctx.fx;
      try {
        const b = await adminBeacon(ctx, rides.main, u.riderA);
        await setBeaconFlag(ctx, rides.main, u.riderA, true);
        control((await beaconTruth(ctx, b.id)) != null, 'beacon fixture missing');
        const got = [];
        for (const who of [u.offRide, u.departed]) {
          const c = db(ctx, who);
          const rows = await read(c.from('beacon_alerts').select('id').eq('ride_id', rides.main.id));
          const flags = await read(c.from('ride_participants').select('account_id, beacon_active').eq('ride_id', rides.main.id).eq('beacon_active', true));
          if (rows.length) got.push(`${who.key}: beacon rows`);
          if (flags.length) got.push(`${who.key}: which rider has an active beacon`);
        }
        rule(got.length === 0, `read from off the ride: ${got.join(', ')}`);
      } finally {
        await clearBeacons(ctx, rides.main);
      }
    },
  },
  {
    id: 'T9.3', rule: 'T9',
    title: 'A participant who never opened the ride in the app is denied beacons on every path',
    run: async (ctx) => {
      const { users: u, rides } = ctx.fx;
      const id = rides.main.id;
      try {
        await adminBeacon(ctx, rides.main, u.riderA);
        await setBeaconFlag(ctx, rides.main, u.riderA, true);
        const c = db(ctx, u.neverOpened);
        const rows = await read(c.from('beacon_alerts').select('id').eq('ride_id', id));
        const flags = await read(c.from('ride_participants').select('account_id, beacon_active').eq('ride_id', id).eq('beacon_active', true));
        const l = await refused(ctx, u.neverOpened, rides.main);
        const paths = [];
        if (rows.length) paths.push('beacon rows');
        if (flags.length) paths.push('beacon flags');
        if (l.joined.length) paths.push(`channels (${l.joined.join(', ')})`);
        rule(paths.length === 0, `a participant who never opened the ride reached: ${paths.join('; ')}`);
      } finally {
        await clearBeacons(ctx, rides.main);
      }
    },
  },

  // ── T10 ────────────────────────────────────────────────────────────────────
  {
    id: 'T10.1', rule: 'T10',
    title: 'A beacon insert naming a rider other than the caller is rejected',
    run: async (ctx) => {
      const { users: u, rides, tenants } = ctx.fx;
      try {
        const own = await db(ctx, u.riderA).from('beacon_alerts')
          .insert({ tenant_id: tenants.x.id, ride_id: rides.main.id, rider_id: u.riderA.id, lat: 43.66, long: -79.39 }).select('id');
        control(!own.error && own.data?.length === 1, `a rider could not raise their own beacon (${own.error?.message})`);
        await db(ctx, u.riderB).from('beacon_alerts')
          .insert({ tenant_id: tenants.x.id, ride_id: rides.main.id, rider_id: u.captain.id, lat: 1, long: 1 });
        const { data } = await ctx.admin.from('beacon_alerts').select('id').eq('ride_id', rides.main.id).eq('rider_id', u.captain.id);
        rule((data?.length ?? 0) === 0, 'rider B inserted a beacon in the Captain\'s name');
      } finally {
        await clearBeacons(ctx, rides.main);
      }
    },
  },

  // ── T11 ────────────────────────────────────────────────────────────────────
  {
    id: 'T11.0', rule: 'T11',
    title: 'Control: the beacon\'s own rider, the Captain and the SAG can each cancel it',
    run: async (ctx) => {
      const { users: u, rides } = ctx.fx;
      try {
        const failed = [];
        for (const who of [u.riderA, u.captain, u.sag]) {
          const b = await adminBeacon(ctx, rides.main, u.riderA);
          await db(ctx, who).from('beacon_alerts')
            .update({ beacon_cancelled_at: iso(), beacon_cancelled_by: who.id }).eq('id', b.id).is('beacon_cancelled_at', null);
          const t = await beaconTruth(ctx, b.id);
          if (t?.beacon_cancelled_by !== who.id || !t?.beacon_cancelled_at) failed.push(who.key);
        }
        rule(failed.length === 0, `a permitted cancel did not take effect for: ${failed.join(', ')}`);
      } finally {
        await clearBeacons(ctx, rides.main);
      }
    },
  },
  {
    id: 'T11.1', rule: 'T11',
    title: 'A beacon cancel is rejected unless the caller is its own rider or the ride\'s Captain or SAG',
    run: async (ctx) => {
      const { users: u, rides } = ctx.fx;
      try {
        const got = [];
        for (const who of [u.riderB, u.offRide, u.neverOpened, u.clubAdmin]) {
          const b = await adminBeacon(ctx, rides.main, u.riderA);
          await db(ctx, who).from('beacon_alerts')
            .update({ beacon_cancelled_at: iso(), beacon_cancelled_by: who.id }).eq('id', b.id);
          if ((await beaconTruth(ctx, b.id))?.beacon_cancelled_at) got.push(who.key);
        }
        rule(got.length === 0, `rider A's beacon was cancelled by: ${got.join(', ')}`);
      } finally {
        await clearBeacons(ctx, rides.main);
      }
    },
  },
  {
    id: 'T11.2', rule: 'T11',
    title: 'A beacon update that touches anything but the two cancel fields is rejected',
    run: async (ctx) => {
      const { users: u, rides } = ctx.fx;
      try {
        const got = [];
        const b1 = await adminBeacon(ctx, rides.main, u.riderA);
        await db(ctx, u.riderA).from('beacon_alerts').update({ lat: 12.3456 }).eq('id', b1.id);
        if ((await beaconTruth(ctx, b1.id))?.lat === 12.3456) got.push('own rider moved the snapshot position');
        const b2 = await adminBeacon(ctx, rides.main, u.riderA);
        await db(ctx, u.captain).from('beacon_alerts')
          .update({ beacon_cancelled_at: iso(), beacon_cancelled_by: u.captain.id, triggered_at: '2020-01-01T00:00:00Z' }).eq('id', b2.id);
        const t2 = await beaconTruth(ctx, b2.id);
        if (t2?.triggered_at?.startsWith('2020-01-01')) got.push('Captain rewrote triggered_at while cancelling');
        const b3 = await adminBeacon(ctx, rides.main, u.riderA);
        await db(ctx, u.captain).from('beacon_alerts').update({ rider_id: u.riderB.id }).eq('id', b3.id);
        if ((await beaconTruth(ctx, b3.id))?.rider_id === u.riderB.id) got.push('Captain re-pointed the beacon at another rider');
        rule(got.length === 0, got.join('; '));
      } finally {
        await clearBeacons(ctx, rides.main);
      }
    },
  },
  {
    id: 'T11.3', rule: 'T11',
    title: 'A beacon cancel is rejected unless it moves the cancel fields from empty to set',
    run: async (ctx) => {
      const { users: u, rides } = ctx.fx;
      try {
        const got = [];
        const at = '2026-01-01T00:00:00+00:00';
        const b1 = await adminBeacon(ctx, rides.main, u.riderA, { beacon_cancelled_at: at, beacon_cancelled_by: u.riderA.id });
        await db(ctx, u.captain).from('beacon_alerts').update({ beacon_cancelled_at: iso(), beacon_cancelled_by: u.captain.id }).eq('id', b1.id);
        if ((await beaconTruth(ctx, b1.id))?.beacon_cancelled_by !== u.riderA.id) got.push('Captain overwrote who cancelled a closed beacon');
        const b2 = await adminBeacon(ctx, rides.main, u.riderA, { beacon_cancelled_at: at, beacon_cancelled_by: u.riderA.id });
        await db(ctx, u.riderA).from('beacon_alerts').update({ beacon_cancelled_at: null, beacon_cancelled_by: null }).eq('id', b2.id);
        if (!(await beaconTruth(ctx, b2.id))?.beacon_cancelled_at) got.push('own rider re-opened a closed beacon');
        const b3 = await adminBeacon(ctx, rides.main, u.riderA);
        await db(ctx, u.riderA).from('beacon_alerts').update({ beacon_cancelled_at: iso() }).eq('id', b3.id);
        const t3 = await beaconTruth(ctx, b3.id);
        if (t3?.beacon_cancelled_at && !t3?.beacon_cancelled_by) got.push('a cancel was written with no actor');
        rule(got.length === 0, got.join('; '));
      } finally {
        await clearBeacons(ctx, rides.main);
      }
    },
  },
  {
    id: 'T11.4', rule: 'T11',
    title: 'A beacon cancel is rejected unless beacon_cancelled_by is the caller',
    run: async (ctx) => {
      const { users: u, rides } = ctx.fx;
      try {
        const got = [];
        const b1 = await adminBeacon(ctx, rides.main, u.riderA);
        await db(ctx, u.captain).from('beacon_alerts').update({ beacon_cancelled_at: iso(), beacon_cancelled_by: u.sag.id }).eq('id', b1.id);
        if ((await beaconTruth(ctx, b1.id))?.beacon_cancelled_by === u.sag.id) got.push('Captain recorded the SAG as the canceller');
        const b2 = await adminBeacon(ctx, rides.main, u.riderA);
        await db(ctx, u.riderA).from('beacon_alerts').update({ beacon_cancelled_at: iso(), beacon_cancelled_by: u.captain.id }).eq('id', b2.id);
        if ((await beaconTruth(ctx, b2.id))?.beacon_cancelled_by === u.captain.id) got.push('own rider recorded the Captain as the canceller');
        rule(got.length === 0, got.join('; '));
      } finally {
        await clearBeacons(ctx, rides.main);
      }
    },
  },

  // ── T12 ────────────────────────────────────────────────────────────────────
  {
    id: 'T12.1', rule: 'T12',
    title: 'No client can write beacon_cancel_reason',
    run: async (ctx) => {
      const { users: u, rides, tenants } = ctx.fx;
      try {
        const got = [];
        await db(ctx, u.riderA).from('beacon_alerts')
          .insert({ tenant_id: tenants.x.id, ride_id: rides.main.id, rider_id: u.riderA.id, beacon_cancel_reason: 'ride_ended' });
        const { data: ins } = await ctx.admin.from('beacon_alerts').select('id').eq('ride_id', rides.main.id).not('beacon_cancel_reason', 'is', null);
        if (ins?.length) got.push('own rider inserted a row with a reason');
        for (const who of [u.riderA, u.captain, u.sag, u.clubAdmin]) {
          const b = await adminBeacon(ctx, rides.main, u.riderA);
          await db(ctx, who).from('beacon_alerts')
            .update({ beacon_cancelled_at: iso(), beacon_cancelled_by: who.id, beacon_cancel_reason: 'ride_ended' }).eq('id', b.id);
          if ((await beaconTruth(ctx, b.id))?.beacon_cancel_reason) got.push(`${who.key} set a reason on update`);
        }
        rule(got.length === 0, got.join('; '));
      } finally {
        await clearBeacons(ctx, rides.main);
      }
    },
  },

  // ── T14 (before T13 and T4.4: it ends the "ending" ride they build on) ────
  {
    id: 'T14.1', rule: 'T14',
    title: 'A ride ending with an open beacon closes it with ride_ended and clears the beacon flag',
    run: async (ctx) => {
      const { users: u, rides } = ctx.fx;
      const b = await adminBeacon(ctx, rides.ending, u.riderA);
      await setBeaconFlag(ctx, rides.ending, u.riderA, true);
      // For T4.4: rider B connects while the ride is live and is shown to be receiving the
      // beaconing rider. The connection is kept open across the ride end.
      const rb = await listen(ctx, u.riderB, receiveTopics('rider', rides.ending.id));
      const n0 = needle();
      await restSend(ctx, u.riderA, sendTopics('rider', EVENTS.pos, rides.ending.id, { beaconActive: true }), EVENTS.pos, posPayload(u.riderA, n0));
      ctx.state.endingRideListenerLive = await arrives(ctx, rb, n0);
      ctx.open.delete(rb);
      ctx.state.endingRideListener = rb;
      const end = await db(ctx, u.captain).from('rides').update({ status: 'saved', actual_end: iso() }).eq('id', rides.ending.id).select('id, status');
      control(!end.error && end.data?.[0]?.status === 'saved', `the Captain could not end the ride (${end.error?.message ?? 'no row'})`);
      ctx.state.endingRideEnded = true;
      ctx.state.rideEndedBeaconId = b.id;
      const t = await beaconTruth(ctx, b.id);
      rule(t?.beacon_cancelled_at != null, 'the open beacon was not closed at ride end');
      rule(t?.beacon_cancel_reason === 'ride_ended', `reason is ${t?.beacon_cancel_reason}, expected ride_ended`);
      rule(t?.beacon_cancelled_by === u.captain.id, 'the ender was not recorded on the closed beacon');
      const { data: flags } = await ctx.admin.from('ride_participants').select('id').eq('ride_id', rides.ending.id).eq('beacon_active', true);
      rule((flags?.length ?? 0) === 0, 'a beacon flag is still set after ride end');
    },
  },
  {
    id: 'T4.4', rule: 'T4', needs: ['T14.1'],
    title: 'After the ride ends, riders stop receiving the beaconing rider\'s position',
    run: async (ctx) => {
      const { users: u, rides } = ctx.fx;
      const id = rides.ending.id;
      control(ctx.state.endingRideEnded, 'the ride was not ended (T14.1 did not complete)');
      control(ctx.state.endingRideListenerLive, 'rider B was not receiving the beaconing rider before the ride ended');
      ctx.open.add(ctx.state.endingRideListener);
      // T14.1 opened rider B's connection while the ride was live and the beacon active, and
      // confirmed it was receiving. Rider A now keeps sending on every path a rider has.
      const rb = ctx.state.endingRideListener;
      control(rb.attached(), 'rider B\'s connection from before the ride end has dropped, so its silence proves nothing');
      const fresh = await listen(ctx, u.riderB, allTopics(id));
      control(fresh.unclear().length === 0, `a fresh join was neither accepted nor refused by policy: ${fresh.why()}`);
      // Realtime is delivering right now: on the live ride, rider B receives the Captain.
      const live = await listen(ctx, u.riderB, receiveTopics('rider', rides.main.id));
      const c = needle();
      await restSend(ctx, u.captain, sendTopics('captain', EVENTS.pos, rides.main.id), EVENTS.pos, posPayload(u.captain, c));
      control(await arrives(ctx, live, c), 'Realtime was not delivering when the case ran');
      const topics = [...new Set([
        ...sendTopics('rider', EVENTS.pos, id, { beaconActive: false }),
        ...sendTopics('rider', EVENTS.pos, id, { beaconActive: true }),
      ])];
      const n = needle();
      await restSend(ctx, u.riderA, topics, EVENTS.pos, posPayload(u.riderA, n));
      const window = ctx.target.timeouts.quiet + 2000;
      const [a, b] = await Promise.all([arrives(ctx, rb, n, window), arrives(ctx, fresh, n, window)]);
      rule(!a, 'rider B\'s open connection received rider A\'s position after the ride ended');
      rule(!b, 'a fresh rider connection received rider A\'s position on a ride that has ended');
    },
  },

  // ── T13 ────────────────────────────────────────────────────────────────────
  {
    id: 'T13.1', rule: 'T13',
    title: 'Deleting an account sets actor_deleted on that person\'s past cancels and leaves ride_ended rows alone',
    run: async (ctx) => {
      // The deletion routine is service-role only (the delete-account function calls it with
      // the verified caller id), so this one case runs it as the service role by design.
      const { users: u, rides } = ctx.fx;
      try {
        const at = '2026-01-01T00:00:00+00:00';
        const cancelled = await adminBeacon(ctx, rides.main, u.riderA, { beacon_cancelled_at: at, beacon_cancelled_by: u.actor.id });
        const ended = await adminBeacon(ctx, rides.main, u.riderB, { beacon_cancelled_at: at, beacon_cancelled_by: u.actor.id, beacon_cancel_reason: 'ride_ended' });
        const { error } = await ctx.admin.rpc('delete_account_data', { p_uid: u.actor.id });
        control(!error, `delete_account_data failed: ${error?.message}`);
        await ctx.admin.auth.admin.deleteUser(u.actor.id);
        const t1 = await beaconTruth(ctx, cancelled.id);
        const t2 = await beaconTruth(ctx, ended.id);
        control(t1 && t2, 'a beacon row disappeared with the deleted actor');
        rule(t2.beacon_cancel_reason === 'ride_ended', `the ride_ended row now reads ${t2.beacon_cancel_reason}`);
        rule(t1.beacon_cancelled_at != null, 'the cancel time was lost');
        rule(t1.beacon_cancel_reason === 'actor_deleted', `a past cancel by the deleted person reads reason=${t1.beacon_cancel_reason}, expected actor_deleted`);
      } finally {
        await clearBeacons(ctx, rides.main);
      }
    },
  },
  {
    id: 'T13.2', rule: 'T13',
    title: 'No client can have actor_deleted written: not directly, and not by blanking the actor',
    run: async (ctx) => {
      const { users: u, rides } = ctx.fx;
      try {
        const at = '2026-01-01T00:00:00+00:00';
        const b = await adminBeacon(ctx, rides.main, u.riderA, { beacon_cancelled_at: at, beacon_cancelled_by: u.captain.id });
        for (const who of [u.riderA, u.captain, u.clubAdmin]) {
          const c = db(ctx, who);
          await c.from('beacon_alerts').update({ beacon_cancel_reason: 'actor_deleted' }).eq('id', b.id);
          await c.from('beacon_alerts').update({ beacon_cancelled_by: null }).eq('id', b.id);
        }
        const t = await beaconTruth(ctx, b.id);
        control(t != null, 'the beacon row disappeared');
        rule(t.beacon_cancel_reason == null, `a client got reason=${t.beacon_cancel_reason} written onto a beacon`);
      } finally {
        await clearBeacons(ctx, rides.main);
      }
    },
  },

  // ── T15 ────────────────────────────────────────────────────────────────────
  // W310 finding: the public `ride:<id>` channel had one subscriber (admin useRideRealtime)
  // and one sender (admin lib/simulation), neither imported by anything. Both were removed,
  // so the channel no longer exists in the product. T15.1 keeps it that way.
  {
    id: 'T15.1', rule: 'T15',
    title: 'No app code opens a public realtime channel: every channel is private, and the public ride:<id> topic is gone',
    run: async () => {
      const offenders = [];
      const calls = {};
      // Comments are removed first: a `// private: true` remark must never satisfy the check.
      // Line comments go file-wide; block comments only inside a call's own arguments (a
      // file-wide block strip is not string-aware and could swallow real code after a "/*").
      const code = (t) => t.replace(/(^|[^:])\/\/.*$/gm, '$1');
      const noBlocks = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '');
      for (const dir of SOURCE_DIRS) {
        calls[dir] = 0;
        const root = join(REPO_ROOT, dir);
        control(existsSync(root), `source directory missing: ${dir}`);
        for (const file of sourceFiles(root)) {
          const text = code(readFileSync(file, 'utf8'));
          const rel = relative(REPO_ROOT, file);
          // A topic literal that starts with `ride:` is the old public channel.
          if (/[`'"]ride:(\$\{|[`'"])/.test(text)) offenders.push(`${rel}: names a public ride: topic`);
          // Socket channels: the call's own argument list must set private: true.
          let at = text.indexOf('.channel(');
          while (at !== -1) {
            calls[dir] += 1;
            let depth = 0;
            let end = at + '.channel'.length;
            for (; end < text.length; end += 1) {
              if (text[end] === '(') depth += 1;
              else if (text[end] === ')') { depth -= 1; if (depth === 0) break; }
            }
            const args = noBlocks(text.slice(at, end));
            if (!/private:\s*true/.test(args) || /private:\s*false/.test(args)) {
              offenders.push(`${rel}: a channel is opened without private: true`);
            }
            at = text.indexOf('.channel(', end);
          }
          // REST broadcast (the mobile background sender): every message must be private.
          if (text.includes('/realtime/v1/api/broadcast')) {
            calls[dir] += 1;
            // One private: true for every message topic in the file, and never a false.
            const topics = (text.match(/\btopic:/g) ?? []).length;
            const privates = (noBlocks(text).match(/private:\s*true/g) ?? []).length;
            if (privates < Math.max(1, topics) || /private:\s*false/.test(text)) {
              offenders.push(`${rel}: a REST broadcast is sent without private: true`);
            }
          }
        }
      }
      // The scan must see the app's own private channel and REST sender, or it is looking in
      // the wrong place.
      control(calls['mobile/src'] >= 2, `the scan found ${calls['mobile/src']} realtime uses in mobile/src; expected the ride channel and the REST sender`);
      rule(offenders.length === 0, offenders.join('; '));
    },
  },
  {
    id: 'T15.2', rule: 'T15', advisory: true,
    title: 'Advisory, outside the rule: the project refuses public realtime channels altogether',
    run: async (ctx) => {
      // Not part of T15: nothing in the product sends on a public channel any more. This
      // records whether the Realtime service itself still relays a public channel for anyone
      // holding the publishable key. It turns green when the project is set to private
      // channels only (a project setting, the Senior PM's call; qa_log.md W310).
      const { users: u, rides } = ctx.fx;
      const topic = publicWebTopic(rides.main.id);
      const up = await listen(ctx, u.captain, receiveTopics('captain', rides.main.id));
      control(up.joined.length > 0, `Realtime is not answering: ${up.why()}`);
      const anon = await listen(ctx, null, [topic], { priv: false });
      control(anon.statuses[topic] !== 'TIMED_OUT', `the public channel join timed out: ${anon.why()}`);
      const n = needle();
      const payload = { id: u.riderA.id, lastLat: POS.lat, lastLong: POS.lng, marker: n };
      await restSend(ctx, null, [topic], PUBLIC_WEB_POSITION_EVENT, payload, { priv: false });
      const got = await arrives(ctx, anon, n, ctx.target.timeouts.quiet + 2000);
      rule(!got, 'the Realtime service relays a public channel between unauthenticated clients');
    },
  },

  // ── T16 ────────────────────────────────────────────────────────────────────
  // The DoD-12 / V-012 cross-tenant checks of tests/rlsIsolation.test.mjs, restated here so
  // they also run on staging (that matrix refuses any non-local target).
  {
    id: 'T16.1', rule: 'T16',
    title: 'Cross-tenant: another club\'s admin and member read nothing of the ride',
    run: async (ctx) => {
      const { users: u, rides, tenants } = ctx.fx;
      const id = rides.main.id;
      try {
        await adminBeacon(ctx, rides.main, u.riderA);
        const rs = await ctx.admin.from('rider_states').insert({ tenant_id: tenants.x.id, ride_id: id, rider_id: u.riderA.id, state: 'active' });
        control(!rs.error, `rider_states fixture: ${rs.error?.message}`);
        const probes = (c) => ({
          rides: c.from('rides').select('id').eq('id', id),
          beacon_alerts: c.from('beacon_alerts').select('id').eq('ride_id', id),
          rider_states: c.from('rider_states').select('id').eq('ride_id', id),
          ride_participants: c.from('ride_participants').select('id').eq('ride_id', id),
          rider_roster: riderRoster(c, id).then((r) => ({ data: r.rows })),
        });
        // Control: the same reads return rows to a member of this club, so an empty answer
        // across the boundary is a refusal and not a broken query.
        for (const [label, q] of Object.entries(probes(db(ctx, u.riderB)))) {
          const { data } = await q;
          control(data?.length > 0, `in-club read of ${label} returned nothing`);
        }
        const lead = await db(ctx, u.captain).rpc('get_ride_roster_contacts', { p_ride_id: id });
        control(lead.data?.length > 0, 'the Captain\'s roster contacts returned nothing');
        const got = [];
        for (const who of [u.otherAdmin, u.otherMember]) {
          const c = db(ctx, who);
          const all = { ...probes(c), roster_contacts: c.rpc('get_ride_roster_contacts', { p_ride_id: id }) };
          for (const [label, q] of Object.entries(all)) {
            const { data } = await q;
            if (data?.length) got.push(`${who.key}: ${label}`);
          }
        }
        rule(got.length === 0, `cross-tenant read: ${got.join(', ')}`);
      } finally {
        await ctx.admin.from('rider_states').delete().eq('ride_id', id);
        await clearBeacons(ctx, rides.main);
      }
    },
  },
  {
    id: 'T16.2', rule: 'T16',
    title: 'Cross-tenant: another club\'s admin and member cannot write to the ride, send on it, or join its channels',
    run: async (ctx) => {
      const { users: u, rides, tenants } = ctx.fx;
      const id = rides.main.id;
      const telemetry = (tenantId, who) => ({
        tenant_id: tenantId, ride_id: id, account_id: who.id, platform: 'android', device_class: 'test/device',
        kind: 'engine_started', tier: 'always_on', client_ts: iso(), payload: { reason: 'start_resolved' },
      });
      try {
        const b = await adminBeacon(ctx, rides.main, u.riderA);
        const cap = await listen(ctx, u.captain, receiveTopics('captain', id));
        control(cap.joined.length > 0, `captain could not join: ${cap.why()}`);
        const got = [];
        const needles = [];
        for (const who of [u.otherAdmin, u.otherMember]) {
          const c = db(ctx, who);
          await c.from('beacon_alerts').insert({ tenant_id: tenants.x.id, ride_id: id, rider_id: who.id });
          await c.from('beacon_alerts').insert({ tenant_id: tenants.y.id, ride_id: id, rider_id: who.id });
          await c.from('beacon_alerts').update({ beacon_cancelled_at: iso(), beacon_cancelled_by: who.id }).eq('id', b.id);
          await c.from('ride_participants').update({ last_lat: 1 }).eq('ride_id', id);
          await c.from('rides').update({ status: 'saved' }).eq('id', id);
          await c.from('rail3_telemetry_events').insert(telemetry(tenants.x.id, who));
          await c.from('rail3_telemetry_events').insert(telemetry(tenants.y.id, who));
          const n = needle();
          await restSend(ctx, who, allTopics(id), EVENTS.pos, posPayload(who, n));
          needles.push([who, n]);
          const l = await listen(ctx, who, allTopics(id));
          control(l.unclear().length === 0, `a cross-tenant join was neither accepted nor refused by policy: ${l.why()}`);
          if (l.joined.length) got.push(`${who.key}: joined a channel`);
        }
        // The captain's connection is live: an in-club position still arrives.
        const c2 = needle();
        await restSend(ctx, u.riderA, sendTopics('rider', EVENTS.pos, id), EVENTS.pos, posPayload(u.riderA, c2));
        control(await arrives(ctx, cap, c2), 'the captain\'s connection went quiet during the case');
        await quiet(ctx);
        for (const [who, n] of needles) if (cap.saw(n)) got.push(`${who.key}: a broadcast was delivered on the ride`);
        const others = [u.otherAdmin.id, u.otherMember.id];
        const { data: planted } = await ctx.admin.from('beacon_alerts').select('id, tenant_id').eq('ride_id', id).in('rider_id', others);
        if (planted?.some((r) => r.tenant_id === tenants.x.id)) got.push('a beacon row was inserted into this club from another club');
        if (planted?.some((r) => r.tenant_id === tenants.y.id)) got.push('another club\'s member attached a beacon row (under their own club) to this club\'s ride');
        if ((await beaconTruth(ctx, b.id))?.beacon_cancelled_at) got.push('a beacon was cancelled from another club');
        const { data: ride } = await ctx.admin.from('rides').select('status').eq('id', id).single();
        if (ride?.status !== 'active') got.push('the ride was ended from another club');
        const { data: moved } = await ctx.admin.from('ride_participants').select('id').eq('ride_id', id).eq('last_lat', 1);
        if (moved?.length) got.push('participant rows were written from another club');
        const { data: tel } = await ctx.admin.from('rail3_telemetry_events').select('id').eq('ride_id', id).in('account_id', others);
        if (tel?.length) got.push('telemetry was written against this club\'s ride from another club');
        rule(got.length === 0, `cross-tenant write: ${got.join(', ')}`);
      } finally {
        await ctx.admin.from('rail3_telemetry_events').delete().eq('ride_id', id);
        await clearBeacons(ctx, rides.main);
      }
    },
  },
  {
    id: 'T16.3', rule: 'T16',
    title: 'Cross-tenant, the other way: this club\'s riders and admin read nothing of the other club\'s ride',
    run: async (ctx) => {
      const { users: u, rides } = ctx.fx;
      const id = rides.other.id;
      try {
        await adminBeacon(ctx, rides.other, u.otherMember);
        const own = await db(ctx, u.otherMember).from('beacon_alerts').select('id').eq('ride_id', id);
        control(own.data?.length > 0, 'the other club\'s own member could not read their beacon row');
        const got = [];
        for (const who of [u.riderA, u.captain, u.clubAdmin]) {
          const c = db(ctx, who);
          if ((await read(c.from('rides').select('id').eq('id', id))).length) got.push(`${who.key}: rides`);
          if ((await read(c.from('beacon_alerts').select('id').eq('ride_id', id))).length) got.push(`${who.key}: beacon_alerts`);
          if ((await read(c.from('ride_participants').select('id').eq('ride_id', id))).length) got.push(`${who.key}: ride_participants`);
          if ((await read(c.rpc('get_ride_roster_contacts', { p_ride_id: id }))).length) got.push(`${who.key}: roster contacts`);
          const l = await refused(ctx, who, rides.other);
          if (l.joined.length) got.push(`${who.key}: joined a channel`);
        }
        rule(got.length === 0, `cross-tenant read: ${got.join(', ')}`);
      } finally {
        await clearBeacons(ctx, rides.other);
      }
    },
  },
  {
    id: 'T16.4', rule: 'T16',
    title: 'A channel for a ride that does not exist admits nobody',
    run: async (ctx) => {
      const { users: u, rides } = ctx.fx;
      const ghost = '00000000-0000-0000-0000-000000000000';
      const got = [];
      for (const who of [u.captain, u.clubAdmin, u.riderA]) {
        const l = await joinAttempt(ctx, who, allTopics(ghost), ...permitted(ctx, rides.main));
        if (l.joined.length) got.push(who.key);
      }
      rule(got.length === 0, `joined a channel for a ride that does not exist: ${got.join(', ')}`);
    },
  },
];
