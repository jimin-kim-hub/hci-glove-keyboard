// demo.js — "같은 터치, 다른 판정": one touch decoded by baseline and calibrated side by side
import { CALIB } from './config.js';
import { charToKeyId, hitOrNearest, isNeighbor } from './geometry.js';
import { COLORS, dot, arrow } from './viz.js';

const label = id => (id === 'space' ? '␣' : id === 'backspace' ? '⌫' : id === 'shift' ? '⇧' : id ?? '–');

export function createDemoScreen(ctx) {
  const el = document.createElement('section');
  el.className = 'screen';
  el.innerHTML = `
    <h2>같은 터치, 다른 판정 <small>baseline vs calibrated</small></h2>
    <div data-r="needModel" class="card warn" hidden>
      <b>이 조건의 보정 모델이 아직 없습니다.</b>
      <div class="row">
        <button data-r="goCalib">보정하러 가기</button>
        <button data-r="quick" class="sim-only primary">빠른 자동 보정 (시뮬레이션)</button>
      </div>
    </div>
    <div data-r="body">
      <div class="target-line"><span data-r="targetLabel">목표 키</span> <b data-r="target">–</b>
        <label class="toggle"><input type="checkbox" data-r="targetMode" checked> 목표 키 제시</label></div>
      <div class="last-line" data-r="last">&nbsp;</div>
      <div class="compare">
        <div class="cell"><div class="cap">기본 판정</div><div class="key-big" data-r="base">–</div><div class="mark" data-r="baseMark"></div></div>
        <div class="cell cal"><div class="cap">보정 판정</div><div class="key-big" data-r="cal">–</div><div class="mark" data-r="calMark"></div></div>
      </div>
      <div class="tally" data-r="tally">탭하면 결과가 여기에 쌓입니다.</div>
      <div class="legend">
        <span data-r="aimLegend"><i class="ring" style="border-color:#1c7ed6"></i>노린 위치</span>
        <span><i style="background:#e8590c"></i>실제 터치</span>
        <span><i style="background:#2b8a3e"></i>보정 후 위치</span>
      </div>
      <div class="row"><button data-r="clear">기록 지우기</button></div>
    </div>`;
  const $ = n => el.querySelector(`[data-r="${n}"]`);
  let history = [], seq = 0, target = null;
  const stats = { n: 0, base: 0, cal: 0 };
  const targetChars = [...CALIB.phrase.replace(/ /g, '')];

  function nextTarget() {
    target = $('targetMode').checked ? charToKeyId(targetChars[seq++ % targetChars.length]) : null;
    $('target').textContent = target ? label(target) : '(자유 입력)';
    ctx.kb.setTarget(target);
  }

  function draw() {
    ctx.kb.setOverlay((g, u) => {
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
    if (!stats.n) { $('tally').textContent = '탭하면 결과가 여기에 쌓입니다.'; return; }
    const p = v => ((v / stats.n) * 100).toFixed(0) + '%';
    $('tally').innerHTML = `의도 키 기준 ${stats.n}탭 · 기본 정답 <b>${stats.base}</b> (${p(stats.base)}) · 보정 정답 <b class="good">${stats.cal}</b> (${p(stats.cal)})`;
  }

  function refresh() {
    const has = !!ctx.model();
    $('needModel').hidden = has;
    $('body').hidden = !has;
    $('aimLegend').hidden = ctx.settings.mode !== 'sim';
    if (has) { nextTarget(); draw(); } else { ctx.kb.setTarget(null); ctx.kb.setOverlay(null); }
  }

  $('goCalib').onclick = () => ctx.go('calib');
  $('quick').onclick = () => { ctx.go('calib'); document.querySelector('[data-r="auto"]').click(); ctx.go('demo'); };
  $('targetMode').onchange = () => nextTarget();
  $('clear').onclick = () => { history = []; $('last').innerHTML = '&nbsp;'; Object.assign(stats, { n: 0, base: 0, cal: 0 }); renderTally(); draw(); };

  return {
    el,
    show: refresh,
    onTap(input) {
      if (!ctx.model()) return;
      const dec = ctx.decode(input.touch);
      // Intended key: the prompted target; otherwise (simulation) the key the cursor aimed at
      const intended = target ?? (input.aim ? hitOrNearest(input.aim) : null);
      ctx.logTouch(input, dec, { phase: 'demo', intended });
      $('last').innerHTML = intended ? `방금 탭 · 의도한 키 <b>${label(intended)}</b>` : '방금 탭 · 의도한 키 알 수 없음 (자유 입력)';
      $('base').textContent = label(dec.base);
      $('cal').textContent = label(dec.cal);
      const mark = (k) => intended == null ? '' : k === intended ? '✓ 의도한 키'
        : isNeighbor(intended, k) ? '✗ 옆 키 (이웃 키 오류)' : '✗ 다른 키';
      $('baseMark').textContent = mark(dec.base);
      $('calMark').textContent = mark(dec.cal);
      $('baseMark').className = 'mark ' + (intended && dec.base === intended ? 'good' : 'bad');
      $('calMark').className = 'mark ' + (intended && dec.cal === intended ? 'good' : 'bad');
      if (intended) {
        stats.n++;
        if (dec.base === intended) stats.base++;
        if (dec.cal === intended) stats.cal++;
      }
      ctx.kb.flash(dec.shown);
      history.push({ touch: input.touch, aim: input.aim, corrected: dec.corrected });
      if (history.length > 12) history.shift();
      renderTally();
      draw();
      if (target) nextTarget();
    },
  };
}
