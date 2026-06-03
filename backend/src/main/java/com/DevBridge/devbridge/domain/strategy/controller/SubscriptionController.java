package com.DevBridge.devbridge.domain.strategy.controller;

import com.DevBridge.devbridge.domain.strategy.entity.Subscription;
import com.DevBridge.devbridge.global.security.AuthContext;
import com.DevBridge.devbridge.domain.payment.service.TossPaymentsService;
import com.DevBridge.devbridge.domain.strategy.service.SubscriptionService;
import com.fasterxml.jackson.databind.JsonNode;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

/**
 * Pro 구독 결제 라우트.
 *  - GET  /api/subscription/me      현재 등급 조회
 *  - POST /api/subscription/confirm 결제 위젯 successUrl 콜백 → Toss confirm + Pro 활성화
 *
 * 결제 가격은 30일에 9,900원 (PRO_MONTHLY_KRW). UI에서도 동일 표시.
 */
@Slf4j
@RestController
@RequestMapping("/api/subscription")
@RequiredArgsConstructor
public class SubscriptionController {

    /** 허용 결제 금액 (원) → 플랜 이름 매핑. 추가 플랜 출시 시 여기만 수정. */
    private static final java.util.Map<Long, String> VALID_PLANS = java.util.Map.of(
            9900L,  "STANDARD",
            19900L, "PREMIUM"
    );

    private final SubscriptionService subscriptionService;
    private final TossPaymentsService toss;

    /**
     * 현재 구독 정보 조회.
     * 응답: { tier: "FREE"|"STANDARD"|"PREMIUM", expiresAt? }
     * amountKrw 기반으로 STANDARD/PREMIUM 구분 (DB Tier는 PRO 단일 유지).
     */
    @GetMapping("/me")
    public ResponseEntity<?> me() {
        Long uid = AuthContext.currentUserId();
        if (uid == null) return ResponseEntity.status(401).build();
        Subscription sub = subscriptionService.findActiveSub(uid);
        if (sub == null) {
            return ResponseEntity.ok(Map.of("tier", "FREE"));
        }
        String tierDisplay = SubscriptionService.deriveTierDisplay(sub);
        return ResponseEntity.ok(Map.of(
                "tier", tierDisplay,
                "expiresAt", sub.getExpiresAt().toString()
        ));
    }

    /**
     * Toss v1 결제 성공 후 서버 confirm 호출.
     * body: { paymentKey, orderId, amount }
     * - amount는 반드시 VALID_PLANS 에 정의된 금액 중 하나 (위변조 방지)
     */
    @PostMapping("/confirm")
    public ResponseEntity<?> confirm(@RequestBody Map<String, Object> body) {
        Long uid = AuthContext.currentUserId();
        if (uid == null) return ResponseEntity.status(401).build();

        String paymentKey = String.valueOf(body.get("paymentKey"));
        String orderId    = String.valueOf(body.get("orderId"));
        long   amount     = ((Number) body.getOrDefault("amount", 0)).longValue();

        if (!VALID_PLANS.containsKey(amount)) {
            log.warn("[Subscription] 허용되지 않은 금액 userId={} amount={}", uid, amount);
            return ResponseEntity.badRequest().body(Map.of("error", "허용되지 않은 결제 금액입니다. (9900 또는 19900원)"));
        }
        if (paymentKey == null || paymentKey.isBlank() || "null".equals(paymentKey)) {
            return ResponseEntity.badRequest().body(Map.of("error", "paymentKey 가 없습니다."));
        }

        // M8 멱등성: 이미 처리된 결제키면 Toss 재confirm 없이 기존 구독을 반환(더블클릭/새로고침/재시도 방어).
        Subscription already = subscriptionService.findByPaymentKey(paymentKey);
        if (already != null) {
            log.info("[Subscription] 멱등 confirm — 이미 처리된 결제 userId={} orderId={}", uid, orderId);
            return ResponseEntity.ok(idempotentBody(already, true));
        }

        try {
            JsonNode result = toss.confirm(paymentKey, orderId, amount);
            if (!"DONE".equalsIgnoreCase(result.path("status").asText())) {
                return ResponseEntity.badRequest().body(Map.of("error", "결제가 완료 상태가 아닙니다."));
            }
            Subscription sub = subscriptionService.activatePro(uid, paymentKey, orderId, amount);
            String planDisplay = VALID_PLANS.get(amount);
            return ResponseEntity.ok(Map.of(
                    "tier",      planDisplay,
                    "status",    sub.getStatus().name(),
                    "expiresAt", sub.getExpiresAt().toString()
            ));
        } catch (org.springframework.dao.DataIntegrityViolationException dup) {
            // 동시 confirm 경합 — DB 유니크(uq_subscription_toss_payment_key)에 막힘. 먼저 처리된 구독을 재사용.
            Subscription existing = subscriptionService.findByPaymentKey(paymentKey);
            if (existing != null) {
                log.info("[Subscription] confirm 경합 멱등 처리 userId={} orderId={}", uid, orderId);
                return ResponseEntity.ok(idempotentBody(existing, true));
            }
            log.warn("[Subscription] confirm 무결성 충돌 userId={} orderId={}: {}", uid, orderId, dup.getMessage());
            return ResponseEntity.badRequest().body(Map.of("error", "결제 처리 중 중복이 감지되었습니다. 잠시 후 구독 상태를 확인해 주세요."));
        } catch (RuntimeException e) {
            log.warn("[Subscription] confirm 실패 userId={} orderId={}: {}", uid, orderId, e.getMessage());
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }

    /** 멱등 응답 바디 — 기존 구독을 그대로 표현. */
    private static Map<String, Object> idempotentBody(Subscription sub, boolean idempotent) {
        Map<String, Object> body = new java.util.LinkedHashMap<>();
        body.put("tier", SubscriptionService.deriveTierDisplay(sub));
        body.put("status", sub.getStatus().name());
        body.put("expiresAt", sub.getExpiresAt() == null ? null : sub.getExpiresAt().toString());
        body.put("idempotent", idempotent);
        return body;
    }
}
