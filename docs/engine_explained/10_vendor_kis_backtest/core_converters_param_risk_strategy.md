# `core/` 나머지 4파일 — 변환·파라미터·리스크·전략정의 (완전 라인별 해설)

> 원본 루트: `analytics/app/lean/kis_backtest/core/`
> - `converters.py` (494줄) · `param_resolver.py` (229줄) · `risk.py` (74줄) · `strategy.py` (144줄)
> 형식 기준: 모범 [`01_backtest/vbt_engine.md`](../01_backtest/vbt_engine.md) · [`README.md` "3. 공통 형식"](../README.md) · 벤더 지도 [`00_overview.md`](00_overview.md).
> 이 문서는 **"입력 → 표준 스키마"** 로 가는 깔때기의 부품 4개를 라인별로 풉니다. (지표/조건 객체인 `indicator.py`·`condition.py`, 최종 목적지인 `schema.py` 는 별도 문서. 여기선 그 4파일이 **schema 와 어떻게 연결되는지**까지만 다룹니다.)

---

## 📌 한눈에 (4파일 역할표)

`00_overview.md` 에서 본 큰 그림: **어떤 형태로 들어온 전략이든(프리셋·YAML·dataclass·dict) `StrategySchema` 한 형태로 모은다**(Single Source of Truth). 그 "모으는 깔때기"의 부품이 이 4파일입니다.

| 파일 | 한 줄 역할 | 비유 | 누가 호출하나 |
|---|---|---|---|
| `converters.py` | 4가지 입력 형식 → `StrategySchema` 로 **번역** | 한·영·중·일 문서를 전부 "표준 양식 1장"으로 옮기는 **번역실** | `runner.py:176` 이 `from_definition` 직접 호출. 나머지 진입점은 라이브러리 내부 |
| `param_resolver.py` | `"$period"` 같은 **참조 문자열을 실제 숫자로 치환** | `{이름}` 자리에 진짜 이름을 끼워 넣는 **메일 머지** | `converters.py`(YAML 경로)·schema 가 내부적으로 사용 |
| `risk.py` | 손절·익절·트레일링·최대비중을 담는 **리스크 설정 상자** | 자동차의 **안전벨트·에어백 설정 패널** | `StrategyDefinition.risk_management`(dict) ↔ `RiskSchema` 사이 변환에서 등장 |
| `strategy.py` | 전략 한 개의 **불변(frozen) 표준 정의** dataclass | 도장 찍힌 **원본 계약서**(고쳐 쓰지 못함, 사본만) | preset/registry 가 만들고, `converters.from_definition` 이 받아 schema 로 변환 |

> 핵심 관계 한 문장: **`StrategyDefinition`(strategy.py) 을 만들면 → `from_definition`(converters.py) 이 `StrategySchema` 로 번역하고 → 그 과정에서 `RiskManagement`(risk.py) 와 `$param` 치환(param_resolver.py) 이 동원된다.** 이 4파일은 따로 노는 게 아니라 **"입력→스키마" 한 파이프라인의 연결된 톱니바퀴**입니다.

---

## 🧠 사전 지식 (이거 모르면 막힘)

#### 1) `@dataclass` = "필드만 적으면 생성자·비교·repr 자동 생성"
```python
@dataclass
class Box:
    a: int = 0
    b: str = "hi"
```
- `Box(a=3)` 처럼 일부만 줘도 나머지는 기본값. `vbt_engine.md` 의 `BacktestParams` 와 같은 도구. 여기선 `RiskManagement`·`StrategyDefinition` 이 dataclass.

#### 2) `frozen=True` = "한 번 만들면 못 고치는(불변) 객체"
- `@dataclass(frozen=True)` 면 `obj.id = "x"` 같은 수정이 **에러**. 전략 정의를 실수로 바꾸는 걸 막습니다.
- 그래서 "값을 바꾼 새 버전"이 필요하면 **새 객체를 만들어 반환**합니다(아래 `with_params`).

#### 3) 정규식(regex) `re.compile(...)` = "문자열 패턴 자판기"
- `param_resolver` 의 `^\$([a-zA-Z_]\w*)$` 는 **"문자열 전체가 `$이름` 형태인가?"** 를 검사. `^`=시작, `\$`=달러기호 자체, `(...)`=뽑아낼 그룹(이름), `$`=끝.
- 예: `"$period"` → 매치O, 그룹="period". `"$5"` → 매치X(숫자로 시작 못 함). `"abc"` → 매치X.

#### 4) `$param_name` 참조 = "전략 안의 빈칸(placeholder)"
- 전략을 정의할 때 지표 기간을 `14` 로 못 박지 않고 `"$period"` 라 적어두면, **나중에 사용자가 period 값을 바꿀 수 있는 다이얼**이 됩니다.
- 파라미터 정의는 두 형태: `{"period": {"default": 14, "min": 2, "max": 100}}`(상세) 또는 `{"period": 14}`(직접값). resolver 가 둘 다 처리.

#### 5) `hasattr / getattr` = "이 객체에 그 속성이 있나?" / "있으면 꺼내고 없으면 기본값"
- `hasattr(x, 'alias')` → x 에 `.alias` 가 있으면 True. `getattr(x, 'output', 'value')` → `.output` 있으면 그 값, 없으면 `'value'`.
- **왜 자주 쓰나?** converters 는 입력이 "객체일 수도, dict 일 수도, 일부 필드가 빠질 수도" 있어 **방어적으로** 꺼내야 합니다(오리 타이핑, duck typing).

#### 6) `StrategySchema` (목적지) 가 무엇인지 최소한
- 모든 입력이 도착하는 **Pydantic 표준 스키마**(이 문서 범위 밖, `schema.py`). 안에 `IndicatorSchema`·`ConditionSchema`·`CompositeConditionSchema`·`RiskSchema`·`OperatorType`(Enum) 등이 들어갑니다. converters 의 일은 입력을 이 부품들로 채우는 것.

---

## 🗺 구조 (이 4파일이 schema/dsl 과 어떻게 맞물리나)

```
   ┌─────────────── 4가지 입력 형식 ───────────────┐
   │                                               │
   ▼                ▼               ▼               ▼
BaseStrategy    KisStrategyFile  StrategyDefinition  Dict
(프리셋)        (YAML)          (dataclass)        (API요청)
   │                │               │               │
from_preset    from_yaml_file  from_definition   from_dict     ◀── converters.py (번역실)
   │                │  └─$param 치환  │               │
   │                ▼  ┌─────────────┘               │
   │       param_resolver.resolve("$period",...)     │   ◀── param_resolver.py
   │                │  "$period" → 14                │
   ▼                ▼               ▼                ▼
 ┌──────────────────────────────────────────────────────┐
 │             StrategySchema  (Single Source of Truth)   │  ← schema.py(별도)
 │   indicators[IndicatorSchema]  entry/exit[Condition…]  │
 │   risk[RiskSchema]  params  metadata  version          │
 └──────────────────────────────────────────────────────┘
                          │
                          ▼
              codegen/generator → Lean 코드

   risk.py:  RiskManagement(dataclass)  ──to_dict()──▶  {"stop_loss":{enabled,percent},…}
                      ▲                                          │
                      └──────────── from_dict() ◀───────────────┘
             (strategy.py 의 risk_management dict ↔ schema 의 RiskSchema 사이 다리)

   strategy.py: StrategyDefinition(frozen)  ── with_params() ──▶ 새 정의(불변이라 복제)
                            │
                  from_definition() 이 입력으로 받음
```

