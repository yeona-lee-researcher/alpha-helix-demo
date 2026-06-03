"""
Phase 4: Binance Futures 자동매매 엔진.

기능:
  1. BTCUSDT / ETHUSDT 등 USDT-M 영구 선물 전략 백테스트 (펀딩레이트 비용 포함)
  2. 실시간 신호 생성 (SMA 크로스, RSI 반전, 모멘텀)
  3. 자동주문 실행 (단, BrokerAccount.tradingEnabled=true + lastVerifiedAt 확인 필요)
  4. 리스크 관리 (최대 포지션, 스탑로스, 레버리지 제한)

사용 방법:
  from app.backtest.futures_engine import FuturesParams, backtest_futures, get_futures_signal
  params = FuturesParams(symbol="BTCUSDT", leverage=5, strategy="sma_cross")
  result = backtest_futures(params)
  signal = get_futures_signal(params)
"""
from __future__ import annotations
import logging
import os
from dataclasses import dataclass, field
from datetime import date, timedelta
from typing import Optional

import numpy as np
import pandas as pd

log = logging.getLogger(__name__)


# ── 파라미터 ──────────────────────────────────────────────────────────────────

@dataclass
class FuturesParams:
    symbol: str = "BTCUSDT"
    strategy: str = "sma_cross"        # sma_cross | rsi_reversal | momentum | funding_arb
    leverage: int = 5                   # 레버리지 (1~20 권장, 최대 125)
    initial_capital: float = 10_000.0  # USD
    fees: float = 0.0004               # Binance Maker/Taker (0.04%)
    slippage: float = 0.001            # 0.1%
    # SMA 크로스
    sma_fast: int = 20
    sma_slow: int = 50
    # RSI
    rsi_period: int = 14
    rsi_long: float = 30.0             # 과매도 → 롱 진입
    rsi_short: float = 70.0            # 과매수 → 숏 진입
    # 모멘텀
    momentum_days: int = 20
    # 리스크
    max_position_pct: float = 0.5      # 자본의 최대 50% 포지션
    stop_loss_pct: float = 0.05        # 5% 스탑로스
    take_profit_pct: float = 0.15      # 15% 테이크프로핏
    # 기간
    period: str = "1y"                 # "1y" | "2y" | "6m"


# Yahoo Finance fallback 심볼 매핑 (Binance 선물 API가 미국 AWS에서 차단될 때 사용)
_YF_SYMBOL_MAP: dict[str, str] = {
    "BTCUSDT":  "BTC-USD",
    "ETHUSDT":  "ETH-USD",
    "SOLUSDT":  "SOL-USD",
    "BNBUSDT":  "BNB-USD",
    "DOGEUSDT": "DOGE-USD",
    "XRPUSDT":  "XRP-USD",
    "ADAUSDT":  "ADA-USD",
    "AVAXUSDT": "AVAX-USD",
}


# ── 데이터 로드 ───────────────────────────────────────────────────────────────

