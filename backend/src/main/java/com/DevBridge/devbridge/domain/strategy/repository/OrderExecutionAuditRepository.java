package com.DevBridge.devbridge.domain.strategy.repository;

import com.DevBridge.devbridge.domain.strategy.entity.OrderExecutionAudit;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface OrderExecutionAuditRepository extends JpaRepository<OrderExecutionAudit, Long> {

    List<OrderExecutionAudit> findByUserIdOrderByCreatedAtDesc(Long userId);
}
