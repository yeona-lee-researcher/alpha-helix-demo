# `backtest/infinite_buying.py` — 무한매수법(라오어식 분할매수) 시뮬레이터 (완전 라인별 해설)

> 원본: `analytics/app/backtest/infinite_buying.py` (295줄)
> 이 문서는 [`vbt_engine.md`](vbt_engine.md) 와 **동일한 교재 표준 형식**을 따릅니다. 먼저 `vbt_engine.md` 를 읽고 오면 훨씬 쉽습니다.

---

## 📌 이 파일 한눈에

이 파일은 **"무한매수법 전용 백테스트 엔진"** 입니다. `vbt_engine.py` 는 vectorbt 라이브러리에 매매를 통째로 맡겼지만, 이 파일은 **하루하루 직접 `for` 루프를 돌면서** "오늘 종가가 평단가보다 싼가? 그럼 산다", "평단보다 +10% 올랐나? 그럼 전량 판다" 같은 **무한매수법 규칙을 손으로 시뮬레이션**합니다. 같은 입력이면 항상 같은 결과가 나오는 **결정론적(deterministic)** 코드이고, 랜덤·외부호출이 전혀 없습니다.

> 실생활 비유: **적금 + 물타기 자동봇**. 매달(여기선 매일) 정해진 금액(`daily_budget`)을 떼어, "내가 산 평균 가격(평단)보다 싸면 한 숟갈 가득, 조금 비싸면 반 숟갈" 담고, "평단보다 충분히(+10%) 오르면 전부 팔아서 차익 실현 → 다시 처음부터" 를 반복하는 봇입니다.

핵심 함수는 **2개의 공개 함수 + 2개의 보조 도구** 입니다:

| 함수/클래스 | 한 줄 역할 | 비유 |
|---|---|---|
| `InfiniteBuyingParams` (dataclass) | 전략 손잡이(분할수·익절%·허용상한% 등) 묶음 | 봇 설정 다이얼판 |
| `_AssetState` (dataclass) | **티커 1개의 현재 상태**(보유수량·평단·현금·회차) | 종목별 장부 한 권 |
| `_round(x, n)` | 숫자를 안전하게 반올림(NaN/Inf → None) | JSON 안전포장지 |
| `run_infinite_buying(...)` | 과거 전체를 하루씩 재생 → 성적표 + 자산곡선 + 거래내역 | 과거 1년치를 봇에게 돌려보기 |
| `latest_order_plan(...)` | 과거를 재생해 **오늘 상태**를 구한 뒤 "내일 낼 주문" 계획 | 봇이 내일 아침 낼 주문서 |

**누가 호출하나?** → `app/main.py` 의 두 엔드포인트입니다 (`main.py:328-371`):

| HTTP | URL | 호출 함수 | 용도 |
|---|---|---|---|
| POST | `/backtest/infinite-buying` | `run_infinite_buying` | 무한매수법 과거 성과 백테스트 |
| POST | `/orders/infinite-buying/plan` | `latest_order_plan` | 내일 낼 BUY/SELL 주문 계획 생성 |

`/orders/infinite-buying/plan` 의 결과는 docstring(`L258`)에 적힌 대로 **`/alpha/.../queue-orders`** 흐름이 받아 모의(mock) 주문 큐에 BUY/SELL 추천을 밀어 넣는 데 쓰입니다. 즉 백엔드(Spring)가 "이 종목들 무한매수법으로 백테스트/주문계획 줘"라고 요청하면 결국 이 파일이 일합니다. 두 엔드포인트 모두 `require_internal_token`(내부 토큰)으로 보호됩니다.

**왜 vectorbt 를 안 쓰나?** → 무한매수법은 "평단가에 따라 매수 금액이 달라지고(1.0회/0.5회), 익절하면 사이클이 리셋되고, 복리로 예산이 재계산되는" **경로 의존(path-dependent) 규칙**입니다. vectorbt 의 단순 "entries/exits 신호표" 모델로는 이런 상태기계를 깔끔히 표현하기 어렵습니다. 그래서 **상태(state)를 들고 하루씩 직접 도는** 방식을 택했습니다.

---

## 🧠 사전 지식 (이거 모르면 막힘)

#### 1) 무한매수법(Infinite Buying Method)이란?
- 한국 투자자 **"라오어"** 가 대중화한 분할매수 전략입니다. 핵심 아이디어:
  - 원금을 한 번에 다 넣지 않고 **여러 회차(여기선 40회)로 쪼개서** 매일 조금씩 산다(분할매수).
  - 떨어질수록 더 사서 **평균 매입단가(평단)를 낮춘다**(이른바 "물타기").
  - 평단보다 충분히 오르면(+10%) **전량 매도**해 차익을 실현하고, **처음부터 다시** 시작한다(사이클 반복).
- 주로 **TQQQ·SOXL 같은 3배 레버리지 ETF**(변동성이 크지만 장기 우상향을 기대하는 종목)에 적용합니다. `main.py` 의 기본 티커가 `["TQQQ","SOXL"]` 인 이유.
- "무한"이라는 이름은 "익절 → 리셋 → 다시 분할매수"를 **무한히 반복**한다는 뜻이지, 돈을 무한히 넣는다는 뜻이 아닙니다. 오히려 **40회로 한도가 정해져** 있습니다.

#### 2) 평단가(평균 매입단가, average price)
- 내가 여러 번 나눠 산 주식의 **1주당 평균 원가**입니다.
- 예: 100원에 1주, 80원에 1주 사면 → 평단 = (100+80)/2 = **90원**. 떨어졌을 때 더 사면 평단이 내려갑니다. 이게 "물타기"의 원리.
- 이 파일에선 `avg_price = 누적원가(cost_basis) ÷ 보유수량(qty)` 로 매번 다시 계산합니다.

#### 3) LOC 주문 & "1.0회 / 0.5회" 매수
- **LOC(Limit On Close)** = "종가에 체결되는 지정가 주문". 무한매수법은 보통 장 마감 종가 기준으로 매수/매도합니다.
- 이 코드의 규칙(docstring `L4-L11`):
  - **종가 ≤ 평단** → 하루 예산(`daily_budget`) **전액** 매수 = "1.0회" 소진 (평단보다 싸니 적극 매수)
  - **평단 < 종가 ≤ 평단×(1+15%)** → 예산의 **절반**만 매수 = "0.5회" 소진 (조금 비싸도 약하게 매수)
  - **종가 > 평단×(1+15%)** → 너무 비싸니 **매수 안 함**
- 회차(`cycle_idx`)가 1.0/0.5씩 쌓여 **40에 도달하면 추가 매수 중단**(자본 보존).

