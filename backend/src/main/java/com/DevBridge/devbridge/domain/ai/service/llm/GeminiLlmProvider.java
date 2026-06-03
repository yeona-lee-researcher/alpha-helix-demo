package com.DevBridge.devbridge.domain.ai.service.llm;

import com.DevBridge.devbridge.domain.ai.service.GeminiService;
import org.springframework.stereotype.Component;

import java.util.List;

@Component
public class GeminiLlmProvider implements LlmProvider {
    private final GeminiService gemini;

    public GeminiLlmProvider(GeminiService gemini) { this.gemini = gemini; }

    @Override public String id() { return "gemini"; }
    @Override public String displayName() { return "Google Gemini"; }
    @Override public List<ModelInfo> models() {
        return List.of(
            new ModelInfo("gemini-2.5-flash", "Gemini 2.5 Flash", "빠른 응답, 일반 작업"),
            new ModelInfo("gemini-2.5-pro",   "Gemini 2.5 Pro",   "복잡한 추론용")
        );
    }
    @Override public boolean available() { return gemini.hasApiKey(); }
    @Override public String oneShot(String systemInstruction, String userPrompt, String model) {
        // 모델 파라미터는 GeminiService 내부 기본값 사용 (현재 구조상 동적 변경은 별도 PR)
        return gemini.oneShot(systemInstruction, userPrompt);
    }
}
