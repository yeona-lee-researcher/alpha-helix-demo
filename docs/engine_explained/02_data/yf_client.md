# `data/yf_client.py` — 주가 데이터 수집·캐시 클라이언트 (완전 라인별 해설)

> 원본: `analytics/app/data/yf_client.py` (189줄)
> 이 문서는 README "3. 공통 형식" 규칙을 따릅니다. 모범 예시: `01_backtest/vbt_engine.md`.

---

## 📌 이 파일 한눈에

이 파일은 **"가격 데이터 배달부"** 입니다. `"AAPL"` 같은 종목 코드를 받아서, **그 종목의 과거 일봉(OHLCV) 표를 인터넷에서 받아와 정리해서 돌려줍니다.** 백테스트·시그널·신뢰성 검증 등 엔진의 거의 모든 계산은 결국 여기서 받아온 가격 한 줄(`Close`)에서 시작합니다.

이름은 `yf_client`(yfinance = 야후 파이낸스 클라이언트)지만, **실제 구현은 야후만 쓰지 않습니다.** 파일 맨 위 docstring(`L1-L6`)이 정확히 말하듯, **Polygon.io 를 1순위로 시도하고, 안 되면 yfinance 로 폴백**합니다. 거기에 **로컬 디스크 캐시(parquet 파일)** 와 **오프라인 모드**까지 4단 안전망이 있습니다.

> ⚠️ 헷갈림 주의: 파일명·import 별명은 `yf`(야후)지만, 데이터의 1순위 소스는 Polygon 입니다. "야후만 쓴다"는 건 환각입니다. 코드상 stooq 폴백은 **없습니다**(Polygon → yfinance → 캐시 3단뿐).

외부에 노출되는(밖에서 부르는) 함수는 3개입니다:

| 함수 | 한 줄 역할 | 비유 |
|---|---|---|
| `get_history(ticker, period, interval, force_refresh)` | 종목의 과거 OHLCV 표(DataFrame) 반환 — **이 파일의 정문** | 도서관에서 "이 책 5년치" 빌려오기 (먼저 내 책장 확인 → 없으면 도서관 A → B 순) |
| `get_latest_close(ticker)` | 그 종목의 **가장 최근 종가 1개**(float) 반환 | "지금 이 책의 마지막 페이지 숫자만 알려줘" |
| `get_multiple(tickers, period)` | 여러 종목을 한 번에 `{종목: 표}` 딕셔너리로 | 여러 권을 한 묶음으로 빌려오기 |

나머지 함수(`_`로 시작)는 전부 **내부 도우미**입니다: `_cache_path`(캐시 파일 경로), `_is_fresh`(캐시 신선도), `_read_cache`(캐시 읽기), `_period_to_dates`('5y'→날짜), `_fetch_polygon`(Polygon 호출), `_fetch_yfinance`(야후 호출), `_slice_to_period`(기간 자르기).

**누가 호출하나?**
- `app/main.py` — `/backtest`, `/signal`, `/trust-score`, `/regime`, `/price` 등 거의 모든 엔드포인트가 `get_history(...)`·`get_latest_close(...)`를 호출 (예: `main.py:128` 백테스트용 가격, `main.py:145` `^VIX` 공포지수, `main.py:164` `SPY` 벤치마크).
- `app/models/retrain_scheduler.py:76` — 매일 22:30 XGBoost 재학습 때 `get_history(ticker, period="5y", force_refresh=True)`로 최신 5년치 강제 수집.
- `app/lean/runner.py:82` — Lean 백테스트 엔진에 먹일 OHLCV 공급.

> 비유로 본 전체 그림: 엔진의 모든 "요리(백테스트·예측)"는 **재료(가격)** 가 있어야 합니다. 이 파일은 그 재료를 **사 오고, 손질하고, 냉장고(캐시)에 넣어두는 장보기 담당**입니다. 마트가 문 닫으면(Polygon 실패) 다른 마트(yfinance), 그것도 안 되면 냉장고 재고(stale cache)로 버팁니다.

---

## 🧠 사전 지식 (이거 모르면 막힘)

#### 1) OHLCV = 하루치 가격의 다섯 숫자
주식 하루를 요약하는 5개 값입니다.

| 약자 | 뜻 | 컬럼명 |
|---|---|---|
| **O**pen | 시가(그날 처음 거래된 값) | `Open` |
| **H**igh | 고가(그날 최고) | `High` |
| **L**ow | 저가(그날 최저) | `Low` |
| **C**lose | 종가(그날 마지막) | `Close` ← 엔진이 가장 많이 씀 |
| **V**olume | 거래량(그날 거래된 주식 수) | `Volume` |

이 파일이 돌려주는 표는 **"날짜별로 이 5개 값이 한 줄씩"** 쌓인 모양입니다.

