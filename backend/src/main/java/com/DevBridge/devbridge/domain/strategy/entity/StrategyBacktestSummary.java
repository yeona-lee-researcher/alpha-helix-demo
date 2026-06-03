package com.DevBridge.devbridge.domain.strategy.entity;

import com.DevBridge.devbridge.domain.strategy.entity.Strategy;
import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.UpdateTimestamp;
import org.springframework.data.jpa.domain.support.AuditingEntityListener;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * 전략별 백테스트 메트릭 캐시. 매번 재계산하면 무겁기 때문에
 * 새 일봉 들어올 때만 재실행하고 결과는 여기에 1건 upsert.
 */
@Entity
@Table(name = "STRATEGY_BACKTEST_SUMMARY", uniqueConstraints = {
        @UniqueConstraint(name = "uq_bt_strategy", columnNames = {"strategy_id"})
})
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
@EntityListeners(AuditingEntityListener.class)
public class StrategyBacktestSummary {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @OneToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "strategy_id", nullable = false)
    private Strategy strategy;

    @Column(name = "as_of_date", nullable = false)
    private LocalDate asOfDate;

    @Column(name = "cagr_pct", precision = 10, scale = 4)
    private BigDecimal cagrPct;

    @Column(name = "mdd_pct", precision = 10, scale = 4)
    private BigDecimal mddPct;

    @Column(name = "total_return_pct", precision = 10, scale = 4)
    private BigDecimal totalReturnPct;

    @Column(name = "win_rate", precision = 6, scale = 4)
    private BigDecimal winRate;

    @Column(name = "trust_score")
    private Integer trustScore;

    @Column(name = "equity_usd", precision = 18, scale = 4)
    private BigDecimal equityUsd;

    @Column(name = "equity_krw", precision = 18, scale = 2)
    private BigDecimal equityKrw;

    @Column(name = "trades_count")
    private Integer tradesCount;

    @UpdateTimestamp
    @Column(name = "computed_at")
    private LocalDateTime computedAt;
}
