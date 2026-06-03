package com.DevBridge.devbridge.domain.project.dto;

import lombok.*;

import java.time.LocalDateTime;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class MeetingUpsertRequest {
    private String frequencyLabel;
    private LocalDateTime nextAt;
    private String locationLabel;
    private String agenda;
}
