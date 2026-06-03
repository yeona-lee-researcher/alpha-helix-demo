# DB ERD · 테이블 관계 — Alpha 핵심 도메인 배선도 (완전 초보자용 교재)

> 원본 근거:
> - 물리 스키마: `backend/docs/schema_full_current.sql` (실제 `FOREIGN KEY` 제약·인덱스가 박혀 있는 파일)
> - 레거시 ERD: `docs/erd_dbdiagram.sql` (DevBridge 32테이블 — dbdiagram.io 임포트용, **alpha 도메인은 여기 없음**)
> - 엔티티 코드: `backend/src/main/java/com/DevBridge/devbridge/domain/*/entity/*.java`
>
> 이 문서는 **교재 표준 형식**(README "3. 공통 형식")을 따릅니다. "한눈에 → 사전지식 → ERD → 관계별 해설 → 함정 → 고도화 → 용어".
> 표기 약속: 관계 근거는 `파일:줄` 로 가리킵니다. (예: `OrderProposal.java:38`)

---

## 📌 한눈에

이 문서는 **"서랍장(테이블)들이 서로 어떻게 연결되어 있는지"** 를 그린 **배선도**입니다.

비유로 시작합시다. DB 는 **거대한 사무실의 서류 캐비닛 단지**입니다.

- 캐비닛 1개 = **테이블 1개** (예: `users` 캐비닛, `order_proposal` 캐비닛)
- 캐비닛 안 서랍 1칸 = **행(row) 1개** (예: "회원 42번", "주문제안 1001번")
- 서랍에 붙은 메모 "이 서류는 회원 42번 것" = **외래키(FK) 또는 논리 참조**

이 단지의 **모든 배선은 결국 `users`(회원) 캐비닛 하나로 모입니다.** 회원이 → 브로커 계좌를 갖고 → 워크스페이스를 열고 → 그 안에서 전략을 만들고 → 전략이 시그널을 내고 → 시그널이 주문 제안이 되고 → 주문이 실행되면 감사로그가 쌓입니다. 그래서 ERD 모양이 **별(star) 모양**(가운데 `users`, 사방으로 뻗는 가지)이 됩니다.

**가장 중요한 한 가지** — 이 프로젝트는 연결을 두 가지 방식으로 합니다:

| 방식 | 코드 모습 | DB 에 FK 제약이 있나? | "고아 행" 막아주나? |
|---|---|---|---|
| **물리 FK** | `@ManyToOne @JoinColumn(name="user_id")` → `private User user;` | ✅ `CONSTRAINT ... FOREIGN KEY` 박힘 | ✅ DB 가 막아줌 |
| **논리 참조** | `@Column(name="user_id") private Long userId;` | ❌ 그냥 숫자 컬럼 | ❌ 코드(서비스)가 직접 책임 |

**핵심 관계 요약** (이 한 줄만 외워도 절반은 끝):

```
users ──< broker_account, alpha_workspace, strategy, notification, subscription, ...   (회원이 모든 것의 주인)
alpha_workspace ──< alpha_chat_message, alpha_decision_log, order_proposal             (워크스페이스가 대화·결정·주문의 컨테이너)
strategy ──< daily_signal, strategy_state, strategy_trade, strategy_backtest_summary    (전략이 시그널·상태·체결의 부모)
order_proposal ──< order_execution_audit                                                (주문 제안이 실행 감사로그의 부모)
broker_account ──< infinite_buying_subscription, order_proposal                         (계좌가 자동매매·주문의 통로)
```

그런데 함정이 하나 있습니다 — **alpha 핵심 도메인(`order_proposal`, `subscription`, `alpha_chat_message` …)은 대부분 "논리 참조"** 라서, DB 가 데이터 정합성을 지켜주지 않습니다. 이 차이를 정확히 아는 것이 이 교재의 목표입니다.

---

## 🧠 사전 지식 (이거 모르면 막힘)

### 1) ERD 란? — "캐비닛 배치도"

**ERD(Entity-Relationship Diagram, 개체-관계도)** = 테이블(개체)들과 그 사이 선(관계)을 그린 그림. 건물의 **배선도/평면도**라고 보면 됩니다. "어느 방이 어느 방과 통하는지"를 한 장으로 봅니다.

### 2) 1:N(일대다) 관계 — "부모 1명, 자식 여럿"

가장 흔한 관계입니다.

```
회원 1명 ──< 주문제안 여러 개
 (1)          (N, 많을 N)
```

