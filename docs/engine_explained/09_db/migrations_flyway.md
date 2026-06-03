# DB 마이그레이션 `db/migration/V1~V18` + Flyway 설정 — 완전 라인별 해설

> 원본: `backend/src/main/resources/db/migration/V1__baseline.sql` ~ `V18__refresh_tokens_table.sql` (18개)
> + Flyway 설정: `application.properties` · `application-prod.properties` · `application-local.properties` · `build.gradle`
> 이 문서는 **교재 표준 형식**(README "3. 공통 형식" + 모범 `01_backtest/vbt_engine.md`)을 따릅니다.

---

## 📌 한눈에

이 폴더(`db/migration/`)는 **"DB 스키마의 git 히스토리"** 입니다.

코드(Java)는 git 으로 "누가 언제 무엇을 바꿨나"를 추적하죠. 그런데 **데이터베이스의 테이블/컬럼 구조**는 git 이 추적해주지 않습니다. 어제 컬럼 하나를 추가했는데, 그게 운영 서버 DB·동료 DB·내 로컬 DB 에 **똑같이** 반영됐는지 어떻게 보장할까요? 이걸 자동으로 해주는 게 **Flyway** 라는 도구이고, `V1, V2, V3, ...` 처럼 **번호가 매겨진 SQL 파일**이 곧 "스키마의 커밋 한 개"입니다.

> 비유: 게임의 **세이브 슬롯**. `V16` 까지 진행한 DB 에 `V17, V18` 파일을 두면, Flyway 가 "아 이 DB 는 16번까지 했네, 17·18만 마저 실행하자" 하고 **빠진 것만 순서대로** 적용합니다. 한 번 적용한 파일은 두 번 실행하지 않습니다.

### 마이그레이션 목록표 (V1~V18)

| 버전 | 파일명 | 한 줄 요약 | 종류 |
|---|---|---|---|
| **V1** | `V1__baseline.sql` | 기준점(baseline) 표식 — 실제로는 실행 안 됨(`SELECT 1`) | 표식 |
| **V2** | `V2__ai_usage_log_indexes.sql` | AI 사용량 로그·모델 카탈로그 성능 인덱스 | 인덱스 |
| **V3** | `V3__alpha_helix_indexes.sql` | 워크스페이스·시그널·주문제안·채팅 인덱스 | 인덱스 |
| **V4** | `V4__drop_unused_user_columns.sql` | USERS 의 쓰지 않는 컬럼 3개 삭제 | 정리 |
| **V5** | `V5__rename_user_type_enum.sql` | user_type 값 이름 변경(CLIENT→USER, PARTNER→PRO) | 데이터 |
| **V6** | `V6__drop_client_profile_slogan.sql` | client_profile.slogan 컬럼 삭제 | 정리 |
| **V7** | `V7__fix_broker_account_defaults.sql` | 브로커 계좌 NULL 기본값 채우기(KIS/SPOT) | 데이터 |
| **V8** | `V8__add_broker_daily_krw_limits.sql` | KIS 매수/매도 1일 원화 한도 컬럼 + 시드 | 컬럼+데이터 |
| **V9** | `V9__add_auto_execute.sql` | 자동 체결 스위치 + 자동체결 표식 컬럼 | 컬럼 |
| **V10** | `V10__add_order_fill_columns.sql` | 주문 체결 확인 폴링용 컬럼 4개 | 컬럼 |
| **V11** | `V11__add_broker_balance_snapshot.sql` | 잔고/포지션 스냅샷 컬럼 2개 | 컬럼 |
| **V12** | `V12__add_order_execution_audit.sql` | 주문 실행 감사로그 테이블(append-only) | 테이블 |
| **V13** | `V13__add_daily_loss_limit.sql` | 1일 손실 한도(서킷브레이커) 컬럼 | 컬럼 |
| **V14** | `V14__binance_crypto_order_columns.sql` | **크립토 분수(소수점) 주문 수량 컬럼** | 컬럼 |
| **V15** | `V15__broker_account_multibroker_fix.sql` | **다중 브로커(KIS+Binance) 공존** 스키마 정합 | 제약/컬럼 |
| **V16** | `V16__broker_account_unique_constraint.sql` | **broker_account 유니크 제약(C5)** 복원 | 제약 |
| **V17** | `V17__subscription_payment_idempotency.sql` | **구독 결제 멱등성(M8)** — paymentKey 유니크 | 제약 |
| **V18** | `V18__refresh_tokens_table.sql` | **refresh_tokens 테이블(머지 정합)** | 테이블 |

> **핵심 분기점**: V16 까지가 "과거(baseline 처리)", V17 부터가 "실제 Flyway 가 운영에서 적용하는 영역"입니다. 그 이유는 `## ⚠️ 함정·주의`(C6 버그)에서 자세히 다룹니다.

---

## 🧠 사전 지식 (이거 모르면 막힘)

#### 1) Flyway 란? — "DB 스키마 버전 관리 도구"

Flyway 는 **번호가 붙은 SQL 파일을 순서대로, 한 번씩만 실행**해주는 도구입니다.

```
db/migration/
├── V1__baseline.sql      ← V + 번호 + __ + 설명
├── V2__ai_usage_log_indexes.sql
├── ...
└── V18__refresh_tokens_table.sql
```

파일명 규칙(외우세요):
- `V` (Versioned 의 V) + **버전 번호** + **언더스코어 2개(`__`)** + 설명 + `.sql`
- 언더스코어가 **2개**여야 합니다. 1개면 Flyway 가 인식 못 합니다.
- 번호 순서대로 실행. 비어 있는 번호(예: V14 없이 V15)는 없어야 깔끔합니다.

> 비유: 책의 **페이지 번호**. 1페이지부터 18페이지까지 순서대로 읽고, 이미 읽은 페이지는 다시 읽지 않습니다.

#### 2) 버전 마이그레이션(versioned migration) vs 반복 마이그레이션

- **V로 시작** = 버전 마이그레이션. 딱 한 번 실행되고 끝(이 프로젝트는 전부 이것).
- (참고) **R로 시작** = 반복 마이그레이션. 내용이 바뀌면 매번 다시 실행(뷰·프로시저용). 이 프로젝트엔 없음.

#### 3) `flyway_schema_history` 테이블 — "어디까지 했는지 적어두는 출석부"

Flyway 는 **자기가 적용한 마이그레이션을 DB 안의 특별한 테이블에 기록**합니다. 이름이 `flyway_schema_history` 입니다.

```
flyway_schema_history (Flyway 가 자동 생성·관리)
┌─────────┬──────────────────────────┬──────────┬─────────┐
│ version │ description              │ checksum │ success │
├─────────┼──────────────────────────┼──────────┼─────────┤
│ 16      │ broker account unique... │ 12345…   │ 1       │  ← baseline 표식
│ 17      │ subscription payment...  │ 67890…   │ 1       │
│ 18      │ refresh tokens table     │ 24680…   │ 1       │
└─────────┴──────────────────────────┴──────────┴─────────┘
```

