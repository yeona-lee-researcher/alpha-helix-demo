package com.DevBridge.devbridge.domain.ai.entity;

import com.DevBridge.devbridge.domain.user.entity.User;
import com.DevBridge.devbridge.domain.strategy.entity.Strategy;
import com.DevBridge.devbridge.domain.strategy.entity.BrokerAccount;
import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

import java.time.LocalDateTime;

/**
 * Alpha-Helix 전략 워크스페이스. Slack 채널처럼 전략 1개 = 워크스페이스 1개.
 * Goal Profile / Strategy Config / Backtest Result / Trust Score / Decision Log 가
 * 이 워크스페이스 ID에 종속되어 모인다.
 */
@Entity
@Table(name = "alpha_workspace")
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class AlphaWorkspace {

    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "user_id", nullable = false)
    private User user;

    @Column(nullable = false, length = 120)
    private String name;

    /** 사용자가 챗으로 표명한 목표 원문. */
    @Column(columnDefinition = "TEXT")
    private String goalRaw;

    /** Goal Profile JSON: {목표, 기간, 월적립, 성향, MDD허용, 관심자산[]} */
    @Lob @Column(columnDefinition = "TEXT")
    private String goalProfileJson;

    /** Formalized Strategy Config JSON. */
    @Lob @Column(columnDefinition = "LONGTEXT")
    private String strategyConfigJson;

    /** 마지막 백테스트 결과 캐시 JSON. */
    @Lob @Column(columnDefinition = "LONGTEXT")
    private String lastBacktestJson;

    /** 마지막 Trust Score JSON. */
    @Lob @Column(columnDefinition = "TEXT")
    private String lastTrustJson;

    /** 마지막 Regime 분석 JSON. */
    @Lob @Column(name = "last_regime_json", columnDefinition = "LONGTEXT")
    private String lastRegimeJson;

    /** 마지막 종합 리포트 JSON (auto-run 결과). FE 캐시용. */
    @Lob @Column(name = "last_report_json", columnDefinition = "LONGTEXT")
    private String lastReportJson;

    /** 사용자가 편집한 Python 전략 코드 파일들. JSON: {"main":"...","risk_control":"..."} */
    @Lob @Column(name = "code_json", columnDefinition = "LONGTEXT")
    private String codeJson;

    @Column(length = 32)
    @Builder.Default
    private String status = "DRAFT"; // DRAFT / FORMALIZED / TESTED / LIVE

    /**
     * 이 워크스페이스에서 자동주문 제안을 발사할 때 사용할 BrokerAccount.
     * null = 자동주문 비활성. MOCK 또는 REAL 계정 1개와 연결.
     * (BrokerAccount는 user_id+env unique이므로 user 동일성은 별도로 검증)
     */
    @Column(name = "broker_account_id")
    private Long brokerAccountId;

    /**
     * 이 워크스페이스와 매핑된 GitHub repo full name ("owner/repo").
     * Developer Studio Git 연동: 1 워크스페이스 ↔ 1 repo.
     */
    @Column(name = "github_repo_full_name", length = 200)
    private String githubRepoFullName;

    /** GitHub 기본 브랜치 (default: main). */
    @Column(name = "github_branch", length = 100)
    @Builder.Default
    private String githubBranch = "main";

    /**
     * Claude Code 에이전트 멀티세션 ID — 같은 워크스페이스의 연속 요청을 --resume 으로 이어간다(VSCode 패리티).
     * 백엔드 재시작에도 대화 맥락이 유지되도록 DB 영속화. 새 대화 시 null 로 초기화.
     */
    @Column(name = "claude_session_id", length = 64)
    private String claudeSessionId;

    @CreationTimestamp
    private LocalDateTime createdAt;

    @UpdateTimestamp
    private LocalDateTime updatedAt;
}
