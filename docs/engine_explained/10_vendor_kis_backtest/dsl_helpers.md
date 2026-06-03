# `dsl/helpers.py` — 전략을 레고처럼 조립하는 "지표 부품 상자" (완전 라인별 해설)

> 원본: `analytics/app/lean/kis_backtest/dsl/helpers.py` (1765줄)
> 위치: 벤더링된 KIS 라이브러리 `kis_backtest/` 의 `dsl/`(🟡 간접 사용) 패키지. 전체 지도는 [`00_overview.md`](00_overview.md) 참고.
> 형식 기준: [`../README.md`](../README.md) "3. 공통 형식" · 모범 [`../01_backtest/vbt_engine.md`](../01_backtest/vbt_engine.md).

---

## 📌 이 파일 한눈에

이 파일은 **"전략을 레고처럼 조립하기 위한 부품 상자"** 입니다. `SMA(20)`, `RSI(14)`, `MACD()`, `BB(20, 2.0)`, `Hammer()` … 처럼 **이름만 부르면 지표(또는 캔들 패턴) 객체 하나가 툭 튀어나오는 짧은 함수(팩토리 함수)들**이 약 80개 모여 있습니다.

각 함수가 하는 일은 거의 똑같습니다 — **딱 한 줄, `Indicator(...)` 객체를 만들어 돌려주는 것**이 전부입니다. 그래서 이 파일은 "긴 1765줄"이지만 **실제 로직은 매우 단순**하고, 분량의 90%는 **초보자를 위한 한국어 docstring(사용 설명)** 입니다.

> 비유: 이 파일은 **레고 부품 카탈로그**입니다. `SMA` 라는 빨간 블록, `RSI` 라는 파란 블록, `MACD` 라는 노란 블록… 각 함수는 "이 블록 하나 주세요"라고 말하면 블록을 건네주는 **자판기 버튼**입니다. 버튼은 블록을 **만들어 주기만** 하고, 그 블록으로 무엇을 짓는지(비교·조립)는 다른 파일(`core/indicator.py`, `dsl/builder.py`)의 몫입니다.

| 무엇을 | 한 줄 설명 |
|---|---|
| **입력** | 지표의 파라미터(기간·배수 등). 예: `SMA(20)` 의 `20` |
| **출력** | `core/indicator.py` 의 `Indicator` 객체 1개 (또는 `BollingerBands`/`CandlestickPattern` 등) |
| **로직** | 거의 없음 — `return Indicator("sma", {"period": period}, alias=alias)` 한 줄 |
| **목적** | 사람이 `SMA(5) > SMA(20)` 처럼 **수식으로 전략을 쓰게** 해주는 친근한 진입점 |

**누가 호출하나?** → ① 직접은 `strategies/preset/` 의 내장 전략들(예: `sma_crossover.py`)이 `SMA`·`RSI` 등을 불러 진입/청산 조건을 만듭니다. ② 사용자는 `dsl/builder.py` 의 `RuleBuilder("이름").buy_when(SMA(5) > SMA(20)).build()` 형태로 씁니다. (개요 문서 기준 우리 시스템은 RuleBuilder 를 직접 호출하진 않고, preset 이 간접적으로 이 헬퍼들에 의존합니다 — 🟡 간접 사용.)

**왜 이렇게 만드나?** → `Indicator("sma", {"period": 20})` 라고 매번 쓰면 길고 외우기 어렵습니다. `SMA(20)` 한 줄로 **줄여주는 단축키**가 바로 이 헬퍼들입니다. 동시에 docstring 으로 "이게 무슨 지표이고 어떻게 쓰는지"를 가르쳐 줍니다.

---

## 🧠 사전 지식 (이거 모르면 막힘)

#### 1) DSL = "선언적으로 전략을 기술" — vbt 의 'boolean Series' 와 대비

- `vbt_engine.py`(모범 예시)에서는 가격으로 **실제 숫자/True·False 표(boolean Series)** 를 직접 계산해서 신호를 만들었습니다.
- 여기 DSL 은 다릅니다. **계산을 하지 않습니다.** `SMA(5) > SMA(20)` 은 "5일선이 20일선보다 크다는 **규칙**"을 **객체(`Condition`)로 기록**할 뿐입니다. 실제 계산은 나중에 codegen → Lean 이 합니다.
- 즉 vbt 는 **"값으로 신호를 만든다"**, DSL 은 **"규칙을 객체로 적어둔다(선언한다)"**. (이 대비는 [`00_overview.md`](00_overview.md) 핵심개념 1번과 동일.)

#### 2) 팩토리 함수(factory function) = "객체를 만들어 돌려주는 함수"

```python
def SMA(period, alias=None):
    return Indicator("sma", {"period": period}, alias=alias)
```
- `SMA(20)` 을 호출하면 → 새 `Indicator` 객체가 만들어져 나옵니다. 함수 이름이 곧 "만들어 줄 물건 이름"입니다.
- 이 파일의 **거의 모든 함수가 이 한 가지 패턴**입니다. 그래서 하나만 이해하면 80개를 다 이해한 셈입니다.

#### 3) `Indicator` 객체 = "지표 한 개의 설명서" (`core/indicator.py`)

`Indicator` 는 `@dataclass` 로, 네 가지 정보를 담습니다 (근거: `core/indicator.py:31-34`):
```
id      "sma"             ← 어떤 지표인지 (소문자 식별자)
params  {"period": 20}    ← 파라미터
alias   "sma_20" (자동)   ← 변수처럼 부를 별명 (안 주면 자동 생성)
output  "value" (기본)    ← 여러 출력 중 어느 것 (MACD 의 signal/histogram 등)
```
- **연산자 오버로딩이 핵심**: `Indicator` 는 `>`, `<`, `>=`, `<=`, `crosses_above`, `between` 등을 재정의해 놓았습니다(`core/indicator.py:43-105`). 그래서 `SMA(5) > SMA(20)` 이 **숫자 비교가 아니라 `Condition` 객체를 만드는** 마법이 가능합니다.
- 즉 이 헬퍼들이 만드는 `Indicator` 는 **"연산자로 조립 가능한 블록"** 입니다.

#### 4) `alias`(별칭) = "이 지표를 부를 변수 이름"

- 같은 지표를 여러 번 쓰거나, 멀티 출력(MACD 의 value/signal)을 구분할 때 별명이 필요합니다.
- `alias=None` 으로 두면 `Indicator.__post_init__` 이 `id + 파라미터값` 으로 **자동 생성**합니다(`sma_20`, `rsi_14`). 그래서 대부분의 헬퍼는 `alias` 를 굳이 안 줘도 됩니다.

