# `domain/user` — 회원 관리 + 신분증(JWT) 발급소 (완전 라인별 해설)

> 원본: `backend/src/main/java/com/DevBridge/devbridge/domain/user/` 전체
> + 연관 보안 모듈: `backend/src/main/java/com/DevBridge/devbridge/global/security/`
> 이 문서는 교재 표준 형식(README "3. 공통 형식", 모범 예시 `01_backtest/vbt_engine.md`)을 따릅니다.
> 전제: 스프링 기초(`@RestController`·`@Service`·DI·`ResponseEntity` 등)는 `08_backend/00_spring_primer.md`에서 다룹니다. 여기서는 **user 도메인 코드 그 자체**를 한 줄씩 풉니다.

---

## 📌 이 도메인 한눈에

이 도메인은 **"회원 관리 + 신분증 발급소"** 입니다. 사람으로 비유하면 **주민센터 + 출입증 발급 데스크**예요.

- **회원가입(signup)** = 주민센터에 새 주민 등록. 비밀번호는 절대 평문으로 보관하지 않고 **금고(BCrypt 해시)** 에 넣습니다.
- **로그인(login)** = 신분 확인 후 **출입증(JWT 토큰)** 발급. 이 출입증을 **봉인된 봉투(HttpOnly 쿠키)** 에 담아 브라우저에 줍니다.
- **이후 모든 요청** = 출입증(쿠키)을 매번 들고 오면, 입구의 **경비원(JwtAuthenticationFilter)** 이 위조 여부를 확인하고 "이 사람은 N번 회원"이라고 요청에 도장(`auth.userId` 속성)을 찍어줍니다.
- **소셜 로그인(Google·GitHub)** = 다른 기관(구글·깃허브)이 발급한 신분증을 **우리가 직접 그 기관에 전화해 진위 확인** 후 우리 출입증으로 교환.
- **프로필/은행/이메일 인증** = 등록된 주민의 부가 정보 관리.

핵심 클래스 역할표:

| 클래스 | 한 줄 역할 | 비유 |
|---|---|---|
| `AuthController` | signup·login·refresh·social·github·logout 의 **HTTP 입구**. 쿠키 굽기 담당 | 출입증 발급 창구 |
| `AuthService` | 가입 검증·BCrypt 해싱·로그인 비번 대조·소셜 계정 조회/생성 | 신원 확인 담당관 |
| `JwtUtil` | JWT 토큰 **발행(issue)** · **검증(parse)** | 출입증 인쇄기 + 위조 감별기 |
| `JwtAuthenticationFilter` | 매 요청마다 쿠키/헤더에서 토큰 꺼내 검증 → 요청에 userId 주입 | 입구 경비원 |
| `AuthContext` | 컨트롤러에서 "지금 누구?"를 꺼내는 헬퍼 | 도장 찍힌 userId 판독기 |
| `UserController` | 사용자 검색·조회(채팅용)·GitHub username 수정 | 주민 조회 창구 |
| `ProfileController`/`ProfileService` | 프로필 상세 저장/조회/초기화 | 프로필 관리실 |
| `BankVerificationController`/`Service` | 입금자명 3자리 코드로 계좌 인증 | 계좌 본인확인 데스크 |
| `EmailVerificationController`/`Service` | 6자리 코드로 이메일 인증 | 이메일 본인확인 데스크 |
| `User` (엔티티) | 회원 1명 = DB `USERS` 한 행 | 주민등록 카드 |
| `RefreshToken` (엔티티) | 출입증 자동 갱신용 장기 티켓 | 재발급 쿠폰 |

**누가 호출하나?** → 프론트엔드(React)가 `/api/auth/*`, `/api/users/*`, `/api/profile/*`, `/api/bank/*`, `/api/verify/*` 로 REST 요청을 보내면 각 컨트롤러가 받습니다. 출입증(JWT 쿠키)은 한 번 발급되면 이후 모든 도메인(strategy·ai·payment…) 요청에서 "이 요청의 주인"을 식별하는 데 쓰입니다.

> ⚠️ 중요한 설계 사실: 이 프로젝트는 **풀 Spring Security 프레임워크(SecurityFilterChain)를 의도적으로 끄고**, 대신 직접 만든 경량 조합(`JwtAuthenticationFilter` + `AuthContext`)으로 인증을 처리합니다. `PasswordConfig`(`global/config/PasswordConfig.java`)는 그중 **BCrypt 해싱 기능만** 빌려 씁니다. 이 한 줄이 도메인 전체의 보안 모델을 결정하니 꼭 기억하세요.

---

## 🧠 사전 지식 (이거 모르면 막힘)

#### 1) JWT 토큰 = "위조 불가능한 코팅 출입증"
JWT(JSON Web Token)는 `헤더.페이로드.서명` 세 토막을 점(`.`)으로 이은 문자열입니다.
```
eyJhbGciOi...   .   eyJ1aWQiOjEyLCJ0eXBlIjoiRlJFRSJ9   .   k3jD9f...
   헤더(알고리즘)            페이로드(uid=12, type=FREE 등)        서명(HMAC)
```
- **페이로드는 누구나 읽을 수 있습니다**(Base64, 암호화 아님). 그래서 비밀번호 같은 건 절대 안 넣습니다.
- 핵심은 **서명**: 서버만 아는 비밀키(`app.jwt.secret`)로 `HMAC-SHA256`을 찍습니다. 누군가 페이로드를 "uid=12 → uid=1(관리자)"로 고치면 서명이 깨져 **검증(parse)에서 즉시 탈락**합니다. 도장 위조 불가능한 출입증과 같아요.
- "대칭키(HS256)"란: 발행할 때와 검증할 때 **같은 비밀키**를 씁니다(서버 혼자만 보관).

#### 2) HttpOnly 쿠키 = "자바스크립트가 못 여는 봉인 봉투"
- 일반적으로 토큰을 브라우저 `localStorage`에 넣으면, XSS(악성 스크립트)가 `localStorage.getItem('token')`으로 **훔쳐갈 수 있습니다**.
- `HttpOnly` 쿠키는 **자바스크립트가 읽을 수 없게** 브라우저가 막습니다. 오직 브라우저가 요청 보낼 때 자동으로 동봉만 합니다. → XSS 토큰 탈취 방어.
- 추가 속성: `Secure`(HTTPS에서만 전송), `SameSite`(다른 사이트가 우리 쿠키를 끼워 보내는 CSRF 방어).

#### 3) BCrypt 해싱 = "되돌릴 수 없는 분쇄 + 소금"
- 비밀번호를 그대로 DB에 저장하면, DB가 유출되는 순간 전원 비번이 새어나갑니다.
- **해싱**은 단방향 함수: `"hunter2"` → `$2a$10$N9qo8...`. 이 결과로는 **원래 비번을 역산할 수 없습니다**.
- BCrypt는 ① **솔트(salt, 무작위 소금)** 를 매번 섞어 같은 비번도 매번 다른 해시가 나오고(레인보우 테이블 방어), ② 일부러 **느리게**(work factor) 만들어 무차별 대입을 비싸게 합니다.
- BCrypt 해시는 항상 `$2a$`/`$2b$`/`$2y$` 같은 **`$2`로 시작**합니다. 이 문서 뒤에서 이 접두사로 "해시인가 평문인가"를 구분하는 코드가 나옵니다.

#### 4) OAuth 소셜 로그인 = "다른 기관 신분증으로 입장"
- 사용자는 구글/깃허브에 로그인 → 그 기관이 **access_token**(임시 출입증)을 발급 → 프론트가 그걸 우리 백엔드로 전달.
- **핵심 보안 원칙**: 프론트가 같이 보낸 "이 사람 이메일은 X"라는 말은 **믿으면 안 됩니다**(위조 가능). 백엔드가 그 access_token을 들고 **직접 구글/깃허브에 전화**해서 "이 토큰의 진짜 이메일이 뭐냐"를 받아와야 합니다. (이게 아래 C2 취약점 수정의 핵심.)

