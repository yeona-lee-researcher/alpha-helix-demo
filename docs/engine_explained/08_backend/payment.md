# `domain/payment` — 결제·구독·암호화·원장 (완전 라인별 해설)

> 원본: `backend/src/main/java/com/DevBridge/devbridge/domain/payment/` 전체
> 형식: 이 교재의 표준(README "3. 공통 형식" + 모범 예시 `01_backtest/vbt_engine.md`)을 따릅니다.
> 전제: Spring 기초(`@Service`·`@RestController`·DI·`@Transactional`)는 `08_backend/00_spring_primer.md` 에서 다룹니다. 여기서는 결제 도메인 고유 개념에 집중합니다.

---

## 📌 이 도메인 한눈에

이 패키지는 백엔드의 **"돈을 다루는 창구 + 비밀을 보관하는 금고"** 입니다. 두 가지 일을 합니다.

1. **결제 창구** — 사용자가 토스(Toss)로 구독료를 내면, 그 결제가 진짜인지 토스 서버에 물어보고(confirm), 결제 상태가 바뀌면(취소·환불) 토스가 보내는 알림(웹훅)을 받습니다. 그리고 등록한 카드 목록과 거래 내역(가계부/원장)을 관리합니다.
2. **금고(암호화)** — KIS·Binance 같은 외부 증권사 API 비밀키를 DB에 저장하기 전에 **AES-256-GCM 으로 암호화**합니다. DB가 통째로 유출돼도 키 없이는 못 읽습니다.

> 비유: 이 도메인은 **은행 지점**입니다. `TossPaymentsService` 는 **창구 직원**(본점=토스에 "이 결제 진짜 맞아요?"라고 전화), `TossWebhookController` 는 **본점에서 오는 팩스 수신기**(취소·환불 통지가 비동기로 들어옴), `CryptoService` 는 **금고**(고객 비밀번호를 잠가서 보관), `LedgerController` 는 **통장 거래내역 출력기**, `PaymentMethodService` 는 **등록된 카드 관리대장**입니다.

### 핵심 클래스 역할표

| 클래스 | 레이어 | 한 줄 역할 | 비유 |
|---|---|---|---|
| `TossPaymentsService` | service | 토스 `/v1/payments/confirm` 호출 → 결제 확정 | 본점에 결제 진위 확인 전화 |
| `CryptoService` | service | AES-256-GCM 암복호화 (KIS/Binance 키 보호) | 금고 (잠그기/열기) |
| `PaymentMethodService` | service | 카드 등록·삭제·기본카드 설정 (마스킹 저장) | 카드 관리대장 |
| `TossWebhookController` | controller | 토스가 푸시하는 상태변경 수신(HMAC 검증) | 본점 팩스 수신기 |
| `LedgerController` | controller | 에스크로 이벤트 → 가계부(수입/지출) 목록 | 통장 거래내역 |
| `PaymentMethodController` | controller | 카드 CRUD REST 엔드포인트 | 창구 접수대 |
| `PaymentMethod` | entity | 카드(브랜드·last4·만료) — 전체번호/CVC 저장 안 함 | 마스킹된 카드 사본 |
| `AesGcmCryptoService` | global/security | (연관) GitHub PAT 등 다른 토큰용 별도 AES-GCM | 다른 금고 (키 파생 방식 다름) |
| `SubscriptionController` | (strategy 도메인) | 결제 confirm + Pro 활성화 + **M8 멱등성** | 구독 발급 창구 (이 문서와 링크) |

> ⚠️ 헷갈림 주의: **결제 confirm 의 진짜 진입점은 `payment` 가 아니라 `strategy` 도메인의 `SubscriptionController` 입니다.** 그 컨트롤러가 `payment` 의 `TossPaymentsService.confirm()` 을 빌려 씁니다. 그래서 이 문서는 "결제를 누가 시작하나"를 설명할 때 그 클래스를 **링크로** 인용합니다(아래 §F).

---

## 🧠 사전 지식 (이거 모르면 막힘)

#### 1) Toss Payments v1 — "결제창은 프론트, 확정은 서버"

토스 결제는 **2단계**입니다. 초보가 가장 많이 오해하는 부분.

- **1단계 (프론트):** 사용자가 토스 SDK 결제창에서 카드정보를 넣고 "결제하기"를 누름 → 토스가 `paymentKey`, `orderId`, `amount` 3종 세트를 만들어 우리 프론트의 `successUrl` 로 돌려보냄. **이 시점엔 아직 돈이 안 빠짐.** "결제 예약" 상태일 뿐.
- **2단계 (서버 confirm):** 우리 백엔드가 그 3종 세트를 받아, **서버의 시크릿 키로** 토스 `/v1/payments/confirm` 을 호출. 이때 비로소 **실제 청구가 확정**됨.

> 왜 굳이 서버가 한 번 더 확인하나? → 악성 사용자가 프론트 JS 를 조작해 "9,900원짜리를 100원으로" 바꿔도, 서버가 `amount` 를 **다시 검증**(VALID_PLANS)하고 토스에 그대로 보내므로 위변조가 막힙니다. **금액 검증의 최종 책임은 항상 서버.**

#### 2) 웹훅(Webhook) — "본점이 우리한테 거는 전화"

confirm 은 **우리가 토스에게** 거는 호출(동기, 즉시 응답). 반면 **웹훅은 토스가 우리에게** 거는 호출(비동기)입니다.

- 언제? 결제 확정 *이후에* 상태가 바뀔 때 — 사용자가 환불받음, 가상계좌 입금이 뒤늦게 완료됨, 부분취소 등. 이건 우리가 모르는 사이 일어나므로 토스가 **푸시**로 알려줍니다.
- 비유: confirm = 내가 본점에 전화(내가 끊을 때까지 대답 기다림). 웹훅 = 본점이 나중에 나한테 거는 전화(언제 올지 모름, 받을 준비만 해둠).

#### 3) AES-256-GCM 대칭암호화 — "같은 열쇠로 잠그고 여는 금고 + 봉인스티커"

