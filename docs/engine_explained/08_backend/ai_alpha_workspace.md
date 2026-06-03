# `domain/ai` — Alpha 워크스페이스·채팅·패치 (완전 라인별 해설)

> 원본 디렉터리: `backend/src/main/java/com/DevBridge/devbridge/domain/ai/`
> 다루는 파일:
> - 서비스 — `service/AlphaHelixService.java`(960줄) · `service/AlphaPatchService.java` · `service/ClaudeCodeAgentService.java`
> - 컨트롤러 — `controller/AlphaWorkspaceController.java` · `controller/AlphaPatchController.java` · `controller/AlphaAnalyticsController.java`
> - 엔티티 — `entity/AlphaWorkspace.java` · `entity/AlphaChatMessage.java` · `entity/AlphaDecisionLog.java` · `entity/AlphaWorkspaceChangeSet.java`
>
> 이 문서는 교재 표준 형식(README "3. 공통 형식")을 따릅니다. Spring 기초(`@Service`/`@RestController`/JPA/Lombok)는 알고 있다고 전제합니다.

---

## 📌 이 파트 한눈에

이 파트는 **"자연어로 말한 인생 목표를, 백테스트 가능한 전략 카드까지 안내하는 AI 매니저의 두뇌"** 입니다.

사용자가 채팅창에 *"5년 안에 월 300만원 현금흐름 만들고 싶어요"* 라고 입력하면 →
AI가 8가지 조건을 한 단계씩 물어 채우고(목표 수집) → 그 목표를 **deterministic 백테스트가 가능한 전략 후보 3개**로 정형화하고 → 백테스트·국면·신뢰도까지 한 번에 돌리고 → (선택) 코드를 직접 편집(Claude CLI)하고 → 모든 변경을 **유지/취소 가능한 패치 묶음**으로 관리합니다.

비유로 풀면:
- **AlphaHelixService** = 매니저의 **두뇌**. 손님 말을 듣고(채팅), 메모로 정리하고(목표 JSON), 메뉴를 짜고(전략 후보), 시식을 돌립니다(백테스트·트러스트).
- **AlphaPatchService** = 매니저의 **연필과 지우개**. 설정을 살짝 고치되 항상 "되돌리기"가 가능하게(ChangeSet).
- **ClaudeCodeAgentService** = 매니저가 부르는 **외부 코딩 전문가(Claude CLI)**. 격리된 방에 코드를 펼쳐 주고, 손과 발(Bash·네트워크)은 묶은 채 파일만 고치게 합니다.

| 클래스 | 한 줄 역할 | 비유 |
|---|---|---|
| `AlphaHelixService` | 채팅 목표수집 → 정형화 → 백테스트/국면/신뢰/브리핑/자동주문/auto-run 전부 | 매니저의 두뇌(전 과정 오케스트레이션) |
| `AlphaPatchService` | strategyConfig·goalProfile·code 를 **부분 패치**하고 PENDING/KEPT/UNDONE 로 추적 | 연필+되돌리기 |
| `ClaudeCodeAgentService` | 헤드리스 `claude -p` CLI 로 워크스페이스 코드 실편집 → diff → 패치 | 외부 코딩 전문가(격리실) |
| `AlphaWorkspaceController` | 워크스페이스 CRUD + 채팅 + 로그/주문 조회 + 코드 저장 | 두뇌로 가는 정문 접수처 |
| `AlphaAnalyticsController` | backtest/regime/trust/queue-orders/auto-run/briefing 트리거 | 분석 파이프라인 접수처 |
| `AlphaPatchController` | changesets apply/keep/undo/list | 패치 접수처 |
| `AlphaWorkspace`(엔티티) | 목표·전략·백테스트·국면·신뢰·리포트·코드 JSON 을 한 행에 보관 | 손님 한 명의 서류철 |
| `AlphaChatMessage` | 채팅 한 줄(user/model) | 대화 녹취 한 줄 |
| `AlphaDecisionLog` | 모든 의사결정 시간순 기록 | 매니저의 업무일지 |
| `AlphaWorkspaceChangeSet` | 패치 한 묶음 + before/after 스냅샷 | 수정 영수증(되돌리기 표) |

**누가 호출하나?** → 프론트엔드 `frontend/src/alpha/` 의 AlphaWorkspace 탭(Chat / Config / Report / Regime / Trust / Briefing / Log)이 `/api/alpha/...` 로 호출합니다. 세 컨트롤러가 입구이고, 실제 일은 전부 위 세 서비스가 합니다.

**Analytics 엔진과의 관계** → 이 파트는 **두뇌(조율자)** 이고, 실제 숫자 계산(백테스트·Trust·Regime)은 `01_backtest`~`04_robust` 의 Python 엔진이 합니다. `AnalyticsClient`(strategy 도메인)가 그 다리입니다. 즉 이 문서는 "**누가 언제 무엇을 시키는가**"를, 앞선 문서들은 "**그 계산이 어떻게 돌아가는가**"를 다룹니다.

---

## 🧠 사전 지식 (이거 모르면 막힘)

### 1) 워크스페이스 = "손님 한 명의 전략 서류철 한 권"
`AlphaWorkspace` 엔티티 한 행 = 전략 1개. Slack 채널처럼 **워크스페이스 안에 채팅·로그·전략·결과가 모두 종속**됩니다. 한 사용자가 여러 워크스페이스를 가질 수 있습니다(목표마다 하나씩).

### 2) 상태 머신 — `status` 필드
워크스페이스는 정해진 단계를 밟습니다. 컨트롤러가 허용하는 값은 정확히 5개:
```
DRAFT  →  GOAL_SET  →  FORMALIZED  →  TESTED  →  LIVE
(생성)   (목표 8개   (전략후보 3개  (백테스트   (실운용 중)
         확정)        생성)         완료)
```
- `DRAFT`: 막 생성됨. 채팅으로 목표를 채우는 중.
- `GOAL_SET`: 8가지 목표가 전부 사용자 발화로 확정됨(`processChat`이 자동 승격).
- `FORMALIZED`: `doFormalize`가 전략 후보 3개를 만듦.
- `TESTED`: `doBacktest`가 한 번 돌아감.
- `LIVE`: 실제 운용 중. **이 상태에서는 backtest/formalize 가 status 를 강등하지 않습니다**(코드의 `if (!"LIVE"...)` 가드).

> 💡 초보 포인트: 상태는 "현재 어느 단계까지 왔나"를 한 글자로 요약한 라벨일 뿐, 강제 흐름 제어는 거의 없습니다(다음 단계 API 는 보통 "전제 조건"만 체크). 그래서 LIVE 보호 가드가 중요합니다.

### 3) goalProfile JSON — "매니저가 받아 적은 목표 메모"
채팅으로 수집하는 8가지가 하나의 JSON 으로 굳어집니다:
```json
{
  "goal": "5년 안에 월 300만원 현금흐름",
  "horizon_years": 5,
  "initial_capital_krw": 5000000,
  "monthly_contribution_krw": 1000000,
  "risk_tolerance": "중립",
  "max_drawdown_target_pct": 25,
  "assets": ["QQQ","SCHD"],
  "initial_strategy_direction": "추세추종 + 변동성조절"
}
```
이 JSON 이 `AlphaWorkspace.goalProfileJson` 컬럼에 문자열로 저장됩니다. 8개 키가 **전부 채워졌는지**를 `hasAllGoalKeys()`가 검사합니다(아래 라인별 해설).

### 4) strategyConfig "엔벨로프(envelope)" — 후보 3개를 담는 봉투
`doFormalize`의 결과는 단일 전략이 아니라 **후보 배열을 감싼 봉투**입니다:
```json
{
  "candidates": [ {"id":"cand-1", ...}, {"id":"cand-2", ...}, {"id":"cand-3", ...} ],
  "selectedId": "cand-1"
}
```
- `candidates`: 보수/중립/공격 톤의 전략 카드 3장.
- `selectedId`: 현재 선택된 카드 id. 백테스트·국면·신뢰는 **이 선택 카드 하나**만 대상으로 합니다(`getActiveStrategy()`가 골라냄).

### 5) 패치 도구 "heli-patch" 와 ChangeSet 3상태
AI(또는 코드 편집·Claude 에이전트)가 설정을 바꿀 때, 통째로 덮어쓰지 않고 **부분 패치(ops)** 를 보냅니다:
```json
[ { "target": "strategy", "path": "parameters.ma_window", "value": 120 } ]
```
- `target`: 어느 묶음을 고칠지(strategy / backtest / regime / trustScore / goalProfile / code).
- `path`: 점 표기 경로(`parameters.ma_window`).
- `value`: 새 값.

이 패치 한 번이 **ChangeSet 한 행**으로 기록되며, 항상 3상태를 거칩니다:
```
PENDING (적용됐지만 미확정)
   ├─ keep → KEPT   (유지 확정, 더 이상 되돌리기 불가)
   └─ undo → UNDONE (before 스냅샷으로 롤백)
```
before/after **전체 스냅샷**을 저장하므로 undo 가 정확히 복원합니다. 비유: 워드의 "변경 내용 추적" + Ctrl+Z.

### 6) Claude CLI 격리 — "전문가를 격리실에 들여보낸다"
코드 실편집은 외부 `claude` CLI 프로세스를 띄워서 합니다. 위험하므로 안전장치 4겹:
1. **기본 OFF** (`app.claude.cli.enabled=false`),
2. **임시 격리 디렉터리** (워크스페이스 코드만 복사해서 펼침),
3. **허용툴 화이트리스트** (`Read,Edit,Write,Glob,Grep` 만, **Bash/WebFetch/WebSearch 차단**),
4. **타임아웃 + 예산 상한**(`--max-budget-usd 1`).