```
날짜(index)    Open    High    Low     Close   Volume
2024-01-02     185.6   186.7   184.3   185.6   52_000_000
2024-01-03     184.2   185.0   183.1   184.2   48_300_000
...
```

#### 2) `pandas DataFrame` = "여러 칸짜리 표"
`vbt_engine.md`에서 본 **Series**(`[날짜→값 1줄]`)를 여러 줄(컬럼) 묶은 것이 **DataFrame**입니다. 위 OHLCV 표가 바로 DataFrame. `df["Close"]` 라고 하면 그중 종가 컬럼 한 줄(Series)만 꺼낼 수 있습니다(`get_latest_close`가 이걸 씁니다). `df.index` 는 왼쪽의 **날짜 축**(DatetimeIndex)입니다.

#### 3) 기간 표기 `period` — '5y', '1y', '5d', 'max'
얼마나 과거까지 받아올지를 짧은 문자열로 적습니다.

| 표기 | 뜻 |
|---|---|
| `1d` / `5d` | 1일 / 5일 |
| `1mo` / `3mo` / `6mo` | 1·3·6개월 |
| `1y` / `2y` / `5y` / `10y` | 1·2·5·10년 |
| `ytd` | 연초부터 오늘까지(year-to-date) |
| `max` | 받을 수 있는 최대(여기선 약 30년) |

이 파일의 `_period_to_dates`가 이 문자열을 **실제 시작·끝 날짜**(예: `2021-06-01 ~ 2026-06-01`)로 환산합니다.

#### 4) `interval` — 한 줄이 며칠치냐
`1d`(일봉=하루 한 줄, 기본값), `1wk`(주봉), `1mo`(월봉) 등. 이 엔진은 거의 항상 **일봉(`1d`)** 만 씁니다. **Polygon 경로는 일봉만 지원**(`L157`)하므로, 일봉이 아니면 곧장 yfinance로 갑니다.

#### 5) 캐시(cache) + parquet + TTL
- **캐시**: 한 번 받아온 데이터를 디스크에 저장해두고, 다음엔 인터넷 없이 빠르게 재사용. (비유: 마트 다녀온 재료를 냉장고에 보관.)
- **parquet**: 표(DataFrame)를 디스크에 저장하는 효율적인 이진 파일 형식. CSV보다 빠르고 작습니다.
- **TTL(Time-To-Live)**: 캐시의 "유통기한". 여기선 `PRICE_CACHE_TTL_MIN`(기본 **60분**). 60분 안에 받은 캐시는 "신선"하다고 보고 그대로 씀, 넘으면 새로 받음.

#### 6) timezone-naive 인덱스 (타임존 떼기)
주가 데이터에는 가끔 시간대 정보(`America/New_York` 등)가 붙어 옵니다. 시간대가 붙은 날짜와 안 붙은 날짜를 섞으면 비교·정렬에서 에러가 납니다. 그래서 이 파일은 **타임존을 떼어내(naive)** 모든 날짜를 "그냥 날짜"로 통일합니다(`L100`).

#### 7) MultiIndex 컬럼 (yfinance의 함정)
yfinance가 새 버전에서 한 종목만 받아도 컬럼을 **2층(예: `('Close','AAPL')`)** 으로 주는 경우가 있습니다. 그대로 두면 `df["Close"]`가 안 먹힙니다. 그래서 이 파일은 컬럼을 **1층으로 펴는** 처리를 합니다(`L96-L97`).

---

## 🗺 전체 흐름도

```
                 get_history("AAPL", period="5y")  ← 정문
                              │
                              ▼
                ┌─────────────────────────────┐
                │ OFFLINE_MODE 인가?            │── 예 ─▶ 캐시만 읽음 → 있으면 반환 / 없으면 에러
                └─────────────────────────────┘
                              │ 아니오
                              ▼
                ┌─────────────────────────────┐
       1순위    │ 신선한 캐시(60분 이내) 있나?  │── 있음 ─▶ 캐시 반환 (인터넷 X, 가장 빠름)
                └─────────────────────────────┘
                              │ 없음/만료/force_refresh
                              ▼
       2순위    interval=="1d" 면 → _fetch_polygon()  (Polygon.io)
                              │ None/빈값이면
                              ▼
       3순위    _fetch_yfinance()  (야후 파이낸스)
                              │ None/빈값이면
                              ▼
       4순위    _read_cache()  (오래된 캐시라도 — 최후 수단)
                              │ 그것도 없으면
                              ▼
                       raise ValueError("No data")

   성공 시 ─▶ parquet 로 캐시에 저장 ─▶ 표준 OHLCV DataFrame 반환
                                              │
                              ┌───────────────┴───────────────┐
                              ▼                               ▼
                   get_latest_close: df["Close"].iloc[-1]   get_multiple: 종목마다 반복
```

