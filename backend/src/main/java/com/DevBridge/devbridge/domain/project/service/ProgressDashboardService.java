package com.DevBridge.devbridge.domain.project.service;

import com.DevBridge.devbridge.domain.payment.service.TossPaymentsService;
import com.DevBridge.devbridge.domain.project.service.MilestoneSeedingService;
import com.DevBridge.devbridge.domain.user.entity.User;
import com.DevBridge.devbridge.domain.project.entity.Project;
import com.DevBridge.devbridge.domain.project.entity.ProjectApplication;
import com.DevBridge.devbridge.domain.notification.entity.Notification;
import com.DevBridge.devbridge.domain.payment.entity.PaymentMethod;
import com.DevBridge.devbridge.domain.user.dto.*;
import com.DevBridge.devbridge.domain.client.dto.*;
import com.DevBridge.devbridge.domain.project.dto.*;
import com.DevBridge.devbridge.domain.chat.dto.*;
import com.DevBridge.devbridge.domain.notification.dto.*;
import com.DevBridge.devbridge.domain.payment.dto.*;
import com.DevBridge.devbridge.domain.strategy.dto.*;
import com.DevBridge.devbridge.domain.ai.dto.*;
import com.DevBridge.devbridge.domain.user.entity.*;
import com.DevBridge.devbridge.domain.client.entity.*;
import com.DevBridge.devbridge.domain.project.entity.*;
import com.DevBridge.devbridge.domain.chat.entity.*;
import com.DevBridge.devbridge.domain.notification.entity.*;
import com.DevBridge.devbridge.domain.payment.entity.*;
import com.DevBridge.devbridge.domain.strategy.entity.*;
import com.DevBridge.devbridge.domain.ai.entity.*;
import com.DevBridge.devbridge.domain.user.repository.*;
import com.DevBridge.devbridge.domain.client.repository.*;
import com.DevBridge.devbridge.domain.project.repository.*;
import com.DevBridge.devbridge.domain.chat.repository.*;
import com.DevBridge.devbridge.domain.notification.repository.*;
import com.DevBridge.devbridge.domain.payment.repository.*;
import com.DevBridge.devbridge.domain.strategy.repository.*;
import com.DevBridge.devbridge.domain.ai.repository.*;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.*;

/**
 * 진행 프로젝트 대시보드 (마일스톤 / 에스크로 / 첨부 / 미팅 / 알림 통합).
 * Mock 결제 + 상태머신 포함.
 */
@Service
@RequiredArgsConstructor
public class ProgressDashboardService {

    private final ProjectRepository projectRepository;
    private final ProjectMilestoneRepository milestoneRepository;
    private final ProjectEscrowRepository escrowRepository;
    private final ProjectAttachmentRepository attachmentRepository;
    private final ProjectMeetingRepository meetingRepository;
    private final PaymentMethodRepository paymentMethodRepository;
    private final NotificationRepository notificationRepository;
    private final UserRepository userRepository;
    private final ProjectApplicationRepository applicationRepository;
    private final MilestoneSeedingService milestoneSeedingService;
    private final TossPaymentsService tossPaymentsService;

    public ProjectAttachmentRepository getAttachmentRepository() { return attachmentRepository; }

    // ==================== Milestones ====================

    @Transactional
    public List<MilestoneResponse> listMilestones(Long projectId) {
        ensureMember(projectId);
        // 7개 모듈 모두 협의완료인데 마일스톤이 비어있으면 lazy 시드 (멱등).
        // IN_PROGRESS 전이 누락된 기존 프로젝트도 대시보드 진입 시 자동 복구.
        try { milestoneSeedingService.seedIfNeeded(projectId); }
        catch (Exception e) { /* 시드 실패는 조회 막지 않음 */ }
        return milestoneRepository.findByProjectIdOrderBySeqAsc(projectId)
                .stream().map(MilestoneResponse::from).toList();
    }

