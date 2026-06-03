# Alpha-Helix 엔진 완전 해설 (라인별 교재)

> 목적: **완전 초보자도** 엔진의 모든 줄을 정확히 이해하도록 만드는 교재.
> 용도: ① 한 줄씩 학습 → ② 고도화된 알고리즘 버전 직접 설계 → ③ 강의 자료.
> 작성 원칙: "아주 잘 가르치는 교수"처럼 — 비유·그림·예시 수치·"초보가 헷갈리는 포인트"를 매 단락에 곁들인다.

---

## 0. 이 시스템이 하는 일 (30초 요약)

Alpha-Helix는 **"자연어로 말한 투자 목표 → 전략 → 백테스트(과거 검증) → 시그널 → 실주문"** 까지 한 흐름으로 잇는 퀀트 투자 워크스페이스입니다. 이 교재가 다루는 **Analytics 엔진**은 그중 **"숫자를 계산하는 두뇌"** 입니다 — 과거 데이터로 전략을 시뮬레이션(백테스트)하고, 오늘 사야 할지 팔아야 할지(시그널)를 만들고, 그 전략을 얼마나 믿을 수 있는지(Trust Score)를 채점합니다.

```
[프론트엔드 React]  사용자가 보는 화면
        │  REST(JSON) + JWT 쿠키
        ▼
[백엔드 Spring Boot :8080]  인증·주문·결제·DB 관리 (Java)
        │  HTTP + ANALYTICS_INTERNAL_TOKEN
        ▼
[Analytics 엔진 :8001]  ◀── 이 교재의 주인공 (Python/FastAPI)
   백테스트 · XGBoost 시그널 · Trust Score · Regime · SHAP 설명
```

> 비유: 백엔드는 **은행 창구**(누가 무엇을 요청했는지 확인하고 돈을 움직임), Analytics 엔진은 **연구소**(과거 데이터를 분석해 "이 전략은 이만큼 벌었고 이만큼 위험하다"를 계산). 창구는 연구소에 "이 종목 이 전략으로 백테스트 해줘"라고 요청하고, 연구소는 숫자를 돌려줍니다.

---

## 1. 엔진 아키텍처 지도

엔진은 `analytics/app/` 아래에 있고, 역할별로 폴더가 나뉩니다.

```
app/
├── main.py            ★ FastAPI 진입점 — 모든 API 엔드포인트가 여기 모임 (창구→연구소의 접수처)
├── config.py            환경설정(상수·토큰·기본값)
│
├── data/              📥 데이터 수집/저장 (재료 창고)
│   ├── collector.py       여러 소스에서 데이터를 모아 DB에 적재 + 스케줄러
│   ├── market_db.py       MySQL 의 market_ohlcv 테이블 읽기/쓰기 (※ 엔진은 market_ohlcv 사용. 백엔드 JPA 의 market_ohlc_daily 는 별개 테이블)
│   ├── yf_client.py       야후 파이낸스(주가)
│   ├── binance_client.py  바이낸스(크립토 일봉)
│   ├── fred_client.py     FRED(거시경제 지표)
│   └── polygon_client.py  Polygon(주가 보조 소스)
│
├── backtest/          🔬 백테스트 엔진 (과거 시뮬레이터) ★핵심
│   ├── vbt_engine.py      vectorbt 기반 6대 전략 ← 모범 예시(먼저 읽기)
│   ├── infinite_buying.py 무한매수법(라오어식 분할매수)
│   └── futures_engine.py  선물(레버리지·청산) 백테스트
│
├── models/            🤖 머신러닝 시그널 (예측 두뇌)
│   ├── xgb_signal.py      XGBoost 로 "내일 오를 확률" 예측
│   └── retrain_scheduler.py  매일 22:30 KST 자동 재학습
│
├── robust/            🛡 신뢰성 검증 (이 전략 믿어도 되나?) ★핵심
│   ├── walkforward.py     워크포워드(과거로 훈련→미래로 검증)
│   ├── regime.py          시장 국면(5-State HMM: 강세/약세/횡보…)
│   └── trust_score.py     종합 신뢰점수(여러 검증을 0~100점으로)
│
├── explain/           💡 설명가능 AI
│   └── shap_explainer.py  "왜 이 시그널이 나왔나"를 SHAP 로 설명
│
├── metrics/           📐 위험지표
│   └── quantstats_report.py  QuantStats 로 Sharpe·VaR 등 + HTML 리포트
│
└── lean/              🏗 QuantConnect Lean 연동 (고급 백테스트 엔진) + KIS 인증
    ├── runner.py / jobs.py / credentials.py / kis_auth.py
    └── kis_backtest/  ← 벤더링된 KIS open-trading-api 원본 라이브러리(~19K줄, 별도)
```

### 데이터 흐름 한 장 요약

