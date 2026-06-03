package com.DevBridge.devbridge.domain.ai.service.llm;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

import java.util.List;
import java.util.Map;

/** Perplexity Sonar — 웹검색 기반 답변. 환경변수 PERPLEXITY_API_KEY 필요. */
@Component
public class PerplexityProvider implements LlmProvider {
    private static final Logger log = LoggerFactory.getLogger(PerplexityProvider.class);
    private static final String API_URL = "https://api.perplexity.ai/chat/completions";

    private final String apiKey;
    private final RestClient client;
    private final ObjectMapper mapper = new ObjectMapper();

    public PerplexityProvider(@Value("${perplexity.api.key:}") String apiKey) {
        this.apiKey = apiKey;
        this.client = RestClient.builder().build();
    }

    @Override public String id() { return "perplexity"; }
    @Override public String displayName() { return "Perplexity Sonar"; }
    @Override public boolean available() { return apiKey != null && !apiKey.isBlank(); }
    @Override public List<ModelInfo> models() {
        return List.of(
            new ModelInfo("sonar-pro",       "Sonar Pro",       "고품질 웹검색 답변"),
            new ModelInfo("sonar",           "Sonar",           "기본 검색 답변"),
            new ModelInfo("sonar-reasoning", "Sonar Reasoning", "추론 + 검색")
        );
    }

    @Override
    public String oneShot(String systemInstruction, String userPrompt, String model) {
        if (!available()) throw new IllegalStateException("PERPLEXITY_API_KEY 가 설정되지 않았습니다.");
        String useModel = (model == null || model.isBlank()) ? "sonar-pro" : model;

        var messages = new java.util.ArrayList<Map<String, Object>>();
        if (systemInstruction != null && !systemInstruction.isBlank()) {
            messages.add(Map.of("role", "system", "content", systemInstruction));
        }
        messages.add(Map.of("role", "user", "content", userPrompt));

        Map<String, Object> body = Map.of(
            "model", useModel,
            "messages", messages,
            "temperature", 0.3
        );

        try {
            String response = client.post()
                .uri(API_URL)
                .header("Authorization", "Bearer " + apiKey)
                .contentType(MediaType.APPLICATION_JSON)
                .body(body)
                .retrieve()
                .body(String.class);

            JsonNode root = mapper.readTree(response);
            return root.path("choices").path(0).path("message").path("content").asText("(빈 응답)");
        } catch (Exception e) {
            log.error("Perplexity 호출 실패", e);
            throw new RuntimeException("Perplexity 호출 실패: " + e.getMessage());
        }
    }
}
