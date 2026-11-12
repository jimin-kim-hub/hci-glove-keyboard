// app.js — state, input pipeline, participant flow vs experimenter tools (화면 전환·상태 관리)
import { CONDITIONS, LATIN_SQUARE, SIM_PRESETS, SETTINGS_KEY, APP_VERSION, DEFAULT_MODEL_POLICY } from './config.js';
import { Keyboard } from './keyboard.js';
import { Logger } from './logger.js';
import { decodeBaseline, decodeCalibrated } from './decoder.js';
import { simulateTouch, mulberry32 } from './simulate.js';
import { createFlowScreen } from './flow.js';
import { createSummaryScreen } from './summary.js';
import { createDemoScreen } from './demo.js';
import { createReplayScreen } from './replay.js';
import { createSettingsScreen } from './settings.js';

const MODELS_KEY = 'glovekb.models.v2';           // { pid: { modelKey: entry } }
const PARTICIPANTS_KEY = 'glovekb.participants.v1'; // { pid: { alias, created, order } } — this device only

const DEFAULT_SETTINGS = {
  pid: 'P00', cond: 'D', mode: 'touch', // 'touch' | 'sim'
  sim: { ...SIM_PRESETS.glove },
  xIs: 'calibrated',
  modelPolicy: DEFAULT_MODEL_POLICY, // 'auto' | 'M0' | 'M1' — fix one model after the pilot (튜터 피드백 11/9)
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
  saveSettings() { store(SETTINGS_KEY, settings); updateChrome(); },
  saveModels() { store(MODELS_KEY, models); },
  saveParticipants() { store(PARTICIPANTS_KEY, participants); },
  cond() { return CONDITIONS[settings.cond]; },
  // Calibration entry per participant × model key (A–D, 'practice', 'demo-glove' …)
  entry(pid = settings.pid, key = settings.cond) { return models[pid]?.[key] ?? null; },
  setEntry(entry, pid = settings.pid, key = settings.cond) {
    if (entry) (models[pid] ??= {})[key] = entry;
    else if (models[pid]) delete models[pid][key];
    ctx.saveModels();
  },
  simParams(hand = ctx.cond().hand) { return hand === 'glove' ? settings.sim : SIM_PRESETS.bare; },
  pnum(pid = settings.pid) { return parseInt(String(pid).replace(/\D/g, ''), 10) || 0; },
  latinOrder(pid = settings.pid) {
    const n = ctx.pnum(pid);
    return n >= 1 ? LATIN_SQUARE[(n - 1) % 4] : null;
  },
  participantLabel(pid = settings.pid) {
    const alias = participants[pid]?.alias;
    return alias ? `${alias} (${pid})` : pid;
  },

  // The alias stays on this device and is never written to the log (익명화)
  startParticipant(pid, alias) {
    const order = ctx.latinOrder(pid);
    if (!participants[pid]) participants[pid] = { alias: alias || '', created: new Date().toISOString(), order };
    else if (alias) participants[pid].alias = alias;
    ctx.saveParticipants();
    settings.pid = pid;
    ctx.saveSettings();
    logger.log('participant_start', { pid, order, group: order ? (ctx.pnum(pid) - 1) % 4 + 1 : null, mode: settings.mode, xIs: settings.xIs, modelPolicy: settings.modelPolicy, app: APP_VERSION });
  },

  // Decode one touch with both decoders; only `shown` reaches the screen (섀도 로깅)
  // `alt` = { M0, M1 } from the same calibration: both are decoded for the log only (오프라인 비교용)
  decode(touch, { keyboard = ctx.cond().keyboard, model = ctx.entry()?.model ?? null, alt = null } = {}) {
    const base = decodeBaseline(touch);
    const cal = model ? decodeCalibrated(model, touch) : null;
    const useCal = keyboard === 'calibrated' && !!cal;
    return {
      base, cal: cal?.key ?? null, corrected: cal?.corrected ?? null, shown: useCal ? cal.key : base, applied: useCal ? 'calibrated' : 'baseline',
      m0: alt?.M0 ? decodeCalibrated(alt.M0, touch).key : null, m1: alt?.M1 ? decodeCalibrated(alt.M1, touch).key : null,
    };
  },

  // Standard touch event (계획 PDF B7 스키마); `extra` may override pid/cond/phase
  logTouch(input, dec, extra = {}) {
    const u = ctx.kb.unitPx;
    const r1 = v => (v == null ? null : Math.round(v * 10) / 10);
    const r3 = v => (v == null ? null : Math.round(v * 1000) / 1000);
    return logger.log('touch', {
      pid: settings.pid, cond: settings.cond, type: 'down', tid: input.raw.tid, source: input.raw.source,
      x: r1(input.touch.x * u), y: r1(input.touch.y * u), ux: r3(input.touch.x), uy: r3(input.touch.y),
      rx: input.raw.rx, ry: input.raw.ry, force: input.raw.force,
      sim: input.sim, aimUx: input.aim ? r3(input.aim.x) : null, aimUy: input.aim ? r3(input.aim.y) : null,
      keyBase: dec.base, keyCal: dec.cal, keyM0: dec.m0 ?? null, keyM1: dec.m1 ?? null, keyShown: dec.shown, applied: dec.applied, ...extra,
    });
  },
};

