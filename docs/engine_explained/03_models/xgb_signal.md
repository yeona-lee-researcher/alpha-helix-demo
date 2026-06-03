# `models/xgb_signal.py` — XGBoost 로 "내일 오를 확률" 예측 (완전 라인별 해설)

> 원본: `analytics/app/models/xgb_signal.py` (147줄)
> 이 문서는 **교재 표준 예시** `01_backtest/vbt_engine.md` 와 동일한 형식을 따릅니다.
> 먼저 읽으면 좋은 문서: [`01_backtest/vbt_engine.md`](../01_backtest/vbt_engine.md) (백테스트·pandas 기초).

---

## 📌 이 파일 한눈에

이 파일은 **"내일 주가가 오를 확률을 점쟍서 알려주는 점쟁이"** 입니다. 단, 손금이 아니라 **과거 데이터에서 배운 패턴**으로 점칩니다.

규칙 기반 전략(vbt_engine 의 sma_cross·rsi 등)은 사람이 "이러면 사라"는 규칙을 손으로 짠 것입니다. 반대로 이 파일은 **기계가 스스로** "이런 모양일 때 다음 날 올랐더라"를 데이터에서 학습합니다. 결과는 BUY/SELL 같은 딱 떨어지는 신호가 아니라, **"내일 오를 확률 0.63 (63%)"** 같은 **확률 한 숫자**입니다. 그래서 이름이 "확률(probability) 시그널 레이어"입니다.

비유: **여러 명의 약한 심판을 모아 강한 판정을 만든다.** 의사결정나무(decision tree) 하나하나는 "RSI 가 30 미만이면 오른다고 본다" 정도의 단순하고 자주 틀리는 약한 심판입니다. XGBoost 는 이런 약한 나무를 **200그루** 차례로 세우되, **앞 나무가 틀린 부분을 다음 나무가 보완**하도록 쌓습니다(그래디언트 부스팅). 200명의 심판이 투표한 결과를 종합해 "오를 확률"을 냅니다.

핵심 함수는 4개입니다:

| 함수 | 한 줄 역할 | 비유 |
|---|---|---|
| `build_features(df)` | OHLCV 표 → 학습용 **피처(입력) 13종 + 라벨(정답)** 표로 가공 | 시험 문제지(피처) + 정답지(라벨) 만들기 |
| `train_model(df, ticker)` | 피처/라벨로 XGBoost 를 **학습**시키고 디스크에 모델 저장 + 교차검증 성적 | 점쟁이를 과거 문제집으로 훈련시키고 실력 채점 |
| `load_model(ticker)` | 디스크에 저장된 학습 완료 모델을 다시 꺼냄 | 훈련된 점쟁이를 서랍에서 꺼내기 |
| `predict_proba_up(df, ticker)` | 저장된 모델로 **오늘 시점**의 "내일 오를 확률" 추론 | 점쟁이에게 오늘 상황 보여주고 확률 묻기 |

**누가 호출하나?**
- `app/main.py` 의 `/signals/today` 엔드포인트 → `predict_proba_up(df, t)` 호출 (L200). Spring Boot 스케줄러가 매일 22:30 KST 에 호출해 일일 시그널에 `ml_proba_up` 을 붙입니다.
- `app/main.py` 의 `/models/train` 엔드포인트 → `train_model(df, req.ticker)` 호출 (L227). 모델을 처음/다시 학습시킬 때.
- `app/models/retrain_scheduler.py` (L77) → 매일 22:30 KST **자동 재학습**이 `train_model` 을 부릅니다.
- `app/explain/shap_explainer.py` (L20·L24) → `build_features`·`FEATURE_COLS`·`load_model` 을 빌려 "왜 이 확률이 나왔나"(SHAP)를 설명합니다.

**왜 XGBoost 인가?** → 정형(테이블) 데이터에서 가장 잘 통하는 모델 중 하나입니다. 신경망보다 데이터가 적어도 잘 작동하고, 학습이 빠르며, 어떤 피처가 중요한지 설명하기 쉽습니다(SHAP 과 궁합 좋음). 주가 피처는 전형적인 "표 한 장"이라 딱 맞습니다.

---

## 🧠 사전 지식 (이거 모르면 막힘)

#### 1) 지도학습(supervised learning) = "문제(X) + 정답(y)" 으로 배우기

기계학습의 한 갈래. **입력(피처 X)** 과 **정답(라벨 y)** 쌍을 잔뜩 보여주면, 기계가 "X 가 이러면 y 가 이렇더라"는 규칙을 스스로 찾습니다. 시험공부에 비유하면: 기출문제(X)와 그 정답(y)을 풀며 패턴을 익히는 것.

```
피처 X (문제)                              라벨 y (정답)
[RSI=28, 수익률=-3%, 변동성=높음, ...]  →   1 (다음날 올랐음)
[RSI=72, 수익률=+5%, 변동성=낮음, ...]  →   0 (다음날 내렸음)
        ...수천 줄...                          ...
```

#### 2) 피처(feature) vs 라벨(label)

- **피처(X)** = 모델에게 주는 **입력 단서들**. 여기선 수익률·이동평균비율·변동성·RSI·MACD 등 **13가지 숫자**(아래 `FEATURE_COLS`).
- **라벨(y, target)** = 우리가 맞히고 싶은 **정답**. 여기선 `y_next_up` = "**다음 날** 종가가 오늘보다 높았는가?" 를 1(오름)/0(내림)으로. 이런 1/0 정답을 맞히는 문제를 **이진 분류(binary classification)** 라고 합니다.

#### 3) XGBoost = 그래디언트 부스팅 의사결정나무 앙상블

