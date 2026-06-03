package com.DevBridge.devbridge.domain.strategy.repository;

import com.DevBridge.devbridge.domain.strategy.entity.MarketOhlcDaily;
import org.springframework.data.jpa.repository.JpaRepository;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

public interface MarketOhlcDailyRepository extends JpaRepository<MarketOhlcDaily, Long> {

    List<MarketOhlcDaily> findByTickerAndTradeDateGreaterThanEqualOrderByTradeDateAsc(String ticker, LocalDate from);

    Optional<MarketOhlcDaily> findTopByTickerOrderByTradeDateDesc(String ticker);

    Optional<MarketOhlcDaily> findByTickerAndTradeDate(String ticker, LocalDate tradeDate);

    long countByTicker(String ticker);
}