- **대칭(symmetric):** 잠글 때와 열 때 **같은 키**를 씀(`APP_CRYPTO_KEY`). 공개키/개인키 한 쌍을 쓰는 비대칭(RSA 등)과 다름.
- **AES-256:** 256비트(=32바이트) 키를 쓰는 표준 암호. 키가 정확히 32바이트여야 함.
- **GCM:** 단순 암호화에 더해 **인증 태그(GCM tag, 16바이트)** 를 같이 만듦. 누가 암호문을 한 글자라도 바꾸면 복호화 시 태그가 안 맞아 **즉시 위변조 탐지**. (비유: 봉투에 봉인 스티커. 뜯으면 티 남.)
- **IV / nonce(12바이트):** "초기화 벡터". 매번 **랜덤으로 새로** 만드는 소금 같은 값. 같은 평문을 두 번 암호화해도 IV 가 다르면 암호문이 완전히 달라짐 → 패턴 분석 방지. **비밀이 아니어서 암호문 앞에 붙여 같이 저장**해도 안전.
- 우리 저장 포맷: `Base64( IV(12) ‖ ciphertext ‖ GCM_TAG(16) )` — 세 조각을 한 줄로 이어 한 문자열로 보관(마이그레이션이 단순해짐).

#### 4) 멱등성(Idempotency) — "버튼 두 번 눌러도 결제는 한 번"

같은 요청을 여러 번 보내도 **결과가 한 번 한 것과 같아야 한다**는 성질. 결제에서 필수입니다.

- 왜? 사용자가 successUrl 에서 **새로고침**하거나, 네트워크가 끊겨 프론트가 **재시도**하거나, **더블클릭**하면 confirm 이 2번 날아올 수 있음. 그대로 두면 구독이 2번 활성화되거나 토스에 2번 confirm 해 에러가 남.
- 해결(M8): `toss_payment_key` 를 **DB 유니크 키**로 걸고, 이미 처리된 키면 **토스 재호출 없이** 기존 구독을 그대로 돌려줌. (코드는 §F·DB 마이그레이션 V17.)

#### 5) 원장(Ledger) — "거래내역 통장"

여러 상태 변화(에스크로 입금·환불·정산)를 **시간순 거래 목록**으로 뽑아 보여주는 것. 회계의 "장부"에서 온 말. 우리는 `ProjectEscrow`(에스크로) 이벤트를 수입(income)/지출(expense)으로 분류해 가계부처럼 보여줍니다.

#### 6) PCI 정책 — "카드 전체번호·CVC 는 절대 저장 금지"

카드정보를 직접 보관하면 PCI-DSS 라는 무거운 보안 규제를 받습니다. 그래서 우리는 **카드번호 뒤 4자리(last4)·브랜드·소유자명·만료월만** 저장하고, **전체 번호와 CVC 는 형식 검증만 하고 버립니다**(`PaymentMethod` 주석에 명시).

---

## 🗺 요청 흐름도

### (A) 구독 결제 — 동기 confirm 흐름

```
[프론트 React]
  사용자가 토스 SDK 결제창에서 카드 입력 → "결제"
        │  토스가 paymentKey · orderId · amount 발급
        ▼
  successUrl 로 리다이렉트 (아직 청구 안 됨)
        │  POST /api/subscription/confirm  { paymentKey, orderId, amount }
        ▼
┌─────────────────────────────────────────────────────────┐
│ SubscriptionController.confirm()   (strategy 도메인)       │
│  1. JWT 로 본인 확인 (AuthContext.currentUserId)           │
│  2. amount ∈ VALID_PLANS ?  (9900/19900 위변조 방지)       │
│  3. paymentKey 비었나?                                     │
│  4. ⭐ findByPaymentKey() — 이미 처리됐으면 멱등 반환 (M8)   │
└─────────────────────────────────────────────────────────┘
        │  (신규 결제일 때만)
        ▼
┌─────────────────────────────────────────────────────────┐
│ TossPaymentsService.confirm()      (payment 도메인 ★)      │
│  POST https://api.tosspayments.com/v1/payments/confirm    │
│  Authorization: Basic base64(secretKey + ":")             │
│  body: { paymentKey, orderId, amount }                    │
└─────────────────────────────────────────────────────────┘
        │  토스 응답 JSON  { status:"DONE", method:"카드", ... }
        ▼
  status == "DONE" ? → SubscriptionService.activatePro() → Pro 등급 활성화
        │  (DB 유니크 충돌 시 DataIntegrityViolation → 멱등 재사용)
        ▼
  { tier:"STANDARD", status, expiresAt } 를 프론트에 응답
```

### (B) 상태변경 — 비동기 웹훅 흐름 (취소·환불·가상계좌 입금)

```
[토스 서버]  결제 취소/환불/입금완료 발생
        │  POST /api/payments/toss/webhook
        │  헤더 X-Toss-Signature  +  raw JSON body
        ▼
┌─────────────────────────────────────────────────────────┐
│ TossWebhookController.webhook()                           │
│  1. webhookSecret 있으면 → HMAC-SHA256 서명 검증           │
│       (rawBody 를 secret 으로 해시 == X-Toss-Signature ?)  │
│  2. eventType / data.paymentKey / data.status 파싱        │
│  3. escrowRepository.findByPaymentTxId(paymentKey)        │
│  4. status 에 따라 에스크로 상태 전이                       │
│       CANCELED/PARTIAL_CANCELED → REFUNDED               │
│       DONE(가상계좌 입금) → markDepositedFromExternal      │
└─────────────────────────────────────────────────────────┘
        │  항상 200 { ok:true } (토스에 "잘 받았다" 신호)
```

### (C) 자격증명 금고 — CryptoService 사용처

```
[BrokerAccountController]  사용자가 KIS appsecret / Binance secret 등록
        │  crypto.encrypt(appsecret)
        ▼
  CryptoService.encrypt()  → Base64(IV‖CT‖TAG)
        ▼
  BrokerAccount.appSecretEnc 컬럼에 암호문 저장 (평문 절대 금지)
        │  ... 실주문 시 ...
        ▼
  CryptoService.decrypt(appSecretEnc) → 평문 복원 → KIS 호출
```

