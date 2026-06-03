package com.DevBridge.devbridge.domain.strategy.dto;

import com.DevBridge.devbridge.domain.strategy.entity.BrokerAccount;

import java.time.LocalDateTime;

/** 응답용 — 절대 appsecret이나 평문 키 포함 금지. */
public record BrokerAccountDto(
        Long id,
        BrokerAccount.Env env,
        BrokerAccount.BrokerType brokerType,
        // KIS
        String appKeyMasked,
        String cano,
        String acntPrdtCd,
        // Binance
        String binanceApiKeyMasked,
        BrokerAccount.BinanceMode binanceMode,
        // 공통
        Long maxOrderUsd,
        Long dailyOrderUsd,
        // KIS 전용 (KRW)
        Long dailyBuyKrw,
        Long dailySellKrw,
        Boolean tradingEnabled,
        Boolean autoExecute,
        Boolean realRiskAcknowledged,
        LocalDateTime lastVerifiedAt,
        LocalDateTime createdAt
) {
    public static BrokerAccountDto from(BrokerAccount b) {
        return new BrokerAccountDto(
                b.getId(),
                b.getEnv(),
                b.getBrokerType(),
                mask(b.getAppKey()),
                b.getCano(),
                b.getAcntPrdtCd(),
                mask(b.getBinanceApiKey()),
                b.getBinanceMode(),
                b.getMaxOrderUsd(),
                b.getDailyOrderUsd(),
                b.getDailyBuyKrw(),
                b.getDailySellKrw(),
                b.getTradingEnabled(),
                b.getAutoExecute(),
                b.getRealRiskAcknowledged(),
                b.getLastVerifiedAt(),
                b.getCreatedAt()
        );
    }

    private static String mask(String v) {
        if (v == null || v.isBlank()) return null;
        if (v.length() <= 8) return "********";
        return v.substring(0, 4) + "****" + v.substring(v.length() - 4);
    }
}