- 부팅할 때 Flyway 는 이 출석부를 보고 **"17, 18 은 했네. 새 파일 V19 있나?"** 를 판단합니다.
- `checksum`(체크섬) = 파일 내용의 지문. **이미 적용한 V17 파일을 나중에 수정하면** 체크섬이 안 맞아 Flyway 가 에러를 냅니다("적용된 마이그레이션은 불변"이라는 철칙).

> ⚠️ 초보 핵심: **이미 적용·기록된 V 파일은 절대 내용을 고치지 마세요.** 고치고 싶으면 새 번호(V19)로 추가하는 게 정석입니다.

#### 4) baseline(기준점) — "이미 만들어진 DB 를 Flyway 에 입양시키기"

Flyway 를 **나중에 도입**하면 문제가 생깁니다. 이미 테이블이 100개 있는데, Flyway 는 출석부(`flyway_schema_history`)가 없으니 "어? 아무것도 안 했네, V1 부터 다 실행할까?" 하고 **이미 있는 테이블을 또 만들려다 충돌**합니다.

해결책이 **baseline**:
- `baseline-on-migrate=true` — "출석부가 없는데 테이블은 이미 있네? 그럼 V1 부터 무작정 실행하지 말고, **기준점까지는 '이미 했다'고 도장 찍고** 그 다음부터 실행해."
- `baseline-version=16` — 그 기준점이 **16번**. 즉 "V1~V16 은 이미 반영된 걸로 친다(실행 안 함), V17 부터 진짜 실행한다."

> 비유: 전학생(Flyway)이 이미 진도가 16과까지 나간 반에 합류. "1~16과는 다들 배운 걸로 치고, 나는 17과부터 가르칠게."

#### 5) 멱등(idempotent) 마이그레이션 — "여러 번 돌려도 안전하게"

**멱등** = 한 번 하든 열 번 하든 결과가 같음. 마이그레이션이 멱등이면, 어쩌다 두 번 적용돼도(또는 로컬 `ddl-auto` 가 먼저 만들어둔 걸 또 만들려 해도) 깨지지 않습니다.

MySQL 에서 멱등을 만드는 두 가지 패턴이 이 프로젝트에 모두 등장합니다:

1. **`IF EXISTS` / `IF NOT EXISTS`** — MySQL 이 직접 지원하는 것들:
   ```sql
   CREATE TABLE IF NOT EXISTS ...   -- 이미 있으면 그냥 넘어감 (V12, V18)
   CREATE INDEX IF NOT EXISTS ...   -- (V2, V3)
   DROP COLUMN IF EXISTS ...        -- (V4)
   ```
2. **`information_schema` 조건부 실행** — MySQL 이 `IF NOT EXISTS` 를 **지원 안 하는** 경우(`ADD CONSTRAINT`, `DROP INDEX` 등)에 쓰는 우회법:
   ```sql
   -- "이 제약이 이미 있나?"를 information_schema(=DB 의 자기소개 카탈로그)에 물어보고,
   -- 없을 때만 ALTER 문을 동적으로 만들어 실행 (V15, V16, V17)
   ```
   `information_schema` 는 **DB 가 자기 구조를 적어둔 메타 테이블 모음**입니다. "지금 broker_account 에 어떤 인덱스가 있지?"를 코드로 물어볼 수 있어요.

> 비유: `IF NOT EXISTS` = "냉장고에 우유 없으면 사 와"(한 줄). `information_schema 조건부` = MySQL 이 "우유 사 와"에 IF 를 못 붙여주니, **냉장고를 직접 열어보고(information_schema 조회) 없으면 사러 가는 코드**를 손수 짠 것.

#### 6) `ddl-auto` vs Flyway — "스키마를 누가 바꾸나"의 두 철학

Hibernate(JPA)의 `spring.jpa.hibernate.ddl-auto` 는 **앱이 부팅할 때 엔티티(@Entity) 클래스를 보고 테이블을 알아서 손대는** 옵션입니다.

| 값 | 동작 | 이 프로젝트에서 |
|---|---|---|
| `update` | 엔티티에 맞춰 **빠진 컬럼/테이블을 자동 추가** (삭제는 안 함) | **로컬** 개발(편함) |
| `validate` | 손대지 않고 **"엔티티 ↔ 실제 스키마가 일치하나"만 검사**. 불일치면 부팅 실패 | **운영(prod)** |
| `none`/`create`/`create-drop` | 안 함 / 매번 새로 만듦 | 미사용 |

**두 철학의 분업** (이 프로젝트의 핵심 설계):

```
로컬 개발  : ddl-auto=update + Flyway OFF
            → 엔티티만 고치면 컬럼 자동 생성. 편하게 개발.

운영(prod) : ddl-auto=validate + Flyway ON
            → 스키마 변경은 오직 V*.sql 마이그레이션으로만.
              Hibernate 는 "검사관" 역할(자동 변형 금지).
```

왜 운영은 `validate` 인가? `update` 는 **삭제를 안 하고**, 컬럼 타입 변경·제약 추가를 제대로 못 하며, **무엇을 언제 바꿨는지 기록이 안 남습니다.** 운영 DB 를 앱이 멋대로 건드리는 건 위험하므로, **명시적인 SQL(마이그레이션)로만** 바꾸고 Hibernate 는 검사만 하게 합니다.

> ⚠️ 초보 핵심: 로컬에서 엔티티에 컬럼을 추가하면 `ddl-auto=update` 가 자동으로 만들어줘서 **잘 돌아갑니다.** 하지만 운영은 `validate` 라 **마이그레이션 파일을 안 쓰면 부팅이 죽습니다.** 그래서 이 프로젝트의 V 파일 주석마다 "로컬은 ddl-auto 자동, 운영은 이 마이그레이션" 이라는 문구가 반복됩니다. 이게 V8~V16 의 존재 이유입니다.

---

## 📖 마이그레이션 V1~V18 하나씩

각 항목: **파일명 · 무엇을 · 왜(어떤 엔티티/이슈) · 핵심 SQL**.

---

### V1 — `V1__baseline.sql` · "실행되지 않는 기준점 표식"

**무엇을**: 아무 것도 안 합니다. 파일 본문은 딱 한 줄 `SELECT 1;` 입니다.

**왜**: Flyway 는 **번호가 빈 채로 시작하면 안 되므로** V1 자리를 채울 파일이 필요합니다. 하지만 이 프로젝트는 "빈 DB 에 Flyway 로 전체 테이블을 만드는" 방식이 **아닙니다.** 그래서 V1 은 일부러 **빈 표식**으로 두고, 실제 전체 스키마는 별도 SQL(`schema_full_current.sql`)을 import 합니다.

