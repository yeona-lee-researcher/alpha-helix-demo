package com.DevBridge.devbridge.domain.project.controller;

import com.DevBridge.devbridge.domain.user.dto.*;
import com.DevBridge.devbridge.domain.client.dto.*;
import com.DevBridge.devbridge.domain.project.dto.*;
import com.DevBridge.devbridge.domain.chat.dto.*;
import com.DevBridge.devbridge.domain.notification.dto.*;
import com.DevBridge.devbridge.domain.payment.dto.*;
import com.DevBridge.devbridge.domain.strategy.dto.*;
import com.DevBridge.devbridge.domain.ai.dto.*;
import com.DevBridge.devbridge.domain.project.repository.ProjectAttachmentRepository;
import com.DevBridge.devbridge.domain.project.service.ProgressDashboardService;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.StandardCopyOption;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.Map;
import java.util.UUID;

/**
 * 진행 프로젝트 대시보드 통합 컨트롤러.
 * - /api/projects/{pid}/dashboard            - 전체 한 번에
 * - /api/projects/{pid}/milestones           - 목록/생성 + 제출/승인/재요청
 * - /api/projects/{pid}/escrows              - 목록/생성 + Mock 결제
 * - /api/projects/{pid}/attachments          - 목록/생성/삭제
 * - /api/projects/{pid}/meeting              - 조회/upsert
 */
@RestController
@RequestMapping("/api/projects/{projectId}")
@RequiredArgsConstructor
public class ProgressDashboardController {

    private final ProgressDashboardService service;

    @Value("${app.upload.dir:uploads}")
    private String uploadDir;

    @Value("${app.upload.public-base:/files}")
    private String publicBase;

    @GetMapping("/dashboard")
    public ResponseEntity<?> dashboard(@PathVariable Long projectId) {
        return guarded(() -> ResponseEntity.ok(service.dashboard(projectId)));
    }

    // ---------- Milestones ----------

    @GetMapping("/milestones")
    public ResponseEntity<?> listMilestones(@PathVariable Long projectId) {
        return guarded(() -> ResponseEntity.ok(service.listMilestones(projectId)));
    }

    @PostMapping("/milestones")
    public ResponseEntity<?> createMilestone(@PathVariable Long projectId,
                                             @RequestBody MilestoneCreateRequest req) {
        return guarded(() -> ResponseEntity.status(HttpStatus.CREATED)
                .body(service.createMilestone(projectId, req)));
    }

    @PostMapping("/milestones/{id}/submit")
    public ResponseEntity<?> submit(@PathVariable Long projectId, @PathVariable Long id,
                                    @RequestBody(required = false) MilestoneSubmitRequest req) {
        return guarded(() -> ResponseEntity.ok(service.submit(projectId, id, req)));
    }

    @PostMapping("/milestones/{id}/approve")
    public ResponseEntity<?> approve(@PathVariable Long projectId, @PathVariable Long id) {
        return guarded(() -> ResponseEntity.ok(service.approve(projectId, id)));
    }

    @PostMapping("/milestones/{id}/request-revision")
    public ResponseEntity<?> requestRevision(@PathVariable Long projectId, @PathVariable Long id,
                                             @RequestBody(required = false) Map<String, String> body) {
        String reason = body == null ? null : body.get("reason");
        return guarded(() -> ResponseEntity.ok(service.requestRevision(projectId, id, reason)));
    }

    @PostMapping("/milestones/{id}/cancel-revision")
    public ResponseEntity<?> cancelRevision(@PathVariable Long projectId, @PathVariable Long id) {
        return guarded(() -> ResponseEntity.ok(service.cancelRevision(projectId, id)));
    }

    // ---------- Escrows ----------

    @GetMapping("/escrows")
    public ResponseEntity<?> listEscrows(@PathVariable Long projectId) {
        return guarded(() -> ResponseEntity.ok(service.listEscrows(projectId)));
    }

    @PostMapping("/escrows")
    public ResponseEntity<?> createEscrow(@PathVariable Long projectId,
                                          @RequestBody Map<String, Object> body) {
        Long milestoneId = body.get("milestoneId") == null ? null : ((Number) body.get("milestoneId")).longValue();
        Long amount = body.get("amount") == null ? null : ((Number) body.get("amount")).longValue();
        Long payeeUserId = body.get("payeeUserId") == null ? null : ((Number) body.get("payeeUserId")).longValue();
        return guarded(() -> ResponseEntity.status(HttpStatus.CREATED)
                .body(service.createEscrow(projectId, milestoneId, amount, payeeUserId)));
    }