```
야후/바이낸스/FRED  ──collector──▶  MySQL(market_ohlcv)  ──market_db──▶  pandas Series
                                                                                  │
                                          ┌───────────────────────────────────────┤
                                          ▼                  ▼                     ▼
                                   vbt_engine          xgb_signal           regime / trust_score
                                   (백테스트)           (ML 시그널)           (신뢰성 검증)
                                          │                  │                     │
                                          └────────── main.py 가 JSON 으로 묶어 백엔드에 응답 ──────────┘
```

---

## 2. 읽는 순서 (추천 학습 경로)

초보자가 "쉬운 것 → 어려운 것 / 재료 → 요리" 순으로 쌓이도록 배치했습니다.

| 순서 | 파일 | 왜 이 순서인가 |
|---|---|---|
| 1 | [01_backtest/vbt_engine.md](01_backtest/vbt_engine.md) ✅ | **여기부터**. 엔진의 심장. 백테스트가 무엇인지 + pandas/vectorbt 기초가 한 번에 잡힘 (모범 예시) |
| 2 | [02_data/market_db.md](02_data/market_db.md) ✅ → [collector.md](02_data/collector.md) ✅ | 백테스트가 쓰는 "재료(가격 데이터)"가 어디서 오는지 |
| 3 | [yf_client](02_data/yf_client.md) ✅ · [binance_client](02_data/binance_client.md) ✅ · [fred_client](02_data/fred_client.md) ✅ · [polygon_client](02_data/polygon_client.md) ✅ | 각 데이터 소스의 세부 |
| 4 | [infinite_buying](01_backtest/infinite_buying.md) ✅ · [futures_engine](01_backtest/futures_engine.md) ✅ | 다른 백테스트 변형(분할매수·선물) |
| 5 | [03_models/xgb_signal.md](03_models/xgb_signal.md) ✅ → [retrain_scheduler.md](03_models/retrain_scheduler.md) ✅ | 머신러닝 시그널 |
| 6 | [walkforward](04_robust/walkforward.md) ✅ → [regime](04_robust/regime.md) ✅ → [trust_score](04_robust/trust_score.md) ✅ | 신뢰성 검증 3종 |
| 7 | [shap_explainer](05_explain_metrics/shap_explainer.md) ✅ · [quantstats_report](05_explain_metrics/quantstats_report.md) ✅ | 설명·지표 |
| 8 | [06_api/main.md](06_api/main.md) ✅ · [config.md](06_api/config.md) ✅ | 전부 어떻게 API 로 묶이는가(전체 조립) |
| 9 | [runner](07_lean/runner.md) ✅ · [jobs](07_lean/jobs.md) ✅ · [executor](07_lean/executor.md) ✅ · [project_manager](07_lean/project_manager.md) ✅ · [result_formatter](07_lean/result_formatter.md) ✅ · [data_converter](07_lean/data_converter.md) ✅ · [credentials](07_lean/credentials.md) ✅ · [kis_auth](07_lean/kis_auth.md) ✅ | Lean 연동(QuantConnect Lean CLI) + KIS 인증 |
| 10 | [**Spring 기초 primer**](08_backend/00_spring_primer.md) ✅ → [strategy_broker](08_backend/strategy_broker.md) ✅ · [strategy_backtest_proposal](08_backend/strategy_backtest_proposal.md) ✅ · [ai_alpha_workspace](08_backend/ai_alpha_workspace.md) ✅ · [ai_llm_gateway](08_backend/ai_llm_gateway.md) ✅ · [user](08_backend/user.md) ✅ · [payment](08_backend/payment.md) ✅ · [notification](08_backend/notification.md) ✅ · [global_security_config](08_backend/global_security_config.md) ✅ | 백엔드(Java/Spring) — primer 먼저 읽고 도메인별 |
| 11 | [entities_and_tables](09_db/entities_and_tables.md) ✅ · [migrations_flyway](09_db/migrations_flyway.md) ✅ · [erd_relationships](09_db/erd_relationships.md) ✅ | DB — 엔티티·테이블 / 마이그레이션 V1~V18·Flyway / ERD·관계 |
| 12 | [**벤더 개요/지도**](10_vendor_kis_backtest/00_overview.md) ✅ + **✅핵심사용 라인별 완료**: [dsl_helpers](10_vendor_kis_backtest/dsl_helpers.md)·[dsl_builder](10_vendor_kis_backtest/dsl_builder.md)·[core_schema](10_vendor_kis_backtest/core_schema.md)·[core_indicator](10_vendor_kis_backtest/core_indicator.md)·[core_candlestick_condition](10_vendor_kis_backtest/core_candlestick_condition.md)·[core_converters_param_risk_strategy](10_vendor_kis_backtest/core_converters_param_risk_strategy.md)·[codegen_generator](10_vendor_kis_backtest/codegen_generator.md)·[codegen_validator](10_vendor_kis_backtest/codegen_validator.md)·[strategies_core](10_vendor_kis_backtest/strategies_core.md)·[strategies_preset](10_vendor_kis_backtest/strategies_preset.md) | KIS 라이브러리. **✅핵심사용(core·codegen·strategies·dsl)·lean(07_lean) 전부 완료**. ⚪업스트림(providers/report/portfolio/file/client)은 "우리 미사용"이라 보류 |

