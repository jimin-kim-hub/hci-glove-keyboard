// summary.js — experimenter view: all participants × conditions, merge logs from other devices
// (실험자: 전체 참가자 종합표, 다른 기기 로그 합치기)
import { CONDITIONS } from './config.js';
import { summarizeParticipants } from './aggregate.js';
import { parseJSONL } from './logger.js';
import { TRIALS_PER_COND } from './steps.js';

const pct = v => (v == null ? '–' : (v * 100).toFixed(1) + '%');
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const METRICS = {
  nbr: { label: '이웃 키 오류율 (주 지표)', get: c => pct(c.shown?.neighborErrorRate) },
  ker: { label: '키 오류율', get: c => pct(c.shown?.keyErrorRate) },
  wpm: { label: 'WPM', get: c => (c.wpm == null ? '–' : c.wpm.toFixed(1)) },
  replay: { label: '재생: 기본→보정 이웃 키 오류', get: c => (c.base ? `${pct(c.base.neighborErrorRate)}→${pct(c.cal?.neighborErrorRate)}` : '–') },
};

export function createSummaryScreen(ctx) {
  const el = document.createElement('section');
  el.className = 'screen page';
  el.innerHTML = `
    <h1>전체 참가자 종합</h1>
    <p class="muted">본 과제 문장 입력만 집계합니다. 화면 확인용이며, 분석은 내보낸 원본 로그로 합니다.</p>
    <label class="field">지표 <select data-r="metric">${Object.entries(METRICS).map(([k, m]) => `<option value="${k}">${m.label}</option>`).join('')}</select></label>
    <div class="table-wrap"><table class="result sum" data-r="sum"></table></div>
    <p class="muted small" data-r="note"></p>
    <h2>기록 내보내기 · 합치기</h2>
    <p class="muted">여러 폰으로 진행했다면, 각 폰에서 <b>전체 기록 내보내기</b>를 한 뒤 한 기기에서 <b>다른 기기 기록 합치기</b>로 불러오세요. 같은 기록은 한 번만 들어갑니다.</p>
    <div class="stack">
      <button class="primary big" data-r="exportAll">전체 기록 내보내기 (JSONL)</button>
      <label class="file-btn big">다른 기기 기록 합치기<input type="file" accept=".jsonl,.json,.txt" multiple data-r="file" hidden></label>
    </div>
    <p data-r="msg"></p>`;
  const $ = n => el.querySelector(`[data-r="${n}"]`);

  function render() {
    const summary = summarizeParticipants(ctx.logger.events);
    const metric = METRICS[$('metric').value];
    const conds = Object.keys(CONDITIONS);
    const rows = summary.map(p => `<tr><td><b>${esc(p.pid)}</b>${ctx.participants[p.pid]?.alias ? `<br><small>${esc(ctx.participants[p.pid].alias)}</small>` : ''}</td>${conds.map(c => {
      const x = p.conds[c];
      if (!x.trials && !x.calibrated) return '<td class="muted">–</td>';
      return `<td>${metric.get(x)}${x.sim ? '<sup>s</sup>' : ''}<br><small>${x.trials}/${TRIALS_PER_COND}</small></td>`;
    }).join('')}</tr>`).join('');
    $('sum').innerHTML = `<tr><th>참가자</th>${conds.map(c => `<th>${c}<br><small>${CONDITIONS[c].keyboard === 'calibrated' ? '보정' : '기본'}·${CONDITIONS[c].hand === 'glove' ? '장갑' : '맨손'}</small></th>`).join('')}</tr>` +
      (rows || `<tr><td colspan="5" class="muted">아직 참가자 기록이 없습니다.</td></tr>`);
    const complete = summary.filter(p => conds.every(c => p.conds[c].trials >= TRIALS_PER_COND)).length;
    $('note').innerHTML = `참가자 ${summary.length}명 · 4개 조건 모두 완료 ${complete}명 · 칸 아래 숫자 = 입력한 문장 수 · <sup>s</sup> = 시뮬레이션 입력 포함(실제 데이터 아님) · 이벤트 ${ctx.logger.events.length}개 · ${ctx.logger.storageLabel}`;
  }

  $('metric').onchange = render;
  $('exportAll').onclick = async () => { await ctx.logger.flush(); ctx.logger.export(); };
  $('file').onchange = async (e) => {
    let added = 0, skipped = 0;
    for (const f of e.target.files) {
      const r = await ctx.logger.importEvents(parseJSONL(await f.text()));
      added += r.added; skipped += r.skipped;
    }
    $('msg').textContent = `${e.target.files.length}개 파일: 기록 ${added}개 추가, 중복 ${skipped}개 건너뜀.`;
    e.target.value = '';
    render();
  };

  return { el, show: render };
}
