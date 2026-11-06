// summary.js — experimenter view: participant list → one participant's results, plus the overall table
// (실험자: 참가자 목록 → 개인 결과·내보내기, 전체 종합표, 다른 기기 로그 합치기)
import { CONDITIONS } from './config.js';
import { summarizeParticipants } from './aggregate.js';
import { participantDetail, detailToCsv } from './participant.js';
import { parseJSONL } from './logger.js';
import { TRIALS_PER_COND } from './steps.js';

const pct = v => (v == null ? '–' : (v * 100).toFixed(1) + '%');
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const kbText = k => (k === 'calibrated' ? '보정' : k === 'baseline' ? '기본' : k === 'same' ? '비슷함' : '–');
const handText = h => (h === 'glove' ? '장갑' : '맨손');
const condCell = c => `<td><b>${c.cond}</b><br><small>${kbText(c.keyboard)}·${handText(c.hand)}</small></td>`;

// Offset in words, e.g. "오른쪽 0.25 · 아래 0.30" (touch − key center, key units)
function offsetText(o) {
  if (!o) return '–';
  const part = (v, pos, neg) => `${v >= 0 ? pos : neg} ${Math.abs(v).toFixed(2)}`;
  return `${part(o.dx, '오른쪽', '왼쪽')}<br>${part(o.dy, '아래', '위')}`;
}

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
    <div data-r="listView">
      <h1>참가자별 결과</h1>
      <p class="lead">참가자를 누르면 그 사람의 결과를 보고 기록을 따로 내보낼 수 있습니다.</p>
      <div class="resume" data-r="people"></div>
      <h2>전체 종합표</h2>
      <p class="muted small">본 과제 문장 입력만 집계합니다. 화면 확인용이며, 분석은 내보낸 원본 로그로 합니다.</p>
      <label class="field">지표 <select data-r="metric">${Object.entries(METRICS).map(([k, m]) => `<option value="${k}">${m.label}</option>`).join('')}</select></label>
      <div class="table-wrap"><table class="result sum" data-r="sum"></table></div>
      <p class="muted small" data-r="note"></p>
      <h2>기록 내보내기 · 합치기</h2>
      <p class="muted small">여러 폰으로 진행했다면, 각 폰에서 <b>전체 기록 내보내기</b>를 한 뒤 한 기기에서 <b>다른 기기 기록 합치기</b>로 불러오세요. 같은 기록은 한 번만 들어갑니다.</p>
      <div class="stack">
        <button class="primary big" data-r="exportAll">전체 기록 내보내기 (JSONL)</button>
        <label class="file-btn big">다른 기기 기록 합치기<input type="file" accept=".jsonl,.json,.txt" multiple data-r="file" hidden></label>
      </div>
      <p data-r="msg"></p>
    </div>
    <div data-r="detailView" hidden></div>`;
  const $ = n => el.querySelector(`[data-r="${n}"]`);
  let selected = null;

  function renderList() {
    const summary = summarizeParticipants(ctx.logger.events);
    const metric = METRICS[$('metric').value];
    const conds = Object.keys(CONDITIONS);
    const label = pid => esc(ctx.participantLabel(pid));
    $('people').innerHTML = summary.map(p => {
      const done = conds.filter(c => p.conds[c].trials >= TRIALS_PER_COND).length;
      return `<button data-pid="${esc(p.pid)}">${label(p.pid)}<span>조건 ${done}/4 완료</span></button>`;
    }).join('') || '<div class="card">아직 참가자 기록이 없습니다.</div>';
    $('people').querySelectorAll('[data-pid]').forEach(b => b.onclick = () => { selected = b.dataset.pid; render(); window.scrollTo(0, 0); });

    const rows = summary.map(p => `<tr><td><b>${esc(p.pid)}</b>${ctx.participants[p.pid]?.alias ? `<br><small>${esc(ctx.participants[p.pid].alias)}</small>` : ''}</td>${conds.map(c => {
      const x = p.conds[c];
      if (!x.trials && !x.calibrated) return '<td class="muted">–</td>';
      return `<td>${metric.get(x)}${x.sim ? '<sup>s</sup>' : ''}<br><small>${x.trials}/${TRIALS_PER_COND}</small></td>`;
    }).join('')}</tr>`).join('');
    $('sum').innerHTML = `<tr><th>참가자</th>${conds.map(c => `<th>${c}<br><small>${kbText(CONDITIONS[c].keyboard)}·${handText(CONDITIONS[c].hand)}</small></th>`).join('')}</tr>` +
      (rows || `<tr><td colspan="5" class="muted">아직 참가자 기록이 없습니다.</td></tr>`);
    const complete = summary.filter(p => conds.every(c => p.conds[c].trials >= TRIALS_PER_COND)).length;
    $('note').innerHTML = `참가자 ${summary.length}명 · 4개 조건 모두 완료 ${complete}명 · 칸 아래 숫자 = 입력한 문장 수 · <sup>s</sup> = 시뮬레이션 입력 포함(실제 데이터 아님) · 이벤트 ${ctx.logger.events.length}개 · ${ctx.logger.storageLabel}`;
  }

  function renderDetail() {
    const d = participantDetail(ctx.logger.events, selected);
    const v = $('detailView');
    const table = (head, rows) => `<div class="table-wrap"><table class="result"><tr>${head.map(h => `<th>${h}</th>`).join('')}</tr>${rows}</table></div>`;
    const restarts = d.conds.filter(c => c.restarts > 0);
    v.innerHTML = `
      <button class="ghost" data-a="back">← 전체 목록</button>
      <p class="eyebrow" style="margin-top:16px">${d.finished ? '실험 완료' : '진행 중 또는 중단'}</p>
      <h1>${esc(ctx.participantLabel(selected))}</h1>
      <p class="lead">조건 순서 ${d.order ? d.order.split('').join(' → ') : '–'} · 키보드 터치 ${d.touches}회 기록</p>
      ${d.sim ? '<span class="tag sim">시뮬레이션 입력 포함(실제 데이터 아님)</span>' : ''}
      ${restarts.length ? `<div class="card warn small">다시 시작한 조건: ${restarts.map(c => `${c.cond} (${c.restarts}회)`).join(', ')}. 표는 마지막 시도만 집계합니다. 같은 문장을 다시 입력했으므로 연습 효과가 있을 수 있습니다.</div>` : ''}

      <h2>입력 결과</h2>
      ${table(['조건', '정확도', '이웃 키 오류', 'WPM', '지움'], d.conds.map(c => `<tr>${condCell(c)}<td>${c.shown ? pct(1 - c.shown.keyErrorRate) : '–'}</td><td>${pct(c.shown?.neighborErrorRate)}</td><td>${c.wpm == null ? '–' : c.wpm.toFixed(1)}</td><td>${c.shown?.backspaces ?? '–'}</td></tr>`).join(''))}
      <p class="muted small">글자 위치로 비교한 확인용 수치입니다. 글자를 빠뜨리거나 더 넣으면 오류가 과대 집계될 수 있습니다.</p>

      <h2>터치 어긋남과 보정</h2>
      ${table(['조건', '어긋남 (키 간격)', '보정 탭 정확도', '모델·시간'], d.conds.map(c => `<tr>${condCell(c)}<td>${offsetText(c.offset)}</td><td>${c.fit ? `기본 ${pct(c.fit.baselineAcc)}<br>보정 ${pct(c.fit.looAcc)}` : '–'}</td><td>${c.fit ? `${c.fit.model}<br><small>${c.fit.seconds != null ? `${Math.round(c.fit.seconds)}초` : '–'}</small>` : '–'}</td></tr>`).join(''))}
      <p class="muted small">어긋남 = 노란 키 중심에서 실제 터치까지의 중앙값(1 = 키 하나의 간격). 정확도는 보정 탭 43개 기준(보정 쪽은 LOO(하나 빼기) 검증)이라 우연 변동이 큽니다.</p>

      <h2>같은 터치를 두 방식으로 판정</h2>
      ${table(['조건', '기본 판정 이웃 키 오류', '보정 판정 이웃 키 오류'], d.conds.map(c => `<tr>${condCell(c)}<td>${pct(c.base?.neighborErrorRate)}</td><td>${pct(c.cal?.neighborErrorRate)}</td></tr>`).join(''))}
      <p class="muted small">섀도 로깅(화면에 반영되지 않은 쪽도 함께 기록) 재계산입니다. 화면에 보인 글자에 따라 사람이 반응한 효과는 빠져 있습니다.</p>

      <h2>설문</h2>
      ${table(['조건', 'NASA-TLX (0–100)', '불편도 (1–7)'], d.conds.map(c => `<tr>${condCell(c)}<td>${c.tlx == null ? '–' : c.tlx.toFixed(1)}</td><td>${c.discomfort ?? '–'}</td></tr>`).join(''))}
      <div class="card small">SUS(사용성 점수): 보정 키보드 <b>${d.sus.calibrated ?? '–'}</b> · 기본 키보드 <b>${d.sus.baseline ?? '–'}</b><br>
        더 좋았던 키보드: 장갑 <b>${kbText(d.preference?.glove)}</b> · 맨손 <b>${kbText(d.preference?.bare)}</b></div>

      <h2>이 참가자만 내보내기</h2>
      <div class="stack">
        <button class="primary big" data-a="csv">결과 요약 (CSV, 엑셀용)</button>
        <button class="big" data-a="jsonl">원본 기록 (JSONL, 터치 좌표 포함)</button>
      </div>`;
    v.querySelector('[data-a="back"]').onclick = () => { selected = null; render(); window.scrollTo(0, 0); };
    v.querySelector('[data-a="csv"]').onclick = () => ctx.logger.download(`glovekb_${selected}_summary.csv`, '﻿' + detailToCsv(d), 'text/csv'); // BOM: Excel reads UTF-8
    v.querySelector('[data-a="jsonl"]').onclick = async () => { await ctx.logger.flush(); ctx.logger.export(selected); };
  }

  function render() {
    $('listView').hidden = !!selected;
    $('detailView').hidden = !selected;
    if (selected) renderDetail(); else renderList();
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

  return { el, show() { selected = null; render(); } };
}
