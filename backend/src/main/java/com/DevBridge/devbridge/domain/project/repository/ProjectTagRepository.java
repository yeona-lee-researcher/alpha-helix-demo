package com.DevBridge.devbridge.domain.project.repository;

import com.DevBridge.devbridge.domain.project.entity.Project;
import com.DevBridge.devbridge.domain.project.entity.ProjectTag;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;

public interface ProjectTagRepository extends JpaRepository<ProjectTag, Long> {
    List<ProjectTag> findByProject(Project project);

    @Query("SELECT pt FROM ProjectTag pt WHERE pt.project IN :projects")
    List<ProjectTag> findAllByProjects(@Param("projects") List<Project> projects);
}
