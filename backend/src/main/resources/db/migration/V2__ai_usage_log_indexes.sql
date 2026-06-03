-- ============================================================
-- V2: ai_usage_log 성능 인덱스 추가
-- ai_usage_log.sumTokensByUserAndModelSince() 쿼리 최적화
-- AiGatewayService의 월간 쿼터 체크는 초당 수십 회 호출될 수 있음
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_ai_usage_user_model_created
    ON ai_usage_log (user_id, model_id, created_at);

-- ai_model_catalog: sort_order + enabled 복합 인덱스
CREATE INDEX IF NOT EXISTS idx_ai_catalog_enabled_sort
    ON ai_model_catalog (enabled, sort_order);
