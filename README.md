# 장갑 보정 터치 키보드 — 실험 앱

**바로 열기:** https://jimin-kim-hub.github.io/hci-glove-keyboard/

HCI 팀 프로젝트(Type 2 + 2요인 add-on). 같은 키보드 모양에서 **판정(decoding)만** 바꾸는 보정 키보드를 기본 키보드와 비교한다.
실험 설계: 2×2 피험자 내 설계(키보드 기본/보정 × 손 맨손/장갑), 영어 QWERTY 문장 따라 쓰기, 주 지표는 이웃 키 오류율.

> ⚠️ 시뮬레이션 모드의 결과는 **가정한 합성 오프셋**에서 나온 것이다(실제 데이터 아님). 실제 장갑 효과는 파일럿에서 확인한다.

## 사용 방법 (실험 진행)

1. 폰에서 위 주소를 연다. (권장: 공유 → 홈 화면에 추가 → 전체 화면으로 실행)
2. 참가자가 **별명**을 입력하고 **시작하기**. 참가자 번호(P01, P02 …)는 자동으로 배정된다.
3. 화면 안내대로 끝까지 진행한다. 총 33단계, 약 40분:
   - 실험 안내 (실험자가 동의서 확인 체크)
   - 기본 정보: 나이대, 주 사용 손, 영어 입력 빈도, 평소 입력 방식 + 실험자가 고르는 장갑(여성용/남성용)
   - 연습: 맨손 준비 단계(노란 키 43개) → 키보드 X 문장 3개 → 키보드 Y 문장 3개
   - 조건 4개 (참가자 번호에 따라 순서가 정해짐), 조건마다: 장갑 끼기/벗기 안내 → 준비 단계 → 문장 8개 → 설문(NASA-TLX 6문항 + 불편도) → 사용성 설문(SUS 10문항) → 휴식
   - **키보드 비교(X vs Y):** 같은 손 상태(맨손 또는 장갑)로 X·Y를 둘 다 써 본 직후 바로 묻는다. 손 상태마다 1번씩, 총 2번 (v0.9.0, 파일럿에서 마지막에 물으면 기억이 안 난다는 문제로 변경)
   - 마무리: **결과** (인터뷰는 실험자가 이어서 진행)
4. 결과 화면에서 **이 참가자 기록 내보내기**로 백업하고 **다음 참가자 시작**.
   - 내보낸 파일(`.jsonl`)은 아이폰·갤럭시 어디서 받아도 같은 형식이다. 예전 버전 아이폰에서 붙은 `.jsonl.ndjson`, 메신저를 거치며 `.txt`로 바뀐 파일도 "다른 기기 기록 합치기"·"재생"에서 그대로 불러올 수 있다(확장자가 아니라 내용으로 판별).

중간에 앱이 꺼져도 시작 화면의 **이어서 하기**로 그 단계부터 다시 한다. 단, 끊긴 단계는 처음부터 다시 진행된다.

### 실험자 메뉴 (오른쪽 위 "실험자" 버튼)

| 메뉴 | 내용 |
|---|---|
| 종합 | 참가자별 결과(입력 결과, 터치 어긋남, 설문)와 개인 기록 내보내기(CSV 요약, JSONL 원본), 전체 참가자 × 조건 표, 전체 기록 내보내기, 다른 기기 기록 합치기 |
| 시연 | 발표용 "같은 터치, 다른 판정" 화면. 장갑/맨손 보정을 직접 하거나 시뮬레이션으로 자동 보정 |
| 탭 재생 | 내보낸 기록의 보정 탭을 불러와 기본 vs 보정(LOO) 정확도 비교 |
| 설정 | 입력 모드(실기기 터치 / 시뮬레이션), 합성 쏠림 슬라이더, 보정 모델(자동 / M0 고정 / M1 고정), X/Y 라벨, 단계 이동, 초기화 |

시뮬레이션 모드에서는 마우스 클릭에 **가정한 장갑 쏠림**을 더한다(실제 데이터 아님). 이때 화면 위에 "시뮬레이션" 표시가 항상 붙는다.

### 데이터 모으기와 익명화

