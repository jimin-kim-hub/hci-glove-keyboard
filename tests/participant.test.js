import test from 'node:test';
import assert from 'node:assert/strict';
import { KEY_BY_ID } from '../js/geometry.js';
import { participantDetail, detailToCsv } from '../js/participant.js';

const base = { sid: 's', pid: 'P01' };
const tap = (i, target, dx, dy, cond = 'D') => ({ ...base, ev: 'calib_tap', cond, i, target, ux: KEY_BY_ID[target].cx + dx, uy: KEY_BY_ID[target].cy + dy });
const touch = (intended, keyShown) => ({ ...base, ev: 'touch', cond: 'D', phase: 'main', intended, keyShown, keyBase: keyShown, keyCal: intended });

test('detail keeps only this participant and reports the median calibration offset', () => {
  const d = participantDetail([
    tap(0, 'w', 0.2, 0.3), tap(1, 'e', 0.2, 0.3), tap(2, 'r', 0.8, 0.3),
    { ...base, pid: 'P02', ev: 'calib_tap', cond: 'D', i: 0, target: 'w', ux: 0, uy: 0 },
    touch('w', 'e'),
  ], 'P01');
  const D = d.conds.find(c => c.cond === 'D');
  assert.equal(D.offset.n, 3);
  assert.ok(Math.abs(D.offset.dx - 0.2) < 1e-9);
  assert.ok(Math.abs(D.offset.dy - 0.3) < 1e-9);
  assert.equal(d.touches, 1);
  assert.equal(d.conds.find(c => c.cond === 'A').offset, null);
});

test('a restarted calibration replaces the earlier taps', () => {
  const d = participantDetail([tap(0, 'w', 0.9, 0.9), tap(1, 'e', 0.9, 0.9), tap(0, 'w', 0.1, 0.1)], 'P01');
  const D = d.conds.find(c => c.cond === 'D');
  assert.equal(D.offset.n, 1);
  assert.ok(Math.abs(D.offset.dx - 0.1) < 1e-9);
});

test('restarts, surveys and SUS appear in the detail and the CSV', () => {
  const start = { ...base, ev: 'typing_start', cond: 'D', phase: 'main' };
  const d = participantDetail([
    start, start, touch('w', 'w'),
    { ...base, ev: 'survey', cond: 'D', tlxRaw: 42.5, discomfort: 3 },
    { ...base, ev: 'sus', keyboard: 'calibrated', score: 75 },
    { ...base, ev: 'preference', gloveKeyboard: 'calibrated', bareKeyboard: 'same' },
    { ...base, ev: 'demographics', age: '20-24', hand: 'right', englishFreq: 3, style: 'two-thumbs', glove: 'women' },
    { ...base, ev: 'participant_end' },
  ], 'P01');
  const D = d.conds.find(c => c.cond === 'D');
  assert.equal(D.restarts, 1);
  assert.equal(D.tlx, 42.5);
  assert.equal(d.finished, true);
  const lines = detailToCsv(d).trim().split('\n');
  assert.equal(lines.length, 5); // header + 4 conditions
  const cols = lines[0].split(',');
  const row = lines.find(l => l.startsWith('P01,D,')).split(',');
  assert.equal(row.length, cols.length);
  assert.equal(row[cols.indexOf('tlx_raw')], '42.5');
  assert.equal(row[cols.indexOf('sus')], '75');
  assert.equal(row[cols.indexOf('pref_bare')], 'same');
  assert.equal(row[cols.indexOf('age')], '20-24');
  assert.equal(row[cols.indexOf('english_freq')], '3');
  assert.equal(row[cols.indexOf('glove_type')], 'women');
});
