// Unit tests — run with: node --test tests/
import test from 'node:test';
import assert from 'node:assert/strict';
import { KEYS, CALIB, SIM_PRESETS } from '../js/config.js';
import { KEY_BY_ID, rectHit, hitOrNearest, NEIGHBORS, isNeighbor, charToKeyId } from '../js/geometry.js';
import { decodeBaseline, decodeCalibrated, fitCalibration, fitM0, fitM1, residuals, offsetAt, correctPoint } from '../js/decoder.js';
import { msd, msdErrorRate, wpm, intendedKeyAt, classifyKeystroke, summarizeKeystrokes, alignTrial } from '../js/metrics.js';
import { simulateCalibration, simulateTouch, mulberry32 } from '../js/simulate.js';

const center = id => ({ x: KEY_BY_ID[id].cx, y: KEY_BY_ID[id].cy });

// ---------- geometry ----------
test('every key center hits its own key', () => {
  for (const k of KEYS) assert.equal(rectHit({ x: k.cx, y: k.cy }), k.id);
});

test('keys do not overlap', () => {
  for (const a of KEYS) for (const b of KEYS) {
    if (a === b) continue;
    const overlap = a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
    assert.equal(overlap, false, `${a.id} overlaps ${b.id}`);
  }
});

test('gap between keys falls back to nearest rectangle', () => {
  const q = KEY_BY_ID.q, w = KEY_BY_ID.w;
  const gapX = (q.x + q.w + w.x) / 2;
  assert.equal(rectHit({ x: gapX, y: q.cy }), null);
  assert.ok(['q', 'w'].includes(hitOrNearest({ x: gapX, y: q.cy })));
  assert.equal(hitOrNearest({ x: -5, y: q.cy }), 'q'); // far left of keyboard
});

test('neighbor table (≤ 0.5 key width) is symmetric and frozen to expected pairs', () => {
  for (const [a, ns] of Object.entries(NEIGHBORS)) for (const b of ns) assert.ok(NEIGHBORS[b].includes(a), `${a}-${b}`);
  assert.deepEqual([...NEIGHBORS.q].sort(), ['a', 'w']);
  assert.deepEqual([...NEIGHBORS.e].sort(), ['d', 'r', 's', 'w']);
  assert.deepEqual([...NEIGHBORS.g].sort(), ['b', 'c', 'f', 'h', 't', 'v', 'y']);
  assert.ok(isNeighbor('w', 'e'));
  assert.ok(!isNeighbor('q', 's'));
  assert.ok(!isNeighbor('a', 'l'));
});

test('char <-> key id', () => {
  assert.equal(charToKeyId(' '), 'space');
  assert.equal(charToKeyId('x'), 'x');
  assert.equal(charToKeyId('X'), null);
});

// ---------- decoder ----------
test('baseline decodes touch as-is', () => {
  assert.equal(decodeBaseline(center('w')), 'w');
  const shifted = { x: center('w').x + 0.7, y: center('w').y };
  assert.equal(decodeBaseline(shifted), 'e');
});

test('M0 learns a constant offset and corrects the "w→e" case', () => {
  const taps = [...'qwertyuiopasdfghjklzxcvbnm'].map(id => ({ x: center(id).x + 0.4, y: center(id).y + 0.2, target: id }));
  const m = fitM0(residuals(taps));
  assert.ok(Math.abs(m.ox - 0.4) < 1e-9 && Math.abs(m.oy - 0.2) < 1e-9);
  const touch = { x: center('w').x + 0.7, y: center('w').y + 0.2 }; // baseline says e
  assert.equal(decodeBaseline(touch), 'e');
  assert.equal(decodeCalibrated(m, touch).key, 'w');
});

