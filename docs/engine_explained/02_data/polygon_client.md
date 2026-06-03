# `data/polygon_client.py` — Polygon.io 주가 보조 데이터 소스 (완전 라인별 해설)

> 원본: `analytics/app/data/polygon_client.py` (143줄)
> 이 문서는 **교재 표준 형식**(`01_backtest/vbt_engine.md`, README "3. 공통 형식")을 따릅니다.

---

## 📌 이 파일 한눈에

이 파일은 **"미국 주식 가격을 사 오는 외부 장보기 담당"** 입니다. Polygon.io 라는 회사의 인터넷 주소(REST API)에 "AAPL 의 2024-01-01 ~ 2024-12-31 일봉 줘" 라고 HTTP 로 물어보고, 돌아온 JSON 을 우리 시스템 표준 표(pandas DataFrame)로 정리해 돌려줍니다.

핵심 함수는 5개입니다(전부 모듈 함수, 클래스 없음):

| 함수 | 한 줄 역할 | 비유 |
|---|---|---|
| `_headers()` | API 키를 HTTP 인증 헤더로 포장 | 가게 들어갈 때 보여주는 회원카드 |
| `available()` | API 키가 설정돼 있나? (True/False) | 지갑에 회원카드가 있는지 확인 |
| `get_daily_bars(...)` | **일봉 OHLCV** 한 묶음 가져오기 (백테스트용 재료) | 1년치 가계부를 한 번에 받아오기 |
| `get_latest_quote(...)` | **지금 한 종목의 최신 가격 + 전일대비** | 전광판에서 현재가 한 번 보기 |
| `get_intraday_bars(...)` | **분봉/시간봉** 가져오기 (장중 세밀한 가격) | 1분 단위로 찍힌 영수증 받아오기 |

**누가 호출하나?** (실제 코드 기준)
- `app/data/yf_client.py` 의 `_fetch_polygon()` → `get_history()` 가 **1순위로 Polygon, 실패 시 yfinance 폴백**. 즉 평소 백테스트가 쓰는 가격은 여기서 먼저 시도합니다.
- `app/data/collector.py` 의 `collect_us_stocks()` / `initial_load()` → US ETF·주식 일봉을 주기 수집해 MySQL 에 적재.
- `app/main.py` 의 `/data/ohlcv` (DB 에 없으면 실시간 fetch), `/data/ticker/{symbol}` (실시간 시세), `/health` 류 엔드포인트의 `polygon_available` 표시.

**왜 yf 와 따로 있나? (역할 차이 — 헷갈리는 핵심)**
`yf_client.py`(야후 파이낸스)는 **무료·무인증**이지만 비공식이라 가끔 깨지거나 빈 데이터를 줍니다. Polygon 은 **API 키(유료/무료 등급)** 기반의 더 안정적인 상용 소스입니다. 그래서 시스템 설계는 **"Polygon 이 가능하면 먼저, 안 되면 야후로 폴백"**(yf_client.py:155-162) 입니다. 이 파일은 야후를 대체하는 게 아니라, **더 믿을 만한 1순위 후보**를 추가한 "보조 소스"입니다. (`.env.example`: "설정 시 yfinance 대신 Polygon 데이터 우선 사용")

---

## 🧠 사전 지식 (이거 모르면 막힘)

#### 1) REST API = "정해진 주소에 HTTP 로 물어보면 JSON 으로 답이 옴"
```
우리:   GET https://api.polygon.io/v2/aggs/ticker/AAPL/range/1/day/2024-01-01/2024-12-31
Polygon: { "results": [ {t:..., o:..., h:..., ...}, ... ] }   ← JSON 답
```
- "주소(URL)" 안에 종목·기간이 들어가고, 답은 `results` 라는 리스트(매일 하루치 한 칸)로 옵니다.

#### 2) OHLCV = 하루치 가격 요약 5종 세트
| 약자 | 뜻 | Polygon 응답 키 |
|---|---|---|
| **O**pen | 시가(그날 첫 거래가) | `o` |
| **H**igh | 고가(그날 최고가) | `h` |
| **L**ow | 저가(그날 최저가) | `l` |
| **C**lose | 종가(그날 마지막 거래가) | `c` |
| **V**olume | 거래량(그날 거래된 수량) | `v` |
- 추가로 `vw`(vwap, 거래량가중평균가)도 옵니다. Polygon 은 키 이름을 **한 글자로 짧게**(`o/h/l/c/v/vw/t`) 줘서 전송량을 아낍니다. 이 파일이 하는 핵심 일 중 하나가 이 한 글자 키를 사람이 읽을 풀네임(`open/high/...`)으로 **이름 바꾸기(rename)** 입니다.

