"""
Polygon.io REST client — US 주식 OHLCV + 실시간 최종 가격.

환경변수:
  POLYGON_API_KEY  : Polygon.io API 키 (무료 키로도 사용 가능, 지연 15분)

API 문서: https://polygon.io/docs/stocks
"""
from __future__ import annotations
import logging
import os
from datetime import datetime, timedelta, date
from typing import Optional

import httpx
import pandas as pd

log = logging.getLogger(__name__)

POLYGON_API_KEY = os.getenv("POLYGON_API_KEY", "")
BASE_URL = "https://api.polygon.io"
_CLIENT_TIMEOUT = 20.0  # seconds


def _headers() -> dict:
    return {"Authorization": f"Bearer {POLYGON_API_KEY}"}


def available() -> bool:
    return bool(POLYGON_API_KEY)


def get_daily_bars(
    symbol: str,
    from_date: str,
    to_date: str,
    adjusted: bool = True,
) -> pd.DataFrame:
    """
    일봉 OHLCV 조회.
    Returns DataFrame(date, open, high, low, close, volume, vwap).
    """
    if not available():
        raise RuntimeError("POLYGON_API_KEY not set")

    symbol = symbol.upper()
    url = f"{BASE_URL}/v2/aggs/ticker/{symbol}/range/1/day/{from_date}/{to_date}"
    params = {
        "adjusted": "true" if adjusted else "false",
        "sort": "asc",
        "limit": 50000,
    }

    try:
        resp = httpx.get(url, headers=_headers(), params=params, timeout=_CLIENT_TIMEOUT)
        resp.raise_for_status()
    except httpx.HTTPStatusError as e:
        raise RuntimeError(f"Polygon HTTP error {e.response.status_code}: {e.response.text}") from e

    data = resp.json()
    results = data.get("results", [])
    if not results:
        return pd.DataFrame()

    df = pd.DataFrame(results)
    # t = Unix ms timestamp
    df["date"] = pd.to_datetime(df["t"], unit="ms", utc=True).dt.tz_convert("America/New_York").dt.normalize().dt.tz_localize(None)
    df = df.rename(columns={"o": "open", "h": "high", "l": "low", "c": "close", "v": "volume", "vw": "vwap"})
    df["symbol"] = symbol
    df["source"] = "polygon"
    return df[["date", "symbol", "source", "open", "high", "low", "close", "volume", "vwap"]].copy()


def get_latest_quote(symbol: str) -> Optional[dict]:
    """
    종목 최신 가격 (직전 종가 + 전일 대비).
    Returns: {symbol, price, change_pct, updated_at}
    """
    if not available():
        return None

    symbol = symbol.upper()
    url = f"{BASE_URL}/v2/snapshot/locale/us/markets/stocks/tickers/{symbol}"
    try:
        resp = httpx.get(url, headers=_headers(), timeout=_CLIENT_TIMEOUT)
        resp.raise_for_status()
        ticker = resp.json().get("ticker", {})
        day = ticker.get("day", {})
        prev_day = ticker.get("prevDay", {})
        close = day.get("c") or prev_day.get("c")
        prev_close = prev_day.get("c")
        change_pct = ((close - prev_close) / prev_close * 100) if close and prev_close else None
        return {
            "symbol": symbol,
            "price": close,
            "change_pct": round(change_pct, 2) if change_pct is not None else None,
            "updated_at": datetime.utcnow().isoformat(),
        }
    except Exception as e:
        log.warning("Polygon quote error %s: %s", symbol, e)
        return None


def get_intraday_bars(
    symbol: str,
    multiplier: int = 1,
    timespan: str = "minute",
    from_date: str | None = None,
    to_date: str | None = None,
) -> pd.DataFrame:
    """
    분봉/시간봉 조회.
    timespan: 'minute' | 'hour' | 'day'
    """
    if not available():
        raise RuntimeError("POLYGON_API_KEY not set")

    symbol = symbol.upper()
    if not from_date:
        from_date = (date.today() - timedelta(days=1)).isoformat()
    if not to_date:
        to_date = date.today().isoformat()

    url = f"{BASE_URL}/v2/aggs/ticker/{symbol}/range/{multiplier}/{timespan}/{from_date}/{to_date}"
    params = {"adjusted": "true", "sort": "asc", "limit": 50000}

    try:
        resp = httpx.get(url, headers=_headers(), params=params, timeout=_CLIENT_TIMEOUT)
        resp.raise_for_status()
    except httpx.HTTPStatusError as e:
        raise RuntimeError(f"Polygon HTTP error {e.response.status_code}") from e

    results = resp.json().get("results", [])
    if not results:
        return pd.DataFrame()

    df = pd.DataFrame(results)
    df["timestamp"] = pd.to_datetime(df["t"], unit="ms", utc=True)
    df = df.rename(columns={"o": "open", "h": "high", "l": "low", "c": "close", "v": "volume", "vw": "vwap"})
    df["symbol"] = symbol
    df["source"] = "polygon"
    return df[["timestamp", "symbol", "source", "open", "high", "low", "close", "volume", "vwap"]].copy()
