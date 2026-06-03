# `core/indicator.py` — 기술적 지표 객체 & 레지스트리 (완전 라인별 해설)

> 원본: `analytics/app/lean/kis_backtest/core/indicator.py` (1164줄)
> 상위 지도: [`10_vendor_kis_backtest/00_overview.md`](00_overview.md) · 형식 기준: 모범 [`01_backtest/vbt_engine.md`](../01_backtest/vbt_engine.md) · [`README.md` "3. 공통 형식"](../README.md)

---

## 📌 이 파일 한눈에

이 파일은 **"차트 분석 도구상자(指標 카탈로그)"** 입니다. SMA·EMA·RSI·MACD·볼린저밴드 같은 **기술적 지표 70여 종의 "명함첩"** 을 한 곳에 모아둔 파일입니다.

> ⚠️ **가장 먼저 알아야 할 핵심 한 가지**: 이 파일은 지표의 **계산식(수학)을 직접 구현하지 않습니다.** SMA 의 평균을 더하거나 RSI 의 분모를 나누는 코드는 여기 **한 줄도 없습니다.** 실제 계산은 **Lean(QuantConnect) 엔진**이 합니다. 이 파일이 하는 일은 오직 두 가지입니다:
>
> 1. **"이 지표를 Lean 의 어떤 클래스로, 어떻게 초기화하고, 결과값을 어디서 꺼내는지"** 를 적은 **번역 명함(`IndicatorInfo`)** 을 보관하는 것.
> 2. 전략을 사람이 쉽게 쓰도록 `SMA(5) > SMA(20)` 같은 **비교식을 객체로 만드는** 연산자 오버로딩 (`Indicator` 클래스).
>
> 즉 이 파일은 **"레시피 책"이 아니라 "레시피 책의 색인(목차)이자 주문서 양식"** 입니다. 요리(계산)는 Lean 이라는 주방이 하고, 이 파일은 "20일 단순이동평균 주세요 → Lean 의 `SimpleMovingAverage(20)` 로 주문하면 됨, 결과는 `.Current.Value` 에서 꺼냄" 이라는 **주문 전표**만 들고 있습니다.

이 파일에는 **세 종류의 등장인물**이 있습니다:

| 등장인물 | 한 줄 역할 | 비유 |
|---|---|---|
| `Indicator` (클래스) | 지표 한 개를 객체로 표현 + `>`·`<`·`crosses_above` 연산자 오버로딩 | "SMA(20)" 이라고 적힌 **카드 한 장** (다른 카드와 부등호로 연결 가능) |
| `INDICATOR_REGISTRY` (dict) | 지표 78개의 "Lean 번역 명함"(`IndicatorInfo`) 명부 | **명함첩** — "이 지표 = Lean 의 이 클래스" 매핑 |
| `Price` / `BollingerBands` (헬퍼 클래스) | 가격(종가/고가…)과 다중출력 지표(밴드 상/중/하)를 편하게 꺼내는 손잡이 | 자주 쓰는 카드의 **단축 발급기** |

**누가 호출하나?** → 같은 라이브러리의 **`codegen/generator.py`(LeanCodeGenerator)** 가 `INDICATOR_REGISTRY` 를 읽어 "이 전략엔 SMA(20) 이 필요하구나 → `self.sma_20 = SimpleMovingAverage(20)` 라는 Lean 코드를 짜자" 라고 코드를 생성합니다. 또 `dsl/helpers.py` 의 `SMA(5)` 같은 팩토리 함수가 결국 이 파일의 `Indicator` 객체를 만들어 냅니다. (근거: 상위 개요 [`00_overview.md`](00_overview.md) 의 `core/` 절 · 데이터 흐름도.)

### 지표 분류 (이 파일이 담은 6+1 그룹)

이 파일 안 주석이 직접 그어놓은 분류선(`# ====` 헤더)을 그대로 옮기면:

| 그룹 | 주석상 개수 | 대표 지표 | 한 줄 성격 |
|---|---|---|---|
| 이동평균 (Moving Averages) | 14개 | sma·ema·dema·hma·kama | 추세의 "평균 위치" — 노이즈 제거 |
| 오실레이터 (Oscillators) | 20개 | rsi·stochastic·macd·cci | 모멘텀/과매수·과매도 |
| 추세 (Trend) | 12개 | adx·ichimoku·sar·supertrend | 추세의 "강도·방향" |
| 거래량 (Volume) | 12개 | obv·mfi·vwap·cmf | 가격에 거래량을 곁들여 검증 |
| 변동성 (Volatility) | 10개 | atr·bollinger·keltner·std | 가격이 얼마나 출렁이나 |
| 기타 (Misc) | 10개 | maximum·minimum·regression·pivot | 통계·극값·회귀 |
| 커스텀 (Custom) | (별도) | consecutive·disparity·returns | Lean 표준에 없어 직접 조립 |

> 💡 주석의 "개수"는 작성자가 적은 의도이고, **실제 등록된 항목 수**는 뒤 매핑표에서 한 개씩 세어 확인합니다(주석과 실제가 다를 수 있으니 — 자세히는 ⚠️ 함정 절 참고).

---

## 🧠 사전 지식 (이거 모르면 막힘)

### 1) "기술적 지표(Technical Indicator)"가 뭔가?
- **가격·거래량 데이터(OHLCV)를 가공해 만든 보조 숫자**입니다. 원본 가격선만 보면 출렁임이 심해 판단이 어렵습니다. 지표는 그 가격을 **평균 내거나(추세), 속도를 재거나(모멘텀), 폭을 재서(변동성)** "지금 시장이 어떤 상태인지"를 한 숫자로 요약해 줍니다.
- 예: 종가가 매일 100→103→99→105… 처럼 튀어도, **20일 평균(SMA20)** 은 완만한 한 선이라 "큰 흐름이 위인지 아래인지"가 보입니다.

> OHLCV = **O**pen(시가)·**H**igh(고가)·**L**ow(저가)·**C**lose(종가)·**V**olume(거래량). 캔들 하나가 가진 5개 숫자.

### 2) 지표의 4대 성격 분류 (강의 핵심 프레임)
초보가 "지표가 왜 이렇게 많아?"에 막히지 않도록, **목적별 4분류**를 먼저 머리에 넣으면 70종도 한눈에 정리됩니다.

| 성격 | 묻는 질문 | 이 파일의 예 | 비유 |
|---|---|---|---|
| **추세(Trend)** | "방향이 위야 아래야?" | SMA·EMA·ADX·Supertrend·Ichimoku | 강물의 **흐름 방향** |
| **모멘텀(Momentum)** | "얼마나 빠르게 움직여? 과열됐어?" | RSI·MACD·Stochastic·Momentum·CCI | 자동차 **속도계** |
| **변동성(Volatility)** | "얼마나 출렁여? 폭이 넓어졌어?" | ATR·Bollinger·Keltner·StdDev | 파도의 **높이** |
| **거래량(Volume)** | "이 움직임에 사람이 몰렸어?(진짜야?)" | OBV·MFI·VWAP·CMF | 시위대 **머릿수**(진심도) |