핵심 메시지: **`get_history` 는 "4단 폭포(fallback waterfall)"** 입니다. 위에서부터 차례로 시도하고, 성공하는 첫 소스의 데이터를 씁니다. 어느 단계에서 실패해도 다음 단계가 받쳐주므로 잘 죽지 않습니다.

---

## 📖 라인별 해설

### A. 파일 설명서 + import + 전역 설정 — `L1-L21`

```python
# L1-L6
"""
Market data client — Polygon.io 우선, yfinance 폴백.

POLYGON_API_KEY 설정 시 Polygon 데이터를 사용하고,
미설정 또는 오류 시 yfinance로 자동 폴백합니다.
"""
```
- **무엇을**: 파일 맨 위 docstring(설명서). 실행되지 않고 사람이 읽는 용도.
- **왜**: "이 파일이 무엇인지" 한 줄로 못 박음 — **Polygon 우선, yfinance 폴백**. 파일명만 보고 "야후 전용"이라 오해하지 말라는 친절한 안내입니다.

```python
# L7-L19
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
```
- `from __future__ import annotations` — 타입힌트를 "문자열처럼 늦게" 평가하는 주문. 초보는 **"최신 타입표기 허용 스위치"** 로 이해하면 됩니다.
- `logging` — `print` 대신 쓰는 **기록 장치**. "캐시 적중", "Polygon 실패" 같은 운영 메시지를 남깁니다(아래 `log.info`/`log.warning`).
- `os` — 환경변수 읽기(`os.getenv`). `datetime/timedelta/date` — 날짜 계산. `Path` — 파일 경로를 OS 독립적으로 다룸. `Optional[X]` — "X 이거나 None(없음)".
- `pandas as pd` — 표 데이터. `yfinance as yf` — 야후 파이낸스 다운로더(별명 `yf`).
- `from app.config import CACHE_DIR, PRICE_CACHE_TTL_MIN` — 캐시 폴더 경로와 캐시 유통기한(분)을 **설정 파일에서** 가져옴(매직넘버 방지). `CACHE_DIR`는 `analytics/cache/`(config가 폴더를 자동 생성), `PRICE_CACHE_TTL_MIN`은 기본 **60분**.
- `log = logging.getLogger(__name__)` — 이 파일 전용 로거 객체. `__name__`이 모듈 이름(`app.data.yf_client`)이라 로그에 출처가 찍힘.

```python
# L21
OFFLINE_MODE = bool(int(os.getenv("ANALYTICS_OFFLINE_CACHE", "0")))
```
- **무엇을**: 환경변수 `ANALYTICS_OFFLINE_CACHE`를 읽어 **오프라인 모드 on/off** 전역 플래그로 만듦.
- **왜**: 인터넷이 없거나(데모·테스트) 외부 API를 막아야 할 때, **캐시 파일만으로** 동작하게 하는 스위치.
- **초보 헷갈림**: `bool(int("0"))` 흐름 — 환경변수는 항상 **문자열**이라 `"1"`/`"0"`으로 들어옵니다. `int("1")=1 → bool(1)=True`, `int("0")=0 → bool(0)=False`. 미설정이면 기본 `"0"` → `False`(오프라인 아님). **주의**: `ANALYTICS_OFFLINE_CACHE=true`(문자 true)처럼 넣으면 `int("true")`가 **에러**납니다 — 반드시 `1` 또는 `0`.

---

### B. 캐시 파일 경로 만들기 `_cache_path` — `L24-L25`

```python
# L24-L25
def _cache_path(ticker: str, interval: str, period: str = "max") -> Path:
    return CACHE_DIR / f"{ticker.upper()}_{interval}_{period}.parquet"
```
- **무엇을**: 캐시 파일이 저장될 **경로(파일명)** 를 계산. 예: `AAPL` + `1d` + `5y` → `analytics/cache/AAPL_1d_5y.parquet`.
- **왜**: 종목·간격·기간 조합마다 **별도 파일**로 보관해야 섞이지 않습니다. `CACHE_DIR / "..."` 의 `/` 는 `Path` 의 경로 결합 연산자(문자열 `+`보다 OS 안전).
- **초보 헷갈림**: `ticker.upper()` — 항상 **대문자로 통일**. `aapl`과 `AAPL`이 다른 파일로 갈리는 사고를 막습니다(아래 `get_history`도 입력을 `.upper()`로 정규화).

---

### C. 캐시 신선도 검사 `_is_fresh` — `L28-L32`

