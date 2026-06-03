# `09_db/entities_and_tables.md` — DB 엔티티·테이블 완전 해설 (라인별 교재)

> 원본: `backend/src/main/java/com/DevBridge/devbridge/domain/*/entity/*.java` (37개 파일) 와
> 실제 스키마 덤프 `backend/docs/schema_full_current.sql` (797줄) 대조.
> 이 문서는 교재 표준 형식(README "3. 공통 형식")을 따릅니다 — 모든 사실은 **코드/스키마만** 근거(추측 금지).

---

## 📌 한눈에

이 문서는 백엔드가 MySQL 에 **데이터를 어떻게 담는지**, 즉 **"서랍장 설계도"** 입니다.

> 비유: DB 는 **여러 칸짜리 큰 서랍장(=테이블 집합)** 입니다. 서랍 하나(=테이블)에는 같은 모양의 카드(=행/row)들이 쌓이고, 카드의 칸(=컬럼)은 정해진 규격(타입·길이)을 가집니다. 자바의 `@Entity` 클래스는 **"이 서랍은 이렇게 생겼다"** 고 적은 **설계도면**이고, Hibernate(JPA)가 그 도면을 보고 실제 서랍(MySQL 테이블)을 만들거나 검증합니다.

이 프로젝트의 DB 에는 **두 종류의 서랍**이 섞여 있습니다. 같은 `users` 테이블을 공유하지만 용도가 완전히 다릅니다.

| 분류 | 무엇인가 | 대표 테이블 | 도면 패키지 |
|---|---|---|---|
| **🟢 Alpha 핵심** | 퀀트 투자 워크스페이스(현재 제품) | `users` · `broker_account` · `order_proposal` · `strategy` · `subscription` · `alpha_workspace` · `alpha_chat_message` · `notification` · `payment_methods` · `order_execution_audit` · `daily_signal` · `refresh_tokens` · `ai_*` | `domain/user`, `domain/strategy`, `domain/ai`, `domain/payment`, `domain/notification` |
| **🟡 DevBridge 레거시** | **이전 프로젝트(프리랜서·외주 매칭 플랫폼)** 의 잔재 — 현재 Alpha-Helix 기능에서 거의 안 씀 | `projects` · `project_*` · `client_profile*` · `skill_master` · `chat_room` | `domain/project`, `domain/client`, `domain/chat` |

> ⚠️ 왜 레거시가 남아있나? 이 코드베이스는 원래 **DevBridge**(프리랜서 매칭)였다가 **Alpha-Helix**(퀀트 투자)로 피벗했습니다. 패키지 루트가 아직 `com.DevBridge.devbridge` 인 것도 그 흔적입니다. 레거시 테이블은 **삭제하지 않고 그대로 둔 채** 새 Alpha 테이블을 얹었습니다. (자세한 함정은 마지막 ⚠️ 섹션.)

**누가 쓰나?** → 각 도메인의 `Service`/`Repository` 가 이 엔티티들을 읽고 씁니다. 예: `OrderProposalService` → `order_proposal`, `SubscriptionService` → `subscription`, `BacktestService`/`AlphaWorkspaceService` → `alpha_workspace`.

---

## 🧠 사전 지식 (이거 모르면 막힘)

### 1) 엔티티(클래스) ↔ 테이블(서랍) 1:1 매핑

```java
@Entity                       // "이 클래스는 DB 테이블 한 개에 대응한다"
@Table(name = "USERS")        // 실제 테이블 이름 (대소문자는 MySQL이 보통 소문자로 저장 → users)
public class User { ... }
```
- 자바 클래스 `User` ↔ 테이블 `users`. 클래스의 **필드 1개 = 컬럼 1개**.
- `@Table(name=...)` 이 없으면 클래스명을 그대로 테이블명으로 씁니다. 이 프로젝트는 거의 다 명시합니다.

### 2) `@Id` / `@GeneratedValue` = "카드 일련번호(기본키)"

```java
@Id                                                  // 이 컬럼이 기본키(Primary Key)
@GeneratedValue(strategy = GenerationType.IDENTITY)  // 값은 DB가 자동으로 1,2,3... 매김 (MySQL AUTO_INCREMENT)
private Long id;
```
- **기본키(PK)** = 그 서랍 안에서 카드를 유일하게 찾는 번호. 거의 모든 테이블이 `id BIGINT AUTO_INCREMENT`.
- 예외: `ai_model_catalog` 는 PK 가 숫자가 아니라 문자열 `model_id`(예: `"gemini-2.5-flash"`) — `@GeneratedValue` 없이 직접 지정.

### 3) `@Column` = "칸의 규격(타입·길이·NULL 허용·유니크)"

```java
@Column(nullable = false, unique = true, length = 100)
private String email;        // → email VARCHAR(100) NOT NULL UNIQUE
```
- `nullable=false` → `NOT NULL`(비워둘 수 없음), `unique=true` → 그 컬럼은 중복 금지, `length` → `VARCHAR(N)`.
- `columnDefinition="TEXT"`/`"LONGTEXT"`/`"JSON"` → 긴 텍스트/JSON 통째로 저장. (예: 워크스페이스의 백테스트 결과 JSON.)
- `precision/scale` → `DECIMAL(전체자리, 소수자리)`. 돈/가격은 부동소수(`double`) 대신 `BigDecimal + DECIMAL` 로 **정확히** 저장. 예: `precision=18, scale=4` = 정수 14자리 + 소수 4자리.

### 4) `@Enumerated(EnumType.STRING)` = "정해진 보기 중 하나를 글자로 저장"

```java
@Enumerated(EnumType.STRING)   // enum 을 이름 문자열로 저장 (ORDINAL=숫자 저장은 위험 → 안 씀)
private Env env;               // → env ENUM('MOCK','REAL')
```
- enum 을 **이름(문자열)** 으로 저장하므로, 나중에 enum 순서가 바뀌어도 안전합니다. MySQL 에는 `ENUM('MOCK','REAL')` 로 굳어집니다.
- 특수 케이스: `User.userType` 은 enum 이지만 `@Enumerated` 대신 **`@Convert(UserTypeConverter.class)`** 를 씁니다(아래 User 해설 참고). DB 엔 `VARCHAR + CHECK` 제약으로 저장.

