package com.DevBridge.devbridge.domain.ai.entity;

import com.DevBridge.devbridge.domain.strategy.entity.Strategy;
import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;

import java.time.LocalDateTime;

/**
 * 워크스페이스 안의 AI Chat 한 줄. (USER / MODEL)
 * Goal-to-Strategy 대화 + 이후 의사결정 토론 모두 여기 저장.
 */
@Entity
@Table(name = "alpha_chat_message",
        indexes = @Index(name = "idx_alpha_chat_ws_created", columnList = "workspace_id, created_at"))
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class AlphaChatMessage {

    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "workspace_id", nullable = false)
    private Long workspaceId;

    @Column(nullable = false, length = 16)
    private String role; // user / model

    @Lob @Column(nullable = false, columnDefinition = "TEXT")
    private String text;

    @CreationTimestamp
    private LocalDateTime createdAt;
}
