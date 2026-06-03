# `dsl/builder.py` + `dsl/__init__.py` — 전략을 "조립"하는 빌더 (완전 라인별 해설)

> 원본: `analytics/app/lean/kis_backtest/dsl/builder.py` (332줄) · `analytics/app/lean/kis_backtest/dsl/__init__.py` (283줄)
> 형식 기준: 모범 [`01_backtest/vbt_engine.md`](../01_backtest/vbt_engine.md) · [`README.md`](../README.md) "3. 공통 형식" · 벤더 개요 [`00_overview.md`](00_overview.md)
> 분류: 🟡 **간접 사용** — preset/codegen 이 내부적으로 의존. 우리(Alpha-Helix)가 `RuleBuilder` 를 직접 호출하진 않지만, "전략을 코드 없이 선언"하는 입구이자 미래 "자연어→전략" 경로의 자리.

---

## 📌 이 파일 한눈에

이 두 파일은 **"전략 조립 키트"** 입니다. 레고 설명서를 떠올리세요 — 블록(`SMA(5)`, `RSI(14)` 같은 지표)을 끼우고, "이 모양이 되면 사라/팔아라"는 규칙을 끼우고, 손절·익절 안전핀을 끼운 뒤, **마지막에 `build()` 버튼을 누르면 완성된 전략 정의가 툭 나옵니다.**

- **`builder.py`** = 조립 작업대. `RuleBuilder` 클래스가 `.buy_when(...).sell_when(...).stop_loss(...).build()` 처럼 **메서드를 줄줄이 이어 호출(체이닝)** 하게 해주고, 누른 버튼들을 모아 `StrategyRule` → `StrategyDefinition`(표준 전략 정의)으로 변환합니다.
- **`__init__.py`** = 키트 포장 상자. "이 키트를 열면 무슨 부품이 들어 있나"를 한 줄로 보여주는 **공개 목록**. `from kis_backtest.dsl import RuleBuilder, SMA, RSI` 한 줄이면 빌더와 약 80종 지표 팩토리·19종 캔들 패턴을 전부 꺼내 쓸 수 있게 re-export 합니다.

| 클래스 / 함수 | 한 줄 역할 | 비유 |
|---|---|---|
| `RuleBuilder` (클래스) | 체이닝으로 전략 부품을 모으는 **작업대** | 레고 조립판 |
| `.buy_when()` / `.sell_when()` | 매수/매도 조건 끼우기 + 쓰인 지표 자동 수집 | "이 모양이면 사라" 블록 |
| `.stop_loss()` / `.take_profit()` / `.trailing_stop()` / `.max_position()` | 리스크 안전핀 끼우기 | 비상 정지 장치 |
| `.build()` | 모은 부품 검증 후 `StrategyRule` 출력 | "완성" 버튼 |
| `StrategyRule` (dataclass) | 빌드된 최종 규칙 묶음 + **표준 정의로 변환기** | 완성된 레고 + 설명 카드 |
| `.to_strategy_definition()` | `StrategyRule` → `StrategyDefinition`(라이브러리 공통 언어) | 우리 키트 → 공장 표준 도면 |
| `dsl/__init__.py` | `RuleBuilder`·지표 팩토리 80종·캔들 19종을 한 곳에서 import 가능하게 re-export | 키트 부품 목록표 |

**누가 호출하나?** → 개요([00_overview.md](00_overview.md))의 분류대로 우리 `runner.py` 는 `RuleBuilder` 를 **직접 부르지 않습니다.** 대신 ① `dsl/helpers.py` 의 지표 팩토리(`SMA`·`RSI`…)는 `strategies/preset/` 전략들이 조건을 만들 때 쓰고, ② `RuleBuilder` 자체는 "코드 없이 규칙으로 전략을 만드는" 대안 입구로 존재합니다. 즉 이 파일은 **"전략을 사람이 손으로 조립하는 가장 친절한 길"** 입니다.

**왜 빌더 패턴인가?** → 전략 하나에 들어가는 정보가 많습니다(이름·설명·카테고리·매수조건·매도조건·지표목록·손절·익절·…). 이걸 생성자 하나에 인자 10개로 넘기면 헷갈리고 순서를 틀립니다. 빌더 패턴은 **"한 번에 하나씩, 이름 붙여, 원하는 것만"** 끼우게 해 줍니다. (비유: 햄버거를 "패티1·치즈2·양상추·소스" 라고 인자로 외치는 대신, 토핑을 하나씩 얹다가 "완성" 외치기.)

---

## 🧠 사전 지식 (이거 모르면 막힘)

#### 1) 빌더 패턴 = "부품을 하나씩 모았다가 마지막에 완성품을 뱉는" 설계
- 객체를 **단계적으로** 구성합니다. 중간 단계에서는 아직 미완성(빌더 내부에 값만 쌓임), 마지막 `build()` 에서 검증하고 완성품을 만듭니다.
- 장점: 필수/선택 항목을 구분하고, 빠진 게 있으면 `build()` 가 친절히 에러를 냅니다(아래 L284-287).

#### 2) 메서드 체이닝(Fluent API) = `.a().b().c()` 처럼 점으로 잇기
- 비결은 **각 메서드가 자기 자신(`self`)을 반환**하는 것. `buy_when()` 이 끝나면 또 `RuleBuilder` 가 손에 남아 바로 `.sell_when()` 을 이어 부를 수 있습니다.
- 그래서 이 파일의 거의 모든 메서드 반환타입이 `-> RuleBuilder` 이고 마지막 줄이 `return self` 입니다.

