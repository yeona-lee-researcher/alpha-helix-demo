-- B3: 주문 실행 감사로그 (append-only). 로컬은 ddl-auto=update 자동 생성, 운영은 이 마이그레이션.
CREATE TABLE IF NOT EXISTS order_execution_audit (
    id                BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id           BIGINT NOT NULL,
    proposal_id       BIGINT,
    broker_account_id BIGINT NOT NULL,
    env               VARCHAR(8),
    ticker            VARCHAR(16),
    side              VARCHAR(8),
    qty               INT,
    limit_price       DECIMAL(18,4),
    kis_order_no      VARCHAR(32),
    rt_cd             VARCHAR(8),
    auto_executed     BIT(1),
    outcome           VARCHAR(16),
    detail            VARCHAR(500),
    created_at        DATETIME(6),
    INDEX idx_oea_user (user_id, created_at),
    INDEX idx_oea_proposal (proposal_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
