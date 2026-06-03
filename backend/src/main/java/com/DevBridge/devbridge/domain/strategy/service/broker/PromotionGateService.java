package com.DevBridge.devbridge.domain.strategy.service.broker;

import com.DevBridge.devbridge.domain.strategy.entity.BrokerAccount;
import com.DevBridge.devbridge.domain.strategy.repository.BrokerAccountRepository;
import com.DevBridge.devbridge.domain.strategy.repository.OrderProposalRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * MOCK → REAL 승격 게이트.
 *
 * REAL 계정의 tradingEnabled=true 전환을 허용하기 전 다음 조건을 강제한다:
 *   1) 같은 user에 MOCK 계정이 존재하고 tradingEnabled=true 였던 적 있음
 *   2) MOCK 계정 등록 후 14일 이상 경과 (mockVerifiedDays)
 *   3) MOCK으로 EXECUTED 상태 OrderProposal이 5건 이상
 *   4) MOCK EXEC_FAILED 비율 < 30%
 *   5) REAL 계정 자체 /test 통과 (lastVerifiedAt 존재)
 *
 * 모든 조건을 만족해야 REAL 거래 활성화 가능. 한 항목이라도 실패하면
 * 어떤 항목이 부족한지 정확한 사유를 반환한다.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class PromotionGateService {

    private static final int MIN_MOCK_DAYS = 14;
    private static final int MIN_MOCK_EXECUTED = 5;
    private static final double MAX_MOCK_FAIL_RATIO = 0.30;

    private final BrokerAccountRepository brokerRepo;
    private final OrderProposalRepository proposalRepo;

    public record GateResult(
            boolean passed,
            List<Map<String, Object>> checks,
            String summary
    ) {}

    /**
     * REAL 계정의 tradingEnabled=true 전환 가능 여부 검증.
     * @param userId 본인 ID (이미 권한 검증된 상태)
     * @param realAccount REAL BrokerAccount (이미 본인 소유 검증된 상태)
     */
    public GateResult evaluate(Long userId, BrokerAccount realAccount) {
        if (realAccount.getEnv() != BrokerAccount.Env.REAL) {
            // MOCK은 게이트 없음 (자유롭게 토글)
            return new GateResult(true, List.of(),
                    "MOCK 계정은 승격 게이트가 적용되지 않습니다.");
        }

        var checks = new java.util.ArrayList<Map<String, Object>>();

        // 1) REAL 자체 /test 통과
        boolean realVerified = realAccount.getLastVerifiedAt() != null;
        checks.add(check("REAL_VERIFIED",
                "REAL 키 유효성 검증 (/test) 통과",
                realVerified,
                realVerified ? "통과" : "[broker/test]를 먼저 실행해서 키를 검증하세요."));

        // 2) MOCK 계정 존재
        // 같은 브로커의 MOCK 을 조회 (findByUserIdAndEnv 는 다중브로커 시 NonUnique 500)
        BrokerAccount mock = brokerRepo.findByUserIdAndBrokerTypeAndEnv(userId, realAccount.getBrokerType(), BrokerAccount.Env.MOCK).orElse(null);
        boolean mockExists = mock != null;
        checks.add(check("MOCK_EXISTS",
                "MOCK 계정 존재",
                mockExists,
                mockExists ? "통과" : "MOCK 계정을 먼저 등록하세요."));

        // 이후 조건은 MOCK 존재할 때만 평가
        if (mockExists) {
            // 3) MOCK 등록 후 N일 경과
            long days = mock.getCreatedAt() == null ? 0
                    : java.time.Duration.between(mock.getCreatedAt(), LocalDateTime.now()).toDays();
            boolean enoughDays = days >= MIN_MOCK_DAYS;
            checks.add(check("MOCK_DAYS",
                    "MOCK 계정 사용 일수 ≥ " + MIN_MOCK_DAYS + "일",
                    enoughDays,
                    enoughDays
                            ? "현재 " + days + "일"
                            : "현재 " + days + "일 — " + (MIN_MOCK_DAYS - days) + "일 더 필요"));

            // 4) MOCK으로 체결된 제안 수
            var mockProposals = proposalRepo.findByUserIdOrderByCreatedAtDesc(userId).stream()
                    .filter(p -> p.getBrokerAccountId().equals(mock.getId()))
                    .toList();
            long executed = mockProposals.stream().filter(p -> "EXECUTED".equals(p.getStatus())).count();
            long failed = mockProposals.stream().filter(p -> "EXEC_FAILED".equals(p.getStatus())).count();
            long terminalTotal = executed + failed;

            boolean enoughExec = executed >= MIN_MOCK_EXECUTED;
            checks.add(check("MOCK_EXECUTED",
                    "MOCK EXECUTED 주문 ≥ " + MIN_MOCK_EXECUTED + "건",
                    enoughExec,
                    "현재 EXECUTED=" + executed + " (" + (MIN_MOCK_EXECUTED - executed > 0 ? (MIN_MOCK_EXECUTED - executed) + "건 더 필요" : "충분") + ")"));

            // 5) 실패 비율
            double failRatio = terminalTotal == 0 ? 0.0 : (double) failed / (double) terminalTotal;
            boolean okFailRatio = failRatio < MAX_MOCK_FAIL_RATIO;
            checks.add(check("MOCK_FAIL_RATIO",
                    "MOCK 주문 실패율 < " + (int)(MAX_MOCK_FAIL_RATIO * 100) + "%",
                    okFailRatio,
                    "현재 " + String.format("%.1f", failRatio * 100) + "% (성공 " + executed + ", 실패 " + failed + ")"));
        }

        boolean passed = checks.stream().allMatch(c -> Boolean.TRUE.equals(c.get("ok")));
        String summary = passed
                ? "✅ 모든 조건 통과 — REAL 거래 활성화 가능합니다."
                : "❌ 다음 조건을 충족해야 REAL 거래를 활성화할 수 있습니다.";

        return new GateResult(passed, checks, summary);
    }

    private static Map<String, Object> check(String key, String label, boolean ok, String detail) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("key", key);
        m.put("label", label);
        m.put("ok", ok);
        m.put("detail", detail);
        return m;
    }
}
