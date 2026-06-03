# `codegen/validator.py` — 지표 파라미터 "사전 검수관" (완전 라인별 해설)

> 원본: `analytics/app/lean/kis_backtest/codegen/validator.py` (432줄)
> 형식 기준: 모범 [`01_backtest/vbt_engine.md`](../01_backtest/vbt_engine.md) · [`README.md`](../README.md) "3. 공통 형식" · 벤더 개요 [`10_vendor_kis_backtest/00_overview.md`](00_overview.md).
> 위치: `codegen/` 패키지 안. 짝꿍인 [`generator.py`](00_overview.md)(LeanCodeGenerator)가 Lean 코드를 "조립"하기 **직전에**, 이 파일이 부품(지표 파라미터)이 멀쩡한지 **검수**합니다.

---

## 📌 한눈에

이 파일은 **"Lean 코드를 생성하기 전, 지표 설정을 검사하는 사전 검수관"** 입니다.

비유로 풀면 — 가구 공장(`00_overview.md`의 비유)에서 설계도(StrategySchema)를 Lean 도면으로 번역하기 직전, **자재 검수원**이 "이 나사 규격이 맞나? 빠진 부품 없나? 빠른 기간이 느린 기간보다 길게 잘못 적히진 않았나?"를 점검합니다. 검수에 통과해야만 다음 공정(코드 생성)으로 넘어가고, 불량이 있으면 그 자리에서 **반품(에러)** 합니다. 핵심은 **"잘못된 설정을 Lean에 넘기기 전에 잡아서, 비싼 Docker 백테스트가 헛돌지 않게 막는 것"** 입니다.

핵심 멤버는 다음과 같습니다. (전부 `@classmethod` — 인스턴스를 만들지 않고 `IndicatorValidator.validate(...)`처럼 클래스에 바로 점 찍어 호출.)

| 멤버 | 한 줄 역할 | 비유 |
|---|---|---|
| `PARAM_RULES` (상수표) | 파라미터별 타입·범위·허용값 규칙 사전 | 검수 기준표 ("period는 정수 1~1000") |
| `LEAN_SPECIAL_RULES` (상수표) | Lean 특수 지표의 초기화 템플릿·경고 | 까다로운 부품 전용 조립 설명서 |
| `validate(indicator_id, params)` | **검수 본체** — 존재·필수·타입·범위·논리 5단계 검사 | 검수원의 점검 체크리스트 실행 |
| `get_lean_init_code(...)` | 검증 통과 후 Lean 초기화 코드 문자열 + warmup 생성 | 합격품으로 실제 부품 코드 출력 |
| `_calculate_warmup(...)` | 지표가 유효값을 내기까지 필요한 봉 개수 계산 | "이 부품은 워밍업 N봉 필요" 라벨 |
| `validate_output(...)` | 지표가 그 출력 필드(value/signal/upper…)를 갖는지 확인 | 부품 단자(출력 핀) 존재 확인 |
| `requires_tradebar(...)` | 종가만이 아니라 TradeBar 전체가 필요한 지표인지 | "이 부품은 OHLCV 전체로 급전" 표시 |
| `get_candlestick_init_code(...)` | 캔들 패턴(도지·해머…)의 Lean 초기화 코드 생성 | 캔들 패턴 전용 조립 라인 |

**누가 호출하나?** → 같은 패키지의 `LeanCodeGenerator`(generator.py)가 지표마다 이 검증기를 부릅니다. `get_lean_init_code()`는 내부에서 **반드시 먼저** `validate()`를 돌리고 실패 시 예외를 던지므로(L302-303), 코드 생성기는 "검증 통과한 코드"만 받게 됩니다. 즉 이 파일은 **codegen 파이프라인의 안전 게이트**입니다.

> 헷갈리기 쉬운 점: 이 파일은 **"검증"과 "코드 생성"을 둘 다** 합니다. 이름은 validator지만, `get_lean_init_code` / `get_candlestick_init_code` 처럼 실제 Lean 코드 문자열을 만들어 내보내는 책임도 같이 집니다(검증과 생성이 한 몸으로 붙어 있어, 검증 없이 코드만 뽑는 일을 구조적으로 막음).

---

## 🧠 사전 지식 (이거 모르면 막힘)

#### 1) 유효성 검증(validation) = "쓰레기 들어가면 쓰레기 나온다"를 입구에서 막기
- 잘못된 입력(빠진 필드, 틀린 타입, 말이 안 되는 값)을 그대로 다음 단계로 흘려보내면, 한참 뒤 엉뚱한 곳에서 알 수 없는 에러가 터집니다. **입구에서 검사**하면 "무엇이/왜" 틀렸는지 정확한 메시지로 빨리 잡힙니다.

#### 2) 사전(pre-flight) 실패 vs 런타임 실패 — 이 파일의 존재 이유
```
[이 파일이 막는 것]  사전 실패: 코드 생성 전에 ValueError → 즉시·명확
        vs
[이 파일이 없으면]  런타임 실패: Lean(Docker) 백테스트가 한참 돌다가
                    "AroonOscillator() missing argument" 같은 모호한 에러로 폭사
```
- Lean 백테스트는 **Docker 컨테이너를 띄워 수 초~수십 초** 걸립니다. 잘못된 파라미터를 거기까지 보내면 시간·자원을 낭비하고 에러도 불친절합니다. 이 파일은 그 **비싼 실행 전에** 값싸게(밀리초) 걸러냅니다.

#### 3) `@dataclass` = "필드 묶음 상자"를 짧게 정의
- `class` 안에 `name: type` 만 적으면 생성자·표시 코드가 자동 생성됩니다. 이 파일의 `ValidationError`(에러 1건)·`ValidationResult`(결과 묶음)가 그것. (vbt_engine.md의 `BacktestParams`와 같은 도구.)

