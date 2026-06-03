# `robust/regime.py` — 시장 국면(Regime) 분석 엔진 (완전 라인별 해설)

> 원본: `analytics/app/robust/regime.py` (462줄)
> 이 문서는 교재 표준 형식(`01_backtest/vbt_engine.md`)을 따릅니다.
> 같은 폴더 친구들: `walkforward.py`(과거→미래 검증), `trust_score.py`(종합 신뢰점수). 셋이 `robust/`(신뢰성 검증) 삼총사입니다.

---

## 📌 이 파일 한눈에

이 파일은 **"오늘 시장이 어떤 날씨인지 판별하는 기상청"** 입니다. 주가 한 줄(`close`)을 받아서, **각 날짜가 5가지 시장 국면(강세·약세·횡보·고변동…) 중 무엇이었는지** 라벨을 붙이고, 그 다음 **국면별로 전략 성과가 어땠는지**(맑은 날엔 잘 벌고 폭풍우엔 깨졌나?)를 통계로 쪼개 줍니다.

> 비유: 같은 우산(전략)도 **맑은 날엔 거추장스럽고 비 오는 날엔 생명줄**입니다. 이 파일은 먼저 "지난 5년 중 어떤 날이 맑았고 어떤 날이 폭풍이었는지" 날씨 일지를 만들고(국면 분류), 그 다음 "이 우산을 들고 다녔을 때 맑은 날 vs 폭풍 날 각각 결과가 어땠는지"를 채점합니다(국면별 성과).

핵심 함수는 6개입니다.

| 함수 | 한 줄 역할 | 비유 |
|---|---|---|
| `shrink_sharpe(...)` | 짧은 표본의 과장된 Sharpe를 0 쪽으로 끌어내림(신뢰도 보정) | "10일 치 성적만 보고 우등생 단정 금지" — 표본 적으면 점수를 깎음 |
| `classify_regimes(...)` | 날짜별 국면 라벨 시리즈 생성(rule 또는 hmm) + 스무딩 | 날씨 일지 작성(+하루짜리 깜빡임 정리) |
| `_rule_regimes(...)` | **규칙 기반** 분류: MA200 추세 + 변동성 분위수 컷 | 온도계·풍속계 눈금으로 직접 날씨 판정 |
| `_smooth_states(...)` | 너무 짧게 깜빡이는 라벨을 직전 라벨로 흡수 | "1시간 소나기"를 "맑음"으로 합쳐 버림 |
| `_hmm_regimes(...)` | **HMM 기반** 분류: Gaussian HMM이 숨은 상태를 학습 | AI가 패턴 보고 "숨은 계절"을 추론 |
| `per_regime_stats(...)` | 분류 + 백테스트 + 국면별 성과/내러티브/타임라인 묶음 | 날씨별 성적표 + 사람이 읽을 설명문 작성 |

**누가 호출하나?**
- `app/main.py` 의 `POST /regime` 엔드포인트 → `per_regime_stats(...)` 호출 (프론트 Regime 탭이 받는 데이터).
- `app/robust/trust_score.py` 의 Trust Score 계산 → `per_regime_stats(close, params)` 를 불러 "최악 국면 Sharpe"를 신뢰점수의 한 축으로 사용.

**왜 국면 분석이 필요한가?** → 백테스트 전체 평균 성적(`vbt_engine.md`의 Sharpe 하나)은 "지난 5년 평균"입니다. 그런데 **그 5년이 대부분 상승장이었다면** 그 좋은 성적은 "운(국면)" 덕일 수 있습니다. 국면별로 쪼개 보면 "이 전략은 폭풍우(고변동)에서 박살난다" 같은 **숨은 약점**이 드러납니다. 그래서 `trust_score`가 "최악 국면 성과"를 신뢰점수에 반영합니다.

---

## 🧠 사전 지식 (이거 모르면 막힘)

#### 1) "국면(Regime)"이란?
시장은 늘 같은 상태가 아닙니다. 크게 나누면:
- **강세장(bull)** — 장기적으로 우상향. (안정적/불안정으로 또 나뉨)
- **약세장(bear)** — 장기적으로 우하향.
- **횡보장(sideways)** — 위아래 왔다 갔다, 방향성 없음.
- **고변동 불안정장(high_vol_unstable)** — 하루에도 몇 %씩 출렁, 위험 극대.

같은 전략도 국면마다 성적이 천차만별이라, "이 전략은 어떤 날씨에 강하고 어떤 날씨에 약한가"를 아는 게 리스크 관리의 핵심입니다.

이 파일의 **5분류 라벨**(코드 `REGIME_LABELS`):

| 영문 라벨 | 한글 | 뜻 |
|---|---|---|
| `bull_quiet` | 상승장(안정) | 추세 위 + 변동성 정상 = 가장 이상적 |
| `bull_volatile` | 상승장(불안정) | 추세 위 + 변동성 높음 = 반등 구간/급락 직전 경고 |
| `bear` | 하락장 | 추세 아래 + 변동성 정상 |
| `sideways` | 횡보장 | 방향성 없음 |
| `high_vol_unstable` | 고변동성 불안정장 | 변동성 극단 + 하락/횡보 |

#### 2) MA200(200일 이동평균) = "장기 추세선"
지난 200거래일(약 10개월) 종가의 평균. 천천히 움직이는 굵은 선입니다.
- **주가가 MA200 위** → 장기 상승 추세.
- **주가가 MA200 아래** → 장기 하락 추세.
- 추가로 이 선의 **기울기(slope)** 가 위/아래인지도 봅니다(추세가 살아있는지 죽었는지).

#### 3) "변동성 분위수 컷" = "흔들림이 상위 몇 %인가"
- **변동성(volatility)** = 주가가 하루하루 얼마나 출렁이는가(일일 수익률의 표준편차). 클수록 불안정.
- **분위수(quantile)** = "전체를 줄 세웠을 때 몇 번째냐". `quantile(0.75)` = 상위 25% 경계선(75번째 백분위).
- 그래서 "오늘 변동성이 **75분위(상위 25%) 이상**이면 '변동성 높음'으로 본다"가 이 파일의 기준입니다. **절대 숫자(예: 변동성 20%)가 아니라 그 종목의 역사 대비 상대값**으로 판단 — 종목마다 평소 변동성이 다르니까.

#### 4) HMM(Hidden Markov Model, 은닉 마르코프 모델) — 핵심 개념
초보 눈높이 비유: **창문 없는 방에서 사람들이 입고 들어오는 옷만 보고 바깥 날씨를 맞히는 것**.
- **숨은 상태(hidden state)**: 바깥 날씨(맑음/비/눈) — 직접 못 봄.
- **관측값(observation)**: 사람들 옷차림(우산·반팔·패딩) — 이건 보임.
- HMM은 "관측값(옷차림)의 패턴"만 보고 **숨은 상태(날씨)가 몇 개 있고, 각각 어떤 옷차림을 유발하며, 날씨끼리 어떻게 전이(맑음→비)되는지**를 통계로 역추론합니다.
- **마르코프(Markov)** = "내일 날씨는 오늘 날씨에만 달려 있다"(그제·그끄제는 직접 영향 없음)는 단순화 가정.
- 이 파일에선: **숨은 상태 = 시장 국면**, **관측값 = 가격에서 뽑은 3개 피처**(아래 5번). HMM이 "데이터에 N개의 숨은 국면이 있다"고 학습하면, 우리가 그 국면들에 사후적으로 bull/bear 라벨을 붙입니다.
- **Gaussian HMM** = 각 숨은 상태에서 관측값이 정규분포(가우시안)를 따른다고 가정하는 가장 표준적인 HMM. `hmmlearn` 라이브러리가 sklearn 스타일(`.fit()` / `.predict()`)로 제공.

#### 5) HMM이 보는 3개 피처 — `ret`, `vol20`, `mom60`
HMM의 "옷차림"에 해당하는 3개 관측값(가격에서 계산):
- **`ret`** = 로그 수익률(하루 변화) → "오늘 올랐나 내렸나".
- **`vol20`** = 최근 20일 수익률 표준편차 → "요즘 얼마나 출렁이나"(단기 변동성).
- **`mom60`** = 60일 로그 모멘텀 → "두 달간 추세가 위인가 아래인가"(중기 방향).
세 숫자를 묶으면 HMM이 "조용한 상승 / 출렁이는 상승 / 하락 / 패닉" 같은 군집을 스스로 찾아냅니다.

#### 6) "룰베이스 폴백(fallback)"이란?
HMM은 데이터가 충분하고 학습이 잘 돼야 믿을 수 있습니다. 표본이 적거나(`< n_states*30`) 학습(`fit`)이 실패하면, **조용히 규칙 기반(`_rule_regimes`)으로 갈아탑니다**. 이게 폴백. 중요한 건 이 파일이 **"실제로 뭘 썼는지를 정직하게 기록"** 한다는 점(`method=hmm` 요청했어도 폴백되면 응답엔 `method="rule"`, `hmm_fallback=true`).

