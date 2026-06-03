package com.DevBridge.devbridge.domain.project.repository;

import com.DevBridge.devbridge.domain.project.entity.Project;
import com.DevBridge.devbridge.domain.project.entity.ProjectApplication;
import com.DevBridge.devbridge.domain.user.entity.User;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

public interface ProjectApplicationRepository extends JpaRepository<ProjectApplication, Long> {

    @Query("SELECT a FROM ProjectApplication a " +
           "LEFT JOIN FETCH a.project p " +
           "LEFT JOIN FETCH p.user " +
           "WHERE a.partnerUser = :user " +
           "ORDER BY a.appliedAt DESC")
    List<ProjectApplication> findAllByPartnerUser(@Param("user") User user);

    @Query("SELECT a FROM ProjectApplication a " +
           "LEFT JOIN FETCH a.partnerUser " +
           "WHERE a.project.id = :projectId " +
           "ORDER BY a.appliedAt DESC")
    List<ProjectApplication> findAllByProjectId(@Param("projectId") Long projectId);

    @Query("SELECT a FROM ProjectApplication a " +
           "LEFT JOIN FETCH a.partnerUser " +
           "LEFT JOIN FETCH a.project p " +
           "WHERE p.user = :owner " +
           "ORDER BY a.appliedAt DESC")
    List<ProjectApplication> findAllByProjectOwner(@Param("owner") User owner);

    Optional<ProjectApplication> findByProjectIdAndPartnerUser(Long projectId, User partnerUser);

    /** EvaluationService (파트너 시점): 특정 파트너가 매칭된 완료 프로젝트 목록 */
    @Query("SELECT a FROM ProjectApplication a " +
           "LEFT JOIN FETCH a.project p " +
           "LEFT JOIN FETCH p.user " +
           "WHERE a.partnerUser = :user AND p.status = :status")
    List<ProjectApplication> findByPartnerUserAndProjectStatus(
            @Param("user") User user,
            @Param("status") Project.ProjectStatus status);
}
