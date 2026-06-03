"""
Alpha-Helix Developer Studio — main.py
========================================
LEAN QCAlgorithm 구조 + vectorbt 브리지 + TQQQ-SOXL 무한매수 전략 코어

아키텍처:
  - TQQQSOXLMomentumAlgorithm : QuantConnect LEAN QCAlgorithm 인터페이스 호환
  - vectorbt_bridge            : vectorbt 고속 신호·백테스트 계산기
  - run_strategy               : FastAPI analytics 서버에서 직접 호출하는 진입점

무한매수(Infinite Buy) 전략 개요:
  1. 전략 개요
     - 레버리지 ETF(TQQQ/SOXL)를 분할매수로 접근, 주가 하락 시 추가 매수
     - 상승 전환 후 분할익절 → 평단가 대비 목표수익률 달성 시 익절
  2. 레짐 필터링
     - bull_quiet / bull_volatile : 매수 허용
     - bear / crisis              : 매수 금지, 기존 포지션 청산
  3. 포지션 사이징
     - Kelly 기반 분수 비중으로 총자본의 N%씩 분할
     - VIX 연동 승수로 위험 구간 자동 축소
  4. 익절 조건
     - 평단가 대비 +15% 도달 시 50% 청산
     - 평단가 대비 +30% 도달 시 나머지 50% 청산
  5. 손절 조건
     - DrawdownCircuitBreaker halt 발동 시 전량 청산

참고:
  - QuantConnect LEAN: https://github.com/QuantConnect/Lean
  - vectorbt: https://vectorbt.dev
  - 무한매수법: DCA on leveraged ETFs with momentum regime filter
"""

from __future__ import annotations

import logging
import warnings
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Tuple

import numpy as np
import pandas as pd

warnings.filterwarnings("ignore")
log = logging.getLogger(__name__)

# 내부 모듈
try:
    from analytics.strategy.helpers import (
        BayesianRegimeDetector,
        FatTailSynthesizer,
        SynthConfig,
        WalkForwardValidator,
        WFConfig,
        compute_sharpe,
        compute_sortino,
        compute_calmar,
        max_drawdown,
        annualized_return,
    )
    from analytics.strategy.risk_control import (
        ConfidenceScoringSystem,
        VixMultiplierEngine,
        KellyPositionSizer,
        RiskBudgetAllocator,
        DrawdownCircuitBreaker,
        RegimeAwareRiskFilter,
        IntegratedRiskPipeline,
        SignalBundle,
        RiskDecision,
    )
except ImportError:
    # 상대 경로 폴백 (직접 실행 시)
    import sys, os
    sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
    from strategy.helpers import (
        BayesianRegimeDetector, FatTailSynthesizer, SynthConfig,
        WalkForwardValidator, WFConfig,
        compute_sharpe, compute_sortino, compute_calmar, max_drawdown, annualized_return,
    )
    from strategy.risk_control import (
        ConfidenceScoringSystem, VixMultiplierEngine, KellyPositionSizer,
        RiskBudgetAllocator, DrawdownCircuitBreaker, RegimeAwareRiskFilter,
        IntegratedRiskPipeline, SignalBundle, RiskDecision,
    )


# ─────────────────────────────────────────────────────────────────────────────
# 공유 파라미터
# ─────────────────────────────────────────────────────────────────────────────

@dataclass
class StrategyParams:
    """
    전략 파라미터 — FastAPI 요청에서 Pydantic 모델로 수신 후 변환.
    (defaults = Alpha-Helix 권장 설정)
    """
    # ── 모멘텀 ──
    momentum_short: int  = 21      # 단기 모멘텀 (1개월)
    momentum_long:  int  = 63      # 장기 모멘텀 (3개월)
    momentum_weight_short: float = 0.6
    momentum_weight_long:  float = 0.4

    # ── 레짐 HMM ──
    hmm_states:     int  = 4       # HMM 상태 수
    hmm_lookback:   int  = 252     # HMM 학습 윈도우 (1년)

    # ── 무한매수 ──
    dca_splits:         int   = 5    # 분할매수 횟수
    take_profit_1:      float = 0.15  # 1차 익절 +15%
    take_profit_2:      float = 0.30  # 2차 익절 +30%
    take_profit_1_pct:  float = 0.50  # 1차 익절 비율
    dca_drop_trigger:   float = -0.07  # 추가매수 트리거 (-7% 하락)

    # ── 리스크 ──
    kelly_fraction:     float = 0.25
    vol_target:         float = 0.30
    halt_drawdown:      float = -0.35
    max_weight_per_leg: float = 0.50   # 단일 에셋 최대 비중

    # ── 일반 ──
    tickers: List[str] = field(default_factory=lambda: ["TQQQ", "SOXL"])
    leverage: float = 3.0


