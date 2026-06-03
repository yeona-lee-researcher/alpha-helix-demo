package com.DevBridge.devbridge.global.seed;

import com.DevBridge.devbridge.domain.user.entity.User;
import com.DevBridge.devbridge.domain.client.entity.ClientProfile;
import com.DevBridge.devbridge.domain.project.entity.ProjectApplication;
import com.DevBridge.devbridge.domain.project.entity.SkillMaster;
import com.DevBridge.devbridge.domain.project.entity.ProjectSkillMapping;
import com.DevBridge.devbridge.domain.chat.entity.ChatRoom;
import com.DevBridge.devbridge.domain.user.entity.*;
import com.DevBridge.devbridge.domain.client.entity.*;
import com.DevBridge.devbridge.domain.project.entity.*;
import com.DevBridge.devbridge.domain.chat.entity.*;
import com.DevBridge.devbridge.domain.notification.entity.*;
import com.DevBridge.devbridge.domain.payment.entity.*;
import com.DevBridge.devbridge.domain.strategy.entity.*;
import com.DevBridge.devbridge.domain.ai.entity.*;
import com.DevBridge.devbridge.domain.user.repository.*;
import com.DevBridge.devbridge.domain.client.repository.*;
import com.DevBridge.devbridge.domain.project.repository.*;
import com.DevBridge.devbridge.domain.chat.repository.*;
import com.DevBridge.devbridge.domain.notification.repository.*;
import com.DevBridge.devbridge.domain.payment.repository.*;
import com.DevBridge.devbridge.domain.strategy.repository.*;
import com.DevBridge.devbridge.domain.ai.repository.*;
import com.DevBridge.devbridge.domain.project.service.ContractModuleSeeder;
import com.DevBridge.devbridge.global.util.EnumMapper;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.CommandLineRunner;
import org.springframework.context.annotation.Profile;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.io.InputStream;
import java.time.LocalDate;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * ERD v2 mock JSON 시드 러너.
 * - 위치: classpath:seed/erd/*.json (build.gradle processResources에서 자동 복사)
 * - 멱등성: 각 테이블 count() > 0 이면 스킵
 * - 의존성 순서: skill_master → project_field_master → users → client_profile / partner_profile → partner_skill
 * - Phase 2 범위: 위 6개 테이블만 시드. 나머지는 Phase 3~5에서 추가.
 */
@Slf4j
@Component
@Profile("!prod")
@RequiredArgsConstructor
public class DataSeeder implements CommandLineRunner {

    private final SkillMasterRepository skillMasterRepository;
    private final ProjectFieldMasterRepository projectFieldMasterRepository;
    private final UserRepository userRepository;
    private final ClientProfileRepository clientProfileRepository;
    private final ClientProfileStatsRepository clientProfileStatsRepository;
    private final ClientPreferredSkillRepository clientPreferredSkillRepository;
    private final ProjectRepository projectRepository;
    private final ProjectTagRepository projectTagRepository;
    private final ProjectSkillMappingRepository projectSkillMappingRepository;
    private final ChatRoomRepository chatRoomRepository;
    private final ProjectApplicationRepository projectApplicationRepository;
    private final ContractModuleSeeder contractModuleSeeder;
    private final com.DevBridge.devbridge.domain.project.service.MilestoneSeedingService milestoneSeedingService;
    private final com.DevBridge.devbridge.global.seed.DataCleanupService dataCleanupService;
    private final com.DevBridge.devbridge.domain.project.repository.ProjectModuleRepository projectModuleRepository;

    private final ObjectMapper objectMapper = new ObjectMapper();

    // JSON 원본 id → 저장된 엔티티 PK 매핑 (FK 매핑용)
    private final Map<Long, Long> userIdMap = new HashMap<>();
    private final Map<Long, Long> skillIdMap = new HashMap<>();
    private final Map<Long, Long> clientProfileIdMap = new HashMap<>();
    private final Map<Long, Long> projectIdMap = new HashMap<>();

