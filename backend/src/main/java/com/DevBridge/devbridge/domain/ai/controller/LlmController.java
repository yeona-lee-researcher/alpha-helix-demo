package com.DevBridge.devbridge.domain.ai.controller;

import com.DevBridge.devbridge.domain.ai.service.llm.LlmProvider;
import com.DevBridge.devbridge.domain.ai.service.llm.LlmRouter;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * LLM 프로바이더/모델 메타정보 + 자유 채팅 엔드포인트.
 * Alpha-Helix 우측 채팅 도크에서 사용.
 */
@RestController
@RequestMapping("/api/llm")
public class LlmController {
    private final LlmRouter router;

    public LlmController(LlmRouter router) { this.router = router; }

    /** UI 모델 선택기에 띄울 프로바이더 목록 (가용여부 포함) */
    @GetMapping("/providers")
    public ResponseEntity<List<Map<String, Object>>> providers() {
        List<Map<String, Object>> result = router.all().stream().map(p -> {
            Map<String, Object> m = new HashMap<>();
            m.put("id", p.id());
            m.put("displayName", p.displayName());
            m.put("available", p.available());
            m.put("models", p.models().stream().map(mi -> {
                Map<String, Object> x = new HashMap<>();
                x.put("id", mi.id());
                x.put("displayName", mi.displayName());
                x.put("description", mi.description());
                return x;
            }).toList());
            return m;
        }).toList();
        return ResponseEntity.ok(result);
    }

    /** 자유 채팅 — 우측 도크의 Quick Ask 용 */
    @PostMapping("/chat")
    public ResponseEntity<?> chat(@RequestBody Map<String, Object> body) {
        try {
            String provider = (String) body.getOrDefault("provider", null);
            String model    = (String) body.getOrDefault("model", null);
            String system   = (String) body.getOrDefault("system", null);
            String prompt   = (String) body.get("prompt");
            if (prompt == null || prompt.isBlank()) {
                return ResponseEntity.badRequest().body(Map.of("error", "prompt가 비어있습니다"));
            }
            String reply = router.oneShot(provider, model, system, prompt);
            LlmProvider used = router.get(provider);
            return ResponseEntity.ok(Map.of(
                "reply", reply,
                "provider", used.id(),
                "providerName", used.displayName(),
                "model", model == null ? "(default)" : model
            ));
        } catch (Exception e) {
            return ResponseEntity.status(500).body(Map.of("error", e.getMessage()));
        }
    }
}
