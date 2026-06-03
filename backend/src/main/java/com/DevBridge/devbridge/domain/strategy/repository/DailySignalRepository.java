package com.DevBridge.devbridge.domain.strategy.repository;

import com.DevBridge.devbridge.domain.strategy.entity.DailySignal;
import org.springframework.data.jpa.repository.JpaRepository;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

public interface DailySignalRepository extends JpaRepository<DailySignal, Long> {

    Optional<DailySignal> findByStrategyIdAndAsOfDate(Long strategyId, LocalDate asOfDate);

    List<DailySignal> findByStrategyIdOrderByAsOfDateDesc(Long strategyId);

    /** 사용자 보유 전략들의 최근 시그널 1개씩 (Client_Home '오늘의 브리핑' 카드용) */
    @org.springframework.data.jpa.repository.Query("""
            SELECT s FROM DailySignal s
            WHERE s.strategy.user.id = :userId
              AND s.asOfDate = (
                  SELECT MAX(s2.asOfDate) FROM DailySignal s2 WHERE s2.strategy.id = s.strategy.id
              )
            ORDER BY s.strategy.id ASC
            """)
    List<DailySignal> findLatestPerStrategyByUser(@org.springframework.data.repository.query.Param("userId") Long userId);

    /** 알림 발송 대상: deliveredAt이 null이고 asOfDate가 오늘인 시그널 */
    List<DailySignal> findByAsOfDateAndDeliveredAtIsNull(LocalDate asOfDate);

    /** 특정 일자의 모든 시그널 (자동 OrderProposal 생성용) */
    List<DailySignal> findByAsOfDate(LocalDate asOfDate);

    /**
     * 특정 일자의 모든 시그널 + strategy/user 즉시 로딩 (자동 OrderProposal 생성용).
     * createProposalsFor 는 비트랜잭션 스케줄 컨텍스트(open-in-view=false)라 lazy 접근이 깨지므로
     * strategy·user 를 JOIN FETCH 로 미리 초기화한다.
     */
    @org.springframework.data.jpa.repository.Query("""
            SELECT s FROM DailySignal s
            JOIN FETCH s.strategy st
            JOIN FETCH st.user
            WHERE s.asOfDate = :asOf
            """)
    List<DailySignal> findByAsOfDateFetchStrategyUser(@org.springframework.data.repository.query.Param("asOf") LocalDate asOf);
}
