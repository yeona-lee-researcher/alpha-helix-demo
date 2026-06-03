package com.DevBridge.devbridge.domain.project.controller;

import com.DevBridge.devbridge.domain.project.dto.ProjectApplicationCreateRequest;
import com.DevBridge.devbridge.domain.project.dto.ProjectApplicationResponse;
import com.DevBridge.devbridge.global.security.AuthContext;
import com.DevBridge.devbridge.domain.project.service.ProjectApplicationService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/applications")
@RequiredArgsConstructor
public class ProjectApplicationController {

    private final ProjectApplicationService service;

    /** 파트너: 내 지원 목록 (대시보드 진행/계약/종료 탭에 사용). */
    @GetMapping("/me")
    public ResponseEntity<?> myApplications() {
        Long userId = AuthContext.currentUserId();
        if (userId == null) return unauth();
        return ResponseEntity.ok(service.findMyApplications(userId));
    }

    /** 클라이언트: 내가 등록한 모든 프로젝트의 지원자 목록. */
    @GetMapping("/received")
    public ResponseEntity<?> receivedApplications() {
        Long userId = AuthContext.currentUserId();
        if (userId == null) return unauth();
        return ResponseEntity.ok(service.findReceivedApplications(userId));
    }

    /** 특정 프로젝트의 지원자(작성자만). */
    @GetMapping("/project/{projectId}")
    public ResponseEntity<?> byProject(@PathVariable Long projectId) {
        Long userId = AuthContext.currentUserId();
        if (userId == null) return unauth();
        try {
            return ResponseEntity.ok(service.findByProject(userId, projectId));
        } catch (RuntimeException e) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of("message", e.getMessage()));
        }
    }

    /** 파트너 → 프로젝트에 지원. */
    @PostMapping
    public ResponseEntity<?> apply(@RequestBody ProjectApplicationCreateRequest req) {
        Long userId = AuthContext.currentUserId();
        if (userId == null) return unauth();
        try {
            ProjectApplicationResponse out = service.apply(userId, req);
            return ResponseEntity.status(HttpStatus.CREATED).body(out);
        } catch (RuntimeException e) {
            return ResponseEntity.badRequest().body(Map.of("message", e.getMessage()));
        }
    }

    /** 상태 변경 — body: {"status":"ACCEPTED"|"REJECTED"|"CONTRACTED"|"IN_PROGRESS"|"COMPLETED"|"WITHDRAWN"} */
    @PatchMapping("/{id}/status")
    public ResponseEntity<?> updateStatus(@PathVariable Long id, @RequestBody Map<String, String> body) {
        Long userId = AuthContext.currentUserId();
        if (userId == null) return unauth();
        try {
            return ResponseEntity.ok(service.updateStatus(userId, id, body.getOrDefault("status", "")));
        } catch (RuntimeException e) {
            return ResponseEntity.badRequest().body(Map.of("message", e.getMessage()));
        }
    }

    /**
     * 모집 완료 — 프로젝트 작성자가 ACCEPTED 한 지원자 1명을 확정하고 모집을 마감.
     * URL: POST /api/applications/close-recruiting
     * body: {"projectId": ..., "acceptedApplicationId": ...}
     * 효과: project.status=CLOSED, 다른 지원자는 REJECTED, 선택 지원자는 ACCEPTED 유지
     */
    @PostMapping("/close-recruiting")
    public ResponseEntity<?> closeRecruiting(@RequestBody Map<String, Long> body) {
        Long userId = AuthContext.currentUserId();
        if (userId == null) return unauth();
        Long projectId = body.get("projectId");
        Long acceptedAppId = body.get("acceptedApplicationId");
        if (projectId == null || acceptedAppId == null) {
            return ResponseEntity.badRequest().body(Map.of("message", "projectId, acceptedApplicationId 필수"));
        }
        try {
            return ResponseEntity.ok(service.closeRecruiting(userId, projectId, acceptedAppId));
        } catch (RuntimeException e) {
            return ResponseEntity.badRequest().body(Map.of("message", e.getMessage()));
        }
    }

    /**
     * 작성자 → 진행 프로젝트 미팅 시작 시 partner application 자동 보장.
     * URL: POST /api/applications/ensure-active
     * body: {"projectId": ..., "partnerUserId": ...}
     */
    @PostMapping("/ensure-active")
    public ResponseEntity<?> ensureActive(@RequestBody Map<String, Long> body) {
        Long userId = AuthContext.currentUserId();
        if (userId == null) return unauth();
        Long projectId = body.get("projectId");
        Long partnerUserId = body.get("partnerUserId");
        if (projectId == null || partnerUserId == null) {
            return ResponseEntity.badRequest().body(Map.of("message", "projectId, partnerUserId 필수"));
        }
        try {
            return ResponseEntity.ok(service.ensureActive(userId, projectId, partnerUserId));
        } catch (RuntimeException e) {
            return ResponseEntity.badRequest().body(Map.of("message", e.getMessage()));
        }
    }

    private ResponseEntity<?> unauth() {
        return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(Map.of("message", "로그인이 필요합니다."));
    }
}