전문가는 그 방 안의 파일만 읽고 고칠 수 있고, 명령 실행이나 인터넷은 막혀 있습니다.

---

## 🗺 요청 흐름도

### (A) 목표수집 채팅 → 전략 후보

```
[프론트 Chat 탭]  POST /api/alpha/workspaces/{id}/chat  { text }
        │
        ▼
AlphaWorkspaceController.chat()  — JWT 로 uid 확인, ws 소유 확인
        │
        ▼
AlphaHelixService.processChat(ws, uid, userText)
        │
        ├─① user 메시지 저장 (AlphaChatMessage)
        ├─② 컨텍스트 조립:
        │     buildWorkspaceStateContext(ws)   ← 현재 목표/전략/백테스트 수치 요약(코드 아님)
        │     + 최근 12개 대화 ([user]/[model])
        ├─③ system 프롬프트(퍼스널 퀀트 매니저 + 8개 항목 + 절대규칙)
        ├─④ callAi(uid, system, ctx)  ──▶ AiGatewayService.oneShot(쿼터·로그)  ──▶ Gemini
        ├─⑤ model 답변 저장
        └─⑥ extractJsonBlock(reply) → hasAllGoalKeys?
              YES → goalProfileJson 저장, status DRAFT→GOAL_SET, 로그 GOAL_DEFINED
        │
        ▼
{ reply, goalProfileExtracted, autoRunReady }

  ── (사용자가 'Goal → Strategy' 버튼) ──▶ POST .../formalize 또는 /auto-run
        │
        ▼
doFormalize(ws, uid):  goalProfileJson → LLM → 후보 3개 추출 → envelope 저장 → status FORMALIZED
```

### (B) 분석 파이프라인 (개별 또는 auto-run 일괄)

```
선택 전략(getActiveStrategy) ──┬─ doBacktest  → AnalyticsClient.backtest/infiniteBuying  → lastBacktestJson
                              ├─ doRegime    → AnalyticsClient.regime                    → lastRegimeJson
                              ├─ doTrust     → AnalyticsClient.trustScore                → lastTrustJson
                              ├─ doQueueOrders(infinite_buying만) → OrderProposal(PENDING) 생성
                              └─ doBriefing  → LLM 모닝 브리핑 + 출처 링크

doAutoRun = formalize → backtest → regime → trust → (ib면) queue-orders 를 순차 실행
            (각 단계 실패는 catch 해서 error 로 담고 계속) → lastReportJson 저장
```

### (C) 패치 / Claude 코드 에이전트

```
[Config 카드 수정 / AI 제안 / Claude 편집]
        │
        ▼
POST /changesets  { title, ops:[{target,path,value}] }
        │
        ▼
AlphaPatchService.apply():
   before 스냅샷 보존(strategyConfig+goalProfile+codeJson) → setPath 로 부분 적용
   → ws 저장 → ChangeSet(PENDING) 저장 → 로그 PARAM_CHANGED
        │
   사용자 선택 ──┬─ keep → KEPT  (Claude 변경이고 repo 연동되면 GitHub 자동 커밋)
                └─ undo → before 스냅샷으로 롤백 → UNDONE

[Claude 에이전트]  POST /claude-agent/start { request }
        │
        ▼
ClaudeCodeAgentService.startAgent → 백그라운드 스레드
   materialize(codeJson → 임시 디렉터리 파일들)
   → runCli(claude -p, allowedTools=Read/Edit/Write/Glob/Grep, disallowed=Bash/Web)
   → stream-json 라인 → 진행 로그(잡 스토어, 프론트 폴링 /status?since=N)
   → finishApply: 편집 diff → ops(target=code) → AlphaPatchService.apply() → ChangeSet(PENDING)
   → 임시 디렉터리 삭제(finally)
```

---

## 📖 핵심 클래스 라인별 심화

### Ⅰ. `AlphaHelixService` — 두뇌

#### A. 클래스 골격과 의존성 — `AlphaHelixService.java:48-72`

```java
// L48-L72 (요약)
@Slf4j @Service @RequiredArgsConstructor @lombok.Getter
public class AlphaHelixService {
    public final AlphaWorkspaceRepository workspaceRepo;
    public final AlphaChatMessageRepository chatRepo;
    public final AlphaDecisionLogRepository logRepo;
    ...
    private final GeminiService gemini;     // fallback (anonymous)
    private final AiGatewayService gateway; // 쿼터 관리 통합 (Task 12)
    public  final AnalyticsClient analytics;
    public final ObjectMapper om = new ObjectMapper();

    @Autowired @Lazy
    private AlphaHelixService self;          // self-injection
    ...
    private static final String DEFAULT_MODEL = "gemini-2.5-flash";
```
- **무엇을 하나**: 세 컨트롤러(`AlphaWorkspaceController`/`AlphaAnalyticsController`/그리고 `AlphaPatchController` 도 `recordLog` 재사용)가 공유하는 서비스. 리포지토리·LLM·Analytics 클라이언트·JSON 매퍼를 모두 한 곳에 모읍니다.
- **왜 필드가 `public final` 인가**: `@lombok.Getter` 가 게터를 만들어주고, 컨트롤러가 `svc.getWorkspaceRepo()` 식으로 직접 접근합니다. (정석은 private 이지만 여기선 의도적으로 노출.)
- **`@Autowired @Lazy private AlphaHelixService self;` — self-injection (중요)**: 자기 자신을 주입받는 트릭. `doAutoRun` 안에서 `self.doFormalize(...)`, `self.doBacktest(...)` 처럼 **자기 메서드를 프록시를 통해** 부릅니다.
  - **왜?** Spring 의 `@Transactional` 은 **프록시 객체**를 통해 호출될 때만 동작합니다. `this.doBacktest()` 로 부르면 프록시를 우회해 트랜잭션 경계가 새로 안 생깁니다. `self.doBacktest()` 는 프록시를 거치므로 각 단계가 제대로 트랜잭션을 갖습니다. `@Lazy` 는 "생성 시점 순환참조(자기 자신)"를 깨기 위한 장치.

> 💡 초보가 헷갈리는 포인트: "왜 내 메서드를 `this.` 가 아니라 `self.` 로 부르지?" → **Spring AOP(트랜잭션 등)는 self-invocation 에 안 먹는다**는 유명한 함정 때문입니다. auto-run 처럼 내부에서 트랜잭션 메서드를 여러 번 부를 때 꼭 필요합니다.

#### B. LLM 호출 단일 통로 `callAi` — `AlphaHelixService.java:80-85`

```java
// L80-L85
public String callAi(Long uid, String systemInstruction, String userInput) {
    if (uid != null) {
        return gateway.oneShot(uid, DEFAULT_MODEL, systemInstruction, userInput, false);
    }
    return gemini.oneShot(systemInstruction, userInput);
}
```
- **무엇을 하나**: 이 서비스의 모든 LLM 호출은 이 한 메서드를 통과합니다(채팅·정형화·브리핑 모두).
- **왜 이렇게 하나**: 인증된 사용자는 `AiGatewayService` 를 거쳐 **쿼터 차감·사용 로그**가 남습니다(`gateway/AiGatewayService.java:54`). 미인증은 `GeminiService` 폴백. 단, 주석대로 *"AlphaHelix 엔드포인트는 항상 인증 필수이므로 uid==null 은 오지 않는다"* — 즉 폴백 경로는 사실상 안전망.
- **마지막 인자 `false` = `wantJson=false`**: Gemini 응답에 `responseMimeType:application/json` 강제를 **걸지 않습니다**. 채팅·브리핑은 마크다운 평문이 필요하기 때문(JSON 강제하면 마크다운 본문이 깨짐). 정형화처럼 순수 JSON 이 필요할 때도 여기선 false 로 받고, 응답에서 JSON 블록만 따로 추출(`extractFirstJsonArray`)하는 전략을 씁니다.

#### C. 선택 전략 골라내기 `getActiveStrategy` — `AlphaHelixService.java:139-152`

```java
// L139-L152
public JsonNode getActiveStrategy(JsonNode cfg) {
    if (cfg == null || cfg.isMissingNode() || cfg.isNull()) return cfg;
    if (cfg.has("candidates") && cfg.get("candidates").isArray()) {
        String selId = cfg.path("selectedId").asText(null);
        JsonNode arr = cfg.get("candidates");
        if (selId != null) {
            for (JsonNode c : arr) {
                if (selId.equals(c.path("id").asText())) return c;
            }
        }
        if (arr.size() > 0) return arr.get(0);
    }
    return cfg;
}
```
- **무엇을 하나**: 봉투(envelope)에서 **현재 선택된 전략 카드 한 장**을 꺼냅니다. `selectedId` 와 일치하는 카드를 찾고, 없으면 첫 카드, 봉투 구조가 아니면 입력을 그대로 반환.
- **왜 중요**: `doBacktest`/`doRegime`/`doTrust`/`doQueueOrders` 가 전부 이 함수로 시작합니다. "후보 3개 중 무엇을 분석하느냐"의 단일 진실 공급원입니다.
- **초보 포인트**: `cfg.path("x")` 와 `cfg.get("x")` 차이 — `path` 는 없으면 "MissingNode"(예외 없이 안전), `get` 은 없으면 `null`. Jackson 에서 안전 탐색은 `path` 를 씁니다.

#### D. 8개 목표 키 검증 `hasAllGoalKeys` / 준비완료 `isAutoRunReady` — `AlphaHelixService.java:154-173`

