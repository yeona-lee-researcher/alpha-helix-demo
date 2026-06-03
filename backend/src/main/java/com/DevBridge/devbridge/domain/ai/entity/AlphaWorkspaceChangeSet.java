package com.DevBridge.devbridge.domain.ai.entity;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

import java.time.LocalDateTime;

/**
 * Alpha Ezer 가 워크스페이스 설정을 라이브로 패치한 변경 묶음.
 * 사용자는 상단 바에서 "유지" 또는 "실행 취소" 가능.
 *  PENDING : 적용은 됐으나 사용자가 확정/취소를 누르지 않은 상태
 *  KEPT    : 사용자가 "유지" 확정 → 더 이상 실행취소 불가
 *  UNDONE  : 사용자가 "실행취소" → before_snapshot 으로 롤백 완료
 */
@Entity
@Table(name = "alpha_workspace_changeset",
        indexes = @Index(name = "idx_changeset_ws_created", columnList = "workspace_id, created_at"))
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class AlphaWorkspaceChangeSet {

    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "workspace_id", nullable = false)
    private Long workspaceId;

    @Column(length = 200)
    private String title;

    /** AI 가 보낸 ops 배열 원본 JSON: [{target, path, value}, ...] */
    @Lob @Column(name = "ops_json", columnDefinition = "LONGTEXT", nullable = false)
    private String opsJson;

    /** 적용 전 영향 받는 필드들의 스냅샷 JSON (롤백용) */
    @Lob @Column(name = "before_json", columnDefinition = "LONGTEXT")
    private String beforeJson;

    /** 적용 후 결과 스냅샷 JSON (디버그/감사용) */
    @Lob @Column(name = "after_json", columnDefinition = "LONGTEXT")
    private String afterJson;

    /** PENDING / KEPT / UNDONE */
    @Column(nullable = false, length = 16)
    @Builder.Default
    private String status = "PENDING";

    @CreationTimestamp
    private LocalDateTime createdAt;

    @UpdateTimestamp
    private LocalDateTime updatedAt;
}
