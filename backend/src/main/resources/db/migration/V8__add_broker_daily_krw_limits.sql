-- 매수/매도 분리 1일 누적 한도 (원화).
-- 기존 daily_order_usd 는 Binance 등 비KIS 용도로 그대로 유지.
-- KIS 는 새 컬럼(daily_buy_krw, daily_sell_krw)을 우선 사용.
ALTER TABLE BROKER_ACCOUNT
    ADD COLUMN daily_buy_krw  BIGINT NULL COMMENT '1일 누적 매수 한도(원화). KIS 전용. null=무제한',
    ADD COLUMN daily_sell_krw BIGINT NULL COMMENT '1일 누적 매도 한도(원화). KIS 전용. null=무제한';

-- 기존 KIS 계좌에 합리적 기본값 시드 (실전=실제 운영 보수적, 모의=관대)
UPDATE BROKER_ACCOUNT
SET daily_buy_krw  = CASE WHEN env = 'REAL' THEN 10000000  ELSE 50000000  END,
    daily_sell_krw = CASE WHEN env = 'REAL' THEN 30000000  ELSE 300000000 END
WHERE broker_type = 'KIS' AND daily_buy_krw IS NULL;