#### 4) `@classmethod` + `cls` = 인스턴스 없이 클래스에 직접 매달린 메서드
- `IndicatorValidator()` 객체를 안 만들고 `IndicatorValidator.validate(...)`로 바로 씁니다. 첫 인자 `cls`는 "이 클래스 자신"을 가리켜, `cls.PARAM_RULES`처럼 클래스 상수표에 접근합니다. 상태(필드)를 들고 있을 필요가 없는 **순수 유틸리티**라 이렇게 설계.

#### 5) 레지스트리(Registry) = id로 메타데이터를 찾는 명부
- `INDICATOR_REGISTRY`(지표 70여 종 메타데이터)와 `CANDLESTICK_REGISTRY`(캔들 패턴 19종)는 `{"sma": IndicatorInfo(...), ...}` 형태의 사전. 이 파일은 여기서 **"그 지표가 어떤 필수 파라미터·출력·초기화 템플릿을 갖는지"** 를 조회합니다.
  - `IndicatorInfo` 의 주요 필드(근거: `core/indicator.py:179-187`): `params`(필수 파라미터 이름 목록) · `outputs`(다중 출력 템플릿 dict) · `init_template`(Lean 초기화 문자열 틀) · `requires_tradebar`(TradeBar 필요 여부) · `value_template`.
  - `PatternInfo` 의 주요 필드(근거: `core/candlestick.py:60-68`): `lean_class`(Lean 클래스명) · `candle_count`(1=단일/2=이중/3=삼중) · `lean_unsupported`(현재 Lean 버전 미지원이면 True).

#### 6) Warmup(워밍업) = 지표가 "신뢰할 수 있는 값"을 내기까지 필요한 봉 개수
- SMA(20)은 20개 봉이 쌓여야 첫 평균이 나옵니다. 그 전 구간은 미완성. Lean은 이 만큼을 미리 데이터로 "예열"해야 첫날부터 정상 매매합니다. 이 파일의 `_calculate_warmup`이 그 숫자를 지표별로 계산해 줍니다.

#### 7) `init_template.format(...)` = 빈칸 채우기 문자열 템플릿
- `"AroonOscillator({up_period}, {down_period})".format(up_period=25, down_period=14)` → `"AroonOscillator(25, 14)"`. 파이썬 문자열의 `{이름}` 자리를 `format(이름=값)`이 채웁니다. 이 파일이 Lean 코드를 만드는 방식.

---

## 🗺 흐름도

```
              (indicator_id, params)   ← codegen이 지표 하나당 1회 호출
                       │
                       ▼
        ┌──────────────────────────────────┐
        │  validate()  — 5단계 검수         │
        └──────────────────────────────────┘
          1. 지표 존재?  ──아니오, 캔들도 아님──▶ 에러 1건 + 즉시 반환(is_valid=False)
          │  └─ 캔들 패턴이면 ──▶ 무조건 통과(파라미터 없음)
          2. 필수 파라미터 다 있나?      ──없으면──▶ errors[]에 추가
          3. 타입·범위·허용값 맞나?      ──틀리면──▶ errors[]에 추가
          4. Lean 특수 규칙 경고          ──▶ warnings[]에 추가(에러 아님)
          5. MACD fast < slow 논리        ──위반──▶ errors[]에 추가
                       │
                       ▼
            ValidationResult(is_valid, errors[], warnings[])
                       │
        ┌──────────────┴───────────────┐
        ▼                              ▼
   raise_if_invalid()           get_lean_init_code()
   (에러면 ValueError)          ├─ validate() 먼저 호출 → raise_if_invalid()
                               ├─ 특수 규칙 있으면 그 템플릿, 없으면 레지스트리 템플릿
                               ├─ .format(**params) 로 빈칸 채움
                               └─ _calculate_warmup() → (init_code, warmup) 반환

   (캔들 전용)  get_candlestick_init_code()
        ├─ CANDLESTICK_REGISTRY 조회 (없으면 ValueError)
        ├─ lean_unsupported 면 ValueError
        └─ 'alias = LeanClass("alias")' + warmup(candle_count+5) 반환
```

---

## 📖 라인별 해설

### A. 파일 설명서 + import — `# L1-L12`

```python
# L1-L12
"""Indicator Parameter Validator.

Lean에서 지표가 정확히 동작하도록 파라미터를 검증합니다.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict, List, Optional, Tuple

from kis_backtest.core.indicator import INDICATOR_REGISTRY, IndicatorInfo
from kis_backtest.core.candlestick import CANDLESTICK_REGISTRY
```
- **무엇을**: 모듈 한 줄 목적("지표가 Lean에서 정확히 동작하도록 파라미터 검증") + 도구 import.
- `from __future__ import annotations` — 타입힌트를 문자열처럼 늦게 평가(최신 표기를 안전하게 쓰기 위한 관용 한 줄). vbt_engine.md와 동일.
- 핵심 import는 **두 레지스트리**: `INDICATOR_REGISTRY`(지표 메타)와 `CANDLESTICK_REGISTRY`(캔들 패턴 메타). 이 검증기는 자기 혼자 판단하지 않고, **"진실의 출처"인 레지스트리에 물어봐서** 필수 파라미터·출력·템플릿을 확인합니다. `IndicatorInfo`는 그 레지스트리 값의 타입(타입힌트용).

> 💡 초보 포인트: 검증 규칙이 두 종류입니다 — ① **레지스트리에서 오는 것**(필수 파라미터 목록·출력·init_template은 지표마다 다르므로 레지스트리가 보유), ② **이 파일이 직접 정한 것**(아래 `PARAM_RULES`의 범위·타입은 "period는 1~1000" 같은 공통 상식). 둘을 합쳐 검증합니다.

---

### B. 에러·결과 데이터 모델 — `# L15-L39`

