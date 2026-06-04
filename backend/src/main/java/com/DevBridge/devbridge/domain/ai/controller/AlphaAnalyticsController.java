package com.DevBridge.devbridge.domain.ai.controller;

import com.DevBridge.devbridge.global.security.AuthContext;
import com.DevBridge.devbridge.domain.ai.service.AlphaHelixService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;
import java.util.NoSuchElementException;

/**
 * Alpha-Helix Analytics Pipeline.
 * ─ POST /api/alpha/workspaces/{id}/backtest
 * ─ POST /api/alpha/workspaces/{id}/regime
 * ─ POST /api/alpha/workspaces/{id}/trust
 * ─ POST /api/alpha/workspaces/{id}/queue-orders
 * ─ POST /api/alpha/workspaces/{id}/auto-run
 * ─ POST /api/alpha/workspaces/{id}/briefing
 */
@Slf4j
@RestController
@RequestMapping("/api/alpha")
@RequiredArgsConstructor
public class AlphaAnalyticsController {

    private final AlphaHelixService svc;

    // ─────────────────────────────────────────── Backtest

    @PostMapping("/workspaces/{id}/backtest")
    public ResponseEntity<?> backtest(
            @PathVariable Long id,
            @RequestParam(value = "period", required = false) String period,
            @RequestBody(required = false) Map<String, Object> body) {
        Long uid = AuthContext.currentUserId();
        if (uid == null) return unauth();
        var wsOpt = svc.getWorkspaceRepo().findByIdAndUserId(id, uid);
        if (wsOpt.isEmpty()) return ResponseEntity.notFound().build();
        var ws = wsOpt.get();
        if (ws.getStrategyConfigJson() == null) {
            return ResponseEntity.status(HttpStatus.UNPROCESSABLE_ENTITY)
                    .body(Map.of("error", "먼저 /formalize로 전략을 정형화하세요"));
        }
        try {
            String periodFinal = (body != null && body.containsKey("period"))
                    ? (String) body.get("period") : period;
            Map<String, Object> customParams = new java.util.HashMap<>();
            if (body != null && body.get("customParams") instanceof Map<?, ?> cp) {
                @SuppressWarnings("unchecked")
                Map<String, Object> cpm = (Map<String, Object>) cp;
                customParams.putAll(cpm);
            }
            // 직접 지정(달력) 기간 — 시드계산기와 같은 selector 공유
            if (body != null && body.get("start") != null) customParams.put("start", body.get("start"));
            if (body != null && body.get("end") != null) customParams.put("end", body.get("end"));
            String json = svc.doBacktest(ws, periodFinal, customParams);
            return ResponseEntity.ok()
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(json);
        } catch (Exception e) {
            log.error("backtest fail", e);
            return ResponseEntity.status(HttpStatus.BAD_GATEWAY)
                    .body(Map.of("error", e.getMessage() != null ? e.getMessage() : e.getClass().getSimpleName()));
        }
    }

    // ─────────────────────────────────────────── P3: 개선 제안서

    /** 전략 개선 제안서 — 진단 + 선택지(기존/안정형/공격형) + 각 선택지 전후 백테스트 비교. */
    @PostMapping("/workspaces/{id}/improve-proposal")
    public ResponseEntity<?> improveProposal(
            @PathVariable Long id,
            @RequestBody(required = false) Map<String, Object> body) {
        Long uid = AuthContext.currentUserId();
        if (uid == null) return unauth();
        var wsOpt = svc.getWorkspaceRepo().findByIdAndUserId(id, uid);
        if (wsOpt.isEmpty()) return ResponseEntity.notFound().build();
        try {
            String period = body != null && body.get("period") != null ? String.valueOf(body.get("period")) : null;
            @SuppressWarnings("unchecked")
            Map<String, Object> customParams = (body != null && body.get("customParams") instanceof Map)
                    ? (Map<String, Object>) body.get("customParams") : Map.of();
            Map<String, Object> result = svc.doImproveProposal(wsOpt.get(), uid, period, customParams);
            return ResponseEntity.ok(result);
        } catch (Exception e) {
            log.error("improve-proposal fail ws={}", id, e);
            return ResponseEntity.status(HttpStatus.BAD_GATEWAY)
                    .body(Map.of("error", e.getMessage() != null ? e.getMessage() : e.getClass().getSimpleName()));
        }
    }

    /** P4: Claude 패치(또는 임의 전후) 효과를 같은 비교 포맷으로 측정 — before/after 파라미터 각각 실측 백테스트. */
    @PostMapping("/workspaces/{id}/compare-backtest")
    public ResponseEntity<?> compareBacktest(
            @PathVariable Long id,
            @RequestBody(required = false) Map<String, Object> body) {
        Long uid = AuthContext.currentUserId();
        if (uid == null) return unauth();
        var wsOpt = svc.getWorkspaceRepo().findByIdAndUserId(id, uid);
        if (wsOpt.isEmpty()) return ResponseEntity.notFound().build();
        try {
            @SuppressWarnings("unchecked")
            Map<String, Object> before = (body != null && body.get("before") instanceof Map)
                    ? (Map<String, Object>) body.get("before") : Map.of();
            @SuppressWarnings("unchecked")
            Map<String, Object> after = (body != null && body.get("after") instanceof Map)
                    ? (Map<String, Object>) body.get("after") : Map.of();
            String period = body != null && body.get("period") != null ? String.valueOf(body.get("period")) : null;
            return ResponseEntity.ok(svc.doCompareBacktest(wsOpt.get(), before, after, period));
        } catch (Exception e) {
            log.error("compare-backtest fail ws={}", id, e);
            return ResponseEntity.status(HttpStatus.BAD_GATEWAY)
                    .body(Map.of("error", e.getMessage() != null ? e.getMessage() : e.getClass().getSimpleName()));
        }
    }

