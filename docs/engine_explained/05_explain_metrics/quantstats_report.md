# `metrics/quantstats_report.py` — 위험지표 계산기 (완전 라인별 해설)

> 원본: `analytics/app/metrics/quantstats_report.py` (52줄)
> 표준 형식: `01_backtest/vbt_engine.md` 와 동일한 틀을 따릅니다.
> 이 문서는 **추측 없이 실제 코드만** 설명합니다. 파일에 없는 함수는 "이 파일엔 없고 `main.py` 에 있다"고 명시합니다.

---

## 📌 이 파일 한눈에

이 파일은 **"건강검진 종합 리포트 작성기"** 입니다.

vbt_engine(백테스트 엔진)이 "이 전략으로 거래했더니 날마다 이만큼 벌고 잃었다"는 **일별 수익률 한 줄(`returns`)** 을 내놓습니다. 이 파일은 그 수익률을 받아서, 마치 병원이 혈압·혈당·콜레스테롤을 한 표로 정리하듯 **Sharpe·Sortino·CAGR·MDD·변동성·승률·VaR·CVaR** 같은 위험·성과 지표를 한 묶음(`dict`)으로 계산해 돌려줍니다.

핵심은 **함수 단 2개**입니다 (파일이 매우 짧습니다).

| 함수 | 한 줄 역할 | 비유 |
|---|---|---|
| `_f(x)` | 어떤 값이든 "JSON 에 안전한 숫자(또는 None)"로 정리 | 검사 수치를 차트에 옮기기 전 단위 통일·오류값 제거 |
| `compute_metrics(returns, benchmark)` | 일별 수익률 → 11~14개 위험/성과 지표 dict | 혈액검사 원자료 → 종합 건강 리포트 |

**누가 호출하나?** → `app/main.py` 가 부릅니다. 백테스트(`/backtest`)·시그널 단계에서 `result.pop("_strategy_returns")` 로 vbt_engine 이 숨겨둔 일별 수익률을 꺼내, `compute_metrics(strat_returns, benchmark=...)` 로 이 파일에 넘깁니다. 결과는 응답 JSON 의 `risk_metrics` / `buy_and_hold_metrics` 키로 들어가 프론트 Report 탭에 표시됩니다.

> ⚠️ **자주 하는 오해 (먼저 짚고 갑니다)**: CLAUDE.md 와 README 에는 "quantstats_report.py 가 Sharpe·VaR **+ HTML Tearsheet**를 만든다"고 적혀 있습니다. 하지만 **실제 이 파일은 숫자 지표(dict)만** 만듭니다. **HTML Tearsheet(`qs.reports.html(...)`)는 이 파일이 아니라 `main.py` 의 `/report/full` 엔드포인트에 있습니다.** 이 문서는 두 위치를 모두 정확히 다룹니다(라인별 해설 끝의 "보너스" 절 참고).

**왜 QuantStats 를 쓰나?** → Sharpe·Sortino·VaR·CVaR 같은 지표는 공식이 미묘하게 까다롭고(연환산 계수, 분위수 처리 등) 직접 짜면 실수하기 쉽습니다. `quantstats` 는 업계에서 검증된 구현을 한 줄(`qs.stats.sharpe(returns)`)로 제공합니다. (비유: 혈압을 자로 재지 말고 검증된 혈압계를 쓰자.)

---

## 🧠 사전 지식 (이거 모르면 막힘)

#### 1) 입력은 "일별 단순수익률(daily simple returns)" Series 한 줄

이 파일이 받는 `returns` 는 vbt_engine 의 `pf.returns()` 결과 — **하루하루의 수익률**입니다.

```
날짜          수익률(returns)
2024-01-03   +0.015   ← 그날 +1.5%
2024-01-04   -0.008   ← 그날 -0.8%
2024-01-05    0.000   ← 변동 없음
```

- "단순(simple) 수익률" = `(오늘값 - 어제값) / 어제값`. (로그수익률이 아님.)
- vbt_engine 이 만든 이 값에는 **수수료·슬리피지가 이미 반영**되어 있습니다(=현실적인 수익률). 그래서 `df["Close"].pct_change()`(그냥 종가 변화율, 비용 없음)와는 다릅니다.
- 핵심: 이 파일은 **가격(Close)이 아니라 "수익률"** 을 받습니다. 둘을 헷갈리면 안 됩니다.

#### 2) Sharpe / Sortino / Calmar — 위험 대비 수익 효율 (클수록 좋음)

세 지표 모두 "**수익 ÷ 위험**" 꼴입니다. 분모(위험)의 정의만 다릅니다.