#### 5) Access Token / Refresh Token 쌍 = "짧은 출입증 + 긴 재발급 쿠폰"
- **Access Token(JWT)**: 수명이 **짧음**(여기선 1시간). 매 요청마다 제시. 탈취돼도 곧 만료라 피해가 작음.
- **Refresh Token**: 수명이 **김**(여기선 15일). DB에 저장. Access가 만료되면 **이걸 제시해 새 Access를 받습니다**(재로그인 없이). 출입증이 만료되면 안내데스크에 쿠폰을 내밀어 새 출입증을 받는 셈.
- 왜 둘로 나누나? **편의(자주 로그인 안 함) ↔ 보안(짧은 access)** 의 균형. Refresh는 자주 안 쓰이고 DB에서 폐기(로그아웃·만료)할 수 있어 통제가 쉽습니다.

---

## 🗺 요청 흐름도

### (A) 회원가입 / 로그인 → 출입증 발급
```
[프론트] POST /api/auth/login {email, password}
              │
              ▼
        AuthController.login()
              │  authService.login(request)
              ▼
        AuthService.login()
          ├─ findByEmail 으로 User 조회 (없으면 "가입되지 않은 이메일")
          ├─ stored.startsWith("$2") ?
          │     예  → passwordEncoder.matches(raw, stored)   (BCrypt 대조)
          │     아니오 → 평문 비교 → 일치 시 즉시 BCrypt 재해싱 후 저장  ⚠️C1
          └─ 불일치 → "비밀번호가 일치하지 않습니다"
              │  (User 반환)
              ▼
        jwtUtil.issue(uid, email, type)  → access (JWT, 1h)
        issueRefreshToken(uid)           → refresh (UUID, DB저장, 15d)
              │
              ▼
        withTokenCookies(access, refresh)
          ├─ Set-Cookie: DEVBRIDGE_TOKEN   (HttpOnly, path=/)
          └─ Set-Cookie: DEVBRIDGE_REFRESH (HttpOnly, path=/api/auth)
              │
              ▼
        [프론트] 쿠키 2장 저장(자동) + AuthResponse(body) 수신
```

### (B) 이후 매 요청 → 경비원이 신분 확인
```
[프론트] GET /api/profile/me/detail   (쿠키 DEVBRIDGE_TOKEN 자동 동봉)
              │
              ▼
   ┌──────────────────────────────────────────┐
   │ JwtAuthenticationFilter (모든 요청 1번씩)   │  ← Order: 가장 먼저
   │  extractToken: ①쿠키 DEVBRIDGE_TOKEN        │
   │               ②Authorization: Bearer (레거시)│
   │  jwtUtil.parse(token)  (서명·만료 검증)      │
   │   성공 → request.setAttribute("auth.userId")│
   │   실패 → 조용히 통과(익명)                    │
   └──────────────────────────────────────────┘
              │
              ▼
        ProfileController.myDetail()
          Long userId = AuthContext.currentUserId();  ← 도장 판독
          if (userId == null) → 401
              │
              ▼
        ProfileService.getDetail(userId) → 응답
```

> 💡 핵심: 필터는 **인증 실패해도 막지 않고 그냥 통과**시킵니다("익명 요청"). 실제 차단은 각 컨트롤러가 `AuthContext.currentUserId() == null` 을 보고 401을 내는 방식입니다. 이게 이 프로젝트의 경량 인증 패턴입니다.

### (C) 소셜 로그인 (Google)
```
[프론트] (구글 로그인) → access_token 획득 → POST /api/auth/social-login {accessToken}
              │
              ▼
        AuthController.socialLogin()
          verifyGoogleAccessToken(accessToken)
            → GET googleapis.com/oauth2/v3/userinfo (Bearer)  ⚠️C2: 서버가 직접 검증
            → email + email_verified 확인
              │  (검증된 email)
              ▼
        authService.socialLogin(email)  → findByEmail (가입돼 있어야 함)
              │
              ▼
        (A)와 동일하게 JWT + Refresh 쿠키 발급
```

---

## 📖 핵심 클래스 라인별 심화

### A. `AuthController` — 출입증 발급 창구

#### A-1. 클래스 선언 + 쿠키 이름 상수 — `AuthController.java:30-42`
```java
// L30-L42
@Slf4j
@RestController
@RequestMapping("/api/auth")
@RequiredArgsConstructor
public class AuthController {

    public static final String AUTH_COOKIE_NAME    = "DEVBRIDGE_TOKEN";
    public static final String REFRESH_COOKIE_NAME = "DEVBRIDGE_REFRESH";

    private final AuthService authService;
    private final JwtUtil jwtUtil;
    private final RefreshTokenRepository refreshTokenRepository;
    private final UserRepository userRepository;
```
- `@RestController` = "이 클래스의 메서드 반환값을 JSON으로 응답한다". `@RequestMapping("/api/auth")` = 이 클래스의 모든 URL은 `/api/auth`로 시작.
- `@RequiredArgsConstructor`(롬복) = `final` 필드들을 받는 생성자를 자동 생성 → 스프링이 그 생성자로 **의존성 주입(DI)**. `new` 키워드 없이 `authService`, `jwtUtil` 등을 스프링이 채워줍니다.
- `AUTH_COOKIE_NAME`/`REFRESH_COOKIE_NAME` 이 `public static final` 인 이유: **다른 클래스(JwtAuthenticationFilter)도 같은 쿠키 이름을 참조**해야 하기 때문(`AuthController.AUTH_COOKIE_NAME`). 이름을 한 곳에서만 정의해 오타·불일치를 막는 패턴.

> 💡 초보 포인트: 쿠키 이름이 두 곳(발급=AuthController, 읽기=Filter)에서 쓰이는데 둘이 다르면 "로그인은 되는데 그다음 요청이 익명"이 되는 미묘한 버그가 납니다. 그래서 상수 한 곳에서 공유.

#### A-2. 설정값 주입 (`@Value`) — `AuthController.java:46-62`
```java
// L46-L62
@Value("${app.cookie.secure:false}")
private boolean cookieSecure;

@Value("${app.cookie.same-site:Lax}")
private String cookieSameSite;

@Value("${app.jwt.ttl-hours:1}")
private long jwtTtlHours;

@Value("${app.jwt.refresh-ttl-days:15}")
private long refreshTtlDays;
```
- `@Value("${키:기본값}")` = `application.properties`(또는 환경변수)에서 값을 읽어 필드에 주입. 콜론 뒤가 **기본값**.
- `cookieSecure:false` — 로컬(http)에서는 `false`라야 쿠키가 전송됨. **운영(prod)에서는 반드시 `true`**(HTTPS에서만 쿠키 전송)로 설정해야 합니다. 이게 빠지면 평문 HTTP로 쿠키가 새 나갈 수 있어요.
- `jwtTtlHours:1` = Access 토큰 수명 1시간, `refreshTtlDays:15` = Refresh 15일. 앞서 사전지식 5번의 "짧은 access / 긴 refresh".

#### A-3. 쿠키 굽기 헬퍼 — `AuthController.java:66-94`
```java
// L66-L84
private ResponseCookie buildAuthCookie(String token) {
    return ResponseCookie.from(AUTH_COOKIE_NAME, token)
            .httpOnly(true)
            .secure(cookieSecure)
            .sameSite(cookieSameSite)
            .path("/")
            .maxAge(java.time.Duration.ofHours(jwtTtlHours))
            .build();
}

private ResponseCookie buildRefreshCookie(String token) {
    return ResponseCookie.from(REFRESH_COOKIE_NAME, token)
            .httpOnly(true)
            .secure(cookieSecure)
            .sameSite(cookieSameSite)
            .path("/api/auth")   // refresh 엔드포인트로만 전송
            .maxAge(java.time.Duration.ofDays(refreshTtlDays))
            .build();
}
```
- `.httpOnly(true)` — JS가 못 읽음(XSS 방어, 사전지식 2). **두 쿠키 모두** 적용.
- `.path("/")` vs `.path("/api/auth")` — **여기가 영리한 보안 설계**:
  - Access 쿠키는 `path=/` → 모든 API 요청에 동봉(어디서나 인증 필요).
  - Refresh 쿠키는 `path=/api/auth` → **오직 `/api/auth/*` 요청에만** 브라우저가 보냄. 즉 평소 일반 API 요청에는 refresh가 **노출조차 안 됨** → 탈취 표면 축소.