#### 5) `output`(출력 선택) = "한 지표가 여러 선을 낼 때 어느 선?"

- MACD 는 한 번 계산하면 **value(본선)·signal(신호선)·histogram(막대)** 세 가지가 나옵니다. `MACD(output="signal")` 처럼 **어느 선을 쓸지** 고릅니다.
- STOCH·AROON·ADX·VORTEX·REGRESSION·PIVOT 등도 `output` 인자를 가집니다.

#### 6) 이 파일이 schema/builder 와 엮이는 그림

```
[helpers.py]           [core/indicator.py]        [core/condition.py]
SMA(5)   ──만든다──►  Indicator("sma",...)
                            │  > 연산자 오버로딩
SMA(20)  ──만든다──►  Indicator("sma",...)  ──►  Condition("greater_than", ...)
                                                         │
                                  RuleBuilder.buy_when(condition)  [dsl/builder.py]
                                                         │ .build()
                                                  StrategyRule → StrategyDefinition
                                                         │ from_definition()
                                                  core/schema.StrategySchema  ← 모든 입력의 표준
                                                         │
                                                  codegen → Lean Python 코드 → 백테스트
```
- **helpers 는 이 사슬의 맨 앞 "블록 공급" 단계**입니다. 블록을 비교(`>`)하면 조건이 되고, 조건을 빌더에 넣으면 전략이 되고, 전략은 스키마로 표준화되어 코드로 생성됩니다.

---

## 🗺 구조

```
helpers.py (1765줄) — 거의 전부 "팩토리 함수" + 한국어 docstring
│
├── import (L11-12)                core/indicator(Indicator·BollingerBands·Price), core/candlestick(CandlestickPattern)
│
├── 📁 이동평균 14종       (L15-238)   SMA EMA DEMA TEMA HMA KAMA ALMA LWMA TRIMA T3 ZLEMA WMA FRAMA VIDYA
├── 📁 오실레이터 20종     (L241-663)  RSI STOCH STOCHRSI MACD CCI WILLIAMS_R MOMENTUM ROC APO PPO
│                                       AROON CMO AO CHO ULTOSC TRIX TSI RVI DPO KVO
├── 📁 추세 지표 11종      (L666-892)  ADX ADXR SAR CHOP COPPOCK SUPERTREND MASS_INDEX SCHAFF FISHER KST VORTEX
│                                       (주석은 "12개"라고 적혀 있으나 실제 정의는 11개)
├── 📁 거래량 9종          (L895-1027) OBV AD ADL CMF MFI FORCE VWAP VWMA EOM
│                                       (주석은 "12개" — PVT/NVI/PVI 는 정의 없음 ⚠️)
├── 📁 변동성 7종          (L1031-1130) ATR NATR BB STD VARIANCE BETA ALPHA   (주석은 "10개")
├── 📁 기타 10종           (L1133-1285) MAXIMUM MINIMUM MIDPOINT MIDPRICE LOGR IBS BOP REGRESSION PIVOT AUGEN
│
├── 📁 멀티아웃풋 클래스 4개 (L1288-1515) IchimokuCloud KeltnerChannels DonchianChannel AccelerationBands
│                                       (+ BollingerBands 는 core 에서 import → 외부 노출은 5개)
├── 📁 별칭 (L1518-1524)              Stochastic=STOCH · Maximum=MAXIMUM · Minimum=MINIMUM
├── 📁 캔들 패턴 팩토리 19개 (L1527-1623) Doji … ThreeBlackCrows
│
└── __all__ (L1626-1765)            공개 심볼 명단 (⚠️ PVT/NVI/PVI 가 들어있으나 정의 없음 → ImportError 위험)
```

> 핵심 통찰: **함수 본문은 거의 전부 `return Indicator(...)` 한 줄**. 카테고리(이동평균/오실레이터/…)는 **사람이 보기 좋게 나눈 주석 구획**일 뿐, 코드 동작에는 영향이 없습니다. 따라서 "대표 함수 몇 개"만 라인별로 깊게 보면 나머지는 같은 틀의 복제입니다.

---

## 📖 함수 전수 매핑표 + 카테고리별 라인별 심화

### 0) 파일 머리 — docstring + import (`L1-L12`)

```python
# L1-L12
"""Indicator factory functions for DSL.

Provides convenient functions to create indicator instances.

Example:
    from kis_backtest.dsl import SMA, RSI, Price

    condition = (SMA(5) > SMA(20)) & (RSI(14) < 70)
"""

from kis_backtest.core.indicator import Indicator, BollingerBands, Price
from kis_backtest.core.candlestick import CandlestickPattern
```
- **무엇을**: 파일 설명서 + 이 파일이 의존하는 두 부품(`Indicator`/`BollingerBands`/`Price` ← 지표, `CandlestickPattern` ← 캔들 패턴)을 가져옵니다.
- **왜**: 헬퍼들은 자기 손으로 클래스를 만들지 않고, **core 의 기존 클래스를 포장(wrapping)만** 합니다. 그래서 단 2줄의 import 가 이 파일의 전부의 재료입니다.
- **헷갈리는 포인트**: docstring 예시의 `(SMA(5) > SMA(20)) & (RSI(14) < 70)` 에서 `&` 가 보입니다. 이건 파이썬 비트 AND 가 아니라 `Condition` 끼리의 **AND 결합**(연산자 오버로딩, `core/condition.py`)입니다. helpers 가 `Indicator` 를 주면, `>` 가 `Condition` 을 만들고, `&` 가 두 조건을 묶습니다.

---

### 1) 카테고리 A — 이동평균 14종 (`L15-L238`)

#### 전수 매핑표

| 함수 | 라인 | id | 주요 파라미터(기본값) | 한 줄 의미 |
|---|---|---|---|---|
| `SMA` | L19 | `sma` | period | 단순 이동평균 |
| `EMA` | L33 | `ema` | period | 지수 이동평균(최근값 가중) |
| `DEMA` | L47 | `dema` | period=21 | 이중 지수 이동평균(지연↓) |
| `TEMA` | L61 | `tema` | period=21 | 삼중 지수 이동평균 |
| `HMA` | L75 | `hma` | period=21 | 헐 이동평균(노이즈↓·반응↑) |
| `KAMA` | L90 | `kama` | period=21 | 카우프만 적응형(감도 자동조절) |
| `ALMA` | L105 | `alma` | period=21, sigma=6.0, offset=0.85 | 가우시안 가중 이동평균 |
| `LWMA` | L131 | `lwma` | period=21 | 선형 가중(최근값↑) |
| `TRIMA` | L146 | `trima` | period=21 | 삼각 가중(중앙값↑) |
| `T3` | L161 | `t3` | period=5, volume_factor=0.7 | EMA 다중 적용 |
| `ZLEMA` | L181 | `zlema` | period=21 | 제로 래그 EMA |
| `WMA` | L196 | `wma` | period=21 | 와일더 이동평균(RSI·ATR 기초) |
| `FRAMA` | L211 | `frama` | period=21 | 프랙탈 적응형 |
| `VIDYA` | L226 | `vidya` | period=21 | Chande 모멘텀 기반 적응형 |

