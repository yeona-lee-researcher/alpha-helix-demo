# `08_backend` 입문 — Spring Boot / JPA 기초 primer (백엔드 교재 읽기 전 필독)

> 원본 코드: `backend/src/main/java/com/DevBridge/devbridge/...` (이 문서는 **추측 없이** 실제 프로젝트 코드만 인용합니다)
> 이 문서는 **교재 표준 형식**(엔진 교재의 `01_backtest/vbt_engine.md`)을 따릅니다.
> 용도: ① 백엔드 도메인 교재를 읽기 전 Spring/JPA 기초 다지기 → ② 한 줄씩 학습 → ③ 강의 자료.
> 작성 원칙: "아주 잘 가르치는 교수"처럼 — 비유·예시·"초보가 헷갈리는 포인트"를 곁들인다.

---

## 📌 이 파일 한눈에

이 primer는 **"Java/Spring 백엔드라는 건물의 설계도"** 입니다. 엔진 교재(Python/FastAPI)를 다 읽고 나서 백엔드(`08_backend/*`)로 넘어오면, 갑자기 `@RestController`, `@Entity`, `@Transactional` 같은 **낯선 애너테이션(@로 시작하는 표식)** 이 쏟아집니다. 이 문서는 그 표식들이 무슨 뜻인지, 그리고 **HTTP 요청 하나가 어떻게 자바 메서드까지 흘러가 DB를 건드리고 다시 JSON으로 돌아오는지**를 한 흐름으로 설명합니다.

핵심만 먼저:

| 개념 | 한 줄 요약 | 비유 |
|---|---|---|
| **Spring Boot** | 서버 앱을 "자동 조립"해주는 프레임워크 (톰캣 내장) | 가구가 미리 조립돼 오는 이케아 풀세트 |
| **3계층** | Controller(접수) → Service(처리) → Repository(DB) | 은행 창구 → 직원 → 금고 |
| **DI(의존성 주입)** | 필요한 부품을 스프링이 알아서 꽂아줌 | 콘센트에 플러그 꽂기(전기는 한전이 줌) |
| **JPA/Hibernate** | 자바 객체 ↔ DB 테이블 자동 변환 | 한국어↔영어 자동 통역기 |
| **이 프로젝트 특수성** | **Spring Security 끔** → 인가는 컨트롤러에서 `AuthContext` null 체크로 수동 | 자동문 대신, 직원이 직접 신분증 확인 |

> 비유: 엔진(Analytics)이 **"숫자를 계산하는 연구소"** 였다면, 백엔드(Spring)는 **"은행 창구"** 입니다. 누가(인증) 무엇을(요청) 요구했는지 확인하고, 금고(DB)에서 돈/데이터를 꺼내거나 넣고, 영수증(JSON)을 돌려줍니다.

---

## 🧠 사전 지식 (이거 모르면 막힘)

#### 1) "애너테이션(Annotation)" = 코드에 붙이는 **스티커 라벨**
```java
@RestController   // ← 이게 애너테이션
public class NotificationController { ... }
```
- `@`로 시작하는 한 줄짜리 표식. **실행되는 코드가 아니라, 스프링에게 주는 지시문**입니다.
- `@RestController`는 "이 클래스는 HTTP 요청을 받는 접수처야"라고 스프링에게 알려주는 라벨.
- 비유: 택배 상자에 붙은 "취급주의", "냉장보관" 스티커. 상자 내용물(코드)은 그대로지만, **처리하는 쪽(스프링)이 라벨을 보고 다르게 다룹니다.**

#### 2) "빈(Bean)" = 스프링이 **만들어서 보관 중인 부품 객체 하나**
- 스프링은 앱이 켜질 때 `@Component`, `@Service`, `@RestController`, `@Repository` 라벨이 붙은 클래스들을 **하나씩 만들어 창고(ApplicationContext)에 넣어둡니다.** 이 창고 속 객체 하나하나가 "빈"입니다.
- 비유: 공장이 가동되면 필요한 기계(부품)를 미리 다 조립해 공장 한쪽에 세워둠. 필요할 때 가져다 씀(새로 안 만듦).

#### 3) "HTTP 요청/응답" = **편지 한 통**
```
요청:  GET /api/notifications        ← "내 알림 목록 줘"
응답:  200 OK  [ {...}, {...} ]       ← "여기 있어 (상태코드 + JSON 본문)"
```
- **메서드**(GET=조회 / POST=생성 / PATCH=일부수정 / DELETE=삭제) + **경로**(`/api/notifications`) + 가끔 **본문(body, JSON)**.
- 응답에는 **상태코드**(200 성공, 401 인증필요, 404 없음, 500 서버오류)와 **본문**이 들어갑니다.

#### 4) "JSON" = 프론트(React)와 백엔드가 주고받는 **공통 문서 포맷**
```json
{ "id": 7, "title": "체결 완료", "isRead": false }
```
- 자바 객체 → JSON 변환은 스프링(Jackson 라이브러리)이 자동으로 합니다. 우리는 **자바 객체만 반환**하면 됩니다.

---

## 🗺 전체 흐름도 — 요청 하나의 일생

이 프로젝트의 **알림(notification) 도메인**을 예로, `GET /api/notifications` 요청 하나가 흐르는 경로:

```
[React 프론트]  GET /api/notifications  (+ HttpOnly JWT 쿠키)
       │
       ▼
[JwtAuthenticationFilter]  쿠키에서 JWT 꺼내 → request에 userId 도장 찍음  ★필터 단계
       │
       ▼
[NotificationController]  @GetMapping  ← "접수처"
       │   AuthContext.currentUserId() 로 신원 확인 (null이면 401)   ★수동 인가
       ▼
[StreamChatService]  @Transactional  ← "처리 직원" (비즈니스 규칙)
       │
       ▼
[NotificationRepository]  findByUser...()  ← "금고지기" (SQL 자동 생성)
       │
       ▼
[MySQL  NOTIFICATION 테이블]  ← 실제 데이터
       │  (조회된 Notification 엔티티들이 거꾸로 올라옴)
       ▼
[Controller]  엔티티 → NotificationResponse(DTO) 변환 → ResponseEntity.ok(...)
       │
       ▼
[스프링/Jackson]  DTO → JSON 자동 변환 → 200 OK 응답
```

