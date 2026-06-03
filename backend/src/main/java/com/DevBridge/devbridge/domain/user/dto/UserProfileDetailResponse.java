package com.DevBridge.devbridge.domain.user.dto;

import com.DevBridge.devbridge.domain.user.entity.User;
import com.DevBridge.devbridge.domain.user.entity.UserProfileDetail;
import com.DevBridge.devbridge.domain.client.entity.ClientProfile;
import lombok.*;

import java.util.List;
import java.util.Map;

@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class UserProfileDetailResponse {
    private Long userId;

    // User 테이블 기본 정보
    private String username;   // 닉네임 (users.username)
    private String email;      // 로그인 이메일 (users.email)
    private String userType;  // FREE / STANDARD / PREMIUM
    private String phone;
    private String birthDate;
    private String region;
    private String taxEmail;
    private String contactEmail;
    private String gender;
    private String profileImageUrl;  // 프로필 이미지 URL
    private String serviceField;  // PARTNER: users.service_field
    
    // PartnerProfile/ClientProfile 등급 정보
    private String grade;  // PARTNER/CLIENT: grade (SILVER, GOLD, PLATINUM, DIAMOND)
    private Integer completedProjects;  // 완료된 프로젝트 수
    private Double rating;  // 평균 평점
    
    // UserProfileDetail 정보
    private String bio;
    private String strengthDesc;
    private String shortBio;       // 한줄 자기소개 (PARTNER/CLIENT)
    private String industry;       // CLIENT: client_profile.industry
    private String slogan;         // CLIENT: client_profile.slogan
    private String sloganSub;      // CLIENT: client_profile.slogan_sub
    private String githubUsername;  // User.githubUsername
    private String githubUrl;
    private String githubHandle;
    private String githubRepoUrl;
    private Map<String, Boolean> profileMenuToggles;
    private UserProfileDetailRequest.VerifiedEmail verifiedEmail;
}
