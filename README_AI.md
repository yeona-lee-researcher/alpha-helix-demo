# Alpha-Helix 듀얼 모드 AI 코파일럿 엔진
## 강건성 파이프라인 기술 문서 (README_AI.md)

> **목적**: Alpha-Helix Developer Studio의 AI 강건성 엔진이 어떻게 작동하는지,
> 각 모듈이 Trust Score에 어떻게 기여하는지 설명하는 기술 참조 문서.

---

## 1. 전체 아키텍처

```mermaid
flowchart TD
    subgraph INPUT["입력 레이어"]
        A1["시장 데이터<br/>(TQQQ / SOXL 일봉)"]
        A2["VIX 시계열"]
        A3["전략 파라미터<br/>(StrategyParams)"]
    end

    subgraph REGIME["레짐 탐지 엔진"]
        B1["BayesianRegimeDetector<br/>Baum-Welch HMM<br/>4-state 분류"]
        B2["국면 후방확률<br/>bull_quiet / bull_volatile<br/>bear / crisis"]
    end

    subgraph SIGNAL["신호 생성 엔진"]
        C1["이중 모멘텀<br/>1M + 3M 가중 결합"]
        C2["GARCH(1,1) 변동성"]
        C3["ConfidenceScoringSystem<br/>SHAP-스타일 기여도 분해"]
        C4["VixMultiplierEngine<br/>VIX 연동 승수"]
    end

    subgraph RISK["리스크 제어 엔진"]
        D1["KellyPositionSizer<br/>분수 켈리 0.25x"]
        D2["RiskBudgetAllocator<br/>리스크 패리티 + 변동성 타겟팅"]
        D3["DrawdownCircuitBreaker<br/>MDD 임계값 서킷 차단"]
        D4["RegimeAwareRiskFilter<br/>국면별 파라미터 동적 스위칭"]
    end

    subgraph BACKTEST["백테스트 검증 엔진"]
        E1["vectorbt 브리지<br/>고속 신호 행렬 연산"]
        E2["WalkForwardValidator<br/>앵커드·롤링 OOS 검증"]
        E3["FatTailSynthesizer<br/>GARCH + Student-t<br/>Monte Carlo 스트레스"]
        E4["OverfitPenaltyEstimator<br/>Deflated Sharpe Ratio"]
    end

    subgraph SCORE["Trust Score 산출"]
        F1["generalization_score<br/>IS vs OOS 성과 갭 (0.25)"]
        F2["regime_robustness<br/>하락장 Sharpe (0.20)"]
        F3["param_stability<br/>파라미터 민감도 (0.15)"]
        F4["risk_control_score<br/>MDD·Calmar·손절 (0.20)"]
        F5["statistical_confidence<br/>t-stat·p-value (0.20)"]
        F6["overfit_penalty<br/>IS-OOS gap 최대 -15pts"]
        G["최종 Trust Score<br/>(0 ~ 100점)"]
    end

    subgraph OUTPUT["출력·행동 레이어"]
        H1["목표 포지션 비중<br/>TQQQ : SOXL"]
        H2["자연어 근거 설명<br/>(DeveloperLab 패널)"]
        H3["무한매수 DCA 지시<br/>추가매수 / 익절 / 청산"]
    end

    A1 --> B1
    A2 --> C4
    A3 --> C1

    B1 --> B2
    B2 --> C3
    B2 --> D4

    C1 --> C3
    C2 --> C3
    C3 --> D1
    C4 --> D1

    D4 --> D1
    D4 --> D2
    D4 --> D3

    D1 --> E1
    D2 --> E1
    E1 --> E2
    E2 --> F1
    E1 --> E3
    E3 --> F2
    E4 --> F6

    F1 --> G
    F2 --> G
    F3 --> G
    F4 --> G
    F5 --> G
    F6 --> G

    G --> H1
    G --> H2
    D3 --> H3
    D1 --> H3
```

---

## 2. Trust Score 산출 공식

$$
\text{Trust Score} = 0.25 \cdot S_{\text{gen}} + 0.20 \cdot S_{\text{regime}} + 0.15 \cdot S_{\text{param}} + 0.20 \cdot S_{\text{risk}} + 0.20 \cdot S_{\text{stat}} + P_{\text{overfit}}
$$