    // ─────────────────────────────────────────── Regime

    @PostMapping("/workspaces/{id}/regime")
    public ResponseEntity<?> regime(
            @PathVariable Long id,
            @RequestBody(required = false) Map<String, Object> body) {
        Long uid = AuthContext.currentUserId();
        if (uid == null) return unauth();
        var wsOpt = svc.getWorkspaceRepo().findByIdAndUserId(id, uid);
        if (wsOpt.isEmpty()) return ResponseEntity.notFound().build();
        try {
            String json = svc.doRegime(wsOpt.get(), body);
            return ResponseEntity.ok()
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(json);
        } catch (Exception e) {
            return ResponseEntity.status(HttpStatus.BAD_GATEWAY)
                    .body(Map.of("error", e.getMessage() != null ? e.getMessage() : e.getClass().getSimpleName()));
        }
    }

    // ─────────────────────────────────────────── Trust

    @PostMapping("/workspaces/{id}/trust")
    public ResponseEntity<?> trust(
            @PathVariable Long id,
            @RequestBody(required = false) Map<String, Object> body) {
        Long uid = AuthContext.currentUserId();
        if (uid == null) return unauth();
        var wsOpt = svc.getWorkspaceRepo().findByIdAndUserId(id, uid);
        if (wsOpt.isEmpty()) return ResponseEntity.notFound().build();
        try {
            String json = svc.doTrust(wsOpt.get(), body);
            return ResponseEntity.ok()
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(json);
        } catch (Exception e) {
            return ResponseEntity.status(HttpStatus.BAD_GATEWAY)
                    .body(Map.of("error", e.getMessage() != null ? e.getMessage() : e.getClass().getSimpleName()));
        }
    }

    // ─────────────────────────────────────────── Queue Orders

    @PostMapping("/workspaces/{id}/queue-orders")
    public ResponseEntity<?> queueOrders(@PathVariable Long id) {
        Long uid = AuthContext.currentUserId();
        if (uid == null) return unauth();
        var wsOpt = svc.getWorkspaceRepo().findByIdAndUserId(id, uid);
        if (wsOpt.isEmpty()) return ResponseEntity.notFound().build();
        var ws = wsOpt.get();
        if (ws.getStrategyConfigJson() == null) {
            return ResponseEntity.status(HttpStatus.UNPROCESSABLE_ENTITY)
                    .body(Map.of("error", "전략 정형화가 먼저 필요합니다"));
        }
        try {
            Map<String, Object> resp = svc.doQueueOrders(ws, uid);
            return ResponseEntity.ok(resp);
        } catch (IllegalStateException e) {
            return ResponseEntity.status(HttpStatus.UNPROCESSABLE_ENTITY)
                    .body(Map.of("error", e.getMessage() != null ? e.getMessage() : e.getClass().getSimpleName()));
        } catch (Exception e) {
            log.error("queue-orders fail", e);
            return ResponseEntity.status(HttpStatus.BAD_GATEWAY)
                    .body(Map.of("error", e.getMessage() != null ? e.getMessage() : e.getClass().getSimpleName()));
        }
    }

    // ─────────────────────────────────────────── Auto-Run

    @PostMapping("/workspaces/{id}/auto-run")
    public ResponseEntity<?> autoRun(@PathVariable Long id) {
        Long uid = AuthContext.currentUserId();
        if (uid == null) return unauth();
        // 선행 조건: goalProfile 필요
        var wsOpt = svc.getWorkspaceRepo().findByIdAndUserId(id, uid);
        if (wsOpt.isEmpty()) return ResponseEntity.notFound().build();
        if (wsOpt.get().getGoalProfileJson() == null) {
            return ResponseEntity.status(HttpStatus.UNPROCESSABLE_ENTITY)
                    .body(Map.of("error", "먼저 AI 채팅으로 목표를 정의하세요"));
        }
        try {
            Map<String, Object> report = svc.doAutoRun(id, uid);
            return ResponseEntity.ok(report);
        } catch (NoSuchElementException e) {
            return ResponseEntity.notFound().build();
        } catch (Exception e) {
            log.error("auto-run fail", e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body(Map.of("error", e.getMessage()));
        }
    }

    // ─────────────────────────────────────────── Briefing

    @PostMapping("/workspaces/{id}/briefing")
    public ResponseEntity<?> briefing(@PathVariable Long id) {
        Long uid = AuthContext.currentUserId();
        if (uid == null) return unauth();
        var wsOpt = svc.getWorkspaceRepo().findByIdAndUserId(id, uid);
        if (wsOpt.isEmpty()) return ResponseEntity.notFound().build();
        try {
            Map<String, Object> resp = svc.doBriefing(wsOpt.get(), uid);
            return ResponseEntity.ok(resp);
        } catch (Exception e) {
            return ResponseEntity.status(HttpStatus.BAD_GATEWAY)
                    .body(Map.of("error", e.getMessage()));
        }
    }

    private static ResponseEntity<?> unauth() {
        return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(Map.of("error", "인증 필요"));
    }
}