```sql
-- 이 스크립트는 실제로 실행되지 않습니다.
-- [기존 운영 DB] baseline-on-migrate=true 가 flyway_schema_history 가 없는
--   비어있지 않은 스키마를 만나면 baseline-version(=16) 기준으로 마킹하고 V17+ 부터 적용
-- [신규 구축] 빈 DB 에서는 마이그레이션만으로 스키마가 안 만들어진다(V2~V16 은 ALTER 뿐).
--   → 반드시 schema_full_current.sql(36테이블)을 먼저 import 한 뒤 기동.
SELECT 1;
```

> 💡 핵심: 주석이 **이 폴더 전체의 사용설명서**입니다. "V2~V16 은 ALTER 뿐, CREATE 하는 곳이 없다" → 즉 이 마이그레이션들은 **이미 존재하는 테이블을 수정·보강**하는 용도이지, 0부터 DB 를 짓는 용도가 아닙니다. 처음 보면 가장 헷갈리는 지점이니 꼭 기억하세요.

---

### V2 — `V2__ai_usage_log_indexes.sql` · "AI 사용량 조회 가속 인덱스"

**무엇을**: `ai_usage_log`·`ai_model_catalog` 두 테이블에 인덱스를 추가합니다.

**왜**: `AiGatewayService`(domain/ai)의 **월간 쿼터 체크**가 초당 수십 번 호출됩니다. "이 유저가 이 모델로 이번 달에 토큰 얼마나 썼나"를 매번 풀스캔하면 느려서, **복합 인덱스**로 가속합니다.

```sql
CREATE INDEX IF NOT EXISTS idx_ai_usage_user_model_created
    ON ai_usage_log (user_id, model_id, created_at);

CREATE INDEX IF NOT EXISTS idx_ai_catalog_enabled_sort
    ON ai_model_catalog (enabled, sort_order);
```

- `(user_id, model_id, created_at)` **순서가 중요**: "특정 유저 + 특정 모델 + 기간" 조회에 딱 맞춘 순서입니다. (인덱스는 왼쪽부터 좁혀가므로, 가장 자주 조건에 거는 컬럼을 앞에.)
- `CREATE INDEX IF NOT EXISTS` — MySQL 8 이 지원하는 멱등 패턴. 이미 인덱스가 있으면 조용히 넘어감.

> 💡 인덱스란? 책 뒤의 **색인(찾아보기)**. "삼성전자"를 본문 처음부터 안 뒤지고 색인에서 바로 페이지를 찾듯, DB 가 데이터를 빨리 찾게 해주는 보조 자료구조.

---

### V3 — `V3__alpha_helix_indexes.sql` · "Alpha-Helix 핵심 테이블 조회 인덱스"

**무엇을**: 워크스페이스·일일시그널·주문제안·채팅메시지에 인덱스 4개.

**왜**: 화면에서 자주 부르는 목록 조회 쿼리들을 빠르게 — 각각 어떤 화면/메서드가 쓰는지가 주석에 적혀 있습니다.

```sql
-- alpha_workspace: 유저별 최신 목록 (listWorkspaces 화면)
CREATE INDEX IF NOT EXISTS idx_alpha_ws_user_updated
    ON alpha_workspace (user_id, updated_at DESC);

-- daily_signal: 최신 신호 (ticker + 날짜 내림차순)
CREATE INDEX IF NOT EXISTS idx_daily_signal_ticker_date
    ON daily_signal (ticker, signal_date DESC);

-- order_proposal: 상태별 목록
CREATE INDEX IF NOT EXISTS idx_order_proposal_user_status
    ON order_proposal (user_id, status, created_at DESC);

-- alpha_chat_message: 워크스페이스별 대화(오름차순)
CREATE INDEX IF NOT EXISTS idx_alpha_chat_ws_created
    ON alpha_chat_message (workspace_id, created_at ASC);
```

- `DESC` / `ASC` 가 인덱스에 박혀 있습니다 — "최신순"으로 자주 정렬하면 `updated_at DESC` 인덱스가, 채팅처럼 "오래된 순"이면 `created_at ASC` 인덱스가 정렬까지 공짜로 해줍니다.

---

### V4 — `V4__drop_unused_user_columns.sql` · "USERS 의 죽은 컬럼 청소"

**무엇을**: `USERS` 테이블에서 `fax_number`, `interests`, `slogan` 세 컬럼을 삭제.

**왜**: 과거 템플릿의 잔재(팩스 번호 등). 더 이상 엔티티에 없는 컬럼이라 운영 `validate` 가 깐깐하진 않지만, **스키마를 엔티티와 일치시키려** 청소합니다.

```sql
ALTER TABLE USERS
    DROP COLUMN IF EXISTS fax_number,
    DROP COLUMN IF EXISTS interests,
    DROP COLUMN IF EXISTS slogan;
```

- `DROP COLUMN IF EXISTS` — 이미 없는 컬럼을 지우려 해도 에러 안 남(멱등). 환경마다 컬럼 유무가 다를 수 있어 방어적으로.

---

### V5 — `V5__rename_user_type_enum.sql` · "회원 등급 이름 갈아끼우기"

**무엇을**: `USERS.user_type` 의 **값**을 바꿉니다. `CLIENT→USER`, `PARTNER→PRO`.

**왜**: enum(회원 유형) 명칭을 리브랜딩. 이건 **컬럼 구조가 아니라 데이터(행 값) 변경**이라 `UPDATE` 문입니다.

```sql
UPDATE USERS SET user_type = 'USER' WHERE user_type = 'CLIENT';
UPDATE USERS SET user_type = 'PRO'  WHERE user_type = 'PARTNER';
```

- `WHERE` 로 옛 값만 골라 바꾸므로, 이미 'USER'/'PRO' 인 행은 안 건드림 → 두 번 돌려도 안전(멱등).

> 💡 구조 변경(ALTER) vs 데이터 변경(UPDATE) 구분: V2~V4 는 **틀(컬럼/인덱스)**, V5·V7 은 **알맹이(값)** 를 바꿉니다. 둘 다 마이그레이션이 될 수 있습니다.

---

### V6 — `V6__drop_client_profile_slogan.sql` · "프로필 슬로건 컬럼 삭제"

**무엇을**: `client_profile.slogan` 컬럼 1개 삭제.

**왜**: V4 의 USERS 청소와 같은 맥락 — 안 쓰는 프로필 필드 제거.

```sql
ALTER TABLE client_profile DROP COLUMN slogan;
```

- 여기는 `IF EXISTS` 가 없습니다. "이 컬럼은 반드시 있다"는 전제로 작성된 것. (deploy 폴더에 `add_slogan.sh` 가 보이는 걸로 보아, 한때 추가했다가 도로 제거한 흔적입니다.)

---

### V7 — `V7__fix_broker_account_defaults.sql` · "브로커 계좌 NULL 메우기"

**무엇을**: `BROKER_ACCOUNT` 의 `broker_type` 가 NULL 이면 `KIS`, `binance_mode` 가 NULL 이면 `SPOT` 으로 채움.

