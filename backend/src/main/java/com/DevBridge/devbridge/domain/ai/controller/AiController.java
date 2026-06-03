package com.DevBridge.devbridge.domain.ai.controller;

import com.DevBridge.devbridge.domain.ai.dto.AiChatRequest;
import com.DevBridge.devbridge.domain.ai.dto.AiChatResponse;
import com.DevBridge.devbridge.global.security.AuthContext;
import com.DevBridge.devbridge.domain.ai.service.GeminiService;
import com.DevBridge.devbridge.domain.ai.service.gateway.AiGatewayService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.client.HttpClientErrorException;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/ai")
@RequiredArgsConstructor
public class AiController {

    private static final String DEFAULT_MODEL = "gemini-2.5-flash";

    private final GeminiService geminiService;
    private final AiGatewayService gateway;

    @PostMapping("/chat")
    public ResponseEntity<AiChatResponse> chat(@RequestBody AiChatRequest request) {
        try {
            Long uid = AuthContext.currentUserId();
            String reply;
            if (uid == null) {
                reply = geminiService.chat(request);
            } else {
                String model = request.getModel() == null || request.getModel().isBlank()
                        ? DEFAULT_MODEL : request.getModel();
                reply = gateway.chat(uid, model, request);
            }
            return ResponseEntity.ok(AiChatResponse.builder().reply(reply).build());
        } catch (HttpClientErrorException e) {
            String detail = e.getStatusCode() + " | " + e.getResponseBodyAsString();
            return ResponseEntity.internalServerError().body(
                    AiChatResponse.builder().error(detail).build()
            );
        } catch (IllegalStateException | IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(AiChatResponse.builder().error(e.getMessage()).build());
        } catch (Exception e) {
            return ResponseEntity.internalServerError().body(
                    AiChatResponse.builder().error(e.getMessage()).build()
            );
        }
    }

    @PostMapping("/extract")
    public ResponseEntity<AiChatResponse> extract(@RequestBody Map<String, String> body) {
        try {
            String systemInstruction = body.getOrDefault("systemInstruction", "");
            String text = body.getOrDefault("text", "");
            String model = body.getOrDefault("model", DEFAULT_MODEL);

            Long uid = AuthContext.currentUserId();
            String reply;
            if (uid == null) {
                reply = geminiService.oneShot(systemInstruction, text);
            } else {
                reply = gateway.oneShot(uid, model, systemInstruction, text, true);
            }
            return ResponseEntity.ok(AiChatResponse.builder().reply(reply).build());
        } catch (HttpClientErrorException e) {
            String detail = e.getStatusCode() + " | " + e.getResponseBodyAsString();
            return ResponseEntity.internalServerError().body(
                    AiChatResponse.builder().error(detail).build()
            );
        } catch (IllegalStateException | IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(AiChatResponse.builder().error(e.getMessage()).build());
        } catch (Exception e) {
            return ResponseEntity.internalServerError().body(
                    AiChatResponse.builder().error(e.getMessage()).build()
            );
        }
    }

    /** 현 사용자가 선택 가능한 모델 + 한도 + 잔여. */
    @GetMapping("/models")
    public ResponseEntity<List<Map<String, Object>>> models() {
        Long uid = AuthContext.currentUserId();
        if (uid == null) return ResponseEntity.status(401).build();
        return ResponseEntity.ok(gateway.listModelsFor(uid));
    }
}
