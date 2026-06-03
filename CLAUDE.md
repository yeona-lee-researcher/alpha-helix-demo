# Alpha-Helix — Claude Code Project Guide

> AIBE5-Team2 · AI 기반 퀀트 투자 워크스페이스  
> 자연어 프롬프트로 전략 구성 → 백테스트 → OrderProposal 큐 → KIS 실주문까지 한 흐름으로 연결

---

## 아키텍처 개요

3개의 독립 프로세스가 협력합니다.

```
Frontend (React·Vite·:5173)
    ↕ REST / JWT 쿠키
Backend (Spring Boot·:8080)
    ↕ HTTP + ANALYTICS_INTERNAL_TOKEN
Analytics (FastAPI·:8001)   ← 백테스트 · XGBoost · Trust Score
```

백엔드는 **도메인 드리븐(Domain-Driven)** 패키지 구조입니다.  
각 도메인이 `controller / dto / entity / repository / service` 레이어를 독립적으로 소유합니다.

---

## 기술 스택

| 레이어 | 스택 |
|---|---|
| Frontend | React 18 · Vite 7 · Tailwind 4 · Zustand (persist) · Axios · React Router v7 |
| Backend | Spring Boot 4.0 · Java 21 · JPA/Hibernate · Flyway · Resilience4j · Bucket4j · JJWT(HS256) · Gradle 9 |
| Analytics | Python 3.11 · FastAPI 0.115 · vectorbt 0.26 · quantstats 0.0.62 · xgboost 2.1 · SHAP 0.46 |
| DB | MySQL 8 (`alphahelix_db`) |
| AI | Google Gemini 2.5-flash · AiGatewayService(쿼터+로그) · 선택적으로 Anthropic / OpenAI / Perplexity |
| Broker | 한국투자증권(KIS) OpenAPI (모의/실거래) · AES-GCM 키 보관 · HMAC 승인 링크 |
| Payment | Toss Payments v1 (테스트 샌드박스) |
| Infra | EC2 + Nginx + systemd (`who-a-backend.service` / `who-a-analytics.service`) |

---

## 로컬 실행

### 0. 사전 준비
- JDK 21, Node 20+, Python 3.11, MySQL 8
- `backend/src/main/resources/application-local.properties` 생성 (템플릿: `application.properties`)
- `analytics/.env` 생성 (템플릿: `analytics/.env.example`)

### 1. DB
```bash
mysql -uroot -p1234 -e "CREATE DATABASE alphahelix_db CHARACTER SET utf8mb4;"
```

### 2. Backend (:8080)
```bash
cd backend
.\gradlew bootRun --args="--spring.profiles.active=local"   # Windows
./gradlew bootRun --args="--spring.profiles.active=local"   # Linux/Mac
```

### 3. Analytics (:8001)
```bash
cd analytics
python -m venv .venv
.venv\Scripts\activate   # Windows
source .venv/bin/activate  # Linux/Mac
pip install -r requirements.txt
uvicorn app.main:app --port 8001 --reload
```

### 4. Frontend (:5173)
```bash
cd frontend
npm install
npm run dev
```

### 헬스 체크
```bash
curl http://localhost:8080/actuator/health   # {"status":"UP"}
```

---

## 필수 환경변수

| 키 | 용도 |
|---|---|
| `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USERNAME`, `DB_PASSWORD` | MySQL 연결 |
| `JWT_SECRET` | JWT HS256 서명 (32+ bytes) |
| `APP_CRYPTO_KEY` | KIS 키 AES-GCM 암호화 (Base64 32 bytes) · **기본값 없음** |
| `APPROVAL_HMAC_SECRET` | OrderProposal 승인 링크 HMAC 서명 |
| `GEMINI_API_KEY` | Gemini AI (미설정 시 룰베이스 폴백) |
| `ANALYTICS_BASE_URL` / `ANALYTICS_INTERNAL_TOKEN` | BE → Analytics 사이드카 인증 |
| `MAIL_USERNAME` / `MAIL_PASSWORD` | Gmail SMTP 앱 비밀번호 |
| `TOSS_SECRET_KEY` | 테스트: `test_sk_zXLkKEypNArWmo50nX3lmeaxYG5R` |
| `TRADING_KILL_SWITCH` | `true` 시 모든 KIS 실주문 차단 |

---

## 디렉터리 구조

