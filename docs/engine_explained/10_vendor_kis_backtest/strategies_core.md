# `strategies/` 코어 — 전략 카탈로그 + 공통 틀 (라인별 해설)

> 원본 루트: `analytics/app/lean/kis_backtest/strategies/`
> 대상 4파일: `registry.py`(216줄) · `base.py`(141줄) · `generator.py`(142줄) · `risk/position_sizer.py`(145줄)
> 형식 기준: 모범 [`01_backtest/vbt_engine.md`](../01_backtest/vbt_engine.md) · [`README.md`](../README.md) "3. 공통 형식" · 벤더 개요 [`00_overview.md`](00_overview.md).

---

## 📌 한눈에

이 4파일은 KIS 백테스트 라이브러리의 **"전략 카탈로그 + 공통 틀"** 입니다. 전략 하나하나(SMA 크로스, 모멘텀 등)는 `preset/` 폴더에 있고, 이 코어는 그 전략들을 **① 한 명부(레지스트리)에 모으고 ② 모두가 따라야 할 공통 모양(베이스 클래스)을 정하고 ③ 옛 호출 방식과의 호환을 잇고 ④ "한 번에 얼마를 살지"(포지션 사이징)를 코드로 찍어내는** 역할을 합니다.

> 비유: 도서관입니다. `preset/` 의 전략들이 **책**이라면, `registry.py` 는 **책을 id로 찾는 도서 목록(카탈로그)**, `base.py` 는 **모든 책이 따라야 할 표준 판형(목차·표지 규격)**, `generator.py` 는 **옛날 청구번호로 와도 새 시스템으로 안내해 주는 안내 데스크**, `position_sizer.py` 는 **"이 책 내용대로 투자할 때 한 종목에 자본의 몇 %를 넣을지"를 적어주는 부록**입니다.

핵심 클래스 4개:

| 클래스 | 파일 | 한 줄 역할 | 비유 |
|---|---|---|---|
| `StrategyRegistry` | `registry.py` | id로 전략을 등록(`@register`)·조회·빌드하는 중앙 명부 | 도서 카탈로그(청구번호→책) |
| `BaseStrategy(ABC)` | `base.py` | 모든 프리셋이 상속하는 추상 부모. 필수 멤버 + `PARAM_DEFINITIONS` 규약 | 모든 책의 표준 판형 |
| `StrategyGenerator` | `generator.py` | 옛 API를 받아 내부적으로 `LeanCodeGenerator` 에 위임(하위호환) | 옛 청구번호 안내 데스크 |
| `PositionSizer` | `risk/position_sizer.py` | 5가지 사이징 방법을 Lean 코드 문자열로 생성 | 투자비중 계산 부록 |

**누가 호출하나?** → 우리 쪽 오케스트레이터 `analytics/app/lean/runner.py` 가 `import ...preset`(자동 등록) 후 `StrategyRegistry` 로 전략을 꺼내 빌드합니다(`00_overview.md` §5, 근거 `runner.py:112-113, 238-239`). 프론트엔드는 `list_all_with_params()` 로 "전략 목록 + 각 전략의 조절 손잡이"를 한 번에 받아 화면에 그립니다.

**왜 이렇게 나눴나?** → 전략은 앞으로 계속 늘어납니다. 새 전략을 추가할 때 **"파일 하나 만들고 `@register` 한 줄만 붙이면" 카탈로그·프론트·codegen 이 전부 자동 인식**하도록 만든 구조입니다. 중앙 명부(registry)와 공통 규격(base)을 분리한 덕분입니다.

---

## 🧠 사전 지식 (이거 모르면 막힘)

#### 1) 레지스트리 패턴 = "id → 객체"를 모아두는 중앙 명부

```
"sma_crossover" ──▶ SMACrossoverStrategy 클래스
"momentum"      ──▶ MomentumStrategy 클래스
"week52_high"   ──▶ Week52HighStrategy 클래스
        ▲
   StrategyRegistry._strategies (딕셔너리 하나)
```
- 코드 곳곳이 "어떤 전략 클래스가 있는지" 직접 알 필요 없이, **레지스트리에 문자열 id만 물어보면** 됩니다.
- 등록은 `@register("id")` **데코레이터**로 자동. 클래스 정의가 import 되는 순간 명부에 꽂힙니다(side-effect). 그래서 `runner.py` 가 `import ...preset` 한 줄로 10종을 전부 깨우는 것.

#### 2) 데코레이터(`@register`) = "클래스를 만들면서 동시에 명부에 등록"

```python
@StrategyRegistry.register("sma_crossover", ...)
class SMACrossoverStrategy(BaseStrategy):
    ...
```
- `@데코레이터` 는 "바로 아래 정의되는 것(여기선 클래스)을 함수에 통과시킨다"는 파이썬 문법.
- `register("id")` 가 **함수를 하나 돌려주고**(아래 라인별에서 `decorator`), 그 함수가 클래스를 받아 `_strategies["id"] = 클래스` 로 저장한 뒤 **클래스를 그대로 반환**. 그래서 `SMACrossoverStrategy` 는 평소처럼 쓸 수 있으면서도, 정의되는 순간 명부에 등록됩니다.

#### 3) 추상 베이스 클래스(ABC) + 상속 = "공통 규격을 강제"

- `ABC`(Abstract Base Class)는 **직접 만들 수 없는 "틀"** 입니다. `@abstractmethod` 가 붙은 메서드는 **자식 클래스가 반드시 구현**해야 하고, 안 하면 그 자식도 만들 수 없습니다(즉시 에러).
- 효과: 모든 프리셋이 `id`·`name`·`entry_condition`·`build` 같은 **같은 모양의 손잡이**를 가지도록 강제 → registry·codegen 이 "어떤 전략이든 똑같은 방식으로" 다룰 수 있음.
- 비유: 콘센트 규격(220V·2핀). 어떤 가전이든 이 규격만 지키면 어느 콘센트에나 꽂힘.

#### 4) `PARAM_DEFINITIONS` = 전략의 "조절 손잡이 설명서"