> 이 4분류는 절대적이지 않습니다(MACD 처럼 추세+모멘텀 양다리도 많음). 하지만 "이 지표는 주로 무엇을 재나"를 잡는 **출발점**으로는 최고입니다.

### 3) "단순/지수 가중"의 차이 — 평균 내는 방식
- **단순(Simple)**: 최근 N개를 **똑같은 무게**로 평균. (예: 20일 모두 1/20씩.)
- **지수(Exponential)**: **최근 값일수록 무게를 크게**. → 가격 변화에 더 빨리 반응(민감), 대신 노이즈도 잘 탐.
- 이 파일은 그 "가중 방식"을 `MovingAverageType.Simple / Exponential / Wilders` 라는 **Lean 열거형**으로 init_template 에 박아둡니다(직접 평균을 계산하진 않음).

### 4) "다중 출력(multiple outputs)" 지표
- 어떤 지표는 결과가 **숫자 하나가 아닙니다.**
  - **볼린저밴드** → 상단·중단·하단 **3개 선**.
  - **MACD** → MACD선·시그널선·히스토그램 **3개**.
  - **스토캐스틱** → %K·%D **2개**.
- 이 파일은 그런 지표에 `value_template=None` 을 주고, 대신 `outputs={"upper": ..., "lower": ...}` 라는 **여러 개의 값 꺼내는 경로**를 따로 적습니다. (단일출력 지표는 반대로 `value_template` 하나만 있고 `outputs` 는 빔.)

### 5) `dataclass` / 연산자 오버로딩 (파이썬 기초 2개)
- **`@dataclass`**: 클래스에 붙이면 `__init__`(생성자)·`__repr__` 등을 자동으로 만들어 줍니다. 즉 **"필드만 적으면 객체가 되는 짧은 문법"**. 여기선 `Indicator`·`ScaledIndicator`·`IndicatorInfo` 가 dataclass.
- **연산자 오버로딩**: `>`·`<`·`*`·`&` 같은 기호의 동작을 클래스에 **재정의**하는 것. 보통 `5 > 3` 은 참/거짓이지만, `SMA(5) > SMA(20)` 은 (이 파일이 `__gt__` 를 재정의했기에) 참/거짓이 아니라 **`Condition` 객체**를 만들어 냅니다. 이게 DSL(선언적 전략 기술)의 마법입니다.

### 6) Lean 의 `.Current.Value` 와 `Update()`
- Lean 의 지표 객체는 매 봉마다 `Update(...)` 로 데이터를 먹고, **최신 계산값**을 `.Current.Value` 에 보관합니다. 그래서 이 파일의 `value_template` 대부분이 `"{name}.Current.Value"` 입니다(`{name}` 은 생성될 변수명 자리표시자).
- 어떤 지표는 종가 한 개로는 못 만들고 **OHLC 전부(고가·저가까지)** 가 필요합니다(예: ATR 은 "오늘 고가−저가"가 필요). 그런 지표엔 `requires_tradebar=True` 가 붙어 "이건 종가만(`Update(시각, 종가)`) 말고 **봉 전체(`Update(TradeBar)`)** 로 먹여야 해"라고 표시합니다.

---

## 🗺 구조 (파일 전체 지도)

```
core/indicator.py  (1164줄)
│
├── import (L1-L11)        condition.py 의 Condition / CompositeCondition 을 가져옴
│
├── ① Indicator        (L14-L114)   ★지표 객체 + 연산자 오버로딩(전략 DSL의 핵심)
│      ├─ 필드: id · params · alias · output
│      ├─ __post_init__:   alias 자동생성(sma_20 …)
│      ├─ 비교 연산자:     __gt__ __lt__ __ge__ __le__  → Condition 반환
│      ├─ 산술 연산자:     __mul__ __rmul__ __add__ __radd__ __sub__ → ScaledIndicator
│      ├─ 메서드:          crosses_above · crosses_below · between
│      └─ to_dict()
│
├── ② ScaledIndicator  (L117-L155)  "MA * 0.9" 같은 스케일/오프셋 표현 (+비교연산자)
│
├── ③ IndicatorInfo    (L162-L188)  ★지표 1개의 "Lean 번역 명함"(frozen dataclass)
│      └─ id·name·lean_class·params·value_template·outputs·init_template·requires_tradebar
│
├── ④ INDICATOR_REGISTRY (L190-L1053) ★명함첩 — 78개 IndicatorInfo dict
│      ├─ 이동평균   (L194-L320)   sma … vidya
│      ├─ 오실레이터 (L325-L544)   rsi … kvo
│      ├─ 추세       (L549-L685)   adx … fisher
│      ├─ 거래량     (L690-L779)   obv … eom
│      ├─ 변동성     (L784-L897)   atr … alpha
│      ├─ 기타       (L902-L1004)  maximum … augen
│      └─ 커스텀     (L1008-L1052) consecutive … returns
│
├── get_indicator_info() (L1056-L1058)  id로 명함 1장 조회
├── list_indicators()    (L1061-L1072)  전체 목록(요약) 반환
│
├── ⑤ Price            (L1079-L1110)  종가/고가/저가/시가/거래량 → Indicator 발급
└── ⑥ BollingerBands   (L1117-L1164)  밴드 상/중/하를 같은 alias 로 묶어 발급
```

데이터 흐름 한 장:

```
dsl/helpers.SMA(5)  ──►  Indicator("sma", {"period":5})   ← ①
                              │  >  연산자
                              ▼
                         Condition("greater_than", SMA(5), SMA(20))   (condition.py)
                              │
codegen/generator  ──읽음──►  INDICATOR_REGISTRY["sma"]  ← ④ (Lean 클래스/템플릿)
                              │  init_template / value_template 채움
                              ▼
                    "self.sma_5 = SimpleMovingAverage(5)"  ← Lean Python 코드 문자열
```

---

## 📖 지표 전수 매핑표 + 대표 지표 라인별 심화

먼저 **클래스 4개**(Indicator·ScaledIndicator·IndicatorInfo + 헬퍼)를 라인별로 보고, 그다음 **레지스트리 78개 전수 매핑표**, 끝으로 **대표 지표 심화**(공식·계산법) 순으로 갑니다.

### A. 파일 설명서 + import — `L1-L11`

```python
# L1-L11
"""Indicator definitions and registry.

Defines all supported technical indicators with their Lean class mappings.
"""
from __future__ import annotations
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Tuple, Union
from kis_backtest.core.condition import Condition, CompositeCondition
```
- docstring 이 스스로 정체를 밝힙니다: **"지원 지표들을 그 Lean 클래스 매핑과 함께 정의"**. "구현(implement)"이 아니라 "정의(define)·매핑(mapping)" 이라는 단어가 핵심 — 다시 강조하지만 **계산식은 없습니다.**
- `from __future__ import annotations` — 타입힌트를 문자열로 늦게 평가(최신 표기를 위한 주문, vbt_engine 문서와 동일).
- `dataclass, field` — 아래 dataclass 들에서 사용. `field(default_factory=dict)` 는 "기본값이 빈 dict 인데, **매 객체마다 새 dict**" 를 보장(가변 기본값 함정 회피).
- `Condition, CompositeCondition` 을 **`condition.py` 에서 가져옴** — 비교 연산자가 만들 결과물의 "그릇". 이 파일이 condition.py 에 의존(그 반대는 아님).

