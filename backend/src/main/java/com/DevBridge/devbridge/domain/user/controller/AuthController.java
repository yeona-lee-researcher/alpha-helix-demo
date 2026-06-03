package com.DevBridge.devbridge.domain.user.controller;

import com.DevBridge.devbridge.domain.user.dto.AuthResponse;
import com.DevBridge.devbridge.domain.user.dto.LoginRequest;
import com.DevBridge.devbridge.domain.user.dto.SignupRequest;
import com.DevBridge.devbridge.domain.user.entity.RefreshToken;
import com.DevBridge.devbridge.domain.user.entity.User;
import com.DevBridge.devbridge.domain.user.repository.RefreshTokenRepository;
import com.DevBridge.devbridge.domain.user.repository.UserRepository;
import com.DevBridge.devbridge.global.security.JwtUtil;
import com.DevBridge.devbridge.domain.user.service.AuthService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.ResponseCookie;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.client.RestTemplate;

import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import java.util.Arrays;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@Slf4j
@RestController
@RequestMapping("/api/auth")
@RequiredArgsConstructor
public class AuthController {

    public static final String AUTH_COOKIE_NAME    = "DEVBRIDGE_TOKEN";
    public static final String REFRESH_COOKIE_NAME = "DEVBRIDGE_REFRESH";

    private final AuthService authService;
    private final JwtUtil jwtUtil;
    private final RefreshTokenRepository refreshTokenRepository;
    private final UserRepository userRepository;

    private final RestTemplate restTemplate = new RestTemplate();

    @Value("${app.cookie.secure:false}")
    private boolean cookieSecure;

    @Value("${app.cookie.same-site:Lax}")
    private String cookieSameSite;

    @Value("${app.jwt.ttl-hours:1}")
    private long jwtTtlHours;

    @Value("${app.jwt.refresh-ttl-days:15}")
    private long refreshTtlDays;

    @Value("${github.client.id:}")
    private String githubClientId;

    @Value("${github.client.secret:}")
    private String githubClientSecret;

    // ───── Cookie builders ─────

    private ResponseCookie buildAuthCookie(String token) {
        return ResponseCookie.from(AUTH_COOKIE_NAME, token)
                .httpOnly(true)
                .secure(cookieSecure)
                .sameSite(cookieSameSite)
                .path("/")
                .maxAge(java.time.Duration.ofHours(jwtTtlHours))
                .build();
    }

    private ResponseCookie buildRefreshCookie(String token) {
        return ResponseCookie.from(REFRESH_COOKIE_NAME, token)
                .httpOnly(true)
                .secure(cookieSecure)
                .sameSite(cookieSameSite)
                .path("/api/auth")   // refresh 엔드포인트로만 전송
                .maxAge(java.time.Duration.ofDays(refreshTtlDays))
                .build();
    }

    private ResponseCookie buildClearCookie(String name, String path) {
        return ResponseCookie.from(name, "")
                .httpOnly(true)
                .secure(cookieSecure)
                .sameSite(cookieSameSite)
                .path(path)
                .maxAge(0)
                .build();
    }

    // ───── 토큰 쌍 발급 헬퍼 ─────

    private String issueRefreshToken(Long userId) {
        String raw = UUID.randomUUID().toString().replace("-", "");
        refreshTokenRepository.save(RefreshToken.of(userId, raw, refreshTtlDays));
        return raw;
    }

    private ResponseEntity.BodyBuilder withTokenCookies(String accessToken, String refreshToken) {
        return ResponseEntity.ok()
                .header(HttpHeaders.SET_COOKIE, buildAuthCookie(accessToken).toString())
                .header(HttpHeaders.SET_COOKIE, buildRefreshCookie(refreshToken).toString());
    }

    // ───── 엔드포인트 ─────

