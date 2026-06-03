package com.DevBridge.devbridge.domain.project.service;

import com.DevBridge.devbridge.domain.project.entity.Project;
import com.DevBridge.devbridge.domain.project.entity.ProjectModule;
import com.DevBridge.devbridge.domain.project.repository.ProjectModuleRepository;
import com.DevBridge.devbridge.domain.project.repository.ProjectRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.text.NumberFormat;
import java.time.LocalDate;
import java.util.List;
import java.util.Locale;

/**
 * 프로젝트 등록 시(또는 백필 시) 7개 계약 협의 모듈(PROJECT_MODULES)을
 * 프로젝트 자체 데이터(title, budget, duration, serviceField 등)로부터 자동 생성.
 *
 * 생성 규칙:
 *  - 7개 module_key (scope/deliverable/schedule/payment/revision/completion/terms) 모두 status="미확정"
 *  - data 는 프로젝트 컬럼에서 의미 있는 기본값을 추출해 JSON 으로 직렬화
 *  - 이미 (project_id, module_key) 행이 존재하면 건드리지 않음 (멱등)
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class ContractModuleSeeder {

    private final ProjectModuleRepository projectModuleRepository;
    private final ProjectRepository projectRepository;
    private final ObjectMapper om = new ObjectMapper();

    /**
     * 기존 payment 모듈의 total 이 budgetAmount × 10000 대비 1/10 미만이면
     * (예: budgetAmount 단위 오해석으로 ₩3,000 같이 저장된 경우) payment 모듈을 통째로 재생성.
     * 협의완료 상태도 그대로 유지하기 위해 status 는 유지하고 data 만 덮어씀.
     * @return true 재생성됨 / false skip
     */
    @Transactional
    public boolean repairPaymentIfStale(Project p) {
        if (p == null || p.getId() == null) return false;
        if (p.getBudgetAmount() == null || p.getBudgetAmount() <= 0) return false;
        // budgetAmount 는 원 단위 (DataSeeder 가 구 만원 데이터 ×10000 마이그레이션 처리).
        long expectedWon = (long) p.getBudgetAmount();

        ProjectModule pm = projectModuleRepository.findByProjectIdAndModuleKey(p.getId(), "payment").orElse(null);
        if (pm == null) return false;

        long currentTotal = 0L;
        try {
            String json = pm.getData();
            if (json != null) {
                String totalStr = om.readTree(json).path("total").asText("");
                String digits = totalStr.replaceAll("[^0-9]", "");
                if (!digits.isEmpty()) currentTotal = Long.parseLong(digits);
            }
        } catch (Exception ignore) {}

        // 정상치(>= expected/10) 이면 건드리지 않음 (협상으로 변경된 정상 데이터 보호)
        if (currentTotal >= expectedWon / 10) return false;

        ObjectNode payment = buildPayment(p);
        try { pm.setData(om.writeValueAsString(payment)); }
        catch (Exception e) { return false; }
        projectModuleRepository.save(pm);
        log.info("[ContractModuleSeeder] payment 모듈 자동 보정 projectId={} {} → {}", p.getId(), currentTotal, expectedWon);
        return true;
    }

    /**
     * AI chat 등에서 받은 contractTerms (Map) 를 PROJECT_MODULES 의 각 모듈 data 에 덮어쓴다.
     * FE 키 → BE module_key 매핑:
     *   scope → scope, deliverables → deliverable, schedule → schedule, payment → payment,
     *   revision → revision, completion → completion, specialTerms → terms.
     * 매칭되는 키가 contractTerms 에 없으면 해당 모듈은 건드리지 않음 (기본 시드 값 유지).
     */
    @Transactional
    public void applyContractTerms(Project p, java.util.Map<String, Object> contractTerms) {
        if (p == null || p.getId() == null || contractTerms == null || contractTerms.isEmpty()) return;
        java.util.Map<String, String> keyMap = java.util.Map.of(
                "scope", "scope",
                "deliverables", "deliverable",
                "schedule", "schedule",
                "payment", "payment",
                "revision", "revision",
                "completion", "completion",
                "specialTerms", "terms"
        );
        keyMap.forEach((feKey, beKey) -> {
            Object val = contractTerms.get(feKey);
            if (val == null) return;
            String json;
            try { json = om.writeValueAsString(val); }
            catch (Exception e) { return; }
            ProjectModule pm = projectModuleRepository.findByProjectIdAndModuleKey(p.getId(), beKey).orElse(null);
            if (pm != null) {
                pm.setData(json);
                projectModuleRepository.save(pm);
            } else {
                // 시드가 아직 안 됐으면 새로 INSERT
                ProjectModule fresh = ProjectModule.builder()
                        .projectId(p.getId())
                        .moduleKey(beKey)
                        .status("미확정")
                        .data(json)
                        .lastModifierId(p.getUser() != null ? p.getUser().getId() : null)
                        .lastModifierName(p.getUser() != null ? p.getUser().getUsername() : null)
                        .build();
                projectModuleRepository.save(fresh);
            }
        });
        log.info("[ContractModuleSeeder] AI contractTerms 적용 완료 projectId={}, keys={}",
                p.getId(), contractTerms.keySet());
    }

    /** 신규 프로젝트 1건의 7개 모듈 시드 (이미 있으면 skip). */
    @Transactional
    public void seedForProject(Project p) {
        if (p == null || p.getId() == null) return;
        if (projectModuleRepository.countByProjectId(p.getId()) >= 7) return;

        upsertIfMissing(p, "scope",       buildScope(p));
        upsertIfMissing(p, "deliverable", buildDeliverable(p));
        upsertIfMissing(p, "schedule",    buildSchedule(p));
        upsertIfMissing(p, "payment",     buildPayment(p));
        upsertIfMissing(p, "revision",    buildRevision(p));
        upsertIfMissing(p, "completion",  buildCompletion(p));
        upsertIfMissing(p, "terms",       buildTerms(p));
    }

    /** 전체 프로젝트 백필. PROJECT_MODULES 행이 7개 미만인 프로젝트만 채움. */
    @Transactional
    public int backfillAll() {
        List<Project> all = projectRepository.findAll();
        int seeded = 0;
        for (Project p : all) {
            long cnt = projectModuleRepository.countByProjectId(p.getId());
            if (cnt < 7) {
                seedForProject(p);
                seeded++;
            }
        }
        log.info("[ContractModuleSeeder] backfill 완료: {} / {} 프로젝트", seeded, all.size());
        return seeded;
    }

    // ──────────────────────────────────────────────────
    // 내부: 1개 모듈 INSERT (이미 있으면 skip)
    // ──────────────────────────────────────────────────
    private void upsertIfMissing(Project p, String moduleKey, ObjectNode data) {
        projectModuleRepository.findByProjectIdAndModuleKey(p.getId(), moduleKey).orElseGet(() -> {
            String json;
            try { json = om.writeValueAsString(data); } catch (Exception e) { json = "{}"; }
            ProjectModule pm = ProjectModule.builder()
                    .projectId(p.getId())
                    .moduleKey(moduleKey)
                    .status("미확정")
                    .data(json)
                    .lastModifierId(p.getUser() != null ? p.getUser().getId() : null)
                    .lastModifierName(p.getUser() != null ? p.getUser().getUsername() : null)
                    .build();
            return projectModuleRepository.save(pm);
        });
    }

    // ──────────────────────────────────────────────────
    // 모듈별 기본 data JSON 빌더 (프로젝트 컬럼에서 파생)
    // ──────────────────────────────────────────────────

    /** 1. 작업 범위 (scope): {included, excluded, memo} */
    private ObjectNode buildScope(Project p) {
        ObjectNode root = om.createObjectNode();
        ArrayNode included = root.putArray("included");
        ArrayNode excluded = root.putArray("excluded");

        String field = nz(p.getServiceField(), "프로젝트");
        included.add(field + " 핵심 기능 설계 및 구현");
        included.add("주요 화면/기능에 대한 UI/UX 작업");
        if (p.getDetailContent() != null && !p.getDetailContent().isBlank()) {
            included.add("상세 요구사항: " + truncate(p.getDetailContent(), 60));
        } else {
            included.add("요구사항 정의서 기반 산출물 작성");
        }

        excluded.add("운영 환경 인프라/서버 호스팅 비용");
        excluded.add("계약 외 추가 기능 및 디자인 전면 리뉴얼");

        root.put("memo", "포함/제외 범위는 프로젝트 등록 정보를 기반으로 자동 생성되었습니다. 협의 시 수정 가능합니다.");
        return root;
    }

    /** 2. 최종 전달물 정의 (deliverable): {deliverables[], formats[], delivery[], notes[]} */
    private ObjectNode buildDeliverable(Project p) {
        ObjectNode root = om.createObjectNode();
        ArrayNode deliverables = root.putArray("deliverables");
        deliverables.add(item("📄", nz(p.getServiceField(), "프로젝트") + " 요구사항 정의서 / 기획서"));
        deliverables.add(item("📝", "최종 산출물 (소스코드 또는 디자인 원본)"));
        deliverables.add(item("🔗", "GitHub 저장소 또는 결과물 다운로드 링크"));
        deliverables.add(item("📖", "사용 가이드 / 인수인계 문서"));

        ArrayNode formats = root.putArray("formats");
        formats.add("PDF / DOCX (문서)");
        formats.add("ZIP 또는 GitHub URL (소스)");
        formats.add("PNG / Figma URL (디자인)");

        ArrayNode delivery = root.putArray("delivery");
        delivery.add("DevBridge 채팅 첨부");
        delivery.add("이메일 또는 클라우드 링크 공유");
        delivery.add("필요 시 ZIP 파일 별도 전달");

        ArrayNode notes = root.putArray("notes");
        notes.add("전달물에는 한글 설명 문서가 포함됩니다.");
        notes.add("실서비스 배포본은 별도 합의 후 전달됩니다.");
        return root;
    }

    private ObjectNode item(String icon, String label) {
        ObjectNode n = om.createObjectNode();
        n.put("icon", icon);
        n.put("label", label);
        return n;
    }

    /** 3. 마감 일정 및 마일스톤 (schedule): {phases[], startDate, endDate, launchDate, reviewRules[]} */
    private ObjectNode buildSchedule(Project p) {
        ObjectNode root = om.createObjectNode();
        LocalDate start = p.getStartDate() != null ? p.getStartDate() : LocalDate.now().plusDays(7);
        int months = p.getDurationMonths() != null && p.getDurationMonths() > 0 ? p.getDurationMonths() : 3;
        LocalDate end = start.plusMonths(months);
        LocalDate launch = end.plusWeeks(1);

        long totalDays = java.time.temporal.ChronoUnit.DAYS.between(start, end);
        long phaseDays = Math.max(7, totalDays / 4);

        ArrayNode phases = root.putArray("phases");
        phases.add(phase("PHASE 01", "기획/설계", "요구사항 상세 정의 및 UI/UX 와이어프레임 설계 확정", start.plusDays(phaseDays)));
        phases.add(phase("PHASE 02", "개발 1차", "핵심 기능 개발 및 주요 화면 구현 완료", start.plusDays(phaseDays * 2)));
        phases.add(phase("PHASE 03", "개발 2차", "전체 모듈 통합 및 부가 기능 구현", start.plusDays(phaseDays * 3)));
        phases.add(phase("PHASE 04", "최종 검수", "QA 테스트, 버그 수정 및 배포 준비", end));

        root.put("startDate", start.toString().replace('-', '.'));
        root.put("endDate", end.toString().replace('-', '.'));
        root.put("launchDate", launch.toString().replace('-', '.'));

        ArrayNode rr = root.putArray("reviewRules");
        rr.add(rule("마일스톤별 검토 기간", "영업일 기준 3일 이내"));
        rr.add(rule("무상 수정 횟수", "총 3회 (디자인/기능 포함)"));
        rr.add(rule("피드백 지연 대응", "지연 일수만큼 자동 연장"));
        return root;
    }

    private ObjectNode phase(String num, String title, String desc, LocalDate date) {
        ObjectNode n = om.createObjectNode();
        n.put("num", num);
        n.put("title", title);
        n.put("desc", desc);
        n.put("date", date.toString().replace('-', '.'));
        n.put("weeks", "약 " + Math.max(1, java.time.temporal.ChronoUnit.WEEKS.between(LocalDate.now(), date)) + "주 소요");
        return n;
    }

    private ObjectNode rule(String label, String value) {
        ObjectNode n = om.createObjectNode();
        n.put("label", label);
        n.put("value", value);
        return n;
    }

    /** 4. 총 금액 및 정산 방식 (payment): {total, vatNote, stages[], bankName, bankNote, extraPolicies[]} */
    private ObjectNode buildPayment(Project p) {
        ObjectNode root = om.createObjectNode();
        long total = pickBudget(p);
        root.put("total", NumberFormat.getNumberInstance(Locale.KOREA).format(total));
        root.put("vatNote", "VAT 별도");

        long initial = (long)(total * 0.30);
        long middle  = (long)(total * 0.40);
        long balance = total - initial - middle;

        ArrayNode stages = root.putArray("stages");
        stages.add(stage("계약금 (30%)", "Initial", "₩" + fmt(initial), "계약 후 3일 이내"));
        stages.add(stage("중도금 (40%)", null,      "₩" + fmt(middle),  "1차 산출물 검수 완료 후"));
        stages.add(stage("잔금 (30%)",   null,      "₩" + fmt(balance), "최종 납품 및 검수 완료 후"));

        root.put("bankName", "계약 시 별도 안내");
        root.put("bankNote", "계좌 이체 · 일반 과세");

        ArrayNode policies = root.putArray("extraPolicies");
        policies.add("범위 외 요청: Man-month 실비 정산");
        policies.add("긴급 수정: 일괄 20% 할증 적용");
        return root;
    }

    private long pickBudget(Project p) {
        // budget* 컬럼은 원 단위로 저장됨. (구 데이터 만원 단위 → DataSeeder/마이그레이션이 ×10000 보정)
        if (p.getBudgetAmount() != null && p.getBudgetAmount() > 0) return (long) p.getBudgetAmount();
        if (p.getBudgetMin() != null && p.getBudgetMax() != null) return ((long)p.getBudgetMin() + p.getBudgetMax()) / 2;
        if (p.getBudgetMax() != null) return (long) p.getBudgetMax();
        if (p.getBudgetMin() != null) return (long) p.getBudgetMin();
        if (p.getMonthlyRate() != null && p.getContractMonths() != null) return (long) p.getMonthlyRate() * p.getContractMonths();
        return 10_000_000L;
    }

    private String fmt(long n) { return NumberFormat.getNumberInstance(Locale.KOREA).format(n); }

    private ObjectNode stage(String label, String tag, String amount, String desc) {
        ObjectNode n = om.createObjectNode();
        n.put("label", label);
        if (tag != null) n.put("tag", tag); else n.putNull("tag");
        n.put("amount", amount);
        n.put("desc", desc);
        return n;
    }

    /** 5. 수정 가능 범위 (revision): {freeItems[], paidItems[], memo} */
    private ObjectNode buildRevision(Project p) {
        ObjectNode root = om.createObjectNode();
        ArrayNode free = root.putArray("freeItems");
        free.add("단순 텍스트 문구 및 기배치 이미지의 교체");
        free.add("색상, 폰트 스타일 등 단순 UI/UX 스타일 가이드 조정");
        free.add("기존 기획안의 범주를 벗어나지 않는 마이너 업데이트");

        ArrayNode paid = root.putArray("paidItems");
        paid.add("최초 기획에 없던 신규 페이지 제작 및 대규모 기능 추가");
        paid.add("프로젝트 전체 디자인 컨셉 및 톤앤매너의 전면 재구축");
        paid.add("백엔드 로직의 근본적 변경 또는 DB 스키마 구조의 재설계");

        root.put("memo", "무상 수정 횟수는 총 3회로 제한됩니다. 횟수 초과 시 또는 유상 수정 기준에 해당하는 요청의 경우, 작업량 산정 후 별도의 추가 비용이 발생할 수 있습니다.");
        return root;
    }

    /** 6. 완료 기준 (completion): {steps[], criteria[], categories[]} */
    private ObjectNode buildCompletion(Project p) {
        ObjectNode root = om.createObjectNode();
        ArrayNode steps = root.putArray("steps");
        steps.add(step(1, "결과물 제출", "작업자가 마일스톤 완료 후 결과물을 시스템에 업로드"));
        steps.add(step(2, "상호 검수 및 수정", "의뢰자의 피드백에 따른 오류 수정 및 보완 작업 진행"));
        steps.add(step(3, "최종 승인 확정", "모든 조건 충족 시 의뢰자가 최종 완료 버튼 클릭"));

        ArrayNode criteria = root.putArray("criteria");
        criteria.add("명세서 기반 기능 전수 동작");
        criteria.add("주요 브라우저(Chrome, Safari) 호환성 확보");
        criteria.add("코드 리뷰 및 인수인계 문서 포함");

        ArrayNode cats = root.putArray("categories");
        cats.add(step(1, "API 명세서 전달", "합의된 모든 핵심 및 부가 API의 스웨거(Swagger) 기반 명세서 전달 완료."));
        cats.add(step(2, "기획/UI/UX 정밀 검수, 문서 첨부", "요구사항 상세 정의서(PRD), UI/UX/Figma 디자인 파일 최종안 전달 완료."));
        cats.add(step(3, "소스코드 리포지토리 전달", "Github 프라이빗 리포지토리의 모든 개발 코드 및 배포 스크립트 최종 푸시 완료."));
        cats.add(step(4, "운영 환경 테스트 완료", "합의된 테스트 시나리오에 따른 QA 및 베타 테스터 결과 보고서 제출 및 버그 수정 완료."));
        return root;
    }

    private ObjectNode step(int n, String title, String desc) {
        ObjectNode o = om.createObjectNode();
        o.put("n", n);
        o.put("title", title);
        o.put("desc", desc);
        return o;
    }

    /** 7. 추가 특약 (terms): {intro, terms[]} */
    private ObjectNode buildTerms(Project p) {
        ObjectNode root = om.createObjectNode();
        root.put("intro", "프로젝트의 원활한 진행과 상호 권리 보호를 위해 아래의 추가 특약 사항을 협의합니다.");
        ArrayNode terms = root.putArray("terms");
        terms.add(term("nda", "🛡", "보안 및 기밀 유지 (NDA)", true,
                List.of("프로젝트 관련 모든 내부 자료 및 산출물에 대한 제3자 유출 금지",
                        "위반 시 발생한 실제 손해에 대한 배상 책임 부담")));
        terms.add(term("ip", "©", "지식재산권 귀속", true,
                List.of("최종 대금 지급 완료 시 산출물에 대한 모든 저작권은 의뢰인에게 귀속",
                        "단, 작업자의 비상업적 목적 포트폴리오 활용 권한은 인정")));
        terms.add(term("dispute", "⚖", "분쟁 해결 및 관할", false,
                List.of("발생하는 분쟁은 상호 협의를 통해 해결함을 원칙으로 하되, 원만히 해결되지 않을 경우 서울중앙지방법원을 전속 관할로 합니다.")));
        terms.add(term("other", "···", "기타 특약", false,
                List.of("Communication: 계약 기간 내 상호 비방 금지 및 신의성실 원칙 준수",
                        "Handover: 프로젝트 종료 후 인수인계 기간 최소 1주일 보장")));
        return root;
    }

    private ObjectNode term(String id, String icon, String title, boolean enabled, List<String> items) {
        ObjectNode n = om.createObjectNode();
        n.put("id", id);
        n.put("icon", icon);
        n.put("title", title);
        n.put("enabled", enabled);
        ArrayNode arr = n.putArray("items");
        items.forEach(arr::add);
        return n;
    }

    private static String nz(String s, String fallback) { return (s == null || s.isBlank()) ? fallback : s; }
    private static String truncate(String s, int n) { return s.length() > n ? s.substring(0, n) + "…" : s; }
}