핵심: **converters 가 중앙 허브**, param_resolver 는 그 안에서 `$참조`를 푸는 도우미, risk·strategy 는 각각 "리스크 데이터 모델"과 "입력 데이터 모델"을 제공.

---

## 📖 파일별 라인별 해설

---

## A. `strategy.py` — 전략 한 개의 불변 표준 정의 (먼저 읽기)

> 이걸 먼저 보는 이유: `from_definition` 의 **입력**이 바로 이 객체라서, 데이터 형태를 알아야 converters 가 이해됩니다. `00_overview.md` 의 "데이터 흐름"에서 `registry → core/strategy → from_definition` 의 그 `core/strategy` 입니다.

### A-1. docstring + import — `strategy.py: L1-L9`
```python
# L1-L9
"""Strategy Definition - Core domain model.

Immutable dataclass representing a complete strategy definition.
"""
from __future__ import annotations
from dataclasses import dataclass, field, asdict
from typing import Any, Dict, List, Optional
```
- **무엇을**: "전략 한 개"의 핵심 도메인 모델. `Immutable`(불변) 강조.
- `field` — dataclass 에서 **기본값이 가변(list/dict)일 때** 쓰는 도구(아래 설명). `asdict` — dataclass 를 통째로 dict 로 바꾸는 함수.
- 초보 포인트: 가변 기본값(`[]`,`{}`)을 `= []` 로 직접 쓰면 **모든 인스턴스가 같은 리스트를 공유하는 파이썬 함정**이 있어, `field(default_factory=list)` 로 매번 새로 만들게 합니다.

### A-2. 클래스 헤더와 필드 — `strategy.py: L12-L73`
```python
# L12-L13, L62-L73 (헤더 + 필드만 발췌)
@dataclass(frozen=True)
class StrategyDefinition:
    id: str
    name: str
    description: str
    category: str
    indicators: List[Dict[str, Any]]
    entry: Dict[str, Any]
    exit: Dict[str, Any]
    params: Dict[str, Dict[str, Any]] = field(default_factory=dict)
    validation: List[Dict[str, str]] = field(default_factory=list)
    risk_management: Dict[str, Any] = field(default_factory=dict)
    metadata: Dict[str, Any] = field(default_factory=dict)
    version: str = "1.0.0"
```
- **`frozen=True`** — 한 번 만든 전략 정의는 **수정 불가**. 전략이 파이프라인을 흐르는 동안 누군가 몰래 바꾸는 사고를 원천 차단. (사전지식 2)
- **필드 4개는 필수**(기본값 없음): `id`·`name`·`description`·`category`·`indicators`·`entry`·`exit` 까지가 사실상 핵심. 그 뒤는 `default_factory` 로 **없으면 빈 dict/list**.
- 주목: `indicators`·`entry`·`exit`·`risk_management` 가 **순수 dict/list** 라는 점. 즉 이 dataclass 는 아직 "객체화·검증된" 형태가 아니라 **느슨한 dict 정의**입니다. 이걸 엄격한 객체(`IndicatorSchema` 등)로 바꾸는 게 곧 `from_definition` 의 일.
- `category` 의 의미는 docstring(L22)에 명시: `trend, momentum, mean_reversion, volatility, composite`.

### A-3. docstring 예시가 곧 "전략 작성법" — `strategy.py: L31-L60`
```python
# L37-L52 (docstring 내부 예시 발췌)
indicators=[
    {"id": "sma", "alias": "sma_short", "params": {"period": "$short_window"}},
    {"id": "sma", "alias": "sma_long",  "params": {"period": "$long_window"}},
],
entry={
    "logic": "AND",
    "conditions": [
        {"indicator": "sma_short", "event": "cross_above", "compare_to": "sma_long"}
    ]
},
```
- **이 예시 한 덩이가 이 라이브러리의 전략 표현 방식 전체를 보여줍니다.**
  - 지표는 `id`(어떤 지표)+`alias`(별명)+`params`. `params` 값에 **`"$short_window"`** 처럼 `$참조`를 쓴 것에 주목 → 나중에 `param_resolver` 가 채움.
  - 조건은 `indicator`(왼쪽)·`event`/`operator`(연산자)·`compare_to`(오른쪽). `"cross_above"` = 상향 교차.
  - `params={"short_window": {"default": 5, "min": 2, "max": 50}}` 가 그 `$short_window` 의 정의(L53-L56).
- 즉 **"빈칸($short_window) + 빈칸 사전(params)"** 구조 → 사용자가 params 만 바꾸면 전략 다이얼이 돌아갑니다.

### A-4. `to_dict` / `from_dict` — 직렬화 왕복 — `strategy.py: L75-L95`
```python
# L75-L95
def to_dict(self) -> Dict[str, Any]:
    """딕셔너리로 변환"""
    return asdict(self)

@classmethod
def from_dict(cls, data: Dict[str, Any]) -> StrategyDefinition:
    return cls(
        id=data["id"],
        name=data["name"],
        description=data.get("description", ""),
        category=data.get("category", "custom"),
        indicators=data.get("indicators", []),
        entry=data.get("entry", {"logic": "AND", "conditions": []}),
        exit=data.get("exit", {"logic": "AND", "conditions": []}),
        params=data.get("params", {}),
        validation=data.get("validation", []),
        risk_management=data.get("risk_management", {}),
        metadata=data.get("metadata", {}),
        version=data.get("version", "1.0.0"),
    )
```
- `to_dict` = `asdict` 한 줄. dataclass → 중첩 dict(JSON 저장·전송용).
- `from_dict` = 그 반대. **`id`·`name` 만 `data["..."]`(필수, 없으면 KeyError)**, 나머지는 `data.get(키, 기본값)` 으로 **없어도 안전**. `entry`/`exit` 기본값이 `{"logic":"AND","conditions":[]}`(빈 조건)인 게 디테일.
- 초보 포인트: `@classmethod` + `cls(...)` = "이 클래스의 새 인스턴스를 만드는 두 번째 생성문". 생성자(`__init__`)는 dataclass 가 자동 생성하므로, `from_dict` 는 **dict 를 받는 별도 입구**.

