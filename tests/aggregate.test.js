import test from 'node:test';
import assert from 'node:assert/strict';
import { eventKey, newEvents, summarizeParticipants, nextParticipantId } from '../js/aggregate.js';

const touch = (pid, cond, n, intended, keyShown, extra = {}) =>
  ({ ev: 'touch', sid: `s-${pid}`, n, pid, cond, phase: 'main', intended, keyShown, keyBase: keyShown, keyCal: intended, ...extra });

test('merge skips duplicate events (same session + seq)', () => {
  const a = [{ ev: 'x', sid: 's1', n: 0 }, { ev: 'x', sid: 's1', n: 1 }];
  const b = [{ ev: 'x', sid: 's1', n: 1 }, { ev: 'x', sid: 's2', n: 1 }, { ev: 'x', sid: 's2', n: 1 }];
  const fresh = newEvents(a, b);
  assert.deepEqual(fresh.map(eventKey), ['s2|1']);
});

test('summary is per participant × condition, main phase only, P00 excluded', () => {
  const events = [
    touch('P01', 'B', 0, 'w', 'e'), touch('P01', 'B', 1, 'w', 'w'),
    touch('P01', 'B', 2, 'w', 'w', { phase: 'practice' }),
    touch('P01', 'B', 3, 'w', 'shift'),
    { ev: 'trial_end', sid: 's-P01', n: 4, pid: 'P01', cond: 'B', phase: 'main', live: { wpm: 20 } },
    { ev: 'model_fit', sid: 's-P01', n: 5, pid: 'P01', cond: 'D', model: 'M0' },
    touch('P02', 'A', 0, 'a', 'a'),
    touch('P00', 'A', 0, 'a', 's'),
  ];
  const s = summarizeParticipants(events);
  assert.deepEqual(s.map(p => p.pid), ['P01', 'P02']);
  const b = s[0].conds.B;
  assert.equal(b.trials, 1);
  assert.equal(b.wpm, 20);
  assert.equal(b.shown.keystrokes, 2); // practice and shift excluded
  assert.equal(b.shown.neighborErrorRate, 0.5); // w->e is a neighbor error
  assert.equal(b.cal.neighborErrorRate, 0); // shadow calibrated decode got it right
  assert.equal(s[0].conds.D.calibrated, true);
  assert.equal(s[0].conds.D.model, 'M0');
});

test('next participant id', () => {
  assert.equal(nextParticipantId([]), 'P01');
  assert.equal(nextParticipantId(['P01', 'P03', 'P00']), 'P04');
});
