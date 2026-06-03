package com.DevBridge.devbridge.domain.strategy.service.broker;

import com.DevBridge.devbridge.domain.strategy.entity.BrokerAccount;
import com.DevBridge.devbridge.domain.strategy.entity.OrderProposal;
import com.DevBridge.devbridge.domain.strategy.repository.BrokerAccountRepository;
import com.DevBridge.devbridge.domain.strategy.repository.OrderProposalRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDateTime;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * B1: EXECUTED(주문 수락) 주문의 실제 체결 상태를 브로커별로 확인 ({@link BrokerRouter} 경유).
 *
 * <p>KIS: 미체결내역(inquire-nccs) 휴리스틱(목록에 있으면 OPEN/PARTIAL, 없으면 FILLED, 평균가 없음).
 * <br>Binance: {@code GET /api/v3/order} 로 실제 status(NEW/PARTIALLY_FILLED/FILLED/CANCELED) +
 * executedQty + 평균체결가(cummulativeQuoteQty/executedQty)를 정확히 반영.
 * 체결(FILLED/PARTIAL) 시 잔고 스냅샷(lastBalanceJson)도 브로커별로 자동 동기화(B2).
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class OrderFillService {

    private final OrderProposalRepository proposalRepo;
    private final BrokerAccountRepository brokerRepo;
    private final BrokerRouter brokerRouter;
    private final ObjectMapper om = new ObjectMapper();

    /** 단일 주문의 체결 상태를 폴링해 갱신 (브로커 라우팅). 결과 맵 {orderNo,fillStatus,filledQty,avgPrice,orderQty} 또는 {error}. */
    @Transactional
    public Map<String, Object> pollFill(OrderProposal p) {
        Map<String, Object> out = new LinkedHashMap<>();
        if (p.getKisOrderNo() == null || p.getKisOrderNo().isBlank()) {
            out.put("error", "주문번호 없음");
            return out;
        }
        BrokerAccount b = brokerRepo.findById(p.getBrokerAccountId()).orElse(null);
        if (b == null) { out.put("error", "broker account 없음"); return out; }

        Broker broker = brokerRouter.forAccount(b);
        Broker.FillResult fr = broker.queryFill(b, p);
        if (fr.error() != null) { out.put("error", fr.error()); return out; }

        p.setFillStatus(fr.fillStatus());
        if (fr.filledQty() != null) {
            p.setFilledQtyDecimal(fr.filledQty());
            p.setFilledQty(fr.filledQty().setScale(0, RoundingMode.DOWN).intValue());
        }
        if (fr.avgPrice() != null) p.setFillAvgPrice(fr.avgPrice());   // Binance 는 실제 평균체결가 제공 (KIS 휴리스틱은 null)
        p.setFillCheckedAt(LocalDateTime.now());
        proposalRepo.save(p);

        // B2: 체결(FILLED/PARTIAL) 시 잔고/포지션 자동 동기화 스냅샷 (best-effort — 실패해도 체결판정은 유지)
        if ("FILLED".equals(fr.fillStatus()) || "PARTIAL".equals(fr.fillStatus())) {
            try {
                Map<String, Object> bal = broker.getBalance(b);
                b.setLastBalanceJson(om.writeValueAsString(bal));
                b.setLastBalanceAt(LocalDateTime.now());
                brokerRepo.save(b);
                out.put("balanceSynced", true);
            } catch (Exception e) {
                out.put("balanceSyncError", e.getMessage() != null ? e.getMessage() : e.getClass().getSimpleName());
            }
        }

        BigDecimal orderQty = p.getQtyDecimal() != null ? p.getQtyDecimal()
                : BigDecimal.valueOf(p.getQty() == null ? 0 : p.getQty());
        out.put("orderNo", p.getKisOrderNo());
        out.put("fillStatus", fr.fillStatus());
        out.put("filledQty", fr.filledQty());
        out.put("avgPrice", fr.avgPrice());
        out.put("orderQty", orderQty);
        log.info("[OrderFill] proposal={} broker={} order={} → {} (filled={}/{})",
                p.getId(), b.getBrokerType(), p.getKisOrderNo(), fr.fillStatus(), fr.filledQty(), orderQty.toPlainString());
        return out;
    }
}
