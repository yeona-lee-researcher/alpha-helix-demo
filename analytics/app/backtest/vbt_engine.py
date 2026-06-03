"""
vectorbt-based backtest engine.
Strategies (6 deterministic templates):
- buy_and_hold:   첫날 매수, 마지막 날까지 보유
- sma_cross:      SMA(fast) > SMA(slow) → long
- rsi_meanrev:    RSI < low → long, > high → exit
- macd:           MACD line crosses signal line
- momentum_12_1:  12개월 누적수익률 - 1개월 누적수익률 > 0 → long
- vix_risk_off:   VIX <= threshold → long, > threshold → exit (외부 VIX 시리즈 필요)
"""
from __future__ import annotations
from dataclasses import dataclass
from typing import Literal, Optional

import numpy as np
import pandas as pd
import vectorbt as vbt

from app.config import DEFAULT_INITIAL_CAPITAL, DEFAULT_FEES, DEFAULT_SLIPPAGE


StrategyType = Literal[
    "buy_and_hold", "sma_cross", "rsi_meanrev", "macd",
    "momentum_12_1", "vix_risk_off",
]


@dataclass
class BacktestParams:
    strategy: StrategyType = "sma_cross"
    sma_fast: int = 20
    sma_slow: int = 60
    rsi_period: int = 14
    rsi_low: int = 30
    rsi_high: int = 70
    macd_fast: int = 12
    macd_slow: int = 26
    macd_signal: int = 9
    momentum_long_days: int = 252   # ~12개월
    momentum_short_days: int = 21   # ~1개월
    vix_threshold: float = 25.0
    initial_capital: float = DEFAULT_INITIAL_CAPITAL
    fees: float = DEFAULT_FEES
    slippage: float = DEFAULT_SLIPPAGE


def _signals(
    close: pd.Series,
    p: BacktestParams,
    vix: Optional[pd.Series] = None,
) -> tuple[pd.Series, pd.Series]:
    """Returns (entries, exits) boolean series aligned to `close`."""
    if p.strategy == "buy_and_hold":
        entries = pd.Series(False, index=close.index)
        exits = pd.Series(False, index=close.index)
        entries.iloc[0] = True
        return entries, exits

    if p.strategy == "sma_cross":
        fast = vbt.MA.run(close, p.sma_fast).ma
        slow = vbt.MA.run(close, p.sma_slow).ma
        entries = fast.vbt.crossed_above(slow)
        exits = fast.vbt.crossed_below(slow)

    elif p.strategy == "rsi_meanrev":
        rsi = vbt.RSI.run(close, p.rsi_period).rsi
        entries = rsi.vbt.crossed_below(p.rsi_low)
        exits = rsi.vbt.crossed_above(p.rsi_high)

    elif p.strategy == "macd":
        macd = vbt.MACD.run(close, p.macd_fast, p.macd_slow, p.macd_signal)
        entries = macd.macd.vbt.crossed_above(macd.signal)
        exits = macd.macd.vbt.crossed_below(macd.signal)

    elif p.strategy == "momentum_12_1":
        # 12-month return minus 1-month return (Jegadeesh-Titman 변형)
        long_ret = close.pct_change(p.momentum_long_days)
        short_ret = close.pct_change(p.momentum_short_days)
        score = long_ret - short_ret
        in_pos = score > 0
        # state-based entries/exits
        entries = in_pos & ~in_pos.shift(1).fillna(False)
        exits = ~in_pos & in_pos.shift(1).fillna(False)

    elif p.strategy == "vix_risk_off":
        if vix is None:
            raise ValueError("vix_risk_off requires `vix` series")
        v = vix.reindex(close.index).ffill()
        risk_on = v <= p.vix_threshold
        entries = risk_on & ~risk_on.shift(1).fillna(False)
        exits = ~risk_on & risk_on.shift(1).fillna(False)

    else:
        raise ValueError(f"Unknown strategy {p.strategy}")

    return entries.fillna(False), exits.fillna(False)



