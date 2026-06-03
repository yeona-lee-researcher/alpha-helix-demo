# `strategy/service/broker` — 브로커·주문 실행 (완전 라인별 해설)

> 원본: `backend/src/main/java/com/DevBridge/devbridge/domain/strategy/`
> 범위: `service/broker/` (Broker·BrokerRouter·KIS/Binance 어댑터·ApiClient·ProposalExecutionService·OrderFillService·TradingControlService·PromotionGateService) + `controller/` (BrokerAccount·BrokerOrder·OrderProposal) + `entity/` (BrokerAccount·OrderProposal)
> 전제: Spring 기본 문법(`@Service`·`@RestController`·`@Transactional`·의존성 주입·JPA)은 [`00_spring_primer.md`](00_spring_primer.md)에서 다룹니다. 여기서는 **도메인 로직**에만 집중합니다.

---

## 📌 이 파트 한눈에

이 파트는 **"여러 증권사에 주문을 넣는 단일 창구"** 입니다. 우리 시스템은 두 군데에 진짜 돈을 보낼 수 있습니다 — **KIS(한국투자증권, 미국주식)** 와 **Binance(바이낸스, 크립토 현물)**. 두 곳은 API 생김새가 완전히 다른데(한쪽은 KIS 게이트웨이 + TR-ID, 다른 쪽은 HMAC 서명 + 쿼리스트링), 이 파트는 그 차이를 **하나의 `Broker` 계약**으로 감싸서 윗단 코드가 "어느 증권사인지" 신경 쓰지 않게 만듭니다.

> 비유: 해외 송금 창구. 고객(주문 제안)은 "이 돈을 이 사람에게 보내줘"라고만 말합니다. 창구 직원(`ProposalExecutionService`)은 **먼저 신분·한도·블랙리스트를 전부 확인**하고(안전 게이트), 통과하면 환전소(`BrokerRouter`)에 넘깁니다. 환전소는 목적지가 미국이면 KIS 데스크로, 코인이면 Binance 데스크로 보냅니다. 각 데스크(어댑터)는 그 나라 양식으로 서류를 바꿔 실제로 송금합니다.

핵심 클래스 역할표:

| 클래스 | 한 줄 역할 | 비유 |
|---|---|---|
| `Broker` (interface) | 모든 증권사가 지켜야 할 **공통 계약**(주문/체결/잔고/시세 4개 메서드) | 송금 표준 양식 |
| `BrokerRouter` | `brokerType`(KIS/BINANCE)으로 **알맞은 구현 선택** | 목적지별 데스크 안내 |
| `KisBrokerAdapter` | `Broker` 계약 ↔ `KisApiClient` 변환 (정수화·rt_cd 해석) | 미국 데스크 |
| `BinanceBrokerAdapter` | `Broker` 계약 ↔ `BinanceApiClient` 변환 (필터 절삭·FUTURES 차단) | 코인 데스크 |
| `KisApiClient` | KIS OpenAPI 실제 호출(토큰·주문·잔고·시세). **수정 금지 원본** | 미국 송금망 단말 |
| `BinanceApiClient` | Binance REST 실제 호출(HMAC 서명·주문·잔고). **수정 금지 원본** | 코인 송금망 단말 |
| `ProposalExecutionService` | **모든 주문이 반드시 지나는 단일 경로 + 안전 게이트 전부** | 창구 심사 데스크 |
| `OrderFillService` | 접수된 주문의 **실제 체결 상태**를 나중에 확인 | 송금 도착 확인 |
| `TradingControlService` | **전역 kill-switch**(재시작 없이 전 주문 차단) | 비상 정지 버튼 |
| `PromotionGateService` | MOCK → REAL **승격 게이트**(모의로 충분히 검증했나) | 실거래 면허 시험 |

**누가 이 파트를 호출하나?** → ① 사용자가 화면에서 "승인" 버튼을 누르면 `OrderProposalController.approve` → `ProposalExecutionService.execute`. ② 사용자가 직접 주문 폼을 넣으면 `BrokerOrderController.place`. ③ 시그널 엔진(`DailySignalGenerator`)이 만든 자동 제안도 같은 `ProposalExecutionService.execute`로 모입니다. **즉 모든 길은 한 데스크로 모입니다.**

---

## 🧠 사전 지식 (이거 모르면 막힘)

#### 1) 브로커(Broker) = "주문을 받아 실제 시장에 넣어주는 증권사"
- 우리가 "SPY 1주 사줘"라고 해도, 진짜 주식시장에 주문을 넣는 건 증권사입니다. KIS·Binance가 그 증권사 역할.
- 각 브로커는 **API 키**(신분증)로 우리를 인증합니다. KIS는 `appkey`+`appsecret`, Binance는 `apiKey`+`apiSecret`.

#### 2) OrderProposal(주문 제안) = "아직 실행 안 된 주문 초안"
- 시그널 엔진이나 사용자가 "이거 사면 어때?"라고 만든 **초안**입니다. **만든다고 바로 돈이 나가지 않습니다.**
- 생명주기: `PENDING`(대기) → `APPROVED`(승인) → `EXECUTED`(접수됨) 또는 `EXEC_FAILED`(실패) / `REJECTED`(거절) / `EXPIRED`(만료).
- 핵심 보안 원칙: **시그널은 PENDING까지만 자동 생성**, `EXECUTED`로 가려면 안전 게이트를 전부 통과해야 함.

#### 3) MOCK vs REAL = "모의투자 vs 진짜 돈"
- `MOCK` = KIS 모의투자 / Binance 테스트넷. 가짜 돈, 연습용. 자유롭게 켜고 끔.
- `REAL` = KIS 실전 / Binance 메인넷. **진짜 돈이 나감.** 그래서 켜기 전에 졸업 시험(승격 게이트)을 통과해야 함.
- 같은 `env` 이름이 두 브로커에서 의미가 다릅니다 — KIS는 도메인(URL)이 갈리고, Binance는 호스트가 갈림.

#### 4) kill-switch(전역 거래 차단 스위치)
- "지금 당장 모든 주문을 막아라" 버튼. 운영 중 뭔가 잘못됐을 때 **재시작 없이** 모든 주문을 즉시 거부.
- 환경변수 `TRADING_KILL_SWITCH=true`가 기본값이고, `TradingControlService`가 런타임에 덮어쓸 수 있음.

#### 5) 어댑터 패턴(Adapter Pattern)
- "모양이 다른 두 물건을 같은 콘센트에 꽂게 해주는 변환 플러그".
- `KisApiClient`/`BinanceApiClient`는 각자 생긴 대로 두고(원본 수정 금지), 그 위에 **얇은 어댑터**를 씌워 둘 다 `Broker` 인터페이스 모양으로 보이게 합니다. 윗단은 `Broker`만 알면 됩니다.