#### 3) API 키(API Key) = "이 요청은 누구 것" 임을 증명하는 비밀번호
- `POLYGON_API_KEY` 환경변수에 담깁니다. 요청 헤더 `Authorization: Bearer <키>` 로 붙여 보냅니다(`_headers()`).
- 무료 키도 동작하지만 **데이터가 15분 지연**됩니다(docstring 명시). 실시간이 아니라 보조용이라는 뜻.

#### 4) aggregates(어그리게이트) = "여러 거래를 하루/1분 단위로 묶은 봉(bar)"
- Polygon 의 일봉/분봉 API URL 은 `/v2/aggs/ticker/{심볼}/range/{배수}/{기간단위}/{시작}/{끝}` 형태입니다.
  - `range/1/day` = "1일 단위 봉" (일봉)
  - `range/5/minute` = "5분 단위 봉" (5분봉) — `multiplier=5, timespan='minute'`
- "aggregate(집계)" = 수많은 체결을 시간 구간별로 합쳐 OHLCV 한 칸으로 만든 것.

#### 5) Unix ms 타임스탬프 = "1970년부터 지금까지 흐른 밀리초(ms)"
- Polygon 의 `t` 필드는 사람이 읽는 날짜가 아니라 **숫자**(예: `1704171600000`). 이걸 `pd.to_datetime(..., unit="ms")` 로 진짜 날짜로 변환해야 합니다.
- 게다가 그 숫자는 **UTC(세계표준시) 기준**이라, 미국 장 날짜로 맞추려면 **뉴욕 시간대로 변환**해야 정확한 "거래일"이 나옵니다(아래 L67 의 트릭).

#### 6) `httpx` = 파이썬 HTTP 요청 라이브러리 (`requests` 의 최신판 사촌)
- `httpx.get(url, headers=, params=, timeout=)` 으로 GET 요청을 보냅니다.
- `resp.raise_for_status()` = 응답이 4xx/5xx(에러)면 예외를 던짐. `resp.json()` = 응답 본문을 파이썬 dict 로 파싱.

---

## 🗺 전체 흐름도

```
                     POLYGON_API_KEY (환경변수)
                              │
                  ┌───────────┴───────────┐
                  ▼                       ▼
            available()             _headers()
          "키 있나?"              {Authorization: Bearer ...}
                  │                       │
   ┌──────────────┼───────────────────────┼──────────────┐
   ▼              ▼                        ▼              
get_daily_bars  get_intraday_bars     get_latest_quote
 (일봉 범위)      (분봉/시간봉 범위)      (한 종목 현재가)
   │              │                        │
   │   httpx.GET  /v2/aggs/.../range/...    │  httpx.GET /v2/snapshot/...
   ▼              ▼                        ▼
 resp.json()["results"]  (봉 리스트)     resp.json()["ticker"]
   │              │                        │
   ▼              ▼                        ▼
 pd.DataFrame  +  t(ms)→날짜 변환  +  o/h/l/c/v/vw → open/high/...
   │              │                        │
   ▼              ▼                        ▼
 표준 컬럼 DataFrame                  {symbol, price, change_pct, updated_at}
   │
   ▼
 (yf_client / collector / main.py 가 받아서 DB 적재·백테스트·시세표시)
```

```
시스템 안에서의 위치 (데이터 우선순위):

  get_history(ticker)              ← yf_client.py
        │
        ├─1순위─▶ _fetch_polygon ──▶ polygon_client.get_daily_bars   ★이 파일
        │                                    │ 실패/빈값 시
        └─2순위─▶ _fetch_yfinance (야후)  ◀──┘ 폴백
```

---

## 📖 라인별 해설

### A. 파일 설명서(docstring) + import + 모듈 상수 — `L1-L22`

```python
# L1-L8
"""
Polygon.io REST client — US 주식 OHLCV + 실시간 최종 가격.

환경변수:
  POLYGON_API_KEY  : Polygon.io API 키 (무료 키로도 사용 가능, 지연 15분)

API 문서: https://polygon.io/docs/stocks
"""
```
- 파일 맨 위 **설명서(docstring)**. 실행되지 않고 사람이 읽는 용도. 핵심 사실 3개가 박혀 있습니다: ① 미국 주식 전용, ② 환경변수 `POLYGON_API_KEY` 가 필요, ③ **무료 키는 15분 지연**(그래서 실시간 매매 신뢰용이 아니라 보조 소스).