- **의사결정나무(decision tree)**: "RSI < 30 이면 왼쪽, 아니면 오른쪽 → 그 다음 변동성 > 0.02 이면..." 식으로 질문을 던져 답에 도달하는 스무고개. 하나만 쓰면 약하고 자주 틀립니다(약한 학습기, weak learner).
- **앙상블(ensemble)**: 약한 나무 여러 그루를 **합쳐** 강하게 만드는 것.
- **그래디언트 부스팅(gradient boosting)**: 나무를 **순차적으로** 세우되, **앞 나무들이 아직 못 맞힌 오차(residual)** 를 다음 나무가 집중 공략하도록 학습. 이걸 200번 반복(`n_estimators=200`)하면 점점 정교해집니다. (랜덤포레스트처럼 독립적으로 막 세우는 게 아니라, "이어달리기"처럼 앞 주자의 실수를 뒤 주자가 보완.)
- 비유: 첫 번째 학생이 답안을 제출하면, 두 번째 학생은 "1번 학생이 틀린 문제"만 집중적으로 다시 풀고, 세 번째 학생은 또 남은 오답을... 이렇게 200명이 협력해 만점에 가까워짐.

#### 4) `predict` vs `predict_proba`

- `model.predict(X)` → **딱 떨어지는 0 또는 1** (내릴 것 / 오를 것). 학습 성적 채점(정확도 등)에 씀.
- `model.predict_proba(X)` → **확률** `[내릴 확률, 오를 확률]` 두 칸짜리. 예: `[0.37, 0.63]` = 내릴 확률 37%, 오를 확률 63%. 우리는 **두 번째 칸(오를 확률)** `[0][1]` 만 꺼냅니다.
- 왜 확률을 쓰나? → "63%" 가 "무조건 오름" 보다 정직하고, 다른 신호와 섞어 쓰기(가중치) 좋기 때문.

#### 5) 데이터 부족 / 모델 없음 → `None` 반환 (조용한 실패)

- 이 파일은 **데이터가 부족하거나 모델 파일이 없으면 예외로 죽지 않고 `None`(또는 에러 dict)을 돌려줍니다.** 호출하는 `main.py` 는 `None` 이면 "모델 미학습 — train 호출 필요" 안내만 붙이고 넘어갑니다.
- 즉 ML 은 **있으면 좋은 보조 신호(optional)** 이지, 없으면 시스템이 멈추는 필수품이 아닙니다. (CLAUDE.md 의 "데이터 부족·미존재 시 predict_proba_up 가 None 반환" 이 바로 이 설계.)

#### 6) 시계열 데이터의 함정 — "미래로 과거를 가르치면 안 된다"

주가는 **시간 순서가 있는 데이터(시계열)** 입니다. 일반 기계학습처럼 데이터를 무작위로 섞어 train/test 로 나누면, **미래 데이터로 과거를 예측하는 컨닝(leakage)** 이 생깁니다. 그래서 이 파일은 무작위 분할이 아니라 **시간 순서를 지키는 `TimeSeriesSplit`** 을 씁니다(아래 L88). 핵심 원칙: **훈련 구간은 항상 검증 구간보다 과거**.

---

## 🗺 전체 흐름도

```
                OHLCV DataFrame (날짜별 시가·고가·저가·종가·거래량)
                                 │
                                 ▼
                     ┌──────────────────────┐
                     │   build_features()    │  지표 13종 계산 + 정답 라벨
                     └──────────────────────┘
                                 │
                 ┌───────────────┴────────────────┐
                 ▼                                 ▼
          X = 피처 13열                      y = y_next_up (0/1)
          (문제지)                           (정답지, close.shift(-1) > close)
                 │                                 │
                 └───────────┬─────────────────────┘
                             ▼
          ┌──────────────── 두 갈래 ─────────────────┐
          ▼ (학습)                                   ▼ (추론)
  ┌──────────────────┐                     ┌──────────────────────┐
  │   train_model()   │                     │  predict_proba_up()  │
  │  ① TimeSeriesSplit│                     │  ① load_model()       │
  │     5-fold CV 채점 │                     │     디스크에서 모델 로드 │
  │  ② 전체로 최종학습 │                     │  ② 마지막 1행 피처 추출 │
  │  ③ joblib 저장 ───┼──── 디스크 ─────────┼──▶ predict_proba[0][1]│
  └──────────────────┘  xgb_TICKER.joblib   └──────────────────────┘
          │                                            │
   {samples, cv_avg,                          {proba_up: 0.63,
    model_path}                                as_of: "2026-05-31"}
          │                                            │
          ▼                                            ▼
   POST /models/train                          GET /signals/today
   (retrain_scheduler 22:30 KST)               (일일 시그널에 ml_proba_up 부착)
```

> 핵심: **학습(train)** 과 **추론(predict)** 사이의 다리는 **디스크에 저장된 `.joblib` 파일** 입니다. 학습은 가끔(매일 22:30), 추론은 자주(시그널 만들 때마다) 일어나므로, 매번 다시 학습하지 않고 **저장→로드** 방식을 씁니다.

---

## 📖 라인별 해설

### A. 파일 설명서(docstring) + import — `L1-L20`

```python
# L1-L11
"""
Feature engineering + XGBoost classifier predicting next-day direction (UP/DOWN).
Used as a probabilistic signal layer on top of rule-based strategies.
"""
from __future__ import annotations
from pathlib import Path
import joblib
import numpy as np
import pandas as pd
from sklearn.model_selection import TimeSeriesSplit
from sklearn.metrics import accuracy_score, precision_score, recall_score
```

