# `explain/shap_explainer.py` — "왜 이 시그널이 나왔나"를 영수증처럼 분해 (완전 라인별 해설)

> 원본: `analytics/app/explain/shap_explainer.py` (71줄)
> 짝꿍 파일: `analytics/app/models/xgb_signal.py` (이 파일이 만든 모델·피처를 그대로 받아 씀)
> 이 문서는 교재 표준 형식(`01_backtest/vbt_engine.md`)을 따릅니다.

---

## 📌 이 파일 한눈에

이 파일은 **"설명 영수증 발행기"** 입니다. XGBoost 모델이 "내일 오른다(UP)"라고 예측했을 때, **그 예측 점수가 어떤 입력(피처) 때문에 그렇게 나왔는지**를 한 줄씩 분해해 사람이 읽을 수 있는 근거로 만들어 줍니다.

> 비유: 마트 영수증. 결제금액(=예측 점수)이 23,400원이라면, "사과 +3,000 / 우유 +2,400 / 할인쿠폰 −1,000 …" 처럼 **각 품목이 총액에 얼마를 더하고 뺐는지** 항목별로 찍힙니다. SHAP 도 똑같이 "RSI 가 +0.12 만큼 상승쪽으로 밀었고, 변동성이 −0.05 만큼 하락쪽으로 당겼다"를 항목별로 찍어 줍니다.

핵심 함수는 딱 2개입니다(+ 라벨 사전 1개):

| 이름 | 한 줄 역할 | 비유 |
|---|---|---|
| `explain_latest(df, ticker, top_n)` | 최신 1일 데이터로 SHAP 값을 계산 → 기여도 큰 상위 N개 피처를 뽑아 dict 반환 | 영수증에서 **금액 큰 품목 N개만** 발췌 |
| `_summarize(contribs, direction)` | 그 상위 기여도를 한국어 줄글 설명으로 변환 | 영수증을 보고 "오늘은 과일값이 컸네요" 식 코멘트 |
| `_FEATURE_LABEL_KO` (dict) | 영어 피처명(`rsi_14`)을 한국어 라벨("RSI(14)")로 번역하는 표 | 품목 코드 → 한글 상품명 매핑표 |

**누가 호출하나?** → `app/main.py` 의 `POST /signals/today` 엔드포인트가 호출합니다(`main.py:203`). 백엔드 Spring 스케줄러가 매일 22:30 KST 에 이 API 를 부르면, 각 종목마다 "룰 기반 신호 + XGBoost 확률 + **SHAP 설명**"이 함께 응답에 실립니다. 즉 사용자가 받는 시그널 카드 아래의 "이 예측의 근거" 문구가 이 파일에서 나옵니다.

**왜 필요한가?** → XGBoost 같은 모델은 "내일 오를 확률 0.63" 같은 숫자만 뱉을 뿐, **왜** 그렇게 봤는지는 블랙박스입니다. 돈이 걸린 투자에서 "그냥 믿어라"는 위험합니다. SHAP 은 그 블랙박스를 열어 "이 결정의 근거"를 보여 줘 **신뢰·검증·디버깅**을 가능하게 합니다. (이것이 설명가능 AI, XAI 의 핵심 가치.)

---

## 🧠 사전 지식 (이거 모르면 막힘)

#### 1) 설명가능 AI(XAI) 란?
- 머신러닝 모델은 보통 **블랙박스**입니다. 입력을 넣으면 답이 나오지만 "왜 그 답인지"는 안 보입니다.
- XAI(eXplainable AI)는 그 안을 들여다보게 해주는 기술. "이 예측에 어떤 입력이 얼마나 기여했나"를 알려줍니다.
- 우리 시스템에서는 **"왜 BUY 신호가 떴나"** 를 사용자에게 보여주는 용도입니다.

#### 2) SHAP = 섀플리 값(Shapley value)
- SHAP 은 게임이론의 **섀플리 값**에서 왔습니다. "여러 명이 협력해 만든 성과를, 각자의 공정한 몫으로 나누는 수학"입니다.
- 머신러닝에 적용하면: "예측이라는 성과를, **각 피처(입력)의 공정한 기여분**으로 쪼갠다."
- 각 피처의 SHAP 값은 **부호(±)와 크기**를 가집니다.
  - **양수(+)** = 그 피처가 예측을 **"오른다(UP)" 쪽으로 밀었다**.
  - **음수(−)** = **"내린다(DOWN)" 쪽으로 당겼다**.
  - 절댓값이 클수록 영향이 큼.

