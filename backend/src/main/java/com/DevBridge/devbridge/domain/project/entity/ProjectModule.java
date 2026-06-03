package com.DevBridge.devbridge.domain.project.entity;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.UpdateTimestamp;
import org.springframework.data.annotation.CreatedDate;
import org.springframework.data.jpa.domain.support.AuditingEntityListener;

import java.time.LocalDateTime;

/**
 * 계약 세부 협의 7가지 모듈 데이터 (project_id + module_key UNIQUE).
 * module_key: scope, deliverable, schedule, payment, revision, completion, terms
 * status: 미확정 / 논의 중 / 제안됨 / 협의완료
 * data: 모듈별 임의 JSON (UI에서 렌더하는 contents)
 */
@Entity
@Table(
    name = "PROJECT_MODULES",
    uniqueConstraints = @UniqueConstraint(columnNames = {"project_id", "module_key"})
)
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
@EntityListeners(AuditingEntityListener.class)
public class ProjectModule {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "project_id", nullable = false)
    private Long projectId;

    /** scope / deliverable / schedule / payment / revision / completion / terms */
    @Column(name = "module_key", nullable = false, length = 32)
    private String moduleKey;

    /** 미확정 / 논의 중 / 제안됨 / 협의완료 */
    @Column(name = "status", nullable = false, length = 16)
    @Builder.Default
    private String status = "미확정";

    /** 마지막으로 제안/수정한 사용자 id (proposer) */
    @Column(name = "last_modifier_id")
    private Long lastModifierId;

    /** 마지막으로 제안/수정한 사용자 username (스냅샷) */
    @Column(name = "last_modifier_name", length = 100)
    private String lastModifierName;

    /** UI 콘텐츠 JSON (각 모듈마다 스키마 다름) */
    @Lob
    @Column(name = "data", columnDefinition = "JSON")
    private String data;

    @CreatedDate
    @Column(name = "created_at", updatable = false)
    private LocalDateTime createdAt;

    @UpdateTimestamp
    @Column(name = "updated_at")
    private LocalDateTime updatedAt;
}
