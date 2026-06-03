package com.DevBridge.devbridge.domain.client.dto;

import com.DevBridge.devbridge.domain.user.entity.User;
import com.DevBridge.devbridge.domain.client.entity.ClientProfile;
import lombok.*;

import java.util.List;

/**
 * 클라이언트 검색/목록 응답.
 * - ClientSearch.jsx 카드에 필요한 필드 포함.
 * - mockClients.json shape와 호환.
 */
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class ClientSummaryResponse {
    private Long id;                      // client_profile.id
    private String username;              // users.username (회원가입 시 입력한 로그인 핸들 - 표시용)
    private String name;                  // users.username (화면 표시용 alias)
    private String slogan;
    private String sloganSub;
    private String shortBio;          // 한줄 클라이언트 자기소개 (150자 이내)
    private String bio;
    private String strengthDesc;
    private String industry;
    private String clientType;            // 한글 라벨 ("개인"/"팀"/"개인사업자"/"법인사업자")
    private String grade;                 // "silver"/"gold"/"platinum"/"diamond"
    private List<String> preferredLevels; // ["주니어","미들",...]
    private Integer preferredWorkType;    // 0/1/2
    private String workPrefLabel;         // 한글 라벨
    private Boolean remote;
    private Integer budgetMin;
    private Integer budgetMax;
    private Integer avgProjectBudget;
    private String avatarColor;
    private String heroImg;               // hero 이미지 URL (ClientProfile.heroKey 기반)
    private String profileImageUrl;       // User 테이블 profile_image_url
    private List<String> preferredSkills; // skill names
    private Integer match;                // 매칭 점수
    private Double rating;
    private Integer completedProjects;
    private Integer postedProjects;
    private Integer repeatRate;
    private String email;
    private String phone;
}