---

## 📖 핵심 클래스 라인별 심화

### A. `TossPaymentsService.confirm()` — 결제 확정 호출

원본: `domain/payment/service/TossPaymentsService.java`

#### A-1. 클래스 선언과 주입 — `TossPaymentsService.java:25-37`

```java
// L25-L37
@Slf4j
@Service
@RequiredArgsConstructor
public class TossPaymentsService {

    @Value("${tosspayments.secret-key}")
    private String secretKey;

    @Value("${tosspayments.api-base}")
    private String apiBase;

    private final RestTemplate restTemplate = new RestTemplate();
    private final ObjectMapper om = new ObjectMapper();
```

- `@Service` — 스프링이 이 클래스를 빈(bean)으로 만들어 다른 곳에 주입할 수 있게 함.
- `@Value("${tosspayments.secret-key}")` — `application*.properties`(또는 환경변수 `TOSS_SECRET_KEY`)에서 **시크릿 키**를 읽어 `secretKey` 필드에 넣음. **이 키는 절대 프론트에 노출되면 안 됩니다**(서버 전용). 클라이언트 키(`test_ck_...`)와 시크릿 키(`test_sk_...`)는 **반드시 같은 토스 계정의 키쌍**이어야 함(CLAUDE.md 주의사항).
- `apiBase` — `https://api.tosspayments.com` 같은 베이스 URL. 환경별로 바꿀 수 있게 외부화.
- `RestTemplate` — 스프링의 HTTP 클라이언트(우리가 토스에게 거는 전화기). `ObjectMapper` — JSON 문자열 ↔ 자바 객체 변환기.

> 💡 초보 포인트: `@Value` 의 `${...}` 안에 `:` 가 없으면(예: 여기) **키가 없으면 부팅 실패**입니다. 토스 키는 반드시 설정돼야 한다는 뜻.

#### A-2. confirm 본체 — Basic 인증 헤더 만들기 — `TossPaymentsService.java:43-58`

```java
// L43-L58
public JsonNode confirm(String paymentKey, String orderId, long amount) {
    String url = apiBase + "/v1/payments/confirm";

    // Basic Auth: secretKey + ":" base64
    String basic = Base64.getEncoder().encodeToString(
            (secretKey + ":").getBytes(StandardCharsets.UTF_8));

    HttpHeaders headers = new HttpHeaders();
    headers.setContentType(MediaType.APPLICATION_JSON);
    headers.set("Authorization", "Basic " + basic);

    Map<String, Object> body = Map.of(
            "paymentKey", paymentKey,
            "orderId", orderId,
            "amount", amount
    );
```

- **토스 인증 방식 = HTTP Basic Auth.** 규칙: `"시크릿키:"` (콜론 뒤 비밀번호는 비움)을 Base64 로 인코딩해 `Authorization: Basic <인코딩값>` 헤더에 넣음.
  - 왜 `secretKey + ":"` 인가? Basic Auth 는 원래 `아이디:비밀번호` 형식인데, 토스는 시크릿키를 **아이디 자리**에 넣고 비밀번호는 비움. 그래서 콜론 뒤가 비어 있음.
- `body` 3종 세트 = 프론트가 받은 그대로의 `paymentKey`, `orderId`, `amount`. 토스는 이 셋이 **자기가 발급한 것과 일치하는지**(특히 amount) 대조해 위변조를 잡습니다.

#### A-3. 호출 + 성공 처리 — `TossPaymentsService.java:60-66`

```java
// L60-L66
    HttpEntity<Map<String, Object>> entity = new HttpEntity<>(body, headers);
    try {
        ResponseEntity<String> res = restTemplate.exchange(url, HttpMethod.POST, entity, String.class);
        JsonNode json = om.readTree(res.getBody());
        log.info("[Toss] confirm OK orderId={} status={} method={}",
                orderId, json.path("status").asText(), json.path("method").asText());
        return json;
```

- `restTemplate.exchange(...)` — 실제 POST 전송. **응답 타입을 `String.class` 로 받는 점**이 핵심: JSON 을 문자열로 받은 뒤 `om.readTree()` 로 직접 트리(`JsonNode`)로 파싱합니다.
  - 왜 자동 매핑(`JsonNode.class`) 안 쓰나? → 메모리의 "Spring Boot 4 Jackson JsonNode 버그"(Boot4 기본이 Jackson3 라 `JsonNode` 자동 역직렬화가 깨짐). String 으로 받아 우리 `ObjectMapper`(Jackson2)로 파싱하는 **우회 패턴**입니다.
- 성공 시 토스 응답 JSON 을 그대로 반환. 호출자(`SubscriptionController`)가 `json.path("status")` 가 `"DONE"` 인지 확인.
- `json.path("status")` — `.path()` 는 키가 없어도 예외 대신 "빈 노드"를 돌려줘 NPE 안전.

#### A-4. 실패 처리 — 토스 에러 메시지 추출 — `TossPaymentsService.java:67-82`

```java
// L67-L82
    } catch (HttpStatusCodeException e) {
        String msg = "토스 결제 승인 실패";
        try {
            JsonNode err = om.readTree(e.getResponseBodyAsString());
            msg = err.path("message").asText(msg);
            log.warn("[Toss] confirm fail orderId={} code={} message={}", orderId,
                    err.path("code").asText(), msg);
        } catch (Exception ignore) {
            log.warn("[Toss] confirm fail orderId={} body={}", orderId, e.getResponseBodyAsString());
        }
        throw new RuntimeException(msg);
    } catch (Exception e) {
        log.warn("[Toss] confirm error orderId={}: {}", orderId, e.getMessage());
        throw new RuntimeException("결제 승인 중 오류가 발생했습니다: " + e.getMessage());
    }
}
```

- `HttpStatusCodeException` — 토스가 4xx/5xx 를 돌려준 경우(예: 이미 처리된 결제, 금액 불일치). 에러 바디에서 **토스가 준 한글 메시지**(`message`)를 꺼내 그대로 사용자에게 전달 → 친절한 에러.
- 두 단계 `catch`: 토스가 준 구조화된 에러(HttpStatusCodeException) vs 그 외 모든 오류(네트워크 끊김 등). 어느 쪽이든 `RuntimeException` 으로 통일해 위로 던짐 → 컨트롤러가 `badRequest` 로 변환.