#### 6) HMAC 서명 / 승인 TTL
- **HMAC**: 비밀키로 만든 "위조 불가 도장". Binance는 모든 사적 요청에 `HMAC-SHA256(쿼리, secret)` 서명을 붙여 "이 요청이 진짜 키 주인이 보냈음"을 증명합니다(secret 자체는 네트워크로 안 보냄).
- **TTL(만료)**: OrderProposal은 보통 생성 +24시간 후 만료(`expiresAt`). `OrderProposalExpiryJob`이 5분마다 지난 것을 `EXPIRED`로 정리해, **오래된 초안이 실수로 실행되는 것**을 막습니다.

---

## 🗺 요청 흐름도

```
 ① 자동 시그널                       ② 수동 승인                  ③ 직접 주문
 DailySignalGenerator          사용자 "승인" 클릭            사용자 주문 폼
      │ PENDING 생성                  │                           │
      ▼                              ▼                           ▼
  OrderProposal(PENDING) ──► OrderProposalController.approve   BrokerOrderController.place
                                     │                           │ (한도/검증 가드 직접 수행)
                                     ▼                           │
              ┌──────────────────────────────────────┐          │
              │   ProposalExecutionService.execute    │◄─ 단일 경로 ─┐ │
              │   ─ 안전 게이트 6중 ─                   │          │ │
              │   1. kill-switch                       │          │ │
              │   2. PENDING·만료 검증                  │          │ │  (place 는 자체 가드 후
              │   3. tradingEnabled 마스터 스위치       │          │ │   직접 BrokerRouter 호출)
              │   4. 1건당·일일 USD 한도                │          │ │
              │   5. KIS KRW 매수/매도 한도            │          │ │
              │   6. 손실 서킷브레이커                  │          │ │
              └──────────────────┬───────────────────┘          │ │
                                 │ 통과                          │ │
                                 ▼                               ▼ ▼
                         ┌───────────────┐
                         │  BrokerRouter │  brokerType 으로 분기
                         └───────┬───────┘
                       KIS │             │ BINANCE
                           ▼             ▼
                  KisBrokerAdapter   BinanceBrokerAdapter
                  · 수량 정수화        · LOT_SIZE/NOTIONAL 절삭
                  · 0원 지정가 방지     · FUTURES 차단
                  · rt_cd → 결과       · kill-switch 재확인
                           │             │
                           ▼             ▼
                   KisApiClient      BinanceApiClient
                   · 토큰 캐시(23h)    · HMAC-SHA256 서명
                   · 브라우저 UA       · X-MBX-APIKEY 헤더
                   · 거래소 폴백        · 429/418 백오프
                           │             │
                           ▼             ▼
                      🇺🇸 KIS 실주문    🪙 Binance 실주문
                           │             │
                           └──────┬──────┘
                                  ▼  status=EXECUTED, kisOrderNo 저장
                       (나중에 주기적으로)
                       OrderFillPollingJob → OrderFillService.pollFill
                                  │ broker.queryFill()
                                  ▼
                       fillStatus = FILLED/PARTIAL/OPEN/CANCELLED
                       + 잔고 스냅샷 동기화(lastBalanceJson)
```

핵심: **②와 ③은 다른 입구지만, ②는 반드시 `ProposalExecutionService`를 거치고 ③(`place`)은 같은 한도 정책 메서드를 재사용**합니다. 두 경로의 정책이 어긋나지 않도록 일부러 코드를 공유합니다(뒤의 함정 섹션 참고).

---

## 📖 핵심 클래스 라인별 심화

### A. `Broker` — 모든 증권사의 공통 계약 (`Broker.java:20-61`)

```java
// Broker.java:20-24
public interface Broker {
    BrokerAccount.BrokerType type();
    enum Side { BUY, SELL }
```
- **무엇을 하나**: "주문을 받는 증권사라면 반드시 이 메서드들을 구현하라"는 약속(인터페이스). `type()`은 자기가 KIS인지 BINANCE인지 알려줍니다 — `BrokerRouter`가 이걸로 등록합니다.
- **왜 이렇게 하나**: 윗단 코드(`ProposalExecutionService` 등)가 `if (KIS) ... else if (BINANCE) ...` 분기를 곳곳에 두면 새 브로커 추가 때마다 지옥. 대신 **"계약"만 알면** 구현이 무엇이든 똑같이 다룹니다(다형성).

```java
// Broker.java:26-44
record OrderResult(boolean ok, String orderNo, String code, String message) {
    public static OrderResult success(String orderNo, String code) { ... }
    public static OrderResult failure(String code, String message) { ... }
}
record FillResult(String fillStatus, BigDecimal filledQty, BigDecimal avgPrice, String error) { ... }
```
- **무엇을 하나**: 주문 결과(`OrderResult`)와 체결 조회 결과(`FillResult`)를 **정규화된 한 가지 모양**으로 정의. KIS의 `rt_cd`든 Binance의 `status`든, 어댑터가 이 모양으로 번역해 돌려줍니다.
- **초보 포인트**: `record`는 "값만 담는 불변 상자"를 짧게 만드는 자바 문법. `success(...)`/`failure(...)`는 **정적 팩토리** — `new OrderResult(true, ..., null)` 대신 의미가 또렷한 `OrderResult.success(...)`로 만들게 해줍니다.

```java
// Broker.java:46-60
OrderResult placeOrder(BrokerAccount account, String symbol, Side side, BigDecimal qty, BigDecimal limitPrice);
FillResult queryFill(BrokerAccount account, OrderProposal proposal);
Map<String, Object> getBalance(BrokerAccount account);
Map<String, Object> getQuote(BrokerAccount account, String symbol);
```
- 4개 메서드 = 증권사가 할 수 있는 일 전부: **주문 전송 / 체결 조회 / 잔고 / 현재가**.
- 주석(`Broker.java:46`)의 핵심 한 줄: *"호출측이 모든 안전 게이트(kill-switch/한도/검증)를 먼저 통과시켜야 한다."* → **인터페이스 자체는 안전장치를 모름.** 안전은 `ProposalExecutionService`의 책임. (어댑터에서 kill-switch를 한 번 더 보는 것은 이중 방어일 뿐.)
- `limitPrice == null`이면 시장가라는 약속(`Broker.java:18`)도 여기서 정의됩니다.

---

### B. `BrokerRouter` — 단일 분기점 (`BrokerRouter.java:16-34`)

```java
// BrokerRouter.java:18-23
private final Map<BrokerAccount.BrokerType, Broker> registry =
        new EnumMap<>(BrokerAccount.BrokerType.class);

public BrokerRouter(List<Broker> brokers) {
    for (Broker b : brokers) registry.put(b.type(), b);
}
```
- **무엇을 하나**: 스프링이 등록된 모든 `Broker` 빈(KIS·Binance 어댑터)을 **생성자에 리스트로 주입**합니다. 라우터는 각자의 `type()`을 키로 `EnumMap`에 꽂아 "타입 → 구현" 색인을 만듭니다.
- **왜 이렇게 하나**: 새 브로커(`Broker` 구현 + `@Component`)를 추가하면 **이 클래스를 손대지 않아도** 자동 등록됩니다. 확장에 열려 있고 수정에 닫힌 구조.

