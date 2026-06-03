package com.DevBridge.devbridge.domain.project.entity;

import com.DevBridge.devbridge.domain.payment.entity.PaymentMethod;
import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.UpdateTimestamp;
import org.springframework.data.annotation.CreatedDate;
import org.springframework.data.jpa.domain.support.AuditingEntityListener;

import java.time.LocalDateTime;

/**
 * 에스크로 결제 (마일스톤 1:1). 클라이언트 → 플랫폼 보관 → 파트너 정산.
 * Mock 결제: 외부 PG 연동 없이 상태머신만 돌림.
 */
@Entity
@Table(name = "PROJECT_ESCROWS")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
@EntityListeners(AuditingEntityListener.class)
public class ProjectEscrow {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "project_id", nullable = false)
    private Long projectId;

    /** 매칭된 마일스톤 (보통 1:1, 없으면 NULL — 총 계약금 통합 결제용) */
    @Column(name = "milestone_id")
    private Long milestoneId;

    @Column(nullable = false)
    private Long amount;

    @Column(name = "payer_user_id", nullable = false)
    private Long payerUserId;

    @Column(name = "payee_user_id", nullable = false)
    private Long payeeUserId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 30)
    @Builder.Default
    private EscrowStatus status = EscrowStatus.PENDING;

    @Column(name = "payment_method", length = 50)
    private String paymentMethod;       // "CARD_MOCK" 등

    @Column(name = "payment_method_id")
    private Long paymentMethodId;       // 사용된 PaymentMethod row

    @Column(name = "payment_tx_id", length = 100)
    private String paymentTxId;         // Mock UUID

    @Column(name = "deposited_at")
    private LocalDateTime depositedAt;

    @Column(name = "released_at")
    private LocalDateTime releasedAt;

    @Column(name = "refunded_at")
    private LocalDateTime refundedAt;

    @CreatedDate
    @Column(name = "created_at", updatable = false)
    private LocalDateTime createdAt;

    @UpdateTimestamp
    @Column(name = "updated_at")
    private LocalDateTime updatedAt;

    public enum EscrowStatus {
        PENDING,             // 결제 전
        DEPOSITED,           // 보관 중
        RELEASE_REQUESTED,   // 정산 요청
        RELEASED,            // 정산 완료
        REFUNDED             // 환불
    }
}
