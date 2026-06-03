package com.DevBridge.devbridge.domain.strategy.entity;

import com.DevBridge.devbridge.domain.strategy.entity.Strategy;
import jakarta.persistence.*;
import lombok.*;
import org.springframework.data.annotation.CreatedDate;
import org.springframework.data.jpa.domain.support.AuditingEntityListener;

import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * 매일 장 마감 후 전략별로 1건 생성되는 시그널.
 * BUY/HOLD/WATCH/PAUSE 4가지 + 사람이 읽는 title/summary/action 텍스트.
 */
@Entity
@Table(name = "DAILY_SIGNAL", uniqueConstraints = {
        @UniqueConstraint(name = "uq_signal_strategy_date", columnNames = {"strategy_id", "as_of_date"})
}, indexes = {
        @Index(name = "ix_signal_date", columnList = "as_of_date")
})
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
@EntityListeners(AuditingEntityListener.class)
public class DailySignal {

    public enum Signal { BUY, HOLD, WATCH, PAUSE }

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "strategy_id", nullable = false)
    private Strategy strategy;

    @Column(name = "as_of_date", nullable = false)
    private LocalDate asOfDate;

    @Enumerated(EnumType.STRING)
    @Column(name = "`signal`", nullable = false, length = 16)
    private Signal signal;

    @Column(nullable = false, length = 200)
    private String title;

    @Column(columnDefinition = "TEXT")
    private String summary;

    @Column(columnDefinition = "TEXT")
    private String action;

    /** 이메일 발송 시각. null이면 미발송. */
    @Column(name = "delivered_at")
    private LocalDateTime deliveredAt;

    @CreatedDate
    @Column(name = "created_at", updatable = false)
    private LocalDateTime createdAt;
}
