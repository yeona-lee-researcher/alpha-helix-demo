# DevBridge Backend

> Spring Boot 4.0 · Java 21 · MySQL 8 · Gradle 9
>
> Alpha-Helix 프로젝트의 백엔드 서버입니다. **도메인 드리븐(Domain-Driven) 패키지 구조**로 구성되어 있으며, 12개 도메인이 독립적인 레이어(controller / dto / entity / repository / service)를 가집니다.

---

## 📁 패키지 구조

```
com.DevBridge.devbridge
├── DevbridgeApplication.java
├── domain/
│   ├── ai/           (31)  AI 채팅·Gateway·LLM 프로바이더·구독 연동
│   ├── chat/         ( 8)  Stream Chat 채널·메시지 관리
│   ├── client/       ( 9)  클라이언트 프로필·정보
│   ├── interest/     ( 5)  관심 분야 태그 (DTO 없음, 단순 CRUD)
│   ├── match/        ( 4)  파트너-클라이언트 매칭 추천 서비스
│   ├── notification/ ( 5)  알림 저장·조회·읽음 처리
│   ├── partner/      (15)  파트너 프로필·기술 스택·포트폴리오
│   ├── payment/      (10)  Toss Payments 결제·구독 플랜 관리
│   ├── project/      (48)  프로젝트 CRUD·지원·계약·모듈·리뷰·일정
│   ├── review/       (14)  리뷰·평점 작성·조회
│   ├── strategy/     (43)  퀀트 전략·백테스트·OrderProposal·KIS 브로커·구독 서비스
│   └── user/         (29)  회원가입·로그인·JWT·비밀번호·프로필
└── global/
    ├── config/       WebConfig, StreamChatConfig, AiRateLimitFilter
    ├── security/     JwtUtil, JwtAuthenticationFilter, AuthContext
    ├── seed/         DataSeeder, AiModelCatalogSeeder, DataCleanupService
    └── util/         EnumMapper
```

> 괄호 안 숫자는 `.java` 파일 수입니다.

---

## 🏗️ 구조 마이그레이션 이력

### Before — 레이어드(Layered) 구조
```
com.DevBridge.devbridge
├── controller/   (모든 도메인 컨트롤러 혼재)
├── service/      (모든 도메인 서비스 혼재)
├── repository/   (모든 도메인 레포지토리 혼재)
├── entity/       (모든 도메인 엔티티 혼재)
└── dto/          (모든 도메인 DTO 혼재)
```

### After — 도메인 드리븐(Domain-Driven) 구조
각 도메인이 자체 레이어를 소유합니다.
```
domain/{도메인명}/
    controller/  ← @RestController, @RequestMapping("/api/{도메인}")
    dto/         ← Request · Response record/class
    entity/      ← @Entity, @Table
    repository/  ← JpaRepository 인터페이스
    service/     ← @Service, 비즈니스 로직
```

**변경 포인트**:
- 231개 Java 파일 도메인 패키지로 이동
- 크로스 도메인 참조는 import 경로만 수정 (DB 스키마 무변경)
- `SubscriptionService` : `ai.service.gateway` → `strategy.service` 로 재배치 (관리 도메인 일치)
- `application.properties` resilience4j FQN 경로 수정 (`service.AnalyticsClient` → `domain.strategy.service.AnalyticsClient`)

---

## 🗂️ 도메인 상세

### `domain/ai` — AI 채팅 & 멀티 LLM
| 패키지 | 주요 클래스 |
|---|---|
| `service/gateway/` | `AiGatewayService` (쿼터 관리·로그), `GeminiProvider`, `OpenAiProvider`, `AnthropicProvider`, `PerplexityProvider` |
| `service/llm/` | `LlmRouter`, `LlmProvider` (인터페이스), 각 프로바이더 구현체 |
| `entity/` | `AiChatRoom`, `AiChatMessage`, `AiModel`, `AiUsageLog`, `AiQuota` |

> `AiRateLimitFilter` (global/config) : 유저별 AI 채팅 20 req/hour (Bucket4j)

### `domain/strategy` — 퀀트 전략 핵심
| 패키지 | 주요 클래스 |
|---|---|
| `service/` | `StrategyService`, `BacktestService`, `AnalyticsClient` (Resilience4j CB+Retry), `SubscriptionService` |
| `service/broker/` | `KisBrokerService`, `OrderProposalService` |
| `entity/` | `Strategy`, `BacktestResult`, `OrderProposal`, `KisBrokerAccount`, `Subscription` 외 |

### `domain/project` — 프로젝트 생태계 (최대 도메인, 48파일)
- 프로젝트 CRUD, 지원(Application), 계약(Contract), 모듈(Module), 일정(Schedule), 리뷰 연동

### `domain/user` — 인증 (29파일)
- 회원가입 · 로그인 · JWT 발급 · 이메일 인증 · 비밀번호 변경
- `global/security/JwtUtil` + `JwtAuthenticationFilter` 가 토큰 검증

### `domain/payment` — 결제 (10파일)
- Toss Payments v1 결제창 연동 (테스트 키 샌드박스)
- 구독 플랜: FREE / STANDARD / PREMIUM / EXPERT

---

## 🚀 로컬 실행

### 사전 준비
- JDK 21, MySQL 8, `backend/.env` 파일

### `.env` 필수 키
```
DB_HOST=localhost
DB_PORT=3306
DB_NAME=alphahelix_db
DB_USERNAME=root
DB_PASSWORD=<your_password>
JWT_SECRET=<256bit_base64_secret>
GEMINI_API_KEY=<gemini_key>
STREAM_CHAT_API_KEY=<stream_key>
STREAM_CHAT_SECRET=<stream_secret>
APP_CRYPTO_KEY=<32byte_aes_key>
```

### DB 생성
```bash
mysql -uroot -p -e "CREATE DATABASE alphahelix_db CHARACTER SET utf8mb4;"
```

### 실행
```bash
# Windows
.\gradlew bootRun --args="--spring.profiles.active=local"

# Linux/Mac
./gradlew bootRun --args="--spring.profiles.active=local"
```

### 헬스 체크
```bash
curl http://localhost:8080/actuator/health
# {"status":"UP"}
```

---

## ✅ 검증된 엔드포인트

| Method | URL | 인증 | 설명 |
|---|---|---|---|
| GET | `/actuator/health` | 없음 | 앱 상태 |
| POST | `/api/auth/signup` | 없음 | 회원가입 |
| POST | `/api/auth/login` | 없음 | 로그인 (JWT 반환) |
| GET | `/api/projects` | 없음 | 프로젝트 목록 |
| GET | `/api/partners` | 없음 | 파트너 목록 |
| GET | `/api/clients` | 없음 | 클라이언트 목록 |
| GET | `/api/strategies` | JWT | 전략 목록 |
| GET | `/api/notifications` | JWT | 알림 목록 |
| POST | `/api/match/partners` | 없음 | 파트너 매칭 |
| POST | `/api/match/clients` | 없음 | 클라이언트 매칭 |

---

## 🔧 기타

- **JPA**: `ddl-auto=validate` — 스키마 자동 변경 없음, Flyway로 관리
- **Seeder**: 앱 기동 시 기존 데이터 있으면 스킵 (멱등 실행)
- **47개 JPA Repository** 자동 인식 확인됨
- **Analytics 연동**: `http://localhost:8001` (FastAPI), Resilience4j Circuit Breaker + Retry 적용
