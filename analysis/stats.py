"""stats.py — 2×2 피험자 내 실험의 통계 검정 함수

노트북(analysis.ipynb)이 이 함수들을 단계별로 불러 쓴다. 각 함수는 결과를 표(DataFrame)로 돌려준다.

실험 구조
  같은 참가자 12명이 4조건을 모두 했다 (피험자 내 설계).
    A 기본·맨손   B 기본·장갑   C 보정·맨손   D 보정·장갑
  요인 2개(키보드: 기본/보정, 손 상태: 맨손/장갑) × 수준 2개 = 2×2 설계.

가설 ↔ 검정
  H1 장갑에서 보정 키보드가 이웃 키 오류를 줄인다  → 사전 지정 비교 B vs D
  H2 보정의 이득은 장갑에서 더 크다                  → 분산분석의 상호작용
  H3 장갑에서 보정이 작업 부하·불편을 줄인다         → TLX·불편도의 B vs D
  H4 맨손에서는 차이가 작고 속도는 유지된다          → 사전 지정 비교 A vs C

방법을 언제 정했나 (실험계획 PDF A8, 2026-11-03 — 데이터 수집 전)
  주 분석: 참가자 × 조건별 이웃 키 오류율에 2×2 반복측정 분산분석. 사전 지정 비교 B vs D, A vs C + Holm 보정.
  정규성이 의심되면: arcsine-sqrt 변환, 비모수 대안(Wilcoxon 부호 순위, ART 분산분석).
  민감도 분석(선택): 키 입력 단위 로지스틱 혼합모형 error ~ keyboard * glove + (1|participant) + (1|phrase).
  부 지표(WPM, 최종 오류율, 백스페이스, TLX, 불편도, SUS)는 같은 틀로 분석하되 탐색적이라고 표시.
  보조 분석: 같은 터치에 두 판정을 다시 적용(오프라인 재생, 섀도 판정).
  효과 크기(dz, 95% 신뢰구간)를 함께 보고.
"""
import numpy as np
import pandas as pd
from scipy import stats

CONDS = ["A", "B", "C", "D"]
EFFECTS = ["키보드 (보정 − 기본)", "손 상태 (장갑 − 맨손)", "상호작용 (장갑 이득 − 맨손 이득)"]


def wide(per_condition, col):
    """참가자 × 조건 표(긴 형태)에서 지표 하나를 골라 참가자 × [A, B, C, D] 행렬(넓은 형태)로 바꾼다.

    분석 단위가 '참가자 × 조건 평균'이라는 점이 중요하다. 한 사람의 키 입력 수백 개를 각각 독립 표본으로
    세면 표본이 수천 개로 부풀어 p값이 실제보다 작게 나온다(유사 반복, pseudo-replication).
    """
    return per_condition.pivot(index="participant", columns="cond", values=col)[CONDS].astype(float)


# ---------------------------------------------------------------------------
# 1. 기술 통계
# ---------------------------------------------------------------------------
def describe(per_condition, metrics):
    """조건별 평균·표준편차·중앙값. 평균과 중앙값이 크게 다르면 분포가 한쪽으로 치우쳤다는 신호."""
    rows = []
    for col, label, scale in metrics:
        W = wide(per_condition, col) * scale
        for c in CONDS:
            rows.append({"지표": label, "조건": c, "평균": W[c].mean(), "표준편차": W[c].std(ddof=1), "중앙값": W[c].median()})
    return pd.DataFrame(rows).pivot_table(index="지표", columns="조건", values=["평균", "표준편차", "중앙값"], sort=False).round(2)


# ---------------------------------------------------------------------------
# 2. 정규성 확인
# ---------------------------------------------------------------------------
def normality(per_condition, metrics):
    """Shapiro-Wilk 검정: 사람별 차이(B−D, A−C)가 정규분포를 따르는가.

    왜: 대응 t검정과 반복측정 분산분석은 차이가 정규분포라고 가정한다.
    읽는 법: p < .05면 정규성이 의심된다 → 비모수 결과(Wilcoxon·ART)를 더 믿는다.
    """
    rows = []
    for col, label, scale in metrics:
        W = wide(per_condition, col)
        for name, (a, b) in {"B−D (장갑)": ("B", "D"), "A−C (맨손)": ("A", "C")}.items():
            d = W[a] - W[b]
            p = stats.shapiro(d).pvalue if d.std() > 0 else np.nan
            rows.append({"지표": label, "차이": name, "Shapiro-Wilk p": p, "정규성 의심 (p<.05)": p < 0.05})
    return pd.DataFrame(rows)