**왜**: 이 컬럼들이 **나중에 추가**되어, 기존 행에는 NULL 이 남았습니다. 코드가 broker_type 으로 분기하는데 NULL 이면 오작동하므로 기본값을 메웁니다.

```sql
UPDATE BROKER_ACCOUNT SET broker_type  = 'KIS'  WHERE broker_type  IS NULL;
UPDATE BROKER_ACCOUNT SET binance_mode = 'SPOT' WHERE binance_mode IS NULL;
```

> 💡 "컬럼을 나중에 추가하면 기존 행은 NULL" — 이 패턴이 V7·V8 에 반복됩니다. 새 컬럼은 ① 구조 추가(ALTER ADD) + ② 기존 행 값 채우기(UPDATE) **두 단계**가 자주 필요합니다.

---

### V8 — `V8__add_broker_daily_krw_limits.sql` · "KIS 매수/매도 1일 원화 한도"

**무엇을**: `BROKER_ACCOUNT` 에 `daily_buy_krw`·`daily_sell_krw` 컬럼 추가(BIGINT, NULL=무제한) + KIS 계좌에 기본값 시드.

**왜**: 자동매매 안전장치. 기존 `daily_order_usd`(Binance 등 달러용)와 **별도로**, KIS 는 원화 기준 매수/매도 한도를 분리 관리합니다. 메모리의 "KIS KRW 일일한도 양경로 집행(M3)"과 직결됩니다.

```sql
ALTER TABLE BROKER_ACCOUNT
    ADD COLUMN daily_buy_krw  BIGINT NULL COMMENT '1일 누적 매수 한도(원화). KIS 전용. null=무제한',
    ADD COLUMN daily_sell_krw BIGINT NULL COMMENT '1일 누적 매도 한도(원화). KIS 전용. null=무제한';

-- 실전(REAL)=보수적, 모의=관대하게 시드
UPDATE BROKER_ACCOUNT
SET daily_buy_krw  = CASE WHEN env = 'REAL' THEN 10000000  ELSE 50000000  END,
    daily_sell_krw = CASE WHEN env = 'REAL' THEN 30000000  ELSE 300000000 END
WHERE broker_type = 'KIS' AND daily_buy_krw IS NULL;
```

- `CASE WHEN env='REAL'` — 실거래 계좌는 1천만/3천만원으로 빡빡하게, 모의(MOCK)는 5천만/3억으로 느슨하게. **실수로 큰돈이 나가는 사고를 구조적으로 막는** 설계.
- `AND daily_buy_krw IS NULL` — 이미 값이 있으면 덮어쓰지 않음(멱등 + 사용자 설정 존중).

---

### V9 — `V9__add_auto_execute.sql` · "자동 체결 스위치"

**무엇을**: `broker_account.auto_execute`(자동 체결 ON/OFF, 기본 FALSE) + `order_proposal.auto_executed`(이 주문이 사람 승인 없이 자동 체결됐나) 컬럼 + 졸업게이트 집계용 인덱스.

**왜**: 메모리의 "자동 주문 체결(완전 자동체결 + 안전게이트)" 기능. **REAL 자동체결은 MOCK 졸업 게이트(2주+20회) 통과 필요**한데, 그 집계를 빠르게 하려고 인덱스도 같이 만듭니다.

```sql
ALTER TABLE broker_account
    ADD COLUMN auto_execute BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE order_proposal
    ADD COLUMN auto_executed BOOLEAN NOT NULL DEFAULT FALSE;

-- 계정별 자동체결 EXECUTED 건수/최초시각 집계 가속
CREATE INDEX idx_op_auto_exec ON order_proposal (broker_account_id, status, auto_executed);
```

- `NOT NULL DEFAULT FALSE` — 기본 OFF. 자동매매는 **명시적으로 켜야만** 동작(안전 기본값).

---

### V10 — `V10__add_order_fill_columns.sql` · "체결 확인 폴링 컬럼"

**무엇을**: `order_proposal` 에 체결 상태 추적 컬럼 4개.

**왜**: 주문을 넣은 뒤 "실제로 몇 주가 얼마에 체결됐나"를 KIS 에 주기적으로 물어(폴링) 기록합니다.

```sql
ALTER TABLE order_proposal
    ADD COLUMN fill_status     VARCHAR(16)    NULL,   -- 체결 상태
    ADD COLUMN filled_qty      INT            NULL,   -- 체결 수량
    ADD COLUMN fill_avg_price  DECIMAL(18,4)  NULL,   -- 평균 체결가
    ADD COLUMN fill_checked_at DATETIME(6)    NULL;   -- 마지막 확인 시각
```

- `DECIMAL(18,4)` — 가격은 **정확한 소수**(부동소수점 `float` 가 아니라). 돈 계산에서 `0.1+0.2≠0.3` 같은 오차를 피하려 DECIMAL 을 씁니다.
- 주석의 "로컬은 ddl-auto=update 자동, 운영은 이 마이그레이션" — `## 사전 지식 6` 의 분업 그대로.

---

### V11 — `V11__add_broker_balance_snapshot.sql` · "잔고 스냅샷"

**무엇을**: `broker_account` 에 마지막 잔고를 통째로 저장하는 컬럼 2개.

**왜**: 체결 후 브로커에서 받은 잔고/포지션 전체를 캐시해, 매번 KIS 를 호출하지 않고도 화면에 보여주기 위함.

```sql
ALTER TABLE broker_account
    ADD COLUMN last_balance_json LONGTEXT     NULL,  -- 잔고 JSON 통째로
    ADD COLUMN last_balance_at   DATETIME(6)  NULL;  -- 스냅샷 시각
```

- `LONGTEXT` + `_json` — JSON 응답을 **문자열 그대로** 저장(파싱해 컬럼으로 펴지 않음). 구조가 자주 바뀌는 외부 응답을 유연하게 보관하는 흔한 기법.

---

### V12 — `V12__add_order_execution_audit.sql` · "주문 실행 감사로그 테이블"

**무엇을**: 새 테이블 `order_execution_audit` 를 만듭니다(append-only = 추가만, 수정/삭제 안 함).

**왜**: "누가 언제 어떤 주문을 어떤 결과로 실행했나"의 **증거를 영구 보존**. 금융 시스템의 필수 감사 추적(audit trail).