```python
PARAM_DEFINITIONS = {
    "fast_period": {"default": 5, "min": 2, "max": 50, "type": "int", "description": "단기 SMA 기간"},
}
```
- 각 전략이 **어떤 파라미터를(이름) 어디부터 어디까지(min/max) 무슨 타입으로** 받는지의 명세. 프론트엔드가 이걸 읽어 슬라이더/입력창을 **자동 생성**합니다.
- vbt_engine 의 `BacktestParams`(dataclass) 와 같은 "파라미터=전략의 다이얼" 개념이지만, 여기선 **메타데이터(범위·타입까지)**를 함께 들고 있어 UI 가 동적으로 그릴 수 있는 게 차이.

#### 5) 포지션 사이징 = "한 번에 자본의 얼마를 넣을까"

- 신호가 "사라"여도 **전 재산을 한 종목에 넣을지, 10%만 넣을지**는 별개 문제. 이걸 정하는 게 사이징.
- `PositionSizer` 는 직접 계산하지 않고 **Lean(QuantConnect)에 삽입될 파이썬 코드 문자열을 생성**합니다(codegen 의 일부). 즉 "계산기"가 아니라 "계산 코드를 찍어내는 도장". (vbt_engine 고도화 절의 "포지션 사이징" 아이디어가 여기서 실제 구현됨.)

#### 6) 이 코어가 전체 파이프라인 어디에 있나

```
preset 전략 클래스 ──(@register)──▶ StrategyRegistry
                                        │ build()  →  StrategyDefinition (core/strategy)
                                        ▼
                              core/converters.from_preset → StrategySchema (Single Source of Truth)
                                        ▼
                              codegen/LeanCodeGenerator → Lean 코드 (PositionSizer 코드도 여기 합쳐짐)
                                        ▼
                              lean/executor → 백테스트 결과
```
- registry/base 는 **"전략을 표준 정의(`StrategyDefinition`)로 만드는 입구"**, generator/position_sizer 는 **그 정의를 Lean 코드로 바꾸는 출구 쪽**에 위치합니다.

---

## 🗺 구조 (이 4파일의 관계)

```
                  ┌─────────────────────────────────────────────┐
                  │   base.py : BaseStrategy (ABC)              │  공통 규격(부모)
                  │   - 추상: id/name/category/indicators/      │
                  │            entry_condition/exit_condition/  │
                  │            build                            │
                  │   - 규약: PARAM_DEFINITIONS, _build_params  │
                  └─────────────────────────────────────────────┘
                            ▲ 상속(inherit)
        ┌───────────────────┼───────────────────┬─────────── … (총 10종)
        │                   │                   │
 SMACrossoverStrategy  MomentumStrategy  Week52HighStrategy   ← preset/*.py (책들)
        │ @register("sma_crossover")            │
        └─────────┬─────────┴───────────────────┘
                  ▼  import 시 자동 등록(side-effect)
        ┌─────────────────────────────────────────────┐
        │  registry.py : StrategyRegistry             │  중앙 명부(카탈로그)
        │   _strategies = { "id": 클래스 }            │
        │   register / get / build / build_with_params│
        │   get_param_definitions / list_all_with_params
        └─────────────────────────────────────────────┘
                  ▲ 조회
        ┌─────────┴───────────────┐         ┌───────────────────────────────┐
        │ generator.py            │         │ risk/position_sizer.py        │
        │ StrategyGenerator       │         │ PositionSizer / SizingMethod  │
        │ (registry.get → schema  │         │ generate_init / _sizing /     │
        │  → LeanCodeGenerator)   │         │ _update → Lean 코드 문자열    │
        │ ※ 하위호환 래퍼         │         │ ※ codegen 이 끼워 넣음        │
        └─────────────────────────┘         └───────────────────────────────┘
```

핵심 관계: **base ← preset들(상속)**, **preset들 → registry(자동 등록)**, **generator/position_sizer 는 registry/codegen 을 통해 "정의 → Lean 코드"를 돕는 보조**.

---

## 📖 파일별 라인별 해설

---

## 1. `registry.py` — 전략 중앙 명부

### A. docstring + import — `L1-L13`

```python
# L1-L13
"""Strategy Registry.

모든 프리셋 전략을 등록하고 조회하는 레지스트리.
전략 빌더와 codegen에서 공통으로 사용.
"""
from __future__ import annotations
from typing import Any, Callable, Dict, List, Optional, Type
from kis_backtest.strategies.base import BaseStrategy
from kis_backtest.core.strategy import StrategyDefinition
```
- 이 파일의 정체: **"등록(register)과 조회(get)"의 중앙 창구**. 전략 빌더와 codegen 양쪽이 공통으로 씁니다(주석).
- `Type[BaseStrategy]` — "BaseStrategy 의 **인스턴스**가 아니라 **클래스 자체**"를 가리키는 타입. 레지스트리는 객체가 아니라 **클래스(설계도)**를 저장한다는 게 핵심(필요할 때 `클래스(**params)` 로 새로 찍어냄).
- `Callable[[Type[BaseStrategy]], Type[BaseStrategy]]` — "클래스를 받아 클래스를 돌려주는 함수" = 데코레이터의 타입.

### B. 명부 저장소 두 개 — `L16-L44`

```python
# L16-L44 (발췌)
class StrategyRegistry:
    _strategies: Dict[str, Type[BaseStrategy]] = {}
    _metadata: Dict[str, Dict[str, Any]] = {}
```
- 클래스 변수 **두 개의 딕셔너리**가 전부입니다. 인스턴스를 만들지 않고 **클래스 자체를 명부로 사용**(모든 메서드가 아래 `@classmethod`).
  - `_strategies`: `"sma_crossover" → SMACrossoverStrategy` (id → **클래스**)
  - `_metadata`: `"sma_crossover" → {id, name, category, description, tags}` (id → **설명표**)
- 왜 둘로 나누나? `_strategies` 는 "빌드할 때 쓸 실체(클래스)", `_metadata` 는 "목록·검색에 쓸 가벼운 정보". 프론트 목록은 무거운 클래스 없이 metadata 만으로 그릴 수 있음.
- `_` 접두사 = "내부용, 직접 건드리지 마세요" 관습.

