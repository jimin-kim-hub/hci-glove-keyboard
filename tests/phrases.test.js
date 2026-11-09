import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { setStats, phraseFeatures } from '../js/phrasestats.js';
import { TRIALS_PER_COND, PRACTICE_PER_KEYBOARD } from '../js/steps.js';

const P = JSON.parse(readFileSync(new URL('../data/phrases.json', import.meta.url), 'utf8'));

test('four sets of 8 different phrases, plus 6 practice phrases (조건마다 다른 문장)', () => {
  assert.equal(P.sets.length, 4);
  for (const s of P.sets) assert.equal(s.length, TRIALS_PER_COND);
  assert.equal(P.practice.length, 2 * PRACTICE_PER_KEYBOARD);
  const all = [...P.practice, ...P.sets.flat()];
  assert.equal(new Set(all).size, all.length, 'no phrase is repeated');
  for (const p of all) assert.match(p, /^[a-z]+( [a-z]+)*$/);
});

test('k-th phrases of all sets have the same length; set means are close (길이·난이도 맞춤)', () => {
  for (let k = 0; k < TRIALS_PER_COND; k++) {
    assert.equal(new Set(P.sets.map(s => s[k].length)).size, 1, `position ${k}`);
  }
  const st = P.sets.map(setStats);
  const range = key => Math.max(...st.map(s => s[key])) - Math.min(...st.map(s => s[key]));
  assert.equal(range('len'), 0);
  assert.ok(range('words') <= 0.5, 'within 4 words over 8 phrases');
  assert.ok(range('rarity') < 0.05);
  assert.ok(range('travel') < 0.05);
  assert.ok(phraseFeatures('the quick').travel > 0);
});
