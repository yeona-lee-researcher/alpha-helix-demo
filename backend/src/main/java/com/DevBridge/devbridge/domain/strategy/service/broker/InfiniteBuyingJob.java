package com.DevBridge.devbridge.domain.strategy.service.broker;

import com.DevBridge.devbridge.domain.strategy.entity.BrokerAccount;
import com.DevBridge.devbridge.domain.strategy.entity.InfiniteBuyingSubscription;
import com.DevBridge.devbridge.domain.strategy.entity.OrderProposal;
import com.DevBridge.devbridge.domain.strategy.repository.InfiniteBuyingSubscriptionRepository;
import com.DevBridge.devbridge.domain.strategy.repository.OrderProposalRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

/**
 * 무한매수법(라오어식) 자동 발주 스케줄러.
 *
 * 한국시간 평일 22:00 (미국 정규장 개장 30분 전) 1회 실행.
 *
 * 각 활성 구독에 대해:
 *  1) 현재가 조회
 *  2) 보유 평단가 조회 (없으면 현재가를 평단가로 가정 — 첫 매수)
 *  3) 하루 매수액 = seed_usd / split_count
 *  4) 평단가 매수(LOC 지정가=평단가) + 큰수매수(LOC 지정가=평단가*(1+premium/100)) 각각 절반
 *  5) 익절 매도(SELL 지정가=평단가*(1+take_profit/100)) — 보유 수량 전체
 *  6) 각각 OrderProposal PENDING 으로 생성 (사용자 승인 후에만 KIS로 실제 전송)
 *
 * ⚠️ 안전장치
 *  - 절대 자동 EXECUTED로 만들지 않는다. 항상 PENDING.
 *  - BrokerAccount.tradingEnabled=false면 스킵.
 *  - 같은 날 lastRunAt이 이미 오늘이면 중복 실행 방지.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class InfiniteBuyingJob {

    private final InfiniteBuyingSubscriptionRepository subRepo;
    private final OrderProposalRepository proposalRepo;
    private final KisApiClient kis;

    /** 한국시간 평일 22:00 — 미국 정규장(23:30) 개장 90분 전 */
    @Scheduled(cron = "0 0 22 * * MON-FRI", zone = "Asia/Seoul")
    @Transactional
    public void runDaily() {
        List<InfiniteBuyingSubscription> subs = subRepo.findByActiveTrue();
        log.info("[InfiniteBuyingJob] start — active subscriptions = {}", subs.size());
        for (InfiniteBuyingSubscription s : subs) {
            try {
                processOne(s);
            } catch (Exception ex) {
                log.warn("[InfiniteBuyingJob] sub={} fail: {}", s.getId(), ex.getMessage());
                s.setLastRunMsg("FAIL: " + safeShort(ex.getMessage(), 480));
                subRepo.save(s);
            }
        }
        log.info("[InfiniteBuyingJob] done");
    }

    /** 수동 트리거 — REST에서 호출. 단일 구독 실행. */
    @Transactional
    public void runNow(InfiniteBuyingSubscription s) {
        processOne(s);
    }

    private void processOne(InfiniteBuyingSubscription s) {
        BrokerAccount b = s.getBrokerAccount();
        if (b == null) { skip(s, "brokerAccount=null"); return; }
        if (!Boolean.TRUE.equals(b.getTradingEnabled())) { skip(s, "tradingEnabled=false"); return; }
        if (s.getCurrentSplitRound() != null && s.getCurrentSplitRound() >= s.getSplitCount()) {
            skip(s, "사이클 완주 (" + s.getCurrentSplitRound() + "/" + s.getSplitCount() + ") — 익절 또는 수동 리셋 대기");
            return;
        }
        // 같은 날 중복 실행 방지
        if (s.getLastRunAt() != null && s.getLastRunAt().toLocalDate().equals(LocalDateTime.now().toLocalDate())) {
            skip(s, "already ran today");
            return;
        }

        Map<String, Object> q = kis.getOverseasQuote(b, s.getTicker());
        double last = ((Number) q.getOrDefault("last_price", 0.0)).doubleValue();
        if (last <= 0) { skip(s, "현재가 0 — 시세 조회 실패"); return; }

        // 평단가 조회: 잔고에서 해당 ticker 평단
        Double avgPrice = null;
        Integer holdingQty = 0;
        try {
            Map<String, Object> bal = kis.getOverseasBalance(b);
            @SuppressWarnings("unchecked")
            List<Map<String, Object>> positions = (List<Map<String, Object>>) bal.getOrDefault("positions", List.of());
            for (Map<String, Object> p : positions) {
                if (s.getTicker().equalsIgnoreCase(String.valueOf(p.get("ticker")))) {
                    avgPrice = ((Number) p.getOrDefault("avg_price", 0.0)).doubleValue();
                    holdingQty = ((Number) p.getOrDefault("qty", 0)).intValue();
                    break;
                }
            }
        } catch (Exception ex) {
            log.warn("[InfiniteBuyingJob] balance fetch fail sub={}: {}", s.getId(), ex.getMessage());
        }
        // 첫 매수면 평단가 = 현재가
        if (avgPrice == null || avgPrice <= 0) avgPrice = last;

        int createdCount = 0;

        // 하루 매수 금액 (USD)
        double dailyBudget = s.getSeedUsd() / s.getSplitCount();
        double avgPriceBuyBudget = dailyBudget * s.getDailyBuySplitRatio();
        double bigBuyBudget = dailyBudget - avgPriceBuyBudget;
        double premiumPrice = avgPrice * (1.0 + s.getBigBuyPremiumPct() / 100.0);

        // 평단가 LOC 매수
        int avgQty = (int) Math.floor(avgPriceBuyBudget / avgPrice);
        if (avgQty > 0) {
            createPending(s, b, "BUY", avgQty, avgPrice,
                    String.format("[AUTO][무한매수] 평단가 LOC 매수 %d주 @ $%.2f (round %d/%d)",
                            avgQty, avgPrice, s.getCurrentSplitRound() + 1, s.getSplitCount()), "LOC");
            createdCount++;
        }

        // 두 번째 절반: LOC 평단×(1+premium)
        int bigQty = (int) Math.floor(bigBuyBudget / premiumPrice);
        if (bigQty > 0) {
            createPending(s, b, "BUY", bigQty, premiumPrice,
                    String.format("[AUTO][무한매수] 큰수 LOC 매수 %d주 @ $%.2f (+%.0f%%)",
                            bigQty, premiumPrice, s.getBigBuyPremiumPct()), "LOC");
            createdCount++;
        }

        // 익절 지정가 매도: 평단×(1+take_profit) 전량
        if (holdingQty != null && holdingQty > 0) {
            double sellPrice = avgPrice * (1.0 + s.getTakeProfitPct() / 100.0);
            createPending(s, b, "SELL", holdingQty, sellPrice,
                    String.format("[AUTO][무한매수] 익절 지정가 매도 %d주 @ $%.2f (+%.0f%%)",
                            holdingQty, sellPrice, s.getTakeProfitPct()), "LIMIT");
            createdCount++;
        }

        s.setCurrentSplitRound(s.getCurrentSplitRound() + 1);
        s.setLastRunAt(LocalDateTime.now());
        s.setLastRunMsg(String.format("OK[무한매수]: proposals=%d, round=%d/%d, avg=$%.2f, last=$%.2f",
                createdCount, s.getCurrentSplitRound(), s.getSplitCount(),
                avgPrice, last));
        subRepo.save(s);
    }

    private void createPending(InfiniteBuyingSubscription s, BrokerAccount b,
                               String side, int qty, double limitPrice, String rationale, String orderType) {
        OrderProposal p = OrderProposal.builder()
                .userId(b.getUser().getId())
                .brokerAccountId(b.getId())
                .ticker(s.getTicker())
                .side(side)
                .qty(qty)
                .limitPrice(BigDecimal.valueOf(limitPrice).setScale(4, RoundingMode.HALF_UP))
                .orderType(orderType)
                .source("SIGNAL")
                .status("PENDING")
                .rationale(rationale)
                .expiresAt(LocalDateTime.now().plusHours(20))
                .build();
        proposalRepo.save(p);
    }

    private void skip(InfiniteBuyingSubscription s, String reason) {
        log.info("[InfiniteBuyingJob] skip sub={} ticker={}: {}", s.getId(), s.getTicker(), reason);
        s.setLastRunAt(LocalDateTime.now());
        s.setLastRunMsg("SKIP: " + reason);
        subRepo.save(s);
    }

    private String safeShort(String v, int max) {
        if (v == null) return "";
        return v.length() <= max ? v : v.substring(0, max);
    }
}