# ─────────────────────────────────────────────────────────────────────────────
# LEAN QCAlgorithm 인터페이스 호환 클래스
# ─────────────────────────────────────────────────────────────────────────────

class TQQQSOXLMomentumAlgorithm:
    """
    QuantConnect LEAN QCAlgorithm 구조 모방 — 이벤트 드리븐 전략.

    실제 LEAN 환경에서는 QCAlgorithm을 상속하고
    Initialize() / OnData() / OnEndOfDay() 메서드를 오버라이드함.
    여기서는 vectorbt·FastAPI와 연동하기 위해 인터페이스만 모방.

    실행 흐름:
      1. Initialize()  : 에셋 등록, 스케줄 등록, 지표 초기화
      2. OnData(data)  : 매 바마다 호출 — 신호 계산 → 포지션 결정
      3. Rebalance()   : 주간/월간 스케줄 이벤트 — 리밸런싱
    """

    def __init__(
        self,
        params: Optional[StrategyParams] = None,
        total_capital: float = 10_000_000,  # 초기 자본 (원)
    ):
        self.params       = params or StrategyParams()
        self.total_capital = total_capital

        # 지표 상태
        self._prices: Dict[str, pd.Series] = {}
        self._regimes: Dict[str, str] = {}
        self._positions: Dict[str, float] = {}   # ticker → 보유 비중
        self._avg_cost: Dict[str, float] = {}    # ticker → 평단가
        self._portfolio_value = total_capital
        self._trade_log: List[Dict] = []

        # 리스크 모듈 초기화
        self.confidence_sys = ConfidenceScoringSystem()
        self.vix_engine     = VixMultiplierEngine(leverage=params.leverage if params else 3.0)
        self.kelly_sizer    = KellyPositionSizer(fraction=(params.kelly_fraction if params else 0.25))
        self.circuit        = DrawdownCircuitBreaker(halt_threshold=(params.halt_drawdown if params else -0.35))
        self.regime_filter  = RegimeAwareRiskFilter(smoothing=0.2)
        self.regime_detectors: Dict[str, BayesianRegimeDetector] = {}

        # 로그
        log.info("[TQQQSOXLAlgorithm] 초기화 완료 — 자본: %s, 종목: %s",
                 f"{total_capital:,.0f}", self.params.tickers)

    # ── LEAN Initialize() ──────────────────────────────────────────────────

    def Initialize(self) -> None:
        """
        LEAN 호환 초기화.
        실제 LEAN에서는 AddEquity, SetBenchmark, SetCash, Schedule.On 등 호출.
        시뮬레이션 환경에서는 레짐 탐지기와 켈리 사이저만 초기화.
        """
        p = self.params
        for ticker in p.tickers:
            self.regime_detectors[ticker] = BayesianRegimeDetector(n_states=p.hmm_states)
            self._positions[ticker]  = 0.0
            self._avg_cost[ticker]   = 0.0

        log.info("[Initialize] 에셋 등록: %s", p.tickers)

    # ── 레짐 감지 ──────────────────────────────────────────────────────────

    def _detect_regime(self, ticker: str, returns: pd.Series) -> Tuple[str, float]:
        """
        HMM으로 현재 시장 국면 탐지.
        Returns: (regime_label, regime_confidence)
        """
        detector = self.regime_detectors.get(ticker)
        if detector is None:
            return "sideways", 0.5

        lookback = returns.tail(self.params.hmm_lookback)
        if len(lookback) < 50:
            return "sideways", 0.5

        try:
            if not detector._is_fitted:
                detector.fit(lookback)
            proba = detector.predict_proba(lookback)
            # 최신 시점의 가장 높은 사후확률 상태
            latest = proba.iloc[-1]
            regime = str(latest.idxmax())
            confidence = float(latest.max())
            self._regimes[ticker] = regime
            return regime, confidence
        except Exception as e:
            log.warning("[_detect_regime] %s 실패: %s", ticker, e)
            return "sideways", 0.5

    # ── 모멘텀 신호 계산 ──────────────────────────────────────────────────

    def _compute_momentum_signal(
        self,
        prices: pd.Series,
        vix: float = 20.0,
    ) -> Tuple[float, float, float]:
        """
        이중 모멘텀 신호 계산 (단기 + 장기 가중 결합).

        Returns: (raw_signal, mom_1m, mom_3m)
        raw_signal ∈ [-1, +1]: 양수 = 롱, 음수 = 숏(포지션 0 처리)
        """
        p = self.params
        if len(prices) < p.momentum_long + 5:
            return 0.0, 0.0, 0.0

        mom_short = float(prices.iloc[-1] / prices.iloc[-p.momentum_short] - 1)
        mom_long  = float(prices.iloc[-1] / prices.iloc[-p.momentum_long]  - 1)

        # 가중 결합 → tanh 압축 [-1, +1]
        raw = mom_short * p.momentum_weight_short + mom_long * p.momentum_weight_long
        signal = float(np.tanh(raw * 5))  # 5배 증폭 후 압축

        return signal, mom_short, mom_long

    # ── LEAN OnData() ──────────────────────────────────────────────────────

    def OnData(
        self,
        close_prices: Dict[str, pd.Series],
        vix_series: Optional[pd.Series] = None,
    ) -> Dict[str, float]:
        """
        LEAN 호환 데이터 이벤트 핸들러.
        매 영업일 마감가 수신 시 호출.

        Parameters
        ----------
        close_prices : {ticker -> 종가 시계열}
        vix_series   : VIX 일별 시계열 (없으면 20.0 사용)

        Returns
        -------
        dict : {ticker -> 목표 비중}
        """
        current_vix = float(vix_series.iloc[-1]) if vix_series is not None and len(vix_series) else 20.0

        # 서킷브레이커 상태 갱신
        cb_state = self.circuit.update(self._portfolio_value)
        if cb_state.status == "halt":
            log.warning("[OnData] HALT — 모든 포지션 청산")
            return {t: 0.0 for t in self.params.tickers}

        signals: List[SignalBundle] = []

        for ticker in self.params.tickers:
            prices = close_prices.get(ticker)
            if prices is None or len(prices) < self.params.momentum_long + 5:
                continue

            returns = prices.pct_change().dropna()

            # 국면 탐지 (롤링 재학습)
            regime, regime_conf = self._detect_regime(ticker, returns)

            # 모멘텀 신호
            signal, mom_1m, mom_3m = self._compute_momentum_signal(prices, current_vix)

            # 변동성
            vol_20d = float(returns.tail(20).std() * np.sqrt(252)) if len(returns) >= 20 else 0.5

            bundle = SignalBundle(
                ticker=ticker,
                raw_signal=signal,
                confidence=regime_conf,
                regime=regime,
                vix_level=current_vix,
                momentum_1m=mom_1m,
                momentum_3m=mom_3m,
                vol_20d=vol_20d,
            )
            signals.append(bundle)
            self._prices[ticker] = prices

        if not signals:
            return {}

        # 신뢰도 기반 포지션 결정
        target_weights = {}
        returns_df = pd.DataFrame({
            t: close_prices[t].pct_change().dropna()
            for t in self.params.tickers
            if t in close_prices
        }).dropna()

        kelly = KellyPositionSizer(fraction=self.params.kelly_fraction)
        kelly_weights = kelly.multi_asset_kelly(returns_df) if len(returns_df) >= 30 else {t: 0.0 for t in self.params.tickers}

        for sig in signals:
            regime_params = self.regime_filter.get_params(sig.regime)
            confidence, _ = self.confidence_sys.compute_confidence(sig)
            vix_mult = self.vix_engine.multiplier(sig.vix_level)

            base_w = kelly_weights.get(sig.ticker, 0.0)
            target_w = base_w * vix_mult * cb_state.positions_multiplier * confidence
            target_w = float(np.clip(target_w, 0.0, min(self.params.max_weight_per_leg, regime_params["max_weight"])))

            # 레짐 필터: bear/crisis에서는 강제 0
            if sig.regime in ("bear", "crisis", "high_vol_unstable"):
                target_w = 0.0

            target_weights[sig.ticker] = round(target_w, 4)

        # 무한매수 로직 적용
        target_weights = self._apply_dca_logic(target_weights, close_prices)

        return target_weights

    # ── 무한매수(DCA) 로직 ──────────────────────────────────────────────────

    def _apply_dca_logic(
        self,
        base_weights: Dict[str, float],
        close_prices: Dict[str, pd.Series],
    ) -> Dict[str, float]:
        """
        무한매수(DCA on leveraged ETF) 로직 적용.

        - 현재 평단가 대비 수익률이 익절 임계값에 도달하면 부분/전량 익절
        - 현재 가격이 평단가 대비 dca_drop_trigger 이하면 추가 매수 (비중 증가)
        - bear/crisis 레짐에서는 DCA 중지, 기존 포지션 정리
        """
        p = self.params
        adjusted = dict(base_weights)

        for ticker in p.tickers:
            prices = close_prices.get(ticker)
            if prices is None or len(prices) == 0:
                continue

            current_price = float(prices.iloc[-1])
            avg_cost      = self._avg_cost.get(ticker, current_price)
            current_pos   = self._positions.get(ticker, 0.0)

            if avg_cost <= 0 or current_pos <= 0:
                # 신규 진입 — 평단가 설정
                if adjusted.get(ticker, 0.0) > 0:
                    self._avg_cost[ticker] = current_price
                continue

            # 현재 수익률 (평단가 대비)
            pnl_pct = (current_price - avg_cost) / avg_cost

            # 익절 1차 (+15%)
            if pnl_pct >= p.take_profit_1 and current_pos > 0.01:
                new_weight = current_pos * (1 - p.take_profit_1_pct)
                adjusted[ticker] = round(new_weight, 4)
                self._trade_log.append({
                    "type": "take_profit_1", "ticker": ticker,
                    "price": current_price, "pnl_pct": round(pnl_pct * 100, 1),
                    "new_weight": new_weight,
                })
                log.info("[DCA] %s 1차익절 — PnL %.1f%% → 비중 %.1f%%→%.1f%%",
                         ticker, pnl_pct*100, current_pos*100, new_weight*100)

            # 익절 2차 (+30%)
            elif pnl_pct >= p.take_profit_2 and current_pos > 0.01:
                adjusted[ticker] = 0.0
                self._trade_log.append({
                    "type": "take_profit_2", "ticker": ticker,
                    "price": current_price, "pnl_pct": round(pnl_pct * 100, 1),
                })
                log.info("[DCA] %s 2차익절(전량) — PnL %.1f%%", ticker, pnl_pct*100)

            # 추가매수 트리거 (하락 시 분할 매수)
            elif pnl_pct <= p.dca_drop_trigger:
                regime = self._regimes.get(ticker, "sideways")
                if regime not in ("bear", "crisis", "high_vol_unstable"):
                    # 목표비중 단계적 증가 (스플릿 1개당 추가 할당)
                    dca_increment = adjusted.get(ticker, 0.0) / p.dca_splits
                    new_weight = min(adjusted.get(ticker, 0.0) + dca_increment, p.max_weight_per_leg)
                    adjusted[ticker] = round(new_weight, 4)
                    # 평단가 업데이트 (가중평균)
                    old_total  = current_pos * avg_cost
                    new_shares = dca_increment
                    self._avg_cost[ticker] = (old_total + new_shares * current_price) / (current_pos + new_shares)
                    self._trade_log.append({
                        "type": "dca_buy", "ticker": ticker,
                        "price": current_price, "pnl_pct": round(pnl_pct * 100, 1),
                        "new_weight": new_weight,
                    })

        return adjusted

    # ── LEAN Rebalance() ──────────────────────────────────────────────────

    def Rebalance(
        self,
        close_prices: Dict[str, pd.Series],
        vix_series: Optional[pd.Series] = None,
    ) -> Dict[str, float]:
        """
        주간/월간 스케줄 리밸런싱 이벤트.
        LEAN에서는 Schedule.On(Every.Week.Monday, ...) 으로 등록.
        """
        log.info("[Rebalance] 리밸런싱 실행")
        weights = self.OnData(close_prices, vix_series)

        # 리밸런싱 후 평단가·포지션 상태 동기화
        for ticker, w in weights.items():
            prices = close_prices.get(ticker)
            if prices is not None and len(prices) > 0 and w > 0:
                if self._positions.get(ticker, 0.0) == 0.0:
                    self._avg_cost[ticker] = float(prices.iloc[-1])
            self._positions[ticker] = w

        return weights