test('M1 recovers a linear position-dependent offset', () => {
  const ids = [...'qwertyuiopasdfghjklzxcvbnm'];
  const f = (c) => ({ x: 0.1 + 0.05 * (c.x - 5), y: 0.2 - 0.03 * (c.y - 2) });
  const taps = ids.map(id => { const c = center(id), o = f(c); return { x: c.x + o.x, y: c.y + o.y, target: id }; });
  const m = fitM1(residuals(taps), 1e-6);
  for (const id of ['q', 'g', 'm']) {
    const c = center(id), o = offsetAt(m, c), want = f(c);
    assert.ok(Math.abs(o.x - want.x) < 1e-3 && Math.abs(o.y - want.y) < 1e-3, id);
  }
  // Fixed-point decode lands close to the key center
  const p = center('p'), o = f(p), q = correctPoint(m, { x: p.x + o.x, y: p.y + o.y });
  assert.ok(Math.hypot(q.x - p.x, q.y - p.y) < 0.01);
});

test('fitCalibration falls back to M0 with too few taps', () => {
  const taps = [...'qwert'].map(id => ({ ...center(id), target: id }));
  const { model, report } = fitCalibration(taps);
  assert.equal(model.type, 'M0');
  assert.equal(report.chosen, 'M0');
});

test('fitCalibration drops outliers (|d| > 1.5 pitch)', () => {
  const taps = simulateCalibration({ mx: 0, my: 0, sd: 0.05, slope: 0 }, 3);
  taps[0] = { x: taps[0].x + 3, y: taps[0].y, target: taps[0].target };
  const { report } = fitCalibration(taps);
  assert.equal(report.nTotal, CALIB.phrase.length);
  assert.equal(report.nOutliers, 1);
});

test('model is frozen after fitting (정답 누수 방지)', () => {
  const { model } = fitCalibration(simulateCalibration(SIM_PRESETS.glove, 5));
  assert.ok(Object.isFrozen(model));
});

test('calibration pangram has 43 taps', () => {
  assert.equal(CALIB.phrase.length, 43);
});

// ---------- metrics ----------
test('MSD and MSD error rate', () => {
  assert.equal(msd('quickly', 'qucehkly'), 3);
  assert.equal(msd('abc', 'abc'), 0);
  assert.equal(msdErrorRate('abcd', 'abxd'), 25);
});

test('WPM = (|T|-1)/S*60/5', () => {
  assert.equal(wpm('a'.repeat(31), 30), 12); // 30 chars in 30 s -> 12 wpm
  assert.equal(wpm('a', 10), 0);
});

test('intended key and neighbor classification', () => {
  assert.equal(intendedKeyAt('the dog', 3), 'space');
  assert.equal(intendedKeyAt('the', 3), null);
  assert.deepEqual(classifyKeystroke('w', 'e'), { isError: true, isNeighborError: true });
  assert.deepEqual(classifyKeystroke('w', 'p'), { isError: true, isNeighborError: false });
  assert.deepEqual(classifyKeystroke('w', 'w'), { isError: false, isNeighborError: false });
  const s = summarizeKeystrokes([
    { intended: 'w', decoded: 'e' }, { intended: 'w', decoded: 'backspace' },
    { intended: 'w', decoded: 'w' }, { intended: 'h', decoded: 'p' },
  ]);
  assert.equal(s.backspaces, 1);
  assert.ok(Math.abs(s.neighborErrorRate - 1 / 3) < 1e-9);
  assert.ok(Math.abs(s.keyErrorRate - 2 / 3) < 1e-9);
});

// ---------- simulation test (합성 데이터) ----------
test('SIMULATION: calibration reduces key errors under synthetic glove offset', () => {
  const params = SIM_PRESETS.glove;
  let baseErr = 0, calErr = 0, n = 0;
  for (let seed = 1; seed <= 30; seed++) {
    const { model } = fitCalibration(simulateCalibration(params, seed));
    const rng = mulberry32(1000 + seed);
    for (const id of 'qwertyuiopasdfghjklzxcvbnm') {
      for (let r = 0; r < 4; r++) {
        const touch = simulateTouch(center(id), params, rng);
        if (decodeBaseline(touch) !== id) baseErr++;
        if (decodeCalibrated(model, touch).key !== id) calErr++;
        n++;
      }
    }
  }
  const b = baseErr / n, c = calErr / n;
  console.log(`  [sim glove] baseline error ${(b * 100).toFixed(1)}% -> calibrated ${(c * 100).toFixed(1)}% (n=${n})`);
  assert.ok(c < b * 0.8, `expected calibrated (${c}) clearly below baseline (${b})`);
});

