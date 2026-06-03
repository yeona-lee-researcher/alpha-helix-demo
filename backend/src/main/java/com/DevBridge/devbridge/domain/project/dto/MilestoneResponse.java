package com.DevBridge.devbridge.domain.project.dto;

import com.DevBridge.devbridge.domain.project.entity.ProjectMilestone;
import lombok.*;

import java.time.LocalDate;
import java.time.LocalDateTime;

@Getter
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class MilestoneResponse {

    private Long id;
    private Long projectId;
    private Integer seq;
    private String title;
    private String description;
    private String completionCriteria;
    private Long amount;
    private LocalDate startDate;
    private LocalDate endDate;
    private LocalDateTime submittedAt;
    private String submissionNote;
    private String submissionFileUrl;
    private LocalDateTime approvedAt;
    private String revisionReason;
    private String status;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;

    public static MilestoneResponse from(ProjectMilestone m) {
        return MilestoneResponse.builder()
                .id(m.getId())
                .projectId(m.getProjectId())
                .seq(m.getSeq())
                .title(m.getTitle())
                .description(m.getDescription())
                .completionCriteria(m.getCompletionCriteria())
                .amount(m.getAmount())
                .startDate(m.getStartDate())
                .endDate(m.getEndDate())
                .submittedAt(m.getSubmittedAt())
                .submissionNote(m.getSubmissionNote())
                .submissionFileUrl(m.getSubmissionFileUrl())
                .approvedAt(m.getApprovedAt())
                .revisionReason(m.getRevisionReason())
                .status(m.getStatus() == null ? null : m.getStatus().name())
                .createdAt(m.getCreatedAt())
                .updatedAt(m.getUpdatedAt())
                .build();
    }
}
