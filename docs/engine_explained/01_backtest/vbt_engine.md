# `backtest/vbt_engine.py` — 백테스트 엔진의 심장 (완전 라인별 해설)

> 원본: `analytics/app/backtest/vbt_engine.py` (214줄)
> 이 문서는 **교재 표준 예시**입니다. 다른 모듈 문서도 이 형식을 따릅니다.

---

## 📌 이 파일 한눈에

이 파일은 **"전략 시뮬레이터"** 입니다. 종가(price) 한 줄을 받아서, **6가지 투자 전략 중 하나의 규칙대로 과거에 사고팔았다면 결과가 어땠을지**를 계산해 돌려줍니다.

핵심 함수는 딱 3개입니다:

| 함수 | 한 줄 역할 | 비유 |
|---|---|---|
| `_signals(...)` | 가격 → "언제 사고(entries) 언제 팔지(exits)" 신호표 생성 | 요리 레시피를 "이 단계에서 불 켜기/끄기"로 변환 |
| `run_backtest(...)` | 그 신호로 가상 매매 → 수익률·MDD·Sharpe 등 성적표 + 자산곡선 | 레시피대로 실제 요리해서 맛 평가 |
| `latest_signal(...)` | 오늘 당장 BUY/SELL/HOLD 중 뭘 할지 | 지금 이 순간 불을 켤지 끌지 |

**누가 호출하나?** → `app/main.py` 의 `/backtest`, `/signals/today` 엔드포인트가 이 함수들을 부릅니다. 즉 백엔드(Spring)가 "이 종목, 이 전략으로 백테스트"를 요청하면 결국 이 파일이 일합니다.

**왜 vectorbt 인가?** → 백테스트를 `for` 루프로 하루하루 돌리면 느립니다. `vectorbt` 는 전체 기간을 한 번에 **벡터 연산**으로 처리해 매우 빠릅니다. (비유: 1000명에게 도장을 하나씩 찍는 대신, 도장판으로 한 번에 찍기.)

---

## 🧠 사전 지식 (이거 모르면 막힘)

#### 1) `pandas Series` = "[날짜 → 값] 한 줄짜리 표"
```
날짜          값
2024-01-02  100.0
2024-01-03  101.5
2024-01-04   99.8
```
- `close` 는 **날짜별 종가** Series 입니다. `close.iloc[0]` = 첫날 값, `close.iloc[-1]` = 마지막날 값, `close.index` = 날짜들.

#### 2) `boolean Series` = "날짜별 예/아니오 표"
```
날짜          매수신호?
2024-01-02  False
2024-01-03  True   ← 이날 사라
2024-01-04  False
```
- `entries`(매수 신호), `exits`(매도 신호)가 바로 이것. 같은 날짜축(index)을 공유합니다.

#### 3) `crossed_above` / `crossed_below` = "선이 다른 선을 뚫고 올라감/내려감"
- 두 선이 있을 때, **어제는 아래였는데 오늘 위로 올라온 그 순간**만 True. (계속 위에 있는 동안은 False — "교차하는 순간"만 잡음.)
- 비유: 키 재기. 동생이 형 키를 **추월하는 그 생일**에만 표시.

#### 4) Look-ahead bias(미래 참조) — 백테스트 최대 반칙
- "오늘 종가"를 보고 "오늘 산다"고 하면, 현실에선 **종가는 장 마감 후에야 아는 값**이라 불가능. 이걸 그대로 두면 백테스트 성적이 가짜로 좋아집니다.
- 해결: 신호를 **하루 미룬다(shift)**. "오늘 신호 → 내일 시가/종가에 매매".

#### 5) 거래 비용 — `fees`(수수료) + `slippage`(체결오차)
- `fees=0.0025` = 거래액의 0.25%를 수수료로 뗌. `slippage=0.001` = 원하는 가격보다 0.1% 불리하게 체결된다고 가정. **둘을 빼야 현실적인 성적**이 나옵니다.

---

## 🗺 전체 흐름도