```java
// L154-L165
public boolean hasAllGoalKeys(String json) {
    try {
        JsonNode g = om.readTree(json);
        return g.hasNonNull("goal")
            && g.hasNonNull("horizon_years")
            && g.hasNonNull("monthly_contribution_krw")
            && g.hasNonNull("risk_tolerance")
            && g.hasNonNull("max_drawdown_target_pct")
            && g.path("assets").isArray() && g.path("assets").size() > 0
            && g.hasNonNull("initial_strategy_direction");
    } catch (Exception e) { return false; }
}
```
- **무엇을 하나**: 채팅에서 추출한 JSON 이 **목표로 인정할 만큼 충분한지** 검사. `hasNonNull` = 키가 있고 값이 null 이 아님. `assets` 는 반드시 비어있지 않은 배열.
- **왜 이렇게 빡빡한가**: 이 검사가 통과해야만 `processChat` 이 goalProfile 을 저장하고 status 를 GOAL_SET 으로 올립니다. 즉 **"진짜 다 모였을 때만 다음 단계로"** 의 관문. (참고: `initial_capital_krw` 는 여기 검사에 **빠져 있습니다** — 시스템 프롬프트는 8개를 요구하지만 이 게이트는 7개 필수+assets 입니다. 미묘한 비대칭이니 강의 시 짚을 포인트.)

```java
// L167-L173
public boolean isAutoRunReady(String goalProfileJson) {
    ...
    return g.path("assets").isArray() && g.path("assets").size() > 0
        && !g.path("initial_strategy_direction").asText("").isBlank();
}
```
- **더 느슨한 검사**: auto-run(원클릭 전체실행) 버튼을 띄울지 결정. 최소한 **관심자산 + 전략방향**만 있으면 진행 가능으로 봅니다.

#### E. LLM 답변에서 JSON 끄집어내기 `extractJsonBlock` — `AlphaHelixService.java:175-211`

```java
// L175-L211 (핵심 발췌)
public String extractJsonBlock(String text) {
    if (text == null) return null;
    int s = text.indexOf("```json");
    if (s < 0) s = text.indexOf("```");
    if (s >= 0) { /* 코드펜스 안 본문을 잘라 om.readTree 로 검증 후 반환 */ }
    int objStart = text.indexOf('{');
    if (objStart < 0) return null;
    int depth = 0; boolean inStr = false; char prev = 0;
    for (int i = objStart; i < text.length(); i++) {
        char c = text.charAt(i);
        if (inStr) { if (c == '"' && prev != '\\') inStr = false; }
        else {
            if (c == '"') inStr = true;
            else if (c == '{') depth++;
            else if (c == '}') { depth--; if (depth == 0) { /* 균형 잡힌 첫 객체 반환 */ } }
        }
        prev = c;
    }
    return null;
}
```
- **무엇을 하나**: LLM 응답에서 **유효한 JSON 객체 하나**를 안전하게 추출. 2단계 전략:
  1. ` ```json ... ``` ` 코드펜스가 있으면 그 안의 본문을 꺼내 `om.readTree` 로 파싱 검증(파싱 실패하면 무시).
  2. 코드펜스가 없으면 **중괄호 균형(brace matching)** 으로 첫 완결 객체를 찾습니다.
- **왜 직접 파싱하나(중요한 교훈)**: LLM 은 JSON 앞뒤에 *"조건을 정리해 보겠습니다 ✨"* 같은 설명 텍스트를 붙입니다. `om.readTree(reply)` 를 통째로 하면 깨집니다. 그래서 **문자열 안에서 JSON 영역만 도려내는** 손수 파서가 필요합니다.
- **`inStr`/`prev` 추적이 핵심**: 문자열 리터럴 안의 `{`/`}` 와 이스케이프된 `\"` 를 중괄호로 오해하지 않도록, "지금 문자열 안인가"와 "직전 문자가 백슬래시였나"를 추적합니다.
- **형제 메서드**: `extractFirstJsonArray`(L213, `[...]` 배열용 — 정형화 후보 추출), `extractFirstJson`(L240, 더 단순한 객체 추출). `extractFirstJsonArray` 는 문자열 추적까지 하지만 `extractFirstJson` 은 단순 depth 카운팅만 합니다(차이 주의).

> ⚠️ 강의 포인트: **"LLM 출력 = 신뢰 못 할 문자열"** 이라는 대전제. 정규식 한 줄로 끝낼 것 같지만, 중첩 객체·문자열 내 괄호 때문에 정규식은 깨집니다. 이 brace-matching 패턴이 정석입니다.

#### F. 티커 정규화 `normalizeTicker` — `AlphaHelixService.java:262-271`

```java
// L262-L271
public static String normalizeTicker(String t) {
    if (t == null || t.isBlank()) return "SPY";
    String up = t.trim().toUpperCase();
    return switch (up) {
        case "BTC", "BITCOIN" -> "BTC-USD";
        case "ETH", "ETHEREUM" -> "ETH-USD";
        case "VIX" -> "^VIX";
        default -> up;
    };
}
```
- 사용자/LLM 이 "BTC", "비트코인" 등 자유롭게 적어도 **Analytics 엔진(야후/바이낸스)이 아는 심볼**로 변환. 빈 값이면 안전 기본값 `SPY`. Java 21 switch 표현식 사용.

#### G. ⭐ 목표수집 채팅 `processChat` — `AlphaHelixService.java:279-400`

이 파트의 심장입니다. 단계별로 봅니다.

**G-1. user 저장 + 컨텍스트 조립 — `L280-L294`**
```java
// L280-L294
@Transactional
public Map<String, Object> processChat(AlphaWorkspace ws, Long uid, String userText) {
    Long id = ws.getId();
    chatRepo.save(AlphaChatMessage.builder().workspaceId(id).role("user").text(userText).build());

    var history = chatRepo.findByWorkspaceIdOrderByCreatedAtAsc(id);
    StringBuilder ctx = new StringBuilder();
    // 현재 워크스페이스 상태를 컨텍스트 맨 앞에 주입한다.
    ctx.append(buildWorkspaceStateContext(ws));
    int start = Math.max(0, history.size() - 12);
    for (int i = start; i < history.size(); i++) {
        var m = history.get(i);
        ctx.append("[").append(m.getRole()).append("] ").append(m.getText()).append("\n");
    }
```
- **무엇을 하나**: ① 사용자의 새 메시지를 즉시 DB 저장 → ② 전체 히스토리를 읽되 **최근 12개만** 컨텍스트에 넣음(토큰 절약) → ③ 그 **앞에** 현재 워크스페이스 상태 요약을 붙임.
- **왜 상태 요약을 맨 앞에(핵심 설계)**: 이미 전략·백테스트가 있는 워크스페이스에서 *"이 전략 승률 좀 올려줘"* 라고 물으면, AI 가 **"로드된 전략(코드)이 없다"는 헛소리**를 하지 않도록, 현재 수치(MDD·Sharpe·승률 등)를 컨텍스트로 미리 주입합니다(`buildWorkspaceStateContext`, 아래 H 참조). 신규 워크스페이스는 빈 문자열이라 온보딩에 영향 없음.
- **`@Transactional`**: 이 메서드 전체가 한 트랜잭션. user 저장·model 저장·goalProfile 저장이 한 묶음으로 커밋됩니다.

**G-2. 시스템 프롬프트 — `L296-L374`**
```java
// L296-L327 (발췌)
String system = """
    너는 Alpha-Helix의 퍼스널 퀀트 매니저다. 사용자의 '삶의 목표'를 듣고 투자 전략 설계 조건 8가지를 한 단계씩 수집한다.
    ...
    🔎 분석가 모드 (이미 전략/백테스트가 있는 경우 — 아래 목표수집보다 우선)
    ...
    ⚠️ 절대 규칙 (위반 금지)
    ① 사용자가 명시적으로 답하지 않은 항목은 절대 임의로 채우지 않는다.
    ② 8가지가 전부 사용자 발화로 확인되기 전까지는 절대 JSON을 출력하지 않는다.
    ...
    수집해야 할 8가지 항목
    1) goal ... 8) initial_strategy_direction ...
    """;
```
- **무엇을 하나**: Java 21 **텍스트 블록(`"""..."""`)** 으로 긴 한국어 프롬프트를 박아넣음. 이 프롬프트가 AI 의 행동 전부를 규정합니다.
- **두 가지 모드 분기를 프롬프트로 처리**:
  - **목표수집 모드**: 신규 워크스페이스 → 8가지를 한 단계씩 질문.
  - **분석가 모드**: 컨텍스트에 상태가 있으면 → 목표수집을 다시 시작하지 말고 주어진 수치로 진단/개선.
- **절대 규칙의 의도**: ①②는 **환각 방지**. 사용자가 말 안 한 값을 AI 가 멋대로 지어내거나, 덜 모였는데 JSON 을 뱉어 다음 단계로 넘어가는 것을 막습니다. (그래서 `hasAllGoalKeys` 게이트와 짝을 이룸.)
- **`[BTN:라벨|액션]` 토큰(L371)**: 프론트가 이 토큰을 실제 버튼으로 렌더링합니다(액션: next / ask_more / formalize). 즉 LLM 이 UI 버튼을 "주문"할 수 있는 약속된 마크업.
- **무한매수법 인식(L334-L338)**: "라오어", "40분할", "LOC", "평단매수" 등 키워드가 나오면 `initial_strategy_direction="infinite_buying"` 으로 분기하고 추가 파라미터(split_count 등)를 더 수집하게 지시.