```java
// BrokerRouter.java:25-33
public Broker forAccount(BrokerAccount account) {
    return forType(account == null ? null : account.getBrokerType());
}
public Broker forType(BrokerAccount.BrokerType type) {
    Broker b = registry.get(type == null ? BrokerAccount.BrokerType.KIS : type);
    if (b == null) throw new IllegalStateException("지원하지 않는 브로커: " + type);
    return b;
}
```
- 계정을 주면 그 계정의 `brokerType`에 맞는 구현을 돌려줍니다. **`null`이면 KIS로 폴백** — 옛 데이터(brokerType 컬럼이 없던 시절)와의 하위호환.
- 모르는 타입이면 즉시 예외 → "조용히 엉뚱한 곳에 주문 넣기"보다 명확한 실패가 낫습니다.

---

### C. `ProposalExecutionService.execute` — 안전 게이트의 심장 (`ProposalExecutionService.java:54-139`)

이 메서드가 **이 파트에서 가장 중요**합니다. 모든 주문(자동/수동)이 여기를 통과하므로, 안전 게이트가 한 곳에 모여 누락이 없습니다.

```java
// ProposalExecutionService.java:54-59
@Transactional
public Result execute(OrderProposal p, BrokerAccount ba, boolean auto) {
    if (tradingControl.isKillSwitchOn()) {
        log.warn("[exec] kill-switch ON — 주문 거부 proposal={}", p.getId());
        return new Result(false, "전역 거래 차단(kill-switch) 활성화 — 모든 주문 거부", p);
    }
```
- **게이트 ①: kill-switch.** 가장 먼저 본다. 켜져 있으면 그 무엇도 통과 못 함. `auto` 인자는 "자동 체결 여부" — 나중에 `autoExecuted` 플래그로 기록(승격 게이트 집계에 쓰임).

```java
// ProposalExecutionService.java:60-71
if (!"PENDING".equals(p.getStatus())) {
    return new Result(false, "PENDING 상태가 아님 (현재=" + p.getStatus() + ")", p);
}
if (p.getExpiresAt() != null && p.getExpiresAt().isBefore(LocalDateTime.now())) {
    p.setStatus("EXPIRED");
    proposalRepo.save(p);
    return new Result(false, "이미 만료됨", p);
}
if (ba == null) return new Result(false, "BrokerAccount 없음", p);
if (!Boolean.TRUE.equals(ba.getTradingEnabled())) {
    return new Result(false, "BrokerAccount.tradingEnabled=false — 자동매매 마스터 스위치 OFF", p);
}
```
- **게이트 ②: 상태·만료.** 이미 처리됐거나(EXECUTED/REJECTED) 만료된 제안은 재실행 불가. 만료를 발견하면 그 자리에서 `EXPIRED`로 굳혀 정합성 유지.
- **게이트 ③: 마스터 스위치.** `tradingEnabled=false`면 끝. 사용자가 직접 끌 수 있는 "이 계좌의 매매 켜짐/꺼짐" 큰 스위치(`BrokerAccount.java:108-111`).
- **초보 포인트**: `Boolean.TRUE.equals(x)`는 `x`가 `null`이어도 안전하게 false를 반환합니다. `x == true`(언박싱)는 `null`이면 NPE.

```java
// ProposalExecutionService.java:73-89
Broker broker = brokerRouter.forAccount(ba);
BigDecimal qtyEff = effectiveQty(p);

// 1건당 한도 (시장가는 현재가로 추정 — 시장가 한도우회 방지)
double estUsd = estimateUsd(broker, ba, p, qtyEff);
if (ba.getMaxOrderUsd() != null && ba.getMaxOrderUsd() > 0 && estUsd > ba.getMaxOrderUsd()) {
    return new Result(false, "1건당 한도(USD " + ba.getMaxOrderUsd() + ") 초과: 예상 " + estUsd, p);
}
// 일일 누적 한도
if (ba.getDailyOrderUsd() != null && ba.getDailyOrderUsd() > 0) {
    BigDecimal todaySum = proposalRepo.sumExecutedUsdSince(p.getUserId(), LocalDate.now().atStartOfDay());
    double todayTotal = todaySum == null ? 0.0 : todaySum.doubleValue();
    if (todayTotal + estUsd > ba.getDailyOrderUsd()) {
        return new Result(false, "일일 누적 한도(USD " + ba.getDailyOrderUsd() + ") 초과: ...", p);
    }
}
```
- **게이트 ④: 금액 한도(USD).** 한 건당(`maxOrderUsd`)과 하루 누적(`dailyOrderUsd`) 두 종류.
- **시장가 한도 우회 방지가 핵심**: 시장가는 `limitPrice`가 없어 금액을 모릅니다. 그래서 `estimateUsd`(아래)가 **현재가를 조회해 추정**합니다 — 안 하면 "지정가는 막히는데 시장가로는 무제한"이 되는 구멍이 생깁니다.
- `qtyEff`(`effectiveQty`, `ProposalExecutionService.java:142-145`): 크립토 분수(`qtyDecimal`)가 있으면 우선, 없으면 정수 `qty`. KIS는 정수 주식, Binance는 0.0015 BTC 같은 분수라서.
- 일일 누적은 `sumExecutedUsdSince`로 **오늘 자정 이후 EXECUTED 주문의 USD 합**을 DB에서 계산(`OrderProposalRepository.java:30-34`: 수량 × `limitPrice` 우선, 없으면 `fillAvgPrice`).

```java
// ProposalExecutionService.java:91-94
String krwViol = krwDailyLimitViolation(proposalRepo, ba, p.getSide(), p.getUserId(), estUsd);
if (krwViol != null) return new Result(false, krwViol, p);
```
- **게이트 ⑤: KIS KRW 매수/매도 한도.** KIS 계정은 원화 한도(`dailyBuyKrw`/`dailySellKrw`)가 USD 한도보다 우선. `krwDailyLimitViolation`(`ProposalExecutionService.java:153-169`)이 **public static**인 이유: 수동 주문 경로(`BrokerOrderController.place`)가 **같은 메서드를 재사용**해 두 경로의 정책을 일치시키기 위함입니다. 주석(`ProposalExecutionService.java:91-92`)에 *"설정만 되고 두 주문 경로 어디서도 집행되지 않던 dead 한도였다"* — 과거에 한쪽 경로에서 빠져 우회됐던 버그를 고친 흔적.
- USD를 KRW로 바꿀 때 `BrokerAccount.USD_KRW_APPROX = 1300.0`(`BrokerAccount.java:31`) 근사 환율 사용.