#### 3) DSL → "정의 객체" 변환 = 사람이 쓴 규칙을 기계가 읽는 표준 데이터로
- 우리가 쓰는 `SMA(5) > SMA(20)` 은 그냥 파이썬 식처럼 보이지만, **연산자 오버로딩**(`core/condition.py`·`core/indicator.py`) 덕분에 실제로는 `Condition("greater_than", SMA(5), SMA(20))` 라는 **객체**가 만들어집니다.
- 빌더는 이 조건 객체들을 모아, 최종적으로 `StrategyDefinition`(불변 dataclass, `core/strategy.py`)의 `entry`/`exit`/`indicators`/`risk_management` **딕셔너리 형태**로 풀어냅니다. 이 정의가 곧 codegen 의 입력이 됩니다(개요 data flow 참고).

#### 4) `@dataclass` = 값 묶음 클래스를 짧게 만드는 도구
- `StrategyRule` 은 `@dataclass`. `name`·`entry_condition`·… 필드만 적으면 생성자·필드 저장이 자동. (vbt_engine 의 `BacktestParams` 와 같은 도구.)

#### 5) `isinstance(x, T)` = "x 가 T 타입이냐?" 검사
- 빌더가 조건 트리를 훑을 때, 노드가 단일 `Condition` 인지 복합 `CompositeCondition` 인지, 피연산자가 `Indicator` 인지를 `isinstance` 로 구분해 분기합니다(L78, L304-309).

#### 6) re-export = "import 를 대신 모아 다시 내보내기"
- `__init__.py` 가 여러 하위 모듈의 심볼을 import 한 뒤 `__all__` 에 적어두면, 사용자는 깊은 경로(`kis_backtest.dsl.helpers.SMA`)를 몰라도 `from kis_backtest.dsl import SMA` 한 줄로 씁니다. (패키지의 "정문" 역할.)

---

## 🗺 전체 흐름도

```
사용자 코드 (DSL)
  RuleBuilder("골든크로스")
    .buy_when( SMA(5) > SMA(20) )       ← 연산자 오버로딩으로 Condition 객체 생성
    .sell_when( SMA(5) < SMA(20) )
    .stop_loss(5.0).take_profit(10.0)
    .build()
        │
        ▼
┌─────────────────────────── RuleBuilder (작업대) ───────────────────────────┐
│  내부 상태에 차곡차곡 저장:                                                  │
│   _entry_condition / _exit_condition  ← buy_when / sell_when               │
│   _indicators  ← _collect_indicators() 가 조건 트리를 재귀로 훑어 지표 수집  │
│   _risk(RiskManagement)  ← stop_loss / take_profit / trailing / max_position│
│   _description / _category                                                  │
│                                                                            │
│  build(): 필수조건(매수·매도) 검증 → 중복지표 제거 → StrategyRule 생성        │
└────────────────────────────────────────────────────────────────────────────┘
        │  StrategyRule (완성 규칙 묶음)
        ▼
  StrategyRule.to_strategy_definition()
        │   _generate_id()            : 이름 → 소문자 snake_case id
        │   _condition_to_entry/exit(): Condition/Composite → {logic, conditions[...]}
        │   indicators → [ind.to_dict() ...]
        │   risk → risk_management.to_dict()
        ▼
  StrategyDefinition  (core/strategy.py · 불변 표준 정의)
        │  to_dict()
        ▼
  → core/converters.from_definition → core/schema.StrategySchema  (개요의 공통 표준)
        ▼
  → codegen/generator → Lean Python 코드 → 백테스트
```

> 포인트: 빌더는 **백테스트를 직접 돌리지 않습니다.** "전략을 표준 정의로 만드는" 데까지만 책임지고, 그 뒤(schema → codegen → lean)는 개요([00_overview.md](00_overview.md))의 data flow 가 이어받습니다.

---

## 📖 라인별 해설

> 표기: 원본 줄은 `builder.py:줄번호`. `# L30-L50` 처럼 인용 위에 범위를 적습니다.
> 아래는 **두 파일의 모든 클래스/함수**를 빠짐없이 다룹니다.

---

### A. `builder.py` 파일 설명서 + import — `L1-L27`

```python
# L1-L17 (docstring 요약)
"""Rule Builder - Fluent API for strategy creation.

Provides method chaining interface for building strategies without code.

Example:
    from kis_backtest.dsl import RuleBuilder, SMA, RSI

    strategy = (
        RuleBuilder("골든크로스_RSI필터")
        .description("SMA 골든크로스 + RSI 과매도 필터")
        .buy_when((SMA(5) > SMA(20)) & (RSI(14) < 70))
        .sell_when((SMA(5) < SMA(20)) | (RSI(14) > 80))
        .stop_loss(5.0)
        .take_profit(10.0)
        .build()
    )
"""
```
- 파일 맨 위 **설명서(docstring)** — 실행되지 않고 사람이 읽는 용도. "코드 없이(without code) 전략을 만든다"가 이 파일의 한 줄 정체성.
- 예시가 곧 **사용법 전부**입니다: `RuleBuilder("이름")` 로 시작 → 점(`.`)으로 메서드를 이어 → 마지막 `.build()` 로 마무리. 괄호로 감싼 건 줄바꿈을 위해(파이썬에서 괄호 안은 여러 줄 가능).
- `(SMA(5) > SMA(20)) & (RSI(14) < 70)` — `>` 와 `&` 가 숫자 연산이 아니라 **조건 객체를 만드는 연산자**(사전지식 3). 여기서 빌더로 들어가는 인자가 바로 `Condition`/`CompositeCondition` 객체.