### A-5. `with_params` — 불변 객체의 "수정"법 — `strategy.py: L97-L117`
```python
# L97-L117
def with_params(self, **kwargs: Any) -> StrategyDefinition:
    """파라미터 기본값을 오버라이드한 새 정의 반환"""
    new_params = dict(self.params)
    for key, value in kwargs.items():
        if key in new_params:
            new_params[key] = {**new_params[key], "default": value}

    return StrategyDefinition(
        id=self.id, name=self.name, description=self.description,
        category=self.category, indicators=self.indicators,
        entry=self.entry, exit=self.exit,
        params=new_params,          # ← 이것만 교체
        validation=self.validation, risk_management=self.risk_management,
        metadata=self.metadata, version=self.version,
    )
```
- **무엇을**: `strategy.with_params(short_window=10)` → `short_window` 의 `default` 만 10으로 바꾼 **새 전략 정의**를 반환.
- **왜 새로 만드나**: `frozen=True` 라 기존 객체를 못 고침. 그래서 **모든 필드를 복사하되 `params` 만 교체한 사본**을 반환(불변 객체의 정석 패턴).
- `new_params[key] = {**new_params[key], "default": value}` — 기존 정의 dict(`{"default":5,"min":2,...}`)를 펼치고(`**`) `default` 만 덮어쓰기. **min/max/step 은 보존**됨.
- `if key in new_params` — 정의에 없는 파라미터 이름은 **조용히 무시**(검증은 별도 `validate_params`).

### A-6. `get_default_params` / `validate_params` — `strategy.py: L119-L144`
```python
# L119-L144
def get_default_params(self) -> Dict[str, Any]:
    return {
        name: param_def.get("default")
        for name, param_def in self.params.items()
    }

def validate_params(self, params: Dict[str, Any]) -> List[str]:
    errors = []
    for param_name, value in params.items():
        if param_name not in self.params:
            continue
        param_def = self.params[param_name]
        min_val = param_def.get("min")
        max_val = param_def.get("max")
        if min_val is not None and value < min_val:
            errors.append(f"{param_name}은(는) {min_val} 이상이어야 합니다 (현재: {value})")
        if max_val is not None and value > max_val:
            errors.append(f"{param_name}은(는) {max_val} 이하여야 합니다 (현재: {value})")
    return errors
```
- `get_default_params` — `{"short_window": 5, "long_window": 20}` 처럼 **이름→기본값** 만 추려냄(각 정의에서 `default` 만 뽑기).
- `validate_params` — 넘어온 값들이 각 파라미터의 `min`/`max` **범위 안인지** 검사. 위반 시 **사람이 읽을 한국어 에러 메시지 리스트**를 반환(빈 리스트면 통과).
- 초보 포인트: 이 함수는 **에러를 던지지 않고 리스트로 모아** 반환합니다 → 호출자가 "여러 위반을 한 번에" 보여줄 수 있음. `self.params` 에 없는 이름은 `continue` 로 그냥 건너뜀(이 함수는 "범위"만, "존재"는 안 봄).

> 💡 **strategy ↔ schema 연결 요약**: `StrategyDefinition` 은 **느슨한 dict 묶음**(검증 약함, 불변). `from_definition` 이 이걸 받아 `parse_indicators`/`parse_condition`/`RiskSchema` 로 **엄격한 Pydantic 스키마**로 승격시킵니다. 즉 strategy.py = "사람이 쓰기 쉬운 입력 모델", schema.py = "기계가 믿고 쓰는 검증된 모델".

---

## B. `risk.py` — 리스크 설정 상자 (가장 짧음, 워밍업용)

> 74줄로 제일 짧고 구조가 명확해 "dataclass + to_dict/from_dict 왕복" 패턴을 익히기 좋습니다. converters 의 `_convert_risk_*` 함수들이 이 객체와 짝을 이룹니다.

### B-1. 헤더 + 필드 — `risk.py: L1-L34`
```python
# L12-L34
@dataclass
class RiskManagement:
    stop_loss_pct: Optional[float] = None
    take_profit_pct: Optional[float] = None
    trailing_stop_pct: Optional[float] = None
    max_position_pct: float = 1.0
```
- **무엇을**: 손절(stop loss)·익절(take profit)·트레일링 스탑·최대 포지션 비중 4개를 담는 설정 상자.
- 셋은 `Optional[float] = None`(**미설정 = 끔**), `max_position_pct` 만 `= 1.0`(기본 = 자본 100% 투입 허용).
- 용어:
  - **손절(stop_loss_pct=5.0)** = "5% 손해 보면 자동 매도"(손실 제한).
  - **익절(take_profit_pct=10.0)** = "10% 이익 나면 자동 매도"(이익 확정).
  - **트레일링 스탑(trailing_stop_pct=3.0)** = "고점에서 3% 빠지면 매도"(이익을 따라 올라가는 손절선).
  - **max_position_pct(0.0~1.0)** = 한 번에 자본의 최대 몇 %까지(0.5 = 50%).
- 주의: 이 클래스 필드는 `max_position_**pct**` 인데, **schema 쪽 `RiskSchema` 는 `max_position_**size**`** 라는 다른 이름을 씁니다(아래 converters B 참고). 이름 불일치는 converters 의 `_convert_risk_*` 가 흡수합니다.

### B-2. `to_dict` — 선언적 형태로 펼치기 — `risk.py: L36-L52`
```python
# L36-L52
def to_dict(self) -> Dict[str, Any]:
    return {
        "stop_loss":     {"enabled": self.stop_loss_pct is not None,
                          "percent": self.stop_loss_pct or 0},
        "take_profit":   {"enabled": self.take_profit_pct is not None,
                          "percent": self.take_profit_pct or 0},
        "trailing_stop": {"enabled": self.trailing_stop_pct is not None,
                          "percent": self.trailing_stop_pct or 0},
        "max_position_pct": self.max_position_pct,
    }
```
- **무엇을**: `5.0` 같은 납작한 값을 **`{"enabled": True, "percent": 5.0}`** 형태로 펼침. YAML/선언적 표현과 맞추기 위함.
- `enabled = (값 is not None)` — 값이 있으면 켜짐. `percent = 값 or 0` — None 이면 0 으로(켜진 적 없으면 0%).
- 초보 함정: `self.stop_loss_pct or 0` 은 **값이 0.0 이어도 0** 이라 무방하지만, 일반적으로 `or` 폴백은 "0/빈문자/False 도 폴백 발동" 이라는 점을 기억(여기선 None 만 의미 있어 안전).

### B-3. `from_dict` — 다시 납작하게 — `risk.py: L54-L66`
```python
# L54-L66
@classmethod
def from_dict(cls, data: Dict[str, Any]) -> RiskManagement:
    stop_loss = data.get("stop_loss", {})
    take_profit = data.get("take_profit", {})
    trailing_stop = data.get("trailing_stop", {})
    return cls(
        stop_loss_pct=stop_loss.get("percent") if stop_loss.get("enabled") else None,
        take_profit_pct=take_profit.get("percent") if take_profit.get("enabled") else None,
        trailing_stop_pct=trailing_stop.get("percent") if trailing_stop.get("enabled") else None,
        max_position_pct=data.get("max_position_pct", 1.0),
    )
```
- `to_dict` 의 **정확한 역연산**. `{"enabled":True,"percent":5}` → `5`, `enabled=False` → `None`.
- `if ...get("enabled")` 가 핵심: **꺼져 있으면(`enabled=False`) percent 가 적혀 있어도 None** 으로(끈 설정을 살리지 않음).

