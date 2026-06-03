package com.DevBridge.devbridge.domain.ai.controller;

import com.DevBridge.devbridge.domain.ai.entity.AlphaWorkspace;
import com.DevBridge.devbridge.domain.ai.entity.AlphaWorkspaceChangeSet;
import com.DevBridge.devbridge.domain.ai.service.AlphaHelixService;
import com.DevBridge.devbridge.domain.ai.service.AlphaPatchService;
import com.DevBridge.devbridge.domain.ai.service.ClaudeGitSyncService;
import com.DevBridge.devbridge.global.security.AuthContext;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import java.util.*;

/**
 * Alpha Ezer 라이브 패치 endpoint:
 *   POST   /api/alpha/workspaces/{id}/changesets           - 패치 적용 (PENDING)
 *   POST   /api/alpha/workspaces/{id}/changesets/{csId}/keep - 유지 확정
 *   POST   /api/alpha/workspaces/{id}/changesets/{csId}/undo - 롤백
 *   GET    /api/alpha/workspaces/{id}/changesets?status=PENDING - 목록
 */
@Slf4j
@RestController
@RequestMapping("/api/alpha")
@RequiredArgsConstructor
public class AlphaPatchController {

    private final AlphaHelixService helix;
    private final AlphaPatchService patch;
    private final ClaudeGitSyncService gitSync;
    private final ObjectMapper om = new ObjectMapper();

    @PostMapping("/workspaces/{id}/changesets")
    @Transactional
    @SuppressWarnings("unchecked")
    public ResponseEntity<?> apply(@PathVariable Long id, @RequestBody Map<String, Object> body) {
        Long uid = AuthContext.currentUserId();
        if (uid == null) return unauth();
        AlphaWorkspace ws = helix.getWorkspaceRepo().findByIdAndUserId(id, uid).orElse(null);
        if (ws == null) return ResponseEntity.notFound().build();

        try {
            String title = body == null ? null : (String) body.get("title");
            List<Map<String, Object>> ops = body == null ? null
                    : (List<Map<String, Object>>) body.get("ops");
            AlphaWorkspaceChangeSet cs = patch.apply(ws, title, ops);
            return ResponseEntity.ok(toDto(cs, ws));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        } catch (Exception e) {
            log.error("changeset apply fail", e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body(Map.of("error", e.getMessage()));
        }
    }

    @PostMapping("/workspaces/{id}/changesets/{csId}/keep")
    @Transactional
    public ResponseEntity<?> keep(@PathVariable Long id, @PathVariable Long csId) {
        Long uid = AuthContext.currentUserId();
        if (uid == null) return unauth();
        AlphaWorkspace ws = helix.getWorkspaceRepo().findByIdAndUserId(id, uid).orElse(null);
        if (ws == null) return ResponseEntity.notFound().build();
        try {
            AlphaWorkspaceChangeSet cs = patch.keep(ws, csId);
            Map<String, Object> dto = toDto(cs, ws);
            // A3: Claude 에이전트 변경이면 연동 GitHub repo 에 자동 커밋 (Co-Authored-By: Claude)
            if (cs.getTitle() != null && cs.getTitle().startsWith("Claude Code:") && ws.getGithubRepoFullName() != null) {
                dto.put("gitCommit", gitSync.commitChangeSet(ws, cs, uid));
            }
            return ResponseEntity.ok(dto);
        } catch (NoSuchElementException e) {
            return ResponseEntity.notFound().build();
        }
    }

    @PostMapping("/workspaces/{id}/changesets/{csId}/undo")
    @Transactional
    public ResponseEntity<?> undo(@PathVariable Long id, @PathVariable Long csId) {
        Long uid = AuthContext.currentUserId();
        if (uid == null) return unauth();
        AlphaWorkspace ws = helix.getWorkspaceRepo().findByIdAndUserId(id, uid).orElse(null);
        if (ws == null) return ResponseEntity.notFound().build();
        try {
            return ResponseEntity.ok(toDto(patch.undo(ws, csId), ws));
        } catch (NoSuchElementException e) {
            return ResponseEntity.notFound().build();
        } catch (IllegalStateException e) {
            return ResponseEntity.status(HttpStatus.CONFLICT).body(Map.of("error", e.getMessage()));
        }
    }

    @GetMapping("/workspaces/{id}/changesets")
    public ResponseEntity<?> list(@PathVariable Long id,
                                   @RequestParam(value = "status", required = false) String status) {
        Long uid = AuthContext.currentUserId();
        if (uid == null) return unauth();
        AlphaWorkspace ws = helix.getWorkspaceRepo().findByIdAndUserId(id, uid).orElse(null);
        if (ws == null) return ResponseEntity.notFound().build();
        List<AlphaWorkspaceChangeSet> list = "PENDING".equalsIgnoreCase(status)
                ? patch.listPending(id) : patch.listAll(id);
        return ResponseEntity.ok(list.stream().map(cs -> toDto(cs, ws)).toList());
    }

    private Map<String, Object> toDto(AlphaWorkspaceChangeSet cs, AlphaWorkspace ws) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", cs.getId());
        m.put("workspaceId", cs.getWorkspaceId());
        m.put("title", cs.getTitle());
        m.put("status", cs.getStatus());
        m.put("ops", parseSafe(cs.getOpsJson()));
        m.put("createdAt", cs.getCreatedAt());
        m.put("strategyConfig", parseSafe(ws.getStrategyConfigJson()));
        return m;
    }

    private Object parseSafe(String json) {
        if (json == null || json.isBlank()) return null;
        try { return om.readValue(json, Object.class); }
        catch (Exception e) { return json; }
    }

    private static ResponseEntity<?> unauth() {
        return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(Map.of("error", "인증 필요"));
    }
}