```python
# L19-L27
from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict, List, Optional, Union

from kis_backtest.core.indicator import Indicator
from kis_backtest.core.condition import Condition, CompositeCondition
from kis_backtest.core.risk import RiskManagement
from kis_backtest.core.strategy import StrategyDefinition
```
- `from __future__ import annotations` — 타입힌트를 문자열처럼 늦게 평가. 덕분에 메서드가 아직 정의가 안 끝난 `RuleBuilder` 를 반환타입으로 쓸 수 있습니다(`-> RuleBuilder`). **체이닝을 타입힌트로 표현하려고** 꼭 필요한 줄.
- 마지막 4개 import 가 이 파일의 **재료**: `Indicator`(지표 객체), `Condition`/`CompositeCondition`(조건 객체), `RiskManagement`(리스크 설정), `StrategyDefinition`(최종 표준 정의). 즉 빌더는 **`core/` 의 부품들을 조립해 `StrategyDefinition` 을 만든다** — 이 4줄이 그 의존관계를 그대로 보여줍니다.

---

### B. `StrategyRule` — 빌드 결과물(완성 규칙) — `L30-L113`

#### B-1. 클래스 선언과 필드 — `L30-L50`

```python
# L30-L50
@dataclass
class StrategyRule:
    """빌드된 전략 규칙 ..."""
    name: str
    entry_condition: Union[Condition, CompositeCondition]
    exit_condition: Union[Condition, CompositeCondition]
    indicators: List[Indicator]
    risk_management: RiskManagement
    description: str = ""
    category: str = "custom"
```
- `@dataclass` 덕분에 이 7개 필드만 적으면 생성자·저장이 자동(사전지식 4).
- 이게 `RuleBuilder.build()` 가 뱉는 **완성품**입니다. 아직 `StrategyDefinition`(라이브러리 표준)은 아니고, "사람 친화 객체(조건 객체·지표 객체 그대로 보유)" 단계. 다음 메서드들이 이걸 표준으로 변환합니다.
- `description=""`·`category="custom"` 은 기본값 — 안 적어도 됩니다. 나머지 5개는 필수(build 가 채워줌).

#### B-2. `to_strategy_definition()` — 핵심 변환기 — `L52-L65`

```python
# L52-L65
def to_strategy_definition(self) -> StrategyDefinition:
    """StrategyDefinition으로 변환"""
    return StrategyDefinition(
        id=self._generate_id(),
        name=self.name,
        description=self.description or f"RuleBuilder로 생성된 전략: {self.name}",
        category=self.category,
        indicators=[ind.to_dict() for ind in self.indicators],
        entry=self._condition_to_entry(self.entry_condition),
        exit=self._condition_to_exit(self.exit_condition),
        params={},
        validation=[],
        risk_management=self.risk_management.to_dict(),
    )
```
- **이 메서드가 builder → core 의 다리입니다.** "사람 친화 규칙(`StrategyRule`)"을 "라이브러리 공통 언어(`StrategyDefinition`)"로 번역.
- 한 줄씩:
  - `id=self._generate_id()` — 이름에서 자동 생성(아래 B-4).
  - `description=self.description or f"..."` — 설명을 안 줬으면(`""`은 거짓) 자동 문구로 채움. `A or B` = "A 가 비었으면 B".
  - `indicators=[ind.to_dict() for ind in self.indicators]` — 지표 객체들을 **각각 dict 로** 풀어 리스트로. `Indicator.to_dict()` 는 `{"id","alias","params","output"}` 를 반환(core/indicator.py L107-114). 즉 "지표 객체 → 선언적 dict".
  - `entry=`/`exit=` — 조건 객체를 `{logic, conditions[...]}` dict 로 변환(아래 B-5).
  - `params={}` · `validation=[]` — **RuleBuilder 경로는 동적 파라미터(`$period` 치환)·검증규칙을 만들지 않음.** 빈 값. (preset 전략은 `params` 를 채우지만, 손으로 조립한 빌더 전략은 값을 이미 박아 넣어 파라미터화가 없음 — 함정 섹션 참고.)
  - `risk_management=self.risk_management.to_dict()` — `RiskManagement` 를 `{stop_loss:{enabled,percent}, ...}` dict 로(core/risk.py L36-52).
- 결과 `StrategyDefinition` 은 `@dataclass(frozen=True)` 불변 객체(core/strategy.py L12). 한번 만들면 못 바꿈 = 안전.

#### B-3. `to_dict()` — `L67-L69`

```python
# L67-L69
def to_dict(self) -> Dict[str, Any]:
    """딕셔너리로 변환"""
    return self.to_strategy_definition().to_dict()
```
- 편의 메서드. `StrategyRule` → `StrategyDefinition` → 다시 그 정의의 `to_dict()`(core/strategy.py L75-77, `asdict`)로 **순수 딕셔너리**까지 한 방에. JSON 저장·전송용.

#### B-4. `_generate_id()` — 이름에서 id 만들기 — `L71-L74`

```python
# L71-L74
def _generate_id(self) -> str:
    """전략 ID 생성"""
    # 이름에서 ID 생성 (공백 -> 언더스코어, 소문자)
    return self.name.lower().replace(" ", "_").replace("-", "_")
```
- 함수명 앞 `_` = **내부용**(밖에서 직접 부르지 말라는 관습).
- `"골든크로스 RSI-필터"` → 소문자화 → 공백/하이픈을 `_` 로 → `"골든크로스_rsi_필터"`. (한글은 `lower()` 에 영향 없음.)
- ⚠️ 주의: 충돌 방지(중복 id)·특수문자 정리는 안 합니다. 같은 이름이면 같은 id — 함정 섹션 참고.

