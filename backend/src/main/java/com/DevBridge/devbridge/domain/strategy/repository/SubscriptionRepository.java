package com.DevBridge.devbridge.domain.strategy.repository;

import com.DevBridge.devbridge.domain.strategy.entity.Subscription;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface SubscriptionRepository extends JpaRepository<Subscription, Long> {

    /** 가장 최근 활성 Pro (없으면 empty → FREE 취급) */
    Optional<Subscription> findFirstByUserIdAndStatusOrderByExpiresAtDesc(
            Long userId, Subscription.Status status);

    /** 만료 처리할 후보 (status=ACTIVE && expires_at < now) */
    List<Subscription> findByStatusAndExpiresAtBefore(
            Subscription.Status status, java.time.LocalDateTime now);

    /** M8: Toss 결제키로 기존 구독 조회 — confirm 멱등성(중복 처리 방지)용. */
    Optional<Subscription> findByTossPaymentKey(String tossPaymentKey);
}
