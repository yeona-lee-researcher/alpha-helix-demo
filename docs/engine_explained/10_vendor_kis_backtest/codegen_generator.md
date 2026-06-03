# `codegen/generator.py` — 전략 설계도(Schema)를 Lean 실행 코드로 자동 번역 (완전 라인별 해설)

> 원본: `analytics/app/lean/kis_backtest/codegen/generator.py` (1244줄)
> 형식 기준: 모범 [`01_backtest/vbt_engine.md`](../01_backtest/vbt_engine.md) · [`README.md`](../README.md) "3. 공통 형식" · 벤더 개요 [`10_vendor_kis_backtest/00_overview.md`](00_overview.md).
> 위치: `kis_backtest/` 라이브러리에서 ✅**핵심 사용** 부품. "전략 정의 → Lean 코드" 단계 그 자체.

---

## 📌 이 파일 한눈에

이 파일은 **"전략 설계도 → 실행 코드 자동 번역기(컴파일러)"** 입니다.

들어오는 것: **추상적인 전략 정의**(`StrategySchema` — "RSI(14)가 30 아래로 내려가면 사고, 70 위로 올라가면 팔아라" 같은 규칙 + 손절/익절 + 종목·기간).
나오는 것: **그 규칙을 그대로 실행하는 Lean(QuantConnect) `QCAlgorithm` 파이썬 소스 코드 한 덩어리(문자열)**.

비유: 이 파일은 **레고 설명서를 "조립 로봇이 읽을 기계어"로 번역하는 번역기**입니다. 사람이 그린 추상적인 전략 도면(Schema)을 받아서, Lean 이라는 조립 로봇이 그대로 따라 할 수 있는 단계별 명령(파이썬 코드 문자열)을 한 줄 한 줄 찍어냅니다. **직접 백테스트를 돌리지는 않습니다** — 코드를 "써주기"만 하고, 실제 실행은 [`lean/executor.py`](../07_lean/executor.md)(Docker 안의 `lean` CLI)가 합니다.

> ⚠️ vbt_engine 과의 결정적 차이: `vbt_engine.py` 는 **값으로 신호를 직접 계산**해 그 자리에서 백테스트를 돌립니다. 이 파일은 **"코드를 생성"** 합니다 — 한 단계 더 추상적입니다. 출력이 숫자가 아니라 **실행 가능한 파이썬 소스 문자열**이라는 점을 계속 기억하세요. (이런 걸 "메타프로그래밍 = 코드를 만드는 코드"라고 부릅니다.)

### 핵심 함수 한눈에 (전체 매핑은 아래 표 참조)

| 함수 | 한 줄 역할 | 비유 |
|---|---|---|
| `__init__(...)` | 어떤 입력이 와도 `StrategySchema` 로 통일 + 지표 검증 + 변수명 충돌 해소 | 번역 작업 전 원고 정리·교정 |
| `generate(...)` | 5개 코드 조각(헤더·데이터클래스·수수료·슬리피지·알고리즘)을 이어붙여 완성본 + **구문검사** | 번역본 최종 조판 + 오타 검사 |
| `_generate_algorithm(...)` | `QCAlgorithm` 클래스 본체(`Initialize`/`OnData`)를 조립 — 이 파일의 알맹이 | 본문 번역 |
| `_generate_condition(...)` 외 5종 | 진입/청산 조건을 `entry_signal = ...` 파이썬 식으로 변환 | 매매 규칙 한 줄 번역 |
| `_generate_indicator_init/_values` | 지표를 Lean 에서 생성·갱신·값추출하는 코드 작성 | 도구 준비·사용 매뉴얼 |
| `_generate_risk_management()` | 손절·익절·트레일링스탑 코드 3종 작성 | 안전장치 부착 |

**누가 호출하나?** → 우리 오케스트레이터 `analytics/app/lean/runner.py` 가 `LeanCodeGenerator(...).generate(...)` 를 불러 Lean 프로젝트의 `main.py` 를 만듭니다(개요 `runner.py:114`). 즉 "프리셋 한 줄 → Lean 백테스트"의 **번역 단계**가 이 파일입니다.

---

## 🧠 사전 지식 (이거 모르면 막힘)

#### 1) 코드 생성(codegen) = "코드를 만드는 코드" (메타프로그래밍)
보통 함수는 **값**을 돌려줍니다(`add(2,3)→5`). 이 파일의 함수들은 **문자열**을 돌려주는데, 그 문자열이 곧 **실행 가능한 파이썬 코드**입니다.
```python
def make():
    return "x = 1 + 2"   # ← 값이 아니라 "코드"를 반환
```
이렇게 만든 코드 문자열을 파일로 저장하면 진짜 프로그램이 됩니다. 이 파일은 처음부터 끝까지 이 일만 합니다.

#### 2) f-string + 삼중따옴표 = 이 파일의 주력 도구
```python
period = 20
code = f'''
self.sma = self.SMA(symbol, {period})
'''
# 결과 문자열: "\nself.sma = self.SMA(symbol, 20)\n"
```
- `f'''...'''` = **여러 줄 문자열** 안에 `{변수}` 를 끼워넣음. 이 파일은 이 패턴으로 Lean 코드를 짭니다.
- ⚠️ **함정 예고**: 생성되는 코드 안에 **진짜 중괄호**가 필요할 때(예: 빈 dict `{}`)는 `{{ }}` 처럼 **두 번** 써야 합니다. f-string 이 `{}` 를 "변수 자리"로 오해하기 때문. 이 파일 곳곳에 `{{}}`, `{{self.strategy_name}}` 가 나오는 이유입니다(L642, L698 등).

#### 3) Lean / QCAlgorithm 의 뼈대 — `Initialize` 와 `OnData`
Lean(QuantConnect)의 전략은 `QCAlgorithm` 을 상속한 클래스이고, **딱 두 개의 메서드**가 핵심입니다.
```
class Algorithm(QCAlgorithm):
    def Initialize(self):   # 한 번 실행: 시작/종료일, 자본금, 종목·지표 등록, 워밍업
        ...
    def OnData(self, data): # 매 봉(매일)마다 실행: 지표 갱신 → 조건 판단 → 매수/매도
        ...
```
- `Initialize` = 경기 시작 전 **준비**(라인업 짜기). `OnData` = 매 **하루**마다 도는 **본 경기 루프**.
- 이 파일의 `_generate_algorithm()` 이 바로 이 두 메서드의 내용을 코드로 짜 넣습니다.

#### 4) PythonData + GetSource = "커스텀 CSV 를 Lean 에 먹이는 방법"
우리 데이터는 야후 파이낸스에서 받아 **CSV 파일**로 만듭니다(`DataConverter`). Lean 에게 "이 CSV 를 읽어"라고 알려주려면 `PythonData` 를 상속한 클래스에서 두 메서드를 구현합니다.
- `GetSource(...)` → **CSV 파일이 어디 있는지 경로**를 반환. (이 파일은 **컨테이너 내부 경로 `/Lean/Data/...`** 를 박아 넣습니다 — Docker 안에서 도는 Lean 이 보는 경로. 메모리 "Lean CLI 운영 사실" 참조.)
- `Reader(...)` → CSV **한 줄을 파싱**해 OHLCV 값을 채움.
- 이 파일에는 `GetSource` 가 **3곳**(KRXEquity·KRXIndex·USEquity) 생성됩니다 — 각각 `equity/krx`, `index/krx`, `equity/usa` 경로.

