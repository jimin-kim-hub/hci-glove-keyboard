// calibrun.js — guided-tap calibration runner, reusable by the flow and the demo
// (가이드 탭 보정 실행기, 계획 PDF B5). Renders into `host`, returns { onTap }.
import { CALIB } from './config.js';
import { charToKeyId, nearestKey } from './geometry.js';
import { fitCalibration } from './decoder.js';

export function runCalibration(ctx, host, { logFields, onDone }) {
  const chars = [...CALIB.phrase];
  let i = 0, startT = null;
  const taps = [];
  host.innerHTML = `
    <p class="lead">노란 테두리 키를 <b>차례대로</b> 누르세요.<br><span class="muted">맞게 눌렀는지는 신경 쓰지 말고, 평소처럼 누르면 됩니다.</span></p>
    <div class="pangram"></div>
    <div class="progress"><div></div></div>
    <div class="muted center count"></div>`;
  const pg = host.querySelector('.pangram');
  const bar = host.querySelector('.progress div');
  const count = host.querySelector('.count');

  function render() {
    pg.innerHTML = chars.map((c, j) => `<span class="${j < i ? 'done' : j === i ? 'cur' : ''}">${c === ' ' ? '␣' : c}</span>`).join('');
    bar.style.width = `${(i / chars.length) * 100}%`;
    count.textContent = `${i} / ${chars.length}`;
    ctx.kb.setTarget(i < chars.length ? charToKeyId(chars[i]) : null);
  }
  render();

  function finish(sim) {
    const durationS = startT ? (performance.now() - startT) / 1000 : null;
    const { model, report } = fitCalibration(taps);
    ctx.kb.setTarget(null);
    ctx.logger.log('model_fit', {
      ...logFields, model: model.type, n: report.nUsed, nTotal: report.nTotal,
      loo_acc: report.chosen === 'M1' ? Math.max(...report.m1.map(r => r.acc)) : report.m0.acc,
      baseline_acc: report.baseline.acc, reason: report.reason, params: model, durationS, sim,
    });
    onDone({ model, report, taps, durationS, sim, at: new Date().toISOString() });
  }

  return {
    onTap(input) {
      if (i >= chars.length) return;
      const target = charToKeyId(chars[i]);
      const base = { ...logFields, i, target, sim: input.sim, ux: +input.touch.x.toFixed(3), uy: +input.touch.y.toFixed(3) };
      if (nearestKey(input.touch).dist >= CALIB.ignorePitch) { // too far from any key: ignore and wait (B5)
        ctx.logger.log('calib_ignored', base);
        return;
      }
      if (startT === null) startT = performance.now();
      ctx.logger.log('calib_tap', {
        ...base, x: +(input.touch.x * ctx.kb.unitPx).toFixed(1), y: +(input.touch.y * ctx.kb.unitPx).toFixed(1),
        rx: input.raw.rx, ry: input.raw.ry, force: input.raw.force, tid: input.raw.tid,
      });
      taps.push({ x: input.touch.x, y: input.touch.y, target });
      ctx.kb.flash(target);
      i++;
      if (i >= chars.length) finish(input.sim); else render();
    },
  };
}
