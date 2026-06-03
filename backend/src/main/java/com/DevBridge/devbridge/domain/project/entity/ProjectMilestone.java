package com.DevBridge.devbridge.domain.project.entity;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.UpdateTimestamp;
import org.springframework.data.annotation.CreatedDate;
import org.springframework.data.jpa.domain.support.AuditingEntityListener;

import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * 진행 프로젝트의 마일스톤. 작업 단위 + 완료 기준 + 산출물 + 상태머신.
 */
@Entity
@Table(name = "PROJECT_MILESTONES")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
@EntityListeners(AuditingEntityListener.class)
public class ProjectMilestone {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "project_id", nullable = false)
    private Long projectId;

    /** 표시 순서 (1, 2, 3 ...) */
    @Column(nullable = false)
    private Integer seq;

    @Column(nullable = false, length = 200)
    private String title;

    @Column(columnDefinition = "TEXT")
    private String description;

    /** 완료 기준 (산출물 정의 / 통과 조건) */
    @Column(name = "completion_criteria", columnDefinition = "TEXT")
    private String completionCriteria;

    /** 단위 금액 (= 매칭된 에스크로 금액과 일치) */
    @Column(nullable = false)
    private Long amount;

    @Column(name = "start_date")
    private LocalDate startDate;

    @Column(name = "end_date")
    private LocalDate endDate;

    @Column(name = "submitted_at")
    private LocalDateTime submittedAt;

    @Column(name = "submission_note", columnDefinition = "TEXT")
    private String submissionNote;

    @Column(name = "submission_file_url", length = 1000)
    private String submissionFileUrl;

    @Column(name = "approved_at")
    private LocalDateTime approvedAt;

    @Column(name = "revision_reason", columnDefinition = "TEXT")
    private String revisionReason;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 30)
    @Builder.Default
    private MilestoneStatus status = MilestoneStatus.PENDING;

    @CreatedDate
    @Column(name = "created_at", updatable = false)
    private LocalDateTime createdAt;

    @UpdateTimestamp
    @Column(name = "updated_at")
    private LocalDateTime updatedAt;

    public enum MilestoneStatus {
        PENDING,                // 결제 전
        IN_PROGRESS,            // 결제(에스크로 보관) 후 작업 중
        SUBMITTED,              // 파트너 제출 → 클라이언트 검토
        REVISION_REQUESTED,     // 재작업 요청
        APPROVED,               // 승인 (에스크로 정산 트리거)
        COMPLETED               // 완료 (정산 완료)
    }
}
