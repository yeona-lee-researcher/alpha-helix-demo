package com.DevBridge.devbridge.domain.project.entity;

import jakarta.persistence.*;
import lombok.*;

@Entity
@Table(name = "SKILL_MASTER")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class SkillMaster {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, unique = true, length = 100)
    private String name;
}