#### 3) `base_value` + 기여합 = 예측 (가장 중요한 SHAP 공식)
- SHAP 의 핵심 등식은 이것입니다:
```
모델의 예측값(raw) = base_value(기준선) + Σ(모든 피처의 SHAP 값)
```
- `base_value`(기댓값) = "아무 정보도 없을 때의 평균 예측". 영수증의 **기본요금** 같은 것.
- 거기에 각 피처가 더하고(+) 빼서(−) 최종 예측에 도달합니다.
- 즉 SHAP 값들의 **합**은 "기준선에서 이 예측까지 얼마나 멀어졌나"를 뜻합니다.
- ⚠️ **이 파일은 `base_value` 를 무시하고 SHAP 값들의 합 부호만 봅니다.** (뒤 "함정" 절에서 자세히.)

#### 4) `TreeExplainer` = 트리 모델 전용 초고속 SHAP 계산기
- SHAP 을 정확히 계산하려면 원래 매우 느립니다(피처 조합을 다 따져야 함).
- 하지만 **트리 기반 모델(XGBoost·LightGBM·랜덤포레스트)** 은 `TreeExplainer` 라는 전용 알고리즘으로 **빠르고 정확하게** SHAP 값을 구할 수 있습니다.
- 우리 모델이 XGBoost(트리 앙상블)이므로 `TreeExplainer` 를 씁니다.

#### 5) 이 파일이 의존하는 짝꿍 — `xgb_signal.py`
이 설명기는 스스로 모델을 만들지 않습니다. `xgb_signal.py` 가 만든 것을 **그대로 빌려** 씁니다.

| 빌려오는 것 | 정체 (xgb_signal.py 기준) |
|---|---|
| `build_features(df)` | OHLCV 표 → 13개 피처 + 정답(`y_next_up`) 표로 변환. 마지막에 `dropna()`. |
| `FEATURE_COLS` | 모델이 쓰는 **13개 피처 이름 리스트**(아래 표 참고). 순서가 중요. |
| `load_model(ticker)` | `models/xgb_{TICKER}.joblib` 파일을 읽어 `{"model": ..., "features": ...}` dict 반환. 없으면 `None`. |

**13개 피처(`FEATURE_COLS`)** — `xgb_signal.py:68-75` 그대로:
```
ret_1, ret_5, ret_20            (1·5·20일 수익률)
sma_20_ratio, sma_60_ratio, sma_200_ratio  (이동평균 대비 위치)
vol_20, vol_60                  (20·60일 변동성)
rsi_14                          (RSI 14)
macd, macd_signal_diff          (MACD, MACD-시그널 차이)
range_pct, vol_ratio_20         (당일 가격범위, 거래량 비율)
```
> 비유: 모델은 이 13개 "건강검진 항목"을 보고 "내일 오를 환자인가"를 판단합니다. SHAP 은 그 진단서에서 "어떤 검진 수치가 진단을 좌우했나"를 짚어 줍니다.

---

## 🗺 전체 흐름도

```
              df (OHLCV DataFrame, 보통 최근 2년)  +  ticker  +  top_n
                                   │
                                   ▼
        ┌──────────────────────────────────────────────┐
        │ explain_latest()                              │
        ├──────────────────────────────────────────────┤
        │ ① SHAP 설치됐나?      아니면 → None           │
        │ ② load_model(ticker)  없으면 → None           │  ← xgb_signal.py
        │ ③ build_features(df)  비었으면 → None         │  ← xgb_signal.py
        │ ④ X_latest = 피처표의 "맨 마지막 1행"         │  최신 하루
        │ ⑤ TreeExplainer(model).shap_values(X_latest)  │  ← SHAP 핵심
        │ ⑥ 13개 피처별 {feature, value, shap} 만들기   │
        │ ⑦ |shap| 큰 순으로 정렬 → 상위 top_n 컷       │  영수증 큰 품목
        │ ⑧ shap 합의 부호로 방향(UP/DOWN) 결정         │
        └──────────────────────────────────────────────┘
                                   │
                                   ▼
                    _summarize(contribs, direction)
                    (한국어 줄글 근거 생성, 라벨 번역)
                                   │
                                   ▼
            dict { ticker, as_of, predicted_direction,
                   top_contributions[], human_summary }
                                   │
                                   ▼
              main.py /signals/today → 백엔드 → 프론트 "근거" 표시
```

---

## 📖 라인별 해설

### A. 파일 설명서 + import + SHAP 가용성 체크 — `L1-L14`

```python
# L1-L14
"""
SHAP explanations for the XGBoost signal model.
Returns per-feature contributions (top-N) for the latest prediction.
"""
from __future__ import annotations
try:
    import shap  # type: ignore
    _SHAP_AVAILABLE = True
except Exception:
    shap = None  # type: ignore
    _SHAP_AVAILABLE = False
import pandas as pd

from app.models.xgb_signal import build_features, FEATURE_COLS, load_model
```

