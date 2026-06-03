package com.DevBridge.devbridge.domain.payment.entity;

import com.DevBridge.devbridge.domain.user.entity.User;
import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.UpdateTimestamp;
import org.springframework.data.annotation.CreatedDate;
import org.springframework.data.jpa.domain.support.AuditingEntityListener;

import java.time.LocalDateTime;

/**
 * 사용자 결제 수단 (신용카드 마스킹 저장).
 * PCI 정책상 카드 전체 번호와 CVC 는 절대 저장하지 않음.
 * 등록 시점에 Luhn 검증만 통과시키고 last4 / brand / holder / 만료 만 보관.
 */
@Entity
@Table(name = "PAYMENT_METHODS")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
@EntityListeners(AuditingEntityListener.class)
public class PaymentMethod {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user_id", nullable = false)
    private User user;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private CardBrand brand;

    @Column(name = "last4", nullable = false, length = 4)
    private String last4;

    @Column(name = "holder_name", nullable = false, length = 100)
    private String holderName;

    @Column(name = "exp_month", nullable = false)
    private Integer expMonth;

    @Column(name = "exp_year", nullable = false)
    private Integer expYear;

    @Column(name = "is_default", nullable = false)
    @Builder.Default
    private boolean isDefault = false;

    @Column(length = 50)
    private String nickname;

    @CreatedDate
    @Column(name = "created_at", updatable = false)
    private LocalDateTime createdAt;

    @UpdateTimestamp
    @Column(name = "updated_at")
    private LocalDateTime updatedAt;

    public enum CardBrand {
        VISA, MASTERCARD, AMEX, JCB, DISCOVER, LOCAL
    }
}
