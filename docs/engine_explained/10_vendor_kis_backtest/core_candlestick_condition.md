# `core/candlestick.py` + `core/condition.py` — 봉 패턴 사전 & 조건 조립기 (완전 라인별 해설)

> 원본 1: `analytics/app/lean/kis_backtest/core/candlestick.py` (560줄 — 캔들 패턴 객체 + 66종 패턴 레지스트리)
> 원본 2: `analytics/app/lean/kis_backtest/core/condition.py` (120줄 — 전략 진입/청산 "조건"의 객체 표현 + AND/OR 결합)
> 형식 기준: [`README.md` §3 공통 형식](../README.md) · 모범 [`01_backtest/vbt_engine.md`](../01_backtest/vbt_engine.md) · 벤더 [`10_vendor_kis_backtest/00_overview.md`](00_overview.md)
> 위치: `core/`(전략의 내부 표현) — 벤더 개요의 ✅핵심 `condition.py` + 🟡간접 `candlestick.py`.

---

## 📌 이 파일 한눈에

이 두 파일은 함께 **"봉차트 패턴 사전 + 조건 조립기"** 입니다.

- `candlestick.py` = **봉 패턴 사전**. "도지(Doji)", "망치형(Hammer)" 같은 **캔들 패턴 66종**을 등록해 둔 명부(레지스트리) + 그 패턴을 "상승 신호인지/하락 신호인지" 조건으로 바꿔주는 작은 객체(`CandlestickPattern`).
- `condition.py` = **조건 조립기**. `SMA(5) > SMA(20)` 같은 **비교식 한 개**(`Condition`)와, 그것을 `&`(AND)·`|`(OR)로 **여러 개 엮은 트리**(`CompositeCondition`).

> 비유: `condition.py` 는 **레고 블록과 연결 핀**입니다. 블록 1개(`Condition`)는 "이동평균이 위로 교차" 같은 단순 규칙. 핀(`&`, `|`)으로 블록을 이어 붙이면 "A **그리고** B **또는** C" 같은 복잡한 전략 규칙 트리가 됩니다. `candlestick.py` 는 그 블록 중 **특수 블록(봉 모양 패턴)** 을 공급하는 부품 상자입니다.

| 객체 | 어느 파일 | 한 줄 역할 | 비유 |
|---|---|---|---|
| `CandlestickPattern` | candlestick | 패턴 1개(id) → `.is_bullish()` 등으로 조건 생성 | "도지 카드"를 뽑아 "상승 베팅"으로 전환 |
| `CANDLESTICK_REGISTRY` | candlestick | 패턴 66종의 **메타데이터 명부**(Lean 클래스명·봉 개수·지원여부) | 패턴 백과사전(번역표 포함) |
| `PatternInfo` | candlestick | 한 패턴의 메타데이터 한 줄 | 사전의 한 표제어 |
| `Condition` | condition | 비교식 1개(연산자·왼쪽·오른쪽) | 레고 블록 1개 |
| `CompositeCondition` | condition | 여러 조건을 AND/OR로 묶은 트리 | 블록들을 핀으로 이은 구조물 |

**누가 호출하나?** → ① DSL 헬퍼(`dsl/helpers.py`)가 `Doji()`·`Hammer()` 같은 함수로 `CandlestickPattern` 을 만들고(`dsl/helpers.py:1531-`), ② 전략을 짤 때 `SMA(5) > SMA(20)`(또는 `doji.is_bullish()`)이 `Condition` 을 만들고, `&`/`|` 로 묶어 `CompositeCondition` 트리를 만든다. ③ 그 트리를 `.to_dict()` 로 **선언적 dict** 로 직렬화하면, 코드 생성기(`codegen/`)와 스키마(`core/schema.py`)가 이를 받아 Lean 코드로 번역한다.

**왜 "객체"로 표현하나?** → 전략 규칙을 `for` 루프로 직접 짜는 대신, **"무엇을 사고팔지"를 데이터(객체 트리)로 기술**해 두면, 같은 규칙을 ① Lean 파이썬 코드로 번역하거나 ② dict/YAML 로 저장하거나 ③ 검증할 수 있습니다. (벤더 개요 §핵심개념 1 "DSL = 선언" 참조.) 핵심 마법은 **연산자 오버로딩** — `>`·`&`·`|` 가 숫자 비교가 아니라 **객체를 만드는 도구**가 됩니다.

---

## 🧠 사전 지식 (이거 모르면 막힘)

#### 1) 캔들(봉) = OHLC 네 값으로 그린 막대
하루(또는 한 봉)의 시가(Open)·고가(High)·저가(Low)·종가(Close) 네 값으로 그립니다.
```
   고가 ─┬─        ← 위꼬리(upper shadow): 고가 ~ 몸통 위
        │
      ┌─┴─┐  ← 몸통(real body): 시가~종가 사이
      │   │     종가>시가면 양봉(상승), 종가<시가면 음봉(하락)
      └─┬─┘
        │
   저가 ─┴─        ← 아래꼬리(lower shadow): 몸통 아래 ~ 저가
```
- **몸통**: 시가와 종가 사이. 길면 "추세가 강함", 짧으면 "우유부단".
- **꼬리(그림자)**: 몸통 밖으로 삐져나온 선. "고점/저점을 찍었다가 되돌아왔다"는 흔적.