#### 대표 라인별 심화 ① — 가장 단순한 `SMA`

```python
# L19-L30
def SMA(period: int, alias: str = None) -> Indicator:
    """단순 이동평균 (Simple Moving Average)

    Args:
        period: 이동평균 기간
        alias: 지표 별칭

    Example:
        sma20 = SMA(20)
        condition = SMA(5) > SMA(20)  # 골든크로스 조건
    """
    return Indicator("sma", {"period": period}, alias=alias)
```
- **무엇을**: `period`(기간)를 받아 `Indicator` 한 개를 만들어 반환. id 는 `"sma"`, 파라미터는 `{"period": period}`.
- **왜 이렇게**: 사용자가 `Indicator("sma", {"period":20})` 라고 외울 필요 없이 `SMA(20)` 으로 끝. id 문자열은 나중에 codegen 이 **Lean 의 어떤 지표 클래스로 매핑할지**의 열쇠(`INDICATOR_REGISTRY`).
- **타입힌트 읽기**: `period: int`(정수 받음), `alias: str = None`(별칭은 선택, 안 주면 None), `-> Indicator`(돌려주는 건 Indicator). 단, **`SMA` 는 이 카테고리에서 유일하게 `period` 에 기본값이 없습니다**(`SMA()` 처럼 빈 호출 불가). 나머지 13개는 `period=21` 등 기본값이 있어 인자 없이도 호출됩니다.
- **헷갈리는 포인트**: `alias: str = None` 은 엄밀히는 타입 오류 표기(올바르게는 `Optional[str] = None`)지만, 파이썬은 런타임에 타입힌트를 강제하지 않아 **동작에는 문제 없음**. 초보는 "별칭은 선택 인자" 정도로 이해하면 됩니다.

#### 대표 라인별 심화 ② — 파라미터가 여러 개인 `ALMA`

```python
# L105-L128
def ALMA(
    period: int = 21,
    sigma: float = 6.0,
    offset: float = 0.85,
    alias: str = None
) -> Indicator:
    """아르노 르구 이동평균 (Arnaud Legoux Moving Average)
    ...
    """
    return Indicator(
        "alma",
        {"period": period, "sigma": sigma, "offset": offset},
        alias=alias
    )
```
- **무엇을**: 파라미터가 3개(period·sigma·offset)인 케이스. 그래도 패턴은 동일 — 받은 인자를 그대로 `params` dict 에 담아 `Indicator` 로 포장.
- **왜**: 지표마다 필요한 손잡이 개수가 다를 뿐, "받아서 dict 에 담는다"는 틀은 공통. **이게 80개 함수를 관통하는 단 하나의 패턴**입니다.
- **헷갈리는 포인트**: 여기서 `params` 의 **키 이름(`"period"`, `"sigma"`, `"offset"`)이 중요**합니다. codegen/validator 가 이 키로 Lean 지표에 값을 꽂기 때문에, 키 철자가 곧 계약입니다.

> 💡 한 번에 정리: **이동평균 14종 = "`return Indicator("아이디", {파라미터}, alias=alias)` 한 줄"의 14가지 변주.** id 와 파라미터 이름만 다릅니다.

---

### 2) 카테고리 B — 오실레이터 20종 (`L241-L663`)

#### 전수 매핑표

| 함수 | 라인 | id | 주요 파라미터(기본값) | output 인자 | 한 줄 의미 |
|---|---|---|---|---|---|
| `RSI` | L245 | `rsi` | period=14 | — | 상대강도지수(과매수/과매도) |
| `STOCH` | L258 | `stochastic` | k_period=14, d_period=3 | k/d | 스토캐스틱 |
| `STOCHRSI` | L285 | `stochrsi` | rsi/stoch/k/d_period | k/d | RSI 에 스토캐스틱 적용 |
| `MACD` | L323 | `macd` | fast=12, slow=26, signal=9 | value/signal/histogram | 이평 수렴·확산 |
| `CCI` | L352 | `cci` | period=20 | — | 상품채널지수 |
| `WILLIAMS_R` | L365 | `williams_r` | period=14 | — | 윌리엄스 %R |
| `MOMENTUM` | L380 | `momentum` | period=10 | — | 모멘텀(%) |
| `ROC` | L393 | `roc` | period=10 | — | 변화율 |
| `APO` | L406 | `apo` | fast=12, slow=26 | — | 절대 가격 오실레이터 |
| `PPO` | L422 | `ppo` | fast=12, slow=26, signal=9 | value/signal/histogram | 백분율 가격 오실레이터 |
| `AROON` | L453 | `aroon` | up/down_period=25 | value/aroon_up/aroon_down | 아룬 오실레이터 |
| `CMO` | L482 | `cmo` | period=14 | — | 챈드 모멘텀 |
| `AO` | L497 | `ao` | fast=5, slow=34 | — | 오썸 오실레이터 |
| `CHO` | L513 | `cho` | fast=3, slow=10 | — | 채킨 오실레이터 |
| `ULTOSC` | L529 | `ultosc` | period1/2/3=7/14/28 | — | 궁극 오실레이터 |
| `TRIX` | L555 | `trix` | period=15 | — | 삼중 EMA 변화율 |
| `TSI` | L570 | `tsi` | long/short/signal=25/13/7 | value/signal | 참 강도 지수 |
| `RVI` | L605 | `rvi` | period=10 | — | 상대 활력 지수 |
| `DPO` | L620 | `dpo` | period=21 | — | 추세 제거 가격 오실레이터 |
| `KVO` | L635 | `kvo` | fast=34, slow=55, signal=13 | value/signal | 클링거 거래량 오실레이터 |

#### 대표 라인별 심화 ① — `RSI` (가장 흔한 오실레이터)

