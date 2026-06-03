package com.DevBridge.devbridge.domain.project.dto;

import lombok.*;

import java.time.LocalDate;
import java.util.List;

/**
 * 프로젝트 검색/목록 응답.
 * - ProjectSearch.jsx 카드에 필요한 필드 포함.
 * - mockProjects.json shape와 호환.
 */
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class ProjectSummaryResponse {
    private Long id;
    private String clientId;          // users.username (작성자)
    private String avatarColor;
    private String title;
    private String slogan;
    private String sloganSub;
    private String desc;
    private List<String> tags;
    private String serviceField;
    private String workPref;          // 한글 라벨 (외주: 워킹스타일/상주: workStyle)
    private String priceType;         // "유료"/"무료" (is_partner_free 기반)
    private Boolean remote;
    private String level;             // (placeholder)
    private String grade;             // "silver"/"gold"/...
    private Integer match;            // 매칭 점수
    private String price;             // "672~1,800만원"
    private String period;            // "3개월"
    private List<String> verifications; // (placeholder, 빈 배열)
    private String status;            // 한글 라벨 ("모집중"/"진행중"/...)
    private Integer budgetMin;
    private Integer budgetMax;
    private Integer durationDays;
    private LocalDate deadline;
    private LocalDate expectedStartDate;
    private Integer workPrefCode;
    private String projectType;       // "outsource"/"fulltime"

    // 요구사항
    private List<String> requiredSkills;
    private List<String> preferredSkills;
    private List<String> skillSet;    // 합집합

    /** 7가지 세부 협의사항 (키: scope/deliverables/schedule/payment/revision/completion/specialTerms). */
    private java.util.Map<String, Object> contractTerms;
}

