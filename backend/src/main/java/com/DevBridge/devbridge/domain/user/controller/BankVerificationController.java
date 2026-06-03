package com.DevBridge.devbridge.domain.user.controller;

import com.DevBridge.devbridge.domain.user.entity.User;
import com.DevBridge.devbridge.global.security.AuthContext;
import com.DevBridge.devbridge.domain.user.service.BankVerificationService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/bank")
@RequiredArgsConstructor
public class BankVerificationController {

    private final BankVerificationService bankVerificationService;

    @PostMapping("/send-code")
    public ResponseEntity<Map<String, Object>> sendCode() {
        Long userId = AuthContext.currentUserId();
        if (userId == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                    .body(Map.of("message", "로그인이 필요합니다."));
        }
        try {
            String mockCode = bankVerificationService.sendCode(userId);
            return ResponseEntity.ok(Map.of(
                "message", "인증번호가 발급되었습니다.",
                "mockCode", mockCode
            ));
        } catch (RuntimeException e) {
            return ResponseEntity.badRequest().body(Map.of("message", e.getMessage()));
        }
    }

    @PostMapping("/verify-code")
    public ResponseEntity<Map<String, String>> verifyCode(@RequestBody Map<String, String> req) {
        Long userId = AuthContext.currentUserId();
        if (userId == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                    .body(Map.of("message", "로그인이 필요합니다."));
        }
        try {
            bankVerificationService.verifyAndSave(
                userId,
                req.get("code"),
                req.get("bankName"),
                req.get("accountNumber"),
                req.get("accountHolder")
            );
            return ResponseEntity.ok(Map.of("message", "계좌 인증이 완료되었습니다."));
        } catch (RuntimeException e) {
            return ResponseEntity.badRequest().body(Map.of("message", e.getMessage()));
        }
    }

    /**
     * 저장된 계좌 정보 조회. 비인증 상태에서도 빈 객체를 200으로 반환
     * (페이지 마운트 시 자동 호출되므로 401 으로 로그인 튕김을 방지).
     */
    @GetMapping("/account")
    public ResponseEntity<Map<String, Object>> getAccount() {
        Long userId = AuthContext.currentUserId();
        if (userId == null) {
            return ResponseEntity.ok(Map.of(
                "bankName", "",
                "accountNumber", "",
                "accountHolder", "",
                "verified", false
            ));
        }
        try {
            User user = bankVerificationService.getAccount(userId);
            return ResponseEntity.ok(Map.of(
                "bankName",      user.getBankName() != null ? user.getBankName() : "",
                "accountNumber", user.getBankAccountNumber() != null ? user.getBankAccountNumber() : "",
                "accountHolder", user.getBankAccountHolderName() != null ? user.getBankAccountHolderName() : "",
                "verified",      user.isBankVerified()
            ));
        } catch (RuntimeException e) {
            return ResponseEntity.badRequest().body(Map.of("message", e.getMessage()));
        }
    }
}
