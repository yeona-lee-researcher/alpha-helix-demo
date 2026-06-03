# `models/retrain_scheduler.py` — 매일 밤 모델을 다시 공부시키는 알람 (완전 라인별 해설)

> 원본: `analytics/app/models/retrain_scheduler.py` (131줄)
> 이 문서는 **교재 표준 형식**(`01_backtest/vbt_engine.md`)을 따릅니다.
> 짝꿍 문서: `03_models/xgb_signal.md`(실제로 학습하는 모델). 이 파일은 "언제·무엇을 다시 학습할지" 정하는 **타이머**일 뿐, 학습 자체는 `xgb_signal.train_model` 이 합니다.

---

## 📌 이 파일 한눈에

이 파일은 **"매일 밤 자동으로 공부하는 알람 시계"** 입니다.

XGBoost 모델(`xgb_signal.py`)은 "내일 이 종목이 오를 확률"을 예측하는데, 시장은 매일 새 데이터가 쌓이므로 **모델도 매일 다시 배워야** 똑똑함을 유지합니다. 이 파일은 **매일 밤 22:30(한국시간)이 되면 스스로 깨어나** 정해진 종목들의 최근 5년치 데이터를 다시 받아 모델을 새로 학습시킵니다. 사람이 매일 밤 버튼을 누를 필요가 없습니다.

핵심 함수는 5개입니다:

| 함수 | 한 줄 역할 | 비유 |
|---|---|---|
| `_get_trained_tickers()` | 재학습할 종목 목록을 만든다 (우선 종목 + 이미 학습된 종목) | 오늘 복습할 과목 명단 작성 |
| `retrain_all(force)` | 명단의 모든 종목을 실제로 재학습한다 (오늘 이미 했으면 건너뜀) | 명단대로 한 과목씩 복습 실행 |
| `_should_retrain_now()` | "지금이 밤 22:30인가?"를 판단 | 알람 시각이 됐는지 시계 확인 |
| `_scheduler_loop()` | 1분마다 시계를 보다가 22:30이 되면 `retrain_all` 호출 | 알람을 기다리는 보초 |
| `start_scheduler()` | 위 루프를 백그라운드 스레드로 띄움 | 보초를 근무에 투입 |

**누가 호출하나?** → `app/main.py` 의 **lifespan**(앱이 켜질 때 실행되는 시작 훅)이 `start_scheduler()` 를 부릅니다. 즉 Analytics 서버(:8001)가 부팅되는 순간 이 알람이 백그라운드에서 돌기 시작합니다. 또한 운영자가 즉시 재학습을 원하면 `POST /models/retrain` 엔드포인트가 `retrain_all(force=...)` 을 직접 부릅니다.

**왜 22:30 KST 인가?** → 미국 증시는 한국시간 밤 22:00(서머타임 기준 23:30, 코드는 22:00 가정)에 마감합니다. 마감 직후엔 그날 종가가 아직 데이터 소스에 안 들어왔을 수 있으니 **30분 여유**를 두고 새 종가가 도착한 뒤 학습합니다.

---

## 🧠 사전 지식 (이거 모르면 막힘)

#### 1) 스케줄러(scheduler) = "정해진 시각에 코드를 자동 실행"
- 보통 리눅스의 **cron**(예: `30 13 * * *` = 매일 13:30 UTC 실행)을 쓰지만, 이 파일은 **외부 라이브러리(APScheduler·cron 등)를 쓰지 않습니다.** 대신 **직접 만든 무한 루프**가 1분마다 "지금 몇 시야?"를 물어보는 가장 단순한 방식(폴링, polling)을 씁니다.
  - 비유: cron 은 "예약 알람"이고, 이 파일은 "시계를 계속 쳐다보다가 22:30이 되면 행동하는 보초"입니다. 라이브러리 의존성 없이 동작하는 게 장점, 정밀하지 않은 게 단점.