### B-4. `is_empty` — `risk.py: L68-L74`
```python
# L68-L74
def is_empty(self) -> bool:
    return (
        self.stop_loss_pct is None
        and self.take_profit_pct is None
        and self.trailing_stop_pct is None
    )
```
- 손절·익절·트레일링이 **셋 다 None 이면 "리스크 설정 없음"**. 주의: **`max_position_pct` 는 빈 판정에서 제외** — 항상 값(기본 1.0)이 있으니 빈 여부에 안 넣음. codegen 등이 "리스크 코드를 생성할지" 판단할 때 쓰기 좋은 헬퍼.

---

## C. `param_resolver.py` — `$참조` 치환 엔진

> `ParamResolver` 클래스 하나, 전부 `@classmethod`(인스턴스 안 만들고 `ParamResolver.resolve(...)` 로 바로 호출). `converters.py` 의 YAML 경로(`from_yaml_file`·`_convert_yaml_condition`)가 이걸 부릅니다.

### C-1. docstring 의 사용법이 곧 명세 — `param_resolver.py: L1-L20`
```python
# L11-L19 (docstring 발췌)
#   value = ParamResolver.resolve("$period", params)            # → 14
#   resolved = ParamResolver.resolve({"period": "$period"}, params)  # → {"period": 14}
#   resolved = ParamResolver.resolve("$period", params, {"period": 21})  # → 21 (오버라이드)
```
- 세 줄이 이 파일의 전부를 요약: **① 단일 치환 ② 구조(dict/list) 통째 치환 ③ 오버라이드 우선**.

### C-2. 클래스 + 핵심 정규식 — `param_resolver.py: L28-L32`
```python
# L28-L32
class ParamResolver:
    # $param_name 패턴 (전체 문자열이 $로 시작하는 파라미터 참조인 경우)
    PATTERN = re.compile(r'^\$([a-zA-Z_][a-zA-Z0-9_]*)$')
```
- **무엇을**: "문자열 **전체**가 정확히 `$이름` 형태인가" 만 매치. `^...$` 로 양끝을 묶었으므로 `"RSI > $high"` 같은 **부분 포함은 매치 안 됨**(통째로 `$이름` 일 때만).
- 이름 규칙: 첫 글자는 영문/`_`, 이후 영문/숫자/`_`. 즉 `$3day` 는 매치X.
- 초보 포인트: `re.compile` 을 **클래스 변수로 한 번만** 컴파일 → 매번 새로 컴파일하는 비용 절약.

### C-3. `resolve` — 재귀 치환의 심장 — `param_resolver.py: L34-L90`
```python
# L62-L90
overrides = overrides or {}

if isinstance(value, str):
    match = cls.PATTERN.match(value)
    if match:
        name = match.group(1)
        if name in overrides:          # ① 오버라이드 최우선
            return overrides[name]
        if name in params:             # ② params 에서 조회
            param_def = params[name]
            if isinstance(param_def, dict):
                return param_def.get("default")   # {"default":14,...} → 14
            return param_def                       # 직접값 14 → 14
        raise ValueError(f"Unknown param reference: ${name}")
    return value                       # $로 시작 안 하는 일반 문자열은 그대로

if isinstance(value, dict):
    return {k: cls.resolve(v, params, overrides) for k, v in value.items()}
if isinstance(value, list):
    return [cls.resolve(v, params, overrides) for v in value]

return value                           # 숫자·None 등은 그대로
```
- **우선순위가 핵심**: ① `overrides`(사용자가 바꾼 값) → ② `params`의 default → ③ 없으면 **에러**(`Unknown param reference`). 오타·미정의 참조를 조용히 넘기지 않고 잡아냅니다.
- **두 형태 모두 처리**: `params[name]` 이 dict 면 `.get("default")`, 아니면 직접값 그대로(사전지식 4).
- **재귀**가 우아함: 입력이 dict 면 각 value 를, list 면 각 원소를 `resolve` 로 다시 돌림 → **중첩 구조 통째로** 치환. 문자열이지만 `$` 형태가 아니면 손대지 않고 반환, 숫자/None 도 그대로.
- 초보 함정: 매치되는 건 **"순수 `$이름`"** 뿐. `"$a+$b"` 처럼 식 안에 끼면 치환 안 됨(이 라이브러리는 참조를 통째 값으로만 씀).

### C-4. `resolve_indicators` — 지표 묶음 일괄 치환 — `param_resolver.py: L92-L121`
```python
# L115-L121
result = []
for ind in indicators:
    new_ind = dict(ind)
    if "params" in ind:
        new_ind["params"] = cls.resolve(ind["params"], params, overrides)
    result.append(new_ind)
return result
```
- 지표 리스트의 각 지표에서 **`params` 만** `$치환`. `new_ind = dict(ind)` 로 **원본을 복사**해서 건드림(원본 불변 유지).
- 즉 `[{"id":"rsi","params":{"period":"$period"}}]` → `[{"id":"rsi","params":{"period":14}}]`.

### C-5. `resolve_conditions` — 조건의 value·compare_to 치환 — `param_resolver.py: L123-L157`
```python
# L146-L157
for cond in conditions:
    new_cond = dict(cond)
    if "value" in cond and cond["value"] is not None:
        new_cond["value"] = cls.resolve(cond["value"], params, overrides)
    if "compare_to" in cond and cond["compare_to"] is not None:
        resolved = cls.resolve(cond["compare_to"], params, overrides)
        new_cond["compare_to"] = resolved
    result.append(new_cond)
```
- 조건에서 **`value`(임계값)와 `compare_to`(비교 대상)** 두 필드를 치환. `compare_to` 는 **숫자(`$oversold`→30)일 수도, 지표 alias(`"sma_long"`, $ 없는 일반 문자열이라 그대로)일 수도** 있어 둘 다 안전하게 통과.
- 참고: 실제 `converters.from_yaml_file` 경로는 이 메서드 대신 `resolve` 를 직접 호출(아래 D-2/D-7 참고). 이 메서드는 "리스트 일괄 처리"용 보조 API.