### 5) `@ManyToOne` / `@OneToOne` / `@JoinColumn` = "다른 서랍을 가리키는 화살표(외래키)"

```java
@ManyToOne(fetch = FetchType.LAZY)         // 여러 BrokerAccount → 한 User (N:1)
@JoinColumn(name = "user_id", nullable = false)
private User user;                          // → user_id BIGINT, FK → users(id)
```
- **외래키(FK)** = "이 카드는 저 서랍의 몇 번 카드에 속함"을 가리키는 화살표. 여기선 "이 브로커 계정은 user_id=42 사용자의 것".
- `fetch = LAZY` = **필요할 때만** 연결된 User 를 DB 에서 꺼냄(성능). `EAGER`(항상 즉시 로딩)는 안 씀.
- ⚠️ 패턴 주의: 어떤 엔티티는 연관을 **객체(`@ManyToOne User user`)** 로, 어떤 건 **그냥 숫자(`Long userId`)** 로 듭니다. 예: `OrderProposal.userId`, `Subscription.userId` 는 **FK 제약 없는 생 Long** 입니다(스키마에 CONSTRAINT 없음). 이건 "느슨한 결합 + 권한은 코드로 검증" 전략입니다.

### 6) 유니크 제약(Unique Constraint) = "이 조합은 한 번만"

```java
@Table(name="BROKER_ACCOUNT", uniqueConstraints = {
    @UniqueConstraint(name="uq_broker_user_type_env", columnNames={"user_id","broker_type","env"})
})
```
- "한 사용자(user_id)는 같은 (브로커종류, MOCK/REAL) 조합의 계좌를 **딱 1개만**" 같은 규칙을 **DB 레벨로** 강제. 애플리케이션 버그가 있어도 중복이 물리적으로 안 들어갑니다. (강력한 마지막 방어선.)

### 7) `@Index` = "빨리 찾기용 색인"

- 책 맨 뒤 "찾아보기" 처럼, 자주 조건검색하는 컬럼에 색인을 미리 만들어 둠. 예: `order_proposal` 의 `idx_op_user_status (user_id, status)` → "내 PENDING 제안만" 조회가 빠릅니다.

### 8) `ddl-auto` — 로컬과 운영이 다르게 동작 ★중요

| 환경 | 설정 | 동작 |
|---|---|---|
| **로컬** (`application.properties`) | `ddl-auto=update`, `flyway.enabled=false` | Hibernate 가 엔티티를 보고 **없는 테이블/컬럼을 자동 추가**. 편하지만 **제약/타입 변경은 안 해줌** → 드리프트 위험. |
| **운영** (`application-prod.properties`) | `ddl-auto=validate`, `flyway.enabled=true` | Hibernate 는 **건드리지 않고 검증만**. 스키마 변경은 오직 **Flyway 마이그레이션**(`db/migration/V*.sql`)으로. 엔티티와 테이블이 안 맞으면 **부팅 실패**. |

> 이 차이가 여러 버그의 근원이었습니다. 로컬에선 `ddl-auto=update` 가 새 컬럼/제약을 몰래 만들어줘서 통과하지만, 운영(`validate`)은 마이그레이션이 없으면 부팅이 깨집니다. 그래서 `V10`~`V18` 마이그레이션이 "로컬에선 자동, 운영은 이 파일로"라는 주석을 달고 있습니다(예: V16 의 `uq_broker_user_type_env`, V18 의 `refresh_tokens`).

### 9) 시간 컬럼 자동 채움 — `@CreatedDate` / `@CreationTimestamp` / `@UpdateTimestamp`

- `@CreatedDate`(+`@EntityListeners(AuditingEntityListener.class)`) / `@CreationTimestamp` → 행 생성 시각 자동 기록.
- `@UpdateTimestamp` → 수정될 때마다 자동 갱신. 일부 엔티티(`Subscription`, `AiModelCatalog`)는 `@PrePersist`/`@PreUpdate` 콜백으로 직접 채웁니다.

---

## 📖 핵심 엔티티별 해설

각 항목: **어떤 테이블 / 주요 필드 의미 / 키·제약 / 누가 쓰나** 순. `파일:줄` 로 근거를 가리킵니다.

---

### 1) `User` → 테이블 `users` — 모든 것의 중심

`User.java:13-21` · 스키마 `schema_full_current.sql:739-765`

회원 1명 = 1행. 거의 모든 다른 테이블이 `user_id` 로 이 행을 가리킵니다(허브).

| 필드(파일:줄) | 컬럼 | 의미 |
|---|---|---|
| `id` (`:23`) | `id` BIGINT PK | 회원 일련번호 |
| `email` (`:27`) | `email VARCHAR(100)` **UNIQUE NOT NULL** | 로그인 이메일 (중복 불가) |
| `username` (`:33`) | `username VARCHAR(50)` **UNIQUE NOT NULL** | 표시 이름 (중복 불가) |
| `password` (`:36`) | `password VARCHAR(255)` | **BCrypt 해시**(평문 저장 금지 — C1 보안수정) |
| `userType` (`:39-41`) | `user_type VARCHAR` + CHECK | 요금제. `@Convert(UserTypeConverter)` 사용 |
| `githubTokenEncrypted` (`:79`) | `github_token_encrypted VARBINARY(512)` | GitHub PAT — **AES-GCM 암호화 바이트**(평문 금지) |
| `gender`(`:46`)·`birthDate`·`region`·`bank*` | 각 컬럼 | 프로필/정산 정보 |

- **키/제약**: PK `id`; UNIQUE `email`, `username`; `user_type` 에 `CHECK (... in ('PREMIUM','FREE','STANDARD'))` (스키마 `:764`).
- **함정 — userType 의 이중 호환**: enum 은 `FREE/STANDARD/PREMIUM` (`:94-110`) 인데, **과거 DevBridge 시절 값** `CLIENT/USER/PARTNER/PRO` 가 DB 에 남아 있습니다. 그래서 `UserTypeConverter`(`UserTypeConverter.java:22-28`)가 읽을 때 구값을 새 값으로 매핑(`CLIENT→FREE`, `PARTNER→STANDARD`)하고, 쓸 때는 항상 새 값으로 저장합니다. JSON 역직렬화용 `@JsonCreator fromJson`(`User.java:100-109`)도 같은 역할.
- **누가 쓰나**: `domain/user` 전체(가입·로그인·JWT) + FK 로 거의 전 도메인.

