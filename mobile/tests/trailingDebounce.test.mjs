// D103 — unit tests for the roster refresh debounce (never lose an ask; never read per ping).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeTrailingDebounce } from '../src/lib/trailingDebounce.ts';

function rig(windowMs = 10_000) {
  let t = 1_000_000;
  let runs = 0;
  const timers = new Map();
  let nextId = 1;
  const d = makeTrailingDebounce({
    windowMs,
    now: () => t,
    setTimer: (fn, ms) => {
      const id = nextId++;
      timers.set(id, { fn, at: t + ms });
      return id;
    },
    clearTimer: (id) => timers.delete(id),
    run: () => {
      runs += 1;
    },
  });
  // Advance the clock, firing due timers in order (as a running JS thread would).
  const advance = (ms) => {
    const end = t + ms;
    for (;;) {
      const due = [...timers.entries()].filter(([, v]) => v.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
      if (!due) break;
      timers.delete(due[0]);
      t = due[1].at;
      due[1].fn();
    }
    t = end;
  };
  // Advance the clock WITHOUT firing timers (a suspended JS thread), then let the caller act.
  const suspend = (ms) => {
    t += ms;
  };
  const fireOverdue = () => advance(0);
  return { d, advance, suspend, fireOverdue, runs: () => runs, pending: () => timers.size };
}

test('the first ask runs at once', () => {
  const r = rig();
  r.d.ask();
  assert.equal(r.runs(), 1);
  assert.equal(r.pending(), 0);
});

test('an ask inside the window is deferred to the end of the window, not dropped', () => {
  const r = rig();
  r.d.ask();
  r.advance(3_000);
  r.d.ask();
  assert.equal(r.runs(), 1, 'not yet');
  r.advance(6_999);
  assert.equal(r.runs(), 1, 'still inside the window');
  r.advance(1);
  assert.equal(r.runs(), 2, 'runs when the window ends');
});

test('many asks inside one window cost one deferred run (no read per ping)', () => {
  const r = rig();
  r.d.ask();
  for (let i = 0; i < 50; i += 1) {
    r.advance(100);
    r.d.ask();
  }
  assert.equal(r.pending(), 1);
  r.advance(10_000);
  assert.equal(r.runs(), 2);
});

test('a steady stream of asks runs once per window', () => {
  const r = rig();
  for (let i = 0; i < 300; i += 1) {
    r.d.ask();
    r.advance(100);
  }
  assert.equal(r.runs(), 4, '30 s of asks every 100 ms: runs at 0, 10, 20 and 30 s, never one per ask');
});

test('noteRun starts the window: an ask just after the read on open waits it out', () => {
  const r = rig();
  r.d.noteRun();
  r.advance(500);
  r.d.ask();
  assert.equal(r.runs(), 0);
  r.advance(9_500);
  assert.equal(r.runs(), 1);
});

test('after a suspend past the window, the immediate run cancels the overdue deferred one', () => {
  const r = rig();
  r.d.ask();
  r.advance(2_000);
  r.d.ask(); // deferred run pending
  r.suspend(60_000); // phone locked: timers do not fire
  r.d.ask(); // the resume asks first
  assert.equal(r.runs(), 2, 'runs at once: the window is long over');
  r.fireOverdue();
  assert.equal(r.runs(), 2, 'the overdue timer was cancelled, no second read');
});

test('cancel drops a pending deferred run', () => {
  const r = rig();
  r.d.ask();
  r.advance(1_000);
  r.d.ask();
  r.d.cancel();
  r.advance(20_000);
  assert.equal(r.runs(), 1);
});
