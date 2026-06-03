# Alpha-Helix 퀀트 엔진 아키텍처 가이드
## QuantStart / QuantConnect 기반 설계 원리 (readme_quant.md)

> **대상 독자**: Alpha-Helix 개발팀. 퀀트 트레이딩 이론과 코드베이스 구조를 연결하는 기술 참조 문서.

---

## 1. 설계 철학

Alpha-Helix 퀀트 엔진은 두 가지 오픈소스 프레임워크의 핵심 원리를 결합한다.

| 원천 | 기여 |
|---|---|
| **QuantStart** | 통계 강건성 검증 방법론 (Walk-Forward, 과적합 측정, 베이지안 HMM) |
| **QuantConnect LEAN** | 이벤트 드리븐 실행 구조 (`QCAlgorithm`, Schedule, Rebalance) |

### 핵심 원칙

1. **강건성 우선**: 높은 IS 성과보다 낮은 IS-OOS 갭이 더 중요
2. **레짐 인식**: 하나의 파라미터 세트가 모든 국면에 통하지 않음
3. **리스크 비대칭**: 손실을 피하는 것이 수익을 얻는 것보다 우선
4. **설명 가능성**: 모든 포지션 결정에 자연어 근거 제공

---

## 2. 핵심 엔진 설명

### 2-1. HMM (Hidden Markov Model) — 시장 국면 탐지

**원리**

시장은 관측 가능한 수익률 시퀀스 뒤에 숨은(hidden) 상태(regime)를 가진다.
HMM은 이 숨은 상태를 확률적으로 추론한다.

```
관측:  r_1, r_2, ..., r_T  (일별 수익률)
숨은:  s_1, s_2, ..., s_T  (bull_quiet / bull_volatile / bear / crisis)

목표: P(s_t | r_1...r_T) 추정
```

**Baum-Welch EM 알고리즘 (3단계)**

```
E-step (기댓값):
  γ_t(k) = P(s_t=k | 관측 전체)  ← Forward-Backward 알고리즘
  ξ_t(i,j) = P(s_t=i, s_{t+1}=j | 관측 전체)  ← 전이 기댓값

M-step (최대화):
  μ_k  = Σ_t γ_t(k)·r_t / Σ_t γ_t(k)    ← 상태별 평균 수익률
  σ_k² = Σ_t γ_t(k)·(r_t-μ_k)² / Σ_t γ_t(k)  ← 상태별 분산
  A_ij  = Σ_t ξ_t(i,j) / Σ_t γ_t(i)     ← 전이행렬

수렴 기준: |LL_t - LL_{t-1}| < 1e-4
```

**Viterbi 알고리즘 — 최적 상태 경로**

```
δ_t(k) = max_{s_1...s_{t-1}} P(s_1...s_{t-1}, s_t=k, r_1...r_t)

점화식:
  δ_t(k) = max_i [δ_{t-1}(i) · A_ik] · b_k(r_t)

Back-tracking으로 최적 경로 복원
```

**구현 위치**: `analytics/strategy/helpers.py` → `BayesianRegimeDetector`

---

### 2-2. GARCH(1,1) — 변동성 클러스터링

**원리**

금융 시계열에서 큰 변동성은 큰 변동성을 유발하는 '변동성 클러스터링' 현상이 있다.
GARCH(1,1)은 조건부 분산을 시간에 따라 모델링한다.

$$
\sigma_t^2 = \omega + \alpha \cdot \varepsilon_{t-1}^2 + \beta \cdot \sigma_{t-1}^2
$$

| 파라미터 | 역할 | Alpha-Helix 기본값 |
|---|---|---|
| $\omega$ | 장기 분산 = $\bar{\sigma}^2(1-\alpha-\beta)$ | 자동 계산 |
| $\alpha$ | 충격 반응 계수 (ARCH 효과) | 0.10 |
| $\beta$ | 분산 지속성 계수 | 0.85 |
| $\alpha + \beta$ | 총 지속성 (< 1 이어야 정상성) | 0.95 |

