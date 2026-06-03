package com.DevBridge.devbridge.domain.project.dto;

import com.DevBridge.devbridge.domain.project.entity.ProjectModule;
import lombok.*;

import java.time.LocalDateTime;

@Getter
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class ProjectModuleResponse {
    private Long id;
    private Long projectId;
    private String moduleKey;
    private String status;
    private Long lastModifierId;
    private String lastModifierName;
    private String data;          // raw JSON string
    private LocalDateTime updatedAt;

    public static ProjectModuleResponse from(ProjectModule m) {
        return ProjectModuleResponse.builder()
                .id(m.getId())
                .projectId(m.getProjectId())
                .moduleKey(m.getModuleKey())
                .status(m.getStatus())
                .lastModifierId(m.getLastModifierId())
                .lastModifierName(m.getLastModifierName())
                .data(m.getData())
                .updatedAt(m.getUpdatedAt())
                .build();
    }
}
