# `global/` — 앱 전체에 깔리는 공통 인프라 (보안·설정·필터·시드·유틸·터미널) 완전 해설

> 원본: `backend/src/main/java/com/DevBridge/devbridge/global/` (15개 `.java`)
> 형식 표준: README "3. 공통 형식" + 모범 예시 `01_backtest/vbt_engine.md`.
> Spring 기초(빈·DI·어노테이션)는 이 문서 안에서도 그때그때 짧게 다시 풀어 설명합니다. 완전 초보자 기준.

---

## 📌 이 영역 한눈에

`domain/` 폴더들(user·strategy·ai·payment…)이 **"각 부서"** 라면, `global/` 은 **"건물 전체에 공통으로 깔린 인프라"** 입니다. 어느 부서를 가든 똑같이 통과해야 하는 **정문 검문소(보안), 전기·수도 배선(설정), 청소·초기 비품 세팅(시드 데이터)** 같은 것들이죠.

비유로 보면:

```
손님(HTTP 요청)이 건물에 들어옴
        │
   ┌────▼─────────────────────────────────────────┐
   │  1층 정문 검문소 = security/                    │
   │   - 신분증(JWT 쿠키) 확인 → 누구인지 명찰 부착   │ JwtAuthenticationFilter
   │   - 금고 열쇠 암호화                            │ AesGcmCryptoService
   ├────▼─────────────────────────────────────────┤
   │  통행량 제한 게이트 = config/AiRateLimitFilter   │ 비싼 AI 방은 시간당 N명만
   ├────▼─────────────────────────────────────────┤
   │  각 부서(controller) 로 안내                     │
   └───────────────────────────────────────────────┘

건물을 처음 열 때(앱 기동):
   seed/  = 초기 비품·샘플 데이터를 미리 채워둠 (이미 있으면 건너뜀=멱등)
   config/ = CORS·비밀번호 해시기·Stream 채팅·Jackson 브릿지 같은 배선 설치
   util/  = 자주 쓰는 변환 도구(EnumMapper)
   terminal/ = (로컬 개발 전용) 웹에서 셸을 여는 콘센트
```

### 핵심 클래스 역할표

| 폴더 | 클래스 | 한 줄 역할 | 비유 |
|---|---|---|---|
| `security` | **JwtUtil** | JWT 토큰 발행/검증 (HS256) | 명찰을 만들고, 위조 명찰을 가려내는 기계 |
| `security` | **JwtAuthenticationFilter** | 모든 요청에서 토큰 꺼내 검증 → `request.attribute` 에 userId 부착 | 정문에서 신분증 확인 후 손목밴드 채움 |
| `security` | **AuthContext** | 컨트롤러/서비스에서 "지금 누구?" 를 꺼내는 헬퍼 | 손목밴드를 읽어주는 리더기 |
| `security` | **AesGcmCryptoService** | 민감 토큰(GitHub PAT 등)을 DB 저장 전 AES-GCM 암호화 | 귀중품 금고 |
| `config` | **AiRateLimitFilter** | 비싼 AI 엔드포인트 사용자당 시간당 20회 제한 (Bucket4j) | 놀이기구 1시간 N회 손목티켓 |
| `config` | **PasswordConfig** | BCrypt `PasswordEncoder` 빈 1개 제공 | 비밀번호 일방향 분쇄기 |
| `config` | **WebConfig** | 전역 CORS 규칙 + 업로드 파일 정적 서빙 | 외부 출입 허가 명단 + 자료실 공개 선반 |
| `config` | **StreamChatConfig** | Stream Chat SDK 초기화(키/시크릿 주입) | 외부 채팅 업체 계정 연결 |
| `config` | **Jackson2NodeBridgeConfig** | Boot4(Jackson3) 환경에서 옛 Jackson2 `JsonNode` 직렬화 깨짐 수술 | 구형 플러그를 신형 콘센트에 꽂는 어댑터 |
| `seed` | **DataSeeder** | 기동 시 mock JSON → DB 적재 + 데이터 마이그레이션/정리 오케스트레이션 | 개관 전 매장 진열·재고 정리 |
| `seed` | **DataCleanupService** | "완전한" 프로젝트/클라이언트 50개만 남기고 정리 | 불량 진열 상품 솎아내기 |
| `seed` | **AiModelCatalogSeeder** | AI 모델 카탈로그(Gemini/Claude/GPT) 6종 시드 | 메뉴판 초기 등록 |
| `util` | **EnumMapper** | JSON 소문자 문자열 → 백엔드 UPPERCASE enum 변환 | 외국어 메뉴를 우리 코드로 번역 |
| `terminal` | **TerminalWebSocketHandler** | (로컬·loopback 전용) WS 로 셸 프로세스 stdin/stdout 중계 | 개발용 콘센트(외부엔 차단) |
| `terminal` | **TerminalWebSocketConfig** | `app.terminal.enabled=true` 일 때만 `/ws/terminal` 등록 | 콘센트 차단기 스위치 |

> **누가 이걸 쓰나?** → 거의 모든 도메인. 예) `user` 의 로그인은 `JwtUtil` 로 토큰을 만들고, `strategy` 의 컨트롤러는 `AuthContext.requireUserId()` 로 "지금 로그인한 사람"을 알아냅니다. AI 채팅은 `AiRateLimitFilter` 를 통과해야만 LLM 을 호출합니다.

---

## 🧠 사전 지식 (이거 모르면 막힘)

#### 1) 빈(Bean)·DI·`@Component`/`@Configuration`/`@Bean`
- **빈(Bean)** = Spring 이 직접 만들어 보관하는 "재사용 객체". 우리가 `new` 하지 않고 Spring 이 만들어서 필요한 곳에 끼워줍니다(= **의존성 주입, DI**).
- `@Component` / `@Service` 를 클래스에 붙이면 "이 클래스를 빈으로 등록해" 라는 뜻. (`@Service` 는 의미만 다른 `@Component`.)
- `@Configuration` 클래스 안의 `@Bean` 메서드는 "이 메서드 반환값을 빈으로 등록해". → `PasswordConfig` 가 이 방식.
- `@RequiredArgsConstructor`(Lombok) = `final` 필드를 받는 생성자를 자동 생성 → 생성자 DI 를 짧게.

#### 2) 서블릿 필터(Servlet Filter) = "컨트롤러 도착 전에 모든 요청이 거치는 관문"
```
요청 → [필터1] → [필터2] → ... → DispatcherServlet → @Controller
```
- 필터는 요청을 **가로채서** 통과시키거나(`chain.doFilter(...)`) 막을 수 있습니다(응답 직접 작성).
- `OncePerRequestFilter` = "한 요청에 딱 한 번만 실행"을 보장하는 Spring 의 필터 베이스 클래스. (포워딩 등으로 중복 실행되는 걸 막아줌.)
- **핵심**: 필터는 컨트롤러보다 **먼저** 돕니다. 그래서 인증·레이트리밋 같은 "공통 사전 검사"에 딱입니다.

#### 3) 필터 순서 `@Order` — 숫자가 작을수록 먼저
- 필터가 여러 개면 어느 게 먼저 도는지가 중요합니다. `@Order(낮은 수)` 가 먼저.
- `Ordered.HIGHEST_PRECEDENCE` = 가장 높은 우선순위(아주 작은 음수). 거기에 `+10`, `+20` 을 더해 **상대 순서**를 만듭니다.
- 이 프로젝트:
  - `JwtAuthenticationFilter` = `HIGHEST_PRECEDENCE + 10` → **먼저**
  - `AiRateLimitFilter` = `HIGHEST_PRECEDENCE + 20` → **나중**
  - 왜 이 순서가 목숨인지는 아래 "M10 함정"에서 다룹니다.

#### 4) `request attribute` vs `RequestContextHolder`
- **request attribute** = 요청 객체에 임시로 붙이는 메모쪽지(`request.setAttribute("키", 값)` / `getAttribute("키")`). 그 요청이 끝나면 사라짐.
- **RequestContextHolder** = "지금 이 스레드가 처리 중인 요청"을 어디서나 꺼내게 해주는 Spring 의 전역 보관함. **단, DispatcherServlet 이 채워줍니다.** → 필터 단계(디스패처 진입 전)에선 아직 비어 있을 수 있음. (이게 M10 버그의 뿌리.)

#### 5) CORS = "브라우저가 다른 출처(origin) 호출을 막는 규칙"
- 프론트(`http://localhost:5173`)가 백엔드(`http://localhost:8080`)를 부르면 **출처가 다릅니다(포트 다름)**. 브라우저는 기본적으로 이걸 막습니다.
- 서버가 "이 출처는 허용한다(`Access-Control-Allow-Origin`)" 고 응답 헤더로 알려줘야 통과. `WebConfig.addCorsMappings` 가 그 허용 목록.
- `allowCredentials(true)` = 쿠키를 실어 보내는 걸 허용(우리는 JWT 를 쿠키로 보냄). **이때 `allowedOrigins` 에 `*` 를 쓰면 안 됨**(브라우저가 거부). 그래서 명시적 출처 목록을 씁니다.

