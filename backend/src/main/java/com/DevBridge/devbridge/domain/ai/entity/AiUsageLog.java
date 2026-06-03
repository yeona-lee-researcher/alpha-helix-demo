package com.DevBridge.devbridge.domain.ai.entity;

import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDateTime;

/**
 * AI 호출 1회당 사용량 로그.
 * 월간 한도 계산 + Pro 결제 청구 근거.
 */
@Entity
@Table(name = "AI_USAGE_LOG", indexes = {
        @Index(name = "ix_aiusage_user_time", columnList = "user_id, created_at"),
        @Index(name = "ix_aiusage_user_model_time", columnList = "user_id, model_id, created_at")
})
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class AiUsageLog {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "user_id", nullable = false)
    private Long userId;

    @Column(name = "model_id", nullable = false, length = 100)
    private String modelId;

    /** 입력 토큰 */
    @Column(name = "tokens_in", nullable = false)
    private long tokensIn;

    /** 출력 토큰 */
    @Column(name = "tokens_out", nullable = false)
    private long tokensOut;

    /** 호출 성공 여부 */
    @Column(nullable = false)
    private boolean success;

    /** 실패 시 에러 메시지 (성공 시 null) */
    @Column(name = "error_message", length = 500)
    private String errorMessage;

    @Column(name = "created_at", updatable = false, nullable = false)
    private LocalDateTime createdAt;

    @PrePersist
    void onCreate() {
        if (createdAt == null) createdAt = LocalDateTime.now();
    }
}
