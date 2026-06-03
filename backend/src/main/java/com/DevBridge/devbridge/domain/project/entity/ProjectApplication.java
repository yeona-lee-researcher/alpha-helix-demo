package com.DevBridge.devbridge.domain.project.entity;

import com.DevBridge.devbridge.domain.user.entity.User;
import com.DevBridge.devbridge.domain.project.entity.Project;
import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

import java.time.LocalDateTime;

/**
 * 파트너의 프로젝트 지원 + 매칭/계약/완료 상태 라이프사이클을 담는 단일 테이블.
 * status 흐름: APPLIED → ACCEPTED/REJECTED → CONTRACTED → IN_PROGRESS → COMPLETED
 *                                       └→ WITHDRAWN(파트너 취소)
 */
@Entity
@Table(name = "PROJECT_APPLICATION",
       uniqueConstraints = {@UniqueConstraint(name = "uk_proj_partner", columnNames = {"project_id", "partner_user_id"})})
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class ProjectApplication {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "project_id", nullable = false)
    private Project project;

    /** 지원자(파트너) — User 직접 참조로 단순화. */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "partner_user_id", nullable = false)
    private User partnerUser;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    @Builder.Default
    private Status status = Status.APPLIED;

    @Column(columnDefinition = "TEXT")
    private String message;

    @CreationTimestamp
    @Column(name = "applied_at", updatable = false)
    private LocalDateTime appliedAt;

    @UpdateTimestamp
    @Column(name = "updated_at")
    private LocalDateTime updatedAt;

    public enum Status {
        APPLIED, ACCEPTED, REJECTED, CONTRACTED, IN_PROGRESS, COMPLETED, WITHDRAWN
    }
}