- `"""..."""` 는 **파일 설명서(docstring)** — 실행되지 않고 사람이 읽는 용도. 두 줄 요약: ① **피처 엔지니어링 + XGBoost 분류기** 로 ② **다음 날 방향(오름/내림)** 예측, ③ 규칙 기반 전략 **위에 얹는 확률 신호 레이어**.
- `from __future__ import annotations` — 타입힌트를 문자열처럼 늦게 평가하게 하는 주문(초보는 "최신 타입표기용 마법" 정도로). 덕분에 `dict | None` 같은 최신 표기가 옛 파이썬에서도 안전.
- `from pathlib import Path` — 파일 경로를 객체로 다루는 표준 도구. `MODEL_DIR / "파일명"` 처럼 `/` 로 경로를 잇습니다(OS 무관, 윈도/리눅스 모두 동작).
- `import joblib` — **학습된 모델을 파일로 저장/로드** 하는 도구(scikit-learn 계열 표준). pickle 보다 큰 배열 저장에 효율적.
- `numpy(np)` 숫자계산, `pandas(pd)` 표 데이터. **퀀트 2대 라이브러리**.
- `from sklearn.model_selection import TimeSeriesSplit` — **시간 순서를 지키는 교차검증 분할기**(사전지식 6번). 주가 같은 시계열의 컨닝(leakage) 방지 핵심.
- `from sklearn.metrics import accuracy_score, precision_score, recall_score` — 분류 성적 채점 3종 세트:
  - **정확도(accuracy)**: 전체 중 맞힌 비율.
  - **정밀도(precision)**: "오른다"고 예측한 것 중 진짜 오른 비율("내가 사라고 한 것 중 진짜 좋았던 비율").
  - **재현율(recall)**: 진짜 오른 날 중 내가 잡아낸 비율("기회를 놓치지 않은 비율").

```python
# L13-L20
try:
    from xgboost import XGBClassifier
    _XGB_AVAILABLE = True
except Exception:  # pragma: no cover
    XGBClassifier = None  # type: ignore[assignment]
    _XGB_AVAILABLE = False

from app.config import MODEL_DIR
```

- **무엇을**: XGBoost 가설치돼 있으면 가져오고 `_XGB_AVAILABLE=True`, 설치 안 됐거나 import 실패하면 `False` 로 표시.
- **왜 이렇게**: XGBoost 는 OS 에 따라 설치가 까다로울 수 있는 무거운 라이브러리입니다(C++ 컴파일 의존). 없는 환경에서도 **앱 전체가 import 단계에서 죽지 않도록**, `try/except` 로 감싸 "있으면 쓰고 없으면 곱게 끄는" 안전장치를 둡니다. 아래 모든 함수가 첫 줄에서 `if not _XGB_AVAILABLE:` 를 체크합니다.
- `# pragma: no cover` — 테스트 커버리지 측정에서 이 except 줄은 제외하라는 표시(정상 환경에선 거의 안 타는 줄이라).
- `# type: ignore[...]` — 타입검사기에게 "XGBClassifier 에 None 을 넣는 건 의도된 것이니 경고 마라".
- `from app.config import MODEL_DIR` — 모델 `.joblib` 파일을 저장할 폴더. `config.py` 에서 `MODEL_DIR = ROOT_DIR / "models_cache"` 로 정의되고 `MODEL_DIR.mkdir(exist_ok=True)` 로 폴더가 미리 만들어집니다.

> 💡 초보 포인트: `_XGB_AVAILABLE` 의 앞 `_` 는 "이 파일 내부용 변수"라는 관습 표시. 이 한 플래그가 "ML 은 선택(optional)" 이라는 설계 철학을 코드로 구현합니다.

---

### B. 피처 엔지니어링 `build_features()` — `L25-L65` (이 파일의 알맹이 ①)

이 함수가 **원시 가격표(OHLCV)를 모델이 먹을 수 있는 숫자 피처 표로 요리**합니다. 가장 중요한 부분이니 블록별로 쪼갭니다.

함수 머리 + 준비:
```python
# L25-L29
def build_features(df: pd.DataFrame) -> pd.DataFrame:
    """Input: OHLCV DataFrame. Output: features X with target y_next_up."""
    out = pd.DataFrame(index=df.index)
    close = df["Close"]
    high, low, vol = df["High"], df["Low"], df["Volume"]
```
- **입력**: `df` = OHLCV(Open·High·Low·Close·Volume) **데이터프레임**(여러 열을 가진 날짜별 표). 백테스트 엔진은 `close` Series 한 줄만 받았지만, 여기선 거래량·고가·저가까지 쓰므로 **표 전체**를 받습니다.
- `out = pd.DataFrame(index=df.index)` — `df` 와 **같은 날짜축**을 가진 빈 결과표를 만들고, 여기에 피처를 한 열씩 채워나감.
- `close, high, low, vol` — 자주 쓸 열을 짧은 이름으로 꺼내 둠(코드 가독성).

#### 피처 1군: 수익률(Returns) — `L31-L34`
```python
# L31-L34
    # Returns
    out["ret_1"] = close.pct_change(1)
    out["ret_5"] = close.pct_change(5)
    out["ret_20"] = close.pct_change(20)
```
- `pct_change(n)` = "**n일 전 대비 몇 % 변했나**". (`close.pct_change(1)` = 어제 대비 오늘 등락률.)
- `ret_1`(1일), `ret_5`(1주일), `ret_20`(1개월) — **단기·중기·장기 모멘텀**을 한꺼번에 단서로 줍니다. "최근에 얼마나 올랐/내렸나"가 다음 날 방향과 관련 있다는 가설.

