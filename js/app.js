// app.js — state, input pipeline, screen switching (화면 전환·상태 관리)
import { CONDITIONS, LATIN_SQUARE, SIM_PRESETS, SETTINGS_KEY, APP_VERSION } from './config.js';
import { Keyboard } from './keyboard.js';
import { Logger } from './logger.js';
import { decodeBaseline, decodeCalibrated } from './decoder.js';
import { simulateTouch, mulberry32 } from './simulate.js';
import { createParticipantScreen } from './participants.js';
import { createDemoScreen } from './demo.js';
import { createCalibrationScreen } from './calibration.js';
import { createTrialScreen } from './trial.js';
import { createReplayScreen } from './replay.js';
import { createSettingsScreen } from './settings.js';

const MODELS_KEY = 'glovekb.models.v2';           // { pid: { cond: entry } }
const PARTICIPANTS_KEY = 'glovekb.participants.v1'; // { pid: { alias, created, order } } — this device only

const DEFAULT_SETTINGS = {
  pid: 'P00', cond: 'D', mode: 'sim', // 'touch' | 'sim'
  sim: { ...SIM_PRESETS.glove },
  blind: false, xIs: 'calibrated', showExp: true,
};

function load(key, fallback) {
  try { const v = JSON.parse(localStorage.getItem(key)); return v ?? fallback; } catch (e) { return fallback; }
}
function store(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* ignore */ }
}

const settings = { ...DEFAULT_SETTINGS, ...load(SETTINGS_KEY, {}) };
settings.sim = { ...DEFAULT_SETTINGS.sim, ...settings.sim };
const models = load(MODELS_KEY, {});
const participants = load(PARTICIPANTS_KEY, {});

const logger = new Logger();
const simSeed = Math.floor(Math.random() * 1e9);
const rng = mulberry32(simSeed);

// ---------- context shared with screens ----------
const ctx = {
  settings, models, participants, logger,
  saveSettings() { store(SETTINGS_KEY, settings); updateBadges(); },
  saveModels() { store(MODELS_KEY, models); updateBadges(); },
  saveParticipants() { store(PARTICIPANTS_KEY, participants); },
  cond() { return CONDITIONS[settings.cond]; },
  // Calibration entry of the current participant × condition (참가자 × 조건별 모델)
  entry(pid = settings.pid, cond = settings.cond) { return models[pid]?.[cond] ?? null; },
  setEntry(entry, pid = settings.pid, cond = settings.cond) {
    if (entry) (models[pid] ??= {})[cond] = entry;
    else if (models[pid]) delete models[pid][cond];
    ctx.saveModels();
  },
  model() { return ctx.entry()?.model ?? null; },
  simParams(hand = ctx.cond().hand) { return hand === 'glove' ? settings.sim : SIM_PRESETS.bare; },
  condLabel(cond = settings.cond) {
    const c = CONDITIONS[cond];
    const hand = c.hand === 'glove' ? '장갑' : '맨손';
    if (settings.blind) return `키보드 ${c.keyboard === settings.xIs ? 'X' : 'Y'} · ${hand}`;
    return `${cond} · ${c.keyboard === 'calibrated' ? '보정' : '기본'} 키보드 · ${hand}`;
  },
  pnum(pid = settings.pid) { return parseInt(String(pid).replace(/\D/g, ''), 10) || 0; },
  latinOrder(pid = settings.pid) {
    const n = ctx.pnum(pid);
    return n >= 1 ? LATIN_SQUARE[(n - 1) % 4] : null;
  },
  participantLabel(pid = settings.pid) {
    const alias = participants[pid]?.alias;
    return alias ? `${pid} (${alias})` : pid;
  },

  // Switch to a participant; the alias stays on this device and is never written to the log
  startParticipant(pid, alias) {
    const order = ctx.latinOrder(pid);
    if (!participants[pid]) participants[pid] = { alias: alias || '', created: new Date().toISOString(), order };
    else if (alias) participants[pid].alias = alias;
    ctx.saveParticipants();
    settings.pid = pid;
    if (order) settings.cond = order[0];
    ctx.saveSettings();
    logger.log('participant_start', { pid, order, group: order ? (ctx.pnum(pid) - 1) % 4 + 1 : null, cond: settings.cond, mode: settings.mode });
  },

  // Decode one touch with both decoders (섀도 로깅: 둘 다 계산, 하나만 화면에 반영)
  decode(touch) {
    const base = decodeBaseline(touch);
    const m = ctx.model();
    const cal = m ? decodeCalibrated(m, touch) : null;
    const useCal = ctx.cond().keyboard === 'calibrated' && !!cal;
    return { base, cal: cal?.key ?? null, corrected: cal?.corrected ?? null, shown: useCal ? cal.key : base, applied: useCal ? 'calibrated' : 'baseline' };
  },

  // Standard touch event (계획 PDF B7 스키마)
  logTouch(input, dec, extra = {}) {
    const u = ctx.kb.unitPx;
    const r1 = v => (v == null ? null : Math.round(v * 10) / 10);
    const r3 = v => (v == null ? null : Math.round(v * 1000) / 1000);
    return logger.log('touch', {
      pid: settings.pid, cond: settings.cond, type: 'down', tid: input.raw.tid, source: input.raw.source,
      x: r1(input.touch.x * u), y: r1(input.touch.y * u), ux: r3(input.touch.x), uy: r3(input.touch.y),
      rx: input.raw.rx, ry: input.raw.ry, force: input.raw.force,
      sim: input.sim, aimUx: input.aim ? r3(input.aim.x) : null, aimUy: input.aim ? r3(input.aim.y) : null,
      keyBase: dec.base, keyCal: dec.cal, keyShown: dec.shown, applied: dec.applied, ...extra,
    });
  },
};

