# `app/main.py` — Analytics 엔진의 API 허브 (완전 라인별 해설)

> 원본: `analytics/app/main.py` (882줄, FastAPI 진입점 — 모든 엔드포인트가 모이는 곳)
> 이 문서는 **표준 형식**([`01_backtest/vbt_engine.md`](../01_backtest/vbt_engine.md))을 따르되, **엔드포인트 중심**으로 구성합니다.

---

## 📌 이 파일 한눈에

이 파일은 엔진의 **"주문 접수대(API 허브)"** 입니다.

비유하자면 **식당의 주문 접수대**입니다. 손님(백엔드 Spring)이 "AAPL 5년치를 sma_cross 전략으로 백테스트 해줘"라고 주문하면, 접수대는
1. **손님이 맞는지 신분증을 확인**하고(내부 토큰 인증),
2. **주문서가 제대로 적혔는지 검사**한 뒤(Pydantic 검증),
3. **알맞은 주방(모듈 함수)에 일을 넘기고**(`run_backtest`, `compute_trust_score` 등),
4. **완성된 요리를 JSON 접시에 담아 돌려줍니다.**

스스로 백테스트를 계산하지 않습니다 — **누가 무엇을 요청했는지 받아서, 알맞은 모듈로 배달하고, 결과를 포장**하는 "교통정리(라우팅)" 역할이 전부입니다.

**누가 호출하나?** → **백엔드 Spring Boot(:8080)** 가 이 서비스(:8001)를 HTTP 로 호출합니다. 사용자의 브라우저가 직접 부르지 않습니다(중간에 Spring 이 인증·주문·결제를 처리). Spring 은 매 요청에 `X-Internal-Token` 헤더를 붙여 "나는 정식 백엔드다"를 증명합니다.

**이 파일이 다루는 영역(7묶음):**

| 묶음 | 엔드포인트 | 호출하는 모듈 |
|---|---|---|
| 헬스/운영 | `/health`, `/models/retrain`, `/models/train`, `/price/latest` | `retrain_scheduler`, `xgb_signal`, `yf_client` |
| 백테스트 | `/backtest`, `/backtest/infinite-buying`, `/orders/infinite-buying/plan` | `vbt_engine`, `infinite_buying`, `quantstats_report` |
| 시그널 | `/signals/today` | `vbt_engine` + `xgb_signal` + `shap_explainer` |
| 신뢰성 검증 | `/robust/walk-forward`, `/regime`, `/trust` | `walkforward`, `regime`, `trust_score` |
| 리포트 | `/report/full` + 정적 `/reports/*.html` | `quantstats` |
| 시장 데이터 | `/data/status·ohlcv·macro·orderbook·ticker·funding·collect·collect/initial` | `market_db`, `polygon_client`, `binance_client`, `fred_client`, `collector` |
| 선물/Lean | `/futures/backtest·signal`, `/lean/strategies·backtest·backtest/start·backtest/status·health` | `futures_engine`, `lean.runner`, `lean.jobs` |

---

## 🧠 사전 지식 (이거 모르면 막힘)

이 파일은 계산이 아니라 **"웹 서버 뼈대"** 이므로, 알아야 할 개념이 vbt_engine 과 다릅니다.

#### 1) FastAPI = "함수에 URL 주소표를 붙이는 도구"
- 평범한 파이썬 함수 위에 `@app.post("/backtest")` 한 줄을 붙이면, 그 함수가 **"POST /backtest 로 들어온 요청을 처리하는 핸들러"** 가 됩니다.
- 이 `@...` 표시를 **데코레이터**라 부릅니다. "이 함수에 꼬리표를 단다" 정도로 이해하면 됩니다.
- `@app.get` = 조회용(읽기), `@app.post` = 데이터를 보내 실행시키는 용도(쓰기/계산 트리거). 이 파일은 대부분 무거운 계산이라 `post` 가 많습니다.

#### 2) Pydantic 모델 = "주문서 양식(요청 검증기)"
```python
class BacktestReq(BaseModel):
    ticker: str          # 필수 — 없으면 자동 거부
    period: str = "5y"   # 선택 — 안 적으면 "5y"
```
- `BaseModel` 을 상속한 클래스는 **"이 모양으로 와야 한다"는 주문서 양식**입니다.
- 핸들러 인자에 `req: BacktestReq` 를 적으면, FastAPI 가 **들어온 JSON 을 이 양식에 맞춰 자동 검사·변환**합니다. `ticker` 가 없거나 숫자를 문자열 칸에 넣으면 **422 에러를 자동으로** 돌려줍니다(핸들러 코드가 실행되기도 전에).
- `= 기본값` 이 있으면 선택 항목, 없으면 필수 항목. → 핸들러 안에서는 "값이 항상 올바른 타입으로 들어온다"고 믿고 코드를 짤 수 있습니다(방어 코드 절약).

#### 3) 의존성 주입 `Depends` = "이 함수 실행 전에 먼저 거쳐야 하는 관문"
```python
@app.post("/backtest", dependencies=[Depends(require_internal_token)])
```
- `dependencies=[Depends(require_internal_token)]` = **"이 핸들러를 실행하기 전에 `require_internal_token` 을 먼저 통과시켜라"**.
- 관문 함수가 예외(`HTTPException`)를 던지면 핸들러는 **아예 실행되지 않습니다.** 인증 같은 "공통 사전 검사"를 핸들러마다 복붙하지 않고 한 줄로 거는 방법.

#### 4) 헤더 인증 토큰 = "정식 백엔드만 들어오는 출입증"
- HTTP **헤더**는 요청에 따라오는 "메모지"들입니다. 여기서는 `X-Internal-Token` 메모지에 적힌 비밀 토큰을 검사합니다.
- 이 토큰이 환경변수 `ANALYTICS_INTERNAL_TOKEN` 의 값과 다르면 401(권한 없음). → 인터넷에서 누가 :8001 을 직접 찔러도 막힙니다(보안 설계의 "Analytics 내부 토큰").

#### 5) lifespan = "서버가 켜질 때 한 번 돌리는 시동 절차"
- 웹 서버가 **부팅되는 순간 딱 한 번** 해야 할 일(예: 스케줄러 켜기)을 적는 곳.
- `@asynccontextmanager` + `yield` 패턴: `yield` **위쪽** = 시동 시 실행, `yield` = "이제 서버가 손님을 받기 시작", `yield` **아래쪽**(있다면) = 종료 시 실행.

#### 6) 정적 파일 서빙(StaticFiles) = "미리 만들어 둔 파일을 그대로 내려주기"
- 계산 결과가 아니라 **이미 디스크에 저장된 HTML 파일**(QuantStats 리포트)을 그대로 브라우저에 내려주는 기능. `app.mount("/reports", StaticFiles(...))` 한 줄로 `/reports/어떤파일.html` 주소가 살아납니다.

#### 7) `HTTPException` = "FastAPI 식 에러 신호"
- `raise HTTPException(500, "메시지")` 를 던지면 FastAPI 가 **HTTP 상태코드 500 + 그 메시지**로 응답을 만들어 줍니다. 흔한 코드: 400(잘못된 요청), 401(인증실패), 404(없음), 422(검증실패), 500(서버 내부 오류).

---

## 🗺 전체 흐름도

```
  [백엔드 Spring Boot :8080]
        │  POST /backtest  (JSON 본문 + 헤더 X-Internal-Token: ******)
        ▼
  ┌─────────────────────────────────────────────────────────┐
  │  FastAPI app (main.py)                                   │
  │                                                         │
  │  ① 의존성: require_internal_token  ──토큰 불일치──▶ 401 즉시 거부 │
  │        │ 통과                                            │
  │  ② Pydantic: BacktestReq 로 JSON 검증 ──형식오류──▶ 422 자동 거부 │
  │        │ 통과 (req 객체 완성)                            │
  │  ③ 핸들러 backtest(req) 실행                            │
  │        │                                                │
  │        ├─ get_history(ticker)   ── data/yf_client       │
  │        ├─ run_backtest(...)     ── backtest/vbt_engine  │
  │        ├─ compute_metrics(...)  ── metrics/quantstats   │
  │        │                                                │
  │  ④ 결과를 dict 로 반환 → FastAPI 가 JSON 직렬화         │
  │        │ 도중 예외 발생 시 ──▶ HTTPException(500) 로 변환  │
  └────────┼────────────────────────────────────────────────┘
           ▼
   {"strategy":..., "stats":{...}, "risk_metrics":{...}}  → Spring → 프론트 차트
```