> ⚠️ 함정: `RuntimeException` 한 종류로 뭉뚱그리면, 호출 측(`SubscriptionController`)에서 "토스 거절"과 "네트워크 장애"를 구분 못 합니다. 고도화 시 커스텀 예외로 분리하면 재시도 정책을 다르게 줄 수 있습니다(§고도화).

---

### B. `CryptoService.encrypt()` / `decrypt()` — AES-GCM 금고

원본: `domain/payment/service/CryptoService.java`

#### B-1. 키 로딩 + 검증 (생성자) — `CryptoService.java:44-61`

```java
// L44-L61
public CryptoService(@Value("${app.crypto.key}") String base64Key) {
    String trimmed = base64Key == null ? "" : base64Key.trim();
    byte[] keyBytes;
    try {
        keyBytes = Base64.getDecoder().decode(trimmed);
    } catch (IllegalArgumentException e) {
        throw new IllegalStateException("app.crypto.key는 Base64로 인코딩된 32바이트여야 합니다.", e);
    }
    if (keyBytes.length != 32) {
        throw new IllegalStateException("app.crypto.key는 정확히 32바이트(=AES-256)이어야 합니다. 현재: " + keyBytes.length + "바이트");
    }
    this.secretKey = new SecretKeySpec(keyBytes, ALG);
    this.devKey = trimmed.startsWith("dev-only")
            || "AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8=".equals(trimmed);
    ...
```

- `@Value("${app.crypto.key}")` — **콜론 없는** 플레이스홀더 → **기본값이 없음**. 즉 `APP_CRYPTO_KEY`(또는 `app.crypto.key`)가 설정 안 되면 **앱이 부팅하다 죽습니다**(CLAUDE.md 의 핵심 주의). 이건 의도된 안전장치: "암호화 키 없이 민감정보 다루지 마라."
- 키는 **Base64 로 인코딩된 32바이트**여야 함. 디코딩 실패하거나 길이가 32 가 아니면 명확한 한글 메시지로 `IllegalStateException` → 부팅 중단. (32바이트 = AES-256 의 요구 키 길이.)
- `devKey` 판정: 키가 `dev-only` 로 시작하거나 알려진 개발용 기본 Base64(`AAECAwQF...`)면 "개발용 키"로 표시 → 운영에서 실수로 쓰면 경고하려는 용도.

> 💡 초보 포인트: 생성자에서 키를 검증하는 이유 → **잘못된 키로 운영하다 나중에 복호화가 깨지느니, 시작할 때 빨리 죽는 게 낫다**("fail fast"). 암호화는 한 번 잘못되면 데이터를 영영 못 읽을 수 있어 더욱 중요.

#### B-2. 시작 로그 — 키 지문(fingerprint)만 노출 — `CryptoService.java:63-82`

```java
// L63-L71
@PostConstruct
void warn() {
    // 시작 시점에 어떤 키가 active 인지 fingerprint 로 식별 (값 자체는 노출 안 함)
    log.info("[CryptoService] app.crypto.key loaded — b64len={} b64tail=...{}  sha256[0..8]={} dev={}",
            keyB64Len, keyB64Tail, keyFingerprint, devKey);
    if (devKey) {
        log.warn("⚠️  app.crypto.key가 개발용 기본값입니다. 운영 배포 전 반드시 APP_CRYPTO_KEY 환경변수로 교체하세요.");
    }
}
```

- `@PostConstruct` — 빈이 만들어진 직후 1회 실행. 시작 로그에 **어떤 키가 활성인지** 식별 정보를 남김.
- **핵심 보안 설계: 키 값 자체는 로그에 안 찍습니다.** 대신 SHA-256 해시의 앞 4바이트(`keyFingerprint`)·길이·꼬리 4글자만 찍음. 이러면 "지금 서버 A 와 B 가 같은 키를 쓰나?"를 지문 비교로 확인하면서도 키 자체는 유출 안 됨.
- 이게 왜 중요? → 메모리 "Env priority changes need duplicate-key audit": `app.crypto.key` 가 여러 파일에 **다른 값**으로 중복되면, 암호화한 키로 복호화가 안 되는 대참사가 납니다. 이 지문 로그가 그걸 잡는 진단 도구.

#### B-3. encrypt — IV 랜덤 생성 + 조립 — `CryptoService.java:85-100`

```java
// L85-L100
public String encrypt(String plain) {
    if (plain == null) return null;
    try {
        byte[] iv = new byte[IV_LEN];           // IV_LEN = 12
        rng.nextBytes(iv);                       // 매번 새 랜덤 nonce
        Cipher c = Cipher.getInstance(TRANSFORM);// "AES/GCM/NoPadding"
        c.init(Cipher.ENCRYPT_MODE, secretKey, new GCMParameterSpec(TAG_BITS, iv)); // TAG_BITS = 128
        byte[] ct = c.doFinal(plain.getBytes(StandardCharsets.UTF_8));
        byte[] out = new byte[iv.length + ct.length];
        System.arraycopy(iv, 0, out, 0, iv.length);
        System.arraycopy(ct, 0, out, iv.length, ct.length);
        return Base64.getEncoder().encodeToString(out);
    } catch (Exception e) {
        throw new RuntimeException("encrypt failed", e);
    }
}
```

- `rng.nextBytes(iv)` — **매 암호화마다 새 12바이트 IV(nonce)를 랜덤 생성**. GCM 의 황금률: "같은 키로 같은 IV 를 재사용하면 안 된다"(재사용하면 보안이 무너짐). `SecureRandom` 이라 예측 불가.
- `GCMParameterSpec(128, iv)` — 인증 태그를 128비트(16바이트)로. GCM 은 암호화 후 이 태그를 `ct` **끝에 자동으로 붙여** 줍니다. 즉 `c.doFinal()` 결과 `ct` = `실제암호문 + 16바이트 태그`.
- 조립: `out = IV(12) + ct(암호문+태그)`. 이걸 Base64 한 문자열로 → DB 한 컬럼에 저장.
  - **IV 를 암호문 앞에 같이 저장하는 게 맞나?** → 네. IV 는 비밀이 아니며(랜덤이기만 하면 됨), 복호화하려면 **반드시 같은 IV 가 필요**하므로 함께 보관하는 게 표준입니다.

