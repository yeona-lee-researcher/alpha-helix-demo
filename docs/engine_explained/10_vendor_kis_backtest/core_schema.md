# `kis_backtest/core/schema.py` — 전략의 단일 진실 원천(SSoT) 스키마 (완전 라인별 해설)

> 원본: `analytics/app/lean/kis_backtest/core/schema.py` (575줄)
> 형식 기준: 모범 [`01_backtest/vbt_engine.md`](../01_backtest/vbt_engine.md) · [`README.md` "3. 공통 형식"](../README.md) · 벤더 개요 [`10_vendor_kis_backtest/00_overview.md`](00_overview.md)
> 개요 문서가 강조하듯, 이 파일은 라이브러리의 **★ Single Source of Truth(단일 진실 원천)** 입니다. 모든 입력(프리셋·YAML·dict)이 이 한 형태로 정규화·검증된 뒤에야 코드가 생성됩니다.

---

## 📌 한눈에

이 파일은 **"전략의 설계도 양식(서식)"** 입니다. 그림을 그리는 도구가 아니라, **"전략 한 개를 적을 때 반드시 이 칸에 이 형식으로 적으세요"** 라고 정해 놓은 **빈 서식(폼)** 입니다.

> 비유: 관공서 민원 서류. 사람마다 손글씨·말투·순서가 제각각이어도(= 프리셋 코드, YAML 파일, 자연어에서 만든 dict), 창구에서는 **하나의 표준 양식**에 옮겨 적게 합니다. 빈칸은 기본값으로 채우고("alias 없으면 id 사용"), 오타는 정정하고("crosses_above → cross_above"), 필수칸이 비면 반려합니다("operator 필수"). 그 표준 양식이 바로 `StrategySchema` 입니다. 일단 이 양식으로 정리되면, **뒷단(codegen)은 손글씨를 볼 필요 없이 양식 하나만** 읽으면 됩니다.

이 파일은 **데이터 구조 정의**가 전부입니다 — 백테스트를 "실행"하지 않습니다. 전략을 **어떻게 적을지**만 정합니다. (실행은 `codegen` → `lean/` 이 담당.)

**핵심 타입(Pydantic 모델) 한 묶음:**

| 타입 | 한 줄 역할 | 비유 |
|---|---|---|
| `OperatorType` (Enum) `L23` | 조건 연산자의 **유일한 정의**(>, <, cross_above…) | 양식에서 고를 수 있는 "비교 항목" 체크박스 목록 |
| `IndicatorSchema` `L89` | 지표 1개(sma·rsi·macd…)의 표준 표현 — id·alias·params·output | "사용할 도구" 칸 |
| `CandlestickSchema` `L69` | 캔들 패턴 1개(도지·해머…)의 표준 표현 | "사용할 캔들 패턴" 칸 |
| `ConditionSchema` `L135` | 단일 비교식 "SMA(5) > SMA(20)" 의 객체 표현 | "조건 한 줄" 칸 |
| `CompositeConditionSchema` `L240` | 여러 조건을 AND/OR 로 묶음(재귀) | "조건들을 그리고/또는 으로 연결" |
| `RiskSchema` `L267` | 손절·익절·트레일링·최대비중 | "안전장치" 칸 |
| `StrategySchema` `L324` | **★ 전략 한 개의 전체 양식** — 위 조각들을 모두 담음 | 완성된 민원 서류 한 장 |
| `parse_condition` `L506` / `parse_indicators` `L562` | dict → 위 스키마로 옮겨 적는 **접수 창구 함수** | 손글씨를 양식에 받아 적기 |

**누가 이걸 쓰나?** → 개요의 데이터 흐름대로 `core/converters.py`(`from_preset`/`from_yaml_file`/`from_definition`/`from_dict`)가 모든 입력을 `StrategySchema` 로 모으고(`converters.py:64,133,173,210`), 그 결과를 `codegen/generator.py` 의 `LeanCodeGenerator` 가 받아 Lean 코드로 번역합니다(`generator.py:79,83,86`). 즉 **이 파일은 입력과 codegen 사이의 표준 관문**입니다.

---

## 🧠 사전 지식 (이거 모르면 막힘)

#### 1) SSoT(Single Source of Truth, 단일 진실 원천)
- "같은 정보를 여러 곳에서 따로 정의하면 반드시 어긋난다"는 문제를 막는 설계. **한 곳에서만 정의**하고 나머지는 그걸 참조한다.
- 이 파일이 그 "한 곳". 예전엔 프리셋은 `event` 키, YAML 은 `operator` 키, 또 어딘 `type` 키… 로 제각각이었는데(파일 docstring `L6-L9`), **여기서 전부 `operator` 하나로** 통일합니다. 그래서 codegen 은 "키가 event 일까 type 일까" 고민할 필요가 없어요.

#### 2) Pydantic = "타입이 붙은 똑똑한 데이터 클래스"
- `class X(BaseModel)` 로 만들면, 필드마다 타입을 선언하고 **객체 생성 시점에 자동 검증**합니다. 잘못된 값이면 그 자리에서 에러.
- `Field(..., description=...)` 의 `...`(Ellipsis) = **"이 칸은 필수"**. `Field(default=None)` = "비워도 됨(기본값)".
- `@field_validator` = 특정 한 칸을 검사/변환(예: 연산자 정규화). `@model_validator(mode='after')` = **모든 칸이 채워진 뒤** 객체 전체를 검사/보정(예: alias 자동 채움).
- vbt_engine 의 `@dataclass`(단순 값 묶음)와 비교하면, Pydantic 은 거기에 **검증·변환·정규화**가 더 붙은 상위호환이라고 보면 됩니다.