#### 2) 타임존(timezone)과 KST
- 컴퓨터 내부 시간은 보통 **UTC**(세계표준시)로 돌아갑니다. 한국시간(KST)은 **UTC + 9시간**.
- `datetime.now(KST)` 는 "지금을 한국시간 기준으로 알려줘"라는 뜻. 서버가 미국 EC2(UTC)에 있어도, 이 코드는 항상 **한국시간 22:30**을 정확히 맞춥니다. (타임존을 안 붙이면 서버 위치에 따라 시각이 어긋나는 흔한 버그가 생깁니다.)

#### 3) 백그라운드 스레드(background thread) & 데몬(daemon)
- **스레드** = 한 프로그램 안에서 동시에 돌아가는 "또 하나의 일꾼". 메인 프로그램(FastAPI 가 API 요청을 처리)이 일하는 동안, 이 알람 스레드는 **따로 옆에서** 시계를 봅니다. 서로 방해하지 않음.
- **데몬 스레드(`daemon=True`)** = "메인이 끝나면 같이 사라지는" 스레드. 서버를 종료하면 알람도 깔끔히 같이 죽습니다(좀비로 남지 않음).

#### 4) 락(Lock)과 중복 방지
- 여러 곳에서 동시에 `retrain_all` 을 부르면(예: 22:30 자동 + 운영자가 버튼) **두 번 학습**하는 사고가 날 수 있습니다.
- `threading.Lock()` = "한 번에 한 명만 들어가는 화장실 문". 한 호출이 학습하는 동안 다른 호출은 문 앞에서 기다립니다. 또 `_last_retrain_date`(오늘 날짜)를 기록해 **하루에 한 번만** 실제 학습하도록 막습니다.

#### 5) joblib 캐시 = "학습 결과 저장 파일"
- 학습이 끝나면 모델을 `models_cache/xgb_TQQQ.joblib` 같은 파일로 저장합니다(`.joblib` = 파이썬 객체를 디스크에 통째로 저장하는 형식).
- 그래서 "이미 학습된 종목 목록"을 알려면 **그 폴더의 `xgb_*.joblib` 파일 이름들을 보면** 됩니다(아래 `_get_trained_tickers`가 정확히 이걸 함).

---

## 🗺 전체 흐름도

```
FastAPI 서버 부팅 (main.py lifespan)
        │  start_scheduler()
        ▼
 ┌─────────────────────────┐
 │  데몬 스레드 "xgb-retrain" │  ← 메인과 별도로 영원히 돎
 └─────────────────────────┘
        │
        ▼   _scheduler_loop()  (무한 반복)
   ┌──────────────────────────────────────────┐
   │ 1) _should_retrain_now() ? (지금 22:30 KST?)│
   │      └ 아니오 → 60초 잠(time.sleep) → 다시  │
   │      └ 예 ↓                                │
   │ 2) retrain_all()                          │
   └──────────────────────────────────────────┘
                    │
                    ▼   retrain_all()
   ┌──────────────────────────────────────────┐
   │ Lock 획득 → 오늘 이미 했나? (날짜 비교)      │
   │   이미 했으면 → "skipped" 반환             │
   │ _get_trained_tickers()  (명단 작성)        │
   │   = PRIORITY_TICKERS ∪ 폴더의 xgb_*.joblib │
   │ for 종목 in 명단:                          │
   │     ^VIX/BTC/ETH 면 건너뜀                  │
   │     get_history(5년치, force_refresh)  ◀─ yf_client
   │     train_model(df, 종목)              ◀─ xgb_signal ★진짜 학습
   │     성공/실패를 results 에 기록            │
   │ _last_retrain_date = 오늘                  │
   └──────────────────────────────────────────┘
                    │
                    ▼
        {status, date, total, success, results}  → 로그 + (엔드포인트면) JSON 응답
```

별도 경로: 운영자가 `POST /models/retrain?force=true` → `retrain_all(force=True)` 직접 호출 (스케줄러를 안 기다리고 즉시).
독립 실행: `python -m app.models.retrain_scheduler [--force]` → `retrain_all` 한 번 실행 후 JSON 출력.

---

## 📖 라인별 해설

### A. 파일 설명서(docstring) — `L1-L15`

