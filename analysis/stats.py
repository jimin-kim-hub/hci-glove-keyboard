"""stats.py — 2×2 피험자 내 실험의 통계 분석 (2x2 within-subjects analysis)

실행: python3 -I analysis/stats.py [analysis_out/per_condition.csv] [analysis_out]
  - 입력: extract.mjs가 만든 per_condition.csv (참가자 × 조건 한 줄씩, 12명 × 4조건 = 48줄)
  - 출력: report.md (표로 된 결과), fig1–3 PNG (그래프)
  - 필요: numpy, scipy, matplotlib

────────────────────────────────────────────────────────────────────────────
이 실험은 무엇을 비교하나
  같은 참가자가 4조건을 모두 한다 (피험자 내 설계, within-subjects).
    A 기본 키보드·맨손   B 기본 키보드·장갑   C 보정 키보드·맨손   D 보정 키보드·장갑
  요인 2개 × 수준 2개 = 2×2 설계. 키보드(기본/보정), 손 상태(맨손/장갑).

가설과 검정
  H1 장갑에서 보정 키보드가 오타를 줄인다      → B vs D 비교 (핵심)
  H2 보정의 이득은 장갑에서 더 크다             → 상호작용 검정
  H3 장갑에서 보정이 작업 부하·불편을 줄인다    → TLX·불편도의 B vs D
  H4 맨손에서는 차이가 작고 속도는 유지된다     → A vs C 비교

언제 정했나 (결과를 보고 방법을 고르지 않았다는 근거)
  사전 계획(2026-11-03, 데이터 수집 전):
    2×2 반복측정 분산분석, 사전 지정 비교 H1·H4 + Holm 보정, 비모수 방법 병행.
  사후 추가(데이터 수집 후, 확인용 — 결론을 바꾸지 않음):
    ART 분산분석, arcsine 변환, 95% 신뢰구간, 섀도 판정, 순서 확인, 그래프.

지표의 역할
  주 지표   : 이웃 키 오류율. 확증 결론(H1·H2)은 이 지표로만 내린다.
  보조·주관 : 나머지. 결과를 뒷받침하는 근거로만 보고한다.
             (지표 9개를 모두 '확증'으로 쓰면 우연히 유의하게 나올 확률이 커지기 때문)
  불편도(1–7)는 서열 척도라 평균 기반 t검정 대신 비모수 결과(Wilcoxon·ART)를 주 결과로 본다.
────────────────────────────────────────────────────────────────────────────
"""
import csv
import sys
from collections import Counter

import numpy as np
from scipy import stats

SRC = sys.argv[1] if len(sys.argv) > 1 else "analysis_out/per_condition.csv"
OUTDIR = sys.argv[2] if len(sys.argv) > 2 else "analysis_out"
CONDS = "ABCD"  # 행렬의 열 순서: 0=A, 1=B, 2=C, 3=D
COND_KO = {"A": "A 기본·맨손", "B": "B 기본·장갑", "C": "C 보정·맨손", "D": "D 보정·장갑"}

# 분석할 지표 목록. 각 항목:
#   (CSV 열 이름, 한국어 이름, 표시 배율(비율→%면 100), 단위, 낮을수록 좋은가, 역할, 서열 척도인가)
METRICS = [
    ("neighbor_error_rate", "이웃 키 오류율", 100, "%", True, "주", False),   # 옆 키가 눌린 비율 (주 지표)
    ("key_error_rate", "키 오류율", 100, "%", True, "보조", False),            # 틀린 키 전체 비율
    ("wpm", "WPM", 1, "", False, "보조", False),                               # 분당 단어 수 (속도)
    ("backspaces", "백스페이스 수 (8문장)", 1, "", True, "보조", False),       # 고친 횟수
    ("msd_rate", "MSD 오류율 (최종 문장)", 100, "%", True, "보조", False),     # 다 고친 뒤 남은 오류
    ("omission_rate", "누락률", 100, "%", True, "보조", False),                # 인식 안 돼 빠진 글자
    ("tlx_raw", "NASA-TLX raw", 1, "", True, "주관", False),                   # 작업 부하 0–100
    ("discomfort", "불편도 (1–7)", 1, "", True, "주관", True),                 # 서열 척도
    ("sus", "SUS", 1, "", False, "주관", False),                               # 사용성 0–100
]