    @Transactional
    public MilestoneResponse createMilestone(Long projectId, MilestoneCreateRequest req) {
        ensureClient(projectId); ensureProjectActive(projectId);
        if (req.getTitle() == null || req.getTitle().isBlank())
            throw new IllegalArgumentException("마일스톤 제목을 입력해 주세요.");
        if (req.getAmount() == null || req.getAmount() <= 0)
            throw new IllegalArgumentException("금액은 1원 이상이어야 합니다.");

        int seq = req.getSeq() != null ? req.getSeq()
                : milestoneRepository.findByProjectIdOrderBySeqAsc(projectId).size() + 1;

        ProjectMilestone m = ProjectMilestone.builder()
                .projectId(projectId)
                .seq(seq)
                .title(req.getTitle())
                .description(req.getDescription())
                .completionCriteria(req.getCompletionCriteria())
                .amount(req.getAmount())
                .startDate(req.getStartDate())
                .endDate(req.getEndDate())
                .status(ProjectMilestone.MilestoneStatus.PENDING)
                .build();
        return MilestoneResponse.from(milestoneRepository.save(m));
    }

    @Transactional
    public MilestoneResponse submit(Long projectId, Long milestoneId, MilestoneSubmitRequest req) {
        ensurePartner(projectId); ensureProjectActive(projectId);
        ProjectMilestone m = milestoneRepository.findByIdAndProjectId(milestoneId, projectId)
                .orElseThrow(() -> new IllegalArgumentException("마일스톤을 찾을 수 없습니다."));

        if (m.getStatus() != ProjectMilestone.MilestoneStatus.IN_PROGRESS
                && m.getStatus() != ProjectMilestone.MilestoneStatus.REVISION_REQUESTED) {
            throw new IllegalStateException("제출 가능한 상태가 아닙니다. (현재: " + m.getStatus() + ")");
        }

        m.setSubmittedAt(LocalDateTime.now());
        m.setSubmissionNote(req == null ? null : req.getNote());
        m.setSubmissionFileUrl(req == null ? null : req.getFileUrl());
        m.setStatus(ProjectMilestone.MilestoneStatus.SUBMITTED);
        milestoneRepository.save(m);

        // 알림 → 클라이언트 (프로젝트 소유자)
        Project p = projectRepository.findById(projectId).orElse(null);
        if (p != null && p.getUser() != null) {
            createNotification(p.getUser(),
                    Notification.NotificationType.MILESTONE_SUBMITTED,
                    "마일스톤 제출됨",
                    String.format("'%s' 마일스톤이 제출되었습니다. 검토해 주세요.", m.getTitle()),
                    "milestone", m.getId());
        }
        return MilestoneResponse.from(m);
    }

    @Transactional
    public MilestoneResponse approve(Long projectId, Long milestoneId) {
        ensureClient(projectId); ensureProjectActive(projectId);
        ProjectMilestone m = milestoneRepository.findByIdAndProjectId(milestoneId, projectId)
                .orElseThrow(() -> new IllegalArgumentException("마일스톤을 찾을 수 없습니다."));
        if (m.getStatus() != ProjectMilestone.MilestoneStatus.SUBMITTED) {
            throw new IllegalStateException("제출된 상태에서만 승인할 수 있습니다.");
        }
        m.setApprovedAt(LocalDateTime.now());
        m.setStatus(ProjectMilestone.MilestoneStatus.APPROVED);
        milestoneRepository.save(m);

        // 매칭된 에스크로 자동 정산
        escrowRepository.findByMilestoneId(milestoneId).ifPresent(e -> {
            if (e.getStatus() == ProjectEscrow.EscrowStatus.DEPOSITED) {
                e.setStatus(ProjectEscrow.EscrowStatus.RELEASED);
                e.setReleasedAt(LocalDateTime.now());
                escrowRepository.save(e);
            }
        });

        // 모든 마일스톤 APPROVED 면 프로젝트 COMPLETED
        long remain = milestoneRepository.countByProjectIdAndStatusNot(projectId,
                ProjectMilestone.MilestoneStatus.APPROVED);
        if (remain == 0) {
            Project p = projectRepository.findById(projectId).orElse(null);
            if (p != null) {
                p.setStatus(Project.ProjectStatus.COMPLETED);
                projectRepository.save(p);
            }
        }

        // 알림 → 파트너 (에스크로 payee)
        ProjectEscrow esc = escrowRepository.findByMilestoneId(milestoneId).orElse(null);
        if (esc != null) {
            userRepository.findById(esc.getPayeeUserId()).ifPresent(payee -> {
                createNotification(payee,
                        Notification.NotificationType.MILESTONE_APPROVED,
                        "마일스톤 승인됨",
                        String.format("'%s' 마일스톤이 승인되었습니다. 정산이 진행됩니다.", m.getTitle()),
                        "milestone", m.getId());
            });
        }
        return MilestoneResponse.from(m);
    }

