package com.DevBridge.devbridge.domain.strategy.dto;

import com.DevBridge.devbridge.domain.strategy.entity.StrategyBacktestSummary;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;

public record StrategyBacktestSummaryDto(
        Long id,
        Long strategyId,
        String strategyCode,
        String ticker,
        LocalDate asOfDate,
        BigDecimal cagrPct,
        BigDecimal mddPct,
        BigDecimal totalReturnPct,
        BigDecimal winRate,
        Integer trustScore,
        BigDecimal equityUsd,
        BigDecimal equityKrw,
        Integer tradesCount,
        LocalDateTime computedAt
) {
    public static StrategyBacktestSummaryDto from(StrategyBacktestSummary s) {
        var st = s.getStrategy();
        return new StrategyBacktestSummaryDto(
                s.getId(),
                st.getId(),
                st.getCode(),
                st.getTicker(),
                s.getAsOfDate(),
                s.getCagrPct(),
                s.getMddPct(),
                s.getTotalReturnPct(),
                s.getWinRate(),
                s.getTrustScore(),
                s.getEquityUsd(),
                s.getEquityKrw(),
                s.getTradesCount(),
                s.getComputedAt()
        );
    }
}
