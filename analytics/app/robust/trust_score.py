"""
Trust Score (0~100) — Alpha-Helix's signature signal.

Composite of 5 sub-scores + overfitting penalty:
  - Generalization (out-of-sample consistency from walk-forward)
  - Regime Robustness (worst-regime Sharpe vs best-regime Sharpe)
  - Parameter Stability (variance under small param perturbations)
  - Risk Control (max drawdown vs target — leverage-aware)
  - Statistical Confidence (PSR, Bailey & López de Prado 2012)
  - Overfitting Penalty (in-sample vs out-of-sample gap)

이론적 근거:
  - PSR (Probabilistic Sharpe Ratio): Bailey & López de Prado, "The Sharpe
    Ratio Efficient Frontier" (J. Risk, 2012). Walk-forward 폴드 수 부족 시에도
    일별 수익률 분포의 skewness/kurtosis를 보정하여 신뢰도 산출.
  - Sharpe Ratio 표본분포: Lo, "The Statistics of Sharpe Ratios" (FAJ, 2002).
  - Leverage-aware MDD: 3배 레버리지 ETF (TQQQ/SOXL 등)는 기초자산 대비 ~3배
    변동성을 가지므로 동일 MDD 임계값 적용은 부당함.

사용자 조정 영역 (Analyst Mode):
  - `weights`: 각 sub-score 가중치 (자동 정규화)
  - `overfit_penalty_max`: 과적합 패널티 상한(절댓값)
  - `wf_train` / `wf_test`: walk-forward 윈도우(영업일)
  - `mdd_target_pct`: 리스크 통제 목표 MDD(%) — None 시 자산별 자동
  - `asset_class` / `leverage`: 자동 분류 override
"""
from __future__ import annotations
from math import erf, sqrt
from typing import Dict, Any, Optional, Tuple
import numpy as np
import pandas as pd

from app.backtest.vbt_engine import BacktestParams, run_backtest
from app.robust.walkforward import walk_forward
from app.robust.regime import per_regime_stats


DEFAULT_WEIGHTS: Dict[str, float] = {
    "generalization": 0.25,
    "regime_robustness": 0.20,
    "parameter_stability": 0.15,
    "risk_control": 0.20,
    "statistical_confidence": 0.20,
}

# ─────────────────────────────────────────────────────────────────────────────
# 자산 분류 — leverage 기반 MDD 임계값 / risk 평가 차별화
#   3x: 일변동성이 기초자산의 ~3배 (실제로는 추적오차로 더 큼)
#   2x: ~2배
#   index_etf: 단일자산 변동성
#   single_stock: 개별주식 (더 변동성 큼, 보수적 처리)
# ─────────────────────────────────────────────────────────────────────────────
LEVERAGED_3X = {
    "TQQQ", "SQQQ", "SOXL", "SOXS", "UPRO", "SPXU", "SPXL", "SPXS",
    "UDOW", "SDOW", "TNA", "TZA", "FAS", "FAZ", "TECL", "TECS",
    "CURE", "DPST", "LABU", "LABD", "ERX", "ERY", "GUSH", "DRIP",
    "JNUG", "JDST", "NUGT", "DUST", "YINN", "YANG", "BOIL", "KOLD",
    "DRN", "DRV", "TMF", "TMV", "WEBL", "WEBS", "BNKU", "BNKD",
}
LEVERAGED_2X = {
    "SSO", "SDS", "QLD", "QID", "DDM", "DXD", "MVV", "MZZ",
    "ROM", "REW", "SAA", "SDD", "UWM", "TWM", "UXI", "SIJ",
    "EET", "EEV", "EFO", "EFU", "EZJ", "EZM",
}
INDEX_ETF = {
    "SPY", "QQQ", "IWM", "DIA", "VOO", "VTI", "IVV", "EFA", "EEM",
    "GLD", "SLV", "TLT", "IEF", "AGG", "LQD", "HYG",
    "XLF", "XLK", "XLE", "XLV", "XLY", "XLI", "XLP", "XLU", "XLB", "XLRE",
    "SCHX", "SCHB", "SCHF", "VEA", "VWO", "BND",
}