    @PostMapping("/signup")
    public ResponseEntity<AuthResponse> signup(@RequestBody SignupRequest request) {
        try {
            User user = authService.signup(request);
            String userType = user.getUserType() != null ? user.getUserType().name() : "GUEST";
            String access  = jwtUtil.issue(user.getId(), user.getEmail(), userType);
            String refresh = issueRefreshToken(user.getId());
            return withTokenCookies(access, refresh)
                    .body(AuthResponse.builder()
                            .userId(user.getId())
                            .email(user.getEmail())
                            .username(user.getUsername())
                            .phone(user.getPhone())
                            .birthDate(user.getBirthDate())
                            .userType(user.getUserType())
                            .githubUsername(user.getGithubUsername())
                            .token(access)
                            .message("회원가입이 완료되었습니다.")
                            .build());
        } catch (Exception e) {
            return ResponseEntity.badRequest().body(AuthResponse.builder()
                    .message(e.getMessage()).build());
        }
    }

    @PostMapping("/login")
    public ResponseEntity<AuthResponse> login(@RequestBody LoginRequest request) {
        try {
            User user = authService.login(request);
            String userType = user.getUserType() != null ? user.getUserType().name() : "GUEST";
            String access  = jwtUtil.issue(user.getId(), user.getEmail(), userType);
            String refresh = issueRefreshToken(user.getId());
            return withTokenCookies(access, refresh)
                    .body(AuthResponse.builder()
                            .userId(user.getId())
                            .email(user.getEmail())
                            .username(user.getUsername())
                            .phone(user.getPhone())
                            .birthDate(user.getBirthDate())
                            .userType(user.getUserType())
                            .githubUsername(user.getGithubUsername())
                            .token(access)
                            .message("로그인에 성공했습니다.")
                            .build());
        } catch (Exception e) {
            return ResponseEntity.badRequest().body(AuthResponse.builder()
                    .message(e.getMessage()).build());
        }
    }

    /**
     * Access Token 재발급.
     * DEVBRIDGE_REFRESH 쿠키를 읽어 DB 검증 후 새 Access Token 쿠키를 응답한다.
     */
    @PostMapping("/refresh")
    public ResponseEntity<?> refresh(HttpServletRequest request) {
        String rawToken = extractCookie(request, REFRESH_COOKIE_NAME);
        if (rawToken == null || rawToken.isBlank()) {
            return ResponseEntity.status(401).body(Map.of("message", "Refresh token 없음"));
        }

        RefreshToken rt = refreshTokenRepository.findByToken(rawToken).orElse(null);
        if (rt == null || rt.isExpired()) {
            if (rt != null) refreshTokenRepository.deleteByToken(rawToken);
            return ResponseEntity.status(401).body(Map.of("message", "Refresh token 만료 또는 유효하지 않음"));
        }

        User user = userRepository.findById(rt.getUserId()).orElse(null);
        if (user == null) {
            refreshTokenRepository.deleteByToken(rawToken);
            return ResponseEntity.status(401).body(Map.of("message", "사용자 없음"));
        }

        String userType = user.getUserType() != null ? user.getUserType().name() : "GUEST";
        String newAccess = jwtUtil.issue(user.getId(), user.getEmail(), userType);

        return ResponseEntity.ok()
                .header(HttpHeaders.SET_COOKIE, buildAuthCookie(newAccess).toString())
                .body(Map.of("message", "토큰 재발급 완료"));
    }

