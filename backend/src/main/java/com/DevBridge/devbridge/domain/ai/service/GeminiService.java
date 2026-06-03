package com.DevBridge.devbridge.domain.ai.service;

import com.DevBridge.devbridge.domain.ai.dto.AiChatRequest;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;
import org.springframework.web.client.HttpClientErrorException;
import org.springframework.web.client.RestClient;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.Semaphore;

// 429 응답 본문에서 추출한 쿼터 정보
record Quota429Info(boolean isFreeTier, boolean isDailyQuota, long retryDelayMs) {}

/**
 * Gemini API를 서버에서 직접 호출.
 * API 키는 application.properties → 환경변수(GEMINI_API_KEY)로 주입되며
 * 절대 클라이언트로 나가지 않는다.
 */
@Service
public class GeminiService {

    private static final Logger log = LoggerFactory.getLogger(GeminiService.class);

    private final String apiKey;
    private final String model;
    private final String fallbackModel;
    private final String baseUrl;
    private final RestClient restClient;

    // 레이트리밋 방지(RPM 초과 429 예방): 동시 호출 수 제한 + 호출 간 최소 간격.
    // 모든 Gemini 호출이 postGenerateContent 를 거치므로 여기 한 곳에서 전역 스로틀링된다.
    private final Semaphore geminiConcurrency = new Semaphore(4, true);
    private static final long MIN_CALL_GAP_MS = 120; // 호출 시작 간 최소 간격
    private volatile long lastCallAtMs = 0;

    public GeminiService(
            @Value("${gemini.api.key}") String apiKey,
            @Value("${gemini.api.model}") String model,
            @Value("${gemini.api.fallback-model:}") String fallbackModel,
            @Value("${gemini.api.url}") String baseUrl
    ) {
        this.apiKey = apiKey;
        this.model = model;
    this.fallbackModel = fallbackModel;
        this.baseUrl = baseUrl;
        this.restClient = RestClient.create();

    log.info(
        "Gemini configured. model={}, fallbackModel={}, apiKeyPresent={}, apiKeyLen={}, apiKeyTail={}",
        model,
        fallbackModel == null || fallbackModel.isBlank() ? "(none)" : fallbackModel,
        apiKey != null && !apiKey.isBlank(),
        apiKey == null ? 0 : apiKey.length(),
        apiKey == null || apiKey.length() < 4 ? "(none)" : apiKey.substring(apiKey.length() - 4)
    );
    }

    public String chat(AiChatRequest request) {
        if (apiKey == null || apiKey.isBlank()) {
            throw new IllegalStateException(
                    "GEMINI_API_KEY 환경변수가 설정되지 않았습니다. 백엔드 실행 환경에 키를 등록하세요.");
        }

        // Gemini contents 형식으로 변환 (history가 null이면 빈 대화로 처리 - NPE 방어)
        List<AiChatRequest.Message> history = request.getHistory() != null ? request.getHistory() : List.of();
        List<Map<String, Object>> contents = history.stream()
                .map(m -> {
                    Map<String, Object> content = new HashMap<>();
                    // Gemini는 역할을 오직 'user' 또는 'model'만 허용함 (그 외는 400 Bad Request)
                    String role = m.getRole();
                    if (role == null || role.equalsIgnoreCase("bot") || role.equalsIgnoreCase("assistant")) {
                        role = "model";
                    } else if (role.equalsIgnoreCase("user")) {
                        role = "user";
                    }
                    content.put("role", role.toLowerCase());
                    content.put("parts", List.of(Map.of("text", m.getText())));
                    return content;
                })
                .toList();

        Map<String, Object> body = new HashMap<>();
        body.put("contents", contents);

        // 시스템 프롬프트 (페이지별 역할 지시)
        if (request.getSystemInstruction() != null && !request.getSystemInstruction().trim().isEmpty()) {
            body.put("system_instruction", Map.of(
                    "parts", List.of(Map.of("text", request.getSystemInstruction().trim()))
            ));
        }

        // chat 응답 토큰 한도.
        // 일괄 입력 모드에선 등록폼 JSON + 7가지 협의 마크다운 + contractTerms JSON 모두 한 응답에 출력해야 해서
        // 충분히 32768 까지 허용. (8192 일 때도 contractTerms verbose 하게 쓰면 잘리는 사례 발견)
        // gemini-2.5-flash 는 최대 65536 까지 지원하므로 안전한 범위.
        body.put("generationConfig", Map.of(
                "temperature", 0.8,
                "maxOutputTokens", 32768
        ));

        Map<String, Object> response = generateContent(body);

        return extractText(response);
    }