rows = list(csv.DictReader(open(SRC, encoding="utf-8")))
sessions = sorted({r["session"] for r in rows})  # 참가자 = 로그 파일 (번호는 그룹마다 겹치므로 파일로 구분)
n = len(sessions)
by = {(r["session"], r["cond"]): r for r in rows}
# 95% 신뢰구간에 쓰는 t 임계값 (자유도 n−1). 12명이면 약 2.20
TCRIT = stats.t.ppf(0.975, n - 1)


def mat(col):
    """지표 하나를 참가자 × 조건 행렬(n × 4)로 만든다. 열 순서 A, B, C, D.

    분석 단위가 '참가자 × 조건 평균'이라는 점이 중요하다. 한 사람의 키 입력 수백 개를 각각
    독립 표본으로 세면 표본이 수천 개로 부풀어 p값이 실제보다 작게 나온다(유사 반복, pseudo-replication).
    """
    return np.array([[float(by[(s, c)][col]) for c in CONDS] for s in sessions])


def fmt_p(p):
    return "< .001" if p < 0.001 else f"{p:.3f}"


def holm(ps):
    """Holm 보정 (Holm-Bonferroni).

    왜: 검정을 여러 번 하면 '우연히 유의'가 나올 확률이 커진다(5% × 검정 수).
    어떻게: p값을 작은 순으로 정렬해, 가장 작은 p에는 ×k, 다음에는 ×(k−1) … 을 곱한다.
           Bonferroni(전부 ×k)보다 덜 보수적이면서 전체 오류율을 5%로 지킨다.
    여기서는 사전 지정 비교 두 개(H1, H4)에 적용한다(k = 2).
    """
    order = sorted(range(len(ps)), key=lambda i: ps[i])
    adj, run = [0.0] * len(ps), 0.0
    for rank, i in enumerate(order):
        run = max(run, min(1.0, (len(ps) - rank) * ps[i]))  # 보정 p는 순서가 뒤집히지 않게 누적 최댓값
        adj[i] = run
    return adj


EFFECTS = ["키보드 (보정 − 기본)", "손 상태 (장갑 − 맨손)", "상호작용 (장갑 이득 − 맨손 이득)"]


def contrasts(X):
    """참가자마다 세 가지 '차이 점수(대비, contrast)'를 계산한다.

    키보드 효과   = (보정 두 조건 평균) − (기본 두 조건 평균)
    손 상태 효과  = (장갑 두 조건 평균) − (맨손 두 조건 평균)
    상호작용      = (장갑에서 보정이 줄인 양: B − D) − (맨손에서 보정이 줄인 양: A − C)
                    → 양수면 '보정의 이득이 장갑에서 더 크다'(H2)는 뜻
    """
    A, B, C, D = X.T
    return [(C + D) / 2 - (A + B) / 2, (B + D) / 2 - (A + C) / 2, (B - D) - (A - C)]


def rm_anova(X):
    """2×2 반복측정 분산분석 (RM-ANOVA, repeated-measures ANOVA).

    왜: 같은 사람이 4조건을 모두 했으므로, 사람 사이의 실력 차이를 빼고 조건 차이만 본다.
        요인이 두 개라 키보드 효과·손 상태 효과·상호작용(H2)을 한 번에 검정할 수 있다.
    어떻게: 요인마다 수준이 2개면, 각 효과의 F값은 '참가자별 대비 점수가 0과 다른가'를 보는
           1표본 t검정의 t²과 정확히 같다(F(1, n−1) = t²). 제곱합으로 계산하는 일반 공식과
           같은 값이 나오는 것을 따로 확인했다.
           수준이 2개라 반복측정 분산분석의 까다로운 가정인 구형성(sphericity)이 자동으로 충족된다.
    효과 크기: 부분 η² = F / (F + 오차 자유도). 그 효과가 설명하는 변동의 비율(0–1).
    """
    out = []
    for d in contrasts(X):
        t, p = stats.ttest_1samp(d, 0.0)
        F = t * t
        out.append((F, p, F / (F + (n - 1))))
    return out


