package com.DevBridge.devbridge.domain.notification.controller;

import com.DevBridge.devbridge.domain.notification.dto.NotificationResponse;
import com.DevBridge.devbridge.domain.user.entity.User;
import com.DevBridge.devbridge.domain.user.repository.UserRepository;
import com.DevBridge.devbridge.domain.chat.service.StreamChatService;
import com.DevBridge.devbridge.global.security.AuthContext;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

/**
 * Notification endpoints.
 *
 * <p>M9 보안 수정: 이전에는 {@code ?userId=} 요청 파라미터를 그대로 신뢰해 인증된 누구나 타인의 알림을
 * 조회/읽음처리할 수 있는 IDOR 가 있었다. 이제 신원은 항상 JWT(AuthContext)에서만 가져오고,
 * 요청 파라미터로 받지 않는다. CORS 는 WebConfig 가 전역 처리.
 */
@RestController
@RequestMapping("/api/notifications")
@RequiredArgsConstructor
public class NotificationController {

    private final StreamChatService streamChatService;
    private final UserRepository userRepository;

    /** GET /api/notifications — 인증 사용자 본인 알림 전체, 최신순. */
    @GetMapping
    public ResponseEntity<?> getAll() {
        User user = currentUser();
        if (user == null) return unauthorized();
        List<NotificationResponse> list = streamChatService.getNotificationsForUser(user)
                .stream().map(NotificationResponse::from).toList();
        return ResponseEntity.ok(list);
    }

    /** GET /api/notifications/unread — 본인 미읽음 알림만. */
    @GetMapping("/unread")
    public ResponseEntity<?> getUnread() {
        User user = currentUser();
        if (user == null) return unauthorized();
        List<NotificationResponse> list = streamChatService.getUnreadNotificationsForUser(user)
                .stream().map(NotificationResponse::from).toList();
        return ResponseEntity.ok(list);
    }

    /** GET /api/notifications/count — 본인 미읽음 개수(배지용). */
    @GetMapping("/count")
    public ResponseEntity<?> getUnreadCount() {
        User user = currentUser();
        if (user == null) return unauthorized();
        long count = streamChatService.countUnreadNotifications(user);
        return ResponseEntity.ok(Map.of("unreadCount", count));
    }

    /** PATCH /api/notifications/{notificationId}/read — 본인 알림만 읽음 처리(서비스가 소유권 재확인). */
    @PatchMapping("/{notificationId}/read")
    public ResponseEntity<?> markOneRead(@PathVariable Long notificationId) {
        User user = currentUser();
        if (user == null) return unauthorized();
        streamChatService.markNotificationRead(notificationId, user);
        return ResponseEntity.noContent().build();
    }

    /** PATCH /api/notifications/read-all — 본인 알림 전체 읽음 처리. */
    @PatchMapping("/read-all")
    public ResponseEntity<?> markAllRead() {
        User user = currentUser();
        if (user == null) return unauthorized();
        streamChatService.markAllNotificationsRead(user);
        return ResponseEntity.noContent().build();
    }

    /** JWT(AuthContext) 의 사용자 — 미인증/미존재면 null. 요청 파라미터 신원은 신뢰하지 않는다. */
    private User currentUser() {
        Long uid = AuthContext.currentUserId();
        if (uid == null) return null;
        return userRepository.findById(uid).orElse(null);
    }

    private static ResponseEntity<?> unauthorized() {
        return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(Map.of("error", "인증 필요"));
    }
}