    @Override
    // 의도적으로 @Transactional 제거 — 거대한 outer 트랜잭션 안에서 일부 SQL 이 실패하면
    // rollback-only 마킹돼 마지막 commit 이 실패한다. 각 seedXxx() / cleanupXxx() / bootstrap*() 는
    // 내부에서 자체 트랜잭션을 관리하거나 REQUIRES_NEW 로 독립 커밋한다.
    public void run(String... args) throws Exception {
        log.info("===== DataSeeder 시작 =====");
        seedSkillMaster();
        seedProjectFieldMaster();
        seedUsers();
        seedClientProfile();
        seedClientProfileStats();
        seedClientPreferredSkill();
        seedProjects();
        seedProjectApplications();
        seedProjectTags();
        seedProjectSkillMapping();
        seedChatRooms();
        // 모든 기존 프로젝트에 7개 계약 협의 모듈(PROJECT_MODULES)이 채워져 있는지 확인하고
        // 비어있는 프로젝트에 대해 프로젝트 등록 정보 기반으로 자동 백필.
        try {
            int seeded = contractModuleSeeder.backfillAll();
            log.info("[DataSeeder] PROJECT_MODULES 백필: {} 프로젝트 시드됨", seeded);
        } catch (Exception e) {
            log.warn("[DataSeeder] PROJECT_MODULES 백필 실패: {}", e.getMessage());
        }

        // budget* 단위 마이그레이션: 만원 → 원 (×10000).
        // 휴리스틱: budget_amount/min/max 가 100,000 미만이면 만원 단위로 저장된 옛 데이터로 간주.
        // 100,000원 = 10만원. 실제 외주 프로젝트가 10만원 미만일 가능성은 거의 없으므로 안전한 임계.
        // 멱등성: 100,000 이상이면 원 단위로 이미 마이그레이션된 것으로 보고 skip.
        try {
            int migrated = migrateBudgetManToWon();
            if (migrated > 0) log.info("[DataSeeder] budget 단위 마이그레이션 (만원→원): {} 프로젝트", migrated);
        } catch (Exception e) {
            log.warn("[DataSeeder] budget 마이그레이션 실패: {}", e.getMessage());
        }

        // contractTerms (project 컬럼) → PROJECT_MODULES 백필.
        // 옛 등록 흐름에선 ContractModuleSeeder 가 기본 템플릿으로만 모듈을 시드해서
        // AI chat 의 협의 내용이 모듈에 반영 안 됨. 기본 시드 마커가 남아있는 모듈만 덮어씀
        // (사용자가 협의 중 수정한 모듈은 보존).
        try {
            int updated = backfillModulesFromContractTerms();
            if (updated > 0) log.info("[DataSeeder] contractTerms → PROJECT_MODULES 백필: {} 프로젝트", updated);
        } catch (Exception e) {
            log.warn("[DataSeeder] contractTerms 백필 실패: {}", e.getMessage());
        }

        // 모든 진행/완료/모집/마감 프로젝트에 대해 7개 모듈을 강제 협의완료로 마킹하고
        // 마일스톤이 비어있으면 phase/payment 기반으로 자동 시드. 멱등.
        // 시드/벌크 데이터로 들어온 100+ 프로젝트도 등록탭에서 만든 것처럼 마일스톤·금액·완료기준이 채워짐.
        try {
            int bootstrapped = milestoneSeedingService.bootstrapAll();
            log.info("[DataSeeder] 마일스톤 부트스트랩 완료: {} 프로젝트 변경됨", bootstrapped);
        } catch (Exception e) {
            log.warn("[DataSeeder] 마일스톤 부트스트랩 실패: {}", e.getMessage());
        }

        // 1회성 정리: 완전한 데이터(7개 모듈 + 마일스톤 + 예산) 가진 프로젝트 50개,
        // 클라이언트 50명, 파트너 50명만 남기고 나머지 종속 데이터까지 모두 삭제.
        // 멱등: 이미 50 이하면 skip → 매 startup 호출해도 추가 삭제 발생 안 함.
        // 주의: Spring AOP self-invocation 한계로 cleanupAll() 내부에서 REQUIRES_NEW 가
        //      무시되므로, 외부(여기)에서 각 cleanup 메서드를 직접 호출 → 진짜 독립 트랜잭션.
        int pr = 0, cr = 0, op = 0;
        try { pr = dataCleanupService.cleanupProjects(); }
        catch (Exception e) { log.warn("[DataSeeder] projects cleanup 실패: {}", e.getMessage()); }
        try { cr = dataCleanupService.cleanupClients(); }
        catch (Exception e) { log.warn("[DataSeeder] clients cleanup 실패: {}", e.getMessage()); }
        try { op = dataCleanupService.cleanupOrphans(); }
        catch (Exception e) { log.warn("[DataSeeder] orphan cleanup 실패: {}", e.getMessage()); }
        log.info("[DataSeeder] 데이터 정리: projects={}, clients={}, orphans={} 삭제됨", pr, cr, op);

        log.info("===== DataSeeder 완료 =====");
    }