def art_anova(X):
    """ART 분산분석 (Aligned Rank Transform, Wobbrock et al., CHI 2011) — 비모수 2×2 분석.

    왜: 오류율은 0 근처로 치우친 분포이고 불편도는 서열 척도라 정규분포 가정이 약하다.
        Wilcoxon 같은 비모수 검정은 두 조건만 비교할 수 있어 상호작용(H2)을 검정하지 못한다.
        ART는 순위를 쓰면서도 요인 설계의 주효과·상호작용을 검정할 수 있어 HCI에서 표준으로 쓴다.
    어떻게 (효과마다 따로):
        1) 정렬(align): 각 값에서 '조건 평균'을 빼서 잔차만 남기고, 보려는 효과 하나만 다시 더한다.
           → 다른 효과는 지워지고 그 효과만 남은 데이터가 된다.
        2) 순위 변환: 48개 값 전체를 순위로 바꾼다(값의 크기 대신 순서만 사용).
        3) 순위에 같은 반복측정 분산분석을 하고, 1)에서 남긴 그 효과의 결과만 읽는다.
    검증: 효과가 없는 모의 데이터로 2,000번 돌렸을 때 p<.05가 나오는 비율이 약 5%였다(정상).
    """
    gm = X.mean()                 # 전체 평균
    cell = X.mean(axis=0)         # 조건(셀)별 평균: A, B, C, D
    kb = {0: (cell[0] + cell[1]) / 2, 1: (cell[2] + cell[3]) / 2}   # 키보드별 평균 (0 기본, 1 보정)
    hd = {0: (cell[0] + cell[2]) / 2, 1: (cell[1] + cell[3]) / 2}   # 손 상태별 평균 (0 맨손, 1 장갑)
    KB, HD = [0, 0, 1, 1], [0, 1, 0, 1]                              # 열 A–D의 키보드·손 상태
    resid = X - cell                                                 # 조건 평균을 뺀 잔차
    est = [  # 효과별 추정치 (주효과 2개, 상호작용 1개)
        np.array([kb[KB[j]] - gm for j in range(4)]),
        np.array([hd[HD[j]] - gm for j in range(4)]),
        np.array([cell[j] - kb[KB[j]] - hd[HD[j]] + gm for j in range(4)]),
    ]
    out = []
    for e, ef in enumerate(est):
        aligned = resid + ef                                                  # 1) 정렬
        ranks = stats.rankdata(aligned.ravel()).reshape(aligned.shape)        # 2) 순위 (동점은 평균 순위)
        t, p = stats.ttest_1samp(contrasts(ranks)[e], 0.0)                    # 3) 그 효과만 검정
        F = t * t
        out.append((F, p, F / (F + (n - 1))))
    return out


def paired(x, y):
    """두 조건의 대응 비교 (사전 지정 비교에 사용). x = 기본, y = 보정. 차이 = y − x.

    대응 t검정 (paired t-test): 사람별 차이의 '평균'이 0과 다른가. 차이가 정규분포라고 가정한다.
    Wilcoxon 부호 순위 검정: 사람별 차이의 '순위'로 검정한다. 정규분포 가정이 필요 없다.
        → 두 검정의 결론이 같으면 분포 가정에 흔들리지 않는 결과다.
    95% 신뢰구간: 평균 차이 ± t임계값 × 표준오차. '진짜 차이'가 있을 법한 범위.
        → p값은 '차이가 있나'만 알려 주므로, '얼마나 큰가'는 신뢰구간으로 보여 준다.
    dz (효과 크기): 평균 차이 ÷ 차이의 표준편차. 사람마다 얼마나 일정하게 좋아졌는지까지 반영한다.
        관례상 0.2 작음 · 0.5 중간 · 0.8 이상 큼.
    모든 검정은 양측(two-sided)이다. 한쪽 방향만 보는 단측 검정보다 보수적이다.
    """
    d = y - x
    sd = d.std(ddof=1)
    se = sd / np.sqrt(n)
    pt = stats.ttest_rel(y, x).pvalue
    try:
        pw = stats.wilcoxon(y, x).pvalue
    except ValueError:  # 모든 차이가 0이면 Wilcoxon을 계산할 수 없음
        pw = 1.0
    return {"mean": d.mean(), "lo": d.mean() - TCRIT * se, "hi": d.mean() + TCRIT * se,
            "dz": d.mean() / sd if sd > 0 else float("nan"), "pt": pt, "pw": pw, "d": d}