### C-6. `extract_param_refs` — 어떤 참조들이 쓰였나 — `param_resolver.py: L159-L186`
```python
# L173-L186
refs = []
if isinstance(value, str):
    match = cls.PATTERN.match(value)
    if match:
        refs.append(match.group(1))
elif isinstance(value, dict):
    for v in value.values():
        refs.extend(cls.extract_param_refs(v))
elif isinstance(value, list):
    for v in value:
        refs.extend(cls.extract_param_refs(v))
return refs
```
- 구조를 재귀로 훑어 **사용된 모든 `$이름`을 수집**(`$` 제외한 이름들). 예: `{"a":"$foo","b":"$bar"}` → `["foo","bar"]`.
- 용도: "이 전략이 어떤 파라미터를 참조하는가"를 역으로 알아낼 때(문서화·검증·UI 자동노출).

### C-7. `validate_refs` — 참조 유효성 사전 검증 — `param_resolver.py: L188-L229`
```python
# L210-L229
errors = []
available = set(params.keys())

def check(v: Any, ctx: str) -> None:
    if isinstance(v, str):
        match = cls.PATTERN.match(v)
        if match:
            name = match.group(1)
            if name not in available:
                err_ctx = f"{ctx}: " if ctx else ""
                errors.append(f"{err_ctx}Unknown param reference: ${name}")
    elif isinstance(v, dict):
        for k, sub_v in v.items():
            check(sub_v, f"{ctx}.{k}" if ctx else k)
    elif isinstance(v, list):
        for i, sub_v in enumerate(v):
            check(sub_v, f"{ctx}[{i}]" if ctx else f"[{i}]")

check(value, context)
return errors
```
- **무엇을**: `resolve` 가 "치환하다 에러로 터지는" 것과 달리, **터지기 전에 미리** 모든 참조가 `params` 에 정의됐는지 검사 → **에러 메시지 리스트**로 모아 반환.
- 내부 `check` 가 **경로(ctx)를 누적**: `entry.conditions[0].value` 처럼 **어디서** 잘못됐는지까지 알려줌(`{ctx}.{k}`, `{ctx}[{i}]`). 디버깅 친화.
- `resolve`(즉시 실패) vs `validate_refs`(전수 수집)의 역할 분담을 기억.

---

## D. `converters.py` — 4입력 → `StrategySchema` 번역실 (이 묶음의 중심)

> 4개의 공개 진입점(`from_preset`/`from_yaml_file`/`from_definition`/`from_dict`)과 7개의 내부 헬퍼(`_convert_*`/`_normalize_operator`). **우리 시스템이 실제로 쓰는 건 `from_definition`**(`runner.py:176`).

### D-1. import — schema 와의 연결 지점 — `converters.py: L12-L34`
```python
# L16-L34
from kis_backtest.core.schema import (
    CandlestickSchema, ConditionSchema, CompositeConditionSchema,
    IndicatorSchema, OperatorType, RiskSchema, StrategySchema,
    PRICE_FIELDS, parse_condition, parse_indicators,
)
from kis_backtest.core.param_resolver import ParamResolver

if TYPE_CHECKING:
    from kis_backtest.strategies.base import BaseStrategy
    from kis_backtest.core.strategy import StrategyDefinition
    from kis_backtest.core.condition import Condition, CompositeCondition
    from kis_backtest.file.schema import KisStrategyFile
```
- **이 import 블록이 곧 "이 파일의 연결망"**:
  - `schema` 에서 결과 부품(`*Schema`, `OperatorType`)과 **이미 만들어진 파서 `parse_condition`/`parse_indicators`** 를 가져옴 → `from_definition`/`from_dict` 는 이 파서에 위임(바퀴 재발명 안 함).
  - `ParamResolver` 를 가져와 YAML 경로에서 `$치환`.
- `TYPE_CHECKING` 블록: `BaseStrategy`·`StrategyDefinition`·`KisStrategyFile` 은 **타입힌트 용도로만** import(실행 시 import 안 함) → **순환 import 회피**. 그래서 함수 시그니처의 타입이 `"BaseStrategy"` 처럼 **문자열**(forward reference).
- 초보 포인트: `from_yaml_file` 의 입력 `KisStrategyFile` 은 `file/` 패키지 것 → `00_overview.md` 가 `from_yaml_file` 을 "file 에 의존하는 진입점(우리 미사용)"이라 분류한 근거.

### D-2. `from_preset` — 프리셋 객체 → schema — `converters.py: L37-L74`
```python
# L54-L74
indicators = _convert_indicators_from_preset(strategy.indicators())
entry = _convert_condition_from_preset(strategy.entry_condition())
exit  = _convert_condition_from_preset(strategy.exit_condition())
risk  = _convert_risk_from_preset(strategy.risk_management())

return StrategySchema(
    id=strategy.id, name=strategy.name, category=strategy.category,
    description=strategy.description,
    indicators=indicators, entry=entry, exit=exit, risk=risk,
    params=getattr(strategy, 'params', {}) if hasattr(strategy, 'params') else {},
)
```
- **무엇을**: `BaseStrategy`(preset, `00_overview.md` 5번) 인스턴스의 메서드(`indicators()`·`entry_condition()`·…)를 호출해 결과를 schema 부품으로 변환.
- preset 은 `Indicator`/`Condition` **객체**를 돌려주므로 `_convert_*_from_preset` 헬퍼가 객체→스키마 변환(아래 D-6, D-8).
- `params` 추출이 방어적: `hasattr` 로 존재 확인 후 `getattr(..., {})`. preset 마다 `params` 속성 유무가 달라서.

### D-3. `from_yaml_file` — YAML → schema (`$치환` 발생) — `converters.py: L77-L149`
```python
# L100-L113
params = strategy_file.strategy.params
indicators = []
for ind in strategy_file.strategy.indicators:
    resolved_params = ParamResolver.resolve(ind.params, params, param_overrides)
    indicators.append(IndicatorSchema(
        id=ind.id, alias=ind.alias or ind.id,
        name=ind.name, params=resolved_params, output=ind.output,
    ))
```
```python
# L125-L149 (조건·리스크·조립 발췌)
entry = _convert_condition_group(strategy_file.strategy.entry, params, param_overrides)
exit  = _convert_condition_group(strategy_file.strategy.exit,  params, param_overrides)
risk  = _convert_risk_from_yaml(strategy_file.risk)
return StrategySchema(
    id=strategy_file.strategy.id, name=strategy_file.metadata.name,
    ...,
    params=params,                       # 원본 param 정의 유지
    metadata={"author": strategy_file.metadata.author,
              "tags": strategy_file.metadata.tags},
    version=strategy_file.version,
)
```
- **여기서 `ParamResolver.resolve(ind.params, params, param_overrides)` 호출** → 지표의 `{"period":"$period"}` 가 실제 숫자로(C-3). `param_overrides` 가 있으면 그 값 우선.
- `alias=ind.alias or ind.id` — 별명 없으면 id 를 별명으로(폴백). `name=ind.name` 주석(L110): UI·리포트용 표시 이름 전달.
- 조립 시 **`params=params`(치환 전 원본 정의)를 유지** — 결과 스키마는 "치환된 지표 + 원본 파라미터 정의"를 둘 다 보존(재현·재조정 가능).
- 캔들스틱(L115-122): `strategy.candlesticks` 가 있으면 `CandlestickSchema` 로(없을 수 있어 `hasattr` 가드).

