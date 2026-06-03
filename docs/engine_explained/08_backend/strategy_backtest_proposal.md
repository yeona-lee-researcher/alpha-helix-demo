# `domain/strategy` — 백테스트·전략·시그널·구독 (완전 라인별 해설)

> 원본: `backend/src/main/java/com/DevBridge/devbridge/domain/strategy/`
> 이 문서는 **표준 형식**([`01_backtest/vbt_engine.md`](../01_backtest/vbt_engine.md))을 따릅니다.
> Spring 기초(`@Service`·`@RestController`·DI·`@Transactional`)는 `08_backend/00_spring_primer.md` 를 전제로 합니다(아직 미작성이라면, 각 절의 "초보 포인트"가 그 빈틈을 메웁니다).
> 다루는 파일: `service/BacktestService` · `service/AnalyticsClient` · `service/DailySignalGenerator` · `service/SubscriptionService` · `service/MarketDataService` · `controller/StrategyController` · `controller/SubscriptionController` · `controller/AnalyticsController` · `entity/{Strategy,Subscription,DailySignal,OrderProposal}`

---

## 📌 이 파트 한눈에

이 파트는 백엔드(Spring)의 **"전략 운영 본부"** 입니다. 사용자가 만든 투자 전략을 보관하고, 매일 자동으로 백테스트를 돌려 "오늘 뭘 사야 하나(시그널)"를 계산하고, 그 시그널을 **주문 제안(OrderProposal)** 으로 바꾸고, 유료 기능을 쓸 수 있는지(구독)를 확인합니다.

> 비유: 이 파트는 **자산운용사의 백오피스**입니다.
> - **전략 보관실**(`Strategy` 엔티티 + `StrategyController`) — 고객별 전략 카드를 캐비닛에 보관.
> - **리서치팀**(`BacktestService`, `AnalyticsClient`) — 과거 데이터로 "이 전략 얼마나 벌었나"를 계산. 단순 계산은 사내(Java)에서, 무거운 정밀 분석은 외부 연구소(Python:8001)에 위탁.
> - **데일리 데스크**(`DailySignalGenerator`) — 매일 밤 22:30 모든 전략을 재계산하고 "내일 행동 지침"을 메일로 발송 + 주문 제안서 작성.
> - **회계·요금제팀**(`SubscriptionService`) — 누가 유료 회원인지, 결제가 중복되지 않았는지 관리.

**⭐ 가장 먼저 이해할 핵심 구조 — "백테스트가 두 군데서 돈다"**

초보가 가장 헷갈리는 지점입니다. 이 코드베이스에는 백테스트 경로가 **둘** 있습니다.

| 경로 | 누가 | 어디서 계산 | 무엇을 |
|---|---|---|---|
| **경로 A (사내 Java 엔진)** | `BacktestService` | **백엔드 안(순수 Java for-loop)** | 무한매수법(LOC)·VR 밸류리밸런싱. DB에 캐시된 일봉을 직접 돌림. → `Strategy`/`StrategyController`/`DailySignalGenerator` 가 사용 |
| **경로 B (외부 Python 위탁)** | `AnalyticsClient` | **Analytics 사이드카(:8001, vectorbt)** | sma_cross·rsi·macd 등 6전략 + XGBoost + Trust/Regime. → `AnalyticsController` 가 프론트에 노출 |

즉 `BacktestService` 는 **Python을 호출하지 않습니다** — 무한매수/VR 알고리즘을 Java로 직접 구현했습니다(프론트의 `lib/backtest.js` 와 1:1 동일). 반면 `AnalyticsClient` 는 **백엔드↔Python 다리**로, vectorbt·XGBoost 같은 무거운 퀀트 로직을 :8001 의 [`main.py`](../06_api/main.md) 엔드포인트에 위탁합니다.

| 핵심 클래스 | 한 줄 역할 | 비유 |
|---|---|---|
| `StrategyController` | 전략 CRUD + 사용자 격리 + 백테스트 수동 트리거 | 전략 카드 캐비닛 접수창구 |
| `BacktestService` | **사내** 무한매수/VR 백테스트 엔진(Java) → trades·summary·state·signal 저장 | 리서치팀의 자체 계산기 |
| `MarketDataService` | 일봉 OHLC 수집(Stooq/Binance) + DB 캐시 | 가격 데이터 창고지기 |
| `AnalyticsClient` | **외부** Python:8001 호출(서킷브레이커+재시도) | 외부 연구소 위탁 담당자 |
| `AnalyticsController` | `AnalyticsClient` 를 프론트에 얇게 노출 | 위탁 결과 전달 데스크 |
| `DailySignalGenerator` | 매 평일 22:30 전체 재계산 → 메일 + OrderProposal | 데일리 데스크 야간조 |
| `SubscriptionService` | 구독 등급 조회/활성화/만료(멱등 보장) | 회계·요금제팀 |
| `SubscriptionController` | Toss 결제 confirm + 금액 위변조 차단 | 결제 창구 |

---

## 🧠 사전 지식 (이거 모르면 막힘)

#### 1) 서킷 브레이커(Circuit Breaker) = "전기 두꺼비집"
- 외부 서비스(Python:8001)가 죽었는데도 계속 호출하면, 매번 타임아웃까지 기다리느라 **백엔드 전체가 느려집니다**(장애 전파).
- 두꺼비집처럼 **"최근 호출의 50%가 실패하면 회로를 OPEN(차단)"** 해서, 한동안(여기선 30초) 아예 호출을 안 하고 **즉시 실패**시킵니다. → 빠른 실패(fast-fail)로 백엔드를 보호.
- 상태 3가지: `CLOSED`(정상, 통과) → `OPEN`(차단, 즉시 실패) → `HALF_OPEN`(시험삼아 몇 건만 통과시켜 회복됐나 확인).
- 이 프로젝트 설정(`application.properties`): 슬라이딩 윈도우 10건 중 실패율 50% → OPEN 30초 → HALF_OPEN에서 3건 시험.

#### 2) 재시도(Retry) = "한 번 더 눌러보기"
- 네트워크는 가끔 **일시적으로** 끊깁니다(패킷 유실 등). 그럴 때 한 번 더 보내면 성공하는 경우가 많습니다.
- 이 프로젝트: 최대 3회, 2초 간격. **단, 4xx(잘못된 요청)는 재시도 안 함** — 파라미터가 틀린 요청은 100번 보내도 똑같이 틀리니까(낭비). 5xx·네트워크 오류만 재시도.

#### 3) 사이드카(Sidecar) 호출 = "본체 옆에 붙은 전문 보조 프로세스"
- 무거운 수학(vectorbt·XGBoost)을 Java로 다시 짜면 비효율적이라, **Python 전용 프로세스(:8001)** 를 옆에 띄워 HTTP로 일을 시킵니다.
- 백엔드는 매 요청에 `X-Internal-Token` 헤더를 붙여 "나는 정식 백엔드다"를 증명합니다(외부인이 :8001 직접 호출 차단). → 엔진 쪽 해설은 [`06_api/main.md`](../06_api/main.md) 의 `require_internal_token` 참고.

