package com.DevBridge.devbridge.domain.ai.controller;

import com.DevBridge.devbridge.domain.user.entity.User;
import com.DevBridge.devbridge.domain.strategy.entity.BrokerAccount;
import com.DevBridge.devbridge.domain.user.entity.*;
import com.DevBridge.devbridge.domain.client.entity.*;
import com.DevBridge.devbridge.domain.project.entity.*;
import com.DevBridge.devbridge.domain.chat.entity.*;
import com.DevBridge.devbridge.domain.notification.entity.*;
import com.DevBridge.devbridge.domain.payment.entity.*;
import com.DevBridge.devbridge.domain.strategy.entity.*;
import com.DevBridge.devbridge.domain.ai.entity.*;
import com.DevBridge.devbridge.global.security.AuthContext;
import com.DevBridge.devbridge.domain.ai.service.AlphaHelixService;
import com.fasterxml.jackson.core.type.TypeReference;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import java.util.*;

/**
 * Alpha-Helix Workspace CRUD + Chat + Decision Log.
 * ─ GET/POST/PATCH/DELETE /api/alpha/workspaces
 * ─ GET/POST /api/alpha/workspaces/{id}/chat
 * ─ GET /api/alpha/workspaces/{id}/log
 * ─ GET /api/alpha/workspaces/{id}/orders
 */
@Slf4j
@RestController
@RequestMapping("/api/alpha")
@RequiredArgsConstructor
public class AlphaWorkspaceController {

    private final AlphaHelixService svc;

    // ─────────────────────────────────────────── 1. Workspace CRUD

    @GetMapping("/workspaces")
    public ResponseEntity<?> list() {
        Long uid = AuthContext.currentUserId();
        if (uid == null) return unauth();
        return ResponseEntity.ok(svc.getWorkspaceRepo()
                .findByUserIdOrderByUpdatedAtDesc(uid)
                .stream().map(svc::toSummary).toList());
    }

    @PostMapping("/workspaces")
    @Transactional
    public ResponseEntity<?> create(@RequestBody Map<String, String> body) {
        Long uid = AuthContext.currentUserId();
        if (uid == null) return unauth();
        User u = svc.getUserRepo().findById(uid).orElseThrow();
        String name = body == null ? "새 전략 워크스페이스"
                : body.getOrDefault("name", "새 전략 워크스페이스");
        AlphaWorkspace w = svc.getWorkspaceRepo().save(AlphaWorkspace.builder()
                .user(u).name(name).status("DRAFT").build());
        svc.recordLog(w.getId(), "USER", "GOAL_DEFINED", "워크스페이스 생성: " + name, null);
        return ResponseEntity.ok(svc.toFull(w));
    }

    @GetMapping("/workspaces/{id}")
    public ResponseEntity<?> get(@PathVariable Long id) {
        Long uid = AuthContext.currentUserId();
        if (uid == null) return unauth();
        return svc.getWorkspaceRepo().findByIdAndUserId(id, uid)
                .<ResponseEntity<?>>map(w -> ResponseEntity.ok(svc.toFull(w)))
                .orElseGet(() -> ResponseEntity.notFound().build());
    }

    @DeleteMapping("/workspaces/{id}")
    @Transactional
    public ResponseEntity<?> delete(@PathVariable Long id) {
        Long uid = AuthContext.currentUserId();
        if (uid == null) return unauth();
        return svc.getWorkspaceRepo().findByIdAndUserId(id, uid).map(w -> {
            svc.getChatRepo().findByWorkspaceIdOrderByCreatedAtAsc(id).forEach(svc.getChatRepo()::delete);
            svc.getLogRepo().findByWorkspaceIdOrderByCreatedAtAsc(id).forEach(svc.getLogRepo()::delete);
            svc.getWorkspaceRepo().delete(w);
            return ResponseEntity.noContent().build();
        }).orElseGet(() -> ResponseEntity.notFound().build());
    }

    @PatchMapping("/workspaces/{id}")
    @Transactional
    public ResponseEntity<?> updateWorkspace(@PathVariable Long id,
                                              @RequestBody Map<String, String> body) {
        Long uid = AuthContext.currentUserId();
        if (uid == null) return unauth();
        var wsOpt = svc.getWorkspaceRepo().findByIdAndUserId(id, uid);
        if (wsOpt.isEmpty()) return ResponseEntity.notFound().build();
        AlphaWorkspace ws = wsOpt.get();
        String name = body == null ? null : body.get("name");
        if (name == null || name.trim().isEmpty())
            return ResponseEntity.badRequest().body(Map.of("error", "name 필수"));
        String trimmed = name.trim();
        if (trimmed.length() > 200) trimmed = trimmed.substring(0, 200);
        ws.setName(trimmed);
        svc.getWorkspaceRepo().save(ws);
        svc.recordLog(ws.getId(), "USER", "GOAL_DEFINED", "슬로건 변경: " + trimmed, null);
        return ResponseEntity.ok(svc.toFull(ws));
    }

