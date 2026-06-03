"""
Market data client — Polygon.io 우선, yfinance 폴백.

POLYGON_API_KEY 설정 시 Polygon 데이터를 사용하고,
미설정 또는 오류 시 yfinance로 자동 폴백합니다.
"""
from __future__ import annotations
import logging
import os
from datetime import datetime, timedelta, date
from pathlib import Path
from typing import Optional

import pandas as pd
import yfinance as yf

from app.config import CACHE_DIR, PRICE_CACHE_TTL_MIN

log = logging.getLogger(__name__)

OFFLINE_MODE = bool(int(os.getenv("ANALYTICS_OFFLINE_CACHE", "0")))


def _cache_path(ticker: str, interval: str, period: str = "max") -> Path:
    return CACHE_DIR / f"{ticker.upper()}_{interval}_{period}.parquet"


def _is_fresh(path: Path, ttl_min: int) -> bool:
    if not path.exists():
        return False
    mtime = datetime.fromtimestamp(path.stat().st_mtime)
    return (datetime.now() - mtime) < timedelta(minutes=ttl_min)


def _read_cache(path: Path, ticker: str) -> Optional[pd.DataFrame]:
    if not path.exists():
        return None
    try:
        df = pd.read_parquet(path)
        log.info("cache hit %s (%d rows)", ticker, len(df))
        return df
    except Exception as e:
        log.warning("cache read failed %s: %s", ticker, e)
        return None


def _period_to_dates(period: str) -> tuple[str, str]:
    """'5y' → (from_date, to_date) ISO 문자열 반환."""
    to_dt = date.today()
    mapping = {"1d": 1, "5d": 5, "1mo": 30, "3mo": 90, "6mo": 180,
               "1y": 365, "2y": 730, "5y": 1825, "10y": 3650,
               "15y": 5475, "20y": 7300, "25y": 9125, "30y": 10950,
               "ytd": 365, "max": 10950}
    days = mapping.get(period, 1825)
    from_dt = to_dt - timedelta(days=days)
    return from_dt.isoformat(), to_dt.isoformat()


def _fetch_polygon(ticker: str, period: str) -> Optional[pd.DataFrame]:
    """Polygon.io에서 일봉 OHLCV를 가져와 표준 포맷으로 반환."""
    try:
        from app.data.polygon_client import get_daily_bars, available
        if not available():
            return None
        from_date, to_date = _period_to_dates(period)
        raw = get_daily_bars(ticker, from_date, to_date)
        if raw.empty:
            log.warning("Polygon returned empty for %s", ticker)
            return None
        # polygon 컬럼 → 표준 OHLCV 포맷
        df = raw.rename(columns={
            "open": "Open", "high": "High", "low": "Low",
            "close": "Close", "volume": "Volume",
        })
        df = df.set_index("date")[["Open", "High", "Low", "Close", "Volume"]].copy()
        df.index = pd.to_datetime(df.index)
        df.dropna(inplace=True)
        log.info("Polygon fetch OK %s (%d rows)", ticker, len(df))
        return df
    except Exception as e:
        log.warning("Polygon fetch failed %s: %s — fallback to yfinance", ticker, e)
        return None


def _fetch_yfinance(ticker: str, period: str, interval: str) -> Optional[pd.DataFrame]:
    """yfinance에서 OHLCV를 가져와 표준 포맷으로 반환."""
    try:
        df = yf.download(
            ticker,
            period=period,
            interval=interval,
            auto_adjust=True,
            progress=False,
            threads=False,
        )
        if isinstance(df.columns, pd.MultiIndex):
            df.columns = df.columns.get_level_values(0)
        if df.empty:
            return None
        df.index = df.index.tz_localize(None) if df.index.tz else df.index
        df = df[["Open", "High", "Low", "Close", "Volume"]].copy()
        df.dropna(inplace=True)
        log.info("yfinance fetch OK %s (%d rows)", ticker, len(df))
        return df
    except Exception as e:
        log.warning("yfinance fetch failed %s: %s", ticker, e)
        return None


def _slice_to_period(df: pd.DataFrame, period: str) -> pd.DataFrame:
    """캐시에서 읽은 데이터를 요청 period에 맞게 자르는 안전장치."""
    if period in ("max",):
        return df
    try:
        from_str, _ = _period_to_dates(period)
        cutoff = pd.to_datetime(from_str)
        sliced = df[df.index >= cutoff]
        return sliced if not sliced.empty else df
    except Exception:
        return df


def get_history(
    ticker: str,
    period: str = "5y",
    interval: str = "1d",
    force_refresh: bool = False,
) -> pd.DataFrame:
    """
    OHLCV DataFrame 반환 (columns: Open, High, Low, Close, Volume).
    Index는 timezone-naive DatetimeIndex.

    데이터 우선순위:
      1) 캐시 (신선한 경우)
      2) Polygon.io (POLYGON_API_KEY 설정 시)
      3) yfinance (폴백)
      4) 오래된 캐시 (오류 시 최후 수단)
    """
    ticker = ticker.upper()
    path = _cache_path(ticker, interval, period)

    # OFFLINE_MODE: 캐시만 사용
    if OFFLINE_MODE:
        df = _read_cache(path, ticker)
        if df is not None and not df.empty:
            return _slice_to_period(df, period)
        raise ValueError(f"No cached data for ticker {ticker} (offline mode)")

    # 신선한 캐시가 있으면 바로 반환
    if not force_refresh and _is_fresh(path, PRICE_CACHE_TTL_MIN):
        df = _read_cache(path, ticker)
        if df is not None and not df.empty:
            return _slice_to_period(df, period)

    # 1순위: Polygon (일봉만 지원)
    df = None
    if interval == "1d":
        df = _fetch_polygon(ticker, period)

    # 2순위: yfinance
    if df is None or df.empty:
        df = _fetch_yfinance(ticker, period, interval)

    # 3순위: 오래된 캐시
    if df is None or df.empty:
        log.warning("all sources failed for %s — trying stale cache", ticker)
        df = _read_cache(path, ticker)
        if df is not None and not df.empty:
            return df
        raise ValueError(f"No data for ticker {ticker}")

    # 캐시에 저장
    try:
        df.to_parquet(path)
    except Exception as e:
        log.warning("cache write failed %s: %s", ticker, e)

    return df


def get_latest_close(ticker: str) -> float:
    df = get_history(ticker, period="5d", interval="1d")
    return float(df["Close"].iloc[-1])


def get_multiple(tickers: list[str], period: str = "5y") -> dict[str, pd.DataFrame]:
    """Bulk-fetch (sequential, cached)."""
    return {t: get_history(t, period=period) for t in tickers}
