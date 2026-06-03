# Alpha-Helix 알려진 이슈 — 교재 정독 중 발견 (triage)

> 교재 작성(코드 한 줄씩 정독) 중 발견한 항목들을 **정직하게 분류**합니다.
> ⚠️ 중요: 에이전트가 "버그"로 표시한 것 중 상당수는 **의도된 설계·문서이슈**였습니다. 신뢰할 수 있는 코드를 위해 **각 항목을 실제 코드로 검증**한 뒤 진짜 버그만 수정했습니다(맹목적 수정 금지).
> 두 핵심 워크플로(Workspace / Developer Studio) 영향 여부를 표기합니다.

범례: 🔴 진짜 버그 · 🟡 방법론/정확성(behavior 변경=결정 필요) · 🔵 의도된 설계(버그 아님) · 📝 문서불일치(코드 정상) · ⚠️ 후속/안전

---

## 🔴 진짜 버그

| # | 위치 | 내용 | 워크플로 영향 | 상태 |
|---|---|---|---|---|
| B1 | `analytics/app/backtest/futures_engine.py:176-177` | `binance_client.get_funding_rate` 는 `funding_rate`(snake) 컬럼을 반환하는데 `fundingRate` 로 읽어 KeyError→except→**펀딩비용 항상 0** | 선물 백테스트(`/backtest/futures`) — 두 핵심 워크플로 **밖** | ✅ **수정** (이 커밋) |
| B2 | `analytics/app/lean/kis_backtest/dsl/helpers.py:1698` | `__all__` 에 정의 없는 `PVT/NVI/PVI` → `from helpers import *` 시 AttributeError (현재 dsl/`__init__` 우회로 미발동) | 없음(잠복) | ✅ **수정** (제거) |

---

## 🟡 방법론 / 정확성 — behavior 변경이라 결정 필요 (메모리 `engine_trust_audit` 와 연결)

이건 "틀린 코드"가 아니라 **"더 엄밀하게 바꿀 수 있는" 설계 선택**입니다. 바꾸면 점수/라벨이 변하므로 사용자 결정 후 진행.

| # | 위치 | 내용 |
|---|---|---|
| M-R3 | `robust/regime.py` | 전체표본 분위수/HMM fit 에 look-ahead. 서술적 분석엔 허용, 인과적(expanding-window)으로 바꾸면 라벨 변동 |
| M-WF | `robust/walkforward.py` | 재최적화 없는 "롤링 OOS 일관성" 테스트 — 정통 워크포워드(구간별 재최적화) 아님 |
| M-T | `robust/trust_score.py` | per_regime method 미지정→항상 rule · risk_control 분모 50 고정상수 · PSR 입력이 다운샘플 equity · wf_train 504 vs API 252 불일치 |
| M-S | `explain/shap_explainer.py` | base_value 무시하고 top-N 기여만으로 방향 판정(단순화) |
| M-F | `backtest/futures_engine.py` | 청산(liquidation) 미구현 · look-ahead 미방지 · funding_arb 모드 미구현 (선물 한정) |

---

## 🔵 의도된 설계 — 버그 아님 (수정하면 안 됨)

| # | 위치 | "버그처럼 보이지만" 실제 |
|---|---|---|
| D1 | `strategies/preset/week52_high.py:97` | `exit: high52 < 0`(항상 False)은 **의도** — 청산을 손절/익절(risk_management)로만 처리. 주석·`to_lean_params(exit type=risk_management)` 가 근거 |
| D2 | `preset/consecutive_moves·false_breakout·volatility_breakout` | `entry_condition` 이 자리표시(placeholder)이고 진짜 로직은 `get_custom_lean_code()` 에 — 커스텀 Lean 코드 경로(설계) |
| D3 | `main.py /report/full` | matplotlib 지연 import — 백엔드 설정 순서를 위한 **의도적** lazy import |
| D4 | `ai/service/gateway` vs `ai/service/llm` | 프로바이더 2벌 평행(쿼터·로그 vs 폴백 라우팅) — 역할 분리. 정리 후보지만 버그 아님 |

---

## 📝 문서/가이드 불일치 — 코드는 정상, 문서만 오류

| # | 내용 | 조치 |
|---|---|---|
| P1 | CLAUDE.md "Java 21" ↔ `build.gradle` toolchain **17** | CLAUDE.md 정정 권장 |
| P2 | CLAUDE.md "market_ohlc_daily" — 엔진은 `market_ohlcv` 사용. (단 백엔드 JPA 엔 `market_ohlc_daily` **별개 테이블** 존재 → 둘 다 실재) | 교재 README 에 반영 완료 |
| P3 | `data/collector.py` docstring "yfinance" ↔ 실제 `polygon_client` import | 교재에 명시 |
| P4 | `dsl/helpers`·`core/indicator`·`core/candlestick` 카테고리 **주석 개수 ≠ 실제**(예: 캔들 "19종"→실제 66종) | 교재에 실측 반영 |
| P5 | `docs/erd_dbdiagram.sql` 에 alpha 도메인 테이블 누락(레거시만) | ERD 교재에 명시 |

---

## ⚠️ 후속 / 안전 — 확인 또는 가벼운 정리 대상

| # | 위치 | 내용 | 우선도 |
|---|---|---|---|
| A1 | `main.py:17-28` | 동일 import 블록 중복 | 낮음(무해, 정리 권장) |
| A2 | `main.py /reports` | 무인증 정적 서빙(UUID 파일명 추측 의존) | 중(공개 링크 설계지만 검토) |
| A3 | `global/config/AiRateLimitFilter` | `/api/ai/chat`·`/api/llm/chat` 가 레이트리밋 대상에서 빠짐(`/alpha/workspaces/*` 만 대상) | 중(남용 보호 — M10 후속) |
| A4 | `strategy/service/SubscriptionService.java` | 주석 인코딩 깨짐(mojibake) | 낮음(컴파일 무영향, 가독성) |
| A5 | `lean/runner.py` | `except KeyError` 가 `build()` 의 None 반환 때문에 안 걸림 | 낮음(다른 곳에서 None 처리) |
| A6 | `lean/credentials.py` | 현재 미사용(dormant) — runner 가 KIS 인증 스킵 | 정보(설계상 미사용) |
| **A7** | `AnalyticsClient`(Jackson2 JsonNode) ↔ Spring Boot 4(Jackson3) | **lean 엔드포인트는 `.toString()` 스코프드 수정됨. 앱 전역 정석(Jackson3 마이그레이션) 미적용** → 다른 analytics 프록시 응답이 깨질 수 있음 | **높음 — Workspace 백테스트 결과 경로 영향 여부 검증 필요** |

> A7(Jackson 직렬화)은 **Workspace 워크플로의 백테스트 결과 표시**에 영향을 줄 수 있어, 두 워크플로 라이브 검증 시 1순위로 확인한다. (메모리 `project_springboot4_jackson_jsonnode_bug` 참조)

---

## 다음 단계 — 두 핵심 워크플로 신뢰성 + 라이브 검증

이 문서의 항목은 대부분 **두 핵심 워크플로의 happy-path 밖**(선물·벤더 잠복·문서)입니다. 워크플로 자체의 무결성은 별도로 **critical-path 정적 감사 + 풀스택 라이브 3회 검증**으로 확인합니다(A7 포함). 진행 계획은 대화 메시지 참조.
