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

/** OpenAI Chat Completions — gpt-4o, gpt-4o-mini, o1-preview. 환경변수 OPENAI_API_KEY 필요. */
@Component
public class OpenAiProvider implements LlmProvider {
    private static final Logger log = LoggerFactory.getLogger(OpenAiProvider.class);
    private static final String API_URL = "https://api.openai.com/v1/chat/completions";

    private final String apiKey;
    private final RestClient client;
    private final ObjectMapper mapper = new ObjectMapper();

    public OpenAiProvider(@Value("${openai.api.key:}") String apiKey) {
        this.apiKey = apiKey;
        this.client = RestClient.builder().build();
    }

    @Override public String id() { return "openai"; }
    @Override public String displayName() { return "OpenAI GPT"; }
    @Override public boolean available() { return apiKey != null && !apiKey.isBlank(); }
    @Override public List<ModelInfo> models() {
        return List.of(
            new ModelInfo("gpt-4o",       "GPT-4o",       "범용 멀티모달"),
            new ModelInfo("gpt-4o-mini",  "GPT-4o mini",  "저비용·빠름"),
            new ModelInfo("o1-preview",   "o1 preview",   "복잡 추론 (느림)")
        );
    }

    @Override
    public String oneShot(String systemInstruction, String userPrompt, String model) {
        if (!available()) throw new IllegalStateException("OPENAI_API_KEY 가 설정되지 않았습니다.");
        String useModel = (model == null || model.isBlank()) ? "gpt-4o-mini" : model;

        var messages = new java.util.ArrayList<Map<String, Object>>();
        if (systemInstruction != null && !systemInstruction.isBlank()) {
            messages.add(Map.of("role", "system", "content", systemInstruction));
        }
        messages.add(Map.of("role", "user", "content", userPrompt));

        Map<String, Object> body = new java.util.HashMap<>();
        body.put("model", useModel);
        body.put("messages", messages);
        // o1 시리즈는 temperature 미지원
        if (!useModel.startsWith("o1")) {
            body.put("temperature", 0.3);
        }

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
            log.error("OpenAI 호출 실패", e);
            throw new RuntimeException("GPT 호출 실패: " + e.getMessage());
        }
    }
}
