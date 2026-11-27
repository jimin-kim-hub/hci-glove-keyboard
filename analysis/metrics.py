"""metrics.py — 원자료에서 지표 계산 (키 기하, 이웃 키, 정렬 기반 의도 키, WPM, MSD)

여기 정의는 앱(js/config.js, js/geometry.js, js/metrics.js)과 같다. 파이썬으로 옮긴 뒤
앱이 내보낸 요약 CSV와 값이 일치하는지 확인했다(README 참고).

계산 흐름 (조건 하나, 참가자 한 명 기준)
  1. 본 과제(phase = main)의 터치를 문장 단위로 모은다. 비활성 shift 탭은 뺀다.
  2. 문장이 끝나면(trial_end) 목표 문장과 최종 입력을 정렬해 각 키 입력의 '의도 키'를 정한다.
  3. 키 입력마다 오류인지, 이웃 키 오류인지 판정한다.
  4. 8문장을 합쳐 조건별 비율을 낸다.
"""
import math

import pandas as pd

# ---------------------------------------------------------------------------
# 1. 키 기하 (단위 u = 키 간격 1칸). 앱의 js/config.js와 같은 값.
# ---------------------------------------------------------------------------
PITCH_X, KEY_W, PITCH_Y, KEY_H = 1.0, 0.88, 1.45, 1.25
GX, GY = (PITCH_X - KEY_W) / 2, (PITCH_Y - KEY_H) / 2
ROWS = [(0, 0.0, "qwertyuiop"), (1, 0.5, "asdfghjkl"), (2, 1.5, "zxcvbnm")]

KEYS = {}
for row, x0, letters in ROWS:
    for i, ch in enumerate(letters):
        KEYS[ch] = (x0 + i * PITCH_X + GX, row * PITCH_Y + GY, KEY_W, KEY_H)  # (x, y, 너비, 높이)
KEYS["shift"] = (GX, 2 * PITCH_Y + GY, 1.5 - 2 * GX, KEY_H)
KEYS["backspace"] = (8.5 + GX, 2 * PITCH_Y + GY, 1.5 - 2 * GX, KEY_H)
KEYS["space"] = (2.5 + GX, 3 * PITCH_Y + GY, 5 - 2 * GX, KEY_H)

# 이웃 키: 두 키 사각형 사이의 최단 거리가 0.5 키 폭(0.44u) 이하인 키.
# 같은 줄의 좌우 키와 위아래 줄의 겹치는 키가 해당한다. 예) w의 이웃 = q, e, a, s
NEIGHBOR_MAX_DIST = 0.5 * KEY_W


def _rect_dist(a, b):
    ax, ay, aw, ah = a
    bx, by, bw, bh = b
    dx = max(ax - (bx + bw), 0, bx - (ax + aw))
    dy = max(ay - (by + bh), 0, by - (ay + ah))
    return math.hypot(dx, dy)


NEIGHBORS = {a: {b for b in KEYS if b != a and _rect_dist(KEYS[a], KEYS[b]) <= NEIGHBOR_MAX_DIST + 1e-9} for a in KEYS}


def is_neighbor(a, b):
    return bool(a and b and b in NEIGHBORS.get(a, ()))


def char_to_key(ch):
    """문장의 글자 → 키 이름. 공백은 'space'."""
    if ch == " ":
        return "space"
    return ch if ch in KEYS and len(ch) == 1 else None


