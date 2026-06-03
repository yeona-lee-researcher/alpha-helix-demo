package com.DevBridge.devbridge.domain.strategy.controller;

import com.DevBridge.devbridge.domain.strategy.entity.BrokerAccount;
import com.DevBridge.devbridge.domain.strategy.repository.BrokerAccountRepository;
import com.DevBridge.devbridge.global.security.AuthContext;
import com.DevBridge.devbridge.domain.strategy.service.broker.Broker;
import com.DevBridge.devbridge.domain.strategy.service.broker.BrokerRouter;
import com.DevBridge.devbridge.domain.strategy.service.broker.KisApiClient;
import com.DevBridge.devbridge.domain.strategy.service.broker.KisFillWebSocketService;
import com.DevBridge.devbridge.domain.strategy.service.broker.ProposalExecutionService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import java.math.BigDecimal;
import java.util.Map;

/**
 * 미국주식 주문/잔고 API. KIS 모의·실전 양쪽 모두 동일 엔드포인트로 동작 (env는 BrokerAccount에서 결정).
 *
 * 흐름:
 *  GET  /balance        → 보유종목 + 예수금
 *  POST /preview        → 한도 검증 + 예상 비용 계산 (실제 주문 X)
 *  POST /place          → 실제 KIS 주문 전송 (한도·tradingEnabled·검증여부 모두 통과해야 함)
 *  GET  /orders/today   → 당일 주문/체결 내역
 */
@RestController
@RequestMapping("/api/broker")
@RequiredArgsConstructor
@Slf4j
public class BrokerOrderController {

    private final BrokerAccountRepository brokerRepo;
    private final KisApiClient kis;
    private final BrokerRouter brokerRouter;
    private final KisFillWebSocketService fillWs;
    private final com.DevBridge.devbridge.domain.strategy.repository.OrderProposalRepository proposalRepo;

    @GetMapping("/balance")
    public ResponseEntity<?> balance(@RequestParam("env") BrokerAccount.Env env,
                                     @RequestParam(value = "brokerType", required = false) BrokerAccount.BrokerType brokerType) {
        Long uid = AuthContext.currentUserId();
        if (uid == null) return unauth();
        BrokerAccount b = resolve(uid, env, brokerType);
        if (b == null) return notRegistered(brokerType);
        try {
            return ResponseEntity.ok(brokerRouter.forAccount(b).getBalance(b));
        } catch (Exception e) {
            return ResponseEntity.status(HttpStatus.BAD_GATEWAY)
                    .body(Map.of("error", "잔고 조회 실패: " + e.getMessage()));
        }
    }

    @GetMapping("/orders/today")
    public ResponseEntity<?> ordersToday(@RequestParam("env") BrokerAccount.Env env,
                                         @RequestParam(value = "brokerType", required = false) BrokerAccount.BrokerType brokerType) {
        Long uid = AuthContext.currentUserId();
        if (uid == null) return unauth();
        BrokerAccount b = resolve(uid, env, brokerType);
        if (b == null) return notRegistered(brokerType);
        if (b.getBrokerType() == BrokerAccount.BrokerType.BINANCE) {
            // Binance 당일주문 직접조회는 추후 지원 — 체결은 주문 응답/제안 체결확인(poll-fill)으로 확인.
            return ResponseEntity.ok(Map.of("output", java.util.List.of(),
                    "note", "Binance 당일주문 직접조회는 추후 지원 — 체결은 주문 응답 또는 제안 체결확인으로 확인하세요."));
        }
        try {
            return ResponseEntity.ok(kis.getTodayOrders(b));
        } catch (Exception e) {
            return ResponseEntity.status(HttpStatus.BAD_GATEWAY)
                    .body(Map.of("error", "주문내역 조회 실패: " + e.getMessage()));
        }
    }

