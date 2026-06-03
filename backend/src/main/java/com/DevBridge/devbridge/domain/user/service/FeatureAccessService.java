package com.DevBridge.devbridge.domain.user.service;

import com.DevBridge.devbridge.domain.user.entity.User;
import com.DevBridge.devbridge.domain.user.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * 기능 접근 게이팅 — 특히 <b>Developer Studio + Claude BYOK</b> 접근.
 *
 * <p>정책: 구독 {@code STANDARD} 이상이면 Developer Studio(코드 IDE + 본인 Claude 키 연동)가 열린다.
 * 추가로 <b>서버사이드 allowlist</b>(이메일)에 있으면 플랜과 무관하게 항상 허용한다.
 *
 * <p>⚠️ allowlist 는 반드시 서버 설정({@code app.access.developer-allowlist}, env {@code DEVELOPER_ALLOWLIST})으로만
 * 관리한다. 프론트엔드 하드코딩 금지 — 과거 M6(실명 Gmail PII가 번들에 노출)의 재발을 막기 위함.
 */
@Service
@RequiredArgsConstructor
public class FeatureAccessService {

    private final UserRepository userRepository;

    /** 쉼표 구분 이메일. 운영: env DEVELOPER_ALLOWLIST. 로컬: application-local.properties(gitignore). */
    @Value("${app.access.developer-allowlist:}")
    private String allowlistRaw;

    private Set<String> allowlist() {
        if (allowlistRaw == null || allowlistRaw.isBlank()) return Set.of();
        return Arrays.stream(allowlistRaw.split(","))
                .map(String::trim).filter(s -> !s.isEmpty()).map(String::toLowerCase)
                .collect(Collectors.toSet());
    }

    private boolean inAllowlist(User u) {
        return u != null && u.getEmail() != null && allowlist().contains(u.getEmail().toLowerCase());
    }

    /** Developer Studio + BYOK(Claude) 사용 가능 여부. */
    @Transactional(readOnly = true)
    public boolean canUseDeveloper(Long uid) {
        if (uid == null) return false;
        User u = userRepository.findById(uid).orElse(null);
        if (u == null) return false;
        if (inAllowlist(u)) return true;
        User.UserType t = u.getUserType();
        return t == User.UserType.STANDARD || t == User.UserType.PREMIUM;
    }

    /** 프론트 게이팅 UI 용 — 접근 가능 여부 + 사유 + 등급. (키/이메일 등 민감정보 미포함) */
    @Transactional(readOnly = true)
    public Map<String, Object> accessInfo(Long uid) {
        User u = uid == null ? null : userRepository.findById(uid).orElse(null);
        boolean byAllow = inAllowlist(u);
        User.UserType t = u == null ? null : u.getUserType();
        boolean allowed = byAllow || t == User.UserType.STANDARD || t == User.UserType.PREMIUM;
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("developer", allowed);
        m.put("reason", allowed ? (byAllow ? "allowlist" : "subscription") : "locked");
        m.put("userType", t == null ? "FREE" : t.name());
        m.put("requiredPlan", "STANDARD");
        return m;
    }
}