    @Transactional
    public MilestoneResponse requestRevision(Long projectId, Long milestoneId, String reason) {
        ensureClient(projectId); ensureProjectActive(projectId);
        ProjectMilestone m = milestoneRepository.findByIdAndProjectId(milestoneId, projectId)
                .orElseThrow(() -> new IllegalArgumentException("마일스톤을 찾을 수 없습니다."));
        if (m.getStatus() != ProjectMilestone.MilestoneStatus.SUBMITTED) {
            throw new IllegalStateException("제출된 상태에서만 재요청할 수 있습니다.");
        }
        m.setStatus(ProjectMilestone.MilestoneStatus.REVISION_REQUESTED);
        m.setRevisionReason(reason);
        milestoneRepository.save(m);

        ProjectEscrow esc = escrowRepository.findByMilestoneId(milestoneId).orElse(null);
        if (esc != null) {
            userRepository.findById(esc.getPayeeUserId()).ifPresent(payee -> {
                createNotification(payee,
                        Notification.NotificationType.MILESTONE_REVISION_REQUESTED,
                        "수정 요청됨",
                        String.format("'%s' 마일스톤에 수정 요청이 접수되었습니다.%s",
                                m.getTitle(),
                                (reason == null || reason.isBlank() ? "" : " 사유: " + reason)),
                        "milestone", m.getId());
            });
        }
        return MilestoneResponse.from(m);
    }

    @Transactional
    public MilestoneResponse cancelRevision(Long projectId, Long milestoneId) {
        ensureClient(projectId); ensureProjectActive(projectId);
        ProjectMilestone m = milestoneRepository.findByIdAndProjectId(milestoneId, projectId)
                .orElseThrow(() -> new IllegalArgumentException("마일스톤을 찾을 수 없습니다."));
        if (m.getStatus() != ProjectMilestone.MilestoneStatus.REVISION_REQUESTED) {
            throw new IllegalStateException("수정 요청 상태에서만 철회할 수 있습니다.");
        }
        m.setStatus(ProjectMilestone.MilestoneStatus.SUBMITTED);
        m.setRevisionReason(null);
        milestoneRepository.save(m);
        return MilestoneResponse.from(m);
    }

    // ==================== Escrows ====================

    @Transactional(readOnly = true)
    public List<EscrowResponse> listEscrows(Long projectId) {
        ensureMember(projectId);
        return escrowRepository.findByProjectIdOrderByIdAsc(projectId)
                .stream().map(EscrowResponse::from).toList();
    }

    @Transactional
    public EscrowResponse createEscrow(Long projectId, Long milestoneId, Long amount, Long payeeUserId) {
        Long clientId = ensureClient(projectId); ensureProjectActive(projectId);
        if (amount == null || amount <= 0) throw new IllegalArgumentException("금액이 올바르지 않습니다.");
        // payeeUserId 가 안 들어오면 프로젝트의 IN_PROGRESS application 의 partnerUser 로 자동 해결.
        if (payeeUserId == null) payeeUserId = resolvePartnerUserId(projectId);
        if (payeeUserId == null) throw new IllegalArgumentException("파트너 정보가 필요합니다.");
        ProjectEscrow e = ProjectEscrow.builder()
                .projectId(projectId)
                .milestoneId(milestoneId)
                .amount(amount)
                .payerUserId(clientId)
                .payeeUserId(payeeUserId)
                .status(ProjectEscrow.EscrowStatus.PENDING)
                .build();
        return EscrowResponse.from(escrowRepository.save(e));
    }

