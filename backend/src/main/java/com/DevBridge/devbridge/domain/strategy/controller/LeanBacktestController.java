package com.DevBridge.devbridge.domain.strategy.controller;

import com.DevBridge.devbridge.domain.strategy.service.AnalyticsClient;
import com.DevBridge.devbridge.global.security.AuthContext;
import com.fasterxml.jackson.databind.JsonNode;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

/**
 * QuantConnect Lean 백테스트 엔진 (vectorbt 와 병행).
 * Analytics 사이드카의 /lean/* 엔드포인트로 위임.
 *
 * Feature flag (application.properties):
 *   app.lean.enabled=true  → 활성화 (analytics 사이드카가 Docker + lean 이미지 보유한 경우)
 *   app.lean.enabled=false → 503 으로 즉시 거부 (기본값)
 *
 * Lean 의 무거운 의존성 (Docker, 13GB 이미지) 때문에 dev/prod 환경에서 따로 켜기 위함.
 */
@RestController
@RequestMapping("/api/lean")
@RequiredArgsConstructor
@Slf4j
public class LeanBacktestController {

    private final AnalyticsClient analytics;

    @Value("${app.lean.enabled:false}")
    private boolean leanEnabled;

    @GetMapping("/strategies")
    public ResponseEntity<?> listStrategies() {
        Long uid = AuthContext.currentUserId();
        if (uid == null) return unauthorized();
        if (!leanEnabled) return disabled();
        try {
            JsonNode resp = analytics.leanListStrategies();
            return ResponseEntity.ok(resp);
        } catch (Exception e) {
            log.error("lean/strategies failed", e);
            return ResponseEntity.status(HttpStatus.BAD_GATEWAY)
                    .body(Map.of("error", e.getMessage() != null ? e.getMessage() : e.getClass().getSimpleName()));
        }
    }

    @PostMapping("/backtest")
    public ResponseEntity<?> backtest(@RequestBody LeanBacktestReq req) {
        Long uid = AuthContext.currentUserId();
        if (uid == null) return unauthorized();
        if (!leanEnabled) return disabled();

        if (req.strategyId() == null || req.strategyId().isBlank()) {
            return ResponseEntity.badRequest().body(Map.of("error", "strategyId 필수"));
        }
        if (req.symbols() == null || req.symbols().isEmpty()) {
            return ResponseEntity.badRequest().body(Map.of("error", "symbols 최소 1개 필수"));
        }
        if (req.startDate() == null || req.endDate() == null) {
            return ResponseEntity.badRequest().body(Map.of("error", "startDate, endDate 필수 (YYYY-MM-DD)"));
        }

        try {
            log.info("[Lean] backtest req user={} strategy={} symbols={} {}~{}",
                    uid, req.strategyId(), req.symbols(), req.startDate(), req.endDate());
            JsonNode resp = analytics.leanBacktest(
                    req.strategyId(),
                    req.symbols(),
                    req.startDate(),
                    req.endDate(),
                    req.market(),
                    req.paramOverrides(),
                    null
            );
            return ResponseEntity.ok(resp);
        } catch (Exception e) {
            log.error("lean/backtest failed user={} strategy={}", uid, req.strategyId(), e);
            return ResponseEntity.status(HttpStatus.BAD_GATEWAY)
                    .body(Map.of("error", e.getMessage() != null ? e.getMessage() : e.getClass().getSimpleName()));
        }
    }