#### 4) 구독 플랜 — DB는 단순, 표시는 금액으로
- **이 프로젝트의 미묘한 설계**: DB의 `Subscription.Tier` enum 은 `FREE` / `PRO` **둘뿐**입니다.
- 사용자에게 보이는 **STANDARD(9,900원) / PREMIUM(19,900원)** 구분은 DB에 따로 컬럼이 없고, **결제 금액(`amountKrw`)으로 런타임에 파생**합니다(`deriveTierDisplay`: 19,900 이상이면 PREMIUM, 아니면 STANDARD).
- `User.UserType` 에는 `FREE/STANDARD/PREMIUM` 이 따로 있어, 결제 시 금액에 맞춰 갱신합니다. (CLAUDE.md의 "EXPERT(준비중)"는 아직 코드에 없음.)

#### 5) 멱등성(Idempotency) = "여러 번 눌러도 결과는 한 번"
- 결제 성공 후 사용자가 **새로고침하거나 더블클릭**하면 confirm 요청이 2번 갈 수 있습니다. 그대로 두면 구독이 2개 생기고 이중 과금처럼 보입니다.
- "같은 결제키면 두 번째부터는 **새로 만들지 않고 기존 것을 그대로 반환**" → 이게 멱등성. 이 프로젝트는 **3중 방어**(애플리케이션 사전체크 + DB 유니크 제약 + 경합 예외 처리)로 보장합니다(아래 함정 절).

#### 6) `@Transactional` = "전부 성공 아니면 전부 취소(트랜잭션)"
- 메서드에 붙이면 그 안의 DB 작업들이 **하나의 묶음(원자적)**. 중간에 예외가 나면 앞서 한 저장도 **롤백**됩니다.
- `readOnly = true` 는 "읽기 전용"이라 DB에 약간의 최적화 힌트를 줍니다(쓰기 안 함 보장).

#### 7) `@Scheduled(cron=...)` = "정해진 시각에 자동 실행되는 알람"
- `cron = "0 30 22 * * MON-FRI"` = **초 분 시 일 월 요일** → "월~금 매일 22시 30분 0초". `zone="Asia/Seoul"` 로 한국시간 기준.
- 서버가 떠 있기만 하면, 아무도 호출하지 않아도 스프링이 알아서 실행합니다.

#### 8) `AuthContext.currentUserId()` = "지금 요청한 사람이 누구인지"
- JWT 필터가 토큰에서 사용자 ID를 꺼내 **요청 스레드에 보관**해 둔 것. 컨트롤러는 이걸 읽어 "이 전략이 정말 이 사람 것인가"를 검사합니다(소유권 격리).

---

## 🗺 요청 흐름도

### 흐름 ①: 사용자가 "백테스트 실행" 버튼 (경로 A — 사내 Java 엔진)

```
[프론트] POST /api/strategies/{id}/backtest  (JWT 쿠키)
        │
        ▼
StrategyController.runBacktest()
        │  ① AuthContext.currentUserId() 로 로그인 확인
        │  ② strategy.user.id == uid  소유권 검증 (남의 전략 차단)
        ▼
BacktestService.runFor(Strategy)
        │  ③ MarketDataService.getDaily(ticker, startDate)
        │        └─ DB에 일봉 있으면 그대로, 오래됐으면(2일↑) Stooq/Binance에서 받아 채움
        │  ④ method 분기:
        │        INFINITE_BUY     → runInfiniteBuy()   (LOC 분할매수 시뮬레이션)
        │        VALUE_REBALANCING→ runValueRebalancing() (V값 밴드 매매)
        │  ⑤ 결과를 DB에 4종 저장:
        │        StrategyTrade(source=BACKTEST) 재생성
        │        StrategyState (마지막 날 잔고) upsert
        │        StrategyBacktestSummary (CAGR/MDD/승률/TrustScore) upsert
        │        DailySignal (오늘 BUY/HOLD/WATCH/PAUSE) upsert
        ▼
[프론트] ← StrategyBacktestSummaryDto (성적표 카드)
```

### 흐름 ②: 프론트가 "정밀 분석(vectorbt/XGBoost)" 요청 (경로 B — Python 위탁)

```
[프론트] POST /api/analytics/backtest  (JWT)
        │
        ▼
AnalyticsController.backtest()
        ▼
AnalyticsClient.backtest(ticker, strategy, extra)
        │  call() → [Retry(3회)] → [CircuitBreaker]
        │             │
        │             ▼  HTTP POST  + 헤더 X-Internal-Token
        ▼
[Analytics :8001]  main.py  POST /backtest
        │  get_history → run_backtest(vectorbt) → compute_metrics(QuantStats)
        ▼
        JSON {stats, equity_curve, risk_metrics}  → JsonNode → 프론트 차트
        ⚠ 회로 OPEN이면: 즉시 "Analytics 일시 사용불가" 던지고 끝(폴백)
```

### 흐름 ③: 매일 밤 22:30 자동 데일리 잡

```
@Scheduled 22:30 KST  DailySignalGenerator.runDaily()
        │
        ├─ 1) marketDataService.scheduledRefresh()     시세 신선화
        ├─ 2) 활성 전략 전체 backtestService.runFor(s)  → DailySignal upsert
        ├─ 3) emailAlertService.dispatchPending(today)  미발송 시그널 메일
        ├─ 4) createProposalsFor(today)                 ★BUY 시그널 → OrderProposal
        │        └─ BUY인 전략마다:
        │             pickTradingAccount(거래가능 계정, REAL 우선)
        │             중복 체크(같은 sourceSignalId)
        │             OrderProposal(status=PENDING, expiresAt=+24h) 저장
        │             계정이 autoExecute=ON 이면 → ProposalExecutionService.execute()
        └─ 5) refreshAlphaWorkspaces()                  Alpha 워크스페이스 재실행
```

> **핵심 안전 원칙**: 2~4단계가 자동이지만, OrderProposal은 항상 **PENDING(대기)** 으로 시작합니다. 사용자가 명시적으로 승인하지 않으면 실주문으로 가지 않습니다(`autoExecute` 계정은 예외 — 단 REAL 자동매매는 사전에 MOCK 졸업 게이트를 통과한 계정만).

---

## 📖 핵심 클래스 라인별 심화

### A. `BacktestService` — 사내 백테스트 엔진 (Java)

이 클래스의 정체를 먼저 못박습니다. 파일 상단 주석:

```java
// BacktestService.java:33-42
/**
 * 무한매수법(LOC) + VR 밸류 리밸런싱 백테스트 엔진.
 * Frontend lib/backtest.js의 알고리즘과 1:1 동일.
 * 결과:
 *  - StrategyTrade rows (source=BACKTEST) 재생성
 *  - StrategyBacktestSummary 1건 upsert
 *  - 마지막 날의 StrategyState 1건 upsert
 *  - 마지막 날의 DailySignal 1건 upsert
 */
```
- **이건 Python을 부르지 않습니다.** 무한매수/VR 알고리즘을 순수 Java for-loop로 직접 돌립니다. (vectorbt 기반 6전략은 별개의 경로 B.)

#### A-1. 진입점 `runFor` — `BacktestService.java:66-124`

```java
// BacktestService.java:66-75
@Transactional
public StrategyBacktestSummary runFor(Strategy s) {
    var ohlc = marketDataService.getDaily(s.getTicker(), s.getStartDate());
    if (ohlc.size() < 30) {
        log.warn("[Backtest] {} insufficient OHLC ({} rows)", s.getCode(), ohlc.size());
        return null;
    }
    Result r = s.getMethod() == Strategy.Method.INFINITE_BUY
            ? runInfiniteBuy(s, ohlc)
            : runValueRebalancing(s, ohlc);
```
- **무엇을 하나**: ① 일봉을 가져오고 ② 30개 미만이면 포기(`null`) ③ 전략 method에 따라 두 엔진 중 하나를 호출.
- **왜 30개 컷**: 30거래일도 안 되는 데이터로는 CAGR·MDD가 의미 없습니다(통계적 노이즈). 컨트롤러는 이 `null`을 받아 **HTTP 422("insufficient market data")** 로 변환합니다(`StrategyController:320`).
- **초보 포인트**: `?` `:` 는 삼항연산자 — "조건 ? 참일때값 : 거짓일때값". `method == INFINITE_BUY` 면 무한매수, 아니면 VR.