---

### 2) `RefreshToken` → 테이블 `refresh_tokens` — 로그인 유지 토큰

`RefreshToken.java:8-15` · 스키마 `:775-785`

JWT 액세스 토큰이 만료돼도 재로그인 없이 갱신하기 위한 리프레시 토큰 저장소.

| 필드 | 컬럼 | 의미 |
|---|---|---|
| `userId` (`:21`) | `user_id BIGINT NOT NULL` | 소유자 (생 Long, FK 제약 없음) |
| `token` (`:24`) | `token VARCHAR(64)` **UNIQUE** | 난수 토큰 문자열 |
| `expiresAt` (`:27`) | `expires_at DATETIME(6)` | 만료 시각 (`isExpired()` 로 검사 `:42`) |

- **키/제약**: PK `id`; UNIQUE `token`; 색인 `idx_rt_user_id`, `idx_rt_expires_at`.
- **함정(역사)**: 이 테이블은 `main` 브랜치가 기능만 추가하고 Flyway 마이그레이션을 빠뜨렸던 곳. 로컬(`ddl-auto=update`)은 자동 생성됐지만 운영(`validate`)은 부팅이 깨질 뻔했고, `V18__refresh_tokens_table.sql` 이 `CREATE TABLE IF NOT EXISTS` 로 메웠습니다(스키마 주석 `:769`).
- **누가 쓰나**: `domain/user` 의 토큰 재발급 로직. 생성 팩토리 `RefreshToken.of(userId, token, ttlDays)` (`:33`).

---

### 3) `BrokerAccount` → 테이블 `broker_account` — 증권/거래소 자격증명 + 매매 한도 ★보안 핵심

`BrokerAccount.java:19-25` · 스키마 `:119-146`

사용자별 KIS(한국투자증권) 또는 Binance 계정 1개. **실제로 주문을 내보낼 수 있는 열쇠** 라 가장 민감합니다.

| 필드(파일:줄) | 컬럼 | 의미 |
|---|---|---|
| `user` (`:37-39`) | `user_id` FK→users | 소유자 (여기선 `@ManyToOne` 객체) |
| `env` (`:41-44`) | `env ENUM('MOCK','REAL')` | 모의/실전. 기본 `MOCK` |
| `brokerType` (`:47-50`) | `broker_type ENUM('KIS','BINANCE')` | 브로커 종류. 기본 `KIS` |
| `appKey` (`:55`) | `app_key VARCHAR(100)` | KIS appkey (공개키성) |
| `appSecretEnc` (`:59`) | `app_secret_enc TEXT` | KIS appsecret — **CryptoService.encrypt() 후** 저장(평문 금지) |
| `binanceApiSecretEnc` (`:77`) | `binance_api_secret_enc TEXT` | Binance 시크릿 — 역시 암호화 후 저장 |
| `maxOrderUsd`(`:87`)·`dailyOrderUsd`(`:92`)·`dailyLossLimitUsd`(`:97`) | 각 BIGINT | 1건/일일/손실 한도(USD). 서킷브레이커 |
| `dailyBuyKrw`(`:101`)·`dailySellKrw`(`:105`) | 각 BIGINT | **KIS 전용** 1일 매수/매도 한도(KRW) |
| `tradingEnabled` (`:109`) | `trading_enabled BIT NOT NULL` | 마스터 스위치. false면 모든 승인 거부 |
| `autoExecute` (`:118`) | `auto_execute BIT NOT NULL` | 사람 승인 없이 자동체결 토글(기본 OFF) |
| `lastBalanceJson` (`:128`) | `last_balance_json LONGTEXT` | 체결 후 잔고 스냅샷 JSON (B2) |

- **키/제약 ★**: `uq_broker_user_type_env (user_id, broker_type, env)` (`:20-22`, 스키마 `:144`). → "한 사용자는 KIS-REAL 계좌를 단 1개만" 같은 규칙을 DB 가 보장. **다중 브로커 NonUnique 500 버그(M2)** 가 이 제약을 운영에 빠뜨려서 났고 `V16` 으로 복구.
- **상수**: `USD_KRW_APPROX = 1300.0` (`:31`) — KRW 한도 검증 시 USD→KRW 근사 환율(TODO: 실시간 환율).
- **누가 쓰나**: `KisBrokerService`, Binance 어댑터, `OrderProposalService`(승인 시 한도/스위치 검사), `BrokerAccountController`.

---

### 4) `OrderProposal` → 테이블 `order_proposal` — 주문 제안 + 상태머신 ★실주문 게이트

`OrderProposal.java:24-31` · 스키마 `:331-362`

자동 시그널이나 수동으로 만든 **"이 주문 낼까요?" 제안**. **승인 전엔 절대 브로커로 안 나갑니다.**

```
상태머신(Lifecycle):
  PENDING ──승인──▶ APPROVED ──실행──▶ EXECUTED
     │                              └─실패─▶ EXEC_FAILED
     ├──거절──▶ REJECTED
     └──24h경과──▶ EXPIRED   (OrderProposalExpiryJob 이 자동 전환)
```

| 필드(파일:줄) | 컬럼 | 의미 |
|---|---|---|
| `userId`(`:38`)·`brokerAccountId`(`:46`) | BIGINT | 소유자/대상 계좌 (생 Long, 권한은 코드로 검증) |
| `workspaceId` (`:42`) | `workspace_id` (nullable) | 어느 워크스페이스 발 (수동이면 null) |
| `ticker`·`side`·`qty` (`:50-59`) | VARCHAR/INT | 종목 / BUY·SELL / 정수 수량 |
| `qtyDecimal` (`:65`) | `qty_decimal DECIMAL(28,8)` | 크립토 분수 수량(있으면 우선) |
| `limitPrice` (`:69`) | `limit_price DECIMAL(18,4)` | 지정가(null=시장가) |
| `source` (`:73-75`) | `source VARCHAR(16)` | `SIGNAL`/`MANUAL` |
| `status` (`:82-84`) | `status VARCHAR(16)` | 위 상태머신 값 (문자열) |
| `kisOrderNo`(`:91`)·`execError`(`:95`) | VARCHAR | 체결 시 KIS 주문번호 / 실패 메시지 |
| `expiresAt`(`:99`)·`decidedAt`·`executedAt` | DATETIME | 만료/결정/실행 시각 |
| `autoExecuted` (`:110`) | `auto_executed BIT` | 자동체결 여부(REAL 졸업 게이트 집계) |
| `fillStatus`/`filledQty`/`fillAvgPrice` (`:114-129`) | — | 실제 체결 폴링 결과(B1, EXECUTED 와 별개) |

