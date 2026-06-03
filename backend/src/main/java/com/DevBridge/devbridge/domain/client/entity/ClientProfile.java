package com.DevBridge.devbridge.domain.client.entity;

import com.DevBridge.devbridge.domain.user.entity.User;
import jakarta.persistence.*;
import lombok.*;

@Entity
@Table(name = "CLIENT_PROFILE")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class ClientProfile {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @OneToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user_id", nullable = false, unique = true)
    private User user;

    @Enumerated(EnumType.STRING)
    @Column(name = "client_type", nullable = false)
    private ClientType clientType;

    // ===== ERD v2 확장 필드 =====
    @Column(length = 50)
    private String industry;

    @Enumerated(EnumType.STRING)
    @Builder.Default
    private Grade grade = Grade.SILVER;

    @Column(name = "slogan_sub", length = 255)
    private String sloganSub;

    @Column(name = "short_bio", length = 200)
    private String shortBio;  // 한줄 클라이언트 자기소개 (200자 이내)

    @Column(columnDefinition = "TEXT")
    private String bio;

    @Column(name = "strength_desc", columnDefinition = "TEXT")
    private String strengthDesc;

    @Column(name = "preferred_levels", columnDefinition = "JSON")
    private String preferredLevels; // JSON String

    @Column(name = "preferred_work_type")
    private Integer preferredWorkType;

    @Column(name = "budget_min")
    private Integer budgetMin;

    @Column(name = "budget_max")
    private Integer budgetMax;

    @Column(name = "avg_project_budget")
    private Integer avgProjectBudget;

    @Column(name = "avatar_color", length = 16)
    private String avatarColor;

    @Column(name = "hero_key", length = 30)
    private String heroKey;

    public enum ClientType {
        INDIVIDUAL, TEAM, SOLE_PROPRIETOR, CORPORATION
    }

    public enum Grade {
        SILVER, GOLD, PLATINUM, DIAMOND
    }
}
