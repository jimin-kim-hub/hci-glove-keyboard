// geometry.js — hit testing, nearest key, neighbor table (판정용 기하 함수, DOM 없음)
import { KEYS, NEIGHBOR_MAX_DIST } from './config.js';

export const KEY_BY_ID = Object.fromEntries(KEYS.map(k => [k.id, k]));

export function charToKeyId(ch) {
  if (ch === ' ') return 'space';
  return KEY_BY_ID[ch] && KEY_BY_ID[ch].kind === 'char' ? ch : null;
}

export function keyIdToChar(id) {
  if (id === 'space') return ' ';
  const k = KEY_BY_ID[id];
  return k && k.kind === 'char' ? id : null;
}

// Distance from point to rectangle (0 if inside)
export function pointRectDist(p, k) {
  const dx = Math.max(k.x - p.x, 0, p.x - (k.x + k.w));
  const dy = Math.max(k.y - p.y, 0, p.y - (k.y + k.h));
  return Math.hypot(dx, dy);
}

// Minimum distance between two rectangles
export function rectRectDist(a, b) {
  const dx = Math.max(a.x - (b.x + b.w), 0, b.x - (a.x + a.w));
  const dy = Math.max(a.y - (b.y + b.h), 0, b.y - (a.y + a.h));
  return Math.hypot(dx, dy);
}

export function rectHit(p, keys = KEYS) {
  for (const k of keys) {
    if (p.x >= k.x && p.x <= k.x + k.w && p.y >= k.y && p.y <= k.y + k.h) return k.id;
  }
  return null;
}

export function nearestKey(p, keys = KEYS) {
  let best = null, bestD = Infinity;
  for (const k of keys) {
    const d = pointRectDist(p, k);
    if (d < bestD) { bestD = d; best = k.id; }
  }
  return { id: best, dist: bestD };
}

// Rect hit, else nearest rectangle (최근접 폴백)
export function hitOrNearest(p, keys = KEYS) {
  return rectHit(p, keys) ?? nearestKey(p, keys).id;
}

function buildNeighbors() {
  const table = {};
  for (const a of KEYS) {
    table[a.id] = KEYS.filter(b => b.id !== a.id && rectRectDist(a, b) <= NEIGHBOR_MAX_DIST + 1e-9).map(b => b.id);
  }
  return table;
}

export const NEIGHBORS = buildNeighbors();

export function isNeighbor(a, b) {
  return !!(a && b && NEIGHBORS[a] && NEIGHBORS[a].includes(b));
}
