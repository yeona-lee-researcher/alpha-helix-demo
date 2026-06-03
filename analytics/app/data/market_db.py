"""
MarketData DB 레이어 — MariaDB에 시계열 OHLCV + 매크로 팩터 저장/조회.

Phase 2에서 TimescaleDB 교체 시 이 파일만 바꾸면 됨 (인터페이스 동일).

테이블 구조:
  market_ohlcv      : OHLCV 일봉/분봉 (symbol + date 복합 인덱스)
  market_macro      : FRED 매크로 팩터 (series_id + date)
  market_data_log   : 수집 로그 (에러 추적용)
"""
from __future__ import annotations
import logging
import os
from datetime import datetime
from typing import Optional

import pandas as pd

log = logging.getLogger(__name__)

# DB 연결 (analytics 서비스 내에서 직접 MariaDB 접근)
_DB_URL = (
    f"mysql+pymysql://"
    f"{os.getenv('DB_USERNAME','devbridge')}:"
    f"{os.getenv('DB_PASSWORD','changeme')}@"
    f"{os.getenv('DB_HOST','localhost')}:"
    f"{os.getenv('DB_PORT','3306')}/"
    f"{os.getenv('DB_NAME','devbridge_db')}"
)

_engine = None


def _get_engine():
    global _engine
    if _engine is None:
        try:
            from sqlalchemy import create_engine
            _engine = create_engine(
                _DB_URL,
                pool_pre_ping=True,
                pool_recycle=3600,
                connect_args={"charset": "utf8mb4"},
            )
            _ensure_tables()
        except Exception as e:
            log.error("DB engine init failed: %s", e)
            raise
    return _engine


_TABLES_CREATED = False


def _ensure_tables():
    """필요한 테이블이 없으면 자동 생성."""
    global _TABLES_CREATED
    if _TABLES_CREATED:
        return

    eng = _get_engine()
    ddl = """
    CREATE TABLE IF NOT EXISTS market_ohlcv (
        id          BIGINT        NOT NULL AUTO_INCREMENT,
        ts          DATETIME      NOT NULL COMMENT '봉 시작 시각 (UTC)',
        symbol      VARCHAR(30)   NOT NULL,
        source      VARCHAR(20)   NOT NULL COMMENT 'polygon|binance|yfinance|kis',
        tf          VARCHAR(10)   NOT NULL DEFAULT '1d' COMMENT '타임프레임: 1d, 1h, 15m …',
        open        DOUBLE,
        high        DOUBLE,
        low         DOUBLE,
        close       DOUBLE,
        volume      DOUBLE,
        vwap        DOUBLE,
        quote_vol   DOUBLE,
        created_at  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        UNIQUE KEY uq_ohlcv (symbol, source, tf, ts),
        KEY idx_symbol_ts (symbol, ts)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
      COMMENT='시계열 OHLCV — Phase 2에서 TimescaleDB hypertable로 교체 예정';

    CREATE TABLE IF NOT EXISTS market_macro (
        id          BIGINT        NOT NULL AUTO_INCREMENT,
        ts          DATE          NOT NULL,
        series_id   VARCHAR(30)   NOT NULL COMMENT 'FRED 시리즈 ID (FEDFUNDS, DGS10 등)',
        value       DOUBLE,
        created_at  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        UNIQUE KEY uq_macro (series_id, ts),
        KEY idx_macro_ts (ts)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
      COMMENT='FRED 매크로 팩터';

    CREATE TABLE IF NOT EXISTS market_data_log (
        id          BIGINT        NOT NULL AUTO_INCREMENT,
        ts          DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
        source      VARCHAR(20)   NOT NULL,
        symbol      VARCHAR(30),
        action      VARCHAR(30)   NOT NULL,
        rows_upserted INT,
        error_msg   TEXT,
        PRIMARY KEY (id),
        KEY idx_log_ts (ts)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
      COMMENT='데이터 수집 로그';
    """
    with eng.begin() as conn:
        for stmt in ddl.strip().split(";"):
            stmt = stmt.strip()
            if stmt:
                conn.execute(__import__("sqlalchemy").text(stmt))
    _TABLES_CREATED = True
    log.info("market_data tables ensured")


# ─── OHLCV ────────────────────────────────────────────────────────────────────

def upsert_ohlcv(df: pd.DataFrame, tf: str = "1d") -> int:
    """
    OHLCV DataFrame을 DB에 upsert.
    df 필수 컬럼: timestamp(or date), symbol, source, open, high, low, close, volume
    Returns: upserted row count
    """
    if df.empty:
        return 0

    eng = _get_engine()
    df = df.copy()

    # timestamp 컬럼 통일
    ts_col = "timestamp" if "timestamp" in df.columns else "date"
    df["ts"] = pd.to_datetime(df[ts_col]).dt.tz_localize(None)  # UTC, tz-naive
    df["tf"] = tf
    if "vwap"      not in df.columns: df["vwap"]      = None
    if "quote_vol" not in df.columns: df["quote_vol"] = df.get("quote_volume")

    rows = df[["ts","symbol","source","tf","open","high","low","close","volume","vwap","quote_vol"]].to_dict("records")

    # INSERT IGNORE + UPDATE on duplicate
    sql = """
    INSERT INTO market_ohlcv (ts, symbol, source, tf, open, high, low, close, volume, vwap, quote_vol)
    VALUES (:ts,:symbol,:source,:tf,:open,:high,:low,:close,:volume,:vwap,:quote_vol)
    ON DUPLICATE KEY UPDATE
      open=VALUES(open), high=VALUES(high), low=VALUES(low),
      close=VALUES(close), volume=VALUES(volume),
      vwap=VALUES(vwap), quote_vol=VALUES(quote_vol)
    """
    from sqlalchemy import text
    with eng.begin() as conn:
        conn.execute(text(sql), rows)

    _log_action("ohlcv", df["source"].iloc[0] if len(df) else "?", df["symbol"].iloc[0] if len(df) else "?", len(df))
    log.info("upsert_ohlcv %s %s tf=%s rows=%d", df["symbol"].iloc[0] if len(df) else "?", df["source"].iloc[0] if len(df) else "?", tf, len(df))
    return len(df)


