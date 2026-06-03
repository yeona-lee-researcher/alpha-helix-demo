# `data/market_db.py` — 시계열 데이터 창고의 사서 (완전 라인별 해설)

> 원본: `analytics/app/data/market_db.py` (288줄)
> 이 문서는 `01_backtest/vbt_engine.md`(모범 예시)와 동일한 형식을 따릅니다.

---

## 📌 이 파일 한눈에

이 파일은 **"데이터 창고의 사서(司書)"** 입니다. 야후·바이낸스·FRED 같은 외부에서 긁어온 가격/거시지표 데이터를 **MariaDB(MySQL 호환 DB)에 차곡차곡 보관(쓰기)**하고, 백테스트·시그널 엔진이 필요할 때 **꺼내(읽기)** 줍니다. 즉, 이 파일은 **"데이터를 어떻게 저장하고 어떻게 찾아오는가"** 만 담당합니다. 데이터를 **어디서 긁어올지**는 옆 동료(`collector.py`, `yf_client.py` 등)의 일입니다.

핵심 함수는 다음과 같습니다(공개용 5개 + 내부용 4개):

| 함수 | 한 줄 역할 | 비유 |
|---|---|---|
| `upsert_ohlcv(df, tf)` | 가격(OHLCV) DataFrame을 `market_ohlcv` 테이블에 **저장(있으면 갱신)** | 같은 날짜 책이 이미 있으면 새 내용으로 덮어쓰고, 없으면 새로 꽂음 |
| `query_ohlcv(symbol, ...)` | 종목·기간 조건으로 가격을 **조회**해 DataFrame으로 | 청구 조건(저자·연도)으로 책을 찾아 꺼내줌 |
| `latest_close(symbol)` | 그 종목의 **가장 최신 종가 한 값**만 | "이 책 마지막 페이지 숫자만 알려줘" |
| `upsert_macro(df)` | FRED 거시지표(금리·VIX 등)를 `market_macro`에 저장 | 경제 지표 서가에 보관 |
| `query_macro(series_ids, ...)` | 여러 지표를 **wide-format(지표별 컬럼)** 으로 조회 | 여러 지표를 한 표로 펼쳐줌 |
| `_get_engine()` | DB 연결 통로(엔진)를 **딱 한 번만** 만들어 재사용 | 창고 출입문 — 한 번 열고 계속 씀 |
| `_ensure_tables()` | 테이블 3개가 없으면 **자동 생성(DDL)** | 서가가 없으면 서가부터 짬 |
| `_log_action(...)` | 수집 작업을 `market_data_log`에 기록(실패해도 무시) | 출입 대장에 한 줄 적기 |
| `get_collection_stats()` | 소스/심볼별 행 수·최신 시각 **요약 통계** | 창고 재고 현황표 |

**누가 호출하나?**
- 쓰기(`upsert_*`): `app/data/collector.py`(스케줄 수집기)와 `app/main.py`의 `/data/ohlcv` 엔드포인트가 "DB에 없으면 실시간 fetch 후 저장"할 때.
- 읽기(`query_*`, `latest_close`, `get_collection_stats`): `app/main.py`의 `/data/ohlcv`·`/data/macro`·`/data/status`, 그리고 `app/backtest/futures_engine.py`(선물 백테스트가 바이낸스 일봉을 DB에서 꺼낼 때).

```
collector.py / main.py  ──upsert_ohlcv/upsert_macro──▶  [ market_db ]  ──▶  MariaDB
backtest / main.py      ◀──query_ohlcv/query_macro/latest_close──  [ market_db ]  ◀──  MariaDB
```

> ⚠️ **이름 주의(중요)**: 프로젝트 가이드(CLAUDE.md·README)는 테이블 이름을 `market_ohlc_daily`라고 부르지만, **실제 이 코드가 쓰는 테이블 이름은 `market_ohlcv`** 입니다(L63). 문서/주석과 실제 코드가 다르니, 코드를 진실로 삼으세요. 또 파일 docstring은 "MariaDB"라 적었지만 연결 URL은 `mysql+pymysql`(L23) — MariaDB는 MySQL 호환이라 같은 드라이버를 씁니다.

---

## 🧠 사전 지식 (이거 모르면 막힘)

#### 1) 관계형 DB / 테이블 / 행 / 컬럼
- **테이블** = 엑셀 시트 한 장. **행(row)** = 한 줄(레코드), **컬럼(column)** = 세로 항목.
- 이 파일은 3개의 테이블을 씁니다:
  - `market_ohlcv` — 가격 봉(캔들) 한 줄 = 한 종목의 하루치 **시(open)·고(high)·저(low)·종(close)·거래량(volume)**.
  - `market_macro` — FRED 거시지표 한 줄 = 한 날짜의 한 지표 값(예: 10년 국채금리).
  - `market_data_log` — 수집 작업 기록(언제 무엇을 몇 줄 넣었는지, 에러는 뭐였는지).

#### 2) OHLCV란?
- **O**pen(시가)·**H**igh(고가)·**L**ow(저가)·**C**lose(종가)·**V**olume(거래량). 주식/코인 차트의 캔들 하나를 숫자로 표현한 것.
- 여기에 `vwap`(거래량가중평균가)·`quote_vol`(코인의 호가통화 거래대금)이 선택적으로 따라옵니다.