#### 5) 지표 업데이트 두 방식 — decimal vs TradeBar
Lean 지표는 갱신 방법이 둘로 갈립니다.
- **decimal-only**: 종가 하나만 있으면 됨 → `indicator.Update(time, price)`. (SMA, RSI 등)
- **TradeBar 필요**: 시·고·저·종·거래량 전체가 필요 → `indicator.Update(trade_bar)`. (ATR, 일부 패턴 등 `requires_tradebar=True`)
- 이 파일의 `_get_tradebar_indicator_aliases()` 가 지표를 두 부류로 나눠 각각 다른 갱신 코드를 생성합니다.

#### 6) Schema 의 핵심 부품 (입력이 무엇인지)
`StrategySchema`(`core/schema.py`, Single Source of Truth)는 대략 이렇게 생겼습니다.
```
schema.name / id / description        전략 이름·설명
schema.indicators  : [IndicatorSchema]  쓰는 지표들 (id, alias, params, output)
schema.candlesticks: [CandlestickSchema] 캔들 패턴들
schema.entry / exit: Condition or Composite  진입/청산 규칙 트리
schema.risk        : RiskManagement   손절·익절·트레일링 (%)
```
- `ConditionSchema` = "지표 alias + 연산자 + 비교대상" 한 줄짜리 규칙(예: `rsi < 30`).
- `CompositeConditionSchema` = 여러 조건을 `AND`/`OR` 로 묶은 트리(`conditions` 리스트 + `logic`).
- **alias** = 지표에 붙인 별명(예: `"SMA(단기)"`). 조건이 이 alias 로 지표를 참조합니다.

---

## 🗺 전체 흐름도

```
StrategySchema (또는 StrategyDefinition / BaseStrategy)
   │  지표·조건·리스크·종목·기간이 담긴 추상 전략 정의
   ▼
┌──────────────────────────── LeanCodeGenerator ────────────────────────────┐
│  __init__: 입력 통일(→Schema) · 지표맵 구축 · alias 충돌 해소 · 검증          │
│                                                                            │
│  generate(symbols, start, end):                                            │
│     ┌──────────────┬──────────────┬───────────┬────────────┬────────────┐  │
│     ▼              ▼              ▼           ▼            ▼            │  │
│  _header()   _data_class()   _fee_model()  _slippage()  _algorithm()    │  │
│  (docstring  (KRX/US          (수수료+세금  (호가단위    (QCAlgorithm:   │  │
│   +import)    PythonData)      FeeModel)     슬리피지)    Init+OnData)    │  │
│     │              │              │           │            │            │  │
│     └──────────────┴──────────────┴───────────┴────────────┘            │  │
│                           "\n\n".join → 한 문자열                          │  │
│                           compile(...) 로 ⚠️구문검사                        │  │
└────────────────────────────────────────────────────────────────────────────┘
   │  완성된 Lean 파이썬 소스 (문자열)
   ▼
runner.py → lean/project_manager 가 main.py 로 저장
   ▼
lean/executor → Docker 안 lean CLI 가 /Lean/Data/*.csv 읽어 백테스트
   ▼
result.json → result_formatter → API 응답
```

`_generate_algorithm()` 내부의 조립 순서(OnData 한 봉 처리):
```
OnData(매일):
  워밍업 중이면 skip
  for 종목:
    bar = data[종목]; price = bar.Close
    ① 지표 업데이트 (decimal / TradeBar / 캔들)
    ② 지표 준비(IsReady) 확인 — 안 되면 skip
    ③ 지표값 추출 (rsi = ...Current.Value)
    ④ 커스텀 로직(있으면)
    ⑤ 진입조건 → entry_signal  → 참 & 미보유 → SetHoldings(매수)
    ⑥ 청산조건 + 리스크체크 → exit_signal → 참 & 보유 → Liquidate(매도)
    ⑦ prev_values 업데이트 (다음 봉의 "어제값"으로)
```

---

## 📖 함수 매핑표 + 핵심 라인별 심화

### 함수 매핑표 (1244줄 전체 지도)

| 라인 | 함수 | 역할 | 출력 |
|---|---|---|---|
| L33-L40 | `CodeGenConfig` | 시장·수수료·세금·슬리피지·자본 설정 dataclass | 설정 객체 |
| L64-L108 | `__init__` | 입력 정규화 → Schema · 지표/캔들 맵 · alias 충돌맵 · 검증 | — |
| L110-L125 | `_sanitize_var_name` | alias → 유효 파이썬 식별자(특수문자 `_`, 숫자시작 `ind_`) | 식별자 문자열 |
| L127-L158 | `_build_sanitized_alias_map` / `_get_sanitized_alias` | 서로 다른 alias 가 같은 식별자로 충돌 시 `_2`,`_3` suffix | alias→식별자 맵 |
| L160-L207 | `_validate_indicators` / `_validate_condition_aliases` | 지표 파라미터 검증 + 조건이 참조하는 alias 정합성 | 예외 또는 통과 |
| L209-L232 | `_get_tradebar_indicator_aliases` | 지표를 TradeBar필요/decimal 로 분류(커스텀 제외) | (리스트, 리스트) |
| L234-L282 | `_generate_custom_logic` | BaseStrategy 커스텀 Lean 코드 + 변수 자동 init | (init, logic) 코드 |
| L284-L333 | `_generate_indicator_update_code` | TradeBar 생성 + decimal/TradeBar 지표 갱신 루프 | OnData 갱신 코드 |
| **L335-L374** | **`generate`** | **5조각 조립 + `compile()` 구문검사 — 메인 진입점** | **Lean 코드 전체** |
| L376-L402 | `_generate_header` | docstring + import + 캔들 클래스 import | 헤더 코드 |
| L404-L502 | `_generate_data_class` / `_krx` / `_us` | **PythonData(GetSource·Reader) — 3곳** | 데이터클래스 코드 |
| L504-L516 | `_generate_fee_model` | 매수/매도 수수료 + 매도세 FeeModel | 수수료모델 코드 |
| L518-L551 | `_generate_slippage_model` | KRX 호가단위 기반 슬리피지(켜진 경우만) | 슬리피지모델 코드 |
| **L553-L711** | **`_generate_algorithm`** | **QCAlgorithm: Initialize + OnData 본체 — 알맹이** | **알고리즘 코드** |
| L713-L797 | `_generate_indicator_init` | 지표별 Lean 초기화(커스텀 7종 특수처리) + 워밍업 | init 코드, warmup |
| L799-L840 | `_generate_candlestick_init` / `_values` | 캔들 패턴 초기화·신호값 추출 | 코드 조각 |
| L842-L982 | `_collect_all_indicator_outputs` / `_generate_indicator_values` | 조건이 쓰는 (alias,output) 수집 + 값추출 코드 | 값추출 코드 |
| L984-L1005 | `_generate_prev_update` | 다음 봉용 "어제값" 저장 코드(교차 판정용) | prev 코드 |
| L1007-L1053 | `_generate_condition` / `_single` / `_candlestick_condition` | 조건 → `_signal = ...` 식 (디스패처) | 조건 코드 |
| L1055-L1122 | `_generate_cross_above` / `_below` / `_comparison` | 교차·비교 연산자별 코드(ScaledIndicator 지원) | 조건 코드 |
| L1124-L1145 | `_generate_composite_condition` | AND/OR 복합조건 → 서브신호 합성 | 조건 코드 |
| L1147-L1184 | `_get_indicator_code` | alias+output → Lean 변수표현(가격필드 특수처리) | (code, var) |
| L1186-L1236 | `_generate_risk_management` | 손절·익절·트레일링 init/check/update 3분할 | 코드 3개 |
| L1238-L1244 | `save` | (사용 안 함) `NotImplementedError` | — |

---

### A. 파일 머리 + 설정 dataclass — `L1-L40`

