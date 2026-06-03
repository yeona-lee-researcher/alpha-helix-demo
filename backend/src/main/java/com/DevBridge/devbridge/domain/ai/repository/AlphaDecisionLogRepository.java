package com.DevBridge.devbridge.domain.ai.repository;

import com.DevBridge.devbridge.domain.ai.entity.AlphaDecisionLog;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface AlphaDecisionLogRepository extends JpaRepository<AlphaDecisionLog, Long> {
    List<AlphaDecisionLog> findByWorkspaceIdOrderByCreatedAtAsc(Long workspaceId);
}
