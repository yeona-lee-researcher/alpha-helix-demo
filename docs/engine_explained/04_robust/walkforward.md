# `robust/walkforward.py` — 워크포워드(과거로 훈련→미래로 검증) 완전 라인별 해설

> 원본: `analytics/app/robust/walkforward.py` (62줄)
> 표준 형식: `01_backtest/vbt_engine.md` 와 동일한 틀(📌→🧠→🗺→📖→⚠️→🚀→📚).
> 선행 학습 권장: `01_backtest/vbt_engine.md` (이 파일이 `run_backtest`, `BacktestParams` 를 그대로 빌려 씀).

---

## 📌 이 파일 한눈에

이 파일은 **"전략이 시간이 지나도 꾸준한가"를 검사하는 시험관**입니다. 가격 한 줄(`close`)을 받아서, 시계열을 여러 토막(폴드, fold)으로 잘라 **각 토막의 미래 구간에서만 백테스트**를 돌리고, 그 성적들을 모아 평균을 냅니다. 한 번의 전체 백테스트가 "10년 통째로 얼마 벌었나"라면, 워크포워드는 "분기마다 따로 채점했을 때 **들쭉날쭉하지 않고 일관되게** 벌었나"를 봅니다.

핵심 함수는 **단 1개**입니다(그 안에 작은 helper 1개 포함):

| 함수 | 한 줄 역할 | 비유 |
|---|---|---|
| `walk_forward(...)` | 가격을 `[건너뛰기 \| 검증]` 폴드로 슬라이딩하며 검증 구간만 백테스트 → 폴드별 성적 + 평균 요약 | 모의고사를 1회만 보지 않고, 범위를 옮겨가며 여러 번 보고 평균 점수를 냄 |
| `avg(key)` (내부 helper) | 유효한 폴드들의 한 지표(예: sharpe)를 평균 | 여러 모의고사 점수의 산술평균 |

**누가 호출하나?**
- `app/main.py` 의 **`POST /robust/walk-forward`** 엔드포인트 (`walk_forward_endpoint`, `app/main.py:241-249`) — 외부(백엔드)가 "이 종목 이 전략으로 워크포워드 돌려줘"라고 직접 요청.
- `app/robust/trust_score.py` (`trust_score.py:195`) — **Trust Score(종합 신뢰점수)** 계산의 한 재료. 여기서 폴드별 OOS Sharpe 의 평균·표준편차·t-통계량을 뽑아 "전략을 믿어도 되나"를 채점합니다.

**비유 한 줄:** 이 파일은 **"모의고사 범위를 미리 안 가르치고 시험 보기"** 입니다. 시험(검증 구간)에 나올 데이터를 훈련에 쓰지 않으니, "외워서 맞춘 게 아니라 진짜 실력인가"가 드러납니다. ⚠️ 단, 이 파일의 "훈련 구간"은 **실제로 가르치지 않고 그냥 건너뛰기만** 합니다 — 자세한 건 `⚠️ 함정` 절에서.

---

## 🧠 사전 지식 (이거 모르면 막힘)

#### 1) In-Sample(IS) vs Out-of-Sample(OOS) — 이 파일의 심장
- **In-Sample(표본 내)** = 전략을 만들거나 맞출 때 **본** 데이터. "시험 범위를 미리 본" 셈.
- **Out-of-Sample(표본 외)** = 전략이 **한 번도 안 본** 미래 데이터. "처음 보는 시험 문제".
- 좋은 전략은 IS 와 OOS 성적이 **비슷**합니다. IS 만 엄청 좋고 OOS 가 폭망하면 → **과적합(overfitting)**.
- 비유: 기출문제만 외운 학생은 기출(IS)은 100점, 새 문제(OOS)는 30점. 진짜 실력자는 둘 다 80점.

#### 2) 과적합(Overfitting) — 워크포워드가 잡으려는 적
- 전략 파라미터를 과거에 **너무 꼭 맞게** 다듬으면, 과거의 우연한 잡음까지 외워버립니다. 미래엔 그 잡음이 안 나오니 무너집니다.
- 워크포워드는 **"미래 구간을 미리 안 본 채로 채점"** 을 반복해, 이 무너짐을 사전에 들춰냅니다.

#### 3) 롤링 윈도우(Rolling Window) — "창문을 옆으로 민다"
- 전체 시계열 위에 **고정 크기 창문**(훈련창 + 검증창)을 얹고, 한 번 채점할 때마다 창문을 **검증창 크기만큼 오른쪽으로 민다**.
- 그래서 폴드들의 검증 구간이 **서로 겹치지 않고** 시간순으로 이어집니다(이 파일은 `start += test_window`).
- 비유: 긴 두루마리 그림을 손바닥만 한 창으로 들여다보며, 한 칸씩 옆으로 밀어 전체를 훑는 것.