    @SuppressWarnings("unchecked")
    private String extractText(Map<String, Object> response) {
        try {
            List<Map<String, Object>> candidates = (List<Map<String, Object>>) response.get("candidates");
            if (candidates == null || candidates.isEmpty()) {
                log.warn("Gemini 응답에 candidates 없음. raw={}", response);
                return "(응답이 비어 있습니다)";
            }
            Map<String, Object> cand0 = candidates.get(0);
            Object finishReason = cand0.get("finishReason");
            Map<String, Object> content = (Map<String, Object>) cand0.get("content");
            List<Map<String, Object>> parts = content == null ? null : (List<Map<String, Object>>) content.get("parts");

            if (parts == null || parts.isEmpty()) {
                log.warn("Gemini 응답 parts 비어있음. finishReason={}, candidate={}", finishReason, cand0);
                if ("MAX_TOKENS".equals(String.valueOf(finishReason))) {
                    return "(응답이 비어 있습니다: MAX_TOKENS - 출력 토큰 한도 초과)";
                }
                if ("SAFETY".equals(String.valueOf(finishReason))) {
                    return "(응답이 비어 있습니다: SAFETY - 안전 필터 차단)";
                }
                return "(응답이 비어 있습니다: finishReason=" + finishReason + ")";
            }
            return (String) parts.get(0).get("text");
        } catch (Exception e) {
            log.error("Gemini 응답 파싱 실패. raw={}", response, e);
            return "(응답 파싱 실패)";
        }
    }

    /** API 키가 설정되었는지 확인 (LLM 라우터에서 available 표시용) */
    public boolean hasApiKey() {
        return apiKey != null && !apiKey.isBlank();
    }

    /**
    * 시스템 프롬프트 + 단일 user 프롬프트로 한 번 호출.
    * wantJson=true 일 때만 responseMimeType:application/json 을 붙인다.
    * briefing 등 평문 응답이 필요한 경우 wantJson=false 로 호출해야 한다.
     */
    public String oneShot(String systemInstruction, String userPrompt, boolean wantJson) {
        if (apiKey == null || apiKey.isBlank()) {
            throw new IllegalStateException(
                    "GEMINI_API_KEY 환경변수가 설정되지 않았습니다. 백엔드 실행 환경에 키를 등록하세요.");
        }

        Map<String, Object> body = new HashMap<>();
        body.put("contents", List.of(Map.of(
                "role", "user",
                "parts", List.of(Map.of("text", userPrompt))
        )));

        if (systemInstruction != null && !systemInstruction.trim().isEmpty()) {
            body.put("system_instruction", Map.of(
                    "parts", List.of(Map.of("text", systemInstruction.trim()))
            ));
        }

        Map<String, Object> genConfig = new HashMap<>();
        genConfig.put("temperature", 0.3);
        genConfig.put("maxOutputTokens", 65536);
        if (wantJson) {
            genConfig.put("responseMimeType", "application/json");
        }
        body.put("generationConfig", genConfig);

        Map<String, Object> response = generateContent(body);

        return extractText(response);
    }

