package com.DevBridge.devbridge.domain.ai.service.gateway;

import com.DevBridge.devbridge.domain.ai.dto.AiChatRequest;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.client.HttpClientErrorException;
import org.springframework.web.client.RestClient;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * OpenAI Chat Completions API.
 * https://platform.openai.com/docs/api-reference/chat
 *
 * 환경변수 OPENAI_API_KEY 필요.
 */
@Slf4j
@Component("aiOpenAiProvider")
public class OpenAiProvider implements AiProvider {

    private final String apiKey;
    private final String baseUrl;
    private final RestClient http;
    private final ObjectMapper om = new ObjectMapper();

    public OpenAiProvider(@Value("${openai.api.key:}") String apiKey,
                          @Value("${openai.api.url:https://api.openai.com}") String baseUrl) {
        this.apiKey = apiKey;
        this.baseUrl = baseUrl;
        this.http = RestClient.create();
    }

    @Override public String providerKey() { return "OPENAI"; }

    @Override public boolean isAvailable() { return apiKey != null && !apiKey.isBlank(); }

    @Override
    public Result chat(String modelId, AiChatRequest req) {
        ensureKey();
        List<Map<String, Object>> messages = new ArrayList<>();
        if (req.getSystemInstruction() != null && !req.getSystemInstruction().isBlank()) {
            messages.add(Map.of("role", "system", "content", req.getSystemInstruction()));
        }
        if (req.getHistory() != null) {
            for (var m : req.getHistory()) {
                String role = m.getRole();
                if (role == null) role = "user";
                role = role.equalsIgnoreCase("model") || role.equalsIgnoreCase("bot") ? "assistant"
                       : role.equalsIgnoreCase("assistant") ? "assistant" : "user";
                messages.add(Map.of("role", role, "content", m.getText() == null ? "" : m.getText()));
            }
        }
        if (messages.isEmpty() || messages.stream().noneMatch(m -> "user".equals(m.get("role")))) {
            messages.add(Map.of("role", "user", "content", "안녕"));
        }
        return call(modelId, messages, 4096, false);
    }

    @Override
    public Result oneShot(String modelId, String systemInstruction, String userPrompt, boolean wantJson) {
        ensureKey();
        List<Map<String, Object>> messages = new ArrayList<>();
        if (systemInstruction != null && !systemInstruction.isBlank()) {
            messages.add(Map.of("role", "system", "content", systemInstruction));
        }
        messages.add(Map.of("role", "user", "content", userPrompt));
        return call(modelId, messages, 8192, wantJson);
    }

    private Result call(String modelId, List<Map<String, Object>> messages, int maxTokens, boolean jsonMode) {
        Map<String, Object> body = new HashMap<>();
        body.put("model", modelId);
        body.put("messages", messages);
        body.put("max_tokens", maxTokens);
        if (jsonMode) {
            body.put("response_format", Map.of("type", "json_object"));
        }

        try {
            String raw = http.post()
                    .uri(baseUrl + "/v1/chat/completions")
                    .header("Authorization", "Bearer " + apiKey)
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(body)
                    .retrieve()
                    .body(String.class);
            JsonNode json = om.readTree(raw);
            String text = json.path("choices").path(0).path("message").path("content").asText("");
            long tIn = json.path("usage").path("prompt_tokens").asLong(0);
            long tOut = json.path("usage").path("completion_tokens").asLong(0);
            return new Result(text, tIn, tOut);
        } catch (HttpClientErrorException e) {
            log.warn("[OpenAI] HTTP {} body={}", e.getStatusCode(), e.getResponseBodyAsString());
            throw new RuntimeException("OpenAI API 호출 실패: " + e.getStatusCode());
        } catch (Exception e) {
            log.warn("[OpenAI] error: {}", e.getMessage());
            throw new RuntimeException("OpenAI API 호출 실패: " + e.getMessage());
        }
    }

    private void ensureKey() {
        if (!isAvailable()) {
            throw new IllegalStateException("OPENAI_API_KEY 환경변수가 설정되지 않았습니다.");
        }
    }
}