#### 2) 봉 패턴 = 봉 1~5개의 모양으로 읽는 신호
이 파일이 다루는 것. 봉 개수(`candle_count`)별로:
- **단일(1봉)**: `doji`(시가≈종가, 우유부단), `hammer`(긴 아래꼬리, 바닥 반전), `marubozu`(꼬리 없는 장대봉, 강한 추세)…
- **이중(2봉)**: `engulfing`(둘째 봉이 첫째를 완전히 감쌈=강한 반전), `harami`(둘째가 첫째 안에 들어감)…
- **삼중(3봉)**: `morning_star`(샛별형=강한 상승반전), `three_white_soldiers`(적삼병)…
- **복합(4~5봉)**: `breakaway`, `mat_hold`, `three_line_strike`(4봉)…

> ⚠️ 이 파일은 패턴을 **실제로 감지(계산)하지 않습니다.** 패턴 감지 로직은 **Lean(QuantConnect) 엔진**이 합니다. 여기 있는 건 "어떤 패턴이 있고, Lean 의 어떤 클래스에 대응하는가"라는 **명부(메타데이터)** 와, "그 패턴을 조건으로 쓰겠다"는 **선언** 뿐입니다.

#### 3) 패턴 신호값: -1 / 0 / +1
Lean 의 캔들 패턴 지표는 보통 한 봉마다 **+1(상승 패턴 감지)·0(없음)·-1(하락 패턴 감지)** 을 냅니다. 그래서 이 파일의 조건은:
- `is_bullish()` → "값 > 0" (상승 감지)
- `is_bearish()` → "값 < 0" (하락 감지)
- `is_detected()` → "값 ≠ 0" (방향 무관, 패턴이 뜨기만 하면)

#### 4) 조건식 = `왼쪽 (연산자) 오른쪽`
`condition.py` 의 `Condition` 은 딱 세 조각입니다: **연산자(operator)** + **왼쪽(left)** + **오른쪽(right)**.
```
Condition("greater_than", SMA(5), SMA(20))
          └연산자┘        └왼쪽┘   └오른쪽┘
의미: "SMA(5) 가 SMA(20) 보다 크다"
```
오른쪽은 다른 지표일 수도(`SMA(20)`), 그냥 숫자일 수도(`70`) 있습니다.

#### 5) AND / OR = 조건을 엮는 두 가지 접착제
- **AND(`&`)**: "**모두** 참이어야" 신호. 예: "골든크로스 **그리고** RSI<70" → 둘 다 만족해야 매수.
- **OR(`|`)**: "**하나라도** 참이면" 신호. 예: "RSI>80 **또는** 데드크로스" → 하나만 만족해도 매도.
- 파이썬에서 `and`/`or` 키워드는 오버로딩이 **불가능**해서, 비트 연산자 `&`/`|` 를 빌려 씁니다. (그래서 `(A) & (B)` 처럼 **반드시 괄호**로 감싸야 함 — 함정 1 참조.)

#### 6) 연산자 오버로딩 = `>`·`&` 의 뜻을 바꾸기
보통 `5 > 3` 은 `True`(불리언). 하지만 클래스에 `__gt__`(>) 나 `__and__`(&) 메서드를 정의하면, `SMA(5) > SMA(20)` 이 **`True` 가 아니라 `Condition` 객체**를 반환하게 만들 수 있습니다. 이게 DSL 의 핵심 트릭입니다.
- `Condition.__and__` / `__or__` → 두 조건을 묶어 `CompositeCondition` 생성.
- (`>` 같은 비교 연산자 자체는 이 파일이 아니라 `core/indicator.py` 의 `Indicator` 가 오버로딩 — 결과로 `Condition` 을 만들어 여기로 흘려보냄.)

---

## 🗺 구조 (두 파일이 협력하는 그림)

```
[전략 작성]
   SMA(5) > SMA(20)          doji = Doji()  (dsl/helpers.Doji → CandlestickPattern("doji"))
        │ (indicator.py 가 > 오버로딩)        │ .is_bullish()
        ▼                                     ▼
   Condition("greater_than",            Condition("pattern_bullish",
              SMA(5), SMA(20))                     <CandlestickPattern doji>, 0)
        │                                     │
        └───────────────┬─────────────────────┘
                        │  & (AND)  /  | (OR)   ← Condition.__and__ / __or__
                        ▼
              CompositeCondition("AND", [조건1, 조건2, ...])
                        │  & 더 붙이면 같은 AND 면 평탄화(flatten), 다르면 중첩
                        ▼
                   .to_dict()  →  선언적 dict (event/indicator/value/logic/conditions...)
                        │
        ┌───────────────┴───────────────────────────┐
        ▼                                            ▼
core/schema.py (StrategySchema 검증·정규화)    codegen/generator.py (Lean QCAlgorithm 코드)
   auto_populate_candlesticks()                  CANDLESTICK_REGISTRY 로 lean_class 조회
        │                                            │
        └──── CANDLESTICK_REGISTRY (이 파일) ◀────────┘
              · lean_class  (도지→"Doji" Lean 클래스명)
              · candle_count(warmup = count + 5)
              · lean_unsupported (True 면 codegen/validator 가 에러로 거부)
```

> 핵심 분리: **`CandlestickPattern`(객체)** 와 **`CANDLESTICK_REGISTRY`(메타데이터)** 는 같은 파일에 있지만 **서로 직접 참조하지 않습니다.** 객체는 "조건 선언"만 하고, 레지스트리는 **나중에** `validator.py`·`schema.py` 가 패턴 id 로 조회합니다. (함정 4 참조.)

---

## 📖 라인별 해설

