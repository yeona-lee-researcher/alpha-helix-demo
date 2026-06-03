package com.DevBridge.devbridge.domain.payment.controller;

import com.DevBridge.devbridge.domain.project.entity.ProjectEscrow;
import com.DevBridge.devbridge.domain.project.repository.ProjectEscrowRepository;
import com.DevBridge.devbridge.domain.project.service.ProgressDashboardService;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.ResponseEntity;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.time.LocalDateTime;
import java.util.HexFormat;
import java.util.Map;

/**
 * 토스페이먼츠 웹훅 수신.
 *  - 토스 → 우리 서버로 결제 상태 변경(취소/환불/부분취소 등) 푸시.
 *  - 토스가 보낸 X-Toss-Signature 헤더와 raw body 를 보안키(HMAC-SHA256) 로 검증한다.
 *  - 정상이면 paymentKey 매칭 에스크로의 status 를 갱신.
 *
 * 토스 대시보드 > 개발자 센터 > 웹훅 에 아래 URL 등록 필요:
 *   - 개발: http://localhost:8080/api/payments/toss/webhook (외부 노출 시 ngrok 등 활용)
 *   - 운영: https://your-domain.com/api/payments/toss/webhook
 */
@Slf4j
@RestController
@RequestMapping("/api/payments/toss")
@RequiredArgsConstructor
public class TossWebhookController {

    @Value("${tosspayments.webhook-secret:}")
    private String webhookSecret;

    private final ProjectEscrowRepository escrowRepository;
    private final ProgressDashboardService dashboardService;
    private final ObjectMapper om = new ObjectMapper();

    @PostMapping("/webhook")
    @Transactional
    public ResponseEntity<?> webhook(@RequestHeader(value = "X-Toss-Signature", required = false) String signature,
                                     @RequestBody String rawBody) {
        // 보안키가 비어있으면 검증 skip (개발 단계). 운영에서는 필수.
        if (webhookSecret != null && !webhookSecret.isBlank()) {
            if (signature == null || !verifyHmac(rawBody, signature)) {
                log.warn("[TossWebhook] 서명 검증 실패");
                return ResponseEntity.status(401).body(Map.of("message", "invalid signature"));
            }
        }

        try {
            JsonNode body = om.readTree(rawBody);
            String eventType = body.path("eventType").asText("");
            JsonNode data    = body.path("data");
            String paymentKey = data.path("paymentKey").asText("");
            String status     = data.path("status").asText("");

            log.info("[TossWebhook] eventType={} status={} paymentKey={}", eventType, status, paymentKey);

            if (paymentKey.isBlank()) return ResponseEntity.ok(Map.of("ok", true));

            // payment_tx_id 컬럼에 paymentKey 가 저장돼있음 → 단건 조회.
            escrowRepository.findByPaymentTxId(paymentKey)
                    .ifPresent(e -> applyStatus(e, status));

            return ResponseEntity.ok(Map.of("ok", true));
        } catch (Exception ex) {
            log.warn("[TossWebhook] 처리 오류: {}", ex.getMessage());
            return ResponseEntity.status(500).body(Map.of("message", ex.getMessage()));
        }
    }

    private void applyStatus(ProjectEscrow e, String tossStatus) {
        switch (tossStatus) {
            case "CANCELED", "PARTIAL_CANCELED" -> {
                if (e.getStatus() != ProjectEscrow.EscrowStatus.REFUNDED) {
                    e.setStatus(ProjectEscrow.EscrowStatus.REFUNDED);
                    e.setRefundedAt(LocalDateTime.now());
                    escrowRepository.save(e);
                    log.info("[TossWebhook] 에스크로 {} → REFUNDED", e.getId());
                }
            }
            case "DONE" -> {
                if (e.getStatus() == ProjectEscrow.EscrowStatus.PENDING) {
                    // 가상계좌 입금 완료 등 — 에스크로 전이 + 마일스톤 IN_PROGRESS + 파트너 알림 일괄 처리.
                    dashboardService.markDepositedFromExternal(e.getId());
                    log.info("[TossWebhook] 에스크로 {} → DEPOSITED (webhook 보강)", e.getId());
                }
            }
            default -> { /* WAITING_FOR_DEPOSIT 등은 무시 */ }
        }
    }

    private boolean verifyHmac(String body, String signatureHex) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(webhookSecret.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
            byte[] digest = mac.doFinal(body.getBytes(StandardCharsets.UTF_8));
            String calculated = HexFormat.of().formatHex(digest);
            return calculated.equalsIgnoreCase(signatureHex);
        } catch (Exception e) {
            log.warn("[TossWebhook] HMAC 계산 실패: {}", e.getMessage());
            return false;
        }
    }
}