| 지표 | 분자(수익) | 분모(위험) | 한 줄 의미 |
|---|---|---|---|
| **Sharpe** | 초과수익 | **전체 변동성**(표준편차) | 출렁임 1당 얼마 벌었나 |
| **Sortino** | 초과수익 | **하락 변동성**만 | "나쁜 출렁임"만 위험으로 봄(상승은 벌이 OK) |
| **Calmar** | 연환산수익 | **\|MDD\|**(최대낙폭) | 최악 손실 1당 얼마 벌었나 |

#### 3) CAGR · Volatility · Win Rate · MDD

- **CAGR(연환산복리수익)**: 일별 수익률을 복리로 1년치로 환산한 평균 성장률(%).
- **Volatility(변동성)**: 수익률의 표준편차를 연율화한 값(%). 클수록 출렁임이 큼.
- **Win Rate(승률)**: 전체 거래일 중 **수익이 난 날의 비율**(%).
- **MDD(최대낙폭)**: 자산곡선이 고점 대비 가장 많이 빠진 폭(%). "가장 운 나빴을 때 최대 손실".

#### 4) VaR / CVaR — "최악의 날" 위험 (이 파일의 특별 손님)

`returns` 분포의 왼쪽 꼬리(손실 쪽)를 본 위험 지표입니다. 기본 신뢰수준은 95%.

```
일별 수익률 분포(히스토그램):

   빈도
    │              ▆▇█▇▆
    │           ▃▅█████▅▃
    │      ▁▂▄▆████████████▆▄▂
    └─────┴──────────────────────── 수익률
       ↑ 하위 5% 경계
   ◀──VaR──┤
  ◀─CVaR(꼬리 평균)─┤
```

- **VaR(95%, Value at Risk)**: "95% 신뢰수준에서, 하루에 이보다 더 잃지는 않는다"의 경계값. = **하위 5% 분위수**. 예: VaR=-2.3% → "100일 중 약 5일은 -2.3%보다 더 빠진다".
- **CVaR(95%, Conditional VaR = Expected Shortfall)**: VaR 보다 더 나쁜 그 **꼬리(하위 5%) 안쪽의 평균** 손실. 항상 VaR 보다 더 큰(나쁜) 값. "최악의 날들이 실제로 얼마나 나쁜가".
- 둘 다 **음수**가 정상(손실이니까). 보고용으로 `*100` 해서 % 로 표시합니다.

> 💡 초보 포인트: VaR 은 "경계", CVaR 은 "그 경계 너머 평균". VaR 만 보면 "꼬리가 얼마나 두꺼운지(극단 손실)"를 놓칠 수 있어 CVaR 을 함께 봅니다.

#### 5) alpha / beta / information_ratio — 벤치마크(SPY) 대비 (선택적)

`benchmark`(예: SPY 일별수익률)가 주어졌을 때만 추가로 계산합니다.

- **beta(β)**: 시장이 1% 움직일 때 내 전략이 몇 % 따라 움직이나(시장 민감도). β=1 이면 시장과 동행, β<1 이면 둔감.
- **alpha(α)**: 시장 움직임(β)으로 설명되지 않는 **순수 초과수익**. "실력으로 번 부분".
- **information_ratio(정보비율)**: 벤치마크 대비 초과수익을 그 초과수익의 변동성으로 나눈 값. "벤치마크를 얼마나 꾸준히 이겼나".

#### 6) matplotlib "Agg" 백엔드 — 화면 없는 서버에서 그림 그리기

`quantstats` 는 import 만 해도 내부적으로 `matplotlib`(그래프 라이브러리)을 건드립니다. 서버(EC2)에는 모니터·창(GUI)이 없어서, 기본 백엔드로는 "디스플레이가 없다"며 에러나거나 멈출 수 있습니다. `matplotlib.use("Agg")` 는 **"화면 대신 파일로만 그림을 그리는 모드"** 로 미리 못 박아 이를 방지합니다. (`Agg` = Anti-Grain Geometry, 픽셀을 메모리에 그려 파일로 저장하는 렌더러.)

---

## 🗺 전체 흐름도

