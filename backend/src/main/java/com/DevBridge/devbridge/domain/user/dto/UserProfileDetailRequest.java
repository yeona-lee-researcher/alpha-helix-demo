package com.DevBridge.devbridge.domain.user.dto;

import lombok.*;

import java.util.Map;

/**
 * 사용자 프로필 상세 통합 GET/PUT 페이로드.
 */
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class UserProfileDetailRequest {

    private String bio;
    private String strengthDesc;
    private String shortBio;
    private String industry;
    private String githubUrl;
    private String githubHandle;
    private String githubRepoUrl;

    /** intro/portfolio 가시성 토글 */
    private Map<String, Boolean> profileMenuToggles;

    private VerifiedEmail verifiedEmail;

    @Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
    public static class VerifiedEmail {
        private String type;  // "school" | "company"
        private String email;
    }
}
