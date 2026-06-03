package com.DevBridge.devbridge.domain.strategy.service;

import com.DevBridge.devbridge.domain.notification.service.EmailAlertService;
import com.DevBridge.devbridge.domain.ai.service.AlphaHelixService;
import com.DevBridge.devbridge.domain.strategy.entity.Strategy;
import com.DevBridge.devbridge.domain.ai.entity.AlphaWorkspace;
import com.DevBridge.devbridge.domain.strategy.entity.BrokerAccount;
import com.DevBridge.devbridge.domain.strategy.entity.DailySignal;
import com.DevBridge.devbridge.domain.strategy.entity.OrderProposal;
import com.DevBridge.devbridge.domain.ai.repository.AlphaWorkspaceRepository;
import com.DevBridge.devbridge.domain.strategy.repository.BrokerAccountRepository;
import com.DevBridge.devbridge.domain.strategy.repository.DailySignalRepository;
import com.DevBridge.devbridge.domain.strategy.repository.OrderProposalRepository;
import com.DevBridge.devbridge.domain.strategy.repository.StrategyRepository;
import com.DevBridge.devbridge.global.security.AuthContext;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;

/**
 * 매 평일 KST 22:30에 활성 전략 전체 백테스트 → 시그널 갱신 → 미발송 시그널 일괄 이메일.
 * 미국장 마감(KST 익일 새벽 6시)보다 앞서 발송되어 다음날 아침에 사용자가 행동할 수 있게 함.
 *
 * 추가 (Phase B-5): BUY 시그널이 발생한 전략의 user에게 BrokerAccount가 있고
 * tradingEnabled=true 면 PENDING OrderProposal 자동 생성. 사용자 승인 전엔 절대 전송 안 됨.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class DailySignalGenerator {

    private final StrategyRepository strategyRepo;
    private final BacktestService backtestService;
    private final EmailAlertService emailAlertService;
    private final MarketDataService marketDataService;
    private final DailySignalRepository signalRepo;
    private final BrokerAccountRepository brokerAccountRepo;
    private final OrderProposalRepository proposalRepo;
    private final AlphaWorkspaceRepository alphaWsRepo;
    private final AlphaHelixService alphaService; // 자동 재실행용
    private final com.DevBridge.devbridge.domain.strategy.service.broker.ProposalExecutionService exec; // 자동 체결
    private final com.DevBridge.devbridge.domain.strategy.service.broker.BrokerRouter brokerRouter; // 크립토 현재가 라우팅
    private final ObjectMapper om = new ObjectMapper();

    /** 매 평일 22:30 KST (월~금) */
    @Scheduled(cron = "0 30 22 * * MON-FRI", zone = "Asia/Seoul")
    public void runDaily() {
        log.info("[DailySignal] start");

        // 1) 시장 데이터 신선화 (혹시 07:00 잡이 실패했을 경우 대비)
        try { marketDataService.scheduledRefresh(); } catch (Exception e) {
            log.warn("[DailySignal] market refresh failed: {}", e.getMessage());
        }

        // 2) 활성 전략 전체 백테스트 → 시그널 upsert
        var actives = strategyRepo.findByActiveTrue();
        int ok = 0, fail = 0;
        for (var s : actives) {
            try {
                backtestService.runFor(s);
                ok++;
            } catch (Exception e) {
                fail++;
                log.warn("[DailySignal] {} failed: {}", s.getCode(), e.getMessage());
            }
        }
        log.info("[DailySignal] backtest done ok={} fail={}", ok, fail);

        // 3) 오늘자 미발송 시그널 일괄 이메일
        try {
            int sent = emailAlertService.dispatchPending(LocalDate.now());
            log.info("[DailySignal] dispatched {} signals", sent);
        } catch (Exception e) {
            log.error("[DailySignal] email dispatch failed: {}", e.getMessage());
        }

        // 4) BUY 시그널 → PENDING OrderProposal 자동 생성
        try {
            int created = createProposalsFor(LocalDate.now());
            log.info("[DailySignal] auto-proposals created={}", created);
        } catch (Exception e) {
            log.error("[DailySignal] proposal generation failed: {}", e.getMessage());
        }

        // 5) Alpha-Helix 워크스페이스(TESTED/LIVE) 자동 재실행: backtest+regime+trust+queue-orders
        try {
            int refreshed = refreshAlphaWorkspaces();
            log.info("[DailySignal] alpha workspaces refreshed={}", refreshed);
        } catch (Exception e) {
            log.error("[DailySignal] alpha refresh failed: {}", e.getMessage());
        }
    }

    /**
     * 활성 AlphaWorkspace(TESTED/LIVE) 각각을 소유자 권한으로 auto-run 재실행.
     * AuthContext는 해당 워크스페이스 user로 임시 설정. infinite_buying이면 queue-orders도 자동.
     */
    int refreshAlphaWorkspaces() {
        List<AlphaWorkspace> targets = alphaWsRepo.findByStatusIn(java.util.List.of("TESTED", "LIVE", "FORMALIZED"));
        int count = 0;
        for (AlphaWorkspace ws : targets) {
            if (ws.getStrategyConfigJson() == null) continue;
            try {
                Long wsUid = ws.getUser().getId();
                AuthContext.set(wsUid);
                alphaService.doAutoRun(ws.getId(), wsUid);
                count++;
            } catch (Exception e) {
                log.warn("[DailySignal] ws#{} auto-run failed: {}", ws.getId(), e.getMessage());
            } finally {
                AuthContext.clear();
            }
        }
        return count;
    }

    /**
     * 오늘자 BUY 시그널을 훑어 사용자의 활성 BrokerAccount(tradingEnabled=true) 1개에
     * PENDING OrderProposal 1건씩 생성. 같은 시그널로 중복 생성 방지.
     */
    int createProposalsFor(LocalDate asOf) {
        // strategy/user 즉시로딩 — open-in-view=false 비트랜잭션 컨텍스트에서 lazy 접근 방지.
        var todays = signalRepo.findByAsOfDateFetchStrategyUser(asOf);
        int created = 0;
        for (DailySignal sig : todays) {
            if (sig.getSignal() != DailySignal.Signal.BUY) continue;

            var strategy = sig.getStrategy();
            Long userId = strategy.getUser().getId();
            boolean crypto = isCrypto(strategy.getTicker());

            // 자산군에 맞는 거래가능 계정 — 크립토→Binance, 주식→KIS. REAL 우선.
            BrokerAccount target = pickTradingAccount(userId, crypto);
            if (target == null) continue; // 해당 브로커 거래가능 계정 없음 → 스킵

            // 수량 산정: 주식=정수(firstBuyShares), 크립토=명목가(USDT)/현재가 → 분수.
            int qtyInt;
            java.math.BigDecimal qtyDec = null;
            if (crypto) {
                double price = cryptoPrice(target, strategy.getTicker());
                if (price <= 0) { log.warn("[auto-proposal] {} 현재가 조회 실패 — 스킵", strategy.getTicker()); continue; }
                double orderUsdt = cryptoOrderUsdt(strategy);
                qtyDec = java.math.BigDecimal.valueOf(orderUsdt / price).setScale(8, java.math.RoundingMode.DOWN);
                if (qtyDec.signum() <= 0) { log.warn("[auto-proposal] {} 산정수량 0 — 스킵", strategy.getTicker()); continue; }
                qtyInt = 1; // NOT NULL placeholder (실수량은 qtyDecimal)
            } else {
                qtyInt = parseFirstBuyShares(strategy.getParamsJson());
            }

            // 중복 체크: 이 sourceSignalId로 이미 PENDING/APPROVED/EXECUTED 가 있으면 skip
            boolean dup = proposalRepo.findByUserIdOrderByCreatedAtDesc(userId).stream()
                    .anyMatch(p -> sig.getId().equals(p.getSourceSignalId())
                            && !"REJECTED".equals(p.getStatus())
                            && !"EXPIRED".equals(p.getStatus())
                            && !"EXEC_FAILED".equals(p.getStatus()));
            if (dup) continue;

            OrderProposal saved = proposalRepo.save(OrderProposal.builder()
                    .userId(userId)
                    .workspaceId(null) // Strategy↔Workspace 매핑은 별도 step에서. 일단 null.
                    .brokerAccountId(target.getId())
                    .ticker(strategy.getTicker())
                    .side("BUY")
                    .qty(qtyInt)
                    .qtyDecimal(qtyDec)
                    .source("SIGNAL")
                    .sourceSignalId(sig.getId())
                    .rationale("[" + strategy.getCode() + "] " + safe(sig.getTitle()))
                    .status("PENDING")
                    .expiresAt(LocalDateTime.now().plusHours(24))
                    .build());
            created++;

            // 자동 체결: 계정이 autoExecute=ON 이면 사람 승인 없이 즉시 실행한다.
            // 모든 안전 게이트(kill-switch·tradingEnabled·한도)는 ProposalExecutionService 가 강제하며,
            // REAL 계정의 autoExecute 는 활성화 시점에 MOCK 졸업 게이트(2주+20회)를 이미 통과한 상태다.
            if (Boolean.TRUE.equals(target.getAutoExecute())) {
                try {
                    var res = exec.execute(saved, target, true);
                    if (!res.ok()) {
                        log.warn("[auto-exec] proposal {} 자동체결 보류: {}", saved.getId(), res.error());
                    } else {
                        log.info("[auto-exec] proposal {} 자동체결 접수 ({} {} {})",
                                saved.getId(), saved.getSide(),
                                saved.getQtyDecimal() != null ? saved.getQtyDecimal().toPlainString() : saved.getQty(),
                                saved.getTicker());
                    }
                } catch (Exception e) {
                    log.error("[auto-exec] proposal {} 자동체결 예외", saved.getId(), e);
                }
            }
        }
        return created;
    }

    /** 자산군에 맞는 브로커(크립토→BINANCE, 주식→KIS)의 거래가능 계정. REAL 우선. */
    private BrokerAccount pickTradingAccount(Long userId, boolean crypto) {
        var want = crypto ? BrokerAccount.BrokerType.BINANCE : BrokerAccount.BrokerType.KIS;
        return brokerAccountRepo.findAllByUserIdOrderByEnvAsc(userId).stream()
                .filter(a -> Boolean.TRUE.equals(a.getTradingEnabled()))
                .filter(a -> a.getBrokerType() == want)
                .sorted((a, b) -> Boolean.compare(
                        b.getEnv() == BrokerAccount.Env.REAL, a.getEnv() == BrokerAccount.Env.REAL))
                .findFirst()
                .orElse(null);
    }

    /** 크립토 페어 판별 — 현재 SPOT 범위(…USDT). */
    private static boolean isCrypto(String ticker) {
        return ticker != null && ticker.toUpperCase().endsWith("USDT");
    }

    /** 크립토 1회 주문 명목가(USDT). paramsJson.orderUsdt 우선, 없으면 원금/splits. 최소 6(>minNotional 5). */
    private double cryptoOrderUsdt(Strategy s) {
        try {
            JsonNode n = om.readTree(s.getParamsJson());
            if (n.has("orderUsdt")) return Math.max(6.0, n.get("orderUsdt").asDouble());
            int splits = n.path("splits").asInt(40);
            double perOrder = (s.getPrincipalKrw() / 1300.0) / Math.max(1, splits);
            return Math.max(6.0, perOrder);
        } catch (Exception e) {
            return 6.0;
        }
    }

    /** 크립토 현재가(last_price) — Binance 어댑터 quote. 실패 시 0. */
    private double cryptoPrice(BrokerAccount acct, String ticker) {
        try {
            var q = brokerRouter.forAccount(acct).getQuote(acct, ticker);
            Object lp = q.get("last_price");
            return lp instanceof Number num ? num.doubleValue() : Double.parseDouble(String.valueOf(lp));
        } catch (Exception e) {
            return 0.0;
        }
    }

    private int parseFirstBuyShares(String paramsJson) {
        if (paramsJson == null || paramsJson.isBlank()) return 1;
        try {
            JsonNode node = om.readTree(paramsJson);
            int v = node.path("firstBuyShares").asInt(1);
            return Math.max(1, v);
        } catch (Exception e) {
            return 1;
        }
    }

    private String safe(String s) { return s == null ? "" : s; }
}
