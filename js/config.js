// config.js — single source of truth for geometry and parameters (기하·파라미터의 단일 출처)
// All geometry is in "key units" (u): 1 u = horizontal key pitch (키 간격).
// Rendering and decoding both read from here, so they can never disagree.

export const APP_VERSION = '0.2.0';

// --- Key geometry (키 기하) -------------------------------------------------
export const GEOM = {
  pitchX: 1.0,      // horizontal key pitch (u)
  keyW: 0.88,       // letter key width (u) -> horizontal gap 0.12 u
  pitchY: 1.45,     // row pitch (u)
  keyH: 1.25,       // key height (u) -> vertical gap 0.20 u
  cols: 10,         // keyboard width in u
  rows: 4,
};

const ROWS = [
  { y: 0, x0: 0.0, keys: 'qwertyuiop' },
  { y: 1, x0: 0.5, keys: 'asdfghjkl' },
  { y: 2, x0: 1.5, keys: 'zxcvbnm' },
];

function buildKeys() {
  const { pitchX, keyW, pitchY, keyH } = GEOM;
  const gx = (pitchX - keyW) / 2;
  const gy = (pitchY - keyH) / 2;
  const keys = [];
  for (const row of ROWS) {
    [...row.keys].forEach((ch, i) => {
      keys.push({ id: ch, label: ch, kind: 'char', x: row.x0 + i * pitchX + gx, y: row.y * pitchY + gy, w: keyW, h: keyH });
    });
  }
  // Row 3 extras: inactive shift (비활성 shift) and backspace
  keys.push({ id: 'shift', label: '⇧', kind: 'shift', x: gx, y: 2 * pitchY + gy, w: 1.5 - 2 * gx, h: keyH });
  keys.push({ id: 'backspace', label: '⌫', kind: 'backspace', x: 8.5 + gx, y: 2 * pitchY + gy, w: 1.5 - 2 * gx, h: keyH });
  // Row 4: space spans c..m columns (2.5 – 7.5 u)
  keys.push({ id: 'space', label: 'space', kind: 'space', x: 2.5 + gx, y: 3 * pitchY + gy, w: 5 - 2 * gx, h: keyH });
  for (const k of keys) { k.cx = k.x + k.w / 2; k.cy = k.y + k.h / 2; }
  return keys;
}

export const KEYS = buildKeys();
export const KEYBOARD_SIZE = { w: GEOM.cols * GEOM.pitchX, h: GEOM.rows * GEOM.pitchY };

// Edge-gesture margin in CSS px on each side (가장자리 제스처 여백)
export const EDGE_MARGIN_PX = 14;

// --- Calibration (보정) ---------------------------------------------------------
export const CALIB = {
  phrase: 'the quick brown fox jumps over the lazy dog', // 43 taps incl. spaces
  outlierPitch: 1.5,     // drop taps with |d| > 1.5 pitch when fitting (계획 PDF B4)
  ignorePitch: 1.0,      // during collection, ignore taps >= 1 pitch from any key (B5)
  minTapsForM1: 15,      // fewer usable taps -> fall back to M0
  lambdas: [0.1, 1, 10], // ridge candidates for M1, chosen by LOO
  fixedPointIters: 2,    // M1 decode: p2 = p - f(p); p2 = p - f(p2)
};

// Neighbor rule: min distance between key rectangles <= 0.5 key width (A7)
export const NEIGHBOR_MAX_DIST = 0.5 * GEOM.keyW;

// --- Conditions (조건) -------------------------------------------------------
export const CONDITIONS = {
  A: { keyboard: 'baseline', hand: 'bare' },
  B: { keyboard: 'baseline', hand: 'glove' },
  C: { keyboard: 'calibrated', hand: 'bare' },
  D: { keyboard: 'calibrated', hand: 'glove' },
};
export const COND_INDEX = { A: 0, B: 1, C: 2, D: 3 };
// Balanced Latin square rows (균형 라틴 방격), group g = (p-1) mod 4
export const LATIN_SQUARE = ['ABDC', 'BCAD', 'CDBA', 'DACB'];

// --- Synthetic glove offset (합성 장갑 오프셋) — assumption, NOT real data -------
// Units: key widths. dx = mx + slope * (x - 5)/5 + N(0, sd); dy = my + N(0, sd)
export const SIM_PRESETS = {
  glove: { mx: 0.25, my: 0.30, sd: 0.35, slope: 0.15 },
  bare:  { mx: 0.05, my: 0.10, sd: 0.15, slope: 0.05 },
};

export const STORAGE_KEY = 'glovekb.log.v1';
export const SETTINGS_KEY = 'glovekb.settings.v1';