#### 6) 시더(Seeder) 멱등(idempotent) = "여러 번 돌려도 결과가 같다"
- 앱은 켤 때마다 시더가 돕니다. 만약 매번 또 넣으면 **데이터가 N배로 중복**됩니다.
- 그래서 시더는 보통 `if (repository.count() > 0) return;` 으로 **이미 있으면 건너뜀**. 이게 멱등의 핵심 패턴.

#### 7) `@Profile("!prod")` = "운영 환경이 아닐 때만 이 빈 활성화"
- 스프링 프로필(`local`/`prod`)에 따라 빈을 켜고 끕니다. `!prod` = "prod 가 아닐 때". → mock 시드는 운영 DB 를 더럽히면 안 되니 운영에선 끔.

#### 8) AES-GCM·BCrypt — 두 종류의 "지키기"는 다르다
- **암호화(AES-GCM)** = 잠갔다 **다시 풀 수 있음**(양방향). 외부 API 키처럼 "나중에 원본이 필요한" 비밀에 씀.
- **해싱(BCrypt)** = 분쇄해서 **되돌릴 수 없음**(단방향). 비밀번호처럼 "맞는지 비교만 하면 되는" 비밀에 씀. (로그인 시 입력값을 같은 방식으로 분쇄해 저장본과 대조.)

---

## 🗺 요청 흐름도

```
                       HTTP 요청 (브라우저에서 옴, 쿠키 DEVBRIDGE_TOKEN 동봉)
                                    │
        ┌───────────────────────────▼────────────────────────────┐
        │ 서블릿 필터 체인 (컨트롤러 도착 전, @Order 순서대로)         │
        │                                                          │
        │  ① JwtAuthenticationFilter   @Order(HIGHEST + 10)         │
        │     - 쿠키 DEVBRIDGE_TOKEN (1순위) / Bearer 헤더(2순위) 추출 │
        │     - JwtUtil.parse() 로 검증                              │
        │     - 성공 → request.setAttribute("auth.userId", 12)       │ ◀── 명찰 부착
        │     - 실패/없음 → 그냥 통과 (익명, attribute 안 채움)        │
        │                  │                                        │
        │                  ▼                                        │
        │  ② AiRateLimitFilter        @Order(HIGHEST + 20)          │
        │     - shouldNotFilter(): POST + /chat·/formalize·…만 대상   │
        │     - request.getAttribute("auth.userId") 로 신원 직독 ★     │ ◀── ①이 채운 명찰을 읽음
        │     - 사용자별 Bucket 토큰 1개 소비 → 없으면 429 즉시 응답    │
        │                  │ (통과 시)                               │
        └──────────────────▼──────────────────────────────────────┘
                           ▼
                   DispatcherServlet  ← 여기서 RequestContextHolder 채워짐
                           ▼
                     @Controller / @Service
                           │
                  AuthContext.requireUserId()  ← RequestContextHolder→request attribute 읽음
                           ▼
                   비즈니스 로직 실행 → 응답
                           │
                   (analytics 프록시면) Jackson2NodeBridge 가 JsonNode 를 올바른 JSON 으로 직렬화

  ───────────────────────────────────────────────────────────────────────
  앱 기동(1회):  CommandLineRunner 들이 순서대로 실행
     AiModelCatalogSeeder(@Order 100) · DataSeeder(@Profile !prod)
        → seedXxx() 들 (count>0 이면 skip) → 마이그레이션 → DataCleanupService 정리
```

> ★ 표시 줄(`request.getAttribute` 직독)이 이 문서에서 가장 중요한 지점입니다. **왜 `AuthContext` 를 안 쓰고 attribute 를 직접 읽는가** → M10 함정에서 상세히.

---

## 📖 핵심 클래스 라인별 심화

### A. `JwtUtil` — 명찰(토큰) 발급기/검증기 (`security/JwtUtil.java`)

#### 키 준비 — `JwtUtil.java:25-38`
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
- `@Value("${app.jwt.secret:기본값}")` — 설정파일/환경변수의 `app.jwt.secret` 값을 주입. `:` 뒤는 **없을 때 쓸 기본값**. (이 기본값은 개발용이며 운영에선 반드시 환경변수로 덮어써야 함 — 문자열에도 "change-in-production"이라 박혀 있음.)
- **HS256(HMAC-SHA256)** 은 대칭키 서명 → 키가 최소 32바이트여야 함. 그래서 짧으면 0으로 패딩해 길이를 맞춥니다. (편의 기능이지만, 진짜 짧은 비밀키는 보안상 약하니 운영에선 충분히 긴 비밀키를 줘야 함.)
- `ttlMillis` — 토큰 유효시간(밀리초). 기본 1시간(`ttl-hours:1`).

> 💡 초보 포인트: **대칭키(HS256)** = 같은 비밀키로 서명도 하고 검증도 함. 그래서 이 비밀키가 새면 누구나 위조 토큰을 만들 수 있음 → `JWT_SECRET` 은 1급 비밀.

#### 토큰 발행 `issue()` — `JwtUtil.java:46-58`
```java
// L46-L58
public String issue(Long userId, String email, String userType) {
    Date now = new Date();
    return Jwts.builder()
            .subject(email)
            .claims(Map.of("uid", userId, "type", userType))
            .issuedAt(now)
            .expiration(new Date(now.getTime() + ttlMillis))
            .signWith(key)
            .compact();
}
```
- JWT 는 `헤더.페이로드.서명` 3토막의 문자열. 여기서 페이로드에 **claims(주장)** 를 담습니다:
  - `subject(email)` = 표준 필드 `sub` 에 이메일.
  - `uid` = users.id(PK) ← **이게 가장 중요**. 나중에 필터/AuthContext 가 이 값으로 "누구"를 식별.
  - `type` = "FREE"/"STANDARD"/"PREMIUM" 같은 등급(주석엔 PARTNER/CLIENT/ADMIN 으로 적혀 있으나, 실제 값은 호출부가 정함).
- `signWith(key)` = 위 비밀키로 서명 → 내용을 바꾸면 서명이 깨져 위조가 탄로남.
- `.compact()` = 최종 문자열로 직렬화.

> ⚠️ 주의: JWT 의 페이로드는 **암호화가 아니라 인코딩**(Base64url)일 뿐입니다. 누구나 디코드해 내용을 볼 수 있어요. "위조 방지(서명)"는 되지만 "비밀 유지"는 안 됨 → 민감정보(비밀번호 등)를 claims 에 넣지 말 것.

#### 검증 `parse()` / 추출 — `JwtUtil.java:61-73`
```java
// L61-L73
public Claims parse(String token) {
    return Jwts.parser().verifyWith(key).build()
            .parseSignedClaims(token).getPayload();
}
public Long extractUserId(String token) {
    Object uid = parse(token).get("uid");
    if (uid instanceof Number n) return n.longValue();
    return null;
}
```
- `verifyWith(key)` → 서명·만료 검증. 위조거나 만료면 **예외**가 터집니다(그래서 호출부가 try/catch 로 감쌈).
- `extractUserId` — claims 의 `uid` 를 꺼냄. JWT 안 숫자는 보통 `Integer`/`Long` 으로 역직렬화되므로 `Number` 로 받아 `longValue()` 로 통일. (이 "Number 로 받아 longValue" 패턴이 필터·AuthContext 에서 반복됩니다.)

---

### B. `JwtAuthenticationFilter` — 정문 검문소 (`security/JwtAuthenticationFilter.java`)

#### 클래스 선언 + 필터 순서 — `JwtAuthenticationFilter.java:28-37`
```java
// L28-L37
@Component
@Order(Ordered.HIGHEST_PRECEDENCE + 10)   // 반드시 AiRateLimitFilter(+20)보다 먼저 실행 — 그래야 요청 attribute(userId)가 채워진다
@RequiredArgsConstructor
@Slf4j
public class JwtAuthenticationFilter extends OncePerRequestFilter {
    public static final String ATTR_USER_ID = "auth.userId";
    public static final String ATTR_USER_TYPE = "auth.userType";
    private final JwtUtil jwtUtil;
```
- `@Component` → 빈 등록(Boot 가 자동으로 필터 체인에 끼워줌). `extends OncePerRequestFilter` → 요청당 1회.
- `@Order(HIGHEST + 10)` → **체인에서 먼저** 실행 (사전지식 3번). 주석이 이유를 직접 명시: 뒤에 오는 레이트리밋이 attribute(userId)를 읽으려면 여기가 먼저 채워줘야 함.
- `ATTR_USER_ID`, `ATTR_USER_TYPE` = attribute 키 이름을 **상수**로 공개 → `AuthContext`·`AiRateLimitFilter` 가 같은 키를 공유(오타 방지).