test('SIMULATION: with no offset, calibration does not hurt much', () => {
  const params = { mx: 0, my: 0, sd: 0.2, slope: 0 };
  let baseErr = 0, calErr = 0, n = 0;
  for (let seed = 1; seed <= 30; seed++) {
    const { model } = fitCalibration(simulateCalibration(params, seed));
    const rng = mulberry32(2000 + seed);
    for (const id of 'qwertyuiopasdfghjklzxcvbnm') {
      const touch = simulateTouch(center(id), params, rng);
      if (decodeBaseline(touch) !== id) baseErr++;
      if (decodeCalibrated(model, touch).key !== id) calErr++;
      n++;
    }
  }
  console.log(`  [sim no-offset] baseline ${(baseErr / n * 100).toFixed(1)}% vs calibrated ${(calErr / n * 100).toFixed(1)}%`);
  assert.ok(calErr / n <= baseErr / n + 0.03);
});

test('model policy fixes M0 or M1 for everyone and always returns both models (모델 고정)', () => {
  const taps = simulateCalibration(SIM_PRESETS.glove, 7);
  const auto = fitCalibration(taps);
  assert.equal(auto.report.chosen, auto.report.auto);
  for (const policy of ['M0', 'M1']) {
    const r = fitCalibration(taps, policy);
    assert.equal(r.model.type, policy);
    assert.equal(r.report.chosen, policy);
    assert.equal(r.report.auto, auto.report.auto); // what auto would have picked is still reported
    assert.equal(r.alt.M0.type, 'M0');
    assert.equal(r.alt.M1.type, 'M1');
  }
  // too few taps: M1 policy falls back to M0
  const few = fitCalibration(taps.slice(0, 8), 'M1');
  assert.equal(few.model.type, 'M0');
  assert.equal(few.alt.M1, null);
});

test('space taps are collected but left out of model fitting (pilot 11/12)', () => {
  // letters: no offset. space: tapped far right of its center (+1.3 key) — must not shift the model
  const letters = 'qwertyuiopasdfghjklzxcvbnm'.split('').map(id => ({ target: id, x: KEY_BY_ID[id].cx, y: KEY_BY_ID[id].cy }));
  const spaces = Array.from({ length: 8 }, () => ({ target: 'space', x: KEY_BY_ID.space.cx + 1.3, y: KEY_BY_ID.space.cy }));
  const { model, report } = fitCalibration([...letters, ...spaces], 'M0');
  assert.equal(report.nExcluded, 8);
  assert.equal(report.nUsed, 26);
  assert.ok(Math.abs(model.ox) < 1e-9 && Math.abs(model.oy) < 1e-9);
});

test('alignTrial: omissions, substitutions and erased keystrokes get the right intended key (정렬 기반 의도 키)', () => {
  const k = ids => ids.map(decoded => ({ decoded }));
  // lost tap: "so ot" for "do not" → s is a substitution of d, n is omitted, the rest are correct
  let a = alignTrial('do not', k(['s', 'o', 'space', 'o', 't']));
  assert.deepEqual(a.strokes.map(s => s.intended), ['d', 'o', 'space', 'o', 't']);
  assert.equal(a.omissions, 1);
  assert.equal(a.substitutions, 1);
  // erased error: "w" typed for "e", backspace, then "e" → the erased w was intended as e
  a = alignTrial('he', k(['h', 'w', 'backspace', 'e']));
  assert.deepEqual(a.strokes.map(s => s.intended), ['h', 'e', null, 'e']);
  assert.equal(a.omissions, 0);
  assert.equal(summarizeKeystrokes(a.strokes).keyErrorRate, 1 / 3);
});
