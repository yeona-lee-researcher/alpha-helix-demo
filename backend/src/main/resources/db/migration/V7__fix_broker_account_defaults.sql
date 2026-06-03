-- broker_type 컬럼이 나중에 추가되어 기존 레코드에 NULL이 남은 경우 KIS로 업데이트
UPDATE BROKER_ACCOUNT SET broker_type = 'KIS' WHERE broker_type IS NULL;

-- binance_mode 컬럼도 NULL일 경우 SPOT으로 초기화
UPDATE BROKER_ACCOUNT SET binance_mode = 'SPOT' WHERE binance_mode IS NULL;
