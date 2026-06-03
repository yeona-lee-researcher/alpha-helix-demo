package com.DevBridge.devbridge.global.terminal;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.socket.config.annotation.EnableWebSocket;
import org.springframework.web.socket.config.annotation.WebSocketConfigurer;
import org.springframework.web.socket.config.annotation.WebSocketHandlerRegistry;

/**
 * 로컬 전용 터미널 WebSocket 등록.
 *
 * <p>{@code app.terminal.enabled=true} 일 때만 이 설정이 활성화되어 {@code /ws/terminal}
 * 엔드포인트가 생긴다. 운영 기본값은 OFF 이며, 핸들러가 추가로 loopback 접속만 허용한다.
 */
@Configuration
@EnableWebSocket
@ConditionalOnProperty(name = "app.terminal.enabled", havingValue = "true")
public class TerminalWebSocketConfig implements WebSocketConfigurer {

    @Override
    public void registerWebSocketHandlers(WebSocketHandlerRegistry registry) {
        registry.addHandler(new TerminalWebSocketHandler(), "/ws/terminal")
                .setAllowedOriginPatterns("*");
    }
}
