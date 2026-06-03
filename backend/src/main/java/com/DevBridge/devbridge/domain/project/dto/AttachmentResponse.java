package com.DevBridge.devbridge.domain.project.dto;

import com.DevBridge.devbridge.domain.project.entity.ProjectAttachment;
import lombok.*;

import java.time.LocalDateTime;

@Getter
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class AttachmentResponse {

    private Long id;
    private Long projectId;
    private String kind;
    private String name;
    private String url;
    private String mimeType;
    private Long sizeBytes;
    private String notes;
    private Long uploaderUserId;
    private String uploaderName;
    private LocalDateTime createdAt;

    public static AttachmentResponse from(ProjectAttachment a) {
        return AttachmentResponse.builder()
                .id(a.getId())
                .projectId(a.getProjectId())
                .kind(a.getKind() == null ? null : a.getKind().name())
                .name(a.getName())
                .url(a.getUrl())
                .mimeType(a.getMimeType())
                .sizeBytes(a.getSizeBytes())
                .notes(a.getNotes())
                .uploaderUserId(a.getUploaderUserId())
                .createdAt(a.getCreatedAt())
                .build();
    }

    public static AttachmentResponse from(ProjectAttachment a, String uploaderName) {
        return AttachmentResponse.builder()
                .id(a.getId())
                .projectId(a.getProjectId())
                .kind(a.getKind() == null ? null : a.getKind().name())
                .name(a.getName())
                .url(a.getUrl())
                .mimeType(a.getMimeType())
                .sizeBytes(a.getSizeBytes())
                .notes(a.getNotes())
                .uploaderUserId(a.getUploaderUserId())
                .uploaderName(uploaderName)
                .createdAt(a.getCreatedAt())
                .build();
    }
}