#### 핵심 로직 `doFilterInternal()` — `JwtAuthenticationFilter.java:39-60`
```java
// L39-L60
protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain) {
    String token = extractToken(request);
    if (token != null && !token.isBlank()) {
        try {
            var claims = jwtUtil.parse(token);
            Object uid = claims.get("uid");
            Object type = claims.get("type");
            if (uid instanceof Number n) request.setAttribute(ATTR_USER_ID, n.longValue());
            if (type != null)           request.setAttribute(ATTR_USER_TYPE, type.toString());
        } catch (Exception e) {
            // 토큰 파싱 실패: 익명 요청으로 통과
            log.debug("JWT parse failed: {}", e.getMessage());
        }
    }
    chain.doFilter(request, response);   // ← 성공이든 실패든 항상 다음으로 넘김
}
```
- 흐름: 토큰 추출 → 있으면 검증 → 성공하면 **request 에 userId/userType 명찰을 붙임**.
- **중요한 설계 결정**: 검증 실패해도 **요청을 막지 않습니다**(`chain.doFilter` 항상 호출). "익명으로 통과"시키고, **인증이 꼭 필요한 컨트롤러가 알아서 attribute 를 확인**(`AuthContext.requireUserId()` 가 없으면 401)하는 구조. → "필터는 명찰만 붙이고, 입장 거부는 각 방(컨트롤러)이 결정".
- `n.longValue()` — JWT 숫자(보통 Integer)를 Long 으로 통일해 저장. **이 타입 통일이 뒤에서 함정이 됨**(AuthContext 의 `instanceof Long` 캐스팅과 짝).

#### 토큰 추출 우선순위 `extractToken()` — `JwtAuthenticationFilter.java:62-79`
```java
// L62-L79
private String extractToken(HttpServletRequest request) {
    // 1순위: HttpOnly 쿠키
    Cookie[] cookies = request.getCookies();
    if (cookies != null) {
        for (Cookie c : cookies) {
            if (AuthController.AUTH_COOKIE_NAME.equals(c.getName())) {   // "DEVBRIDGE_TOKEN"
                String v = c.getValue();
                if (v != null && !v.isBlank()) return v.trim();
            }
        }
    }
    // 2순위: Authorization 헤더 (레거시 호환)
    String header = request.getHeader("Authorization");
    if (header != null && header.startsWith("Bearer ")) return header.substring(7).trim();
    return null;
}
```
- **1순위 = HttpOnly 쿠키** `DEVBRIDGE_TOKEN`. JS 가 못 읽는 쿠키라 **XSS 토큰 탈취 방지**(CLAUDE.md 보안 설계와 일치).
- **2순위 = `Authorization: Bearer <token>`** 헤더 — 옛 클라이언트/도구 호환용. `substring(7)` 은 `"Bearer "`(7글자) 뒤를 자름.
- 쿠키 이름은 `AuthController.AUTH_COOKIE_NAME` 상수를 그대로 참조 → 발급(로그인)과 검증이 **같은 이름**을 쓰도록 단일 출처화.

> 💡 쿠키 발급 쪽(`AuthController.buildAuthCookie`)은 `httpOnly(true)`, `secure(운영 true)`, `sameSite("Lax")`, `path("/")`, `maxAge=ttl` 로 만듭니다. 즉 **HttpOnly+Secure(prod)+SameSite=Lax** 가 실제 코드로 확인됩니다.

---

### C. `AuthContext` — "지금 누구?" 리더기 (⚠️ 필터에선 쓰면 안 되는 함정) (`security/AuthContext.java`)

#### 클래스 + 오버라이드 슬롯 — `AuthContext.java:11-25`
```java
// L11-L25
public final class AuthContext {
    private AuthContext() {}   // 인스턴스화 금지(정적 유틸)
    /** 백그라운드 잡(스케줄러 등) HTTP 컨텍스트 부재 시 임시 사용자 주입용 */
    private static final ThreadLocal<Long> OVERRIDE_USER_ID = new ThreadLocal<>();
    public static void set(Long userId) { if (userId != null) OVERRIDE_USER_ID.set(userId); }
    public static void clear() { OVERRIDE_USER_ID.remove(); }
```
- `final` 클래스 + `private` 생성자 = "인스턴스 만들지 말고 정적 메서드만 써라". (유틸 클래스 관용.)
- `ThreadLocal<Long> OVERRIDE_USER_ID` — **스레드 전용 변수**. HTTP 요청이 아닌 곳(스케줄러·배치 잡)에는 "현재 사용자"라는 개념이 없으니, 그때 `set(userId)` 로 **이 스레드에서만** 임시 신원을 심습니다.
- **반드시 `finally { clear() }`** 로 지워야 함(주석 강조). 안 지우면 스레드풀에서 그 스레드가 **다음 요청에 엉뚱한 신원**을 물고 갈 수 있음(스레드 재사용 누수).

#### 현재 사용자 조회 `currentUserId()` — `AuthContext.java:27-34`
```java
// L27-L34
public static Long currentUserId() {
    Long override = OVERRIDE_USER_ID.get();
    if (override != null) return override;                 // ① 스케줄러가 심은 값 우선
    HttpServletRequest req = currentRequest();             // ② 없으면 현재 HTTP 요청에서
    if (req == null) return null;
    Object v = req.getAttribute(JwtAuthenticationFilter.ATTR_USER_ID);
    return v instanceof Long ? (Long) v : null;            // ③ 필터가 붙인 명찰 읽기
}
```
- 우선순위: **① override(스케줄러) → ② HTTP 요청 attribute**. 둘 다 없으면 `null`(익명).
- `JwtAuthenticationFilter.ATTR_USER_ID` 상수를 공유 → 필터가 `setAttribute` 한 값을 여기서 `getAttribute`.
- `v instanceof Long` — 필터가 `n.longValue()` 로 **Long** 을 넣었기에 캐스팅이 맞음. (만약 어디선가 Integer 로 넣으면 여기서 `null` 이 되는 함정이 잠재.)

#### request 획득 `currentRequest()` — `AuthContext.java:43-55` (★함정의 진원지)
```java
// L43-L55
public static Long requireUserId() {
    Long id = currentUserId();
    if (id == null) throw new RuntimeException("인증이 필요합니다.");
    return id;
}
private static HttpServletRequest currentRequest() {
    var attrs = RequestContextHolder.getRequestAttributes();
    if (attrs instanceof ServletRequestAttributes sra) return sra.getRequest();
    return null;
}
```
- `requireUserId()` = "로그인 필수" 메서드. 없으면 예외 → 컨트롤러가 401 비슷하게 처리. **컨트롤러에서 "현재 사용자"를 꺼내는 표준 진입점**.
- `currentRequest()` 가 **`RequestContextHolder`** 에 의존하는 게 핵심. 이건 **DispatcherServlet 이 채워주는** 전역 보관함입니다(사전지식 4번).
- 따라서 `AuthContext.currentUserId()` 는 **컨트롤러/서비스(디스패처 이후)** 에서는 잘 동작하지만, **서블릿 필터 안(디스패처 이전)** 에서는 `RequestContextHolder` 가 비어 있어 **항상 null** 을 돌려줍니다. → 바로 이게 다음에 나오는 M10 버그의 원인. **그래서 `AiRateLimitFilter` 는 `AuthContext` 를 안 쓰고 `request.getAttribute` 를 직접 읽습니다.**

---

### D. `AiRateLimitFilter` — 비싼 방 통행 제한 (M10 필터순서 교훈) (`config/AiRateLimitFilter.java`)

#### 선언 + 순서 — `AiRateLimitFilter.java:37-52`
```java
// L37-L52
@Slf4j @Component
@Order(Ordered.HIGHEST_PRECEDENCE + 20)   // JwtAuthenticationFilter(+10) 다음에 실행 — 그래야 request attribute(userId)가 채워진 상태
public class AiRateLimitFilter extends OncePerRequestFilter {
    @Value("${app.ratelimit.ai-chat.capacity:20}")      private int capacity;       // 버킷 용량(최대 토큰)
    @Value("${app.ratelimit.ai-chat.refill-tokens:20}") private int refillTokens;   // 채워지는 토큰 수
    @Value("${app.ratelimit.ai-chat.refill-minutes:60}")private int refillMinutes;  // 채우는 주기(분)
    /** userId → Bucket */
    private final Map<Long, Bucket> buckets = new ConcurrentHashMap<>();
```
- `@Order(HIGHEST + 20)` → JWT 필터(+10) **다음**. 이게 정확해야 작동함(이유는 doFilterInternal 에서).
- **Bucket4j 토큰버킷**: 사용자마다 `Bucket`(토큰 통). 요청 1번 = 토큰 1개 소비. 비면 거부. 시간이 지나면 다시 채워짐(refill).
- `ConcurrentHashMap<Long, Bucket>` — userId 별 버킷을 메모리에 보관(스레드 안전). 주석대로 **운영 다중 인스턴스라면 Redis 권장**(서버마다 메모리가 따로라 한도가 합쳐지지 않음).

#### 적용 대상 필터링 `shouldNotFilter()` — `AiRateLimitFilter.java:54-71`
```java
// L54-L71
private static final String[] RATE_LIMITED_SUFFIXES = { "/chat", "/formalize", "/briefing", "/auto-run" };

protected boolean shouldNotFilter(HttpServletRequest request) {
    if (!"POST".equalsIgnoreCase(request.getMethod())) return true;           // POST 아니면 제외
    String path = request.getRequestURI();
    if (!path.startsWith("/api/alpha/workspaces/")) return true;              // 워크스페이스 경로 아니면 제외
    for (String suffix : RATE_LIMITED_SUFFIXES) if (path.endsWith(suffix)) return false; // 4종만 대상
    return true;
}
```
- `shouldNotFilter` 가 `true` 면 이 필터를 **건너뜀**. 즉 "막을 대상"을 좁게 한정: **POST + `/api/alpha/workspaces/...` + 끝이 `/chat`·`/formalize`·`/briefing`·`/auto-run`** 인 요청만 레이트리밋.
- 왜 이 4개? → 전부 **LLM/전체 파이프라인 호출(돈·쿼터 소모)** 엔드포인트(클래스 주석에 매핑 명시). 조회성 GET 은 막을 이유가 없음.

