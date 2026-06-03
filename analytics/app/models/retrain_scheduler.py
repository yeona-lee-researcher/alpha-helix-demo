"""
XGBoost 모델 자동 재학습 스케줄러.

실행 방식:
  1) FastAPI lifespan 이벤트로 백그라운드 스레드에서 실행 (기본)
  2) 독립 실행: python -m app.models.retrain_scheduler

스케줄:
  - 매일 22:30 KST (13:30 UTC) — 미국 장 마감(22:00) 이후 30분 뒤
  - 주말/공휴일 관계없이 실행 (데이터 변화 없으면 joblib 캐시 재사용)

재학습 대상:
  - MODEL_DIR에 존재하는 모든 xgb_*.joblib 파일 (기존 학습 티커)
  - 항상 기본 우주(DEFAULT_UNIVERSE)의 주요 종목도 포함
"""
from __future__ import annotations
import logging
import threading
import time
from datetime import datetime, timezone, timedelta
from pathlib import Path

from app.config import MODEL_DIR, DEFAULT_UNIVERSE
from app.data.yf_client import get_history
from app.models.xgb_signal import train_model

log = logging.getLogger("alpha-helix.retrain")

# KST = UTC+9
KST = timezone(timedelta(hours=9))

# 재학습 기본 대상 (레버리지 ETF + 벤치마크)
PRIORITY_TICKERS = [
    "TQQQ", "SOXL", "QQQ", "SPY", "QLD",
    "TECL", "UPRO", "SCHD", "TLT", "GLD",
]

# 재학습 간격 체크 주기 (초)
_POLL_INTERVAL_SEC = 60

# 마지막 재학습 날짜 (날짜 기반 중복 방지)
_last_retrain_date: str | None = None
_lock = threading.Lock()


def _get_trained_tickers() -> list[str]:
    """MODEL_DIR의 xgb_*.joblib 파일에서 티커 목록 추출."""
    tickers = []
    for p in MODEL_DIR.glob("xgb_*.joblib"):
        ticker = p.stem.replace("xgb_", "")
        tickers.append(ticker)
    return list(set(PRIORITY_TICKERS + tickers))


def retrain_all(force: bool = False) -> dict:
    """
    대상 티커 전체 재학습.
    force=False면 오늘 이미 재학습한 경우 skip.
    """
    global _last_retrain_date
    today = datetime.now(KST).strftime("%Y-%m-%d")

    with _lock:
        if not force and _last_retrain_date == today:
            log.info("retrain skip — already done today (%s)", today)
            return {"status": "skipped", "reason": "already_done_today", "date": today}

        tickers = _get_trained_tickers()
        log.info("XGBoost retrain START — %d tickers: %s", len(tickers), tickers)
        results = {}
        for ticker in tickers:
            try:
                # 암호화폐/VIX는 XGBoost 신호에서 제외
                if ticker in ("^VIX", "BTC-USD", "ETH-USD"):
                    continue
                df = get_history(ticker, period="5y", interval="1d", force_refresh=True)
                result = train_model(df, ticker)
                results[ticker] = result
                log.info("retrained %s — samples=%d cv_acc=%.3f",
                         ticker, result.get("samples", 0),
                         result.get("cv_avg", {}).get("accuracy", 0))
            except Exception as e:
                log.error("retrain failed %s: %s", ticker, e)
                results[ticker] = {"error": str(e)}

        _last_retrain_date = today
        success = sum(1 for v in results.values() if "error" not in v)
        log.info("XGBoost retrain DONE — %d/%d success", success, len(results))
        return {
            "status": "done",
            "date": today,
            "total": len(results),
            "success": success,
            "results": results,
        }


def _should_retrain_now() -> bool:
    """22:30 KST ±1분 이내인지 확인."""
    now = datetime.now(KST)
    return now.hour == 22 and 30 <= now.minute <= 31


def _scheduler_loop():
    """백그라운드 스레드 루프 — 매 분 시각 체크."""
    log.info("XGBoost retrain scheduler started (polls every %ds)", _POLL_INTERVAL_SEC)
    while True:
        try:
            if _should_retrain_now():
                retrain_all()
        except Exception as e:
            log.error("scheduler loop error: %s", e)
        time.sleep(_POLL_INTERVAL_SEC)


def start_scheduler():
    """FastAPI lifespan 등에서 호출 — 데몬 스레드로 스케줄러 시작."""
    t = threading.Thread(target=_scheduler_loop, daemon=True, name="xgb-retrain")
    t.start()
    log.info("retrain scheduler thread started")
    return t


if __name__ == "__main__":
    import sys
    logging.basicConfig(level=logging.INFO)
    force = "--force" in sys.argv
    result = retrain_all(force=force)
    import json
    print(json.dumps(result, ensure_ascii=False, indent=2))
