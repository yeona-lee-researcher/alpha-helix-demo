# `strategies/preset/` — 내장 전략 10종 완전 해설 (전략별 매매논리 + 핵심 코드)

> 원본: `analytics/app/lean/kis_backtest/strategies/preset/*.py` (각 ~140-200줄, 10개 파일)
> 선행 학습: [`00_overview.md`](00_overview.md)(벤더 라이브러리 지도) · [`strategies_core.md`](strategies_core.md)(BaseStrategy·Registry 코어)
> 형식 기준: 모범 [`01_backtest/vbt_engine.md`](../01_backtest/vbt_engine.md) · [README "3. 공통 형식"](../README.md)
> ⚠️ 이 문서는 **실제 코드만** 다룹니다. 추측·일반론은 "사전 지식" 섹션에 한정하고, 전략 해설은 전부 라인 인용으로 뒷받침합니다.

---

## 📌 한눈에

이 폴더는 **"바로 쓰는 전략 레시피북 10선"** 입니다. 사용자가 코드를 한 줄도 안 짜도, 프론트엔드에서 전략 이름(`sma_crossover` 등)과 파라미터(`fast_period=5`)만 고르면 그대로 Lean 백테스트가 돌아갑니다. 각 레시피(`.py` 파일 하나 = 전략 하나)는 똑같은 틀([`BaseStrategy`](strategies_core.md) 상속)을 따르며, **"무슨 지표를 쓰고(indicators) / 언제 사고(entry_condition) / 언제 파나(exit_condition) / 어떻게 손실을 막나(risk_management)"** 네 가지를 채워 넣은 것뿐입니다.

> 비유: 똑같은 **레시피 카드 양식**(재료칸·조리시작칸·조리끝칸·안전수칙칸)이 10장 있고, 각 카드에 다른 요리(전략)가 적혀 있습니다. 양식이 같아서 주방(codegen·Lean)은 어떤 카드가 와도 똑같이 처리할 수 있습니다.

### 전략 10종 한 줄 요약표

| # | id | 이름 | 카테고리 | 한 줄 매매 아이디어 | 핵심 지표 |
|---|---|---|---|---|---|
| 1 | `sma_crossover` | SMA 골든/데드 크로스 | `trend` | 단기선이 장기선을 위로 뚫으면 사고, 아래로 뚫으면 판다 | `SMA`×2 |
| 2 | `momentum` | 모멘텀 | `momentum` | N일 수익률이 임계치보다 높으면 사고, 낮으면 판다 | `ROC` |
| 3 | `week52_high` | 52주 신고가 돌파 | `trend` | 종가가 52주 최고가를 새로 갱신하면 산다(청산은 손절/익절) | `Maximum` |
| 4 | `consecutive_moves` | 연속 상승·하락 | `momentum` | N일 연속 오르면 사고, N일 연속 내리면 판다 | `ROC(1)`+커스텀 |
| 5 | `ma_divergence` | 이동평균 이격도 | `mean_reversion` | 가격이 평균보다 너무 빠지면(이격도<0.9) 사고, 너무 오르면(>1.1) 판다 | `SMA`+가격비율 |
| 6 | `false_breakout` | 추세 돌파 후 이탈 | `trend` | 전고점 돌파 후 며칠 안에 다시 무너지면(가짜 돌파) 손절 | `Maximum`+커스텀 |
| 7 | `strong_close` | 강한 종가 | `momentum` | 종가가 당일 고가에 바짝 붙으면(IBS 높음) 사고, 저가에 붙으면 판다 | `IBS` |
| 8 | `volatility_breakout` | 변동성 축소 후 확장 | `volatility` | 변동성이 쪼그라든 뒤 가격이 급등하면 사고, 급락하면 판다 | `ATR`+`ROC(1)`+커스텀 |
| 9 | `short_term_reversal` | 단기 반전 | `mean_reversion` | 5일 평균보다 M% 빠지면 사고(반등 기대), M% 오르면 판다 | `SMA(5)`+가격비율 |
| 10 | `trend_filter_signal` | 추세 필터 + 시그널 | `composite` | 추세선 위 + 당일 상승이면 사고, 추세선 아래 + 당일 하락이면 판다 | `SMA`+`ROC(1)`(AND) |

> 누가 호출하나? → `00_overview.md` 의 데이터 흐름대로, `runner.py` 가 `import ...preset`(자동 등록)한 뒤 `StrategyRegistry` 에서 id로 꺼내 `build()` → `StrategyDefinition` → codegen → Lean 코드로 번역합니다. **이 파일들은 "전략 정의서"** 일 뿐, 실제 백테스트 계산은 Lean(QuantConnect)이 합니다.

---

## 🧠 사전 지식 (이거 모르면 막힘)

### 1) 전략 3대 철학 — 추세추종 vs 평균회귀 vs 돌파

10개 전략은 결국 3가지 큰 철학 중 하나(또는 섞은 것)입니다. 이걸 먼저 알면 각 전략이 "왜 그렇게 사고파는지"가 단번에 보입니다.

