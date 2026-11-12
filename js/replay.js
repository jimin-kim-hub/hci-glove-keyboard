// replay.js — load exported JSONL and re-evaluate real calibration taps offline
// (실제 탭 재생: 기본 판정 vs 보정 판정(LOO)을 같은 탭에 적용)
import { KEY_BY_ID, isNeighbor } from './geometry.js';
import { fitCalibration, residuals, removeOutliers, decodeBaseline, decodeCalibrated, fitM0, fitM1 } from './decoder.js';
import { parseJSONL } from './logger.js';
import { COLORS, dot, arrow, offsetField } from './viz.js';

const pct = v => (v * 100).toFixed(1) + '%';

// Group calib_tap events into calibration runs (session + condition)
export function extractRuns(events) {
  const runs = new Map();
  for (const e of events) {
    if (e.ev !== 'calib_tap' || e.ux == null) continue;
    const key = `${e.sid}|${e.cond}`;
    if (!runs.has(key)) runs.set(key, { sid: e.sid, pid: e.pid, cond: e.cond, sim: false, taps: [] });
    const r = runs.get(key);
    if (e.i === 0 && r.taps.length) r.taps = []; // a restarted run replaces the previous one
    r.taps.push({ x: e.ux, y: e.uy, target: e.target });
    if (e.sim) r.sim = true;
  }
  return [...runs.values()].filter(r => r.taps.length >= 5);
}

// Each tap is decoded by a model fitted WITHOUT that tap (LOO) — no answer leakage
export function evaluateRun(taps) {
  const { model, report } = fitCalibration(taps);
  const rs = removeOutliers(residuals(taps));
  const lambda = model.type === 'M1' ? model.lambda : null;
  const rows = rs.map((t, j) => {
    const train = rs.filter((_, k) => k !== j);
    const m = model.type === 'M1' ? fitM1(train, lambda) : fitM0(train);
    const base = decodeBaseline(t);
    const cal = decodeCalibrated(m, t);
    return { ...t, base, cal: cal.key, corrected: cal.corrected };
  });
  const count = f => rows.filter(f).length;
  return {
    model, report, rows,
    baseAcc: count(r => r.base === r.target) / rows.length,
    calAcc: count(r => r.cal === r.target) / rows.length,
    baseNbr: count(r => r.base !== r.target && isNeighbor(r.target, r.base)),
    calNbr: count(r => r.cal !== r.target && isNeighbor(r.target, r.cal)),
  };
}

export function createReplayScreen(ctx) {
  const el = document.createElement('section');
  el.className = 'screen page';
  el.innerHTML = `
    <h1>실제 탭 재생</h1>
    <p class="muted">폰에서 보정(43탭)을 하고 내보낸 기록(JSONL) 파일을 불러오세요.
      각 탭은 <b>그 탭을 뺀 나머지로 학습한 모델</b>(LOO)로 판정하므로 정답 누수가 없습니다.</p>
    <div class="row">
      <label class="file-btn">JSONL 불러오기<input type="file" data-r="file" hidden></label>
      <button data-r="useLocal">이 기기의 현재 로그 사용</button>
    </div>
    <select data-r="runs" hidden></select>
    <div data-r="out"></div>`;
  const $ = n => el.querySelector(`[data-r="${n}"]`);
  let runs = [];

  function load(events, sourceName) {
    runs = extractRuns(events);
    if (!runs.length) { $('runs').hidden = true; $('out').innerHTML = `<div class="card warn">${sourceName}에서 보정 탭(calib_tap)을 찾지 못했습니다.</div>`; ctx.kb.setOverlay(null); return; }
    $('runs').hidden = false;
    $('runs').innerHTML = runs.map((r, j) => `<option value="${j}">${r.pid ?? '?'} · 조건 ${r.cond} · ${r.taps.length}탭 · ${r.sim ? '시뮬레이션' : '실제 터치'}</option>`).join('');
    $('runs').value = String(runs.length - 1);
    show(runs.length - 1);
  }

  function show(j) {
    const run = runs[j];
    const ev = evaluateRun(run.taps);
    const tag = run.sim
      ? '<span class="tag sim">시뮬레이션(실제 데이터 아님)</span>'
      : '<span class="tag real">실제 터치 데이터 · 팀원이면 "팀 내부 예비 확인(참가자 데이터 아님)"으로 표기</span>';
    $('out').innerHTML = `
      <div class="card">${tag}
        <div class="compare small">
          <div class="cell"><div class="cap">기본 판정 정확도</div><div class="key-big">${pct(ev.baseAcc)}</div><div class="muted">이웃 키 오류 ${ev.baseNbr}회</div></div>
          <div class="cell cal"><div class="cap">보정 판정 정확도 (LOO)</div><div class="key-big">${pct(ev.calAcc)}</div><div class="muted">이웃 키 오류 ${ev.calNbr}회</div></div>
        </div>
        <div class="muted">사용 탭 ${ev.rows.length}개 (이상치 ${ev.report.nOutliers}개 제외) · 선택 모델 ${ev.model.type}${ev.model.type === 'M1' ? ` λ=${ev.model.lambda}` : ''} · ${ev.report.reason}</div>
        <div class="muted small">주의: 탭 43개 한 번 분량이라 우연 변동이 큽니다. 효과의 근거가 아니라 작동 확인용입니다.</div>
      </div>
      <div class="legend">
        <span><i style="background:#e8590c"></i>기본 판정 정답</span>
        <span><i style="background:#e03131"></i>기본 판정 오답</span>
        <span><i style="background:#2b8a3e"></i>보정 후 위치</span>
        <span><i style="background:#7048e8"></i>학습된 오프셋</span>
      </div>`;
    ctx.kb.setOverlay((g, u) => {
      offsetField(g, u, ev.model);
      for (const r of ev.rows) {
        const k = KEY_BY_ID[r.target];
        g.globalAlpha = 0.35; arrow(g, u, r, { x: k.cx, y: k.cy }, '#868e96', 1); g.globalAlpha = 1;
        dot(g, u, r, r.base === r.target ? COLORS.raw : COLORS.wrong, 4);
        if (r.cal === r.target) dot(g, u, r.corrected, COLORS.corrected, 2.5);
      }
    });
  }

  $('file').onchange = async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    load(parseJSONL(await f.text()), f.name);
    e.target.value = '';
  };
  $('useLocal').onclick = () => load(ctx.logger.events, '현재 로그');
  $('runs').onchange = () => show(+$('runs').value);

  return {
    el,
    show() { document.body.classList.add('kb-on'); ctx.kb.setTarget(null); if (runs.length) show(+$('runs').value); else ctx.kb.setOverlay(null); },
    hide() { document.body.classList.remove('kb-on'); },
    onTap() { /* keyboard is display-only here */ },
  };
}