- `.maxAge(...)` — 쿠키 자체의 만료(브라우저가 자동 삭제). Access는 1시간, Refresh는 15일.
- `buildClearCookie`(L86-94)는 같은 쿠키를 **빈 값 + maxAge(0)** 으로 다시 구워 **즉시 삭제**시킵니다(로그아웃용).

> ⚠️ 함정: 쿠키를 지울 때도 **만들 때와 동일한 `path`/속성**으로 구워야 브라우저가 "같은 쿠키"로 인식해 삭제합니다. 그래서 `logout`에서 `buildClearCookie(REFRESH_COOKIE_NAME, "/api/auth")` 처럼 path를 정확히 맞춥니다(L364).

#### A-4. Refresh 토큰 발급 헬퍼 — `AuthController.java:98-108`
```java
// L98-L108
private String issueRefreshToken(Long userId) {
    String raw = UUID.randomUUID().toString().replace("-", "");
    refreshTokenRepository.save(RefreshToken.of(userId, raw, refreshTtlDays));
    return raw;
}

private ResponseEntity.BodyBuilder withTokenCookies(String accessToken, String refreshToken) {
    return ResponseEntity.ok()
            .header(HttpHeaders.SET_COOKIE, buildAuthCookie(accessToken).toString())
            .header(HttpHeaders.SET_COOKIE, buildRefreshCookie(refreshToken).toString());
}
```
- Refresh 토큰은 JWT가 아니라 **그냥 무작위 UUID 문자열**(`replace("-","")` 로 하이픈 제거 → 32자). JWT와 달리 "의미 없는 임의 값"이고, **유효성은 DB 존재 여부로만 판단**합니다(아래 refresh 참고). 그래서 DB에서 지우면 즉시 무효화 가능.
- `withTokenCookies` — `Set-Cookie` 헤더를 **두 번** 추가(access + refresh). HTTP는 Set-Cookie 헤더를 여러 개 보낼 수 있어 쿠키 2장을 동시에 굽습니다.

#### A-5. 회원가입 `signup` — `AuthController.java:112-135`
```java
// L112-L130
@PostMapping("/signup")
public ResponseEntity<AuthResponse> signup(@RequestBody SignupRequest request) {
    try {
        User user = authService.signup(request);
        String userType = user.getUserType() != null ? user.getUserType().name() : "GUEST";
        String access  = jwtUtil.issue(user.getId(), user.getEmail(), userType);
        String refresh = issueRefreshToken(user.getId());
        return withTokenCookies(access, refresh)
                .body(AuthResponse.builder()
                        .userId(user.getId())
                        .email(user.getEmail())
                        ...
                        .token(access)
                        .message("회원가입이 완료되었습니다.")
                        .build());
    } catch (Exception e) {
        return ResponseEntity.badRequest().body(AuthResponse.builder()
                .message(e.getMessage()).build());
    }
}
```
- `@PostMapping("/signup")` → `POST /api/auth/signup`. `@RequestBody SignupRequest` = 요청 JSON 본문을 `SignupRequest` 객체로 자동 역직렬화.
- 흐름: **가입은 `AuthService.signup`에 위임**(비즈니스 로직 분리) → 돌아온 `User`로 **즉시 토큰 발급**(가입과 동시에 로그인 상태로). 이걸 "auto-login on signup" 패턴이라 합니다.
- `userType.name()` 이 null이면 `"GUEST"` 폴백 — 토큰의 `type` 클레임에 들어갈 문자열.
- `.token(access)` — 쿠키로도 주지만 **응답 본문에도** access 토큰을 같이 담습니다(레거시 호환: 헤더 방식 클라이언트 대비. 아래 필터 2순위 참고).
- 예외 처리: 가입 실패(중복 이메일 등)면 `400 Bad Request` + 한글 메시지. 컨트롤러가 예외를 잡아 **사용자 친화 메시지**로 변환.

#### A-6. 로그인 `login` — `AuthController.java:137-160`
구조는 signup과 거의 동일(`authService.login` → 토큰 발급 → 쿠키). 차이는 진입점이 `authService.login`이라는 것뿐. **비밀번호 대조의 진짜 로직은 `AuthService.login`에 있습니다**(아래 B-2에서 심화).

#### A-7. 토큰 재발급 `refresh` — `AuthController.java:166-191`
```java
// L166-L191
@PostMapping("/refresh")
public ResponseEntity<?> refresh(HttpServletRequest request) {
    String rawToken = extractCookie(request, REFRESH_COOKIE_NAME);
    if (rawToken == null || rawToken.isBlank()) {
        return ResponseEntity.status(401).body(Map.of("message", "Refresh token 없음"));
    }

    RefreshToken rt = refreshTokenRepository.findByToken(rawToken).orElse(null);
    if (rt == null || rt.isExpired()) {
        if (rt != null) refreshTokenRepository.deleteByToken(rawToken);
        return ResponseEntity.status(401).body(Map.of("message", "Refresh token 만료 또는 유효하지 않음"));
    }

    User user = userRepository.findById(rt.getUserId()).orElse(null);
    if (user == null) {
        refreshTokenRepository.deleteByToken(rawToken);
        return ResponseEntity.status(401).body(Map.of("message", "사용자 없음"));
    }

    String userType = user.getUserType() != null ? user.getUserType().name() : "GUEST";
    String newAccess = jwtUtil.issue(user.getId(), user.getEmail(), userType);

    return ResponseEntity.ok()
            .header(HttpHeaders.SET_COOKIE, buildAuthCookie(newAccess).toString())
            .body(Map.of("message", "토큰 재발급 완료"));
}
```
- **시나리오**: Access(1시간)가 만료되면, 프론트는 재로그인 대신 이 `/api/auth/refresh`를 호출. (Refresh 쿠키는 `path=/api/auth`라 여기서만 동봉됨 — A-3의 설계가 빛나는 순간.)
- 검증 3단:
  1. 쿠키에 refresh가 **있나** → 없으면 401.
  2. DB에 그 토큰이 **존재하고 안 만료됐나**(`findByToken` + `isExpired`) → 만료면 DB에서 삭제하고 401(쓰레기 청소).
  3. 그 토큰의 주인 **User가 실제 존재하나** → 탈퇴한 사용자면 토큰 삭제 후 401.
- 통과하면 **새 Access만** 발급(`buildAuthCookie`만). Refresh는 그대로 두어 15일 동안 재사용. (이를 "non-rotating refresh"라 합니다 — 고도화 아이디어에서 회전 방식 논의.)

> 💡 초보 포인트: refresh 검증이 **JWT 파싱이 아니라 DB 조회**라는 점이 중요. Access(JWT)는 "서명만 맞으면 통과"(stateless)지만, Refresh는 "DB에 살아있어야 통과"(stateful). 그래서 로그아웃/탈퇴 시 DB에서 지우면 즉시 무효화됩니다.

