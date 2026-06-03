-- B2: 체결 후 잔고/포지션 동기화 스냅샷 (로컬은 ddl-auto=update 자동, 운영은 이 마이그레이션)
ALTER TABLE broker_account
    ADD COLUMN last_balance_json LONGTEXT     NULL,
    ADD COLUMN last_balance_at   DATETIME(6)  NULL;
