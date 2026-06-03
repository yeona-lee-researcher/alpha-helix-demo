# `data/fred_client.py` — 거시경제 지표 수집기 (완전 라인별 해설)

> 원본: `analytics/app/data/fred_client.py` (123줄)
> 표준 형식은 모범 예시 [`01_backtest/vbt_engine.md`](../01_backtest/vbt_engine.md) 를 따릅니다.
> 이 파일은 **데이터 재료 창고(`02_data`)** 영역에 속합니다. 백테스트가 쓰는 "재료" 중 하나인 **거시경제 지표(금리·VIX·물가 등)** 를 미국 연준 공개 데이터베이스(FRED)에서 받아옵니다.

---

## 📌 이 파일 한눈에

이 파일은 **"경제 지표 도서관 사서(司書)"** 입니다. 미국 연방준비제도(연준)가 운영하는 거대한 경제 데이터 도서관 **FRED** 에 가서, **"기준금리 자료 주세요", "VIX 변동성 자료 주세요"** 라고 요청하고, 받아온 자료를 우리가 쓰기 좋은 **표(pandas DataFrame)** 로 정리해 돌려줍니다.

도서관에 직접 책을 쓰는(저장) 게 아니라, **빌려와서 깔끔히 정리해 건네주는 것**까지가 이 파일의 일입니다. 정리한 표를 DB에 저장하는 일은 다른 파일(`collector.py` + `market_db.py`)이 합니다.

핵심 함수는 딱 3개입니다:

| 함수 | 한 줄 역할 | 비유 |
|---|---|---|
| `available()` | "도서관 출입증(API 키)이 있나?" 확인 | 도서관 회원증이 지갑에 있는지 보기 |
| `get_series(series_id, ...)` | **한 가지 지표 1종**(예: 10년물 금리)을 받아 표로 정리 | 청구기호 하나로 책 1권 대출 |
| `get_macro_bundle(...)` | **여러 지표를 한꺼번에** 받아 옆으로 합친 넓은 표 | 여러 책을 한 번에 빌려 한 바구니에 담기 |

**누가 호출하나?**

- `app/main.py`
  - `/data/status` 엔드포인트가 `fred_client.available()` 로 "FRED 사용 가능?"을 표시 (`main.py:486`).
  - `/data/macro` 엔드포인트가 DB에 매크로 데이터가 없으면 FRED 에서 실시간 보완 (`main.py:555`).
- `app/data/collector.py`
  - `collect_macro(...)` 가 `get_series(sid, ...)` 를 시리즈별로 호출해 DB에 적재 (`collector.py:89`).
  - `full_initial_load(...)` 가 서버 첫 기동 시 5년치 매크로를 `get_series` 로 받아 채움 (`collector.py:150`).

즉, **"FRED → fred_client → collector → MySQL → 백테스트/Regime/TrustScore"** 흐름의 **맨 앞 입구**가 이 파일입니다.

> 💡 한눈 포인트: 이 파일에는 `get_macro_bundle` 라는 "여러 개 한꺼번에" 함수도 있지만, **실제 수집 파이프라인(collector)은 `get_series` 를 시리즈마다 따로 호출**합니다. `get_macro_bundle` 은 "한 번에 넓은 표로 보고 싶을 때"를 위한 편의 함수로, 라인별 해설에서 그 차이를 짚습니다.

---

## 🧠 사전 지식 (이거 모르면 막힘)

#### 1) FRED 가 뭔가?

- **FRED = Federal Reserve Economic Data**. 미국 세인트루이스 연준이 운영하는 **무료 경제 데이터 도서관**입니다. 금리·물가·실업률·유가 등 80만 개 이상의 경제 시계열을 제공합니다.
- 각 자료에는 **고유 번호표(시리즈 ID)** 가 붙어 있습니다. 예: 기준금리 = `FEDFUNDS`, 10년물 국채금리 = `DGS10`. 이 번호를 알면 API로 데이터를 받을 수 있습니다.
- 받으려면 **무료 API 키**가 필요합니다(아래 회원증 비유). 환경변수 `FRED_API_KEY` 로 넣어줍니다.

#### 2) 이 파일이 받는 8가지 지표 (코드의 `MACRO_SERIES` 그대로)

| 시리즈 ID | 뜻 | 주기 | 왜 보나(투자 관점) |
|---|---|---|---|
| `FEDFUNDS` | 기준금리 (Federal Funds Rate, %) | 월 | 돈값. 금리가 오르면 위험자산(주식·코인)엔 역풍 |
| `DGS10` | 미국 10년물 국채 금리 | 일 | 장기 금리. 시장의 장기 성장·인플레 기대 |
| `DGS2` | 미국 2년물 국채 금리 | 일 | 단기 금리. 연준 정책 기대에 민감 |
| `T10Y2Y` | 10Y − 2Y 금리 스프레드 | 일 | **음수(역전)면 경기침체 선행 신호**로 유명 |
| `VIXCLS` | CBOE VIX 변동성 지수 | 일 | **공포지수**. 높을수록 시장 불안(=risk-off) |
| `CPIAUCSL` | CPI 소비자물가지수 | 월 | 인플레이션 수준. 연준 금리 결정의 핵심 입력 |
| `UNRATE` | 실업률 | 월 | 경기 체온계. 고용이 식으면 침체 우려 |
| `DCOILWTICO` | WTI 원유 가격 ($/배럴) | 일 | 에너지·인플레·경기에 두루 영향 |

