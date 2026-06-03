package com.DevBridge.devbridge.domain.ai.service.llm;

import java.util.List;

/**
 * 멀티 LLM 추상화 — Gemini / Anthropic Claude / OpenAI / Perplexity 공통 인터페이스.
 * - id()는 라우팅용 키 ("anthropic", "openai", "perplexity", "gemini")
 * - models()는 UI에 노출할 모델 목록
 * - available()는 키가 설정되어 있는지 (UI에서 비활성화 표시용)
 */
public interface LlmProvider {
    String id();
    String displayName();
    List<ModelInfo> models();
    boolean available();
    String oneShot(String systemInstruction, String userPrompt, String model);

    record ModelInfo(String id, String displayName, String description) {}
}