```
vbt_engine.run_backtest()  →  result["_strategy_returns"]  (일별 수익률 Series, 비용 반영)
        │
        │  main.py: strat_returns = result.pop("_strategy_returns")
        │           bench_returns  = SPY 일별수익률 (선택)
        ▼
┌──────────────────────────────────────────────────────────────┐
│  compute_metrics(returns, benchmark)        ◀── 이 파일       │
│                                                                │
│   1) returns = returns.dropna()   (NaN 제거)                   │
│   2) 비었으면 → {} 즉시 반환                                    │
│   3) qs.stats.* 로 11개 지표 계산 ─┐                            │
│        cagr / sharpe / sortino /  │  각 값마다 _f() 로         │
│        calmar / max_drawdown /    │  float·반올림·NaN→None     │
│        volatility / win_rate /    │  안전 정리                  │
│        best / worst / VaR / CVaR ─┘                            │
│   4) benchmark 있으면 → alpha / beta / information_ratio 추가   │
└──────────────────────────────────────────────────────────────┘
        │  dict 반환
        ▼
main.py: result["risk_metrics"] = {...}        → JSON → 백엔드 → 프론트 Report 탭

(별도 경로) main.py /report/full → qs.reports.html(...) → HTML Tearsheet 파일  ※이 파일 아님
```

---

## 📖 라인별 해설

### A. 파일 설명서(docstring) + import — `L1-L11`

```python
# L1-L11
"""
QuantStats-based risk metrics on equity curve / returns.
"""
from __future__ import annotations
import numpy as np
import pandas as pd

# QuantStats touches matplotlib at import — set non-interactive backend first
import matplotlib
matplotlib.use("Agg")
import quantstats as qs
```

- `"""..."""` — 파일 맨 위 **설명서(docstring)**. "수익률(returns)에 대해 QuantStats 로 위험지표를 낸다"고 한 줄로 알려줍니다. 실행되지 않고 사람이 읽는 용도.
- `from __future__ import annotations` — 타입힌트를 "문자열처럼" 늦게 평가하게 하는 파이썬 주문. 덕분에 아래 `pd.Series | None` 같은 최신 표기를 구버전 파이썬에서도 쓸 수 있습니다. (초보는 "최신 타입표기 허용 스위치"로 이해.)
- `numpy(np)` — 숫자 계산(여기선 `np.isnan/np.isinf` 에 사용). `pandas(pd)` — 표 데이터(`pd.Series` 타입힌트에 사용).
- **import 순서가 의도적입니다 (가장 중요한 디테일)**:
  - `import matplotlib` → `matplotlib.use("Agg")` 를 **`import quantstats` 보다 먼저** 실행합니다.
  - 이유: 주석대로 "QuantStats touches matplotlib **at import**" — quantstats 는 import 되는 순간 matplotlib 백엔드를 잡아버립니다. 그 전에 `Agg`(화면 없는 모드)로 못 박지 않으면, GUI 없는 서버에서 백엔드가 잘못 잡혀 그래프 생성 시 에러/멈춤이 날 수 있습니다(사전지식 6번).
- `import quantstats as qs` — 핵심 라이브러리에 `qs` 별명. 이후 모든 지표는 `qs.stats.XXX(...)` 로 부릅니다.

> 💡 초보 포인트: "그냥 import 순서 바꿔도 되지 않나?" → **안 됩니다.** `use("Agg")` 는 반드시 matplotlib 가 실제로 백엔드를 정하기 **전**에 호출돼야 효과가 있습니다. quantstats 가 먼저 import 되면 이미 늦습니다. 이 3줄 순서는 "고치지 마세요" 영역입니다.

---

### B. 안전한 숫자 변환 헬퍼 `_f()` — `L14-L19`

```python
# L14-L19
def _f(x):
    try:
        v = float(x)
        return None if (np.isnan(v) or np.isinf(v)) else round(v, 4)
    except Exception:
        return None
```

**무엇을 하나**: 어떤 값(`x`)이든 받아서 → ① float 로 변환 → ② NaN(숫자아님)·Inf(무한대)면 `None` → ③ 정상이면 소수 4자리 반올림한 float 를 돌려줍니다. 변환 자체가 실패하면(`except`) 그냥 `None`.

**왜 이렇게 하나**:
- **JSON 안전성**. 이 dict 는 결국 JSON 으로 프론트에 전송됩니다. 그런데 JSON 표준에는 `NaN`·`Infinity` 가 없습니다. 그대로 보내면 직렬화가 깨지거나 프론트에서 파싱 오류가 납니다. 미리 `None`(→ JSON `null`)으로 바꿔 화면이 안전하게 "값 없음"을 표시하게 합니다.
- **quantstats 가 NaN/Inf 를 자주 반환**합니다. 데이터가 짧거나(예: 며칠치) 변동성이 0이면 Sharpe 분모가 0 → Inf, 또는 계산 불능 → NaN. `_f` 가 그 모든 경우를 한 곳에서 흡수합니다.
- `round(v, 4)` — 소수 4자리로 정리. 0.0153219... 같은 긴 꼬리를 0.0153 으로 깔끔하게(전송량·가독성).