```python
# L1-L15
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
```
- `"""..."""` = 파일 맨 위 **설명서(docstring)**. 실행되지 않고 사람이 읽는 용도.
- "두 가지 실행 방식"을 명시: ① 서버 안에서 자동(기본), ② 터미널에서 손으로(`python -m ...`). 같은 `retrain_all` 을 두 입구에서 쓸 수 있게 설계됐습니다.
- "주말/공휴일 관계없이 실행" — 시각만 보고 돌므로 **휴장일에도 22:30이면 학습을 시도**합니다. 그래도 데이터가 안 바뀌었으면 결과가 거의 같으니 큰 낭비는 아니라는 설계 의도.
- ⚠️ **헷갈리는 포인트(중요)**: 마지막 줄 "기본 우주(`DEFAULT_UNIVERSE`)의 주요 종목도 포함"은 **실제 코드와 다릅니다.** 아래에서 보겠지만 `DEFAULT_UNIVERSE` 는 import 만 되고 **실제 명단 작성에는 쓰이지 않습니다**(대신 `PRIORITY_TICKERS` 사용). 문서가 코드보다 앞서간 흔한 사례 → '함정' 절에서 다시 짚습니다.

---

### B. import 와 모듈 상수 — `L16-L43`

```python
# L16-L25
from __future__ import annotations
import logging
import threading
import time
from datetime import datetime, timezone, timedelta
from pathlib import Path

from app.config import MODEL_DIR, DEFAULT_UNIVERSE
from app.data.yf_client import get_history
from app.models.xgb_signal import train_model
```
- `from __future__ import annotations` — 타입힌트를 문자열처럼 늦게 평가(`str | None` 같은 표기를 구버전에서도 안전히). 초보는 "최신 타입표기 주문" 정도로.
- 표준 라이브러리 3종이 이 파일의 뼈대:
  - `logging` — 로그 출력(언제 무엇을 했는지 기록). `print` 대신 쓰면 레벨·시각·이름이 붙어 운영에 유리.
  - `threading` — 백그라운드 스레드 + Lock.
  - `time` — `time.sleep()`(잠자기)에 사용.
  - `datetime/timezone/timedelta` — 시각·타임존 계산.
  - `Path` — 파일 경로 다루기(여기선 import 만 되고 직접은 안 씀; `MODEL_DIR` 가 이미 `Path` 객체).
- **외부에서 가져오는 3개가 이 파일의 협력자**:
  - `MODEL_DIR` — 모델 `.joblib` 들이 저장된 폴더 경로(`config.py` 에서 `models_cache`).
  - `DEFAULT_UNIVERSE` — 화이트리스트 종목 목록(앞서 말했듯 **여기선 실제로 안 쓰임**).
  - `get_history` — 야후/Polygon 등에서 OHLCV(시고저종·거래량) 5년치를 받아오는 함수.
  - `train_model(df, ticker)` — **진짜 학습기**. 이 파일은 이걸 부를 뿐.

```python
# L27-L30
log = logging.getLogger("alpha-helix.retrain")

# KST = UTC+9
KST = timezone(timedelta(hours=9))
```
- `log` — 이 파일 전용 로거. 이름 `"alpha-helix.retrain"` 으로 로그를 필터·검색하기 쉽게.
- `KST = timezone(timedelta(hours=9))` — **한국 타임존 객체**를 한 번 만들어 모듈 전역에 둠. 이후 `datetime.now(KST)` 로 어디서나 한국시간을 얻습니다. (`timedelta(hours=9)` = 9시간 차이.)

