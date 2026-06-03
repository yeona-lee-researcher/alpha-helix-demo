"""
FRED (Federal Reserve Economic Data) client — 매크로 팩터 수집.

환경변수:
  FRED_API_KEY : FRED API 키 (https://fred.stlouisfed.org/docs/api/api_key.html 에서 무료 발급)

주요 시리즈:
  FEDFUNDS  : 기준금리 (Federal Funds Rate)
  DGS10     : 미국 10년물 국채 금리
  DGS2      : 미국 2년물 국채 금리
  T10Y2Y    : 10Y-2Y 금리 스프레드 (역전 시 경기침체 선행 지표)
  VIXCLS    : CBOE VIX 변동성 지수 (일봉)
  CPIAUCSL  : CPI 소비자물가지수 (월봉)
  UNRATE    : 실업률 (월봉)
  DCOILWTICO: WTI 원유 가격 (일봉)
"""
from __future__ import annotations
import logging
import os
from typing import Optional

import httpx
import pandas as pd

log = logging.getLogger(__name__)

FRED_API_KEY = os.getenv("FRED_API_KEY", "")
BASE_URL = "https://api.stlouisfed.org/fred"
_TIMEOUT = 20.0


# 퀀트 regime 탐지에 필수적인 시리즈 목록
MACRO_SERIES = {
    "FEDFUNDS":   "기준금리 (%)",
    "DGS10":      "미국 10Y 국채 금리",
    "DGS2":       "미국 2Y 국채 금리",
    "T10Y2Y":     "10Y-2Y 스프레드 (역전 = 경기침체 신호)",
    "VIXCLS":     "CBOE VIX (일봉)",
    "CPIAUCSL":   "CPI 소비자물가 (월봉)",
    "UNRATE":     "실업률 (월봉)",
    "DCOILWTICO": "WTI 원유 ($/배럴)",
}


def available() -> bool:
    return bool(FRED_API_KEY)


def get_series(
    series_id: str,
    observation_start: str = "2010-01-01",
    observation_end: Optional[str] = None,
) -> pd.DataFrame:
    """
    FRED 시계열 데이터 조회.
    Returns DataFrame(date, series_id, value).
    """
    if not available():
        raise RuntimeError("FRED_API_KEY not set")

    params = {
        "series_id": series_id,
        "api_key": FRED_API_KEY,
        "file_type": "json",
        "observation_start": observation_start,
        "sort_order": "asc",
    }
    if observation_end:
        params["observation_end"] = observation_end

    try:
        resp = httpx.get(f"{BASE_URL}/series/observations", params=params, timeout=_TIMEOUT)
        resp.raise_for_status()
    except httpx.HTTPStatusError as e:
        raise RuntimeError(f"FRED HTTP {e.response.status_code}: {e.response.text}") from e

    observations = resp.json().get("observations", [])
    if not observations:
        return pd.DataFrame()

    df = pd.DataFrame(observations)[["date", "value"]]
    df["value"] = pd.to_numeric(df["value"], errors="coerce")
    df = df.dropna(subset=["value"])
    df["date"] = pd.to_datetime(df["date"])
    df["series_id"] = series_id
    df["description"] = MACRO_SERIES.get(series_id, series_id)
    return df[["date", "series_id", "description", "value"]].reset_index(drop=True)


def get_macro_bundle(
    start: str = "2015-01-01",
    series_ids: Optional[list[str]] = None,
) -> pd.DataFrame:
    """
    여러 FRED 시리즈를 한꺼번에 조회해 wide-format DataFrame으로 반환.
    Returns DataFrame indexed by date with one column per series.
    """
    if not available():
        raise RuntimeError("FRED_API_KEY not set")

    if series_ids is None:
        series_ids = list(MACRO_SERIES.keys())

    frames = []
    for sid in series_ids:
        try:
            df = get_series(sid, observation_start=start)
            if not df.empty:
                df = df.set_index("date")["value"].rename(sid)
                frames.append(df)
        except Exception as e:
            log.warning("FRED series %s failed: %s", sid, e)

    if not frames:
        return pd.DataFrame()

    wide = pd.concat(frames, axis=1).sort_index()
    # 10Y-2Y 스프레드 자체 계산 (T10Y2Y가 없을 경우 fallback)
    if "DGS10" in wide.columns and "DGS2" in wide.columns and "T10Y2Y" not in wide.columns:
        wide["T10Y2Y"] = wide["DGS10"] - wide["DGS2"]

    return wide