| 서브스코어 | 기호 | 가중치 | 계산 방법 | 담당 모듈 |
|---|---|---|---|---|
| 일반화 점수 | $S_{\text{gen}}$ | 25% | `clip01((OOS_Sharpe + 1) / 3)` | `WalkForwardValidator` |
| 레짐 강건성 | $S_{\text{regime}}$ | 20% | 하락장 구간만 필터링 후 Sharpe | `BayesianRegimeDetector` |
| 파라미터 안정성 | $S_{\text{param}}$ | 15% | ±10% 파라미터 변동 시 성과 민감도 | `StrategyParams` |
| 리스크 통제 | $S_{\text{risk}}$ | 20% | `clip01(Calmar / 2)` + MDD 페널티 | `DrawdownCircuitBreaker` |
| 통계 신뢰도 | $S_{\text{stat}}$ | 20% | `clip01(t-stat / 3)` | `WalkForwardValidator` |
| 과적합 페널티 | $P_{\text{overfit}}$ | -15pt 최대 | IS-OOS 갭 × 조정계수 | `OverfitPenaltyEstimator` |

### 2-1. Trust Score 등급 기준

| 점수 | 등급 | 의미 | 권장 행동 |
|---|---|---|---|
| 80~100 | A (신뢰) | 전략 강건성 검증 완료 | 전체 켈리 비중 집행 |
| 60~79 | B (보통) | 일부 불확실성 존재 | 분수 켈리 0.5x 적용 |
| 40~59 | C (주의) | 과적합 또는 국면 불안정 | 분수 켈리 0.25x + 포지션 모니터링 |
| 20~39 | D (위험) | 신뢰도 낮음 | 최소 포지션 또는 현금 보유 |
| 0~19 | F (실패) | 전략 재설계 필요 | 즉시 청산, 파라미터 재검토 |

---

## 3. Trust Score 13점 원인 분석 (STEP 1 결과)

### 문제 진단

실제 TQQQ 백테스트에서 Trust Score 13점이 산출된 근본 원인:

```
Trust Score 분해
─────────────────────────────────────────────────────────
서브스코어           계산값    가중치    기여점수
─────────────────────────────────────────────────────────
generalization      0.08     ×25%  =  2.0pt  ← IS 대비 OOS 급락
regime_robustness   0.00     ×20%  =  0.0pt  ← 하락장 Sharpe << -1
param_stability     0.45     ×15%  =  6.8pt
risk_control        0.40     ×20%  =  8.0pt
statistical_conf    0.10     ×20%  =  2.0pt  ← OOS fold 수 부족
─────────────────────────────────────────────────────────
소계                                 18.8pt
과적합 페널티                        -5.8pt  ← IS-OOS gap -15pt 발동
─────────────────────────────────────────────────────────
최종 Trust Score                     13.0pt
─────────────────────────────────────────────────────────
```

### 핵심 원인 3가지

1. **레짐 필터 부재**: TQQQ가 하락장(-2020.03, -2022)에서 Sharpe << -1 → `regime_robustness = 0`
2. **과적합**: IS 구간 최적화 후 OOS에서 성과 급락 → 과적합 지수 85% → 페널티 발동
3. **짧은 OOS 히스토리**: WalkForward fold 수 3개 미만 → t-stat < 0.5 → `statistical_conf ≈ 0.1`

### 개선 방안 (이번 엔진에서 구현)

| 개선 항목 | 구현 위치 | 예상 효과 |
|---|---|---|
| 레짐 필터링 (bear → 포지션 0) | `TQQQSOXLMomentumAlgorithm.OnData()` | regime_robustness +15pt |
| VIX 연동 포지션 축소 | `VixMultiplierEngine` | risk_control +5pt |
| 분수 켈리 0.25x | `KellyPositionSizer(fraction=0.25)` | risk_control +3pt |
| 서킷브레이커 -35% halt | `DrawdownCircuitBreaker` | risk_control +5pt |
| WalkForward 폴드 증가 | `WFConfig(test_days=63)` → fold≥10 | statistical_conf +8pt |

**목표 Trust Score: 60점 이상 (B등급)**

---

## 4. 모듈별 Trust Score 기여 흐름