```
encrypt 결과 바이트 레이아웃:
┌──────────┬───────────────────────┬──────────────┐
│ IV (12B) │  ciphertext (가변)     │ GCM tag(16B) │   ← 전체를 Base64
└──────────┴───────────────────────┴──────────────┘
   └ 랜덤 nonce        └ 진짜 암호문         └ 봉인 스티커
```

#### B-4. decrypt — 분해 + 태그 검증 — `CryptoService.java:103-118`

```java
// L103-L118
public String decrypt(String encoded) {
    if (encoded == null) return null;
    try {
        byte[] all = Base64.getDecoder().decode(encoded);
        if (all.length < IV_LEN + 16) throw new IllegalArgumentException("ciphertext too short");
        byte[] iv = new byte[IV_LEN];
        System.arraycopy(all, 0, iv, 0, IV_LEN);
        byte[] ct = new byte[all.length - IV_LEN];
        System.arraycopy(all, IV_LEN, ct, 0, ct.length);
        Cipher c = Cipher.getInstance(TRANSFORM);
        c.init(Cipher.DECRYPT_MODE, secretKey, new GCMParameterSpec(TAG_BITS, iv));
        return new String(c.doFinal(ct), StandardCharsets.UTF_8);
    } catch (Exception e) {
        throw new RuntimeException("decrypt failed (key mismatch or tampered ciphertext)", e);
    }
}
```

- 암호화의 정확한 역순: Base64 풀고 → 앞 12바이트를 IV 로, 나머지를 `ct`(암호문+태그)로 쪼갬.
- `if (all.length < IV_LEN + 16)` — 최소 길이(IV 12 + 태그 16 = 28바이트) 미만이면 깨진 데이터 → 즉시 거부.
- `c.doFinal(ct)` — **여기서 GCM 이 태그를 자동 검증**. 암호문이 1비트라도 변조됐거나 **키가 다르면** `AEADBadTagException` 이 터짐 → catch 로 잡아 `"key mismatch or tampered ciphertext"` 메시지로 던짐.
  - 즉 이 한 줄이 **위변조 탐지 + 키 불일치 탐지**를 동시에 합니다. 에러 메시지가 두 원인을 같이 적은 이유.

#### B-5. mask — 화면 노출용 마스킹 — `CryptoService.java:121-124`

```java
// L121-L124
public static String mask(String v) {
    if (v == null || v.length() <= 8) return "********";
    return v.substring(0, 4) + "*".repeat(Math.max(4, v.length() - 8)) + v.substring(v.length() - 4);
}
```

- 복호화한 키를 화면에 "확인용"으로 보여줄 때, **앞 4 + 뒤 4만** 남기고 가운데는 `*`. 8자 이하면 통째로 가림. (저장이 아니라 **표시** 용도.)

> 💡 `CryptoService` vs `AesGcmCryptoService` 차이(둘 다 AES-GCM):
> | | `CryptoService`(payment) | `AesGcmCryptoService`(global/security) |
> |---|---|---|
> | 키 출처 | `app.crypto.key` (Base64 32B, **기본값 없음**) | `app.crypto.key` → 없으면 **JWT_SECRET 의 SHA-256** fallback |
> | 키 검증 | 정확히 32B 아니면 부팅 실패 | 어떤 문자열이든 SHA-256 으로 32B 파생 |
> | 반환형 | `String`(Base64) | `byte[]` + `*Base64` 변형 |
> | 주 용도 | KIS·Binance 시크릿 | GitHub PAT 등 |
> 같은 평문을 둘로 암호화한 결과는 **호환되지 않습니다**(키 파생 방식이 다름). 어느 서비스로 암호화했는지 일관성 유지가 중요.

---

### C. `TossWebhookController` — 비동기 상태변경 수신

원본: `domain/payment/controller/TossWebhookController.java`

#### C-1. 엔드포인트 + 서명 검증 게이트 — `TossWebhookController.java:45-55`

```java
// L45-L55
@PostMapping("/webhook")
@Transactional
public ResponseEntity<?> webhook(@RequestHeader(value = "X-Toss-Signature", required = false) String signature,
                                 @RequestBody String rawBody) {
    // 보안키가 비어있으면 검증 skip (개발 단계). 운영에서는 필수.
    if (webhookSecret != null && !webhookSecret.isBlank()) {
        if (signature == null || !verifyHmac(rawBody, signature)) {
            log.warn("[TossWebhook] 서명 검증 실패");
            return ResponseEntity.status(401).body(Map.of("message", "invalid signature"));
        }
    }
```

- `@RequestBody String rawBody` — **JSON 을 객체가 아니라 원시 문자열로** 받는 게 핵심. 서명은 토스가 **보낸 바이트 그대로**에 대해 계산했으므로, 우리도 파싱하기 **전 원본**으로 HMAC 을 계산해야 일치합니다. (객체로 받아 다시 직렬화하면 공백·키순서가 달라져 서명이 깨짐.)
- `X-Toss-Signature` 헤더 — 토스가 본문을 자기 비밀키로 HMAC 한 값. `required=false` 라 헤더가 없어도 메서드에는 들어옴(아래서 직접 검사).
- **검증 게이트:** `webhookSecret` 이 설정돼 있을 때만 검증. 비어 있으면(개발) skip. ⚠️ 운영에서 `tosspayments.webhook-secret` 를 안 넣으면 **아무나 위조 웹훅을 보내 환불 상태를 조작**할 수 있음 → 운영 필수(§함정).

#### C-2. 본문 파싱 + 에스크로 매칭 — `TossWebhookController.java:57-77`

