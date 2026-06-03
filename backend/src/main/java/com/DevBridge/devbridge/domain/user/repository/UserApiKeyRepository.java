package com.DevBridge.devbridge.domain.user.repository;

import com.DevBridge.devbridge.domain.user.entity.UserApiKey;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface UserApiKeyRepository extends JpaRepository<UserApiKey, Long> {

    Optional<UserApiKey> findByUserIdAndProvider(Long userId, String provider);

    List<UserApiKey> findByUserId(Long userId);

    void deleteByUserIdAndProvider(Long userId, String provider);
}