```java
// ProposalExecutionService.java:96-103
if ("BUY".equals(p.getSide()) && ba.getDailyLossLimitUsd() != null && ba.getDailyLossLimitUsd() > 0) {
    Double pnl = totalUnrealizedPnl(ba);
    if (pnl != null && pnl < -ba.getDailyLossLimitUsd()) {
        return new Result(false, "손실 한도 서킷브레이커: 미실현 손실 " + Math.round(-pnl)
                + " USD 가 한도(" + ba.getDailyLossLimitUsd() + " USD) 초과 — 신규 매수 차단", p);
    }
}
```
- **게이트 ⑥: 손실 서킷브레이커.** 매수에만 적용. 마지막 잔고 스냅샷(`lastBalanceJson`)의 미실현 총손익(`totalUnrealizedPnl`, `ProposalExecutionService.java:209-217` → `total_market_value_usd` 키)이 한도보다 더 큰 손실이면 **추가 매수를 막아** 물타기 폭주를 차단.

```java
// ProposalExecutionService.java:105-130
p.setStatus("APPROVED");
p.setDecidedAt(LocalDateTime.now());
p.setAutoExecuted(auto);
proposalRepo.save(p);
try {
    Broker.Side side = "BUY".equals(p.getSide()) ? Broker.Side.BUY : Broker.Side.SELL;
    Broker.OrderResult res = broker.placeOrder(ba, p.getTicker(), side, qtyEff, p.getLimitPrice());
    if (!res.ok()) {
        p.setStatus("EXEC_FAILED");
        p.setExecError(...);
        proposalRepo.save(p);
        recordLog(...); recordAudit(..., "EXEC_FAILED", ...);
        return new Result(false, res.message(), p);
    }
    p.setStatus("EXECUTED");
    p.setExecutedAt(LocalDateTime.now());
    p.setKisOrderNo(res.orderNo());
    proposalRepo.save(p);
    recordLog(...); recordAudit(..., "EXECUTED", ...);
    return new Result(true, null, p);
}
```
- 모든 게이트 통과 후에야 `APPROVED`로 표시하고 **실제로 `broker.placeOrder`** 를 호출. 여기서부터 진짜 돈이 움직입니다.
- 성공이면 `EXECUTED` + 브로커 주문번호를 `kisOrderNo`에 저장(이름은 kis지만 Binance orderId도 여기 들어감). 실패면 `EXEC_FAILED` + 에러 기록.
- **감사 로그**(`recordAudit`, `ProposalExecutionService.java:189-206`): 실제로 시장에 나간 모든 시도(성공/실패)를 `OrderExecutionAudit`에 **불변 기록**. best-effort(기록 실패가 주문을 막지 않음). 크립토 분수 수량은 정수 audit 필드로 표현 불가라 `detail`에 풀어 적습니다.

```java
// ProposalExecutionService.java:171-186 (estimateUsd)
private double estimateUsd(Broker broker, BrokerAccount ba, OrderProposal p, BigDecimal qtyEff) {
    double price;
    if (p.getLimitPrice() != null) {
        price = p.getLimitPrice().doubleValue();
    } else {
        try {
            Map<String, Object> q = broker.getQuote(ba, p.getTicker());
            Object lp = q.get("last_price");
            price = lp instanceof Number n ? n.doubleValue() : Double.parseDouble(String.valueOf(lp));
        } catch (Exception e) { price = 0.0; }
    }
    return qtyEff.doubleValue() * price;
}
```
- 지정가면 그 값, 시장가면 **현재가 조회로 추정**(실패 시 0 — 기존 동작 유지). 위 게이트 ④/⑤가 시장가도 막을 수 있게 해주는 부분.

---

### D. `KisApiClient` — KIS 실제 호출 (핵심만)

원본(671줄)은 수정 금지 클래스입니다. **서명·UA·env 분기** 세 가지가 핵심.

#### env 분기: 도메인이 갈린다 (`KisApiClient.java:47-114`)
```java
// KisApiClient.java:47-48, 112-114
private static final String MOCK_HOST = "https://openapivts.koreainvestment.com:29443";
private static final String REAL_HOST = "https://openapi.koreainvestment.com:9443";
private String host(BrokerAccount.Env env) {
    return env == BrokerAccount.Env.REAL ? REAL_HOST : MOCK_HOST;
}
```
- **env=REAL이면 실전 도메인, MOCK이면 모의 도메인.** 같은 코드가 계정의 `env` 하나로 모의/실전을 가릅니다. TR-ID도 같은 방식으로 갈림(예: 매수 실전 `TTTT1002U` / 모의 `VTTT1002U`, `KisApiClient.java:484`).

#### 토큰 캐시 + 동시성 락 (`KisApiClient.java:170-269`)
```java
// KisApiClient.java:170-178
public String getAccessToken(BrokerAccount b) {
    String key = cacheKey(b);                       // userId + ":" + env
    CachedToken cached = tokenCache.get(key);
    if (cached != null && cached.valid()) return cached.token;
    synchronized (tokenLockFor(key)) {
        CachedToken again = tokenCache.get(key);    // double-check
        if (again != null && again.valid()) return again.token;
```
- **왜 락이 필요**: KIS는 토큰 발급을 **1분 1회**로 제한. 동시 요청이 몰리면 여러 번 발급을 시도하다 차단됩니다. `synchronized` + double-check로 **한 번만 발급**하고 나머지는 캐시를 씁니다. 토큰은 23시간 유효(`CachedToken.valid()`는 만료 5분 전부터 false로 보아 미리 갱신, `KisApiClient.java:108-110`).

#### UA(User-Agent) — 메모리에 박힌 교훈 (`KisApiClient.java:198-226`)
```java
// KisApiClient.java:222-226
// 헤더: 공식 Python 샘플과 동일 + PowerShell 스타일 User-Agent.
conn.setRequestProperty("Content-Type", "application/json");
conn.setRequestProperty("Accept", "text/plain");
conn.setRequestProperty("charset", "UTF-8");
conn.setRequestProperty("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 alpha-helix/1.0");
```
- **핵심 함정**: Spring `RestClient`가 기본으로 붙이는 `User-Agent: Java-http-client/...`를 KIS 게이트웨이가 **자동화 트래픽으로 보고 403 + EGW00002로 즉시 거부**합니다(키/IP 검증 이전 단계). 그래서 토큰 발급은 `RestClient`가 아니라 **JDK `HttpURLConnection`으로 내려가 브라우저 UA를 명시**(`KisApiClient.java:215-226`). WebSocket 승인키 발급(`getWsApprovalKey`, `KisApiClient.java:621-669`)도 같은 이유로 동일 패턴.
- 추가 함정: KIS GW는 **chunked 전송도 EGW00202로 거부**. 그래서 본문을 `byte[]`로 직렬화해 Content-Length를 명시(`jsonBytes`, `KisApiClient.java:146-152`; 주문도 `KisApiClient.java:515-517`).

