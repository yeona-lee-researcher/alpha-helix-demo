# `robust/trust_score.py` — 종합 신뢰점수 0~100 (완전 라인별 해설)

> 원본: `analytics/app/robust/trust_score.py` (545줄)
> 이 문서는 [표준 예시 `01_backtest/vbt_engine.md`](../01_backtest/vbt_engine.md) 형식을 따릅니다.
> 함께 읽기(이 파일이 import 하는 두 모듈): [`walkforward.md`](walkforward.md) · [`regime.md`](regime.md)

---

## 📌 이 파일 한눈에

이 파일은 **"전략의 종합 신용등급 심사관"** 입니다. 하나의 전략을 5개의 서로 다른 시험(일반화·국면견고성·파라미터안정성·리스크통제·통계유의성)에 통과시킨 뒤, 각 점수를 **가중평균**해서 **0~100점 하나의 Trust Score**로 묶고, 마지막에 **과적합 벌점**을 빼서 최종 점수를 냅니다.

> 비유: 은행이 대출 심사할 때 **소득·연체이력·자산·직업안정성·신용조회기록**을 각각 점수 매긴 뒤 가중치를 두어 하나의 신용등급(예: 720점)으로 합치는 것과 똑같습니다. 여기서 "대출 신청자"는 **투자 전략**이고, "신용등급"이 **Trust Score**입니다. 단순히 "과거에 얼마 벌었나(수익률)"만 보지 않고 — 그건 소득만 보고 대출 내주는 것과 같죠 — **"이 성과를 미래에도 반복할 수 있나"** 를 다각도로 따집니다.

핵심 함수는 5개입니다:

| 함수 | 한 줄 역할 | 비유 |
|---|---|---|
| `classify_asset(ticker)` | 종목 코드 → (자산군, 레버리지배수, 기초자산) 판별 | TQQQ 를 보고 "3배 레버리지 ETF" 라고 알아챔 |
| `probabilistic_sharpe_ratio(...)` | 일별 수익률 → "진짜 Sharpe > 0 일 확률"(PSR) | "이 성적이 우연이 아닐 확률 몇 %?" 채점 |
| `_norm_cdf(z)` | 표준정규분포 누적확률(scipy 없이) | z-점수 → 백분위 변환기 |
| `_clip01 / _normalize_weights` | 0~1 가두기 · 가중치 합을 1.0 으로 정규화 | 점수가 범위 밖으로 안 새게 하는 안전장치 |
| **`compute_trust_score(...)`** | **이 파일의 본체** — 5개 하위점수 계산 → 가중합 → 0~100 + 벌점 + 자연어 리포트 | 심사 전 과정을 총괄하는 심사위원장 |

**누가 호출하나?** → `app/main.py` 의 `POST /trust` 엔드포인트(`trust_endpoint`)가 부릅니다. 백엔드(Spring)가 "이 종목, 이 전략의 Trust Score 계산해줘"라고 요청하면 결국 이 파일의 `compute_trust_score` 가 일하고, 그 결과 dict 이 프론트엔드 **Trust 탭**의 게이지·세부카드·자연어 설명으로 그려집니다.

```python
# app/main.py L300-L310 (호출처)
return compute_trust_score(
    df["Close"], params,
    mdd_target_pct=req.mdd_target_pct,
    weights=req.weights, overfit_penalty_max=req.overfit_penalty_max,
    wf_train=req.wf_train, wf_test=req.wf_test,
    ticker=req.ticker, asset_class=req.asset_class, leverage=req.leverage,
)
```

**왜 5개로 나누나?** → 단일 숫자(예: 수익률)는 거짓말을 쉽게 합니다. 과거 데이터에만 운 좋게 맞은 전략도 수익률은 높을 수 있죠(과적합). **서로 독립적인 5개 관점에서 모두 합격해야** 진짜 믿을 만한 전략이라는 발상입니다. 한 시험만 잘 봐서는 높은 종합점수가 안 나옵니다.

---

## 🧠 사전 지식 (이거 모르면 막힘)

이 파일은 다른 모듈의 결과를 **재료로 받아 조립**합니다. 그래서 재료 3종을 먼저 알아야 합니다.

#### 1) 재료 ① — 백테스트 결과 `run_backtest()` (← `vbt_engine.py`)
- 전략을 과거 **전체 구간**에 적용한 성적표. 여기서 `sharpe`, `total_return_pct`, `max_drawdown_pct`, `equity_curve`(자산곡선) 를 꺼내 씁니다.
- 이걸 **In-Sample(IS, 표본 내)** 성과라고 부릅니다 = "공부한 시험지로 본 시험".

#### 2) 재료 ② — 워크포워드 `walk_forward()` (← `walkforward.py`)
- 시계열을 `[skip(train_window) | test(test_window)]` 폴드로 굴리며 **test 구간만** 백테스트.
- ⚠️ 이 파일의 walk_forward 는 이름과 달리 **파라미터 재최적화를 하지 않습니다**. `train_window` 는 그냥 건너뛰는 오프셋(워밍업)이고, 모든 폴드가 **같은 파라미터**로 test 구간을 돈다 → 정통 워크포워드가 아니라 **"시간대별 OOS 일관성 측정"** 입니다(walkforward.py 의 docstring 명시).
- 각 폴드의 test 결과가 **Out-of-Sample(OOS, 표본 밖)** 성과 = "처음 보는 시험지로 본 시험". IS 보다 OOS 가 좋아야 진짜 실력.

```
walk_forward 가 만드는 폴드 (train_window=504, test_window=63 예시)
 [────── skip 504일 ──────][ test 63일 ]                            ← 폴드1
                          [────── skip 504일 ──────][ test 63일 ]   ← 폴드2 (test_window 만큼 전진)
 ...
 각 test 구간 성적의 Sharpe 들이 OOS Sharpe 모음이 됨
```

#### 3) 재료 ③ — 국면별 성과 `per_regime_stats()` (← `regime.py`)
- 같은 전략을 **시장 상태(국면)별로 쪼개** 성과를 따로 냅니다: 상승장(안정)·상승장(불안정)·하락장·횡보장·고변동성.
- 핵심: 각 국면의 `effective_sharpe`(보정 Sharpe) 를 씁니다. **짧은 표본의 Sharpe 는 못 믿으니** `SR_eff = SR × T/(T+60)` 로 0 쪽으로 끌어당깁니다(Bayesian shrinkage). 10일짜리 하락장에서 -6.25 같은 극단값이 점수를 망치지 않도록.

#### 4) Sharpe Ratio = "위험 1단위당 수익"
- `Sharpe = 평균수익 / 수익의 표준편차`. 클수록 좋음. 일별 Sharpe 에 `√252` 를 곱하면 연환산.
- 같은 수익률이라도 **들쭉날쭉하면(표준편차 큼) Sharpe 가 낮다** → "안정적으로 번 돈"을 높게 침.

#### 5) PSR (Probabilistic Sharpe Ratio) — Bailey & López de Prado (2012)
- "관측된 Sharpe 가 양수다"가 아니라 **"진짜 Sharpe 가 기준치(여기선 0)보다 클 확률"** 을 계산합니다.
- 왜 필요한가? Sharpe 도 **표본에서 추정한 값**이라 우연일 수 있습니다. 표본이 짧거나(작은 T), 수익 분포가 한쪽으로 쏠리거나(skew), 꼬리가 두꺼우면(kurtosis) Sharpe 의 신뢰도가 떨어집니다. PSR 은 이 셋을 **보정**해서 "우연이 아닐 확률"을 %로 줍니다.
- 비유: 동전을 10번 던져 7번 앞면 나왔다고 "이 동전은 앞면이 잘 나온다"고 단정할 수 없습니다. PSR 은 "**몇 번 던졌나(T)**, **얼마나 치우쳤나(skew)**, **이상한 결과가 얼마나 잦았나(kurt)**" 를 따져 그 주장이 우연이 아닐 확률을 줍니다.

