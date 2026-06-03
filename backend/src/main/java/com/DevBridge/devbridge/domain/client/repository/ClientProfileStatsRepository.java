package com.DevBridge.devbridge.domain.client.repository;

import com.DevBridge.devbridge.domain.client.entity.ClientProfile;
import com.DevBridge.devbridge.domain.client.entity.ClientProfileStats;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

public interface ClientProfileStatsRepository extends JpaRepository<ClientProfileStats, Long> {
    Optional<ClientProfileStats> findByClientProfile(ClientProfile clientProfile);

    @Query("SELECT s FROM ClientProfileStats s WHERE s.clientProfile IN :profiles")
    List<ClientProfileStats> findAllByClientProfiles(@Param("profiles") List<ClientProfile> profiles);
}