> ⚠️ 주기 주의: 위 표의 **일/월**이 섞여 있다는 게 나중에 함정이 됩니다(여러 지표를 한 표로 합칠 때 날짜가 안 맞음 — `get_macro_bundle` 해설과 함정 섹션 참고).

#### 3) VIX·금리가 "전략에 왜" 쓰이나?

- **VIX(`VIXCLS`)** → 백테스트 전략 중 `vix_risk_off` 가 직접 사용합니다(모범 예시 `vbt_engine.md` 의 전략 6). "공포지수가 낮으면(안전하면) 주식 보유, 높으면 빠져나옴." 즉 **VIX 데이터의 출처가 바로 이 파일**일 수 있습니다.
- **금리 스프레드(`T10Y2Y`)** → 시장 **국면(Regime) 판단**의 재료. 장단기 금리가 역전되면(음수) 역사적으로 침체가 따라왔습니다. Regime/TrustScore 엔진이 "지금이 어떤 국면인가"를 볼 때 이런 매크로 팩터를 참고할 수 있습니다.
- 한마디로: **주가(가격) 데이터만으로는 못 보는 "시장 전체의 날씨"** 를 알려주는 게 거시지표입니다. 가격이 "이 종목의 온도"라면, 매크로는 "나라 전체의 기후"입니다.

#### 4) `pandas DataFrame` = "여러 열을 가진 표"

- 모범 예시의 `Series` 는 `[날짜 → 값]` 한 줄짜리였습니다. **DataFrame 은 여러 열(column)을 가진 표 전체**입니다.

```
   date        series_id  description          value
0  2024-01-02  DGS10      미국 10Y 국채 금리      3.95
1  2024-01-03  DGS10      미국 10Y 국채 금리      4.02
```

- `df["value"]` = value 열만 꺼내기(Series), `df.set_index("date")` = date 열을 행 이름(인덱스)으로 삼기.

#### 5) `httpx` = "파이썬용 인터넷 심부름꾼(HTTP 클라이언트)"

- 외부 서버에 "이 주소로 이 조건으로 자료 줘"라고 요청(GET)하고 답(JSON)을 받아오는 라이브러리. `requests` 의 현대판이라고 보면 됩니다.
- `resp.json()` = 받아온 답(JSON 텍스트)을 파이썬 dict 로 변환. `resp.raise_for_status()` = "답이 에러코드(404, 500 등)면 예외를 던져라".

#### 6) 환경변수(`os.getenv`) = "코드 밖에 숨겨둔 비밀 설정"

- API 키 같은 민감 정보를 코드에 직접 쓰면 위험합니다. 그래서 **운영체제 환경변수**(또는 `.env` 파일)에 넣고, 코드는 `os.getenv("FRED_API_KEY")` 로 꺼내 씁니다. 키가 없으면 빈 문자열 `""` 이 기본값입니다.

---

## 🗺 전체 흐름도

```
                 FRED_API_KEY (환경변수, 회원증)
                        │
                        ▼
                 available()  ──"키 있나?"──▶ True/False
                        │ (있을 때만 진행)
        ┌───────────────┴───────────────────────┐
        ▼                                        ▼
   get_series("DGS10")                    get_macro_bundle()
   "한 지표 1종 대출"                       "여러 지표 한 바구니"
        │                                        │
        │  httpx.get(.../series/observations)    │ 내부에서 get_series 를
        │  params = {series_id, api_key, ...}    │ 시리즈마다 반복 호출
        ▼                                        ▼
   JSON: {"observations":[{date,value},...]}     각 결과를 한 줄(Series)로
        │                                        만들어 frames[] 에 모음
        ▼                                        │
   pandas 로 정리:                                ▼
   - value 를 숫자로 변환(coerce)            pd.concat(frames, axis=1)
   - 숫자 아닌 행(".") 버림(dropna)           → 옆으로 합친 wide 표
   - date 를 날짜로 변환                          │
   - series_id / description 열 추가              ▼
        │                                   DGS10·DGS2 있고 T10Y2Y 없으면
        ▼                                   wide["T10Y2Y"]=DGS10-DGS2 (보충 계산)
   DataFrame[date, series_id,                    │
            description, value]                  ▼
        │                              date 인덱스 + 시리즈별 1열짜리 넓은 표
        ▼
  collector.py 가 받아 market_db 에 저장(upsert)
        │
        ▼
  MySQL → 백테스트(vix_risk_off) · Regime · Trust Score 의 재료
```

---

## 📖 라인별 해설

### A. 파일 설명서(docstring) — `L1-L16`