> ⚠️ 초보 포인트: `_strategies` 가 **클래스 변수**라 모든 곳에서 **하나의 명부를 공유**합니다(전역 단일 명부). 그래서 어디서 `@register` 하든 같은 곳에 쌓입니다.

### C. 등록 데코레이터 `register()` — `L46-L86` (이 파일의 알맹이)

```python
# L46-L55 (머리)
@classmethod
def register(cls, strategy_id, *, name=None, category=None,
             description=None, tags=None) -> Callable[...]:
```
- `*` 뒤 인자들은 **키워드 전용**(`register("id", name=...)` 처럼 이름 붙여야 함). 실수로 순서만 보고 잘못 넣는 걸 막는 안전장치.
- `category` 주석의 후보: `trend, momentum, oscillator, volatility, mean_reversion, composite` — 전략 분류 체계.

```python
# L76-L86 (실제 등록)
    def decorator(strategy_cls):
        cls._strategies[strategy_id] = strategy_cls
        cls._metadata[strategy_id] = {
            "id": strategy_id,
            "name": name or strategy_id,
            "category": category or "uncategorized",
            "description": description or "",
            "tags": tags or [],
        }
        return strategy_cls
    return decorator
```
- **이게 데코레이터의 심장**입니다. `register(...)` 호출은 즉시 등록하는 게 아니라 **`decorator` 라는 함수를 돌려줍니다**. 파이썬이 그 함수에 바로 아래 클래스를 넣어 실행 → `_strategies`/`_metadata` 에 저장 → **클래스를 그대로 반환**(`return strategy_cls`).
- `name or strategy_id` — name 을 안 주면 id 를 표시이름으로(폴백). `tags or []` — None 이면 빈 리스트로(나중에 `tags` 를 안전하게 순회).
- 실제 사용 모습(preset, `sma_crossover.py:22-29`):
  ```python
  @register("sma_crossover", name="SMA 골든/데드 크로스", category="trend", ...)
  class SMACrossoverStrategy(BaseStrategy): ...
  ```
  → 이 클래스 정의가 import 되는 순간 명부에 자동 등록.

> 💡 "왜 함수를 돌려주는 함수(2단)인가?" → `@register(...)` 에 **인자**(id·name…)를 주려면, 먼저 그 인자를 받는 `register` 가 실행되고, **그 결과(데코레이터 함수)**가 클래스에 적용되어야 하기 때문. "인자 있는 데코레이터"의 표준 패턴입니다.

### D. 조회 메서드들 — `L88-L130`

```python
# L88-L96
@classmethod
def get(cls, strategy_id) -> Optional[Type[BaseStrategy]]:
    return cls._strategies.get(strategy_id)

@classmethod
def get_metadata(cls, strategy_id) -> Optional[Dict[str, Any]]:
    return cls._metadata.get(strategy_id)
```
- `.get(id)` — 없으면 **에러 대신 `None`** 반환(딕셔너리 `.get`). 호출 측이 None 체크로 "모르는 전략" 을 부드럽게 처리.

```python
# L98-L114
@classmethod
def build(cls, strategy_id, **params) -> Optional[StrategyDefinition]:
    strategy_cls = cls.get(strategy_id)
    if strategy_cls is None:
        return None
    strategy = strategy_cls(**params)
    return strategy.build()
```
- **"id로 바로 전략 정의 만들기"**: ① 명부에서 클래스를 꺼내(`get`) → ② `클래스(**params)` 로 인스턴스 생성(파라미터 주입) → ③ `.build()` 로 `StrategyDefinition` 반환.
- 모르는 id 면 `None`(예외 안 던짐). **여기 `build` 는 넘긴 params 를 그대로 생성자에 전달** — 아래 `build_with_params` 와의 차이를 주목.

```python
# L116-L130
@classmethod
def list_all(cls) -> List[Dict[str, Any]]:
    return list(cls._metadata.values())

@classmethod
def clear(cls) -> None:           # 테스트용 — 명부 비우기
    cls._strategies.clear(); cls._metadata.clear()

@classmethod
def list(cls) -> Dict[str, Type[BaseStrategy]]:   # backward compat
    return dict(cls._strategies)
```
- `list_all` — metadata 값들만 모아 목록으로(가벼운 카드용).
- `clear` — **테스트 격리용**. 테스트마다 명부를 비워 다른 테스트의 등록이 새지 않게.
- `list` — `_strategies` **사본**(`dict(...)`)을 반환. 사본인 이유: 받은 쪽이 실수로 원본 명부를 수정하지 못하게 보호.

### E. `build_with_params()` — 안전한 파라미터 빌드 — `L132-L169`

```python
# L154-L169
strategy_cls = cls.get(strategy_id)
if strategy_cls is None:
    return None

# PARAM_DEFINITIONS가 있으면 해당 파라미터만 전달
if hasattr(strategy_cls, 'PARAM_DEFINITIONS') and strategy_cls.PARAM_DEFINITIONS:
    valid_params = {}
    for name in strategy_cls.PARAM_DEFINITIONS:
        if name in param_overrides:
            valid_params[name] = param_overrides[name]
    strategy = strategy_cls(**valid_params)
else:
    strategy = strategy_cls(**param_overrides)   # 기존 방식 - 모든 파라미터 전달
return strategy.build()
```
- 위 `build` 와 무엇이 다른가: **들어온 파라미터를 `PARAM_DEFINITIONS` 로 거른다**. 정의에 없는 키(오타·잉여)는 버리고, **정의된 손잡이만** 생성자에 넘김.
- **왜?** 프론트에서 임의 키가 섞여 들어와도 `클래스(**모르는키)` 로 `TypeError` 나는 것을 방지. "화이트리스트 필터" 역할.
- `PARAM_DEFINITIONS` 가 없는(또는 빈) 구식 전략은 옛 방식대로 전부 전달 — **하위호환** 유지.

