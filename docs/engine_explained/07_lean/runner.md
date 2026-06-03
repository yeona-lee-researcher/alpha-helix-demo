# `lean/runner.py` — Lean 백테스트 작업반장 (완전 라인별 해설)

> 원본: `analytics/app/lean/runner.py` (241줄)
> 이 문서는 **교재 표준 형식**(`01_backtest/vbt_engine.md`)을 그대로 따릅니다.
> 함께 읽으면 좋은 파일: `kis_backtest/lean/executor.py`(도커 실행), `project_manager.py`(워크스페이스), `data_converter.py`(CSV), `result_formatter.py`(결과 변환), `app/lean/jobs.py`(비동기 잡), `app/main.py`(엔드포인트).

---

## 📌 이 파일 한눈에

`vbt_engine.py` 가 "우리 손으로 직접 짠 빠른 백테스트 엔진"이라면, 이 파일은 **"바깥 회사(QuantConnect)의 진짜 백테스트 엔진(Lean)에게 일을 맡기는 작업반장"** 입니다.

작업반장이 하는 일은 직접 계산이 아니라 **준비·전달·수거**입니다:

1. (재료 준비) 우리 데이터 창고(yfinance/Polygon)에서 가격 데이터를 가져와
2. (작업장 세팅) Lean 이 읽을 수 있는 폴더 구조 + CSV + 알고리즘 코드(`main.py`)를 만들고
3. (외주 발주) **도커 컨테이너 안의 Lean 엔진**을 `lean backtest` CLI 로 돌리고
4. (납품 검수) 컨테이너가 토해낸 결과 JSON 을 파싱해 우리 형식으로 정리해 돌려줌

> 비유: 이 파일은 **인테리어 현장소장**입니다. 직접 망치질(=수익률 계산)은 안 합니다. 자재를 주문하고(데이터 fetch), 도면을 그리고(코드 생성), 시공팀(도커 속 Lean)을 부르고, 완공 후 검수서(결과 JSON)를 사장(Spring 백엔드)에게 보고합니다.

핵심 구성요소는 **데이터 클래스 2개 + 함수 3개** 입니다.

| 이름 | 종류 | 한 줄 역할 | 비유 |
|---|---|---|---|
| `LeanBacktestRequest` | dataclass | "이런 조건으로 백테스트 해줘"라는 **주문서** | 공사 의뢰서 |
| `LeanBacktestResult` | dataclass | 백테스트 결과를 담는 **납품서**(성공여부·통계·자산곡선·에러) | 준공 검수서 |
| `_fetch_ohlcv(...)` | 내부 함수 | 한 종목의 OHLCV(시·고·저·종·거래량)를 우리 fetcher 로 가져옴 | 자재 주문 |
| `run_lean_backtest(...)` | 메인 함수 | 위 7단계 전 과정을 지휘하는 **본체** | 현장소장 본인 |
| `list_available_strategies()` | 함수 | 쓸 수 있는 preset 전략 목록 반환 | 시공 가능한 메뉴판 |

**누가 호출하나?** → `app/main.py` 의 Lean 엔드포인트들:

| 엔드포인트 | 부르는 것 | 방식 |
|---|---|---|
| `GET /lean/strategies` | `list_available_strategies()` | 동기 |
| `POST /lean/backtest` | `run_lean_backtest(req)` | **동기**(끝까지 기다림) |
| `POST /lean/backtest/start` | `run_lean_backtest(req, progress_cb=_cb)` | **비동기**(백그라운드 스레드 + 잡 폴링) |
| `GET /lean/backtest/status/{job_id}` | `app/lean/jobs.get_job(...)` | 진행 로그 폴링 |
| `GET /lean/health` | `LeanExecutor.check_*` | 환경 점검 |

즉 Spring 백엔드 → `/lean/backtest`(또는 `/start`) → 이 파일 → 도커 Lean → 결과 → Spring 으로 거슬러 올라갑니다.

**왜 우리 vbt_engine 두고 Lean 을 또 쓰나?** → Lean 은 QuantConnect 의 **산업용 백테스트 엔진**입니다. 정교한 수수료/세금/체결 모델, 분단위 데이터, 실거래 연동까지 지원합니다. vbt_engine 은 "빠르고 가벼운 자체 엔진", Lean 은 "무겁지만 정밀한 외부 엔진" — **둘을 병행**합니다(`main.py` 주석: "vectorbt 와 병행").

---

## 🧠 사전 지식 (이거 모르면 막힘)