#### 3) Enum = "정해진 값만 허용하는 목록"
- `class OperatorType(str, Enum)` — 연산자는 이 목록 밖 값을 못 가짐. `str` 를 같이 상속해서 `OperatorType.GREATER_THAN == "greater_than"` 처럼 문자열로도 쓸 수 있음(JSON·dict 호환 편의).

#### 4) 왜 스키마가 "중심(SSoT)"인가
```
입력은 여러 갈래(프리셋·YAML·dict·자연어) ─┐
                                          ▼
                         [ StrategySchema ]  ← 모두 여기로 모임(정규화·검증)
                                          │  단 하나의 표준형
                                          ▼
                            codegen 은 이 하나만 상대
```
- 입력 경로가 10개여도 codegen 은 **1개 형태**만 알면 됩니다. 새 입력 경로가 생겨도 codegen 은 안 바뀝니다. 이게 SSoT 의 힘.

#### 5) alias vs id vs name (이 파일에서 가장 헷갈리는 3형제)
- `id` = 지표의 **종류**(sma, rsi, macd). "무슨 도구인가".
- `alias` = 그 지표를 **조건에서 부르는 내부 키**(Python 식별자, 불변). 같은 sma 를 단기/장기 두 개 쓰면 alias 로 구분(`sma_5`, `sma_20`). 조건이 `compare_to="sma_20"` 처럼 alias 로 참조.
- `name` = **사람이 보는 표시 이름**(UI·리포트용, 한글·특수문자 OK).
- 핵심: **조건은 alias 로 지표를 가리킨다.** alias 가 어긋나면 codegen 단계에서 KeyError(뒤 함정 참고).

---

## 🗺 구조도 (schema 를 중심으로 dsl/codegen/strategies 가 참조)

```
        strategies/preset (프리셋 10종)      file/loader (.kis.yaml)      자연어→dict
                 │                                  │                         │
                 │ from_preset()                    │ from_yaml_file()        │ from_dict()
                 └──────────────┬───────────────────┴────────────┬───────────┘
                                ▼                                 ▼
                       core/converters.py  ── parse_condition() / parse_indicators() ──┐
                                │                                                       │
                                ▼                  ★ 이 파일 ★                          │
                  ┌───────────────────────────────────────────────────────┐           │
                  │                  core/schema.py                         │ ◀─────────┘
                  │                                                         │
                  │   StrategySchema (전체 양식)                            │
                  │     ├─ indicators : List[IndicatorSchema]               │
                  │     ├─ candlesticks: List[CandlestickSchema]            │
                  │     ├─ entry / exit: Condition | CompositeCondition     │
                  │     ├─ risk        : RiskSchema                         │
                  │     └─ params/metadata/version                          │
                  │   OperatorType(Enum) + OPERATOR_ALIASES (정규화 맵)      │
                  └───────────────────────────────────────────────────────┘
                                │  검증·정규화 끝난 단일 표준형
                                ▼
                  codegen/generator.py  (LeanCodeGenerator)
                     schema.collect_all_indicators()   → alias→IndicatorSchema 맵
                     schema.get_unique_indicators()    → 중복 제거 후 지표 초기화
                     schema.candlesticks               → 캔들 패턴 맵
                     entry/exit 의 operator·alias       → OnData 조건 코드
                                │  Lean Python(QCAlgorithm) 소스 문자열
                                ▼
                          lean/executor → 백테스트 결과
```

> dsl(`RuleBuilder`)은 schema 를 직접 만들지 않고 `StrategyDefinition` 을 만든 뒤 `from_definition()` 으로 schema 로 변환됩니다 — 그래서 위 그림에서 dsl 은 `converters` 를 거쳐 schema 로 들어옵니다(개요 §2 참고).

---

## 📖 라인별 해설

### A. 파일 설명서 + import — `L1-L20`

```python
# L1-L10
"""Unified Strategy Schema - Single Source of Truth.

모든 전략 입력(Python 프리셋, YAML 파일)을 표준화하는 Pydantic 스키마.
Generator, Loader, API 등 모든 컴포넌트가 이 스키마를 사용합니다.

핵심 원칙:
1. 단일 키 표준화 (operator, NOT event/type)
2. 타입 안전성 (Pydantic 검증)
3. 자동 정규화 (crosses_above → cross_above)
"""
```
- 파일 맨 위 docstring 이 곧 **이 파일의 헌법**입니다. 3대 원칙(단일 키·타입 안전·자동 정규화)이 아래 모든 코드의 이유입니다.
- "Generator(codegen), Loader(file), API 등 모든 컴포넌트가 이 스키마를 사용" — 즉 이 한 파일이 흔들리면 전부 흔들립니다. SSoT 의 무게.