# ---------------------------------------------------------------------------
# 3. 2×2 반복측정 분산분석 (모수) + ART 분산분석 (비모수)
# ---------------------------------------------------------------------------
def _contrasts(X):
    """참가자마다 세 가지 차이 점수(대비)를 계산한다. X: n × 4 (A, B, C, D)

    키보드 효과   = (C + D)/2 − (A + B)/2       보정 키보드 평균 − 기본 키보드 평균
    손 상태 효과  = (B + D)/2 − (A + C)/2       장갑 평균 − 맨손 평균
    상호작용      = (B − D) − (A − C)           장갑에서 보정이 줄인 양 − 맨손에서 보정이 줄인 양
    """
    A, B, C, D = X.T
    return [(C + D) / 2 - (A + B) / 2, (B + D) / 2 - (A + C) / 2, (B - D) - (A - C)]


def _anova_from_contrasts(X):
    n = X.shape[0]
    out = []
    for d in _contrasts(X):
        t, p = stats.ttest_1samp(d, 0.0)
        F = t * t
        out.append((F, p, F / (F + (n - 1))))
    return out


def rm_anova(per_condition, col):
    """2×2 반복측정 분산분석 (two-way repeated-measures ANOVA).

    왜: 같은 사람이 4조건을 모두 했으므로 사람 사이의 실력 차이를 빼고 조건 차이만 본다.
        키보드 효과, 손 상태 효과, 상호작용(H2)을 한 번에 검정한다.
    어떻게: 요인마다 수준이 2개면, 각 효과의 F값은 '참가자별 대비 점수가 0과 다른가'를 보는
           1표본 t검정의 t²과 정확히 같다: F(1, n−1) = t². (제곱합 공식으로 계산한 값과 같음을 확인했다.)
           수준이 2개라 반복측정 분산분석의 구형성(sphericity) 가정이 자동으로 충족된다.
    효과 크기: 부분 η² = F / (F + 오차 자유도) — 그 효과가 설명하는 변동의 비율(0–1).
    """
    X = wide(per_condition, col).values
    n = X.shape[0]
    return pd.DataFrame([{"효과": e, "F": F, "df": f"(1, {n-1})", "p": p, "부분 η²": eta}
                         for e, (F, p, eta) in zip(EFFECTS, _anova_from_contrasts(X))])


def art_anova(per_condition, col):
    """ART 분산분석 (Aligned Rank Transform; Wobbrock, Findlater, Gergle & Higgins, CHI 2011).

    왜: 오류율은 0 근처로 치우친 분포이고 불편도는 1–7 서열 척도라 정규분포 가정이 약하다.
        Wilcoxon 같은 비모수 검정은 두 조건만 비교할 수 있어 상호작용(H2)을 검정하지 못한다.
        ART는 순위를 쓰면서도 주효과·상호작용을 검정할 수 있어 HCI 연구에서 표준으로 쓴다.
    어떻게 (효과마다 따로 반복):
        1) 정렬: 각 값에서 조건 평균을 빼 잔차만 남기고, 보려는 효과 하나의 추정치만 다시 더한다.
        2) 순위 변환: 48개 값 전체를 순위로 바꾼다.
        3) 순위에 같은 반복측정 분산분석을 하고, 그 효과의 결과만 읽는다.
    검증: 효과가 없는 모의 데이터로 2,000번 돌렸을 때 p < .05 비율이 약 5%였다(정상 작동).
    """
    X = wide(per_condition, col).values
    n = X.shape[0]
    gm, cell = X.mean(), X.mean(axis=0)
    kb = {0: (cell[0] + cell[1]) / 2, 1: (cell[2] + cell[3]) / 2}   # 키보드별 평균 (0 기본, 1 보정)
    hd = {0: (cell[0] + cell[2]) / 2, 1: (cell[1] + cell[3]) / 2}   # 손 상태별 평균 (0 맨손, 1 장갑)
    KB, HD = [0, 0, 1, 1], [0, 1, 0, 1]                              # A, B, C, D의 키보드·손 상태
    effects = [
        np.array([kb[KB[j]] - gm for j in range(4)]),
        np.array([hd[HD[j]] - gm for j in range(4)]),
        np.array([cell[j] - kb[KB[j]] - hd[HD[j]] + gm for j in range(4)]),
    ]
    rows = []
    for e, (name, eff) in enumerate(zip(EFFECTS, effects)):
        aligned = (X - cell) + eff
        ranks = stats.rankdata(aligned.ravel()).reshape(aligned.shape)
        t, p = stats.ttest_1samp(_contrasts(ranks)[e], 0.0)
        rows.append({"효과": name, "ART F": t * t, "df": f"(1, {n-1})", "p": p})
    return pd.DataFrame(rows)