> 💡 정리: `build` = 날것 그대로 전달(내부/신뢰된 호출용), `build_with_params` = **외부 입력을 정의로 걸러서** 전달(프론트/API 용). 보안·견고성 관점에서 외부 입력엔 `build_with_params` 가 안전.

### F. 파라미터 정의·목록 조회 — `L171-L209`

```python
# L182-L190
strategy_cls = cls.get(strategy_id)
if strategy_cls is None:
    return {}
if hasattr(strategy_cls, 'PARAM_DEFINITIONS'):
    return strategy_cls.PARAM_DEFINITIONS
if hasattr(strategy_cls, 'get_param_definitions'):
    return strategy_cls.get_param_definitions()
return {}
```
- `get_param_definitions(id)` — 그 전략의 손잡이 명세를 반환. **두 단계 폴백**: ① 클래스에 `PARAM_DEFINITIONS` 속성이 있으면 그걸 → ② 없으면 `get_param_definitions()` **메서드**라도 있으면 그걸 → ③ 둘 다 없으면 빈 dict. 다양한 전략 작성 스타일을 모두 수용.

```python
# L192-L209
@classmethod
def list_all_with_params(cls) -> List[Dict[str, Any]]:
    result = []
    for strategy_id, meta in cls._metadata.items():
        params = cls.get_param_definitions(strategy_id)
        result.append({ **meta, "params": params })
    return result
```
- **프론트엔드 단골 호출**: "전략 목록(메타) + 각 전략의 파라미터 명세"를 한 번에. `{ **meta, "params": params }` = meta 의 모든 키를 펼치고 거기에 `params` 키를 추가한 새 dict.
- 화면은 이 한 번의 응답으로 "전략 카드 + 각 카드의 조절 슬라이더"를 전부 그릴 수 있음.

### G. 별칭/하위호환 — `L212-L216`

```python
# L212-L216
register = StrategyRegistry.register              # @register 짧게 쓰기
STRATEGY_REGISTRY = StrategyRegistry              # 옛 이름 호환
```
- `register` 를 모듈 레벨로 빼서 preset 들이 `from ...registry import register` 후 `@register(...)` 로 간결히 쓰게 함(sma_crossover.py 가 이걸 사용).
- `STRATEGY_REGISTRY` — 과거 코드가 이 대문자 이름을 참조했을 수 있어 클래스를 가리키는 별칭으로 남겨둠(깨지지 않게).

---

## 2. `base.py` — 모든 프리셋의 공통 부모(추상 규격)

### A. docstring + import — `L1-L14`

```python
# L1-L14 (발췌)
"""Base Strategy abstract class. All preset strategies inherit from this class."""
from abc import ABC, abstractmethod
from typing import Any, Dict, ClassVar
from kis_backtest.core.strategy import StrategyDefinition
from kis_backtest.core.condition import Condition, CompositeCondition
from kis_backtest.core.risk import RiskManagement
```
- `ABC, abstractmethod` — 추상 클래스 도구(사전지식 3). `ClassVar` — "이건 인스턴스가 아니라 **클래스 전체가 공유**하는 변수"라는 타입 표시(아래 `PARAM_DEFINITIONS`).
- import 한 `StrategyDefinition`/`Condition`/`RiskManagement` 는 자식이 만들어 돌려줄 **결과물의 타입**들 — core/ 패키지(전략의 내부 표현)와 연결.

### B. 클래스 docstring = "전략 작성 설명서" — `L17-L46`

```python
# L22-L46 (발췌)
class BaseStrategy(ABC):
    """...
    PARAM_DEFINITIONS 패턴:
        서브클래스에서 PARAM_DEFINITIONS를 정의하면, 해당 전략의 파라미터를
        프론트엔드에서 동적으로 조회/수정할 수 있습니다.
    ...
    """
```
- 이 docstring 자체가 **"새 전략 만드는 법" 미니 가이드**입니다. `PARAM_DEFINITIONS` 선언 → `__init__` 에 속성 저장 → `id`/`build` 구현 → `build()` 안에서 `params=self._build_params()` 사용, 의 흐름을 예시로 보여줌.

### C. `PARAM_DEFINITIONS` 규약 + `get_param_definitions` — `L48-L59`

```python
# L48-L59
PARAM_DEFINITIONS: ClassVar[Dict[str, Dict[str, Any]]] = {}

@classmethod
def get_param_definitions(cls) -> Dict[str, Dict[str, Any]]:
    return cls.PARAM_DEFINITIONS
```
- 부모는 **빈 `{}` 로 기본값**만 깔아둠. 자식이 채우면 그게 그 전략의 손잡이 명세. (registry 의 `get_param_definitions` 가 이 속성/메서드를 읽어감 — 두 파일이 이 규약으로 맞물림.)

### D. `_build_params()` — 인스턴스 현재값을 명세에 합치기 — `L61-L78`

```python
# L70-L78
result = {}
for name, definition in self.PARAM_DEFINITIONS.items():
    current_value = getattr(self, name, definition.get("default"))
    result[name] = { **definition, "default": current_value }
return result
```
- **핵심 트릭**: `PARAM_DEFINITIONS`(정적 명세: min/max/type/기본값) 를 베끼되, **`default` 만 "지금 이 인스턴스의 실제 값"으로 덮어씀**.
- `getattr(self, name, definition.get("default"))` = "인스턴스에 그 속성이 있으면 그 값을, 없으면 명세의 default 를". 예: 사용자가 `fast_period=10` 으로 만든 전략이면, 결과 params 의 `fast_period.default` 가 10 으로 바뀜.
- **왜?** `build()` 가 돌려주는 `StrategyDefinition.params` 에 "이 전략이 **실제로 어떤 값으로** 빌드됐는지 + UI 가 다시 그릴 수 있는 범위/타입"을 함께 담기 위해. 재현성 + 동적 UI 를 한 번에.

> 💡 vbt_engine 의 `params` 가 단순히 "쓴 값"만 기록했다면, 여기 `_build_params` 는 "쓴 값 + 손잡이 명세(범위·타입)"를 함께 기록 — 프론트가 그 값을 슬라이더로 되돌려 보여줄 수 있게 하는 게 차이.