**3단 관문**을 기억하세요: ① 인증 → ② 형식검증 → ③ 핸들러 실행(모듈 호출). 거의 모든 엔드포인트가 이 똑같은 흐름을 탑니다.

---

## 📖 라인별 해설

### A. 파일 머리: docstring · import · 로깅 — `L1-L44`

```python
# L1-L9
"""
Alpha-Helix analytics FastAPI service.
Run: uvicorn app.main:app --port 8001 --reload
"""
from __future__ import annotations
import logging
import os
from contextlib import asynccontextmanager
from typing import Literal, Optional
```
- 맨 위 `"""..."""` 는 **실행 방법 메모**입니다. `uvicorn app.main:app` = "app/main.py 파일의 `app` 변수를 웹 서버로 띄워라". `--port 8001` 은 포트, `--reload` 는 코드가 바뀌면 자동 재시작(개발 편의).
- `asynccontextmanager` — 아래 `lifespan` 시동 절차를 만드는 도구.
- `Literal`(정해진 값 중 하나), `Optional`(있을 수도 없을 수도) — 타입 표기용.

```python
# L11-L13
from fastapi import FastAPI, HTTPException, Header, Depends
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field
```
- 이 한 묶음이 **이 파일의 도구 상자 전부**입니다. `FastAPI`(앱 본체), `HTTPException`(에러 던지기), `Header`(헤더 읽기), `Depends`(관문 걸기), `StaticFiles`(HTML 서빙), `BaseModel`/`Field`(주문서 양식).

```python
# L15-L41 (요약)
from app.config import INTERNAL_TOKEN, DEFAULT_UNIVERSE, REPORTS_DIR
from app.data.yf_client import get_history, get_latest_close
from app.data import polygon_client, fred_client, binance_client, market_db
from app.data.collector import (collect_us_ohlcv, collect_macro, collect_crypto_ohlcv,
    full_initial_load, start_scheduler as start_data_scheduler, US_SYMBOLS, CRYPTO_SYMBOLS, FRED_SERIES)
from app.backtest.vbt_engine import BacktestParams, run_backtest, latest_signal
from app.backtest.infinite_buying import (InfiniteBuyingParams, run_infinite_buying, latest_order_plan)
from app.metrics.quantstats_report import compute_metrics
from app.models.xgb_signal import train_model, predict_proba_up
from app.models.retrain_scheduler import start_scheduler, retrain_all
from app.explain.shap_explainer import explain_latest
from app.robust.walkforward import walk_forward
from app.robust.regime import per_regime_stats
from app.robust.trust_score import compute_trust_score
```
- 이 import 묶음이 곧 **"main.py 가 지휘하는 오케스트라 단원 명단"** 입니다. 각각 다른 교재가 다루는 함수들이고, main.py 는 이들을 **엔드포인트에 연결**할 뿐입니다:
  - `run_backtest`, `latest_signal` → [`01_backtest/vbt_engine.md`](../01_backtest/vbt_engine.md)
  - `run_infinite_buying`, `latest_order_plan` → [`01_backtest/infinite_buying.md`](../01_backtest/infinite_buying.md)
  - `train_model`, `predict_proba_up` → [`03_models/xgb_signal.md`](../03_models/xgb_signal.md)
  - `start_scheduler`(재학습), `retrain_all` → [`03_models/retrain_scheduler.md`](../03_models/retrain_scheduler.md)
  - `walk_forward` → [`04_robust/walkforward.md`](../04_robust/walkforward.md)
  - `per_regime_stats` → [`04_robust/regime.md`](../04_robust/regime.md)
  - `compute_trust_score` → [`04_robust/trust_score.md`](../04_robust/trust_score.md)
  - `explain_latest`(SHAP), `compute_metrics`(QuantStats) → [`05_explain_metrics/*`](../05_explain_metrics/)
  - `get_history`, `market_db`, `polygon_client` 등 → [`02_data/*`](../02_data/)

> ⚠️ 중복 import 주의: `L17·L18-L22` 와 `L23·L24-L28` 이 **완전히 동일한 두 줄을 두 번** 적고 있습니다(`polygon_client...market_db` / `collector` 묶음). 파이썬은 같은 모듈 재import 를 무해하게 무시하므로 동작엔 문제 없지만, **실수로 복붙된 죽은 코드**입니다(고도화에서 제거 대상).

```python
# L43-L44
logging.basicConfig(level=logging.INFO)
log = logging.getLogger(__name__)
```
- `log` = 이 파일 전용 로그 기록기. 핸들러들이 에러 시 `log.exception(...)` / `log.warning(...)` 으로 서버 콘솔에 흔적을 남깁니다(디버깅 핵심).

---

### B. 시동 절차 `lifespan` — `L47-L54`

```python
# L47-L54
@asynccontextmanager
async def lifespan(app: FastAPI):
    """스케줄러들 시작."""
    if os.getenv("DISABLE_RETRAIN_SCHEDULER", "0") != "1":
        start_scheduler()           # XGBoost 재학습
        start_data_scheduler()      # 시장 데이터 수집
        log.info("schedulers started via lifespan")
    yield
```
- **서버가 켜지는 순간 단 한 번** 실행됩니다. 두 개의 백그라운드 스케줄러를 켭니다:
  - `start_scheduler()` → 매일 22:30 KST **XGBoost 모델 자동 재학습**([retrain_scheduler](../03_models/retrain_scheduler.md)).
  - `start_data_scheduler()` → 시장 데이터 주기적 수집([collector](../02_data/)).
- **탈출구**: 환경변수 `DISABLE_RETRAIN_SCHEDULER=1` 이면 둘 다 끕니다. → 테스트·로컬에서 무거운 학습/수집이 자동으로 도는 걸 막는 스위치.
- `yield` = "여기서부터 서버가 손님을 받는다". 아래에 코드가 없으니 **종료 시 정리작업은 없음**.

> 💡 초보 포인트: `os.getenv("키", "0") != "1"` = "환경변수가 '1' 이 아니면(=기본 '0' 이면)" → **기본값은 스케줄러 ON**. 끄려면 명시적으로 `=1` 해야 함.

---

### C. 앱 생성 + 정적 마운트 — `L57-L60`

```python
# L57-L60
app = FastAPI(title="Alpha-Helix Analytics", version="0.2.0", lifespan=lifespan)

# QuantStats HTML tearsheet 정적 서빙: GET /reports/{file}.html (no auth — 공개 링크)
app.mount("/reports", StaticFiles(directory=str(REPORTS_DIR)), name="reports")
```
- `app = FastAPI(...)` — **웹 서버 본체 탄생**. 위에서 만든 `lifespan` 을 연결해 시동 절차를 등록.
- `app.mount("/reports", StaticFiles(directory=REPORTS_DIR))` — `reports/` 폴더(`config.py` 의 `REPORTS_DIR`)를 통째로 `/reports/...` 주소에 노출. → `/report/full` 이 만들어 둔 HTML 을 브라우저가 바로 열 수 있게 됨.
- ⚠️ **주석에 박힌 설계 결정**: 이 한 경로만 **인증이 없습니다(`no auth — 공개 링크`)**. 리포트 URL 을 이메일/링크로 공유하기 위해 일부러 연 것. 단, 파일명에 UUID(`uuid4().hex[:8]`)를 넣어 **추측 불가능**하게 만들었습니다(아래 `/report/full` 참고).

---

### D. 인증 관문 `require_internal_token` — `L64-L66`

```python
# L63-L66
# ---------- Auth ----------
def require_internal_token(x_internal_token: str = Header(default="")) -> None:
    if x_internal_token != INTERNAL_TOKEN:
        raise HTTPException(status_code=401, detail="invalid internal token")
```
- **이 파일에서 두 번째로 중요한 함수**(첫 번째는 lifespan). 거의 모든 엔드포인트가 `Depends` 로 이걸 거칩니다.
- `x_internal_token: str = Header(default="")` — FastAPI 가 자동으로 HTTP 헤더 `X-Internal-Token` 을 읽어 이 인자에 넣어줍니다(파이썬 `x_internal_token` 의 밑줄이 헤더의 하이픈 `X-Internal-Token` 에 자동 매핑). 헤더가 없으면 빈 문자열 `""`.
- 들어온 토큰이 `config.py` 의 `INTERNAL_TOKEN`(= 환경변수 `ANALYTICS_INTERNAL_TOKEN`)과 **다르면 즉시 401**. 같으면 `None` 반환(=통과).
- 반환값을 쓰지 않습니다(`-> None`). **부작용(통과시키거나 막거나)만**이 목적인 "문지기" 함수.