- **맨 위 `"""..."""`(docstring)** — 실행되지 않는 파일 설명서. "XGBoost 시그널 모델에 대한 SHAP 설명. 최신 예측에 대해 피처별 기여도(상위 N개)를 반환한다." 이 두 줄이 파일의 사명 전부입니다.
- `from __future__ import annotations` — 타입힌트(`-> dict | None` 같은 표기)를 최신 문법으로 쓰기 위한 "주문". 초보는 **"신문법 허가증"** 정도로 이해하면 됩니다.
- **`try: import shap ... except:` 패턴이 핵심** — `shap` 라이브러리를 불러오되, **설치가 안 돼 있어도 프로그램이 죽지 않게** 합니다.
  - 성공하면 `_SHAP_AVAILABLE = True`,
  - 실패(`ImportError` 등)하면 `shap = None` 으로 두고 `_SHAP_AVAILABLE = False`.
  - **왜 이렇게?** SHAP 은 무겁고 선택적인 의존성입니다. 설명 기능이 없어도 "신호 생성" 본업은 굴러가야 하므로, **"있으면 설명하고 없으면 조용히 건너뛴다"** 는 우아한 폴백(graceful degradation)을 만든 것.
- `import pandas as pd` — 표 데이터 라이브러리. 별명 `pd` 는 업계 관습.
- **마지막 줄이 의존관계의 핵심** — 짝꿍 파일 `xgb_signal.py` 에서 세 가지를 가져옵니다: 피처 만드는 함수(`build_features`), 피처 이름 목록(`FEATURE_COLS`), 모델 로더(`load_model`). 이 설명기는 **모델을 새로 학습하지 않고 빌려 쓴다**는 것이 여기서 드러납니다.

> 💡 초보 포인트: `except Exception:` 으로 잡는 이유 — 단순 `ImportError` 뿐 아니라 shap 이 내부적으로 다른 라이브러리 충돌로 깨질 수도 있어 **"어떤 이유든 못 불러오면"** 폴백하도록 넓게 잡았습니다.

---

### B. 메인 함수 `explain_latest()` — 머리 + 3중 가드 — `L17-L26`

```python
# L17-L26
def explain_latest(df: pd.DataFrame, ticker: str, top_n: int = 5) -> dict | None:
    if not _SHAP_AVAILABLE:
        return None
    bundle = load_model(ticker)
    if bundle is None:
        return None

    feats = build_features(df)
    if feats.empty:
        return None
```

- **함수 시그니처**:
  - 입력 `df` = OHLCV(시가/고가/저가/종가/거래량) DataFrame. 보통 최근 2년치(`main.py` 가 `period="2y"` 로 가져옴).
  - `ticker` = 종목 코드(예: `"AAPL"`). 어떤 모델 파일을 읽을지 결정.
  - `top_n: int = 5` = 상위 몇 개 피처를 뽑을지(기본 5, `main.py` 는 3 으로 호출).
  - 반환 `-> dict | None` = 설명 dict **또는** "설명 못 함"을 뜻하는 `None`.
- **3중 가드(방어 관문)** — 셋 중 하나라도 걸리면 즉시 `None` 반환하고 끝:
  1. **`if not _SHAP_AVAILABLE`** — SHAP 라이브러리가 없으면 설명 불가 → `None`.
  2. **`bundle = load_model(ticker); if bundle is None`** — 이 종목의 학습된 모델 파일(`xgb_{TICKER}.joblib`)이 없으면 → `None`. (모델이 없으면 설명할 대상 자체가 없음.)
  3. **`feats = build_features(df); if feats.empty`** — 피처를 만들었는데 비었으면 → `None`. 데이터가 너무 짧아 `dropna()` 후 한 줄도 안 남는 경우입니다.
- `bundle` 의 정체: `xgb_signal.py:114` 에서 저장한 `{"model": <XGBClassifier>, "features": FEATURE_COLS}` dict. 즉 `bundle["model"]` 이 실제 학습된 모델.

> 💡 초보 포인트: 이 "조기 반환(early return)으로 None 폴백" 패턴은 짝꿍 `predict_proba_up()`(`xgb_signal.py:132`)과 **완전히 똑같습니다.** 둘 다 "조건 안 맞으면 조용히 None" 철학을 공유합니다. 호출하는 `main.py` 는 `if expl:` 로 받아 None 이면 그냥 설명 칸을 비웁니다(에러 안 남).

