package com.DevBridge.devbridge.domain.user.controller;

import com.DevBridge.devbridge.domain.user.entity.UserApiKey;
import com.DevBridge.devbridge.domain.user.service.FeatureAccessService;
import com.DevBridge.devbridge.domain.user.service.UserApiKeyService;
import com.DevBridge.devbridge.global.security.AuthContext;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

/**
 * 사용자 BYOK API 키 + 기능 접근 관리.
 *  - GET    /api/user/access                현재 사용자 Developer Studio 접근 정보(게이팅 UI용)
 *  - GET    /api/user/api-keys              내 연동 키 목록(마스킹만 — 평문 절대 미반환)
 *  - PUT    /api/user/api-keys/{provider}   키 저장/갱신 (body: { key })  — STANDARD+/allowlist 필요
 *  - DELETE /api/user/api-keys/{provider}   키 삭제
 *
 * 응답에는 절대 평문 키를 싣지 않는다.
 */
@Slf4j
@RestController
@RequestMapping("/api/user")
@RequiredArgsConstructor
public class UserApiKeyController {

    private final UserApiKeyService keyService;
    private final FeatureAccessService access;

    @GetMapping("/access")
    public ResponseEntity<?> access() {
        Long uid = AuthContext.currentUserId();
        if (uid == null) return unauth();
        return ResponseEntity.ok(access.accessInfo(uid));
    }

    @GetMapping("/api-keys")
    public ResponseEntity<?> list() {
        Long uid = AuthContext.currentUserId();
        if (uid == null) return unauth();
        return ResponseEntity.ok(keyService.listMasked(uid));
    }

    @PutMapping("/api-keys/{provider}")
    public ResponseEntity<?> save(@PathVariable String provider, @RequestBody Map<String, String> body) {
        Long uid = AuthContext.currentUserId();
        if (uid == null) return unauth();
        String prov = normalizeProvider(provider);
        if (prov == null) return ResponseEntity.badRequest().body(Map.of("error", "지원하지 않는 provider"));
        // BYOK(Claude) 연동은 Developer Studio 권한(STANDARD+/allowlist) 필요.
        if (!access.canUseDeveloper(uid)) {
            return ResponseEntity.status(HttpStatus.PAYMENT_REQUIRED).body(Map.of(
                    "error", "Developer Studio(본인 Claude 키 연동)는 STANDARD 구독부터 사용할 수 있습니다.",
                    "requiredPlan", "STANDARD"));
        }
        try {
            keyService.saveKey(uid, prov, body == null ? null : body.get("key"));
            return ResponseEntity.ok(Map.of("ok", true, "provider", prov, "connected", true));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }

    @DeleteMapping("/api-keys/{provider}")
    public ResponseEntity<?> delete(@PathVariable String provider) {
        Long uid = AuthContext.currentUserId();
        if (uid == null) return unauth();
        String prov = normalizeProvider(provider);
        if (prov == null) return ResponseEntity.badRequest().body(Map.of("error", "지원하지 않는 provider"));
        keyService.deleteKey(uid, prov);
        return ResponseEntity.noContent().build();
    }

    private static String normalizeProvider(String p) {
        if (p == null) return null;
        String up = p.trim().toUpperCase();
        return UserApiKey.PROVIDER_ANTHROPIC.equals(up) ? UserApiKey.PROVIDER_ANTHROPIC : null;
    }

    private static ResponseEntity<?> unauth() {
        return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(Map.of("error", "인증 필요"));
    }
}