> ⚠️ 보안 함정: `config.py` 의 기본값은 `"dev-internal-token-change-me"` 입니다. 운영에서 환경변수를 안 바꾸면 이 뻔한 토큰으로 누구나 들어옵니다 → **prod 필수 변경**(CLAUDE.md 보안 설계의 "Analytics 내부 토큰").
> 💡 토큰 비교가 단순 `!=` 라 이론상 타이밍 공격에 약하지만, 내부망 토큰이라 실무 위험은 낮습니다(고도화에서 `hmac.compare_digest` 권장).

---

### E. 공통 요청 스키마들 — `L69-L102`

```python
# L70-L73
STRATEGY_LITERAL = Literal[
    "buy_and_hold", "sma_cross", "rsi_meanrev", "macd",
    "momentum_12_1", "vix_risk_off",
]
```
- 여러 요청 스키마가 공유하는 **"전략 이름 화이트리스트"**. vbt_engine 의 `StrategyType` 과 동일한 6개. 목록 밖 문자열이 오면 Pydantic 이 **422 로 자동 거부** → 핸들러가 안전.

```python
# L76-L93
class BacktestReq(BaseModel):
    ticker: str
    period: str = "5y"
    strategy: STRATEGY_LITERAL = "sma_cross"
    sma_fast: int = 20
    sma_slow: int = 60
    ... (rsi/macd/momentum/vix 파라미터) ...
    initial_capital: float = 10000.0
    fees: float = 0.0025   # 0.25% 기본값 (KIS 해외주식 실수수료)
    slippage: float = 0.001  # 0.10% 슬리피지
```
- `/backtest` 의 주문서. **`ticker` 만 필수**, 나머지는 전부 합리적 기본값. → 프론트에서 종목 하나만 넣어도 바로 백테스트 가능.
- 이 필드들은 vbt_engine 의 `BacktestParams` 와 **1:1 대응**합니다(핸들러가 그대로 복사). 기본 수수료 0.25%·슬리피지 0.1% 는 `config.py` 와 정합(KIS 해외주식 실수수료 기준).

```python
# L96-L101
class SignalReq(BaseModel):
    tickers: list[str] = Field(default_factory=lambda: list(DEFAULT_UNIVERSE))
    strategy: STRATEGY_LITERAL = "sma_cross"
    sma_fast: int = 20
    sma_slow: int = 60
    include_ml: bool = True
```
- `/signals/today` 의 주문서. `tickers` 는 **여러 종목 리스트**.
- `Field(default_factory=lambda: list(DEFAULT_UNIVERSE))` — 기본값으로 `config.py` 의 화이트리스트(약 28개 종목)를 통째로 복사. **`default=` 가 아니라 `default_factory=` 인 이유**: 리스트 같은 가변 객체를 기본값으로 쓰면 모든 요청이 같은 리스트를 공유해 버리는 파이썬 함정이 있어, **매 요청마다 새 리스트를 생성**하도록 함수(`lambda`)로 감쌌습니다.
- `include_ml=True` — XGBoost 확률·SHAP 설명을 함께 낼지 토글.

> 💡 이 파일에는 이 두 개 외에도 핸들러 바로 위에 흩어진 스키마가 더 있습니다: `TrainReq`(L218), `WalkForwardReq`(L233), `RegimeReq`(L252), `TrustReq`(L279), `InfiniteBuyingReq`(L317), `FullReportReq`(L375), `DataCollectReq`(L475), `FuturesBacktestReq`(L647), `LeanBacktestReq`(L729). 각 엔드포인트 해설에서 다룹니다.

---

### F. 엔드포인트 전체 매핑표 (한눈에)

| # | 메서드 · 경로 | 인증 | 입력 스키마/쿼리 | 호출 모듈 함수 | 반환 요지 |
|---|---|---|---|---|---|
| 1 | `GET /health` | ❌ | 없음 | (없음) | `{status, service, version}` |
| 2 | `POST /models/retrain` | ✅ | `?force=bool` | `retrain_all(force)` | 재학습 결과 |
| 3 | `GET /price/latest` | ✅ | `?ticker` | `get_latest_close` | `{ticker, close}` |
| 4 | `POST /backtest` | ✅ | `BacktestReq` | `run_backtest` + `compute_metrics` | stats·자산곡선·위험지표 |
| 5 | `POST /signals/today` | ✅ | `SignalReq` | `latest_signal`+`predict_proba_up`+`explain_latest` | 종목별 BUY/SELL/HOLD+ML |
| 6 | `POST /models/train` | ✅ | `TrainReq` | `train_model` | 학습 결과 |
| 7 | `POST /robust/walk-forward` | ✅ | `WalkForwardReq` | `walk_forward` | 워크포워드 검증 |
| 8 | `POST /regime` | ✅ | `RegimeReq` | `per_regime_stats` | 국면별 성과 |
| 9 | `POST /trust` | ✅ | `TrustReq` | `compute_trust_score` | Trust Score 0~100 |
| 10 | `POST /backtest/infinite-buying` | ✅ | `InfiniteBuyingReq` | `run_infinite_buying`+`compute_metrics` | 무한매수 백테스트 |
| 11 | `POST /orders/infinite-buying/plan` | ✅ | `InfiniteBuyingReq` | `latest_order_plan` | 오늘의 분할매수 주문안 |
| 12 | `POST /report/full` | ✅ | `FullReportReq` | `run_backtest`+`qs.reports.html` | HTML 리포트 URL |
| — | `GET /reports/{file}.html` | ❌ | (정적) | StaticFiles | HTML 파일 |
| 13 | `GET /data/status` | ✅ | 없음 | `market_db.get_collection_stats` 등 | 수집 현황 |
| 14 | `GET /data/ohlcv` | ✅ | `?symbol,tf,source,start,end,limit` | `market_db.query_ohlcv` (+실시간 fetch) | OHLCV 행 |
| 15 | `GET /data/macro` | ✅ | `?series,start,end` | `market_db.query_macro` (+FRED) | 매크로 시계열 |
| 16 | `GET /data/orderbook/{symbol}` | ✅ | path+`?depth` | `binance_client.get_orderbook` | 호가창 |
| 17 | `GET /data/ticker/{symbol}` | ✅ | path | `binance`/`polygon`/`yf` | 실시간 시세 |
| 18 | `GET /data/funding/{symbol}` | ✅ | path+`?limit` | `binance_client.get_funding_rate` | 펀딩레이트 |
| 19 | `POST /data/collect` | ✅ | `DataCollectReq` | `collect_*` (백그라운드 스레드) | `{status:collecting}` |
| 20 | `POST /data/collect/initial` | ✅ | 없음 | `full_initial_load` (백그라운드) | `{status:initial_load_started}` |
| 21 | `POST /futures/backtest` | ✅ | `FuturesBacktestReq` | `backtest_futures` | 선물 백테스트 |
| 22 | `GET /futures/signal` | ✅ | 쿼리 다수 | `get_futures_signal` | 1/-1/0 신호 |
| 23 | `GET /lean/strategies` | ✅ | 없음 | `list_available_strategies` | preset 목록 |
| 24 | `POST /lean/backtest` | ✅ | `LeanBacktestReq` | `run_lean_backtest` (동기) | Lean 결과 |
| 25 | `POST /lean/backtest/start` | ✅ | `LeanBacktestReq` | `run_lean_backtest` (백그라운드 잡) | `{job_id, running}` |
| 26 | `GET /lean/backtest/status/{job_id}` | ✅ | path+`?since` | `lean.jobs.get_job` | 진행 로그+결과 |
| 27 | `GET /lean/health` | ✅ | 없음 | `LeanExecutor.check_*` | Docker/CLI/이미지 준비상태 |

이제 핵심 핸들러들을 블록으로 풀어봅니다.

---

### G. 운영용 엔드포인트 — `L105-L122`

#### 1) `GET /health` — `L105-L107`
```python
# L105-L107
@app.get("/health")
def health():
    return {"status": "ok", "service": "alpha-helix-analytics", "version": "0.2.0"}
```
- **유일하게 인증 없는** 계산 엔드포인트(정적 `/reports` 제외). `dependencies` 가 없죠.
- 시스템 모니터링/로드밸런서가 "이 서버 살아있나?"를 물을 때 쓰는 가벼운 응답. 무거운 작업이 없어 인증을 빼도 안전.