```python
# L9-L18
from __future__ import annotations
import logging
import os
from datetime import datetime, timedelta, date
from typing import Optional

import httpx
import pandas as pd

log = logging.getLogger(__name__)
```
- `from __future__ import annotations` — 타입힌트를 "문자열처럼" 늦게 평가하게 하는 파이썬 주문(초보는 "최신 타입표기를 쓰기 위한 관용구"로 이해). 예컨대 `from_date: str | None` 같은 표기를 구버전 파이썬에서도 쓸 수 있게 함.
- `logging` — 화면 대신 **로그**에 기록(에러 났을 때 흔적 남기기). `os` — 환경변수 읽기.
- `datetime / timedelta / date` — 날짜 계산용(예: "어제부터 오늘까지").
- `Optional[X]` — "X 이거나 None(없음)" 타입.
- `httpx` — HTTP 요청 라이브러리. `pandas(pd)` — 표(DataFrame) 다루기.
- `log = logging.getLogger(__name__)` — 이 파일 전용 로거 생성. `__name__` 은 모듈 이름(`app.data.polygon_client`)이 들어가, 로그에 "어디서 난 메시지인지" 표시됨.

```python
# L20-L22
POLYGON_API_KEY = os.getenv("POLYGON_API_KEY", "")
BASE_URL = "https://api.polygon.io"
_CLIENT_TIMEOUT = 20.0  # seconds
```
- `os.getenv("POLYGON_API_KEY", "")` — 환경변수에서 키를 읽되, **없으면 빈 문자열 `""`**. (None 이 아니라 빈 문자열이라 `bool("")==False` 로 "없음" 판정이 깔끔.)
- `BASE_URL` — 모든 요청이 공유하는 주소 앞부분. 한 곳에 모아두면 나중에 바꾸기 쉬움(매직스트링 방지).
- `_CLIENT_TIMEOUT = 20.0` — **요청이 20초 넘게 안 오면 포기**(타임아웃). 외부 서버가 느릴 때 우리 엔진이 무한 대기하지 않도록 하는 안전장치. 앞의 `_`(언더스코어)는 "이 파일 내부용" 관습 표시.

> 💡 초보 포인트: **이 3개는 모듈을 import 하는 순간 1번만 실행**됩니다. 특히 `POLYGON_API_KEY` 는 **import 시점에 고정**됩니다 — 프로그램을 켠 뒤 환경변수를 바꿔도 이 변수에는 반영되지 않습니다(함정 5번 참고).

---

### B. 인증 헤더 만들기 `_headers()` — `L25-L26`

```python
# L25-L26
def _headers() -> dict:
    return {"Authorization": f"Bearer {POLYGON_API_KEY}"}
```
- **무엇을:** API 키를 HTTP 헤더 형식 `Authorization: Bearer <키>` 로 포장해 dict 로 돌려줌. 모든 요청 함수가 이걸 가져다 씁니다(`headers=_headers()`).
- **왜:** Polygon 은 "이 요청이 유효한 사용자 것인가"를 이 헤더로 확인. (키를 URL `apiKey=` 파라미터로 넣는 방식도 있지만, 이 코드는 **헤더 방식**을 택함 — URL 로그에 키가 안 남아 더 안전.)
- **헷갈리는 포인트:** `f"Bearer {...}"` 의 `f` 는 f-string(문자열 안에 변수 끼워넣기). `Bearer` 와 키 사이 **공백 한 칸**이 규격이라 빠지면 안 됨.

---

### C. 키 설정 여부 확인 `available()` — `L29-L30`

```python
# L29-L30
def available() -> bool:
    return bool(POLYGON_API_KEY)
```
- **무엇을:** 키가 비어있지 않으면 `True`, 빈 문자열이면 `False`. `bool("")` 은 `False`, `bool("abc")` 는 `True` 라는 파이썬 성질을 그대로 이용.
- **왜:** 호출하는 쪽(`yf_client`, `collector`, `main`)이 **"Polygon 을 쓸 수 있는 상태인가"를 사전 확인**하는 게이트. 키가 없으면 곧장 야후로 폴백하거나 수집을 스킵. (예: collector.py:54 `if not polygon_client.available(): return {"skipped": True, ...}`)
- **헷갈리는 포인트:** 이건 "키가 **있다**"만 확인하지, "키가 **유효하다**"는 보장하지 않음. 틀린 키여도 `available()` 은 True 를 주고, 실제 요청에서 401/403 으로 터집니다.

---

### D. 일봉 OHLCV 조회 `get_daily_bars()` — `L33-L71` (이 파일의 알맹이)

이 함수가 백테스트의 **재료(과거 가격)**를 만드는 주역입니다. 한 블록씩 봅니다.

#### D-1) 함수 머리 + 키 가드 — `L33-L44`
```python
# L33-L44
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
```
- **입력:** `symbol`(종목, 예 "AAPL"), `from_date`/`to_date`(`"YYYY-MM-DD"` 문자열), `adjusted`(액면분할·배당 **보정 여부**, 기본 True).
- **출력:** `pd.DataFrame` — date·open·high·low·close·volume·vwap 컬럼.
- `if not available(): raise RuntimeError(...)` — **키 없으면 즉시 예외**. 빈 요청을 보내 401 받느니, 우리 쪽에서 명확한 메시지로 막음(빠른 실패, fail-fast).
- **헷갈리는 포인트 — `adjusted`:** True 면 **수정주가**(과거 분할/배당을 반영해 연속적으로 보정한 가격). 백테스트는 보통 수정주가를 써야 "10:1 분할 때 가격이 1/10 로 뚝 떨어진" 가짜 폭락을 피합니다. 그래서 기본값이 True.