#### 4) 폴드(Fold) = "한 번의 시험 한 토막"
- 시계열을 자른 한 조각. 이 파일에서 한 폴드 = `[train_window 만큼 건너뛰기] + [test_window 만큼 검증]`.
- `train_window=252`(거래일 ≈ 1년), `test_window=63`(거래일 ≈ 1분기)가 기본값.

#### 5) `pd.Series` 슬라이싱 복습 (vbt_engine 에서 배운 것)
- `close.iloc[a:b]` = a번째(포함)부터 b번째(제외)까지 **위치 기반** 잘라내기. 날짜축은 자동으로 따라옵니다.
- `close.index[0].date()` = 그 토막의 **첫 날짜**, `close.index[-1].date()` = **마지막 날짜**.

#### 6) Sharpe 지표 한 줄 복습
- **Sharpe** = 위험(변동성) 대비 수익 효율. 클수록 좋음. 이 파일은 폴드별 Sharpe 를 모아 "일관성"을 봅니다. 어떤 폴드는 Sharpe 2.0, 어떤 폴드는 -0.5 라면 → 전략이 **시기를 탄다**(불안정).

---

## 🗺 전체 흐름도

```
                 close (날짜별 종가 Series, 예: 10년치 ≈ 2520개)
                           │
                           ▼
        ┌────────────────────────────────────────────────────────┐
        │  while  start + train_window + test_window <= n         │  창문이 끝에 닿을 때까지 반복
        └────────────────────────────────────────────────────────┘
                           │
   ┌───────────────────────┼──────────────────────────────────────────────┐
   │ Fold 1                                                                │
   │   start=0                                                             │
   │   |◄── train_window=252 (건너뛰기/워밍업) ──►|◄── test=63 ──►|        │
   │   [           안 씀 (백테스트 안 함)           ][  run_backtest  ]     │ ← 검증 구간만 채점
   │                                                                       │
   │ Fold 2  (start += test_window = 63)                                   │
   │        |◄────────── 252 ──────────►|◄── 63 ──►|                       │
   │        [        안 씀              ][run_backtest]                    │
   │                                                                       │
   │ Fold 3  (start += 63) ...  창문을 test_window 만큼씩 오른쪽으로 슬라이딩 │
   └───────────────────────────────────────────────────────────────────────┘
                           │
                           ▼  folds = [ {fold, test_start, test_end, stats}, ... ]
                           │
                           ▼  valid = 에러 없고 sharpe!=None 인 폴드만 추림
                           ▼  avg(key): 유효 폴드들의 지표 평균
                           ▼
        summary = { n_folds, n_valid, avg_total_return_pct,
                    avg_sharpe, avg_max_drawdown_pct, avg_win_rate_pct }
                           │
                           ▼
        return {"folds": [...], "summary": {...}}  → main.py / trust_score.py
```

> 핵심 직관: **검증창(test)들은 시간순으로 이어지고 절대 안 겹친다.** 각 검증창은 그 직전 train_window 만큼의 구간을 "건너뛴" 자리에서 시작합니다.

---

## 📖 라인별 해설

### A. 파일 설명서(docstring) — 이 파일에서 가장 중요한 경고 — `L1-L9`

```python
# L1-L9
"""
Rolling out-of-sample (OOS) validation.

⚠️ 주의: 이름은 "walk-forward" 지만 파라미터 재최적화(re-optimization)는 하지 않는다.
`train_window` 는 각 폴드에서 건너뛰는 워밍업/오프셋 구간일 뿐이며, 실제 백테스트는
test 구간에만 동일한 고정 파라미터로 실행된다. 즉 "시간대별 OOS 일관성"을 측정하는
견고성 테스트이지, train 구간에서 파라미터를 새로 최적화하는 정통 워크포워드가 아니다.
(정통 워크포워드 재최적화는 향후 개선 항목.)
"""
```
- **무엇을 하나:** 파일 맨 위 설명서(docstring). 실행되지 않고 사람이 읽는 용도지만, 여기엔 **이 파일을 이해하는 열쇠**가 박혀 있습니다.
- **왜 이렇게 하나(가장 중요):** "정통(textbook) 워크포워드"는 **train 구간에서 파라미터를 새로 최적화**한 뒤, 그 최적 파라미터로 test 구간을 검증합니다. 그런데 이 구현은 그 **재최적화를 하지 않습니다.** `train_window` 는 "여기는 가르치는 구간"이 아니라 **"그냥 건너뛰는 구간(오프셋)"** 일 뿐입니다. 모든 폴드가 **똑같은 고정 파라미터**(`params`)로 돕니다.
- **그래서 실제로 측정하는 것은?** → **"같은 전략을 서로 다른 시간대에 적용했을 때 성적이 일관적인가"**(시간대별 OOS 일관성/견고성). 과적합을 직접 잡진 못해도, "전략이 특정 시기에만 먹혔는지"는 드러납니다.
- **초보가 헷갈리는 포인트:** 이름이 `walk_forward` 라 "훈련→검증을 반복하는 정통 워크포워드"로 오해하기 쉽습니다. **실제로는 "롤링 OOS 일관성 테스트"** 입니다. 이 한 가지만 정확히 알면 나머지는 쉽습니다.