#### 피처 2군: 이동평균 대비 위치(SMA ratio) — `L36-L39`
```python
# L36-L39
    # Moving averages
    out["sma_20_ratio"] = close / close.rolling(20).mean() - 1
    out["sma_60_ratio"] = close / close.rolling(60).mean() - 1
    out["sma_200_ratio"] = close / close.rolling(200).mean() - 1
```
- `close.rolling(20).mean()` = **최근 20일 종가의 평균**(20일 이동평균선, SMA). `rolling(20)` 은 "20개짜리 창문을 미끄러뜨리며" 계산.
- `close / SMA - 1` = "현재가가 이동평균보다 **몇 % 위/아래**에 있나". 예: `0.05` = 현재가가 20일선보다 5% 높음(과열 신호일 수 있음), `-0.03` = 3% 아래(눌림 신호).
- 20·60·200일 — **단기·중기·장기 추세** 대비 위치. 절대 가격(예: 150달러)을 그대로 주면 종목마다 스케일이 달라 학습이 어렵습니다. **"평균 대비 비율"** 로 바꾸면 **종목 무관하게 비교 가능**(정규화 효과).

> 💡 초보 포인트: `close / SMA` 가 아니라 `- 1` 을 빼는 이유 → "1.05" 보다 "0.05"(=+5%)가 0 근처에서 다루기 쉬워서. 0 = 정확히 평균선 위, 양수 = 위, 음수 = 아래로 직관적.

#### 피처 3군: 변동성(Volatility) — `L41-L43`
```python
# L41-L43
    # Volatility
    out["vol_20"] = close.pct_change().rolling(20).std()
    out["vol_60"] = close.pct_change().rolling(60).std()
```
- `close.pct_change()` = 일별 등락률 → `.rolling(20).std()` = 최근 20일 등락률의 **표준편차** = **변동성(흔들림 정도)**.
- `vol_20`(최근 1개월), `vol_60`(최근 3개월) 변동성. "요즘 시장이 얼마나 출렁이나"가 다음 날 방향과 관계있다는 가설(고변동 = 불안정).

#### 피처 4군: RSI(14) — `L45-L50`
```python
# L45-L50
    # RSI(14)
    delta = close.diff()
    gain = delta.where(delta > 0, 0).rolling(14).mean()
    loss = -delta.where(delta < 0, 0).rolling(14).mean()
    rs = gain / loss.replace(0, np.nan)
    out["rsi_14"] = 100 - (100 / (1 + rs))
```
- **RSI(상대강도지수)** 를 **공식대로 손수 계산** 합니다(vbt_engine 은 `vbt.RSI.run` 으로 라이브러리에 맡겼지만, 여기선 직접). 0~100 값, **70 위=과매수, 30 아래=과매도**.
- 한 줄씩:
  - `delta = close.diff()` — 하루 변화량(오늘 − 어제). 양수면 오른 날, 음수면 내린 날.
  - `gain = delta.where(delta > 0, 0).rolling(14).mean()` — **오른 날의 상승폭만** 남기고(내린 날은 0 처리), 14일 평균. `.where(조건, 0)` = "조건 참이면 원래 값, 거짓이면 0".
  - `loss = -delta.where(delta < 0, 0).rolling(14).mean()` — **내린 날의 하락폭만**(앞에 `-` 붙여 양수로), 14일 평균.
  - `rs = gain / loss.replace(0, np.nan)` — **상대강도 RS** = 평균상승 ÷ 평균하락. `loss` 가 0이면 0으로 나누기 에러가 나므로 `.replace(0, np.nan)` 으로 0을 NaN(결측)으로 바꿔 안전하게.
  - `100 - (100 / (1 + rs))` — RSI 표준 변환 공식. RS 가 크면(상승 우세) RSI 가 100에 가깝고, 작으면 0에 가까움.

> ⚠️ 헷갈리는 포인트: `loss` 가 0(=최근 14일 한 번도 안 내림)이면 `rs` 가 NaN 이 되고 `rsi_14` 도 NaN 이 됩니다. 이 NaN 행은 **함수 끝의 `dropna()` 에서 제거**되므로 모델에는 안 들어갑니다(아래 L65).

#### 피처 5군: MACD — `L52-L56`
```python
# L52-L56
    # MACD
    ema12 = close.ewm(span=12).mean()
    ema26 = close.ewm(span=26).mean()
    out["macd"] = ema12 - ema26
    out["macd_signal_diff"] = out["macd"] - out["macd"].ewm(span=9).mean()
```
- `close.ewm(span=12).mean()` = **12일 지수이동평균(EMA)**. 일반 이동평균(SMA)과 달리 **최근 값에 더 큰 가중치**를 줘 반응이 빠릅니다. (`ewm` = exponentially weighted moving.)
- `macd = ema12 - ema26` — **MACD 선** = 단기EMA − 장기EMA. 양수면 단기 추세가 장기보다 강함(상승 모멘텀).
- `macd_signal_diff = macd - macd.ewm(span=9).mean()` — MACD 선과 그 **9일 신호선의 차이**(MACD 히스토그램). 양수면 모멘텀 가속, 음수면 감속. 교차 직전/직후를 숫자로 표현.

#### 피처 6군: 변동폭 / 거래량 — `L58-L60`
```python
# L58-L60
    # Range / volume
    out["range_pct"] = (high - low) / close
    out["vol_ratio_20"] = vol / vol.rolling(20).mean()
```
- `range_pct = (high - low) / close` — 하루 **고가−저가 변동폭을 종가로 나눈 비율**. "오늘 하루 얼마나 출렁였나"(일중 변동성). 큰 값 = 변동성 큰 날.
- `vol_ratio_20 = vol / vol.rolling(20).mean()` — **오늘 거래량이 최근 20일 평균 거래량의 몇 배**인가. 1.0 = 평소 수준, 2.0 = 평소의 2배(이상 급등/급락 동반 가능성). 거래량 급증은 추세 전환 신호로 자주 쓰임.