> ⚠️ 헷갈리는 포인트: `build_features` 안에서 마지막에 `dropna()` 가 일어납니다(`xgb_signal.py:65`). `sma_200_ratio`(200일 이동평균)나 `ret_20`(20일 수익률) 같은 피처는 **앞쪽 수백 일이 NaN** 이라 통째로 잘립니다. 그래서 데이터가 짧으면 `feats.empty` 가 True 가 될 수 있습니다.

---

### C. 최신 1행 추출 + SHAP 값 계산 — `L28-L32` (이 파일의 알맹이)

```python
# L28-L32
    X_latest = feats[FEATURE_COLS].iloc[[-1]]
    explainer = shap.TreeExplainer(bundle["model"])
    sv = explainer.shap_values(X_latest)
    # XGBoost binary returns ndarray (1, n_features)
    values = sv[0] if hasattr(sv, "__len__") else sv
```

- **`X_latest = feats[FEATURE_COLS].iloc[[-1]]`** — 피처표에서 **13개 피처 열만**(`FEATURE_COLS`) 고르고, **맨 마지막 1행**(`iloc[-1]`, 가장 최근 거래일)만 뽑습니다.
  - ⚠️ `iloc[[-1]]` 의 **대괄호 두 겹**이 핵심입니다. `iloc[-1]`(한 겹)이면 1차원 Series(한 줄이 풀려버림)가 되지만, `iloc[[-1]]`(두 겹)이면 **1행짜리 DataFrame**(표 모양 유지)이 됩니다. SHAP 은 "2차원 표"를 입력으로 기대하므로 표 모양을 유지해야 합니다.
  - 즉 우리가 설명하려는 건 **"오늘 하루의 예측"** 하나뿐입니다.
- **`explainer = shap.TreeExplainer(bundle["model"])`** — 학습된 XGBoost 모델을 넣어 **트리 전용 SHAP 계산기**를 만듭니다. 사전지식 4번의 그 빠른 설명기.
- **`sv = explainer.shap_values(X_latest)`** — 핵심 한 줄. 입력 1행에 대해 **13개 피처 각각의 SHAP 값**을 계산합니다. 이진 분류 XGBoost 의 경우 보통 모양이 `(1, 13)`(1행 × 13피처)인 ndarray 입니다.
- **`values = sv[0] if hasattr(sv, "__len__") else sv`** — SHAP 버전/모델에 따라 반환 형태가 달라서 방어적으로 첫 행을 꺼냅니다.
  - 주석(`# XGBoost binary returns ndarray (1, n_features)`)대로, 이진 분류 XGBoost 는 보통 `(1, n_features)` ndarray 를 줍니다. `sv[0]` → **첫 번째(유일한) 행** = 13개 SHAP 값 벡터.
  - `hasattr(sv, "__len__")` = "이 객체에 길이 개념이 있나?"(인덱싱·길이가 되는 배열/리스트인가). 있으면 `sv[0]`, 없으면(스칼라 같은 예외 상황) `sv` 그대로.
  - **왜 이런 방어 코드?** SHAP 라이브러리 버전마다 `shap_values` 가 ndarray 를 주기도, 리스트를 주기도 해서 깨지지 않게 한 안전장치입니다.

> 💡 초보 포인트: `feats[FEATURE_COLS]` 로 **열 순서를 FEATURE_COLS 기준으로 다시 정렬**한다는 점이 중요합니다. 모델은 학습 때 본 순서대로 피처를 기대하므로, 순서가 어긋나면 엉뚱한 SHAP 값이 나옵니다. `FEATURE_COLS` 가 학습·예측·설명 전 과정에서 **단일 기준(single source of truth)** 역할을 합니다.

---

### D. 피처별 기여도 묶기 + 정렬 + 상위 컷 — `L34-L39`

```python
# L34-L39
    contribs = sorted(
        [{"feature": f, "value": float(X_latest.iloc[0][f]), "shap": float(values[i])}
         for i, f in enumerate(FEATURE_COLS)],
        key=lambda d: abs(d["shap"]),
        reverse=True,
    )[:top_n]
```

- 한 줄짜리지만 **3단계 동작**이 압축돼 있습니다. 천천히 풀어 봅시다.
- **① 리스트 컴프리헨션** — `for i, f in enumerate(FEATURE_COLS)` 로 13개 피처를 하나씩 돌며 작은 dict 를 만듭니다:
  - `"feature": f` — 피처 영어 이름(예: `"rsi_14"`).
  - `"value": float(X_latest.iloc[0][f])` — **그 피처의 오늘 실제 값**(예: RSI 가 28.3). `X_latest.iloc[0]` = 그 1행을, `[f]` = 그 피처 칸을 꺼냄. `float()` 로 일반 숫자 변환(JSON 안전).
  - `"shap": float(values[i])` — **그 피처의 SHAP 기여값**(예: +0.12). `values[i]` 가 i번째 피처의 SHAP 값. `enumerate` 의 `i` 와 `FEATURE_COLS` 의 순서가 `values` 의 순서와 **정확히 일치**하기 때문에 `values[i]` 로 짝지을 수 있습니다.
