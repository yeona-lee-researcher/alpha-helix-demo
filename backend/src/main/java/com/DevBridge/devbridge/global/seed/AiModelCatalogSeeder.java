package com.DevBridge.devbridge.global.seed;

import com.DevBridge.devbridge.domain.ai.entity.AiModelCatalog;
import com.DevBridge.devbridge.domain.ai.entity.AiModelCatalog.Provider;
import com.DevBridge.devbridge.domain.ai.repository.AiModelCatalogRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.CommandLineRunner;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;

import java.util.List;

/**
 * AI 모델 카탈로그 시드 (prod/local 모두 적용).
 * 멱등: 이미 행이 있으면 스킵.
 *
 * 무료 한도(토큰/월): 데모/테스트 가능 수준으로 책정.
 * Pro 한도: 실사용자 1명이 한 달 안에 거의 못 쓸 수준.
 */
@Slf4j
@Component
@Order(100)
@RequiredArgsConstructor
public class AiModelCatalogSeeder implements CommandLineRunner {

    private final AiModelCatalogRepository repo;

    @Override
    public void run(String... args) {
        // 이전에 시드되었던 Perplexity 모델은 제거 (정책 변경)
        repo.findByEnabledTrueOrderBySortOrderAsc().stream()
                .filter(m -> m.getProvider() == Provider.PERPLEXITY)
                .forEach(m -> { repo.delete(m); log.info("Removed legacy model: {}", m.getModelId()); });

        if (repo.count() > 0) return;

        List<AiModelCatalog> seed = List.of(
                model("gemini-2.5-flash",  "Gemini 2.5 Flash",  Provider.GEMINI,
                        "범용 / 빠른 응답 / 무료",          200_000L, -1L,         10),
                model("gemini-2.5-pro",    "Gemini 2.5 Pro",    Provider.GEMINI,
                        "범용 + 정밀 추론",                  0L,        500_000L,    20),

                model("claude-sonnet-4",   "Claude Sonnet 4",   Provider.ANTHROPIC,
                        "코드/전략 로직 정밀 (전문가급)",     0L,        300_000L,    30),
                model("claude-opus-4",     "Claude Opus 4",     Provider.ANTHROPIC,
                        "최고 품질 코드/심층 분석",           0L,        100_000L,    40),

                model("gpt-4o-mini",       "GPT-4o mini",       Provider.OPENAI,
                        "빠른 대화 / 무료",                  100_000L,  -1L,         50),
                model("gpt-4o",            "GPT-4o",            Provider.OPENAI,
                        "대화형 전략 설계 / 자연스러운 설명", 0L,        300_000L,    60)
        );

        repo.saveAll(seed);
        log.info("AiModelCatalog seeded: {} rows", seed.size());
    }

    private AiModelCatalog model(String id, String name, Provider p, String strength,
                                  long freeQuota, long proQuota, int sortOrder) {
        return AiModelCatalog.builder()
                .modelId(id)
                .displayName(name)
                .provider(p)
                .strength(strength)
                .freeQuota(freeQuota)
                .proQuota(proQuota)
                .sortOrder(sortOrder)
                .enabled(true)
                .build();
    }
}
