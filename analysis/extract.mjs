// extract.mjs — 원본 로그(JSONL) → 참가자 × 조건 한 줄씩의 정리 표(CSV)
// (raw JSONL logs → tidy CSV, one row per participant × condition)
//
// 실행: node analysis/extract.mjs "<데이터 폴더>" [출력 폴더]
//   데이터 폴더: 그 아래의 *.jsonl 파일 하나 = 참가자 한 명 (하위 폴더까지 찾음)
//   출력 폴더  : 기본 analysis_out/ (참가자 데이터라 git에서 제외됨, 커밋 금지)
//
// 출력 파일
//   per_condition.csv  참가자 × 조건(48줄). stats.py가 이 파일로 통계를 낸다.
//   per_trial.csv      문장 하나당 한 줄(384줄). 문장 단위로 더 보고 싶을 때.
//   extract_warnings.txt  문장 수가 8개가 아니거나, 다시 만든 입력이 기록과 다르면 여기에 적힌다(비어 있어야 정상).
//
// 왜 앱이 내보낸 요약 CSV를 그대로 쓰지 않고 다시 계산하나
//   앱 화면의 수치는 실시간 확인용이다. 분석은 원본 로그에서 같은 규칙으로 다시 계산해야
//   규칙이 문서로 남고, 누구든 같은 결과를 재현할 수 있다. (다시 계산한 값은 앱 CSV와 일치함을 확인했다.)
//
// 규칙 (docs/experiment.md와 같음)
// 1. 파일 하나 = 참가자 한 명. 참가자 번호는 순서 그룹마다 겹치므로(P01이 3명 등) 파일 시각으로 구분한다.
//    폴더 이름에는 실명이 있을 수 있어 출력에 절대 쓰지 않는다.
// 2. 파일 안에서 마지막 participant_start 이후 이벤트만 쓴다(같은 브라우저에서 앞 사람 기록이 섞이지 않게).
// 3. 재시작 규칙: 본 과제(main)에서 어떤 조건의 typing_start가 다시 나오면 그 조건을 처음부터 다시 센다
//    → 마지막 시도만 분석. (이번 12명은 재시작 0건)
// 4. 의도 키(참가자가 누르려던 키)는 목표 문장과 최종 입력을 정렬(alignTrial)해서 정한다.
//    단순히 '커서 위치의 글자'로 보면, 장갑 터치가 한 번 인식 안 될 때 그 뒤가 전부 오류로 세지기 때문이다.
//    앱(js/metrics.js)의 함수를 그대로 불러 쓰므로 앱과 분석의 지표 정의가 어긋날 수 없다.
// 5. shift 탭은 제외한다(비활성 키).
//
// 지표 정의 (조건마다 8문장을 합쳐 계산)
//   neighbor_error_rate  이웃 키 오류율 = 의도 키의 옆 키(키 간 거리 0.5키 이하)가 눌린 수 / 백스페이스 제외 키 입력 수
//   key_error_rate       키 오류율 = 의도 키와 다른 키가 눌린 수 / 백스페이스 제외 키 입력 수
//   wpm                  문장별 WPM = (입력 글자 수 − 1) / 초 × 12 의 8문장 평균
//   msd_rate             최종 문장과 목표 문장의 최소 편집 거리 / 긴 쪽 길이 (8문장 평균)
//   omission_rate        정렬에서 빠진 글자 수 / 목표 문장 글자 수 (터치가 인식 안 된 경우)
//   shadow_*             같은 터치를 기본·보정 판정으로 각각 계산한 이웃 키 오류율 (섀도 판정)
//   tlx_raw, discomfort, sus, pref_*  조건별 설문 응답
import { readFileSync, readdirSync, statSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, basename, resolve } from 'node:path';
import { alignTrial, summarizeKeystrokes, msdErrorRate, wpm as wpmOf } from '../js/metrics.js';

const [dataDir, outDir = 'analysis_out'] = process.argv.slice(2);
if (!dataDir) { console.error('usage: node analysis/extract.mjs <data folder> [out folder]'); process.exit(1); }

const files = [];
(function walk(d) {
  for (const f of readdirSync(d)) {
    const p = join(d, f);
    if (statSync(p).isDirectory()) walk(p);
    else if (f.endsWith('.jsonl')) files.push(p);
  }
})(resolve(dataDir));

const CONDS = { A: ['baseline', 'bare'], B: ['baseline', 'glove'], C: ['calibrated', 'bare'], D: ['calibrated', 'glove'] };
const rows = [], trials = [], warnings = [];

