package com.DevBridge.devbridge.domain.strategy.controller;

import com.DevBridge.devbridge.domain.strategy.service.broker.TradingControlService;
import com.DevBridge.devbridge.global.security.AuthContext;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

/**
 * 전역 거래 차단(kill-switch) 런타임 제어 (B3).
 *   GET  /api/broker/kill-switch        현재 상태 {killSwitch, source, configDefault}
 *   POST /api/broker/kill-switch {on}   긴급 ON/OFF (재시작 불필요 — 모든 주문 즉시 차단/허용)
 */
@RestController
@RequestMapping("/api/broker/kill-switch")
@RequiredArgsConstructor
@Slf4j
public class TradingControlController {

    private final TradingControlService control;

    @GetMapping
    public ResponseEntity<?> status() {
        if (AuthContext.currentUserId() == null)
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(Map.of("error", "인증 필요"));
        return ResponseEntity.ok(control.status());
    }

    @PostMapping
    public ResponseEntity<?> set(@RequestBody Map<String, Object> body) {
        Long uid = AuthContext.currentUserId();
        if (uid == null)
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(Map.of("error", "인증 필요"));
        boolean on = body != null && Boolean.parseBoolean(String.valueOf(body.get("on")));
        control.setKillSwitch(on);
        log.warn("[kill-switch] user={} 긴급 전환 → {}", uid, on);
        return ResponseEntity.ok(control.status());
    }
}