```python
# L245-L255
def RSI(period: int = 14, alias: str = None) -> Indicator:
    """상대강도지수 (Relative Strength Index)
    ...
        condition = RSI(14) < 30  # 과매도 조건
    """
    return Indicator("rsi", {"period": period}, alias=alias)
```
- **무엇을**: 이동평균 헬퍼와 완전히 같은 한 줄. 단지 id 가 `"rsi"`.
- **왜 예시가 `RSI(14) < 30`**: `<` 가 `Indicator.__lt__`(`core/indicator.py:47`)를 호출해 `Condition("less_than", rsi, 30)` 을 만듭니다. 즉 **"RSI 가 30 미만"이라는 규칙 객체**. 숫자 30 은 지표가 아닌 **상수 임계값**이어도 됩니다(오버로딩이 `Indicator vs 숫자`도 처리).

#### 대표 라인별 심화 ② — `MACD` (output 인자가 등장하는 전형)

```python
# L323-L349
def MACD(
    fast: int = 12,
    slow: int = 26,
    signal: int = 9,
    output: str = "value",
    alias: str = None
) -> Indicator:
    """MACD (Moving Average Convergence Divergence)
    ...
        macd = MACD()
        macd_signal = MACD(output="signal")
        condition = macd.crosses_above(macd_signal)
    """
    return Indicator(
        "macd",
        {"fast": fast, "slow": slow, "signal": signal},
        output=output,
        alias=alias
    )
```
- **무엇을**: 파라미터 3개 + **`output`** 을 `Indicator` 의 `output=` 자리에 그대로 전달.
- **왜 output 이 필요한가**: MACD 한 번 계산이면 본선(value)·신호선(signal)·히스토그램(histogram) 세 가지가 동시에 나옵니다. `MACD()` 는 본선, `MACD(output="signal")` 은 신호선. **두 개를 따로 만들어 교차**(`crosses_above`)시키는 게 전형적 매수 신호.
- **헷갈리는 포인트**: `MACD()` 와 `MACD(output="signal")` 은 **파라미터(fast/slow/signal)가 같으면 같은 지표의 다른 출력**입니다. alias 를 안 줬으니 둘 다 자동 alias 가 `macd_12_26_9` 로 동일해질 수 있는데, codegen 이 `output` 으로 구분합니다. (멀티아웃풋 클래스가 `_base_alias` 를 공유하는 이유와 같은 설계 — 아래 5번 참조.)
- **🚀 비교**: vbt_engine 의 macd 전략(모범 예시 L70-73)은 **여기서 곧장 값을 계산**해 `crossed_above` 했지만, DSL 의 `MACD()` 는 **"교차하라는 규칙"만 적어두고** 계산은 Lean 에 위임합니다. 같은 개념, 다른 실행 시점.

> 💡 정리: 오실레이터 20종도 본질은 이동평균과 동일한 팩토리. 차이는 **(a) 파라미터 개수**, **(b) 일부가 `output` 으로 멀티 출력을 고른다**는 것뿐.

---

### 3) 카테고리 C — 추세 지표 11종 (`L666-L892`) ※주석은 "12개"

#### 전수 매핑표

| 함수 | 라인 | id | 주요 파라미터(기본값) | output 인자 | 한 줄 의미 |
|---|---|---|---|---|---|
| `ADX` | L670 | `adx` | period=14 | value/plus_di/minus_di | 추세 강도(방향 무관) |
| `ADXR` | L686 | `adxr` | period=14 | — | ADX 의 평균(지연 확인) |
| `SAR` | L701 | `sar` | af_start=0.02, af_step=0.02, af_max=0.2 | — | 파라볼릭 SAR(손절점) |
| `CHOP` | L727 | `chop` | period=14 | — | 혼잡 지수(추세 vs 횡보) |
| `COPPOCK` | L742 | `coppock` | short_roc=11, long_roc=14, wma=10 | — | 코폭 곡선(장기 매수) |
| `SUPERTREND` | L768 | `supertrend` | period=10, multiplier=3.0 | — | ATR 기반 추세 추종 |
| `MASS_INDEX` | L788 | `mass_index` | ema_period=9, sum_period=25 | — | 매스 인덱스(반전 감지) |
| `SCHAFF` | L808 | `schaff` | cycle=10, fast=23, slow=50 | — | 샤프 추세 사이클 |
| `FISHER` | L829 | `fisher` | period=10 | — | 피셔 변환 |
| `KST` | L844 | `kst` | roc1/2/3/4=10/15/20/30 | value/signal | Know Sure Thing |
| `VORTEX` | L877 | `vortex` | period=14 | plus_vi/minus_vi | 볼텍스 지표 |

#### 대표 라인별 심화 — `VORTEX` (output 기본값이 "value" 가 아닌 특이 케이스)

```python
# L877-L892
def VORTEX(period: int = 14, output: str = "plus_vi", alias: str = None) -> Indicator:
    """볼텍스 지표 (Vortex Indicator)
    ...
        vi_plus = VORTEX(14, output="plus_vi")
        vi_minus = VORTEX(14, output="minus_vi")
        condition = vi_plus > vi_minus  # 상승 추세
    """
    return Indicator("vortex", {"period": period}, output=output, alias=alias)
```
- **무엇을**: 다른 지표는 `output` 기본값이 `"value"` 인데, VORTEX 는 **`"plus_vi"`** 입니다. 볼텍스는 본선 개념이 없고 +VI/−VI 두 선의 비교가 본질이라, 그냥 `VORTEX()` 만 부르면 +VI 가 나오게 기본값을 잡아둔 것.
- **헷갈리는 포인트**: `output` 기본값이 지표마다 다릅니다(대부분 value, ADX 도 value, VORTEX 만 plus_vi). docstring 의 `output` 허용값 목록을 꼭 확인하세요.
- **⚠️ 카운트 불일치**: 코드 주석은 `추세 지표 (Trend) - 12개`(L667)라고 적었지만 **실제 정의는 11개**입니다. `__all__`(L1674-1684)에도 11개만 들어 있어, "12개"는 주석의 단순 오기로 보입니다.

---

### 4) 카테고리 D — 거래량 9종 (`L895-L1027`) ※주석은 "12개" + 유령 3종

#### 전수 매핑표

