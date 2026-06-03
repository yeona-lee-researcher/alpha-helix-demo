package com.DevBridge.devbridge.domain.project.service;

import com.DevBridge.devbridge.domain.project.dto.ProjectApplicationCreateRequest;
import com.DevBridge.devbridge.domain.project.dto.ProjectApplicationResponse;
import com.DevBridge.devbridge.domain.project.entity.Project;
import com.DevBridge.devbridge.domain.project.entity.ProjectApplication;
import com.DevBridge.devbridge.domain.user.entity.User;
import com.DevBridge.devbridge.domain.project.repository.ProjectApplicationRepository;
import com.DevBridge.devbridge.domain.project.repository.ProjectRepository;
import com.DevBridge.devbridge.domain.project.repository.ProjectSkillMappingRepository;
import com.DevBridge.devbridge.domain.user.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Service
@RequiredArgsConstructor
public class ProjectApplicationService {

    private final ProjectApplicationRepository applicationRepository;
    private final ProjectRepository projectRepository;
    private final UserRepository userRepository;
    private final ProjectSkillMappingRepository projectSkillMappingRepository;

    /** 파트너가 프로젝트에 지원. */
    @Transactional
    public ProjectApplicationResponse apply(Long partnerUserId, ProjectApplicationCreateRequest req) {
        User partner = userRepository.findById(partnerUserId)
                .orElseThrow(() -> new RuntimeException("사용자를 찾을 수 없습니다."));
        Project project = projectRepository.findById(req.getProjectId())
                .orElseThrow(() -> new RuntimeException("프로젝트를 찾을 수 없습니다."));

        if (project.getUser() != null && project.getUser().getId().equals(partnerUserId)) {
            throw new RuntimeException("본인 프로젝트에는 지원할 수 없습니다.");
        }
        applicationRepository.findByProjectIdAndPartnerUser(project.getId(), partner)
                .ifPresent(a -> { throw new RuntimeException("이미 지원한 프로젝트입니다."); });

        ProjectApplication app = applicationRepository.save(ProjectApplication.builder()
                .project(project)
                .partnerUser(partner)
                .status(ProjectApplication.Status.APPLIED)
                .message(req.getMessage())
                .build());
        return toResponse(app);
    }

    /** 파트너 자신의 지원 목록. */
    @Transactional(readOnly = true)
    public List<ProjectApplicationResponse> findMyApplications(Long partnerUserId) {
        User partner = userRepository.findById(partnerUserId)
                .orElseThrow(() -> new RuntimeException("사용자를 찾을 수 없습니다."));
        return applicationRepository.findAllByPartnerUser(partner).stream()
                .map(this::toResponse)
                .toList();
    }

    /** 클라이언트(=프로젝트 작성자) 자신이 받은 모든 프로젝트의 지원자 목록. */
    @Transactional(readOnly = true)
    public List<ProjectApplicationResponse> findReceivedApplications(Long ownerUserId) {
        User owner = userRepository.findById(ownerUserId)
                .orElseThrow(() -> new RuntimeException("사용자를 찾을 수 없습니다."));
        return applicationRepository.findAllByProjectOwner(owner).stream()
                .map(this::toResponse)
                .toList();
    }

    /** 특정 프로젝트의 지원자. (프로젝트 owner만 호출 허용) */
    @Transactional(readOnly = true)
    public List<ProjectApplicationResponse> findByProject(Long ownerUserId, Long projectId) {
        Project project = projectRepository.findById(projectId)
                .orElseThrow(() -> new RuntimeException("프로젝트를 찾을 수 없습니다."));
        if (project.getUser() == null || !project.getUser().getId().equals(ownerUserId)) {
            throw new RuntimeException("프로젝트 작성자만 조회할 수 있습니다.");
        }
        return applicationRepository.findAllByProjectId(projectId).stream()
                .map(this::toResponse)
                .toList();
    }

    /** 상태 변경 (수락/거절/계약/완료/철회). */
    @Transactional
    public ProjectApplicationResponse updateStatus(Long actorUserId, Long applicationId, String newStatus) {
        ProjectApplication app = applicationRepository.findById(applicationId)
                .orElseThrow(() -> new RuntimeException("지원 내역을 찾을 수 없습니다."));

        ProjectApplication.Status target;
        try {
            target = ProjectApplication.Status.valueOf(newStatus.toUpperCase());
        } catch (IllegalArgumentException e) {
            throw new RuntimeException("알 수 없는 상태값입니다: " + newStatus);
        }

        boolean isOwner = app.getProject().getUser() != null
                && app.getProject().getUser().getId().equals(actorUserId);
        boolean isPartner = app.getPartnerUser().getId().equals(actorUserId);

        switch (target) {
            case ACCEPTED, REJECTED, CONTRACTED, IN_PROGRESS -> {
                if (!isOwner) throw new RuntimeException("프로젝트 작성자만 가능합니다.");
            }
            case WITHDRAWN -> {
                if (!isPartner) throw new RuntimeException("지원 본인만 철회할 수 있습니다.");
            }
            case COMPLETED -> {
                if (!isOwner && !isPartner) throw new RuntimeException("권한이 없습니다.");
            }
            case APPLIED -> throw new RuntimeException("APPLIED 상태로 되돌릴 수 없습니다.");
        }
        app.setStatus(target);
        return toResponse(applicationRepository.save(app));
    }

