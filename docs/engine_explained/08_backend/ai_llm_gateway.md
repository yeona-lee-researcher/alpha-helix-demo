# `domain/ai` — 멀티 LLM · 게이트웨이 · 쿼터 (완전 라인별 해설)

> 원본 폴더: `backend/src/main/java/com/DevBridge/devbridge/domain/ai/`
> 전제: Spring 기초는 [`08_backend/00_spring_primer.md`] 를 먼저 읽었다고 가정합니다(`@Service`·`@RestController`·DI·`@Value` 등은 여기서 다시 풀어 설명하지 않습니다).
> 이 문서는 교재 표준 형식([`01_backtest/vbt_engine.md`])을 따릅니다.

---

## 📌 이 파트 한눈에

이 파트는 **"여러 AI 모델(Gemini·Claude·GPT·Perplexity)을 하나의 창구로 묶어 쓰고, 누가 얼마나 썼는지 관리하는 콜센터"** 입니다.

비유로 풀면 이렇습니다. 회사에 외국어 상담사가 4명 있다고 합시다 — 영어 담당(GPT), 한국어 담당(Gemini), 법률 전문(Claude), 최신뉴스 검색 담당(Perplexity). 고객(프론트엔드)이 질문을 던지면:

1. **접수 데스크(Controller)** 가 전화를 받고
2. **관리실(AiGatewayService)** 이 "이 고객이 이번 달 상담 시간을 다 썼나?"(쿼터)를 확인한 뒤
3. 적합한 **상담사(Provider)** 에게 연결하고
4. 통화가 끝나면 **통화 기록부(AiUsageLog)** 에 몇 분 썼는지 적습니다.

> ⚠️ 가장 먼저 알아야 할 핵심: 이 도메인에는 **AI 프로바이더 묶음이 두 벌(두 개의 평행 세계)** 존재합니다. 처음 보면 반드시 헷갈리니 표로 못박고 시작합니다.

| 구분 | `service/gateway/` 묶음 | `service/llm/` 묶음 |
|---|---|---|
| 공통 인터페이스 | `AiProvider` | `LlmProvider` |
| 조율자 | `AiGatewayService` (쿼터·로그) | `LlmRouter` (폴백 체인) |
| 진입 컨트롤러 | `AiController` (`/api/ai/**`) | `LlmController` (`/api/llm/**`) |
| 쿼터/사용로그 | **있음** (`AiUsageLog`·`AiModelCatalog`) | 없음 |
| 폴백(키 없으면 다른 모델로) | 없음 (못 쓰면 거부) | **있음** (`defaultProvider()`) |
| 토큰 사용량 추적 | **있음** (`Result.tokensIn/Out`) | 없음 |
| 용도 | 로그인 사용자 메인 채팅 + 한도 청구 근거 | 우측 도크 "Quick Ask" 자유 채팅 |

두 묶음은 **같은 4개 외부 API(Gemini·Anthropic·OpenAI·Perplexity)를 호출하지만, 목적이 달라 코드가 분리**돼 있습니다. 이 문서는 주로 **쿼터·로그가 있는 `gateway` 묶음**을 깊게 파고, `llm` 묶음의 **폴백 체인**을 그 다음으로 다룹니다.

### 핵심 클래스 역할표

| 클래스 | 위치 | 한 줄 역할 | 비유 |
|---|---|---|---|
| `AiGatewayService` | `service/gateway/` | 쿼터 확인 → 프로바이더 라우팅 → 사용량 로깅 | 콜센터 관리실(시간 체크·연결·기록) |
| `AiProvider` (interface) | `service/gateway/` | 4개 프로바이더의 공통 규격 (`chat`/`oneShot`/`isAvailable`) | 상담사 직무 표준서 |
| `GeminiProvider` | `service/gateway/` | 기존 `GeminiService`를 `AiProvider`로 감싸는 어댑터 | 베테랑 직원을 표준 양식에 맞춰 등록 |
| `AnthropicProvider`/`OpenAiProvider`/`PerplexityProvider` | `service/gateway/` | 각 외부 API 직접 HTTP 호출 + 토큰 사용량 파싱 | 각 언어 상담사 |
| `GeminiService` | `service/` | Gemini REST API 실제 호출(429 폴백·재시도 포함) | 가장 바쁜 한국어 상담사 본체 |
| `AiModelCatalog` (entity) | `entity/` | 쓸 수 있는 모델 목록 + Free/Pro 월 한도 | 상담 메뉴판(요금표) |
| `AiUsageLog` (entity) | `entity/` | 호출 1건당 토큰·성공여부 기록 | 통화 기록부 |
| `LlmRouter` | `service/llm/` | providerId로 라우팅 + 키 없으면 폴백 | 자유 상담용 교환원 |
| `AiRateLimitFilter` | `global/config/` | 시간당 횟수 제한(20회/시간) | 콜센터 입구 회전문(과밀 차단) |

---

## 🧠 사전 지식 (이거 모르면 막힘)

#### 1) LLM 프로바이더(provider)란?
- **LLM(Large Language Model, 대형 언어 모델)** = "글을 이해하고 글을 생성하는 AI". ChatGPT가 대표적.
- **프로바이더** = 그 LLM을 인터넷 너머에서 빌려주는 회사. 우리는 4곳을 씁니다:
  - **Gemini**(Google) — 기본·범용·빠름
  - **Anthropic Claude** — 복잡 추론·코드·전략 정형화
  - **OpenAI GPT** — 범용 멀티모달
  - **Perplexity Sonar** — 웹검색 기반(출처를 붙여줌)
- 각 회사 API는 **HTTP로 JSON을 주고받는 방식**이 미묘하게 다릅니다. 그래서 "공통 규격(인터페이스)"으로 감싸 한 줄로 호출할 수 있게 만듭니다.

#### 2) 인터페이스 + 구현체 묶음 주입 (이 파트의 설계 핵심)
- Java `interface` = "이런 메서드를 가져야 한다"는 **계약서**. `AiProvider`가 그것.
- `GeminiProvider`, `AnthropicProvider` 등은 그 계약을 **구현(implements)** 한 실제 일꾼.
- Spring의 마법: 생성자에 `List<AiProvider> providers` 라고 적으면, **그 인터페이스를 구현한 모든 `@Component`를 자동으로 리스트에 담아** 넣어줍니다. (콜센터 관리실이 "AiProvider 자격증 가진 직원 전원 명단"을 자동으로 받는 셈.)
- 그래서 새 프로바이더를 추가하려면 → `AiProvider` 구현 클래스 하나 만들고 `@Component` 붙이면 끝. 관리실 코드는 안 건드림.

