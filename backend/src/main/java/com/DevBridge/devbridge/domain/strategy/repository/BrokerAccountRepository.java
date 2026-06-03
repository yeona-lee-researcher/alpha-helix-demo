package com.DevBridge.devbridge.domain.strategy.repository;

import com.DevBridge.devbridge.domain.strategy.entity.BrokerAccount;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface BrokerAccountRepository extends JpaRepository<BrokerAccount, Long> {
    Optional<BrokerAccount> findByUserIdAndEnv(Long userId, BrokerAccount.Env env);
    Optional<BrokerAccount> findByUserIdAndBrokerTypeAndEnv(Long userId, BrokerAccount.BrokerType brokerType, BrokerAccount.Env env);
    Optional<BrokerAccount> findByIdAndUserId(Long id, Long userId);
    List<BrokerAccount> findAllByUserIdOrderByEnvAsc(Long userId);
    boolean existsByUserIdAndEnv(Long userId, BrokerAccount.Env env);
    boolean existsByUserIdAndBrokerTypeAndEnv(Long userId, BrokerAccount.BrokerType brokerType, BrokerAccount.Env env);
}
