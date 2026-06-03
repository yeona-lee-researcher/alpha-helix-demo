package com.DevBridge.devbridge.global.config;

import io.getstream.chat.java.models.App;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Configuration;

import jakarta.annotation.PostConstruct;

/**
 * Initializes the Stream Chat server-side client once at startup.
 *
 * Stream Chat Java SDK 는 내부적으로 시스템 프로퍼티 STREAM_KEY / STREAM_SECRET 을
 * 읽어서 자체 초기화한다. 따라서 setProperty 호출은 SDK 동작에 필수.
 *
 * 보안 처리:
 *   - 운영 환경에서 STREAM_KEY/STREAM_SECRET 시스템 프로퍼티가 이미 외부에서
 *     주입돼있으면 덮어쓰지 않음 (외부 값 우선)
 *   - apiKey/apiSecret 이 비어있으면 setProperty 자체를 호출하지 않음
 *     (잘못된 빈 값으로 SDK 초기화되어 런타임 401 나는 것 방지)
 *   - 시크릿 자체는 절대 로깅하지 않고 존재 여부(boolean)만 INFO 로
 *
 * Set these in application-local/application-prod.properties or env:
 *   stream.chat.api-key=your_key
 *   stream.chat.api-secret=your_secret
 */
@Slf4j
@Configuration
public class StreamChatConfig {

    @Value("${stream.chat.api-key:}")
    private String apiKey;

    @Value("${stream.chat.api-secret:}")
    private String apiSecret;

    @PostConstruct
    public void init() {
        boolean haveKey = apiKey != null && !apiKey.isBlank();
        boolean haveSecret = apiSecret != null && !apiSecret.isBlank();

        if (haveKey && System.getProperty("STREAM_KEY") == null) {
            System.setProperty("STREAM_KEY", apiKey);
        }
        if (haveSecret && System.getProperty("STREAM_SECRET") == null) {
            System.setProperty("STREAM_SECRET", apiSecret);
        }

        log.info("[StreamChatConfig] keyPresent={}, secretPresent={}", haveKey, haveSecret);
        if (!haveKey || !haveSecret) {
            log.warn("[StreamChatConfig] Stream Chat 키/시크릿이 비어있습니다. 채팅 기능이 동작하지 않을 수 있어요.");
        }
    }

    public String getApiKey() {
        return apiKey;
    }

    public String getApiSecret() {
        return apiSecret;
    }
}