#### 3) 쿼터(quota) vs 레이트리밋(rate limit) — 둘은 다릅니다!
초보가 가장 헷갈리는 지점입니다. 이 시스템은 **2층 방어선**을 씁니다.

| | 쿼터(Quota) | 레이트리밋(Rate Limit) |
|---|---|---|
| 단위 | **토큰 수**(글자량) | **요청 횟수** |
| 기간 | **한 달** | **1시간** |
| 누가 | `AiGatewayService` (DB로 누적 합산) | `AiRateLimitFilter` (메모리 버킷) |
| 비유 | 월 데이터 요금제 GB 한도 | 1분에 문자 N개 발송 제한(스팸 방지) |
| 초과 시 | `IllegalStateException`("한도 초과") | HTTP 429 즉시 응답 |

- **쿼터**는 "이번 달 너무 많이 썼나(비용)"를 막고, **레이트리밋**은 "짧은 시간에 폭주(서버 과부하·악용)"를 막습니다. 둘 다 통과해야 실제 AI 호출이 일어납니다.

#### 4) 토큰(token)이란?
- AI는 글을 "토큰"이라는 조각 단위로 셉니다. 대략 **영어 4자 ≈ 1토큰, 한글은 더 잘게**.
- 입력 토큰(`tokensIn`, 내가 보낸 질문)과 출력 토큰(`tokensOut`, AI가 답한 글) 둘 다 비용에 포함됩니다.
- 외부 API는 보통 응답 JSON의 `usage` 필드에 정확한 토큰 수를 담아줍니다. **단, Gemini 어댑터는 그걸 안 쓰고 글자수로 추정**합니다(뒤에서 설명).

#### 5) 폴백 체인(fallback chain)이란?
- "1순위가 안 되면 2순위, 그것도 안 되면 3순위"로 자동 전환하는 사다리.
- 여기엔 **두 종류의 폴백**이 있어 헷갈리기 쉽습니다:
  - **프로바이더 폴백** (`LlmRouter`): "Gemini 키가 없으면 → OpenAI로" 처럼 **회사를 바꿈**.
  - **모델 폴백** (`GeminiService` 내부): "gemini-2.5-flash가 429(한도초과)면 → gemini-2.0-flash로" 처럼 **같은 회사 안에서 모델만 바꿈**.

#### 6) `@Value("${키:기본값}")` — 환경변수 주입
- `@Value("${anthropic.api.key:}")` 는 "설정에서 `anthropic.api.key`를 읽되, **없으면 빈 문자열**(`:` 뒤가 기본값)" 이라는 뜻.
- 그래서 API 키를 안 넣어도 앱은 죽지 않고, `available()`이 `false`가 되어 그 프로바이더만 비활성화됩니다. (Gemini만은 예외 — 뒤 함정 참고.)

---

## 🗺 요청 흐름도

```
[프론트엔드] POST /api/ai/chat  (JWT 쿠키 포함)
        │
        ▼
┌─────────────────────────────────────────────┐
│  AiRateLimitFilter  (※ /api/alpha/** 경로만)   │  ← 횟수 제한(20회/시간)
│  ※ /api/ai/chat 은 이 필터 대상 아님(아래 함정) │
└─────────────────────────────────────────────┘
        │
        ▼
┌─────────────────────────────────────────────┐
│  AiController.chat()                          │  접수 데스크
│  - AuthContext.currentUserId() 로 신원 확인    │
│  - 비로그인 → GeminiService 직접 (게이트 우회)  │
│  - 로그인  → AiGatewayService.chat()           │
└─────────────────────────────────────────────┘
        │ (로그인 사용자)
        ▼
┌─────────────────────────────────────────────┐
│  AiGatewayService.chat(userId, modelId, req)  │  관리실
│  ① ensureUsable() — 모델 존재? 활성? 쿼터 OK?  │ ──거부──▶ IllegalStateException
│  ② providerFor()  — modelId의 provider 매칭    │
│  ③ provider.chat() 호출                        │
│  ④ recordUsage()  — 성공/실패 모두 로그 저장    │
└─────────────────────────────────────────────┘
        │
        ▼
┌─────────────────────────────────────────────┐
│  GeminiProvider / AnthropicProvider / ...     │  상담사(어댑터)
│  → 실제 외부 API HTTP POST (JSON)              │
│  → 응답 텍스트 + 토큰 사용량(Result) 반환       │
└─────────────────────────────────────────────┘
        │
        ▼
   DB: AI_USAGE_LOG  (이번 달 누적 토큰 ← 다음 쿼터 계산에 사용)


[별개 경로]  POST /api/llm/chat (자유 채팅)
        │
        ▼
   LlmController → LlmRouter.get(providerId)
        │            └─ 키 없으면 defaultProvider() 로 폴백
        ▼
   LlmProvider.oneShot()  → 외부 API (쿼터/로그 없음)
```

---

## 📖 핵심 클래스 라인별 심화

### A. `AiProvider` 인터페이스 — 모든 상담사의 표준서 (`service/gateway/AiProvider.java`)

```java
// AiProvider.java:9-25
public interface AiProvider {
    String providerKey();                 // "GEMINI" / "ANTHROPIC" / "OPENAI" / "PERPLEXITY"
    boolean isAvailable();                // API 키 보유 여부 (없으면 게이트웨이가 거부)
    Result chat(String modelId, AiChatRequest request);                              // 멀티턴 채팅
    Result oneShot(String modelId, String systemInstruction, String userPrompt, boolean wantJson); // 단발
    record Result(String text, long tokensIn, long tokensOut) {}  // 결과 + 토큰
}
```

- 이 4개 메서드가 **"AI 상담사라면 반드시 할 수 있어야 하는 일"** 입니다. 4개 구현체가 각자 다른 방식으로 이 계약을 지킵니다.
- `providerKey()` — 자기가 누구인지 대문자 키로 알려줌. `AiGatewayService`가 모델의 provider와 이 키를 **문자열 비교**해 짝을 찾습니다(아래 `providerForOpt`).
- `isAvailable()` — "지금 일할 수 있냐"(API 키가 있냐). 키 없는 상담사는 명단에는 있되 회색 처리됩니다.
- `Result` 는 **record**(불변 데이터 묶음). 응답 글(`text`) + 입력 토큰 + 출력 토큰 3개를 한 봉투에 담아 반환. 이 토큰 숫자가 곧 쿼터 차감량입니다.

> 💡 초보 포인트: `chat`은 **대화 히스토리 전체**(여러 턴)를 받고, `oneShot`은 **시스템 지시 + 질문 한 개**만 받는 단발성. 채팅창은 `chat`, "이 텍스트에서 JSON 뽑아줘" 같은 일회성 작업은 `oneShot`.

---

### B. `AiGatewayService` — 관리실 (이 파트의 알맹이) (`service/gateway/AiGatewayService.java`)

