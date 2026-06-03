# `domain/notification` — 알림·이메일 도메인 (완전 라인별 해설)

> 원본 디렉터리: `backend/src/main/java/com/DevBridge/devbridge/domain/notification/` (5개 파일)
> - `controller/NotificationController.java` (88줄)
> - `service/EmailAlertService.java` (98줄)
> - `entity/Notification.java` (71줄)
> - `repository/NotificationRepository.java` (23줄)
> - `dto/NotificationResponse.java` (37줄)
>
> 이 문서는 교재 표준 형식(README "3. 공통 형식")을 따릅니다. Spring 기본 개념(`@RestController`·`@Service`·JPA·Lombok 등)은 `08_backend/00_spring_primer.md` 를 먼저 읽었다고 가정합니다.

---

## 📌 이 도메인 한눈에

이 도메인은 사용자에게 소식을 전하는 **"알림 우편함 + 이메일 발송실"** 두 가지를 담당합니다.

| 비유 | 실제 | 담당 |
|---|---|---|
| **앱 안의 우편함** (종 모양 아이콘에 빨간 배지) | 화면에 쌓이는 인앱 알림 — 읽음/안읽음 표시 | `Notification` 엔티티 + `NotificationController` + `NotificationRepository` |
| **이메일 발송실** | 오늘의 매매 신호를 모아 한 통의 이메일로 발송 | `EmailAlertService` |

핵심은 이 도메인이 **두 개의 거의 독립된 기능**이라는 점입니다. 하나는 "DB에 쌓아두고 화면에서 읽는 인앱 알림", 다른 하나는 "이메일로 밀어내는 다이제스트"입니다. 둘은 서로 호출하지 않습니다.

| 클래스 | 한 줄 역할 | 비유 |
|---|---|---|
| `Notification` (entity) | DB의 `NOTIFICATION` 테이블 한 줄 = 알림 하나(제목·내용·읽음여부·연결대상) | 우편함에 꽂힌 편지 한 통 |
| `NotificationRepository` | 그 편지들을 사용자별·읽음여부별로 꺼내는 JPA 인터페이스 | 우편함을 뒤지는 사서 |
| `NotificationResponse` (dto) | 엔티티를 프론트에 줄 안전한 JSON 형태로 바꾼 것 | 편지를 봉투에 담아 외부로 내보냄 |
| `NotificationController` | `/api/notifications` REST 입구. **신원은 JWT에서만 확인**(M9 보안) | 우편함 창구 직원 |
| `EmailAlertService` | 미발송 시그널을 사용자별로 묶어 비동기 이메일 발송 | 이메일 발송실 |

> ⚠️ 중요한 사실 하나: `NotificationController` 가 실제 작업을 시키는 서비스는 **이 도메인 안에 없습니다**. 컨트롤러는 `domain/chat` 패키지의 `StreamChatService` 를 호출합니다(자세한 이유는 라인별 해설 참고). 즉 인앱 알림의 "비즈니스 로직"은 chat 도메인에 얹혀 있고, 이 도메인에는 엔티티·레포지토리·DTO·컨트롤러만 있습니다.

**누가 호출하나?**
- 인앱 알림: 프론트엔드(예정 — 아래 M5 함정 참고)가 `/api/notifications` 를 호출.
- 이메일: 백엔드 스케줄러(일일 시그널 생성 후 `dispatchPending(오늘날짜)` 호출)가 트리거.

---

## 🧠 사전 지식 (이거 모르면 막힘)

#### 1) "알림 엔티티" = DB 테이블의 한 줄을 자바 객체로
`Notification` 객체 1개 = `NOTIFICATION` 테이블의 1행입니다. JPA(Hibernate)가 자바 객체 ↔ DB 행을 자동 변환해 줍니다. 예:

```
id │ user_id │ notification_type │ title          │ is_read │ created_at
 1 │   42    │ NEW_MESSAGE       │ 새 메시지 도착   │ false   │ 2026-06-01 09:00
```

이 한 줄이 자바에서는 `Notification` 객체가 되고, 프론트로 나갈 땐 `NotificationResponse`(JSON)가 됩니다.

#### 2) "읽음 상태(is_read)" = 안 읽음/읽음 토글
- 새 알림은 `is_read = false`(안 읽음)로 태어납니다. 종 아이콘 옆 **빨간 숫자 배지**가 곧 "안 읽음 개수"입니다.
- 사용자가 알림을 보면 `is_read = true` 로 바뀝니다. 한 건씩(`/{id}/read`) 또는 전체(`/read-all`) 처리 가능.
- "안 읽음 개수"를 빠르게 세려고 `countByUserAndIsReadFalse` 같은 전용 쿼리를 둡니다(전부 가져와 세지 않음 → 가볍고 빠름).

#### 3) Gmail SMTP = 자바가 메일 서버를 통해 메일을 쏘는 길
- `JavaMailSender` 는 Spring이 주는 "메일 발송기"입니다. 뒤에서 Gmail의 SMTP 서버에 접속해 메일을 보냅니다.
- 접속에 필요한 계정·비밀번호는 설정값(`spring.mail.username`, `spring.mail.password`)에서 옵니다. **Gmail은 일반 비밀번호가 아니라 "앱 비밀번호"** 를 써야 합니다(CLAUDE.md의 `MAIL_PASSWORD`).
- `SimpleMailMessage` = 가장 단순한 형태의 메일(받는사람·제목·**평문 본문**). HTML이 아니라 줄바꿈만 있는 텍스트입니다.

#### 4) 비동기(@Async) 발송 = "보내고 기다리지 않기"
- 이메일 발송은 외부 서버(Gmail)와 통신하므로 느릴 수 있습니다(수백 ms~수 초).
- `@Async` 를 붙이면 이 메서드는 **별도 스레드에서** 돌고, 호출한 쪽(예: 시그널 스케줄러)은 바로 다음 일을 합니다. → 스케줄러가 메일 발송을 기다리며 멈추지(block) 않습니다.
- 비유: 편지를 우체통에 넣고 곧장 가던 길을 갑니다. 우체부가 배달을 끝낼 때까지 우체통 앞에서 서 있지 않습니다.

#### 5) IDOR(Insecure Direct Object Reference) — M9가 막은 그것
- "내 알림"을 가져오는 API가 `?userId=42` 처럼 **요청 파라미터로 받은 ID를 그대로 믿으면**, 공격자가 `?userId=43` 으로 바꿔 **남의 알림**을 훔쳐볼 수 있습니다. 이것이 IDOR.
- 해결: 신원을 절대 요청에서 받지 않고, **위조 불가능한 JWT(로그인 토큰)에서만** 꺼냅니다. 이 도메인의 M9 보안 수정이 정확히 이것입니다.