#### 3) upsert = "update + insert" (이 파일의 핵심 동작)
- **이미 같은 키의 행이 있으면 갱신(update), 없으면 새로 삽입(insert)** 하는 단일 동작.
- MySQL/MariaDB 문법으로는 `INSERT ... ON DUPLICATE KEY UPDATE ...`.
- **왜 필요한가?** 데이터를 매일 다시 긁으면 어제 넣은 날짜가 또 들어옵니다. upsert가 없으면 같은 날짜가 중복되거나, "이미 있어서 에러" 가 납니다. upsert는 "있으면 최신 숫자로 덮어쓰기"라 **여러 번 돌려도 안전(멱등성, idempotent)**.
- 무엇을 "같은 키"로 볼지는 **UNIQUE 제약**이 정합니다 → `(symbol, source, tf, ts)` 4개가 같으면 같은 봉으로 봄(L78).

#### 4) 연결 풀(connection pool)과 엔진(engine)
- DB에 매번 새로 접속하면 느립니다. **풀**은 연결 몇 개를 미리 열어두고 빌려주는 방식.
- SQLAlchemy의 `engine`은 그 풀을 관리하는 **출입문 객체**. 이 파일은 엔진을 **모듈 전역에 단 하나(`_engine`)** 만 만들어 재사용합니다(싱글톤 패턴).
- `pool_pre_ping=True` = 빌려주기 전에 "이 연결 아직 살아있어?" 핑 한 번(끊긴 좀비 연결 방지). `pool_recycle=3600` = 1시간(3600초)마다 연결을 새로 교체(DB가 오래된 연결을 끊는 문제 예방).

#### 5) `pd.read_sql` — SQL 결과를 곧장 DataFrame으로
- `pd.read_sql(text(sql), conn, params=...)` = SQL을 실행해 **결과표를 그대로 pandas DataFrame** 으로 받음. for 루프로 행을 하나씩 안 돌려도 됩니다.

#### 6) 파라미터 바인딩 (`:name`) vs 문자열 끼워넣기 — 보안 핵심
- SQL에 값을 넣을 때 **절대 문자열로 직접 합치면 안 됩니다**(`f"... '{symbol}'"`). 그러면 **SQL 인젝션**(악성 입력으로 DB 조작) 위험.
- 안전한 방법: SQL엔 `:symbol` 같은 **자리표시자(placeholder)** 만 쓰고, 실제 값은 `params={"symbol": ...}`로 따로 넘김 → 드라이버가 안전하게 이스케이프. 이 파일은 **모든 값에 이 바인딩을 씁니다**(좋은 습관).
  - 단, **컬럼명/조건절 자체**는 바인딩이 안 되므로 `f"WHERE {' AND '.join(where)}"`처럼 코드로 조립합니다(L182). 이건 사용자 입력이 아니라 **코드가 만든 고정 문자열**이라 안전 — 헷갈리는 포인트(아래 함정 1 참고).

---

## 🗺 전체 흐름도

```
            (외부 수집기 collector / main.py)
                       │  df (pandas)
                       ▼
            ┌────────────────────────┐
   쓰기 →   │ upsert_ohlcv / upsert_macro │
            └────────────────────────┘
                       │ to_dict("records") → [{:ts,:symbol,...}, ...]
                       ▼
       INSERT ... ON DUPLICATE KEY UPDATE   (멱등 upsert)
                       │
                       ▼
   ┌──────────────────────────────────────────────────┐
   │  MariaDB / MySQL                                   │
   │   market_ohlcv  (UNIQUE: symbol,source,tf,ts)      │
   │   market_macro  (UNIQUE: series_id,ts)             │
   │   market_data_log                                  │
   └──────────────────────────────────────────────────┘
                       ▲
                       │ SELECT ... WHERE :symbol :tf ...  (파라미터 바인딩)
   읽기 →   ┌────────────────────────────────────────┐
            │ query_ohlcv / query_macro / latest_close │ ← pd.read_sql
            │ get_collection_stats                     │
            └────────────────────────────────────────┘
                       │  DataFrame
                       ▼
            vbt_engine / futures_engine / main.py(API JSON)

   엔진 준비:  _get_engine() ──(최초 1회)──▶ _ensure_tables() (DDL: 테이블 3개 자동 생성)
   부가:       _log_action() → market_data_log
```

---

## 📖 라인별 해설

### A. 파일 설명서 + import — `L1-L19`

```python
# L1-L10
"""
MarketData DB 레이어 — MariaDB에 시계열 OHLCV + 매크로 팩터 저장/조회.

Phase 2에서 TimescaleDB 교체 시 이 파일만 바꾸면 됨 (인터페이스 동일).

테이블 구조:
  market_ohlcv      : OHLCV 일봉/분봉 (symbol + date 복합 인덱스)
  market_macro      : FRED 매크로 팩터 (series_id + date)
  market_data_log   : 수집 로그 (에러 추적용)
"""
```
- **이 파일의 사명**: "데이터를 저장·조회하는 레이어"라고 못 박았습니다. 핵심은 **"인터페이스(함수 모양)는 그대로 두고 내부 DB만 갈아끼울 수 있게"** 설계했다는 점 — 나중에 TimescaleDB(시계열 특화 DB)로 바꿔도 **이 파일만** 고치면 백테스트/시그널 코드는 그대로. 이게 **추상화 레이어**의 가치입니다.
- 주석은 테이블을 `market_ohlcv`라고 정확히 적었습니다(프로젝트 가이드의 `market_ohlc_daily`가 아님 — 코드가 맞습니다).