```java
// L57-L77
    try {
        JsonNode body = om.readTree(rawBody);
        String eventType = body.path("eventType").asText("");
        JsonNode data    = body.path("data");
        String paymentKey = data.path("paymentKey").asText("");
        String status     = data.path("status").asText("");

        log.info("[TossWebhook] eventType={} status={} paymentKey={}", eventType, status, paymentKey);

        if (paymentKey.isBlank()) return ResponseEntity.ok(Map.of("ok", true));

        // payment_tx_id 컬럼에 paymentKey 가 저장돼있음 → 단건 조회.
        escrowRepository.findByPaymentTxId(paymentKey)
                .ifPresent(e -> applyStatus(e, status));

        return ResponseEntity.ok(Map.of("ok", true));
    } catch (Exception ex) {
        log.warn("[TossWebhook] 처리 오류: {}", ex.getMessage());
        return ResponseEntity.status(500).body(Map.of("message", ex.getMessage()));
    }
}
```

- 토스 웹훅 페이로드 구조: `{ eventType, data:{ paymentKey, status, ... } }`. `data.paymentKey` 로 **우리 DB 의 어떤 에스크로**인지 찾음(`payment_tx_id` 컬럼에 paymentKey 가 저장돼 있음).
- `findByPaymentTxId(...).ifPresent(...)` — 매칭되는 에스크로가 **있을 때만** 상태 갱신. 없으면 조용히 무시(우리와 무관한 결제일 수 있음).
- **항상 `200 ok:true` 반환**(매칭 안 돼도). 웹훅은 "받았다"는 신호를 빨리 줘야 토스가 재전송을 멈춥니다. 단, 처리 중 예외는 500 으로 → 토스가 나중에 재시도.

#### C-3. 상태 전이 로직 — `TossWebhookController.java:79-98`

```java
// L79-L98
private void applyStatus(ProjectEscrow e, String tossStatus) {
    switch (tossStatus) {
        case "CANCELED", "PARTIAL_CANCELED" -> {
            if (e.getStatus() != ProjectEscrow.EscrowStatus.REFUNDED) {
                e.setStatus(ProjectEscrow.EscrowStatus.REFUNDED);
                e.setRefundedAt(LocalDateTime.now());
                escrowRepository.save(e);
                log.info("[TossWebhook] 에스크로 {} → REFUNDED", e.getId());
            }
        }
        case "DONE" -> {
            if (e.getStatus() == ProjectEscrow.EscrowStatus.PENDING) {
                // 가상계좌 입금 완료 등 — 에스크로 전이 + 마일스톤 IN_PROGRESS + 파트너 알림 일괄 처리.
                dashboardService.markDepositedFromExternal(e.getId());
                log.info("[TossWebhook] 에스크로 {} → DEPOSITED (webhook 보강)", e.getId());
            }
        }
        default -> { /* WAITING_FOR_DEPOSIT 등은 무시 */ }
    }
}
```

- **취소/부분취소 → REFUNDED**, 단 `if (status != REFUNDED)` 가드로 **이미 환불됐으면 또 안 함** → 웹훅이 중복 도착해도 안전(멱등). `refundedAt` 타임스탬프 기록.
- **DONE(가상계좌 입금 완료) → DEPOSITED**, 단 `PENDING` 상태일 때만. 입금은 confirm 시점이 아니라 **나중에** 일어날 수 있어 웹훅으로 보강하는 것. 단순 상태변경이 아니라 `markDepositedFromExternal()` 로 **마일스톤 진행 + 파트너 알림까지 일괄** 처리.
- `default` — 그 외 상태(`WAITING_FOR_DEPOSIT` 등)는 무시. **모든 분기에 가드(if)가 있어 같은 웹훅을 여러 번 받아도 결과가 같음**(웹훅 멱등의 모범).

---

### D. `PaymentMethodService` — 카드 등록(마스킹) 핵심

원본: `domain/payment/service/PaymentMethodService.java`

#### D-1. 카드번호 검증 + CVC 폐기 — `PaymentMethodService.java:38-50`

```java
// L38-L50
String rawNumber = req.getNumber() == null ? "" : req.getNumber().replaceAll("[\\s-]", "");
if (!rawNumber.matches("\\d{13,19}")) {
    throw new IllegalArgumentException("카드 번호 형식이 올바르지 않습니다.");
}
if (!luhnCheck(rawNumber)) {
    // Mock 환경: Luhn 실패해도 통과시키되 로그만 남김
    // throw new IllegalArgumentException("유효하지 않은 카드 번호입니다.");
}

String cvc = req.getCvc() == null ? "" : req.getCvc().trim();
if (!cvc.matches("\\d{3,4}")) {
    throw new IllegalArgumentException("CVC 형식이 올바르지 않습니다.");
}
```

- 공백·하이픈 제거 후 13~19자리 숫자인지 검사. `luhnCheck`(아래)는 **Mock 환경에서 통과**시키되 코드는 남겨둠(주석 처리). → 테스트 카드도 등록되게 한 의도.
- **CVC 는 형식(3~4자리)만 검사하고 변수에서 그대로 버려집니다.** 어디에도 저장 안 함 → PCI 원칙 준수.

#### D-2. 마스킹 저장 — `PaymentMethodService.java:77-92`

```java
// L77-L92
PaymentMethod pm = PaymentMethod.builder()
        .user(user)
        .brand(detectBrand(rawNumber))
        .last4(rawNumber.substring(rawNumber.length() - 4))
        .holderName(holder)
        .expMonth(m)
        .expYear(y)
        .isDefault(makeDefault)
        .nickname(req.getNickname() == null ? null : req.getNickname().trim())
        .build();

PaymentMethod saved = paymentMethodRepository.save(pm);
if (makeDefault) {
    paymentMethodRepository.clearOtherDefaults(user, saved.getId());
}
```

