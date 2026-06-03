package com.DevBridge.devbridge.domain.strategy.repository;

import com.DevBridge.devbridge.domain.strategy.entity.StrategyTrade;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;

public interface StrategyTradeRepository extends JpaRepository<StrategyTrade, Long> {

    List<StrategyTrade> findByStrategyIdOrderByTradeDateAscIdAsc(Long strategyId);

    List<StrategyTrade> findByStrategyIdAndSourceOrderByTradeDateAscIdAsc(Long strategyId, StrategyTrade.Source source);

    long countByStrategyIdAndSource(Long strategyId, StrategyTrade.Source source);

    @Modifying
    @Query("DELETE FROM StrategyTrade t WHERE t.strategy.id = :strategyId AND t.source = :source")
    int deleteByStrategyIdAndSource(@Param("strategyId") Long strategyId, @Param("source") StrategyTrade.Source source);
}