#### A-8. 소셜 로그인 `socialLogin` + 구글 검증 — `AuthController.java:193-253`
```java
// L193-L210
@PostMapping("/social-login")
public ResponseEntity<AuthResponse> socialLogin(@RequestBody Map<String, String> request) {
    String accessToken = request.get("accessToken");
    if (accessToken == null || accessToken.isBlank()) {
        return ResponseEntity.badRequest().body(AuthResponse.builder()
                .message("소셜 로그인 토큰(accessToken)이 필요합니다.").build());
    }
    // 보안(C2): 클라이언트가 보낸 email 은 신뢰하지 않는다. accessToken 을 Google 에 직접 검증해 verified email 을 얻는다.
    String email;
    try {
        email = verifyGoogleAccessToken(accessToken);
    } catch (Exception e) {
        return ResponseEntity.status(401).body(AuthResponse.builder()
                .message("소셜 인증 검증 실패 — 다시 시도해 주세요.").build());
    }
    ...
}
```
- **이 4줄짜리 주석이 도메인 전체에서 가장 중요한 보안 한 줄**입니다. 프론트가 보낸 `email`을 **절대 안 씁니다**. 오직 프론트가 준 `accessToken`만 받아, 서버가 직접 구글에 물어봅니다.
- 왜? 만약 `email = request.get("email")`로 클라이언트 말을 믿으면, 공격자가 `{accessToken: 내토큰, email: victim@x.com}` 을 보내 **남의 계정으로 로그인**할 수 있습니다(IDOR/계정 탈취). 이게 함정 섹션 **C2**.

```java
// L238-L253
@SuppressWarnings("unchecked")
private String verifyGoogleAccessToken(String accessToken) {
    var headers = new org.springframework.http.HttpHeaders();
    headers.set("Authorization", "Bearer " + accessToken);
    Map<String, Object> info = restTemplate.exchange(
            "https://www.googleapis.com/oauth2/v3/userinfo",
            HttpMethod.GET, new org.springframework.http.HttpEntity<>(headers), Map.class
    ).getBody();
    if (info == null) throw new RuntimeException("Google userinfo 응답 없음");
    Object email = info.get("email");
    if (email == null || String.valueOf(email).isBlank()) throw new RuntimeException("이메일 정보 없음");
    Object verified = info.get("email_verified");
    boolean isVerified = Boolean.TRUE.equals(verified) || "true".equalsIgnoreCase(String.valueOf(verified));
    if (!isVerified) throw new RuntimeException("이메일 미인증 Google 계정");
    return String.valueOf(email);
}
```
- `restTemplate.exchange(...userinfo..., Bearer accessToken)` — 구글의 **공식 userinfo 엔드포인트**에 그 토큰으로 직접 GET. 토큰이 가짜면 구글이 401을 주고 여기서 예외 → 통과 못 함. **이게 "위조 불가"의 근거**.
- `email_verified` 도 확인 — 구글에서 **이메일 인증까지 마친 계정**만 허용(미인증 구글 계정으로 남의 이메일 선점 방지).
- 검증된 email로 `authService.socialLogin(email)` 호출 → 가입돼 있으면 토큰 발급, 없으면 "가입되지 않은 이메일" 예외(소셜은 자동가입 안 함, 깃허브와 차이).

#### A-9. GitHub 로그인 `githubLogin` — `AuthController.java:258-354`
구글과 흐름은 비슷하나 **단계가 더 많습니다**(GitHub는 `code → token → email → profile` 4홉):
1. **code → access_token 교환**(L269-290): 프론트가 받은 `code`를 우리 `client_id/secret`과 함께 GitHub에 보내 access_token으로 교환. (secret은 서버만 보관 → 프론트가 흉내 못 냄.)
2. **인증된 primary 이메일 조회**(L298-321): `/user/emails`에서 `primary && verified`인 이메일 우선, 없으면 `verified`인 것 — **인증된 이메일만** 채택.
3. **프로필 조회**(L323-330): `/user`에서 `login`(=깃허브 username) 확보.
4. **계정 조회 또는 자동 생성**(L332): `authService.findOrCreateGithubUser(email, login, token)` — **구글과 달리 없으면 자동 가입**(B-4 참고).

> 💡 두 소셜의 차이: 구글은 "이미 가입한 사람만 소셜 로그인 허용", 깃허브는 "없으면 만들어줌(개발자 연동 목적)". 같은 OAuth라도 정책이 다를 수 있음을 보여주는 좋은 예.

#### A-10. 로그아웃 `logout` — `AuthController.java:356-366`
```java
// L356-L366
@PostMapping("/logout")
public ResponseEntity<Map<String, String>> logout(HttpServletRequest request) {
    String rawToken = extractCookie(request, REFRESH_COOKIE_NAME);
    if (rawToken != null && !rawToken.isBlank()) {
        refreshTokenRepository.deleteByToken(rawToken);
    }
    return ResponseEntity.ok()
            .header(HttpHeaders.SET_COOKIE, buildClearCookie(AUTH_COOKIE_NAME, "/").toString())
            .header(HttpHeaders.SET_COOKIE, buildClearCookie(REFRESH_COOKIE_NAME, "/api/auth").toString())
            .body(Map.of("message", "로그아웃 되었습니다."));
}
```
- 로그아웃은 **두 가지를 동시에**: ① DB의 refresh 토큰 삭제(서버측 무효화 → 더는 재발급 불가), ② 브라우저 쿠키 2장 삭제(maxAge=0).
- Access(JWT)는 stateless라 서버가 "취소"할 수 없습니다 — 하지만 쿠키를 지우고 1시간 뒤 자연 만료되며, refresh가 죽었으니 갱신도 안 됩니다. 사실상 로그아웃 완료.

#### A-11. 쿠키 추출 유틸 — `AuthController.java:370-378`
```java
// L370-L378
private String extractCookie(HttpServletRequest request, String name) {
    Cookie[] cookies = request.getCookies();
    if (cookies == null) return null;
    return Arrays.stream(cookies)
            .filter(c -> name.equals(c.getName()))
            .map(Cookie::getValue)
            .findFirst()
            .orElse(null);
}
```
- 요청의 쿠키 배열에서 이름이 일치하는 첫 쿠키의 값을 꺼냄. `getCookies()`는 쿠키가 하나도 없으면 **null**을 반환하므로 null 체크 필수(흔한 NPE 함정).

---

### B. `AuthService` — 신원 확인 담당관

#### B-1. 회원가입 `signup` — `AuthService.java:26-59`
```java
// L26-L44
@Transactional
public User signup(SignupRequest request) {
    if (userRepository.findByEmail(request.getEmail()).isPresent()) {
        throw new RuntimeException("이미 사용 중인 이메일입니다.");
    }
    if (userRepository.findByUsername(request.getUsername()).isPresent()) {
        throw new RuntimeException("이미 사용 중인 사용자 이름입니다.");
    }

    User user = User.builder()
            .email(request.getEmail())
            .phone(request.getPhone())
            .username(request.getUsername())
            .password(passwordEncoder.encode(request.getPassword()))   // ★ BCrypt 해싱
            .userType(request.getUserType())
            .birthDate(request.getBirthDate())
            .build();

    User savedUser = userRepository.save(user);
    ...
}
```
- `@Transactional` = 이 메서드 안의 DB 작업을 **하나의 트랜잭션**으로 묶음. 중간에 예외가 나면 전부 롤백(예: 유저 저장 후 프로필 저장 실패 시 유저도 취소).
- **중복 검사**: 이메일·username 둘 다 `unique` 제약이 DB에도 있지만(엔티티 참고), 여기서 미리 검사해 **친절한 한글 메시지**를 줍니다. (DB 제약은 최후의 방어선, 이건 UX 방어선.)
- **`passwordEncoder.encode(...)`** = 평문 비번을 **BCrypt 해시로 변환해 저장**. 이 한 줄이 함정 섹션 **C1**의 핵심 — DB에 절대 평문이 안 들어갑니다.
- 이후(L46-58): `userType == FREE`면 `ClientProfile` 생성, 그리고 Stream Chat에 유저 동기화(실패해도 가입은 진행 — try/catch로 격리).