- 기록에는 **참가자 번호만** 남는다. 별명은 그 기기 화면에만 보인다. 실명은 쓰지 않는다.
- 한 폰으로 모든 참가자를 진행하면 그 폰의 **종합** 화면에 바로 모인다. 여러 폰을 쓰면 각 폰에서 내보낸 파일을 한 기기의 **다른 기기 기록 합치기**로 불러온다(중복 자동 제거).
- 기록은 브라우저 저장소(IndexedDB)에 있다. 브라우저가 지울 수 있으므로 **참가자마다 내보내기**로 백업한다.
- 업데이트 직후 최대 10분은 옛 버전이 열릴 수 있다(GitHub Pages 캐시). 제목 옆 버전 번호로 확인한다.

## 로컬 실행·테스트

```bash
python3 -m http.server 8137
```

```bash
node --test tests/*.test.js
```

## 구조

```
index.html, css/style.css
js/config.js       키 기하·파라미터 (단일 출처)
js/geometry.js     사각형 판정, 최근접 폴백, 이웃 키 표
js/decoder.js      기본 / M0 / M1 / LOO 선택
js/metrics.js      WPM, MSD, 이웃 키 오류 (화면 확인용)
js/simulate.js     합성 장갑 오프셋 (시드 고정 가능)
js/keyboard.js     렌더링 + touchstart 좌표 변환
js/steps.js        참가자 진행 단계 목록 (계획 PDF A6 절차)
js/flow.js         참가자 진행 화면
js/calibrun.js     준비 단계(가이드 탭 43회) 실행기
js/typerun.js      문장 따라 쓰기 실행기
js/surveys.js      NASA-TLX·불편도·SUS 문항과 채점
js/summary.js, demo.js, replay.js, settings.js   실험자 메뉴
js/logger.js       JSONL 기록 (IndexedDB 저장, 병합, 다운로드)
js/aggregate.js    참가자 × 조건 종합, 중복 제거
js/participant.js  참가자 1명의 결과 계산, CSV 변환
js/viz.js          탭 점·화살표·오프셋 필드
data/phrases.json  문구 세트: 조건별 다른 8문장 × 4세트 + 연습 6문장 (공식 목록에서 생성)
js/phrasestats.js  문장 길이·난이도 특징 (단어 길이, 글자 희귀도, 키 이동 거리)
tools/make_sets.mjs  phrases.json 생성 스크립트 (seed 고정, 공식 phrases2.txt 필요)
tests/             Node 내장 테스트 러너
```

## 로그 (JSON Lines)

SUS 안내 (v0.13.1): 문항 10개와 채점은 표준 SUS 그대로. 두 키보드 생김새가 같아서 설문 위 안내를 "방금 이 키보드로 문장을 직접 입력해 본 경험을 떠올리며 답해 주세요."로 두어 입력 경험을 평가하게 한다.

보정 모델 (v0.13.0): **M1(키 위치별 회귀)로 고정**. 팀 파일럿 3명에서 장갑을 끼면 터치가 좌우 바깥쪽으로 벌어졌고(왼쪽 키는 왼쪽, 오른쪽 키는 오른쪽), 장갑 조건 이웃 키 오류가 기본 139 → M0 127 → M1 69(합계)였다. 사용 가능한 탭이 15개 미만이면 M0로 대체. 로그에는 계속 M0·M1 판정을 모두 남긴다.

실험 설정 고정 (v0.12.0–0.12.1): 입력 모드·보정 모델이 실험용 값(`EXPERIMENT_SETTINGS`, `js/config.js`)과 다르면 시작 화면에 경고가 뜨고 시작·이어서 하기가 막힌다. "실험용 설정으로 되돌리기"로 복구. 키보드 X 지정(보정/기본)은 검사하지 않고 설정에서 자유롭게 바꿀 수 있으며, 참가자를 시작하는 순간의 값으로 그 참가자에게 고정된다(도중에 바꿔도 적용 안 됨, `participant_start.xIs`에 기록).

블라인드 유지 (v0.12.0): 결과 화면에서 어느 키보드가 새 키보드인지 공개하지 않는다(뒤 참가자에게 전해지는 것 방지). 모든 실험이 끝난 뒤 따로 알린다.