#### 2) `POST /models/retrain` — `L110-L114`
```python
# L110-L114
@app.post("/models/retrain", dependencies=[Depends(require_internal_token)])
def trigger_retrain(force: bool = False):
    """XGBoost 모델 즉시 재학습 (관리자/운영자용). force=true면 오늘 이미 했어도 재실행."""
    result = retrain_all(force=force)
    return result
```
- 스케줄러의 22:30 자동 재학습을 **수동으로 당겨 실행**. `?force=true` 면 "오늘 이미 학습했어도 다시".
- `force` 가 Pydantic 본문이 아니라 **함수 인자**라서, FastAPI 가 이를 **쿼리 파라미터**(`?force=true`)로 해석합니다. → `retrain_scheduler.retrain_all` 호출.

#### 3) `GET /price/latest` — `L117-L122`
```python
# L117-L122
@app.get("/price/latest", dependencies=[Depends(require_internal_token)])
def price_latest(ticker: str):
    try:
        return {"ticker": ticker.upper(), "close": get_latest_close(ticker)}
    except Exception as e:
        raise HTTPException(400, str(e))
```
- 종목의 **최신 종가** 하나만 조회([yf_client](../02_data/)의 `get_latest_close`). `ticker` 는 쿼리(`?ticker=AAPL`).
- 실패 시 400(잘못된 종목 등). `.upper()` 로 소문자 입력도 표준화.

---

### H. ⭐ 핵심 핸들러: `POST /backtest` — `L125-L178`

이 엔드포인트가 **이 파일의 대표 패턴**입니다. 3단 관문 + 모듈 오케스트레이션의 전형.

```python
# L125-L139
@app.post("/backtest", dependencies=[Depends(require_internal_token)])
def backtest(req: BacktestReq):
    try:
        df = get_history(req.ticker, period=req.period)
        params = BacktestParams(
            strategy=req.strategy,
            sma_fast=req.sma_fast, sma_slow=req.sma_slow,
            ... (요청 필드를 BacktestParams 필드로 전부 복사) ...
            fees=req.fees, slippage=req.slippage,
        )
```
- **①** 인증·검증을 이미 통과한 `req`(올바른 타입 보장)를 받음.
- **②** `get_history(...)` 로 가격 데이터(DataFrame)를 가져옴([data 교재](../02_data/)).
- **③** 요청 스키마(`BacktestReq`)를 엔진 파라미터(`BacktestParams`, vbt_engine 의 dataclass)로 **번역**. → API 의 입력 계약과 엔진 내부 파라미터를 분리(느슨한 결합).

```python
# L141-L150
        vix_series = None
        if req.strategy == "vix_risk_off":
            try:
                vix_df = get_history("^VIX", period=req.period)
                vix_series = vix_df["Close"]
            except Exception as ve:
                raise HTTPException(400, f"VIX fetch failed: {ve}")

        result = run_backtest(df["Close"], params, vix=vix_series)
        result["ticker"] = req.ticker.upper()
```
- **vix_risk_off 전략만** 추가로 `^VIX`(공포지수) 시계열이 필요(vbt_engine 의 그 전략이 `vix` 인자를 요구). 다른 전략이면 `None`.
- **핵심 호출** `run_backtest(df["Close"], params, vix=...)` → [vbt_engine.md](../01_backtest/vbt_engine.md) 의 그 함수. 반환된 dict 에 `ticker` 를 덧붙임.

```python
# L153-L174
        # --- QuantStats overlay (Step 1: 전략수익률 + SPY 벤치마크) ---
        strat_returns = result.pop("_strategy_returns", None)
        if strat_returns is None:
            strat_returns = df["Close"].pct_change().dropna()   # fallback (사실상 도달 안 함)

        bench_returns = None
        if req.ticker.upper() != "SPY":
            try:
                spy = get_history("SPY", period=req.period)
                bench_returns = spy["Close"].pct_change().dropna()
                bench_returns = bench_returns.reindex(strat_returns.index).dropna()
                strat_returns = strat_returns.reindex(bench_returns.index).dropna()
            except Exception as be:
                log.warning("benchmark SPY fetch failed: %s", be)

        result["risk_metrics"] = compute_metrics(strat_returns, benchmark=bench_returns)
        result["buy_and_hold_metrics"] = compute_metrics(df["Close"].pct_change().dropna())
        return result
```
- `result.pop("_strategy_returns")` — vbt_engine 이 **JSON 으로 못 보내는 내부 객체**(일별 수익률 Series)를 끼워 보냈던 것([vbt_engine.md](../01_backtest/vbt_engine.md) F절 참고). 여기서 **꺼내(pop) JSON 응답에서 제거**하고 추가 지표 계산에만 씀.
- **SPY 벤치마크**: 종목이 SPY 가 아니면 SPY 를 받아 alpha/beta/정보비율 계산용 기준선으로. `reindex(...).dropna()` 로 **두 시계열의 공통 날짜만 정렬**(휴장일 차이 제거).
- `compute_metrics(...)` → [quantstats_report.md](../05_explain_metrics/) 로 Sharpe·VaR·alpha 등을 계산해 `risk_metrics` 에. `buy_and_hold_metrics` 는 "그냥 사서 들고 있었을 때"와 비교용.
- **에러 처리**(L176-L178): 어디서든 예외가 나면 `log.exception` 으로 스택트레이스를 남기고 500 반환.

> 💡 이 핸들러 하나가 **3개 모듈(yf_client·vbt_engine·quantstats)을 지휘**합니다. main.py 의 역할이 "계산이 아니라 조립"임을 보여주는 대표 사례.

---

### I. ⭐ `POST /signals/today` — `L181-L215` (3엔진 합성)

```python
# L181-L198
@app.post("/signals/today", dependencies=[Depends(require_internal_token)])
def signals_today(req: SignalReq):
    """
    For each ticker: rule-based signal + (optional) XGBoost probability + SHAP top contributors.
    Used by Spring Boot scheduler at 22:30 KST.
    """
    out = []
    params = BacktestParams(strategy=req.strategy, sma_fast=req.sma_fast, sma_slow=req.sma_slow)
    for t in req.tickers:
        item: dict = {"ticker": t.upper()}
        try:
            df = get_history(t, period="2y")
            sig = latest_signal(df["Close"], params)
            item.update(sig)
```
- **백엔드 DailySignalGenerator 가 22:30 에 부르는 핵심 엔드포인트**(docstring 명시). 여러 종목을 **한 번에** 처리.
- 종목마다 ① `latest_signal`([vbt_engine](../01_backtest/vbt_engine.md)) 로 규칙기반 BUY/SELL/HOLD 를 먼저 구함.

```python
# L199-L215
            if req.include_ml:
                proba = predict_proba_up(df, t)
                if proba:
                    item["ml_proba_up"] = proba["proba_up"]
                    expl = explain_latest(df, t, top_n=3)
                    if expl:
                        item["explanation"] = { ...predicted_direction / top_contributions / human_summary... }
                else:
                    item["ml_note"] = "모델 미학습 — POST /models/train 호출 필요"
        except Exception as e:
            item["error"] = str(e)
        out.append(item)
    return {"signals": out}
```
- `include_ml` 이면 **3엔진 합성**: ② `predict_proba_up`([xgb_signal](../03_models/xgb_signal.md))로 "내일 오를 확률" + ③ `explain_latest`([shap_explainer](../05_explain_metrics/))로 "왜 그 확률인지" 상위 3개 기여 피처.
- **모델이 없으면**(`proba` 가 None) 죽지 않고 `ml_note` 로 안내(CLAUDE.md: 합성 데이터 자동학습 경로 없음 → 데이터 부족 시 None).
- **에러 격리**: 한 종목이 실패해도 `item["error"]` 에 담고 **다음 종목 계속**(try 가 루프 안). → 한 종목 때문에 전체가 죽지 않음(견고한 배치 설계).

---

### J. 학습/검증 엔드포인트 — `L218-L313`

#### `POST /models/train` — `L218-L230`
```python
# L218-L230
class TrainReq(BaseModel):
    ticker: str
    period: str = "5y"

@app.post("/models/train", dependencies=[Depends(require_internal_token)])
def train(req: TrainReq):
    try:
        df = get_history(req.ticker, period=req.period)
        return train_model(df, req.ticker)
    except Exception as e:
        log.exception("train failed")
        raise HTTPException(500, str(e))
```
- 단일 종목 XGBoost 모델을 **명시적으로 학습**([xgb_signal](../03_models/xgb_signal.md)의 `train_model`). `/signals/today` 가 "모델 미학습"이라 할 때 호출하는 짝.