#### 4) 사이클(cycle)과 복리
- **사이클** = "분할매수 시작 → 익절 → 리셋" 한 바퀴. 익절할 때마다 `cycles_completed` 가 1 늘고, 회차(`cycle_idx`)는 0으로 초기화됩니다.
- **복리**: 익절 후엔 불어난 현금(`cash_alloc`)을 다시 40으로 나눠 **다음 사이클의 1회차 예산**을 키웁니다(`cycle_budget`). 벌수록 다음 매수 단위가 커지는 구조.

#### 5) mark-to-market(시가 평가)
- 아직 안 판 주식을 **"지금 팔면 얼마"** 로 매일 평가하는 것. 자산곡선(equity curve)을 그리려면, 보유 중인 주식의 가치를 매일 현재가로 환산해 현금과 더해야 합니다.

#### 6) pandas 표 도구 몇 개
- `pd.concat({t: series}, axis=1)` = 티커별 종가 Series 들을 **열(column)로 나란히 붙여 표(DataFrame)** 로 만듦.
- `.ffill()` = 빈칸을 **직전 값으로 채움**(forward fill). 휴장일이 종목마다 달라 생기는 구멍 메우기.
- `df.iterrows()` = 표를 **한 행(=하루)씩** 순회. `ts` = 그날 날짜, `row` = 그날 티커별 종가.
- `pct_change()` = 전날 대비 변화율. `cummax()` = 누적 최댓값(자산곡선의 역대 최고점 추적).

---

## 🗺 전체 흐름도

```
closes = {"TQQQ": 종가Series, "SOXL": 종가Series}   ← 입력
                     │
                     ▼
        pd.concat → 한 표(df)로 정렬 + ffill        (휴장일 구멍 메우기)
                     │
        티커마다 _AssetState 장부 1권 생성
        (현금=원금/티커수, 1회차예산=현금/40)
                     │
   ┌─────────────────┴──────────────────────────────┐
   │  for 매일 (df.iterrows):                         │  ← 하루씩 직접 시뮬레이션
   │     for 각 티커:                                  │
   │        ① 익절 체크: 종가 ≥ 평단×1.10 → 전량매도   │
   │                     → 사이클 리셋 + 복리 예산갱신  │
   │        ② 매수 결정: 회차<40 이고                  │
   │             종가≤평단 → 1.0회 / 평단~+15% → 0.5회 │
   │             → 평단/수량/현금/회차 갱신             │
   │     ③ mark-to-market: (현금 + 보유주식 현재가치)   │
   │            을 그날 자산(equity)으로 기록            │
   └──────────────────────────┬───────────────────────┘
                              ▼
   eq_series(자산곡선) → 수익률·CAGR·MDD·Sharpe·Sortino 등 계산
                              │
                              ▼
        dict 로 묶어 반환 (stats · per_ticker · equity_curve · recent_trades)
                              │
              main.py 가 risk_metrics 붙여 → 백엔드 → 프론트

         ─────────────────────────────────────────────
         latest_order_plan(): 위 run_*() 을 재생해 "오늘 상태"를 얻고
                              → "내일 낼 BUY/SELL 주문서" 만 별도 산출
```

---

## 📖 라인별 해설

### A. 파일 설명서(docstring) — `L1-L15`

```python
# L1-L15
"""
무한매수법 (Infinite Buying Method) — 라오어식 분할매수 시뮬레이션.

핵심 규칙 (사용자 정의):
  - 원금 capital을 split(=40) 회차로 균등 분할 → daily_budget = capital / split
  - 매일 종가 기준으로:
      종가 <= 평단가          → daily_budget 전액으로 매수  (LOC 평단매수 1.0회)
      평단 < 종가 <= 평단*(1+loc_offset)  → daily_budget * 0.5 매수 (LOC 큰수매수 0.5회)
      그 외                    → 매수 없음
  - 보유 중 종가 >= 평단 * (1 + take_profit_pct/100)  → 전량 매도 + 사이클 리셋
  - 마지막 날 미청산 포지션은 mark-to-market
...
"""
```
- 파일 맨 위 **설명서(docstring)** — 실행되지 않고 사람이 읽는 용도. 무한매수법의 **모든 규칙이 여기에 글로 요약**돼 있습니다. 아래 코드는 이 글을 그대로 코드로 옮긴 것이니, 이 docstring 과 코드를 1:1로 대조하며 읽으면 이해가 빠릅니다.
- `L13` "단일 티커 + 멀티 티커 (자본을 티커 수로 균등 분할)" — 종목 1개든 여러 개든 동작하며, 여러 개면 원금을 **티커 수로 나눠** 각 종목에 배정합니다.
- `L14` "출력: vbt_engine.run_backtest 결과와 호환되는 dict" — 일부러 `vbt_engine` 과 **같은 모양의 결과 dict**(stats·equity_curve 등)를 냅니다. 그래야 프론트 Report 탭이 전략 종류와 무관하게 같은 코드로 화면을 그릴 수 있습니다.

```python
# L16-L21
from __future__ import annotations
from dataclasses import dataclass, field
from typing import Optional

import numpy as np
import pandas as pd
```
- `from __future__ import annotations` — 타입힌트를 늦게(문자열로) 평가하는 파이썬 주문. 초보는 "최신 타입표기를 쓰기 위한 한 줄" 정도로 넘기면 됩니다.
- `dataclass, field` — 설정/상태 묶음 클래스를 짧게 만드는 도구. `field` 는 아래 `trades: list` 처럼 **기본값이 리스트일 때** 꼭 필요합니다(이유는 `_AssetState` 에서 설명).
- `Optional` 은 import 했지만 이 파일에선 사실상 쓰이지 않습니다(타입 표기 정리용 잔재). **여기서 중요한 차이**: `vbt_engine` 과 달리 **`vectorbt` 를 import 하지 않습니다** — 매매를 직접 손으로 돌리기 때문입니다. 라이브러리는 `numpy`(숫자), `pandas`(표) 둘뿐.

---

### B. 전략 손잡이 `InfiniteBuyingParams` — `L24-L31`