# 3배 → 기초자산 매핑 (regime 신호용)
UNDERLYING_MAP = {
    "TQQQ": "QQQ", "SQQQ": "QQQ", "QLD": "QQQ", "QID": "QQQ",
    "UPRO": "SPY", "SPXU": "SPY", "SPXL": "SPY", "SPXS": "SPY",
    "SSO": "SPY", "SDS": "SPY",
    "UDOW": "DIA", "SDOW": "DIA", "DDM": "DIA", "DXD": "DIA",
    "TNA": "IWM", "TZA": "IWM", "UWM": "IWM", "TWM": "IWM",
    "SOXL": "SMH", "SOXS": "SMH",
    "TMF": "TLT", "TMV": "TLT",
}


def classify_asset(ticker: Optional[str]) -> Tuple[str, int, Optional[str]]:
    """
    Returns (asset_class, leverage_multiplier, underlying_ticker).
    underlying_ticker: regime 분석에 사용할 기초자산 (없으면 None).
    """
    t = (ticker or "").upper().strip()
    if not t:
        return ("unknown", 1, None)
    if t in LEVERAGED_3X:
        return ("etf_leveraged_3x", 3, UNDERLYING_MAP.get(t))
    if t in LEVERAGED_2X:
        return ("etf_leveraged_2x", 2, UNDERLYING_MAP.get(t))
    if t in INDEX_ETF:
        return ("etf_index", 1, None)
    return ("single_stock", 1, None)


def _norm_cdf(z: float) -> float:
    """표준정규 CDF — scipy 의존 회피용."""
    return 0.5 * (1.0 + erf(z / sqrt(2.0)))


def probabilistic_sharpe_ratio(daily_returns: pd.Series,
                                sr_threshold_annual: float = 0.0) -> Tuple[float, Dict[str, float]]:
    """
    PSR(SR*) = P(true SR > SR*) — Bailey & López de Prado (2012)

    PSR = Φ( (SR_obs - SR*) · √(T-1) / √(1 - γ₃·SR_obs + (γ₄-1)/4 · SR_obs²) )

    여기서 SR_obs / SR* 는 동일 시간단위(일별), γ₃=skew, γ₄=kurtosis.
    """
    r = daily_returns.dropna().astype(float)
    T = len(r)
    diag = {"T": T, "sr_daily": 0.0, "sr_annual": 0.0, "skew": 0.0, "kurt": 0.0}
    if T < 30 or r.std(ddof=1) == 0:
        return 0.0, diag

    sr_daily = float(r.mean() / r.std(ddof=1))
    sr_annual = sr_daily * np.sqrt(252)
    skew = float(r.skew()) if T >= 3 else 0.0
    # pandas .kurtosis() 는 Fisher (excess) — Bailey 공식의 γ₄는 정규 kurtosis 이므로 +3
    kurt = float(r.kurtosis()) + 3.0 if T >= 4 else 3.0

    sr_star_daily = sr_threshold_annual / np.sqrt(252)
    denom_sq = 1.0 - skew * sr_daily + ((kurt - 1.0) / 4.0) * (sr_daily ** 2)
    if denom_sq <= 0 or not np.isfinite(denom_sq):
        return 0.0, diag

    z = (sr_daily - sr_star_daily) * np.sqrt(max(1, T - 1)) / np.sqrt(denom_sq)
    psr = _norm_cdf(z)
    diag.update({"sr_daily": sr_daily, "sr_annual": sr_annual, "skew": skew, "kurt": kurt})
    return float(psr), diag


def _clip01(x: float) -> float:
    return float(max(0.0, min(1.0, x)))


def _normalize_weights(w: Dict[str, float]) -> Dict[str, float]:
    """가중치 dict을 받아 누락 키는 기본값으로 채우고 합 1.0으로 정규화."""
    merged = {k: float(w.get(k, DEFAULT_WEIGHTS[k])) for k in DEFAULT_WEIGHTS}
    s = sum(max(0.0, v) for v in merged.values())
    if s <= 0:
        return dict(DEFAULT_WEIGHTS)
    return {k: max(0.0, v) / s for k, v in merged.items()}


# 자산별 기본 MDD 목표 (사용자가 mdd_target_pct 미지정 시 적용)
DEFAULT_MDD_BY_CLASS = {
    "etf_index": 25.0,
    "etf_leveraged_2x": 50.0,
    "etf_leveraged_3x": 75.0,
    "single_stock": 35.0,
    "unknown": 30.0,
}