```python
# L11-L19
from __future__ import annotations
import logging
import os
from datetime import datetime
from typing import Optional

import pandas as pd

log = logging.getLogger(__name__)
```
- `from __future__ import annotations` — 타입힌트를 늦게 평가하는 주문(초보는 "최신 타입표기 활성화" 정도로 이해).
- `os` — **환경변수**(DB 접속정보)를 읽으려고. `logging` — 로그 출력. `Optional` — "값이 있거나 None".
- `import datetime` 은 import 되어 있지만 이 파일에서 직접 쓰이진 않습니다(과거 흔적). `pandas(pd)` 가 데이터의 주재료.
- `log = logging.getLogger(__name__)` — 이 모듈 전용 로거. `log.info(...)`로 진행상황을, `log.error/warning(...)`로 문제를 남깁니다.

---

### B. DB 접속 URL 만들기 — `L21-L29`

```python
# L21-L29
# DB 연결 (analytics 서비스 내에서 직접 MariaDB 접근)
_DB_URL = (
    f"mysql+pymysql://"
    f"{os.getenv('DB_USERNAME','devbridge')}:"
    f"{os.getenv('DB_PASSWORD','changeme')}@"
    f"{os.getenv('DB_HOST','localhost')}:"
    f"{os.getenv('DB_PORT','3306')}/"
    f"{os.getenv('DB_NAME','devbridge_db')}"
)
```
- **SQLAlchemy 접속 문자열**을 조립합니다. 최종 형태는 이렇게 생겼습니다:
  `mysql+pymysql://사용자:비밀번호@호스트:포트/DB이름`
  예) `mysql+pymysql://devbridge:changeme@localhost:3306/devbridge_db`
- `mysql+pymysql` = "MySQL/MariaDB에 **pymysql** 드라이버(순수 파이썬 MySQL 클라이언트)로 접속". MariaDB는 MySQL 프로토콜 호환이라 그대로 작동합니다.
- `os.getenv('KEY', '기본값')` = 환경변수가 있으면 그 값, 없으면 기본값. 즉 **환경변수로 접속정보를 주입**하되, 로컬에선 기본값으로 동작하게 한 것.
- 🧯 **초보가 헷갈리는 포인트 / 보안 경고**: 비밀번호 기본값 `changeme` 가 **소스코드에 그대로 박혀** 있습니다(하드코딩). 운영에서는 반드시 환경변수로 덮어써야 하고, 이 기본값은 **개발 편의용**으로만 봐야 합니다(함정 섹션 참고).
- 비밀번호에 `!` 같은 특수문자가 들어가면 URL 인코딩이 필요할 수 있는데, 여기선 그냥 끼워넣었습니다 — 비밀번호에 `@`·`:`·`/` 등이 들어가면 URL 파싱이 깨질 수 있어 잠재적 함정(함정 섹션).

---

### C. 엔진 싱글톤 — `_get_engine()` — `L31-L49`

```python
# L31-L49
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
```
- **무엇을 하나**: SQLAlchemy `engine`(DB 연결 풀의 관리자)을 **딱 한 번만** 만들고, 이후엔 그 하나를 계속 돌려줍니다.
- `_engine = None` 으로 시작 → 처음 호출 때만 `create_engine(...)` 실행, 이미 만들어졌으면(`is not None`) 만들지 않고 바로 반환. 이게 **싱글톤(단 하나) 패턴**.
- `global _engine` — 함수 안에서 모듈 전역 변수 `_engine`을 **수정**하겠다는 선언(이게 없으면 함수 안에서 새 지역변수로 취급됨).
- `from sqlalchemy import create_engine` 을 함수 안에서 import — **지연 import(lazy import)**. SQLAlchemy를 실제 DB가 필요한 순간에만 불러와, 이 모듈을 단순 import 만 할 때(예: 테스트)는 무거운 의존성을 안 건드립니다.
- 옵션 의미:
  - `pool_pre_ping=True` — 연결 빌려주기 전 생존 확인(끊긴 연결로 인한 에러 방지).
  - `pool_recycle=3600` — 1시간마다 연결 재생성(DB의 `wait_timeout`에 걸려 끊기는 것 예방).
  - `connect_args={"charset": "utf8mb4"}` — 한글·이모지까지 안전한 **utf8mb4** 문자셋으로 접속.
- `_ensure_tables()` — 엔진을 처음 만들 때 **테이블이 없으면 자동 생성**(아래 D). 즉 "엔진 준비 = 테이블 보장"이 한 세트.
- 실패하면 에러 로그를 남기고 `raise`로 **다시 던짐** → 호출한 쪽이 실패를 알 수 있게(조용히 삼키지 않음).

> 💡 초보 포인트: "왜 전역에 하나만?" → 엔진(=풀) 생성은 비싸고, 여러 개 만들면 연결이 낭비됩니다. 앱 전체가 **연결 풀 하나를 공유**하는 게 정석.

---

### D. 테이블 자동 생성 — `_ensure_tables()` — `L52-L114`

```python
# L52-L61
_TABLES_CREATED = False


def _ensure_tables():
    """필요한 테이블이 없으면 자동 생성."""
    global _TABLES_CREATED
    if _TABLES_CREATED:
        return

    eng = _get_engine()
```
- `_TABLES_CREATED` 라는 **한 번만 실행 플래그**. 이미 만들었으면 즉시 `return`(중복 실행 방지).
- 🧯 **헷갈리는 포인트(순환 호출처럼 보이지만 아님)**: `_ensure_tables()`는 `_get_engine()`이 부르고, `_ensure_tables()`는 또 `_get_engine()`을 부릅니다. 무한 루프 같지만, **이 시점엔 `_engine`이 이미 채워진 직후**라(create_engine 다음 줄에서 호출됨) `_get_engine()`은 만들지 않고 기존 엔진을 바로 돌려줍니다. 그래서 안전.