- DB 에 들어가는 건 **`brand` + `last4`(뒤 4자리) + 소유자 + 만료**뿐. 전체 카드번호 `rawNumber` 는 메서드가 끝나면 사라짐.
- **기본 카드 단일성 보장:** 새 카드를 default 로 만들면 `clearOtherDefaults(user, savedId)` 로 **나머지 카드의 isDefault 를 일괄 false**(레포지토리의 `@Modifying UPDATE`). "기본 카드는 항상 1개"라는 불변식을 코드로 강제.
- `detectBrand` — 카드번호 앞자리로 브랜드 판정(4→VISA, 51-55/2221-2720→MASTERCARD, 34/37→AMEX, 35→JCB, 6→DISCOVER, 그 외 LOCAL). 표준 BIN 규칙.

#### D-3. 본인 소유 강제 — `PaymentMethodService.java:126-133`

```java
// L126-L133
@Transactional(readOnly = true)
public PaymentMethod requireOwned(Long userId, Long pmId) {
    User user = userRepository.findById(userId)
            .orElseThrow(() -> new IllegalArgumentException("사용자를 찾을 수 없습니다."));
    return paymentMethodRepository.findByIdAndUser(pmId, user)
            .orElseThrow(() -> new IllegalArgumentException("결제 수단을 찾을 수 없습니다."));
}
```

- `findByIdAndUser(pmId, user)` — **id 만으로 찾지 않고 "id AND 소유자"로 조회**. 남의 카드 id 를 넣어도 내 것이 아니면 못 찾음 → **IDOR**(다른 사용자 리소스 무단 접근) 방지. 삭제·기본설정 등 모든 변경 경로가 이 패턴을 씁니다.

---

### E. 컨트롤러·엔티티 요약 (REST 표면)

- **`PaymentMethodController`** (`/api/payment-methods`): `GET`(목록)·`POST`(등록)·`PATCH /{id}/default`(기본설정)·`DELETE /{id}`. 매 메서드 첫 줄이 `AuthContext.currentUserId()` → **null 이면 401**. 신원을 항상 JWT 에서만 취득(요청 body 의 userId 같은 건 신뢰 안 함 — 최근 커밋의 IDOR 차단 패턴과 동일).
- **`LedgerController`** (`/api/ledger/me`): 내 에스크로 이벤트를 가계부로. payer 의 `DEPOSITED→지출`·`REFUNDED→환불수입`, payee 의 `RELEASED→정산수입`. 카드/계좌 미등록이면 `linked:false` + 빈 목록(프론트가 안내 띄우게). 응답을 `LinkedHashMap` 으로 만들어 **키 순서 보존**.
- **`PaymentMethod`**(entity): `@Table(name="PAYMENT_METHODS")`, `last4 length=4`, `brand`는 `@Enumerated(STRING)`. 클래스 주석에 **"PCI 정책상 카드 전체번호·CVC 절대 저장 안 함"** 명시. `@CreatedDate`·`@UpdateTimestamp` 로 감사 시각 자동 기록.

---

### F. (링크) 결제 confirm 의 진짜 시작점 — `SubscriptionController`

> 위치: `domain/strategy/controller/SubscriptionController.java` (이 문서의 payment 도메인이 **아님** — 링크로만 연결). `TossPaymentsService` 를 주입받아 사용.

핵심은 **M8 멱등성** 2중 방어 — `SubscriptionController.java:79-104`:

```java
// L79-L84  ① 선조회 멱등 (가장 흔한 경로: 새로고침/더블클릭)
Subscription already = subscriptionService.findByPaymentKey(paymentKey);
if (already != null) {
    log.info("[Subscription] 멱등 confirm — 이미 처리된 결제 ...");
    return ResponseEntity.ok(idempotentBody(already, true));
}
```
```java
// L98-L104  ② DB 유니크 충돌 멱등 (동시 confirm 경합)
} catch (org.springframework.dao.DataIntegrityViolationException dup) {
    Subscription existing = subscriptionService.findByPaymentKey(paymentKey);
    if (existing != null) {
        return ResponseEntity.ok(idempotentBody(existing, true));
    }
    ...
}
```

- **방어 1 (선조회):** confirm 전에 `findByPaymentKey`(= `findByTossPaymentKey`)로 이미 처리된 결제인지 확인 → 있으면 **토스 재호출 없이** 기존 구독 반환. 새로고침·재시도·더블클릭의 99%를 여기서 막음.
- **방어 2 (DB 유니크):** 두 요청이 **동시에** 선조회를 통과해버린 경합(race)에서는, `subscription.toss_payment_key` 에 걸린 **DB 유니크 제약**(`uq_subscription_toss_payment_key`, 마이그레이션 `V17__subscription_payment_idempotency.sql`)이 두 번째 INSERT 를 막아 `DataIntegrityViolationException` 발생 → 먼저 성공한 구독을 재사용. **애플리케이션 검사 + DB 제약의 2중 그물**.
- 추가로 `VALID_PLANS`(9900/19900) 로 **금액 위변조**를 컨트롤러에서 한 번 더 검증(`SubscriptionController.java:29-32, 71-74`).

---

## ⚠️ 함정·보안 주의

1. **`APP_CRYPTO_KEY` 기본값 없음 → 미설정 시 부팅 실패.** `CryptoService` 생성자가 `@Value("${app.crypto.key}")`(콜론 없음)이라 키가 없으면 앱이 시작 못 함. 로컬에서도 반드시 Base64 32바이트 키를 설정. 이건 버그가 아니라 **의도된 fail-fast 안전장치**.

2. **`app.crypto.key` 중복정의 = 복호화 대참사.** 메모리 "Env priority changes need duplicate-key audit" 핵심: 같은 키가 `.env`/`application*.properties` 에 **다른 값**으로 중복되면, A 값으로 암호화한 KIS 시크릿을 B 값으로 복호화 시도 → `AEADBadTagException`("key mismatch") → 영영 못 읽음. 우선순위 변경 전 **반드시 중복 감사**. 시작 로그의 `sha256[0..8]` 지문으로 서버 간 키 일치 확인 가능.

3. **결제 멱등성(M8)은 2중이어야 한다.** 애플리케이션 선조회(`findByPaymentKey`)만으로는 동시 요청 경합을 못 막음. **DB 유니크 키(`uq_subscription_toss_payment_key`)가 최종 방어선**. 둘 중 하나만 있으면 더블 결제 위험.

