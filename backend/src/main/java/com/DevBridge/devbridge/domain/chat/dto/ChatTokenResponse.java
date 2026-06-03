package com.DevBridge.devbridge.domain.chat.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;

@Getter
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class ChatTokenResponse {
    /** Stream Chat API key — frontend needs this to initialise StreamChat client. */
    private String apiKey;
    /** Stream Chat JWT for this user — frontend passes to StreamChat.connectUser(). */
    private String token;
    /** Stream user ID for this user (e.g. "user_42_gmail_com"). */
    private String streamUserId;
}
