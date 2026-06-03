#!/usr/bin/env python3
"""
Phase 2: MariaDB → TimescaleDB 마이그레이션 가이드 & 스크립트.

실행 방법:
  python migrate_timescaledb.py [--dry-run] [--export-only]

기존 MariaDB의 market_ohlcv, market_macro 데이터를 
TimescaleDB(PostgreSQL)로 이전합니다.
"""
from __future__ import annotations
import argparse
import logging
import os

log = logging.getLogger(__name__)

# ── TimescaleDB 연결 (PostgreSQL) ──────────────────────────────────────────────
TSDB_URL = os.getenv(
    "TIMESCALEDB_URL",
    "postgresql://devbridge:changeme@localhost:5432/devbridge_ts"
)
MARIADB_URL = (
    f"mysql+pymysql://"
    f"{os.getenv('DB_USERNAME','devbridge')}:"
    f"{os.getenv('DB_PASSWORD','changeme')}@"
    f"{os.getenv('DB_HOST','localhost')}:"
    f"{os.getenv('DB_PORT','3306')}/"
    f"{os.getenv('DB_NAME','devbridge_db')}"
)

TIMESCALEDB_DDL = """
-- ============================================================
-- TimescaleDB DDL (PostgreSQL + timescaledb extension)
-- 실행: psql -U devbridge -d devbridge_ts -f this_file.sql
-- ============================================================

-- 확장 활성화
CREATE EXTENSION IF NOT EXISTS timescaledb CASCADE;

-- OHLCV 테이블 (hypertable)
CREATE TABLE IF NOT EXISTS market_ohlcv (
    ts          TIMESTAMPTZ     NOT NULL,
    symbol      TEXT            NOT NULL,
    source      TEXT            NOT NULL,
    tf          TEXT            NOT NULL DEFAULT '1d',
    open        DOUBLE PRECISION,
    high        DOUBLE PRECISION,
    low         DOUBLE PRECISION,
    close       DOUBLE PRECISION,
    volume      DOUBLE PRECISION,
    vwap        DOUBLE PRECISION,
    quote_vol   DOUBLE PRECISION,
    PRIMARY KEY (ts, symbol, source, tf)
);

-- hypertable 변환 (time 기준 자동 파티셔닝, 30일 청크)
SELECT create_hypertable(
    'market_ohlcv', 'ts',
    chunk_time_interval => INTERVAL '30 days',
    if_not_exists => TRUE
);

-- 압축 정책: 90일 이상 된 데이터 자동 압축
ALTER TABLE market_ohlcv SET (
    timescaledb.compress,
    timescaledb.compress_orderby = 'ts DESC',
    timescaledb.compress_segmentby = 'symbol, source, tf'
);
SELECT add_compression_policy('market_ohlcv', INTERVAL '90 days', if_not_exists => TRUE);

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_ohlcv_symbol_ts ON market_ohlcv (symbol, ts DESC);
CREATE INDEX IF NOT EXISTS idx_ohlcv_source_ts ON market_ohlcv (source, ts DESC);

-- OHLCV 연속 집계 뷰 (Continuous Aggregates) — 주봉 자동 계산
CREATE MATERIALIZED VIEW IF NOT EXISTS market_ohlcv_weekly
WITH (timescaledb.continuous) AS
    SELECT
        time_bucket('1 week', ts) AS week,
        symbol, source,
        FIRST(open,  ts) AS open,
        MAX(high)        AS high,
        MIN(low)         AS low,
        LAST(close,  ts) AS close,
        SUM(volume)      AS volume
    FROM market_ohlcv
    WHERE tf = '1d'
    GROUP BY week, symbol, source
WITH NO DATA;

SELECT add_continuous_aggregate_policy(
    'market_ohlcv_weekly',
    start_offset => INTERVAL '1 month',
    end_offset   => INTERVAL '1 day',
    schedule_interval => INTERVAL '1 day',
    if_not_exists => TRUE
);

-- 매크로 팩터 테이블 (hypertable)
CREATE TABLE IF NOT EXISTS market_macro (
    ts          TIMESTAMPTZ     NOT NULL,
    series_id   TEXT            NOT NULL,
    value       DOUBLE PRECISION,
    PRIMARY KEY (ts, series_id)
);
SELECT create_hypertable(
    'market_macro', 'ts',
    chunk_time_interval => INTERVAL '90 days',
    if_not_exists => TRUE
);
CREATE INDEX IF NOT EXISTS idx_macro_series ON market_macro (series_id, ts DESC);

-- 수집 로그
CREATE TABLE IF NOT EXISTS market_data_log (
    ts          TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    source      TEXT            NOT NULL,
    symbol      TEXT,
    action      TEXT            NOT NULL,
    rows_upserted INT,
    error_msg   TEXT
);
SELECT create_hypertable('market_data_log', 'ts', if_not_exists => TRUE);

-- 편의 함수: 최근 N일 OHLCV
CREATE OR REPLACE FUNCTION ohlcv_recent(p_symbol TEXT, p_days INT DEFAULT 365, p_tf TEXT DEFAULT '1d')
RETURNS TABLE(ts TIMESTAMPTZ, open DOUBLE PRECISION, high DOUBLE PRECISION,
              low DOUBLE PRECISION, close DOUBLE PRECISION, volume DOUBLE PRECISION)
LANGUAGE SQL STABLE AS $$
    SELECT ts, open, high, low, close, volume
    FROM market_ohlcv
    WHERE symbol = p_symbol AND tf = p_tf
      AND ts > NOW() - (p_days || ' days')::INTERVAL
    ORDER BY ts;
$$;
"""


