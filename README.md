# 장갑 보정 터치 키보드 — 데모 / 실험 앱 (v0.1 demo)

HCI 팀 프로젝트(Type 2 + 2요인 add-on). 같은 키보드 모양에서 **판정(decoding)만** 바꾸는 보정 키보드를 기본 키보드와 비교한다.
실험 설계: 2×2 피험자 내 설계(키보드 기본/보정 × 손 맨손/장갑), 영어 QWERTY 문장 따라 쓰기, 주 지표는 이웃 키 오류율.

> ⚠️ 시뮬레이션 모드의 결과는 **가정한 합성 오프셋**에서 나온 것이다(실제 데이터 아님). 실제 장갑 효과는 파일럿에서 확인한다.

## 실행

빌드 도구가 없다. 정적 파일 서버만 있으면 된다(ES 모듈이라 `file://`로 열면 동작하지 않는다).

```bash
python3 -m http.server 8137
```

브라우저에서 `http://localhost:8137` 을 연다. 데스크톱에서는 폰 크기 프레임으로 보인다.

### 폰에서 실행 (같은 Wi-Fi)

1. Mac의 IP 확인: `ipconfig getifaddr en0`
2. 폰 브라우저에서 `http://<Mac IP>:8137` 접속
3. 설정·로그 → 입력 모드 **실기기 터치**
4. (실험 시) 공유 → 홈 화면에 추가로 전체 화면 실행, iOS 안내된 접근(Guided Access)으로 이탈 방지

## 테스트

```bash
node --test tests/*.test.js
```

판정 기하, 이웃 키 표, M0/M1 학습, LOO 선택·폴백, 이상치 제거, WPM/MSD, 그리고 합성 장갑 오프셋에서 보정이 오류를 줄이는지 보는 시뮬레이션 테스트를 포함한다.

## 화면

| 탭 | 내용 |
|---|---|
| 비교 데모 | 같은 터치를 기본 판정과 보정 판정으로 나란히 표시 ("같은 터치, 다른 판정") |
| 보정 | 팬그램 43탭 가이드 탭 → M0/M1 학습, LOO 선택, 모델 고정, 탭 점·오프셋 화살표 시각화 |
| 따라 쓰기 | 문구 제시 → 입력 → Next. 실험자용 실시간 지표(WPM, 이웃 키 오류율, MSD 등) |
| 실제 탭 재생 | 내보낸 JSONL의 보정 탭을 불러와 기본 vs 보정(LOO) 정확도 비교 |
| 설정·로그 | 참가자 ID, 조건 A–D, 입력 모드, 합성 오프셋 슬라이더, X/Y 블라인드 라벨, 로그 내보내기 |

## 구조

```
index.html, css/style.css
js/config.js       키 기하·파라미터 (단일 출처)
js/geometry.js     사각형 판정, 최근접 폴백, 이웃 키 표
js/decoder.js      기본 / M0 / M1 / LOO 선택
js/metrics.js      WPM, MSD, 이웃 키 오류 (화면 확인용)
js/simulate.js     합성 장갑 오프셋 (시드 고정 가능)
js/keyboard.js     렌더링 + touchstart 좌표 변환
js/calibration.js, demo.js, trial.js, replay.js, settings.js   화면
js/logger.js       JSONL 로그 (localStorage 백업 + 다운로드)
js/viz.js          탭 점·화살표·오프셋 필드
data/phrases.json  문구 샘플 (공식 세트로 교체 예정)
tests/             Node 내장 테스트 러너
```

## 로그 (JSON Lines)

주요 이벤트: `session_start`, `layout`(키 사각형 px), `calib_tap`, `model_fit`, `touch`(두 판정 결과 `keyBase`/`keyCal`과 실제 반영 `keyShown`/`applied`, 의도 키 `intended`), `trial_end`, `settings`.
좌표는 키보드 기준 CSS px(`x`, `y`)와 키 단위(`ux`, `uy`, 1 = 가로 키 간격)를 함께 저장한다. 지표는 분석 스크립트가 원본에서 다시 계산한다.

## 아직 안 된 것

- 간이 설문(NASA-TLX, 불편도), SUS, 조건 순서 자동 진행(라틴 방격 순서는 표시만 함)
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