**G-3. LLM 호출 + 답변 저장 — `L376-L383`**
```java
// L376-L383
String reply;
try {
    reply = callAi(uid, system, ctx.toString());
} catch (Exception e) {
    log.error("AI chat fail", e);
    reply = "(AI 응답 실패: " + e.getMessage() + ")";
}
chatRepo.save(AlphaChatMessage.builder().workspaceId(id).role("model").text(reply).build());
```
- LLM 실패해도 **예외를 삼키고** 사용자에게 보이는 에러 메시지를 model 메시지로 저장 → 채팅이 끊기지 않습니다(graceful degradation).

**G-4. goalProfile 추출·승격 — `L385-L399`**
```java
// L385-L399
String extracted = extractJsonBlock(reply);
if (extracted != null && hasAllGoalKeys(extracted)) {
    ws.setGoalProfileJson(extracted);
    if ("DRAFT".equals(ws.getStatus())) ws.setStatus("GOAL_SET");
    workspaceRepo.save(ws);
    recordLog(id, "AI", "GOAL_DEFINED", "Goal Profile 추출 완료", extracted);
} else {
    extracted = null;
}
Map<String, Object> resp = new LinkedHashMap<>();
resp.put("reply", reply);
resp.put("goalProfileExtracted", extracted != null);
resp.put("autoRunReady", extracted != null && isAutoRunReady(extracted));
return resp;
```
- **무엇을 하나**: AI 답변에 완성된 목표 JSON 이 들어있으면(추출 + 8키 검사 통과) → 저장하고 **DRAFT→GOAL_SET 승격**(이미 다른 상태면 건드리지 않음) → 결정 로그 남김.
- **반환 3필드**: `reply`(보여줄 답변), `goalProfileExtracted`(목표 확정됐나 — 프론트가 'Goal→Strategy' 버튼 활성화), `autoRunReady`(원클릭 전체실행 가능한가).

#### H. 워크스페이스 상태 컨텍스트 `buildWorkspaceStateContext` — `AlphaHelixService.java:407-485`

```java
// L407-L424 (목표 프로필 부분)
private String buildWorkspaceStateContext(AlphaWorkspace ws) {
    StringBuilder sb = new StringBuilder();
    try {
        String gj = ws.getGoalProfileJson();
        if (gj != null && !gj.isBlank()) {
            JsonNode g = om.readTree(gj);
            java.util.List<String> p = new java.util.ArrayList<>();
            if (g.hasNonNull("goal")) p.add("목표=\"" + g.get("goal").asText() + "\"");
            ... (기간/초기금/월적립/성향/MDD목표/관심자산/전략방향) ...
            if (!p.isEmpty()) sb.append("• 목표 프로필: ").append(String.join(", ", p)).append("\n");
        }
    } catch (Exception ignore) { }
    ...
```
- **무엇을 하나**: 워크스페이스의 현재 상태를 **사람이 읽는 한 줄 요약들**로 압축합니다. 목표 / 선택 전략+파라미터(앞 8개만) / 최근 백테스트 stats / Regime 라벨 / Trust Score 를 각각 한 줄로.
- **왜 stats 만(중요)**: 주석대로 *"백테스트는 stats 만 추려 넣는다(equity_curve 같은 대용량 배열은 제외)"*. 자산곡선 2500점을 컨텍스트에 넣으면 토큰 폭발 + 노이즈. 매니저가 알아야 할 건 "총수익 X%, MDD Y%" 같은 **요약 수치**뿐입니다.
- **`catch (Exception ignore)` 의 의미**: 각 블록이 독립적으로 try/catch — 한 JSON 이 깨져도 나머지 요약은 살아남게. 방어적 프로그래밍.

```java
// L482-L485
    if (sb.length() == 0) return "";
    return "\n[현재 워크스페이스 상태 — 사용자가 \"지금 보고 있는/이 전략\"이라고 하면 아래를 가리킨다]\n"
            + sb + "\n";
}
```
- **상태가 하나도 없으면 빈 문자열**: 신규 워크스페이스는 컨텍스트 오염 없이 순수 온보딩. 상태가 있으면 *"'이 전략'이라고 하면 아래를 가리킨다"* 라는 안내 헤더를 붙여 AI 의 지시대명사 해석을 돕습니다.

#### I. ⭐ 정형화 `doFormalize` — `AlphaHelixService.java:493-581`

```java
// L494-L529 (시스템 프롬프트 발췌)
@Transactional
public Map<String, Object> doFormalize(AlphaWorkspace ws, Long uid) throws Exception {
    String system = """
        너는 사용자 목표(JSON)를 받아 **deterministic 백테스트가 가능한** 전략 config 후보 3개를 제시한다.
        각 후보는 아래 7개 템플릿 중 서로 다른 strategy_type을 고른 보수/중립/공격 톤으로 ...:
          - buy_hold / moving_average_timing / momentum_rotation / vix_risk_off
          - trend_volatility_control / dividend_tilt / infinite_buying
        ...
        반드시 코드블록 없이 **순수 JSON 배열만** 출력하라. 길이는 정확히 3.
        """;
```
- **무엇을 하나**: goalProfile → **전략 후보 3개 JSON 배열** 생성. 7개 템플릿 중 서로 다른 것을 보수/중립/공격 톤으로.
- **deterministic 강조**: 후보의 strategy_type 은 반드시 백테스트 엔진(`01_backtest/vbt_engine.md` 의 6전략 + 무한매수)으로 **재현 가능한** 것이어야 합니다. AI 가 "감으로 사고팔기" 같은 비결정 전략을 만들지 못하게.

```java
// L531-L567 (파싱 + 폴백)
String result;
try { result = callAi(uid, system, ws.getGoalProfileJson()); }
catch (RuntimeException e) { throw new RuntimeException("정형화 실패: " + e.getMessage(), e); }
...
String arrayJson = extractFirstJsonArray(result);
List<Map<String, Object>> candidates = new ArrayList<>();
try {
    if (arrayJson != null) {
        JsonNode arr = om.readTree(arrayJson);
        for (int i = 0; i < arr.size() && i < 3; i++) {
            Map<String, Object> cand = om.convertValue(arr.get(i), Map.class);
            cand.put("id", "cand-" + (i + 1));
            candidates.add(cand);
        }
    }
    if (candidates.isEmpty()) {            // 배열 추출 실패 → 단일 객체라도 건진다
        String obj = extractFirstJson(result);
        if (obj != null) { Map<String,Object> cand = om.readValue(obj, Map.class); cand.put("id","cand-1"); candidates.add(cand); }
    }
} catch (Exception e) { log.error("formalize parse fail", e); }
if (candidates.isEmpty()) throw new RuntimeException("LLM 응답을 파싱하지 못했습니다: " + result);
```
- **방어적 파싱 2단계**: ① 배열 추출 → 최대 3개에 `id`(cand-1..3) 부여. ② 배열이 없으면 **단일 객체라도** 건져 후보 1개로. 둘 다 실패하면 명시적 예외.
- **`om.convertValue` vs `om.readValue`**: 전자는 이미 JsonNode 인 것을 Map 으로 변환, 후자는 문자열을 파싱. 둘 다 결과는 `Map<String,Object>`.

```java
// L569-L581 (봉투 저장)
Map<String, Object> envelope = new LinkedHashMap<>();
envelope.put("candidates", candidates);
envelope.put("selectedId", candidates.get(0).get("id"));   // 기본 선택 = 첫 후보
String envelopeJson = om.writeValueAsString(envelope);
ws.setStrategyConfigJson(envelopeJson);
if (!"LIVE".equals(ws.getStatus())) ws.setStatus("FORMALIZED"); // LIVE 운용 중이면 강등 금지
workspaceRepo.save(ws);
recordLog(ws.getId(), "AI", "STRATEGY_PROPOSED", "Strategy 후보 " + candidates.size() + "개 생성", envelopeJson);
return Map.of("strategyConfig", envelopeJson, "candidates", candidates);
```
- **봉투로 포장 → 첫 후보를 selectedId 로** → strategyConfigJson 저장 → status FORMALIZED(LIVE 보호). 사전지식 4번의 envelope 가 여기서 만들어집니다.

#### J. 백테스트 디스패치 `doBacktest` — `AlphaHelixService.java:590-655`

```java
// L590-L596
@Transactional
public String doBacktest(AlphaWorkspace ws, String period, Map<String, Object> customParams) throws Exception {
    JsonNode cfg = getActiveStrategy(om.readTree(ws.getStrategyConfigJson()));
    String stype = cfg.path("strategy_type").asText("moving_average_timing");
    String pickedPeriod = (period != null && !period.isBlank()) ? period.trim() : "5y";
    if (customParams == null) customParams = Map.of();
```
- **무엇을 하나**: 선택 전략 종류(`stype`)에 따라 **두 갈래**로 Analytics 엔진을 호출.
- **갈래 1 — infinite_buying(L596-L621)**: tickers 정규화 → split/take_profit/loc_offset/initial_capital 파라미터를 모아 `analytics.infiniteBuying(...)` 호출.
- **갈래 2 — 일반 6전략(L623-L654)**: `strategy_type` 을 Python 엔진 전략명으로 매핑(`momentum_rotation→macd`, 그 외→`sma_cross`). 사용자가 코드에서 편집한 `customParams`(sma_fast/slow, rsi_*, macd_* 등)가 있으면 **우선 적용**, 없으면 `parameters.ma_window` 를 `sma_slow` 로 사용.
```java
// L648-L654
JsonNode bt = analytics.backtest(ticker, pyStrategy, extra);
ws.setLastBacktestJson(bt.toString());
if (!"LIVE".equals(ws.getStatus())) ws.setStatus("TESTED"); // LIVE 운용 중이면 강등 금지
workspaceRepo.save(ws);
recordLog(ws.getId(), "SYSTEM", "BACKTEST_RUN", ticker + " / " + pyStrategy + " 백테스트 완료", null);
return bt.toString();
```
- 결과를 `lastBacktestJson` 에 캐시 → status TESTED(LIVE 보호) → 결정 로그 → raw JSON 문자열 반환(컨트롤러가 그대로 프론트에 전달).

