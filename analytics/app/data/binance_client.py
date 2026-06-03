"""
Binance Public REST client — 인증 불필요 (Public API).
코인 OHLCV, 오더북, 펀딩레이트, 시장 개요.

환경변수:
  BINANCE_API_KEY    : (선택) 계정 주문 발행 시 필요
  BINANCE_API_SECRET : (선택) 계정 주문 발행 시 필요
  BINANCE_TESTNET    : "1" 이면 testnet 사용

Public API는 키 없이 사용 가능 (IP당 분당 1200 req 제한).
"""
from __future__ import annotations
import hashlib
import hmac
import logging
import os
import time
from datetime import datetime, timezone
from typing import Optional
from urllib.parse import urlencode

import httpx
import pandas as pd

log = logging.getLogger(__name__)

BINANCE_API_KEY    = os.getenv("BINANCE_API_KEY", "")
BINANCE_API_SECRET = os.getenv("BINANCE_API_SECRET", "")
_USE_TESTNET       = os.getenv("BINANCE_TESTNET", "0") == "1"

# BINANCE_BASE_URL 환경변수로 거래소 선택:
#   https://api.binance.us  — 미국 규제 준수 (AWS us-east 기본값)
#   https://api.binance.com — 글로벌 (미국 IP에서 HTTP 451 차단됨)
_BINANCE_BASE_URL = os.getenv("BINANCE_BASE_URL", "https://api.binance.us")
_BASE_URL      = "https://testnet.binance.vision" if _USE_TESTNET else _BINANCE_BASE_URL
_BASE_URL_FAPI = "https://testnet.binancefuture.com" if _USE_TESTNET else "https://fapi.binance.com"  # Futures (미국 미지원, yfinance fallback 사용)
_TIMEOUT = 20.0

# 자주 사용하는 심볼 매핑 (편의용)
SPOT_SYMBOLS = {
    "BTC":  "BTCUSDT",
    "ETH":  "ETHUSDT",
    "SOL":  "SOLUSDT",
    "BNB":  "BNBUSDT",
    "DOGE": "DOGEUSDT",
}

INTERVAL_MAP = {
    "1m": "1m", "5m": "5m", "15m": "15m", "30m": "30m",
    "1h": "1h", "4h": "4h", "1d": "1d", "1w": "1w",
}


# ─── Public API (인증 불필요) ────────────────────────────────────────────────


def ping() -> bool:
    """Binance API 서버 연결 확인."""
    try:
        resp = httpx.get(f"{_BASE_URL}/api/v3/ping", timeout=5)
        return resp.status_code == 200
    except Exception:
        return False


def get_klines(
    symbol: str,
    interval: str = "1d",
    limit: int = 500,
    start_time_ms: Optional[int] = None,
    end_time_ms: Optional[int] = None,
) -> pd.DataFrame:
    """
    OHLCV 캔들스틱 조회 (최대 1000봉, 무인증).
    symbol: e.g. 'BTCUSDT'
    interval: '1m','5m','15m','30m','1h','4h','1d','1w'
    Returns DataFrame(timestamp, symbol, source, open, high, low, close, volume, quote_volume).
    """
    symbol = symbol.upper()
    params: dict = {"symbol": symbol, "interval": interval, "limit": min(limit, 1000)}
    if start_time_ms:
        params["startTime"] = start_time_ms
    if end_time_ms:
        params["endTime"] = end_time_ms

    try:
        resp = httpx.get(f"{_BASE_URL}/api/v3/klines", params=params, timeout=_TIMEOUT)
        resp.raise_for_status()
    except httpx.HTTPStatusError as e:
        raise RuntimeError(f"Binance klines HTTP {e.response.status_code}: {e.response.text}") from e

    raw = resp.json()
    if not raw:
        return pd.DataFrame()

    df = pd.DataFrame(raw, columns=[
        "open_time", "open", "high", "low", "close", "volume",
        "close_time", "quote_volume", "trades", "taker_buy_base",
        "taker_buy_quote", "ignore",
    ])
    df["timestamp"] = pd.to_datetime(df["open_time"], unit="ms", utc=True)
    for col in ["open", "high", "low", "close", "volume", "quote_volume"]:
        df[col] = pd.to_numeric(df[col])
    df["symbol"] = symbol
    df["source"] = "binance"
    return df[["timestamp", "symbol", "source", "open", "high", "low", "close", "volume", "quote_volume"]].copy()


def get_klines_full(
    symbol: str,
    interval: str = "1d",
    start_date: str = "2020-01-01",
    end_date: Optional[str] = None,
) -> pd.DataFrame:
    """
    분할 요청으로 긴 기간 OHLCV 전체 수집 (페이지네이션).
    """
    symbol = symbol.upper()
    start_ms = int(pd.Timestamp(start_date, tz="UTC").timestamp() * 1000)
    end_ms = int(pd.Timestamp(end_date, tz="UTC").timestamp() * 1000) if end_date else int(time.time() * 1000)

    frames = []
    cur = start_ms
    while cur < end_ms:
        df = get_klines(symbol, interval=interval, limit=1000, start_time_ms=cur, end_time_ms=end_ms)
        if df.empty:
            break
        frames.append(df)
        last_ts = int(df["timestamp"].iloc[-1].timestamp() * 1000)
        if last_ts <= cur:
            break
        cur = last_ts + 1
        # Avoid rate limit
        time.sleep(0.1)

    return pd.concat(frames, ignore_index=True) if frames else pd.DataFrame()


