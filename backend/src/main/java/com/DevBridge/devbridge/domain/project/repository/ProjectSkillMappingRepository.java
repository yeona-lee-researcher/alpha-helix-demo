package com.DevBridge.devbridge.domain.project.repository;

import com.DevBridge.devbridge.domain.project.entity.Project;
import com.DevBridge.devbridge.domain.project.entity.ProjectSkillMapping;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;

public interface ProjectSkillMappingRepository extends JpaRepository<ProjectSkillMapping, Long> {
    List<ProjectSkillMapping> findByProject(Project project);

    @Query("SELECT m FROM ProjectSkillMapping m JOIN FETCH m.skill WHERE m.project IN :projects")
    List<ProjectSkillMapping> findAllByProjects(@Param("projects") List<Project> projects);
}