---

### B. import — `L10-L14`

```python
# L10-L14
from __future__ import annotations
import numpy as np
import pandas as pd

from app.backtest.vbt_engine import BacktestParams, run_backtest
```
- `from __future__ import annotations` — 타입힌트를 "문자열처럼 늦게 평가"하게 해주는 파이썬 기능. 초보는 **"최신 타입표기를 안전하게 쓰기 위한 주문"** 정도로 이해하면 됩니다(vbt_engine 에서도 동일하게 등장).
- `numpy(np)` — 여기선 평균(`np.mean`) 한 가지에만 씁니다.
- `pandas(pd)` — 가격 Series 타입힌트와 슬라이싱에 사용.
- **마지막 줄이 핵심:** 이 파일은 백테스트를 **스스로 구현하지 않고**, `vbt_engine.py` 의 `run_backtest`(가상 매매 실행기)와 `BacktestParams`(파라미터 상자)를 **그대로 빌려 씁니다**. 즉 워크포워드는 "백테스트 위에 올라탄 한 단계 위 검증기"입니다.
- **왜 이렇게 하나:** 백테스트 로직을 한 곳(`vbt_engine`)에만 두면, 백테스트가 바뀌어도 워크포워드는 자동으로 같은 규칙을 따릅니다(중복 코드·불일치 방지). 그래서 vbt_engine 을 **먼저 읽어야** 이 파일이 완전히 이해됩니다.

---

### C. 함수 머리(시그니처) — `L17-L26`

```python
# L17-L26
def walk_forward(
    close: pd.Series,
    params: BacktestParams,
    train_window: int = 252,  # 1 year trading days
    test_window: int = 63,    # 1 quarter
) -> dict:
    """
    시리즈를 rolling [skip(train_window) | test] 폴드로 나누고 test 구간만 백테스트한다.
    train_window 는 재최적화가 아니라 단순 오프셋(워밍업)이다 — 모든 폴드가 동일 params 사용.
    """
```
- **입력 4개:**
  - `close` — 날짜별 종가 Series(검사할 가격 데이터 전체). 예: 야후 파이낸스 10년치.
  - `params` — `BacktestParams` 상자(어떤 전략·파라미터로 백테스트할지). **모든 폴드가 이 하나를 공유** — 재최적화 없음.
  - `train_window=252` — 각 폴드에서 **건너뛸** 거래일 수. 252 ≈ 1년(주식시장은 1년에 약 252일 개장).
  - `test_window=63` — 각 폴드에서 **검증할(=백테스트할)** 거래일 수. 63 ≈ 1분기(3개월 ≈ 63 거래일).
- **출력:** `dict` — `{"folds": [...], "summary": {...}}`. 폴드별 상세 + 평균 요약.
- **초보가 헷갈리는 포인트:** `252`, `63` 은 **달력 날짜가 아니라 "거래일(개장일) 개수"** 입니다. 주말·공휴일은 데이터에 없으니, 인덱스 위치 기준으로 세면 자동으로 거래일만 셉니다. 그래서 `train_window=252` 가 "약 1년"이 되는 것(`# 1 year trading days` 주석의 뜻).
- **왜 함수에 docstring 을 또 두나:** 파일 docstring(전체 정책)과 별개로, 함수 docstring 은 "이 함수가 무엇을 받아 무엇을 하는지"를 호출하는 사람이 바로 보게 합니다. 두 곳 모두 **"재최적화 아님"** 을 반복 강조 — 그만큼 오해를 막고 싶은 것.

---

### D. 초기화 — `L27-L29`

```python
# L27-L29
    n = len(close)
    folds = []
    start = 0
```
- **무엇을 하나:** 반복(while 루프)에 쓸 변수 3개를 준비.
  - `n = len(close)` — 전체 데이터 길이(거래일 수). 예: 10년치면 약 2520.
  - `folds = []` — 폴드 결과를 차곡차곡 담을 빈 리스트.
  - `start = 0` — 첫 폴드의 시작 위치(맨 앞부터).
