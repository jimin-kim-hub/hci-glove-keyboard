// surveys.js — questionnaire text and scoring (설문 문항·채점)
// NOTE: Korean wording below is a DRAFT translation by the team; check against a validated
// Korean NASA-TLX / SUS version before the pilot (번역 초안 — 검증된 한국어판과 대조 필요).

// NASA-TLX raw (unweighted), 0–100 in steps of 5
export const TLX_ITEMS = [
  { key: 'mental', name: '정신적 요구', q: '과제가 정신적으로 얼마나 힘들었나요?', lo: '매우 낮음', hi: '매우 높음' },
  { key: 'physical', name: '신체적 요구', q: '과제가 신체적으로 얼마나 힘들었나요?', lo: '매우 낮음', hi: '매우 높음' },
  { key: 'temporal', name: '시간적 압박', q: '얼마나 서둘러야 한다고 느꼈나요?', lo: '매우 낮음', hi: '매우 높음' },
  { key: 'performance', name: '수행', q: '과제를 얼마나 잘 해냈다고 느끼나요?', lo: '완벽함', hi: '실패' },
  { key: 'effort', name: '노력', q: '그만큼 해내기 위해 얼마나 애써야 했나요?', lo: '매우 낮음', hi: '매우 높음' },
  { key: 'frustration', name: '좌절', q: '얼마나 짜증·불안·스트레스를 느꼈나요?', lo: '매우 낮음', hi: '매우 높음' },
];

// Participant background (참가자 기본 정보) — no name/contact; linked to the participant number only.
// `exp: true` items are answered by the experimenter. Glove size is not asked (free-size gloves).
export const DEMOGRAPHICS = [
  { key: 'age', q: '나이대를 골라 주세요.', options: [['~19', '19세 이하'], ['20-24', '20–24세'], ['25-29', '25–29세'], ['30-39', '30대'], ['40-49', '40대'], ['50+', '50세 이상']] },
  { key: 'hand', q: '주로 쓰는 손은 어느 쪽인가요?', options: [['right', '오른손'], ['left', '왼손'], ['both', '양손 모두']] },
  { key: 'englishFreq', q: '휴대폰으로 영어를 얼마나 자주 입력하나요?', options: [['1', '1'], ['2', '2'], ['3', '3'], ['4', '4'], ['5', '5']], anchors: ['거의 안 함', '매일'] },
  { key: 'style', q: '평소 휴대폰 글자 입력은 주로 어떻게 하나요?', options: [['two-thumbs', '양손 엄지'], ['one-thumb', '한 손 엄지'], ['finger', '검지 등 한 손가락'], ['other', '기타']] },
  { key: 'glove', q: '실험자: 이 참가자가 쓸 장갑', exp: true, options: [['women', '여성용'], ['men', '남성용']] },
];

export const DISCOMFORT = { q: '화면을 누르기 불편했다.', lo: '전혀 아니다', hi: '매우 그렇다', max: 7 };

// System Usability Scale (Brooke 1996), 1 = 전혀 그렇지 않다 … 5 = 매우 그렇다
export const SUS_ITEMS = [
  '이 키보드를 자주 사용하고 싶다.',
  '이 키보드는 쓸데없이 복잡했다.',
  '이 키보드는 사용하기 쉬웠다.',
  '이 키보드를 쓰려면 다른 사람의 도움이 필요할 것 같다.',
  '이 키보드의 기능들은 잘 어우러져 있었다.',
  '이 키보드는 앞뒤가 맞지 않는 부분이 많았다.',
  '대부분의 사람들이 이 키보드를 금방 익힐 것이다.',
  '이 키보드는 사용하기 매우 번거로웠다.',
  '이 키보드를 자신 있게 사용할 수 있었다.',
  '이 키보드를 쓰기 전에 배워야 할 것이 많았다.',
];

// SUS score 0–100: odd items (r - 1), even items (5 - r), sum × 2.5
export function susScore(responses) {
  if (responses.length !== 10 || responses.some(r => !(r >= 1 && r <= 5))) return null;
  const sum = responses.reduce((s, r, i) => s + (i % 2 === 0 ? r - 1 : 5 - r), 0);
  return sum * 2.5;
}

export function tlxRaw(values) {
  if (values.length !== 6 || values.some(v => v == null)) return null;
  return values.reduce((a, b) => a + b, 0) / 6;
}