```
.
├── backend/
│   └── src/main/java/com/DevBridge/devbridge/
│       ├── domain/
│       │   ├── strategy/   (43)  퀀트 전략·백테스트·OrderProposal·KIS 브로커
│       │   ├── ai/         (31)  AI 채팅·멀티LLM·AiGateway·쿼터 관리
│       │   ├── user/       (29)  회원가입·로그인·JWT·이메일 인증
│       │   ├── payment/    (10)  Toss Payments·구독 플랜(FREE/STANDARD/PREMIUM/EXPERT)
│       │   └── notification/(5)  시그널/체결/만료 알림
│       └── global/
│           ├── config/     WebConfig · AiRateLimitFilter
│           └── security/   JwtUtil · JwtAuthenticationFilter · AuthContext
├── analytics/
│   └── app/
│       ├── backtest/       vbt_engine · infinite_buying
│       ├── models/         xgb_signal (일 22:30 KST 자동 재학습)
│       ├── explain/        shap_explainer
│       ├── metrics/        quantstats_report (HTML Tearsheet)
│       └── robust/         walkforward · regime (5-State HMM) · trust_score
├── frontend/
│   └── src/
│       ├── alpha/          AlphaWorkspace · BrokerAccount · Proposals · OrderConfirmModal
│       ├── pages/          Home · Login · Mypage · NotificationsPage
│       ├── store/          Zustand (auth · notifications)
│       └── i18n/           translations.js
└── deploy/
    ├── DEPLOY_FROM_SCRATCH.md
    ├── ENV_TEMPLATE.txt
    ├── nginx-who-a.conf
    └── who-a-backend.service / who-a-analytics.service
```

---

## 핵심 도메인 상세

### `domain/strategy` — 퀀트 전략 핵심

| 클래스 | 역할 |
|---|---|
| `StrategyService` | 전략 CRUD, 워크스페이스 연결 |
| `BacktestService` | Analytics 사이드카에 백테스트 요청 위임 |
| `AnalyticsClient` | FastAPI 호출 · Resilience4j CB + Retry |
| `DailySignalGenerator` | 일일 XGBoost 시그널 → OrderProposal 생성 |
| `OrderProposalService` | HMAC 승인 링크 발급 · TTL 만료 잡 |
| `KisBrokerService` | KIS OpenAPI 모의/실거래 · 토큰 자동 갱신 |
| `SubscriptionService` | 플랜 확인 · 기능 접근 제어 |

### `domain/ai` — 멀티 LLM 채팅

| 클래스 | 역할 |
|---|---|
| `AiGatewayService` | 쿼터 관리 · 사용 로그 · 프로바이더 라우팅 |
| `LlmRouter` | Gemini → OpenAI → Anthropic → Perplexity 폴백 체인 |
| `GeminiProvider` | 기본 프로바이더 (Gemini 2.5-flash) |

Rate Limit: `AiRateLimitFilter` — 유저별 AI 채팅 20 req/hour (Bucket4j)

### `domain/payment` — Toss Payments 구독

구독 플랜: `FREE` / `STANDARD`(9,900원/월) / `PREMIUM`(19,900원/월) / `EXPERT`(준비중)  
`SubscriptionController`가 VALID_PLANS Map으로 금액 위변조 방지.

---

## Analytics 사이드카 주요 API

| Method | URL | 설명 |
|---|---|---|
| POST | `/backtest` | vectorbt 백테스트 실행 (6전략 + 무한매수법) |
| POST | `/signal` | XGBoost 시그널 생성 + SHAP 설명 |
| GET | `/trust-score/{workspace_id}` | Trust Score (Walk-Forward + Regime + 파라미터 섭동) |
| GET | `/reports/{file}.html` | QuantStats Tearsheet 정적 서빙 |

백테스트 전략 목록: `buy_and_hold`, `sma_cross`, `rsi_meanrev`, `macd`, `momentum_12_1`, `vix_risk_off`, `infinite_buying`  
수수료 0.25% + 슬리피지 0.1% 반영.

---

## 백엔드 주요 API

| Method | URL | 인증 | 설명 |
|---|---|---|---|
| POST | `/api/auth/signup` | 없음 | 회원가입 |
| POST | `/api/auth/login` | 없음 | 로그인 (JWT 쿠키) |
| GET | `/api/strategies` | JWT | 전략 목록 |
| POST | `/api/strategies/{id}/backtest` | JWT | 백테스트 트리거 |
| GET | `/api/proposals` | JWT | OrderProposal 목록 |
| POST | `/api/proposals/{id}/approve` | HMAC | 주문 승인 |
| GET | `/api/notifications` | JWT | 알림 목록 |
| POST | `/api/subscriptions/checkout` | JWT | Toss 결제 시작 |
| GET | `/actuator/health` | 없음 | 헬스 체크 |

---

## 보안 설계

- **JWT HttpOnly 쿠키** — `HttpOnly; Secure(prod); SameSite=Lax`. XSS 토큰 탈취 방지.
- **KIS 자격증명 AES-GCM 암호화** — DB 평문 저장 금지. 키는 `APP_CRYPTO_KEY` 환경변수 (기본값 없음).
- **승인 링크 HMAC 서명 + TTL** — OrderProposal 이메일 승인 토큰 위조 차단. `OrderProposalExpiryJob` 자동 만료 정리.
- **MOCK → REAL 명시 게이트** — DailySignalGenerator는 항상 MOCK 제안 먼저. 실주문은 별도 승인 단계 필수.
- **글로벌 Kill-Switch** — `TRADING_KILL_SWITCH=true` 시 KIS 어댑터가 모든 실주문 거부.
- **Analytics 내부 토큰** — `ANALYTICS_INTERNAL_TOKEN`으로 외부 직접 접근 차단.

---

## DB / 마이그레이션

