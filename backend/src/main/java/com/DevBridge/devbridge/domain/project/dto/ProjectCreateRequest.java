package com.DevBridge.devbridge.domain.project.dto;

import lombok.*;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;

/**
 * 프로젝트 등록 요청.
 * - 외주/상주 통합 (project_type으로 분기, 무관 필드는 null 허용).
 * - skills 안에 required/preferred 분리 전달.
 */
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class ProjectCreateRequest {

    /** "outsource" | "fulltime" */
    private String projectType;

    private String title;
    private String slogan;
    private String sloganSub;
    private String desc;
    private String detailContent;
    private String serviceField;
    private String grade;             // "silver"/"gold"/...
    private List<String> workScope;   // ["dev","design",...]
    private List<String> category;    // ["ios","android",...]
    private List<String> tags;        // ["#Spring",...]
    private String referenceFileUrl;
    private String visibility;        // "public"/"applicants"/"private"

    // 예산 / 일정
    private Integer budgetMin;
    private Integer budgetMax;
    private Integer budgetAmount;
    private Boolean isPartnerFree;
    private Boolean startDateNegotiable;
    private LocalDate startDate;
    private Integer durationMonths;
    private Boolean scheduleNegotiable;

    // 미팅
    private String meetingType;
    private String meetingFreq;
    private List<String> meetingTools;

    // 마감/태그
    private LocalDate deadline;
    private Boolean govSupport;
    private List<String> reqTags;
    private List<String> questions;
    private Boolean itExp;

    // 협업 형태
    private Integer collabPlanning;
    private Integer collabDesign;
    private Integer collabPublishing;
    private Integer collabDev;

    private String additionalFileUrl;
    private String additionalComment;
    private String avatarColor;

    // ===== 외주 전용 =====
    private String outsourceProjectType; // "new"/"maintenance"
    private String readyStatus;          // "idea"/"document"/"design"/"code"

    // ===== 상주 전용 =====
    private String workStyle;            // "onsite"/"remote"/"hybrid"
    private String workLocation;
    private String workDays;             // "3"/"4"/"5"/"flexible"
    private String workHours;            // "morning"/"afternoon"/"flexible"/"fulltime"
    private Integer contractMonths;
    private Integer monthlyRate;
    private String devStage;             // "planning"/"development"/...
    private String teamSize;             // "1-5"/"6-10"/...
    private List<String> currentStacks;
    private String currentStatus;

    // 스킬 요구사항
    private List<String> requiredSkills;
    private List<String> preferredSkills;

    /** 7가지 세부 협의사항 (scope/deliverables/schedule/payment/revision/completion/specialTerms). */
    private Map<String, Object> contractTerms;
}

