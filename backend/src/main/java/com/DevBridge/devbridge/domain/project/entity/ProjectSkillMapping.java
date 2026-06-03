package com.DevBridge.devbridge.domain.project.entity;

import com.DevBridge.devbridge.domain.project.entity.Project;
import com.DevBridge.devbridge.domain.project.entity.SkillMaster;
import jakarta.persistence.*;
import lombok.*;

@Entity
@Table(name = "PROJECT_SKILL_MAPPING",
       uniqueConstraints = {@UniqueConstraint(name = "uk_project_skill", columnNames = {"project_id", "skill_id"})})
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class ProjectSkillMapping {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "project_id", nullable = false)
    private Project project;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "skill_id", nullable = false)
    private SkillMaster skill;

    /** true=필수, false=우대 */
    @Column(name = "is_required", nullable = false)
    @Builder.Default
    private Boolean isRequired = true;
}