# ---------------------------------------------------------------------------
# 2. 정렬 기반 의도 키 (앱 js/metrics.js의 alignTrial과 같은 알고리즘)
# ---------------------------------------------------------------------------
def align_trial(phrase, strokes):
    """목표 문장과 최종 입력을 정렬해 키 입력마다 의도 키를 붙인다.

    왜: '지금 커서 위치의 글자'를 의도 키로 보면, 장갑 터치가 한 번 인식 안 돼 글자가 빠졌을 때
        그 뒤의 모든 입력이 한 칸씩 어긋나 전부 오류로 세진다. 그래서 최종 입력과 목표 문장을
        최소 편집 거리(Levenshtein)로 맞춰 보고, 각 글자가 원래 목표 문장의 어느 글자였는지 찾는다.
    지운 입력(백스페이스로 지워진 글자)은 같은 위치의 최종 글자와 같은 목표를 갖는다고 본다.

    strokes: [{"decoded": 화면에 입력된 키, ...}] 입력 순서대로 (backspace 포함)
    돌려줌: (strokes에 'intended'를 붙인 목록, 누락 글자 수, 삽입 글자 수, 목표 글자 수, 최종 입력)
    """
    buf, pos = [], []
    for s in strokes:  # 입력을 재생해 최종 문자열을 만들고, 각 입력이 몇 번째 글자 자리였는지 기록
        if s["decoded"] == "backspace":
            if buf:
                buf.pop()
            pos.append(-1)
        else:
            buf.append(" " if s["decoded"] == "space" else s["decoded"])
            pos.append(len(buf) - 1)
    typed = "".join(buf)
    P, T, n, m = phrase, typed, len(phrase), len(typed)

    # 최소 편집 거리 표
    d = [[0] * (m + 1) for _ in range(n + 1)]
    for i in range(n + 1):
        d[i][0] = i
    for j in range(m + 1):
        d[0][j] = j
    for i in range(1, n + 1):
        for j in range(1, m + 1):
            d[i][j] = min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (P[i - 1] != T[j - 1]))

    # 뒤에서부터 따라가며 입력 글자 j ↔ 목표 글자 i를 짝짓는다 (-1 = 목표에 없는 삽입 글자)
    mapping = [-1] * m
    i, j, omissions, insertions = n, m, 0, 0
    while i > 0 or j > 0:
        if i > 0 and j > 0 and d[i][j] == d[i - 1][j - 1] + (P[i - 1] != T[j - 1]):
            mapping[j - 1] = i - 1
            i, j = i - 1, j - 1
        elif i > 0 and d[i][j] == d[i - 1][j] + 1:
            omissions += 1  # 목표 글자가 입력에서 빠짐 (터치가 인식 안 된 경우 등)
            i -= 1
        else:
            insertions += 1
            j -= 1

    shift = mapping[m - 1] - (m - 1) if m else 0  # 최종 입력 뒤쪽(지워진 꼬리)은 마지막 어긋남을 이어 씀

    def target(p):
        if p < 0:
            return None
        pi = mapping[p] if p < m else p + shift
        return char_to_key(P[pi]) if 0 <= pi < n else None

    out = [{**s, "intended": None if s["decoded"] == "backspace" else target(p)} for s, p in zip(strokes, pos)]
    return out, omissions, insertions, n, typed


def summarize(strokes, key="decoded"):
    """키 입력 목록 → 백스페이스 수, 키 오류율, 이웃 키 오류율.

    분모는 백스페이스를 뺀 키 입력 수. 오류 = 의도 키와 다른 키. 이웃 키 오류 = 그중 의도 키의 이웃 키.
    key: 어떤 판정을 볼지 ('decoded' = 화면에 보인 판정, 'base'·'cal'·'m0'·'m1' = 섀도 판정)
    """
    bs = sum(s[key] == "backspace" for s in strokes)
    non = [s for s in strokes if s[key] != "backspace"]
    err = nbr = 0
    for s in non:
        if not s["intended"]:
            continue
        if s[key] != s["intended"]:
            err += 1
            nbr += is_neighbor(s["intended"], s[key])
    k = len(non)
    return {"keystrokes": k, "backspaces": bs, "key_errors": err, "neighbor_errors": nbr,
            "key_error_rate": err / k if k else 0.0, "neighbor_error_rate": nbr / k if k else 0.0,
            "backspace_rate": bs / len(strokes) if strokes else 0.0}


def wpm(typed, seconds):
    """WPM = (입력 글자 수 − 1) / 초 × 60 / 5. 한 단어 = 5글자로 보는 텍스트 입력 연구의 표준 정의."""
    return 0.0 if seconds <= 0 or len(typed) < 2 else (len(typed) - 1) / seconds * 12


def msd(a, b):
    """최소 문자열 거리(Levenshtein): a를 b로 바꾸는 데 필요한 최소 삽입·삭제·치환 수."""
    prev = list(range(len(b) + 1))
    for i in range(1, len(a) + 1):
        cur = [i]
        for j in range(1, len(b) + 1):
            cur.append(min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] != b[j - 1])))
        prev = cur
    return prev[-1]


# ---------------------------------------------------------------------------
# 3. 참가자 이벤트 → 문장 단위로 묶기
# ---------------------------------------------------------------------------
CONDITIONS = {"A": ("baseline", "bare"), "B": ("baseline", "glove"), "C": ("calibrated", "bare"), "D": ("calibrated", "glove")}


def collect_trials(events):
    """본 과제 문장들을 조건별로 모은다. 결과: {조건: [ (trial_end 이벤트, 입력 목록), ... ]}

    - 재시작 규칙: 어떤 조건의 본 과제 typing_start가 다시 나오면 그 조건을 처음부터 다시 센다(마지막 시도만).
    - 입력 하나에 판정 다섯 가지를 함께 담는다: decoded(화면), base(기본), cal(보정), m0, m1.
    """
    trials = {c: [] for c in CONDITIONS}
    pending = {c: [] for c in CONDITIONS}
    restarts = {c: -1 for c in CONDITIONS}
    for e in events:
        c = e.get("cond")
        if c not in CONDITIONS:
            continue
        if e["ev"] == "typing_start" and e.get("phase") == "main":
            trials[c], pending[c] = [], []
            restarts[c] += 1
        elif e["ev"] == "touch" and e.get("phase") == "main" and e["keyShown"] != "shift":
            pending[c].append({"decoded": e["keyShown"], "base": e["keyBase"], "cal": e.get("keyCal"),
                               "m0": e.get("keyM0"), "m1": e.get("keyM1"), "sim": e.get("sim", False)})
        elif e["ev"] == "trial_end" and e.get("phase") == "main":
            trials[c].append((e, pending[c]))
            pending[c] = []
    return trials, {c: max(0, r) for c, r in restarts.items()}


