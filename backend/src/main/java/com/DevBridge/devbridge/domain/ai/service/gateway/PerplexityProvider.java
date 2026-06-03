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
import java.util.Iterator;
import java.util.List;
import java.util.Map;

/**
 * Perplexity Sonar API (OpenAI 호환 chat completions + 웹 검색 인용 포함).
 * https://docs.perplexity.ai/api-reference/chat-completions
 *
 * 환경변수 PERPLEXITY_API_KEY 필요.
 * 응답 끝에 [출처] 섹션을 자동으로 붙여서 근거 데이터 표시.
 */
@Slf4j
@Component("aiPerplexityProvider")
public class PerplexityProvider implements AiProvider {

    private final String apiKey;
    private final String baseUrl;
    private final RestClient http;
    private final ObjectMapper om = new ObjectMapper();

    public PerplexityProvider(@Value("${perplexity.api.key:}") String apiKey,
                              @Value("${perplexity.api.url:https://api.perplexity.ai}") String baseUrl) {
        this.apiKey = apiKey;
        this.baseUrl = baseUrl;
        this.http = RestClient.create();
    }

    @Override public String providerKey() { return "PERPLEXITY"; }

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
        if (messages.stream().noneMatch(m -> "user".equals(m.get("role")))) {
            messages.add(Map.of("role", "user", "content", "안녕"));
        }
        return call(modelId, messages, 4096);
    }

    @Override
    public Result oneShot(String modelId, String systemInstruction, String userPrompt, boolean wantJson) {
        ensureKey();
        List<Map<String, Object>> messages = new ArrayList<>();
        if (systemInstruction != null && !systemInstruction.isBlank()) {
            messages.add(Map.of("role", "system", "content", systemInstruction));
        }
        String prompt = wantJson
                ? userPrompt + "\n\n반드시 JSON 객체 하나만 반환하라. 코드펜스 금지."
                : userPrompt;
        messages.add(Map.of("role", "user", "content", prompt));
        return call(modelId, messages, 8192);
    }

    private Result call(String modelId, List<Map<String, Object>> messages, int maxTokens) {
        Map<String, Object> body = new HashMap<>();
        body.put("model", modelId);
        body.put("messages", messages);
        body.put("max_tokens", maxTokens);

        try {
            String raw = http.post()
                    .uri(baseUrl + "/chat/completions")
                    .header("Authorization", "Bearer " + apiKey)
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(body)
                    .retrieve()
                    .body(String.class);
            JsonNode json = om.readTree(raw);
            String text = json.path("choices").path(0).path("message").path("content").asText("");

            // 인용 출처 부착 (Perplexity 고유)
            JsonNode citations = json.path("citations");
            if (citations.isArray() && citations.size() > 0) {
                StringBuilder sb = new StringBuilder(text).append("\n\n---\n**📚 출처**\n");
                int i = 1;
                for (Iterator<JsonNode> it = citations.elements(); it.hasNext(); i++) {
                    sb.append(i).append(". ").append(it.next().asText()).append("\n");
                }
                text = sb.toString();
            }

            long tIn = json.path("usage").path("prompt_tokens").asLong(0);
            long tOut = json.path("usage").path("completion_tokens").asLong(0);
            return new Result(text, tIn, tOut);
        } catch (HttpClientErrorException e) {
            log.warn("[Perplexity] HTTP {} body={}", e.getStatusCode(), e.getResponseBodyAsString());
            throw new RuntimeException("Perplexity API 호출 실패: " + e.getStatusCode());
        } catch (Exception e) {
            log.warn("[Perplexity] error: {}", e.getMessage());
            throw new RuntimeException("Perplexity API 호출 실패: " + e.getMessage());
        }
    }

    private void ensureKey() {
        if (!isAvailable()) {
            throw new IllegalStateException("PERPLEXITY_API_KEY 환경변수가 설정되지 않았습니다.");
        }
    }
}