- **왜 이렇게 하나:** `start` 를 루프 안에서 `test_window` 만큼 늘려가며 창문을 옆으로 밀 것입니다. `n` 은 "창문이 끝에 닿았는지" 판정 기준.
- **초보 포인트:** `start` 는 **날짜가 아니라 위치(정수 인덱스)** 입니다. `close.iloc[start:...]` 처럼 위치 기반 슬라이싱에 씁니다.

---

### E. 메인 루프 — 폴드를 하나씩 만든다 — `L30-L42`

```python
# L30-L42
    while start + train_window + test_window <= n:
        test_slice = close.iloc[start + train_window: start + train_window + test_window]
        try:
            res = run_backtest(test_slice, params)["stats"]
        except Exception as e:
            res = {"error": str(e)}
        folds.append({
            "fold": len(folds) + 1,
            "test_start": str(test_slice.index[0].date()),
            "test_end": str(test_slice.index[-1].date()),
            "stats": res,
        })
        start += test_window
```

이 블록이 파일의 알맹이입니다. 한 줄씩 풉니다.

#### E-1) 루프 조건 — `L30`
```python
    while start + train_window + test_window <= n:
```
- **무엇을:** "지금 위치(`start`)에서 **훈련창 + 검증창**이 데이터 끝(`n`)을 넘지 않을 때만" 폴드를 만든다.
- **왜:** 데이터가 모자라면(창문이 두루마리 밖으로 삐져나가면) 검증 구간을 온전히 못 채웁니다. 그런 불완전한 마지막 토막은 **아예 만들지 않습니다**(잘림 방지).
- **예시 수치:** `n=2520, train=252, test=63` 이면 마지막으로 가능한 `start` 는 `2520 - 315 = 2205`. `start` 가 0, 63, 126, ... 으로 늘다가 2205 를 넘으면 루프 종료.
- **초보 포인트:** 조건이 **`<= n`** 인 이유 — 슬라이싱 끝 인덱스는 "제외"라서, `start+train+test == n` 이면 정확히 마지막 칸까지 딱 맞게 씁니다(off-by-one 안전).

#### E-2) 검증 구간 잘라내기 — `L31`
```python
        test_slice = close.iloc[start + train_window: start + train_window + test_window]
```
- **무엇을:** 전체 가격에서 **이번 폴드의 검증(test) 구간만** 잘라냅니다.
- **시작점이 `start + train_window` 인 이유(중요):** `start` 부터 `train_window` 만큼은 **건너뜁니다**(여기가 docstring 이 말한 "오프셋/워밍업"). 그 다음 칸부터 `test_window` 개만 검증 구간으로 씁니다.
- **그림으로:**
  ```
  위치:  start ───────────► start+train ───────────► start+train+test
         |◄── train_window(건너뜀, 252) ──►|◄── test_window(검증, 63) ──►|
         [        run_backtest 안 함        ][      run_backtest 함      ]
                                            └──────── test_slice ───────┘
  ```
- **헷갈리는 포인트:** train 구간을 **잘라서 어딘가에 쓰지 않습니다.** 그냥 인덱스를 건너뛸 뿐 — 변수로도 안 담습니다. "재최적화 없음"이 코드로 이렇게 나타납니다. (정통 워크포워드라면 여기서 `train_slice` 를 잘라 파라미터를 다시 최적화했을 자리.)

#### E-3) 검증 구간만 백테스트 (예외 안전) — `L32-L35`
```python
        try:
            res = run_backtest(test_slice, params)["stats"]
        except Exception as e:
            res = {"error": str(e)}
```
- **무엇을:** `vbt_engine.run_backtest` 를 **검증 구간(`test_slice`)에만** 돌리고, 결과에서 `["stats"]`(성적표: total_return·sharpe·max_drawdown·win_rate 등)만 꺼냅니다.
- **`params` 를 그대로 넘기는 점:** 모든 폴드가 같은 전략·파라미터 — **재최적화 없음**을 여기서 또 확인할 수 있습니다.
- **`try/except` 가 왜 필요한가:** 검증 구간이 63일밖에 안 되면, 예컨대 SMA 60일선 전략은 데이터가 거의 모자라거나, 어떤 폴드에선 거래가 0건이라 vectorbt 내부에서 예외가 날 수 있습니다. **한 폴드가 터져도 전체가 멈추지 않게**, 에러를 잡아 `{"error": "..."}` 로 기록만 하고 다음 폴드로 넘어갑니다.
- **초보 포인트:** `run_backtest(...)["stats"]` 는 vbt_engine 이 돌려주는 큰 dict 에서 성적표 부분만 집는 것. 나머지(equity_curve 등)는 워크포워드엔 필요 없어 버립니다.
- **함정 주의:** `train_window` 만큼 건너뛰었지만, vbt_engine 의 `_signals` 는 **그 검증 구간 안에서 다시 처음부터** 이동평균·RSI 등을 계산합니다(앞선 train 데이터를 워밍업으로 물려주지 않음). 그래서 검증 구간 초반은 지표가 NaN 이라 거래가 늦게 시작될 수 있습니다 — 자세한 건 `⚠️ 함정` 절.