### E. 추상 멤버들 = 자식이 반드시 구현 — `L80-L137`

```python
# L80-L116 (발췌)
@property
@abstractmethod
def id(self) -> str: ...          # 고유 식별자
@property
@abstractmethod
def name(self) -> str: ...        # 표시 이름
@property
@abstractmethod
def category(self) -> str: ...    # 카테고리

@property
def description(self) -> str:     # ← 추상 아님! 기본 ""
    return ""

@abstractmethod
def indicators(self) -> list: ...        # 사용 지표 목록
@abstractmethod
def entry_condition(self) -> Condition: ...  # 진입 조건
@abstractmethod
def exit_condition(self) -> Condition: ...   # 청산 조건
```
- `@property + @abstractmethod` = "자식은 이걸 **속성처럼 접근되는 형태로 반드시 구현**". 안 하면 그 자식 클래스는 인스턴스화 자체가 막힘(에러).
- `description` 은 **추상이 아니라 기본 `""`** → 구현은 선택(원하면 자식이 오버라이드). 이 "필수 vs 선택"의 구분이 인터페이스 설계의 핵심.
- `entry_condition`/`exit_condition` 의 반환 타입 `Condition` — core/condition 의 비교식 객체(예: `SMA(5).crosses_above(SMA(20))`). 즉 전략은 "신호 값"이 아니라 **"규칙 객체"**를 돌려준다(vbt_engine 의 boolean Series 방식과 대비 — 00_overview §핵심개념 1).

```python
# L118-L132
def risk_management(self) -> RiskManagement:     # 선택(기본 빈 RiskManagement)
    return RiskManagement()

def get_custom_lean_code(self) -> str | None:    # 선택(기본 None)
    ...
    return None
```
- `risk_management` — 손절·익절 등. 기본은 빈 설정(없음). 자식이 오버라이드(sma_crossover 는 stop/take_profit 설정).
- `get_custom_lean_code` — **탈출구(escape hatch)**. "n일 연속 상승 카운터", "보유일 추적"처럼 **지표로는 표현 못 하는 로직**이 필요한 전략이 OnData 에 직접 끼워 넣을 파이썬 코드를 반환. 기본 None(없음). codegen 이 이 코드를 받아 삽입.

```python
# L134-L141
@abstractmethod
def build(self) -> StrategyDefinition:
    """전략 정의 빌드"""

def to_dict(self) -> Dict[str, Any]:
    return self.build().to_dict()
```
- `build()` — **모든 조각(id·지표·진입/청산·리스크·params)을 모아 표준 `StrategyDefinition` 으로 조립**하는 마무리(자식 필수 구현). registry 의 `build`/`build_with_params` 가 결국 이걸 호출.
- `to_dict()` — build 결과를 dict 로(JSON 직렬화용 편의).

> 🔎 실제 자식 예(`sma_crossover.py`): `PARAM_DEFINITIONS` 4개 정의 → `__init__` 에 저장 → `indicators()` 가 `[SMA(fast), SMA(slow)]` → `entry_condition()` 이 `fast.crosses_above(slow)` → `build()` 가 이 모두를 `StrategyDefinition(...)` 로 묶고 `params=self._build_params()`. **base 의 규격을 그대로 채운 모범 답안**.

---

## 3. `generator.py` — 하위호환 래퍼(옛 API → 새 codegen)

### A. docstring + import — `L1-L18`

```python
# L1-L18 (발췌)
"""Strategy Generator - Compatibility Layer.
Provides backward-compatible generate_strategy() and StrategyGenerator.
Internally uses LeanCodeGenerator for actual code generation."""
from kis_backtest.strategies.registry import StrategyRegistry
from kis_backtest.codegen.generator import LeanCodeGenerator, CodeGenConfig
from kis_backtest.core.schema import StrategySchema
from kis_backtest.core.converters import from_preset
```
- **정체가 docstring 에 박혀 있음**: 이 파일은 **"호환 계층(Compatibility Layer)"**. 옛 코드가 `generate_strategy(...)`/`StrategyGenerator` 를 부르면, **속은 새 `LeanCodeGenerator` 에 위임**. 즉 겉모양만 옛것, 실제 일은 새 엔진이.
- 의존 4개가 곧 처리 흐름: `StrategyRegistry`(전략 꺼내기) → `from_preset`(스키마로 변환) → `LeanCodeGenerator`+`CodeGenConfig`(코드 생성).

> ⚠️ `00_overview.md` 분류상 이 파일은 strategies/ 의 일부이지만 역할은 **"옛 진입점 유지용 어댑터"**. 우리 `runner.py` 는 codegen 을 직접 부르므로(00_overview §5) 이 래퍼는 **호환 보존용**으로 이해하면 됩니다.

### B. `StrategyGenerator.__init__` — 입력 모으기 — `L36-L58`

```python
# L36-L58 (발췌)
def __init__(self, strategy_id, symbols, start_date, end_date, *,
             initial_capital=100_000_000, market_type="krx",
             params=None, risk_config=None):
    self.strategy_id = strategy_id
    ...
    self.params = params or {}
    self.risk_config = risk_config
    self._schema = self._build_schema()   # ← 생성과 동시에 스키마 빌드
```
- 백테스트 한 건에 필요한 입력을 통째로 받음: **전략 id · 종목들 · 기간 · 자본금 · 시장(krx/us) · 파라미터**.
- `initial_capital=100_000_000` — 기본 1억(한국 시장 기준). `market_type="krx"` 기본.
- `*` 뒤는 키워드 전용 → `StrategyGenerator("sma_crossover", [...], "...", "...", initial_capital=...)`.
- 생성자 끝에서 **곧바로 `_build_schema()` 호출** → 객체가 만들어지는 순간 스키마까지 준비.

### C. `_build_schema()` — id를 스키마로 — `L60-L76`