    @PatchMapping("/workspaces/{id}/status")
    @Transactional
    public ResponseEntity<?> updateStatus(@PathVariable Long id,
                                           @RequestBody Map<String, String> body) {
        Long uid = AuthContext.currentUserId();
        if (uid == null) return unauth();
        String status = body == null ? null : body.get("status");
        if (status == null) return ResponseEntity.badRequest().body(Map.of("error", "status 필수"));
        Set<String> allowed = Set.of("DRAFT", "GOAL_SET", "FORMALIZED", "TESTED", "LIVE");
        if (!allowed.contains(status))
            return ResponseEntity.badRequest().body(Map.of("error", "허용되지 않은 status"));
        var wsOpt = svc.getWorkspaceRepo().findByIdAndUserId(id, uid);
        if (wsOpt.isEmpty()) return ResponseEntity.notFound().build();
        AlphaWorkspace ws = wsOpt.get();
        ws.setStatus(status);
        svc.getWorkspaceRepo().save(ws);
        svc.recordLog(ws.getId(), "USER", "STATUS_CHANGED", "상태 변경: " + status, null);
        return ResponseEntity.ok(svc.toFull(ws));
    }

    @PatchMapping("/workspaces/{id}/goal-profile")
    @Transactional
    public ResponseEntity<?> patchGoalProfile(@PathVariable Long id,
                                               @RequestBody Map<String, Object> body) {
        Long uid = AuthContext.currentUserId();
        if (uid == null) return unauth();
        var wsOpt = svc.getWorkspaceRepo().findByIdAndUserId(id, uid);
        if (wsOpt.isEmpty()) return ResponseEntity.notFound().build();
        AlphaWorkspace ws = wsOpt.get();
        try {
            Map<String, Object> merged;
            String existing = ws.getGoalProfileJson();
            if (existing != null && !existing.isBlank()) {
                merged = svc.getOm().readValue(existing, new TypeReference<>() {});
            } else {
                merged = new LinkedHashMap<>();
            }
            if (body != null) merged.putAll(body);
            ws.setGoalProfileJson(svc.getOm().writeValueAsString(merged));
            svc.getWorkspaceRepo().save(ws);
            svc.recordLog(id, "USER", "GOAL_DEFINED",
                    "Goal Profile 수정: " + (body == null ? "{}" : body.keySet()), null);
            return ResponseEntity.ok(svc.toFull(ws));
        } catch (Exception e) {
            return ResponseEntity.badRequest()
                    .body(Map.of("error", "goalProfile 머지 실패: " + e.getMessage()));
        }
    }

    @PatchMapping("/workspaces/{id}/broker-account")
    @Transactional
    public ResponseEntity<?> linkBrokerAccount(@PathVariable Long id,
                                                @RequestBody Map<String, Object> body) {
        Long uid = AuthContext.currentUserId();
        if (uid == null) return unauth();
        var wsOpt = svc.getWorkspaceRepo().findByIdAndUserId(id, uid);
        if (wsOpt.isEmpty()) return ResponseEntity.notFound().build();
        AlphaWorkspace ws = wsOpt.get();

        Object raw = body.get("brokerAccountId");
        Long newId = null;
        if (raw != null) {
            try { newId = Long.valueOf(raw.toString()); }
            catch (NumberFormatException e) {
                return ResponseEntity.badRequest().body(Map.of("error", "brokerAccountId 형식 오류"));
            }
            var ba = svc.getBrokerAccountRepo().findByIdAndUserId(newId, uid);
            if (ba.isEmpty()) {
                return ResponseEntity.status(HttpStatus.FORBIDDEN)
                        .body(Map.of("error", "BrokerAccount가 본인 소유가 아니거나 존재하지 않음"));
            }
            ws.setBrokerAccountId(newId);
            svc.recordLog(id, "USER", "BROKER_LINKED",
                    "워크스페이스 ↔ BrokerAccount 연결: id=" + newId + " env=" + ba.get().getEnv(), null);
        } else {
            ws.setBrokerAccountId(null);
            svc.recordLog(id, "USER", "BROKER_UNLINKED", "워크스페이스 ↔ BrokerAccount 연결 해제", null);
        }
        svc.getWorkspaceRepo().save(ws);
        return ResponseEntity.ok(svc.toFull(ws));
    }

