-- M8: subscription.toss_payment_key 유니크 — 결제 confirm 멱등성 보장.
-- 배경: SubscriptionController.confirm 이 같은 paymentKey 로 재호출(더블클릭/새로고침/네트워크 재시도)되면
--       매번 새 Subscription row 를 INSERT 하고 userType 을 다시 올려, 하나의 결제로 중복 구독·이중 등급부여가
--       발생할 수 있었다. 애플리케이션 레벨 사전체크에 더해 DB 유니크가 최종 방어선이다.
-- 엔티티: Subscription @Table uniqueConstraints uq_subscription_toss_payment_key (toss_payment_key)
-- 주의: toss_payment_key 는 NULL 허용(FREE/레거시 구독). MySQL 유니크 인덱스는 다중 NULL 을 허용하므로 충돌 없음.

-- 멱등: toss_payment_key 단일컬럼 유니크 인덱스가 이미 있으면(이름 무관) 스킵.
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
          AND s.table_name   = 'subscription'
          AND s.column_name  = 'toss_payment_key'
        GROUP BY s.index_name
        HAVING COUNT(DISTINCT s.column_name) = 1
           AND MAX(s.seq_in_index) = 1
    ) dup);

SET @add_uq := IF(@has_uq = 0,
    'ALTER TABLE subscription ADD CONSTRAINT uq_subscription_toss_payment_key UNIQUE (toss_payment_key)',
    'DO 0');
PREPARE s1 FROM @add_uq; EXECUTE s1; DEALLOCATE PREPARE s1;