```python
# L60-L76
strategy_cls = StrategyRegistry.get(self.strategy_id)
if strategy_cls is None:
    raise ValueError(f"Unknown strategy: {self.strategy_id}")
strategy_instance = strategy_cls(**self.params)        # 파라미터로 인스턴스
schema = from_preset(strategy_instance)                # BaseStrategy → StrategySchema
if schema is None:
    raise ValueError(f"Failed to create schema for strategy: {self.strategy_id}")
return schema
```
- **registry ↔ base ↔ core 가 만나는 지점**: ① 레지스트리에서 클래스 조회 → ② params 로 인스턴스화 → ③ `from_preset(인스턴스)` 가 `BaseStrategy` 를 **`StrategySchema`(Single Source of Truth, 00_overview §핵심개념 2)** 로 변환.
- 모르는 id / 변환 실패 시 **친절한 `ValueError`** (registry 의 None 반환과 달리 여기선 즉시 에러로 알림 — "코드 생성"은 실패하면 바로 멈춰야 하므로).
- 주의: 여기 인스턴스화는 registry 의 `build`처럼 `**self.params` 를 **그대로** 전달(필터링 없음). 신뢰된 호출 가정.

### D. `generate()` — 스키마 → Lean 코드 — `L78-L96`

```python
# L78-L91
config = CodeGenConfig(market=self.market_type, initial_capital=self.initial_capital)
generator = LeanCodeGenerator(self._schema, config=config)
return generator.generate(symbols=self.symbols, start_date=self.start_date, end_date=self.end_date)
```
- **실제 코드 생성은 단 3줄, 전부 `LeanCodeGenerator` 에 위임**. 이 래퍼가 하는 일은 "옛 인자들을 모아 새 generator 에 맞게 넘겨주는 통역"뿐.
- `CodeGenConfig` 로 시장·자본금을 설정 → `generate(...)` 가 Lean(QCAlgorithm) **파이썬 소스 문자열**을 반환.
- `@property schema`(L93-96) — 만들어진 스키마를 밖에서 확인용으로 노출.

### E. 편의 함수 `generate_strategy()` — `L99-L142`

```python
# L132-L142
generator = StrategyGenerator(strategy_id=strategy_id, symbols=symbols,
    start_date=start_date, end_date=end_date,
    initial_capital=initial_capital, market_type=market_type, params=params)
return generator.generate()
```
- 클래스를 직접 만들 필요 없이 **함수 한 방**으로 코드 생성하는 단축 경로. 내부에서 `StrategyGenerator` 를 만들고 `.generate()` 호출이 전부.
- docstring 예시처럼 `generate_strategy("sma_crossover", ["005930"], "2024-01-01", "2024-12-31", params={...})` 형태로 호출.

> 💡 이 파일 한 줄 요약: **"입력을 모아 registry→from_preset→LeanCodeGenerator 로 흘려보내는 얇은 통로"**. 새 로직은 없고 전부 위임 — 그래서 "Compatibility Layer".

---

## 4. `risk/position_sizer.py` — 사이징 방법 → Lean 코드 생성

### A. `SizingMethod` Enum — `L1-L16`

```python
# L10-L16
class SizingMethod(str, Enum):
    EQUAL_WEIGHT = "equal_weight"            # 동일 비중
    ATR_BASED = "atr_based"                  # ATR 기반 변동성 조절
    KELLY = "kelly"                          # 켈리 공식
    INVERSE_VOLATILITY = "inverse_volatility"# 변동성 역비례
    FIXED_FRACTION = "fixed_fraction"        # 고정 비율
```
- `str, Enum` 다중상속 = **문자열이면서 동시에 enum**. `SizingMethod.KELLY == "kelly"` 가 True → 직렬화·비교가 편함.
- 5가지 사이징 철학:
  - **EQUAL_WEIGHT**: 종목 수로 1을 나눠 똑같이(`1/N`). 가장 단순.
  - **ATR_BASED**: 변동성(ATR)이 큰 종목은 적게 사서 **거래당 리스크를 일정하게**.
  - **KELLY**: 승률·손익비로 "이론상 최적 비중" 계산(켈리 공식).
  - **INVERSE_VOLATILITY**: 변동성에 **반비례**해 비중 배분(잔잔한 종목 많이, 출렁이는 종목 적게).
  - **FIXED_FRACTION**: 무조건 자본의 고정 N%.

### B. `PositionSizer.__init__` — `L19-L38`

```python
# L32-L38
def __init__(self, method=SizingMethod.EQUAL_WEIGHT, params=None):
    self.method = method
    self.params = params or {}
```
- 기본은 EQUAL_WEIGHT. `params` 는 방법별 세부값(리스크%·ATR배수·lookback 등)을 담는 딕셔너리(`None → {}` 폴백).
- 핵심: 이 클래스는 **숫자를 계산하지 않습니다**. 세 메서드(`generate_init`/`generate_sizing`/`generate_update`)가 **Lean 에 삽입될 파이썬 코드 문자열**을 만들어 돌려줄 뿐(사전지식 5).

### C. `generate_init()` — Initialize() 삽입 코드 — `L40-L71`

```python
# L45-L53 (ATR 예)
elif self.method == SizingMethod.ATR_BASED:
    return """
        # ATR 기반 포지션 사이징
        self.atr_indicators = {}
        for symbol in self.symbols:
            atr = AverageTrueRange(14, MovingAverageType.Simple)
            self.RegisterIndicator(symbol, atr, Resolution.Daily)
            self.atr_indicators[symbol] = atr
"""
```
- 방법마다 **"전략 시작 시 1회 준비"** 코드를 다르게 반환. ATR 은 종목별 ATR 지표를 등록, INVERSE_VOLATILITY 는 종목별 20개짜리 `RollingWindow`(최근 가격 보관) 준비, FIXED_FRACTION 은 `self.fixed_fraction = {fraction}` 한 줄.
- `EQUAL_WEIGHT`/`KELLY` 는 빈 문자열 반환(초기화 불필요).
- `fraction = self.params.get("fraction", 0.1)` — params 에 없으면 **기본 10%**. f-string 으로 그 숫자를 코드 문자열에 박아 넣음.