```python
# L62-L107  (DDL 문자열 — 세 테이블 생성문)
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
```
- 이 SQL이 **"market_ohlcv 서가가 없으면 짜라"** 입니다(`CREATE TABLE IF NOT EXISTS` — 이미 있으면 아무 일 안 함, 멱등).
- 컬럼 풀이(가격 한 봉 = 한 행):
  - `id BIGINT AUTO_INCREMENT` — 행마다 자동으로 1, 2, 3… 붙는 **대리 기본키**(인조 식별자). 데이터 자체와 무관한 일련번호.
  - `ts DATETIME` — **봉의 시작 시각(UTC 기준)**. 주석이 'UTC'라고 명시.
  - `symbol VARCHAR(30)` — 종목 코드(예: `AAPL`, `BTCUSDT`).
  - `source VARCHAR(20)` — **데이터 출처**(`polygon|binance|yfinance|kis`). 같은 종목이라도 출처가 다르면 별개 행으로 봄.
  - `tf VARCHAR(10) DEFAULT '1d'` — **타임프레임**(봉 간격). `1d`(일봉)·`1h`·`15m` 등.
  - `open/high/low/close/volume/vwap/quote_vol DOUBLE` — 실제 숫자들(소수 허용 부동소수). NULL 허용(없을 수 있음).
  - `created_at DATETIME DEFAULT CURRENT_TIMESTAMP` — 이 행이 **DB에 들어온 시각**(자동 기록). `ts`(시장 시각)와 다름 — 헷갈리지 말 것.
- 키(인덱스) 풀이:
  - `PRIMARY KEY (id)` — 기본키는 일련번호.
  - `UNIQUE KEY uq_ohlcv (symbol, source, tf, ts)` — ⭐ **upsert의 기준이 되는 유일성 제약**. "같은 종목·출처·타임프레임·시각"이면 단 하나만 존재. 이게 있어서 `ON DUPLICATE KEY UPDATE`가 "중복"을 판단할 수 있습니다.
  - `KEY idx_symbol_ts (symbol, ts)` — 조회 가속용 인덱스(종목+시각으로 자주 찾으니까). `query_ohlcv`의 `WHERE symbol=... ORDER BY ts`가 이걸 활용.
- `ENGINE=InnoDB` — 트랜잭션·외래키를 지원하는 표준 스토리지 엔진. `CHARSET=utf8mb4` — 다국어/이모지 안전.

```python
# L83-L93  (market_macro)
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
```
- 거시지표 테이블. **OHLCV와 달리 `ts`가 `DATE`(시각 없는 날짜)** — 거시지표는 보통 하루 단위라 시각이 불필요.
- `series_id` — FRED 지표 식별자(예: `FEDFUNDS`=기준금리, `DGS10`=10년 국채금리). `value` — 그날의 지표 값 하나.
- `UNIQUE KEY uq_macro (series_id, ts)` — "한 지표의 한 날짜"는 단 하나(upsert 기준).

```python
# L95-L107  (market_data_log)
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
```
- **수집 작업 일지**. 누가(`source`)·무엇을(`symbol`)·어떤 작업(`action`, 예: `"ohlcv"`)·몇 줄 넣었는지(`rows_upserted`)·에러는 뭐였는지(`error_msg`)를 한 줄로 남김.
- UNIQUE 제약이 없음 → upsert 대상이 아니라 **계속 쌓이는 append-only 로그**.

```python
# L108-L114
    with eng.begin() as conn:
        for stmt in ddl.strip().split(";"):
            stmt = stmt.strip()
            if stmt:
                conn.execute(__import__("sqlalchemy").text(stmt))
    _TABLES_CREATED = True
    log.info("market_data tables ensured")
```
- `with eng.begin() as conn:` — **트랜잭션** 블록. 안에서 에러가 없으면 자동 커밋, 있으면 자동 롤백. `begin()`은 "쓰기 트랜잭션"을 엽니다.
- `ddl.split(";")` — DDL 문자열엔 `CREATE TABLE`이 3개라 **세미콜론으로 쪼개** 하나씩 실행. 빈 조각(`strip()` 후 빈 문자열)은 건너뜀.
- `__import__("sqlalchemy").text(stmt)` — `sqlalchemy.text(...)`를 **인라인으로** 부르는 트릭. `text()`는 생 SQL 문자열을 SQLAlchemy가 실행 가능한 객체로 감싸는 함수. (보통은 `from sqlalchemy import text`로 깔끔히 쓰는데, 여기선 `__import__`로 즉석 호출 — 가독성은 떨어지지만 동작은 같음.)
- 끝나면 플래그를 `True`로 → 다음부턴 통째로 스킵.

> 💡 초보 포인트: **DDL을 코드로 만든다 = 마이그레이션 없이 "테이블이 알아서 생기는" 자동화**. 편하지만, 컬럼을 바꾸려면(`ALTER`) 이 자동생성으론 안 되고 별도 마이그레이션이 필요합니다(함정 섹션).

---

### E. OHLCV 쓰기 — `upsert_ohlcv()` — `L119-L155`

