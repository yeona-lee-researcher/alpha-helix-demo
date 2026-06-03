package com.DevBridge.devbridge.domain.payment.controller;

import com.DevBridge.devbridge.domain.project.entity.ProjectEscrow;
import com.DevBridge.devbridge.domain.project.entity.Project;
import com.DevBridge.devbridge.domain.project.repository.ProjectEscrowRepository;
import com.DevBridge.devbridge.domain.project.repository.ProjectRepository;
import com.DevBridge.devbridge.domain.payment.repository.PaymentMethodRepository;
import com.DevBridge.devbridge.domain.user.repository.UserRepository;
import com.DevBridge.devbridge.domain.user.entity.User;
import com.DevBridge.devbridge.global.security.AuthContext;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.time.ZoneId;
import java.util.*;

/**
 * 가계부(수입/정산) — 사용자의 에스크로 이벤트를 모아 거래 목록으로 반환.
 *  - 클라이언트(payer): DEPOSITED → expense (지출), REFUNDED → income (환불)
 *  - 파트너(payee):    RELEASED  → income  (정산),  PENDING/DEPOSITED → 진행중 (제외)
 * 카드/계좌가 등록되지 않은 사용자는 `linked=false` + 빈 목록을 반환해
 * 프론트가 "결제수단 등록 후 자동 표시" 같은 안내를 띄울 수 있게 한다.
 */
@RestController
@RequestMapping("/api/ledger")
@RequiredArgsConstructor
public class LedgerController {

    private final ProjectEscrowRepository escrowRepository;
    private final ProjectRepository projectRepository;
    private final PaymentMethodRepository paymentMethodRepository;
    private final UserRepository userRepository;

    @GetMapping("/me")
    public ResponseEntity<Map<String, Object>> myLedger() {
        Long uid = AuthContext.currentUserId();
        if (uid == null) {
            return ResponseEntity.ok(Map.of(
                "linked", false,
                "items", List.of()
            ));
        }
        User user = userRepository.findById(uid).orElse(null);
        boolean cardLinked = user != null && paymentMethodRepository.countByUser(user) > 0;
        boolean bankLinked = user != null && user.isBankVerified();

        // 빈 결제수단/계좌인 사용자도 거래 자체는 보여줌 — 등록 후 새 거래만 추가되도록.
        List<ProjectEscrow> asPayer = escrowRepository.findByPayerUserIdOrderByCreatedAtDesc(uid);
        List<ProjectEscrow> asPayee = escrowRepository.findByPayeeUserIdOrderByCreatedAtDesc(uid);

        // projectId → title 캐시
        Set<Long> projectIds = new HashSet<>();
        asPayer.forEach(e -> projectIds.add(e.getProjectId()));
        asPayee.forEach(e -> projectIds.add(e.getProjectId()));
        Map<Long, String> titleByProj = new HashMap<>();
        for (Project p : projectRepository.findAllById(projectIds)) {
            titleByProj.put(p.getId(), p.getTitle());
        }

        List<Map<String, Object>> items = new ArrayList<>();
        for (ProjectEscrow e : asPayer) {
            String t = titleByProj.getOrDefault(e.getProjectId(), "프로젝트 #" + e.getProjectId());
            if (e.getStatus() == ProjectEscrow.EscrowStatus.DEPOSITED && e.getDepositedAt() != null) {
                items.add(row(e.getDepositedAt().toLocalDate(), "expense",
                        t + " 에스크로 결제", "Project Payment", e.getAmount(), e.getProjectId(), e.getId()));
            }
            if (e.getStatus() == ProjectEscrow.EscrowStatus.REFUNDED && e.getRefundedAt() != null) {
                items.add(row(e.getRefundedAt().toLocalDate(), "income",
                        t + " 에스크로 환불", "Refund", e.getAmount(), e.getProjectId(), e.getId()));
            }
        }
        for (ProjectEscrow e : asPayee) {
            String t = titleByProj.getOrDefault(e.getProjectId(), "프로젝트 #" + e.getProjectId());
            if (e.getStatus() == ProjectEscrow.EscrowStatus.RELEASED && e.getReleasedAt() != null) {
                items.add(row(e.getReleasedAt().toLocalDate(), "income",
                        t + " 정산금 입금", "Settlement", e.getAmount(), e.getProjectId(), e.getId()));
            }
        }
        // 최신 → 과거
        items.sort((a, b) -> ((String) b.get("date")).compareTo((String) a.get("date")));

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("linked", cardLinked || bankLinked);
        result.put("cardLinked", cardLinked);
        result.put("bankLinked", bankLinked);
        result.put("items", items);
        return ResponseEntity.ok(result);
    }

    private Map<String, Object> row(LocalDate date, String type, String title,
                                    String category, Long amount, Long projectId, Long escrowId) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("date", date == null ? LocalDate.now().toString() : date.toString());
        m.put("type", type);
        m.put("title", title);
        m.put("category", category);
        m.put("amount", amount == null ? 0L : amount);
        m.put("projectId", projectId);
        m.put("escrowId", escrowId);
        return m;
    }
}