    /** 현재가 조회 — 지정가 입력시 참고용. KIS=HHDFS00000300, Binance=ticker/price. */
    @GetMapping("/quote")
    public ResponseEntity<?> quote(@RequestParam("env") BrokerAccount.Env env, @RequestParam String ticker,
                                   @RequestParam(value = "brokerType", required = false) BrokerAccount.BrokerType brokerType) {
        Long uid = AuthContext.currentUserId();
        if (uid == null) return unauth();
        BrokerAccount b = resolve(uid, env, brokerType);
        if (b == null) return notRegistered(brokerType);
        try {
            return ResponseEntity.ok(brokerRouter.forAccount(b).getQuote(b, ticker.trim().toUpperCase()));
        } catch (Exception e) {
            return ResponseEntity.status(HttpStatus.BAD_GATEWAY)
                    .body(Map.of("error", "현재가 조회 실패: " + e.getMessage()));
        }
    }

    /** WebSocket 체결통보 접속키 발급 — 프론트가 KIS WS에 직접 연결할 때 사용. */
    @PostMapping("/ws-key")
    public ResponseEntity<?> wsKey(@RequestParam("env") BrokerAccount.Env env) {
        Long uid = AuthContext.currentUserId();
        if (uid == null) return unauth();
        BrokerAccount b = brokerRepo.findByUserIdAndBrokerTypeAndEnv(uid, BrokerAccount.BrokerType.KIS, env).orElse(null);
        if (b == null) return ResponseEntity.status(HttpStatus.PRECONDITION_FAILED)
                .body(Map.of("error", "먼저 KIS 계좌를 등록하세요"));
        try {
            String key = kis.getWsApprovalKey(b);
            String wsUrl = b.getEnv() == BrokerAccount.Env.REAL
                    ? "wss://ops.koreainvestment.com:21000"
                    : "wss://ops.koreainvestment.com:31000";
            return ResponseEntity.ok(Map.of("approval_key", key, "ws_url", wsUrl, "env", b.getEnv().name()));
        } catch (Exception e) {
            return ResponseEntity.status(HttpStatus.BAD_GATEWAY)
                    .body(Map.of("error", "WS 키 발급 실패: " + e.getMessage()));
        }
    }

    /** B3-4: 체결통보 WebSocket 기반 검증 — 승인키 발급 + KIS WS 연결. (구독/파싱은 장중 정밀화) */
    @PostMapping("/fill-ws/test")
    public ResponseEntity<?> fillWsTest(@RequestParam("env") BrokerAccount.Env env) {
        Long uid = AuthContext.currentUserId();
        if (uid == null) return unauth();
        BrokerAccount b = brokerRepo.findByUserIdAndBrokerTypeAndEnv(uid, BrokerAccount.BrokerType.KIS, env).orElse(null);
        if (b == null) return ResponseEntity.status(HttpStatus.PRECONDITION_FAILED)
                .body(Map.of("error", "먼저 KIS 계좌를 등록하세요"));
        return ResponseEntity.ok(fillWs.testConnection(b));
    }

    /** quantity 는 Double — 크립토 분수 수량 허용(주식은 정수로 들어옴). */
    public record OrderReq(String ticker, String side, Double quantity, Double limitPrice) {}

    /**
     * 주문 사전 검증. 한도·검증상태·tradingEnabled 검사. 시장가는 현재가로 명목가 추정. 실제 주문 전송 없음.
     */
    @PostMapping("/orders/preview")
    public ResponseEntity<?> preview(@RequestParam("env") BrokerAccount.Env env,
                                     @RequestParam(value = "brokerType", required = false) BrokerAccount.BrokerType brokerType,
                                     @RequestBody OrderReq req) {
        Long uid = AuthContext.currentUserId();
        if (uid == null) return unauth();
        BrokerAccount b = resolve(uid, env, brokerType);
        var bad = guard(b, req);
        if (bad != null) return bad;
        double price = req.limitPrice() != null ? req.limitPrice() : currentPrice(b, req.ticker());
        double estUsd = price * req.quantity();
        boolean overSingle = b.getMaxOrderUsd() != null && b.getMaxOrderUsd() > 0 && estUsd > b.getMaxOrderUsd();
        Map<String, Object> out = new java.util.LinkedHashMap<>();
        out.put("ok", !overSingle);
        out.put("broker", b.getBrokerType().name());
        out.put("ticker", req.ticker().toUpperCase());
        out.put("side", req.side().toUpperCase());
        out.put("quantity", req.quantity());
        out.put("limit_price", req.limitPrice());
        out.put("ref_price", price);
        out.put("est_total_usd", estUsd);
        out.put("max_order_usd", b.getMaxOrderUsd() == null ? 0 : b.getMaxOrderUsd());
        out.put("over_single_limit", overSingle);
        out.put("env", b.getEnv().name());
        out.put("trading_enabled", b.getTradingEnabled());
        return ResponseEntity.ok(out);
    }