#### 핵심: 신원 직독 + 토큰 소비 `doFilterInternal()` — `AiRateLimitFilter.java:73-102`
```java
// L73-L102 (요약 발췌)
protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain) {
    // 신원은 request attribute 에서 직접 읽는다. AuthContext.currentUserId() 는 RequestContextHolder 에 의존하는데
    // 서블릿 필터 단계에서는 (DispatcherServlet 진입 전이라) 아직 채워지지 않아 항상 null → 레이트리밋이 전원 무력화되던 버그.
    // JwtAuthenticationFilter(@Order +10)가 먼저 실행돼 이 attribute 를 채워둔다(@Order +20).
    Object uidAttr = request.getAttribute(JwtAuthenticationFilter.ATTR_USER_ID);
    Long userId = (uidAttr instanceof Long l) ? l : null;
    if (userId == null) { chain.doFilter(request, response); return; }   // 미인증 → 통과(컨트롤러가 401)

    Bucket bucket = buckets.computeIfAbsent(userId, this::newBucket);
    if (bucket.tryConsume(1)) {
        chain.doFilter(request, response);                               // 토큰 있음 → 통과
    } else {
        long availableIn = bucket.getAvailableTokens();
        response.setStatus(HttpStatus.TOO_MANY_REQUESTS.value());        // 429
        response.setContentType(MediaType.APPLICATION_JSON_VALUE);
        response.getWriter().write("{\"error\":\"...1시간에 " + capacity + "회...\",\"remaining\":" + availableIn + "}");
    }
}
```
- **이 8줄짜리 주석이 M10 의 전부입니다.** 핵심: `AuthContext.currentUserId()` 를 필터에서 호출하면 `RequestContextHolder` 가 아직 비어 **항상 null → 모든 사용자가 null 로 묶여 레이트리밋이 사실상 무력화**되던 버그. 해결책은 **JWT 필터가 미리 채워둔 `request.getAttribute(ATTR_USER_ID)` 를 직접 읽는 것**.
- 그래서 두 가지가 동시에 성립해야 함: ① **순서**(JWT +10 이 RateLimit +20 보다 먼저) ② **직독**(AuthContext 우회). 둘 중 하나만 틀려도 레이트리밋이 깨짐.
- `computeIfAbsent(userId, this::newBucket)` — 그 사용자의 버킷이 없으면 새로 만들고, 있으면 재사용. `tryConsume(1)` — 토큰 1개 차감 시도(성공/실패 boolean).
- 거부 시 **429 Too Many Requests** + 한국어 JSON 에러를 직접 기록(컨트롤러까지 안 가고 필터에서 응답 종결).

#### 버킷 생성 `newBucket()` — `AiRateLimitFilter.java:104-110`
```java
// L104-L110
private Bucket newBucket(Long userId) {
    Bandwidth limit = Bandwidth.classic(capacity, Refill.greedy(refillTokens, Duration.ofMinutes(refillMinutes)));
    return Bucket.builder().addLimit(limit).build();
}
```
- `Bandwidth.classic(20, greedy(20, 60분))` = "용량 20, 60분에 20개를 점진(greedy) 보충". 즉 **시간당 20회**. `greedy` 는 60분을 통째로 기다리지 않고 비율대로 조금씩 채움.

> ⚠️ 미인증(`userId==null`)일 때 **통과시키는** 게 의아할 수 있는데(레이트리밋 우회처럼 보임), 대상 컨트롤러들이 어차피 인증을 요구해 401 로 막히고, **LLM 실제 호출은 인증 통과 후에만** 일어나므로 비용 누수는 없습니다(주석 근거).

---

### E. `PasswordConfig` — BCrypt 분쇄기 (`config/PasswordConfig.java`)
```java
// L15-L22
@Configuration
public class PasswordConfig {
    @Bean
    public PasswordEncoder passwordEncoder() { return new BCryptPasswordEncoder(); }
}
```
- 딱 한 가지: `PasswordEncoder` 빈(BCrypt) 1개를 앱 전역에 공급. user 도메인의 회원가입/로그인이 `passwordEncoder.encode(...)` / `.matches(...)` 로 사용.
- **중요(클래스 주석)**: 이 프로젝트는 **Spring Security 프레임워크 전체를 의도적으로 끔**(`build.gradle` 의 `spring-boot-starter-security` 가 주석 처리, `spring-security-crypto` 만 의존). 즉 `SecurityFilterChain`·자동 인증 흐름이 **없고**, 인증/인가는 위의 `JwtAuthenticationFilter` + `AuthContext` 가 **수동으로** 담당. **BCrypt 알고리즘만 빌려 쓰는** 구조입니다.

> 💡 BCrypt 는 같은 비밀번호라도 매번 다른 salt 로 다른 해시를 냅니다. 그래서 저장본끼리 비교가 아니라 `matches(원문, 저장해시)` 로 검증해야 함.

---

### F. `AesGcmCryptoService` — 귀중품 금고 (`security/AesGcmCryptoService.java`)

#### 키 초기화 `init()` — `AesGcmCryptoService.java:33-49`
```java
// L33-L49
@Value("${app.crypto.key:}")        private String configuredKey;
@Value("${app.jwt.secret:...32bytes}") private String jwtSecretFallback;
private SecretKey secretKey;
private final SecureRandom rng = new SecureRandom();

@PostConstruct
void init() throws Exception {
    String raw = (configuredKey != null && !configuredKey.isBlank()) ? configuredKey : jwtSecretFallback;
    byte[] keyBytes = MessageDigest.getInstance("SHA-256").digest(raw.getBytes());  // 무조건 32바이트로
    this.secretKey = new SecretKeySpec(keyBytes, "AES");
    log.info("AesGcmCryptoService initialized (key source: {})",
            (configuredKey != null && !configuredKey.isBlank()) ? "app.crypto.key" : "JWT secret fallback");
}
```
- `@PostConstruct` = 빈이 만들어진 직후 1회 실행(초기화 훅).
- 키 출처: **`app.crypto.key` 우선**, 비어 있으면 **`app.jwt.secret` 으로 폴백**. 어느 쪽이든 **SHA-256 해시로 32바이트 고정** → AES-256 키. (원본 길이가 들쭉날쭉해도 항상 32바이트가 됨.)
- **시크릿 자체는 로깅하지 않고 "출처"만 INFO 로** 남김(안전).

> ⚠️ 메모리 노트("Env priority changes need duplicate-key audit")와 직결: `app.crypto.key` 가 `.env`/`application*.properties` 에 **서로 다른 값으로 중복** 정의돼 있으면, 어떤 게 주입되느냐에 따라 **복호화 키가 달라져 기존 암호문을 못 푸는** 사고가 납니다. 이 클래스의 폴백 로직 때문에 더더욱 "키 일관성"이 중요.

#### 암호화 `encrypt()` — `AesGcmCryptoService.java:51-63`
```java
// L51-L63
public byte[] encrypt(String plaintext) {
    if (plaintext == null) return null;
    byte[] iv = new byte[IV_LENGTH];           // IV_LENGTH = 12
    rng.nextBytes(iv);                          // 매번 랜덤 IV
    Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
    cipher.init(Cipher.ENCRYPT_MODE, secretKey, new GCMParameterSpec(128, iv));  // 128 = tag bits
    byte[] ct = cipher.doFinal(plaintext.getBytes());
    return ByteBuffer.allocate(iv.length + ct.length).put(iv).put(ct).array();   // [12B IV][암호문+태그]
}
```
- **AES-GCM** = 암호화 + **무결성 태그**(변조 감지)를 동시에 제공하는 모드. `NoPadding` 은 GCM 이 패딩이 필요 없어서.
- **IV(초기화 벡터)는 매번 랜덤 12바이트**. 같은 평문도 매번 다른 암호문이 되게 함(패턴 노출 방지). **재사용 금지**가 GCM 의 철칙 → `SecureRandom` 으로 매번 새로.
- 저장 형식이 클래스 주석대로 **`[12B IV][암호문+태그]`** 한 덩어리. 복호화 때 앞 12바이트를 떼어 IV 로 씀.

#### 복호화 `decrypt()` + Base64 헬퍼 — `AesGcmCryptoService.java:65-89`
```java
// L65-L89 (요약)
public String decrypt(byte[] payload) {
    if (payload == null || payload.length < IV_LENGTH + 1) return null;
    ByteBuffer bb = ByteBuffer.wrap(payload);
    byte[] iv = new byte[IV_LENGTH]; bb.get(iv);          // 앞 12B = IV
    byte[] ct = new byte[bb.remaining()]; bb.get(ct);     // 나머지 = 암호문+태그
    Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
    cipher.init(Cipher.DECRYPT_MODE, secretKey, new GCMParameterSpec(128, iv));
    return new String(cipher.doFinal(ct));                // 태그 불일치 시 예외(변조 탐지)
}
public String encryptToBase64(String s) { ... }   // byte[] → Base64 문자열 (DB 컬럼/JSON 저장용)
public String decryptFromBase64(String b64) { ... }
```
- 복호화는 정확히 역순: IV 분리 → 복호화. **암호문이 한 비트라도 변조되면 GCM 태그 검증 실패로 예외** → 위변조를 자동 차단.
- `encryptToBase64`/`decryptFromBase64` — 바이트를 그대로 DB/JSON 에 넣기 불편하니 **Base64 텍스트**로 변환하는 편의 래퍼. KIS 키·GitHub PAT 등을 문자열 컬럼에 저장할 때 사용.