```python
# L1-L16
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
```

- `"""..."""` 는 **파일 맨 위 설명서(docstring)** — 실행되지 않고 사람이 읽는 용도. 여기서 이미 "이 파일이 무엇을, 어떤 키로, 어떤 지표를 받는지" 전부 요약돼 있습니다.
- **환경변수 안내**가 친절하게 적혀 있습니다: `FRED_API_KEY` 를 어디서 무료로 발급받는지 URL까지 명시. (강의에서 "좋은 코드는 docstring 만 봐도 쓰는 법을 안다"의 예시로 좋음.)
- 이 docstring 의 "주요 시리즈" 목록은 아래 코드의 `MACRO_SERIES` 딕셔너리와 **짝**입니다(설명서와 실제 데이터가 일치).

> 💡 초보 포인트: docstring 은 **계약서**입니다. "이 파일을 쓰려면 `FRED_API_KEY` 가 필요하다"는 약속을 맨 위에서 못박아 둔 것.

---

### B. import 와 모듈 상수 — `L17-L29`

```python
# L17-L29
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
```

- `from __future__ import annotations` — 타입힌트를 "문자열처럼" 늦게 평가하게 해주는 파이썬 기능. 초보는 **"최신 타입표기를 쓰기 위한 주문"** 정도로 이해하면 됩니다. (모범 예시와 동일.)
- `logging` — 콘솔/로그파일에 메시지를 남기는 표준 도구. `os` — 환경변수 접근. `Optional[X]` — "X 이거나 None(없음)".
- `httpx` — 인터넷 심부름꾼(사전지식 5). `pandas(pd)` — 표 데이터.
- `log = logging.getLogger(__name__)` — **이 모듈 전용 로거**를 만듦. `__name__` 은 모듈 경로(`app.data.fred_client`)라서, 로그를 보면 "어느 파일에서 난 메시지인지" 바로 압니다. 아래에서 실패를 조용히 기록할 때 씁니다.

이어지는 3개의 **모듈 상수**(대문자 = "바뀌지 않는 값" 관습):

- `FRED_API_KEY = os.getenv("FRED_API_KEY", "")` — 환경변수에서 키를 읽되, **없으면 빈 문자열** `""`. (사전지식 6). 빈 문자열이면 나중에 `available()` 이 False 가 됩니다.
- `BASE_URL = "https://api.stlouisfed.org/fred"` — FRED API 의 **기본 주소**. 모든 요청은 여기에 경로를 붙여 보냅니다(예: `+ "/series/observations"`).
- `_TIMEOUT = 20.0` — 요청이 20초 넘게 응답 없으면 **포기**(타임아웃). 외부 서버가 느리거나 죽었을 때 우리 서버가 무한정 매달리지 않게 함. 앞의 `_` 는 "내부용" 관습 표시.

> ⚠️ 중요한 함정 1개 미리: `FRED_API_KEY` 는 **모듈이 처음 import 되는 그 순간 한 번** 읽힙니다. 서버가 이미 떠 있는 상태에서 나중에 환경변수를 바꿔도 이 값은 안 바뀝니다(재시작 필요). 함정 섹션에서 다시 다룹니다.

---

### C. 수집 대상 시리즈 목록 `MACRO_SERIES` — `L32-L42`

```python
# L32-L42
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
```

- **`{시리즈ID: 사람이 읽을 설명}` 형태의 딕셔너리**입니다. 키(번호표)와 값(한국어 설명)을 짝지어 둔 것.
- 주석이 핵심을 말합니다: **"퀀트 regime 탐지에 필수적인 시리즈 목록"**. 즉 이 8개는 시장 국면(Regime)을 읽는 데 쓰는 거시 재료들입니다(사전지식 3).
- 이 딕셔너리는 두 곳에서 쓰입니다:
  1. `get_series` 가 받은 데이터에 **`description`(한국어 설명) 열**을 붙일 때 (`MACRO_SERIES.get(series_id, ...)`).
  2. `get_macro_bundle` 이 `series_ids=None` 일 때 **기본 수집 목록**으로 (`list(MACRO_SERIES.keys())`).

> 💡 초보 포인트: `dict.get(key, 기본값)` 패턴이 곧 등장합니다. "딕셔너리에 key 가 있으면 그 값을, 없으면 기본값을" 돌려줍니다. 여기선 "목록에 없는 낯선 시리즈가 들어와도 에러 없이 시리즈ID 자체를 설명으로 쓰겠다"는 안전장치로 활용됩니다.

> 🚀 고도화 힌트: 새 거시지표(예: M2 통화량 `M2SL`, 달러인덱스 `DTWEXBGS`)를 추가하고 싶으면 **여기 한 줄만 추가**하면 `get_macro_bundle` 의 기본 수집에 자동 포함됩니다. 강의에서 "데이터를 코드 곳곳에 흩지 말고 한 곳(딕셔너리)에 모으는 설계"의 예시로 좋음.

---

### D. 키 존재 확인 `available()` — `L45-L46`