```java
// BacktestService.java:77-94 (요약)
    // 1) trades 재생성 (백테스트 source만)
    tradeRepo.deleteByStrategyIdAndSource(s.getId(), StrategyTrade.Source.BACKTEST);
    tradeRepo.saveAll(r.trades);
    // 2) state upsert (마지막 날)
    var last = r.equityCurve.get(r.equityCurve.size() - 1);
    var stateOpt = stateRepo.findByStrategyIdAndAsOfDate(s.getId(), last.date);
    StrategyState st = stateOpt.orElseGet(() -> StrategyState.builder()
            .strategy(s).asOfDate(last.date).build());
    ... st.setCashUsd(...); st.setShares(...); ...
    stateRepo.save(st);
```
- **재생성 패턴**: 백테스트를 다시 돌릴 때마다 기존 BACKTEST trades를 **싹 지우고 새로 저장**. 멱등하게 만드는 방법(여러 번 돌려도 trades가 누적되지 않음). ⚠️ `source=BACKTEST` 만 지웁니다 — 실제 체결(`LIVE`)·수동(`MANUAL`) trades는 건드리지 않음(실거래 기록 보존).
- **upsert 패턴**: `findBy...` 로 기존 행을 찾고, 없으면(`orElseGet`) 새로 빌드. 있으면 그 행의 필드만 갱신. → 전략×날짜당 state/summary/signal이 **딱 1건**만 유지(`DailySignal`의 `uq_signal_strategy_date` 유니크와 정합).

```java
// BacktestService.java:104
    summary.setTrustScore(computeTrustScore(r.metrics));
```
- 여기 `computeTrustScore`는 **사내 간이 점수**입니다(아래 A-4). 경로 B의 Python Trust Score(`/trust`, Walk-Forward+Regime 기반)와는 **다른 것**임에 주의.

```java
// BacktestService.java:110-121
    // 4) 오늘의 시그널 upsert
    if (r.signal != null) {
        var sigOpt = signalRepo.findByStrategyIdAndAsOfDate(s.getId(), last.date);
        DailySignal sig = sigOpt.orElseGet(() -> DailySignal.builder()
                .strategy(s).asOfDate(last.date).build());
        sig.setSignal(r.signal.signal);
        ... sig.setTitle/Summary/Action ...
        // 신규 시그널이면 deliveredAt은 null로 두고 알림 스케줄러가 발송
        signalRepo.save(sig);
    }
```
- **시그널이 메일로 가는 연결고리**: 새 시그널은 `deliveredAt=null`. `DailySignalGenerator`가 22:30에 `dispatchPending`으로 null인 것만 골라 메일 발송 후 시각을 채웁니다(중복 발송 방지).

#### A-2. 무한매수 엔진 `runInfiniteBuy` — `BacktestService.java:128-200`

```java
// BacktestService.java:128-136
private Result runInfiniteBuy(Strategy s, List<MarketOhlcDaily> ohlc) {
    Params p = parseParams(s.getParamsJson());
    boolean crypto = isCryptoTicker(s.getTicker()); // 크립토는 분수 수량
    double principalUsd = s.getPrincipalKrw() / USD_KRW;
    double dailyBudget = principalUsd / p.splits;
    double cash = principalUsd, shares = 0, totalCost = 0;
```
- **무엇을**: 원금(KRW)을 USD로 환산(`USD_KRW=1300` 고정 — `:48`에 "실시간 환율 API로 교체" TODO)하고, `splits`(기본 40)로 나눠 **하루 예산**을 정합니다. 라오어식 무한매수법의 핵심 = "원금을 40등분해 매일 조금씩".
- **초보 포인트**: `parseParams`는 `Strategy.paramsJson`(예: `{"splits":40,"sellTargetPct":10,...}`)을 Jackson `ObjectMapper`로 읽어 `Params` 객체로 변환(아래 A-3).

```java
// BacktestService.java:145-157  (매일: 1) 먼저 매도 체크)
    if (shares > 0 && avg > 0) {
        double sellPx = avg * (1 + p.sellTargetPct / 100.0);
        if (high >= sellPx) {        // 그날 고가가 목표가를 찍었으면 익절
            double proceeds = shares * sellPx;
            double pnl = proceeds - totalCost;
            ... trades.add(SELL_TARGET) ...
            cash += proceeds; shares = 0; totalCost = 0;  // 사이클 리셋
        }
    }
```
- 평단(`avg`) 대비 `+sellTargetPct%`(기본 10%)에 매도 지정가를 걸고, **그날 고가가 그 가격을 건드리면 전량 익절**. 익절하면 보유 0으로 리셋 → 새 사이클 시작.

```java
// BacktestService.java:169-190  (매일: 2) 매수 — LOC 두 종류)
    } else if (cash >= dailyBudget * 0.05) {
        double newAvg = shares > 0 ? totalCost / shares : close;
        double upperLOC = newAvg * (1 + p.locUpperPct / 100.0);
        if (close <= newAvg) {                         // 평단 이하 → 1회차 풀매수
            double qty = crypto ? dailyBudget / close : Math.floor(dailyBudget / close);
            ... kind = LOC_AVG ...
        } else if (close <= upperLOC) {                // 평단~상단 → 0.5회차
            double qty = crypto ? (dailyBudget/2.0)/close : Math.floor((dailyBudget/2.0)/close);
            ... kind = LOC_UPPER ...
        }
    }
```
- LOC(Limit On Close, 종가 지정가) 두 단계: 종가가 평단 **이하면 하루치 풀매수**, 평단~상단 사이면 **절반 매수**, 상단 위면 매수 안 함. "쌀수록 더 산다"는 분할매수 철학.
- ⚠️ **크립토 vs 주식**: 주식은 `Math.floor`(정수 주식 수)지만, 고가 코인은 정수로 내림하면 0주가 되어버려 **크립토는 분수 수량**(`dailyBudget/close`)을 그대로 씁니다.

#### A-3. 파라미터 파싱 `parseParams` — `BacktestService.java:377-396`

```java
// BacktestService.java:380-393 (발췌)
    try {
        JsonNode n = om.readTree(json);
        if (n.has("splits")) p.splits = n.get("splits").asInt(40);
        if (n.has("sellTargetPct")) p.sellTargetPct = n.get("sellTargetPct").asInt(10);
        ...
    } catch (Exception e) {
        log.warn("paramsJson parse failed: {}", e.getMessage());
    }
    return p;
```
- **방어적 파싱**: 각 키가 있을 때만 덮어쓰고(`if n.has`), 파싱이 깨져도 예외를 삼켜 **기본값 Params로 폴백**. → 사용자가 paramsJson을 망가뜨려도 백테스트가 죽지 않습니다(안정성 > 엄격성).
- **초보 포인트**: `asInt(40)`의 인자 40은 "값이 없거나 숫자가 아니면 40을 써라"는 기본값.