#### 6) 가중합(Weighted Sum) = "각 점수 × 중요도 비율을 더하기"
- 최종점수 = `Σ(하위점수 × 가중치)`, 가중치 합 = 1.0. 예: 일반화 80점(가중 0.25) + 리스크 60점(0.20) + … 
- 가중치는 사용자가 바꿀 수 있고(Analyst Mode), 합이 1 이 아니어도 코드가 **자동 정규화**(합 1.0 으로)합니다.

#### 7) 과적합(Overfitting) = "기출문제만 외운 학생"
- 과거 데이터에 **지나치게 맞춘** 전략. IS(공부한 시험)는 잘 보는데 OOS(새 시험)는 못 봅니다. `IS Sharpe ≫ OOS Sharpe` 격차가 그 증거 → 벌점.

---

## 🗺 전체 흐름도

```
                close (날짜별 종가 Series) + params + ticker/옵션
                                    │
        ┌───────────────┬───────────┼───────────────┬──────────────────┐
        ▼               ▼           ▼               ▼                  ▼
  run_backtest     walk_forward  per_regime_stats  _perturb×4         equity_curve
  (IS 전체성과)     (OOS 폴드들)   (국면별 성과)     (파라미터 흔들기)   →일별수익률→PSR
        │               │           │               │                  │
        ▼               ▼           ▼               ▼                  ▼
   is_sharpe       oos_sharpe_mean  worst/best     perturb_sharpes    psr_zero
   is_mdd          n_folds          eff_sharpe     표준편차
        │               │           │               │                  │
   ┌────┴───┐      ┌────┴────┐  ┌───┴────┐    ┌─────┴─────┐     ┌──────┴──────┐
   ▼        ▼      ▼         ▼  ▼        ▼    ▼           ▼     ▼             ▼
 risk_control   generalization  regime_robust  parameter_stability  statistical_confidence
  (0~1)            (0~1)          (0~1)            (0~1)                  (0~1)
   │                │              │                │                      │
   └──────×100──────┴──────────────┴────────────────┴──────────────────────┘
                                    │  각 0~100
                                    ▼
                  base = Σ(sub[k] × weights[k])         ← 가중합
                                    │
                                    ▼
                  score = clip(base + overfit_penalty, 0, 100)   ← 벌점 차감
                                    │
                                    ▼
          { trust_score, sub_scores, sub_reasons, narrative, details, config }
                          → main.py → 백엔드 → 프론트 Trust 탭
```

---

## 📖 라인별 해설

### A. 파일 설명서(docstring) — `L1-L26`

```python
# L1-L11
"""
Trust Score (0~100) — Alpha-Helix's signature signal.

Composite of 5 sub-scores + overfitting penalty:
  - Generalization (out-of-sample consistency from walk-forward)
  - Regime Robustness (worst-regime Sharpe vs best-regime Sharpe)
  - Parameter Stability (variance under small param perturbations)
  - Risk Control (max drawdown vs target — leverage-aware)
  - Statistical Confidence (PSR, Bailey & López de Prado 2012)
  - Overfitting Penalty (in-sample vs out-of-sample gap)
"""
```
- 파일 맨 위 docstring(설명서). 실행되지 않고 사람이 읽는 용도. **이 파일이 무엇을 하는지 목차**입니다 — 5개 하위점수 + 1개 벌점. 본문을 읽다 길을 잃으면 여기로 돌아오세요.
- "signature signal" = Alpha-Helix 의 **간판 기능**. 백테스트가 "얼마 벌었나"를 보여준다면, Trust Score 는 "그걸 믿어도 되나"를 보여줍니다.

```python
# L12-L26 (요약)
이론적 근거:
  - PSR: Bailey & López de Prado, "The Sharpe Ratio Efficient Frontier" (2012)
  - Sharpe Ratio 표본분포: Lo, "The Statistics of Sharpe Ratios" (2002)
  - Leverage-aware MDD: 3배 레버리지 ETF 는 ~3배 변동성 → 동일 MDD 임계값 부당
사용자 조정 영역 (Analyst Mode):
  - weights / overfit_penalty_max / wf_train / wf_test / mdd_target_pct / asset_class / leverage
```
- **왜 논문을 인용하나?** → 이 점수가 **임의로 지어낸 게 아니라 학술 근거가 있음**을 못박는 것. (메모리의 "엔진 신뢰성 감사"에서 가짜 0건이 확증된 맥락.)
- "Analyst Mode" — 전문가는 가중치·윈도우·MDD 목표 등을 직접 조절할 수 있다는 예고. 함수 인자에서 다시 만납니다.

```python
# L27-L36
from __future__ import annotations
from math import erf, sqrt
from typing import Dict, Any, Optional, Tuple
import numpy as np
import pandas as pd

from app.backtest.vbt_engine import BacktestParams, run_backtest
from app.robust.walkforward import walk_forward
from app.robust.regime import per_regime_stats
```
- `from math import erf, sqrt` — **`erf`(오차함수)** 가 핵심. 이걸로 표준정규 CDF 를 직접 만들어 **scipy 의존을 피합니다**(가벼운 배포). `sqrt` 는 제곱근.
- 마지막 3줄이 **이 파일의 재료 공급선**: 백테스트·워크포워드·국면분석을 가져옴. 즉 이 파일은 직접 계산하기보다 **3개 모듈의 결과를 조립**하는 "지휘자"입니다.

> 💡 초보 포인트: `from __future__ import annotations` 는 "최신 타입표기를 쓰기 위한 주문" 정도로 이해하면 됩니다(vbt_engine 문서와 동일). `Tuple[float, Dict]` 같은 반환 타입을 문자열처럼 늦게 평가하게 해줍니다.

---

### B. 기본 가중치 — `L38-L44`

```python
# L38-L44
DEFAULT_WEIGHTS: Dict[str, float] = {
    "generalization": 0.25,
    "regime_robustness": 0.20,
    "parameter_stability": 0.15,
    "risk_control": 0.20,
    "statistical_confidence": 0.20,
}
```
- 5개 하위점수의 **기본 중요도**. 합 = 0.25+0.20+0.15+0.20+0.20 = **1.0**(정확히 1).
- 가장 무거운 건 `generalization(0.25)` — "미래에도 통하나"가 제일 중요하다는 철학. 가장 가벼운 건 `parameter_stability(0.15)`.
- 사용자가 `weights` 를 안 주면 이게 쓰이고, 일부만 주면 나머지는 여기서 채웁니다(아래 `_normalize_weights`).

> 💡 초보 포인트: 이 dict 의 **키 이름 5개가 곧 하위점수의 ID**입니다. 본문 곳곳에서 같은 문자열(`"generalization"` 등)로 점수·이유·가중치를 묶어 다닙니다. 키가 일치해야 가중합이 맞습니다.

---

### C. 자산 분류 테이블 — `L46-L81`

```python
# L53-L59
LEVERAGED_3X = {
    "TQQQ", "SQQQ", "SOXL", "SOXS", "UPRO", "SPXU", "SPXL", "SPXS",
    ... (40개 가까운 3배 레버리지 ETF 티커)
}
LEVERAGED_2X = { "SSO", "SDS", "QLD", "QID", ... }   # L60-L64
INDEX_ETF    = { "SPY", "QQQ", "IWM", "GLD", ... }   # L65-L70
```
- **왜 종목을 분류하나?** → 같은 MDD(최대낙폭) 50% 라도 의미가 다릅니다. **3배 레버리지 ETF(TQQQ)** 는 원래 기초자산의 ~3배로 출렁이므로 50% MDD 가 "정상"이지만, **지수 ETF(SPY)** 가 50% 빠지면 "재앙"입니다. → 자산군마다 **MDD 목표를 다르게** 줘야 공정합니다(L18 주석의 leverage-aware).
- `{...}` 는 파이썬 **set(집합)**: 멤버십 검사(`t in LEVERAGED_3X`)가 빠릅니다. 순서·중복 없음.