```python
# L24-L31
@dataclass
class InfiniteBuyingParams:
    split: int = 40                  # 분할 횟수 (원금/40)
    take_profit_pct: float = 10.0    # 평단 대비 익절 트리거 (%)
    loc_offset_pct: float = 15.0     # 평단보다 비싸도 매수 허용 상한 (%)
    initial_capital: float = 10_000.0  # USD 기본값 (사용자가 KRW 환산 후 주입)
    fees: float = 0.0025  # 0.25% KIS 해외주식 실수수료
    slippage: float = 0.001  # 0.10% 슬리피지
```
- `@dataclass` 를 붙이면 이 클래스는 **"설정값 묶음 상자"** 가 됩니다. `InfiniteBuyingParams(split=20, take_profit_pct=12)` 처럼 일부만 바꿔 만들 수 있고, 안 적은 값은 `= 기본값` 이 자동 적용됩니다.
- 각 손잡이의 뜻:
  - `split=40` — 원금을 **40회차로 분할**. 1회차 예산 = 원금 ÷ 40. (40은 무한매수법의 관습적 분할수.)
  - `take_profit_pct=10.0` — 평단보다 **+10% 오르면 전량 익절**.
  - `loc_offset_pct=15.0` — "평단보다 비싸도 **+15%까지는 약하게(0.5회) 매수 허용**"하는 상한선.
  - `initial_capital=10_000.0` — 시작 원금. 주석대로 **USD 기본값**이며, 실제론 사용자가 원화를 환산해 주입합니다. (참고: `main.py` 의 요청 기본값은 `300_000_000.0` = 3억 원으로 다릅니다 — dataclass 기본값과 API 기본값이 별개임에 주의.)
  - `fees=0.0025` — 거래액의 **0.25% 수수료**(KIS 해외주식 실수수료).
  - `slippage=0.001` — **0.10% 슬리피지**(원하는 가격보다 불리하게 체결되는 정도).
- `vbt_engine` 의 `BacktestParams` 와 달리 `config.py` 상수를 import 하지 않고 **숫자를 직접 박아 둡니다**. 다만 값(`0.0025`, `0.001`)은 `config.py` 의 `DEFAULT_FEES`·`DEFAULT_SLIPPAGE` 와 동일하게 맞춰져 있습니다.

> 💡 초보 포인트: `10_000.0` 의 밑줄 `_` 는 **자릿수 구분 기호**(파이썬 문법). `10_000` = `10000`. 사람 눈에 읽기 쉬우라고 넣은 것일 뿐, 계산엔 영향 없습니다.

---

### C. 종목별 장부 `_AssetState` — `L34-L44` (이 파일의 심장)

```python
# L34-L44
@dataclass
class _AssetState:
    cash_alloc: float = 0.0          # 이 자산에 배정된 캐시 잔액
    qty: float = 0.0                 # 보유 수량
    cost_basis: float = 0.0          # 누적 매수 원가 (수수료 제외)
    avg_price: float = 0.0           # 평단가
    cycle_idx: int = 0               # 분할매수 회차 (split 도달 시 reset)
    cycle_budget: float = 0.0        # 현 사이클의 1회차 예산 (복리: 익절 후 재계산)
    realized_pnl: float = 0.0
    trades: list = field(default_factory=list)
    cycles_completed: int = 0
```
- 이 클래스는 **티커 1개의 "현재 상태(state)"를 담는 장부**입니다. 시뮬레이션이 하루씩 진행되며 이 값들이 계속 갱신됩니다. 무한매수법이 **상태기계(state machine)** 라는 본질이 여기 그대로 드러납니다.
- 각 칸의 의미:
  - `cash_alloc` — **이 종목에 배정된 현금 잔액**. 살 때 줄고, 익절하면 늘어남.
  - `qty` — **현재 보유 주식 수**. (소수점 가능 — 금액 기준 매수라 0.37주 같은 값이 나옴.)
  - `cost_basis` — **누적 매수 원가**(수수료 제외, 정확히는 수수료 뺀 실제 주식 매입에 들어간 금액의 합). 평단 계산과 실현손익 계산의 기준.
  - `avg_price` — **평단가** = `cost_basis ÷ qty`. 익절/매수 판단의 기준선.
  - `cycle_idx` — **현 사이클의 회차 누계**(0.5/1.0씩 증가). 40 도달 시 매수 중단, 익절 시 0으로 리셋.
  - `cycle_budget` — **현 사이클의 1회차 예산**. 처음엔 `현금/40`, 익절 후 복리로 커짐.
  - `realized_pnl` — **확정된(실현된) 손익** 누계. 익절할 때만 쌓임.
  - `trades` — 이 종목의 **모든 거래 기록 리스트**(매수/매도 한 건씩 dict 로).
  - `cycles_completed` — **완료한 사이클 수**(익절 횟수).
- 초기값이 전부 `0.0` 인데, 실제 사용 시작값(현금·1회차예산)은 아래 `run_infinite_buying` 에서 따로 채워 넣습니다.

> ⚠️ **`field(default_factory=list)` 가 핵심**: 파이썬에서 `trades: list = []` 처럼 **가변 기본값(리스트)을 직접** 쓰면, 모든 인스턴스가 **같은 리스트 하나를 공유**하는 악명 높은 버그가 납니다(TQQQ 거래가 SOXL 장부에 섞임). `default_factory=list` 는 "인스턴스마다 **새 빈 리스트**를 만들어라"는 뜻 — 이 버그를 막는 정석입니다. `cash_alloc=0.0` 같은 **숫자(불변값)** 는 공유돼도 안전해서 그냥 적어도 됩니다.

> 💡 클래스명 앞의 `_`(언더스코어): "이 파일 내부 전용, 밖에서 직접 쓰지 마세요"라는 파이썬 관습 표시.

---

### D. 안전한 반올림 헬퍼 `_round()` — `L47-L52`

```python
# L47-L52
def _round(x, n=4):
    try:
        v = float(x)
        return None if (np.isnan(v) or np.isinf(v)) else round(v, n)
    except Exception:
        return None
```
- 어떤 값이든 **float 로 바꿔 소수 `n`자리 반올림하되, NaN(숫자아님)/Inf(무한대)/변환실패면 `None`** 으로 돌려주는 작은 도구.
- **왜 필요한가?** 결과를 JSON 으로 프론트에 보내는데, JSON 표준에는 `NaN`·`Infinity` 가 없습니다. 그대로 보내면 파싱이 깨집니다. 미리 `None`(→ JSON `null`)으로 바꿔 안전하게 만듭니다.
- `vbt_engine.py` 의 `_f()` 와 **사실상 같은 함수**입니다(이름·기본 자릿수만 다름). 두 백테스트 엔진이 같은 안전 장치를 공유.
- `n=4` 가 기본이지만, 수량처럼 정밀해야 하는 값은 `_round(qty, 6)` 처럼 6자리로 호출합니다.

---

### E. 메인 백테스트 `run_infinite_buying()` — `L55-L249`

이 함수가 파일의 90%입니다. 머리부터 차근히 봅니다.

