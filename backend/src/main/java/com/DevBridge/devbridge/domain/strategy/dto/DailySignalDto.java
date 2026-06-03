package com.DevBridge.devbridge.domain.strategy.dto;

import com.DevBridge.devbridge.domain.strategy.entity.DailySignal;

import java.time.LocalDate;
import java.time.LocalDateTime;

public record DailySignalDto(
        Long id,
        Long strategyId,
        String strategyCode,
        String ticker,
        LocalDate asOfDate,
        DailySignal.Signal signal,
        String title,
        String summary,
        String action,
        LocalDateTime deliveredAt
) {
    public static DailySignalDto from(DailySignal s) {
        var st = s.getStrategy();
        return new DailySignalDto(
                s.getId(),
                st.getId(),
                st.getCode(),
                st.getTicker(),
                s.getAsOfDate(),
                s.getSignal(),
                s.getTitle(),
                s.getSummary(),
                s.getAction(),
                s.getDeliveredAt()
        );
    }
}
