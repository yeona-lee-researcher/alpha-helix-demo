package com.DevBridge.devbridge.domain.project.service;

import com.DevBridge.devbridge.domain.project.dto.ProjectModuleResponse;
import com.DevBridge.devbridge.domain.project.dto.ProjectModuleUpsertRequest;
import com.DevBridge.devbridge.domain.project.entity.ProjectModule;
import com.DevBridge.devbridge.domain.user.entity.User;
import com.DevBridge.devbridge.domain.project.repository.ProjectModuleRepository;
import com.DevBridge.devbridge.domain.user.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Service
@RequiredArgsConstructor
public class ProjectModuleService {

    private final ProjectModuleRepository projectModuleRepository;
    private final UserRepository userRepository;

    /** 7가지 키 (FE/BE 합의된 순서) */
    public static final List<String> MODULE_KEYS = List.of(
            "scope", "deliverable", "schedule", "payment", "revision", "completion", "terms"
    );

    @Transactional(readOnly = true)
    public List<ProjectModuleResponse> list(Long projectId) {
        return projectModuleRepository.findByProjectId(projectId).stream()
                .map(ProjectModuleResponse::from)
                .toList();
    }

    @Transactional
    public ProjectModuleResponse upsert(Long projectId, String moduleKey, ProjectModuleUpsertRequest req, Long userId) {
        if (!MODULE_KEYS.contains(moduleKey)) {
            throw new IllegalArgumentException("알 수 없는 모듈 키: " + moduleKey);
        }
        ProjectModule pm = projectModuleRepository.findByProjectIdAndModuleKey(projectId, moduleKey)
                .orElseGet(() -> ProjectModule.builder()
                        .projectId(projectId)
                        .moduleKey(moduleKey)
                        .status("미확정")
                        .build());
        if (req.getStatus() != null && !req.getStatus().isBlank()) {
            pm.setStatus(req.getStatus());
        }
        if (req.getData() != null) {
            pm.setData(req.getData());
        }
        if (userId != null) {
            pm.setLastModifierId(userId);
            userRepository.findById(userId).ifPresent(u -> pm.setLastModifierName(u.getUsername()));
        }
        return ProjectModuleResponse.from(projectModuleRepository.save(pm));
    }
}
