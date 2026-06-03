package com.DevBridge.devbridge.domain.project.dto;

import lombok.*;

@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class ProjectApplicationCreateRequest {
    private Long projectId;
    private String message;
}