- **② 정렬** — `sorted(..., key=lambda d: abs(d["shap"]), reverse=True)` = **SHAP 값의 절댓값**(`abs`)이 큰 순서로 내림차순 정렬.
  - **왜 절댓값?** +0.20(상승 강하게 밀음)과 −0.18(하락 강하게 당김)은 **둘 다 영향이 큰 항목**입니다. 부호와 무관하게 "영향력의 크기"로 줄을 세워야 "가장 중요한 근거"가 위로 옵니다.
- **③ 상위 컷** — `[:top_n]` = 정렬된 것 중 **앞에서 top_n 개만** 자름(기본 5, `main.py` 는 3). 영수증에서 금액 큰 품목 몇 개만 발췌하는 것과 같습니다.
- 결과 `contribs` = `[{feature, value, shap}, ...]` (영향력 큰 순, 최대 top_n개).

> 💡 초보 포인트: 13개를 다 계산해 놓고 상위 N개만 보여주는 이유 — SHAP 값은 어차피 13개 전부 계산되므로(`shap_values` 한 번에) 추가 비용 없이, **사람에게는 가장 중요한 N개만** 보여 주는 게 가독성에 좋습니다. (영수증에 100원짜리까지 다 보여주면 핵심이 묻힙니다.)

---

### E. 예측 방향 결정 + 결과 dict 반환 — `L41-L48`

```python
# L41-L48
    direction = "UP" if sum(c["shap"] for c in contribs) > 0 else "DOWN"
    return {
        "ticker": ticker.upper(),
        "as_of": str(feats.index[-1].date()),
        "predicted_direction": direction,
        "top_contributions": contribs,
        "human_summary": _summarize(contribs, direction),
    }
```

- **`direction = "UP" if sum(...) > 0 else "DOWN"`** — **상위 top_n개 SHAP 값의 합**이 양수면 `"UP"`(상승), 아니면 `"DOWN"`(하락).
  - 직관: 큰 기여들을 더했을 때 상승쪽(+)이 우세하면 "오를 것", 하락쪽(−)이 우세하면 "내릴 것".
  - ⚠️ **여기 중요한 단순화가 있습니다** — 이 합은 (a) `base_value`(기준선)를 더하지 않고, (b) **상위 top_n개만** 더합니다(13개 전부가 아님). 그래서 이 `direction` 은 **"SHAP 기여의 무게중심이 어느 쪽이냐"는 근사**일 뿐, 모델의 실제 `predict_proba` 확률(0.5 기준)과 **항상 일치하지는 않습니다.** (자세히는 "함정" 절.)
- **반환 dict** — 5개 키:
  - `"ticker": ticker.upper()` — 종목 코드를 대문자로 정규화(예: `aapl` → `AAPL`).
  - `"as_of": str(feats.index[-1].date())` — 이 설명의 **기준 날짜**(피처표 마지막 행의 날짜). `feats.index` 는 날짜 인덱스, `[-1]` 마지막, `.date()` 시각 떼고 날짜만, `str()` 문자열화(예: `"2026-05-30"`).
  - `"predicted_direction": direction` — `"UP"`/`"DOWN"`.
  - `"top_contributions": contribs` — D 단계에서 만든 상위 기여 리스트(프론트가 막대그래프 등으로 그릴 원자료).
  - `"human_summary": _summarize(...)` — 아래 `_summarize` 가 만든 **한국어 줄글 설명**.

> 💡 초보 포인트: `as_of`(설명 기준일)와 `predicted_direction`(익일 예측)을 구분하세요. 모델은 "**as_of 날짜의 데이터로** 그 **다음 날** 방향"을 예측합니다(타깃이 `close.shift(-1) > close`, `xgb_signal.py:63`). 즉 `as_of`=오늘, 예측 대상=내일.

---

### F. 한국어 라벨 사전 `_FEATURE_LABEL_KO` — `L51-L61`

```python
# L51-L61
_FEATURE_LABEL_KO = {
    "ret_1": "1일 수익률", "ret_5": "5일 수익률", "ret_20": "20일 수익률",
    "sma_20_ratio": "20일 이동평균 대비 위치",
    "sma_60_ratio": "60일 이동평균 대비 위치",
    "sma_200_ratio": "200일 이동평균 대비 위치",
    "vol_20": "20일 변동성", "vol_60": "60일 변동성",
    "rsi_14": "RSI(14)",
    "macd": "MACD", "macd_signal_diff": "MACD-시그널 차이",
    "range_pct": "당일 가격범위",
    "vol_ratio_20": "20일 평균 거래량 대비 비율",
}
```

