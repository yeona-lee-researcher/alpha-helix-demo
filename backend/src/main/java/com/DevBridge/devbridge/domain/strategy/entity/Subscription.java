package com.DevBridge.devbridge.domain.strategy.entity;

import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDateTime;

/**
 * 사용자 구독 (Free / Pro).
 * Pro는 Toss 결제 1회당 1개월 ACTIVE → 만료 시 expiredAt 도달하면 FREE 강등.
 */
@Entity
@Table(name = "SUBSCRIPTION",
        uniqueConstraints = {
                // M8: 결제 confirm 멱등성 — 같은 Toss 결제키로 중복 구독이 생기지 않도록 DB 레벨 보장.
                @UniqueConstraint(name = "uq_subscription_toss_payment_key", columnNames = "toss_payment_key")
        },
        indexes = {
                @Index(name = "ix_sub_user_status", columnList = "user_id, status"),
                @Index(name = "ix_sub_user_expires", columnList = "user_id, expires_at")
        })
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Subscription {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "user_id", nullable = false)
    private Long userId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private Tier tier;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private Status status;

    /** Pro 시작일 (Free는 null) */
    @Column(name = "started_at")
    private LocalDateTime startedAt;

    /** Pro 만료 예정일 (Free는 null). 이 시간 이후엔 자동 EXPIRED 전환. */
    @Column(name = "expires_at")
    private LocalDateTime expiresAt;

    /** Toss 결제 키 (구독 결제 1회당) */
    @Column(name = "toss_payment_key", length = 200)
    private String tossPaymentKey;

    /** Toss 주문 ID */
    @Column(name = "toss_order_id", length = 100)
    private String tossOrderId;

    /** 결제 금액 (원) */
    @Column(name = "amount_krw")
    private Long amountKrw;

    @Column(name = "created_at", updatable = false, nullable = false)
    private LocalDateTime createdAt;

    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;

    @PrePersist
    void onCreate() {
        LocalDateTime now = LocalDateTime.now();
        if (createdAt == null) createdAt = now;
        if (updatedAt == null) updatedAt = now;
    }

    @PreUpdate
    void onUpdate() {
        updatedAt = LocalDateTime.now();
    }

    public enum Tier { FREE, PRO }

    public enum Status {
        /** Pro 활성 (expires_at 까지 사용 가능) */
        ACTIVE,
        /** Pro 만료 (자동 또는 사용자 취소) */
        EXPIRED,
        /** Free 기본 */
        FREE
    }
}