#### ⭐ 라벨(정답) 생성 — `L62-L65` (이 파일에서 가장 조심할 줄)
```python
# L62-L65
    # Target: next day up?
    out["y_next_up"] = (close.shift(-1) > close).astype(int)

    return out.dropna()
```
- **무엇을**: 맞히고 싶은 **정답(라벨)** 을 만듭니다. `close.shift(-1)` = **다음 날 종가를 오늘 칸으로 끌어당김**(shift 음수 = 미래를 당겨옴). `다음날 종가 > 오늘 종가` 면 True → `.astype(int)` 로 1, 아니면 0.
- 즉 각 날짜 행의 정답은 "**이 날 기준으로 다음 날 올랐는가?**" 입니다. 피처(오늘까지의 정보)로 이 라벨(내일 방향)을 맞히도록 학습.
- `out.dropna()` — 피처 계산 초기엔 데이터가 모자라 NaN 이 생깁니다(예: 200일 이동평균은 첫 199일이 비어 있음, RSI 도 14일 필요). 그런 **NaN 이 하나라도 있는 행을 통째로 제거**. 그래서 결과 표는 "모든 피처가 채워진 깨끗한 행"만 남습니다.

> ⚠️ 핵심 안전점: 라벨은 `shift(-1)`(미래)을 쓰지만 **피처는 모두 오늘까지의 과거 정보(`pct_change`, `rolling` 은 과거 방향)** 만 씁니다. 따라서 "오늘의 피처 → 내일의 라벨"이라는 올바른 인과 방향이며, **피처 쪽에 미래 정보가 새지 않습니다(no look-ahead in features).** 마지막 행(가장 최근 날)은 "내일"이 아직 없으므로 라벨이 NaN → `dropna` 로 학습에서 제외됩니다(추론 때는 라벨 없이 피처만 쓰므로 문제없음).

---

### C. 피처 목록 상수 `FEATURE_COLS` — `L68-L75`

```python
# L68-L75
FEATURE_COLS = [
    "ret_1", "ret_5", "ret_20",
    "sma_20_ratio", "sma_60_ratio", "sma_200_ratio",
    "vol_20", "vol_60",
    "rsi_14",
    "macd", "macd_signal_diff",
    "range_pct", "vol_ratio_20",
]
```
- 모델에 넣을 **입력 피처 13개의 이름 목록**(라벨 `y_next_up` 은 제외). `build_features` 가 만든 표에서 **이 13열만 골라** `X` 로 씁니다.
- **왜 따로 상수로 빼나?** → 학습(`train_model`)·추론(`predict_proba_up`)·설명(`shap_explainer`)이 **모두 같은 13열, 같은 순서**를 써야 하기 때문. 한 곳에 모아두면 어긋날 일이 없습니다(단일 진실원, single source of truth). 실제로 학습 시 `joblib.dump` 에 이 목록을 함께 저장합니다(L114).

> 💡 초보 포인트: 학습 때 쓴 피처 순서와 추론 때 피처 순서가 다르면 모델이 엉뚱한 값을 예측합니다. `FEATURE_COLS` 한 리스트로 강제해 이 실수를 원천 차단.

---

### D. 모델 학습 `train_model()` — `L80-L122` (이 파일의 알맹이 ②)

함수 머리 + 가드:
```python
# L80-L85
def train_model(df: pd.DataFrame, ticker: str) -> dict:
    if not _XGB_AVAILABLE:
        return {"ticker": ticker.upper(), "error": "xgboost not installed", "samples": 0, "cv_avg": {}, "model_path": ""}
    feats = build_features(df)
    X = feats[FEATURE_COLS]
    y = feats["y_next_up"]
```
- **입력**: `df`(OHLCV), `ticker`(종목코드, 예: "AAPL"). **출력**: 학습 결과 요약 dict.
- 첫 줄 가드: XGBoost 가 없으면 **즉시 에러 dict 반환**(학습 시도조차 안 함). 앱은 안 죽음.
- `feats = build_features(df)` 로 피처+라벨 표를 만들고, `X`(피처 13열), `y`(정답 1열)로 분리. 이게 지도학습의 표준 준비.

#### 시계열 교차검증(CV) — `L87-L103`
```python
# L87-L103
    # Time-series CV (no leakage)
    tscv = TimeSeriesSplit(n_splits=5)
    cv_scores = []
    model = None
    for train_idx, test_idx in tscv.split(X):
        model = XGBClassifier(
            n_estimators=200, max_depth=4, learning_rate=0.05,
            subsample=0.9, colsample_bytree=0.9,
            eval_metric="logloss", random_state=42,
        )
        model.fit(X.iloc[train_idx], y.iloc[train_idx])
        pred = model.predict(X.iloc[test_idx])
        cv_scores.append({
            "accuracy": float(accuracy_score(y.iloc[test_idx], pred)),
            "precision": float(precision_score(y.iloc[test_idx], pred, zero_division=0)),
            "recall": float(recall_score(y.iloc[test_idx], pred, zero_division=0)),
        })
```
- **무엇을**: 모델의 **실력을 정직하게 채점**하는 단계. 한 번만 훈련/평가하면 운에 좌우되니, **5번 나눠 반복**합니다.
- `TimeSeriesSplit(n_splits=5)` — 시간 순서를 지키며 5조각으로 나눔. **항상 과거로 훈련 → 바로 다음 미래로 검증**:
  ```
  fold1:  [훈련         ][검증]
  fold2:  [훈련             ][검증]
  fold3:  [훈련                 ][검증]
  fold4:  [훈련                     ][검증]
  fold5:  [훈련                         ][검증]
          (검증 구간은 항상 훈련 구간보다 미래 → 컨닝 불가)
  ```
  주석 `# no leakage`(누수 없음)가 바로 이 뜻. 일반 KFold 처럼 무작위로 섞으면 미래로 과거를 가르치는 컨닝이 생깁니다.
