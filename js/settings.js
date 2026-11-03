// settings.js — experimenter settings: input mode, simulation, blind labels, step control, reset
// (실험자 설정)
import { SIM_PRESETS, GEOM } from './config.js';

export function createSettingsScreen(ctx) {
  const s = ctx.settings;
  const el = document.createElement('section');
  el.className = 'screen page';
  el.innerHTML = `
    <h1>실험자 설정</h1>

    <h2>현재 참가자 진행</h2>
    <div class="card" data-r="flow"></div>

    <h2>입력 방식</h2>
    <label class="field">입력 모드
      <select data-r="mode"><option value="touch">실기기 터치 (실험용)</option><option value="sim">시뮬레이션 (데스크톱 시연용)</option></select>
      <small>시뮬레이션: 마우스 클릭에 가짜 장갑 쏠림을 더합니다. 화면에 "시뮬레이션" 표시가 항상 붙습니다.</small>
    </label>
    <fieldset data-r="simBox">
      <legend>합성 장갑 쏠림 (키 폭 단위, <b>가정값 · 실제 데이터 아님</b>)</legend>
      <small class="muted">장갑 조건에만 적용. 맨손은 작은 고정값(평균 ${SIM_PRESETS.bare.mx}, ${SIM_PRESETS.bare.my} / 퍼짐 ${SIM_PRESETS.bare.sd}).</small>
      ${[['mx', '평균 이동 (좌우)', -0.6, 0.6], ['my', '평균 이동 (상하)', -0.6, 0.6], ['sd', '퍼짐 (표준편차)', 0, 0.8], ['slope', '위치에 따른 차이', -0.5, 0.5]]
        .map(([k, n, lo, hi]) => `<label class="slider">${n} <b data-v="${k}"></b><input type="range" data-s="${k}" min="${lo}" max="${hi}" step="0.01"></label>`).join('')}
      <button data-r="simReset">기본값으로</button>
    </fieldset>

    <h2>블라인드</h2>
    <label class="field">"키보드 X"로 부를 키보드
      <select data-r="xIs"><option value="calibrated">보정 키보드</option><option value="baseline">기본 키보드</option></select>
      <small>참가자를 시작한 뒤에는 바꾸지 마세요.</small>
    </label>

    <h2>초기화</h2>
    <div class="stack">
      <button data-r="clearModels" class="danger">현재 참가자 보정 모델 지우기</button>
      <button data-r="clearLog" class="danger">이 기기의 모든 기록 지우기</button>
    </div>

    <h2>화면 크기</h2>
    <p class="muted small" data-r="geom"></p>`;
  const $ = n => el.querySelector(`[data-r="${n}"]`);

  function sync() {
    $('mode').value = s.mode; $('xIs').value = s.xIs;
    $('simBox').hidden = s.mode !== 'sim';
    el.querySelectorAll('[data-s]').forEach(inp => { inp.value = s.sim[inp.dataset.s]; });
    el.querySelectorAll('[data-v]').forEach(sp => { sp.textContent = (+s.sim[sp.dataset.v]).toFixed(2); });
    const st = ctx.flowStatus();
    $('flow').innerHTML = st
      ? `<b>${ctx.participantLabel()}</b> · 순서 ${ctx.latinOrder()?.split('').join(' → ') ?? '-'}<br>${st.step + 1}/${st.total}단계: ${st.title}${st.done ? ' (완료)' : ''}
         <div class="row"><button data-j="-1">◀ 이전 단계</button><button data-j="1">다음 단계 ▶</button></div>
         <small class="muted">단계를 건너뛰면 그 단계의 기록은 남지 않습니다. 기술 문제가 있을 때만 쓰세요.</small>`
      : '진행 중인 참가자가 없습니다.';
    $('flow').querySelectorAll('[data-j]').forEach(b => b.onclick = () => { ctx.flowJump(+b.dataset.j); sync(); });
    const u = ctx.kb.unitPx;
    $('geom').textContent = `키 폭 ${(GEOM.keyW * u).toFixed(1)}px · 키 높이 ${(GEOM.keyH * u).toFixed(1)}px (CSS px). 실제 mm는 폰에서 자로 재서 기록하세요. 화면 ${window.innerWidth}×${window.innerHeight}, DPR ${window.devicePixelRatio}.`;
    document.body.classList.toggle('sim-mode', s.mode === 'sim');
  }

  function changed(what) {
    ctx.saveSettings();
    ctx.logger.log('settings', { pid: s.pid, changed: what, mode: s.mode, sim: s.sim, xIs: s.xIs });
    sync();
  }

  $('mode').onchange = () => { s.mode = $('mode').value; changed('mode'); };
  $('xIs').onchange = () => { s.xIs = $('xIs').value; changed('xIs'); };
  el.querySelectorAll('[data-s]').forEach(inp => {
    inp.oninput = () => { s.sim[inp.dataset.s] = +inp.value; sync(); };
    inp.onchange = () => changed('sim');
  });
  $('simReset').onclick = () => { s.sim = { ...SIM_PRESETS.glove }; changed('sim'); };
  $('clearModels').onclick = () => { if (confirm(`${s.pid}의 보정 모델을 지울까요? (기록은 남습니다)`)) { delete ctx.models[s.pid]; ctx.saveModels(); sync(); } };
  $('clearLog').onclick = async () => {
    if (confirm('이 기기의 모든 참가자 기록을 지울까요? 되돌릴 수 없습니다. 먼저 종합 화면에서 전체 기록을 내보내세요.')) { await ctx.logger.clear(); sync(); }
  };

  document.body.classList.toggle('sim-mode', s.mode === 'sim');
  return { el, show: sync };
}