#### 7) Sharpe 수축(shrinkage) = "표본 적으면 점수 깎기"
- **Sharpe ratio** = 위험 대비 수익(클수록 좋음). 그런데 **데이터가 10일밖에 없으면** Sharpe가 -6.25 같은 극단값이 쉽게 나옵니다(우연). 이걸 곧이곧대로 믿으면 위험.
- **수축(shrinkage)**: 관측 Sharpe에 `T/(T+T0)` 가중치를 곱해 **0 쪽으로 끌어당김**(`T`=표본일수, `T0`=60). 표본이 많을수록 가중치가 1에 가까워져 원본을 신뢰, 적을수록 0에 가까워져 "잘 모르겠다(=0)"로 후퇴.
- 학술 근거: Lo (2002) Sharpe 표준오차 + James–Stein 수축. **베이지안적으로 "사전엔 Sharpe=0이라 보고, 데이터가 쌓일수록 관측값을 믿는다"** 는 발상.

#### 8) "Look-ahead bias(미래 참조)" — 이 파일에도 숨어 있음
`vbt_engine.md`에서 배운 그 반칙입니다. **오늘 라벨을 만들 때 미래 데이터를 쓰면** 반칙. 이 파일의 분위수 컷(`vol60.quantile(0.75)`)은 **전체 기간 데이터로 한 번에 계산**하므로 엄밀히는 미래를 살짝 봅니다 → ⚠️함정 섹션에서 자세히.

---

## 🗺 전체 흐름도

```
                       close (날짜별 종가 Series)
                              │
        ┌─────────────────────┴──────────────────────┐
        │   per_regime_stats()  ← 외부에서 부르는 입구  │
        └─────────────────────┬──────────────────────┘
                              │
            ┌─────────────────▼─────────────────┐
            │       classify_regimes()          │  국면 라벨 생성
            │   method=="hmm" ? ─┐              │
            └────────┬───────────┼──────────────┘
                     │           │
              method=="rule"   method=="hmm"
                     │           │
                     ▼           ▼
            _rule_regimes()   _hmm_regimes()
            MA200추세         GaussianHMM.fit/predict
            +vol분위수컷       (ret·vol20·mom60 피처)
                     │           │ 표본부족/fit실패
                     │           └──폴백──► _rule_regimes() (+"rule")
                     │           │
                     └─────┬─────┘
                           ▼
                   _smooth_states()  깜빡임 제거(min_run)
                           │
                  attrs["effective_method"] 기록 ⚠️정직보고
                           │
        ┌──────────────────▼───────────────────────┐
        │  per_regime_stats() 뒷부분:               │
        │  ① run_backtest(close, params)  성적 산출 │
        │  ② 자산수익률을 국면별로 분리              │
        │  ③ 국면별 cum/ann/sharpe/MDD/winrate 계산 │
        │     └ shrink_sharpe() 로 effective_sharpe │
        │  ④ bull_quiet+bull_volatile → "bull" 합산 │
        │  ⑤ 최약 국면(weak) 선정                    │
        │  ⑥ 자연어 내러티브 + 조언 생성             │
        │  ⑦ 주간 샘플 타임라인                      │
        └──────────────────┬───────────────────────┘
                           ▼
                  거대한 dict 반환 → main.py → 백엔드 → 프론트 Regime 탭
```

---

## 📖 라인별 해설

### A. 파일 설명서(docstring) — `L1-L25`

```python
# L1-L25
"""
Market Regime detection.

지원 알고리즘 (method 파라미터):
  - "rule" (default, Free)  : MA200 추세 + 60일 변동성 분위수 컷 → 5분류
  - "hmm"  (Pro)            : Gaussian HMM (hmmlearn) — 학술 표준, sklearn API
                              상태 수 n_states 가변 (3~5), 상태별 평균수익·변동성으로 자동 라벨링
...
참고 학술 / 오픈 레포:
  - Hamilton (1989) Markov Switching
  - Adams & MacKay (2007) BOCPD
  - hmmlearn (BSD-3, ...)
  - statsmodels.tsa.regime_switching.MarkovRegression
"""
```
- **무엇을**: 파일 맨 위 설명서. 실행되지 않고 사람이 읽는 용도. 두 알고리즘(`rule`/`hmm`), 공통 후처리(smoothing), 5분류 라벨, 학술 출처를 요약.
- **왜**: `rule`은 무료·빠름·해석 가능, `hmm`은 Pro·학술 표준. 메모리 노트와 CLAUDE.md에 적힌 대로 **`/regime`·Trust Score의 기본 method는 `rule`(빠름)**, HMM은 명시 요청 시에만.
- **헷갈리는 포인트**: docstring은 "상태 수 3~5"라 적었지만, 실제 코드(`_hmm_regimes` L187)는 **2~6으로 클램프**합니다. 문서와 코드가 약간 어긋나는 흔한 사례 — 항상 코드가 진실.

---

### B. import + 라벨 상수 — `L26-L41`

```python
# L26-L41
from __future__ import annotations
from typing import Dict, Any, Optional
import numpy as np
import pandas as pd

from app.backtest.vbt_engine import BacktestParams, run_backtest

REGIME_LABELS = ["bull_quiet", "bull_volatile", "bear", "sideways", "high_vol_unstable"]

REGIME_LABELS_KO = {
    "bull_quiet": "상승장(안정)",
    "bull_volatile": "상승장(불안정)",
    "bear": "하락장",
    "sideways": "횡보장",
    "high_vol_unstable": "고변동성 불안정장",
}
```
- **무엇을**: 숫자계산(`numpy`)·표(`pandas`)·백테스트 도구(`BacktestParams`, `run_backtest`)를 가져오고, 5개 라벨 리스트와 한글 사전을 정의.
- **왜**: `run_backtest`를 import한다는 건 이 파일이 **`vbt_engine.md`에서 배운 그 백테스트를 그대로 재사용**한다는 뜻 — 국면 분류 후 그 위에 성과를 얹습니다.
- **헷갈리는 포인트**: `REGIME_LABELS`의 순서(`bear`가 3번째, `sideways`가 4번째)는 한글 사전 순서와 다릅니다. 순서 자체는 의미 없지만, 뒤에서 `for label in REGIME_LABELS` 루프 순서를 결정하므로 출력 dict의 키 순서에 영향.

---

### C. Sharpe 수축 상수 + 함수 `shrink_sharpe()` — `L43-L56`

```python
# L43-L48
# Bayesian shrinkage prior for Sharpe credibility weighting.
# 짧은 표본의 극단 Sharpe(예: 10일 하락장에서 -6.25)를 0 쪽으로 끌어당겨
# 표본 크기에 비례하는 통계적 신뢰도를 반영한다.
# SR_eff = SR_obs × T / (T + T0)   (Lo 2002 + James-Stein shrinkage 변형)
# T0=60(약 3개월)이면: 30일 표본 → 가중치 0.33, 252일 → 0.81, 1000일 → 0.94
SHARPE_SHRINKAGE_PRIOR = 60
```
- **무엇을**: 수축 강도를 정하는 상수 `T0=60`(약 3개월 거래일).
- **왜 60인가**: 주석의 예시 수치가 직관을 줍니다 — 30일이면 가중치 0.33(원본의 1/3만 믿음), 1년(252일)이면 0.81, 4년(1000일)이면 0.94(거의 그대로 믿음). **"3개월 어치 데이터가 쌓이면 절반쯤 믿는다"** 가 설계 의도(60일 표본 → 60/(60+60)=0.5).

```python
# L51-L56
def shrink_sharpe(sharpe_obs: float, days: int, prior: int = SHARPE_SHRINKAGE_PRIOR) -> tuple[float, float]:
    """Return (effective_sharpe, sample_weight) — weight ∈ (0, 1]."""
    if days <= 0:
        return 0.0, 0.0
    w = days / (days + prior)
    return float(sharpe_obs) * w, w
```
- **무엇을**: 관측 Sharpe(`sharpe_obs`)와 표본일수(`days`)를 받아, `(보정된 Sharpe, 가중치)` 튜플을 반환.
- **한 줄씩**:
  - `if days <= 0: return 0.0, 0.0` — 데이터가 없으면 "모름"=0으로. 0 나누기도 방지.
  - `w = days / (days + prior)` — 가중치 공식. days가 크면 1에 수렴, 작으면 0에 수렴. 항상 `(0, 1)` 범위(days>0일 때).
  - `return sharpe_obs * w, w` — 원본 Sharpe에 가중치를 곱한 값과 가중치 자체를 함께 반환.