- `XGBClassifier(...)` 하이퍼파라미터(모델 설정 다이얼):
  - `n_estimators=200` — **나무 200그루**(부스팅 단계 수). 많을수록 정교하지만 과적합 위험·느려짐.
  - `max_depth=4` — 나무 **깊이 최대 4**. 얕게 제한해 과적합 방지(나무가 깊으면 훈련셋만 외움).
  - `learning_rate=0.05` — **학습 속도(보폭)**. 작을수록 신중하게 조금씩 보정(0.05 = 매우 신중). 작으면 나무가 더 많이 필요.
  - `subsample=0.9` — 나무마다 **데이터의 90%만 무작위** 사용 → 다양성·과적합 방지.
  - `colsample_bytree=0.9` — 나무마다 **피처의 90%만 무작위** 사용 → 위와 같은 효과.
  - `eval_metric="logloss"` — 학습 중 성능 측정 지표(로그 손실, 확률 예측의 품질).
  - `random_state=42` — **난수 씨앗 고정** → 같은 데이터면 항상 같은 결과(재현성). 42 는 업계 농담 관습값.
- `model.fit(훈련X, 훈련y)` 로 학습 → `model.predict(검증X)` 로 0/1 예측 → 정확도·정밀도·재현율을 채점해 `cv_scores` 에 차곡차곡.
- `zero_division=0` — 정밀도/재현율 계산에서 0으로 나눠야 할 상황(예: 한 번도 "오른다" 예측 안 함)이면 **에러 대신 0** 으로 처리.

> 💡 초보 포인트: 이 루프의 `model` 들은 **채점용 임시 모델**입니다. 실제로 저장하는 모델은 아래에서 **전체 데이터로 다시** 학습합니다. CV 는 "이 설정이 얼마나 잘 맞히나"를 가늠하는 모의고사, 최종 학습은 "본 시험 직전 전 범위 총정리"라고 보면 됩니다.

#### 최종 학습 + 디스크 저장 — `L105-L114`
```python
# L105-L114
    # Final fit on all data
    final = XGBClassifier(
        n_estimators=200, max_depth=4, learning_rate=0.05,
        subsample=0.9, colsample_bytree=0.9,
        eval_metric="logloss", random_state=42,
    )
    final.fit(X, y)

    path = MODEL_DIR / f"xgb_{ticker.upper()}.joblib"
    joblib.dump({"model": final, "features": FEATURE_COLS}, path)
```
- **무엇을**: 검증으로 쪼개지 않고 **가진 데이터 전부(`X, y`)** 로 최종 모델 `final` 을 학습. 실전 추론에 쓸 진짜 모델은 데이터를 한 톨도 안 버리고 전부 학습하는 게 유리하기 때문.
- `path = MODEL_DIR / f"xgb_{ticker.upper()}.joblib"` — 저장 경로. 종목별 파일 분리(예: `xgb_AAPL.joblib`). `ticker.upper()` 로 **대문자 통일**(aapl·AAPL 을 같은 파일로).
- `joblib.dump({"model": final, "features": FEATURE_COLS}, path)` — **모델과 피처 목록을 한 묶음(dict)으로 저장**. 모델만 저장하면 "어떤 피처로 학습했는지"를 잃어버리므로 함께 보관(추론 시 정합성 보장).

> ⚠️ 헷갈리는 포인트: 같은 하이퍼파라미터 블록이 CV 루프(L92)와 최종(L106)에 **두 번** 등장합니다. CV 의 `model` 들과 최종 `final` 은 **별개 객체**입니다. 루프가 끝난 뒤의 `model` 변수는 버려지고, 저장되는 건 오직 `final`.

#### 결과 요약 반환 — `L116-L122`
```python
# L116-L122
    avg = {k: round(np.mean([s[k] for s in cv_scores]), 4) for k in cv_scores[0]}
    return {
        "ticker": ticker.upper(),
        "samples": len(X),
        "cv_avg": avg,
        "model_path": str(path),
    }
```
- `avg = {...}` — 5번 fold 의 정확도·정밀도·재현율을 각각 **평균**내 소수 4자리로. `for k in cv_scores[0]` = 첫 fold 의 키들(accuracy/precision/recall)을 돌며 같은 키끼리 평균. 결과 예: `{"accuracy": 0.5213, "precision": 0.5402, "recall": 0.6105}`.
- 반환 dict: 종목·**학습에 쓴 표본 수(samples)**·교차검증 평균 성적(cv_avg)·저장 경로. 이게 `/models/train` 응답으로 나가 "얼마나 많은 데이터로, 얼마나 잘 맞히는 모델을 만들었나"를 보여줍니다.

> 💡 현실 감각: 주가 다음 날 방향 예측은 본질적으로 매우 어려워서, accuracy 가 **0.5(찍기) 근처**면 정상입니다. 0.55 만 돼도 꽤 쓸만한 엣지(edge)일 수 있습니다. 0.9 같은 숫자가 나오면 오히려 **누수(leakage) 버그를 의심**해야 합니다.

---

### E. 모델 로드 `load_model()` — `L125-L129`

