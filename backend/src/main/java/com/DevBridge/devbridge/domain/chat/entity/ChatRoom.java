package com.DevBridge.devbridge.domain.chat.entity;

import com.DevBridge.devbridge.domain.user.entity.User;
import jakarta.persistence.*;
import lombok.*;
import org.springframework.data.annotation.CreatedDate;
import org.springframework.data.jpa.domain.support.AuditingEntityListener;

import java.time.LocalDateTime;

/**
 * Tracks chat room metadata and Stream Chat channel mapping.
 * Actual messages are stored and delivered by Stream Chat — NOT in this DB.
 *
 * Two room types:
 *  - DIRECT_MESSAGE: open DM between any two users
 *  - CONTRACT_NEGOTIATION: room tied to a specific contract negotiation
 */
@Entity
@Table(name = "CHAT_ROOM")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
@EntityListeners(AuditingEntityListener.class)
public class ChatRoom {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user1_id", nullable = false)
    private User user1;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user2_id", nullable = false)
    private User user2;

    @Enumerated(EnumType.STRING)
    @Column(name = "room_type", nullable = false, length = 30)
    @Builder.Default
    private RoomType roomType = RoomType.DIRECT_MESSAGE;

    /**
     * Set only when roomType = CONTRACT_NEGOTIATION.
     */
    @Column(name = "contract_negotiation_id")
    private Long contractNegotiationId;

    /**
     * Stream Chat channel ID (e.g. "dm-user1-user2").
     */
    @Column(name = "stream_channel_id", nullable = false, unique = true, length = 255)
    private String streamChannelId;

    /**
     * Stream Chat channel type (default: "messaging").
     */
    @Column(name = "stream_channel_type", nullable = false, length = 50)
    @Builder.Default
    private String streamChannelType = "messaging";

    @CreatedDate
    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    public enum RoomType {
        DIRECT_MESSAGE,
        CONTRACT_NEGOTIATION
    }
}
