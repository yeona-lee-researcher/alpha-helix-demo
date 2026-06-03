package com.DevBridge.devbridge.domain.strategy.repository;

import com.DevBridge.devbridge.domain.strategy.entity.StrategyState;
import org.springframework.data.jpa.repository.JpaRepository;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

public interface StrategyStateRepository extends JpaRepository<StrategyState, Long> {

    Optional<StrategyState> findTopByStrategyIdOrderByAsOfDateDesc(Long strategyId);

    Optional<StrategyState> findByStrategyIdAndAsOfDate(Long strategyId, LocalDate asOfDate);

    List<StrategyState> findByStrategyIdOrderByAsOfDateAsc(Long strategyId);
}
