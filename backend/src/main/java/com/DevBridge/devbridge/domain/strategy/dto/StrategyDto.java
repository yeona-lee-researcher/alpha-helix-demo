package com.DevBridge.devbridge.domain.strategy.dto;

import com.DevBridge.devbridge.domain.strategy.entity.Strategy;

import java.time.LocalDate;
import java.time.LocalDateTime;

public record StrategyDto(
        Long id,
        String code,
        String name,
        Strategy.Method method,
        String ticker,
        String benchmark,
        Long principalKrw,
        LocalDate startDate,
        String regime,
        String goal,
        String paramsJson,
        Boolean active,
        LocalDateTime createdAt,
        LocalDateTime updatedAt
) {
    public static StrategyDto from(Strategy s) {
        return new StrategyDto(
                s.getId(), s.getCode(), s.getName(), s.getMethod(), s.getTicker(), s.getBenchmark(),
                s.getPrincipalKrw(), s.getStartDate(), s.getRegime(), s.getGoal(),
                s.getParamsJson(), s.getActive(), s.getCreatedAt(), s.getUpdatedAt()
        );
    }
}
