package com.DevBridge.devbridge.domain.strategy.entity;

import com.DevBridge.devbridge.domain.user.entity.User;
import com.DevBridge.devbridge.domain.strategy.entity.BrokerAccount;
import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.UpdateTimestamp;
import org.springframework.data.annotation.CreatedDate;
import org.springframework.data.jpa.domain.support.AuditingEntityListener;

import java.time.LocalDateTime;

/**
 * 무한매수법(라오어식) 자동매매 구독 — 사용자+계좌+티커 1행.
 *
 * 룰:
 *  - 원금(seed_usd)을 split_count(기본 40)로 분할
 *  - 매일 하루치(seed/split_count) 만큼 매수
 *      · 절반: LOC 평단가 매수
 *      · 절반: LOC 평단가 +big_buy_premium_pct(기본 12%) 매수
 *  - 매도: 평단 +take_profit_pct(기본 10%) 지정가 매도 매일 갱신, 익절 시 전량 매도
 *  - 익절 체결 시 사이클 리셋
 *
 * 스케줄러(InfiniteBuyingJob)가 매 거래일 한국시간 22:00 직전 자동 OrderProposal 생성.
 */
@Entity
@Table(name = "INFINITE_BUYING_SUBSCRIPTION", uniqueConstraints = {
        @UniqueConstraint(name = "uq_ibs_account_ticker",
                columnNames = {"broker_account_id", "ticker"})
})
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
@EntityListeners(AuditingEntityListener.class)
public class InfiniteBuyingSubscription {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user_id", nullable = false)
    private User user;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "broker_account_id", nullable = false)
    private BrokerAccount brokerAccount;

    /** TQQQ / SOXL 등 */
    @Column(nullable = false, length = 16)
    private String ticker;

    /** 종목별 분리 원금 (USD). 사용자 입력 — 다른 종목 원금과 절대 섞지 않는다. */
    @Column(name = "seed_usd", nullable = false)
    private Double seedUsd;

    /** 분할 횟수 (기본 40) */
    @Column(name = "split_count", nullable = false)
    @Builder.Default
    private Integer splitCount = 40;

    /** 하루 매수액 중 평단가 매수 비율 (0.0~1.0, 기본 0.5) */
    @Column(name = "daily_buy_split_ratio", nullable = false)
    @Builder.Default
    private Double dailyBuySplitRatio = 0.5;

    /** LOC 큰수매수 프리미엄 % (기본 12) */
    @Column(name = "big_buy_premium_pct", nullable = false)
    @Builder.Default
    private Double bigBuyPremiumPct = 12.0;

    /** 익절 % (기본 10) */
    @Column(name = "take_profit_pct", nullable = false)
    @Builder.Default
    private Double takeProfitPct = 10.0;

    /** 활성 여부 — false면 스케줄러가 무시 */
    @Column(name = "active", nullable = false)
    @Builder.Default
    private Boolean active = true;

    /** 현재 사이클의 누적 분할 회차 (0 ~ splitCount). 익절 체결 시 0으로 리셋. */
    @Column(name = "current_split_round", nullable = false)
    @Builder.Default
    private Integer currentSplitRound = 0;

    /** 마지막 자동 발주 실행 시각 (중복 방지) */
    @Column(name = "last_run_at")
    private LocalDateTime lastRunAt;

    /** 마지막 실행 결과 메시지 (디버깅용) */
    @Column(name = "last_run_msg", length = 500)
    private String lastRunMsg;

    @CreatedDate
    @Column(name = "created_at", updatable = false)
    private LocalDateTime createdAt;

    @UpdateTimestamp
    @Column(name = "updated_at")
    private LocalDateTime updatedAt;
}