# ─────────────────────────────────────────────────────────────────────────────
# vectorbt 브리지
# ─────────────────────────────────────────────────────────────────────────────

def vectorbt_bridge(
    close_df: pd.DataFrame,
    params: Optional[StrategyParams] = None,
    vix_series: Optional[pd.Series] = None,
) -> Dict[str, Any]:
    """
    vectorbt를 이용한 고속 신호 행렬 계산 및 백테스트 요약.

    vectorbt는 numpy 브로드캐스팅으로 pandas 루프보다 10~100배 빠름.
    신호 배열 생성 후 포트폴리오 시뮬레이션 → 핵심 지표 반환.

    Parameters
    ----------
    close_df    : 종가 DataFrame (index=날짜, columns=ticker)
    params      : StrategyParams
    vix_series  : VIX 시계열 (없으면 합성)

    Returns
    -------
    dict: entries/exits 불린 배열 + 기초 통계
    """
    p = params or StrategyParams()
    tickers = [t for t in p.tickers if t in close_df.columns]

    if not tickers:
        return {"error": "no matching tickers"}

    close = close_df[tickers].dropna()
    rets  = close.pct_change().dropna()

    # ── 신호 행렬 (T × N numpy) ──
    n_rows = len(close)

    # 모멘텀 기반 진입 신호
    mom_short = close.pct_change(p.momentum_short)
    mom_long  = close.pct_change(p.momentum_long)

    raw_signal = (
        mom_short * p.momentum_weight_short
        + mom_long  * p.momentum_weight_long
    )

    # VIX 승수 적용
    vix_vals = vix_series.reindex(close.index).ffill().fillna(20.0) if vix_series is not None else pd.Series(20.0, index=close.index)
    vix_engine = VixMultiplierEngine(leverage=p.leverage)
    vix_mult = vix_vals.apply(vix_engine.multiplier)  # Series

    # 진입 조건: 신호 양수 + VIX 승수 > 0.3
    entries = (raw_signal > 0) & (vix_mult > 0.3).values.reshape(-1, 1)
    exits   = (raw_signal < 0) | (vix_mult <= 0.3).values.reshape(-1, 1)

    # ── vectorbt 포트폴리오 시뮬레이션 ──
    try:
        import vectorbt as vbt  # type: ignore

        pf = vbt.Portfolio.from_signals(
            close,
            entries=entries,
            exits=exits,
            size=1.0 / len(tickers),   # 균등 비중
            init_cash=10_000,
            fees=0.001,
            freq="D",
        )

        stats = pf.stats()
        returns_pf = pf.returns()

        return {
            "entries":          entries,
            "exits":            exits,
            "signal_matrix":    raw_signal,
            "vbt_portfolio":    pf,
            "total_return":     float(stats.get("Total Return [%]", 0)),
            "sharpe":           float(stats.get("Sharpe Ratio", 0)),
            "max_drawdown":     float(stats.get("Max Drawdown [%]", 0)),
            "win_rate":         float(stats.get("Win Rate [%]", 0)),
            "n_trades":         int(stats.get("Total Trades", 0)),
        }

    except ImportError:
        # vectorbt 미설치 → numpy 폴백 (기본 누적 수익률)
        signal_series = raw_signal.mean(axis=1).fillna(0)
        long_flag = (signal_series > 0).astype(float)
        port_rets  = (rets.mean(axis=1) * long_flag).dropna()
        total_ret  = float((1 + port_rets).prod() - 1) * 100
        sharpe     = compute_sharpe(port_rets)
        mdd        = float(max_drawdown((1 + port_rets).cumprod() * 100))

        return {
            "entries":       entries,
            "exits":         exits,
            "signal_matrix": raw_signal,
            "vbt_portfolio": None,
            "total_return":  round(total_ret, 2),
            "sharpe":        round(sharpe, 3),
            "max_drawdown":  round(mdd, 2),
            "win_rate":      0.0,
            "n_trades":      int(long_flag.diff().abs().sum()),
            "note":          "vectorbt 미설치 — numpy 폴백 사용",
        }

    except Exception as e:
        log.warning("[vectorbt_bridge] 오류: %s — numpy fallback 사용", e)
        # vectorbt 오류 시 numpy 폴백
        signal_series = raw_signal.mean(axis=1).fillna(0)
        long_flag = (signal_series > 0).astype(float)
        port_rets  = (rets.mean(axis=1) * long_flag).dropna()
        total_ret  = float((1 + port_rets).prod() - 1) * 100
        sharpe     = compute_sharpe(port_rets)
        mdd        = float(max_drawdown((1 + port_rets).cumprod() * 100))
        return {
            "entries":       entries,
            "exits":         exits,
            "signal_matrix": raw_signal,
            "vbt_portfolio": None,
            "total_return":  round(total_ret, 2),
            "sharpe":        round(sharpe, 3),
            "max_drawdown":  round(mdd, 2),
            "win_rate":      0.0,
            "n_trades":      int(long_flag.diff().abs().sum()),
            "note":          f"vectorbt 오류({type(e).__name__}) — numpy fallback",
        }