---

## 🗺 요청 흐름도

### (A) 인앱 알림 조회·읽음 — REST 흐름

```
프론트엔드(브라우저)
   │  GET /api/notifications   (JWT 쿠키 자동 첨부)
   ▼
JwtAuthenticationFilter  ─── 쿠키의 JWT 검증 → 요청에 user_id 속성 부착
   │
   ▼
NotificationController.getAll()
   │  ① currentUser() → AuthContext.currentUserId()  ← JWT에서만 신원 취득 (M9)
   │       │ uid 없으면 401 Unauthorized
   │       ▼
   │  ② userRepository.findById(uid) → User
   │       ▼
   │  ③ streamChatService.getNotificationsForUser(user)   ← chat 도메인 서비스
   │       │
   │       ▼
   │     NotificationRepository.findByUserOrderByCreatedAtDesc(user)
   │       │  (DB: 내 알림만, 최신순)
   │       ▼
   │     List<Notification>
   │       ▼
   │  ④ .map(NotificationResponse::from)   ← 엔티티 → 안전한 JSON DTO
   ▼
ResponseEntity.ok(List<NotificationResponse>)  → 프론트 JSON
```

### (B) 이메일 다이제스트 — 스케줄러 흐름

```
일일 시그널 스케줄러 (장 마감 후)
   │  EmailAlertService.dispatchPending(오늘날짜)
   ▼
DailySignalRepository.findByAsOfDateAndDeliveredAtIsNull(오늘)   ← 아직 안 보낸 시그널
   │
   ▼
사용자별 그룹핑  (groupingBy: s.getStrategy().getUser())
   │   user42 → [signalA, signalB]
   │   user43 → [signalC]
   ▼
각 사용자마다  sendDigest(user, signals)   @Async (별도 스레드)
   │  ① 이메일 주소·발신주소 없으면 skip
   │  ② 제목·본문 조립 (buildBody)
   │  ③ JavaMailSender.send(SimpleMailMessage)  → Gmail SMTP
   │  ④ 성공 시 각 signal.deliveredAt = now → saveAll  (중복발송 방지)
   ▼
   (실패해도 catch로 삼켜 로그만 — 스케줄러는 계속 진행)
```

> 두 흐름이 **만나지 않는다**는 점을 다시 강조합니다. (A)는 `Notification` 테이블을 읽고, (B)는 `DAILY_SIGNAL` 테이블을 읽어 메일을 쏩니다. 이메일 발송은 인앱 `Notification` 행을 만들지 않습니다.

---

## 📖 라인별 해설

### 1) `entity/Notification.java` — 알림 한 통의 설계도

먼저 엔티티부터 봅니다. 모든 알림 데이터의 "모양"이 여기서 정의되기 때문입니다.

#### 클래스 선언과 어노테이션 — `Notification.java:11-23`
```java
// L11-L23
/**
 * In-app system notifications.
 * Covers both chat events (NEW_MESSAGE) and non-chat events (milestones, contracts, etc.).
 */
@Entity
@Table(name = "NOTIFICATION")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
@EntityListeners(AuditingEntityListener.class)
public class Notification {
```
- **무엇을 하나**: 이 클래스를 DB 테이블 `NOTIFICATION` 과 연결합니다.
- `@Entity` + `@Table(name="NOTIFICATION")` — "이 자바 클래스 1개 = DB 테이블 1개, 객체 1개 = 행 1개".
- `@Getter/@Setter` (Lombok) — 필드마다 `getId()/setId()` 같은 메서드를 컴파일 때 자동 생성. 코드에는 안 보이지만 존재합니다.
- `@NoArgsConstructor`(빈 생성자) + `@AllArgsConstructor`(모든 필드 생성자) + `@Builder`(빌더 패턴) — 객체를 여러 방식으로 만들 수 있게. JPA는 빈 생성자를 **필수로** 요구합니다.
- `@EntityListeners(AuditingEntityListener.class)` — 아래 `@CreatedDate` 가 작동하도록 "감시자"를 붙임. 저장 시 생성시각을 자동 기록.
- **초보 헷갈림 포인트**: 클래스명은 `Notification`, 테이블명은 대문자 `NOTIFICATION`. 둘이 달라도 `@Table(name=...)` 이 다리를 놓아줍니다. 주석의 "chat 이벤트와 비-chat 이벤트(마일스톤·계약 등)를 모두 다룬다"는 설명은 이 엔티티가 원래 더 큰 협업/계약 시스템에서 가져온 흔적입니다(아래 enum 참고).

#### 기본키(PK) — `Notification.java:25-27`
```java
// L25-L27
@Id
@GeneratedValue(strategy = GenerationType.IDENTITY)
private Long id;
```
- `@Id` — 이 필드가 **기본키**(각 행의 고유 번호).
- `@GeneratedValue(strategy = IDENTITY)` — 번호를 **DB가 auto_increment 로 자동 부여**. 새 알림을 저장하면 DB가 1, 2, 3… 을 매깁니다. 우리가 직접 id를 정하지 않습니다.

#### 알림 주인(사용자) — `Notification.java:29-31`
```java
// L29-L31
@ManyToOne(fetch = FetchType.LAZY)
@JoinColumn(name = "user_id", nullable = false)
private User user;
```
- `@ManyToOne` — **여러(Many) 알림이 한(One) 사용자에 속함**. 한 명이 알림을 여러 개 가질 수 있으니까요.
- `@JoinColumn(name="user_id", nullable=false)` — DB에는 `user_id` 라는 외래키 컬럼으로 저장. `nullable=false` = 주인 없는 알림은 금지.
- `fetch = FetchType.LAZY` — "**필요할 때만**" User를 DB에서 가져옴(지연 로딩). 알림 목록만 볼 땐 User 정보를 굳이 안 읽어 성능에 유리. (반대 EAGER는 항상 같이 읽음.)
- **왜 중요한가**: 이 `user` 필드가 곧 "이 알림은 누구 것인가"의 근거입니다. M9 IDOR 방어, 소유권 재확인(아래 `markNotificationRead`)이 모두 이 필드를 비교합니다.

