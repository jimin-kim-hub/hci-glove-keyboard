"""plots.py — 발표·보고서용 그래프 세 가지

fig1 상호작용 그래프 : x축 맨손/장갑, 선 두 개(기본/보정), 점 = 평균, 막대 = 95% 신뢰구간.
                       두 선이 장갑 쪽에서 벌어지면 '보정의 이득이 장갑에서 더 크다'(H2).
fig2 참가자별 변화   : 한 선 = 한 사람. 파랑 = 보정에서 감소, 빨강 = 증가. 검은 굵은 선 = 평균.
                       평균만 보면 가려지는 개인차(모두 같은 방향인지, 예외가 있는지)를 보여 준다.
fig3 차이와 신뢰구간 : 점 = 평균 차이(보정 − 기본), 막대 = 95% 신뢰구간, 점선 = 차이 0.
                       막대가 점선에 걸리지 않으면 실제 차이가 있다고 볼 수 있고, 위치가 '차이의 크기'다.
"""
import numpy as np
from scipy import stats

import matplotlib.pyplot as plt
from matplotlib import font_manager

from stats import wide

BASE_C, CAL_C, UP_C = "#8a919c", "#1b64da", "#d9534f"  # 기본 = 회색, 보정 = 파랑, 증가 = 빨강


def use_korean_font():
    """그래프 한글 글꼴. macOS 기본 글꼴을 쓰고, 없으면 윈도우의 맑은 고딕을 시도한다."""
    for f in ("/System/Library/Fonts/AppleSDGothicNeo.ttc", "C:/Windows/Fonts/malgun.ttf"):
        try:
            font_manager.fontManager.addfont(f)
            plt.rcParams["font.family"] = font_manager.FontProperties(fname=f).get_name()
            break
        except Exception:
            continue
    plt.rcParams.update({"axes.unicode_minus": False, "font.size": 10,
                         "axes.spines.top": False, "axes.spines.right": False})


def _ci(x):
    """95% 신뢰구간의 반폭 = t임계값 × 표준오차."""
    return stats.t.ppf(0.975, len(x) - 1) * np.std(x, ddof=1) / np.sqrt(len(x))


def interaction(per_condition, metrics):
    """fig1. metrics: [(열 이름, 그래프 제목, 배율), ...]"""
    fig, axes = plt.subplots(1, len(metrics), figsize=(3.3 * len(metrics), 3.4))
    for ax, (col, title, scale) in zip(np.atleast_1d(axes), metrics):
        W = wide(per_condition, col) * scale
        for (bare, glove), name, color, dx in ((("A", "B"), "기본 (Y)", BASE_C, -0.04), (("C", "D"), "보정 (X)", CAL_C, 0.04)):
            ax.errorbar([0 + dx, 1 + dx], [W[bare].mean(), W[glove].mean()], yerr=[_ci(W[bare]), _ci(W[glove])],
                        marker="o", color=color, capsize=4, lw=2, label=name)
        ax.set_xticks([0, 1], ["맨손", "장갑"])
        ax.set_xlim(-0.4, 1.4)
        ax.set_title(title)
    np.atleast_1d(axes)[0].legend(frameon=False)
    fig.suptitle(f"조건별 평균과 95% 신뢰구간 (n = {per_condition['participant'].nunique()})", y=1.02)
    fig.tight_layout()
    return fig


def participants(per_condition, col="neighbor_error_rate", scale=100, ylabel="이웃 키 오류율 (%)"):
    """fig2."""
    W = wide(per_condition, col) * scale
    fig, axes = plt.subplots(1, 2, figsize=(8, 3.6), sharey=True)
    for ax, (base, new, title) in zip(axes, (("A", "C", "맨손: 기본(A) → 보정(C)"), ("B", "D", "장갑: 기본(B) → 보정(D)"))):
        for p in W.index:
            ax.plot([0, 1], [W.loc[p, base], W.loc[p, new]], color=UP_C if W.loc[p, new] > W.loc[p, base] else CAL_C,
                    alpha=0.6, marker="o", ms=4)
        ax.plot([0, 1], [W[base].mean(), W[new].mean()], color="black", lw=3, marker="s", label="평균")
        ax.set_xticks([0, 1], ["기본", "보정"])
        ax.set_xlim(-0.3, 1.3)
        ax.set_title(title)
    axes[0].set_ylabel(ylabel)
    axes[0].legend(frameon=False)
    fig.suptitle("참가자별 변화 (파랑 = 감소, 빨강 = 증가)", y=1.02)
    fig.tight_layout()
    return fig


def differences(comparisons):
    """fig3. comparisons: {그래프 제목: planned_comparisons() 결과 표}"""
    fig, axes = plt.subplots(1, len(comparisons), figsize=(3.3 * len(comparisons), 2.6))
    for ax, (title, tab) in zip(np.atleast_1d(axes), comparisons.items()):
        for y, row in zip((1, 0), tab.itertuples()):  # 첫 행 = H1 장갑, 둘째 행 = H4 맨손
            m, lo, hi = row[4], row[5], row[6]       # 평균 차이, CI 하한, CI 상한
            ax.errorbar(m, y, xerr=[[m - lo], [hi - m]], fmt="o", color=CAL_C if y else BASE_C, capsize=4, lw=2)
        ax.axvline(0, color="black", lw=0.8, ls="--")
        ax.set_yticks([0, 1], ["맨손 A→C", "장갑 B→D"])
        ax.set_ylim(-0.6, 1.6)
        ax.set_title(title)
    fig.suptitle("보정 - 기본 평균 차이와 95% 신뢰구간 (점선 = 차이 없음)", y=1.04)
    fig.tight_layout()
    return fig