```python
# L12-L20
from __future__ import annotations
import logging
from enum import Enum
from typing import Any, Dict, List, Literal, Optional, Union
logger = logging.getLogger(__name__)
from pydantic import BaseModel, Field, field_validator, model_validator
```
- `from __future__ import annotations` — 타입힌트를 문자열로 늦게 평가(자기참조 `"CompositeConditionSchema"` 같은 전방참조를 가능하게). vbt_engine 에서 본 그 "주문".
- `Union[A, B]` = "A 이거나 B", `Optional[X]` = "X 이거나 None", `Literal["AND","OR"]` = "이 두 문자열만".
- `BaseModel`(Pydantic 모델의 부모) · `Field`(칸 정의) · `field_validator`/`model_validator`(검증 데코레이터) — 이 파일의 4대 도구.

---

### B. 연산자 단일 정의 `OperatorType` — `L23-L38`

```python
# L23-L38
class OperatorType(str, Enum):
    """조건 연산자 - 단일 정의 ..."""
    GREATER_THAN = "greater_than"
    LESS_THAN = "less_than"
    GREATER_EQUAL = "greater_equal"
    LESS_EQUAL = "less_equal"
    CROSS_ABOVE = "cross_above"
    CROSS_BELOW = "cross_below"
    EQUAL = "equal"
    NOT_EQUAL = "not_equal"
    BREAKS = "breaks"
    BETWEEN = "between"
```
- **연산자의 유일한 정의처**(원칙 1). 비교는 이 10종 밖으로 못 나갑니다.
- `str, Enum` 동시 상속 → `OperatorType.CROSS_ABOVE` 가 `"cross_above"` 와 같게 취급됨. dict/JSON 직렬화가 자연스러움.
- vbt_engine 의 `StrategyType = Literal[...]` 과 같은 발상(허용값 고정)이지만, 여기선 **Enum + 별칭 맵**까지 붙여 입력 다양성을 흡수합니다(바로 아래).

---

### C. 연산자 별칭 맵 `OPERATOR_ALIASES` — `L41-L62`

```python
# L41-L62 (요약)
OPERATOR_ALIASES = {
    "indicator_cross_above": OperatorType.CROSS_ABOVE,  # Python 프리셋 표기
    "crosses_above": OperatorType.CROSS_ABOVE,          # 추가 별칭(복수형)
    "crossover": OperatorType.CROSS_ABOVE,
    ">":  OperatorType.GREATER_THAN,
    "<":  OperatorType.LESS_THAN,
    ">=": OperatorType.GREATER_EQUAL,
    "==": OperatorType.EQUAL,
    "gt": OperatorType.GREATER_THAN,
    "gte": OperatorType.GREATER_EQUAL,
    ...
}
```
- **원칙 3(자동 정규화)의 사전(dictionary)**. 사람·프리셋·YAML 이 같은 뜻을 다르게 적어도(`>`, `gt`, `crosses_above`, `crossover`, `indicator_cross_above`) 전부 **하나의 `OperatorType`** 으로 매핑.
- 왜 필요? 입력 출처가 다양하기 때문(개요의 "프리셋·YAML·dict"). 이 맵이 그 차이를 한 곳에서 흡수해, 뒷단은 정규화된 값만 봅니다.
- 주의: 이 맵은 **소문자 비교**를 전제로 씁니다(아래 `normalize_operator` 가 `.lower()` 후 조회). `">"`, `"=="` 같은 기호는 대소문자가 없어 그대로 매칭.

---

### D. 가격 예약어 `PRICE_FIELDS` — `L65-L66`

```python
# L65-L66
PRICE_FIELDS = frozenset({"close", "open", "high", "low", "volume", "price"})
```
- "지표가 아닌 **가격 데이터** 키" 목록. `close > sma_20` 처럼 왼쪽이 지표가 아니라 그냥 종가일 수 있어, 이걸 구분해야 함.
- `frozenset` = 변경 불가능한 집합. 멤버십 검사(`x in PRICE_FIELDS`)가 빠르고, 실수로 못 바꿈.
- 쓰임: `IndicatorSchema.validate_indicator_id`(가격이면 통과), `is_price_comparison`, `get_unique_indicators`(가격은 지표 초기화에서 제외) 등.

---

### E. 캔들스틱 스키마 `CandlestickSchema` — `L69-L86`

```python
# L69-L86
class CandlestickSchema(BaseModel):
    """캔들스틱 패턴 스키마 ... 신호값(-1, 0, +1)을 반환합니다."""
    id: str = Field(..., description="패턴 ID (marubozu, doji, engulfing, ...)")
    alias: Optional[str] = Field(default=None, description="패턴 별칭 (참조용)")

    @model_validator(mode='after')
    def set_default_alias(self) -> 'CandlestickSchema':
        if self.alias is None:
            self.alias = self.id
        return self
```
- 캔들 패턴은 **파라미터가 없고**(도지·해머 등은 모양만 보면 됨), 신호값 -1/0/+1 만 냄. 그래서 필드가 `id`·`alias` 뿐.
- `id` 는 필수(`...`), `alias` 는 선택. `@model_validator(mode='after')` 가 객체 완성 후 **alias 없으면 id 로 채움** — 빈칸 자동 보정의 첫 사례.

---

### F. 지표 스키마 `IndicatorSchema` — `L89-L132` (핵심)

