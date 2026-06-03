package com.DevBridge.devbridge.domain.project.controller;

import com.DevBridge.devbridge.domain.project.dto.ProjectModuleResponse;
import com.DevBridge.devbridge.domain.project.dto.ProjectModuleUpsertRequest;
import com.DevBridge.devbridge.global.security.AuthContext;
import com.DevBridge.devbridge.domain.project.service.ProjectModuleService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

/**
 * 계약 세부 협의 7모듈 데이터 (project_modules 테이블).
 *  GET /api/projects/{projectId}/modules               → 전체 모듈 조회
 *  PUT /api/projects/{projectId}/modules/{moduleKey}   → 단일 모듈 upsert
 */
@RestController
@RequestMapping("/api/projects/{projectId}/modules")
@RequiredArgsConstructor
public class ProjectModuleController {

    private final ProjectModuleService projectModuleService;

    @GetMapping
    public ResponseEntity<List<ProjectModuleResponse>> list(@PathVariable Long projectId) {
        return ResponseEntity.ok(projectModuleService.list(projectId));
    }

    @PutMapping("/{moduleKey}")
    public ResponseEntity<?> upsert(@PathVariable Long projectId,
                                    @PathVariable String moduleKey,
                                    @RequestBody ProjectModuleUpsertRequest req) {
        Long userId = AuthContext.currentUserId();
        if (userId == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                    .body(Map.of("message", "로그인이 필요합니다."));
        }
        try {
            return ResponseEntity.ok(projectModuleService.upsert(projectId, moduleKey, req, userId));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("message", e.getMessage()));
        }
    }
}
