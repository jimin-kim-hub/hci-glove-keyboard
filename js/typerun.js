// typerun.js — transcription runner: phrase → type → Next (따라 쓰기 실행기, 계획 PDF B6)
// No right/wrong feedback while typing (A4). Metrics here are for logging/live check only.
import { keyIdToChar } from './geometry.js';
import { intendedKeyAt, classifyKeystroke, summarizeKeystrokes, wpm, msdErrorRate, alignTrial } from './metrics.js';

const esc = s => s.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

export function runTyping(ctx, host, { phrases, keyboard, model, alt = null, logFields, onDone }) {
  let idx = 0, typed = '', keys = [], tStart = null;
  const results = [];
  host.innerHTML = `
    <div class="panel">
      <div class="panel-label"><span>이 문장을 따라 입력하세요</span><span class="trial-count"></span></div>
      <div class="presented"></div>
      <div class="typed"></div>
    </div>
    <button class="next">다음 문장 →</button>`;
  const $ = s => host.querySelector(s);

  function render() {
    $('.trial-count').textContent = `${idx + 1} / ${phrases.length}`;
    $('.presented').textContent = phrases[idx];
    $('.typed').innerHTML = `${esc(typed).replace(/ /g, '&nbsp;')}<span class="caret"></span>`;
    $('.next').textContent = idx === phrases.length - 1 ? '완료 →' : '다음 문장 →';
  }
  render();

  $('.next').onclick = () => {
    if (!typed.length) return; // Next on empty input is ignored (B6)
    const end = performance.now();
    const secs = (end - tStart) / 1000;
    // Error rates use alignment-based intended keys (v0.11.0); per-touch `intended` in the log stays the cursor rule
    // (오류율은 정렬 기반 의도 키로 계산, 터치 로그의 intended는 실시간 커서 규칙 그대로)
    const a = alignTrial(phrases[idx], keys);
    const s = summarizeKeystrokes(a.strokes);
    const live = {
      wpm: +wpm(typed, secs).toFixed(2), msd: +msdErrorRate(phrases[idx], typed).toFixed(2), ...s,
      intendedBy: 'align', omissions: a.omissions, insertions: a.insertions, omissionRate: +(a.omissions / a.chars).toFixed(4),
    };
    ctx.logger.log('trial_end', {
      ...logFields, trial: idx, phrase: phrases[idx], typed, start: tStart, end, live,
      alignedIntended: a.strokes.map(k => k.intended), // one per keystroke (shift excluded), same order as the touches
    });
    results.push({ keys, ...live });
    idx++; typed = ''; keys = []; tStart = null;
    if (idx >= phrases.length) onDone(results); else render();
  };

  return {
    onTap(input) {
      if (idx >= phrases.length) return;
      const dec = ctx.decode(input.touch, { keyboard, model, alt });
      const intended = intendedKeyAt(phrases[idx], typed.length);
      ctx.logTouch(input, dec, {
        ...logFields, trial: idx, intended, textLen: typed.length,
        isBackspace: dec.shown === 'backspace',
        isNeighborError: classifyKeystroke(intended, dec.shown).isNeighborError,
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