- **키/제약**: 색인 3개 — `idx_op_user_status (user_id, status)`, `idx_op_workspace`, `idx_op_expires (expires_at)` (`:25-29`). 유니크 제약은 없음.
- **보안 원칙(클래스 주석 `:18-23`)**: ① 시그널이 PENDING 까지는 자동 생성 가능, 그러나 EXECUTED 전환은 반드시 인증된 사용자의 명시적 액션. ② `BrokerAccount.tradingEnabled=false` 면 실행 거부. ③ 만료는 스케줄러가 자동.
- **HMAC**: 이메일 승인 링크는 `APPROVAL_HMAC_SECRET` 으로 서명되어 위조를 막습니다(승인 토큰 자체는 이 테이블이 아니라 서명으로 검증).
- **누가 쓰나**: `OrderProposalService`(발급·승인·만료), `DailySignalGenerator`/`InfiniteBuyingJob`(PENDING 생성), `OrderProposalController`.

---

### 5) `OrderExecutionAudit` → 테이블 `order_execution_audit` — 불변 감사 로그

`OrderExecutionAudit.java:16-25` · 스키마 `:307-326`

실제로 브로커로 **나간 주문 시도**(EXECUTED/EXEC_FAILED)를 **append-only(추가만, 수정·삭제 금지)** 로 영구 보존. 규제/세무/추적용.

| 필드 | 컬럼 | 의미 |
|---|---|---|
| `proposalId` (`:34`) | `proposal_id` (nullable) | 어느 제안에서 나갔나 |
| `env`·`ticker`·`side`·`qty`·`limitPrice` | — | 그 순간 주문 내용 스냅샷 |
| `kisOrderNo`·`rtCd` (`:55-60`) | — | KIS 주문번호 / 응답코드(0=성공) |
| `outcome` (`:67`) | `outcome VARCHAR(16)` | `EXECUTED`/`EXEC_FAILED` |

- **키/제약**: 색인 `idx_oea_user (user_id, created_at)`, `idx_oea_proposal`. `@Setter` 없음(`@Getter` 만) — **불변성** 을 코드 레벨로도 강제.
- **OrderProposal 과 차이**: 제안은 상태가 바뀌고 EXPIRED 로 변하지만, 이 테이블은 "그 순간 무슨 주문이 나갔나"를 **영원히** 박제(클래스 주석 `:13-15`).
- **누가 쓰나**: 실주문 실행 경로(B3)에서 매 시도마다 1행 기록.

---

### 6) `Strategy` → 테이블 `strategy` — 퀀트 전략 정의

`Strategy.java:17-28` · 스키마 `:610-630`

사용자 1명이 N개 전략 운영. 각 전략 = 단일 종목 + 단일 method.

| 필드(파일:줄) | 컬럼 | 의미 |
|---|---|---|
| `user` (`:36-38`) | `user_id` FK→users | 소유자(`@ManyToOne`) |
| `code` (`:41`) | `code VARCHAR(64) NOT NULL` | 사용자 정의 코드(예: `STR-TQQQ-INF`) |
| `method` (`:47-49`) | `method ENUM('INFINITE_BUY','VALUE_REBALANCING')` | 전략 종류 |
| `ticker`·`benchmark` | VARCHAR(16) | 종목 / 벤치마크 |
| `principalKrw` (`:58`) | `principal_krw BIGINT NOT NULL` | 원금(KRW) — 전략 간 자금 분리를 DB로 강제 |
| `paramsJson` (`:75`) | `params_json JSON NOT NULL` | method별 파라미터(분할수·익절% 등)를 JSON 통째로 |
| `active` (`:78`) | `active BIT NOT NULL` | 활성 여부 |

- **키/제약**: 색인 `ix_strategy_user`, `ix_strategy_active`; FK→users. (`code` 의 "사용자별 unique" 는 주석에만 있고 DB 유니크 제약은 없음 — 코드 검증.)
- **누가 쓰나**: `StrategyService`, `DailySignalGenerator`, `InfiniteBuyingJob`, 그리고 아래 strategy_* 자식 테이블들의 부모.

---

### 7) `Strategy` 위성 테이블들 (`daily_signal` · `strategy_state` · `strategy_trade` · `strategy_backtest_summary`)

모두 `strategy_id` FK 로 `Strategy` 에 매달린 자식들.

| 엔티티(파일) | 테이블 | 역할 | 키/제약 |
|---|---|---|---|
| `DailySignal` (`DailySignal.java:16-28`) | `daily_signal` | 매일 전략별 1건 BUY/HOLD/WATCH/PAUSE + 사람이 읽는 텍스트 | UNIQUE `uq_signal_strategy_date (strategy_id, as_of_date)` — 하루 1건 보장. `signal` 컬럼은 예약어라 `` `signal` `` 로 백틱 이스케이프(`:44`) |
| `StrategyState` (`StrategyState.java:17-29`) | `strategy_state` | 전략 일별 상태 스냅샷(현금·주식수·평단·V값 등) | UNIQUE `uq_state_strategy_date` |
| `StrategyTrade` (`StrategyTrade.java:17-28`) | `strategy_trade` | 매매 체결 1건. `source=BACKTEST/LIVE/MANUAL` 로 백테스트·실거래 같은 테이블 공유 | 색인 `ix_st_strategy_date`, `ix_st_source` |
| `StrategyBacktestSummary` (`StrategyBacktestSummary.java:17-27`) | `strategy_backtest_summary` | 전략별 백테스트 메트릭 캐시(CAGR·MDD·승률·TrustScore) 1건 upsert | UNIQUE `uq_bt_strategy (strategy_id)` (`@OneToOne`) |

- 돈/가격 컬럼은 전부 `DECIMAL(18,4)` 등 `BigDecimal` (부동소수 오차 방지).

