package com.DevBridge.devbridge.domain.strategy.entity;

import com.DevBridge.devbridge.domain.user.entity.User;
import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.UpdateTimestamp;
import org.springframework.data.annotation.CreatedDate;
import org.springframework.data.jpa.domain.support.AuditingEntityListener;

import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * Alpha-Helix 투자 전략 정의.
 * 사용자 1명이 N개의 전략을 운영. 각 전략은 단일 종목 + 단일 method.
 */
@Entity
@Table(name = "STRATEGY", indexes = {
        @Index(name = "ix_strategy_user", columnList = "user_id"),
        @Index(name = "ix_strategy_active", columnList = "active")
})
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
@EntityListeners(AuditingEntityListener.class)
public class Strategy {

    public enum Method { INFINITE_BUY, VALUE_REBALANCING }

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user_id", nullable = false)
    private User user;

    /** 사용자 정의 코드 (예: STR-TQQQ-INF). 사용자별 unique. */
    @Column(name = "code", length = 64, nullable = false)
    private String code;

    @Column(nullable = false, length = 100)
    private String name;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 32)
    private Method method;

    @Column(nullable = false, length = 16)
    private String ticker;

    @Column(length = 16)
    private String benchmark;

    /** 원금 (KRW). 절대 다른 전략과 섞지 않는다는 규칙을 DB 레벨로 강제. */
    @Column(name = "principal_krw", nullable = false)
    private Long principalKrw;

    @Column(name = "start_date", nullable = false)
    private LocalDate startDate;

    @Column(length = 64)
    private String regime;

    @Column(columnDefinition = "TEXT")
    private String goal;

    /**
     * method별 파라미터를 JSON으로 보관.
     * - INFINITE_BUY: {"splits":40,"sellTargetPct":10,"locUpperPct":12,"firstBuyShares":1}
     * - VALUE_REBALANCING: {"rebalanceDays":10,"expectedReturn":0.02,"bandPct":0.20,"poolTargetPct":0.50,"biweeklyContribKrw":0,"initialPoolPct":0.50}
     */
    @Column(name = "params_json", columnDefinition = "JSON", nullable = false)
    private String paramsJson;

    @Column(nullable = false)
    @Builder.Default
    private Boolean active = true;

    @CreatedDate
    @Column(name = "created_at", updatable = false)
    private LocalDateTime createdAt;

    @UpdateTimestamp
    @Column(name = "updated_at")
    private LocalDateTime updatedAt;
}
