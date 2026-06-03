package com.DevBridge.devbridge.domain.user.entity;

import com.DevBridge.devbridge.domain.user.entity.User;
import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.UpdateTimestamp;

import java.time.LocalDateTime;

/**
 * 사용자(파트너/클라이언트 공통) 프로필 상세.
 * AIchatProfile 등으로 입력되는 자기소개/강점/GitHub/프로필 가시성 토글 등을 보관.
 */
@Entity
@Table(name = "USER_PROFILE_DETAIL")
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class UserProfileDetail {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @OneToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user_id", nullable = false, unique = true)
    private User user;

    @Column(columnDefinition = "TEXT")
    private String bio;

    @Column(name = "strength_desc", columnDefinition = "TEXT")
    private String strengthDesc;

    @Column(name = "short_bio", length = 200)
    private String shortBio;  // 한줄 자기소개 (200자 이내)

    @Column(name = "github_url", length = 500)
    private String githubUrl;

    @Column(name = "github_handle", length = 100)
    private String githubHandle;

    @Column(name = "github_repo_url", length = 500)
    private String githubRepoUrl;

    /** 프로필 섹션 가시성 토글 JSON */
    @Column(name = "profile_menu_toggles", columnDefinition = "JSON")
    private String profileMenuToggles;

    /** "school" | "company" */
    @Column(name = "verified_email_type", length = 20)
    private String verifiedEmailType;

    @Column(name = "verified_email", length = 255)
    private String verifiedEmail;

    @UpdateTimestamp
    @Column(name = "updated_at")
    private LocalDateTime updatedAt;
}