// ---------- keyboard + input pipeline ----------
let active = null;
ctx.kb = new Keyboard(document.getElementById('keyboard'), (raw) => {
  if (!active || !active.onTap) return;
  let touch = { x: raw.x, y: raw.y }, aim = null;
  const sim = settings.mode === 'sim';
  if (sim) { aim = touch; touch = simulateTouch(aim, ctx.simParams(), rng); }
  active.onTap({ raw, touch, aim, sim });
});
ctx.kb.onLayout = (info) => logger.log('layout', { pid: settings.pid, ...info });

// ---------- screens ----------
const screens = {
  participant: createParticipantScreen(ctx),
  calib: createCalibrationScreen(ctx),
  trial: createTrialScreen(ctx),
  demo: createDemoScreen(ctx),
  replay: createReplayScreen(ctx),
  settings: createSettingsScreen(ctx),
};
const main = document.getElementById('screens');
for (const s of Object.values(screens)) { s.el.hidden = true; main.appendChild(s.el); }

ctx.go = function go(name) {
  if (active && active.hide) active.hide();
  for (const [k, s] of Object.entries(screens)) s.el.hidden = k !== name;
  document.querySelectorAll('#tabs button').forEach(b => b.classList.toggle('on', b.dataset.screen === name));
  active = screens[name];
  ctx.kb.setTarget(null);
  ctx.kb.setOverlay(null);
  document.body.dataset.screen = name;
  if (active.show) active.show();
};

document.querySelectorAll('#tabs button').forEach(b => b.addEventListener('click', () => ctx.go(b.dataset.screen)));

function updateBadges() {
  document.getElementById('badge-pid').textContent = `참가자 ${ctx.participantLabel()}`;
  document.getElementById('badge-cond').textContent = ctx.condLabel();
  document.getElementById('badge-sim').hidden = settings.mode !== 'sim';
  const mb = document.getElementById('badge-model');
  const m = ctx.entry();
  mb.textContent = m ? `모델 ${m.model.type} (고정됨)` : '보정 전';
  mb.classList.toggle('warn', !m);
  mb.hidden = settings.blind && !settings.showExp;
}
ctx.updateBadges = updateBadges;

// ---------- browser suppression (확대·스크롤·더블탭 방지) ----------
document.addEventListener('gesturestart', e => e.preventDefault());
document.addEventListener('dblclick', e => e.preventDefault());
document.addEventListener('touchmove', e => { if (e.target.closest('#keyboard')) e.preventDefault(); }, { passive: false });
// Write pending events before the page goes away (페이지 이탈 전 저장)
document.addEventListener('visibilitychange', () => { if (document.hidden) logger.flush(); });

(async function boot() {
  await logger.init();
  document.querySelector('.ver').textContent = `v${APP_VERSION}`; // shows which build is running (캐시 확인용)
  logger.startSession({ pid: settings.pid, cond: settings.cond, mode: settings.mode, simSeed, sim: settings.sim });
  updateBadges();
  ctx.go(new URLSearchParams(location.search).get('screen') || 'participant');
})();
window.__glovekb = ctx; // debugging handle (디버그용)