```python
# L15-L23
@dataclass
class ValidationError:
    """검증 에러"""
    indicator_id: str
    param_name: str
    message: str
    expected: Any = None
    actual: Any = None
```
- **무엇을**: 검증 실패 1건을 담는 상자. "어떤 지표(`indicator_id`)의 / 어떤 파라미터(`param_name`)가 / 왜 틀렸나(`message`) / 기대값(`expected`) / 실제값(`actual`)". `expected`/`actual`은 선택(기본 None).
- **왜**: 단순히 "실패"가 아니라 **구조화된 정보**로 모아야 사람·프론트가 "fast(30)는 slow(26)보다 작아야 합니다" 같은 친절한 메시지를 만들 수 있습니다.

```python
# L25-L39
@dataclass
class ValidationResult:
    """검증 결과"""
    is_valid: bool
    errors: List[ValidationError]
    warnings: List[str]

    def raise_if_invalid(self) -> None:
        """에러가 있으면 예외 발생"""
        if not self.is_valid:
            error_msgs = [
                f"{e.indicator_id}.{e.param_name}: {e.message}"
                for e in self.errors
            ]
            raise ValueError(f"지표 파라미터 검증 실패:\n" + "\n".join(error_msgs))
```
- **무엇을**: 검증 결과 전체 묶음. `is_valid`(통과 여부) · `errors`(에러 목록) · `warnings`(경고 목록).
- **에러 vs 경고의 차이가 핵심**:
  - `errors` → 있으면 `is_valid=False` → 코드 생성 **차단**(반품).
  - `warnings` → 코드 생성을 **막지 않음**(주의 안내만). 예: "Stochastic은 slowing=1이 기본값입니다" 같은, 동작은 되지만 알아두면 좋은 사항.
- `raise_if_invalid()` — 에러가 하나라도 있으면 모든 에러 메시지를 `지표id.파라미터: 메시지` 형태로 줄줄이 묶어 **하나의 `ValueError`** 로 던집니다. 호출 측(`get_lean_init_code`)이 이걸 불러 "통과 못 하면 즉시 중단"을 강제.

> 💡 초보 포인트: `validate()`는 예외를 던지지 **않고** 결과 객체를 돌려줍니다(여러 에러를 한꺼번에 수집하기 위해). 예외로 바꾸고 싶을 때만 `raise_if_invalid()`를 따로 부릅니다. "수집은 부드럽게, 차단은 명시적으로"라는 설계.

---

### C. 파라미터 검증 규칙표 `PARAM_RULES` — `# L52-L106`

```python
# L52-L106 (발췌)
    PARAM_RULES: Dict[str, Dict[str, Any]] = {
        "period": {"type": int,   "min": 1,   "max": 1000, "description": "기간 (1~1000)"},
        "fast":   {"type": int,   "min": 1,   "max": 500,  "description": "빠른 기간 (1~500)"},
        "slow":   {"type": int,   "min": 1,   "max": 500,  "description": "느린 기간 (1~500)"},
        "signal": {"type": int,   "min": 1,   "max": 100,  "description": "시그널 기간 (1~100)"},
        "k_period": {"type": int, "min": 1,   "max": 100,  "description": "%K 기간 (1~100)"},
        "d_period": {"type": int, "min": 1,   "max": 100,  "description": "%D 기간 (1~100)"},
        "std":      {"type": float, "min": 0.1, "max": 10.0, "description": "표준편차 배수 (0.1~10.0)"},
        "multiplier": {"type": float, "min": 0.1, "max": 10.0, "description": "배수 (0.1~10.0)"},
        "direction":  {"type": str, "allowed": ["up", "down"], "description": "방향 (up 또는 down)"},
    }
```
- **무엇을**: **파라미터 이름별 검수 기준표**. 키는 파라미터 이름(`period`, `fast`…), 값은 그 파라미터가 지켜야 할 규칙 dict.
- 규칙의 종류:
  - `"type"` — 허용 타입(`int`/`float`/`str`).
  - `"min"`/`"max"` — 숫자 범위(이상/이하).
  - `"allowed"` — 문자열 허용값 목록(예: `direction`은 `"up"` 또는 `"down"`만).
  - `"description"` — 사람용 설명(검증 로직엔 안 쓰이고 자료용).
- **왜 이렇게 범위가 다른가**: `fast`/`slow`는 이동평균 기간이라 500까지, `signal`/`k_period`/`d_period`는 짧은 보조선이라 100까지, `std`/`multiplier`는 표준편차 배수라 0.1~10.0 실수. **지표 도메인 상식**을 코드화한 것.

> 💡 초보 포인트: 이 표에 **없는** 파라미터 이름은 타입·범위 검증을 건너뜁니다(L214의 `if param_name in cls.PARAM_RULES`). 예를 들어 `up_period`/`tenkan` 같은 특수 파라미터는 여기 없으므로 범위 검사를 받지 않습니다 — 필수 존재 검사(아래 2단계)는 받지만, 값 범위는 검사 대상이 아님. (고도화 여지: §🚀 참고.)

---

### D. Lean 특수 규칙표 `LEAN_SPECIAL_RULES` — `# L109-L165`