    /** 비동기 시작 — job_id 즉시 반환. 진행은 /backtest/status/{jobId} 로 폴링. */
    @PostMapping("/backtest/start")
    public ResponseEntity<?> backtestStart(@RequestBody LeanBacktestReq req) {
        Long uid = AuthContext.currentUserId();
        if (uid == null) return unauthorized();
        if (!leanEnabled) return disabled();

        if (req.strategyId() == null || req.strategyId().isBlank()) {
            return ResponseEntity.badRequest().body(Map.of("error", "strategyId 필수"));
        }
        if (req.symbols() == null || req.symbols().isEmpty()) {
            return ResponseEntity.badRequest().body(Map.of("error", "symbols 최소 1개 필수"));
        }
        if (req.startDate() == null || req.endDate() == null) {
            return ResponseEntity.badRequest().body(Map.of("error", "startDate, endDate 필수 (YYYY-MM-DD)"));
        }
        try {
            log.info("[Lean] start req user={} strategy={} symbols={} {}~{}",
                    uid, req.strategyId(), req.symbols(), req.startDate(), req.endDate());
            JsonNode resp = analytics.leanBacktestStart(
                    req.strategyId(), req.symbols(), req.startDate(), req.endDate(),
                    req.market(), req.paramOverrides());
            return ResponseEntity.ok(resp);
        } catch (Exception e) {
            log.error("lean/backtest/start failed user={} strategy={}", uid, req.strategyId(), e);
            return ResponseEntity.status(HttpStatus.BAD_GATEWAY)
                    .body(Map.of("error", e.getMessage() != null ? e.getMessage() : e.getClass().getSimpleName()));
        }
    }

    /** 잡 진행 상태 + since 커서 이후 증분 로그 + 완료 시 결과. */
    @GetMapping("/backtest/status/{jobId}")
    public ResponseEntity<?> backtestStatus(@PathVariable String jobId,
                                            @RequestParam(defaultValue = "0") int since) {
        Long uid = AuthContext.currentUserId();
        if (uid == null) return unauthorized();
        if (!leanEnabled) return disabled();
        try {
            JsonNode resp = analytics.leanBacktestStatus(jobId, since);
            return ResponseEntity.ok(resp);
        } catch (Exception e) {
            log.error("lean/backtest/status failed job={}", jobId, e);
            return ResponseEntity.status(HttpStatus.BAD_GATEWAY)
                    .body(Map.of("error", e.getMessage() != null ? e.getMessage() : e.getClass().getSimpleName()));
        }
    }

    /** Lean 실행환경 준비 상태 + 활성 플래그. (flag off·analytics down 여도 진단 위해 항상 200 응답) */
    @GetMapping("/health")
    public ResponseEntity<?> health() {
        Long uid = AuthContext.currentUserId();
        if (uid == null) return unauthorized();
        Map<String, Object> out = new java.util.HashMap<>();
        out.put("enabled", leanEnabled);
        try {
            JsonNode resp = analytics.leanHealth();
            out.put("docker", resp.path("docker").asBoolean(false));
            out.put("lean_cli", resp.path("lean_cli").asBoolean(false));
            out.put("image", resp.path("image").asBoolean(false));
            out.put("image_name", resp.path("image_name").asText("quantconnect/lean:latest"));
            out.put("analytics", true);
            out.put("ready", leanEnabled && resp.path("ready").asBoolean(false));
        } catch (Exception e) {
            out.put("analytics", false);
            out.put("ready", false);
            out.put("error", e.getMessage() != null ? e.getMessage() : e.getClass().getSimpleName());
        }
        return ResponseEntity.ok(out);
    }

    private ResponseEntity<?> unauthorized() {
        return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(Map.of("error", "JWT 인증 필요"));
    }

    private ResponseEntity<?> disabled() {
        return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE).body(Map.of(
                "error", "Lean 엔진이 비활성화 상태입니다.",
                "hint", "application-{profile}.properties 에 app.lean.enabled=true 설정 + analytics 사이드카에 Docker 와 quantconnect/lean 이미지 필요"
        ));
    }

    /** 요청 DTO. market 기본 "us", paramOverrides 옵션. */
    public record LeanBacktestReq(
            String strategyId,
            List<String> symbols,
            String startDate,
            String endDate,
            String market,
            Map<String, Object> paramOverrides
    ) {}
}