#### A-4. 사내 간이 Trust Score `computeTrustScore` — `BacktestService.java:351-355`

```java
// BacktestService.java:351-355
private int computeTrustScore(Metrics m) {
    double mddAbs = Math.abs(m.mddPct);
    double raw = 70 - mddAbs * 0.7 + m.cagrPct * 0.4 + (m.winRate - 0.5) * 30;
    return Math.max(0, Math.min(100, (int) Math.round(raw)));
}
```
- 70점에서 출발해 **낙폭(MDD)이 클수록 깎고, 수익(CAGR)·승률이 높을수록 더함**. 0~100으로 클램프.
- ⚠️ 이건 **경험적 공식**입니다. 경로 B의 Python `/trust`(Walk-Forward + Regime + 파라미터 섭동으로 과적합까지 보는 정밀 채점)와는 깊이가 다릅니다. UI에 둘 다 "Trust Score"로 보일 수 있으니 출처를 구분하세요.

---

### B. `AnalyticsClient` — Python 사이드카 호출 (서킷브레이커 + 재시도)

이 클래스가 **백엔드(Java)↔Analytics 엔진(Python)** 의 유일한 다리입니다. 호출 대상 엔드포인트는 [`06_api/main.md`](../06_api/main.md) 에서 라인별로 해설됩니다.

#### B-1. 설정 주입 + CB/Retry 등록 — `AnalyticsClient.java:38-61`

```java
// AnalyticsClient.java:38-61 (발췌)
@Value("${app.analytics.base-url}")          private String baseUrl;
@Value("${app.analytics.internal-token}")    private String token;
@Value("${app.analytics.timeout-sec:30}")    private int timeoutSec;
@Value("${app.analytics.heavy-timeout-sec:120}") private int heavyTimeoutSec;
...
@PostConstruct
void init() {
    circuitBreaker = cbRegistry.circuitBreaker("analytics");
    retry = retryRegistry.retry("analytics");
}
```
- `baseUrl`/`token`은 `application.properties`에서 주입:
  - `app.analytics.base-url=${ANALYTICS_BASE_URL:http://localhost:8001}` — **환경변수 미설정 시 기본 localhost:8001**.
  - `app.analytics.internal-token=${ANALYTICS_INTERNAL_TOKEN:dev-internal-token-change-me}` — 기본값이 뻔하므로 **prod 필수 변경**(엔진 쪽 `require_internal_token`이 검사).
- `@PostConstruct init()` — 빈이 만들어진 직후, `application.properties`의 `instances.analytics.*` 설정(윈도우 10·실패율 50%·OPEN 30초·재시도 3회/2초)으로 등록된 CB·Retry를 이름("analytics")으로 꺼내옵니다.
- **일반 호출은 30초, 무거운 연산(Trust/Regime/Lean)은 120초** 타임아웃으로 분리.

#### B-2. 실제 1회 호출 `callOnce` — 4xx/5xx 분기 — `AnalyticsClient.java:80-118`

```java
// AnalyticsClient.java:85-107 (발췌)
HttpRequest.Builder b = HttpRequest.newBuilder()
        .uri(URI.create(baseUrl + path))
        .header("Content-Type", "application/json; charset=utf-8")
        .header("Accept", "application/json")
        .header("X-Internal-Token", token)            // ★ 사이드카 인증 헤더
        .timeout(Duration.ofSeconds(timeoutSeconds));
...
HttpResponse<String> resp = client().send(req, HttpResponse.BodyHandlers.ofString());
if (resp.statusCode() >= 400 && resp.statusCode() < 500) {
    // 4xx — 클라이언트 오류: 재시도 무의미, CB 카운트 제외
    throw new AnalyticsException.ClientError("analytics client error HTTP " + ...);
}
if (resp.statusCode() >= 500) {
    throw new AnalyticsException("analytics server error HTTP " + ...);
}
return om.readTree(resp.body());
```
- **핵심 설계 — 오류를 두 종류로 나눔**:
  - **4xx → `ClientError`**(별도 하위 예외): "내가 보낸 게 틀렸다". 재시도해도 똑같으니 **재시도·CB 카운트에서 제외**(`application.properties`의 `ignore-exceptions`에 등록).
  - **5xx → `AnalyticsException`**: "서버가 잠깐 맛이 갔다". 재시도 대상.
- `X-Internal-Token` 헤더가 바로 사이드카 인증. 엔진의 `require_internal_token`과 짝.
- **초보 포인트**: `om.readTree(...)`는 응답 JSON 문자열을 `JsonNode`(트리)로 파싱. 백엔드는 이 JsonNode를 그대로 프론트로 흘려보냅니다(아래 함정 절의 Jackson 이슈 주의).

#### B-3. CB+Retry 합성 + 폴백 `call` / `executeDecorated` — `AnalyticsClient.java:121-150`

```java
// AnalyticsClient.java:121-127
private JsonNode call(String path, String method, Object body) {
    Supplier<JsonNode> decorated = CircuitBreaker.decorateSupplier(
            circuitBreaker,
            Retry.decorateSupplier(retry, () -> callOnce(path, method, body))
    );
    return executeDecorated(decorated, method, path);
}
```
- **데코레이터 합성 순서**가 중요: `callOnce`를 **Retry로 먼저 감싸고**, 그걸 다시 **CircuitBreaker로 감쌉니다**. → 안쪽에서 3번 재시도가 모두 실패하면 그 "1번의 최종 실패"가 CB에 1건으로 집계됩니다.

```java
// AnalyticsClient.java:138-150
private JsonNode executeDecorated(Supplier<JsonNode> decorated, String method, String path) {
    try {
        return decorated.get();
    } catch (AnalyticsException.ClientError e) {
        throw e; // 클라이언트 오류는 그대로 전파
    } catch (CallNotPermittedException e) {
        log.warn("analytics circuit OPEN — fast fail for {} {}", method, path);
        throw new AnalyticsException("Analytics 서비스가 일시적으로 사용 불가합니다. 잠시 후 다시 시도해주세요.");
    } catch (Exception e) {
        if (e instanceof AnalyticsException ae) throw ae;
        throw new AnalyticsException("analytics call failed: " + e.getMessage(), e);
    }
}
```
- **`CallNotPermittedException`** = "회로가 OPEN 상태라 호출 자체가 거부됨". 이때 백엔드는 **타임아웃을 기다리지 않고 즉시** 친절한 한국어 메시지로 실패 → **빠른 폴백**. CLAUDE.md의 "`ANALYTICS_BASE_URL` 미설정 시 CB로 빠르게 폴백 — 시그널 없이 동작"이 바로 이 메커니즘.

#### B-4. heavy 호출은 재시도 없음 `callHeavy` — `AnalyticsClient.java:130-136`

```java
// AnalyticsClient.java:130-136
private JsonNode callHeavy(String path, String method, Object body) {
    Supplier<JsonNode> decorated = CircuitBreaker.decorateSupplier(
            circuitBreaker, () -> callOnceHeavy(path, method, body));   // Retry 없음
    return executeDecorated(decorated, method, path);
}
```
- Trust/Regime/Lean처럼 **연산이 수십 초~수 분** 걸리는 호출은 재시도가 역효과(부하 폭증). 그래서 CB만 두르고 **재시도는 뺍니다**. 타임아웃도 120초로 길게.

#### B-5. health 체크는 CB 우회 — `AnalyticsClient.java:152-160`

