package com.DevBridge.devbridge.domain.user.service;

import com.DevBridge.devbridge.domain.payment.service.CryptoService;
import com.DevBridge.devbridge.domain.user.entity.UserApiKey;
import com.DevBridge.devbridge.domain.user.repository.UserApiKeyRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 사용자 BYOK API 키 관리 — 저장(암호화)/복호화/마스킹/삭제.
 *
 * <p>키는 {@link CryptoService}(AES-256-GCM)로 암호화해 {@link UserApiKey#getKeyEnc()} 에만 보관.
 * 복호화({@link #getDecryptedKey})는 Claude CLI 호출 직전 등 꼭 필요한 순간에만 호출하고,
 * 그 평문은 로그/응답/예외 메시지에 절대 싣지 않는다.
 */
@Service
@Slf4j
@RequiredArgsConstructor
public class UserApiKeyService {

    private final UserApiKeyRepository repo;
    private final CryptoService crypto;

    /** 키 저장(업서트). 평문은 즉시 암호화되고 메서드 밖으로 나가지 않는다. */
    @Transactional
    public void saveKey(Long userId, String provider, String rawKey) {
        String key = rawKey == null ? "" : rawKey.trim();
        if (key.isEmpty()) throw new IllegalArgumentException("API 키가 비어있습니다.");
        if (key.length() < 20) throw new IllegalArgumentException("API 키 형식이 올바르지 않습니다(너무 짧음).");
        if (UserApiKey.PROVIDER_ANTHROPIC.equals(provider) && !key.startsWith("sk-ant-")) {
            // 형식 경고만 — Anthropic 키는 보통 sk-ant- 로 시작. 미래 포맷 변경 대비 차단은 하지 않음.
            log.warn("[BYOK] user={} ANTHROPIC 키가 예상 prefix(sk-ant-)로 시작하지 않음 — 그대로 저장", userId);
        }
        UserApiKey e = repo.findByUserIdAndProvider(userId, provider).orElseGet(() ->
                UserApiKey.builder().userId(userId).provider(provider).build());
        e.setKeyEnc(crypto.encrypt(key));
        e.setKeyHint(hint(key));
        if (e.getCreatedAt() == null) e.setCreatedAt(LocalDateTime.now());
        repo.save(e);
        log.info("[BYOK] user={} provider={} 키 저장(암호화) hint={}", userId, provider, e.getKeyHint());
    }

    /** 복호화된 평문 키(없으면 null). 호출 즉시 사용하고 보관 금지. */
    @Transactional(readOnly = true)
    public String getDecryptedKey(Long userId, String provider) {
        return repo.findByUserIdAndProvider(userId, provider)
                .map(k -> {
                    try { return crypto.decrypt(k.getKeyEnc()); }
                    catch (Exception e) { log.warn("[BYOK] user={} provider={} 복호화 실패(키 재등록 필요)", userId, provider); return null; }
                })
                .orElse(null);
    }

    @Transactional(readOnly = true)
    public boolean hasKey(Long userId, String provider) {
        return repo.findByUserIdAndProvider(userId, provider).isPresent();
    }

    @Transactional
    public void deleteKey(Long userId, String provider) {
        repo.deleteByUserIdAndProvider(userId, provider);
        log.info("[BYOK] user={} provider={} 키 삭제", userId, provider);
    }

    /** 화면 노출용 — 마스킹 힌트만(평문 키 절대 미포함). */
    @Transactional(readOnly = true)
    public List<Map<String, Object>> listMasked(Long userId) {
        return repo.findByUserId(userId).stream().map(k -> {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("provider", k.getProvider());
            m.put("hint", k.getKeyHint());
            m.put("connected", true);
            m.put("updatedAt", k.getUpdatedAt());
            return m;
        }).toList();
    }

    /** "sk-ant" 같은 식별 가능한 앞부분 + … + 마지막 4. 평문 식별 불가. */
    private static String hint(String key) {
        if (key == null || key.length() < 8) return "********";
        String head = key.length() >= 10 ? key.substring(0, 6) : key.substring(0, 2);
        return head + "…" + key.substring(key.length() - 4);
    }
}