```python
# L28-L32
def _is_fresh(path: Path, ttl_min: int) -> bool:
    if not path.exists():
        return False
    mtime = datetime.fromtimestamp(path.stat().st_mtime)
    return (datetime.now() - mtime) < timedelta(minutes=ttl_min)
```
- **무엇을**: 캐시 파일이 **TTL(분) 이내에 만들어졌는지** True/False로 답함.
- **어떻게**: 파일이 없으면 바로 `False`. 있으면 파일의 **수정 시각**(`st_mtime`, 마지막으로 저장된 시각)을 읽어, "지금 − 수정시각 < TTL분" 이면 신선(`True`).
  - `path.stat().st_mtime` — 파일 메타데이터의 수정시각(유닉스 타임스탬프, 초 단위 숫자).
  - `datetime.fromtimestamp(...)` — 그 숫자를 사람이 다루는 datetime으로 변환.
  - `timedelta(minutes=60)` — "60분"이라는 시간 길이 객체. `datetime - datetime = timedelta` 라서 둘을 직접 비교할 수 있습니다.
- **왜**: 1분 전에 받은 데이터를 매번 다시 받는 건 낭비 + API 레이트리밋 위험. **60분 안엔 재사용**해 빠르고 안전하게.

---

### D. 캐시 읽기 `_read_cache` — `L35-L44`

```python
# L35-L44
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
```
- **무엇을**: 캐시 parquet 파일을 DataFrame으로 **읽어옴**. 없거나 읽기 실패면 `None`.
- **왜 try/except**: 파일이 깨졌거나(중간에 저장 실패), parquet 엔진이 없으면 `read_parquet`이 예외를 던집니다. 그걸 잡아 **프로그램을 죽이지 않고** `None`(=실패)으로 처리. 호출부는 `None`을 보고 다음 소스로 넘어갑니다.
- **초보 헷갈림**: `log.info("cache hit %s (%d rows)", ticker, len(df))` — `%s`(문자열)·`%d`(정수) 자리에 뒤 인자가 채워지는 로깅 관용 표기. 이렇게 쓰면 로그가 실제로 출력될 때만 문자열을 조립해 약간 더 효율적입니다.
- `Optional[pd.DataFrame]` 반환 타입 = "DataFrame 이거나 None".

---

### E. 기간 문자열 → 날짜 `_period_to_dates` — `L47-L56`

```python
# L47-L56
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
```
- **무엇을**: `"5y"` 같은 기간 문자열을 **(시작날짜, 끝날짜)** 두 ISO 문자열로 환산. 끝날짜는 항상 오늘(`date.today()`).
- **어떻게**: `mapping`에서 그 기간의 **일수**를 찾아(`5y`→1825일=5×365), 오늘에서 그만큼 뺀 날을 시작날짜로. `.isoformat()`은 `"2021-06-01"` 형태 문자열.
- **왜**: Polygon API는 `period` 문자열이 아니라 **명시적 from/to 날짜**를 요구합니다(`_fetch_polygon`에서 사용). 그래서 변환기가 필요.
- **초보 헷갈림 / 함정 포인트**:
  - `mapping.get(period, 1825)` — period가 표에 **없으면 기본 1825일(5년)**. 오타나 미지원 표기를 넣어도 안 죽고 5년치로 동작(조용한 폴백).
  - `"ytd": 365` — 진짜 "연초부터"가 아니라 그냥 **365일**로 근사. `"max": 10950` 도 무한이 아니라 **약 30년(10950일)** 으로 캡. 이건 **의도적 단순화**이자 미묘한 부정확성입니다(고도화 후보).
  - 모든 기간을 1년=365일로 계산해 **윤년 보정이 없습니다**(예: 30y는 실제론 ~10957일). 일봉 기준 며칠 오차라 실무 영향은 작지만 알아두면 좋습니다.

---

### F. Polygon 에서 받아오기 `_fetch_polygon` — `L59-L82`

```python
# L59-L69
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
```
- **무엇을**: 1순위 소스 **Polygon.io** 호출. 실패·미설정·빈값이면 `None`을 돌려 다음 소스(yfinance)로 넘김.
- **어떻게**:
  - `from app.data.polygon_client import get_daily_bars, available` — **함수 안에서 import**(지연 import). 모듈 로드 시점이 아니라 호출 순간에만 polygon_client를 불러옴 → polygon 의존성/키가 없어도 이 파일 자체는 정상 로드.
  - `available()` — `POLYGON_API_KEY` 환경변수가 설정돼 있나 검사(`polygon_client.py:29`). **키가 없으면 곧장 `None`** → Polygon은 건너뛰고 yfinance만 씁니다.
  - `_period_to_dates(period)` 로 from/to 날짜를 만들어 `get_daily_bars(ticker, from, to)` 호출.
  - `raw.empty` — 데이터가 0줄이면(상장폐지·잘못된 티커 등) `None`.