    /** 프로젝트의 IN_PROGRESS / CONTRACTED / ACCEPTED 상태 application 에서 partner userId 추출. */
    private Long resolvePartnerUserId(Long projectId) {
        List<ProjectApplication> apps = applicationRepository.findAllByProjectId(projectId);
        if (apps == null || apps.isEmpty()) return null;
        // 우선순위: IN_PROGRESS > CONTRACTED > ACCEPTED 의 application 의 partner
        for (ProjectApplication.Status prefer : List.of(
                ProjectApplication.Status.IN_PROGRESS,
                ProjectApplication.Status.CONTRACTED,
                ProjectApplication.Status.ACCEPTED)) {
            for (ProjectApplication a : apps) {
                if (a.getStatus() == prefer && a.getPartnerUser() != null) {
                    return a.getPartnerUser().getId();
                }
            }
        }
        return null;
    }

    @Transactional
    public EscrowResponse payMock(Long projectId, Long escrowId, EscrowPayMockRequest req) {
        Long clientId = ensureClient(projectId); ensureProjectActive(projectId);
        ProjectEscrow e = escrowRepository.findById(escrowId)
                .orElseThrow(() -> new IllegalArgumentException("에스크로 결제 항목을 찾을 수 없습니다."));
        if (!Objects.equals(e.getProjectId(), projectId))
            throw new IllegalArgumentException("프로젝트가 일치하지 않습니다.");
        if (!Objects.equals(e.getPayerUserId(), clientId))
            throw new IllegalArgumentException("결제 권한이 없습니다.");
        if (e.getStatus() != ProjectEscrow.EscrowStatus.PENDING)
            throw new IllegalStateException("이미 처리된 결제입니다. (현재: " + e.getStatus() + ")");
        if (req == null || req.getPaymentMethodId() == null)
            throw new IllegalArgumentException("결제 수단을 선택해 주세요.");

        User payer = userRepository.findById(clientId).orElseThrow();
        PaymentMethod pm = paymentMethodRepository.findByIdAndUser(req.getPaymentMethodId(), payer)
                .orElseThrow(() -> new IllegalArgumentException("등록된 결제 수단이 아닙니다."));

        if (Boolean.TRUE.equals(req.getSimulateFail())) {
            throw new IllegalStateException("결제 승인 거절 (시뮬레이션)");
        }

        // Mock 처리: 약간의 딜레이를 두는 대신 즉시 처리
        e.setStatus(ProjectEscrow.EscrowStatus.DEPOSITED);
        e.setPaymentMethod("CARD_MOCK");
        e.setPaymentMethodId(pm.getId());
        e.setPaymentTxId("MOCK-" + UUID.randomUUID().toString().substring(0, 12).toUpperCase());
        e.setDepositedAt(LocalDateTime.now());
        escrowRepository.save(e);

        // 매칭 마일스톤 PENDING → IN_PROGRESS
        if (e.getMilestoneId() != null) {
            milestoneRepository.findById(e.getMilestoneId()).ifPresent(m -> {
                if (m.getStatus() == ProjectMilestone.MilestoneStatus.PENDING) {
                    m.setStatus(ProjectMilestone.MilestoneStatus.IN_PROGRESS);
                    milestoneRepository.save(m);
                }
            });
        }

        // 알림 → 파트너
        userRepository.findById(e.getPayeeUserId()).ifPresent(payee -> {
            createNotification(payee,
                    Notification.NotificationType.DEPOSIT_RECEIVED,
                    "에스크로 보관 완료",
                    String.format("₩%,d 가 에스크로에 안전하게 보관되었습니다. 작업을 진행해 주세요.", e.getAmount()),
                    "escrow", e.getId());
        });
        return EscrowResponse.from(e);
    }

