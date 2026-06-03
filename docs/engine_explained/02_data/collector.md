# `data/collector.py` — 시장 데이터 조달팀 (완전 라인별 해설)

> 원본: `analytics/app/data/collector.py` (246줄)
> 이 문서는 교재 표준 예시 [`01_backtest/vbt_engine.md`](../01_backtest/vbt_engine.md) 와 동일한 형식을 따릅니다.
> 함께 읽으면 좋은 이웃 파일: `market_db.py`(저장소), `polygon_client.py`·`fred_client.py`·`binance_client.py`(공급처).

---

## 📌 이 파일 한눈에

이 파일은 **"여러 시장에서 장 보는 식재료 조달팀"** 입니다.

vbt_engine(백테스트)·xgb_signal(ML 시그널)·regime(국면)·trust_score(신뢰점수) 같은 **요리사**들은 "재료(가격·거시 데이터)"가 있어야 일합니다. 그런데 재료는 여기저기 흩어져 있습니다 — 미국 주식은 **Polygon.io 마트**, 거시지표는 **FRED 정부 창고**, 코인은 **Binance 시장**에. `collector.py` 는 매일 이 세 곳을 돌며 장을 봐서, 한 냉장고(**MySQL `market_ohlcv` / `market_macro` 테이블**)에 차곡차곡 채워 넣는 **조달팀**입니다. 요리사들은 냉장고(`market_db`)만 열면 되고, 어느 마트에서 왔는지는 신경 쓸 필요가 없습니다.

핵심은 **"수집 함수 4개 + 스케줄러 2개"** 입니다:

| 함수 | 한 줄 역할 | 비유 |
|---|---|---|
| `collect_us_ohlcv(...)` | Polygon 에서 US ETF 일봉을 가져와 DB upsert | 정육점에서 고기 사와 냉장고에 넣기 |
| `collect_macro(...)` | FRED 에서 금리·VIX·CPI 등 거시지표를 가져와 DB upsert | 채소가게에서 채소 사오기 |
| `collect_crypto_ohlcv(...)` | Binance 에서 코인 OHLCV 를 가져와 DB upsert | 수산시장에서 생선 사오기 |
| `full_initial_load(...)` | 서버 켤 때 5년치를 한꺼번에 싹 채움(빈 칸 메우기) | 이사 첫날 냉장고 풀충전 |
| `_scheduler_loop()` | 백그라운드에서 시계를 보며 정해진 시각에 위 함수들 호출 | 알람 맞춰놓고 자동 장보기 |
| `start_scheduler()` / `stop_scheduler()` | 그 백그라운드 알람을 켜고/끔 | 조달팀 출근/퇴근 |

**누가 호출하나?** → `app/main.py`:
- **서버 시작 시(lifespan)** `start_scheduler()` 가 호출됩니다 (`main.py:52`, `start_data_scheduler` 별칭). 그러면 5년치 초기 적재(`full_initial_load`)가 백그라운드로 한 번 돌고, 동시에 매일·매시간 자동 수집 루프가 시작됩니다.
- **수동 트리거 엔드포인트**: `POST /data/collect`(`main.py:619`)가 `collect_us_ohlcv`+`collect_macro`+`collect_crypto_ohlcv` 를, `POST /data/collect/initial`(`main.py:635`)가 `full_initial_load` 를 부릅니다.
- **온디맨드 보완**: `GET /data/macro`(`main.py:557`)는 DB 가 비었고 FRED 키가 있으면 `collect_macro` 로 즉석 보충합니다.
- **현황 조회**: `GET /data/status`(`main.py:480`)는 이 파일의 상수 `US_SYMBOLS`·`CRYPTO_SYMBOLS`·`FRED_SERIES` 를 그대로 응답에 실어 "무엇을 수집 대상으로 보는지" 보여줍니다.

> ⚠️ 문서·코드 불일치 1건(반드시 기억): 파일 맨 위 docstring 과 `CLAUDE.md` 일부는 "야후 파이낸스(yfinance)"를 언급하지만, **이 파일이 실제로 import 하는 미국 주식 소스는 `polygon_client` 입니다**(L16). yfinance 는 `collector.py` 가 아니라 `main.py` 의 `/data/ohlcv`·`/data/ticker` 엔드포인트에서 *최후의 폴백*으로만 직접 쓰입니다. 교재는 항상 **실제 코드** 기준으로 설명합니다.

---

## 🧠 사전 지식 (이거 모르면 막힘)

#### 1) OHLCV = 캔들 하나의 5개 숫자
하루치 가격은 숫자 한 개가 아니라 다섯 개입니다.

| 약자 | 뜻 | 예시(어떤 날 TQQQ) |
|---|---|---|
| **O**pen | 시가(장 시작가) | 50.0 |
| **H**igh | 고가(그날 최고) | 52.3 |
| **L**ow | 저가(그날 최저) | 49.1 |
| **C**lose | 종가(장 마감가) | 51.8 |
| **V**olume | 거래량(몇 주 거래됐나) | 1,200,000 |

- 이 다섯 개 + 날짜(타임스탬프)가 한 줄(=캔들 하나)이고, 날짜별로 쌓이면 **시계열 OHLCV** 가 됩니다. `DataFrame` 의 한 행 = 캔들 하나.
- `vwap`(거래량가중평균가), `quote_volume`(코인의 USDT 환산 거래대금)은 소스마다 더 주는 보너스 컬럼.