| 철학 | 핵심 믿음 | "언제 사나" | 강한 국면 | 약한 국면 |
|---|---|---|---|---|
| **추세추종(trend following)** | "오르는 건 더 오른다(관성)" | 가격/지표가 **위로** 갈 때 | 한 방향으로 쭉 가는 강한 추세장 | 위아래로 출렁이는 횡보장(휩쏘) |
| **평균회귀(mean reversion)** | "너무 벗어나면 제자리로 돌아온다(고무줄)" | 가격이 평균보다 **많이 빠졌을** 때 | 일정 범위 안에서 오르내리는 횡보장 | 한 방향으로 무너지는 추세장(빠진 게 더 빠짐) |
| **돌파(breakout)** | "벽(고점/저항)을 뚫으면 새 추세 시작" | 가격이 **신고가·전고점을 넘는** 순간 | 박스를 깨고 신고가 행진하는 장 | 뚫은 척하고 다시 무너지는 가짜 돌파장 |

이 분류로 10종을 묶으면:

```
추세추종 ─ sma_crossover · trend_filter_signal · momentum · consecutive_moves · strong_close
평균회귀 ─ ma_divergence · short_term_reversal
돌    파 ─ week52_high · false_breakout(돌파 실패에 베팅) · volatility_breakout(축소→확장 돌파)
```

> 같은 시장이라도 국면(regime)에 따라 어떤 철학이 통하는지가 달라집니다. 그래서 우리 시스템엔 [`04_robust/regime.md`](../04_robust/regime.md)(국면 판별)와 [`trust_score.md`](../04_robust/trust_score.md)(신뢰점수)가 따로 있습니다.

### 2) `crosses_above` / `crosses_below` = "교차하는 순간"만 True

`A.crosses_above(B)` 는 **"어제는 A≤B였는데 오늘 A>B로 뒤집힌 그 하루"** 만 신호로 잡습니다. 계속 위에 있는 동안은 신호가 아닙니다(`vbt_engine.md` 의 `crossed_above` 와 같은 개념). 단순 비교 `A > B`(쭉 위면 매일 True)와는 **완전히 다릅니다** — 1번 전략 docstring 의 `⚠️ 교차(Cross) 조건 사용 - 단순 비교가 아님!` 경고가 이 차이를 강조합니다.

### 3) 이 폴더의 전략이 "조건을 만드는" 방식 — DSL 지표 객체

`vbt_engine` 은 `vbt.MA.run(...)` 으로 **숫자(Series)** 를 만들어 신호를 계산했지만, 여기 프리셋들은 **지표 객체**(`dsl.helpers` 의 `SMA`, `ROC`, `Maximum`, `ATR`, `IBS`, `Price`)를 만들어 `>`·`<`·`&` 같은 연산자로 **"조건 객체(Condition)"** 를 선언합니다.

```python
fast = SMA(5, alias="sma_fast")     # 5일 단순이동평균 "지표 객체"
slow = SMA(20, alias="sma_slow")    # 20일 SMA 지표 객체
fast.crosses_above(slow)            # → Condition 객체 (숫자가 아니라 "규칙")
```

이게 가능한 이유(연산자 오버로딩·Condition 트리)는 `strategies_core.md` 와 `00_overview.md` 의 핵심개념 1번에 있습니다. 여기서는 **"`SMA(5) > SMA(20)` 같은 식이 숫자 비교가 아니라 규칙 그 자체를 만든다"** 만 기억하면 됩니다.

### 4) ⚠️ 가장 중요한 함정 — "Python 조건"과 "진짜 Lean 로직"이 다른 전략이 있다

각 전략은 메서드를 **두 종류** 가집니다:
- `entry_condition()` / `exit_condition()` — DSL Condition (단순·표준 경로).
- `to_lean_params()` 의 `lean_condition` / `custom_logic`, 그리고 `get_custom_lean_code()` — **Lean 코드로 실제 들어가는 로직**.

4개 전략(`consecutive_moves`·`false_breakout`·`volatility_breakout`, 그리고 `week52_high`)은 **`entry_condition()` 이 단순화된 자리표시(placeholder)** 이고, 진짜 의도는 `get_custom_lean_code()`/`custom_logic` 에 있습니다. 코드 주석이 직접 그렇게 말합니다(예: consecutive_moves `L92-93`: `"실제 N일 연속 상승은 Lean 코드에서 구현"`). **이 문서는 두 경로를 모두 인용**해 진짜 매매 규칙을 보여줍니다.

### 5) 지표 미니 사전 (이 폴더에 등장하는 것만)

| 지표 | 한 줄 뜻 | 쓰는 전략 |
|---|---|---|
| `SMA(n)` | n일 단순이동평균(최근 n일 종가 평균) | 1·5·9·10 |
| `ROC(n)` | n일 변화율(%) = (오늘÷n일전 −1)×100. `ROC(1)` = 전일 대비 등락률 | 2·4·8·10 |
| `Maximum(n)` | 최근 n일 중 최고가 | 3·6 |
| `ATR(n)` | Average True Range = 하루 변동폭의 n일 평균(변동성 크기) | 8 |
| `IBS(...)` | Internal Bar Strength = (종가−저가)/(고가−저가). 0~1, 클수록 종가가 고가에 가까움 | 7 |
| `Price.close()` | 그날의 종가 자체를 지표처럼 다루는 객체 | 3·5·6·9·10 |

---

## 🗺 전체 흐름도 (모든 프리셋 공통 골격)

10개 파일은 클래스 이름·파라미터·조건만 다를 뿐, **뼈대가 완전히 동일**합니다.

