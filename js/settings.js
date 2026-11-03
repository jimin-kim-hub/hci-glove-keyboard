// settings.js — participant/condition/mode settings, simulation sliders, log export (설정·로그)
import { CONDITIONS, SIM_PRESETS, GEOM } from './config.js';

export function createSettingsScreen(ctx) {
  const s = ctx.settings;
  const el = document.createElement('section');
  el.className = 'screen scroll';
  el.innerHTML = `
    <h2>설정 · 로그</h2>
    <div class="form">
      <div class="muted" data-r="who"></div>
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
      <button class="primary" data-r="export">전체 로그 내보내기 (JSONL)</button>
      <button data-r="clearModels" class="danger">현재 참가자 보정 모델 지우기</button>
      <button data-r="clearLog" class="danger">이 기기 로그 모두 지우기</button>
    </div>
    <h3>화면 기하</h3>
    <div class="muted small" data-r="geom"></div>`;
  const $ = n => el.querySelector(`[data-r="${n}"]`);

  function sync() {
    $('cond').value = s.cond; $('mode').value = s.mode;
    $('blind').checked = s.blind; $('xIs').value = s.xIs; $('showExp').checked = s.showExp;
    $('simBox').hidden = s.mode !== 'sim';
    el.querySelectorAll('[data-s]').forEach(inp => { inp.value = s.sim[inp.dataset.s]; });
    el.querySelectorAll('[data-v]').forEach(sp => { sp.textContent = (+s.sim[sp.dataset.v]).toFixed(2); });
    const order = ctx.latinOrder();
    $('who').textContent = `현재 참가자 ${ctx.participantLabel()}` + (order ? ` · 순서 ${order.split('').join(' → ')}` : '') + ' (참가자 탭에서 변경)';
    const n = ctx.logger.events.length;
    $('logInfo').textContent = `이벤트 ${n}개 · ${ctx.logger.storageLabel} · ${s.pid} 보정 모델: ${Object.keys(ctx.models[s.pid] ?? {}).join(', ') || '없음'}`;
    const u = ctx.kb.unitPx;
    document.body.classList.toggle('sim-mode', s.mode === 'sim');
    $('geom').textContent = `키 폭 ${(GEOM.keyW * u).toFixed(1)}px · 키 높이 ${(GEOM.keyH * u).toFixed(1)}px · 키 간격 ${u.toFixed(1)}px (CSS px). 실제 mm는 폰에서 자로 재서 기록하세요. 화면 ${window.innerWidth}×${window.innerHeight}, DPR ${window.devicePixelRatio}.`;
  }

  function changed(what) {
    ctx.saveSettings();
    ctx.logger.log('settings', { pid: s.pid, changed: what, cond: s.cond, mode: s.mode, sim: s.sim, blind: s.blind, xIs: s.xIs });
    sync();
  }

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
  $('export').onclick = async () => { await ctx.logger.flush(); ctx.logger.export(); };
  $('clearLog').onclick = async () => { if (confirm('이 기기의 모든 참가자 로그를 지울까요? 되돌릴 수 없습니다. 먼저 전체 내보내기를 하세요.')) { await ctx.logger.clear(); sync(); } };
  $('clearModels').onclick = () => { if (confirm(`${s.pid}의 보정 모델을 모두 지울까요? (로그는 남습니다)`)) { delete ctx.models[s.pid]; ctx.saveModels(); sync(); } };

  document.body.classList.toggle('sim-mode', s.mode === 'sim');
  return { el, show() { ctx.kb.setTarget(null); ctx.kb.setOverlay(null); sync(); } };
}