def query_ohlcv(
    symbol: str,
    tf: str = "1d",
    source: Optional[str] = None,
    start: Optional[str] = None,
    end: Optional[str] = None,
    limit: int = 1000,
) -> pd.DataFrame:
    """OHLCV 조회. Returns DataFrame(ts, symbol, source, tf, open, high, low, close, volume)."""
    eng = _get_engine()
    from sqlalchemy import text

    where = ["symbol = :symbol", "tf = :tf"]
    params: dict = {"symbol": symbol.upper(), "tf": tf, "limit": limit}
    if source:
        where.append("source = :source")
        params["source"] = source
    if start:
        where.append("ts >= :start")
        params["start"] = start
    if end:
        where.append("ts <= :end")
        params["end"] = end

    sql = f"SELECT ts, symbol, source, tf, open, high, low, close, volume, vwap FROM market_ohlcv WHERE {' AND '.join(where)} ORDER BY ts DESC LIMIT :limit"
    with eng.connect() as conn:
        df = pd.read_sql(text(sql), conn, params=params)
    return df.sort_values("ts").reset_index(drop=True)


def latest_close(symbol: str, source: Optional[str] = None, tf: str = "1d") -> Optional[float]:
    """최신 종가 단일 값 반환."""
    df = query_ohlcv(symbol, tf=tf, source=source, limit=1)
    return float(df["close"].iloc[0]) if not df.empty else None


# ─── Macro Factors ────────────────────────────────────────────────────────────

def upsert_macro(df: pd.DataFrame) -> int:
    """
    FRED 매크로 데이터 upsert.
    df 필수 컬럼: date, series_id, value
    """
    if df.empty:
        return 0

    eng = _get_engine()
    df = df.copy()
    df["ts"] = pd.to_datetime(df["date"]).dt.date
    rows = df[["ts","series_id","value"]].to_dict("records")

    from sqlalchemy import text
    sql = """
    INSERT INTO market_macro (ts, series_id, value)
    VALUES (:ts, :series_id, :value)
    ON DUPLICATE KEY UPDATE value=VALUES(value)
    """
    with eng.begin() as conn:
        conn.execute(text(sql), rows)

    log.info("upsert_macro %d rows", len(df))
    return len(df)


def query_macro(
    series_ids: list[str],
    start: Optional[str] = None,
    end: Optional[str] = None,
) -> pd.DataFrame:
    """
    매크로 팩터 wide-format 조회.
    Returns DataFrame indexed by date with one column per series.
    """
    eng = _get_engine()
    from sqlalchemy import text

    placeholders = ", ".join(f":sid{i}" for i in range(len(series_ids)))
    params = {f"sid{i}": v for i, v in enumerate(series_ids)}
    where = [f"series_id IN ({placeholders})"]
    if start:
        where.append("ts >= :start")
        params["start"] = start
    if end:
        where.append("ts <= :end")
        params["end"] = end

    sql = f"SELECT ts, series_id, value FROM market_macro WHERE {' AND '.join(where)} ORDER BY ts"
    with eng.connect() as conn:
        df = pd.read_sql(text(sql), conn, params=params)

    if df.empty:
        return pd.DataFrame()
    return df.pivot(index="ts", columns="series_id", values="value")


# ─── Log ──────────────────────────────────────────────────────────────────────

def _log_action(action: str, source: str, symbol: str, rows: int, error: str = None):
    try:
        from sqlalchemy import text
        eng = _get_engine()
        with eng.begin() as conn:
            conn.execute(text(
                "INSERT INTO market_data_log (source, symbol, action, rows_upserted, error_msg)"
                " VALUES (:source,:symbol,:action,:rows,:error)"
            ), {"source": source, "symbol": symbol, "action": action, "rows": rows, "error": error})
    except Exception:
        pass  # 로그 실패는 무시


def get_collection_stats() -> list[dict]:
    """각 소스/심볼별 최신 데이터 타임스탬프 + 행 수 요약."""
    try:
        eng = _get_engine()
        from sqlalchemy import text
        sql = """
        SELECT source, symbol, tf,
               COUNT(*) as total_rows,
               MIN(ts) as oldest,
               MAX(ts) as latest
        FROM market_ohlcv
        GROUP BY source, symbol, tf
        ORDER BY source, symbol, tf
        """
        with eng.connect() as conn:
            df = pd.read_sql(text(sql), conn)
        return df.to_dict("records")
    except Exception as e:
        log.warning("get_collection_stats error: %s", e)
        return []