#### B-1. 의존성 주입: 프로바이더 "전원 명단" 받기 — `L32-L37`

```java
// AiGatewayService.java:32-37
public class AiGatewayService {
    private final AiModelCatalogRepository catalogRepo;   // 모델 메뉴판 조회
    private final AiUsageLogRepository usageRepo;         // 사용량 기록/합산
    private final SubscriptionService subscriptionService;// 이 유저가 Free냐 Pro냐
    private final List<AiProvider> providers;             // ★ AiProvider 구현 전원
```

- 마지막 줄이 사전지식 2번의 마법입니다. `List<AiProvider>` 라고만 적으면 Spring이 `GeminiProvider`, `AnthropicProvider`, `OpenAiProvider`, `PerplexityProvider` **4개를 모두 담아** 주입합니다.
- 관리실은 "직원이 몇 명인지·누구인지" 하드코딩하지 않습니다. 새 직원(프로바이더)이 와도 이 코드는 그대로.

#### B-2. `chat()` — 한 번의 호출 전체 흐름 — `L40-L52`

```java
// AiGatewayService.java:40-52
public String chat(Long userId, String modelId, AiChatRequest request) {
    AiModelCatalog model = ensureUsable(userId, modelId);   // ① 쿼터·존재 검증
    AiProvider provider = providerFor(model);               // ② 담당 상담사 찾기
    AiProvider.Result result;
    try {
        result = provider.chat(model.getModelId(), request);// ③ 실제 호출
        recordUsage(userId, modelId, result.tokensIn(), result.tokensOut(), true, null); // ④ 성공 로그
        return result.text();
    } catch (RuntimeException e) {
        recordUsage(userId, modelId, 0, 0, false, e.getMessage());  // ④' 실패도 로그
        throw e;
    }
}
```

- **4단계 파이프라인**이 한눈에 보입니다: 검증 → 라우팅 → 호출 → 기록.
- 핵심 설계: **성공이든 실패든 반드시 `recordUsage`를 호출**합니다(`try`에서 성공, `catch`에서 실패). 실패는 토큰 0으로 기록하되 에러 메시지를 남겨 "왜 실패했나" 추적이 됩니다.
- 실패 시 `throw e`로 **에러를 다시 던집니다** — 로그만 남기고 삼키지 않음. 그래야 컨트롤러가 사용자에게 에러를 알려줄 수 있습니다.

> 💡 초보 포인트: `oneShot()`(L54-66)도 구조가 완전히 같습니다 — 검증→라우팅→호출→로그. `chat` 대신 `provider.oneShot`을 부르는 것만 다릅니다. **이런 반복 구조를 "템플릿"** 이라 부르며, 익혀두면 코드가 빠르게 읽힙니다.

#### B-3. `ensureUsable()` — 쿼터 가드 (가장 중요한 검증) — `L105-L123`

```java
// AiGatewayService.java:105-123
private AiModelCatalog ensureUsable(Long userId, String modelId) {
    AiModelCatalog model = catalogRepo.findById(modelId)
            .filter(AiModelCatalog::isEnabled)              // 비활성 모델이면 빈 Optional
            .orElseThrow(() -> new IllegalArgumentException("알 수 없거나 비활성화된 모델: " + modelId));

    Subscription.Tier tier = subscriptionService.currentTier(userId);   // FREE or PRO
    long quota = (tier == Subscription.Tier.PRO) ? model.getProQuota() : model.getFreeQuota();
    if (quota == 0) {
        throw new IllegalStateException("이 모델은 Pro 전용입니다. (" + model.getDisplayName() + ")");
    }
    if (quota != -1) {                                       // -1 = 무제한이면 검사 스킵
        LocalDateTime monthStart = LocalDateTime.now().withDayOfMonth(1).withHour(0).withMinute(0).withSecond(0);
        long used = usageRepo.sumTokensByUserAndModelSince(userId, modelId, monthStart);
        if (used >= quota) {
            throw new IllegalStateException("이번 달 사용 한도(" + quota + " 토큰)를 초과했습니다.");
        }
    }
    return model;
}
```

이 메서드가 **쿼터 시스템의 심장**입니다. 한 줄씩 풀어봅니다.

1. **모델 존재·활성 검증**: 메뉴판(`catalogRepo`)에서 `modelId`를 찾고, `.filter(isEnabled)`로 "꺼진 모델"을 걸러냅니다. 없으면 `IllegalArgumentException`.
2. **티어 확인**: `subscriptionService.currentTier(userId)`로 이 사용자가 무료(`FREE`)인지 유료(`PRO`)인지 판정. (결제 도메인과 연결되는 지점.)
3. **한도 선택**: Pro면 `proQuota`, 아니면 `freeQuota`. 한도는 **숫자 3종 의미**가 있습니다:
   - `0` → **Pro 전용**(Free는 못 씀) → 즉시 거부
   - `-1` → **무제한** → 사용량 검사 자체를 건너뜀
   - 그 외 양수 → 월 토큰 한도
4. **이번 달 누적 합산**: `monthStart`(이번 달 1일 00:00)부터 지금까지 이 유저가 이 모델로 쓴 토큰 합(`sumTokensByUserAndModelSince`). `used >= quota`면 거부.

> ⚠️ 초보가 놓치는 포인트: `withDayOfMonth(1).withHour(0)...` 은 "이번 달 1일 자정"을 만드는 것. **`withMinute`·`withSecond`는 0으로 맞추지만 나노초(`withNano`)는 안 건드립니다** — 합산 쿼리가 `>= since`라 1일 0시 0분 0초 이후를 다 포함하므로 실무상 문제는 없지만, 정밀하게는 `.withNano(0)`까지 넣는 게 깔끔합니다(고도화 항목).

#### B-4. 쿼터 합산 쿼리 — `AiUsageLogRepository.java:13-20`

```java
// AiUsageLogRepository.java:13-20
@Query("""
    SELECT COALESCE(SUM(u.tokensIn + u.tokensOut), 0)
    FROM AiUsageLog u
    WHERE u.userId = :uid AND u.modelId = :model AND u.createdAt >= :since AND u.success = true
""")
long sumTokensByUserAndModelSince(@Param("uid") Long uid, @Param("model") String modelId, @Param("since") LocalDateTime since);
```

- **`tokensIn + tokensOut`을 함께 합산** — 입력·출력 모두 비용이므로.
- `COALESCE(..., 0)` — 호출 기록이 하나도 없으면 `SUM`이 `null`을 주는데, 이걸 `0`으로 바꿔줍니다(NPE 방지). 신규 유저는 0으로 시작.
- **`u.success = true`** — **실패한 호출은 쿼터에서 빼지 않습니다.** API 에러로 답을 못 받았으면 토큰을 안 깎는 게 공정. (실패 로그는 남되 합산에는 불포함.)
- 이 쿼리가 `AiUsageLog` 엔티티의 **복합 인덱스 `ix_aiusage_user_model_time (user_id, model_id, created_at)`** 을 그대로 탑니다 — 그래서 사용량이 쌓여도 빠릅니다.