#### B-2. 로그인 + 레거시 비번 투명 마이그레이션 — `AuthService.java:84-106` ⭐
```java
// L84-L106
@Transactional
public User login(LoginRequest request) {
    User user = userRepository.findByEmail(request.getEmail())
            .orElseThrow(() -> new RuntimeException("가입되지 않은 이메일입니다."));

    String stored = user.getPassword();
    String raw = request.getPassword();
    boolean ok;
    if (stored != null && stored.startsWith("$2")) {
        ok = passwordEncoder.matches(raw, stored);          // BCrypt 해시 비교
    } else {
        // 레거시 평문 비번 — 일치 시 즉시 BCrypt 로 재해싱(투명 마이그레이션)
        ok = stored != null && stored.equals(raw);
        if (ok) {
            user.setPassword(passwordEncoder.encode(raw));
            userRepository.save(user);
        }
    }
    if (!ok) {
        throw new RuntimeException("비밀번호가 일치하지 않습니다.");
    }
    return user;
}
```
- 이 메서드가 **C1 보안 수정의 알맹이**입니다. 두 갈래:
  - **`stored.startsWith("$2")`** → 이미 BCrypt 해시(사전지식 3의 `$2` 접두사) → `passwordEncoder.matches(raw, stored)` 로 안전 비교. (matches는 평문 raw를 같은 솔트로 해싱해 비교 — 평문 비번을 절대 복원하지 않음.)
  - **그 외(레거시 평문)** → 과거에 평문으로 저장된 계정. 평문끼리 비교해 맞으면 **그 자리에서 즉시 BCrypt로 재해싱해 저장**(`encode` 후 `save`). 이걸 **투명 마이그레이션**이라 합니다 — 사용자는 모르는 새, 로그인 성공 순간 그 계정의 비번이 안전한 해시로 업그레이드됩니다.
- **왜 이렇게?** DB에 옛 평문 계정이 섞여 있을 때, 전체를 한 번에 재해싱할 수 없으니(평문을 알아야 해시함) **로그인할 때마다 한 명씩** 점진 전환. 한 번 로그인하면 영원히 해시로 굳습니다.

> ⚠️ 함정: `stored.startsWith("$2")` 판별은 "BCrypt처럼 보이면 해시로 취급"입니다. 만약 어떤 사용자의 **평문 비번이 진짜로 `$2`로 시작**한다면(예: `$2abc`), 레거시 분기를 못 타 로그인 실패할 수 있는 극단 케이스가 있습니다. 실무에선 거의 없지만, 마이그레이션 완료 후 레거시 분기 자체를 제거하는 게 깔끔합니다(고도화).

#### B-3. 소셜 로그인 조회 `socialLogin` — `AuthService.java:113-116`
```java
// L113-L116
public User socialLogin(String email) {
    return userRepository.findByEmail(email)
            .orElseThrow(() -> new RuntimeException("가입되지 않은 이메일입니다."));
}
```
- **단순함이 핵심**: 비밀번호 검증을 건너뛰고(이미 구글이 신원 보증) **이메일로 기존 User만 조회**. 없으면 예외 → 컨트롤러가 "가입 안내"로 처리. (자동가입 안 함 — A-8 정책.)
- `@Transactional`이 없음에 주목: 읽기만 하므로 트랜잭션 없이 단순 조회.

#### B-4. GitHub 계정 조회/생성 `findOrCreateGithubUser` — `AuthService.java:122-168`
```java
// L122-L137
@Transactional
public User findOrCreateGithubUser(String email, String githubLogin, String accessToken) {
    java.time.LocalDateTime now = java.time.LocalDateTime.now();
    byte[] encryptedToken = null;
    if (accessToken != null && !accessToken.isBlank()) {
        try { encryptedToken = crypto.encrypt(accessToken); } catch (Exception ignored) {}
    }
    final byte[] tokenBytes = encryptedToken;

    return userRepository.findByEmail(email)
            .map(existing -> {
                existing.setGithubUsername(githubLogin);
                existing.setGithubConnectedAt(now);
                if (tokenBytes != null) existing.setGithubTokenEncrypted(tokenBytes);
                return userRepository.save(existing);
            })
            .orElseGet(() -> { ... 신규 생성 ... });
}
```
- **GitHub access_token은 평문 저장 금지** → `crypto.encrypt(accessToken)` 로 **AES-GCM 암호화**한 바이트를 저장(`githubTokenEncrypted`). (암호화 서비스는 D-4 참고. CLAUDE.md의 "KIS 자격증명 AES-GCM 암호화"와 같은 원칙.)
- `findByEmail(...).map(기존 갱신).orElseGet(신규 생성)` 패턴: 이메일로 찾으면 **기존 계정에 GitHub 정보만 덧붙임**(이미 일반 가입한 사람이 GitHub 연동), 없으면 새 계정 생성.

```java
// L138-L157 (신규 생성)
.orElseGet(() -> {
    String baseUsername = githubLogin.toLowerCase().replaceAll("[^a-z0-9_]", "_");
    String username = baseUsername;
    int suffix = 2;
    while (userRepository.findByUsername(username).isPresent()) {
        username = baseUsername + suffix++;
    }

    User newUser = User.builder()
            .email(email)
            .username(username)
            .password(passwordEncoder.encode(java.util.UUID.randomUUID().toString()))  // ★ 랜덤 더미 비번
            .phone("00000000000")
            .userType(User.UserType.FREE)
            .githubUsername(githubLogin)
            .githubTokenEncrypted(tokenBytes)
            .githubConnectedAt(now)
            .build();
    ...
});
```
- **username 충돌 회피**: GitHub login을 소문자+안전문자로 정규화하고, 이미 존재하면 `2, 3, 4…` 접미사를 붙여 **유일한 username**을 만듦(`username` 컬럼이 unique라 충돌 시 저장 실패하므로 사전 회피).
- **비번이 없는 계정 처리**: 소셜 가입자는 비번이 없으니 `UUID.randomUUID()`(아무도 모르는 무작위)를 **BCrypt 해싱해 채움**. 이렇게 하면 ① `password` NOT NULL 제약 만족, ② **그 비번으로는 일반 로그인 불가**(아무도 그 UUID를 모름) → 오직 GitHub로만 로그인. 영리한 트릭.

---

### C. `JwtUtil` — 출입증 인쇄기 + 위조 감별기

#### C-1. 비밀키 준비 — `JwtUtil.java:25-38`
```java
// L25-L38
public JwtUtil(
        @Value("${app.jwt.secret:dev-bridge-default-secret-key-change-in-production-please}") String secret,
        @Value("${app.jwt.ttl-hours:1}") long ttlHours
) {
    byte[] bytes = secret.getBytes(StandardCharsets.UTF_8);
    if (bytes.length < 32) {
        // 32바이트 미만이면 패딩 (개발 편의)
        byte[] padded = new byte[32];
        System.arraycopy(bytes, 0, padded, 0, bytes.length);
        bytes = padded;
    }
    this.key = Keys.hmacShaKeyFor(bytes);
    this.ttlMillis = ttlHours * 60 * 60 * 1000L;
}
```
- HS256(HMAC-SHA256)은 **최소 32바이트(256비트) 키**를 요구합니다. 짧으면 라이브러리(JJWT)가 거부하므로, 부족하면 0으로 패딩(개발 편의).
- ⚠️ **운영 주의**: 기본값 `dev-bridge-default-secret-...` 으로 운영하면 **누구나 토큰을 위조**할 수 있습니다(소스에 키가 공개됨). 운영에서는 `JWT_SECRET` 환경변수로 강한 키를 반드시 주입해야 합니다(CLAUDE.md 필수 환경변수).
- `ttlMillis` = 토큰 수명을 밀리초로 환산(시간 × 3,600,000).

