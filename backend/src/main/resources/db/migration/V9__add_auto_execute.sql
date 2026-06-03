-- P8 자동 주문 실행 (auto-execute)
-- broker_account.auto_execute: 자동 체결 스위치 (기본 OFF). REAL 은 MOCK 졸업 게이트 통과 필요.
-- order_proposal.auto_executed: 사람 승인 없이 자동 체결된 주문 표시 (졸업 게이트 집계용).

ALTER TABLE broker_account
    ADD COLUMN auto_execute BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE order_proposal
    ADD COLUMN auto_executed BOOLEAN NOT NULL DEFAULT FALSE;

-- 졸업 게이트 집계 쿼리(계정별 자동체결 EXECUTED 건수/최초시각) 가속
CREATE INDEX idx_op_auto_exec ON order_proposal (broker_account_id, status, auto_executed);