#### B-5. `providerForOpt()` — 모델 → 상담사 매칭 — `L130-L133`

```java
// AiGatewayService.java:130-133
private java.util.Optional<AiProvider> providerForOpt(AiModelCatalog model) {
    String key = model.getProvider().name();                         // 예: "ANTHROPIC"
    return providers.stream().filter(p -> p.providerKey().equals(key)).findFirst();
}
```

- 모델 메뉴판의 `provider`(enum) 이름과, 주입된 4개 프로바이더의 `providerKey()`를 **문자열로 비교**해 짝을 찾습니다.
- 예: 사용자가 `claude-sonnet-4` 모델을 고르면 → 그 모델의 provider는 `ANTHROPIC` → `providerKey()=="ANTHROPIC"`인 `AnthropicProvider`로 연결.
- `Optional`로 감싼 이유: 짝이 없을 수도 있어서. `providerFor()`(L125-128)는 짝이 없으면 예외를, `listModelsFor`는 "사용불가(회색)"로 표시.

#### B-6. `listModelsFor()` — UI 모델 선택기 데이터 — `L70-L95`

```java
// AiGatewayService.java:74-94 (요약)
return catalogRepo.findByEnabledTrueOrderBySortOrderAsc().stream().map(m -> {
    long quota = (tier == Subscription.Tier.PRO) ? m.getProQuota() : m.getFreeQuota();
    long used = usageRepo.sumTokensByUserAndModelSince(userId, m.getModelId(), monthStart);
    boolean providerOk = providerForOpt(m).map(AiProvider::isAvailable).orElse(false);
    boolean unlocked = quota != 0 || tier == Subscription.Tier.PRO;
    boolean usable = providerOk && unlocked && (quota == -1 || used < quota);
    long remaining = (quota == -1) ? Long.MAX_VALUE : Math.max(0, quota - used);
    return Map.<String, Object>of( "modelId", ..., "quota", quota, "used", used,
        "remaining", remaining == Long.MAX_VALUE ? -1 : remaining,
        "usable", usable, "lockReason", lockReason(...) );
}).toList();
```

- 프론트의 **모델 드롭다운**에 뿌릴 데이터를 모델마다 한 줄씩 만듭니다.
- **`usable` 3조건 AND**: ① 프로바이더 키가 있고(`providerOk`) ② 잠금 해제됐고(`unlocked`, Pro전용 아님) ③ 한도 안 넘었다. 셋 다 참이어야 선택 가능.
- `remaining`이 무제한(`-1` 표시)일 땐 내부적으로 `Long.MAX_VALUE`를 쓰다가 응답 직전 `-1`로 변환 — 프론트는 `-1`을 "무제한"으로 해석.
- `lockReason`(L97-102)은 못 쓰는 이유를 **사람 말로** 돌려줍니다: "API 키 미설정" / "Pro 전용" / "이번 달 한도 초과". 사용자가 왜 회색인지 알 수 있게.

> 💡 `listModelsFor`에는 `@Transactional(readOnly = true)`(L69)가 붙어 있습니다. **읽기 전용 트랜잭션** — 여러 번의 DB 조회를 한 트랜잭션으로 묶어 일관성을 보장하고, 쓰기가 없음을 명시해 약간의 최적화도 얻습니다.

#### B-7. `recordUsage()` — 통화 기록부 작성 — `L135-L148`

```java
// AiGatewayService.java:135-148
private void recordUsage(Long userId, String modelId, long tIn, long tOut, boolean ok, String err) {
    try {
        usageRepo.save(AiUsageLog.builder()
                .userId(userId).modelId(modelId)
                .tokensIn(tIn).tokensOut(tOut)
                .success(ok)
                .errorMessage(err == null ? null : err.substring(0, Math.min(err.length(), 500)))
                .build());
    } catch (Exception e) {
        log.warn("AiUsageLog 저장 실패 (무시): {}", e.getMessage());
    }
}
```

- `errorMessage`를 **최대 500자로 자릅니다**(`substring(0, min(len, 500))`). 엔티티의 `length=500` 컬럼을 넘지 않게. (긴 스택트레이스가 와도 DB 저장 실패 안 함.)
- **로그 저장 실패는 통째로 삼킵니다**(`catch`에서 `log.warn`만). "기록부 작성이 실패해도 사용자 응답은 이미 나갔으니 무너지면 안 된다"는 판단. 로깅은 부수 작업이라 본 흐름을 막지 않습니다.

---

### C. `GeminiProvider` 어댑터 — 베테랑을 표준 양식에 끼우기 (`service/gateway/GeminiProvider.java`)

이 클래스는 **다른 3개 프로바이더와 결이 다릅니다.** 직접 HTTP를 치지 않고, 기존 `GeminiService`를 **감싸기(어댑터 패턴)** 만 합니다.

```java
// GeminiProvider.java:22-36
@Override
public Result chat(String modelId, AiChatRequest request) {
    String text = geminiService.chat(request);          // ← 실제 일은 GeminiService가 함
    long tIn = estimateTokens(buildPromptText(request)); // ← 토큰은 "추정"
    long tOut = estimateTokens(text);
    return new Result(text, tIn, tOut);
}
```

```java
// GeminiProvider.java:49-53
/** 영문 ~4자=1토큰, 한글 ~1.5자=1토큰. 보수적으로 chars/3 사용. */
static long estimateTokens(String s) {
    if (s == null || s.isEmpty()) return 0;
    return Math.max(1, s.length() / 3);
}
```

- ⚠️ **핵심 차이**: Anthropic/OpenAI/Perplexity는 응답 JSON의 `usage` 필드에서 **정확한 토큰 수**를 읽지만, GeminiProvider는 **글자수 ÷ 3으로 추정**합니다(`estimateTokens`). 주석에도 "정확한 사용량은 Gemini usageMetadata 파싱 필요"라고 명시 — 즉 **알려진 부정확성**입니다.
- `chars/3`을 쓰는 이유: 한글은 1.5자/토큰, 영어는 4자/토큰이라 섞이면 평균이 애매한데, **3으로 나누면 약간 과대추정**(보수적)이 됩니다. 쿼터를 약간 빡빡하게 잡아 "초과 미허용" 쪽으로 안전.
- `modelId` 파라미터를 **받지만 안 씁니다** — `geminiService.chat`이 내부 기본 모델을 쓰기 때문(현재 구조의 한계). 고도화 항목.

