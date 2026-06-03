# Alpha-Helix 아키텍처 — 핵심 엔진 지도 · 쉬운 설명 · 검증 · 실사용 로드맵

> AI 기반 퀀트 투자 워크스페이스. 자연어 프롬프트 → 전략 구성 → 백테스트 → OrderProposal 큐 → KIS/Binance 실주문까지 한 흐름.
> 본 문서는 9개 서브시스템 병렬 아키텍처 감사(2026-06-01) 결과를 종합한 것. 각 엔진을 "비개발자도 이해할 쉬운 설명"으로 풀어쓰고, 검증 결과·발견 이슈·실사용 must-have를 우선순위로 정리한다.

---

## 0. 큰 그림 — 3개 프로세스

```
Frontend (React·Vite·:5173)        ← VSCode급 웹 IDE + 트레이딩/계좌 UI
    ↕ REST(/api) · JWT HttpOnly 쿠키
Backend (Spring Boot 4·Java 21·:9091/8080)  ← 도메인 드리븐(strategy/ai/user/payment/notification/global)
    ↕ HTTP + ANALYTICS_INTERNAL_TOKEN (Resilience4j)
Analytics (FastAPI·:8001)          ← vectorbt 백테스트 · XGBoost 시그널 · Trust Score · Regime HMM · Lean
```

- **데이터/주문 흐름(핵심 한 줄)**: 전략 정의 → 일봉 수집(Stooq/Binance) → 백테스트 → BUY 시그널 → PENDING OrderProposal → (사람 승인 또는 autoExecute) → **단일 경로 ProposalExecutionService**(안전게이트) → BrokerRouter → KIS/Binance 실주문 → 체결 폴링 → 잔고 스냅샷.
- **멀티브로커**: `Broker` 인터페이스 + `BrokerRouter` 가 `broker_type`(KIS/BINANCE)만으로 어댑터를 고른다. KIS=미국주식(정수), Binance=크립토 현물(분수·SPOT만).

---

## 1. Frontend

### 1-A. Alpha Developer Studio (VSCode급 웹 IDE) — `DeveloperLab.jsx` 중심
한 화면에 코드 에디터·터미널·데이터·백테스트·AI 에이전트·Git을 통합한 웹 IDE.

| 엔진 | 쉬운 설명 | 성숙도 |
|---|---|---|
| **Monaco 에디터+멀티탭+diff** | VSCode와 같은 엔진(Monaco). 코드/레포파일/백테스트표/데이터/Claude diff를 모두 탭으로. 워크스페이스 코드(fileContents)와 레포 파일(repoContents)을 다른 칸에 보관. | production |
| **RepoExplorer (GitHub 파일트리)** | 좌측에 레포 트리. 파일 클릭→처음 한 번 내려받아 편집, 원본 캐시와 비교해 M/U/D 뱃지. 우클릭 생성/삭제/이름변경. 변경은 메모리에만, Push해야 GitHub 반영. | production |
| **멀티탭 터미널** | xterm.js 화면 + WebSocket(`/ws/terminal`)으로 서버 셸(PowerShell/bash/cmd/SQL) 실행. 기본 OFF + loopback만 허용(RCE 방어). | working |
| **데이터 브라우저** | DB 실적재 현황(polygon/binance)을 카드로, 최근 30행 미리보기. '내 데이터'는 KIS/Binance 잔고 실시간. | working |
| **백테스트 패널** | vectorbt(즉시) vs Lean/QuantConnect(Docker·정밀). 코드에서 파라미터 정규식 추출→실행, Lean은 잡 폴링 스트리밍, 완료 시 수익률커브+지표 리포트. | working |
| **Claude Code 에이전트** | 우측 도크에 자연어 요청→헤드리스 `claude` CLI가 임시폴더에서 코드 편집→diff 탭+ChangeSet→[유지/취소]. 운영 기본 OFF. | working |
| **Git 패널** | PAT 연결→레포 선택→IDE 내 변경/삭제를 묶음 Push, Pull, 커밋히스토리. | production |