> 💡 매핑이 단순한 이유: 7개 전략 템플릿 이름(LLM 용)과 Python 엔진의 6전략 이름이 다릅니다. 여기서 `moving_average_timing→sma_cross` 처럼 **번역**합니다. 즉 LLM 어휘 ↔ 엔진 어휘 어댑터.

#### K. Regime / Trust / Queue-Orders / Briefing / Auto-Run (요약)

- **`doRegime`(L660-L678)**: 선택 전략 첫 자산으로 `analytics.regime(ticker, options)`. options 에 `method=hmm` 명시하면 HMM, 기본은 rule(빠름). → `lastRegimeJson`.
- **`doTrust`(L683-L704)**: `analytics.trustScore(ticker, pyStrategy, options)` → `lastTrustJson`. 로그에 `trust_score` 정수 기록.
- **`doQueueOrders`(L709-L792)**: **infinite_buying 전용**(다른 전략은 `IllegalStateException`). 워크스페이스에 BrokerAccount 가 없으면 사용자의 **MOCK KIS 계정**을 자동 사용(없으면 에러 — 실주문 안전장치). `analytics.infiniteBuyingPlan(...)` 의 각 plan 을 `OrderProposal(status=PENDING, source=SIGNAL, expiresAt=now+24h)` 로 저장. **수량 ≤ 0 은 스킵**.
- **`doBriefing`(L796-L822)**: 목표+전략+백테스트+트러스트를 LLM 에 넘겨 한국어 모닝 브리핑 생성. `buildRegimeReferences`(L828-L850)가 **실재하는 출처 링크 ≥5개**(FRED·VIX·TradingView 등) + 자산 키워드(BTC/TQQQ/KOSPI)에 따른 특화 출처를 붙임.
- **`doAutoRun`(L867-L949)**: **원클릭 전체 파이프라인**. self-injection 으로 `self.doFormalize → self.doBacktest → self.doRegime → self.doTrust → (ib면) self.doQueueOrders` 를 순차 실행.
```java
// L876-L887 (auto-run 1단계)
if (ws.getStrategyConfigJson() == null) {
    try {
        self.doFormalize(ws, uid);
        ws = workspaceRepo.findById(wsId).orElse(ws); // reload after save
        steps.add("formalize");
    } catch (Exception e) { report.put("formalizeError", e.getMessage()); return saveReport(ws, report); }
} else { steps.add("formalize:cached"); }
```
  - **각 단계 실패는 catch → report 에 error 로 담고 계속**(formalize 만 실패 시 조기 반환 — 후속 단계의 전제이므로). 단계마다 `workspaceRepo.findById` 로 **재로딩**: 직전 `self.doXxx` 가 별도 트랜잭션에서 ws 를 저장했으므로 최신 상태를 다시 읽어옵니다.
  - 최종 결과는 `lastReportJson` 에 저장(`saveReport`, L951-L959) → 프론트 캐시.

---

### Ⅱ. `AlphaPatchService` — 연필+되돌리기

#### A. 허용 target 과 한글 키 별칭 — `AlphaPatchService.java:35-52`

```java
// L35-L52
private static final Set<String> ALLOWED_TARGETS = Set.of(
        "strategy", "backtest", "regime", "trustScore", "goalProfile", "code");

private static final Map<String, String> GOAL_KEY_ALIAS = Map.ofEntries(
        Map.entry("기간", "horizon_years"),
        Map.entry("초기투자금", "initial_capital_krw"),
        Map.entry("관심자산", "assets_of_interest"),
        Map.entry("전략방향", "strategy_direction"),
        ... );
```
- **`ALLOWED_TARGETS` (보안 화이트리스트)**: 패치가 건드릴 수 있는 묶음을 6개로 제한. 그 외 target 은 거부(아래 apply). 임의 필드 조작 차단.
- **`GOAL_KEY_ALIAS`**: 구버전 모델이 `기간`/`전략방향` 같은 **한글 키**로 보내도 프론트 카드가 읽는 영문 키로 정규화. 점 경로의 **첫 토큰만** 치환.

#### B. ⭐ `apply` — 패치 적용 + before/after 스냅샷 — `AlphaPatchService.java:54-135`

```java
// L54-L90 (적용 루프)
@Transactional
public AlphaWorkspaceChangeSet apply(AlphaWorkspace ws, String title, List<Map<String, Object>> ops) {
    if (ops == null || ops.isEmpty()) throw new IllegalArgumentException("ops 가 비어있습니다");
    String strategyBefore = ws.getStrategyConfigJson();
    String goalBefore     = ws.getGoalProfileJson();
    String codeBefore     = ws.getCodeJson();
    Map<String, Object> cfg  = readMap(strategyBefore);
    Map<String, Object> goal = readMap(goalBefore);
    Map<String, Object> code = readMap(codeBefore);

    for (Map<String, Object> op : ops) {
        String target = String.valueOf(op.getOrDefault("target", "strategy")).trim();
        String path   = op.get("path") == null ? "" : String.valueOf(op.get("path")).trim();
        Object value  = op.get("value");
        if (!ALLOWED_TARGETS.contains(target)) throw new IllegalArgumentException("허용되지 않은 target: " + target);
        if (path.isEmpty()) throw new IllegalArgumentException("path 가 비어있습니다");

        if ("goalProfile".equals(target)) {            // 한글 키 → 영문 키 정규화
            String[] gp = path.split("\\.", 2);
            String head = GOAL_KEY_ALIAS.getOrDefault(gp[0], gp[0]);
            String normalized = gp.length > 1 ? head + "." + gp[1] : head;
            setPath(goal, normalized, value);
        } else if ("code".equals(target)) {            // path=파일명, value=새 전체 파일
            code.put(path, value == null ? "" : String.valueOf(value));
        } else {                                        // strategy → path, 그 외 → target.path
            String fullPath = "strategy".equals(target) ? path : target + "." + path;
            setPath(cfg, fullPath, value);
        }
    }
```
- **무엇을 하나**: ops 배열을 돌며 세 갈래로 적용 — goalProfile(별칭 정규화), code(파일 통째 교체), 나머지(strategyConfig 내부 경로).
- **target 경로 규칙(클래스 주석 L18-L23)**: `target=strategy → strategyConfig.{path}`, `target=backtest/regime/trustScore → strategyConfig.{target}.{path}`. 즉 strategy 외 target 은 한 단계 더 깊이 들어갑니다.
- **부분 적용 헬퍼 `setPath`(L204-L217)**: 점 경로를 따라 중첩 Map 을 파고들며, 중간 노드가 없거나 Map 이 아니면 새로 만들어가며 마지막 키에 값을 넣음.

```java
// L98-L135 (스냅샷 + ChangeSet 저장)
try {
    strategyAfter = om.writeValueAsString(cfg);
    goalAfter     = om.writeValueAsString(goal);
    codeAfter     = om.writeValueAsString(code);
    opsJson       = om.writeValueAsString(ops);
    Map<String, String> bs = new LinkedHashMap<>();   // before: 세 JSON 모두 보존
    bs.put("strategyConfig", strategyBefore);
    bs.put("goalProfile",    goalBefore);
    bs.put("codeJson",       codeBefore);
    beforeSnap = om.writeValueAsString(bs);
    Map<String, String> as = new LinkedHashMap<>();   // after: 세 JSON 모두
    as.put("strategyConfig", strategyAfter); ...
    afterSnap = om.writeValueAsString(as);
} catch (Exception e) { throw new RuntimeException("JSON 직렬화 실패: " + e.getMessage(), e); }

ws.setStrategyConfigJson(strategyAfter);
ws.setGoalProfileJson(goalAfter);
ws.setCodeJson(codeAfter);
workspaceRepo.save(ws);

AlphaWorkspaceChangeSet cs = changeSetRepo.save(AlphaWorkspaceChangeSet.builder()
        .workspaceId(ws.getId()).title(...).opsJson(opsJson)
        .beforeJson(beforeSnap).afterJson(afterSnap).status("PENDING").build());
helix.recordLog(ws.getId(), "AI", "PARAM_CHANGED", "Heli 패치 적용: " + cs.getTitle(), opsJson);
return cs;
```
- **핵심 설계 — before/after 에 세 JSON 전부 보존**: strategyConfig 만 저장하면 goalProfile·code 패치는 undo 가 안 됩니다. 그래서 `{strategyConfig, goalProfile, codeJson}` 세 개를 통째로 스냅샷. 이게 undo 정확성의 비결.
- 항상 `status="PENDING"` 으로 시작.

#### C. `keep` / `undo` — `AlphaPatchService.java:137-183`

```java
// L137-L146 (keep)
@Transactional
public AlphaWorkspaceChangeSet keep(AlphaWorkspace ws, Long csId) {
    AlphaWorkspaceChangeSet cs = changeSetRepo.findByIdAndWorkspaceId(csId, ws.getId())
            .orElseThrow(() -> new NoSuchElementException("changeset not found"));
    if (!"PENDING".equals(cs.getStatus())) return cs;      // 멱등: 이미 처리됐으면 그대로
    cs.setStatus("KEPT");
    helix.recordLog(ws.getId(), "USER", "PARAM_CHANGED", "변경 유지: " + cs.getTitle(), null);
    return changeSetRepo.save(cs);
}
```
- **keep**: PENDING → KEPT. 이미 PENDING 이 아니면 아무것도 안 함(멱등). KEPT 후에는 되돌리기 불가.