#### B-5. `_condition_to_entry()` / `_condition_to_exit()` — 조건 객체 → dict — `L76-L90`

```python
# L76-L86
def _condition_to_entry(self, cond: Union[Condition, CompositeCondition]) -> Dict[str, Any]:
    """조건을 entry 형식으로 변환"""
    if isinstance(cond, CompositeCondition):
        return {
            "logic": cond.logic,
            "conditions": [c.to_dict() for c in cond.conditions],
        }
    return {
        "logic": "AND",
        "conditions": [cond.to_dict()],
    }
```
- **여기서 조건 트리가 표준 dict 로 펴집니다.** 두 갈래:
  - 복합조건(`CompositeCondition`, 예: `A & B`)이면 그 안의 `logic`("AND"/"OR")과 자식 조건들을 그대로 dict 리스트로(`c.to_dict()` 는 core/condition.py L51-82).
  - 단일조건(`Condition`, 예: `SMA(5) > SMA(20)`)이면 **혼자라도 "AND + 조건 1개"로 감싸서** 통일된 형태로 만듦. (codegen 이 항상 `{logic, conditions:[...]}` 형태를 기대하므로 단일도 리스트로 포장.)
- 이 결과 dict 의 각 원소는 `{"event":"greater_than", "indicator":"sma_5", "output":..., "compare_to":"sma_20", ...}` 같은 모양(core/condition.py `Condition.to_dict`). 즉 `SMA(5) > SMA(20)` 이 결국 이런 **선언적 dict** 가 됩니다.

```python
# L88-L90
def _condition_to_exit(self, cond: Union[Condition, CompositeCondition]) -> Dict[str, Any]:
    """조건을 exit 형식으로 변환"""
    return self._condition_to_entry(cond)
```
- 청산 조건도 진입과 **완전히 같은 변환 규칙** → 그냥 위 메서드 재사용. (중복 코드 안 만드는 깔끔한 처리.)

#### B-6. `summary()` — 사람이 읽는 요약 문자열 — `L92-L113`

```python
# L92-L113
def summary(self) -> str:
    """전략 요약 문자열"""
    lines = [
        f"전략명: {self.name}",
        f"설명: {self.description or '(없음)'}",
        f"카테고리: {self.category}",
        f"사용 지표: {len(self.indicators)}개",
    ]
    for ind in self.indicators:
        params_str = ", ".join(f"{k}={v}" for k, v in ind.params.items())
        lines.append(f"  - {ind.id}({params_str})")
    risk = self.risk_management
    if risk.stop_loss_pct:
        lines.append(f"손절: {risk.stop_loss_pct}%")
    if risk.take_profit_pct:
        lines.append(f"익절: {risk.take_profit_pct}%")
    if risk.trailing_stop_pct:
        lines.append(f"트레일링 스탑: {risk.trailing_stop_pct}%")
    return "\n".join(lines)
```
- **디버깅/학습용 출력기.** 빌드한 전략을 `print(rule.summary())` 하면 사람이 읽기 좋은 텍스트가 나옵니다.
- `lines` 리스트에 줄을 쌓다가 마지막에 `"\n".join(...)` 으로 여러 줄 문자열로 합칩니다(파이썬 관용구).
- 지표마다 `sma(period=5)` 처럼 `id(키=값)` 형식으로 풀어 보여줌. 리스크는 **값이 있을 때만**(`if risk.stop_loss_pct:` — None/0 이면 건너뜀) 줄을 추가.
- 실행/변환에는 영향 없는 **순수 보고용** — vbt_engine 의 `equity_curve` 와 비슷하게 "결과를 사람에게 보여주는" 부분.

---

### C. `RuleBuilder` — 조립 작업대 — `L116-L332`

#### C-1. 클래스 선언 + docstring — `L116-L138`

```python
# L116-L138 (요약)
class RuleBuilder:
    """전략 규칙 빌더 ...
    복합 조건 예:
        strategy = (
            RuleBuilder("복합 전략")
            .buy_when((SMA(5) > SMA(20)) & (RSI(14) < 70))
            .sell_when((SMA(5) < SMA(20)) | (RSI(14) > 80))
            .build()
        )
    """
```
- docstring 의 두 예시가 **단일 조건**과 **복합 조건(`&`/`|`)** 사용법을 모두 보여줍니다. `&`=AND, `|`=OR (core/condition.py 의 `__and__`/`__or__` 오버로딩).

#### C-2. `__init__` — 빈 작업대 차리기 — `L140-L151`

```python
# L140-L151
def __init__(self, name: str = "CustomStrategy"):
    self.name = name
    self._description: str = ""
    self._category: str = "custom"
    self._entry_condition: Optional[Union[Condition, CompositeCondition]] = None
    self._exit_condition: Optional[Union[Condition, CompositeCondition]] = None
    self._indicators: List[Indicator] = []
    self._risk = RiskManagement()
```
- **빌더의 "내부 상태"를 초기화.** 처음엔 거의 다 비어 있음:
  - `_entry_condition`/`_exit_condition` = `None` → **아직 안 정해짐**. `build()` 가 이게 None 인지 검사해 필수 누락을 잡습니다(L284-287).
  - `_indicators = []` → 빈 리스트. `buy_when`/`sell_when` 이 호출될 때마다 조건에서 지표를 자동 수집해 채움.
  - `_risk = RiskManagement()` → 기본 리스크 객체(전부 None, `max_position_pct=1.0`, core/risk.py L31-34). 손절/익절 메서드가 이 객체의 필드를 바꿉니다.