```python
# L109-L133 (발췌)
    # Lean 특수 규칙 (2026-01-30 테스트 결과 반영)
    LEAN_SPECIAL_RULES: Dict[str, Dict[str, Any]] = {
        "aroon": {
            "params": ["up_period", "down_period"],
            "init_template": "AroonOscillator({up_period}, {down_period})",
            "warning": "AroonOscillator는 up_period와 down_period 두 파라미터가 필요합니다.",
        },
        "stochastic": {
            "params": ["k_period", "d_period"],
            "init_template": "Stochastic({k_period}, 1, {d_period})",
            "warning": "Stochastic은 slowing=1이 기본값입니다.",
        },
        "ichimoku": {
            "params": ["tenkan", "kijun", "senkou_b"],
            "init_template": "IchimokuKinkoHyo({tenkan}, {kijun}, {kijun}, {senkou_b}, {kijun})",
            "warning": "Ichimoku는 5개 파라미터가 필요하며, senkou_a=kijun, chikou=kijun로 기본 설정됩니다.",
        },
        "supertrend": {
            "params": ["period", "multiplier"],
            "init_template": "SuperTrend({period}, {multiplier}, MovingAverageType.Wilders)",
            "warning": "SuperTrend은 MovingAverageType.Wilders를 사용합니다.",
        },
```
- **무엇을**: Lean의 **표준 생성자가 까다로운 지표**들을, 사용자가 준 단순 파라미터로 올바르게 초기화하기 위한 **전용 조립 설명서**. 주석에 "2026-01-30 테스트 결과 반영"이라 적혀 있어, **실제 Lean을 돌려보고 알아낸** 시그니처임을 알 수 있습니다.
- 각 항목의 키:
  - `"init_template"` — Lean 초기화 문자열 틀. 사용자가 안 준 인자를 **여기서 채워 줌**. 예: `stochastic`은 사용자가 `k_period`/`d_period`만 줘도 템플릿이 가운데 `slowing=1`을 자동 삽입(`Stochastic({k_period}, 1, {d_period})`).
  - `"warning"` — 경고 문구(에러 아님). 검증 시 `warnings`에 추가됨.
  - `"params"` — 그 지표가 다루는 파라미터 이름들(자료/문서용).
- **Ichimoku의 트릭**: Lean의 `IchimokuKinkoHyo`는 5개 인자가 필요한데, 사용자에겐 3개(`tenkan`/`kijun`/`senkou_b`)만 받고 나머지(senkou_a·chikou)를 `kijun`으로 메워 5개를 완성. **복잡도를 사용자에게서 숨기는** 전형적 패턴.

```python
# L134-L165 (발췌 — 커스텀 지표)
        "consecutive": {
            "params": ["direction"], "init_template": "0",
            "warning": "consecutive는 커스텀 로직이 필요합니다. direction='up' 또는 'down'.",
            "is_custom": True,
        },
        "disparity":      {"params": ["period"], "init_template": "SimpleMovingAverage({period})", ..., "is_custom": True},
        "volatility_ind": {"params": ["period"], "init_template": "StandardDeviation({period})", ..., "is_custom": True},
        "change":  {"params": [], "init_template": "0", ..., "is_custom": True},
        "returns": {"params": ["period"], "init_template": "RateOfChangePercent({period})", ..., "is_custom": True},
    }
```
- `"is_custom": True` — Lean 기본 지표로는 안 되고 **커스텀 계산 로직**이 필요한 항목 표시(예: `consecutive`=연속 상승/하락 일수, `disparity`=이격도, `change`=전일대비 등락률). 초기화는 단순 카운터(`"0"`)나 SMA/StandardDeviation 같은 보조 지표로 시작하고, 실제 계산은 generator가 별도 처리.

> ⚠️ 주의: `LEAN_SPECIAL_RULES`에 있는 지표라도, **그 자체로 `INDICATOR_REGISTRY`에도 등록되어 있어야** 1단계(존재 확인)를 통과합니다. 이 표는 "추가 처리 설명서"일 뿐, 지표 등록부가 아닙니다.

---

### E. 검증 본체 `validate()` — `# L167-L282` (이 파일의 알맹이)

함수 머리와 초기화:
```python
# L167-L183
    @classmethod
    def validate(cls, indicator_id: str, params: Dict[str, Any]) -> ValidationResult:
        """지표 파라미터 검증 ..."""
        errors: List[ValidationError] = []
        warnings: List[str] = []
```
- 빈 `errors`/`warnings` 리스트로 시작해, 5단계를 거치며 문제를 **누적**합니다. (한 번에 하나만 잡고 멈추는 게 아니라, 발견된 모든 문제를 모아 한꺼번에 보고 — 사용자가 여러 번 고치며 왕복하지 않도록.)

#### 1단계) 지표 존재 확인 — `# L185-L200`
```python
# L185-L200
        # 1. 지표 존재 확인
        indicator_info = INDICATOR_REGISTRY.get(indicator_id)
        is_candlestick = indicator_id in CANDLESTICK_REGISTRY

        if indicator_info is None and not is_candlestick:
            # 지원하지 않는 지표
            errors.append(ValidationError(
                indicator_id=indicator_id, param_name="",
                message=f"지원하지 않는 지표입니다. 지원 지표: {list(INDICATOR_REGISTRY.keys())}",
            ))
            return ValidationResult(is_valid=False, errors=errors, warnings=warnings)

        # 캔들스틱 패턴은 파라미터 없이 유효
        if is_candlestick:
            return ValidationResult(is_valid=True, errors=[], warnings=[])
```
- **무엇을**: 주어진 `indicator_id`가 ① 일반 지표 레지스트리에 있나(`INDICATOR_REGISTRY.get` → 없으면 `None`), 또는 ② 캔들 패턴 레지스트리에 있나 확인.
- **둘 다 아니면 → 즉시 실패하고 반환**(early return). 에러 메시지에 **지원 지표 전체 목록**을 박아, 사용자가 오타·오해를 바로 알 수 있게 함. `param_name=""`(빈칸)은 "특정 파라미터가 아니라 지표 자체 문제"라는 뜻.
- **캔들 패턴이면 → 무조건 통과**. 이유: 캔들 패턴(도지·해머…)은 **파라미터가 없으므로** 검사할 게 없습니다(L198-200, 빈 errors/warnings로 valid 반환). 캔들의 실제 코드 생성은 별도 함수 `get_candlestick_init_code`가 담당.
- `.get()` vs `in`: `INDICATOR_REGISTRY.get(id)`는 없으면 `None`을 돌려줘 KeyError를 피하고, `id in CANDLESTICK_REGISTRY`는 존재만 불리언으로 확인. **둘 다 "없어도 터지지 않는" 안전한 조회.**

