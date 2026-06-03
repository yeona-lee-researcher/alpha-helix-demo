package com.DevBridge.devbridge.domain.strategy.entity;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * 주문 실행 감사 로그 (B3) — append-only, 절대 수정/삭제하지 않는다.
 *
 * <p>규제/세무/추적용: 실제로 KIS 로 나간 주문 시도(EXECUTED/EXEC_FAILED)를 불변 기록한다.
 * OrderProposal 은 상태가 바뀌지만(EXPIRED 등), 이 테이블은 "그 순간 무슨 주문이 나갔나"를 영구 보존.
 */
@Entity
@Table(name = "order_execution_audit", indexes = {
        @Index(name = "idx_oea_user", columnList = "user_id, created_at"),
        @Index(name = "idx_oea_proposal", columnList = "proposal_id"),
})
@Getter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class OrderExecutionAudit {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "user_id", nullable = false)
    private Long userId;

    @Column(name = "proposal_id")
    private Long proposalId;

    @Column(name = "broker_account_id", nullable = false)
    private Long brokerAccountId;

    /** MOCK | REAL */
    @Column(length = 8)
    private String env;

    @Column(length = 16)
    private String ticker;

    @Column(length = 8)
    private String side;

    private Integer qty;

    @Column(name = "limit_price", precision = 18, scale = 4)
    private BigDecimal limitPrice;

    @Column(name = "kis_order_no", length = 32)
    private String kisOrderNo;

    /** KIS 응답코드 (0=성공) */
    @Column(name = "rt_cd", length = 8)
    private String rtCd;

    @Column(name = "auto_executed")
    private Boolean autoExecuted;

    /** EXECUTED | EXEC_FAILED */
    @Column(length = 16)
    private String outcome;

    @Column(length = 500)
    private String detail;

    @CreationTimestamp
    @Column(name = "created_at", updatable = false)
    private LocalDateTime createdAt;
}
