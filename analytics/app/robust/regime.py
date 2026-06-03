"""
Market Regime detection.

지원 알고리즘 (method 파라미터):
  - "rule" (default, Free)  : MA200 추세 + 60일 변동성 분위수 컷 → 5분류
  - "hmm"  (Pro)            : Gaussian HMM (hmmlearn) — 학술 표준, sklearn API
                              상태 수 n_states 가변 (3~5), 상태별 평균수익·변동성으로 자동 라벨링

공통 후처리:
  - smoothing (Viterbi-style minimum-run filter): N일 미만 지속 라벨은 직전 라벨로 흡수.
    rule-based의 깜빡임 + HMM의 짧은 outlier state를 동시에 완화.

5분류 라벨:
  - bull_quiet      : 추세 위 + 변동성 정상
  - bull_volatile   : 추세 위 + 변동성 높음 (반등 구간 / 급락 직전 경고)
  - bear            : 추세 아래 + 변동성 정상
  - sideways        : 방향성 없음
  - high_vol_unstable: 변동성 극단 + 하락/횡보

참고 학술 / 오픈 레포:
  - Hamilton (1989) Markov Switching
  - Adams & MacKay (2007) BOCPD
  - hmmlearn (BSD-3, https://github.com/hmmlearn/hmmlearn)
  - statsmodels.tsa.regime_switching.MarkovRegression
"""
from __future__ import annotations
from typing import Dict, Any, Optional
import numpy as np
import pandas as pd

from app.backtest.vbt_engine import BacktestParams, run_backtest

REGIME_LABELS = ["bull_quiet", "bull_volatile", "bear", "sideways", "high_vol_unstable"]

REGIME_LABELS_KO = {
    "bull_quiet": "상승장(안정)",
    "bull_volatile": "상승장(불안정)",
    "bear": "하락장",
    "sideways": "횡보장",
    "high_vol_unstable": "고변동성 불안정장",
}

# Bayesian shrinkage prior for Sharpe credibility weighting.
# 짧은 표본의 극단 Sharpe(예: 10일 하락장에서 -6.25)를 0 쪽으로 끌어당겨
# 표본 크기에 비례하는 통계적 신뢰도를 반영한다.
# SR_eff = SR_obs × T / (T + T0)   (Lo 2002 + James-Stein shrinkage 변형)
# T0=60(약 3개월)이면: 30일 표본 → 가중치 0.33, 252일 → 0.81, 1000일 → 0.94
SHARPE_SHRINKAGE_PRIOR = 60


def shrink_sharpe(sharpe_obs: float, days: int, prior: int = SHARPE_SHRINKAGE_PRIOR) -> tuple[float, float]:
    """Return (effective_sharpe, sample_weight) — weight ∈ (0, 1]."""
    if days <= 0:
        return 0.0, 0.0
    w = days / (days + prior)
    return float(sharpe_obs) * w, w


def classify_regimes(
    close: pd.Series,
    method: str = "rule",
    smoothing: int = 0,
    n_states: int = 4,
) -> pd.Series:
    """
    국면 라벨 시리즈 반환 (close index와 정렬).

    Parameters
    ----------
    method : "rule" | "hmm"
        - "rule": 분위수 컷 기반 5분류 (기본, 빠름, 해석 가능)
        - "hmm" : Gaussian HMM (hmmlearn) — 학술 표준, 부드러운 상태 전이
    smoothing : int
        Viterbi-style minimum-run filter. N일 미만 지속 라벨은 직전 라벨로 흡수.
        0/1이면 비활성. 권장: 5
    n_states : int
        HMM 상태 수 (3~5). rule-based에서는 무시.
    """
    if method == "hmm":
        raw, effective_method = _hmm_regimes(close, n_states=n_states)
    else:
        raw, effective_method = _rule_regimes(close), "rule"

    if smoothing and smoothing > 1:
        raw = _smooth_states(raw, min_run=int(smoothing))
    # 실제로 사용된 방법을 기록한다(HMM 요청이 표본부족/fit실패로 rule 로 폴백되면 "rule").
    raw.attrs["effective_method"] = effective_method
    return raw