```
            close (날짜별 종가 Series)
                     │
                     ▼
            ┌──────────────────┐
            │   _signals()      │  전략 규칙 적용
            └──────────────────┘
                     │  (entries, exits)  ← 날짜별 True/False 2장
                     ▼
        fshift(1): 신호를 하루 미룸 (look-ahead 방지)  ⚠️핵심
                     │
                     ▼
        vbt.Portfolio.from_signals(close, entries, exits, 비용...)
                     │  가상 매매 실행
        ┌────────────┼─────────────┐
        ▼            ▼             ▼
   pf.stats()   pf.value()   pf.returns()
   (성적표)     (자산곡선)    (일별 수익률)
        │            │             │
        └──────── dict 로 묶어 반환 ─┘ → main.py → 백엔드 → 프론트 차트
```

---

## 📖 라인별 해설

### A. 파일 설명서(docstring) + import — `L1-L19`

```python
# L1-L10
"""
vectorbt-based backtest engine.
Strategies (6 deterministic templates):
- buy_and_hold:   첫날 매수, 마지막 날까지 보유
- sma_cross:      SMA(fast) > SMA(slow) → long
- rsi_meanrev:    RSI < low → long, > high → exit
- macd:           MACD line crosses signal line
- momentum_12_1:  12개월 누적수익률 - 1개월 누적수익률 > 0 → long
- vix_risk_off:   VIX <= threshold → long, > threshold → exit (외부 VIX 시리즈 필요)
"""
```
- `"""..."""` 는 **파일 맨 위 설명서(docstring)**. 실행되지 않고, 사람이 읽는 용도. 여기 6개 전략 요약이 적혀 있어 "이 파일이 무엇을 지원하는지" 한눈에 보입니다.
- **"deterministic(결정론적)"** = 같은 입력이면 항상 같은 결과. 랜덤·외부호출이 없어 검증·재현이 됩니다. (메모리의 "엔진 신뢰성 감사"에서 가짜/랜덤 0건이 확인된 이유.)

```python
# L11-L19
from __future__ import annotations
from dataclasses import dataclass
from typing import Literal, Optional

import numpy as np
import pandas as pd
import vectorbt as vbt

from app.config import DEFAULT_INITIAL_CAPITAL, DEFAULT_FEES, DEFAULT_SLIPPAGE
```
- `from __future__ import annotations` — 타입힌트를 "문자열처럼" 늦게 평가하게 해주는 파이썬 기능. 초보는 **"최신 타입표기를 쓰기 위한 주문"** 정도로 이해하면 됩니다.
- `dataclass` — 설정값 묶음 클래스를 짧게 만들어주는 도구(아래 `BacktestParams`에서 사용).
- `Literal` — "이 값은 정해진 몇 개 문자열 중 하나" 라고 제한하는 타입. `Optional[X]` — "X 이거나 None(없음)".
- `numpy(np)` 숫자계산, `pandas(pd)` 표 데이터, `vectorbt(vbt)` 백테스트. **퀀트 3대 라이브러리**.
- 마지막 줄: 기본 자본금/수수료/슬리피지 **상수**를 `config.py` 에서 가져옴 → 한 곳에서 관리(매직넘버 방지).

> 💡 초보 포인트: `import A as B` 는 "A 를 앞으로 B 로 부르겠다"는 별명. `np`, `pd`, `vbt` 는 업계 관습 별명입니다.

---

### B. 전략 종류 제한 — `L22-L25`

```python
# L22-L25
StrategyType = Literal[
    "buy_and_hold", "sma_cross", "rsi_meanrev", "macd",
    "momentum_12_1", "vix_risk_off",
]
```
- "전략 이름은 **이 6개 문자열 중 하나만** 허용한다"는 타입 별칭. 오타("sma_crss")를 코드/타입검사 단계에서 잡아줍니다.

---

### C. 전략 파라미터 묶음 — `L28-L44`