def _load_ohlcv(symbol: str, period: str) -> pd.DataFrame:
    """DB 또는 Binance에서 선물 OHLCV 로드. Binance 차단 시 Yahoo Finance fallback."""
    from app.data import market_db, binance_client

    days_map = {"6m": 180, "1y": 365, "2y": 730, "3y": 1095, "5y": 1825}
    days_back = days_map.get(period, 365)
    start = (date.today() - timedelta(days=days_back)).isoformat()

    # DB에서 먼저 조회
    df = market_db.query_ohlcv(symbol, tf="1d", source="binance", start=start, limit=days_back + 10)

    if df.empty:
        log.info("futures_engine: fetching %s from Binance", symbol)
        try:
            df = binance_client.get_klines_full(symbol, interval="1d", start_date=start)
            if not df.empty:
                market_db.upsert_ohlcv(df, tf="1d")
                df = market_db.query_ohlcv(symbol, tf="1d", source="binance", start=start)
        except Exception as e:
            log.warning("Binance fetch failed (%s) — trying Yahoo Finance fallback", e)
            df = pd.DataFrame()

    # Yahoo Finance fallback: Binance.com fapi가 미국 AWS IP에서 HTTP 451 차단될 때
    if df.empty:
        yf_symbol = _YF_SYMBOL_MAP.get(symbol.upper())
        if yf_symbol:
            log.info("futures_engine: Yahoo Finance fallback %s → %s", symbol, yf_symbol)
            try:
                import yfinance as yf
                yf_df = yf.download(yf_symbol, start=start, auto_adjust=True, progress=False)
                if not yf_df.empty:
                    yf_df.columns = [
                        c[0].lower() if isinstance(c, tuple) else c.lower()
                        for c in yf_df.columns
                    ]
                    yf_df.index = pd.to_datetime(yf_df.index, utc=True)
                    yf_df.index.name = "ts"
                    return yf_df[["open", "high", "low", "close", "volume"]].copy()
            except Exception as yf_err:
                log.warning("Yahoo Finance fallback also failed: %s", yf_err)

    if df.empty:
        raise ValueError(f"No OHLCV data for {symbol}")

    df = df.set_index("ts").sort_index()
    df.index = pd.to_datetime(df.index)
    return df


# ── 신호 생성 ──────────────────────────────────────────────────────────────────

def _sma_cross_signal(df: pd.DataFrame, fast: int, slow: int) -> pd.Series:
    """1=롱, -1=숏, 0=중립."""
    sma_fast = df["close"].rolling(fast).mean()
    sma_slow = df["close"].rolling(slow).mean()
    signal = pd.Series(0, index=df.index)
    signal[sma_fast > sma_slow] = 1
    signal[sma_fast < sma_slow] = -1
    return signal


def _rsi_signal(df: pd.DataFrame, period: int, long_th: float, short_th: float) -> pd.Series:
    """RSI 기반 신호. 과매도→롱, 과매수→숏."""
    delta = df["close"].diff()
    gain  = delta.clip(lower=0).rolling(period).mean()
    loss  = (-delta.clip(upper=0)).rolling(period).mean()
    rs = gain / loss.replace(0, np.nan)
    rsi = 100 - (100 / (1 + rs))
    signal = pd.Series(0, index=df.index)
    signal[rsi < long_th]  = 1   # 과매도 → 롱
    signal[rsi > short_th] = -1  # 과매수 → 숏
    return signal, rsi


def _momentum_signal(df: pd.DataFrame, days: int) -> pd.Series:
    """모멘텀: N일 수익률 양수→롱, 음수→숏."""
    mom = df["close"].pct_change(days)
    signal = pd.Series(0, index=df.index)
    signal[mom > 0] = 1
    signal[mom < 0] = -1
    return signal


def _get_signal_series(df: pd.DataFrame, params: FuturesParams) -> pd.Series:
    if params.strategy == "sma_cross":
        return _sma_cross_signal(df, params.sma_fast, params.sma_slow)
    elif params.strategy == "rsi_reversal":
        sig, _ = _rsi_signal(df, params.rsi_period, params.rsi_long, params.rsi_short)
        return sig
    elif params.strategy == "momentum":
        return _momentum_signal(df, params.momentum_days)
    else:
        raise ValueError(f"Unknown strategy: {params.strategy}")


# ── 펀딩레이트 비용 ───────────────────────────────────────────────────────────