```java
// L148-L183 (undo)
@Transactional
public AlphaWorkspaceChangeSet undo(AlphaWorkspace ws, Long csId) {
    AlphaWorkspaceChangeSet cs = ...;
    if (!"PENDING".equals(cs.getStatus()))
        throw new IllegalStateException("PENDING 상태에서만 실행취소 가능 (현재: " + cs.getStatus() + ")");
    String raw = cs.getBeforeJson();
    boolean restored = false;
    if (raw != null && !raw.isBlank()) {
        try {
            Map<String, Object> bs = om.readValue(raw, new TypeReference<LinkedHashMap<String, Object>>() {});
            if (bs.containsKey("strategyConfig") || bs.containsKey("goalProfile") || bs.containsKey("codeJson")) {
                ws.setStrategyConfigJson(...); ws.setGoalProfileJson(...);
                if (bs.containsKey("codeJson")) ws.setCodeJson(...);
                restored = true;
            }
        } catch (Exception ignore) { /* 구포맷으로 폴백 */ }
    }
    if (!restored) ws.setStrategyConfigJson(raw);   // 구포맷: before 가 strategyConfig 단독 문자열
    workspaceRepo.save(ws);
    cs.setStatus("UNDONE");
    helix.recordLog(ws.getId(), "USER", "USER_REVISION", "변경 실행취소: " + cs.getTitle(), null);
    return changeSetRepo.save(cs);
}
```
- **undo**: **PENDING 일 때만** 가능(KEPT/UNDONE 은 `IllegalStateException` → 컨트롤러가 409 Conflict). before 스냅샷을 그대로 복원.
- **신/구 포맷 양립(중요)**: 신규 포맷은 `{strategyConfig, goalProfile, codeJson}` 객체, 구포맷은 strategyConfig 문자열 단독. 객체 파싱이 실패하거나 키가 없으면 **구포맷으로 폴백**(raw 를 strategyConfig 로). 과거 데이터 호환 보장.

---

### Ⅲ. `ClaudeCodeAgentService` — 외부 코딩 전문가(격리실)

#### A. 설정과 기본 OFF — `ClaudeCodeAgentService.java:46-61`

```java
// L46-L61
@Value("${app.claude.cli.enabled:false}")  private boolean enabled;       // 기본 OFF
@Value("${app.claude.cli.path:claude}")     private String cliPath;
@Value("${app.claude.cli.timeout-sec:180}") private int timeoutSec;
@Value("${anthropic.api.key:}")             private String apiKey;

private static final Set<String> CODE_EXT = Set.of(
        "py", "js", "jsx", "ts", "tsx", "json", "txt", "md", "yaml", "yml", "csv", "ipynb", "java");
public boolean isEnabled() { return enabled; }
```
- **`enabled` 기본 false**: 운영 안전을 위해 명시적으로 켜야만(`app.claude.cli.enabled=true`) 동작. 컨트롤러도 `!agent.isEnabled()` 면 503 반환.
- `CODE_EXT`: 에이전트가 **새로 만든** 파일 중 코드 확장자만 변경으로 인정(쓰레기 파일 무시).

#### B. ⭐ 격리 디렉터리 materialize — `ClaudeCodeAgentService.java:188-203`

```java
// L188-L203
private Materialized materialize(AlphaWorkspace ws) throws IOException {
    Map<String, Object> codeMap = readMap(ws.getCodeJson());
    if (codeMap.isEmpty()) codeMap.put("main", "");
    Path tmp = Files.createTempDirectory("alpha-claude-ws-" + ws.getId() + "-");
    Map<String, String> fileToKey = new LinkedHashMap<>();
    Map<String, String> original = new LinkedHashMap<>();
    for (Map.Entry<String, Object> e : codeMap.entrySet()) {
        String key = e.getKey();
        String content = e.getValue() == null ? "" : String.valueOf(e.getValue());
        String filename = key.contains(".") ? key : key + ".py";   // 확장자 없으면 .py
        Files.writeString(tmp.resolve(filename), content, StandardCharsets.UTF_8);
        fileToKey.put(filename, key);
        original.put(filename, content);
    }
    return new Materialized(tmp, fileToKey, original);
}
```
- **무엇을 하나**: DB 의 `codeJson`(`{"main":"...", "risk_control":"..."}`)을 **임시 디렉터리의 실제 파일들**로 펼침. 확장자 없는 키는 `.py` 로 가정.
- **왜 격리 디렉터리**: Claude CLI 는 작업 디렉터리(cwd)의 파일을 읽고 씁니다. 프로젝트 본체가 아니라 **버려도 되는 임시 폴더**에 워크스페이스 코드만 복사해 줌으로써 다른 파일 접근을 원천 차단.
- `original` 맵 보관: 나중에 **편집 전/후 비교(diff)** 에 사용.

#### C. ⭐⭐ CLI 커맨드 — 허용툴 화이트리스트 + Bash 차단 — `ClaudeCodeAgentService.java:205-215`

```java
// L205-L215
private List<String> buildCommand(boolean streaming) {
    List<String> cmd = new ArrayList<>(List.of(resolveCli(), "-p",
            "--output-format", streaming ? "stream-json" : "json"));
    if (streaming) cmd.add("--verbose");
    cmd.addAll(List.of(
            "--allowedTools", "Read,Edit,Write,Glob,Grep",
            "--disallowedTools", "Bash,WebFetch,WebSearch",   // 보안: 임의 명령/네트워크 차단
            "--no-session-persistence",
            "--max-budget-usd", "1"));
    return cmd;
}
```
- **이 파일에서 가장 중요한 보안 라인**:
  - `--allowedTools Read,Edit,Write,Glob,Grep` — 파일 읽기/편집/작성/검색만 허용.
  - `--disallowedTools Bash,WebFetch,WebSearch` — **임의 셸 명령 실행과 네트워크를 차단**. 전문가의 손발을 묶고 펜만 쥐어주는 것.
  - `--no-session-persistence` — 세션 잔재 안 남김.
  - `--max-budget-usd 1` — 토큰 폭주 비용 상한.
- **`-p`(print/headless)** + `--output-format json|stream-json` — 대화형이 아니라 **헤드리스**로 한 번 돌리고 결과를 JSON 으로.

> ⚠️ 강의 포인트: "AI 에게 코드 편집을 맡긴다"의 진짜 위험은 **Bash 와 네트워크**입니다(`rm -rf`, 데이터 유출). allowedTools/disallowedTools 화이트리스트가 그 위험을 봉합합니다. enabled 기본 OFF + 격리 디렉터리 + 예산 상한과 합쳐 4중 방어.

#### D. CLI 실행 — stdin 프롬프트 + 타임아웃 — `ClaudeCodeAgentService.java:218-245`

```java
// L218-L245 (발췌)
private String[] runCli(Path cwd, String request, boolean streaming, Consumer<String> onLine) ... {
    String prompt = "이 디렉터리는 퀀트 트레이딩 전략 코드입니다. 코드를 직접 편집해 다음 요청을 수행하세요.\n요청: " + request;
    ProcessBuilder pb = new ProcessBuilder(buildCommand(streaming));
    pb.directory(cwd.toFile());
    if (apiKey != null && !apiKey.isBlank()) pb.environment().put("ANTHROPIC_API_KEY", apiKey);
    Process proc = pb.start();
    ...
    Thread tOut = pump(proc.getInputStream(), out, onLine);  // stdout 라인별 콜백
    Thread tErr = pump(proc.getErrorStream(), err, null);
    tOut.start(); tErr.start();
    try (OutputStream stdin = proc.getOutputStream()) {       // 프롬프트는 stdin 으로
        stdin.write(prompt.getBytes(StandardCharsets.UTF_8)); stdin.flush();
    }
    boolean finished = proc.waitFor(timeoutSec, TimeUnit.SECONDS);
    if (!finished) { proc.destroyForcibly(); throw new RuntimeException("Claude Code CLI 타임아웃 ..."); }
    ...
    return new String[]{out.toString(), err.toString()};
}
```
- **프롬프트를 stdin 으로 보내는 이유(클래스 주석 L36)**: *"프롬프트는 stdin(Windows .cmd 인용 회피)"*. 커맨드라인 인자로 넘기면 Windows `.cmd` 의 따옴표·특수문자 이스케이프 지옥에 빠집니다. stdin 으로 주면 안전.
- **stdout/stderr 를 별도 스레드로 pump(L311-L323)**: 출력 버퍼가 가득 차 프로세스가 멈추는 **데드락 방지** 정석. stdout 은 `onLine` 콜백으로 스트리밍.
- **타임아웃 시 `destroyForcibly`**: 매달린 프로세스를 강제 종료.
- `resolveCli()`(L292-L300): Windows 에서 `claude` → `claude.cmd` 로 자동 보정.

#### E. ⭐ 편집 결과 → diff → 패치 `finishApply` — `ClaudeCodeAgentService.java:248-283`

