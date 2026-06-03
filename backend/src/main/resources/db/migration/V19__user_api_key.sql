-- BYOK(Bring Your Own Key): 사용자별 외부 AI API 키 저장 테이블.
-- 사용자가 본인 Anthropic(Claude) 키를 연동해 Developer Studio 의 Claude 에이전트를 직접 사용.
-- 보안: key_enc 는 AES-256-GCM(CryptoService, 마스터키 APP_CRYPTO_KEY)로 암호화한 값만 저장. 평문 금지.
-- 엔티티: UserApiKey @Table(name="user_api_key") — (user_id, provider) 유니크.
-- 멱등: 이미 (ddl-auto 로) 생성돼 있으면 CREATE TABLE IF NOT EXISTS 로 스킵.
CREATE TABLE IF NOT EXISTS user_api_key (
    id          BIGINT       NOT NULL AUTO_INCREMENT,
    user_id     BIGINT       NOT NULL,
    provider    VARCHAR(32)  NOT NULL,
    key_enc     TEXT         NOT NULL,
    key_hint    VARCHAR(24)  DEFAULT NULL,
    created_at  datetime(6)  DEFAULT NULL,
    updated_at  datetime(6)  DEFAULT NULL,
    PRIMARY KEY (id),
    CONSTRAINT uq_user_api_key_user_provider UNIQUE (user_id, provider),
    KEY idx_user_api_key_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