- **왜 가중치도 같이 반환**: 호출부에서 "이 점수를 얼마나 믿는지"(`sample_weight`)를 프론트에 표시하고, 내러티브에 "표본가중치 0.33"처럼 적기 위해.
- **예시 수치**: 10일짜리 하락장에서 관측 Sharpe=-6.25라면 → w=10/70≈0.143 → 보정 Sharpe≈-0.89. **극단값이 현실적인 값으로 완화**됨.
- **헷갈리는 포인트**: 이건 **점수를 "좋게" 만드는 게 아니라 "0에 가깝게(중립적으로)"** 만드는 것. 음수든 양수든 0 쪽으로 끌어당깁니다.

---

### D. 분류 진입점 `classify_regimes()` — `L59-L88`

```python
# L59-L78 (머리 + docstring)
def classify_regimes(
    close: pd.Series,
    method: str = "rule",
    smoothing: int = 0,
    n_states: int = 4,
) -> pd.Series:
    """
    국면 라벨 시리즈 반환 (close index와 정렬).
    ...
    smoothing : int
        Viterbi-style minimum-run filter. N일 미만 지속 라벨은 직전 라벨로 흡수.
        0/1이면 비활성. 권장: 5
    n_states : int
        HMM 상태 수 (3~5). rule-based에서는 무시.
    """
```
- **무엇을**: 외부에서 "이 종가를 국면 라벨로 바꿔줘"라고 부르는 입구. `method`(rule/hmm), `smoothing`(깜빡임 제거 강도), `n_states`(HMM 상태 수)를 받음.
- **출력**: `close`와 같은 날짜축의 **라벨 Series**(각 날짜 → "bull_quiet" 등 문자열, 또는 NaN).

```python
# L79-L88 (몸통)
    if method == "hmm":
        raw, effective_method = _hmm_regimes(close, n_states=n_states)
    else:
        raw, effective_method = _rule_regimes(close), "rule"

    if smoothing and smoothing > 1:
        raw = _smooth_states(raw, min_run=int(smoothing))
    # 실제로 사용된 방법을 기록한다(HMM 요청이 표본부족/fit실패로 rule 로 폴백되면 "rule").
    raw.attrs["effective_method"] = effective_method
    return raw
```
- **한 줄씩**:
  - `if method == "hmm": raw, effective_method = _hmm_regimes(...)` — HMM 요청이면 HMM 함수 호출. **이 함수는 `(시리즈, 실제방법문자열)` 튜플을 반환**하므로 두 변수로 풀어 받음. 폴백되면 두 번째가 `"rule"`.
  - `else: raw, effective_method = _rule_regimes(close), "rule"` — 규칙 기반. 여기서 `_rule_regimes(close)`는 **시리즈만** 반환하고, `, "rule"`은 **이 줄에서 직접** 튜플로 묶음. (⚠️함정 섹션의 타입 불일치 참고.)
  - `if smoothing and smoothing > 1: raw = _smooth_states(...)` — 스무딩이 2 이상일 때만 깜빡임 제거 적용. 0이나 1이면 건너뜀(=원본 유지).
  - `raw.attrs["effective_method"] = effective_method` — **핵심 정직장치**. pandas Series의 `.attrs`(메타데이터 사전)에 "실제로 어떤 방법을 썼는지"를 부착. HMM 요청이 폴백됐으면 여기에 `"rule"`이 박힘.
- **왜 `.attrs`에 숨기나**: 함수 반환 타입을 `pd.Series` 하나로 유지하면서도 "실제 방법"이라는 부가정보를 같이 실어 나르기 위한 트릭. 호출부(`per_regime_stats`)가 나중에 `.attrs.get("effective_method")`로 꺼냅니다.
- **헷갈리는 포인트**: `.attrs`는 pandas 연산(`dropna()`, `reindex()` 등)을 거치면 **사라질 수 있습니다**. 그래서 `per_regime_stats`는 `dropna()` **전에** 이 값을 읽어 둡니다(L263-L264 참고). 매우 의도적인 순서.

---

### E. 규칙 기반 분류 `_rule_regimes()` — `L91-L124` (무료 기본 엔진)

```python
# L91-L100 (docstring: 분류 규칙 우선순위)
def _rule_regimes(close: pd.Series) -> pd.Series:
    """
    분류 규칙 (우선순위 순):
    1. MA200 위 + slope 양 + vol < 75th → bull_quiet
    2. MA200 위 + slope 양 + vol >= 75th → bull_volatile
    3. MA200 아래 + slope 음 + vol < 75th → bear
    4. MA200 아래 + slope 음 + vol >= 75th → high_vol_unstable
    5. 횡보 + vol >= 80th → high_vol_unstable
    6. 나머지 → sideways
    """
```
- **무엇을**: 머신러닝 없이 **명시적 규칙(if문 같은 boolean 마스크)** 으로 국면을 판정. 빠르고 결정론적이고 해석 가능.

```python
# L101-L106 (지표 계산)
    ma200 = close.rolling(200, min_periods=100).mean()
    ma200_smooth = ma200.ewm(span=10, adjust=False).mean()
    slope = ma200_smooth.diff(10)

    ret = close.pct_change()
    vol60 = ret.rolling(60, min_periods=20).std() * np.sqrt(252)
```
- **한 줄씩**:
  - `ma200 = close.rolling(200, min_periods=100).mean()` — 200일 이동평균. `min_periods=100`은 "데이터가 100일만 있어도 계산 시작"(앞부분 100~200일 구간도 일찍 값을 줌). 100일 미만이면 NaN.
  - `ma200_smooth = ma200.ewm(span=10, adjust=False).mean()` — MA200을 **지수가중평균으로 한 번 더 부드럽게**. 들쭉날쭉한 추세선의 잔떨림을 줄여 slope 판정을 안정화.
  - `slope = ma200_smooth.diff(10)` — 10일 전 대비 추세선의 **기울기**. 양수면 추세선이 우상향(상승 추세 살아있음), 음수면 우하향.
  - `ret = close.pct_change()` — 일일 수익률(어제 대비 % 변화).
  - `vol60 = ret.rolling(60, min_periods=20).std() * np.sqrt(252)` — 60일 변동성을 **연율화**. `*sqrt(252)`는 일일 표준편차를 "1년 단위"로 환산하는 관습(1년 ≈ 252거래일). 예: 일일 std 1% → 연율화 약 15.9%.
- **왜 연율화**: 분위수 컷 자체는 연율화해도 안 해도 순위가 같아 결과 라벨엔 영향 없지만, 사람이 읽을 때(약 15%/30% 등) 직관적이고 다른 모듈과 단위 통일.

```python
# L108-L115 (분위수 컷 + 추세 마스크)
    vol_q75 = vol60.quantile(0.75)
    vol_q80 = vol60.quantile(0.80)
    vol_high_75 = vol60 >= vol_q75
    vol_high_80 = vol60 >= vol_q80

    is_above_ma = close > ma200
    is_bull_trend = is_above_ma & (slope > 0)
    is_bear_trend = ~is_above_ma & (slope < 0)
```
- **한 줄씩**:
  - `vol_q75 = vol60.quantile(0.75)` / `vol_q80 = ...quantile(0.80)` — 전체 기간 변동성의 75/80 백분위 **경계선 숫자**. ⚠️ 이 한 줄이 look-ahead의 원천(전체 기간을 보고 계산).
  - `vol_high_75 = vol60 >= vol_q75` — 각 날짜가 "상위 25% 변동성인가"의 boolean Series.
  - `is_above_ma = close > ma200` — 종가가 추세선 위인가(상승 추세의 1차 조건).
  - `is_bull_trend = is_above_ma & (slope > 0)` — **추세선 위 + 추세선 우상향** 둘 다여야 진짜 강세 추세. (단지 위에 있는 것만으론 부족 — 막 꺾여 내려오는 중일 수 있으니 기울기도 확인.)
  - `is_bear_trend = ~is_above_ma & (slope < 0)` — 추세선 아래 + 우하향 = 약세 추세. `~`는 not.
- **헷갈리는 포인트**: 강세도 약세도 아닌 어중간한 날(위인데 기울기 음수 등)은 둘 다 False → 기본값 `sideways`로 남습니다.