#### E-1. 함수 시그니처 + 입력 검증 — `L55-L65`
```python
# L55-L65
def run_infinite_buying(
    closes: dict[str, pd.Series],
    p: InfiniteBuyingParams,
) -> dict:
    """
    closes: {ticker: pd.Series of daily close prices (DatetimeIndex)}.
            여러 티커일 경우 union index로 정렬 + ffill.
    """
    tickers = list(closes.keys())
    if not tickers:
        raise ValueError("at least one ticker required")
```
- 입력 `closes` — **{티커 이름 → 날짜별 종가 Series}** 형태의 딕셔너리. (vbt_engine 은 종가 1줄만 받았지만, 여긴 여러 종목을 한 번에 받습니다.)
- `tickers = list(closes.keys())` — 종목 이름 목록을 뽑음(예: `["TQQQ","SOXL"]`).
- `if not tickers:` — **종목이 하나도 없으면 즉시 에러**. 빈 입력으로 뒤에서 0으로 나누는 사고를 미리 차단하는 **가드(guard)**.

#### E-2. 여러 티커를 한 표로 정렬 — `L67-L70`
```python
# L67-L70
    df = pd.concat(
        {t: closes[t] for t in tickers},
        axis=1,
    ).sort_index().ffill().dropna(how="all")
```
- `pd.concat({...}, axis=1)` — 티커별 종가 Series 들을 **열로 나란히 붙여 하나의 표(DataFrame)** 로. 열 이름이 곧 티커명.
- `.sort_index()` — 날짜 순으로 정렬(혹시 뒤죽박죽 들어와도 시간순 보장).
- `.ffill()` — 빈칸을 직전 값으로 채움. **티커마다 휴장일이 달라** 생기는 구멍을 메움(예: TQQQ는 거래했는데 그날 SOXL 데이터가 비면 전날값 사용).
- `.dropna(how="all")` — **모든 열이 비어있는 행만** 삭제. 한 종목이라도 값이 있으면 그 날짜는 남깁니다. (`how="all"` 이 핵심 — `"any"` 였다면 한 종목만 비어도 그 날 전체가 날아감.)

```
입력 (티커별 Series):           concat 후 표(df):
TQQQ: 1/2→50, 1/3→52            날짜    TQQQ  SOXL
SOXL: 1/2→30,      1/4→33        1/2     50    30
                                 1/3     52    30(ffill)
                                 1/4     52    33
```

#### E-3. 종목별 자본·장부 초기화 — `L72-L78`
```python
# L72-L78
    per_asset_capital = p.initial_capital / len(tickers)
    states: dict[str, _AssetState] = {
        t: _AssetState(cash_alloc=per_asset_capital, cycle_budget=per_asset_capital / p.split)
        for t in tickers
    }

    equity_history: list[tuple[pd.Timestamp, float]] = []
```
- `per_asset_capital` — **원금을 티커 수로 균등 분할**. 2종목·원금 1만이면 각 5천씩.
- `states` — 티커마다 `_AssetState` 장부를 1권씩 만들어 딕셔너리에 담음.
  - 시작 `cash_alloc = 5천`(그 종목 배정 현금),
  - 시작 `cycle_budget = 5천 ÷ 40 = 125`(1회차 매수 예산).
- `equity_history` — 매일의 `(날짜, 총자산)` 을 쌓아 둘 빈 리스트. 나중에 자산곡선이 됩니다.

#### E-4. 핵심 루프: 하루씩 시뮬레이션 — `L80-L86`
```python
# L80-L86
    for ts, row in df.iterrows():
        for t in tickers:
            price = row.get(t)
            if price is None or pd.isna(price) or price <= 0:
                continue
            s = states[t]
            budget = s.cycle_budget
```
- `for ts, row in df.iterrows():` — **표를 하루(한 행)씩** 순회. `ts` = 그날 날짜, `row` = 그날 티커별 종가.
- 안쪽 `for t in tickers:` — 그날, **각 종목마다** 따로 판단(종목별 장부가 독립).
- `price = row.get(t)` — 그 종목의 오늘 종가.
- `if price is None or pd.isna(price) or price <= 0: continue` — 값이 없거나(None/NaN) 0 이하면 **그 종목은 오늘 건너뜀**. (데이터 구멍·이상치 방어. `continue` = 다음 종목으로.)
- `s = states[t]` — 이 종목의 장부를 꺼냄. `budget = s.cycle_budget` — 이번 1회차 매수 예산을 변수로.

#### E-5. ① 익절(전량 매도) 판단 — `L88-L111`
```python
# L88-L111
            # 1) 익절 체크 (보유 중이고 평단 대비 +take_profit_pct 이상)
            if s.qty > 0 and s.avg_price > 0:
                trigger = s.avg_price * (1.0 + p.take_profit_pct / 100.0)
                if price >= trigger:
                    sell_price = price * (1.0 - p.slippage)
                    proceeds = s.qty * sell_price
                    fee = proceeds * p.fees
                    net = proceeds - fee
                    s.realized_pnl += net - s.cost_basis
                    s.cash_alloc += net
                    s.trades.append({
                        "date": str(ts.date()), "ticker": t, "side": "SELL",
                        "price": _round(sell_price), "qty": _round(s.qty, 6),
                        "amount": _round(net), "reason": "take_profit",
                    })
                    s.qty = 0.0
                    s.cost_basis = 0.0
                    s.avg_price = 0.0
                    s.cycle_idx = 0
                    s.cycles_completed += 1
                    # 복리: 익절 후 남은 현금 기준으로 1회차 예산 재계산
                    s.cycle_budget = s.cash_alloc / p.split if s.cash_alloc > 0 else s.cycle_budget
                    # 익절 후 사이클 리셋 → 같은 날 추가 매수 없이 다음 날부터 신규 사이클
                    continue
```
- **순서가 중요**: 매수보다 **익절을 먼저** 검사합니다. "오늘 충분히 올랐으면 일단 팔고 끝"이 우선.
- `if s.qty > 0 and s.avg_price > 0:` — **보유 중일 때만** 익절 가능(가진 게 없으면 팔 수 없음).
- `trigger = 평단 × (1 + 10/100)` = **평단 +10% 가격**. `if price >= trigger:` — 오늘 종가가 이 선을 넘으면 익절 발동.
- 매도 정산(현실적 비용 반영):
  - `sell_price = price × (1 - slippage)` — 슬리피지만큼 **불리하게** 팔림(0.1% 싸게).
  - `proceeds = 수량 × 매도가` — 매도 총액(수수료 전).
  - `fee = proceeds × fees` — 매도 수수료(0.25%).
  - `net = proceeds - fee` — **수수료 뗀 실수령액**.
- 장부 갱신:
  - `realized_pnl += net - cost_basis` — **실현손익 = 실수령액 − 누적원가**. (얼마 벌었나 확정.)
  - `cash_alloc += net` — 받은 현금을 잔액에 더함.
  - `trades.append({...})` — **매도 거래 1건 기록**(날짜·종목·SELL·가격·수량·금액·사유 `take_profit`).
  - 이어서 `qty/cost_basis/avg_price/cycle_idx` 를 **0으로 리셋** = 포지션 청산·새 사이클 준비.
  - `cycles_completed += 1` — 사이클 1회 완료.