#### 1) Lean / QuantConnect CLI 란?
- **Lean** = QuantConnect 가 만든 오픈소스 백테스트·실거래 엔진(C# 코어). 우리는 그 **CLI 명령어 `lean backtest`** 를 통해 부립니다.
- `lean backtest <프로젝트경로>` 를 실행하면, CLI 가 내부적으로 **도커 이미지 `quantconnect/lean:latest`** 를 띄워 그 안에서 우리 알고리즘을 돌립니다. → **도커가 호스트에 깔려 있어야** 동작합니다.
- 우리가 만들 알고리즘은 Lean 규약대로 작성된 **`main.py`**(파이썬). 이 파일을 코드제너레이터가 자동으로 써줍니다.

#### 2) 도커 컨테이너(Docker container) — "일회용 미니 컴퓨터"
- 컨테이너 = 격리된 작은 가상 컴퓨터. Lean 엔진은 이 안에서 돌며, 호스트의 특정 폴더(데이터·프로젝트)를 마운트해서 읽고, 결과를 그 폴더에 씁니다.
- 우리 코드는 도커를 **직접 다루지 않습니다**. `lean` CLI 가 도커를 대신 부려줍니다. 우리는 그저 `subprocess` 로 `lean` 명령을 실행할 뿐.

#### 3) `lean.json` 우회(로그인 회피) — 왜 중요한가
- 정석은 `lean init` 으로 워크스페이스를 만드는 것인데, 이건 **QuantConnect 계정 로그인(user-id + API 토큰)을 인터랙티브로 요구**합니다. 자동화 환경에서 막힙니다.
- 그래서 `LeanProjectManager.init_workspace()` 가 `lean.json` 을 **직접 손으로 써넣습니다**. 그 안에 **더미 organization-id(`"0"*32`)** 만 넣으면, lean CLI 가 "옛날 폴더 아님"으로 인정하고 **로그인 없이 로컬 백테스트**를 돌립니다. (메모리: "Lean CLI 운영 사실 — 로그인 회피(더미 org-id)".)

#### 4) 잡(Job) + 폴링(Polling) — 비동기 진행 추적
- Lean 백테스트는 **오래 걸립니다**(도커 부팅 포함, 첫 실행은 이미지 풀로 ~20분). HTTP 요청 하나로 끝까지 기다리면 타임아웃·끊김 위험.
- 그래서 `/lean/backtest/start` 는 **백그라운드 스레드**로 돌리고 `job_id` 를 즉시 돌려줍니다. 프론트는 `/status/{job_id}` 를 **반복 호출(폴링)** 하며 진행 로그를 조금씩(증분) 받아 화면에 보여줍니다.
- `run_lean_backtest` 의 `progress_cb`(진행 콜백)가 이 잡에 로그를 흘려넣는 통로입니다.

#### 5) stdout 스트리밍 — "진행 상황 실시간 중계"
- Lean CLI 는 실행 중 진행 상황을 **표준출력(stdout)** 으로 한 줄씩 뱉습니다("20% 완료…" 같은). `executor.py` 가 이걸 **리더 스레드**로 한 줄씩 읽어 `on_line` 콜백으로 전달 → runner 의 `progress_cb("lean", line)` → 잡 로그 → 프론트.
- 이게 끊기면 진행률이 안 보일 뿐 아니라 **컨테이너가 멈출 수 있습니다**(아래 함정 참고).

#### 6) `dataclass` = "필드 묶음 상자"
- `@dataclass` 를 붙이면 `__init__` 등을 자동 생성. `LeanBacktestRequest(strategy_id="...", symbols=[...])` 처럼 **이름으로 값을 채워 만드는 설정 상자**가 됩니다. (vbt_engine 의 `BacktestParams` 와 같은 패턴.)

#### 7) OHLCV 란
- **O**pen(시가)·**H**igh(고가)·**L**ow(저가)·**C**lose(종가)·**V**olume(거래량). 하루치 봉(bar) 하나를 이루는 5개 숫자. 백테스트의 원재료.

#### 8) lazy import(지연 임포트) = "필요할 때만 짐 풀기"
- 보통은 파일 맨 위에서 `import` 합니다. 그런데 `kis_backtest` 는 **무겁고**(모든 전략 자동 등록), 게다가 `sys.path` 조작이 필요합니다. 그래서 **함수 안에서, 요청이 들어온 그 순간에만** import 합니다. → 서버 부팅이 빨라지고, Lean 안 쓰는 경로는 이 무거운 짐을 안 짊.

---

## 🗺 전체 흐름도

```
[Spring 백엔드]
     │  POST /lean/backtest  (또는 /start)
     ▼
[main.py: lean_backtest()]  LeanBacktestReq → LeanBacktestRequest 로 복사
     │
     ▼
┌─────────────────────────── run_lean_backtest(req, progress_cb) ───────────────────────────┐
│                                                                                            │
│  run_id 생성 ("sma_crossover-1a2b3c4d")                                                     │
│        │                                                                                   │
│  [lazy import] app.lean(sys.path 주입) → kis_backtest.* 절대 import                         │
│        │   (⚠ app.lean.kis_backtest.* 와 섞어 쓰면 레지스트리가 두 벌 → preset 조회 실패)     │
│        ▼                                                                                    │
│  1. StrategyRegistry.build[_with_params](strategy_id)  → definition (전략 명세)             │
│        │                                                                                   │
│  2. _fetch_ohlcv(sym) ──▶ app.data.yf_client.get_history ──▶ DataFrame(date,o,h,l,c,v)      │
│        │   (각 심볼마다 반복, data_dict[sym] = df)                                          │
│        ▼                                                                                    │
│  3. LeanProjectManager.create_project(...) → project (워크스페이스 폴더 스캐폴드)            │
│        │   (.lean-workspace/ 에 lean.json·data·projects/<run_id> 생성)                      │
│        ▼                                                                                    │
│  4. DataConverter.export(data_dict, project.data_dir) → 종목별 CSV (YYYYMMDD,o,h,l,c,v)      │
│        ▼                                                                                    │
│  5. from_definition → schema → LeanCodeGenerator.generate(...) → main.py 텍스트              │
│        │   project.project_dir/main.py 에 utf-8 로 기록                                     │
│        ▼                                                                                    │
│  6. LeanExecutor.run(project, on_line=lambda l: _emit("lean", l))                           │
│        │   subprocess.Popen([lean, backtest, ...]) + 리더 스레드로 stdout 스트리밍           │
│        │   ↳ 도커 속 Lean 엔진이 실제 백테스트 수행 → result/<...>.json 기록                  │
│        ▼                                                                                    │
│  7. ResultFormatter.to_api_response(lean_run, ...) → {"result": {...}} 중첩 dict             │
│        │   stats / equity_curve / trades 추출                                               │
│        ▼                                                                                    │
│  LeanBacktestResult(success=True, statistics, equity_curve, trades_count, ...) 반환          │
│        (예외 발생 시 success=False + error 메시지로 감싸 반환 — 절대 raise 로 안 터뜨림)      │
└────────────────────────────────────────────────────────────────────────────────────────────┘
     │
     ▼
[main.py] → JSON 응답 → Spring → 프론트 차트
```

진행 콜백(`progress_cb`)이 매 단계 `_emit("phase", ...)` 로 잡 로그를 채우고, 6단계의 `on_line` 이 lean stdout 을 `_emit("lean", ...)` 로 실시간 중계합니다.

---

## 📖 라인별 해설

### A. 파일 설명서(docstring) — `L1-L13`

```python
# L1-L13
"""LeanBacktestRunner — analytics 사이드카에서 Lean 백테스트를 실행하는 진입점.

흐름:
    1. Spring → POST /lean/backtest 호출 → BacktestRequest 받음
    2. 우리 yf_client (Polygon/yfinance) 로 OHLCV 데이터 fetch
    3. kis_backtest.DataConverter 로 KIS-style CSV 작성 → Lean 워크스페이스
    4. kis_backtest.StrategyRegistry + LeanCodeGenerator 로 main.py 코드 생성
    5. kis_backtest.LeanExecutor.run() 으로 Docker 실행
    6. 결과 JSON 파싱해서 응답

KIS 인증을 사용하지 않음 — 데이터는 우리 기존 yf/Polygon fetcher 로 공급.
KIS 데이터가 필요한 시점에 credentials.py + kis_backtest.providers.kis 활성화.
"""
```
- 이 파일의 **목차이자 약속**입니다. 6단계 흐름(아래 `run_lean_backtest` 의 주석 번호와 1:1 대응)이 적혀 있어, 코드를 읽기 전에 "무슨 순서로 일하는지" 먼저 잡고 갈 수 있습니다.
- **"KIS 인증을 사용하지 않음"** 이 중요한 설계 결정입니다. 원래 `kis_backtest` 라이브러리는 한국투자증권(KIS) API 로 데이터를 받게 돼 있지만, 우리는 그 인증 단계를 **건너뛰고** 우리 기존 데이터 수집기(yfinance/Polygon)로 가격을 공급합니다. → 사용자별 KIS 키 설정 없이도 백테스트가 됩니다.

> 💡 초보 포인트: docstring 의 "흐름 1~6" 은 단순 설명이 아니라 **실제 코드의 주석 번호(`# 1. ~ # 7.`)와 짝**입니다. 코드를 읽다 길을 잃으면 여기로 돌아오세요.

---

### B. import 묶음 — `L14-L26`

```python
# L14-L26
from __future__ import annotations

import logging
import os
import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any, Dict, List, Optional

import pandas as pd

logger = logging.getLogger(__name__)
```
- `from __future__ import annotations` — 타입힌트를 "문자열처럼 늦게 평가"하게 하는 주문(파이썬 최신 타입표기를 편하게 쓰려고). vbt_engine 과 동일.
- `logging` — 진행/에러를 서버 로그로 남기는 표준 도구. `logger = logging.getLogger(__name__)` 로 이 모듈 전용 로거를 만듭니다(`[Lean] ...` 로그가 여기서 나옴).
- `uuid` — **충돌 없는 고유 ID** 생성기. 아래에서 `run_id` 뒷자리(8글자)를 만드는 데 씀.
- `dataclass` — 설정/결과 묶음 상자(B-1, B-2 에서 사용).
- `datetime, timedelta` — 시간 계산(시작시각 기록, fetch 기간 산정). **단, `timedelta` 는 import 만 하고 실제로는 안 씁니다** → 사실상 미사용 import(고도화에서 정리 후보).
- `Path` — OS 무관 경로 객체(`/` 연산자로 경로 조합). 워크스페이스 폴더 다룰 때 필수.
- `typing` — `Any/Dict/List/Optional` 타입표기.
- `pandas as pd` — 가격 데이터를 표(DataFrame)로 다루는 라이브러리.

> 💡 초보 포인트: `import os` 도 이 파일 안에선 직접 쓰이지 않습니다(과거 흔적 또는 방어적 import). "있다고 다 쓰는 건 아니다" — 고도화에서 lint 로 정리할 수 있는 부분.

---

### C. 주문서 — `LeanBacktestRequest` dataclass — `L29-L41`

```python
# L29-L41
@dataclass
class LeanBacktestRequest:
    """단일 Lean 백테스트 요청."""
    strategy_id: str                       # 예: "sma_crossover"
    symbols: List[str]                     # 예: ["SPY"], ["005930"]
    start_date: str                        # "YYYY-MM-DD"
    end_date: str                          # "YYYY-MM-DD"
    initial_capital: float = 100_000_000.0 # 1억원 default
    market: str = "us"                     # "us" or "krx"
    param_overrides: Optional[Dict[str, Any]] = None
    commission_rate: float = 0.00015       # 0.015%
    tax_rate: float = 0.0                  # 매도세 (US 0, KRX 0.2%)
    slippage: float = 0.0
```
- **무엇을** — "어떤 백테스트를 돌릴지"를 담는 **입력 상자**. main.py 의 Pydantic 모델 `LeanBacktestReq` 와 거의 같은 필드인데(**아래 함정 6 참고**), main.py 가 그걸 받아 이 dataclass 로 **복사**해 넘깁니다.
- **각 필드의 뜻**:
  - `strategy_id` — preset 전략 ID(예: `"sma_crossover"`). 레지스트리에서 이걸로 전략을 찾습니다.
  - `symbols` — 종목 코드 **리스트**. US 는 `"SPY"`, KRX 는 `"005930"`(삼성전자) 같은 코드. 여러 종목 가능.
  - `start_date / end_date` — 백테스트 기간(`"YYYY-MM-DD"` 문자열).
  - `initial_capital=100_000_000.0` — 시작 자본 **1억원**(숫자 안의 `_` 는 천 단위 구분용 가독성 기호, 값엔 영향 없음).
  - `market="us"` — `"us"`(미국) 또는 `"krx"`(한국). **현재 krx 데이터는 미구현**(아래 `_fetch_ohlcv` 참고).
  - `param_overrides` — 전략 파라미터 덮어쓰기(예: SMA 기간을 20→15). 없으면 `None`.
  - `commission_rate=0.00015` — 수수료율 0.015%.
  - `tax_rate=0.0` — 매도세. 주석대로 미국 0%, 한국 0.2%(여기 기본은 0).
  - `slippage=0.0` — 슬리피지(체결오차) 기본 0.
- **왜 dataclass 인가** — 필드가 10개라 함수 인자로 일일이 넘기면 지옥. **한 상자(`req`)에 담아 통째로** 넘깁니다(vbt_engine `BacktestParams` 와 같은 이유).

> ⚠️ 헷갈리는 포인트: `tax_rate` 기본이 `0.0` 인데 주석은 "KRX 0.2%"라고 적혀 있습니다. **기본값이 자동으로 0.2% 가 되는 게 아닙니다** — 한국 매도세를 반영하려면 호출 쪽(Spring/main.py)이 명시적으로 `tax_rate=0.002` 를 넣어줘야 합니다. 주석은 "그래야 한다"는 안내일 뿐.

---

### D. 납품서 — `LeanBacktestResult` dataclass — `L44-L54`

```python
# L44-L54
@dataclass
class LeanBacktestResult:
    """Lean 백테스트 결과 (Spring 으로 반환할 정규화 형태)."""
    success: bool
    run_id: str
    statistics: Dict[str, Any]             # CAGR, Sharpe, MaxDD 등
    equity_curve: List[Dict[str, Any]]     # [{date, value}, ...]
    trades_count: int
    raw_json_path: Optional[str] = None    # 디버깅용
    error: Optional[str] = None
    elapsed_seconds: Optional[float] = None
```
- **무엇을** — 백테스트가 끝나고 Spring 에 돌려줄 **출력 상자**. 성공이든 실패든 항상 이 형태로 반환합니다(예외를 밖으로 안 던지고 여기에 담아 보냄 → 호출자가 try/except 안 해도 됨).
- **각 필드**:
  - `success` — 성공(True)/실패(False). main.py 가 이걸 보고 422 에러로 바꿀지 결정.
  - `run_id` — 이번 실행의 고유 이름(`"<strategy>-<8자리hex>"`). 로그·결과파일 추적용.
  - `statistics` — CAGR(연환산수익)·Sharpe·MaxDD 등 성적표 dict. (값은 `ResultFormatter` 가 채움.)
  - `equity_curve` — `[{date, value}, ...]` 자산곡선. 프론트 차트의 선.
  - `trades_count` — 체결된 거래 횟수(정수).
  - `raw_json_path` — Lean 이 만든 원본 결과 JSON 파일 경로(디버깅용, 없을 수 있어 `Optional`).
  - `error` — 실패 시 사람이 읽을 에러 메시지.
  - `elapsed_seconds` — 전체 소요 시간(초).
- **왜 "정규화 형태"인가** — Lean 원본 JSON 은 복잡하고 키 이름도 우리 프론트와 다릅니다. 이 상자가 **프론트가 기대하는 깔끔한 모양**으로 정리된 최종 산출물입니다.

---

### E. 데이터 가져오기 — `_fetch_ohlcv()` — `L57-L91`

이 함수는 **"한 종목의 가격표를 우리 창고에서 꺼내 Lean 이 좋아하는 모양으로 다듬는"** 보조 함수입니다(이름 앞 `_` = 내부용).

함수 머리 + KRX 차단:
```python
# L57-L67
def _fetch_ohlcv(symbol: str, start: str, end: str, market: str) -> pd.DataFrame:
    """우리 기존 yf_client 로 OHLCV 가져옴.
    ...
    """
    if market == "krx":
        raise NotImplementedError(
            "KRX 데이터 소스는 아직 미통합 — 이번 세션은 US 백테스트만 검증. "
            "다음 세션에서 KIS daily chart fetcher 추가 예정."
        )
```
- **무엇을** — `market` 이 `"krx"`(한국 주식)면 **즉시 `NotImplementedError` 로 중단**. 한국 주식 데이터 연결은 아직 안 만들었다는 솔직한 신호.
- **왜** — 미완성을 조용히 빈 데이터로 넘기면 백테스트가 이상한 결과를 내고 디버깅이 어려워집니다. **명확한 에러로 빨리 실패(fail-fast)** 시키는 게 안전합니다.
- ⚠️ 헷갈리는 포인트: 이 에러는 `run_lean_backtest` 의 큰 `try/except` 에 잡혀 `success=False, error="KRX 데이터 소스는..."` 로 변환됩니다. 서버가 죽지 않습니다.

기간(period) 산정:
```python
# L68-L80
    # period 계산 (yfinance 는 period 형식 받음)
    from app.data.yf_client import get_history
    start_dt = datetime.strptime(start, "%Y-%m-%d")
    end_dt = datetime.strptime(end, "%Y-%m-%d")
    days = (end_dt - start_dt).days
    if days <= 365:
        period = "1y"
    elif days <= 730:
        period = "2y"
    elif days <= 1825:
        period = "5y"
    else:
        period = "10y"
```
- **무엇을** — 요청한 `start~end` 사이 **일수(`days`)** 를 계산하고, 그걸 yfinance 가 쓰는 **기간 코드("1y"/"2y"/"5y"/"10y")** 로 변환.
- **왜 이렇게** — `get_history` 가 정확한 날짜범위 대신 **"최근 N년"** 형식(`period`)을 받기 때문. 그래서 "요청 기간이 며칠인지"를 보고 그걸 충분히 덮는 가장 가까운 단위를 고릅니다(365일 이하→1년, 730일 이하→2년 …).
- ⚠️ 헷갈리는 포인트: `get_history` 를 **함수 안에서** import 합니다(lazy import). 모듈 최상단이 아니라 여기서 부르는 건, 순환 의존이나 무거운 초기화를 피하려는 흔한 패턴.
- ⚠️ 미묘한 함정: `period="1y"` 는 "오늘 기준 최근 1년"입니다. 만약 `start_date` 가 **과거 깊숙한 날짜**(예: 2015년)면, 일수는 크게 잡혀 `"10y"` 가 되어도 yfinance 가 그 옛날 데이터를 다 못 줄 수 있습니다. 아래 필터링이 이를 일부 보정하지만, "기간이 곧 시작점"은 아님에 주의.

가져온 데이터 다듬기:
```python
# L82-L91
    df = get_history(symbol, period=period, interval="1d")
    # 인덱스를 datetime → 'date' 컬럼으로 (DataConverter 기대 형식)
    df = df.reset_index().rename(columns={
        df.index.name or "Date": "date",
        "Open": "open", "High": "high", "Low": "low", "Close": "close", "Volume": "volume",
    })
    # 요청 기간으로 필터링
    df["date"] = pd.to_datetime(df["date"])
    df = df[(df["date"] >= start_dt) & (df["date"] <= end_dt)].copy()
    return df
```
- `get_history(symbol, period, interval="1d")` — 우리 yfinance 래퍼로 **일봉(1d)** OHLCV 를 DataFrame 으로 받음. 보통 날짜가 **인덱스**로 들어옵니다.
- `df.reset_index()` — 날짜 **인덱스를 일반 컬럼으로** 끄집어냄(다음 단계 `DataConverter` 가 `'date'` 컬럼을 기대하므로).
- `.rename(columns={...})` — 컬럼 이름을 표준 소문자(`date/open/high/low/close/volume`)로 통일. `df.index.name or "Date"` 는 "인덱스 이름이 있으면 그걸, 없으면 'Date'를" → 이걸 `'date'` 로 바꿈.
- `pd.to_datetime(df["date"])` — 날짜를 문자열이 아닌 **진짜 날짜 타입**으로(비교 연산 위해).
- 마지막 줄 — `start_dt ~ end_dt` **요청 기간만 잘라냄**(`period` 가 넉넉히 가져온 걸 정확히 트림). `.copy()` 는 "원본 슬라이스가 아닌 독립 복사본"을 만들어 pandas 의 `SettingWithCopyWarning` 경고를 피하는 관용.
- **반환** — `date,open,high,low,close,volume` 컬럼을 가진 깔끔한 DataFrame 한 장.

> 💡 초보 포인트: 이 함수의 핵심은 "가져오기"보다 **"모양 맞추기(컬럼명·날짜타입·기간)"** 입니다. 다음 단계 `DataConverter.export` 가 **딱 이 모양**(소문자 컬럼 + `date`)을 요구하기 때문(`data_converter.py` 의 `required_cols = ['open','high','low','close','volume']` 검사).

---

### F. 본체 — `run_lean_backtest()` — `L94-L232` (이 파일의 알맹이)

함수 머리 + 콜백 준비:
```python
# L94-L103
def run_lean_backtest(req: LeanBacktestRequest, progress_cb=None) -> LeanBacktestResult:
    """단일 Lean 백테스트 실행.

    progress_cb(level, msg): 진행 콜백.
      level='phase' 단계전환 | 'lean' lean stdout 라인 | 'info'/'error' 일반 로그.
      None 이면 무시 (동기 /lean/backtest 경로는 콜백 없이 그대로 동작).
    """
    started_at = datetime.now()
    run_id = f"{req.strategy_id}-{uuid.uuid4().hex[:8]}"
    _emit = progress_cb if callable(progress_cb) else (lambda *a, **k: None)
```
- **입력** — `req`(주문서 상자), `progress_cb`(진행 콜백, **선택**).
- `started_at = datetime.now()` — 소요시간 계산용 시작 시각 기록.
- `run_id = f"{req.strategy_id}-{uuid.uuid4().hex[:8]}"` — **이번 실행의 고유 이름**. 예: `"sma_crossover-1a2b3c4d"`. `uuid4().hex` 는 32자리 16진수 무작위 문자열, `[:8]` 로 앞 8자만 잘라 붙임 → 같은 전략을 여러 번 돌려도 **폴더가 안 겹침**.
- `_emit = progress_cb if callable(progress_cb) else (lambda *a, **k: None)` — **핵심 트릭**. 콜백이 진짜 함수면 그걸 쓰고, **없으면(None) "아무것도 안 하는 빈 함수"** 로 대체. 덕분에 아래에서 `_emit(...)` 를 콜백 유무에 상관없이 **마음 놓고 부를 수 있음**(매번 `if progress_cb:` 안 써도 됨).

> 💡 초보 포인트: `lambda *a, **k: None` = "어떤 인자가 와도 무시하고 None 을 돌려주는 무해한 함수". 콜백이 없는 동기 경로(`/lean/backtest`)에서 진행 보고를 **조용히 삼키는** 안전장치입니다.

#### ⚠️ lazy import — 모듈 인스턴스 이중화 함정 — `L105-L124`
```python
# L105-L124
    # ─── lazy import: kis_backtest 가 무거우니 (전체 strategies 자동 등록) 요청 시점에만 로드 ───
    # 주의: 반드시 'kis_backtest.*' 절대 import 만 사용 — 'app.lean.kis_backtest.*' 와
    # 'kis_backtest.*' 가 사이드 by 사이드로 import 되면 Python 이 두 개의 모듈 인스턴스를
    # 만들어서 StrategyRegistry 가 두 벌이 됨 → preset 등록은 한쪽에만 일어나고 조회는 빈 쪽에서 함.
    try:
        import app.lean  # noqa: F401  — sys.path 주입 트리거
        # preset 전략 자동 등록 (import side-effect)
        import kis_backtest.strategies.preset  # noqa: F401
        from kis_backtest.strategies.registry import StrategyRegistry
        from kis_backtest.codegen.generator import LeanCodeGenerator, CodeGenConfig
        from kis_backtest.lean.executor import LeanExecutor
        from kis_backtest.lean.project_manager import LeanProjectManager
        from kis_backtest.lean.data_converter import DataConverter
        from kis_backtest.lean.result_formatter import ResultFormatter
    except Exception as e:
        logger.exception("kis_backtest 라이브러리 import 실패")
        return LeanBacktestResult(
            success=False, run_id=run_id, statistics={}, equity_curve=[], trades_count=0,
            error=f"kis_backtest import 실패: {e}",
        )
```
- **무엇을** — 무거운 `kis_backtest` 라이브러리를 **여기서(요청 시점에)** 한꺼번에 import.
- `import app.lean` — **반드시 먼저**. `app/lean/__init__.py` 가 `sys.path` 에 `app/lean/` 폴더를 꽂아주는 **부작용(side-effect)** 을 트리거합니다. 이게 있어야 그 아래 `import kis_backtest.*`(절대 경로 import)가 폴더를 찾습니다. (`__init__.py` 의 주석: 벤더링된 트리가 `from kis_backtest.X import Y` 절대 import 를 쓰기 때문에 폴더를 top-level path 에 넣어줌.)
- `import kis_backtest.strategies.preset` — **import 자체가 일을 함**. 이 모듈을 불러오는 순간 모든 preset 전략(sma_crossover, rsi 등)이 `StrategyRegistry` 에 **자동 등록**됩니다(데코레이터 부작용). 그래서 `# noqa: F401`(미사용 경고 무시) 주석이 붙음 — "안 쓰는 것 같지만 import 자체가 목적".
- **⚠️ 주석의 경고(이 파일에서 가장 중요한 교훈)**: 절대 `import app.lean.kis_backtest.X` 처럼 부르지 마라. 그러면 파이썬이 **같은 코드를 두 개의 다른 모듈**(`kis_backtest`, `app.lean.kis_backtest`)로 인식해 **`StrategyRegistry` 가 두 벌** 생깁니다. preset 은 한쪽에 등록되는데 조회는 빈 쪽에서 일어나 **"전략을 못 찾는"** 유령 버그가 납니다. (메모리: "lazy import → 두 모듈 인스턴스 함정".)
- **import 한 7개 일꾼**: `StrategyRegistry`(전략 찾기), `LeanCodeGenerator/CodeGenConfig`(코드 생성), `LeanExecutor`(도커 실행), `LeanProjectManager`(폴더 세팅), `DataConverter`(CSV), `ResultFormatter`(결과 변환).
- `except Exception` — import 자체가 깨지면(라이브러리 미설치 등) **터지지 않고** `success=False` 결과로 곱게 반환. `logger.exception` 은 스택트레이스까지 로그에 남김.

#### 1단계 — 전략 조회 — `L126-L137`
```python
# L126-L137
    try:
        # 1. 전략 조회 + 파라미터 적용
        if req.param_overrides:
            definition = StrategyRegistry.build_with_params(req.strategy_id, **req.param_overrides)
        else:
            definition = StrategyRegistry.build(req.strategy_id)
    except KeyError:
        return LeanBacktestResult(
            success=False, run_id=run_id, statistics={}, equity_curve=[], trades_count=0,
            error=f"Strategy not found: {req.strategy_id}. "
                  f"가능: {', '.join(StrategyRegistry.list_all())}",
        )
```
- **무엇을** — `strategy_id` 로 레지스트리에서 전략 **명세(`definition`)** 를 만들어 옴.
  - 파라미터 덮어쓰기가 있으면 `build_with_params(id, **overrides)` — `**` 는 dict 를 키워드 인자로 펼치기(`{"period":21}` → `period=21`).
  - 없으면 기본값으로 `build(id)`.
- `definition` 은 `StrategyDefinition` 객체로, 뒤에서 `definition.name`(표시 이름)을 씁니다.
- **⚠️ 정확성 주의(코드 vs 실제 동작)**: 이 `except KeyError` 는 "없는 전략이면 친절한 에러 + 가능한 전략 목록"을 의도합니다. **그러나** `StrategyRegistry.build/build_with_params` 의 실제 구현(`registry.py`)은 전략을 못 찾으면 **`KeyError` 를 던지는 게 아니라 `None` 을 반환**합니다(`get()` 이 None → 그대로 None 리턴). 즉 **없는 전략 ID 를 주면 이 `except KeyError` 가 안 걸리고**, `definition = None` 인 채로 다음 단계(`# 2`)로 진입합니다. 거기서 `definition.name` 접근 시 `AttributeError: 'NoneType'` 이 나고, 그건 아래 큰 `except Exception` 에 잡혀 `success=False, error="'NoneType' object has no attribute 'name'"` 로 반환됩니다.
  - 결과적으로 "실패로 안전하게 끝남"은 맞지만, **에러 메시지가 의도한 "가능: ..." 목록이 아니라 NoneType 에러**가 됩니다 → 고도화 후보(아래 참고).

#### 2단계 — 데이터 fetch (각 종목 반복) — `L139-L149`
```python
# L139-L149
    try:
        _emit("phase", f"전략 로드: {definition.name}")
        # 2. 데이터 fetch (우리 yf/Polygon)
        data_dict: Dict[str, pd.DataFrame] = {}
        for sym in req.symbols:
            _emit("phase", f"데이터 로드: {sym} ({req.start_date}~{req.end_date})")
            df = _fetch_ohlcv(sym, req.start_date, req.end_date, req.market)
            if df.empty:
                raise ValueError(f"No OHLCV data for {sym} between {req.start_date} ~ {req.end_date}")
            data_dict[sym] = df
        logger.info(f"[Lean] fetched {len(data_dict)} symbols")
```
- 여기서부터 **큰 `try` 블록**이 시작됩니다(끝은 L232 의 `except`). 이 안에서 일어나는 모든 예외는 한곳에서 잡혀 실패 결과로 변환됩니다.
- `_emit("phase", ...)` — **단계 전환 보고**. 비동기 잡이면 이 메시지가 진행 로그에 쌓여 프론트가 "전략 로드 → 데이터 로드 → …" 진행을 봅니다.
- `for sym in req.symbols` — 종목마다 `_fetch_ohlcv` 로 가격표를 받아 `data_dict[sym]` 에 쌓음.
- `if df.empty: raise ValueError(...)` — 데이터가 비면 **즉시 중단**(없는 종목·기간 무데이터 방지).
- 결과: `data_dict = {"SPY": df, ...}` 형태로 다음 단계에 넘어감.

#### 3단계 — Lean 프로젝트(워크스페이스) 생성 — `L151-L169`
```python
# L151-L169
        # 3. 프로젝트 생성
        _emit("phase", f"Lean 프로젝트 생성: {run_id}")
        market_type = "us" if req.market == "us" else "krx"
        currency = "USD" if req.market == "us" else "KRW"
        project = LeanProjectManager.create_project(
            run_id=run_id,
            symbols=req.symbols,
            start_date=req.start_date,
            end_date=req.end_date,
            initial_capital=req.initial_capital,
            commission_rate=req.commission_rate,
            tax_rate=req.tax_rate,
            strategy_type=req.strategy_id,
            strategy_params=req.param_overrides or {},
            strategy_id=req.strategy_id,
            strategy_name=definition.name,
            market_type=market_type,
            currency=currency,
        )
```
- **무엇을** — Lean 이 읽을 **폴더 구조를 스캐폴드**(생성)합니다. `create_project` 가 내부에서 `init_workspace()` 를 호출 → `.lean-workspace/` 아래에 `lean.json`(로그인 우회 더미 org-id 포함)·`data/`·`projects/<run_id>/` 를 만들고, `config.json`(전략 메타) 도 씁니다.
- `market_type / currency` — `"us"→("us","USD")`, 그 외→`("krx","KRW")`. 이게 데이터 폴더 경로(`equity/usa/daily` vs `equity/krx/daily`)와 통화 표기를 가릅니다.
- `strategy_params=req.param_overrides or {}` — `None` 이면 빈 dict 로(파일에 `null` 대신 `{}` 저장하려고).
- `project` 는 `LeanProject` 객체로, `project.data_dir`(CSV 넣을 곳)·`project.project_dir`(main.py 넣을 곳) 속성을 다음 단계에서 씁니다.

> 💡 초보 포인트: 이 단계는 **계산이 아니라 "작업장 차리기"** 입니다. Lean 엔진은 정해진 폴더 규약(데이터는 여기, 알고리즘은 저기)을 따르므로, 그 규약대로 빈 방을 만들어 두는 것.

#### 4단계 — 데이터를 Lean CSV 로 — `L171-L173`
```python
# L171-L173
        # 4. 데이터 CSV 작성 (Lean 포맷)
        _emit("phase", f"데이터 CSV 변환 ({len(data_dict)} 종목)")
        DataConverter.export(data_dict, str(project.data_dir), market_type=market_type)
```
- **무엇을** — `data_dict`(pandas 표들)을 Lean 이 읽는 **CSV 파일**로 변환해 `project.data_dir` 에 저장.
- Lean CSV 형식(`data_converter.py`): **헤더 없이** `YYYYMMDD,open,high,low,close,volume`. KRX 는 가격을 정수(원), US 는 소수 2자리(달러)로 씀. 파일명은 `{심볼소문자}.csv`(예: `spy.csv`).
- 이렇게 해야 도커 속 Lean 이 우리 데이터를 자기 데이터처럼 읽습니다.

#### 5단계 — 알고리즘 코드(main.py) 생성 — `L175-L189`
```python
# L175-L189
        # 5. main.py 코드 생성
        from kis_backtest.core.converters import from_definition
        schema = from_definition(definition)
        gen_config = CodeGenConfig(
            market=market_type,
            commission_rate=req.commission_rate,
            tax_rate=req.tax_rate,
            slippage=req.slippage,
            initial_capital=req.initial_capital,
        )
        generator = LeanCodeGenerator(schema, gen_config)
        lean_code = generator.generate(req.symbols, req.start_date, req.end_date)
        (project.project_dir / "main.py").write_text(lean_code, encoding="utf-8")
        logger.info(f"[Lean] main.py written ({len(lean_code)} bytes)")
        _emit("phase", f"Lean 알고리즘 코드 생성 ({len(lean_code)} bytes)")
```
- **무엇을** — 전략 명세(`definition`)를 **실제로 실행 가능한 Lean 파이썬 코드(`main.py`)** 로 자동 변환해 프로젝트 폴더에 씁니다.
- `from_definition(definition)` — `StrategyDefinition`(추상 명세)을 코드제너레이터가 먹는 `StrategySchema` 로 변환. (이 import 도 lazy — 함수 안에서.)
- `CodeGenConfig(...)` — 코드 생성 설정(시장·수수료·세금·슬리피지·자본). 이 값들이 생성된 알고리즘 안의 수수료/세금 모델로 박힙니다.
- `LeanCodeGenerator(schema, gen_config).generate(symbols, start, end)` — **전략 규칙을 Lean 코드 텍스트로 렌더링**. 반환은 그냥 **파이썬 소스 문자열**.
- `.write_text(lean_code, encoding="utf-8")` — 그 문자열을 `projects/<run_id>/main.py` 로 저장. **`encoding="utf-8"` 명시가 중요**(아래 함정 참고): 한글 주석·심볼이 들어가도 안 깨지게.
- `len(lean_code) bytes` 로그 — 생성된 코드 크기를 남겨 "코드가 비어있진 않은지" 빠르게 확인.

#### 6단계 — 도커 속 Lean 실행 (실시간 스트리밍) — `L191-L195`
```python
# L191-L195
        # 6. Docker 실행
        _emit("phase", "Lean 엔진 실행 (Docker 컨테이너 부팅)…")
        lean_run = LeanExecutor.run(project, stream_logs=False, timeout=600,
                                    on_line=lambda line: _emit("lean", line))
        _emit("phase", f"Lean 엔진 완료 ({lean_run.duration_seconds:.1f}s) · 결과 파싱 중…")
```
- **무엇을(이 파일의 클라이맥스)** — `LeanExecutor.run` 으로 **`lean backtest` CLI → 도커 컨테이너 → Lean 엔진**을 실제로 돌립니다. 이 한 줄 안에서 진짜 백테스트(수익률·체결·통계)가 계산됩니다.
- `timeout=600` — **10분 한도**. 넘으면 executor 가 프로세스를 죽이고 `RuntimeError("타임아웃")` → 우리 큰 except 가 실패 결과로 변환.
- `on_line=lambda line: _emit("lean", line)` — **lean 의 stdout 한 줄 한 줄을 진행 콜백으로 중계**. executor 가 별도 리더 스레드로 stdout 을 읽으며 줄마다 이 람다를 호출 → `_emit("lean", line)` → 잡 로그 → 프론트 실시간 진행. (동기 경로에선 `_emit` 가 빈 함수라 그냥 버려짐.)
- `stream_logs=False` — executor 의 (현재 미사용) 호환 인자. 실제 스트리밍은 `on_line` 으로 함.
- 반환 `lean_run` 은 `LeanRun` 객체: `result_json`(결과 파일 경로), `duration_seconds`(소요), `load_result()`(JSON 로드) 등을 제공.

> 💡 초보 포인트: 여기서 우리 파이썬은 **계산을 안 합니다**. 도커 속 C# Lean 엔진이 다 합니다. 우리는 "발주하고, 진행을 중계받고, 끝나길 기다릴" 뿐. 그래서 이 파일이 "엔진"이 아니라 **"오케스트레이터(작업반장)"** 인 것.

#### 7단계 — 결과 파싱 + 정규화 — `L197-L224`
```python
# L197-L213
        # 7. 결과 파싱 — ResultFormatter 는 {"result": {...}} 형태로 중첩 반환
        api_resp = ResultFormatter.to_api_response(
            lean_run,
            symbols=req.symbols,
            start_date=req.start_date,
            end_date=req.end_date,
            initial_capital=req.initial_capital,
            strategy_type=req.strategy_id,
            strategy_params=req.param_overrides or {},
            currency=currency,
            strategy_name=definition.name,
        )
        result_obj = api_resp.get("result", {})
        stats = result_obj.get("statistics", {})
        equity = result_obj.get("equity_curve", [])
        trades = result_obj.get("trades", [])
```
- **무엇을** — `ResultFormatter.to_api_response` 가 Lean 원본 JSON(복잡한 차트·주문 구조)을 **프론트 친화 형식**으로 변환. 반환은 `{"result": {...}, "currency": ..., ...}` 처럼 **`result` 키 아래 중첩**(주석이 콕 집어 알려줌).
- `result_obj = api_resp.get("result", {})` — 그 중첩을 풀어서 알맹이를 꺼냄. `.get(..., {})` 는 "없으면 빈 dict"로 **KeyError 방지**.
- 거기서 `statistics`(성적표)·`equity_curve`(자산곡선)·`trades`(거래 리스트)를 각각 뽑음. (`ResultFormatter` 가 Lean 키 `Net Profit/Sharpe Ratio/Drawdown` 등을 우리 키 `cagr/sharpe_ratio/max_drawdown_pct` 등으로 매핑.)

```python
# L214-L224
        elapsed = (datetime.now() - started_at).total_seconds()
        logger.info(f"[Lean] backtest done run_id={run_id} elapsed={elapsed:.1f}s")
        return LeanBacktestResult(
            success=True,
            run_id=run_id,
            statistics=stats,
            equity_curve=equity,
            trades_count=len(trades),
            raw_json_path=str(lean_run.result_json) if lean_run.result_json else None,
            elapsed_seconds=elapsed,
        )
```
- `elapsed` — 시작부터 지금까지 총 소요(초).
- **성공 납품서 반환** — `success=True` + 통계 + 자산곡선 + 거래수(`len(trades)`) + 원본 JSON 경로(있으면 문자열, 없으면 None) + 소요시간.
- `trades_count=len(trades)` — 거래 **리스트의 길이**가 곧 거래 횟수.

#### 예외 처리(전체 안전망) — `L226-L232`
```python
# L226-L232
    except Exception as e:
        logger.exception(f"[Lean] backtest failed run_id={run_id}")
        elapsed = (datetime.now() - started_at).total_seconds()
        return LeanBacktestResult(
            success=False, run_id=run_id, statistics={}, equity_curve=[], trades_count=0,
            error=str(e), elapsed_seconds=elapsed,
        )
```
- **무엇을** — 1~7단계 어디서 터지든(데이터 없음·도커 실패·타임아웃·NoneType 등) **모두 여기로 모여** `success=False` 납품서로 변환.
- `logger.exception` — 스택트레이스를 서버 로그에 남겨 디버깅 가능. 하지만 **밖으로는 깔끔한 에러 문자열만** 전달 → 호출자(main.py)는 422/500 으로 변환만 하면 됨.
- **왜 이 패턴이 좋은가** — "예외를 던지는 함수"는 호출자가 매번 try/except 해야 합니다. 이 함수는 **항상 `LeanBacktestResult` 를 돌려준다**는 **단일 계약**을 지켜, main.py 가 `if not result.success:` 한 줄로 분기할 수 있게 합니다(L778, L831).

---

### G. 전략 목록 — `list_available_strategies()` — `L235-L240`

```python
# L235-L240
def list_available_strategies() -> List[Dict[str, Any]]:
    """등록된 preset 전략 목록 + 파라미터 정의."""
    import app.lean  # noqa: F401  — sys.path 주입
    import kis_backtest.strategies.preset  # noqa: F401
    from kis_backtest.strategies.registry import StrategyRegistry
    return StrategyRegistry.list_all_with_params()
```
- **무엇을** — 쓸 수 있는 모든 preset 전략과 **각 전략의 파라미터 정의**(이름·기본값·범위 등)를 리스트로 반환. 프론트의 "전략 고르기 + 파라미터 조절 UI" 가 이걸 먹습니다.
- `import app.lean`(sys.path 주입) → `import ...preset`(자동 등록 부작용) → `StrategyRegistry.list_all_with_params()` 순서는 `run_lean_backtest` 와 **동일한 lazy import 패턴**. 여기서도 반드시 `kis_backtest.*` 절대 경로(이중 인스턴스 함정 회피).
- `GET /lean/strategies` 엔드포인트가 이 함수를 직접 호출(main.py L747-748).

> 💡 초보 포인트: 같은 lazy import 가 두 함수에 **중복**되어 있습니다(`run_lean_backtest` 와 여기). 함수가 독립적으로 호출될 수 있어 각자 import 를 보장하는 것 — 약간의 중복을 감수하고 **안전(어느 진입점으로 들어와도 등록 보장)** 을 택한 설계.

---

## ⚠️ 함정·버그 주의 (코드/주석에 박힌 교훈 모음)

1. **모듈 이중 인스턴스(가장 치명적)** — `kis_backtest.*` 와 `app.lean.kis_backtest.*` 를 섞어 import 하면 `StrategyRegistry` 가 **두 벌**이 되어 preset 을 못 찾습니다. 반드시 **`kis_backtest.*` 절대 import** 만 쓰고, 그 전에 `import app.lean`(sys.path 주입)을 먼저 해야 함. (L106-108 주석 + `__init__.py` 근거.)

2. **stdout cp949 디코드 데드락 / 인코딩** — `executor.py` 의 `Popen(..., encoding="utf-8", errors="replace")` 가 핵심:
   - Windows 기본 인코딩은 **cp949**라, lean stdout 에 cp949 로 디코드 불가능한 바이트가 나오면 디코드가 깨질 수 있습니다 → `encoding="utf-8"` 로 명시.
   - `errors="replace"` 의 진짜 이유는 주석에 박혀 있음: **"리더 스레드가 (디코드 에러로) 죽으면 파이프 미배수 → lean write 블록 → 행(hang)"**. 즉 우리 쪽 읽기 스레드가 죽으면 도커 속 lean 이 **stdout 파이프가 가득 차 쓰기에서 멈춰** 전체가 **데드락**. 그래서 깨지는 바이트는 죽지 말고 `replace`(�)로 흘려보내 **파이프를 계속 비워** 컨테이너가 안 멈추게 합니다. (executor.py L213-216.)

3. **`main.py` 쓰기 인코딩** — 생성된 알고리즘을 `.write_text(lean_code, encoding="utf-8")` 로 저장(L187). 명시 안 하면 Windows 가 cp949 로 써서 한글 주석/심볼이 깨질 수 있음.

4. **"없는 전략" 에러 메시지 불일치** — `except KeyError`(L132)는 친절한 "가능: ..." 메시지를 주려 하지만, `StrategyRegistry.build` 는 실제로 **`None` 을 반환**(KeyError 안 던짐)합니다. → 없는 ID 면 이 except 를 **안 거치고** `definition=None` → `definition.name` 에서 `AttributeError` → 큰 except 에서 **"NoneType ... has no attribute 'name'"** 로 끝남. 실패 자체는 안전하나 **메시지가 의도와 다름**(고도화 후보).

5. **`tax_rate` 기본 0** — `LeanBacktestRequest.tax_rate=0.0`. 주석은 "KRX 0.2%"지만 **자동 적용 아님**. 한국 매도세를 반영하려면 호출자가 명시 전달해야 함.

6. **요청 모델 이중 정의** — main.py 의 Pydantic `LeanBacktestReq` 와 runner 의 dataclass `LeanBacktestRequest` 가 **거의 같은 필드를 두 번** 정의하고, main.py 가 필드를 일일이 손으로 복사(L765-776, L818-829). 필드 추가 시 **세 곳(모델·복사 2군데)을 같이 고쳐야** 하는 잠재 버그 지점.

7. **미사용 import** — `timedelta`(L20)·`os`(L17)는 import 만 하고 본문에서 안 씀. 동작엔 무해하나 정리 대상.

8. **KRX 미구현** — `_fetch_ohlcv` 가 `market=="krx"` 면 `NotImplementedError`. 현재는 **US 백테스트만** 검증됨(docstring·코드 일치).

9. **`period` 근사의 한계** — yfinance 의 `period="Ny"` 는 "오늘 기준 최근 N년"이라, 시작일이 아주 과거면 원하는 구간 데이터를 못 채울 수 있음(L73-80). 이후 날짜 필터로 잘라내지만 "데이터가 비면 ValueError" 로 이어질 수 있음.

10. **첫 실행 매우 느림** — main.py 주석(L760): 도커 이미지 풀로 첫 실행 ~20분. 그래서 동기 `/lean/backtest` 보다 **비동기 `/lean/backtest/start` + 폴링**을 권장.

---

## 🚀 고도화 아이디어 (강의·개선 버전용)

- **"전략 없음" 에러 정합성 수정**: 1단계에서 `definition` 이 `None` 이면 즉시 친절한 에러로 반환하도록 명시 체크 추가 →
  ```python
  if definition is None:
      return LeanBacktestResult(success=False, run_id=run_id, statistics={}, equity_curve=[],
                                trades_count=0,
                                error=f"Strategy not found: {req.strategy_id}. 가능: {', '.join(...)}")
  ```
  (현재 `except KeyError` 는 실제로 안 걸리는 죽은 가지.)
- **요청 모델 단일화**: main.py Pydantic 모델과 runner dataclass 의 중복 제거. Pydantic 모델 하나로 통일하거나, `LeanBacktestRequest(**req.model_dump())` 로 복사 코드를 한 줄로.
- **KRX 데이터 어댑터**: `_fetch_ohlcv` 의 `krx` 분기에 KIS daily chart fetcher 연결(docstring 의 "다음 세션" 계획). `credentials.py` + `kis_backtest.providers.kis` 활성화.
- **부분 실패 허용(멀티 심볼)**: 지금은 한 종목이라도 데이터 없으면 전체 실패. 일부 종목만 빠져도 "있는 종목으로 진행 + 경고"하는 옵션.
- **결과 캐시**: 같은 `(strategy, symbols, 기간, params)` 면 재실행 없이 캐시 반환(도커 부팅 비용 큼). `project_manager.get_project_result` 가 이미 저장 결과 재로드 기능을 가지고 있어 연동 쉬움.
- **타임아웃 동적화**: 기간·종목 수에 비례해 `timeout` 자동 조정(긴 백테스트가 600초에 잘리는 것 방지).
- **진행률 정량화**: 현재 `_emit("phase", ...)` 는 텍스트 단계만 보냄. lean stdout 의 "x% 완료"를 파싱해 **숫자 진행률**을 잡에 추가하면 프론트 프로그레스바 가능.
- **`raw_json_path` 보안**: 디버깅용 절대경로를 응답에 넣는데, 운영에선 외부 노출 주의(내부 토큰 경로만 허용).

---

## 📚 용어 사전 (이 파일 한정)

| 용어 | 뜻 |
|---|---|
| **Lean / QuantConnect** | 오픈소스 산업용 백테스트·실거래 엔진. 우리는 `lean backtest` CLI 로 부림 |
| **`lean backtest`** | 프로젝트 폴더를 받아 도커 속 Lean 엔진으로 백테스트 실행하는 CLI 명령 |
| **워크스페이스(`.lean-workspace`)** | `lean.json`·`data`·`projects`를 담는 Lean 작업 폴더 루트 |
| **`lean.json`(더미 org-id)** | 로그인 우회용 설정 파일. `organization-id="0"*32` 로 로컬 백테스트 인가 |
| **`run_id`** | `"<strategy>-<8자리hex>"` 형식 실행 고유 이름. 폴더 충돌 방지 |
| **lazy import** | 무거운 모듈을 파일 상단이 아니라 **함수 안(요청 시점)** 에서 import |
| **모듈 이중 인스턴스** | 같은 코드를 다른 경로로 import 해 파이썬이 두 모듈로 인식 → 레지스트리 두 벌 버그 |
| **`StrategyRegistry`** | preset 전략을 id 로 등록/조회하는 레지스트리. `build`/`build_with_params`/`list_all_with_params` |
| **`definition` / `schema`** | 전략의 추상 명세(`StrategyDefinition`) → 코드생성용(`StrategySchema`) |
| **`LeanCodeGenerator.generate`** | 전략 명세를 실행 가능한 Lean `main.py` **소스 문자열**로 렌더링 |
| **`DataConverter.export`** | pandas OHLCV → Lean CSV(`YYYYMMDD,o,h,l,c,v`, 헤더 없음) 변환 |
| **`LeanExecutor.run`** | `Popen` 으로 lean CLI 실행 + 리더 스레드로 stdout 스트리밍, `LeanRun` 반환 |
| **`on_line` / `progress_cb`** | lean stdout 한 줄/단계 전환을 잡 로그로 흘리는 콜백 |
| **`ResultFormatter.to_api_response`** | Lean 원본 JSON → `{"result": {...}}` 프론트 친화 형식 |
| **OHLCV** | Open·High·Low·Close·Volume — 일봉 하나의 5개 값 |
| **잡(Job) / 폴링** | 비동기 실행 단위 + `/status` 반복 호출로 진행 증분 수신 |
| **stdout 스트리밍** | 프로세스 표준출력을 한 줄씩 실시간으로 읽어 중계 |
| **데드락(hang)** | 리더가 파이프를 안 비워 lean 쓰기가 멈추는 교착. `errors="replace"`로 방지 |
| **fail-fast** | 미완성/오류를 조용히 넘기지 않고 즉시 명확한 예외로 중단 |
