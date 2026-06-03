package com.DevBridge.devbridge.domain.ai.controller;

import com.DevBridge.devbridge.domain.ai.entity.AlphaWorkspace;
import com.DevBridge.devbridge.domain.ai.service.AlphaHelixService;
import com.DevBridge.devbridge.domain.ai.service.ClaudeCodeAgentService;
import com.DevBridge.devbridge.domain.user.service.FeatureAccessService;
import com.DevBridge.devbridge.global.security.AuthContext;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Claude Code 에이전트 endpoint (A1 동기 + A2 스트리밍):
 *   POST /api/alpha/workspaces/{id}/claude-agent          { request }  → 동기 실행(결과 1회)
 *   POST /api/alpha/workspaces/{id}/claude-agent/start    { request }  → 비동기 잡 시작 → { jobId }
 *   GET  /api/alpha/workspaces/{id}/claude-agent/status/{jobId}?since=N → 진행 로그 + 완료 결과
 */
@Slf4j
@RestController
@RequestMapping("/api/alpha")
@RequiredArgsConstructor
public class ClaudeAgentController {

    private final AlphaHelixService helix;
    private final ClaudeCodeAgentService agent;
    private final FeatureAccessService access;

    @PostMapping("/workspaces/{id}/claude-agent")
    public ResponseEntity<?> run(@PathVariable Long id, @RequestBody Map<String, Object> body) {
        Long uid = AuthContext.currentUserId();
        if (uid == null) return unauth();
        if (!agent.isEnabled()) return disabled();
        if (!access.canUseDeveloper(uid)) return locked();
        AlphaWorkspace ws = helix.getWorkspaceRepo().findByIdAndUserId(id, uid).orElse(null);
        if (ws == null) return ResponseEntity.notFound().build();
        String request = reqText(body);
        if (request == null) return ResponseEntity.badRequest().body(Map.of("error", "request 필수"));
        try {
            ClaudeCodeAgentService.AgentResult r = agent.runAgent(ws, request, uid);
            Map<String, Object> out = new LinkedHashMap<>();
            out.put("narration", r.narration());
            out.put("changedFiles", r.changedFiles());
            out.put("changes", r.changes());
            out.put("elapsedMs", r.elapsedMs());
            out.put("changeSetId", r.changeSet() == null ? null : r.changeSet().getId());
            out.put("changeSetTitle", r.changeSet() == null ? null : r.changeSet().getTitle());
            out.put("hasChanges", r.changeSet() != null);
            return ResponseEntity.ok(out);
        } catch (IllegalArgumentException | IllegalStateException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        } catch (Exception e) {
            log.error("claude-agent fail ws={}", id, e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body(Map.of("error", e.getMessage() != null ? e.getMessage() : "에이전트 실행 실패"));
        }
    }

    /** 비동기 잡 시작 — jobId 즉시 반환, /status 로 단계별 진행 폴링. */
    @PostMapping("/workspaces/{id}/claude-agent/start")
    public ResponseEntity<?> start(@PathVariable Long id, @RequestBody Map<String, Object> body) {
        Long uid = AuthContext.currentUserId();
        if (uid == null) return unauth();
        if (!agent.isEnabled()) return disabled();
        if (!access.canUseDeveloper(uid)) return locked();
        AlphaWorkspace ws = helix.getWorkspaceRepo().findByIdAndUserId(id, uid).orElse(null);
        if (ws == null) return ResponseEntity.notFound().build();
        String request = reqText(body);
        if (request == null) return ResponseEntity.badRequest().body(Map.of("error", "request 필수"));
        try {
            String jobId = agent.startAgent(ws, request, uid);
            return ResponseEntity.ok(Map.of("jobId", jobId, "status", "running"));
        } catch (IllegalArgumentException | IllegalStateException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }

    /** 새 대화 — 해당 워크스페이스의 Claude 멀티세션 맥락을 비운다(다음 요청은 새 세션). */
    @PostMapping("/workspaces/{id}/claude-agent/reset")
    public ResponseEntity<?> reset(@PathVariable Long id) {
        Long uid = AuthContext.currentUserId();
        if (uid == null) return unauth();
        AlphaWorkspace ws = helix.getWorkspaceRepo().findByIdAndUserId(id, uid).orElse(null);
        if (ws == null) return ResponseEntity.notFound().build();
        agent.resetSession(ws.getId());
        return ResponseEntity.ok(Map.of("reset", true));
    }

    /** 잡 진행 상태 + since 커서 이후 증분 로그 + 완료 시 결과. */
    @GetMapping("/workspaces/{id}/claude-agent/status/{jobId}")
    public ResponseEntity<?> status(@PathVariable Long id, @PathVariable String jobId,
                                    @RequestParam(defaultValue = "0") int since) {
        Long uid = AuthContext.currentUserId();
        if (uid == null) return unauth();
        Map<String, Object> snap = agent.jobSnapshot(jobId, since);
        if (snap == null) return ResponseEntity.notFound().build();
        return ResponseEntity.ok(snap);
    }

    private String reqText(Map<String, Object> body) {
        String request = body == null ? null : String.valueOf(body.getOrDefault("request", ""));
        return (request == null || request.isBlank() || "null".equals(request)) ? null : request;
    }

    private ResponseEntity<?> unauth() {
        return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(Map.of("error", "인증 필요"));
    }

    private ResponseEntity<?> disabled() {
        return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE).body(Map.of(
                "error", "Claude Code 에이전트가 비활성화 상태입니다.",
                "hint", "application-{profile}.properties 에 app.claude.cli.enabled=true + claude CLI 설치 필요"));
    }

    /** Developer Studio(Claude 에이전트)는 STANDARD 구독부터 — 비구독 회원 차단(업그레이드 유도). */
    private ResponseEntity<?> locked() {
        return ResponseEntity.status(HttpStatus.PAYMENT_REQUIRED).body(Map.of(
                "error", "Developer Studio(Claude 코드 에이전트)는 STANDARD 구독부터 사용할 수 있습니다.",
                "requiredPlan", "STANDARD"));
    }
}
