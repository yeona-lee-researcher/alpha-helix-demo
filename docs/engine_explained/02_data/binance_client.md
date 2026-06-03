# `data/binance_client.py` — 바이낸스 크립토 데이터 수집기 (완전 라인별 해설)

> 원본: `analytics/app/data/binance_client.py` (305줄)
> 이 문서는 **교재 표준 형식**(`01_backtest/vbt_engine.md`)을 따릅니다.

---

## 📌 이 파일 한눈에

이 파일은 **"바이낸스 거래소에 전화 거는 통신원"** 입니다. 비트코인·이더리움 같은 코인의 **과거 가격(캔들)**, **호가창**, **24시간 시세**, **펀딩레이트**를 가져오고(읽기), 키가 있으면 **잔고 조회·주문 발행**(쓰기)까지 합니다.

비유: 바이낸스는 거대한 **수산시장**이고, 이 파일은 그 시장에 매일 전화해서 "어제 참치 시세가 어땠어? 지금 사겠다는 사람 호가는? 100kg 주문 넣어줘"를 대신 물어봐주는 **심부름꾼**입니다. 대부분의 질문(시세 조회)은 **공짜 공개 전화**(인증 불필요)지만, 실제 주문은 **회원증(API 키)** 이 있어야 합니다.

핵심 함수는 **공개(Public) 7개 + 인증(Private) 4개 + 내부 헬퍼 2개** 입니다:

| 함수 | 한 줄 역할 | 인증 |
|---|---|---|
| `ping()` | 서버 살아있나 확인 | 공개 |
| `get_klines(...)` | OHLCV 캔들 **최대 1000봉** 한 번에 조회 | 공개 |
| `get_klines_full(...)` | **페이지네이션**으로 긴 기간 캔들 전부 모음 | 공개 |
| `get_orderbook(...)` | 호가창(매수/매도 대기 주문) 조회 | 공개 |
| `get_ticker_24h(...)` | 24시간 시세 통계(가격변화·거래량) | 공개 |
| `get_funding_rate(...)` | 선물 펀딩레이트(롱/숏 과열 지표) | 공개 |
| `_sign(...)` | 요청에 HMAC-SHA256 **서명** 붙이기 | 헬퍼 |
| `_auth_headers()` | API 키 헤더 만들기 | 헬퍼 |
| `get_account_balance()` | 내 스팟 계좌 잔고 | 인증 |
| `place_spot_order(...)` | 스팟(현물) 주문 발행 | 인증 |
| `place_futures_order(...)` | 선물 주문 발행(레버리지·롱/숏) | 인증 |

**누가 호출하나?** (실제 코드 기준)
- `data/collector.py` — `get_klines_full()` 로 코인 일봉을 긁어 MySQL(`market_ohlc_daily`)에 적재(`collect_crypto_ohlcv`).
- `app/main.py` — `/health` 에서 `ping()`, 캔들 캐시 미스 시 `get_klines_full()`, `/orderbook`·`/ticker`·`/funding` 엔드포인트에서 각 함수.
- `backtest/futures_engine.py` — `get_klines_full()`(가격) + `get_funding_rate()`(펀딩) 으로 선물 백테스트 재료 수집.

즉 이 파일은 **"크립토 백테스트·시그널의 원재료(가격)를 외부에서 끌어오는 최상류 수도꼭지"** 입니다. vbt_engine 이 요리사라면, 이 파일은 **식재료를 시장에서 사오는 사람**입니다.

> 💡 핵심: 이 파일이 돌려주는 캔들 DataFrame 의 컬럼 형식 `(timestamp, symbol, source, open, high, low, close, volume, quote_volume)` 은 야후·Polygon 등 **다른 데이터 소스와 똑같이 맞춰져** 있습니다. 그래야 `market_db` 가 소스에 상관없이 한 테이블에 합칠 수 있습니다.

---

## 🧠 사전 지식 (이거 모르면 막힘)

#### 1) klines(클라인) = "캔들스틱(봉) 데이터"
- `klines` 는 바이낸스 용어로 **캔들스틱(candlestick)** 의 줄임. 일정 시간(예: 1일) 동안의 가격을 **4개 값**으로 요약합니다.
```
하나의 "일봉(1d 캔들)" =
  open  (시가)  : 그날 처음 가격
  high  (고가)  : 그날 최고 가격
  low   (저가)  : 그날 최저 가격
  close (종가)  : 그날 마지막 가격
  + volume(거래량)
```
- 이 4개(OHLC)에 거래량(V)을 더해 **OHLCV** 라 부릅니다. 캔들 하나 = "봉(bar)" 하나.

#### 2) ms 타임스탬프 = "1970년부터 흐른 밀리초"
- 바이낸스는 시간을 **숫자 하나**로 줍니다. `1704067200000` 같은 큰 정수 = **1970-01-01 00:00:00 UTC 부터 흐른 밀리초(ms)** 수.
- 사람이 읽는 날짜로 바꾸려면: `pd.to_datetime(값, unit="ms", utc=True)`. (초 단위면 `unit="s"`, 바이낸스는 항상 **ms**.)
- 반대로 "2020-01-01" → ms 로 바꾸려면: `int(pd.Timestamp("2020-01-01", tz="UTC").timestamp() * 1000)`. `.timestamp()` 가 **초**를 주므로 `* 1000` 으로 ms 화.
```
"2024-01-01" ──×1000──▶ 1704067200000 (ms)  ← API 에 줄 때
1704067200000 ──to_datetime──▶ 2024-01-01 00:00:00+00:00  ← 사람이 읽을 때
```