먼저 **`condition.py`** 를 봅니다(더 기초). 그다음 **`candlestick.py`** (그 위에 얹힌 특수 블록).

---

### 파트 A — `condition.py` (조건 조립기)

#### A-1. 파일 설명서 + import — `condition.py # L1-L13`

```python
# condition.py # L1-L13
"""Condition classes for strategy rules.

Represents comparison conditions between indicators or values.
"""
from __future__ import annotations
from dataclasses import dataclass
from typing import Any, Dict, List, Literal, Union, TYPE_CHECKING

if TYPE_CHECKING:
    from kis_backtest.core.indicator import Indicator
```
- 이 파일은 "전략 규칙을 위한 조건 클래스"라고 docstring 이 밝힙니다.
- `from __future__ import annotations` — 타입힌트를 문자열처럼 늦게 평가(초보는 "최신 타입표기를 쓰기 위한 주문"으로 이해).
- `Literal` — "정해진 몇 개 문자열 중 하나"로 값을 제한하는 타입(아래 `logic: Literal["AND","OR"]`).
- **`if TYPE_CHECKING:` 가 왜 중요한가** — `Indicator` 를 **타입 표기에만** 쓰려고 import 합니다. `TYPE_CHECKING` 은 실제 실행 때는 `False` 라서 이 import 가 **실행되지 않습니다.** 이유: `indicator.py` ↔ `condition.py` 가 서로를 import 하는 **순환 import(circular import)** 를 피하려고. (런타임에 진짜 필요할 땐 함수 안에서 import — `to_dict()` 참조.)

> 💡 초보 포인트: "순환 import" = A가 B를 부르고 B가 A를 부르면 파이썬이 로딩 중 꼬여 에러. 해결책 두 개가 이 파일에 다 나옵니다: ① 타입 전용이면 `TYPE_CHECKING`, ② 런타임에 필요하면 **함수 안에서 늦게 import**.

#### A-2. `Condition` — 비교식 한 개 (`@dataclass`) — `condition.py # L15-L34`

```python
# condition.py # L15-L34
@dataclass
class Condition:
    """조건 표현식 ...
    Example:
        condition = Condition("greater_than", SMA(5), SMA(20))
        # 또는 연산자 오버로딩 사용
        condition = SMA(5) > SMA(20)
    """
    operator: str
    left: Union[Indicator, Condition]
    right: Union[Indicator, float, int, Condition]
```
- `@dataclass` — 세 필드(`operator`·`left`·`right`)만 적으면 생성자·`__repr__` 등을 자동으로 만들어주는 도구. 이 클래스는 **"비교식 데이터 한 묶음"** 입니다.
- 세 조각:
  - `operator`(문자열) — 비교 연산자 이름. docstring 예시: `greater_than`·`less_than`·`cross_above` 등. (캔들 조건이면 `pattern_bullish`/`pattern_bearish`/`pattern_detected` — 파트 B.)
  - `left` — 왼쪽 피연산자. 보통 `Indicator`(지표). 타입에 `Condition` 도 허용되지만 일반적 경로는 지표.
  - `right` — 오른쪽 피연산자. **지표거나(`SMA(20)`) 숫자거나(`70`)**. `Union[..., float, int, ...]` 이 그래서 들어있음.
- docstring 의 두 표기는 **같은 결과**: `Condition("greater_than", SMA(5), SMA(20))` 를 직접 쓰든, `SMA(5) > SMA(20)` 으로 쓰든 동일한 `Condition` 객체. 후자가 사람이 읽기 쉬워 실제로 더 많이 씁니다(`>` 오버로딩은 `indicator.py` 가 담당).

#### A-3. AND/OR 결합 — `__and__` / `__or__` — `condition.py # L35-L49`

```python
# condition.py # L35-L49
    def __and__(self, other):
        """AND 조합 (&)
        Example:
            (SMA(5) > SMA(20)) & (RSI(14) < 70)
        """
        return CompositeCondition("AND", [self, other])

    def __or__(self, other):
        """OR 조합 (|)
        Example:
            (SMA(5) < SMA(20)) | (RSI(14) > 80)
        """
        return CompositeCondition("OR", [self, other])
```
- **이 4줄이 "조립기"의 심장**입니다. `__and__` 는 파이썬의 `&` 연산자가 호출하는 특수 메서드 — `condition1 & condition2` 를 쓰면 파이썬이 `condition1.__and__(condition2)` 를 부릅니다.
- 결과: 두 조건을 리스트 `[self, other]` 로 묶어 **`CompositeCondition("AND", ...)`** 객체를 새로 만들어 반환. `__or__` 는 `"OR"` 로 같은 일.
- **왜 `and`/`or` 키워드가 아니라 `&`/`|` 인가** — 파이썬은 `and`/`or` 키워드를 오버로딩하는 것을 허용하지 않습니다(불리언 단축평가 때문). 그래서 비트 연산자 `&`/`|` 를 빌려 씁니다. **부작용: 연산자 우선순위 때문에 반드시 괄호 필요** → `A & B` 가 아니라 `(A) & (B)` (함정 1).

> 💡 초보 포인트: `Condition & Condition` → `CompositeCondition`. 즉 **블록 두 개를 핀으로 잇는 순간 "구조물" 타입으로 승격**됩니다. 그래서 다음에 또 `& C` 를 하면 이제 `CompositeCondition.__and__`(A-5)가 호출돼 "평탄화"가 일어납니다.

#### A-4. `Condition.to_dict()` — 선언적 dict 로 직렬화 — `condition.py # L51-L82`