```python
# L73-L81
UNDERLYING_MAP = {
    "TQQQ": "QQQ", "SQQQ": "QQQ", ...
    "SOXL": "SMH", "SOXS": "SMH",
    "TMF": "TLT", "TMV": "TLT",
}
```
- **3배 ETF → 기초자산 매핑**. 예: TQQQ 의 기초는 QQQ(나스닥100). 국면(regime) 분석은 출렁임 심한 레버리지 종목보다 **깨끗한 기초자산**으로 보는 게 낫기 때문에 준비된 표입니다.
- ⚠️ 다만 **이 매핑이 실제로 국면 분석에 쓰이지는 않습니다**(아래 "함정" 참고). `underlying` 값을 계산해 응답 `config` 에 넣긴 하지만, `per_regime_stats` 는 원래 `close`(레버리지 종목)로 호출됩니다.

---

### D. `classify_asset()` — 종목 → 자산군 판별 — `L84-L98`

```python
# L84-L98
def classify_asset(ticker: Optional[str]) -> Tuple[str, int, Optional[str]]:
    t = (ticker or "").upper().strip()
    if not t:
        return ("unknown", 1, None)
    if t in LEVERAGED_3X:
        return ("etf_leveraged_3x", 3, UNDERLYING_MAP.get(t))
    if t in LEVERAGED_2X:
        return ("etf_leveraged_2x", 2, UNDERLYING_MAP.get(t))
    if t in INDEX_ETF:
        return ("etf_index", 1, None)
    return ("single_stock", 1, None)
```
- **무엇을**: 티커 문자열을 받아 `(자산군 이름, 레버리지 배수, 기초자산)` 3개를 돌려줍니다.
- **한 줄씩**:
  - `(ticker or "").upper().strip()` — None 이거나 빈값이면 `""` 로, 그리고 **대문자·공백제거**로 정규화. `" tqqq "` → `"TQQQ"`.
  - `if not t:` — 티커가 없으면 `("unknown", 1, None)`. 레버리지 배수 1(=레버리지 없음 취급).
  - 3배 집합에 있으면 배수 3 + 기초자산(`UNDERLYING_MAP.get(t)`, 없으면 None). 2배면 배수 2. 지수 ETF 면 배수 1.
  - 어디에도 없으면 `("single_stock", 1, None)` — **개별주식**으로 간주.
- **왜 이렇게**: 뒤에서 이 결과로 **MDD 목표**(자산군별)와 응답의 레버리지 표시를 결정합니다.

> 💡 초보 포인트: `Tuple[str, int, Optional[str]]` 반환 타입 = "(문자열, 정수, 문자열-또는-None) 3칸 묶음". `ac, lev, underlying = classify_asset(...)` 처럼 한 번에 풀어 받습니다.

---

### E. `_norm_cdf()` — scipy 없는 정규분포 CDF — `L101-L103`

```python
# L101-L103
def _norm_cdf(z: float) -> float:
    """표준정규 CDF — scipy 의존 회피용."""
    return 0.5 * (1.0 + erf(z / sqrt(2.0)))
```
- **무엇을**: z-점수를 받아 **"표준정규분포에서 z 이하가 나올 확률"**(누적분포함수 CDF)을 반환. 예: `_norm_cdf(0)=0.5`, `_norm_cdf(1.96)≈0.975`.
- **왜 이렇게**: 정규분포 CDF 는 보통 `scipy.stats.norm.cdf` 로 구하지만, scipy 는 무거운 의존성입니다. 다행히 **CDF = 0.5·(1 + erf(z/√2))** 라는 수학 항등식이 있어, 표준라이브러리 `math.erf` 만으로 똑같이 계산합니다.
- PSR(아래)에서 z-점수를 확률로 바꿀 때 이 함수를 씁니다.

> 💡 초보 포인트: CDF 를 "z-점수 → 백분위 변환기"로 생각하세요. z 가 클수록 확률이 1 에 가까워집니다(우상향 S자 곡선).

---

### F. `probabilistic_sharpe_ratio()` — PSR 계산 (통계의 핵심) — `L106-L135`

함수 머리와 공식 docstring:
```python
# L106-L114
def probabilistic_sharpe_ratio(daily_returns: pd.Series,
                                sr_threshold_annual: float = 0.0) -> Tuple[float, Dict[str, float]]:
    """
    PSR(SR*) = P(true SR > SR*) — Bailey & López de Prado (2012)
    PSR = Φ( (SR_obs - SR*) · √(T-1) / √(1 - γ₃·SR_obs + (γ₄-1)/4 · SR_obs²) )
    여기서 SR_obs / SR* 는 동일 시간단위(일별), γ₃=skew, γ₄=kurtosis.
    """
```
- **반환**: `(psr 확률, 진단 dict)`. 진단(diag)에는 T(표본수)·일별/연환산 Sharpe·skew·kurt 가 담깁니다.
- 공식 한글 풀이: **PSR = Φ( (관측Sharpe − 기준Sharpe) × √(T−1) ÷ √(분산보정항) )**.
  - `Φ`(파이) = 정규분포 CDF(= `_norm_cdf`).
  - 분자 `(SR_obs − SR*)·√(T−1)` — Sharpe 가 기준보다 클수록, **표본이 많을수록(T 큼)** z 가 커짐 → 확률↑.
  - 분모 `√(1 − γ₃·SR + (γ₄−1)/4·SR²)` — **분포 왜곡(skew γ₃, kurtosis γ₄) 보정**. 꼬리가 두껍거나 한쪽 쏠림이면 분모가 커져 확률을 깎음(신중하게).

```python
# L115-L120
    r = daily_returns.dropna().astype(float)
    T = len(r)
    diag = {"T": T, "sr_daily": 0.0, "sr_annual": 0.0, "skew": 0.0, "kurt": 0.0}
    if T < 30 or r.std(ddof=1) == 0:
        return 0.0, diag
```
- 일별 수익률에서 NaN 제거 후 float 변환. `T` = 표본 일수.
- **가드(guard)**: `T < 30`(표본 너무 적음) 또는 `표준편차 0`(전혀 안 움직임 = 거래 없음)이면 **PSR 0.0 으로 즉시 종료**. 통계적으로 의미 없는 입력을 막습니다.
- `r.std(ddof=1)` — `ddof=1` 은 **표본 표준편차**(n−1 로 나눔). 모집단(n)이 아니라 표본에서 추정하므로 1 을 뺍니다(불편추정).

```python
# L121-L125
    sr_daily = float(r.mean() / r.std(ddof=1))
    sr_annual = sr_daily * np.sqrt(252)
    skew = float(r.skew()) if T >= 3 else 0.0
    # pandas .kurtosis() 는 Fisher (excess) — Bailey 공식의 γ₄는 정규 kurtosis 이므로 +3
    kurt = float(r.kurtosis()) + 3.0 if T >= 4 else 3.0
```
- `sr_daily` = 일별 Sharpe(평균/표준편차). `sr_annual` = ×√252 로 연환산(연 거래일 ~252).
- `skew`(왜도) — 분포가 좌/우로 치우친 정도. 표본 3개 미만이면 0.
- **여기 헷갈리는 포인트(코드 주석이 짚은 것)**: pandas 의 `.kurtosis()` 는 **Fisher 정의(excess kurtosis)** 라 정규분포면 0 입니다. 하지만 Bailey 공식의 γ₄ 는 **정규 kurtosis**(정규분포면 3)를 씁니다. 그래서 **`+3.0` 을 더해** 정의를 맞춥니다. 이걸 빼먹으면 PSR 이 틀어집니다.