#### 알림 종류(enum) — `Notification.java:33-35` + `57-70`
```java
// L33-L35
@Enumerated(EnumType.STRING)
@Column(name = "notification_type", nullable = false, length = 50)
private NotificationType notificationType;
```
```java
// L57-L70
public enum NotificationType {
    NEW_MESSAGE,
    APPLICATION_ACCEPTED,
    APPLICATION_REJECTED,
    MILESTONE_SUBMITTED,
    MILESTONE_APPROVED,
    MILESTONE_REVISION_REQUESTED,
    CONTRACT_ITEM_PROPOSED,
    CONTRACT_ITEM_AGREED,
    PROJECT_COMPLETED,
    REVIEW_RECEIVED,
    DEPOSIT_RECEIVED,
    PROJECT_UPDATED
}
```
- `@Enumerated(EnumType.STRING)` — enum을 DB에 **문자열로** 저장(`"NEW_MESSAGE"`). `EnumType.ORDINAL`(0,1,2 숫자)을 쓰면 enum 순서를 바꿀 때 기존 데이터가 어긋나므로, **STRING 이 안전한 관습**입니다.
- `@Column(... length=50)` — 컬럼 길이 50자 제한.
- **솔직한 관찰(환각 아님, 실제 코드 기반)**: enum 값 12개 대부분(`MILESTONE_*`, `CONTRACT_*`, `PROJECT_*`, `DEPOSIT_RECEIVED` 등)은 퀀트 투자가 아니라 **프리랜서/협업 프로젝트 도메인** 용어입니다. 이는 이 코드베이스가 다른 프로젝트(DevBridge — 협업/계약 플랫폼)에서 유래해, 알림 엔티티를 그대로 가져온 흔적입니다. 현재 Alpha-Helix에서 실제로 만들어지는 알림이 이 중 어떤 값을 쓰는지는 이 도메인 코드만으로는 알 수 없습니다(생성 측 코드는 다른 도메인). 학습 시 "이 enum은 범용 알림 카탈로그이며, 투자 도메인이 전부 사용하는 건 아니다"로 이해하세요.

#### 제목·본문 — `Notification.java:37-41`
```java
// L37-L41
@Column(nullable = false, length = 200)
private String title;

@Column(nullable = false, columnDefinition = "TEXT")
private String message;
```
- `title` — 알림 제목. `length=200` → DB의 `VARCHAR(200)`. 비어 있을 수 없음(`nullable=false`).
- `message` — 알림 본문. `columnDefinition="TEXT"` → 길이 제한이 큰 `TEXT` 타입(긴 문장 가능). `VARCHAR` 가 아니라 `TEXT` 를 쓴 이유는 본문이 길 수 있어서입니다.

#### 연결 대상(클릭하면 어디로?) — `Notification.java:43-47`
```java
// L43-L47
@Column(name = "related_entity_type", length = 50)
private String relatedEntityType;

@Column(name = "related_entity_id")
private Long relatedEntityId;
```
- 이 두 필드는 **"이 알림이 가리키는 대상"** 을 느슨하게 가리킵니다. 예: `relatedEntityType="STRATEGY"`, `relatedEntityId=7` → "전략 7번에 관한 알림".
- `nullable` 표기가 없어 **null 허용**(둘 다 선택사항). 단순 시스템 공지처럼 연결 대상이 없을 수도 있으니까요.
- **왜 FK가 아니라 type+id 두 컬럼인가**: 알림이 전략·계약·프로젝트 등 **여러 종류의 대상**을 가리킬 수 있어, 특정 테이블 하나에 외래키를 걸 수 없습니다. 그래서 "타입 문자열 + id" 조합으로 다형적(polymorphic) 참조를 흉내냅니다. (DB 무결성 보장은 약해지지만 유연합니다.)

#### 읽음 여부 — `Notification.java:49-51`
```java
// L49-L51
@Column(name = "is_read", nullable = false)
@Builder.Default
private boolean isRead = false;
```
- `isRead` — 읽음(true)/안읽음(false). 새 알림은 `false`.
- `@Builder.Default` — **빌더로 만들 때도** 기본값 `false` 가 적용되게 함. 이게 없으면 `@Builder` 가 boolean 기본값 `false`(자바 원시값 기본)로만 채워 헷갈릴 수 있어, 명시적 초기화의 의도를 보존하려는 표시입니다.
- **초보 헷갈림**: 필드명은 `isRead` 인데 Lombok이 만드는 getter는 boolean 관습상 `isRead()`(앞의 `is`를 중복하지 않음)입니다. DTO 변환부에서 `n.isRead()` 로 호출되는 이유입니다.

#### 생성 시각(자동 기록) — `Notification.java:53-55`
```java
// L53-L55
@CreatedDate
@Column(name = "created_at", nullable = false, updatable = false)
private LocalDateTime createdAt;
```
- `@CreatedDate` — 행이 **처음 저장될 때** 현재 시각을 자동 기입(위 `AuditingEntityListener` 덕분). 우리가 직접 안 넣어도 됩니다.
- `updatable = false` — 한 번 기록되면 **수정 불가**(생성 시각은 바뀌면 안 되니까).
- 이 컬럼이 "최신순 정렬"(`OrderByCreatedAtDesc`)의 기준이 됩니다.

---

### 2) `repository/NotificationRepository.java` — 알림을 꺼내는 사서

```java
// L12-L23
public interface NotificationRepository extends JpaRepository<Notification, Long> {

    List<Notification> findByUserOrderByCreatedAtDesc(User user);

    List<Notification> findByUserAndIsReadFalseOrderByCreatedAtDesc(User user);

    long countByUserAndIsReadFalse(User user);

    @Modifying
    @Query("UPDATE Notification n SET n.isRead = true WHERE n.user = :user AND n.isRead = false")
    void markAllReadByUser(@Param("user") User user);
}
```
- `extends JpaRepository<Notification, Long>` — 이것만 상속하면 `save/findById/findAll/delete` 등 **기본 CRUD가 공짜로** 생깁니다. 구현 클래스를 우리가 안 짭니다(Spring Data JPA가 런타임에 자동 생성).
- **쿼리 메서드(메서드 이름 = 쿼리)**: Spring Data JPA는 메서드 이름을 분석해 SQL을 자동으로 만듭니다.
  - `findByUserOrderByCreatedAtDesc(user)` → "이 user의 알림을 created_at 내림차순(최신 먼저)으로 전부" = `/api/notifications` 가 쓰는 쿼리.
  - `findByUserAndIsReadFalseOrderByCreatedAtDesc(user)` → "이 user의 **안 읽은** 알림만, 최신순" = `/unread` 가 쓰는 쿼리.
  - `countByUserAndIsReadFalse(user)` → "이 user의 안 읽은 알림 **개수**"(목록을 안 가져오고 숫자만) = `/count`(배지)가 쓰는 쿼리. **목록 전체를 받아 세는 것보다 훨씬 가볍습니다.**
