package com.DevBridge.devbridge.domain.strategy.repository;

import com.DevBridge.devbridge.domain.strategy.entity.StrategyBacktestSummary;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface StrategyBacktestSummaryRepository extends JpaRepository<StrategyBacktestSummary, Long> {

    Optional<StrategyBacktestSummary> findByStrategyId(Long strategyId);

    @org.springframework.data.jpa.repository.Query(
            "SELECT s FROM StrategyBacktestSummary s WHERE s.strategy.user.id = :userId"
    )
    List<StrategyBacktestSummary> findAllByUserId(@org.springframework.data.repository.query.Param("userId") Long userId);
}