```mermaid
flowchart LR
    subgraph helpers["helpers.py"]
        H1["WalkForwardValidator<br/>→ generalization (25%)"]
        H2["BayesianRegimeDetector<br/>→ regime_robustness (20%)"]
        H3["OverfitPenaltyEstimator<br/>→ overfit_penalty (-15pt)"]
        H4["FatTailSynthesizer<br/>스트레스 검증 보조"]
    end

    subgraph risk["risk_control.py"]
        R1["DrawdownCircuitBreaker<br/>→ risk_control (20%)"]
        R2["KellyPositionSizer<br/>→ risk_control 보조"]
        R3["RegimeAwareRiskFilter<br/>→ regime_robustness 보조"]
        R4["ConfidenceScoringSystem<br/>→ statistical_conf (20%)"]
    end

    subgraph main_["main.py"]
        M1["TQQQSOXLMomentumAlgorithm<br/>→ param_stability (15%)"]
        M2["vectorbt_bridge<br/>→ 백테스트 실행"]
        M3["run_strategy<br/>→ 전체 집계"]
    end

    subgraph trust["trust_score.py (기존)"]
        T1["compute_trust_score()"]
        T2["최종 Trust Score 반환"]
    end

    H1 --> T1
    H2 --> T1
    H3 --> T1
    R1 --> T1
    R4 --> T1
    M1 --> T1
    M3 --> T1
    T1 --> T2
```

---

## 5. 강건성 파이프라인 실행 순서

```
① 데이터 로드 (close_df, vix_series)
      ↓
② BayesianRegimeDetector.fit(returns)
   → 4-state HMM 학습 (Baum-Welch)
   → bull_quiet / bull_volatile / bear / crisis 분류
      ↓
③ ConfidenceScoringSystem.compute_confidence(signal)
   → 5개 피처 SHAP 분해
   → 불확실성 MC 드롭아웃 → 신뢰도 0~1
      ↓
④ VixMultiplierEngine.multiplier(vix)
   → VIX 구간별 포지션 승수 계산
      ↓
⑤ RegimeAwareRiskFilter.get_params(regime)
   → 국면별 kelly_fraction / vol_target / halt_dd 세트 선택
      ↓
⑥ KellyPositionSizer.multi_asset_kelly(returns_df)
   → Σ⁻¹ · μ 벡터 + Ridge 정규화
      ↓
⑦ RiskBudgetAllocator.allocate(returns, capital, regime)
   → 리스크 패리티 최적화 (SLSQP)
   → 변동성 타겟팅 스케일링
      ↓
⑧ DrawdownCircuitBreaker.update(portfolio_value)
   → 고점 대비 낙폭 측정
   → 단계별 포지션 축소 / HALT 발동
      ↓
⑨ vectorbt_bridge(close_df, params)
   → 신호 행렬 고속 계산
   → 포트폴리오 시뮬레이션
      ↓
⑩ WalkForwardValidator.run(prices, strategy_fn)
   → IS/OOS fold 분할 → 과적합 지수 계산
   → 부트스트랩 신뢰구간
      ↓
⑪ FatTailSynthesizer.generate_stress_scenarios()
   → 200개 Monte Carlo 경로
   → VaR/CVaR 분포 측정
      ↓
⑫ trust_score.py → compute_trust_score()
   → 5서브스코어 + 과적합 페널티 → 최종 점수
```

---

## 6. API 사용 예시

### FastAPI 백테스트 요청

```python
import httpx

response = httpx.post(
    "http://localhost:8001/backtest",
    json={
        "tickers": ["TQQQ", "SOXL"],
        "start_date": "2020-01-01",
        "end_date": "2024-12-31",
        "params": {
            "momentum_short": 21,
            "momentum_long": 63,
            "kelly_fraction": 0.25,
            "vol_target": 0.30,
            "halt_drawdown": -0.35,
            "dca_splits": 5,
            "take_profit_1": 0.15,
            "take_profit_2": 0.30,
        }
    }
)
result = response.json()
print(f"Trust Score: {result['trust_score']}")
print(f"Sharpe: {result['backtest']['sharpe']}")
```

### 직접 실행 (로컬 테스트)

```bash
cd c:\Team2_AlphaHelix
python analytics/strategy/main.py
```

---

## 7. 파일 구조

```
analytics/strategy/
├── __init__.py          (자동 생성 필요)
├── helpers.py           ← 합성데이터 + HMM + WalkForward + 유틸리티
├── risk_control.py      ← 신뢰도 스코어링 + Kelly + 리스크패리티 + 서킷브레이커
└── main.py              ← LEAN QCAlgorithm 구조 + vectorbt 브리지 + FastAPI 진입점

analytics/app/
├── robust/
│   ├── trust_score.py   ← 5서브스코어 합산 → Trust Score (기존)
│   └── regime.py        ← 레짐 분류 (기존)
└── backtest/
    └── vbt_engine.py    ← vectorbt 기반 백테스팅 (기존)
```

---

*생성일: 2025 | Alpha-Helix Team 2 | 기술 스택: Python, FastAPI, vectorbt, scikit-learn, scipy*