- **벌크 업데이트** `markAllReadByUser`:
  - `@Query("UPDATE ...")` — JPQL(엔티티 기준 쿼리)로 "이 user의 안 읽은 알림 전부를 `isRead=true` 로" 한 방에 갱신.
  - `@Modifying` — 이게 **읽기(SELECT)가 아니라 변경(UPDATE)** 임을 JPA에 알림. 없으면 실행 시 에러.
  - **왜 직접 쿼리인가**: 알림이 100개여도 객체 100개를 메모리로 불러 하나씩 `setRead(true)` 하면 느립니다. UPDATE 한 문장이 **한 번의 DB 왕복**으로 끝나 효율적.
  - **초보 주의**: `@Modifying` 벌크 쿼리는 영속성 컨텍스트(1차 캐시)를 우회합니다. 같은 트랜잭션에서 이미 로딩한 엔티티가 있으면 캐시와 DB가 불일치할 수 있습니다(이 코드 흐름에선 직후 응답을 끝내므로 문제 없음).

---

### 3) `dto/NotificationResponse.java` — 프론트로 내보낼 안전한 봉투

```java
// L11-L23
@Getter
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class NotificationResponse {
    private Long id;
    private String notificationType;
    private String title;
    private String message;
    private String relatedEntityType;
    private Long relatedEntityId;
    private boolean isRead;
    private LocalDateTime createdAt;
```
- **왜 엔티티를 그대로 안 주고 DTO를 따로 두나** (DTO 패턴의 핵심 이유):
  1. **보안/캡슐화**: 엔티티 `Notification` 에는 `user`(User 객체 전체)가 들어 있습니다. 이를 그대로 JSON 직렬화하면 **사용자 비밀번호 해시·이메일 등 민감정보가 새어나갈 위험**이 있습니다. DTO는 `user`를 통째로 빼고, 외부에 줘도 되는 필드만 골라 담습니다.
  2. **지연로딩 함정 회피**: 엔티티의 LAZY 필드를 직렬화 시점에 건드리면 `LazyInitializationException` 이 날 수 있는데, DTO로 미리 평탄화하면 안전합니다.
  3. **타입 변환**: enum `NotificationType` 을 `String`(`notificationType`)으로 바꿔 프론트가 다루기 쉽게.
- 필드 구성이 엔티티와 닮았지만 **`user` 가 없다**는 게 핵심 차이입니다.

#### 엔티티 → DTO 변환 — `NotificationResponse.java:25-36`
```java
// L25-L36
public static NotificationResponse from(Notification n) {
    return NotificationResponse.builder()
            .id(n.getId())
            .notificationType(n.getNotificationType().name())
            .title(n.getTitle())
            .message(n.getMessage())
            .relatedEntityType(n.getRelatedEntityType())
            .relatedEntityId(n.getRelatedEntityId())
            .isRead(n.isRead())
            .createdAt(n.getCreatedAt())
            .build();
}
```
- `static ... from(Notification n)` — **정적 팩토리 메서드**. "엔티티를 넣으면 DTO를 만들어주는 변환기". 컨트롤러에서 `NotificationResponse::from`(메서드 참조)으로 깔끔히 호출됩니다.
- `.notificationType(n.getNotificationType().name())` — enum을 `.name()` 으로 문자열화(`NEW_MESSAGE` → `"NEW_MESSAGE"`).
- `.isRead(n.isRead())` — boolean getter는 `isRead()`(앞서 설명한 Lombok 관습).
- **빠진 것에 주목**: `user` 를 복사하지 않습니다. 그래서 응답 JSON에 사용자 민감정보가 절대 포함되지 않습니다.

---

### 4) `controller/NotificationController.java` — 창구 + M9 IDOR 방어

#### 클래스 주석 = M9 보안의 핵심 — `NotificationController.java:16-26`
```java
// L16-L26
/**
 * Notification endpoints.
 *
 * <p>M9 보안 수정: 이전에는 {@code ?userId=} 요청 파라미터를 그대로 신뢰해 인증된 누구나 타인의 알림을
 * 조회/읽음처리할 수 있는 IDOR 가 있었다. 이제 신원은 항상 JWT(AuthContext)에서만 가져오고,
 * 요청 파라미터로 받지 않는다. CORS 는 WebConfig 가 전역 처리.
 */
@RestController
@RequestMapping("/api/notifications")
@RequiredArgsConstructor
public class NotificationController {
```
- **M9가 무엇을 고쳤나**: 과거 코드는 `GET /api/notifications?userId=42` 처럼 **URL의 `userId` 를 그대로 믿었습니다**. 로그인만 했으면 누구나 `?userId=43` 으로 바꿔 **남의 알림을 조회/읽음처리**할 수 있었습니다(전형적 IDOR).
- **고친 방식**: 모든 엔드포인트에서 `userId` 파라미터를 **완전히 제거**하고, 신원은 오직 `AuthContext.currentUserId()`(= 위조 불가능한 JWT)에서만 가져옵니다. 클라이언트가 보낸 값은 신원으로 **절대** 쓰지 않습니다.
- `@RestController` — 반환값을 JSON 본문으로(뷰 렌더링 X).
- `@RequestMapping("/api/notifications")` — 이 컨트롤러의 모든 경로 앞에 붙는 공통 접두사.
- `@RequiredArgsConstructor`(Lombok) — `final` 필드를 받는 생성자 자동 생성 → 아래 두 의존성을 **생성자 주입**.

#### 의존성 — `NotificationController.java:28-29`
```java
// L28-L29
private final StreamChatService streamChatService;
private final UserRepository userRepository;
```
- **여기가 도메인 구조의 핵심 단서**: 이 컨트롤러는 `notification` 도메인 안의 서비스가 아니라, **`domain/chat` 의 `StreamChatService`** 에 일을 위임합니다(`import com.DevBridge.devbridge.domain.chat.service.StreamChatService`).
- **왜?** 인앱 알림은 원래 "새 채팅 메시지 도착(NEW_MESSAGE)" 같은 chat 이벤트와 함께 생성/관리되었습니다. 그래서 알림 CRUD 로직이 채팅 서비스에 함께 들어 있습니다(`StreamChatService.getNotificationsForUser` 등). 이 도메인은 데이터 모델(엔티티·레포·DTO)과 REST 입구(컨트롤러)만 소유하고, **로직은 chat 도메인에 얹혀 있는** 구조입니다.
- `userRepository` 는 JWT에서 얻은 user_id로 실제 `User` 객체를 조회하는 데 씁니다.