```python
# L117-L124 (라벨 배정 — 덮어쓰기 우선순위)
    regime = pd.Series("sideways", index=close.index, dtype="object")
    regime[is_bull_trend & ~vol_high_75] = "bull_quiet"
    regime[is_bull_trend & vol_high_75] = "bull_volatile"
    regime[is_bear_trend & ~vol_high_75] = "bear"
    regime[is_bear_trend & vol_high_75] = "high_vol_unstable"
    regime[~is_bull_trend & ~is_bear_trend & vol_high_80] = "high_vol_unstable"
    regime[ma200.isna()] = np.nan
    return regime
```
- **무엇을**: 모든 날을 일단 `"sideways"`로 깔고, 조건에 맞는 날을 **순차적으로 덮어씀**. 이게 docstring의 "우선순위"가 구현되는 방식.
- **한 줄씩**:
  - `regime = pd.Series("sideways", ...)` — 전부 횡보로 초기화(기본값). `dtype="object"`는 문자열을 담기 위함.
  - 강세 추세 + 변동성 정상 → `bull_quiet`, 강세 추세 + 변동성 높음 → `bull_volatile`로 덮음.
  - 약세 추세 + 변동성 정상 → `bear`, 약세 추세 + 변동성 높음 → `high_vol_unstable`.
  - `regime[~is_bull_trend & ~is_bear_trend & vol_high_80] = "high_vol_unstable"` — **추세는 없는데(횡보) 변동성이 극단(80분위↑)** 인 날은 횡보가 아니라 "불안정장"으로 격상. (조용한 횡보 vs 패닉 횡보 구분.)
  - `regime[ma200.isna()] = np.nan` — MA200이 아직 안 만들어진 앞 구간(데이터 부족)은 **판정 불가 → NaN**. 정직하게 "모름" 표시.
- **왜 덮어쓰기 방식**: if-elif 체인을 boolean 마스크로 바꾼 것. 같은 날이 여러 조건에 걸리면 **나중 줄이 이김**(예: bull_volatile은 bull_quiet을 덮어씀 — 변동성 조건이 상호배타라 실제 충돌은 없음).
- **헷갈리는 포인트**: `vol_high_80`(80분위)과 `vol_high_75`(75분위)를 섞어 쓰는 이유 — 추세장에선 75분위로 "불안정"을 잡고, 무추세장(횡보)에선 더 엄격한 80분위를 넘어야 "불안정"으로 봅니다. 횡보는 원래 변동성이 낮으니 더 높은 문턱을 요구.

---

### F. 깜빡임 제거 `_smooth_states()` — `L127-L158`

```python
# L127-L134
def _smooth_states(s: pd.Series, min_run: int) -> pd.Series:
    """
    Viterbi-style minimum-run smoothing.
    연속 run length < min_run인 segment를 직전 segment 라벨로 흡수.
    rule-based의 깜빡임 (1~2일 깜빡이는 high_vol → bull) 제거.
    """
    if min_run <= 1:
        return s
```
- **무엇을**: 너무 짧게 지속되는 라벨(예: 하루만 `high_vol`였다가 다시 `bull`)을 **직전 라벨로 흡수**해 매끄럽게.
- **왜**: 실제 국면은 어느 정도 지속됩니다. "어제 강세→오늘 하루 불안정→내일 다시 강세"는 진짜 국면 전환이라기보다 노이즈일 가능성이 큼. 이걸 정리하면 타임라인이 읽기 쉬워지고 국면별 통계가 안정됨.
- `if min_run <= 1: return s` — 1 이하면 의미 없으니(모든 run이 1 이상) 그대로 반환.

```python
# L135-L144 (배열 준비 + 첫 valid 라벨 찾기)
    arr = s.values.copy()
    n = len(arr)
    i = 0
    last_valid: Optional[Any] = None
    # 먼저 첫 valid 라벨 찾기
    while i < n and (arr[i] is None or (isinstance(arr[i], float) and np.isnan(arr[i]))):
        i += 1
    if i >= n:
        return s
    last_valid = arr[i]
```
- **한 줄씩**:
  - `arr = s.values.copy()` — Series를 numpy 배열로 복사(원본 안 건드리고 작업).
  - `while ... arr[i] is None or np.isnan(arr[i]): i += 1` — 맨 앞의 NaN(MA200 미형성 구간)들을 건너뛰어 **첫 유효 라벨 위치**를 찾음.
  - `if i >= n: return s` — 전부 NaN이면(유효 라벨 0개) 손댈 게 없으니 그대로 반환.
  - `last_valid = arr[i]` — 첫 유효 라벨을 "직전 유효 라벨" 기억 변수에 저장.
- **헷갈리는 포인트**: NaN 판정을 `arr[i] is None or (isinstance(arr[i], float) and np.isnan(arr[i]))` 로 두 갈래로 함 — 라벨이 문자열이면 `is None`만, NaN(float)이면 `np.isnan`만 걸리게. 문자열에 `np.isnan`을 쓰면 에러나므로 `isinstance(float)` 가드가 필수.

```python
# L145-L158 (segment 단위 순회 + 흡수)
    while i < n:
        if arr[i] is None or (isinstance(arr[i], float) and np.isnan(arr[i])):
            i += 1
            continue
        j = i
        while j < n and arr[j] == arr[i]:
            j += 1
        run_len = j - i
        if run_len < min_run and last_valid is not None and last_valid != arr[i]:
            arr[i:j] = last_valid
        else:
            last_valid = arr[i]
        i = j
    return pd.Series(arr, index=s.index, dtype="object")
```
- **한 줄씩**:
  - 중간에 NaN을 만나면 건너뜀(`continue`).
  - `j = i; while arr[j] == arr[i]: j += 1` — `i`부터 **같은 라벨이 연속되는 구간(segment)의 끝**을 찾음. `[i, j)`가 한 segment.
  - `run_len = j - i` — 그 segment 길이(며칠 지속됐나).
  - `if run_len < min_run and ... last_valid != arr[i]: arr[i:j] = last_valid` — segment가 **너무 짧고**(min_run 미만) 직전 라벨과 **다르면**, 그 구간 전체를 직전 라벨로 덮어 흡수.
  - `else: last_valid = arr[i]` — 충분히 길면(진짜 국면) 이 라벨을 새 "직전 라벨"로 갱신.
  - `i = j` — 다음 segment로 점프.
- **왜 "Viterbi-style"**: 진짜 비터비 알고리즘(HMM 최적 경로 디코딩)은 아니지만, "짧은 이상치를 주변 다수에 흡수"한다는 정신이 비슷해 붙인 별명. 실제론 단순한 run-length 필터.
- **헷갈리는 포인트**: 흡수는 **항상 "직전(왼쪽) 라벨"** 로만 일어납니다. 다음(오른쪽)이 더 길어도 무시. 그래서 결과가 약간 "왼쪽 편향"적 — 첫 등장 라벨 쪽으로 끌림. 또, **짧은 segment를 흡수해도 `last_valid`는 갱신 안 하므로** 연속된 여러 짧은 segment가 모두 같은 직전 라벨로 흡수됩니다.

---

### G. HMM 기반 분류 `_hmm_regimes()` — `L161-L249` (Pro 엔진)

```python
# L161-L185 (docstring + import 가드)
def _hmm_regimes(close: pd.Series, n_states: int = 4) -> pd.Series:
    """
    Gaussian HMM 기반 국면 분류 (Pro 기능).
    Feature engineering:
      - log return
      - rolling vol (20d)
      - rolling momentum (60d)
    ...
    """
    try:
        from hmmlearn.hmm import GaussianHMM
    except ImportError as e:
        raise ImportError(
            "HMM 모드는 hmmlearn 패키지가 필요합니다. EC2에서 "
            "`pip install hmmlearn` 후 서비스 재시작하세요."
        ) from e
```
- **무엇을**: HMM으로 국면을 학습·예측. `hmmlearn`은 무거운 선택적 의존성이라 **함수 안에서 지연 import**.
- **왜 지연 import**: 파일 맨 위에서 import하면 `hmmlearn` 미설치 시 **rule 모드조차 못 씁니다**(파일 로드 자체 실패). 함수 안에 두면 HMM을 실제로 부를 때만 필요 → rule 사용자는 영향 없음.
- `except ImportError ... raise ImportError(친절한 메시지) from e` — 미설치 시 "EC2에서 pip install hmmlearn 하라"는 **운영 안내 메시지**로 재포장. `from e`는 원래 에러 체인 보존.
- **헷갈리는 포인트**: 이 ImportError는 **잡지 않고 던집니다**. 즉 hmmlearn 없이 `method="hmm"`을 부르면 폴백이 아니라 **에러가 위로 전파**됩니다(폴백은 "표본 부족"·"fit 실패"에만 작동, 패키지 부재엔 작동 안 함).

```python
# L187-L194 (상태수 클램프 + 피처 엔지니어링)
    n_states = max(2, min(int(n_states), 6))

    log_close = np.log(close.astype(float))
    ret = log_close.diff()
    vol20 = ret.rolling(20).std()
    mom60 = log_close.diff(60)

    feats = pd.DataFrame({"ret": ret, "vol": vol20, "mom": mom60}).dropna()
```
- **한 줄씩**:
  - `n_states = max(2, min(int(n_states), 6))` — 상태 수를 **2~6으로 강제**(요청이 1이나 100이어도 안전 범위로). docstring의 "3~5"보다 실제 허용 폭이 넓음.
  - `log_close = np.log(close.astype(float))` — 로그 가격. 로그를 쓰면 차분(diff)이 곧 수익률이 되어 수학적으로 깔끔.
  - `ret = log_close.diff()` — 로그 수익률(피처 1: 단기 방향/크기).
  - `vol20 = ret.rolling(20).std()` — 20일 변동성(피처 2: 단기 흔들림).
  - `mom60 = log_close.diff(60)` — 60일 로그 모멘텀(피처 3: 중기 추세). 로그가격이라 `diff(60)`이 곧 60일 누적 로그수익률.
  - `feats = pd.DataFrame({...}).dropna()` — 세 피처를 한 표로 묶고, 셋 중 하나라도 NaN인 앞 구간(최소 60일)은 제거.