```python
# L45-L46
def available() -> bool:
    return bool(FRED_API_KEY)
```

- **"FRED 를 쓸 수 있나?"** 를 True/False 로 알려주는 한 줄짜리 함수.
- `bool(FRED_API_KEY)` — 파이썬에서 **빈 문자열 `""` 은 False, 내용이 있는 문자열은 True**. 즉 "키가 설정돼 있으면 True".
- **왜 필요한가?** FRED 키는 선택사항입니다. 키가 없는 환경(로컬 데모 등)에서도 서버가 죽지 않고 **"매크로만 건너뛰고" 동작**해야 합니다. 그래서 호출자들(`main.py`, `collector.py`)이 실제 요청을 보내기 **전에** 이 함수로 먼저 물어봅니다.
  - 예: `collector.py:80` — `if not fred_client.available(): return {"skipped": True, ...}` → 키 없으면 깔끔히 스킵.
  - 예: `main.py:486` — `/data/status` 가 이 값을 그대로 화면에 노출해 "FRED 사용 가능 여부"를 보여줌.

> 💡 초보 포인트: 이런 함수를 **가드(guard, 문지기)** 라고 부릅니다. 비싼/위험한 작업(외부 API 호출) 앞에 두는 "입장 자격 검사".

---

### E. 한 지표 받기 `get_series()` — `L49-L87` (이 파일의 알맹이)

이 파일에서 **실제 데이터를 받아 정리하는 핵심 함수**입니다. 머리부터 봅니다.

#### 함수 머리(시그니처)와 docstring — `L49-L57`

```python
# L49-L57
def get_series(
    series_id: str,
    observation_start: str = "2010-01-01",
    observation_end: Optional[str] = None,
) -> pd.DataFrame:
    """
    FRED 시계열 데이터 조회.
    Returns DataFrame(date, series_id, value).
    """
```

- 입력 3개:
  - `series_id` — 받을 지표의 번호표(예: `"DGS10"`). **필수**.
  - `observation_start="2010-01-01"` — 언제부터의 데이터를 받을지. 기본 2010년부터.
  - `observation_end=None` — 언제까지. 기본 None(= 끝 지정 안 함 = 가장 최근까지).
- 출력: `pd.DataFrame` — 정리된 표. (docstring 은 `date, series_id, value` 라고 적었지만, 실제 반환엔 `description` 열도 포함됩니다 — 코드가 docstring 보다 한 열 더 줍니다. 함정 섹션에서 짚음.)

#### 가드: 키 없으면 즉시 에러 — `L58-L59`

```python
# L58-L59
    if not available():
        raise RuntimeError("FRED_API_KEY not set")
```

- 키가 없으면 **요청을 시도조차 하지 않고 즉시 `RuntimeError`** 를 던집니다. ("출입증 없이 도서관 들어가려다 입구에서 거절".)
- `available()` 가드(D)와 짝: 호출자가 미리 확인 안 했더라도, **함수 스스로도 한 번 더 방어**합니다(이중 안전).

#### 요청 파라미터 조립 — `L61-L69`

```python
# L61-L69
    params = {
        "series_id": series_id,
        "api_key": FRED_API_KEY,
        "file_type": "json",
        "observation_start": observation_start,
        "sort_order": "asc",
    }
    if observation_end:
        params["observation_end"] = observation_end
```

- FRED 서버에 보낼 **요청 조건(쿼리 파라미터)** 을 딕셔너리로 만듭니다. URL 뒤에 `?series_id=DGS10&api_key=...&file_type=json...` 처럼 붙습니다.
  - `series_id` — 어떤 지표를.
  - `api_key` — 우리 출입증(인증).
  - `file_type: "json"` — **JSON 형식으로 주세요**(FRED 는 XML 도 주지만 우리는 다루기 쉬운 JSON 선택).
  - `observation_start` — 시작일.
  - `sort_order: "asc"` — **오래된 날짜 → 최신 날짜 순(오름차순)** 으로 정렬해서 주세요. (시계열은 시간순이 자연스러움.)
- `if observation_end:` — **종료일은 있을 때만** 추가. None(또는 빈 문자열)이면 이 줄을 건너뛰어 "끝 제한 없음 = 최신까지"가 됩니다.

> 💡 초보 포인트: `if observation_end:` 는 "값이 진짜로 있을 때만"이라는 뜻. None·빈문자열·0 은 False 취급이라 건너뜁니다. 불필요한 파라미터를 안 붙이는 깔끔한 패턴.

#### HTTP 요청 + 에러 처리 — `L71-L75`

```python
# L71-L75
    try:
        resp = httpx.get(f"{BASE_URL}/series/observations", params=params, timeout=_TIMEOUT)
        resp.raise_for_status()
    except httpx.HTTPStatusError as e:
        raise RuntimeError(f"FRED HTTP {e.response.status_code}: {e.response.text}") from e
```