    // ─────────────────────────────────────────── 2. Chat

    @GetMapping("/workspaces/{id}/chat")
    @Transactional
    public ResponseEntity<?> chatHistory(@PathVariable Long id) {
        Long uid = AuthContext.currentUserId();
        if (uid == null) return unauth();
        if (svc.getWorkspaceRepo().findByIdAndUserId(id, uid).isEmpty())
            return ResponseEntity.notFound().build();
        var history = svc.getChatRepo().findByWorkspaceIdOrderByCreatedAtAsc(id);
        if (history.isEmpty()) {
            String greeting = """
                안녕하세요! Alpha-Helix의 퍼스널 퀀트 매니저예요. 🌱
                투자 전략을 만들기 전에, 8가지만 함께 정리해볼게요. 천천히 답해주셔도 좋아요.

                먼저 두 가지부터 여쭤볼게요.

                **1) 투자의 최종 목표는 무엇인가요?**
                예) "5년 안에 월 300만원 현금흐름", "10년 뒤 1억 시드", "은퇴자금 마련"

                **2) 투자 기간(목표 시점까지)은 대략 몇 년 정도로 보시나요?**
                예) "3년", "5년", "10년 이상"

                편하게 답해주시면 이어서 나머지 6가지도 한 단계씩 여쭤볼게요.
                """;
            svc.getChatRepo().save(AlphaChatMessage.builder()
                    .workspaceId(id).role("model").text(greeting).build());
            history = svc.getChatRepo().findByWorkspaceIdOrderByCreatedAtAsc(id);
        }
        return ResponseEntity.ok(history);
    }

    @PostMapping("/workspaces/{id}/chat")
    @Transactional
    public ResponseEntity<?> chat(@PathVariable Long id, @RequestBody Map<String, String> body) {
        Long uid = AuthContext.currentUserId();
        if (uid == null) return unauth();
        var wsOpt = svc.getWorkspaceRepo().findByIdAndUserId(id, uid);
        if (wsOpt.isEmpty()) return ResponseEntity.notFound().build();
        String userText = body.getOrDefault("text", "").trim();
        if (userText.isEmpty())
            return ResponseEntity.badRequest().body(Map.of("error", "text 비어있음"));
        return ResponseEntity.ok(svc.processChat(wsOpt.get(), uid, userText));
    }

    // ─────────────────────────────────────────── Decision Log + Orders (read-only)

    @GetMapping("/workspaces/{id}/log")
    public ResponseEntity<?> log(@PathVariable Long id) {
        Long uid = AuthContext.currentUserId();
        if (uid == null) return unauth();
        if (svc.getWorkspaceRepo().findByIdAndUserId(id, uid).isEmpty())
            return ResponseEntity.notFound().build();
        return ResponseEntity.ok(svc.getLogRepo().findByWorkspaceIdOrderByCreatedAtAsc(id));
    }

    @GetMapping("/workspaces/{id}/orders")
    public ResponseEntity<?> listOrders(@PathVariable Long id) {
        Long uid = AuthContext.currentUserId();
        if (uid == null) return unauth();
        if (svc.getWorkspaceRepo().findByIdAndUserId(id, uid).isEmpty())
            return ResponseEntity.notFound().build();
        var list = svc.getOrderProposalRepo().findByUserIdOrderByCreatedAtDesc(uid)
                .stream().filter(op -> id.equals(op.getWorkspaceId())).toList();
        return ResponseEntity.ok(list);
    }

    // ─────────────────────────────────────────── Code (DeveloperLab)

    @PatchMapping("/workspaces/{id}/code")
    @Transactional
    public ResponseEntity<?> saveCode(@PathVariable Long id,
                                       @RequestBody Map<String, String> body) {
        Long uid = AuthContext.currentUserId();
        if (uid == null) return unauth();
        var wsOpt = svc.getWorkspaceRepo().findByIdAndUserId(id, uid);
        if (wsOpt.isEmpty()) return ResponseEntity.notFound().build();
        String codeJson = body == null ? null : body.get("codeJson");
        if (codeJson == null || codeJson.isBlank())
            return ResponseEntity.badRequest().body(Map.of("error", "codeJson 누락"));
        AlphaWorkspace ws = wsOpt.get();
        ws.setCodeJson(codeJson);
        svc.getWorkspaceRepo().save(ws);
        return ResponseEntity.ok(Map.of("saved", true));
    }

    // ─────────────────────────────────────────── helpers

    private static ResponseEntity<?> unauth() {
        return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(Map.of("error", "인증 필요"));
    }
}
