package com.DevBridge.devbridge.domain.strategy.repository;

import com.DevBridge.devbridge.domain.strategy.entity.Strategy;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface StrategyRepository extends JpaRepository<Strategy, Long> {

    List<Strategy> findByUserIdOrderByCreatedAtAsc(Long userId);

    Optional<Strategy> findByUserIdAndCode(Long userId, String code);

    boolean existsByUserIdAndCode(Long userId, String code);

    /** 활성 전략 전체 (스케줄러가 매일 백테스트·시그널 생성 시 사용) */
    List<Strategy> findByActiveTrue();
}
