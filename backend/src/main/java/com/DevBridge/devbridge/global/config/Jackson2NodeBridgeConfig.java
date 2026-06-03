package com.DevBridge.devbridge.global.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import tools.jackson.core.JsonGenerator;
import tools.jackson.databind.JacksonModule;
import tools.jackson.databind.SerializationContext;
import tools.jackson.databind.ValueSerializer;
import tools.jackson.databind.module.SimpleModule;

/**
 * Jackson 2 JsonNode → Jackson 3 직렬화 브릿지.
 *
 * <p>Spring Boot 4 는 Jackson 3 (tools.jackson) 를 기본 JSON 매퍼로 쓴다. 그런데 이 앱은
 * {@code AnalyticsClient}·브로커·LLM 등 전반에서 Jackson 2 (com.fasterxml.jackson) 의
 * {@code JsonNode} 를 만들어 컨트롤러에서 그대로 반환한다. Jackson 3 매퍼는 Jackson 2 의
 * JsonNode 를 트리로 인식하지 못하고 bean getter(isArray, nodeType, isEmpty...) 를 직렬화하는
 * 버그를 일으킨다 → {@code {"array":false,"nodeType":"OBJECT",...}}. 모든 analytics 프록시
 * 엔드포인트(/api/analytics/*, /api/lean/*, /api/strategies 의 일부 등)가 영향을 받는다.
 *
 * <p>여기서는 기본 Jackson 3 매퍼를 <b>그대로 두고</b>(= DTO·날짜 직렬화 무변경, 회귀 위험 0),
 * Jackson 2 의 {@code JsonNode} 타입을 만났을 때만 그 노드의 JSON 텍스트를 raw 로 출력하는
 * 직렬화기를 다리처럼 등록한다. 외과적 수정이라 다른 응답 동작에 영향이 없다.
 *
 * <p>Boot 4 의 Jackson 자동구성은 컨텍스트의 모든 {@link JacksonModule} 빈을 기본 매퍼에
 * 등록하므로, 이 모듈 빈을 선언하는 것만으로 전역에 적용된다. 향후 앱이 Jackson 3 로 완전
 * 이행하면 이 브릿지는 불필요해진다.
 */
@Configuration
public class Jackson2NodeBridgeConfig {

    @Bean
    JacksonModule jackson2NodeBridgeModule() {
        SimpleModule module = new SimpleModule("Jackson2NodeBridge");
        module.addSerializer(com.fasterxml.jackson.databind.JsonNode.class, new Jackson2NodeSerializer());
        return module;
    }

    /** Jackson 2 {@code JsonNode} 의 원본 JSON 텍스트를 Jackson 3 출력 스트림에 그대로 기록. */
    private static final class Jackson2NodeSerializer
            extends ValueSerializer<com.fasterxml.jackson.databind.JsonNode> {
        @Override
        public void serialize(com.fasterxml.jackson.databind.JsonNode value,
                              JsonGenerator gen, SerializationContext ctxt) {
            if (value == null || value.isNull()) {
                gen.writeNull();
            } else {
                // JsonNode.toString() 은 항상 유효한 JSON 텍스트 → 트리로 그대로 출력된다.
                gen.writeRawValue(value.toString());
            }
        }
    }
}
