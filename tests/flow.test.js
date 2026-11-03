import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSteps, TRIALS_PER_COND } from '../js/steps.js';
import { susScore, tlxRaw } from '../js/surveys.js';
import { LATIN_SQUARE, CONDITIONS } from '../js/config.js';

test('steps follow the Latin-square order with calib → 8 phrases → TLX per condition', () => {
  const steps = buildSteps('BCAD');
  const mains = steps.filter(s => s.type === 'typing' && s.phase === 'main');
  assert.deepEqual(mains.map(s => s.cond), ['B', 'C', 'A', 'D']);
  assert.ok(mains.every(s => s.count === TRIALS_PER_COND));
  for (const cond of 'BCAD') {
    const types = steps.filter(s => s.cond === cond).map(s => s.type);
    assert.deepEqual(types.slice(0, 4), ['hand', 'calib', 'typing', 'tlx']);
  }
  assert.equal(steps.filter(s => s.type === 'rest').length, 3);
  assert.equal(steps[0].type, 'intro');
  assert.equal(steps.at(-1).type, 'results');
});

test('every condition is calibrated with its own model key (조건별 보정)', () => {
  for (const order of LATIN_SQUARE) {
    const calibs = buildSteps(order).filter(s => s.type === 'calib' && s.phase === 'calib');
    assert.deepEqual(calibs.map(s => s.modelKey), [...order]);
    for (const s of calibs) assert.equal(s.hand, CONDITIONS[s.cond].hand);
  }
});

test('X/Y labels are blind and consistent', () => {
  const steps = buildSteps('ABDC', 'baseline');
  for (const s of steps.filter(s => s.kbLabel)) assert.equal(s.kbLabel, s.keyboard === 'baseline' ? 'X' : 'Y');
  assert.deepEqual(steps.filter(s => s.type === 'sus').map(s => s.kbLabel), ['X', 'Y']);
});

test('SUS scoring', () => {
  assert.equal(susScore([5, 1, 5, 1, 5, 1, 5, 1, 5, 1]), 100);
  assert.equal(susScore([1, 5, 1, 5, 1, 5, 1, 5, 1, 5]), 0);
  assert.equal(susScore([3, 3, 3, 3, 3, 3, 3, 3, 3, 3]), 50);
  assert.equal(susScore([3, 3]), null);
});

test('raw TLX is the mean of six items', () => {
  assert.equal(tlxRaw([0, 10, 20, 30, 40, 50]), 25);
  assert.equal(tlxRaw([0, 10, null, 30, 40, 50]), null);
});