```python
# L89-L105
class IndicatorSchema(BaseModel):
    """지표 스키마 ... 지표의 모든 정보를 표준화합니다."""
    id: str = Field(..., description="지표 ID (sma, ema, rsi, macd, ...)")
    alias: Optional[str] = Field(default=None, description="지표 내부 키 (참조용, 불변)")
    name: Optional[str] = Field(default=None, description="표시 이름 (UI·리포트용)")
    params: Dict[str, Any] = Field(default_factory=dict, description="지표 파라미터")
    output: str = Field(default="value", description="출력값")
```
- **5칸의 의미(사전지식 5번 alias/id/name 3형제 + params + output):**
  - `id` — 지표 종류(필수). `alias` — 조건이 부르는 내부 키(불변). `name` — 화면 표시명.
  - `params` — 지표 설정. `Field(default_factory=dict)` 는 "빈 dict 를 기본값으로"(가변 기본값 함정 회피용 관용구). 예: SMA 면 `{"period": 20}`.
  - `output` — **멀티 아웃풋 지표의 어느 선을 쓸지**. 기본 `"value"`. macd 는 value/signal/histogram, bollinger 는 middle/upper/lower 중 선택.

```python
# L107-L116
    @field_validator('id')
    @classmethod
    def validate_indicator_id(cls, v: str) -> str:
        if v in PRICE_FIELDS:
            return v
        # 순환 import 방지 — 지표 레지스트리 검증은 loader.py에서 수행
        return v
```
- `id` 검증. **가격 필드면 통과**. 그 외는 지금은 그냥 통과시키는데, 주석이 이유를 밝힘: **지표 레지스트리(INDICATOR_REGISTRY) 검증을 여기서 하면 순환 import** 가 생긴다(schema ↔ indicator 가 서로 import). 그래서 **진짜 유효성 검증은 codegen 의 `IndicatorValidator`/loader 에서** 따로 합니다.
- 교훈: SSoT 라고 모든 검증을 한 파일에 욱여넣지 않음 — **순환 의존을 피하려 일부 검증은 의도적으로 뒤로 미룸**.

```python
# L118-L123
    @model_validator(mode='after')
    def set_default_alias(self) -> 'IndicatorSchema':
        if self.alias is None:
            self.alias = self.id
        return self
```
- 캔들과 동일 패턴 — alias 없으면 id. 그래서 단순 지표는 alias 를 안 적어도 됨(`sma` 하나면 alias 도 `sma`).

```python
# L125-L132
    def get_unique_key(self) -> str:
        """멀티 아웃풋 지표의 고유 키 (중복 초기화 방지)
        Returns: id + params 해시 (output은 제외)
        """
        params_str = str(sorted(self.params.items()))
        return f"{self.id}:{params_str}"
```
- **왜 output 을 제외?** bollinger 의 upper·middle·lower 는 **같은 지표 객체 하나**에서 세 선이 나옵니다. id+params 가 같으면(= 같은 BollingerBands(20,2.0)) **한 번만 초기화**하고 세 출력을 공유해야 효율적·정확. output 까지 키에 넣으면 같은 지표를 3번 초기화하는 낭비/버그.
- `sorted(params.items())` — dict 는 순서가 달라도 같은 내용이면 같은 키가 나오게 정렬.

---

### G. 단일 조건 스키마 `ConditionSchema` — `L135-L237` (이 파일의 알맹이)

전략의 "조건 한 줄"을 객체로 표현합니다. `SMA(5) > SMA(20)`, `close > sma * 0.9`, `RSI < 30`, 캔들 `marubozu bullish` 까지 한 클래스로 커버.

```python
# L153-L162
    operator: Optional[OperatorType] = Field(default=None, description="비교 연산자")
    indicator: str = Field(default="", description="왼쪽 지표 alias 또는 가격")
    indicator_output: str = Field(default="value", description="왼쪽 지표 출력값")
    compare_to: Optional[str] = Field(default=None, description="오른쪽 지표 alias")
    compare_output: str = Field(default="value", description="오른쪽 지표 출력값")
    compare_scalar: Optional[float] = Field(default=None, description="오른쪽 지표 스칼라/오프셋")
    compare_operation: Optional[str] = Field(default=None, description="연산 종류 (mul, div, add, sub)")
    value: Optional[float] = Field(default=None, description="비교 상수")
    candlestick: Optional[str] = Field(default=None, description="캔들스틱 패턴 alias")
    signal: Optional[str] = Field(default=None, description="캔들스틱 신호 (bullish, bearish, detected)")
```
- **왼쪽(`indicator`) [연산자(`operator`)] 오른쪽** 구조. 오른쪽은 세 갈래 중 하나:
  - **다른 지표**(`compare_to="sma_20"`) — 지표 vs 지표.
  - **상수**(`value=30`) — 지표 vs 숫자(예: RSI < 30).
  - **스케일된 지표**(`compare_to="sma" + compare_scalar=0.9 + compare_operation="mul"`) — `SMA * 0.9` 같은 이격선(예: "종가가 이동평균의 90% 아래로").
- `indicator_output`/`compare_output` — 양쪽이 멀티아웃풋 지표일 때 어느 선인지(macd.value vs macd.signal).
- 캔들 조건은 `candlestick`+`signal` 만 채움(operator·indicator 불필요).