```
@register("id", name=..., category=..., tags=...)   ← 레지스트리에 자동 등록(데코레이터)
class XxxStrategy(BaseStrategy):
    PARAM_DEFINITIONS = { ... }      ← 파라미터 명세(기본값·min·max·type) = 프론트가 읽는 다이얼 정의
    def __init__(self, ...):         ← 파라미터를 인스턴스에 저장
    @property id / name / category / description
    def indicators()      → 쓰는 지표 객체 목록
    def entry_condition() → 매수 규칙(Condition)        ┐
    def exit_condition()  → 매도 규칙(Condition)        ├─ build() 가 모아서
    def risk_management() → 손절/익절(RiskManagement)   │   StrategyDefinition 으로 묶음
    (선택) get_custom_lean_code() → 지표로 표현 못하는 특수 로직
    def build()           → StrategyDefinition 반환  ◀──┘  (codegen 의 입력)
    def to_lean_params()  → Lean 코드 생성용 세부(지표 init·warmup·lean_condition)
```

> 그래서 "한 전략을 읽으면 나머지 9개의 80%를 읽은 것" 입니다. 아래 1번(sma_crossover)에서 공통 뼈대를 자세히 보고, 2~10번은 **다른 부분(매매 논리)만** 집중해 설명합니다.

---

## 📖 전략별 해설

각 전략: **매매 아이디어 → 진입/청산 규칙 → 핵심 코드 인용 → 강한/약한 국면** 순. 라인 번호는 해당 전략 `.py` 파일 기준입니다.

---

### 1) `sma_crossover` — SMA 골든/데드 크로스 (카테고리: `trend`) — 공통 뼈대 포함

**매매 아이디어**: 단기 추세(빠른 평균선)가 장기 추세(느린 평균선)를 **위로 추월**하면 상승세 시작으로 보고 매수(골든크로스), **아래로 추월**하면 하락세 시작으로 보고 매도(데드크로스). 대표적인 **추세추종**.

**진입/청산 규칙**:
- 진입: `SMA(5)` 가 `SMA(20)` 를 상향 돌파(`crosses_above`).
- 청산: `SMA(5)` 가 `SMA(20)` 를 하향 돌파(`crosses_below`).
- 추가 안전장치: 손절 5% / 익절 10%.

먼저 **모든 프리셋 공통인 등록·파라미터 부분**:

```python
# L22-L28  레지스트리 자동 등록 (데코레이터)
@register(
    "sma_crossover",
    name="SMA 골든/데드 크로스",
    category="trend",
    description="단기 SMA가 장기 SMA를 상향 돌파하면 매수 ...",
    tags=["sma", "trend", "crossover", "golden_cross", "death_cross"],
)
class SMACrossoverStrategy(BaseStrategy):
```
- `@register("sma_crossover", ...)` — 이 한 줄이 클래스를 **중앙 명부(StrategyRegistry)에 "sma_crossover" 라는 id로 자동 등록**합니다. 그래서 `runner.py` 가 `import ...preset` 만 해도 10종이 전부 명부에 올라갑니다(`__init__.py` 가 10개를 import → 각 파일의 `@register` 실행).

```python
# L48-L53  PARAM_DEFINITIONS — 파라미터 명세(= 프론트의 다이얼)
PARAM_DEFINITIONS = {
    "fast_period": {"default": 5, "min": 2, "max": 50, "type": "int", "description": "단기 SMA 기간"},
    "slow_period": {"default": 20, "min": 10, "max": 200, "type": "int", "description": "장기 SMA 기간"},
    "stop_loss_pct": {"default": 5.0, "min": 1, "max": 20, "type": "float", "description": "손절 %"},
    "take_profit_pct": {"default": 10.0, "min": 2, "max": 50, "type": "float", "description": "익절 %"},
}
```
- 각 파라미터의 **기본값·최소·최대·타입** 을 적어둔 표. 프론트엔드는 이 정보를 읽어 슬라이더/입력칸의 범위를 자동으로 만듭니다(`base.py` 의 `get_param_definitions`). "Single Source of Truth" — 파라미터 정보를 여기 한 곳에만 둠.

이제 **이 전략의 알맹이**(매매 규칙):

```python
# L95-L105  진입/청산 = 두 SMA 의 교차
def entry_condition(self) -> Condition:
    fast = SMA(self.fast_period, alias="sma_fast")
    slow = SMA(self.slow_period, alias="sma_slow")
    return fast.crosses_above(slow)        # 골든크로스 = 매수

def exit_condition(self) -> Condition:
    fast = SMA(self.fast_period, alias="sma_fast")
    slow = SMA(self.slow_period, alias="sma_slow")
    return fast.crosses_below(slow)        # 데드크로스 = 매도
```
- `crosses_above`(교차 순간)라는 점이 핵심 — 파일 맨 위 docstring `L7`: `⚠️ 교차(Cross) 조건 사용 - 단순 비교가 아님!`. `fast > slow`(쭉 위면 매일 매수)와 달리 **뒤집히는 그 하루** 만 매수.

```python
# L114-L126  build() — 네 조각을 StrategyDefinition 으로 묶음 (모든 프리셋 동일 패턴)
def build(self) -> StrategyDefinition:
    return StrategyDefinition(
        id=self.id, name=self.name, category=self.category, description=self.description,
        indicators=[ind.to_dict() for ind in self.indicators()],
        entry=self.entry_condition().to_dict(),
        exit=self.exit_condition().to_dict(),
        risk_management=self.risk_management().to_dict(),
        params=self._build_params(),       # PARAM_DEFINITIONS + 현재값
    )
```
- `build()` 는 지표·진입·청산·리스크·파라미터를 **불변 표준정의(StrategyDefinition)** 로 포장합니다. 이게 codegen 의 입력. **10개 전략 모두 이 모양** 이라 2~10번에서는 생략합니다.

