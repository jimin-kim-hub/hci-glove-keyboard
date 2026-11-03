// demo.js — experimenter/slide demo: "같은 터치, 다른 판정"
// One touch decoded by baseline and calibrated side by side. Uses its own model (P00 / demo-<hand>).
import { CALIB } from './config.js';
import { charToKeyId, hitOrNearest, isNeighbor } from './geometry.js';
import { fitCalibration } from './decoder.js';
import { simulateCalibration } from './simulate.js';
import { runCalibration } from './calibrun.js';
import { COLORS, dot, arrow, offsetField, calibrationTaps } from './viz.js';

const label = id => (id === 'space' ? '␣' : id === 'backspace' ? '⌫' : id === 'shift' ? '⇧' : id ?? '–');
const DEMO_PID = 'P00';

export function createDemoScreen(ctx) {
  const el = document.createElement('section');
  el.className = 'screen page';
  el.innerHTML = `
    <h1>같은 터치, 다른 판정</h1>
    <p class="muted">발표·시연용 화면입니다. 실험 기록(P00)은 종합에서 빠집니다.</p>
    <div class="row">
      <label class="field inline">손 상태 <select data-r="hand"><option value="glove">장갑</option><option value="bare">맨손</option></select></label>
      <button data-r="quick" class="sim-only">빠른 자동 보정 (시뮬레이션)</button>
      <button data-r="calib">직접 보정 (43탭)</button>
    </div>
    <div data-r="calibHost"></div>
    <div data-r="body">
      <div class="card small" data-r="modelInfo"></div>
      <div class="target-line">목표 키 <b data-r="target">–</b>
        <label class="check"><input type="checkbox" data-r="targetMode" checked> 목표 키 제시</label></div>
      <div class="last-line" data-r="last">&nbsp;</div>
      <div class="compare">
        <div class="cell"><div class="cap">기본 판정</div><div class="key-big" data-r="base">–</div><div class="mark" data-r="baseMark"></div></div>
        <div class="cell cal"><div class="cap">보정 판정</div><div class="key-big" data-r="cal">–</div><div class="mark" data-r="calMark"></div></div>
      </div>
      <div class="tally" data-r="tally"></div>
      <div class="legend">
        <span class="sim-only"><i class="ring" style="border-color:#1c7ed6"></i>노린 위치</span>
        <span><i style="background:#e8590c"></i>실제 터치</span>
        <span><i style="background:#2b8a3e"></i>보정 후 위치</span>
      </div>
      <div class="row"><button data-r="clear">기록 지우기</button><button data-r="field">학습된 쏠림 보기</button></div>
    </div>`;
  const $ = n => el.querySelector(`[data-r="${n}"]`);
  let history = [], seq = 0, target = null, runner = null, showField = false;
  const stats = { n: 0, base: 0, cal: 0 };
  const targetChars = [...CALIB.phrase.replace(/ /g, '')];
  const hand = () => $('hand').value;
  const key = () => `demo-${hand()}`;
  const entry = () => ctx.entry(DEMO_PID, key());

  function setModel(e) {
    ctx.setEntry(e, DEMO_PID, key());
    history = []; Object.assign(stats, { n: 0, base: 0, cal: 0 });
    refresh();
  }

  function nextTarget() {
    target = $('targetMode').checked ? charToKeyId(targetChars[seq++ % targetChars.length]) : null;
    $('target').textContent = target ? label(target) : '(자유 입력)';
    ctx.kb.setTarget(target);
  }

  function draw() {
    const e = entry();
    ctx.kb.setOverlay((g, u) => {
      if (showField && e) { calibrationTaps(g, u, e.taps); offsetField(g, u, e.model); }
      history.forEach((h, j) => {
        const last = j === history.length - 1;
        const s = last ? 1.5 : 1; // emphasize the latest tap (방금 탭 강조)
        g.globalAlpha = last ? 1 : 0.3;
        if (h.aim) dot(g, u, h.aim, COLORS.aim, 5 * s, true);
        if (h.corrected) arrow(g, u, h.touch, h.corrected, COLORS.corrected, 2 * s);
        dot(g, u, h.touch, COLORS.raw, 5 * s);
        if (h.corrected) dot(g, u, h.corrected, COLORS.corrected, 4 * s);
      });
      g.globalAlpha = 1;
    });
  }

  function renderTally() {
    if (!stats.n) { $('tally').textContent = '키보드를 누르면 결과가 여기에 쌓입니다.'; return; }
    const p = v => ((v / stats.n) * 100).toFixed(0) + '%';
    $('tally').innerHTML = `${stats.n}번 누름 · 기본 판정 정답 <b>${stats.base}</b> (${p(stats.base)}) · 보정 판정 정답 <b class="good">${stats.cal}</b> (${p(stats.cal)})`;
  }

  function refresh() {
    runner = null;
    $('calibHost').innerHTML = '';
    const e = entry();
    document.body.classList.add('kb-on');
    $('body').hidden = !e;
    if (!e) {
      $('calibHost').innerHTML = `<div class="card warn">${hand() === 'glove' ? '장갑' : '맨손'} 보정 모델이 없습니다. 위에서 보정하세요.</div>`;
      ctx.kb.setTarget(null); ctx.kb.setOverlay(null);
      return;
    }
    const r = e.report;
    $('modelInfo').innerHTML = `${hand() === 'glove' ? '장갑' : '맨손'} 모델 <b>${e.model.type}</b>${e.model.type === 'M1' ? ` (λ=${e.model.lambda})` : ''} · 보정 탭 ${r.nUsed}개 · ${r.reason}${e.sim ? ' · <b>시뮬레이션 데이터</b>' : ''}`;
    renderTally();
    nextTarget();
    draw();
  }

  $('hand').onchange = refresh;
  $('quick').onclick = () => {
    const taps = simulateCalibration(ctx.simParams(hand()), Math.floor(Math.random() * 1e9));
    const { model, report } = fitCalibration(taps);
    ctx.logger.log('model_fit', { pid: DEMO_PID, cond: key(), phase: 'demo', model: model.type, reason: report.reason, params: model, sim: true, auto: true });
    setModel({ model, report, taps, sim: true, at: new Date().toISOString() });
  };
  $('calib').onclick = () => {
    $('body').hidden = true;
    ctx.kb.setOverlay(null);
    runner = runCalibration(ctx, $('calibHost'), {
      logFields: { pid: DEMO_PID, cond: key(), phase: 'demo' },
      onDone: (e) => setModel(e),
    });
  };
  $('targetMode').onchange = nextTarget;
  $('clear').onclick = () => { history = []; $('last').innerHTML = '&nbsp;'; Object.assign(stats, { n: 0, base: 0, cal: 0 }); renderTally(); draw(); };
  $('field').onclick = () => { showField = !showField; $('field').textContent = showField ? '학습된 쏠림 숨기기' : '학습된 쏠림 보기'; draw(); };

  return {
    el,
    show: refresh,
    hide() { document.body.classList.remove('kb-on'); },
    simHand: hand,
    onTap(input) {
      if (runner) return runner.onTap(input);
      const e = entry();
      if (!e) return;
      const dec = ctx.decode(input.touch, { keyboard: 'calibrated', model: e.model });
      // Intended key: the prompted target; otherwise (simulation) the key the cursor aimed at
      const intended = target ?? (input.aim ? hitOrNearest(input.aim) : null);
      ctx.logTouch(input, dec, { pid: DEMO_PID, cond: key(), phase: 'demo', intended });
      $('last').innerHTML = intended ? `방금 누름 · 의도한 키 <b>${label(intended)}</b>` : '방금 누름 · 의도한 키 알 수 없음 (자유 입력)';
      $('base').textContent = label(dec.base);
      $('cal').textContent = label(dec.cal);
      const mark = k => (intended == null ? '' : k === intended ? '✓ 의도한 키'
        : isNeighbor(intended, k) ? '✗ 옆 키 (이웃 키 오류)' : '✗ 다른 키');
      $('baseMark').textContent = mark(dec.base);
      $('calMark').textContent = mark(dec.cal);
      $('baseMark').className = 'mark ' + (intended && dec.base === intended ? 'good' : 'bad');
      $('calMark').className = 'mark ' + (intended && dec.cal === intended ? 'good' : 'bad');
      if (intended) {
        stats.n++;
        if (dec.base === intended) stats.base++;
        if (dec.cal === intended) stats.cal++;
      }
      ctx.kb.flash(dec.cal);
      history.push({ touch: input.touch, aim: input.aim, corrected: dec.corrected });
      if (history.length > 12) history.shift();
      renderTally();
      draw();
      if (target) nextTarget();
    },
  };
}