```python
# L32-L43
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
```
- `PRIORITY_TICKERS` — **항상 학습할 핵심 10종목**. 3배 레버리지 ETF(`TQQQ`=나스닥3배, `SOXL`=반도체3배, `TECL`=기술3배, `UPRO`=S&P3배, `QLD`=나스닥2배)와 벤치마크/안전자산(`QQQ`,`SPY`,`SCHD`배당, `TLT`장기채, `GLD`금)이 섞여 있습니다. 무한매수법 후보들과 비교 기준이 되는 종목들.
- `_POLL_INTERVAL_SEC = 60` — 루프가 **60초마다** 시각을 확인. 1분 정밀도면 "22:30~22:31" 창을 놓치지 않기에 충분.
- `_last_retrain_date` — "마지막으로 학습한 날짜(YYYY-MM-DD 문자열)". 처음엔 `None`(아직 안 함). `global` 로 `retrain_all` 안에서 갱신됩니다. **하루 1회 제한의 핵심 변수**.
- `_lock` — 동시 실행을 막는 자물쇠(사전지식 4번).
- 💡 초보 포인트: 변수명 앞 `_`(언더스코어)는 "이 모듈 내부용, 밖에서 함부로 쓰지 마세요"라는 파이썬 관습. `PRIORITY_TICKERS`처럼 밖에서 봐도 되는 건 대문자, 내부용은 `_소문자`.

---

### C. 학습할 종목 명단 만들기 `_get_trained_tickers()` — `L46-L52`

```python
# L46-L52
def _get_trained_tickers() -> list[str]:
    """MODEL_DIR의 xgb_*.joblib 파일에서 티커 목록 추출."""
    tickers = []
    for p in MODEL_DIR.glob("xgb_*.joblib"):
        ticker = p.stem.replace("xgb_", "")
        tickers.append(ticker)
    return list(set(PRIORITY_TICKERS + tickers))
```
- **무엇을**: 재학습할 종목 명단을 두 출처를 합쳐 만든다.
  1. `MODEL_DIR.glob("xgb_*.joblib")` — 모델 폴더에서 `xgb_` 로 시작하고 `.joblib` 로 끝나는 모든 파일을 찾음(`glob` = 와일드카드 파일 검색). 예: `xgb_TQQQ.joblib`, `xgb_AAPL.joblib`.
  2. `p.stem` = 확장자 뺀 파일명(`xgb_TQQQ`), `.replace("xgb_", "")` = 앞의 `xgb_` 제거 → `"TQQQ"`. 즉 **파일명에서 티커를 역추출**.
- **왜**: 과거에 한 번이라도 학습된 종목(파일이 생긴 종목)은 **계속 최신 상태로 유지**해야 합니다. 사용자가 임의 종목 `AAPL` 을 백테스트하며 모델이 생겼다면, 다음부터는 매일 밤 자동으로 `AAPL` 도 재학습 대상에 포함됩니다.
- `set(PRIORITY_TICKERS + tickers)` — 두 목록을 합치고 **`set` 으로 중복 제거**. 예: `PRIORITY_TICKERS` 에도 있고 폴더에도 있는 `QQQ` 가 두 번 학습되지 않게. 다시 `list(...)` 로 되돌려 반환.
- 💡 헷갈리는 포인트: `set` 은 **순서를 보장하지 않습니다.** 그래서 재학습 순서는 매번 달라질 수 있는데, 학습은 종목끼리 독립이라 순서가 결과에 영향을 주지 않으므로 문제없습니다.

---

### D. 핵심 함수 `retrain_all()` — `L55-L95` (이 파일의 알맹이)

함수 머리 + 오늘 날짜 + 중복 방지:
```python
# L55-L66
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
```
- `force: bool = False` — 기본은 "오늘 이미 했으면 건너뛰기". 운영자가 `force=True` 로 부르면 **이미 했어도 강제 재실행**(예: 데이터를 고쳤으니 다시 학습하고 싶을 때).
- `global _last_retrain_date` — 함수 안에서 모듈 전역 변수를 **읽기만 하는 게 아니라 바꾸겠다**는 선언(파이썬에서 전역에 대입하려면 필수).
- `today = datetime.now(KST).strftime("%Y-%m-%d")` — **한국시간 기준 오늘 날짜**를 `"2026-06-01"` 형식 문자열로. (`strftime` = 시각을 정해진 형식 문자열로 변환.)
- `with _lock:` — **여기서부터 함수 끝까지 한 번에 한 호출만** 들어옴(자물쇠). 자동 시각 트리거와 운영자 버튼이 겹쳐도 안전.
- `if not force and _last_retrain_date == today:` — "강제도 아니고, 오늘 이미 했으면" → 학습을 건너뛰고 `{"status": "skipped", ...}` 즉시 반환. **하루 1회 보장의 실제 코드.**
- 💡 헷갈리는 포인트: 날짜 비교는 **KST 자정 기준**입니다. 22:30에 학습하면 `_last_retrain_date="오늘"` 이 되고, 다음날 00:00을 넘기면 날짜가 바뀌어 다시 학습 가능해집니다.