    public String oneShot(String systemInstruction, String userPrompt) {
        return oneShot(systemInstruction, userPrompt, true);
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> generateContent(Map<String, Object> body) {
        try {
            return postGenerateContent(model, body, true);
        } catch (HttpClientErrorException.TooManyRequests primary429) {
            if (fallbackModel == null || fallbackModel.isBlank() || fallbackModel.equals(model)) {
                Quota429Info info = parse429Info(primary429);
                throw new RuntimeException(buildQuotaMessage(info, model), primary429);
            }
            log.warn("Gemini 429 on primary model {}. Falling back to {}.", model, fallbackModel);
            try {
                return postGenerateContent(fallbackModel, body, false);
            } catch (HttpClientErrorException.TooManyRequests fallback429) {
                Quota429Info info = parse429Info(fallback429);
                throw new RuntimeException(buildQuotaMessage(info, fallbackModel), fallback429);
            }
        } catch (HttpClientErrorException e) {
            // 403(Forbidden) - 모델 접근 불가 시 fallback으로 재시도
            if (e.getStatusCode().value() == 403
                    && fallbackModel != null && !fallbackModel.isBlank() && !fallbackModel.equals(model)) {
                log.warn("Gemini 403 on primary model {}. Falling back to {}.", model, fallbackModel);
                return postGenerateContent(fallbackModel, body, false);
            }
            throw e;
        }
    }

    /** 429 원인에 따른 사용자 친화적 메시지 생성 */
    private String buildQuotaMessage(Quota429Info info, String targetModel) {
        if (info.isFreeTier() && info.isDailyQuota()) {
            return String.format(
                "Gemini API 무료 티어 일간 한도(%s)가 소진되었습니다. " +
                "Google Cloud Console에서 결제를 활성화하면 유료 한도(RPM 2,000+)가 적용됩니다. " +
                "참고: https://console.cloud.google.com/billing",
                targetModel);
        }
        if (info.isFreeTier()) {
            long waitSec = info.retryDelayMs() / 1000;
            return String.format("AI 요청 한도에 도달했습니다(%s 무료 티어). %d초 후 다시 시도해 주세요.", targetModel, waitSec);
        }
        return String.format("AI 요청이 너무 많습니다(%s). %d초 후 다시 시도해 주세요.", targetModel, info.retryDelayMs() / 1000);
    }

    /**
     * 429 응답 본문에서 쿼터 타입과 재시도 대기 시간 파싱.
     * JSON 파싱 대신 간단한 문자열 검색으로 Jackson 의존 없이 처리.
     */
    private Quota429Info parse429Info(HttpClientErrorException e) {
        try {
            String body = e.getResponseBodyAsString();
            boolean isFreeTier = body.contains("free_tier") || body.contains("FreeTier");
            boolean isDailyQuota = body.contains("PerDay") || body.contains("GenerateRequestsPerDay");

            long retryDelayMs = 5_000L;
            int rdIdx = body.indexOf("\"retryDelay\"");
            if (rdIdx >= 0) {
                // "retryDelay":"52.98s" 형식 파싱
                int start = body.indexOf("\"", rdIdx + 12) + 1;
                int end = body.indexOf("\"", start);
                if (start > 0 && end > start) {
                    String delayStr = body.substring(start, end).replace("s", "").trim();
                    try {
                        double seconds = Double.parseDouble(delayStr);
                        retryDelayMs = (long) (seconds * 1000);
                    } catch (NumberFormatException ignored) {}
                }
            }
            return new Quota429Info(isFreeTier, isDailyQuota, retryDelayMs);
        } catch (Exception ex) {
            return new Quota429Info(false, false, 5_000L);
        }
    }

    /** 동시 호출 제한(Semaphore) + 호출 간 최소 간격을 적용해 호출 → RPM 초과 429 를 예방. */
    @SuppressWarnings("unchecked")
    private Map<String, Object> rateLimitedPost(String url, Map<String, Object> body) {
        boolean acquired = false;
        try {
            geminiConcurrency.acquire();
            acquired = true;
            synchronized (this) {
                long wait = (lastCallAtMs + MIN_CALL_GAP_MS) - System.currentTimeMillis();
                if (wait > 0) Thread.sleep(wait);
                lastCallAtMs = System.currentTimeMillis();
            }
            return restClient.post()
                    .uri(url)
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(body)
                    .retrieve()
                    .onStatus(status -> status.isError(), (req, res) -> {
                        String errBody = new String(res.getBody().readAllBytes());
                        log.error("Gemini API Error: Status={}, Body={}", res.getStatusCode(), errBody);
                        throw new HttpClientErrorException(res.getStatusCode(), res.getStatusText(), res.getHeaders(), errBody.getBytes(), null);
                    })
                    .body(Map.class);
        } catch (InterruptedException ie) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException("Gemini 레이트리밋 대기 중 인터럽트", ie);
        } finally {
            if (acquired) geminiConcurrency.release();
        }
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> postGenerateContent(String targetModel, Map<String, Object> body, boolean allowRetry) {
        String url = baseUrl + "/" + targetModel + ":generateContent?key=" + apiKey;
        int maxAttempts = allowRetry ? 2 : 1;

        for (int attempt = 1; attempt <= maxAttempts; attempt++) {
            try {
                return rateLimitedPost(url, body);
            } catch (HttpClientErrorException.TooManyRequests e) {
                Quota429Info info = parse429Info(e);
                log.warn("Gemini 429 on model={}. isFreeTier={}, isDailyQuota={}, retryDelayMs={}",
                        targetModel, info.isFreeTier(), info.isDailyQuota(), info.retryDelayMs());

                if (info.isFreeTier() && info.isDailyQuota()) {
                    // 일간 무료 한도 소진 — 재시도해도 무의미, 즉시 실패 → 상위 generateContent에서 fallback 모델로 전환
                    log.warn("Gemini free tier daily quota exhausted on model {}.", targetModel);
                    throw e;
                }

                if (attempt >= maxAttempts) {
                    throw e;
                }

                // RPM 한도: API가 알려준 retryDelay만큼만 기다린 후 1회 재시도 (최대 60s 캡)
                long waitMs = Math.min(info.retryDelayMs(), 60_000L);
                log.info("Gemini RPM 429 on model {}. Waiting {}ms before retry.", targetModel, waitMs);
                sleepMs(waitMs);
            }
        }

        throw new IllegalStateException("Gemini API 호출이 비정상 종료되었습니다.");
    }

    private void sleepMs(long ms) {
        try {
            Thread.sleep(ms);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException("Gemini API 대기 중 인터럽트 발생.", e);
        }
    }

    private void sleepBeforeRetry() {
        sleepMs(5_000L);
    }
}