**초보가 헷갈리는 포인트**:
- `np.isnan(v) or np.isinf(v)` 순서로 **NaN 과 Inf 를 둘 다** 거릅니다. NaN 만 막으면 Inf 가 새어나가 JSON 을 깨뜨립니다.
- `try/except Exception` 으로 감싼 이유: `float(x)` 가 None·문자열·이상한 객체를 만나면 예외가 납니다. "어떤 쓰레기 입력이 와도 절대 터지지 말고 None 을 줘라"는 **방어적 프로그래밍**.
- 이 `_f` 는 **vbt_engine.py 의 `_f` 와 사실상 동일한 쌍둥이**입니다(같은 의도, 같은 구현). 두 파일이 각자 자기 버전을 들고 있습니다. (고도화 절에서 "공통 유틸로 합치기" 제안.)

> 💡 비유: `_f` 는 검사실 직원입니다. 어떤 수치가 와도 "단위 통일(float) → 오류값 폐기(NaN/Inf→공란) → 소수점 정리"를 거쳐 깨끗한 값만 리포트에 올립니다.

---

### C. 메인 함수 `compute_metrics()` — `L22-L51`

#### C-1) 함수 머리 + docstring — `L22-L26`

```python
# L22-L26
def compute_metrics(returns: pd.Series, benchmark: pd.Series | None = None) -> dict:
    """
    `returns`: daily simple returns of strategy.
    `benchmark`: optional daily simple returns (e.g., SPY buy-and-hold).
    """
```

- 입력 `returns: pd.Series` — **전략의 일별 단순수익률**(필수). vbt_engine 의 `pf.returns()` 가 만든 그 Series.
- 입력 `benchmark: pd.Series | None = None` — **벤치마크의 일별 수익률**(선택, 기본 없음). 예: SPY(미국 S&P500 ETF)를 그냥 사서 들고 있었을 때의 수익률. 주어지면 alpha/beta 등을 추가로 계산.
- `| None` 표기 = "이거 이거나 None(없음)". (`Optional[pd.Series]` 와 같은 뜻, 더 최신 문법.)
- 반환 `-> dict` — 지표 이름→값 딕셔너리.
- docstring 이 친절하게 "**simple returns** 를 달라"고 못 박습니다. (로그수익률이나 가격을 주면 안 됨.)

#### C-2) 입력 정리 + 빈 데이터 방어 — `L27-L29`

```python
# L27-L29
    returns = returns.dropna()
    if returns.empty:
        return {}
```

- `returns.dropna()` — 수익률 Series 에서 **NaN(빈칸)을 제거**. 첫날은 보통 "어제 값"이 없어 수익률이 NaN 이라, 이런 빈칸을 걷어내야 quantstats 계산이 안전합니다.
- `if returns.empty: return {}` — **빈 데이터 방어**(가드 절). NaN 다 빼고 나니 남은 게 하나도 없다면(데이터가 너무 짧거나 전부 NaN), 계산을 시도하지 않고 **빈 dict `{}`** 를 즉시 반환합니다.
- **왜?** 빈 Series 에 `qs.stats.sharpe()` 등을 부르면 ZeroDivision·IndexError 등으로 터집니다. 미리 막아 "지표 없음"을 빈 dict 로 깔끔히 표현. (호출부 `main.py` 는 빈 dict 를 받아도 문제없이 JSON 화합니다.)

> 💡 초보 포인트: `.dropna()` 는 **새 Series 를 반환**하므로 `returns = returns.dropna()` 처럼 **다시 대입**해야 효과가 남습니다. (pandas 대부분 메서드는 원본을 안 바꾸고 사본을 줍니다.)

#### C-3) 핵심 — 11개 지표 계산 dict — `L31-L43`

```python
# L31-L43
    out = {
        "cagr_pct": _f(qs.stats.cagr(returns) * 100),
        "sharpe": _f(qs.stats.sharpe(returns)),
        "sortino": _f(qs.stats.sortino(returns)),
        "calmar": _f(qs.stats.calmar(returns)),
        "max_drawdown_pct": _f(qs.stats.max_drawdown(returns) * 100),
        "volatility_pct": _f(qs.stats.volatility(returns) * 100),
        "win_rate_pct": _f(qs.stats.win_rate(returns) * 100),
        "best_day_pct": _f(qs.stats.best(returns) * 100),
        "worst_day_pct": _f(qs.stats.worst(returns) * 100),
        "var_95_pct": _f(qs.stats.value_at_risk(returns) * 100),
        "cvar_95_pct": _f(qs.stats.conditional_value_at_risk(returns) * 100),
    }
```