---

### G. `WebConfig` — CORS + 업로드 파일 서빙 (`config/WebConfig.java`)

#### 허용 출처 해석 — `WebConfig.java:28-39`
```java
// L28-L39
@Value("${app.cors.allowed-origins:http://localhost:5173,http://127.0.0.1:5173}")
private String allowedOriginsCsv;

private String[] resolveOrigins() {
    if (allowedOriginsCsv == null || allowedOriginsCsv.isBlank())
        return new String[]{"http://localhost:5173", "http://127.0.0.1:5173"};
    return java.util.Arrays.stream(allowedOriginsCsv.split(","))
            .map(String::trim).filter(s -> !s.isEmpty()).toArray(String[]::new);
}
```
- 콤마로 구분된 출처 목록을 환경변수(`CORS_ALLOWED_ORIGINS`)로 받아 배열로 분해. 비면 로컬 dev 주소로 폴백.
- **운영에선 실제 프론트 도메인을 넣어야** 함. (CLAUDE.md 환경변수표에도 등장.)

#### CORS 매핑 — `WebConfig.java:42-56`
```java
// L42-L56
public void addCorsMappings(CorsRegistry registry) {
    String[] origins = resolveOrigins();
    registry.addMapping("/api/**")
            .allowedOrigins(origins)
            .allowedMethods("GET","POST","PUT","PATCH","DELETE","OPTIONS")
            .allowedHeaders("*")
            .allowCredentials(true)    // ★ 쿠키 동봉 허용
            .maxAge(3600);
    registry.addMapping(publicBase + "/**")   // "/files/**" — 업로드 다운로드
            .allowedOrigins(origins).allowedMethods("GET","HEAD","OPTIONS").maxAge(3600);
}
```
- `/api/**` 에 CORS 허용. **`allowCredentials(true)` + 명시적 `allowedOrigins`** 조합이 핵심: 쿠키 인증(JWT 쿠키)을 쓰니 자격증명을 허용하되, 그러면 `*` 를 못 쓰므로 **출처를 정확히 나열**해야 함(사전지식 5번).
- `maxAge(3600)` — 프리플라이트(OPTIONS) 결과를 1시간 캐시 → 매 요청마다 사전검사 안 함(성능).

#### 정적 리소스 핸들러 — `WebConfig.java:59-65`
```java
// L59-L65
public void addResourceHandlers(ResourceHandlerRegistry registry) {
    Path root = Paths.get(uploadDir).toAbsolutePath().normalize();
    String location = root.toUri().toString();    // file:/.../uploads/
    registry.addResourceHandler(publicBase + "/**")   // /files/**
            .addResourceLocations(location).setCachePeriod(3600);
}
```
- 업로드 폴더(`app.upload.dir`, 기본 `uploads`)를 `/files/**` URL 로 **정적 서빙**. 프론트가 `<a href="/files/...">` 로 첨부파일을 직접 받음.
- `.normalize()` + 절대경로화 — 경로 정규화로 `../` 같은 트래버설 혼선을 줄임.

---

### H. `Jackson2NodeBridgeConfig` — Boot4 직렬화 수술 (`config/Jackson2NodeBridgeConfig.java`)
```java
// L33-L53 (요약)
@Bean
JacksonModule jackson2NodeBridgeModule() {
    SimpleModule module = new SimpleModule("Jackson2NodeBridge");
    module.addSerializer(com.fasterxml.jackson.databind.JsonNode.class, new Jackson2NodeSerializer());
    return module;
}
private static final class Jackson2NodeSerializer extends ValueSerializer<com.fasterxml.jackson.databind.JsonNode> {
    public void serialize(com.fasterxml.jackson.databind.JsonNode value, JsonGenerator gen, SerializationContext ctxt) {
        if (value == null || value.isNull()) gen.writeNull();
        else gen.writeRawValue(value.toString());   // 옛 JsonNode 의 원본 JSON 텍스트를 그대로 출력
    }
}
```
- **문제(메모리 "Spring Boot 4 Jackson JsonNode 버그"와 직결)**: Boot 4 의 기본 매퍼는 **Jackson 3**(`tools.jackson`)인데, 앱 곳곳(`AnalyticsClient`·브로커·LLM)이 **Jackson 2**(`com.fasterxml.jackson`)의 `JsonNode` 를 만들어 컨트롤러가 그대로 반환. Jackson 3 은 그걸 트리로 못 알아보고 **getter 들(`isArray`·`nodeType`…)을 직렬화** → `{"array":false,"nodeType":"OBJECT",...}` 같은 쓰레기 JSON 이 나감. analytics 프록시 엔드포인트 전체가 영향.
- **해결**: 기본 Jackson 3 매퍼는 **건드리지 않고**(DTO·날짜 직렬화 회귀 위험 0), **Jackson 2 `JsonNode` 타입만 만났을 때** 그 노드의 `toString()`(항상 유효한 JSON 텍스트)을 `writeRawValue` 로 원본 그대로 출력하는 **직렬화기를 다리처럼 등록**. 외과적 수정.
- Boot 4 가 컨텍스트의 모든 `JacksonModule` 빈을 기본 매퍼에 자동 등록하므로, **이 빈 하나 선언만으로 전역 적용**. (앱이 Jackson3 로 완전 이행하면 이 브릿지는 제거 가능.)

> 💡 초보 포인트: "Jackson 이 2개"라는 게 함정의 본질. 패키지가 `com.fasterxml.jackson`(2) vs `tools.jackson`(3) 로 다릅니다. 같은 이름 `JsonNode` 라도 **다른 타입**이라 서로 못 알아봅니다.

---

### I. `StreamChatConfig` — 외부 채팅 SDK 연결 (`config/StreamChatConfig.java`)
```java
// L37-L53 (요약)
@PostConstruct
public void init() {
    boolean haveKey = apiKey != null && !apiKey.isBlank();
    boolean haveSecret = apiSecret != null && !apiSecret.isBlank();
    if (haveKey && System.getProperty("STREAM_KEY") == null)    System.setProperty("STREAM_KEY", apiKey);
    if (haveSecret && System.getProperty("STREAM_SECRET") == null) System.setProperty("STREAM_SECRET", apiSecret);
    log.info("[StreamChatConfig] keyPresent={}, secretPresent={}", haveKey, haveSecret);  // 존재 여부만(시크릿 노출 X)
    if (!haveKey || !haveSecret) log.warn("Stream Chat 키/시크릿이 비어있습니다. 채팅 기능이 동작하지 않을 수 있어요.");
}
```
- Stream Chat Java SDK 는 **시스템 프로퍼티 `STREAM_KEY`/`STREAM_SECRET`** 를 읽어 자체 초기화 → 그래서 `System.setProperty` 가 필수.
- 안전장치 3개: ① **외부에서 이미 주입돼 있으면 덮어쓰지 않음**(`== null` 일 때만 set) ② **빈 값이면 아예 set 안 함**(빈 값으로 초기화돼 런타임 401 나는 것 방지) ③ **시크릿은 로깅 금지, boolean 존재여부만**.

---

### J. `DataSeeder` — 개관 준비 오케스트레이터 (`seed/DataSeeder.java`)

#### 선언 + 비-트랜잭션 결정 — `DataSeeder.java:50-84`
```java
// L50-L84 (발췌)
@Slf4j @Component @Profile("!prod") @RequiredArgsConstructor
public class DataSeeder implements CommandLineRunner {
    ...repository 다수...
    private final ObjectMapper objectMapper = new ObjectMapper();
    private final Map<Long, Long> userIdMap = new HashMap<>();   // JSON id → 실제 DB PK
    ...
    @Override
    // 의도적으로 @Transactional 제거 — 거대한 outer 트랜잭션 안에서 일부 SQL 이 실패하면
    // rollback-only 마킹돼 마지막 commit 이 실패한다. 각 seedXxx()/cleanupXxx()/bootstrap*() 는
    // 내부에서 자체 트랜잭션을 관리하거나 REQUIRES_NEW 로 독립 커밋한다.
    public void run(String... args) throws Exception { ... }
```
- `implements CommandLineRunner` → **앱 기동 완료 직후 `run()` 1회 실행**. (기동 시 데이터 준비에 표준.)
- `@Profile("!prod")` → **운영에선 비활성**(mock 데이터로 운영 DB 오염 방지). `AiModelCatalogSeeder` 는 prod/local 둘 다였던 것과 대비.
- **`@Transactional` 을 일부러 안 붙임**(주석 핵심): 거대한 단일 트랜잭션이면 중간 한 SQL 실패가 전체를 rollback-only 로 만들어 최종 commit 까지 날림. 그래서 **각 단계가 자기 트랜잭션을 따로** 가짐(특히 cleanup 은 `REQUIRES_NEW` 로 독립 커밋).
- `userIdMap`/`skillIdMap`/... — **JSON 의 원본 id → 실제 저장된 PK** 매핑표. JSON 끼리의 FK 참조를 실제 DB PK 로 이어주는 다리(아래 seed 메서드들이 채우고 읽음).