```python
# L70-L79
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
```
- **컬럼 정규화(중요)**: Polygon은 컬럼이 **소문자**(`open/high/low/close/volume`)로 옵니다. 엔진 표준은 **대문자**(`Open/High/Low/Close/Volume`)이므로 `rename`으로 통일. **모든 데이터 소스가 같은 컬럼 이름을 갖게** 만드는 것이 이 파일의 핵심 책임 중 하나입니다.
- `df.set_index("date")` — `date` 컬럼을 **행 인덱스(날짜축)** 로 올림. 그 뒤 `[[...5개...]]` 로 OHLCV 5개 컬럼만 골라 순서까지 표준화. `.copy()` 는 원본과의 연결을 끊어 경고(SettingWithCopy) 방지.
- `pd.to_datetime(df.index)` — 인덱스를 진짜 날짜형(DatetimeIndex)으로 보장.
- `df.dropna(inplace=True)` — **결측치(빈 칸)가 있는 행 삭제**. 휴장·데이터 누락 줄을 버려 깨끗한 표로.
- `except Exception` — Polygon이 어떤 식으로든 실패하면 **경고 로그만 남기고 `None`** → 폴백. "Polygon 때문에 전체가 죽는 일"을 막는 안전장치.
- **헷갈림 주의**: Polygon 경로에는 **타임존 제거(`tz_localize`)** 코드가 없습니다. polygon_client가 이미 naive 날짜를 준다고 전제. (yfinance 경로엔 명시적 타임존 제거가 있음 — 아래 G.)

---

### G. yfinance 에서 받아오기 `_fetch_yfinance` — `L85-L107`

```python
# L85-L95
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
```
- **무엇을**: 2순위(실질적 기본) 소스 **야후 파이낸스** 호출. `yf.download(...)` 가 인터넷으로 OHLCV를 받아옵니다.
- **인자 의미**:
  - `period`/`interval` — 받을 기간·간격을 그대로 전달(yfinance는 `period` 문자열을 직접 이해하므로 `_period_to_dates` 불필요).
  - `auto_adjust=True` — **수정주가(액면분할·배당 반영) 적용**. 예: 4:1 분할이 있어도 과거 가격이 자동 보정돼 연속적인 곡선이 됩니다. 백테스트 정확도에 중요.
  - `progress=False` — 콘솔에 진행 막대 안 띄움(서버·로그 깔끔하게).
  - `threads=False` — 멀티스레드 다운로드 끔. 한 종목씩 순차로 받아 **레이트리밋·불안정성 줄임**.

```python
# L96-L104
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
```
- **MultiIndex 펴기(중요)**: 최신 yfinance는 한 종목도 컬럼을 2층(`('Open','AAPL')`)으로 줄 때가 있음. `get_level_values(0)` 으로 **0층(상위)만 남겨** `Open/High/...` 1층으로 폄. 안 하면 `df["Open"]`이 안 먹혀 다음 줄에서 KeyError.
- `if df.empty: return None` — 받은 게 비었으면(잘못된 티커 등) 실패 처리 → 다음 소스(stale 캐시)로.
- **타임존 제거(중요)**: `df.index.tz_localize(None) if df.index.tz else df.index` — 인덱스에 타임존이 붙어 있으면(`df.index.tz` 가 있으면) **떼어내고(naive)**, 없으면 그대로. 사전지식 6번 — 모든 소스의 날짜를 "그냥 날짜"로 통일해 정렬/비교 에러를 막습니다.
- 그 뒤 OHLCV 5개 컬럼 선택 + `dropna` 로 Polygon과 **완전히 동일한 표준 포맷**으로 맞춰 반환. → 호출부 입장에서 데이터가 Polygon에서 왔는지 야후에서 왔는지 **구분할 필요가 없습니다**(둘이 똑같이 생김).

> 💡 핵심 설계: `_fetch_polygon`과 `_fetch_yfinance`는 **출력 모양이 똑같습니다**(같은 컬럼·naive 인덱스·dropna). 이것이 "폭포 폴백"이 매끄럽게 작동하는 비결 — 어느 소스가 답하든 위쪽 코드는 신경 안 써도 됩니다.

---

### H. 캐시 데이터를 기간에 맞게 자르기 `_slice_to_period` — `L110-L120`