#### D-2) URL + 쿼리 파라미터 조립 — `L46-L52`
```python
# L46-L52
    symbol = symbol.upper()
    url = f"{BASE_URL}/v2/aggs/ticker/{symbol}/range/1/day/{from_date}/{to_date}"
    params = {
        "adjusted": "true" if adjusted else "false",
        "sort": "asc",
        "limit": 50000,
    }
```
- `symbol.upper()` — 종목코드 **대문자 통일**("aapl"→"AAPL"). Polygon 은 대문자를 기대하고, 우리 DB 키도 대문자라 일관성 확보.
- `url` — aggregates 일봉 주소. `range/1/day` = "1일 단위 봉". 기간이 **URL 경로 안**에 들어가는 게 Polygon 스타일.
- `params`(쿼리스트링, `?adjusted=...&sort=...`):
  - `adjusted`: 불리언을 **문자열 "true"/"false"** 로(URL 에는 문자열만 들어가므로).
  - `sort: "asc"` — **오름차순(과거→현재)** 정렬. pandas 시계열은 옛날→최근 순서여야 이동평균 등 계산이 자연스러움.
  - `limit: 50000` — **한 번에 최대 5만 봉**. 일봉 5만 개면 약 198년치라 사실상 "기간 내 전부 받기". (Polygon 무료/기본 한도가 봉당 제한이 있어 넉넉히 큰 값으로 잘림 방지.)

#### D-3) HTTP 요청 + 에러 처리 — `L54-L58`
```python
# L54-L58
    try:
        resp = httpx.get(url, headers=_headers(), params=params, timeout=_CLIENT_TIMEOUT)
        resp.raise_for_status()
    except httpx.HTTPStatusError as e:
        raise RuntimeError(f"Polygon HTTP error {e.response.status_code}: {e.response.text}") from e
```
- `httpx.get(...)` — 실제 GET 요청. `headers=_headers()`(인증), `params=params`(쿼리), `timeout=20초`.
- `resp.raise_for_status()` — 응답이 **4xx/5xx 면 `HTTPStatusError` 예외**를 던짐(예: 401 키오류, 429 한도초과, 403 등).
- `except ... as e` — 그 HTTP 에러를 잡아 **상태코드 + 응답본문**을 담은 `RuntimeError` 로 바꿔 다시 던짐. 호출자(yf_client)가 이 예외를 받아 야후로 폴백.
- **헷갈리는 포인트 — `from e`:** "이 RuntimeError 의 **원인이 e** 임"을 파이썬 traceback 에 연결. 디버깅 때 원래 HTTP 에러까지 추적 가능(예외 체이닝).
- **주의 — 타임아웃은 안 잡음:** `try` 가 잡는 건 `HTTPStatusError`(상태코드 에러)뿐. 20초 타임아웃이 나면 `httpx.TimeoutException` 이 발생해 **이 except 를 통과해 그대로 위로 전파**됩니다. (yf_client 쪽 `_fetch_polygon` 이 더 바깥에서 `except Exception` 으로 잡아 폴백하므로 시스템은 안전.)

#### D-4) JSON → DataFrame + 빈 결과 처리 — `L60-L65`
```python
# L60-L65
    data = resp.json()
    results = data.get("results", [])
    if not results:
        return pd.DataFrame()

    df = pd.DataFrame(results)
```
- `resp.json()` — 응답 본문을 파이썬 dict 로 파싱.
- `data.get("results", [])` — Polygon 은 봉들을 `results` 키에 담음. **없으면 빈 리스트** `[]` 를 기본값으로(KeyError 방지).
- `if not results: return pd.DataFrame()` — 결과가 비면 **빈 DataFrame** 반환. (예외가 아니라 빈 표! 호출자는 `df.empty` 로 확인해 폴백. yf_client.py:67 이 정확히 이렇게 함.)
- `pd.DataFrame(results)` — 리스트(각 원소가 dict)를 표로. 이 시점 컬럼은 Polygon 원본인 `t, o, h, l, c, v, vw, ...`(한 글자).

#### D-5) ⚠️ 타임스탬프 → 거래일 변환 (이 파일에서 가장 까다로운 한 줄) — `L66-L67`
```python
# L66-L67
    # t = Unix ms timestamp
    df["date"] = pd.to_datetime(df["t"], unit="ms", utc=True).dt.tz_convert("America/New_York").dt.normalize().dt.tz_localize(None)
```
한 줄에 4단계 변환이 체인으로 걸려 있습니다. **왜 이렇게까지?** → "UTC 밀리초 숫자"를 "미국 증시 거래일(날짜)"로 정확히 떨어뜨리기 위해서.