```python
# L164-L200
    @field_validator('operator', mode='before')
    @classmethod
    def normalize_operator(cls, v: Any) -> Optional[OperatorType]:
        if v is None:
            return None
        if isinstance(v, OperatorType):
            return v
        if isinstance(v, str):
            v_lower = v.lower().strip()
            if v_lower in OPERATOR_ALIASES:        # ① 별칭 맵
                return OPERATOR_ALIASES[v_lower]
            try:
                return OperatorType(v_lower)        # ② Enum 값 직접
            except ValueError:
                pass
            normalized = v_lower.replace("crosses_", "cross_")  # ③ 복수형 정규화
            try:
                return OperatorType(normalized)
            except ValueError:
                pass
        raise ValueError(f"Unknown operator: {v}")
```
- **원칙 3(자동 정규화)의 심장.** `mode='before'` = **Pydantic 이 타입 검사하기 전에** 먼저 가공 → 어떤 형태로 들어와도 `OperatorType` 으로 변환.
- 3단 시도: ① 별칭 맵(`">" → GREATER_THAN`) → ② Enum 값 직접(`"cross_above"`) → ③ `crosses_ → cross_` 치환(`"crosses_above" → "cross_above"`, docstring 의 그 예시). 셋 다 실패하면 **명확한 에러**.
- `None` 허용(첫 줄) — 캔들 조건은 operator 가 없어도 되니까.

```python
# L202-L221
    @model_validator(mode='after')
    def validate_comparison(self) -> 'ConditionSchema':
        # 캔들스틱 조건은 signal만 있으면 됨
        if self.candlestick is not None:
            if self.signal is None:
                self.signal = "detected"        # 기본: 패턴 감지
            if self.operator is None:
                self.operator = OperatorType.GREATER_THAN  # 더미 값
            return self
        # 일반 조건: operator 필수
        if self.operator is None:
            raise ValueError("operator is required for non-candlestick conditions")
        # 일반 조건: compare_to / value / compare_scalar 중 하나 필요
        if self.compare_to is None and self.value is None and self.compare_scalar is None:
            raise ValueError("Either compare_to (indicator) or value (number) must be provided")
        return self
```
- **객체 완성 후 정합성 검사**(mode='after'). 두 경로:
  - **캔들 조건**: signal 없으면 `"detected"` 기본, operator 없으면 `GREATER_THAN` **더미**(캔들은 operator 안 쓰지만 다른 코드가 None 을 만나면 깨질까 봐 안전하게 채움 — 주석 "더미 값").
  - **일반 조건**: operator 필수, **비교 대상도 셋 중 하나는 필수**. 비면 반려(에러). 이게 "필수칸 검증".

```python
# L223-L237
    def is_candlestick_condition(self) -> bool: return self.candlestick is not None
    def is_price_comparison(self) -> bool:      return self.indicator in PRICE_FIELDS
    def is_cross_condition(self) -> bool:
        return self.operator in (OperatorType.CROSS_ABOVE, OperatorType.CROSS_BELOW)
    def is_scaled_comparison(self) -> bool:     return self.compare_scalar is not None
```
- codegen 이 "이 조건이 어떤 종류인지" 물어보는 **질의 메서드 4종**. 캔들? 가격비교? 교차? 스케일비교? — 종류에 따라 생성할 Lean 코드가 다르므로, codegen 이 이걸로 분기합니다.

---

### H. 복합 조건 `CompositeConditionSchema` — `L240-L264`

```python
# L240-L264
class CompositeConditionSchema(BaseModel):
    """복합 조건 스키마 (AND/OR)"""
    logic: Literal["AND", "OR"] = Field(..., description="논리 연산자")
    conditions: List[Union[ConditionSchema, "CompositeConditionSchema"]] = Field(
        ..., description="조건 목록"
    )
    @field_validator('logic', mode='before')
    @classmethod
    def normalize_logic(cls, v: str) -> str:
        if isinstance(v, str):
            return v.upper()
        return v

CompositeConditionSchema.model_rebuild()  # 재귀 참조 해결
```
- **조건의 트리**. `conditions` 의 원소가 `ConditionSchema`(잎) **또는 다시 `CompositeConditionSchema`**(가지) — 즉 **재귀**. 그래서 "(A 또는 B) 그리고 C" 처럼 중첩이 가능.
- `Literal["AND","OR"]` + `normalize_logic` 의 `.upper()` → `and`/`And`/`AND` 다 받아 대문자로 통일(연산자 정규화와 같은 철학).
- `"CompositeConditionSchema"`(문자열 전방참조)를 쓴 뒤 **`model_rebuild()` 로 자기참조를 확정**해야 Pydantic 이 재귀 타입을 완성합니다(이 한 줄 빠지면 에러).

---

### I. 리스크 스키마 `RiskSchema` — `L267-L321`

```python
# L267-L275
class RiskSchema(BaseModel):
    """리스크 관리 스키마 — 손절/익절/트레일링 스탑 설정"""
    stop_loss_pct: Optional[float] = Field(default=None, ge=0, le=100, ...)
    take_profit_pct: Optional[float] = Field(default=None, ge=0, le=100, ...)
    trailing_stop_pct: Optional[float] = Field(default=None, ge=0, le=100, ...)
    max_position_size: Optional[float] = Field(default=None, ge=0, le=1, ...)
```
- `ge=0, le=100` — **Pydantic 이 범위까지 검증**(0~100%). 손절 150% 같은 헛값을 그 자리에서 막음. `max_position_size` 는 비율이라 0~1.
- 전부 Optional — 안 쓰면 None(해당 안전장치 없음).