# ============================================================================
# 보고서 작성 (report.md)
# ============================================================================
L = []
w = L.append
w("# 본 실험 분석 결과 (자동 생성)\n")
w(f"- 입력: `{SRC}` · 참가자 {n}명 (세션 = 로그 파일, 참가자 번호는 그룹마다 겹침)")
groups = Counter(by[(s, 'A')]["group"] for s in sessions)
w("- 순서 그룹별 인원: " + ", ".join(f"그룹 {g}: {groups[g]}명" for g in sorted(groups)))
w(f"- 재시작: {sum(int(r['restarts']) for r in rows)}건 · 조건당 문장 수: {sorted({r['trials'] for r in rows})}")
w("- 분석 단위: 참가자 × 조건 평균 (키 입력 하나하나를 독립 표본으로 세지 않음)")
w("- **사전 계획(11/3):** 2×2 반복측정 분산분석, 사전 지정 비교 H1(B vs D)·H4(A vs C) + Holm, 비모수 병행. "
  "**사후 추가(확인용):** arcsine 변환, ART 분산분석, 95% 신뢰구간, 섀도 판정, 순서 확인, 그래프.")
w("- 지표 역할: **주** 지표(이웃 키 오류율)만 확증 결론에 쓰고, 보조·주관 지표는 뒷받침 근거로 보고한다. 불편도는 서열 척도라 비모수 결과(Wilcoxon·ART)를 주 결과로 본다.\n")

# ---- 1. 기술 통계: 조건별 평균·표준편차·중앙값 ----
# 검정 전에 데이터가 어떻게 생겼는지 본다. 평균과 중앙값이 크게 다르면 분포가 치우쳤다는 신호.
w("## 1. 조건별 기술 통계 (평균 ± 표준편차, [중앙값])\n")
w("| 역할 | 지표 | " + " | ".join(COND_KO[c] for c in CONDS) + " |")
w("|---" * 6 + "|")
for col, label, sc, unit, _, role, _o in METRICS:
    X = mat(col) * sc
    cells = [f"{X[:, i].mean():.1f}{unit} ± {X[:, i].std(ddof=1):.1f} [{np.median(X[:, i]):.1f}]" for i in range(4)]
    w(f"| {role} | {label} | " + " | ".join(cells) + " |")
w("")

# ---- 2. 2×2 분산분석: 모수(RM-ANOVA)와 비모수(ART)를 나란히 ----
# 둘 다 유의하면 '분포 가정과 상관없이' 같은 결론이라는 뜻이다.
w("## 2. 2×2 분산분석: 반복측정(모수)과 ART(비모수)\n")
w(f"F(1, {n-1}). 반복측정 분산분석은 평균을, ART는 순위를 쓴다. 두 결과가 같으면 분포 가정에 흔들리지 않는 결과다.\n")
w("| 역할 | 지표 | 효과 | RM-ANOVA F | p | 부분 η² | ART F | ART p |")
w("|---|---|---|---|---|---|---|---|")
for col, label, sc, unit, _, role, _o in METRICS:
    X = mat(col)
    for name, (F, p, eta), (Fa, pa, _) in zip(EFFECTS, rm_anova(X), art_anova(X)):
        w(f"| {role} | {label} | {name} | {F:.2f} | {fmt_p(p)} | {eta:.2f} | {Fa:.2f} | {fmt_p(pa)} |")
