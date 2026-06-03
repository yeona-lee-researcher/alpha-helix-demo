package com.DevBridge.devbridge.domain.strategy.service.broker;

import com.DevBridge.devbridge.domain.strategy.entity.OrderProposal;
import com.DevBridge.devbridge.domain.strategy.repository.OrderProposalRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;

/**
 * PENDING 상태인데 expires_at 지난 OrderProposal을 EXPIRED로 자동 전환.
 * 5분마다 실행. 운영부하가 크지 않음(전체 PENDING만 스캔, 인덱스 idx_op_expires 활용).
 */
@Component
@RequiredArgsConstructor
@Slf4j
public class OrderProposalExpiryJob {

    private final OrderProposalRepository repo;

    @Scheduled(fixedDelay = 5 * 60 * 1000L, initialDelay = 60 * 1000L)
    @Transactional
    public void expireOldProposals() {
        List<OrderProposal> expired = repo.findByStatusAndExpiresAtBefore("PENDING", LocalDateTime.now());
        if (expired.isEmpty()) return;
        for (OrderProposal p : expired) {
            p.setStatus("EXPIRED");
            p.setDecidedAt(LocalDateTime.now());
        }
        repo.saveAll(expired);
        log.info("[OrderProposalExpiryJob] {} proposals expired", expired.size());
    }
}