#### 3) 페이지네이션(pagination) = "1000봉씩 끊어서 여러 번 받기"
- 바이낸스 klines API 는 **한 번에 최대 1000봉**만 줍니다. 5년치 일봉(약 1825봉)을 한 번에 못 받습니다.
- 그래서 **"시작 시점부터 1000봉 받고 → 마지막 봉 시점 다음부터 또 1000봉 받고 → ..."** 를 끝까지 반복합니다. 이게 페이지네이션.
- 비유: 1000쪽까지만 복사되는 복사기로 5000쪽 책을 복사 — 1000쪽씩 5번 돌려 이어붙이기.

#### 4) 공개(Public) vs 인증(Private) 엔드포인트
| 구분 | 공개 API | 인증 API |
|---|---|---|
| 예 | klines, 호가창, 시세 | 잔고, 주문 |
| 필요한 것 | **없음** (그냥 GET) | **API 키 + 시크릿** |
| 헤더 | 없음 | `X-MBX-APIKEY: 키` |
| 서명 | 없음 | 파라미터를 시크릿으로 **HMAC-SHA256 서명** |
- "조회만 = 누구나, 돈 움직이기 = 본인 인증" 이라고 보면 됩니다.

#### 5) HMAC-SHA256 서명 = "위조 못 하는 봉인 도장"
- 인증 요청은 **시크릿 키로 파라미터 전체에 도장**을 찍어 보냅니다. 바이낸스는 같은 시크릿으로 도장을 다시 찍어보고 일치하면 "진짜 본인"으로 인정.
- 시크릿은 **절대 네트워크로 보내지 않고**, 도장(서명, signature)만 보냅니다. 그래서 중간에서 봐도 시크릿을 알 수 없습니다.

#### 6) `httpx` = "파이썬용 HTTP 전화기"
- `httpx.get(url, params=...)` = 그 주소로 질문(요청)을 보내고 답(응답)을 받습니다. `requests` 라이브러리의 최신 사촌.
- `resp.raise_for_status()` = "답이 에러 코드(4xx/5xx)면 예외를 던져라". 조용히 넘어가지 않게 하는 안전장치.
- `resp.json()` = 응답 본문(JSON 텍스트)을 파이썬 객체(list/dict)로 변환.

---

## 🗺 전체 흐름도

```
                       [환경변수 읽기 — 모듈 로드 시 1회]
   BINANCE_BASE_URL ─┐   (기본 https://api.binance.us)
   BINANCE_TESTNET ──┼──▶ _BASE_URL      (스팟 조회/주문 주소)
   BINANCE_API_KEY ──┘    _BASE_URL_FAPI (선물 주소)

────────────── 공개(인증 불필요) ──────────────
  get_klines_full("BTCUSDT", "2020-01-01")
        │  start_date → ms 변환
        ▼
  while cur < end_ms:                       ◀── 페이지네이션 루프
        │   get_klines(limit=1000, startTime=cur)
        │        │  GET _BASE_URL/api/v3/klines
        │        ▼
        │   raw(JSON 2차원 배열) → DataFrame(12컬럼)
        │        │  open_time → timestamp(ms→datetime)
        │        │  숫자컬럼 → to_numeric
        │        ▼
        │   df[9개 컬럼만 추림]  ──▶ frames 에 append
        │   cur = 마지막봉시각 + 1; sleep(0.1)
        ▼
  pd.concat(frames) ──▶ 최종 OHLCV DataFrame
        │
        ▼
  collector / main / futures_engine  ──▶ market_db(MySQL) 적재 or 백테스트

────────────── 인증(키 필요) ──────────────
  place_spot_order(...) ─▶ _sign(params) ─▶ POST + _auth_headers()
                          (HMAC 서명)       (X-MBX-APIKEY)
```

---

## 📖 라인별 해설

### A. 파일 설명서(docstring) + import — `L1-L25`

```python
# L1-L11
"""
Binance Public REST client — 인증 불필요 (Public API).
코인 OHLCV, 오더북, 펀딩레이트, 시장 개요.

환경변수:
  BINANCE_API_KEY    : (선택) 계정 주문 발행 시 필요
  BINANCE_API_SECRET : (선택) 계정 주문 발행 시 필요
  BINANCE_TESTNET    : "1" 이면 testnet 사용

Public API는 키 없이 사용 가능 (IP당 분당 1200 req 제한).
"""
```
- **무엇을** — 파일 맨 위 설명서(docstring). 실행되지 않고 사람이 읽는 용도. "이 파일은 바이낸스 공개 REST 클라이언트, 키는 선택, 분당 1200 요청 제한" 이라는 핵심 3가지를 알려줍니다.
- **왜** — 환경변수 3개(`API_KEY`/`API_SECRET`/`TESTNET`)와 레이트리밋(분당 1200)을 미리 박아둬, 읽는 사람이 "키 없어도 시세는 되는구나, 너무 자주 부르면 막히는구나"를 즉시 알게 함.
- **헷갈리는 포인트** — "Public API 인증 불필요" 라고 적혀 있지만, 파일 **아래쪽**에는 키가 필요한 주문 함수도 같이 들어 있습니다(L199 이후). docstring 은 이 파일의 **주 용도(공개 조회)** 를 강조한 것일 뿐, 인증 함수가 없다는 뜻이 아닙니다.