for (const file of files.sort((a, b) => basename(a).split('_').at(-1).localeCompare(basename(b).split('_').at(-1)))) {
  const all = readFileSync(file, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l));
  const lastStart = all.findLastIndex(e => e.ev === 'participant_start');
  if (lastStart < 0) { warnings.push(`${basename(file)}: no participant_start`); continue; }
  const start = all[lastStart];
  const ev = all.slice(lastStart).filter(e => e.pid === start.pid);
  // Session label = file timestamp (UTC). Never the folder name (폴더 이름에 실명이 있을 수 있음).
  const session = basename(file).replace(/^glovekb_/, '').replace(/\.jsonl$/, '');
  const order = start.order;
  const fresh = () => ({ trials: [], pending: [] });
  const C = Object.fromEntries(Object.keys(CONDS).map(k => [k, fresh()]));
  const restarts = Object.fromEntries(Object.keys(CONDS).map(k => [k, -1]));
  const last = (name, f = () => true) => ev.filter(e => e.ev === name && f(e)).at(-1) ?? null;

  for (const e of ev) {
    const c = C[e.cond];
    if (!c) continue;
    if (e.ev === 'typing_start' && e.phase === 'main') { C[e.cond] = fresh(); restarts[e.cond]++; continue; }
    if (e.ev === 'touch' && e.phase === 'main' && e.keyShown !== 'shift') {
      if (e.sim) warnings.push(`${session}: simulated touch in ${e.cond}`);
      c.pending.push({ decoded: e.keyShown, base: e.keyBase, cal: e.keyCal ?? null, m0: e.keyM0 ?? null, m1: e.keyM1 ?? null });
    }
    if (e.ev === 'trial_end' && e.phase === 'main') { c.trials.push({ end: e, strokes: c.pending }); c.pending = []; }
  }

  const demo = last('demographics');
  const prefOf = hand => last('preference', e => e.hand === hand)?.keyboard ?? '';
  for (const [cond, [keyboard, hand]] of Object.entries(CONDS)) {
    const keys = [], keysBase = [], keysCal = [];
    let omissions = 0, chars = 0, wpmSum = 0, msdSum = 0, seconds = 0, typedChars = 0;
    C[cond].trials.forEach((t, k) => {
      const e = t.end;
      const a = alignTrial(e.phrase, t.strokes);
      if (a.typed !== e.typed) warnings.push(`${session} ${cond}#${k}: rebuilt text differs from logged text`);
      const sec = (e.end - e.start) / 1000;
      const w = wpmOf(e.typed, sec);
      const m = msdErrorRate(e.phrase, e.typed);
      const ks = [], kb = [], kc = [];
      for (const s of a.strokes) {
        ks.push({ decoded: s.decoded, intended: s.intended });
        if (s.decoded !== 'backspace') { kb.push({ decoded: s.base, intended: s.intended }); if (s.cal) kc.push({ decoded: s.cal, intended: s.intended }); }
      }
      keys.push(...ks); keysBase.push(...kb); keysCal.push(...kc);
      omissions += a.omissions; chars += a.chars; wpmSum += w; msdSum += m; seconds += sec; typedChars += e.typed.length;
      const sk = summarizeKeystrokes(ks);
      trials.push({ session, cond, trial: k, phrase_len: e.phrase.length, wpm: w, msd_rate: m / 100,
        neighbor_error_rate: sk.neighborErrorRate, key_error_rate: sk.keyErrorRate, backspaces: sk.backspaces, omissions: a.omissions });
    });
    const n = C[cond].trials.length;
    if (n !== 8) warnings.push(`${session} ${cond}: ${n} trials (expected 8)`);
    const s = summarizeKeystrokes(keys), sb = summarizeKeystrokes(keysBase), sc = summarizeKeystrokes(keysCal);
    const nonBs = keys.filter(k => k.decoded !== 'backspace').length;
    const survey = last('survey', e => e.cond === cond), sus = last('sus', e => e.cond === cond);
    const fit = last('model_fit', e => e.cond === cond);
    rows.push({
      session, pid: start.pid, group: start.group, order, app: start.app,
      cond, keyboard, hand, position: order.indexOf(cond) + 1, kb_label: survey?.kbLabel ?? '',
      trials: n, restarts: Math.max(0, restarts[cond]),
      keystrokes: nonBs,
      neighbor_errors: Math.round(s.neighborErrorRate * nonBs),
      neighbor_error_rate: s.neighborErrorRate, key_error_rate: s.keyErrorRate,
      omission_rate: chars ? omissions / chars : '', msd_rate: n ? msdSum / n / 100 : '',
      wpm: n ? wpmSum / n : '', wpm_pooled: seconds ? ((typedChars - n) / seconds) * 12 : '',
      backspaces: s.backspaces, backspace_rate: s.backspaceRate,
      shadow_base_neighbor_error_rate: sb.neighborErrorRate, shadow_cal_neighbor_error_rate: sc.neighborErrorRate,
      calib_model: fit?.model ?? '', calib_seconds: fit?.durationS ?? '',
      tlx_raw: survey?.tlxRaw ?? '', discomfort: survey?.discomfort ?? '', sus: sus?.score ?? '',
      pref_glove: prefOf('glove'), pref_bare: prefOf('bare'),
      age: demo?.age ?? '', english_freq: demo?.englishFreq ?? '', glove_type: demo?.glove ?? '',
      finished: last('participant_end') ? 1 : 0,
    });
  }
}

const toCsv = (list) => {
  const cols = Object.keys(list[0]);
  const cell = v => (typeof v === 'number' && !Number.isInteger(v) ? +v.toFixed(6) : v);
  return [cols.join(','), ...list.map(r => cols.map(c => cell(r[c])).join(','))].join('\n') + '\n';
};
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'per_condition.csv'), toCsv(rows));
writeFileSync(join(outDir, 'per_trial.csv'), toCsv(trials));
writeFileSync(join(outDir, 'extract_warnings.txt'), warnings.join('\n') + '\n');
console.log(`${files.length} files → ${rows.length / 4} participants, ${rows.length} rows, ${trials.length} trials; ${warnings.length} warnings → ${outDir}/`);