def _rule_regimes(close: pd.Series) -> pd.Series:
    """
    분류 규칙 (우선순위 순):
    1. MA200 위 + slope 양 + vol < 75th → bull_quiet
    2. MA200 위 + slope 양 + vol >= 75th → bull_volatile
    3. MA200 아래 + slope 음 + vol < 75th → bear
    4. MA200 아래 + slope 음 + vol >= 75th → high_vol_unstable
    5. 횡보 + vol >= 80th → high_vol_unstable
    6. 나머지 → sideways
    """
    ma200 = close.rolling(200, min_periods=100).mean()
    ma200_smooth = ma200.ewm(span=10, adjust=False).mean()
    slope = ma200_smooth.diff(10)

    ret = close.pct_change()
    vol60 = ret.rolling(60, min_periods=20).std() * np.sqrt(252)

    vol_q75 = vol60.quantile(0.75)
    vol_q80 = vol60.quantile(0.80)
    vol_high_75 = vol60 >= vol_q75
    vol_high_80 = vol60 >= vol_q80

    is_above_ma = close > ma200
    is_bull_trend = is_above_ma & (slope > 0)
    is_bear_trend = ~is_above_ma & (slope < 0)

    regime = pd.Series("sideways", index=close.index, dtype="object")
    regime[is_bull_trend & ~vol_high_75] = "bull_quiet"
    regime[is_bull_trend & vol_high_75] = "bull_volatile"
    regime[is_bear_trend & ~vol_high_75] = "bear"
    regime[is_bear_trend & vol_high_75] = "high_vol_unstable"
    regime[~is_bull_trend & ~is_bear_trend & vol_high_80] = "high_vol_unstable"
    regime[ma200.isna()] = np.nan
    return regime


def _smooth_states(s: pd.Series, min_run: int) -> pd.Series:
    """
    Viterbi-style minimum-run smoothing.
    연속 run length < min_run인 segment를 직전 segment 라벨로 흡수.
    rule-based의 깜빡임 (1~2일 깜빡이는 high_vol → bull) 제거.
    """
    if min_run <= 1:
        return s
    arr = s.values.copy()
    n = len(arr)
    i = 0
    last_valid: Optional[Any] = None
    # 먼저 첫 valid 라벨 찾기
    while i < n and (arr[i] is None or (isinstance(arr[i], float) and np.isnan(arr[i]))):
        i += 1
    if i >= n:
        return s
    last_valid = arr[i]
    while i < n:
        if arr[i] is None or (isinstance(arr[i], float) and np.isnan(arr[i])):
            i += 1
            continue
        j = i
        while j < n and arr[j] == arr[i]:
            j += 1
        run_len = j - i
        if run_len < min_run and last_valid is not None and last_valid != arr[i]:
            arr[i:j] = last_valid
        else:
            last_valid = arr[i]
        i = j
    return pd.Series(arr, index=s.index, dtype="object")


