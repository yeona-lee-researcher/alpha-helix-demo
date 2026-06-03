-- B1: 주문 체결 확인 폴링용 컬럼 (로컬은 ddl-auto=update 가 자동 추가, 운영은 이 마이그레이션)
ALTER TABLE order_proposal
    ADD COLUMN fill_status     VARCHAR(16)    NULL,
    ADD COLUMN filled_qty      INT            NULL,
    ADD COLUMN fill_avg_price  DECIMAL(18,4)  NULL,
    ADD COLUMN fill_checked_at DATETIME(6)    NULL;