```python
# L12-L25
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
```
- `from __future__ import annotations` — 타입힌트를 문자열처럼 늦게 평가하게 하는 파이썬 주문(초보는 "최신 타입표기 허용 마법" 정도로). vbt_engine 과 동일.
- `hashlib`, `hmac` — **서명(도장)** 만드는 데 쓰는 표준 암호 모듈. HMAC-SHA256 서명을 만들 때 `hmac.new(...sha256)` 으로 씀(아래 `_sign`).
- `os` — 환경변수 읽기(`os.getenv`). `time` — 현재시각(ms)·`sleep`. `datetime/timezone` — UTC 시각 만들기.
- `urlencode` — 딕셔너리를 `a=1&b=2` 형태의 쿼리 문자열로 변환(서명 대상이 되는 문자열을 만들 때 필요).
- `httpx` — HTTP 전화기. `pandas(pd)` — 표 데이터.
- `log = logging.getLogger(__name__)` — 이 모듈 전용 로거. 에러를 화면에 print 하지 않고 로그 시스템으로 흘려보냄(운영 표준).

> 💡 초보 포인트: `Optional[int]` = "정수이거나 None(없음)". 함수 인자에 자주 나오는데 "있어도 되고 없어도 되는 값"을 뜻합니다.

---

### B. 환경변수 → 거래소 주소 결정 — `L27-L37`

```python
# L27-L37
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
```
- **무엇을** — 모듈이 처음 로드될 때 **딱 한 번** 환경변수를 읽어 "어느 거래소 주소로 전화할지"를 정합니다. 이 변수들은 이후 모든 함수가 공유합니다.
- **줄별로**:
  - `os.getenv("BINANCE_API_KEY", "")` — 환경변수가 없으면 빈 문자열 `""`. (그래서 키 없이도 모듈은 멀쩡히 로드되고, 공개 함수는 잘 돕니다. 인증 함수만 나중에 "키 없음" 에러를 냄.)
  - `_USE_TESTNET = ... == "1"` — `BINANCE_TESTNET` 가 **문자열 "1"** 이면 True. (환경변수는 항상 문자열이라 숫자 1 이 아니라 문자 "1" 과 비교.)
  - `_BINANCE_BASE_URL` 기본값 `https://api.binance.us` — **미국 규제 준수** 도메인. 주석대로 글로벌 `api.binance.com` 은 **미국 IP에서 HTTP 451**(법적 차단) 로 막힙니다. 이 프로젝트는 AWS us-east 에 배포되므로 `.us` 가 안전 기본값.
  - `_BASE_URL` — testnet 이면 `testnet.binance.vision`(가짜 돈 연습 서버), 아니면 위에서 정한 실거래 도메인.
  - `_BASE_URL_FAPI` — **선물(Futures)** 전용 주소(`fapi`). 주석대로 미국에선 선물이 미지원이라, 실제로는 yfinance 폴백을 쓰는 경우가 있음(futures_engine 쪽).
  - `_TIMEOUT = 20.0` — 모든 요청의 기본 대기 한도 20초. (응답이 20초 넘게 안 오면 끊고 예외.)
- **왜 이렇게** — 도메인을 **환경변수로 갈아끼울 수 있게** 해서, 코드 수정 없이 "미국/글로벌/테스트넷"을 전환합니다. 배포 환경(EC2 위치)에 따라 451 차단을 피하는 실전 노하우가 그대로 코드에 박혀 있습니다.
- **헷갈리는 포인트** — 변수 앞 `_`(언더스코어)는 "이 모듈 내부 설정값, 밖에서 직접 만지지 마세요" 라는 관습 표시. `_BASE_URL` 과 `_BASE_URL_FAPI` 는 **서로 다른 서버**(스팟 ≠ 선물)라는 점을 꼭 기억. 펀딩레이트·선물주문만 `FAPI` 를 씁니다.

> ⚠️ 메모리 주의: `testnet.binance.vision` 은 testnet 스팟 주소입니다. 작업 지시문에 나온 `data-api.binance.vision` 은 이 코드에 **존재하지 않습니다**(실제 코드는 `api.binance.us` / `api.binance.com` / `testnet.binance.vision` 만 사용). 문서는 실제 코드 기준으로 작성됩니다.

---

### C. 편의 매핑 상수 — `L39-L51`

```python
# L39-L51
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
```
- `SPOT_SYMBOLS` — 짧은 별명(`"BTC"`)을 바이낸스 실제 심볼(`"BTCUSDT"`)로 바꾸는 사전. 바이낸스에선 코인을 **항상 거래쌍**으로 부릅니다: `BTCUSDT` = "BTC 를 USDT(달러 스테이블코인)로 사고판다".
- `INTERVAL_MAP` — 지원하는 캔들 간격 목록. 키=값이 같은 자기참조 사전인데, 이건 **"유효한 간격 화이트리스트"** 역할(허용된 간격인지 검증·열거할 때 사용 가능). 1분~1주까지 지원.
- **헷갈리는 포인트** — 이 두 상수는 이 파일 함수들이 **내부에서 강제로 쓰지는 않습니다**(예: `get_klines` 는 `symbol`·`interval` 을 그대로 받음). 호출자가 편하라고 노출한 **참고용 매핑**입니다.

---

### D. 서버 핑 `ping()` — `L57-L63`