#### C-2. 토큰 발행 `issue` — `JwtUtil.java:46-58`
```java
// L46-L58
public String issue(Long userId, String email, String userType) {
    Date now = new Date();
    return Jwts.builder()
            .subject(email)
            .claims(Map.of(
                    "uid", userId,
                    "type", userType
            ))
            .issuedAt(now)
            .expiration(new Date(now.getTime() + ttlMillis))
            .signWith(key)
            .compact();
}
```
- JWT 페이로드(클레임) 구성:
  - `subject(email)` — 표준 클레임 `sub`에 이메일.
  - `uid` — 사용자 PK(이후 `AuthContext`/필터가 이걸 꺼냄). **인증의 핵심 식별자**.
  - `type` — userType(FREE/STANDARD/PREMIUM). 권한·구독 기능 게이트에 활용 가능.
  - `issuedAt`/`expiration` — 발행시각·만료시각(now + 1시간).
- `.signWith(key)` — 비밀키로 **서명**(여기서 위조 불가가 보장됨). `.compact()` — 최종 `a.b.c` 문자열로 직렬화.

> 💡 페이로드는 누구나 읽을 수 있으니(사전지식 1) `uid`, `type` 같은 **민감하지 않은 식별자만** 넣습니다. 비번·전화번호 등은 절대 안 넣습니다.

#### C-3. 토큰 검증 `parse` / `extractUserId` — `JwtUtil.java:61-73`
```java
// L61-L73
public Claims parse(String token) {
    return Jwts.parser()
            .verifyWith(key)
            .build()
            .parseSignedClaims(token)
            .getPayload();
}

public Long extractUserId(String token) {
    Object uid = parse(token).get("uid");
    if (uid instanceof Number n) return n.longValue();
    return null;
}
```
- `verifyWith(key).parseSignedClaims(token)` — **서명 검증 + 만료 검증을 동시에**. 서명이 틀리거나(위조) 만료됐으면 **예외**를 던집니다(이게 보안의 자동 차단막).
- `uid instanceof Number` 체크 이유: JWT를 JSON으로 역직렬화하면 숫자가 `Integer`로 올 수도, `Long`으로 올 수도 있어 `Number`로 받아 `longValue()`로 통일. (Integer로 캐스팅하면 큰 id에서 `ClassCastException` 위험.)

---

### D. `JwtAuthenticationFilter` — 입구 경비원

#### D-1. 필터 등록 + 실행 순서 — `JwtAuthenticationFilter.java:28-37`
```java
// L28-L37
@Component
@Order(Ordered.HIGHEST_PRECEDENCE + 10)   // 반드시 AiRateLimitFilter(+20)보다 먼저 실행
@RequiredArgsConstructor
@Slf4j
public class JwtAuthenticationFilter extends OncePerRequestFilter {

    public static final String ATTR_USER_ID = "auth.userId";
    public static final String ATTR_USER_TYPE = "auth.userType";

    private final JwtUtil jwtUtil;
```
- `OncePerRequestFilter` = **요청 1개당 정확히 한 번** 실행 보장(스프링 내부 forward 등으로 중복 실행 방지).
- `@Order(HIGHEST_PRECEDENCE + 10)` — **반드시 일찍 실행**. 주석대로 `AiRateLimitFilter(+20)`보다 먼저 돌아야, 레이트리밋 필터가 `auth.userId`를 읽을 수 있습니다(유저별 한도 적용). 필터 순서 의존성을 보여주는 좋은 예.
- `ATTR_USER_ID`/`ATTR_USER_TYPE` 상수 = 요청에 도장 찍을 때 쓰는 키(이름). `AuthContext`가 같은 키로 꺼냅니다.

#### D-2. 핵심 — 토큰 검증 후 요청에 도장 — `JwtAuthenticationFilter.java:39-60`
```java
// L39-L60
@Override
protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
        throws ServletException, IOException {
    String token = extractToken(request);
    if (token != null && !token.isBlank()) {
        try {
            var claims = jwtUtil.parse(token);
            Object uid = claims.get("uid");
            Object type = claims.get("type");
            if (uid instanceof Number n) {
                request.setAttribute(ATTR_USER_ID, n.longValue());
            }
            if (type != null) {
                request.setAttribute(ATTR_USER_TYPE, type.toString());
            }
        } catch (Exception e) {
            // 토큰 파싱 실패: 익명 요청으로 통과
            log.debug("JWT parse failed: {}", e.getMessage());
        }
    }
    chain.doFilter(request, response);
}
```
- 흐름: 토큰 추출 → `parse`(검증) → 성공하면 `request.setAttribute(ATTR_USER_ID, uid)` 로 **요청에 도장**. 이게 (B) 흐름도의 "도장 찍기".
- **실패해도 막지 않음**(catch 후 그냥 통과): 토큰이 없거나 깨졌으면 **익명 요청**으로 처리. 차단은 컨트롤러가 `AuthContext.currentUserId() == null` 검사로 합니다(이 프로젝트 경량 인증 철학).
- `chain.doFilter(...)` — 다음 필터/컨트롤러로 요청 전달(필터 체인 진행).

#### D-3. 토큰 추출 우선순위 — `JwtAuthenticationFilter.java:62-79`
```java
// L62-L79
private String extractToken(HttpServletRequest request) {
    // 1순위: HttpOnly 쿠키
    Cookie[] cookies = request.getCookies();
    if (cookies != null) {
        for (Cookie c : cookies) {
            if (AuthController.AUTH_COOKIE_NAME.equals(c.getName())) {
                String v = c.getValue();
                if (v != null && !v.isBlank()) return v.trim();
            }
        }
    }
    // 2순위: Authorization 헤더 (레거시 호환)
    String header = request.getHeader("Authorization");
    if (header != null && header.startsWith("Bearer ")) {
        return header.substring(7).trim();
    }
    return null;
}
```
- **1순위: HttpOnly 쿠키 `DEVBRIDGE_TOKEN`**(새 표준, XSS 안전). `AuthController.AUTH_COOKIE_NAME` 상수를 참조 — A-1의 "이름 공유"가 여기서 작동.
- **2순위: `Authorization: Bearer <token>` 헤더**(레거시 호환). 옛 클라이언트나 외부 API 호출이 헤더 방식을 쓸 수 있어 둘 다 지원. `substring(7)` = `"Bearer "`(7글자) 잘라내기.

#### D-4. (연관) `AesGcmCryptoService` — GitHub 토큰 암호화 — `AesGcmCryptoService.java`
- GitHub PAT/access_token 같은 민감값을 DB 저장 전 **AES-GCM**으로 암호화(`encrypt` → `[12B IV][암호문+태그]`).
- 키 출처: `app.crypto.key`(없으면 `app.jwt.secret`의 SHA-256 폴백, L42-49). **운영에서는 별도 키 권장**(주석 명시).
- `encrypt`(L51-63): 매번 **무작위 IV 12바이트** 생성 → 같은 평문도 매번 다른 암호문(보안). GCM은 인증태그(128bit)로 **변조 탐지**까지 제공.

---

### E. `AuthContext` — "지금 누구?" 판독기

#### E-1. 현재 사용자 ID 조회 — `AuthContext.java:27-47`
```java
// L27-L47
public static Long currentUserId() {
    Long override = OVERRIDE_USER_ID.get();
    if (override != null) return override;
    HttpServletRequest req = currentRequest();
    if (req == null) return null;
    Object v = req.getAttribute(JwtAuthenticationFilter.ATTR_USER_ID);
    return v instanceof Long ? (Long) v : null;
}
...
public static Long requireUserId() {
    Long id = currentUserId();
    if (id == null) throw new RuntimeException("인증이 필요합니다.");
    return id;
}
```
- 컨트롤러가 `AuthContext.currentUserId()` 한 줄로 **현재 요청의 주인**을 얻습니다 — 내부적으로는 필터가 찍은 `request`의 `auth.userId` 속성을 꺼내는 것(D-2와 짝).
- `RequestContextHolder`로 현재 스레드의 요청을 가져옵니다(컨트롤러 인자로 `HttpServletRequest`를 안 받아도 어디서나 접근 가능 → 코드 간결).
- `OVERRIDE_USER_ID`(ThreadLocal): **HTTP 요청이 없는 백그라운드 잡**(스케줄러 등)에서 임시로 "이 작업은 N번 유저로 친다"를 주입하는 용도. `set` 후 반드시 `finally`에서 `clear()`(ThreadLocal 누수 방지 — 함정).
- `requireUserId()` = null이면 **예외**(반드시 로그인 필요한 곳용). 반면 `currentUserId()` = null 허용(직접 401 분기하고 싶을 때). 컨트롤러들이 둘 중 골라 씁니다.