```java
// AnalyticsClient.java:153-159
public boolean isHealthy() {
    try {
        JsonNode n = callOnce("/health", "GET", null); // CB 우회
        return "ok".equals(n.path("status").asText());
    } catch (Exception e) { return false; }
}
```
- 의도적으로 `call`(CB 래핑)이 아니라 `callOnce`(생호출)를 씁니다. **회로가 OPEN이어도 "정말 살아났나?"를 직접 확인**하기 위함. 죽었으면 조용히 `false`.

#### B-6. 엔드포인트별 메서드 ↔ 엔진 매핑

| `AnalyticsClient` 메서드 | 호출 | 엔진(`main.py`) 핸들러 | 해설 문서 |
|---|---|---|---|
| `backtest(...)` `:163` | `call` | `POST /backtest` | [vbt_engine.md](../01_backtest/vbt_engine.md) |
| `todaySignals(...)` `:243` | `call` | `POST /signals/today` | [vbt_engine](../01_backtest/vbt_engine.md)+[xgb_signal](../03_models/xgb_signal.md) |
| `trainModel(...)` `:252` | `call` | `POST /models/train` | [xgb_signal.md](../03_models/xgb_signal.md) |
| `walkForward(...)` `:257` | `call` | `POST /robust/walk-forward` | [walkforward.md](../04_robust/walkforward.md) |
| `regime(...)` `:287` | `callHeavy` | `POST /regime` | [regime.md](../04_robust/regime.md) |
| `trustScore(...)` `:313` | `callHeavy` | `POST /trust` | [trust_score.md](../04_robust/trust_score.md) |
| `infiniteBuying(...)` `:333` | `call` | `POST /backtest/infinite-buying` | [infinite_buying.md](../01_backtest/infinite_buying.md) |
| `leanBacktest(...)` `:172` | `callHeavy` | `POST /lean/backtest` | [07_lean/runner.md](../07_lean/runner.md) |

- **주의**: `todaySignals`/`/signals/today`는 **AnalyticsClient에는 존재**하지만(경로 B), 실제 22:30 `DailySignalGenerator`는 이걸 호출하지 않고 **사내 `BacktestService`(경로 A)** 로 시그널을 만듭니다. `/signals/today`는 주로 `AnalyticsController`를 통해 프론트의 "Developer Studio"용으로 노출됩니다.
- ⚠️ `regime`은 옵션에서 키를 화이트리스트로 골라 넣습니다(`AnalyticsClient:293`) — Pydantic이 unknown 키를 거부하기 때문. `trustScore`도 동일(`:319`).

---

### C. `DailySignalGenerator` — 일일 잡: 백테스트 → 시그널 → 제안

#### C-1. 스케줄 진입점 `runDaily` — `DailySignalGenerator.java:53-99`

```java
// DailySignalGenerator.java:52-74 (발췌)
@Scheduled(cron = "0 30 22 * * MON-FRI", zone = "Asia/Seoul")
public void runDaily() {
    try { marketDataService.scheduledRefresh(); } catch (Exception e) { log.warn(...); }   // 1) 시세 신선화
    var actives = strategyRepo.findByActiveTrue();
    int ok = 0, fail = 0;
    for (var s : actives) {
        try { backtestService.runFor(s); ok++; }                                            // 2) 전체 백테스트
        catch (Exception e) { fail++; log.warn("[DailySignal] {} failed: {}", s.getCode(), e.getMessage()); }
    }
```
- **에러 격리**: 각 전략을 개별 try/catch로 감싸 **한 전략이 터져도 나머지는 계속**(견고한 배치). 엔진 `signals_today`의 "한 종목 실패해도 다음 종목 계속" 패턴과 같은 철학.
- **왜 22:30**: 주석(`:28-29`)에 "미국장 마감(KST 익일 새벽 6시)보다 앞서 발송 → 다음날 아침 사용자가 행동"이라고 명시.

```java
// DailySignalGenerator.java:76-98 (발췌)
    int sent = emailAlertService.dispatchPending(LocalDate.now());        // 3) 미발송 메일 일괄
    int created = createProposalsFor(LocalDate.now());                    // 4) BUY → OrderProposal
    int refreshed = refreshAlphaWorkspaces();                            // 5) Alpha 워크스페이스 재실행
```
- 3·4·5단계도 각각 try/catch로 감싸 **한 단계 실패가 다음 단계를 막지 않음**.

#### C-2. ★ BUY 시그널 → OrderProposal `createProposalsFor` — `DailySignalGenerator.java:128-201`

```java
// DailySignalGenerator.java:128-141 (발췌)
int createProposalsFor(LocalDate asOf) {
    var todays = signalRepo.findByAsOfDateFetchStrategyUser(asOf);   // strategy/user 즉시로딩
    for (DailySignal sig : todays) {
        if (sig.getSignal() != DailySignal.Signal.BUY) continue;      // BUY만 제안화
        var strategy = sig.getStrategy();
        Long userId = strategy.getUser().getId();
        boolean crypto = isCrypto(strategy.getTicker());
        BrokerAccount target = pickTradingAccount(userId, crypto);    // 거래가능 계정 선택
        if (target == null) continue;                                 // 없으면 스킵
```
- **BUY일 때만** 주문 제안을 만듭니다(HOLD/WATCH/PAUSE는 메일만).
- `findByAsOfDateFetchStrategyUser` — **fetch join으로 strategy·user를 즉시 로딩**. 주석(`:129`)대로 `open-in-view=false` 환경에서 트랜잭션 밖 lazy 접근(LazyInitializationException)을 방지하는 의도적 쿼리.

```java
// DailySignalGenerator.java:143-155 (발췌)
    int qtyInt;  java.math.BigDecimal qtyDec = null;
    if (crypto) {
        double price = cryptoPrice(target, strategy.getTicker());
        if (price <= 0) { ...스킵... }
        double orderUsdt = cryptoOrderUsdt(strategy);
        qtyDec = BigDecimal.valueOf(orderUsdt / price).setScale(8, RoundingMode.DOWN);
        if (qtyDec.signum() <= 0) { ...스킵... }
        qtyInt = 1; // NOT NULL placeholder (실수량은 qtyDecimal)
    } else {
        qtyInt = parseFirstBuyShares(strategy.getParamsJson());
    }
```
- **수량 산정 — 자산군 분기**: 주식은 정수 주식 수(`firstBuyShares`), 크립토는 **명목가(USDT)÷현재가 → 분수**(소수 8자리 내림). 크립토는 `qtyInt=1`을 placeholder로 채우고 실수량은 `qtyDecimal`에(엔티티가 `qty` NOT NULL이라).

```java
// DailySignalGenerator.java:157-178 (발췌)
    // 중복 체크: 같은 sourceSignalId로 살아있는 제안이 있으면 skip
    boolean dup = proposalRepo.findByUserIdOrderByCreatedAtDesc(userId).stream()
            .anyMatch(p -> sig.getId().equals(p.getSourceSignalId())
                    && !"REJECTED".equals(p.getStatus())
                    && !"EXPIRED".equals(p.getStatus())
                    && !"EXEC_FAILED".equals(p.getStatus()));
    if (dup) continue;
    OrderProposal saved = proposalRepo.save(OrderProposal.builder()
            .userId(userId).brokerAccountId(target.getId())
            .ticker(strategy.getTicker()).side("BUY")
            .qty(qtyInt).qtyDecimal(qtyDec)
            .source("SIGNAL").sourceSignalId(sig.getId())
            .status("PENDING").expiresAt(LocalDateTime.now().plusHours(24))
            .build());
```
- **멱등 — 시그널당 제안 1건**: 같은 `sourceSignalId`로 이미 **살아있는(REJECTED/EXPIRED/EXEC_FAILED가 아닌)** 제안이 있으면 새로 안 만듭니다. → 잡이 하루 여러 번 돌아도 중복 제안 방지.
- **항상 PENDING + 24시간 만료**: 자동으로 실주문 안 됨. `OrderProposalExpiryJob`이 만료 처리. (엔티티 `OrderProposal.java:12-23`의 보안 원칙과 정합.)