- 모듈 수준(함수 밖) 상수 dict. **영어 피처명 → 한국어 라벨** 번역표입니다.
- 13개 키가 `FEATURE_COLS` 의 13개와 **정확히 1:1 대응**합니다(아래 표).

| 피처(영어) | 한국어 라벨 | 의미(`xgb_signal.py` 계산) |
|---|---|---|
| `ret_1` | 1일 수익률 | `close.pct_change(1)` |
| `ret_5` | 5일 수익률 | `close.pct_change(5)` |
| `ret_20` | 20일 수익률 | `close.pct_change(20)` |
| `sma_20_ratio` | 20일 이동평균 대비 위치 | `close / SMA20 − 1` |
| `sma_60_ratio` | 60일 이동평균 대비 위치 | `close / SMA60 − 1` |
| `sma_200_ratio` | 200일 이동평균 대비 위치 | `close / SMA200 − 1` |
| `vol_20` | 20일 변동성 | 일수익률 20일 표준편차 |
| `vol_60` | 60일 변동성 | 일수익률 60일 표준편차 |
| `rsi_14` | RSI(14) | 14일 상대강도지수 |
| `macd` | MACD | EMA12 − EMA26 |
| `macd_signal_diff` | MACD-시그널 차이 | MACD − MACD의 9일 EMA |
| `range_pct` | 당일 가격범위 | `(high − low) / close` |
| `vol_ratio_20` | 20일 평균 거래량 대비 비율 | `volume / 20일평균거래량` |

> 💡 초보 포인트: 이 표가 **함수 밖(모듈 수준)**에 있는 이유 — 매번 함수 호출마다 다시 만들 필요 없는 고정 상수이기 때문. 한 번만 만들어 두고 `_summarize` 가 참조합니다. 앞의 `_`(언더스코어)는 "이 파일 내부용"이라는 파이썬 관습.

> ⚠️ 헷갈리는 포인트: `_FEATURE_LABEL_KO` 와 `FEATURE_COLS` 가 **따로 정의**돼 있어(서로 다른 파일), 한쪽에 피처를 추가하고 다른 쪽을 깜빡하면 라벨이 영어로 그대로 나옵니다. (`_summarize` 가 `.get(..., c["feature"])` 폴백으로 죽지는 않지만 한글이 안 붙음 — "함정" 절 참고.)

---

### G. 한국어 요약 생성기 `_summarize()` — `L64-L70`

```python
# L64-L70
def _summarize(contribs: list, direction: str) -> str:
    lines = [f"모델은 익일 {'상승' if direction == 'UP' else '하락'}을 예측합니다. 주요 근거:"]
    for c in contribs:
        label = _FEATURE_LABEL_KO.get(c["feature"], c["feature"])
        side = "↑ 상승쪽" if c["shap"] > 0 else "↓ 하락쪽"
        lines.append(f"  • {label} = {c['value']:.4f} → {side} 기여 ({c['shap']:+.3f})")
    return "\n".join(lines)
```

- **무엇을 하나** — 상위 기여 리스트(`contribs`)와 방향(`direction`)을 받아 **사람이 읽는 여러 줄 텍스트**로 변환합니다.
- **첫 줄(헤더)** — `lines = [...]` 로 리스트를 헤더 한 줄로 시작:
  - `direction == 'UP'` 이면 "모델은 익일 **상승**을 예측합니다. 주요 근거:", 아니면 "익일 **하락**…".
  - 익일(翌日) = 다음 날. 모델이 예측하는 대상 날짜.
- **본문 루프** — 각 기여 `c` 마다 한 줄(`•` 불릿)을 만들어 `lines` 에 추가:
  - **`label = _FEATURE_LABEL_KO.get(c["feature"], c["feature"])`** — 영어 피처명을 한글로 번역. 사전에 **없으면 영어 이름 그대로** 사용(`.get` 의 두 번째 인자가 폴백). → 죽지 않는 안전장치.
  - **`side = "↑ 상승쪽" if c["shap"] > 0 else "↓ 하락쪽"`** — 그 피처의 SHAP 부호로 방향 화살표. 양수면 상승쪽 기여, 음수면 하락쪽 기여.
  - **`f"  • {label} = {c['value']:.4f} → {side} 기여 ({c['shap']:+.3f})"`** — 최종 한 줄. 서식 지정자 해설:
    - `{c['value']:.4f}` — 피처의 실제 값을 **소수 4자리**로(예: `28.3000`).
    - `{c['shap']:+.3f}` — SHAP 값을 **부호 강제 표시(+)·소수 3자리**로. `+` 덕분에 양수도 `+0.120` 처럼 부호가 붙어, 상승/하락 기여가 한눈에 보입니다.