#### 실행 순서 `run()` — `DataSeeder.java:84-153`
```java
// L84-L153 (구조 발췌)
log.info("===== DataSeeder 시작 =====");
seedSkillMaster(); seedProjectFieldMaster(); seedUsers();
seedClientProfile(); seedClientProfileStats(); seedClientPreferredSkill();
seedProjects(); seedProjectApplications(); seedProjectTags(); seedProjectSkillMapping(); seedChatRooms();
contractModuleSeeder.backfillAll();        // 7개 계약 모듈 백필
migrateBudgetManToWon();                    // 만원→원 단위 마이그레이션
backfillModulesFromContractTerms();         // AI 협의내용 → 모듈 반영
milestoneSeedingService.bootstrapAll();     // 마일스톤 자동 시드
// 1회성 정리(독립 트랜잭션으로 직접 호출):
pr = dataCleanupService.cleanupProjects();
cr = dataCleanupService.cleanupClients();
op = dataCleanupService.cleanupOrphans();
```
- **순서가 곧 의존성**: `skill_master`/`field_master` → `users` → `client_profile`(user FK) → stats/skill(client FK) → `projects`(user FK) → application/tag/mapping(project FK) → chat. **부모를 먼저 만들어야 자식 FK 가 연결**됨.
- 후반부는 시드가 아니라 **데이터 보정 작업들**(마이그레이션·백필·정리). 전부 `try/catch + log.warn` 으로 감싸 **하나가 실패해도 나머지는 진행**.
- ⚠️ **Spring AOP self-invocation 함정**(주석 명시): `DataCleanupService.cleanupAll()` 내부에서 `cleanupProjects()` 를 부르면 **프록시를 거치지 않아 `REQUIRES_NEW` 가 무시됨**. 그래서 DataSeeder 가 **외부에서 각 cleanup 메서드를 직접** 호출 → 진짜 독립 트랜잭션을 보장. (AOP 어노테이션은 "빈 외부 호출"에만 적용되는 한계.)

#### 멱등 + id 매핑 패턴 `seedSkillMaster()` — `DataSeeder.java:258-284`
```java
// L258-L284 (요약)
private void seedSkillMaster() throws Exception {
    if (skillMasterRepository.count() > 0) {     // ★ 멱등: 이미 있으면
        // 기존 데이터에 대해 JSON 을 다시 읽어 "원본 id → 실제 PK" 매핑만 복원하고 return
        JsonNode arr = readJson("seed/erd/skill_master.json");
        for (JsonNode n : arr) {
            Long jsonId = n.get("id").asLong();
            String name = n.get("name").asText();
            skillMasterRepository.findByName(name).ifPresent(s -> skillIdMap.put(jsonId, s.getId()));
        }
        return;
    }
    // 비어 있으면 실제 insert + 매핑 채움
    JsonNode arr = readJson("seed/erd/skill_master.json");
    for (JsonNode n : arr) {
        Long jsonId = n.get("id").asLong();
        SkillMaster saved = skillMasterRepository.save(SkillMaster.builder().name(n.get("name").asText()).build());
        skillIdMap.put(jsonId, saved.getId());
    }
}
```
- **모든 seedXxx 가 공유하는 2단 패턴**: ① `count() > 0` 이면 **재삽입 없이 매핑만 복원하고 return**(멱등) ② 비어 있으면 삽입하며 매핑 채움.
- 왜 매핑 복원이 필요한가: 같은 기동 사이클에서 뒤따르는 seed(예: `client_preferred_skill`)가 `skillIdMap` 을 참조하기 때문. 이미 DB 에 있어도 **이번 기동의 메모리 맵은 비어 있으니** 다시 채워줘야 FK 연결이 됨.

#### JSON 읽기 + 안전 추출 헬퍼 — `DataSeeder.java:622-664`
```java
// L622-L664 (발췌)
private JsonNode readJson(String classpathLocation) throws Exception {
    try (InputStream is = new ClassPathResource(classpathLocation).getInputStream()) {
        return objectMapper.readTree(is);     // classpath:seed/erd/*.json
    }
}
private static String text(JsonNode n, String f)  { JsonNode v=n.get(f); return (v==null||v.isNull())?null:v.asText(); }
private static Integer intOrNull(JsonNode n, String f) { ... }   // 없으면 null
private static Boolean boolOrNull(JsonNode n, String f){ ... }
private static String jsonString(JsonNode n, String f){ JsonNode v=n.get(f); return (v==null||v.isNull())?null:v.toString(); }
private static LocalDate parseDate(String s) { try { return LocalDate.parse(s); } catch(Exception e){ return null; } }
```
- 시드 JSON 은 `classpath:seed/erd/*.json`(build.gradle 가 복사). `objectMapper.readTree` 로 트리 파싱.
- 헬퍼들은 **필드가 없거나 null 이어도 안 터지게** 방어적으로 추출(`null`/기본값 반환). 시드 JSON 이 들쭉날쭉해도 견디게 하는 장치.
- `EnumMapper.xxx(text(n, "..."))` 조합으로 **소문자 문자열 → enum** 변환(아래 EnumMapper 참고).

> 💡 초보 포인트: 시더는 "한 번 잘 돌면 끝"이 아니라 **매 기동마다 돕니다.** 그래서 멱등성과 "이미 있으면 매핑만 복원" 패턴이 핵심. 새 시드 메서드를 추가할 땐 반드시 이 2단 패턴을 따르세요.

---

### K. `DataCleanupService` — "완전한 데이터 50개만" 정리 (`seed/DataCleanupService.java`)

#### 독립 트랜잭션 + 점수화 정리 `cleanupProjects()` — `DataCleanupService.java:110-156`
```java
// L110-L156 (요약)
@Transactional(propagation = Propagation.REQUIRES_NEW)   // ★ 독립 커밋
public int cleanupProjects() {
    List<Project> all = projectRepository.findAll();
    if (all.size() <= KEEP_PROJECTS) { return 0; }       // 멱등: 이미 50 이하면 skip
    // 모든 프로젝트 점수화 → 내림차순 정렬 → 상위 50 유지, 나머지 삭제
    List<Project> ranked = all.stream().map(p -> Map.entry(p, scoreProject(...))).sorted(내림차순)...
    List<Project> toRemove = ranked.stream().skip(KEEP_PROJECTS).toList();
    // FK 의존 데이터 먼저 삭제(escrow→milestone→module→attachment→meeting→tag→skill→application)
    for (...) { ...deleteAll... }
    projectRepository.deleteAll(toRemove);
}
```
- `REQUIRES_NEW` → DataSeeder 가 직접 호출할 때 **독립 트랜잭션**으로 커밋(앞서 본 self-invocation 회피와 짝).
- **멱등 핵심**: `all.size() <= 50` 이면 즉시 `return 0`. 한 번 50으로 줄면 재기동해도 **추가 삭제 없음**.
- **점수화 정리**: 모든 프로젝트에 `scoreProject` 점수를 매겨 **상위 50개만 남김**. FK 자식들을 **역순으로 먼저 삭제**해야 부모 삭제 시 제약 위반이 안 남.

#### 완전성 점수 `scoreProject()` — `DataCleanupService.java:158-179`
```java
// L158-L179 (요약)
private long scoreProject(Project p, List<ProjectModule> mods, long milestoneCount) {
    if (p.getTitle()==null||p.getTitle().isBlank()) return Long.MIN_VALUE;   // 결격 → 최하위
    if (p.getBudgetAmount()==null||p.getBudgetAmount()<=0) return Long.MIN_VALUE;
    if (mods.size() < 7) return Long.MIN_VALUE;          // 7개 모듈 미만 결격
    if (milestoneCount < 1) return Long.MIN_VALUE;
    long score = milestoneCount*100 + mods.size()*50;
    for (ProjectModule m : mods) { score += (data 길이)/50; if ("협의완료".equals(m.getStatus())) score += 30; }
    if (desc 길이>30) score += 50; if (serviceField!=null) score += 20;
    if (status==IN_PROGRESS) score += 200; if (status==COMPLETED) score += 150;
    return score;
}
```
- **결격 조건(제목·예산·7모듈·마일스톤 중 하나라도 부실)** 이면 `Long.MIN_VALUE` → 정렬 시 맨 뒤 → 우선 삭제 대상.
- 통과한 것끼리는 **데이터 풍부도(모듈 데이터 길이·협의완료·설명·진행상태)** 로 가점 → "진짜 쓸만한" 프로젝트가 살아남도록.
- `cleanupClients()`(L181-205)도 같은 철학: `scoreClient` 로 bio/industry/강점/예산 충실도를 점수화해 상위 50명 유지.