#### `POST /robust/walk-forward` — `L233-L249`
```python
# L233-L246
class WalkForwardReq(BaseModel):
    ticker: str
    period: str = "10y"
    strategy: STRATEGY_LITERAL = "sma_cross"
    train_window: int = 252      # 훈련 구간 (≈1년)
    test_window: int = 63        # 검증 구간 (≈3개월)

@app.post("/robust/walk-forward", dependencies=[Depends(require_internal_token)])
def walk_forward_endpoint(req: WalkForwardReq):
    try:
        df = get_history(req.ticker, period=req.period)
        params = BacktestParams(strategy=req.strategy)
        return walk_forward(df["Close"], params, req.train_window, req.test_window)
```
- 과적합 탐지용 워크포워드([walkforward.md](../04_robust/walkforward.md)). 기본 10년치를 252일 훈련 → 63일 검증 창으로 굴림. 얇은 래퍼(검증→데이터→모듈 호출).

#### `POST /regime` — `L252-L276`
```python
# L252-L273
class RegimeReq(BaseModel):
    ticker: str
    period: str = "5y"
    strategy: STRATEGY_LITERAL = "sma_cross"
    method: str = "rule"      # "rule" | "hmm"
    smoothing: int = 0        # 최소 연속구간 필터 (0=off, 권장 5)
    n_states: int = 4         # HMM 상태 수 (rule-based 에서는 무시)

@app.post("/regime", dependencies=[Depends(require_internal_token)])
def regime_endpoint(req: RegimeReq):
    try:
        df = get_history(req.ticker, period=req.period)
        params = BacktestParams(strategy=req.strategy)
        return per_regime_stats(df["Close"], params,
            method=req.method, smoothing=req.smoothing, n_states=req.n_states,
            ticker=req.ticker, period=req.period)
```
- 시장 국면별 성과 분해([regime.md](../04_robust/regime.md)). ⚠️ **기본 `method="rule"`** (빠름). 5-State HMM 은 `method="hmm"` 을 **명시 요청해야** 사용(CLAUDE.md 주의사항과 정합). `smoothing` 은 짧은 국면 노이즈 제거 필터.

#### `POST /trust` — `L279-L313`
```python
# L279-L292 (스키마)
class TrustReq(BaseModel):
    ticker: str
    period: str = "10y"
    strategy: STRATEGY_LITERAL = "sma_cross"
    mdd_target_pct: float | None = None   # None 이면 자산별 자동(etf 25 / 2x 50 / 3x 75 / single 35)
    weights: dict[str, float] | None = None   # Analyst Mode — 가중치 직접 조정
    overfit_penalty_max: int = 15
    wf_train: int = 252
    wf_test: int = 63
    asset_class: str = "auto"     # "auto" 시 ticker 로 자동 판별
    leverage: int | None = None
```
```python
# L295-L313 (핸들러)
@app.post("/trust", dependencies=[Depends(require_internal_token)])
def trust_endpoint(req: TrustReq):
    try:
        df = get_history(req.ticker, period=req.period)
        params = BacktestParams(strategy=req.strategy)
        return compute_trust_score(df["Close"], params,
            mdd_target_pct=req.mdd_target_pct, weights=req.weights,
            overfit_penalty_max=req.overfit_penalty_max,
            wf_train=req.wf_train, wf_test=req.wf_test,
            ticker=req.ticker, asset_class=req.asset_class, leverage=req.leverage)
```
- 종합 신뢰점수 0~100([trust_score.md](../04_robust/trust_score.md)). 가장 **손잡이가 많은** 요청 — Walk-Forward + Regime + 파라미터 섭동을 묶어 채점. `weights` 로 채점 가중치까지 사용자가 조정 가능("Analyst Mode"). `asset_class="auto"` 면 ticker 로 ETF/레버리지 종류를 자동 판별해 MDD 목표를 달리 잡음.
- **주의**: `mdd_target_pct: float | None` 처럼 Python 3.10+ 신문법(`X | None`)을 사용 — 이 서비스가 3.11 기준이라 가능.

---

### K. 무한매수법 — `L316-L371`

```python
# L317-L325 (스키마, 두 엔드포인트 공유)
class InfiniteBuyingReq(BaseModel):
    tickers: list[str] = Field(default_factory=lambda: ["TQQQ", "SOXL"])
    period: str = "5y"
    split: int = 40                  # 분할 횟수
    take_profit_pct: float = 10.0    # 익절 %
    loc_offset_pct: float = 15.0     # LOC 매수 호가 오프셋 %
    initial_capital: float = 300_000_000.0   # 3억원
    fees: float = 0.0025
    slippage: float = 0.001
```

#### `POST /backtest/infinite-buying` — `L328-L350`
```python
# L328-L347
@app.post("/backtest/infinite-buying", dependencies=[Depends(require_internal_token)])
def backtest_infinite_buying(req: InfiniteBuyingReq):
    try:
        closes: dict = {}
        for t in req.tickers:
            df = get_history(t, period=req.period)
            closes[t.upper()] = df["Close"]
        params = InfiniteBuyingParams(split=req.split, take_profit_pct=req.take_profit_pct,
            loc_offset_pct=req.loc_offset_pct, initial_capital=req.initial_capital,
            fees=req.fees, slippage=req.slippage)
        result = run_infinite_buying(closes, params)
        strat_returns = result.pop("_strategy_returns", None)
        if strat_returns is not None and len(strat_returns) > 1:
            result["risk_metrics"] = compute_metrics(strat_returns)
        return result
```
- 라오어식 분할매수 백테스트([infinite_buying.md](../01_backtest/infinite_buying.md)). 여러 종목의 종가를 dict(`{심볼: Series}`)로 모아 `run_infinite_buying` 에 전달.
- `/backtest` 와 같은 `_strategy_returns` pop → `compute_metrics` 패턴(여기선 벤치마크 없이).

#### `POST /orders/infinite-buying/plan` — `L353-L371`
```python
# L353-L368
@app.post("/orders/infinite-buying/plan", dependencies=[Depends(require_internal_token)])
def infinite_buying_plan(req: InfiniteBuyingReq):
    try:
        closes: dict = {}
        for t in req.tickers:
            df = get_history(t, period=req.period)
            closes[t.upper()] = df["Close"]
        params = InfiniteBuyingParams(...동일...)
        return latest_order_plan(closes, params)
```
- 백테스트가 아니라 **오늘 실제로 낼 분할매수 주문안**(`latest_order_plan`). → 백엔드가 OrderProposal 로 변환할 재료. 같은 스키마를 재사용.

---

### L. ⭐ `POST /report/full` — HTML 리포트 생성 — `L374-L468`

```python
# L375-L394 (스키마)
class FullReportReq(BaseModel):
    ticker: str
    ... (BacktestReq 와 거의 동일한 전략 파라미터 전부) ...
    benchmark: str = "SPY"
    title: Optional[str] = None
```
```python
# L397-L424
@app.post("/report/full", dependencies=[Depends(require_internal_token)])
def report_full(req: FullReportReq):
    import uuid
    import quantstats as qs   # 여기서 import — metrics 모듈이 matplotlib 백엔드를 먼저 설정하도록
    try:
        df = get_history(req.ticker, period=req.period)
        params = BacktestParams(...전략 파라미터 복사...)
        vix_series = None
        if req.strategy == "vix_risk_off":
            vix_series = get_history("^VIX", period=req.period)["Close"]
        result = run_backtest(df["Close"], params, vix=vix_series)
        strat_returns = result.pop("_strategy_returns", None)
        if strat_returns is None or strat_returns.empty:
            raise HTTPException(400, "전략 수익률 생성 실패")
```
- `/backtest` 와 동일하게 백테스트를 돌려 **전략 수익률 Series** 를 얻음.
- ⚠️ **함수 안에서 `import quantstats`**: 모듈 최상단이 아니라 핸들러 안에서 import 하는 의도적 선택(주석). `metrics` 모듈이 먼저 로드되며 matplotlib 백엔드(`Agg`, 화면 없는 서버용)를 설정한 뒤에야 quantstats 를 들이기 위함. → **import 순서로 인한 GUI 백엔드 충돌 회피**.