```java
// L248-L283 (발췌)
private AgentResult finishApply(AlphaWorkspace ws, String request, Materialized m, String narration, long t0) ... {
    List<Map<String, Object>> ops = new ArrayList<>();
    ...
    try (Stream<Path> walk = Files.list(m.tmp)) {
        for (Path p : walk.filter(Files::isRegularFile).sorted().toList()) {
            String fn = p.getFileName().toString();
            if (fn.startsWith(".")) continue;
            boolean wasOriginal = m.original.containsKey(fn);
            String ext = ...;
            if (!wasOriginal && !CODE_EXT.contains(ext)) continue;   // 새 파일은 코드 확장자만
            String content = Files.readString(p, StandardCharsets.UTF_8);
            String orig = m.original.get(fn);
            if (orig == null || !orig.equals(content)) {              // 변경된 것만
                String key = m.fileToKey.getOrDefault(fn, ...);
                Map<String,Object> op = new LinkedHashMap<>();
                op.put("target", "code"); op.put("path", key); op.put("value", content);
                ops.add(op);
                changes.add(new FileChange(key, fn, orig == null ? "" : orig, content));
            }
        }
    }
    AlphaWorkspaceChangeSet cs = null;
    if (!ops.isEmpty()) cs = patchService.apply(ws, "Claude Code: " + shortReq, ops);
    ...
    return new AgentResult(cs, narration ..., changedFiles, changes, elapsed);
}
```
- **무엇을 하나**: Claude 가 편집을 마친 임시 디렉터리를 훑어 **원본과 다른 파일만** 골라 `target=code` 패치 ops 로 만들고, **`AlphaPatchService.apply()` 로 ChangeSet(PENDING) 생성**.
- **두 서비스의 연결(설계 정점)**: Claude 에이전트는 직접 DB 를 안 건드립니다. 편집 결과를 **패치 ops 로 변환해 AlphaPatchService 에 위임** → 모든 변경이 동일한 PENDING/KEEP/UNDO 흐름을 탑니다. 즉 AI 코드 편집도 사람 편집과 똑같이 **되돌릴 수 있습니다**.
- `FileChange(path, filename, before, after)` 레코드 → 프론트 Monaco 에디터 diff 뷰에 사용.
- **title `"Claude Code: ..."`**: 이 접두사로 AlphaPatchController.keep 에서 *"Claude 변경이면 GitHub 자동 커밋"*(L72)을 판별합니다.

#### F. 스트리밍 잡 스토어 — `ClaudeCodeAgentService.java:100-169, 367-406`

```java
// L100-L107
public String startAgent(AlphaWorkspace ws, String request) {
    guard(request);
    ClaudeJob job = createJob();
    Thread t = new Thread(() -> runStreamingJob(job, ws, request), "claude-agent-" + job.id);
    t.setDaemon(true); t.start();
    return job.id;        // 즉시 jobId 반환 → 프론트는 /status?since=N 폴링
}
```
- **무엇을 하나**: 긴 작업(수십 초~수 분)을 백그라운드 데몬 스레드로 돌리고 **jobId 만 즉시 반환**. 프론트는 `/claude-agent/status/{jobId}?since=N` 으로 **증분 로그**를 폴링.
- **`streamLineToJob`(L145-L169)**: claude 의 `stream-json` 한 줄(이벤트)을 사람이 읽는 진행 로그로 변환. `assistant` 이벤트의 `tool_use`(📖 읽기/✏️ 편집/📝 작성/🔍 검색)와 `text`(💬), `thinking`(💭)만 노출하고 `result` 이벤트의 최종 narration 을 잡음.
- **`toolUseMessage`(L171-L182)**: Read→"📖 파일명 읽기" 식 이모지 매핑. 사용자가 에이전트의 행동을 실시간으로 보게.
- **`ClaudeJob`(L367-L406)**: `volatile` 상태(running/done/error) + 동기화된 로그 리스트(최대 1000) + `snapshot(since)` 로 커서 이후만 잘라 반환. 잡은 최대 64개 보관(`createJob` 이 끝난 잡부터 정리).
- **임시 디렉터리는 항상 `finally` 에서 삭제**(`deleteRecursive`, L334-L340) — 자원 누수 방지.

---

### Ⅳ. 컨트롤러 3종 (입구)

세 컨트롤러는 모두 같은 패턴을 따릅니다 — **① JWT 로 uid 추출 → ② 워크스페이스 소유 확인 → ③ 서비스 위임 → ④ 결과/에러 매핑**.

#### A. `AlphaWorkspaceController` — CRUD + 채팅 — `controller/AlphaWorkspaceController.java`

```java
// L42-L49 (목록)
@GetMapping("/workspaces")
public ResponseEntity<?> list() {
    Long uid = AuthContext.currentUserId();
    if (uid == null) return unauth();
    return ResponseEntity.ok(svc.getWorkspaceRepo()
            .findByUserIdOrderByUpdatedAtDesc(uid)
            .stream().map(svc::toSummary).toList());
}
```
- **`AuthContext.currentUserId()` (보안 핵심)**: 신원은 오직 **JWT 에서** 옵니다. 클라이언트가 보낸 userId 를 믿지 않습니다(IDOR 방지). 모든 핸들러 첫 줄이 이 패턴.
- **소유권 검증 `findByIdAndUserId(id, uid)`**: 워크스페이스 조회는 항상 "id **그리고** 내 uid" 로. 남의 워크스페이스 id 를 넣어도 못 봅니다.
- 채팅(L221-L232): `processChat` 위임. 빈 텍스트는 400. 빈 히스토리면 친절한 온보딩 인사를 먼저 저장(L199-L217).
- 코드 저장(L258-L273): `PATCH /code` 로 codeJson 통째 저장(DeveloperLab 직접 편집).

#### B. `AlphaAnalyticsController` — 파이프라인 — `controller/AlphaAnalyticsController.java`

```java
// L34-L62 (backtest 발췌)
@PostMapping("/workspaces/{id}/backtest")
public ResponseEntity<?> backtest(@PathVariable Long id,
        @RequestParam(value="period", required=false) String period,
        @RequestBody(required=false) Map<String,Object> body) {
    ...
    if (ws.getStrategyConfigJson() == null)
        return ResponseEntity.status(HttpStatus.UNPROCESSABLE_ENTITY)
                .body(Map.of("error", "먼저 /formalize로 전략을 정형화하세요"));
    try {
        ... String json = svc.doBacktest(ws, periodFinal, customParams);
        return ResponseEntity.ok().contentType(MediaType.APPLICATION_JSON).body(json);
    } catch (Exception e) {
        return ResponseEntity.status(HttpStatus.BAD_GATEWAY).body(Map.of("error", ...));
    }
}
```
- **전제조건 게이트**: 전략이 없으면 422(`먼저 /formalize`). auto-run 은 goalProfile 없으면 422(`먼저 채팅으로 목표 정의`).
- **에러 → HTTP 상태 매핑(중요)**: Analytics 엔진 호출 실패는 **502 Bad Gateway**(우리 잘못이 아니라 하위 서비스 문제), 전제조건 위반은 **422**, 서버 내부 오류는 500. 의미 있는 상태코드로 프론트가 분기.
- **raw JSON 그대로 반환**: `doBacktest` 가 Python 엔진 JSON 문자열을 그대로 돌려주고, 컨트롤러는 `contentType(APPLICATION_JSON)` 으로 통과시킴(다시 파싱 안 함 — 오버헤드·왜곡 방지). *(메모: 이는 Boot4 Jackson3 JsonNode 빈 버그를 피하는 패턴과도 통합니다.)*

#### C. `AlphaPatchController` — 패치 — `controller/AlphaPatchController.java`

```java
// L61-L79 (keep + GitHub 커밋)
@PostMapping("/workspaces/{id}/changesets/{csId}/keep")
public ResponseEntity<?> keep(@PathVariable Long id, @PathVariable Long csId) {
    ...
    AlphaWorkspaceChangeSet cs = patch.keep(ws, csId);
    Map<String, Object> dto = toDto(cs, ws);
    if (cs.getTitle() != null && cs.getTitle().startsWith("Claude Code:") && ws.getGithubRepoFullName() != null) {
        dto.put("gitCommit", gitSync.commitChangeSet(ws, cs, uid));   // A3: Co-Authored-By Claude
    }
    return ResponseEntity.ok(dto);
}
```
- apply(L37-L59): ops 검증 실패는 `IllegalArgumentException`→400, 그 외는 500.
- **keep 시 조건부 GitHub 커밋**: ChangeSet title 이 `"Claude Code:"` 로 시작하고 워크스페이스에 repo 가 연동돼 있으면 `ClaudeGitSyncService.commitChangeSet` 으로 자동 커밋. AI 편집을 유지 확정하면 실제 Git 히스토리에 남깁니다.
- undo(L81-95): `IllegalStateException`(PENDING 아님)→**409 Conflict**.

---

### Ⅴ. 엔티티 4종 (서류철)

| 엔티티 | 테이블 | 핵심 컬럼 | 메모 |
|---|---|---|---|
| `AlphaWorkspace` | `alpha_workspace` | `goalProfileJson`(TEXT) · `strategyConfigJson`(LONGTEXT) · `lastBacktestJson`/`lastRegimeJson`/`lastReportJson`(LONGTEXT) · `lastTrustJson`(TEXT) · `codeJson`(LONGTEXT) · `status` · `brokerAccountId` · `githubRepoFullName`/`githubBranch` | 한 행이 손님 한 명의 전략 전체. JSON 을 문자열 컬럼에 통째로(스키마리스 유연성) |
| `AlphaChatMessage` | `alpha_chat_message` | `workspaceId` · `role`(user/model) · `text`(TEXT) | `(workspace_id, created_at)` 인덱스로 시간순 조회 빠르게 |
| `AlphaDecisionLog` | `alpha_decision_log` | `actor`(USER/AI/SYSTEM) · `eventType`(GOAL_DEFINED/STRATEGY_PROPOSED/PARAM_CHANGED/BACKTEST_RUN/...) · `summary` · `payloadJson` | 업무일지. `recordLog` 가 채움 |
| `AlphaWorkspaceChangeSet` | `alpha_workspace_changeset` | `opsJson` · `beforeJson` · `afterJson` · `status`(PENDING/KEPT/UNDONE) | 되돌리기 영수증. before/after 전체 스냅샷 |