```python
# L28-L44
@dataclass
class BacktestParams:
    strategy: StrategyType = "sma_cross"
    sma_fast: int = 20
    sma_slow: int = 60
    rsi_period: int = 14
    rsi_low: int = 30
    rsi_high: int = 70
    macd_fast: int = 12
    macd_slow: int = 26
    macd_signal: int = 9
    momentum_long_days: int = 252   # ~12개월
    momentum_short_days: int = 21   # ~1개월
    vix_threshold: float = 25.0
    initial_capital: float = DEFAULT_INITIAL_CAPITAL
    fees: float = DEFAULT_FEES
    slippage: float = DEFAULT_SLIPPAGE
```
- `@dataclass` 데코레이터를 붙이면, 이 클래스는 **"설정값들의 묶음 상자"** 가 됩니다. `BacktestParams(strategy="macd", macd_fast=10)` 처럼 일부만 바꿔 만들 수 있고, 안 적은 값은 `= 기본값` 이 자동 적용됩니다.
- 각 줄은 **하나의 손잡이(파라미터)**:
  - `sma_fast=20, sma_slow=60` — 단기/장기 이동평균 기간(일). 20일선이 60일선을 뚫으면 매수(아래 sma_cross).
  - `rsi_period=14, rsi_low=30, rsi_high=70` — RSI 지표 기간과 과매도/과매수 기준선.
  - `macd_fast/slow/signal=12/26/9` — MACD 의 표준 설정(업계 관습값).
  - `momentum_long_days=252` — 1년 거래일 수(주식시장은 1년에 약 252일 개장). `~12개월` 주석이 그 뜻.
  - `vix_threshold=25.0` — 공포지수(VIX)가 25 이하이면 "안전(risk-on)"으로 본다는 기준.
  - `initial_capital/fees/slippage` — 시작 자본금·수수료·슬리피지(앞 import 의 기본값).

> 💡 초보 포인트: "왜 굳이 클래스로 묶나?" → 파라미터가 15개라 함수마다 15개씩 넘기면 지옥. **한 상자(`p`)에 담아 통째로** 넘기면 깔끔하고, 새 파라미터 추가도 쉽습니다.

> 🚀 고도화 힌트: 여기 손잡이를 추가하면 새 전략 변형이 됩니다(예: `atr_stop_pct` 손절선). 강의에서 "파라미터 = 전략의 다이얼"이라는 개념을 보여주기 좋은 자리.

---

### D. 신호 생성기 `_signals()` — `L47-L96` (이 파일의 알맹이)

함수 머리:
```python
# L47-L52
def _signals(
    close: pd.Series,
    p: BacktestParams,
    vix: Optional[pd.Series] = None,
) -> tuple[pd.Series, pd.Series]:
    """Returns (entries, exits) boolean series aligned to `close`."""
```
- 입력: `close`(종가), `p`(파라미터 상자), `vix`(공포지수, vix_risk_off 전략에서만 필요해서 기본 None).
- 출력: `(entries, exits)` — **매수신호표, 매도신호표** 두 장. 둘 다 `close` 와 같은 날짜축.
- 함수명 앞 `_`(언더스코어): **"이 파일 내부용, 밖에서 직접 부르지 마세요"** 라는 파이썬 관습 표시.

#### 전략 1) buy_and_hold — `L53-L57`
```python
# L53-L57
if p.strategy == "buy_and_hold":
    entries = pd.Series(False, index=close.index)
    exits = pd.Series(False, index=close.index)
    entries.iloc[0] = True
    return entries, exits
```
- 가장 단순. **첫날(`iloc[0]`)만 매수 True**, 매도는 영원히 False → "첫날 사서 끝까지 보유".
- `pd.Series(False, index=close.index)` = close 와 같은 날짜들에 전부 False 를 깔고 시작. 그중 첫 칸만 True 로 바꿈.
- 이게 **벤치마크(기준선)**: 다른 전략은 "그냥 사서 들고 있는 것보다 나은가?"로 평가됩니다.

#### 전략 2) sma_cross — `L59-L63`
```python
# L59-L63
if p.strategy == "sma_cross":
    fast = vbt.MA.run(close, p.sma_fast).ma
    slow = vbt.MA.run(close, p.sma_slow).ma
    entries = fast.vbt.crossed_above(slow)
    exits = fast.vbt.crossed_below(slow)
```
- `vbt.MA.run(close, 20).ma` = 20일 **단순이동평균(SMA)** 선을 계산. (`.ma` 는 결과에서 평균값 Series 만 꺼내는 것.)
- `fast`(20일선)가 `slow`(60일선)를 **뚫고 올라가는 순간** → 매수(`crossed_above`). 뚫고 내려가면 → 매도.
- 의미: 단기 추세가 장기 추세를 추월 = "상승 모멘텀 시작" 신호. **골든크로스/데드크로스** 라고 부릅니다.

