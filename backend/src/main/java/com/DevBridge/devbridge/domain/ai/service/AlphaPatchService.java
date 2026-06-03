package com.DevBridge.devbridge.domain.ai.service;

import com.DevBridge.devbridge.domain.ai.entity.AlphaWorkspace;
import com.DevBridge.devbridge.domain.ai.entity.AlphaWorkspaceChangeSet;
import com.DevBridge.devbridge.domain.ai.repository.AlphaWorkspaceChangeSetRepository;
import com.DevBridge.devbridge.domain.ai.repository.AlphaWorkspaceRepository;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.*;

/**
 * Alpha Ezer 가 워크스페이스 strategyConfig 을 라이브로 패치하는 서비스.
 *
 * ops 형식: [{ "target":"backtest|regime|trustScore|strategy", "path":"...", "value":... }]
 *   target=strategy → strategyConfig.{path}
 *   그 외          → strategyConfig.{target}.{path}
 *
 * before snapshot 은 strategyConfigJson 전체. undo 시 그대로 복원.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class AlphaPatchService {

    private final AlphaWorkspaceRepository workspaceRepo;
    private final AlphaWorkspaceChangeSetRepository changeSetRepo;
    private final AlphaHelixService helix; // recordLog 재사용
    private final ObjectMapper om = new ObjectMapper();

    private static final Set<String> ALLOWED_TARGETS = Set.of(
            "strategy", "backtest", "regime", "trustScore", "goalProfile", "code");

    // 모델/구버전이 한글 키로 보내도 프런트 카드가 읽는 영문 키로 정규화한다
    private static final Map<String, String> GOAL_KEY_ALIAS = Map.ofEntries(
            Map.entry("기간", "horizon_years"),
            Map.entry("투자기간", "horizon_years"),
            Map.entry("초기투자금", "initial_capital_krw"),
            Map.entry("초기 투자금", "initial_capital_krw"),
            Map.entry("월적립금", "monthly_contribution_krw"),
            Map.entry("월 적립금", "monthly_contribution_krw"),
            Map.entry("투자성향", "risk_tolerance"),
            Map.entry("MDD허용", "max_drawdown_target_pct"),
            Map.entry("MDD 허용", "max_drawdown_target_pct"),
            Map.entry("관심자산", "assets_of_interest"),
            Map.entry("전략방향", "strategy_direction"),
            Map.entry("목표", "goal")
    );

    @Transactional
    public AlphaWorkspaceChangeSet apply(AlphaWorkspace ws, String title, List<Map<String, Object>> ops) {
        if (ops == null || ops.isEmpty()) {
            throw new IllegalArgumentException("ops 가 비어있습니다");
        }

        String strategyBefore = ws.getStrategyConfigJson();
        String goalBefore     = ws.getGoalProfileJson();
        String codeBefore     = ws.getCodeJson();
        Map<String, Object> cfg  = readMap(strategyBefore);
        Map<String, Object> goal = readMap(goalBefore);
        Map<String, Object> code = readMap(codeBefore);

        for (Map<String, Object> op : ops) {
            String target = String.valueOf(op.getOrDefault("target", "strategy")).trim();
            String path   = op.get("path") == null ? "" : String.valueOf(op.get("path")).trim();
            Object value  = op.get("value");

            if (!ALLOWED_TARGETS.contains(target))
                throw new IllegalArgumentException("허용되지 않은 target: " + target);
            if (path.isEmpty())
                throw new IllegalArgumentException("path 가 비어있습니다");

            if ("goalProfile".equals(target)) {
                // 한글 키 → 영문 키 정규화 (점 경로의 첫 토큰만 치환)
                String[] gp = path.split("\\.", 2);
                String head = GOAL_KEY_ALIAS.getOrDefault(gp[0], gp[0]);
                String normalized = gp.length > 1 ? head + "." + gp[1] : head;
                setPath(goal, normalized, value);
            } else if ("code".equals(target)) {
                // path = 파일명(예: "main"), value = 새 전체 파일 문자열
                code.put(path, value == null ? "" : String.valueOf(value));
            } else {
                String fullPath = "strategy".equals(target) ? path : target + "." + path;
                setPath(cfg, fullPath, value);
            }
        }

        String strategyAfter;
        String goalAfter;
        String codeAfter;
        String opsJson;
        String beforeSnap;
        String afterSnap;
        try {
            strategyAfter = om.writeValueAsString(cfg);
            goalAfter     = om.writeValueAsString(goal);
            codeAfter     = om.writeValueAsString(code);
            opsJson       = om.writeValueAsString(ops);
            // before/after에 세 JSON 모두 보존 (undo 시 정확 복원)
            Map<String, String> bs = new LinkedHashMap<>();
            bs.put("strategyConfig", strategyBefore);
            bs.put("goalProfile",    goalBefore);
            bs.put("codeJson",       codeBefore);
            beforeSnap = om.writeValueAsString(bs);
            Map<String, String> as = new LinkedHashMap<>();
            as.put("strategyConfig", strategyAfter);
            as.put("goalProfile",    goalAfter);
            as.put("codeJson",       codeAfter);
            afterSnap = om.writeValueAsString(as);
        } catch (Exception e) {
            throw new RuntimeException("JSON 직렬화 실패: " + e.getMessage(), e);
        }

        ws.setStrategyConfigJson(strategyAfter);
        ws.setGoalProfileJson(goalAfter);
        ws.setCodeJson(codeAfter);
        workspaceRepo.save(ws);

        AlphaWorkspaceChangeSet cs = changeSetRepo.save(AlphaWorkspaceChangeSet.builder()
                .workspaceId(ws.getId())
                .title(title == null || title.isBlank() ? "AI 패치" : title.trim())
                .opsJson(opsJson)
                .beforeJson(beforeSnap)
                .afterJson(afterSnap)
                .status("PENDING")
                .build());

        helix.recordLog(ws.getId(), "AI", "PARAM_CHANGED",
                "Heli 패치 적용: " + cs.getTitle(), opsJson);
        return cs;
    }

    @Transactional
    public AlphaWorkspaceChangeSet keep(AlphaWorkspace ws, Long csId) {
        AlphaWorkspaceChangeSet cs = changeSetRepo.findByIdAndWorkspaceId(csId, ws.getId())
                .orElseThrow(() -> new NoSuchElementException("changeset not found"));
        if (!"PENDING".equals(cs.getStatus())) return cs;
        cs.setStatus("KEPT");
        helix.recordLog(ws.getId(), "USER", "PARAM_CHANGED",
                "변경 유지: " + cs.getTitle(), null);
        return changeSetRepo.save(cs);
    }

    @Transactional
    public AlphaWorkspaceChangeSet undo(AlphaWorkspace ws, Long csId) {
        AlphaWorkspaceChangeSet cs = changeSetRepo.findByIdAndWorkspaceId(csId, ws.getId())
                .orElseThrow(() -> new NoSuchElementException("changeset not found"));
        if (!"PENDING".equals(cs.getStatus()))
            throw new IllegalStateException("PENDING 상태에서만 실행취소 가능 (현재: " + cs.getStatus() + ")");

        // before snapshot: 신규 포맷 {"strategyConfig":..., "goalProfile":..., "codeJson":...} 또는 구포맷 (strategyConfig 단독)
        String raw = cs.getBeforeJson();
        boolean restored = false;
        if (raw != null && !raw.isBlank()) {
            try {
                Map<String, Object> bs = om.readValue(raw, new TypeReference<LinkedHashMap<String, Object>>() {});
                if (bs.containsKey("strategyConfig") || bs.containsKey("goalProfile") || bs.containsKey("codeJson")) {
                    Object sc = bs.get("strategyConfig");
                    Object gp = bs.get("goalProfile");
                    Object cj = bs.get("codeJson");
                    ws.setStrategyConfigJson(sc == null ? null : String.valueOf(sc));
                    ws.setGoalProfileJson(gp == null ? null : String.valueOf(gp));
                    if (bs.containsKey("codeJson")) {
                        ws.setCodeJson(cj == null ? null : String.valueOf(cj));
                    }
                    restored = true;
                }
            } catch (Exception ignore) { /* 구포맷으로 폴백 */ }
        }
        if (!restored) {
            ws.setStrategyConfigJson(raw);
        }
        workspaceRepo.save(ws);

        cs.setStatus("UNDONE");
        helix.recordLog(ws.getId(), "USER", "USER_REVISION",
                "변경 실행취소: " + cs.getTitle(), null);
        return changeSetRepo.save(cs);
    }

    public List<AlphaWorkspaceChangeSet> listAll(Long wsId) {
        return changeSetRepo.findByWorkspaceIdOrderByCreatedAtDesc(wsId);
    }

    public List<AlphaWorkspaceChangeSet> listPending(Long wsId) {
        return changeSetRepo.findByWorkspaceIdAndStatusOrderByCreatedAtDesc(wsId, "PENDING");
    }

    // ─────────────────────────────────────── helpers

    private Map<String, Object> readMap(String json) {
        if (json == null || json.isBlank()) return new LinkedHashMap<>();
        try {
            return om.readValue(json, new TypeReference<LinkedHashMap<String, Object>>() {});
        } catch (Exception e) {
            throw new RuntimeException("strategyConfig JSON 파싱 실패: " + e.getMessage(), e);
        }
    }

    @SuppressWarnings("unchecked")
    private void setPath(Map<String, Object> root, String dotPath, Object value) {
        String[] parts = dotPath.split("\\.");
        Map<String, Object> cur = root;
        for (int i = 0; i < parts.length - 1; i++) {
            Object next = cur.get(parts[i]);
            if (!(next instanceof Map)) {
                next = new LinkedHashMap<String, Object>();
                cur.put(parts[i], next);
            }
            cur = (Map<String, Object>) next;
        }
        cur.put(parts[parts.length - 1], value);
    }
}
