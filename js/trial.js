// trial.js — mini transcription task with live metrics (따라 쓰기 과제, 계획 PDF B6)
import { COND_INDEX } from './config.js';
import { keyIdToChar } from './geometry.js';
import { intendedKeyAt, classifyKeystroke, summarizeKeystrokes, wpm, msdErrorRate } from './metrics.js';

let PHRASES = null;
async function loadPhrases() {
  if (!PHRASES) PHRASES = await (await fetch('data/phrases.json')).json();
  return PHRASES;
}

const pct = v => (v * 100).toFixed(1) + '%';

export function createTrialScreen(ctx) {
  const el = document.createElement('section');
  el.className = 'screen';
  el.innerHTML = `
    <div class="trial-head">
      <span data-r="cond"></span>
      <select data-r="phase"><option value="practice">연습</option><option value="main">본 과제</option></select>
      <span data-r="count"></span>
    </div>
    <div class="presented" data-r="presented"></div>
    <div class="typed" data-r="typed"><span class="caret"></span></div>
    <button class="next" data-r="next">Next →</button>
    <div class="exp" data-r="exp">
      <div class="metrics">
        <div><b data-r="wpm">–</b><span>WPM</span></div>
        <div><b data-r="nbr">–</b><span>이웃 키 오류율</span></div>
        <div><b data-r="ker">–</b><span>키 오류율</span></div>
        <div><b data-r="msd">–</b><span>MSD 오류율</span></div>
        <div><b data-r="bs">–</b><span>백스페이스</span></div>
      </div>
      <div class="muted small" data-r="cum"></div>
    </div>
    <div class="card" data-r="done" hidden></div>`;
  const $ = n => el.querySelector(`[data-r="${n}"]`);
  let list = [], idx = 0, typed = '', keys = [], tStart = null, allKeys = [], trialsDone = [];

  function phraseList(P) {
    if ($('phase').value === 'practice') return P.practice;
    const set = (COND_INDEX[ctx.settings.cond] + ctx.pnum()) % 4; // S[(k + p) mod 4]
    return P.sets[set];
  }

  async function start() {
    const P = await loadPhrases();
    list = phraseList(P); idx = 0; allKeys = []; trialsDone = [];
    $('done').hidden = true;
    beginTrial();
  }

  function beginTrial() {
    typed = ''; keys = []; tStart = null;
    $('cond').textContent = ctx.condLabel();
    $('count').textContent = `${idx + 1} / ${list.length}`;
    $('presented').textContent = list[idx];
    render();
  }

  function render() {
    $('typed').innerHTML = `${escapeHtml(typed).replace(/ /g, '&nbsp;')}<span class="caret"></span>`;
    $('exp').hidden = !ctx.settings.showExp;
    const s = summarizeKeystrokes(keys);
    const secs = tStart ? (performance.now() - tStart) / 1000 : 0;
    $('wpm').textContent = secs > 0 ? wpm(typed, secs).toFixed(1) : '–';
    $('nbr').textContent = keys.length ? pct(s.neighborErrorRate) : '–';
    $('ker').textContent = keys.length ? pct(s.keyErrorRate) : '–';
    $('msd').textContent = typed ? msdErrorRate(list[idx], typed).toFixed(1) + '%' : '–';
    $('bs').textContent = String(s.backspaces);
    if (allKeys.length) {
      const c = summarizeKeystrokes(allKeys);
      $('cum').textContent = `이 조건 누적(${trialsDone.length}문장): 이웃 키 오류율 ${pct(c.neighborErrorRate)} · 키 오류율 ${pct(c.keyErrorRate)} · 백스페이스율 ${pct(c.backspaceRate)} (화면 확인용, 분석은 원본 로그로)`;
    } else $('cum').textContent = '';
  }

  function next() {
    if (!typed.length) return; // Next on empty input is ignored (B6)
    const end = performance.now();
    const secs = (end - tStart) / 1000;
    const s = summarizeKeystrokes(keys);
    ctx.logger.log('trial_end', {
      pid: ctx.settings.pid, cond: ctx.settings.cond, phase: $('phase').value, trial: idx,
      phrase: list[idx], typed, start: tStart, end,
      live: { wpm: +wpm(typed, secs).toFixed(2), msd: +msdErrorRate(list[idx], typed).toFixed(2), ...s },
    });
    allKeys.push(...keys);
    trialsDone.push(idx);
    idx++;
    if (idx >= list.length) return finishCondition();
    beginTrial();
  }

  function finishCondition() {
    const c = summarizeKeystrokes(allKeys);
    $('done').hidden = false;
    $('done').innerHTML = `<b>${ctx.condLabel()} 완료</b><br>이웃 키 오류율 ${pct(c.neighborErrorRate)} · 키 오류율 ${pct(c.keyErrorRate)}<br>
      <span class="muted">본 실험에서는 여기서 간이 설문(NASA-TLX 6문항 + 불편도)으로 넘어갑니다 (아직 미구현).</span>
      <div class="row"><button data-r="nextCond" class="primary" hidden></button><button data-r="restart">이 조건 다시</button></div>`;
    $('done').querySelector('[data-r="restart"]').onclick = start;
    // Next condition in this participant's counterbalanced order (라틴 방격 다음 조건)
    const order = ctx.latinOrder();
    const nextCond = order && $('phase').value === 'main' ? order[order.indexOf(ctx.settings.cond) + 1] : null;
    const nb = $('done').querySelector('[data-r="nextCond"]');
    if (nextCond) {
      nb.hidden = false;
      nb.textContent = `다음 조건: ${ctx.condLabel(nextCond)} → 보정부터`;
      nb.onclick = () => {
        ctx.settings.cond = nextCond;
        ctx.saveSettings();
        ctx.logger.log('settings', { pid: ctx.settings.pid, changed: 'cond', cond: nextCond, via: 'next_condition' });
        ctx.go('calib');
      };
    } else if (order && $('phase').value === 'main') {
      nb.hidden = false;
      nb.textContent = '4개 조건 완료 → 참가자 화면';
      nb.onclick = () => ctx.go('participant');
    }
    $('presented').textContent = '';
    typed = '';
    render();
  }

  $('next').onclick = next;
  $('phase').onchange = start;

  return {
    el,
    show() { ctx.kb.setTarget(null); ctx.kb.setOverlay(null); start(); },
    onTap(input) {
      if (idx >= list.length) return;
      const dec = ctx.decode(input.touch);
      const intended = intendedKeyAt(list[idx], typed.length);
      const cls = classifyKeystroke(intended, dec.shown);
      ctx.logTouch(input, dec, {
        phase: $('phase').value, trial: idx, intended, textLen: typed.length,
        isBackspace: dec.shown === 'backspace', isNeighborError: cls.isNeighborError,
        isNeighborErrorBase: classifyKeystroke(intended, dec.base).isNeighborError,
        isNeighborErrorCal: dec.cal ? classifyKeystroke(intended, dec.cal).isNeighborError : null,
      });
      if (tStart === null) tStart = performance.now();
      ctx.kb.flash(dec.shown);
      if (dec.shown === 'shift') return; // inactive shift: logged, no effect
      keys.push({ decoded: dec.shown, intended });
      if (dec.shown === 'backspace') typed = typed.slice(0, -1);
      else typed += keyIdToChar(dec.shown);
      render();
    },
  };
}

function escapeHtml(s) { return s.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c])); }