### 1-B. 트레이딩·계좌 UI — `AccountPage.jsx` / `ProposalsPage.jsx` / `OrderConfirmModal.jsx`
- **멀티브로커 계좌관리**: 브로커탭(KIS/Binance) × 환경탭(MOCK/REAL) = 통장 4개를 탭으로. 키 길이검증 + 동일키 차단으로 모의키를 실전에 넣는 사고 방지.
- **주문폼**: 프리뷰(한도검증)→실행. KIS 정수주식, Binance 분수수량+MARKET/LIMIT. brokerType로 라우팅.
- **제안 승인큐**: 시그널이 만든 PENDING을 사람이 승인해야 실주문. 크립토면 '주'→코인수량+USDT 자동 전환.
- **한도 인라인 편집**: 한도초과 거부 시 모달 안에서 한도 올리고 즉시 재시도(추천값 자동).

### 1-C. 코어 앱 (라우팅·인증·알림·i18n·테마)
- **App Router**: React Router v7 lazy 코드스플리팅 + 공통 레이아웃(ShelledLayout).
- **Auth State**: 진짜 토큰은 HttpOnly 쿠키(JS 접근 불가, XSS 방어), 화면은 비민감 dbId만. axios가 쿠키 자동전송, 401이면 정리 후 /login.
- **i18n**: EN/KO/ZH 사전, 누락 시 EN→key 폴백, {var} 보간.
- **Theme**: sky/alpha/helix/dev 4종 팔레트, 런타임 전환.
- ⚠️ **알림함은 현재 목 데이터**(가짜 7건)로 백엔드 미연동.

---

## 2. Backend

### 2-A. domain/strategy (퀀트 핵심) — 전략·백테스트·시그널·주문·브로커
| 엔진 | 쉬운 설명 | 성숙도 |
|---|---|---|
| **BacktestService** | 과거 주가를 되감아 '이 규칙대로면 지금 얼마?'를 계산. 무한매수법(라오어)·VR 밸류리밸런싱. CAGR/MDD/승률 + 오늘의 시그널(BUY/HOLD/WATCH/PAUSE). 크립토는 분수수량. 프론트 backtest.js와 1:1. | working |
| **DailySignalGenerator** | 매 평일 22:30 전 활성전략 백테스트→이메일→BUY 시그널을 PENDING 제안으로 큐잉(주식=KIS·코인=Binance 자동선택). autoExecute 계좌면 즉시 자동체결. | working |
| **ProposalExecutionService** | 실주문 직전 **단일 검문소**. kill-switch·PENDING·만료·매매스위치·1건당/일일 USD한도·손실서킷을 한 곳에서 강제. 성공/실패 모두 감사로그(불변). | working |
| **Broker 추상화** | KIS/Binance를 '주문/체결/잔고/시세' 공통 콘센트로 통일(`BrokerRouter`가 broker_type로 분기). KIS 어댑터=정수+거래소폴백, Binance 어댑터=거래소필터 절삭+FUTURES 차단+kill-switch 재확인. | working |
| **KisApiClient** | KIS와 실통신. 브라우저 UA로 EGW00002 우회, 토큰 23h 캐시+잠금, 거래소(NASD/NYSE/AMEX) 폴백, 초당제한 재시도. | production |
| **BinanceApiClient** | HMAC 서명(비밀키 미전송), testnet/메인넷 분기, 429/418 Retry-After 백오프, LOT_SIZE/PRICE_FILTER/MIN_NOTIONAL 절삭. | production |
| **OrderFillService + 폴링잡** | 3분마다 EXECUTED 주문 체결확인. KIS=미체결휴리스틱, Binance=실상태+평균가. 체결 시 잔고 스냅샷 동기화. | working |
| **PromotionGate + 졸업게이트** | 실거래 전환 '운전면허': MOCK 14일+5체결+실패율<30%. 실거래 자동체결은 MOCK 자동매매 2주+20회 추가. | working |
| **TradingControlService** | 재시작 없이 모든 주문을 끄는 비상정지(kill-switch). | working |
| **MarketDataService** | 백테스트용 일봉 창고. 미국주식=Stooq, 크립토=Binance klines. 2일 이상 오래되면 외부 갱신. | working |
| **InfiniteBuyingJob** | 무한매수 구독자에게 평일 22:00 LOC 매수+익절 제안 자동생성(항상 PENDING, 자동체결 안 함). | working |
| **KisFillWebSocketService** | 실시간 체결통보 WS — 승인키+연결검증까지만(구독/파싱 미완). 현재는 폴링이 대신. | prototype |