```java
// DailySignalGenerator.java:181-198 (발췌)
    if (Boolean.TRUE.equals(target.getAutoExecute())) {
        var res = exec.execute(saved, target, true);   // ProposalExecutionService
        if (!res.ok()) log.warn("[auto-exec] proposal {} 자동체결 보류: {}", saved.getId(), res.error());
        else log.info("[auto-exec] proposal {} 자동체결 접수 ...", ...);
    }
```
- 계정이 `autoExecute=ON`이면 사람 승인 없이 즉시 체결 시도. **단** 주석(`:182-183`)대로 모든 안전 게이트(kill-switch·tradingEnabled·한도)는 `ProposalExecutionService`가 강제하고, REAL 계정의 autoExecute는 **MOCK 졸업 게이트(2주+20회)** 를 이미 통과한 상태만 켤 수 있습니다.

#### C-3. 거래 계정 선택 `pickTradingAccount` — `DailySignalGenerator.java:204-213`

```java
// DailySignalGenerator.java:204-213
private BrokerAccount pickTradingAccount(Long userId, boolean crypto) {
    var want = crypto ? BrokerAccount.BrokerType.BINANCE : BrokerAccount.BrokerType.KIS;
    return brokerAccountRepo.findAllByUserIdOrderByEnvAsc(userId).stream()
            .filter(a -> Boolean.TRUE.equals(a.getTradingEnabled()))
            .filter(a -> a.getBrokerType() == want)
            .sorted((a, b) -> Boolean.compare(
                    b.getEnv() == BrokerAccount.Env.REAL, a.getEnv() == BrokerAccount.Env.REAL))
            .findFirst().orElse(null);
}
```
- **자산군→브로커 라우팅**: 크립토는 Binance, 주식은 KIS. `tradingEnabled=true`인 계정만, **REAL을 MOCK보다 우선**(정렬). 적합 계정이 없으면 `null`(→ 제안 스킵).

---

### D. `SubscriptionService` — 구독 등급·결제 멱등

> ⚠️ 이 파일의 일부 한글 주석은 인코딩이 깨져(mojibake) 보일 수 있습니다(예: `?ъ슜??`). 코드 동작은 정상이며, 아래 해설은 실제 코드 로직 기준입니다.

#### D-1. 현재 등급 조회 `currentTier` — `SubscriptionService.java:29-35`

```java
// SubscriptionService.java:29-35
@Transactional(readOnly = true)
public Subscription.Tier currentTier(Long userId) {
    return repo.findFirstByUserIdAndStatusOrderByExpiresAtDesc(userId, Subscription.Status.ACTIVE)
            .filter(s -> s.getExpiresAt() != null && s.getExpiresAt().isAfter(LocalDateTime.now()))
            .map(Subscription::getTier)
            .orElse(Subscription.Tier.FREE);
}
```
- **활성(ACTIVE)이고 아직 만료되지 않은** 구독이 있으면 그 Tier(=PRO), 아니면 FREE. 만료 시각을 **읽는 시점에 한 번 더 검사**(만료 잡이 아직 안 돌았어도 실시간으로 정확).

#### D-2. 표시 등급 파생 `deriveTierDisplay` — `SubscriptionService.java:52-57`

```java
// SubscriptionService.java:52-57
public static String deriveTierDisplay(Subscription sub) {
    if (sub == null) return "FREE";
    long amt = sub.getAmountKrw() != null ? sub.getAmountKrw() : 0L;
    if (amt >= 19900L) return "PREMIUM";
    return "STANDARD";
}
```
- 사전지식 4번의 핵심: DB Tier는 PRO 단일이지만, **결제 금액으로 STANDARD/PREMIUM을 런타임 파생**. 19,900원 이상이면 PREMIUM.

#### D-3. ★ Pro 활성화 (멱등) `activatePro` — `SubscriptionService.java:67-93`

```java
// SubscriptionService.java:67-93 (발췌)
@Transactional
public Subscription activatePro(Long userId, String paymentKey, String orderId, long amountKrw) {
    Subscription dup = findByPaymentKey(paymentKey);                       // M8 사전 멱등 체크
    if (dup != null) { log.info("Pro activate 멱등 처리 ..."); return dup; }
    LocalDateTime now = LocalDateTime.now();
    Subscription sub = Subscription.builder()
            .userId(userId).tier(Subscription.Tier.PRO).status(Subscription.Status.ACTIVE)
            .startedAt(now).expiresAt(now.plusDays(30))                    // 30일
            .tossPaymentKey(paymentKey).tossOrderId(orderId).amountKrw(amountKrw)
            .build();
    Subscription saved = repo.save(sub);
    userRepository.findById(userId).ifPresent(u -> {
        u.setUserType(amountKrw >= 19900L ? User.UserType.PREMIUM : User.UserType.STANDARD);  // User 등급 동기화
        userRepository.save(u);
    });
    return saved;
}
```
- **멱등 1차 방어**: 같은 결제키로 이미 구독이 있으면 **새로 INSERT하지 않고 기존 것 반환**(이중 등급 부여 방지).
- 구독 기간 **30일**. 동시에 `User.UserType`도 금액에 맞춰 갱신(STANDARD/PREMIUM) — 구독과 사용자 등급을 함께 동기화.

#### D-4. 만료 일괄 처리 `expireAllDue` — `SubscriptionService.java:96-109`

```java
// SubscriptionService.java:96-109
@Scheduled(cron = "0 0 * * * *")   // 매시 정각
@Transactional
public int expireAllDue() {
    var due = repo.findByStatusAndExpiresAtBefore(Subscription.Status.ACTIVE, LocalDateTime.now());
    for (var s : due) {
        s.setStatus(Subscription.Status.EXPIRED);
        userRepository.findById(s.getUserId()).ifPresent(u -> {
            u.setUserType(User.UserType.FREE); userRepository.save(u);   // FREE 강등
        });
    }
    return due.size();
}
```
- **매시 정각** 만료된 활성 구독을 EXPIRED로 바꾸고 사용자를 FREE로 강등. (단 `currentTier`가 읽는 시점에도 만료를 검사하므로, 이 잡이 늦어도 사용자에게는 정확히 보임 — 이중 안전.)

---

### E. `SubscriptionController` — 결제 confirm + 금액 위변조 차단

#### E-1. 허용 금액 화이트리스트 — `SubscriptionController.java:29-32`

```java
// SubscriptionController.java:29-32
private static final java.util.Map<Long, String> VALID_PLANS = java.util.Map.of(
        9900L,  "STANDARD",
        19900L, "PREMIUM"
);
```
- **금액 위변조 방지의 핵심**: 프론트가 보낸 금액이 이 Map에 없으면 거부. 사용자가 결제 금액을 1원으로 조작해 PREMIUM을 받는 공격을 차단.