- **왜 이 3개 피처**: 사전지식 5번처럼 "방향(ret)·흔들림(vol)·추세(mom)" 세 축이면 HMM이 국면을 잘 군집화합니다. 너무 많은 피처는 학습 불안정.

```python
# L195-L202 (표본 부족 폴백 + 정규화)
    if len(feats) < n_states * 30:
        # 표본 부족 시 rule-based로 폴백 (학습 불안정)
        return _rule_regimes(close), "rule"

    X = feats.values.astype(float)
    mu = X.mean(axis=0)
    sd = X.std(axis=0) + 1e-9
    Xn = (X - mu) / sd
```
- **한 줄씩**:
  - `if len(feats) < n_states * 30: return _rule_regimes(close), "rule"` — **표본 부족 폴백**. 상태당 최소 30개 관측은 있어야 학습이 안정적이라는 경험칙. 모자라면 rule로 갈아타고 두 번째 반환값을 `"rule"`로 정직 표기. (예: n_states=4면 120일 미만이면 폴백.)
  - `X = feats.values.astype(float)` — DataFrame을 numpy 행렬로.
  - `mu = X.mean(axis=0)`, `sd = X.std(axis=0) + 1e-9` — 열별(피처별) 평균·표준편차. `+1e-9`는 0 나누기 방지(어떤 피처가 상수면 std=0).
  - `Xn = (X - mu) / sd` — **z-score 표준화**. 세 피처의 스케일이 제각각(수익률 0.01 vs 모멘텀 0.2)이라, 표준화 안 하면 큰 스케일 피처가 거리 계산을 지배. 표준화로 공정하게.
- **왜 폴백을 여기서도**: HMM은 "조용히 실패"하면 안 되므로, 학습이 위험한 조건이면 **명시적으로** rule로 후퇴하고 그 사실을 반환값에 실어 나름.

```python
# L204-L215 (모델 정의 + fit + predict)
    model = GaussianHMM(
        n_components=n_states,
        covariance_type="full",
        n_iter=200,
        tol=1e-3,
        random_state=42,
    )
    try:
        model.fit(Xn)
    except Exception:
        return _rule_regimes(close), "rule"
    hidden = model.predict(Xn)  # 0..K-1
```
- **한 줄씩**:
  - `GaussianHMM(n_components=n_states, ...)` — 상태 `n_states`개짜리 가우시안 HMM 정의.
    - `covariance_type="full"` — 각 상태가 피처 간 상관까지 가진 완전한 공분산 행렬을 학습(가장 표현력 높음).
    - `n_iter=200`, `tol=1e-3` — EM 알고리즘 최대 200회 반복, 변화가 0.001 미만이면 수렴으로 보고 중단.
    - `random_state=42` — **재현성**. HMM 학습은 초기값에 따라 결과가 달라지는데, 시드를 고정해 같은 입력이면 항상 같은 결과(메모리의 "엔진 신뢰성 감사" 결정론성과 같은 정신).
  - `try: model.fit(Xn) except Exception: return _rule_regimes(close), "rule"` — **fit 실패 폴백**. 수렴 실패·수치 오류 등 무슨 예외든 잡아 rule로 후퇴. (HMM fit은 특이 행렬 등으로 종종 깨짐.)
  - `hidden = model.predict(Xn)` — 각 날짜를 **0~K-1 숫자 상태**로 디코딩(비터비). 이 숫자엔 아직 의미(bull/bear)가 없음 — 다음 단계에서 라벨링.
- **헷갈리는 포인트**: HMM이 주는 건 **"무명의 상태 번호"**(0,1,2,3)일 뿐, "0번이 강세"라는 보장이 없습니다. 매 학습마다 번호↔의미 매핑이 달라질 수 있어, **아래에서 통계로 의미를 부여**해야 합니다.

```python
# L217-L232 (상태별 통계 집계)
    state_stats = []
    for s in range(n_states):
        mask = hidden == s
        if mask.sum() == 0:
            state_stats.append({"s": s, "ret": 0.0, "vol": 0.0, "n": 0})
            continue
        state_stats.append({
            "s": s,
            "ret": float(feats["ret"].values[mask].mean()),
            "vol": float(feats["vol"].values[mask].mean()),
            "n": int(mask.sum()),
        })

    vols = sorted([x["vol"] for x in state_stats])
    vol_median = vols[len(vols) // 2] if vols else 0.0
```
- **무엇을**: 각 숨은 상태(0~K-1)에 속한 날들의 **평균 수익률·평균 변동성**을 계산. 이게 "이 무명 상태의 정체"를 밝히는 단서.
- **한 줄씩**:
  - `mask = hidden == s` — 상태 `s`인 날들의 boolean 마스크.
  - `if mask.sum() == 0:` — 그 상태에 배정된 날이 0개면(빈 상태) ret/vol을 0으로 채우고 건너뜀.
  - `feats["ret"].values[mask].mean()` — 그 상태 날들의 평균 로그수익률. `vol`도 동일.
  - `vols = sorted([...])`, `vol_median = vols[len(vols)//2]` — 상태들의 변동성을 정렬해 **중앙값**을 구함. "이 상태가 고변동인가"를 판단하는 기준선(상대값).
- **왜 중앙값 기준**: 절대 변동성 수치는 종목/기간마다 다르므로, **"이 종목의 상태들 중 변동성이 위쪽인가 아래쪽인가"** 라는 상대 비교로 라벨링.

```python
# L234-L249 (라벨 매핑 + 정렬 반환)
    # 수익률 zero-band: 전체 표본 수익률 std의 5%
    zero_band = float(feats["ret"].std()) * 0.05

    label_map = {}
    for x in state_stats:
        is_high_vol = x["vol"] > vol_median
        if abs(x["ret"]) <= zero_band:
            label_map[x["s"]] = "high_vol_unstable" if is_high_vol else "sideways"
        elif x["ret"] > 0:
            label_map[x["s"]] = "bull_volatile" if is_high_vol else "bull_quiet"
        else:
            label_map[x["s"]] = "high_vol_unstable" if is_high_vol else "bear"

    labels = pd.Series([label_map[h] for h in hidden], index=feats.index, dtype="object")
    # close 전체 index로 정렬, 학습 못 한 앞 구간은 NaN
    return labels.reindex(close.index), "hmm"
```
- **무엇을**: 각 무명 상태에 **수익률 부호 + 고변동 여부**로 5라벨 중 하나를 부여.
- **한 줄씩**:
  - `zero_band = feats["ret"].std() * 0.05` — "수익률이 사실상 0"으로 볼 임계 폭. 전체 수익률 변동성의 5%. 이 안이면 방향 없음(횡보 후보).
  - `is_high_vol = x["vol"] > vol_median` — 이 상태가 변동성 중앙값보다 위인가.
  - 분기:
    - `abs(ret) <= zero_band` (방향 없음) → 고변동이면 `high_vol_unstable`, 아니면 `sideways`.
    - `ret > 0` (상승) → 고변동이면 `bull_volatile`, 아니면 `bull_quiet`.
    - `else`(하락) → 고변동이면 `high_vol_unstable`, 아니면 `bear`.
  - `labels = pd.Series([label_map[h] for h in hidden], index=feats.index, ...)` — 숫자 상태 시퀀스를 라벨 문자열 시퀀스로 변환.
  - `return labels.reindex(close.index), "hmm"` — **close 전체 날짜축으로 재정렬**(학습 못 한 앞 60일+α는 NaN). 두 번째 반환값 `"hmm"`은 "정말 HMM을 끝까지 썼다"는 표시.
- **왜 이런 규칙 매핑**: HMM은 "상태가 있다"만 알려주지 "그게 강세냐 약세냐"는 모릅니다. 이 if-elif가 **rule_regimes와 같은 5라벨 체계로 통일**해, 어느 방법을 쓰든 출력 라벨이 호환되게 만듭니다.
- **헷갈리는 포인트**: `_hmm_regimes`의 반환 타입 주석은 `-> pd.Series`인데 **실제로는 `(Series, str)` 튜플**을 반환합니다(폴백 줄들과 마지막 줄 모두). 타입 힌트가 코드와 안 맞는 사례 — ⚠️함정 섹션 참고. `bull_quiet`/`bull_volatile`은 "수익률 양수"에서만 나오지만 HMM 상태가 항상 5종을 다 만들지는 않음(상태 수·데이터에 따라 일부 라벨은 안 나올 수 있음).