```python
# L143-L156  to_lean_params() — Lean 코드로 번역될 실제 조건
"entry": {
    "type": "cross_above", "indicator1": "sma_fast", "indicator2": "sma_slow",
    "lean_condition": "self.prev_sma_fast <= self.prev_sma_slow and sma_fast > sma_slow",
},
```
- 교차를 Lean 에서 어떻게 구현하는지 보여주는 부분: **"어제는 fast≤slow, 오늘은 fast>slow"**. `crosses_above` 의 정의 그 자체를 코드로 푼 것.

**강한 국면 / 약한 국면**: 강한 추세장(한 방향으로 쭉)에서 강함. **횡보장에서 약함** — 단기·장기선이 자주 엉켜 골든/데드 크로스가 반복되며 **휩쏘(잦은 손실 매매)** 가 납니다. 그래서 손절/익절이 안전장치로 붙어 있습니다.

---

### 2) `momentum` — 모멘텀 (카테고리: `momentum`)

**매매 아이디어**: "최근 N일 동안 많이 오른 종목은 계속 오른다"는 **모멘텀(추세추종 계열)**. 단일 종목에선 **절대 모멘텀**(수익률>0)만 적용(랭킹은 상위 Portfolio 레이어 몫 — docstring `L45-47`).

**진입/청산 규칙**:
- 진입: `ROC(lookback)` > `threshold` (N일 수익률이 임계치 초과).
- 청산: `ROC(lookback)` < `-threshold`.
- 기본값 `lookback=60, threshold=0.0` → 사실상 "60일 수익률이 양수면 매수, 음수면 매도".

```python
# L91-L99  진입/청산 = N일 수익률 부호
def entry_condition(self) -> Condition:
    roc = ROC(self.lookback, alias="momentum")
    return roc > self.threshold            # 60일 수익률 > 0 → 매수

def exit_condition(self) -> Condition:
    roc = ROC(self.lookback, alias="momentum")
    return roc < -self.threshold           # 60일 수익률 < 0 → 매도
```
- `crosses_above` 가 아니라 **단순 비교**(`>`)임에 주의 — 60일 수익률이 양수인 **동안 계속** 보유 상태. (Lean codegen 이 상태를 매매로 변환.)
- `build()` 에 `metadata={"rebalance": "monthly", "multi_asset": True}`(`L119-122`) — "원래는 여러 종목을 월 1회 재조정하는 전략" 이라는 표식.

**강한/약한 국면**: 꾸준한 상승 추세장에서 강함. **추세 전환점·급반전 장**에서 약함 — 60일 평균이 느려서 꺾임을 늦게 반영(고점에서 늦게 팔고 저점에서 늦게 삼).

---

### 3) `week52_high` — 52주 신고가 돌파 (카테고리: `trend`)

**매매 아이디어**: 주가가 **1년(252거래일) 최고가를 새로 갱신**하면 새로운 상승 추세의 시작으로 보고 매수. 전형적인 **돌파(breakout)** 전략.

**진입/청산 규칙**:
- 진입: 종가가 `Maximum(252)`(52주 최고가)를 상향 돌파.
- **청산: 별도 매도 신호 없음 — 손절 5% / 익절 15% 로만 정리**(이게 이 전략의 특이점).

```python
# L86-L97  진입은 돌파, 청산은 "항상 False"
def entry_condition(self) -> Condition:
    price = Price.close()
    high52 = Maximum(self.lookback, alias="high52")
    return price.crosses_above(high52)     # 종가가 52주 신고가 돌파 → 매수

def exit_condition(self) -> Condition:
    high52 = Maximum(self.lookback, alias="high52")
    return high52 < 0  # 항상 False (가격은 음수가 될 수 없음)
```
- ⚠️ `exit_condition` 이 `high52 < 0` → 가격은 음수가 안 되므로 **영원히 False**(주석이 명시). 즉 **"신호로는 절대 안 판다"** — 오직 손절/익절(risk_management)로만 청산. `to_lean_params` 의 exit `"type": "risk_management"`(`L135-139`)가 이를 확증.

**강한/약한 국면**: 신고가 행진이 이어지는 강세장에서 강함. **신고가를 찍자마자 무너지는 장**에서 약함(돌파 직후 하락 → 손절). 다음 전략(`false_breakout`)이 바로 이 약점을 노린 전략입니다.

---

### 4) `consecutive_moves` — 연속 상승·하락 (카테고리: `momentum`) ⚠️ 커스텀 로직 전략

**매매 아이디어**: **N일 연속으로 오르면** 상승 관성으로 보고 매수, **N일 연속으로 내리면** 매도. 단순하지만 "줄(streak)"을 세는 게 핵심.

**진입/청산 규칙(진짜 의도)**:
- 진입: 종가가 `up_days`(기본 5)일 **연속** 상승.
- 청산: 종가가 `down_days`(기본 5)일 **연속** 하락.

```python
# L90-L101  ⚠️ entry_condition 은 "단순화된 자리표시"일 뿐
def entry_condition(self) -> Condition:
    """진입 조건: 당일 상승 (단순화)
    Note: 실제 N일 연속 상승은 Lean 코드에서 구현
    """
    roc = ROC(1, alias="daily_change")
    return roc > 0                         # "오늘 올랐다" 뿐 — 연속 카운트 아님!
```
- 여기 `entry_condition` 은 "오늘 상승" 만 봅니다(연속 5일이 아님). 주석이 **"실제 N일 연속 상승은 Lean 코드에서 구현"** 이라고 못 박습니다. 진짜 로직은 아래:

