package com.DevBridge.devbridge.global.security;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import javax.crypto.SecretKey;
import java.nio.charset.StandardCharsets;
import java.util.Date;
import java.util.Map;

/**
 * JWT 토큰 생성/검증 유틸.
 * - HS256 대칭키.
 * - 비밀키는 application.properties: app.jwt.secret (32바이트 이상 권장).
 */
@Component
public class JwtUtil {

    private final SecretKey key;
    private final long ttlMillis;

    public JwtUtil(
            @Value("${app.jwt.secret:dev-bridge-default-secret-key-change-in-production-please}") String secret,
            @Value("${app.jwt.ttl-hours:1}") long ttlHours
    ) {
        byte[] bytes = secret.getBytes(StandardCharsets.UTF_8);
        if (bytes.length < 32) {
            // 32바이트 미만이면 패딩 (개발 편의)
            byte[] padded = new byte[32];
            System.arraycopy(bytes, 0, padded, 0, bytes.length);
            bytes = padded;
        }
        this.key = Keys.hmacShaKeyFor(bytes);
        this.ttlMillis = ttlHours * 60 * 60 * 1000L;
    }

    /**
     * 토큰 발행.
     * @param userId users.id (PK)
     * @param email  users.email (subject)
     * @param userType "PARTNER" | "CLIENT" | "ADMIN"
     */
    public String issue(Long userId, String email, String userType) {
        Date now = new Date();
        return Jwts.builder()
                .subject(email)
                .claims(Map.of(
                        "uid", userId,
                        "type", userType
                ))
                .issuedAt(now)
                .expiration(new Date(now.getTime() + ttlMillis))
                .signWith(key)
                .compact();
    }

    /** 토큰 검증 + claims 반환. 실패 시 RuntimeException. */
    public Claims parse(String token) {
        return Jwts.parser()
                .verifyWith(key)
                .build()
                .parseSignedClaims(token)
                .getPayload();
    }

    public Long extractUserId(String token) {
        Object uid = parse(token).get("uid");
        if (uid instanceof Number n) return n.longValue();
        return null;
    }
}