    /**
     * 옛 흐름에서 PROJECT_MODULES 가 기본 템플릿으로만 채워진 프로젝트에 대해,
     * project.contract_terms (AI 생성) 의 내용을 모듈에 적용.
     * 휴리스틱: scope 모듈의 included 가 기본 템플릿 문구("핵심 기능 설계 및 구현") 를 그대로 포함하면 백필.
     */
    @Transactional
    private int backfillModulesFromContractTerms() {
        java.util.List<com.DevBridge.devbridge.domain.project.entity.Project> all = projectRepository.findAll();
        int updated = 0;
        com.fasterxml.jackson.databind.ObjectMapper om = new com.fasterxml.jackson.databind.ObjectMapper();
        for (com.DevBridge.devbridge.domain.project.entity.Project p : all) {
            String ctJson = p.getContractTerms();
            if (ctJson == null || ctJson.isBlank()) continue;

            // scope 모듈 확인
            com.DevBridge.devbridge.domain.project.entity.ProjectModule scopeMod =
                    projectModuleRepository.findByProjectIdAndModuleKey(p.getId(), "scope").orElse(null);
            if (scopeMod == null || scopeMod.getData() == null) continue;
            // 기본 템플릿 마커 검출
            if (!scopeMod.getData().contains("핵심 기능 설계 및 구현")) continue;

            try {
                java.util.Map<String, Object> ct = om.readValue(ctJson,
                        new com.fasterxml.jackson.core.type.TypeReference<java.util.Map<String, Object>>() {});
                contractModuleSeeder.applyContractTerms(p, ct);
                updated++;
            } catch (Exception e) {
                log.warn("[backfillModules] projectId={} 실패: {}", p.getId(), e.getMessage());
            }
        }
        return updated;
    }

    /** 100,000 미만의 budget 값(만원 단위로 추정)을 원 단위로 ×10000 변환. 멱등. */
    @Transactional
    private int migrateBudgetManToWon() {
        java.util.List<com.DevBridge.devbridge.domain.project.entity.Project> all = projectRepository.findAll();
        int migrated = 0;
        for (com.DevBridge.devbridge.domain.project.entity.Project p : all) {
            boolean changed = false;
            Integer ba = p.getBudgetAmount();
            if (ba != null && ba > 0 && ba < 100_000) {
                p.setBudgetAmount(ba * 10_000);
                changed = true;
            }
            Integer bMin = p.getBudgetMin();
            if (bMin != null && bMin > 0 && bMin < 100_000) {
                p.setBudgetMin(bMin * 10_000);
                changed = true;
            }
            Integer bMax = p.getBudgetMax();
            if (bMax != null && bMax > 0 && bMax < 100_000) {
                p.setBudgetMax(bMax * 10_000);
                changed = true;
            }
            if (changed) { projectRepository.save(p); migrated++; }
        }
        return migrated;
    }

    // ----------------------------------------------------
    // Chat Rooms
    // ----------------------------------------------------
    private void seedChatRooms() throws Exception {
        if (chatRoomRepository.count() > 0) {
            log.info("[chat_room] 스킵");
            return;
        }
        try {
            JsonNode arr = readJson("seed/erd/chat_rooms.json");
            int count = 0;
            for (JsonNode n : arr) {
                Long u1JsonId = n.get("user1_id").asLong();
                Long u2JsonId = n.get("user2_id").asLong();
                
                Long realU1Id = userIdMap.get(u1JsonId);
                Long realU2Id = userIdMap.get(u2JsonId);
                
                if (realU1Id == null || realU2Id == null) continue;
                
                User u1 = userRepository.findById(realU1Id).orElse(null);
                User u2 = userRepository.findById(realU2Id).orElse(null);
                
                if (u1 == null || u2 == null) continue;

                chatRoomRepository.save(ChatRoom.builder()
                        .user1(u1)
                        .user2(u2)
                        .roomType(ChatRoom.RoomType.valueOf(text(n, "room_type")))
                        .streamChannelId(text(n, "stream_channel_id"))
                        .streamChannelType(textOr(n, "stream_channel_type", "messaging"))
                        .build());
                count++;
            }
            log.info("[chat_room] {} rows 시드 완료", count);
        } catch (Exception e) {
            log.warn("[chat_room] 시드 파일 처리 중 오류(파일이 없을 수 있음): {}", e.getMessage());
        }
    }

