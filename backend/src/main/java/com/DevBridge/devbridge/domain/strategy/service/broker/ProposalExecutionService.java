package com.DevBridge.devbridge.domain.strategy.service.broker;

import com.DevBridge.devbridge.domain.ai.entity.AlphaDecisionLog;
import com.DevBridge.devbridge.domain.ai.repository.AlphaDecisionLogRepository;
import com.DevBridge.devbridge.domain.strategy.entity.BrokerAccount;
import com.DevBridge.devbridge.domain.strategy.entity.OrderExecutionAudit;
import com.DevBridge.devbridge.domain.strategy.entity.OrderProposal;
import com.DevBridge.devbridge.domain.strategy.repository.OrderExecutionAuditRepository;
import com.DevBridge.devbridge.domain.strategy.repository.OrderProposalRepository;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.Map;

/**
 * OrderProposal → 실제 KIS 주문 실행의 <b>단일 경로</b>.
 *
 * <p>수동 승인(OrderProposalController.approve)과 자동 체결(DailySignalGenerator auto-hook)이
 * 모두 이 서비스를 거치므로, 모든 안전 게이트가 한 곳에서만 정의되어 분기/누락이 없다:
 * <ul>
 *   <li>전역 kill-switch (TRADING_KILL_SWITCH)</li>
 *   <li>BrokerAccount.tradingEnabled 마스터 스위치</li>
 *   <li>1건당 한도(maxOrderUsd) · 일일 누적 한도(dailyOrderUsd)</li>
 *   <li>상태(PENDING)·만료 검증</li>
 * </ul>
 * REAL 자동매매 졸업 게이트(MOCK 2주+20회)는 활성화 시점(BrokerAccountController)에서 검증한다.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class ProposalExecutionService {

    private final OrderProposalRepository proposalRepo;
    private final AlphaDecisionLogRepository logRepo;
    private final BrokerRouter brokerRouter;
    private final TradingControlService tradingControl;
    private final OrderExecutionAuditRepository auditRepo;
    private final ObjectMapper om = new ObjectMapper();

    public record Result(boolean ok, String error, OrderProposal proposal) {}

    /**
     * 제안 실행. {@code auto=true} 면 자동 체결로 마킹(autoExecuted=true)한다.
     * 모든 안전 게이트를 통과해야만 KIS 로 주문이 나간다. 호출측은 소유권/인증을 먼저 검증해야 한다.
     */
    @Transactional
    public Result execute(OrderProposal p, BrokerAccount ba, boolean auto) {
        if (tradingControl.isKillSwitchOn()) {
            log.warn("[exec] kill-switch ON — 주문 거부 proposal={}", p.getId());
            return new Result(false, "전역 거래 차단(kill-switch) 활성화 — 모든 주문 거부", p);
        }
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

        Broker broker = brokerRouter.forAccount(ba);
        BigDecimal qtyEff = effectiveQty(p);

        // 1건당 한도 (시장가는 현재가로 추정 — KIS/크립토 공통, 시장가 한도우회 방지)
        double estUsd = estimateUsd(broker, ba, p, qtyEff);
        if (ba.getMaxOrderUsd() != null && ba.getMaxOrderUsd() > 0 && estUsd > ba.getMaxOrderUsd()) {
            return new Result(false, "1건당 한도(USD " + ba.getMaxOrderUsd() + ") 초과: 예상 " + estUsd, p);
        }
        // 일일 누적 한도
        if (ba.getDailyOrderUsd() != null && ba.getDailyOrderUsd() > 0) {
            BigDecimal todaySum = proposalRepo.sumExecutedUsdSince(p.getUserId(), LocalDate.now().atStartOfDay());
            double todayTotal = todaySum == null ? 0.0 : todaySum.doubleValue();
            if (todayTotal + estUsd > ba.getDailyOrderUsd()) {
                return new Result(false, "일일 누적 한도(USD " + ba.getDailyOrderUsd()
                        + ") 초과: 오늘 " + todayTotal + " + 신규 " + estUsd, p);
            }
        }

        // M3: KIS KRW 일일 매수/매도 한도 (KIS 는 KRW 한도 우선). USD 명목가를 근사 환율로 KRW 환산.
        //     dailyBuyKrw/dailySellKrw 는 설정만 되고 두 주문 경로 어디서도 집행되지 않던 dead 한도였다(32c121b).
        String krwViol = krwDailyLimitViolation(proposalRepo, ba, p.getSide(), p.getUserId(), estUsd);
        if (krwViol != null) return new Result(false, krwViol, p);

        // 손실 한도 서킷브레이커 (B3): B2 잔고스냅샷의 미실현 총손실이 한도 초과면 신규 매수 차단
        if ("BUY".equals(p.getSide()) && ba.getDailyLossLimitUsd() != null && ba.getDailyLossLimitUsd() > 0) {
            Double pnl = totalUnrealizedPnl(ba);
            if (pnl != null && pnl < -ba.getDailyLossLimitUsd()) {
                return new Result(false, "손실 한도 서킷브레이커: 미실현 손실 " + Math.round(-pnl)
                        + " USD 가 한도(" + ba.getDailyLossLimitUsd() + " USD) 초과 — 신규 매수 차단", p);
            }
        }

        // 마크 APPROVED → 즉시 EXECUTED 시도
        p.setStatus("APPROVED");
        p.setDecidedAt(LocalDateTime.now());
        p.setAutoExecuted(auto);
        proposalRepo.save(p);

        try {
            Broker.Side side = "BUY".equals(p.getSide()) ? Broker.Side.BUY : Broker.Side.SELL;
            Broker.OrderType otype;
            try { otype = Broker.OrderType.valueOf(p.getOrderType() == null ? "LIMIT" : p.getOrderType()); }
            catch (IllegalArgumentException ex) { otype = Broker.OrderType.LIMIT; }
            Broker.OrderResult res = broker.placeOrder(ba, p.getTicker(), side, qtyEff, p.getLimitPrice(), otype);
            if (!res.ok()) {
                p.setStatus("EXEC_FAILED");
                p.setExecError(res.code() != null ? "[" + res.code() + "] " + res.message() : res.message());
                proposalRepo.save(p);
                recordLog(p, auto, "ORDER_EXEC_FAILED", "주문 실행 실패: " + p.getExecError());
                recordAudit(p, ba, auto, "EXEC_FAILED", res.code(), p.getExecError());
                return new Result(false, res.message(), p);
            }
            p.setStatus("EXECUTED");
            p.setExecutedAt(LocalDateTime.now());
            p.setKisOrderNo(res.orderNo());
            proposalRepo.save(p);
            recordLog(p, auto, "ORDER_EXECUTED",
                    (auto ? "[자동] " : "") + "주문 체결 접수: " + p.getSide() + " " + qtyEff.toPlainString() + " " + p.getTicker()
                            + " (#" + p.getKisOrderNo() + ")");
            recordAudit(p, ba, auto, "EXECUTED", res.code(), null);
            return new Result(true, null, p);
        } catch (Exception e) {
            log.error("[exec] order failed proposal={}", p.getId(), e);
            p.setStatus("EXEC_FAILED");
            p.setExecError(e.getMessage());
            proposalRepo.save(p);
            recordAudit(p, ba, auto, "EXEC_FAILED", null, e.getMessage());
            return new Result(false, e.getMessage() != null ? e.getMessage() : e.getClass().getSimpleName(), p);
        }
    }

    /** 실행 수량: 분수(크립토)가 있으면 우선, 없으면 정수 qty. */
    private static BigDecimal effectiveQty(OrderProposal p) {
        if (p.getQtyDecimal() != null) return p.getQtyDecimal();
        return BigDecimal.valueOf(p.getQty() == null ? 0 : p.getQty());
    }

    /**
     * M3: KIS KRW 일일 매수/매도 한도 위반 검사. 위반 시 사용자 메시지, 아니면 null.
     * <p>KIS 계정에서만 적용된다(다른 브로커는 USD 한도 사용). {@code estUsd} 는 이번 주문의 명목가(USD)이며
     * 오늘 같은 side 로 EXECUTED 된 누적분과 합쳐 근사 환율로 KRW 환산 후 한도와 비교한다.
     * 수동 주문 경로(BrokerOrderController.place)도 이 메서드를 재사용해 두 경로의 한도 정책을 일치시킨다.
     */
    public static String krwDailyLimitViolation(OrderProposalRepository repo, BrokerAccount ba,
                                                String side, Long userId, double estUsd) {
        if (ba == null || ba.getBrokerType() != BrokerAccount.BrokerType.KIS) return null;
        boolean isBuy = "BUY".equalsIgnoreCase(side);
        Long krwLimit = isBuy ? ba.getDailyBuyKrw() : ba.getDailySellKrw();
        if (krwLimit == null || krwLimit <= 0) return null;
        BigDecimal sideSum = repo.sumExecutedUsdSinceBySide(userId, isBuy ? "BUY" : "SELL",
                LocalDate.now().atStartOfDay());
        double todayKrw = (sideSum == null ? 0.0 : sideSum.doubleValue()) * BrokerAccount.USD_KRW_APPROX;
        double newKrw = estUsd * BrokerAccount.USD_KRW_APPROX;
        if (todayKrw + newKrw > krwLimit) {
            return "KIS 일일 " + (isBuy ? "매수" : "매도") + " 한도(KRW " + krwLimit + ") 초과: 오늘 약 "
                    + Math.round(todayKrw) + " + 신규 약 " + Math.round(newKrw)
                    + " (USD→KRW " + (long) BrokerAccount.USD_KRW_APPROX + " 근사)";
        }
        return null;
    }

    /** 주문 추정 명목가(USD). 지정가는 그 값, 시장가는 현재가 조회로 추정(실패 시 0 — 기존 동작). */
    private double estimateUsd(Broker broker, BrokerAccount ba, OrderProposal p, BigDecimal qtyEff) {
        double price;
        if (p.getLimitPrice() != null) {
            price = p.getLimitPrice().doubleValue();
        } else {
            try {
                Map<String, Object> q = broker.getQuote(ba, p.getTicker());
                Object lp = q.get("last_price");
                price = lp instanceof Number n ? n.doubleValue() : Double.parseDouble(String.valueOf(lp));
            } catch (Exception e) {
                price = 0.0;
            }
        }
        return qtyEff.doubleValue() * price;
    }

    /** B3 감사로그 — 실제 KIS 로 나간 주문 시도(성공/실패)를 불변 기록. best-effort. */
    private void recordAudit(OrderProposal p, BrokerAccount ba, boolean auto, String outcome, String rtCd, String detail) {
        try {
            // 크립토 분수 수량은 audit.qty(정수)로 표현 불가 → detail 에 실제 수량/심볼을 기록해 감사 충실성 유지.
            String effDetail = detail;
            if (effDetail == null && p.getQtyDecimal() != null) {
                effDetail = ba.getBrokerType() + " " + p.getSide() + " " + p.getQtyDecimal().toPlainString() + " " + p.getTicker();
            }
            auditRepo.save(OrderExecutionAudit.builder()
                    .userId(p.getUserId()).proposalId(p.getId()).brokerAccountId(ba.getId())
                    .env(ba.getEnv() == null ? null : ba.getEnv().name())
                    .ticker(p.getTicker()).side(p.getSide()).qty(p.getQty()).limitPrice(p.getLimitPrice())
                    .kisOrderNo(p.getKisOrderNo()).rtCd(rtCd).autoExecuted(auto).outcome(outcome)
                    .detail(effDetail == null ? null : (effDetail.length() > 500 ? effDetail.substring(0, 500) : effDetail))
                    .build());
        } catch (Exception e) {
            log.warn("[audit] 기록 실패 proposal={}: {}", p.getId(), e.getMessage());
        }
    }

    /** B3: B2 잔고스냅샷(lastBalanceJson)에서 미실현 총손익(USD). total_market_value_usd=KIS tot_evlu_pfls_amt. */
    private Double totalUnrealizedPnl(BrokerAccount ba) {
        if (ba.getLastBalanceJson() == null || ba.getLastBalanceJson().isBlank()) return null;
        try {
            JsonNode n = om.readTree(ba.getLastBalanceJson());
            return n.path("total_market_value_usd").asDouble(0);
        } catch (Exception e) {
            return null;
        }
    }

    private void recordLog(OrderProposal p, boolean auto, String type, String summary) {
        if (p.getWorkspaceId() == null) return;
        try {
            logRepo.save(AlphaDecisionLog.builder()
                    .workspaceId(p.getWorkspaceId()).actor(auto ? "AUTO" : "USER").eventType(type)
                    .summary(summary).build());
        } catch (Exception ignore) { }
    }

    /** KIS msg_cd → 사용자 친화 메시지. */
    public static String friendlyKisError(String msgCd, String msg, BrokerAccount ba) {
        String envLabel = ba != null && ba.getEnv() == BrokerAccount.Env.REAL ? "실전" : "모의";
        if ("EGW00202".equals(msgCd)) {
            return "KIS GW 라우팅 오류(EGW00202): 거래소 코드를 모두 시도했지만 라우팅이 실패했습니다. "
                    + "현재 " + envLabel + "계좌 기준 미국 정규장이 닫혀있거나, " + envLabel + "투자에서 거래 불가 종목일 수 있습니다.";
        }
        if ("EGW00201".equals(msgCd)) {
            return "KIS 초당 거래건수 초과(EGW00201): 잠시 후 다시 시도하세요.";
        }
        if ("EGW00105".equals(msgCd)) {
            return "KIS 인증 만료(EGW00105): 브로커 설정에서 토큰을 재발급하세요.";
        }
        return "KIS 주문 거부 (msg_cd=" + msgCd + "): " + msg;
    }
}