**무엇을 하나**: 일별 수익률 하나로 **11개 위험·성과 지표**를 한 번에 계산해 `out` dict 에 담습니다. 각 줄은 똑같은 패턴 — `_f( qs.stats.지표(returns) [* 100] )`.

**한 줄씩 의미** (qs.stats 가 무엇을 돌려주는지 + 왜 `*100` 인지):

| 키 | 호출 | `*100`? | 뜻 |
|---|---|---|---|
| `cagr_pct` | `qs.stats.cagr` | ✅ | 연환산 복리수익률. 0.12 → 12% |
| `sharpe` | `qs.stats.sharpe` | ❌ | 샤프지수(비율이라 % 아님) |
| `sortino` | `qs.stats.sortino` | ❌ | 소르티노(하락위험 기준 비율) |
| `calmar` | `qs.stats.calmar` | ❌ | 칼마(연수익÷\|MDD\| 비율) |
| `max_drawdown_pct` | `qs.stats.max_drawdown` | ✅ | 최대낙폭. -0.25 → -25% |
| `volatility_pct` | `qs.stats.volatility` | ✅ | 연율화 변동성 |
| `win_rate_pct` | `qs.stats.win_rate` | ✅ | 수익 난 날 비율. 0.55 → 55% |
| `best_day_pct` | `qs.stats.best` | ✅ | 최고의 하루 수익률 |
| `worst_day_pct` | `qs.stats.worst` | ✅ | 최악의 하루 수익률 |
| `var_95_pct` | `qs.stats.value_at_risk` | ✅ | VaR(95%) — 하위 5% 경계 손실 |
| `cvar_95_pct` | `qs.stats.conditional_value_at_risk` | ✅ | CVaR(95%) — 그 꼬리 평균 손실 |

**왜 이렇게 하나**:
- **`* 100` 의 규칙**: quantstats 는 비율을 **소수(0.12)** 로 돌려줍니다. 사람이 읽는 "%"로 바꾸려고 `*100` 합니다. 단, **Sharpe·Sortino·Calmar 는 원래 "비율(ratio)" 자체**라 % 가 아니므로 `*100` 을 **하지 않습니다**. → 키 이름에 `_pct` 가 붙은 것만 `*100` 했다고 보면 정확합니다.
- **모든 값을 `_f` 로 감쌈**: 어떤 지표가 NaN/Inf 를 뱉어도(예: 표본이 짧아 sortino 분모 0) `_f` 가 `None` 으로 흡수 → JSON 안전 + 다른 10개 지표는 살아남음. (한 지표 실패가 전체를 못 죽임.)

**초보가 헷갈리는 포인트**:
- `var_95` / `cvar_95` 의 "95"는 **신뢰수준 95%**(=하위 5% 꼬리)를 뜻하는 **이름표**일 뿐, 코드에서 `0.95` 를 인자로 넘기지 않습니다. `qs.stats.value_at_risk(returns)` 의 **기본 신뢰수준이 95%**라서 키 이름에 그렇게 박았습니다. → 만약 quantstats 버전이 기본값을 바꾸면 이름과 실제가 어긋날 수 있는 약점(함정 절 참고).
- `best`/`worst` 는 "최고/최악의 **하루**" 수익률입니다(누적이 아님). 변동성의 직관적 상·하한.
- `best_day_pct` 의 함수명이 `qs.stats.best`(day 라는 단어 없음)인 점 — quantstats 의 `best`/`worst` 가 기본적으로 일 단위 극값을 봅니다. 키 이름에 `_day` 를 붙여 우리가 의미를 명확히 했습니다.

> 💡 비유: 이 13줄이 곧 **건강검진 종합 리포트의 항목들**입니다. cagr=평균 성장(키 크는 속도), sharpe/sortino/calmar=효율(가성비), mdd/volatility=위험(혈압 변동), win_rate=꾸준함, VaR/CVaR=최악의 날 대비 체력. 한 장에 모아 "이 전략 건강한가?"를 읽습니다.

#### C-4) 벤치마크가 있을 때만 — alpha/beta/IR 추가 — `L44-L50`