```python
# L429-L463
        bench_returns = None
        if req.benchmark and req.benchmark.upper() != req.ticker.upper():
            try:
                bench_df = get_history(req.benchmark, period=req.period)
                bench_returns = bench_df["Close"].pct_change().dropna()
                common = strat_returns.index.intersection(bench_returns.index)
                strat_returns = strat_returns.reindex(common)
                bench_returns = bench_returns.reindex(common)
            except Exception as be:
                log.warning("benchmark fetch failed: %s", be); bench_returns = None

        fname = f"{req.ticker.upper()}_{req.strategy}_{uuid.uuid4().hex[:8]}.html"
        out_path = REPORTS_DIR / fname
        title = req.title or f"{req.ticker.upper()} · {req.strategy}"

        qs.reports.html(strat_returns,
            benchmark=bench_returns if bench_returns is not None else None,
            output=str(out_path), title=title)

        return {"ticker": ..., "strategy": ...,
            "report_url": f"/reports/{fname}", "filename": fname,
            "benchmark": ..., "summary_stats": result["stats"]}
```
- **벤치마크 정렬**: `index.intersection` 으로 공통 날짜만(앞선 `/backtest` 의 `reindex().dropna()` 와 같은 목적, 다른 표현).
- **파일명 = `티커_전략_랜덤8자`**: `uuid4().hex[:8]` 로 **추측 불가 + 충돌 방지**. → 무인증 `/reports` 경로의 보안을 파일명 무작위성으로 보강.
- `qs.reports.html(...)` 가 디스크에 HTML 을 쓰고, 핸들러는 **그 URL(`/reports/파일명`)만** 돌려줌. 실제 파일은 D절의 정적 마운트로 서빙됨. → **"계산은 POST 로, 결과 열람은 GET 정적으로"** 분리.
- `except HTTPException: raise`(L464) — 위에서 던진 400("전략 수익률 생성 실패")을 500 으로 잘못 덮지 않도록 **먼저 다시 던짐**(미묘하지만 중요한 패턴).

---

### M. 시장 데이터 API `/data/*` — `L471-L640`

이 묶음은 백테스트가 아니라 **재료(시세) 조회/수집**입니다. 공통 패턴: **DB 우선 조회 → 없으면 외부 소스 실시간 fetch → DB 저장 → 반환**.

#### `GET /data/status` — `L480-L492`
```python
# L480-L492
@app.get("/data/status", dependencies=[Depends(require_internal_token)])
def data_status():
    stats = market_db.get_collection_stats()
    return {"polygon_available": polygon_client.available(),
        "fred_available": fred_client.available(),
        "binance_ping": binance_client.ping(),
        "collection_stats": stats,
        "us_symbols": US_SYMBOLS, "crypto_symbols": CRYPTO_SYMBOLS, "macro_series": FRED_SERIES}
```
- "데이터 파이프라인 건강 점검판": 각 소스 가용성 + DB 에 쌓인 행 통계 + 수집 대상 목록. 운영 대시보드용.

#### `GET /data/ohlcv` — `L495-L542` (DB→실시간 fetch 폴백의 대표)
```python
# L495-L506
@app.get("/data/ohlcv", dependencies=[Depends(require_internal_token)])
def data_ohlcv(symbol, tf="1d", source=None, start=None, end=None, limit=500):
    symbol = symbol.upper()
    df = market_db.query_ohlcv(symbol, tf=tf, source=source, start=start, end=end, limit=limit)
    if df.empty:
        is_crypto = symbol.endswith("USDT") or symbol.endswith("BTC")
        try:
            if is_crypto:        # Binance
                ...binance_client.get_klines_full(...)
            elif polygon_client.available():   # 미국 주식 Polygon
                ...polygon_client.get_daily_bars(...)
            else:                # 최후 폴백 yfinance
                from app.data.yf_client import get_history; ...
            if not df_fetch.empty:
                market_db.upsert_ohlcv(df_fetch, tf=tf)   # DB 저장(다음엔 캐시 히트)
                df = market_db.query_ohlcv(...)            # 다시 조회
        except Exception as e:
            log.warning("data/ohlcv realtime fetch failed %s: %s", symbol, e)
    if df.empty:
        raise HTTPException(404, f"No data for {symbol}")
    df["ts"] = df["ts"].astype(str)
    return {"symbol": symbol, "tf": tf, "rows": len(df), "data": df.to_dict("records")}
```
- **읽기-통과 캐시(read-through cache) 패턴**: ① DB 먼저 → ② 없으면 심볼 종류에 따라 Binance(크립토)/Polygon(미국주식)/yfinance(최후)에서 받아 → ③ **DB 에 저장**(`upsert_ohlcv`)하고 재조회. 한번 받으면 다음엔 빠름.
- `df["ts"].astype(str)` — datetime 을 문자열로 바꿔야 JSON 직렬화가 깨끗(타임스탬프 객체는 JSON 에 그대로 못 넣음).

#### `GET /data/macro` — `L545-L570`
```python
# L545-L569
@app.get("/data/macro", dependencies=[Depends(require_internal_token)])
def data_macro(series="T10Y2Y,VIXCLS,DGS10,DGS2", start=None, end=None):
    series_ids = [s.strip() for s in series.split(",")]
    df = market_db.query_macro(series_ids, start=start, end=end)
    if df.empty and fred_client.available():
        try:
            collect_macro(series_ids=series_ids, days_back=365 * 5)
            df = market_db.query_macro(series_ids, start=start, end=end)
        except Exception as e:
            log.warning("data/macro FRED fetch failed: %s", e)
    if df.empty:
        raise HTTPException(404, "No macro data")
    df.index = df.index.astype(str)
    return {"series": series_ids, "rows": len(df), "data": ...to_dict("records")}
```
- 거시지표(장단기 금리차 `T10Y2Y`, VIX `VIXCLS`, 국채 10년/2년)를 콤마로 받아 조회. DB 비면 FRED 에서 5년치 수집 후 재조회. ohlcv 와 같은 폴백 구조.

#### `GET /data/orderbook/{symbol}` · `/data/ticker/{symbol}` · `/data/funding/{symbol}` — `L573-L616`
```python
# L573-L580  호가창
@app.get("/data/orderbook/{symbol}", ...)
def data_orderbook(symbol, depth=20):
    return binance_client.get_orderbook(symbol.upper(), depth=depth)

# L583-L599  실시간 시세 (소스 자동 선택)
@app.get("/data/ticker/{symbol}", ...)
def data_ticker(symbol):
    is_crypto = symbol.endswith("USDT") or symbol.endswith("BTC")
    if is_crypto:   return binance_client.get_ticker_24h(symbol)
    elif polygon_client.available():  return polygon_client.get_latest_quote(symbol) or ...
    return {... yfinance fallback ...}

# L604-L616  펀딩레이트
@app.get("/data/funding/{symbol}", ...)
def data_funding(symbol, limit=100):
    df = binance_client.get_funding_rate(symbol.upper(), limit=limit)
    ...
```
- `{symbol}` 이 중괄호 = **경로 파라미터**(URL 의 일부, `/data/ticker/BTCUSDT`). 위의 쿼리 파라미터(`?symbol=`)와 다른 방식.
- `/data/ticker` 는 **심볼 모양으로 소스를 자동 결정**: `USDT/BTC` 로 끝나면 크립토(Binance), 아니면 Polygon, 둘 다 안 되면 yfinance. 펀딩레이트는 선물 과열 지표로 Binance 전용.

#### `POST /data/collect` · `/data/collect/initial` — `L619-L640` (백그라운드 스레드)
```python
# L619-L632
@app.post("/data/collect", dependencies=[Depends(require_internal_token)])
def data_collect(req: DataCollectReq):
    import threading
    def _run():
        symbols = req.symbols or None
        collect_us_ohlcv(symbols=symbols, days_back=req.days_back)
        collect_macro(days_back=req.days_back)
        collect_crypto_ohlcv(days_back=req.days_back)
    threading.Thread(target=_run, daemon=True).start()
    return {"status": "collecting", "symbols": req.symbols, "days_back": req.days_back}
```
- **즉시 반환 + 뒤에서 일하기**: 수집은 오래 걸리므로 `threading.Thread(...daemon=True).start()` 로 별도 스레드에 던지고, 호출자에겐 바로 `{status:collecting}`. → 요청이 타임아웃 안 남.
- `daemon=True` = 메인 서버가 꺼지면 이 작업 스레드도 같이 종료(좀비 방지).
- `/data/collect/initial`(L635-L640) 은 같은 패턴으로 `full_initial_load(5)` (5년치 전체 초기적재)를 백그라운드 실행.