#### E-4) 폴드 결과 기록 — `L36-L41`
```python
        folds.append({
            "fold": len(folds) + 1,
            "test_start": str(test_slice.index[0].date()),
            "test_end": str(test_slice.index[-1].date()),
            "stats": res,
        })
```
- **무엇을:** 이번 폴드의 결과를 dict 하나로 묶어 `folds` 리스트에 추가.
  - `"fold": len(folds) + 1` — **폴드 번호(1부터)**. 아직 추가 전이라 현재 길이 + 1 이 이번 번호(0개면 1번, 1개면 2번...). 깔끔한 1-based 번호 매기기 관용 패턴.
  - `"test_start"` / `"test_end"` — 검증 구간의 **첫/마지막 날짜**(사람이 읽을 문자열 `YYYY-MM-DD`). `.index[0]`/`.index[-1]` 로 양 끝 날짜를 뽑아 `.date()` → `str()`.
  - `"stats": res` — 위에서 만든 성적표(또는 에러 dict).
- **왜 날짜를 같이 저장하나:** 프론트/리포트에서 "2021-03-01 ~ 2021-05-28 분기엔 Sharpe 1.8, 다음 분기엔 -0.3" 식으로 **시간대별 성과를 보여주기** 위해. 일관성 판단의 근거가 됩니다.
- **초보 포인트:** `str(...date())` 를 쓰는 이유 — pandas Timestamp 를 그냥 JSON 으로 보내면 깨질 수 있어, 미리 사람이 읽는 문자열로 바꿔 안전하게 직렬화합니다(vbt_engine 의 `str(close.index[0].date())` 와 동일한 관습).

#### E-5) 창문 옆으로 밀기 — `L42`
```python
        start += test_window
```
- **무엇을:** 다음 폴드를 위해 시작 위치를 **`test_window` 만큼** 오른쪽으로 민다.
- **왜 `train_window` 가 아니라 `test_window` 만큼?** → 이렇게 해야 **검증 구간들이 빈틈없이 이어지고 서로 안 겹칩니다.** 폴드1 검증 = [252:315], 폴드2 검증 = [315:378], ... 처럼 63칸씩 연달아 붙습니다.
  ```
  fold1 test:        [252 ─ 315)
  fold2 test:               [315 ─ 378)
  fold3 test:                      [378 ─ 441)   ← 검증창이 차곡차곡 이어짐(겹침 X)
  ```
- **초보가 빠지기 쉬운 함정:** "창문을 train+test 만큼 밀어야 하지 않나?"라고 생각하기 쉽지만, 그러면 검증 구간 사이에 `train_window` 만큼 **공백(채점 안 하는 빈 구간)** 이 생겨 데이터를 낭비합니다. `test_window` 만큼만 밀면, train 구간이 다음 폴드의 검증 구간과 자연스럽게 겹쳐 **모든 검증 구간이 시간축을 빠짐없이 덮습니다.**

> 💡 핵심 직관 정리: 이 루프는 **"검증창을 63칸씩 옆으로 미는 슬라이딩 채점"** 입니다. 각 채점 직전 252칸은 건너뛰고(쓰지 않고), 그 다음 63칸만 백테스트합니다.

---

### F. 유효 폴드만 추리기 — `L44-L47`

```python
# L44-L47
    # Aggregate
    valid = [f["stats"] for f in folds if "error" not in f["stats"] and f["stats"].get("sharpe") is not None]
    if not valid:
        return {"folds": folds, "summary": None}
```
- **무엇을:** 만든 폴드들 중 **쓸 만한 것만** 골라 `valid` 리스트로. 조건 2가지:
  1. `"error" not in f["stats"]` — 백테스트가 예외로 터지지 않았다(`{"error": ...}` 가 아니다).
  2. `f["stats"].get("sharpe") is not None` — Sharpe 가 실제 숫자다(`None` 아님).