    /**
     * 토스페이먼츠로 실제 결제 확정. 프론트가 SDK 결제창을 띄워서 받은
     * paymentKey/orderId/amount 를 그대로 전달받아 서버에서 시크릿 키로 confirm.
     * 성공하면 에스크로를 DEPOSITED 로 마킹하고 마일스톤도 IN_PROGRESS 로 전이.
     *
     * 참고: 토스 docs 테스트 시크릿 키(test_sk_docs_*)로 실제 결제 흐름을 검증할 수 있고
     * 실제 청구는 발생하지 않음. 운영용 라이브 키는 가맹 신청 후 환경변수로 주입.
     */
    @Transactional
    public EscrowResponse confirmPg(Long projectId, Long escrowId,
                                    String paymentKey, String orderId, long amount) {
        Long clientId = ensureClient(projectId); ensureProjectActive(projectId);
        ProjectEscrow e = escrowRepository.findById(escrowId)
                .orElseThrow(() -> new IllegalArgumentException("에스크로 결제 항목을 찾을 수 없습니다."));
        if (!Objects.equals(e.getProjectId(), projectId))
            throw new IllegalArgumentException("프로젝트가 일치하지 않습니다.");
        if (!Objects.equals(e.getPayerUserId(), clientId))
            throw new IllegalArgumentException("결제 권한이 없습니다.");
        if (e.getStatus() != ProjectEscrow.EscrowStatus.PENDING)
            throw new IllegalStateException("이미 처리된 결제입니다. (현재: " + e.getStatus() + ")");
        if (amount != e.getAmount())
            throw new IllegalArgumentException("금액 불일치 (escrow=" + e.getAmount() + ", req=" + amount + ")");

        // 토스 결제 승인 호출 (실패 시 RuntimeException 던져서 트랜잭션 롤백)
        var json = tossPaymentsService.confirm(paymentKey, orderId, amount);
        String method = json.path("method").asText("CARD");
        String tossStatus = json.path("status").asText("DONE");

        // paymentTxId 는 항상 저장 — 가상계좌 입금 완료 webhook 이 paymentKey 로 매칭함.
        e.setPaymentMethod("TOSS_" + method);
        e.setPaymentTxId(paymentKey);

        // 가상계좌(WAITING_FOR_DEPOSIT) 는 아직 입금 전. 카드/간편결제(DONE) 만 즉시 DEPOSITED.
        // 가상계좌 입금 완료 시 토스 webhook 이 status=DONE 으로 들어와 DEPOSITED 로 전환됨.
        boolean fullyPaid = "DONE".equalsIgnoreCase(tossStatus);
        if (fullyPaid) {
            e.setStatus(ProjectEscrow.EscrowStatus.DEPOSITED);
            e.setDepositedAt(LocalDateTime.now());
        }
        escrowRepository.save(e);

        // 마일스톤 전이/알림은 실입금 완료(DEPOSITED) 시점에만 — 가상계좌 미입금 단계에선 건너뜀.
        if (fullyPaid && e.getMilestoneId() != null) {
            milestoneRepository.findById(e.getMilestoneId()).ifPresent(m -> {
                if (m.getStatus() == ProjectMilestone.MilestoneStatus.PENDING) {
                    m.setStatus(ProjectMilestone.MilestoneStatus.IN_PROGRESS);
                    milestoneRepository.save(m);
                }
            });
        }
        if (fullyPaid) {
            userRepository.findById(e.getPayeeUserId()).ifPresent(payee -> {
                createNotification(payee,
                        Notification.NotificationType.DEPOSIT_RECEIVED,
                        "에스크로 보관 완료",
                        String.format("₩%,d 가 에스크로에 안전하게 보관되었습니다. 작업을 진행해 주세요.", e.getAmount()),
                        "escrow", e.getId());
            });
        }
        return EscrowResponse.from(e);
    }

