package com.DevBridge.devbridge.domain.user.dto;

import com.DevBridge.devbridge.domain.user.entity.User;
import lombok.*;

import java.time.LocalDate;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class AuthResponse {
    private Long userId;
    private String email;
    private String username;
    private String phone;
    private LocalDate birthDate;
    private User.UserType userType;
    private String githubUsername;
    private String token;     // JWT (Bearer 토큰)
    private String message;
}