> 💡 어댑터 패턴이란: "기존에 잘 돌던 클래스(`GeminiService`)를, 새 표준 인터페이스(`AiProvider`)에 맞게 변환기를 씌워 재사용"하는 기법. 콘센트 모양이 달라도 **돼지코 어댑터**로 꽂는 것과 같습니다.

---

### D. `GeminiService` — 실제 Gemini API 호출 본체 (`service/GeminiService.java`)

이게 진짜로 인터넷 너머 Google에 HTTP를 치는 곳입니다. 가장 정교한 에러 처리가 들어있습니다.

#### D-1. 모델 레벨 폴백 — `L181-L205`

```java
// GeminiService.java:181-205 (요약)
private Map<String, Object> generateContent(Map<String, Object> body) {
    try {
        return postGenerateContent(model, body, true);          // 1순위: 기본 모델
    } catch (HttpClientErrorException.TooManyRequests primary429) {
        if (fallbackModel == null || fallbackModel.isBlank() || fallbackModel.equals(model)) {
            throw new RuntimeException(buildQuotaMessage(...), primary429); // 폴백 없으면 친절한 메시지
        }
        log.warn("Gemini 429 on primary model {}. Falling back to {}.", model, fallbackModel);
        return postGenerateContent(fallbackModel, body, false); // 2순위: 폴백 모델
    } catch (HttpClientErrorException e) {
        if (e.getStatusCode().value() == 403 && fallbackModel 존재) {
            return postGenerateContent(fallbackModel, body, false);  // 403도 폴백
        }
        throw e;
    }
}
```

- **429(Too Many Requests, 한도초과)** 와 **403(Forbidden, 접근불가)** 둘 다 → 폴백 모델로 한 번 더 시도.
- 이것이 사전지식 5번의 **"같은 회사 안에서 모델만 바꾸는 폴백"**(`gemini-2.5-flash` → 폴백). `LlmRouter`의 "회사 자체를 바꾸는 폴백"과 다릅니다.

#### D-2. 429 본문 파싱 — `L227-L251`

```java
// GeminiService.java:227-247 (요약)
private Quota429Info parse429Info(HttpClientErrorException e) {
    String body = e.getResponseBodyAsString();
    boolean isFreeTier = body.contains("free_tier") || body.contains("FreeTier");
    boolean isDailyQuota = body.contains("PerDay") || body.contains("GenerateRequestsPerDay");
    long retryDelayMs = 5_000L;
    int rdIdx = body.indexOf("\"retryDelay\"");
    if (rdIdx >= 0) { /* "retryDelay":"52.98s" 형식에서 52.98 추출 → ms */ }
    return new Quota429Info(isFreeTier, isDailyQuota, retryDelayMs);
}
```

- Google이 보낸 429 응답 본문에서 **"무료 티어인가 / 일간 한도인가 / 몇 초 기다리라는가"** 를 추출.
- 흥미로운 점: **JSON 파서(Jackson)를 안 쓰고 문자열 검색**(`contains`/`indexOf`)으로 처리합니다. 주석에 "Jackson 의존 없이 처리"라고 명시. (메모리의 *Spring Boot 4 Jackson JsonNode 버그* 회피와 같은 맥락 — 단순 추출엔 문자열 검색이 더 안전.)
- 추출 결과로 메시지를 다르게 만듭니다(`buildQuotaMessage`, L208-221): 일간 무료 한도 소진이면 "결제 활성화하라", RPM 초과면 "N초 후 재시도".

#### D-3. RPM 재시도 with 백오프 — `L254-L294`

```java
// GeminiService.java:271-290 (요약)
} catch (HttpClientErrorException.TooManyRequests e) {
    Quota429Info info = parse429Info(e);
    if (info.isFreeTier() && info.isDailyQuota()) {
        throw e;   // 일간 한도는 기다려도 무의미 → 즉시 던짐 → 상위에서 모델 폴백
    }
    if (attempt >= maxAttempts) throw e;
    long waitMs = Math.min(info.retryDelayMs(), 60_000L);  // API가 알려준 만큼, 최대 60초
    sleepMs(waitMs);   // 기다렸다가 1회 재시도
}
```

- **두 종류의 429를 구분**합니다:
  - **일간 무료 한도 소진**(`isDailyQuota`) → 기다려도 안 풀림 → 즉시 던져서 상위가 **모델 폴백**하게.
  - **RPM(분당 요청) 초과** → API가 알려준 `retryDelay`만큼 기다렸다 **1회 재시도**(최대 60초 캡).
- `sleepMs`(L296-303)는 `Thread.sleep` 중 인터럽트가 오면 플래그를 복원(`Thread.currentThread().interrupt()`)하고 예외를 던집니다 — **올바른 인터럽트 처리 관례**.

> ⚠️ 함정: `postGenerateContent`은 응답을 `Map.class`로 받습니다(L270). 이건 메모리의 *Spring Boot 4 Jackson JsonNode 버그*를 피하려는 선택 — `JsonNode`로 받으면 Boot4(Jackson3 기본)에서 bean 속성 변환이 깨지므로 `Map`/`String`으로 받습니다. (gateway의 다른 프로바이더들은 `String`으로 받아 직접 `ObjectMapper`로 파싱.)

---

### E. `LlmRouter` — 폴백 체인의 본진 (`service/llm/LlmRouter.java`)

이제 **두 번째 평행 세계**입니다. 쿼터·로그가 없는 대신 **프로바이더 폴백**이 핵심.

```java
// LlmRouter.java:11-36
public class LlmRouter {
    private final Map<String, LlmProvider> providers;
    private final List<LlmProvider> ordered;

    public LlmRouter(List<LlmProvider> providers) {
        this.ordered = providers;                                          // Bean 주입 순서 보존
        this.providers = providers.stream().collect(Collectors.toMap(LlmProvider::id, p -> p)); // id→provider 맵
    }

    public LlmProvider get(String id) {
        if (id == null || id.isBlank()) return defaultProvider();
        LlmProvider p = providers.get(id);
        if (p == null || !p.available()) return defaultProvider();         // ★ 없거나 키 없으면 폴백
        return p;
    }

    public LlmProvider defaultProvider() {
        return ordered.stream()
            .filter(LlmProvider::available)                                 // 키 있는 첫 프로바이더
            .findFirst()
            .orElseThrow(() -> new IllegalStateException("사용 가능한 LLM 프로바이더가 없습니다. ..."));
    }
}
```

- **두 가지 자료구조**를 동시에 보관:
  - `ordered` (List) — **주입 순서 그대로**(UI 표시 순서·폴백 우선순위). Spring은 보통 `@Component` 발견 순/알파벳 순으로 주입.
  - `providers` (Map) — `id`("gemini"/"anthropic"/...)로 **O(1) 빠른 조회**.