```python
# L133-L134  진짜 진입/청산 = 연속 카운터가 N일에 도달
entry_signal = self.consecutive_up[symbol] >= {self.up_days}
exit_signal = self.consecutive_down[symbol] >= {self.down_days}

# L122-L130  연속 카운터 갱신 로직 (get_custom_lean_code)
if price > prev_price:
    self.consecutive_up[symbol] += 1
    self.consecutive_down[symbol] = 0      # 오르면 상승카운트+1, 하락카운트 리셋
elif price < prev_price:
    self.consecutive_down[symbol] += 1
    self.consecutive_up[symbol] = 0
```
- **이게 진짜 매매 규칙**: 오늘 오르면 `consecutive_up` 을 1 늘리고 하락 카운트를 0으로 리셋, 그 반대도 마찬가지. 카운트가 `up_days`(5) 이상이면 매수 신호. `metadata={"custom_logic": True}`(`L148-150`)가 "이 전략은 특수 로직 필요" 표식.

**강한/약한 국면**: 한 방향으로 며칠씩 미는 추세장에서 강함. **들쭉날쭉한 장**에서 약함 — 연속 카운트가 자꾸 0으로 리셋돼 신호가 거의 안 뜨거나, 5일 연속 오른 직후(과열 막판)에 사서 물릴 수 있음.

---

### 5) `ma_divergence` — 이동평균 이격도 (카테고리: `mean_reversion`)

**매매 아이디어**: 가격이 이동평균에서 **너무 멀어지면 다시 붙는다**는 고무줄 논리(**평균회귀**). 이격도(가격÷평균)가 0.9 미만이면 "평균보다 10%+ 빠진 침체" → 분할매수, 1.1 초과면 "평균보다 10%+ 오른 과열" → 차익실현.

**진입/청산 규칙**:
- 진입: `Close < SMA(20) × 0.9` (가격이 평균의 90% 미만).
- 청산: `Close > SMA(20) × 1.1` (가격이 평균의 110% 초과).
- 손절/익절 **없음**(`risk_management()` 가 빈 `RiskManagement()` — `L105-107`).

```python
# L90-L103  이격도 = 가격을 SMA 의 배수와 비교
def entry_condition(self) -> Condition:
    price = Price.close()
    ma = SMA(self.period, alias="ma")
    return price < ma * self.buy_ratio     # close < MA*0.9 → 침체 → 매수

def exit_condition(self) -> Condition:
    price = Price.close()
    ma = SMA(self.period, alias="ma")
    return price > ma * self.sell_ratio    # close > MA*1.1 → 과열 → 매도
```
- `ma * self.buy_ratio` 처럼 **지표에 곱셈**이 가능한 이유: `SMA(...)` 가 지표 객체라 `*` 연산자도 오버로딩돼 새 비교식을 만듭니다(사전지식 3). `lean_condition: "close / ma < 0.9"`(`L137`)는 같은 의미를 나눗셈으로 표현.

**강한/약한 국면**: 일정 박스권을 오르내리는 **횡보장에서 강함**(빠지면 사고 오르면 파는 게 잘 맞음). **추세장에서 약함** — 평균보다 빠졌다고 샀는데 추세가 계속 무너지면(손절도 없어서) 큰 손실. 평균회귀의 전형적 약점.

---

### 6) `false_breakout` — 추세 돌파 후 이탈 (가짜 돌파) (카테고리: `trend`) ⚠️ 커스텀 로직 전략

**매매 아이디어**: 3번(`week52_high`)의 약점을 노림. 전고점을 돌파해 샀는데 **며칠 안에 다시 전고점 아래로 무너지면 "가짜 돌파"** 로 보고 빠르게 손절. "돌파의 진위 검증" 전략.

**진입/청산 규칙(진짜 의도)**:
- 진입: 종가가 `Maximum(lookback=20)`(전고점)을 상향 돌파.
- 청산(진짜): **진입 후 `exit_days`(3)일 이내** 에 종가가 다시 전고점 아래로 떨어지면 손절.

```python
# L91-L101  진입은 돌파, 청산(단순)은 "가격<전고점"
def entry_condition(self) -> Condition:
    price = Price.close()
    prev_high = Maximum(self.lookback, alias="prev_high")
    return price.crosses_above(prev_high)  # 전고점 돌파 → 매수

def exit_condition(self) -> Condition:
    price = Price.close()
    prev_high = Maximum(self.lookback, alias="prev_high")
    return price < prev_high               # (단순) 전고점 아래로 = 이탈
```
- 단순 `exit_condition` 은 "M일 이내" 조건이 빠진 버전(주석 `L45-47`: `"실제 'M일 내' 로직은 Lean 코드에서 별도 구현"`). 진짜 로직:

```python
# L127-L130  get_custom_lean_code — 진입 후 며칠 내 이탈만 손절
days_since_entry = (self.Time - self.entry_day[symbol]).days
if days_since_entry <= {self.exit_days}:
    if price < self.entry_high[symbol]:
        exit_signal = True  # 가짜 돌파 - 손절
```
- **핵심**: 진입 시점(`entry_day`)과 그때의 전고점(`entry_high`)을 기억해두고, **진입 후 3일 이내** 에만 "가격 < 전고점" 을 손절로 인정. 3일이 지나 안정적으로 자리 잡으면 가짜 돌파로 안 봄. `metadata={"custom_logic": True}`(`L149-151`).