> 💡 `Tuple` 은 import 됐지만 본문에서 실제 사용처가 보이지 않습니다(레거시/미사용 import 로 보임). 추측 없이 "import 목록에 있으나 본문 사용은 안 보인다"만 사실로 기록합니다.

---

### B. `Indicator` 클래스 — 지표 객체 + 연산자 오버로딩 — `L14-L114` (이 파일의 알맹이 ①)

#### B-1. 필드 정의 — `L14-L34`
```python
# L14-L34
@dataclass
class Indicator:
    """기술적 지표 ... 비교 연산자를 오버로딩하여 직관적인 조건 생성 가능."""
    id: str
    params: Dict[str, Any] = field(default_factory=dict)
    alias: Optional[str] = None
    output: str = "value"
```
- `Indicator` 는 **지표 한 개를 표현하는 카드**입니다. 4개 필드:
  - `id` — 지표 식별자(소문자 문자열): `"sma"`, `"rsi"`, `"macd"` …. 이게 `INDICATOR_REGISTRY` 의 열쇠(key)와 연결됨.
  - `params` — 파라미터 dict: `{"period": 20}` 또는 `{"fast":12,"slow":26,"signal":9}`.
  - `alias` — 코드에서 쓸 **변수 별칭**(예: `sma_20`). None 이면 자동 생성(아래).
  - `output` — 어느 출력값인지. 단일출력은 `"value"`, 다중출력은 `"upper"`/`"signal"`/`"k"` 등.
- 예: `Indicator("sma", {"period": 20})` = "20일 단순이동평균 카드 한 장".

#### B-2. alias 자동 생성 — `L36-L40`
```python
# L36-L40
def __post_init__(self) -> None:
    if self.alias is None:
        param_str = "_".join(str(v) for v in self.params.values())
        self.alias = f"{self.id}_{param_str}" if param_str else self.id
```
- `__post_init__` 은 dataclass 가 객체를 만든 **직후** 자동 호출하는 후처리 훅.
- alias 를 안 줬으면, **id + 파라미터값들을 `_` 로 이어** 만듭니다.
  - `Indicator("sma", {"period":20})` → `alias = "sma_20"`.
  - `Indicator("macd", {"fast":12,"slow":26,"signal":9})` → `alias = "macd_12_26_9"`.
  - 파라미터가 없으면(`{}`) → alias 는 그냥 `id`(예: `"obv"`).
- **왜?** 생성될 Lean 코드에서 **변수 이름이 충돌하지 않게** 고유 이름을 자동 부여하기 위함(`self.sma_20`, `self.sma_60` 처럼).

> ⚠️ 헷갈리는 포인트: alias 는 **params 의 "값"만** 이어 붙입니다(키 이름 없이). 그래서 `{"period":20}` 든 `{"window":20}` 든 alias 는 똑같이 `sma_20`. 또 dict 값 순서대로 붙으므로 파라미터 **순서가 alias 에 반영**됩니다.

#### B-3. 비교 연산자 오버로딩 — `L42-L57` (DSL 의 심장)
```python
# L42-L57
def __gt__(self, other):   return Condition("greater_than", self, other)   # >
def __lt__(self, other):   return Condition("less_than", self, other)      # <
def __ge__(self, other):   return Condition("greater_equal", self, other)  # >=
def __le__(self, other):   return Condition("less_equal", self, other)     # <=
```
- 파이썬은 `a > b` 를 만나면 내부적으로 `a.__gt__(b)` 를 호출합니다. 이 4개를 재정의했기에:
  - `SMA(5) > SMA(20)` → `Condition("greater_than", SMA(5), SMA(20))` **객체**를 반환.
  - 즉 **"비교"가 참/거짓이 아니라 "규칙(조건) 객체"** 가 됩니다. 이게 코드 생성기가 나중에 읽어 if 문으로 번역할 재료.
- `other` 는 다른 `Indicator` 일 수도, 숫자(`RSI(14) > 70`)일 수도 있습니다(타입힌트 `Union[Indicator, float, int]`).

> 💡 이 4줄이 `vbt_engine` 의 `crossed_above`(값으로 신호 만들기)와 본질적으로 다른 점: 거긴 **즉시 True/False 시리즈**를 만들고, 여긴 **"규칙을 객체로 적어두고 나중에 Lean 코드로 번역"** 합니다. (00_overview 의 핵심개념 1번과 동일.)

#### B-4. 산술 연산자 오버로딩 → `ScaledIndicator` — `L59-L81`
```python
# L59-L81
def __mul__(self, other):   return ScaledIndicator(self, other, "mul")   # MA * 0.9
def __rmul__(self, other):  return ScaledIndicator(self, other, "mul")   # 0.9 * MA
def __add__(self, other):   return ScaledIndicator(self, other, "add")   # MA + 1000
def __radd__(self, other):  return ScaledIndicator(self, other, "add")   # 1000 + MA
def __sub__(self, other):   return ScaledIndicator(self, other, "sub")   # MA - 500
```
- `MA * 0.9`("이평선의 90% 아래로 떨어지면 매수" 같은 전략)를 표현하려고 곱셈/덧셈/뺄셈을 오버로딩.
- 결과는 숫자가 아니라 `ScaledIndicator(원본지표, 스칼라, 연산종류)` 객체(아래 C 절).
- **`__rmul__`·`__radd__`(역방향)** 가 따로 있는 이유: 파이썬은 `0.9 * MA` 에서 먼저 `float.__mul__(MA)` 를 시도하는데 float 는 Indicator 를 모르므로 실패 → 그럼 **오른쪽 객체의 `__rmul__`** 을 호출합니다. 그래서 `MA * 0.9` 와 `0.9 * MA` **둘 다** 되게 양쪽을 정의.

> ⚠️ 헷갈리는 포인트: **나눗셈(`__truediv__`)·역뺄셈(`__rsub__`)은 정의돼 있지 않습니다.** ScaledIndicator 의 docstring/to_dict 엔 `"div"` 가 언급되지만, 실제 `Indicator` 에서 `/` 를 오버로딩한 코드는 **없습니다.** 그러므로 `MA / 2` 나 `1000 - MA` 는 이 파일만으로는 의도대로 동작하지 않습니다(추측 없이 — 코드에 없는 게 사실).