```python
# L44-L50
    if benchmark is not None and not benchmark.empty:
        try:
            out["alpha"] = _f(qs.stats.greeks(returns, benchmark).get("alpha"))
            out["beta"] = _f(qs.stats.greeks(returns, benchmark).get("beta"))
            out["information_ratio"] = _f(qs.stats.information_ratio(returns, benchmark))
        except Exception:
            pass
```

**무엇을 하나**: `benchmark`(예: SPY 수익률)가 **주어졌고 비어있지 않으면**, 시장 대비 지표 3개(`alpha`, `beta`, `information_ratio`)를 `out` 에 **추가**합니다.

**왜 이렇게 하나**:
- **조건부**: 벤치마크 없이는 alpha/beta 정의 자체가 불가능(비교 대상이 없으니까). 그래서 `benchmark is not None and not benchmark.empty` 둘 다 통과할 때만 계산. — `None` 체크와 `empty` 체크를 **둘 다** 하는 이유: 인자를 안 줬을 수도(None), 줬는데 알맹이가 없을 수도(빈 Series) 있어서 양쪽을 막습니다.
- **`qs.stats.greeks(returns, benchmark)`** 는 alpha·beta 를 **함께** 담은 객체를 한 번에 돌려줍니다. 거기서 `.get("alpha")`, `.get("beta")` 로 각각 꺼냅니다. (`.get()` = 키가 없어도 에러 없이 None 반환하는 안전한 꺼내기.)
- **`information_ratio(returns, benchmark)`** 는 별도 함수로 정보비율을 계산.
- **`try/except: pass`** — 이 3개는 **있으면 좋고 없어도 그만(best-effort)**. 벤치마크 정렬 문제나 quantstats 내부 오류가 나도 **조용히 건너뛰고**, 앞에서 만든 11개 핵심 지표(`out`)는 그대로 살립니다. "보너스 지표 때문에 본 지표를 잃지 마라."

**초보가 헷갈리는 포인트**:
- `except Exception: pass` 는 보통 "에러를 삼키는 나쁜 패턴"이라 배우지만, 여기선 **의도된 선택적 기능**입니다(핵심이 아닌 부가 지표). 다만 디버깅 땐 무엇이 실패했는지 안 보이는 단점(함정 절 참고).
- **인덱스 정렬은 이 파일이 안 합니다**. `returns` 와 `benchmark` 의 날짜가 맞아야 alpha/beta 가 정확한데, **그 정렬은 호출부 `main.py` 에서 미리** 해둡니다 (`bench_returns.reindex(strat_returns.index)` / `intersection`). 이 파일은 "이미 정렬된 두 줄"을 받는다고 가정합니다.

#### C-5) 반환 — `L51`

```python
# L51
    return out
```

- 완성된 지표 dict 를 그대로 돌려줍니다. (벤치마크 없으면 11개, 있으면 최대 14개 키.)
- 호출부 `main.py` 가 이 dict 를 `result["risk_metrics"]`(전략) / `result["buy_and_hold_metrics"]`(단순보유 비교)에 넣어 JSON 응답에 실어 보냅니다.

---

### D. (보너스) HTML Tearsheet 는 어디에? — `main.py` 의 `/report/full`

> 이 파일(`quantstats_report.py`)에는 **HTML 생성 코드가 없습니다.** 그러나 README/CLAUDE.md 가 이 모듈을 "Sharpe·VaR **+ HTML Tearsheet**"로 묶어 소개하므로, 실제 HTML 이 만들어지는 위치를 정확히 짚어 둡니다. (학습·강의용 보충. 코드 위치: `app/main.py`.)

**관련 상수** — `app/config.py:17-19`:
```python
# QuantStats가 생성하는 HTML tearsheet 저장 경로 (정적 서빙)
REPORTS_DIR = ROOT_DIR / "reports"
REPORTS_DIR.mkdir(exist_ok=True)
```
- HTML 파일을 저장할 `reports/` 폴더를 정하고, 없으면 만듭니다.

**정적 서빙 마운트** — `app/main.py:59-60`:
```python
# QuantStats HTML tearsheet 정적 서빙: GET /reports/{file}.html (no auth — 공개 링크)
app.mount("/reports", StaticFiles(directory=str(REPORTS_DIR)), name="reports")
```
- 생성된 HTML 을 `GET /reports/파일명.html` 로 **누구나(인증 없이) 열람** 가능하게 정적 파일 서버에 연결. (그래서 파일명에 랜덤 UUID 를 붙여 추측·충돌을 막습니다 — 아래.)

