package com.DevBridge.devbridge.domain.project.entity;

import jakarta.persistence.*;
import lombok.*;

/**
 * 프로젝트 분야 마스터 (예: parent_category="IT 구축", field_name="웹사이트")
 * ERD v2: project_field_master
 */
@Entity
@Table(name = "PROJECT_FIELD_MASTER")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class ProjectFieldMaster {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Integer id;

    @Column(name = "parent_category", nullable = false, length = 100)
    private String parentCategory;

    @Column(name = "field_name", nullable = false, length = 100)
    private String fieldName;
}