#### GET 전체 목록 — `NotificationController.java:31-39`
```java
// L31-L39
/** GET /api/notifications — 인증 사용자 본인 알림 전체, 최신순. */
@GetMapping
public ResponseEntity<?> getAll() {
    User user = currentUser();
    if (user == null) return unauthorized();
    List<NotificationResponse> list = streamChatService.getNotificationsForUser(user)
            .stream().map(NotificationResponse::from).toList();
    return ResponseEntity.ok(list);
}
```
- **흐름**: ① `currentUser()` 로 JWT 사용자 확보 → ② 없으면 401 → ③ `streamChatService.getNotificationsForUser(user)` 가 `repo.findByUserOrderByCreatedAtDesc(user)` 를 돌려 **본인 알림만** 조회 → ④ `.map(NotificationResponse::from)` 으로 엔티티를 DTO로 변환 → ⑤ 200 OK.
- **IDOR이 불가능한 이유**: 쿼리의 `user` 가 JWT에서 온 본인 객체이므로, **구조적으로 남의 알림이 끼어들 수 없습니다.** URL을 어떻게 조작해도 신원에 영향을 못 줍니다.
- `ResponseEntity<?>` 의 `?` — 정상이면 `List<NotificationResponse>`, 비정상이면 에러 `Map` 을 반환하므로 타입을 와일드카드로 둔 것.

#### GET 안 읽음 목록 — `NotificationController.java:41-49`
```java
// L41-L49
/** GET /api/notifications/unread — 본인 미읽음 알림만. */
@GetMapping("/unread")
public ResponseEntity<?> getUnread() {
    User user = currentUser();
    if (user == null) return unauthorized();
    List<NotificationResponse> list = streamChatService.getUnreadNotificationsForUser(user)
            .stream().map(NotificationResponse::from).toList();
    return ResponseEntity.ok(list);
}
```
- `getAll()` 과 판박이지만 `getUnreadNotificationsForUser` 를 호출 → `findByUserAndIsReadFalseOrderByCreatedAtDesc`. **안 읽은 것만** 돌려줍니다.

#### GET 안 읽음 개수(배지) — `NotificationController.java:51-58`
```java
// L51-L58
/** GET /api/notifications/count — 본인 미읽음 개수(배지용). */
@GetMapping("/count")
public ResponseEntity<?> getUnreadCount() {
    User user = currentUser();
    if (user == null) return unauthorized();
    long count = streamChatService.countUnreadNotifications(user);
    return ResponseEntity.ok(Map.of("unreadCount", count));
}
```
- 목록이 아니라 **숫자 하나**(`countByUserAndIsReadFalse`)만 반환 → 종 아이콘 배지에 표시.
- `Map.of("unreadCount", count)` → JSON `{"unreadCount": 3}`. 미래 확장(다른 카운트 추가)을 위해 단일 숫자가 아니라 객체로 감쌌습니다.

#### PATCH 한 건 읽음 — `NotificationController.java:60-67`
```java
// L60-L67
/** PATCH /api/notifications/{notificationId}/read — 본인 알림만 읽음 처리(서비스가 소유권 재확인). */
@PatchMapping("/{notificationId}/read")
public ResponseEntity<?> markOneRead(@PathVariable Long notificationId) {
    User user = currentUser();
    if (user == null) return unauthorized();
    streamChatService.markNotificationRead(notificationId, user);
    return ResponseEntity.noContent().build();
}
```
- `@PatchMapping("/{notificationId}/read")` — PATCH(부분 수정) 의미상 알맞은 메서드. `@PathVariable Long notificationId` 로 URL의 `{notificationId}` 를 받음.
- **이중 방어(매우 중요)**: 여기서 `notificationId` 는 URL에서 옵니다. 공격자가 **남의 알림 id**를 넣을 수 있습니다. 그래서 `streamChatService.markNotificationRead(notificationId, user)` 안에서 **소유권을 다시 확인**합니다(아래 코드).
  ```java
  // StreamChatService.markNotificationRead (참조: chat 도메인)
  notificationRepository.findById(notificationId).ifPresent(n -> {
      if (n.getUser().getId().equals(user.getId())) {  // ← 본인 알림인지 재확인
          n.setRead(true);
          notificationRepository.save(n);
      }
  });
  ```
  - 즉 **신원은 JWT에서(컨트롤러), 대상 소유권은 서비스에서** 한 번 더 검증하는 2단 방어입니다. id가 남의 것이면 조용히 무시(아무 변경 없음).
- `ResponseEntity.noContent().build()` → **204 No Content**(성공했지만 돌려줄 본문 없음). 읽음 처리 성공 신호로 적절.
- **초보 주의**: 남의 id를 넣어도 204가 나올 수 있습니다(소유권 불일치 시 조용히 무시). "204=내 알림이 읽힘"이 아니라 "요청을 정상 접수, 권한 있는 것만 반영"으로 이해해야 합니다. 존재 여부를 응답으로 구분하지 않는 것도 정보 노출을 줄이는 방어입니다.

#### PATCH 전체 읽음 — `NotificationController.java:69-76`
```java
// L69-L76
/** PATCH /api/notifications/read-all — 본인 알림 전체 읽음 처리. */
@PatchMapping("/read-all")
public ResponseEntity<?> markAllRead() {
    User user = currentUser();
    if (user == null) return unauthorized();
    streamChatService.markAllNotificationsRead(user);
    return ResponseEntity.noContent().build();
}
```
- `markAllNotificationsRead(user)` → 레포의 벌크 UPDATE(`markAllReadByUser`)로 **본인 알림 전부**를 한 번에 읽음 처리. user가 JWT 본인이라 남의 알림은 손대지 못합니다.

#### 신원 헬퍼 = M9의 심장 — `NotificationController.java:78-87`
```java
// L78-L87
/** JWT(AuthContext) 의 사용자 — 미인증/미존재면 null. 요청 파라미터 신원은 신뢰하지 않는다. */
private User currentUser() {
    Long uid = AuthContext.currentUserId();
    if (uid == null) return null;
    return userRepository.findById(uid).orElse(null);
}

private static ResponseEntity<?> unauthorized() {
    return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(Map.of("error", "인증 필요"));
}
```
- `AuthContext.currentUserId()` — 현재 요청의 JWT에서 user_id를 꺼냅니다. (`AuthContext` 는 `JwtAuthenticationFilter` 가 검증 후 요청 속성에 심어둔 user_id를 ThreadLocal/요청에서 읽는 경량 헬퍼.) **클라이언트가 보낸 어떤 파라미터도 여기 끼어들 수 없습니다** — 이것이 IDOR 방어의 본질.
- `uid == null` → 미인증(또는 토큰 없음) → `null` 반환 → 각 엔드포인트가 401.
- `findById(uid).orElse(null)` — 토큰의 user_id에 해당하는 실제 User가 DB에 없으면(삭제됨 등) `null` → 역시 401.
- `unauthorized()` → 401 + `{"error":"인증 필요"}`.
- **모든 엔드포인트가 동일한 첫 두 줄**(`currentUser()` → null이면 `unauthorized()`)로 시작한다는 점이 일관된 보안 게이트입니다.

---