```
가격선과 이동평균:
   fast(20일) ───╮      ╭───  ← 위로 교차(golden) = 매수
   slow(60일) ───┼──────┼──
                 ▲      ▲
              매수신호  (계속 위면 신호 X, 교차 순간만)
```

#### 전략 3) rsi_meanrev — `L65-L68`
```python
# L65-L68
elif p.strategy == "rsi_meanrev":
    rsi = vbt.RSI.run(close, p.rsi_period).rsi
    entries = rsi.vbt.crossed_below(p.rsi_low)
    exits = rsi.vbt.crossed_above(p.rsi_high)
```
- `RSI`(상대강도지수)는 0~100 사이 값. **70 위 = 과매수(너무 올랐다), 30 아래 = 과매도(너무 빠졌다)**.
- 전략 이름 `meanrev` = **평균회귀**: "너무 빠지면(30 아래로 내려가면) 곧 반등할 것" → 매수, "너무 오르면(70 위로)" → 매도.
- sma_cross(추세추종)와 **정반대 철학**: 추세추종은 "오르면 따라 사고", 평균회귀는 "빠지면 줍는다".

#### 전략 4) macd — `L70-L73`
```python
# L70-L73
elif p.strategy == "macd":
    macd = vbt.MACD.run(close, p.macd_fast, p.macd_slow, p.macd_signal)
    entries = macd.macd.vbt.crossed_above(macd.signal)
    exits = macd.macd.vbt.crossed_below(macd.signal)
```
- MACD = (12일 지수이평 − 26일 지수이평) 으로 만든 **모멘텀 선**, `signal` = 그 MACD 의 9일 평균(완만한 선).
- MACD 선이 signal 선을 뚫고 올라가면 매수. sma_cross 와 비슷한 "두 선 교차" 논리지만, **지수이동평균**이라 최근 가격에 더 민감.

#### 전략 5) momentum_12_1 — `L75-L83`
```python
# L75-L83
elif p.strategy == "momentum_12_1":
    # 12-month return minus 1-month return (Jegadeesh-Titman 변형)
    long_ret = close.pct_change(p.momentum_long_days)
    short_ret = close.pct_change(p.momentum_short_days)
    score = long_ret - short_ret
    in_pos = score > 0
    # state-based entries/exits
    entries = in_pos & ~in_pos.shift(1).fillna(False)
    exits = ~in_pos & in_pos.shift(1).fillna(False)
```
- `close.pct_change(252)` = "252일(1년) 전 대비 몇 % 변했나" (장기 수익률). `pct_change(21)` = 1개월 수익률.
- `score = 12개월수익 − 1개월수익` — 학계의 유명한 **모멘텀 팩터**(Jegadeesh–Titman). "최근 1달은 빼고(단기 반전 노이즈 제거) 장기 상승세만 본다".
- `in_pos = score > 0` — "score 가 양수인 동안은 포지션 보유" 라는 **상태(state)**.
- 마지막 2줄이 핵심 트릭 — **상태를 교차 신호로 변환**:
  - `entries = in_pos & ~in_pos.shift(1)` = "오늘은 보유상태인데(`in_pos`) 어제는 아니었다(`~...shift(1)`)" = **보유로 바뀌는 그 순간** = 매수.
  - `exits` = 그 반대, **보유에서 빠지는 순간** = 매도.
  - `.shift(1)` = 한 칸 밀기(어제 값), `~` = not(반대), `&` = and, `.fillna(False)` = 첫날 빈칸은 False 로.

> 💡 초보 포인트: sma/rsi/macd 는 vectorbt 가 `crossed_above` 로 "교차 순간"을 만들어줬지만, 모멘텀은 직접 만든 `in_pos` 상태라서 **"상태가 바뀌는 순간"을 손수 계산**해야 합니다. 이 `state & ~state.shift(1)` 패턴은 퀀트에서 매우 자주 나오니 꼭 익히세요.