```python
# L57-L63
def ping() -> bool:
    """Binance API 서버 연결 확인."""
    try:
        resp = httpx.get(f"{_BASE_URL}/api/v3/ping", timeout=5)
        return resp.status_code == 200
    except Exception:
        return False
```
- **무엇을** — 바이낸스 서버가 응답하는지 확인. `/api/v3/ping` 은 **빈 응답을 주는 헬스체크 전용 엔드포인트**. 200(정상)이면 `True`.
- **왜** — `main.py` 의 `/health` 가 이걸 불러 "바이낸스 연결 OK?"를 대시보드에 표시. 외부 의존성이 살아있는지 빠르게 점검.
- **헷갈리는 포인트** — 예외가 나면(네트워크 끊김 등) **에러를 던지지 않고 조용히 `False`**. 헬스체크는 실패해도 앱이 죽으면 안 되므로 일부러 `try/except` 로 삼킴. `timeout=5` 로 다른 함수(20초)보다 빨리 포기 — 헬스체크는 빨라야 하니까.

---

### E. 캔들 1000봉 조회 `get_klines()` — `L66-L106` (이 파일의 알맹이 ①)

함수 머리 + docstring:
```python
# L66-L78
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
```
- **입력**: `symbol`(거래쌍), `interval`(기본 일봉), `limit`(기본 500), `start_time_ms`/`end_time_ms`(ms 범위, 선택).
- **출력**: 표준 9컬럼 OHLCV DataFrame. (다른 데이터소스와 동일 형식.)

파라미터 준비:
```python
# L79-L84
    symbol = symbol.upper()
    params: dict = {"symbol": symbol, "interval": interval, "limit": min(limit, 1000)}
    if start_time_ms:
        params["startTime"] = start_time_ms
    if end_time_ms:
        params["endTime"] = end_time_ms
```
- `symbol.upper()` — `"btcusdt"` 로 와도 대문자로 통일(바이낸스는 대문자 심볼).
- `"limit": min(limit, 1000)` — **여기가 1000봉 상한의 핵심**. 호출자가 5000 을 넣어도 강제로 1000 으로 깎음. 바이낸스가 한 번에 최대 1000봉만 주기 때문(사전지식 3).
- `if start_time_ms:` — **값이 있을 때만** 파라미터에 추가. `None` 이거나 `0` 이면 안 넣음 → 바이낸스가 "가장 최근 limit개"를 알아서 줌.
- **헷갈리는 포인트** — `if start_time_ms:` 는 `0` 도 거짓으로 봅니다. ms 타임스탬프 0 = 1970년이라 실무에선 안 쓰여 문제 없지만, "0 이면 무시된다"는 파이썬 진리값 규칙은 알아두기.

요청 + 에러 처리:
```python
# L86-L94
    try:
        resp = httpx.get(f"{_BASE_URL}/api/v3/klines", params=params, timeout=_TIMEOUT)
        resp.raise_for_status()
    except httpx.HTTPStatusError as e:
        raise RuntimeError(f"Binance klines HTTP {e.response.status_code}: {e.response.text}") from e

    raw = resp.json()
    if not raw:
        return pd.DataFrame()
```
- `httpx.get(.../api/v3/klines, params=...)` — 캔들 조회 엔드포인트로 GET. `params` 는 자동으로 `?symbol=BTCUSDT&interval=1d&limit=1000` URL 로 붙음.
- `raise_for_status()` — 4xx/5xx 면 예외 발생. 이걸 잡아 **`RuntimeError` 로 다시 던지며 상태코드+응답본문을 메시지에 담음**. 왜? 원래 `httpx` 예외보다 "바이낸스가 뭐라고 거절했는지(본문)"가 디버깅에 훨씬 유용하기 때문. `from e` 는 원인 예외 체인 보존.
- `raw = resp.json()` — 응답을 파이썬 **리스트의 리스트(2차원 배열)** 로. 바이낸스 klines 는 객체가 아니라 **배열로** 줍니다(아래 컬럼 해설 참고).
- `if not raw: return pd.DataFrame()` — 응답이 빈 배열(해당 기간 데이터 없음)이면 **빈 DataFrame** 반환. 호출자가 `.empty` 로 판단할 수 있게.

원시 배열 → DataFrame 변환:
```python
# L96-L106
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
```
- **무엇을** — 바이낸스가 준 **12칸짜리 배열**에 사람이 읽을 컬럼 이름을 붙이고, 우리가 쓸 9개만 골라 표준 DataFrame 으로 정리.
- **바이낸스 klines 의 12개 칸**(순서 고정, 이름은 우리가 붙임):
  ```
  [0] open_time(ms)   [1] open    [2] high   [3] low
  [4] close           [5] volume  [6] close_time(ms)
  [7] quote_volume    [8] trades  [9] taker_buy_base
  [10] taker_buy_quote [11] ignore(미사용, 항상 "0")
  ```
  바이낸스는 용량 절약을 위해 키 없는 **위치 기반 배열**로 줍니다. 그래서 우리가 `columns=[...]` 로 12개 이름을 **정확한 순서대로** 매겨야 합니다. (순서 하나 틀리면 high/low 가 뒤바뀌는 식의 조용한 버그!)
