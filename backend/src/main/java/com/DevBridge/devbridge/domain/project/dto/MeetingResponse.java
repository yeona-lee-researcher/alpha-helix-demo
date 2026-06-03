package com.DevBridge.devbridge.domain.project.dto;

import com.DevBridge.devbridge.domain.project.entity.ProjectMeeting;
import lombok.*;

import java.time.LocalDateTime;

@Getter
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class MeetingResponse {

    private Long id;
    private Long projectId;
    private String frequencyLabel;
    private LocalDateTime nextAt;
    private String locationLabel;
    private String agenda;

    public static MeetingResponse from(ProjectMeeting m) {
        return MeetingResponse.builder()
                .id(m.getId())
                .projectId(m.getProjectId())
                .frequencyLabel(m.getFrequencyLabel())
                .nextAt(m.getNextAt())
                .locationLabel(m.getLocationLabel())
                .agenda(m.getAgenda())
                .build();
    }
}