#### E-2. ★ confirm — 3중 멱등 방어 — `SubscriptionController.java:62-111`

```java
// SubscriptionController.java:67-84 (발췌)
String paymentKey = String.valueOf(body.get("paymentKey"));
long   amount     = ((Number) body.getOrDefault("amount", 0)).longValue();
if (!VALID_PLANS.containsKey(amount)) { ...badRequest("허용되지 않은 결제 금액")... }   // ① 금액 검증
if (paymentKey == null || paymentKey.isBlank() || "null".equals(paymentKey)) { ...badRequest... }
// M8 멱등성 ①: 이미 처리된 결제키면 Toss 재confirm 없이 기존 구독 반환
Subscription already = subscriptionService.findByPaymentKey(paymentKey);
if (already != null) { return ResponseEntity.ok(idempotentBody(already, true)); }
```

```java
// SubscriptionController.java:86-106 (발췌)
try {
    JsonNode result = toss.confirm(paymentKey, orderId, amount);                  // ② Toss 서버 confirm
    if (!"DONE".equalsIgnoreCase(result.path("status").asText())) { ...badRequest... }
    Subscription sub = subscriptionService.activatePro(uid, paymentKey, orderId, amount);
    return ResponseEntity.ok(Map.of("tier", VALID_PLANS.get(amount), ...));
} catch (DataIntegrityViolationException dup) {
    // 동시 confirm 경합 — DB 유니크(uq_subscription_toss_payment_key)에 막힘 → 먼저 처리된 구독 재사용
    Subscription existing = subscriptionService.findByPaymentKey(paymentKey);
    if (existing != null) { return ResponseEntity.ok(idempotentBody(existing, true)); }
    ...
}
```
- **3중 멱등 방어**(M8):
  1. **애플리케이션 사전체크**(`findByPaymentKey != null`) — 흔한 더블클릭/새로고침.
  2. **서비스 레이어 재확인**(`activatePro` 안의 `dup` 체크).
  3. **DB 유니크 제약**(`uq_subscription_toss_payment_key`) — **동시(race) 두 요청**이 사전체크를 동시에 통과해도, 두 번째 INSERT가 `DataIntegrityViolationException`으로 막히고, catch에서 먼저 만들어진 구독을 재사용.
- → "사전체크는 흔한 경우를, DB 제약은 동시성 경합을 잡는다"는 견고한 멱등 설계. (엔티티 `Subscription.java:14-17`의 유니크 제약과 정합.)

---

### F. `StrategyController` — 전략 CRUD + 소유권 격리

#### F-1. 소유권 격리 패턴 (모든 엔드포인트 공통) — 예: `detail` `StrategyController.java:74-82`

```java
// StrategyController.java:74-82
@GetMapping("/{id}")
public ResponseEntity<?> detail(@PathVariable Long id) {
    Long uid = AuthContext.currentUserId();
    if (uid == null) return unauthorized();
    return strategyRepository.findById(id)
            .filter(s -> s.getUser().getId().equals(uid))     // ★ 소유권 검증
            .<ResponseEntity<?>>map(s -> ResponseEntity.ok(StrategyDto.from(s)))
            .orElse(ResponseEntity.notFound().build());
}
```
- **IDOR 차단**: id로 조회한 뒤 `s.getUser().getId().equals(uid)`로 **"이 전략이 정말 내 것인가"** 를 검사. 남의 전략이면 `404`(존재 자체를 숨김). 이 패턴이 detail/trades/states/signals/summary/update/delete/backtest **전부에** 반복됩니다.

#### F-2. 생성 검증 `create` — `StrategyController.java:157-186`

```java
// StrategyController.java:160-168 (발췌)
if (req.code() == null || req.code().isBlank()) return badRequest("code 필수");
if (req.ticker() == null || req.ticker().isBlank()) return badRequest("ticker 필수");
if (req.method() == null) return badRequest("method 필수");
if (req.principalKrw() == null || req.principalKrw() <= 0) return badRequest("principalKrw 양수 필수");
if (strategyRepository.existsByUserIdAndCode(uid, req.code())) {
    return ResponseEntity.status(HttpStatus.CONFLICT).body(Map.of("error", "이미 존재하는 code"));
}
```
- 필수값 + **사용자별 code 유니크**(409 Conflict). `principalKrw > 0`을 강제해 "원금 분리" 규칙(엔티티 `Strategy.java:57`)을 입력 단에서 보장.

#### F-3. 수정 시 불변 필드 `update` — `StrategyController.java:188-205`

```java
// StrategyController.java:203
    // ticker/code/method는 운영 중 변경 위험 → 변경 금지
```
- name/regime/goal/paramsJson/principal/startDate/benchmark/active만 수정 가능. **ticker·code·method는 일부러 갱신 안 함** — 운영 중 종목·전략방식을 바꾸면 기존 trades/state와 불일치가 생기기 때문.

#### F-4. 백테스트 수동 트리거 `runBacktest` — `StrategyController.java:312-328`

```java
// StrategyController.java:312-327 (발췌)
@PostMapping("/{id}/backtest")
public ResponseEntity<?> runBacktest(@PathVariable Long id) {
    ... 소유권 검증 ...
    try {
        var summary = backtestService.runFor(s);
        if (summary == null) return ResponseEntity.status(HttpStatus.UNPROCESSABLE_ENTITY)
                .body(Map.of("error", "insufficient market data"));      // 30개 미만 → 422
        return ResponseEntity.ok(StrategyBacktestSummaryDto.from(summary));
    } catch (Exception e) {
        return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(...);
    }
}
```
- `BacktestService.runFor`의 `null`(데이터 부족)을 **422**로, 예외를 **500**으로 변환. CLAUDE.md API 표의 `POST /api/strategies/{id}/backtest`가 이 메서드.

---

### G. `AnalyticsController` — Python 브리지의 얇은 노출

```java
// AnalyticsController.java:39-50 (발췌)
@PostMapping("/backtest")
public ResponseEntity<JsonNode> backtest(@RequestBody Map<String, Object> body) {
    String ticker = (String) body.get("ticker");
    if (ticker == null || ticker.isBlank()) return ResponseEntity.badRequest().build();
    String strategy = (String) body.getOrDefault("strategy", "sma_cross");
    Map<String, Object> extra = new HashMap<>(body);
    extra.remove("ticker"); extra.remove("strategy");
    return ResponseEntity.ok(analytics.backtest(ticker, strategy, extra));   // → 경로 B
}
```
- **얇은 위임(thin pass-through)**: 입력만 살짝 정리해 `AnalyticsClient`(경로 B)로 넘기고, 반환된 `JsonNode`를 그대로 프론트에. 계산은 전부 Python:8001에서.
- `/api/analytics/**`는 Spring Security가 JWT를 요구하고, 그 안에서 `AnalyticsClient`가 다시 `X-Internal-Token`으로 사이드카 인증 → **이중 인증 게이트**.

---

## ⚠️ 함정·보안 주의

### 1. (M8) 결제 멱등성 — 3중 방어가 필요한 이유
- 사전체크(`findByPaymentKey`)만으로는 **동시 요청**을 못 막습니다(두 요청이 동시에 "없음"을 읽고 둘 다 INSERT). 그래서 **DB 유니크 제약 `uq_subscription_toss_payment_key`** 이 최종 방어선이고, 컨트롤러가 `DataIntegrityViolationException`을 잡아 멱등 응답으로 바꿉니다(`SubscriptionController.java:98-104`). 셋 중 하나라도 빠지면 이중 구독/과금 위험.