- 밑줄(`_`) 붙은 필드 = **내부 보관용**. 사용자는 메서드로만 건드립니다. `name` 만 밑줄 없이 공개(예시에서 생성자 인자로 받기 때문).
- `name` 기본값 `"CustomStrategy"` — 이름 안 주면 이걸로.

#### C-3. `description()` / `category()` — 메타데이터 설정 — `L153-L175`

```python
# L153-L175
def description(self, text: str) -> RuleBuilder:
    self._description = text
    return self

def category(self, cat: str) -> RuleBuilder:
    self._category = cat
    return self
```
- **체이닝 메서드의 표준 형태**: 값을 내부 상태에 저장하고 → `return self`(자기 자신 반환). 이 `return self` 덕에 `.description(...).category(...)` 처럼 점으로 이을 수 있습니다(사전지식 2).
- `category` 의 docstring 이 허용 카테고리를 안내: `trend, momentum, mean_reversion, volatility, composite`. **단, 코드는 검증하지 않습니다** — 오타를 써도 통과(함정 섹션).

#### C-4. `buy_when()` / `sell_when()` — 조건 설정 + 지표 자동 수집 — `L177-L209`

```python
# L177-L192
def buy_when(self, condition: Union[Condition, CompositeCondition]) -> RuleBuilder:
    """매수 조건 설정 ..."""
    self._entry_condition = condition
    self._collect_indicators(condition)
    return self
```
- 두 가지를 동시에:
  1. `self._entry_condition = condition` — 매수 조건 저장.
  2. `self._collect_indicators(condition)` — **조건식 안에 등장한 지표를 자동으로 긁어모음**(아래 C-9). 사용자가 지표 목록을 따로 적을 필요 없이, `SMA(5) > SMA(20)` 한 줄만 쓰면 `sma_5`·`sma_20` 이 알아서 `_indicators` 에 등록됩니다. **이게 빌더의 똑똑한 부분.**
- `sell_when` (L194-209)도 구조가 동일 — `_exit_condition` 에 저장하고 지표 수집.

```python
# L194-L209 (sell_when 본문)
def sell_when(self, condition: Union[Condition, CompositeCondition]) -> RuleBuilder:
    self._exit_condition = condition
    self._collect_indicators(condition)
    return self
```
- ⚠️ 같은 `buy_when` 을 두 번 부르면 **나중 것이 앞 것을 덮어씁니다**(단순 대입). 조건을 누적하려면 `&`/`|` 로 한 식에 합쳐 한 번에 넘겨야 합니다.

#### C-5. `stop_loss()` / `take_profit()` / `trailing_stop()` — 리스크 안전핀 — `L211-L256`

```python
# L211-L224
def stop_loss(self, percent: float) -> RuleBuilder:
    """손절 설정 ..."""
    self._risk.stop_loss_pct = percent
    return self

# L226-L239
def take_profit(self, percent: float) -> RuleBuilder:
    self._risk.take_profit_pct = percent
    return self

# L241-L256
def trailing_stop(self, percent: float) -> RuleBuilder:
    """고점 대비 일정 비율 하락 시 청산."""
    self._risk.trailing_stop_pct = percent
    return self
```
- 셋 다 `self._risk`(공유 `RiskManagement` 객체)의 해당 필드를 채우고 `return self`.
- 단위는 **퍼센트 그대로**: `.stop_loss(5.0)` → `stop_loss_pct = 5.0` (= 5%). 나중에 `RiskManagement.to_dict()` 가 `{"enabled": True, "percent": 5.0}` 로 바꿈(core/risk.py L39-42 — None 이 아니면 `enabled=True`).
- `trailing_stop`(트레일링 스탑) = **고점 대비** 일정 비율 하락 시 청산(docstring). 단순 손절(매수가 대비)과 다름.

#### C-6. `max_position()` — 최대 비중 (단위 변환 주의!) — `L258-L271`

```python
# L258-L271
def max_position(self, percent: float) -> RuleBuilder:
    """최대 포지션 비중 설정 ...
    Example:
        .max_position(80)  # 최대 80% 비중
    """
    self._risk.max_position_pct = percent / 100
    return self
```
- ⚠️ **여기만 단위가 다릅니다.** 손절/익절은 퍼센트 그대로 저장하는데, `max_position` 은 입력 `80`(%)을 **`/ 100` 해서 `0.8`(비율)로** 저장합니다. `RiskManagement.max_position_pct` 가 "0.0~1.0 비율"로 정의되어 있기 때문(core/risk.py L34, L22). 입력은 80, 저장은 0.8 — 혼동 주의(함정 섹션).

#### C-7. `build()` — "완성" 버튼 (검증 + 출력) — `L273-L300`