    // ----------------------------------------------------
    // Master
    // ----------------------------------------------------
    private void seedSkillMaster() throws Exception {
        if (skillMasterRepository.count() > 0) {
            log.info("[skill_master] 이미 데이터 존재 → 스킵 (count={})", skillMasterRepository.count());
            // 기존 매핑 복원 (이름 기준)
            skillMasterRepository.findAll().forEach(s -> skillIdMap.put((long) s.getId().intValue(), s.getId()));
            // 위 라인은 id가 1부터라고 가정 시 동작하지만, 정확한 매핑은 JSON 재로딩 필요.
            // 안전을 위해 JSON에서 다시 읽어 매핑.
            JsonNode arr = readJson("seed/erd/skill_master.json");
            for (JsonNode n : arr) {
                Long jsonId = n.get("id").asLong();
                String name = n.get("name").asText();
                skillMasterRepository.findByName(name).ifPresent(s -> skillIdMap.put(jsonId, s.getId()));
            }
            return;
        }
        JsonNode arr = readJson("seed/erd/skill_master.json");
        int count = 0;
        for (JsonNode n : arr) {
            Long jsonId = n.get("id").asLong();
            SkillMaster saved = skillMasterRepository.save(SkillMaster.builder()
                    .name(n.get("name").asText())
                    .build());
            skillIdMap.put(jsonId, saved.getId());
            count++;
        }
        log.info("[skill_master] {} rows 시드 완료", count);
    }

    private void seedProjectFieldMaster() throws Exception {
        if (projectFieldMasterRepository.count() > 0) {
            log.info("[project_field_master] 스킵");
            return;
        }
        JsonNode arr = readJson("seed/erd/project_field_master.json");
        int count = 0;
        for (JsonNode n : arr) {
            projectFieldMasterRepository.save(ProjectFieldMaster.builder()
                    .parentCategory(text(n, "parent_category"))
                    .fieldName(text(n, "field_name"))
                    .build());
            count++;
        }
        log.info("[project_field_master] {} rows 시드 완료", count);
    }

    // ----------------------------------------------------
    // Users
    // ----------------------------------------------------
    private void seedUsers() throws Exception {
        if (userRepository.count() > 0) {
            log.info("[users] 이미 데이터 존재 → 스킵 (count={})", userRepository.count());
            // user_id 매핑 복원 (email 기준)
            JsonNode arr = readJson("seed/erd/users.json");
            for (JsonNode n : arr) {
                String email = n.get("email").asText();
                Long jsonId = n.get("id").asLong();
                userRepository.findByEmail(email).ifPresent(u -> userIdMap.put(jsonId, u.getId()));
            }
            return;
        }
        JsonNode arr = readJson("seed/erd/users.json");
        int count = 0;
        for (JsonNode n : arr) {
            Long jsonId = n.get("id").asLong();
            User saved = userRepository.save(User.builder()
                    .email(text(n, "email"))
                    .phone(text(n, "phone"))
                    .username(text(n, "username"))
                    .password(text(n, "password"))
                    .userType(EnumMapper.userType(text(n, "user_type")))
                    .contactEmail(text(n, "contact_email"))
                    .gender(EnumMapper.gender(text(n, "gender")))
                    .birthDate(parseDate(text(n, "birth_date")))
                    .region(text(n, "region"))
                    .taxEmail(text(n, "tax_email"))
                    .bankName(text(n, "bank_name"))
                    .bankAccountNumber(text(n, "bank_account_number"))
                    .bankAccountHolderName(text(n, "bank_account_holder_name"))
                    .profileImageUrl(text(n, "profile_image_url"))
                    .build());
            userIdMap.put(jsonId, saved.getId());
            count++;
        }
        log.info("[users] {} rows 시드 완료", count);
    }

