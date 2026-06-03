package com.DevBridge.devbridge.domain.project.dto;

import lombok.*;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class AttachmentCreateRequest {
    /** "FILE" or "LINK" */
    private String kind;
    private String name;
    private String url;
    private String mimeType;
    private Long sizeBytes;
    private String notes;
}
