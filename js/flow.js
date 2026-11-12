// flow.js — the participant-facing session: nickname → guided steps → results
// (참가자 진행 화면: 별명 입력 → 안내에 따라 순서대로 → 마지막에 결과)
import { COND_INDEX, CONDITIONS } from './config.js';
import { buildSteps } from './steps.js';
import { runCalibration } from './calibrun.js';
import { runTyping } from './typerun.js';
import { TLX_ITEMS, DISCOMFORT, SUS_ITEMS, DEMOGRAPHICS, susScore, tlxRaw } from './surveys.js';
import { summarizeParticipants, nextParticipantId } from './aggregate.js';

const FLOW_KEY = 'glovekb.flow.v1'; // { pid: { step, done } }
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const handText = h => (h === 'glove' ? '장갑' : '맨손');

// Sticky bottom button used on every non-keyboard step (모든 화면 공통 하단 버튼)
const cta = (label, { id = 'next', disabled = false, hint = '' } = {}) =>
  `<div class="actions"><button class="primary big" id="${id}"${disabled ? ' disabled' : ''}>${label}</button>${hint ? `<span class="hint">${hint}</span>` : ''}</div>`;

let PHRASES = null;
async function loadPhrases() {
  if (!PHRASES) PHRASES = await (await fetch('data/phrases.json')).json();
  return PHRASES;
}