#### 주문 + 거래소 폴백 (`KisApiClient.java:476-550`)
```java
// KisApiClient.java:486-492
String primary = exchangeOf(ticker);
java.util.List<String> exchanges = new java.util.ArrayList<>();
exchanges.add(primary);
for (String alt : List.of("NASD", "NYSE", "AMEX")) {
    if (!exchanges.contains(alt)) exchanges.add(alt);
}
```
- KIS 미국주식 주문은 **거래소 코드**(NASD/NYSE/AMEX)를 정확히 보내야 합니다. 틀리면 `EGW00202`(GW 라우팅 오류). 티커별 알려진 매핑(`EXCHANGE_BY_TICKER`, `KisApiClient.java:56-82`; 예: 레버리지 ETF SOXL은 AMEX)으로 1차 시도하고, 실패하면 다른 거래소로 **순차 폴백**(`KisApiClient.java:526-537`).
- 주문 직전 kill-switch를 **여기서도 한 번 더** 확인(`KisApiClient.java:479-481`) — 이중 방어.
- rate-limit(EGW00201, 초당 거래건수 초과)은 `withRateLimitRetry`(`KisApiClient.java:404-420`)가 1.5초 후 1회 재시도.

---

### E. `BinanceApiClient` — Binance 실제 호출 (핵심만)

#### env 분기 + 서명 (`BinanceApiClient.java:45-71, 116-143`)
```java
// BinanceApiClient.java:63-71
private String spotHost(BrokerAccount b) {
    return b.getEnv() == BrokerAccount.Env.MOCK ? SPOT_TESTNET_HOST : SPOT_HOST;
}
private String futuresHost(BrokerAccount b) {
    return FUTURES_HOST;   // ⚠ MOCK 이어도 실거래 fapi 로 나간다
}
```
- **현물(SPOT)**: env=MOCK이면 테스트넷(`testnet.binance.vision`), REAL이면 메인넷(`api.binance.com`).
- **함정 주의**: `futuresHost`는 **MOCK이어도 실거래 `fapi.binance.com`을 반환**합니다. 즉 선물은 테스트넷 분기가 없습니다 — 그래서 어댑터에서 FUTURES 주문을 통째로 차단합니다(아래 G 참고).

```java
// BinanceApiClient.java:116-143
private String sign(String data, String secret) {
    Mac mac = Mac.getInstance("HmacSHA256");
    mac.init(new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
    byte[] raw = mac.doFinal(data.getBytes(StandardCharsets.UTF_8));
    return HexFormat.of().formatHex(raw);
}
private String signedQuery(Map<String, Object> params, String secret) {
    params.put("timestamp", System.currentTimeMillis());
    String qs = toQueryString(params);
    return qs + "&signature=" + sign(qs, secret);
}
```
- **HMAC-SHA256 서명**: 쿼리스트링 전체를 secret으로 도장 찍어 `&signature=...`를 붙입니다. secret은 **절대 전송하지 않고** 서명에만 씀(`BinanceApiClient.java:34`). API Key는 헤더 `X-MBX-APIKEY`로만 전달(`BinanceApiClient.java:33`).
- `timestamp`가 필수인 이유: Binance는 서버 시각과 차이가 크면 거부(-1021). 그래서 시스템 시계가 맞아야 함.

#### rate-limit 백오프 (`BinanceApiClient.java:81-109`)
```java
// BinanceApiClient.java:86-104 (요약)
if ((sc == 429 || sc == 418) && attempts < 3) {
    ... Retry-After 헤더 존중, 점증 대기 후 재시도 ...
}
```
- HTTP 429(요청한도)/418(IP 자동밴 경고)을 받으면 **Retry-After를 존중해 최대 3회 재시도**. 무시하고 계속 때리면 IP가 최대 3일 밴되므로 모든 호출이 이 래퍼를 통과(`BinanceApiClient.java:78-79`).

#### 거래소 필터 (`BinanceApiClient.java:430-487`)
```java
// BinanceApiClient.java:470-487 (요약)
public record SymbolFilters(BigDecimal stepSize, BigDecimal tickSize, BigDecimal minQty, BigDecimal minNotional) {
    public BigDecimal truncateQty(BigDecimal qty) { ... stepSize 배수로 내림 ... }
    public BigDecimal truncatePrice(BigDecimal price) { ... tickSize 배수로 내림 ... }
}
```
- 크립토는 수량/가격이 거래소가 정한 **stepSize/tickSize 배수**여야 하고 명목가는 **minNotional 이상**이어야 합니다. 부동소수 반올림으로 거부당하지 않게 항상 `BigDecimal`로 **내림 절삭**(`RoundingMode.DOWN`). 심볼별로 캐시(`filterCache`).

---

### F. `KisBrokerAdapter` — KIS를 Broker로 번역 (`KisBrokerAdapter.java:31-92`)

```java
// KisBrokerAdapter.java:31-50
public OrderResult placeOrder(BrokerAccount b, String symbol, Side side, BigDecimal qty, BigDecimal limitPrice) {
    KisApiClient.Side ks = side == Side.BUY ? KisApiClient.Side.BUY : KisApiClient.Side.SELL;
    long q = qty.setScale(0, RoundingMode.DOWN).longValue();   // 미국주식은 정수 수량
    Double lim = limitPrice == null ? null : limitPrice.doubleValue();
    // M4: 시장가(limitPrice=null) 의도면 현재가를 조회해 그 가격의 지정가로 변환
    if (lim == null) {
        try {
            Map<String, Object> quote = kis.getOverseasQuote(b, symbol);
            Object lp = quote.get("last_price");
            double px = lp instanceof Number n ? n.doubleValue() : Double.parseDouble(String.valueOf(lp));
            if (px > 0) lim = px;
        } catch (Exception ignore) { }
        if (lim == null) {
            return OrderResult.failure("NO_QUOTE",
                    "KIS 지정가 산정 실패: ... 0원 지정가 전송을 막았습니다. ...");
        }
    }
```
- **수량 정수화**: 주식은 0.5주가 없으므로 `RoundingMode.DOWN`으로 정수화.
- **0원 지정가 방지(M4)가 핵심**: KIS 미국주식은 `ORD_DVSN=00`(지정가)만 쓰므로, 단가 0(=limitPrice null)을 그대로 보내면 **0원 지정가로 거부**됩니다. 그래서 시장가 의도면 **현재가를 조회해 그 값으로 지정가 변환**. 조회 실패 시 0원 전송 대신 명확히 실패 반환(`KisBrokerAdapter.java:46-49`).

```java
// KisBrokerAdapter.java:51-58
Map<String, Object> resp = kis.placeOverseasOrder(b, symbol, ks, q, lim);
String rtCd = String.valueOf(resp.getOrDefault("rt_cd", ""));
if (!"0".equals(rtCd)) {
    String msgCd = String.valueOf(resp.getOrDefault("msg_cd", ""));
    return OrderResult.failure(msgCd, friendlyKisError(msgCd, msg, b));
}
return OrderResult.success(String.valueOf(resp.getOrDefault("kis_order_no", "")), rtCd);
```
- KIS는 `rt_cd="0"`이 성공. 그 외는 `msg_cd`를 **사람이 읽을 메시지**로 번역(`friendlyKisError`, EGW00202/00201/00105 등)해 `OrderResult.failure`로 정규화.