```python
# L277-L321 (요약)
    def to_dict(self) -> Dict[str, Any]:
        """risk_management 딕셔너리 형식으로 변환 (하위 호환)"""
        # stop_loss_pct=5.0 → {"stop_loss": {"enabled": True, "percent": 5.0}}
        ...
    @classmethod
    def from_dict(cls, data) -> "RiskSchema":
        """기존 risk_management 딕셔너리에서 생성
        지원: ① {stop_loss: {enabled, percent}}  ② {stop_loss_pct: 5.0}"""
        ...
```
- **두 형식의 다리**: 깔끔한 `stop_loss_pct=5.0`(새 형식) ↔ 중첩 `{stop_loss:{enabled,percent}}`(기존 형식). `from_dict` 가 둘 다 받아들이고, `to_dict` 가 기존 형식으로 되돌려 줌 → **하위 호환**.
- 이게 SSoT 의 실전 미덕: 내부는 한 표준형으로 살고, 바깥 옛 형식과는 **변환기로만** 소통.

---

### J. 전략 스키마 `StrategySchema` — `L324-L499` (★ 최종 양식)

위 조각들을 모두 담는 **전략 한 개의 전체 서식**. 이게 진짜 SSoT 본체.

```python
# L343-L354
    id: str = Field(..., description="전략 ID")
    name: str = Field(..., description="전략 이름")
    category: str = Field(default="custom", ...)
    description: str = Field(default="", ...)
    indicators: List[IndicatorSchema] = Field(..., description="사용 지표 목록")
    candlesticks: List[CandlestickSchema] = Field(default_factory=list, ...)
    entry: Union[ConditionSchema, CompositeConditionSchema] = Field(..., description="진입 조건")
    exit:  Union[ConditionSchema, CompositeConditionSchema] = Field(..., description="청산 조건")
    risk: Optional[RiskSchema] = Field(default=None, ...)
    params: Dict[str, Dict[str, Any]] = Field(default_factory=dict, ...)
    metadata: Dict[str, Any] = Field(default_factory=dict, ...)
    version: str = Field(default="1.0", ...)
```
- **필수 4칸**(`...`): `id`·`name`·`indicators`·`entry`·`exit`. 전략엔 최소한 "무슨 지표로, 언제 사고(entry), 언제 파나(exit)" 가 있어야 함.
- `entry`/`exit` 가 `ConditionSchema | CompositeConditionSchema` — **단일 조건도, AND/OR 트리도** 받음.
- `params` 는 **파라미터 정의**(이중 dict: 파라미터명 → {기본값·범위·타입}). 프론트가 "이 전략의 손잡이"를 동적으로 보여주는 데 씀(개요의 PARAM_DEFINITIONS 와 연결).

```python
# L356-L398 (요약)
    @model_validator(mode='after')
    def auto_populate_candlesticks(self) -> 'StrategySchema':
        from kis_backtest.core.candlestick import CANDLESTICK_REGISTRY
        existing_aliases = {cs.alias or cs.id for cs in self.candlesticks}

        def collect_candlestick_aliases(cond) -> set:        # entry/exit 트리 재귀 순회
            ...  # ConditionSchema.candlestick 들을 모음

        referenced_aliases = collect... (entry) | collect... (exit)
        for alias in referenced_aliases:
            if alias not in existing_aliases:
                pattern_id = self._extract_pattern_id(alias, CANDLESTICK_REGISTRY)
                self.candlesticks.append(CandlestickSchema(id=pattern_id or alias, alias=alias))
        return self
```
- **편의 자동화**: YAML 에서 `candlesticks:` 섹션을 안 써도, **조건에서 캔들을 참조하면 자동으로 목록에 추가**(docstring 예: entry 에 `gravestone_doji_1` 만 있어도 candlesticks 에 `{id: gravestone_doji, alias: gravestone_doji_1}` 자동 등록).
- `collect_candlestick_aliases` 가 entry/exit **조건 트리를 재귀**로 훑어 캔들 alias 를 수집 → 누락분을 채움.
- 함수 안에서 `CANDLESTICK_REGISTRY` 를 **지연 import**(`L367`) — 모듈 최상단이 아니라 메서드 안 import 는 **순환 import 회피** 관용구(F절 validate_indicator_id 의 그 이유와 같은 맥락).

```python
# L400-L423
    @staticmethod
    def _extract_pattern_id(alias: str, registry: dict) -> Optional[str]:
        """alias에서 pattern ID 추출 (예: gravestone_doji_1 → gravestone_doji)"""
        if alias in registry:
            return alias
        match = re.match(r'^(.+)_\d+$', alias)   # 끝의 _숫자 제거
        if match and match.group(1) in registry:
            return match.group(1)
        return None
```
- alias `hammer_2` 처럼 **번호 접미사**가 붙어도 베이스 패턴 `hammer` 를 레지스트리에서 찾아냄. 못 찾으면 None → 위에서 alias 를 그대로 id 로 넣어 **에러를 일부러 유도**(`L394-396` 주석 "에러 발생 유도": 잘못된 패턴명을 조용히 삼키지 않고 드러냄).