def _get_funding_cost(symbol: str, index: pd.DatetimeIndex) -> pd.Series:
    """펀딩레이트를 일봉 인덱스로 집계 (1일 3회 → 일별 합계)."""
    try:
        from app.data import binance_client
        df_f = binance_client.get_funding_rate(symbol, limit=1000)
        if df_f.empty:
            return pd.Series(0.0, index=index)
        df_f["date"] = pd.to_datetime(df_f["timestamp"]).dt.date
        # binance_client.get_funding_rate 는 snake_case 'funding_rate' 컬럼을 반환한다.
        # (과거엔 'fundingRate' 로 읽어 KeyError→except→펀딩비용이 항상 0 으로 묵살되던 버그)
        df_f["funding_rate"] = pd.to_numeric(df_f["funding_rate"], errors="coerce").fillna(0)
        daily = df_f.groupby("date")["funding_rate"].sum()
        daily.index = pd.to_datetime(daily.index)
        return daily.reindex(index, fill_value=0.0)
    except Exception as e:
        log.warning("funding rate fetch failed: %s", e)
        return pd.Series(0.0, index=index)


# ── 백테스트 엔진 ─────────────────────────────────────────────────────────────

def backtest_futures(params: FuturesParams) -> dict:
    """
    선물 전략 백테스트.

    리턴 딕셔너리:
        stats: {total_return, annualized_return, max_drawdown, sharpe, win_rate, num_trades}
        equity_curve: list of {date, equity}
        trades: list of {entry_date, exit_date, side, entry_price, exit_price, pnl_usd, reason}
        funding_cost_total: 총 펀딩 비용 (USD)
    """
    df = _load_ohlcv(params.symbol, params.period)
    signal = _get_signal_series(df, params)
    funding_cost_series = _get_funding_cost(params.symbol, df.index)

    capital   = params.initial_capital
    position  = 0       # 현재 포지션: +1 롱, -1 숏, 0 없음
    entry_px  = 0.0
    entry_date = None
    equity_curve = []
    trades = []
    max_equity = capital
    max_drawdown = 0.0
    total_funding_cost = 0.0

    # position_size = 자본 × max_position_pct × leverage (USD 노셔널)
    def notional(cap):
        return cap * params.max_position_pct * params.leverage

    for ts, row in df.iterrows():
        price = float(row["close"])
        sig = int(signal.loc[ts] if ts in signal.index else 0)

        # 펀딩 비용 (보유 포지션에만 적용)
        if position != 0:
            rate = float(funding_cost_series.loc[ts]) if ts in funding_cost_series.index else 0.0
            cost = notional(capital) * abs(rate)  # 롱=비용 지불, 숏=수취 (방향에 따라 다름)
            if position == 1:
                capital -= cost
            else:
                capital += cost  # 숏은 펀딩 수취
            total_funding_cost += cost

        # 포지션 청산 조건
        if position != 0:
            pnl_pct = (price - entry_px) / entry_px * position  # 방향 반영
            if pnl_pct <= -params.stop_loss_pct:
                # 스탑로스
                exit_pnl = notional(capital) * pnl_pct - notional(capital) * params.fees
                capital += exit_pnl
                trades.append({
                    "entry_date": str(entry_date.date()),
                    "exit_date": str(ts.date()),
                    "side": "LONG" if position == 1 else "SHORT",
                    "entry_price": entry_px, "exit_price": price,
                    "pnl_usd": round(exit_pnl, 2), "reason": "stop_loss",
                })
                position = 0
            elif pnl_pct >= params.take_profit_pct:
                # 테이크프로핏
                exit_pnl = notional(capital) * pnl_pct - notional(capital) * params.fees
                capital += exit_pnl
                trades.append({
                    "entry_date": str(entry_date.date()),
                    "exit_date": str(ts.date()),
                    "side": "LONG" if position == 1 else "SHORT",
                    "entry_price": entry_px, "exit_price": price,
                    "pnl_usd": round(exit_pnl, 2), "reason": "take_profit",
                })
                position = 0
            elif position != sig and sig != 0:
                # 신호 반전 → 청산
                exit_pnl = notional(capital) * pnl_pct - notional(capital) * params.fees
                capital += exit_pnl
                trades.append({
                    "entry_date": str(entry_date.date()),
                    "exit_date": str(ts.date()),
                    "side": "LONG" if position == 1 else "SHORT",
                    "entry_price": entry_px, "exit_price": price,
                    "pnl_usd": round(exit_pnl, 2), "reason": "signal_flip",
                })
                position = 0

        # 신규 진입
        if position == 0 and sig != 0:
            # 진입 수수료
            capital -= notional(capital) * params.fees * (1 + params.slippage)
            position = sig
            entry_px = price * (1 + params.slippage * sig)  # 슬리피지 반영
            entry_date = ts

        equity_curve.append({"date": str(ts.date()), "equity": round(capital, 2)})
        max_equity = max(max_equity, capital)
        dd = (max_equity - capital) / max_equity
        max_drawdown = max(max_drawdown, dd)

    # 통계
    total_ret = (capital - params.initial_capital) / params.initial_capital
    days = (df.index[-1] - df.index[0]).days or 1
    ann_ret = (1 + total_ret) ** (365 / days) - 1

    returns = pd.Series([t["pnl_usd"] for t in trades])
    win_rate = (returns > 0).mean() if len(returns) > 0 else 0.0

    # 일별 수익률로 Sharpe 계산
    eq_series = pd.Series([e["equity"] for e in equity_curve])
    daily_ret = eq_series.pct_change().dropna()
    sharpe = (daily_ret.mean() / daily_ret.std() * np.sqrt(365)) if daily_ret.std() > 0 else 0.0

    return {
        "symbol": params.symbol,
        "strategy": params.strategy,
        "leverage": params.leverage,
        "period": params.period,
        "stats": {
            "initial_capital": params.initial_capital,
            "final_capital": round(capital, 2),
            "total_return_pct": round(total_ret * 100, 2),
            "annualized_return_pct": round(ann_ret * 100, 2),
            "max_drawdown_pct": round(max_drawdown * 100, 2),
            "sharpe_ratio": round(float(sharpe), 3),
            "win_rate_pct": round(float(win_rate) * 100, 1),
            "num_trades": len(trades),
            "funding_cost_total_usd": round(total_funding_cost, 2),
        },
        "equity_curve": equity_curve[-500:],  # 최근 500개
        "trades": trades[-100:],               # 최근 100건
    }