- **복리 재계산**: `cycle_budget = cash_alloc / split` — 익절로 불어난 현금을 다시 40으로 나눠 **다음 1회차 예산을 키움**(`cash_alloc > 0` 일 때만; 아니면 기존 유지). 벌수록 다음 매수 단위가 커지는 무한매수법 특유의 복리 구조.
- `continue` — **익절한 날엔 그 종목 추가 매수를 하지 않음**. 주석대로 "다음 날부터 신규 사이클". (같은 날 팔고 바로 또 사는 비현실적 동작 방지.)

> 💡 미니 예시: 평단 100, 보유 10주, 종가 112. trigger=110 → 112≥110 발동. slippage 0.1%면 sell_price=111.888, proceeds=1118.88, fee=2.80 → net≈1116.08. cost_basis 가 1000이었다면 realized_pnl += 116.08.

#### E-6. ② 매수 결정 — 회차 한도 검사 — `L113-L116`
```python
# L113-L116
            # 2) 매수 결정
            if s.cycle_idx >= p.split:
                # 분할 한도 도달 + 미익절 → 추가 매수 중지 (자본 보존)
                continue
```
- `cycle_idx` 가 40 이상이면 **이번 사이클의 분할 한도를 다 썼다**는 뜻 → 더 사지 않고 종목 건너뜀.
- 무한매수법의 **안전장치**: 끝없이 물타기하다 파산하는 걸 막음("자본 보존"). 익절(평단 +10%)이 나오기 전까진 40회까지만.

#### E-7. ② 매수 결정 — 매수 강도(1.0회/0.5회) — `L118-L133`
```python
# L118-L133
            buy_fraction = 0.0
            reason = ""
            if s.avg_price <= 0 or price <= s.avg_price:
                buy_fraction = 1.0
                reason = "loc_avg" if s.avg_price > 0 else "init_buy"
            elif price <= s.avg_price * (1.0 + p.loc_offset_pct / 100.0):
                buy_fraction = 0.5
                reason = "loc_large"
            else:
                continue

            amount = budget * buy_fraction
            if amount > s.cash_alloc:
                amount = s.cash_alloc
            if amount <= 0:
                continue
```
- `buy_fraction` = 오늘 **예산의 몇 배를 살지**(1.0 또는 0.5).
- 3갈래 판단(docstring 규칙 그대로):
  - `if avg_price <= 0 or price <= avg_price:` → **첫 매수이거나(아직 평단 없음) 종가가 평단 이하** → **풀매수(1.0회)**.
    - `reason = "loc_avg" if avg_price>0 else "init_buy"` — 사유 라벨: 평단이 있으면 "평단매수(loc_avg)", 첫 진입이면 "초기매수(init_buy)".
  - `elif price <= avg_price × (1+15/100):` → **평단보다 비싸지만 +15% 이내** → **반매수(0.5회)**, 사유 "loc_large"(큰수매수).
  - `else: continue` → **+15% 초과로 너무 비쌈** → 오늘은 매수 안 함.
- 금액 보정:
  - `amount = budget × buy_fraction` — 실제 투입 금액(예: 예산 125 × 1.0 = 125, 또는 ×0.5 = 62.5).
  - `if amount > cash_alloc: amount = cash_alloc` — **남은 현금보다 많이 못 삼** → 현금 한도로 잘라냄(빚내서 사는 일 방지).
  - `if amount <= 0: continue` — 현금이 바닥이면 매수 불가, 건너뜀.

#### E-8. ② 매수 체결 + 평단 갱신 — `L135-L154`
```python
# L135-L154
            buy_price = price * (1.0 + p.slippage)
            fee = amount * p.fees
            qty_bought = (amount - fee) / buy_price
            if qty_bought <= 0:
                continue

            new_cost = s.cost_basis + (amount - fee)
            new_qty = s.qty + qty_bought
            s.avg_price = new_cost / new_qty if new_qty > 0 else 0.0
            s.qty = new_qty
            s.cost_basis = new_cost
            s.cash_alloc -= amount
            s.cycle_idx += buy_fraction  # 0.5 또는 1.0
            s.trades.append({
                "date": str(ts.date()), "ticker": t, "side": "BUY",
                "price": _round(buy_price), "qty": _round(qty_bought, 6),
                "amount": _round(amount), "reason": reason,
                "avg_price_after": _round(s.avg_price),
                "cycle": _round(s.cycle_idx, 2),
            })
```
- 매수 체결(비용 반영):
  - `buy_price = price × (1 + slippage)` — 슬리피지만큼 **비싸게** 사짐(0.1% 더 줌).
  - `fee = amount × fees` — 매수 수수료(0.25%).
  - `qty_bought = (amount - fee) / buy_price` — **수수료 떼고 남은 돈으로 산 주식 수**. (소수 주식 가능.)
  - `if qty_bought <= 0: continue` — 살 수 있는 게 없으면 건너뜀.
- 평단/장부 갱신:
  - `new_cost = cost_basis + (amount - fee)` — **누적 원가에 이번 실매입액(수수료 제외)을 더함**.
  - `new_qty = qty + qty_bought` — 보유 수량 증가.
  - `avg_price = new_cost / new_qty` — **평단 = 누적원가 ÷ 총수량** 으로 다시 계산. (떨어질 때 사면 평단이 내려가는 "물타기"가 여기서 자동으로 일어남.)
  - `cash_alloc -= amount` — 현금에서 투입액 차감.
  - `cycle_idx += buy_fraction` — **회차를 0.5 또는 1.0 만큼 증가**. 풀매수면 1.0, 반매수면 0.5씩 쌓여 40에 도달.
- `trades.append({...})` — **매수 거래 1건 기록**(BUY·체결가·수량·금액·사유 + `avg_price_after`(매수 후 평단), `cycle`(현 회차 누계)).

> 💡 미니 예시(물타기): 평단 100·10주(원가 1000) 보유 중 종가 80 → 80≤100 이라 풀매수(1.0회). 예산 125, fee=0.31, buy_price=80.08 → qty_bought≈(125-0.31)/80.08≈1.557주. new_cost=1000+124.69=1124.69, new_qty=11.557 → **avg_price≈97.3** (평단 100→97.3 으로 내려감!).