**데이터흐름**: 전략→MarketData(일봉)→BacktestService(시뮬+시그널)→DailySignalGenerator(제안 큐잉)→approve/autoExecute→**ProposalExecutionService(게이트)**→BrokerRouter→KIS/Binance→주문번호+감사로그→OrderFillPollingJob(체결)→잔고스냅샷. OrderProposalExpiryJob(5분)이 만료 처리.

### 2-B. domain/ai (멀티LLM + 워크스페이스 AI + Claude 에이전트)
- **AiGatewayService**: AI 요청 검문소 — 모델 카탈로그→구독등급 월 토큰한도→프로바이더(Gemini/Anthropic/OpenAI/Perplexity) 라우팅→사용량 로깅.
- **AlphaHelixService**: '퍼스널 퀀트 매니저 두뇌' — 자연어 채팅으로 목표 8항목 수집→Goal Profile JSON→formalize(후보3)→backtest→regime→trust→queue-orders 도미노(auto-run). 무거운 계산은 Analytics 사이드카에 위임.
- **GeminiService**: Gemini 직접호출 + 429 파싱(무료소진→보조모델, RPM→재시도), 친절 메시지 변환.
- **ClaudeCodeAgentService**: 헤드리스 claude CLI 격리실행(읽기/편집/검색만 허용, 셸/인터넷 차단, $1 상한)→diff→ChangeSet(PENDING). 운영 기본 OFF.
- **AlphaPatchService + ClaudeGitSyncService**: 점경로 패치+undo, KEEP 시 연동 repo에 `Co-Authored-By: Claude` 커밋.

### 2-C. domain/user + payment + notification
- **AuthService/JWT**: 회원가입·로그인·JWT 발급. ⚠️ 비밀번호 평문 저장/비교(critical).
- **SubscriptionService(Toss)**: VALID_PLANS 금액 화이트리스트로 위변조 방지. ⚠️ 멱등성 없음(중복결제).
- **NotificationController**: 인앱 알림 — ⚠️ 시그널/체결 타입 없음(마켓플레이스 타입만) + IDOR(userId 파라미터 신뢰).
- **EmailAlertService**: 시그널 이메일 발송(인앱 알림은 미생성).

### 2-D. global (보안·설정·필터)
- **JwtUtil/JwtAuthenticationFilter/AuthContext**: HS256 토큰 발급/검증, 쿠키 우선 추출. ⚠️ Spring Security OFF — 인가는 컨트롤러마다 수동 `AuthContext.currentUserId()` null 체크에 의존(한 곳만 빠지면 무방비).
- **AiRateLimitFilter**: AI 시간당 20회(Bucket4j). ⚠️ 필터 단계 AuthContext null로 제한 미적용 가능 + 인메모리.
- **CryptoService(엄격 Base64) / AesGcmCryptoService(JWT폴백)**: AES-GCM 두 갈래(KIS·Binance용 / GitHub 토큰용). ⚠️ 키 파생 불일치 + 중복.
- **WebConfig**: CORS allowCredentials + 명시 origin. ⚠️ 운영 origin 누락 시 localhost 폴백(프론트 차단).

---

## 3. DB (MySQL 8 · JPA + Flyway)

- **핵심 테이블**: USERS, STRATEGY, DAILY_SIGNAL, ORDER_PROPOSAL, BROKER_ACCOUNT, ORDER_EXECUTION_AUDIT(불변 감사로그), SUBSCRIPTION, alpha_workspace.
- **스키마 경로가 환경별로 둘**: 로컬=Flyway OFF + ddl-auto=update(엔티티가 진실원천), 운영=Flyway ON + validate(V1~V15 스크립트가 진실원천). → **두 경로가 갈라져 '엔티티엔 있고 마이그레이션엔 없는' 변경이 운영에 누락될 수 있음**(broker_account 유니크 등).
- ⚠️ **레거시 DevBridge 테이블 30+개**(프리랜서 매칭: PROJECTS/CLIENT_PROFILE/CLIENT_REVIEW…)가 같은 스키마에 공존 — 죽은 코드. `docs/erd_dbdiagram.sql`은 전부 옛 테이블이라 현행과 완전 불일치.