```python
# L273-L300
def build(self) -> StrategyRule:
    """전략 규칙 빌드 ...
    Raises:
        ValueError: 필수 조건이 설정되지 않은 경우
    """
    if self._entry_condition is None:
        raise ValueError("매수 조건이 설정되지 않았습니다. buy_when()을 호출하세요.")
    if self._exit_condition is None:
        raise ValueError("매도 조건이 설정되지 않았습니다. sell_when()을 호출하세요.")

    # 중복 지표 제거
    unique_indicators = self._deduplicate_indicators()

    return StrategyRule(
        name=self.name,
        entry_condition=self._entry_condition,
        exit_condition=self._exit_condition,
        indicators=unique_indicators,
        risk_management=self._risk,
        description=self._description,
        category=self._category,
    )
```
- **빌더 패턴의 마무리.** 세 단계:
  1. **검증** — 매수·매도 조건이 둘 다 있어야 함. 없으면 `ValueError` 로 **친절한 한국어 메시지**와 함께 멈춤(vbt_engine 의 `raise ValueError("vix_risk_off requires vix")` 와 같은 방어 패턴). 이게 빌더 패턴이 생성자보다 나은 점 — "필수 누락"을 명확히 잡음.
  2. **중복 지표 제거** — `_deduplicate_indicators()`(아래 C-10). 매수·매도 조건에 같은 `SMA(20)` 이 두 번 나와도 한 번만 등록.
  3. **출력** — 모은 상태를 `StrategyRule` 로 포장해 반환. (여기서 `_risk` 객체를 그대로 넘기므로, build 이후 빌더의 `_risk` 를 또 바꾸면 결과에도 반영됨 — 보통 build 가 끝이라 문제 없음.)
- 반환은 `StrategyRule` — 표준 정의가 필요하면 사용자가 이어서 `.to_strategy_definition()` 을 부릅니다.

#### C-8. `_collect_indicators()` — 조건 트리에서 지표 긁기 (재귀) — `L302-L311`

```python
# L302-L311
def _collect_indicators(self, condition: Union[Condition, CompositeCondition]) -> None:
    """조건에서 사용된 지표 수집 (재귀적)"""
    if isinstance(condition, Condition):
        if isinstance(condition.left, Indicator):
            self._add_indicator(condition.left)
        if isinstance(condition.right, Indicator):
            self._add_indicator(condition.right)
    elif isinstance(condition, CompositeCondition):
        for c in condition.conditions:
            self._collect_indicators(c)
```
- **조건은 트리 구조**입니다: `(SMA(5) > SMA(20)) & (RSI(14) < 70)` 은 위에 `CompositeCondition(AND)`, 그 아래 단일 `Condition` 2개, 각 Condition 의 좌/우에 `Indicator`. 이 메서드가 그 트리를 **재귀로 내려가며** 잎(leaf)에 있는 지표를 모읍니다.
  - 단일 `Condition` 이면 → 좌(`left`)·우(`right`)를 보고 **`Indicator` 인 것만** `_add_indicator` 로 등록. (우변이 숫자 `70` 이면 `Indicator` 가 아니라 무시 — `RSI(14) < 70` 에선 `RSI(14)` 만 잡힘.)
  - 복합 `CompositeCondition` 이면 → 자식들을 하나씩 다시 `_collect_indicators`(재귀). `&`·`|` 를 아무리 깊게 중첩해도 끝까지 훑습니다.
- ⚠️ `ScaledIndicator`(예: `MA * 0.9`)는 `Indicator` 가 아니라 별도 타입이라 **여기선 수집 안 됨**(함정 섹션).

#### C-9. `_add_indicator()` — 가격/거래량은 지표에서 제외 — `L313-L319`

```python
# L313-L319
def _add_indicator(self, indicator: Indicator) -> None:
    """지표 추가 (가격 제외)"""
    # 가격은 지표가 아니므로 제외
    if indicator.id in ("price", "volume"):
        return
    self._indicators.append(indicator)
```
- 모든 지표를 다 넣지 않습니다. **`id` 가 `"price"` 또는 `"volume"` 이면 건너뜀.** 왜? `Price.close()` 같은 건 "계산해야 하는 지표(SMA·RSI)"가 아니라 **원본 가격 데이터** 라서, 지표 초기화 목록(codegen 이 `self.SMA(...)` 같은 걸 만드는)에 넣을 필요가 없기 때문.
- 근거: `core/indicator.py` 의 `Price.close()` 는 `Indicator("price", ...)`, `Price.volume()` 은 `Indicator("volume", ...)` 를 반환(L1090, L1110). 그래서 `id in ("price","volume")` 로 정확히 걸러집니다.
- 즉 `Price.close() > SMA(20)` 라는 조건이면 `SMA(20)` 만 지표로 등록되고 가격은 빠짐.

#### C-10. `_deduplicate_indicators()` — 중복 제거 — `L321-L332`

```python
# L321-L332
def _deduplicate_indicators(self) -> List[Indicator]:
    """중복 지표 제거"""
    seen = set()
    unique = []
    for ind in self._indicators:
        key = (ind.id, tuple(sorted(ind.params.items())), ind.output)
        if key not in seen:
            seen.add(key)
            unique.append(ind)
    return unique
```
- **같은 지표가 여러 조건에 등장하면 한 번만 남깁니다.** 예: 매수 `SMA(5) > SMA(20)`, 매도 `SMA(5) < SMA(20)` → `sma_5`·`sma_20` 이 각각 2번씩 수집됐지만, 백테스트에선 한 번만 계산하면 됨.
- 핵심 트릭은 **"중복 판단 기준(key) 만들기"**:
  - `ind.id` (예: `"sma"`) + `tuple(sorted(ind.params.items()))` (예: `(("period",20),)`) + `ind.output` (예: `"value"`)을 합친 튜플을 고유키로.
  - `params` 를 **정렬 후 튜플로** 바꾸는 이유: dict 는 `set` 에 못 넣음(해시 불가)·키 순서가 달라도 같은 지표로 보려고. `sorted` 로 순서를 통일하고 `tuple` 로 해시 가능하게.
  - `output` 도 키에 포함 → 같은 MACD 라도 `output="macd"` 와 `output="signal"` 은 **다른 지표**로 구분(멀티아웃풋 지표 대응).