#### 2) 심볼 유니버스 = "우리가 관리하는 종목 목록"
- **유니버스(universe)** = 시스템이 다루는 전체 종목 집합. 이 파일에선 미국 ETF 12개(`US_SYMBOLS`), 코인 5개(`CRYPTO_SYMBOLS`)로 못박아 둡니다.
- 왜 못박나? → 세상 모든 종목을 매일 긁으면 API 한도·DB 용량이 폭발. **"우리 전략이 실제로 쓰는 것만"** 추려 수집합니다.

#### 3) 거시지표(FRED) = "개별 종목이 아니라 경제 전체의 체온"
- 주가는 한 회사 이야기지만, **금리·VIX·CPI·실업률** 같은 거시지표는 시장 전체의 환경입니다.
- FRED(Federal Reserve Economic Data) = 미국 연준이 운영하는 무료 경제데이터 창고. 시리즈 ID 로 부릅니다 (`FEDFUNDS`=기준금리, `VIXCLS`=공포지수, `T10Y2Y`=장단기 금리차…).
- `regime.py`·`trust_score.py` 가 "지금이 강세장인가 약세장인가"를 판단할 때 이 거시지표를 봅니다.

#### 4) 멱등(idempotent) upsert = "몇 번 돌려도 결과가 같다"
- **upsert** = UPDATE + INSERT. "있으면 갱신, 없으면 새로 넣기".
- **멱등** = 같은 데이터를 두 번 수집해도 **행이 중복되지 않고 덮어쓰기만** 됨. (수학에서 `f(f(x))=f(x)`.)
- 왜 중요? → 스케줄러가 매일 "최근 7일"을 가져오면 어제·그제 데이터가 **겹칩니다**. 멱등이 아니면 같은 날 캔들이 여러 줄 쌓여 백테스트가 망가집니다. 여기선 `market_db` 의 `ON DUPLICATE KEY UPDATE` + `UNIQUE KEY (symbol, source, tf, ts)` 가 멱등을 보장합니다.
- 비유: 화이트보드에 "오늘 환율 1300" 이라고 **덮어 적기**. 종이에 계속 새로 적어 쌓는 게 아님.

#### 5) 스케줄러 = "시계를 보며 정해진 때 자동 실행하는 알람"
- 사람이 매일 06:00 에 직접 버튼을 누를 수 없으니, **백그라운드 스레드**가 1분마다 깨어나 "지금 06시인가?"를 확인하고 맞으면 수집을 돌립니다.
- **데몬 스레드(daemon thread)** = 메인 프로그램이 끝나면 같이 죽는 보조 일꾼. 서버(메인)가 종료되면 알람도 알아서 꺼집니다.

#### 6) UTC = "전 세계 공통 표준시 (시차 0 기준점)"
- 한국시간(KST)은 UTC+9. 이 파일의 스케줄은 전부 **UTC 기준**입니다. 예: 미국장 종가 확정 후인 "06:00 UTC"는 한국시간 오후 3시.

---

## 🗺 전체 흐름도

```
                       ┌──────────────── 외부 소스(마트) ────────────────┐
                       │                                                 │
   Polygon.io ─────────┤  polygon_client.get_daily_bars()  → DataFrame   │
   (US ETF 일봉)        │                                                 │
   FRED ───────────────┤  fred_client.get_series()          → DataFrame   │
   (거시지표)           │                                                 │
   Binance ────────────┤  binance_client.get_klines_full()  → DataFrame   │
   (코인 OHLCV)         │                                                 │
                       └──────────────────────┬──────────────────────────┘
                                              │  각 수집 함수가
                                              │  for sym in 유니버스: 반복
                                              ▼
                          ┌─────────────────────────────────────┐
                          │  market_db.upsert_ohlcv(df, tf)      │  ← 멱등 upsert
                          │  market_db.upsert_macro(df)          │     (있으면 갱신)
                          └──────────────────┬──────────────────┘
                                              ▼
                              MySQL  market_ohlcv / market_macro
                                              ▲
                                              │  나중에 요리사들이 꺼내 씀
                          vbt_engine · xgb_signal · regime · trust_score


   ┌─ 시간 축(스케줄러) ──────────────────────────────────────────────┐
   │  서버 시작 → start_scheduler()                                    │
   │     ├─ [스레드 A] full_initial_load(5년)   ← 한 번, 빈칸 채우기     │
   │     └─ [스레드 B] _scheduler_loop() 무한루프 (1분마다 시계 확인)    │
   │            ├ 06:00 UTC  → collect_us_ohlcv + collect_crypto_ohlcv │
   │            ├ 07:00 UTC  → collect_macro                           │
   │            └ 매시 정각   → collect_crypto_ohlcv(1h)                │
   └──────────────────────────────────────────────────────────────────┘
```

---

## 📖 라인별 해설

### A. 파일 설명서(docstring) — `L1-L9`