#### 전략 6) vix_risk_off — `L85-L91`
```python
# L85-L91
elif p.strategy == "vix_risk_off":
    if vix is None:
        raise ValueError("vix_risk_off requires `vix` series")
    v = vix.reindex(close.index).ffill()
    risk_on = v <= p.vix_threshold
    entries = risk_on & ~risk_on.shift(1).fillna(False)
    exits = ~risk_on & risk_on.shift(1).fillna(False)
```
- VIX(공포지수)가 필요한 전략 → 없으면 즉시 에러(`raise ValueError`)로 친절하게 알림.
- `vix.reindex(close.index).ffill()` — VIX 날짜를 종가 날짜에 맞추고(`reindex`), 빈 날은 **직전 값으로 채움**(`ffill` = forward fill). (VIX 와 주가의 휴장일이 다를 수 있어 정렬 필요.)
- `risk_on = v <= 25` — "공포지수가 낮다 = 시장이 안전하다" 동안만 주식 보유. 모멘텀과 같은 상태→교차 변환.

#### 끝 처리 — `L93-L96`
```python
# L93-L96
    else:
        raise ValueError(f"Unknown strategy {p.strategy}")

    return entries.fillna(False), exits.fillna(False)
```
- 6개 중 어디에도 안 걸리면 에러(모르는 전략). 마지막에 `.fillna(False)` 로 **빈칸(NaN)을 False 로** 정리해서 깔끔한 boolean 표를 반환.

---

### E. 백테스트 실행기 `run_backtest()` — `L100-L178`

```python
# L100-L109
def run_backtest(close, p, vix=None) -> dict:
    """Returns dict with stats + equity curve. ..."""
    entries, exits = _signals(close, p, vix=vix)
```
- 먼저 위 `_signals` 로 신호 2장을 만든다.

#### ⚠️ Look-ahead 방지 (이 파일에서 가장 중요한 5줄) — `L111-L119`
```python
# L111-L119
    # Look-ahead bias 방지: close로 생성한 신호는 1bar shift (vectorbt docs 권장)
    # ...
    entries = entries.vbt.fshift(1).fillna(False).astype(bool)
    exits = exits.vbt.fshift(1).fillna(False).astype(bool)
    if p.strategy == "buy_and_hold" and not entries.any():
        entries.iloc[0] = True
```
- `fshift(1)` = 신호를 **하루 뒤로 민다**. "오늘 종가로 계산한 신호 → 내일 매매" → **미래참조 반칙 제거**(사전지식 4번).
- `.fillna(False).astype(bool)` 가 왜 필요한가(주석의 교훈): `fshift` 가 첫 칸을 NaN 으로 만들면 Series 타입이 `object` 로 바뀌고, vectorbt 내부의 Numba(초고속 컴파일러)가 object 배열을 **처리 못 해 에러**가 납니다. 그래서 NaN→False 채우고 **bool 로 강제 변환**.
- 마지막 2줄: buy_and_hold 는 첫날 신호가 shift 로 밀려 사라질 수 있어, **최소 1번은 사도록** 첫 칸을 다시 True 로 보장.

> 이 5줄은 "백테스트가 거짓말 안 하게 만드는" 안전장치입니다. 강의에서 **"백테스트의 1순위 함정 = look-ahead"** 를 설명할 핵심 코드.

#### 가상 매매 실행 — `L121-L132`
```python
# L121-L132
    pf = vbt.Portfolio.from_signals(
        close, entries, exits,
        init_cash=p.initial_capital, fees=p.fees, slippage=p.slippage, freq="1D",
    )
    stats = pf.stats()
    eq = pf.value()
    strat_returns = pf.returns()
```
- `Portfolio.from_signals(...)` — vectorbt 의 핵심. **"이 가격에, 이 매수/매도 신호로, 이 자본·비용으로 거래했다면"** 의 가상 포트폴리오 `pf` 를 만든다. `freq="1D"` = 일봉(하루 단위).
- 그 `pf` 에서 3가지를 꺼냄:
  - `pf.stats()` — 성적표(총수익·MDD·승률 등) 한 묶음.
  - `pf.value()` — **자산곡선**(날짜별 내 돈의 가치) → 프론트 차트의 파란 선.
  - `pf.returns()` — 일별 수익률(수수료·슬리피지 반영 후) → 뒤에서 QuantStats 가 추가 지표 계산에 씀.