def _hmm_regimes(close: pd.Series, n_states: int = 4) -> pd.Series:
    """
    Gaussian HMM 기반 국면 분류 (Pro 기능).

    Feature engineering:
      - log return
      - rolling vol (20d)
      - rolling momentum (60d)

    학습 후 각 상태의 평균수익·변동성으로 5라벨 자동 매핑:
      - 수익률 양 + vol 정상 → bull_quiet
      - 수익률 양 + vol 높음 → bull_volatile
      - 수익률 음 + vol 정상 → bear
      - 수익률 ≈ 0 → sideways
      - 수익률 음 + vol 높음 → high_vol_unstable

    requires: hmmlearn (BSD-3, https://github.com/hmmlearn/hmmlearn)
    """
    try:
        from hmmlearn.hmm import GaussianHMM
    except ImportError as e:
        raise ImportError(
            "HMM 모드는 hmmlearn 패키지가 필요합니다. EC2에서 "
            "`pip install hmmlearn` 후 서비스 재시작하세요."
        ) from e

    n_states = max(2, min(int(n_states), 6))

    log_close = np.log(close.astype(float))
    ret = log_close.diff()
    vol20 = ret.rolling(20).std()
    mom60 = log_close.diff(60)

    feats = pd.DataFrame({"ret": ret, "vol": vol20, "mom": mom60}).dropna()
    if len(feats) < n_states * 30:
        # 표본 부족 시 rule-based로 폴백 (학습 불안정)
        return _rule_regimes(close), "rule"

    X = feats.values.astype(float)
    mu = X.mean(axis=0)
    sd = X.std(axis=0) + 1e-9
    Xn = (X - mu) / sd

    model = GaussianHMM(
        n_components=n_states,
        covariance_type="full",
        n_iter=200,
        tol=1e-3,
        random_state=42,
    )
    try:
        model.fit(Xn)
    except Exception:
        return _rule_regimes(close), "rule"
    hidden = model.predict(Xn)  # 0..K-1

    # 상태별 평균 수익률 / 평균 변동성
    state_stats = []
    for s in range(n_states):
        mask = hidden == s
        if mask.sum() == 0:
            state_stats.append({"s": s, "ret": 0.0, "vol": 0.0, "n": 0})
            continue
        state_stats.append({
            "s": s,
            "ret": float(feats["ret"].values[mask].mean()),
            "vol": float(feats["vol"].values[mask].mean()),
            "n": int(mask.sum()),
        })

    vols = sorted([x["vol"] for x in state_stats])
    vol_median = vols[len(vols) // 2] if vols else 0.0

    # 수익률 zero-band: 전체 표본 수익률 std의 5%
    zero_band = float(feats["ret"].std()) * 0.05

    label_map = {}
    for x in state_stats:
        is_high_vol = x["vol"] > vol_median
        if abs(x["ret"]) <= zero_band:
            label_map[x["s"]] = "high_vol_unstable" if is_high_vol else "sideways"
        elif x["ret"] > 0:
            label_map[x["s"]] = "bull_volatile" if is_high_vol else "bull_quiet"
        else:
            label_map[x["s"]] = "high_vol_unstable" if is_high_vol else "bear"

    labels = pd.Series([label_map[h] for h in hidden], index=feats.index, dtype="object")
    # close 전체 index로 정렬, 학습 못 한 앞 구간은 NaN
    return labels.reindex(close.index), "hmm"


def per_regime_stats(
    close: pd.Series,
    params: BacktestParams,
    method: str = "rule",
    smoothing: int = 0,
    n_states: int = 4,
    ticker: Optional[str] = None,
    period: Optional[str] = None,
) -> Dict[str, Any]:
    """Run full backtest, then split equity returns by regime label and compute summary per regime."""
    regimes_raw = classify_regimes(close, method=method, smoothing=smoothing, n_states=n_states)
    # HMM 요청이 표본부족/fit실패로 rule 로 폴백됐는지 실제 사용 방법을 가져온다(dropna 전에 읽음).
    effective_method = regimes_raw.attrs.get("effective_method", method)
    regimes = regimes_raw.dropna()
    bt = run_backtest(close, params)

    eq = pd.Series({pd.to_datetime(p["date"]): p["value"] for p in bt["equity_curve"]})
    eq = eq.sort_index()
    eq_ret = eq.pct_change().dropna()
    common = eq_ret.index.intersection(regimes.index)
    eq_ret = eq_ret.loc[common]
    reg = regimes.loc[common]

    out: Dict[str, Any] = {}
    for label in REGIME_LABELS:
        r = eq_ret[reg == label]
        if len(r) < 5:
            out[label] = {"days": int(len(r)), "note": "샘플 부족"}
            continue
        cum = (1 + r).prod() - 1
        ann = (1 + cum) ** (252 / len(r)) - 1 if len(r) > 0 else 0
        sharpe = (r.mean() / r.std() * np.sqrt(252)) if r.std() > 0 else 0
        roll_max = (1 + r).cumprod().cummax()
        dd = ((1 + r).cumprod() / roll_max - 1).min()
        win_rate = float((r > 0).mean() * 100)
        eff_sharpe, sample_w = shrink_sharpe(sharpe, len(r))
        out[label] = {
            "days": int(len(r)),
            "label_ko": REGIME_LABELS_KO.get(label, label),
            "cumulative_return_pct": round(float(cum) * 100, 2),
            "annualized_return_pct": round(float(ann) * 100, 2),
            "sharpe": round(float(sharpe), 2),
            "effective_sharpe": round(float(eff_sharpe), 2),
            "sample_weight": round(float(sample_w), 3),
            "max_drawdown_pct": round(float(dd) * 100, 2),
            "win_rate_pct": round(win_rate, 2),
        }

    # 프론트엔드 호환: bull_quiet + bull_volatile → 합산 "bull" 키
    bull_r = eq_ret[reg.isin(["bull_quiet", "bull_volatile"])]
    if len(bull_r) >= 5:
        cum_b = (1 + bull_r).prod() - 1
        ann_b = (1 + cum_b) ** (252 / len(bull_r)) - 1
        sh_b = (bull_r.mean() / bull_r.std() * np.sqrt(252)) if bull_r.std() > 0 else 0
        roll_max_b = (1 + bull_r).cumprod().cummax()
        dd_b = ((1 + bull_r).cumprod() / roll_max_b - 1).min()
        eff_b, sw_b = shrink_sharpe(sh_b, len(bull_r))
        out["bull"] = {
            "days": int(len(bull_r)),
            "label_ko": "상승장",
            "cumulative_return_pct": round(float(cum_b) * 100, 2),
            "annualized_return_pct": round(float(ann_b) * 100, 2),
            "sharpe": round(float(sh_b), 2),
            "effective_sharpe": round(float(eff_b), 2),
            "sample_weight": round(float(sw_b), 3),
            "max_drawdown_pct": round(float(dd_b) * 100, 2),
            "win_rate_pct": round(float((bull_r > 0).mean() * 100), 2),
        }
    else:
        out["bull"] = {"days": int(len(bull_r)), "note": "샘플 부족"}

    # 취약 regime: effective_sharpe(표본 가중치 적용 후) 기준으로 선정 — bull 합산 키 제외
    valid = {k: v for k, v in out.items()
             if "effective_sharpe" in v and k not in ("bull",)}
    weak = min(valid, key=lambda k: valid[k]["effective_sharpe"]) if valid else None

    # 현재 레짐
    current = regimes.iloc[-1] if not regimes.empty else "sideways"
    current_ko = REGIME_LABELS_KO.get(current, current)

    # 분석 지수/ticker 정보
    analyzed_ticker = ticker.upper() if ticker else "종목"

    # ─────────────── 자세한 자연어 요약 ───────────────
    narrative_parts: list[str] = []
    ticker_str = f"{analyzed_ticker} " if ticker else ""

    narrative_parts.append(
        f"▶ {ticker_str}시장 국면 분석 결과\n\n"
        f"이 분석은 200일 이동평균선(MA200)과 60일 변동성을 기준으로 시장 상황을 5가지 국면으로 "
        f"자동 분류한 결과입니다. "
        f"200일 이동평균선은 지난 200거래일의 평균 주가로, 장기 추세의 방향을 나타냅니다 — "
        f"주가가 이 선 위에 있으면 장기 상승 추세, 아래에 있으면 장기 하락 추세로 판단합니다. "
        f"60일 변동성은 하루하루 주가가 얼마나 크게 흔들리는지를 나타내는 지표로, "
        f"높을수록 시장이 불안정하고 예측하기 어렵다는 것을 의미합니다."
    )

    dist = {k: int((regimes_raw == k).sum()) for k in REGIME_LABELS}
    total_analyzed = sum(dist.values())
    if total_analyzed > 0:
        top_regimes = sorted(dist.items(), key=lambda x: x[1], reverse=True)[:3]
        top_str = "、".join(
            f"{REGIME_LABELS_KO.get(k, k)}({v}일, {v / total_analyzed * 100:.0f}%)"
            for k, v in top_regimes if v > 0
        )
        narrative_parts.append(
            f"\n\n분석 기간 동안 가장 많이 나타난 국면은 {top_str} 순이었습니다. "
            f"이 분포는 이 전략이 실제로 어떤 시장 환경에서 주로 운용되어 왔는지를 보여줍니다."
        )

    if valid:
        items_sorted = sorted(valid.items(), key=lambda kv: kv[1].get("effective_sharpe", 0))
        worst_k, worst_v = items_sorted[0]
        best_k, best_v = items_sorted[-1]
        worst_ko = REGIME_LABELS_KO.get(worst_k, worst_k)
        best_ko = REGIME_LABELS_KO.get(best_k, best_k)

        regime_descs = {
            "bull_quiet": "주가가 장기 상승 추세에 있으면서 변동성도 낮은 가장 이상적인 투자 환경",
            "bull_volatile": "주가는 상승 중이지만 일일 등락이 커서 급락 위험도 공존하는 불안정한 상승 구간",
            "bear": "주가가 장기 하락 추세에 있어 매수 포지션에 불리한 환경",
            "sideways": "뚜렷한 방향 없이 횡보하며 추세 추종 전략의 신호 오류(휩쏘)가 많아지는 구간",
            "high_vol_unstable": "변동성이 극단적으로 높고 하락 위험이 매우 큰 시장 불안정 구간",
        }

        narrative_parts.append(
            f"\n\n이 전략의 국면별 성과를 살펴보면, {best_ko} 구간에서 "
            f"Sharpe {best_v.get('sharpe', 0):.2f}, 누적 수익 {best_v.get('cumulative_return_pct', 0):.1f}%"
            f"로 가장 좋은 성과를 기록했습니다. "
            f"{best_ko}란 {regime_descs.get(best_k, best_ko)}을(를) 뜻하며, "
            f"이 전략이 그 환경에 특히 잘 맞음을 시사합니다."
        )
        narrative_parts.append(
            f"\n반면 {worst_ko} 구간에서는 Sharpe {worst_v.get('sharpe', 0):.2f}, "
            f"MDD {worst_v.get('max_drawdown_pct', 0):.1f}%로 가장 약한 성과를 보였습니다. "
            f"{worst_ko}란 {regime_descs.get(worst_k, worst_ko)}입니다. "
            f"이 구간에서는 포지션 규모를 줄이거나 손절 기준을 강화하는 것이 도움이 됩니다."
        )

    advice_map = {
        "bull_quiet": (
            "현재는 전략 운용에 가장 유리한 환경입니다. 장기 상승 추세가 안정적으로 유지되고 있어 "
            "전략의 신호에 적극적으로 따를 수 있는 시기입니다. 단, 언제든 국면이 바뀔 수 있으므로 "
            "손절 기준은 항상 유지하세요."
        ),
        "bull_volatile": (
            "상승 추세이지만 변동성이 높아 주의가 필요합니다. "
            "갑작스러운 급락이 올 수 있으므로 손절 기준을 명확히 하고, 레버리지 사용은 자제하세요. "
            "수익이 나고 있더라도 익절 기준을 낮추어 이익을 먼저 확보하는 전략이 유효합니다."
        ),
        "bear": (
            "현재 시장은 장기 하락 추세입니다. 매수 전략의 경우 손실이 확대될 수 있으므로, "
            "포지션 규모를 대폭 줄이거나 현금 비중을 늘리는 것을 고려하세요. "
            "하락장에서도 수익을 낼 수 있는 인버스 ETF나 현금 보유 비중 확대 전략을 병행할 수 있습니다."
        ),
        "sideways": (
            "뚜렷한 방향이 없는 횡보 구간입니다. 추세 추종 전략의 경우 잦은 매매 신호(휩쏘)로 "
            "거래 비용이 과도하게 발생할 수 있습니다. "
            "명확한 추세가 형성될 때까지 관망하거나, 거래 빈도를 줄이는 전략이 비용을 아낄 수 있습니다."
        ),
        "high_vol_unstable": (
            "시장이 극도로 불안정한 상태입니다. 하루에도 수 퍼센트의 급등락이 반복될 수 있습니다. "
            "레버리지를 즉시 줄이고, 안전 자산(채권, 현금 등)으로 일시 이동하는 것을 강력히 권장합니다. "
            "이 구간에서의 매수는 단기적으로 큰 손실로 이어질 위험이 높습니다."
        ),
    }
    advice = advice_map.get(current, "현재 시장 상황을 면밀히 모니터링하세요.")
    narrative_parts.append(
        f"\n\n💡 현재 국면 ({current_ko}) — {advice}"
    )

    narrative = "".join(narrative_parts)

    # ─────────────── 레짐 타임라인 (주간 샘플링) ───────────────
    regime_timeline = []
    try:
        close_aligned = close.reindex(regimes_raw.index)
        step = max(1, len(regimes_raw) // 500)
        for dt, regime_val in regimes_raw.iloc[::step].items():
            close_val = close_aligned.get(dt) if hasattr(close_aligned, 'get') else None
            if close_val is None and dt in close_aligned.index:
                close_val = close_aligned.loc[dt]
            if regime_val is not None and not (isinstance(regime_val, float) and np.isnan(regime_val)):
                regime_timeline.append({
                    "date": str(dt.date()) if hasattr(dt, 'date') else str(dt)[:10],
                    "regime": str(regime_val),
                    "close": round(float(close_val), 4) if close_val is not None and not np.isnan(float(close_val)) else None,
                })
    except Exception:
        regime_timeline = []

    return {
        "per_regime": out,
        "weak_regime": weak,
        "weakest_regime": weak,
        "current_regime": current,
        "current_regime_ko": current_ko,
        "headline": narrative,
        "narrative": narrative,
        "method": effective_method,                  # 실제 사용된 방법(폴백 반영)
        "method_requested": method,                  # 요청된 방법
        "hmm_fallback": bool(method == "hmm" and effective_method != "hmm"),
        "smoothing": int(smoothing or 0),
        "n_states": int(n_states),
        "regime_distribution": {k: int((reg == k).sum()) for k in REGIME_LABELS},
        "ticker": analyzed_ticker,
        "period": period or "",
        "regime_timeline": regime_timeline,
        "analysis_basis": "MA200 (200일 이동평균) + Vol60 (60일 실현 변동성)",
    }
