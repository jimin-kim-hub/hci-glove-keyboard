// participants.js — start/resume a participant, per-condition progress, summary across all
// participants, and merging logs from other devices (참가자 시작·진행·종합·병합)
import { CONDITIONS } from './config.js';
import { summarizeParticipants, nextParticipantId } from './aggregate.js';
import { parseJSONL } from './logger.js';

const pct = v => (v == null ? '–' : (v * 100).toFixed(1) + '%');
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const TRIALS_PER_COND = 8;

const METRICS = {
  nbr: { label: '이웃 키 오류율', get: c => pct(c.shown?.neighborErrorRate) },
  ker: { label: '키 오류율', get: c => pct(c.shown?.keyErrorRate) },
  wpm: { label: 'WPM', get: c => (c.wpm == null ? '–' : c.wpm.toFixed(1)) },
  replay: { label: '재생: 기본→보정 이웃 키 오류', get: c => (c.base ? `${pct(c.base.neighborErrorRate)}→${pct(c.cal?.neighborErrorRate)}` : '–') },
};

export function createParticipantScreen(ctx) {
  const el = document.createElement('section');
  el.className = 'screen scroll';
  el.innerHTML = `
    <h2>참가자</h2>
    <div class="card" data-r="current"></div>

    <h3>새 참가자 시작</h3>
    <div class="form">
      <label>참가자 번호 <small class="muted">조건 순서·문장 세트가 이 번호로 정해집니다</small>
        <input data-r="num" type="number" inputmode="numeric" min="1" max="99"></label>
      <label>별명 (선택) <small class="muted">실명 금지 · 이 기기 화면에만 표시, 로그·내보내기에는 번호만 저장</small>
        <input data-r="alias" maxlength="12" placeholder="예: 곰돌이"></label>
      <button class="primary" data-r="start">시작 → 첫 조건 보정</button>
      <div class="muted small">P00은 데모·연습용이라 종합에서 빠집니다. 파일럿은 90번대를 쓰는 식으로 구분하세요.</div>
    </div>

    <h3>전체 참가자 종합 <small>본 과제(main)만 · 화면 확인용, 분석은 원본 로그로</small></h3>
    <div class="row"><select data-r="metric">${Object.entries(METRICS).map(([k, m]) => `<option value="${k}">${m.label}</option>`).join('')}</select></div>
    <div class="table-wrap"><table class="mini sum" data-r="sum"></table></div>
    <div class="muted small" data-r="sumNote"></div>

    <h3>다른 기기 로그 합치기</h3>
    <p class="hint">여러 폰에서 진행했다면 각 폰에서 내보낸 JSONL을 여기서 불러오세요. 같은 이벤트는 한 번만 들어갑니다.</p>
    <div class="row">
      <label class="file-btn">JSONL 불러오기 (여러 개)<input type="file" accept=".jsonl,.json,.txt" multiple data-r="file" hidden></label>
      <button data-r="exportAll">전체 로그 내보내기</button>
    </div>
    <div class="muted" data-r="importMsg"></div>`;
  const $ = n => el.querySelector(`[data-r="${n}"]`);

  function knownPids(summary) {
    return [...new Set([...summary.map(p => p.pid), ...Object.keys(ctx.participants)])].filter(p => p !== 'P00');
  }

  function render() {
    const summary = summarizeParticipants(ctx.logger.events);
    const byPid = Object.fromEntries(summary.map(p => [p.pid, p]));
    const pid = ctx.settings.pid;
    const order = ctx.latinOrder() || 'ABCD';
    const me = byPid[pid];

    // Current participant: conditions in counterbalanced order with progress
    const chips = [...order].map((c, j) => {
      const s = me?.conds[c];
      const calibrated = !!ctx.entry(pid, c) || !!s?.calibrated;
      const trials = s?.trials ?? 0;
      const done = trials >= TRIALS_PER_COND;
      const cur = c === ctx.settings.cond;
      return `<button class="chip ${done ? 'done' : ''} ${cur ? 'cur' : ''}" data-cond="${c}">
        <b>${j + 1}. ${esc(ctx.condLabel(c))}</b><span>${calibrated ? '보정 ✓' : '보정 전'} · 문장 ${trials}/${TRIALS_PER_COND}</span></button>`;
    }).join('');
    $('current').innerHTML = pid === 'P00'
      ? `<b>현재: P00 (데모·연습용)</b><div class="muted">아래에서 참가자를 시작하세요.</div>`
      : `<div class="big">현재 참가자 ${esc(ctx.participantLabel())}</div>
         <div class="muted small">순서 ${ctx.latinOrder() ? order.split('').join(' → ') : '(번호 없음 — 기본 순서)'} · 조건을 누르면 그 조건으로 이동</div>
         <div class="chips">${chips}</div>
         <div class="row"><button data-r="exportMe">${esc(pid)} 로그 내보내기</button><button data-r="toDemoUser">P00(데모)로 전환</button></div>`;
    $('current').querySelectorAll('[data-cond]').forEach(b => b.onclick = () => {
      ctx.settings.cond = b.dataset.cond;
      ctx.saveSettings();
      ctx.logger.log('settings', { pid, changed: 'cond', cond: ctx.settings.cond });
      ctx.go(ctx.entry() ? 'trial' : 'calib');
    });
    const ex = $('current').querySelector('[data-r="exportMe"]');
    if (ex) ex.onclick = async () => { await ctx.logger.flush(); ctx.logger.export(pid); };
    const dm = $('current').querySelector('[data-r="toDemoUser"]');
    if (dm) dm.onclick = () => { ctx.settings.pid = 'P00'; ctx.saveSettings(); render(); };

    // New participant defaults to the next free number
    const pids = knownPids(summary);
    $('num').value = ctx.pnum(nextParticipantId(pids));
    $('alias').value = '';

    // Summary table
    const metric = METRICS[$('metric').value] ?? METRICS.nbr;
    const rows = pids.sort().map(p => {
      const s = byPid[p];
      const cells = Object.keys(CONDITIONS).map(c => {
        const x = s?.conds[c];
        if (!x || (!x.trials && !x.calibrated)) return '<td class="muted">–</td>';
        return `<td>${metric.get(x)}${x.sim ? '<sup>s</sup>' : ''}<br><small>${x.trials}문장</small></td>`;
      }).join('');
      return `<tr data-pid="${esc(p)}" class="${p === pid ? 'cur' : ''}"><td><b>${esc(p)}</b>${ctx.participants[p]?.alias ? `<br><small>${esc(ctx.participants[p].alias)}</small>` : ''}</td>${cells}</tr>`;
    }).join('');
    $('sum').innerHTML = `<tr><th>참가자</th>${Object.keys(CONDITIONS).map(c => `<th>${c}</th>`).join('')}</tr>` +
      (rows || `<tr><td colspan="5" class="muted">아직 참가자 데이터가 없습니다.</td></tr>`);
    $('sum').querySelectorAll('tr[data-pid]').forEach(tr => tr.onclick = () => {
      if (tr.dataset.pid === pid) return;
      if (confirm(`${tr.dataset.pid}(으)로 전환할까요?`)) { ctx.startParticipant(tr.dataset.pid); render(); }
    });
    const complete = summary.filter(p => p.pid !== 'P00' && Object.values(p.conds).every(c => c.trials >= TRIALS_PER_COND)).length;
    $('sumNote').innerHTML = `참가자 ${pids.length}명 · 4개 조건 모두 완료 ${complete}명 · <sup>s</sup> = 시뮬레이션 입력 포함(실제 데이터 아님) · 행을 누르면 그 참가자로 전환`;
  }

  $('metric').onchange = render;
  $('start').onclick = () => {
    const n = parseInt($('num').value, 10);
    if (!(n >= 1 && n <= 99)) { alert('참가자 번호는 1–99 사이 숫자로 입력하세요.'); return; }
    const pid = `P${String(n).padStart(2, '0')}`;
    const exists = !!ctx.participants[pid] || ctx.logger.events.some(e => e.pid === pid);
    if (exists && !confirm(`${pid}은(는) 이미 기록이 있습니다. 이어서 진행할까요?`)) return;
    ctx.startParticipant(pid, $('alias').value.trim());
    ctx.go('calib');
  };
  $('file').onchange = async (e) => {
    let added = 0, skipped = 0;
    for (const f of e.target.files) {
      const r = await ctx.logger.importEvents(parseJSONL(await f.text()));
      added += r.added; skipped += r.skipped;
    }
    $('importMsg').textContent = `${e.target.files.length}개 파일: 이벤트 ${added}개 추가, 중복 ${skipped}개 건너뜀.`;
    e.target.value = '';
    render();
  };
  $('exportAll').onclick = async () => { await ctx.logger.flush(); ctx.logger.export(); };

  return { el, show() { ctx.kb.setTarget(null); ctx.kb.setOverlay(null); render(); } };
}