오류 지표 계산 (v0.11.0): 의도한 키는 **목표 문장과 실제 입력을 정렬(최소 편집 거리)** 해서 정한다. 장갑이 탭을 놓쳐 글자가 빠져도 뒤 글자가 전부 오류로 세지지 않는다. 빠진 글자 비율은 **누락률**(`omission_rate`)로 따로 센다. `touch` 이벤트의 `intended`는 실시간 커서 규칙 그대로이고, `trial_end`에 정렬 결과 `alignedIntended`(키 입력 순서대로)와 `live.omissions`가 기록된다.

결과 화면 (v0.11.0): 장갑 오타율 한 줄 요약, 지표별 막대 그래프(오타율·속도·SUS·TLX, 맨손·장갑 × X·Y), 표 보기, 실험자용 누락률.

보정 학습 규칙: 43탭을 모두 누르되, **스페이스 탭은 학습에서 제외**한다(넓은 키라 중심과의 거리가 조준 오차가 아님, v0.10.0). |d| > 1.5 키 간격인 탭도 제외.

주요 이벤트: `session_start`, `participant_start`, `flow_step`, `flow_exit`(나가기), `typing_start`(문장 입력 시작, 재시작 구분용), `consent_confirmed`, `demographics`(나이대·주 사용 손·영어 입력 빈도·입력 방식·장갑 종류), `layout`(키 사각형 px), `calib_tap`, `model_fit`(선택 규칙 `policy`, 자동이었다면 고를 모델 `auto`, 두 모델의 LOO 정확도와 계수), `touch`(두 판정 결과 `keyBase`/`keyCal`, 같은 보정 데이터의 M0·M1 판정 `keyM0`/`keyM1`, 실제 반영 `keyShown`/`applied`, 의도 키 `intended`), `trial_end`, `survey`(TLX·불편도), `sus`(조건마다, `cond` 포함), `preference`(손 상태마다 1번: `hand`, `choice` X/same/Y, `keyboard`), `participant_end`, `settings`.
좌표는 키보드 기준 CSS px(`x`, `y`)와 키 단위(`ux`, `uy`, 1 = 가로 키 간격)를 함께 저장한다. 지표는 분석 스크립트가 원본에서 다시 계산한다.

## 아직 안 된 것

- 설문 문항의 한국어는 팀 번역 초안이다. 검증된 한국어판 NASA-TLX·SUS와 대조해야 한다.
- 실제 폰·장갑에서의 확인 (touch radius/force 값, 가장자리 제스처, 지연)
- 문장 세트는 공식 MacKenzie & Soukoreff `phrases2.txt`(https://www.yorku.ca/mack/PhraseSets.zip)에서 `node tools/make_sets.mjs phrases2.txt > data/phrases.json`으로 만든다. 4세트의 k번째 문장은 글자 수가 같고 난이도(단어 길이·글자 희귀도·키 이동 거리)가 비슷하다. 난이도 지표는 팀이 정한 근사치다.
- 보정 모델 기본값은 자동 선택(`DEFAULT_MODEL_POLICY = 'auto'`)이다. 파일럿 뒤 M0 또는 M1 하나로 정해 `js/config.js`에서 바꾸고 사양을 동결한다.
- Python 분석 스크립트(`analysis/`)

## 저장소 범위

공개 저장소라 웹앱·테스트·README만 올린다. 팀 내부 문서(실험 계획 PDF, 결정 기록, 수업 자료)는 `.gitignore`로 제외했다.

## 참고 문헌

- MacKenzie & Soukoreff (2003). Phrase sets for evaluating text entry techniques. https://doi.org/10.1145/765891.765971
- Holz & Baudisch (2010). The Generalized Perceived Input Point Model. https://doi.org/10.1145/1753326.1753413
- Henze, Rukzio & Boll (2011). 100,000,000 Taps. https://doi.org/10.1145/2037373.2037395
- Weir, Rogers, Murray-Smith & Löchtefeld (2012). A User-Specific Machine Learning Approach for Improving Touch Accuracy on Mobile Devices. https://doi.org/10.1145/2380116.2380175
- Goel, Findlater & Wobbrock (2012). WalkType. https://doi.org/10.1145/2207676.2208662