**레버리지 ETF 변동성 감쇠 (Volatility Decay)**

3x ETF는 단순히 3배 수익을 내지 않는다. 매일 3배 복리 구조로 인한 경로의존성 비용이 발생한다:

$$
\mu_{\text{ETF}} = 3\mu_{\text{기초}} - \frac{1}{2} \cdot 3^2 \cdot \sigma^2
$$

- 변동성 감쇠항 $\frac{9}{2}\sigma^2$는 TQQQ가 장기적으로 QQQ의 3배보다 낮은 수익을 내는 이유
- 이 효과는 `FatTailSynthesizer.generate_single(leverage=3.0)` 에서 시뮬레이션됨

**구현 위치**: `analytics/strategy/helpers.py` → `FatTailSynthesizer`

---

### 2-3. Student-t 분포 (Fat-tail 모델링)

**원리**

실제 주식 수익률 분포의 첨도(kurtosis)는 정규분포(K=3)보다 높다.
→ 극단 손실이 정규분포 예측보다 훨씬 자주 발생 (블랙스완)

$$
f(x; \nu) = \frac{\Gamma\left(\frac{\nu+1}{2}\right)}{\sqrt{\nu\pi}\,\Gamma\left(\frac{\nu}{2}\right)}\left(1+\frac{x^2}{\nu}\right)^{-\frac{\nu+1}{2}}
$$

| 자유도 $\nu$ | 꼬리 두께 | 적용 |
|---|---|---|
| $\infty$ (정규) | 얇음 | VaR 과소추정 |
| 5 | 중간 | 일반 주식 |
| **4** | 두꺼움 | **TQQQ 합성 기본값** |
| 3 | 매우 두꺼움 | 극단 스트레스 테스트 |

---

### 2-4. Kelly Criterion — 최적 베팅 크기

**연속 Kelly 공식**

$$
f^* = \frac{\mu}{\sigma^2}
$$

| 기호 | 의미 |
|---|---|
| $f^*$ | 최적 자본 비중 (0 ~ 1) |
| $\mu$ | 일 평균 초과수익률 |
| $\sigma^2$ | 일 수익률 분산 |

**다중 에셋 Kelly (벡터 형태)**

$$
\mathbf{f}^* = \Sigma^{-1} \boldsymbol{\mu}
$$

TQQQ/SOXL처럼 고상관 에셋에서 $\Sigma$가 ill-conditioned → Ridge 정규화:

$$
\mathbf{f}^* = (\Sigma + \lambda I)^{-1} \boldsymbol{\mu}, \quad \lambda = 0.01
$$

**분수 켈리 적용 이유 (레버리지 ETF)**

풀 켈리(Full Kelly)는 이론적 최적이지만:
- 파라미터 추정 오차 → 실제 $f^*$ 과대추정
- 레버리지 ETF의 fat-tail → 파산 위험 증가
- 심리적 낙폭 허용 한도 초과

```
분수 켈리 선택 기준:
  0.25x (Alpha-Helix 기본) : 레버리지 ETF + 짧은 히스토리
  0.50x                    : 일반 전략, ≥2년 OOS 검증
  1.00x                    : 실증된 엣지, ≥5년 트랙레코드
```

**구현 위치**: `analytics/strategy/risk_control.py` → `KellyPositionSizer`

---

### 2-5. Risk Parity (리스크 패리티)

**원리**

전통적 균등비중(50:50)은 수익 배분을 동일하게 하지만,
고변동성 에셋이 리스크를 지배한다. 리스크 패리티는 각 에셋의 **리스크 기여도**를 균등화한다.

**리스크 기여도 (Risk Contribution)**

$$
RC_i = w_i \cdot (\Sigma \mathbf{w})_i / \sqrt{\mathbf{w}^T \Sigma \mathbf{w}}
$$

**최적화 목적함수**

$$
\min_{\mathbf{w}} \sum_{i=1}^{N} \left(RC_i - \frac{1}{N}\right)^2
$$