#### 안전한 숫자 변환 헬퍼 `_f` — `L134-L139`
```python
# L134-L139
    def _f(x):
        try:
            v = float(x)
            return None if (np.isnan(v) or np.isinf(v)) else round(v, 4)
        except Exception:
            return None
```
- 함수 안의 작은 helper. 어떤 값이든 **float 로 바꾸되, NaN/무한대/변환실패면 None** 으로. 소수 4자리 반올림.
- **왜?** JSON 으로 프론트에 보낼 때 `NaN`/`Infinity` 는 깨집니다. 미리 `None`(→ JSON `null`)로 바꿔 안전하게.

#### Calmar 수동 재계산(폴백) — `L141-L150`
```python
# L141-L150
    _calmar = _f(pf.calmar_ratio())
    if _calmar is None:
        try:
            a = float(pf.annualized_return() * 100)
            m = float(stats.get("Max Drawdown [%]"))
            if not np.isnan(a) and not np.isnan(m) and abs(m) > 1e-9:
                _calmar = round(a / abs(m), 4)
        except Exception:
            _calmar = None
```
- Calmar = 연환산수익 ÷ |MDD|. vectorbt 가 가끔 None/NaN 을 주는 경우가 있어, 그럴 때 **직접 계산**(연수익 ÷ 낙폭절대값).
- `abs(m) > 1e-9` — 0으로 나누기 방지(MDD 가 0에 가까우면 계산 안 함).

#### 결과를 dict 로 묶어 반환 — `L152-L178`
```python
# L152-L172 (요약)
    return {
        "strategy": p.strategy,
        "params": { ... 사용한 모든 파라미터 ... },
        "stats": {
            "total_return_pct": _f(stats.get("Total Return [%]")),
            "annualized_return_pct": _f(pf.annualized_return() * 100),
            "max_drawdown_pct": _f(stats.get("Max Drawdown [%]")),
            "sharpe": _f(pf.sharpe_ratio()),
            "sortino": _f(pf.sortino_ratio()),
            "calmar": _calmar,
            "win_rate_pct": _f(stats.get("Win Rate [%]")),
            "trades": int(stats.get("Total Trades", 0)),
            "start": str(close.index[0].date()),
            "end": str(close.index[-1].date()),
        },
        ...
    }
```
- **이 `stats` 묶음이 곧 프론트 Report 탭의 8개 카드**(총수익률·연환산·MDD·Sharpe·Sortino·Calmar·승률·거래수)입니다. 화면 숫자가 여기서 나옵니다.
- `params` 를 같이 돌려주는 이유: "어떤 설정으로 낸 결과인지" 기록(재현성).

```python
# L173-L177
        "equity_curve": [
            {"date": str(d.date()), "value": _f(v)}
            for d, v in eq.iloc[::max(1, len(eq) // 365)].items()
        ],
        "_strategy_returns": strat_returns,
    }
```
- `equity_curve` — 자산곡선을 `[{date, value}]` 리스트로. `eq.iloc[::step]` 의 `step = len/365` 는 **다운샘플링**: 10년치 일봉(약 2500점)을 약 365점으로 솎아 전송량을 줄임(차트는 어차피 촘촘히 안 보임).
- `_strategy_returns` — 앞 `_`는 "내부용". 이 일별수익률을 `main.py` 가 QuantStats(추가 위험지표·HTML 리포트)에 넘깁니다. JSON 직렬화 대상이 아니라 파이썬 객체째 전달.

---

### F. 오늘의 신호 `latest_signal()` — `L181-L214`

