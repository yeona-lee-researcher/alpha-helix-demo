package com.DevBridge.devbridge.domain.ai.entity;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;

import java.time.LocalDateTime;

/**
 * Decision Log: 사용자/AI가 워크스페이스 안에서 한 모든 의사결정을 시간순 기록.
 * Human-AI Interaction 연구 + 캡스톤 결과물의 핵심 데이터.
 */
@Entity
@Table(name = "alpha_decision_log",
        indexes = @Index(name = "idx_alpha_decision_ws_created", columnList = "workspace_id, created_at"))
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class AlphaDecisionLog {

    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "workspace_id", nullable = false)
    private Long workspaceId;

    /** USER / AI / SYSTEM */
    @Column(nullable = false, length = 16)
    private String actor;

    /**
     * GOAL_DEFINED / STRATEGY_PROPOSED / PARAM_CHANGED / BACKTEST_RUN / TRUST_COMPUTED /
     * USER_REVISION / AI_SUGGEST / BRIEFING
     */
    @Column(nullable = false, length = 32)
    private String eventType;

    @Column(columnDefinition = "TEXT")
    private String summary;

    /** 자세한 변경/스냅샷 JSON (옵션) */
    @Lob @Column(columnDefinition = "LONGTEXT")
    private String payloadJson;

    @CreationTimestamp
    private LocalDateTime createdAt;
}