- `httpx.get(주소, params=..., timeout=...)` — 드디어 **실제 인터넷 요청**. 주소는 `BASE_URL + "/series/observations"` (= "관측치(시계열 데이터) 주는 창구").
  - `f"{BASE_URL}/series/observations"` 는 f-string(문자열 안에 변수 끼워넣기) → `https://api.stlouisfed.org/fred/series/observations`.
- `resp.raise_for_status()` — 응답코드가 **에러(4xx/5xx)면 예외를 던짐**. 키가 틀렸거나(403/400), 서버가 죽었거나(500) 등을 잡아냄.
- `except httpx.HTTPStatusError as e:` — 그 에러를 잡아서, **우리만의 친절한 메시지로 바꿔** 다시 던짐:
  - `RuntimeError(f"FRED HTTP {상태코드}: {응답본문}")` — "어떤 상태코드였고 서버가 뭐라고 했는지"를 메시지에 담음. 디버깅할 때 매우 유용.
  - `from e` — **원래 예외를 사슬로 연결**(traceback 에 원인까지 표시). "겉포장은 바꿨지만 원래 원인도 잃지 않게."

> ⚠️ 헷갈리는 포인트: 여기서 잡는 건 **`HTTPStatusError`(서버가 에러코드로 답한 경우)** 뿐입니다. **연결 자체가 안 되거나(`ConnectError`) 타임아웃(`TimeoutException`)** 은 이 `except` 가 안 잡아서 그대로 위로 던져집니다. 호출자(`collector.py`)가 자기 쪽 `try/except` 로 다시 감싸 처리합니다(함정 섹션 참고).

#### 빈 응답 처리 — `L77-L79`

```python
# L77-L79
    observations = resp.json().get("observations", [])
    if not observations:
        return pd.DataFrame()
```

- `resp.json()` — 받은 JSON 을 파이썬 dict 로 변환. FRED 응답은 대략 이렇게 생겼습니다:
  ```json
  { "observations": [ {"date":"2024-01-02","value":"3.95"}, ... ] }
  ```
- `.get("observations", [])` — 그 dict 에서 `observations` 리스트를 꺼냄. **없으면 빈 리스트** `[]` (사전지식 2의 `dict.get` 안전장치).
- `if not observations:` — 비었으면(데이터가 하나도 없으면) **빈 DataFrame 을 반환**하고 끝. 그래야 호출자가 `df.empty` 로 검사해 건너뛸 수 있음.

> 💡 초보 포인트: "데이터가 없는 정상 상황"(예: 너무 최근 구간이라 아직 값이 없음)과 "에러"는 다릅니다. 여기선 **빈 데이터는 에러가 아니라 빈 표**로 다룹니다. 부드러운 실패(graceful).

#### 받은 데이터를 표로 정리 — `L81-L87` (이 함수의 정수)

```python
# L81-L87
    df = pd.DataFrame(observations)[["date", "value"]]
    df["value"] = pd.to_numeric(df["value"], errors="coerce")
    df = df.dropna(subset=["value"])
    df["date"] = pd.to_datetime(df["date"])
    df["series_id"] = series_id
    df["description"] = MACRO_SERIES.get(series_id, series_id)
    return df[["date", "series_id", "description", "value"]].reset_index(drop=True)
```

한 줄씩 뜯어봅니다 — **지저분한 원본 → 깨끗한 표**로 만드는 청소 과정입니다.

- `pd.DataFrame(observations)[["date", "value"]]`
  - 관측치 리스트를 표로 만들고, **우리가 쓸 `date`·`value` 두 열만** 선택. (FRED 는 `realtime_start` 등 다른 열도 주지만 버림.)
- `df["value"] = pd.to_numeric(df["value"], errors="coerce")`
  - **value 를 숫자로 변환**. FRED 의 value 는 사실 **문자열**("3.95")로 옵니다. 숫자로 바꿔야 계산 가능.
  - `errors="coerce"` 가 핵심: **숫자로 못 바꾸는 값은 에러 대신 NaN(빈값)** 으로 만듦. FRED 는 휴장일·결측을 **`"."`(점 하나)** 로 표시하는데, 이걸 NaN 으로 흡수.
- `df = df.dropna(subset=["value"])`
  - value 가 NaN 인 행(= 위에서 `"."` 였던 결측 행)을 **버림**. 깨끗한 숫자 행만 남음.
- `df["date"] = pd.to_datetime(df["date"])`
  - date 열을 문자열 `"2024-01-02"` 에서 **진짜 날짜 타입**으로 변환. 정렬·기간필터·인덱싱이 쉬워짐.
- `df["series_id"] = series_id`
  - 어떤 지표인지 식별용 **열을 추가**(모든 행에 같은 값). 나중에 여러 시리즈를 한 테이블에 쌓을 때 구분자가 됨.
- `df["description"] = MACRO_SERIES.get(series_id, series_id)`
  - **사람이 읽을 한국어 설명 열** 추가. `MACRO_SERIES` 에 있으면 그 설명을, **없으면 시리즈ID 자체**를 설명으로(앞서 본 `.get(key, 기본값)` 안전장치). 그래서 목록 밖 시리즈도 에러 없이 처리됨.