# ---------------------------------------------------------------------------
# 4. 사전 지정 비교 (H1 B vs D, H4 A vs C) — Holm 보정, 효과 크기, 95% 신뢰구간
# ---------------------------------------------------------------------------
def holm(ps):
    """Holm 보정. 검정을 k번 하면 '우연히 유의'가 나올 확률이 커지므로, p값을 작은 순으로 ×k, ×(k−1)… 곱한다.
    Bonferroni(모두 ×k)보다 덜 보수적이면서 전체 오류율을 5%로 지킨다."""
    order = np.argsort(ps)
    adj, run = np.empty(len(ps)), 0.0
    for rank, i in enumerate(order):
        run = max(run, min(1.0, (len(ps) - rank) * ps[i]))
        adj[i] = run
    return adj


def planned_comparisons(per_condition, col, scale=1, lower_is_better=True, ordinal=False):
    """사전 지정 비교 두 개: H1 장갑 B→D, H4 맨손 A→C. 차이 = 보정 − 기본.

    대응 t검정: 사람별 차이의 평균이 0과 다른가 (차이가 정규분포라고 가정).
    Wilcoxon 부호 순위 검정: 사람별 차이의 순위로 검정 (정규분포 가정 없음).
        → 두 검정의 결론이 같으면 분포 가정에 흔들리지 않는 결과다.
    Holm 보정: 두 비교의 p값에 적용.
    95% 신뢰구간: 평균 차이 ± t임계값 × 표준오차. '진짜 차이'가 있을 법한 범위 → 차이의 크기를 보여 준다.
    dz: 평균 차이 ÷ 차이의 표준편차. 0.2 작음 · 0.5 중간 · 0.8 이상 큼.
    모든 검정은 양측(two-sided). 서열 척도(불편도)는 Wilcoxon을 주 결과로 본다.
    """
    W = wide(per_condition, col)
    n = len(W)
    tcrit = stats.t.ppf(0.975, n - 1)
    rows = []
    for name, (base, new) in {"H1 장갑 B→D": ("B", "D"), "H4 맨손 A→C": ("A", "C")}.items():
        d = (W[new] - W[base]).values
        sd, m = d.std(ddof=1), d.mean()
        se = sd / np.sqrt(n)
        try:
            pw = stats.wilcoxon(W[new], W[base]).pvalue
        except ValueError:
            pw = 1.0
        base_mean = W[base].mean()
        rows.append({
            "비교": name, "기본 평균": base_mean * scale, "보정 평균": W[new].mean() * scale,
            "평균 차이": m * scale, "95% CI 하한": (m - tcrit * se) * scale, "95% CI 상한": (m + tcrit * se) * scale,
            "상대 변화 %": m / base_mean * 100 if base_mean else np.nan,
            "dz": m / sd if sd > 0 else np.nan,
            "좋아진 사람": f"{int((d < 0).sum() if lower_is_better else (d > 0).sum())}/{n}",
            "t검정 p": stats.ttest_rel(W[new], W[base]).pvalue, "Wilcoxon p": pw,
        })
    out = pd.DataFrame(rows)
    out["t검정 p (Holm)"] = holm(out["t검정 p"].values)
    out["Wilcoxon p (Holm)"] = holm(out["Wilcoxon p"].values)
    if ordinal:
        out["주 결과"] = "Wilcoxon (서열 척도)"
    return out


def arcsine_sensitivity(per_condition, col):
    """arcsine-sqrt 변환 후 반복측정 분산분석. 비율 데이터는 0% 근처에서 분산이 작아지는 성질이 있어
    이를 고르게 만드는 전통적인 변환이다. 변환해도 결론이 같은지 확인하는 용도."""
    X = np.arcsin(np.sqrt(wide(per_condition, col).values))
    n = X.shape[0]
    return pd.DataFrame([{"효과": e, "F": F, "df": f"(1, {n-1})", "p": p, "부분 η²": eta}
                         for e, (F, p, eta) in zip(EFFECTS, _anova_from_contrasts(X))])