```python
# L1-L9
"""
데이터 수집 스케줄러 — Polygon.io, FRED, Binance 데이터를 주기적으로 수집해 DB에 저장.

스케줄:
  - OHLCV 일봉    : 매일 06:00 UTC (미국 시장 종가 확정 후)
  - 매크로(FRED)  : 매일 07:00 UTC
  - Binance 코인  : 매 1시간
  - 전체 초기 수집 : 서버 시작 시 (누락 구간 채우기)
"""
```
- **무엇을 하나**: 파일 맨 위 설명서. 실행되지 않고 사람이 읽는 용도. "어디서(3개 소스), 언제(스케줄 4종) 가져오나"를 한눈에 정리.
- **왜 이렇게 하나**: 06:00 UTC 가 의미심장합니다 — 미국 증시는 한국시간 새벽까지 열리므로, **장이 완전히 닫혀 그날 종가가 확정된 뒤** 가져와야 어제 캔들이 "완성된 값"이 됩니다. 너무 일찍 가져오면 미완성(중간) 가격을 받습니다.
- **헷갈리는 포인트**: docstring 은 "Polygon.io, FRED, Binance" 3개만 말합니다. yfinance 가 빠진 것이 정상 — 이 파일은 yfinance 를 import 하지 않습니다(📌 절의 불일치 경고 참고).

### B. import 와 모듈 전역 상태 — `L10-L18`

```python
# L10-L18
from __future__ import annotations
import logging
import threading
import time
from datetime import date, timedelta

from app.data import polygon_client, fred_client, binance_client, market_db

log = logging.getLogger(__name__)
```
- `from __future__ import annotations` — 타입힌트를 늦게(문자열로) 평가하게 하는 주문. 초보는 "최신 타입표기를 쓰기 위한 한 줄" 로 이해하면 됩니다 (`list[str] | None` 같은 표기를 구버전에서도 쓰게 해줌).
- `threading` — **백그라운드 스레드**(병렬 일꾼)를 만들기 위함. 스케줄러가 서버를 멈추지 않고 따로 돌아야 하니까.
- `time` — 잠깐 멈추기(`sleep`). 스케줄러가 1분마다 깨어나 확인하는 데 씁니다.
- `from datetime import date, timedelta` — `date.today()`(오늘 날짜) 와 `timedelta(days=7)`(7일이라는 기간)을 다루는 도구. "오늘로부터 7일 전" 같은 계산에 필수.
- **핵심 import 줄**: `polygon_client`(US 주식), `fred_client`(거시), `binance_client`(코인), `market_db`(저장소). **이 4개가 조달팀의 협력업체 전부.** yfinance·polygon 의 차이는 📌 경고 참조.
- `log = logging.getLogger(__name__)` — 이 파일 전용 로거. `log.info/warning/error` 로 "무엇을 했는지" 흔적을 남깁니다 (수집이 백그라운드라 화면에 안 보이므로 로그가 유일한 눈).

> 💡 초보 포인트: `from app.data import X` 는 폴더(`app/data/`) 안의 모듈 X 를 통째로 가져와 `X.함수()` 로 쓰는 방식. `from X import 함수` 와 달리 어느 모듈의 함수인지가 호출부에 그대로 드러나 가독성이 좋습니다.

### C. 수집 대상 심볼 유니버스 — `L20-L44`

```python
# L20-L44
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
```
- **무엇을 하나**: 세 개의 "장바구니 목록" 상수. 함수에 아무 인자도 안 주면 이 기본 목록 전체를 수집합니다(아래 함수들의 `symbols or US_SYMBOLS` 패턴).
- **왜 이렇게 하나 / 종목 선정 의도**:
  - 레버리지 ETF(`TQQQ`=나스닥 3배, `SOXL`=반도체 3배, `UPRO`=S&P 3배…) — 이 시스템의 주력 매매 대상(고변동·고위험). 무한매수법·시그널이 주로 이들을 노립니다.
  - 벤치마크(`SPY`=S&P500, `QQQ`=나스닥100) — "전략이 그냥 시장 추종보다 나은가" 비교 기준선.
  - 방어자산(`TLT`=장기국채, `GLD`=금, `SHY`=단기국채, `SCHD`=배당) — 약세장 회피·리스크오프용.
  - 코인은 전부 `~USDT` 페어(테더 기준가) — Binance 가 그렇게 표기.
  - FRED 시리즈는 regime/trust_score 가 쓰는 거시 묶음(금리 곡선·VIX·물가·고용·유가).
- **헷갈리는 포인트**: `T10Y2Y`(10년물−2년물 금리차)가 음수면 "장단기 금리 역전" = 역사적으로 경기침체 선행신호. 그래서 일부러 포함. / `CPIAUCSL`·`UNRATE` 는 **월봉**(한 달에 한 번 갱신)이라 매일 받아도 새 값이 안 나올 수 있는데, 멱등 upsert 라 문제없습니다(그냥 같은 값 덮어쓰기).

### D. 모듈 전역 스케줄러 핸들 — `L46-L47`

```python
# L46-L47
_scheduler_thread: threading.Thread | None = None
_running = False
```
- **무엇을 하나**: 스케줄러의 "켜짐/꺼짐 스위치"와 "스레드 핸들"을 모듈 전역에 둡니다.
  - `_running` — `False` 면 루프가 멈춤(스케줄러 ON/OFF 깃발).
  - `_scheduler_thread` — 실제 백그라운드 스레드 객체를 담아둘 변수(처음엔 비어 있음=`None`).
