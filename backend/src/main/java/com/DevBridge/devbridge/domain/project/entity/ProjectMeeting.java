package com.DevBridge.devbridge.domain.project.entity;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.UpdateTimestamp;
import org.springframework.data.annotation.CreatedDate;
import org.springframework.data.jpa.domain.support.AuditingEntityListener;

import java.time.LocalDateTime;

/**
 * 진행 프로젝트의 정기 미팅 정보 (프로젝트당 1건, UNIQUE project_id).
 */
@Entity
@Table(
    name = "PROJECT_MEETINGS",
    uniqueConstraints = @UniqueConstraint(columnNames = {"project_id"})
)
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
@EntityListeners(AuditingEntityListener.class)
public class ProjectMeeting {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "project_id", nullable = false)
    private Long projectId;

    /** "정기: 주 1회" 같은 표시용 라벨 */
    @Column(name = "frequency_label", length = 50)
    private String frequencyLabel;

    @Column(name = "next_at")
    private LocalDateTime nextAt;

    @Column(name = "location_label", length = 100)
    private String locationLabel;

    @Column(columnDefinition = "TEXT")
    private String agenda;

    @CreatedDate
    @Column(name = "created_at", updatable = false)
    private LocalDateTime createdAt;

    @UpdateTimestamp
    @Column(name = "updated_at")
    private LocalDateTime updatedAt;
}
