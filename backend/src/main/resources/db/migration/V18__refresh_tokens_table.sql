-- 머지 정합: main 의 refresh_tokens 테이블(RefreshToken 엔티티)에 대한 마이그레이션 부재 보강.
-- 배경: main 이 리프레시 토큰 기능(RefreshToken/RefreshTokenRepository)을 추가했으나 Flyway 마이그레이션이 없었다.
--       이 브랜치의 C6 수정으로 Flyway 가 처음 실제 활성화되었고 운영은 ddl-auto=validate 이므로,
--       refresh_tokens 테이블이 없으면 운영 부팅이 Hibernate validate 단계에서 실패한다.
--       (로컬 ddl-auto=update 는 자동 생성하므로 main 단독 로컬에선 드러나지 않던 갭)
-- 엔티티: RefreshToken @Table(name="refresh_tokens") — user_id, token(unique,64), expires_at, created_at
--         + 인덱스 idx_rt_user_id(user_id), idx_rt_expires_at(expires_at)
-- 멱등: 이미 (ddl-auto 로) 생성돼 있으면 CREATE TABLE IF NOT EXISTS 로 스킵.
CREATE TABLE IF NOT EXISTS refresh_tokens (
    id          BIGINT       NOT NULL AUTO_INCREMENT,
    user_id     BIGINT       NOT NULL,
    token       VARCHAR(64)  NOT NULL,
    expires_at  datetime(6)  NOT NULL,
    created_at  datetime(6)  NOT NULL,
    PRIMARY KEY (id),
    CONSTRAINT uq_refresh_tokens_token UNIQUE (token),
    KEY idx_rt_user_id (user_id),
    KEY idx_rt_expires_at (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