이 한 장이 백엔드의 전부입니다. 아래에서 각 단계를 실제 코드로 풉니다.

---

## 📖 개념별 해설 (실제 코드 인용 + 비유)

### A. Spring Boot 가 뭔가 — "자동 조립 + 내장 톰캣"

`backend/build.gradle` 의 맨 위:

```groovy
// build.gradle:1-5
plugins {
	id 'java'
	id 'org.springframework.boot' version '4.0.4'
	id 'io.spring.dependency-management' version '1.1.7'
}
```

- **Spring Boot** 는 "스프링으로 서버를 만들 때 필요한 수백 가지 설정을 미리 해둔 풀세트"입니다. 핵심 마법 두 가지:
  1. **자동설정(Auto-configuration)** — DB 드라이버를 의존성에 넣기만 하면, 스프링이 "아 MySQL 쓰는구나" 하고 연결을 알아서 구성. 우리가 XML로 일일이 설정하지 않습니다.
  2. **내장 톰캣(Embedded Tomcat)** — 옛날엔 톰캣(웹서버)을 따로 설치하고 그 위에 앱을 얹었지만, Spring Boot 는 **웹서버를 앱 안에 품고** 있어 `gradlew bootRun` 한 줄이면 서버가 켜집니다.

`build.gradle` 의 의존성(`dependencies`) 블록이 "어떤 부품을 쓸지"의 목록입니다:

```groovy
// build.gradle:27-34 (발췌)
implementation 'org.springframework.boot:spring-boot-starter-data-jpa'   // JPA(DB)
implementation 'org.springframework.boot:spring-boot-starter-webmvc'      // 웹(HTTP)
implementation 'io.jsonwebtoken:jjwt-api:0.12.6'                          // JWT
implementation 'org.flywaydb:flyway-core'                                 // DB 마이그레이션
```

- `...starter-*` 는 **"세트 메뉴"** 입니다. `starter-webmvc` 하나면 HTTP 처리에 필요한 수십 개 라이브러리가 한 번에 딸려옵니다.

> 💡 초보 포인트: CLAUDE.md엔 "Java 21"이라 적혀 있지만 **실제 `build.gradle`의 toolchain은 17**(`JavaLanguageVersion.of(17)`)입니다. 문서와 코드가 다를 땐 **코드가 진실**입니다 — 항상 실제 빌드 파일을 확인하세요.

---

### B. 3계층 아키텍처 — Controller → Service → Repository

이 프로젝트는 **도메인 드리븐** 구조로, 각 도메인(`notification`, `user`, `strategy`...)이 자기만의 5개 폴더를 가집니다:

```
domain/notification/
├── controller/   ← 접수처 (HTTP 요청 받기)
├── service/      ← 처리실 (비즈니스 규칙)  ※알림은 chat 도메인의 StreamChatService가 겸함
├── entity/       ← DB 테이블의 자바 거울
├── repository/   ← 금고지기 (DB 읽고 쓰기)
└── dto/          ← 바깥세상과 주고받는 포장지
```

**왜 3개로 쪼개나?** 비유: 은행에서 "창구 직원이 직접 금고에 들어가 돈을 세고 영수증까지 인쇄"하면 혼란스럽고 위험합니다. 그래서 **창구(Controller)는 접수만, 직원(Service)은 규칙 판단만, 금고지기(Repository)는 보관만** — 역할을 나눠 각자 한 가지만 잘하게 합니다. 한 곳이 고장 나도 다른 곳에 영향이 적고, 테스트·교체가 쉬워집니다.

#### 1) Controller — "접수처"

```java
// NotificationController.java:23-39
@RestController
@RequestMapping("/api/notifications")
@RequiredArgsConstructor
public class NotificationController {

    private final StreamChatService streamChatService;
    private final UserRepository userRepository;

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

- `@RestController` — "이 클래스는 HTTP 접수처, 반환값은 JSON으로"
- `@RequestMapping("/api/notifications")` — 이 클래스의 모든 메서드 경로 앞에 공통으로 붙는 **주소 접두사**.
- 컨트롤러는 **직접 일하지 않습니다.** `streamChatService.getNotificationsForUser(user)`로 처리를 **Service에게 위임**하고, 결과를 DTO로 포장해 돌려줄 뿐입니다. (창구 직원이 금고에 직접 안 들어가는 것.)

#### 2) Service — "처리실 (비즈니스 규칙)"

```java
// StreamChatService.java:226-251 (발췌)
public List<Notification> getNotificationsForUser(User user) {
    return notificationRepository.findByUserOrderByCreatedAtDesc(user);
}

@Transactional
public void markNotificationRead(Long notificationId, User user) {
    notificationRepository.findById(notificationId).ifPresent(n -> {
        if (n.getUser().getId().equals(user.getId())) {   // ★소유권 재확인
            n.setRead(true);
            notificationRepository.save(n);
        }
    });
}
```

- Service는 **"규칙"** 이 사는 곳입니다. 위 `markNotificationRead`는 단순히 "읽음 처리"가 아니라, **"이 알림이 정말 이 사용자 것인지 한 번 더 확인"**(`n.getUser().getId().equals(user.getId())`)하는 보안 규칙을 품고 있습니다. 남의 알림이면 조용히 무시합니다.
- Repository(금고지기)를 호출해 실제 데이터를 가져오거나 저장합니다.

#### 3) Repository — "금고지기 (DB)"

```java
// NotificationRepository.java:12-22
public interface NotificationRepository extends JpaRepository<Notification, Long> {

    List<Notification> findByUserOrderByCreatedAtDesc(User user);