```python
# L110-L120
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
```
- **무엇을**: 캐시에서 읽은 표를 **요청한 기간만큼만 잘라서** 반환.
- **왜 필요한가(미묘함)**: 캐시 파일명은 `AAPL_1d_5y.parquet`처럼 period를 포함하지만, 다른 경로로 더 긴 데이터가 저장됐거나, "1y를 요청했는데 캐시엔 5년치가 있는" 상황이 생길 수 있습니다. 그럴 때 **사용자가 원한 구간(1y)만** 돌려주려는 안전장치.
- **어떻게**: `_period_to_dates`로 시작날짜(`cutoff`)를 구하고, `df[df.index >= cutoff]` 로 그 날짜 이후만 필터. `period == "max"` 면 자를 필요 없어 통째 반환.
- **방어 코딩**: `sliced if not sliced.empty else df` — 잘랐더니 0줄이 되면(엉뚱하게 다 잘림) 차라리 **원본을 반환**. `except: return df` 도 같은 철학 — 자르기에 실패해도 데이터는 살림.
- **호출 위치**: `get_history`의 **캐시 경로에서만** 쓰입니다(`L146`, `L153`). 새로 fetch한 데이터엔 적용 안 함(이미 그 기간에 맞게 받았으므로).

---

### I. 정문 `get_history` — `L123-L178` (이 파일의 알맹이)

함수 머리 + docstring:
```python
# L123-L138
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
```
- **시그니처(정확히)**: `get_history(ticker, period="5y", interval="1d", force_refresh=False) -> pd.DataFrame`.
  - `ticker` — 종목 코드(필수). 예: `"AAPL"`, `"SPY"`, `"^VIX"`.
  - `period="5y"` — 기본 5년치.
  - `interval="1d"` — 기본 일봉.
  - `force_refresh=False` — `True`면 **신선한 캐시가 있어도 무시하고** 새로 받음(재학습 스케줄러가 이걸 씀).
  - 반환: 표준 OHLCV DataFrame, **timezone-naive** 인덱스.

```python
# L139-L147
    ticker = ticker.upper()
    path = _cache_path(ticker, interval, period)

    # OFFLINE_MODE: 캐시만 사용
    if OFFLINE_MODE:
        df = _read_cache(path, ticker)
        if df is not None and not df.empty:
            return _slice_to_period(df, period)
        raise ValueError(f"No cached data for ticker {ticker} (offline mode)")
```
- `ticker = ticker.upper()` — **입력 정규화**: 항상 대문자로. `path` 도 여기서 결정.
- **오프라인 모드 분기**: `OFFLINE_MODE`(L21)면 인터넷을 **아예 시도하지 않고** 캐시만 봄. 캐시가 있으면 기간 잘라 반환, 없으면 명확한 에러. (CI/데모/외부망 차단 환경용.)

```python
# L149-L153
    # 신선한 캐시가 있으면 바로 반환
    if not force_refresh and _is_fresh(path, PRICE_CACHE_TTL_MIN):
        df = _read_cache(path, ticker)
        if df is not None and not df.empty:
            return _slice_to_period(df, period)
```
- **1순위 — 신선한 캐시**: `force_refresh`가 아니고 캐시가 60분 이내면, 인터넷 없이 즉시 반환. 가장 빠른 경로. `_slice_to_period`로 요청 기간에 맞춰 잘라 줌.
- **헷갈림**: `_read_cache`가 어쩌다 `None`/빈 표를 주면(파일 깨짐) 이 `if`를 통과 못 하고 **아래 fetch 경로로 자연스럽게 흘러갑니다** — 즉 "신선한 줄 알았는데 못 읽으면 그냥 새로 받음".

```python
# L155-L162
    # 1순위: Polygon (일봉만 지원)
    df = None
    if interval == "1d":
        df = _fetch_polygon(ticker, period)

    # 2순위: yfinance
    if df is None or df.empty:
        df = _fetch_yfinance(ticker, period, interval)
```
- **2순위(코드 주석은 "1순위"라 표기) — Polygon**: **일봉(`1d`)일 때만** 시도. 주봉/월봉 요청이면 Polygon을 건너뜀(Polygon 경로가 일봉 전용이라).
- **3순위 — yfinance**: Polygon이 `None`이거나 빈 표면 야후로. `interval != "1d"`(주봉 등)면 `df`가 처음부터 `None`이라 곧장 yfinance가 받습니다 — 즉 **비일봉은 항상 yfinance**.
- **헷갈림 주의**: 주석의 "1순위/2순위"는 캐시를 뺀 **외부 소스 순서**를 말합니다. docstring 기준 전체로는 캐시가 1, Polygon이 2, yfinance가 3입니다. 숫자에 너무 매이지 말고 **폭포 순서**로 이해하세요.

```python
# L164-L170
    # 3순위: 오래된 캐시
    if df is None or df.empty:
        log.warning("all sources failed for %s — trying stale cache", ticker)
        df = _read_cache(path, ticker)
        if df is not None and not df.empty:
            return df
        raise ValueError(f"No data for ticker {ticker}")
```
- **4순위(최후 수단) — 오래된(stale) 캐시**: 모든 인터넷 소스가 실패하면, **유통기한 지난 캐시라도** 꺼내 씀. "조금 오래된 데이터 ≫ 데이터 없음"이라는 판단.
- 그것마저 없으면 `ValueError("No data for ticker ...")` — 더는 손 쓸 수 없음을 명확히 알림.
- **헷갈림**: 여기서 반환하는 stale 캐시는 `_slice_to_period`를 **안 거칩니다**(통째 반환). 위급 상황이라 기간 자르기를 생략 — 미묘한 비일관성이지만 큰 문제는 아님(고도화 후보).

