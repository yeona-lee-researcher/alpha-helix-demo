package com.DevBridge.devbridge.domain.user.entity;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.UpdateTimestamp;
import org.springframework.data.annotation.CreatedDate;
import org.springframework.data.jpa.domain.support.AuditingEntityListener;

import java.time.LocalDateTime;

/**
 * 사용자별 외부 AI API 키 (BYOK — Bring Your Own Key).
 *
 * <p>예: 사용자가 본인의 Anthropic(Claude) API 키를 연동해 Developer Studio 의 Claude 에이전트를
 * "VSCode 수준" 으로 직접 사용. 키는 절대 평문 저장 금지 — 항상 {@code CryptoService} (AES-256-GCM) 로
 * 암호화한 뒤 {@code keyEnc} 에 보관하고, 화면 노출용으로는 {@code keyHint}(마스킹 꼬리)만 쓴다.
 *
 * <p>보안 원칙: 사용자 키는 <b>오직 DB(암호화)에만</b> 존재. repo/빌드/.env 에 절대 들어가지 않는다.
 * 복호화는 Claude CLI 호출 직전에만 수행해 자식 프로세스 env(ANTHROPIC_API_KEY)로 주입한다.
 */
@Entity
@Table(name = "user_api_key", uniqueConstraints = {
        @UniqueConstraint(name = "uq_user_api_key_user_provider", columnNames = {"user_id", "provider"})
})
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
@EntityListeners(AuditingEntityListener.class)
public class UserApiKey {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "user_id", nullable = false)
    private Long userId;

    /** 프로바이더: "ANTHROPIC"(Claude). 향후 OPENAI 등 확장 가능. */
    @Column(nullable = false, length = 32)
    private String provider;

    /** AES-256-GCM 으로 암호화된 API 키. 평문 저장 절대 금지. */
    @Column(name = "key_enc", columnDefinition = "TEXT", nullable = false)
    private String keyEnc;

    /** 화면 노출용 마스킹 꼬리(예: "…aB3x"). 평문 키 식별 불가. */
    @Column(name = "key_hint", length = 24)
    private String keyHint;

    @CreatedDate
    @Column(name = "created_at", updatable = false)
    private LocalDateTime createdAt;

    @UpdateTimestamp
    @Column(name = "updated_at")
    private LocalDateTime updatedAt;

    public static final String PROVIDER_ANTHROPIC = "ANTHROPIC";
}