    @PostMapping("/social-login")
    public ResponseEntity<AuthResponse> socialLogin(@RequestBody Map<String, String> request) {
        String accessToken = request.get("accessToken");
        if (accessToken == null || accessToken.isBlank()) {
            return ResponseEntity.badRequest().body(AuthResponse.builder()
                    .message("소셜 로그인 토큰(accessToken)이 필요합니다.")
                    .build());
        }
        // 보안(C2): 클라이언트가 보낸 email 은 신뢰하지 않는다. accessToken 을 Google 에 직접 검증해 verified email 을 얻는다.
        //          (main 의 `email = request.get("email")` 인입은 위조 가능 — 이 PR 이 막는 취약점이라 폐기.)
        String email;
        try {
            email = verifyGoogleAccessToken(accessToken);
        } catch (Exception e) {
            return ResponseEntity.status(401).body(AuthResponse.builder()
                    .message("소셜 인증 검증 실패 — 다시 시도해 주세요.")
                    .build());
        }
        try {
            User user = authService.socialLogin(email);
            String userType = user.getUserType() != null ? user.getUserType().name() : "GUEST";
            String access  = jwtUtil.issue(user.getId(), user.getEmail(), userType);
            String refresh = issueRefreshToken(user.getId());
            return withTokenCookies(access, refresh)
                    .body(AuthResponse.builder()
                            .userId(user.getId())
                            .email(user.getEmail())
                            .username(user.getUsername())
                            .phone(user.getPhone())
                            .birthDate(user.getBirthDate())
                            .userType(user.getUserType())
                            .githubUsername(user.getGithubUsername())
                            .token(access)
                            .message("로그인에 성공했습니다.")
                            .build());
        } catch (Exception e) {
            return ResponseEntity.badRequest().body(AuthResponse.builder()
                    .message(e.getMessage()).build());
        }
    }

    /**
     * Google access_token 을 서버측에서 직접 검증하고 verified email 을 반환한다.
     * Google userinfo 엔드포인트를 호출하므로, 유효한 Google 토큰을 가진 사용자만 통과한다(클라이언트 email 위조 불가).
     */
    @SuppressWarnings("unchecked")
    private String verifyGoogleAccessToken(String accessToken) {
        var headers = new org.springframework.http.HttpHeaders();
        headers.set("Authorization", "Bearer " + accessToken);
        Map<String, Object> info = restTemplate.exchange(
                "https://www.googleapis.com/oauth2/v3/userinfo",
                HttpMethod.GET, new org.springframework.http.HttpEntity<>(headers), Map.class
        ).getBody();
        if (info == null) throw new RuntimeException("Google userinfo 응답 없음");
        Object email = info.get("email");
        if (email == null || String.valueOf(email).isBlank()) throw new RuntimeException("이메일 정보 없음");
        Object verified = info.get("email_verified");
        boolean isVerified = Boolean.TRUE.equals(verified) || "true".equalsIgnoreCase(String.valueOf(verified));
        if (!isVerified) throw new RuntimeException("이메일 미인증 Google 계정");
        return String.valueOf(email);
    }