> ⚠️ 들여쓰기 주의: 반환 문자열의 `        #`(공백 8칸) 들여쓰기는 **Lean 의 `Initialize()` 메서드 본문에 그대로 붙여 넣기 위한 것**. 이 코어가 "완성된 코드 조각"을 만들어 codegen 이 조립하는 구조라, 들여쓰기까지 맞춰져 있음.

### D. `generate_sizing()` — weight 계산 코드 — `L73-L137` (알맹이)

```python
# L75-L76 (EQUAL_WEIGHT)
if self.method == SizingMethod.EQUAL_WEIGHT:
    return "weight = 1.0 / len(self.symbols)"
```
- 모든 분기가 결국 **`weight`(0~1, 그 종목에 넣을 자본 비율)를 정하는 코드**를 반환. EQUAL_WEIGHT 는 종목 수로 1을 나눔.

```python
# L81-L93 (ATR_BASED — 공식이 코드로)
risk_amount = self.Portfolio.TotalPortfolioValue * {risk_per_trade}   # 리스크 금액 = 자본 × 거래당리스크
per_share_risk = atr.Current.Value * {atr_mult}                       # 1주당 리스크 = ATR × 배수
target_shares = int(risk_amount / per_share_risk)                     # 수량 = 리스크금액 / 1주당리스크
weight = (target_shares * price) / self.Portfolio.TotalPortfolioValue
weight = min(weight, 1.0 / len(self.symbols))                        # 동일비중 상한
```
- **ATR 사이징 공식(외울 가치 있음)**: "한 번 거래에 자본의 `risk_per_trade`(기본 2%)만 잃겠다"를 전제로, **변동성(ATR)이 클수록 수량을 줄여** 손실 한도를 일정하게 맞춤.
  - 리스크 금액 = 총자본 × 2% → 이 종목에서 잃을 수 있는 최대 금액.
  - 1주당 리스크 = ATR × 2배 → 한 주가 출렁일 수 있는 폭.
  - 수량 = 리스크금액 ÷ 1주당리스크 → "그 손실 한도 안에서 몇 주 살 수 있나".
  - `min(weight, 1/N)` — 한 종목이 너무 커지지 않게 **동일비중을 상한**으로.
  - 지표 미준비(`atr.IsReady`가 False)면 안전하게 `1/N` 폴백.

```python
# L96-L121 (INVERSE_VOLATILITY — 변동성 역비례, 요지)
volatility = std / mean                       # 이 종목의 변동성 비율
inv_vol_sum = Σ 1/(다른 종목 변동성+0.001)     # 모든 종목 역변동성 합
weight = (1/(volatility+0.001)) / max(inv_vol_sum, 1)
```
- **역변동성 배분**: 각 종목 가중치 = (자기 역변동성) ÷ (전체 역변동성 합). **잔잔한 종목일수록 큰 비중**. `+0.001` 은 변동성 0일 때 0으로 나누기 방지(epsilon). lookback(기본 20) 만큼 데이터가 쌓이기 전엔 `1/N` 폴백.

```python
# L123-L131 (KELLY — 단순화)
win_rate = 0.5          # 예상 승률 (하드코딩)
win_loss_ratio = 1.5    # 예상 손익비 (하드코딩)
kelly_fraction = win_rate - (1 - win_rate) / win_loss_ratio
kelly_fraction = max(0, min(kelly_fraction, 0.25))   # 0~25% 제한
weight = kelly_fraction
```
- 켈리 공식 `f = p - (1-p)/b`. **단, 승률·손익비가 하드코딩(0.5·1.5)** → 진짜 켈리가 아니라 "데모/플레이스홀더". 주석도 "실제 구현 시 과거 거래 데이터 필요" 라고 명시. **함정 주의**(아래 ⚠️).
- `max(0, min(..., 0.25))` — 음수면 0(투자 안 함), 25% 초과면 25% 로 잘라 **과도한 베팅 방지**.

```python
# L133-L137
elif self.method == SizingMethod.FIXED_FRACTION:
    return "weight = self.fixed_fraction"
else:
    return "weight = 1.0 / len(self.symbols)"     # 알 수 없는 방법 → 동일비중 폴백
```
- FIXED_FRACTION 은 init 에서 박아둔 고정값 사용. 마지막 `else` — 모르는 방법이면 **안전하게 동일비중**(에러 대신 폴백).

### E. `generate_update()` — OnData() 삽입 코드 — `L139-L143`

```python
# L139-L143
def generate_update(self) -> str:
    if self.method == SizingMethod.INVERSE_VOLATILITY:
        return "            self.volatility_windows[symbol].Add(price)"
    return ""
```
- **매 봉마다** 실행될 코드. INVERSE_VOLATILITY 만 "최근 가격을 RollingWindow 에 계속 추가"가 필요(변동성을 굴러가며 계산하려면 가격을 쌓아야 함). 나머지는 빈 문자열(업데이트 불필요).
- 들여쓰기 12칸은 OnData 의 종목 루프 안쪽에 들어갈 위치 기준.

> 🧩 세 메서드의 분업: `generate_init`(시작 1회 준비) → `generate_update`(매 봉 데이터 적재) → `generate_sizing`(매수 시 weight 계산). codegen 이 이 셋을 Lean 코드의 알맞은 위치(Initialize/OnData/주문직전)에 끼워 넣습니다.

---

## ⚠️ 함정·주의 (코드에 박힌 교훈)

