package com.DevBridge.devbridge.domain.strategy.repository;

import com.DevBridge.devbridge.domain.strategy.entity.InfiniteBuyingSubscription;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface InfiniteBuyingSubscriptionRepository
        extends JpaRepository<InfiniteBuyingSubscription, Long> {

    List<InfiniteBuyingSubscription> findByUserIdOrderByCreatedAtDesc(Long userId);

    List<InfiniteBuyingSubscription> findByActiveTrue();
}
