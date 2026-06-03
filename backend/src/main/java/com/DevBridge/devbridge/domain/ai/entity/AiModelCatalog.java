package com.DevBridge.devbridge.domain.ai.entity;

import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDateTime;

/**
 * 사용 가능한 AI 모델 카탈로그.
 * Free/Pro 구독별 월간 토큰 한도와 활성 여부를 보유.
 */
@Entity
@Table(name = "AI_MODEL_CATALOG")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class AiModelCatalog {

    /** 모델 식별자 (예: "gemini-2.5-flash", "claude-sonnet-4", "gpt-5", "perplexity-sonar") */
    @Id
    @Column(name = "model_id", length = 100)
    private String modelId;

    /** UI에 노출되는 이름 (예: "Claude Sonnet 4", "Perplexity Sonar Pro") */
    @Column(name = "display_name", nullable = false, length = 100)
    private String displayName;

    /** 프로바이더: GEMINI / ANTHROPIC / OPENAI / PERPLEXITY */
    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private Provider provider;

    /** 강점 한 줄 설명 ("코드/전략 정밀", "범용 빠름" 등) */
    @Column(length = 200)
    private String strength;

    /** Free 사용자 월간 토큰 한도. 0이면 Free 사용 불가. */
    @Column(name = "free_quota", nullable = false)
    private long freeQuota;

    /** Pro 사용자 월간 토큰 한도. -1이면 무제한. */
    @Column(name = "pro_quota", nullable = false)
    private long proQuota;

    /** UI 정렬 순서 (작을수록 위) */
    @Column(name = "sort_order", nullable = false)
    private int sortOrder;

    /** 비활성화 토글 */
    @Column(nullable = false)
    private boolean enabled;

    @Column(name = "created_at", updatable = false)
    private LocalDateTime createdAt;

    @PrePersist
    void onCreate() {
        if (createdAt == null) createdAt = LocalDateTime.now();
    }

    public enum Provider {
        GEMINI, ANTHROPIC, OPENAI, PERPLEXITY
    }
}