| 단계 | 코드 | 무엇을 하나 |
|---|---|---|
| ① | `pd.to_datetime(df["t"], unit="ms", utc=True)` | 밀리초 숫자(`t`)를 **UTC 시각**으로 변환 |
| ② | `.dt.tz_convert("America/New_York")` | UTC → **뉴욕(미 동부) 시간대**로 환산 |
| ③ | `.dt.normalize()` | 시·분·초를 0시 0분으로 깎아 **"날짜만"** 남김 |
| ④ | `.dt.tz_localize(None)` | 시간대 꼬리표 제거 → **timezone-naive**(순수 날짜) |

- **②가 왜 중요?** Polygon 일봉 `t` 는 그날 봉의 기준 시각인데 UTC 로 주면 미국 장 날짜와 **하루 어긋날 수** 있습니다(UTC 자정과 뉴욕 시간 차 때문). 뉴욕으로 환산 후 날짜만 떼야 진짜 "거래일"이 맞음.
- **④가 왜 필요?** 우리 시스템 전반(yf_client·DB·vbt_engine)은 **시간대 없는(naive) 날짜**를 표준으로 씁니다(README/yf_client 모두 "timezone-naive"). 한쪽은 tz 있고 한쪽은 없으면 pandas 가 비교·병합에서 에러를 냅니다. 그래서 마지막에 꼬리표를 떼어 통일.
- **헷갈리는 포인트:** `.dt` 는 "Series 의 각 원소가 날짜일 때, 날짜 전용 기능을 쓰겠다"는 접근자(accessor). `df["t"]` 한 칸씩이 아니라 **전체 컬럼에 한 번에** 적용(벡터 연산).

#### D-6) 컬럼 이름 표준화 + 메타 부착 — `L68-L71`
```python
# L68-L71
    df = df.rename(columns={"o": "open", "h": "high", "l": "low", "c": "close", "v": "volume", "vw": "vwap"})
    df["symbol"] = symbol
    df["source"] = "polygon"
    return df[["date", "symbol", "source", "open", "high", "low", "close", "volume", "vwap"]].copy()
```
- `rename(...)` — Polygon 의 한 글자 키를 **사람·시스템 표준 풀네임**으로. (`o→open`, `h→high`, `l→low`, `c→close`, `v→volume`, `vw→vwap`.)
- `df["symbol"] = symbol` / `df["source"] = "polygon"` — **출처 표식**을 모든 행에 부착. 나중에 여러 소스(polygon/binance/yfinance/kis) 데이터를 한 DB 테이블에 섞어 저장할 때 "이 행은 어디서 왔나"를 구분(market_db.py 의 `source` 컬럼과 직결).
- 마지막 줄 — 필요한 **9개 컬럼만 정해진 순서**로 골라 반환. `.copy()` 는 "원본의 일부 뷰가 아니라 **독립 복사본**"을 만들어 이후 수정 시 pandas 의 `SettingWithCopyWarning` 경고/부작용 방지.
- **헷갈리는 포인트:** 반환에는 `t`(원본 timestamp)가 빠져 있고, 대신 우리가 만든 `date` 가 들어감. 원본 `t` 컬럼은 df 안에 남아있지만 최종 선택에서 제외되어 버려짐.

> 💡 호출자 연결: `yf_client._fetch_polygon`(yf_client.py:62-79)이 이 반환을 받아 다시 `open→Open` 식으로 **대문자화**하고 `date` 를 인덱스로 세워 야후 포맷과 똑같이 맞춥니다. 즉 이 함수는 "Polygon 방언 → 사내 표준어" 1차 번역, yf_client 가 "사내 표준어 → 야후 호환 최종형" 2차 번역을 합니다.

---

### E. 최신 시세 조회 `get_latest_quote()` — `L74-L101`

```python
# L74-L82
def get_latest_quote(symbol: str) -> Optional[dict]:
    """
    종목 최신 가격 (직전 종가 + 전일 대비).
    Returns: {symbol, price, change_pct, updated_at}
    """
    if not available():
        return None

    symbol = symbol.upper()
    url = f"{BASE_URL}/v2/snapshot/locale/us/markets/stocks/tickers/{symbol}"
```
- **무엇을:** 한 종목의 **현재가 + 전일대비 등락률**을 가져옴. 백테스트가 아니라 **화면 전광판용**(main.py 의 `/data/ticker/{symbol}`).
- **`get_daily_bars` 와의 차이 — 키 없을 때 동작이 다름:** 여기선 `raise` 가 아니라 **`return None`**. 시세 표시는 "있으면 보여주고 없으면 조용히 야후로 넘어가는" 부가기능이라, 예외로 흐름을 끊지 않음(main.py:592-599 이 `result` 가 None 이면 야후 `get_latest_close` 로 폴백).
- **다른 엔드포인트:** aggregates 가 아니라 **snapshot**(`/v2/snapshot/.../tickers/{symbol}`) — "지금 이 순간의 스냅샷"을 주는 API.