### 5) `service/EmailAlertService.java` — 이메일 다이제스트 발송실

이 클래스는 위 인앱 알림과 **별개**로, 오늘의 매매 시그널을 이메일로 모아 보냅니다.

#### 클래스 선언과 의존성 — `EmailAlertService.java:19-32`
```java
// L19-L32
/**
 * 사용자별로 미발송 시그널들을 묶어서 한 통의 이메일로 보냄.
 * 비동기로 처리해서 스케줄러를 막지 않음.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class EmailAlertService {

    private final JavaMailSender mailSender;
    private final DailySignalRepository signalRepo;

    @Value("${spring.mail.username:}")
    private String fromAddress;
```
- `@Service` — 비즈니스 로직 컴포넌트.
- `@Slf4j`(Lombok) — `log` 변수를 자동 생성(로깅용).
- `JavaMailSender mailSender` — Spring이 주입하는 메일 발송기(SMTP 설정은 `application*.properties` 의 `spring.mail.*`).
- `DailySignalRepository signalRepo` — `DAILY_SIGNAL` 테이블 접근. **인앱 `Notification` 이 아니라 시그널 테이블을 읽는다**는 점에 주목.
- `@Value("${spring.mail.username:}")` — 설정값 `spring.mail.username` 을 `fromAddress` 에 주입. **콜론 뒤가 비어 있음(`:}`)** = 설정이 없으면 **빈 문자열**이 기본값. (없을 때 앱이 죽지 않고, 아래에서 "발신주소 없음 → skip"으로 안전 처리하려는 의도.)

#### 다이제스트 발송 — `EmailAlertService.java:34-67`
```java
// L34-L46
@Async
@Transactional
public void sendDigest(User user, List<DailySignal> signals) {
    if (user == null || signals == null || signals.isEmpty()) return;
    String to = user.getEmail();
    if (to == null || to.isBlank()) {
        log.warn("[Email] user {} has no email — skip", user.getId());
        return;
    }
    if (fromAddress == null || fromAddress.isBlank()) {
        log.warn("[Email] spring.mail.username not set — skip send for {}", to);
        return;
    }
```
- `@Async` — **별도 스레드에서** 실행(사전지식 4번). 호출한 스케줄러는 즉시 다음 사용자로 넘어갑니다.
- `@Transactional` — 이 메서드 안의 DB 작업(아래 `saveAll`)을 하나의 트랜잭션으로 묶음. (단, `@Async` 와 함께 쓰면 트랜잭션이 **새 스레드에서** 시작됨에 유의.)
- **가드(방어) 3종**:
  1. `user/signals` 가 비면 조용히 종료(보낼 게 없음).
  2. 받는 사람 이메일이 없으면 **경고 로그 + skip**(메일 보낼 곳이 없음).
  3. **발신 주소(`fromAddress`)가 비어 있으면 skip** — SMTP 미설정 환경(로컬 등)에서 **메일을 시도조차 안 해 에러를 피함**. CLAUDE.md "ANALYTICS 미설정 시 폴백"과 같은 "설정 없으면 우아하게 건너뛰기" 철학.

```java
// L48-L67
    String subject = "[Alpha-Helix] " + signals.get(0).getAsOfDate() + " 오늘의 매매 신호 ("
            + signals.size() + "건)";
    String body = buildBody(user, signals);

    try {
        SimpleMailMessage msg = new SimpleMailMessage();
        msg.setFrom(fromAddress);
        msg.setTo(to);
        msg.setSubject(subject);
        msg.setText(body);
        mailSender.send(msg);

        LocalDateTime now = LocalDateTime.now();
        signals.forEach(s -> s.setDeliveredAt(now));
        signalRepo.saveAll(signals);
        log.info("[Email] sent digest to {} ({} signals)", to, signals.size());
    } catch (Exception e) {
        log.error("[Email] send failed to {}: {}", to, e.getMessage());
    }
}
```
- **제목**: `[Alpha-Helix] 2026-06-01 오늘의 매매 신호 (3건)` 처럼 날짜·건수를 담음. `signals.get(0).getAsOfDate()` = 첫 시그널의 기준일(같은 배치라 모두 같은 날).
- **본문**: `buildBody(...)` 로 조립(아래).
- **발송**: `SimpleMailMessage` 에 발신/수신/제목/본문을 채워 `mailSender.send(msg)`. `setText(body)` 이므로 **평문**(HTML 아님).
- **발송 성공 후 핵심 — 중복 발송 방지**:
  - `signals.forEach(s -> s.setDeliveredAt(now))` + `signalRepo.saveAll(signals)` 로 각 시그널의 `deliveredAt` 에 **발송 시각을 도장 찍음**.
  - 다음 번에 `dispatchPending` 이 "아직 `deliveredAt` 이 null인 것"만 찾으므로, **이미 보낸 시그널은 다시 안 보냅니다**(멱등성). 이메일을 "두 번 보내는" 사고를 막는 장치.
- **에러 처리**: `try/catch` 로 메일 실패를 **삼키고 error 로그만** 남깁니다. **왜?** 한 사용자에게 메일이 실패해도(주소 오류·SMTP 일시장애 등) 다른 사용자 발송이나 스케줄러 전체가 멈추면 안 되기 때문. 단, **catch 되면 `deliveredAt` 도 안 찍히므로** 다음 배치에서 재시도됩니다(자연스러운 재시도 효과).

#### 본문 조립 — `EmailAlertService.java:69-87`
```java
// L69-L87
private String buildBody(User user, List<DailySignal> signals) {
    StringBuilder sb = new StringBuilder();
    sb.append("안녕하세요 ").append(user.getUsername()).append("님,\n\n");
    sb.append("오늘의 Alpha-Helix 매매 시그널입니다.\n");
    sb.append("─────────────────────────────────────\n\n");
    for (var s : signals) {
        sb.append("[").append(s.getSignal()).append("] ").append(s.getStrategy().getCode())
                .append(" — ").append(s.getStrategy().getTicker()).append("\n");
        sb.append("· 제목: ").append(safe(s.getTitle())).append("\n");
        sb.append("· 분석: ").append(safe(s.getSummary())).append("\n");
        sb.append("· 액션: ").append(safe(s.getAction())).append("\n\n");
    }
    sb.append("─────────────────────────────────────\n");
    sb.append("※ 본 메일은 자동 발송된 분석 정보이며 투자 권유가 아닙니다.\n");
    sb.append("Alpha-Helix · DevBridge\n");
    return sb.toString();
}

private String safe(String v) { return v == null ? "" : v; }
```
- `StringBuilder` 로 평문 메일을 조립. `\n` 줄바꿈으로 단락을 나눕니다(HTML 태그 없음).
- 각 시그널 한 블록: `[BUY] 전략코드 — 티커` 헤더 + 제목/분석/액션 3줄. (`s.getSignal()` 은 `BUY/HOLD/WATCH/PAUSE` enum, `s.getStrategy().getCode()/getTicker()` 는 전략 메타.)
- 끝에 **면책 문구**(`투자 권유가 아닙니다`) — 금융 정보 발송 시 법적 안전장치이자 좋은 관행.
- `safe(v)` — null이면 빈 문자열로. **왜?** 만약 `· 분석: null` 처럼 문자 그대로 "null"이 메일에 찍히면 보기 흉합니다. null 필드를 깔끔히 비웁니다.
- **초보 주의(잠재 NPE)**: `user.getUsername()`, `s.getStrategy().getCode()` 등은 null 방어가 없습니다. 만약 전략이 LAZY인데 트랜잭션 밖이라면 로딩 문제가 날 수 있으나, 이 메서드는 `@Transactional sendDigest` 안에서 호출되므로 보통 안전합니다.