# ── 실시간 신호 ───────────────────────────────────────────────────────────────

def get_futures_signal(params: FuturesParams) -> dict:
    """
    현재 시점 신호 반환.

    리턴:
        signal: 1(롱) | -1(숏) | 0(중립)
        price: 최근 종가
        indicators: 전략별 보조지표 값
        suggested_order: 주문 파라미터 (side, qty, leverage)
    """
    df = _load_ohlcv(params.symbol, "3m")  # 최근 3개월
    signal_series = _get_signal_series(df, params)

    last_sig = int(signal_series.iloc[-1])
    last_price = float(df["close"].iloc[-1])

    indicators = {}
    if params.strategy == "sma_cross":
        indicators["sma_fast"] = round(df["close"].rolling(params.sma_fast).mean().iloc[-1], 4)
        indicators["sma_slow"] = round(df["close"].rolling(params.sma_slow).mean().iloc[-1], 4)
    elif params.strategy == "rsi_reversal":
        _, rsi = _rsi_signal(df, params.rsi_period, params.rsi_long, params.rsi_short)
        indicators["rsi"] = round(float(rsi.iloc[-1]), 2)

    # 권고 주문 (정보용, 실제 집행은 Spring Boot 측)
    suggested_order = None
    if last_sig != 0:
        suggested_order = {
            "symbol": params.symbol,
            "side": "BUY" if last_sig == 1 else "SELL",
            "type": "MARKET",
            "leverage": params.leverage,
            "reduce_only": False,
        }

    return {
        "symbol": params.symbol,
        "strategy": params.strategy,
        "signal": last_sig,
        "signal_text": {1: "LONG", -1: "SHORT", 0: "NEUTRAL"}[last_sig],
        "price": last_price,
        "indicators": indicators,
        "suggested_order": suggested_order,
    }
