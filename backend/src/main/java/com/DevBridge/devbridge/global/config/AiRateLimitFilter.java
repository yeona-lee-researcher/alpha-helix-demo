package com.DevBridge.devbridge.global.config;

import com.DevBridge.devbridge.global.security.JwtAuthenticationFilter;
import io.github.bucket4j.Bandwidth;
import io.github.bucket4j.Bucket;
import io.github.bucket4j.Refill;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.time.Duration;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Bucket4j 기반 Rate Limiter — AI 채팅 / 백테스트 등 고비용 엔드포인트 보호.
 *
 * 적용 대상:
 *  - POST /api/alpha/workspaces/{id}/chat         → AI 채팅 (Gemini 호출)
 *  - POST /api/alpha/workspaces/{id}/formalize    → LLM 전략 정형화
 *  - POST /api/alpha/workspaces/{id}/briefing     → Living Briefing
 *  - POST /api/alpha/workspaces/{id}/auto-run     → 전체 파이프라인 실행
 *
 * 한도: 사용자당 시간당 20회 (FREE), 60회 (PRO 등급은 추후 확장)
 * 인메모리: 운영에서는 Redis + Bucket4j JCache 연동 권장
 */
@Slf4j
@Component
@Order(Ordered.HIGHEST_PRECEDENCE + 20)   // JwtAuthenticationFilter(+10) 다음에 실행 — 그래야 request attribute(userId)가 채워진 상태
public class AiRateLimitFilter extends OncePerRequestFilter {

    @Value("${app.ratelimit.ai-chat.capacity:20}")
    private int capacity;

    @Value("${app.ratelimit.ai-chat.refill-tokens:20}")
    private int refillTokens;

    @Value("${app.ratelimit.ai-chat.refill-minutes:60}")
    private int refillMinutes;

    /** userId → Bucket */
    private final Map<Long, Bucket> buckets = new ConcurrentHashMap<>();

    private static final String[] RATE_LIMITED_PATTERNS = {
        "/api/alpha/workspaces/",  // 하위 경로 중 아래 메서드만 체크
    };

    private static final String[] RATE_LIMITED_SUFFIXES = {
        "/chat", "/formalize", "/briefing", "/auto-run",
    };

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        if (!"POST".equalsIgnoreCase(request.getMethod())) return true;
        String path = request.getRequestURI();
        if (!path.startsWith("/api/alpha/workspaces/")) return true;
        for (String suffix : RATE_LIMITED_SUFFIXES) {
            if (path.endsWith(suffix)) return false;
        }
        return true;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request,
                                    HttpServletResponse response,
                                    FilterChain chain) throws ServletException, IOException {
        // 신원은 request attribute 에서 직접 읽는다. AuthContext.currentUserId() 는 RequestContextHolder 에 의존하는데
        // 서블릿 필터 단계에서는 (DispatcherServlet 진입 전이라) 아직 채워지지 않아 항상 null → 레이트리밋이 전원 무력화되던 버그.
        // JwtAuthenticationFilter(@Order +10)가 먼저 실행돼 이 attribute 를 채워둔다(@Order +20).
        Object uidAttr = request.getAttribute(JwtAuthenticationFilter.ATTR_USER_ID);
        Long userId = (uidAttr instanceof Long l) ? l : null;
        if (userId == null) {
            // 미인증 요청 — 대상 컨트롤러가 인증을 요구(401)하므로 여기서는 통과. (LLM 호출은 인증 통과 후에만 발생)
            chain.doFilter(request, response);
            return;
        }

        Bucket bucket = buckets.computeIfAbsent(userId, this::newBucket);
        if (bucket.tryConsume(1)) {
            chain.doFilter(request, response);
        } else {
            long availableIn = bucket.getAvailableTokens();
            log.warn("Rate limit exceeded: userId={} path={}", userId, request.getRequestURI());
            response.setStatus(HttpStatus.TOO_MANY_REQUESTS.value());
            response.setContentType(MediaType.APPLICATION_JSON_VALUE);
            response.setCharacterEncoding("UTF-8");
            response.getWriter().write(
                "{\"error\":\"요청이 너무 많습니다. AI 채팅은 1시간에 " + capacity + "회까지 가능합니다. 잠시 후 다시 시도해주세요.\"," +
                "\"remaining\":" + availableIn + "}"
            );
        }
    }

    private Bucket newBucket(Long userId) {
        Bandwidth limit = Bandwidth.classic(
            capacity,
            Refill.greedy(refillTokens, Duration.ofMinutes(refillMinutes))
        );
        return Bucket.builder().addLimit(limit).build();
    }
}