명단 작성 + 학습 루프:
```python
# L68-L84
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
```
- `tickers = _get_trained_tickers()` — 위 C 함수로 최종 명단 확보. 로그로 몇 개·무엇인지 남김.
- `results = {}` — 종목별 결과를 담을 딕셔너리(`{"TQQQ": {...}, "SPY": {...}}`).
- `for ticker in tickers:` — **한 종목씩 순차 처리**. 각 종목을 `try/except` 로 감싸 **한 종목이 실패해도 전체가 멈추지 않게** 함(매우 중요한 견고성 설계).
- `if ticker in ("^VIX", "BTC-USD", "ETH-USD"): continue` — **VIX(공포지수)와 크립토는 건너뜀.** XGBoost 시그널은 미국 주식/ETF 용으로 설계됐고, VIX 는 지표일 뿐 매매 대상이 아니며 크립토는 별도 파이프라인이라 제외. `continue` = 이 종목은 학습하지 않고 다음 종목으로.
- `get_history(ticker, period="5y", interval="1d", force_refresh=True)` — **최근 5년치 일봉**을 받아옴. `force_refresh=True` 가 핵심: **캐시를 무시하고 최신 데이터를 새로 가져옴**(어제 종가가 빠진 캐시로 학습하면 안 되니까).
- `result = train_model(df, ticker)` — **실제 학습.** `xgb_signal.train_model` 이 시계열 교차검증(`TimeSeriesSplit`)으로 성능을 재고, 전체 데이터로 최종 학습한 뒤 `xgb_TICKER.joblib` 로 저장하고 `{ticker, samples, cv_avg, model_path}` 를 반환합니다(짝꿍 문서 참조).
- 성공 로그: `samples`(학습 표본 수)와 `cv_acc`(교차검증 평균 정확도)를 남김. `result.get("cv_avg", {}).get("accuracy", 0)` — `cv_avg` 안의 `accuracy` 를 안전하게 꺼냄(없으면 0). `%.3f` = 소수 3자리.
- `except Exception as e:` — 어떤 이유로든(데이터 부족, 네트워크 오류, xgboost 미설치 등) 실패하면 **에러 로그만 남기고** 그 종목은 `{"error": "..."}` 로 기록한 뒤 다음 종목 계속.
- 💡 헷갈리는 포인트: `train_model` 자체도 xgboost 미설치 시 **예외 대신 `{"error": ...}` 를 정상 반환**합니다. 그 경우 `try` 는 통과하지만 결과에 `error` 키가 들어가 아래 성공 집계에서 실패로 셉니다(두 경로 모두 `results[ticker]["error"]` 형태로 통일됨).

마무리 집계 + 반환:
```python
# L86-L95
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
```
- `_last_retrain_date = today` — **오늘 했음을 기록**(다음 호출은 skip 됨). ⚠️ 주의: 일부/전부 실패해도 날짜는 갱신됩니다 → 오늘은 더 이상 자동 재시도하지 않음(함정 절 참조).
- `success = sum(1 for v in results.values() if "error" not in v)` — 결과들 중 **`error` 키가 없는 것의 개수** = 성공 수. (`sum(1 for ...)` = 조건 맞는 항목 세기 관용구.)
- 최종 반환 딕셔너리: `status/date/total(전체 시도 수)/success(성공 수)/results(종목별 상세)`. 이게 `POST /models/retrain` 의 JSON 응답이자, 자동 실행 시엔 로그로만 소비됩니다.

