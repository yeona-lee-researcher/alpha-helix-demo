package com.DevBridge.devbridge.domain.project.repository;

import com.DevBridge.devbridge.domain.project.entity.ProjectAttachment;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface ProjectAttachmentRepository extends JpaRepository<ProjectAttachment, Long> {

    List<ProjectAttachment> findByProjectIdOrderByCreatedAtDesc(Long projectId);

    Optional<ProjectAttachment> findByIdAndProjectId(Long id, Long projectId);
}