w("")
# arcsine-sqrt 변환: 비율 데이터는 0%·100% 근처에서 퍼짐(분산)이 작아지는 성질이 있어,
# 분산분석의 '분산이 같다' 가정을 맞추려고 쓰는 전통적인 변환. 변환 후에도 결론이 같은지만 확인한다.
X = mat("neighbor_error_rate")
w("**주 지표 변환 민감도** (arcsine-sqrt 변환 후 반복측정 분산분석):\n")
for name, (F, p, eta) in zip(EFFECTS, rm_anova(np.arcsin(np.sqrt(X)))):
    w(f"- {name}: F(1, {n-1}) = {F:.2f}, p {fmt_p(p)}, 부분 η² = {eta:.2f}")
w("")

# ---- 3. 사전 지정 비교: 가설이 직접 묻는 두 쌍만 비교 ----
# 모든 조건 쌍(6개)을 비교하지 않고, 미리 정한 H1(B vs D)과 H4(A vs C)만 본다 → 검정 수가 적어 덜 부풀려짐.
# Shapiro-Wilk: 사람별 차이가 정규분포를 따르는지 확인(p가 작으면 정규성이 의심됨 → Wilcoxon 쪽을 더 믿는다).
w("## 3. 사전 지정 비교 (H1: B vs D, H4: A vs C)\n")
w("차이 = 보정 − 기본 (95% 신뢰구간). 오류·부담 지표는 음수가, WPM·SUS는 양수가 좋은 쪽. "
  "p는 Holm 보정값(괄호 안은 보정 전), 양측 검정. dz: 0.2 작음 · 0.5 중간 · 0.8 이상 큼.\n")
w("| 역할 | 지표 | 비교 | 평균 차이 [95% CI] | 상대 변화 | dz | 좋아진 사람 | p_t (Holm) | p_W (Holm) | 차이 정규성 (Shapiro p) |")
w("|---|---|---|---|---|---|---|---|---|---|")
COMPARE = {"H1 B→D": (1, 3), "H4 A→C": (0, 2)}  # (기본 조건 열, 보정 조건 열)
summary = {}
for col, label, sc, unit, lower, role, ordinal in METRICS:
    X = mat(col)
    res = {k: paired(X[:, a], X[:, b]) for k, (a, b) in COMPARE.items()}
    pta = holm([r["pt"] for r in res.values()])   # t검정 p값 두 개를 Holm 보정
    pwa = holm([r["pw"] for r in res.values()])   # Wilcoxon p값 두 개를 Holm 보정
    for (name, r), pt_adj, pw_adj in zip(res.items(), pta, pwa):
        a, _ = COMPARE[name]
        base = X[:, a].mean()
        # 상대 변화(%): 기본 조건 대비 몇 % 변했나. 기준값이 1% 미만이면 % 변화가 과장되므로 표시하지 않는다.
        rel = f"{r['mean']/base*100:+.0f}%" if base and not (unit == "%" and base * sc < 1) else "— (기준값이 1% 미만)"
        better = int((r["d"] < 0).sum() if lower else (r["d"] > 0).sum())  # 좋아진 사람 수
        sh = stats.shapiro(r["d"]).pvalue if np.ptp(r["d"]) > 0 else float("nan")
        pt_txt = "(서열 척도: 참고)" if ordinal else f"{fmt_p(pt_adj)} ({fmt_p(r['pt'])})"
        du = "%p" if unit == "%" else unit  # 비율의 차이는 %p(퍼센트포인트)
        w(f"| {role} | {label} | {name} | {r['mean']*sc:+.2f}{du} [{r['lo']*sc:+.2f}, {r['hi']*sc:+.2f}] | {rel} | {r['dz']:+.2f} | "
          f"{better}/{n} | {pt_txt} | {fmt_p(pw_adj)} ({fmt_p(r['pw'])}) | {sh:.3f} |")
        summary[(col, name)] = r