```python
# L425-L466
    def get_indicator_by_alias(self, alias): ...           # alias로 지표 1개 찾기
    def get_unique_indicators(self) -> List[IndicatorSchema]:
        """중복 제거된 지표 목록 (같은 alias는 한 번만 초기화)"""
        # 가격 필드(PRICE_FIELDS) 제외 + alias 중복 제거
    def collect_all_indicators(self) -> Dict[str, IndicatorSchema]:
        """alias → IndicatorSchema 맵 (first-wins 정책)"""
        # 중복 alias 발견 시 logger.warning 후 첫 번째만 사용
```
- 이 3개가 **codegen 이 실제로 호출하는 메서드**입니다(`generator.py:95,103`에서 `collect_all_indicators`/`get_unique_indicators` 사용 — 본문 외부 코드로 확인됨).
  - `get_unique_indicators` — **지표 객체를 몇 번 초기화할지** 결정. 가격은 제외(초기화 불필요), 같은 alias 는 한 번만. bb_upper·bb_lower 처럼 alias 가 다르면 각각 초기화.
  - `collect_all_indicators` — alias→지표 맵. **중복 alias 는 첫 번째만**(first-wins) 쓰고 경고 로그. "조용한 덮어쓰기" 대신 **경고로 드러냄**.

```python
# L468-L499 (요약)
    def to_dict(self) -> Dict[str, Any]:
        """하위 호환성: 기존 Dict 형식으로 변환"""
        def condition_to_dict(cond):
            if isinstance(cond, CompositeConditionSchema):
                return {"logic": ..., "conditions": [재귀]}
            return {"event": cond.operator.value, "indicator": ..., ...}  # ← event 키!
        return { ..., "risk_management": self.risk.to_dict() if self.risk else {}, ... }
```
- **거꾸로 가는 다리**: 표준 스키마 → **옛날 dict 형식**. 주목할 디테일 — `"event": cond.operator.value`(`L478`). 내부는 `operator` 로 통일했지만, 옛 소비자에게 내보낼 땐 다시 `event` 키로 포장(하위 호환). risk 도 `risk_management` 키로.
- 즉 스키마는 **"안에서는 표준, 밖과는 변환"** 원칙을 끝까지 지킵니다.

---

### K. 팩토리 함수 `parse_condition` / `parse_indicators` — `L506-573`

스키마의 **접수 창구**. 제각각 dict 를 받아 위 스키마 객체로 옮겨 적습니다. `converters.py` 가 이 둘을 호출(`converters.py:25-26,164,167-168,200,203-204`).

```python
# L506-L540 (요약)
def parse_condition(data) -> Union[ConditionSchema, CompositeConditionSchema]:
    # ① 복합 조건
    if "logic" in data and "conditions" in data:
        return CompositeConditionSchema(logic=..., conditions=[parse_condition(c) for c in ...])
    # ② 캔들스틱 조건
    if "candlestick" in data:
        return ConditionSchema(operator=OperatorType.GREATER_THAN, indicator="",
                               candlestick=data["candlestick"], signal=data.get("signal","detected"))
    # ③ 단일 조건 — operator 키 우선, 없으면 event/type
    operator_value = data.get("operator") or data.get("event") or data.get("type")
    if not operator_value:
        raise ValueError(f"Condition missing operator/event/type: {data}")
```
- **입력 형식 5종을 모두 흡수**(docstring L508-514): 프리셋(`event`)·YAML(`operator`)·복합(`logic`)·스케일(`compare_scalar`)·캔들(`candlestick`).
- `L533-537` 이 **원칙 1(단일 키 표준화)의 실행 코드**: `operator or event or type` — 어느 키로 와도 하나로 받아 normalize_operator 가 표준화. 셋 다 없으면 명확한 에러.
- 복합 조건은 `parse_condition` 을 **재귀 호출**해 트리를 그대로 복원.

```python
# L542-L559 (요약)
    indicator_output = data.get("indicator_output") or data.get("output", "value")
    compare_output = data.get("compare_output", "value")
    compare_scalar = data.get("compare_scalar")
    compare_operation = data.get("compare_operation")
    return ConditionSchema(operator=operator_value, indicator=data.get("indicator",""),
                           indicator_output=indicator_output, compare_to=data.get("compare_to"),
                           ..., value=data.get("value"))
```
- `output` 키 정규화도 여기서: YAML 의 `indicator_output` 과 Python 의 `output` 둘 다 받아 한 칸으로(`L543`).

```python
# L562-573
def parse_indicators(data: List[Dict[str, Any]]) -> List[IndicatorSchema]:
    result = []
    for ind_dict in data:
        result.append(IndicatorSchema(
            id=ind_dict.get("id",""), alias=ind_dict.get("alias"),
            name=ind_dict.get("name"), params=ind_dict.get("params",{}),
            output=ind_dict.get("output","value")))
    return result
```
- dict 리스트 → `IndicatorSchema` 리스트. 단순 매핑이지만, 여기를 통과하면서 **각 지표가 alias 자동 채움·타입 검증**을 거칩니다(IndicatorSchema 생성 시점).

---

## ⚠️ 함정·주의