- **왜 이렇게 하나**: `start_scheduler()`·`stop_scheduler()`·`_scheduler_loop()` 세 함수가 **하나의 같은 상태**를 공유해야 하므로 함수 밖(모듈 전역)에 둡니다. 앞의 `_`(언더스코어)는 "외부에서 만지지 마세요(내부용)" 관습 표시.
- **헷갈리는 포인트**: 이런 모듈 전역 깃발 방식은 **프로세스당 하나뿐**(싱글톤)이라는 가정에 의존합니다. uvicorn 을 워커 여러 개로 띄우면 각 워커가 따로 스케줄러를 돌려 **중복 수집**이 일어날 수 있습니다 (⚠️ 함정 절 참고).

---

### E. `collect_us_ohlcv()` — Polygon US ETF 일봉 수집 — `L52-L75`

```python
# L52-L59
def collect_us_ohlcv(symbols: list[str] = None, days_back: int = 7) -> dict:
    """Polygon.io에서 US ETF 일봉 수집."""
    if not polygon_client.available():
        return {"skipped": True, "reason": "POLYGON_API_KEY not set"}

    symbols = symbols or US_SYMBOLS
    end_date = date.today().isoformat()
    start_date = (date.today() - timedelta(days=days_back)).isoformat()
```
- **무엇을 하나(머리 부분)**:
  - 인자: `symbols`(가져올 종목, 안 주면 기본 유니버스), `days_back=7`(오늘로부터 며칠 전까지).
  - `polygon_client.available()` — `POLYGON_API_KEY` 환경변수가 있는지 검사. 키가 없으면 **에러를 던지지 않고** `{"skipped": True, ...}` 를 돌려주고 곱게 빠집니다. → 키가 없는 개발 환경에서도 서버가 죽지 않게 하는 **graceful degradation(우아한 격하)**.
  - `symbols = symbols or US_SYMBOLS` — 파이썬 관용구. `symbols` 가 `None`/빈리스트면 기본 유니버스로 대체.
  - `end_date`/`start_date` — "오늘"과 "days_back 일 전"을 `YYYY-MM-DD` 문자열로. Polygon 의 `get_daily_bars(symbol, from_date, to_date)` 가 이 형식을 요구.
- **헷갈리는 포인트**: `days_back=7` 인데 왜 7일? → 어제 하루만 받으면 주말·공휴일에 빈손이 됩니다. 며칠 겹쳐 받아도 **멱등 upsert** 라 안전하므로, 넉넉히 7일을 받아 구멍을 메웁니다.

```python
# L61-L75
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
```
- **무엇을 하나(본문)**: 종목 하나하나(`for sym in symbols`) 돌면서:
  1. `polygon_client.get_daily_bars(...)` 로 그 종목 일봉 `DataFrame` 을 받음.
  2. 비어있지 않으면(`not df.empty`) `market_db.upsert_ohlcv(df, tf="1d")` 로 DB 저장. 반환값 `n` = 저장된 행 수.
  3. 종목별 결과를 `results` 딕셔너리에 기록(`{"TQQQ": {"rows": 5, "ok": True}, ...}`).
- **왜 try/except 로 감싸나**: 한 종목(`SOXL`)이 API 오류로 실패해도 **나머지 종목 수집은 계속**되도록. 실패는 `log.warning` 으로 남기고 `results[sym]` 에 `ok: False` 로 표시할 뿐, 전체를 중단시키지 않습니다 → **부분 실패 격리**.
- **반환값**: 종목별 성공/실패 요약 dict. `POST /data/collect` 처럼 사람이 부를 때 "뭐가 됐고 뭐가 안 됐나" 확인용.
- **헷갈리는 포인트**: `tf="1d"` 의 `tf`(timeframe, 타임프레임)는 "이 캔들이 1일짜리"라는 라벨. DB 의 UNIQUE KEY 에 `tf` 가 들어가므로, 같은 종목의 일봉(1d)과 시간봉(1h)이 **서로 다른 행**으로 공존합니다 (코인이 1d·1h 둘 다 수집되는 이유).

> 💡 초보 포인트: `log.warning("... %s ...", sym, e)` 처럼 `%s` 와 인자를 **콤마로 분리**해 넘기는 게 정석. `f"...{sym}..."` 로 미리 합치지 않는 이유는, 로그 레벨이 꺼져 있으면 문자열 합치기 비용조차 안 들이려는 logging 모듈의 지연평가 최적화 때문입니다.

---

### F. `collect_macro()` — FRED 거시지표 수집 — `L78-L98`

```python
# L78-L84
def collect_macro(series_ids: list[str] = None, days_back: int = 30) -> dict:
    """FRED에서 매크로 지표 수집."""
    if not fred_client.available():
        return {"skipped": True, "reason": "FRED_API_KEY not set"}

    series_ids = series_ids or FRED_SERIES
    start = (date.today() - timedelta(days=days_back)).isoformat()
```
- **무엇을 하나**: `collect_us_ohlcv` 와 쌍둥이 구조. 다만 종목(symbol) 대신 **FRED 시리즈 ID**(`series_id`)를 돌고, `days_back` 기본값이 **30일**(거시지표는 주식보다 갱신이 느려서 더 넓게 봄).
- `fred_client.available()` — `FRED_API_KEY` 검사. 없으면 skip.
- **헷갈리는 포인트**: `start`만 만들고 `end` 는 안 만듭니다. `fred_client.get_series(sid, observation_start=start)` 가 `observation_end` 를 안 주면 "최신까지" 가져오기 때문 (시그니처상 `observation_end=None` 이 기본).