    /**
     * 실제 주문 전송 (KIS 해외주식 / Binance 현물 — brokerType 으로 라우팅).
     * 보안 가드: tradingEnabled, lastVerifiedAt, 1건당·일일 한도(시장가는 현재가 추정), 입력 검증.
     */
    @PostMapping("/orders/place")
    @Transactional
    public ResponseEntity<?> place(@RequestParam("env") BrokerAccount.Env env,
                                   @RequestParam(value = "brokerType", required = false) BrokerAccount.BrokerType brokerType,
                                   @RequestBody OrderReq req) {
        Long uid = AuthContext.currentUserId();
        if (uid == null) return unauth();
        BrokerAccount b = resolve(uid, env, brokerType);
        var bad = guard(b, req);
        if (bad != null) return bad;
        if (!Boolean.TRUE.equals(b.getTradingEnabled())) {
            return ResponseEntity.status(HttpStatus.PRECONDITION_FAILED)
                    .body(Map.of("error", "매매 스위치가 OFF입니다. 계좌 설정에서 활성화 후 다시 시도하세요."));
        }
        if (b.getLastVerifiedAt() == null) {
            return ResponseEntity.status(HttpStatus.PRECONDITION_FAILED)
                    .body(Map.of("error", "먼저 연결 테스트로 키 유효성을 검증하세요."));
        }
        double price = req.limitPrice() != null ? req.limitPrice() : currentPrice(b, req.ticker());
        double estUsd = price * req.quantity();
        if (b.getMaxOrderUsd() != null && b.getMaxOrderUsd() > 0 && estUsd > b.getMaxOrderUsd()) {
            return ResponseEntity.status(HttpStatus.PRECONDITION_FAILED)
                    .body(Map.of("error", "1건당 한도(USD " + b.getMaxOrderUsd() + ") 초과: 예상 " + estUsd));
        }
        // 일일 누적 한도 — 자정(서버 로컬타임) 이후 EXECUTED 주문 USD 합산
        if (b.getDailyOrderUsd() != null && b.getDailyOrderUsd() > 0) {
            java.time.LocalDateTime since = java.time.LocalDate.now().atStartOfDay();
            java.math.BigDecimal todaySum = proposalRepo.sumExecutedUsdSince(uid, since);
            double todayTotal = todaySum == null ? 0.0 : todaySum.doubleValue();
            if (todayTotal + estUsd > b.getDailyOrderUsd()) {
                return ResponseEntity.status(HttpStatus.PRECONDITION_FAILED).body(Map.of(
                    "error", "일일 누적 한도(USD " + b.getDailyOrderUsd() + ") 초과: 오늘 " + todayTotal + " + 신규 " + estUsd));
            }
        }
        // M3: KIS KRW 일일 매수/매도 한도 — 자동 경로(ProposalExecutionService.execute)와 동일 정책 재사용해
        //     수동 주문 경로가 KRW 한도를 우회하던 문제(두번째 주문경로 우회)를 막는다.
        String krwViol = ProposalExecutionService.krwDailyLimitViolation(proposalRepo, b, req.side(), uid, estUsd);
        if (krwViol != null) {
            return ResponseEntity.status(HttpStatus.PRECONDITION_FAILED).body(Map.of("error", krwViol));
        }
        try {
            Broker.Side side = "SELL".equalsIgnoreCase(req.side()) ? Broker.Side.SELL : Broker.Side.BUY;
            BigDecimal qty = BigDecimal.valueOf(req.quantity());
            BigDecimal limit = req.limitPrice() == null ? null : BigDecimal.valueOf(req.limitPrice());
            Broker.OrderResult res = brokerRouter.forAccount(b).placeOrder(b, req.ticker().toUpperCase(), side, qty, limit);
            if (!res.ok()) {
                return ResponseEntity.status(HttpStatus.BAD_GATEWAY)
                        .body(Map.of("error", res.message() == null ? "주문 실패" : res.message(),
                                     "code", res.code() == null ? "" : res.code()));
            }
            log.info("[ORDER] user={} {} {} {} x{} @ {} → {}",
                    uid, b.getBrokerType(), side, req.ticker(), req.quantity(), req.limitPrice(), res.orderNo());
            Map<String, Object> out = new java.util.LinkedHashMap<>();
            out.put("ok", true);
            out.put("broker", b.getBrokerType().name());
            out.put("env", b.getEnv().name());
            out.put("order_no", res.orderNo());
            out.put("kis_order_no", res.orderNo());   // 하위호환(프론트가 kis_order_no 를 읽음)
            out.put("status_code", res.code());
            out.put("ticker", req.ticker().toUpperCase());
            out.put("side", side.name());
            out.put("quantity", req.quantity());
            return ResponseEntity.ok(out);
        } catch (Exception e) {
            log.warn("[ORDER] user={} failed: {}", uid, e.getMessage());
            return ResponseEntity.status(HttpStatus.BAD_GATEWAY)
                    .body(Map.of("error", "주문 실패: " + e.getMessage()));
        }
    }