1. **alias 정합성** — 조건은 alias 로 지표를 가리키는데, 그 alias 가 `indicators` 에 없으면 **이 파일은 통과시키고** codegen 단계에서 터집니다(generator 의 `_validate_condition_aliases`). 스키마가 OK 라고 alias 가 맞다는 뜻은 아님.
2. **지표 id 유효성은 여기서 검증 안 함** — `validate_indicator_id` 는 가격만 보고 통과(순환 import 회피, `L115` 주석). 진짜 지표 존재 검증은 codegen `IndicatorValidator`/loader 가 함. "스키마 통과 ≠ 실행 가능".
3. **중복 alias = 조용한 손실** — `collect_all_indicators` 는 **first-wins**(첫 번째만 쓰고 나머지 무시, 경고만). 두 지표에 같은 alias 를 주면 둘째가 사라짐. 로그 경고를 놓치지 말 것.
4. **캔들 조건의 더미 operator** — 캔들 조건에 `operator=GREATER_THAN` 이 **자동으로 더미** 채워짐(`L211`). 이걸 진짜 비교로 오해하면 안 됨. 분기는 `is_candlestick_condition()` 으로 해야 함.
5. **`output` 은 `get_unique_key` 에서 제외** — 멀티아웃풋 지표를 같은 객체로 공유하려는 의도(`L125-132`). 만약 같은 지표인데 다른 객체로 만들고 싶다면 **alias 를 다르게** 줘야지 output 으로는 안 갈림.
6. **모델 재구축 누락 주의** — `CompositeConditionSchema.model_rebuild()`(`L264`)가 빠지면 자기참조 타입이 미완성으로 남아 런타임 에러. 재귀 Pydantic 모델의 필수 한 줄.
7. **`to_dict` 의 `event` 키** — 내부 표준은 `operator` 인데 `to_dict` 출력은 `event`(`L478`). 출력을 다시 입력으로 넣을 땐 parse_condition 이 `event` 도 받으니 왕복은 되지만, "왜 키 이름이 바뀌지?"에 놀라지 말 것(하위 호환 의도).

---

## 🚀 고도화

- **지표 레지스트리 검증 일원화**: 지금은 순환 import 때문에 지표 id 검증이 codegen/loader 로 흩어져 있음. `INDICATOR_REGISTRY` 를 가벼운 별도 모듈로 빼면, 스키마 생성 시점에 바로 "없는 지표"를 잡을 수 있어 SSoT 가 더 단단해짐.
- **연산자 별칭 확장**: `OPERATOR_ALIASES` 에 자연어 토큰("above"/"위로돌파"/"골든크로스")을 추가하면 "자연어→전략" 경로(개요 §dsl 미래 활용)와 직결. 별칭만 늘리면 되고 뒷단은 불변 — SSoT 의 확장성 시연에 좋은 자리.
- **중복 alias 정책 선택지화**: 현재 first-wins 고정. `metadata` 로 "에러로 막기 / 자동 번호부여" 를 고를 수 있게 하면 안전·편의 균형.
- **JSON Schema 자동 노출**: Pydantic 의 `model_json_schema()` 로 이 스키마의 JSON Schema 를 뽑아 프론트 폼 자동생성·OpenAPI 문서에 연결 → 양식과 UI 가 한 소스에서.
- **버전 마이그레이션**: `version` 필드는 있지만 변환 로직이 없음. 스키마가 진화할 때 `version` 기준 업그레이드 함수를 두면 옛 전략 파일을 안전하게 이행.
- **강의 포인트**: 이 파일은 "입력 다양성을 한 표준형으로 흡수하는 어댑터 패턴 + Pydantic 검증"의 교과서 예제. `normalize_operator`(3단 폴백)·`from_dict`/`to_dict`(양방향 다리)·`auto_populate`(편의 자동화) 셋을 묶어 "SSoT 설계의 3대 기법"으로 가르치기 좋음.

---

## 📚 용어 사전 (이 파일 한정)

| 용어 | 뜻 |
|---|---|
| **SSoT(Single Source of Truth)** | 같은 정보를 한 곳에서만 정의해 불일치를 막는 설계. 이 파일이 전략의 SSoT |
| **Pydantic `BaseModel`** | 타입 선언 + 자동 검증이 붙은 데이터 클래스. `@dataclass` 의 상위호환 |
| **`Field(..., ...)`** | 칸 정의. 첫 인자 `...`(Ellipsis)면 필수, `default=`면 선택 |
| **`@field_validator(mode='before')`** | 한 칸을 **타입검사 전** 가공(연산자 정규화) |
| **`@model_validator(mode='after')`** | 모든 칸 채워진 뒤 객체 전체 검증/보정(alias 자동채움) |
| **`OperatorType`(Enum)** | 비교 연산자의 유일한 정의(>, <, cross_above…) |
| **`OPERATOR_ALIASES`** | `>`·`gt`·`crosses_above` 등 다양한 표기를 `OperatorType` 으로 매핑하는 사전 |
| **`PRICE_FIELDS`** | 지표가 아닌 가격 키(close/open/high/low/volume/price) frozenset |
| **id / alias / name** | 지표 종류 / 조건이 부르는 내부 키(불변) / 화면 표시명 |
| **`output`** | 멀티아웃풋 지표(macd·bollinger)의 어느 선을 쓸지 |
| **`compare_to` / `value` / `compare_scalar`** | 조건 오른쪽: 다른 지표 / 상수 / 스케일된 지표(MA*0.9) |
| **`CompositeConditionSchema`** | 조건들을 AND/OR 로 묶은 재귀 트리 |
| **`model_rebuild()`** | 자기참조(재귀) Pydantic 모델을 확정하는 필수 호출 |
| **first-wins** | 중복 alias 시 첫 번째만 채택하고 나머지는 경고 후 버림 |
| **auto-populate** | 조건이 참조한 캔들 패턴을 candlesticks 목록에 자동 추가 |
| **지연 import** | 순환 import 회피를 위해 모듈 최상단이 아닌 함수 안에서 import |
| **`to_dict`/`from_dict`** | 표준 스키마 ↔ 옛 dict 형식 양방향 변환(하위 호환) |