```java
// AlphaWorkspace.java:38-63 (JSON 컬럼들)
@Lob @Column(columnDefinition = "TEXT")      private String goalProfileJson;
@Lob @Column(columnDefinition = "LONGTEXT")  private String strategyConfigJson;
@Lob @Column(columnDefinition = "LONGTEXT")  private String lastBacktestJson;
@Lob @Column(columnDefinition = "TEXT")      private String lastTrustJson;
@Lob @Column(name="last_regime_json", columnDefinition="LONGTEXT") private String lastRegimeJson;
@Lob @Column(name="last_report_json", columnDefinition="LONGTEXT") private String lastReportJson;
@Lob @Column(name="code_json", columnDefinition="LONGTEXT")        private String codeJson;
```
- **왜 JSON 문자열로(설계 철학)**: 목표/전략/백테스트 결과는 구조가 자주 바뀌고 중첩이 깊습니다. 매번 컬럼·테이블을 쪼개면 마이그레이션 지옥. **JSON 을 통째 문자열로** 두면 스키마 변경 없이 진화 가능(Document-in-RDB 패턴). 대신 DB 레벨 쿼리(WHERE goal=...)는 못 합니다 — 이 도메인은 그게 필요 없습니다(항상 워크스페이스 단위로 통째 로드).
- **TEXT vs LONGTEXT**: 백테스트 결과·전략·코드처럼 클 수 있는 건 LONGTEXT(최대 4GB), 짧은 건 TEXT(64KB).

---

## ⚠️ 함정·보안 주의 (코드에 박힌 교훈 모음)

1. **Claude CLI = Bash/네트워크 차단(최우선)** — `--allowedTools Read,Edit,Write,Glob,Grep` + `--disallowedTools Bash,WebFetch,WebSearch`. 여기에 **기본 OFF(`enabled=false`) + 임시 격리 디렉터리 + `--max-budget-usd 1` + 타임아웃** 4중 방어. 하나라도 풀면 "AI 에게 셸을 쥐어주는" 위험.
2. **패치 JSON 파싱 복구** — LLM 응답은 설명+JSON 이 섞입니다. `extractJsonBlock`/`extractFirstJsonArray` 의 **brace-matching + 문자열/이스케이프 추적**으로 JSON 만 도려냅니다. 통째 `readTree` 는 깨짐. 정형화는 배열 실패 시 단일 객체로, 그래도 안 되면 명시적 예외.
3. **워크스페이스 인지 컨텍스트 = 최근 수정사항** — `buildWorkspaceStateContext` 가 현재 목표/전략/백테스트 수치를 컨텍스트 앞에 주입해야 AI 가 *"이 전략 승률 올려줘"* 에 답합니다. **stats 만**(equity_curve 제외) 넣어 토큰 폭발 방지. 빈 워크스페이스는 빈 문자열(온보딩 보호).
4. **self-injection 트랜잭션** — auto-run 은 반드시 `self.doXxx`(프록시 경유)로 호출해야 `@Transactional` 이 단계별로 작동. `this.` 면 트랜잭션이 안 걸림. 각 단계 후 `workspaceRepo.findById` 재로딩.
5. **before/after 세 JSON 전부 스냅샷** — strategyConfig 만 저장하면 goalProfile·code 패치 undo 불가. `{strategyConfig, goalProfile, codeJson}` 통째 보존 + 구포맷 폴백.
6. **undo 는 PENDING 에서만** — KEPT/UNDONE 은 409. keep 은 멱등(이미 처리됐으면 무동작).
7. **LIVE 상태 강등 금지** — backtest/formalize 가 `if (!"LIVE"...)` 가드로 운용 중 워크스페이스의 status 를 덮지 않음.
8. **신원은 JWT 에서만 + 소유권 검증** — `AuthContext.currentUserId()` + `findByIdAndUserId`. 클라이언트 userId 불신(IDOR 방지).
9. **자동주문은 MOCK 우선** — `doQueueOrders` 는 infinite_buying 전용 + BrokerAccount 없으면 MOCK KIS 계정 자동 사용(없으면 에러). OrderProposal 은 `PENDING` + 24h 만료. 실주문은 별도 승인 단계(`05` 보안 설계의 MOCK→REAL 게이트).
10. **에러 → 상태코드 의미 부여** — Analytics 실패 502, 전제조건 422, 충돌 409, 인증 401. 프론트가 정확히 분기.

---

## 🚀 고도화 아이디어 (강의·개선 버전용)

- **목표 게이트 정합성**: `hasAllGoalKeys` 가 `initial_capital_krw` 를 검사 안 함(프롬프트는 8개 요구). 게이트를 프롬프트와 일치시키거나, 프롬프트의 "8개" 표현을 게이트와 맞추기 — **요구사항 단일 진실** 강의 예제로 최적.
- **JSON 추출 라이브러리화**: `extractJsonBlock`/`extractFirstJson`/`extractFirstJsonArray` 3개의 중복·미묘한 차이(문자열 추적 유무)를 한 유틸로 통합 + 단위 테스트(중첩/이스케이프/배열/잘린 응답).
- **스트리밍을 SSE/WebSocket 으로**: 지금은 `/status?since=N` 폴링. Server-Sent Events 로 바꾸면 지연·요청수 감소.
- **ChangeSet 충돌 관리**: 동시에 두 PENDING 패치가 같은 path 를 건드리면? 낙관적 락(version) 또는 path 단위 잠금 도입.
- **패치 미리보기(dry-run)**: apply 전에 after 스냅샷만 계산해 프론트에 보여주고 사용자가 확정 시 저장 — 진짜 "변경 추적" UX.
- **Claude 에이전트 동시성 상한**: 사용자/서버당 동시 잡 수 제한(현재 MAX_JOBS=64 는 보관 한도일 뿐 동시 실행 제한 아님) + 큐잉.
- **무한매수 외 전략 자동주문**: `doQueueOrders` 를 sma_cross/macd 등 latest_signal 기반으로 확장(엔진의 `latest_signal` 활용).
- **브리핑 출처 자동 검증**: `buildRegimeReferences` 의 URL 헬스체크 캐시(깨진 링크 자동 제외).
- **goalProfile 스키마 검증**: JSON Schema 로 타입·범위(horizon_years>0, MDD 0~100)를 강제해 LLM 환각 수치 차단.

---

## 📚 용어 사전 (이 파트 한정)

| 용어 | 뜻 |
|---|---|
| **워크스페이스(AlphaWorkspace)** | 전략 1개 = 서류철 1권. 채팅·로그·전략·결과가 종속 |
| **status 머신** | DRAFT→GOAL_SET→FORMALIZED→TESTED→LIVE 5단계 라벨 |
| **goalProfile** | 채팅으로 모은 8가지 목표 JSON |
| **strategyConfig envelope** | `{candidates:[...3개], selectedId}` 후보 봉투 |
| **getActiveStrategy** | 봉투에서 selectedId 카드 1장 꺼내기 |
| **formalize(정형화)** | 목표 → deterministic 백테스트 가능한 전략 후보 3개 |
| **heli-patch / ops** | `{target,path,value}` 부분 패치 명령 |
| **ChangeSet** | 패치 한 묶음 + before/after 스냅샷. PENDING/KEPT/UNDONE |
| **PENDING/KEPT/UNDONE** | 적용됨(미확정)/유지확정/롤백완료 |
| **setPath** | 점 경로(`a.b.c`)를 따라 중첩 Map 에 값 주입 |
| **callAi** | 모든 LLM 호출의 단일 통로(인증=Gateway 쿼터, 미인증=Gemini 폴백) |
| **buildWorkspaceStateContext** | 현재 상태 요약(stats만)을 컨텍스트에 주입 → 분석가 모드 |
| **extractJsonBlock** | LLM 답변에서 brace-matching 으로 JSON 도려내기 |
| **self-injection** | `@Lazy self` 로 자기 트랜잭션 메서드를 프록시 경유 호출 |
| **doAutoRun** | formalize→backtest→regime→trust→(ib)queue 원클릭 파이프라인 |
| **materialize** | codeJson → 임시 격리 디렉터리의 실제 파일들 |
| **allowedTools/disallowedTools** | Claude CLI 도구 화이트/블랙리스트(Read/Edit/Write/Glob/Grep 허용, Bash/Web 차단) |
| **stream-json** | claude `-p` 의 라인별 이벤트 출력 포맷(진행 로그용) |
| **잡 스토어(ClaudeJob)** | 비동기 에이전트 진행/로그/결과 보관소. `/status?since=N` 폴링 |
| **FileChange** | 편집 전/후(before/after) — 프론트 Monaco diff |
| **AuthContext.currentUserId()** | JWT 에서만 신원 취득(IDOR 방지) |
| **findByIdAndUserId** | 소유권까지 검증하는 조회 |
| **recordLog / AlphaDecisionLog** | 모든 의사결정 시간순 기록(업무일지) |
| **OrderProposal(PENDING)** | 자동 큐잉된 주문 제안(24h 만료, 별도 승인 필요) |