**실제 생성 엔드포인트** — `app/main.py:397-454` (핵심만):
```python
@app.post("/report/full", dependencies=[Depends(require_internal_token)])
def report_full(req: FullReportReq):
    import quantstats as qs  # imported here so matplotlib backend already set in metrics module
    ...
    result = run_backtest(df["Close"], params, vix=vix_series)
    strat_returns = result.pop("_strategy_returns", None)     # ← vbt_engine 의 일별수익률
    ...
    fname = f"{req.ticker.upper()}_{req.strategy}_{uuid.uuid4().hex[:8]}.html"
    out_path = REPORTS_DIR / fname
    qs.reports.html(                                          # ★ QuantStats 핵심 호출
        strat_returns,
        benchmark=bench_returns if bench_returns is not None else None,
        output=str(out_path),
        title=title,
    )
    return {"report_url": f"/reports/{fname}", ...}
```

핵심 관찰 4가지:
1. **같은 `_strategy_returns` 를 씁니다.** 숫자 지표(`compute_metrics`)도, HTML(`qs.reports.html`)도 **vbt_engine 이 넘긴 동일한 일별수익률**을 입력으로 받습니다. 입력 한 줄이 두 출력(표 + 그림)을 낳습니다.
2. **`import quantstats as qs` 를 함수 안에서** 다시 합니다. 주석이 그 이유를 명시 — "matplotlib backend already set in metrics module". 즉 **`quantstats_report.py` 가 먼저 import 되며 `Agg` 백엔드를 못 박아 둔 덕분**에, 여기서 quantstats 를 써도 안전합니다. (B절 import 순서가 왜 중요한지의 실전 효과.)
3. **`qs.reports.html(returns, benchmark, output, title)`** 가 진짜 Tearsheet 생성기입니다. 수익률 곡선·드로다운·월별 히트맵·분포 등 수십 개 차트가 박힌 단일 HTML 을 `output` 경로에 씁니다.
4. **파일명 = `티커_전략_랜덤8자.html`**. UUID 8자로 **충돌 방지 + 추측 불가**(공개 링크라 보안 고려). 응답엔 `report_url` 로 그 경로를 돌려줘 프론트가 새 탭에 띄웁니다.

> 정리: **이 파일 = "숫자 리포트(dict)"**, **main.py `/report/full` = "그림 리포트(HTML)"**. 둘은 형제지만 사는 집이 다릅니다. 학습할 때 분리해서 기억하세요.

---

## ⚠️ 함정·버그 주의 (코드에 박힌 교훈 모음)

1. **import 순서는 신성불가침** — `matplotlib.use("Agg")` 는 반드시 `import quantstats` **전**. 순서 뒤집으면 GUI 없는 서버에서 그래프 생성 시 에러/멈춤. (`/report/full` 이 함수 안에서 quantstats 를 재import 하는 것도 이 백엔드 고정에 의존.)
2. **입력은 "수익률"이지 "가격"이 아니다** — `compute_metrics` 에 `df["Close"]`(가격)를 그대로 넘기면 모든 지표가 헛값. 반드시 `pct_change().dropna()` 한 **일별 수익률**을 줘야 함. (호출부에서 보장.)
3. **NaN/Inf → JSON 깨짐** — `_f()` 가 모든 지표를 감싸 `None` 으로 흡수. 새 지표를 추가할 때도 **반드시 `_f()` 로 감싸세요.** 안 감싸면 짧은 데이터에서 NaN 이 새어나가 응답이 깨질 수 있음.
4. **`* 100` 누락/오용** — `_pct` 키는 `*100`, 비율(sharpe/sortino/calmar)은 `*100` 안 함. 새 지표 추가 시 "이건 비율인가 %인가?"를 먼저 판단. 잘못하면 화면에 1200% 같은 괴값.
5. **`var_95`/`cvar_95` 이름은 "약속"일 뿐** — 코드가 신뢰수준 0.95 를 명시적으로 넘기지 않고 quantstats **기본값**(현재 95%)에 의존. 라이브러리 버전이 기본값을 바꾸면 이름(95)과 실제가 어긋날 수 있음. → 고도화에서 명시 인자 전달 권장.
6. **빈 벤치마크/정렬 문제는 조용히 무시됨** — alpha/beta 블록의 `except Exception: pass` 가 모든 오류를 삼킴. 벤치마크가 있는데도 alpha 가 안 나오면 "왜 안 나오지?"를 알 길이 없음(로그 0줄). 디버깅 시 임시로 `log.warning(e)` 추가 필요.
7. **인덱스 정렬은 이 파일 책임 아님** — `returns` 와 `benchmark` 날짜가 안 맞으면 alpha/beta 가 왜곡. 정렬은 `main.py`(`reindex`/`intersection`)가 해주므로, 이 함수를 **다른 곳에서 재사용할 땐 정렬을 직접** 챙겨야 함.
8. **`_f` 중복** — vbt_engine.py 와 이 파일이 같은 `_f` 를 각자 보유. 한쪽만 고치면 두 동작이 갈라질 위험(예: 반올림 자릿수 변경). → 공통 util 로 통합 권장.