> 💡 보안 교훈: 컨트롤러는 **절대 클라이언트가 보낸 userId를 신뢰하지 않고**, 오직 `AuthContext`(=서버가 검증한 JWT)에서만 신원을 얻습니다. 최근 커밋 `NotificationController IDOR 차단`이 바로 이 원칙(신원은 JWT에서만)을 적용한 사례입니다.

---

### F. 엔티티 — DB로 굳는 데이터

#### F-1. `User` — 회원 1명 = `USERS` 한 행 — `User.java`
```java
// L13-L41
@Entity
@Table(name = "USERS")
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
@EntityListeners(AuditingEntityListener.class)
public class User {

    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, unique = true, length = 100)
    private String email;

    @Column(nullable = false, length = 20)
    private String phone;

    @Column(nullable = false, unique = true, length = 50)
    private String username;

    @Column(nullable = false, length = 255)
    private String password;       // ★ BCrypt 해시 저장 (평문 금지)

    @Convert(converter = UserTypeConverter.class)
    @Column(name = "user_type", nullable = false)
    private UserType userType;
```
- `@Entity @Table(name="USERS")` = 이 클래스 1개 = DB `USERS` 테이블, 인스턴스 1개 = 한 행.
- `@Id @GeneratedValue(IDENTITY)` = PK `id`를 DB가 auto-increment로 생성. 이 `id`가 JWT의 `uid`가 됩니다.
- `email`/`username`에 **`unique = true`** = DB 차원의 중복 금지(AuthService 사전검사의 최종 방어선).
- `password length=255` = BCrypt 해시(약 60자)가 들어가도 넉넉. **여기 절대 평문 안 들어감**(C1).
- `@EntityListeners(AuditingEntityListener.class)` + `@CreatedDate`/`@UpdateTimestamp`(L86-92) = 생성·수정 시각 자동 기록.

```java
// L78-L84 (GitHub 연동 필드)
@Column(name = "github_token_encrypted", columnDefinition = "VARBINARY(512)")
private byte[] githubTokenEncrypted;     // ★ AES-GCM 암호화 바이트 (평문 노출 금지)
```
- GitHub 토큰은 `byte[]`(VARBINARY)로 **암호화된 형태**만 저장(D-4와 짝). 주석이 "절대 평문 노출 금지"를 못 박음.

```java
// L94-L110 (UserType + 역방향 호환)
public enum UserType {
    FREE, STANDARD, PREMIUM;

    @JsonCreator
    public static UserType fromJson(String value) {
        if (value == null) return null;
        return switch (value.toUpperCase()) {
            case "CLIENT", "USER", "FREE" -> FREE;
            case "PARTNER", "PRO", "STANDARD" -> STANDARD;
            case "PREMIUM" -> PREMIUM;
            default -> FREE;
        };
    }
}
```
- `UserType`은 구독 등급(FREE/STANDARD/PREMIUM). `@JsonCreator fromJson` = 프론트가 **옛 값**(`CLIENT`/`PARTNER`/`PRO` 등)을 보내도 새 enum으로 매핑(요청 역직렬화 시).
- 짝으로 `UserTypeConverter`(`UserTypeConverter.java`)가 **DB 읽기/쓰기**를 담당: DB의 옛 값(`CLIENT`/`PARTNER`…)도 새 enum으로 읽고, 저장은 항상 새 값으로. (CLAUDE.md "구 값 역방향 호환"의 실체.)

> 💡 왜 이 호환 장치가 두 개(`@JsonCreator` + `Converter`)나 있나? **두 경계가 다르기 때문**: `@JsonCreator`는 "HTTP JSON ↔ Java" 경계, `Converter`는 "Java ↔ DB" 경계. 옛 데이터·옛 클라이언트가 양쪽에 다 있을 수 있어 두 군데를 모두 막은 것.

#### F-2. `RefreshToken` — 재발급 쿠폰 — `RefreshToken.java`
```java
// L8-L40
@Entity
@Table(name = "refresh_tokens", indexes = {
        @Index(name = "idx_rt_user_id", columnList = "user_id"),
        @Index(name = "idx_rt_expires_at", columnList = "expires_at")
})
@Getter @NoArgsConstructor(access = AccessLevel.PROTECTED)
public class RefreshToken {

    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "user_id", nullable = false)
    private Long userId;

    @Column(nullable = false, unique = true, length = 64)
    private String token;

    @Column(name = "expires_at", nullable = false)
    private Instant expiresAt;
    ...
    public static RefreshToken of(Long userId, String token, long ttlDays) {
        RefreshToken rt = new RefreshToken();
        rt.userId = userId;
        rt.token = token;
        rt.expiresAt = Instant.now().plusSeconds(ttlDays * 86400L);
        rt.createdAt = Instant.now();
        return rt;
    }

    public boolean isExpired() {
        return Instant.now().isAfter(expiresAt);
    }
}
```
- `token unique` = 같은 토큰 문자열 중복 금지. `@Index(user_id, expires_at)` = 사용자별 조회·만료 청소를 빠르게(DB 인덱스).
- `@NoArgsConstructor(access = PROTECTED)` + 정적 팩토리 `of(...)` = **외부에서 `new` 막고** 항상 `of`로만 생성하게 강제(유효한 상태로만 만들어지도록). `isExpired()`는 A-7의 refresh 검증에서 쓰입니다.
- ⚠️ 이 엔티티 테이블은 마이그레이션 `V18__refresh_tokens_table.sql`로 생성됩니다(함정 섹션 참고).

---

### G. 부가 컨트롤러·서비스 (조회·프로필·은행·이메일)

- **`UserController`**(`/api/users`): 채팅 기능용 **공개 조회**. `searchByUsername`·`findByEmail`·`findById`는 **id/username/userType/프로필이미지만** 반환하고 **email·개인정보는 절대 안 줌**(주석 명시 "never returns email"). `/me/github-username` GET/PATCH는 `AuthContext`로 본인만 자기 GitHub username 조회·수정.
- **`ProfileController`/`ProfileService`**(`/api/profile`): 프로필 상세 저장(`PUT /me/detail`)·조회(`GET /me/detail`, public `GET /{username}/detail`)·기본정보 수정(`PUT /me/basic`)·초기화(`POST /me/reset`). `POST /admin/reset/{username}`는 **`local` 프로파일에서만** 동작(L78-86에서 활성 프로파일 검사 후 아니면 403) — 운영에서 자동 차단되는 dev 전용 안전장치.
- **`BankVerificationController`/`Service`**(`/api/bank`): 계좌 인증. `send-code`가 **3자리 코드**를 생성해 이메일 발송(시연용이라 응답 본문에도 `mockCode` 노출), `verify-code`가 검증 후 계좌정보 저장. 핵심은 `verifyAndSave`(L84-123)의 **`codeStore.compute(...)`** — 동시 요청 레이스를 락 안에서 막고, 만료/시도초과(최대 5회)/1회용 폐기를 한 번에 처리. 코드는 메모리(`ConcurrentHashMap`)에 저장 → 재기동 시 휘발(시연 범위).
- **`EmailVerificationController`/`Service`**(`/api/verify`): 회원가입 전 이메일 본인확인. `send-code`가 **6자리 코드** 발송, `check-code`가 검증(일치 시 1회용 제거). 마찬가지로 메모리 저장·휘발.