#### 2단계) 필수 파라미터 존재 — `# L202-L210`
```python
# L202-L210
        # 2. 필수 파라미터 확인
        required_params = indicator_info.params
        for param_name in required_params:
            if param_name not in params:
                errors.append(ValidationError(
                    indicator_id=indicator_id, param_name=param_name,
                    message=f"필수 파라미터 '{param_name}'이(가) 없습니다.",
                ))
```
- **무엇을**: 레지스트리가 보유한 그 지표의 **필수 파라미터 목록**(`indicator_info.params`, 예: SMA는 `["period"]`)을 돌며, 사용자가 준 `params` dict에 **빠진 게 없는지** 확인. 빠지면 에러 1건.
- **왜 레지스트리에서 가져오나**: 필수 파라미터는 지표마다 다릅니다(SMA는 period 1개, MACD는 fast/slow/signal 3개). 이 "지표별 진실"은 `core/indicator.py`의 레지스트리에 단일 정의되어 있어, 검증기는 그걸 **참조만** 합니다(Single Source of Truth).

#### 3단계) 타입·범위·허용값 — `# L212-L260`
```python
# L212-L227
        # 3. 파라미터 타입 및 범위 검증
        for param_name, param_value in params.items():
            if param_name in cls.PARAM_RULES:
                rule = cls.PARAM_RULES[param_name]

                # 타입 검증
                expected_type = rule["type"]
                if not isinstance(param_value, (expected_type, int if expected_type == float else type(None))):
                    errors.append(ValidationError(
                        indicator_id=indicator_id, param_name=param_name,
                        message=f"타입 오류: {expected_type.__name__} 예상, {type(param_value).__name__} 받음",
                        expected=expected_type.__name__, actual=type(param_value).__name__,
                    ))
                    continue
```
- **무엇을**: 사용자가 준 **각 파라미터**를 돌며, `PARAM_RULES`에 규칙이 있는 것만 검사(`if param_name in cls.PARAM_RULES`).
- **타입 검증의 묘수 한 줄**: `isinstance(param_value, (expected_type, int if expected_type == float else type(None)))`. 풀면 —
  - 기대 타입이 `float`이면 **`int`도 허용**(`(float, int)`). 이유: `std=2`처럼 정수를 줘도 실수 자리에선 문제없기 때문(파이썬에서 int는 float 자리에 안전). `2.0`을 강요하지 않는 친절.
  - 기대 타입이 `float`이 아니면 두 번째 항목이 `type(None)` → 즉 `(int, NoneType)`처럼 됨. **`None`도 타입 통과**시킴(파라미터가 None이면 타입 오류로 막지 않고 통과 — 별도 단계에서 다룸).
- **타입 틀리면 `continue`**: 그 파라미터의 **범위 검사는 건너뜀**. 이유: 타입이 틀린 값(예: 문자열)에 `< min` 비교를 하면 또 다른 에러가 나므로, 타입 실패 시 더 깊이 안 들어감. (방어적 코딩.)

```python
# L229-L249
                # 범위 검증
                min_val = rule.get("min")
                max_val = rule.get("max")

                if min_val is not None and param_value < min_val:
                    errors.append(ValidationError(... message=f"값이 너무 작습니다. 최소: {min_val}",
                        expected=f">= {min_val}", actual=param_value))

                if max_val is not None and param_value > max_val:
                    errors.append(ValidationError(... message=f"값이 너무 큽니다. 최대: {max_val}",
                        expected=f"<= {max_val}", actual=param_value))
```
- **무엇을**: 규칙에 `min`/`max`가 있으면(`rule.get`은 없으면 None) 범위를 벗어났는지 검사. 너무 작으면/너무 크면 각각 에러.
- `min_val is not None` 가드: `direction`처럼 min/max가 없는 규칙에선 범위 검사를 건너뜀(`allowed`만 있는 항목).

```python
# L251-L260
                # 허용값 검증 (string 타입용)
                allowed = rule.get("allowed")
                if allowed is not None and param_value not in allowed:
                    errors.append(ValidationError(... message=f"허용되지 않는 값: {param_value}. 허용값: {allowed}",
                        expected=str(allowed), actual=param_value))
```
- **무엇을**: `allowed` 목록이 있는 규칙(현재 `direction`)에서, 값이 그 목록(`["up","down"]`)에 없으면 에러. 문자열 enum 검증.

#### 4단계) Lean 특수 규칙 경고 — `# L262-L266`
```python
# L262-L266
        # 4. Lean 특수 규칙 경고
        if indicator_id in cls.LEAN_SPECIAL_RULES:
            rule = cls.LEAN_SPECIAL_RULES[indicator_id]
            if "warning" in rule:
                warnings.append(rule["warning"])
```
- **무엇을**: 특수 지표면 그 `warning` 문구를 **경고 목록에 추가**. 이건 **에러가 아니라 안내** — `is_valid`에 영향 없음. "동작은 하지만 알아두라"는 친절한 메모.

#### 5단계) MACD 논리 검증 (fast < slow) — `# L268-L279`
```python
# L268-L279
        # 5. MACD fast < slow 검증
        if indicator_id == "macd":
            fast = params.get("fast", 12)
            slow = params.get("slow", 26)
            if fast >= slow:
                errors.append(ValidationError(
                    indicator_id=indicator_id, param_name="fast",
                    message=f"fast({fast})는 slow({slow})보다 작아야 합니다.",
                    expected=f"fast < slow", actual=f"fast={fast}, slow={slow}",
                ))
```
- **무엇을**: 타입·범위만으로는 못 잡는 **"파라미터 사이의 논리적 관계"** 검사. MACD에서 빠른선 기간(`fast`)이 느린선 기간(`slow`)보다 크거나 같으면 **개념적으로 틀림**(빠른선이 느린선보다 느릴 순 없음) → 에러.
- `params.get("fast", 12)` — 없으면 MACD 표준 기본값(12/26)을 가정하고 비교(보수적으로 동작).
- **이게 "논리 오류" 검증의 모범 사례**: 각 값은 멀쩡해도(둘 다 정수, 범위 내) **조합이 말이 안 되는** 경우. vbt_engine.md의 "0으로 나누기 방지"처럼, 단순 타입검사 너머의 의미론적 검증.