```python
# L84-L92
    try:
        resp = httpx.get(url, headers=_headers(), timeout=_CLIENT_TIMEOUT)
        resp.raise_for_status()
        ticker = resp.json().get("ticker", {})
        day = ticker.get("day", {})
        prev_day = ticker.get("prevDay", {})
        close = day.get("c") or prev_day.get("c")
        prev_close = prev_day.get("c")
        change_pct = ((close - prev_close) / prev_close * 100) if close and prev_close else None
```
- `resp.json().get("ticker", {})` — snapshot 응답의 `ticker` 객체. `.get(..., {})` 로 없으면 **빈 dict** 기본값(연쇄 None 에러 방지).
- `day`(오늘 봉) / `prev_day`(어제 봉) 두 묶음을 꺼냄.
- `close = day.get("c") or prev_day.get("c")` — **오늘 종가 우선, 없으면(장 시작 전이라 오늘 데이터가 비면) 어제 종가**. `A or B` 는 "A 가 falsy(None/0)면 B" 라는 파이썬 관용.
- `change_pct = (...) if close and prev_close else None` — 등락률(%) = (오늘−어제)/어제×100. **둘 다 값이 있을 때만** 계산, 아니면 None.
- **헷갈리는 포인트 — `if close and prev_close`:** 만약 `close` 나 `prev_close` 가 `0` 이면 `0 and ...` 이 falsy 라 None 이 됨. 0원 주가는 비현실적이라 사실상 "결측이면 None" 가드로 작동(0 나누기도 동시에 방지).

```python
# L93-L101
        return {
            "symbol": symbol,
            "price": close,
            "change_pct": round(change_pct, 2) if change_pct is not None else None,
            "updated_at": datetime.utcnow().isoformat(),
        }
    except Exception as e:
        log.warning("Polygon quote error %s: %s", symbol, e)
        return None
```
- 결과 dict 반환: 종목·현재가·등락률(소수 2자리 반올림)·**갱신시각**.
- `datetime.utcnow().isoformat()` — 지금 UTC 시각을 ISO 문자열(`"2026-06-01T12:34:56.789"`)로. "이 시세가 언제 기준인지" 표시. (`utcnow()` 는 신버전 파이썬에서 deprecated 경고 대상 — 함정 6번 참고.)
- `except Exception as e` — **모든 예외를 폭넓게 잡아** 로그만 남기고 `None` 반환. (`get_daily_bars` 가 HTTP 에러만 좁게 잡은 것과 대조 — 시세 함수는 "절대 흐름을 끊지 말고 조용히 None" 철학.)
- **헷갈리는 포인트:** `change_pct` 가 `0.0`(변동 없음)일 수 있는데, `if change_pct is not None` 으로 **명시적 None 검사**를 하므로 `0.0` 도 정상 반올림됨. (`if change_pct:` 였다면 0 을 None 으로 잘못 처리할 뻔 — 올바른 구현.)

---

### F. 분봉/시간봉 조회 `get_intraday_bars()` — `L104-L142`

`get_daily_bars` 의 **세밀한 버전**(1일 대신 1분/1시간 단위). 구조가 거의 같아 차이 위주로 봅니다.

```python
# L104-L116
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
```
- **새 입력:** `multiplier`(봉 배수, 기본 1)·`timespan`(단위, 기본 "minute"). 예: `multiplier=5, timespan="minute"` → 5분봉. `timespan="hour"` → 시간봉.
- `from_date`/`to_date` 는 **기본 None** — 안 주면 아래에서 자동 채움. (`get_daily_bars` 는 날짜가 필수였던 것과 차이.)
- 키 없으면 `raise RuntimeError` (daily 와 동일하게 fail-fast).

```python
# L118-L125
    symbol = symbol.upper()
    if not from_date:
        from_date = (date.today() - timedelta(days=1)).isoformat()
    if not to_date:
        to_date = date.today().isoformat()

    url = f"{BASE_URL}/v2/aggs/ticker/{symbol}/range/{multiplier}/{timespan}/{from_date}/{to_date}"
    params = {"adjusted": "true", "sort": "asc", "limit": 50000}
```
- **날짜 기본값:** `from_date` 없으면 **어제**(`today - 1일`), `to_date` 없으면 **오늘**. 즉 기본 호출 `get_intraday_bars("AAPL")` 은 "어제~오늘 1분봉".
- `.isoformat()` — `date` 객체를 `"2026-06-01"` 문자열로.
- URL — daily 와 달리 `range/{multiplier}/{timespan}` 에 **변수**가 들어감(daily 는 `range/1/day` 로 고정이었음).
- `params` — daily 와 동일하되 **`adjusted` 가 항상 "true"로 하드코딩**(intraday 엔 adjusted 인자 자체가 없음).

