# Alpha-Helix — 전체 아키텍처 상세 문서

> AIBE5-Team2 | 최종 업데이트: 2026-05-21

---

## 목차

1. [프로젝트 개요](#1-프로젝트-개요)
2. [전체 아키텍처](#2-전체-아키텍처)
3. [프론트엔드 (React + Vite)](#3-프론트엔드-react--vite)
4. [백엔드 (Spring Boot)](#4-백엔드-spring-boot)
5. [분석 엔진 (Python FastAPI)](#5-분석-엔진-python-fastapi)
6. [Toss Payments 결제 시스템](#6-toss-payments-결제-시스템)
7. [인프라 및 배포](#7-인프라-및-배포)
8. [보안 설계](#8-보안-설계)
9. [환경변수 전체 목록](#9-환경변수-전체-목록)
10. [변경 이력](#10-변경-이력)

---

## 1. 프로젝트 개요

Alpha-Helix는 AI 기반 퀀트 투자 워크스페이스입니다. DevBridge(파트너-클라이언트 매칭 플랫폼) 기반 위에 Alpha-Helix 모듈이 얹힌 형태입니다.

### 핵심 흐름

```
사용자 자연어 프롬프트
    → 전략 설정 (6종 + 무한매수법)
    → vectorbt 백테스트
    → QuantStats Tearsheet
    → XGBoost 신호 (SHAP 설명 + Walk-Forward + 5-State Regime + Trust Score)
    → OrderProposal MOCK 큐
    → 사용자 승인 (HMAC 링크 + TTL)
    → KIS 실주문 (Kill-Switch 게이트)
```

### 구독 플랜

| 플랜 | 가격 | 상태 |
|------|------|------|
| FREE | 무료 | 현재 기본값 |
| STANDARD | 9,900원/월 | 운영 중 (Toss 샌드박스 테스트) |
| PREMIUM | 19,900원/월 | 운영 중 (Toss 샌드박스 테스트) |
| EXPERT | 준비 중 | - |

> **테스트 vs 라이브 결제 차이**
> - `test_` 키(현재): **샌드박스 모드** — 카카오페이/카드/계좌이체 등 모든 결제수단이 가상 결제. 실제 청구 없음. 결제 성공 플로우(리다이렉트→서버 confirm→DB 저장)는 동일하게 동작.
> - `live_` 키(운영 전환 시): **실제 결제** — 카드사/카카오페이 등 실제 출금 발생. 토스 가맹 계약 심사 승인 필요.
> - 로직 차이: **코드 차이 없음**. 환경변수 키만 교체하면 됨.

---

## 2. 전체 아키텍처

```
┌─────────────────────────────────────────────────────────────────────┐
│  클라이언트 (브라우저)                                                 │
│  React 18 + Vite 7 + Tailwind 4 + Zustand                          │
│  https://who-a.com  (EC2 Nginx 정적 서빙)                           │
└──────────────┬──────────────────────────────────────────────────────┘
               │ HTTPS / JWT HttpOnly Cookie
               ▼
┌─────────────────────────────────────────────────────────────────────┐
│  백엔드 Spring Boot 4.0 · Java 21  (포트 8080)                       │
│  DevBridge 매칭 API + Alpha-Helix REST API                           │
│                                                                      │
│  ┌─────────────┐  ┌──────────────┐  ┌──────────────────────┐       │
│  │ Auth/JWT    │  │ AlphaWorkspace│  │ OrderProposal 큐     │       │
│  │ Bucket4j RateLimit│  │ BacktestService│  │ HMAC 승인 + TTL 만료│      │
│  └─────────────┘  └──────────────┘  └──────────────────────┘       │
│  ┌─────────────┐  ┌──────────────┐  ┌──────────────────────┐       │
│  │ KIS 브로커  │  │ Gemini AI    │  │ Toss Payments        │       │
│  │ AES-GCM 암호│  │ AiGateway    │  │ 구독 결제 confirm    │       │
│  └─────────────┘  └──────────────┘  └──────────────────────┘       │
└──────────────┬──────────────────────────────────────────────────────┘
               │ HTTP + X-Internal-Token (내부 전용)
               ▼
┌─────────────────────────────────────────────────────────────────────┐
│  Analytics FastAPI · Python 3.11  (포트 8001)                       │
│                                                                      │
│  backtest/   vectorbt 백테스트 (6전략 + 무한매수법)                   │
│  metrics/    QuantStats HTML Tearsheet                               │
│  models/     XGBoost 신호 + 자동 재학습 스케줄러                      │
│  explain/    SHAP 설명                                               │
│  robust/     Walk-Forward | 5-State Regime | Trust Score            │
└─────────────────────────────────────────────────────────────────────┘
               │
               ▼
┌──────────────────────┐   ┌────────────────────────────┐
│  MySQL 8             │   │  한국투자증권 KIS OpenAPI    │
│  alphahelix_db       │   │  모의/실거래 REST           │
│  (Flyway 마이그레이션)│   │  토큰 자동 갱신            │
└──────────────────────┘   └────────────────────────────┘
```

---

## 3. 프론트엔드 (React + Vite)

### 기술 스택

| 라이브러리 | 버전 | 용도 |
|-----------|------|------|
| React | 18 | UI 프레임워크 |
| Vite | 7 | 번들러/개발서버 |
| Tailwind CSS | 4 | 유틸리티 CSS |
| Zustand | latest | 전역 상태 (persist) |
| Axios | latest | API 클라이언트 |
| React Router | v7 | SPA 라우팅 |
| FullCalendar | latest | 일정/스케줄 뷰 |
| Stream Chat | latest | 실시간 채팅 |
| Toss Payments | v1 | 결제창 SDK |

### 디렉터리 구조

```
frontend/src/
├── alpha/                  Alpha-Helix 전용 컴포넌트
│   ├── AlphaShell.jsx      워크스페이스 외곽 레이아웃
│   ├── Workspace.jsx       메인 탭(Chat/Config/Report/Regime/Trust/Briefing/Log)
│   ├── WorkspaceList.jsx   워크스페이스 목록
│   ├── ChatDock.jsx        AI 채팅 슬라이드 패널
│   ├── AccountPage.jsx     KIS 계좌 등록/관리
│   ├── ProposalsPage.jsx   OrderProposal 승인 큐
│   ├── OrderConfirmModal.jsx MOCK→REAL 승인 모달
│   ├── alphaApi.js         Alpha API 호출 (axios)
│   └── tabs/               각 탭별 컴포넌트
├── components/
│   ├── shell/
│   │   ├── AppShell.jsx    전체 앱 셸(로그인 상태 관리)
│   │   ├── TopBar.jsx      상단 네비게이션
│   │   ├── LeftSidebar.jsx 왼쪽 사이드바
│   │   ├── SubscriptionModal.jsx  구독 결제 모달 (Toss v1)
│   │   ├── SettingsModal.jsx
│   │   └── RightChatDock.jsx
│   └── ui/                 공통 UI 컴포넌트
├── pages/
│   ├── SubscriptionSuccess.jsx  결제 성공 콜백 페이지
│   ├── SubscriptionFail.jsx     결제 실패 페이지
│   ├── SubscriptionManage.jsx   구독 관리 페이지
│   ├── BrokerSettings.jsx       KIS 계좌 설정
│   ├── NotificationsPage.jsx    알림 센터
│   ├── Pricing.jsx              플랜 소개
│   └── ...                      기타 DevBridge 페이지
├── store/                  Zustand 스토어
│   ├── authStore.js        인증 상태 (JWT 쿠키 연동)
│   └── notificationStore.js 알림 persist
└── api/                    API 모듈 (axios 인스턴스)
```

### 구독 결제 플로우 (SubscriptionModal)

```
1. 모달 열림 → window.__tossV1(클라이언트 키로 초기화된 SDK) 사용
2. 플랜 선택 (STANDARD 9,900 / PREMIUM 19,900)
3. tossPayments.requestPayment("카드", { amount, orderId, ... })
   → Toss 결제창 iframe 팝업
4. 사용자가 결제 완료 → successUrl로 리다이렉트
   https://who-a.com/subscription/success?paymentKey=...&orderId=...&amount=...
5. SubscriptionSuccess.jsx에서 백엔드 POST /api/subscription/confirm 호출
6. 서버가 Toss API 승인 → DB에 구독 저장 → 프론트에 tier 반환
```

### 버튼 색상 시스템 (전 페이지 통일)

| 종류 | 배경 | 글자 |
|------|------|------|
| Primary (최고 강조) | `linear-gradient(135deg, #60a5fa 0%, #3b82f6 50%, #6366f1 100%)` | `white`, fontWeight 700 |
| Secondary (중간 강조) | `#DBEAFE` / hover: `#BFDBFE` | `#1e3a5f`, fontWeight 600 |
| Default (비활성) | `#ffffff` / hover: `#FEF9C3` | `#374151` / hover: `#713f12` |

---

## 4. 백엔드 (Spring Boot)

### 기술 스택

| 라이브러리 | 버전 | 용도 |
|-----------|------|------|
| Spring Boot | 4.0 | 메인 프레임워크 |
| Java | 21 | 런타임 |
| JPA/Hibernate | latest | ORM |
| Flyway | latest | DB 마이그레이션 |
| Resilience4j | latest | Circuit Breaker + Retry |
| Bucket4j | latest | Rate Limiting (AI 20req/hour/user) |
| JJWT | latest | JWT HS256 |
| Spring Mail | latest | Gmail SMTP |
| Gradle | 9 | 빌드 |

### 주요 컨트롤러

| 컨트롤러 | 경로 | 설명 |
|---------|------|------|
| `AlphaWorkspaceController` | `/api/alpha/workspaces` | 워크스페이스 CRUD |
| `AlphaStrategyController` | `/api/alpha/strategy` | 전략 설정 |
| `AlphaAnalyticsController` | `/api/alpha/analytics` | 백테스트/신호 프록시 |
| `SubscriptionController` | `/api/subscription` | 구독 결제 확인 |
| `OrderProposalController` | `/api/proposals` | MOCK/REAL 주문 제안 큐 |
| `BrokerAccountController` | `/api/broker/accounts` | KIS 계좌 등록/조회 |
| `BrokerOrderController` | `/api/broker/orders` | 주문 실행 |
| `NotificationController` | `/api/notifications` | 알림 CRUD |
| `AuthController` | `/api/auth` | 로그인/회원가입/JWT |
| `AiController` | `/api/ai` | Gemini 채팅 (Rate Limited) |
| `TossWebhookController` | `/api/toss/webhook` | Toss 웹훅 수신 |

### 핵심 서비스

#### SubscriptionService
```
activatePro(userId, paymentKey, orderId, amount):
    - 기존 활성 구독 만료 처리
    - 새 Subscription 엔티티 생성 (tier=PRO, status=ACTIVE, expiresAt=+30일)
    - amountKrw 저장 → STANDARD(9,900)/PREMIUM(19,900) 구분에 사용

findActiveSub(userId):
    - 현재 활성(status=ACTIVE, expiresAt > now) 구독 반환

deriveTierDisplay(sub):
    - amountKrw >= 19,900 → "PREMIUM"
    - 그 외 → "STANDARD"
```

#### TossPaymentsService
```
confirm(paymentKey, orderId, amount):
    1. secretKey + ":" → Base64 인코딩 → Basic Auth 헤더
    2. POST https://api.tosspayments.com/v1/payments/confirm
    3. 응답 status == "DONE" 확인
    4. 실패 시 RuntimeException 던짐
    
테스트 키: api.tosspayments.com/v1/payments/confirm (샌드박스)
라이브 키: 동일 URL (실제 결제 확정)
→ URL/로직 차이 없음. 키만 다름.
```

#### DailySignalGenerator
```
매일 22:30 KST 실행:
    1. 사용자별 활성 워크스페이스 조회
    2. Analytics → XGBoost 예측 확률 조회
    3. 신호 임계값(0.6+) 통과 시 OrderProposal 생성 (status=PENDING_MOCK)
    4. HMAC 서명 승인 링크 이메일 발송 (TTL 24시간)
```

#### AnalyticsClient (Resilience4j)
```
백엔드 → Analytics 내부 API 호출
Circuit Breaker: 실패율 50% 이상 시 열림 → 룰베이스 폴백
Retry: 3회 (지수 백오프)
헤더: X-Internal-Token (외부 노출 차단)
```

#### DailySignalGenerator 스케줄러
```
@Scheduled(cron = "0 30 22 * * *", zone = "Asia/Seoul")
- OrderProposalExpiryJob: TTL 만료 큐 자동 정리
- XGBoost 재학습: analytics 서비스의 /retrain 호출
```

#### 보안 구조
```
JwtAuthFilter → AuthContext.currentUserId()
    - JWT HttpOnly 쿠키 우선 파싱
    - Authorization 헤더 fallback (레거시)
    - userId ThreadLocal 저장

APP_CRYPTO_KEY (AES-GCM):
    - KIS appkey/appsecret 암호화 저장
    - 기본값 없음 — 미설정 시 부팅 실패

APPROVAL_HMAC_SECRET:
    - OrderProposal 승인 링크 서명
    - 위조 불가 (이메일로 노출되는 링크 보호)
```

---

## 5. 분석 엔진 (Python FastAPI)

### 기술 스택

| 라이브러리 | 버전 | 용도 |
|-----------|------|------|
| FastAPI | 0.115 | REST API 프레임워크 |
| vectorbt | 0.26 | 백테스트 엔진 |
| quantstats | 0.0.62 | HTML Tearsheet |
| xgboost | 2.1 | 신호 예측 |
| SHAP | 0.46 | 모델 설명 |
| yfinance | latest | 시장 데이터 (→ Polygon.io 예정) |
| pandas / numpy | latest | 데이터 처리 |

### 모듈별 상세

#### `app/backtest/vbt_engine.py` — 백테스트 엔진

6개 전략:

| 전략 ID | 설명 | 특징 |
|---------|------|------|
| `buy_and_hold` | 매수 후 보유 | 벤치마크 기준 |
| `sma_cross` | 단기(20)/장기(50) MA 골든크로스 | 추세 추종 |
| `rsi_meanrev` | RSI < 30 매수, RSI > 70 매도 | 평균회귀 |
| `macd` | MACD 히스토그램 신호선 교차 | 모멘텀 |
| `momentum_12_1` | 12개월 수익률 상위 / 최근 1개월 제외 | 크로스섹셔널 |
| `vix_risk_off` | VIX > 25 시 현금 보유 | 변동성 회피 |

공통 비용: 수수료 0.25%, 슬리피지 0.1%

#### `app/backtest/infinite_buying.py` — 무한매수법

```
- 초기 자본을 N등분하여 분할 매수
- 보유 주식 평균 단가 대비 -n% 하락 시 추가 매수
- 목표 수익률 도달 시 전량 매도
- OrderPlan 반환: 각 레벨별 매수 단가/수량
```

#### `app/metrics/quantstats_report.py` — Tearsheet

```
- quantstats.reports.html() → HTML 리포트 생성
- /reports/{ticker}_{strategy}_{timestamp}.html 정적 서빙
- 주요 지표: Sharpe, Sortino, Max Drawdown, CAGR, Win Rate
```

#### `app/models/xgb_signal.py` — XGBoost 신호

```
피처 (25개):
    - 수익률: 1d/5d/10d/20d/60d
    - 기술적 지표: RSI(14), MACD, BB width, ATR, OBV 변화율
    - 변동성: 실현변동성(5/10/20일), VIX
    - 거시: SPY 상관, 52주 고저비
    
레이블: 다음 5거래일 수익률 > 0 → 1 (상승), 아니면 0

학습: TimeSeriesSplit(5 fold), 최근 3년 데이터
출력: P(상승) 확률 [0.0 ~ 1.0]
```

#### `app/models/retrain_scheduler.py` — 자동 재학습

```
schedule.every().day.at("22:30").do(retrain_all)
- KST 22:30 자동 재학습
- DISABLE_RETRAIN_SCHEDULER=1 환경변수로 CI/테스트 비활성화 가능
- models_cache/xgb_{ticker}.joblib에 저장
```

#### `app/explain/shap_explainer.py` — SHAP 설명

```
- TreeExplainer(xgb_model).shap_values(X_latest)
- 상위 5개 피처 기여도 반환
- 예: {"RSI_14": -0.08, "ret_5d": +0.12, ...}
- 프론트 Briefing 탭에서 "신호 근거" 카드로 표시
```

#### `app/robust/walkforward.py` — Walk-Forward 검증

```
- 학습 윈도우: 252일 (1년), 테스트 윈도우: 63일 (3개월)
- 각 구간별 전략 성과 측정 → 과적합 감지
- 결과: [{period, train_sharpe, test_sharpe, ...}]
- 샘플 외 성과가 샘플 내 대비 급락하면 과적합 경고
```

#### `app/robust/regime.py` — 5-State 시장 레짐 (v2)

레짐 분류 규칙 (우선순위 순):

| 레짐 | 조건 | 의미 |
|------|------|------|
| `bull_quiet` | MA200 위 + slope 양 + vol < 75th | 정상 상승장 — 공격적 포지션 유효 |
| `bull_volatile` | MA200 위 + slope 양 + vol ≥ 75th | 불안한 상승장 — 포지션 축소 고려 |
| `bear` | MA200 아래 + slope 음 + vol < 75th | 하락장 — 현금 비중 확대 |
| `high_vol_unstable` | 하락+공포 (MA200 아래 + slope 음 + vol ≥ 75th) 또는 (횡보 + vol ≥ 80th) | 시장 붕괴 구간 |
| `sideways` | 나머지 | 방향성 없음 |

v2 개선 사항 (2026-05-21):
- 기존 `high_vol_unstable`이 상승장 구간까지 덮어쓰던 오분류 수정 (2020년 3월 반등 오분류 방지)
- MA200 slope: 단순 20일 diff → **EWM span=10** 기반 10일 diff (신호 약 10일 단축)
- vol_high 임계값: 80th percentile → **75th percentile** (레짐 전환 조기 감지)
- `bull_volatile` 독립 분류 추가

#### `app/robust/trust_score.py` — Trust Score (신뢰도 점수)

```
파라미터 섭동 테스트:
    - 전략 파라미터를 ±10%, ±20% 변화시키며 Sharpe 변화율 측정
    - 결과가 안정적일수록 높은 점수 (0~1)
    
Trust Score 해석:
    0.8+: 파라미터 변화에 강건 — 신뢰도 높음
    0.5~0.8: 보통
    0.5-: 과적합 또는 노이즈 — 실거래 주의
```

### API 엔드포인트

모든 엔드포인트에 `X-Internal-Token` 헤더 필수 (외부 직접 호출 차단).

| 메서드 | 경로 | 설명 |
|--------|------|------|
| POST | `/backtest` | 백테스트 실행 |
| POST | `/backtest/infinite` | 무한매수법 실행 |
| GET | `/signal/{ticker}` | XGBoost 예측 확률 |
| GET | `/explain/{ticker}` | SHAP 설명 |
| POST | `/regime` | 레짐 분류 |
| POST | `/walkforward` | Walk-Forward 검증 |
| POST | `/trust` | Trust Score 계산 |
| POST | `/retrain` | 수동 재학습 트리거 |
| GET | `/reports/{file}.html` | Tearsheet 정적 서빙 (인증 없음) |

---

## 6. Toss Payments 결제 시스템

### 키 종류와 차이

| 키 종류 | 현재 값 | 실제 청구 |
|---------|---------|----------|
| 클라이언트 키 (프론트) | `test_ck_D5GePWvyJnrK0W0k6q8gLzN97Eoq` | ❌ (샌드박스) |
| 시크릿 키 (백엔드) | `test_sk_zXLkKEypNArWmo50nX3lmeaxYG5R` | ❌ (샌드박스) |
| 라이브 클라이언트 키 | `live_ck_nRQoOaPz8L5wkdjvMbBN3y47BMw6` | ✅ (토스 계약 후) |
| 라이브 시크릿 키 | 토스 개발자센터에서 확인 | ✅ (토스 계약 후) |

> **핵심**: 클라이언트 키와 시크릿 키는 **반드시 동일 계정의 동일 환경(test/live) 키 쌍**이어야 함. 키 쌍 불일치 시 Toss 서버가 500 반환.

### 전체 결제 플로우

```
[프론트] SubscriptionModal
    │  TossPayments(clientKey).requestPayment("카드", {amount, orderId, ...})
    ▼
[Toss SDK] 결제창 iframe 팝업 (카드/카카오페이/토스페이/... 선택)
    │  사용자 결제 완료
    ▼
[브라우저] successUrl로 리다이렉트
    https://who-a.com/subscription/success?paymentKey=...&orderId=...&amount=...
    │
    ▼
[프론트] SubscriptionSuccess.jsx
    │  POST /api/subscription/confirm { paymentKey, orderId, amount }
    ▼
[백엔드] SubscriptionController.confirm()
    │  1. amount가 VALID_PLANS(9900/19900)에 있는지 검증 (위변조 방지)
    │  2. TossPaymentsService.confirm() 호출
    ▼
[Toss 서버] POST https://api.tosspayments.com/v1/payments/confirm
    │  Authorization: Basic base64(secretKey + ":")
    │  응답: { status: "DONE", ... }
    ▼
[백엔드] SubscriptionService.activatePro()
    │  DB에 Subscription 저장 (tier=PRO, amountKrw=9900 or 19900, expiresAt=+30일)
    ▼
[프론트] 구독 성공 표시
```

### 테스트 vs 라이브 차이

```
코드 로직: 완전히 동일
Toss SDK URL: 동일 (https://js.tosspayments.com/v1/payment)
Toss API URL: 동일 (https://api.tosspayments.com/v1/payments/confirm)

차이점: 키 앞의 "test_" vs "live_" 만 다름
    test_ 키 → Toss 샌드박스 환경
        - 카카오페이/카드/계좌이체 등 가상 결제
        - 실제 출금/청구 없음
        - 결제 성공 흐름은 동일하게 동작
    live_ 키 → Toss 운영 환경
        - 실제 카드 청구 / 카카오페이 출금 발생
        - 토스 가맹 계약 심사 승인 필요
```

---

## 7. 인프라 및 배포

### EC2 구성

```
인스턴스: AWS t3.micro (1 vCPU, 1 GiB RAM)
Elastic IP: 52.4.109.35
도메인: who-a.com
스왑: 2GB (OOM 방지)

서비스:
  - who-a-backend.service   → Spring Boot JAR (:8080)
  - who-a-analytics.service → FastAPI (:8001)
  - nginx                   → 프론트 정적 서빙 + API 프록시
```

### Nginx 설정 요약

```nginx
server {
    listen 443 ssl;
    server_name who-a.com;
    
    # 프론트 정적 파일
    root /var/www/who-a;
    try_files $uri $uri/ /index.html;
    
    # 백엔드 API 프록시
    location /api/ {
        proxy_pass http://127.0.0.1:8080;
    }
    
    # Analytics (백엔드만 접근, 외부 직접 차단)
    # analytics는 내부 포트 — nginx 노출 안 함
}
```

### 배포 절차

```bash
# 1. 프론트엔드
cd frontend
npm run build
# dist.zip → SCP → EC2
scp dist.zip ec2-user@52.4.109.35:/tmp/
ssh ec2-user@52.4.109.35 "cd /var/www/who-a && rm -rf * && unzip /tmp/dist.zip"

# 2. 백엔드
./gradlew bootJar
scp build/libs/devbridge-0.0.1-SNAPSHOT.jar ec2-user@52.4.109.35:/tmp/app.jar
ssh ec2-user@52.4.109.35 "cp /tmp/app.jar /home/ec2-user/app.jar && sudo systemctl restart who-a-backend.service"

# 3. Analytics
# 코드 변경 시 git pull → systemctl restart who-a-analytics.service
```

### t3.micro 제약

- Gradle 빌드 불가 (OOM) → **로컬 빌드 후 SCP**
- 스왑 2GB 필수
- Analytics + Backend 동시 가동 시 메모리 주의

---

## 8. 보안 설계

| 항목 | 설계 | 근거 |
|------|------|------|
| JWT | HttpOnly 쿠키 (Secure+SameSite=Lax) | XSS 토큰 탈취 차단 |
| KIS 자격증명 | AES-GCM 암호화 DB 저장 | 평문 노출 방지 |
| 승인 링크 | HMAC 서명 + 24h TTL | 이메일 노출 링크 위조 차단 |
| MOCK→REAL | 명시 2단계 승인 | 자동 실주문 방지 |
| Kill-Switch | `TRADING_KILL_SWITCH=true` → KIS 어댑터 전체 거부 | 긴급 중단 |
| Rate Limit | AI 채팅 20req/hour/user (Bucket4j) | API 남용 방지 |
| Analytics 내부 토큰 | `X-Internal-Token` 헤더 검증 | 외부 직접 호출 차단 |
| 파일 업로드 | 50MB 제한, path traversal 방지 | OWASP 대응 |
| Toss 금액 검증 | 서버에서 VALID_PLANS 재검증 | 클라이언트 위변조 차단 |
| DB 스키마 | `ddl-auto=validate` + Flyway | 실수로 테이블 드롭 방지 |

---

## 9. 환경변수 전체 목록

### 백엔드 (`/home/ec2-user/.env.prod`)

```
# DB
DB_HOST=
DB_PORT=3306
DB_NAME=alphahelix_db
DB_USERNAME=
DB_PASSWORD=

# 인증
JWT_SECRET=                      # 32+ bytes 랜덤 문자열
APP_CRYPTO_KEY=                   # Base64 32 bytes (KIS 암호화)
APPROVAL_HMAC_SECRET=             # OrderProposal 승인 링크 서명

# AI
GEMINI_API_KEY=
STREAM_CHAT_API_KEY=
STREAM_CHAT_API_SECRET=

# 메일
MAIL_USERNAME=                    # Gmail 주소
MAIL_PASSWORD=                    # Gmail 앱 비밀번호

# Toss 결제
TOSS_SECRET_KEY=test_sk_zXLkKEypNArWmo50nX3lmeaxYG5R  # 현재: 샌드박스
# 운영 전환 시: live_sk_... (토스 개발자센터 라이브 키)

# Analytics 사이드카
ANALYTICS_BASE_URL=http://127.0.0.1:8001
ANALYTICS_INTERNAL_TOKEN=         # 임의 랜덤 문자열 (BE↔Analytics 내부 인증)

# KIS (선택)
TRADING_KILL_SWITCH=true          # 개발 중: true 권장

# CORS
CORS_ALLOWED_ORIGINS=https://who-a.com
```

### 프론트엔드 (`frontend/.env`)

```
# Toss 결제창 SDK 클라이언트 키
VITE_TOSS_CLIENT_KEY=test_ck_D5GePWvyJnrK0W0k6q8gLzN97Eoq  # 현재: 샌드박스
# 운영 전환 시: live_ck_nRQoOaPz8L5wkdjvMbBN3y47BMw6
```

### Analytics (`analytics/.env`)

```
INTERNAL_TOKEN=                   # 백엔드의 ANALYTICS_INTERNAL_TOKEN과 동일
DISABLE_RETRAIN_SCHEDULER=0       # 1로 설정 시 자동 재학습 비활성화 (CI/테스트)
```

---

## 10. 변경 이력

### 2026-05-21

#### Toss Payments 결제 시스템 수정
- **키 쌍 불일치 버그 수정**: 이전 클라이언트 키(`test_ck_yZqmkKeP8g...`)와 시크릿 키(`test_sk_E92LAa5P...`)가 서로 다른 Toss 계정의 키였음 → Toss 서버 500 에러 발생
  - 해결: Toss 공식 docs 테스트 키 쌍(`test_ck_D5GePWvyJnrK0W0k6q8gLzN97Eoq` / `test_sk_zXLkKEypNArWmo50nX3lmeaxYG5R`)으로 통일
  - 수정 파일: `frontend/.env`, EC2 `/home/ec2-user/.env.prod`, `backend/src/main/resources/application.properties`

#### 구독 플랜 다층화
- **STANDARD(9,900원) / PREMIUM(19,900원) 플랜 추가**
- `SubscriptionController`: `VALID_PLANS Map<Long, String>` 도입 — 허용 금액 외 결제 시 400 반환 (위변조 방지)
- `SubscriptionService.deriveTierDisplay()`: amountKrw 기반으로 STANDARD/PREMIUM 구분 표시 (DB에는 Tier.PRO 단일 저장)
- `GET /api/subscription/me`: amountKrw → STANDARD/PREMIUM 분리 응답

#### 프론트엔드 결제 UI
- `SubscriptionModal.jsx`: 4개 플랜 카드(FREE/STANDARD/PREMIUM/EXPERT), window.__tossV1 SDK 활용
- `SubscriptionSuccess.jsx`: 플랜명 동적 표시, 실패 시 모달 재오픈 이벤트 발행
- `index.html`: v1 SDK 블로킹 선로드 (`<script>` HEAD) → v1/v2 전역 충돌 해결

#### Analytics Engine Regime v2 수정
- `app/robust/regime.py` 분류 로직 개선:
  - `high_vol_unstable`이 bull 상승장까지 오버라이드하는 버그 수정 (2020년 3월 반등 오분류 방지)
  - `bull_volatile` 상태 독립 분류 추가 (MA200 위 + slope 양 + vol ≥ 75th)
  - MA200 slope 계산: `20일 diff` → `EWM span=10 기반 10일 diff` (신호 약 10일 단축)
  - vol_high 임계값: 고정 `80th percentile` → 적응형 `75th percentile` (레짐 전환 조기 감지)