- `return df[["date", "series_id", "description", "value"]].reset_index(drop=True)`
  - 열 순서를 `[date, series_id, description, value]` 로 깔끔히 정렬해 반환.
  - `reset_index(drop=True)` — `dropna` 로 행을 버리면 인덱스 번호에 구멍(0,1,3,4...)이 생기는데, **0,1,2,3... 으로 다시 매김**(drop=True = 옛 인덱스는 버림).

> 💡 초보 포인트: 이 7줄이 **"raw 데이터 정제(cleaning)"의 교과서**입니다. ① 필요한 열만 → ② 타입 변환(coerce) → ③ 결측 제거(dropna) → ④ 메타정보 부착 → ⑤ 인덱스 정리. 강의에서 데이터 전처리 표준 루틴으로 보여주기 좋음.

> ⚠️ 헷갈리는 포인트: `errors="coerce"` 없이 그냥 `pd.to_numeric` 하면 `"."` 를 만나는 순간 **예외로 전체가 죽습니다**. `coerce` 는 "문제값을 NaN 으로 눙쳐서 흐름을 끊지 않는" 결정적 안전장치.

---

### F. 여러 지표 한꺼번에 `get_macro_bundle()` — `L90-L122`

여러 시리즈를 받아 **옆으로 합친 넓은(wide) 표** 하나로 돌려주는 편의 함수입니다.

#### 함수 머리 + 가드 — `L90-L99`

```python
# L90-L99
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
```

- 입력:
  - `start="2015-01-01"` — 시작일(기본 2015년. `get_series` 의 2010 과 다름에 주의).
  - `series_ids=None` — 받을 시리즈 목록. **None 이면 아래에서 `MACRO_SERIES` 전체**로 채움.
- 출력: **"날짜를 인덱스로, 시리즈마다 1열씩"** 의 wide 표(docstring 명시).
- `get_series` 와 똑같이 키 없으면 즉시 에러(가드 반복).

#### 기본 목록 채우기 — `L101-L102`

```python
# L101-L102
    if series_ids is None:
        series_ids = list(MACRO_SERIES.keys())
```

- 호출자가 목록을 안 주면 **`MACRO_SERIES` 의 키 8개 전부**(`FEDFUNDS, DGS10, ...`)를 받습니다.
- `dict.keys()` = 딕셔너리의 키들, `list(...)` = 리스트로 변환.

> 💡 초보 포인트: "인자 기본값을 `None` 으로 두고 함수 안에서 진짜 기본을 채우는" 패턴이 자주 보입니다. 왜 `series_ids=list(MACRO_SERIES.keys())` 를 기본값에 직접 안 쓸까? → 파이썬에서 **기본값으로 가변객체(list/dict)를 쓰면 함정**(모든 호출이 같은 리스트를 공유)이 있어, 관습적으로 `None` 후 내부 채움을 씁니다.

#### 시리즈별로 받아 모으기 — `L104-L112`

```python
# L104-L112
    frames = []
    for sid in series_ids:
        try:
            df = get_series(sid, observation_start=start)
            if not df.empty:
                df = df.set_index("date")["value"].rename(sid)
                frames.append(df)
        except Exception as e:
            log.warning("FRED series %s failed: %s", sid, e)
```

- `frames = []` — 각 시리즈의 결과(한 줄짜리 Series)를 담을 바구니.
- `for sid in series_ids:` — 시리즈 하나씩 반복.
  - `df = get_series(sid, observation_start=start)` — **앞의 핵심 함수를 재사용**해 한 지표를 받음. (코드 재사용 = DRY 원칙.)
  - `if not df.empty:` — 빈 결과는 건너뜀.
  - `df.set_index("date")["value"].rename(sid)` — 받은 표(4열)를 **"날짜→값" Series 한 줄로 압축**하고, 그 Series 의 **이름을 시리즈ID 로** 바꿈(`rename(sid)`). 이래야 나중에 합쳤을 때 **열 이름이 `DGS10`, `DGS2` ...** 가 됨.
  - `frames.append(df)` — 바구니에 담음.
- `except Exception as e:` — **한 시리즈가 실패해도 전체를 멈추지 않음**. `log.warning(...)` 으로 조용히 기록만 하고 다음 시리즈로 넘어감.
  - `log.warning("FRED series %s failed: %s", sid, e)` — `%s` 자리에 `sid`, `e` 가 들어감(어떤 시리즈가 왜 실패했는지). 로깅에선 f-string 보다 이 `%s` 지연포맷 방식이 권장됩니다(실제 로그를 안 찍을 땐 문자열 조립 비용을 아낌).

> 💡 핵심 포인트: 여기서 `except Exception` 으로 **넓게** 잡는 이유 = "8개 중 1개 시리즈(예: `DCOILWTICO`)가 일시 장애여도 나머지 7개는 받아오게" 하기 위함. 묶음 수집에선 **부분 성공**이 전부 실패보다 낫습니다.