#### orphan 정리 `cleanupOrphans()` — `DataCleanupService.java:78-103`
```java
// L78-L103 (요약)
@Transactional(propagation = Propagation.REQUIRES_NEW)
public int cleanupOrphans() {
    // 부모 projects 가 사라졌는데 남은 자식 행 일괄 삭제 (native SQL)
    em.createNativeQuery("DELETE FROM project_modules    WHERE project_id NOT IN (SELECT id FROM projects)").executeUpdate();
    em.createNativeQuery("DELETE FROM project_milestones WHERE project_id NOT IN (SELECT id FROM projects)").executeUpdate();
    em.createNativeQuery("DELETE FROM project_escrows    WHERE project_id NOT IN (SELECT id FROM projects)").executeUpdate();
}
```
- **고아(orphan) 행** = 부모가 삭제됐는데 살아남은 자식. native SQL `NOT IN (SELECT id FROM projects)` 로 일괄 청소. 매 기동 실행해도 안전(없으면 0건 삭제 = 멱등).

---

### L. `AiModelCatalogSeeder` — AI 메뉴판 등록 (`seed/AiModelCatalogSeeder.java`)
```java
// L22-L57 (요약)
@Component @Order(100)
public class AiModelCatalogSeeder implements CommandLineRunner {
    public void run(String... args) {
        // 정책 변경: 과거 시드된 Perplexity 모델은 제거
        repo.findByEnabledTrueOrderBySortOrderAsc().stream()
            .filter(m -> m.getProvider() == Provider.PERPLEXITY).forEach(repo::delete);
        if (repo.count() > 0) return;     // 멱등
        List<AiModelCatalog> seed = List.of(
            model("gemini-2.5-flash", ..., GEMINI,    200_000L, -1L,      10),   // 무료한도 20만토큰, pro 무제한(-1)
            model("gemini-2.5-pro",   ..., GEMINI,    0L,       500_000L, 20),
            model("claude-sonnet-4",  ..., ANTHROPIC, 0L,       300_000L, 30),
            model("claude-opus-4",    ..., ANTHROPIC, 0L,       100_000L, 40),
            model("gpt-4o-mini",      ..., OPENAI,    100_000L, -1L,      50),
            model("gpt-4o",           ..., OPENAI,    0L,       300_000L, 60));
        repo.saveAll(seed);
    }
}
```
- `@Order(100)` → 여러 CommandLineRunner 중 **실행 순서** 지정(작을수록 먼저; DataSeeder 와 독립적으로 동작).
- **prod/local 모두 적용**(@Profile 없음) — 모델 카탈로그는 운영에도 필요하니까. (DataSeeder 의 `@Profile("!prod")` 와 대비.)
- 멱등 패턴은 동일(`count() > 0` 이면 return). 단, 그 전에 **정책 변경분(Perplexity) 정리**를 먼저 수행 → "메뉴판 갱신".
- `freeQuota`/`proQuota` 의 **`-1L` 은 무제한**을 의미하는 센티넬 값. (Gemini flash·GPT-4o mini 의 무료/Pro 한도가 -1.)

---

### M. `EnumMapper` — 번역기 (`util/EnumMapper.java`)
```java
// L11-L33, L180-L189 (발췌)
public final class EnumMapper {
    private EnumMapper() {}
    public static User.UserType userType(String s) {
        if (s == null) return null;
        return switch (s.toLowerCase()) {
            case "client","user","free" -> User.UserType.FREE;
            case "partner","pro","standard" -> User.UserType.STANDARD;
            case "premium" -> User.UserType.PREMIUM;
            default -> null;
        };
    }
    public static Project.ProjectStatus projectStatus(String s) {
        if (s == null) return Project.ProjectStatus.RECRUITING;     // ← null 기본값 있음
        return switch (s.toLowerCase()) {
            case "recruiting" -> ProjectStatus.RECRUITING;
            case "in_progress" -> ProjectStatus.IN_PROGRESS;
            ...
            default -> ProjectStatus.RECRUITING;                    // ← 모르는 값도 기본값
        };
    }
}
```
- 역할: **ERD v2 의 소문자 JSON enum 문자열 → 백엔드 UPPERCASE enum**(정합표: `docs/ERD_v2_enum_alignment.md`). DataSeeder 가 시드 JSON 을 엔티티로 바꿀 때 사용.
- `switch` **표현식 화살표(`->`) 문법**(Java 14+): break 불필요, 값을 바로 반환. `s.toLowerCase()` 로 대소문자 무시.
- **별칭 흡수**가 똑똑함: 예) `client`/`user`/`free` 가 모두 `FREE` 로, `partner`/`pro`/`standard` 가 `STANDARD` 로. 옛 ERD 용어와 새 등급제를 동시에 수용.
- 두 가지 정책이 메서드마다 다름: ① 일부는 모르면 `null`(예: `userType`, `gender`) ② 일부는 **안전한 기본값**(예: `projectStatus`→RECRUITING, `clientType`→INDIVIDUAL, `visibility`→PUBLIC). → "이 필드는 비어도 되나/안 되나"에 따른 선택.

---

### N. `TerminalWebSocketHandler` + `Config` — 로컬 전용 셸 콘센트 (`terminal/`)

#### 등록 게이트 — `TerminalWebSocketConfig.java:15-24`
```java
// L15-L24
@Configuration @EnableWebSocket
@ConditionalOnProperty(name = "app.terminal.enabled", havingValue = "true")   // ★ 이 설정 자체가 옵트인
public class TerminalWebSocketConfig implements WebSocketConfigurer {
    public void registerWebSocketHandlers(WebSocketHandlerRegistry registry) {
        registry.addHandler(new TerminalWebSocketHandler(), "/ws/terminal").setAllowedOriginPatterns("*");
    }
}
```
- `@ConditionalOnProperty(...havingValue="true")` → **`app.terminal.enabled=true` 일 때만** 이 빈/엔드포인트가 존재. **운영 기본은 OFF** → `/ws/terminal` 자체가 안 생김.

#### 연결 시 loopback 검문 — `TerminalWebSocketHandler.java:34-64`
```java
// L34-L64 (요약)
public void afterConnectionEstablished(WebSocketSession session) throws Exception {
    if (!isLoopback(session)) {                            // ★ 127.0.0.1 / ::1 만 허용
        session.close(CloseStatus.POLICY_VIOLATION.withReason("local only")); return;
    }
    String shell = shellFor(session);                     // ?shell=powershell|cmd|bash|sql
    ProcessBuilder pb = new ProcessBuilder(shellCmd(shell));
    pb.redirectErrorStream(true);                         // stderr 를 stdout 으로 합침
    pb.directory(new File(System.getProperty("user.dir")));
    Process p = pb.start();
    procs.put(session.getId(), p);
    // 출력 펌프 스레드 + 종료 감시 스레드(둘 다 daemon)
}
```
- **2중 안전장치**: ① 설정 OFF 기본(Config) ② **loopback 접속만 허용**(핸들러). 외부 IP 면 즉시 `POLICY_VIOLATION` 으로 끊음 → **웹에서 임의 셸 실행(RCE) 차단**.
- 세션마다 셸 프로세스 1개(`procs` 맵에 보관). `redirectErrorStream(true)` 로 에러도 같은 스트림에 → 클라이언트 한 화면에 표시.
- `?shell=` 쿼리로 powershell/cmd/bash/sql 선택(`shellCmd` 가 OS별 실행 인자 매핑). **파이프 기반이라 완전한 PTY 가 아님** → vim 같은 풀스크린 TUI 는 제한, lean/git/python 명령엔 충분(클래스 주석).

#### stdin 중계 / 정리 — `TerminalWebSocketHandler.java:66-102`
```java
// L66-L102 (요약)
protected void handleTextMessage(WebSocketSession session, TextMessage message) {
    Process p = procs.get(session.getId());
    if (p == null || !p.isAlive()) return;
    p.getOutputStream().write(message.getPayload().getBytes(UTF_8)); flush();   // WS 입력 → 프로세스 stdin
}
public void afterConnectionClosed(WebSocketSession session, CloseStatus status) {
    Process p = procs.remove(session.getId());
    if (p != null) p.destroyForcibly();        // ★ 세션 끊기면 프로세스 강제 종료(좀비 방지)
}
private void pumpOutput(...) { while(read) sendSafe(session, ...); }            // 프로세스 stdout → WS
```
- 양방향: **WS 텍스트 → 프로세스 stdin**(`handleTextMessage`), **프로세스 stdout → WS**(`pumpOutput` 스레드).
- 세션 종료 시 `destroyForcibly()` 로 셸 프로세스를 **반드시 죽임** → 좀비 프로세스 누수 방지. `sendSafe` 는 `synchronized(session)` 로 동시 전송 충돌을 막음.

> ⚠️ 이건 **개발 편의 도구**입니다. 운영에서 절대 켜지 마세요(설정 OFF 유지). 켜더라도 loopback 검문이 1차 방어선.

---

## ⚠️ 함정·보안 주의 (코드에 박힌 교훈 모음)