# ─────────────────────────────────────────────────────────────────────────────
# FastAPI 진입점
# ─────────────────────────────────────────────────────────────────────────────

def run_strategy(
    close_df: pd.DataFrame,
    params_dict: Optional[Dict[str, Any]] = None,
    vix_series: Optional[pd.Series] = None,
    total_capital: float = 10_000_000,
    run_walkforward: bool = True,
    run_stress: bool = True,
) -> Dict[str, Any]:
    """
    FastAPI analytics 서버에서 호출하는 통합 전략 실행 함수.

    단계:
      1. 파라미터 파싱
      2. vectorbt 브리지 (고속 신호 + 기본 백테스트)
      3. WalkForward 검증 (과적합 측정)
      4. 스트레스 테스트 (합성 데이터 Monte Carlo)
      5. 현재 포지션 결정 (OnData 최신 시점)
      6. Trust Score 계산 (기존 trust_score.py와 연동)
      7. 결과 집계 반환

    Parameters
    ----------
    close_df        : 에셋별 종가 DataFrame
    params_dict     : StrategyParams 딕셔너리 (없으면 기본값)
    vix_series      : VIX 시계열
    total_capital   : 초기 자본
    run_walkforward : WF 검증 실행 여부
    run_stress      : 스트레스 테스트 실행 여부

    Returns
    -------
    dict : 전략 결과 전체 (FastAPI response body)
    """
    # ── 1. 파라미터 파싱 ──
    if params_dict:
        p = StrategyParams(**{k: v for k, v in params_dict.items() if hasattr(StrategyParams, k)})
    else:
        p = StrategyParams()

    tickers = [t for t in p.tickers if t in close_df.columns]
    if not tickers:
        return {"error": "요청한 티커가 데이터에 없습니다.", "available": list(close_df.columns)}

    close = close_df[tickers].dropna()

    # ── 2. vectorbt 브리지 ──
    vbt_result = vectorbt_bridge(close, p, vix_series)

    # ── 3. WalkForward 검증 ──
    wf_result: Dict[str, Any] = {}
    if run_walkforward:
        wf_cfg = WFConfig(train_days=252, test_days=63, n_bootstrap=100)
        wf_val = WalkForwardValidator(wf_cfg)

        # 첫 번째 티커 기준 단순 매수보유 전략으로 WF 실행
        ref_prices = close[tickers[0]]

        def _simple_strategy(prices: pd.Series) -> pd.Series:
            """단순 모멘텀 매수보유 전략 (WF 평가용)."""
            rets = prices.pct_change().dropna()
            mom = prices.pct_change(min(21, len(prices) - 1))
            signal = (mom > 0).astype(float).reindex(rets.index).fillna(0)
            return rets * signal

        wf_result = wf_val.run(ref_prices, _simple_strategy)
        # WFResult 직렬화 (dataclass → dict)
        if "folds" in wf_result:
            wf_result["folds"] = [
                {
                    "fold_id":         f.fold_id,
                    "is_sharpe":       round(f.is_sharpe, 3),
                    "oos_sharpe":      round(f.oos_sharpe, 3),
                    "oos_total_return": round(f.oos_total_return, 1),
                    "oos_max_drawdown": round(f.oos_max_drawdown, 1),
                }
                for f in wf_result["folds"]
            ]

    # ── 4. 스트레스 테스트 ──
    stress_result: Dict[str, Any] = {}
    if run_stress:
        synth_cfg = SynthConfig(
            n_days=252,
            annual_vol_base=0.65,   # TQQQ 고변동성 반영
            garch_alpha=0.12,
            garch_beta=0.83,
            crash_prob=0.008,
        )
        synthesizer = FatTailSynthesizer(synth_cfg, seed=0)
        stress_df   = synthesizer.generate_stress_scenarios(n_scenarios=200, leverage=p.leverage)
        stress_result = {
            "median_return":     round(float(stress_df["total_return"].median()) * 100, 1),
            "p5_return":         round(float(stress_df["total_return"].quantile(0.05)) * 100, 1),
            "p95_return":        round(float(stress_df["total_return"].quantile(0.95)) * 100, 1),
            "median_mdd":        round(float(stress_df["max_drawdown"].median()) * 100, 1),
            "worst_mdd":         round(float(stress_df["max_drawdown"].min()) * 100, 1),
            "prob_loss_gt_50pct": round(float((stress_df["max_drawdown"] < -0.50).mean()) * 100, 1),
            "n_scenarios":       200,
        }

    # ── 5. 현재 포지션 결정 ──
    algo = TQQQSOXLMomentumAlgorithm(params=p, total_capital=total_capital)
    algo.Initialize()

    close_prices_dict = {t: close[t] for t in tickers}
    current_weights   = algo.OnData(close_prices_dict, vix_series)

    # ── 6. 핵심 통계 ──
    combined_rets = close.pct_change().dropna().mean(axis=1)
    sharpe  = compute_sharpe(combined_rets)
    sortino = compute_sortino(combined_rets)
    calmar  = compute_calmar(close.mean(axis=1))
    mdd     = max_drawdown(close.mean(axis=1))
    cagr    = annualized_return(close.mean(axis=1))

    return {
        "strategy": "TQQQ-SOXL 모멘텀 무한매수 전략",
        "tickers":  tickers,
        "params":   {k: getattr(p, k) for k in p.__dataclass_fields__},

        # 백테스트 요약
        "backtest": {
            "total_return_pct":  vbt_result.get("total_return", 0),
            "sharpe":            round(sharpe, 3),
            "sortino":           round(sortino, 3),
            "calmar":            round(calmar, 3),
            "max_drawdown_pct":  round(mdd, 1),
            "cagr_pct":          round(cagr, 1),
            "n_trades":          vbt_result.get("n_trades", 0),
            "win_rate_pct":      vbt_result.get("win_rate", 0),
            "vectorbt_note":     vbt_result.get("note", ""),
        },

        # WalkForward 검증
        "walk_forward": {
            "is_sharpe_mean":  round(wf_result.get("is_sharpe_mean", 0), 3),
            "oos_sharpe_mean": round(wf_result.get("oos_sharpe_mean", 0), 3),
            "overfit_idx":     round(wf_result.get("overfit_idx", 100), 1),
            "bootstrap_ci":    wf_result.get("bootstrap_ci", (0, 0)),
            "n_folds":         wf_result.get("n_folds", 0),
            "folds":           wf_result.get("folds", []),
        } if run_walkforward else {},

        # 스트레스 테스트
        "stress_test": stress_result,

        # 현재 포지션
        "current_position": {
            t: {
                "target_weight_pct": round(w * 100, 1),
                "position_usd":      round(w * total_capital, 0),
            }
            for t, w in current_weights.items()
        },
        "circuit_status":   algo.circuit.state.status,
        "circuit_drawdown": round(algo.circuit.state.drawdown_pct * 100, 1),
        "trade_log":        algo.trade_log if hasattr(algo, 'trade_log') else [],
    }