---

### E. "지금 학습할 시각인가?" `_should_retrain_now()` — `L98-L101`

```python
# L98-L101
def _should_retrain_now() -> bool:
    """22:30 KST ±1분 이내인지 확인."""
    now = datetime.now(KST)
    return now.hour == 22 and 30 <= now.minute <= 31
```
- **무엇을**: 현재 한국시간이 **22:30 또는 22:31**이면 `True`.
- **왜 30~31 두 칸인가**: 루프가 60초마다 돕니다. 정확히 22:30:00에 깨어나지 못할 수 있어 **2분 창**(22:30, 22:31)을 둬서 한 번은 반드시 걸리게. 동시에 `retrain_all` 의 "오늘 이미 했으면 skip" 덕분에 **창 안에서 두 번 깨어나도 실제 학습은 한 번**만 됩니다.
- 💡 헷갈리는 포인트: 분(minute)만 보고 초(second)는 안 봅니다. 22:30:59에 들어와도 통과. "분 단위 정밀도면 충분"하다는 판단.

---

### F. 백그라운드 보초 `_scheduler_loop()` — `L104-L113`

```python
# L104-L113
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
```
- **무엇을**: `while True` **무한 루프**로, 매 회전마다 ① 지금이 22:30인지 확인 → ② 맞으면 `retrain_all()` 호출 → ③ 60초 잠자기 → 반복.
- `try/except` 로 루프 전체를 감쌈 — **한 번 학습이 통째로 실패해도 루프는 죽지 않고** 다음 회전을 계속함(보초가 한 번 넘어져도 다시 일어남). 학습 실패로 알람이 영영 멈추는 사고 방지.
- `time.sleep(_POLL_INTERVAL_SEC)` — 60초 동안 **아무 일도 안 하고 쉼**(CPU 낭비 방지). 이 sleep 덕에 루프가 1분에 한 번만 돕니다.
- 💡 헷갈리는 포인트: 22:30에 학습이 시작되면 그 학습이 끝날 때까지(수십 초~수 분) `time.sleep` 까지 못 갑니다. 학습 후 sleep(60초)을 거치면 이미 22:31~32라, 같은 날 다시 22:30 창에 들어오는 일은 없습니다.

---

### G. 시작 함수 `start_scheduler()` — `L116-L121`

```python
# L116-L121
def start_scheduler():
    """FastAPI lifespan 등에서 호출 — 데몬 스레드로 스케줄러 시작."""
    t = threading.Thread(target=_scheduler_loop, daemon=True, name="xgb-retrain")
    t.start()
    log.info("retrain scheduler thread started")
    return t
```
- **무엇을**: `_scheduler_loop` 를 **별도 스레드**로 띄움.
  - `target=_scheduler_loop` — 새 스레드가 실행할 함수(괄호 없음! 함수를 "넘겨주는" 것, 여기서 부르는 게 아님).
  - `daemon=True` — 서버 종료 시 같이 죽는 데몬 스레드(사전지식 3번). 안 그러면 서버를 끄려 해도 무한 루프 때문에 안 꺼짐.
  - `name="xgb-retrain"` — 스레드에 이름표(디버깅·로그에서 식별).
- `t.start()` — 스레드 가동 시작. 이 순간부터 `_scheduler_loop` 가 백그라운드에서 돕니다.
- `return t` — 스레드 객체 반환(호출자가 필요하면 참조 가능; 보통은 안 씀).
- **호출처(정확히)**: `app/main.py` 의 lifespan —
  ```python
  if os.getenv("DISABLE_RETRAIN_SCHEDULER", "0") != "1":
      start_scheduler()           # XGBoost 재학습
      start_data_scheduler()      # 시장 데이터 수집
  ```
  즉 환경변수 `DISABLE_RETRAIN_SCHEDULER=1` 이 아니면 서버 부팅 시 자동 시작. 테스트·로컬에서 끄고 싶으면 그 변수를 `1` 로.

---

### H. 독립 실행 진입점 — `L124-L131`

