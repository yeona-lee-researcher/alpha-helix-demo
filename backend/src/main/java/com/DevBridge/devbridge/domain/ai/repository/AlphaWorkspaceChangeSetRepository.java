package com.DevBridge.devbridge.domain.ai.repository;

import com.DevBridge.devbridge.domain.ai.entity.AlphaWorkspaceChangeSet;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface AlphaWorkspaceChangeSetRepository extends JpaRepository<AlphaWorkspaceChangeSet, Long> {
    List<AlphaWorkspaceChangeSet> findByWorkspaceIdOrderByCreatedAtDesc(Long workspaceId);
    List<AlphaWorkspaceChangeSet> findByWorkspaceIdAndStatusOrderByCreatedAtDesc(Long workspaceId, String status);
    Optional<AlphaWorkspaceChangeSet> findByIdAndWorkspaceId(Long id, Long workspaceId);
}