```python
# L127-L135
    sr_star_daily = sr_threshold_annual / np.sqrt(252)
    denom_sq = 1.0 - skew * sr_daily + ((kurt - 1.0) / 4.0) * (sr_daily ** 2)
    if denom_sq <= 0 or not np.isfinite(denom_sq):
        return 0.0, diag

    z = (sr_daily - sr_star_daily) * np.sqrt(max(1, T - 1)) / np.sqrt(denom_sq)
    psr = _norm_cdf(z)
    diag.update({"sr_daily": sr_daily, "sr_annual": sr_annual, "skew": skew, "kurt": kurt})
    return float(psr), diag
```
- `sr_star_daily` — 기준 Sharpe(연환산 입력)를 **일별로 환산**(÷√252). 분자의 SR_obs 와 단위를 맞추는 것(둘 다 일별).
- `denom_sq` = 공식의 분모 제곱(분산 보정항). `1 − skew·SR + (kurt−1)/4·SR²`.
- **가드**: `denom_sq <= 0`(제곱근 불가) 또는 무한대면 PSR 0.0. 수학적 폭발 방지.
- `z = 분자·√(T−1) / √denom_sq` — `max(1, T-1)` 로 T=1 일 때 0 제곱근(=0 나눗셈) 방지.
- `psr = _norm_cdf(z)` — z 를 확률(0~1)로. 진단 dict 업데이트 후 반환.

> 💡 초보 포인트: PSR 의 묘미는 **"표본이 많고(T↑) Sharpe 가 높을수록 확률↑, 분포가 비정상이면(skew·kurt) 확률↓"** 입니다. 즉 "운 좋게 30일 반짝 좋은 성적"과 "10년 꾸준히 좋은 성적"을 구별합니다.

---

### G. 작은 유틸들 `_clip01` / `_normalize_weights` — `L138-L148`

```python
# L138-L139
def _clip01(x: float) -> float:
    return float(max(0.0, min(1.0, x)))
```
- **무엇을**: 어떤 값이든 **0~1 사이로 가둠**(0 미만 → 0, 1 초과 → 1). 모든 하위점수 비율을 여기 통과시켜 범위를 보장합니다. 점수 × 100 했을 때 음수나 100 초과가 안 나오게.

```python
# L142-L148
def _normalize_weights(w: Dict[str, float]) -> Dict[str, float]:
    """가중치 dict을 받아 누락 키는 기본값으로 채우고 합 1.0으로 정규화."""
    merged = {k: float(w.get(k, DEFAULT_WEIGHTS[k])) for k in DEFAULT_WEIGHTS}
    s = sum(max(0.0, v) for v in merged.values())
    if s <= 0:
        return dict(DEFAULT_WEIGHTS)
    return {k: max(0.0, v) / s for k, v in merged.items()}
```
- **무엇을**: 사용자가 준 가중치를 **정상화**.
  - `merged` — 5개 키를 순회하며, 사용자가 준 값(`w.get(k, ...)`)이 있으면 쓰고 없으면 기본값. → **누락 키 자동 보충**.
  - `s = sum(max(0,v)...)` — 음수는 0 취급하고 전부 더함. 합이 0 이하(전부 0/음수)면 안전하게 **기본 가중치로 폴백**.
  - 마지막 줄 — 각 값을 합으로 나눠 **합이 정확히 1.0** 이 되게. 예: 사용자가 `{gen:2, risk:2}` 만 줘도 자동으로 비율 변환.
- **왜 이렇게**: 사용자가 합 1 을 안 맞춰도, 일부만 줘도, 음수를 줘도 **항상 유효한 가중치**가 되도록. 견고성(robustness).

---

### H. 자산별 기본 MDD 목표 — `L151-L158`

```python
# L151-L158
DEFAULT_MDD_BY_CLASS = {
    "etf_index": 25.0,
    "etf_leveraged_2x": 50.0,
    "etf_leveraged_3x": 75.0,
    "single_stock": 35.0,
    "unknown": 30.0,
}
```
- 사용자가 `mdd_target_pct` 를 **안 주면** 자산군별로 이 값을 목표 MDD 로 씁니다.
- 레버리지가 클수록 목표가 관대(3x=75%): "3배 ETF 가 75% 빠지는 건 정상 범위"라는 뜻. 지수 ETF 는 엄격(25%).
- `single_stock=35%` — 개별주식은 지수보다 변동성 커서 25 보다 느슨, 그러나 레버리지보다는 엄격.

---

### I. `compute_trust_score()` — 본체 ①: 인자와 사전 준비 — `L161-L186`

함수 머리(긴 인자 목록 = Analyst Mode 의 모든 손잡이):
```python
# L161-L169
def compute_trust_score(close: pd.Series, params: BacktestParams,
                        mdd_target_pct: Optional[float] = None,
                        weights: Optional[Dict[str, float]] = None,
                        overfit_penalty_max: int = 15,
                        wf_train: int = 504,
                        wf_test: int = 63,
                        ticker: Optional[str] = None,
                        asset_class: str = "auto",
                        leverage: Optional[int] = None) -> Dict[str, Any]:
```
- 입력 손잡이:
  - `close` — 종가 Series, `params` — 전략 파라미터(`BacktestParams`).
  - `mdd_target_pct` — 리스크 목표 MDD. None 이면 자산군별 자동.
  - `weights` — 가중치 override. None 이면 기본.
  - `overfit_penalty_max=15` — 과적합 벌점 **상한**(최대 15점까지만 깎음).
  - `wf_train=504, wf_test=63` — 워크포워드 윈도우(영업일). 504≈2년, 63≈1분기.
  - `ticker` / `asset_class="auto"` / `leverage` — 자산 분류 입력/override.

> ⚠️ 주의: 함수 기본값은 `wf_train=504` 인데, **`main.py` 의 `/trust` 엔드포인트는 `wf_train=252`(1년)를 기본으로 보냅니다**(TrustReq). 즉 API 로 부르면 보통 252 가 적용됩니다. 함수 자체 기본(504)과 다르니 혼동 주의.

```python
# L170-L186
    weights = _normalize_weights(weights or DEFAULT_WEIGHTS)
    overfit_penalty_max = max(0, int(overfit_penalty_max))

    # ── 자산 분류 (auto → ticker 기반) ──
    if asset_class == "auto":
        ac, lev_auto, underlying = classify_asset(ticker)
    else:
        ac = asset_class
        lev_auto = leverage or 1
        underlying = UNDERLYING_MAP.get((ticker or "").upper().strip())
    eff_leverage = int(leverage) if leverage else lev_auto
    if mdd_target_pct is None:
        mdd_target_pct = DEFAULT_MDD_BY_CLASS.get(ac, 30.0)
    mdd_target_pct = float(mdd_target_pct)

    reasons: Dict[str, str] = {}
```
- 가중치 정규화 + 벌점 상한을 0 이상 정수로 강제.
- 자산 분류: `"auto"` 면 `classify_asset(ticker)` 로 자동, 아니면 사용자가 준 `asset_class`/`leverage` 사용.
- `eff_leverage`(유효 레버리지) — 사용자가 `leverage` 를 직접 주면 그걸, 아니면 자동값(`lev_auto`). 응답 표시·리스크 설명에 쓰임.
- `mdd_target_pct` 미지정 시 자산군별 기본값 적용 후 float 화.
- `reasons` — **각 하위점수의 "근거 문장"을 모을 빈 dict**. 이후 단계마다 `reasons["..."] = "..."` 로 채워 자연어 리포트에 씁니다.

---

### J. 본체 ②: 재료 수집 — IS / Walk-Forward / Regime — `L188-L252`

#### J-1) In-Sample 전체 백테스트 — `L188-L192`
```python
# L188-L192
    # 1) full in-sample
    is_bt = run_backtest(close, params)
    is_sharpe = is_bt["stats"].get("sharpe", 0) or 0
    is_total = is_bt["stats"].get("total_return_pct", 0) or 0
    is_mdd = is_bt["stats"].get("max_drawdown_pct", 0) or 0  # negative %
```
- 전략을 **과거 전체**에 적용한 성적(IS). 여기서 Sharpe·총수익·MDD 추출.
- `... or 0` 관용구 — `.get(...)` 이 `None` 을 반환할 수 있어(stats 가 NaN→None 처리됨), None 이면 0 으로. **None 으로 산술하다 터지는 것 방지**.
- `is_mdd` 는 음수 %(예: -23.5). 주석 `# negative %` 가 그 뜻. 뒤에서 `abs()` 로 절댓값 씁니다.

