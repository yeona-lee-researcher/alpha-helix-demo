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
 * 전략의 일별 상태 스냅샷. 백테스트 진행 중에는 in-memory로 유지하다가
 * 마지막 1건(또는 N건)만 DB에 저장. 실거래 모드에서는 매 영업일 1건씩 누적.
 */
@Entity
@Table(name = "STRATEGY_STATE", uniqueConstraints = {
        @UniqueConstraint(name = "uq_state_strategy_date", columnNames = {"strategy_id", "as_of_date"})
}, indexes = {
        @Index(name = "ix_state_strategy", columnList = "strategy_id")
})
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
@EntityListeners(AuditingEntityListener.class)
public class StrategyState {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "strategy_id", nullable = false)
    private Strategy strategy;

    @Column(name = "as_of_date", nullable = false)
    private LocalDate asOfDate;

    @Column(name = "cash_usd", precision = 18, scale = 4)
    private BigDecimal cashUsd;

    @Column(name = "shares", precision = 18, scale = 6)
    private BigDecimal shares;

    /** 평단 USD. 무한매수법 매도 시 0으로 리셋. */
    @Column(name = "avg_price_usd", precision = 18, scale = 4)
    private BigDecimal avgPriceUsd;

    @Column(name = "total_cost_usd", precision = 18, scale = 4)
    private BigDecimal totalCostUsd;

    /** VR 전용 — Pool 현금 USD */
    @Column(name = "pool_usd", precision = 18, scale = 4)
    private BigDecimal poolUsd;

    /** VR 전용 — 현재 V값 USD */
    @Column(name = "v_current_usd", precision = 18, scale = 4)
    private BigDecimal vCurrentUsd;

    /** VR 전용 — 다음 V값 USD */
    @Column(name = "v_next_usd", precision = 18, scale = 4)
    private BigDecimal vNextUsd;

    /** 평가금 USD = cash + shares*price (또는 pool + shares*price) */
    @Column(name = "equity_usd", precision = 18, scale = 4)
    private BigDecimal equityUsd;

    @UpdateTimestamp
    @Column(name = "updated_at")
    private LocalDateTime updatedAt;
}
