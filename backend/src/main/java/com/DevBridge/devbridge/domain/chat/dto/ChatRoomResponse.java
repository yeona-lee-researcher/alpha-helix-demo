package com.DevBridge.devbridge.domain.chat.dto;

import com.DevBridge.devbridge.domain.chat.entity.ChatRoom;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

@Getter
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class ChatRoomResponse {
    private Long id;
    private Long user1Id;
    private String user1Username;
    private String user1ProfileImageUrl;
    private Long user2Id;
    private String user2Username;
    private String user2ProfileImageUrl;
    private String roomType;
    private Long contractNegotiationId;
    private String streamChannelId;
    private String streamChannelType;
    private LocalDateTime createdAt;

    public static ChatRoomResponse from(ChatRoom room) {
        return ChatRoomResponse.builder()
                .id(room.getId())
                .user1Id(room.getUser1().getId())
                .user1Username(room.getUser1().getUsername())
                .user1ProfileImageUrl(room.getUser1().getProfileImageUrl())
                .user2Id(room.getUser2().getId())
                .user2Username(room.getUser2().getUsername())
                .user2ProfileImageUrl(room.getUser2().getProfileImageUrl())
                .roomType(room.getRoomType().name())
                .contractNegotiationId(room.getContractNegotiationId())
                .streamChannelId(room.getStreamChannelId())
                .streamChannelType(room.getStreamChannelType())
                .createdAt(room.getCreatedAt())
                .build();
    }
}
