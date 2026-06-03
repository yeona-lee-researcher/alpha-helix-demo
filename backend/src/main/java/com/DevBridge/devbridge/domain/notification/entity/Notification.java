package com.DevBridge.devbridge.domain.notification.entity;

import com.DevBridge.devbridge.domain.user.entity.User;
import jakarta.persistence.*;
import lombok.*;
import org.springframework.data.annotation.CreatedDate;
import org.springframework.data.jpa.domain.support.AuditingEntityListener;

import java.time.LocalDateTime;

/**
 * In-app system notifications.
 * Covers both chat events (NEW_MESSAGE) and non-chat events (milestones, contracts, etc.).
 */
@Entity
@Table(name = "NOTIFICATION")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
@EntityListeners(AuditingEntityListener.class)
public class Notification {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user_id", nullable = false)
    private User user;

    @Enumerated(EnumType.STRING)
    @Column(name = "notification_type", nullable = false, length = 50)
    private NotificationType notificationType;

    @Column(nullable = false, length = 200)
    private String title;

    @Column(nullable = false, columnDefinition = "TEXT")
    private String message;

    @Column(name = "related_entity_type", length = 50)
    private String relatedEntityType;

    @Column(name = "related_entity_id")
    private Long relatedEntityId;

    @Column(name = "is_read", nullable = false)
    @Builder.Default
    private boolean isRead = false;

    @CreatedDate
    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    public enum NotificationType {
        NEW_MESSAGE,
        APPLICATION_ACCEPTED,
        APPLICATION_REJECTED,
        MILESTONE_SUBMITTED,
        MILESTONE_APPROVED,
        MILESTONE_REVISION_REQUESTED,
        CONTRACT_ITEM_PROPOSED,
        CONTRACT_ITEM_AGREED,
        PROJECT_COMPLETED,
        REVIEW_RECEIVED,
        DEPOSIT_RECEIVED,
        PROJECT_UPDATED
    }
}
