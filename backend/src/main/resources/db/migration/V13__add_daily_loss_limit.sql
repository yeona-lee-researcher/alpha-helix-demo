-- B3: 손실 한도 서킷브레이커 (로컬은 ddl-auto=update 자동, 운영은 이 마이그레이션)
ALTER TABLE broker_account ADD COLUMN daily_loss_limit_usd BIGINT NULL;