#### 빈 결과 방어 — `L114-L115`

```python
# L114-L115
    if not frames:
        return pd.DataFrame()
```

- 모든 시리즈가 실패/빈값이라 바구니가 비었으면 **빈 DataFrame 반환**(`get_series` 의 빈 응답 처리와 같은 철학).

#### 옆으로 합치고 스프레드 보충 — `L117-L122`

```python
# L117-L122
    wide = pd.concat(frames, axis=1).sort_index()
    # 10Y-2Y 스프레드 자체 계산 (T10Y2Y가 없을 경우 fallback)
    if "DGS10" in wide.columns and "DGS2" in wide.columns and "T10Y2Y" not in wide.columns:
        wide["T10Y2Y"] = wide["DGS10"] - wide["DGS2"]

    return wide
```

- `pd.concat(frames, axis=1)` — 바구니의 Series 들을 **옆으로(axis=1, 열 방향) 붙임**. 날짜 인덱스를 기준으로 자동 정렬·합집합. 결과:
  ```
              FEDFUNDS  DGS10  DGS2  VIXCLS  ...
  2015-01-02     0.12   2.12  0.67   17.79
  2015-01-05     ...
  ```
- `.sort_index()` — 날짜 인덱스를 시간순으로 정렬(혹시 섞였을 경우 대비).
- **스프레드 폴백 계산**(주석이 의도를 명시):
  - 조건: `DGS10` 과 `DGS2` 는 받았는데 `T10Y2Y` 는 못 받은 경우.
  - 그러면 `wide["T10Y2Y"] = DGS10 - DGS2` 로 **직접 계산해 채움**. FRED 가 `T10Y2Y` 를 직접 주긴 하지만, 그게 빠졌을 때를 대비한 안전망(역전 신호는 중요하니까).
- 최종 `return wide` — 날짜 인덱스 + 시리즈별 1열짜리 넓은 표.

> ⚠️ 헷갈리는 포인트: `pd.concat(axis=1)` 은 **합집합(outer join)** 이라, **일봉(`DGS10`)과 월봉(`CPIAUCSL`)을 섞으면 빈칸(NaN)이 잔뜩** 생깁니다. 월봉은 한 달에 한 값뿐이라 나머지 날짜는 비기 때문. 이 표를 그대로 쓰려면 `ffill()`(직전 값으로 채우기) 같은 후처리가 필요합니다 — 이 파일은 거기까진 안 합니다(함정 섹션).

> 💡 초보 포인트: `get_series`(한 개) 와 `get_macro_bundle`(여러 개)의 출력 형태가 다릅니다.
> - `get_series` → **long(긴) 형태**: 행마다 `[date, series_id, description, value]`. DB 적재에 적합(한 테이블에 여러 시리즈를 행으로 쌓음).
> - `get_macro_bundle` → **wide(넓은) 형태**: date 인덱스 + 시리즈별 열. 분석·상관관계 보기에 적합.
> 그래서 **DB에 저장하는 collector 는 `get_series` 를** 쓰고, **한눈에 분석할 땐 `get_macro_bundle` 을** 씁니다.

---

## ⚠️ 함정·버그 주의 (코드에 박힌 교훈 모음)

1. **API 키는 import 시점에 한 번만 읽힘** — `FRED_API_KEY = os.getenv(...)` 가 모듈 로드 시 1회 실행. 서버 가동 중 환경변수를 바꿔도 반영 안 됨 → **재시작 필요**. (메모리의 "env 우선순위/중복키 감사" 교훈과 같은 결: 환경변수 설정은 기동 전에 확정.)

2. **docstring vs 실제 반환 열 불일치** — `get_series` docstring 은 `DataFrame(date, series_id, value)` 라고 하지만 실제론 **`description` 열도 포함**(4열). 문서만 믿고 열 개수를 가정하면 어긋남. (사소하지만 강의용 "코드와 주석은 같이 갱신하라"의 예.)

3. **FRED 결측 표기 `"."` 함정** — value 가 문자열 `"."` 로 오는 결측을 `pd.to_numeric(..., errors="coerce")` → `dropna` 로 처리. **이 두 줄이 없으면** 숫자 변환에서 전체가 예외로 죽음. 데이터 소스의 결측 관습을 모르면 디버깅에 시간을 날림.

4. **`get_series` 의 좁은 except** — `try/except` 가 **`httpx.HTTPStatusError` 만** 잡음. **연결 실패·타임아웃은 안 잡혀 위로 전파**됨. 다행히 호출자(`collector.py`, `get_macro_bundle`)가 넓은 `except Exception` 으로 한 번 더 감싸 부분 실패를 흡수. 하지만 `get_series` 를 단독으로 직접 호출하는 새 코드를 짤 땐 **네트워크 예외를 직접 처리**해야 함.