```sql
CREATE TABLE IF NOT EXISTS order_execution_audit (
    id                BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id           BIGINT NOT NULL,
    proposal_id       BIGINT,
    broker_account_id BIGINT NOT NULL,
    env               VARCHAR(8),    -- MOCK / REAL
    ticker            VARCHAR(16),
    side              VARCHAR(8),    -- BUY / SELL
    qty               INT,
    limit_price       DECIMAL(18,4),
    kis_order_no      VARCHAR(32),   -- 브로커가 준 주문번호
    rt_cd             VARCHAR(8),    -- 브로커 응답코드
    auto_executed     BIT(1),
    outcome           VARCHAR(16),
    detail            VARCHAR(500),
    created_at        DATETIME(6),
    INDEX idx_oea_user (user_id, created_at),
    INDEX idx_oea_proposal (proposal_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

- `CREATE TABLE IF NOT EXISTS` + `ENGINE=InnoDB DEFAULT CHARSET=utf8mb4` — 멱등 생성 + 트랜잭션 지원 엔진 + 이모지·한글 안전한 utf8mb4.
- 테이블 정의 안에 인덱스(`INDEX idx_...`)를 같이 선언 — 만들면서 색인까지.

---

### V13 — `V13__add_daily_loss_limit.sql` · "1일 손실 한도(서킷브레이커)"

**무엇을**: `broker_account.daily_loss_limit_usd` 컬럼 1개.

**왜**: 자동매매가 하루에 일정 손실을 넘기면 **자동 정지**시키는 서킷브레이커(차단기) 설정값.

```sql
ALTER TABLE broker_account ADD COLUMN daily_loss_limit_usd BIGINT NULL;
```

- 가장 짧은 마이그레이션. 한 줄짜리도 어엿한 버전(V13). **작게 자주** 쪼개는 게 마이그레이션의 미덕(되돌리기 쉬움).

---

### V14 — `V14__binance_crypto_order_columns.sql` · ⭐ "크립토 분수(소수점) 수량 컬럼"

**무엇을**: `order_proposal` 에 `qty_decimal`·`filled_qty_decimal` 두 컬럼(`DECIMAL(28,8)`).

**왜**: **크립토는 0.5개, 0.001 BTC 처럼 소수점 수량**으로 거래합니다. 기존 `qty`(INT, 정수)로는 주식(1주 단위)만 되고 크립토를 못 담아서, **분수 전용 컬럼**을 추가합니다. 메모리의 "Binance 통합(SPOT 매수/매도)" 작업의 일부.

```sql
ALTER TABLE order_proposal ADD COLUMN qty_decimal        DECIMAL(28,8) NULL;
ALTER TABLE order_proposal ADD COLUMN filled_qty_decimal DECIMAL(28,8) NULL;
```

- `DECIMAL(28,8)` 의 의미: **전체 28자리, 그 중 소수점 이하 8자리.** 비트코인 최소단위(satoshi=0.00000001 BTC)가 소수 8자리라 딱 맞춥니다.
- `NULL` 인 이유: **KIS(주식) 주문은 정수 `qty` 를 쓰고 이 컬럼은 비워둠** → "KIS 정수 주문은 NULL — 영향 없음"이라는 주석. 한 테이블(`order_proposal`)이 주식·크립토 **둘 다** 담는 설계라, 한쪽만 쓰는 컬럼은 nullable.

> 💡 정수 vs 분수 컬럼을 **공존**시키는 패턴: 기존 코드(KIS)는 건드리지 않고, 새 자산군(크립토)을 위한 컬럼만 옆에 추가. "기존 것 깨지 않으면서 확장"의 교과서.

---

### V15 — `V15__broker_account_multibroker_fix.sql` · ⭐ "다중 브로커(KIS+Binance) 공존"

**무엇을**: ① 레거시 유니크 제약 `uq_broker_user_env` 제거 + ② KIS 전용 컬럼 4개를 NULL 허용으로 변경.

**왜 (중요)**: 엔티티(`BrokerAccount`)는 `(user_id, broker_type, env)` 유니크로 선언했는데, **과거 `ddl-auto=update` 가 옛 제약 `(user_id, env)` 를 그대로 남겨둬서 드리프트(스키마 표류)** 가 났습니다. 그 결과 **같은 env 에 KIS 와 Binance 계좌를 동시 등록하면 INSERT 가 실패**했습니다. (메모리의 "M2: 다중브로커 NonUnique" 와 연결.)

```sql
-- 1) 레거시 (user_id, env) 유니크 제거.
--    MySQL 은 DROP INDEX IF EXISTS 미지원 → information_schema 로 조건부 드롭(멱등).
SET @drop_legacy := (
    SELECT IF(COUNT(*) > 0,
        'ALTER TABLE broker_account DROP INDEX uq_broker_user_env',
        'DO 0')
    FROM information_schema.statistics
    WHERE table_schema = DATABASE()
      AND table_name = 'broker_account'
      AND index_name = 'uq_broker_user_env');
PREPARE s1 FROM @drop_legacy; EXECUTE s1; DEALLOCATE PREPARE s1;

-- 2) KIS 전용 컬럼을 NULL 허용으로 (Binance 계좌엔 이 값들이 없음). MODIFY 는 멱등.
ALTER TABLE broker_account MODIFY COLUMN app_key        VARCHAR(100) NULL;
ALTER TABLE broker_account MODIFY COLUMN app_secret_enc TEXT         NULL;
ALTER TABLE broker_account MODIFY COLUMN cano           VARCHAR(16)  NULL;
ALTER TABLE broker_account MODIFY COLUMN acnt_prdt_cd   VARCHAR(4)   NULL;
```

**information_schema 조건부 드롭 4줄 해부** (이 패턴이 V16·V17 에도 나오니 여기서 확실히):
1. `SELECT ... FROM information_schema.statistics WHERE index_name='uq_broker_user_env'` — "그 이름의 인덱스가 지금 몇 개 있나?" 카탈로그에 질의.
2. `IF(COUNT(*)>0, '진짜 DROP 문 문자열', 'DO 0')` — 있으면 진짜 ALTER 문자열을, 없으면 **아무 것도 안 하는 `DO 0`** 문자열을 만듭니다.
3. `SET @drop_legacy := (...)` — 그 결과 문자열을 변수에 담음.
4. `PREPARE ... EXECUTE ... DEALLOCATE` — 변수 안의 문자열을 **실제 SQL 로 컴파일해 실행**하고 정리(동적 SQL).

> 💡 왜 이 고생을? MySQL 은 `DROP INDEX IF EXISTS` 를 **지원하지 않습니다.** 그냥 `DROP INDEX uq_broker_user_env` 했다가 그 인덱스가 없는 환경에선 **에러로 마이그레이션 전체가 실패**합니다. 그래서 "있을 때만 실행"을 손수 구현한 것. `DO 0` = "0을 평가하고 버림" = 무해한 no-op.

> ⚠️ V15 의 미완: 레거시 제약을 **DROP 만 하고 새 제약을 ADD 하지 않았습니다.** 그래서 운영 스키마엔 한동안 올바른 유니크가 **아예 없었고**, 이를 V16 이 복구합니다.

---

### V16 — `V16__broker_account_unique_constraint.sql` · ⭐ "broker_account 유니크 복원(C5)"

**무엇을**: `broker_account` 에 `(user_id, broker_type, env)` **유니크 제약**을 (없을 때만) 추가.

**왜 (C5)**: V15 가 레거시 제약을 지우기만 하고 새 제약을 안 넣어서, **운영(Flyway) 스키마에는 엔티티가 선언한 `uq_broker_user_type_env` 제약이 존재하지 않았습니다.** 로컬 `ddl-auto` 는 자동으로 만들지만, **운영 `validate` 경로는 마이그레이션이 유일한 출처**입니다. 제약이 없으면 **같은 `(user_id, broker_type, env)` 중복 INSERT 가 DB 레벨에서 안 막힙니다.** (메모리의 "broker_account 유니크(C5)".)

```sql
-- 멱등: 동일 컬럼 조합의 유니크 인덱스가 이미 있으면(이름 무관) 스킵.
SET @has_uq := (
    SELECT COUNT(*)
    FROM (
        SELECT s.index_name
        FROM information_schema.statistics s
        JOIN information_schema.table_constraints tc
          ON tc.table_schema = s.table_schema
         AND tc.table_name   = s.table_name
         AND tc.constraint_name = s.index_name
         AND tc.constraint_type = 'UNIQUE'
        WHERE s.table_schema = DATABASE()
          AND s.table_name   = 'broker_account'
          AND s.column_name IN ('user_id', 'broker_type', 'env')
        GROUP BY s.index_name
        HAVING COUNT(DISTINCT s.column_name) = 3   -- 정확히 이 3개 컬럼
           AND MAX(s.seq_in_index) = 3             -- 컬럼이 3개뿐(군더더기 없음)
    ) dup);

