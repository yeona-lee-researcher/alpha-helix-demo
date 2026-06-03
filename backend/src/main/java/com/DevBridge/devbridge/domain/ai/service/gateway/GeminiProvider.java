package com.DevBridge.devbridge.domain.ai.service.gateway;

import com.DevBridge.devbridge.domain.ai.dto.AiChatRequest;
import com.DevBridge.devbridge.domain.ai.service.GeminiService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

/**
 * 기존 GeminiService를 AiProvider 인터페이스로 감싸는 어댑터.
 * 토큰 사용량은 응답 길이 기준 추정값(정확한 사용량은 Gemini Response usageMetadata 파싱 필요).
 */
@Component("aiGeminiProvider")
@RequiredArgsConstructor
public class GeminiProvider implements AiProvider {

    private final GeminiService geminiService;

    @Override public String providerKey() { return "GEMINI"; }

    @Override public boolean isAvailable() { return geminiService.hasApiKey(); }

    @Override
    public Result chat(String modelId, AiChatRequest request) {
        String text = geminiService.chat(request);
        long tIn = estimateTokens(buildPromptText(request));
        long tOut = estimateTokens(text);
        return new Result(text, tIn, tOut);
    }

    @Override
    public Result oneShot(String modelId, String systemInstruction, String userPrompt, boolean wantJson) {
        String text = geminiService.oneShot(systemInstruction, userPrompt, wantJson);
        long tIn = estimateTokens((systemInstruction == null ? "" : systemInstruction) + " " + userPrompt);
        long tOut = estimateTokens(text);
        return new Result(text, tIn, tOut);
    }

    private String buildPromptText(AiChatRequest req) {
        StringBuilder sb = new StringBuilder();
        if (req.getSystemInstruction() != null) sb.append(req.getSystemInstruction()).append("\n");
        if (req.getHistory() != null) {
            for (var m : req.getHistory()) {
                if (m.getText() != null) sb.append(m.getText()).append("\n");
            }
        }
        return sb.toString();
    }

    /** 영문 ~4자=1토큰, 한글 ~1.5자=1토큰. 보수적으로 chars/3 사용. */
    static long estimateTokens(String s) {
        if (s == null || s.isEmpty()) return 0;
        return Math.max(1, s.length() / 3);
    }
}