    @PostMapping("/escrows/{id}/pay-mock")
    public ResponseEntity<?> payMock(@PathVariable Long projectId, @PathVariable Long id,
                                     @RequestBody EscrowPayMockRequest req) {
        return guarded(() -> ResponseEntity.ok(service.payMock(projectId, id, req)));
    }

    /**
     * 토스페이먼츠 결제 확정. 프론트가 SDK 결제창에서 받은 paymentKey/orderId/amount 를
     * 그대로 보내면 서버가 시크릿 키로 토스 /v1/payments/confirm 호출 → 실제 승인 + 에스크로 DEPOSITED.
     * body: { paymentKey, orderId, amount }
     */
    @PostMapping("/escrows/{id}/pg-confirm")
    public ResponseEntity<?> pgConfirm(@PathVariable Long projectId, @PathVariable Long id,
                                       @RequestBody Map<String, Object> body) {
        String paymentKey = (String) body.get("paymentKey");
        String orderId    = (String) body.get("orderId");
        Number amountN    = (Number) body.get("amount");
        if (paymentKey == null || orderId == null || amountN == null) {
            return ResponseEntity.badRequest().body(Map.of("message", "paymentKey/orderId/amount 가 필요합니다."));
        }
        long amount = amountN.longValue();
        return guarded(() -> ResponseEntity.ok(service.confirmPg(projectId, id, paymentKey, orderId, amount)));
    }

    // ---------- Attachments ----------

    @GetMapping("/attachments")
    public ResponseEntity<?> listAttachments(@PathVariable Long projectId) {
        return guarded(() -> ResponseEntity.ok(service.listAttachments(projectId)));
    }

    @PostMapping("/attachments")
    public ResponseEntity<?> createAttachment(@PathVariable Long projectId,
                                              @RequestBody AttachmentCreateRequest req) {
        return guarded(() -> ResponseEntity.status(HttpStatus.CREATED)
                .body(service.createAttachment(projectId, req)));
    }

    /**
     * 실제 파일 업로드 (multipart/form-data).
     * - file: 필수
     * - name: 표시할 파일명(선택, 비우면 원본 파일명 사용)
     * - notes: 설명(선택)
     * 디스크에 저장 후 public URL을 attachment.url 로 기록.
     */
    @PostMapping(value = "/attachments/upload", consumes = "multipart/form-data")
    public ResponseEntity<?> uploadAttachment(@PathVariable Long projectId,
                                              @RequestPart("file") MultipartFile file,
                                              @RequestPart(value = "name", required = false) String name,
                                              @RequestPart(value = "notes", required = false) String notes) {
        return guarded(() -> {
            if (file == null || file.isEmpty()) {
                throw new IllegalArgumentException("파일이 비어 있습니다.");
            }
            String original = file.getOriginalFilename() == null ? "file" : file.getOriginalFilename();
            String ext = "";
            int dot = original.lastIndexOf('.');
            if (dot >= 0) ext = original.substring(dot); // ".pdf"
            String dateDir = LocalDate.now().format(DateTimeFormatter.ofPattern("yyyy/MM"));
            String stored = UUID.randomUUID().toString().replace("-", "") + ext;

            Path root = Paths.get(uploadDir).toAbsolutePath().normalize();
            Path projectDir = root.resolve("projects").resolve(String.valueOf(projectId)).resolve(dateDir);
            try {
                Files.createDirectories(projectDir);
            } catch (IOException e) {
                throw new RuntimeException("업로드 폴더 생성에 실패했습니다: " + e.getMessage());
            }
            Path target = projectDir.resolve(stored);
            try (var in = file.getInputStream()) {
                Files.copy(in, target, StandardCopyOption.REPLACE_EXISTING);
            } catch (IOException e) {
                throw new RuntimeException("파일 저장에 실패했습니다: " + e.getMessage());
            }

            // public URL: /files/projects/{pid}/yyyy/MM/{stored}
            String relative = String.format("projects/%d/%s/%s", projectId, dateDir, stored);
            String publicUrl = publicBase + "/" + relative;

            String displayName = (name != null && !name.isBlank()) ? name : original;
            AttachmentResponse resp = service.createUploadedAttachment(
                    projectId, displayName, publicUrl,
                    file.getContentType(), file.getSize(), notes);
            return ResponseEntity.status(HttpStatus.CREATED).body(resp);
        });
    }

