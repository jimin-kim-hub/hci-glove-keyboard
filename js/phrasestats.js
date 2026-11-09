// phrasestats.js — length/difficulty features of a phrase (문장 길이·난이도 특징, 순수 함수)
// Used by tools/make_sets.mjs to build matched phrase sets and by tests to check them.
import { KEYS } from './config.js';

// English letter frequencies in % (Lewand 2000, as commonly tabulated) — rarer letters are harder to find
const FREQ = {
  e: 12.70, t: 9.06, a: 8.17, o: 7.51, i: 6.97, n: 6.75, s: 6.33, h: 6.09, r: 5.99, d: 4.25, l: 4.03, c: 2.78, u: 2.76,
  m: 2.41, w: 2.36, f: 2.23, g: 2.02, y: 1.97, p: 1.93, b: 1.29, v: 0.98, k: 0.77, j: 0.15, x: 0.15, q: 0.10, z: 0.07,
};
const CENTER = Object.fromEntries(KEYS.map(k => [k.id, { x: k.cx, y: k.cy }]));
const keyOf = ch => (ch === ' ' ? 'space' : ch);

// len: characters incl. spaces · words · awl: mean word length
// rarity: mean letter surprisal −log2(p) in bits (높을수록 드문 글자)
// travel: mean distance between consecutive key centers in key units (높을수록 손가락 이동이 큼)
export function phraseFeatures(p) {
  const letters = [...p].filter(c => c !== ' ');
  const words = p.split(' ').filter(Boolean);
  let travel = 0;
  for (let i = 1; i < p.length; i++) {
    const a = CENTER[keyOf(p[i - 1])], b = CENTER[keyOf(p[i])];
    travel += Math.hypot(a.x - b.x, a.y - b.y);
  }
  return {
    len: p.length,
    words: words.length,
    awl: letters.length / words.length,
    rarity: letters.reduce((s, c) => s - Math.log2(FREQ[c] / 100), 0) / letters.length,
    travel: travel / (p.length - 1),
  };
}

export const FEATURE_NAMES = ['len', 'words', 'awl', 'rarity', 'travel'];

export function setStats(set) {
  const fs = set.map(phraseFeatures);
  return Object.fromEntries(FEATURE_NAMES.map(k => [k, fs.reduce((s, f) => s + f[k], 0) / fs.length]));
}