```python
# L181-L207 (요약)
def latest_signal(close, p, vix=None) -> dict:
    entries, exits = _signals(close, p, vix=vix)
    last5_entries = entries.iloc[-5:]
    last5_exits = exits.iloc[-5:]

    signal = "HOLD"; reason = "최근 5거래일 내 신호 없음"
    if last5_entries.iloc[-1]:   signal = "BUY";  reason = f"오늘 {p.strategy} 매수 시그널 발생"
    elif last5_exits.iloc[-1]:   signal = "SELL"; reason = f"오늘 {p.strategy} 매도 시그널 발생"
    elif last5_entries.any():    signal = "BUY";  reason = "최근 5일 내 매수 시그널 (포지션 진입 권장)"
    elif last5_exits.any():      signal = "SELL"; reason = "최근 5일 내 매도 시그널 (포지션 정리 권장)"
```
- 백테스트(과거 전체)와 달리, 이건 **"지금 당장 뭘 할까"**. `iloc[-5:]` = 최근 5거래일만 봄.
- 우선순위: ① 바로 오늘(`iloc[-1]`) 신호가 있으면 그걸 따름 → ② 없으면 최근 5일 내 신호라도 있으면 따름(`.any()`) → ③ 아무것도 없으면 HOLD(관망).
- 여기서 주의: `latest_signal` 은 `_signals` 의 **shift 안 한** 원본 신호를 봅니다(오늘 신호를 오늘 보고 판단). 백테스트의 shift 는 "과거 성과 측정의 공정성"용이고, 실시간 신호는 "방금 교차가 일어났나"를 보는 게 자연스럽기 때문.

```python
# L209-L214
    return {
        "signal": signal,
        "reason": reason,
        "last_close": float(close.iloc[-1]),
        "last_date": str(close.index[-1].date()),
    }
```
- BUY/SELL/HOLD + 사람이 읽을 이유 + 마지막 종가/날짜를 묶어 반환. 백엔드의 `DailySignalGenerator` 가 이걸 받아 OrderProposal(주문 제안)을 만들 수 있습니다.

---

## ⚠️ 함정·버그 주의 (코드에 박힌 교훈 모음)

1. **Look-ahead(미래참조)** — `fshift(1)` 없으면 백테스트가 거짓으로 좋아짐. 백테스트 1순위 반칙.
2. **dtype 함정** — `fshift` → NaN → object dtype → Numba 에러. `.fillna(False).astype(bool)` 필수.
3. **NaN/Inf 직렬화** — JSON 에 `NaN` 못 넣음. `_f()` 로 `None` 변환.
4. **0으로 나누기** — Calmar 폴백에서 `abs(m) > 1e-9` 로 방지.
5. **날짜 정렬** — VIX 처럼 다른 소스는 `reindex().ffill()` 로 종가 날짜에 맞춰야 함.

---

## 🚀 고도화 아이디어 (강의·개선 버전용)

- **포지션 사이징**: 지금은 "있다/없다"(전량 매수/매도). `Portfolio.from_signals` 의 `size`/`size_type` 로 자본의 N% 만 진입하게 → 리스크 관리.
- **손절·익절(stop)**: `from_signals(sl_stop=..., tp_stop=...)` 로 자동 손절/익절 → MDD 개선.
- **멀티에셋·리밸런싱**: 한 종목이 아니라 포트폴리오. `Portfolio.from_orders` 또는 비중 기반.
- **전략 추가**: `_signals` 에 `elif p.strategy == "..."` 한 블록 + `BacktestParams` 에 손잡이 추가가 전부. (예: 볼린저밴드, 채널 돌파.)
- **현실성 강화**: 거래량 제약, 호가 슬리피지 모델, 다음날 시가 체결가 분리.
- **벤치마크 비교**: buy_and_hold 대비 초과수익(alpha)을 stats 에 추가.
- **파라미터 최적화 연결**: `04_robust/walkforward.md` 의 워크포워드와 결합해 "과거 최적 파라미터가 미래에도 통하나" 검증.

---

## 📚 용어 사전 (이 파일 한정)

| 용어 | 뜻 |
|---|---|
| `vbt.MA / RSI / MACD .run()` | vectorbt 의 지표 계산기. `.ma/.rsi/.macd` 로 결과 Series 추출 |
| `crossed_above/below` | 한 선이 다른 선을 상향/하향 교차한 **순간**만 True |
| `fshift(1)` | 신호를 한 칸 미래로 밀기(look-ahead 방지) |
| `Portfolio.from_signals` | 신호+가격+비용으로 가상 매매를 실행해주는 vectorbt 핵심 |
| `pf.value()` | 날짜별 자산가치(자산곡선) |
| `pf.returns()` | 날짜별 수익률(비용 반영 후) |
| `pct_change(n)` | n일 전 대비 변화율 |
| `state & ~state.shift(1)` | "상태가 켜지는 순간"을 잡는 관용 패턴 |
| 다운샘플링 | 너무 촘촘한 데이터를 일정 간격으로 솎아 줄이기 |
