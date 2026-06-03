package com.DevBridge.devbridge.global.security;

import jakarta.servlet.http.HttpServletRequest;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

/**
 * 컨트롤러에서 현재 인증된 사용자 ID를 꺼내는 헬퍼.
 * (Spring Security 미사용 경량 구현)
 */
public final class AuthContext {

    private AuthContext() {}

    /** 백그라운드 잡(스케줄러 등) HTTP 컨텍스트 부재 시 임시 사용자 주입용 */
    private static final ThreadLocal<Long> OVERRIDE_USER_ID = new ThreadLocal<>();

    /** 현재 스레드에 임시 user_id 설정 (예: 스케줄러). 반드시 finally에서 clear() */
    public static void set(Long userId) {
        if (userId != null) OVERRIDE_USER_ID.set(userId);
    }

    public static void clear() {
        OVERRIDE_USER_ID.remove();
    }

    public static Long currentUserId() {
        Long override = OVERRIDE_USER_ID.get();
        if (override != null) return override;
        HttpServletRequest req = currentRequest();
        if (req == null) return null;
        Object v = req.getAttribute(JwtAuthenticationFilter.ATTR_USER_ID);
        return v instanceof Long ? (Long) v : null;
    }

    public static String currentUserType() {
        HttpServletRequest req = currentRequest();
        if (req == null) return null;
        Object v = req.getAttribute(JwtAuthenticationFilter.ATTR_USER_TYPE);
        return v != null ? v.toString() : null;
    }

    public static Long requireUserId() {
        Long id = currentUserId();
        if (id == null) throw new RuntimeException("인증이 필요합니다.");
        return id;
    }

    private static HttpServletRequest currentRequest() {
        var attrs = RequestContextHolder.getRequestAttributes();
        if (attrs instanceof ServletRequestAttributes sra) {
            return sra.getRequest();
        }
        return null;
    }
}