---

## 🚀 고도화 아이디어 (강의·개선 버전용)

- **신뢰수준 명시**: `value_at_risk(returns, sigma=1, confidence=0.95)` 처럼 인자를 **명시 전달**하고, 95%·99% **두 단계 VaR/CVaR** 를 함께 제공(`var_99_pct` 추가). 함정 5번 해소.
- **무위험수익률(rf) 반영**: Sharpe/Sortino 는 `qs.stats.sharpe(returns, rf=0.04)` 처럼 무위험수익률을 넣으면 더 정확. 현재는 기본(0 가정).
- **`_f` 공통화**: `_f` 를 `app/common/num.py` 같은 곳으로 빼서 vbt_engine 과 공유(중복 제거, 함정 8번 해소).
- **alpha/beta 실패 로깅**: `except Exception: pass` → `except Exception as e: log.warning("greeks failed: %s", e)`. 침묵의 디버깅 지옥 방지(함정 6번).
- **지표 메타데이터 동봉**: 각 지표에 "방향(클수록 좋음/나쁨)·단위·신뢰수준"을 함께 반환하면 프론트가 색·툴팁을 자동 표시 가능. 예: `{"value": 1.8, "unit": "ratio", "higher_is_better": true}`.
- **롤링 지표**: 전체 한 값이 아니라 "최근 1년 롤링 Sharpe" 시계열을 추가하면 "요즘 성과가 나빠지는 중인가?"를 포착(레짐 변화 조기경보). `qs.stats` + rolling 윈도.
- **drawdown 상세**: 최대낙폭뿐 아니라 **낙폭 지속기간(recovery time)**·**낙폭 횟수**를 추가하면 "MDD 가 같아도 회복이 느린 전략"을 구분.
- **HTML/숫자 일원화**: 현재 숫자(이 파일)와 HTML(main.py)이 따로 — 한 서비스 함수로 묶어 "한 번 계산해 표·그림 동시 산출"하면 중복 백테스트 호출 절약(`/report/full` 은 백테스트를 다시 돌림).

---

## 📚 용어 사전 (이 파일 한정)

| 용어 | 뜻 |
|---|---|
| **일별 단순수익률(daily simple returns)** | `(오늘값-어제값)/어제값` 의 날짜별 Series. 이 파일의 입력. vbt 의 `pf.returns()` |
| **CAGR** | 연환산 복리수익률(%) |
| **Sharpe / Sortino / Calmar** | 위험 대비 수익 비율. 분모=전체변동성 / 하락변동성 / \|MDD\| |
| **Volatility(변동성)** | 수익률 표준편차의 연율화(%) |
| **MDD(Max Drawdown)** | 고점 대비 최대 낙폭(%) |
| **Win Rate(승률)** | 수익 난 날 / 전체 날(%) |
| **best / worst** | 최고·최악 **하루** 수익률(%) |
| **VaR(Value at Risk, 95%)** | 하위 5% 분위수 — "이보다 더 잃지는 않는" 경계 손실 |
| **CVaR(Conditional VaR / Expected Shortfall, 95%)** | VaR 너머 꼬리(하위 5%)의 평균 손실. 항상 VaR 보다 나쁨 |
| **alpha(α)** | 시장(β)으로 설명 안 되는 순수 초과수익 |
| **beta(β)** | 시장 1% 변화당 전략의 민감도 |
| **information_ratio(정보비율)** | 벤치마크 초과수익 ÷ 그 변동성 — "꾸준히 이겼나" |
| **`qs.stats.*`** | quantstats 의 지표 함수 모음 |
| **`qs.stats.greeks`** | alpha·beta 를 함께 담아 반환 |
| **`qs.reports.html`** | (이 파일 아님 / main.py) 풀 HTML Tearsheet 생성기 |
| **`_f()`** | NaN/Inf→None, float·반올림 안전 변환 헬퍼 |
| **matplotlib `Agg` 백엔드** | 화면 없이 파일로만 그림 그리는 모드(서버용) |
| **Tearsheet** | 전략 성과를 차트·표로 한 장에 모은 종합 리포트(HTML) |