```python
# L125-L129
def load_model(ticker: str):
    path = MODEL_DIR / f"xgb_{ticker.upper()}.joblib"
    if not path.exists():
        return None
    return joblib.load(path)
```
- **무엇을**: 디스크에서 학습 완료 모델 묶음을 다시 꺼냄. `train_model` 이 저장할 때와 **똑같은 경로 규칙**(`xgb_TICKER.joblib`)으로 찾습니다.
- `if not path.exists(): return None` — **파일이 없으면(=아직 학습 안 함) `None`**. 예외로 죽지 않음(사전지식 5번). 호출처가 `None` 을 보고 "모델 미학습" 안내를 띄울 수 있게.
- `joblib.load(path)` — 저장했던 `{"model": ..., "features": ...}` dict 를 그대로 복원해 반환.
- `shap_explainer.py` 도 이 함수를 빌려 같은 모델을 로드합니다(설명용).

---

### F. 추론 `predict_proba_up()` — `L132-L147` (이 파일의 알맹이 ③)

```python
# L132-L147
def predict_proba_up(df: pd.DataFrame, ticker: str) -> dict | None:
    if not _XGB_AVAILABLE:
        return None
    bundle = load_model(ticker)
    if bundle is None:
        return None
    feats = build_features(df)
    if feats.empty:
        return None
    X_latest = feats[FEATURE_COLS].iloc[[-1]]
    proba = float(bundle["model"].predict_proba(X_latest)[0][1])
    return {
        "proba_up": round(proba, 4),
        "as_of": str(feats.index[-1].date()),
    }
```
- **무엇을**: 저장된 모델로 **지금(가장 최근 날) 기준 "내일 오를 확률"** 을 계산. 출력은 dict 또는 `None`.
- 세 겹의 안전 가드(하나라도 걸리면 `None` 반환):
  1. `if not _XGB_AVAILABLE: return None` — XGBoost 미설치.
  2. `bundle = load_model(ticker); if bundle is None: return None` — 모델 파일 없음(미학습).
  3. `feats = build_features(df); if feats.empty: return None` — **피처를 못 만들 만큼 데이터가 부족**(예: 200일 이동평균 계산에 200일치도 없어 `dropna` 후 0행). CLAUDE.md 의 "데이터 부족 시 None" 이 바로 이 줄.
- `X_latest = feats[FEATURE_COLS].iloc[[-1]]` — 피처 표의 **맨 마지막 행 하나**(가장 최근 거래일)만 뽑음. `.iloc[[-1]]` 의 **이중 대괄호 `[[ ]]`** 에 주목: 한 줄짜리 **DataFrame**(2차원)을 유지합니다. `.iloc[-1]`(대괄호 하나)이면 Series(1차원)가 되어 `predict_proba` 가 거부합니다.
- `bundle["model"].predict_proba(X_latest)` → `[[내릴확률, 오를확률]]` 형태. `[0]` 으로 첫(유일한) 행, `[1]` 로 **오를 확률**만 꺼내 `float` 으로. (사전지식 4번.)
- 반환: `proba_up`(4자리 반올림한 오를 확률) + `as_of`(어느 날 기준인지 = 피처 마지막 날짜). 예: `{"proba_up": 0.6312, "as_of": "2026-05-31"}`.

> ⚠️ 헷갈리는 포인트: `as_of` 는 "이 확률이 **어느 날의 종가까지 보고** 낸 예측인가"입니다. 그 날의 **다음 거래일** 방향을 예측한 것이죠. `build_features` 의 라벨은 `dropna` 로 마지막 행이 빠지지만, **추론 때는 라벨이 필요 없어** 피처가 있는 마지막 행(가장 최근)을 그대로 씁니다.

---

## ⚠️ 함정·버그 주의 (코드에 박힌 교훈 모음)

1. **라벨 look-ahead 는 의도된 것, 피처 look-ahead 는 금지**
   - `y_next_up = close.shift(-1) > close` — 라벨이 미래(`shift(-1)`)를 보는 건 **정상**(맞히려는 정답이 미래니까). 핵심은 **피처(X)** 가 미래를 보면 안 된다는 것. 이 파일의 피처는 전부 `pct_change`·`rolling`·`ewm` 등 **과거 방향**이라 안전합니다. 새 피처를 추가할 때 **실수로 `shift(-n)` 이나 미래 정보를 피처에 넣지 않도록** 극히 조심하세요(이게 0.9 정확도 같은 가짜 성적의 1순위 원인).

2. **데이터 부족 → 조용한 `None`(예외 아님)**
   - `feats.empty`·`load_model` 의 `None`·`_XGB_AVAILABLE` 가드가 세 곳에서 `None` 을 반환합니다. 호출처(`main.py`)는 이를 `if proba:` 로 받아 "모델 미학습 — train 호출 필요" 안내만 붙입니다. **`predict_proba_up` 이 `None` 이라고 시스템 버그가 아닙니다** — 정상적인 폴백.

3. **`.iloc[[-1]]` 의 이중 대괄호**
   - DataFrame(2차원) 유지가 목적. `.iloc[-1]`(단일 대괄호) 으로 바꾸면 Series 가 되어 `predict_proba` 가 에러. 추론 코드 수정 시 절대 건드리지 말 것.

4. **클래스 불균형 가능성 / 채점 한계**
   - `y_next_up` 은 보통 상승장에선 1이, 하락장에선 0이 더 많아 **약간 불균형**합니다. 지금은 별도 보정(`scale_pos_weight` 등)이 없습니다. 또 `accuracy` 만 보면 "전부 1로 찍기" 같은 게으른 모델에 속을 수 있어, **precision·recall 을 함께** 봐야 합니다(코드가 셋 다 채점하는 이유).

5. **RSI 의 0 나눗셈**
   - `loss.replace(0, np.nan)` 으로 0 나눗셈을 NaN 으로 회피하고, 그 NaN 행은 `dropna` 에서 제거됩니다. 의도된 처리이니 NaN 이 보여도 당황 금지.