- **왜 sharpe 로 거르나:** vbt_engine 의 `_f()` 헬퍼는 NaN/Inf 를 `None` 으로 바꿉니다. 거래가 너무 적거나 변동성이 0이면 Sharpe 가 `None` 이 됩니다. 그런 폴드는 평균에 넣으면 **결과를 망치므로** 통째로 제외합니다.
- **`if not valid` 가드:** 유효 폴드가 **하나도 없으면**(데이터가 너무 짧거나 전부 에러), 평균을 낼 수 없으니 `summary: None` 으로 돌려줍니다. 폴드 상세(`folds`)는 그대로 줘서 호출자가 무슨 일이 있었는지 볼 수 있게 합니다.
- **초보 포인트:** 리스트 컴프리헨션 `[f["stats"] for f in folds if 조건]` = "folds 의 각 f 중 조건을 만족하는 것의 stats 만 모아 새 리스트". `valid` 는 dict(성적표)들의 리스트입니다(폴드 dict 가 아니라 그 안의 stats).
- **헷갈리는 포인트:** `f["stats"].get("sharpe")` 에서 `.get` 을 쓰는 이유 — 에러 폴드는 `stats` 가 `{"error": ...}` 라 `"sharpe"` 키가 없습니다. `[...]` 로 직접 접근하면 KeyError, `.get(...)` 은 없으면 안전하게 `None` 반환. (단 앞 조건 `"error" not in ...` 이 먼저 걸러주지만, 방어적으로 `.get` 사용.)

---

### G. 평균 계산 helper `avg(key)` — `L49-L51`

```python
# L49-L51
    def avg(key):
        vals = [s[key] for s in valid if s.get(key) is not None]
        return round(float(np.mean(vals)), 4) if vals else None
```
- **무엇을:** 함수 안의 작은 helper. `valid` 폴드들에서 지정한 지표(`key`, 예 `"sharpe"`)의 값만 모아 **평균**을 냅니다.
- **한 줄씩:**
  - `vals = [s[key] for s in valid if s.get(key) is not None]` — 유효 폴드들의 그 지표 값 중 **None 이 아닌 것만** 모음. (예: 어떤 폴드는 sharpe 는 있어도 win_rate 가 None 일 수 있어, 지표마다 다시 None 을 거름.)
  - `round(float(np.mean(vals)), 4)` — 평균을 내고 소수 4자리로 반올림(JSON 깔끔하게).
  - `if vals else None` — 모을 값이 하나도 없으면 평균 대신 `None`(0으로 나누기/빈 배열 평균 에러 방지).
- **왜 helper 로 빼나:** 아래에서 total_return·sharpe·max_drawdown·win_rate **4개 지표**에 같은 평균 로직을 반복 적용해야 합니다. helper 하나로 묶으면 `avg("sharpe")`, `avg("total_return_pct")` 처럼 한 줄로 끝 — 중복 제거.
- **초보 포인트:** `def` 안에 또 `def` (중첩 함수). `avg` 는 바깥 `walk_forward` 의 지역 변수 `valid` 를 **그대로 읽을 수 있습니다**(클로저). 그래서 `valid` 를 인자로 안 넘겨도 됩니다.
- **함정 주의:** `np.mean(vals)` 의 결과는 numpy 타입(`np.float64`)이라, `float(...)` 로 **파이썬 기본 float** 로 바꿔야 JSON 직렬화가 안전합니다(vbt_engine 의 `_f` 와 같은 이유).

---

### H. 요약 묶기 + 반환 — `L53-L61`

```python
# L53-L61
    summary = {
        "n_folds": len(folds),
        "n_valid": len(valid),
        "avg_total_return_pct": avg("total_return_pct"),
        "avg_sharpe": avg("sharpe"),
        "avg_max_drawdown_pct": avg("max_drawdown_pct"),
        "avg_win_rate_pct": avg("win_rate_pct"),
    }
    return {"folds": folds, "summary": summary}
```
- **무엇을:** 전체 결과를 한눈에 보는 `summary` dict 를 만들고, 폴드 상세와 함께 반환.
  - `"n_folds"` — **만든 폴드 총 개수**(에러 포함 전부).
  - `"n_valid"` — 그중 **평균에 실제로 쓴** 유효 폴드 수. `n_valid` 가 `n_folds` 보다 많이 작으면 → "상당수 폴드가 실패/무거래" → 전략이 불안정하다는 신호.
  - `"avg_total_return_pct"` — 폴드별 총수익률의 평균. "분기마다 평균 몇 % 벌었나".
  - `"avg_sharpe"` — 폴드별 Sharpe 평균. **OOS 일관성의 대표 지표**. (Trust Score 는 여기에 더해 표준편차·t-stat 까지 봄.)
  - `"avg_max_drawdown_pct"` — 폴드별 최대낙폭 평균(음수 %). "보통 한 분기에 최대 얼마까지 까였나".
  - `"avg_win_rate_pct"` — 폴드별 승률 평균.
