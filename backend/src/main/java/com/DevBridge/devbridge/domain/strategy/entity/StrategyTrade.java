package com.DevBridge.devbridge.domain.strategy.entity;

import com.DevBridge.devbridge.domain.strategy.entity.Strategy;
import jakarta.persistence.*;
import lombok.*;
import org.springframework.data.annotation.CreatedDate;
import org.springframework.data.jpa.domain.support.AuditingEntityListener;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * 전략 매매 체결 1건. 백테스트 산출물도 동일 테이블에 source=BACKTEST로 저장.
 * 실거래 모드 도입 시 source=LIVE만 추가하면 됨 (스키마 무수정).
 */
@Entity
@Table(name = "STRATEGY_TRADE", indexes = {
        @Index(name = "ix_st_strategy_date", columnList = "strategy_id,trade_date"),
        @Index(name = "ix_st_source", columnList = "source")
})
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
@EntityListeners(AuditingEntityListener.class)
public class StrategyTrade {

    public enum Side { BUY, SELL }

    /** 주문 분류 — 무한매수: FIRST/LOC_AVG/LOC_UPPER/SELL_TARGET, VR: VR_INIT/VR_LOWER/VR_UPPER */
    public enum Kind { FIRST, LOC_AVG, LOC_UPPER, SELL_TARGET, VR_INIT, VR_LOWER, VR_UPPER }

    public enum Source { BACKTEST, LIVE, MANUAL }

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "strategy_id", nullable = false)
    private Strategy strategy;

    @Column(name = "trade_date", nullable = false)
    private LocalDate tradeDate;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 8)
    private Side side;

    @Enumerated(EnumType.STRING)
    @Column(length = 16)
    private Kind kind;

    /** USD 단가 (소수점 4자리까지) */
    @Column(name = "price_usd", precision = 18, scale = 4, nullable = false)
    private BigDecimal priceUsd;

    /** 주식 수량 (소수 가능 — VR은 분수주 시뮬레이션) */
    @Column(name = "shares", precision = 18, scale = 6, nullable = false)
    private BigDecimal shares;

    /** 매도 시 실현손익 USD */
    @Column(name = "pnl_usd", precision = 18, scale = 4)
    private BigDecimal pnlUsd;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 16)
    private Source source;

    @CreatedDate
    @Column(name = "created_at", updatable = false)
    private LocalDateTime createdAt;
}