```python
# L86-L98
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
```
- **무엇을 하나**: 시리즈마다 `get_series` → `market_db.upsert_macro(df)`. `upsert_macro` 는 `date/series_id/value` 컬럼을 받아 `market_macro` 테이블에 멱등 저장.
- **collect_us_ohlcv 와의 미묘한 차이(헷갈리는 포인트)**: 여기엔 `else: results[sid] = {"rows": 0, ...}` 가지가 **없습니다**. 즉 `df.empty`(빈 응답)면 `results` 에 그 시리즈가 **아예 안 들어갑니다**. 그래서 `len(results)`(로그의 "done: N series")가 요청한 시리즈 수보다 작을 수 있음 — 버그는 아니지만 "왜 8개 요청했는데 6개만 보고되지?"의 이유. (`collect_us_ohlcv` 는 빈 응답도 `rows:0, ok:True` 로 집계.)

---

### G. `collect_crypto_ohlcv()` — Binance 코인 OHLCV 수집 — `L101-L118`

```python
# L101-L118
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
```
- **무엇을 하나**: 앞 두 함수와 같은 패턴. 차이점 셋:
  1. **available() 검사가 없다** — Binance Public API 는 **API 키가 필요 없어**(무인증) 항상 호출 가능. 그래서 skip 가지가 없음.
  2. **`interval` 파라미터** — `"1d"`(일봉) 또는 `"1h"`(시간봉)를 골라 받을 수 있음. 그리고 `upsert_ohlcv(df, tf=interval)` 로 그 라벨 그대로 저장 → 일봉/시간봉이 DB 에서 분리 보관.
  3. **`get_klines_full`** 사용 — 이 함수는 내부에서 **페이지네이션**(1000봉씩 끊어 여러 번 요청)으로 긴 기간도 통째로 가져옵니다. `days_back=7` 이면 짧지만, `full_initial_load` 에선 5년치를 이 한 함수로 다 긁습니다.
- **헷갈리는 포인트**: `collect_macro` 처럼 여기도 `else`(빈 응답) 가지가 없어, 빈 응답은 `results` 에 누락됩니다. 정상 동작.

---

### H. `full_initial_load()` — 서버 시작 시 5년치 일괄 적재 — `L121-L171`

```python
# L121-L130
def full_initial_load(years_back: int = 5) -> dict:
    """
    초기 전체 수집 — 서버 시작 시 누락 구간 채우기.
    Polygon / FRED는 키가 있을 때만 실행.
    Binance는 항상 실행 (공개 API).
    """
    log.info("full_initial_load start (years_back=%d)", years_back)
    start_date = (date.today() - timedelta(days=365 * years_back)).isoformat()

    results: dict = {}
```
- **무엇을 하나**: 매일 돌리는 수집은 "최근 며칠"만 보지만, 이 함수는 **5년 전부터 오늘까지** 한 번에 채웁니다. 서버를 처음 켜거나, 오래 꺼져 있어 구멍이 크게 났을 때 "냉장고 풀충전"용.
- `start_date = 오늘 − 365 × 5 일` — 윤년·거래일 무시하고 대략 5년(365×5=1825일). 멱등이라 며칠 오차는 무관.
- **헷갈리는 포인트**: 함수 이름은 "전체 load(적재)" 지만 실제론 **upsert** 라, 이미 있는 데이터는 덮어쓸 뿐 중복 생성 안 함. "초기 1회용"이라는 의미지 "DB 를 비우고 다시 채운다"는 뜻이 아닙니다.

```python
# L132-L144
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
```
- **무엇을 하나(블록 1)**: Polygon 키가 있으면 US 유니버스 전체를 5년치 일봉으로 받아 upsert. 결과 키를 `f"polygon_{sym}"`(예: `"polygon_TQQQ"`)으로 둬서 어느 소스인지 구분.
- **collect 함수들과의 차이(헷갈리는 포인트)**: 여기 `results` 값은 dict(`{"rows":n,"ok":True}`)가 아니라 **숫자 `n` 자체**(성공) 또는 `"error: ..."` 문자열(실패). 즉 `full_initial_load` 와 `collect_*` 의 반환 형식이 **다릅니다**. 둘을 같은 코드로 파싱하려 하면 깨짐 — 단순 진행 로그/디버그용이라 형식 통일이 안 된 부분.

```python
# L146-L156
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
```
- **무엇을 하나(블록 2)**: FRED 키가 있으면 거시 시리즈 전체를 5년 시작점부터 받아 upsert. 결과 키는 `f"fred_{sid}"`.
- **헷갈리는 포인트**: `collect_macro` 는 `days_back` 으로 시작일을 만들었지만, 여기선 함수 맨 위에서 계산한 `start_date`(5년 전)를 그대로 `observation_start` 에 넘깁니다. 같은 `get_series` 함수를 다른 시작점으로 호출하는 것뿐.

```python
# L158-L171
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
```
- **무엇을 하나(블록 3)**: 코인은 `if ...available()` **없이 무조건** 실행(주석이 친절히 설명: 공개 API). `get_klines_full` 의 페이지네이션이 5년치(약 1825봉)를 1000봉씩 두 번 정도 끊어 받아옵니다.
- **세 블록의 공통 철학**: Polygon·FRED 는 키 게이트 뒤에, Binance 는 무조건. → **키 없는 환경(로컬 데모)에서도 코인 데이터만큼은 채워져** 백테스트가 최소한 돌아가게 하는 설계.
- **반환값**: `{"polygon_TQQQ": 1820, "fred_VIXCLS": 1300, "binance_BTCUSDT": 1825, ...}` 형태의 진행 요약.