- **`return "\n".join(lines)`** — 모든 줄을 줄바꿈(`\n`)으로 이어 **한 덩어리 문자열**로 반환.
- **출력 예시**(실제 형식):
```
모델은 익일 상승을 예측합니다. 주요 근거:
  • RSI(14) = 28.3000 → ↑ 상승쪽 기여 (+0.120)
  • 20일 변동성 = 0.0150 → ↓ 하락쪽 기여 (-0.045)
  • MACD-시그널 차이 = 0.3200 → ↑ 상승쪽 기여 (+0.031)
```
- 이 문자열이 곧 사용자에게 보이는 **"이 시그널의 근거"** 박스 내용입니다(`human_summary` 키로 전달).

> 💡 초보 포인트: `_summarize` 는 **숫자를 말로 바꾸는 번역기**일 뿐, 새 판단을 하지 않습니다. 방향(`direction`)은 이미 `explain_latest` 에서 결정돼 인자로 넘어옵니다. 즉 이 함수는 "표현(presentation)" 담당.

> ⚠️ 헷갈리는 포인트: 헤더의 `direction` 과 각 줄의 `side` 가 **다를 수 있습니다.** 전체 방향이 "상승(UP)"이어도, 개별 줄에는 "↓ 하락쪽 기여"가 섞여 나올 수 있습니다(상승쪽이 더 강해서 합이 +가 된 것). 이건 버그가 아니라 **정상**입니다 — "전체는 상승이지만 변동성은 하락쪽으로 당겼다"는 솔직한 분해입니다.

---

## ⚠️ 함정·버그 주의 (코드에 박힌 교훈 모음)

1. **`base_value` 를 무시한다 (가장 큰 개념적 단순화)** — `direction = "UP" if sum(c["shap"]) > 0`.
   - SHAP 정식 공식은 `예측 = base_value + Σ(전체 SHAP)` 입니다(사전지식 3). 그런데 이 코드는 (a) `base_value`(`explainer.expected_value`)를 **아예 안 쓰고**, (b) **상위 top_n개 SHAP 합**만 봅니다.
   - 따라서 이 `predicted_direction` 은 모델의 진짜 `predict_proba_up`(`xgb_signal.py:142`, 0.5 기준)과 **불일치할 수 있습니다.** 예: 기준선이 높아(평균적으로 잘 오르는 종목) 실제 확률은 0.55(UP)인데, 상위 SHAP 합은 음수라 여기선 "DOWN"이 나올 수 있음.
   - **교훈/주의**: 사용자에게 보이는 `human_summary` 의 "상승/하락 예측"이 같은 응답의 `ml_proba_up`(별도 계산) 과 **방향이 어긋날 수 있음**을 인지해야 합니다. 엄밀히 일치시키려면 `base_value + 전체 SHAP 합`으로 판정해야 합니다(고도화 1번).

2. **상위 top_n개만으로 방향 판정** — 13개 중 3~5개만 더해 방향을 정합니다. 잘린 8~10개의 합이 반대로 컸다면 방향이 뒤집힐 수 있습니다. (시각화는 상위 N개가 맞지만, **방향 판정의 입력으로는 전체를 써야** 정확합니다.)

3. **`shap_values` 반환 형태 버전 의존** — `values = sv[0] if hasattr(sv, "__len__") else sv` 로 방어하지만, SHAP/XGBoost 버전이 (이진 분류에서) **리스트 `[클래스0, 클래스1]`** 을 주는 빌드라면 `sv[0]` 가 "클래스0의 SHAP"을 집어 부호가 통째로 뒤집힐 위험이 있습니다. 주석은 "ndarray (1, n_features)"를 가정합니다 — 환경 SHAP 버전과 가정이 맞는지 확인 필요.

4. **`_FEATURE_LABEL_KO` ↔ `FEATURE_COLS` 동기화** — 둘이 다른 파일에 따로 정의돼, `xgb_signal.py` 에 피처를 추가하고 라벨 사전을 깜빡하면 그 피처만 **영어로** 출력됩니다(`.get` 폴백이라 죽지는 않음). 피처 추가 시 **두 곳을 함께** 고쳐야 합니다.