w("")
# H4는 '차이가 없다'를 주장하는 가설이다. 유의하지 않은 p는 '차이 없음의 증거'가 아니므로
# 신뢰구간으로 '차이가 있더라도 이 정도 이하'라고 보고한다.
r = summary[("neighbor_error_rate", "H4 A→C")]
w(f"> H4 해석 주의: p가 크다는 것은 '차이가 없다는 증거'가 아니라 '차이를 찾지 못했다'는 뜻이다. "
  f"맨손 주 지표 차이의 95% 신뢰구간은 [{r['lo']*100:+.2f}, {r['hi']*100:+.2f}]%p로, 차이가 있더라도 이 범위 안에서 작다고 보고한다(동등성 여유 폭은 사전에 정하지 않았음).\n")

# 장갑 손해 감소율: '장갑을 끼면 얼마나 나빠지나'를 기본 키보드(B−A)와 보정 키보드(D−C)에서 각각 구해,
# 보정이 그 손해의 몇 %를 없앴는지 본다. 발표에서 효과 크기를 직관적으로 설명할 때 쓴다.
w("**장갑 손해 중 보정이 줄인 몫** (장갑 손해 = 장갑 − 맨손, 기본 키보드 B−A vs 보정 키보드 D−C):\n")
for col, label, sc, unit, lower, role, _o in METRICS[:3]:
    X = mat(col) * sc
    pen_base = (X[:, 1] - X[:, 0]).mean()
    pen_cal = (X[:, 3] - X[:, 2]).mean()
    du = "%p" if unit == "%" else unit
    w(f"- {label}: 기본 {pen_base:+.1f}{du} → 보정 {pen_cal:+.1f}{du} (장갑 손해의 {(1 - pen_cal/pen_base)*100:.0f}% 감소)")
w("")

# ---- 4. 섀도 판정: 같은 터치를 두 판정 방식으로 다시 계산 ----
# 앱은 모든 터치를 기본·보정 두 방식으로 판정해 기록한다(섀도 로깅). 같은 손가락 움직임에 판정만 바꿨을 때의
# 차이이므로 '판정 방식 자체의 효과'를 본다. 단, 참가자는 화면에 보인 판정에 맞춰 행동했으므로 참고용이다.
w("## 4. 섀도 판정: 같은 터치를 기본 vs 보정으로 판정한 이웃 키 오류율\n")
w("화면 피드백 효과가 빠진 판정만의 비교다. 참가자는 화면에 보인 판정에 맞춰 행동했으므로 참고용이다.\n")
w("| 조건 | 기본 판정 | 보정 판정 | 보정이 낮은 사람 | Wilcoxon p |")
w("|---|---|---|---|---|")
for i, c in enumerate(CONDS):
    b, k = mat("shadow_base_neighbor_error_rate")[:, i], mat("shadow_cal_neighbor_error_rate")[:, i]
    try:
        p = stats.wilcoxon(k, b).pvalue
    except ValueError:
        p = 1.0
    w(f"| {COND_KO[c]} | {b.mean()*100:.1f}% | {k.mean()*100:.1f}% | {(k < b).sum()}/{n} (높음 {(k > b).sum()}) | {fmt_p(p)} |")
w("")

# ---- 5. 순서 효과 확인 ----
# 뒤에 하는 조건은 연습 효과로 유리할 수 있다. 라틴 방격으로 순서를 섞었지만, 실제로 상쇄됐는지 확인한다.
# Mann-Whitney U: 서로 다른 두 집단(보정을 먼저 한 6명 vs 나중에 한 6명)을 순위로 비교하는 비모수 검정.
w("## 5. 순서 효과 확인\n")
pos = {p: [] for p in range(1, 5)}
for row in rows:
    pos[int(row["position"])].append(float(row["neighbor_error_rate"]) * 100)
w("진행 위치별 이웃 키 오류율 평균(라틴 방격이라 위치마다 각 조건이 같은 수로 들어감): " +
  ", ".join(f"{p}번째 {np.mean(v):.1f}%" for p, v in pos.items()))
for hand, (x, y) in {"장갑 (B→D)": ("B", "D"), "맨손 (A→C)": ("A", "C")}.items():
    first, second = [], []
    for s in sessions:
        o = by[(s, x)]["order"]
        gain = (float(by[(s, y)]["neighbor_error_rate"]) - float(by[(s, x)]["neighbor_error_rate"])) * 100
        (first if o.index(y) < o.index(x) else second).append(gain)
    p = stats.mannwhitneyu(first, second).pvalue
    w(f"- {hand}: 보정을 먼저 한 사람({len(first)}명) 평균 차이 {np.mean(first):+.2f}%p, "
      f"기본을 먼저 한 사람({len(second)}명) {np.mean(second):+.2f}%p, Mann-Whitney p {fmt_p(p)}")