#### E-9. ③ 매일 mark-to-market(자산 평가) — `L156-L162`
```python
# L156-L162
        # mark-to-market
        total_eq = 0.0
        for t in tickers:
            s = states[t]
            mv = s.qty * float(row.get(t, s.avg_price or 0))
            total_eq += s.cash_alloc + mv
        equity_history.append((ts, total_eq))
```
- **들여쓰기 주의**: 이 블록은 안쪽 `for t` 가 아니라 **바깥 `for ts`(하루) 루프 안**에 있습니다 → 종목 판단을 다 끝낸 뒤 **하루에 한 번** 총자산을 집계.
- `mv = qty × 오늘종가` — 보유 주식의 **시가 평가액**(mark-to-market). `row.get(t, s.avg_price or 0)` — 오늘 종가가 없으면 평단(없으면 0)으로 대체(데이터 구멍 방어).
- `total_eq += cash_alloc + mv` — **그 종목의 (현금 + 주식가치)** 를 전부 합산 = 그날 총자산.
- `equity_history.append((ts, total_eq))` — **(날짜, 총자산)** 을 자산곡선 재료로 저장. 마지막 날 미청산 포지션도 이렇게 시가 평가되어 docstring 의 "마지막 날 mark-to-market" 이 자동 충족됩니다.

#### E-10. 자산곡선 → 성과지표 계산 — `L164-L181`
```python
# L164-L181
    eq_series = pd.Series([v for _, v in equity_history],
                          index=[d for d, _ in equity_history])
    daily_ret = eq_series.pct_change().fillna(0.0)

    total_return_pct = (eq_series.iloc[-1] / p.initial_capital - 1.0) * 100.0
    days = (eq_series.index[-1] - eq_series.index[0]).days or 1
    years = days / 365.25
    cagr_pct = (((eq_series.iloc[-1] / p.initial_capital) ** (1.0 / years) - 1.0) * 100.0
                if years > 0 and eq_series.iloc[-1] > 0 else 0.0)
    roll_max = eq_series.cummax()
    mdd_pct = ((eq_series / roll_max) - 1.0).min() * 100.0
    vol_annual = daily_ret.std() * np.sqrt(252) * 100.0
    sharpe = (daily_ret.mean() / daily_ret.std() * np.sqrt(252)
              if daily_ret.std() > 0 else 0.0)
    downside = daily_ret[daily_ret < 0].std()
    sortino = (daily_ret.mean() / downside * np.sqrt(252)
               if downside and downside > 0 else 0.0)
    win_rate = (daily_ret > 0).sum() / max(1, (daily_ret != 0).sum()) * 100.0
```
- `eq_series` — 쌓아둔 (날짜, 자산)을 **pandas Series(자산곡선)** 로 변환.
- `daily_ret = eq_series.pct_change().fillna(0.0)` — **일별 수익률**. 첫날은 전날이 없어 NaN → 0 으로 채움.
- 지표들(전부 vbt_engine 과 같은 개념이지만 **여기선 vectorbt 없이 손으로 계산**):
  - `total_return_pct` — **총수익률** = (마지막 자산 / 원금 − 1) × 100.
  - `days` — 첫날~마지막날 **달력 일수**(`.days`). `or 1` 은 같은 날일 때 0으로 나누기 방지.
  - `years = days / 365.25` — 연수(0.25는 윤년 보정).
  - `cagr_pct` — **연환산수익(CAGR)** = (최종/원금)^(1/연수) − 1. 복리 기준 1년당 평균 수익률. 음수자산 등 비정상이면 0.
  - `roll_max = eq_series.cummax()` — **자산곡선의 역대 최고점**(매 시점까지의 최댓값).
  - `mdd_pct` — **최대낙폭(MDD)** = (현재/역대최고 − 1) 의 최솟값. "고점 대비 가장 크게 빠진 정도"(음수).
  - `vol_annual` — **연환산 변동성** = 일수익률 표준편차 × √252 × 100. (252 = 1년 거래일.)
  - `sharpe` — **샤프지수** = 평균수익 / 변동성 × √252. 위험 1 단위당 수익. 표준편차 0이면 0.
  - `downside / sortino` — **소르티노**는 분모를 "**하락(음수) 수익률의 변동성**"만 씀(상승 변동은 위험 아님). `downside` 가 없거나 0이면 0.
  - `win_rate` — **승률** = 오른 날 수 ÷ 움직인 날 수 × 100. `max(1, ...)` 로 0으로 나누기 방지. (※ 거래 단위가 아니라 **일 단위 승률**임에 주의.)

#### E-11. 거래·사이클·현금흐름 집계 — `L183-L189`
```python
# L183-L189
    total_trades = sum(len(s.trades) for s in states.values())
    completed_cycles = sum(s.cycles_completed for s in states.values())

    # 월 평균 실현 수익 (대시보드용 현금흐름 근사)
    realized_total = sum(s.realized_pnl for s in states.values())
    months = max(1.0, days / 30.4375)
    monthly_cashflow = realized_total / months
```
- `total_trades` — **모든 종목 거래 건수 합**.
- `completed_cycles` — 모든 종목의 **완료 사이클(익절 횟수) 합**.
- `realized_total` — 모든 종목의 **실현손익 합**.
- `months = days / 30.4375` — 기간을 개월로(30.4375 = 365.25/12, 한 달 평균 일수). `max(1.0, …)` 로 0개월 방지.
- `monthly_cashflow = 실현손익 / 개월수` — **월평균 실현 현금흐름**(대시보드용 근사). 주의: **미실현(보유 중) 평가이익은 제외**하고 실제 익절로 확정된 것만 셈.

#### E-12. 자산곡선 다운샘플링 — `L191-L196`
```python
# L191-L196
    # equity_curve downsample
    step = max(1, len(eq_series) // 365)
    eq_points = [
        {"date": str(d.date()), "value": _round(v)}
        for d, v in eq_series.iloc[::step].items()
    ]
```
- `step = len / 365` — 예를 들어 5년치(약 1250일)면 step≈3 → **3일마다 1점**만 추림.
- `eq_series.iloc[::step]` — **다운샘플링**: 너무 촘촘한 자산곡선을 약 365점으로 솎아 전송량을 줄임(차트는 어차피 촘촘히 못 보임). `max(1, …)` 로 step 최소 1 보장.
- 결과는 `[{date, value}]` 리스트 → 프론트 차트의 자산곡선 선.

#### E-13. 최근 거래 50건 추리기 — `L198-L203`
```python
# L198-L203
    # 최근 거래 50건만
    all_trades = []
    for s in states.values():
        all_trades.extend(s.trades)
    all_trades.sort(key=lambda x: x["date"])
    recent_trades = all_trades[-50:]
```
- 모든 종목 거래를 한 리스트로 모음(`extend`).
- `.sort(key=lambda x: x["date"])` — **날짜순 정렬**. (주의: 문자열 날짜 `"2024-01-02"` 의 사전식 정렬인데, `YYYY-MM-DD` 형식이라 우연히 시간순과 일치 — ISO 날짜의 장점.)
- `all_trades[-50:]` — **가장 최근 50건만** 잘라 응답. 거래가 수천 건이어도 화면엔 최근 것만.