- **폴백 로직**은 `get()`에 응축돼 있습니다: 요청한 provider가 **없거나(`p == null`) 키가 없으면(`!p.available()`)** → `defaultProvider()`로 자동 대체.
- `defaultProvider()` = `ordered`에서 **available()이 참인 첫 번째**. CLAUDE.md의 "Gemini → OpenAI → Anthropic → Perplexity 폴백 체인"이 바로 이 순서대로 사다리를 타는 것(주입 순서에 의존).

> ⚠️ 주의: 이 폴백은 **"호출 전 가용성 검사"** 기반입니다. 즉 "키가 설정돼 있나"만 보고 고릅니다. 고른 프로바이더가 **호출 중에 실패하면**(예: 일시적 5xx) 다른 프로바이더로 자동 재시도하지는 **않습니다** — `oneShot`의 예외가 그대로 컨트롤러로 올라갑니다. (고도화: 런타임 실패 시 다음 프로바이더로 재시도.)

#### E-1. 두 LLM 묶음의 프로바이더는 어떻게 다른가?

`service/llm/`의 프로바이더(`AnthropicProvider` 등)는 gateway 버전과 **별개 클래스**입니다. 차이를 표로:

| | `service/gateway/*Provider` | `service/llm/*Provider` |
|---|---|---|
| 인터페이스 | `AiProvider` | `LlmProvider` |
| 모델 목록 노출 | 없음(카탈로그 DB가 담당) | `models()` 메서드로 하드코딩 노출 |
| 토큰 사용량 | `usage`에서 정확히 파싱 | 파싱 안 함(반환 안 함) |
| 멀티턴 `chat` | 있음 | 없음(`oneShot`만) |
| 기본 모델 | 카탈로그의 `modelId` 사용 | 메서드 내 하드코딩(`claude-sonnet-4-5` 등) |

- 예를 들어 `service/llm/AnthropicProvider`(L38-44)는 모델 목록을 코드에 직접 적어 `/api/llm/providers`로 노출합니다 — 우측 도크 모델 선택기용.
- `service/gateway/AnthropicProvider`(L97-98)는 응답에서 `usage.input_tokens`/`output_tokens`를 읽어 **정확한 쿼터 차감**을 합니다.

---

### F. 엔티티 — 메뉴판과 기록부 (`entity/`)

#### F-1. `AiModelCatalog` — 모델 메뉴판(요금표)

```java
// AiModelCatalog.java:39-53 (핵심 필드)
@Column(name = "free_quota", nullable = false) private long freeQuota;  // 0이면 Free 사용 불가
@Column(name = "pro_quota", nullable = false)  private long proQuota;   // -1이면 무제한
@Column(name = "sort_order", nullable = false) private int sortOrder;   // UI 정렬
@Column(nullable = false)                      private boolean enabled; // 비활성 토글
```

- `@Id`가 **`modelId`(문자열)** 입니다(L22-24) — 숫자 자동증가가 아니라 `"gemini-2.5-flash"` 같은 모델명 자체가 기본키. 그래서 `catalogRepo.findById("claude-sonnet-4")`가 가능.
- `freeQuota=0` / `proQuota=-1` 의 **매직 넘버 규약**(0=금지, -1=무제한)이 `AiGatewayService` 곳곳의 `if (quota == 0)`·`if (quota != -1)` 분기와 짝을 이룹니다. **이 약속을 모르면 게이트웨이 코드가 안 읽힙니다.**

#### F-2. `AiUsageLog` — 호출 기록부

```java
// AiUsageLog.java:13-16 (인덱스)
@Table(name = "AI_USAGE_LOG", indexes = {
        @Index(name = "ix_aiusage_user_time", columnList = "user_id, created_at"),
        @Index(name = "ix_aiusage_user_model_time", columnList = "user_id, model_id, created_at")
})
```

```java
// AiUsageLog.java:53-56
@PrePersist
void onCreate() {
    if (createdAt == null) createdAt = LocalDateTime.now();
}
```

- **복합 인덱스 2개**: 쿼터 합산 쿼리(`user_id + model_id + created_at`)와 사용자별 시간순 조회를 빠르게. 인덱스를 미리 깔아둔 게 **"이 테이블은 자주 합산·조회된다"는 설계 의도**를 드러냅니다.
- `@PrePersist`: 저장 직전 `createdAt`을 자동으로 현재 시각으로. 주석 클래스 설명대로 "월간 한도 계산 + Pro 결제 청구 근거"가 이 테이블의 존재 이유.

---

### G. 컨트롤러 — 접수 데스크 (`controller/`)

#### G-1. `AiController` — 메인 채팅 (`controller/AiController.java`)

```java
// AiController.java:27-38 (핵심)
public ResponseEntity<AiChatResponse> chat(@RequestBody AiChatRequest request) {
    Long uid = AuthContext.currentUserId();
    String reply;
    if (uid == null) {
        reply = geminiService.chat(request);                          // 비로그인 → 게이트 우회
    } else {
        String model = (request.getModel() 비었으면) DEFAULT_MODEL : request.getModel();
        reply = gateway.chat(uid, model, request);                    // 로그인 → 게이트웨이
    }
    return ResponseEntity.ok(AiChatResponse.builder().reply(reply).build());
}
```

- **분기 핵심**: 신원(`AuthContext.currentUserId()`)이 **null(비로그인)이면 `GeminiService` 직접 호출** — 쿼터/로그를 건너뜁니다. 로그인 상태에서만 게이트웨이(쿼터·로그)를 탑니다.
- ⚠️ 이 우회는 **의도이자 위험**입니다. 비로그인 경로는 쿼터가 없어 무제한 Gemini 호출이 가능 — 인증을 강제하지 않으면 비용 폭탄이 될 수 있습니다(함정 섹션 참고).
- 에러를 **3종으로 구분**(L39-50)해 적절한 HTTP 상태로: `HttpClientErrorException`→500, `IllegalState/Argument`(쿼터·잘못된 모델)→400, 기타→500. 사용자에게 원인을 알려주는 친절 설계.

#### G-2. `LlmController` — 자유 채팅 (`controller/LlmController.java`)

```java
// LlmController.java:44-61 (요약)
public ResponseEntity<?> chat(@RequestBody Map<String, Object> body) {
    String provider = (String) body.get("provider");
    String model    = (String) body.get("model");
    String reply = router.oneShot(provider, model, system, prompt);   // 라우터 폴백 경유
    LlmProvider used = router.get(provider);                          // 실제 쓰인 프로바이더
    return ResponseEntity.ok(Map.of("reply", reply, "provider", used.id(), ...));
}
```

