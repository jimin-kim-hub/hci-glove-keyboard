import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSteps, TRIALS_PER_COND } from '../js/steps.js';
import { susScore, tlxRaw } from '../js/surveys.js';
import { LATIN_SQUARE, CONDITIONS } from '../js/config.js';

test('steps follow the Latin-square order with calib → 8 phrases → TLX → SUS per condition', () => {
  const steps = buildSteps('BCAD');
  const mains = steps.filter(s => s.type === 'typing' && s.phase === 'main');
  assert.deepEqual(mains.map(s => s.cond), ['B', 'C', 'A', 'D']);
  assert.ok(mains.every(s => s.count === TRIALS_PER_COND));
  for (const cond of 'BCAD') {
    const types = steps.filter(s => s.cond === cond).map(s => s.type);
    assert.deepEqual(types.slice(0, 5), ['hand', 'calib', 'typing', 'tlx', 'sus']);
  }
  assert.equal(steps.filter(s => s.type === 'rest').length, 3);
  assert.equal(steps[0].type, 'intro');
  assert.equal(steps[1].type, 'demo'); // background questions right after consent
  assert.equal(steps.length, 33);
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
  const sus = steps.filter(s => s.type === 'sus');
  assert.equal(sus.length, 4); // one SUS per condition, right after it
  for (const s of sus) assert.equal(s.kbLabel, s.keyboard === 'baseline' ? 'X' : 'Y');
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

test('X vs Y is asked per hand state right after both keyboards were used in it', () => {
  for (const order of ['ABDC', 'BCAD', 'CDBA', 'DACB']) {
    const steps = buildSteps(order);
    const prefs = steps.map((s, i) => [s, i]).filter(([s]) => s.type === 'pref');
    assert.equal(prefs.length, 2, order);
    assert.deepEqual(prefs.map(([s]) => s.hand).sort(), ['bare', 'glove']);
    for (const [p, i] of prefs) {
      assert.equal(steps[i - 1].type, 'sus'); // straight after the 2nd condition's SUS
      assert.equal(steps[i - 1].hand, p.hand);
      assert.deepEqual(p.blocks.map(b => b.kbLabel).sort(), ['X', 'Y']);
      const done = steps.slice(0, i).filter(s => s.type === 'typing' && s.phase === 'main' && s.hand === p.hand);
      assert.equal(done.length, 2);
    }
  }
});

test('experiment settings are fixed and match the frozen model policy (실험 설정 고정)', async () => {
  const { EXPERIMENT_SETTINGS, DEFAULT_MODEL_POLICY } = await import('../js/config.js');
  assert.ok(Object.isFrozen(EXPERIMENT_SETTINGS));
  assert.deepEqual(EXPERIMENT_SETTINGS, { mode: 'touch', xIs: 'calibrated', modelPolicy: DEFAULT_MODEL_POLICY });
});