```python
# L172-L178
    # 캐시에 저장
    try:
        df.to_parquet(path)
    except Exception as e:
        log.warning("cache write failed %s: %s", ticker, e)

    return df
```
- **캐시 저장**: 새로 fetch에 성공한 데이터를 parquet로 디스크에 기록 → 다음 호출 때 1순위 캐시로 재사용. (여기 도달했다는 건 캐시가 아니라 인터넷에서 새로 받았다는 뜻.)
- `try/except` — 디스크 권한·용량 문제로 저장이 실패해도 **데이터 반환은 막지 않음**(저장은 "있으면 좋은" 부가기능).
- 마지막 `return df` — 최종적으로 표준 OHLCV DataFrame을 돌려줌.

---

### J. 최신 종가 한 개 `get_latest_close` — `L181-L183`

```python
# L181-L183
def get_latest_close(ticker: str) -> float:
    df = get_history(ticker, period="5d", interval="1d")
    return float(df["Close"].iloc[-1])
```
- **무엇을**: 종목의 **가장 최근 종가 1개**를 float으로 반환.
- **어떻게**: `period="5d"`로 **최근 5일치만** 가볍게 받아(전체 5년 받을 필요 없음), `df["Close"]`(종가 컬럼) 의 `.iloc[-1]`(맨 마지막=가장 최근 값) 을 꺼내 `float`으로 변환.
- **왜 5일?**: 주말·공휴일이 끼면 "최근 1일"만 받으면 빈 표가 될 수 있어, **여유롭게 5일** 받아 마지막 줄을 씀.
- **호출처**: `main.py:120` `/price` 엔드포인트, `main.py:598` 등 — "지금 이 종목 얼마야?"에 답할 때.
- **헷갈림**: `auto_adjust=True` 이므로 이 종가도 **수정주가**입니다. 실시간 호가가 아니라 **마지막 거래일 종가**(장중이면 어제·오늘 마감값)라는 점에 유의.

---

### K. 여러 종목 한 번에 `get_multiple` — `L186-L188`

```python
# L186-L188
def get_multiple(tickers: list[str], period: str = "5y") -> dict[str, pd.DataFrame]:
    """Bulk-fetch (sequential, cached)."""
    return {t: get_history(t, period=period) for t in tickers}
```
- **무엇을**: 종목 리스트를 받아 `{종목코드: 그 종목 DataFrame}` 딕셔너리로 한 번에 반환.
- **어떻게**: 딕셔너리 컴프리헨션으로 각 종목마다 `get_history`를 **순차 호출**. 각 호출이 캐시·폴백을 그대로 누림.
- **헷갈림 / 함정**: 주석대로 **순차(sequential)** 입니다 — 병렬이 아님. 종목이 많으면 느릴 수 있고, **한 종목이 `ValueError`로 죽으면 전체가 중단**됩니다(부분 성공을 보장하지 않음). 대량·견고성이 필요하면 고도화 대상.

---

## ⚠️ 함정·버그 주의 (코드에 박힌 교훈 + 운영 리스크)

1. **이름의 함정** — 파일명·import는 `yf`(야후)지만 **1순위 소스는 Polygon**. "야후 전용"이라 단정하지 말 것. (stooq 폴백은 **없음**.)
2. **레이트리밋(rate limit)** — yfinance·Polygon 모두 너무 잦은 호출은 차단/지연됩니다. 그래서 ① **캐시 TTL 60분** ② `threads=False`(순차) ③ Polygon 무료키는 15분 지연 데이터(`polygon_client` 주석)로 완화. 대량 백테스트 시 캐시를 잘 쓰는 게 중요.
3. **결측치(NaN)** — 모든 fetch 경로가 `dropna()`로 빈 줄을 버립니다. 즉 휴장·누락일은 표에서 빠집니다(달력상 연속이 아닐 수 있음 — `freq` 기반 계산 시 유의).
4. **타임존** — yfinance 경로는 `tz_localize(None)`으로 타임존을 떼지만, **Polygon 경로엔 명시적 제거가 없습니다**(polygon_client가 naive를 준다는 전제). 두 소스를 섞어 비교할 일이 있으면 인덱스 타임존을 한 번 더 확인하세요.
5. **`ANALYTICS_OFFLINE_CACHE` 값** — 반드시 `1`/`0`. `true`/`false`(문자)를 넣으면 `int()`에서 **앱 기동/호출 중 예외**.
6. **기간 근사** — `_period_to_dates`는 `ytd`를 365일로, `max`를 ~30년으로 **근사**하고 윤년 보정이 없습니다. "정확한 연초부터" 같은 요구엔 부정확.
7. **`get_multiple`의 올-오어-낫싱** — 한 종목 실패 시 전체 중단. 부분 결과가 필요하면 try/except로 감싸야 함.
8. **stale 캐시의 무음 위험** — 인터넷이 며칠 끊겨도 `get_history`는 **오래된 캐시를 조용히** 반환합니다(최신처럼). 데이터 신선도가 중요한 의사결정(실주문)에선 날짜(`df.index[-1]`)를 확인하는 습관이 안전합니다.
9. **MultiIndex 펴기 의존** — yfinance가 컬럼을 2층으로 줄 때 `get_level_values(0)`이 이를 폄. yfinance 버전이 또 바뀌어 형식이 달라지면 여기서 깨질 수 있는 잠재 지점.

