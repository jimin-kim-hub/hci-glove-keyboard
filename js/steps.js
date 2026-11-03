// steps.js — the participant session as an ordered list of steps (참가자 진행 단계, 계획 PDF A6)
// Pure function so the procedure can be unit-tested and frozen with the app version.
import { CONDITIONS } from './config.js';

export const PRACTICE_PER_KEYBOARD = 3;
export const TRIALS_PER_COND = 8;

// order: e.g. 'ABDC' (Latin square row). xIs: which keyboard is labeled "X" ('calibrated' | 'baseline')
export function buildSteps(order, xIs = 'calibrated') {
  const label = kb => (kb === xIs ? 'X' : 'Y');
  const keyboards = xIs === 'calibrated' ? ['calibrated', 'baseline'] : ['baseline', 'calibrated'];
  const steps = [{ type: 'intro', title: '실험 안내' }];

  // Practice (bare hands): one practice calibration, then 3 phrases per keyboard (X then Y)
  steps.push({ type: 'hand', hand: 'bare', title: '연습 준비', practice: true });
  steps.push({ type: 'calib', phase: 'practice', cond: 'practice', hand: 'bare', keyboard: 'calibrated', modelKey: 'practice', title: '보정 연습' });
  keyboards.forEach((kb, j) => steps.push({
    type: 'typing', phase: 'practice', cond: 'practice', hand: 'bare', keyboard: kb, kbLabel: label(kb),
    modelKey: 'practice', phraseFrom: j * PRACTICE_PER_KEYBOARD, count: PRACTICE_PER_KEYBOARD, title: `연습: 키보드 ${label(kb)}`,
  }));

  [...order].forEach((cond, i) => {
    const c = CONDITIONS[cond];
    const kbl = label(c.keyboard);
    const base = { cond, hand: c.hand, keyboard: c.keyboard, kbLabel: kbl, block: i + 1 };
    steps.push({ ...base, type: 'hand', title: `조건 ${i + 1}/4 준비` });
    steps.push({ ...base, type: 'calib', phase: 'calib', modelKey: cond, title: `조건 ${i + 1}/4 · 보정` });
    steps.push({ ...base, type: 'typing', phase: 'main', modelKey: cond, count: TRIALS_PER_COND, title: `조건 ${i + 1}/4 · 문장 입력` });
    steps.push({ ...base, type: 'tlx', title: `조건 ${i + 1}/4 · 설문` });
    if (i < order.length - 1) steps.push({ ...base, type: 'rest', title: '휴식' });
  });

  steps.push({ type: 'hand', hand: 'bare', title: '마무리 준비', final: true });
  for (const kb of keyboards) steps.push({ type: 'sus', keyboard: kb, kbLabel: label(kb), title: `키보드 ${label(kb)} 사용성 설문` });
  steps.push({ type: 'pref', title: '선호도' });
  steps.push({ type: 'results', title: '결과' });
  return steps;
}
