package com.DevBridge.devbridge.domain.user.controller;

import com.DevBridge.devbridge.domain.user.entity.UserProfileDetail;
import com.DevBridge.devbridge.domain.user.dto.UpdateUserBasicInfoRequest;
import com.DevBridge.devbridge.domain.user.dto.UserProfileDetailRequest;
import com.DevBridge.devbridge.domain.user.dto.UserProfileDetailResponse;
import com.DevBridge.devbridge.global.security.AuthContext;
import com.DevBridge.devbridge.domain.user.service.ProfileService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

/**
 * 사용자 프로필 세부 정보 (UserProfileDetail + Skills/Careers/Educations/Awards/Certifications) 통합 컨트롤러.
 * - Client_Profile.jsx 의 "전체 설정 저장하기" 에서 호출.
 */
@RestController
@RequestMapping("/api/profile")
@RequiredArgsConstructor
public class ProfileController {

    private final ProfileService profileService;
    private final org.springframework.core.env.Environment springEnv;

    /** 현재 로그인 사용자의 프로필 세부 정보 조회. */
    @GetMapping("/me/detail")
    public ResponseEntity<?> myDetail() {
        Long userId = AuthContext.currentUserId();
        if (userId == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                    .body(Map.of("message", "로그인이 필요합니다."));
        }
        try {
            UserProfileDetailResponse res = profileService.getDetail(userId);
            return ResponseEntity.ok(res);
        } catch (Exception e) {
            return ResponseEntity.badRequest().body(Map.of("message", e.getMessage()));
        }
    }

    /** 다른 사용자의 프로필 세부 정보 조회 (username 기준, public). 카드 → 상세보기 진입 시 사용. */
    @GetMapping("/{username}/detail")
    public ResponseEntity<?> publicDetail(@PathVariable String username) {
        try {
            UserProfileDetailResponse res = profileService.getDetailByUsername(username);
            return ResponseEntity.ok(res);
        } catch (Exception e) {
            return ResponseEntity.badRequest().body(Map.of("message", e.getMessage()));
        }
    }

    /** 현재 로그인 사용자의 프로필 세부 정보 일괄 저장 (upsert). */
    @PutMapping("/me/detail")
    public ResponseEntity<?> saveMyDetail(@RequestBody UserProfileDetailRequest req) {
        Long userId = AuthContext.currentUserId();
        if (userId == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                    .body(Map.of("message", "로그인이 필요합니다."));
        }
        try {
            UserProfileDetailResponse res = profileService.saveDetail(userId, req);
            return ResponseEntity.ok(res);
        } catch (Exception e) {
            return ResponseEntity.badRequest().body(Map.of("message", e.getMessage()));
        }
    }

    /**
     * [DEV ONLY] 특정 username 의 프로필 데이터 일괄 초기화.
     * 로컬 개발 환경에서만 활성화 (spring.profiles.active=local).
     * 운영 배포 시 자동 차단됨.
     */
    @PostMapping("/admin/reset/{username}")
    public ResponseEntity<?> resetByUsername(@PathVariable String username) {
        boolean isLocal = false;
        for (String p : springEnv.getActiveProfiles()) if ("local".equalsIgnoreCase(p)) { isLocal = true; break; }
        if (!isLocal) {
            for (String p : springEnv.getDefaultProfiles()) if ("local".equalsIgnoreCase(p)) { isLocal = true; break; }
        }
        if (!isLocal) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN)
                    .body(Map.of("message", "dev 전용 엔드포인트입니다."));
        }
        try {
            profileService.resetByUsername(username);
            return ResponseEntity.ok(Map.of("message", username + " 프로필을 초기화했습니다."));
        } catch (Exception e) {
            return ResponseEntity.badRequest().body(Map.of("message", e.getMessage()));
        }
    }

    /**
     * 본인 프로필 데이터 일괄 초기화 (학력/경력/스킬/수상/자격증 + 자기소개/슬로건/GitHub URL 등).
     * USERS 테이블의 username/email 등 계정 정보는 보존. 본인 인증 후 본인만 호출 가능.
     */
    @PostMapping("/me/reset")
    public ResponseEntity<?> resetMyProfile() {
        Long userId = AuthContext.currentUserId();
        if (userId == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                    .body(Map.of("message", "로그인이 필요합니다."));
        }
        try {
            profileService.resetMyProfile(userId);
            return ResponseEntity.ok(Map.of("message", "프로필을 초기화했습니다."));
        } catch (Exception e) {
            return ResponseEntity.badRequest().body(Map.of("message", e.getMessage()));
        }
    }

    /** 마이페이지에서 사용자 기본 정보 업데이트 (phone, birthDate, region, serviceField/industry 등). */
    @PutMapping("/me/basic")
    public ResponseEntity<?> updateMyBasicInfo(@RequestBody UpdateUserBasicInfoRequest req) {
        Long userId = AuthContext.currentUserId();
        if (userId == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                    .body(Map.of("message", "로그인이 필요합니다."));
        }
        try {
            Map<String, Object> response = profileService.updateBasicInfo(userId, req);
            return ResponseEntity.ok(response);
        } catch (Exception e) {
            return ResponseEntity.badRequest().body(Map.of("message", e.getMessage()));
        }
    }
}
