package com.DevBridge.devbridge.domain.payment.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.*;
import org.springframework.stereotype.Service;
import org.springframework.web.client.HttpStatusCodeException;
import org.springframework.web.client.RestTemplate;

import java.nio.charset.StandardCharsets;
import java.util.Base64;
import java.util.Map;

/**
 * 토스페이먼츠 결제 승인(서버) 호출.
 * 프론트가 SDK 로 결제창을 띄워 사용자가 결제하면 paymentKey/orderId/amount 가 콜백으로 들어옴.
 * 서버에서 시크릿 키로 /v1/payments/confirm 호출 → 실제 결제가 확정됨.
 *
 * 테스트 환경: docs 테스트 시크릿 키 (test_sk_docs_*) — 실 청구 없이 결제 흐름 전체 검증 가능.
 * 운영 환경: 토스 가맹 신청 후 발급받은 라이브 시크릿 키를 환경변수 TOSS_SECRET_KEY 로 주입.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class TossPaymentsService {

    @Value("${tosspayments.secret-key}")
    private String secretKey;

    @Value("${tosspayments.api-base}")
    private String apiBase;

    private final RestTemplate restTemplate = new RestTemplate();
    private final ObjectMapper om = new ObjectMapper();

    /**
     * 결제 승인. 성공 시 토스가 보낸 결제 정보 JSON 을 반환.
     * 실패 시 RuntimeException(메시지=토스 에러 메시지) 던짐.
     */
    public JsonNode confirm(String paymentKey, String orderId, long amount) {
        String url = apiBase + "/v1/payments/confirm";

        // Basic Auth: secretKey + ":" base64
        String basic = Base64.getEncoder().encodeToString(
                (secretKey + ":").getBytes(StandardCharsets.UTF_8));

        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        headers.set("Authorization", "Basic " + basic);

        Map<String, Object> body = Map.of(
                "paymentKey", paymentKey,
                "orderId", orderId,
                "amount", amount
        );

        HttpEntity<Map<String, Object>> entity = new HttpEntity<>(body, headers);
        try {
            ResponseEntity<String> res = restTemplate.exchange(url, HttpMethod.POST, entity, String.class);
            JsonNode json = om.readTree(res.getBody());
            log.info("[Toss] confirm OK orderId={} status={} method={}",
                    orderId, json.path("status").asText(), json.path("method").asText());
            return json;
        } catch (HttpStatusCodeException e) {
            String msg = "토스 결제 승인 실패";
            try {
                JsonNode err = om.readTree(e.getResponseBodyAsString());
                msg = err.path("message").asText(msg);
                log.warn("[Toss] confirm fail orderId={} code={} message={}", orderId,
                        err.path("code").asText(), msg);
            } catch (Exception ignore) {
                log.warn("[Toss] confirm fail orderId={} body={}", orderId, e.getResponseBodyAsString());
            }
            throw new RuntimeException(msg);
        } catch (Exception e) {
            log.warn("[Toss] confirm error orderId={}: {}", orderId, e.getMessage());
            throw new RuntimeException("결제 승인 중 오류가 발생했습니다: " + e.getMessage());
        }
    }
}
