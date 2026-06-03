package com.DevBridge.devbridge.domain.client.entity;

import com.DevBridge.devbridge.domain.client.entity.ClientProfile;
import jakarta.persistence.*;
import lombok.*;

@Entity
@Table(name = "CLIENT_PROFILE_STATS")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class ClientProfileStats {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @OneToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "client_profile_id", nullable = false, unique = true)
    private ClientProfile clientProfile;

    @Column(name = "completed_projects")
    private Integer completedProjects;

    @Column(name = "posted_projects")
    private Integer postedProjects;

    private Double rating;

    @Column(name = "repeat_rate")
    private Integer repeatRate;
}