    @DeleteMapping("/attachments/{id}")
    public ResponseEntity<?> deleteAttachment(@PathVariable Long projectId, @PathVariable Long id) {
        return guarded(() -> {
            service.deleteAttachment(projectId, id);
            return ResponseEntity.noContent().build();
        });
    }

    /**
     * 파일 스트리밍 다운로드.
     * GET /api/projects/{pid}/attachments/{id}/download
     * - DB에서 url 조회 → /files/... 경로에서 실제 파일 읽어서 응답
     */
    @GetMapping("/attachments/{id}/download")
    public ResponseEntity<?> downloadAttachment(@PathVariable Long projectId, @PathVariable Long id) {
        return guarded(() -> {
            ProjectAttachmentRepository repo = service.getAttachmentRepository();
            com.DevBridge.devbridge.domain.project.entity.ProjectAttachment a =
                    repo.findByIdAndProjectId(id, projectId)
                        .orElseThrow(() -> new IllegalArgumentException("첨부를 찾을 수 없습니다."));
            String url = a.getUrl();
            if (url == null || !url.startsWith(publicBase + "/")) {
                return ResponseEntity.status(org.springframework.http.HttpStatus.UNPROCESSABLE_ENTITY)
                        .body(Map.of("message", "이 파일은 다운로드를 지원하지 않습니다."));
            }
            String relative = url.substring((publicBase + "/").length()); // projects/{pid}/...
            java.nio.file.Path root = java.nio.file.Paths.get(uploadDir).toAbsolutePath().normalize();
            java.nio.file.Path filePath = root.resolve(relative).normalize();
            // Path traversal 방지
            if (!filePath.startsWith(root)) {
                return ResponseEntity.status(org.springframework.http.HttpStatus.FORBIDDEN)
                        .body(Map.of("message", "접근이 거부되었습니다."));
            }
            if (!java.nio.file.Files.exists(filePath)) {
                return ResponseEntity.status(org.springframework.http.HttpStatus.NOT_FOUND)
                        .body(Map.of("message", "파일이 서버에 존재하지 않습니다."));
            }
            try {
                byte[] bytes = java.nio.file.Files.readAllBytes(filePath);
                String mime = a.getMimeType() != null ? a.getMimeType() : "application/octet-stream";
                String encodedName = java.net.URLEncoder.encode(a.getName(), java.nio.charset.StandardCharsets.UTF_8)
                        .replace("+", "%20");
                return ResponseEntity.ok()
                        .header("Content-Type", mime)
                        .header("Content-Disposition", "attachment; filename*=UTF-8''" + encodedName)
                        .header("Content-Length", String.valueOf(bytes.length))
                        .body(bytes);
            } catch (IOException e) {
                throw new RuntimeException("파일 읽기에 실패했습니다: " + e.getMessage());
            }
        });
    }

    // ---------- Meeting ----------

    @GetMapping("/meeting")
    public ResponseEntity<?> getMeeting(@PathVariable Long projectId) {
        return guarded(() -> {
            MeetingResponse m = service.getMeeting(projectId);
            return ResponseEntity.ok(m == null ? Map.of() : m);
        });
    }

    @PutMapping("/meeting")
    public ResponseEntity<?> upsertMeeting(@PathVariable Long projectId,
                                           @RequestBody MeetingUpsertRequest req) {
        return guarded(() -> ResponseEntity.ok(service.upsertMeeting(projectId, req)));
    }

    // ---------- Helpers ----------

    private interface GuardedAction { ResponseEntity<?> run(); }

    private static ResponseEntity<?> guarded(GuardedAction action) {
        try {
            return action.run();
        } catch (SecurityException se) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN)
                    .body(Map.of("message", se.getMessage()));
        } catch (IllegalArgumentException iae) {
            return ResponseEntity.badRequest().body(Map.of("message", iae.getMessage()));
        } catch (IllegalStateException ise) {
            return ResponseEntity.status(HttpStatus.CONFLICT).body(Map.of("message", ise.getMessage()));
        } catch (RuntimeException re) {
            String msg = re.getMessage() == null ? "처리 중 오류가 발생했습니다." : re.getMessage();
            if (msg.contains("인증")) {
                return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(Map.of("message", msg));
            }
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(Map.of("message", msg));
        }
    }
}