---

### H. 메인 함수 `per_regime_stats()` — `L252-L461` (이 파일의 결과물 조립)

이 함수가 외부(main.py·trust_score)가 실제로 부르는 **공개 입구**입니다. 길어서 7개 블록으로 나눕니다.

#### H-1. 분류 + 백테스트 + 수익률 정렬 — `L252-L273`
```python
# L252-L273
def per_regime_stats(
    close: pd.Series,
    params: BacktestParams,
    method: str = "rule",
    smoothing: int = 0,
    n_states: int = 4,
    ticker: Optional[str] = None,
    period: Optional[str] = None,
) -> Dict[str, Any]:
    """Run full backtest, then split equity returns by regime label and compute summary per regime."""
    regimes_raw = classify_regimes(close, method=method, smoothing=smoothing, n_states=n_states)
    # HMM 요청이 표본부족/fit실패로 rule 로 폴백됐는지 실제 사용 방법을 가져온다(dropna 전에 읽음).
    effective_method = regimes_raw.attrs.get("effective_method", method)
    regimes = regimes_raw.dropna()
    bt = run_backtest(close, params)

    eq = pd.Series({pd.to_datetime(p["date"]): p["value"] for p in bt["equity_curve"]})
    eq = eq.sort_index()
    eq_ret = eq.pct_change().dropna()
    common = eq_ret.index.intersection(regimes.index)
    eq_ret = eq_ret.loc[common]
    reg = regimes.loc[common]
```
- **한 줄씩**:
  - `regimes_raw = classify_regimes(...)` — 위 D 함수로 날짜별 라벨 Series 생성(NaN 포함 원본).
  - `effective_method = regimes_raw.attrs.get("effective_method", method)` — **`.attrs`에서 실제 사용 방법을 dropna 전에 읽음**(D 블록 헷갈리는 포인트의 그 이유). 없으면 요청값 fallback.
  - `regimes = regimes_raw.dropna()` — NaN(판정 불가 앞 구간) 제거한 깨끗한 라벨.
  - `bt = run_backtest(close, params)` — **`vbt_engine.md`의 그 백테스트** 실행. 전략 성과(자산곡선 포함)를 얻음.
  - `eq = pd.Series({날짜→value ...})` — 백테스트가 준 `equity_curve`(다운샘플된 [{date,value}] 리스트)를 다시 Series로 복원.
  - `eq_ret = eq.pct_change().dropna()` — 자산곡선의 **일별 수익률**(국면별로 쪼갤 대상).
  - `common = eq_ret.index.intersection(regimes.index)` — 자산수익률 날짜 ∩ 라벨 날짜(둘 다 있는 날만).
  - `eq_ret = eq_ret.loc[common]`, `reg = regimes.loc[common]` — 공통 날짜로 정렬 맞춤.
- **왜 교집합**: `equity_curve`는 다운샘플(약 365점)이라 날짜가 드문드문, `regimes`는 매일 있음. 둘이 겹치는 날만 써야 짝이 맞습니다.
- **헷갈리는 포인트**: 그래서 국면별 통계는 **다운샘플된 자산수익률** 기준입니다(원본 일별이 아님). 표본 수가 줄어 통계가 거칠어질 수 있음 — ⚠️함정 참고.

#### H-2. 국면별 성과 통계 루프 — `L275-L298`
```python
# L275-L298
    out: Dict[str, Any] = {}
    for label in REGIME_LABELS:
        r = eq_ret[reg == label]
        if len(r) < 5:
            out[label] = {"days": int(len(r)), "note": "샘플 부족"}
            continue
        cum = (1 + r).prod() - 1
        ann = (1 + cum) ** (252 / len(r)) - 1 if len(r) > 0 else 0
        sharpe = (r.mean() / r.std() * np.sqrt(252)) if r.std() > 0 else 0
        roll_max = (1 + r).cumprod().cummax()
        dd = ((1 + r).cumprod() / roll_max - 1).min()
        win_rate = float((r > 0).mean() * 100)
        eff_sharpe, sample_w = shrink_sharpe(sharpe, len(r))
        out[label] = {
            "days": int(len(r)),
            "label_ko": REGIME_LABELS_KO.get(label, label),
            "cumulative_return_pct": round(float(cum) * 100, 2),
            "annualized_return_pct": round(float(ann) * 100, 2),
            "sharpe": round(float(sharpe), 2),
            "effective_sharpe": round(float(eff_sharpe), 2),
            "sample_weight": round(float(sample_w), 3),
            "max_drawdown_pct": round(float(dd) * 100, 2),
            "win_rate_pct": round(win_rate, 2),
        }
```
- **무엇을**: 5개 라벨 각각에 대해, 그 국면 날들의 수익률(`r`)만 모아 성적 지표를 계산.
- **한 줄씩**:
  - `r = eq_ret[reg == label]` — 이 국면에 해당하는 날들의 수익률만 추출.
  - `if len(r) < 5: ... "샘플 부족"; continue` — 5개 미만이면 통계 신뢰 불가 → "샘플 부족" 메모만 남기고 건너뜀.
  - `cum = (1 + r).prod() - 1` — **누적 수익률**(매일 수익률을 복리로 곱). 예: +1%,+2% → 1.01×1.02-1≈3.02%.
  - `ann = (1+cum)**(252/len(r)) - 1` — 누적을 **연율화**(이 국면이 1년 내내 지속됐다면 몇 %?). len(r)일치를 252일로 환산.
  - `sharpe = r.mean()/r.std()*sqrt(252)` — 위험 대비 수익(연율화). std=0이면 0.
  - `roll_max = (1+r).cumprod().cummax()` / `dd = (누적/roll_max - 1).min()` — **MDD(최대낙폭)**. 누적자산의 고점 대비 최저점 낙폭. (vbt_engine의 MDD와 같은 개념을 국면 구간 내에서.)
  - `win_rate = (r > 0).mean()*100` — 승률(수익 난 날 비율 %).
  - `eff_sharpe, sample_w = shrink_sharpe(sharpe, len(r))` — **C 함수로 수축 보정**. 표본 적은 국면의 과장된 Sharpe를 완화.
  - `out[label] = {...}` — 모든 지표를 round해 dict로 저장(JSON 친화적).
- **헷갈리는 포인트**: `days`라는 키 이름이지만 실제론 **다운샘플된 수익률 개수**(진짜 달력 일수 아님). `r`가 국면 "구간 내 연속"이 아니라 **흩어진 날들의 모음**이라, MDD는 "이 국면 날들만 이어 붙였을 때의 낙폭"이라는 추상적 의미(연속된 실제 하락이 아님).

#### H-3. bull 합산 키(프론트 호환) — `L300-L321`
```python
# L300-L321
    # 프론트엔드 호환: bull_quiet + bull_volatile → 합산 "bull" 키
    bull_r = eq_ret[reg.isin(["bull_quiet", "bull_volatile"])]
    if len(bull_r) >= 5:
        cum_b = (1 + bull_r).prod() - 1
        ...
        out["bull"] = { "days":..., "label_ko": "상승장", ... }
    else:
        out["bull"] = {"days": int(len(bull_r)), "note": "샘플 부족"}
```
- **무엇을**: `bull_quiet`와 `bull_volatile`를 합쳐 **"bull"이라는 통합 키**를 추가. H-2와 똑같은 지표를 합산 표본으로 다시 계산.
- **왜**: 프론트엔드(또는 구버전 API 소비자)가 "상승장" 하나로 보고 싶어 하는 경우를 위한 **하위호환**. 5분류는 내부 정밀도, "bull"은 요약용.
- **헷갈리는 포인트**: 이 `"bull"` 키는 **합산이라 다른 5라벨과 중복**됩니다. 그래서 뒤(H-4·weak 선정)에서 `"bull"`을 **명시적으로 제외**합니다 — 안 그러면 합산 키가 개별 국면과 섞여 "최약 국면"을 오염시킴.

#### H-4. 최약 국면 선정 + 현재 국면 — `L323-L333`
```python
# L323-L333
    # 취약 regime: effective_sharpe(표본 가중치 적용 후) 기준으로 선정 — bull 합산 키 제외
    valid = {k: v for k, v in out.items()
             if "effective_sharpe" in v and k not in ("bull",)}
    weak = min(valid, key=lambda k: valid[k]["effective_sharpe"]) if valid else None

    # 현재 레짐
    current = regimes.iloc[-1] if not regimes.empty else "sideways"
    current_ko = REGIME_LABELS_KO.get(current, current)

    # 분석 지수/ticker 정보
    analyzed_ticker = ticker.upper() if ticker else "종목"
```
- **한 줄씩**:
  - `valid = {... if "effective_sharpe" in v and k not in ("bull",)}` — 통계가 산출된(샘플 충분) 국면만, **bull 합산 제외**.
  - `weak = min(valid, key=... effective_sharpe)` — **보정 Sharpe가 가장 낮은 국면 = 최약 국면**. (원본 sharpe가 아니라 effective_sharpe 기준 — 표본 적어 우연히 나쁜 국면이 부당하게 "최약"으로 뽑히는 걸 방지.)
  - `current = regimes.iloc[-1] if not regimes.empty else "sideways"` — **가장 최근 날의 라벨 = 현재 국면**. 비었으면 안전하게 횡보.
  - `analyzed_ticker = ticker.upper() if ticker else "종목"` — 표시용 티커(대문자), 없으면 "종목".
