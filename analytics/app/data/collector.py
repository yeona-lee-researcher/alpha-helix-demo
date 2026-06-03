"""
데이터 수집 스케줄러 — Polygon.io, FRED, Binance 데이터를 주기적으로 수집해 DB에 저장.

스케줄:
  - OHLCV 일봉    : 매일 06:00 UTC (미국 시장 종가 확정 후)
  - 매크로(FRED)  : 매일 07:00 UTC
  - Binance 코인  : 매 1시간
  - 전체 초기 수집 : 서버 시작 시 (누락 구간 채우기)
"""
from __future__ import annotations
import logging
import threading
import time
from datetime import date, timedelta

from app.data import polygon_client, fred_client, binance_client, market_db

log = logging.getLogger(__name__)

# ── 수집 대상 심볼 ─────────────────────────────────────────────────────────────

US_SYMBOLS = [
    # 레버리지 ETF
    "TQQQ", "SOXL", "UPRO", "QLD", "TNA", "LABU",
    # 벤치마크
    "SPY", "QQQ",
    # 채권/원자재/방어
    "TLT", "GLD", "SHY", "SCHD",
]

CRYPTO_SYMBOLS = [
    "BTCUSDT", "ETHUSDT", "SOLUSDT", "BNBUSDT", "DOGEUSDT",
]

FRED_SERIES = [
    "FEDFUNDS",   # 기준금리
    "DGS10",      # 10Y 국채
    "DGS2",       # 2Y 국채
    "T10Y2Y",     # 10Y-2Y 스프레드
    "VIXCLS",     # VIX (일봉)
    "CPIAUCSL",   # CPI (월봉)
    "UNRATE",     # 실업률
    "DCOILWTICO", # WTI 원유
]

_scheduler_thread: threading.Thread | None = None
_running = False


# ── 개별 수집 함수 ──────────────────────────────────────────────────────────────

def collect_us_ohlcv(symbols: list[str] = None, days_back: int = 7) -> dict:
    """Polygon.io에서 US ETF 일봉 수집."""
    if not polygon_client.available():
        return {"skipped": True, "reason": "POLYGON_API_KEY not set"}

    symbols = symbols or US_SYMBOLS
    end_date = date.today().isoformat()
    start_date = (date.today() - timedelta(days=days_back)).isoformat()

    results = {}
    for sym in symbols:
        try:
            df = polygon_client.get_daily_bars(sym, start_date, end_date)
            if not df.empty:
                n = market_db.upsert_ohlcv(df, tf="1d")
                results[sym] = {"rows": n, "ok": True}
            else:
                results[sym] = {"rows": 0, "ok": True}
        except Exception as e:
            log.warning("collect_us_ohlcv %s error: %s", sym, e)
            results[sym] = {"ok": False, "error": str(e)}

    log.info("collect_us_ohlcv done: %d symbols", len(results))
    return results


def collect_macro(series_ids: list[str] = None, days_back: int = 30) -> dict:
    """FRED에서 매크로 지표 수집."""
    if not fred_client.available():
        return {"skipped": True, "reason": "FRED_API_KEY not set"}

    series_ids = series_ids or FRED_SERIES
    start = (date.today() - timedelta(days=days_back)).isoformat()

    results = {}
    for sid in series_ids:
        try:
            df = fred_client.get_series(sid, observation_start=start)
            if not df.empty:
                n = market_db.upsert_macro(df)
                results[sid] = {"rows": n, "ok": True}
        except Exception as e:
            log.warning("collect_macro %s error: %s", sid, e)
            results[sid] = {"ok": False, "error": str(e)}

    log.info("collect_macro done: %d series", len(results))
    return results


def collect_crypto_ohlcv(symbols: list[str] = None, days_back: int = 7, interval: str = "1d") -> dict:
    """Binance에서 코인 OHLCV 수집."""
    symbols = symbols or CRYPTO_SYMBOLS
    start_date = (date.today() - timedelta(days=days_back)).isoformat()

    results = {}
    for sym in symbols:
        try:
            df = binance_client.get_klines_full(sym, interval=interval, start_date=start_date)
            if not df.empty:
                n = market_db.upsert_ohlcv(df, tf=interval)
                results[sym] = {"rows": n, "ok": True}
        except Exception as e:
            log.warning("collect_crypto %s error: %s", sym, e)
            results[sym] = {"ok": False, "error": str(e)}

    log.info("collect_crypto done: %d symbols", len(results))
    return results