```python
# condition.py # L51-L82
    def to_dict(self) -> Dict[str, Any]:
        """선언적 정의로 변환"""
        from kis_backtest.core.indicator import Indicator, ScaledIndicator   # 순환 import 회피: 함수 안 import

        result: Dict[str, Any] = {"event": self.operator}

        if isinstance(self.left, Indicator):
            result["indicator"] = self.left.alias
            result["output"] = self.left.output
            result["indicator_def"] = self.left.to_dict()
        elif isinstance(self.left, ScaledIndicator):
            result["indicator"] = self.left.indicator.alias
            result["output"] = self.left.indicator.output
            result["indicator_def"] = self.left.to_dict()

        if isinstance(self.right, Indicator):
            result["compare_to"] = self.right.alias
            result["compare_output"] = self.right.output
            result["compare_def"] = self.right.to_dict()
        elif isinstance(self.right, ScaledIndicator):
            result["compare_to"] = self.right.indicator.alias
            result["compare_output"] = self.right.indicator.output
            result["compare_def"] = self.right.to_dict()
            result["compare_scalar"] = self.right.scalar
            result["compare_operation"] = self.right.operation
        elif isinstance(self.right, (int, float)):
            result["value"] = self.right

        return result
```
- **무엇을 하나**: `Condition` 객체를 **순수 dict** 로 변환합니다. 이 dict 가 곧 codegen·schema 가 읽는 "선언적 정의(declarative definition)". 객체 → 데이터로 평탄화하는 단계.
- 첫 줄 `from ... import` 가 **함수 안에** 있는 이유: A-1 에서 본 순환 import 회피의 두 번째 기법. 여기선 `isinstance` 검사에 진짜 클래스가 필요하니 **호출 시점에 늦게** 가져옵니다.
- **왼쪽(left) 처리**: 지표면 `indicator`(별칭)·`output`(출력 필드명, 예: BollingerBands 의 'upper')·`indicator_def`(지표 전체 dict)를 채움. `ScaledIndicator`(지표×배율 같은 스케일된 지표)면 안쪽 `.indicator` 에서 별칭/출력을 꺼냄.
- **오른쪽(right) 처리** — 세 갈래:
  1. **지표**(`Indicator`)면 → `compare_to`/`compare_output`/`compare_def` (왼쪽과 대칭). "지표 vs 지표" 비교.
  2. **스케일된 지표**(`ScaledIndicator`)면 → 위 + `compare_scalar`(배율)·`compare_operation`(곱/합 등). 예: "종가 > SMA(20) × 1.05" 같은 이격 비교.
  3. **숫자**(`int`/`float`)면 → `result["value"] = 숫자`. "지표 vs 상수" 비교(예: `RSI(14) < 70` → `value: 70`).
- **결과 키 정리**:

  | 키 | 뜻 |
  |---|---|
  | `event` | 연산자(operator). 모든 조건의 공통 키 |
  | `indicator` / `output` / `indicator_def` | 왼쪽 지표의 별칭 / 출력필드 / 전체정의 |
  | `compare_to` / `compare_output` / `compare_def` | 오른쪽이 지표일 때, 그 별칭 / 출력 / 정의 |
  | `compare_scalar` / `compare_operation` | 오른쪽이 스케일된 지표일 때 배율·연산 |
  | `value` | 오른쪽이 숫자일 때 그 상수값 |

> ⚠️ 주의: `left` 가 `Indicator` 도 `ScaledIndicator` 도 아니면(둘 다 `if`에 안 걸리면) `indicator` 키가 **아예 안 생깁니다.** 캔들 조건(`left` 가 `CandlestickPattern`)이 정확히 이 경우 — 그래서 캔들 조건의 `to_dict()` 는 `{"event": "pattern_bullish"}` 처럼 거의 비게 됩니다. 캔들 패턴 정보는 **별도 경로**(schema 의 `candlestick` 필드, 파트 B-2·함정 4)로 흐릅니다.

#### A-5. `CompositeCondition` — AND/OR 트리 — `condition.py # L85-L118`

```python
# condition.py # L85-L99
@dataclass
class CompositeCondition:
    """복합 조건 (AND/OR)
    Example:
        composite = (SMA(5) > SMA(20)) & (RSI(14) < 70) & (ADX(14) > 25)
    """
    logic: Literal["AND", "OR"]
    conditions: List[Union[Condition, CompositeCondition]]
```
- **무엇을**: 여러 조건을 하나의 논리로 묶은 컨테이너. 두 필드:
  - `logic` — `"AND"` 또는 `"OR"` 둘 중 하나만(`Literal` 로 강제). 오타 방지.
  - `conditions` — 자식 조건들의 리스트. 원소는 `Condition` **또는** 또 다른 `CompositeCondition`(중첩 가능 → **트리**).

```python
# condition.py # L101-L111
    def __and__(self, other):
        """AND 조합 (&)"""
        if self.logic == "AND":
            return CompositeCondition("AND", [*self.conditions, other])
        return CompositeCondition("AND", [self, other])

    def __or__(self, other):
        """OR 조합 (|)"""
        if self.logic == "OR":
            return CompositeCondition("OR", [*self.conditions, other])
        return CompositeCondition("OR", [self, other])
```
- **이게 "평탄화(flatten)" 트릭** — 가장 중요한 미묘함입니다. 이미 `CompositeCondition` 인데 또 `& other` 를 붙일 때:
  - **같은 logic 이면**(`AND` 에 또 `&`) → `[*self.conditions, other]` 로 **기존 자식 리스트에 새 조건을 평평하게 추가**. 중첩이 안 생김.
  - **다른 logic 이면**(`AND` 트리에 `| other`) → `[self, other]` 로 **기존 트리를 통째로 한 자식으로** 감싸 새 그룹 생성. 중첩이 생김.
