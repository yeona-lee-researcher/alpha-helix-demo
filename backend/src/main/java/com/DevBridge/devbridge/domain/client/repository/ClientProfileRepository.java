package com.DevBridge.devbridge.domain.client.repository;

import com.DevBridge.devbridge.domain.client.entity.ClientProfile;
import com.DevBridge.devbridge.domain.user.entity.User;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import java.util.List;
import java.util.Optional;

public interface ClientProfileRepository extends JpaRepository<ClientProfile, Long> {
    Optional<ClientProfile> findByUser(User user);

    @Query("SELECT c FROM ClientProfile c LEFT JOIN FETCH c.user")
    List<ClientProfile> findAllWithUser();

    /** SQL-level pagination */
    @Query("SELECT c FROM ClientProfile c LEFT JOIN FETCH c.user")
    List<ClientProfile> findAllWithUserPaged(Pageable pageable);
}