- **Flyway** 자동 관리. `ddl-auto=validate` — JPA가 스키마 자동 변경하지 않음.
- 마이그레이션 파일: `backend/src/main/resources/db/migration/`
- ERD: `docs/erd_dbdiagram.sql`
- Seeder: 앱 기동 시 기존 데이터 있으면 스킵 (멱등)

---

## 주의사항 / 알려진 패턴

- `APP_CRYPTO_KEY` 는 기본값이 없어 미설정 시 앱 기동 실패. 로컬에서도 반드시 설정.
- `ANALYTICS_BASE_URL` 미설정 시 `AnalyticsClient`가 Resilience4j CB로 빠르게 폴백 — 시그널 없이 동작.
- Toss Payments 테스트 키: 클라이언트 키(`test_ck_D5GePWvyJnrK0W0k6q8gLzN97Eoq`)와 시크릿 키(`test_sk_zXLkKEypNArWmo50nX3lmeaxYG5R`) 반드시 동일 계정 키쌍 사용.
- XGBoost 모델은 데이터가 충분하면 학습/추론하고, 데이터 부족·미존재 시 `predict_proba_up` 가 `None` 반환 또는 학습이 예외로 스킵된다(합성 데이터 자동 초기학습 경로는 코드에 없음). 매일 22:30 KST 재학습.
- `Regime v2`: 5-State HMM (`bull_quiet`, `bull_volatile`, `sideways`, `bear`, `high_vol_unstable`). hmmlearn GaussianHMM(ret·vol20·mom60 피처). 표본부족/fit실패 시 rule-based 로 폴백하며 응답에 `method`(실제 사용)·`hmm_fallback` 표기. ⚠️ `/regime`·Trust Score 기본 method 는 현재 `rule`(빠름); HMM 은 `method=hmm` 명시 요청 시 사용.
- Frontend `alpha/` 컴포넌트는 탭 분리 레이아웃: Chat / Config / Report / Regime / Trust / Briefing / Log.

---

## Git 브랜치 전략

### 브랜치 구조

```
main        ──────────────────────────────────── (운영 배포)
               ▲
develop        └───┬──────────────────────┬───── (개발 중심)
                   │                      ▲
feature/user       └─► [기능 개발] ───────┤ (PR & 리뷰 후 병합)
                                          │
feature/strategy ─────────────────────────┴────► [기능 개발]
```

- `main` — 운영 배포 전용. 직접 커밋 금지.
- `develop` — 개발 통합 브랜치. 모든 feature 브랜치의 병합 대상.
- `feature/*` — 도메인별 기능 개발. develop에서 분기, PR 후 develop으로 병합.

### Feature 브랜치 명명 규칙

`feature/도메인명-기능명` 형태로 생성합니다.

| 예시 브랜치명 | 설명 |
|---|---|
| `feature/user-login` | 유저 로그인 기능 개발 |
| `feature/user-signup` | 유저 회원가입 기능 개발 |
| `feature/user-profile` | 유저 프로필 수정 기능 개발 |
| `feature/strategy-backtest` | 백테스트 기능 개발 |
| `feature/strategy-order-proposal` | OrderProposal 큐 기능 개발 |
| `feature/payment-subscription` | 구독 플랜 결제 기능 개발 |
| `feature/ai-llm-router` | LLM 라우터 기능 개발 |

### PR 규칙

feature 브랜치 개발 완료 후 develop으로 직접 머지하지 않고, GitHub PR을 올려 팀원 리뷰 후 병합합니다.

---

## 커밋 메시지 컨벤션

### 기본 구조

```
태그: [도메인] 요약 내용

- 필요한 경우 상세 내용 기술 (무엇을, 왜 변경했는지)
- Fixes: #이슈번호  (이슈가 있는 경우)
```

### 커밋 태그 (Type)

| 태그 | 설명 | 예시 |
|---|---|---|
| `feat` | 새로운 기능 추가 | `feat: [user] 카카오 소셜 로그인 구현` |
| `fix` | 버그 수정 | `fix: [strategy] 토큰 만료 시 KIS 재발급 오류 수정` |
| `refactor` | 코드 리팩토링 (기능 변경 없음) | `refactor: [user] 로그인 검증 로직 Service 레이어로 분리` |
| `docs` | 문서 수정 (README, Swagger 등) | `docs: API 명세서 최신화` |
| `style` | 코드 포맷팅, 세미콜론 누락 등 | `style: [global] 인텔리제이 포맷터 적용` |
| `test` | 테스트 코드 추가/수정 | `test: [strategy] 백테스트 결과 검증 케이스 추가` |
| `chore` | 빌드, 패키지, 의존성 설정 | `chore: build.gradle JWT 의존성 추가` |

### 규칙 요약

- 태그 뒤 `[도메인]` 명시 — 히스토리에서 도메인별 작업 즉시 식별 가능
- 과거 시제 금지 — `구현했음` → `구현`, `Fixed` → `Fix`
- 커밋 단위는 작게 — 도메인이 다르면 커밋도 분리 (Revert 편의성)