---

## 4. Analytics (FastAPI · Python)

- **vectorbt 백테스트**(6전략+무한매수, 수수료 0.25%+슬리피지 0.1%) · **XGBoost 시그널**(일 22:30 KST 재학습) + **SHAP 설명** · **QuantStats Tearsheet** · **Trust Score**(Walk-Forward + Regime + 파라미터 섭동) · **Regime v2**(5-State HMM, rule 폴백) · **Lean CLI** 통합(kis_backtest) · **binance_client**(OHLCV 수집).
- 백엔드 `AnalyticsClient`(Resilience4j CB+Retry)로 호출. `ANALYTICS_BASE_URL` 미설정 시 빠르게 폴백.
- ⚠️ Boot4=Jackson3 기본이라 JsonNode 반환이 깨질 수 있어, 클라이언트는 Map/String 반환으로 회피 패턴 사용.

---

## 5. 검증 결과 요약 (코드레벨)

**✅ PASS (정상 배선 확인)**: Lean/Claude/터미널/Git 엔드포인트 계약 일치 · 브로커 KIS/Binance 라우팅 · kill-switch 전 경로 · FUTURES 차단 · MOCK→REAL 졸업게이트 · 결제 금액 화이트리스트 · JWT 쿠키 보안속성 · 감사로그 불변성 · 마이그레이션 V10~V14 엔티티 정합.

**❌ FAIL/이슈는 아래 6장 우선순위 목록 참고.**

---

## 6. 발견된 이슈 (우선순위)

### 🔴 CRITICAL (운영 전 필수 — 보안/자금)
| # | 위치 | 이슈 | 수정안 |
|---|---|---|---|
| C1 | AuthService.signup/login | **비밀번호 평문 저장/비교**(BCrypt 전무). DB 유출=전 계정 비번 노출 | BCryptPasswordEncoder 도입 + 기존 레코드 재해싱 |
| C2 | AuthController.social-login | **email 문자열만으로 JWT 발급** = 계정 탈취 | 서버측 OAuth id_token 검증(aud/iss/exp) 후 verified email만 신뢰 |
| C3 | application(-prod).properties `app.crypto.key` | dev 기본값 + prod 미오버라이드 → 운영 누락 시 **공개 dev키로 브로커 시크릿 암호화** | prod에 `${APP_CRYPTO_KEY}`(폴백X) + dev키 감지 시 부팅거부, 키 로테이션 |
| C4 | `app.approval.hmac-secret` | dev 하드코딩 + prod 미오버라이드 → **주문 승인링크 위조 가능** | prod에 `${APPROVAL_HMAC_SECRET}`(폴백X) |
| C5 | V15 + BrokerAccount | 엔티티 `uq_broker_user_type_env` 유니크가 **어떤 마이그레이션에도 CREATE 안 됨**(V15는 옛 제약 DROP만) → 운영에 유니크 부재→중복계좌 INSERT | V16 신설: 멱등 가드 후 3컬럼 유니크 ADD |
| C6 | V1__baseline + 누락 시드 | from-scratch 시 참조 시드(`devbridge_db_full_*.sql`) 부재 → 빈 DB 운영기동 시 V2부터 실패 | V1을 실제 CREATE TABLE baseline으로 교체 |