```python
# L119-L133
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
```
- **입력**: 가격 DataFrame `df` + 타임프레임 `tf`. **출력**: 저장한 행 수.
- `if df.empty: return 0` — 빈 데이터면 일 안 하고 0 반환(가드).
- `df = df.copy()` — **원본을 건드리지 않으려고 복사**. 아래에서 컬럼을 추가/수정하므로, 호출한 쪽의 df가 변하면 곤란.
- `ts_col = "timestamp" if ... else "date"` — 소스마다 시각 컬럼 이름이 다름(바이낸스는 `timestamp`, 야후/폴리곤은 `date`일 수 있음). **둘 중 있는 걸 골라** 통일.
- `pd.to_datetime(...).dt.tz_localize(None)` — 문자열/숫자를 진짜 날짜형으로 바꾸고, **타임존 정보를 제거(tz-naive)**. 주석대로 "UTC 기준의, 타임존 꼬리표 없는" 시각으로 통일. DB의 `DATETIME`은 타임존을 저장하지 않으므로 꼬리표를 떼어 일관성을 맞춥니다.
- 🧯 **헷갈리는 포인트**: `tz_localize(None)`은 **시각을 바꾸지 않고 꼬리표만 뗍니다**. 만약 들어온 데이터가 이미 KST(+9) 타임존이었다면, 떼기 전에 UTC로 변환하지 않으므로 9시간 어긋난 채 저장될 수 있음 — 소스가 UTC를 준다는 전제(주석)가 깨지면 함정.

```python
# L134-L138
    df["tf"] = tf
    if "vwap"      not in df.columns: df["vwap"]      = None
    if "quote_vol" not in df.columns: df["quote_vol"] = df.get("quote_volume")

    rows = df[["ts","symbol","source","tf","open","high","low","close","volume","vwap","quote_vol"]].to_dict("records")
```
- `df["tf"] = tf` — 모든 행에 타임프레임을 박음(파라미터로 받은 값).
- `vwap`이 없으면 `None`(=NULL)으로 채워 컬럼 존재를 보장.
- `quote_vol`이 없으면 `df.get("quote_volume")`에서 가져옴 — 바이낸스가 `quote_volume`이란 이름으로 주는 호가통화 거래대금을 매핑. (`df.get(...)`은 컬럼이 없으면 `None` 반환이라 안전.)
- `df[[...]].to_dict("records")` — 필요한 11개 컬럼만 골라 **`[{컬럼:값, ...}, {...}, ...]` 형태의 리스트**로. 이게 곧 SQL의 `:이름` 자리에 한 행씩 매핑됩니다.
- 🧯 **헷갈리는 포인트**: 여기서 고른 컬럼(`symbol`, `open` 등)이 **df에 없으면 KeyError**로 터집니다. 즉 docstring의 "필수 컬럼"을 호출자가 반드시 맞춰줘야 함.

```python
# L140-L155
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
```
- **이 SQL이 핵심 upsert**입니다. 풀어 읽으면:
  - `INSERT INTO market_ohlcv (...) VALUES (:ts, :symbol, ...)` — 한 행을 넣어라(값은 `:이름` 자리에 바인딩).
  - `ON DUPLICATE KEY UPDATE open=VALUES(open), ...` — **만약 UNIQUE 키(`symbol,source,tf,ts`)가 이미 있으면**, 그 행의 가격 컬럼들을 **새로 들어온 값(`VALUES(open)` = 방금 INSERT하려던 값)으로 갱신**하라.
  - 즉 "없으면 삽입, 있으면 가격 최신화" = **멱등 upsert**.
- 🧯 **헷갈리는 포인트**: `UPDATE` 절에 **`ts/symbol/source/tf`는 갱신하지 않습니다** — 당연합니다. 그것들은 "어떤 행인가"를 정하는 키라서, 갱신 대상은 **가격 데이터(open~quote_vol)** 뿐. 즉 같은 봉의 숫자가 정정되면 덮어쓰고, 식별자는 그대로.
- `text(sql)` + `conn.execute(text(sql), rows)` — `rows`가 **리스트(여러 dict)** 라서 SQLAlchemy가 **여러 행을 한 번에(executemany)** 처리. 빠르고 안전(바인딩).
- 끝에 `_log_action(...)`으로 로그 테이블에 기록하고, `log.info(...)`로 콘솔에도 남김. `df["source"].iloc[0] if len(df) else "?"` — 첫 행의 source/symbol을 대표값으로(빈 df면 "?"). 단, 이미 위에서 `df.empty`면 0을 반환했으니 여기선 보통 비어있지 않음(방어적 코드).
- `return len(df)` — **DB가 실제로 바꾼 행 수가 아니라, 보낸 행 수**를 반환. (upsert에서 "삽입+갱신"의 정확한 카운트는 DB마다 다르므로 단순화.)

> 💡 초보 포인트: 주석 `# INSERT IGNORE + UPDATE on duplicate`는 약간 오해 소지가 있습니다. 실제 SQL은 `INSERT IGNORE`가 아니라 **`INSERT ... ON DUPLICATE KEY UPDATE`** 입니다(IGNORE는 "중복이면 그냥 버림", 여기는 "중복이면 갱신"). 코드가 진실.

---

### F. OHLCV 읽기 — `query_ohlcv()` — `L158-L185`

```python
# L158-L171
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
```
- **입력**: 종목·타임프레임·(선택)출처·시작/종료일·최대 건수. **출력**: 가격 DataFrame.
- `where = ["symbol = :symbol", "tf = :tf"]` — **조건절 조각들을 리스트로** 모으기 시작. 항상 종목·타임프레임은 필수 조건.
- `params` — 그 자리표시자에 들어갈 **실제 값들**. `symbol.upper()`로 **대문자 정규화**(저장도 외부에서 대문자로 들어온다는 전제 — 함정 참고).