1. **M10 — 필터 안에서 `AuthContext` 쓰면 항상 null** (가장 중요)
   - `AuthContext.currentUserId()` 는 `RequestContextHolder` 의존인데, 이건 **DispatcherServlet 이후**에야 채워짐. **서블릿 필터(디스패처 이전)** 에선 비어 있어 **항상 null**.
   - 결과(과거 버그): 모든 사용자가 null 로 묶여 **레이트리밋이 전원 무력화**.
   - 정답 2종 세트: ① `AiRateLimitFilter` 는 `request.getAttribute(ATTR_USER_ID)` **직독** ② **필터 순서**(JWT `@Order(+10)` 가 RateLimit `@Order(+20)` 보다 먼저 실행돼 attribute 를 미리 채움). **둘 중 하나만 어긋나도 깨짐.**

2. **Spring Security 프레임워크 자체가 OFF**
   - `build.gradle` 에서 `spring-boot-starter-security` 는 **주석 처리**, `spring-security-crypto`(BCrypt)만 의존. → `SecurityFilterChain`·자동 인증/인가가 **없음**.
   - 인증은 전부 **수동**(`JwtAuthenticationFilter`+`AuthContext`). 그래서 "필터가 막지 않고 통과시키고, 컨트롤러가 `requireUserId()` 로 거부"하는 패턴이 유일한 방어선 → **컨트롤러에서 신원 체크를 빠뜨리면 곧 인가 누락**. (최근 커밋 "NotificationController IDOR 차단"이 바로 이 계열 사고.)

3. **필터 순서 의존성은 주석으로만 강제됨**
   - `@Order(+10)`/`@Order(+20)` 숫자 관계가 깨지면 조용히 오작동. 새 필터 추가 시 **이 상대 순서를 반드시 고려**. 숫자는 "절대값"이 아니라 "상대 순서"라는 점에 유의.

4. **시더 멱등성 — `count()>0` 가드는 필수**
   - 시더는 매 기동 실행. `if (count()>0) return;` 빠뜨리면 **매번 중복 삽입**. 새 seedXxx 추가 시 반드시 ① 멱등 가드 ② "이미 있으면 매핑만 복원" 2단 패턴.
   - `DataCleanupService` 도 `size() <= 50` 가드로 멱등(재기동 시 추가 삭제 없음).

5. **`app.crypto.key` 중복/폴백 사고** (메모리 노트와 직결)
   - `AesGcmCryptoService` 는 `app.crypto.key` 없으면 **`app.jwt.secret` 으로 폴백** → 둘이 다르거나, `.env`/`application*.properties` 에 같은 키가 **다른 값**으로 중복되면, **복호화 키가 바뀌어 기존 암호문을 못 푸는** 사고. 환경변수 우선순위 변경 전 **중복 키 감사** 필수.

6. **AOP self-invocation — `REQUIRES_NEW` 무시**
   - `DataCleanupService.cleanupAll()` 내부에서 `cleanupProjects()` 를 부르면 프록시를 안 거쳐 **트랜잭션 어노테이션이 무시**됨. → DataSeeder 가 **외부에서 직접** 각 메서드를 호출해 진짜 독립 트랜잭션을 만든 것.

7. **JWT 페이로드는 비밀이 아님**
   - 서명으로 위조는 막지만 내용은 누구나 디코드 가능(Base64). claims 에 민감정보 넣지 말 것. `uid`/`type` 정도만.

8. **CORS + 쿠키 조합 주의**
   - `allowCredentials(true)` 면 `allowedOrigins("*")` 금지(브라우저 거부). 반드시 **명시적 출처 목록**. 운영에 실제 도메인 넣는 걸 잊으면 프론트가 막힘.

9. **터미널은 운영에서 켜지 말 것**
   - `app.terminal.enabled` 기본 OFF + loopback 검문. 켜는 순간 RCE 위험이 생기므로 로컬 개발에서만.

10. **Jackson 2/3 혼재**
   - Boot4=Jackson3. 옛 `com.fasterxml.jackson.JsonNode` 를 컨트롤러가 반환하면 직렬화가 깨짐. `Jackson2NodeBridgeConfig` 가 외과적으로 메움. 새 코드는 가급적 Jackson3 또는 DTO 사용.

---

## 🚀 고도화 아이디어 (강의·개선 버전용)

- **레이트리밋 Redis 전환**: `AiRateLimitFilter` 의 인메모리 `ConcurrentHashMap` 은 다중 인스턴스에서 한도가 안 합쳐짐. Bucket4j + Redis(JCache)로 옮기면 **클러스터 전역 한도**. 등급별 한도(FREE 20 / PRO 60)도 사용자 `type` 으로 분기 가능(현재 자리만 있고 미구현).
- **진짜 Spring Security 도입 검토**: 수동 필터 방식은 가볍지만 **인가(authorization)** 를 컨트롤러마다 손으로 체크해야 해 IDOR/누락 위험. `@PreAuthorize` 같은 선언적 인가로 옮기면 실수 감소. (단, 회귀 비용 큼 — 점진 도입.)
- **AES 키 회전(rotation)**: 현재 단일 키. 암호문에 **키 버전 태그**를 붙여 두면 키 교체 시 옛 데이터도 점진 재암호화 가능. KMS/Vault 연동으로 키를 코드/환경변수 밖으로.
- **시더를 Flyway/별도 import 로 분리**: 마이그레이션·백필 로직(`migrateBudgetManToWon`·`backfillModules…`)이 시더에 섞여 비대. **1회성 마이그레이션은 Flyway repeatable/versioned** 로, 데모 시드는 시더로 역할 분리하면 가독성·재현성↑.
- **CleanupService 정책 외부화**: `KEEP_PROJECTS=50` 등 매직넘버와 점수 가중치를 설정으로 빼면 환경별 튜닝 용이. 점수 함수에 단위 테스트 추가(결격 조건 회귀 방지).
- **터미널을 PTY 로**: 현재 파이프라 풀스크린 TUI 제한. `pty4j` 등으로 진짜 PTY 를 붙이면 vim/htop 까지. (보안 게이트는 더 강화 필요.)
- **EnumMapper 역방향 + 테스트**: enum→문자열 역변환과, "모든 enum 값이 매핑되는지" 검증 테스트를 추가하면 ERD 정합 깨짐을 컴파일/테스트 단계에서 포착.

---

## 📚 용어 사전 (이 영역 한정)

| 용어 | 뜻 |
|---|---|
| **빈(Bean)** | Spring 이 만들어 보관·주입하는 재사용 객체 (`@Component`/`@Bean`) |
| **DI(의존성 주입)** | 객체를 직접 `new` 하지 않고 Spring 이 끼워주는 것 (`@RequiredArgsConstructor`) |
| **서블릿 필터** | 컨트롤러 도착 전 모든 요청이 거치는 관문. `OncePerRequestFilter` = 요청당 1회 |
| **`@Order`** | 필터/러너 실행 순서. 숫자 작을수록 먼저. `HIGHEST_PRECEDENCE + N` 으로 상대 순서 |
| **request attribute** | 요청 객체에 붙이는 임시 메모(`set/getAttribute`). 요청 끝나면 소멸 |
| **RequestContextHolder** | "현재 스레드의 요청"을 어디서나 꺼내는 전역 보관함. **DispatcherServlet 이 채움**(필터 단계엔 빔) |
| **JWT** | `헤더.페이로드.서명` 토큰. 서명으로 위조 방지, 내용은 공개(암호화 아님) |
| **HS256** | HMAC-SHA256 대칭키 서명. 같은 비밀키로 서명·검증 |
| **claims** | JWT 페이로드의 주장값(여기선 `uid`, `type`, `sub`) |
| **CORS** | 브라우저의 교차 출처 호출 통제 규칙. `allowCredentials`+명시 출처가 쿠키 인증의 짝 |
| **프리플라이트** | 본요청 전 브라우저가 보내는 OPTIONS 사전 확인. `maxAge` 로 캐시 |
| **Bucket4j / 토큰버킷** | 요청=토큰1소비, 시간경과로 보충하는 레이트리밋 알고리즘 |
| **BCrypt** | 단방향 비밀번호 해시(매번 다른 salt). `matches`로 검증 |
| **AES-GCM** | 암호화+무결성 태그를 동시 제공하는 양방향 암호. IV 매번 랜덤 12B 필수 |
| **IV(초기화 벡터)** | 같은 평문도 매번 다른 암호문이 되게 하는 랜덤값. 재사용 금지 |
| **멱등(idempotent)** | 여러 번 실행해도 결과가 같음. 시더의 `count()>0 → skip` 패턴 |
| **CommandLineRunner** | 앱 기동 완료 직후 `run()` 1회 실행하는 인터페이스(시더에 사용) |
| **`@Profile("!prod")`** | 운영이 아닐 때만 빈 활성화(mock 시드 격리) |
| **`@PostConstruct`** | 빈 생성 직후 1회 실행되는 초기화 훅 |
| **`REQUIRES_NEW`** | 호출 시 항상 새 독립 트랜잭션 시작(별도 커밋/롤백) |
| **AOP self-invocation** | 같은 빈 내부 메서드 호출은 프록시를 안 거쳐 `@Transactional`이 무시되는 한계 |
| **orphan(고아) 행** | 부모가 삭제됐는데 남은 자식 FK 행 |
| **loopback** | 127.0.0.1 / ::1(자기 자신). 터미널이 이 주소만 허용해 RCE 차단 |
| **PTY vs 파이프** | PTY=완전한 가상 터미널(풀스크린 TUI 가능), 파이프=단순 입출력 스트림(제한적) |