> 🐞 **[KNOWN_ISSUES.md](KNOWN_ISSUES.md)** — 정독 중 발견한 이슈를 triage(진짜버그/의도된설계/방법론/문서불일치)한 백로그.

> ✅ = 작성 완료 (라인별 교재 존재). 🔜 = 다음 단계.

### 학습용 보조: Spring 백엔드는 반드시 [08_backend/00_spring_primer.md](08_backend/00_spring_primer.md) 를 먼저 읽으세요(DI·@RestController·JPA·이 프로젝트의 Security OFF 인가 패턴).

---

## 3. 각 교재 문서의 공통 형식 (작성 규칙)

모든 `.md` 는 아래 틀을 따릅니다 — 일관성이 학습 효율을 높입니다.

1. **📌 이 파일 한눈에** — 한 문단 + 실생활 비유. "무엇을, 왜, 누가 호출하는지."
2. **🧠 사전 지식** — 이 파일을 읽기 전 알아야 할 개념을 초보 눈높이로 (예: "pandas Series 란 [날짜→값] 표 한 줄").
3. **🗺 전체 흐름도** — 함수/데이터 흐름 ASCII 다이어그램.
4. **📖 라인별 해설** — 코드를 의미 단위(함수·블록)로 쪼개고, 각 블록마다:
   - 원본 코드 인용(라인 번호 포함)
   - **무엇을 하나 / 왜 이렇게 하나 / 초보가 헷갈리는 포인트** 를 한 줄 한 줄 풀어서
   - 비유·예시 수치·미니 그림
5. **⚠️ 함정·버그 주의** — 실제 코드 주석에 박힌 교훈(look-ahead, dtype, NaN 등)을 강조.
6. **🚀 고도화 아이디어** — 강의/개선 버전용: "여기를 이렇게 바꾸면 더 좋아진다."
7. **📚 용어 사전** — 그 파일에 나온 전문용어 정리.

> 표기 약속: 원본 코드 줄은 `파일.py:줄번호` 로 가리킵니다. 인용 코드 블록 위에 `# L47-L57` 처럼 범위를 적습니다.

---

## 4. 핵심 용어 미니사전 (전 문서 공통)

| 용어 | 한 줄 설명 |
|---|---|
| **백테스트(Backtest)** | 과거 데이터에 전략을 적용해 "그때 했으면 얼마 벌었을까"를 시뮬레이션 |
| **시그널(Signal)** | 오늘 매수(BUY)/매도(SELL)/관망(HOLD) 중 무엇을 할지의 신호 |
| **pandas Series** | `[날짜 → 숫자]` 한 줄짜리 표. 예: 날짜별 종가 |
| **boolean Series** | 날짜별 True/False 표. 예: "이날 매수 신호?" |
| **vectorbt** | 백테스트를 빠르게(벡터 연산) 돌려주는 파이썬 라이브러리 |
| **Look-ahead bias(미래 참조)** | 오늘 신호를 만들 때 "오늘 종가"를 쓰면, 실제론 장 마감 후에야 아는 값으로 매수한 셈 → 반칙. 1칸 미뤄(shift) 방지 |
| **수수료(fees)·슬리피지(slippage)** | 거래 비용. fees=중개수수료, slippage=원하는 가격과 실제 체결가의 차이 |
| **MDD(Max Drawdown)** | 고점 대비 최대 낙폭(%). "가장 운 나쁘게 샀을 때 최대 손실" |
| **Sharpe / Sortino / Calmar** | 위험 대비 수익 효율 지표(클수록 좋음). 분모가 각각 전체변동성/하락변동성/MDD |
| **CAGR(연환산수익)** | 복리로 1년당 평균 몇 % 벌었나 |
| **Regime(국면)** | 시장 상태(강세·약세·횡보·고변동…). 같은 전략도 국면마다 성과가 다름 |
| **Trust Score** | 이 전략을 얼마나 믿을 수 있는지 0~100 종합 점수 |
| **Walk-Forward** | 과거 구간으로 "훈련"하고 바로 다음 미래 구간으로 "검증"하길 반복 — 과적합 탐지 |
| **XGBoost** | 의사결정나무 여러 개를 합치는 강력한 ML 모델. 여기선 "내일 오를 확률" 예측 |
| **SHAP** | ML 예측에 각 입력(피처)이 얼마나 기여했는지 분해해 설명 |

---

## 5. 진행 현황

이 교재는 모듈별로 점진 작성됩니다. 완료된 문서는 위 "읽는 순서" 표의 링크가 살아있습니다.
미완 항목은 작업 todo 로 추적됩니다 (엔진 핵심 → 데이터 → API → Lean → 백엔드 → DB 순).