- 응답에 **"실제로 어떤 프로바이더가 쓰였는지"**(`used.id()`)를 담아 돌려줍니다 — 폴백으로 다른 프로바이더가 선택됐을 수 있으니, 사용자가 "내가 고른 게 아니라 폴백됐구나"를 알 수 있게.
- `@RequestBody Map<String, Object>` 로 **느슨하게** 받습니다(전용 DTO 없이). 자유 채팅이라 필드가 유동적이기 때문.

---

### H. `AiRateLimitFilter` (M10) — 입구 회전문 (`global/config/AiRateLimitFilter.java`)

#### H-1. M10에서 고쳐진 신원 해석 버그 — `L73-L86`

```java
// AiRateLimitFilter.java:80-86
// 신원은 request attribute 에서 직접 읽는다. AuthContext.currentUserId() 는 RequestContextHolder 에 의존하는데
// 서블릿 필터 단계에서는 (DispatcherServlet 진입 전이라) 아직 채워지지 않아 항상 null → 레이트리밋이 전원 무력화되던 버그.
Object uidAttr = request.getAttribute(JwtAuthenticationFilter.ATTR_USER_ID);
Long userId = (uidAttr instanceof Long l) ? l : null;
if (userId == null) {
    chain.doFilter(request, response);   // 미인증은 통과(컨트롤러가 401 처리)
    return;
}
```

- ⚠️ **이것이 M10 수정의 핵심**입니다. 원래는 `AuthContext.currentUserId()`로 신원을 얻으려 했는데, **서블릿 필터는 `DispatcherServlet`보다 먼저 실행**되어 `RequestContextHolder`가 아직 비어 있어 **항상 null**이었습니다. → 모든 사용자가 `userId==null`로 분류돼 **레이트리밋이 통째로 무력화**되던 버그.
- 수정: **`JwtAuthenticationFilter`가 먼저 채워둔 request attribute**(`ATTR_USER_ID = "auth.userId"`)를 직접 읽습니다. 두 필터의 **실행 순서**(`@Order`)가 이 수정의 전제:
  - `JwtAuthenticationFilter` = `@Order(HIGHEST_PRECEDENCE + 10)` (먼저, attribute 채움)
  - `AiRateLimitFilter` = `@Order(HIGHEST_PRECEDENCE + 20)` (나중, attribute 읽음)
- (`JwtAuthenticationFilter.java:34,49`에서 `setAttribute(ATTR_USER_ID, n.longValue())`로 채우는 것을 확인.)

#### H-2. 버킷 알고리즘 — `L88-L110`

```java
// AiRateLimitFilter.java:88-109
Bucket bucket = buckets.computeIfAbsent(userId, this::newBucket);   // 유저별 버킷
if (bucket.tryConsume(1)) {
    chain.doFilter(request, response);                              // 토큰 있으면 통과
} else {
    response.setStatus(HttpStatus.TOO_MANY_REQUESTS.value());       // 없으면 429
    response.getWriter().write("{\"error\":\"... 1시간에 " + capacity + "회 ...\"}");
}
// newBucket:
Bandwidth limit = Bandwidth.classic(capacity, Refill.greedy(refillTokens, Duration.ofMinutes(refillMinutes)));
```

- **토큰 버킷 알고리즘**: 각 유저에게 양동이(`Bucket`)를 주고, 요청마다 토큰 1개 소비(`tryConsume(1)`). 비면 429. 양동이는 `refillMinutes`(60분)마다 `refillTokens`(20개)씩 다시 채워짐.
- **적용 범위가 좁다는 점 주의**: `shouldNotFilter`(L62-71)를 보면 **`POST /api/alpha/workspaces/{id}/{chat|formalize|briefing|auto-run}`** 만 대상. **`/api/ai/chat`·`/api/llm/chat`은 이 필터 대상이 아닙니다**(함정 섹션 참고).
- 클래스 주석대로 인메모리(`ConcurrentHashMap`)라 **단일 서버 가정** — 다중 인스턴스면 Redis 연동 필요(고도화).

---

## ⚠️ 함정·보안 주의

1. **API 키는 절대 클라이언트로 나가면 안 됨.**
   - 모든 키는 `@Value("${...api.key}")`로 **서버 환경변수에서만** 주입되고, HTTP 호출의 헤더(`x-api-key`/`Authorization`)나 URL 쿼리(`?key=`)에만 쓰입니다. 응답으로는 절대 반환하지 않습니다.
   - `GeminiService` 생성자 로그(L47-54)는 키 **끝 4자리만**(`apiKeyTail`) 찍습니다 — 전체 키를 로그에 남기지 않는 안전 관례.
   - ⚠️ 단, **Gemini는 URL 쿼리스트링에 키를 붙입니다**(`...:generateContent?key=apiKey`, L255). URL은 액세스 로그·프록시에 남을 수 있어 헤더 방식보다 노출 위험이 큽니다(Google API 규격상 불가피하나, 로그 마스킹 점검 필요).

2. **M10 레이트리밋의 신원 해석 — 필터 순서에 생명이 달림.**
   - 레이트리밋은 `AuthContext`가 아니라 **request attribute**(`JwtAuthenticationFilter.ATTR_USER_ID`)로 신원을 읽어야 합니다(H-1). `@Order`를 잘못 바꾸면 attribute가 비어 **레이트리밋이 다시 전원 무력화**됩니다. 필터 순서 변경 시 반드시 재검증.

3. **`/api/ai/chat`·`/api/llm/chat`은 레이트리밋 밖.**
   - `AiRateLimitFilter`는 `/api/alpha/workspaces/**`의 4개 엔드포인트만 막습니다. 메인 채팅(`/api/ai/chat`)과 자유채팅(`/api/llm/chat`)은 **횟수 제한이 없습니다.** `/api/ai/chat`은 그나마 게이트웨이 **쿼터(월 토큰)**가 막지만, `/api/llm/chat`은 **쿼터도 레이트리밋도 없습니다** — 키만 있으면 무제한 호출 가능. 비용·악용 관점에서 가장 약한 고리.

4. **비로그인 경로의 게이트 우회.**
   - `AiController.chat`은 `uid == null`이면 게이트웨이를 건너뛰고 `GeminiService`를 직접 부릅니다(G-1). 이 엔드포인트에 인증이 강제되지 않으면 **익명 사용자가 쿼터 없이 Gemini를 무한 호출**할 수 있습니다. SecurityConfig에서 `/api/ai/**`의 인증 요구 여부를 반드시 확인할 것.

5. **Gemini 토큰은 추정값 — 쿼터·청구가 부정확.**
   - `GeminiProvider.estimateTokens`는 글자수÷3 추정(C 섹션). 정확한 `usageMetadata`를 안 씁니다. **Gemini 모델의 쿼터/청구는 다른 3사보다 부정확**합니다. 보수적(과대)이라 사용자가 손해 볼 일은 드물지만, 정산 정확도가 필요하면 실제 메타데이터 파싱 필요.