---

### 8) `InfiniteBuyingSubscription` → 테이블 `infinite_buying_subscription` — 무한매수법 자동매매 구독

`InfiniteBuyingSubscription.java:26-33` · 스키마 `:244-265`

라오어식 무한매수법 자동매매 설정. 사용자+계좌+티커 = 1행. 스케줄러가 매 거래일 자동 `OrderProposal` 생성.

| 필드 | 컬럼 | 의미 |
|---|---|---|
| `user`·`brokerAccount` (`:39-45`) | FK | 소유자 / 발주 계좌(둘 다 `@ManyToOne`) |
| `seedUsd` (`:52`) | `seed_usd DOUBLE NOT NULL` | 종목별 분리 원금(USD) |
| `splitCount` (`:56`) | `split_count` 기본 40 | 분할 횟수 |
| `bigBuyPremiumPct`·`takeProfitPct` | DOUBLE | LOC 큰수매수 프리미엄% / 익절% |
| `currentSplitRound` (`:81`) | INT | 현재 사이클 누적 회차(익절 시 0 리셋) |
| `lastRunAt`·`lastRunMsg` | — | 중복 방지 / 디버그 |

- **키/제약**: UNIQUE `uq_ibs_account_ticker (broker_account_id, ticker)` (`:27-30`) — 한 계좌+종목 조합 1구독.
- **누가 쓰나**: `InfiniteBuyingJob`(스케줄러), 무한매수 설정 컨트롤러.

---

### 9) `Subscription` → 테이블 `subscription` — 결제 구독 ★M8 멱등성

`Subscription.java:12-27` · 스키마 `:698-713`

Toss 결제 1회 = Pro 1개월. 만료되면 FREE 강등.

| 필드 | 컬럼 | 의미 |
|---|---|---|
| `userId` (`:33`) | `user_id BIGINT` | 소유자(생 Long) |
| `tier` (`:36-38`) | `tier ENUM('FREE','PRO')` | 등급 |
| `status` (`:40-42`) | `status ENUM('ACTIVE','EXPIRED','FREE')` | 상태 |
| `startedAt`·`expiresAt` | DATETIME | Pro 시작/만료(이후 자동 EXPIRED) |
| `tossPaymentKey` (`:53`) | `toss_payment_key VARCHAR(200)` | Toss 결제 키 |
| `amountKrw` (`:61`) | `amount_krw BIGINT` | 결제 금액 |

- **키/제약 ★M8**: UNIQUE `uq_subscription_toss_payment_key (toss_payment_key)` (`:15-17`). → **같은 Toss 결제키로 중복 구독 생성 차단**(결제 confirm 멱등성을 DB 로 보장). 결제 confirm 이 두 번 호출돼도 구독이 두 개 안 생깁니다.
- 색인: `ix_sub_user_status`, `ix_sub_user_expires`.
- **누가 쓰나**: `SubscriptionService`(플랜 확인·기능 접근 제어), `SubscriptionController`(Toss 결제 confirm).

---

### 10) `PaymentMethod` → 테이블 `payment_methods` — 카드 마스킹 저장

`PaymentMethod.java:17-25` · 스키마 `:367-382`

PCI 정책상 **카드 전체번호·CVC 는 절대 저장 안 함**. last4·brand·만료만 보관.

| 필드 | 컬럼 | 의미 |
|---|---|---|
| `user` (`:31-33`) | `user_id` FK | 소유자(`@ManyToOne`) |
| `brand` (`:35-37`) | `brand ENUM('VISA',...,'LOCAL')` | 카드 브랜드 |
| `last4` (`:39`) | `last4 VARCHAR(4)` | 카드 끝 4자리(마스킹) |
| `holderName`·`expMonth`·`expYear` | — | 소유자명/만료 |
| `isDefault` (`:51`) | `is_default BIT` | 기본 결제수단 여부 |

- 등록 시 Luhn 검증만 통과시키고 마스킹 정보만 저장(클래스 주석 `:12-16`).
- **누가 쓰나**: `domain/payment`(결제수단 관리).

---

### 11) `AlphaWorkspace` → 테이블 `alpha_workspace` — 전략 워크스페이스 (JSON 컬럼 다수)

`AlphaWorkspace.java:18-21` · 스키마 `:76-97`

"Slack 채널처럼 전략 1개 = 워크스페이스 1개". Goal/Config/Backtest/Trust/Regime 결과가 여기 모입니다. **JSON 캐시 컬럼이 많은 게 특징**.

| 필드(파일:줄) | 컬럼 | 의미 |
|---|---|---|
| `user` (`:26-28`) | `user_id` FK→users | 소유자(`@ManyToOne optional=false`) |
| `name` (`:30`) | `name VARCHAR(120)` | 워크스페이스 이름 |
| `goalRaw` (`:34`) | `goal_raw TEXT` | 사용자가 챗으로 말한 목표 원문 |
| `goalProfileJson` (`:38`) | `goal_profile_json TEXT` | 정형화된 목표 프로필 JSON |
| `strategyConfigJson` (`:42`) | `strategy_config_json LONGTEXT` | 전략 설정 JSON |
| `lastBacktestJson` (`:46`) | `last_backtest_json LONGTEXT` | 마지막 백테스트 결과 캐시 |
| `lastTrustJson`·`lastRegimeJson`·`lastReportJson` (`:50-59`) | TEXT/LONGTEXT | Trust/Regime/종합리포트 캐시 |
| `codeJson` (`:62`) | `code_json LONGTEXT` | 사용자 편집 Python 전략 코드 파일들 |
| `status` (`:65-67`) | `status VARCHAR(32)` | `DRAFT/FORMALIZED/TESTED/LIVE` |
| `brokerAccountId` (`:74`) | `broker_account_id` (nullable) | 자동주문 발사할 계좌(null=비활성) |
| `githubRepoFullName`·`githubBranch` (`:81-87`) | — | 연동 GitHub repo / 브랜치(기본 main) |