### D-4. `from_definition` — ★우리가 쓰는 경로 — `converters.py: L152-L185`
```python
# L163-L185
indicators = parse_indicators(definition.indicators)
entry = parse_condition(definition.entry)
exit  = parse_condition(definition.exit)
risk  = RiskSchema.from_dict(definition.risk_management) if definition.risk_management else None
return StrategySchema(
    id=definition.id, name=definition.name, category=definition.category,
    description=definition.description,
    indicators=indicators, entry=entry, exit=exit, risk=risk,
    params=definition.params, metadata=definition.metadata, version=definition.version,
)
```
- **무엇을**: `StrategyDefinition`(A절, dict 기반) → schema. **`runner.py:176` 이 호출하는 실제 경로**(`00_overview.md` ✅ 핵심사용).
- 다른 진입점과 달리 **`parse_indicators`/`parse_condition`(schema.py 제공)에 통째 위임** — definition 의 indicators/entry/exit 가 이미 dict 형태라 schema 의 파서가 바로 소화. converters 는 얇은 어댑터.
- risk 는 `RiskSchema.from_dict(...)`(schema 의 RiskSchema) — **risk.py 의 `RiskManagement` 가 아님**에 주의. definition.risk_management 는 dict 이고, 이걸 schema 쪽 RiskSchema 로 변환. (risk.py 의 `RiskManagement.to_dict()` 출력 형태와 호환되는 dict.)
- `$치환`이 **여기엔 없음** — definition 단계에서 이미 값이 정해졌다고 보거나, 파서 내부가 처리. (우리 경로는 preset→definition 조립 시 값이 확정됨.)

### D-5. `from_dict` — API dict → schema — `converters.py: L188-L222`
```python
# L199-L222
indicators = parse_indicators(data.get("indicators", []))
entry = parse_condition(data.get("entry", {}))
exit  = parse_condition(data.get("exit", {}))
risk_data = data.get("risk_management") or data.get("risk", {})
risk = RiskSchema.from_dict(risk_data) if risk_data else None
return StrategySchema(
    id=data.get("id", ""), name=data.get("name", ""),
    category=data.get("category", "custom"), description=data.get("description", ""),
    indicators=indicators, entry=entry, exit=exit, risk=risk,
    params=data.get("params", {}), metadata=data.get("metadata", {}),
    version=data.get("version", "1.0"),
)
```
- `from_definition` 과 거의 쌍둥이지만 **입력이 순수 dict**(API JSON). 모든 필드 `data.get(키, 기본값)` 으로 누락 허용.
- `risk_data = data.get("risk_management") or data.get("risk", {})` — **두 키 이름 모두 허용**(`risk_management` 우선, 없으면 `risk`). API 입력의 다양성 흡수.

> 네 진입점 한눈 비교:
> | 진입점 | 입력 | 지표/조건 변환 | $치환 | 우리 사용 |
> |---|---|---|---|---|
> | `from_preset` | `BaseStrategy` 객체 | `_convert_*_from_preset`(객체→스키마) | 없음 | 간접 |
> | `from_yaml_file` | `KisStrategyFile` | `_convert_condition_group`/직접 IndicatorSchema | **있음**(resolve) | ⚪ |
> | `from_definition` | `StrategyDefinition` dict | `parse_*`(schema 위임) | 없음 | ✅ **runner** |
> | `from_dict` | 순수 dict | `parse_*`(schema 위임) | 없음 | 간접 |

### D-6. `_convert_indicators_from_preset` — `converters.py: L229-L254`
```python
# L236-L253
for ind in indicators:
    if hasattr(ind, 'id') and hasattr(ind, 'alias'):       # Indicator 객체
        result.append(IndicatorSchema(
            id=ind.id, alias=ind.alias,
            params=ind.params if hasattr(ind, 'params') else {},
            output=ind.output if hasattr(ind, 'output') else "value",
        ))
    elif isinstance(ind, dict):                            # to_dict() 결과 dict
        result.append(IndicatorSchema(
            id=ind.get("id", ""), alias=ind.get("alias"),
            params=ind.get("params", {}), output=ind.get("output", "value"),
        ))
```
- **두 입력 형태 모두 처리**: `Indicator` 객체(`hasattr`로 판별)와 dict 둘 다. `output` 기본값 `"value"`(지표의 어떤 출력 필드를 쓸지; 단일출력 지표면 "value").
- 객체인지 dict 인지 모를 때 `hasattr`/`isinstance` 로 갈라 처리하는 **방어적 변환**의 전형(사전지식 5).

### D-7. `_convert_condition_from_preset` — 객체 조건 → 스키마 — `converters.py: L257-L303`
```python
# L266-L303
if isinstance(condition, CompositeCondition):                 # 복합조건이면 재귀
    return CompositeConditionSchema(
        logic=condition.logic,
        conditions=[_convert_condition_from_preset(c) for c in condition.conditions],
    )
left = condition.left                                          # 왼쪽 = 지표
if hasattr(left, 'alias'):
    indicator = left.alias
    indicator_output = getattr(left, 'output', 'value')
else:
    indicator = str(left); indicator_output = "value"
right = condition.right                                        # 오른쪽 = 지표 or 숫자
compare_to = None; compare_output = "value"; value = None
if hasattr(right, 'alias'):
    compare_to = right.alias
    compare_output = getattr(right, 'output', 'value')
elif isinstance(right, (int, float)):
    value = float(right)
operator = _normalize_operator(condition.operator)            # 연산자 표준화
return ConditionSchema(operator=operator, indicator=indicator,
    indicator_output=indicator_output, compare_to=compare_to,
    compare_output=compare_output, value=value)
```
- **핵심 분기**: 오른쪽 피연산자가 **지표**면 `compare_to`(alias) 로, **숫자**면 `value`(float) 로. `SMA(5) > SMA(20)` 은 compare_to="sma_long", `RSI(14) < 30` 은 value=30.0.
- `CompositeCondition`(AND/OR 묶음)이면 **자기 자신을 재귀 호출**해 자식 조건들도 변환 → 조건 트리 통째 스키마화. (`00_overview.md` 의 condition `&`/`|` 오버로딩 결과가 이 트리.)
- 연산자는 `_normalize_operator` 로 표준 `OperatorType` 화(D-10).

### D-8. `_convert_condition_group` — YAML 조건 그룹 — `converters.py: L306-L338`
```python
# L321-L338
if not group.conditions:                                   # 빈 그룹 → 기본조건
    return ConditionSchema(operator=OperatorType.GREATER_THAN, indicator="price", value=0)
if len(group.conditions) == 1:                             # 단일
    return _convert_yaml_condition(group.conditions[0], params, overrides)
return CompositeConditionSchema(                           # 복수 → 복합
    logic=group.logic,
    conditions=[_convert_yaml_condition(c, params, overrides) for c in group.conditions],
)
```
- YAML 조건 그룹을 **개수로 분기**: 0개=더미 기본조건(`price > 0`, 항상참에 가까움), 1개=단일, 2개+=복합(`logic` 으로 AND/OR).
- 빈 그룹에 더미를 넣는 이유: 다운스트림(codegen)이 "조건 없음" 으로 터지지 않게 하는 **안전 기본값**.