    /**
     * 가상계좌 입금 완료 webhook 등 외부에서 에스크로를 PENDING → DEPOSITED 로 전이시킬 때
     * 호출. 마일스톤 전이 + 파트너 알림까지 일괄 처리하므로 webhook 코드가 부분 처리하지 않게.
     */
    @Transactional
    public void markDepositedFromExternal(Long escrowId) {
        ProjectEscrow e = escrowRepository.findById(escrowId).orElse(null);
        if (e == null) return;
        if (e.getStatus() != ProjectEscrow.EscrowStatus.PENDING) return;
        e.setStatus(ProjectEscrow.EscrowStatus.DEPOSITED);
        e.setDepositedAt(LocalDateTime.now());
        escrowRepository.save(e);
        if (e.getMilestoneId() != null) {
            milestoneRepository.findById(e.getMilestoneId()).ifPresent(m -> {
                if (m.getStatus() == ProjectMilestone.MilestoneStatus.PENDING) {
                    m.setStatus(ProjectMilestone.MilestoneStatus.IN_PROGRESS);
                    milestoneRepository.save(m);
                }
            });
        }
        userRepository.findById(e.getPayeeUserId()).ifPresent(payee ->
            createNotification(payee,
                    Notification.NotificationType.DEPOSIT_RECEIVED,
                    "에스크로 보관 완료",
                    String.format("₩%,d 가 에스크로에 안전하게 보관되었습니다. 작업을 진행해 주세요.", e.getAmount()),
                    "escrow", e.getId())
        );
    }

    // ==================== Attachments ====================

    @Transactional(readOnly = true)
    public List<AttachmentResponse> listAttachments(Long projectId) {
        ensureMember(projectId);
        List<ProjectAttachment> list = attachmentRepository.findByProjectIdOrderByCreatedAtDesc(projectId);
        // 업로더 이름 일괄 조회
        Map<Long, String> nameMap = new HashMap<>();
        list.stream().map(ProjectAttachment::getUploaderUserId).filter(Objects::nonNull).distinct()
                .forEach(uid -> userRepository.findById(uid)
                        .ifPresent(u -> nameMap.put(uid, u.getUsername())));
        return list.stream()
                .map(a -> AttachmentResponse.from(a, nameMap.get(a.getUploaderUserId())))
                .toList();
    }

    @Transactional
    public AttachmentResponse createAttachment(Long projectId, AttachmentCreateRequest req) {
        Long uid = ensureMember(projectId);
        if (req.getName() == null || req.getName().isBlank())
            throw new IllegalArgumentException("이름을 입력해 주세요.");
        if (req.getUrl() == null || req.getUrl().isBlank())
            throw new IllegalArgumentException("URL이 필요합니다.");
        ProjectAttachment.Kind kind = "LINK".equalsIgnoreCase(req.getKind())
                ? ProjectAttachment.Kind.LINK : ProjectAttachment.Kind.FILE;
        ProjectAttachment a = ProjectAttachment.builder()
                .projectId(projectId)
                .kind(kind)
                .name(req.getName())
                .url(req.getUrl())
                .mimeType(req.getMimeType())
                .sizeBytes(req.getSizeBytes())
                .notes(req.getNotes())
                .uploaderUserId(uid)
                .build();
        return AttachmentResponse.from(attachmentRepository.save(a));
    }