- `seen`(이미 본 키 집합)에 없으면 `unique` 에 추가. 결과는 **순서 보존 + 중복 제거** 리스트. (alias 는 키에 안 들어가니, alias 만 다르고 나머지 같으면 하나로 합쳐짐 — 의도된 동작.)

---

### D. `dsl/__init__.py` — 패키지 정문(re-export) — `L1-L283`

#### D-1. 패키지 docstring — `L1-L4`

```python
# L1-L4
"""DSL (Domain Specific Language) for strategy building.

Provides fluent API for creating strategies without code.
"""
```
- 패키지 전체의 정체성: "코드 없이 전략을 만드는 작은 언어(DSL)". `builder.py` docstring 과 같은 메시지.

#### D-2. 빌더 import — `L6`

```python
# L6
from kis_backtest.dsl.builder import RuleBuilder, StrategyRule
```
- `builder.py` 에서 두 핵심 클래스를 끌어옴. 이 줄 덕분에 사용자는 `from kis_backtest.dsl import RuleBuilder` (한 단계 짧게) 가능.

#### D-3. helpers 의 지표 팩토리 대량 import — `L7-L142`

```python
# L7-L142 (구조만 발췌)
from kis_backtest.dsl.helpers import (
    # 이동평균 (14개)
    SMA, EMA, DEMA, TEMA, HMA, KAMA, ALMA, LWMA, TRIMA, T3, ZLEMA, WMA, FRAMA, VIDYA,
    # 오실레이터 (20개)
    RSI, STOCH, Stochastic, STOCHRSI, MACD, CCI, WILLIAMS_R, MOMENTUM, ROC, APO, PPO,
    AROON, CMO, AO, CHO, ULTOSC, TRIX, TSI, RVI, DPO, KVO,
    # 추세 지표 (12개) ... ADX, ADXR, SAR, CHOP, COPPOCK, SUPERTREND, ...
    # 거래량 (12개) ... OBV, AD, ADL, CMF, MFI, FORCE, VWAP, VWMA, EOM,
    # 변동성 (10개) ... ATR, NATR, BB, STD, VARIANCE, BETA, ALPHA,
    # 기타 (10개) ... MAXIMUM, Maximum, MINIMUM, Minimum, MIDPOINT, MIDPRICE, LOGR, IBS, BOP, REGRESSION, PIVOT, AUGEN,
    # 멀티 아웃풋 클래스 (5개) ... BollingerBands, IchimokuCloud, KeltnerChannels, DonchianChannel, AccelerationBands,
    # Price 클래스
    Price,
    # Candlestick Patterns (19개) ... Doji, Hammer, Engulfing, MorningStar, ThreeWhiteSoldiers, ...
)
```
- `dsl/helpers.py`(약 80종 지표 팩토리 + 5 멀티아웃풋 클래스 + 19 캔들 패턴)의 심볼을 **전부 한 import 문에** 모읍니다. 주석으로 카테고리(이동평균/오실레이터/…)와 개수를 표기 — 사용자가 "어떤 지표가 있나" 목차로 활용.
- 이 함수들은 모두 **`Indicator` 객체를 반환**합니다(helpers.py L19-30 의 `SMA` 가 `return Indicator("sma", {"period": period})` 인 것 확인). 그래서 `SMA(5) > SMA(20)` 의 `>` 가 `Indicator.__gt__`(연산자 오버로딩)로 이어져 `Condition` 이 됩니다 — **빌더로 들어가는 조건이 만들어지는 출발점**.
- 대소문자 별칭 쌍(`STOCH`/`Stochastic`, `MAXIMUM`/`Maximum` 등)이 보임 — 같은 지표를 두 표기로 제공(취향대로 쓰라고).

#### D-4. `__all__` — 공개 심볼 명시 — `L144-L283`

```python
# L144-L283 (구조만 발췌)
__all__ = [
    # Builder
    "RuleBuilder", "StrategyRule",
    # 이동평균 (14개) "SMA", "EMA", ...
    # 오실레이터 (20개) "RSI", "STOCH", ...
    # ... (위 import 와 동일 목록을 문자열로) ...
    "ThreeWhiteSoldiers", "ThreeBlackCrows",
]
```
- `__all__` 은 **"이 패키지의 공식 공개 목록"**. `from kis_backtest.dsl import *` 했을 때 무엇이 딸려오는지를 정의하고, 동시에 "이게 우리가 외부에 약속하는 API" 라는 문서 역할.
- 위 import 목록과 **같은 이름들을 문자열("...")로** 한 번 더 적은 것 — import 는 "실제로 가져오기", `__all__` 은 "그중 공개할 것 선언". 보통 둘이 일치하도록 유지(여기선 import 한 모든 것을 공개).
- 맨 앞에 `RuleBuilder`·`StrategyRule` 을 두고, 나머지는 지표 카테고리 순. 즉 **"이 키트의 부품 목록표"** 그 자체.

---

## ⚠️ 함정·주의 (코드에 박힌 교훈)