```python
# L127-L135
    try:
        resp = httpx.get(url, headers=_headers(), params=params, timeout=_CLIENT_TIMEOUT)
        resp.raise_for_status()
    except httpx.HTTPStatusError as e:
        raise RuntimeError(f"Polygon HTTP error {e.response.status_code}") from e

    results = resp.json().get("results", [])
    if not results:
        return pd.DataFrame()
```
- daily 와 거의 동일. 차이: 에러 메시지가 **상태코드만**(daily 는 `e.response.text` 본문까지 포함). 빈 결과면 빈 DataFrame 반환도 동일.

```python
# L137-L142
    df = pd.DataFrame(results)
    df["timestamp"] = pd.to_datetime(df["t"], unit="ms", utc=True)
    df = df.rename(columns={"o": "open", "h": "high", "l": "low", "c": "close", "v": "volume", "vw": "vwap"})
    df["symbol"] = symbol
    df["source"] = "polygon"
    return df[["timestamp", "symbol", "source", "open", "high", "low", "close", "volume", "vwap"]].copy()
```
- **daily 와의 핵심 차이 — 시간 처리:** 분봉은 "날짜"가 아니라 **정확한 시각(timestamp)**이 필요하므로:
  - 컬럼명이 `date` 가 아니라 `timestamp`.
  - 변환이 `pd.to_datetime(..., unit="ms", utc=True)` 에서 **멈춤** — daily 의 `.tz_convert(뉴욕).normalize().tz_localize(None)` 체인이 **없음**. 즉 **UTC 시각을 그대로 유지**(시·분까지 보존, 뉴욕 변환·날짜 절삭 안 함).
- 나머지(rename, symbol/source 부착, 컬럼 선택, `.copy()`)는 daily 와 동일.
- **헷갈리는 포인트:** daily 의 `date` 는 timezone-naive 인데, intraday 의 `timestamp` 는 **UTC 시간대가 붙어있음**(tz-aware). 두 함수의 시간 컬럼은 타입이 달라, 섞어 쓸 때 주의(함정 4번).

---

## ⚠️ 함정·버그 주의 (코드에 박힌 / 잠재된 교훈)

1. **두 시간 컬럼이 서로 다름.** `get_daily_bars` 는 `date`(뉴욕 거래일, **tz-naive**), `get_intraday_bars` 는 `timestamp`(**UTC, tz-aware**). 둘을 같은 표에서 비교/병합하면 pandas 가 `Cannot compare tz-naive and tz-aware` 에러를 냄. 인텐트는 맞지만(일봉=날짜, 분봉=정밀시각) 혼용 시 주의.

2. **키는 import 시점에 1번만 읽힘.** `POLYGON_API_KEY = os.getenv(...)` 가 모듈 로드 때 고정. 앱 기동 후 `.env`/환경변수를 바꿔도 반영 안 됨 → 반드시 **프로세스 시작 전** 설정. (MEMORY 의 "Env priority changes need duplicate-key audit" 와 같은 맥락: `.env` 변경은 재시작 필요.)

3. **`available()` 은 키 존재만 확인, 유효성은 모름.** 오타·만료·잘못된 키여도 True. 실제 검증은 첫 HTTP 요청에서 401/403 으로 드러나며, 이건 `HTTPStatusError`→`RuntimeError` 로 변환되어 호출자가 폴백.

4. **타임아웃·네트워크 예외는 `get_daily_bars`/`get_intraday_bars` 안에서 안 잡힘.** `try/except` 가 `HTTPStatusError`(상태코드 에러)만 잡음. 20초 타임아웃·DNS 실패 등은 `httpx.TimeoutException`/`ConnectError` 로 **위로 전파**됨. 다행히 `yf_client._fetch_polygon` 이 바깥에서 `except Exception` 으로 감싸 폴백하므로 실사용은 안전. **하지만 `collector.py`·`main.py` 도 각자 try 로 감싸야** 안전(현재 collector·main 호출부 모두 try 로 감싸져 있음 — 확인됨).

5. **무료 키 = 15분 지연.** `get_latest_quote` 의 "최신가"도 무료 등급이면 15분 늦은 값. 실시간 주문 판단에 그대로 쓰면 위험. (docstring 이 경고.)

6. **`datetime.utcnow()` 는 deprecated 경로.** 파이썬 3.12+ 에서 `utcnow()` 는 권장 폐지(naive UTC 라 혼란). `datetime.now(timezone.utc)` 가 권장. 동작은 하지만 향후 경고/변경 가능.