- **왜 JSON 컬럼이 많나?** Analytics 사이드카가 돌려준 복잡한 중첩 결과(백테스트·TrustScore 등)를 **통째로 캐시** 해 두면 프론트가 매번 재계산 없이 즉시 보여줄 수 있습니다. 정규화하지 않는 의도적 설계(읽기 캐시).
- **키/제약**: FK→users. 유니크 없음.
- **누가 쓰나**: `AlphaWorkspaceService`, `BacktestService`, 프론트 `alpha/` 탭(Chat/Config/Report/Regime/Trust/...).

---

### 12) `AlphaChatMessage` · `AlphaDecisionLog` · `AlphaWorkspaceChangeSet` — 워크스페이스 자식 3종

모두 `workspace_id`(생 Long) 로 워크스페이스에 매달린 자식. FK 제약은 없고 색인만.

| 엔티티(파일) | 테이블 | 역할 | 핵심 |
|---|---|---|---|
| `AlphaChatMessage` (`AlphaChatMessage.java:14-18`) | `alpha_chat_message` | AI 채팅 한 줄(`role`=user/model, `text`) | 색인 `idx_alpha_chat_ws_created (workspace_id, created_at)` |
| `AlphaDecisionLog` (`AlphaDecisionLog.java:13-17`) | `alpha_decision_log` | 사용자/AI 의사결정 시간순 기록(`actor`, `eventType`, `payloadJson`) | Human-AI 연구·캡스톤 데이터 |
| `AlphaWorkspaceChangeSet` (`AlphaWorkspaceChangeSet.java:17-21`) | `alpha_workspace_changeset` | AI 가 설정을 라이브 패치한 변경 묶음(`opsJson`/`beforeJson`/`afterJson`) | `status` = PENDING/KEPT/UNDONE. `beforeJson` 으로 "실행 취소" 롤백 |

---

### 13) `Notification` → 테이블 `notification` — 인앱 알림

`Notification.java:15-23` · 스키마 `:289-302`

| 필드 | 컬럼 | 의미 |
|---|---|---|
| `user` (`:29-31`) | `user_id` FK | 받는 사람(`@ManyToOne`) |
| `notificationType` (`:33-35`) | `notification_type ENUM(...)` | 알림 종류 |
| `title`·`message` | VARCHAR(200)/TEXT | 제목/본문 |
| `relatedEntityType`·`relatedEntityId` | — | 연관 대상(다형 참조) |
| `isRead` (`:49`) | `is_read BIT` | 읽음 여부 |

- **함정(레거시 흔적)**: `NotificationType` enum(`:57-70`)이 전부 **DevBridge 레거시 이벤트**(`MILESTONE_SUBMITTED`, `CONTRACT_ITEM_AGREED`, `DEPOSIT_RECEIVED` 등). Alpha-Helix 의 시그널/체결/만료 알림은 이 enum 보기를 그대로 재활용하거나 `title/message` 자유 텍스트로 채웁니다(전용 enum 보기는 아직 없음).
- **보안**: `NotificationController` 는 IDOR 방지를 위해 신원을 JWT 에서만 취득(M9, 최근 커밋).
- **누가 쓰나**: `domain/notification`.

---

### 14) AI 도메인 카탈로그/로그 (`ai_model_catalog` · `ai_usage_log`)

| 엔티티(파일) | 테이블 | 역할 | 키/특이점 |
|---|---|---|---|
| `AiModelCatalog` (`AiModelCatalog.java:12-19`) | `ai_model_catalog` | 사용 가능한 LLM 목록 + Free/Pro 월 토큰 한도 | **PK 가 문자열** `model_id`(예: `gemini-2.5-flash`). `freeQuota=0`→Free 불가, `proQuota=-1`→무제한 |
| `AiUsageLog` (`AiUsageLog.java:12-22`) | `ai_usage_log` | AI 호출 1회당 토큰 사용량 로그(한도 계산·청구 근거) | 색인 `ix_aiusage_user_time`, `ix_aiusage_user_model_time` |

- **누가 쓰나**: `AiGatewayService`(쿼터·로그·라우팅), `LlmRouter`.

---

### 15) `UserProfileDetail` → 테이블 `user_profile_detail`

`UserProfileDetail.java:14-17` · 스키마 `:718-734`

User 와 `@OneToOne`(user_id UNIQUE)으로 1:1 확장 프로필(bio·강점·GitHub·가시성 토글 JSON).

- **키/제약**: UNIQUE `user_id` → 사용자당 1행. `profileMenuToggles` 는 `JSON` 컬럼.

---

## 🗂 전체 테이블 목록표

### 🟢 Alpha 핵심 (현재 제품)

| 테이블 | 엔티티 | 핵심 컬럼 | 용도 | 도메인 |
|---|---|---|---|---|
| `users` | User | email(uq)·username(uq)·user_type·github_token_encrypted | 회원 허브 | user |
| `refresh_tokens` | RefreshToken | token(uq)·user_id·expires_at | 로그인 유지 토큰 | user |
| `user_profile_detail` | UserProfileDetail | user_id(uq)·bio·github_* | 프로필 확장 | user |
| `broker_account` | BrokerAccount | **uq(user_id,broker_type,env)**·app_secret_enc·한도들·trading_enabled | 브로커 자격증명+한도 | strategy |
| `order_proposal` | OrderProposal | status(상태머신)·ticker·side·qty·expires_at | 주문 제안 큐 | strategy |
| `order_execution_audit` | OrderExecutionAudit | outcome·kis_order_no·rt_cd (append-only) | 실주문 감사로그 | strategy |
| `strategy` | Strategy | code·method·ticker·principal_krw·params_json | 전략 정의 | strategy |
| `daily_signal` | DailySignal | **uq(strategy_id,as_of_date)**·signal | 일별 시그널 | strategy |
| `strategy_state` | StrategyState | **uq(strategy_id,as_of_date)**·cash/shares/equity | 일별 상태 | strategy |
| `strategy_trade` | StrategyTrade | side·kind·price_usd·source | 매매 체결 | strategy |
| `strategy_backtest_summary` | StrategyBacktestSummary | **uq(strategy_id)**·cagr/mdd/win_rate/trust_score | 백테스트 캐시 | strategy |
| `infinite_buying_subscription` | InfiniteBuyingSubscription | **uq(broker_account_id,ticker)**·seed_usd·split_count | 무한매수 자동매매 | strategy |
| `market_ohlc_daily` | MarketOhlcDaily | **uq(ticker,trade_date)**·open/high/low/close_px | 백엔드 일봉 캐시 ⚠️(아래 함정) | strategy |
| `subscription` | Subscription | **uq(toss_payment_key)**·tier·status·expires_at | 결제 구독(M8) | strategy |
| `payment_methods` | PaymentMethod | brand·last4·is_default | 카드 마스킹 | payment |
| `alpha_workspace` | AlphaWorkspace | name·*_json 캐시들·status·broker_account_id | 전략 워크스페이스 | ai |
| `alpha_chat_message` | AlphaChatMessage | workspace_id·role·text | AI 채팅 | ai |
| `alpha_decision_log` | AlphaDecisionLog | workspace_id·actor·event_type·payload_json | 의사결정 로그 | ai |
| `alpha_workspace_changeset` | AlphaWorkspaceChangeSet | ops_json·before_json·status | AI 라이브 패치 | ai |
| `ai_model_catalog` | AiModelCatalog | **model_id(PK 문자열)**·free_quota·pro_quota | LLM 카탈로그 | ai |
| `ai_usage_log` | AiUsageLog | user_id·model_id·tokens_in/out | AI 사용량 | ai |
| `notification` | Notification | notification_type·is_read | 인앱 알림 | notification |