    // ----------------------------------------------------
    // Client Profile
    // ----------------------------------------------------
    private void seedClientProfile() throws Exception {
        if (clientProfileRepository.count() > 0) {
            log.info("[client_profile] 스킵");
            // 매핑 복원
            JsonNode arr = readJson("seed/erd/client_profile.json");
            for (JsonNode n : arr) {
                Long jsonId = n.get("id").asLong();
                Long userJsonId = n.get("user_id").asLong();
                Long realUserId = userIdMap.get(userJsonId);
                if (realUserId == null) continue;
                clientProfileRepository.findAll().stream()
                        .filter(c -> c.getUser().getId().equals(realUserId))
                        .findFirst()
                        .ifPresent(c -> clientProfileIdMap.put(jsonId, c.getId()));
            }
            return;
        }
        JsonNode arr = readJson("seed/erd/client_profile.json");
        int count = 0;
        for (JsonNode n : arr) {
            Long jsonId = n.get("id").asLong();
            Long userJsonId = n.get("user_id").asLong();
            Long realUserId = userIdMap.get(userJsonId);
            if (realUserId == null) continue;
            User user = userRepository.findById(realUserId).orElse(null);
            if (user == null) continue;

            ClientProfile saved = clientProfileRepository.save(ClientProfile.builder()
                    .user(user)
                    .clientType(EnumMapper.clientType(text(n, "client_type")))
                    .industry(text(n, "industry"))
                    .grade(EnumMapper.grade(text(n, "grade")))
                    .sloganSub(text(n, "slogan_sub"))
                    .bio(text(n, "bio"))
                    .strengthDesc(text(n, "strength_desc"))
                    .preferredLevels(jsonString(n, "preferred_levels"))
                    .preferredWorkType(intOrNull(n, "preferred_work_type"))
                    .budgetMin(intOrNull(n, "budget_min"))
                    .budgetMax(intOrNull(n, "budget_max"))
                    .avgProjectBudget(intOrNull(n, "avg_project_budget"))
                    .avatarColor(text(n, "avatar_color"))
                    .build());
            clientProfileIdMap.put(jsonId, saved.getId());
            count++;
        }
        log.info("[client_profile] {} rows 시드 완료", count);
    }

    // ----------------------------------------------------
    // Client Profile Stats
    // ----------------------------------------------------
    private void seedClientProfileStats() throws Exception {
        if (clientProfileStatsRepository.count() > 0) {
            log.info("[client_profile_stats] 스킵");
            return;
        }
        JsonNode arr = readJson("seed/erd/client_profile_stats.json");
        int count = 0;
        for (JsonNode n : arr) {
            Long cpJsonId = n.get("client_profile_id").asLong();
            Long realCpId = clientProfileIdMap.get(cpJsonId);
            if (realCpId == null) continue;
            ClientProfile cp = clientProfileRepository.findById(realCpId).orElse(null);
            if (cp == null) continue;

            clientProfileStatsRepository.save(ClientProfileStats.builder()
                    .clientProfile(cp)
                    .completedProjects(intOrNull(n, "completed_projects"))
                    .postedProjects(intOrNull(n, "posted_projects"))
                    .rating(n.hasNonNull("rating") ? n.get("rating").asDouble() : null)
                    .repeatRate(intOrNull(n, "repeat_rate"))
                    .build());
            count++;
        }
        log.info("[client_profile_stats] {} rows 시드 완료", count);
    }

    // ----------------------------------------------------
    // Client Preferred Skill (N:M)
    // ----------------------------------------------------
    private void seedClientPreferredSkill() throws Exception {
        if (clientPreferredSkillRepository.count() > 0) {
            log.info("[client_preferred_skill] 스킵");
            return;
        }
        JsonNode arr = readJson("seed/erd/client_preferred_skill.json");
        int count = 0;
        for (JsonNode n : arr) {
            Long cpJsonId = n.get("client_profile_id").asLong();
            Long skillJsonId = n.get("skill_id").asLong();
            Long realCpId = clientProfileIdMap.get(cpJsonId);
            Long realSkillId = skillIdMap.get(skillJsonId);
            if (realCpId == null || realSkillId == null) continue;
            ClientProfile cp = clientProfileRepository.findById(realCpId).orElse(null);
            SkillMaster sm = skillMasterRepository.findById(realSkillId).orElse(null);
            if (cp == null || sm == null) continue;

            clientPreferredSkillRepository.save(ClientPreferredSkill.builder()
                    .clientProfile(cp)
                    .skill(sm)
                    .build());
            count++;
        }
        log.info("[client_preferred_skill] {} rows 시드 완료", count);
    }

