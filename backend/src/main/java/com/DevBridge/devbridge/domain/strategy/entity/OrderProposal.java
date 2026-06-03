package com.DevBridge.devbridge.domain.strategy.entity;

import com.DevBridge.devbridge.domain.strategy.entity.BrokerAccount;
import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * 자동 시그널 또는 수동 제안에서 생성된 "주문 제안".
 * 사용자가 명시적으로 승인하기 전까지는 절대 KIS로 전송되지 않는다.
 *
 * Lifecycle: PENDING → (APPROVED → EXECUTED | EXEC_FAILED) | REJECTED | EXPIRED
 *
 * 핵심 보안 원칙:
 *  1) 시그널이 자동으로 PENDING을 만들 수는 있어도, APPROVED→EXECUTED 전환은
 *     반드시 인증된 사용자의 명시적 액션을 거친다.
 *  2) BrokerAccount.tradingEnabled=false 면 EXECUTED 거부.
 *  3) expiresAt 지나면 SchedulerJob이 EXPIRED로 만든다.
 */
@Entity
@Table(name = "order_proposal", indexes = {
        @Index(name = "idx_op_user_status", columnList = "user_id, status"),
        @Index(name = "idx_op_workspace", columnList = "workspace_id"),
        @Index(name = "idx_op_expires", columnList = "expires_at"),
})
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class OrderProposal {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** 소유자 — Broker 계정 권한 검증의 1차 게이트 */
    @Column(name = "user_id", nullable = false)
    private Long userId;

    /** 어느 워크스페이스/전략에서 발생했나 (수동 제안이면 null 허용) */
    @Column(name = "workspace_id")
    private Long workspaceId;

    /** 어느 BrokerAccount로 보낼 건가 (반드시 user_id 소유) */
    @Column(name = "broker_account_id", nullable = false)
    private Long brokerAccountId;

    /** 종목 (해외주식 ticker, 예: SPY, AAPL, TQQQ) */
    @Column(nullable = false, length = 16)
    private String ticker;

    /** BUY | SELL */
    @Column(nullable = false, length = 8)
    private String side;

    /** 주문 수량 (정수 주식 수). 크립토 분수 수량은 {@link #qtyDecimal} 사용 — 이 값은 올림 placeholder. */
    @Column(nullable = false)
    private Integer qty;

    /**
     * 분수 주문 수량 (크립토용, 예: 0.0015 BTC). NULL 이면 KIS 정수 주문({@link #qty} 사용).
     * 실행/체결은 qtyDecimal 이 있으면 우선한다.
     */
    @Column(name = "qty_decimal", precision = 28, scale = 8)
    private BigDecimal qtyDecimal;

    /** 지정가 (null = 시장가) */
    @Column(name = "limit_price", precision = 18, scale = 4)
    private BigDecimal limitPrice;

    /** 주문 체결타입: LIMIT(지정가, 기본) | LOC(장마감지정가, 무한매수법 평단매수) | MARKET(보통가). */
    @Column(name = "order_type", nullable = false, length = 8)
    @Builder.Default
    private String orderType = "LIMIT";

    /** 어디서 발생했나: SIGNAL | MANUAL */
    @Column(nullable = false, length = 16)
    @Builder.Default
    private String source = "SIGNAL";

    /** 시그널이 만든 경우 ALPHA_SIGNAL.id 또는 SIGNAL.id 참조 (없으면 null) */
    @Column(name = "source_signal_id")
    private Long sourceSignalId;

    /** PENDING | APPROVED | REJECTED | EXECUTED | EXEC_FAILED | EXPIRED */
    @Column(nullable = false, length = 16)
    @Builder.Default
    private String status = "PENDING";

    /** 발생 사유/근거 한 줄 요약 (UI 표기용) */
    @Column(length = 500)
    private String rationale;

    /** EXECUTED일 때 KIS가 반환한 주문번호 (ODNO) */
    @Column(name = "kis_order_no", length = 32)
    private String kisOrderNo;

    /** EXEC_FAILED일 때 에러 메시지 */
    @Column(name = "exec_error", length = 500)
    private String execError;

    /** 만료 시각 — 보통 생성+24h. 지나면 SchedulerJob이 EXPIRED로 전환 */
    @Column(name = "expires_at")
    private LocalDateTime expiresAt;

    /** 사용자가 승인/거절/실행한 시각 */
    @Column(name = "decided_at")
    private LocalDateTime decidedAt;

    @Column(name = "executed_at")
    private LocalDateTime executedAt;

    /** true면 사람 승인 없이 자동 체결된 주문 (REAL 자동매매 졸업 게이트 집계에 사용). */
    @Column(name = "auto_executed", nullable = false)
    @Builder.Default
    private Boolean autoExecuted = false;

    // ───── B1 체결 확인 폴링 (KIS 미체결내역 조회로 갱신) ─────
    /** 실제 체결 상태: UNKNOWN | OPEN | PARTIAL | FILLED | CANCELLED. EXECUTED(주문수락)와 별개. */
    @Column(name = "fill_status", length = 16)
    private String fillStatus;

    /** 체결 수량 (정수 — 크립토 분수 체결은 {@link #filledQtyDecimal}). */
    @Column(name = "filled_qty")
    private Integer filledQty;

    /** 분수 체결 수량 (크립토용). NULL 이면 {@link #filledQty} 사용. */
    @Column(name = "filled_qty_decimal", precision = 28, scale = 8)
    private BigDecimal filledQtyDecimal;

    /** 평균 체결가 (USD) */
    @Column(name = "fill_avg_price", precision = 18, scale = 4)
    private BigDecimal fillAvgPrice;

    /** 마지막 체결 폴링 시각 */
    @Column(name = "fill_checked_at")
    private LocalDateTime fillCheckedAt;

    @CreationTimestamp
    @Column(name = "created_at", updatable = false)
    private LocalDateTime createdAt;

    @UpdateTimestamp
    @Column(name = "updated_at")
    private LocalDateTime updatedAt;
}