- 효과 예시:
  ```
  (A) & (B) & (C)
  = (A & B) 가 먼저 → CompositeCondition("AND", [A, B])
  = 그것 & C → logic 같음(AND) → CompositeCondition("AND", [A, B, C])   ← 평탄! 3개 한 리스트
  ```
  ```
  ((A) & (B)) | (C)
  = CompositeCondition("AND",[A,B])  그것 | C → logic 다름(AND vs OR)
  = CompositeCondition("OR", [ <AND[A,B]>, C ])   ← 중첩! OR 안에 AND 그룹
  ```

> 💡 초보 포인트: **연산자 우선순위 때문에 `&` 가 `|` 보다 먼저** 묶입니다(파이썬 규칙). 그래서 `(A) & (B) | (C)` 는 `((A & B)) | C` 로 해석돼 위 둘째 예처럼 됩니다. 의도와 다를 수 있으니 복잡하면 **명시적 괄호**로 그룹을 직접 지정하세요(함정 2).

```python
# condition.py # L113-L118
    def to_dict(self) -> Dict[str, Any]:
        """선언적 정의로 변환"""
        return {
            "logic": self.logic,
            "conditions": [c.to_dict() for c in self.conditions],
        }
```
- 트리를 dict 로: `{"logic": "AND", "conditions": [자식.to_dict(), ...]}`. 자식이 또 `CompositeCondition` 이면 **재귀적으로** 그 안에서 또 `to_dict()` 가 불려 트리 전체가 dict 트리로 펼쳐집니다.
- 결과 형태 예:
  ```json
  {"logic": "AND",
   "conditions": [
     {"event": "greater_than", "indicator": "sma_5", "compare_to": "sma_20", ...},
     {"event": "less_than",    "indicator": "rsi_14", "value": 70}
   ]}
  ```

---

### 파트 B — `candlestick.py` (봉 패턴 사전)

#### B-1. import + `CandlestickPattern` 클래스 — `candlestick.py # L1-L33`

```python
# candlestick.py # L1-L33
"""Candlestick Pattern definitions and registry. ... Lean 캔들스틱 패턴 지원."""
from __future__ import annotations
from dataclasses import dataclass, field
from typing import Any, Dict, Optional
from kis_backtest.core.condition import Condition          # ← 파트 A 의 Condition 을 가져옴

@dataclass
class CandlestickPattern:
    """캔들스틱 패턴 ... 비교 연산자를 오버로딩하여 조건 생성 가능."""
    id: str
    alias: Optional[str] = None

    def __post_init__(self) -> None:
        if self.alias is None:
            self.alias = self.id
```
- 이 파일은 `condition.py` 의 `Condition` 을 **직접 import** 합니다(반대 방향은 없으므로 순환 아님 — candlestick → condition 일방향).
- `CandlestickPattern` 은 **패턴 1개를 가리키는 가벼운 객체**. 필드 둘:
  - `id` — 패턴 식별자(`"doji"`, `"hammer"`, `"engulfing"` …). 아래 레지스트리의 키와 일치해야 함.
  - `alias` — 별칭(같은 패턴을 여러 번 쓸 때 구분용). 안 주면…
- `__post_init__` — dataclass 가 생성된 **직후** 자동 호출되는 후처리 훅. 여기선 `alias` 가 `None` 이면 **`id` 로 채움**(별칭 미지정 시 기본값 = id).
- (주의: import 에 `field` 가 있지만 이 파일에서 실제로 쓰이진 않음 — 미사용 import.)

#### B-2. 패턴 → 조건 변환 메서드 — `candlestick.py # L35-L45`

```python
# candlestick.py # L35-L45
    def is_bullish(self) -> Condition:
        """상승 패턴 감지 (value > 0)"""
        return Condition("pattern_bullish", self, 0)

    def is_bearish(self) -> Condition:
        """하락 패턴 감지 (value < 0)"""
        return Condition("pattern_bearish", self, 0)

    def is_detected(self) -> Condition:
        """패턴 감지 (value != 0)"""
        return Condition("pattern_detected", self, 0)
```
- **이 3개가 캔들 파일이 `condition.py` 와 만나는 지점**입니다. 패턴을 **조건 객체로 전환**:
  - `is_bullish()` → `Condition("pattern_bullish", self, 0)` — 연산자는 `pattern_bullish`, **왼쪽은 패턴 객체 자신(`self`)**, 오른쪽은 `0`. 의미: "이 패턴의 신호값 > 0 (상승)".
  - `is_bearish()` → `pattern_bearish` (값 < 0, 하락).
  - `is_detected()` → `pattern_detected` (값 ≠ 0, 방향 무관).
- **핵심 미묘함**: 반환된 `Condition` 의 `left` 는 `Indicator` 가 아니라 `CandlestickPattern` 입니다. 그래서 그 조건에 `.to_dict()` 를 부르면(A-4) `left` 가 `Indicator`/`ScaledIndicator` 둘 다 아니라서 **`indicator` 키가 안 생기고 `{"event": "pattern_bullish"}` 만** 남습니다. 패턴 정보(`id`/`alias`)는 `to_dict()`(B-3)와 schema 의 `candlestick` 필드로 따로 전달됩니다.
- 오른쪽 `0` 은 사실상 자리표시자(연산자 이름에 방향이 이미 들어 있음). Lean 쪽에서 패턴 지표값을 0과 비교하는 의미로 해석됩니다.
- 이 메서드들 덕분에 전략을 이렇게 짤 수 있습니다:
  ```python
  hammer = Hammer()                          # dsl/helpers → CandlestickPattern("hammer")
  entry = hammer.is_bullish() & (RSI(14) < 30)   # 망치형 상승 + RSI 과매도 → 매수
  ```