    private static ResponseEntity<?> guard(BrokerAccount b, OrderReq req) {
        if (b == null) return ResponseEntity.status(HttpStatus.PRECONDITION_FAILED)
                .body(Map.of("error", "먼저 브로커 계좌를 등록하세요"));
        if (req == null || req.ticker() == null || req.ticker().isBlank())
            return ResponseEntity.badRequest().body(Map.of("error", "ticker 필수"));
        if (req.quantity() == null || req.quantity() <= 0)
            return ResponseEntity.badRequest().body(Map.of("error", "quantity는 0보다 커야 합니다"));
        if (req.side() == null || !(req.side().equalsIgnoreCase("BUY") || req.side().equalsIgnoreCase("SELL")))
            return ResponseEntity.badRequest().body(Map.of("error", "side는 BUY/SELL"));
        return null;
    }

    /** brokerType 지정 시 (user,brokerType,env) 정확 조회, 미지정 시 (user,env) 하위호환(KIS 가정). */
    private BrokerAccount resolve(Long uid, BrokerAccount.Env env, BrokerAccount.BrokerType brokerType) {
        if (brokerType != null) return brokerRepo.findByUserIdAndBrokerTypeAndEnv(uid, brokerType, env).orElse(null);
        return brokerRepo.findByUserIdAndBrokerTypeAndEnv(uid, BrokerAccount.BrokerType.KIS, env).orElse(null);
    }

    private static ResponseEntity<?> notRegistered(BrokerAccount.BrokerType brokerType) {
        String label = brokerType == BrokerAccount.BrokerType.BINANCE ? "Binance" : "KIS";
        return ResponseEntity.status(HttpStatus.PRECONDITION_FAILED)
                .body(Map.of("error", "먼저 " + label + " 계좌를 등록하세요"));
    }

    /** 현재가(last_price) — 시장가 명목가 추정·미리보기용. 실패 시 0. */
    private double currentPrice(BrokerAccount b, String ticker) {
        try {
            Map<String, Object> q = brokerRouter.forAccount(b).getQuote(b, ticker.trim().toUpperCase());
            Object lp = q.get("last_price");
            return lp instanceof Number n ? n.doubleValue() : Double.parseDouble(String.valueOf(lp));
        } catch (Exception e) {
            return 0.0;
        }
    }

    private static ResponseEntity<?> unauth() {
        return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(Map.of("error", "인증 필요"));
    }
}