> ⚠️ 함정: 이 백그라운드 스레드들은 **완료/실패를 호출자에게 알려주지 않습니다**(fire-and-forget). 결과 확인은 `/data/status` 로 따로 봐야 함. Lean 잡(`/lean/backtest/start`)이 `job_id` 로 진행을 추적하는 것과 대조됨(고도화에서 통일 가능).

---

### N. 선물 API `/futures/*` — `L643-L723`

```python
# L647-L663 (스키마)
class FuturesBacktestReq(BaseModel):
    symbol: str = "BTCUSDT"
    strategy: str = "sma_cross"     # ⚠️ STRATEGY_LITERAL 아님 — 자유 문자열
    leverage: int = 5
    fees: float = 0.0004            # 선물 수수료(현물 0.0025보다 낮음)
    ... (rsi_long/short, momentum_days, max_position_pct, stop_loss_pct, take_profit_pct) ...
    period: str = "1y"
```
```python
# L666-L696
@app.post("/futures/backtest", dependencies=[Depends(require_internal_token)])
def futures_backtest(req: FuturesBacktestReq):
    from app.backtest.futures_engine import FuturesParams, backtest_futures
    try:
        params = FuturesParams(
            symbol=req.symbol.upper(), strategy=req.strategy,
            leverage=max(1, min(req.leverage, 20)),   # 1~20배로 강제 클램프(안전)
            ... 나머지 필드 복사 ...)
        return backtest_futures(params)
```
- Binance 선물 백테스트([futures_engine](../01_backtest/) — `app/backtest/futures_engine.py`). **펀딩레이트·레버리지·손절/익절** 반영.
- ⚠️ **레버리지 클램프** `max(1, min(req.leverage, 20))`: 사용자가 100배를 넣어도 20배로 잘림 → 비현실적 청산 시나리오 방지(안전 게이트). 입력 검증을 핸들러 안에서 보강한 사례.
- ⚠️ 이 스키마의 `strategy` 는 `STRATEGY_LITERAL` 이 아니라 **자유 `str`** — 선물 엔진이 별도 전략 집합(롱/숏)을 갖기 때문. 검증은 `futures_engine` 내부 책임.
- **지연 import**(`from app.backtest.futures_engine import ...` 를 함수 안에서): futures_engine 이 무거운 의존성을 가질 때 서버 시동을 느리게 하지 않으려는 흔한 기법. Lean 핸들러들도 같은 패턴.

```python
# L699-L723
@app.get("/futures/signal", dependencies=[Depends(require_internal_token)])
def futures_signal(symbol="BTCUSDT", strategy="sma_cross", leverage=5, sma_fast=20, ...):
    from app.backtest.futures_engine import FuturesParams, get_futures_signal
    return get_futures_signal(FuturesParams(...))   # 1=롱, -1=숏, 0=중립
```
- 현재 시점 선물 신호. **GET + 쿼리 파라미터**(본문 없음). 1/-1/0 의 방향 신호.

---

### O. Lean 백테스트 API `/lean/*` — `L726-L880`

QuantConnect Lean(고급 백테스트 엔진, Docker 로 구동)과의 연동. **동기/비동기/상태폴링/헬스** 4종.

```python
# L729-L740 (스키마)
class LeanBacktestReq(BaseModel):
    strategy_id: str = Field(..., description="kis_backtest preset id")
    symbols: list[str] = Field(..., description="US: SPY, KRX: 005930")
    start_date: str = Field(..., description="YYYY-MM-DD")
    end_date: str = Field(..., description="YYYY-MM-DD")
    initial_capital: float = Field(default=100_000_000.0)   # 1억원
    market: Literal["us", "krx"] = Field(default="us")
    param_overrides: Optional[dict] = Field(default=None)
    commission_rate: float = Field(default=0.00015)
    tax_rate: float = Field(default=0.0)
    slippage: float = Field(default=0.0)
```
- `Field(..., description=...)` 의 `...`(Ellipsis) = **필수 필드 표시**(기본값 없음). description 은 Swagger 문서에 뜨는 설명.

#### `GET /lean/strategies` — `L743-L751`
```python
# L743-L751
@app.get("/lean/strategies", dependencies=[Depends(require_internal_token)])
def lean_list_strategies():
    from app.lean.runner import list_available_strategies
    return {"strategies": list_available_strategies()}
```
- 등록된 Lean preset 전략 + 파라미터 정의 목록. 프론트의 전략 선택 드롭다운 재료.

#### `POST /lean/backtest` (동기) — `L754-L792`
```python
# L754-L792
@app.post("/lean/backtest", dependencies=[Depends(require_internal_token)])
def lean_backtest(req: LeanBacktestReq):
    from app.lean.runner import run_lean_backtest, LeanBacktestRequest
    request = LeanBacktestRequest(strategy_id=req.strategy_id, symbols=req.symbols, ...)
    result = run_lean_backtest(request)
    if not result.success:
        raise HTTPException(status_code=422, detail=result.error or "lean backtest failed")
    return {"success": True, "run_id": result.run_id, "statistics": result.statistics,
            "equity_curve": result.equity_curve, "trades_count": ..., "elapsed_seconds": ...}
```
- **요청이 끝날 때까지 기다리는 동기 호출**. docstring 경고: Docker 필요, 첫 실행은 이미지 풀로 ~20분, US 시장만. → 이렇게 느린 작업이라 비동기 버전(`/start`)이 별도로 존재.
- 실패는 **422**(처리 불가)로. `result.success` 가 엔진 차원의 성패를 따로 들고 옴(예외 vs 비즈니스 실패 구분).

#### `POST /lean/backtest/start` (비동기 잡) — `L795-L849`
```python
# L795-L849 (핵심)
@app.post("/lean/backtest/start", dependencies=[Depends(require_internal_token)])
def lean_backtest_start(req: LeanBacktestReq):
    import threading
    from app.lean.jobs import create_job
    from app.lean.runner import run_lean_backtest, LeanBacktestRequest
    job = create_job()
    def _cb(level, msg):                      # 진행 콜백 → 잡에 로그 누적
        if level == "phase":  job.set_phase(msg)
        elif level == "lean": job.log("info", f"[lean] {msg}")
        else:                 job.log(level, msg)
    def _run():
        try:
            request = LeanBacktestRequest(...)
            result = run_lean_backtest(request, progress_cb=_cb)   # 콜백 전달
            if not result.success:
                job.log("error", ...); job.finish_err(...); return
            job.finish_ok({...statistics, equity_curve, ...})
        except Exception as e:
            log.exception(...); job.log("error", str(e)); job.finish_err(str(e))
    threading.Thread(target=_run, name=f"lean-job-{job.job_id}", daemon=True).start()
    return {"job_id": job.job_id, "status": "running"}
```
- **잡 큐 패턴(제대로 된 비동기)**: ① `create_job()` 으로 잡 생성 → ② 백그라운드 스레드에서 Lean 실행하며 ③ `progress_cb=_cb` 콜백으로 **단계·로그를 잡에 실시간 누적** → ④ 호출자에겐 `job_id` 즉시 반환.
- `/data/collect` 의 fire-and-forget 과 달리 **진행 추적 가능**(아래 status 로 폴링). 단계(phase)/Lean stdout/일반 로그를 구분해 기록.

#### `GET /lean/backtest/status/{job_id}` — `L852-L859`
```python
# L852-L859
@app.get("/lean/backtest/status/{job_id}", dependencies=[Depends(require_internal_token)])
def lean_backtest_status(job_id: str, since: int = 0):
    from app.lean.jobs import get_job
    job = get_job(job_id)
    if job is None:
        raise HTTPException(404, f"job not found: {job_id}")
    return job.snapshot(since=since)
```
- 프론트가 이 경로를 **주기적으로 폴링**해 진행 로그를 받아 화면에 흘림. `since` = "이 줄 번호 이후의 새 로그만 줘"(증분 폴링 — 매번 전체 로그를 다시 안 받게).