def _last(events, ev, **match):
    for e in reversed(events):
        if e["ev"] == ev and all(e.get(k) == v for k, v in match.items()):
            return e
    return None


# ---------------------------------------------------------------------------
# 4. 표 만들기: 참가자 × 조건 / 문장 / 키 입력
# ---------------------------------------------------------------------------
def build_tables(sessions):
    """세 가지 표를 만든다.

    per_condition : 참가자 × 조건 한 줄 (48줄). 통계 분석의 기본 단위.
    per_trial     : 문장 한 줄 (384줄).
    keystrokes    : 키 입력 한 줄 (백스페이스 제외). GLMM(키 입력 단위 분석)에 쓴다.
    """
    cond_rows, trial_rows, key_rows = [], [], []
    for code, ev in sessions.items():
        start = _last(ev, "participant_start")
        order = start["order"]
        trials, restarts = collect_trials(ev)
        for cond, (keyboard, hand) in CONDITIONS.items():
            strokes_all, omissions, chars = [], 0, 0
            wpms, msds = [], []
            for k, (end, strokes) in enumerate(trials[cond]):
                aligned, om, ins, n_chars, typed = align_trial(end["phrase"], strokes)
                sec = (end["end"] - end["start"]) / 1000
                w, m = wpm(end["typed"], sec), msd(end["phrase"], end["typed"]) / max(len(end["phrase"]), len(end["typed"]))
                s = summarize(aligned)
                trial_rows.append({"participant": code, "cond": cond, "keyboard": keyboard, "hand": hand, "trial": k,
                                   "phrase": end["phrase"], "typed": end["typed"], "typed_matches_log": typed == end["typed"],
                                   "seconds": sec, "wpm": w, "msd_rate": m, "omissions": om, **s})
                for st in aligned:
                    if st["decoded"] == "backspace":
                        continue
                    key_rows.append({"participant": code, "cond": cond, "keyboard": keyboard, "hand": hand,
                                     "phrase": end["phrase"], "intended": st["intended"], "decoded": st["decoded"],
                                     "neighbor_error": int(bool(st["intended"]) and st["decoded"] != st["intended"]
                                                           and is_neighbor(st["intended"], st["decoded"]))})
                strokes_all += aligned
                omissions += om
                chars += n_chars
                wpms.append(w)
                msds.append(m)
            s = summarize(strokes_all)
            # 섀도 판정: 화면에 보인 입력(백스페이스 제외)마다, 같은 터치를 다른 판정으로 읽었다면 어떤 키였는지로 다시 센다.
            shadow = {f"shadow_{kk}_neighbor_error_rate": summarize([x for x in strokes_all if x["decoded"] != "backspace" and x[kk]], kk)["neighbor_error_rate"]
                      for kk in ("base", "cal", "m0", "m1")}
            survey, sus = _last(ev, "survey", cond=cond), _last(ev, "sus", cond=cond)
            cond_rows.append({
                "participant": code, "group": start["group"], "order": order, "cond": cond, "keyboard": keyboard, "hand": hand,
                "position": order.index(cond) + 1, "trials": len(trials[cond]), "restarts": restarts[cond],
                **{k2: s[k2] for k2 in ("keystrokes", "neighbor_errors", "neighbor_error_rate", "key_error_rate", "backspaces", "backspace_rate")},
                "omission_rate": omissions / chars if chars else 0.0,
                "msd_rate": sum(msds) / len(msds) if msds else 0.0,
                "wpm": sum(wpms) / len(wpms) if wpms else 0.0,
                **shadow,
                "tlx_raw": survey["tlxRaw"] if survey else None, "discomfort": survey["discomfort"] if survey else None,
                "sus": sus["score"] if sus else None,
                "pref_glove": (_last(ev, "preference", hand="glove") or {}).get("keyboard"),
                "pref_bare": (_last(ev, "preference", hand="bare") or {}).get("keyboard"),
                "simulated": any(x["sim"] for x in strokes_all),
            })
    return pd.DataFrame(cond_rows), pd.DataFrame(trial_rows), pd.DataFrame(key_rows)