```python
# L172-L182
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
```
- **선택 조건을 동적으로 추가**: `source`/`start`/`end`가 주어진 것만 `where`에 붙이고, 값은 `params`에 추가. 안 주면 그 조건은 SQL에 안 들어감.
- `' AND '.join(where)` — 조각들을 ` AND `로 연결 → 예: `symbol = :symbol AND tf = :tf AND ts >= :start`.
- 🧯 **헷갈리는 포인트(보안)**: `sql`은 `f"..."`로 만들어지는데, **끼워넣는 건 사용자 값이 아니라 코드가 만든 고정 문자열(`where` 조각)** 뿐입니다. 실제 값(`symbol`, `start` 등)은 전부 `:name` 바인딩으로 분리 → **SQL 인젝션 안전**. "f-string SQL = 무조건 위험"이 아니라, **무엇을 끼워넣느냐**가 관건.
- `ORDER BY ts DESC LIMIT :limit` — **최신순**으로 정렬해 최대 `limit`건만(`LIMIT`도 바인딩). "최근 N개"를 빠르게 가져오는 전형 패턴.

```python
# L183-L185
    with eng.connect() as conn:
        df = pd.read_sql(text(sql), conn, params=params)
    return df.sort_values("ts").reset_index(drop=True)
```
- `eng.connect()` — **읽기용 연결**(쓰기 트랜잭션 `begin()`과 달리 조회는 `connect()`). `with`로 끝나면 자동 반납.
- `pd.read_sql(text(sql), conn, params=params)` — SQL 실행 결과를 곧장 DataFrame으로.
- ⭐ `df.sort_values("ts").reset_index(drop=True)` — SQL에선 **DESC(최신순)** 로 가져왔지만, 여기서 다시 **`ts` 오름차순(과거→현재)** 으로 재정렬합니다. **왜?** 백테스트/지표 계산은 시간순(오래된 것부터)이어야 맞기 때문. "최신 N개를 뽑되, 돌려줄 땐 시간순으로." `reset_index(drop=True)`는 정렬 후 인덱스를 0,1,2…로 깔끔히 재부여.

> 💡 초보 포인트: `SELECT`에 `vwap`은 넣었지만 `quote_vol`은 뺐습니다. docstring도 `quote_vol`을 안 적음 — 조회 결과엔 `quote_vol` 컬럼이 없다는 뜻(저장은 하지만 일반 조회로는 안 꺼냄).

---

### G. 최신 종가 한 값 — `latest_close()` — `L188-L191`

```python
# L188-L191
def latest_close(symbol: str, source: Optional[str] = None, tf: str = "1d") -> Optional[float]:
    """최신 종가 단일 값 반환."""
    df = query_ohlcv(symbol, tf=tf, source=source, limit=1)
    return float(df["close"].iloc[0]) if not df.empty else None
```
- **`query_ohlcv`를 재사용**해 `limit=1`로 1건만 가져옴. `query_ohlcv`가 내부적으로 `ORDER BY ts DESC LIMIT 1`을 쓰니, 그 1건이 **가장 최신 봉**.
- 그 봉의 종가를 `float`로 변환해 반환. 데이터가 없으면 `None`.
- 🧯 **헷갈리는 포인트**: `query_ohlcv`가 마지막에 `sort_values("ts")`(오름차순)로 재정렬하지만, **행이 1개뿐**이라 정렬해도 그 1개 = 최신값. 그래서 `iloc[0]`이 정확히 최신 종가.

---

### H. 매크로 쓰기 — `upsert_macro()` — `L196-L219`

```python
# L196-L219
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
```
- OHLCV 쓰기와 **구조가 동일하되 더 단순**(컬럼이 적음).
- `pd.to_datetime(df["date"]).dt.date` — 날짜로 바꾸고 `.dt.date`로 **시각을 떼어 순수 날짜만**(테이블 `ts`가 `DATE`형이라). OHLCV는 `tz_localize(None)`로 시각 유지, 매크로는 `.date`로 시각 제거 — **두 테이블 타입 차이**를 반영.
- `ON DUPLICATE KEY UPDATE value=VALUES(value)` — UNIQUE 키(`series_id, ts`)가 겹치면 **값만 최신화**. 거시지표는 나중에 확정치로 정정되는 경우가 있어 upsert가 유용.
- `_log_action`을 부르지 않음(OHLCV와 달리 로그 테이블 기록은 생략) — 비대칭. 콘솔 `log.info`만.

---

### I. 매크로 읽기 (wide-format) — `query_macro()` — `L222-L250`

```python
# L222-L242
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
```
- **여러 지표를 한 번에** 조회 → `series_id IN (...)`. 문제는 "IN 절에 들어갈 값 개수가 가변"이라는 점.
- ⭐ **동적 바인딩 트릭**: 지표가 3개면 `placeholders = ":sid0, :sid1, :sid2"`를 만들고, `params = {"sid0": "DGS10", "sid1": "VIXCLS", ...}`를 같이 만듭니다. 즉 **자리표시자 개수를 입력 개수에 맞춰 생성**하면서도 **여전히 파라미터 바인딩**(인젝션 안전)을 유지. 이게 "IN 절을 안전하게 동적 생성"하는 표준 패턴.
- `start`/`end`는 OHLCV와 동일하게 선택 추가.