#### 미발송 일괄 발송 진입점 — `EmailAlertService.java:89-97`
```java
// L89-L97
/** 미발송 시그널을 user별로 묶어서 일괄 발송. */
@Transactional
public int dispatchPending(java.time.LocalDate asOfDate) {
    var pending = signalRepo.findByAsOfDateAndDeliveredAtIsNull(asOfDate);
    if (pending.isEmpty()) return 0;
    var byUser = pending.stream().collect(Collectors.groupingBy(s -> s.getStrategy().getUser()));
    byUser.forEach(this::sendDigest);
    return pending.size();
}
```
- 이 메서드가 **이메일 흐름의 시작점**(스케줄러가 "오늘 날짜"로 호출).
- `findByAsOfDateAndDeliveredAtIsNull(asOfDate)` — 그 날짜의 시그널 중 **아직 안 보낸 것**(`deliveredAt IS NULL`)만 조회. 위에서 발송 성공 시 도장을 찍기 때문에 이 필터가 중복발송을 막습니다.
- `Collectors.groupingBy(s -> s.getStrategy().getUser())` — 시그널을 **사용자별로 묶음**. `{user42: [s1,s2], user43: [s3]}` 형태.
- `byUser.forEach(this::sendDigest)` — 사용자마다 `sendDigest(user, signals)` 호출. `sendDigest` 는 `@Async` 라 각각 별도 스레드에서 병렬 발송됩니다.
- `return pending.size()` — 처리 대상 시그널 수를 반환(스케줄러가 로깅/모니터링에 사용).
- **초보 헷갈림(@Async 트랜잭션 경계)**: `dispatchPending` 의 `@Transactional` 과 `sendDigest` 의 `@Async @Transactional` 은 **다른 트랜잭션/스레드**입니다. `dispatchPending` 이 끝나도 `sendDigest` 들은 백그라운드에서 계속 발송 중일 수 있습니다. 즉 반환된 숫자는 "발송 시도 대상 수"이지 "발송 성공 수"가 아닙니다.

---

## ⚠️ 함정·보안 주의

1. **M9 — IDOR 차단(핵심 보안)**
   - 과거: `?userId=` 파라미터를 신뢰 → 로그인만 하면 누구나 타인의 알림 조회/읽음처리 가능(IDOR).
   - 현재: 신원은 **오직 JWT(`AuthContext.currentUserId()`)** 에서만. 요청 파라미터의 신원은 절대 신뢰하지 않음. (`NotificationController.java:78-83`)
   - **이중 방어**: 읽음 처리는 대상 id가 URL에서 오므로, 서비스(`markNotificationRead`)에서 **`n.getUser().getId().equals(user.getId())`** 로 소유권을 한 번 더 확인. 남의 id면 조용히 무시(204지만 변경 없음).
   - 학습 포인트: "신원=서버가 신뢰하는 출처(JWT)에서, 대상 소유권=DB 비교로 재확인" 2단 패턴.

2. **M5 — 프론트엔드가 백엔드 알림과 미연동(현황)**
   - 백엔드 `/api/notifications` API는 완비되어 있으나, **프론트엔드는 아직 이 API를 호출하지 않습니다.**
   - 실제 코드 증거: `frontend/src/store/useNotificationStore.js` 의 `buildInitial()`(L4-L50)이 **하드코딩된 더미 알림 7건**("전략 정형화 완료", "Trust Score 상승" 등)을 만들고, Zustand `persist` 로 **localStorage(`alpha-notifications`)에 저장**합니다. `markRead/markAllRead/remove/clearAll` 모두 **로컬 상태만** 바꾸며 백엔드를 호출하지 않습니다(L52-L74).
   - 결과: 화면의 알림은 **브라우저 안에서만 사는 가짜 데이터**입니다. 서버 DB의 `Notification` 과 무관하고, 다른 기기/브라우저와 동기화되지 않으며, localStorage를 비우면 사라집니다.
   - 즉 **백엔드와 프론트가 끊겨 있는(wire 안 된) 상태**가 M5의 현황입니다. (고도화 아이디어에서 연결 방안 제시.)

3. **SMTP 미설정 시 동작 — "조용한 skip" vs "헬스 DOWN"**
   - `EmailAlertService` 는 `spring.mail.username`(발신주소)이 비면 **메일을 시도하지 않고 skip + 경고 로그**합니다(`EmailAlertService.java:43-46`). 즉 이메일 미설정만으로 발송 로직이 죽지는 않습니다(우아한 폴백).
   - **그러나** Spring Boot의 `MailHealthIndicator`(actuator)는 별개입니다. `spring.mail.host` 등 메일 설정이 잡혀 있는데 SMTP 서버에 **연결할 수 없으면** `/actuator/health` 가 **mail 컴포넌트를 DOWN** 으로 보고, 전체 상태가 `DOWN` 으로 떨어질 수 있습니다. (헬스체크가 "UP"이 아니게 되어 배포/모니터링에서 오탐을 일으킴.)
   - 정리: **발송 로직은 skip으로 견디지만, actuator 헬스는 SMTP 연결 실패에 민감**합니다. 로컬/CI에서 메일 설정을 어중간하게(host는 있고 접속은 안 되게) 두면 헬스가 DOWN 날 수 있으니, 안 쓸 거면 mail health를 제외(`management.health.mail.enabled=false`)하거나 설정을 완전히 비우는 게 안전합니다.

4. **중복 발송 — `deliveredAt` 멱등 장치 의존**
   - 중복 메일 방지는 오직 `deliveredAt` 도장 + `findBy...DeliveredAtIsNull` 필터에 달려 있습니다. 발송은 성공했는데 `saveAll` 직전 예외가 나면(드물지만) 도장이 안 찍혀 **다음 배치에서 재발송**될 수 있습니다. "정확히 한 번"이 아니라 "최소 한 번(at-least-once)" 보장에 가깝습니다.