#### E-14. 종목별 요약 — `L205-L216`
```python
# L205-L216
    per_ticker_summary = {
        t: {
            "qty_open": _round(states[t].qty, 6),
            "avg_price": _round(states[t].avg_price),
            "cash_remaining": _round(states[t].cash_alloc),
            "cycles_completed": states[t].cycles_completed,
            "current_cycle_idx": _round(states[t].cycle_idx, 2),
            "realized_pnl": _round(states[t].realized_pnl),
            "trade_count": len(states[t].trades),
        }
        for t in tickers
    }
```
- 각 종목의 **마지막 상태 스냅샷**: 미청산 수량·평단·남은 현금·완료 사이클·현재 회차·실현손익·거래수.
- 이 요약이 `latest_order_plan` 에서 "지금 상태"로 재활용됩니다(아래 F 참조).

#### E-15. 최종 결과 dict 반환 — `L218-L249`
```python
# L218-L249 (요약)
    return {
        "strategy": "infinite_buying",
        "tickers": tickers,
        "params": { split, take_profit_pct, loc_offset_pct, initial_capital, fees, slippage },
        "stats": {
            "total_return_pct", "annualized_return_pct", "max_drawdown_pct",
            "sharpe", "sortino", "win_rate_pct", "volatility_pct",
            "trades", "cycles_completed", "start", "end",
            "final_equity", "realized_pnl_total", "estimated_monthly_cashflow",
        },
        "per_ticker": per_ticker_summary,
        "equity_curve": eq_points,
        "recent_trades": recent_trades,
        "_strategy_returns": daily_ret,  # internal for QuantStats
    }
```
- **`stats` 묶음이 곧 프론트 Report 탭의 카드들**입니다. `vbt_engine` 의 stats 와 키 이름을 맞춰(total_return_pct·sharpe 등) 화면 코드 재사용을 가능케 하고, 무한매수법 고유 지표(`cycles_completed`·`final_equity`·`realized_pnl_total`·`estimated_monthly_cashflow`·`volatility_pct`)를 더 얹었습니다.
- `params` 를 같이 돌려주는 이유: **"어떤 설정으로 낸 결과인지" 기록**(재현성).
- `per_ticker` — 종목별 현재 상태, `equity_curve` — 자산곡선, `recent_trades` — 최근 거래 50건.
- `_strategy_returns` — 앞 `_`는 "내부용". 이 일별수익률을 **`main.py` 가 꺼내(`result.pop`) QuantStats(`compute_metrics`)에 넘겨** `risk_metrics` 를 따로 계산해 붙입니다(`main.py:344-346`). JSON 직렬화 대상이 아니라 파이썬 객체째 전달되므로, main.py 가 응답 전에 `pop` 으로 떼어냅니다.

---

### F. 내일의 주문 계획 `latest_order_plan()` — `L252-L294`

```python
# L252-L260
def latest_order_plan(
    closes: dict[str, pd.Series],
    p: InfiniteBuyingParams,
) -> dict:
    """
    Replay full history to get current state, then compute next-day order plan.
    Used by /alpha/.../queue-orders to push BUY/SELL recommendations into mock queue.
    """
    result = run_infinite_buying(closes, p)
    last_date = result["stats"]["end"]
    plans = []
```
- 목적: **"지금 당장 무한매수법 봇은 내일 무슨 주문을 낼까"** 를 계산. (백테스트가 "과거 성적"이라면, 이건 "내일 행동 지시서".)
- 트릭: 새 로직을 또 짜지 않고 **`run_infinite_buying` 을 그대로 재생**해 과거→현재 상태를 만든 뒤, 그 마지막 상태(`per_ticker`)로 다음 행동만 계산. **단일 진실 공급원(single source of truth)** 패턴 — 백테스트와 실주문 계획이 항상 같은 규칙을 쓰게 보장.
- `last_date = result["stats"]["end"]` — 데이터의 마지막 날짜(주문 기준일).

```python
# L262-L281
    for t, summary in result["per_ticker"].items():
        last_close = float(closes[t].iloc[-1])
        avg = summary["avg_price"] or 0.0
        qty = summary["qty_open"] or 0.0
        budget = (p.initial_capital / len(closes)) / p.split
        side = None
        reason = ""
        price = last_close
        amount = 0.0

        if qty > 0 and avg > 0 and last_close >= avg * (1 + p.take_profit_pct / 100):
            side, reason = "SELL", "take_profit"
            amount = qty * last_close
        elif avg <= 0 or last_close <= avg:
            side, reason = "BUY", "loc_avg"
            amount = budget
        elif last_close <= avg * (1 + p.loc_offset_pct / 100):
            side, reason = "BUY", "loc_large"
            amount = budget * 0.5
```
- 종목별로 **현재 상태(summary)** 를 꺼냄: 마지막 종가·평단·보유수량.
- `or 0.0` — `_round` 가 `None` 을 줄 수 있어(NaN/Inf 였던 경우) None→0 으로 안전 처리.
- `budget` — 여기선 **단순 초기 1회차 예산**(원금/티커수/40). ⚠️ 주의: `run_infinite_buying` 본체의 복리 갱신된 `cycle_budget` 과 달리, 여기 plan 은 **복리 반영 없이 초기 예산을 재계산**합니다(미세한 불일치 가능 — 고도화 항목 참조).
- **판단 규칙은 본체 E-5/E-7 과 동일한 3갈래**:
  - 보유 중 + 평단 +10% 이상 → **SELL(take_profit)**, 금액 = 전량 평가액.
  - 첫 진입(평단 없음) or 종가 ≤ 평단 → **BUY 풀(loc_avg)**, 금액 = 예산.
  - 종가가 평단 +15% 이내 → **BUY 반(loc_large)**, 금액 = 예산 × 0.5.
  - (셋 다 아니면 `side` 가 `None` 으로 남아 주문 없음.)

```python
# L283-L294
        if side:
            plans.append({
                "ticker": t,
                "side": side,
                "order_type": "LOC",
                "price": _round(price),
                "amount": _round(amount),
                "qty": _round(amount / price if price > 0 else 0, 6) if side == "BUY" else _round(qty, 6),
                "reason": reason,
                "scheduled_for": last_date,
            })
    return {"as_of": last_date, "plans": plans, "summary": result["per_ticker"]}
```
- `if side:` — 주문할 게 있을 때만 계획에 추가(`None` 이면 건너뜀).
- 각 주문서 항목: 종목·매수/매도·**`order_type="LOC"`**(종가 지정가)·가격·금액·수량·사유·예정일.
  - 수량 계산이 매수/매도가 다름: **BUY** 면 `금액 ÷ 가격`(살 주식 수), **SELL** 이면 `qty`(보유 전량).
- 반환: `as_of`(기준일) + `plans`(주문 리스트) + `summary`(종목별 현재 상태). 이걸 백엔드 큐가 받아 모의 주문으로 적재합니다.