### D-9. `_convert_yaml_condition` — YAML 단일조건(치환 포함) — `converters.py: L341-L414`
```python
# L358-L366 (캔들 / 연산자)
if hasattr(cond, 'candlestick') and cond.candlestick:       # 캔들패턴 조건
    return ConditionSchema(candlestick=cond.candlestick,
                           signal=getattr(cond, 'signal', None) or "detected")
operator = _normalize_operator(cond.operator) if cond.operator else OperatorType.GREATER_THAN
```
```python
# L377-L400 (compare_to / value 치환 — 까다로운 부분)
if isinstance(cond.compare_to, str):
    resolved = ParamResolver.resolve(cond.compare_to, params, overrides)
    if isinstance(resolved, (int, float)):
        value = float(resolved)          # $param 이 숫자였다 → value
    else:
        compare_to = resolved            # 지표 alias 등 문자열 → compare_to
elif isinstance(cond.compare_to, (int, float)):
    value = float(cond.compare_to)

if cond.value is not None:               # value 가 명시되면 우선
    resolved_value = ParamResolver.resolve(cond.value, params, overrides)
    if isinstance(resolved_value, (int, float)):
        value = float(resolved_value)
    elif isinstance(resolved_value, str):
        try:    value = float(resolved_value)     # 숫자문자열 → float
        except ValueError:                        # 변환불가 → 지표 alias 로 간주
            compare_to = resolved_value; value = None
    compare_to = None if value is not None else compare_to   # value 있으면 compare_to 비움
```
- **이 파일에서 가장 까다로운 함수**. `compare_to` 가 문자열이면 **`$치환` 후 숫자인지 문자열인지로 갈라** value/compare_to 중 하나에 배치(C-3 의 resolve 결과 타입에 의존).
- `cond.value` 가 따로 있으면 그게 **우선**이고, 마지막 줄 `compare_to = None if value is not None else compare_to` 로 **둘 중 하나만 살림**(value 확정 시 compare_to 제거) → 모순된 조건 방지.
- 캔들스틱 조건은 별도 분기로 일찍 반환(`signal` 기본 "detected"). `compare_scalar`/`compare_operation`(L402-403) 같은 부가 필드는 `getattr` 로 있으면 통과.

### D-10. `_convert_risk_from_preset` / `_convert_risk_from_yaml` — `converters.py: L417-L465`
```python
# L417-L435 (preset)
if risk is None: return None
if hasattr(risk, 'to_dict'):  risk_dict = risk.to_dict()   # RiskManagement → dict
elif isinstance(risk, dict):  risk_dict = risk
else: return None
return RiskSchema(
    stop_loss_pct=risk_dict.get("stop_loss_pct"),
    take_profit_pct=risk_dict.get("take_profit_pct"),
    trailing_stop_pct=risk_dict.get("trailing_stop_pct"),
    max_position_size=risk_dict.get("max_position_size"),
)
```
```python
# L438-L465 (yaml — enabled 게이트)
stop_loss = getattr(risk, 'stop_loss', None)               # RiskConfig 의 중첩 dict
...
return RiskSchema(
    stop_loss_pct=(stop_loss.get("percent") if stop_loss and stop_loss.get("enabled") else None),
    take_profit_pct=(take_profit.get("percent") if take_profit and take_profit.get("enabled") else None),
    trailing_stop_pct=(trailing_stop.get("percent") if trailing_stop and trailing_stop.get("enabled") else None),
    max_position_size=getattr(risk, 'max_position_size', None),
)
```
- **두 리스크 변환의 차이**:
  - preset 경로는 `RiskManagement`(risk.py)의 `to_dict()` 를 부르거나 dict 를 받아 **납작한 키**(`stop_loss_pct`)에서 직접 꺼냄. ⚠️ 단, 여기 `risk_dict.get("stop_loss_pct")` 는 risk.py 의 `to_dict()` 가 내는 **중첩**(`{"stop_loss":{"percent":...}}`)과 키가 다름 — 즉 이 분기는 **이미 납작한 키를 가진 dict**(또는 그런 형태의 to_dict 구현)를 가정. risk.py 의 to_dict 와는 키 형태가 어긋날 수 있으니 입력 출처에 주의(함정 참고).
  - yaml 경로는 `{"enabled":..., "percent":...}` **중첩 + enabled 게이트**(꺼져 있으면 None). risk.py 의 `from_dict`(B-3)와 같은 철학.
- 공통: 결과는 항상 **schema 의 `RiskSchema`**, 그리고 최대비중 키는 **`max_position_size`**(risk.py 의 `max_position_pct` 와 이름 다름 — converters 가 경계에서 흡수).

### D-11. `_normalize_operator` — 연산자 표준화 — `converters.py: L468-L494`
```python
# L468-L494
from kis_backtest.core.schema import OPERATOR_ALIASES
if isinstance(op, OperatorType):       # 이미 표준이면 그대로
    return op
op_lower = op.lower().strip()
if op_lower in OPERATOR_ALIASES:       # ① 별칭 맵 (">", "gt", "crosses_above" …)
    return OPERATOR_ALIASES[op_lower]
try:
    return OperatorType(op_lower)      # ② 정식 enum 값 그대로 ("cross_above")
except ValueError:
    pass
normalized = op_lower.replace("crosses_", "cross_")   # ③ crosses_→cross_ 정규화
try:
    return OperatorType(normalized)
except ValueError:
    pass
raise ValueError(f"Unknown operator: {op}")           # ④ 끝내 모르면 에러
```
- **무엇을**: 사람이 다양하게 적은 연산자(`">"`, `"gt"`, `"crosses_above"`, `"cross_above"`)를 **단 하나의 `OperatorType` Enum** 으로 수렴. `00_overview.md` 의 "operator 키 통일 / crosses_above→cross_above 자동정규화" 가 바로 여기.
- 4단 폴백: ①별칭맵(`OPERATOR_ALIASES`, schema.py L41) → ②정식값 → ③`crosses_`→`cross_` 치환 → ④그래도 모르면 `ValueError`. (schema.py 확인: `OPERATOR_ALIASES` 에 `">"`, `"gt"`, `"crosses_above"` 등이 `OperatorType.GREATER_THAN`/`CROSS_ABOVE` 로 매핑됨.)
- 이 함수가 **converters 와 schema 의 연결 핵심**: 모든 조건 변환이 끝에 이걸 거쳐 연산자를 표준화하므로, codegen 은 오직 10종 `OperatorType` 만 상대하면 됩니다.

