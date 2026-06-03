package com.DevBridge.devbridge.domain.project.repository;

import com.DevBridge.devbridge.domain.project.entity.ProjectEscrow;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface ProjectEscrowRepository extends JpaRepository<ProjectEscrow, Long> {

    List<ProjectEscrow> findByProjectIdOrderByIdAsc(Long projectId);

    Optional<ProjectEscrow> findByMilestoneId(Long milestoneId);

    List<ProjectEscrow> findByPayerUserIdOrderByCreatedAtDesc(Long payerUserId);

    List<ProjectEscrow> findByPayeeUserIdOrderByCreatedAtDesc(Long payeeUserId);

    /** Toss 웹훅 전용: paymentKey(=paymentTxId)로 단건 조회. findAll() 전체 스캔 방지. */
    Optional<ProjectEscrow> findByPaymentTxId(String paymentTxId);
}