> 💡 공통 패턴: bank/email 인증 모두 **외부 본인확인 서비스 대신 "코드 메일 발송 → 입력 대조"** 라는 목업/시연 방식입니다. 운영 전환 시 ① 코드 저장을 Redis로(다중 인스턴스·재기동 대비), ② `mockCode` 응답 제거, ③ 실제 본인확인 API 연동이 필요합니다(고도화).

---

## ⚠️ 함정·보안 주의

| # | 항목 | 무엇이 위험했나 / 어떻게 막았나 |
|---|---|---|
| **C1** | **BCrypt 레거시 재해싱** | 과거 평문 비번 저장 → DB 유출 시 전원 비번 노출. `AuthService.login`(B-2)이 `$2` 접두사로 해시/평문을 구분하고, **평문은 로그인 성공 순간 즉시 BCrypt로 재해싱**(투명 마이그레이션). 신규 가입은 처음부터 `passwordEncoder.encode`(B-1). |
| **C2** | **소셜 accessToken 서버검증** | 프론트가 보낸 `email`을 믿으면 `{내토큰, 남의email}`로 **계정 탈취**. `socialLogin`(A-8)은 클라 email을 **버리고**, `verifyGoogleAccessToken`으로 **구글 userinfo에 직접 검증**해 verified email만 사용. GitHub도 `/user/emails`에서 `verified` 이메일만 채택. |
| 3 | **쿠키 Secure/SameSite** | `cookieSecure:false` 기본값으로 운영하면 평문 HTTP로 쿠키 전송 가능. **운영에서 `app.cookie.secure=true`** 필수. `SameSite=Lax`로 CSRF 기본 방어. |
| 4 | **Refresh 쿠키 path 격리** | Refresh를 `path=/`로 깔면 모든 요청에 노출. `path=/api/auth`로 묶어 **갱신 엔드포인트에서만** 전송(A-3) → 탈취 표면 최소화. |
| 5 | **refresh_tokens 마이그레이션** | main이 RefreshToken 엔티티를 추가했으나 Flyway 마이그레이션이 없어, `ddl-auto=validate`인 운영 부팅이 **Hibernate validate에서 실패**. `V18__refresh_tokens_table.sql`(`CREATE TABLE IF NOT EXISTS`, 멱등)로 보강. |
| 6 | **JWT secret 기본값** | `JwtUtil`의 기본 secret으로 운영하면 **누구나 토큰 위조**. `JWT_SECRET` 환경변수로 강한 키 주입 필수(C-1). |
| 7 | **신원은 JWT에서만** | 컨트롤러가 클라이언트 userId를 믿으면 IDOR. 항상 `AuthContext.currentUserId()`(서버 검증값)만 사용(E-1). 최근 `NotificationController IDOR 차단` 커밋이 같은 원칙. |
| 8 | **`$2` 평문 오탐** | 평문 비번이 우연히 `$2`로 시작하면 레거시 분기를 못 타 로그인 실패(B-2 함정). 마이그레이션 완료 후 레거시 분기 제거 권장. |
| 9 | **GitHub 토큰 평문 금지** | access_token은 `AesGcmCryptoService.encrypt`로 암호화 후 `byte[]` 저장(B-4·F-1). 키는 운영에서 `app.crypto.key` 별도 발급. |
| 10 | **인증코드 휘발/노출** | bank·email 코드가 메모리(`ConcurrentHashMap`)라 다중 인스턴스/재기동에 취약. bank `mockCode`는 시연용 응답 노출 — 운영 전 Redis 이전 + 응답 제거 필요. |

---

## 🚀 고도화 아이디어

- **Refresh 토큰 회전(rotation)**: 현재는 갱신 시 Access만 새로 발급하고 Refresh는 15일 고정 재사용(A-7). 갱신할 때마다 **새 Refresh로 교체 + 옛 것 폐기**하면, 탈취된 옛 Refresh를 즉시 무력화하고 **재사용 탐지**(한 번 쓴 토큰이 또 오면 탈취 의심 → 전 세션 강제 로그아웃)가 가능.
- **레거시 평문 분기 제거**: B-2의 `else` 분기는 마이그레이션이 끝나면 불필요 + C8 오탐 위험. 전수 전환 확인 후 삭제해 코드 단순화.
- **로그아웃 = 전 기기 / 단일 기기 선택**: 현재는 제시한 Refresh 1개만 삭제. `deleteByUserId`(이미 리포지토리에 존재)로 "모든 기기 로그아웃" 옵션 추가 가능.
- **권한(Role) 기반 인가**: 지금은 `type` 클레임만 담고 컨트롤러별 검사. 메서드 단위 `@PreAuthorize` 류로 선언적 인가를 도입(풀 Spring Security 재활성 검토)하면 일관성↑.
- **인증코드 저장 Redis 이전**: bank/email 코드를 Redis TTL 키로 옮기면 다중 인스턴스·재기동에도 안전하고 만료 자동화. `mockCode` 응답 제거.
- **rate limit on auth**: login/social/verify에 IP·계정별 시도 제한(브루트포스 방어). AiRateLimitFilter처럼 Bucket4j 활용.
- **이메일 인증 ↔ 가입 강결합**: 현재 `/api/verify`는 가입과 분리. 가입 시 "인증 완료 토큰"을 요구하도록 묶으면 가짜 이메일 가입 차단.
- **소셜 신규 자동가입 정책 통일**: 구글은 미가입 시 거부, 깃허브는 자동생성(A-8 vs A-9). 제품 정책에 맞게 통일/명문화.

---

## 📚 용어 사전 (이 도메인 한정)

| 용어 | 뜻 |
|---|---|
| **JWT** | `헤더.페이로드.서명` 문자열 토큰. 서명으로 위조 방지, 페이로드는 누구나 읽힘(암호화 아님) |
| **HS256** | HMAC-SHA256. 발행·검증에 같은 비밀키를 쓰는 대칭 서명 |
| **Access Token** | 짧은 수명(1h) JWT. 매 요청 제시. 탈취돼도 곧 만료 |
| **Refresh Token** | 긴 수명(15d) 무작위 문자열. DB 저장. Access 만료 시 새 Access 발급용. DB에서 지워 무효화 |
| **HttpOnly 쿠키** | JS가 못 읽는 쿠키. XSS 토큰 탈취 방어 |
| **Secure / SameSite** | Secure=HTTPS에서만 전송, SameSite=교차사이트 동봉 제한(CSRF 방어) |
| **BCrypt** | 솔트+느린 단방향 해싱. `$2`로 시작. 비번 평문 저장 대체 |
| **PasswordEncoder.matches** | 평문을 같은 솔트로 해싱해 저장 해시와 비교(평문 복원 없음) |
| **OAuth access_token** | 구글·깃허브가 발급한 임시 출입증. 서버가 직접 검증해야 신뢰 |
| **투명 마이그레이션** | 사용자 모르게(로그인 시) 평문→해시로 점진 업그레이드 |
| **AES-GCM** | 대칭 암호화 + 변조탐지. GitHub 토큰 등 민감값 DB 저장용 |
| **OncePerRequestFilter** | 요청당 정확히 1회 실행되는 스프링 필터 베이스 |
| **request attribute** | 한 요청 동안만 유효한 키-값 저장소. 필터→컨트롤러로 userId 전달 통로 |
| **ThreadLocal** | 스레드별 독립 저장소. AuthContext가 백그라운드 잡용 userId 주입에 사용(누수 주의) |
| **`@Value("${k:기본값}")`** | properties/환경변수에서 설정 주입(콜론 뒤가 기본값) |
| **`@Transactional`** | 메서드 내 DB 작업을 한 트랜잭션으로 묶음(예외 시 롤백) |
| **정적 팩토리(`of`)** | `new` 대신 검증된 상태로만 객체 생성하게 하는 패턴(RefreshToken.of) |
