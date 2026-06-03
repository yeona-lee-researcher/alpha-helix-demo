package com.DevBridge.devbridge.domain.strategy.repository;

import com.DevBridge.devbridge.domain.strategy.entity.OrderProposal;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

public interface OrderProposalRepository extends JpaRepository<OrderProposal, Long> {

    List<OrderProposal> findByUserIdOrderByCreatedAtDesc(Long userId);

    List<OrderProposal> findByUserIdAndStatusOrderByCreatedAtDesc(Long userId, String status);

    Optional<OrderProposal> findByIdAndUserId(Long id, Long userId);

    long countByUserIdAndStatus(Long userId, String status);

    /** 만료 처리 잡용: PENDING 상태 + expires_at < now */
    List<OrderProposal> findByStatusAndExpiresAtBefore(String status, LocalDateTime cutoff);

    /**
     * 당일 EXECUTED 주문 합산 USD. 일일누적 한도검증용.
     * 수량: 분수(qtyDecimal, 크립토)가 있으면 우선, 없으면 정수 qty.
     * 단가: limitPrice(지정가) 우선, 없으면 체결평균가(fillAvgPrice, 시장가 체결 후)로 보정, 둘 다 없으면 0.
     */
    @Query("select coalesce(sum(coalesce(p.qtyDecimal, p.qty) * coalesce(p.limitPrice, p.fillAvgPrice, 0)), 0) " +
           "from OrderProposal p " +
           "where p.userId = :uid and p.status = 'EXECUTED' and p.executedAt >= :since")
    java.math.BigDecimal sumExecutedUsdSince(@Param("uid") Long userId,
                                             @Param("since") LocalDateTime since);

    /**
     * 당일 EXECUTED 주문 합산 USD — 매수/매도(side) 분리. KIS KRW 일일 매수·매도 한도 검증용(M3).
     * 단가/수량 산정은 {@link #sumExecutedUsdSince} 와 동일.
     */
    @Query("select coalesce(sum(coalesce(p.qtyDecimal, p.qty) * coalesce(p.limitPrice, p.fillAvgPrice, 0)), 0) " +
           "from OrderProposal p " +
           "where p.userId = :uid and p.status = 'EXECUTED' and p.side = :side and p.executedAt >= :since")
    java.math.BigDecimal sumExecutedUsdSinceBySide(@Param("uid") Long userId,
                                                   @Param("side") String side,
                                                   @Param("since") LocalDateTime since);

    /** REAL 자동매매 졸업 게이트: 특정 계정에서 자동 체결(EXECUTED + autoExecuted=true)된 건수. */
    long countByBrokerAccountIdAndStatusAndAutoExecutedTrue(Long brokerAccountId, String status);

    /** REAL 자동매매 졸업 게이트: 특정 계정의 자동 체결 최초 시각 (2주 경과 판정용). */
    @Query("select min(p.executedAt) from OrderProposal p " +
           "where p.brokerAccountId = :baId and p.status = 'EXECUTED' and p.autoExecuted = true")
    LocalDateTime firstAutoExecutedAt(@Param("baId") Long brokerAccountId);

    /** B1 체결 폴링 대상: EXECUTED + kisOrderNo 있음 + 체결 미확정(null/UNKNOWN/OPEN/PARTIAL) + 최근 실행. */
    @Query("select p from OrderProposal p where p.status = 'EXECUTED' and p.kisOrderNo is not null " +
           "and (p.fillStatus is null or p.fillStatus in ('UNKNOWN','OPEN','PARTIAL')) " +
           "and p.executedAt >= :since")
    List<OrderProposal> findFillCheckCandidates(@Param("since") LocalDateTime since);
}
