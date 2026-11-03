// calibration.js — guided-tap flow, collection, fit + freeze (가이드 탭 보정, 계획 PDF B5)
import { CALIB } from './config.js';
import { charToKeyId, nearestKey } from './geometry.js';
import { fitCalibration } from './decoder.js';
import { simulateCalibration } from './simulate.js';
import { calibrationTaps, offsetField } from './viz.js';

const pct = v => (v * 100).toFixed(1) + '%';

export function createCalibrationScreen(ctx) {
  const el = document.createElement('section');
  el.className = 'screen';
  el.innerHTML = `
    <h2>보정 <small>calibration · 가이드 탭 43회</small></h2>
    <p class="hint" data-r="hint"></p>
    <div class="pangram" data-r="pangram"></div>
    <div class="progress"><div data-r="bar"></div></div>
    <div class="row" data-r="collectBtns">
      <button data-r="restart">처음부터</button>
      <button data-r="auto" class="sim-only">자동 보정 (시뮬레이션)</button>
    </div>
    <div data-r="result" hidden>
      <div class="card">
        <div class="big" data-r="chosen"></div>
        <div class="muted" data-r="reason"></div>
        <table class="mini" data-r="table"></table>
        <div class="muted" data-r="note"></div>
      </div>
      <div class="legend">
        <span><i style="background:#e8590c"></i>탭 위치</span>
        <span><i style="background:#868e96"></i>탭→의도 키 중심</span>
        <span><i style="background:#7048e8"></i>학습된 오프셋</span>
      </div>
      <div class="row">
        <button data-r="again">다시 보정</button>
        <button data-r="toDemo" class="primary">비교 데모로 →</button>
      </div>
    </div>`;
  const $ = n => el.querySelector(`[data-r="${n}"]`);
  const chars = [...CALIB.phrase];
  let i = 0, taps = [], startT = null, showingResult = false;

  function renderPangram() {
    $('pangram').innerHTML = chars.map((c, j) =>
      `<span class="${j < i ? 'done' : j === i ? 'cur' : ''}">${c === ' ' ? '␣' : c}</span>`).join('');
    $('bar').style.width = `${(i / chars.length) * 100}%`;
    $('hint').textContent = i < chars.length
      ? `노란 테두리 키를 누르세요 (${i}/${chars.length}). 맞고 틀림과 상관없이 다음 글자로 넘어갑니다.`
      : '';
    ctx.kb.setTarget(i < chars.length ? charToKeyId(chars[i]) : null);
    ctx.kb.setOverlay(null);
  }

  function reset() {
    i = 0; taps = []; startT = null; showingResult = false;
    $('result').hidden = true;
    $('collectBtns').hidden = false;
    $('pangram').hidden = false;
    renderPangram();
  }

  function finish(sim) {
    const durationS = startT ? (performance.now() - startT) / 1000 : null;
    const { model, report } = fitCalibration(taps);
    ctx.models[ctx.settings.cond] = { model, report, taps, durationS, sim, at: new Date().toISOString() };
    ctx.saveModels();
    ctx.logger.log('model_fit', {
      pid: ctx.settings.pid, cond: ctx.settings.cond, model: model.type, n: report.nUsed, nTotal: report.nTotal,
      loo_acc: report.chosen === 'M1' ? Math.max(...report.m1.map(r => r.acc)) : report.m0.acc,
      baseline_acc: report.baseline.acc, reason: report.reason, params: model, durationS, sim,
    });
    showResult();
  }

  function showResult() {
    const entry = ctx.models[ctx.settings.cond];
    if (!entry) return reset();
    showingResult = true;
    const { model, report, taps: t, durationS, sim } = entry;
    $('collectBtns').hidden = true;
    $('pangram').hidden = true;
    $('bar').style.width = '100%';
    $('hint').textContent = `${ctx.condLabel()} — 보정 완료. 모델은 고정되어 본 과제 중에는 학습하지 않습니다.`;
    $('result').hidden = false;
    $('chosen').textContent = `선택된 모델: ${model.type === 'M0' ? 'M0 (중앙값 오프셋)' : `M1 (위치 의존 오프셋, λ=${model.lambda})`}`;
    $('reason').textContent = `이유: ${report.reason}`;
    const rows = [['기본 판정 (보정 없음)', report.baseline.acc, report.baseline.meanErr], ['M0', report.m0.acc, report.m0.meanErr],
      ...report.m1.map(r => [`M1 λ=${r.lambda}`, r.acc, r.meanErr])];
    $('table').innerHTML = `<tr><th></th><th>키 정확도 (보정은 LOO)</th><th>평균 거리(키 폭)</th></tr>` +
      rows.map(([n, a, e]) => `<tr><td>${n}</td><td>${pct(a)}</td><td>${e.toFixed(2)}</td></tr>`).join('');
    const kbNote = ctx.cond().keyboard === 'baseline'
      ? ' 이 조건은 기본 키보드라 이 모델은 판정에 쓰지 않고 기록만 합니다(섀도 로깅).' : '';
    $('note').textContent = `탭 ${report.nTotal}개 중 ${report.nUsed}개 사용(이상치 ${report.nOutliers}개 제외)` +
      (durationS ? ` · 소요 ${durationS.toFixed(1)}초` : '') + (sim ? ' · 시뮬레이션 데이터' : '') + '.' + kbNote;
    ctx.kb.setTarget(null);
    ctx.kb.setOverlay((g, u) => { calibrationTaps(g, u, t); offsetField(g, u, model); });
  }

  $('restart').onclick = reset;
  $('again').onclick = () => { delete ctx.models[ctx.settings.cond]; ctx.saveModels(); reset(); };
  $('toDemo').onclick = () => ctx.go('demo');
  $('auto').onclick = () => {
    taps = simulateCalibration(ctx.simParams(), Math.floor(Math.random() * 1e9));
    taps.forEach((t, j) => ctx.logger.log('calib_tap', {
      pid: ctx.settings.pid, cond: ctx.settings.cond, i: j, ux: +t.x.toFixed(3), uy: +t.y.toFixed(3),
      x: +(t.x * ctx.kb.unitPx).toFixed(1), y: +(t.y * ctx.kb.unitPx).toFixed(1), target: t.target, sim: true, auto: true,
    }));
    i = chars.length;
    finish(true);
  };

  return {
    el,
    show() { ctx.models[ctx.settings.cond] ? showResult() : reset(); },
    onTap(input) {
      if (showingResult || i >= chars.length) return;
      const target = charToKeyId(chars[i]);
      const near = nearestKey(input.touch);
      const base = { pid: ctx.settings.pid, cond: ctx.settings.cond, phase: 'calib', i, target, sim: input.sim };
      if (near.dist >= CALIB.ignorePitch) { // too far from any key: ignore and wait (B5)
        ctx.logger.log('calib_ignored', { ...base, ux: +input.touch.x.toFixed(3), uy: +input.touch.y.toFixed(3) });
        return;
      }
      if (startT === null) startT = performance.now();
      ctx.logger.log('calib_tap', {
        ...base, ux: +input.touch.x.toFixed(3), uy: +input.touch.y.toFixed(3),
        x: +(input.touch.x * ctx.kb.unitPx).toFixed(1), y: +(input.touch.y * ctx.kb.unitPx).toFixed(1),
        rx: input.raw.rx, ry: input.raw.ry, force: input.raw.force, tid: input.raw.tid,
      });
      taps.push({ x: input.touch.x, y: input.touch.y, target });
      ctx.kb.flash(target);
      i++;
      if (i >= chars.length) finish(input.sim); else renderPangram();
    },
  };
}
