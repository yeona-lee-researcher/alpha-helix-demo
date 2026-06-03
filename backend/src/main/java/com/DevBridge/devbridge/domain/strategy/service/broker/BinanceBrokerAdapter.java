package com.DevBridge.devbridge.domain.strategy.service.broker;

import com.DevBridge.devbridge.domain.strategy.entity.BrokerAccount;
import com.DevBridge.devbridge.domain.strategy.entity.OrderProposal;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.Map;

/**
 * Binance(현물) 어댑터 — 기존 {@link BinanceApiClient} 위임 + 크립토 시맨틱 처리.
 *
 * <p><b>안전</b>:
 * <ul>
 *   <li>FUTURES 모드는 주문 차단(테스트넷 미배선 + MOCK 선물이 실거래 fapi 로 나가는 위험). SPOT 만 지원.</li>
 *   <li>전역 kill-switch 를 어댑터에서도 재확인(BinanceApiClient 자체는 체크 안 함).</li>
 *   <li>LOT_SIZE/PRICE_FILTER/MIN_NOTIONAL 필터로 수량/가격을 절삭·검증해 거래소 거부를 방지.</li>
 * </ul>
 */
@Component
@RequiredArgsConstructor
@Slf4j
public class BinanceBrokerAdapter implements Broker {

    private final BinanceApiClient binance;
    private final TradingControlService tradingControl;

    @Override
    public BrokerAccount.BrokerType type() {
        return BrokerAccount.BrokerType.BINANCE;
    }

    @Override
    public OrderResult placeOrder(BrokerAccount b, String symbol, Side side, BigDecimal qty, BigDecimal limitPrice, OrderType orderType) {
        // 크립토(현물)는 LOC(장마감지정가) 개념이 없다 — orderType 은 LIMIT/MARKET 처럼 취급(limitPrice 유무로 결정).
        if (b.getBinanceMode() == BrokerAccount.BinanceMode.FUTURES) {
            return OrderResult.failure("FUTURES_DISABLED",
                    "Binance 선물(FUTURES) 주문은 현재 비활성화되어 있습니다 — 안전을 위해 SPOT(현물)만 지원합니다.");
        }
        if (tradingControl.isKillSwitchOn()) {
            return OrderResult.failure("KILL_SWITCH", "전역 거래 차단(kill-switch) 활성화 — 모든 주문 거부");
        }
        try {
            BinanceApiClient.SymbolFilters f = binance.getSymbolFilters(b, symbol);
            BigDecimal q = f.truncateQty(qty);
            if (q.signum() <= 0) {
                return OrderResult.failure("LOT_SIZE",
                        "주문 수량이 최소 주문 단위(" + f.minQty() + ") 미만입니다.");
            }
            String type = (limitPrice == null) ? "MARKET" : "LIMIT";
            String priceStr = null;
            BigDecimal refPrice = limitPrice;
            if (limitPrice != null) {
                BigDecimal pr = f.truncatePrice(limitPrice);
                priceStr = pr.toPlainString();
                refPrice = pr;
            } else {
                // 시장가: 명목가 검증용 현재가 (best-effort)
                try { refPrice = binance.getSpotPriceValue(b, symbol); } catch (Exception ignore) { }
            }
            if (f.minNotional() != null && refPrice != null) {
                BigDecimal notional = q.multiply(refPrice);
                if (notional.compareTo(f.minNotional()) < 0) {
                    return OrderResult.failure("MIN_NOTIONAL",
                            "주문 명목가($" + notional.setScale(2, RoundingMode.HALF_UP)
                                    + ")가 최소 주문금액($" + f.minNotional() + ") 미만입니다.");
                }
            }
            Map<String, Object> resp = binance.placeSpotOrder(b, symbol, side.name(), type, q.toPlainString(), priceStr);
            Object orderId = resp.get("orderId");
            if (orderId == null) {
                return OrderResult.failure("NO_ORDER_ID", "Binance 응답에 orderId 가 없습니다: " + resp);
            }
            String status = String.valueOf(resp.getOrDefault("status", ""));
            log.info("[Binance-ORDER] {} {} {} qty={} type={} → orderId={} status={}",
                    b.getEnv(), side, symbol, q.toPlainString(), type, orderId, status);
            return OrderResult.success(String.valueOf(orderId), status);
        } catch (Exception e) {
            return OrderResult.failure(null, BinanceApiClient.friendlyError(e.getMessage()));
        }
    }

    @Override
    public FillResult queryFill(BrokerAccount b, OrderProposal p) {
        if (b.getBinanceMode() == BrokerAccount.BinanceMode.FUTURES) {
            return FillResult.error("Binance 선물은 현재 미지원");
        }
        long orderId;
        try {
            orderId = Long.parseLong(p.getKisOrderNo());
        } catch (Exception e) {
            return FillResult.error("Binance orderId 파싱 실패: " + p.getKisOrderNo());
        }
        try {
            Map<String, Object> resp = binance.querySpotOrder(b, p.getTicker(), orderId);
            String status = String.valueOf(resp.getOrDefault("status", ""));
            BigDecimal executedQty = bd(resp.get("executedQty"));
            BigDecimal cqq = bd(resp.get("cummulativeQuoteQty"));
            BigDecimal avg = executedQty.signum() > 0 ? cqq.divide(executedQty, 8, RoundingMode.HALF_UP) : null;
            return FillResult.of(mapStatus(status), executedQty, avg);
        } catch (Exception e) {
            return FillResult.error("Binance 주문조회 실패: " + (e.getMessage() != null ? e.getMessage() : e.getClass().getSimpleName()));
        }
    }

    @Override
    public Map<String, Object> getBalance(BrokerAccount b) {
        return (b.getBinanceMode() == BrokerAccount.BinanceMode.FUTURES)
                ? binance.getFuturesBalance(b)
                : binance.getSpotBalance(b);
    }

    @Override
    public Map<String, Object> getQuote(BrokerAccount b, String symbol) {
        return binance.getSpotPrice(b, symbol);
    }

    /** Binance order status → 정규화 fillStatus. */
    private static String mapStatus(String s) {
        return switch (s) {
            case "FILLED" -> "FILLED";
            case "PARTIALLY_FILLED" -> "PARTIAL";
            case "NEW", "PENDING_NEW", "ACCEPTED" -> "OPEN";
            case "CANCELED", "EXPIRED", "REJECTED", "PENDING_CANCEL", "EXPIRED_IN_MATCH" -> "CANCELLED";
            default -> "UNKNOWN";
        };
    }

    private static BigDecimal bd(Object o) {
        try { return new BigDecimal(String.valueOf(o)); } catch (Exception e) { return BigDecimal.ZERO; }
    }
}
