package com.DevBridge.devbridge.domain.ai.repository;

import com.DevBridge.devbridge.domain.ai.entity.AlphaWorkspace;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Optional;

public interface AlphaWorkspaceRepository extends JpaRepository<AlphaWorkspace, Long> {
    List<AlphaWorkspace> findByUserIdOrderByUpdatedAtDesc(Long userId);
    Optional<AlphaWorkspace> findByIdAndUserId(Long id, Long userId);
    /** 데일리 잡: TESTED 또는 LIVE 상태인 워크스페이스만 재실행 대상 */
    List<AlphaWorkspace> findByStatusIn(List<String> statuses);

    /** Claude 멀티세션 ID 만 단건 갱신(다른 컬럼 보존). 영속화로 재시작에도 대화 맥락 유지. */
    @Modifying
    @Transactional
    @Query("UPDATE AlphaWorkspace w SET w.claudeSessionId = :sid WHERE w.id = :id")
    int updateClaudeSessionId(@Param("id") Long id, @Param("sid") String sid);
}
