package com.DevBridge.devbridge.domain.project.dto;

import com.DevBridge.devbridge.domain.project.entity.Project;
import com.DevBridge.devbridge.domain.project.entity.ProjectApplication;
import lombok.*;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;

@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class ProjectApplicationResponse {
    private Long id;
    private Long projectId;
    private String projectTitle;
    private String projectDesc;
    private String projectSlogan;
    private String projectServiceField;
    private List<String> projectSkills;
    private LocalDate projectStartDate;
    private LocalDate projectDeadline;
    private Integer projectDurationMonths;
    private Integer projectBudgetMin;
    private Integer projectBudgetMax;
    private String projectStatus; // Project.status (RECRUITING/IN_PROGRESS/...)
    private Long projectOwnerUserId;
    private String projectOwnerUsername;

    private Long partnerUserId;
    private String partnerUsername;  // 파트너 표시명 (users.username)
    private Long partnerProfileId;  // PartnerProfile.id (있다면)

    private String status;          // ProjectApplication.Status
    private String message;
    private LocalDateTime appliedAt;
    private LocalDateTime updatedAt;
}
