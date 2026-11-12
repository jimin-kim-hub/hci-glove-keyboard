// participant.js — one participant's results from raw events, and a CSV of them (참가자별 결과, 순수 함수)
// Live check only — the analysis scripts recompute from raw logs.
import { CONDITIONS } from './config.js';
import { KEY_BY_ID } from './geometry.js';
import { summarizeParticipants } from './aggregate.js';

const median = (xs) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b), m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

// Typical miss of the calibration taps: touch − key center, in key units (보정 탭의 어긋남)
function calibOffset(taps) {
  const ds = taps.filter(t => KEY_BY_ID[t.target] && t.ux != null)
    .map(t => ({ dx: t.ux - KEY_BY_ID[t.target].cx, dy: t.uy - KEY_BY_ID[t.target].cy }));
  if (!ds.length) return null;
  return {
    n: ds.length,
    dx: median(ds.map(d => d.dx)),
    dy: median(ds.map(d => d.dy)),
    dist: median(ds.map(d => Math.hypot(d.dx, d.dy))),
  };
}

export function participantDetail(events, pid) {
  const mine = events.filter(e => e.pid === pid);
  const last = (ev, f = () => true) => mine.filter(e => e.ev === ev && f(e)).at(-1) ?? null;
  const sum = summarizeParticipants(mine)[0];
  const conds = Object.keys(CONDITIONS).map((cond) => {
    const inCond = e => e.cond === cond;
    let taps = [];
    for (const e of mine) {
      if (e.ev !== 'calib_tap' || e.cond !== cond) continue;
      if (e.i === 0) taps = []; // a restarted calibration replaces the earlier one
      taps.push(e);
    }
    const fit = last('model_fit', inCond);
    const survey = last('survey', inCond);
    const starts = mine.filter(e => e.ev === 'typing_start' && e.phase === 'main' && e.cond === cond).length;
    return {
      cond, ...CONDITIONS[cond], ...(sum?.conds[cond] ?? { trials: 0, wpm: null, shown: null, base: null, cal: null, sim: false }),
      restarts: Math.max(0, starts - 1),
      offset: calibOffset(taps),
      fit: fit && { model: fit.model, baselineAcc: fit.baseline_acc ?? null, looAcc: fit.loo_acc ?? null, seconds: fit.durationS ?? null, reason: fit.reason ?? '' },
      tlx: survey?.tlxRaw ?? null,
      sus: last('sus', inCond)?.score ?? null,
      discomfort: survey?.discomfort ?? null,
    };
  });
  // v0.9+: one preference event per hand state ({hand, keyboard}); older logs: one event with gloveKeyboard/bareKeyboard
  const prefOld = last('preference', e => !e.hand);
  const prefOf = hand => last('preference', e => e.hand === hand)?.keyboard ?? prefOld?.[`${hand}Keyboard`] ?? null;
  const hasPref = mine.some(e => e.ev === 'preference');
  const demo = last('demographics');
  return {
    pid,
    order: last('participant_start')?.order ?? null,
    finished: !!last('participant_end'),
    sim: mine.some(e => e.sim === true),
    touches: mine.filter(e => e.ev === 'touch').length,
    conds,
    // SUS per keyboard = mean over its two conditions (v0.7+); older logs had one SUS per keyboard at the end
    sus: Object.fromEntries(['calibrated', 'baseline'].map(kb => {
      const xs = conds.filter(c => c.keyboard === kb && c.sus != null).map(c => c.sus);
      return [kb, xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : last('sus', e => e.keyboard === kb && !e.cond)?.score ?? null];
    })),
    preference: hasPref ? { glove: prefOf('glove'), bare: prefOf('bare') } : null,
    demographics: demo && { age: demo.age, hand: demo.hand, englishFreq: demo.englishFreq, style: demo.style, glove: demo.glove },
  };
}

const CSV_COLUMNS = [
  'pid', 'cond', 'keyboard', 'hand', 'trials', 'restarts', 'accuracy', 'key_error_rate', 'neighbor_error_rate', 'wpm', 'backspaces',
  'shadow_base_neighbor_error_rate', 'shadow_cal_neighbor_error_rate', 'calib_model', 'calib_baseline_acc', 'calib_loo_acc', 'calib_seconds',
  'calib_offset_dx', 'calib_offset_dy', 'tlx_raw', 'discomfort', 'sus', 'pref_glove', 'pref_bare', 'age', 'main_hand', 'english_freq', 'typing_style', 'glove_type', 'includes_simulation',
];
const num = (v, d = 4) => (v == null ? '' : +v.toFixed(d));

export function detailToCsv(d) {
  const rows = d.conds.map(c => [
    d.pid, c.cond, c.keyboard, c.hand, c.trials, c.restarts,
    c.shown ? num(1 - c.shown.keyErrorRate) : '', num(c.shown?.keyErrorRate), num(c.shown?.neighborErrorRate), num(c.wpm, 2), c.shown?.backspaces ?? '',
    num(c.base?.neighborErrorRate), num(c.cal?.neighborErrorRate), c.fit?.model ?? '', num(c.fit?.baselineAcc), num(c.fit?.looAcc), num(c.fit?.seconds, 1),
    num(c.offset?.dx, 3), num(c.offset?.dy, 3), num(c.tlx, 1), c.discomfort ?? '', c.sus ?? d.sus[c.keyboard] ?? '',
    d.preference?.glove ?? '', d.preference?.bare ?? '',
    d.demographics?.age ?? '', d.demographics?.hand ?? '', d.demographics?.englishFreq ?? '', d.demographics?.style ?? '', d.demographics?.glove ?? '',
    d.sim ? 1 : 0,
  ].join(','));
  return [CSV_COLUMNS.join(','), ...rows].join('\n') + '\n';
}
