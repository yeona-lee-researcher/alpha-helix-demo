package com.DevBridge.devbridge.domain.chat.service;

import com.DevBridge.devbridge.domain.chat.entity.ChatRoom;
import com.DevBridge.devbridge.domain.notification.entity.Notification;
import com.DevBridge.devbridge.domain.user.entity.User;
import com.DevBridge.devbridge.domain.chat.repository.ChatRoomRepository;
import com.DevBridge.devbridge.domain.notification.repository.NotificationRepository;
import com.DevBridge.devbridge.domain.user.repository.UserRepository;
import io.getstream.chat.java.exceptions.StreamException;
import io.getstream.chat.java.models.Channel;
import io.getstream.chat.java.models.Channel.ChannelMemberRequestObject;
import io.getstream.chat.java.models.Channel.ChannelRequestObject;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Arrays;
import java.util.List;
import java.util.Optional;

@Service
@RequiredArgsConstructor
public class StreamChatService {

    private static final String CHANNEL_TYPE = "messaging";

    private final ChatRoomRepository chatRoomRepository;
    private final NotificationRepository notificationRepository;
    private final UserRepository userRepository;

    // ─────────────────────────────────────────────────────────────
    // Token
    // ─────────────────────────────────────────────────────────────

    /**
     * Generates a Stream Chat user token for the given user.
     * The frontend passes this token to StreamChat.connectUser().
     */
    public String generateToken(User user) {
        return io.getstream.chat.java.models.User.createToken(streamUserId(user), null, null);
    }

    // ─────────────────────────────────────────────────────────────
    // User sync
    // ─────────────────────────────────────────────────────────────

    /**
     * Creates or updates the user on Stream Chat.
     * Called on signup and when profile info changes.
     */
    public void upsertStreamUser(User user) {
        try {
            String displayName = user.getUsername() != null ? user.getUsername() : user.getEmail().split("@")[0];
            io.getstream.chat.java.models.User.UserRequestObject.UserRequestObjectBuilder builder =
                    io.getstream.chat.java.models.User.UserRequestObject.builder()
                            .id(streamUserId(user))
                            .name(displayName);
            if (user.getProfileImageUrl() != null && !user.getProfileImageUrl().isBlank()) {
                builder.additionalField("image", user.getProfileImageUrl());
            }
            io.getstream.chat.java.models.User.upsert()
                    .user(builder.build())
                    .request();
        } catch (StreamException e) {
            throw new RuntimeException("Failed to upsert Stream user for user " + user.getId(), e);
        }
    }

    // ─────────────────────────────────────────────────────────────
    // Direct Message room
    // ─────────────────────────────────────────────────────────────

    /**
     * Gets the existing DM room between two users, or creates it if it doesn't exist.
     */
    @Transactional
    public ChatRoom getOrCreateDirectMessageRoom(User requester, User target) {
        // Enforce consistent ordering by User ID to ensure symmetry and prevent duplicates
        User user1 = requester.getId() < target.getId() ? requester : target;
        User user2 = requester.getId() < target.getId() ? target : requester;

        String[] names = { streamUserId(user1), streamUserId(user2) };
        Arrays.sort(names);
        String channelId = "dm-" + names[0] + "-" + names[1];

        try {
            createStreamChannel(channelId, user1, user2);
        } catch (RuntimeException e) {
            System.err.println("[StreamChat] Warning: server-side channel ensure failed for ["
                    + channelId + "]: " + e.getMessage()
                    + " — frontend JS SDK handles channel creation directly.");
        }

        Optional<ChatRoom> existing = chatRoomRepository.findByParticipants(user1, user2);
        if (existing.isPresent()) {
            // Re-ensure both users are Stream channel members in case the initial
            // createStreamChannel call failed (e.g., Stream API was unavailable).
            try {
                upsertStreamUser(user1);
                upsertStreamUser(user2);
                Channel.update(CHANNEL_TYPE, channelId)
                        .addMembers(List.of(streamUserId(user1), streamUserId(user2)))
                        .request();
            } catch (Exception e) {
                System.err.println("[StreamChat] Warning: addMembers on existing room failed for ["
                        + channelId + "]: " + e.getMessage());
            }
            return existing.get();
        }

        ChatRoom room = ChatRoom.builder()
                .user1(user1)
                .user2(user2)
                .roomType(ChatRoom.RoomType.DIRECT_MESSAGE)
                .streamChannelId(channelId)
                .streamChannelType(CHANNEL_TYPE)
                .build();

        return chatRoomRepository.save(room);
    }

    // ─────────────────────────────────────────────────────────────
    // Per-pair meeting rooms (NOT persisted as ChatRoom rows).
    // Used by the dashboard meeting tabs to keep each meeting mode
    // (free DM / contract negotiation / project meeting) on its own
    // Stream channel even between the same two users.
    // ─────────────────────────────────────────────────────────────