- `pd.to_datetime(df["open_time"], unit="ms", utc=True)` — **봉의 시작 시각**(open_time)을 ms→UTC datetime 으로. 이게 우리 표준 `timestamp` 컬럼. (close_time 이 아니라 **open_time** 을 기준 시각으로 씀에 주의.)
- `for col in [...]: pd.to_numeric(...)` — 바이낸스는 가격·거래량을 **문자열**("42350.10")로 줍니다. 계산하려면 숫자로 변환 필수. 6개 숫자 컬럼만 변환.
- `df["symbol"] = symbol; df["source"] = "binance"` — 출처 표식 2칸 추가. 나중에 여러 소스를 한 DB 테이블에 섞어도 "이 행은 BTCUSDT, 바이낸스 출처"를 구분.
- `return df[[9개 컬럼]].copy()` — `trades`·`taker_buy_*`·`ignore` 등은 버리고 **표준 9컬럼만**. `.copy()` 는 슬라이스가 원본의 뷰가 아닌 독립 사본이 되게 해 `SettingWithCopyWarning` 방지.
- **헷갈리는 포인트** — `quote_volume`(=거래대금, USDT 기준)과 `volume`(=수량, 코인 개수)은 다릅니다. BTCUSDT 면 `volume`=거래된 BTC 개수, `quote_volume`=거래된 USDT 금액.

> 💡 초보 포인트: "왜 12개를 다 이름 붙이고 9개만 쓰나?" → `pd.DataFrame(raw, columns=...)` 은 컬럼 개수가 데이터 칸 수와 **정확히 일치**해야 합니다. 12칸 데이터엔 12개 이름이 필요. 그다음 필요 없는 3개를 버리는 게 자연스러운 흐름.

---

### F. 긴 기간 페이지네이션 `get_klines_full()` — `L109-L136` (이 파일의 알맹이 ②)

```python
# L109-L120
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
```
- **무엇을** — `get_klines`(최대 1000봉)를 **여러 번 호출해 이어붙여** 5년·10년치를 전부 받는 상위 함수. **collector·main·futures_engine 이 실제로 부르는 건 거의 다 이 함수**입니다.
- **입력**: 날짜를 **사람이 읽는 문자열**("2020-01-01")로 받음 — 호출자가 ms 를 몰라도 됨.
- `start_ms` — 시작 날짜를 ms 로 변환(사전지식 2). `pd.Timestamp(..., tz="UTC")` 로 UTC 못박고 `.timestamp()*1000`.
- `end_ms` — 끝 날짜가 주어지면 그걸 ms 로, **없으면 `time.time()*1000`(지금 이 순간)**. `time.time()` 은 **초**라 `*1000` 으로 ms 화. 즉 기본은 "시작일부터 현재까지 전부".

페이지네이션 루프:
```python
# L122-L136
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
```
- **루프 한 줄씩** (이 12줄이 페이지네이션의 정석):
  - `frames = []` — 받은 1000봉 묶음들을 차곡차곡 담을 리스트.
  - `cur = start_ms` — **현재 커서**(어디까지 받았나). 시작점부터.
  - `while cur < end_ms:` — 커서가 끝 시각에 도달할 때까지 반복.
  - `df = get_klines(..., limit=1000, start_time_ms=cur, end_time_ms=end_ms)` — 커서부터 1000봉 받기.
  - `if df.empty: break` — 더 줄 데이터가 없으면(빈 응답) 즉시 종료. **무한루프 방지 1**.
  - `frames.append(df)` — 받은 묶음 저장.
  - `last_ts = int(df["timestamp"].iloc[-1].timestamp() * 1000)` — 이번 묶음의 **마지막 봉 시각**을 ms 로. 다음 요청을 여기서부터 이어가려고.
  - `if last_ts <= cur: break` — 마지막 봉이 커서보다 앞이거나 같으면(진전 없음) 종료. **무한루프 방지 2**(혹시 같은 페이지가 계속 와도 멈춤).
  - `cur = last_ts + 1` — **다음 커서 = 마지막 봉 시각 + 1ms**. `+1` 이 핵심: 안 하면 마지막 봉이 다음 페이지 첫 봉으로 **중복**됨.
  - `time.sleep(0.1)` — **레이트리밋 회피**. 요청 사이 0.1초 쉬어 분당 1200 한도(사전지식 1)에 안 걸리게. 주석 `# Avoid rate limit`.
- `pd.concat(frames, ignore_index=True)` — 모든 묶음을 **세로로 이어붙여** 하나의 긴 DataFrame. `ignore_index=True` 로 행 번호를 0,1,2... 새로 매김(안 하면 각 묶음의 0~999 가 반복됨). `frames` 가 비면 빈 DataFrame.
- **왜 이렇게** — 1000봉 상한 + 무한루프 2중 방지 + 중복 방지(+1ms) + 레이트리밋 회피(sleep) 를 모두 갖춘 **견고한 페이지네이션**. 외부 API 를 긁을 때의 모범 패턴.
- **헷갈리는 포인트** — `cur = last_ts + 1` 의 `+1` 을 빼면 **마지막 봉이 매 페이지 첫 줄로 중복**되어 데이터가 부풀고, 운 나쁘면 `last_ts == cur` 가 되어 무한루프 직전까지 갑니다(L130 가드가 그제야 막음). "겹침 1ms 만큼 건너뛰기"가 핵심 트릭.

> 💡 미니 그림 (일봉, 5년 → 약 1825봉):
> ```
> [start_ms]━1000봉━▶[봉1000끝+1ms]━1000봉━▶[봉2000끝+1ms]━825봉━▶[end_ms]
>      페이지1            페이지2              페이지3(마지막, 빈응답 or 진전없음→break)
> ```

