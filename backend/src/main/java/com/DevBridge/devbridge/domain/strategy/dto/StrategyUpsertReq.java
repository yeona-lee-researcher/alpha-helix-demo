package com.DevBridge.devbridge.domain.strategy.dto;

import com.DevBridge.devbridge.domain.strategy.entity.Strategy;

import java.time.LocalDate;

public record StrategyUpsertReq(
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
        Boolean active
) {}
