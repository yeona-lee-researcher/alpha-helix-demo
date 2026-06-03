package com.DevBridge.devbridge.domain.ai.service.gateway;

import com.DevBridge.devbridge.domain.strategy.service.SubscriptionService;
import com.DevBridge.devbridge.domain.ai.dto.AiChatRequest;
import com.DevBridge.devbridge.domain.ai.entity.AiModelCatalog;
import com.DevBridge.devbridge.domain.ai.entity.AiUsageLog;
import com.DevBridge.devbridge.domain.strategy.entity.Subscription;
import com.DevBridge.devbridge.domain.ai.repository.AiModelCatalogRepository;
import com.DevBridge.devbridge.domain.ai.repository.AiUsageLogRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * 멀티 모델 라우터 + 쿼터 가드 + 사용량 로깅.
 *
 * 흐름:
 *  1) 모델 카탈로그에서 modelId 조회 (없거나 disabled면 거부)
 *  2) 사용자 tier(FREE/PRO)에 맞는 월간 한도 확인
 *  3) 이번 달 누적 토큰이 한도 초과면 거부
 *  4) provider 호출 → 결과
 *  5) AiUsageLog 저장 (성공/실패 모두)
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class AiGatewayService {

    private final AiModelCatalogRepository catalogRepo;
    private final AiUsageLogRepository usageRepo;
    private final SubscriptionService subscriptionService;
    private final List<AiProvider> providers;

    /** 채팅 호출 — 최종 텍스트 반환. quota/provider 에러는 RuntimeException. */
    public String chat(Long userId, String modelId, AiChatRequest request) {
        AiModelCatalog model = ensureUsable(userId, modelId);
        AiProvider provider = providerFor(model);
        AiProvider.Result result;
        try {
            result = provider.chat(model.getModelId(), request);
            recordUsage(userId, modelId, result.tokensIn(), result.tokensOut(), true, null);
            return result.text();
        } catch (RuntimeException e) {
            recordUsage(userId, modelId, 0, 0, false, e.getMessage());
            throw e;
        }
    }

    public String oneShot(Long userId, String modelId, String systemInstruction, String userPrompt, boolean wantJson) {
        AiModelCatalog model = ensureUsable(userId, modelId);
        AiProvider provider = providerFor(model);
        AiProvider.Result result;
        try {
            result = provider.oneShot(model.getModelId(), systemInstruction, userPrompt, wantJson);
            recordUsage(userId, modelId, result.tokensIn(), result.tokensOut(), true, null);
            return result.text();
        } catch (RuntimeException e) {
            recordUsage(userId, modelId, 0, 0, false, e.getMessage());
            throw e;
        }
    }

    /** UI에 노출할 모델 목록 + 사용 가능 여부 + 잔여 한도. */
    @Transactional(readOnly = true)
    public List<Map<String, Object>> listModelsFor(Long userId) {
        Subscription.Tier tier = subscriptionService.currentTier(userId);
        LocalDateTime monthStart = LocalDateTime.now().withDayOfMonth(1).withHour(0).withMinute(0).withSecond(0);

        // N+1 방지: 모델별 사용량을 한 번의 GROUP BY 쿼리로 가져와 맵으로 조회.
        Map<String, Long> usedByModel = new HashMap<>();
        for (Object[] row : usageRepo.sumTokensByUserSinceGrouped(userId, monthStart)) {
            usedByModel.put((String) row[0], row[1] == null ? 0L : ((Number) row[1]).longValue());
        }

        return catalogRepo.findByEnabledTrueOrderBySortOrderAsc().stream().map(m -> {
            long quota = (tier == Subscription.Tier.PRO) ? m.getProQuota() : m.getFreeQuota();
            long used = usedByModel.getOrDefault(m.getModelId(), 0L);
            boolean providerOk = providerForOpt(m).map(AiProvider::isAvailable).orElse(false);
            boolean unlocked = quota != 0 || tier == Subscription.Tier.PRO;
            boolean usable = providerOk && unlocked && (quota == -1 || used < quota);
            long remaining = (quota == -1) ? Long.MAX_VALUE : Math.max(0, quota - used);

            return Map.<String, Object>of(
                    "modelId", m.getModelId(),
                    "displayName", m.getDisplayName(),
                    "provider", m.getProvider().name(),
                    "strength", m.getStrength() == null ? "" : m.getStrength(),
                    "tier", tier.name(),
                    "quota", quota,
                    "used", used,
                    "remaining", remaining == Long.MAX_VALUE ? -1 : remaining,
                    "usable", usable,
                    "lockReason", lockReason(providerOk, unlocked, quota, used, tier)
            );
        }).toList();
    }

    private String lockReason(boolean providerOk, boolean unlocked, long quota, long used, Subscription.Tier tier) {
        if (!providerOk) return "API 키 미설정";
        if (!unlocked) return "Pro 전용";
        if (quota != -1 && used >= quota) return tier == Subscription.Tier.PRO ? "이번 달 한도 초과" : "Free 한도 초과";
        return "";
    }

    /** 모델 사용 가능 여부 검증 (못쓰면 IllegalStateException). */
    private AiModelCatalog ensureUsable(Long userId, String modelId) {
        AiModelCatalog model = catalogRepo.findById(modelId)
                .filter(AiModelCatalog::isEnabled)
                .orElseThrow(() -> new IllegalArgumentException("알 수 없거나 비활성화된 모델: " + modelId));

        Subscription.Tier tier = subscriptionService.currentTier(userId);
        long quota = (tier == Subscription.Tier.PRO) ? model.getProQuota() : model.getFreeQuota();
        if (quota == 0) {
            throw new IllegalStateException("이 모델은 Pro 전용입니다. (" + model.getDisplayName() + ")");
        }
        if (quota != -1) {
            LocalDateTime monthStart = LocalDateTime.now().withDayOfMonth(1).withHour(0).withMinute(0).withSecond(0);
            long used = usageRepo.sumTokensByUserAndModelSince(userId, modelId, monthStart);
            if (used >= quota) {
                throw new IllegalStateException("이번 달 사용 한도(" + quota + " 토큰)를 초과했습니다.");
            }
        }
        return model;
    }

    private AiProvider providerFor(AiModelCatalog model) {
        return providerForOpt(model).orElseThrow(
                () -> new IllegalStateException("프로바이더 없음: " + model.getProvider()));
    }

    private java.util.Optional<AiProvider> providerForOpt(AiModelCatalog model) {
        String key = model.getProvider().name();
        return providers.stream().filter(p -> p.providerKey().equals(key)).findFirst();
    }

    private void recordUsage(Long userId, String modelId, long tIn, long tOut, boolean ok, String err) {
        try {
            usageRepo.save(AiUsageLog.builder()
                    .userId(userId)
                    .modelId(modelId)
                    .tokensIn(tIn)
                    .tokensOut(tOut)
                    .success(ok)
                    .errorMessage(err == null ? null : err.substring(0, Math.min(err.length(), 500)))
                    .build());
        } catch (Exception e) {
            log.warn("AiUsageLog 저장 실패 (무시): {}", e.getMessage());
        }
    }
}