5. **일봉·월봉 혼합 → wide 표에 NaN 다발** — `get_macro_bundle` 이 `CPIAUCSL`(월봉)·`UNRATE`(월봉)와 `DGS10`(일봉)을 한 표로 concat 하면 월봉 시리즈는 날짜 대부분이 NaN. **`ffill` 같은 정렬·채움이 없으면** 그대로 분석하다 잘못된 결론. (모범 예시 `vbt_engine.md` 의 `vix.reindex(close.index).ffill()` 과 같은 정렬 필요성.)

6. **시작일 기본값이 함수마다 다름** — `get_series`(2010-01-01) vs `get_macro_bundle`(2015-01-01). 의도된 차이일 수 있으나, 두 함수를 섞어 쓰며 "같은 기간일 것"이라 가정하면 어긋남.

7. **타임아웃 20초, 재시도 없음** — 일시적 네트워크 끊김에도 그냥 실패. (고도화에서 재시도/백오프 제안.)

---

## 🚀 고도화 아이디어 (강의·개선 버전용)

- **재시도 + 지수 백오프**: FRED 가 일시적 5xx/타임아웃을 줄 때 즉시 포기하지 말고 2~3회 재시도(예: `tenacity` 라이브러리, 1s→2s→4s 백오프). 묶음 수집의 부분 실패율을 크게 낮춤.
- **연결/타임아웃 예외도 포착**: `get_series` 의 except 를 `httpx.HTTPStatusError` → `httpx.HTTPError`(상위) 로 넓혀 `ConnectError`·`TimeoutException` 까지 한 곳에서 일관 처리.
- **wide 표 후처리 옵션**: `get_macro_bundle` 에 `fill: bool = True` 파라미터를 추가해 월봉 시리즈를 `ffill()` 로 채운 "분석용 정렬 표"를 바로 반환.
- **캐싱**: 같은 시리즈를 짧은 시간에 여러 번 요청하면 디스크/메모리 캐시로 FRED 호출을 아낌(무료 키도 분당 호출 제한 존재).
- **비동기화**: `httpx.AsyncClient` + `asyncio.gather` 로 8개 시리즈를 **동시에** 받으면 묶음 수집이 8배 빨라짐(지금은 for 루프로 순차).
- **시리즈 메타 자동화**: `MACRO_SERIES` 설명을 하드코딩 대신 FRED `/series` 엔드포인트에서 제목·단위·주기를 받아 자동 채우면, 새 시리즈 추가 시 설명을 직접 안 적어도 됨.
- **주기(frequency) 메타 부착**: 각 시리즈가 일봉/월봉인지 `description` 옆에 `freq` 열로 명시 → 다운스트림(Regime/백테스트)이 정렬 방식을 자동 결정.
- **VIX 출처 일원화**: `vbt_engine.py` 의 `vix_risk_off` 가 쓰는 VIX 를 이 파일의 `VIXCLS` 로 명확히 연결(현재는 별도 소스일 수 있음). "거시 데이터 단일 출처(single source of truth)" 정리.

---

## 📚 용어 사전 (이 파일 한정)

| 용어 | 뜻 |
|---|---|
| **FRED** | 미국 세인트루이스 연준의 무료 경제 데이터 도서관(API) |
| **시리즈 ID(series_id)** | FRED 데이터 한 종류의 고유 번호표(예: `DGS10`=10년물 금리) |
| **FEDFUNDS** | 미국 기준금리(연방기금금리) |
| **DGS10 / DGS2** | 미국 10년물 / 2년물 국채 금리(일봉) |
| **T10Y2Y** | 10Y−2Y 금리 스프레드. 음수(역전)면 경기침체 선행 신호 |
| **VIXCLS** | CBOE VIX 공포지수(일봉). `vix_risk_off` 전략의 입력 |
| **CPIAUCSL / UNRATE / DCOILWTICO** | CPI 물가(월봉) / 실업률(월봉) / WTI 유가(일봉) |
| **`httpx`** | 파이썬 HTTP 클라이언트(외부 API 호출). `requests` 의 현대판 |
| **`raise_for_status()`** | HTTP 응답이 에러코드면 예외를 던지는 httpx 메서드 |
| **`pd.to_numeric(errors="coerce")`** | 문자열→숫자 변환, 변환 불가값은 NaN 으로(에러 대신) |
| **`dropna(subset=...)`** | 특정 열이 NaN 인 행을 제거 |
| **`dict.get(key, 기본값)`** | 키가 있으면 값, 없으면 기본값(KeyError 방지) |
| **long vs wide 포맷** | long=행으로 쌓기(DB 적재용) / wide=시리즈별 열(분석용) |
| **`pd.concat(axis=1)`** | 여러 Series/DataFrame 을 열 방향(옆으로) 합치기 |
| **`available()` 가드** | 비싼 외부 호출 전 "쓸 수 있나"를 먼저 검사하는 문지기 함수 |
| **graceful 실패** | 에러로 죽지 않고 빈 결과/스킵으로 부드럽게 넘어가기 |
| **macro factor(매크로 팩터)** | 개별 종목이 아닌 시장 전체에 작용하는 거시변수(금리·물가·VIX 등) |