| 함수 | 라인 | id | 주요 파라미터(기본값) | 한 줄 의미 |
|---|---|---|---|---|
| `OBV` | L899 | `obv` | (없음) | On Balance Volume |
| `AD` | L913 | `ad` | (없음) | 누적/분산 |
| `ADL` | L927 | `adl` | (없음) | 누적/분산 라인 |
| `CMF` | L941 | `cmf` | period=20 | 채킨 머니플로우 |
| `MFI` | L956 | `mfi` | period=14 | 자금흐름지수(거래량 가중 RSI) |
| `FORCE` | L971 | `force` | period=13 | 포스 인덱스 |
| `VWAP` | L986 | `vwap` | period=14 | 거래량 가중 평균가 |
| `VWMA` | L1001 | `vwma` | period=21 | 거래량 가중 이동평균 |
| `EOM` | L1014 | `eom` | period=14, scale=1000000000 | 움직임의 용이성 |
| ~~`PVT`~~ | — | — | — | **정의 없음**(`__all__` 에만 존재 ⚠️) |
| ~~`NVI`~~ | — | — | — | **정의 없음**(`__all__` 에만 존재 ⚠️) |
| ~~`PVI`~~ | — | — | — | **정의 없음**(`__all__` 에만 존재 ⚠️) |

#### 대표 라인별 심화 — `OBV` (파라미터가 0개인 케이스)

```python
# L899-L910
def OBV(alias: str = None) -> Indicator:
    """OBV (On Balance Volume)

    거래량 누적 지표.
    ...
        condition = OBV() > SMA(20)  # OBV가 이평선 위
    """
    return Indicator("obv", {}, alias=alias)
```
- **무엇을**: 파라미터가 없는 지표는 `params` 자리에 **빈 dict `{}`** 를 넘깁니다. (AD·ADL 도 동일.)
- **왜**: OBV 는 "거래량을 종가 방향대로 누적"하는 계산이라 기간 같은 손잡이가 필요 없습니다. 그래도 `Indicator` 틀은 유지 — params 만 비어 있을 뿐.
- **헷갈리는 포인트**: 빈 dict 면 `Indicator.__post_init__` 의 자동 alias 가 `param_str` 없이 그냥 `"obv"` 가 됩니다(`core/indicator.py:39-40`).

#### 대표 라인별 심화 — `EOM` (scale 같은 비-기간 파라미터)

```python
# L1014-L1027
def EOM(period: int = 14, scale: int = 1000000000, alias: str = None) -> Indicator:
    """움직임의 용이성 (Ease of Movement)
    ...
    """
    return Indicator("eom", {"period": period, "scale": scale}, alias=alias)
```
- **무엇을**: `scale`(10억)은 EOM 값이 너무 작아지지 않도록 곱하는 스케일 팩터. 기간이 아닌 파라미터도 똑같이 params dict 에 담깁니다.
- **⚠️ 카운트 불일치(중요)**: 주석은 `거래량 지표 (Volume) - 12개`(L896)라지만 **실제 함수는 9개**. 나머지 3개(PVT·NVI·PVI)는 **함수 정의가 아예 없는데도** 파일 맨 끝 `__all__`(L1698-1700)에 이름만 올라가 있습니다. → **잠재적 ImportError**(아래 함정 1번 참고).

---

### 5) 카테고리 E — 변동성 7종 (`L1031-L1130`) ※주석은 "10개"

#### 전수 매핑표

| 함수 | 라인 | id / 반환형 | 주요 파라미터(기본값) | 한 줄 의미 |
|---|---|---|---|---|
| `ATR` | L1035 | `atr` | period=14 | 평균진폭(변동성 절대값) |
| `NATR` | L1048 | `natr` | period=14 | 정규화 ATR(%) |
| `BB` | L1063 | **`BollingerBands` 반환** | period=20, std=2.0 | 볼린저 밴드(멀티 출력) |
| `STD` | L1077 | `std` | period=21 | 표준편차 |
| `VARIANCE` | L1090 | `variance` | period=21 | 분산 |
| `BETA` | L1103 | `beta` | period=21 | 벤치마크 대비 변동성 |
| `ALPHA` | L1118 | `alpha` | period=21 | 벤치마크 대비 초과수익 |

#### 대표 라인별 심화 — `BB` (혼자만 `Indicator` 가 아닌 `BollingerBands` 반환!)

```python
# L1063-L1074
def BB(period: int = 20, std: float = 2.0) -> BollingerBands:
    """볼린저 밴드 (Bollinger Bands)
    ...
        bb = BB(20, 2.0)
        condition = Price.close() < bb.lower  # 하단 돌파
    """
    return BollingerBands(period, std)
```
- **무엇을**: 이 카테고리에서 **유일하게 `Indicator` 가 아니라 `BollingerBands` 객체**(core/indicator.py:1117)를 반환합니다. 그래서 `alias` 인자도 없습니다.
- **왜 다른가**: 볼린저 밴드는 상단·중단·하단 **세 개의 선**을 동시에 냅니다. 한 `Indicator` 로는 한 선밖에 못 가리키니, `.upper`/`.middle`/`.lower` **프로퍼티로 세 선을 꺼내는 컨테이너 클래스**가 필요합니다.
- **헷갈리는 포인트**: `BB(20, 2.0)` 자체로는 비교를 못 합니다. 반드시 `BB(20).lower` 처럼 **한 선을 꺼내야** `Indicator` 가 되어 `Price.close() < BB(20).lower` 같은 조건을 만들 수 있습니다. (멀티아웃풋 클래스 공통 사용법 — 다음 6번.)
- **⚠️ 카운트 불일치**: 주석은 `변동성 지표 (Volatility) - 10개`(L1032)지만 **실제는 7개**. `__all__`(L1705-1711) 역시 7개만 나열 → 주석 오기.

---

### 6) 카테고리 F — 기타 10종 (`L1133-L1285`)

#### 전수 매핑표

| 함수 | 라인 | id | 주요 파라미터(기본값) | output 인자 | 한 줄 의미 |
|---|---|---|---|---|---|
| `MAXIMUM` | L1137 | `maximum` | period=252 | — | 기간 내 최고가(52주 신고가) |
| `MINIMUM` | L1150 | `minimum` | period=252 | — | 기간 내 최저가 |
| `MIDPOINT` | L1163 | `midpoint` | period=14 | — | 종가 기반 중간값 |
| `MIDPRICE` | L1178 | `midprice` | period=14 | — | 고가·저가 중간값 |
| `LOGR` | L1193 | `logr` | period=1 | — | 로그 수익률 |
| `IBS` | L1206 | `ibs` | (없음) | — | 내부 바 강도 (C−L)/(H−L) |
| `BOP` | L1220 | `bop` | (없음) | — | 힘의 균형 |
| `REGRESSION` | L1234 | `regression` | period=14 | value/slope/intercept | 선형 회귀(LSMA) |
| `PIVOT` | L1250 | `pivot` | left_bars=4, right_bars=2 | high/low | 피봇 포인트(지지/저항) |
| `AUGEN` | L1273 | `augen` | period=3 | — | 오겐 가격 스파이크 |

