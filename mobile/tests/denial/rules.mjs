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

import {
  rule, control, needle, listen, restSend, arrives, quiet, freshClient, posPayload, beaconPayload,
  adminBeacon, beaconTruth, clearBeacons, setBeaconFlag, POS,
} from './harness.mjs';
import {
  EVENTS, receiveTopics, sendTopics, allTopics, publicWebTopic, PUBLIC_WEB_POSITION_EVENT,
  riderRoster, leaderRoster,
} from './layout.mjs';

const db = (ctx, user) => freshClient(ctx.target, user);
const leaks = (data, ...values) => {
  const s = JSON.stringify(data ?? null);
  return values.filter((v) => v != null && s.includes(String(v)));
};
const iso = () => new Date().toISOString();

// Send `payload` as `sender` and confirm `allowed` receives it; then report which of
// `denied` also received it. The control makes a silent, undelivered send impossible to
// mistake for a denial.
async function deliver(ctx, { sender, topics, event, payload, n, allowed, denied }) {
  await restSend(ctx, sender, topics, event, payload);
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
      const l = await listen(ctx, u.offRide, allTopics(rides.main.id));
      rule(l.joined.length === 0, `off-ride member joined: ${l.joined.join(', ')}`);
    },
  },
  {
    id: 'T1.2', rule: 'T1',
    title: 'A member off the ride cannot send on any channel of that ride (REST and socket)',
    run: async (ctx) => {
      const { users: u, rides } = ctx.fx;
      const topics = allTopics(rides.main.id);
      const cap = await listen(ctx, u.captain, [...new Set([...receiveTopics('captain', rides.main.id), ...topics])]);
      control(cap.joined.length > 0, `captain could not join: ${cap.why()}`);
      // Control: a rider on the ride reaches the captain.
      const c = needle();
      await restSend(ctx, u.riderA, sendTopics('rider', EVENTS.pos, rides.main.id), EVENTS.pos, posPayload(u.riderA, c));
      control(await arrives(ctx, cap, c), 'an on-ride position never reached the captain');
      // Attempt: the off-ride member, by REST and over a socket.
      const n1 = needle();
      await restSend(ctx, u.offRide, topics, EVENTS.pos, posPayload(u.offRide, n1));
      const n2 = needle();
      const off = await listen(ctx, u.offRide, topics);
      for (const t of off.joined) await off.sendSocket(t, EVENTS.pos, posPayload(u.offRide, n2));
      await quiet(ctx);
      rule(!cap.saw(n1), 'an off-ride member\'s REST broadcast was delivered on the ride');
      rule(!cap.saw(n2), 'an off-ride member\'s socket broadcast was delivered on the ride');
    },
  },
  {
    id: 'T1.3', rule: 'T1',
    title: 'A rider who has left the ride cannot subscribe to any channel of that ride',
    run: async (ctx) => {
      const { users: u, rides } = ctx.fx;
      const l = await listen(ctx, u.departed, allTopics(rides.main.id));
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
      const n = needle();
      await restSend(ctx, u.captain, sendTopics('captain', EVENTS.pos, id), EVENTS.pos, posPayload(u.captain, n));
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
      const n = needle();
      await restSend(ctx, u.sag, sendTopics('sag', EVENTS.pos, id), EVENTS.pos, posPayload(u.sag, n));
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
      const rb = await listen(ctx, u.riderB, receiveTopics('rider', id));
      const n = needle();
      await restSend(ctx, u.riderA, sendTopics('rider', EVENTS.beacon, id, { beaconActive: true }), EVENTS.beacon,
        beaconPayload(u.riderA, true, '00000000-0000-4000-8000-000000000001', n));
      rule(await arrives(ctx, rb, n), 'rider B did not receive rider A\'s beacon event');
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
      try {
        // A beacon that was raised and then cancelled by its own rider.
        await adminBeacon(ctx, rides.main, u.riderA, { beacon_cancelled_at: iso(), beacon_cancelled_by: u.riderA.id });
        await setBeaconFlag(ctx, rides.main, u.riderA, false);
        const cap = await listen(ctx, u.captain, receiveTopics('captain', id));
        const rb = await listen(ctx, u.riderB, receiveTopics('rider', id));
        // Rider A keeps sending, on the normal path and on the beacon-active path.
        const topics = [...new Set([
          ...sendTopics('rider', EVENTS.pos, id, { beaconActive: false }),
          ...sendTopics('rider', EVENTS.pos, id, { beaconActive: true }),
        ])];
        const n = needle();
        const got = await deliver(ctx, {
          sender: u.riderA, topics, event: EVENTS.pos, payload: posPayload(u.riderA, n), n, allowed: cap, denied: [rb],
        });
        rule(got.length === 0, 'rider B still received rider A\'s position after the beacon was cancelled');
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
      const { data } = await db(ctx, u.riderB).from('ride_participants').select('*').eq('ride_id', rides.main.id).eq('account_id', u.riderA.id);
      const row = data?.[0];
      const got = [];
      if (row?.phone) got.push('phone');
      if (row?.last_lat != null || row?.last_long != null) got.push('last position');
      if (row?.last_ping) got.push('last ping');
      if (row?.email) got.push('email');
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
        const { data } = await q;
        if (leaks(data, ...secrets).length) found.push(label);
      };
      await probe('accounts', c.from('accounts').select('*').eq('id', u.riderA.id));
      await probe('accounts embed', c.from('ride_participants').select('account_id, accounts(name, phone)').eq('ride_id', rides.main.id));
      await probe('get_ride_roster_contacts', c.rpc('get_ride_roster_contacts', { p_ride_id: rides.main.id }));
      await probe('ride_participants_pa_view', c.from('ride_participants_pa_view').select('*').eq('ride_id', rides.main.id));
      await probe('rail3_breadcrumb', c.from('rail3_breadcrumb').select('*').eq('ride_id', rides.main.id));
      const roster = await riderRoster(c, rides.main.id);
      const a = roster.rows.find((r) => r.account_id === u.riderA.id);
      if (a?.phone || leaks(roster.rows, POS.lat, POS.lng).length) found.push('rider roster path');
      rule(found.length === 0, `rider B read rider A's phone or position through: ${found.join(', ')}`);
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
      const adm = await listen(ctx, u.clubAdmin, receiveTopics('admin', id));
      rule(adm.joined.length > 0, `the club admin could not subscribe: ${adm.why()}`);
      const n = needle();
      await restSend(ctx, u.riderA, sendTopics('rider', EVENTS.beacon, id, { beaconActive: true }), EVENTS.beacon,
        beaconPayload(u.riderA, true, '00000000-0000-4000-8000-000000000002', n));
      rule(await arrives(ctx, adm, n), 'the club admin did not receive the beacon event');
    },
  },
  {
    id: 'T8.2', rule: 'T8',
    title: 'An admin of another club cannot subscribe to any channel of the ride',
    run: async (ctx) => {
      const { users: u, rides } = ctx.fx;
      const l = await listen(ctx, u.otherAdmin, allTopics(rides.main.id));
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
    title: 'A member off the ride cannot read the ride\'s beacon rows or beacon flags',
    run: async (ctx) => {
      const { users: u, rides } = ctx.fx;
      try {
        const b = await adminBeacon(ctx, rides.main, u.riderA);
        await setBeaconFlag(ctx, rides.main, u.riderA, true);
        const c = db(ctx, u.offRide);
        const rows = await c.from('beacon_alerts').select('id').eq('ride_id', rides.main.id);
        const flags = await c.from('ride_participants').select('account_id, beacon_active').eq('ride_id', rides.main.id).eq('beacon_active', true);
        control((await beaconTruth(ctx, b.id)) != null, 'beacon fixture missing');
        rule((rows.data?.length ?? 0) === 0, 'an off-ride member read the ride\'s beacon rows');
        rule((flags.data?.length ?? 0) === 0, 'an off-ride member read which rider has an active beacon');
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
        const rows = await c.from('beacon_alerts').select('id').eq('ride_id', id);
        const flags = await c.from('ride_participants').select('account_id, beacon_active').eq('ride_id', id).eq('beacon_active', true);
        const l = await listen(ctx, u.neverOpened, allTopics(id));
        const paths = [];
        if (rows.data?.length) paths.push('beacon rows');
        if (flags.data?.length) paths.push('beacon flags');
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
    id: 'T4.4', rule: 'T4',
    title: 'After the ride ends, riders stop receiving the beaconing rider\'s position',
    run: async (ctx) => {
      const { users: u, rides } = ctx.fx;
      const id = rides.ending.id;
      control(ctx.state.endingRideEnded, 'the ride was not ended (T14.1 did not complete)');
      const rb = await listen(ctx, u.riderB, allTopics(id));
      const topics = [...new Set([
        ...sendTopics('rider', EVENTS.pos, id, { beaconActive: false }),
        ...sendTopics('rider', EVENTS.pos, id, { beaconActive: true }),
      ])];
      const n = needle();
      await restSend(ctx, u.riderA, topics, EVENTS.pos, posPayload(u.riderA, n));
      const got = await arrives(ctx, rb, n, ctx.target.timeouts.quiet + 2000);
      rule(!got, 'rider B received rider A\'s position on a ride that has ended');
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

  // ── T15 ────────────────────────────────────────────────────────────────────
  {
    id: 'T15.1', rule: 'T15',
    provisional: 'W310 owns the finding on the public web channel; this probe is rewritten when it reports',
    title: 'The public web ride channel does not carry a rider position to an unauthenticated listener',
    run: async (ctx) => {
      const { users: u, rides } = ctx.fx;
      const topic = publicWebTopic(rides.main.id);
      const anon = await listen(ctx, null, [topic], { priv: false });
      const n = needle();
      const payload = { participantId: u.riderA.id, lastLat: POS.lat, lastLong: POS.lng, marker: n };
      await restSend(ctx, null, [topic], PUBLIC_WEB_POSITION_EVENT, payload, { priv: false });
      await restSend(ctx, u.riderA, [topic], PUBLIC_WEB_POSITION_EVENT, payload, { priv: false });
      const got = await arrives(ctx, anon, n, ctx.target.timeouts.quiet + 2000);
      rule(!got, `an unauthenticated listener on ${topic.split(':')[0]}:<id> received a position`);
    },
  },

  // ── T16 ────────────────────────────────────────────────────────────────────
  {
    id: 'T16.1', rule: 'T16',
    title: 'Cross-tenant: another club\'s admin and member read nothing of the ride',
    run: async (ctx) => {
      const { users: u, rides } = ctx.fx;
      const id = rides.main.id;
      try {
        await adminBeacon(ctx, rides.main, u.riderA);
        const got = [];
        for (const who of [u.otherAdmin, u.otherMember]) {
          const c = db(ctx, who);
          const probes = {
            beacon_alerts: c.from('beacon_alerts').select('id').eq('ride_id', id),
            ride_participants: c.from('ride_participants').select('id').eq('ride_id', id),
            roster_contacts: c.rpc('get_ride_roster_contacts', { p_ride_id: id }),
            rider_roster: riderRoster(c, id).then((r) => ({ data: r.rows })),
            breadcrumb: c.from('rail3_breadcrumb').select('*').eq('ride_id', id),
          };
          for (const [label, q] of Object.entries(probes)) {
            const { data } = await q;
            if (data?.length) got.push(`${who.key}: ${label}`);
          }
        }
        rule(got.length === 0, `cross-tenant read: ${got.join(', ')}`);
      } finally {
        await clearBeacons(ctx, rides.main);
      }
    },
  },
  {
    id: 'T16.2', rule: 'T16',
    title: 'Cross-tenant: another club\'s admin and member cannot write to the ride or join its channels',
    run: async (ctx) => {
      const { users: u, rides, tenants } = ctx.fx;
      const id = rides.main.id;
      try {
        const b = await adminBeacon(ctx, rides.main, u.riderA);
        const got = [];
        for (const who of [u.otherAdmin, u.otherMember]) {
          const c = db(ctx, who);
          await c.from('beacon_alerts').insert({ tenant_id: tenants.x.id, ride_id: id, rider_id: who.id });
          await c.from('beacon_alerts').insert({ tenant_id: tenants.y.id, ride_id: id, rider_id: who.id });
          await c.from('beacon_alerts').update({ beacon_cancelled_at: iso(), beacon_cancelled_by: who.id }).eq('id', b.id);
          await c.from('ride_participants').update({ last_lat: 1 }).eq('ride_id', id);
          await c.from('rides').update({ status: 'saved' }).eq('id', id);
          const l = await listen(ctx, who, allTopics(id));
          if (l.joined.length) got.push(`${who.key}: joined a channel`);
        }
        const { data: planted } = await ctx.admin.from('beacon_alerts').select('id').eq('ride_id', id).in('rider_id', [u.otherAdmin.id, u.otherMember.id]);
        if (planted?.length) got.push('a beacon row was inserted from another club');
        if ((await beaconTruth(ctx, b.id))?.beacon_cancelled_at) got.push('a beacon was cancelled from another club');
        const { data: ride } = await ctx.admin.from('rides').select('status').eq('id', id).single();
        if (ride?.status !== 'active') got.push('the ride was ended from another club');
        const { data: moved } = await ctx.admin.from('ride_participants').select('id').eq('ride_id', id).eq('last_lat', 1);
        if (moved?.length) got.push('participant rows were written from another club');
        rule(got.length === 0, `cross-tenant write: ${got.join(', ')}`);
      } finally {
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
        const got = [];
        for (const who of [u.riderA, u.captain, u.clubAdmin]) {
          const c = db(ctx, who);
          if ((await c.from('beacon_alerts').select('id').eq('ride_id', id)).data?.length) got.push(`${who.key}: beacon_alerts`);
          if ((await c.from('ride_participants').select('id').eq('ride_id', id)).data?.length) got.push(`${who.key}: ride_participants`);
          if ((await c.rpc('get_ride_roster_contacts', { p_ride_id: id })).data?.length) got.push(`${who.key}: roster contacts`);
          const l = await listen(ctx, who, allTopics(id));
          if (l.joined.length) got.push(`${who.key}: joined a channel`);
        }
        rule(got.length === 0, `cross-tenant read: ${got.join(', ')}`);
      } finally {
        await clearBeacons(ctx, rides.other);
      }
    },
  },
];
