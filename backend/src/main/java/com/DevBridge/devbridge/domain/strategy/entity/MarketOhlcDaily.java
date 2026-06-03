package com.DevBridge.devbridge.domain.strategy.entity;

import jakarta.persistence.*;
import lombok.*;
import org.springframework.data.annotation.CreatedDate;
import org.springframework.data.jpa.domain.support.AuditingEntityListener;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * 미국 주식 일봉 OHLC 캐시.
 * Stooq/Yahoo/Polygon 어디서 받든 source 컬럼으로 출처만 구분.
 */
@Entity
@Table(name = "MARKET_OHLC_DAILY", uniqueConstraints = {
        @UniqueConstraint(name = "uq_ohlc_ticker_date", columnNames = {"ticker", "trade_date"})
}, indexes = {
        @Index(name = "ix_ohlc_ticker", columnList = "ticker")
})
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
@EntityListeners(AuditingEntityListener.class)
public class MarketOhlcDaily {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, length = 16)
    private String ticker;

    @Column(name = "trade_date", nullable = false)
    private LocalDate tradeDate;

    @Column(name = "open_px", precision = 18, scale = 4, nullable = false)
    private BigDecimal open;

    @Column(name = "high_px", precision = 18, scale = 4, nullable = false)
    private BigDecimal high;

    @Column(name = "low_px", precision = 18, scale = 4, nullable = false)
    private BigDecimal low;

    @Column(name = "close_px", precision = 18, scale = 4, nullable = false)
    private BigDecimal close;

    @Column(name = "volume")
    private Long volume;

    @Column(length = 16, nullable = false)
    private String source;

    @CreatedDate
    @Column(name = "created_at", updatable = false)
    private LocalDateTime createdAt;
}