    /**
     * Server-side ensure of a meeting Stream channel between the requester and
     * the target user. Returns the channelId; caller can then call channel.watch()
     * from the frontend without needing channel-create permission.
     *
     * mode = "contract" -> channelId "cm-{a}-{b}"
     * mode = "project"  -> channelId "pm-{a}-{b}"
     */
    public String ensureMeetingChannel(User requester, User target, String mode) {
        if (requester == null || target == null) {
            throw new IllegalArgumentException("requester and target are required");
        }
        if (requester.getId().equals(target.getId())) {
            throw new IllegalArgumentException("Cannot start a meeting with yourself");
        }
        String prefix;
        if ("contract".equalsIgnoreCase(mode)) {
            prefix = "cm";
        } else if ("project".equalsIgnoreCase(mode)) {
            prefix = "pm";
        } else {
            throw new IllegalArgumentException("mode must be 'contract' or 'project'");
        }
        User a = requester.getId() < target.getId() ? requester : target;
        User b = requester.getId() < target.getId() ? target : requester;
        String channelId = prefix + "-" + a.getId() + "-" + b.getId();
        try {
            createStreamChannel(channelId, a, b);
        } catch (RuntimeException e) {
            System.err.println("[StreamChat] Warning: ensureMeetingChannel failed for ["
                    + channelId + "]: " + e.getMessage());
        }
        return channelId;
    }

    // ─────────────────────────────────────────────────────────────
    // Contract Negotiation room
    // ─────────────────────────────────────────────────────────────

    /**
     * Gets or creates the chat room tied to a CONTRACT_NEGOTIATION record.
     */
    @Transactional
    public ChatRoom getOrCreateNegotiationRoom(Long negotiationId, User client, User partner) {        Optional<ChatRoom> existing = chatRoomRepository.findByContractNegotiationId(negotiationId);
        if (existing.isPresent()) {
            return existing.get();
        }

        String channelId = "negotiation-" + negotiationId;
        createStreamChannel(channelId, client, partner);

        ChatRoom room = ChatRoom.builder()
                .user1(client)
                .user2(partner)
                .roomType(ChatRoom.RoomType.CONTRACT_NEGOTIATION)
                .contractNegotiationId(negotiationId)
                .streamChannelId(channelId)
                .streamChannelType(CHANNEL_TYPE)
                .build();

        return chatRoomRepository.save(room);
    }

    // ─────────────────────────────────────────────────────────────
    // Room queries
    // ─────────────────────────────────────────────────────────────

    public List<ChatRoom> getRoomsForUser(User user) {
        return chatRoomRepository.findAllByUser(user);
    }

    public Optional<ChatRoom> getRoomById(Long roomId) {
        return chatRoomRepository.findById(roomId);
    }

    // ─────────────────────────────────────────────────────────────
    // Notifications
    // ─────────────────────────────────────────────────────────────

    @Transactional
    public Notification createNotification(User recipient,
                                           Notification.NotificationType type,
                                           String title,
                                           String message,
                                           String relatedEntityType,
                                           Long relatedEntityId) {
        Notification notification = Notification.builder()
                .user(recipient)
                .notificationType(type)
                .title(title)
                .message(message)
                .relatedEntityType(relatedEntityType)
                .relatedEntityId(relatedEntityId)
                .build();
        return notificationRepository.save(notification);
    }

    public List<Notification> getNotificationsForUser(User user) {
        return notificationRepository.findByUserOrderByCreatedAtDesc(user);
    }

    public List<Notification> getUnreadNotificationsForUser(User user) {
        return notificationRepository.findByUserAndIsReadFalseOrderByCreatedAtDesc(user);
    }

    public long countUnreadNotifications(User user) {
        return notificationRepository.countByUserAndIsReadFalse(user);
    }

    @Transactional
    public void markAllNotificationsRead(User user) {
        notificationRepository.markAllReadByUser(user);
    }

    @Transactional
    public void markNotificationRead(Long notificationId, User user) {
        notificationRepository.findById(notificationId).ifPresent(n -> {
            if (n.getUser().getId().equals(user.getId())) {
                n.setRead(true);
                notificationRepository.save(n);
            }
        });
    }

    // ─────────────────────────────────────────────────────────────
    // Helpers
    // ─────────────────────────────────────────────────────────────

    /**
     * Stream user IDs are derived from the user's email so they are globally unique
     * and stable even if the username changes.
     */
    public String streamUserId(User user) {
        if (user.getEmail() == null) {
            return "user-" + user.getId();
        }
        return user.getEmail().toLowerCase()
                .replace("@", "_")
                .replace(".", "_")
                .replace("+", "_");
    }

    private void createStreamChannel(String channelId, User user1, User user2) {
        try {
            upsertStreamUser(user1);
            upsertStreamUser(user2);

            String name1 = user1.getUsername() != null ? user1.getUsername() : user1.getEmail().split("@")[0];
            String name2 = user2.getUsername() != null ? user2.getUsername() : user2.getEmail().split("@")[0];

            io.getstream.chat.java.models.User.UserRequestObject createdBy =
                    io.getstream.chat.java.models.User.UserRequestObject.builder()
                            .id(streamUserId(user1))
                            .name(name1)
                            .build();

            Channel.getOrCreate(CHANNEL_TYPE, channelId)
                    .data(ChannelRequestObject.builder()
                            .createdBy(createdBy)
                            .members(List.of(
                                    ChannelMemberRequestObject.builder()
                                            .user(io.getstream.chat.java.models.User.UserRequestObject.builder()
                                                    .id(streamUserId(user1)).name(name1).build())
                                            .build(),
                                    ChannelMemberRequestObject.builder()
                                            .user(io.getstream.chat.java.models.User.UserRequestObject.builder()
                                                    .id(streamUserId(user2)).name(name2).build())
                                            .build()
                            ))
                            .build())
                    .request();

            Channel.update(CHANNEL_TYPE, channelId)
                    .addMembers(List.of(streamUserId(user1), streamUserId(user2)))
                    .request();

        } catch (StreamException e) {
            throw new RuntimeException("Stream channel creation failed [" + channelId + "]: " + e.getMessage(), e);
        }
    }
}
