package com.DevBridge.devbridge.domain.project.controller;

import com.DevBridge.devbridge.domain.project.dto.ProjectCreateRequest;
import com.DevBridge.devbridge.domain.project.dto.ProjectSummaryResponse;
import com.DevBridge.devbridge.global.security.AuthContext;
import com.DevBridge.devbridge.domain.project.service.ProjectService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/projects")
@RequiredArgsConstructor
public class ProjectController {

    private final ProjectService projectService;

    /**
     * 프로젝트 목록. SQL-level 페이지네이션 — limit/offset/sort 만큼만 DB 에서 조회.
     * 기본 최신순 20개. 전체 조회 시 ?limit=999.
     */
    @GetMapping
    public List<ProjectSummaryResponse> list(
            @RequestParam(value = "limit",  defaultValue = "20") int limit,
            @RequestParam(value = "offset", defaultValue = "0")  int offset,
            @RequestParam(value = "sort",   defaultValue = "latest") String sort) {
        return projectService.findPage(limit, offset, sort);
    }

    /** 현재 로그인 사용자가 등록한 프로젝트 목록 (대시보드 '시작 전 프로젝트' 탭).
     *  status 쿼리 파라미터(쉼표 구분)로 필터 가능. 예: ?status=RECRUITING,IN_PROGRESS */
    @GetMapping("/me")
    public ResponseEntity<?> myProjects(@RequestParam(value = "status", required = false) String status) {
        Long userId = AuthContext.currentUserId();
        if (userId == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                    .body(Map.of("message", "로그인이 필요합니다."));
        }
        List<ProjectSummaryResponse> all = projectService.findAllByUserId(userId);
        if (status == null || status.isBlank()) return ResponseEntity.ok(all);
        // status 값은 enum (RECRUITING/IN_PROGRESS/COMPLETED/CLOSED) 또는 한글 라벨 모두 허용.
        java.util.Map<String, String> alias = java.util.Map.of(
                "RECRUITING", "모집중",
                "IN_PROGRESS", "진행중",
                "COMPLETED", "완료",
                "CLOSED", "마감");
        java.util.Set<String> wanted = new java.util.HashSet<>();
        for (String raw : status.split(",")) {
            String s = raw.trim();
            if (s.isEmpty()) continue;
            String upper = s.toUpperCase();
            wanted.add(s);
            if (alias.containsKey(upper)) wanted.add(alias.get(upper));
        }
        List<ProjectSummaryResponse> filtered = all.stream()
                .filter(p -> p.getStatus() != null && wanted.contains(p.getStatus()))
                .toList();
        return ResponseEntity.ok(filtered);
    }

    @GetMapping("/{id}")
    public ResponseEntity<ProjectSummaryResponse> detail(@PathVariable Long id) {
        try {
            return ResponseEntity.ok(projectService.findById(id));
        } catch (RuntimeException e) {
            return ResponseEntity.notFound().build();
        }
    }

    /** 특정 username 사용자가 등록한 프로젝트 목록 (채팅에서 상대 프로젝트 카드 보여주기용). */
    @GetMapping("/by-username/{username}")
    public ResponseEntity<?> byUsername(@PathVariable String username) {
        try {
            List<ProjectSummaryResponse> list = projectService.findAllByUsername(username);
            return ResponseEntity.ok(list);
        } catch (RuntimeException e) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND)
                    .body(Map.of("message", e.getMessage()));
        }
    }

    /** 프로젝트 등록 (JWT 필수). */
    @PostMapping
    public ResponseEntity<?> create(@RequestBody ProjectCreateRequest request) {
        Long userId = AuthContext.currentUserId();
        if (userId == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                    .body(Map.of("message", "로그인이 필요합니다."));
        }
        try {
            ProjectSummaryResponse created = projectService.create(userId, request);
            return ResponseEntity.status(HttpStatus.CREATED).body(created);
        } catch (Exception e) {
            return ResponseEntity.badRequest().body(Map.of("message", e.getMessage()));
        }
    }

    /** 프로젝트 수정 (작성자 본인만, JWT 필수). */
    @PutMapping("/{id}")
    public ResponseEntity<?> update(@PathVariable Long id, @RequestBody ProjectCreateRequest request) {
        Long userId = AuthContext.currentUserId();
        if (userId == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                    .body(Map.of("message", "로그인이 필요합니다."));
        }
        try {
            ProjectSummaryResponse updated = projectService.update(userId, id, request);
            return ResponseEntity.ok(updated);
        } catch (RuntimeException e) {
            return ResponseEntity.badRequest().body(Map.of("message", e.getMessage()));
        }
    }

    /** 프로젝트 삭제 (작성자 본인만). */
    @DeleteMapping("/{id}")
    public ResponseEntity<?> delete(@PathVariable Long id) {
        Long userId = AuthContext.currentUserId();
        if (userId == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                    .body(Map.of("message", "로그인이 필요합니다."));
        }
        try {
            projectService.delete(userId, id);
            return ResponseEntity.noContent().build();
        } catch (Exception e) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN)
                    .body(Map.of("message", e.getMessage()));
        }
    }

    /** 프로젝트 status 변경 (작성자 본인만). body: {"status": "RECRUITING|IN_PROGRESS|COMPLETED|CLOSED"} */
    @PatchMapping("/{id}/status")
    public ResponseEntity<?> updateStatus(@PathVariable Long id, @RequestBody Map<String, String> body) {
        Long userId = AuthContext.currentUserId();
        if (userId == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                    .body(Map.of("message", "로그인이 필요합니다."));
        }
        String s = body == null ? null : body.get("status");
        if (s == null || s.isBlank()) {
            return ResponseEntity.badRequest().body(Map.of("message", "status 필수"));
        }
        try {
            ProjectSummaryResponse out = projectService.updateStatus(userId, id, s.trim().toUpperCase());
            return ResponseEntity.ok(out);
        } catch (RuntimeException e) {
            return ResponseEntity.badRequest().body(Map.of("message", e.getMessage()));
        }
    }
}

