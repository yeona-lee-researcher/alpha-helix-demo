package com.DevBridge.devbridge.domain.payment.service;

import jakarta.annotation.PostConstruct;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import javax.crypto.Cipher;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.Base64;

/**
 * AES-256-GCM 암복호화 서비스.
 * KIS appsecret 같은 외부 자격증명을 DB에 저장하기 전에 반드시 통과시켜야 함.
 *
 * 포맷: Base64( IV(12bytes) || ciphertext || GCM_TAG(16bytes) )
 *  - 한 문자열로 보관 → 마이그레이션 단순
 *  - GCM은 인증 태그까지 포함 → 위변조 자동 탐지
 *
 * 키는 application.properties의 app.crypto.key (Base64 32바이트).
 * 운영에선 반드시 환경변수 APP_CRYPTO_KEY로 주입.
 */
@Service
@Slf4j
public class CryptoService {

    private static final String ALG = "AES";
    private static final String TRANSFORM = "AES/GCM/NoPadding";
    private static final int IV_LEN = 12;
    private static final int TAG_BITS = 128;

    private final SecretKey secretKey;
    private final SecureRandom rng = new SecureRandom();
    private final boolean devKey;
    private final String keyFingerprint;
    private final int keyB64Len;
    private final String keyB64Tail;

    public CryptoService(@Value("${app.crypto.key}") String base64Key) {
        String trimmed = base64Key == null ? "" : base64Key.trim();
        byte[] keyBytes;
        try {
            keyBytes = Base64.getDecoder().decode(trimmed);
        } catch (IllegalArgumentException e) {
            throw new IllegalStateException("app.crypto.key는 Base64로 인코딩된 32바이트여야 합니다.", e);
        }
        if (keyBytes.length != 32) {
            throw new IllegalStateException("app.crypto.key는 정확히 32바이트(=AES-256)이어야 합니다. 현재: " + keyBytes.length + "바이트");
        }
        this.secretKey = new SecretKeySpec(keyBytes, ALG);
        this.devKey = trimmed.startsWith("dev-only")
                || "AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8=".equals(trimmed);
        this.keyB64Len = trimmed.length();
        this.keyB64Tail = trimmed.length() >= 4 ? trimmed.substring(trimmed.length() - 4) : "(short)";
        this.keyFingerprint = sha256Hex8(keyBytes);
    }

    @PostConstruct
    void warn() {
        // 시작 시점에 어떤 키가 active 인지 fingerprint 로 식별 (값 자체는 노출 안 함)
        log.info("[CryptoService] app.crypto.key loaded — b64len={} b64tail=...{}  sha256[0..8]={} dev={}",
                keyB64Len, keyB64Tail, keyFingerprint, devKey);
        if (devKey) {
            log.warn("⚠️  app.crypto.key가 개발용 기본값입니다. 운영 배포 전 반드시 APP_CRYPTO_KEY 환경변수로 교체하세요.");
        }
    }

    private static String sha256Hex8(byte[] data) {
        try {
            byte[] h = MessageDigest.getInstance("SHA-256").digest(data);
            StringBuilder sb = new StringBuilder();
            for (int i = 0; i < 4 && i < h.length; i++) sb.append(String.format("%02x", h[i]));
            return sb.toString();
        } catch (Exception e) {
            return "(err)";
        }
    }

    /** 평문 → Base64(IV+CT+TAG) */
    public String encrypt(String plain) {
        if (plain == null) return null;
        try {
            byte[] iv = new byte[IV_LEN];
            rng.nextBytes(iv);
            Cipher c = Cipher.getInstance(TRANSFORM);
            c.init(Cipher.ENCRYPT_MODE, secretKey, new GCMParameterSpec(TAG_BITS, iv));
            byte[] ct = c.doFinal(plain.getBytes(StandardCharsets.UTF_8));
            byte[] out = new byte[iv.length + ct.length];
            System.arraycopy(iv, 0, out, 0, iv.length);
            System.arraycopy(ct, 0, out, iv.length, ct.length);
            return Base64.getEncoder().encodeToString(out);
        } catch (Exception e) {
            throw new RuntimeException("encrypt failed", e);
        }
    }

    /** Base64(IV+CT+TAG) → 평문 */
    public String decrypt(String encoded) {
        if (encoded == null) return null;
        try {
            byte[] all = Base64.getDecoder().decode(encoded);
            if (all.length < IV_LEN + 16) throw new IllegalArgumentException("ciphertext too short");
            byte[] iv = new byte[IV_LEN];
            System.arraycopy(all, 0, iv, 0, IV_LEN);
            byte[] ct = new byte[all.length - IV_LEN];
            System.arraycopy(all, IV_LEN, ct, 0, ct.length);
            Cipher c = Cipher.getInstance(TRANSFORM);
            c.init(Cipher.DECRYPT_MODE, secretKey, new GCMParameterSpec(TAG_BITS, iv));
            return new String(c.doFinal(ct), StandardCharsets.UTF_8);
        } catch (Exception e) {
            throw new RuntimeException("decrypt failed (key mismatch or tampered ciphertext)", e);
        }
    }

    /** 화면 노출용 마스킹: 앞 4 + 마지막 4만 보이고 나머지 *. */
    public static String mask(String v) {
        if (v == null || v.length() <= 8) return "********";
        return v.substring(0, 4) + "*".repeat(Math.max(4, v.length() - 8)) + v.substring(v.length() - 4);
    }
}
