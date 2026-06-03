package com.DevBridge.devbridge.domain.payment.controller;

import com.DevBridge.devbridge.domain.payment.dto.PaymentMethodCreateRequest;
import com.DevBridge.devbridge.domain.payment.dto.PaymentMethodResponse;
import com.DevBridge.devbridge.global.security.AuthContext;
import com.DevBridge.devbridge.domain.payment.service.PaymentMethodService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/payment-methods")
@RequiredArgsConstructor
public class PaymentMethodController {

    private final PaymentMethodService paymentMethodService;

    @GetMapping
    public ResponseEntity<?> list() {
        Long userId = AuthContext.currentUserId();
        if (userId == null) return unauthorized();
        return ResponseEntity.ok(paymentMethodService.listMine(userId));
    }

    @PostMapping
    public ResponseEntity<?> create(@RequestBody PaymentMethodCreateRequest req) {
        Long userId = AuthContext.currentUserId();
        if (userId == null) return unauthorized();
        try {
            PaymentMethodResponse created = paymentMethodService.create(userId, req);
            return ResponseEntity.status(HttpStatus.CREATED).body(created);
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("message", e.getMessage()));
        }
    }

    @PatchMapping("/{id}/default")
    public ResponseEntity<?> setDefault(@PathVariable Long id) {
        Long userId = AuthContext.currentUserId();
        if (userId == null) return unauthorized();
        try {
            return ResponseEntity.ok(paymentMethodService.setDefault(userId, id));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("message", e.getMessage()));
        }
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<?> delete(@PathVariable Long id) {
        Long userId = AuthContext.currentUserId();
        if (userId == null) return unauthorized();
        try {
            paymentMethodService.delete(userId, id);
            return ResponseEntity.noContent().build();
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("message", e.getMessage()));
        }
    }

    private static ResponseEntity<?> unauthorized() {
        return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                .body(Map.of("message", "로그인이 필요합니다."));
    }
}