#### B-3. `to_dict()` — 패턴의 선언적 정의 — `candlestick.py # L47-L53`

```python
# candlestick.py # L47-L53
    def to_dict(self) -> Dict[str, Any]:
        """선언적 정의로 변환"""
        return {
            "type": "candlestick",
            "id": self.id,
            "alias": self.alias,
        }
```
- 패턴 객체를 `{"type": "candlestick", "id": ..., "alias": ...}` dict 로. `type` 키로 "이건 지표가 아니라 캔들패턴"임을 표시 → 하류(schema/codegen)가 분기 처리.
- **여기엔 레지스트리(B-4)를 안 봅니다** — id·alias 만 그대로 출력. Lean 클래스명 같은 메타데이터는 **나중에** validator/codegen 이 레지스트리에서 조회(함정 4).

#### B-4. `PatternInfo` — 한 패턴의 메타데이터 — `candlestick.py # L60-L68`

```python
# candlestick.py # L60-L68
@dataclass(frozen=True)
class PatternInfo:
    """패턴 메타데이터"""
    id: str
    name: str
    lean_class: str
    candle_count: int  # 1=단일, 2=이중, 3=삼중
    description: str = ""
    lean_unsupported: bool = False  # True이면 현재 Lean 버전에서 미지원
```
- `@dataclass(frozen=True)` — **불변(frozen)** dataclass. 한 번 만들면 수정 불가 → 레지스트리에 상수처럼 박아둘 안전한 메타데이터.
- 필드(이게 패턴 사전 한 표제어의 칼럼들):
  - `id` — 패턴 식별자(레지스트리 키와 동일).
  - `name` — 사람이 읽는 이름(예: `"Doji (도지)"`).
  - **`lean_class`** — ★대응하는 **Lean(QuantConnect) 캔들패턴 클래스명**(예: `"Doji"`, `"Hammer"`). codegen 이 `init_code = f'{alias} = {lean_class}("{alias}")'` 로 Lean 코드를 짤 때 씀(`codegen/validator.py:427`).
  - **`candle_count`** — 패턴이 필요로 하는 봉 개수. codegen 이 **워밍업 = `candle_count + 5`** 로 계산(`validator.py:430`). 주석엔 "1=단일,2=이중,3=삼중"이라 적혀 있지만, 실제 값엔 **4·5도 존재**(예: `three_line_strike`·`concealing_baby_swallow`=4, `breakaway`·`mat_hold` 등=5).
  - `description` — 패턴 설명(기본값 빈 문자열).
  - **`lean_unsupported`** — `True` 면 "현재 Lean 버전이 이 클래스를 지원 안 함". codegen/validator 가 이걸 보면 **에러로 거부**(`validator.py:413-418`). 즉 명부엔 있지만 **백테스트에 못 쓰는** 패턴 표시.

#### B-5. `CANDLESTICK_REGISTRY` — 패턴 66종 명부 — `candlestick.py # L71-L558`

```python
# candlestick.py # L71-L81 (대표 예시 한 항목)
CANDLESTICK_REGISTRY: Dict[str, PatternInfo] = {
    "doji": PatternInfo(
        id="doji",
        name="Doji (도지)",
        lean_class="Doji",
        candle_count=1,
        description="시가와 종가가 거의 같음 - 우유부단",
    ),
    # ... 총 66개 항목 ...
}
```
- **무엇을**: `{ 패턴id : PatternInfo }` 딕셔너리. **패턴 66종**(코드의 그룹 주석은 "단일 15·이중 20·삼중 25·복합 5"라고 적었지만, **실측 항목 수는 66개**)이 등록돼 있습니다. 여기가 "봉 패턴 사전"의 본체.
- **봉 개수별 분포(실측)**: 1봉=15, 2봉=20, 3봉=24, 4봉=2, 5봉=5 → 합 66.
  - (참고: 코드의 "삼중 25개" 주석 블록 안에 `three_line_strike`·`concealing_baby_swallow` 가 `candle_count=4` 로 섞여 있고, `breakaway`·`mat_hold`·`rising/falling_three_methods`·`ladder_bottom` 은 5봉. 즉 **그룹 주석과 실제 `candle_count` 가 정확히 일치하진 않습니다.**)
- **`lean_unsupported=True` 인 패턴 9종**(명부엔 있으나 Lean 미지원 → codegen 이 거부):
  `opening_marubozu` · `tweezer_top` · `tweezer_bottom` · `meeting_lines` · `matching_high` · `deliberation` · `downside_tasuki_gap` · `upside_tasuki_gap` · `side_by_side_white_lines`. (일부는 description 에 대체재 안내 — 예: `downside/upside_tasuki_gap` → "`tasuki_gap` 사용 권장".)
- **주목할 매핑 디테일**(추측 아님, 코드 그대로):
  - `rising_three_methods` 와 `falling_three_methods` 는 **같은 Lean 클래스 `RiseFallThreeMethods`** 를 공유(+1=상승, -1=하락 으로 방향 구분). description 에 명시.
  - `concealing_baby_swallow`(id)의 `lean_class` 는 철자가 다른 **`ConcealedBabySwallow`**.
  - `three_line_strike` 는 이름은 "3선"이지만 `candle_count=4`(3봉 추세 + 반대 장악 1봉).

