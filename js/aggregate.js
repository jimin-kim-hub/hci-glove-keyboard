// aggregate.js — merge logs from many sessions/devices and summarize per participant × condition
// (참가자별 종합, 순수 함수). Live summary only — the analysis scripts recompute from raw logs.
import { summarizeKeystrokes, alignTrial } from './metrics.js';

// Stable identity of an event: session id + per-session sequence number (n).
// Older events without n fall back to their full JSON text.
export function eventKey(e) {
  return e.n != null ? `${e.sid}|${e.n}` : JSON.stringify(e);
}

// Returns events from `incoming` that are not already in `existing`
export function newEvents(existing, incoming) {
  const seen = new Set(existing.map(eventKey));
  const out = [];
  for (const e of incoming) {
    const k = eventKey(e);
    if (!seen.has(k)) { seen.add(k); out.push(e); }
  }
  return out;
}

const CONDS = ['A', 'B', 'C', 'D'];

function emptyCond() {
  return { calibrated: false, model: null, sim: false, trials: 0, wpmSum: 0, keys: [], keysBase: [], keysCal: [], pending: [], omissions: 0, chars: 0 };
}

// Summary per participant: sessions, calibration state, main-phase metrics per condition
export function summarizeParticipants(events) {
  const P = new Map();
  const get = pid => {
    if (!P.has(pid)) P.set(pid, { pid, sessions: new Set(), lastT: '', conds: Object.fromEntries(CONDS.map(c => [c, emptyCond()])) });
    return P.get(pid);
  };
  for (const e of events) {
    if (!e.pid || e.pid === 'P00') continue; // P00 = demo/test, not a participant
    const p = get(e.pid);
    p.sessions.add(e.sid);
    if (e.wall && e.wall > p.lastT) p.lastT = e.wall;
    const c = p.conds[e.cond];
    if (!c) continue;
    // A restarted typing step (나가기·새로고침 후 재시작) replaces the earlier partial attempt
    if (e.ev === 'typing_start' && e.phase === 'main') Object.assign(c, { trials: 0, wpmSum: 0, keys: [], keysBase: [], keysCal: [], pending: [], omissions: 0, chars: 0 });
    if (e.ev === 'model_fit') { c.calibrated = true; c.model = e.model; c.sim = c.sim || !!e.sim; }
    if (e.ev === 'touch' && e.phase === 'main' && e.keyShown !== 'shift') {
      c.pending.push({ decoded: e.keyShown, base: e.keyBase, cal: e.keyCal ?? null });
      if (e.sim) c.sim = true;
    }
    if (e.ev === 'trial_end' && e.phase === 'main') {
      c.trials++; c.wpmSum += e.live?.wpm ?? 0;
      // Intended keys from aligning the phrase with what was typed (정렬 기반 의도 키)
      const a = alignTrial(e.phrase ?? '', c.pending);
      for (const k of a.strokes) {
        c.keys.push({ decoded: k.decoded, intended: k.intended });
        if (k.decoded !== 'backspace') {
          c.keysBase.push({ decoded: k.base, intended: k.intended });
          if (k.cal) c.keysCal.push({ decoded: k.cal, intended: k.intended });
        }
      }
      c.omissions += a.omissions; c.chars += a.chars;
      c.pending = [];
    }
  }
  return [...P.values()].sort((a, b) => a.pid.localeCompare(b.pid)).map(p => ({
    pid: p.pid,
    sessions: p.sessions.size,
    lastT: p.lastT,
    conds: Object.fromEntries(CONDS.map(k => {
      const c = p.conds[k];
      return [k, {
        calibrated: c.calibrated, model: c.model, sim: c.sim, trials: c.trials,
        wpm: c.trials ? c.wpmSum / c.trials : null,
        // Missed characters (taps that never registered, or skipped) / phrase characters (누락률)
        omissionRate: c.chars ? c.omissions / c.chars : null,
        shown: c.keys.length ? summarizeKeystrokes(c.keys) : null,
        // Shadow decodes on the same touches (섀도 로깅 재생, 화면 반영 효과는 빠짐)
        base: c.keysBase.length ? summarizeKeystrokes(c.keysBase) : null,
        cal: c.keysCal.length ? summarizeKeystrokes(c.keysCal) : null,
      }];
    })),
  }));
}

// Next free participant number, e.g. P01, P02 ... from known ids
export function nextParticipantId(pids) {
  const nums = pids.map(p => parseInt(String(p).replace(/\D/g, ''), 10)).filter(n => n > 0);
  const n = nums.length ? Math.max(...nums) + 1 : 1;
  return `P${String(n).padStart(2, '0')}`;
}