```python
# L244-L250
    sql = f"SELECT ts, series_id, value FROM market_macro WHERE {' AND '.join(where)} ORDER BY ts"
    with eng.connect() as conn:
        df = pd.read_sql(text(sql), conn, params=params)

    if df.empty:
        return pd.DataFrame()
    return df.pivot(index="ts", columns="series_id", values="value")
```
- 조회 자체는 **long-format**(한 줄 = 한 날짜·한 지표·한 값): `ts | series_id | value`.
- 데이터가 없으면 **빈 DataFrame** 반환(호출자가 `.empty`로 분기 가능).
- ⭐ `df.pivot(index="ts", columns="series_id", values="value")` — **long → wide 변환의 핵심**. 결과는:
  ```
  ts          DGS10   VIXCLS   T10Y2Y
  2024-01-02   3.95    13.2     -0.35
  2024-01-03   3.98    12.8     -0.31
  ```
  즉 **날짜가 인덱스(행), 지표가 컬럼**인 표로 펼침. 이래야 여러 지표를 백테스트/모델에 피처로 바로 넣기 좋음.
- 🧯 **헷갈리는 포인트**: `pivot`은 (index, columns) 조합이 **중복되면 에러**가 납니다. 다행히 테이블의 UNIQUE(`series_id, ts`) 덕분에 중복이 없어 안전 — 스키마 제약이 여기서 빛을 발함.

---

### J. 수집 로그 기록 — `_log_action()` — `L255-L265`

```python
# L255-L265
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
```
- `market_data_log`에 작업 한 줄을 INSERT(여기도 바인딩). UNIQUE가 없으니 **그냥 쌓임**.
- ⭐ **`try/except: pass`가 의도적**입니다 — "로그 기록 실패가 본 작업(데이터 저장)을 망치면 안 된다"는 철학. 로그는 **부가기능**이라 실패해도 조용히 넘어감(`pass`).
- 🧯 **헷갈리는 포인트**: `_log_action(action, source, symbol, ...)` 시그니처는 `(action, source, symbol)` 순서지만, 호출부(L153)는 `_log_action("ohlcv", source값, symbol값, ...)`로 부릅니다. 즉 **첫 인자 `"ohlcv"`가 파라미터 `action`에 들어가는 게 의도**인데, 변수명 순서상 헷갈리기 쉬움 — 실제로는 `action="ohlcv"`, `source=실제소스`, `symbol=실제심볼`로 올바르게 매핑됩니다(키워드가 아닌 위치 인자라 순서가 곧 의미).

---

### K. 수집 현황 요약 — `get_collection_stats()` — `L268-L288`

```python
# L268-L288
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
```
- **집계(aggregate) 쿼리**: `GROUP BY source, symbol, tf`로 묶어, 각 묶음마다:
  - `COUNT(*)` = 행 개수(`total_rows`), `MIN(ts)` = 가장 오래된 봉(`oldest`), `MAX(ts)` = 가장 최신 봉(`latest`).
- 결과를 `[{source, symbol, tf, total_rows, oldest, latest}, ...]` 리스트로 반환 → `main.py`의 `/data/status`가 이걸 그대로 응답에 실음(L483).
- 🧯 **헷갈리는 포인트**: 여기엔 **사용자 입력이 없으니** 바인딩할 값도 없고, 통째로 `try/except`로 감싸 실패하면 `[]`(빈 리스트) 반환 — "현황판은 죽어도 본 서비스는 살아야 한다"는 방어.

---

## ⚠️ 함정·버그 주의 (코드에 박힌 교훈 + 잠재 리스크)

1. **SQL 인젝션 — 이 파일은 안전하지만 패턴을 정확히 이해할 것**
   - 모든 **값**은 `:name` 파라미터 바인딩으로 분리(좋음). `query_ohlcv`·`query_macro`가 `f"WHERE {...}"`로 SQL을 조립하지만, 끼워넣는 건 **코드가 만든 조건절 조각**(`"symbol = :symbol"`)뿐이고 실제 값은 바인딩됨 → 안전.
   - ⛔ **하지 말 것**: 만약 누군가 `where.append(f"symbol = '{symbol}'")`처럼 **값을 직접 문자열에 넣으면** 즉시 인젝션 취약점. 지금 코드는 그렇게 안 함.

2. **`tf`/`source`/컬럼명은 바인딩 불가** — DB 식별자(컬럼·테이블명)는 `:name`으로 못 바꿉니다. 그래서 `tf`는 값이라 바인딩(OK)하지만, 만약 컬럼명을 동적으로 받아야 한다면 **화이트리스트 검증**이 필요(현재는 컬럼명이 고정이라 무관).

3. **중복키/UNIQUE 제약이 upsert의 전제** — `market_ohlcv`의 UNIQUE는 `(symbol, source, tf, ts)`. 이 4개 중 하나라도 다르면 **다른 행**으로 취급됩니다.
   - 예: 같은 `AAPL` 일봉이라도 `source`가 `yfinance`냐 `polygon`이냐에 따라 **별개로 두 벌 저장**됨. 그래서 `query_ohlcv(source=None)`이면 두 소스가 섞여 같은 날짜가 두 번 나올 수 있음 — 조회 시 `source`를 지정하는 게 안전.

4. **`source` 컬럼 미지정 조회의 함정** — `latest_close`/`query_ohlcv`에서 `source=None`이면 모든 소스를 합쳐 최신순 정렬. 소스마다 데이터 신선도가 달라 **"최신"이 의도와 다른 소스의 값**일 수 있음. 가능하면 `source`를 명시.

5. **타임존 처리** — `upsert_ohlcv`의 `tz_localize(None)`은 시각을 바꾸지 않고 꼬리표만 뗌. **소스가 UTC가 아니면 9시간 등으로 어긋날** 수 있음(주석은 UTC 가정). 새 소스를 붙일 땐 UTC로 변환 후 저장하는지 확인.

