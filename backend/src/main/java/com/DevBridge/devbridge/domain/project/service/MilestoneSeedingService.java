package com.DevBridge.devbridge.domain.project.service;

import com.DevBridge.devbridge.domain.project.entity.Project;
import com.DevBridge.devbridge.domain.project.entity.ProjectMilestone;
import com.DevBridge.devbridge.domain.project.entity.ProjectModule;
import com.DevBridge.devbridge.domain.project.repository.ProjectMilestoneRepository;
import com.DevBridge.devbridge.domain.project.repository.ProjectModuleRepository;
import com.DevBridge.devbridge.domain.project.repository.ProjectRepository;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * 7개 협의 모듈(scope/deliverable/schedule/payment/...)이 모두 협의완료된 상태에서
 * 마일스톤을 자동 생성하는 단일 책임 서비스.
 * 멱등: 마일스톤이 1건이라도 존재하면 skip.
 *
 *  - schedule.phases[]            → 마일스톤 1:1 (제목/설명/날짜)
 *  - payment.stages[*].amount     → 금액 분배 (개수가 일치하지 않으면 비율/균등)
 *  - deliverable.deliverables[]   → 모든 마일스톤의 completion_criteria
 *  - payment.total / project.budgetAmount(만원) → 총액 fallback
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class MilestoneSeedingService {

    private final ProjectMilestoneRepository projectMilestoneRepository;
    private final ProjectModuleRepository projectModuleRepository;
    private final ProjectRepository projectRepository;
    private final ContractModuleSeeder contractModuleSeeder;
    private final ObjectMapper om = new ObjectMapper();

    // REQUIRES_NEW: 시드/보정 작업은 별도 트랜잭션으로 분리.
    // listMilestones 같은 호출자 트랜잭션이 시드 실패로 rollback-only 마킹되어
    // 정상 조회까지 500 나는 문제 방지.
    /**
     * 부트스트랩: 모든 프로젝트의 schedule/payment 모듈 데이터로부터 마일스톤을 시드한다.
     *  - 모듈 status (협의완료 여부) 와 무관하게 시드 — AI 채팅으로 만들어진 contractTerms 가
     *    이미 모듈에 들어있으므로 그 데이터로 충분함.
     *  - payment 단위 오류는 자동 보정 후 재시드.
     *  - 완료(COMPLETED) 프로젝트는 모든 마일스톤을 APPROVED + 과거 일정으로 정렬.
     * 멱등: 이미 마일스톤이 있고 보정도 필요 없으면 skip.
     */
    @Transactional
    public int bootstrapAll() {
        java.util.List<Project> all = projectRepository.findAll();
        int seeded = 0;
        for (Project p : all) {
            try {
                if (bootstrapOne(p)) seeded++;
            } catch (Exception e) {
                log.warn("[bootstrapAll] projectId={} 실패: {}", p.getId(), e.getMessage());
            }
        }
        log.info("[MilestoneSeedingService] bootstrap 완료: {} / {} 프로젝트", seeded, all.size());
        return seeded;
    }

    private boolean bootstrapOne(Project p) {
        if (p == null || p.getId() == null) return false;
        Long pid = p.getId();

        java.util.List<ProjectModule> modules = projectModuleRepository.findByProjectId(pid);
        if (modules.size() < 7) return false; // ContractModuleSeeder.backfillAll 가 먼저 돌아야 함

        // payment 단위 보정 → 잘못된 금액으로 시드된 마일스톤 제거 후 재시드
        try {
            if (contractModuleSeeder.repairPaymentIfStale(p)) {
                java.util.List<ProjectMilestone> existing = projectMilestoneRepository.findByProjectIdOrderBySeqAsc(pid);
                if (!existing.isEmpty()) projectMilestoneRepository.deleteAll(existing);
            }
        } catch (Exception ignore) {}

        // 마일스톤이 없으면 schedule/payment 모듈 데이터에서 시드 (모듈 협의 status 와 무관)
        java.util.List<ProjectMilestone> ms = projectMilestoneRepository.findByProjectIdOrderBySeqAsc(pid);
        boolean newlySeeded = false;
        if (ms.isEmpty()) {
            int created = seedFromModules(p, modules);
            newlySeeded = created > 0;
            if (newlySeeded) ms = projectMilestoneRepository.findByProjectIdOrderBySeqAsc(pid);
        }

        // 완료 프로젝트는 모든 마일스톤을 APPROVED + 일정 보정 (과거 종료일)
        Project.ProjectStatus st = p.getStatus();
        boolean changed = false;
        if (st == Project.ProjectStatus.COMPLETED && !ms.isEmpty()) {
            LocalDate today = LocalDate.now();
            int n = ms.size();
            for (int i = 0; i < n; i++) {
                ProjectMilestone m = ms.get(i);
                if (m.getStatus() != ProjectMilestone.MilestoneStatus.APPROVED) {
                    m.setStatus(ProjectMilestone.MilestoneStatus.APPROVED);
                    if (m.getApprovedAt() == null) m.setApprovedAt(java.time.LocalDateTime.now());
                    if (m.getSubmittedAt() == null) m.setSubmittedAt(java.time.LocalDateTime.now());
                    changed = true;
                }
                if (m.getEndDate() == null || !m.getEndDate().isBefore(today)) {
                    LocalDate base = today.minusDays((long)(n - i) * 14);
                    m.setStartDate(base.minusDays(13));
                    m.setEndDate(base);
                    changed = true;
                }
            }
            if (changed) projectMilestoneRepository.saveAll(ms);
        }
        return newlySeeded || changed;
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public int seedIfNeeded(Long projectId) {
        if (projectId == null) return 0;

        Project project = projectRepository.findById(projectId).orElse(null);
        if (project == null) return 0;

        // 1) payment 모듈에 단위 오해석 버그(budgetAmount 만원→원 미변환)로 저장된 데이터가 있으면 자동 보정.
        //    보정되면 마일스톤도 잘못된 금액으로 시드되어 있으므로 함께 삭제 → 아래 재시드로 복구.
        boolean repaired = false;
        try { repaired = contractModuleSeeder.repairPaymentIfStale(project); }
        catch (Exception e) { /* 보정 실패는 시드 진행 막지 않음 */ }
        if (repaired) {
            List<ProjectMilestone> existing = projectMilestoneRepository.findByProjectIdOrderBySeqAsc(projectId);
            if (!existing.isEmpty()) projectMilestoneRepository.deleteAll(existing);
        }

        // 2) 기존 마일스톤이 모두 과거 (D+ 표시 원인) + 진척 없음 → 오늘 기준으로 일괄 시프트.
        try { rebaseStaleMilestones(projectId); } catch (Exception ignore) {}

        // 3) 기존 마일스톤의 완료기준이 옛 형식("필수 제출물:" 통합 텍스트) 이면
        //    completion.categories 기반의 phase-별 완료기준으로 in-place 업데이트.
        try { refreshCompletionCriteriaIfStale(projectId); } catch (Exception ignore) {}

        if (!projectMilestoneRepository.findByProjectIdOrderBySeqAsc(projectId).isEmpty()) return 0;

        // 마일스톤 시드는 7개 모듈 협의완료와 분리한다 — schedule/payment 모듈에 데이터가
        // 들어오는 즉시 (프로젝트 등록 시점의 AI contractTerms 시드 포함) 마일스톤을 생성.
        List<ProjectModule> modules = projectModuleRepository.findByProjectId(projectId);
        if (modules.size() < 7) return 0;

        return seedFromModules(project, modules);
    }

    @Transactional
    public int seedFromModules(Project project, List<ProjectModule> modules) {
        if (project == null || project.getId() == null) return 0;
        Long projectId = project.getId();
        if (!projectMilestoneRepository.findByProjectIdOrderBySeqAsc(projectId).isEmpty()) return 0;

        Map<String, ProjectModule> byKey = new HashMap<>();
        for (ProjectModule m : modules) byKey.put(m.getModuleKey(), m);

        ProjectModule scheduleMod = byKey.get("schedule");
        if (scheduleMod == null || scheduleMod.getData() == null) {
            log.warn("[seedMilestones] schedule 모듈 없음 projectId={}", projectId);
            return 0;
        }
        JsonNode schedule = readJson(scheduleMod.getData());
        JsonNode phases = schedule != null ? schedule.path("phases") : null;
        if (phases == null || !phases.isArray() || phases.size() == 0) {
            log.warn("[seedMilestones] phases 비어있음 projectId={}", projectId);
            return 0;
        }

        long totalWon = computeTotalBudgetWon(byKey.get("payment"), project);
        JsonNode payment = byKey.get("payment") != null ? readJson(byKey.get("payment").getData()) : null;
        long[] amounts = distributeAmounts(totalWon, phases.size(), payment);

        // 각 마일스톤의 완료기준은 completion.categories[i] (있으면) → 폴백으로 deliverables 통합 텍스트.
        String[] perPhaseCriteria = buildPerPhaseCriteria(byKey.get("completion"), byKey.get("deliverable"), phases.size());

        LocalDate scheduleStart = parseDate(schedule.path("startDate").asText(null));
        if (scheduleStart == null) {
            scheduleStart = project.getStartDate() != null ? project.getStartDate() : LocalDate.now();
        }
        // 시드 데이터가 오래되어 scheduleStart 가 이미 과거 (D+ 표시 원인) 이면 오늘로 앵커링.
        // → 마일스톤 endDate 도 phase.date - scheduleStart 차이만큼 미래로 시프트.
        LocalDate today = LocalDate.now();
        long shiftDays = 0L;
        if (scheduleStart.isBefore(today.minusDays(7))) {
            shiftDays = java.time.temporal.ChronoUnit.DAYS.between(scheduleStart, today);
            scheduleStart = today;
        }

        LocalDate prevEnd = scheduleStart;
        int seq = 1;
        for (JsonNode ph : phases) {
            String num = ph.path("num").asText("");
            String title = ph.path("title").asText("");
            if (title.isBlank()) title = num.isBlank() ? "마일스톤 " + seq : num;
            String desc = ph.path("desc").asText("");
            LocalDate end = parseDate(ph.path("date").asText(null));
            if (end == null) end = prevEnd.plusWeeks(2);
            else if (shiftDays > 0) end = end.plusDays(shiftDays);
            LocalDate start = (seq == 1) ? scheduleStart : prevEnd;

            ProjectMilestone m = ProjectMilestone.builder()
                    .projectId(projectId)
                    .seq(seq)
                    .title(num.isBlank() ? title : (num + " " + title))
                    .description(desc.isBlank() ? null : desc)
                    .completionCriteria(perPhaseCriteria[seq - 1])
                    .amount(amounts[seq - 1])
                    .startDate(start)
                    .endDate(end)
                    .status(ProjectMilestone.MilestoneStatus.PENDING)
                    .build();
            projectMilestoneRepository.save(m);

            prevEnd = end;
            seq++;
        }
        log.info("[seedMilestones] {} 개 마일스톤 자동 생성 projectId={}", phases.size(), projectId);
        return phases.size();
    }

    private JsonNode readJson(String json) {
        if (json == null || json.isBlank()) return null;
        try { return om.readTree(json); } catch (Exception e) { return null; }
    }

    private long computeTotalBudgetWon(ProjectModule paymentModule, Project p) {
        if (paymentModule != null) {
            JsonNode root = readJson(paymentModule.getData());
            if (root != null) {
                long parsed = parseWonAmount(root.path("total").asText(""));
                if (parsed > 0) return parsed;
            }
        }
        if (p.getBudgetAmount() != null && p.getBudgetAmount() > 0) {
            // budgetAmount 는 원 단위 (DataSeeder 가 구 만원 데이터 ×10000 마이그레이션).
            return (long) p.getBudgetAmount();
        }
        return 10_000_000L;
    }

    private long parseWonAmount(String s) {
        if (s == null) return 0L;
        String digits = s.replaceAll("[^0-9]", "");
        if (digits.isEmpty()) return 0L;
        try { return Long.parseLong(digits); } catch (NumberFormatException e) { return 0L; }
    }

    private long[] distributeAmounts(long totalWon, int phaseCount, JsonNode payment) {
        long[] out = new long[phaseCount];
        // stages 와 phase 수가 정확히 일치할 때만 stage 금액 1:1 매핑.
        // 그 외(개수 불일치)에는 phase 균등 분배. (예: 4 phase × 3 stages 의 잘못된 비율 매핑 회피)
        if (payment != null) {
            JsonNode stages = payment.path("stages");
            if (stages.isArray() && stages.size() == phaseCount) {
                long sum = 0;
                for (int i = 0; i < phaseCount; i++) {
                    out[i] = parseWonAmount(stages.get(i).path("amount").asText(""));
                    sum += out[i];
                }
                if (sum > 0) {
                    if (sum != totalWon && totalWon > 0) out[phaseCount - 1] += (totalWon - sum);
                    return out;
                }
            }
        }
        long each = totalWon / Math.max(1, phaseCount);
        long acc = 0;
        for (int i = 0; i < phaseCount - 1; i++) { out[i] = each; acc += each; }
        out[phaseCount - 1] = totalWon - acc;
        return out;
    }

    /**
     * phase 개수에 맞춰 각 마일스톤의 완료기준 문자열 배열을 만든다.
     * 우선순위:
     *   1) completion.categories[i] → "title: desc" 단일
     *   2) deliverable.deliverables[] 통합 텍스트 (기존 폴백)
     */
    private String[] buildPerPhaseCriteria(ProjectModule completionModule, ProjectModule deliverableModule, int phaseCount) {
        String[] out = new String[phaseCount];
        String fallback = buildDeliverableText(deliverableModule);

        if (completionModule != null) {
            JsonNode root = readJson(completionModule.getData());
            JsonNode cats = root != null ? root.path("categories") : null;
            if (cats != null && cats.isArray() && cats.size() > 0) {
                for (int i = 0; i < phaseCount; i++) {
                    // 카테고리 수가 phase 수와 다를 때는 비례 매핑.
                    int cIdx = (cats.size() == phaseCount)
                            ? i
                            : (int) Math.min(cats.size() - 1L, (long) i * cats.size() / phaseCount);
                    JsonNode cat = cats.get(cIdx);
                    String title = cat.path("title").asText("").trim();
                    String desc  = cat.path("desc").asText("").trim();
                    StringBuilder sb = new StringBuilder();
                    if (!title.isBlank()) sb.append(title);
                    if (!desc.isBlank()) {
                        if (sb.length() > 0) sb.append("\n");
                        sb.append(desc);
                    }
                    out[i] = sb.length() > 0 ? sb.toString() : fallback;
                }
                return out;
            }
        }
        // 폴백: 모든 마일스톤이 동일한 deliverable 통합 텍스트.
        for (int i = 0; i < phaseCount; i++) out[i] = fallback;
        return out;
    }

    private String buildDeliverableText(ProjectModule deliverableModule) {
        if (deliverableModule == null) return null;
        JsonNode root = readJson(deliverableModule.getData());
        if (root == null) return null;
        JsonNode arr = root.path("deliverables");
        if (!arr.isArray() || arr.size() == 0) return null;
        StringBuilder sb = new StringBuilder("필수 제출물:\n");
        for (JsonNode item : arr) {
            String icon = item.path("icon").asText("•");
            String label = item.path("label").asText("");
            if (label.isBlank()) continue;
            sb.append(icon).append(" ").append(label).append("\n");
        }
        return sb.toString().trim();
    }

    /**
     * 모든 마일스톤이 옛 통합 deliverable 텍스트("필수 제출물:..." 형태로 동일) 인 경우
     * completion.categories 기반의 phase-별 완료기준으로 덮어쓴다.
     * 마일스톤 자체(금액/날짜/상태)는 보존.
     */
    private void refreshCompletionCriteriaIfStale(Long projectId) {
        List<ProjectMilestone> list = projectMilestoneRepository.findByProjectIdOrderBySeqAsc(projectId);
        if (list.isEmpty()) return;

        // 모두 동일 + "필수 제출물:" 으로 시작하면 옛 형식 → 갱신.
        String first = list.get(0).getCompletionCriteria();
        boolean allSame = first != null && first.startsWith("필수 제출물:")
                && list.stream().allMatch(m -> first.equals(m.getCompletionCriteria()));
        if (!allSame) return;

        List<ProjectModule> modules = projectModuleRepository.findByProjectId(projectId);
        Map<String, ProjectModule> byKey = new HashMap<>();
        for (ProjectModule m : modules) byKey.put(m.getModuleKey(), m);

        String[] perPhase = buildPerPhaseCriteria(byKey.get("completion"), byKey.get("deliverable"), list.size());
        // 만약 새로 만든 것도 모두 fallback (= 옛 텍스트와 동일) 이면 굳이 update 안 함.
        if (perPhase.length > 0 && perPhase[0] != null && perPhase[0].equals(first)) return;

        for (int i = 0; i < list.size(); i++) {
            list.get(i).setCompletionCriteria(perPhase[i]);
        }
        projectMilestoneRepository.saveAll(list);
        log.info("[refreshCompletionCriteria] {} 마일스톤의 완료기준을 phase-별로 갱신 projectId={}", list.size(), projectId);
    }

    /**
     * 기존 마일스톤이 모두 과거이고 진척 (APPROVED/COMPLETED) 없으면
     * 마지막 endDate 가 today + 30일이 되도록 일괄 시프트.
     * 진척이 있는 프로젝트는 건드리지 않음.
     */
    private void rebaseStaleMilestones(Long projectId) {
        List<ProjectMilestone> list = projectMilestoneRepository.findByProjectIdOrderBySeqAsc(projectId);
        if (list.isEmpty()) return;
        boolean anyDone = list.stream().anyMatch(m ->
            m.getStatus() == ProjectMilestone.MilestoneStatus.APPROVED
            || m.getStatus() == ProjectMilestone.MilestoneStatus.COMPLETED);
        if (anyDone) return;

        LocalDate today = LocalDate.now();
        LocalDate lastEnd = list.stream().map(ProjectMilestone::getEndDate).filter(java.util.Objects::nonNull)
                .max(LocalDate::compareTo).orElse(null);
        if (lastEnd == null || !lastEnd.isBefore(today)) return;

        long shift = java.time.temporal.ChronoUnit.DAYS.between(lastEnd, today) + 30L;
        for (ProjectMilestone m : list) {
            if (m.getStartDate() != null) m.setStartDate(m.getStartDate().plusDays(shift));
            if (m.getEndDate() != null)   m.setEndDate(m.getEndDate().plusDays(shift));
        }
        projectMilestoneRepository.saveAll(list);
    }

    private LocalDate parseDate(String s) {
        if (s == null || s.isBlank()) return null;
        String norm = s.replace('.', '-').replaceAll("-+$", "").trim();
        try { return LocalDate.parse(norm); } catch (Exception e) { return null; }
    }
}