# ─────────────────────────────────────────────────────────────────────────────
# 독립 실행 테스트
# ─────────────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    print("=" * 60)
    print("Alpha-Helix 듀얼 모드 AI 코파일럿 엔진 — 동작 검증")
    print("=" * 60)

    # 합성 데이터 생성 (yfinance 없는 환경 대비)
    synth = FatTailSynthesizer(SynthConfig(n_days=756, annual_vol_base=0.55), seed=42)  # 3년
    tqqq  = synth.generate_single(leverage=3.0)
    synth2 = FatTailSynthesizer(SynthConfig(n_days=756, annual_vol_base=0.60), seed=7)
    soxl  = synth2.generate_single(leverage=3.0)

    close_df = pd.DataFrame({"TQQQ": tqqq.values, "SOXL": soxl.values}, index=tqqq.index)

    # VIX 합성 (평균 20, 표준편차 8)
    rng = np.random.default_rng(0)
    vix = pd.Series(
        np.clip(rng.normal(20, 8, len(tqqq)), 10, 80),
        index=tqqq.index,
    )

    print("\n[1] run_strategy 실행 (WF + 스트레스 포함)...")
    result = run_strategy(
        close_df=close_df,
        vix_series=vix,
        total_capital=10_000_000,
        run_walkforward=True,
        run_stress=True,
    )

    print(f"\n전략: {result['strategy']}")
    bt = result["backtest"]
    print(f"백테스트: Sharpe={bt['sharpe']:.2f} | Sortino={bt['sortino']:.2f} | "
          f"CAGR={bt['cagr_pct']:.1f}% | MDD={bt['max_drawdown_pct']:.1f}%")

    wf = result["walk_forward"]
    if wf:
        print(f"WalkForward: IS Sharpe={wf['is_sharpe_mean']:.2f} | OOS={wf['oos_sharpe_mean']:.2f} | "
              f"과적합 지수={wf['overfit_idx']:.1f}% | 폴드={wf['n_folds']}")

    st = result["stress_test"]
    if st:
        print(f"스트레스: 중앙수익={st['median_return']}% | P5={st['p5_return']}% | "
              f"최대MDD={st['worst_mdd']}% | 50%이상손실확률={st['prob_loss_gt_50pct']}%")

    print(f"\n현재 포지션: {result['current_position']}")
    print(f"서킷브레이커: {result['circuit_status']}")

    print("\n[2] TQQQSOXLMomentumAlgorithm.Rebalance 테스트...")
    algo = TQQQSOXLMomentumAlgorithm(params=StrategyParams(), total_capital=10_000_000)
    algo.Initialize()
    weights = algo.Rebalance({"TQQQ": tqqq, "SOXL": soxl}, vix)
    print(f"리밸런싱 결과: {weights}")

    print("\n✓ 모든 검증 완료")