**강한/약한 국면**: 돌파 실패가 잦은 **변동성 큰/속임수 많은 장**에서 손실을 빨리 끊어 강함. **깨끗하게 돌파해 쭉 가는 장**에서는 오히려 진짜 돌파를 잡지 못해(이 전략은 손절 중심) 수익 기회를 놓칠 수 있음.

---

### 7) `strong_close` — 강한 종가 (카테고리: `momentum`)

**매매 아이디어**: 하루 거래에서 **종가가 그날 고가에 바짝 붙어 끝나면**(매수세가 장 마감까지 강했다는 뜻) 다음 날 상승 관성을 기대해 매수. **IBS** 지표 하나로 판단.

**IBS 이해**: `IBS = (종가 − 저가) / (고가 − 저가)`. 0~1 사이. **1에 가까우면 종가=고가 부근(강세), 0에 가까우면 종가=저가 부근(약세)**.

**진입/청산 규칙**:
- 진입: `IBS >= min_close_ratio`(기본 0.8) → 종가가 당일 범위 **상위 20% 이내**.
- 청산: `IBS < (1 − min_close_ratio)` = `IBS < 0.2` → 종가가 **하위 20% 이내**.

```python
# L103-L116  IBS 한 줄 비교
def entry_condition(self) -> Condition:
    ibs = IBS(alias="ibs")
    return ibs >= self.min_close_ratio     # IBS >= 0.8 → 강한 종가 → 매수

def exit_condition(self) -> Condition:
    ibs = IBS(alias="ibs")
    exit_threshold = 1 - self.min_close_ratio
    return ibs < exit_threshold            # IBS < 0.2 → 약한 종가 → 매도
```
- 청산 임계치가 `1 - 0.8 = 0.2` 로 **대칭** 인 점이 깔끔(강할 때 사고, 정확히 반대로 약할 때 판다).
- ⚠️ docstring `L47-51`: **"장마감 후(15:30 이후) 실행 권장 — 장중엔 고가/저가/종가 미확정"**. 데일리 바 기준 전략이라 장중 신호는 부정확할 수 있다는 실전 주의.

**강한/약한 국면**: 매수세가 살아있어 종가가 강하게 끝나는 추세 우호적 장에서 강함. **종가만 강하고 다음 날 갭하락하는 변덕스러운 장**에서 약함(IBS 는 "오늘"만 보지 "내일"을 보장 못 함).

---

### 8) `volatility_breakout` — 변동성 축소 후 확장 (카테고리: `volatility`) ⚠️ 커스텀 로직 전략

**매매 아이디어**: "변동성이 **쪼그라들면(스퀴즈)** 곧 큰 움직임이 터진다"는 변동성 사이클. 변동성이 줄어든 상태에서 가격이 급등하면 그 확장 방향으로 매수. **돌파 + 변동성** 결합.

**진입/청산 규칙(진짜 의도)**:
- 진입: `ATR < ATR의 lookback일 평균`(변동성 축소) **AND** `ROC(1) > breakout_pct`(전일 대비 급등).
- 청산: `ROC(1) < -breakout_pct`(급락) 또는 손절.

```python
# L95-L107  ⚠️ 단순 entry 는 "급등"만 — 변동성 축소 조건 빠짐
def entry_condition(self) -> Condition:
    """Note: 간단히 구현을 위해 당일 수익률 > breakout_pct만 사용.
    변동성 축소 조건은 Lean 코드에서 추가 구현."""
    roc = ROC(1, alias="daily_return")
    return roc > self.breakout_pct         # 당일 +3% 초과 (축소조건 없음)
```
- 단순 `entry_condition` 은 **변동성 축소(스퀴즈) 조건이 빠진** 절반짜리. 진짜 핵심은 ATR 비교:

```python
# L132-L139  get_custom_lean_code — ATR 이동평균과 비교해 "축소"를 AND 로 덧붙임
atr_ma = sum(self.atr_history[symbol]) / len(self.atr_history[symbol])
volatility_squeeze = atr_value < atr_ma    # 현재 ATR < ATR 평균 = 변동성 축소
entry_signal = entry_signal and volatility_squeeze   # 급등 AND 축소
```
- ATR 값을 `lookback`(20)개까지 직접 리스트로 모아 평균을 내고(`L122-133`), **"지금 변동성이 평소보다 작은가"** 를 판정해 급등 신호에 AND 로 결합. `to_lean_params` 의 `lean_condition: "atr < atr_avg and daily_return > 3.0"`(`L182`)가 같은 의미.

**강한/약한 국면**: 오랜 횡보(저변동) 뒤 **신선한 돌파가 터지는 장**에서 강함. **변동성이 늘 높은 장**(축소 조건이 잘 안 성립)이나 **축소 후 위가 아니라 아래로 터지는 장**에서 약함.

---

### 9) `short_term_reversal` — 단기 반전 (카테고리: `mean_reversion`)

**매매 아이디어**: 5번(`ma_divergence`)의 **단기·고감도 버전**. 짧은 평균(기본 5일)에서 M% 만 벗어나도 과매도/과매수로 보고 **반대 방향에 베팅**(평균회귀). "짧게 빠지면 줍고, 짧게 튀면 던진다".

**진입/청산 규칙**:
- 진입: `Close < SMA(5) × (1 − 3%)` = `Close < SMA(5)×0.97` (5일 평균보다 3%+ 낮음 → 과매도).
- 청산: `Close > SMA(5) × (1 + 3%)` = `Close > SMA(5)×1.03` (5일 평균보다 3%+ 높음 → 과매수).
- 손절 5%.

