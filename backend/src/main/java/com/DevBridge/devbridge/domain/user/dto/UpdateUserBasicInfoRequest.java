package com.DevBridge.devbridge.domain.user.dto;

import com.DevBridge.devbridge.domain.user.entity.User;
import com.DevBridge.devbridge.domain.client.entity.ClientProfile;
import lombok.*;

/**
 * 마이페이지에서 사용자 기본 정보 업데이트 요청 DTO.
 * - User 테이블: phone, birthDate, region, taxEmail, contactEmail
 * - PartnerProfile: serviceField (파트너만)
 * - ClientProfile: industry (클라이언트만)
 */
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class UpdateUserBasicInfoRequest {
    
    /** 로그인 이메일 (User.email) */
    private String email;

    /** 닉네임 (User.username) */
    private String username;

    /** 연락처 (User.phone) */
    private String phone;
    
    /** 생년월일 (User.birthDate) yyyy-MM-dd 형식 */
    private String birthDate;
    
    /** 지역 (User.region) */
    private String region;
    
    /** 세금계산서 이메일 (User.taxEmail) */
    private String taxEmail;
    
    /** 연락 이메일 (User.contactEmail) */
    private String contactEmail;
    
    /** 성별 (User.gender) - "MALE", "FEMALE" */
    private String gender;
    
    /** 서비스 분야 - 파트너만 (PartnerProfile.serviceField) */
    private String serviceField;
    
    /** 산업 분야 - 클라이언트만 (ClientProfile.industry) */
    private String industry;
    
    /** 슬로건 - 클라이언트만 (ClientProfile.slogan) */
    private String slogan;
    
    /** 프로필 이미지 URL (User.profileImageUrl) */
    private String profileImageUrl;

    /** GitHub 닉네임 (User.githubUsername) */
    private String githubNickname;
}
