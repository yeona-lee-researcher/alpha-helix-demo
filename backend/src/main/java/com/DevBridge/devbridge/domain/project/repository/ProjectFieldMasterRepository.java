package com.DevBridge.devbridge.domain.project.repository;

import com.DevBridge.devbridge.domain.project.entity.ProjectFieldMaster;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface ProjectFieldMasterRepository extends JpaRepository<ProjectFieldMaster, Integer> {
    List<ProjectFieldMaster> findByParentCategory(String parentCategory);
}