- **읽는 법**: "회원 1명은 주문제안을 N개 가질 수 있다. 주문제안 1개는 회원 1명에게만 속한다."
- DB 에서 구현: **"많은 쪽(N, 자식)"이 "적은 쪽(1, 부모)의 id"를 컬럼으로 들고 있음.** 즉 `order_proposal.user_id` 안에 회원 id 가 들어감.
- 기호 `──<` 의 갈래(<) 가 **N(많은) 쪽**을 가리킵니다. 까마귀 발(crow's foot)이라 부릅니다.

비유: **반(class) 1개에 학생 30명**. 학생 명부(학생 테이블)에는 각자 "몇 반?" 칸이 있죠. 반 명부(반 테이블)에 학생 30칸을 그리지 않습니다. → **자식이 부모 id 를 든다.**

다른 관계도 있습니다:
- **1:1(일대일)** — 부모 1 : 자식 1. 예: `strategy` ↔ `strategy_backtest_summary` (전략 1개당 요약 1개). 자식 쪽에 **UNIQUE** 가 붙음.
- **N:M(다대다)** — 양쪽 다 여럿. 중간 **연결 테이블**로 풀어냄. (예: 레거시 `project_skill_mapping` = 프로젝트↔스킬).

### 3) FK(외래키) vs 논리 참조 — 이 프로젝트의 핵심 구분

이 둘은 **"id 를 들고 있다"는 점은 같지만, DB 가 그 id 의 유효성을 검사하느냐"가 다릅니다.**

**(A) 물리 FK (외래키 제약)**

```sql
-- schema_full_current.sql:96
CONSTRAINT `FKa386...` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`)
```

- DB 엔진(InnoDB)이 **"`user_id` 에 들어가는 값은 반드시 `users` 테이블에 실재하는 id 여야 한다"** 를 강제합니다.
- 없는 회원 id 를 넣으려 하면 → **INSERT 거부**(에러).
- 부모(회원)를 지우려는데 자식(주문)이 매달려 있으면 → **DELETE 거부** (CASCADE 안 걸려 있으면).
- 코드 모습: 엔티티 안에 **객체 참조** — `private User user;` + `@ManyToOne @JoinColumn`.

**(B) 논리 참조 (그냥 숫자 컬럼)**

```java
// OrderProposal.java:38-39
@Column(name = "user_id", nullable = false)
private Long userId;        // ← 그냥 Long 숫자. User 객체가 아님.
```

- DB 입장에서 `user_id` 는 **그냥 bigint 숫자 한 칸**입니다. `users` 와 아무 약속이 없습니다.
- 없는 회원 id(예: 999999)를 넣어도 DB 는 막지 않습니다 — **"고아 행"** 이 생길 수 있음.
- 정합성은 **전적으로 자바 서비스 코드의 책임**입니다. (예: 저장 전에 "이 회원 진짜 있나?"를 직접 확인.)
- 코드 모습: `private Long userId;` (객체가 아니라 id 숫자).

> 💡 **왜 일부러 FK 를 안 걸까?** 트레이드오프입니다.
> - **장점**: 도메인 간 결합도↓(strategy 도메인이 user 엔티티를 import 안 해도 됨), 대량 삭제·마이그레이션 자유, 샤딩/MSA 분리 용이.
> - **단점**: DB 안전망이 사라져 고아 행·정합성 깨짐 위험. 모든 검증을 코드가 떠안음.
> Alpha-Helix 는 **레거시 DevBridge 부분(프로필·프로젝트)은 FK 를 꼼꼼히 걸었고, 새로 얹은 alpha 도메인(주문·구독·채팅)은 논리 참조 위주**로 갔습니다. 이 "두 세계"의 공존이 이 DB 의 가장 큰 특징입니다.

### 4) user_id 중심 "별(star) 모양" — 멀티테넌시의 흔적

거의 모든 테이블에 `user_id` 가 있습니다. 이유: **"이 데이터는 누구 것인가"** 를 매 행마다 명시해야 하기 때문입니다(소유권 = 보안 게이트). 그래서 ERD 가운데에 `users` 가 있고 사방으로 가지가 뻗는 **별 모양**이 됩니다.

비유: 은행 시스템에서 **모든 거래·계좌·알림에 "계좌주 번호"** 가 붙는 것과 똑같습니다. "남의 데이터 못 보게" 하는 1차 방어선이죠. 실제로 `OrderProposal.java:37` 주석이 *"소유자 — Broker 계정 권한 검증의 1차 게이트"* 라고 못 박습니다.

### 5) "캐스케이드(CASCADE)" 란?

부모를 지우면 자식도 자동으로 따라 지워지거나(ON DELETE CASCADE), 자식이 있으면 부모 삭제를 막는(RESTRICT) **연쇄 규칙**. 이 프로젝트의 물리 FK 들은 **CASCADE 옵션 없이 기본값(RESTRICT)** 입니다 — 자식이 있으면 부모 삭제가 막힙니다. 논리 참조는 아예 이런 규칙 자체가 없습니다(코드가 직접 정리해야 함).

---

## 🗺 ERD 다이어그램 (Alpha 핵심 도메인)

아래 그림에서:
- `══>` (이중선) = **물리 FK** (DB 가 강제, `@ManyToOne`/`@OneToOne`)
- `--->` (점선) = **논리 참조** (그냥 Long 컬럼, DB 강제 없음, 코드 책임)
- `(1)`, `(N)`, `(1:1)` = 관계 차수

```
                                  ┌───────────────────────────┐
                                  │           users           │  ★ 모든 것의 주인 (별의 중심)
                                  │  id, email, username, ...  │
                                  └───────────────────────────┘
                                       ▲   ▲   ▲   ▲   ▲   ▲
          ┌──── 물리 FK ══════════════╝   ║   ║   ║   ║   ╚══════════ 물리 FK ────┐
          ║                ┌══════════════╝   ║   ║   ╚════════════┐               ║
          ║                ║                   ║   ║                ║               ║
   ┌─────────────┐  ┌──────────────┐    ┌──────────┐   ┌────────────────┐  ┌─────────────────┐
   │broker_account│ │alpha_workspace│   │ strategy │   │  notification  │  │ payment_methods │
   │   (N)  ══> u │ │   (N) ══> u   │   │(N) ══> u │   │   (N) ══> u    │  │   (N) ══> u     │
   └─────────────┘  └──────────────┘    └──────────┘   └────────────────┘  └─────────────────┘
          ▲ │              ║ │                ▲                                       
          │ │ broker_      ║ │ workspace_     ║ 물리 FK (strategy_id)                 
          │ │ account_id   ║ │ id (논리)      ╠═══════════╦═══════════╦══════════════╗
          │ │ (논리,점선)  ║ │                ║           ║           ║              ║
          │ ▼              ║ ▼          ┌───────────┐┌──────────┐┌────────────┐┌──────────────────────┐
          │           ┌─────────────┐   │daily_     ││strategy_ ││strategy_   ││strategy_backtest_    │
          │           │alpha_chat_  │   │signal     ││state     ││trade       ││summary               │
          │           │message      │   │(N)══>strat││(N)══>str ││(N)══>strat ││(1:1)══> strategy     │
          │           │(N)···>ws    │   └───────────┘└──────────┘└────────────┘└──────────────────────┘
          │           └─────────────┘
          │           ┌─────────────┐
          │           │alpha_       │
          │           │decision_log │
          │           │(N)···>ws    │
          │           └─────────────┘
          │           ┌──────────────────────┐
          │           │alpha_workspace_      │
          │           │changeset (N)···>ws   │
          │           └──────────────────────┘
          │
          │  ┌──────────────────────────────────────────────────────────────┐
          │  │                       order_proposal                          │
          ├─>│ user_id ···> users     workspace_id ···> alpha_workspace      │   모두 논리 참조(점선)
          │  │ broker_account_id ···> broker_account                          │   — DB FK 없음!
          │  │ source_signal_id ···> daily_signal (느슨)                      │
          │  └──────────────────────────────────────────────────────────────┘
          │                          │ proposal_id (논리, 점선)
          │                          ▼
          │  ┌──────────────────────────────────────────────────────────────┐
          │  │                    order_execution_audit                      │   append-only 감사로그
          ├─>│ user_id ···> users   broker_account_id ···> broker_account     │   모두 논리 참조(점선)
          │  │ proposal_id ···> order_proposal                                │
          │  └──────────────────────────────────────────────────────────────┘
          │
          │  ┌──────────────────────────────────────────────────────────────┐
          └═>│            infinite_buying_subscription                        │
             │ user_id ══> users (물리 FK)   broker_account_id ══> broker_    │   ★유일하게 둘 다 물리 FK
             │ account (물리 FK)                                              │
             └──────────────────────────────────────────────────────────────┘

   ┌─────────────────┐       ┌──────────────────┐       ┌──────────────────┐
   │  subscription   │       │  ai_usage_log    │       │ market_ohlc_daily│   (독립 — 어떤 FK도 없음)
   │ user_id ···> u  │       │ user_id ···> u   │       │ (참조 없음, 마스터)│
   │ (논리, FK 없음) │       │ model_id ···> ai_│       │ ticker+date UNIQUE│
   └─────────────────┘       │ model_catalog    │       └──────────────────┘
                             └──────────────────┘