6. **폴백 시 비용·일관성 주의.**
   - **모델 폴백**(GeminiService): 1순위 모델이 429/403이면 폴백 모델로 자동 전환 — 폴백 모델이 더 비싸거나 품질이 다를 수 있음. 사용자는 다른 모델로 답받은 걸 모를 수 있음.
   - **프로바이더 폴백**(LlmRouter): 키 없는 provider 요청 시 **조용히 default로 대체**. 응답에 실제 provider를 담아주긴 하나(G-2), 프론트가 이를 표시하지 않으면 사용자는 "Claude에게 물었는데 Gemini가 답한" 상황을 모를 수 있음.
   - ⚠️ 단, 게이트웨이(`gateway`) 묶음은 **프로바이더 간 폴백이 없습니다.** 짝 프로바이더가 없거나 키 없으면 그냥 거부 — 쿼터 정확성을 위해 의도적으로 폴백을 뺀 설계.

7. **로그 저장 실패는 삼켜짐 — 쿼터 누락 가능성.**
   - `recordUsage`는 DB 저장 실패를 `log.warn`만 하고 넘깁니다(B-7). 저장이 실패하면 그 호출의 토큰이 **쿼터에 반영되지 않아** 한도를 살짝 넘게 쓸 수 있음. 본 흐름 보호를 위한 트레이드오프.

8. **인메모리 레이트리밋 — 수평 확장 시 깨짐.**
   - 버킷이 `ConcurrentHashMap`(JVM 메모리)에 있어, 서버를 2대로 늘리면 각 서버가 별도 카운트 → 실효 한도가 2배가 됩니다. 운영 다중화 시 Redis 기반으로 교체 필요(클래스 주석에도 명시).

---

## 🚀 고도화 아이디어

- **두 프로바이더 묶음 통합**: `gateway/`와 `llm/`이 같은 4개 API를 중복 호출. `LlmProvider`를 `AiProvider`로 흡수하거나 어댑터로 묶어 **단일 프로바이더 추상화**로 정리하면 유지보수가 절반.
- **Gemini 정확 토큰 집계**: `GeminiService`가 응답의 `usageMetadata.promptTokenCount`/`candidatesTokenCount`를 파싱해 추정 대신 실값을 쓰도록 — 쿼터·청구 정확도 향상.
- **런타임 폴백 추가**: `LlmRouter`가 "선택한 provider 호출이 5xx로 실패하면 다음 available provider로 재시도"하도록 try-catch 사다리 추가(현재는 사전 가용성만 검사).
- **레이트리밋을 게이트웨이 경로까지 확장**: `/api/ai/chat`·`/api/llm/chat`도 필터 대상에 포함하거나, 티어별 한도(FREE 20·PRO 60)를 실제 구현(현재 PRO 분기는 "추후 확장" 주석만).
- **Redis 기반 분산 레이트리밋**: Bucket4j JCache + Redis로 다중 인스턴스에서도 정확한 한도.
- **비용 대시보드**: `AiUsageLog`를 집계해 사용자/모델/월별 토큰·실패율 차트 — 이미 인덱스가 깔려 있어 쿼리만 추가하면 됨.
- **스트리밍 응답**: 현재는 전체 응답을 한 번에 받음. SSE로 토큰 단위 스트리밍하면 체감 속도 개선(단, 토큰 집계 로직 재설계 필요).
- **모델 폴백 투명화**: 응답에 "실제 사용 모델/프로바이더"와 "폴백 여부"를 표준 필드로 항상 포함해 프론트가 사용자에게 고지.
- **`ensureUsable` 정밀화**: `monthStart`에 `.withNano(0)`를 추가하고, 쿼터 검사와 실제 차감 사이의 **레이스 컨디션**(동시 요청이 한도를 약간 초과)을 비관적 락이나 원자적 카운터로 보완.

---

## 📚 용어 사전 (이 파트 한정)

| 용어 | 뜻 |
|---|---|
| **LLM 프로바이더** | AI 모델을 빌려주는 회사/API (Gemini·Anthropic·OpenAI·Perplexity) |
| **게이트웨이(Gateway)** | 여러 프로바이더를 묶어 쿼터·로그·라우팅을 일괄 관리하는 중앙 창구(`AiGatewayService`) |
| **쿼터(Quota)** | 월간 **토큰** 사용 한도. `0`=금지, `-1`=무제한, 양수=한도 |
| **레이트리밋(Rate Limit)** | 시간당 **요청 횟수** 제한(20회/시간). Bucket4j 토큰버킷 |
| **토큰(Token)** | AI가 글을 세는 단위. 입력(`tokensIn`)+출력(`tokensOut`) 모두 비용 |
| **티어(Tier)** | 구독 등급 `FREE`/`PRO`. 같은 모델도 티어별 쿼터가 다름 |
| **프로바이더 폴백** | 키 없는 회사 대신 다른 회사로 대체(`LlmRouter`) |
| **모델 폴백** | 같은 회사 안에서 모델만 바꿈(429/403 시, `GeminiService`) |
| **어댑터 패턴** | 기존 클래스를 새 인터페이스에 맞게 변환기로 감쌈(`GeminiProvider`→`GeminiService`) |
| **`List<인터페이스>` 주입** | 그 인터페이스를 구현한 모든 `@Component`를 Spring이 자동으로 리스트로 주입 |
| **`@Value("${키:기본값}")`** | 설정값 주입, 없으면 기본값(빈 문자열) — 키 없는 프로바이더가 앱을 죽이지 않게 |
| **토큰 버킷(Token Bucket)** | 양동이에 토큰을 주기적으로 채우고 요청마다 1개씩 빼는 레이트리밋 알고리즘 |
| **request attribute** | 한 HTTP 요청 동안 필터·컨트롤러가 공유하는 임시 저장소. M10에서 신원 전달에 사용 |
| **`@Order` (필터 순서)** | 서블릿 필터 실행 순서. 숫자 작을수록 먼저. JWT(+10) → RateLimit(+20) |
| **`@PrePersist`** | JPA 엔티티가 INSERT 되기 직전 자동 실행되는 훅(`createdAt` 자동 세팅) |
| **429 / 403** | HTTP 상태코드. 429=요청 너무 많음(한도), 403=접근 금지(권한/모델불가) |
| **RPM / 일간 한도** | RPM=분당 요청 수(기다리면 풀림), 일간 한도=하루 총량(기다려도 안 풀림) |
| **`Result` (record)** | 응답 텍스트 + 입출력 토큰을 묶은 불변 데이터 객체 |
