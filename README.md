# Alpha-Helix

> AIBE5-Team2 · 최종 프로젝트 — **AI 기반 퀀트 투자 워크스페이스**
>
> 자연어 프롬프트로 전략을 구성하고, 6종 백테스트 → QuantStats Tearsheet → MOCK/REAL 주문 제안(OrderProposal) 큐 → 한국투자증권(KIS) 실주문까지 한 흐름으로 연결합니다.

---

## ✨ 핵심 기능

| 영역 | 설명 |
|-----|-----|
| **구독 플랜** | FREE / STANDARD(9,900원/월) / PREMIUM(19,900원/월) / EXPERT(준비중) — Toss Payments v1 결제창 연동. 테스트 키(샌드박스)로 실제 청구 없이 전체 결제 흐름 검증 가능. |
| **Alpha Workspace** | 탭 분리 레이아웃(Config / Report / Regime / Trust / Decision Log). 사용자별 다중 워크스페이스. |
| **백테스트 엔진** | 6 전략(buy_and_hold, sma_cross, rsi_meanrev, macd, momentum_12_1, vix_risk_off) + 무한매수법(infinite_buying) — `vectorbt` 기반. 수수료 0.25% + 슬리피지 0.1% 반영. |
| **Tearsheet** | `quantstats` HTML 리포트 자동 생성, `/reports/{file}.html` 정적 서빙. |
| **AI 신호** | XGBoost up-probability + SHAP 설명 + Walk-Forward / **5-State Regime** / Trust Score 파라미터 섭동. |
| **OrderProposal 큐** | 일일 시그널 → 사용자 승인 큐. HMAC 서명 승인 링크, TTL 만료 잡 자동 정리. |
| **MOCK → REAL 게이트** | 모든 주문은 MOCK 선행. 사용자 명시 승인 후에만 KIS 실주문 전송. 글로벌 Kill-Switch 지원. |
| **KIS 브로커 연동** | 모의/실거래 계좌 등록, AES-GCM 암호화 저장, 토큰 자동 갱신, 잔고/현재가/주문 API. |
| **Living Briefing** | 일일 시장 요약 + 사용자 포트폴리오 코멘트 (Gemini 2.5-flash, 쿼터 관리 AiGatewayService 통합). |
| **알림 센터** | 시그널/체결/만료 알림 — Zustand persist + BE `/api/notifications/*`. |
| **Rate Limiting** | AI 채팅 20 req/hour/user (Bucket4j). JWT 만료 시 자동 localStorage 클리어. |
| **Flyway 마이그레이션** | `ddl-auto=validate` + Flyway 자동 스키마 관리. APP_CRYPTO_KEY 기본값 없음 — 환경변수 필수. |
| **Circuit Breaker** | Analytics 사이드카 Resilience4j CB + Retry. XGBoost 일일 22:30 KST 자동 재학습 스케줄러. |

> ※ 본 저장소는 DevBridge(파트너-클라이언트 매칭 플랫폼) 기반 위에 Alpha-Helix 모듈이 얹힌 형태입니다. 매칭/포트폴리오/채팅 기능 일부가 함께 포함되어 있습니다.

---

## 🛠️ 기술 스택

| 레이어 | 스택 |
|-----|-----|
| Frontend | React 18 · Vite 7 · Tailwind 4 · Zustand (persist) · Axios · React Router v7 · FullCalendar · Stream Chat |
| Backend  | Spring Boot 4.0 · Java 21 · JPA/Hibernate · Flyway · Resilience4j · Bucket4j · JJWT(HS256) · Spring Mail · Gradle 9 |
| Analytics | Python 3.11 · FastAPI 0.115 · vectorbt 0.26 · quantstats 0.0.62 · xgboost 2.1 · SHAP 0.46 · yfinance (→ Polygon.io 예정) |
| DB | MySQL 8 (`alphahelix_db`) |
| AI | Google Gemini 2.5-flash · AiGatewayService(쿼터+로그 통합) · 선택적으로 Anthropic / OpenAI / Perplexity |
| Broker | 한국투자증권 OpenAPI (모의/실거래) — AES-GCM 키 보관, HMAC 승인 링크 |
| Infra | EC2 + Nginx + systemd (`who-a-backend.service` / `who-a-analytics.service`) |

---

## 🚀 Quick Start