---

## ⚠️ 함정·주의 (코드에 박힌 교훈)

1. **이름 불일치 `max_position_pct` vs `max_position_size`** — risk.py 의 dataclass 필드는 `max_position_pct`(0~1), schema 의 `RiskSchema` 는 `max_position_size`. converters 의 `_convert_risk_*` 가 경계에서 변환하지만, **두 이름을 혼동하면 값이 누락**될 수 있음. (D-10)
2. **risk preset 변환의 키 형태 가정** — `_convert_risk_from_preset` 은 `risk_dict.get("stop_loss_pct")`(납작) 를 읽는데, risk.py 의 `to_dict()` 는 `{"stop_loss":{"percent":...}}`(중첩) 를 냄. 입력 dict 의 형태에 따라 손절값이 None 으로 떨어질 수 있으니 **출처별 형태를 확인**. (B-2 / D-10)
3. **`$참조`는 통째일 때만 치환** — `param_resolver.PATTERN` 은 `^\$이름$`. `"RSI>$x"` 같은 부분 포함·수식은 치환 안 됨. 참조는 **필드 값 전체가 `$이름`** 이어야 함. (C-2)
4. **미정의 참조의 두 갈래** — `resolve` 는 **즉시 ValueError**, `validate_refs` 는 **수집만**. 사용자 입력 검증은 먼저 `validate_refs` 로 모아 보여주고, 확정 후 `resolve`. (C-3 / C-7)
5. **frozen 객체는 못 고침** — `StrategyDefinition` 수정은 반드시 `with_params`(사본 반환). `def.params["x"]=...` 같은 직접 변경은 에러. (A-5)
6. **`x or 0`/`x or {}` 폴백** — risk·converters 곳곳의 `value or 0` 은 None 뿐 아니라 0/빈값도 폴백시킴. 여기선 의미상 안전하지만 패턴 자체는 0.0 을 의미 있게 다뤄야 하는 곳에선 위험.
7. **빈 조건 더미** — `_convert_condition_group` 의 빈 그룹은 `price > 0` 더미. "조건을 안 줬는데 항상 매수"처럼 보일 수 있으니 의도 확인. (D-8)
8. **converters 는 검증을 위임** — 타입/제약 검증은 대부분 목적지 `StrategySchema`(Pydantic)와 `parse_*`, `validate_params`(strategy.py)가 함. converters 자체는 "형태 변환"에 집중(엄격검증 아님).

---

## 🚀 고도화 아이디어 (강의·개선 버전용)

- **risk 이름 통일**: `max_position_pct` ↔ `max_position_size` 불일치를 한쪽으로 통일하거나, 변환 지점에 단위 주석/테스트를 추가해 회귀 방지.
- **risk preset 키 어댑터 정리**: `_convert_risk_from_preset` 이 납작/중첩 dict 를 **둘 다** 받아들이도록 정규화 한 줄 추가(risk.py `to_dict` 중첩과 호환).
- **`$참조` 표현식 확장**: 현재는 통째 치환만. `f"${'{'}expr{'}'}"` 류 부분 보간/간단 산식(`$period*2`)을 지원하면 전략 표현력↑(단, 보안·복잡도 트레이드오프 명시).
- **`validate_refs` 를 진입점에 결합**: `from_yaml_file`/`from_dict` 초입에서 `validate_refs` 를 먼저 돌려 **모든 잘못된 참조를 한 번에** 사용자에게 보고(현재는 resolve 가 첫 에러에서 중단).
- **converters 통합 디스패처**: `from_any(input)` 하나가 타입을 보고 4경로로 분기하면 호출부가 단순해짐(`runner` 는 이미 `from_definition` 고정이라 선택).
- **연산자 맵 단일화 검증 테스트**: `_normalize_operator` 가 `OPERATOR_ALIASES` + Enum 전체를 빠짐없이 커버하는지 표 기반 파라미터라이즈드 테스트.
- **StrategyDefinition 자가검증**: `from_dict` 직후 `validate_params(get_default_params())` 를 돌려 정의 자체의 min/max 모순(예: default 가 범위 밖)을 조기 발견.

---

## 📚 용어사전 (이 4파일 한정)

| 용어 | 뜻 |
|---|---|
| **`@dataclass`** | 필드 선언만으로 생성자·repr·비교를 자동 생성하는 데코레이터 |
| **`frozen=True`** | 생성 후 수정 불가(불변). 수정하려면 사본을 만들어야 함 |
| **`field(default_factory=...)`** | 가변 기본값(list/dict)을 인스턴스마다 새로 만들게 하는 안전장치 |
| **`asdict`** | dataclass 를 중첩 dict 로 통째 변환 |
| **`$param_name` (참조)** | 전략 정의 안의 빈칸. 나중에 `params`/`overrides` 값으로 치환됨 |
| **`ParamResolver.resolve`** | `$참조`를 실제 값으로 치환(재귀, overrides 우선) |
| **`validate_refs` vs `resolve`** | 전자는 잘못된 참조를 모아 보고, 후자는 즉시 ValueError |
| **`StrategyDefinition`** | 전략 한 개의 불변 표준 정의(dict 기반, 느슨) |
| **`with_params`** | frozen 정의의 `default` 만 바꾼 새 정의(사본) 반환 |
| **`RiskManagement`** | 손절·익절·트레일링·최대비중 dataclass. `to_dict`↔`from_dict` 왕복 |
| **`enabled` 게이트** | 리스크 항목이 켜졌을 때만 percent 를 살리는 패턴 |
| **`from_preset/from_yaml_file/from_definition/from_dict`** | 4입력 → `StrategySchema` 진입점. 우리는 `from_definition` 사용 |
| **`parse_indicators`/`parse_condition`** | schema.py 가 제공하는 파서. definition/dict 경로가 위임 |
| **`_normalize_operator`** | 다양한 연산자 표기를 `OperatorType` Enum 1종으로 수렴 |
| **`OperatorType`** | 표준 연산자 Enum(`greater_than`·`cross_above`·`between` 등 10종) |
| **`OPERATOR_ALIASES`** | `">"`,`"gt"`,`"crosses_above"` 등 별칭→`OperatorType` 매핑(schema.py) |
| **`ConditionSchema` / `CompositeConditionSchema`** | 단일/복합 조건의 검증된 스키마(AND·OR 트리) |
| **`RiskSchema`** | schema 쪽 리스크 모델(키: `max_position_size`). risk.py 의 RiskManagement 와 구별 |
| **duck typing(`hasattr`/`getattr`)** | "객체냐 dict 냐" 모를 때 속성 유무로 갈라 처리하는 방어적 변환 |
| **`TYPE_CHECKING` import** | 타입힌트 전용 import(실행 시 제외) → 순환 import 회피 |
| **Single Source of Truth** | 모든 입력이 `StrategySchema` 한 형태로 수렴(불일치 방지) |
</content>
</invoke>