6. **하이퍼파라미터 중복**
   - CV 루프(L92)와 최종(L106)에 동일 설정이 두 번 적혀 있어, **한쪽만 바꾸면 CV 성적과 실제 모델이 어긋납니다**. 튜닝 시 양쪽을 같이 고치거나, 공통 dict 로 빼는 게 안전(아래 고도화 참고).

---

## 🚀 고도화 아이디어 (강의·개선 버전용)

- **하이퍼파라미터 중복 제거**: `params = dict(n_estimators=200, max_depth=4, ...)` 를 한 번 정의해 CV·최종 양쪽에 `XGBClassifier(**params)` 로 재사용 → 위 함정 6 해소. 강의에서 "DRY 원칙" 보여주기 좋은 자리.
- **피처 추가**: 거시지표(VIX·금리·환율), 캘린더 효과(요일·월말), 볼린저밴드 폭, ATR(평균진폭), 거래량 가격추세(OBV) 등. 단 **반드시 과거 방향만** 쓸 것(함정 1).
- **클래스 불균형 보정**: `scale_pos_weight = (음성 수 / 양성 수)` 를 줘 소수 클래스에 가중. 또는 임계값(threshold)을 0.5 가 아닌 다른 값으로 튜닝.
- **확률 캘리브레이션(calibration)**: XGBoost 의 `predict_proba` 는 "0.7" 이 실제로 70% 적중을 뜻하지 않을 수 있습니다. `sklearn.calibration.CalibratedClassifierCV`(Platt/Isotonic)로 보정하면 **확률을 정직하게** 만들 수 있어, 포지션 사이징에 바로 쓰기 좋아짐.
- **교차검증 강화**: 지금은 단순 `TimeSeriesSplit`. **purged/embargo K-Fold**(Marcos López de Prado)로 검증 구간 경계의 미세 누수까지 차단하면 더 엄격.
- **조기 종료(early stopping)**: `eval_set` 과 `early_stopping_rounds` 로 검증 손실이 안 좋아지면 나무 추가를 멈춰 과적합·시간 절약.
- **다중 시계열 길이(horizon)**: 지금은 "내일(1일)"만. "5일 후 오를 확률" 등 여러 라벨을 학습하면 다양한 보유기간 전략에 활용 가능.
- **피처 중요도/SHAP 연계**: 이미 `shap_explainer.py` 가 `build_features`·`load_model` 을 공유합니다. 학습 응답에 상위 피처 중요도를 함께 반환하면 "왜 이 모델이 이렇게 판단하나"를 학습 단계에서도 점검 가능.
- **앙상블·메타 결합**: ML 확률(`proba_up`)을 규칙 기반 신호(BUY/SELL)와 **가중 결합**해 최종 의사결정. (이미 `/signals/today` 가 둘을 한 응답에 담으니, 결합 로직만 추가하면 됨.)

---

## 📚 용어 사전 (이 파일 한정)

| 용어 | 뜻 |
|---|---|
| **지도학습** | 입력(X)과 정답(y) 쌍으로 패턴을 배우는 기계학습 |
| **피처(feature, X)** | 모델에 주는 입력 단서. 여기선 수익률·SMA비율·변동성·RSI·MACD 등 13종 |
| **라벨(label/target, y)** | 맞히려는 정답. 여기선 `y_next_up`(다음 날 상승=1/하락=0) |
| **이진 분류** | 정답이 두 가지(0/1)인 예측 문제 |
| **XGBoost** | 그래디언트 부스팅 의사결정나무 앙상블. 표 데이터에 강함 |
| **그래디언트 부스팅** | 앞 모델의 오차를 다음 모델이 보완하도록 순차로 쌓는 앙상블 |
| `predict` / `predict_proba` | 0/1 단정 / `[내릴확률, 오를확률]` 확률 |
| `TimeSeriesSplit` | 시간 순서를 지키는 교차검증 분할(누수 방지) |
| **교차검증(CV)** | 데이터를 여러 번 나눠 반복 채점해 실력을 정직하게 평가 |
| **정확도/정밀도/재현율** | 맞힌 비율 / "오른다"한 것 중 적중 / 진짜 오른 날 중 잡아낸 비율 |
| `pct_change(n)` | n일 전 대비 변화율 |
| `rolling(n).mean()/.std()` | 최근 n일 이동 평균 / 표준편차(변동성) |
| `ewm(span=n).mean()` | 지수이동평균(EMA, 최근 값에 가중) |
| **SMA ratio** | 현재가가 이동평균 대비 몇 % 위/아래인지(정규화 피처) |
| **RSI(14)** | 14일 상대강도지수(70 과매수/30 과매도) |
| **MACD** | 단기EMA−장기EMA 모멘텀 선 + 신호선 차이 |
| `dropna()` | 결측(NaN)이 있는 행 제거 |
| `joblib.dump/load` | 학습된 모델을 파일로 저장/복원 |
| `_XGB_AVAILABLE` | XGBoost 설치 여부 플래그(없으면 곱게 `None` 반환) |
| **`.iloc[[-1]]`** | 마지막 한 행을 **DataFrame(2차원)** 으로 유지(이중 대괄호) |
| **Look-ahead(미래참조)** | 피처에 미래 정보가 새는 반칙. 라벨의 `shift(-1)` 은 정상, 피처는 금지 |
| **클래스 불균형** | 0/1 정답 개수가 한쪽으로 치우침 → accuracy 만 보면 속을 수 있음 |
| **캘리브레이션** | 모델이 낸 확률을 "0.7=실제 70% 적중"이 되도록 보정 |
