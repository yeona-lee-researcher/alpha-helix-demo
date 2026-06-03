package com.DevBridge.devbridge.domain.ai.repository;

import com.DevBridge.devbridge.domain.ai.entity.AlphaChatMessage;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface AlphaChatMessageRepository extends JpaRepository<AlphaChatMessage, Long> {
    List<AlphaChatMessage> findByWorkspaceIdOrderByCreatedAtAsc(Long workspaceId);
}