```python
# L124-L131
if __name__ == "__main__":
    import sys
    logging.basicConfig(level=logging.INFO)
    force = "--force" in sys.argv
    result = retrain_all(force=force)
    import json
    print(json.dumps(result, ensure_ascii=False, indent=2))
```
- `if __name__ == "__main__":` — 이 파일을 **직접** `python -m app.models.retrain_scheduler` 로 실행할 때만 도는 블록(다른 파일이 import 할 땐 실행 안 됨).
- `logging.basicConfig(level=logging.INFO)` — 터미널에서 INFO 레벨 로그가 보이게 설정(서버 모드에선 서버가 이미 로깅을 설정하므로 불필요).
- `force = "--force" in sys.argv` — 명령행에 `--force` 가 있으면 강제 재학습. (`sys.argv` = 명령행 인자 목록.)
- `retrain_all(force=force)` 를 **한 번** 실행(스케줄러를 띄우지 않고 즉시 1회). 운영자가 손으로 재학습할 때 쓰는 입구.
- `json.dumps(result, ensure_ascii=False, indent=2)` — 결과를 **보기 좋은 JSON**으로 출력. `ensure_ascii=False` 라야 한글이 `\uXXXX` 로 깨지지 않고 그대로 보임, `indent=2` 는 들여쓰기.

---

## ⚠️ 함정·버그 주의 (코드에 박힌 교훈 + 잠재 이슈)

1. **docstring vs 코드 불일치 — `DEFAULT_UNIVERSE` 가 안 쓰임**
   - docstring 은 "`DEFAULT_UNIVERSE` 의 주요 종목도 포함"이라 적었지만, 실제 `_get_trained_tickers` 는 **`PRIORITY_TICKERS`(하드코딩 10종) + 폴더의 `.joblib`** 만 씁니다. `DEFAULT_UNIVERSE` 는 import 만 되고 사용 0회. → 문서를 믿지 말고 코드를 보거나, 의도대로라면 `_get_trained_tickers` 에 `DEFAULT_UNIVERSE` 를 합치도록 고쳐야 함.

2. **실패해도 날짜를 갱신 → 그날은 자동 재시도 없음**
   - `_last_retrain_date = today` 는 성공/실패와 무관하게 루프 끝에서 실행됩니다. 22:30에 네트워크 장애로 전부 실패해도 "오늘 했음"으로 기록되어, **그날 23:00에 일시 복구돼도 자동 재학습을 안 합니다.** 복구하려면 운영자가 `force=True` 로 수동 호출해야 함. (개선: 성공이 0건이면 날짜를 갱신하지 않기.)

3. **타임존을 안전하게 처리 — 그러나 미국 서머타임은 미고려**
   - `datetime.now(KST)` 로 서버 위치와 무관하게 한국시간을 맞추는 건 잘 했습니다. 다만 "미국 장 마감 22:00"은 **표준시(EST) 기준**이고, 서머타임(EDT) 기간엔 마감이 KST 05:00(즉 한국 새벽)으로 바뀝니다. 22:30 고정은 서머타임엔 "마감 한참 후"라 데이터는 충분하지만, 의미상 "마감 30분 후"는 아닙니다.

4. **폴링 방식의 한계 — 22:30에 서버가 꺼져 있으면 그날은 건너뜀**
   - cron 처럼 "놓친 작업을 나중에 보충(catch-up)"하지 않습니다. 22:30에 서버가 재시작 중이거나 다운이면 그날 학습은 통째로 누락. (개선: 부팅 시 "오늘 아직 안 했으면 한 번 돌리기" 같은 캐치업 로직.)

5. **중복 실행 방지는 이중 안전망**
   - `_should_retrain_now` 의 2분 창(30~31분)에 루프가 두 번 들어와도, `retrain_all` 의 날짜 비교가 두 번째를 skip 합니다. 또 `_lock` 이 자동 트리거와 운영자 `force` 호출이 동시에 학습하는 사고를 막습니다. **단, `force=True` 두 개가 동시에 오면** lock 으로 직렬화는 되지만 둘 다 실제 학습합니다(force 는 날짜 체크를 우회하므로).