    // ----------------------------------------------------
    // Projects
    // ----------------------------------------------------
    private void seedProjects() throws Exception {
        if (projectRepository.count() > 0) {
            log.info("[projects] 스킵");
            // 매핑 복원: title+user_id 조합으로 (PK가 같은 순서로 들어갔다고 가정)
            JsonNode arr = readJson("seed/erd/projects.json");
            List<Project> existing = projectRepository.findAll();
            int idx = 0;
            for (JsonNode n : arr) {
                if (idx >= existing.size()) break;
                projectIdMap.put(n.get("id").asLong(), existing.get(idx).getId());
                idx++;
            }
            return;
        }
        JsonNode arr = readJson("seed/erd/projects.json");
        int count = 0;
        for (JsonNode n : arr) {
            Long jsonId = n.get("id").asLong();
            Long userJsonId = n.get("user_id").asLong();
            Long realUserId = userIdMap.get(userJsonId);
            if (realUserId == null) continue;
            User user = userRepository.findById(realUserId).orElse(null);
            if (user == null) continue;

            Project saved = projectRepository.save(Project.builder()
                    .user(user)
                    .projectType(EnumMapper.projectType(text(n, "project_type")))
                    .title(textOr(n, "title", "(제목 없음)"))
                    .slogan(text(n, "slogan"))
                    .sloganSub(text(n, "slogan_sub"))
                    .desc(text(n, "desc"))
                    .serviceField(text(n, "service_field"))
                    .grade(EnumMapper.grade(text(n, "grade")))
                    .workScope(jsonString(n, "work_scope"))
                    .category(jsonString(n, "category"))
                    .referenceFileUrl(text(n, "reference_file_url"))
                    .visibility(EnumMapper.visibility(text(n, "visibility")))
                    .budgetMin(intOrNull(n, "budget_min"))
                    .budgetMax(intOrNull(n, "budget_max"))
                    .budgetAmount(intOrNull(n, "budget_amount"))
                    .isPartnerFree(boolOrNull(n, "is_partner_free"))
                    .startDateNegotiable(boolOrNull(n, "start_date_negotiable"))
                    .startDate(parseDate(text(n, "start_date")))
                    .durationMonths(intOrNull(n, "duration_months"))
                    .scheduleNegotiable(boolOrNull(n, "schedule_negotiable"))
                    .detailContent(text(n, "detail_content"))
                    .meetingType(EnumMapper.meetingType(text(n, "meeting_type")))
                    .meetingFreq(EnumMapper.meetingFreq(text(n, "meeting_freq")))
                    .meetingTools(jsonString(n, "meeting_tools"))
                    .deadline(parseDate(text(n, "deadline")))
                    .govSupport(boolOrNull(n, "gov_support"))
                    .reqTags(jsonString(n, "req_tags"))
                    .questions(jsonString(n, "questions"))
                    .itExp(boolOrNull(n, "it_exp"))
                    .collabPlanning(intOrNull(n, "collab_planning"))
                    .collabDesign(intOrNull(n, "collab_design"))
                    .collabPublishing(intOrNull(n, "collab_publishing"))
                    .collabDev(intOrNull(n, "collab_dev"))
                    .additionalFileUrl(text(n, "additional_file_url"))
                    .additionalComment(text(n, "additional_comment"))
                    .status(EnumMapper.projectStatus(text(n, "status")))
                    .avatarColor(text(n, "avatar_color"))
                    .outsourceProjectType(EnumMapper.outsourceProjectType(text(n, "outsource_project_type")))
                    .readyStatus(EnumMapper.readyStatus(text(n, "ready_status")))
                    .workStyle(EnumMapper.workStyle(text(n, "work_style")))
                    .workLocation(text(n, "work_location"))
                    .workDays(EnumMapper.workDays(text(n, "work_days")))
                    .workHours(EnumMapper.workHours(text(n, "work_hours")))
                    .contractMonths(intOrNull(n, "contract_months"))
                    .monthlyRate(intOrNull(n, "monthly_rate"))
                    .devStage(EnumMapper.devStage(text(n, "dev_stage")))
                    .teamSize(EnumMapper.teamSize(text(n, "team_size")))
                    .currentStacks(jsonString(n, "current_stacks"))
                    .currentStatus(text(n, "current_status"))
                    .build());
            projectIdMap.put(jsonId, saved.getId());
            count++;
        }
        log.info("[projects] {} rows 시드 완료", count);
    }