```python
# L281-L282
        is_valid = len(errors) == 0
        return ValidationResult(is_valid=is_valid, errors=errors, warnings=warnings)
```
- **마무리**: 에러가 **0건이면** `is_valid=True`. 경고는 `is_valid`에 **영향 없음**(경고만 있고 에러 0이면 통과). 결과 객체로 반환.

> 💡 초보 포인트: 5단계 전체가 "**모으고 마지막에 판정**"입니다. 1단계만 예외적으로 즉시 반환(지표 자체가 없으면 더 검사할 게 없으니까). 나머지는 끝까지 돌며 에러를 쌓아, 사용자가 한 번에 모든 문제를 봅니다.

---

### F. Lean 초기화 코드 생성 `get_lean_init_code()` — `# L284-L318`

```python
# L284-L318 (발췌)
    @classmethod
    def get_lean_init_code(cls, indicator_id, params, name="indicator") -> Tuple[str, int]:
        # 검증
        result = cls.validate(indicator_id, params)
        result.raise_if_invalid()

        # 특수 규칙 확인
        if indicator_id in cls.LEAN_SPECIAL_RULES:
            rule = cls.LEAN_SPECIAL_RULES[indicator_id]
            template = rule["init_template"]
            init_code = f"{name} = {template.format(**params)}"
        else:
            # 기본 템플릿 사용
            indicator_info = INDICATOR_REGISTRY[indicator_id]
            init_code = indicator_info.init_template.format(name=name, **params)

        # Warmup 기간 계산
        warmup = cls._calculate_warmup(indicator_id, params)
        return init_code, warmup
```
- **무엇을**: 검증을 통과한 지표를 **실제 Lean 초기화 코드 문자열 + warmup 봉 수** 로 변환. 반환은 `(코드, warmup)` 튜플.
- **첫 두 줄이 안전 게이트**(L302-303): `validate()` → `raise_if_invalid()`. **검증 없이는 절대 코드를 못 만듭니다.** 잘못된 입력이면 여기서 `ValueError`로 즉시 중단(사전 실패).
- **템플릿 선택 분기**:
  - 특수 지표면 `LEAN_SPECIAL_RULES`의 `init_template`을 쓰고, 변수명(`name`)을 앞에 붙여 `name = AroonOscillator(25, 14)` 형태로 조립(L309).
  - 일반 지표면 레지스트리의 `init_template`을 사용 — 이 템플릿엔 `{name}`이 이미 포함되어 있어(예: `"{name} = SimpleMovingAverage({period})"`, 근거 `core/indicator.py:200`) `format(name=name, **params)`로 한 번에 채움(L313).
- `**params` — dict를 키워드 인자로 펼침. `{"period":20}` → `format(period=20)`. 템플릿의 `{period}` 자리가 20으로 채워짐.

> ⚠️ 헷갈림 주의: **특수 템플릿엔 `{name}`이 없어서** 코드가 직접 `f"{name} = ..."`로 앞에 붙이고(L309), **일반 템플릿엔 `{name}`이 있어서** `.format(name=name, ...)`로 채웁니다(L313). 두 경로의 `name` 처리 방식이 다르다는 점이 미묘한 디테일.

---

### G. Warmup 계산 `_calculate_warmup()` — `# L320-L344`

```python
# L320-L344
    @classmethod
    def _calculate_warmup(cls, indicator_id, params) -> int:
        if indicator_id in ["sma","ema","rsi","atr","cci","momentum","roc","williams_r","maximum","minimum","donchian"]:
            return params.get("period", 14) + 1
        elif indicator_id == "macd":
            return params.get("slow", 26) + params.get("signal", 9)
        elif indicator_id == "bollinger":
            return params.get("period", 20) + 1
        elif indicator_id == "stochastic":
            return params.get("k_period", 14) + params.get("d_period", 3)
        elif indicator_id == "adx":
            return params.get("period", 14) * 2
        elif indicator_id == "supertrend":
            return params.get("period", 10) + 1
        elif indicator_id == "keltner":
            return params.get("period", 20) + 1
        elif indicator_id == "aroon":
            return max(params.get("up_period", 25), params.get("down_period", 25)) + 1
        elif indicator_id == "ichimoku":
            return params.get("senkou_b", 52) + params.get("kijun", 26)
        elif indicator_id == "consecutive":
            return 2  # 연속 카운터는 최소 2일 필요
        else:
            return 30  # 기본값
```
- **무엇을**: 지표가 첫 유효값을 내기까지 필요한 봉 개수를 **지표별 공식**으로 계산. 함수명 앞 `_`는 내부용.
- **공식의 논리**(왜 이 숫자인가):
  - 단순 기간형(SMA·EMA·RSI 등) → `period + 1`(기간만큼 + 여유 1봉).
  - `macd` → `slow + signal`(느린선이 형성된 뒤 그 위에 signal 평균이 또 쌓여야 함).
  - `stochastic` → `k_period + d_period`(K선 위에 D선이 얹힘).
  - `adx` → `period * 2`(ADX는 DI 계산 후 다시 평활화해 2배 필요).
  - `aroon` → `max(up_period, down_period) + 1`(둘 중 긴 쪽 기준).
  - `ichimoku` → `senkou_b + kijun`(가장 긴 선행스팬 + 기준선).
  - `consecutive` → 항상 2(연속 비교엔 최소 이틀).
  - **그 외 → 30**(보수적 기본값).
- `params.get("period", 14)` — 안 주면 합리적 기본값 가정(SMA류 14, MACD slow 26 등). **목록에 없는 지표는 30** 으로 안전하게 처리.

