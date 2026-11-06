# 장갑 보정 터치 키보드 — 실험 앱

**바로 열기:** https://jimin-kim-hub.github.io/hci-glove-keyboard/

HCI 팀 프로젝트(Type 2 + 2요인 add-on). 같은 키보드 모양에서 **판정(decoding)만** 바꾸는 보정 키보드를 기본 키보드와 비교한다.
실험 설계: 2×2 피험자 내 설계(키보드 기본/보정 × 손 맨손/장갑), 영어 QWERTY 문장 따라 쓰기, 주 지표는 이웃 키 오류율.

> ⚠️ 시뮬레이션 모드의 결과는 **가정한 합성 오프셋**에서 나온 것이다(실제 데이터 아님). 실제 장갑 효과는 파일럿에서 확인한다.

## 사용 방법 (실험 진행)

1. 폰에서 위 주소를 연다. (권장: 공유 → 홈 화면에 추가 → 전체 화면으로 실행)
2. 참가자가 **별명**을 입력하고 **시작하기**. 참가자 번호(P01, P02 …)는 자동으로 배정된다.
3. 화면 안내대로 끝까지 진행한다. 총 29단계, 약 40분:
   - 실험 안내 (실험자가 동의서 확인 체크)
   - 연습: 맨손 준비 단계(노란 키 43개) → 키보드 X 문장 3개 → 키보드 Y 문장 3개
   - 조건 4개 (참가자 번호에 따라 순서가 정해짐), 조건마다: 장갑 끼기/벗기 안내 → 준비 단계 → 문장 8개 → 설문(NASA-TLX 6문항 + 불편도) → 휴식
   - 마무리: 키보드 X, Y 사용성 설문(SUS) → 선호도 → **결과**
4. 결과 화면에서 **이 참가자 기록 내보내기**로 백업하고 **다음 참가자 시작**.

중간에 앱이 꺼져도 시작 화면의 **이어서 하기**로 그 단계부터 다시 한다. 단, 끊긴 단계는 처음부터 다시 진행된다.

### 실험자 메뉴 (오른쪽 위 "실험자" 버튼)

| 메뉴 | 내용 |
|---|---|
| 종합 | 전체 참가자 × 조건 표(이웃 키 오류율, 키 오류율, WPM, 재생 비교), 전체 기록 내보내기, 다른 기기 기록 합치기 |
| 시연 | 발표용 "같은 터치, 다른 판정" 화면. 장갑/맨손 보정을 직접 하거나 시뮬레이션으로 자동 보정 |
| 탭 재생 | 내보낸 기록의 보정 탭을 불러와 기본 vs 보정(LOO) 정확도 비교 |
| 설정 | 입력 모드(실기기 터치 / 시뮬레이션), 합성 쏠림 슬라이더, X/Y 라벨, 단계 이동, 초기화 |

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
js/viz.js          탭 점·화살표·오프셋 필드
data/phrases.json  문구 샘플 (공식 세트로 교체 예정)
tests/             Node 내장 테스트 러너
```

## 로그 (JSON Lines)

주요 이벤트: `session_start`, `participant_start`, `flow_step`, `flow_exit`(나가기), `typing_start`(문장 입력 시작, 재시작 구분용), `consent_confirmed`, `layout`(키 사각형 px), `calib_tap`, `model_fit`, `touch`(두 판정 결과 `keyBase`/`keyCal`과 실제 반영 `keyShown`/`applied`, 의도 키 `intended`), `trial_end`, `survey`(TLX·불편도), `sus`, `preference`, `participant_end`, `settings`.
좌표는 키보드 기준 CSS px(`x`, `y`)와 키 단위(`ux`, `uy`, 1 = 가로 키 간격)를 함께 저장한다. 지표는 분석 스크립트가 원본에서 다시 계산한다.

## 아직 안 된 것

- 설문 문항의 한국어는 팀 번역 초안이다. 검증된 한국어판 NASA-TLX·SUS와 대조해야 한다.
- 실제 폰·장갑에서의 확인 (touch radius/force 값, 가장자리 제스처, 지연)
- `data/phrases.json`은 기억에 의존한 샘플이다. 공식 MacKenzie & Soukoreff 세트와 대조하고 `make_sets.py`로 다시 만들어야 한다.
- Python 분석 스크립트(`analysis/`)

## 저장소 범위

공개 저장소라 웹앱·테스트·README만 올린다. 팀 내부 문서(실험 계획 PDF, 결정 기록, 수업 자료)는 `.gitignore`로 제외했다.

## 참고 문헌

- MacKenzie & Soukoreff (2003). Phrase sets for evaluating text entry techniques. https://doi.org/10.1145/765891.765971
- Holz & Baudisch (2010). The Generalized Perceived Input Point Model. https://doi.org/10.1145/1753326.1753413
- Henze, Rukzio & Boll (2011). 100,000,000 Taps. https://doi.org/10.1145/2037373.2037395
- Weir, Rogers, Murray-Smith & Löchtefeld (2012). A User-Specific Machine Learning Approach for Improving Touch Accuracy on Mobile Devices. https://doi.org/10.1145/2380116.2380175
- Goel, Findlater & Wobbrock (2012). WalkType. https://doi.org/10.1145/2207676.2208662