#### J-2) Walk-Forward (OOS) — `L194-L210`
```python
# L194-L210
    # 2) walk-forward
    wf = walk_forward(close, params, train_window=wf_train, test_window=wf_test)
    all_folds = wf.get("folds", [])
    valid_folds = [f for f in all_folds if "stats" in f and f["stats"].get("sharpe") is not None]
    n_folds = len(valid_folds)
    n_total_folds = len(all_folds)
    if valid_folds:
        oos_sharpes = [f["stats"]["sharpe"] for f in valid_folds]
        oos_returns = [f["stats"]["total_return_pct"] for f in valid_folds]
        oos_sharpe_mean = float(np.mean(oos_sharpes))
        oos_sharpe_std = float(np.std(oos_sharpes))
        if len(oos_returns) >= 3 and np.std(oos_returns) > 0:
            tstat = float(np.mean(oos_returns) / (np.std(oos_returns) / np.sqrt(len(oos_returns))))
        else:
            tstat = 0.0
    else:
        oos_sharpe_mean = oos_sharpe_std = tstat = 0.0
```
- `walk_forward(...)` → 폴드 리스트를 받음. **유효 폴드**(stats 안에 sharpe 가 None 아닌 것)만 추림. 신호가 없어 거래 0 인 폴드는 sharpe 가 None 이라 제외됩니다.
- `n_folds`(유효) vs `n_total_folds`(전체) — "10개 폴드 중 7개 유효" 식으로 보고.
- `oos_sharpe_mean/std` — OOS Sharpe 들의 평균·표준편차.
- **`tstat`(t-통계량)** — OOS 수익률 평균이 0 과 유의하게 다른지: `평균 / (표준편차/√n)`. 폴드 3개 이상 + 변동 있을 때만 계산. **표준오차로 나눈 값** — 클수록 "수익이 0 이 아니다"가 통계적으로 확실.
- 유효 폴드가 없으면 전부 0(평가 불가).

#### J-3) Regime (국면별 성과) — `L212-L252`
```python
# L212-L222
    # 3) regime — 표본 가중치(Bayesian shrinkage) 적용된 effective_sharpe 사용
    regime = per_regime_stats(close, params)
    regime_per = regime.get("per_regime", {}) if isinstance(regime, dict) else {}

    valid_regimes = {k: v for k, v in regime_per.items()
                     if isinstance(v, dict) and "effective_sharpe" in v}
    insufficient_regimes = [k for k, v in regime_per.items()
                             if isinstance(v, dict) and "effective_sharpe" not in v]
```
- `per_regime_stats(close, params)` 호출 — **국면별 성과**를 받음. ⚠️ **`method` 인자를 안 줌 → 기본 `"rule"`** 로 분류(빠른 규칙기반). HMM 은 여기서 안 씀(함정 섹션 참고).
- `valid_regimes` — `effective_sharpe`(보정 Sharpe) 가 있는 국면만. 표본 5일 미만 국면은 regime.py 에서 `{"days":.., "note":"샘플 부족"}` 만 주므로 `effective_sharpe` 키가 없어 **자동 제외**.
- `insufficient_regimes` — 제외된(표본부족) 국면 이름들. 리포트에 "제외: ..." 로 표시.

```python
# L224-L238
    if len(valid_regimes) >= 2:
        items = sorted(valid_regimes.items(), key=lambda kv: kv[1]["effective_sharpe"])
        worst_k, worst_v = items[0]
        best_k, best_v = items[-1]
        worst = worst_v["effective_sharpe"]
        best = best_v["effective_sharpe"]
        regime_robust = _clip01((worst + 1) / 3.0)
        ...
        reasons["regime_robustness"] = ( ... 최악/최고 국면 Sharpe 설명 ... )
```
- 국면이 **2개 이상** 평가 가능하면: `effective_sharpe` 기준 **정렬**해 최악(items[0])·최고(items[-1])를 뽑음.
- **핵심 점수식**: `regime_robust = clip01((worst + 1) / 3.0)`.
  - **최악 국면의 보정 Sharpe** 만으로 점수를 매김(최고는 설명용). "가장 안 좋은 시장에서도 버티나"가 견고성의 본질이라는 발상.
  - 매핑: `worst = +2 → (2+1)/3 = 1.0`(만점), `worst = -1 → 0`(0점), `worst = 0 → 0.33`. 즉 **최악 국면 Sharpe 가 -1~+2 구간을 0~1 로 선형 변환**.
- `reasons` 에 "최악 X 보정 Sharpe=... (원본 × 표본가중치, N일) · 최고 Y ... · Bayesian shrinkage 적용" 문장을 채움.

```python
# L239-L252
    elif len(valid_regimes) == 1:
        only_k, only_v = next(iter(valid_regimes.items()))
        worst = best = only_v["effective_sharpe"]
        regime_robust = 0.5
        reasons["regime_robustness"] = ( "평가 가능한 국면이 1개뿐 · 기본 50점 ..." )
    else:
        worst = best = 0
        regime_robust = 0.5
        reasons["regime_robustness"] = ( "유효 국면 데이터 없음. 기본 50점 ..." )
```
- 국면이 **1개뿐**이면 비교 불가 → 중립 **0.5(50점)**. 분석 기간 연장 권유.
- **0개**(국면 데이터 전무)도 0.5. "데이터 없을 때 0점도 100점도 아닌 중립" 원칙 — 모르면 깎지도 올리지도 않음.

---

### K. 본체 ③: 파라미터 안정성 (섭동 검사) — `L254-L312`

```python
# L254-L259
    # 4) parameter stability — 전략별 핵심 파라미터 섭동 ±5%/±10%
    # ⚠️ 반드시 "그 전략이 실제로 읽는" 파라미터를 흔들어야 한다. ...
    perturb_sharpes = []
    deltas = [-0.10, -0.05, 0.05, 0.10]
```
- **발상**: 좋은 전략은 파라미터를 살짝 바꿔도 성과가 비슷해야 합니다. **특정 숫자(예: SMA 60일)에만 운 좋게 맞은** 전략은 59 나 61 로 바꾸면 성과가 폭락 → 과최적화 의심.
- `deltas` — 핵심 파라미터를 **−10%, −5%, +5%, +10%** 로 흔드는 4가지 변형.
- ⚠️ **코드 주석의 핵심 교훈**: 반드시 "그 전략이 **실제로 읽는** 파라미터"를 흔들어야 함. 전략이 무시하는 파라미터를 흔들면 결과 불변 → 표준편차 0 → **거짓 100점**으로 부풀려짐(예: 과거 momentum 전략에 sma_slow 를 흔드는 버그가 있었음).

```python
# L261-L288
    def _perturb(delta: float) -> BacktestParams:
        kw = dict(
            strategy=params.strategy,
            sma_fast=..., sma_slow=..., rsi_period=..., (모든 기존 파라미터 복제)
            initial_capital=..., fees=..., slippage=...,
        )
        s = params.strategy
        if s == "sma_cross":
            kw["sma_slow"] = max(5, int(params.sma_slow * (1 + delta)))
        elif s == "momentum_12_1":
            kw["momentum_long_days"] = max(60, int(params.momentum_long_days * (1 + delta)))
        elif s == "rsi_meanrev":
            kw["rsi_period"] = max(3, int(params.rsi_period * (1 + delta)))
        elif s == "macd":
            kw["macd_slow"] = max(params.macd_fast + 2, int(params.macd_slow * (1 + delta)))
        elif s == "vix_risk_off":
            kw["vix_threshold"] = max(10.0, params.vix_threshold * (1 + delta))
        else:  # 폴백: sma_slow
            kw["sma_slow"] = max(5, int(params.sma_slow * (1 + delta)))
        return BacktestParams(**kw)
```
- **무엇을**: `delta`(예: +0.05) 만큼 **그 전략의 대표 파라미터 하나만** 바꾼 새 `BacktestParams` 를 만듦.
- **한 줄씩 (전략 → 흔드는 파라미터)**:
  - 먼저 `kw` 에 **기존 모든 파라미터를 그대로 복제**(수수료·자본·momentum·vix 등 사용자 값 보존). 그 다음 한 개만 덮어씀.
  - `sma_cross` → `sma_slow`(장기 이평) 를 흔듦. `max(5, ...)` 로 5 미만 방지.
  - `momentum_12_1` → `momentum_long_days`(장기 기간). `max(60, ...)`.
  - `rsi_meanrev` → `rsi_period`. `max(3, ...)`.
  - `macd` → `macd_slow`. `max(macd_fast + 2, ...)` 로 fast 보다 slow 가 더 길도록 보장(MACD 정의 깨짐 방지).
  - `vix_risk_off` → `vix_threshold`. `max(10.0, ...)`.
  - `else`(미지정/알 수 없는 전략) → 폴백으로 `sma_slow`.