def export_mariadb_to_csv(output_dir: str = "/tmp/tsdb_export"):
    """MariaDB에서 CSV로 내보내기 (마이그레이션 1단계)."""
    import os, pandas as pd
    from sqlalchemy import create_engine, text

    os.makedirs(output_dir, exist_ok=True)
    eng = create_engine(MARIADB_URL)

    tables = {
        "market_ohlcv": "SELECT ts, symbol, source, tf, open, high, low, close, volume, vwap, quote_vol FROM market_ohlcv ORDER BY ts",
        "market_macro": "SELECT ts, series_id, value FROM market_macro ORDER BY ts",
    }
    for table, sql in tables.items():
        try:
            with eng.connect() as conn:
                df = pd.read_sql(text(sql), conn)
            path = f"{output_dir}/{table}.csv"
            df.to_csv(path, index=False)
            log.info("exported %s: %d rows → %s", table, len(df), path)
            print(f"✓ {table}: {len(df)} rows → {path}")
        except Exception as e:
            print(f"✗ {table}: {e}")


def import_csv_to_timescaledb(csv_dir: str = "/tmp/tsdb_export"):
    """CSV → TimescaleDB로 가져오기 (마이그레이션 2단계)."""
    import pandas as pd
    from sqlalchemy import create_engine

    eng = create_engine(TSDB_URL)

    for table in ["market_ohlcv", "market_macro"]:
        path = f"{csv_dir}/{table}.csv"
        if not os.path.exists(path):
            print(f"skip {table}: {path} not found")
            continue
        df = pd.read_csv(path)
        df.to_sql(table, eng, if_exists="append", index=False, method="multi", chunksize=5000)
        print(f"✓ imported {table}: {len(df)} rows → TimescaleDB")


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    parser = argparse.ArgumentParser(description="MariaDB → TimescaleDB migration")
    parser.add_argument("--dry-run",     action="store_true", help="DDL만 출력, 실행 안함")
    parser.add_argument("--export-only", action="store_true", help="MariaDB → CSV만")
    parser.add_argument("--import-only", action="store_true", help="CSV → TimescaleDB만")
    parser.add_argument("--csv-dir", default="/tmp/tsdb_export")
    args = parser.parse_args()

    if args.dry_run:
        print("=" * 60)
        print("TimescaleDB DDL (실행할 SQL):")
        print("=" * 60)
        print(TIMESCALEDB_DDL)
        print("\n실행 명령:")
        print("  psql -U devbridge -d devbridge_ts -c '<위 SQL>'")

    elif args.export_only:
        export_mariadb_to_csv(args.csv_dir)

    elif args.import_only:
        import_csv_to_timescaledb(args.csv_dir)

    else:
        print("사용법:")
        print("  --dry-run      : DDL만 출력")
        print("  --export-only  : MariaDB → CSV")
        print("  --import-only  : CSV → TimescaleDB")
        print("\nEC2 전환 순서:")
        print("  1. docker run timescale/timescaledb-ha:pg16-latest")
        print("  2. python migrate_timescaledb.py --dry-run | psql devbridge_ts")
        print("  3. python migrate_timescaledb.py --export-only")
        print("  4. python migrate_timescaledb.py --import-only")
        print("  5. market_db.py의 _DB_URL을 TSDB_URL로 교체")
        print("  6. 서비스 재시작")