> 🚀 고도화 힌트: 지금은 "무조건 5년 전부터" 다시 긁습니다. DB 의 `get_collection_stats()`(각 심볼 최신 ts)를 먼저 조회해 **"마지막 저장일 다음날부터"만** 받으면 초기 로드가 훨씬 빨라지고 API 호출도 절약됩니다(증분 적재). 지금은 멱등 upsert 라 "정확하지만 낭비가 있는" 방식.

---

### I. `_scheduler_loop()` — 시계 보며 자동 수집하는 무한루프 — `L176-L215`

```python
# L176-L185
def _scheduler_loop():
    """백그라운드 수집 루프 (UTC 시간 기준)."""
    import time as _time
    from datetime import datetime, timezone

    log.info("data collection scheduler started")

    last_daily_date = None
    last_macro_date = None
    last_crypto_hour = None
```
- **무엇을 하나(머리)**: 백그라운드 스레드가 실행할 본체. 함수 안에서 `time`·`datetime` 을 **다시 import** 하는데(`import time as _time`), 이는 별도 스레드 컨텍스트에서 이름 충돌·지연 import 안전성을 노린 방어적 스타일(파일 상단에도 `time` 이 이미 import 돼 있어 기능상 필수는 아님).
- **세 개의 "마지막 실행 기록" 변수**:
  - `last_daily_date` — 일봉을 마지막으로 수집한 **날짜**.
  - `last_macro_date` — 거시를 마지막으로 수집한 날짜.
  - `last_crypto_hour` — 코인 시간봉을 마지막으로 수집한 **시(hour)**.
- **왜 이렇게 하나**: 루프가 **1분마다** 깨어나므로, 조건을 시각만으로 판단하면 06:00~06:59 사이 60번을 다 실행하게 됩니다. "마지막 실행 기록"과 비교해 **하루(또는 한 시간)에 딱 한 번만** 돌도록 막는 **중복 방지 빗장(de-dup guard)**.

```python
# L187-L197
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
```
- **무엇을 하나**: `while _running` — `_running` 깃발이 True 인 동안 무한 반복(`stop_scheduler()` 가 False 로 바꾸면 탈출).
- 일봉 조건: **지금이 6시대(`now.hour == 6`)이고, 아직 오늘 일봉을 안 받았으면(`last_daily_date != now.date()`)** → US+코인 일봉을 3일치 받음. 끝나면 `last_daily_date` 를 오늘로 갱신해 **오늘 다시는 안 돌게** 잠금.
- **왜 `days_back=3`**: 06:00 정각 한 번 놓쳐도(서버 재시작 등) 다음날 3일치를 받으면 구멍이 메워짐. 멱등이라 겹침은 무해.
- **헷갈리는 포인트**: `now.hour == 6` 은 06:00~06:59 어느 분이든 참. "1분마다 확인 + last_date 빗장" 조합 덕에, 그 1시간 동안 처음 깨어난 그 1분에만 실행됩니다.

```python
# L199-L213
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
```
- **무엇을 하나(거시)**: 07:00 UTC 대에 하루 한 번 `collect_macro(days_back=7)`. 일봉(06시)과 1시간 떼어 둔 이유는 부하 분산 + FRED 업데이트가 미국 오전에 반영되는 점 고려.
- **무엇을 하나(코인 시간봉)**: `last_crypto_hour != now.hour` — **시(hour)가 바뀔 때마다** 1시간봉을 1일치 받음. 즉 **매시 정각 직후 첫 1분**에 한 번. 코인은 24시간 거래되므로 일봉보다 잦게 갱신.
- **헷갈리는 포인트**: 코인 시간봉 조건엔 `now.hour == X` 같은 특정 시각이 없습니다. "시가 바뀌면 무조건"이라 **매시간 정확히 한 번** 실행. `last_crypto_hour` 가 23→0 으로 바뀌는 자정도 자연히 처리됨.

```python
# L215
        _time.sleep(60)  # 1분마다 체크
```
- **무엇을 하나**: 한 바퀴 돌고 **60초 잠듦**. 그래야 CPU 를 100% 안 먹고, 1분 단위 해상도로 시각을 확인합니다.
- **왜 1분**: 너무 짧으면 낭비, 너무 길면 06:00 을 놓칠 위험. 06시대는 60분이라 1분 체크면 충분히 잡음.

> 💡 초보 포인트: 이 패턴(`while 깃발: 시각확인 → 조건맞으면 작업 → 마지막실행기록 갱신 → sleep`)은 **cron 없이 앱 안에서 스케줄링**하는 전형적 방식. 장점은 외부 cron 설정이 필요 없음, 단점은 서버가 죽으면 알람도 죽음(⚠️ 절 참고).

---

### J. `start_scheduler()` — 스케줄러 가동 — `L218-L239`