> 💡 초보 포인트: warmup이 **부족하면** 전략 첫날부터 지표가 NaN이라 매매가 어긋나고, **과하면** 백테스트 시작이 늦어집니다(데이터 일부 소진). 그래서 지표별로 딱 맞는 값을 정밀하게 계산.

---

### H. 출력 필드 검증 `validate_output()` — `# L346-L369`

```python
# L346-L369
    @classmethod
    def validate_output(cls, indicator_id: str, output: str) -> bool:
        indicator_info = INDICATOR_REGISTRY.get(indicator_id)
        if indicator_info is None:
            return False

        # 기본 output은 "value"
        if output == "value":
            return True

        # 멀티 아웃풋 지표인 경우 outputs 딕셔너리 확인
        if indicator_info.outputs:
            return output in indicator_info.outputs

        return False
```
- **무엇을**: "이 지표가 그 **출력 필드**를 갖는가?"를 True/False로 답함. 예: MACD는 `signal`/`histogram` 출력이 있지만 SMA는 `value`만.
- 판정 순서:
  1. 지표가 없으면 `False`.
  2. `output == "value"`면 무조건 `True`(모든 지표의 기본 출력은 value).
  3. 멀티아웃풋 지표(`indicator_info.outputs`가 비어있지 않음)면, 요청한 `output`이 그 dict의 키에 있는지 확인(근거: `IndicatorInfo.outputs`, `core/indicator.py:184`).
  4. 위 어디에도 안 걸리면 `False`(단일출력 지표에 `value` 아닌 필드를 요청한 경우).
- **왜 필요**: `MACD(...).output = "signal"`처럼 조건이 특정 출력 핀을 가리킬 때, 그 핀이 실제로 존재하는지 codegen이 미리 확인해야 잘못된 Lean 코드를 막음.

---

### I. TradeBar 필요 여부 `requires_tradebar()` — `# L371-L385`

```python
# L371-L385
    @classmethod
    def requires_tradebar(cls, indicator_id: str) -> bool:
        indicator_info = INDICATOR_REGISTRY.get(indicator_id)
        if indicator_info is None:
            return False
        return indicator_info.requires_tradebar
```
- **무엇을**: 그 지표가 종가만으로 갱신 가능한지, 아니면 **TradeBar(OHLCV 전체)** 가 필요한지를 레지스트리 플래그(`requires_tradebar`)로 그대로 전달. 없는 지표면 `False`.
- **왜 중요**(근거: `core/indicator.py:175-177`): TradeBar 필요 지표는 Lean에서 `Update(TradeBar)`로 갱신해야 하고, 아니면 `Update(DateTime, decimal)`로 종가만 넣어도 됩니다. 예: ATR·Stochastic·Williams %R 등 고저가가 필요한 지표는 `requires_tradebar=True`(레지스트리에서 확인됨). generator는 이 답에 따라 **갱신 코드를 다르게 생성**합니다.

---

### J. 캔들 패턴 초기화 코드 `get_candlestick_init_code()` — `# L387-L432`

```python
# L387-L418 (발췌)
    @classmethod
    def get_candlestick_init_code(cls, pattern_id: str, alias: str) -> Tuple[str, int]:
        pattern_info = CANDLESTICK_REGISTRY.get(pattern_id)
        if pattern_info is None:
            raise ValueError(f"Unknown candlestick pattern: {pattern_id}")

        if pattern_info.lean_unsupported:
            raise ValueError(
                f"캔들스틱 패턴 '{pattern_id}' ({pattern_info.lean_class})은(는) "
                f"현재 Lean 버전에서 지원하지 않습니다. {pattern_info.description}"
            )
```
- **무엇을**: 캔들 패턴(도지·해머·장악형…) 전용 초기화 코드 생성. 일반 지표와 경로가 달라 별도 함수.
- **두 단계 방어**:
  1. 레지스트리에 없는 패턴 → `ValueError`(즉시 중단). 일반 지표의 `validate()`처럼 결과 객체가 아니라 **바로 예외**를 던지는 점이 다름(이 함수는 검증+생성을 한 번에 하므로).
  2. `lean_unsupported=True`인 패턴(현재 Lean 버전이 지원 안 하는 것) → 친절한 한국어 메시지로 `ValueError`. 근거: `core/candlestick.py:68`의 `lean_unsupported` 플래그.

```python
# L420-L432
        lean_class = pattern_info.lean_class
        candle_count = pattern_info.candle_count

        # Lean 초기화 코드 생성 (직접 클래스 생성자 사용)
        init_code = f'{alias} = {lean_class}("{alias}")'

        # Warmup: 캔들 수 + 여유분
        warmup = candle_count + 5
        return init_code, warmup
```
- **코드 생성**: `alias = LeanClassName("alias")` 형태. 예: `my_doji = Doji("my_doji")`. 주석(L424-426)이 설명하듯, `CandlestickPatterns.X()`(QCAlgorithm 헬퍼, symbol 필요) 대신 **직접 클래스 생성자**(이름만 필요)를 사용.
- **warmup = candle_count + 5**: 패턴이 보는 캔들 수(1~3) + 여유 5봉. 단순·보수적.
- **출력 해석**(docstring L402-407): 캔들 패턴은 `Current.Value`로 신호를 읽으며 **+1=상승(bullish) / -1=하락(bearish) / 0=신호없음**.

---

## ⚠️ 함정·주의 (코드에 박힌 교훈)