- **왜 effective_sharpe로 최약 선정**: 이 `weak`는 trust_score가 "이 전략의 아킬레스건"으로 쓰는 값이라, 표본 편향을 제거한 보정 점수가 공정합니다.

#### H-5. 자연어 내러티브 생성 — `L335-L423`
```python
# L335-L347 (도입부)
    narrative_parts: list[str] = []
    ticker_str = f"{analyzed_ticker} " if ticker else ""
    narrative_parts.append(
        f"▶ {ticker_str}시장 국면 분석 결과\n\n"
        f"이 분석은 200일 이동평균선(MA200)과 60일 변동성을 기준으로 ... 5가지 국면으로 자동 분류한 결과입니다. ..."
    )
```
- **무엇을**: 사람이 읽을 **설명문**을 문단별로 리스트에 쌓아 나중에 합칩니다. 도입부는 분석 방법(MA200+vol60) 자체를 초보에게 설명.
- **왜**: 프론트 Regime 탭의 "해설" 영역에 그대로 노출. 숫자만 주면 일반 사용자가 못 읽으니 **AI 없이도 규칙 기반으로 친절한 설명**을 자동 작성.

```python
# L349-L360 (국면 분포 문단)
    dist = {k: int((regimes_raw == k).sum()) for k in REGIME_LABELS}
    total_analyzed = sum(dist.values())
    if total_analyzed > 0:
        top_regimes = sorted(dist.items(), key=lambda x: x[1], reverse=True)[:3]
        top_str = "、".join(
            f"{REGIME_LABELS_KO.get(k, k)}({v}일, {v / total_analyzed * 100:.0f}%)"
            for k, v in top_regimes if v > 0
        )
        narrative_parts.append(f"\n\n분석 기간 동안 가장 많이 나타난 국면은 {top_str} 순이었습니다. ...")
```
- **무엇을**: 각 국면이 **며칠 나왔는지** 세고, 상위 3개를 "상승장(안정)(620일, 45%)、…" 형태로 문장화.
- **헷갈리는 포인트**: 여기 `dist`는 `regimes_raw`(다운샘플 전, NaN 제외 전 원본) 기준이라 **H-2의 `days`(다운샘플)와 숫자가 다릅니다**. 분포는 진짜 달력일 기준, 성과는 다운샘플 기준 — 두 카운트가 일부러 다른 모집단.

```python
# L362-L389 (최고/최약 국면 비교 문단)
    if valid:
        items_sorted = sorted(valid.items(), key=lambda kv: kv[1].get("effective_sharpe", 0))
        worst_k, worst_v = items_sorted[0]
        best_k, best_v = items_sorted[-1]
        ...
        regime_descs = { "bull_quiet": "...", "bull_volatile": "...", "bear": "...",
                         "sideways": "...", "high_vol_unstable": "..." }
        narrative_parts.append(f"\n\n이 전략의 국면별 성과를 살펴보면, {best_ko} 구간에서 Sharpe ...로 가장 좋은 성과를 ...")
        narrative_parts.append(f"\n반면 {worst_ko} 구간에서는 Sharpe ..., MDD ...로 가장 약한 성과를 ...")
```
- **무엇을**: effective_sharpe로 정렬해 **최고/최악 국면을 뽑아 비교 설명**. 각 국면이 무슨 뜻인지(`regime_descs`)와 함께, 최약 국면엔 "포지션 축소·손절 강화" 조언을 곁들임.
- **왜 effective_sharpe로 정렬**: weak 선정(H-4)과 같은 기준으로 일관성 유지.

```python
# L391-L423 (현재 국면 조언 + 합치기)
    advice_map = { "bull_quiet": "...유리한 환경...", "bull_volatile": "...주의...",
                   "bear": "...하락 추세...", "sideways": "...휩쏘...",
                   "high_vol_unstable": "...레버리지 즉시 축소..." }
    advice = advice_map.get(current, "현재 시장 상황을 면밀히 모니터링하세요.")
    narrative_parts.append(f"\n\n💡 현재 국면 ({current_ko}) — {advice}")
    narrative = "".join(narrative_parts)
```
- **무엇을**: **현재 국면**에 맞는 실전 조언을 사전에서 꺼내 마지막 문단으로. 모든 문단을 `"".join`으로 하나의 긴 내러티브로 합침.
- **헷갈리는 포인트**: 이 조언들은 **고정 템플릿**(LLM 아님). 결정론적이고 빠르지만, 항상 같은 문구라 개인화는 없음.

#### H-6. 레짐 타임라인(주간 샘플) — `L425-L441`
```python
# L425-L441
    regime_timeline = []
    try:
        close_aligned = close.reindex(regimes_raw.index)
        step = max(1, len(regimes_raw) // 500)
        for dt, regime_val in regimes_raw.iloc[::step].items():
            close_val = close_aligned.get(dt) if hasattr(close_aligned, 'get') else None
            if close_val is None and dt in close_aligned.index:
                close_val = close_aligned.loc[dt]
            if regime_val is not None and not (isinstance(regime_val, float) and np.isnan(regime_val)):
                regime_timeline.append({
                    "date": str(dt.date()) if hasattr(dt, 'date') else str(dt)[:10],
                    "regime": str(regime_val),
                    "close": round(float(close_val), 4) if close_val is not None and not np.isnan(float(close_val)) else None,
                })
    except Exception:
        regime_timeline = []
```
- **무엇을**: 프론트 차트용 **[{date, regime, close}] 타임라인**을 만듦. 너무 촘촘하지 않게 `step`으로 다운샘플(약 500점 이하).
- **한 줄씩**:
  - `step = max(1, len(regimes_raw) // 500)` — 전체를 약 500점으로 솎는 간격(`vbt_engine`의 365점 다운샘플과 같은 발상).
  - `regimes_raw.iloc[::step]` — step 간격으로 골라 순회.
  - `close_val` 추출은 `.get()` → `.loc[]` 2단 시도(안전하게 종가 매칭).
  - NaN 라벨인 날은 타임라인에서 제외.
- **왜 `try/except`로 통째 감쌌나**: 타임라인은 **부가 시각화**라, 여기서 에러가 나도 핵심 통계(per_regime)는 살리려고 실패 시 빈 리스트로 폴백. 견고성 우선.

#### H-7. 최종 dict 반환 — `L443-L461`
```python
# L443-L461
    return {
        "per_regime": out,
        "weak_regime": weak,
        "weakest_regime": weak,
        "current_regime": current,
        "current_regime_ko": current_ko,
        "headline": narrative,
        "narrative": narrative,
        "method": effective_method,                  # 실제 사용된 방법(폴백 반영)
        "method_requested": method,                  # 요청된 방법
        "hmm_fallback": bool(method == "hmm" and effective_method != "hmm"),
        "smoothing": int(smoothing or 0),
        "n_states": int(n_states),
        "regime_distribution": {k: int((reg == k).sum()) for k in REGIME_LABELS},
        "ticker": analyzed_ticker,
        "period": period or "",
        "regime_timeline": regime_timeline,
        "analysis_basis": "MA200 (200일 이동평균) + Vol60 (60일 실현 변동성)",
    }
```
- **무엇을**: 모든 결과를 하나의 큰 dict로 묶어 반환 → main.py가 JSON으로 백엔드에, 백엔드가 프론트에.
- **키 한 줄씩**:
  - `per_regime` — H-2/H-3의 국면별 성과 dict(화면의 핵심 표).
  - `weak_regime` / `weakest_regime` — 최약 국면(같은 값 두 키, 호환성).
  - `current_regime` / `_ko` — 현재 국면(영문/한글).
  - `headline` / `narrative` — 같은 자연어 설명(두 키, 호환성).
  - **`method`** — 실제 사용된 방법(폴백 반영). **`method_requested`** — 요청 방법.
  - **`hmm_fallback`** — `method=="hmm"`로 요청했는데 실제론 hmm이 아니면 `true`. **이 세 키가 "정직 보고"의 핵심**(메모리/CLAUDE.md의 `method`·`hmm_fallback` 표기 요구사항 충족).
  - `regime_distribution` — `reg`(공통 날짜) 기준 국면 카운트.
  - `regime_timeline` — H-6 시각화 데이터.
  - `analysis_basis` — 분석 근거 한 줄 설명(고정).
