package com.DevBridge.devbridge.domain.strategy.service.broker;

import org.junit.jupiter.api.Test;

import java.math.BigDecimal;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Binance 거래소 필터(LOT_SIZE/PRICE_FILTER) 절삭 검증.
 *
 * <p>크립토 주문 실패의 1순위 원인은 수량/가격이 stepSize/tickSize 배수가 아닌 것. 실제 testnet BTCUSDT
 * 필터값(stepSize=0.00001000, tickSize=0.01000000, minNotional=5.0)으로 절삭 결과를 고정한다.
 */
class BinanceFiltersTest {

    private static BinanceApiClient.SymbolFilters btcUsdt() {
        // 2026-06-01 testnet.binance.vision/api/v3/exchangeInfo?symbol=BTCUSDT 실측값
        return new BinanceApiClient.SymbolFilters(
                new BigDecimal("0.00001000"),  // LOT_SIZE.stepSize
                new BigDecimal("0.01000000"),  // PRICE_FILTER.tickSize
                new BigDecimal("0.00001000"),  // LOT_SIZE.minQty
                new BigDecimal("5.00000000")); // NOTIONAL.minNotional
    }

    @Test
    void truncateQty_floorsToStepSize() {
        var f = btcUsdt();
        // 0.0012345 → 0.00001 배수로 내림 = 0.00123 (Binance 주문 페이로드 문자열도 검증)
        assertEquals("0.00123", f.truncateQty(new BigDecimal("0.0012345")).toPlainString());
        // 정확히 stepSize 배수면 값 보존
        assertEquals(0, f.truncateQty(new BigDecimal("0.00100")).compareTo(new BigDecimal("0.001")));
    }

    @Test
    void truncateQty_belowMinBecomesZero() {
        var f = btcUsdt();
        // stepSize(0.00001) 미만 → 0 (어댑터가 LOT_SIZE 로 거부)
        assertTrue(f.truncateQty(new BigDecimal("0.000005")).signum() == 0);
    }

    @Test
    void truncatePrice_floorsToTickSize() {
        var f = btcUsdt();
        assertEquals("73975.29", f.truncatePrice(new BigDecimal("73975.299")).toPlainString());
        assertEquals("73975.20", f.truncatePrice(new BigDecimal("73975.2099")).toPlainString());
    }

    @Test
    void integerStepSize_floorsToWhole() {
        // stepSize=1 (정수 수량 코인) → 2.7 코인은 2 로 절삭
        var f = new BinanceApiClient.SymbolFilters(
                new BigDecimal("1"), new BigDecimal("0.01"), new BigDecimal("1"), new BigDecimal("5"));
        assertEquals(0, f.truncateQty(new BigDecimal("2.7")).compareTo(new BigDecimal("2")));
    }

    @Test
    void nullFilters_passThrough() {
        var f = new BinanceApiClient.SymbolFilters(null, null, null, null);
        assertEquals(0, f.truncateQty(new BigDecimal("0.12345")).compareTo(new BigDecimal("0.12345")));
        assertEquals(0, f.truncatePrice(new BigDecimal("99.99")).compareTo(new BigDecimal("99.99")));
    }
}