#### 대표 라인별 심화 — `MAXIMUM` (52주 신고가 돌파 전략의 부품)

```python
# L1137-L1147
def MAXIMUM(period: int = 252, alias: str = None) -> Indicator:
    """기간 내 최고가 (52주 신고가 등)
    ...
        condition = Price.close() > MAXIMUM(252)  # 52주 신고가 돌파
    """
    return Indicator("maximum", {"period": period}, alias=alias)
```
- **무엇을**: 최근 `period` 봉 중 최고가. `period=252`(≈1년 거래일)면 52주 신고가.
- **왜 252**: 주식시장은 1년에 약 252일 개장(vbt_engine 의 momentum_long_days 와 동일한 상식). `Price.close() > MAXIMUM(252)` = "오늘 종가가 1년 최고치 돌파" = 돌파 전략 진입 조건.
- **관련 별칭**: 아래 7번에서 `Maximum = MAXIMUM` 별칭이 생겨 `Maximum(252)` 표기도 됩니다(프리셋 호환).

> 참고: `IBS`·`BOP` 는 거래량/캔들 헬퍼처럼 **파라미터 없는 `{}` 패턴**. `REGRESSION`·`PIVOT` 은 **`output` 으로 멀티 출력**(slope/intercept, high/low) 을 고르는 패턴. 즉 "기타"는 앞 카테고리 패턴들의 모음일 뿐 새 문법이 없습니다.

---

### 7) 멀티아웃풋 클래스 4개 (`L1288-L1515`) — 한 지표가 여러 선을 낼 때

함수가 아니라 **클래스**입니다. 공통 설계가 똑같아 하나(`IchimokuCloud`)만 깊게 보면 나머지(`KeltnerChannels`·`DonchianChannel`·`AccelerationBands`)는 같은 틀입니다.

#### 전수 매핑표

| 클래스 | 라인 | 생성자 파라미터(기본값) | 출력 프로퍼티(=각각 Indicator) |
|---|---|---|---|
| `IchimokuCloud` | L1292 | tenkan=9, kijun=26, senkou_b=52 | `.tenkan` `.kijun` `.senkou_a` `.senkou_b` `.chikou` |
| `KeltnerChannels` | L1382 | period=20, multiplier=2.0 | `.upper` `.middle` `.lower` |
| `DonchianChannel` | L1431 | period=20 | `.upper` `.lower` |
| `AccelerationBands` | L1469 | period=20, width=4.0 | `.upper` `.middle` `.lower` |
| (`BollingerBands`) | core | period=20, std=2.0 | `.upper` `.middle` `.lower` (※ `BB()` 가 생성, core 에서 import) |

#### 라인별 심화 — `IchimokuCloud` (5개 선을 내는 컨테이너)

```python
# L1292-L1323 (요약)
class IchimokuCloud:
    """일목균형표 (Ichimoku Kinko Hyo)
    ...
        condition = ichimoku.tenkan.crosses_above(ichimoku.kijun)  # 매수 신호
    """
    def __init__(self, tenkan: int = 9, kijun: int = 26, senkou_b: int = 52):
        self.tenkan_period = tenkan
        self.kijun_period = kijun
        self.senkou_b_period = senkou_b

    @property
    def _base_alias(self) -> str:
        """공통 alias (멀티 아웃풋 지표는 같은 alias 사용)"""
        return f"ichimoku_{self.tenkan_period}_{self.kijun_period}"

    @property
    def tenkan(self) -> Indicator:
        """전환선 (Tenkan-sen) - 단기 추세"""
        return Indicator(
            "ichimoku",
            {"tenkan": ..., "kijun": ..., "senkou_b": ...},
            alias=self._base_alias,
            output="tenkan"
        )
```
- **무엇을**: 생성자에 파라미터를 보관해두고, **각 선을 `@property` 로 노출**. `.tenkan` 을 읽는 순간 `output="tenkan"` 인 `Indicator` 가 즉석에서 만들어집니다(`.kijun`·`.senkou_a/b`·`.chikou` 도 동일, 다른 output).
- **왜 `_base_alias` 를 공유하나(핵심 설계)**: 다섯 선은 **같은 일목균형표 한 번의 계산**에서 나옵니다. 그래서 alias 를 `ichimoku_9_26` 으로 통일해 codegen 이 "지표를 한 번만 초기화하고 output 으로 선을 구분"하게 합니다. 만약 선마다 alias 가 달랐다면 같은 계산을 5번 중복했겠죠.
- **헷갈리는 포인트**: `IchimokuCloud()` 자체는 비교 불가. 반드시 `.tenkan` 같은 **선 하나를 꺼내야** `Indicator` 가 되어 `crosses_above` 등을 쓸 수 있습니다. (`BB`·켈트너·돈치안·가속밴드 전부 동일 규칙.)
- **`@property` 란**: 메서드를 **괄호 없이 속성처럼** 부르게 해주는 데코레이터. `ichimoku.tenkan`(괄호X)로 호출되며, 매번 새 `Indicator` 를 생성해 반환합니다.

> 💡 멀티아웃풋 4클래스는 전부 `__init__`(파라미터 저장) + `_base_alias`(공유 별칭) + `output` 다른 프로퍼티들의 **같은 복붙 구조**. KeltnerChannels/DonchianChannel/AccelerationBands 는 선 개수와 id 만 다릅니다(각각 `keltner`/`donchian`/`accbands`).

---

### 8) 별칭 3개 (`L1518-L1524`)

```python
# L1518-L1524
# ============================================================
# Aliases for compatibility
# ============================================================

Stochastic = STOCH  # 프리셋 전략에서 사용
Maximum = MAXIMUM  # Maximum(252) 형태 지원
Minimum = MINIMUM  # Minimum(252) 형태 지원
```
- **무엇을**: 기존 함수에 **두 번째 이름**을 붙입니다. `Stochastic` 은 `STOCH` 와 **완전히 같은 함수 객체**(메모리 공유). 새 함수가 아님.
- **왜**: preset 전략 코드가 `Stochastic(...)`·`Maximum(252)` 같은 **카멜케이스/첫 글자 대문자 표기**로 작성돼 있어, 하위호환을 위해 별칭을 둡니다. (대문자 전체 `STOCH` vs 카멜 `Stochastic` 표기 취향 차이.)
- **헷갈리는 포인트**: `Stochastic is STOCH` → `True`. 별칭은 **사본이 아니라 같은 것을 가리키는 또 다른 이름표**입니다.