    /**
     * 작성자(client)가 진행 프로젝트 미팅 시작 시 호출.
     * 해당 (projectId, partnerUserId) 조합의 application 이 없으면 IN_PROGRESS 로 자동 생성하고,
     * 있으면 IN_PROGRESS 로 status 를 update 한다. 이미 IN_PROGRESS/CONTRACTED 면 no-op.
     */
    @Transactional
    public ProjectApplicationResponse ensureActive(Long ownerUserId, Long projectId, Long partnerUserId) {
        Project project = projectRepository.findById(projectId)
                .orElseThrow(() -> new RuntimeException("프로젝트를 찾을 수 없습니다."));
        if (project.getUser() == null || !project.getUser().getId().equals(ownerUserId)) {
            throw new RuntimeException("프로젝트 작성자만 호출할 수 있습니다.");
        }
        User partner = userRepository.findById(partnerUserId)
                .orElseThrow(() -> new RuntimeException("파트너 사용자를 찾을 수 없습니다."));
        if (partner.getId().equals(ownerUserId)) {
            throw new RuntimeException("본인 프로젝트에는 자기 자신을 파트너로 추가할 수 없습니다.");
        }

        ProjectApplication app = applicationRepository.findByProjectIdAndPartnerUser(projectId, partner)
                .orElseGet(() -> applicationRepository.save(ProjectApplication.builder()
                        .project(project)
                        .partnerUser(partner)
                        .status(ProjectApplication.Status.IN_PROGRESS)
                        .message("[자동 생성] 진행 프로젝트 미팅 시작")
                        .build()));
        if (app.getStatus() != ProjectApplication.Status.IN_PROGRESS
                && app.getStatus() != ProjectApplication.Status.CONTRACTED
                && app.getStatus() != ProjectApplication.Status.COMPLETED) {
            app.setStatus(ProjectApplication.Status.IN_PROGRESS);
            app = applicationRepository.save(app);
        }
        return toResponse(app);
    }

    /**
     * 모집 완료(close-recruiting) — 한 트랜잭션에서:
     * ① project.status = CLOSED
     * ② 선택된 application(acceptedApplicationId)은 ACCEPTED 유지
     * ③ 같은 프로젝트의 다른 APPLIED/ACCEPTED application 들은 모두 REJECTED
     * 권한: 프로젝트 작성자만.
     */
    @Transactional
    public ProjectApplicationResponse closeRecruiting(Long ownerUserId, Long projectId, Long acceptedApplicationId) {
        Project project = projectRepository.findById(projectId)
                .orElseThrow(() -> new RuntimeException("프로젝트를 찾을 수 없습니다."));
        if (project.getUser() == null || !project.getUser().getId().equals(ownerUserId)) {
            throw new RuntimeException("프로젝트 작성자만 모집 완료할 수 있습니다.");
        }

        ProjectApplication accepted = applicationRepository.findById(acceptedApplicationId)
                .orElseThrow(() -> new RuntimeException("선택된 지원 내역을 찾을 수 없습니다."));
        if (accepted.getProject() == null || !accepted.getProject().getId().equals(projectId)) {
            throw new RuntimeException("선택된 지원 내역이 해당 프로젝트에 속하지 않습니다.");
        }

        // 선택된 application 은 ACCEPTED 로 보장
        if (accepted.getStatus() != ProjectApplication.Status.ACCEPTED) {
            accepted.setStatus(ProjectApplication.Status.ACCEPTED);
            applicationRepository.save(accepted);
        }

        // 같은 프로젝트의 나머지 APPLIED/ACCEPTED 는 REJECTED
        List<ProjectApplication> others = applicationRepository.findAllByProjectId(projectId);
        for (ProjectApplication a : others) {
            if (a.getId().equals(accepted.getId())) continue;
            ProjectApplication.Status s = a.getStatus();
            if (s == ProjectApplication.Status.APPLIED || s == ProjectApplication.Status.ACCEPTED) {
                a.setStatus(ProjectApplication.Status.REJECTED);
                applicationRepository.save(a);
            }
        }

        // 프로젝트 모집 마감
        project.setStatus(Project.ProjectStatus.CLOSED);
        projectRepository.save(project);

        return toResponse(accepted);
    }

    private ProjectApplicationResponse toResponse(ProjectApplication a) {
        Project p = a.getProject();
        User partner = a.getPartnerUser();

        java.util.List<String> skills = java.util.Collections.emptyList();
        if (p != null) {
            skills = projectSkillMappingRepository.findByProject(p).stream()
                    .map(m -> m.getSkill() != null ? m.getSkill().getName() : null)
                    .filter(java.util.Objects::nonNull)
                    .toList();
        }

        return ProjectApplicationResponse.builder()
                .id(a.getId())
                .projectId(p != null ? p.getId() : null)
                .projectTitle(p != null ? p.getTitle() : null)
                .projectDesc(p != null ? p.getDesc() : null)
                .projectSlogan(p != null ? p.getSlogan() : null)
                .projectServiceField(p != null ? p.getServiceField() : null)
                .projectSkills(skills)
                .projectStartDate(p != null ? p.getStartDate() : null)
                .projectDeadline(p != null ? p.getDeadline() : null)
                .projectDurationMonths(p != null ? p.getDurationMonths() : null)
                .projectBudgetMin(p != null ? p.getBudgetMin() : null)
                .projectBudgetMax(p != null ? p.getBudgetMax() : null)
                .projectStatus(p != null && p.getStatus() != null ? p.getStatus().name() : null)
                .projectOwnerUserId(p != null && p.getUser() != null ? p.getUser().getId() : null)
                .projectOwnerUsername(p != null && p.getUser() != null ? p.getUser().getUsername() : null)
                .partnerUserId(partner != null ? partner.getId() : null)
                .partnerUsername(partner != null ? partner.getUsername() : null)
                .partnerProfileId(null)
                .status(a.getStatus().name())
                .message(a.getMessage())
                .appliedAt(a.getAppliedAt())
                .updatedAt(a.getUpdatedAt())
                .build();
    }
}
