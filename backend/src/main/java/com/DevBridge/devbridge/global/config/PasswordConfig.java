package com.DevBridge.devbridge.global.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;

/**
 * 비밀번호 해싱용 PasswordEncoder 빈.
 *
 * <p>전체 Spring Security 프레임워크(SecurityFilterChain 등)는 의도적으로 비활성(build.gradle 주석)이며,
 * 여기서는 {@code spring-security-crypto} 의 BCrypt 만 사용한다. 인증/인가 흐름 자체는 기존
 * {@link com.DevBridge.devbridge.global.security.JwtAuthenticationFilter} + AuthContext 가 그대로 담당한다.
 */
@Configuration
public class PasswordConfig {

    @Bean
    public PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder();
    }
}