    List<Notification> findByUserAndIsReadFalseOrderByCreatedAtDesc(User user);

    long countByUserAndIsReadFalse(User user);

    @Modifying
    @Query("UPDATE Notification n SET n.isRead = true WHERE n.user = :user AND n.isRead = false")
    void markAllReadByUser(@Param("user") User user);
}
```

- 놀라운 점: **이건 `interface`(껍데기)일 뿐, 구현 코드(SQL)가 없습니다.** 그런데도 동작합니다. (→ 아래 D절 "메서드 이름 쿼리"에서 설명.)
- `extends JpaRepository<Notification, Long>` — "Notification 엔티티를, ID 타입은 Long으로 다루는 금고지기" 라는 뜻. 이것만으로 `save()`, `findById()`, `findAll()`, `delete()` 같은 **기본 CRUD가 공짜로** 생깁니다.

> 💡 초보 포인트: **데이터는 위→아래로 요청이 내려가고, 결과는 아래→위로 올라옵니다.** Controller는 Service만 알고, Service는 Repository만 알고, Repository만 DB를 압니다. 이 "한 방향 의존"이 깨지면(예: Repository가 Controller를 부르면) 구조가 무너집니다.

---

### C. 의존성 주입(DI) · `@RequiredArgsConstructor` · 빈(Bean)

위 컨트롤러에서 `streamChatService`, `userRepository`는 **어디서 만들어졌을까요?** 우리는 `new StreamChatService()`를 어디에도 쓰지 않았습니다.

```java
// NotificationController.java:25-29
@RequiredArgsConstructor
public class NotificationController {

