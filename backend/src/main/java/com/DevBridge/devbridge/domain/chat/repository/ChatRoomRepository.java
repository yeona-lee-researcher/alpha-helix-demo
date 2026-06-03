package com.DevBridge.devbridge.domain.chat.repository;

import com.DevBridge.devbridge.domain.chat.entity.ChatRoom;
import com.DevBridge.devbridge.domain.user.entity.User;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

public interface ChatRoomRepository extends JpaRepository<ChatRoom, Long> {

    /**
     * Find the existing DIRECT_MESSAGE room between two users regardless of which is user1/user2.
     */
    @Query("""
        SELECT r FROM ChatRoom r
        WHERE ((r.user1 = :a AND r.user2 = :b) OR (r.user1 = :b AND r.user2 = :a))
          AND r.roomType = com.DevBridge.devbridge.domain.chat.entity.ChatRoom.RoomType.DIRECT_MESSAGE
    """)
    Optional<ChatRoom> findByParticipants(@Param("a") User a, @Param("b") User b);

    /**
     * Find the negotiation room tied to a specific contract negotiation.
     */
    Optional<ChatRoom> findByContractNegotiationId(Long contractNegotiationId);

    /**
     * List all rooms a given user participates in.
     */
    @Query("""
        SELECT r FROM ChatRoom r
        WHERE r.user1 = :user OR r.user2 = :user
        ORDER BY r.createdAt DESC
    """)
    List<ChatRoom> findAllByUser(@Param("user") User user);

    Optional<ChatRoom> findByStreamChannelId(String streamChannelId);
}