export function createFlowScreen(ctx) {
  const el = document.createElement('section');
  el.className = 'screen page';
  let progress = {};
  try { progress = JSON.parse(localStorage.getItem(FLOW_KEY)) || {}; } catch (e) { /* ignore */ }
  const saveProgress = () => { try { localStorage.setItem(FLOW_KEY, JSON.stringify(progress)); } catch (e) { /* ignore */ } };

  let steps = [], runner = null, renderSeq = 0;
  const pid = () => ctx.settings.pid;
  const cur = () => progress[pid()];
  const stepbar = document.getElementById('stepbar');
  const exitBtn = document.getElementById('exit-btn');

  function setKeyboard(on) {
    document.body.classList.toggle('kb-on', on);
    ctx.kb.setTarget(null);
    ctx.kb.setOverlay(null);
  }

  function setStepbar(text, frac, count = '') {
    stepbar.hidden = text == null;
    exitBtn.hidden = text == null;
    if (text == null) return;
    stepbar.querySelector('.st-title').textContent = text;
    stepbar.querySelector('.st-count').textContent = count;
    stepbar.querySelector('.progress div').style.width = `${Math.round(frac * 100)}%`;
  }

  // ---------- start screen ----------
  function renderWelcome() {
    renderSeq++; // cancels any step still loading (로딩 중인 단계 취소)
    runner = null;
    setKeyboard(false);
    setStepbar(null);
    const pids = [...new Set([...Object.keys(ctx.participants), ...ctx.logger.events.map(e => e.pid)])].filter(p => p && p !== 'P00');
    const nextPid = nextParticipantId(pids);
    const unfinished = Object.entries(progress).filter(([p, s]) => p !== 'P00' && !s.done);
    el.innerHTML = `
      <div class="hero sm">🧤</div>
      <p class="eyebrow">HCI 팀 프로젝트 실험</p>
      <h1>장갑 키보드 실험에<br>오신 것을 환영해요</h1>
      <p class="lead">영어 문장을 휴대폰 키보드로 따라 입력하는 실험입니다. 약 40분 걸리며, 화면 안내를 따라 순서대로 진행합니다.</p>
      <label class="field">별명을 입력하세요
        <input id="alias" maxlength="12" autocomplete="off" placeholder="예: 곰돌이">
        <small>실명은 쓰지 마세요. 별명은 이 기기 화면에만 표시되고, 기록에는 참가자 번호만 남습니다.</small>
      </label>
      <details class="exp-only">
        <summary>실험자: 참가자 번호 <b>${nextPid}</b> 자동 배정 (바꾸려면 열기)</summary>
        <label class="field">참가자 번호 (1–99, 조건 순서·문장 세트를 정함)
          <input id="num" type="number" inputmode="numeric" min="1" max="99" value="${ctx.pnum(nextPid)}"></label>
      </details>
      ${unfinished.length ? `<h2>이어서 하기</h2><div class="resume">${unfinished.map(([p, s]) =>
        `<button data-pid="${esc(p)}">${esc(ctx.participantLabel(p))}<span>${s.step + 1}단계부터</span></button>`).join('')}</div>` : ''}
      ${cta('시작하기', { id: 'go' })}`;
    el.querySelector('#go').onclick = () => {
      const alias = el.querySelector('#alias').value.trim();
      if (!alias) { el.querySelector('#alias').focus(); return; }
      const n = parseInt(el.querySelector('#num').value, 10);
      if (!(n >= 1 && n <= 99)) { alert('참가자 번호는 1–99 사이여야 합니다.'); return; }
      const p = `P${String(n).padStart(2, '0')}`;
      if ((pids.includes(p) || progress[p]) && !confirm(`${p}은(는) 이미 기록이 있습니다. 같은 번호로 계속할까요?`)) return;
      begin(p, alias);
    };
    el.querySelectorAll('.resume [data-pid]').forEach(b => b.onclick = () => begin(b.dataset.pid));
  }

  function begin(p, alias) {
    ctx.startParticipant(p, alias);
    if (!progress[p]) progress[p] = { step: 0, done: false };
    saveProgress();
    renderStep();
  }

  // Back to the start screen; progress is kept and "이어서 하기" resumes this step from its beginning
  exitBtn.onclick = () => {
    const s = cur();
    if (!s) return;
    if (!s.done && !confirm(`시작 화면으로 나갈까요?\n\n진행 상황은 저장됩니다. 나중에 '이어서 하기'를 누르면 지금 단계(${s.step + 1}단계)의 처음부터 다시 합니다.`)) return;
    ctx.logger.log('flow_exit', { pid: pid(), step: s.step, done: s.done });
    ctx.settings.pid = 'P00';
    ctx.saveSettings();
    renderWelcome();
  };

  // ---------- steps ----------
  function advance(delta = 1) {
    const s = cur();
    if (!s) return; // e.g. the participant left during the short "준비 완료" pause
    s.step = Math.max(0, Math.min(steps.length - 1, s.step + delta));
    saveProgress();
    renderStep();
  }

  // a newer render cancels an older one still loading (빠른 단계 이동 시 덮어쓰기 방지)
  async function renderStep() {
    const s = cur();
    if (!s || pid() === 'P00') return renderWelcome();
    const seq = ++renderSeq;
    await loadPhrases();
    if (seq !== renderSeq) return;
    const order = ctx.latinOrder() || 'ABCD';
    steps = buildSteps(order, ctx.settings.xIs);
    const step = steps[s.step];
    runner = null;
    window.scrollTo(0, 0);
    setStepbar(step.title, s.step / (steps.length - 1), `${ctx.participantLabel()} · ${s.step + 1} / ${steps.length}`);
    ctx.logger.log('flow_step', { pid: pid(), step: s.step, type: step.type, cond: step.cond ?? null });
    const keyboardStep = step.type === 'calib' || step.type === 'typing';
    setKeyboard(keyboardStep);
    if (step.cond && CONDITIONS[step.cond]) { ctx.settings.cond = step.cond; ctx.saveSettings(); }
    const render = RENDER[step.type];
    await render(step);
  }

  const RENDER = {
    intro() {
      el.innerHTML = `
        <p class="eyebrow">시작 전에</p>
        <h1>실험은 이렇게 진행돼요</h1>
        <ul class="steps-list">
          <li>두 가지 영어 키보드 <b>X</b>와 <b>Y</b>로, 화면에 나온 문장을 따라 입력합니다.</li>
          <li>휴대폰은 <b>세로로</b>, <b>두 손으로</b> 잡고 <b>양쪽 엄지</b>로 입력해 주세요.</li>
          <li>장갑을 <b>낀 상태</b>와 <b>벗은 상태</b>를 번갈아 진행합니다.</li>
          <li>각 키보드를 쓰기 전에 <b>노란 키를 차례로 누르는 준비 단계(약 1분)</b>가 있습니다.</li>
          <li>문장은 <b>빠르고 정확하게</b> 입력하세요. 틀린 걸 알아차리면 ⌫로 지워도 됩니다. 자동완성은 없습니다.</li>
          <li>각 단계가 끝나면 짧은 설문이 있고, 중간에 쉬는 시간이 있습니다.</li>
          <li>참여는 자발적이며 <b>언제든 그만둘 수 있습니다.</b></li>
        </ul>
        <label class="check exp-only"><input type="checkbox" id="consent"> 실험자 확인: 동의서 서명을 받았습니다</label>
        ${cta('다음', { disabled: true, hint: '실험자가 동의서를 확인하면 버튼이 켜집니다' })}`;
      const cb = el.querySelector('#consent'), nx = el.querySelector('#next');
      cb.onchange = () => { nx.disabled = !cb.checked; };
      nx.onclick = () => { ctx.logger.log('consent_confirmed', { pid: pid() }); advance(); };
    },

    demo() {
      el.innerHTML = `<p class="eyebrow">시작 전에</p><h1>간단한 질문 몇 가지</h1>
        <p class="lead">이름이나 연락처는 묻지 않습니다. 답은 참가자 번호로만 기록됩니다.</p>
        ${DEMOGRAPHICS.map(d => `<div class="q${d.exp ? ' exp-only' : ''}"><div class="qtext">${d.q}</div>
          <div class="likert${d.options.length > 3 && !d.anchors ? ' grid' : ''}" data-likert="${d.key}">${d.options.map(([v, l]) => `<button data-v="${v}">${l}</button>`).join('')}</div>
          ${d.anchors ? `<div class="anchors"><span>${d.anchors[0]}</span><span>${d.anchors[1]}</span></div>` : ''}</div>`).join('')}
        ${cta('다음', { disabled: true })}`;
      const ans = {};
      const nx = el.querySelector('#next');
      el.querySelectorAll('[data-likert]').forEach(box => bindLikert(box, v => {
        ans[box.dataset.likert] = String(v);
        nx.disabled = DEMOGRAPHICS.some(d => ans[d.key] == null);
      }));
      nx.onclick = () => {
        ctx.logger.log('demographics', { pid: pid(), ...ans, englishFreq: +ans.englishFreq });
        advance();
      };
    },

    hand(step) {
      let body;
      if (step.practice) {
        body = `<div class="hero">✋</div><h1>연습을 시작합니다</h1>
          <p class="lead"><b>장갑을 벗고 맨손</b>으로 준비해 주세요.</p>
          <ol class="steps-list"><li>노란 키 차례로 누르기 (연습)</li><li>키보드 X로 문장 3개</li><li>키보드 Y로 문장 3개</li></ol>`;
      } else if (step.final) {
        body = `<div class="hero">🎉</div><h1>입력 과제가 모두 끝났습니다</h1>
          <p class="lead">장갑을 벗어 주세요. 다음 화면에서 결과를 보여 드립니다.</p>`;
      } else {
        const glove = step.hand === 'glove';
        body = `<div class="hero">${glove ? '🧤' : '✋'}</div>
          <h1>${glove ? '장갑을 껴 주세요' : '장갑을 벗어 주세요'}</h1>
          <p class="lead">${glove ? '양손에 장갑을 낀 상태로' : '맨손으로'} 진행합니다. 이번 키보드는 <b class="kb-tag">${step.kbLabel}</b> 입니다.</p>
          <ol class="steps-list"><li>노란 키 차례로 누르기 (약 1분)</li><li>문장 8개 입력 (약 3분)</li><li>짧은 설문 2개 (작업 부담·사용성)</li></ol>`;
      }
      el.innerHTML = `<div class="status">${body}</div>${cta('준비됐어요')}`;
      el.querySelector('#next').onclick = () => advance();
    },

    calib(step) {
      el.innerHTML = `<p class="eyebrow">${step.phase === 'practice' ? '준비 단계 연습' : '준비 단계'} · ${handText(step.hand)}</p><div id="host"></div>`;
      runner = runCalibration(ctx, el.querySelector('#host'), {
        logFields: { pid: pid(), cond: step.cond, phase: step.phase, keyboard: step.keyboard, hand: step.hand },
        onDone(entry) {
          ctx.setEntry(entry, pid(), step.modelKey); // frozen; never updated during typing
          runner = null;
          el.querySelector('#host').innerHTML = `<div class="status"><div class="hero">✅</div><h1>준비 완료!</h1><p class="lead">잠시 후 넘어갑니다.</p></div>`;
          setTimeout(() => advance(), 900);
        },
      });
    },

    async typing(step) {
      const P = await loadPhrases();
      const phrases = step.phase === 'practice'
        ? P.practice.slice(step.phraseFrom, step.phraseFrom + step.count)
        : P.sets[(COND_INDEX[step.cond] + ctx.pnum()) % 4].slice(0, step.count); // S[(k + p) mod 4]
      const entry = ctx.entry(pid(), step.modelKey);
      const model = entry?.model ?? null;
      el.innerHTML = `<p class="eyebrow">키보드 <span class="kb-tag">${step.kbLabel}</span> · ${handText(step.hand)}${step.phase === 'practice' ? ' · 연습' : ''}</p>
        <div id="host"></div>`;
      // Marks a fresh attempt: a restarted step replaces the earlier partial one in the live summary
      ctx.logger.log('typing_start', { pid: pid(), cond: step.cond, phase: step.phase, keyboard: step.keyboard, hand: step.hand });
      runner = runTyping(ctx, el.querySelector('#host'), {
        phrases, keyboard: step.keyboard, model, alt: entry?.alt ?? null,
        logFields: { pid: pid(), cond: step.cond, phase: step.phase, keyboard: step.keyboard, hand: step.hand, kbLabel: step.kbLabel },
        onDone() { runner = null; advance(); },
      });
    },

    tlx(step) {
      el.innerHTML = `<p class="eyebrow">키보드 ${step.kbLabel} · ${handText(step.hand)}</p><h1>방금 한 과제는 어땠나요?</h1>
        <p class="lead">막대를 움직여 답해 주세요. 7개 문항에 모두 답하면 다음으로 넘어갑니다.</p>
        ${TLX_ITEMS.map((it, j) => `
          <div class="q"><div class="qtitle">${j + 1}. ${it.name}</div><div class="qtext">${it.q}</div>
            <input type="range" min="0" max="100" step="5" value="50" class="untouched" data-tlx="${j}">
            <div class="anchors"><span>${it.lo}</span><span class="val" data-val="${j}">선택 안 함</span><span>${it.hi}</span></div></div>`).join('')}
        <div class="q"><div class="qtitle">7. 불편도</div><div class="qtext">${DISCOMFORT.q}</div>
          <div class="likert" data-likert="d">${Array.from({ length: DISCOMFORT.max }, (_, k) => `<button data-v="${k + 1}">${k + 1}</button>`).join('')}</div>
          <div class="anchors"><span>${DISCOMFORT.lo}</span><span>${DISCOMFORT.hi}</span></div></div>
        ${cta('다음', { disabled: true })}`;
      const tlx = Array(6).fill(null);
      let disc = null;
      const nx = el.querySelector('#next');
      const check = () => { nx.disabled = tlx.some(v => v == null) || disc == null; };
      el.querySelectorAll('[data-tlx]').forEach(r => r.oninput = () => {
        const j = +r.dataset.tlx;
        tlx[j] = +r.value;
        r.classList.remove('untouched');
        el.querySelector(`[data-val="${j}"]`).textContent = r.value;
        check();
      });
      bindLikert(el.querySelector('[data-likert="d"]'), v => { disc = v; check(); });
      nx.onclick = () => {
        ctx.logger.log('survey', { pid: pid(), cond: step.cond, keyboard: step.keyboard, hand: step.hand, kbLabel: step.kbLabel, tlx, tlxRaw: tlxRaw(tlx), discomfort: disc });
        advance();
      };
    },

    rest(step) {
      const t0 = Date.now();
      el.innerHTML = `<div class="status"><div class="hero">☕</div><h1>잠시 쉬어 가세요</h1>
        <p class="lead">손을 풀고 쉬세요. 준비되면 계속하기를 누르세요.</p>
        <div class="timer">0:00</div><p class="muted small">4개 중 ${step.block}개 완료</p></div>
        ${cta('계속하기')}`;
      const timer = el.querySelector('.timer');
      const iv = setInterval(() => {
        if (!el.contains(timer)) return clearInterval(iv);
        const s = Math.floor((Date.now() - t0) / 1000);
        timer.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
      }, 1000);
      el.querySelector('#next').onclick = () => { clearInterval(iv); advance(); };
    },

    sus(step) {
      el.innerHTML = `<p class="eyebrow">키보드 <span class="kb-tag">${step.kbLabel}</span> · ${handText(step.hand)} · 사용성 설문</p><h1>방금 쓴 키보드는 어땠나요?</h1>
        <p class="lead">방금 ${handText(step.hand)} 상태로 쓴 경험만 떠올려 답해 주세요.<br><b>1</b> 전혀 그렇지 않다 · <b>5</b> 매우 그렇다</p>
        ${SUS_ITEMS.map((q, j) => `<div class="q"><div class="qtitle">${j + 1} / 10</div><div class="qtext">${q}</div>
          <div class="likert" data-likert="${j}">${[1, 2, 3, 4, 5].map(v => `<button data-v="${v}">${v}</button>`).join('')}</div>
          <div class="anchors"><span>전혀 그렇지 않다</span><span>매우 그렇다</span></div></div>`).join('')}
        ${cta('다음', { disabled: true })}`;
      const r = Array(10).fill(null);
      const nx = el.querySelector('#next');
      el.querySelectorAll('[data-likert]').forEach(box => bindLikert(box, v => { r[+box.dataset.likert] = v; nx.disabled = r.some(x => x == null); }));
      nx.onclick = () => {
        ctx.logger.log('sus', { pid: pid(), cond: step.cond, keyboard: step.keyboard, hand: step.hand, kbLabel: step.kbLabel, items: r, score: susScore(r) });
        advance();
      };
    },

    pref(step) {
      // One hand state at a time, right after both keyboards were used in it (손 상태별, 두 키보드를 다 쓴 직후)
      const glove = step.hand === 'glove';
      const order = ['첫 번째', '두 번째', '세 번째', '네 번째'];
      const reminder = (step.blocks ?? []).map(b => `<li><b class="kb-tag">${b.kbLabel}</b> — ${order[b.block - 1] ?? `${b.block}번째`} 조건 (${handText(step.hand)})</li>`).join('');
      el.innerHTML = `<p class="eyebrow">키보드 비교 · ${handText(step.hand)}</p>
        <h1>${glove ? '장갑을 꼈을 때' : '맨손일 때'}<br>어느 키보드가 더 좋았나요?</h1>
        <p class="lead">방금까지 ${glove ? '장갑을 끼고' : '맨손으로'} 두 키보드를 모두 써 봤습니다.</p>
        <ol class="steps-list">${reminder}</ol>
        <div class="q"><div class="likert wide" data-likert="choice"><button data-v="X">X</button><button data-v="same">비슷함</button><button data-v="Y">Y</button></div></div>
        ${cta('다음', { disabled: true })}`;
      let choice = null;
      const nx = el.querySelector('#next');
      bindLikert(el.querySelector('[data-likert]'), v => { choice = v; nx.disabled = false; });
      nx.onclick = () => {
        const kb = choice === 'same' ? 'same' : (choice === 'X') === (ctx.settings.xIs === 'calibrated') ? 'calibrated' : 'baseline';
        ctx.logger.log('preference', { pid: pid(), hand: step.hand, choice, keyboard: kb, blocks: (step.blocks ?? []).map(b => b.cond) });
        advance();
      };
    },

    async results() {
      await ctx.logger.flush();
      cur().done = true;
      saveProgress();
      ctx.logger.log('participant_end', { pid: pid() });
      const mine = ctx.logger.events.filter(e => e.pid === pid());
      const sum = summarizeParticipants(mine)[0];
      const sus = Object.fromEntries(mine.filter(e => e.ev === 'sus' && e.cond).map(e => [e.cond, e.score]));
      const xIsCal = ctx.settings.xIs === 'calibrated';
      const rows = ['X', 'Y'].flatMap(lbl => ['bare', 'glove'].map(hand => {
        const kb = (lbl === 'X') === xIsCal ? 'calibrated' : 'baseline';
        const cond = Object.keys(CONDITIONS).find(c => CONDITIONS[c].keyboard === kb && CONDITIONS[c].hand === hand);
        const c = sum?.conds[cond];
        const acc = c?.shown ? `${((1 - c.shown.keyErrorRate) * 100).toFixed(1)}%` : '–';
        const wpmTxt = c?.wpm != null ? c.wpm.toFixed(1) : '–';
        return `<tr><td>키보드 ${lbl}</td><td>${handText(hand)}</td><td>${acc}</td><td>${wpmTxt}</td><td>${sus[cond] ?? '–'}</td></tr>`;
      })).join('');
      el.innerHTML = `<div class="status"><div class="hero">🙏</div><h1>참여해 주셔서<br>감사합니다!</h1>
        <p class="lead">${esc(ctx.participantLabel())} 님의 결과입니다.</p></div>
        <table class="result">
          <tr><th>키보드</th><th>손</th><th>정확도</th><th>속도 (WPM)</th><th>SUS</th></tr>${rows}
        </table>
        <p class="muted small">정확도 = 의도한 글자가 그대로 입력된 비율, WPM = 분당 단어 수(5글자 = 1단어), SUS = 사용성 점수(0–100). 참고용 수치입니다.</p>
        <div class="card accent">키보드 <b>${xIsCal ? 'X' : 'Y'}</b>는 장갑 상황에 맞춰 터치 위치를 보정하는 <b>새 키보드</b>였고,
          키보드 <b>${xIsCal ? 'Y' : 'X'}</b>는 보정 없는 <b>기본 키보드</b>였습니다.</div>
        <h2 class="exp-only">실험자</h2>
        <p class="muted small exp-only">브라우저 저장소는 지워질 수 있으니 참가자마다 바로 내보내세요.</p>
        <div class="exp-only stack end">
          <button class="primary big" id="export">이 참가자 기록 내보내기 (JSONL)</button>
          <button class="big" id="nextP">다음 참가자 시작</button>
        </div>`;
      el.querySelector('#export').onclick = () => ctx.logger.export(pid());
      el.querySelector('#nextP').onclick = () => { ctx.settings.pid = 'P00'; ctx.saveSettings(); renderWelcome(); };
    },
  };

  function bindLikert(box, onPick) {
    box.querySelectorAll('button').forEach(b => b.onclick = () => {
      box.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b));
      onPick(isNaN(+b.dataset.v) ? b.dataset.v : +b.dataset.v);
    });
  }

  return {
    el,
    show() { cur() && pid() !== 'P00' ? renderStep() : renderWelcome(); },
    hide() { setKeyboard(false); setStepbar(null); },
    onTap(input) { if (runner) runner.onTap(input); },
    // Experimenter controls (실험자: 단계 이동)
    jump(delta) { if (cur()) advance(delta); },
    // Forget every participant's progress (전체 초기화 시 이어서 하기 목록 삭제)
    reset() { renderSeq++; progress = {}; saveProgress(); },
    status() {
      const s = cur();
      if (!s || pid() === 'P00') return null;
      const st = buildSteps(ctx.latinOrder() || 'ABCD', ctx.settings.xIs);
      return { step: s.step, total: st.length, title: st[s.step].title, done: s.done };
    },
  };
}