#### B-5. 교차·범위 메서드 — `L83-L105`
```python
# L83-L105
def crosses_above(self, other):  return Condition("cross_above", self, other)   # 골든크로스
def crosses_below(self, other):  return Condition("cross_below", self, other)   # 데드크로스
def between(self, low, high):    return (self >= low) & (self <= high)
```
- `crosses_above/below` — "한 선이 다른 선을 **뚫고** 위로/아래로" 라는 **교차 순간** 조건. `SMA(5).crosses_above(SMA(20))` = 골든크로스.
  - B-3 의 `>` 는 "지금 위에 있나"(상태), 이건 "방금 위로 넘었나"(이벤트) — **다릅니다.**
- `between(30, 70)` — "30 이상 **그리고** 70 이하". 내부적으로 `(self >= low) & (self <= high)` 인데, 여기서 `&` 는 `Condition` 객체끼리의 AND(condition.py 가 오버로딩) → 결과는 `CompositeCondition`. 그래서 반환타입이 `CompositeCondition`.
  - 예: `RSI(14).between(30, 70)` = "RSI 가 30~70 사이일 때".

#### B-6. `to_dict()` — `L107-L114`
```python
# L107-L114
def to_dict(self):
    return {"id": self.id, "alias": self.alias, "params": self.params, "output": self.output}
```
- 지표 객체를 **순수 dict(선언적 정의)** 로 직렬화. JSON 저장·schema 변환·codegen 입력으로 넘길 때 사용.

---

### C. `ScaledIndicator` 클래스 — "MA * 0.9" 표현 — `L117-L155`

```python
# L117-L130
@dataclass
class ScaledIndicator:
    """스케일된 지표 (Indicator * scalar, + offset 등)"""
    indicator: Indicator
    scalar: Union[float, int]
    operation: str = "mul"
```
- `Indicator` 에 곱/합/차 연산을 적용한 결과를 담는 그릇: 원본 지표 + 스칼라값 + 연산종류.

```python
# L132-L146  (비교 연산자 — 인자 순서가 뒤집힌 것에 주목)
def __gt__(self, other):  return Condition("greater_than", other, self)
def __lt__(self, other):  return Condition("less_than", other, self)
def __ge__(self, other):  return Condition("greater_equal", other, self)
def __le__(self, other):  return Condition("less_equal", other, self)
```
- ScaledIndicator 도 비교 연산자를 가집니다(예: `Price.close() < MA*0.9`).
- ⚠️ **인자 순서가 `Indicator` 와 반대**입니다. `Indicator.__gt__` 는 `Condition(op, self, other)` 인데 여기는 `Condition(op, other, self)`. 즉 `scaled > x` 를 `Condition(greater_than, x, scaled)` 로 만듭니다.
  - 이는 보통 `Price.close() < (MA * 0.9)` 형태로 **가격(Indicator)을 왼쪽, ScaledIndicator 를 오른쪽**에 두고 쓰기 때문에, 조건 객체 안에서 (가격, 스케일지표) 순서를 일관되게 맞추려는 의도로 보입니다. (조건 평가의 좌/우 배치를 codegen 이 어떻게 쓰는지는 condition.py/generator 문서 영역.)

```python
# L148-L155
def to_dict(self):
    return {"type": "scaled_indicator", "indicator": self.indicator.to_dict(),
            "scalar": self.scalar, "operation": self.operation}
```
- 직렬화 시 `"type": "scaled_indicator"` 태그를 달아 일반 Indicator 와 구분.

---

### D. `IndicatorInfo` — 지표 1개의 "Lean 번역 명함" — `L162-L188` (알맹이 ③)

```python
# L162-L188
@dataclass(frozen=True)
class IndicatorInfo:
    id: str
    name: str
    lean_class: str
    params: List[str]
    value_template: Optional[str]
    outputs: Dict[str, str] = field(default_factory=dict)
    init_template: str = ""
    description: str = ""
    requires_tradebar: bool = False
```
이게 명함첩의 **명함 한 장 양식**입니다. 필드별 뜻 + 예시(sma 기준):

| 필드 | 뜻 | sma 예시 |
|---|---|---|
| `id` | 식별자 | `"sma"` |
| `name` | 사람이 읽을 이름 | `"Simple Moving Average"` |
| `lean_class` | **Lean 의 실제 클래스명** | `"SimpleMovingAverage"` |
| `params` | 받는 파라미터 이름 목록 | `["period"]` |
| `value_template` | 단일 결과값 꺼내는 경로 | `"{name}.Current.Value"` |
| `outputs` | 다중 결과값 경로들(dict) | `{}` (sma 는 단일이라 빔) |
| `init_template` | **Lean 초기화 코드 템플릿** | `"{name} = SimpleMovingAverage({period})"` |
| `description` | 설명 | `"단순 이동평균"` |
| `requires_tradebar` | OHLC 봉 전체 필요? | `False` (종가만으로 OK) |

- `@dataclass(frozen=True)` — **불변(frozen)**: 한 번 만들면 못 바꿈. 레지스트리의 명함은 상수표라 안전하게 고정.
- `{name}`·`{period}` 같은 **중괄호**는 자리표시자(placeholder). codegen 이 나중에 `str.format(name="sma_20", period=20)` 으로 실제 값을 채워 진짜 코드 줄을 완성합니다.

> 💡 `value_template` 이 `None` 이면 "단일값 없음 = 다중출력 지표" 라는 신호. 그런 지표는 `outputs` 를 봐야 합니다(볼린저·MACD·스토캐스틱 등).

---

### E. `INDICATOR_REGISTRY` — 78개 지표 전수 매핑표 — `L190-L1053` (알맹이 ④)

`INDICATOR_REGISTRY` 는 `{id: IndicatorInfo}` dict 입니다. 아래는 **등록된 78개 전수 매핑표**입니다(코드를 한 항목씩 그대로 옮김 — 이름/Lean클래스/파라미터/다중출력/TradeBar필요/라인). `MO?`=다중출력(outputs 보유), `TB?`=requires_tradebar.

#### E-1. 이동평균 계열 — `L194-L320`
| id | Lean 클래스 | params | MO? | TB? | 라인 |
|---|---|---|:--:|:--:|---|
| sma | SimpleMovingAverage | period | | | L194 |
| ema | ExponentialMovingAverage | period | | | L203 |
| dema | DoubleExponentialMovingAverage | period | | | L212 |
| tema | TripleExponentialMovingAverage | period | | | L221 |
| hma | HullMovingAverage | period | | | L230 |
| kama | KaufmanAdaptiveMovingAverage | period | | | L239 |
| alma | ArnaudLegouxMovingAverage | period, sigma, offset | | | L248 |
| lwma | LinearWeightedMovingAverage | period | | | L257 |
| trima | TriangularMovingAverage | period | | | L266 |
| t3 | T3MovingAverage | period, volume_factor | | | L275 |
| zlema | ZeroLagExponentialMovingAverage | period | | | L284 |
| wma | WilderMovingAverage | period | | | L293 |
| frama | FractalAdaptiveMovingAverage | period | | ✅ | L302 |
| vidya | VariableIndexDynamicAverage | period | | | L312 |