**TQQQ-SOXL 예시**

```
TQQQ 연변동성: 70%  |  SOXL 연변동성: 85%

균등비중 (50:50):
  TQQQ 리스크 기여 42% vs SOXL 리스크 기여 58% → 불균형

리스크 패리티 최적 비중:
  TQQQ ≈ 55% vs SOXL ≈ 45% → 균등 리스크 기여
```

**구현 위치**: `analytics/strategy/risk_control.py` → `RiskBudgetAllocator`

---

### 2-6. Walk-Forward Validation (워크포워드 검증)

**원리**

단순 인-샘플 최적화는 과적합을 감지하지 못한다.
워크포워드는 실제 트레이딩과 동일한 시간적 순서를 유지하며 검증한다.

```
앵커드(Anchored) 방식:
  IS: [━━━━━━━━━━━━]  OOS: [━━━]
  IS: [━━━━━━━━━━━━━━━━]  OOS: [━━━]
  IS: [━━━━━━━━━━━━━━━━━━━━]  OOS: [━━━]

롤링(Rolling) 방식:
  IS: [━━━━━━━━━━━━]  OOS: [━━━]
       ↓ 슬라이드
       IS: [━━━━━━━━━━━━]  OOS: [━━━]
```

**과적합 지수**

$$
\text{Overfit Index} = \frac{\text{IS Sharpe} - \text{OOS Sharpe}}{|\text{IS Sharpe}|} \times 100\%
$$

- < 20%: 우수 (과적합 없음)
- 20~50%: 주의
- > 50%: 과적합 의심 → Trust Score 페널티 발동

**Deflated Sharpe Ratio (DSR)**

N개의 파라미터 세트를 시험할 때, 최고 IS Sharpe는 우연히 높을 수 있다.
DSR은 다중 테스트 편향을 보정한다:

$$
\text{DSR} = \Phi\left(\frac{\text{SR} - E[\max \text{SR}]}{\sigma[\text{SR}]}\right)
$$

**구현 위치**: `analytics/strategy/helpers.py` → `WalkForwardValidator`, `OverfitPenaltyEstimator`

---

### 2-7. LEAN QCAlgorithm 구조 (QuantConnect)

**이벤트 드리븐 아키텍처**

```
Initialize()        → 에셋 등록, 스케줄 설정, 지표 초기화
      ↓
OnData(Slice)       → 매 바마다 호출 (1분봉/일봉)
      ↓
OnEndOfDay()        → 일일 마감 이벤트
      ↓
Rebalance()         → 스케줄 이벤트 (주간/월간)
      ↓
OnOrderEvent()      → 주문 체결 이벤트
```

**Alpha-Helix 매핑**

| LEAN | Alpha-Helix 구현 |
|---|---|
| `QCAlgorithm` | `TQQQSOXLMomentumAlgorithm` |
| `AddEquity()` | `Initialize()` 내 티커 등록 |
| `SetHoldings()` | `OnData()` → `target_weights` 반환 |
| `Schedule.On()` | `Rebalance()` 주간 호출 |
| `RiskManagementModel` | `DrawdownCircuitBreaker` |
| `AlphaModel` | `ConfidenceScoringSystem` |
| `PortfolioConstructionModel` | `RiskBudgetAllocator` |

**구현 위치**: `analytics/strategy/main.py` → `TQQQSOXLMomentumAlgorithm`

---

### 2-8. vectorbt — 고속 백테스팅

**원리**

pandas 루프 기반 백테스트는 느리다. vectorbt는 numpy 브로드캐스팅으로 전체 신호 행렬을 한 번에 연산한다.

```python
# 기존 방식 (루프)
for i in range(len(prices)):
    if signal[i] > 0:
        portfolio_value[i] = portfolio_value[i-1] * (1 + returns[i])

# vectorbt 방식 (행렬 연산)
pf = vbt.Portfolio.from_signals(
    close,          # T × N 행렬
    entries=entries,  # T × N 불린 행렬
    exits=exits,
    size=0.5,       # 비중
    fees=0.001,
)
stats = pf.stats()  # 한 줄로 모든 통계
```