### 🟡 DevBridge 레거시 (프리랜서·외주 매칭 잔재 — 현재 거의 미사용)

> 도면(`@Entity`)이 남아 있는 것: `Project`(projects), `ProjectApplication`, `ProjectAttachment`, `ProjectEscrow`, `ProjectFieldMaster`, `ProjectMeeting`, `ProjectMilestone`, `ProjectModule`, `ProjectSkillMapping`, `ProjectTag`, `SkillMaster` (이상 `domain/project`), `ClientProfile`, `ClientProfileStats`, `ClientPreferredSkill` (`domain/client`), `ChatRoom` (`domain/chat`).

| 테이블 | 한 줄 용도 |
|---|---|
| `projects` | 외주/상주 프로젝트 공고(거대한 enum·json 필드 다수) |
| `project_application` | 파트너의 프로젝트 지원(uq project+partner) |
| `project_milestones` · `project_escrows` | 마일스톤 / 에스크로 결제 |
| `project_attachments` · `project_meetings` · `project_modules` · `project_tags` · `project_skill_mapping` · `project_field_master` | 프로젝트 부속 정보 |
| `client_profile` · `client_profile_stats` · `client_preferred_skill` | 클라이언트(발주자) 프로필·통계·선호스킬 |
| `skill_master` | 스킬 마스터(uq name) |
| `chat_room` | Stream Chat 채널 매핑(실제 메시지는 Stream 에 저장, DB 엔 메타만) |

이 레거시 테이블들도 전부 `users.id` 를 FK 로 참조합니다 — `users` 가 두 세계의 공유 허브입니다.

---

## ⚠️ 함정·주의

### 1) `market_ohlc_daily`(백엔드) vs `market_ohlcv`(엔진) — **서로 다른 두 테이블** ★★

가장 헷갈리는 지점입니다. **이름이 비슷한 별개 테이블이 둘** 입니다.

| | 백엔드(Java) | Analytics 엔진(Python) |
|---|---|---|
| 테이블명 | `market_ohlc_daily` | `market_ohlcv` |
| 정의 위치 | `MarketOhlcDaily.java:17` → 스키마 `:270` | `analytics/app/data/market_db.py:63` (`CREATE TABLE ... market_ohlcv`) |
| 컬럼 | id·ticker·trade_date·open/high/low/close_px·volume·source | ts·symbol·source·tf·open/high/low/close·volume·vwap·quote_vol |
| 키 | uq(ticker, trade_date) | (symbol+date 복합) |

- `docs/engine_explained/README.md:39` 와 CLAUDE.md 는 "엔진 실제 테이블은 `market_ohlcv`, `market_ohlc_daily` 는 오기"라고 적습니다. 이는 **엔진 관점에서만** 맞습니다. **백엔드 JPA 에는 `market_ohlc_daily` 가 실제로 존재**합니다(`MarketOhlcDaily` 엔티티 + 스키마 덤프 `:270`). 즉 "오기"가 아니라 **백엔드와 엔진이 각자 다른 일봉 테이블을 가진 상태**입니다. 둘을 혼동하지 마세요.

### 2) 로컬 스키마와 운영 스키마는 출처가 다르다 (드리프트 위험)

- **로컬**: `ddl-auto=update` 가 엔티티 기준으로 테이블/컬럼을 자동 생성. **단, 제약·타입 변경은 안 함.** 그래서 로컬에선 통과해도 운영에선 깨질 수 있습니다.
- **운영**: `ddl-auto=validate` + Flyway. 스키마 변경은 오직 `db/migration/V*.sql`. 엔티티에만 있고 마이그레이션에 없으면 **부팅 실패**.
- 실제 사고들: `uq_broker_user_type_env` 가 운영에 없어서 다중브로커 500(M2→V16), `refresh_tokens` 마이그레이션 누락(→V18), broker_account NOT NULL 드리프트(→V15). **엔티티에 컬럼/제약을 추가하면 반드시 대응 Flyway 마이그레이션을 같이 추가**하세요.

### 3) DevBridge 레거시 테이블 대량 잔존

- DB 33개 테이블 중 약 절반이 옛 프리랜서 매칭(DevBridge)의 잔재입니다(`projects`·`project_*`·`client_*`·`skill_master`·`chat_room`). 현재 Alpha-Helix 기능에서는 거의 안 쓰지만 **삭제되지 않았습니다.** ERD/스키마를 볼 때 "이게 왜 있지?" 싶은 테이블 대부분이 레거시입니다.
- 패키지 루트가 `com.DevBridge.devbridge` 인 것, `User.UserType` 이 `CLIENT/PARTNER` 구값을 변환 처리하는 것, `Notification` enum 이 마일스톤·계약 이벤트인 것 모두 같은 역사적 흔적입니다.

### 4) 연관관계가 두 가지 스타일로 섞여 있다