> ⚠️ `wma` 의 id 는 "Wilder"(와일더) 인데, 흔히 WMA=Weighted(가중) 와 혼동됩니다. 이 파일은 **Linear Weighted 를 `lwma`**, **Wilder 를 `wma`** 로 둡니다(L257 vs L293). 헷갈리면 `lean_class` 를 보세요.

#### E-2. 오실레이터 계열 — `L325-L544`
| id | Lean 클래스 | params | MO? | TB? | 라인 |
|---|---|---|:--:|:--:|---|
| rsi | RelativeStrengthIndex | period | | | L325 |
| stochastic | Stochastic | k_period, d_period | ✅(k,d) | ✅ | L334 |
| stochrsi | StochasticRelativeStrengthIndex | rsi_period, stoch_period, k_period, d_period | ✅(k,d) | | L348 |
| macd | MovingAverageConvergenceDivergence | fast, slow, signal | ✅(value,signal,histogram) | | L361 |
| cci | CommodityChannelIndex | period | | ✅ | L375 |
| williams_r | WilliamsPercentR | period | | ✅ | L385 |
| momentum | MomentumPercent | period | | | L395 |
| roc | RateOfChangePercent | period | | | L404 |
| apo | AbsolutePriceOscillator | fast, slow | | | L413 |
| ppo | PercentagePriceOscillator | fast, slow | ✅(value,signal,histogram) | | L422 |
| aroon | AroonOscillator | up_period, down_period | ✅(value,aroon_up,aroon_down) | ✅ | L436 |
| cmo | ChandeMomentumOscillator | period | | | L451 |
| ao | AwesomeOscillator | fast, slow | | ✅ | L460 |
| cho | ChaikinOscillator | fast, slow | | ✅ | L470 |
| ultosc | UltimateOscillator | period1, period2, period3 | | ✅ | L480 |
| trix | Trix | period | | | L490 |
| tsi | TrueStrengthIndex | long_period, short_period, signal_period | ✅(value,signal) | | L499 |
| rvi | RelativeVigorIndex | period | | ✅ | L512 |
| dpo | DetrendedPriceOscillator | period | | | L522 |
| kvo | KlingerVolumeOscillator | fast, slow, signal | ✅(value,signal) | ✅ | L531 |

#### E-3. 추세 지표 — `L549-L685`
| id | Lean 클래스 | params | MO? | TB? | 라인 |
|---|---|---|:--:|:--:|---|
| adx | AverageDirectionalIndex | period | ✅(value,plus_di,minus_di) | ✅ | L549 |
| adxr | AverageDirectionalMovementIndexRating | period | | ✅ | L564 |
| ichimoku | IchimokuKinkoHyo | tenkan, kijun, senkou_b | ✅(tenkan,kijun,senkou_a,senkou_b,chikou) | ✅ | L574 |
| sar | ParabolicStopAndReverse | af_start, af_step, af_max | | ✅ | L591 |
| vortex | Vortex | period | ✅(plus_vi,minus_vi) | ✅ | L601 |
| chop | ChoppinessIndex | period | | ✅ | L615 |
| kst | KnowSureThing | roc1, roc2, roc3, roc4 | ✅(value,signal) | | L625 |
| coppock | CoppockCurve | short_roc, long_roc, wma | | | L638 |
| supertrend | SuperTrend | period, multiplier | | ✅ | L647 |
| mass_index | MassIndex | ema_period, sum_period | | ✅ | L657 |
| schaff | SchaffTrendCycle | cycle, fast, slow | | | L667 |
| fisher | FisherTransform | period | | ✅ | L676 |

> 💡 `kst` 의 init_template(L635)은 `KnowSureThing({roc1},{roc2},{roc3},{roc4}, 10,13,15,20, 9)` 처럼 **뒤쪽 숫자(SMA기간들·signal)를 하드코딩**해 둡니다. description(L636)에 그 이유가 박혀 있음: *"Python.NET은 C# 기본값 미지원 → SMA/signal 기본값 명시"* — C# 의 디폴트 인자를 파이썬에서 못 읽어 직접 채운 것.

#### E-4. 거래량 지표 — `L690-L779`
| id | Lean 클래스 | params | MO? | TB? | 라인 |
|---|---|---|:--:|:--:|---|
| obv | OnBalanceVolume | (없음) | | ✅ | L690 |
| ad | AccumulationDistribution | (없음) | | ✅ | L700 |
| adl | AccumulationDistribution | (없음) | | ✅ | L710 |
| cmf | ChaikinMoneyFlow | period | | ✅ | L720 |
| mfi | MoneyFlowIndex | period | | ✅ | L730 |
| force | ForceIndex | period | | ✅ | L740 |
| vwap | VolumeWeightedAveragePriceIndicator | period | | ✅ | L750 |
| vwma | VolumeWeightedMovingAverage | period | | ✅ | L760 |
| eom | EaseOfMovementValue | period, scale | | ✅ | L770 |

> ⚠️ `ad`(L700)와 `adl`(L710)은 **둘 다 Lean 의 `AccumulationDistribution` 로 매핑**됩니다(adl 은 ad 의 별칭 — description 에 명시). id 는 둘이지만 실제 Lean 클래스는 하나.

#### E-5. 변동성 지표 — `L784-L897`
| id | Lean 클래스 | params | MO? | TB? | 라인 |
|---|---|---|:--:|:--:|---|
| atr | AverageTrueRange | period | | ✅ | L784 |
| natr | NormalizedAverageTrueRange | period | | ✅ | L794 |
| bollinger | BollingerBands | period, std | ✅(upper,middle,lower) | | L804 |
| keltner | KeltnerChannels | period, multiplier | ✅(upper,middle,lower) | ✅ | L818 |
| donchian | DonchianChannel | period | ✅(upper,lower) | ✅ | L833 |
| std | StandardDeviation | period | | | L847 |
| variance | Variance | period | | | L856 |
| accbands | AccelerationBands | period, width | ✅(upper,middle,lower) | ✅ | L865 |
| beta | Beta | period | | | L880 |
| alpha | Alpha | period | | | L889 |

#### E-6. 기타 지표 — `L902-L1004`
| id | Lean 클래스 | params | MO? | TB? | 라인 |
|---|---|---|:--:|:--:|---|
| maximum | Maximum | period | | | L902 |
| minimum | Minimum | period | | | L911 |
| midpoint | MidPoint | period | | | L920 |
| midprice | MidPrice | period | | ✅ | L929 |
| logr | LogReturn | period | | | L939 |
| ibs | InternalBarStrength | (없음) | | ✅ | L948 |
| bop | BalanceOfPower | (없음) | | ✅ | L958 |
| regression | LeastSquaresMovingAverage | period | ✅(value,slope,intercept) | | L968 |
| pivot | PivotPointsHighLow | left_bars, right_bars | ✅(high,low) | ✅ | L982 |
| augen | AugenPriceSpike | period | | | L996 |