1. **`PARAM_RULES`에 없는 파라미터는 타입·범위 무검증** — `up_period`/`tenkan`/`senkou_b` 등 특수 파라미터는 이 표에 없어 **범위 검사를 받지 않습니다**. 음수나 0을 줘도 타입·범위 단계에선 안 걸림(필수존재·논리검증만 받음). 새 지표 추가 시 주의.
2. **타입 검증의 `None` 통과** — `isinstance(..., (..., type(None)))` 분기로, float 아닌 파라미터에 `None`을 주면 **타입 오류로 막지 않습니다**(L219). 의도된 허용이지만, None이 그대로 `format`/범위비교로 흘러가면 다른 곳에서 터질 수 있음(특수 템플릿 `format(**params)`에 None이 들어가면 문자열 "None"이 코드에 박힘).
3. **`validate`는 예외를 안 던진다** — 결과 객체만 반환. 차단하려면 `raise_if_invalid()`를 명시적으로 불러야 함. `get_lean_init_code`는 부르지만, `validate`를 직접 쓰는 외부 코드는 `is_valid`를 직접 확인해야 함.
4. **경고는 차단하지 않음** — `warnings`가 아무리 많아도 `is_valid`는 에러 0이면 True. 경고를 에러로 오해하면 안 됨.
5. **일반 vs 특수 템플릿의 `{name}` 처리 차이** — 일반 템플릿엔 `{name}`이 들어 있고(레지스트리), 특수 템플릿엔 없어서 코드가 `f"{name} = ..."`로 직접 붙임(L309 vs L313). 한쪽 규칙만 알고 새 항목을 추가하면 코드가 어긋남.
6. **MACD 논리검증은 MACD 전용 하드코딩** — `fast < slow` 같은 관계 검증이 `if indicator_id == "macd"`로 한 지표에만 박혀 있음. 같은 논리가 필요한 다른 지표(예: stoch_rsi의 기간 관계)는 검증되지 않음.
7. **`get_candlestick_init_code`는 결과 객체가 아닌 예외로 실패** — 일반 지표 경로(`validate` → 결과)와 달리 바로 `ValueError`. 호출 측이 try/except로 감싸야 함.

---

## 🚀 고도화 아이디어 (강의·개선용)

- **특수 파라미터까지 규칙화**: `up_period`·`down_period`·`tenkan`·`kijun`·`senkou_b`·`rsi_period`·`stoch_period` 등을 `PARAM_RULES`에 추가하면 함정 1·2가 해소되어 범위 검증이 빈틈없어짐.
- **논리 관계 검증을 데이터로**: MACD의 `fast < slow`처럼 하드코딩된 관계를 `RELATION_RULES`(예: `{"macd": [("fast","<","slow")], "stoch_rsi": [...]}`)로 빼면 새 관계를 코드 수정 없이 추가. (vbt_engine.md의 "파라미터=다이얼"처럼, 검증규칙도 데이터로.)
- **`None` 가드 명시화**: 필수 파라미터에 `None`이 들어오면 "필수 파라미터가 None" 에러를 별도로 추가해, 함정 2의 잠복 버그를 사전 단계에서 차단.
- **warmup 계산 통합**: `_calculate_warmup`의 긴 `if/elif`를 `WARMUP_RULES` dict + 람다로 전환하면 가독성·확장성↑. 목록에 없는 지표가 30으로 뭉뚱그려지는 것도 지표별로 정밀화.
- **경고를 결과에 등급 부여**: warning을 `INFO/WARN` 등급으로 나눠 프론트가 색을 달리 표시(현재는 문자열 한 줄).
- **검증 결과 캐싱**: 같은 (indicator_id, params) 조합은 결과가 동일하므로(결정론적), 반복 호출 시 캐시로 절약 — 다만 입력이 dict라 해시 키 설계 필요.
- **단위 테스트 동봉**: 각 단계(존재·필수·타입·범위·허용값·MACD논리·캔들 미지원)별 실패 케이스를 표로 만들어 강의 실습 자료화.

---

## 📚 용어 사전 (이 파일 한정)

| 용어 | 뜻 |
|---|---|
| **유효성 검증(validation)** | 입력이 규칙을 지키는지 입구에서 검사해 잘못된 값을 차단 |
| **사전(pre-flight) 실패** | 비싼 실행(Lean Docker) 전에 값싸게 잡는 실패 — 이 파일의 목적 |
| **`ValidationError`** | 검증 실패 1건(지표id·파라미터·메시지·기대값·실제값)을 담는 dataclass |
| **`ValidationResult`** | 검증 결과 묶음(`is_valid`·`errors[]`·`warnings[]`) + `raise_if_invalid()` |
| **에러 vs 경고** | 에러는 코드 생성을 차단(is_valid=False), 경고는 안내만(차단 안 함) |
| **`PARAM_RULES`** | 파라미터 이름별 타입·범위·허용값 규칙 사전(이 파일이 직접 정의) |
| **`LEAN_SPECIAL_RULES`** | Lean 특수 지표의 init_template·warning·is_custom 설명서 |
| **`INDICATOR_REGISTRY`** | 지표 메타데이터 명부(필수 params·outputs·init_template·requires_tradebar 보유) |
| **`CANDLESTICK_REGISTRY`** | 캔들 패턴 메타 명부(lean_class·candle_count·lean_unsupported) |
| **`@classmethod` / `cls`** | 인스턴스 없이 클래스에 직접 매달린 메서드. `cls`는 클래스 자신 |
| **`init_template`** | `{name}`·`{period}` 등 빈칸을 가진 Lean 초기화 코드 틀. `.format()`으로 채움 |
| **warmup(워밍업)** | 지표가 유효값을 내기까지 필요한 봉 개수(예: SMA(20)→21) |
| **TradeBar / `requires_tradebar`** | OHLCV 전체가 필요한 지표 표시. True면 `Update(TradeBar)`로 갱신 |
| **멀티아웃풋 / `outputs`** | 한 지표가 여러 출력(value·signal·histogram…)을 갖는 경우의 템플릿 dict |
| **`lean_unsupported`** | 현재 Lean 버전이 지원 안 하는 캔들 패턴 표시(True면 코드생성 시 ValueError) |
| **early return** | 더 검사할 필요 없을 때 함수 도중 즉시 반환(1단계 지표 부재 시) |
| **결정론적(deterministic)** | 같은 입력이면 항상 같은 결과 — 이 검증기는 외부호출·랜덤 없음 |
