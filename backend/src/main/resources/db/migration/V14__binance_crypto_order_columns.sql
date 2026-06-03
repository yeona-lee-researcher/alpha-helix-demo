-- Binance 크립토 통합: 분수 주문/체결 수량 컬럼 (KIS 정수 주문은 NULL — 영향 없음).
-- 로컬은 ddl-auto=update 가 자동 적용, 운영은 이 마이그레이션으로 적용.
ALTER TABLE order_proposal ADD COLUMN qty_decimal        DECIMAL(28,8) NULL;
ALTER TABLE order_proposal ADD COLUMN filled_qty_decimal DECIMAL(28,8) NULL;