// ---------- keyboard + input pipeline ----------
let active = null;
ctx.kb = new Keyboard(document.getElementById('keyboard'), (raw) => {
  if (!active || !active.onTap) return;
  let touch = { x: raw.x, y: raw.y }, aim = null;
  const sim = settings.mode === 'sim';
  if (sim) {
    aim = touch;
    const hand = active.simHand ? active.simHand() : ctx.cond().hand;
    touch = simulateTouch(aim, ctx.simParams(hand), rng);
  }
  active.onTap({ raw, touch, aim, sim });
});
ctx.kb.onLayout = (info) => logger.log('layout', { pid: settings.pid, ...info });

// ---------- screens: participant flow + experimenter tools ----------
const screens = {
  flow: createFlowScreen(ctx),
  summary: createSummaryScreen(ctx),
  demo: createDemoScreen(ctx),
  replay: createReplayScreen(ctx),
  settings: createSettingsScreen(ctx),
};
ctx.flowStatus = () => screens.flow.status();
ctx.flowJump = (d) => screens.flow.jump(d);
// Full reset before the real experiment: logs, participant numbers, resume list, models (본 실험 전 전체 초기화)
ctx.resetAll = async () => {
  await logger.clear();
  for (const obj of [models, participants]) for (const k of Object.keys(obj)) delete obj[k];
  ctx.saveModels();
  ctx.saveParticipants();
  screens.flow.reset();
  settings.pid = 'P00';
  ctx.saveSettings();
};

const main = document.getElementById('screens');
for (const s of Object.values(screens)) { s.el.hidden = true; main.appendChild(s.el); }

ctx.go = function go(name) {
  if (active && active.hide) active.hide();
  for (const [k, s] of Object.entries(screens)) s.el.hidden = k !== name;
  const tools = name !== 'flow';
  document.getElementById('tabs').hidden = !tools;
  document.getElementById('exp-btn').hidden = tools;
  document.querySelectorAll('#tabs button[data-screen]').forEach(b => b.classList.toggle('on', b.dataset.screen === name));
  active = screens[name];
  ctx.kb.setTarget(null);
  ctx.kb.setOverlay(null);
  document.body.dataset.screen = name;
  window.scrollTo(0, 0);
  if (active.show) active.show();
};

document.querySelectorAll('#tabs button[data-screen]').forEach(b => b.addEventListener('click', () => ctx.go(b.dataset.screen)));
document.getElementById('exp-btn').addEventListener('click', () => ctx.go('summary'));

function updateChrome() {
  document.getElementById('badge-sim').hidden = settings.mode !== 'sim';
  document.body.classList.toggle('sim-mode', settings.mode === 'sim');
}
ctx.applySettings = updateChrome;

// Keyboard area only: no scroll/zoom/long-press there; the rest of the page scrolls and zooms normally
document.addEventListener('touchmove', e => { if (e.target.closest('#keyboard')) e.preventDefault(); }, { passive: false });
// Write pending events before the page goes away (페이지 이탈 전 저장)
document.addEventListener('visibilitychange', () => { if (document.hidden) logger.flush(); });

(async function boot() {
  await logger.init();
  document.querySelector('.ver').textContent = `v${APP_VERSION}`; // shows which build is running (캐시 확인용)
  logger.startSession({ pid: settings.pid, mode: settings.mode, simSeed, sim: settings.sim });
  updateChrome();
  ctx.go(new URLSearchParams(location.search).get('screen') || 'flow');
})();
window.__glovekb = ctx; // debugging handle (디버그용)