```python
# L87-L101  평균의 (1±threshold) 배와 비교
def entry_condition(self) -> Condition:
    price = Price.close()
    ma = SMA(self.period, alias="ma")
    multiplier = 1 - self.threshold_pct / 100     # 1 - 0.03 = 0.97
    return price < ma * multiplier                # close < MA*0.97 → 매수

def exit_condition(self) -> Condition:
    price = Price.close()
    ma = SMA(self.period, alias="ma")
    multiplier = 1 + self.threshold_pct / 100     # 1 + 0.03 = 1.03
    return price > ma * multiplier                # close > MA*1.03 → 매도
```
- 5번과의 차이: 5번은 **고정 비율**(0.9/1.1)이고 평균이 길며(20일) 손절이 없지만, 9번은 **`threshold_pct` 로 대칭 임계치**를 만들고 평균이 짧으며(5일) 손절 5% 가 있음. → **9번이 더 빈번·민감하게 매매**.

**강한/약한 국면**: 잔잔하게 오르내리는 **단기 횡보장에서 강함**. **추세장·갭이 큰 장**에서 약함 — 짧은 평균이라 추세에 금방 끌려가 "빠졌다고 샀는데 더 빠짐" 이 잦음(그래서 손절 장착).

---

### 10) `trend_filter_signal` — 추세 필터 + 시그널 (카테고리: `composite`)

**매매 아이디어**: **두 조건을 AND 로 결합한 복합(composite) 전략**. 큰 추세는 "장기선 위/아래"로 거르고(필터), 실제 방아쇠는 "당일 등락"으로 당김(시그널). **추세추종 + 단기 모멘텀**의 합작.

**진입/청산 규칙**:
- 진입: `Close > SMA(60)`(상승 추세) **AND** `ROC(1) > 0`(당일 상승).
- 청산: `Close < SMA(60)`(하락 추세) **AND** `ROC(1) < 0`(당일 하락).
- 손절 5% / 익절 10%.

```python
# L90-L110  & 연산자로 두 조건 결합 (CompositeCondition)
def entry_condition(self) -> Condition:
    price = Price.close()
    trend = SMA(self.trend_period, alias="trend")
    roc = ROC(1, alias="daily_return")
    trend_up = price > trend               # 추세 필터: 60일선 위
    momentum_up = roc > 0                  # 시그널: 당일 상승
    return trend_up & momentum_up          # 둘 다 참일 때만 매수

def exit_condition(self) -> Condition:
    ...
    return trend_down & momentum_down      # 둘 다 참일 때만 매도
```
- `trend_up & momentum_up` — `&` 연산자가 두 `Condition` 을 **AND 복합조건**(`CompositeCondition`)으로 묶습니다(이 파일만 `condition.py` 의 `CompositeCondition` 을 import — `L17`). `lean_condition: "close > trend and daily_return > 0"`(`L154`).
- 효과: 추세 필터가 **하락장에서의 매수를 원천 차단**해, 단순 모멘텀(2번)보다 휩쏘에 강함.

**강한/약한 국면**: 분명한 추세 안에서 단기 눌림 후 반등을 잡는 장에서 강함(필터가 방향을 잡아줌). **장기선 근처에서 가격이 위아래로 진동하는 장**에서 약함 — 추세 필터 자체가 자주 켜졌다 꺼지며 신호가 흔들림.

---

## ⚠️ 함정·주의 (코드에 박힌 교훈)

1. **"Python 조건 ≠ 진짜 Lean 로직" (가장 큰 함정).** `consecutive_moves`·`false_breakout`·`volatility_breakout` 은 `entry_condition()`/`exit_condition()` 이 **단순화된 자리표시**이고, 진짜 매매 규칙은 `get_custom_lean_code()` / `to_lean_params()["custom_logic"]` 에 있습니다. 코드만 슥 보고 "당일 상승이면 매수하는 전략" 으로 오해하기 쉬움 — 주석(`"실제 ~는 Lean 코드에서 구현"`)을 반드시 같이 읽으세요. 이 전략들은 `metadata={"custom_logic": True}` 로 표식이 붙어 있습니다.
2. **`week52_high` 는 "신호로는 절대 안 판다".** `exit_condition` 이 `high52 < 0`(영원히 False). 청산은 오직 손절 5%/익절 15%(risk_management)로만 일어납니다. risk_management 가 비어 있으면 영원히 못 파는 셈이 되니 주의.
3. **`crosses_above` 와 `>` 는 다르다.** 1·3·6 번은 **교차 순간**(`crosses_above`)을, 2·5·7·9·10 번은 **상태 비교**(`>`,`<`)를 씁니다. 1번 docstring 의 `⚠️ 교차(Cross) 조건 - 단순 비교가 아님!` 경고가 핵심. 교차는 "그 하루"만, 비교는 "그 기간 내내" 입니다.
4. **손절/익절 유무가 전략마다 다르다.** `ma_divergence` 는 손절·익절이 **전혀 없음**(`RiskManagement()` 빈 객체) → 평균회귀가 추세장에서 무너지면 무한정 버팀. 반면 `week52_high`·`short_term_reversal` 등은 손절이 생존의 핵심.
5. **`strong_close` 는 장마감 후 데일리 바 기준.** docstring `L47-51` — 장중엔 고가/저가/종가가 미확정이라 IBS 가 부정확. 일봉 확정 후에만 신뢰.
6. **`momentum` 은 원래 다중종목 전략.** `metadata={"multi_asset": True, "rebalance": "monthly"}`. 단일 종목 백테스트에선 "절대 모멘텀"(수익률 부호)만 작동하고, 종목 간 랭킹(상대 모멘텀)은 빠집니다(docstring `L45-47`).
7. **alias 일관성.** 같은 지표를 `indicators()` 와 `entry_condition()` 에서 각각 `SMA(5, alias="sma_fast")` 로 **alias 를 똑같이** 줘야 codegen 이 동일 지표로 인식합니다(서로 다르면 중복 지표로 생성될 위험).