> 💡 `regression` 의 id 와 description 은 "선형 회귀"인데 Lean 클래스는 `LeastSquaresMovingAverage`(최소제곱 이동평균) 입니다(L968-L971). 회귀선의 기울기·절편을 `slope`/`intercept` 출력으로 꺼낼 수 있게 매핑.

#### E-7. 커스텀 지표 — `L1008-L1052` (Lean 표준에 없어 직접 조립)
| id | lean_class | params | init_template 요지 | 라인 |
|---|---|---|---|---|
| consecutive | `"ConsecutiveDays"`(주석: 커스텀 구현 필요) | direction | `{name} = 0  # ... counter` | L1008 |
| disparity | `""`(빈 문자열) | period | `{name}_sma = SimpleMovingAverage({period})` | L1017 |
| volatility_ind | `""` | period | `{name}_std = StandardDeviation({period})` | L1026 |
| change | `""` | (없음) | `{name} = 0` | L1035 |
| returns | `""` | period | `{name}_roc = RateOfChangePercent({period})` | L1044 |

- 이 5개는 **Lean 에 딱 맞는 단일 클래스가 없어** 직접 만드는 지표입니다. 공통 특징: `value_template="{name}"` (앞 지표들의 `"{name}.Current.Value"` 와 달리 그냥 변수 자체), `lean_class` 가 비었거나 가상 이름.
  - `disparity`(이격도) — description(L1024): **"현재가 / SMA * 100"**. 그래서 init 으로 보조 SMA 부터 깔아둠.
  - `volatility_ind` — "일간 수익률의 표준편차"(보조 StandardDeviation).
  - `change` — "전일대비 등락률(%)", `returns` — "N일 수익률"(보조 ROC).
  - 실제 계산 조립은 codegen/generator 가 이 init 보조변수를 받아 추가 코드를 짭니다(이 파일 밖).

#### E-8. 합계 검산
위 7개 표를 더하면 **14 + 20 + 12 + 9 + 10 + 10 + 5 = 80**… 이 아니라 실제로는:
- 이동평균 14, 오실레이터 20, 추세 12, **거래량 9**(주석은 "12개"라 적혀 있으나 실제 등록은 obv/ad/adl/cmf/mfi/force/vwap/vwma/eom = 9개), 변동성 10, 기타 10, 커스텀 5 → **합계 80**.

> ⚠️ **주석 vs 실제 불일치 주의**: 거래량 헤더 주석(L688)은 "12개"라 적혀 있지만 그 구획에 실제 등록된 항목은 9개입니다. 또 변동성에 들어간 `beta`·`alpha` 는 성격상 통계지표에 가깝고(변동성 구획에 배치됨), `change` 처럼 params 가 빈 커스텀도 있습니다. **숫자는 코드의 실제 항목을 세어 판단**하세요(주석 개수를 그대로 믿지 말 것).

---

### F. 조회 헬퍼 — `get_indicator_info` / `list_indicators` — `L1056-L1072`
```python
# L1056-L1072
def get_indicator_info(indicator_id):  return INDICATOR_REGISTRY.get(indicator_id)

def list_indicators():
    return [{"id": info.id, "name": info.name, "params": info.params,
             "description": info.description,
             "has_multiple_outputs": bool(info.outputs)} for info in INDICATOR_REGISTRY.values()]
```
- `get_indicator_info("rsi")` → rsi 의 `IndicatorInfo` 명함 반환(없으면 `None` — `.get` 이라 KeyError 안 남).
- `list_indicators()` → 전체 지표를 **요약 dict 리스트**로(프론트의 "지표 선택 메뉴" 채우기용). `has_multiple_outputs` 는 `outputs` 가 비었는지로 판정.

---

### G. `Price` 클래스 — 가격값 발급기 — `L1079-L1110`
```python
# L1079-L1110
class Price:
    @staticmethod
    def close():  return Indicator("price", {}, alias="close", output="close")
    @staticmethod
    def high():   return Indicator("price", {}, alias="high", output="high")
    @staticmethod
    def low():    return Indicator("price", {}, alias="low", output="low")
    @staticmethod
    def open():   return Indicator("price", {}, alias="open", output="open")
    @staticmethod
    def volume(): return Indicator("volume", {}, alias="volume", output="value")
```
- 가격 자체(종가/고가/저가/시가)와 거래량을 **`Indicator` 객체로 감싸** 다른 지표와 같은 문법으로 비교 가능하게 함.
  - `Price.close() > SMA(20)` = "종가가 20일선 위" (docstring 예시 L1085).
- 전부 `@staticmethod`(인스턴스 없이 `Price.close()` 로 호출). 가격은 `id="price"`, 거래량만 `id="volume"`.
- ⚠️ `output` 이 각각 close/high/low/open 으로 다름 → codegen 이 이 output 을 보고 어떤 OHLC 필드를 쓸지 결정.

---

### H. `BollingerBands` 클래스 — 다중출력 밴드 발급기 — `L1117-L1164`
```python
# L1117-L1164
class BollingerBands:
    def __init__(self, period=20, std=2.0):
        self.period = period; self.std = std

    @property
    def _base_alias(self):  return f"bb_{self.period}"

    @property
    def upper(self):  return Indicator("bollinger", {"period":..,"std":..}, alias=self._base_alias, output="upper")
    @property
    def middle(self): return Indicator("bollinger", {...}, alias=self._base_alias, output="middle")
    @property
    def lower(self):  return Indicator("bollinger", {...}, alias=self._base_alias, output="lower")
```
- 볼린저밴드는 상/중/하 3선이라, **하나의 객체에서 `.upper`·`.middle`·`.lower` 속성으로** 각 선을 꺼냅니다.
  - `bb = BB(20, 2.0); Price.close() < bb.lower` = "종가가 하단밴드 아래로(과매도)" (docstring L1124).
- 핵심 트릭 — **세 속성이 같은 `_base_alias`(예: `bb_20`)를 공유**합니다(L1133, `output` 만 다름). 왜? Lean 에선 밴드 3개가 **하나의 `BollingerBands` 객체**에서 나오므로, 코드 생성 시 변수도 하나(`self.bb_20`)만 만들고 `.UpperBand`/`.LowerBand` 로 구분해 꺼내기 위함입니다(레지스트리 `bollinger` 의 outputs 와 짝).
- `@property` 라서 괄호 없이 `bb.upper` 로 접근(메서드처럼 `()` 안 붙임).

> ⚠️ 헷갈리는 포인트: 이 파일엔 `BollingerBands` 라는 **이름이 두 번** 나옵니다 — ① 레지스트리 안 `IndicatorInfo` 의 `lean_class="BollingerBands"`(문자열, Lean 클래스명), ② 이 파일 맨 끝의 **파이썬 클래스 `BollingerBands`**(L1117, 사용자 편의 발급기). 서로 다른 것(하나는 문자열, 하나는 실제 클래스)입니다. 다른 다중출력 지표(MACD·스토캐스틱 등)는 이런 전용 클래스가 **없고**, 레지스트리 outputs 로만 다중값을 노출합니다(볼린저만 특별 대우).