**성능 비교** (1년 일봉, 2종목)

| 방법 | 실행 시간 |
|---|---|
| pandas 루프 | ~800ms |
| vectorbt | ~8ms (100배 빠름) |
| Monte Carlo 1000경로 | ~80ms |

**구현 위치**: `analytics/strategy/main.py` → `vectorbt_bridge()`

---

## 3. 무한매수(DCA) 전략 상세

### 개념

무한매수법은 레버리지 ETF의 변동성을 활용해 하락 시 분할매수, 상승 시 분할익절하는 전략.

```
초기 진입: 10% (1/5 포지션)

가격 하락 -7%마다 추가매수:
  → 2차 진입: +10% (누적 20%)
  → 3차 진입: +10% (누적 30%)
  → 4차 진입: +10% (누적 40%)
  → 5차 진입: +10% (누적 50%)

익절:
  → 평단가 +15%: 보유 포지션의 50% 청산
  → 평단가 +30%: 나머지 전량 청산

중단 조건:
  → 레짐 bear/crisis: 추가매수 중지, 기존 포지션 청산
  → 서킷브레이커 HALT: 전량 청산
```

### 레짐 필터 효과

```
레짐 없는 무한매수:
  2022년 TQQQ -79% 하락 시 → 평단가 10배 악화 → 실질 손실 90%+

레짐 필터 적용:
  HMM이 bear 감지 (2022.01~) → 포지션 0 → 손실 최소화
  bull_quiet 재진입 (2023.01) → 저점 분할매수 재시작
```

### 파라미터 가이드

| 파라미터 | 기본값 | 범위 | 설명 |
|---|---|---|---|
| `dca_splits` | 5 | 3~10 | 분할 횟수 |
| `dca_drop_trigger` | -7% | -5% ~ -15% | 추가매수 하락 트리거 |
| `take_profit_1` | +15% | +10% ~ +25% | 1차 익절 수익률 |
| `take_profit_2` | +30% | +20% ~ +50% | 2차 익절 수익률 |
| `max_weight_per_leg` | 50% | 20% ~ 70% | 단일 에셋 최대 비중 |

---

## 4. 로컬 실행 방법

### 환경 설정

```bash
# 1. Python 패키지 설치
cd c:\Team2_AlphaHelix
pip install -r analytics/requirements.txt
# 추가 필요 패키지
pip install vectorbt scipy scikit-learn

# 2. 단독 테스트 실행
python analytics/strategy/helpers.py
python analytics/strategy/risk_control.py
python analytics/strategy/main.py

# 3. FastAPI 서버 실행 (analytics 서비스)
cd analytics
uvicorn app.main:app --port 8001 --reload
```

### API 테스트

```bash
# 백테스트 실행
curl -X POST http://localhost:8001/backtest \
  -H "Content-Type: application/json" \
  -d '{"tickers":["TQQQ","SOXL"],"start_date":"2020-01-01","end_date":"2024-12-31"}'

# Trust Score 조회
curl http://localhost:8001/trust-score?ticker=TQQQ
```

---

## 5. 참고 자료

| 주제 | 출처 |
|---|---|
| Baum-Welch EM | Baum et al. (1970) "A Maximization Technique..." |
| Viterbi Algorithm | Viterbi (1967) "Error Bounds for Convolutional Codes" |
| Kelly Criterion | Kelly (1956) "A New Interpretation of Information Rate" |
| Deflated Sharpe Ratio | Bailey & Lopez de Prado (2016) |
| Risk Parity | Qian (2005) "Risk Parity Portfolios" |
| Volatility Decay | Lu (2009) "On the Performance of Leveraged ETFs" |
| QuantConnect LEAN | https://github.com/QuantConnect/Lean |
| vectorbt | https://vectorbt.dev |
| QuantStart 아티클 | https://www.quantstart.com |

---

*생성일: 2025 | Alpha-Helix Team 2*