```python
# L1-L4, L14-L30
"""Lean Code Generator - Schema Based.
StrategySchema → Lean Python 코드 변환.
"""
from kis_backtest.core.schema import (
    CandlestickSchema, ConditionSchema, CompositeConditionSchema,
    IndicatorSchema, OperatorType, StrategySchema, PRICE_FIELDS,
)
from kis_backtest.core.strategy import StrategyDefinition
from kis_backtest.core.converters import from_definition
from kis_backtest.core.indicator import INDICATOR_REGISTRY, get_indicator_info
from kis_backtest.core.candlestick import CANDLESTICK_REGISTRY
from kis_backtest.codegen.validator import IndicatorValidator
from kis_backtest.strategies.base import BaseStrategy
```
- docstring 한 줄로 정체성 확정: **"Schema → Lean Python 코드 변환"**. 이게 파일의 전부입니다.
- import 가 곧 **의존 지도**: `core.schema`(입력 자료형) · `converters.from_definition`(Definition→Schema 변환) · `indicator`/`candlestick` 레지스트리(지표→Lean클래스 매핑) · `validator.IndicatorValidator`(파라미터/워밍업 검증, [validator.py](#) 별도) · `BaseStrategy`(커스텀 전략 부모).
- `PRICE_FIELDS` = `{close, open, high, low, volume}` 같은 **가격 필드 집합**(지표가 아니라 봉 데이터). 나중에 조건에서 "지표 alias 인가, 가격 필드인가"를 가르는 데 씁니다.

```python
# L33-L40
@dataclass
class CodeGenConfig:
    """코드 생성 설정"""
    market: str = "krx"             # krx, us
    commission_rate: float = 0.00015  # 0.015%
    tax_rate: float = 0.002         # 0.2% (KRX 매도세)
    slippage: float = 0.0           # 슬리피지 (기본 0%)
    initial_capital: float = 100_000_000  # 1억원
```
- 생성될 코드의 **다이얼 묶음**. `market` 이 `"krx"`/`"us"` 인지에 따라 데이터 클래스가 갈립니다(KRX/US 분기의 출발점).
- `commission_rate`(수수료)·`tax_rate`(한국 매도세 0.2%)·`slippage`·`initial_capital`(1억원). 이 값들이 그대로 생성 코드 안 FeeModel·SetCash 등에 박힙니다.

> 💡 초보 포인트: 이 dataclass 의 값이 "런타임에 쓰이는 설정"이 아니라 **"생성되는 코드 문자열 안에 숫자로 박히는 상수"** 라는 점이 핵심. 예: `commission_rate=0.00015` → 생성 코드에 `fee = value * 0.00015` 문자열로 들어감.

---

### B. 생성자 `__init__` — 입력 통일·맵 구축·검증 — `L64-L108`

```python
# L76-L92
if isinstance(strategy, BaseStrategy):
    self._base_strategy = strategy
    definition = strategy.build()
    self.schema = from_definition(definition)
    self._original_definition = definition
elif isinstance(strategy, StrategyDefinition):
    self.schema = from_definition(strategy)
    self._original_definition = strategy
else:
    self.schema = strategy           # 이미 StrategySchema
    self._original_definition = None
if self.schema is None:
    raise ValueError("Failed to create strategy schema")
self.config = config or CodeGenConfig()
```
- **입력 3종을 모두 `self.schema`(StrategySchema)로 통일**합니다. 세 갈래:
  - `BaseStrategy`(프리셋 클래스) → `.build()` 로 `StrategyDefinition` 만들고 → `from_definition` 으로 Schema. + 원본을 `_base_strategy` 에 보관(커스텀 로직 뽑으려고).
  - `StrategyDefinition`(불변 정의) → `from_definition` 으로 Schema.
  - 이미 `StrategySchema` → 그대로 사용.
- 이게 개요의 "Single Source of Truth" 원칙 — 어떤 입력이 와도 **이 줄 이후로는 `self.schema` 하나만 상대**합니다.

```python
# L95-L108
self._indicator_map = self.schema.collect_all_indicators()
self._candlestick_map: Dict[str, CandlestickSchema] = {
    cs.alias or cs.id: cs for cs in self.schema.candlesticks
}
self._unique_indicators = self.schema.get_unique_indicators()
self._sanitized_alias_map: Dict[str, str] = self._build_sanitized_alias_map()
self._validate_indicators()
```
- `_indicator_map`: **alias → IndicatorSchema** 사전(빠른 조회용). `_candlestick_map` 도 동일하게 `cs.alias or cs.id` 키로.
- `_unique_indicators`: **중복 제거**된 지표 목록(같은 지표 두 번 초기화 방지).
- `_sanitized_alias_map`: alias→안전한 파이썬 변수명 맵(아래 C에서 상술).
- 마지막 `_validate_indicators()`: **코드 생성 전 검증** — 여기서 막아야 런타임(Lean 실행 중) KeyError 대신 친절한 메시지를 줄 수 있음.

---

### C. alias → 파이썬 식별자 변환 + 충돌 해소 — `L110-L158`

```python
# L110-L125
@staticmethod
def _sanitize_var_name(name: str) -> str:
    import re
    sanitized = re.sub(r'[^a-zA-Z0-9_가-힣]', '_', name)
    sanitized = re.sub(r'_+', '_', sanitized).strip('_')
    if not sanitized:
        return '_indicator'
    if sanitized[0].isdigit():
        sanitized = f'ind_{sanitized}'
    return sanitized
```
- **왜 필요한가**: 사용자가 지표 별명을 `"SMA(단기)"`, `"RSI (14)"`, `"2sma"` 처럼 지을 수 있는데, 이걸 그대로 파이썬 변수명으로 쓰면 **구문 오류**입니다(괄호·공백 불가, 숫자로 시작 불가).
- 정규식 `[^a-zA-Z0-9_가-힣]` = "영문/숫자/언더스코어/**한글(가~힣)**이 아닌 것" → `_` 로 치환. 즉 **한글 별명은 살립니다**(`SMA_단기`).
- `_+ → _` 로 연속 언더스코어 합치고 양끝 `_` 제거. 빈 문자열이면 `_indicator`. 숫자 시작이면 `ind_` 접두사(`2sma → ind_2sma`).

```python
# L127-L154 (요약)
def _build_sanitized_alias_map(self) -> Dict[str, str]:
    seen_sanitized: Dict[str, str] = {}
    alias_map: Dict[str, str] = {}
    for alias in list(self._indicator_map.keys()) + list(self._candlestick_map.keys()):
        base = self._sanitize_var_name(alias)
        if base not in seen_sanitized:
            seen_sanitized[base] = alias
            alias_map[alias] = base
        else:
            n = 2
            while f"{base}_{n}" in seen_sanitized:
                n += 1
            resolved = f"{base}_{n}"
            ...
            alias_map[alias] = resolved
            logger.warning(f"alias sanitization 충돌: '{alias}' → '{resolved}' ...")
    return alias_map
```
- **충돌 문제**: `"SMA(5)"` 와 `"SMA[5]"` 는 둘 다 sanitize 하면 `SMA_5` 가 됩니다 → 같은 변수명이 두 지표를 가리켜 **하나가 덮어써짐**.
- 해결: 이미 본 식별자면 `_2`, `_3`… suffix 를 붙여 **고유성 보장** + 경고 로그. 이 맵이 이후 변수명 생성의 기준이 됩니다(`_get_sanitized_alias`, L156-L158).

> 💡 초보 포인트: 이건 "생성 코드가 절대 구문오류/이름충돌로 깨지지 않게" 만드는 **방어 코드**입니다. codegen 에서 가장 미묘한 버그가 "사용자 입력이 변수명을 깨뜨리는 것"이라 이렇게까지 처리합니다.

---

### D. 검증 — 지표 파라미터 + 조건 alias 정합성 — `L160-L207`

```python
# L160-L170
def _validate_indicators(self) -> None:
    for indicator in self._unique_indicators:
        result = IndicatorValidator.validate(indicator.id, indicator.params)
        if not result.is_valid:
            result.raise_if_invalid()
        for warning in result.warnings:
            logger.warning(f"[{indicator.id}] {warning}")
    self._validate_condition_aliases()
```
- 각 지표를 `IndicatorValidator.validate` 로 검사(미지원 지표·타입오류·범위초과·MACD fast<slow 등 — `validator.py:167`). 실패 시 즉시 예외, 경고는 로그.

```python
# L172-L207 (요약)
def _validate_condition_aliases(self) -> None:
    defined_aliases = set(self._indicator_map.keys()) | PRICE_FIELDS
    unknown: list[str] = []
    def collect(cond) -> None:
        if isinstance(cond, CompositeConditionSchema):
            for sub in cond.conditions:
                collect(sub)
        elif isinstance(cond, ConditionSchema):
            if cond.indicator and cond.indicator not in defined_aliases:
                unknown.append(f"indicator '{cond.indicator}'")
            if (cond.compare_to and isinstance(cond.compare_to, str)
                    and cond.compare_to not in defined_aliases):
                unknown.append(f"compare_to '{cond.compare_to}'")
    collect(self.schema.entry)
    collect(self.schema.exit)
    if unknown:
        ... raise ValueError("조건에서 정의되지 않은 indicator alias 참조: ...")
```
- **핵심 안전장치**: 조건이 `sma_1` 를 참조하는데 실제 지표는 `SMA(단기)` 로 정의돼 있으면 → Lean 실행 시 `KeyError`. 그걸 **코드 생성 전에** 명확한 메시지로 잡습니다.
- `collect` 는 **재귀**로 복합조건 트리를 전부 순회. 진입(`entry`)·청산(`exit`) 둘 다 검사. 허용 집합은 "정의된 지표 alias ∪ 가격 필드".

---

### E. 메인 진입점 `generate()` — 조립 + 구문검사 — `L335-L374`

```python
# L353-L374
capital = initial_capital or self.config.initial_capital
code_parts = [
    self._generate_header(),
    self._generate_data_class(),
    self._generate_fee_model(),
]
slippage_model = self._generate_slippage_model()
if slippage_model:
    code_parts.append(slippage_model)
code_parts.append(self._generate_algorithm(symbols, start_date, end_date, capital))
code = "\n\n".join(code_parts)
try:
    compile(code, "<lean_generated>", "exec")
except SyntaxError as e:
    raise ValueError(f"생성된 Lean 코드 구문 오류 (line {e.lineno}): {e.msg}")
return code
```
- **조립 순서**: 헤더 → 데이터클래스(KRX/US) → 수수료모델 → (슬리피지모델, 켜진 경우만) → 알고리즘. `"\n\n".join` 으로 빈 줄 2개씩 띄워 이어붙임.
- ⚠️ **이 파일의 가장 영리한 줄**: `compile(code, ..., "exec")` — 생성한 문자열을 **실제로 파싱**해 봅니다. 구문오류가 있으면 **Lean 에 보내기 전에** 잡아서 "line N: 메시지"로 알려줍니다. (vbt_engine 의 look-ahead 방어에 해당하는, 이 파일의 "1순위 안전장치".)

> 💡 초보 포인트: `compile(..., "exec")` 는 코드를 **실행하지 않고 문법만 검사**합니다. codegen 에서 흔한 버그(따옴표 안 닫힘, 들여쓰기 깨짐, `{{}}` 실수)를 자동으로 거르는 핵심 방어선.

---

### F. 헤더 생성 `_generate_header` — `L376-L402`

```python
# L379-L402 (요약)
candlestick_imports = ""
if self.schema.candlesticks:
    lean_classes = set()
    for cs in self.schema.candlesticks:
        pattern_info = CANDLESTICK_REGISTRY.get(cs.id)
        if pattern_info:
            lean_classes.add(pattern_info.lean_class)
    if lean_classes:
        classes_str = ", ".join(sorted(lean_classes))
        candlestick_imports = f"\nfrom QuantConnect.Indicators.CandlestickPatterns import {classes_str}"
return f'''"""자동 생성된 Lean 알고리즘
전략: {self.schema.name}
...
"""
from AlgorithmImports import *
from datetime import datetime, timedelta{candlestick_imports}'''
```
- 생성 코드의 맨 윗부분: **사람이 읽을 docstring**(전략명·ID·생성일·수수료·세금·슬리피지) + import.
- `from AlgorithmImports import *` = Lean 의 모든 API(`QCAlgorithm`, `TradeBar`, `Resolution` 등)를 한 번에 가져오는 Lean 관용구.
- 캔들 패턴을 쓰면 **사용한 클래스만** 골라 `CandlestickPatterns` 에서 import(불필요한 import 안 함). `CANDLESTICK_REGISTRY` 가 `cs.id → lean_class` 매핑을 보유.

---

### G. 데이터 클래스 — KRX/US 분기 + GetSource 3곳 — `L404-L502`

```python
# L404-L408
def _generate_data_class(self) -> str:
    if self.config.market == "us":
        return self._generate_us_data_class()
    return self._generate_krx_data_class()
```
- **KRX/US 분기점**. `market` 설정으로 한국/미국 데이터 클래스를 고릅니다.

```python
# L410-L470 (KRX — GetSource 2곳 발췌)
class KRXEquity(PythonData):
    def GetSource(self, config, date, isLive):
        symbol = config.Symbol.Value.lower()
        source = f"/Lean/Data/equity/krx/daily/{symbol}.csv"
        return SubscriptionDataSource(source, SubscriptionTransportMedium.LocalFile, FileFormat.Csv)
    def Reader(self, config, line, date, isLive):
        if not line.strip(): return None
        data = KRXEquity(); data.Symbol = config.Symbol
        try:
            cols = line.split(",")
            data.Time = datetime.strptime(cols[0], "%Y%m%d")
            data.Value = float(cols[4])
            data["Open"]=float(cols[1]); data["High"]=float(cols[2])
            data["Low"]=float(cols[3]);  data["Close"]=float(cols[4])
            data["Volume"]=int(cols[5])
        except Exception: return None
        return data

class KRXIndex(PythonData):  # KOSPI 벤치마크용 (Alpha/Beta 계산)
    def GetSource(self, config, date, isLive):
        source = f"/Lean/Data/index/krx/daily/{symbol}.csv"
        ...
```
- ⚠️ **메모리 핵심 사실**: 경로는 **`/Lean/Data/...`** — 이건 우리 PC 경로가 아니라 **Docker 컨테이너 내부 경로**입니다. `DataConverter` 가 호스트에서 만든 CSV 가 이 경로로 마운트돼 Lean 이 읽습니다.
- **GetSource 가 나오는 3곳**:
  1. `KRXEquity` → `/Lean/Data/equity/krx/daily/{symbol}.csv` (한국 주식)
  2. `KRXIndex` → `/Lean/Data/index/krx/daily/{symbol}.csv` (KOSPI 지수, 벤치마크/Beta·Alpha)
  3. `USEquity` → `/Lean/Data/equity/usa/daily/{symbol}.csv` (미국 주식, L478)
- `Reader`: CSV 한 줄을 `,` 로 쪼개 `cols[0]=날짜(YYYYMMDD)`, `cols[1~5]=O/H/L/C/V`. `data.Value = 종가`(Lean 의 기본 가격). 파싱 실패 시 `None` 반환(그 줄 무시).
- **KRX/US 차이**: 거의 동일하나 경로(`krx`↔`usa`)와 `KRXIndex`(US 엔 없음)·`Volume` 결측 처리(`KRXIndex` 만 `len(cols)>5` 가드)가 다름.

> 💡 초보 포인트: 이 전체가 **하나의 긴 문자열**(삼중따옴표 raw)입니다. f-string 이 아니라서 `{symbol}` 은 변수치환이 **아니라** 생성된 코드 안의 진짜 f-string(Lean 이 실행할 때 평가)입니다. 즉 "코드 안에 코드"가 그대로 들어갑니다.

---

### H. 수수료·슬리피지 모델 — `L504-L551`

```python
# L504-L516
def _generate_fee_model(self) -> str:
    return f'''
class CustomFeeModel(FeeModel):
    def GetOrderFee(self, parameters):
        value = abs(parameters.Order.GetValue(parameters.Security))
        if parameters.Order.Direction == OrderDirection.Buy:
            fee = value * {self.config.commission_rate}
        else:
            fee = value * ({self.config.commission_rate} + {self.config.tax_rate})
        return OrderFee(CashAmount(fee, "USD"))'''
```
- **매수**는 수수료만, **매도**는 수수료 + 매도세(`tax_rate`). 한국 시장 현실 반영(매도 시에만 거래세).
- `{self.config.commission_rate}` 등이 **생성 시점에 숫자로 박힘**(예: `value * 0.00015`).
- `CashAmount(fee, "USD")` — 통화는 USD 로 박혀 있음(Lean 내부 회계 단위; 한국 종목이어도 이 라이브러리 기본값이 USD).

```python
# L518-L551 (요약)
def _generate_slippage_model(self) -> str:
    if self.config.slippage <= 0:
        return ""        # 슬리피지 0이면 모델 자체를 생성 안 함
    return f'''class KRXSlippageModel:
    SLIP_RATE = {self.config.slippage}
    def _tick(self, price):
        if price < 1000: return 1
        elif price < 5000: return 5
        ... else: return 1000
    def GetSlippageApproximation(self, asset, order):
        price = int(round(float(asset.Price)))
        tick = self._tick(price)
        raw = int(round(price * self.SLIP_RATE))
        if int(order.Direction) == 0:  # Buy: 올림
            target = ((price + raw + tick - 1) // tick) * tick
        else:                           # Sell: 내림
            target = ((price - raw) // tick) * tick
        return float(abs(target - price))'''
```
- 슬리피지가 0이면 **빈 문자열 반환** → `generate()` 가 이 조각을 아예 안 붙임(L363-L365). "필요할 때만 코드 생성"의 예.
- KRX **호가 단위(tick)** 를 가격대별로 반영(1000원 미만 1원, 5천 미만 5원…). 매수는 **올림**, 매도는 **내림**으로 불리하게 체결 — 현실적 슬리피지. (`int(order.Direction)==0` 이 매수.)

---

### I. 알고리즘 본체 `_generate_algorithm` — 이 파일의 알맹이 — `L553-L711`

이 함수가 `Initialize`/`OnData` 를 짜는 **본문 번역기**입니다. 먼저 여러 하위 생성기를 호출해 **조각들을 모으고**, 그 뒤 거대한 f-string 에 끼워 넣습니다.

```python
# L561-L612 (조각 수집 — 요약)
data_class = "USEquity" if self.config.market == "us" else "KRXEquity"
symbols_str = ",".join(symbols)
indicator_init, warmup = self._generate_indicator_init()
candlestick_init, cs_warmup = self._generate_candlestick_init()
warmup = max(warmup, cs_warmup)                      # 가장 긴 워밍업 채택
indicator_values = self._generate_indicator_values()
candlestick_values = self._generate_candlestick_values()
prev_update = self._generate_prev_update()
entry_condition = self._generate_condition(self.schema.entry, "entry")
exit_condition  = self._generate_condition(self.schema.exit,  "exit")
risk_init, risk_check, risk_update = self._generate_risk_management()
tradebar_indicators, decimal_indicators = self._get_tradebar_indicator_aliases()
indicator_update_code = self._generate_indicator_update_code(tradebar_indicators, decimal_indicators)
custom_init, custom_logic = self._generate_custom_logic()
```
- **모든 하위 생성기를 한 번씩 호출**해 코드 조각(문자열)으로 받아둡니다. `warmup = max(...)` 로 가장 긴 지표 워밍업을 채택(모든 지표가 준비될 때까지 대기).

```python
# L614-L626 (벤치마크 — KRX 한정)
benchmark_setup = ""
if self.config.market == "krx":
    benchmark_setup = """
        self.kospi_symbol = None
        try:
            kospi = self.AddData(KRXIndex, "kospi", Resolution.Daily).Symbol
            self.SetBenchmark(kospi)
            self.kospi_symbol = kospi
        except Exception:
            self.Debug("KOSPI 벤치마크 설정 실패 - 기본값 사용")
"""
```
- KRX 일 때만 KOSPI 를 벤치마크로 추가 → Alpha/Beta 지표 계산에 사용(뒤 `beta`/`alpha` 커스텀 지표가 `self.B()/self.A()` 로 이걸 참조).

```python
# L628-L662 (Initialize — 발췌)
class Algorithm(QCAlgorithm):
    def Initialize(self):
        self.SetStartDate({start_parts[0]}, {start_parts[1].lstrip("0")}, {start_parts[2].lstrip("0")})
        self.SetEndDate({end_parts[0]}, {end_parts[1].lstrip("0")}, {end_parts[2].lstrip("0")})
        self.SetCash({int(capital)}){benchmark_setup}
        self.strategy_name = "{strategy_name}"
        self.indicators = {{}}
        self.candlesticks = {{}}
        self.prev_values = {{}}
        ...
        for symbol_str in "{symbols_str}".split(","):
            symbol = self.AddData({data_class}, symbol_str, Resolution.Daily).Symbol
            self.symbols.append(symbol)
            self.indicators[symbol] = {{}}
            ...
{indicator_init}
{candlestick_init}
        self.SetWarmUp({warmup}, Resolution.Daily)
        for symbol in self.symbols:
            self.Securities[symbol].SetFeeModel(CustomFeeModel())...
```
- ⚠️ **`{{}}` 의 이유**: `self.indicators = {{}}` 는 생성 코드에선 `self.indicators = {}`(빈 dict). f-string 에서 진짜 중괄호를 내려면 `{{}}` 로 escape(사전지식 2). `{int(capital)}` 처럼 **하나짜리 `{}` 는 변수 치환**.
- `start_parts[1].lstrip("0")` — `"01"` → `"1"`. Lean 의 `SetStartDate(2024, 1, 1)` 는 정수를 기대하므로 앞자리 0 제거(`08` 같은 8진수 오해 방지 + 정수 표기).
- 종목 문자열을 `split(",")` 으로 돌며 `AddData(KRXEquity/USEquity, ...)` 등록. 각 종목마다 `indicators/prev_values` 빈 dict 준비. 그 뒤 `{indicator_init}` 조각이 들여쓰기 맞춰 삽입됨.

```python
# L664-L711 (OnData — 발췌)
    def OnData(self, data):
        if self.IsWarmingUp:
            return
        for symbol in self.symbols:
            if not data.ContainsKey(symbol): continue
            bar = data[symbol]; price = bar.Close
            self.Securities[symbol].SetMarketPrice(bar)
            # 지표 업데이트
{indicator_update_code}
{candlestick_update}
            # 지표 준비 확인
            if not all(getattr(ind, 'IsReady', True) for ind in self.indicators[symbol].values()){candlestick_ready_check}:
                continue
            # 지표값 가져오기
{indicator_values}
            holdings = self.Portfolio[symbol].Quantity
{custom_logic}
            # === 진입 조건 ===
{entry_condition}
            if entry_signal and holdings == 0:
                weight = 1.0 / len(self.symbols)
                self.SetHoldings(symbol, weight, tag=f"ENTRY: {{self.strategy_name}}")
            # === 청산 조건 ===
{exit_condition}
{risk_check}
            if exit_signal and holdings > 0:
                self.Liquidate(symbol, tag=f"EXIT: {{self.strategy_name}}")
            # === 이전값 업데이트 ===
{prev_update}
```
- **한 봉 처리 순서**가 그대로 보입니다(흐름도 ①~⑦).
- `SetMarketPrice(bar)` — 커스텀 데이터의 현재가를 명시 설정(시가평가 정확도).
- **진입**: `entry_signal` 참 + **미보유**(`holdings == 0`) → `SetHoldings(symbol, 1/N)` 로 종목 수만큼 균등 비중 매수. 다종목이면 자동 분산.
- **청산**: `exit_signal`(조건 + 리스크체크 OR) 참 + 보유 → `Liquidate`(전량 청산).
- `IsReady` 체크: 모든 지표가 준비됐을 때만 매매(워밍업 미완 지표로 판단 금지).
- ⚠️ `{{self.strategy_name}}` — 이 역시 escape: 생성 코드에 `f"ENTRY: {self.strategy_name}"` 라는 **f-string 이 그대로** 들어가야 하므로 바깥 f-string 에서 `{{ }}`.

---

### J. 지표 초기화 `_generate_indicator_init` — 커스텀 7종 특수처리 — `L713-L797`

```python
# L719-L735 (요약)
max_warmup = 30
initialized_aliases = set()
for indicator in self._unique_indicators:
    alias = indicator.alias or indicator.id
    if alias in initialized_aliases: continue   # alias 중복 제거
    initialized_aliases.add(alias)
    if indicator.id == "consecutive":
        lines.append(f"            self.indicators[symbol]['{alias}'] = 0  # consecutive counter")
        max_warmup = max(max_warmup, 2); continue
    ...
```
- **커스텀 지표 7종**(`consecutive`·`disparity`·`volatility_ind`·`change`·`returns`·`beta`·`alpha`)은 Lean 표준 지표가 아니라 **수작업 계산**이라 각각 특수 init 코드를 생성:
  - `consecutive`(연속 상승/하락 일수) → 단순 정수 카운터 `= 0`.
  - `disparity`(이격도) → 내부에 SMA 를 만들어 `'{alias}_sma'` 로 보관.
  - `volatility_ind`(변동성) → 수익률 버퍼 리스트 + period 저장.
  - `returns` → `ROCP`(변화율%) 지표.
  - `beta`/`alpha` → KOSPI 가 있으면 `self.B()`/`self.A()`(Lean 프레임워크 자동 등록), 없으면 더미 `SimpleMovingAverage(1)`.

```python
# L784-L795 (표준 지표)
init_code, warmup = IndicatorValidator.get_lean_init_code(indicator.id, indicator.params, alias)
display = indicator.name or alias
params_str = ", ".join(f"{k}={v}" for k, v in indicator.params.items())
lines.append(
    f"            # {display}: {indicator.id}({params_str})\n"
    f"            self.indicators[symbol]['{alias}'] = {init_code.split(' = ', 1)[1]}"
)
max_warmup = max(max_warmup, warmup)
return "\n".join(lines), max_warmup
```
- 표준 지표는 `IndicatorValidator.get_lean_init_code` 에 위임 → `"alias = SimpleMovingAverage(20)"` 같은 코드 + 워밍업 일수를 받음(`validator.py:284`, 레지스트리의 `init_template` 사용).
- `init_code.split(' = ', 1)[1]` = `" = "` 기준 우변만 꺼냄(`SimpleMovingAverage(20)`) → `self.indicators[symbol]['alias'] = ...` 형태로 재조립. 주석에 표시이름·파라미터를 달아 가독성↑.

---

### K. 지표값 추출 `_generate_indicator_values` + 출력 수집 — `L842-L982`

```python
# L842-L871 (수집)
def _collect_all_indicator_outputs(self) -> List[tuple]:
    outputs = set()
    for ind in self.schema.indicators:
        if ind.id not in PRICE_FIELDS:
            outputs.add((ind.alias or ind.id, ind.output or "value"))
    def collect_from_condition(cond):
        if isinstance(cond, CompositeConditionSchema):
            for sub in cond.conditions: collect_from_condition(sub)
        elif isinstance(cond, ConditionSchema):
            if cond.indicator and cond.indicator not in PRICE_FIELDS:
                outputs.add((cond.indicator, cond.indicator_output or "value"))
            if cond.compare_to and cond.compare_to not in PRICE_FIELDS:
                outputs.add((cond.compare_to, cond.compare_output or "value"))
    collect_from_condition(self.schema.entry)
    collect_from_condition(self.schema.exit)
    return list(outputs)
```
- 조건이 실제로 쓰는 **(alias, output) 조합**만 수집. 예: MACD 는 `value`(MACD선)와 `signal`(시그널선) 둘 다 쓸 수 있어 `(macd, value)`·`(macd, signal)` 두 개로 잡음. 안 쓰는 출력은 코드 생성 안 함(군더더기 제거).

```python
# L941-L981 (값 추출 — 요약)
for alias, output in all_outputs:
    raw_var = f"{alias}_{output}" if output != "value" else alias
    var_name = self._sanitize_var_name(raw_var)
    if var_name in generated_values: continue
    generated_values.add(var_name)
    ind_schema = self._indicator_map.get(alias)
    indicator_id = alias if ind_schema is None else ind_schema.id
    if indicator_id in ("consecutive","disparity","volatility_ind","change","returns"):
        lines.append(f"            {var_name} = self.indicators[symbol]['{alias}']")
        continue
    indicator_info = get_indicator_info(indicator_id)
    if indicator_info is None:
        lines.append(f"            {var_name} = self.indicators[symbol]['{alias}'].Current.Value")
        continue
    if indicator_info.outputs and output in indicator_info.outputs:
        value_template = indicator_info.outputs[output]
    elif indicator_info.value_template:
        value_template = indicator_info.value_template
    else:
        value_template = "{name}.Current.Value"
    value_code = value_template.replace("{name}", f"self.indicators[symbol]['{alias}']")
    lines.append(f"            {var_name} = {value_code}")
```
- 각 (alias,output) 마다 **로컬 변수 추출 코드** 한 줄 생성: `rsi = self.indicators[symbol]['rsi'].Current.Value`.
- 출력이 `value` 면 변수명 = alias, 아니면 `alias_output`(예: `macd_signal`). `value_template`/`outputs` 는 레지스트리에서 옴(`indicator.py` 의 `IndicatorInfo`, 예: `"{name}.Signal.Current.Value"`).
- 커스텀 지표는 `.Current.Value` 가 아니라 dict 에 저장한 값을 직접 사용. 이 변수들이 다음 단계(조건)에서 `rsi < 30` 처럼 쓰입니다.
- 앞부분(L881-L935, 생략)은 커스텀 지표의 **실시간 계산 코드**(연속카운터 증감, 이격도 = price/sma*100, 변동성 = stdev(수익률버퍼) 등)를 생성.

---

### L. 이전값 저장 `_generate_prev_update` — 교차 판정용 — `L984-L1005`

```python
# L989-L1005
lines = ["            self.prev_values[symbol]['price'] = price"]
generated_values = set()
all_outputs = self._collect_all_indicator_outputs()
for alias, output in all_outputs:
    raw_var = f"{alias}_{output}" if output != "value" else alias
    var_name = self._sanitize_var_name(raw_var)
    if var_name in generated_values: continue
    generated_values.add(var_name)
    lines.append(f"            self.prev_values[symbol]['{var_name}'] = {var_name}")
return "\n".join(lines)
```
- OnData 끝에서 **오늘 값들을 "어제값"으로 저장**. 다음 봉의 교차 판정(`crosses_above` = "어제는 아래, 오늘은 위")에 필요.
- vbt_engine 의 `shift(1)` 와 같은 목적(어제 vs 오늘 비교)이지만, 여기선 **루프 방식**이라 명시적으로 직전 값을 dict 에 보관합니다.

---

### M. 조건 생성 — 디스패처 + 연산자별 — `L1007-L1145`

```python
# L1022-L1033
def _generate_single_condition(self, cond, name):
    if cond.is_candlestick_condition():
        return self._generate_candlestick_condition(cond, name)
    if cond.operator == OperatorType.CROSS_ABOVE:
        return self._generate_cross_above(cond, name)
    elif cond.operator == OperatorType.CROSS_BELOW:
        return self._generate_cross_below(cond, name)
    else:
        return self._generate_comparison(cond, name)
```
- 조건 → 적절한 생성기로 **디스패치**. 캔들 / 상향교차 / 하향교차 / 비교 4갈래. `name` 은 `"entry"`/`"exit"`(또는 복합조건의 서브 이름).

```python
# L1055-L1071 (상향 돌파)
def _generate_cross_above(self, cond, name):
    left_code, left_var = self._get_indicator_code(cond.indicator, cond.indicator_output)
    if cond.value is not None:                       # 숫자와 교차 (RSI crosses 30)
        threshold = cond.value
        return f'''            # {name}: 상향 돌파 ...
            prev_{left_var} = self.prev_values[symbol].get('{left_var}', 0)
            {name}_signal = prev_{left_var} <= {threshold} and {left_code} > {threshold}'''
    else:                                            # 지표끼리 교차
        right_code, right_var = self._get_indicator_code(cond.compare_to, cond.compare_output)
        return f'''            ...
            prev_{left_var} = self.prev_values[symbol].get('{left_var}', 0)
            prev_{right_var} = self.prev_values[symbol].get('{right_var}', 0)
            {name}_signal = prev_{left_var} <= prev_{right_var} and {left_code} > {right_code}'''
```
- **교차 = "어제 ≤, 오늘 >"** 를 코드로 표현. `prev_*` 는 L 단계에서 저장한 어제값. 숫자 임계값(`RSI cross 30`)과 지표 간 교차(`SMA단기 cross SMA장기`) 둘 다 지원. `_below` 는 부호만 반대.

```python
# L1089-L1122 (비교 — ScaledIndicator)
left_code, _ = self._get_indicator_code(cond.indicator, cond.indicator_output)
if cond.value is not None:
    right_code = str(cond.value)
elif cond.compare_to is not None:
    right_code, _ = self._get_indicator_code(cond.compare_to, cond.compare_output)
    if cond.compare_scalar is not None:              # 예: price > SMA*1.05
        op = cond.compare_operation or "mul"
        if op == "mul":   right_code = f"({right_code} * {cond.compare_scalar})"
        elif op == "div": right_code = f"({right_code} / {cond.compare_scalar})"
        ...
op_map = { OperatorType.GREATER_THAN: ">", ... OperatorType.BREAKS: ">" }
op = op_map.get(cond.operator, ">")
return f"            {name}_signal = {left_code} {op} {right_code}"
```
- 단순 비교는 한 줄: `entry_signal = rsi < 30`. `compare_scalar`/`compare_operation` 으로 **배율 비교**(`price > SMA * 1.05`) 지원 — 가짜돌파·강한종가 같은 전략에 필요.
- `op_map` 으로 `OperatorType` enum → 파이썬 연산자 기호. `BREAKS`(돌파)는 `>` 로 매핑.

```python
# L1124-L1145 (복합 AND/OR)
for i, sub_cond in enumerate(cond.conditions):
    sub_name = f"{name}_sub_{i}"
    lines.append(self._generate_condition(sub_cond, sub_name))   # 재귀
    sub_signals.append(f"{sub_name}_signal")
logic_op = " and " if cond.logic == "AND" else " or "
lines.append(f"            {name}_signal = {logic_op.join(sub_signals)}")
```
- 복합조건은 각 서브조건을 `entry_sub_0_signal`, `entry_sub_1_signal`… 로 따로 만든 뒤 `and`/`or` 로 합쳐 `entry_signal` 생성. **재귀**라서 중첩 조건(`(A and B) or C`)도 처리.

```python
# L1147-L1184 (지표 alias → Lean 변수)
def _get_indicator_code(self, alias, output="value"):
    if alias is None: return "price", "price"
    if alias in PRICE_FIELDS or alias == "price":
        if alias in ("close","price"): return "price", "price"
        elif alias == "open":   return "bar.Open", "open"
        elif alias == "high":   return "bar.High", "high"
        elif alias == "low":    return "bar.Low", "low"
        elif alias == "volume": return "bar.Volume", "volume"
    raw_var = f"{alias}_{output}" if output != "value" else alias
    var_name = self._sanitize_var_name(raw_var)
    return var_name, var_name
```
- 조건이 가리키는 alias 를 **실제 Lean 코드 표현으로 변환**. 가격 필드(`close→price`, `high→bar.High`)는 특수 처리, 지표는 K 단계에서 만든 로컬 변수명으로. 반환은 `(코드, 변수명)` 튜플.

---

### N. 리스크 관리 `_generate_risk_management` — 손절·익절·트레일링 — `L1186-L1236`

```python
# L1196-L1230 (요약)
if risk.stop_loss_pct is not None:
    init_lines.append("        self.entry_prices = {}")
    update_lines.append("                self.entry_prices[symbol] = price")
    check_lines.append(f'''
            if symbol in self.entry_prices and holdings > 0:
                loss_pct = (price - self.entry_prices[symbol]) / self.entry_prices[symbol] * 100
                if loss_pct <= -{sl_pct}:
                    exit_signal = True''')
if risk.take_profit_pct is not None:
    ... if profit_pct >= {tp_pct}: exit_signal = True
if risk.trailing_stop_pct is not None:
    init_lines.append("        self.high_prices = {}")
    ... self.high_prices[symbol] = max(self.high_prices[symbol], price)
        drawdown_pct = (price - self.high_prices[symbol]) / ... * 100
        if drawdown_pct <= -{ts_pct}: exit_signal = True
return init_str, check_str, update_str
```
- 3종 리스크 규칙을 **세 묶음 코드**로 분리 반환:
  - `init` → Initialize 에 들어갈 `self.entry_prices = {}` 등(L646 위치).
  - `check` → OnData 청산부에 들어가 `exit_signal = True` 를 추가 발동(L704).
  - `update` → 매수 직후 진입가/고점 기록(L700).
- **손절**: 진입가 대비 -X% → 청산. **익절**: +X% → 청산. **트레일링**: 보유 중 최고가 대비 -X% 하락 → 청산. 모두 기존 `exit_signal` 에 OR 로 합류.
- 중복 방지: `entry_prices = {}` 가 이미 추가됐는지 확인 후 재추가 안 함(손절+익절 동시 설정 시).

---

### O. 사용 안 하는 `save()` — `L1238-L1244`

```python
# L1238-L1244
def save(self, output_path: Path) -> None:
    raise NotImplementedError("Use generate() with symbols, start_date, end_date parameters")
```
- 의도적으로 **막아둔** 메서드. 코드 생성은 종목/기간 인자가 필수라 `generate()` 로만 가능. (구버전 흔적 또는 오용 방지.)

---

## ⚠️ 함정·주의 (코드에 박힌 교훈 모음)

1. **`/Lean/Data` 는 컨테이너 경로** — `GetSource` 의 `/Lean/Data/equity/krx/daily/{symbol}.csv` 는 **호스트 PC 경로가 아니라 Docker 안 경로**. `DataConverter` 가 만든 CSV 가 이 위치로 마운트돼야 Lean 이 읽음(메모리 "Lean CLI 운영 사실"). 로컬에서 직접 못 여는 게 정상.
2. **f-string 중괄호 escape** — 생성 코드에 진짜 `{}`(빈 dict)나 **내부 f-string**(`f"ENTRY: {self.strategy_name}"`)을 넣으려면 바깥 f-string 에서 `{{ }}` 로 두 번. 한 번만 쓰면 "변수 없음" 오류 또는 의도와 다른 치환. 이 파일 L642·L698·L707 등이 그 예.
3. **따옴표 중첩 주의** — 생성 코드 안 문자열은 `'{alias}'`(작은따옴표)로 감싸 바깥 삼중따옴표(`'''`)와 충돌 회피. alias 에 작은따옴표가 들어오면 깨질 수 있음(현재 sanitize 가 특수문자를 `_`로 바꿔 사실상 차단).
4. **`compile()` 이 최후 방어선** — `generate()` 의 `compile(code, ..., "exec")`(L371)가 구문오류를 실행 전 잡음. codegen 수정 후엔 이게 통과하는지가 1차 합격선. 단, **구문**만 보지 **의미**(잘못된 변수 참조)는 못 잡음 → 그래서 `_validate_condition_aliases` 가 따로 필요.
5. **alias 충돌 = 조용한 데이터 손실** — `_build_sanitized_alias_map` 없으면 `SMA(5)`/`SMA[5]` 가 같은 변수로 덮어써짐. 경고 로그(L149)를 무시하지 말 것.
6. **KRX/US 분기는 `market` 하나로** — `config.market` 이 데이터클래스·벤치마크·슬리피지(KRX 호가) 전부를 가름. US 인데 KRXSlippageModel 을 켜면 호가단위가 안 맞음(US 는 보통 slippage=0 권장).
7. **워밍업은 max 채택** — 여러 지표 중 **가장 긴** 워밍업을 쓰므로(L569), 긴 지표 하나가 백테스트 시작을 늦춤. 데이터 기간이 짧으면 신호가 거의 안 나올 수 있음.
8. **통화 USD 박힘** — FeeModel 의 `CashAmount(fee, "USD")`(L516). 한국 종목 백테스트여도 회계 단위는 USD(이 라이브러리 기본). 절대 금액 해석 시 주의.

---

## 🚀 고도화 아이디어 (강의·개선 버전용)

- **체결 시점 분리**: 지금은 종가(`price = bar.Close`)로 판단·체결. "오늘 신호 → 내일 시가 체결"을 구현하면 vbt_engine 의 `shift(1)` 처럼 look-ahead 를 더 엄격히 차단(현재는 `prev_values` 교차로 부분 방어).
- **포지션 사이징 연동**: 현재 `SetHoldings(symbol, 1/N)` 균등 비중 고정. `strategies/risk/position_sizer.py`(변동성 기반)를 코드 생성에 끌어와 변동성 역가중 등으로 확장.
- **부분 청산**: `Liquidate`(전량)만 지원. 익절 시 절반만 파는 식의 분할 청산 코드 생성 옵션.
- **다중 자산 시그널 결합**: 종목별 독립 루프라 "종목 간 상대비교(랭킹 모멘텀)" 불가. 루프 밖에서 점수 매겨 상위 N 만 보유하는 코드 템플릿 추가.
- **생성 코드 단위테스트 자동화**: `compile()` 을 넘어, 생성된 `main.py` 를 작은 더미 CSV 로 Lean dry-run 해 "조건이 실제로 발동하는지"까지 검증하는 골든 테스트.
- **`market` 확장**: 현재 krx/us 2종. 코인(`equity/crypto`)·해외지수용 데이터클래스/경로 분기를 같은 패턴으로 추가(메모리 Binance 통합과 연결 여지).
- **출력 템플릿 외부화**: 거대한 f-string 본문을 Jinja2 템플릿 파일로 분리하면 코드/템플릿 분리로 가독성·유지보수↑(다만 디버깅·구문검사 흐름은 재설계 필요).

---

## 📚 용어 사전 (이 파일 한정)

| 용어 | 뜻 |
|---|---|
| **codegen(코드 생성)** | 추상 정의를 실행 가능한 코드 **문자열**로 자동 변환. 이 파일의 정체 |
| **메타프로그래밍** | "코드를 만드는 코드". 함수가 값이 아니라 소스 문자열을 반환 |
| **StrategySchema** | 모든 입력을 통일·검증한 표준 전략 스키마(Single Source of Truth). 이 파일의 유일한 입력 |
| **f-string / 삼중따옴표** | `f'''...{var}...'''` — 여러 줄 문자열에 변수 끼워넣기. 이 파일의 주력 도구 |
| **`{{ }}` escape** | f-string 안에서 진짜 중괄호를 내려면 두 번. 생성 코드의 빈 dict·내부 f-string 용 |
| **QCAlgorithm** | Lean 전략 베이스 클래스. 생성 코드가 이걸 상속(`Initialize`/`OnData`) |
| **Initialize / OnData** | Lean 의 두 핵심 메서드. 준비(1회) / 매 봉 루프 |
| **PythonData** | 커스텀 CSV 를 Lean 에 먹이는 베이스 클래스(`GetSource`+`Reader` 구현) |
| **GetSource** | CSV 파일 경로를 Lean 에 알려주는 메서드. 이 파일에 3곳(KRXEquity·KRXIndex·USEquity) |
| **`/Lean/Data`** | Docker 컨테이너 내부의 데이터 루트 경로. 호스트 경로 아님 |
| **TradeBar** | Lean 의 OHLCV 봉 객체. 일부 지표는 종가만이 아니라 TradeBar 전체로 갱신(`requires_tradebar`) |
| **alias** | 지표에 붙인 별명. 조건이 이걸로 지표 참조. 코드 생성 전 파이썬 식별자로 sanitize |
| **sanitize(정규화)** | 별명의 괄호·공백·특수문자를 `_`로 바꿔 유효 변수명으로. 충돌 시 `_2` suffix |
| **워밍업(warmup)** | 지표가 유효값을 내기까지 필요한 봉 수. 여러 지표 중 max 채택 |
| **decimal vs TradeBar 갱신** | `Update(time, price)`(종가만) vs `Update(trade_bar)`(OHLCV 전체) |
| **ScaledIndicator(compare_scalar)** | `price > SMA * 1.05` 같은 배율 비교 지원 |
| **FeeModel / SlippageModel** | 생성 코드 안의 수수료(매도세 포함)·슬리피지(KRX 호가단위) 모델 |
| **`compile(code, "exec")`** | 코드를 실행하지 않고 **구문만 검사**. 이 파일의 1차 안전장치 |
| **커스텀 지표 7종** | Lean 표준 아닌 수작업 계산 지표(consecutive·disparity·volatility_ind·change·returns·beta·alpha) |
| **KRX/US 분기** | `config.market` 으로 데이터클래스·경로·벤치마크·슬리피지가 갈림 |