---

## ⚠️ 함정·버그 주의 (코드에 박힌 교훈 모음)

1. **가변 기본값 함정** — `_AssetState.trades` 는 `field(default_factory=list)` 로 만들어야 인스턴스마다 **새 리스트**가 생깁니다. `= []` 로 했다면 모든 종목이 한 리스트를 공유해 거래가 뒤섞이는 치명적 버그.
2. **NaN/Inf 직렬화** — JSON 에 `NaN`·`Infinity` 못 넣음. 모든 숫자를 `_round()`(→ None)로 감싸 출력.
3. **0으로 나누기 방어 다수** — `days or 1`, `max(1, ...)`, `max(1.0, ...)`, `if std > 0`, `if new_qty > 0` 등 곳곳에 가드가 깔려 있음. 데이터가 1줄뿐이거나 변동이 없을 때 크래시 방지.
4. **현금 한도 클램프** — 매수액이 남은 현금을 넘으면 `amount = cash_alloc` 로 잘라 **빚내서 매수**(음수 현금)를 차단.
5. **익절 당일 추가매수 금지** — 익절 후 `continue` 로 그날은 사지 않음. 같은 날 팔고 또 사는 비현실 동작 방지.
6. **승률은 "거래 승률"이 아니라 "일 승률"** — `win_rate_pct` 는 오른 날 비율이지, 익절 성공 비율이 아님. 강의/해석 시 혼동 주의.
7. **`monthly_cashflow` 는 실현분만** — 보유 중 평가이익은 빠짐. 대시보드 "월 현금흐름 근사"로만 해석.
8. **look-ahead 관점**: 종가로 판단해 **같은 날 종가에 LOC 체결**한다고 가정. vbt_engine 처럼 1bar shift 를 하지 않지만, 무한매수법은 원래 "종가 LOC 주문"이 정의라 의도된 모델링. 다만 "오늘 종가를 보고 오늘 종가에 산다"는 점은 현실에선 마감 직전 추정이 필요함을 인지해야 함.
9. **`latest_order_plan` 의 budget 불일치** — 본체는 복리 `cycle_budget` 을, plan 은 초기 예산을 써서 익절 후 금액이 살짝 다를 수 있음(아래 고도화 참조).
10. **`InfiniteBuyingParams.initial_capital` 기본값(1만) ≠ API 기본값(3억)** — dataclass 기본과 `main.py` 요청 기본이 별개. 실제 값은 항상 요청에서 주입됨.

---

## 🚀 고도화 아이디어 (강의·개선 버전용)

- **plan 예산 정합성**: `latest_order_plan` 이 본체의 복리 `cycle_budget` 을 그대로 쓰도록 `run_infinite_buying` 이 `per_ticker` 에 `cycle_budget` 을 함께 반환 → 익절 후 매수 금액 불일치 제거.
- **체결 시점 분리(현실성)**: "오늘 종가 판단 → **다음 날 시가** 체결" 모델 옵션 추가. 실제 LOC 가 안 잡힐 때(상한가 등) 대비.
- **분할 한도 후 전략**: 40회 소진 후 평단 회복까지 무한 대기 외에, "쿼터 매도/평단 점프(라오어 V2)·강제 손절" 같은 변형 규칙을 파라미터로.
- **종목 간 자본 재분배**: 지금은 종목별 현금이 칸막이(독립). 한 종목 익절 현금을 다른 종목에 빌려주는 풀링(pooling) 옵션.
- **세금·환율**: 해외주식 양도세·배당·USD/KRW 환율 변동을 비용에 반영하면 실거래에 더 근접.
- **거래 단위 승률**: 일 승률 대신 "사이클(익절)당 손익/성공률"을 별도 지표로 → 무한매수법 평가에 더 적합.
- **벤치마크 비교**: 같은 종목 buy_and_hold 대비 초과수익(alpha)을 stats 에 추가해 "무한매수법이 그냥 들고 있는 것보다 나은가" 즉답.
- **부분 익절(쿼터 매도)**: 전량 매도 대신 일정 비율만 익절해 추세를 더 타는 변형.
- **QuantStats 통합 확인**: `_strategy_returns` 가 이미 main.py 에서 `compute_metrics` 로 흘러가니, Tearsheet HTML 도 동일 파이프라인으로 연결.

---

## 📚 용어 사전 (이 파일 한정)

| 용어 | 뜻 |
|---|---|
| 무한매수법 | 원금을 분할해 매일 매수, 평단 +N% 익절 후 리셋을 반복하는 라오어식 분할매수 전략 |
| 평단가(avg_price) | 누적 매입원가 ÷ 보유수량. 떨어질 때 사면 내려감("물타기") |
| `split` (분할수) | 원금을 몇 회차로 나눌지(기본 40). 1회차 예산 = 자본/split |
| `cycle_idx` (회차) | 현 사이클에서 소진한 매수 회차(1.0/0.5씩 누적). split 도달 시 매수 중단 |
| 사이클(cycle) | 분할매수 시작 → 익절 → 리셋 한 바퀴. 익절마다 `cycles_completed` 증가 |
| LOC 매수 1.0회/0.5회 | 종가≤평단=풀매수(1.0회) / 평단~+15%=반매수(0.5회) |
| `take_profit_pct` | 평단 대비 익절 발동 % (기본 10%) |
| `loc_offset_pct` | 평단보다 비싸도 매수 허용하는 상한 % (기본 15%) |
| 복리 예산 | 익절 후 불어난 현금을 다시 split 으로 나눠 1회차 예산을 키움 |
| mark-to-market | 미청산 보유분을 매일 현재가로 평가해 자산곡선에 반영 |
| `_AssetState` | 티커 1개의 현재 상태(현금·수량·평단·회차) 장부 dataclass |
| `field(default_factory=list)` | 인스턴스마다 새 리스트를 만들게 하는 안전한 가변 기본값 |
| `cost_basis` | 누적 매수 원가(수수료 제외). 평단·실현손익의 기준 |
| `realized_pnl` | 실현(확정)손익. 익절 시에만 누적 |
| CAGR | 연환산 복리수익률 = (최종/원금)^(1/연수) − 1 |
| MDD | 최대낙폭 = (자산/역대최고 − 1)의 최솟값 |
| Sharpe / Sortino | 위험 대비 수익(분모: 전체변동성 / 하락변동성) |
| `ffill()` | 빈칸을 직전 값으로 채우기(휴장일 구멍 메우기) |
| 다운샘플링 | 촘촘한 자산곡선을 일정 간격으로 솎아 전송량 축소(약 365점) |
| `_strategy_returns` | 내부 전달용 일별 수익률. main.py 가 QuantStats(compute_metrics)에 넘김 |
