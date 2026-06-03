-- ============================================================
-- V3: alpha_workspace + daily_signal 인덱스 추가
-- Alpha-Helix 핵심 테이블 조회 성능 개선
-- ============================================================

-- alpha_workspace: 유저별 최신 목록 조회 (listWorkspaces)
CREATE INDEX IF NOT EXISTS idx_alpha_ws_user_updated
    ON alpha_workspace (user_id, updated_at DESC);

-- daily_signal: 최신 신호 조회 (ticker + date)
CREATE INDEX IF NOT EXISTS idx_daily_signal_ticker_date
    ON daily_signal (ticker, signal_date DESC);

-- order_proposal: 상태별 목록 조회
CREATE INDEX IF NOT EXISTS idx_order_proposal_user_status
    ON order_proposal (user_id, status, created_at DESC);

-- alpha_chat_message: 워크스페이스별 대화 조회
CREATE INDEX IF NOT EXISTS idx_alpha_chat_ws_created
    ON alpha_chat_message (workspace_id, created_at ASC);