- **왜 `folds` 와 `summary` 를 둘 다 주나:** `summary` 는 "한 줄 평가"(평균), `folds` 는 "근거"(시간대별 상세). 호출자가 평균만 쓸 수도, 폴드별로 그래프를 그릴 수도 있게 **둘 다** 제공.
- **이 값들이 어디로 가나:**
  - `POST /robust/walk-forward` → 그대로 JSON 응답 → 백엔드/프론트가 표·차트로 표시.
  - `trust_score.py` → `wf["folds"]` 에서 폴드별 OOS Sharpe 를 다시 꺼내 **평균·표준편차·t-통계량**을 계산하고, "OOS 일관성" 점수로 Trust Score(0~100)에 반영(`trust_score.py:195-208`).
- **초보 포인트:** `summary` 의 평균값들은 `avg()` 가 `None` 을 줄 수도 있습니다(해당 지표가 전부 None 이면). 호출자는 항상 None 가능성을 염두에 둬야 합니다.

---

## ⚠️ 함정·버그 주의 (코드에 박힌 교훈 모음)

1. **이름이 "walk-forward" 지만 정통 워크포워드가 아님 (가장 중요).** `train_window` 는 **재최적화 구간이 아니라 단순 건너뛰기(오프셋)** 입니다. 모든 폴드가 **동일 고정 파라미터**로 돕니다. 따라서 이 테스트는 "파라미터 과적합"을 직접 잡지 못하고, **"시간대별 OOS 성과 일관성"** 만 측정합니다. docstring(`L4-L8`)이 이 점을 두 번 강조합니다.

2. **검증 구간 안에서 지표가 다시 0부터 계산됨 (워밍업 단절).** `run_backtest(test_slice, ...)` 에 넘기는 건 **63일짜리 토막뿐**입니다. 직전 `train_window` 데이터를 지표 워밍업으로 물려주지 않으므로, vbt_engine 의 `_signals` 는 검증 구간 **첫날부터 다시** 이동평균·RSI 를 계산합니다. 그 결과:
   - SMA 60일선 같은 **장기 지표는 63일 검증창에서 거의 또는 전혀 거래를 못 합니다**(워밍업에 다 까먹음) → 그 폴드는 Sharpe=None → 제외 → `n_valid` 가 작아짐.
   - 즉 `train_window` 를 "지표 워밍업"으로 의도했다면, 실제로는 그 효과가 없습니다(잘린 토막만 넘기므로).

3. **검증창이 너무 짧으면 폴드가 무의미해질 수 있음.** `test_window=63`(1분기)은 거래가 몇 건 안 나올 수 있어 Sharpe·승률이 불안정합니다. 그래서 많은 폴드가 `valid` 에서 탈락할 수 있습니다(`n_valid` 확인 필수).

4. **마지막 자투리 구간은 버려짐.** `while ... <= n` 조건 때문에, 데이터 끝의 `test_window` 보다 짧은 잔여 구간은 폴드로 만들지 않습니다(불완전 검증 방지). 최신 데이터 일부가 검증에서 빠질 수 있음을 인지할 것.

5. **한 폴드의 예외가 전체를 멈추지 않음(의도된 안전장치).** `try/except` 가 폴드 단위로 감싸여 있어, 일부 폴드가 터져도 나머지는 계속됩니다. 단, 에러가 조용히 `{"error": ...}` 로만 남으므로, **`n_folds` vs `n_valid` 격차**를 꼭 확인해야 "사실은 대부분 실패했는데 평균만 그럴듯한" 함정을 피합니다.

6. **numpy 타입 → JSON 함정.** `np.mean` 결과는 `np.float64` 라 그대로 JSON 에 넣으면 문제가 될 수 있어 `float(...)` 로 변환합니다(helper `avg` 의 `float(np.mean(...))`).

---

## 🚀 고도화 아이디어 (강의·개선 버전용)