### 🟠 MAJOR (실사용 직접 영향)
| # | 위치 | 이슈 | 수정안 |
|---|---|---|---|
| M1 | alphaApi.setBrokerTrading + BinanceActive | **REAL Binance 매매 스위치를 켤 UI가 없음**(brokerType 누락 + 토글버튼 부재) → REAL Binance 수동주문 영구 차단 | setBrokerTrading에 brokerType + BinanceActive 토글버튼 추가 **← 본 커밋에서 수정** |
| M2 | findByUserIdAndEnv (PromotionGate·patchLimits·test·wsKey·resolve) | **같은 env에 KIS+Binance 둘 다면 IncorrectResultSize 500** → KIS REAL 사용자가 Binance도 등록하면 한도조정/연결테스트/승격게이트 깨짐 | 호출부를 findByUserIdAndBrokerTypeAndEnv로 (KIS-only는 KIS 명시) |
| M3 | ProposalExecution/BrokerOrder | **KRW 일일한도(dailyBuyKrw/dailySellKrw) 저장만 되고 실집행 무시**(커밋 32c121b 광고 기능이 dead) | execute에 BUY/SELL KRW 한도검사 배선(estUsd×환율) |
| M4 | DailySignalGenerator | SIGNAL 제안이 limitPrice=null로 KIS에 0원 지정가처럼 나가 **자동체결 거부/미체결** 위험 | 현재가 기반 지정가 산정 |
| M5 | NotificationsPage + store | 알림함이 **목 데이터**, 백엔드 미연동 → 실 시그널/체결 알림 안 뜸 | notifications.api 신설 + 서버연동, 인앱 SIGNAL/EXECUTION/EXPIRY 타입 |
| M6 | Login.jsx EMAIL_ROLE_MAP | **실명 Gmail 4건 하드코딩(PII)** + 프론트 역할부여 안티패턴 | 삭제, 역할은 서버 응답만 |
| M7 | Mypage.handleWithdraw | 회원탈퇴가 로컬 초기화뿐, **서버 계정 삭제 안 함**(개인정보 잔존) | DELETE 계정 API 연동 |
| M8 | SubscriptionService.activatePro | 결제 **멱등성 없음** → 중복 confirm 시 구독 중복/반복승급 | tossPaymentKey 유니크 + 기존조회 멱등 |
| M9 | NotificationController | **IDOR** — userId 파라미터 신뢰 → 타인 알림 조회 | AuthContext 본인만 |
| M10 | AiRateLimitFilter | 필터단계 AuthContext null → **rate limit 미적용 가능**(AI 비용폭탄) | request attribute 직접 읽기 + FilterRegistrationBean 순서 |
| M11 | axios 401 보호경로 | DevBridge 레거시 URL 기준 → Alpha-Helix 화면에서 토큰만료 시 **작성중 폼 날아가며 강제 로그아웃** | 실제 라우트 기준 재작성 |

### 🟡 MINOR (정리/품질)
Deploy 버튼 스텁 · DeveloperLab 죽은 import · Lean 차트 x축 라벨 공백 · 한도에러 한글 문자열 매칭 취약 · patchBrokerLimits brokerType 누락 · KIS 탭 외부 favicon · BrokerOrderController.place가 손실서킷/KRW한도 우회(두번째 경로) · Binance MARKET BUY가 quoteOrderQty 미사용 · friendlyKisError 3중복 · USD_KRW=1300 하드코딩 · slogan 고아필드 · 두 Crypto 서비스 중복 · ddl-auto 문서불일치 · ERD 문서 전면 불일치 · DevBridge 레거시 죽은코드(찜/역할/kakao).

---

## 7. 실사용 로드맵 (must-have) + 비전

### 즉시(실거래 안전)
- M1 REAL Binance 토글, M2 NonUnique, M3 KRW 한도 집행, C1~C6 보안/스키마.

### 단기(실유저 신뢰)
- 알림 실연동(M5) · 멱등 결제(M8) · IDOR/PII 정리(M9·M6·M7) · 실시간 환율 · 인증코드 Redis 영속 · Spring Security 도입(프레임워크 인가).

### 중기(IDE·워크스페이스 비전)
- **VSCode급 IDE**: Claude 에이전트↔레포 파일(repoContents) 편집모델 통합(현재 분리) · 미저장 변경 보호(beforeunload) · 폴링 언마운트 정리 · 자동저장 · 터미널 PTY.
- **음성 워크스페이스(Helly)**: 자연어 채팅에 음성 입출력(STT/TTS) 결합 — AlphaHelixService 채팅 파이프라인 위에 음성 레이어. (신규)
- KIS 체결통보 WS 완성 · 데이터 재현성 파이프라인 · DevBridge 레거시 대청소.

---

*생성: 9-에이전트 병렬 아키텍처 감사 워크플로우(`alpha-helix-architecture-audit`), 2026-06-01.*
