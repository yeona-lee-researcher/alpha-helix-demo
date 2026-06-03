package com.DevBridge.devbridge.domain.payment.repository;

import com.DevBridge.devbridge.domain.payment.entity.PaymentMethod;
import com.DevBridge.devbridge.domain.user.entity.User;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

public interface PaymentMethodRepository extends JpaRepository<PaymentMethod, Long> {

    List<PaymentMethod> findByUserOrderByIsDefaultDescCreatedAtDesc(User user);

    Optional<PaymentMethod> findByIdAndUser(Long id, User user);

    Optional<PaymentMethod> findByUserAndIsDefaultTrue(User user);

    long countByUser(User user);

    @Modifying
    @Query("UPDATE PaymentMethod pm SET pm.isDefault = false WHERE pm.user = :user AND pm.id <> :exceptId")
    void clearOtherDefaults(@Param("user") User user, @Param("exceptId") Long exceptId);
}