- **정통 워크포워드(재최적화) 추가 — 1순위.** 현재 건너뛰는 `train_window` 구간을 실제로 잘라(`train_slice`), 그 안에서 **파라미터를 최적화**(예: SMA 기간 그리드 서치로 train 구간 Sharpe 최대화)한 뒤, **그 최적 파라미터로 test 구간을 검증**하도록 바꾸면 진짜 워크포워드가 됩니다. 이때 IS(train) 성적과 OOS(test) 성적의 **격차(degradation)** 가 곧 과적합 지표.
- **앵커드(anchored) vs 롤링(rolling) 선택.** 현재는 **롤링**(훈련 시작점이 매 폴드 오른쪽으로 이동, 창 크기 고정). **앵커드**는 시작점을 0에 고정하고 훈련창을 점점 늘립니다(`close.iloc[0 : start+train_window]`). 데이터를 더 많이 쓰는 대신, 먼 과거의 낡은 패턴까지 끌고 가는 단점. 인자 `mode="rolling"|"anchored"` 로 선택권을 주면 강의·실험에 좋습니다.
  ```
  롤링(현재):   [─train─][test]      →   고정폭 창이 옆으로 슬라이딩
                     [─train─][test]
  앵커드:       [──train──][test]    →   시작점 고정, 훈련창이 점점 길어짐
                [────train────][test]
  ```
- **지표 워밍업 연결 수정.** test 구간만 넘기지 말고, **직전 `train_window` 의 꼬리 일부를 함께 넘긴 뒤** 검증 구간 신호만 잘라 쓰면, SMA60 같은 장기 지표도 검증창 첫날부터 정상 작동합니다(현재의 "워밍업 단절" 함정 해결).
- **OOS 견고성 통계 강화.** 지금 summary 는 단순 평균만. 폴드별 Sharpe 의 **표준편차·최솟값·양(+)폴드 비율·t-통계량**을 추가하면 "평균은 좋은데 들쭉날쭉한" 전략을 잡아냅니다(이미 `trust_score.py` 가 일부 수행 — 이를 이 파일 summary 로 끌어올리기).
- **겹치는 검증창(stride 조절).** 지금은 `start += test_window`(겹침 없음). `start += stride`(stride < test_window)로 바꾸면 폴드 수가 늘어 통계가 안정되지만, 검증창이 겹쳐 독립성이 약해지는 트레이드오프.
- **에러 가시화.** `n_folds` vs `n_valid` 격차가 크면 summary 에 **경고 플래그**를 넣어, 호출자가 "이 평균은 신뢰도가 낮다"를 바로 알게.

---

## 📚 용어 사전 (이 파일 한정)

| 용어 | 뜻 |
|---|---|
| **In-Sample (IS, 표본 내)** | 전략을 만들/맞출 때 본 데이터. "시험 범위를 미리 본" 구간 |
| **Out-of-Sample (OOS, 표본 외)** | 전략이 한 번도 안 본 미래 데이터로 채점. "처음 보는 문제" |
| **과적합(Overfitting)** | 과거 잡음까지 외워 IS 는 좋지만 OOS 는 무너지는 현상 |
| **워크포워드(Walk-Forward)** | (정통) train 구간에서 재최적화 → 바로 다음 test 구간에서 검증을 반복. **이 파일은 재최적화 없는 "롤링 OOS 일관성" 버전** |
| **롤링 윈도우(Rolling Window)** | 고정 크기 창을 시계열 위에서 옆으로 미는 방식 |
| **앵커드 윈도우(Anchored)** | 시작점을 고정하고 훈련창을 점점 늘리는 방식(고도화 아이디어) |
| **폴드(Fold)** | 시계열을 자른 한 토막 = `[train_window 건너뛰기] + [test_window 검증]` |
| **`train_window`** | 각 폴드에서 **건너뛰는** 거래일 수(기본 252 ≈ 1년). ⚠️ 재최적화 아님 |
| **`test_window`** | 각 폴드에서 **백테스트하는** 검증 거래일 수(기본 63 ≈ 1분기) |
| **거래일(trading day)** | 시장 개장일. 주말·공휴일 제외라 1년 ≈ 252일 |
| **`run_backtest` / `BacktestParams`** | vbt_engine 에서 빌려온 백테스트 실행기 / 파라미터 상자 |
| **`stats`** | 한 백테스트의 성적표(total_return·sharpe·max_drawdown·win_rate 등) |
| **`valid` 폴드** | 에러 없고 sharpe 가 None 이 아닌, 평균에 쓸 수 있는 폴드 |
| **클로저(closure)** | 중첩 함수(`avg`)가 바깥 함수의 변수(`valid`)를 그대로 읽는 것 |
| **Sharpe** | 위험 대비 수익 효율(클수록 좋음). 폴드별로 모아 일관성 측정 |
| **Trust Score** | 이 워크포워드 결과(OOS Sharpe 평균·분산 등)를 재료로 쓰는 0~100 종합 신뢰점수 |
