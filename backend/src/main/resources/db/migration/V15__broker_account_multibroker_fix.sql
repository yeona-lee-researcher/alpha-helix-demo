-- broker_account 다중 브로커(KIS + Binance) 공존을 위한 스키마 정합화.
-- 배경: 엔티티는 (user_id, broker_type, env) 유니크 + KIS 컬럼 nullable 로 선언했으나,
--       과거 ddl-auto=update 가 옛 제약/NOT NULL 을 그대로 둬서 드리프트 발생.
--       → 같은 env 에 KIS 와 Binance 계좌를 동시에 등록하면 INSERT 가 실패했음.
-- (로컬은 ddl-auto 라 자동, 운영은 이 마이그레이션으로 적용.)

-- 1) 레거시 (user_id, env) 유니크 제거. MySQL 은 DROP INDEX IF EXISTS 미지원 → information_schema 로 조건부 드롭(멱등).
SET @drop_legacy := (
    SELECT IF(COUNT(*) > 0,
        'ALTER TABLE broker_account DROP INDEX uq_broker_user_env',
        'DO 0')
    FROM information_schema.statistics
    WHERE table_schema = DATABASE()
      AND table_name = 'broker_account'
      AND index_name = 'uq_broker_user_env');
PREPARE s1 FROM @drop_legacy; EXECUTE s1; DEALLOCATE PREPARE s1;

-- 2) KIS 전용 컬럼을 NULL 허용으로 — Binance 계좌는 이 값들이 없음(엔티티도 nullable). MODIFY 는 멱등.
ALTER TABLE broker_account MODIFY COLUMN app_key        VARCHAR(100) NULL;
ALTER TABLE broker_account MODIFY COLUMN app_secret_enc TEXT         NULL;
ALTER TABLE broker_account MODIFY COLUMN cano           VARCHAR(16)  NULL;
ALTER TABLE broker_account MODIFY COLUMN acnt_prdt_cd   VARCHAR(4)   NULL;