---

## 🚀 고도화 아이디어 (강의·개선 버전용)

- **정확한 기간 계산**: `_period_to_dates`에서 `ytd`를 실제 연초(`date(today.year,1,1)`)로, `max`를 진짜 상장일/무제한으로, `dateutil.relativedelta`로 윤년·월 단위를 정확히. (현재 365일 근사 → 정밀화.)
- **stale 캐시 일관성**: 4순위 stale 반환에도 `_slice_to_period`를 적용하고, 반환 데이터의 **마지막 날짜를 로그/메타로 노출**해 "얼마나 오래됐는지" 호출부가 알게.
- **`get_multiple` 견고화**: 종목별 try/except로 **부분 성공** 허용 + (안전 범위 내) 병렬화로 속도 개선.
- **소스 표기 메타데이터**: 반환 DataFrame에 `df.attrs["source"] = "polygon"|"yfinance"|"cache"`를 달아, 다운스트림이 데이터 출처를 알 수 있게(디버깅·신뢰성).
- **결측 처리 옵션화**: 무조건 `dropna` 대신, 캘린더 재인덱싱+`ffill` 선택지를 둬 "달력상 연속"이 필요한 계산을 지원.
- **타임존 통일 헬퍼**: Polygon/yfinance 분기마다 흩어진 `tz_localize` 로직을 **공통 정규화 함수**로 묶어 일관성 보장.
- **캐시 무효화 정책**: 종목별로 다른 TTL(거래 활발한 종목은 짧게), 또는 "마지막 거래일이 오늘이면 신선"처럼 **달력 기반** 신선도.
- **레이트리밋 백오프**: fetch 실패 시 지수 백오프(exponential backoff) + 재시도로 일시적 차단에 더 강하게.

---

## 📚 용어 사전 (이 파일 한정)

| 용어 | 뜻 |
|---|---|
| **OHLCV** | 하루치 시가·고가·저가·종가·거래량 5개 값 |
| **DataFrame** | 여러 컬럼짜리 표(날짜 index + OHLCV 컬럼). `df["Close"]`로 한 컬럼 추출 |
| **yfinance(`yf`)** | 야후 파이낸스에서 주가를 받아오는 파이썬 라이브러리(2·3순위 소스) |
| **Polygon.io** | 유료/무료 키 기반 주가 API(1순위 소스, 일봉만 사용) |
| **parquet** | 표를 디스크에 저장하는 효율적 이진 파일 형식(캐시) |
| **TTL (`PRICE_CACHE_TTL_MIN`)** | 캐시 유통기한(분). 기본 60분 |
| **`auto_adjust=True`** | 액면분할·배당을 반영한 수정주가로 보정 |
| **MultiIndex 컬럼** | 컬럼이 2층(`('Close','AAPL')`)인 형태. `get_level_values(0)`로 폄 |
| **timezone-naive** | 시간대 정보가 없는 "그냥 날짜". 비교·정렬 에러 방지 |
| **`dropna`** | 빈 칸(NaN)이 있는 행 삭제 |
| **폴백(fallback) 폭포** | 소스 A 실패→B→캐시 순으로 차례로 시도하는 구조 |
| **stale 캐시** | 유통기한 지난(오래된) 캐시. 모든 소스 실패 시 최후 수단 |
| **`force_refresh`** | 신선한 캐시도 무시하고 강제로 새로 받기 |
| **OFFLINE_MODE** | 인터넷 없이 캐시만 사용하는 모드(`ANALYTICS_OFFLINE_CACHE=1`) |
| **레이트리밋** | API가 "너무 자주 부르지 마"라며 막는 호출 한도 |
| **`.iloc[-1]`** | 위치 기준 마지막 행(가장 최근 데이터) |
