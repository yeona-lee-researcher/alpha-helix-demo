package com.DevBridge.devbridge.domain.project.entity;

import com.DevBridge.devbridge.domain.user.entity.User;
import com.DevBridge.devbridge.domain.client.entity.ClientProfile;
import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.UpdateTimestamp;
import org.springframework.data.annotation.CreatedDate;
import org.springframework.data.jpa.domain.support.AuditingEntityListener;

import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * 프로젝트 (외주/상주 단일 테이블, 조건부 nullable 분기).
 * ERD v2: projects
 */
@Entity
@Table(name = "PROJECTS")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
@EntityListeners(AuditingEntityListener.class)
public class Project {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user_id", nullable = false)
    private User user;

    @Enumerated(EnumType.STRING)
    @Column(name = "project_type", nullable = false)
    private ProjectType projectType;

    @Column(nullable = false, length = 255)
    private String title;

    @Column(length = 255)
    private String slogan;

    @Column(name = "slogan_sub", length = 255)
    private String sloganSub;

    @Column(name = "`desc`", columnDefinition = "TEXT")
    private String desc; // (주의: SQL 예약어, backtick으로 escape)

    @Column(name = "service_field", length = 50)
    private String serviceField;

    @Enumerated(EnumType.STRING)
    @Builder.Default
    private ClientProfile.Grade grade = ClientProfile.Grade.SILVER;

    @Column(name = "work_scope", columnDefinition = "JSON")
    private String workScope;

    @Column(columnDefinition = "JSON")
    private String category;

    @Column(name = "reference_file_url", length = 1000)
    private String referenceFileUrl;

    @Enumerated(EnumType.STRING)
    private Visibility visibility;

    @Column(name = "budget_min")
    private Integer budgetMin;

    @Column(name = "budget_max")
    private Integer budgetMax;

    @Column(name = "budget_amount")
    private Integer budgetAmount;

    @Column(name = "is_partner_free")
    private Boolean isPartnerFree;

    @Column(name = "start_date_negotiable")
    private Boolean startDateNegotiable;

    @Column(name = "start_date")
    private LocalDate startDate;

    @Column(name = "duration_months")
    private Integer durationMonths;

    @Column(name = "schedule_negotiable")
    private Boolean scheduleNegotiable;

    @Column(name = "detail_content", columnDefinition = "TEXT")
    private String detailContent;

    @Enumerated(EnumType.STRING)
    @Column(name = "meeting_type")
    private MeetingType meetingType;

    @Enumerated(EnumType.STRING)
    @Column(name = "meeting_freq")
    private MeetingFreq meetingFreq;

    @Column(name = "meeting_tools", columnDefinition = "JSON")
    private String meetingTools;

    private LocalDate deadline;

    @Column(name = "gov_support")
    private Boolean govSupport;

    @Column(name = "req_tags", columnDefinition = "JSON")
    private String reqTags;

    @Column(columnDefinition = "JSON")
    private String questions;

    @Column(name = "it_exp")
    private Boolean itExp;

    @Column(name = "collab_planning")
    private Integer collabPlanning;

    @Column(name = "collab_design")
    private Integer collabDesign;

    @Column(name = "collab_publishing")
    private Integer collabPublishing;

    @Column(name = "collab_dev")
    private Integer collabDev;

    @Column(name = "additional_file_url", length = 1000)
    private String additionalFileUrl;

    @Column(name = "additional_comment", columnDefinition = "TEXT")
    private String additionalComment;

    @Enumerated(EnumType.STRING)
    private ProjectStatus status;

    @Column(name = "avatar_color", length = 16)
    private String avatarColor;

    // ===== 외주 전용 (nullable) =====
    @Enumerated(EnumType.STRING)
    @Column(name = "outsource_project_type")
    private OutsourceProjectType outsourceProjectType;

    @Enumerated(EnumType.STRING)
    @Column(name = "ready_status")
    private ReadyStatus readyStatus;

    // ===== 상주 전용 (nullable) =====
    @Enumerated(EnumType.STRING)
    @Column(name = "work_style")
    private WorkStyle workStyle;

    @Column(name = "work_location", length = 255)
    private String workLocation;

    @Enumerated(EnumType.STRING)
    @Column(name = "work_days")
    private WorkDays workDays;

    @Enumerated(EnumType.STRING)
    @Column(name = "work_hours")
    private WorkHours workHours;

    @Column(name = "contract_months")
    private Integer contractMonths;

    @Column(name = "monthly_rate")
    private Integer monthlyRate;

    @Enumerated(EnumType.STRING)
    @Column(name = "dev_stage")
    private DevStage devStage;

    @Enumerated(EnumType.STRING)
    @Column(name = "team_size")
    private TeamSize teamSize;

    @Column(name = "current_stacks", columnDefinition = "JSON")
    private String currentStacks;

    @Column(name = "current_status", columnDefinition = "TEXT")
    private String currentStatus;

    /** 7가지 세부 협의사항 (scope/deliverables/schedule/payment/revision/completion/specialTerms). JSON 스트링 저장. */
    @Column(name = "contract_terms", columnDefinition = "JSON")
    private String contractTerms;

    @CreatedDate
    @Column(name = "created_at", updatable = false)
    private LocalDateTime createdAt;

    @UpdateTimestamp
    @Column(name = "updated_at")
    private LocalDateTime updatedAt;

    // ===== 신규 Enum 정의 =====
    public enum ProjectType { OUTSOURCE, FULLTIME }
    public enum OutsourceProjectType { NEW, MAINTENANCE }
    public enum ReadyStatus { IDEA, DOCUMENT, DESIGN, CODE }
    public enum Visibility { PUBLIC, APPLICANTS, PRIVATE }
    public enum WorkStyle { ONSITE, REMOTE, HYBRID }
    public enum WorkDays { THREE_DAYS, FOUR_DAYS, FIVE_DAYS, FLEXIBLE }
    public enum WorkHours { MORNING, AFTERNOON, FLEXIBLE, FULLTIME }
    public enum DevStage { PLANNING, DEVELOPMENT, BETA, OPERATING, MAINTENANCE }
    public enum TeamSize { SIZE_1_5, SIZE_6_10, SIZE_11_30, SIZE_31_50, SIZE_50_PLUS }
    public enum MeetingType { ONLINE, OFFLINE, HYBRID }
    public enum MeetingFreq { DAILY, WEEKLY, BIWEEKLY, MONTHLY }
    public enum ProjectStatus { RECRUITING, IN_PROGRESS, COMPLETED, CLOSED }
}

