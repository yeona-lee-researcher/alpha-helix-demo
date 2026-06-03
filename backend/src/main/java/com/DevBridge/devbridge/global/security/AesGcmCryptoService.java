package com.DevBridge.devbridge.global.security;

import jakarta.annotation.PostConstruct;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import javax.crypto.Cipher;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import java.nio.ByteBuffer;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.Base64;

/**
 * AES-GCM 대칭 암호화 서비스. GitHub PAT 등 민감 토큰을 DB 저장 전에 암호화한다.
 *
 * <p>키는 환경변수 {@code GITHUB_TOKEN_ENCRYPTION_KEY} 또는 fallback 으로 {@code JWT_SECRET}
 * 의 SHA-256 해시 32바이트를 사용한다. 운영 환경에서는 반드시 별도 키를 발급할 것.
 *
 * <p>저장 형식: [12B IV][N B ciphertext+tag]
 */
@Slf4j
@Service
public class AesGcmCryptoService {

    private static final int IV_LENGTH = 12;
    private static final int TAG_LENGTH_BITS = 128;
    private static final String TRANSFORMATION = "AES/GCM/NoPadding";

    @Value("${app.crypto.key:}")
    private String configuredKey;

    @Value("${app.jwt.secret:dev-bridge-default-secret-key-change-in-production-please-32bytes}")
    private String jwtSecretFallback;

    private SecretKey secretKey;
    private final SecureRandom rng = new SecureRandom();

    @PostConstruct
    void init() throws Exception {
        String raw = (configuredKey != null && !configuredKey.isBlank()) ? configuredKey : jwtSecretFallback;
        byte[] keyBytes = MessageDigest.getInstance("SHA-256").digest(raw.getBytes());
        this.secretKey = new SecretKeySpec(keyBytes, "AES");
        log.info("AesGcmCryptoService initialized (key source: {})",
                (configuredKey != null && !configuredKey.isBlank()) ? "app.crypto.key" : "JWT secret fallback");
    }

    public byte[] encrypt(String plaintext) {
        if (plaintext == null) return null;
        try {
            byte[] iv = new byte[IV_LENGTH];
            rng.nextBytes(iv);
            Cipher cipher = Cipher.getInstance(TRANSFORMATION);
            cipher.init(Cipher.ENCRYPT_MODE, secretKey, new GCMParameterSpec(TAG_LENGTH_BITS, iv));
            byte[] ct = cipher.doFinal(plaintext.getBytes());
            return ByteBuffer.allocate(iv.length + ct.length).put(iv).put(ct).array();
        } catch (Exception e) {
            throw new IllegalStateException("AES-GCM encrypt failed", e);
        }
    }

    public String decrypt(byte[] payload) {
        if (payload == null || payload.length < IV_LENGTH + 1) return null;
        try {
            ByteBuffer bb = ByteBuffer.wrap(payload);
            byte[] iv = new byte[IV_LENGTH];
            bb.get(iv);
            byte[] ct = new byte[bb.remaining()];
            bb.get(ct);
            Cipher cipher = Cipher.getInstance(TRANSFORMATION);
            cipher.init(Cipher.DECRYPT_MODE, secretKey, new GCMParameterSpec(TAG_LENGTH_BITS, iv));
            return new String(cipher.doFinal(ct));
        } catch (Exception e) {
            throw new IllegalStateException("AES-GCM decrypt failed", e);
        }
    }

    public String encryptToBase64(String plaintext) {
        byte[] payload = encrypt(plaintext);
        return payload == null ? null : Base64.getEncoder().encodeToString(payload);
    }

    public String decryptFromBase64(String b64) {
        if (b64 == null || b64.isBlank()) return null;
        return decrypt(Base64.getDecoder().decode(b64));
    }
}