```java
// KisBrokerAdapter.java:64-92 (queryFill 요약)
JsonNode output = resp.path("output");   // inquire-nccs(미체결내역)
... p.getKisOrderNo() 와 일치하는 주문 찾기 ...
if (match != null) {
    filledQty = max(0, 주문수량 - 미체결수량);
    fillStatus = filledQty > 0 ? "PARTIAL" : "OPEN";
} else {
    fillStatus = "FILLED";   // 미체결 목록에 없음 → 전량 체결로 간주(휴리스틱)
}
```
- KIS는 직접 "체결됐다" API가 없어 **미체결내역에 없으면 전량 체결**로 보는 휴리스틱. 평균 체결가는 제공 안 함(`avgPrice=null`).

---

### G. `BinanceBrokerAdapter` — Binance를 Broker로 번역 (`BinanceBrokerAdapter.java:37-83`)

```java
// BinanceBrokerAdapter.java:37-44
public OrderResult placeOrder(...) {
    if (b.getBinanceMode() == BrokerAccount.BinanceMode.FUTURES) {
        return OrderResult.failure("FUTURES_DISABLED",
                "Binance 선물(FUTURES) 주문은 현재 비활성화 ... 안전을 위해 SPOT(현물)만 지원합니다.");
    }
    if (tradingControl.isKillSwitchOn()) {
        return OrderResult.failure("KILL_SWITCH", "전역 거래 차단(kill-switch) 활성화 — 모든 주문 거부");
    }
```
- **FUTURES 차단이 핵심 안전장치**: 위 E에서 봤듯 `futuresHost`는 MOCK이어도 실거래로 나갑니다. "MOCK인데 진짜 돈이 나가는" 사고를 막기 위해 선물 주문을 **어댑터에서 통째로 거부**(주석 `BinanceBrokerAdapter.java:18-19`).
- `BinanceApiClient` 자체는 kill-switch를 안 보므로, **어댑터에서 재확인**(`BinanceBrokerAdapter.java:42-44`).

```java
// BinanceBrokerAdapter.java:45-71
BinanceApiClient.SymbolFilters f = binance.getSymbolFilters(b, symbol);
BigDecimal q = f.truncateQty(qty);
if (q.signum() <= 0) return OrderResult.failure("LOT_SIZE", "... 최소 주문 단위 미만 ...");
String type = (limitPrice == null) ? "MARKET" : "LIMIT";
... 명목가 = q × refPrice 가 minNotional 미만이면 거부 ...
Map<String, Object> resp = binance.placeSpotOrder(b, symbol, side.name(), type, q.toPlainString(), priceStr);
```
- 주문 전 **거래소 필터로 수량/가격을 절삭·검증**해 Binance가 거부할 주문을 미리 거름. `limitPrice` 유무로 MARKET/LIMIT 결정.
- 체결 조회(`queryFill`, `BinanceBrokerAdapter.java:86-106`)는 KIS와 달리 **정확한 status + 평균체결가**(`cummulativeQuoteQty / executedQty`)를 제공. `mapStatus`(`BinanceBrokerAdapter.java:121-129`)가 Binance status를 정규화(FILLED/PARTIAL/OPEN/CANCELLED).

---

### H. `OrderFillService.pollFill` — 체결 도착 확인 (`OrderFillService.java:39-84`)

```java
// OrderFillService.java:45-67 (요약)
BrokerAccount b = brokerRepo.findById(p.getBrokerAccountId()).orElse(null);
Broker broker = brokerRouter.forAccount(b);
Broker.FillResult fr = broker.queryFill(b, p);
... p.setFillStatus/filledQty/fillAvgPrice ... proposalRepo.save(p);
// B2: 체결 시 잔고 스냅샷 자동 동기화
if ("FILLED".equals(fr.fillStatus()) || "PARTIAL".equals(fr.fillStatus())) {
    Map<String, Object> bal = broker.getBalance(b);
    b.setLastBalanceJson(om.writeValueAsString(bal));
    b.setLastBalanceAt(LocalDateTime.now());
    brokerRepo.save(b);
}
```
- `EXECUTED`(KIS/Binance가 주문을 **수락**)와 실제 **체결(FILLED)**은 다릅니다. 주문은 받아졌어도 시장에서 안 채워질 수 있음. 그래서 나중에 폴링으로 진짜 체결을 확인.
- 체결되면 **잔고 스냅샷을 자동 갱신**(`lastBalanceJson`) — 이 스냅샷의 `total_market_value_usd`를 위 게이트 ⑥(손실 서킷브레이커)이 사용. best-effort(잔고 동기화 실패가 체결 판정을 뒤집지 않음).
- `OrderFillPollingJob`(`OrderFillPollingJob.java`)이 3분마다 최근 36시간 내 미확정 건만 폴링해 KIS rate-limit 부담 최소화.

---

### I. `TradingControlService` — 런타임 kill-switch (`TradingControlService.java:19-47`)

```java
// TradingControlService.java:21-38
@Value("${app.trading.kill-switch:false}")
private boolean configKillSwitch;
private volatile Boolean override = null;     // null = 설정값 사용

public boolean isKillSwitchOn() {
    return override != null ? override : configKillSwitch;
}
public void setKillSwitch(boolean on) { this.override = on; ... }
```
- 기본값은 환경설정(`TRADING_KILL_SWITCH`). 운영 중 `setKillSwitch(true)`로 **재시작 없이** 즉시 전 주문 차단. 모든 주문 경로(`ProposalExecutionService`·`KisApiClient`·`BinanceBrokerAdapter`)가 이걸 보므로 토글 한 번에 전체 적용. `volatile`은 다른 스레드가 즉시 보게 하는 키워드(가시성).

---

### J. `PromotionGateService` — MOCK→REAL 승격 게이트 (`PromotionGateService.java:51-118`)

```java
// PromotionGateService.java:51-56
public GateResult evaluate(Long userId, BrokerAccount realAccount) {
    if (realAccount.getEnv() != BrokerAccount.Env.REAL) {
        return new GateResult(true, List.of(), "MOCK 계정은 승격 게이트가 적용되지 않습니다.");
    }
```
- MOCK은 자유. **REAL의 `tradingEnabled=true` 전환을 허용하기 전** 5가지를 검사:
  1. REAL 자체 `/test` 통과(`lastVerifiedAt != null`)
  2. 같은 브로커의 MOCK 계정 존재 — `findByUserIdAndBrokerTypeAndEnv`로 조회(`PromotionGateService.java:69`; 주석에 *"findByUserIdAndEnv 는 다중브로커 시 NonUnique 500"* — 과거 다중 브로커에서 터지던 버그를 고친 흔적)
  3. MOCK 등록 후 14일 이상(`MIN_MOCK_DAYS`)
  4. MOCK EXECUTED 5건 이상(`MIN_MOCK_EXECUTED`)
  5. MOCK 실패율 < 30%(`MAX_MOCK_FAIL_RATIO`)