1. **KELLY 는 가짜값**(`position_sizer.py:127-128`): `win_rate=0.5`, `win_loss_ratio=1.5` **하드코딩**. 실전에서 그대로 쓰면 근거 없는 비중. 반드시 과거 거래 통계로 교체해야 함(주석도 경고).
2. **`build` vs `build_with_params`**(`registry.py`): 외부/프론트 입력은 임의 키가 섞일 수 있으니 **`build_with_params`(정의로 필터링)** 를 써야 안전. `build`·`StrategyGenerator` 는 params 를 **그대로** 생성자에 넘김 → 모르는 키면 `TypeError`.
3. **추상 멤버 미구현 = 인스턴스화 불가**(`base.py`): 자식이 `@abstractmethod`(id/name/category/indicators/entry/exit/build) 중 하나라도 빠뜨리면 그 전략은 **만들 수조차 없음**(import 시점 아님, 생성 시점 에러). `description`·`risk_management`·`get_custom_lean_code` 는 선택.
4. **등록은 import 의 부작용**(`registry.py`+`preset/__init__.py`): 전략은 **모듈이 import 돼야** 명부에 들어옴. `import ...preset` 을 빠뜨리면 `registry.get(id)` 가 `None` → "Unknown strategy". (그래서 `runner.py` 가 `import ...preset` 을 먼저 함.)
5. **`PositionSizer` 는 코드 문자열 생성기**: 직접 weight 를 계산하지 않음. 반환값은 **Lean 에 삽입될 코드**라 들여쓰기·`self.` 컨텍스트가 Lean 알고리즘 본문에 맞춰져 있음. 단독 실행/검증이 어려운 이유(실행은 Lean 안에서).
6. **`_build_params` 의 default 덮어쓰기**(`base.py:73`): `getattr(self, name, ...)` 라서 **`__init__` 에서 그 이름의 속성을 저장하지 않으면** 명세의 default 가 그대로 남음. PARAM_DEFINITIONS 의 키 이름과 인스턴스 속성 이름이 **반드시 일치**해야 사용자가 바꾼 값이 반영됨.
7. **`get_param_definitions` 의 이중 폴백**(`registry.py:186-190`): 속성 `PARAM_DEFINITIONS` → 메서드 `get_param_definitions()` → `{}` 순. 둘 다 없는 전략은 프론트에 손잡이가 안 보임(빈 dict). 새 전략은 `PARAM_DEFINITIONS` 를 꼭 정의할 것.

---

## 🚀 고도화 (강의·개선 버전용)

- **진짜 KELLY 연결**: 하드코딩된 승률·손익비를 백테스트/워크포워드(`04_robust/walkforward.md`) 결과의 실제 승률·평균손익비로 주입 → 데이터 기반 켈리. 부분켈리(½ 켈리)로 과배팅 완화.
- **사이징 방법 추가**: `SizingMethod` 에 enum 한 줄 + 세 `generate_*` 메서드에 `elif` 블록 하나면 끝(예: "위험균등(Risk Parity)", "타깃 변동성"). vbt_engine 고도화의 "포지션 사이징"을 Lean 쪽에서 확장하는 자리.
- **사이징 ↔ 전략 결합**: 지금은 사이징이 codegen 전역 옵션. `BaseStrategy` 에 `position_sizing()` 훅을 추가해 **전략별 권장 사이징**을 선언하게 하면(예: 추세전략=고정비율, 멀티에셋=역변동성) 더 자연스러움.
- **레지스트리 검증 강화**: `register` 시 같은 id 중복 등록을 경고/거부, `PARAM_DEFINITIONS` 의 min≤default≤max 정합성 자동 점검(잘못된 명세를 등록 시점에 차단).
- **카테고리/태그 검색 API**: `list_all_with_params` 를 `category`·`tags` 로 필터링하는 메서드 추가 → 프론트의 "추세/모멘텀/변동성" 탭 필터를 서버가 직접 지원.
- **`get_custom_lean_code` 활용 사례 문서화**: 연속 상승 카운터·보유일 추적처럼 "지표로 표현 불가한 로직"의 모범 패턴을 모아 강의용 예제로.

---

## 📚 용어 사전 (이 4파일 한정)

| 용어 | 뜻 |
|---|---|
| **레지스트리(Registry)** | id→객체(여기선 클래스)를 모아두는 중앙 명부. `@register` 로 자동 등록 |
| **데코레이터 `@register`** | 클래스 정의와 동시에 명부에 꽂는 문법. 인자가 있어 "함수를 돌려주는 함수"(2단) 구조 |
| **side-effect 등록** | `import` 하는 것만으로 명부에 들어가는 효과. `import ...preset` 한 줄로 10종 등록 |
| **ABC / `@abstractmethod`** | 추상 베이스 클래스. 추상 메서드를 자식이 구현 안 하면 인스턴스화 불가 |
| **`PARAM_DEFINITIONS`** | 전략 파라미터의 기본값·min·max·type·설명 명세. 프론트가 UI 를 동적 생성 |
| **`_build_params()`** | PARAM_DEFINITIONS 명세에 "현재 인스턴스의 실제 값"을 default 로 덮어써 반환 |
| **`StrategyDefinition`** | `build()` 결과. 전략 한 개의 표준(불변) 정의(core/strategy) |
| **`StrategySchema`** | 모든 입력을 모아 검증한 Pydantic 표준(Single Source of Truth, core/schema) |
| **`from_preset`** | `BaseStrategy` 인스턴스 → `StrategySchema` 변환(core/converters) |
| **Compatibility Layer** | 옛 API 모양을 유지하되 속은 새 엔진(LeanCodeGenerator)에 위임하는 래퍼 |
| **`Condition`** | `SMA(5).crosses_above(SMA(20))` 같은 "규칙"을 담은 객체(core/condition) |
| **`build` vs `build_with_params`** | 전자는 params 그대로 전달, 후자는 PARAM_DEFINITIONS 로 걸러 전달(외부 입력용) |
| **포지션 사이징** | 한 번에 자본의 몇 %를 투입할지 결정(동일/ATR/켈리/역변동성/고정) |
| **ATR(Average True Range)** | 변동성 지표. ATR 기반 사이징은 ATR 클수록 수량을 줄여 리스크 일정화 |
| **켈리 공식** | `f = p - (1-p)/b`(p=승률, b=손익비)로 최적 베팅 비율 산출 |
| **`generate_init/sizing/update`** | 각각 Initialize·매수직전·OnData 에 삽입될 Lean 코드 문자열을 생성 |
| **`get_custom_lean_code`** | 지표로 표현 못 하는 로직(연속카운터 등)을 OnData 에 끼워 넣는 탈출구 |
| **`StrategyRegistry.clear`** | 명부 비우기(테스트 격리용) |