    /**
     * 실제 파일 업로드 후 attachment row 생성.
     * 컨트롤러에서 디스크에 파일 저장 후 호출. 권한 체크만 위임받는다.
     */
    @Transactional
    public AttachmentResponse createUploadedAttachment(Long projectId, String displayName,
                                                        String publicUrl, String mimeType,
                                                        Long sizeBytes, String notes) {
        Long uid = ensureMember(projectId);
        ProjectAttachment a = ProjectAttachment.builder()
                .projectId(projectId)
                .kind(ProjectAttachment.Kind.FILE)
                .name(displayName)
                .url(publicUrl)
                .mimeType(mimeType)
                .sizeBytes(sizeBytes)
                .notes(notes)
                .uploaderUserId(uid)
                .build();
        ProjectAttachment saved = attachmentRepository.save(a);
        String uploaderName = userRepository.findById(uid).map(u -> u.getUsername()).orElse(null);
        return AttachmentResponse.from(saved, uploaderName);
    }

    @Transactional
    public void deleteAttachment(Long projectId, Long attachmentId) {
        Long uid = ensureMember(projectId);
        ProjectAttachment a = attachmentRepository.findByIdAndProjectId(attachmentId, projectId)
                .orElseThrow(() -> new IllegalArgumentException("첨부를 찾을 수 없습니다."));
        if (!Objects.equals(a.getUploaderUserId(), uid)) {
            throw new IllegalArgumentException("본인이 등록한 첨부만 삭제할 수 있습니다.");
        }
        attachmentRepository.delete(a);
    }

    // ==================== Meeting ====================

    @Transactional(readOnly = true)
    public MeetingResponse getMeeting(Long projectId) {
        ensureMember(projectId);
        return meetingRepository.findByProjectId(projectId)
                .map(MeetingResponse::from)
                .orElse(null);
    }

    @Transactional
    public MeetingResponse upsertMeeting(Long projectId, MeetingUpsertRequest req) {
        ensureMember(projectId);
        ProjectMeeting m = meetingRepository.findByProjectId(projectId)
                .orElseGet(() -> ProjectMeeting.builder().projectId(projectId).build());
        m.setFrequencyLabel(req.getFrequencyLabel());
        m.setNextAt(req.getNextAt());
        m.setLocationLabel(req.getLocationLabel());
        m.setAgenda(req.getAgenda());
        return MeetingResponse.from(meetingRepository.save(m));
    }

    // ==================== Aggregate ====================

    @Transactional
    public Map<String, Object> dashboard(Long projectId) {
        ensureMember(projectId);
        // 7개 모듈 모두 협의완료인데 마일스톤이 비어있으면 lazy 시드 (멱등).
        try { milestoneSeedingService.seedIfNeeded(projectId); }
        catch (Exception e) { /* 시드 실패는 대시보드 조회 막지 않음 */ }
        Project p = projectRepository.findById(projectId)
                .orElseThrow(() -> new IllegalArgumentException("프로젝트를 찾을 수 없습니다."));

        Map<String, Object> result = new LinkedHashMap<>();
        Map<String, Object> projectInfo = new LinkedHashMap<>();
        projectInfo.put("id", p.getId());
        projectInfo.put("title", p.getTitle());
        projectInfo.put("status", p.getStatus() == null ? null : p.getStatus().name());
        projectInfo.put("description", p.getDesc());
        projectInfo.put("startDate", p.getStartDate());
        projectInfo.put("durationMonths", p.getDurationMonths());
        projectInfo.put("budgetAmount", p.getBudgetAmount());
        if (p.getUser() != null) {
            Map<String, Object> ownerInfo = new LinkedHashMap<>();
            ownerInfo.put("id", p.getUser().getId());
            ownerInfo.put("username", p.getUser().getUsername());
            projectInfo.put("owner", ownerInfo);
        }
        result.put("project", projectInfo);

        result.put("milestones", milestoneRepository.findByProjectIdOrderBySeqAsc(projectId)
                .stream().map(MilestoneResponse::from).toList());
        result.put("escrows", escrowRepository.findByProjectIdOrderByIdAsc(projectId)
                .stream().map(EscrowResponse::from).toList());
        result.put("attachments", attachmentRepository.findByProjectIdOrderByCreatedAtDesc(projectId)
                .stream().map(AttachmentResponse::from).toList());
        result.put("meeting", meetingRepository.findByProjectId(projectId)
                .map(MeetingResponse::from).orElse(null));
        return result;
    }