6. **`force_refresh=True` 가 학습 신선도의 생명줄**
   - 캐시된 옛 데이터로 학습하면 "어제 종가"가 빠진 모델이 됩니다. `get_history(..., force_refresh=True)` 가 이를 막지만, 그만큼 **매일 밤 모든 종목의 5년치를 새로 받는 네트워크 부하**가 있습니다. (종목 10~수십 개면 데이터 소스 레이트리밋 주의.)

---

## 🚀 고도화 아이디어 (강의·개선 버전용)

- **진짜 스케줄러 라이브러리로 교체**: 폴링 루프 대신 **APScheduler**(`CronTrigger(hour=22, minute=30, timezone="Asia/Seoul")`)를 쓰면 정밀·캐치업·다중 잡 관리가 깔끔해집니다. 강의에서 "수제 루프 vs cron 라이브러리" 비교 자료로 좋음.
- **실패 시 재시도/알림**: 종목 실패를 모았다가 N분 후 재시도, 전부 실패하면 Slack/이메일 알림. `success==0` 이면 `_last_retrain_date` 갱신 보류.
- **부팅 캐치업**: `start_scheduler` 시작 시 "오늘 22:30을 이미 지났고 오늘 학습 기록이 없으면" 즉시 1회 학습.
- **`DEFAULT_UNIVERSE` 반영**: docstring 의도대로 명단에 합치거나, 반대로 미사용 import 를 제거해 문서·코드 일치.
- **병렬 학습**: 종목이 많아지면 `ThreadPoolExecutor`/`ProcessPoolExecutor` 로 동시 학습(단, 데이터 소스 레이트리밋·CPU 고려).
- **메트릭 영속화**: 매일 `cv_avg` 를 DB/CSV 에 적재해 **모델 성능 추이**를 추적(드리프트 감지). cv 정확도가 추세적으로 하락하면 피처 재설계 신호.
- **서머타임 인지**: 미국 시장 캘린더(`pandas_market_calendars`)로 "실제 마감 시각 + 30분"을 동적으로 계산.
- **휴장일 스킵**: 거래 캘린더로 휴장일엔 학습을 건너뛰어 불필요한 데이터 요청·재학습 절감.

---

## 📚 용어 사전 (이 파일 한정)

| 용어 | 뜻 |
|---|---|
| 스케줄러(scheduler) | 정해진 시각에 코드를 자동 실행하는 장치. 여기선 수제 폴링 루프 |
| 폴링(polling) | "지금 됐어?"를 주기적으로 반복해 묻는 방식(이벤트 알림의 반대) |
| KST / 타임존 | 한국표준시(UTC+9). `timezone(timedelta(hours=9))` 로 표현 |
| `datetime.now(KST)` | 한국시간 기준 현재 시각 |
| 스레드(thread) | 한 프로그램 안에서 동시에 도는 또 하나의 일꾼 |
| 데몬 스레드(`daemon=True`) | 메인이 끝나면 함께 종료되는 백그라운드 스레드 |
| `threading.Lock()` | 한 번에 한 호출만 들어가게 하는 자물쇠(동시 실행 방지) |
| `MODEL_DIR.glob("xgb_*.joblib")` | 모델 폴더에서 패턴에 맞는 파일 찾기 |
| `p.stem` | 파일 경로에서 확장자 뺀 이름(`xgb_TQQQ.joblib`→`xgb_TQQQ`) |
| `set(...)` | 중복 제거 자료구조(순서 미보장) |
| `force_refresh=True` | 캐시 무시하고 데이터 새로 받기 |
| `train_model(df, ticker)` | 실제 XGBoost 학습+저장 함수(`xgb_signal.py`) |
| `cv_avg` | 시계열 교차검증 평균 성능(accuracy/precision/recall) |
| lifespan | FastAPI 앱 시작/종료 시 실행되는 훅. 여기서 스케줄러 기동 |
| `if __name__ == "__main__"` | 파일을 직접 실행할 때만 도는 블록 |