---

### G. 호가창 `get_orderbook()` — `L139-L156`

```python
# L139-L156
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
```
- **무엇을** — 지금 이 순간 **사겠다는 줄(bids)·팔겠다는 줄(asks)** 을 조회. `/api/v3/depth` 엔드포인트.
- **호가창이란** — `bids`(매수 호가) = "이 가격에 사겠다"는 대기 주문들, `asks`(매도 호가) = "이 가격에 팔겠다". 각 항목은 `[가격, 수량]`. `depth=20` = 위아래 20단계씩.
- `[[float(p), float(q)] for p, q in data["bids"]]` — 바이낸스가 문자열로 주는 가격·수량을 **숫자로 변환**하며 리스트 컴프리헨션으로 재구성.
- `datetime.now(timezone.utc).isoformat()` — 조회 시각을 ISO 문자열로(예: `2026-06-01T12:00:00+00:00`). klines 와 달리 호가창엔 서버 타임스탬프가 없어 **우리 쪽 현재 시각**을 찍음.
- **헷갈리는 포인트** — `depth` 는 5/10/20/50/100/500/1000 중 하나만 유효(docstring 명시). 임의 값(예: 17)을 넣으면 바이낸스가 거절할 수 있음. 이 함수는 `raise_for_status()` 만 하고 별도 검증은 안 하므로 호출자가 유효 값을 줘야 함.

---

### H. 24시간 시세 `get_ticker_24h()` — `L159-L174`

```python
# L159-L174
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
```
- **무엇을** — 최근 24시간 요약: 현재가·변동률·고가·저가·거래량. `/api/v3/ticker/24hr`.
- **왜** — 프론트의 "코인 카드"(현재가 + 빨강/초록 변동률)를 채우는 데 딱 맞는 1회 호출.
- `float(d["priceChangePercent"])` — 바이낸스는 변동률을 `"2.35"`(이미 %) 문자열로 줍니다. 그대로 숫자화하면 +2.35%. (0.0235 가 아님에 주의 — 이미 백분율.)
- **헷갈리는 포인트** — 바이낸스 응답 키는 **카멜케이스**(`lastPrice`, `highPrice`)인데, 우리는 **스네이크케이스**(`price`, `high_24h`)로 깔끔히 바꿔 돌려줍니다. 이 "외부 형식 → 우리 형식" 변환이 클라이언트의 중요한 역할.

---

### I. 펀딩레이트 `get_funding_rate()` — `L177-L196`

```python
# L177-L196
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
```
- **무엇을** — 선물 시장의 **펀딩레이트** 이력 조회. 이건 **선물 주소(`_BASE_URL_FAPI`)** 와 `/fapi/v1/fundingRate` 를 씁니다(스팟 주소 아님!).
- **펀딩레이트란** — 무기한 선물에서 롱·숏 균형을 맞추려 주기적으로 한쪽이 다른 쪽에 내는 수수료. **양수=롱(매수)이 과열, 음수=숏(매도)이 과열** → 시장 심리 지표. `futures_engine` 이 이걸 백테스트 피처로 씀.
- 변환은 klines 와 같은 패턴: `fundingTime`(ms)→`timestamp`, `fundingRate`(문자열)→숫자, `symbol` 추가, 표준 3컬럼만.
- **헷갈리는 포인트** — `_BASE_URL_FAPI` 는 미국에서 미지원(L36 주석). `api.binance.us` 환경에서 이 함수를 부르면 차단/오류가 날 수 있어, futures_engine 은 yfinance 폴백을 둡니다. **펀딩과 klines 가 서로 다른 서버**라는 점을 다시 강조.

---

### J. 인증 헬퍼 `_sign()` / `_auth_headers()` — `L202-L215`

```python
# L202-L209
def _sign(params: dict) -> dict:
    """HMAC-SHA256 서명 추가."""
    if not BINANCE_API_SECRET:
        raise RuntimeError("BINANCE_API_SECRET not set")
    query = urlencode(params)
    sig = hmac.new(BINANCE_API_SECRET.encode(), query.encode(), hashlib.sha256).hexdigest()
    params["signature"] = sig
    return params
```
- **무엇을** — 인증 요청 파라미터에 **위조 불가능한 도장(서명)** 을 붙임.
- **줄별로**:
  - `if not BINANCE_API_SECRET: raise` — 시크릿 없으면 즉시 명확한 에러. (공개 함수와 달리 인증 함수는 시크릿이 필수.)
  - `query = urlencode(params)` — 파라미터를 `symbol=BTCUSDT&side=BUY&...&timestamp=...` 문자열로. **이 문자열 전체가 서명 대상**.
  - `hmac.new(시크릿.encode(), query.encode(), sha256).hexdigest()` — 시크릿을 열쇠로 query 문자열을 HMAC-SHA256 해싱 → 16진수 문자열 서명. 바이낸스가 같은 방식으로 재계산해 일치 확인.
  - `params["signature"] = sig` — 서명을 파라미터에 추가해 돌려줌.
- **헷갈리는 포인트** — `urlencode` 가 만든 **그 순서·인코딩 그대로** 서명하고, 그 `params` 를 그대로 요청에 써야 합니다. 서명 후 파라미터를 더 추가하거나 순서를 바꾸면 서명 불일치(`-1022 Signature ... invalid`)로 거절됩니다.