대표 패턴 발췌(봉 개수별):

| id | name | lean_class | 봉수 | 의미(요약) |
|---|---|---|---|---|
| `doji` | Doji (도지) | `Doji` | 1 | 시가≈종가, 우유부단 |
| `hammer` | Hammer (망치형) | `Hammer` | 1 | 긴 아래꼬리, 바닥 상승반전 |
| `hanging_man` | Hanging Man (교수형) | `HangingMan` | 1 | 망치형과 같은 모양, 천장 하락반전 |
| `shooting_star` | Shooting Star (유성형) | `ShootingStar` | 1 | 긴 위꼬리, 천장 하락반전 |
| `marubozu` | Marubozu (장대봉) | `Marubozu` | 1 | 꼬리 없는 장대, 강한 추세 |
| `engulfing` | Engulfing (장악형) | `Engulfing` | 2 | 둘째 봉이 첫째를 감쌈, 강한 반전 |
| `harami` | Harami (잉태형) | `Harami` | 2 | 둘째가 첫째 안에, 반전 가능성 |
| `dark_cloud_cover` | Dark Cloud Cover (먹구름형) | `DarkCloudCover` | 2 | 갭업 후 전일 중간 이하 하락, 하락반전 |
| `morning_star` | Morning Star (샛별형) | `MorningStar` | 3 | 하락-갭다운-상승, 강한 상승반전 |
| `evening_star` | Evening Star (저녁별형) | `EveningStar` | 3 | 상승-갭업-하락, 강한 하락반전 |
| `three_white_soldiers` | 적삼병 | `ThreeWhiteSoldiers` | 3 | 3연속 강한 양봉, 강한 상승추세 |
| `three_black_crows` | 흑삼병 | `ThreeBlackCrows` | 3 | 3연속 강한 음봉, 강한 하락추세 |
| `three_line_strike` | Three Line Strike | `ThreeLineStrike` | 4 | 3봉 추세 + 반대 장악, 강한 반전 |
| `breakaway` | Breakaway (이탈형) | `Breakaway` | 5 | 5일 추세 전환 |
| `mat_hold` | Mat Hold | `MatHold` | 5 | 5일 추세 지속 |

> 💡 초보 포인트: 같은 모양이라도 **추세 위치에 따라 이름이 다릅니다.** `hammer`(하락 후=바닥반전)와 `hanging_man`(상승 후=천장반전)은 모양 동일·의미 반대. `inverted_hammer`↔`shooting_star` 도 같은 관계. 패턴 감지는 Lean 이 추세까지 보고 판정합니다.

#### B-6. 레지스트리는 누가 소비하나 (코드 근거)
이 파일은 **명부만 제공**하고, 실제 사용은 다른 모듈이 합니다(추측 아님 — grep 확인):
- `codegen/validator.py:187` — `indicator_id in CANDLESTICK_REGISTRY` 로 "이게 캔들패턴인지" 판별.
- `codegen/validator.py:409-430` — 패턴 id 로 `PatternInfo` 조회 → `lean_unsupported` 면 `ValueError`, 아니면 `lean_class` 로 Lean 초기화 코드 생성 + `warmup = candle_count + 5`.
- `core/schema.py:367` — `auto_populate_candlesticks()` 가 조건에서 참조된 캔들 alias 를 모아 `candlesticks` 목록에 자동 등록(`StrategySchema`).
- `dsl/helpers.py:1531-` — `Doji()`·`Hammer()`·`Engulfing()` … 같은 **팩토리 함수**가 `CandlestickPattern("doji")` 식으로 객체를 생성(사람이 전략 짤 때 쓰는 입구). (단, helpers 는 레지스트리 66종 중 일부만 함수로 노출.)

---

## ⚠️ 함정·주의 (코드에 박힌 교훈)

1. **`&`/`|` 는 반드시 괄호로** — 비트 연산자라 비교(`>`,`<`)보다 우선순위가 **높습니다.** `SMA(5) > SMA(20) & RSI(14) < 70` 은 `SMA(5) > (SMA(20) & RSI(14)) < 70` 로 잘못 묶여 의도와 딴판. 항상 `(SMA(5) > SMA(20)) & (RSI(14) < 70)` 처럼 각 조건을 괄호로 감싸세요. (docstring 예제도 전부 괄호 사용.)
2. **`&` 가 `|` 보다 먼저 묶임** — `(A) & (B) | (C)` = `((A & B)) | C`. OR 를 먼저 묶고 싶으면 `(A) & ((B) | (C))` 로 명시. 평탄화(A-5) 규칙과 합쳐지면 트리 모양이 헷갈리기 쉬움.
3. **평탄화 vs 중첩** — 같은 logic 을 이어 붙이면 한 리스트로 평평(`AND[A,B,C]`), 다른 logic 이면 그룹 중첩(`OR[AND[A,B], C]`). 의도한 그룹핑이 나오는지 `to_dict()` 로 확인하는 습관.
4. **캔들 조건의 `to_dict()` 는 거의 비어 있다** — `is_bullish()` 가 만든 `Condition` 은 `left` 가 `CandlestickPattern` 이라 `Condition.to_dict()`(A-4)에서 `indicator`/`value` 키가 안 잡히고 `{"event": "pattern_bullish"}` 만 남음. 패턴 식별은 **별도 경로**(`CandlestickPattern.to_dict()` 의 `id`/`alias` + schema 의 `candlestick` 필드 + 레지스트리)로 흐른다는 점을 기억.
5. **레지스트리 그룹 주석 ≠ 실제 봉수** — "삼중 25개" 주석 블록에 `candle_count=4`(three_line_strike·concealing_baby_swallow) 와 5봉 패턴들이 섞여 있음. 코드를 자동 분류할 땐 **주석이 아니라 `candle_count` 필드**를 신뢰.
6. **`lean_unsupported=True` 9종은 백테스트 불가** — 명부엔 있어도 codegen/validator 가 `ValueError` 로 거부. 전략에 쓰기 전 지원 여부 확인(특히 `tweezer_top/bottom`, `tasuki_gap` 방향형, `matching_high`, `meeting_lines` 등).
7. **id 와 lean_class 철자 불일치 주의** — `concealing_baby_swallow` → `ConcealedBabySwallow`, `rising/falling_three_methods` → `RiseFallThreeMethods`(공유). id 로 lean_class 를 짐작하지 말고 레지스트리를 조회.
8. **순환 import 패턴** — `condition.py` 가 `indicator` 를 쓸 땐 ① 타입 전용은 `TYPE_CHECKING`, ② 런타임 필요는 함수 안 import. 이 구조를 깨고 모듈 최상단에 import 하면 순환 import 에러가 날 수 있음.