w("- 주의: 6명 대 6명이라 검정력이 낮다. '순서 효과가 없다'가 아니라 '보정 효과가 순서와 관계없이 같은 방향'이라고 보고한다.\n")

# ---- 6. 선호 ----
# 이항 검정: '같음'을 뺀 응답에서 보정을 고른 비율이 우연(50%)보다 높은가.
w("## 6. 선호 (손 상태별 X/Y 비교 질문)\n")
for hand, col in (("장갑", "pref_glove"), ("맨손", "pref_bare")):
    cnt = Counter(by[(s, 'A')][col] for s in sessions)
    k = cnt.get("calibrated", 0)
    m = k + cnt.get("baseline", 0)
    p = stats.binomtest(k, m).pvalue if m else float("nan")
    w(f"- {hand}: 보정 {k}, 기본 {cnt.get('baseline', 0)}, 같음 {cnt.get('same', 0)} (같음 제외 이항 검정 p {fmt_p(p)})")
w("")

# ---- 7. 참가자별 결과 (개인차 확인용) ----
w("## 7. 참가자별 장갑 이웃 키 오류율 (B → D)\n")
w("| 세션(파일) | 순서 | B | D | 차이 |")
w("|---|---|---|---|---|")
for s in sessions:
    b, d = float(by[(s, 'B')]["neighbor_error_rate"]) * 100, float(by[(s, 'D')]["neighbor_error_rate"]) * 100
    w(f"| {s} | {by[(s, 'A')]['order']} | {b:.1f}% | {d:.1f}% | {d-b:+.1f}%p |")
w("")
w("## 그래프\n")
w("- `fig1_interaction.png`: 조건별 평균 + 95% 신뢰구간 (H2 상호작용)")
w("- `fig2_participants.png`: 참가자별 B→D, A→C 변화 (개인차)")
w("- `fig3_differences.png`: 보정 − 기본 차이 + 95% 신뢰구간 (차이의 크기)\n")
w("> 한계: 12명 소표본. 이항 GLMM(키 입력 단위, 참가자 무작위 효과)은 계획상 '선택'이었고 구현하지 않음(statsmodels 미설치).")

open(f"{OUTDIR}/report.md", "w", encoding="utf-8").write("\n".join(L) + "\n")

# ============================================================================
# 그래프 (fig1–3)
# ============================================================================
import matplotlib  # noqa: E402

matplotlib.use("Agg")  # 화면 없이 파일로만 저장
import matplotlib.pyplot as plt  # noqa: E402
from matplotlib import font_manager  # noqa: E402

# 한글 글꼴 (macOS 기본 글꼴). 다른 OS면 이 경로를 그 OS의 한글 글꼴로 바꾼다.
for f in ("/System/Library/Fonts/AppleSDGothicNeo.ttc",):
    try:
        font_manager.fontManager.addfont(f)
        plt.rcParams["font.family"] = font_manager.FontProperties(fname=f).get_name()
    except Exception:
        pass
plt.rcParams.update({"axes.unicode_minus": False, "font.size": 10, "axes.spines.top": False, "axes.spines.right": False})
BASE_C, CAL_C = "#8a919c", "#1b64da"  # 기본 = 회색, 보정 = 파랑
FIG_METRICS = [("neighbor_error_rate", "이웃 키 오류율 (%)", 100), ("wpm", "WPM", 1), ("tlx_raw", "NASA-TLX raw", 1), ("sus", "SUS", 1)]