---

### 9) 캔들 패턴 팩토리 19개 (`L1527-L1623`)

지표가 아니라 **캔들스틱 패턴**을 만드는 팩토리. 전부 인자 0개이고 `CandlestickPattern(id)` 한 줄을 반환합니다.

#### 전수 매핑표

| 함수 | 라인 | id | 한 줄 의미 |
|---|---|---|---|
| `Doji` | L1531 | `doji` | 시가≈종가(망설임) |
| `DragonflyDoji` | L1536 | `dragonfly_doji` | 긴 아래꼬리, 상승 반전 |
| `GravestoneDoji` | L1541 | `gravestone_doji` | 긴 위꼬리, 하락 반전 |
| `Hammer` | L1546 | `hammer` | 하락 후 상승 반전 |
| `HangingMan` | L1551 | `hanging_man` | 상승 후 하락 반전 |
| `InvertedHammer` | L1556 | `inverted_hammer` | 하락 후 상승 반전 |
| `ShootingStar` | L1561 | `shooting_star` | 상승 후 하락 반전 |
| `Marubozu` | L1566 | `marubozu` | 장대봉(강한 추세) |
| `SpinningTop` | L1571 | `spinning_top` | 팽이형(우유부단) |
| `BeltHold` | L1576 | `belt_hold` | 띠 잡기(반전 가능) |
| `Engulfing` | L1581 | `engulfing` | 장악형(강한 반전) |
| `Harami` | L1586 | `harami` | 잉태형(반전 가능) |
| `HaramiCross` | L1591 | `harami_cross` | 잉태 십자형(강한 반전) |
| `Piercing` | L1596 | `piercing` | 관통형(상승 반전) |
| `DarkCloudCover` | L1601 | `dark_cloud_cover` | 먹구름형(하락 반전) |
| `MorningStar` | L1606 | `morning_star` | 샛별형(강한 상승 반전) |
| `EveningStar` | L1611 | `evening_star` | 저녁별형(강한 하락 반전) |
| `ThreeWhiteSoldiers` | L1616 | `three_white_soldiers` | 적삼병(강한 상승) |
| `ThreeBlackCrows` | L1621 | `three_black_crows` | 흑삼병(강한 하락) |

#### 대표 라인별 심화 — `Hammer`

```python
# L1546-L1548
def Hammer() -> CandlestickPattern:
    """망치형 - 하락 후 상승 반전"""
    return CandlestickPattern("hammer")
```
- **무엇을**: 인자 없이 `CandlestickPattern("hammer")` 한 개 반환. 지표 헬퍼와 똑같은 팩토리 패턴, 반환형만 다름.
- **어떻게 조건이 되나**: `CandlestickPattern` 은 `is_bullish()`/`is_bearish()`/`is_detected()` 메서드를 가집니다(`core/candlestick.py:35-45`). 그래서 `Hammer().is_bullish()` 처럼 써서 `Condition("pattern_bullish", ...)` 을 만듭니다. (지표는 `>`/`<` 로 조건이 되지만, 캔들은 메서드 호출로 조건이 됩니다.)
- **헷갈리는 포인트**: 캔들 헬퍼는 **파라미터가 없습니다**(`Hammer()` 빈 괄호 필수). 패턴 정의가 고정 규칙이라 손잡이가 없는 것.

---

### 10) `__all__` 공개 명단 (`L1626-L1765`)

```python
# L1626-L1765 (구조만)
__all__ = [
    "SMA", "EMA", ...,         # 이동평균
    "RSI", "STOCH", ...,       # 오실레이터
    "ADX", ...,                # 추세
    "OBV", ..., "PVT", "NVI", "PVI",   # 거래량 ⚠️ 뒤 3개는 정의 없음
    "ATR", ...,                # 변동성
    "MAXIMUM", ...,            # 기타
    "BollingerBands", "IchimokuCloud", ...,  # 멀티아웃풋
    "Price",                   # 가격
    "Doji", ..., "ThreeBlackCrows",          # 캔들 19
]
```
- **무엇을**: `from kis_backtest.dsl.helpers import *` 했을 때 **밖으로 노출할 이름 목록**. 파이썬의 공개 API 화이트리스트.
- **왜**: 내부 보조 심볼(import 한 `Indicator` 등)이 `*` 로 새어나가지 않게 하고, "이 모듈이 제공하는 공식 부품"을 문서처럼 선언합니다.
- **⚠️ 진짜 버그**: `__all__` 의 거래량 구획에 **`"PVT"`, `"NVI"`, `"PVI"`(L1698-1700)** 가 있는데 **이 파일에 해당 함수 정의가 없습니다**(Grep 확인 완료). `import *` 시 파이썬이 정의되지 않은 이름을 내보내려다 **`AttributeError`** 를 낼 수 있습니다. 실제로 한 단계 위 `dsl/__init__.py`(L69-77)는 이 셋을 **재export 하지 않아** 사고를 우회하고 있습니다 — 즉 "지뢰가 묻혀 있으나 윗 포장지가 그 칸을 안 건드려 터지지 않은" 상태. (함정 1번에서 상세.)
- **참고**: `__all__` 에는 `Price`·`BollingerBands` 도 들어 있는데, 이 둘은 이 파일에서 정의한 게 아니라 **core 에서 import 해 re-export** 한 것(L11). `Stochastic`·`Maximum`·`Minimum` 별칭도 명단에 포함됩니다.

---

## ⚠️ 함정·주의

1. **`__all__` 의 유령 심볼 — PVT·NVI·PVI (실재 버그).**
   `__all__`(L1698-1700)이 정의되지 않은 `PVT/NVI/PVI` 를 내보내려 합니다. `from ...helpers import *` 를 직접 하면 **AttributeError** 위험. 지금은 `dsl/__init__.py` 가 이 셋을 재export 명단(L69-77)·`__all__`(L210-218)에서 **빼놓아** 사고가 안 나지만, 누군가 helpers 를 직접 `import *` 하거나 `__init__` 을 helpers 의 `__all__` 과 동기화하면 깨집니다. **고치려면** PVT/NVI/PVI 함수를 추가하거나 `__all__` 에서 세 줄을 제거해야 합니다.

2. **카테고리 주석의 개수 ≠ 실제 함수 개수.** 추세("12개"→실제 11), 거래량("12개"→실제 9), 변동성("10개"→실제 7). 주석 숫자를 신뢰하지 말고 정의/`__all__` 을 기준으로 삼으세요. (이동평균 14·오실레이터 20·기타 10·캔들 19 는 주석과 일치.)