4. **클라이언트 키 ↔ 시크릿 키 쌍 일치.** 프론트의 `test_ck_...` 와 서버의 `test_sk_...` 는 **같은 토스 계정**이어야 함. 다른 계정 키를 섞으면 confirm 이 토스에서 거부됨(CLAUDE.md 주의).

5. **웹훅 서명 검증은 운영 필수.** `tosspayments.webhook-secret` 이 비면 `TossWebhookController` 가 **검증을 skip** 함 → 운영에서 비워두면 **누구나 위조 웹훅으로 에스크로를 REFUNDED 로 조작** 가능. 반드시 운영에서 시크릿 주입. 또한 서명 검증은 **파싱 전 raw body**로 해야 일치(객체로 받으면 깨짐).

6. **금액 검증의 최종 책임은 서버.** 프론트가 보낸 `amount` 를 그대로 믿지 말고 `VALID_PLANS` 로 화이트리스트 검증 후 토스에 전달. 토스도 발급 금액과 대조하지만, 우리 측 1차 방어가 우선.

7. **시크릿 키·복호화 평문을 로그에 찍지 말 것.** `CryptoService` 가 키를 **지문(해시 앞 4바이트)으로만** 로깅하는 이유. confirm 로그도 `status`/`method` 만 남기고 카드정보는 안 남김.

8. **CVC·전체 카드번호 저장 금지(PCI).** `PaymentMethodService` 는 형식만 검사하고 `last4` 만 보관. 새 필드를 추가할 때 실수로 전체번호를 저장하지 않도록 주의.

9. **Jackson3(Boot4) JsonNode 함정.** `TossPaymentsService` 가 응답을 `String` 으로 받아 우리 `ObjectMapper` 로 파싱하는 건 메모리 "Spring Boot 4 Jackson JsonNode 버그" 우회. `JsonNode.class` 로 직접 받으면 깨질 수 있음.

---

## 🚀 고도화 아이디어

- **결제 예외 세분화:** 지금은 모두 `RuntimeException`. `TossDeclinedException`(토스 거절·재시도 무의미) vs `TossUnavailableException`(네트워크·일시장애·재시도 가치)로 나눠 confirm 에 Resilience4j Retry/CircuitBreaker 적용(전략 도메인 `AnalyticsClient` 패턴 재사용).
- **웹훅 멱등 테이블:** 현재는 상태 가드(if)로 멱등을 보장하지만, 토스 `eventId` 를 유니크로 가진 `webhook_event` 테이블에 먼저 INSERT 해 "이미 처리한 이벤트면 skip"하면 더 견고. 결제 confirm 의 M8 과 같은 철학.
- **키 회전(rotation):** AES 키 교체 시 기존 암호문을 못 읽는 문제 → 암호문에 **키 버전 prefix**(`v2:`)를 붙이고 `CryptoService` 가 버전별 키를 들고 복호화 → 무중단 키 회전.
- **타이밍 안전 비교:** `verifyHmac` 의 `equalsIgnoreCase` 는 이론상 타이밍 공격 표면. `MessageDigest.isEqual` 같은 상수시간 비교로 교체.
- **원장 성능:** `LedgerController` 가 payer/payee 에스크로를 전부 로드 후 메모리 정렬. 거래가 많아지면 페이지네이션 + DB 정렬/필터로 이전.
- **결제 멱등 응답 표준화:** confirm 성공/멱등 응답의 키(`tier`/`status`/`expiresAt`/`idempotent`)를 DTO 클래스로 통일해 프론트 계약을 명확히.
- **CryptoService 통합:** `CryptoService` 와 `AesGcmCryptoService` 가 둘 다 AES-GCM 인데 키 파생·반환형이 달라 혼동 위험. 하나로 통합하거나 역할 경계를 문서/네이밍으로 명확히.

---

## 📚 용어 사전 (이 도메인 한정)

| 용어 | 뜻 |
|---|---|
| **paymentKey** | 토스가 결제건마다 발급하는 고유 식별자. confirm·웹훅·멱등 키의 기준 |
| **orderId** | 우리(가맹점)가 만드는 주문 번호. 토스 confirm 에 함께 전달 |
| **confirm** | 서버가 토스 `/v1/payments/confirm` 호출 → 실제 청구 확정(동기) |
| **웹훅(Webhook)** | 토스가 우리 서버로 보내는 상태변경 푸시(비동기). `X-Toss-Signature` 로 검증 |
| **Basic Auth** | `base64(secretKey + ":")` 를 `Authorization: Basic` 헤더에 — 토스 인증 방식 |
| **AES-256-GCM** | 32바이트 키 대칭암호 + 인증 태그(위변조 탐지) |
| **IV / nonce** | 매 암호화마다 새로 만드는 12바이트 랜덤값. 같은 키+같은 IV 재사용 금지 |
| **GCM tag** | 16바이트 인증 태그. 복호화 시 안 맞으면 변조/키불일치로 거부 |
| **HMAC-SHA256** | 비밀키 기반 메시지 인증. 웹훅 서명(raw body 해시) 검증에 사용 |
| **멱등성(Idempotency)** | 같은 요청을 여러 번 해도 결과가 한 번과 동일. M8 = paymentKey 유니크 |
| **원장(Ledger)** | 거래내역 장부. 에스크로 이벤트를 수입/지출로 분류한 목록 |
| **에스크로(Escrow)** | 제3자 보관. 결제금을 중간 보관했다가 조건 충족 시 정산(payer↔payee) |
| **PCI-DSS** | 카드정보 보호 규제. 우리는 last4 만 저장해 적용 범위를 최소화 |
| **last4** | 카드번호 뒤 4자리. 식별용으로만 저장(전체번호·CVC 는 저장 안 함) |
| **Luhn 검사** | 카드번호 체크섬 검증. Mock 환경에선 통과시킴 |
| **IDOR** | 남의 리소스 id 로 무단 접근. `findByIdAndUser` 로 차단 |
| **fail-fast** | 잘못된 설정이면 시작 시점에 즉시 죽기(키 검증). 늦게 터지는 것보다 안전 |
