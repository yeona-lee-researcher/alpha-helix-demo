package com.DevBridge.devbridge.domain.ai.controller;

import com.DevBridge.devbridge.domain.strategy.entity.Strategy;
import com.DevBridge.devbridge.global.security.AuthContext;
import com.DevBridge.devbridge.domain.ai.service.AlphaHelixService;
import com.fasterxml.jackson.databind.JsonNode;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;
import java.util.Objects;

/**
 * Alpha-Helix Strategy Formalization.
 * ─ POST /api/alpha/workspaces/{id}/formalize
 * ─ PATCH /api/alpha/workspaces/{id}/strategy-config/select
 */
@RestController
@RequestMapping("/api/alpha")
@RequiredArgsConstructor
public class AlphaStrategyController {

    private final AlphaHelixService svc;

    // ─────────────────────────────────────────── Formalize

    @PostMapping("/workspaces/{id}/formalize")
    public ResponseEntity<?> formalize(@PathVariable Long id) {
        Long uid = AuthContext.currentUserId();
        if (uid == null) return unauth();
        var wsOpt = svc.getWorkspaceRepo().findByIdAndUserId(id, uid);
        if (wsOpt.isEmpty()) return ResponseEntity.notFound().build();
        var ws = wsOpt.get();
        if (ws.getGoalProfileJson() == null) {
            return ResponseEntity.status(HttpStatus.UNPROCESSABLE_ENTITY)
                    .body(Map.of("error", "먼저 AI Chat으로 Goal Profile을 채우세요"));
        }
        try {
            Map<String, Object> result = svc.doFormalize(ws, uid);
            return ResponseEntity.ok(result);
        } catch (RuntimeException e) {
            String msg = e.getMessage() != null ? e.getMessage() : e.getClass().getSimpleName();
            if (msg.startsWith("LLM 응답을 파싱하지 못했습니다")) {
                return ResponseEntity.status(HttpStatus.BAD_GATEWAY)
                        .body(Map.of("error", msg));
            }
            return ResponseEntity.status(HttpStatus.BAD_GATEWAY)
                    .body(Map.of("error", msg));
        } catch (Exception e) {
            String msg = e.getMessage() != null ? e.getMessage() : e.getClass().getSimpleName();
            return ResponseEntity.status(HttpStatus.BAD_GATEWAY)
                    .body(Map.of("error", msg));
        }
    }

    // ─────────────────────────────────────────── Select Candidate

    @PatchMapping("/workspaces/{id}/strategy-config/select")
    public ResponseEntity<?> selectCandidate(@PathVariable Long id,
                                              @RequestBody Map<String, Object> body) {
        Long uid = AuthContext.currentUserId();
        if (uid == null) return unauth();
        var wsOpt = svc.getWorkspaceRepo().findByIdAndUserId(id, uid);
        if (wsOpt.isEmpty()) return ResponseEntity.notFound().build();
        var ws = wsOpt.get();

        String candidateId = Objects.toString(body.get("candidateId"), null);
        if (candidateId == null || ws.getStrategyConfigJson() == null) {
            return ResponseEntity.badRequest()
                    .body(Map.of("error", "candidateId 누락 또는 strategyConfig 없음"));
        }
        try {
            JsonNode root = svc.getOm().readTree(ws.getStrategyConfigJson());
            if (!root.has("candidates")) {
                return ResponseEntity.badRequest()
                        .body(Map.of("error", "후보 목록이 없습니다 (구버전 config)"));
            }
            boolean found = false;
            for (JsonNode c : root.get("candidates")) {
                if (candidateId.equals(c.path("id").asText())) { found = true; break; }
            }
            if (!found) return ResponseEntity.badRequest()
                    .body(Map.of("error", "해당 candidateId 없음"));

            Map<String, Object> updated = svc.getOm().convertValue(root, Map.class);
            updated.put("selectedId", candidateId);
            String json = svc.getOm().writeValueAsString(updated);
            ws.setStrategyConfigJson(json);
            svc.getWorkspaceRepo().save(ws);
            svc.recordLog(id, "USER", "STRATEGY_PROPOSED",
                    "전략 후보 선택: " + candidateId, null);
            return ResponseEntity.ok(Map.of("selectedId", candidateId, "strategyConfig", json));
        } catch (Exception e) {
            String msg = e.getMessage() != null ? e.getMessage() : e.getClass().getSimpleName();
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body(Map.of("error", msg));
        }
    }

    private static ResponseEntity<?> unauth() {
        return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(Map.of("error", "인증 필요"));
    }
}