7. **`limit: 50000` 은 상한일 뿐 페이지네이션 없음.** 일봉 5만이면 문제없지만, 1분봉으로 아주 긴 기간을 요청하면 **5만 개에서 잘릴 수** 있음(Polygon 의 `next_url` 커서를 이 코드는 따라가지 않음). 장기 분봉이 필요하면 페이지네이션 미구현이 한계.

8. **빈 결과 vs 예외의 비대칭.** "데이터 없음"은 빈 DataFrame(daily/intraday) 또는 None(quote)으로, "키 없음/HTTP 에러"는 예외/None 으로 구분됨. 호출자는 **`df.empty` 검사 + try/except** 둘 다 해야 모든 경우를 커버.

---

## 🚀 고도화 아이디어 (강의·개선 버전용)

- **재사용 클라이언트 + 재시도.** 지금은 매 호출이 `httpx.get`(매번 새 연결). `httpx.Client` 를 모듈/요청 단위로 재사용하면 커넥션 풀로 빨라짐. 추가로 429(rate limit)·5xx 에 **지수 백오프 재시도**(tenacity 등)를 붙이면 무료 등급의 분당 호출제한을 매끄럽게 흡수.
- **페이지네이션 지원.** 응답의 `next_url`(있을 때)을 따라가며 전부 모으면 장기 분봉도 잘림 없이 수집(함정 7 해결).
- **시간 컬럼 통일.** intraday 도 `tz_convert("America/New_York")` 후 한 표준(예: 둘 다 naive ET, 또는 둘 다 tz-aware UTC)으로 맞춰 함정 1 제거. 어떤 표준을 택하든 **문서에 명시**.
- **타임아웃/네트워크 예외도 함수 내에서 처리.** `except httpx.HTTPStatusError` 를 `except httpx.HTTPError`(상위 타입)로 넓히거나, 타임아웃 전용 분기를 추가해 호출자가 일관되게 `RuntimeError` 만 보게.
- **응답 스키마 검증.** `results` 각 봉에 `o/h/l/c/v/t` 가 다 있는지 확인(가끔 일부 필드 누락). `vw`(vwap)는 없을 수도 있어 rename 후 NaN 처리 명시.
- **캐싱 일원화.** 지금 캐시는 yf_client 가 담당. Polygon 응답 자체를 짧게 캐시(같은 종목·기간 반복 호출)하면 무료 한도 절약.
- **비동기화.** `httpx.AsyncClient` + `async def` 로 바꾸면 여러 종목을 동시에 받아 collector 의 초기 적재가 크게 빨라짐.
- **에러 메시지 보안.** `e.response.text` 를 그대로 RuntimeError 에 넣으면 (드물게) 키·토큰이 로그에 노출될 수 있음. 길이 제한·마스킹 고려.

---

## 📚 용어 사전 (이 파일 한정)

| 용어 | 뜻 |
|---|---|
| **Polygon.io** | 미국 주식 시세를 API 로 파는 상용 데이터 제공사. 무료 키는 15분 지연 |
| **REST API / 엔드포인트** | 정해진 URL 에 HTTP 로 요청하면 JSON 으로 답하는 방식 / 그 개별 주소 |
| **aggregates(aggs)** | 여러 체결을 시간 구간(1일·1분 등)으로 묶은 봉(bar). URL `/v2/aggs/...` |
| **snapshot** | "지금 이 순간"의 종목 현황. URL `/v2/snapshot/...` (현재가용) |
| **OHLCV** | Open/High/Low/Close/Volume — 하루(또는 한 봉)치 가격 5종 + vwap |
| **vwap** | Volume-Weighted Average Price, 거래량가중평균가(Polygon 키 `vw`) |
| **adjusted(수정주가)** | 분할·배당을 반영해 과거 가격을 연속적으로 보정. 백테스트 표준 |
| **API 키 / Bearer 토큰** | 요청자 신원 증명 비밀번호. `Authorization: Bearer <키>` 헤더로 전달 |
| **Unix ms timestamp** | 1970년부터의 경과 밀리초(Polygon 키 `t`). 날짜로 변환 필요 |
| **tz-aware / tz-naive** | 시간대 정보가 붙은 시각 / 안 붙은(순수) 날짜·시각 |
| **`httpx`** | 파이썬 HTTP 클라이언트. `get`, `raise_for_status`, `json` 사용 |
| **`raise_for_status()`** | 응답이 4xx/5xx 면 예외(`HTTPStatusError`)를 던지는 httpx 메서드 |
| **폴백(fallback)** | 1순위가 실패하면 2순위로 자동 전환(Polygon 실패→야후) |
| **fail-fast** | 진행 불가 조건을 만나면 즉시 예외로 끊어 빠르게 알림(키 없음 등) |
| **`.copy()`** | DataFrame 의 독립 복사본 생성. SettingWithCopyWarning·부작용 방지 |
