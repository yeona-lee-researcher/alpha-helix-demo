package com.DevBridge.devbridge.domain.ai.service.llm;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

import java.time.Duration;
import java.util.List;
import java.util.Map;

/**
 * Anthropic Claude (Messages API) — claude-opus-4-7 / claude-sonnet-4-6 / claude-sonnet-4-5
 * 환경변수 ANTHROPIC_API_KEY 필요.
 */
@Component
public class AnthropicProvider implements LlmProvider {
    private static final Logger log = LoggerFactory.getLogger(AnthropicProvider.class);
    private static final String API_URL = "https://api.anthropic.com/v1/messages";
    private static final String API_VERSION = "2023-06-01";

    private final String apiKey;
    private final RestClient client;
    private final ObjectMapper mapper = new ObjectMapper();

    public AnthropicProvider(@Value("${anthropic.api.key:}") String apiKey) {
        this.apiKey = apiKey;
        this.client = RestClient.builder().build();
    }

    @Override public String id() { return "anthropic"; }
    @Override public String displayName() { return "Anthropic Claude"; }
    @Override public boolean available() { return apiKey != null && !apiKey.isBlank(); }
    @Override public List<ModelInfo> models() {
        return List.of(
            new ModelInfo("claude-opus-4-7",     "Claude Opus 4.7",    "최고 성능 (전략 정형화·복잡 추론)"),
            new ModelInfo("claude-sonnet-4-6",   "Claude Sonnet 4.6",  "균형 (일반 채팅·브리핑)"),
            new ModelInfo("claude-sonnet-4-5",   "Claude Sonnet 4.5",  "안정 검증 모델")
        );
    }

    @Override
    public String oneShot(String systemInstruction, String userPrompt, String model) {
        if (!available()) throw new IllegalStateException("ANTHROPIC_API_KEY 가 설정되지 않았습니다.");
        String useModel = (model == null || model.isBlank()) ? "claude-sonnet-4-5" : model;

        Map<String, Object> body = new java.util.HashMap<>();
        body.put("model", useModel);
        body.put("max_tokens", 8192);
        body.put("temperature", 0.3);
        if (systemInstruction != null && !systemInstruction.isBlank()) {
            body.put("system", systemInstruction);
        }
        body.put("messages", List.of(Map.of(
            "role", "user",
            "content", userPrompt
        )));

        try {
            String response = client.post()
                .uri(API_URL)
                .header("x-api-key", apiKey)
                .header("anthropic-version", API_VERSION)
                .contentType(MediaType.APPLICATION_JSON)
                .body(body)
                .retrieve()
                .body(String.class);

            JsonNode root = mapper.readTree(response);
            JsonNode content = root.path("content");
            if (content.isArray() && content.size() > 0) {
                return content.get(0).path("text").asText("");
            }
            return "(빈 응답)";
        } catch (Exception e) {
            log.error("Anthropic 호출 실패", e);
            throw new RuntimeException("Claude 호출 실패: " + e.getMessage());
        }
    }
}
