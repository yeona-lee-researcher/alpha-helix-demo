package com.DevBridge.devbridge.domain.user.entity;

import com.fasterxml.jackson.annotation.JsonCreator;
import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.UpdateTimestamp;
import org.springframework.data.annotation.CreatedDate;
import org.springframework.data.jpa.domain.support.AuditingEntityListener;

import java.time.LocalDate;
import java.time.LocalDateTime;

@Entity
@Table(name = "USERS")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
@EntityListeners(AuditingEntityListener.class)
public class User {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, unique = true, length = 100)
    private String email;

    @Column(nullable = false, length = 20)
    private String phone;

    @Column(nullable = false, unique = true, length = 50)
    private String username;

    @Column(nullable = false, length = 255)
    private String password;

    @Convert(converter = UserTypeConverter.class)
    @Column(name = "user_type", nullable = false)
    private UserType userType;

    @Column(name = "contact_email", length = 100)
    private String contactEmail;

    @Enumerated(EnumType.STRING)
    private Gender gender;

    @Column(name = "birth_date")
    private LocalDate birthDate;

    @Column(length = 50)
    private String region;

    @Column(name = "tax_email", length = 100)
    private String taxEmail;

    @Column(name = "bank_name", length = 50)
    private String bankName;

    @Column(name = "bank_account_number", length = 50)
    private String bankAccountNumber;

    @Column(name = "bank_account_holder_name", length = 50)
    private String bankAccountHolderName;

    @Builder.Default
    @Column(name = "bank_verified", nullable = false)
    private boolean bankVerified = false;

    @Column(name = "profile_image_url", columnDefinition = "TEXT")
    private String profileImageUrl;

    /** GitHub 사용자명 (Developer Studio Git 연동). */
    @Column(name = "github_username", length = 100)
    private String githubUsername;

    /** GitHub Personal Access Token (AES-GCM 암호화 후 저장). 절대 평문 노출 금지. */
    @Column(name = "github_token_encrypted", columnDefinition = "VARBINARY(512)")
    private byte[] githubTokenEncrypted;

    /** GitHub 연동 마지막 검증 시각. */
    @Column(name = "github_connected_at")
    private LocalDateTime githubConnectedAt;

    @CreatedDate
    @Column(name = "created_at", updatable = false)
    private LocalDateTime createdAt;

    @UpdateTimestamp
    @Column(name = "updated_at")
    private LocalDateTime updatedAt;

    public enum UserType {
        FREE,       // 무료 회원
        STANDARD,   // 스탠다드 구독 회원
        PREMIUM;    // 프리미엄 구독 회원

        /** 구 값("CLIENT"/"USER"/"PARTNER"/"PRO") 역방향 호환 처리. */
        @JsonCreator
        public static UserType fromJson(String value) {
            if (value == null) return null;
            return switch (value.toUpperCase()) {
                case "CLIENT", "USER", "FREE" -> FREE;
                case "PARTNER", "PRO", "STANDARD" -> STANDARD;
                case "PREMIUM" -> PREMIUM;
                default -> FREE;
            };
        }
    }

    public enum Gender {
        MALE, FEMALE, OTHER
    }
}