5. **조용한 `None` 폴백** — SHAP 미설치·모델 없음·데이터 부족 시 예외 없이 `None` 을 돌려줍니다. 호출부(`main.py`)는 `if expl:` 로 무시하므로 **"설명이 그냥 안 보이는"** 상태가 됩니다. 디버깅 시 "왜 설명이 없지?"는 이 3중 가드 중 하나에 걸린 것입니다.

6. **`iloc[[-1]]` 의 두 겹 대괄호** — 한 겹(`iloc[-1]`)으로 바꾸면 Series 가 돼 `shap_values` 가 형태 오류를 낼 수 있습니다. DataFrame 모양(2차원) 유지가 필수.

---

## 🚀 고도화 아이디어 (강의·개선 버전용)

- **`base_value` 포함한 정확한 방향 판정** — `expected = explainer.expected_value;  raw = expected + sum(전체 SHAP);  direction = "UP" if raw > 0 else "DOWN"`. 그러면 `predict_proba_up`(0.5 기준)과 방향이 일관됩니다. (현재 1·2번 함정 동시 해결.)
- **전체 13개로 방향 판정, 표시만 상위 N개** — 방향 합은 `sum(values)`(전체), `top_contributions` 만 상위 N개로 분리.
- **확률을 함께 표기** — `predict_proba_up` 의 확률(예: 0.63)을 `human_summary` 에 같이 적어 "얼마나 확신하는지"까지 사용자에게 전달.
- **SHAP 방향과 피처 의미를 결합한 자연어** — "RSI 가 28(과매도)이라 반등 기대로 상승쪽" 처럼 **도메인 해석**을 붙이면 훨씬 친절(라벨 사전을 `{라벨, 해석규칙}` 으로 확장).
- **Force plot / Waterfall 시각화** — `shap.plots.waterfall` 로 base_value→예측까지의 누적 막대 이미지를 만들어 프론트에 제공(영수증을 그림으로).
- **다중 클래스/회귀 대응** — 지금은 이진(UP/DOWN) 가정. `shap_values` 반환 형태를 클래스 수에 맞춰 일반화(3번 함정 근본 해결).
- **상위 N개 외 "그 외 합" 항목** — 잘린 피처들의 SHAP 합을 "기타(±x)"로 한 줄 추가하면, 보이는 N개와 실제 방향의 괴리를 사용자가 알 수 있음.
- **캐싱** — 같은 종목·같은 날이면 `TreeExplainer` 생성과 계산을 캐시해 22:30 일괄 호출 시 비용 절감.

---

## 📚 용어 사전 (이 파일 한정)

| 용어 | 뜻 |
|---|---|
| **SHAP** | 예측을 각 피처의 기여로 분해하는 설명 기법(섀플리 값 기반). 부호=방향, 크기=영향력 |
| **섀플리 값(Shapley value)** | 게임이론에서 "협력 성과를 공정하게 나누는 몫" — SHAP 의 수학적 뿌리 |
| **`base_value` (expected_value)** | 아무 정보 없을 때의 평균 예측(기준선). `예측 = base_value + Σ SHAP` |
| **`TreeExplainer`** | 트리 기반 모델(XGBoost 등) 전용 고속·정확 SHAP 계산기 |
| **`shap_values(X)`** | 입력 X 의 각 피처 SHAP 값을 계산. 여기선 `(1, 13)` ndarray |
| **`build_features(df)`** | (xgb_signal.py) OHLCV → 13개 피처 + 정답 표. 끝에 `dropna()` |
| **`FEATURE_COLS`** | (xgb_signal.py) 모델이 쓰는 13개 피처 이름·**순서**의 단일 기준 |
| **`load_model(ticker)`** | (xgb_signal.py) `xgb_{TICKER}.joblib` → `{"model", "features"}` dict, 없으면 None |
| **`bundle["model"]`** | 학습된 XGBClassifier 객체. SHAP 이 설명하는 대상 |
| **`iloc[[-1]]`** | 마지막 1행을 **DataFrame 모양 유지**로 추출(두 겹 대괄호) |
| **리스트 컴프리헨션** | `[식 for x in 목록]` — 목록을 돌며 새 리스트를 한 줄로 생성 |
| **`enumerate`** | 목록을 돌 때 (인덱스 i, 값) 쌍을 함께 주는 함수 |
| **`.get(key, default)`** | dict 조회 시 키가 없으면 default 반환(죽지 않는 안전 조회) |
| **graceful degradation** | 부가 기능(설명)이 불가하면 에러 대신 조용히 생략하고 본업은 유지 |
| **XAI(설명가능 AI)** | 블랙박스 모델의 판단 근거를 사람이 이해하게 만드는 기술 분야 |
| **익일** | 다음 날 — 모델이 예측하는 대상 시점(`as_of` 의 하루 뒤) |
