package com.DevBridge.devbridge.domain.chat.dto;

import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;

@Getter
@NoArgsConstructor
@AllArgsConstructor
public class CreateNegotiationRoomRequest {
    /** CONTRACT_NEGOTIATION.id this room belongs to. */
    private Long contractNegotiationId;
    /** The client user's ID. */
    private Long clientUserId;
    /** The partner user's ID. */
    private Long partnerUserId;
}
