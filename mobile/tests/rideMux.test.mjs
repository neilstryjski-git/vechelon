// W193 — unit tests for the ride channel multiplexer (lib/rideMux.ts), with fake channels.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { makeRideMux } from '../src/lib/rideMux.ts';
import { listenKinds } from '../src/lib/channelLayout.ts';

function fake(name) {
  const listeners = [];
  return {
    name,
    sent: [],
    listeners,
    on(_type, filter, cb) { listeners.push({ event: filter.event, cb }); return this; },
    send(m) { this.sent.push(m); return Promise.resolve('ok'); },
    emit(event, payload) { for (const l of listeners) if (l.event === event) l.cb({ event, payload }); },
    count(event) { return listeners.filter((l) => l.event === event).length; },
  };
}

test('there is no mux until the all channel exists', () => {
  assert.equal(makeRideMux(null, listenKinds), null);
  assert.ok(makeRideMux(fake('all'), listenKinds));
});

test('position handlers bind on lead, crew and sos only; other events on all only', () => {
  const [all, lead, crew, sos] = ['all', 'lead', 'crew', 'sos'].map(fake);
  const mux = makeRideMux(all, listenKinds);
  mux.attach({ lead, crew, sos });
  mux.on('broadcast', { event: 'pos' }, () => {});
  mux.on('broadcast', { event: 'beacon' }, () => {});
  assert.deepEqual([all.count('pos'), lead.count('pos'), crew.count('pos'), sos.count('pos')], [0, 1, 1, 1]);
  assert.deepEqual([all.count('beacon'), lead.count('beacon'), crew.count('beacon'), sos.count('beacon')], [1, 0, 0, 0]);
});

test('handlers registered before a channel is attached are bound when it arrives, once', () => {
  const [all, lead] = ['all', 'lead'].map(fake);
  const mux = makeRideMux(all, listenKinds);
  const got = [];
  mux.on('broadcast', { event: 'pos' }, (m) => got.push(m.payload));
  mux.attach({ lead });
  mux.attach({ lead }); // the same channel again: nothing new
  assert.equal(lead.count('pos'), 1);
  lead.emit('pos', 1);
  assert.deepEqual(got, [1]);
});

test('a replaced side channel gets the existing handlers; the others are not doubled', () => {
  const [all, lead, crew, lead2] = ['all', 'lead', 'crew', 'lead2'].map(fake);
  const mux = makeRideMux(all, listenKinds);
  const got = [];
  mux.attach({ lead, crew });
  mux.on('broadcast', { event: 'pos' }, (m) => got.push(m.payload));
  mux.attach({ lead: lead2, crew });
  assert.equal(crew.count('pos'), 1);
  assert.equal(lead2.count('pos'), 1);
  lead2.emit('pos', 'L');
  crew.emit('pos', 'C');
  assert.deepEqual(got, ['L', 'C']);
});

test('two hooks binding the same event both fire', () => {
  const [all, lead] = ['all', 'lead'].map(fake);
  const mux = makeRideMux(all, listenKinds);
  mux.attach({ lead });
  const got = [];
  mux.on('broadcast', { event: 'pos' }, () => got.push('a'));
  mux.on('broadcast', { event: 'pos' }, () => got.push('b'));
  lead.emit('pos', 0);
  assert.deepEqual(got, ['a', 'b']);
});

test('a role change adds crew and drops sos without touching all or lead', () => {
  const [all, lead, crew, sos] = ['all', 'lead', 'crew', 'sos'].map(fake);
  const mux = makeRideMux(all, listenKinds);
  mux.attach({ lead, sos });
  mux.on('broadcast', { event: 'pos' }, () => {});
  mux.attach({ lead, crew });
  assert.deepEqual([lead.count('pos'), crew.count('pos')], [1, 1]);
});

test('a disposed mux goes quiet, even on a side channel that outlived it', () => {
  const [all, all2, lead] = ['all', 'all2', 'lead'].map(fake);
  const got = [];
  const old = makeRideMux(all, listenKinds);
  old.attach({ lead });
  old.on('broadcast', { event: 'pos' }, () => got.push('old'));
  old.dispose();
  const next = makeRideMux(all2, listenKinds);
  next.attach({ lead });
  next.on('broadcast', { event: 'pos' }, () => got.push('new'));
  lead.emit('pos', 0);
  assert.deepEqual(got, ['new']);
});

test('send goes to the all channel only', async () => {
  const [all, lead] = ['all', 'lead'].map(fake);
  const mux = makeRideMux(all, listenKinds);
  mux.attach({ lead });
  assert.equal(await mux.send({ type: 'broadcast', event: 'beacon', payload: {} }), 'ok');
  assert.equal(all.sent.length, 1);
  assert.equal(lead.sent.length, 0);
});