```

> 한 장 요약: **`users` 를 중심으로 한 별 모양.** 왼쪽 위 4개(broker/workspace/strategy/notification 등)는 **물리 FK 로 users 에 단단히 묶임.** 가운데~아래의 alpha 주문 파이프라인(order_proposal → order_execution_audit)과 subscription/chat 은 **전부 점선(논리 참조).** 예외적으로 `infinite_buying_subscription` 만 user·broker 둘 다 물리 FK.

---

## 📖 관계별 해설

각 관계를 "어느 테이블↔어느 테이블 / 차수 / 물리 FK vs 논리 참조 / 왜 / 근거(`파일:줄`)" 로 풉니다.

### 관계 1) users (1) ══> broker_account (N) — 물리 FK

- **무엇**: 회원 1명이 브로커 계좌를 여러 개 가질 수 있다(KIS-MOCK, KIS-REAL, Binance-SPOT …).
- **종류**: **물리 FK**. 자식(`broker_account`)이 부모 id 를 객체로 들고 있음.
- **근거**:
  - 엔티티: `BrokerAccount.java:37-39` — `@ManyToOne(fetch=LAZY) @JoinColumn(name="user_id", nullable=false) private User user;`
  - 스키마: `schema_full_current.sql:145` — `CONSTRAINT FKfxssr... FOREIGN KEY (user_id) REFERENCES users(id)`
- **추가 제약(중요)**: `schema_full_current.sql:144` — `UNIQUE KEY uq_broker_user_type_env (user_id, broker_type, env)`. 즉 **"한 회원은 (브로커종류, MOCK/REAL) 조합당 계좌 1개"**. KIS-MOCK 하나, KIS-REAL 하나, Binance-SPOT 하나… 식. (`BrokerAccount.java:20-22` 에서 동일하게 선언.)
- **왜 물리 FK?**: 계좌는 회원 신원과 직결된 **민감 자원(API 키 암호화 보관)** 이라 고아 계좌가 절대 생기면 안 됩니다. DB 안전망을 건다.

### 관계 2) users (1) ══> alpha_workspace (N) — 물리 FK

- **무엇**: 회원 1명이 전략 워크스페이스를 여러 개 운영(Slack 채널처럼 "전략 1개 = 워크스페이스 1개").
- **종류**: **물리 FK**.
- **근거**: `AlphaWorkspace.java:26-28` — `@ManyToOne(optional=false) @JoinColumn(name="user_id")` / 스키마 `schema_full_current.sql:96` — `CONSTRAINT FKa386... FOREIGN KEY (user_id) REFERENCES users(id)`.

### 관계 3) alpha_workspace (1) ···> broker_account (N) — **논리 참조** (같은 엔티티 안에서 방식이 갈림!)

- **무엇**: 워크스페이스가 "자동주문을 발사할 때 쓸 브로커 계좌"를 1개 가리킨다(없으면 자동주문 비활성).
- **종류**: **논리 참조**. ⚠️ 바로 위 관계 2는 물리 FK 인데, **같은 `AlphaWorkspace` 엔티티 안에서 `broker_account_id` 는 그냥 Long 컬럼**입니다.
- **근거**: `AlphaWorkspace.java:74-75` — `@Column(name="broker_account_id") private Long brokerAccountId;` (객체 아님, FK 제약 없음). 스키마 `schema_full_current.sql:77` 에도 `broker_account_id bigint DEFAULT NULL` 만 있고 FK 제약 없음.
- **왜 논리 참조?**: 코드 주석(`AlphaWorkspace.java:69-73`)이 직접 설명 — *"BrokerAccount는 user_id+env unique이므로 user 동일성은 별도로 검증"*. 즉 **"이 계좌가 정말 이 워크스페이스 주인의 것인가"는 서비스 코드가 검증**하겠다는 설계. nullable 이라 FK 걸어도 되지만, 도메인 간 느슨함을 택함.
- **교훈**: **"한 엔티티가 모든 관계를 같은 방식으로 맺지 않는다."** user 는 FK, broker_account 는 논리 참조. 코드를 한 줄씩 봐야 알 수 있는 부분.

### 관계 4) alpha_workspace (1) ···> alpha_chat_message (N) — 논리 참조

- **무엇**: 워크스페이스 안의 AI 채팅 메시지들(USER/MODEL 대화). Goal→Strategy 대화가 여기 쌓임.
- **종류**: **논리 참조**.
- **근거**: `AlphaChatMessage.java:23-24` — `@Column(name="workspace_id", nullable=false) private Long workspaceId;` (Long, FK 없음). 스키마 `schema_full_current.sql:51` 도 컬럼+인덱스만, FK 제약 없음.
- **왜?**: 채팅은 대량으로 쏟아지는 append 데이터라 FK 검사 부담을 덜고, ai 도메인이 strategy/ai 워크스페이스에 강결합되지 않도록. 인덱스 `idx_alpha_chat_ws_created (workspace_id, created_at)` 로 "이 워크스페이스의 메시지를 시간순"을 빠르게 조회(`AlphaChatMessage.java:16`).

### 관계 5) alpha_workspace (1) ···> alpha_decision_log (N) & alpha_workspace_changeset (N) — 논리 참조

- **무엇**: 의사결정 로그(누가 언제 무슨 결정을 했나)와 변경셋(strategy config diff)이 워크스페이스에 종속.
- **종류**: 둘 다 **논리 참조** (`workspace_id` Long 컬럼).
- **근거**: `AlphaDecisionLog.java:22-23` (`@Column(name="workspace_id") private Long workspaceId;`), 스키마 `schema_full_current.sql:64`(decision_log)·`:106`(changeset). 둘 다 FK 제약 없이 인덱스만.

### 관계 6) users (1) ══> strategy (N) — 물리 FK

- **무엇**: 회원 1명이 N개 전략 운영(각 전략 = 단일 종목 + 단일 method[INFINITE_BUY/VALUE_REBALANCING]).
- **종류**: **물리 FK**.
- **근거**: `Strategy.java:36-38` — `@ManyToOne @JoinColumn(name="user_id")` / 스키마 `schema_full_current.sql:629` — `CONSTRAINT FK9hppt... FOREIGN KEY (user_id) REFERENCES users(id)`.

### 관계 7) strategy (1) ══> daily_signal / strategy_state / strategy_trade (N) — 물리 FK

- **무엇**: 전략 1개가 일별 시그널·일별 상태스냅샷·체결기록을 각각 N개씩 부모로 둠.
- **종류**: 셋 다 **물리 FK**.
- **근거**:
  - `DailySignal.java:36-38` (`@ManyToOne @JoinColumn(name="strategy_id")`) / 스키마 `:238` (`FKf4uy... REFERENCES strategy(id)`). UNIQUE `uq_signal_strategy_date (strategy_id, as_of_date)` → **전략당 하루 1시그널**(`DailySignal.java:17-18`).
  - `StrategyState.java:35-37` / 스키마 `:672` (`FK7ria...`). UNIQUE `(strategy_id, as_of_date)` → 전략당 하루 1상태.
  - `StrategyTrade.java:41-43` / 스키마 `:692` (`FKjmqrv...`). 백테스트·실거래 체결을 `source`(BACKTEST/LIVE/MANUAL)로 구분해 같은 테이블에 적재.
- **왜 물리 FK?**: 전략 산출물(시그널/상태/체결)은 전략 없이는 의미가 없는 **순수 종속 자식**. 고아가 되면 안 되니 DB 로 묶음.

### 관계 8) strategy (1) ══> strategy_backtest_summary (1:1) — 물리 FK + UNIQUE

- **무엇**: 전략 1개당 백테스트 메트릭 캐시 1건(매번 재계산이 무거워 1건만 upsert).
- **종류**: **1:1 물리 FK**. 자식 쪽 `strategy_id` 에 **UNIQUE** 가 붙어 1:N 이 아니라 1:1 이 됨.
- **근거**: `StrategyBacktestSummary.java:33-35` — `@OneToOne @JoinColumn(name="strategy_id")` / 스키마 `:649-650` — `UNIQUE KEY uq_bt_strategy (strategy_id)` + `CONSTRAINT FKoang... REFERENCES strategy(id)`.
- **읽는 법**: "전략 1 : 요약 1". `@ManyToOne` 이 아니라 `@OneToOne` 인 점, UNIQUE 제약이 차수를 1로 좁힌 점이 핵심.

### 관계 9) users (1) ══> notification (N) — 물리 FK (단, related_entity 는 폴리모픽 논리참조)

- **무엇**: 회원에게 가는 인앱 알림. 채팅(NEW_MESSAGE)·시그널·마일스톤 등.
- **종류**: `user_id` 는 **물리 FK**. 그러나 `related_entity_id` 는 **폴리모픽 논리 참조**.
- **근거**: `Notification.java:29-31` (`@ManyToOne @JoinColumn(name="user_id")`) / 스키마 `:301` (`FKnk4ft... REFERENCES users(id)`).
  - `Notification.java:43-47` — `relatedEntityType`(문자열) + `relatedEntityId`(Long). **"어떤 종류의 무엇"을 type+id 쌍으로 가리키는 폴리모픽 패턴**. 알림이 가리키는 대상이 시그널일 수도, 마일스톤일 수도 있어 **단일 테이블 FK 로는 못 묶음** → 일부러 논리 참조.
- **왜?**: 다형성(여러 테이블 중 하나를 가리킴)을 FK 로 표현할 수 없어서. type 칸으로 "어느 테이블인지" 구분하고 코드가 해석.

### 관계 10) order_proposal — 모든 관계가 **논리 참조** (alpha 파이프라인의 심장)

- **무엇**: 자동 시그널/수동 제안에서 나온 "주문 제안". 사용자가 승인하기 전엔 절대 KIS 로 안 나감.
- **종류**: **user_id · workspace_id · broker_account_id · source_signal_id 전부 논리 참조** (Long 컬럼, FK 제약 0개).
- **근거**: `OrderProposal.java:38-79` —
  - `user_id` (`:38-39`, nullable=false) — 소유자, *"권한 검증 1차 게이트"* 주석.
  - `workspace_id` (`:42-43`, nullable) — 수동 제안이면 null.
  - `broker_account_id` (`:46-47`, nullable=false) — *"반드시 user_id 소유"* (코드가 검증).
  - `source_signal_id` (`:78-79`) — 시그널이 만든 경우 그 시그널 id (없으면 null, "느슨한 참조").
  - 스키마 `schema_full_current.sql:331-362`: 컬럼·인덱스(`idx_op_user_status`, `idx_op_workspace`, `idx_op_expires`)만 있고 **CONSTRAINT FOREIGN KEY 가 단 한 줄도 없음**.
- **왜 전부 논리 참조?**: 이 테이블은 **상태 머신**(PENDING→APPROVED→EXECUTED…)이고, 보안상 모든 검증을 서비스 레이어가 직접 해야 합니다(예: "이 broker_account 가 이 user 것인가"). FK 로 묶기보다 **코드가 소유권·한도·kill-switch 를 능동 검증**하는 설계. workspace 가 지워져도 주문 이력은 남아야 하므로 강한 FK 를 피함.

### 관계 11) order_proposal (1) ···> order_execution_audit (N) — 논리 참조 (불변 감사로그)

- **무엇**: 실제로 KIS 로 나간 주문 시도(EXECUTED/EXEC_FAILED)를 **append-only 로 영구 보존**. proposal 은 상태가 바뀌어도(EXPIRED 등) 이 로그는 "그 순간 무슨 주문이 나갔나"를 박제.
- **종류**: **논리 참조** (`proposal_id`, `user_id`, `broker_account_id` 모두 Long, FK 없음).
- **근거**: `OrderExecutionAudit.java:31-38` (모두 `@Column ... private Long ...`). `proposal_id` 는 nullable(`:34`) — 제안 없이 직접 실행된 케이스 허용. 스키마 `schema_full_current.sql:307-326`: 인덱스(`idx_oea_user`, `idx_oea_proposal`)만, FK 없음.
- **왜?**: 감사로그의 철학은 **"무슨 일이 있어도 기록은 남는다"**. 부모(proposal)가 삭제·만료돼도 로그는 독립적으로 살아야 하므로, FK 로 부모에 운명을 묶지 않음. append-only 라 정합성 위험도 낮음(`OrderExecutionAudit.java:11-14` 주석).

### 관계 12) users (1) ══> infinite_buying_subscription (N) & broker_account (1) ══> infinite_buying_subscription (N) — **둘 다 물리 FK** (유일)

- **무엇**: 무한매수법(라오어식) 자동매매 구독. (회원+계좌+티커) 당 1행.
- **종류**: **user, broker_account 둘 다 물리 FK** — alpha 도메인에서 **broker_account 를 물리 FK 로 묶은 유일한 테이블**.
- **근거**: `InfiniteBuyingSubscription.java:39-45` —
  - `@ManyToOne @JoinColumn(name="user_id") private User user;`
  - `@ManyToOne @JoinColumn(name="broker_account_id") private BrokerAccount brokerAccount;`
  - 스키마 `schema_full_current.sql:263-264` — 두 개의 `CONSTRAINT ... FOREIGN KEY` (broker_account, users 각각).
  - UNIQUE `uq_ibs_account_ticker (broker_account_id, ticker)` (`:261`, `InfiniteBuyingSubscription.java:27-30`) → **계좌+티커당 구독 1개**.
- **왜?**: 자동매매는 계좌에 강하게 종속(계좌가 사라지면 자동매매도 무의미)이라 DB 안전망을 건 것으로 보임. order_proposal 과 대조적인 설계 선택 — **같은 strategy 도메인 안에서도 일관성이 없음**(주의 포인트).

### 관계 13) users (1) ···> subscription (N) — 논리 참조

- **무엇**: 회원의 Pro/Free 구독. Toss 결제 1회당 1개월 ACTIVE.
- **종류**: **논리 참조** (`user_id` Long).
- **근거**: `Subscription.java:33-34` (`@Column(name="user_id") private Long userId;`). 스키마 `schema_full_current.sql:698-713`: 인덱스(`ix_sub_user_status`, `ix_sub_user_expires`)만, FK 없음. UNIQUE `uq_subscription_toss_payment_key`(`Subscription.java:16`) → 같은 결제키로 중복 구독 방지(멱등성).

### 관계 14) users (1) ···> ai_usage_log (N) & ai_model_catalog (1) ···> ai_usage_log (N) — 논리 참조

- **무엇**: AI 호출 1회당 사용량 로그(토큰·성공여부). 월 한도·Pro 청구 근거.
- **종류**: **논리 참조** (`user_id` Long, `model_id` 문자열로 `ai_model_catalog.model_id` 를 느슨히 가리킴).
- **근거**: `AiUsageLog.java:28-31` (`user_id` Long, `model_id` String). 스키마 `:31-43`: 인덱스만, FK 없음. (`ai_model_catalog` 의 PK 는 `model_id` 문자열 — `schema_full_current.sql:25`.)

### 관계 15) users (1) ══> payment_methods / user_profile_detail (N/1:1) — 물리 FK (레거시 잔존이지만 유효)

- **무엇**: 결제수단(카드), 프로필 상세.
- **종류**: **물리 FK**. (`payment_methods` 1:N, `user_profile_detail` 1:1 UNIQUE.)
- **근거**: `PaymentMethod` → 스키마 `:381` (`FKin7rt... REFERENCES users(id)`). `UserProfileDetail` → 스키마 `:733` (`FKla5ug...`) + UNIQUE(user_id) → 1:1.

### 관계 16) market_ohlc_daily — **참조 0개** (마스터 데이터)

- **무엇**: 종목별 일봉(OHLCV). 백테스트·시그널의 원재료.
- **종류**: **어떤 FK·논리 참조도 없는 독립 마스터 테이블**.
- **근거**: 스키마 `:270-284` — UNIQUE `uq_ohlc_ticker_date (ticker, trade_date)` + 인덱스 `ix_ohlc_ticker` 만. 사용자·전략과 무관한 "공용 시장 데이터" 라 누구의 소유도 아님.

---

## ⚠️ 함정·주의 (코드/스키마에 박힌 교훈)

### 1) 논리 참조라서 "고아 행"이 생길 수 있다

`order_proposal`, `subscription`, `alpha_chat_message`, `order_execution_audit`, `ai_usage_log` 등은 FK 가 없어 **DB 가 정합성을 안 지켜줍니다.** 예를 들어 회원을 (논리적으로) 지웠는데 그 회원의 `order_proposal.user_id` 행은 그대로 남을 수 있습니다 → **부모 없는 고아 행.** 또 `alpha_workspace` 를 지워도 `order_proposal.workspace_id` 가 가리키던 워크스페이스가 사라져 **"끊긴 참조"** 가 됩니다. → **모든 소유권/존재 검증은 서비스 코드가 떠안아야 함.** (실제로 `OrderProposal.java:37,45` 주석이 "코드가 검증한다"고 명시.)

### 2) 캐스케이드(CASCADE)가 사실상 없다

- 물리 FK 들도 **ON DELETE CASCADE 옵션이 없습니다**(기본 RESTRICT). 즉 자식이 있으면 부모(회원) 삭제가 **막힙니다.** 회원 탈퇴를 구현하려면 자식(strategy, broker_account, notification…)을 **코드가 먼저 지워야** 합니다.
- 논리 참조는 아예 연쇄 규칙이 없어, "회원 삭제 시 관련 alpha 데이터 정리"를 전부 수동 코드로 해야 합니다. → **탈퇴/정리 로직 누락 시 데이터가 남아 떠돕니다.**

### 3) 같은 엔티티 안에서도 FK 방식이 갈린다 (가장 헷갈리는 함정)

`AlphaWorkspace` 는 `user` 를 **물리 FK** 로, `broker_account_id` 를 **논리 참조** 로 둡니다(`AlphaWorkspace.java:26-28` vs `:74-75`). 또 `infinite_buying_subscription` 은 broker_account 를 물리 FK 로 묶는데, `order_proposal` 은 똑같은 broker_account 를 논리 참조로 둡니다. → **"이 테이블은 FK 쓰겠지" 추측 금지. 반드시 엔티티 코드를 한 줄씩 확인.**

### 4) 레거시 DevBridge 관계가 그대로 잔존한다

이 DB 는 원래 **DevBridge(프리랜서 매칭 플랫폼)** 였고, 그 위에 Alpha-Helix(퀀트)를 얹었습니다. 그래서:
- `docs/erd_dbdiagram.sql` 은 **DevBridge 32테이블만** 그립니다 — alpha 도메인(`order_proposal`, `alpha_workspace` …)이 **이 ERD 파일에 아예 없음.** alpha 관계를 알려면 `schema_full_current.sql` + 엔티티 코드를 봐야 함.
- `projects`, `client_profile`, `project_milestones`, `chat_room`, `project_escrows` 등 **퀀트와 무관한 레거시 테이블**이 스키마에 그대로 살아 있습니다(물리 FK 도 촘촘). 신규 alpha 작업 시 헷갈리지 않게 "이건 레거시"로 구분하세요.
- 패키지명도 `com.DevBridge.devbridge` 그대로 — 레거시 흔적.
- `notification.notification_type` enum 은 **전부 DevBridge 이벤트**(MILESTONE_*, CONTRACT_*, PROJECT_* …)뿐, 시그널/체결용 타입이 없습니다(`Notification.java:57-70`, 스키마 `:298`). 알림 도메인은 아직 퀀트용으로 확장 안 된 상태.

### 5) 폴리모픽 참조는 타입+id 쌍을 항상 함께 봐야 한다

`notification.related_entity_id` 는 단독으론 의미 없습니다. **반드시 `related_entity_type` 과 짝으로** 해석해야 어느 테이블의 행인지 알 수 있습니다(`Notification.java:43-47`). type 없이 id 만 믿으면 엉뚱한 테이블을 가리킵니다.

### 6) 문자열 키 느슨 참조 — ai_usage_log.model_id

`ai_usage_log.model_id`(문자열)는 `ai_model_catalog.model_id`(문자열 PK)를 **FK 없이** 가리킵니다. 카탈로그에서 모델을 지우거나 이름을 바꾸면 로그의 model_id 는 **갱신되지 않아 끊긴 문자열**이 됩니다. 집계 시 주의.

---

## 🚀 고도화 아이디어 (강의·개선 버전용)

1. **논리 참조 → 물리 FK 승격 검토**: `order_proposal.broker_account_id`, `subscription.user_id` 등 nullable 이 아닌 핵심 참조부터 FK 를 걸면 DB 가 고아 행을 막아줌. 단, 도메인 결합도↑·삭제 자유도↓ 트레이드오프를 강의 토론거리로.
2. **소프트 삭제(soft delete) 표준화**: 회원/워크스페이스를 물리 삭제 대신 `deleted_at` 으로 마킹 → 고아 행 문제 자체를 회피하고 감사성(order_execution_audit 철학)과 일치.
3. **회원 탈퇴 캐스케이드 서비스**: CASCADE 가 없으므로, "회원 1명에 매달린 모든 자식(물리 FK + 논리 참조 전부)"을 순서대로 정리하는 단일 서비스를 만들고 테스트. 논리 참조 테이블 목록을 한 곳에 등록.
4. **참조 무결성 점검 잡(Job)**: 야간 배치로 "부모 없는 order_proposal/subscription/chat_message"를 스캔해 알림 → 논리 참조의 약점을 운영으로 보완.
5. **notification 도메인 퀀트 확장**: `NotificationType` 에 SIGNAL_GENERATED/ORDER_FILLED/PROPOSAL_EXPIRED 추가 + `related_entity_type` 에 'ORDER_PROPOSAL','DAILY_SIGNAL' 케이스 매핑.
6. **레거시 분리**: DevBridge 테이블을 별도 스키마/문서로 격리하고, alpha 전용 ERD(`docs/erd_alpha.sql`)를 새로 작성해 dbdiagram.io 에 임포트 가능하게. (현 `erd_dbdiagram.sql` 은 alpha 누락.)
7. **strategy ↔ alpha_workspace 명시 연결**: 현재 워크스페이스(ai 도메인)와 strategy(strategy 도메인)가 직접 FK 로 안 묶여 있음. 둘을 잇는 명시 관계(또는 workspace_id 를 strategy 에)로 추적성 강화.

---

## 📚 용어 사전 (이 문서 한정)

| 용어 | 뜻 |
|---|---|
| **ERD** | 개체-관계도. 테이블(개체)과 그 사이 관계(선)를 그린 배선도 |
| **테이블(table)** | 같은 종류의 데이터를 담는 표(캐비닛). 예: `users`, `order_proposal` |
| **행(row)** | 테이블의 한 줄(서랍 1칸). 예: "회원 42번" |
| **PK(Primary Key)** | 행을 유일하게 식별하는 키. 보통 `id` |
| **FK(Foreign Key, 외래키)** | 다른 테이블의 PK 를 가리키는 키. **물리 FK** = DB 가 유효성 강제 |
| **논리 참조(logical reference)** | id 를 그냥 숫자 컬럼(`Long`)으로만 들고, DB FK 제약은 없는 느슨한 연결. 정합성은 코드 책임 |
| **1:N (일대다)** | 부모 1 : 자식 N. 자식이 부모 id 를 가짐. ERD 기호 `──<` |
| **1:1 (일대일)** | 부모 1 : 자식 1. 자식 쪽 FK 에 UNIQUE 가 붙음 |
| **N:M (다대다)** | 양쪽 다 여럿. 중간 연결 테이블로 구현 (예: `project_skill_mapping`) |
| **`@ManyToOne`** | JPA 에서 "이 엔티티 N개가 저 엔티티 1개를 가리킴". 보통 물리 FK 가 됨 |
| **`@OneToOne`** | 1:1 관계 매핑. UNIQUE FK 로 구현 |
| **`@JoinColumn(name=...)`** | FK 컬럼 이름 지정. 객체 참조(`private User user`)와 한 쌍 |
| **UNIQUE 제약** | 그 컬럼(조합)에 중복 값을 금지. 1:N 을 1:1 로 좁히거나 멱등성 보장에 씀 |
| **CASCADE** | 부모 삭제 시 자식 연쇄 삭제/차단 규칙. 이 프로젝트는 사실상 미사용(RESTRICT) |
| **고아 행(orphan row)** | 부모가 사라졌는데 남아있는 자식 행. 논리 참조에서 잘 생김 |
| **폴리모픽 참조** | type+id 쌍으로 "여러 테이블 중 하나"를 가리키는 패턴 (예: `notification.related_entity_*`) |
| **append-only** | 추가만 하고 수정·삭제 안 하는 테이블(감사로그). 예: `order_execution_audit` |
| **별(star) 모양 ERD** | 가운데 `users`, 사방으로 가지가 뻗는 형태. 멀티테넌시(소유권 중심)의 전형 |
| **마스터 데이터** | 누구 소유도 아닌 공용 참조 데이터. 예: `market_ohlc_daily`, `skill_master` |
| **레거시(DevBridge)** | 이 DB 의 전신인 프리랜서 매칭 플랫폼 흔적. alpha 와 무관한 테이블·enum 다수 |
