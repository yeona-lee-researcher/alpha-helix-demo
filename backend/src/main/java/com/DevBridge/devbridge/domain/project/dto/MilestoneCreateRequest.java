package com.DevBridge.devbridge.domain.project.dto;

import lombok.*;

import java.time.LocalDate;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class MilestoneCreateRequest {
    private Integer seq;
    private String title;
    private String description;
    private String completionCriteria;
    private Long amount;
    private LocalDate startDate;
    private LocalDate endDate;
}