    private void seedProjectTags() throws Exception {
        if (projectTagRepository.count() > 0) {
            log.info("[project_tags] 스킵");
            return;
        }
        JsonNode arr = readJson("seed/erd/project_tags.json");
        int count = 0;
        for (JsonNode n : arr) {
            Long projJsonId = n.get("project_id").asLong();
            Long realProjId = projectIdMap.get(projJsonId);
            if (realProjId == null) continue;
            Project p = projectRepository.findById(realProjId).orElse(null);
            if (p == null) continue;

            projectTagRepository.save(ProjectTag.builder()
                    .project(p)
                    .tag(textOr(n, "tag", ""))
                    .build());
            count++;
        }
        log.info("[project_tags] {} rows 시드 완료", count);
    }

    private void seedProjectSkillMapping() throws Exception {
        if (projectSkillMappingRepository.count() > 0) {
            log.info("[project_skill_mapping] 스킵");
            return;
        }
        JsonNode arr = readJson("seed/erd/project_skill_mapping.json");
        int count = 0;
        for (JsonNode n : arr) {
            Long projJsonId = n.get("project_id").asLong();
            Long skillJsonId = n.get("skill_id").asLong();
            Long realProjId = projectIdMap.get(projJsonId);
            Long realSkillId = skillIdMap.get(skillJsonId);
            if (realProjId == null || realSkillId == null) continue;
            Project p = projectRepository.findById(realProjId).orElse(null);
            SkillMaster sm = skillMasterRepository.findById(realSkillId).orElse(null);
            if (p == null || sm == null) continue;

            Boolean req = boolOrNull(n, "is_required");
            projectSkillMappingRepository.save(ProjectSkillMapping.builder()
                    .project(p)
                    .skill(sm)
                    .isRequired(req != null ? req : true)
                    .build());
            count++;
        }
        log.info("[project_skill_mapping] {} rows 시드 완료", count);
    }

    // ----------------------------------------------------
    // Project Applications
    // ----------------------------------------------------
    private void seedProjectApplications() throws Exception {
        if (projectApplicationRepository.count() > 0) {
            log.info("[project_application] 스킵");
            return;
        }
        JsonNode arr = readJson("seed/erd/project_application.json");
        int count = 0;
        for (JsonNode n : arr) {
            Long projJsonId    = n.get("project_id").asLong();
            Long partnerJsonId = n.get("partner_user_id").asLong();
            Long realProjId    = projectIdMap.get(projJsonId);
            Long realPartnerId = userIdMap.get(partnerJsonId);
            if (realProjId == null || realPartnerId == null) continue;
            Project project = projectRepository.findById(realProjId).orElse(null);
            User    partner = userRepository.findById(realPartnerId).orElse(null);
            if (project == null || partner == null) continue;
            ProjectApplication.Status status = ProjectApplication.Status.valueOf(
                    n.get("status").asText("COMPLETED"));
            projectApplicationRepository.save(ProjectApplication.builder()
                    .project(project)
                    .partnerUser(partner)
                    .status(status)
                    .build());
            count++;
        }
        log.info("[project_application] {} rows 시드 완료", count);
    }

    // ----------------------------------------------------
    // Helpers
    // ----------------------------------------------------
    private JsonNode readJson(String classpathLocation) throws Exception {
        try (InputStream is = new ClassPathResource(classpathLocation).getInputStream()) {
            return objectMapper.readTree(is);
        }
    }

    private static String text(JsonNode n, String field) {
        JsonNode v = n.get(field);
        if (v == null || v.isNull()) return null;
        return v.asText();
    }

    private static String textOr(JsonNode n, String field, String def) {
        String t = text(n, field);
        return t == null ? def : t;
    }

    private static Integer intOrNull(JsonNode n, String field) {
        JsonNode v = n.get(field);
        if (v == null || v.isNull()) return null;
        return v.asInt();
    }

    private static Boolean boolOrNull(JsonNode n, String field) {
        JsonNode v = n.get(field);
        if (v == null || v.isNull()) return null;
        return v.asBoolean();
    }

    private static String jsonString(JsonNode n, String field) {
        JsonNode v = n.get(field);
        if (v == null || v.isNull()) return null;
        return v.toString();
    }

    private static LocalDate parseDate(String s) {
        if (s == null || s.isBlank()) return null;
        try {
            return LocalDate.parse(s);
        } catch (Exception e) {
            return null;
        }
    }
}