---

### 📐 대표 지표 라인별 심화 — 공식·계산법 (초보 눈높이)

> 다시 강조: **아래 공식들은 "Lean 이 내부적으로 계산하는 표준 정의"** 이며, **이 파일 안에는 공식이 없습니다.** 이 파일은 "어느 Lean 클래스로 보낼지"만 적습니다. 학습을 위해 표준 공식을 곁들이되, "이 파일에 있는 것"과 "Lean 이 하는 것"을 분명히 구분합니다.

#### ① 이동평균 — SMA / EMA (`L194-L211`)
**이 파일이 가진 것**: `sma → SimpleMovingAverage(period)`, `ema → ExponentialMovingAverage(period)`, 둘 다 결과는 `.Current.Value`.

**SMA(단순이동평균) 공식** — 최근 N개 종가의 산술평균:
```
SMA_N(오늘) = (P_오늘 + P_어제 + … + P_(N-1일전)) / N
```
- 예: SMA(3), 종가 10·12·14 → (10+12+14)/3 = 12. 다음날 16 들어오면 (12+14+16)/3 = 14 (가장 오래된 10 이 빠짐 — "창(window) 이 미끄러진다").

**EMA(지수이동평균)** — 최근 값에 더 큰 가중:
```
α = 2 / (N + 1)
EMA_오늘 = α · P_오늘 + (1 − α) · EMA_어제
```
- α(평활계수)가 클수록(=N 작을수록) 최근값 반영이 큼. SMA 보다 **반응이 빠르지만** 노이즈도 잘 탐.

> 헷갈리는 포인트: 이 파일은 `dema/tema/hma/kama/…` 등 14종 이동평균을 **이름만 다르게** 매핑할 뿐, 각각의 평활 방식 차이는 Lean 구현에 있습니다. "왜 이렇게 많아?"의 답은 4분류 중 **추세** 안에서 "얼마나 빠르게/매끄럽게 반응하느냐"의 변주들이기 때문.

#### ② RSI — 상대강도지수 (`L325-L333`)
**이 파일이 가진 것**: `rsi → RelativeStrengthIndex(period, MovingAverageType.Wilders)`. 주목할 점은 init_template 에 **`MovingAverageType.Wilders`** 를 박아둔 것 — RSI 의 평균은 단순평균이 아니라 **와일더식 평활**을 쓴다는 표준을 명시.

**RSI 공식**:
```
RS = (N일간 평균 상승폭) / (N일간 평균 하락폭)
RSI = 100 − (100 / (1 + RS))
```
- 결과는 **0~100**. 70 이상=과매수(너무 올랐다), 30 이하=과매도(너무 빠졌다)가 관습 기준선.
- `RSI(14).between(30, 70)`(B-5) 처럼 "중립 구간"을 잡거나, `RSI(14) < 30` 으로 과매도 매수에 씀.

> 헷갈리는 포인트: 평균 하락폭이 0 이면 RS 가 무한대 → RSI=100. Lean 이 처리하지만 개념적으로 "하락이 전혀 없으면 RSI 최댓값" 임을 알아두기.

#### ③ MACD (`L361-L374`)
**이 파일이 가진 것**: `macd → MovingAverageConvergenceDivergence(fast, slow, signal, MovingAverageType.Exponential)`, **다중출력** `value`/`signal`/`histogram` 3개 경로.

**MACD 공식**:
```
MACD선   = EMA_fast(보통 12) − EMA_slow(보통 26)
시그널선 = EMA_signal(보통 9) of MACD선
히스토그램 = MACD선 − 시그널선
```
- MACD선이 시그널선을 **상향 교차**하면 매수 신호(모멘텀 전환). 히스토그램은 둘의 차이를 막대로 — 0 을 넘나드는 지점이 교차점.
- 이 파일은 세 값을 각각 `{name}.Current.Value`(=MACD선)·`.Signal.Current.Value`·`.Histogram.Current.Value` 로 꺼내도록 매핑(L367-L371).

#### ④ 볼린저밴드 (`L804-L817` + 클래스 `L1117-L1164`)
**이 파일이 가진 것**: `bollinger → BollingerBands(period, std, MovingAverageType.Simple)`, 다중출력 `upper`/`middle`/`lower`.

**볼린저밴드 공식**:
```
중단(Middle) = SMA(period)             ← 보통 20일
표준편차 σ   = StdDev(period)
상단(Upper)  = 중단 + std × σ          ← std 보통 2.0
하단(Lower)  = 중단 − std × σ
```
- 가격이 통계적으로 머무는 "±2σ 띠"를 그림. 하단 터치=과매도(반등 기대), 상단 터치=과매수. 띠가 **좁아지면(스퀴즈)** 곧 큰 변동 예고.
- 이 파일은 두 군데로 노출: 레지스트리 `bollinger`(codegen 용) + 사용자용 `BollingerBands` 클래스(H 절).

#### ⑤ ATR — 평균진폭 (`L784-L793`)
**이 파일이 가진 것**: `atr → AverageTrueRange(period, MovingAverageType.Simple)`, **`requires_tradebar=True`**(고가·저가가 필요해 종가만으론 불가).

**ATR 공식** — 먼저 하루치 "진짜 변동폭(True Range)"을 정의:
```
TR = max( 고가−저가,  |고가−전일종가|,  |저가−전일종가| )
ATR = TR 의 N일 평균
```
- 세 후보 중 최댓값을 쓰는 이유: **갭(전일 대비 점프)** 까지 변동에 포함하기 위함. 단순히 "고가−저가"만 보면 시초가 갭을 놓침.
- ATR 은 **방향이 아니라 "출렁임의 크기"**(변동성). 손절폭(예: 진입가−2×ATR)이나 포지션 사이징에 자주 씀.
- 여기서 `requires_tradebar=True` 의 의미가 또렷해집니다 — TR 계산에 고가·저가·전일종가가 다 필요 → 봉 전체(TradeBar)를 먹여야 함.

---

## ⚠️ 함정·주의 (코드에 박힌 교훈)