```python
# L218-L226
def start_scheduler():
    """수집 스케줄러 시작 (백그라운드 데몬 스레드)."""
    global _scheduler_thread, _running

    if _running:
        log.warning("scheduler already running")
        return

    _running = True
```
- **무엇을 하나**: `global _scheduler_thread, _running` — 함수 안에서 모듈 전역 변수를 **수정하겠다**는 선언(없으면 파이썬은 새 지역변수로 오해).
- `if _running: return` — **이미 켜져 있으면 두 번 켜지 않음**(중복 스레드 방지 가드). 멱등하게 호출 가능.
- `_running = True` — 깃발을 올려 루프가 돌 수 있게 함.

```python
# L228-L239
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
```
- **무엇을 하나**: 두 개의 백그라운드 스레드를 띄웁니다.
  1. **초기 로드 스레드(`data-initial-load`)** — 안쪽 함수 `_initial()` 이 `full_initial_load(5)` 를 돌림. 이걸 **별도 스레드**로 분리한 이유는 핵심: 5년치 수집은 수십 초~분이 걸리는데, 만약 lifespan 안에서 동기로 돌면 **서버가 그동안 요청을 못 받습니다(기동 block)**. 그래서 따로 던져놓고 서버는 바로 뜨게 함.
  2. **스케줄러 루프 스레드(`data-scheduler`)** — `_scheduler_loop()` 무한루프를 돌림. 핸들을 `_scheduler_thread` 전역에 저장.
- `daemon=True` — **데몬 스레드**. 메인(서버)이 종료되면 이 두 스레드도 강제로 같이 죽음 → 서버 끄면 알람도 알아서 정리.
- `name="..."` — 스레드에 이름표. 로그·디버거에서 어느 스레드인지 식별 편의.
- **헷갈리는 포인트**: `_initial` 스레드는 핸들을 전역에 저장하지 않습니다(던지고 잊음, fire-and-forget). 한 번 돌고 끝나는 일회성이라 추적할 필요가 없기 때문. 반면 `_scheduler_loop` 는 계속 돌고 나중에 멈춰야 하므로 `_running` 깃발로 제어.

---

### K. `stop_scheduler()` — 스케줄러 정지 — `L242-L245`

```python
# L242-L245
def stop_scheduler():
    global _running
    _running = False
    log.info("data collection scheduler stopped")
```
- **무엇을 하나**: `_running = False` 로 깃발을 내림. 그러면 `_scheduler_loop` 의 `while _running:` 이 **다음 바퀴에서 자연히 탈출**합니다.
- **왜 이렇게(부드러운 종료)**: 스레드를 강제로 죽이지(kill) 않고 **깃발만 내려** 루프가 스스로 끝나게 함 → 수집 중간에 끊겨 DB 가 어중간해지는 사고를 피함(안전한 graceful stop).
- **헷갈리는 포인트**: `_running=False` 후에도 최대 60초(마지막 `sleep`)까지는 루프가 살아 있을 수 있습니다(이미 sleep 에 들어가 있으면 깰 때까지 대기). 즉시 멈추지는 않음. 또 이 파일 안에선 `stop_scheduler` 를 부르는 곳이 없고(테스트/수동용), `daemon=True` 라 서버 종료 시엔 호출 없이도 스레드가 정리됩니다.

---

## ⚠️ 함정·버그 주의 (코드에 박힌 교훈 + 실전 주의)

1. **docstring vs 실제 소스 불일치** — 파일/`CLAUDE.md` 가 "yfinance(야후)"를 언급하지만 **`collector.py` 는 yfinance 를 import 하지 않습니다**. US 주식 소스는 Polygon. yfinance 폴백은 `main.py` 의 `/data/ohlcv`·`/data/ticker` 에만 존재. (교재 1순위 함정: 문서를 믿지 말고 import 줄을 보라.)

2. **반환 형식이 함수마다 다름** — `collect_*` 는 `{"sym": {"rows":n, "ok":True}}` 구조를, `full_initial_load` 는 `{"polygon_sym": n}`(숫자/문자열) 구조를 돌려줌. 게다가 `collect_us_ohlcv` 만 빈 응답을 `rows:0` 으로 집계하고, `collect_macro`/`collect_crypto_ohlcv` 는 빈 응답을 결과에서 **누락**시킴. 자동 파싱 코드를 짜면 깨지기 쉬움.

3. **멀티 워커 = 중복 수집** — 스케줄러 상태(`_running`)가 **모듈 전역(프로세스당 1개)**. uvicorn 을 `--workers N` 으로 띄우면 N 개 프로세스가 각자 스케줄러를 돌려 같은 데이터를 N 번 upsert(낭비, DB 부하). 멱등이라 데이터는 안 깨지지만 비효율. 운영은 워커 1개거나, 스케줄러를 별도 단일 프로세스로 분리해야 안전.

4. **시각 빗장이 "정시 통과"에 의존** — `now.hour == 6` 은 06:xx 중 처음 깨어난 1분에만 실행됨. 만약 서버가 06:30 에 시작되면 그날 일봉은 06:59 까지 안 깨어났던 게 아니라 **바로 다음 1분에 실행**되므로 보통 괜찮지만, 06:00~06:59 를 통째로 건너뛰는 다운타임이 있으면 그날 06시 트리거는 영영 건너뜀(다음날 days_back=3 이 메워줌).

5. **`_running` 종료 지연** — `stop_scheduler()` 호출 후에도 진행 중인 `sleep(60)` 와 진행 중인 수집이 끝날 때까지(최악 수십 초) 루프가 살아 있을 수 있음. 즉시 정지 아님.

