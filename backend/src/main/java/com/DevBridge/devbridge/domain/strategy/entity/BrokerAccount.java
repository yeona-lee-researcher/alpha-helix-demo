package com.DevBridge.devbridge.domain.strategy.entity;

import com.DevBridge.devbridge.domain.user.entity.User;
import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.UpdateTimestamp;
import org.springframework.data.annotation.CreatedDate;
import org.springframework.data.jpa.domain.support.AuditingEntityListener;

import java.time.LocalDateTime;

/**
 * 사용자별 브로커 API 자격증명 + 매매 한도.
 * brokerType: KIS(한국투자증권) | BINANCE (스팟/선물)
 * appsecret / apiSecret은 평문 저장 금지 — 항상 CryptoService로 암호화 후 저장.
 *
 * env: MOCK(모의투자/테스트넷) | REAL(실전/메인넷).
 */
@Entity
@Table(name = "BROKER_ACCOUNT", uniqueConstraints = {
        @UniqueConstraint(name = "uq_broker_user_type_env", columnNames = {"user_id", "broker_type", "env"})
})
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
@EntityListeners(AuditingEntityListener.class)
public class BrokerAccount {

    /**
     * KIS KRW 한도(dailyBuyKrw/dailySellKrw) 검증 시 USD 명목가를 KRW 로 환산하는 근사 환율.
     * TODO: 실시간 환율 API 로 교체(현재 BacktestService.USD_KRW 와 동일한 1300 근사).
     */
    public static final double USD_KRW_APPROX = 1300.0;

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user_id", nullable = false)
    private User user;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 8)
    @Builder.Default
    private Env env = Env.MOCK;

    /** 브로커 유형: KIS(기본) | BINANCE */
    @Enumerated(EnumType.STRING)
    @Column(name = "broker_type", nullable = false, length = 16)
    @Builder.Default
    private BrokerType brokerType = BrokerType.KIS;

    // ── KIS 전용 필드 (brokerType=KIS 일 때만 사용) ───────────────────────────

    /** KIS appkey */
    @Column(name = "app_key", length = 100)
    private String appKey;

    /** KIS appsecret — 반드시 CryptoService.encrypt() 후 저장 */
    @Column(name = "app_secret_enc", columnDefinition = "TEXT")
    private String appSecretEnc;

    /** 종합계좌번호 8자리 */
    @Column(name = "cano", length = 16)
    private String cano;

    /** 상품코드 2자리 (보통 "01") */
    @Column(name = "acnt_prdt_cd", length = 4)
    private String acntPrdtCd;

    // ── Binance 전용 필드 (brokerType=BINANCE 일 때만 사용) ───────────────────

    /** Binance API Key */
    @Column(name = "binance_api_key", length = 100)
    private String binanceApiKey;

    /** Binance API Secret — CryptoService.encrypt() 후 저장 */
    @Column(name = "binance_api_secret_enc", columnDefinition = "TEXT")
    private String binanceApiSecretEnc;

    /** SPOT / FUTURES — Binance 계정 모드 */
    @Enumerated(EnumType.STRING)
    @Column(name = "binance_mode", length = 16)
    @Builder.Default
    private BinanceMode binanceMode = BinanceMode.SPOT;

    /** 1건당 최대 주문금액 (USD) — 0이면 무제한 */
    @Column(name = "max_order_usd")
    @Builder.Default
    private Long maxOrderUsd = 5_000L;

    /** 일일 누적 최대 주문금액 (USD) — Binance/일반용. KIS 는 아래 KRW 한도가 우선. */
    @Column(name = "daily_order_usd")
    @Builder.Default
    private Long dailyOrderUsd = 20_000L;

    /** 손실 한도 서킷브레이커 (USD): 미실현 총손실이 이 값 초과 시 신규 매수 차단. null/0 = 비활성. (B3) */
    @Column(name = "daily_loss_limit_usd")
    private Long dailyLossLimitUsd;

    /** KIS 전용: 1일 누적 매수 한도 (원화). null = 무제한. */
    @Column(name = "daily_buy_krw")
    private Long dailyBuyKrw;

    /** KIS 전용: 1일 누적 매도 한도 (원화). null = 무제한. */
    @Column(name = "daily_sell_krw")
    private Long dailySellKrw;

    /** 사용자 직접 ON/OFF 가능한 마스터 스위치. false면 모든 승인 거부. */
    @Column(name = "trading_enabled", nullable = false)
    @Builder.Default
    private Boolean tradingEnabled = false;

    /**
     * 자동 체결 스위치. true면 시그널이 만든 PENDING 제안을 사람 승인 없이 자동 실행한다.
     * 전제: tradingEnabled=true. REAL 계정은 MOCK 자동매매 졸업 게이트(2주+20회) 통과 필요.
     * 모든 안전장치(한도·kill-switch)는 그대로 적용된다. 기본 OFF.
     */
    @Column(name = "auto_execute", nullable = false)
    @Builder.Default
    private Boolean autoExecute = false;

    /**
     * 실전(REAL) 자동매매 책임고지 동의 여부. REAL tradingEnabled ON 전 1회 동의 필요.
     * 투자 책임은 전적으로 본인에게 있으며 Alpha-Helix는 자문이 아님을 사용자가 명시 동의했음을 기록.
     */
    @Column(name = "real_risk_acknowledged", nullable = false)
    @Builder.Default
    private Boolean realRiskAcknowledged = false;

    /** 마지막 연결 테스트 성공 시각 (잔고조회로 검증) */
    @Column(name = "last_verified_at")
    private LocalDateTime lastVerifiedAt;

    // ───── B2: 체결 후 잔고/포지션 동기화 스냅샷 ─────
    /** 마지막 동기화된 잔고/포지션 JSON (체결 직후 자동 갱신). */
    @Column(name = "last_balance_json", columnDefinition = "LONGTEXT")
    private String lastBalanceJson;

    /** 잔고 스냅샷 시각. */
    @Column(name = "last_balance_at")
    private LocalDateTime lastBalanceAt;

    @CreatedDate
    @Column(name = "created_at", updatable = false)
    private LocalDateTime createdAt;

    @UpdateTimestamp
    @Column(name = "updated_at")
    private LocalDateTime updatedAt;

    public enum Env {
        MOCK,  // 모의투자(KIS) / 테스트넷(Binance: https://testnet.binance.vision)
        REAL   // 실전투자(KIS) / 메인넷(Binance)
    }

    public enum BrokerType {
        KIS,    // 한국투자증권
        BINANCE // Binance Spot + Futures
    }

    public enum BinanceMode {
        SPOT,    // 현물 거래
        FUTURES  // USDT 마진 선물 (fapi.binance.com)
    }
}