### 0. 사전 준비
- JDK 17, Node 20+, Python 3.11, MySQL 8
- `backend/src/main/resources/application-local.properties` 생성(템플릿: `application.properties` 참고)
- `analytics/.env` 생성(템플릿: `analytics/.env.example`)

### 1. DB
```bash
mysql -uroot -p1234 -e "CREATE DATABASE alphahelix_db CHARACTER SET utf8mb4;"
```

### 2. Backend (Spring Boot · :8080)
```bash
./gradlew bootRun
```

### 3. Analytics (FastAPI · :8001)
```bash
cd analytics
python -m venv .venv && source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --port 8001 --reload
```

### 4. Frontend (Vite · :5173)
```bash
cd frontend
npm install
npm run dev
```

### 5. 접속
- 프론트: http://localhost:5173
- 백엔드 API: http://localhost:8080/api
- Analytics: http://localhost:8001 (백엔드가 내부 토큰으로만 호출)

---

## 🔑 필수 환경변수

| 키 | 용도 |
|-----|-----|
| `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USERNAME`, `DB_PASSWORD` | MySQL 연결 |
| `JWT_SECRET` | JWT HS256 서명 (32+ bytes) |
| `APP_CRYPTO_KEY` | KIS 키 AES-GCM 암호화 (Base64 32 bytes) |
| `APPROVAL_HMAC_SECRET` | OrderProposal 승인 링크 서명 |
| `GEMINI_API_KEY` | Gemini AI (미설정 시 룰베이스 폴백) |
| `ANALYTICS_BASE_URL` / `ANALYTICS_INTERNAL_TOKEN` | BE → Analytics 사이드카 |
| `MAIL_USERNAME` / `MAIL_PASSWORD` | Gmail SMTP (앱 비밀번호) |
| `TOSS_SECRET_KEY` | 토스 결제 시크릿 키. **반드시 클라이언트 키와 동일 계정 키쌍** 사용. 테스트: `test_sk_zXLkKEypNArWmo50nX3lmeaxYG5R` / 운영: 토스 개발자센터 라이브 키 |
| `TOSS_WEBHOOK_SECRET` | 토스 웹훅 서명 검증 (옵션) |
| `TRADING_KILL_SWITCH` | `true` 시 모든 KIS 실주문 차단 |

---

## 🗂️ 디렉터리 구조

```
.
├── backend/                Spring Boot — 매칭 + Alpha-Helix REST API
│   └── src/main/java/com/DevBridge/devbridge/
│       ├── controller/    AlphaHelix · BrokerAccount · BrokerOrder · OrderProposal · ...
│       ├── service/        DailySignalGenerator · AnalyticsClient · CryptoService · broker/Kis*
│       ├── entity/         AlphaWorkspace · OrderProposal · BrokerAccount · ...
│       └── security/       JWT 쿠키 필터 · AuthContext
├── analytics/              Python FastAPI 사이드카
│   └── app/
│       ├── backtest/       vbt_engine · infinite_buying
│       ├── metrics/        quantstats_report
│       ├── models/         xgb_signal
│       ├── explain/        shap_explainer
│       └── robust/         walkforward · regime · trust_score
├── frontend/               React + Vite
│   └── src/
│       ├── alpha/          Workspace · Account · Proposals · OrderConfirmModal · ChatDock
│       ├── pages/          Home · Login · Mypage · NotificationsPage · VisionBoard · ...
│       ├── store/          Zustand (auth · notifications · ...)
│       └── i18n/           translations.js
└── deploy/                 systemd units · nginx conf · cloud-init · DEPLOY_FROM_SCRATCH.md
```

---

## 🛡️ 보안 설계 요약

- **JWT HttpOnly 쿠키** — `Set-Cookie: HttpOnly; Secure(prod); SameSite=Lax` (XSS 토큰 탈취 방지). Authorization 헤더는 레거시 fallback.
- **KIS 자격증명 AES-GCM 암호화** — DB 평문 저장 금지. 키는 `APP_CRYPTO_KEY` 환경변수.
- **승인 링크 HMAC 서명 + TTL** — 이메일/링크로 노출되는 OrderProposal 승인 토큰 위조 차단. `OrderProposalExpiryJob`이 만료 큐 정리.
- **MOCK → REAL 명시 게이트** — DailySignalGenerator는 항상 MOCK 제안 먼저, 실주문은 별도 승인 단계.
- **글로벌 Kill-Switch** — `app.trading.kill-switch=true` 시 KIS 어댑터가 모든 실주문 거부.
- **파일 업로드** — multipart 50MB 제한, path traversal 방지.
- **로깅** — 시크릿 마스킹, `application-prod.properties`에서 `ddl-auto=validate` + actuator 노출 최소화.