- **왜 `max(...)` 하한**: 흔들다 보면 음수·0·비논리값이 나올 수 있어 **물리적 최소값으로 클램프**.

```python
# L290-L312
    if params.strategy == "buy_and_hold":
        param_stability = 0.5
        reasons["parameter_stability"] = ( "파라미터 없는 전략(buy_and_hold) — 중립 50점." )
    else:
        for delta in deltas:
            try:
                r = run_backtest(close, _perturb(delta))
                perturb_sharpes.append(r["stats"].get("sharpe", 0) or 0)
            except Exception:
                pass
        if perturb_sharpes:
            param_var = float(np.std(perturb_sharpes))
            param_stability = _clip01(1.0 - param_var)
            reasons["parameter_stability"] = f"±5/10% 섭동 4회 Sharpe 표준편차={param_var:.3f}"
        else:
            param_stability = 0.5
            reasons["parameter_stability"] = "섭동 백테스트 실패. 기본값 50점."
```
- **buy_and_hold 예외**: 흔들 파라미터가 없는 전략 → **거짓 100점 방지**를 위해 중립 0.5. (단순히 "변화 없음=안정 100점"으로 처리하면 과대평가됨.)
- 그 외: 4번 섭동 백테스트 → 각 Sharpe 수집. 실패한 건 `except: pass` 로 건너뜀(견고).
- **점수식**: `param_stability = clip01(1.0 − Sharpe들의표준편차)`.
  - 표준편차 0(완전 안정) → 1.0(만점). 표준편차 1 이상(요동) → 0. **흔들었을 때 Sharpe 가 안 변할수록 고득점**.
- 전부 실패하면 중립 0.5.

> 💡 초보 포인트: "1 − 표준편차" 가 점수가 되는 직관 — 표준편차는 "흔들림의 크기"라서, **흔들림이 작을수록(0 에 가까울수록) 점수가 1 에 가까워짐**. 단위가 Sharpe 라서 표준편차 1 정도면 "꽤 요동"으로 봅니다.

---

### L. 본체 ④: 리스크 통제 / 일반화 / 통계유의성 / 벌점 — `L314-L377`

#### L-1) Risk Control — `L314-L320`
```python
# L314-L320
    # 5) risk control — actual MDD vs target (leverage-aware target)
    risk_control = _clip01(1.0 - max(0, abs(is_mdd) - mdd_target_pct) / 50.0)
    lev_note = f" · {eff_leverage}x 레버리지 인지" if eff_leverage > 1 else ""
    reasons["risk_control"] = (
        f"실제 MDD={abs(is_mdd):.1f}% vs 목표 {mdd_target_pct:.0f}% "
        f"({'목표 이내' if abs(is_mdd) <= mdd_target_pct else '목표 초과'}){lev_note}"
    )
```
- **점수식**: `risk_control = clip01(1.0 − max(0, |실제MDD| − 목표MDD) / 50.0)`.
  - `max(0, |MDD| − 목표)` — **목표를 초과한 만큼**(목표 이내면 0). 예: 목표 25%, 실제 30% → 초과 5.
  - `/ 50.0` — 초과분을 **50%로 나눠** 0~1 로 환산하고 1 에서 뺌. 초과 0 → 1.0(만점), 초과 50% → 0.
  - 즉 **목표 이내면 무조건 만점(1.0)**, 목표를 초과할수록 점차 감점.
- ⚠️ `/ 50.0` 은 **고정 상수**입니다(자산군과 무관). 레버리지는 목표(mdd_target)에만 반영되고, "초과분→점수" 변환 기울기는 모두 동일 50 — 함정 섹션 참고.
- `lev_note` — 레버리지 2x 이상이면 "Nx 레버리지 인지" 문구 추가(목표를 관대하게 줬음을 사용자에게 알림).

#### L-2) Generalization — `L322-L342`
```python
# L322-L342
    # 6) generalization — OOS sharpe / IS sharpe ratio
    if n_folds == 0:
        generalization = 0.5
        reasons["generalization"] = ( "WF 폴드 ... 유효 0개 — ... 기본 50점 ..." )
    elif is_sharpe > 0.1:
        gen_ratio = oos_sharpe_mean / is_sharpe
        generalization = _clip01((gen_ratio + 0.5) / 2.0)
        reasons["generalization"] = ( f"IS Sharpe=..., OOS 평균=..., 비율=..." )
    else:
        generalization = _clip01((oos_sharpe_mean + 1) / 3.0)
        reasons["generalization"] = ( "IS Sharpe 너무 낮아 OOS 절대값 기준 평가 ..." )
```
- **세 갈래**:
  - **폴드 0개**(OOS 검증 불가) → 중립 0.5. 신호 빈도 낮음 안내.
  - **IS Sharpe > 0.1**(정상 케이스) → `gen_ratio = OOS평균 / IS`. 점수 = `clip01((비율 + 0.5)/2)`.
    - 비율 1.0(OOS=IS, 미래도 과거만큼) → `(1+0.5)/2 = 0.75`. 비율 1.5(OOS>IS) → 1.0. 비율 0(OOS 망함) → 0.25.
    - **OOS 가 IS 만큼 따라오면 0.75 이상** → 일반화 잘 됨.
  - **IS Sharpe ≤ 0.1**(IS 자체가 부진) → 비율이 무의미하니 **OOS 절대값**으로: `clip01((OOS평균+1)/3)`. (regime 과 같은 -1~+2→0~1 매핑.)
- **왜 `is_sharpe > 0.1` 로 나누나**: IS Sharpe 가 0 에 가까우면 `OOS/IS` 가 폭발(0 나눗셈)하므로, 그 경우는 비율 대신 절대값으로 평가.

#### L-3) Statistical Confidence (PSR) — `L344-L370`
```python
# L344-L358
    # 7) statistical confidence — PSR
    try:
        eq_pts = is_bt.get("equity_curve", []) or []
        eq_series = pd.Series(
            {pd.to_datetime(p["date"]): float(p["value"]) for p in eq_pts}
        ).sort_index()
        daily_ret = eq_series.pct_change().dropna()
        psr_zero, psr_diag = probabilistic_sharpe_ratio(daily_ret, sr_threshold_annual=0.0)
    except Exception as e:
        psr_zero = 0.0
        psr_diag = {"T": 0, "sr_annual": 0.0, "skew": 0.0, "kurt": 0.0}

    statistical_confidence = _clip01(psr_zero)
    T = int(psr_diag.get("T", 0))
```
- IS 백테스트의 **자산곡선(equity_curve)** → 날짜순 Series → `pct_change()` 로 **일별 수익률** 복원 → `probabilistic_sharpe_ratio` 로 PSR 계산.
- ⚠️ 주의: 자산곡선은 `vbt_engine` 에서 **약 365점으로 다운샘플링**된 값입니다(원본 일봉 아님). 그래서 여기 `daily_ret` 는 엄밀한 일별이 아니라 **다운샘플 간격 수익률**입니다(함정 섹션).
- `sr_threshold_annual=0.0` — **"진짜 Sharpe > 0 일 확률"**(돈을 잃지 않을 확률)을 봄.
- `statistical_confidence = clip01(psr_zero)` — PSR(0~1) 이 곧 점수. 예외 시 0.
```python
# L360-L370
    if T < 252:
        reasons["statistical_confidence"] = ( f"PSR(SR>0)=..% · 데이터 {T}일 (1년 미만 — 신뢰도 제한 ...)" )
    else:
        reasons["statistical_confidence"] = ( f"PSR(SR>0)=..% · 연환산 Sharpe=.., skew=.., kurt=.. ({T}일 ...)" )
```
- `T < 252`(1년 미만)이면 신뢰도 제한 경고를 붙이고, 충분하면 상세(연환산 Sharpe·skew·kurt) 문장.