---

## 🚀 고도화 (새 프리셋 추가법)

새 전략 한 개를 추가하는 절차는 **"레시피 카드 양식 채우기 + 명부 등록"** 이 전부입니다.

1. **파일 생성**: `preset/my_strategy.py`. `BaseStrategy` 상속.
2. **데코레이터로 등록**: 클래스 위에 `@register("my_strategy", name=..., category=..., tags=[...])`. (1번 전략 `L22-28` 그대로 본뜨기.)
3. **`PARAM_DEFINITIONS` 작성**: 파라미터마다 `default/min/max/type/description`. → 프론트 다이얼이 자동 생성됨.
4. **`__init__` 에 파라미터 저장** + `id/name/category/description` property.
5. **`indicators()` / `entry_condition()` / `exit_condition()` / `risk_management()` 채우기** — `dsl.helpers` 의 지표 객체(`SMA`,`ROC`,`Maximum`,`ATR`,`IBS`,`Price`…)와 `>`,`<`,`&`,`crosses_above` 로 규칙 작성.
6. **(필요 시) `get_custom_lean_code()`** — 지표로 표현 못 하는 로직(보유일 추적·연속 카운트 등)이면 오버라이드 + `build()` 의 `metadata={"custom_logic": True}`.
7. **`build()` / `to_lean_params()`** — 1번 전략 패턴 복사 후 alias·조건만 교체.
8. **`__init__.py` 에 import 추가** — `from ...preset.my_strategy import MyStrategy` + `__all__` 에 등록. (이게 있어야 `import ...preset` 시 `@register` 가 실행돼 명부에 올라감.)

> 고도화 아이디어 예: ① **볼린저밴드 돌파**(`BollingerBands` upper/lower 사용) ② **RSI 평균회귀**(vbt_engine 의 rsi_meanrev 를 프리셋화) ③ **추세필터 + 평균회귀**(trend_filter_signal 의 틀에 진입조건만 mean_reversion 으로) ④ **기존 전략의 파라미터 자동 탐색** — `lean/optimizer.py`(현재 업스트림 전용)와 연결해 `PARAM_DEFINITIONS` 의 min~max 를 그리드 탐색.

> 학습 포인트: 10개 전략은 "같은 양식 × 다른 규칙" 이므로, **양식(BaseStrategy)을 한 번 이해하면 무한히 찍어낼 수 있습니다.** 강의에서 "전략 = 지표 + 진입/청산 규칙 + 리스크" 라는 3요소 분해를 보여주기 좋은 자리입니다.

---

## 📚 용어 사전 (이 폴더 한정)

| 용어 | 뜻 |
|---|---|
| `@register("id", ...)` | 클래스를 `StrategyRegistry` 에 id로 자동 등록하는 데코레이터 |
| `PARAM_DEFINITIONS` | 파라미터 명세(default·min·max·type·description). 프론트가 읽어 다이얼 생성 |
| `indicators()` | 전략이 쓰는 지표 객체 목록 |
| `entry_condition()` / `exit_condition()` | 매수/매도 규칙(Condition 객체). ⚠️ 일부 전략은 단순화된 자리표시 |
| `risk_management()` | 손절(`stop_loss_pct`)·익절(`take_profit_pct`) 설정. 빈 `RiskManagement()` 면 없음 |
| `get_custom_lean_code()` | 지표로 표현 못 하는 특수 로직을 Lean OnData 에 삽입할 코드 문자열 |
| `to_lean_params()` | Lean 코드 생성용 세부(지표 init·warmup·`lean_condition`) |
| `build()` | 네 조각을 불변 `StrategyDefinition` 으로 포장(codegen 입력) |
| `crosses_above / crosses_below` | 한 선이 다른 선을 상향/하향 **교차하는 순간**만 True |
| `SMA(n)` | n일 단순이동평균 지표 객체 |
| `ROC(n)` | n일 변화율(%). `ROC(1)`=전일 대비 등락률 |
| `Maximum(n)` | 최근 n일 최고가 |
| `ATR(n)` | Average True Range, 변동성 크기(하루 변동폭의 n일 평균) |
| `IBS` | Internal Bar Strength = (종가−저가)/(고가−저가), 0~1 |
| `Price.close()` | 종가를 지표처럼 다루는 객체 |
| **이격도(divergence)** | 가격 ÷ 이동평균. 1보다 크면 평균 위(과열), 작으면 평균 아래(침체) |
| **추세추종 / 평균회귀 / 돌파** | 전략 3대 철학(관성 / 고무줄 / 벽 뚫기) |
| **휩쏘(whipsaw)** | 횡보장에서 신호가 자주 뒤집혀 잦은 손실 매매가 나는 현상 |
| **스퀴즈(squeeze)** | 변동성(ATR)이 수축한 상태. 곧 큰 움직임의 전조로 봄 |
| `metadata={"custom_logic": True}` | "이 전략은 표준 조건 외 특수 Lean 로직이 필요" 표식 |