def run_backtest(
    close: pd.Series,
    p: BacktestParams,
    vix: Optional[pd.Series] = None,
) -> dict:
    """
    Returns dict with stats + equity curve.
    Reference: vectorbt Portfolio.from_signals — pf.stats(), pf.returns(), pf.returns_stats().
    `vix` is required for strategy='vix_risk_off'.
    """
    entries, exits = _signals(close, p, vix=vix)
    # Look-ahead bias 방지: close로 생성한 신호는 1bar shift (vectorbt docs 권장)
    # buy_and_hold는 첫날 진입이므로 shift 시 다음 날로 밀리는 게 자연스럽다.
    # fshift는 첫 위치에 NaN을 만들어 dtype을 object로 바꿈 → fillna 후 bool로 강제 캐스팅 필수
    # (Numba가 object array를 njit으로 처리 못 해 TypingError 발생)
    entries = entries.vbt.fshift(1).fillna(False).astype(bool)
    exits = exits.vbt.fshift(1).fillna(False).astype(bool)
    # buy_and_hold: shift 이후에도 최소 1개 entry는 보장
    if p.strategy == "buy_and_hold" and not entries.any():
        entries.iloc[0] = True

    pf = vbt.Portfolio.from_signals(
        close,
        entries,
        exits,
        init_cash=p.initial_capital,
        fees=p.fees,
        slippage=p.slippage,
        freq="1D",
    )
    stats = pf.stats()
    eq = pf.value()
    strat_returns = pf.returns()  # strategy daily returns (after fees/slippage)

    def _f(x):
        try:
            v = float(x)
            return None if (np.isnan(v) or np.isinf(v)) else round(v, 4)
        except Exception:
            return None

    # Calmar fallback: vbt가 None/NaN 주는 경우가 쟦아 CAGR/|MDD|로 수동 재계산
    _calmar = _f(pf.calmar_ratio())
    if _calmar is None:
        try:
            a = float(pf.annualized_return() * 100)
            m = float(stats.get("Max Drawdown [%]"))
            if not np.isnan(a) and not np.isnan(m) and abs(m) > 1e-9:
                _calmar = round(a / abs(m), 4)
        except Exception:
            _calmar = None

    return {
        "strategy": p.strategy,
        "params": {
            "sma_fast": p.sma_fast, "sma_slow": p.sma_slow,
            "rsi_period": p.rsi_period, "rsi_low": p.rsi_low, "rsi_high": p.rsi_high,
            "macd_fast": p.macd_fast, "macd_slow": p.macd_slow, "macd_signal": p.macd_signal,
            "momentum_long_days": p.momentum_long_days, "momentum_short_days": p.momentum_short_days,
            "vix_threshold": p.vix_threshold,
        },
        "stats": {
            "total_return_pct": _f(stats.get("Total Return [%]")),
            "annualized_return_pct": _f(pf.annualized_return() * 100),
            "max_drawdown_pct": _f(stats.get("Max Drawdown [%]")),
            "sharpe": _f(pf.sharpe_ratio()),
            "sortino": _f(pf.sortino_ratio()),
            "calmar": _calmar,
            "win_rate_pct": _f(stats.get("Win Rate [%]")),
            "trades": int(stats.get("Total Trades", 0)),
            "start": str(close.index[0].date()),
            "end": str(close.index[-1].date()),
        },
        "equity_curve": [
            {"date": str(d.date()), "value": _f(v)}
            for d, v in eq.iloc[::max(1, len(eq) // 365)].items()  # downsample to ~1y daily points
        ],
        "_strategy_returns": strat_returns,  # internal: passed to QuantStats in main.py
    }


def latest_signal(
    close: pd.Series,
    p: BacktestParams,
    vix: Optional[pd.Series] = None,
) -> dict:
    """
    Determine today's signal: BUY / SELL / HOLD based on most recent crossover.
    Looks at last 5 bars for entry/exit events.
    """
    entries, exits = _signals(close, p, vix=vix)
    last5_entries = entries.iloc[-5:]
    last5_exits = exits.iloc[-5:]

    signal = "HOLD"
    reason = "최근 5거래일 내 신호 없음"
    if last5_entries.iloc[-1]:
        signal = "BUY"
        reason = f"오늘 {p.strategy} 매수 시그널 발생"
    elif last5_exits.iloc[-1]:
        signal = "SELL"
        reason = f"오늘 {p.strategy} 매도 시그널 발생"
    elif last5_entries.any():
        signal = "BUY"
        reason = "최근 5일 내 매수 시그널 (포지션 진입 권장)"
    elif last5_exits.any():
        signal = "SELL"
        reason = "최근 5일 내 매도 시그널 (포지션 정리 권장)"

    return {
        "signal": signal,
        "reason": reason,
        "last_close": float(close.iloc[-1]),
        "last_date": str(close.index[-1].date()),
    }