SET @add_uq := IF(@has_uq = 0,
    'ALTER TABLE broker_account ADD CONSTRAINT uq_broker_user_type_env UNIQUE (user_id, broker_type, env)',
    'DO 0');
PREPARE s1 FROM @add_uq; EXECUTE s1; DEALLOCATE PREPARE s1;
```

**`HAVING` 두 줄이 영리한 점**:
- `COUNT(DISTINCT s.column_name) = 3` — 그 인덱스가 이 **3개 컬럼을 전부** 포함하나?
- `MAX(s.seq_in_index) = 3` — 그 인덱스가 **딱 3개 컬럼짜리**인가(4번째 컬럼이 없나)?
- 둘을 합치면: **"정확히 (user_id, broker_type, env) 세 컬럼만으로 된 유니크"가 이미 있나?** 를 이름과 무관하게 판별. 이름이 달라도(예: ddl-auto 가 만든 무작위 이름) 같은 제약이면 중복 추가를 피합니다.

> 💡 V15→V16 은 **"하나의 의도(다중 브로커 + 올바른 유니크)를 두 커밋으로 나눴다가, 두 번째 커밋이 누락돼 사후 보강한"** 실제 사례입니다. 마이그레이션도 코드처럼 버그가 날 수 있고, **앞 마이그레이션을 고치지 말고 새 번호로 보강**하는 게 정석임을 보여줍니다.

---

### V17 — `V17__subscription_payment_idempotency.sql` · ⭐ "구독 결제 멱등성(M8)"

**무엇을**: `subscription.toss_payment_key` 에 **유니크 제약**을 (없을 때만) 추가.

**왜 (M8)**: `SubscriptionController.confirm` 이 **같은 paymentKey 로 재호출**(더블클릭/새로고침/네트워크 재시도)되면, 매번 새 `Subscription` 행을 INSERT 하고 등급을 또 올려 **하나의 결제로 중복 구독·이중 등급부여**가 생길 수 있었습니다. 앱 레벨 사전 체크에 더해, **DB 유니크가 최종 방어선**입니다.

```sql
-- toss_payment_key 단일컬럼 유니크가 이미 있으면 스킵.
SET @has_uq := (
    SELECT COUNT(*)
    FROM (
        SELECT s.index_name
        FROM information_schema.statistics s
        JOIN information_schema.table_constraints tc
          ON tc.table_schema = s.table_schema
         AND tc.table_name   = s.table_name
         AND tc.constraint_name = s.index_name
         AND tc.constraint_type = 'UNIQUE'
        WHERE s.table_schema = DATABASE()
          AND s.table_name   = 'subscription'
          AND s.column_name  = 'toss_payment_key'
        GROUP BY s.index_name
        HAVING COUNT(DISTINCT s.column_name) = 1
           AND MAX(s.seq_in_index) = 1
    ) dup);

SET @add_uq := IF(@has_uq = 0,
    'ALTER TABLE subscription ADD CONSTRAINT uq_subscription_toss_payment_key UNIQUE (toss_payment_key)',
    'DO 0');
