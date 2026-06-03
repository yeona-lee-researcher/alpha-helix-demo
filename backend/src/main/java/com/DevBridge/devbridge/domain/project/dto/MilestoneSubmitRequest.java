package com.DevBridge.devbridge.domain.project.dto;

import lombok.*;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class MilestoneSubmitRequest {
    private String note;
    private String fileUrl;
}