1. **"이 파일엔 계산식이 없다" 가 1순위 함정.** SMA/RSI 의 수학을 여기서 찾으면 못 찾습니다. 이 파일은 **Lean 클래스 매핑 + 비교식 객체화**만 합니다. 실제 계산·NaN/워밍업 처리·look-ahead 방지는 **Lean 엔진**(과 codegen 의 워밍업 설정)이 담당.
2. **NaN/워밍업은 여기서 안 보임.** SMA(20)은 20봉이 모이기 전엔 유효값이 없는데(워밍업), 그 처리는 `codegen/validator.py`(워밍업 기간 계산)와 Lean 런타임의 몫. 이 파일은 그저 "period 가 20" 이라는 정보만 전달.
3. **`requires_tradebar` 를 무시하면 런타임 에러.** True 인 지표(ATR·스토캐스틱·OBV·ADX 등)는 `Update(시각, 종가)` 가 아니라 `Update(TradeBar)` 로 먹여야 함. codegen 이 이 플래그를 보고 갱신 코드를 분기. (잘못 분기하면 Lean 이 고가/저가를 못 받아 계산 불가.)
4. **나눗셈/역뺄셈 연산자는 없다(B-4).** `MA / 2`, `1000 - MA` 는 이 파일의 오버로딩 범위 밖(`mul/add/sub` + 역방향 `rmul/radd` 만). ScaledIndicator 에 `"div"` 문자열이 보여도 그걸 만드는 진입점이 `Indicator` 에 없음.
5. **주석 개수 ≠ 실제 등록 수.** 거래량 헤더는 "12개"라 적혔지만 실제 9개(E-8). 강의/문서에서 숫자를 인용할 땐 **코드를 세어** 쓰기.
6. **id 와 Lean 클래스가 직관과 다른 경우들.** `wma`=Wilder(가중 아님), `regression`=LeastSquaresMovingAverage, `adl`=`ad` 별칭(둘 다 AccumulationDistribution). lean_class 를 봐야 정확.
7. **`kst` 등 일부 init 에 숫자 하드코딩.** Python.NET 이 C# 디폴트 인자를 못 읽어, SMA기간/시그널을 템플릿에 직접 박음(L635-L636). 파라미터로 안 빠진 값이 있으니 변경 시 주의.
8. **alias 충돌 가능성.** alias 는 params **값만** 이어 만들어(B-2), 서로 다른 지표라도 값이 같으면(예: 둘 다 period=20) 부분 충돌 가능 → 실제로는 id 가 앞에 붙어 완화되지만(`sma_20` vs `ema_20`), 같은 id·같은 값이면 같은 alias. (볼린저는 이를 **의도적으로** 활용해 3밴드를 한 변수로 묶음 — H 절.)

---

## 🚀 고도화 아이디어 (지표 추가법)

**새 지표 하나를 추가하려면 — 이 파일에서 할 일은 딱 하나**: `INDICATOR_REGISTRY` 에 `IndicatorInfo` 한 항목을 더하면 됩니다.

```python
# 예: Lean 의 표준 지표를 새로 노출 (계산은 Lean 이 함)
"my_ind": IndicatorInfo(
    id="my_ind",
    name="My Indicator",
    lean_class="SomeLeanIndicator",          # Lean 에 실제 존재하는 클래스명
    params=["period"],
    value_template="{name}.Current.Value",   # 단일출력이면 이것
    init_template="{name} = SomeLeanIndicator({period})",
    description="...",
    requires_tradebar=False,                  # 고가/저가 필요하면 True
),
```
체크리스트:
- **다중출력 지표**면 `value_template=None` + `outputs={"a": "{name}.A.Current.Value", ...}` 로.
- **OHLC 전체 필요**(고가/저가/거래량 사용)면 `requires_tradebar=True`.
- **Lean 에 없는 커스텀 지표**면 E-7 패턴처럼 `lean_class=""` + 보조 init(`{name}_sma = ...`) 으로 깔고, 실제 조립 로직은 codegen 에 추가(이 파일 밖 작업 필요).
- `dsl/helpers.py` 에 `MyInd(14)` 같은 **팩토리 함수**를 더하면 사용자가 `MyInd(14) > 50` 으로 쓸 수 있음(00_overview 의 helpers 약 80종과 짝).

**다른 고도화 방향**:
- **나눗셈 연산자 추가**: `Indicator.__truediv__` 를 정의하면 `MA / 2` 지원(현재 미구현, B-4). ScaledIndicator 가 이미 `"div"` 를 받을 준비는 돼 있음.
- **검증 강화**: 등록 시 `lean_class` 가 실제 Lean 에 존재하는지, `params` 와 init_template 의 `{...}` 자리표시자가 일치하는지 자동 점검(현재는 `codegen/validator.py` 가 일부 담당).
- **분류 메타데이터**: 각 IndicatorInfo 에 `category="trend"|"momentum"|...` 필드를 더하면 프론트에서 4분류로 필터링하는 UI 가 쉬워짐(현재 분류는 코드 주석 구획뿐).

---

## 📚 용어 사전 (이 파일 한정)

| 용어 | 한 줄 설명 |
|---|---|
| **기술적 지표(Technical Indicator)** | OHLCV 를 가공해 만든 보조 숫자(추세/모멘텀/변동성/거래량) |
| **OHLCV** | 시가·고가·저가·종가·거래량 — 캔들 하나가 가진 5값 |
| **`Indicator`(클래스)** | 지표 한 개를 표현한 객체. `>`·`crosses_above` 로 조건을 만듦 |
| **`IndicatorInfo`** | 지표 1개의 "Lean 번역 명함"(불변 dataclass): 클래스·템플릿·파라미터 |
| **`INDICATOR_REGISTRY`** | `{id: IndicatorInfo}` 명함첩(78개 등록) |
| **`ScaledIndicator`** | `MA*0.9` 같은 스케일/오프셋 표현 객체 |
| **연산자 오버로딩** | `>`·`*`·`&` 의 동작을 재정의. `SMA(5)>SMA(20)` 이 `Condition` 객체가 되게 함 |
| **`Condition` / `CompositeCondition`** | 비교식/복합식의 객체 표현(condition.py). `&`·`|` 로 묶임 |
| **lean_class** | 그 지표에 대응하는 Lean(QuantConnect)의 실제 클래스명(문자열) |
| **init_template** | Lean 초기화 코드 템플릿. `{name}`/`{period}` 를 codegen 이 채움 |
| **value_template / outputs** | 결과값 꺼내는 경로. 단일=value_template, 다중=outputs dict |
| **`{name}.Current.Value`** | Lean 지표의 최신 계산값 접근 경로 |
| **requires_tradebar** | True 면 종가만이 아닌 봉 전체(TradeBar=OHLCV)로 갱신해야 함 |
| **다중출력(multiple outputs)** | 결과가 여러 개(볼린저=상/중/하, MACD=값/시그널/히스토그램) |
| **alias** | 코드에서 쓸 지표 변수 별칭(`sma_20`). 미지정 시 id+params값으로 자동 생성 |
| **SMA / EMA** | 단순/지수 이동평균(추세). EMA 는 최근값에 더 큰 가중 |
| **RSI** | 상대강도지수(0~100). 70 과매수·30 과매도 |
| **MACD** | (EMA12−EMA26) 모멘텀선 + 시그널선 + 히스토그램 |
| **볼린저밴드** | SMA ± std×표준편차 의 변동성 띠(상/중/하) |
| **ATR / True Range** | 갭 포함 하루 변동폭(TR)의 N일 평균. 변동성·손절폭에 사용 |
| **`@dataclass(frozen=True)`** | 한 번 만들면 못 바꾸는 불변 dataclass(레지스트리 상수표용) |
| **`@staticmethod` / `@property`** | 인스턴스 없이 호출 / 괄호 없이 속성처럼 접근 |