6. **하드코딩된 DB 비밀번호 기본값** — `_DB_URL`의 `changeme`는 소스에 노출된 기본값. 운영에선 반드시 `DB_PASSWORD` 환경변수로 덮어쓸 것. 또 비밀번호에 `@`·`/`·`:` 같은 문자가 들어가면 URL 파싱이 깨지므로 URL 인코딩 필요.

7. **자동 DDL의 한계** — `_ensure_tables`는 **테이블이 없을 때만** 만듭니다. 이미 있는 테이블의 컬럼을 바꾸진 못함(`ALTER` 없음). 스키마 변경은 별도 마이그레이션으로. 또 백엔드(Flyway)가 관리하는 스키마와 **이중 관리**되면 불일치 위험(어느 쪽이 진짜 소스인지 합의 필요).

8. **`return len(df)` ≠ 실제 변경 행 수** — upsert가 보낸 행 수를 돌려줄 뿐, "신규 삽입 vs 갱신"을 구분하지 않음. 정확한 영향 행 수가 필요하면 `result.rowcount`를 봐야 함.

9. **문서/코드 이름 불일치** — 프로젝트 가이드의 `market_ohlc_daily` ↔ 실제 `market_ohlcv`. 문서를 믿지 말고 코드를 진실로.

10. **`upsert_macro`는 로그를 안 남김** — OHLCV와 달리 `_log_action` 호출이 없어 `market_data_log`에 매크로 수집 기록이 안 쌓임(비대칭). 추적이 필요하면 추가 고려.

---

## 🚀 고도화 아이디어 (강의·개선 버전용)

- **TimescaleDB/하이퍼테이블 전환**: docstring의 계획대로 `market_ohlcv`를 시계열 특화 테이블로. 함수 시그니처를 그대로 두면 상위 코드 변경 없이 교체 가능(이 파일의 추상화 가치를 강의로 보여주기 좋음).
- **벌크 성능**: 대량 upsert 시 `executemany`(이미 사용)에 더해 `LOAD DATA` 또는 chunk 단위 트랜잭션 분할로 메모리/속도 개선.
- **정확한 카운트 반환**: `result = conn.execute(...); return result.rowcount`로 실제 영향 행 수 반환.
- **읽기 캐시**: `latest_close`·`get_collection_stats`처럼 자주 부르는 조회에 짧은 TTL 캐시(예: lru_cache + 시간 키).
- **데이터 품질 검증**: upsert 전에 `high >= low`, `volume >= 0`, NaN 검사 등 sanity check 추가 → 오염 데이터 차단.
- **소스 우선순위 정책**: `query_ohlcv(source=None)`일 때 소스 충돌을 "우선순위(예: polygon > yfinance)"로 해소하는 뷰/로직.
- **매크로도 로그 남기기**: `upsert_macro`에 `_log_action("macro", ...)` 추가로 추적 일관성 확보.
- **마이그레이션 일원화**: 자동 DDL 대신 Flyway/Alembic 한 곳에서 스키마를 관리해 이중 관리 제거.
- **타임존 명시화**: 모든 소스를 "tz-aware → UTC 변환 → tz_localize(None)" 순으로 통일해 어긋남 원천 차단.

---

## 📚 용어 사전 (이 파일 한정)

| 용어 | 뜻 |
|---|---|
| **OHLCV** | 시가·고가·저가·종가·거래량 — 캔들 한 봉을 숫자로 표현 |
| **upsert** | "있으면 갱신(update), 없으면 삽입(insert)". MySQL `INSERT ... ON DUPLICATE KEY UPDATE` |
| **멱등성(idempotent)** | 같은 작업을 여러 번 해도 결과가 같음(중복 수집해도 안전) |
| **SQLAlchemy engine** | DB 연결 풀을 관리하는 출입문 객체. 이 파일은 전역 1개(싱글톤) |
| **pymysql** | 순수 파이썬 MySQL/MariaDB 드라이버. URL `mysql+pymysql://...` |
| **연결 풀 / pool_pre_ping / pool_recycle** | 연결 재사용 / 빌려주기 전 생존확인 / 주기적 연결 재생성 |
| **파라미터 바인딩 (`:name`)** | SQL에 자리표시자만 두고 값은 따로 넘김 → SQL 인젝션 방지 |
| **`text(sql)`** | 생 SQL 문자열을 SQLAlchemy 실행 객체로 감싸는 함수 |
| **`eng.begin()` vs `eng.connect()`** | 쓰기 트랜잭션(자동 커밋/롤백) vs 읽기 연결 |
| **DDL** | Data Definition Language — `CREATE TABLE` 등 스키마 정의문 |
| **UNIQUE KEY** | "이 컬럼 조합은 단 하나만" 제약. upsert의 중복 판단 기준 |
| **AUTO_INCREMENT** | 행마다 자동 증가하는 일련번호(대리 기본키) |
| **`to_dict("records")`** | DataFrame을 `[{컬럼:값}, ...]` 리스트로 변환(바인딩 입력용) |
| **`pd.read_sql`** | SQL 결과를 곧장 DataFrame으로 받음 |
| **long → wide / `pivot`** | "날짜·지표·값" 세로표를 "날짜 인덱스 × 지표 컬럼" 가로표로 펼침 |
| **tz_localize(None) / `.dt.date`** | 타임존 꼬리표 제거 / 시각을 떼고 순수 날짜만 |
| **tf(타임프레임)** | 봉 간격(`1d`·`1h`·`15m`) |
| **source(소스)** | 데이터 출처(`polygon`·`binance`·`yfinance`·`kis`) |