5. **`@Async` + `@Transactional` 경계 혼동**
   - `dispatchPending` 이 반환해도 `sendDigest` 들은 백그라운드 진행 중일 수 있습니다. 반환값은 "성공 수"가 아닌 "대상 수". 또한 `@Async` 메서드는 **같은 클래스 내부 호출이면 프록시를 안 타 비동기가 안 걸립니다** — 여기서는 `dispatchPending` 이 `this::sendDigest` 를 호출하므로(자기 클래스 메서드 참조) **자기-호출(self-invocation)** 입니다. 같은 빈 내부 호출은 Spring AOP 프록시를 우회할 수 있어, **실제로 비동기로 분리되지 않을 가능성**이 있습니다(설정/프록시 방식에 따라). 동작을 비동기로 보장하려면 발송 루프를 별도 빈으로 분리하는 게 안전합니다. (학습 시 꼭 짚을 함정.)

6. **enum과 실제 사용의 괴리**
   - `NotificationType` 12개 중 다수는 협업/계약(DevBridge) 도메인 용어입니다. 알림 "생성" 코드는 이 도메인 밖에 있어, 어떤 타입이 실제로 쓰이는지는 이 5파일만으로 단정할 수 없습니다. 환각 방지를 위해 "범용 카탈로그"로만 이해하세요.

---

## 🚀 고도화 아이디어

1. **M5 연동 — 프론트를 진짜 API에 연결 (가장 시급)**
   - `useNotificationStore.js` 의 `buildInitial()` 더미 제거 → 앱 진입/주기적 폴링으로 `GET /api/notifications`, 배지엔 `GET /api/notifications/count` 호출.
   - `markRead(id)` → `PATCH /api/notifications/{id}/read`, `markAllRead()` → `PATCH /api/notifications/read-all` 로 교체(낙관적 업데이트 + 실패 롤백).
   - 주의: 백엔드 DTO 필드명(`notificationType/message/createdAt/isRead`)과 프론트 더미 필드명(`type/body/time/read`)이 **다릅니다.** 매핑 어댑터를 두거나 한쪽 스키마로 통일해야 합니다.

2. **실시간 푸시(폴링 → 이벤트)**
   - 지금은 조회형(pull). SSE(Server-Sent Events)나 WebSocket으로 새 알림을 **실시간 푸시**하면 배지가 즉시 갱신됩니다. chat 도메인이 이미 Stream을 쓰므로 그 채널 재사용 가능.

3. **알림 생성 표준화(이벤트 기반)**
   - 현재 알림 생성 로직이 chat 서비스에 얹혀 있음. Spring `ApplicationEvent`(예: `SignalCreatedEvent`, `OrderFilledEvent`)를 발행하고, `@EventListener` 가 `Notification` 을 만들도록 분리하면 도메인 결합도가 낮아집니다. → "시그널 생성 시 인앱 알림 + 이메일" 두 채널을 한 이벤트로 fan-out.

4. **이메일 고도화**
   - `SimpleMailMessage`(평문) → `MimeMessage` + Thymeleaf HTML 템플릿으로 가독성·브랜딩 향상.
   - 발송 실패 시 재시도 큐/백오프, 발송 이력 테이블(감사 로그), 사용자별 수신 거부(opt-out) 설정.

5. **`@Async` 자기-호출 함정 해소**
   - 발송 루프를 별도 빈(`EmailDispatcher`)으로 빼서 비동기가 확실히 걸리게. 동시에 스레드풀(`TaskExecutor`) 크기를 설정해 대량 사용자 발송을 제어.

6. **읽음 동기화 정합성**
   - 벌크 `@Modifying` 업데이트 후 응답에 갱신된 unreadCount를 함께 반환해 프론트가 한 번 더 조회하지 않게(왕복 절감).

---

## 📚 용어 사전 (이 도메인 한정)

| 용어 | 뜻 |
|---|---|
| **인앱 알림(in-app notification)** | DB `NOTIFICATION` 에 쌓이고 화면 우편함에 표시되는 알림. 읽음/안읽음 상태를 가짐 |
| **다이제스트(digest) 이메일** | 여러 시그널을 한 통으로 묶어 보내는 요약 메일 |
| **IDOR** | Insecure Direct Object Reference. 요청 파라미터의 객체 id/신원을 검증 없이 믿어 타인 자원에 접근하게 되는 취약점 |
| **AuthContext** | JWT에서 현재 사용자 id를 꺼내는 경량 헬퍼(`global/security`). Spring Security 미사용 구현 |
| **JWT** | 로그인 시 발급되는 위조 불가능한 서명 토큰. 신원의 신뢰 출처 |
| **`@Async`** | 메서드를 별도 스레드에서 실행(비동기). 호출자가 결과를 기다리지 않음 |
| **`@Transactional`** | 메서드 내 DB 작업을 하나의 트랜잭션으로 묶음(전부 성공 or 전부 롤백) |
| **`JavaMailSender` / `SimpleMailMessage`** | Spring의 메일 발송기 / 평문 메일 메시지(받는이·제목·본문) |
| **SMTP** | 메일을 보내는 표준 프로토콜. Gmail은 앱 비밀번호로 인증 |
| **쿼리 메서드** | Spring Data JPA가 메서드 이름(`findByUser...`)을 해석해 SQL을 자동 생성 |
| **`@Modifying` 벌크 쿼리** | UPDATE/DELETE JPQL. 한 문장으로 다수 행을 변경(영속성 컨텍스트 우회) |
| **DTO(Data Transfer Object)** | 엔티티의 민감/내부 필드를 가리고 외부 응답용으로 추린 객체(`NotificationResponse`) |
| **정적 팩토리 `from()`** | 엔티티를 받아 DTO를 만들어 주는 static 변환 메서드 |
| **`deliveredAt`** | `DailySignal` 의 이메일 발송 시각. null이면 미발송 → 중복발송 방지 키 |
| **멱등성(idempotency)** | 같은 작업을 여러 번 해도 결과가 한 번과 같음. 여기선 "이미 보낸 메일 재발송 안 함" |
| **`@CreatedDate` / Auditing** | 행 생성 시각 자동 기록(`AuditingEntityListener`) |
| **LAZY 로딩** | 연관 객체(User 등)를 실제 필요할 때만 DB에서 가져오기 |
| **M5 / M9** | 이 프로젝트의 보안/품질 수정 항목 번호. M9=IDOR 차단(완료), M5=프론트-백엔드 알림 미연동(현황) |