- **헷갈리는 포인트**: `regime_distribution`은 `reg`(교집합 후) 기준이고, H-5의 내러티브 `dist`는 `regimes_raw`(원본) 기준 — **두 분포 숫자가 다를 수 있습니다**(서로 다른 모집단). 화면에서 "분포"와 "타임라인 분포"가 안 맞아 보이면 이 때문.

---

## ⚠️ 함정·버그 주의 (코드에 박힌 교훈 + 발견 사항)

1. **Look-ahead bias (미래 참조) — 분위수가 전체 기간 기반** ⚠️ 가장 중요
   - `_rule_regimes`의 `vol60.quantile(0.75/0.80)`(L108-L109)과 `_hmm_regimes`의 `mu/sd`(L200-L201), `vol_median`(L232), `zero_band`(L235), HMM의 `model.fit(Xn)`(L212)은 **모두 전체 기간 데이터를 한 번에** 보고 계산됩니다.
   - 즉 2020년의 라벨을 정할 때 2024년 변동성 분포를 알고 있는 셈 → **엄밀히는 미래참조**. "과거 어느 날 실시간으로 이 라벨이 가능했나"는 보장 안 됨.
   - 단, 이 파일의 용도는 **사후 진단(어떤 국면에서 전략이 강/약했나)** 이라 백테스트 매매신호처럼 치명적이진 않음. 그래도 "실시간 국면 판정"으로 쓰려면 expanding/rolling 분위수로 바꿔야 함(고도화 참고).

2. **HMM fit 실패·표본 부족 → 조용한 rule 폴백** (L195-L197, L211-L214)
   - 폴백 자체는 견고성이지만, **`except Exception:` 이 너무 광범위**해 진짜 버그(코딩 실수)까지 삼켜 rule로 넘어가면 디버깅이 어려움. 로깅 한 줄이 있으면 더 좋음.
   - 단, **hmmlearn 미설치는 폴백 안 되고 ImportError를 던짐**(L181-L185). "hmm 요청했는데 왜 500 에러?"의 원인이 패키지 부재일 수 있음.

3. **method 정직 보고 — 폴백돼도 거짓말 안 함** (장점, 강조)
   - `.attrs["effective_method"]`(L87) → `per_regime_stats`가 **dropna 전에** 읽음(L263-L264) → 응답의 `method`·`hmm_fallback`에 반영(L451-L453).
   - 만약 누군가 `.attrs` 읽는 위치를 `dropna()` 뒤로 옮기면 **attrs가 날아가 폴백 사실이 숨겨질** 수 있음 — 이 순서는 절대 건드리지 말 것.

4. **타입 힌트 ↔ 실제 반환 불일치** (발견)
   - `_hmm_regimes`는 `-> pd.Series`로 선언(L161)했지만 실제로는 **모든 경로에서 `(Series, str)` 튜플**을 반환(L197, L214, L249). `classify_regimes`도 시그니처는 `-> pd.Series`(L64)지만 내부에서 튜플 언패킹에 의존. 동작엔 문제없으나(호출부가 튜플로 받음) **타입 검사기·독자에게 혼란**. 주석/힌트 정리 권장.

5. **`days`는 진짜 일수가 아님** (L289)
   - `per_regime`의 `days`는 **다운샘플된 equity_curve 수익률 개수**(약 365점 기준 교집합). `regime_distribution`·내러티브 `dist`의 "일"과 다른 모집단. 화면 숫자가 안 맞아 보이는 정상적 이유.

6. **국면별 MDD의 의미 주의** (L284-L285)
   - 국면 날들이 달력상 **흩어져 있는데** 그 수익률을 이어 붙여 MDD를 계산. "연속된 실제 하락"이 아니라 "이 국면 날들만 모았을 때의 가상 낙폭"이라는 추상적 해석.

7. **`_smooth_states`는 왼쪽(직전) 라벨로만 흡수** (L153-L154)
   - 짧은 segment를 항상 직전 라벨로 흡수 → 결과가 약간 "먼저 등장한 라벨" 쪽으로 편향. 양방향(앞뒤 더 긴 쪽) 흡수가 더 중립적일 수 있음.

8. **빈 HMM 상태 처리** (L221-L223)
   - 어떤 숨은 상태에 배정된 날이 0개면 ret/vol=0으로 채움 → 라벨링에서 `sideways`(또는 zero_band 안)로 분류될 수 있으나 실제 데이터가 없어 무해. 다만 `n_states`를 데이터 대비 크게 잡으면 빈 상태가 늘어남.

---

## 🚀 고도화 아이디어 (강의·개선 버전용)

- **Look-ahead 제거(실시간화)**: 분위수·정규화·HMM fit을 **expanding window**(그 시점까지의 데이터만)로 바꾸면 "과거 어느 날 실제로 가능했던 라벨"이 됨 → 진짜 실시간 국면 신호로 승격. (walkforward.md의 정신과 결합.)
- **HMM 폴백 로깅**: `except Exception:`에 `log.warning(...)`을 추가해 폴백 원인을 운영 로그에 남기기(현재는 침묵).
- **전이 확률 노출**: HMM의 `model.transmat_`(상태 전이 행렬)을 응답에 포함하면 "현재 강세장이 다음 주 약세로 갈 확률" 같은 **선행 경보**가 가능.
- **상태 수 자동 선택**: BIC/AIC로 `n_states`를 데이터에 맞게 자동 선택(현재는 고정 입력).
- **양방향 스무딩**: `_smooth_states`를 앞뒤 더 긴 segment로 흡수하도록 바꿔 좌편향 제거.
- **per_regime를 원본 일별 수익률로**: 다운샘플된 equity 대신 `_strategy_returns`(vbt가 반환하는 원본 일별)를 받아 국면별 통계를 더 촘촘히(표본↑, 신뢰↑).
- **변동성 모델 업그레이드**: 단순 rolling std 대신 **EWMA/GARCH**로 변동성 추정 → 국면 전환 민감도 개선.
- **regime-aware 전략 연동**: 분류 결과를 `vbt_engine`에 피드백해 "고변동 국면엔 포지션 축소" 같은 **국면 적응형 백테스트**(현재는 진단만, 실행 연계 없음).
- **타입 힌트 정정**: `_hmm_regimes`·`_rule_regimes`·`classify_regimes`의 반환 타입을 실제(`tuple[pd.Series, str]` 등)와 맞춰 정적 검사 신뢰도 향상.

---

## 📚 용어 사전 (이 파일 한정)

| 용어 | 뜻 |
|---|---|
| **Regime(국면)** | 시장 상태(강세·약세·횡보·고변동). 같은 전략도 국면마다 성과가 다름 |
| **MA200** | 200일 이동평균. 장기 추세선(위=상승추세, 아래=하락추세) |
| **slope(기울기)** | 추세선이 우상향/우하향인지. `diff(10)`로 10일 변화 측정 |
| **분위수(quantile)** | 줄 세웠을 때의 백분위 경계. `quantile(0.75)`=상위 25% 컷 |
| **연율화(`*sqrt(252)`)** | 일일 변동성/수익을 1년 단위로 환산(1년≈252거래일) |
| **HMM(은닉 마르코프 모델)** | 관측값 패턴으로 숨은 상태(국면)를 역추론하는 확률 모델 |
| **Gaussian HMM** | 각 상태의 관측값이 정규분포라 가정하는 표준 HMM(hmmlearn) |
| **피처 ret/vol20/mom60** | HMM 입력 3종: 수익률·20일 변동성·60일 모멘텀 |
| **z-score 표준화** | `(x-평균)/표준편차`. 스케일 다른 피처를 공정 비교하게 |
| **EM / Viterbi / predict** | HMM 학습(fit)·최적 상태경로 디코딩 알고리즘 |
| **폴백(fallback)** | HMM 실패·표본부족 시 rule로 자동 후퇴. `effective_method`로 정직 기록 |
| **smoothing(min-run)** | 짧게 깜빡이는 라벨을 직전 라벨로 흡수해 매끄럽게 |
| **Sharpe shrinkage(수축)** | 표본 적은 Sharpe를 `T/(T+60)`로 0쪽으로 끌어당겨 신뢰도 보정 |
| **effective_sharpe** | 수축 보정된 Sharpe. 최약 국면 선정·trust_score가 사용 |
| **zero_band** | "수익률 사실상 0"으로 볼 임계 폭(전체 수익률 std의 5%) |
| **`.attrs`** | pandas Series의 메타데이터 사전. 여기선 실제 사용 방법 운반(dropna에 약함) |
| **look-ahead bias** | 미래 데이터로 과거 판정. 여기선 전체기간 분위수/HMM fit이 해당 |
| **MDD(최대낙폭)** | 고점 대비 최대 손실 %. 국면별로도 계산(흩어진 날 기준 추상값) |