```python
# L212-L215
def _auth_headers() -> dict:
    if not BINANCE_API_KEY:
        raise RuntimeError("BINANCE_API_KEY not set")
    return {"X-MBX-APIKEY": BINANCE_API_KEY}
```
- **무엇을** — 인증 요청에 붙일 헤더 `{"X-MBX-APIKEY": 키}` 생성. 키 없으면 즉시 에러.
- **왜** — 바이낸스는 **헤더의 API 키(누구냐)** + **파라미터의 서명(진짜냐)** 두 가지를 함께 검사합니다. 키는 헤더로, 서명은 파라미터로 — 역할이 다름.

---

### K. 잔고 조회 `get_account_balance()` — `L218-L229`

```python
# L218-L229
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
```
- **무엇을** — 내 스팟 계좌의 코인별 잔고 조회(`/api/v3/account`).
- `_sign({"timestamp": ...})` — 인증 요청은 **반드시 `timestamp`(현재 ms)** 가 필요. 바이낸스가 "너무 오래된 요청"(재전송 공격)을 거르기 위함. 그 timestamp 를 서명.
- `headers=_auth_headers(), params=params` — 키(헤더) + 서명(파라미터) 둘 다 실어 보냄.
- `[b for b in balances if float(b["free"]) > 0 or float(b["locked"]) > 0]` — 잔고가 0인 코인(수백 개)은 버리고 **실제로 가진 것만** 필터. `free`(자유 잔고) + `locked`(주문에 묶인 잔고).
- **헷갈리는 포인트** — `timestamp` 가 서버 시계와 너무 어긋나면(`recvWindow` 초과) `-1021` 에러. 로컬 시계가 틀리면 실패하므로 시간 동기화 중요.

---

### L. 스팟 주문 `place_spot_order()` — `L232-L266`

```python
# L232-L256
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
```
- **무엇을** — 실제 현물 매수/매도 주문(`/api/v3/order`). **돈이 움직이는 함수.**
- **인자**: `side`(BUY/SELL), `order_type`(MARKET=시장가/LIMIT=지정가), `quantity`(수량), `price`(지정가일 때만), `time_in_force`(주문 유효기간, 기본 GTC).
- `if order_type.upper() == "LIMIT":` — **지정가 주문이면** `price` 가 필수. 없으면 `ValueError`. 그리고 `timeInForce` 추가.
  - `GTC`(Good Till Canceled) = 취소할 때까지 유효. (다른 값: `IOC`/`FOK`.)
- **헷갈리는 포인트** — MARKET 주문엔 `price` 를 안 넣음(현재 시장가로 즉시 체결). LIMIT 에만 `price`·`timeInForce` 가 붙는 **조건부 파라미터** 구조.

```python
# L258-L266
    params = _sign(params)
    resp = httpx.post(
        f"{_BASE_URL}/api/v3/order",
        headers=_auth_headers(),
        params=params,
        timeout=_TIMEOUT
    )
    resp.raise_for_status()
    return resp.json()
```
- `params = _sign(params)` — **모든 파라미터를 다 채운 뒤 마지막에 서명**(서명 후엔 절대 파라미터 변경 금지).
- `httpx.post(...)` — 주문은 조회와 달리 **POST**(상태를 바꾸는 동작이므로). 키 헤더 + 서명 파라미터 동봉.
- `return resp.json()` — 바이낸스의 체결 결과(주문ID·체결가·수량 등)를 그대로 반환.

---

### M. 선물 주문 `place_futures_order()` — `L269-L304`

```python
# L269-L304
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
```
- **무엇을** — 선물 주문(`/fapi/v1/order`, **선물 서버**). 스팟과 거의 같지만 **두 가지 차이**:
  - `_BASE_URL_FAPI` — 스팟이 아닌 **선물 도메인**으로 POST.
  - `"reduceOnly": str(reduce_only).lower()` — **포지션 축소 전용 플래그**. True 면 "기존 포지션을 줄이기만(반대 포지션 신규 진입 금지)". `str(True).lower()` = `"true"` (바이낸스는 문자열 "true"/"false" 를 기대).
- **선물 특성** — 레버리지·롱(상승 베팅)·숏(하락 베팅) 모두 가능. 그래서 청산 위험이 있어 `reduceOnly` 같은 안전장치가 있음.
- **헷갈리는 포인트** — 이 함수는 `_BASE_URL_FAPI` 를 쓰므로 **미국 환경(`api.binance.us`)에선 사실상 사용 불가**(L36 주석: 미국 미지원). 메모리상으로도 FUTURES·WS 는 "남은 것"으로 표시된 미완 영역.

---

## ⚠️ 함정·버그 주의 (코드에 박힌 교훈 모음)

