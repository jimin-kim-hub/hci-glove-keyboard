// settings.js — participant/condition/mode settings, simulation sliders, log export (설정·로그)
import { CONDITIONS, SIM_PRESETS, GEOM } from './config.js';

export function createSettingsScreen(ctx) {
  const s = ctx.settings;
  const el = document.createElement('section');
  el.className = 'screen scroll';
  el.innerHTML = `
    <h2>설정 · 로그</h2>
    <div class="form">
      <label>참가자 ID <input data-r="pid" maxlength="8" placeholder="P01"></label>
      <div class="muted small" data-r="order"></div>
      <label>조건
        <select data-r="cond">${Object.keys(CONDITIONS).map(c => `<option value="${c}">${c}</option>`).join('')}</select>
      </label>
      <label>입력 모드
        <select data-r="mode"><option value="touch">실기기 터치 (live touch)</option><option value="sim">시뮬레이션 (simulated glove)</option></select>
      </label>
      <fieldset data-r="simBox">
        <legend>합성 장갑 오프셋 (키 폭 단위, <b>가정값 · 실제 데이터 아님</b>)</legend>
        <div class="muted small">장갑 조건(B, D)에만 적용. 맨손 조건(A, C)은 작은 고정값(평균 ${SIM_PRESETS.bare.mx}, ${SIM_PRESETS.bare.my} / 표준편차 ${SIM_PRESETS.bare.sd}).</div>
        ${[['mx', '평균 이동 x', -0.6, 0.6], ['my', '평균 이동 y', -0.6, 0.6], ['sd', '표준편차(퍼짐)', 0, 0.8], ['slope', '위치 의존 기울기', -0.5, 0.5]]
          .map(([k, n, lo, hi]) => `<label class="slider">${n} <span data-v="${k}"></span><input type="range" data-s="${k}" min="${lo}" max="${hi}" step="0.01"></label>`).join('')}
        <button data-r="simReset">기본값으로</button>
      </fieldset>
      <label class="toggle"><input type="checkbox" data-r="blind"> 블라인드 라벨 (키보드 X / Y로 표시)</label>
      <label>X로 부를 키보드
        <select data-r="xIs"><option value="calibrated">보정 키보드</option><option value="baseline">기본 키보드</option></select>
      </label>
      <label class="toggle"><input type="checkbox" data-r="showExp"> 실험자 정보 표시 (지표·모델)</label>
    </div>
    <h3>로그</h3>
    <div class="muted" data-r="logInfo"></div>
    <div class="row">
      <button class="primary" data-r="export">로그 내보내기 (JSONL)</button>
      <button data-r="clearLog" class="danger">로그 지우기</button>
      <button data-r="clearModels" class="danger">보정 모델 모두 지우기</button>
    </div>
    <h3>화면 기하</h3>
    <div class="muted small" data-r="geom"></div>`;
  const $ = n => el.querySelector(`[data-r="${n}"]`);

  function sync() {
    $('pid').value = s.pid; $('cond').value = s.cond; $('mode').value = s.mode;
    $('blind').checked = s.blind; $('xIs').value = s.xIs; $('showExp').checked = s.showExp;
    $('simBox').hidden = s.mode !== 'sim';
    el.querySelectorAll('[data-s]').forEach(inp => { inp.value = s.sim[inp.dataset.s]; });
    el.querySelectorAll('[data-v]').forEach(sp => { sp.textContent = (+s.sim[sp.dataset.v]).toFixed(2); });
    const order = ctx.latinOrder();
    $('order').textContent = order ? `라틴 방격 순서: ${order.split('').join(' → ')} (그룹 ${(ctx.pnum() - 1) % 4 + 1})` : 'P01 형식이면 조건 순서를 자동으로 보여 줍니다.';
    const n = ctx.logger.events.length;
    $('logInfo').textContent = `이벤트 ${n}개 · 이 브라우저(localStorage)에 자동 저장됨 · 보정 모델: ${Object.keys(ctx.models).join(', ') || '없음'}`;
    const u = ctx.kb.unitPx;
    document.body.classList.toggle('sim-mode', s.mode === 'sim');
    $('geom').textContent = `키 폭 ${(GEOM.keyW * u).toFixed(1)}px · 키 높이 ${(GEOM.keyH * u).toFixed(1)}px · 키 간격 ${u.toFixed(1)}px (CSS px). 실제 mm는 폰에서 자로 재서 기록하세요. 화면 ${window.innerWidth}×${window.innerHeight}, DPR ${window.devicePixelRatio}.`;
  }

  function changed(what) {
    ctx.saveSettings();
    ctx.logger.log('settings', { pid: s.pid, changed: what, cond: s.cond, mode: s.mode, sim: s.sim, blind: s.blind, xIs: s.xIs });
    sync();
  }

  $('pid').onchange = () => { s.pid = $('pid').value.trim().toUpperCase() || 'P00'; changed('pid'); };
  $('cond').onchange = () => { s.cond = $('cond').value; changed('cond'); };
  $('mode').onchange = () => { s.mode = $('mode').value; changed('mode'); };
  $('blind').onchange = () => { s.blind = $('blind').checked; changed('blind'); };
  $('xIs').onchange = () => { s.xIs = $('xIs').value; changed('xIs'); };
  $('showExp').onchange = () => { s.showExp = $('showExp').checked; changed('showExp'); };
  el.querySelectorAll('[data-s]').forEach(inp => {
    inp.oninput = () => { s.sim[inp.dataset.s] = +inp.value; sync(); };
    inp.onchange = () => changed('sim');
  });
  $('simReset').onclick = () => { s.sim = { ...SIM_PRESETS.glove }; changed('sim'); };
  $('export').onclick = () => { ctx.logger.save(); ctx.logger.export(s.pid); };
  $('clearLog').onclick = () => { if (confirm('이 기기의 로그를 모두 지울까요? 먼저 내보내기를 권합니다.')) { ctx.logger.clear(); sync(); } };
  $('clearModels').onclick = () => { if (confirm('모든 조건의 보정 모델을 지울까요?')) { for (const k of Object.keys(ctx.models)) delete ctx.models[k]; ctx.saveModels(); sync(); } };

  document.body.classList.toggle('sim-mode', s.mode === 'sim');
  return { el, show() { ctx.kb.setTarget(null); ctx.kb.setOverlay(null); sync(); } };
}