---

## 🚀 고도화 아이디어 (강의·개선 버전용)

- **`is_strong()` 같은 강도 조건 추가** — 현재 캔들 조건은 +1/-1/0(이진 방향)뿐. Lean 패턴 지표가 강도를 주면 `Condition("pattern_strength_gt", self, 0.5)` 류로 임계값 조건을 확장.
- **`xor`/`not` 결합자** — 현재 `&`(AND)·`|`(OR)만. `__xor__`(배타적 OR)·`__invert__`(NOT) 오버로딩을 추가하면 "A 또는 B 중 정확히 하나" 같은 규칙 표현 가능.
- **조건 트리 검증기** — `CompositeCondition` 깊이/조건 수 제한, 모순 탐지(예: `RSI<30 & RSI>70`)를 `to_dict()` 전에 체크하는 린터.
- **미지원 패턴 자동 대체** — `lean_unsupported=True` 패턴을 만나면 에러 대신 description 의 "사용 권장" 대체재로 자동 폴백(예: `upside_tasuki_gap`→`tasuki_gap`).
- **레지스트리 일관성 테스트** — 그룹 주석과 `candle_count` 불일치, helpers 미노출 패턴, id↔lean_class 매핑을 단위 테스트로 고정(회귀 방지).
- **DSL 헬퍼 전수 노출** — `dsl/helpers.py` 가 66종 중 일부만 함수로 제공. 나머지도 자동 생성해 전 패턴을 동일 인터페이스로.

---

## 📚 용어 사전 (이 두 파일 한정)

| 용어 | 뜻 |
|---|---|
| **OHLC** | 한 봉의 시가(Open)·고가(High)·저가(Low)·종가(Close) 네 값 |
| **몸통(real body) / 꼬리(shadow)** | 시가~종가 사이가 몸통, 그 밖으로 삐져나온 선이 위/아래 꼬리 |
| **캔들 패턴** | 봉 1~5개의 모양으로 읽는 추세/반전 신호(도지·해머·장악형…) |
| `CandlestickPattern` | 패턴 1개를 가리키는 DSL 객체. `.is_bullish/bearish/detected()` 로 조건 생성 |
| `PatternInfo` | 한 패턴의 불변 메타데이터(id·name·lean_class·candle_count·lean_unsupported) |
| `CANDLESTICK_REGISTRY` | `{id: PatternInfo}` 패턴 66종 명부 |
| `lean_class` | 그 패턴에 대응하는 Lean(QuantConnect) 캔들패턴 클래스명 |
| `candle_count` | 패턴이 필요로 하는 봉 개수(워밍업 = count+5) |
| `lean_unsupported` | True면 현재 Lean 버전 미지원 → codegen 이 거부 |
| `Condition` | 비교식 1개. `operator`(연산자)·`left`(왼쪽)·`right`(오른쪽) 세 조각 |
| `CompositeCondition` | 여러 `Condition`/하위 트리를 `logic`(AND/OR)으로 묶은 트리 |
| **연산자 오버로딩** | `>`·`&`·`|` 의 동작을 클래스에 재정의. 결과가 불리언이 아니라 조건 객체 |
| `__and__` / `__or__` | `&` / `|` 가 호출하는 특수 메서드. `CompositeCondition` 생성 |
| **평탄화(flatten)** | 같은 logic 을 이어 붙이면 한 리스트로 합치기(`AND[A,B]` + `&C` → `AND[A,B,C]`) |
| `to_dict()` | 객체를 선언적 dict 로 직렬화(codegen·schema 의 입력) |
| **선언적 정의** | "무엇을 사고팔지"를 코드 대신 데이터(dict)로 기술한 형태 |
| `TYPE_CHECKING` | 타입검사 때만 True. 순환 import 회피용(런타임엔 실행 안 됨) |
| `@dataclass(frozen=True)` | 한 번 만들면 수정 불가한 데이터 클래스(상수형 메타데이터) |
| `__post_init__` | dataclass 생성 직후 자동 호출되는 후처리 훅(여기선 alias 기본값 채움) |
