package com.DevBridge.devbridge.domain.ai.service.gateway;

import com.DevBridge.devbridge.domain.ai.dto.AiChatRequest;

/**
 * AI LLM 프로바이더 공통 인터페이스.
 * 모델 ID로 매칭되는 구현체에 라우팅된다.
 */
public interface AiProvider {

    /** 이 프로바이더가 지원하는 provider 키 (예: "GEMINI", "ANTHROPIC", "OPENAI", "PERPLEXITY") */
    String providerKey();

    /** API 키 보유 여부 (없으면 게이트웨이가 요청 거부) */
    boolean isAvailable();

    /** 멀티턴 채팅. modelId는 catalog에서 라우팅된 실제 모델 식별자. */
    Result chat(String modelId, AiChatRequest request);

    /** 단발 호출 (시스템 프롬프트 + 단일 user 메시지). JSON 모드 지원이 가능하면 활성화. */
    Result oneShot(String modelId, String systemInstruction, String userPrompt, boolean wantJson);

    /** 호출 결과 + 토큰 사용량 (없으면 0). */
    record Result(String text, long tokensIn, long tokensOut) {}
}