def glove_penalty(per_condition, col, scale=1):
    """장갑 손해 감소율: 장갑을 끼면 얼마나 나빠지나(장갑 − 맨손)를 기본 키보드(B−A)와 보정 키보드(D−C)에서 구해,
    보정이 그 손해의 몇 %를 줄였는지 본다. 효과 크기를 직관적으로 설명할 때 쓴다."""
    W = wide(per_condition, col) * scale
    pb, pc = (W["B"] - W["A"]).mean(), (W["D"] - W["C"]).mean()
    return {"기본 키보드 장갑 손해": pb, "보정 키보드 장갑 손해": pc, "손해 감소율 %": (1 - pc / pb) * 100}


# ---------------------------------------------------------------------------
# 5. 민감도 분석: 키 입력 단위 로지스틱 혼합모형 (GLMM)
# ---------------------------------------------------------------------------
def glmm(keystrokes):
    """키 입력 하나하나(약 1만 3천 개)를 그대로 쓰는 로지스틱 모형. 계획서 A8의 '민감도 분석(선택)'.

    왜: 주 분석은 참가자 × 조건 '평균 비율'을 쓴다. 이때 사람마다 키 입력 수가 달라도 같은 무게로 계산되고,
        0에 가까운 비율의 분포 문제도 남는다. GLMM은 키 입력마다 '이웃 키 오류였나(0/1)'를 직접 모형화하고,
        참가자 차이와 문장 차이를 무작위 효과로 따로 떼어 낸다. 결론이 주 분석과 같으면 결과가 더 단단하다.
    모형: logit P(이웃 키 오류) = b0 + b1·보정 + b2·장갑 + b3·보정×장갑 + (참가자) + (문장)
        b3(상호작용) < 0 이면 '보정의 효과가 장갑에서 더 크다'(H2).
        장갑에서의 보정 효과 = b1 + b3 (H1). exp(계수) = 오즈비(odds ratio): 1보다 작으면 오류 가능성 감소.
    두 가지로 적합한다 (statsmodels에는 빈도주의 이항 GLMM이 없어서):
        (a) 베이즈 이항 혼합모형 (BinomialBayesMixedGLM, 변분 베이즈): 참가자·문장 무작위 절편을 모두 넣는다.
            사후 표준편차가 실제보다 좁게 나오는 경향이 있어 계수의 방향·크기 확인용으로 쓴다.
        (b) GEE 로지스틱 (참가자 군집, exchangeable 상관): 같은 사람의 키 입력끼리 상관을 고려한
            강건 표준오차로 p값과 95% 신뢰구간을 낸다. 문장 효과는 넣지 못한다.
    """
    import statsmodels.api as sm
    import statsmodels.formula.api as smf
    from statsmodels.genmod.bayes_mixed_glm import BinomialBayesMixedGLM

    df = keystrokes.copy()
    df["cal"] = (df["keyboard"] == "calibrated").astype(int)
    df["glove"] = (df["hand"] == "glove").astype(int)
    formula = "neighbor_error ~ cal * glove"

    vb = BinomialBayesMixedGLM.from_formula(
        formula, {"participant": "0 + C(participant)", "phrase": "0 + C(phrase)"}, df).fit_vb()
    k = len(vb.fe_mean)
    bayes = pd.DataFrame({"계수": vb.model.exog_names[:k], "사후 평균": vb.fe_mean, "사후 SD": vb.fe_sd})
    bayes["오즈비 exp(계수)"] = np.exp(bayes["사후 평균"])
    re_sd = pd.DataFrame({"무작위 효과": ["참가자", "문장"], "SD (로짓)": np.exp(vb.vcp_mean)})

    gee = smf.gee(formula, groups="participant", data=df, family=sm.families.Binomial(),
                  cov_struct=sm.cov_struct.Exchangeable()).fit()
    ci = gee.conf_int()
    gtab = pd.DataFrame({"계수": gee.params.index, "추정치": gee.params.values, "강건 SE": gee.bse.values,
                         "z": gee.tvalues.values, "p": gee.pvalues.values,
                         "오즈비": np.exp(gee.params.values), "오즈비 95% CI 하한": np.exp(ci[0].values),
                         "오즈비 95% CI 상한": np.exp(ci[1].values)})
    # 손 상태별 보정 효과(단순 효과): 맨손 = cal, 장갑 = cal + cal:glove
    names = list(gee.params.index)
    simple = []
    for label, vec in {"맨손에서 보정 효과 (H4)": {"cal": 1}, "장갑에서 보정 효과 (H1)": {"cal": 1, "cal:glove": 1}}.items():
        L = np.array([[vec.get(nm, 0) for nm in names]])
        tt = gee.t_test(L)
        est, lo, hi = float(tt.effect[0]), *map(float, tt.conf_int()[0])
        simple.append({"효과": label, "로짓 추정치": est, "오즈비": np.exp(est), "오즈비 95% CI 하한": np.exp(lo),
                       "오즈비 95% CI 상한": np.exp(hi), "p": float(tt.pvalue)})
    return {"bayes_fixed": bayes, "bayes_random_sd": re_sd, "gee": gtab, "gee_simple_effects": pd.DataFrame(simple),
            "n_keystrokes": len(df)}


