package com.DevBridge.devbridge.domain.ai.service.llm;

import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

/** providerId 기반 LLM 라우팅. 키 미설정시 사용 가능한 다른 프로바이더로 fallback. */
@Service
public class LlmRouter {
    private final Map<String, LlmProvider> providers;
    private final List<LlmProvider> ordered;

    public LlmRouter(List<LlmProvider> providers) {
        // Bean 주입 순서 그대로 보존 (UI 표시 순서)
        this.ordered = providers;
        this.providers = providers.stream().collect(Collectors.toMap(LlmProvider::id, p -> p));
    }

    public List<LlmProvider> all() { return ordered; }

    public LlmProvider get(String id) {
        if (id == null || id.isBlank()) return defaultProvider();
        LlmProvider p = providers.get(id);
        if (p == null || !p.available()) return defaultProvider();
        return p;
    }

    /** 사용 가능한 첫 번째 프로바이더 (Gemini가 가장 흔히 설정됨) */
    public LlmProvider defaultProvider() {
        return ordered.stream()
            .filter(LlmProvider::available)
            .findFirst()
            .orElseThrow(() -> new IllegalStateException("사용 가능한 LLM 프로바이더가 없습니다. 환경변수에 API 키를 설정해주세요."));
    }

    /** providerId/modelId 조합으로 단발성 호출 */
    public String oneShot(String providerId, String modelId, String systemInstruction, String userPrompt) {
        return get(providerId).oneShot(systemInstruction, userPrompt, modelId);
    }
}