3. **타입힌트 `alias: str = None` 은 부정확.** 올바르게는 `Optional[str] = None`. 파이썬이 런타임에 강제하지 않아 **동작엔 무해**하지만, mypy 같은 정적검사기는 경고합니다. 학습용으로는 "별칭은 선택 인자"로 이해하면 충분.

4. **멀티아웃풋 객체는 그 자체로 비교 불가.** `BB(20)`, `IchimokuCloud()`, `KeltnerChannels()` 등은 **`Indicator` 가 아닙니다.** 반드시 `.lower`/`.tenkan`/`.upper` 처럼 **선 하나를 꺼내야** `>`·`crosses_above` 가 됩니다. `Price.close() < BB(20)` 는 틀리고, `Price.close() < BB(20).lower` 가 맞습니다.

5. **`output` 기본값이 지표마다 다름.** 대부분 `"value"` 지만 `VORTEX` 는 `"plus_vi"`. 멀티출력 지표(MACD·STOCH·AROON·ADX·TSI·KST·PPO·REGRESSION·PIVOT·VORTEX 등)는 docstring 의 허용값 목록을 확인하고 명시적으로 `output=` 을 주는 게 안전.

6. **`params` dict 의 키 철자가 곧 계약.** `{"period": ...}`, `{"fast":..., "slow":...}` 의 키 이름을 codegen/validator 가 그대로 Lean 지표 파라미터에 매핑합니다. 헬퍼를 새로 만들 때 키 오타는 "조용히 무시되거나" 검증 단계에서 에러납니다.

7. **이 파일은 계산하지 않는다 — '선언'일 뿐.** `SMA(20)` 은 이동평균을 **계산하지 않습니다.** "sma 를 period=20 으로 쓰겠다는 의도"만 객체로 적습니다. 실제 숫자는 codegen → Lean 단계에서 나옵니다. (vbt_engine 과 가장 큰 철학 차이.)

8. **`Stochastic`/`Maximum`/`Minimum` 은 사본이 아니라 같은 함수.** 별칭을 수정하면 원본도 바뀐다고 오해하기 쉬운데, 둘은 같은 객체를 가리키는 두 이름표일 뿐 — 함수 본문은 한 벌입니다.

---

## 🚀 고도화 (강의·개선 버전용)

- **유령 심볼 정리(즉시 가치):** PVT·NVI·PVI 를 실제 구현(거래량 추세 지표 3종)으로 채우거나, `__all__` 에서 제거. + 카테고리 주석 개수를 실제와 일치시키면 신뢰도 상승. 강의에서 "`__all__` 과 실제 정의가 어긋나면 어떤 사고가 나는가"의 산 교재.
- **DRY 리팩터링:** 80개 함수가 거의 동일한 `return Indicator(id, params, ...)` 형태이므로, **메타프로그래밍**(스펙 테이블 → 함수 자동 생성)으로 줄일 수 있습니다. 다만 IDE 자동완성·docstring 가독성은 지금의 "명시적 80개" 쪽이 우수 — **트레이드오프 토론 소재**.
- **자연어 → 전략 자동 생성:** 이 헬퍼들은 LLM 이 "골든크로스 + RSI 과매도" 같은 자연어를 `(SMA(5) > SMA(20)) & (RSI(14) < 30)` 코드로 번역하기 좋은 **안전한 어휘집**입니다. 우리 메모리의 "자연어→전략" 경로에서 이 카탈로그를 함수 화이트리스트로 쓰면 환각/임의코드 위험을 줄입니다.
- **타입 안정성:** `alias: str = None` → `Optional[str]` 로 일괄 수정, 반환형 정확화. mypy CI 추가 시 유령 심볼·타입 오류를 빌드에서 잡습니다.
- **검증 강화:** 헬퍼 단계에서 `period <= 0` 같은 명백한 잘못을 즉시 `ValueError` 로 막으면(현재는 그대로 통과 → 뒤 validator/codegen 까지 가서야 실패), 사용자 피드백이 빨라집니다.
- **멀티아웃풋 일반화:** 4개 멀티아웃풋 클래스의 복붙 구조를 공통 베이스 클래스로 추출(`_MultiOutput(base_id, outputs)`)하면 새 채널 지표 추가가 한 줄로 끝납니다.

---

## 📚 용어 사전 (이 파일 한정)

| 용어 | 뜻 |
|---|---|
| **팩토리 함수** | 객체를 만들어 돌려주는 함수. `SMA(20)` → `Indicator` |
| **DSL(선언적 기술)** | 계산을 직접 하지 않고 "무엇을 할지 규칙을 객체로 적어두는" 방식 |
| **`Indicator`** | 지표 한 개의 설명서(`id`·`params`·`alias`·`output`). 비교 연산자 오버로딩으로 조건 생성 |
| **연산자 오버로딩** | `>`·`<`·`&` 를 클래스에 재정의. `SMA(5)>SMA(20)` 이 `Condition` 객체를 만들게 함 |
| **`alias`(별칭)** | 지표를 부를 변수 이름. 안 주면 `id+파라미터` 로 자동 생성 |
| **`output`(출력 선택)** | 한 지표가 여러 선을 낼 때 어느 선을 쓸지(MACD value/signal/histogram) |
| **`params` dict** | 지표 파라미터 모음. **키 철자가 codegen 과의 계약** |
| **멀티아웃풋 클래스** | 여러 선을 내는 지표(BB·Ichimoku·Keltner·Donchian·AccBands). `.upper`/`.tenkan` 등으로 선을 꺼냄 |
| **`@property`** | 메서드를 괄호 없이 속성처럼 호출하게 하는 데코레이터. `bb.lower` |
| **`_base_alias`** | 멀티아웃풋의 여러 선이 **공유하는 별칭** — 같은 계산을 한 번만 하게 함 |
| **`CandlestickPattern`** | 캔들 패턴 객체. `is_bullish()`/`is_bearish()` 로 조건 생성(지표의 `>` 와 대응) |
| **`__all__`** | `import *` 시 노출할 공개 심볼 화이트리스트 |
| **별칭(alias 변수)** | `Stochastic = STOCH` — 같은 함수에 붙인 두 번째 이름(사본 아님) |
| **유령 심볼** | `__all__` 에는 있으나 정의가 없는 이름(PVT/NVI/PVI). `import *` 시 에러 위험 |
| **52주 신고가** | 최근 약 252거래일(1년) 중 최고가. `MAXIMUM(252)` 로 표현 |