---

## 📦 배포

- 단일 EC2(`who-a`) 위에 nginx + 3 systemd 유닛(backend 8080, analytics 8001, frontend dist).
- 상세 절차: [`deploy/DEPLOY_FROM_SCRATCH.md`](deploy/DEPLOY_FROM_SCRATCH.md)
- 환경 템플릿: [`deploy/ENV_TEMPLATE.txt`](deploy/ENV_TEMPLATE.txt)

---

## 🧪 E2E 시나리오 (수동 검증)

1. 회원가입 → 로그인 (JWT 쿠키 세팅 확인)
2. 마이페이지 → KIS 모의계좌 등록 (`appkey`/`appsecret` 입력)
3. Alpha Workspace 생성 → 전략 선택 → 백테스트 → Tearsheet 확인
4. 데일리 시그널 트리거 → Proposals 페이지에서 MOCK 주문 승인 → 만료/체결 알림 수신
5. (옵션) Kill-Switch off + 실거래 계좌 → REAL 주문 게이트 통과

---

## 📚 입문자 가이드 (`docs/guides/`)

KIS [open-trading-api](https://github.com/koreainvestment/open-trading-api)의 구조를 Alpha-Helix로 옮기며, **주식·코딩 처음인 사람도** 따라올 수 있게 한 줄씩 풀어 쓴 3부작 가이드입니다.

| 가이드 | 매핑 | 핵심 내용 |
|---|---|---|
| 📈 [**01. 백테스트 엔진**](docs/guides/01_백테스트_엔진.md) | KIS `backtester/` (Lean+Docker) → 우리 vectorbt | 7전략(SMA·RSI·MACD·모멘텀·VIX·무한매수법) + QuantStats Tearsheet + 결과지표 해석 |
| 🤖 [**02. AI 시그널 엔진**](docs/guides/02_AI_시그널_엔진.md) | KIS `strategy_builder/` → 우리 AI 엔진 | XGBoost 13피처 + SHAP 설명 + Regime 5국면(HMM) + Trust Score 4요소 |
| ⚙️ [**03. 실행 환경 가이드**](docs/guides/03_실행환경_가이드.md) | KIS 루트 README → Alpha-Helix 통합 | 3프로세스 아키텍처 + 환경변수 7개 + KIS 실주문 5겹 안전장치 + 구독 플랜 |

---

## 📋 변경 이력

### 2026-05-29
- **로그인**: 이메일·비밀번호 모두 입력 시 버튼 그라디언트 활성화, 미입력 시 회색 비활성 처리
- **회원가입**: 배경을 로그인과 동일한 블러 영상으로 통일, 상단 헤더(로고·Help Center) 제거, Alpha-Helix 타이틀 그라디언트 적용, 소셜 로그인 Google·GitHub만 유지, 폼 레이블 한국어 개선(아이디→닉네임, ID Email→이메일 아이디, 다음 단계→회원가입)
- **비전보드**: 고정 캔버스(2800×1800) → 뷰포트 100% 맞춤 (스크롤 제거)
- **워크홈**: 새 워크스페이스 버튼 클릭 시 `/alpha?new=1` 페이지 이동 없이 모달에서 바로 생성 후 이동
- **워크스페이스 목록**: 새 워크스페이스 버튼 이벤트 객체 전달 버그 수정, 대표 설정 확인 모달 추가, 대표 카드 Champagne Gold glow 효과(테두리 제거), LIVE 상태 시 왼쪽 상태 뱃지 중복 표시 제거
- **워크스페이스**: 전략 전환 시 0.25s fadeIn 애니메이션 적용
- **사이드바**: AI 대화 메뉴 항목 제거 (TABS·WS_SUBMENUS)
- **계좌 관리**: KIS·Binance 브로커 아이콘 이모지 → 공식 로고 이미지로 교체, KIS 원형 클리핑, 탭 좌측 정렬 수정
- **홈**: 전략 템플릿 카드 Unsplash 이미지 제거, badge 해시태그 하단 태그와 통합

---

## �👥 팀

AIBE5 — Team2 (Alpha-Helix)

---

## 📜 라이선스

본 리포지토리는 교육·발표 목적의 비공개 팀 프로젝트입니다.