PREPARE s1 FROM @add_uq; EXECUTE s1; DEALLOCATE PREPARE s1;
```

- V16 과 같은 information_schema 패턴인데, 이번엔 **단일 컬럼**이라 `=1, =1`.
- **주석의 핵심**: `toss_payment_key 는 NULL 허용`(FREE/레거시 구독은 결제키 없음). **MySQL 유니크 인덱스는 다중 NULL 을 허용**하므로, 결제키 없는 무료 구독이 여러 개여도 충돌 안 납니다. (이건 SQL 표준의 미묘한 부분 — NULL 은 "값이 없음"이라 서로 같지 않은 것으로 취급.)

> 💡 **멱등성(idempotency)의 두 층위**가 여기 다 나옵니다: ① **마이그레이션이 멱등**(information_schema 로 중복 추가 방지) + ② 그 마이그레이션이 만드는 **유니크 제약이 결제를 멱등하게**(같은 paymentKey 두 번 INSERT 차단). "멱등"이라는 같은 단어가 두 다른 층에서 작동.

---

### V18 — `V18__refresh_tokens_table.sql` · ⭐ "refresh_tokens 테이블(머지 정합)"

**무엇을**: `refresh_tokens` 테이블을 (없을 때만) 생성.

**왜 (머지 정합)**: `main` 브랜치가 리프레시 토큰 기능(`RefreshToken`/`RefreshTokenRepository`)을 추가했는데 **Flyway 마이그레이션을 안 만들었습니다.** 이 브랜치의 **C6 수정으로 Flyway 가 운영에서 처음 실제로 켜졌고**, 운영은 `ddl-auto=validate` 라서 — **`refresh_tokens` 테이블이 없으면 Hibernate validate 단계에서 운영 부팅이 실패**합니다. (로컬 `update` 는 자동 생성해줘서 main 로컬에선 안 드러나던 갭.)

```sql
-- 멱등: 이미 (ddl-auto 로) 생성돼 있으면 CREATE TABLE IF NOT EXISTS 로 스킵.
CREATE TABLE IF NOT EXISTS refresh_tokens (
    id          BIGINT       NOT NULL AUTO_INCREMENT,
    user_id     BIGINT       NOT NULL,
    token       VARCHAR(64)  NOT NULL,
    expires_at  datetime(6)  NOT NULL,
    created_at  datetime(6)  NOT NULL,
    PRIMARY KEY (id),
    CONSTRAINT uq_refresh_tokens_token UNIQUE (token),  -- 토큰은 유일
    KEY idx_rt_user_id (user_id),                        -- 유저별 조회
    KEY idx_rt_expires_at (expires_at)                   -- 만료 청소 잡용
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

- 엔티티 `RefreshToken @Table(name="refresh_tokens")` 와 **컬럼·인덱스 이름까지 정확히 일치**해야 `validate` 가 통과합니다. 그래서 `idx_rt_user_id`, `idx_rt_expires_at` 같은 인덱스도 엔티티 선언 그대로 박아 넣음.
- `KEY` 는 MySQL 에서 `INDEX` 의 동의어(비유니크 인덱스).

> 💡 V18 은 **"기능 코드(엔티티)와 마이그레이션은 한 세트로 커밋해야 한다"** 는 교훈의 사례. 엔티티만 추가하고 마이그레이션을 빠뜨리면 로컬(`update`)에선 멀쩡하다가 **운영(`validate`)에서 터집니다.** 이것이 C6 로 Flyway 가 켜진 직후 가장 먼저 메운 구멍입니다.

---

## 🗺 Flyway 동작 흐름

운영(`prod`, `flyway.enabled=true`, `ddl-auto=validate`)에서 앱이 부팅할 때:

```
[ 앱 부팅 (SPRING_PROFILES_ACTIVE=prod) ]
              │
              ▼
   ① Flyway 자동설정 켜짐 (spring-boot-flyway 모듈 + flyway.enabled=true)
              │        ※ 이 모듈이 없으면 Flyway 가 통째로 잠듦 → C6 버그(아래 ⚠️)
              ▼
   ② flyway_schema_history(출석부) 있나?
        ├─ 없다 + 스키마는 비어있지 않다 (기존 운영 DB / import 직후)
        │     └─▶ baseline-on-migrate: baseline-version(16)까지 "이미 했음" 도장
        │            (V1~V16 은 실행 안 함)
        └─ 있다 (이미 한 번 마이그레이션 돌린 DB)
              └─▶ 출석부의 마지막 버전 확인
              │
              ▼
   ③ db/migration 의 V*.sql 을 번호순으로 훑어
      "출석부에 없는(미적용) 버전"만 골라 순차 실행
        예) 출석부=16  →  V17, V18 실행  →  출석부에 17,18 기록
              │
              ▼
   ④ Hibernate ddl-auto=validate :
      엔티티(@Entity) ↔ 실제 스키마 일치 검사
        ├─ 일치  → 부팅 성공 ✅
        └─ 불일치(예: V18 누락으로 refresh_tokens 없음) → 부팅 실패 ❌
              │
              ▼
   ⑤ 정상 기동 (애플리케이션 서비스 시작)
```

로컬(`local`, `flyway.enabled=false`, `ddl-auto=update`)에서는:

```
[ 앱 부팅 (기본 프로파일=local) ]
   → Flyway OFF (마이그레이션 안 돌림)
   → ddl-auto=update 가 엔티티 보고 빠진 컬럼/테이블 자동 추가
   → 편하게 개발 (마이그레이션 신경 안 써도 일단 돌아감)
```

---

## ⚠️ 함정·주의 (코드/설정에 박힌 교훈)

### 1. ⭐ C6 — "Flyway 가 운영에서 통째로 안 돌던 중대 버그" (이 폴더 최대 사건)

**증상**: 운영에 `flyway.enabled=true` 라고 켜뒀는데도, **Flyway 가 마이그레이션을 전혀 실행하지 않았습니다(마이그레이션 dead).**

**원인**: Spring Boot **4.0** 은 자동설정(autoconfigure)을 **모듈별로 분리**했습니다. 과거 Boot 3 까지는 `flyway-core` 만 있으면 `FlywayAutoConfiguration` 이 딸려왔지만, Boot 4 에선 그게 **별도 모듈 `spring-boot-flyway`** 로 빠졌습니다. 이게 클래스패스에 없으면 **자동설정 클래스 자체가 없어서**, `flyway.enabled=true` 든 뭐든 Flyway 가 아예 작동하지 않습니다.

**수정** (`build.gradle`):
```gradle
// ⚠️ Spring Boot 4.0 은 autoconfigure 를 모듈별로 분리했다. flyway-core 만으로는
//    FlywayAutoConfiguration 이 클래스패스에 없어 Flyway 가 기동 시 전혀 실행되지 않는다.
implementation 'org.springframework.boot:spring-boot-flyway'  // ← 이게 핵심
implementation 'org.flywaydb:flyway-core'
implementation 'org.flywaydb:flyway-mysql'
```

> 💀 무서운 점: 설정상 `enabled=true` 라 **켜진 줄 알았는데** 조용히 죽어 있었습니다. 에러도 안 나고 그냥 "마이그레이션 0건". 그래서 V17·V18 같은 보강(C5·M8·refresh_tokens)이 **운영에 반영조차 안 되던 상태**였습니다. C6 수정으로 Flyway 가 "처음으로 실제 활성화"되면서 비로소 V17+ 가 운영에 적용되기 시작했고, 그 직후 드러난 갭(refresh_tokens 누락)을 V18 로 메웠습니다. (메모리: "Flyway 자동실행 복구 + ... from-scratch 전체스키마 baseline(C6)".)

### 2. 로컬은 `flyway.enabled=false` + `ddl-auto=update` — 분업 구조

- 로컬 개발은 **Flyway 끔 + Hibernate 자동(update)**. 마이그레이션 안 짜도 엔티티만 고치면 컬럼이 생겨 편합니다.
- **그래서 마이그레이션 누락이 로컬에선 안 드러납니다** (V18 갭이 그랬듯). 운영 전 반드시 "엔티티 변경 = 마이그레이션 동반" 을 확인하세요.
- 설정 위치: `application.properties` 가 base(`flyway.enabled=false`, `ddl-auto=update`), `application-prod.properties` 가 오버라이드(`flyway.enabled=true`, `ddl-auto=validate`).

### 3. `baseline-version=16` — 신규 마이그레이션 추가 시 함께 올릴 것

```properties
spring.flyway.baseline-on-migrate=true
spring.flyway.baseline-version=16
```
- from-scratch 배포는 `schema_full_current.sql`(현재 전체 스키마, 36테이블)을 **먼저 import** 한 뒤 기동 → Flyway 가 "기존 스키마 + 히스토리 없음"을 보고 baseline(16) 도장 → V17+ 만 적용.
- ⚠️ **새 마이그레이션(V19…)을 추가하면**: `baseline-version` 을 직전 버전으로 올리고 `schema_full_current.sql` 도 **재생성**해야 합니다(설정 주석에 명시). 안 그러면 신규 배포에서 스키마 불일치.

### 4. 빈 DB 에 마이그레이션만으론 스키마가 안 만들어진다

- **V2~V16 은 전부 ALTER/UPDATE 이고, 핵심 테이블(broker_account·alpha_workspace·order_proposal·ai_usage_log…)을 CREATE 하는 곳이 없습니다.** (V12·V18 만 일부 테이블 CREATE.)
- 따라서 빈 DB 에 Flyway 만 돌리면 **"없는 테이블에 ALTER" 로 실패**합니다. 반드시 `schema_full_current.sql` 을 먼저 import (V1 주석 + `DEPLOY_FROM_SCRATCH.md` 참고).

### 5. MySQL 멱등 패턴의 함정 — `IF NOT EXISTS` 가 안 되는 곳

- MySQL 은 `CREATE TABLE/INDEX IF NOT EXISTS`, `DROP COLUMN IF EXISTS` 는 되지만 **`ADD CONSTRAINT ... IF NOT EXISTS`, `DROP INDEX IF EXISTS` 는 미지원**입니다.
- 그래서 V15·V16·V17 은 `information_schema` 를 조회해 "있으면 `DO 0`, 없으면 진짜 실행"하는 **동적 SQL(PREPARE/EXECUTE)** 로 우회합니다. 이 패턴을 모르고 그냥 `ADD CONSTRAINT` 만 쓰면, 재적용·환경차이 시 마이그레이션이 깨집니다.

### 6. 적용된 마이그레이션 파일은 절대 수정 금지

- Flyway 는 적용 시 `checksum`(지문)을 기록합니다. **이미 적용된 V17 파일의 내용을 바꾸면** 체크섬 불일치로 부팅이 막힙니다.
- 고칠 게 있으면 **새 번호(V19)** 로 추가하세요. V15→V16 이 바로 이 원칙의 실사례입니다(앞 파일을 고치지 않고 보강 파일을 새로 추가).

### 7. 메모리 연계 — env 우선순위 변경 시 중복키 감사

- 자동 메모리 "Env priority changes need duplicate-key audit": `application*.properties` 우선순위를 바꾸기 전, **같은 키가 다른 값으로 중복 정의**돼 있는지 확인(특히 `app.crypto.key`). Flyway/DDL 설정도 base↔prod 에 나뉘어 있으니, 한쪽만 보고 판단하면 오해합니다(예: base 만 보면 Flyway 가 꺼진 것처럼 보임 → prod 에서 켜짐).

---

## 🚀 고도화 아이디어 (강의·개선 버전용)

1. **롤백/언두 전략** — Flyway Community 는 자동 롤백이 없습니다. 위험한 변경은 "되돌리는 마이그레이션(V_down)"을 미리 짜두거나, `pt-online-schema-change` 같은 무중단 변경 도구를 병행.
2. **information_schema 헬퍼 프로시저** — V15·V16·V17 의 "조건부 제약 추가" 보일러플레이트를 **저장 프로시저 하나**로 추출(`add_unique_if_missing(table, name, cols)`)하면 신규 마이그레이션이 짧고 안전해집니다.
3. **CI 에서 마이그레이션 검증** — PR 마다 ① 빈 DB+`schema_full_current.sql`+V17~ 적용 ② 엔티티 `validate` 통과 를 자동으로 돌려, **"엔티티만 바꾸고 마이그레이션 빠뜨리는 갭"(V18 사례)** 을 머지 전에 잡기.
4. **`flyway:validate` / `flyway:info` 게이트** — 배포 파이프라인에서 부팅 전 `flyway info` 로 pending 마이그레이션을 출력하고, 예상과 다르면 배포 중단.
5. **schema drift 탐지 자동화** — `ddl-auto=update`(로컬)와 마이그레이션(운영)이 만든 스키마를 주기적으로 diff 해서, V15 같은 드리프트를 조기 경보.
6. **baseline-version 자동 갱신** — 새 V 파일을 추가하면 `baseline-version` 과 `schema_full_current.sql` 을 빌드 스크립트가 자동 동기화(수동 누락 방지).
7. **감사로그(V12) 파티셔닝** — `order_execution_audit` 는 append-only 라 무한 증가. `created_at` 기준 월별 파티션 + 오래된 파티션 아카이브로 운영.
8. **결제 멱등(V17) 강화** — DB 유니크에 더해, 애플리케이션에서 paymentKey 기반 분산 락(예: Redis SETNX)으로 **INSERT 시도 자체를 직렬화**하면 유니크 위반 예외 처리 부담을 줄임.

---

## 📚 용어 사전 (이 문서 한정)

| 용어 | 뜻 |
|---|---|
| **Flyway** | 번호 붙은 SQL(`V1__…`)을 순서대로 한 번씩 실행해 DB 스키마를 버전 관리하는 도구 |
| **마이그레이션(migration)** | 스키마/데이터를 한 단계 바꾸는 SQL 파일 = "스키마의 커밋 한 개" |
| **`flyway_schema_history`** | Flyway 가 "어디까지 적용했나"를 기록하는 출석부 테이블(자동 관리) |
| **checksum** | 마이그레이션 파일 내용의 지문. 적용 후 파일을 고치면 불일치로 부팅 차단 |
| **baseline** | 이미 만들어진 DB 를 Flyway 에 입양시키는 기준점. `baseline-version=16`=16까지 "이미 했음" 처리 |
| **`baseline-on-migrate`** | 출석부 없는 비어있지 않은 DB 를 만나면 baseline 부터 시작하라는 옵션 |
| **멱등(idempotent)** | 한 번 하든 여러 번 하든 결과가 같음. 마이그레이션이 두 번 돌아도 안 깨지게 |
| **`information_schema`** | DB 가 자기 구조(테이블·컬럼·인덱스·제약)를 적어둔 메타 카탈로그. 조건부 마이그레이션에 사용 |
| **동적 SQL(PREPARE/EXECUTE)** | 문자열로 만든 SQL 을 런타임에 컴파일·실행. "있을 때만 실행" 우회에 사용 |
| **`DO 0`** | 0을 평가하고 버리는 무해한 no-op 문. 조건 불충족 시 "아무 것도 안 함" 자리 채우기 |
| **`ddl-auto`** | Hibernate 가 부팅 시 스키마를 어떻게 다룰지: `update`(자동추가)/`validate`(검사만)/`none` 등 |
| **`validate`** | 엔티티 ↔ 실제 스키마 일치만 검사. 불일치면 부팅 실패(운영용) |
| **`update`** | 엔티티에 맞춰 빠진 컬럼/테이블 자동 추가(로컬 개발용). 삭제·제약 변경은 못 함 |
| **드리프트(drift)** | 의도한 스키마(엔티티)와 실제 DB 가 어긋난 상태. V15 가 바로잡은 문제 |
| **유니크 제약(UNIQUE)** | 특정 컬럼 조합의 중복 행을 DB 가 거부. V16(브로커)·V17(결제키)의 핵심 |
| **DECIMAL(p,s)** | 전체 p자리·소수 s자리의 **정확한** 십진수. 돈/수량은 float 대신 이걸 사용(V10·V14) |
| **append-only** | 추가만 하고 수정·삭제 안 하는 테이블. 감사로그(V12)의 성질 |
| **C5 / M8 / C6** | 이 브랜치의 수정 항목 번호 — C5=브로커 유니크(V16), M8=결제 멱등(V17), C6=Flyway 복구(build.gradle) |