# ---------------------------------------------------------------------------
# 6. 보조 분석: 오프라인 재생(섀도 판정)
# ---------------------------------------------------------------------------
def shadow_comparison(per_condition):
    """같은 터치를 판정만 바꿔 다시 읽었을 때의 이웃 키 오류율 (기본 / 보정 / M0 / M1).

    앱은 모든 터치를 네 가지 판정(기본, 실제 적용된 보정, M0, M1)으로 동시에 계산해 기록했다.
    같은 손가락 움직임에 판정만 바꾼 비교라 '판정 방식 자체의 효과'를 본다.
    단, 참가자는 화면에 보인 판정을 보고 고치며 입력했으므로 보조 증거로만 쓴다(계획서 A8).
    """
    rows = []
    for c in CONDS:
        sub = per_condition[per_condition["cond"] == c]
        b, k = sub["shadow_base_neighbor_error_rate"], sub["shadow_cal_neighbor_error_rate"]
        try:
            p = stats.wilcoxon(k, b).pvalue
        except ValueError:
            p = 1.0
        rows.append({"조건": c, "기본 판정 %": b.mean() * 100, "보정 판정 %": k.mean() * 100,
                     "M0 판정 %": sub["shadow_m0_neighbor_error_rate"].mean() * 100,
                     "M1 판정 %": sub["shadow_m1_neighbor_error_rate"].mean() * 100,
                     "보정이 낮은 사람": f"{int((k < b).sum())}/{len(sub)}", "Wilcoxon p (보정 vs 기본)": p})
    return pd.DataFrame(rows)


# ---------------------------------------------------------------------------
# 7. 순서 효과 확인, 선호
# ---------------------------------------------------------------------------
def order_check(per_condition, col="neighbor_error_rate", scale=100):
    """라틴 방격이 순서 효과(뒤에 할수록 연습돼 유리)를 상쇄했는지 확인한다.

    (1) 진행 위치(1–4번째)별 평균: 위치마다 각 조건이 같은 수로 들어가므로 순수한 위치 효과를 본다.
    (2) 보정 조건을 먼저 한 사람 vs 나중에 한 사람의 보정 효과를 Mann-Whitney U(두 독립 집단의 순위 비교)로 비교.
    주의: 6명 대 6명이라 검정력이 낮다. '순서 효과가 없다'가 아니라 '순서와 관계없이 같은 방향'이라고 보고한다.
    """
    by_pos = per_condition.groupby("position")[col].mean().mul(scale).rename("평균").to_frame()
    W = wide(per_condition, col) * scale
    orders = per_condition.drop_duplicates("participant").set_index("participant")["order"]
    rows = []
    for hand, (base, new) in {"장갑 (B→D)": ("B", "D"), "맨손 (A→C)": ("A", "C")}.items():
        gain = W[new] - W[base]
        first = [p for p in W.index if orders[p].index(new) < orders[p].index(base)]
        later = [p for p in W.index if p not in first]
        rows.append({"손 상태": hand, "보정 먼저 (명)": len(first), "보정 먼저 평균 차이": gain[first].mean(),
                     "기본 먼저 (명)": len(later), "기본 먼저 평균 차이": gain[later].mean(),
                     "Mann-Whitney p": stats.mannwhitneyu(gain[first], gain[later]).pvalue})
    return by_pos, pd.DataFrame(rows)


def preferences(per_condition):
    """손 상태별 X/Y 비교 질문의 선호. 이항 검정: '같음'을 뺀 응답에서 보정을 고른 비율이 50%와 다른가."""
    one = per_condition.drop_duplicates("participant")
    rows = []
    for hand, col in (("장갑", "pref_glove"), ("맨손", "pref_bare")):
        cnt = one[col].value_counts()
        k, m = int(cnt.get("calibrated", 0)), int(cnt.get("calibrated", 0) + cnt.get("baseline", 0))
        rows.append({"손 상태": hand, "보정": k, "기본": int(cnt.get("baseline", 0)), "같음": int(cnt.get("same", 0)),
                     "이항 검정 p": stats.binomtest(k, m).pvalue if m else np.nan})
    return pd.DataFrame(rows)
