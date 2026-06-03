package com.DevBridge.devbridge.domain.strategy.service.broker;

import com.DevBridge.devbridge.domain.strategy.entity.OrderProposal;
import com.DevBridge.devbridge.domain.strategy.repository.OrderProposalRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.LocalDateTime;
import java.util.List;

/**
 * B1: EXECUTED 주문의 실제 체결 상태를 주기적으로 폴링해 fill_status 갱신.
 * 3분마다, 최근 36시간 내 실행 + 체결 미확정 건만 (KIS rate limit 부담 최소화).
 */
@Component
@RequiredArgsConstructor
@Slf4j
public class OrderFillPollingJob {

    private final OrderProposalRepository repo;
    private final OrderFillService fillService;

    @Scheduled(fixedDelay = 3 * 60 * 1000L, initialDelay = 90 * 1000L)
    public void pollFills() {
        List<OrderProposal> candidates = repo.findFillCheckCandidates(LocalDateTime.now().minusHours(36));
        if (candidates.isEmpty()) return;
        int ok = 0;
        for (OrderProposal p : candidates) {
            try {
                fillService.pollFill(p);
                ok++;
            } catch (Exception e) {
                log.debug("[OrderFillPollingJob] poll 실패 id={}: {}", p.getId(), e.getMessage());
            }
        }
        log.info("[OrderFillPollingJob] 체결 폴링 {}/{}건", ok, candidates.size());
    }
}