# fig1 — 상호작용 그래프: x축 맨손/장갑, 선 두 개(기본/보정), 점 = 평균, 막대 = 95% 신뢰구간.
#   두 선이 장갑 쪽에서 벌어지면 '보정의 이득이 장갑에서 더 크다'(H2)를 뜻한다.
fig, axes = plt.subplots(1, 4, figsize=(13, 3.4))
for ax, (col, lab, sc) in zip(axes, FIG_METRICS):
    X = mat(col) * sc
    for (ia, ib), name, color, dx in (((0, 1), "기본 (Y)", BASE_C, -0.04), ((2, 3), "보정 (X)", CAL_C, 0.04)):
        m = X[:, [ia, ib]].mean(axis=0)
        ci = TCRIT * X[:, [ia, ib]].std(axis=0, ddof=1) / np.sqrt(n)
        ax.errorbar(np.array([0, 1]) + dx, m, yerr=ci, marker="o", color=color, capsize=4, lw=2, label=name)
    ax.set_xticks([0, 1], ["맨손", "장갑"])
    ax.set_xlim(-0.4, 1.4)
    ax.set_title(lab)
axes[0].legend(frameon=False)
fig.suptitle(f"조건별 평균과 95% 신뢰구간 (n = {n})", y=1.02)
fig.tight_layout()
fig.savefig(f"{OUTDIR}/fig1_interaction.png", dpi=200, bbox_inches="tight")

# fig2 — 참가자별 변화: 한 선 = 한 사람. 파랑 = 보정에서 감소, 빨강 = 증가. 검은 굵은 선 = 평균.
#   평균만 보면 가려지는 개인차(모두 같은 방향인지, 예외가 있는지)를 보여 준다.
fig, axes = plt.subplots(1, 2, figsize=(8, 3.6), sharey=True)
X = mat("neighbor_error_rate") * 100
for ax, (a, b, title) in zip(axes, ((0, 2, "맨손: 기본(A) → 보정(C)"), (1, 3, "장갑: 기본(B) → 보정(D)"))):
    for i in range(n):
        up = X[i, b] > X[i, a]
        ax.plot([0, 1], [X[i, a], X[i, b]], color="#d9534f" if up else CAL_C, alpha=0.6, marker="o", ms=4)
    ax.plot([0, 1], [X[:, a].mean(), X[:, b].mean()], color="black", lw=3, marker="s", label="평균")
    ax.set_xticks([0, 1], ["기본", "보정"])
    ax.set_xlim(-0.3, 1.3)
    ax.set_title(title)
axes[0].set_ylabel("이웃 키 오류율 (%)")
axes[0].legend(frameon=False)
fig.suptitle("참가자별 변화 (파랑 = 감소, 빨강 = 증가)", y=1.02)
fig.tight_layout()
fig.savefig(f"{OUTDIR}/fig2_participants.png", dpi=200, bbox_inches="tight")

# fig3 — 차이와 95% 신뢰구간: 점 = 평균 차이(보정 − 기본), 막대 = 95% 신뢰구간, 점선 = 차이 0.
#   막대가 점선에 걸리지 않으면 실제 차이가 있다고 볼 수 있고, 막대의 위치가 '차이의 크기'를 보여 준다.
fig, axes = plt.subplots(1, 4, figsize=(13, 2.6))
for ax, (col, lab, sc) in zip(axes, FIG_METRICS):
    for y, name in ((1, "H1 B→D"), (0, "H4 A→C")):
        r = summary[(col, name)]
        ax.errorbar(r["mean"] * sc, y, xerr=[[r["mean"] * sc - r["lo"] * sc], [r["hi"] * sc - r["mean"] * sc]],
                    fmt="o", color=CAL_C if y else BASE_C, capsize=4, lw=2)
    ax.axvline(0, color="black", lw=0.8, ls="--")
    ax.set_yticks([0, 1], ["맨손 A→C", "장갑 B→D"])
    ax.set_ylim(-0.6, 1.6)
    ax.set_title(f"{lab.replace('(%)', '(%p)')}: 보정 - 기본")
fig.suptitle("보정 - 기본 평균 차이와 95% 신뢰구간 (점선 = 차이 없음)", y=1.04)
fig.tight_layout()
fig.savefig(f"{OUTDIR}/fig3_differences.png", dpi=200, bbox_inches="tight")

print("\n".join(L))