- 한 항목이라도 실패하면 **무엇이 부족한지** 정확히 반환(`checks` 리스트). `BrokerAccountController.setTradingEnabled`(`BrokerAccountController.java:158-168`)가 REAL+KIS일 때 이 게이트를 호출.

> 주의: 이 게이트는 **수동 매매 활성화(`tradingEnabled`)** 용이고, **자동 체결(`auto-execute`)** 은 별도의 더 엄격한 게이트(MOCK 자동매매 14일 + 20회)를 `BrokerAccountController.setAutoExecute`(`BrokerAccountController.java:200-222`)가 직접 검사합니다. 두 게이트는 다른 기준입니다.

---

### K. 컨트롤러 3종 — 입구

#### `BrokerAccountController` — 계좌·한도·스위치 (`BrokerAccountController.java`)
- 키 등록(`upsert`): appsecret을 **즉시 `crypto.encrypt`** 후 저장(`BrokerAccountController.java:119,124`). 평문 저장 절대 금지.
- REAL 한도 안전 상한(`realCapViolation`, `BrokerAccountController.java:60-73`): 1건당 USD 5만, 일일 USD 20만, 매수 1억원/매도 5억원. **등록·수정 양 경로에서 동일 적용**(주석 `BrokerAccountController.java:50-54`: 과거 patchLimits에만 캡이 있어 upsert로 우회되던 비대칭을 고침).
- `setTradingEnabled`: REAL은 `/test` 통과 + KIS면 승격 게이트 통과해야 켜짐.
- `testConnection`: 토큰 발급만 성공해도 인증 통과로 간주(`lastVerifiedAt` 기록). 잔고 조회는 best-effort(KIS 초당 호출 제한으로 실패해도 인증은 유지). KIS 에러 코드를 풍부한 사용자 안내로 번역(`friendlyKisError`, `BrokerAccountController.java:358-417`).

#### `OrderProposalController` — 승인 큐 (`OrderProposalController.java`)
- `create`: 수동 제안 생성(`source=MANUAL`, +24h 만료). 크립토는 분수를 `qtyDecimal`에, 주식은 정수 `qty`에(`OrderProposalController.java:91-95`). **항상 PENDING으로만** 생성.
- `approve`: 소유권 검증(`findByIdAndUserId`) 후 **수동 승인도 자동과 동일한 `exec.execute(p, ba, false)`** 호출(`OrderProposalController.java:135`). 한도/kill-switch를 우회하는 별도 경로가 없음.
- `pollFill`: EXECUTED 주문의 체결을 즉시 폴링(스케줄잡과 동일 로직 수동 트리거).

#### `BrokerOrderController` — 직접 주문 (`BrokerOrderController.java`)
- `place`: 제안을 안 거치는 직접 주문 경로. **그래서 가드를 스스로 전부 수행** — `tradingEnabled`·`lastVerifiedAt`·1건당/일일 USD 한도, 그리고 **`ProposalExecutionService.krwDailyLimitViolation`을 재사용**(`BrokerOrderController.java:198`)해 KRW 한도까지. 통과 후 `brokerRouter.forAccount(b).placeOrder(...)` 직접 호출.
- `preview`: 실제 주문 없이 한도/예상 비용만 계산. `quote`/`balance`/`orders/today`는 라우터 경유 조회.

---

### L. 엔티티 필드 의미

#### `BrokerAccount` (`BrokerAccount.java`) — 계좌 + 한도 + 스위치
| 필드 | 의미 |
|---|---|
| `env` | `MOCK`(모의/테스트넷) \| `REAL`(실전/메인넷). 기본 MOCK |
| `brokerType` | `KIS` \| `BINANCE`. 기본 KIS |
| `appKey` / `appSecretEnc` | KIS 키. secret은 **암호화 저장**(`*_enc`) |
| `cano` / `acntPrdtCd` | KIS 종합계좌번호(8) / 상품코드(보통 "01") |
| `binanceApiKey` / `binanceApiSecretEnc` | Binance 키. secret 암호화 저장 |
| `binanceMode` | `SPOT` \| `FUTURES`. FUTURES는 주문 차단됨 |
| `maxOrderUsd` | 1건당 최대(USD), 0=무제한. 기본 5,000 |
| `dailyOrderUsd` | 일일 누적 최대(USD). 기본 20,000. KIS는 KRW 한도 우선 |
| `dailyLossLimitUsd` | 손실 서킷브레이커. 미실현 손실이 이 값 초과 시 신규 매수 차단 |
| `dailyBuyKrw` / `dailySellKrw` | KIS 전용 1일 매수/매도 한도(원화) |
| `tradingEnabled` | **마스터 스위치.** false면 모든 승인 거부. 기본 false |
| `autoExecute` | 자동 체결 스위치. 시그널 PENDING을 사람 승인 없이 실행. 기본 false |
| `lastVerifiedAt` | 마지막 연결 테스트 성공 시각 |
| `lastBalanceJson` / `lastBalanceAt` | 체결 후 잔고 스냅샷(손실 서킷브레이커가 읽음) |
- 유니크 제약(`BrokerAccount.java:20-22`): `(user_id, broker_type, env)` — 한 사용자가 같은 브로커·env 계좌를 중복 등록 못 함.
- `USD_KRW_APPROX = 1300.0`(`BrokerAccount.java:31`): KRW 한도 환산용 근사 환율(실시간 아님).

#### `OrderProposal` (`OrderProposal.java`) — 주문 제안
| 필드 | 의미 |
|---|---|
| `userId` | 소유자 — 권한 검증 1차 게이트 |
| `workspaceId` | 발생 워크스페이스(수동이면 null 허용) |
| `brokerAccountId` | 보낼 계좌(반드시 본인 소유) |
| `ticker` / `side` | 종목(SPY/BTCUSDT) / BUY\|SELL |
| `qty` | 정수 수량(주식). NOT NULL placeholder |
| `qtyDecimal` | 분수 수량(크립토). 있으면 실행/체결에서 **우선** |
| `limitPrice` | 지정가. null=시장가 |
| `source` | `SIGNAL` \| `MANUAL` |
| `status` | PENDING→(APPROVED→EXECUTED\|EXEC_FAILED)\|REJECTED\|EXPIRED |
| `kisOrderNo` | 브로커가 준 주문번호(Binance orderId도 여기) |
| `execError` | 실패 사유 |
| `expiresAt` | 만료 시각(보통 +24h). `OrderProposalExpiryJob`이 정리 |
| `autoExecuted` | 사람 승인 없이 자동 체결됐는지(졸업 게이트 집계용) |
| `fillStatus` / `filledQty` / `filledQtyDecimal` / `fillAvgPrice` / `fillCheckedAt` | 실제 체결 폴링 결과(EXECUTED와 별개) |

---

## ⚠️ 함정·보안 주의

