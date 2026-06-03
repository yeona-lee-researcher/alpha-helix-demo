package com.DevBridge.devbridge.domain.ai.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class AiChatResponse {
    private String reply;   // Gemini가 생성한 답변
    private String error;   // 오류 시 메시지
}
