// simulate.js — synthetic glove offset generator (합성 장갑 오프셋, 실제 데이터 아님)
import { GEOM, CALIB } from './config.js';
import { KEY_BY_ID, charToKeyId } from './geometry.js';

// Seeded PRNG so simulations are reproducible (재현 가능한 난수)
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function gaussian(rng) {
  let u = 0;
  while (u === 0) u = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rng());
}

// params in key widths: {mx, my, sd, slope}. Position-dependent part: thumbs drift
// differently on the left vs right half (dx grows with x).
export function simulateTouch(aim, params, rng) {
  const unit = GEOM.keyW;
  const half = GEOM.cols / 2;
  const dx = (params.mx + params.slope * (aim.x - half) / half) * unit + gaussian(rng) * params.sd * unit;
  const dy = params.my * unit + gaussian(rng) * params.sd * unit;
  return { x: aim.x + dx, y: aim.y + dy };
}

// Generate guided-tap calibration data for a phrase (aim = key center)
export function simulateCalibration(params, seed = 1, phrase = CALIB.phrase) {
  const rng = mulberry32(seed);
  return [...phrase].map(ch => {
    const target = charToKeyId(ch);
    const k = KEY_BY_ID[target];
    const p = simulateTouch({ x: k.cx, y: k.cy }, params, rng);
    return { x: p.x, y: p.y, target };
  });
}
