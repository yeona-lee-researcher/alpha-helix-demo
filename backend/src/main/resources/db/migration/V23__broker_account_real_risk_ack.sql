-- 실전(REAL) 자동매매 책임고지 동의 기록. REAL tradingEnabled ON 전 1회 동의 필요.
-- 기존 행은 미동의(false)로 시작 — 다음 REAL 매매 ON 시 동의 모달을 거치게 된다.
ALTER TABLE broker_account
    ADD COLUMN real_risk_acknowledged BOOLEAN NOT NULL DEFAULT FALSE AFTER auto_execute;