def compute_trust_score(close: pd.Series, params: BacktestParams,
                        mdd_target_pct: Optional[float] = None,
                        weights: Optional[Dict[str, float]] = None,
                        overfit_penalty_max: int = 15,
                        wf_train: int = 504,
                        wf_test: int = 63,
                        ticker: Optional[str] = None,
                        asset_class: str = "auto",
                        leverage: Optional[int] = None) -> Dict[str, Any]:
    weights = _normalize_weights(weights or DEFAULT_WEIGHTS)
    overfit_penalty_max = max(0, int(overfit_penalty_max))

    # ── 자산 분류 (auto → ticker 기반) ───────────────────────────────────────
    if asset_class == "auto":
        ac, lev_auto, underlying = classify_asset(ticker)
    else:
        ac = asset_class
        lev_auto = leverage or 1
        underlying = UNDERLYING_MAP.get((ticker or "").upper().strip())
    eff_leverage = int(leverage) if leverage else lev_auto
    # mdd_target 미지정 시 자산별 기본값
    if mdd_target_pct is None:
        mdd_target_pct = DEFAULT_MDD_BY_CLASS.get(ac, 30.0)
    mdd_target_pct = float(mdd_target_pct)

    reasons: Dict[str, str] = {}

    # 1) full in-sample
    is_bt = run_backtest(close, params)
    is_sharpe = is_bt["stats"].get("sharpe", 0) or 0
    is_total = is_bt["stats"].get("total_return_pct", 0) or 0
    is_mdd = is_bt["stats"].get("max_drawdown_pct", 0) or 0  # negative %

    # 2) walk-forward
    wf = walk_forward(close, params, train_window=wf_train, test_window=wf_test)
    all_folds = wf.get("folds", [])
    valid_folds = [f for f in all_folds if "stats" in f and f["stats"].get("sharpe") is not None]
    n_folds = len(valid_folds)
    n_total_folds = len(all_folds)
    if valid_folds:
        oos_sharpes = [f["stats"]["sharpe"] for f in valid_folds]
        oos_returns = [f["stats"]["total_return_pct"] for f in valid_folds]
        oos_sharpe_mean = float(np.mean(oos_sharpes))
        oos_sharpe_std = float(np.std(oos_sharpes))
        if len(oos_returns) >= 3 and np.std(oos_returns) > 0:
            tstat = float(np.mean(oos_returns) / (np.std(oos_returns) / np.sqrt(len(oos_returns))))
        else:
            tstat = 0.0
    else:
        oos_sharpe_mean = oos_sharpe_std = tstat = 0.0

    # 3) regime — 표본 가중치(Bayesian shrinkage) 적용된 effective_sharpe 사용
    # 근거: 짧은 표본의 Sharpe는 표준오차가 커서 극단값이 나올 가능성 높음.
    # SR_eff = SR × T/(T+60) 으로 0 쪽으로 끌어당겨 신뢰도를 반영 (Lo 2002 + James-Stein 변형).
    regime = per_regime_stats(close, params)
    regime_per = regime.get("per_regime", {}) if isinstance(regime, dict) else {}

    # 모든 유효 국면(eff_sharpe 있는) 사용 — 표본 작은 국면도 포함하되 자연스레 가중치로 완화됨
    valid_regimes = {k: v for k, v in regime_per.items()
                     if isinstance(v, dict) and "effective_sharpe" in v}
    insufficient_regimes = [k for k, v in regime_per.items()
                             if isinstance(v, dict) and "effective_sharpe" not in v]

    if len(valid_regimes) >= 2:
        items = sorted(valid_regimes.items(), key=lambda kv: kv[1]["effective_sharpe"])
        worst_k, worst_v = items[0]
        best_k, best_v = items[-1]
        worst = worst_v["effective_sharpe"]
        best = best_v["effective_sharpe"]
        regime_robust = _clip01((worst + 1) / 3.0)

        skipped = f" · 제외: {', '.join(insufficient_regimes)}" if insufficient_regimes else ""
        reasons["regime_robustness"] = (
            f"최악 {worst_k} 보정 Sharpe={worst:+.2f} "
            f"(원본 {worst_v['sharpe']:+.2f} × 표본가중치 {worst_v['sample_weight']:.2f}, {worst_v['days']}일) · "
            f"최고 {best_k} 보정 Sharpe={best:+.2f}{skipped} · "
            f"Bayesian shrinkage SR×T/(T+60) 적용 — 짧은 표본 극단값 완화"
        )
    elif len(valid_regimes) == 1:
        only_k, only_v = next(iter(valid_regimes.items()))
        worst = best = only_v["effective_sharpe"]
        regime_robust = 0.5
        reasons["regime_robustness"] = (
            f"평가 가능한 국면이 {only_k} 1개뿐 · 견고성 평가 불가, 기본 50점. "
            f"분석 기간을 늘리세요(10y 이상 권장)."
        )
    else:
        worst = best = 0
        regime_robust = 0.5
        reasons["regime_robustness"] = (
            "유효 국면 데이터 없음. 기본 50점 적용. 분석 기간을 늘리세요."
        )

    # 4) parameter stability — 전략별 핵심 파라미터 섭동 ±5%/±10%
    # ⚠️ 반드시 "그 전략이 실제로 읽는" 파라미터를 흔들어야 한다. 전략이 무시하는 파라미터를
    #    섭동하면 백테스트 결과가 불변 → 표준편차 0 → parameter_stability 가 항상 100점으로
    #    부풀려진다(예: 과거 momentum_12_1 에 sma_slow 섭동 → 무효).
    perturb_sharpes = []
    deltas = [-0.10, -0.05, 0.05, 0.10]

    def _perturb(delta: float) -> BacktestParams:
        # 기준 파라미터를 그대로 복제(수수료·자본·momentum·vix 등 사용자 값 보존)한 뒤
        # 전략별 핵심 파라미터만 한 개 흔든다.
        kw = dict(
            strategy=params.strategy,
            sma_fast=params.sma_fast, sma_slow=params.sma_slow,
            rsi_period=params.rsi_period, rsi_low=params.rsi_low, rsi_high=params.rsi_high,
            macd_fast=params.macd_fast, macd_slow=params.macd_slow, macd_signal=params.macd_signal,
            momentum_long_days=params.momentum_long_days,
            momentum_short_days=params.momentum_short_days,
            vix_threshold=params.vix_threshold,
            initial_capital=params.initial_capital,
            fees=params.fees, slippage=params.slippage,
        )
        s = params.strategy
        if s == "sma_cross":
            kw["sma_slow"] = max(5, int(params.sma_slow * (1 + delta)))
        elif s == "momentum_12_1":
            kw["momentum_long_days"] = max(60, int(params.momentum_long_days * (1 + delta)))
        elif s == "rsi_meanrev":
            kw["rsi_period"] = max(3, int(params.rsi_period * (1 + delta)))
        elif s == "macd":
            kw["macd_slow"] = max(params.macd_fast + 2, int(params.macd_slow * (1 + delta)))
        elif s == "vix_risk_off":
            kw["vix_threshold"] = max(10.0, params.vix_threshold * (1 + delta))
        else:  # 폴백: sma_slow
            kw["sma_slow"] = max(5, int(params.sma_slow * (1 + delta)))
        return BacktestParams(**kw)

    if params.strategy == "buy_and_hold":
        # 파라미터가 없는 전략 — 섭동 대상이 없어 안정성 평가가 무의미하다.
        # 거짓 "100점 안정"으로 점수를 부풀리지 않도록 중립(50점) 처리.
        param_stability = 0.5
        reasons["parameter_stability"] = (
            "파라미터 없는 전략(buy_and_hold) — 섭동 대상 없음, 안정성 평가 불가(중립 50점)."
        )
    else:
        for delta in deltas:
            try:
                r = run_backtest(close, _perturb(delta))
                perturb_sharpes.append(r["stats"].get("sharpe", 0) or 0)
            except Exception:
                pass
        if perturb_sharpes:
            param_var = float(np.std(perturb_sharpes))
            param_stability = _clip01(1.0 - param_var)
            reasons["parameter_stability"] = (
                f"±5/10% 섭동 4회 Sharpe 표준편차={param_var:.3f}"
            )
        else:
            param_stability = 0.5
            reasons["parameter_stability"] = "섭동 백테스트 실패. 기본값 50점."

    # 5) risk control — actual MDD vs target (leverage-aware target)
    risk_control = _clip01(1.0 - max(0, abs(is_mdd) - mdd_target_pct) / 50.0)
    lev_note = f" · {eff_leverage}x 레버리지 인지" if eff_leverage > 1 else ""
    reasons["risk_control"] = (
        f"실제 MDD={abs(is_mdd):.1f}% vs 목표 {mdd_target_pct:.0f}% "
        f"({'목표 이내' if abs(is_mdd) <= mdd_target_pct else '목표 초과'}){lev_note}"
    )

    # 6) generalization — OOS sharpe / IS sharpe ratio
    if n_folds == 0:
        # walk-forward 폴드가 0개 → 신호 부족 (test_window가 너무 짧거나 전략 신호 빈도가 낮음)
        generalization = 0.5
        diag = (f"WF 폴드 생성 {n_total_folds}개 중 유효 0개 — "
                f"전략 신호 빈도가 낮아 {wf_test}일 OOS에서 거래가 발생하지 않음. "
                f"wf_test를 늘리거나 더 활발한 전략을 사용하세요.")
        reasons["generalization"] = diag
    elif is_sharpe > 0.1:
        gen_ratio = oos_sharpe_mean / is_sharpe
        generalization = _clip01((gen_ratio + 0.5) / 2.0)
        reasons["generalization"] = (
            f"IS Sharpe={is_sharpe:.2f}, OOS 평균={oos_sharpe_mean:.2f} "
            f"({n_folds}/{n_total_folds}폴드 유효), 비율={gen_ratio:.2f}"
        )
    else:
        generalization = _clip01((oos_sharpe_mean + 1) / 3.0)
        reasons["generalization"] = (
            f"IS Sharpe({is_sharpe:.2f})가 너무 낮아 OOS 절대값 기준 평가 "
            f"({n_folds}/{n_total_folds}폴드 유효)"
        )

    # 7) statistical confidence — PSR (Probabilistic Sharpe Ratio)
    # Bailey & López de Prado (2012): walk-forward 폴드 수에 의존하지 않고
    # 일별 수익률 분포의 skew/kurt를 보정해 "true SR > 0" 확률을 계산.
    try:
        eq_pts = is_bt.get("equity_curve", []) or []
        eq_series = pd.Series(
            {pd.to_datetime(p["date"]): float(p["value"]) for p in eq_pts}
        ).sort_index()
        daily_ret = eq_series.pct_change().dropna()
        psr_zero, psr_diag = probabilistic_sharpe_ratio(daily_ret, sr_threshold_annual=0.0)
    except Exception as e:
        psr_zero = 0.0
        psr_diag = {"T": 0, "sr_annual": 0.0, "skew": 0.0, "kurt": 0.0}

    statistical_confidence = _clip01(psr_zero)
    T = int(psr_diag.get("T", 0))
    if T < 252:
        reasons["statistical_confidence"] = (
            f"PSR(SR>0)={psr_zero*100:.0f}% · 데이터 {T}일 "
            f"(1년 미만 — 신뢰도 제한, Bailey & López de Prado 2012)"
        )
    else:
        reasons["statistical_confidence"] = (
            f"PSR(SR>0)={psr_zero*100:.0f}% · 연환산 Sharpe={psr_diag['sr_annual']:.2f}, "
            f"skew={psr_diag['skew']:.2f}, kurt={psr_diag['kurt']:.1f} "
            f"({T}일 일별수익률 · Bailey & López de Prado 2012)"
        )

    # 8) overfitting penalty — IS sharpe much higher than OOS
    if is_sharpe > 0.1 and oos_sharpe_mean is not None:
        gap = max(0, is_sharpe - oos_sharpe_mean)
        overfit_penalty_pts = -min(overfit_penalty_max, int(gap * overfit_penalty_max))
    else:
        overfit_penalty_pts = 0

    # 가중 합산 (각 0~100)
    sub = {
        "generalization": int(round(generalization * 100)),
        "regime_robustness": int(round(regime_robust * 100)),
        "parameter_stability": int(round(param_stability * 100)),
        "risk_control": int(round(risk_control * 100)),
        "statistical_confidence": int(round(statistical_confidence * 100)),
    }
    base_raw = sum(sub[k] * weights[k] for k in sub)
    base = int(round(base_raw))
    score = max(0, min(100, base + overfit_penalty_pts))

    # 자연어 요약 (상세)
    weakest_metric = min(sub, key=sub.get)
    strongest_metric = max(sub, key=sub.get)
    metric_ko = {
        "generalization": "Out-of-Sample 일반화",
        "regime_robustness": "시장국면 견고성",
        "parameter_stability": "파라미터 안정성",
        "risk_control": "리스크 통제",
        "statistical_confidence": "통계적 유의성",
    }
    metric_desc = {
        "generalization": (
            "전략이 학습에 사용하지 않은 미래 구간에서도 일관된 성과를 내는지를 측정합니다. "
            "높을수록 과거에만 맞춰진 전략이 아닌, 실제 미래에도 작동할 가능성이 높습니다."
        ),
        "regime_robustness": (
            "상승장·하락장·횡보장·고변동성 등 다양한 시장 환경에서 얼마나 균일하게 성과를 내는지를 평가합니다. "
            "높을수록 특정 시장 환경에 의존하지 않는 범용적인 전략임을 의미합니다."
        ),
        "parameter_stability": (
            "전략의 핵심 파라미터(예: 이동평균 기간, RSI 임계값)를 조금 바꾸었을 때 결과가 얼마나 일관되는지를 봅니다. "
            "높을수록 특정 수치에 과최적화된 전략이 아님을 뜻합니다."
        ),
        "risk_control": (
            "전략이 최대 손실(MDD)을 목표 범위 내에서 통제하는지를 평가합니다. "
            "높을수록 큰 손실 없이 안정적으로 운용되었음을 나타냅니다."
        ),
        "statistical_confidence": (
            "전략의 수익이 단순한 우연이 아닌 통계적으로 유의미한 결과인지를 PSR(확률적 Sharpe Ratio) 기법으로 검증합니다. "
            "높을수록 수익이 실력에서 비롯될 가능성이 높습니다."
        ),
    }

    grade = "우수" if score >= 75 else "양호" if score >= 60 else "보통" if score >= 45 else "주의"
    narrative = (
        f"이 전략의 Trust Score는 {score}점({grade})입니다.\n\n"
        f"Trust Score는 0~100점으로, 전략이 실제 시장에서 얼마나 신뢰할 수 있는지를 "
        f"5가지 관점에서 종합 평가한 점수입니다. "
        f"단순히 과거 수익률만 보는 것이 아니라, 미래에도 이 성과가 반복될 가능성을 측정합니다.\n\n"
        f"▶ 강점: {metric_ko[strongest_metric]} ({sub[strongest_metric]}점)\n"
        f"{metric_desc.get(strongest_metric, '')}\n"
        f"근거: {reasons.get(strongest_metric, '데이터 없음')}\n\n"
        f"▶ 보완 필요: {metric_ko[weakest_metric]} ({sub[weakest_metric]}점)\n"
        f"{metric_desc.get(weakest_metric, '')}\n"
        f"근거: {reasons.get(weakest_metric, '데이터 없음')}\n\n"
        f"세부 점수: "
        f"일반화 {sub['generalization']}점 · "
        f"국면견고성 {sub['regime_robustness']}점 · "
        f"파라미터안정성 {sub['parameter_stability']}점 · "
        f"리스크통제 {sub['risk_control']}점 · "
        f"통계유의성 {sub['statistical_confidence']}점"
    )
    if overfit_penalty_pts < 0:
        narrative += (
            f"\n\n⚠️ 과적합 주의: In-Sample 성과와 Out-of-Sample 성과 간에 큰 격차 "
            f"(패널티 {overfit_penalty_pts}점)가 감지되었습니다. "
            f"이 전략이 과거 데이터에 지나치게 맞춰져 있을 수 있으며, "
            f"실제 운용 시 백테스트보다 낮은 성과가 나올 가능성이 있으니 주의하세요."
        )

    return {
        "trust_score": int(score),
        "sub_scores": sub,
        "sub_reasons": {k: reasons.get(k, "") for k in sub},
        "weights": {k: round(weights[k], 4) for k in sub},
        "base_score": base,
        "overfitting_penalty": int(overfit_penalty_pts),
        "overfit_penalty_max": overfit_penalty_max,
        "narrative": narrative,
        "config": {
            "mdd_target_pct": mdd_target_pct,
            "wf_train": wf_train,
            "wf_test": wf_test,
            "n_folds": n_folds,
            "n_folds_total": n_total_folds,
            "data_points": int(len(close)),
            "asset_class": ac,
            "leverage": eff_leverage,
            "underlying": underlying,
            "ticker": (ticker or "").upper() or None,
        },
        "details": {
            "in_sample_sharpe": round(float(is_sharpe), 2),
            "in_sample_total_return_pct": round(float(is_total), 2),
            "in_sample_mdd_pct": round(float(is_mdd), 2),
            "oos_sharpe_mean": round(float(oos_sharpe_mean), 2),
            "oos_sharpe_std": round(float(oos_sharpe_std), 2),
            "tstat": round(float(tstat), 2),
            "psr_zero": round(float(psr_zero), 4),
            "psr_diag": {k: (round(v, 4) if isinstance(v, float) else v) for k, v in psr_diag.items()},
            "regime_worst_sharpe": round(float(worst), 2) if valid_regimes else None,
            "regime_best_sharpe": round(float(best), 2) if valid_regimes else None,
            # 프론트엔드 TrustDetailsCard 호환 — 중첩 구조
            "walk_forward": {
                "label": "Walk-Forward 일반화 검증",
                "score": sub["generalization"],
                "description": metric_desc["generalization"],
                "detail": reasons.get("generalization", ""),
                "in_sample_sharpe": round(float(is_sharpe), 2),
                "oos_sharpe": round(float(oos_sharpe_mean), 2),
                "oos_sharpe_mean": round(float(oos_sharpe_mean), 2),
                "oos_sharpe_std": round(float(oos_sharpe_std), 2),
                "gap": round(float(is_sharpe - oos_sharpe_mean), 2),
                "n_folds": n_folds,
                "n_folds_total": n_total_folds,
            },
            "regime": {
                "label": "시장국면 견고성",
                "score": sub["regime_robustness"],
                "description": metric_desc["regime_robustness"],
                "detail": reasons.get("regime_robustness", ""),
                "worst_sharpe": round(float(worst), 2) if valid_regimes else None,
                "weakest_sharpe": round(float(worst), 2) if valid_regimes else None,
                "min_sharpe": round(float(worst), 2) if valid_regimes else None,
                "best_sharpe": round(float(best), 2) if valid_regimes else None,
                "weakest_regime": regime.get("weak_regime"),
                "weakest": regime.get("weak_regime"),
                "sharpe_std": round(float(np.std([v.get("effective_sharpe", 0) for v in valid_regimes.values()])), 3) if valid_regimes else None,
            },
            "parameter": {
                "label": "파라미터 안정성",
                "score": sub["parameter_stability"],
                "description": metric_desc["parameter_stability"],
                "detail": reasons.get("parameter_stability", ""),
                "sensitivity": round(float(np.std(perturb_sharpes)), 3) if perturb_sharpes else None,
                "sharpe_range": round(float(max(perturb_sharpes) - min(perturb_sharpes)), 3) if len(perturb_sharpes) >= 2 else None,
            },
            "risk": {
                "label": "리스크 통제",
                "score": sub["risk_control"],
                "description": metric_desc["risk_control"],
                "detail": reasons.get("risk_control", ""),
                "actual_mdd": round(abs(float(is_mdd)), 2),
                "mdd": round(abs(float(is_mdd)), 2),
                "in_sample_mdd_pct": round(float(is_mdd), 2),
                "target_mdd": round(float(mdd_target_pct), 2),
                "mdd_target_pct": mdd_target_pct,
                "ratio": round(abs(float(is_mdd)) / mdd_target_pct, 2) if mdd_target_pct > 0 else 0,
            },
            "statistical": {
                "label": "통계적 유의성 (PSR)",
                "score": sub["statistical_confidence"],
                "description": metric_desc["statistical_confidence"],
                "detail": reasons.get("statistical_confidence", ""),
                "psr_zero": round(float(psr_zero), 4),
                "tstat": round(float(tstat), 2),
                "t_stat": round(float(tstat), 2),
                "t_statistic": round(float(tstat), 2),
                "data_points": int(len(close)),
                "n_samples": int(len(close)),
                "n": int(len(close)),
            },
        },
    }