    /**
     * GitHub OAuth 로그인.
     */
    @PostMapping("/github")
    public ResponseEntity<AuthResponse> githubLogin(@RequestBody Map<String, String> request) {
        String code        = request.get("code");
        String redirectUri = request.get("redirectUri");

        if (code == null || code.isBlank()) {
            return ResponseEntity.badRequest().body(AuthResponse.builder()
                    .message("GitHub code가 필요합니다.").build());
        }

        try {
            // 1. code → access_token 교환
            var tokenHeaders = new org.springframework.http.HttpHeaders();
            tokenHeaders.set("Accept", "application/json");
            Map<String, String> tokenBody = Map.of(
                    "client_id", githubClientId,
                    "client_secret", githubClientSecret,
                    "code", code,
                    "redirect_uri", redirectUri != null ? redirectUri : ""
            );
            @SuppressWarnings("unchecked")
            Map<String, Object> tokenResp = restTemplate.postForObject(
                    "https://github.com/login/oauth/access_token",
                    new org.springframework.http.HttpEntity<>(tokenBody, tokenHeaders),
                    Map.class
            );

            if (tokenResp == null || !tokenResp.containsKey("access_token")) {
                String errDesc = tokenResp != null ? String.valueOf(tokenResp.get("error_description")) : "응답 없음";
                return ResponseEntity.badRequest().body(AuthResponse.builder()
                        .message("GitHub 토큰 발급 실패: " + errDesc).build());
            }
            String accessToken = (String) tokenResp.get("access_token");

            var ghHeaders = new org.springframework.http.HttpHeaders();
            ghHeaders.set("Authorization", "Bearer " + accessToken);
            ghHeaders.set("Accept", "application/vnd.github+json");
            ghHeaders.set("X-GitHub-Api-Version", "2022-11-28");
            var ghEntity = new org.springframework.http.HttpEntity<>(ghHeaders);

            // 2. 인증된 primary 이메일 조회
            ResponseEntity<List<Map<String, Object>>> emailResp = restTemplate.exchange(
                    "https://api.github.com/user/emails",
                    HttpMethod.GET, ghEntity,
                    new ParameterizedTypeReference<>() {}
            );
            List<Map<String, Object>> emails = emailResp.getBody();
            if (emails == null || emails.isEmpty()) {
                return ResponseEntity.badRequest().body(AuthResponse.builder()
                        .message("GitHub 이메일 정보를 가져올 수 없습니다.").build());
            }
            String email = emails.stream()
                    .filter(e -> Boolean.TRUE.equals(e.get("primary")) && Boolean.TRUE.equals(e.get("verified")))
                    .map(e -> (String) e.get("email"))
                    .findFirst()
                    .orElseGet(() -> emails.stream()
                            .filter(e -> Boolean.TRUE.equals(e.get("verified")))
                            .map(e -> (String) e.get("email"))
                            .findFirst()
                            .orElse(null));
            if (email == null) {
                return ResponseEntity.badRequest().body(AuthResponse.builder()
                        .message("인증된 GitHub 이메일이 없습니다. GitHub 계정에서 이메일을 인증해 주세요.").build());
            }

            // 3. GitHub 프로필 조회 (username 확보)
            @SuppressWarnings("unchecked")
            Map<String, Object> ghUser = restTemplate.exchange(
                    "https://api.github.com/user",
                    HttpMethod.GET, ghEntity, Map.class
            ).getBody();
            String githubLogin = ghUser != null && ghUser.get("login") != null
                    ? (String) ghUser.get("login") : email.split("@")[0];

            // 4. 기존 계정 조회 → 없으면 자동 생성
            User user = authService.findOrCreateGithubUser(email, githubLogin, accessToken);

            String userType  = user.getUserType() != null ? user.getUserType().name() : "GUEST";
            String jwtAccess = jwtUtil.issue(user.getId(), user.getEmail(), userType);
            String refresh   = issueRefreshToken(user.getId());
            return withTokenCookies(jwtAccess, refresh)
                    .body(AuthResponse.builder()
                            .userId(user.getId())
                            .email(user.getEmail())
                            .username(user.getUsername())
                            .phone(user.getPhone())
                            .birthDate(user.getBirthDate())
                            .userType(user.getUserType())
                            .githubUsername(user.getGithubUsername())
                            .token(jwtAccess)
                            .message("GitHub 로그인에 성공했습니다.")
                            .build());
        } catch (Exception e) {
            return ResponseEntity.badRequest().body(AuthResponse.builder()
                    .message(e.getMessage()).build());
        }
    }

    @PostMapping("/logout")
    public ResponseEntity<Map<String, String>> logout(HttpServletRequest request) {
        String rawToken = extractCookie(request, REFRESH_COOKIE_NAME);
        if (rawToken != null && !rawToken.isBlank()) {
            refreshTokenRepository.deleteByToken(rawToken);
        }
        return ResponseEntity.ok()
                .header(HttpHeaders.SET_COOKIE, buildClearCookie(AUTH_COOKIE_NAME, "/").toString())
                .header(HttpHeaders.SET_COOKIE, buildClearCookie(REFRESH_COOKIE_NAME, "/api/auth").toString())
                .body(Map.of("message", "로그아웃 되었습니다."));
    }

    // ───── 유틸 ─────

    private String extractCookie(HttpServletRequest request, String name) {
        Cookie[] cookies = request.getCookies();
        if (cookies == null) return null;
        return Arrays.stream(cookies)
                .filter(c -> name.equals(c.getName()))
                .map(Cookie::getValue)
                .findFirst()
                .orElse(null);
    }
}
