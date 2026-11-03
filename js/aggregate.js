// aggregate.js — merge logs from many sessions/devices and summarize per participant × condition
// (참가자별 종합, 순수 함수). Live summary only — the analysis scripts recompute from raw logs.
import { summarizeKeystrokes } from './metrics.js';

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
  return { calibrated: false, model: null, sim: false, trials: 0, wpmSum: 0, keys: [], keysBase: [], keysCal: [] };
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
    if (e.ev === 'model_fit') { c.calibrated = true; c.model = e.model; c.sim = c.sim || !!e.sim; }
    if (e.ev === 'trial_end' && e.phase === 'main') { c.trials++; c.wpmSum += e.live?.wpm ?? 0; }
    if (e.ev === 'touch' && e.phase === 'main' && e.keyShown !== 'shift') {
      c.keys.push({ decoded: e.keyShown, intended: e.intended });
      c.keysBase.push({ decoded: e.keyBase, intended: e.intended });
      if (e.keyCal) c.keysCal.push({ decoded: e.keyCal, intended: e.intended });
      if (e.sim) c.sim = true;
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