#### L-4) Overfitting Penalty — `L372-L377`
```python
# L372-L377
    # 8) overfitting penalty — IS sharpe much higher than OOS
    if is_sharpe > 0.1 and oos_sharpe_mean is not None:
        gap = max(0, is_sharpe - oos_sharpe_mean)
        overfit_penalty_pts = -min(overfit_penalty_max, int(gap * overfit_penalty_max))
    else:
        overfit_penalty_pts = 0
```
- **무엇을**: IS 가 OOS 보다 훨씬 좋으면(`gap` 큼) **음수 벌점**.
- `gap = max(0, IS − OOS)` — IS 가 OOS 보다 나은 만큼(OOS 가 더 좋으면 0, 벌점 없음).
- `-min(상한, int(gap × 상한))` — gap 1.0 이면 상한 전체(예: −15), gap 0.5 면 −7. **gap 이 1 을 넘어도 상한까지만** 깎음.
- IS Sharpe 가 0.1 이하면 벌점 없음(애초에 과적합을 논할 IS 성과가 없음).

> 💡 초보 포인트: 벌점은 **하위점수 가중합과 별개**로, 마지막에 최종점수에서 따로 뺍니다. 그래서 5개 하위점수가 다 좋아도 **IS↔OOS 격차가 크면 최종점수가 깎입니다** — "기출만 잘 풀고 새 문제 못 푸는" 전략에 대한 직접 페널티.

---

### M. 본체 ⑤: 가중합·등급·자연어 리포트 — `L379-L449`

```python
# L379-L389
    # 가중 합산 (각 0~100)
    sub = {
        "generalization": int(round(generalization * 100)),
        "regime_robustness": int(round(regime_robust * 100)),
        "parameter_stability": int(round(param_stability * 100)),
        "risk_control": int(round(risk_control * 100)),
        "statistical_confidence": int(round(statistical_confidence * 100)),
    }
    base_raw = sum(sub[k] * weights[k] for k in sub)
    base = int(round(base_raw))
    score = max(0, min(100, base + overfit_penalty_pts))
```
- 5개 비율(0~1)을 **×100 해서 0~100 정수 점수** `sub` 로. (프론트가 그대로 표시.)
- `base_raw = Σ(점수 × 가중치)` — **가중평균**. `base` 는 반올림 정수.
- `score = clip(base + 벌점, 0, 100)` — 벌점(음수)을 더한 뒤 0~100 으로 가둠. **이게 최종 Trust Score**.

```python
# L391-L422 (요약)
    weakest_metric = min(sub, key=sub.get)
    strongest_metric = max(sub, key=sub.get)
    metric_ko = { ... 5개 한글 이름 ... }
    metric_desc = { ... 5개 한글 설명 문단 ... }
```
- `min/max(sub, key=sub.get)` — 점수가 **가장 낮은/높은 하위점수의 키**를 찾음. → 리포트의 "보완 필요/강점".
- `metric_ko` / `metric_desc` — 각 지표의 한글 이름과 초보용 설명 문단. **응답의 `details`·`narrative` 둘 다에서 재사용**.

```python
# L424-L449 (요약)
    grade = "우수" if score >= 75 else "양호" if score >= 60 else "보통" if score >= 45 else "주의"
    narrative = ( f"이 전략의 Trust Score는 {score}점({grade})입니다.\n\n" ... 강점/보완/세부점수 ... )
    if overfit_penalty_pts < 0:
        narrative += ( "\n\n⚠️ 과적합 주의: ... 패널티 {overfit_penalty_pts}점 ..." )
```
- **등급 구간**: 75↑ 우수 · 60↑ 양호 · 45↑ 보통 · 그 미만 주의. (게이지 색/라벨에 사용.)
- `narrative` — 사람이 읽을 종합 리포트: 점수+등급 → Trust Score 설명 → **강점 지표**(점수·설명·근거) → **보완 지표** → 5개 세부점수 한 줄.
- 과적합 벌점이 있으면 경고 문단을 **이어붙임**(append). "백테스트보다 낮은 성과 가능성" 주의.

---

### N. 본체 ⑥: 최종 반환 dict — `L451-L544`

```python
# L451-L471 (요약)
    return {
        "trust_score": int(score),
        "sub_scores": sub,                       # 5개 0~100 점수
        "sub_reasons": {k: reasons.get(k, "") for k in sub},   # 5개 근거 문장
        "weights": {k: round(weights[k], 4) for k in sub},     # 적용된 가중치
        "base_score": base,                      # 벌점 전 가중합
        "overfitting_penalty": int(overfit_penalty_pts),
        "overfit_penalty_max": overfit_penalty_max,
        "narrative": narrative,                  # 자연어 리포트
        "config": { mdd_target_pct, wf_train, wf_test, n_folds, n_folds_total,
                    data_points, asset_class, leverage, underlying, ticker },
        "details": { ... 프론트 카드용 중첩 구조 ... },
    }
```
- 최상위 키: 최종점수·5개 하위점수·근거·가중치·벌점·리포트·설정·세부.
- `config` — **재현성**과 디버깅용: 어떤 윈도우·자산군·폴드수로 냈는지 기록.

```python
# L472-L543 (요약 — details 중첩)
        "details": {
            "in_sample_sharpe": ..., "oos_sharpe_mean": ..., "tstat": ..., "psr_zero": ...,
            "regime_worst_sharpe": ..., "regime_best_sharpe": ...,
            "walk_forward": { "label", "score", "description", "detail", "in_sample_sharpe",
                              "oos_sharpe", "gap", "n_folds", ... },
            "regime":   { "label", "score", "worst_sharpe", "best_sharpe",
                          "weakest_regime": regime.get("weak_regime"), "sharpe_std", ... },
            "parameter":{ "label", "score", "sensitivity": np.std(perturb_sharpes), "sharpe_range", ... },
            "risk":     { "label", "score", "actual_mdd", "target_mdd", "ratio", ... },
            "statistical":{ "label", "score", "psr_zero", "tstat", "data_points", ... },
        },
```
- `details` 는 **프론트엔드 `TrustDetailsCard` 전용 중첩 구조**. 5개 지표마다 `{label, score, description, detail, 지표별 수치}` 블록.
- **같은 값을 여러 키 이름으로 중복 제공**하는 게 보입니다(예: `worst_sharpe`·`weakest_sharpe`·`min_sharpe` 가 전부 동일, `tstat`·`t_stat`·`t_statistic`, `data_points`·`n_samples`·`n`). → 프론트 코드가 어떤 이름을 찾든 깨지지 않게 한 **호환성 방어**. (DRY 위반이지만 의도적.)
- `regime.get("weak_regime")` — regime.py 가 고른 **가장 취약한 국면 이름**을 그대로 전달.
- 삼항식 `... if valid_regimes else None` 들 — 국면 데이터 없을 때 None 으로 안전 처리.

---

## ⚠️ 함정·버그 주의 (코드에 박힌 교훈 + 설계상 주의점)