### 2. Jackson `JsonNode` 직렬화 (Spring Boot 4 = Jackson 3 기본)
- `AnalyticsClient`는 내부적으로 **Jackson 2의 `com.fasterxml.jackson.databind.JsonNode`** 로 응답을 파싱하고, `AnalyticsController`가 이 `JsonNode`를 그대로 반환합니다.
- ⚠️ 메모리 기록(`project_springboot4_jackson_jsonnode_bug.md`)대로 **Spring Boot 4는 Jackson 3가 기본**이라, 핸들러가 Jackson 2 `JsonNode`를 반환하면 **모든 키가 빈 bean 속성으로 깨져 직렬화**될 수 있습니다. analytics 응답이 프론트에서 `{}`처럼 비어 보이면 이 원인을 의심하세요(해결: 응답을 문자열/`Map`로 변환하거나 Jackson 3 `JsonNode` 사용).

### 3. `ANALYTICS_BASE_URL` 미설정 → CB 빠른 폴백
- 환경변수 미설정이면 `base-url`이 `http://localhost:8001`로 기본 동작합니다(`application.properties:101`). Python이 안 떠 있으면 `ConnectException` → 재시도 3회 실패 → **서킷 OPEN → 이후 30초간 즉시 실패**. 백엔드는 안 죽지만 **경로 B 기능(정밀 백테스트·Trust·Regime)이 비활성**. 단 **경로 A(무한매수/VR 백테스트·일일 시그널)는 Python과 무관하게 계속 동작**합니다.

### 4. `internal-token` 기본값이 뻔함
- `dev-internal-token-change-me`가 기본값(`application.properties:102`). prod에서 `ANALYTICS_INTERNAL_TOKEN`을 안 바꾸면 누구나 :8001을 직접 호출 가능. **prod 필수 변경**.

### 5. `USD_KRW = 1300.0` 하드코딩
- `BacktestService.java:48`의 환율이 상수입니다(TODO: 실시간 API). 백테스트의 원금 환산·KRW 평가액이 실제 환율과 어긋날 수 있음. 시그널의 USDT 명목가 계산(`DailySignalGenerator:226`)도 1300 고정.

### 6. 사내 TrustScore vs Python TrustScore 혼동
- `BacktestService.computeTrustScore`(간이 경험식)와 `/trust`(Walk-Forward+Regime 정밀)는 **다른 점수**입니다. UI에서 둘 다 "Trust Score"로 보일 수 있으니 출처를 명확히.

### 7. OrderProposal은 항상 PENDING으로 시작
- 자동 시그널이 제안을 만들어도 **승인 전 실주문 금지**(엔티티 `OrderProposal.java:18-22`). `autoExecute` 계정만 예외이며, 그조차 kill-switch·졸업게이트 등 `ProposalExecutionService`의 게이트를 통과해야 함.

### 8. `BacktestService`의 와일드카드 import
- `BacktestService.java:4-19`가 거의 모든 도메인 엔티티/레포지토리를 `*`로 import합니다. 실제로 쓰는 건 strategy 도메인뿐 — 컴파일엔 무해하지만 가독성·결합도 측면의 정리 대상(고도화).

---

## 🚀 고도화 아이디어

- **실시간 환율**: `USD_KRW` 상수를 환율 API(또는 캐시된 `MarketDataService`)로 교체 → 백테스트·시그널 명목가 정확도 향상. 한 줄 상수가 여러 계산에 퍼져 있어 좋은 리팩터 실습.
- **경로 A↔B 통합 시그널**: 현재 일일 시그널은 사내 Java(경로 A)로만 생성. `AnalyticsClient.todaySignals`(XGBoost 확률+SHAP)를 합쳐 "규칙 시그널 + ML 확률"을 한 `DailySignal`에 담으면 설명력 강화. 엔진 `/signals/today`([main.md](../06_api/main.md) I절)가 이미 3엔진 합성을 지원.
- **CB 폴백 캐시**: 회로 OPEN 시 마지막 성공 응답을 캐시해 "오래된 값이라도" 보여주기(stale-while-revalidate). 지금은 즉시 실패만.
- **타이밍 안전 토큰 비교**: 내부 토큰 비교를 `MessageDigest.isEqual`(상수시간)로 — 엔진 쪽 `hmac.compare_digest` 권장과 대칭.
- **구독 Tier 정규화**: STANDARD/PREMIUM을 금액 파생이 아니라 DB enum/컬럼으로 승격하면 가격 변경 시 과거 구독 표시가 안정. CLAUDE.md의 EXPERT 플랜 확장도 수월.
- **백테스트 비동기화**: `backtest-all`이 동기 루프라 전략이 많으면 응답 지연. 잡 큐(또는 `@Async`)로 분리하고 진행률을 폴링(Lean `backtest/start`+`status` 패턴 참고).
- **`StrategyBacktestSummary`에 벤치마크 대비 알파**: 현재 절대 성과만. `benchmark` 종목 대비 초과수익을 더하면 "그냥 지수보다 나은가?" 평가 가능(엔진 `compute_metrics`의 SPY 벤치마크 패턴 차용).

---

## 📚 용어 사전 (이 파트 한정)

| 용어 | 뜻 |
|---|---|
| **경로 A / 경로 B** | A=사내 Java 백테스트(무한매수/VR, `BacktestService`), B=Python 위탁(vectorbt/XGBoost, `AnalyticsClient`) |
| **사이드카(Sidecar)** | 본체 옆에 붙어 특정 작업을 전담하는 보조 프로세스(여기선 Analytics :8001) |
| **서킷 브레이커(CircuitBreaker)** | 실패율이 임계치 넘으면 호출을 차단(OPEN)해 장애 전파를 막는 두꺼비집. CLOSED→OPEN→HALF_OPEN |
| **Retry** | 일시적 실패에 한해 같은 호출을 N회 재시도(4xx는 제외) |
| **`CallNotPermittedException`** | 회로가 OPEN이라 호출 자체가 거부됨 → 즉시 폴백 |
| **`X-Internal-Token`** | 백엔드가 사이드카에 "정식 백엔드"임을 증명하는 내부 인증 헤더 |
| **멱등성(Idempotency)** | 같은 요청을 여러 번 보내도 결과가 한 번과 동일(결제 중복 방지) |
| **upsert** | 있으면 갱신, 없으면 삽입 — `findBy…().orElseGet(build)` 패턴 |
| **소유권 격리/IDOR** | "이 리소스가 정말 내 것인가"를 검사해 남의 데이터 접근 차단 |
| **OrderProposal** | 시그널/수동에서 나온 주문 제안. PENDING으로 시작, 승인 전 실주문 금지 |
| **LOC (Limit On Close)** | 종가 기준 지정가 매수. 무한매수법의 핵심 주문 유형 |
| **VR (Value Rebalancing)** | V값 밴드를 벗어나면 매수/매도해 목표 평가액으로 되돌리는 전략 |
| **Tier vs UserType** | DB 구독은 FREE/PRO 단일, 표시(STANDARD/PREMIUM)는 결제 금액으로 파생 |
| **`@Scheduled(cron)`** | 정해진 시각에 자동 실행되는 잡(22:30 시그널, 매시 만료, 07:00 시세) |
| **fetch join** | lazy 연관을 쿼리에서 즉시 로딩해 트랜잭션 밖 LazyInitializationException 방지 |
</content>
</invoke>
