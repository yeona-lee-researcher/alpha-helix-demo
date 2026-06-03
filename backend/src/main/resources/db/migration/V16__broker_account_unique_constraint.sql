-- C5: broker_account (user_id, broker_type, env) 유니크 제약 추가.
-- 배경: V15 가 레거시 uq_broker_user_env 를 DROP 만 하고 새 제약을 추가하지 않아,
--       운영(Flyway) 스키마에는 엔티티가 선언한 uq_broker_user_type_env 가 존재하지 않았다.
--       (로컬 ddl-auto 는 자동 생성하지만 운영 validate 경로는 마이그레이션이 유일한 출처)
--       → 같은 (user_id, broker_type, env) 조합의 중복 INSERT 가 DB 레벨에서 막히지 않는 상태.
-- 엔티티: BrokerAccount @UniqueConstraint(name="uq_broker_user_type_env",
--                        columnNames={"user_id","broker_type","env"})

-- 멱등: 동일 컬럼 조합의 유니크 인덱스가 이미 있으면(이름 무관) 스킵.
--       MySQL 은 ADD CONSTRAINT ... IF NOT EXISTS 미지원 → information_schema 로 조건부 실행.
SET @has_uq := (
    SELECT COUNT(*)
    FROM (
        SELECT s.index_name
        FROM information_schema.statistics s
        JOIN information_schema.table_constraints tc
          ON tc.table_schema = s.table_schema
         AND tc.table_name   = s.table_name
         AND tc.constraint_name = s.index_name
         AND tc.constraint_type = 'UNIQUE'
        WHERE s.table_schema = DATABASE()
          AND s.table_name   = 'broker_account'
          AND s.column_name IN ('user_id', 'broker_type', 'env')
        GROUP BY s.index_name
        HAVING COUNT(DISTINCT s.column_name) = 3
           AND MAX(s.seq_in_index) = 3
    ) dup);

SET @add_uq := IF(@has_uq = 0,
    'ALTER TABLE broker_account ADD CONSTRAINT uq_broker_user_type_env UNIQUE (user_id, broker_type, env)',
    'DO 0');
PREPARE s1 FROM @add_uq; EXECUTE s1; DEALLOCATE PREPARE s1;