def get_orderbook(symbol: str, depth: int = 20) -> dict:
    """
    오더북 (호가창) 조회.
    Returns: {symbol, bids: [[price, qty]...], asks: [[price, qty]...], timestamp}
    depth: 5, 10, 20, 50, 100, 500, 1000
    """
    symbol = symbol.upper()
    resp = httpx.get(f"{_BASE_URL}/api/v3/depth",
                     params={"symbol": symbol, "limit": depth},
                     timeout=_TIMEOUT)
    resp.raise_for_status()
    data = resp.json()
    return {
        "symbol": symbol,
        "bids": [[float(p), float(q)] for p, q in data["bids"]],
        "asks": [[float(p), float(q)] for p, q in data["asks"]],
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


def get_ticker_24h(symbol: str) -> dict:
    """24시간 통계 (가격 변화, 거래량, 최고/최저)."""
    symbol = symbol.upper()
    resp = httpx.get(f"{_BASE_URL}/api/v3/ticker/24hr",
                     params={"symbol": symbol}, timeout=_TIMEOUT)
    resp.raise_for_status()
    d = resp.json()
    return {
        "symbol": d["symbol"],
        "price": float(d["lastPrice"]),
        "change_pct": float(d["priceChangePercent"]),
        "high_24h": float(d["highPrice"]),
        "low_24h":  float(d["lowPrice"]),
        "volume_24h": float(d["volume"]),
        "quote_volume_24h": float(d["quoteVolume"]),
    }


def get_funding_rate(symbol: str = "BTCUSDT", limit: int = 100) -> pd.DataFrame:
    """
    선물(Futures) 펀딩레이트 조회 — 선물 과열/침체 지표.
    양수 = 롱 과열, 음수 = 숏 과열.
    """
    symbol = symbol.upper()
    resp = httpx.get(
        f"{_BASE_URL_FAPI}/fapi/v1/fundingRate",
        params={"symbol": symbol, "limit": limit},
        timeout=_TIMEOUT
    )
    resp.raise_for_status()
    data = resp.json()
    if not data:
        return pd.DataFrame()
    df = pd.DataFrame(data)
    df["timestamp"] = pd.to_datetime(df["fundingTime"], unit="ms", utc=True)
    df["funding_rate"] = pd.to_numeric(df["fundingRate"])
    df["symbol"] = symbol
    return df[["timestamp", "symbol", "funding_rate"]].copy()


# ─── Private API (BINANCE_API_KEY + SECRET 필요) ─────────────────────────────


def _sign(params: dict) -> dict:
    """HMAC-SHA256 서명 추가."""
    if not BINANCE_API_SECRET:
        raise RuntimeError("BINANCE_API_SECRET not set")
    query = urlencode(params)
    sig = hmac.new(BINANCE_API_SECRET.encode(), query.encode(), hashlib.sha256).hexdigest()
    params["signature"] = sig
    return params


def _auth_headers() -> dict:
    if not BINANCE_API_KEY:
        raise RuntimeError("BINANCE_API_KEY not set")
    return {"X-MBX-APIKEY": BINANCE_API_KEY}


def get_account_balance() -> list[dict]:
    """스팟 계좌 잔고 조회 (키 필요)."""
    params = _sign({"timestamp": int(time.time() * 1000)})
    resp = httpx.get(
        f"{_BASE_URL}/api/v3/account",
        headers=_auth_headers(),
        params=params,
        timeout=_TIMEOUT
    )
    resp.raise_for_status()
    balances = resp.json().get("balances", [])
    return [b for b in balances if float(b["free"]) > 0 or float(b["locked"]) > 0]


def place_spot_order(
    symbol: str,
    side: str,           # "BUY" | "SELL"
    order_type: str,     # "MARKET" | "LIMIT"
    quantity: float,
    price: Optional[float] = None,
    time_in_force: str = "GTC",
) -> dict:
    """
    스팟 주문 발행 (키 + 시크릿 필요).
    LIMIT 주문 시 price 필수.
    Returns: 체결 결과 dict.
    """
    params: dict = {
        "symbol": symbol.upper(),
        "side": side.upper(),
        "type": order_type.upper(),
        "quantity": quantity,
        "timestamp": int(time.time() * 1000),
    }
    if order_type.upper() == "LIMIT":
        if price is None:
            raise ValueError("LIMIT 주문에는 price 필수")
        params["price"] = price
        params["timeInForce"] = time_in_force

    params = _sign(params)
    resp = httpx.post(
        f"{_BASE_URL}/api/v3/order",
        headers=_auth_headers(),
        params=params,
        timeout=_TIMEOUT
    )
    resp.raise_for_status()
    return resp.json()


def place_futures_order(
    symbol: str,
    side: str,         # "BUY" | "SELL"
    order_type: str,   # "MARKET" | "LIMIT"
    quantity: float,
    price: Optional[float] = None,
    reduce_only: bool = False,
    time_in_force: str = "GTC",
) -> dict:
    """
    선물(Futures) 주문 발행 (키 + 시크릿 필요).
    선물은 레버리지, 롱/숏 모두 가능.
    """
    params: dict = {
        "symbol": symbol.upper(),
        "side": side.upper(),
        "type": order_type.upper(),
        "quantity": quantity,
        "reduceOnly": str(reduce_only).lower(),
        "timestamp": int(time.time() * 1000),
    }
    if order_type.upper() == "LIMIT":
        if price is None:
            raise ValueError("LIMIT 주문에는 price 필수")
        params["price"] = price
        params["timeInForce"] = time_in_force

    params = _sign(params)
    resp = httpx.post(
        f"{_BASE_URL_FAPI}/fapi/v1/order",
        headers=_auth_headers(),
        params=params,
        timeout=_TIMEOUT
    )
    resp.raise_for_status()
    return resp.json()
