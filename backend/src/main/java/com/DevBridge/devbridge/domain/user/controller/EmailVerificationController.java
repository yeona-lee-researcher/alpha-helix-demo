package com.DevBridge.devbridge.domain.user.controller;

import com.DevBridge.devbridge.domain.user.service.EmailVerificationService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@Slf4j
@RestController
@RequestMapping("/api/verify")
@RequiredArgsConstructor
public class EmailVerificationController {

    private final EmailVerificationService service;

    /** body: { "email": "..." } */
    @PostMapping("/send-code")
    public ResponseEntity<?> sendCode(@RequestBody Map<String, String> body) {
        String email = body.get("email");
        if (email == null || !email.contains("@")) {
            return ResponseEntity.badRequest().body(Map.of("error", "유효한 이메일이 필요해요."));
        }
        try {
            service.sendCode(email);
            return ResponseEntity.ok(Map.of("ok", true, "message", "인증번호를 발송했어요."));
        } catch (Exception e) {
            log.error("[Verify] 메일 발송 실패", e);
            return ResponseEntity.internalServerError()
                    .body(Map.of("error", "메일 발송 실패: " + e.getMessage()));
        }
    }

    /** body: { "email": "...", "code": "123456" } */
    @PostMapping("/check-code")
    public ResponseEntity<?> checkCode(@RequestBody Map<String, String> body) {
        String email = body.get("email");
        String code = body.get("code");
        boolean ok = service.verifyCode(email, code);
        if (!ok) {
            return ResponseEntity.status(400).body(Map.of("ok", false, "error", "인증번호가 일치하지 않거나 만료되었어요."));
        }
        return ResponseEntity.ok(Map.of("ok", true, "message", "인증 완료!"));
    }
}