1. **레이트리밋 429/418** — 분당 1200 요청 초과 시 바이낸스가 **HTTP 429(Too Many Requests)** 를 주고, 무시하고 계속 때리면 **418(I'm a teapot = IP 밴)** 으로 일정 시간 차단. `get_klines_full` 의 `time.sleep(0.1)` 가 이 방어. 더 공격적으로 긁을 땐 sleep 을 늘려야 함.
2. **지역 차단 451** — 글로벌 `api.binance.com` 은 **미국 IP에서 HTTP 451**(법적 차단). 그래서 기본값이 `api.binance.us`. EC2 리전이 바뀌면 `BINANCE_BASE_URL` 을 맞춰야 함.
3. **선물은 별도 서버·미국 미지원** — `get_funding_rate`·`place_futures_order` 만 `_BASE_URL_FAPI`. 스팟 주소로 부르면 404. 미국 환경에선 아예 미지원이라 yfinance 폴백 필요.
4. **ms ↔ 날짜 혼동** — 바이낸스는 전부 **밀리초(ms)**. `time.time()`·`pd.Timestamp().timestamp()` 는 **초**라 항상 `*1000` 필요. unit 을 `"s"` 로 잘못 쓰면 1970년 근처 엉뚱한 날짜가 됨.
5. **페이지네이션 중복(+1ms)** — `cur = last_ts + 1` 의 `+1` 을 빼면 마지막 봉이 다음 페이지 첫 봉으로 중복. 데이터가 부풀고 진전이 멈춤.
6. **컬럼 순서 의존** — klines 는 키 없는 위치 배열. `columns=[...]` 12개 이름의 **순서가 한 칸이라도 틀리면** high/low 등이 조용히 뒤바뀌는 무서운 버그. 바이낸스 응답 포맷이 바뀌면 깨짐.
7. **문자열 숫자** — 가격·거래량·잔고가 전부 문자열("42350.10"). `float()`/`to_numeric()` 안 하면 `"42350.10" > "9"` 같은 **문자열 비교 버그**.
8. **서명 후 변경 금지** — `_sign` 호출 뒤 파라미터를 추가/변경하면 서명 불일치(`-1022`). 항상 **모든 파라미터 채운 뒤 마지막에 서명**.
9. **timestamp 시계 오차** — 인증 요청의 `timestamp` 가 서버와 어긋나면 `-1021`. 로컬 시계 동기화 필요.
10. **`if start_time_ms:` 의 0 함정** — ms 0(1970년)은 거짓으로 취급돼 무시됨. 실무엔 안 쓰여 무해하나 진리값 규칙은 인지.

---

## 🚀 고도화 아이디어 (강의·개선 버전용)

- **재시도(backoff)**: 429/418/5xx 시 지수 백오프(`sleep 0.1→0.2→0.4...`)로 자동 재시도. 지금은 첫 실패에 바로 예외.
- **레이트리밋 헤더 활용**: 바이낸스 응답 헤더 `X-MBX-USED-WEIGHT-1M` 을 읽어 한도 근접 시 동적으로 sleep 조절(고정 0.1초보다 똑똑).
- **비동기 수집**: `httpx.AsyncClient` 로 여러 심볼을 병렬 수집(단, 레이트리밋은 IP 단위라 동시성에 상한).
- **WebSocket 실시간**: 폴링 대신 `wss://` 스트림으로 실시간 체결·호가 구독(메모리상 "남은 것: WS").
- **klines 캐싱·증분 수집**: 이미 받은 마지막 timestamp 이후만 받는 증분 업데이트(현재 collector 는 기간 통째로 재요청 가능).
- **심볼/간격 검증**: `INTERVAL_MAP`·거래소 `exchangeInfo` 로 입력을 사전 검증해 잘못된 요청을 미리 차단.
- **testnet 통합 테스트**: `BINANCE_TESTNET=1` 로 주문 함수 E2E 자동 테스트(메모리상 testnet 실주문 E2E 이미 통과 — 회귀 테스트로 고정).
- **선물 폴백 일원화**: 미국 환경에서 `get_funding_rate` 가 451/404 시 자동으로 yfinance 폴백을 타도록 함수 안에 내장(현재는 호출자 책임).

---

## 📚 용어 사전 (이 파일 한정)

| 용어 | 뜻 |
|---|---|
| **klines / 캔들(봉)** | 일정 시간의 OHLCV 요약 한 줄. 바이낸스에선 키 없는 12칸 배열로 옴 |
| **OHLCV** | open(시가)·high(고가)·low(저가)·close(종가)·volume(거래량) |
| **ms 타임스탬프** | 1970-01-01 UTC 부터의 밀리초. 바이낸스 시간 표준 |
| **페이지네이션** | 1000봉 상한을 넘기려 끊어서 여러 번 받아 이어붙이기 |
| **레이트리밋(429/418)** | 분당 1200 초과 시 429, 계속하면 418로 IP 밴 |
| **HTTP 451** | 지역 법적 차단(글로벌 도메인을 미국 IP에서 호출 시) |
| **공개 vs 인증 엔드포인트** | 조회=키 불필요, 잔고·주문=키+서명 필요 |
| **HMAC-SHA256 서명** | 시크릿으로 파라미터에 찍는 위조불가 도장(signature) |
| **`X-MBX-APIKEY`** | 인증 요청의 API 키 헤더(누구인지) |
| **`_BASE_URL` vs `_BASE_URL_FAPI`** | 스팟 서버 ≠ 선물 서버. 펀딩·선물주문만 FAPI |
| **quote_volume vs volume** | 거래대금(USDT) vs 거래수량(코인 개수) |
| **bids / asks** | 호가창의 매수 대기 / 매도 대기 주문 `[가격, 수량]` |
| **펀딩레이트** | 무기한 선물의 롱·숏 균형 수수료. 양수=롱 과열 |
| **timeInForce(GTC)** | 주문 유효기간. GTC=취소 전까지 유효 |
| **reduceOnly** | 선물에서 "포지션 축소만 허용" 안전 플래그 |
| **testnet** | 가짜 돈으로 연습하는 서버(`testnet.binance.vision`) |