    // ==================== Helpers ====================

    /** 파트너 여부를 에스크로 또는 ProjectApplication(수락 이후) 기준으로 확인 */
    private boolean isPartnerOfProject(Long projectId, Long uid) {
        // 1) 에스크로 payee
        boolean byEscrow = escrowRepository.findByProjectIdOrderByIdAsc(projectId)
                .stream().anyMatch(e -> Objects.equals(e.getPayeeUserId(), uid));
        if (byEscrow) return true;
        // 2) ProjectApplication ACCEPTED / CONTRACTED / IN_PROGRESS / COMPLETED
        User u = userRepository.findById(uid).orElse(null);
        if (u == null) return false;
        return applicationRepository.findByProjectIdAndPartnerUser(projectId, u)
                .map(a -> {
                    var s = a.getStatus();
                    return s == ProjectApplication.Status.ACCEPTED
                        || s == ProjectApplication.Status.CONTRACTED
                        || s == ProjectApplication.Status.IN_PROGRESS
                        || s == ProjectApplication.Status.COMPLETED;
                }).orElse(false);
    }

    /** 프로젝트의 클라이언트(소유자) 또는 매칭된 파트너 여부 확인. 반환=요청자 user_id */
    private Long ensureMember(Long projectId) {
        Long uid = com.DevBridge.devbridge.global.security.AuthContext.requireUserId();
        Project p = projectRepository.findById(projectId)
                .orElseThrow(() -> new IllegalArgumentException("프로젝트를 찾을 수 없습니다."));
        Long ownerId = p.getUser() == null ? null : p.getUser().getId();
        if (Objects.equals(uid, ownerId)) return uid;
        if (isPartnerOfProject(projectId, uid)) return uid;
        throw new SecurityException("프로젝트 접근 권한이 없습니다.");
    }

    private Long ensureClient(Long projectId) {
        Long uid = com.DevBridge.devbridge.global.security.AuthContext.requireUserId();
        Project p = projectRepository.findById(projectId)
                .orElseThrow(() -> new IllegalArgumentException("프로젝트를 찾을 수 없습니다."));
        Long ownerId = p.getUser() == null ? null : p.getUser().getId();
        if (!Objects.equals(uid, ownerId)) {
            throw new SecurityException("클라이언트(프로젝트 소유자)만 가능합니다.");
        }
        return uid;
    }

    private Long ensurePartner(Long projectId) {
        Long uid = com.DevBridge.devbridge.global.security.AuthContext.requireUserId();
        if (!isPartnerOfProject(projectId, uid)) {
            throw new SecurityException("매칭된 파트너만 가능합니다.");
        }
        return uid;
    }

    /**
     * 프로젝트가 종료(COMPLETED) 상태가 아닌지 확인. 마일스톤 제출/승인/수정요청/철회 등
     * 모든 작업은 진행 중인 프로젝트에 대해서만 허용한다. (이미 정산 완료된 프로젝트의
     * 사후 변경을 차단해 마일스톤-에스크로 일관성 유지.)
     */
    private void ensureProjectActive(Long projectId) {
        Project p = projectRepository.findById(projectId)
                .orElseThrow(() -> new IllegalArgumentException("프로젝트를 찾을 수 없습니다."));
        Project.ProjectStatus s = p.getStatus();
        if (s == Project.ProjectStatus.COMPLETED) {
            throw new IllegalStateException("이미 완료된 프로젝트는 마일스톤을 더 이상 변경할 수 없습니다.");
        }
    }

    private void createNotification(User user, Notification.NotificationType type,
                                    String title, String message,
                                    String relatedType, Long relatedId) {
        Notification n = Notification.builder()
                .user(user)
                .notificationType(type)
                .title(title)
                .message(message)
                .relatedEntityType(relatedType)
                .relatedEntityId(relatedId)
                .isRead(false)
                .build();
        notificationRepository.save(n);
    }
}