def full_initial_load(years_back: int = 5) -> dict:
    """
    초기 전체 수집 — 서버 시작 시 누락 구간 채우기.
    Polygon / FRED는 키가 있을 때만 실행.
    Binance는 항상 실행 (공개 API).
    """
    log.info("full_initial_load start (years_back=%d)", years_back)
    start_date = (date.today() - timedelta(days=365 * years_back)).isoformat()

    results: dict = {}

    # 1) Polygon US 주식
    if polygon_client.available():
        end_date = date.today().isoformat()
        for sym in US_SYMBOLS:
            try:
                df = polygon_client.get_daily_bars(sym, start_date, end_date)
                if not df.empty:
                    n = market_db.upsert_ohlcv(df, tf="1d")
                    results[f"polygon_{sym}"] = n
                    log.info("initial load polygon %s: %d rows", sym, n)
            except Exception as e:
                log.warning("initial load polygon %s: %s", sym, e)
                results[f"polygon_{sym}"] = f"error: {e}"

    # 2) FRED 매크로
    if fred_client.available():
        for sid in FRED_SERIES:
            try:
                df = fred_client.get_series(sid, observation_start=start_date)
                if not df.empty:
                    n = market_db.upsert_macro(df)
                    results[f"fred_{sid}"] = n
            except Exception as e:
                log.warning("initial load fred %s: %s", sid, e)
                results[f"fred_{sid}"] = f"error: {e}"

    # 3) Binance 코인 (공개 API — 항상 실행)
    for sym in CRYPTO_SYMBOLS:
        try:
            df = binance_client.get_klines_full(sym, interval="1d", start_date=start_date)
            if not df.empty:
                n = market_db.upsert_ohlcv(df, tf="1d")
                results[f"binance_{sym}"] = n
                log.info("initial load binance %s: %d rows", sym, n)
        except Exception as e:
            log.warning("initial load binance %s: %s", sym, e)
            results[f"binance_{sym}"] = f"error: {e}"

    log.info("full_initial_load done: %d items", len(results))
    return results


# ── 스케줄러 루프 ──────────────────────────────────────────────────────────────

def _scheduler_loop():
    """백그라운드 수집 루프 (UTC 시간 기준)."""
    import time as _time
    from datetime import datetime, timezone

    log.info("data collection scheduler started")

    last_daily_date = None
    last_macro_date = None
    last_crypto_hour = None

    while _running:
        now = datetime.now(timezone.utc)

        # 일봉 수집: 매일 06:00 UTC
        if now.hour == 6 and last_daily_date != now.date():
            try:
                collect_us_ohlcv(days_back=3)
                collect_crypto_ohlcv(days_back=3)
            except Exception as e:
                log.error("daily ohlcv collect error: %s", e)
            last_daily_date = now.date()

        # 매크로 수집: 매일 07:00 UTC
        if now.hour == 7 and last_macro_date != now.date():
            try:
                collect_macro(days_back=7)
            except Exception as e:
                log.error("macro collect error: %s", e)
            last_macro_date = now.date()

        # 코인 1시간봉: 매 시간
        if last_crypto_hour != now.hour:
            try:
                collect_crypto_ohlcv(days_back=1, interval="1h")
            except Exception as e:
                log.error("crypto 1h collect error: %s", e)
            last_crypto_hour = now.hour

        _time.sleep(60)  # 1분마다 체크


def start_scheduler():
    """수집 스케줄러 시작 (백그라운드 데몬 스레드)."""
    global _scheduler_thread, _running

    if _running:
        log.warning("scheduler already running")
        return

    _running = True

    # 초기 로드는 별도 스레드에서 비동기로 실행 (서버 시작 block 방지)
    def _initial():
        try:
            full_initial_load(years_back=5)
        except Exception as e:
            log.error("full_initial_load error: %s", e)

    threading.Thread(target=_initial, daemon=True, name="data-initial-load").start()

    _scheduler_thread = threading.Thread(target=_scheduler_loop, daemon=True, name="data-scheduler")
    _scheduler_thread.start()
    log.info("data collection scheduler thread started")


def stop_scheduler():
    global _running
    _running = False
    log.info("data collection scheduler stopped")