#### `GET /lean/health` — `L862-L880`
```python
# L862-L880
@app.get("/lean/health", dependencies=[Depends(require_internal_token)])
def lean_health():
    try:
        import app.lean
        from kis_backtest.lean.executor import LeanExecutor, LEAN_IMAGE
    except Exception as e:
        return {"ready": False, "docker": False, "lean_cli": False, "image": False,
                "error": f"lean executor import 실패: {e}"}
    docker = LeanExecutor.check_docker()
    lean_cli = LeanExecutor.check_lean_cli()
    image = LeanExecutor.check_image() if docker else False   # docker 죽었으면 이미지 조회 스킵
    return {"ready": bool(docker and lean_cli and image),
            "docker": docker, "lean_cli": lean_cli, "image": image, "image_name": LEAN_IMAGE}
```
- Lean 실행 **환경 3종 점검**: Docker 데몬·lean CLI·도커 이미지. 셋 다 OK 여야 `ready: true`.
- import 자체가 실패해도(벤더링된 kis_backtest 가 없을 때 등) **죽지 않고** `ready:false` + 에러 메시지를 돌려줌(견고). `docker` 가 죽었으면 이미지 조회를 스킵(`if docker else False`)해 불필요한 대기 방지.

---

## ⚠️ 함정·버그 주의 (코드에 박힌 교훈 모음)

1. **중복 import**(L17-L28) — `polygon_client...market_db` 와 `collector` 묶음이 **두 번** 적혀 있음. 동작엔 무해하나 죽은 코드. 정리 대상.

2. **Jackson JsonNode 직렬화 이슈(백엔드 쪽 연계)** — main.py 가 돌려주는 JSON 은 깨끗하지만, **받는 쪽 Spring Boot 4(=Jackson3 기본)** 에서 일부 analytics 응답을 bean 속성으로 잘못 매핑하는 버그가 메모리에 기록됨([project_springboot4_jackson_jsonnode_bug]). 응답 구조를 바꿀 때 백엔드 역직렬화도 함께 확인해야 함. (Analytics 자체 버그는 아니지만 API 계약 변경 시 동반 점검 필수.)

3. **`_strategy_returns` pop 누락 주의** — vbt_engine/infinite_buying 이 끼워 보내는 내부 Series 는 **JSON 직렬화 불가**. `/backtest`·`/report/full`·`/backtest/infinite-buying` 에서 반드시 `result.pop("_strategy_returns")` 로 빼야 함. 안 빼면 응답 직렬화가 깨짐.

4. **무인증 정적 `/reports`** — `app.mount("/reports", ...)` 는 인증이 없음(의도적 공개 링크). 보안은 **UUID 파일명**(`uuid4().hex[:8]`)의 추측 불가능성에만 의존. 민감 리포트라면 약함 → 서명 토큰 추가 고려.

5. **내부 토큰 기본값** — `config.py` 의 `INTERNAL_TOKEN` 기본값 `"dev-internal-token-change-me"`. 운영에서 `ANALYTICS_INTERNAL_TOKEN` 미설정 시 누구나 통과. **prod 필수 변경**.

6. **CB(서킷브레이커) 폴백은 백엔드 쪽** — 이 서비스가 죽거나 느리면, 호출자 Spring 의 `AnalyticsClient`(Resilience4j CB+Retry)가 빠르게 폴백함(CLAUDE.md). 즉 **main.py 자체엔 CB 가 없고**, 견고성은 호출자가 책임. main.py 는 대신 try/except + `HTTPException(500)` 로 깔끔한 에러를 돌려줄 의무가 있음.

7. **백그라운드 스레드의 무응답성** — `/data/collect`·`/collect/initial` 은 fire-and-forget(완료/실패 통지 없음). 결과는 `/data/status` 로 별도 확인. Lean 잡과 달리 추적 불가.

8. **선물 `strategy` 는 자유 문자열** — `FuturesBacktestReq.strategy` 는 `STRATEGY_LITERAL` 검증을 안 받음. 잘못된 전략명은 핸들러가 아니라 `futures_engine` 깊은 곳에서 터질 수 있음.

9. **GUI 백엔드 충돌** — `/report/full` 이 quantstats 를 **함수 안에서** import 하는 건 matplotlib 백엔드 순서 때문. 이를 모듈 최상단으로 옮기면 서버 환경에서 그림 생성이 깨질 수 있음(건드리지 말 것).

---

## 🚀 고도화 아이디어 (강의·개선 버전용)

- **라우터 분리(APIRouter)**: 882줄 한 파일을 `routers/backtest.py`, `routers/data.py`, `routers/lean.py` 등으로 쪼개고 `app.include_router(...)` 로 합치면 유지보수성↑. 도메인별 파일 = CLAUDE.md 의 도메인 드리븐 정신과 일치.
- **비동기 핸들러(`async def`) + I/O 오프로딩**: 지금은 `def`(동기) — 무거운 백테스트가 이벤트 루프를 막을 수 있음. CPU 작업은 `run_in_executor`/`ProcessPool` 로, 외부 HTTP 는 `httpx.AsyncClient` 로 비동기화하면 동시 처리량↑.
- **캐싱 레이어**: 같은 (ticker, period, strategy) 백테스트 요청이 반복되면 결과를 TTL 캐시(Redis/in-memory)로 → 응답 즉시. `config.py` 에 이미 `PRICE_CACHE_TTL_MIN` 이 있어 확장 자연스러움.
- **잡 시스템 통일**: `/data/collect` 의 fire-and-forget 도 Lean 의 `jobs` 패턴(job_id+status)으로 통일해 모든 비동기 작업을 추적 가능하게.
- **응답 모델 명시(`response_model=`)**: 지금은 dict 를 반환 → Swagger 문서에 응답 스키마가 안 뜸. Pydantic 응답 모델을 달면 자동 문서화 + 출력 검증 + 백엔드 계약 안정화(Jackson 이슈 예방에도 도움).
- **요청 검증 강화**: `period`(자유 문자열), 선물 `strategy`(자유 str)에 `Literal`/정규식 검증을 더해 422 를 더 일찍.
- **레이트리밋·관측성**: 무거운 엔드포인트(`/lean/backtest`, `/report/full`)에 동시성 제한 + 요청별 trace_id 로깅을 더하면 운영 가시성↑.

---

## 📚 용어 사전 (이 파일 한정)

| 용어 | 뜻 |
|---|---|
| FastAPI | 파이썬 웹 API 프레임워크. 함수에 `@app.get/post` 를 붙여 엔드포인트로 만듦 |
| 엔드포인트(Endpoint) | "메서드 + URL 경로 + 처리 함수"의 한 세트(예: `POST /backtest`) |
| 핸들러(Handler) | 한 엔드포인트의 요청을 실제 처리하는 함수 |
| 데코레이터 | 함수 위 `@...` 표시. 함수에 추가 기능/꼬리표를 붙임 |
| Pydantic `BaseModel` | 요청 JSON 의 모양을 정의·검증하는 "주문서 양식" |
| `Field(...)` / `default_factory` | 필드 메타 지정. `...`=필수, `default_factory`=가변기본값을 매번 새로 생성 |
| `Depends` / 의존성 주입 | 핸들러 실행 전 거치는 공통 관문(여기선 인증)을 거는 방식 |
| `Header(...)` | HTTP 헤더 값을 함수 인자로 읽어오는 FastAPI 도구 |
| `HTTPException(코드, 메시지)` | FastAPI 식 에러 응답 생성(400/401/404/422/500 등) |
| lifespan | 서버 기동/종료 시 한 번 실행되는 절차(여기선 스케줄러 시작) |
| StaticFiles / mount | 디스크의 파일(HTML 리포트)을 URL 경로에 그대로 노출 |
| 경로 파라미터 vs 쿼리 파라미터 | `/x/{symbol}`(경로) vs `/x?symbol=`(쿼리). 둘 다 입력 전달 방식 |
| `result.pop("_strategy_returns")` | JSON 직렬화 불가한 내부 Series 를 응답에서 빼내 지표계산에만 쓰는 관용구 |
| read-through 캐시 | DB 먼저 보고 없으면 외부에서 받아 DB 에 저장 후 반환(`/data/ohlcv`) |
| fire-and-forget | 백그라운드 스레드로 던지고 완료를 안 기다림(`/data/collect`) |
| 잡 큐(job) 패턴 | `job_id` 발급 → 백그라운드 실행 → status 폴링으로 추적(`/lean/*`) |
| 지연 import | 함수 안에서 `import` — 시동 속도/GUI 백엔드 순서 문제 회피 |
| 클램프(clamp) | `max(1, min(x, 20))` 처럼 값을 안전 범위로 강제(레버리지 1~20배) |
