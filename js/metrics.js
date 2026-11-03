// metrics.js — WPM, MSD, neighbor-key errors (지표 계산, 순수 함수)
// NOTE: these are for live display only. Analysis recomputes from raw logs (계획 PDF B7).
import { charToKeyId, isNeighbor } from './geometry.js';

// Minimum string distance (Levenshtein, 최소 문자열 거리)
export function msd(a, b) {
  const m = a.length, n = b.length;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[n];
}

// MSD error rate (%) = MSD / max(|P|, |T|) * 100
export function msdErrorRate(presented, transcribed) {
  const denom = Math.max(presented.length, transcribed.length);
  return denom === 0 ? 0 : (msd(presented, transcribed) / denom) * 100;
}

// WPM = (|T| - 1) / S * 60 / 5
export function wpm(transcribed, seconds) {
  if (seconds <= 0 || transcribed.length < 2) return 0;
  return ((transcribed.length - 1) / seconds) * 12;
}

// Intended key = presented char at the current cursor position (위치 기반 근사)
export function intendedKeyAt(presented, textLen) {
  return textLen < presented.length ? charToKeyId(presented[textLen]) : null;
}

// Classify one non-backspace keystroke
export function classifyKeystroke(intended, decoded) {
  if (!intended || decoded === 'backspace') return { isError: false, isNeighborError: false };
  const isError = decoded !== intended;
  return { isError, isNeighborError: isError && isNeighbor(intended, decoded) };
}

// keystrokes: [{decoded, intended}] for one or more trials
export function summarizeKeystrokes(keystrokes) {
  const bs = keystrokes.filter(k => k.decoded === 'backspace').length;
  const nonBs = keystrokes.filter(k => k.decoded !== 'backspace');
  let err = 0, nbr = 0;
  for (const k of nonBs) {
    const c = classifyKeystroke(k.intended, k.decoded);
    if (c.isError) err++;
    if (c.isNeighborError) nbr++;
  }
  const n = nonBs.length;
  return {
    keystrokes: keystrokes.length,
    backspaces: bs,
    backspaceRate: keystrokes.length ? bs / keystrokes.length : 0,
    keyErrorRate: n ? err / n : 0,
    neighborErrorRate: n ? nbr / n : 0,
  };
}
