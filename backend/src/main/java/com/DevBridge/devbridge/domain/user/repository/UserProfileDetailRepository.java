package com.DevBridge.devbridge.domain.user.repository;

import com.DevBridge.devbridge.domain.user.entity.User;
import com.DevBridge.devbridge.domain.user.entity.UserProfileDetail;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Collection;
import java.util.List;
import java.util.Optional;

public interface UserProfileDetailRepository extends JpaRepository<UserProfileDetail, Long> {
    Optional<UserProfileDetail> findByUser(User user);
    Optional<UserProfileDetail> findByUserId(Long userId);

    @Query("SELECT d FROM UserProfileDetail d WHERE d.user.id IN :userIds")
    List<UserProfileDetail> findAllByUserIdIn(@Param("userIds") Collection<Long> userIds);
}
