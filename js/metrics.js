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

// ---- Alignment-based intended keys (정렬 기반 의도 키, v0.11.0) ----
// The cursor rule above breaks when a tap is lost (e.g. a glove fails to register it): every later key is
// compared with the wrong target. Here the final text is aligned to the presented phrase (minimum edit
// distance), and each keystroke's intended key is the phrase character aligned to its text position.
// Erased keystrokes get the target of the final character at the same position.
// (장갑이 탭을 놓쳐 글자가 빠지면 커서 규칙은 뒤를 전부 오류로 셈 → 목표 문장과 입력을 정렬해 의도 키를 정함)
//
// strokes: [{decoded, ...}] in order (backspace included, shift excluded)
// returns { strokes: [{...s, intended}], omissions, insertions, substitutions, chars, typed }
export function alignTrial(presented, strokes) {
  const buf = [];
  const pos = strokes.map((s) => {
    if (s.decoded === 'backspace') { buf.pop(); return -1; }
    buf.push(s.decoded === 'space' ? ' ' : s.decoded);
    return buf.length - 1;
  });
  const typed = buf.join('');
  const P = presented, T = typed, n = P.length, m = T.length;
  const d = Array.from({ length: n + 1 }, (_, i) => { const r = new Array(m + 1).fill(0); r[0] = i; return r; });
  for (let j = 0; j <= m; j++) d[0][j] = j;
  for (let i = 1; i <= n; i++) for (let j = 1; j <= m; j++) {
    d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (P[i - 1] === T[j - 1] ? 0 : 1));
  }
  const map = new Array(m).fill(-1); // typed index → presented index (-1 = inserted char)
  let i = n, j = m, omissions = 0, insertions = 0, substitutions = 0;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && d[i][j] === d[i - 1][j - 1] + (P[i - 1] === T[j - 1] ? 0 : 1)) {
      map[j - 1] = i - 1; if (P[i - 1] !== T[j - 1]) substitutions++; i--; j--;
    } else if (i > 0 && d[i][j] === d[i - 1][j] + 1) { omissions++; i--; }
    else { insertions++; j--; }
  }
  // Positions beyond the final text (erased tail): continue with the last known shift
  const shift = m ? map[m - 1] - (m - 1) : 0;
  const target = (p) => {
    if (p < 0) return null;
    const pi = p < m ? map[p] : p + shift;
    return pi >= 0 && pi < n ? charToKeyId(P[pi]) : null;
  };
  return {
    strokes: strokes.map((s, k) => ({ ...s, intended: s.decoded === 'backspace' ? null : target(pos[k]) })),
    omissions, insertions, substitutions, chars: n, typed,
  };
}