1. **regime 의 `method` 미지정 → 항상 rule** (L215). `compute_trust_score` 는 `per_regime_stats(close, params)` 를 **method 없이** 호출 → 무조건 빠른 **rule-based** 국면. HMM(`method="hmm"`)은 `/regime` 엔드포인트에서 명시 요청해야만 쓰이고, **Trust Score 에는 절대 반영되지 않습니다**. (CLAUDE.md "Trust Score 기본 method 는 rule" 과 정합.)

2. **risk_control 분모 고정 상수 `/ 50.0`** (L315). 레버리지는 **목표 MDD(mdd_target)** 에만 반영되고, "목표 초과분 → 점수" 변환 기울기 50 은 **모든 자산군 공통**입니다. 3배 ETF 가 목표(75%)를 30%p 초과(=105% MDD, 사실상 청산)해도 `30/50=0.6` 감점에 그쳐 0.4 점이 남습니다. 변환 기울기도 레버리지 인지로 바꾸면 더 정교해집니다.

3. **PSR 입력이 진짜 일별이 아님** (L348-L353). PSR 은 `is_bt["equity_curve"]` 로 계산하는데, 이 곡선은 vbt_engine 에서 **~365점으로 다운샘플링**된 값입니다(`eq.iloc[::step]`). 따라서 `T`(표본수)·`sr_annual`(×√252)·skew/kurt 가 **원본 일별과 다를 수 있습니다**. 표본수가 줄어 PSR 신뢰도가 과소평가될 여지가 있습니다. (정밀하려면 `_strategy_returns` 원본을 넘기는 게 맞음.)

4. **`underlying` 은 계산만 하고 안 씀** (L93·L179·L469). 레버리지 ETF 의 기초자산(TQQQ→QQQ)을 구해 응답 `config` 에 넣지만, **국면 분석은 여전히 레버리지 종목(`close`)으로** 돕니다. "기초자산으로 regime 보겠다"는 의도가 코드엔 미구현 — 표시용 메타데이터일 뿐.

5. **파라미터 섭동은 "그 전략이 읽는" 손잡이만** (L254-L257 주석). 전략이 무시하는 파라미터를 흔들면 결과 불변 → 표준편차 0 → **거짓 100점**. 그래서 전략별 분기(`if s == ...`)로 대표 파라미터를 골라 흔듭니다. **새 전략 추가 시 이 분기에도 추가**해야 함(안 하면 `else` 폴백 sma_slow 를 흔들어 무효한 점수가 됨).

6. **buy_and_hold·1국면·폴드0 등 "평가 불가"는 0점이 아니라 0.5(중립)**. 데이터 부족을 0 점으로 처리하면 부당하게 깎이고, 100 점이면 부당하게 부풀려짐 → **중립 50점** 원칙. 단, **statistical_confidence 만은 예외**로 데이터 부족 시 PSR 가드(L118)에 의해 0 으로 떨어질 수 있습니다(가중치 0.20 만큼 직접 하락).

7. **`... or 0` / `... or {}` 방어 관용구** (L190-L192 등). stats 값이 NaN→None 으로 직렬화될 수 있어 None 산술 폭발을 막습니다. 다만 **"진짜 0"과 "값 없음"을 같게** 취급하므로(예: Sharpe 정확히 0 vs 계산 실패), 미묘한 케이스에선 구분이 사라집니다.

8. **함수 기본 `wf_train=504` vs API 기본 252**. 직접 호출(504≈2년)과 `/trust` API(252≈1년)의 워크포워드 윈도우가 다릅니다. 폴드 수·OOS 평균이 달라져 점수가 바뀔 수 있으니, 재현 시 어느 경로로 불렀는지 확인.

9. **kurtosis +3 보정 필수** (L125). pandas `.kurtosis()`(Fisher, excess)를 Bailey 공식의 γ₄(정규 kurtosis)로 바꾸려 **+3**. 이걸 빠뜨리면 PSR 분모가 틀려 확률이 왜곡됩니다.

---

## 🚀 고도화 아이디어 (강의·개선 버전용)

- **HMM 국면을 Trust 에 연결**: `per_regime_stats(close, params, method="hmm")` 로 바꿔(또는 사용자 옵션화) 학술 표준 국면으로 견고성 평가. 현재는 rule 고정.
- **PSR 에 원본 일별수익률 사용**: 다운샘플 equity 대신 `is_bt["_strategy_returns"]`(원본)를 넘겨 T·skew·kurt 정확도 향상. PSR 의 통계적 의미가 살아납니다.
- **기초자산 regime 실제 적용**: `underlying`(TQQQ→QQQ) 종가를 따로 받아 국면을 기초자산으로 판정 → 레버리지 노이즈 제거.
- **risk_control 기울기 레버리지화**: `/ 50.0` 을 자산군별 상수(예: 3x 는 `/100`)로 바꿔 변환 기울기까지 leverage-aware.
- **PSR 임계값 옵션화**: 지금은 `SR>0` 고정. 사용자가 "연 Sharpe 1.0 초과 확률" 같은 목표를 주게(`sr_threshold_annual`) 노출.
- **DSR(Deflated Sharpe)로 다중검정 보정**: 여러 전략·파라미터를 시도했다면 "운으로 좋은 게 하나쯤 나올" 확률을 보정(Bailey & López de Prado 2014). 과적합 벌점을 통계적으로 대체 가능.
- **정통 워크포워드**: walkforward.py 의 한계(재최적화 없음)를 풀어 train 구간 파라미터 재최적화 → 진짜 generalization 검증.
- **details 키 중복 제거**: 프론트가 단일 키만 읽도록 정리하면 응답 크기·유지보수성 개선(현재는 호환용 다중 별칭).

---

## 📚 용어 사전 (이 파일 한정)

| 용어 | 뜻 |
|---|---|
| **Trust Score** | 5개 하위점수 가중합 − 과적합벌점, 0~100 종합 신뢰점수 |
| **IS / OOS** | In-Sample(학습한 과거 전체) / Out-of-Sample(처음 보는 미래 구간) |
| **generalization** | OOS Sharpe ÷ IS Sharpe — 미래에도 통하나 (가중 0.25) |
| **regime_robustness** | 최악 국면의 보정 Sharpe 기반 — 나쁜 시장에서도 버티나 (0.20) |
| **parameter_stability** | 파라미터 ±5/10% 섭동 시 Sharpe 표준편차 — 과최적화 아닌가 (0.15) |
| **risk_control** | 실제 MDD vs 목표 MDD — 손실 통제하나 (0.20) |
| **statistical_confidence** | PSR(SR>0) — 수익이 우연 아닌가 (0.20) |
| **PSR (Probabilistic Sharpe Ratio)** | "진짜 Sharpe > 기준" 확률. T·skew·kurt 보정 (Bailey & López de Prado 2012) |
| **Φ / `_norm_cdf`** | 표준정규 CDF. z-점수 → 확률. `0.5(1+erf(z/√2))` 로 scipy 없이 계산 |
| **erf** | 오차함수. `math.erf`. 정규 CDF 의 부품 |
| **skew(γ₃) / kurt(γ₄)** | 왜도(좌우 쏠림) / 첨도(꼬리 두께). pandas Fisher kurt 는 +3 보정 |
| **effective_sharpe (보정 Sharpe)** | `SR × T/(T+60)` — 짧은 표본의 극단 Sharpe 를 0 쪽으로 수축(Bayesian shrinkage) |
| **leverage-aware MDD** | 자산군별 다른 MDD 목표(지수25/2x50/3x75/주식35/기타30) |
| **t-통계량(tstat)** | OOS 수익률 평균 ÷ 표준오차. 0 과 다른지 검정 |
| **overfitting penalty** | IS−OOS Sharpe 격차에 비례한 음수 벌점(상한 기본 15) |
| **`_clip01`** | 0~1 로 가두기 |
| **`_normalize_weights`** | 가중치 누락 채우고 합 1.0 정규화 |
| **shrinkage(수축)** | 추정값을 신뢰도 낮을 때 안전한 기준(0)으로 끌어당기기 |
| **다운샘플 equity** | vbt_engine 이 ~365점으로 솎은 자산곡선(PSR 입력이 됨) |