6. **DB 자격증명 기본값** — 수집된 데이터가 가는 곳은 `market_db._DB_URL`. 거기 `DB_USERNAME`/`DB_PASSWORD`/`DB_NAME` 미설정 시 하드코딩 기본값(`devbridge`/`changeme`/`devbridge_db`)으로 붙으려다 실패할 수 있음 — 수집이 조용히 에러 로그만 남기고 0행이 되면 여기부터 의심.

7. **Polygon 무료키 15분 지연** — 무료 키는 지연 데이터라 "방금 종가"가 즉시 안 들어올 수 있음. 06:00 UTC 수집이 권장되는 또 다른 이유(장 마감 한참 뒤).

8. **빈 try 본문의 silent 격리** — 모든 수집이 `except Exception` 으로 감싸여 한 종목 실패가 전체를 안 막는 건 장점이지만, **에러가 `log.warning` 으로만 남고 호출자에게 예외로 전파되지 않음**. 로그를 안 보면 "수집이 됐는지 안 됐는지" 모를 수 있음 → 모니터링(아래 고도화) 필요.

---

## 🚀 고도화 아이디어 (강의·개선 버전용)

- **증분 적재(incremental)**: `full_initial_load` 가 매번 5년치를 다시 긁는 대신, `market_db.get_collection_stats()` 의 심볼별 `latest` 를 읽어 **"마지막 저장일+1 부터"**만 받기 → 기동 속도·API 절약. (현재는 정확하지만 낭비.)
- **스케줄러를 cron/APScheduler 로 교체**: 직접 `while+sleep` 대신 `APScheduler` 의 `CronTrigger` 를 쓰면 "06:00 정각" 트리거가 명확하고, 누락 시각 보정·중복 방지가 라이브러리 차원에서 보장됨. 멀티워커 환경에선 외부 cron + 단일 워커 엔드포인트 호출 패턴이 더 안전.
- **분산 잠금(distributed lock)**: 멀티 워커 중복 수집을 막으려면 Redis `SETNX` 나 DB 의 advisory lock 으로 "이 시각 수집은 한 프로세스만" 보장.
- **수집 헬스 알림**: `collect_*` 결과의 `ok:False` 개수가 임계치를 넘으면 Slack/메일 알림. 지금은 로그에만 남아 묻히기 쉬움.
- **반환 형식 통일**: `collect_*` 와 `full_initial_load` 의 결과 dict 스키마를 하나로 통일(예: 항상 `{key: {"rows":n, "ok":bool, "error":str|None}}`) → `/data/collect` 응답·모니터링 코드 단순화.
- **유니버스 동적화**: `US_SYMBOLS` 등을 코드 상수가 아니라 DB/설정 테이블에서 읽어, 종목 추가에 재배포가 필요 없게.
- **레이트리밋 백오프**: API 429(과다요청) 시 지수 백오프 재시도. 지금은 한 번 실패하면 그 종목은 그날 건너뜀.
- **재시도 큐**: 실패한 (symbol, date) 조합을 `market_data_log` 기반으로 모아 다음 사이클에 우선 재수집.

---

## 📚 용어 사전 (이 파일 한정)

| 용어 | 뜻 |
|---|---|
| OHLCV | 한 캔들의 시가·고가·저가·종가·거래량 5개 숫자 |
| 심볼 유니버스 | 시스템이 수집·매매 대상으로 삼는 종목 목록(여기선 US 12개·코인 5개) |
| 거시지표(FRED) | 금리·VIX·CPI·실업률 등 경제 전체 상태값. 시리즈 ID 로 호출 |
| FRED 시리즈 ID | `FEDFUNDS`(기준금리)·`VIXCLS`(VIX)·`T10Y2Y`(장단기 금리차) 등 FRED 의 데이터 식별자 |
| upsert | UPDATE+INSERT. 있으면 갱신, 없으면 삽입 |
| 멱등(idempotent) | 같은 작업을 여러 번 해도 결과가 한 번과 동일(중복 행 안 생김) |
| `tf`(timeframe) | 캔들 한 개의 기간 라벨. `1d`(일봉)·`1h`(시간봉). DB UNIQUE KEY 구성요소 |
| `days_back` | "오늘로부터 며칠 전까지" 받을지 지정하는 수집 폭 |
| graceful degradation | 키가 없으면 에러 대신 `{"skipped": True}` 로 곱게 빠지는 설계 |
| 스케줄러 루프 | `while+sleep(60)` 로 시각을 보며 정해진 때 수집을 트리거하는 무한루프 |
| 데몬 스레드 | 메인 프로세스 종료 시 함께 죽는 백그라운드 일꾼(`daemon=True`) |
| de-dup 빗장 | `last_daily_date != now.date()` 처럼 "이미 했으면 또 안 함"을 막는 비교 |
| 모듈 전역 깃발 | `_running` 처럼 함수 밖에 두어 여러 함수가 공유하는 ON/OFF 상태 |
| UTC | 시차 0 기준 세계 표준시. 이 파일 모든 스케줄의 기준 |
| 페이지네이션 | 긴 기간을 1000봉씩 끊어 여러 번 요청해 합치는 것(`get_klines_full`) |
| `_` 접두사 | "내부용, 밖에서 직접 부르지 마세요" 파이썬 관습 |