1. **KIS 기본 Java UA 차단** — Spring `RestClient`의 `Java-http-client/...` UA를 KIS GW가 403 + EGW00002로 거부. 토큰/승인키 발급은 `HttpURLConnection` + 브라우저 UA로 우회(`KisApiClient.java:222-226, 642`). 이 클래스를 손댈 때 UA를 지우면 인증이 통째로 깨집니다. (메모리 교훈과 일치.)

2. **KIS chunked 전송 = EGW00202** — Map을 그대로 보내면 chunked로 나가 GW가 거부. 본문을 `byte[]`로 직렬화해 Content-Length 명시(`jsonBytes`). 주문 본문도 동일(`KisApiClient.java:515-517`).

3. **Binance env=REAL → 메인넷 / FUTURES는 항상 실거래** — `spotHost`는 MOCK이면 테스트넷이지만 `futuresHost`는 **MOCK이어도 `fapi.binance.com`(실거래)**. 그래서 `BinanceBrokerAdapter`가 **FUTURES 주문을 통째로 차단**(`BinanceBrokerAdapter.java:38-41`). 이 차단을 풀면 모의가 진짜 돈을 씁니다.

4. **두 번째 주문 경로 우회 방지** — 직접 주문(`BrokerOrderController.place`)이 제안 승인 경로와 **다른 한도 정책**을 쓰면 우회 구멍이 생깁니다. 그래서 KRW 한도 검사를 `ProposalExecutionService.krwDailyLimitViolation` **public static 메서드로 공유**해 양 경로가 같은 규칙을 씁니다(`BrokerOrderController.java:198`). REAL 한도 캡도 등록·수정 양 경로에서 동일 적용(`BrokerAccountController.java:107, 260`).

5. **시장가 한도 우회 방지** — 시장가는 금액을 모르므로 현재가를 조회해 추정(`estimateUsd`). 안 하면 "지정가는 막히고 시장가는 무제한" 구멍.

6. **0원 지정가 사고** — KIS 미국주식은 지정가만 쓰므로 단가 0 전송은 거부됩니다. 시장가 의도면 현재가를 지정가로 변환하고, 조회 실패 시 0원 대신 명확한 실패 반환(`KisBrokerAdapter.java:39-49`).

7. **키 평문 저장 금지** — appsecret/apiSecret은 등록 즉시 `crypto.encrypt` 후 `*_enc` 컬럼에 저장. 로그에도 마스킹(`previewWithSecretMasked`, `KisApiClient.java:155-162`).

8. **MOCK→REAL 졸업 게이트** — 수동(`PromotionGateService`: 14일+5건+실패율<30%)과 자동(`setAutoExecute`: 14일+20회)이 **다른 기준**. 헷갈리지 말 것.

9. **EXECUTED ≠ FILLED** — 주문 수락과 실제 체결은 다름. 체결은 `OrderFillService`/폴링잡으로 별도 확인.

10. **kill-switch는 런타임 우선** — `TradingControlService.override`가 설정값보다 우선. 재시작하면 설정 기본값으로 복귀하므로, 긴급 차단 후 영구 차단이 필요하면 환경변수도 바꿔야 합니다.

---

## 🚀 고도화 아이디어

- **실시간 환율**: `USD_KRW_APPROX = 1300` 고정 → 환율 API 연동으로 KRW 한도 정확도 향상(TODO 주석 `BrokerAccount.java:29`).
- **선물 테스트넷 배선**: `testnet.binancefuture.com` 별도 계정 + env 분기를 추가하면 FUTURES 차단을 안전하게 풀 수 있음(현재 미배선이라 차단).
- **체결 WebSocket 정밀화**: KIS 체결통보 WS(`KisFillWebSocketService`)와 Binance user-data-stream을 붙여 폴링 대신 푸시 기반 체결 확인으로 지연/부하 절감.
- **새 브로커 추가**: `Broker` 구현 + `@Component` 한 개면 `BrokerRouter`가 자동 인식. 예: Alpaca, IBKR. 라우터/실행서비스 수정 불필요.
- **부분체결 후속 처리**: 현재 PARTIAL은 상태만 기록. 미체결 잔량 자동 취소/재주문 정책을 `OrderFillService`에 추가 가능.
- **한도 정책 엔진화**: 게이트 6종이 `execute`에 인라인. 정책을 `OrderGuard` 체인으로 분리하면 테스트·확장이 쉬워짐(전략 패턴).
- **KIS 거래소 매핑 자동화**: `EXCHANGE_BY_TICKER` 하드코딩 → exchangeInfo류 조회/캐시로 자동 판별.

---

## 📚 용어 사전 (이 파트 한정)

| 용어 | 뜻 |
|---|---|
| **Broker (인터페이스)** | 모든 증권사가 구현하는 공통 계약(주문/체결/잔고/시세) |
| **어댑터(Adapter)** | 생김새 다른 원본 ApiClient를 Broker 모양으로 변환하는 얇은 래퍼 |
| **OrderProposal** | 실행 전 주문 초안. PENDING→…→EXECUTED 생명주기 |
| **안전 게이트** | execute가 주문 전 통과시키는 6중 검사(kill-switch·한도·손실 등) |
| **kill-switch** | 전역 거래 차단 스위치. 재시작 없이 전 주문 즉시 거부 |
| **tradingEnabled** | 계좌별 매매 마스터 스위치 |
| **autoExecute** | 시그널 제안을 사람 승인 없이 자동 체결하는 스위치 |
| **MOCK / REAL** | 모의/테스트넷 ↔ 실전/메인넷 |
| **승격 게이트** | MOCK 실적을 검증해야 REAL을 켤 수 있게 하는 관문 |
| **rt_cd / msg_cd** | KIS 응답 코드("0"=성공) / 에러 세부 코드(EGW00xxx) |
| **EGW00202 / 00201 / 00002** | KIS GW 라우팅 오류 / 초당 한도 초과 / 자동화 트래픽(UA) 거부 |
| **HMAC-SHA256** | secret으로 만든 위조 불가 서명. Binance 사적 요청 인증 |
| **X-MBX-APIKEY** | Binance API Key 전달 헤더(URL 금지) |
| **LOT_SIZE / tickSize / minNotional** | 크립토 수량·가격 단위·최소 명목가 거래소 필터 |
| **FillResult / fillStatus** | 정규화 체결 결과. FILLED/PARTIAL/OPEN/CANCELLED/UNKNOWN |
| **EXECUTED vs FILLED** | 주문 수락(접수) ↔ 실제 시장 체결. 다름 |
| **lastBalanceJson** | 체결 후 동기화되는 잔고 스냅샷(손실 서킷브레이커가 읽음) |
| **OrderExecutionAudit** | 시장에 나간 모든 주문 시도의 불변 감사 기록 |
| **TTL / expiresAt** | 제안 만료 시각. ExpiryJob이 PENDING 만료분을 EXPIRED로 정리 |
</content>
</invoke>