    private final StreamChatService streamChatService;
    private final UserRepository userRepository;
```

- **DI(Dependency Injection, 의존성 주입)** = "내가 필요한 부품을 내가 `new`로 만들지 않고, **스프링이 만들어서 꽂아준다**".
- `@RequiredArgsConstructor`(Lombok) — `final` 필드들을 받는 **생성자를 자동으로 만들어줍니다.** 즉 내부적으로는:
  ```java
  public NotificationController(StreamChatService s, UserRepository u) {
      this.streamChatService = s; this.userRepository = u;
  }
  ```
  이 생성자를 스프링이 보고, **창고(ApplicationContext)에서 해당 타입의 빈을 찾아 인자로 넣어줍니다.**

- 비유: 새 가전제품(컨트롤러)을 사면 **전기를 직접 발전하지 않습니다.** 콘센트(생성자)에 플러그를 꽂으면 한전(스프링)이 전기(빈)를 공급. 우리는 "전기가 필요하다"고 선언만 하면 됩니다.

**왜 좋은가?** 테스트할 때 진짜 Service 대신 **가짜(Mock) Service를 꽂아** 컨트롤러만 따로 시험할 수 있습니다. 부품을 갈아끼우기 쉬워집니다.

> 💡 초보 포인트: `final` + `@RequiredArgsConstructor` 조합이 이 프로젝트의 표준 DI 패턴입니다. 필드에 `@Autowired`를 직접 붙이는 옛날 방식보다 권장됩니다(불변·테스트 용이).

---

### D. HTTP 요청이 자바 메서드로 매핑되는 법 (매핑 애너테이션 총정리)

스프링은 **"어떤 URL + 메서드"가 들어오면 "어떤 자바 함수"를 부를지** 애너테이션으로 연결합니다. 알림 컨트롤러에 다 들어 있습니다:

```java
// NotificationController.java (발췌)
@GetMapping                                   // GET  /api/notifications
public ResponseEntity<?> getAll() { ... }

@GetMapping("/unread")                         // GET  /api/notifications/unread
public ResponseEntity<?> getUnread() { ... }

@PatchMapping("/{notificationId}/read")        // PATCH /api/notifications/3/read
public ResponseEntity<?> markOneRead(@PathVariable Long notificationId) { ... }

@PatchMapping("/read-all")                     // PATCH /api/notifications/read-all
public ResponseEntity<?> markAllRead() { ... }
```

| 애너테이션 | HTTP 메서드 | 용도 | 비유 |
|---|---|---|---|
| `@GetMapping` | GET | 조회 (데이터 안 바꿈) | "잔액 조회해줘" |
| `@PostMapping` | POST | 생성 (새로 만듦) | "새 계좌 만들어줘" |
| `@PatchMapping` | PATCH | 일부 수정 | "주소만 바꿔줘" |
| `@DeleteMapping` | DELETE | 삭제 | "계좌 닫아줘" |
| `@RequestMapping("/api/...")` | (클래스 레벨) | 공통 경로 접두사 | "이 창구는 3번 창구" |

**요청에서 값을 꺼내는 3가지 입구:**

1. **`@PathVariable`** — URL 경로 안의 변수.
   ```java
   // NotificationController.java:61-62
   @PatchMapping("/{notificationId}/read")
   public ResponseEntity<?> markOneRead(@PathVariable Long notificationId) {
   ```
   - `/api/notifications/**3**/read` 로 요청하면 `notificationId = 3` 이 됩니다. 경로의 `{notificationId}` 칸과 메서드 인자 이름이 짝지어집니다.

2. **`@RequestParam`** — `?key=value` 쿼리 파라미터. (예: `?page=2`) — 이 컨트롤러에선 **의도적으로 안 씁니다.** 아래 ⚠️ 특이점 절에서 "왜 `?userId=`를 안 받는지" 설명합니다.

3. **`@RequestBody`** — POST/PATCH의 **본문(JSON)** 을 자바 객체로 변환.
   ```java
   // (다른 도메인 예시 패턴) 로그인 요청 본문을 객체로 받기
   @PostMapping("/login")
   public ResponseEntity<?> login(@RequestBody LoginRequest req) { ... }
   ```
   - 프론트가 보낸 `{"email":"...","password":"..."}` JSON을 스프링이 `LoginRequest` 객체로 자동 변환해 꽂아줍니다.

> 💡 초보 포인트: GET은 본문(`@RequestBody`)을 거의 안 쓰고 경로/쿼리로 값을 받습니다. "데이터를 바꾸는(POST/PATCH/PUT)" 요청만 본문 JSON을 보냅니다.

---

### E. `ResponseEntity` 와 상태코드

컨트롤러는 보통 그냥 객체를 반환해도 되지만, **상태코드까지 직접 정하고 싶을 때** `ResponseEntity`를 씁니다.

```java
// NotificationController.java:33-38, 53-57, 65-66, 85-87
return ResponseEntity.ok(list);                                  // 200 OK + 본문
return ResponseEntity.ok(Map.of("unreadCount", count));          // 200 OK + JSON {unreadCount: 5}
return ResponseEntity.noContent().build();                       // 204 No Content (성공, 본문 없음)
return ResponseEntity.status(HttpStatus.UNAUTHORIZED)            // 401 + {error:"인증 필요"}
                     .body(Map.of("error", "인증 필요"));
```

| 코드 | 의미 | 이 프로젝트에서 |
|---|---|---|
| **200 OK** | 성공 + 데이터 있음 | 알림 목록 반환 |
| **204 No Content** | 성공 + 돌려줄 본문 없음 | "읽음 처리" 후 |
| **401 Unauthorized** | 인증 필요(로그인 안 됨) | `currentUser() == null` 일 때 |
| **404 Not Found** | 자원 없음 | 존재하지 않는 ID |
| **500 Internal Server Error** | 서버 터짐 | 잡히지 않은 예외 |

- `Map.of("unreadCount", count)` 같은 **임시 자바 Map** 도 Jackson이 JSON으로 변환해줍니다(`{"unreadCount": 5}`). 별도 DTO 클래스를 만들 만큼 무겁지 않은 응답에 쓰는 흔한 손쉬운 패턴.

> 💡 초보 포인트: `ResponseEntity<?>`의 `<?>`는 "본문 타입이 경우마다 다르다(리스트일 수도, Map일 수도)"라서 와일드카드로 둔 것. 한 메서드가 성공 시 리스트, 실패 시 에러맵을 반환하니 자연스럽습니다.

---

### F. JPA / Hibernate — 자바 객체 ↔ DB 테이블

**JPA**(Java Persistence API)는 "자바 객체와 DB 테이블을 자동으로 이어주는 규격"이고, **Hibernate**는 그 규격을 실제로 구현한 엔진입니다. 핵심 마법: **SQL을 거의 안 쓰고도 DB를 다룹니다.**

#### 1) `@Entity` — "DB 테이블의 자바 거울"

```java
// Notification.java:15-31 (발췌)
@Entity
@Table(name = "NOTIFICATION")
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
@EntityListeners(AuditingEntityListener.class)
public class Notification {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user_id", nullable = false)
    private User user;
```

- `@Entity` — "이 클래스는 DB 테이블 하나에 대응한다". 이 클래스의 **객체 한 개 = 테이블의 행(row) 한 개**.
- `@Table(name = "NOTIFICATION")` — 대응하는 테이블 이름.
- `@Id` — 이 필드가 **기본키(PK)**, 행을 구분하는 고유 번호.
- `@GeneratedValue(strategy = IDENTITY)` — ID를 **DB가 자동 증가(auto-increment)** 로 매겨줌. 우리가 직접 안 넣음.
- `@ManyToOne` — **관계 매핑.** "여러(Many) 알림이 한(One) 유저에 속한다". 자바에선 `notification.getUser()`로 객체를 바로 꺼낼 수 있고, DB에선 `user_id` 외래키(FK) 컬럼으로 저장됩니다.
- `@JoinColumn(name = "user_id")` — 그 FK 컬럼 이름.
- `fetch = FetchType.LAZY` — **지연 로딩.** 알림을 읽을 때 연결된 User까지 **즉시 다 불러오지 않고**, `getUser()`를 실제로 호출하는 순간에만 DB에서 가져옴. (불필요한 조회를 줄여 성능↑.)

각 컬럼은 `@Column`으로 세부 설정합니다:

```java
// Notification.java:37-55 (발췌)
@Column(nullable = false, length = 200)
private String title;                       // NOT NULL, VARCHAR(200)

@Column(nullable = false, columnDefinition = "TEXT")
private String message;                     // TEXT 타입

@Enumerated(EnumType.STRING)
@Column(name = "notification_type", nullable = false, length = 50)
private NotificationType notificationType;  // enum을 "문자열"로 저장 (숫자 X)

@Column(name = "is_read", nullable = false)
@Builder.Default
private boolean isRead = false;             // 기본값 false

@CreatedDate
@Column(name = "created_at", nullable = false, updatable = false)
private LocalDateTime createdAt;            // 생성 시각 자동 기록 (수정 불가)
```

- `@Enumerated(EnumType.STRING)` — `NEW_MESSAGE` 같은 enum을 DB에 **문자열 그대로** 저장. (`EnumType.ORDINAL`로 숫자 0,1,2 저장하면 enum 순서 바뀔 때 데이터가 깨지므로 **STRING이 안전**.)
- `@CreatedDate` + `@EntityListeners(AuditingEntityListener.class)` — 행이 처음 저장될 때 **현재 시각을 자동 기입**. `updatable = false`라 이후 수정 불가(생성 시각은 영원히 고정).

#### 2) Repository 인터페이스가 SQL 없이 동작하는 법 — **메서드 이름 쿼리**

다시 Repository를 봅시다:

```java
// NotificationRepository.java:14-18
List<Notification> findByUserOrderByCreatedAtDesc(User user);
List<Notification> findByUserAndIsReadFalseOrderByCreatedAtDesc(User user);
long countByUserAndIsReadFalse(User user);
```

- **충격 포인트: 구현이 없는데 동작합니다.** 스프링 데이터 JPA가 **메서드 이름을 분석해 SQL을 자동 생성**하기 때문입니다.
- 이름을 단어로 끊어 읽으면 그게 곧 쿼리입니다:
  - `findBy` `User` `OrderBy` `CreatedAt` `Desc`
    → `SELECT * FROM notification WHERE user_id = ? ORDER BY created_at DESC`
  - `count` `By` `User` `And` `IsReadFalse`
    → `SELECT COUNT(*) FROM notification WHERE user_id = ? AND is_read = false`
- 비유: 메뉴판에 "**매운**·**곱빼기**·**계란추가** 라면"이라고 적으면 주방장이 알아서 그렇게 만들어 줌. 우리는 **이름만 정확히 짓고** 레시피(SQL)는 안 씁니다.

이름으로 표현하기 복잡한 쿼리는 `@Query`로 **직접 JPQL**을 씁니다:

```java
// NotificationRepository.java:20-22
@Modifying
@Query("UPDATE Notification n SET n.isRead = true WHERE n.user = :user AND n.isRead = false")
void markAllReadByUser(@Param("user") User user);
```

- `@Query` — 직접 작성한 쿼리. 단, **테이블이 아니라 `Notification`이라는 엔티티(자바 클래스)를 대상으로** 하는 JPQL입니다(SQL과 비슷하지만 객체 기준).
- `@Modifying` — "이건 조회가 아니라 데이터를 **바꾸는** 쿼리"라고 알림(UPDATE/DELETE에 필수).
- `:user` / `@Param("user")` — 쿼리 속 자리표시자에 메서드 인자를 끼워넣음(SQL 인젝션 안전).

> 💡 초보 포인트: 오타가 무섭습니다. `findByUesr`(오타)라고 쓰면 스프링이 `Uesr`라는 필드를 못 찾아 **앱 기동 시 에러**로 알려줍니다(다행히 런타임 중이 아니라 시작할 때 터짐).

---

### G. `@Transactional` — 트랜잭션 (모 아니면 도)

```java
// StreamChatService.java:243-251
@Transactional
public void markNotificationRead(Long notificationId, User user) {
    notificationRepository.findById(notificationId).ifPresent(n -> {
        if (n.getUser().getId().equals(user.getId())) {
            n.setRead(true);
            notificationRepository.save(n);
        }
    });
}
```

- **트랜잭션(Transaction)** = "여러 DB 작업을 **하나로 묶어, 전부 성공하거나 전부 취소**되게 하는 단위".
- `@Transactional`이 붙은 메서드는 **시작할 때 작업을 열고, 정상 종료 시 커밋(확정), 도중에 예외가 터지면 롤백(전부 되돌림)** 합니다.
- 비유: **계좌이체.** "A에서 출금"과 "B에 입금" 둘 다 성공해야 하고, 중간에 멈추면 둘 다 없던 일로 해야 함. 출금만 되고 입금이 안 되면 돈이 증발하니까요.
- **숨은 편의 하나:** `@Transactional` 안에서 엔티티의 `setRead(true)`처럼 값을 바꾸면, 트랜잭션이 끝날 때 Hibernate가 **변경을 감지(dirty checking)해 자동으로 UPDATE**를 날립니다. (위 코드의 `save(n)`은 명시적이지만, 트랜잭션 안에서는 생략해도 반영되는 경우가 많습니다.)

> 💡 초보 포인트: 보통 **Controller가 아니라 Service에** `@Transactional`을 붙입니다. "한 번의 비즈니스 행동(=하나의 Service 메서드)" 단위로 트랜잭션을 잡는 게 자연스럽기 때문.

---

### H. DTO ↔ 엔티티 분리, Lombok

#### 1) 왜 엔티티를 그대로 프론트에 안 주고 DTO로 바꾸나?

```java
// NotificationResponse.java (DTO 전체)
@Getter @Builder @NoArgsConstructor @AllArgsConstructor
public class NotificationResponse {
    private Long id;
    private String notificationType;   // enum → String 으로 변환됨
    private String title;
    private String message;
    private String relatedEntityType;
    private Long relatedEntityId;
    private boolean isRead;
    private LocalDateTime createdAt;

    public static NotificationResponse from(Notification n) {       // 엔티티 → DTO 변환기
        return NotificationResponse.builder()
                .id(n.getId())
                .notificationType(n.getNotificationType().name())   // enum.name() = 문자열
                .title(n.getTitle())
                .message(n.getMessage())
                .relatedEntityType(n.getRelatedEntityType())
                .relatedEntityId(n.getRelatedEntityId())
                .isRead(n.isRead())
                .createdAt(n.getCreatedAt())
                .build();
    }
}
```

- **DTO(Data Transfer Object)** = "바깥세상(프론트)과 주고받는 **포장지**". 엔티티(DB 거울)와 **일부러 분리**합니다.
- **왜 분리하나?**
  1. **보안** — 엔티티 `Notification`은 `@ManyToOne private User user`(비밀번호 등 민감 정보 포함 가능)를 들고 있습니다. 그대로 JSON으로 내보내면 **유저 내부 정보가 줄줄 새거나** 무한 순환참조로 터집니다. DTO는 **내보낼 필드만 골라** 담습니다(위에 `user`가 없죠).
  2. **안정성** — DB 구조(엔티티)가 바뀌어도 API 응답(DTO) 모양은 그대로 유지 가능. 프론트가 안 깨집니다.
- 컨트롤러에서의 변환은 한 줄:
  ```java
  // NotificationController.java:36-37
  streamChatService.getNotificationsForUser(user)
          .stream().map(NotificationResponse::from).toList();
  ```
  엔티티 리스트를 `map(...from)`으로 **DTO 리스트로 갈아끼웁니다.**

#### 2) Lombok — 반복 코드 자동 생성기

엔티티/DTO 위에 붙은 `@Getter`, `@Builder` 등이 **Lombok** 애너테이션입니다. `build.gradle:60,62`에서 의존성으로 들어옵니다.

| Lombok 라벨 | 자동으로 만들어주는 것 |
|---|---|
| `@Getter` / `@Setter` | `getTitle()`, `setRead(...)` 같은 접근자 메서드 |
| `@Builder` | `NotificationResponse.builder().id(1).title("x").build()` 빌더 패턴 |
| `@NoArgsConstructor` | 인자 없는 기본 생성자 (JPA가 요구) |
| `@AllArgsConstructor` | 모든 필드를 받는 생성자 |
| `@RequiredArgsConstructor` | `final` 필드만 받는 생성자 (← DI에 사용) |
| `@Builder.Default` | 빌더 사용 시에도 필드 기본값(`isRead=false`) 유지 |

- 이 라벨들이 없으면 getter/setter/생성자를 **수십 줄 손으로** 써야 합니다. Lombok이 **컴파일 시점에 자동 생성**해 코드를 깔끔하게 유지합니다.

> 💡 초보 포인트: IDE에서 엔티티를 봐도 `getTitle()` 정의가 안 보일 수 있습니다 — Lombok이 컴파일할 때 만들기 때문. "분명 호출하는데 정의가 없네?" 싶으면 클래스 위 `@Getter`를 확인하세요.

---

### I. application.properties — 프로파일(local / prod)

같은 코드를 **로컬 개발**과 **운영(EC2)** 에서 다르게 설정하려고 **프로파일(profile)** 을 씁니다.

```properties
# application.properties:6  (공통 기본값)
spring.profiles.default=local
```

```properties
# application.properties:20  (기본/공통 — 로컬 친화)
spring.jpa.hibernate.ddl-auto=update
spring.flyway.enabled=false
```

- 파일 3개가 계층으로 합쳐집니다:
  - `application.properties` — **공통 기본값** (모든 환경 공유).
  - `application-local.properties` — 로컬 개발용 덮어쓰기(실키·로컬 DB 비번 등, **git 커밋 금지**).
  - `application-prod.properties` — 운영용 덮어쓰기(HTTPS 쿠키, Flyway 켬 등).
- 실행 시 `--spring.profiles.active=local` 또는 `=prod`로 **어느 덮어쓰기를 쓸지** 고릅니다. 안 주면 `spring.profiles.default=local`이 적용됩니다.
- `${VAR:기본값}` 문법 — **환경변수 우선, 없으면 기본값**. 예:
  ```properties
  # application.properties:16-18
  spring.datasource.url=jdbc:mysql://${DB_HOST:localhost}:${DB_PORT:3306}/${DB_NAME:alphahelix_db}?...
  spring.datasource.password=${DB_PASSWORD}      ← 기본값 없음 → 반드시 환경/로컬 파일에서 주입
  ```
  `application-local.properties:6-10`이 바로 그 `DB_HOST=localhost` 등을 채워줍니다.

> ⚠️ 메모리 교훈: **env 우선순위를 바꾸기 전, 같은 키가 다른 파일에서 다른 값으로 중복 정의돼 있는지 반드시 확인**하세요(특히 `app.crypto.key`). `application.properties`엔 개발용 기본값이, `application-local.properties:19`엔 또 다른 값이 있어 어느 쪽이 이기는지 헷갈리면 KIS 복호화가 깨집니다.

---

### J. Flyway 마이그레이션 — DB 스키마 버전 관리

DB 테이블 구조(스키마)를 코드처럼 **버전 관리**하는 도구가 **Flyway**입니다.

```properties
# application.properties:132-142 (발췌)
# 로컬(ddl-auto=update)은 비활성, 운영(ddl-auto=validate)은 활성화해서 스키마 버전 관리
spring.flyway.enabled=false
spring.flyway.locations=classpath:db/migration
spring.flyway.baseline-on-migrate=true
spring.flyway.baseline-version=16
```

- **마이그레이션 파일**은 `backend/src/main/resources/db/migration/`에 `V1__baseline.sql`, `V2__...`, ... `V18__refresh_tokens_table.sql` 처럼 **번호 순서대로** 쌓입니다.
- Flyway는 DB에 `flyway_schema_history` 표를 만들어 **"어느 V까지 적용했는지"** 를 기록하고, 앱 기동 시 **아직 안 돌린 V만 차례로 실행**합니다. → 누구의 DB든 같은 최종 스키마가 보장됩니다.
- **`ddl-auto`와의 역할 분담(중요):**
  - **로컬**: `ddl-auto=update` + `flyway.enabled=false` → 엔티티를 바꾸면 Hibernate가 **편하게 테이블을 자동 수정**(빠른 개발).
  - **운영**: `ddl-auto=validate` + Flyway 켬 → Hibernate는 **스키마를 절대 바꾸지 않고**(검증만), 스키마 변경은 **오직 Flyway SQL 파일로만** 통제(안전·추적 가능).
- 비유: Flyway는 **DB의 git**입니다. "테이블에 컬럼 추가" 같은 변경을 **번호 매긴 커밋(SQL 파일)** 으로 남겨, 어느 서버든 똑같이 재현합니다.

> 💡 초보 포인트: 새 마이그레이션(`V19__...`)을 추가하면 `application.properties:142`의 `baseline-version`도 그에 맞춰 올려야 한다고 주석이 경고합니다. 번호는 **건너뛰지 말고 연속**으로.

---

## ⚠️ 이 프로젝트 특이점 (다른 도메인 교재의 대전제)

### ★★★ 특이점 1: **Spring Security를 끄고, 인가를 컨트롤러에서 수동 처리한다**

이게 이 백엔드에서 **가장 중요하고 가장 헷갈리는** 부분입니다. 다른 도메인 교재들은 전부 이 전제를 깔고 있으니 여기서 확실히 잡고 갑시다.

**증거 1 — Security 프레임워크를 의존성에서 뺐다:**
```groovy
// build.gradle:28-30
// implementation 'org.springframework.boot:spring-boot-starter-security'   ← 주석 처리(=안 씀)
// 비밀번호 BCrypt 해싱만 사용 (전체 Security 프레임워크/auto-config 없이 PasswordEncoder 만)
implementation 'org.springframework.security:spring-security-crypto'
```
- 보통 스프링 앱은 `spring-boot-starter-security`가 **모든 요청을 가로막고** 로그인/권한을 자동 관리합니다. **이 프로젝트는 그 전체 프레임워크를 끄고**, 비밀번호 해싱용 `spring-security-crypto`(BCrypt)만 떼어 씁니다.

**그럼 인증/인가는 누가 하나? → 직접 만든 필터 + 컨트롤러 수동 체크.**

**증거 2 — JWT 필터는 "막지 않고, 도장만 찍는다":**
```java
// JwtAuthenticationFilter.java:28-32, 42-60 (발췌)
@Component
@Order(Ordered.HIGHEST_PRECEDENCE + 10)
public class JwtAuthenticationFilter extends OncePerRequestFilter {
    ...
    protected void doFilterInternal(HttpServletRequest request, ...) {
        String token = extractToken(request);          // 쿠키 또는 Bearer 헤더에서 JWT 추출
        if (token != null && !token.isBlank()) {
            try {
                var claims = jwtUtil.parse(token);
                Object uid = claims.get("uid");
                if (uid instanceof Number n) {
                    request.setAttribute(ATTR_USER_ID, n.longValue());   // ★ userId를 요청에 "도장"
                }
                ...
            } catch (Exception e) {
                // 토큰 파싱 실패: 익명 요청으로 통과   ← ★막지 않는다!
            }
        }
        chain.doFilter(request, response);              // 무조건 다음으로 통과
    }
```
- 이 필터는 **요청을 거부하지 않습니다.** JWT가 유효하면 `request`에 `userId` 도장을 찍고, **없거나 깨졌어도 그냥 통과**시킵니다(익명으로). 즉 "문지기"가 아니라 "신원 스탬프 찍는 사람"입니다.
- `@Order(...HIGHEST_PRECEDENCE + 10)` — 이 필터가 **다른 필터(AiRateLimitFilter, +20)보다 먼저** 돌아야 `userId` 도장이 미리 찍힙니다.

**증거 3 — 실제 "막는" 곳은 컨트롤러다 (수동 인가):**
```java
// NotificationController.java:78-87
/** JWT(AuthContext) 의 사용자 — 미인증/미존재면 null. 요청 파라미터 신원은 신뢰하지 않는다. */
private User currentUser() {
    Long uid = AuthContext.currentUserId();        // 필터가 찍은 도장을 꺼냄
    if (uid == null) return null;
    return userRepository.findById(uid).orElse(null);
}

private static ResponseEntity<?> unauthorized() {
    return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(Map.of("error", "인증 필요"));
}
```
```java
// NotificationController.java:33-35  (모든 보호 엔드포인트의 첫 두 줄 패턴)
User user = currentUser();
if (user == null) return unauthorized();           // ★ 여기서 직접 401을 낸다
```
- **이 두 줄(`currentUser()` → `null`이면 `unauthorized()`)이 이 프로젝트의 "인가 게이트"입니다.** Security 프레임워크가 자동으로 안 막아주므로, **모든 보호 엔드포인트가 자기 손으로 null 체크를 해야** 합니다. 빠뜨리면 그 엔드포인트는 무방비로 뚫립니다.

**증거 4 — 신원은 오직 JWT에서만 (IDOR 차단):**
```java
// AuthContext.java:27-34
public static Long currentUserId() {
    Long override = OVERRIDE_USER_ID.get();        // 스케줄러용 임시 주입(아래 설명)
    if (override != null) return override;
    HttpServletRequest req = currentRequest();
    if (req == null) return null;
    Object v = req.getAttribute(JwtAuthenticationFilter.ATTR_USER_ID);   // 필터가 찍은 도장
    return v instanceof Long ? (Long) v : null;
}
```
- `AuthContext`는 **"지금 이 요청의 진짜 주인이 누구인지"** 를 알려주는 헬퍼입니다. 신원을 **JWT 도장에서만** 읽습니다.
- 컨트롤러 클래스 주석(`NotificationController.java:19-21`)이 그 이유를 못 박습니다:
  > M9 보안 수정: 이전에는 `?userId=` 요청 파라미터를 그대로 신뢰해 인증된 누구나 **타인의 알림을 조회/읽음처리할 수 있는 IDOR**가 있었다. 이제 신원은 항상 JWT(AuthContext)에서만 가져오고, 요청 파라미터로 받지 않는다.
- **그래서 이 컨트롤러는 `@RequestParam Long userId`를 절대 쓰지 않습니다.** 만약 클라이언트가 보낸 `?userId=42`를 믿으면, 공격자가 남의 ID를 넣어 **남의 데이터를 훔쳐볼(IDOR, Insecure Direct Object Reference)** 수 있기 때문. 신원은 **위조 불가능한 JWT 도장**에서만 옵니다.

**증거 5 — Service에서 한 번 더 소유권 확인 (이중 방어):**
```java
// StreamChatService.java:244-250
public void markNotificationRead(Long notificationId, User user) {
    notificationRepository.findById(notificationId).ifPresent(n -> {
        if (n.getUser().getId().equals(user.getId())) {   // ★ 이 알림이 정말 이 user 것인가?
            n.setRead(true);
            ...
```
- 컨트롤러에서 신원을 확인했어도, Service가 **"이 알림 ID가 정말 그 유저 소유인지"** 를 한 번 더 검사합니다. 남의 알림 ID(`3`)를 넣어도 조용히 무시됩니다.

**정리 — 이 프로젝트의 인증/인가 4단 방어:**
```
1) JwtAuthenticationFilter  : 쿠키/헤더의 JWT → request에 userId 도장 (막지 않음)
2) AuthContext.currentUserId(): 도장에서만 신원 읽기 (요청 파라미터 신뢰 안 함)
3) Controller               : currentUser()==null → 401 (수동 인가 게이트)
4) Service                  : 자원 소유권 재확인 (n.user == 현재 user)
```

> 🚨 강의/고도화 핵심: 다른 도메인 교재에서 **`if (user == null) return unauthorized();` 두 줄이 반복**되는 걸 보게 됩니다. 그건 중복이 아니라 **이 아키텍처의 필수 인가 코드**입니다. Security를 안 쓰기로 한 대가로, **각 컨트롤러가 스스로 문지기**가 됩니다.

### 특이점 2: `AuthContext`의 스케줄러용 "임시 신원 주입"

```java
// AuthContext.java:15-25
private static final ThreadLocal<Long> OVERRIDE_USER_ID = new ThreadLocal<>();

public static void set(Long userId) {        // 예: DailySignalGenerator가 특정 유저 대신 실행
    if (userId != null) OVERRIDE_USER_ID.set(userId);
}
public static void clear() {                 // 반드시 finally에서 호출
    OVERRIDE_USER_ID.remove();
}
```
- HTTP 요청이 없는 **백그라운드 잡(스케줄러)** 에는 JWT 쿠키가 없습니다. 그래서 "이 작업은 유저 42번 것처럼 실행"하고 싶을 때 `AuthContext.set(42L)`로 **임시 신원을 주입**합니다.
- `ThreadLocal` — "현재 실행 스레드에만 보이는 변수". **반드시 `finally`에서 `clear()`** 해야 스레드가 재사용될 때 남의 신원이 새지 않습니다(스레드풀 누수 주의).

### 특이점 3: 인증은 **HttpOnly JWT 쿠키**가 표준 (헤더는 레거시)

```java
// JwtAuthenticationFilter.java:62-78 (발췌)
// 1순위: HttpOnly 쿠키 (DEVBRIDGE_TOKEN)
for (Cookie c : cookies) {
    if (AuthController.AUTH_COOKIE_NAME.equals(c.getName())) { ... return v.trim(); }
}
// 2순위: Authorization 헤더 (레거시 호환)
if (header != null && header.startsWith("Bearer ")) { return header.substring(7).trim(); }
```
- JWT는 **HttpOnly 쿠키**(JS가 못 읽음 → XSS 토큰 탈취 방지)로 전달되는 게 1순위, `Authorization: Bearer` 헤더는 옛 클라이언트 호환용 2순위입니다.

---

## 📚 용어 사전 (이 primer 한정)

| 용어 | 뜻 |
|---|---|
| **애너테이션(`@...`)** | 코드에 붙여 스프링/Lombok에 지시하는 스티커 라벨 |
| **빈(Bean)** | 스프링이 만들어 창고에 보관 중인 객체 하나 |
| **DI(의존성 주입)** | 필요한 빈을 스프링이 생성자로 꽂아주는 것 |
| **`@RequiredArgsConstructor`** | `final` 필드 생성자를 Lombok이 자동 생성(→ DI 통로) |
| **Controller** | HTTP 요청 접수처(`@RestController`) |
| **Service** | 비즈니스 규칙·트랜잭션이 사는 처리실 |
| **Repository** | DB 읽기/쓰기 담당(`JpaRepository` 상속) |
| **엔티티(`@Entity`)** | DB 테이블 한 행에 대응하는 자바 객체 |
| **DTO** | 프론트와 주고받는 포장지 객체(엔티티와 분리) |
| **`@Id` / `@GeneratedValue`** | 기본키 / 자동 증가 |
| **`@ManyToOne` / `@JoinColumn`** | 관계 매핑(여러→하나) / 외래키 컬럼 |
| **`@Column`** | 컬럼 세부 설정(이름·NOT NULL·길이·타입) |
| **`@Enumerated(STRING)`** | enum을 문자열로 DB 저장(순서 변경 안전) |
| **메서드 이름 쿼리** | `findByUserOrderBy...` 이름만으로 SQL 자동 생성 |
| **`@Query` / `@Modifying`** | 직접 작성 JPQL / 데이터 변경 쿼리 표시 |
| **`@Transactional`** | 여러 DB 작업을 "전부 성공 or 전부 취소"로 묶음 |
| **`ResponseEntity`** | 상태코드 + 본문을 직접 정해 반환하는 응답 객체 |
| **`@PathVariable` / `@RequestParam` / `@RequestBody`** | URL 경로값 / 쿼리값 / 본문 JSON 추출 |
| **프로파일(profile)** | `local`/`prod` 등 환경별 설정 묶음 |
| **`${VAR:기본값}`** | 환경변수 우선, 없으면 기본값 |
| **Flyway** | 번호 매긴 SQL로 DB 스키마를 버전 관리(=DB의 git) |
| **`ddl-auto`** | Hibernate의 스키마 처리 모드(local=update, prod=validate) |
| **IDOR** | 남의 ID를 넣어 남의 자원에 접근하는 취약점(이 프로젝트가 JWT 신원으로 차단) |
| **AuthContext** | 현재 요청의 신원(userId)을 JWT 도장에서 읽는 헬퍼 |
| **HttpOnly 쿠키** | JS가 못 읽는 쿠키 → XSS 토큰 탈취 방지 |
| **Lombok** | getter/builder/생성자를 컴파일 시 자동 생성하는 라이브러리 |

---

## ✅ 다음 단계

이 primer를 이해했다면 `08_backend/`의 각 도메인 교재로 넘어가세요. 어느 교재를 읽든 아래 패턴이 반복됩니다 — 이제 다 읽을 수 있습니다:

```java
@RestController @RequiredArgsConstructor          // 접수처 + DI
public class XxxController {
    private final XxxService service;              // 주입받은 Service
    @GetMapping("/...")
    public ResponseEntity<?> handle(@PathVariable ...) {
        User user = currentUser();                 // JWT 신원
        if (user == null) return unauthorized();   // ★수동 인가 게이트 (이 프로젝트 시그니처)
        return ResponseEntity.ok(service.doSomething(user, ...));
    }
}
```
