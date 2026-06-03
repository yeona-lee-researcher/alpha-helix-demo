package com.DevBridge.devbridge.domain.client.entity;

import com.DevBridge.devbridge.domain.client.entity.ClientProfile;
import com.DevBridge.devbridge.domain.project.entity.SkillMaster;
import jakarta.persistence.*;
import lombok.*;

@Entity
@Table(name = "CLIENT_PREFERRED_SKILL",
       uniqueConstraints = {@UniqueConstraint(name = "uk_client_pref_skill", columnNames = {"client_profile_id", "skill_id"})})
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class ClientPreferredSkill {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "client_profile_id", nullable = false)
    private ClientProfile clientProfile;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "skill_id", nullable = false)
    private SkillMaster skill;
}