- 어떤 엔티티는 `@ManyToOne User user`(객체+진짜 FK), 어떤 건 `Long userId`(생 숫자, FK 제약 없음). 후자(예: `OrderProposal`, `Subscription`, `AlphaChatMessage`)는 스키마에 외래키 CONSTRAINT 가 없으므로 **DB 가 참조무결성을 보장하지 않습니다** — 권한·존재 검증은 전적으로 서비스 코드 책임. 쿼리·삭제 시 고아 행(orphan)에 주의.

### 5) 예약어 컬럼 백틱 이스케이프

- `DailySignal.signal` 은 SQL 예약어와 충돌해 `@Column(name = "`signal`")` 로 백틱을 씁니다(`DailySignal.java:44`). 비슷하게 `projects.desc` 도 예약어. 수기 SQL 작성 시 이런 컬럼은 백틱 필요.

### 6) 민감정보 컬럼은 절대 평문 금지

- `users.github_token_encrypted`(VARBINARY, AES-GCM), `broker_account.app_secret_enc`/`binance_api_secret_enc`(암호화 후 TEXT). 이 컬럼들은 **반드시 `CryptoService` 로 암호화 후** 저장합니다. 마이그레이션/시드/덤프 공유 시 노출 주의. `payment_methods` 는 PCI 정책상 전체 카드번호·CVC 자체를 저장하지 않음.

---

## 🚀 고도화 아이디어

1. **레거시 테이블 정리(decommission)**: 사용처를 정적분석으로 확인한 뒤, `project_*`·`client_*`·`chat_room` 을 별도 스키마/아카이브로 분리하거나 드롭하는 Flyway 마이그레이션. ERD 가 절반으로 줄어 신규 인원 온보딩이 쉬워집니다.
2. **이름 충돌 해소**: 백엔드 `market_ohlc_daily` 와 엔진 `market_ohlcv` 를 하나로 통합하거나, 최소한 둘 중 하나를 명확히 리네임(`be_market_ohlc_daily` 등)해 혼동 제거.
3. **FK 제약 일관화**: `userId`/`workspaceId` 같은 생 Long 연관에도 실제 FK 제약을 추가(또는 일부러 안 거는 정책을 문서화). 고아 행 방지.
4. **상태 enum 의 DB 강제**: `OrderProposal.status`, `AlphaWorkspaceChangeSet.status` 등 문자열 상태를 `ENUM` 또는 `CHECK` 제약으로 막아 오타 상태값 유입 차단.
5. **감사로그 강화**: `order_execution_audit` 처럼 `subscription`·`broker_account` 변경도 append-only 이력 테이블로 남기면 결제 분쟁·자격증명 변경 추적이 쉬워집니다.
6. **JSON 컬럼 검증**: `alpha_workspace` 의 다수 `*_json` 컬럼에 MySQL `JSON` 타입 + `JSON_SCHEMA_VALID`(8.0.17+) 또는 앱 레벨 스키마 검증을 붙여 깨진 캐시 유입 방지.
7. **시드 데이터 멱등성 점검**: `ai_model_catalog` 처럼 코드성 마스터 테이블은 seeder 가 멱등(존재 시 스킵)인지 재확인 — 모델 추가/한도 변경 시 upsert 전략 정의.

---

## 📚 용어 사전

| 용어 | 한 줄 설명 |
|---|---|
| **엔티티(Entity)** | DB 테이블 1개에 대응하는 자바 클래스(`@Entity`). "서랍 설계도면" |
| **테이블(Table)** | 같은 모양의 행(row)이 쌓이는 DB 서랍 |
| **PK(기본키)** | 행을 유일하게 식별하는 번호(`@Id`). 보통 `id BIGINT AUTO_INCREMENT` |
| **FK(외래키)** | 다른 테이블의 PK 를 가리키는 컬럼(`@JoinColumn`). "이 카드는 저 서랍 N번 소속" |
| **유니크 제약(Unique Constraint)** | 특정 컬럼(조합)의 중복을 DB 가 금지. 마지막 방어선 |
| **색인(Index)** | 조건검색을 빠르게 하는 "찾아보기"(`@Index`) |
| **JPA / Hibernate** | 자바 객체 ↔ DB 테이블 자동 매핑 프레임워크(ORM). Hibernate 는 그 구현체 |
| **ddl-auto** | Hibernate 가 스키마를 어떻게 다룰지: `update`(자동변경·로컬) / `validate`(검증만·운영) |
| **Flyway** | 버전별 `V*.sql` 로 스키마를 단계적으로 마이그레이션하는 도구(운영 스키마의 유일 출처) |
| **드리프트(Drift)** | 엔티티·로컬 DB·운영 DB 가 서로 어긋난 상태. 운영 부팅 실패의 주원인 |
| **`@ManyToOne` / `@OneToOne`** | N:1 / 1:1 연관. 여러 자식이 한 부모를 / 서로 1:1로 가리킴 |
| **`@Enumerated(STRING)`** | enum 을 이름 문자열로 저장(순서 변경에 안전). DB 엔 보통 `ENUM('A','B')` |
| **`@Convert`** | 커스텀 변환기로 필드↔컬럼 매핑(여기선 `UserType` 구값 호환에 사용) |
| **`@CreatedDate`/`@UpdateTimestamp`** | 생성/수정 시각 자동 기록 |
| **BigDecimal / DECIMAL** | 부동소수 오차 없이 돈·가격을 정확히 담는 타입 |
| **append-only** | 추가만 가능, 수정·삭제 금지(감사로그 무결성). `order_execution_audit` 가 대표 |
| **상태머신(State Machine)** | 정해진 상태 전이 규칙. `OrderProposal`: PENDING→APPROVED→EXECUTED 등 |
| **HMAC** | 비밀키로 만드는 위변조 방지 서명. OrderProposal 이메일 승인 링크에 사용 |
| **IDOR** | 남의 식별자를 넣어 접근하는 취약점. `Notification` 은 JWT 신원으로만 막음(M9) |
| **DevBridge 레거시** | 피벗 전 프리랜서 매칭 플랫폼의 잔존 테이블/코드 (`projects`·`client_*`·`chat_room` 등) |

---

> 다음 학습: 이 엔티티들이 실제로 어떻게 조회·저장되는지는 `08_backend/*`(도메인별 Service/Repository, 작성 예정)에서 이어집니다. 스키마 변경 절차는 `db/migration/V*.sql` 과 `DEPLOY_FROM_SCRATCH.md` 참고.
