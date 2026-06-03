package com.DevBridge.devbridge.domain.chat.dto;

import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;

@Getter
@NoArgsConstructor
@AllArgsConstructor
public class CreateDmRoomRequest {
    /** ID of the other user to open a DM with. */
    private Long targetUserId;
}