1. **`buy_when`/`sell_when` 은 덮어쓰기** — 두 번 호출하면 단순 대입이라 앞 조건이 사라짐(L190, L207). 조건을 누적하려면 `&`/`|` 로 한 식에 합쳐 한 번에 넘길 것.
2. **`max_position` 만 단위가 다름** — 손절/익절은 퍼센트 그대로(5.0=5%) 저장하지만, `max_position(80)` 은 `/100` 해서 `0.8` 비율로 저장(L270). "왜 80 을 넣었는데 0.8 이지?" 의 답.
3. **`build()` 전 필수 조건 누락 = ValueError** — 매수·매도 둘 다 없으면 멈춤(L284-287). 의도된 방어. `RuleBuilder("x").build()` 만 부르면 즉시 에러.
4. **`ScaledIndicator` 는 지표 수집에서 빠짐** — `_collect_indicators` 는 `isinstance(x, Indicator)` 만 검사(L305-308). `MA * 0.9`(=`ScaledIndicator`)를 조건에 쓰면 그 안의 원본 `MA` 가 `_indicators` 에 **자동 등록되지 않음**. (조건 dict 변환은 되지만 지표 초기화 목록에 누락될 수 있음 — codegen 단계에서 주의.)
5. **`params`·`validation` 이 항상 빈 값** — `to_strategy_definition` 이 `params={}, validation=[]` 로 고정(L62-63). RuleBuilder 로 만든 전략은 **동적 파라미터(`$period` 치환)·검증규칙이 없음** → 프론트에서 슬라이더로 조정 불가. 값을 코드에 박아 넣는 "일회성/직접 작성" 전략에 적합. (반면 preset 전략은 `params` 를 채워 조정 가능 — 개요의 `PARAM_DEFINITIONS` 참고.)
6. **`_generate_id` 충돌 가능** — 이름만으로 id 를 만들어(L74) 같은 이름이면 같은 id. 특수문자·중복 처리 없음. 여러 전략을 등록할 땐 이름을 고유하게.
7. **`category` 미검증** — docstring 은 5종을 안내하지만 코드는 아무 문자열이나 통과(L165-174). 오타가 그대로 들어감.
8. **import 와 `__all__` 동기화** — `__init__.py` 에서 helpers 에 지표를 추가하면 **두 곳(import 블록 + `__all__`)을 모두** 갱신해야 `from dsl import 새지표` 가 동작. 한 곳만 고치면 누락.

---

## 🚀 고도화 아이디어 (강의·개선 버전용)

- **조건 누적 메서드** — `buy_when` 덮어쓰기 대신 `add_buy_when(cond, logic="AND")` 를 만들어 내부에서 `self._entry_condition & cond` 로 합치면, 여러 줄로 조건을 쌓는 더 직관적인 API.
- **`ScaledIndicator` 도 수집** — `_collect_indicators` 에 `isinstance(x, ScaledIndicator)` 분기를 추가해 `x.indicator` 를 등록하면 함정 4 해소.
- **파라미터화 빌더** — `.param("short", default=5, min=2, max=50)` + `SMA("$short")` 를 지원해 `to_strategy_definition` 의 `params` 를 채우면, RuleBuilder 전략도 프론트 슬라이더로 조정 가능(preset 수준).
- **`build()` 검증 강화** — 지표 워밍업 충돌·output 유효성을 `codegen/validator.IndicatorValidator` 로 미리 검사해 build 단계에서 실패를 앞당김(빠른 피드백).
- **`category` enum 화** — `Literal["trend","momentum",...]` 타입 + build 시 검증으로 오타 차단(vbt_engine 의 `StrategyType` 처럼).
- **자연어 → RuleBuilder 코드 생성** — 개요가 지적한 "미래 자리": LLM 이 사용자 문장을 `RuleBuilder(...).buy_when(...)...` 코드로 변환 → 이 빌더가 그대로 `StrategyDefinition` 으로 → codegen → 백테스트. DSL 이 그 **번역 목표 언어**로 이상적.
- **id 충돌 방지** — `_generate_id` 에 해시 접미사나 timestamp 추가, 또는 registry 등록 시 중복 검사.

---

## 📚 용어 사전 (이 파일 한정)

| 용어 | 뜻 |
|---|---|
| **빌더 패턴(Builder Pattern)** | 객체를 단계적으로 조립하고 마지막 `build()` 에서 검증·완성. 필수/선택 항목 구분에 유리 |
| **메서드 체이닝 / Fluent API** | `.a().b().c()` 로 잇기. 각 메서드가 `return self` 하기에 가능 |
| **`RuleBuilder`** | 조건·리스크를 모으는 작업대 클래스. 이 파일의 주인공 |
| **`StrategyRule`** | `build()` 의 결과물(사람 친화 규칙 묶음). `to_strategy_definition()` 으로 표준화 |
| **`StrategyDefinition`** | 라이브러리 공통 표준 전략 정의(`@dataclass(frozen=True)`, core/strategy.py). codegen 의 입력 |
| **`Condition` / `CompositeCondition`** | `SMA(5)>SMA(20)`(단일) / `A & B`(복합) 의 객체 표현. core/condition.py |
| **`Indicator`** | 지표 객체. `>`·`<`·`&` 연산자를 오버로딩해 비교식이 곧 `Condition` 이 됨 |
| **`RiskManagement`** | 손절·익절·트레일링·최대비중 설정 객체. core/risk.py |
| **연산자 오버로딩** | `>`·`&` 를 클래스에 재정의해 `SMA(5)>SMA(20)` 이 숫자비교 아닌 `Condition` 생성 |
| **재귀(recursion)** | `_collect_indicators` 가 조건 트리를 끝까지 스스로 호출하며 내려감 |
| **dedup 키** | `(id, sorted(params), output)` 튜플로 중복 지표를 식별(L327) |
| **re-export** | `__init__.py` 가 하위 모듈 심볼을 모아 다시 공개. 패키지의 "정문" |
| **`__all__`** | `import *` 와 공개 API 를 정의하는 문자열 목록 |
| **DSL** | 특정 분야 전용 작은 언어. 여기선 `RuleBuilder` 체이닝이 전략 기술 DSL |
