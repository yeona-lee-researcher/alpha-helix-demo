-- Claude Code 에이전트 멀티세션 ID 영속화 (백엔드 재시작에도 대화 맥락 유지, VSCode 패리티).
-- 워크스페이스(=포트폴리오/repo)당 Claude 세션 1개. 새 대화 시 NULL 로 초기화.
ALTER TABLE alpha_workspace ADD COLUMN claude_session_id VARCHAR(64) NULL;
