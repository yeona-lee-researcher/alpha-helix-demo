package com.DevBridge.devbridge.domain.project.service;

import com.DevBridge.devbridge.domain.project.service.MilestoneSeedingService;
import com.DevBridge.devbridge.domain.user.entity.User;
import com.DevBridge.devbridge.domain.project.entity.Project;
import com.DevBridge.devbridge.domain.project.entity.SkillMaster;
import com.DevBridge.devbridge.domain.project.entity.ProjectSkillMapping;
import com.DevBridge.devbridge.domain.project.dto.ProjectCreateRequest;
import com.DevBridge.devbridge.domain.project.dto.ProjectSummaryResponse;
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
import com.DevBridge.devbridge.global.util.EnumMapper;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.*;
import java.util.stream.Collectors;

@Slf4j
@Service
@RequiredArgsConstructor
public class ProjectService {

    private final ProjectRepository projectRepository;
    private final ProjectTagRepository projectTagRepository;
    private final ProjectSkillMappingRepository projectSkillMappingRepository;
    private final UserRepository userRepository;
    private final SkillMasterRepository skillMasterRepository;
    private final ContractModuleSeeder contractModuleSeeder;
    private final ProjectModuleRepository projectModuleRepository;
    private final MilestoneSeedingService milestoneSeedingService;

    private static final ObjectMapper OM = new ObjectMapper();

    /** SQL-level 페이지네이션 — projects 에서 limit/offset 만큼만 SELECT, 그 ID 들에 대해서만 tag/skill/module 로드. */
    @Transactional(readOnly = true)
    public List<ProjectSummaryResponse> findPage(int limit, int offset, String sort) {
        int safeLimit  = Math.max(1, Math.min(limit, 1000));
        int safeOffset = Math.max(0, offset);
        Sort.Direction dir = "latest".equalsIgnoreCase(sort) ? Sort.Direction.DESC : Sort.Direction.ASC;
        int pageIndex = safeOffset / safeLimit;
        var pageable = PageRequest.of(pageIndex, safeLimit, Sort.by(dir, "id"));
        List<Project> page = projectRepository.findAllWithUserPaged(pageable);
        return enrichAndMap(page);
    }

    private List<ProjectSummaryResponse> enrichAndMap(List<Project> all) {
        if (all.isEmpty()) return Collections.emptyList();
        Map<Long, List<String>> tagsByProject = projectTagRepository
                .findAllByProjects(all).stream()
                .collect(Collectors.groupingBy(
                        pt -> pt.getProject().getId(),
                        Collectors.mapping(ProjectTag::getTag, Collectors.toList())));
        Map<Long, List<ProjectSkillMapping>> mappingsByProject = projectSkillMappingRepository
                .findAllByProjects(all).stream()
                .collect(Collectors.groupingBy(m -> m.getProject().getId()));
        Map<Long, Map<String, Object>> modulesByProject = loadModulesGrouped(
                all.stream().map(Project::getId).collect(Collectors.toList()));
        return all.stream()
                .map(p -> toSummary(p,
                        tagsByProject.getOrDefault(p.getId(), Collections.emptyList()),
                        mappingsByProject.getOrDefault(p.getId(), Collections.emptyList()),
                        modulesByProject.get(p.getId())))
                .collect(Collectors.toList());
    }

    @Transactional(readOnly = true)
    public List<ProjectSummaryResponse> findAll() {
        List<Project> all = projectRepository.findAllWithUser();
        if (all.isEmpty()) return Collections.emptyList();

        Map<Long, List<String>> tagsByProject = projectTagRepository
                .findAllByProjects(all).stream()
                .collect(Collectors.groupingBy(
                        pt -> pt.getProject().getId(),
                        Collectors.mapping(ProjectTag::getTag, Collectors.toList())));

        Map<Long, List<ProjectSkillMapping>> mappingsByProject = projectSkillMappingRepository
                .findAllByProjects(all).stream()
                .collect(Collectors.groupingBy(m -> m.getProject().getId()));

        Map<Long, Map<String, Object>> modulesByProject = loadModulesGrouped(
                all.stream().map(Project::getId).collect(Collectors.toList()));

        return all.stream()
                .map(p -> toSummary(p,
                        tagsByProject.getOrDefault(p.getId(), Collections.emptyList()),
                        mappingsByProject.getOrDefault(p.getId(), Collections.emptyList()),
                        modulesByProject.get(p.getId())))
                .collect(Collectors.toList());
    }

    /** 특정 사용자가 등록한 프로젝트 목록 (대시보드 '시작 전 프로젝트' 탭 등). */
    @Transactional(readOnly = true)
    public List<ProjectSummaryResponse> findAllByUserId(Long userId) {
        List<Project> all = projectRepository.findAllByUserId(userId);
        if (all.isEmpty()) return Collections.emptyList();

        Map<Long, List<String>> tagsByProject = projectTagRepository
                .findAllByProjects(all).stream()
                .collect(Collectors.groupingBy(
                        pt -> pt.getProject().getId(),
                        Collectors.mapping(ProjectTag::getTag, Collectors.toList())));

        Map<Long, List<ProjectSkillMapping>> mappingsByProject = projectSkillMappingRepository
                .findAllByProjects(all).stream()
                .collect(Collectors.groupingBy(m -> m.getProject().getId()));

        Map<Long, Map<String, Object>> modulesByProject = loadModulesGrouped(
                all.stream().map(Project::getId).collect(Collectors.toList()));

        return all.stream()
                .map(p -> toSummary(p,
                        tagsByProject.getOrDefault(p.getId(), Collections.emptyList()),
                        mappingsByProject.getOrDefault(p.getId(), Collections.emptyList()),
                        modulesByProject.get(p.getId())))
                .collect(Collectors.toList());
    }

    /** username으로 사용자가 등록한 프로젝트 목록 조회 (채팅 - 상대 프로젝트 카드 보여주기용). */
    @Transactional(readOnly = true)
    public List<ProjectSummaryResponse> findAllByUsername(String username) {
        User user = userRepository.findByUsername(username)
                .orElseThrow(() -> new RuntimeException("사용자를 찾을 수 없습니다. username=" + username));
        return findAllByUserId(user.getId());
    }

    @Transactional(readOnly = true)
    public ProjectSummaryResponse findById(Long id) {
        Project p = projectRepository.findById(id)
                .orElseThrow(() -> new RuntimeException("프로젝트를 찾을 수 없습니다. id=" + id));
        List<String> tags = projectTagRepository.findByProject(p).stream()
                .map(ProjectTag::getTag)
                .collect(Collectors.toList());
        List<ProjectSkillMapping> mappings = projectSkillMappingRepository.findByProject(p);
        Map<String, Object> modulesMap = loadModulesGrouped(List.of(p.getId())).get(p.getId());
        return toSummary(p, tags, mappings, modulesMap);
    }

    /**
     * 새 프로젝트 등록.
     * @param userId 등록자 (JWT에서 추출)
     */
    @Transactional
    public ProjectSummaryResponse create(Long userId, ProjectCreateRequest req) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new RuntimeException("등록자를 찾을 수 없습니다. id=" + userId));

        Project project = Project.builder()
                .user(user)
                .projectType(EnumMapper.projectType(req.getProjectType()))
                .title(req.getTitle() != null ? req.getTitle() : "(제목 없음)")
                .slogan(req.getSlogan())
                .sloganSub(req.getSloganSub())
                .desc(req.getDesc())
                .detailContent(req.getDetailContent())
                .serviceField(req.getServiceField())
                .grade(EnumMapper.grade(req.getGrade()))
                .workScope(toJson(req.getWorkScope()))
                .category(toJson(req.getCategory()))
                .referenceFileUrl(req.getReferenceFileUrl())
                .visibility(EnumMapper.visibility(req.getVisibility()))
                .budgetMin(req.getBudgetMin())
                .budgetMax(req.getBudgetMax())
                .budgetAmount(req.getBudgetAmount())
                .isPartnerFree(req.getIsPartnerFree())
                .startDateNegotiable(req.getStartDateNegotiable())
                .startDate(req.getStartDate())
                .durationMonths(req.getDurationMonths())
                .scheduleNegotiable(req.getScheduleNegotiable())
                .meetingType(EnumMapper.meetingType(req.getMeetingType()))
                .meetingFreq(EnumMapper.meetingFreq(req.getMeetingFreq()))
                .meetingTools(toJson(req.getMeetingTools()))
                .deadline(req.getDeadline())
                .govSupport(req.getGovSupport())
                .reqTags(toJson(req.getReqTags()))
                .questions(toJson(req.getQuestions()))
                .itExp(req.getItExp())
                .collabPlanning(req.getCollabPlanning())
                .collabDesign(req.getCollabDesign())
                .collabPublishing(req.getCollabPublishing())
                .collabDev(req.getCollabDev())
                .additionalFileUrl(req.getAdditionalFileUrl())
                .additionalComment(req.getAdditionalComment())
                .status(Project.ProjectStatus.RECRUITING)
                .avatarColor(req.getAvatarColor() != null ? req.getAvatarColor() : "#3B82F6")
                .outsourceProjectType(EnumMapper.outsourceProjectType(req.getOutsourceProjectType()))
                .readyStatus(EnumMapper.readyStatus(req.getReadyStatus()))
                .workStyle(EnumMapper.workStyle(req.getWorkStyle()))
                .workLocation(req.getWorkLocation())
                .workDays(EnumMapper.workDays(req.getWorkDays()))
                .workHours(EnumMapper.workHours(req.getWorkHours()))
                .contractMonths(req.getContractMonths())
                .monthlyRate(req.getMonthlyRate())
                .devStage(EnumMapper.devStage(req.getDevStage()))
                .teamSize(EnumMapper.teamSize(req.getTeamSize()))
                .currentStacks(toJson(req.getCurrentStacks()))
                .currentStatus(req.getCurrentStatus())
                .contractTerms(toJsonObject(req.getContractTerms()))
                .build();

        Project saved = projectRepository.save(project);

        // 태그
        if (req.getTags() != null) {
            for (String tag : req.getTags()) {
                if (tag == null || tag.isBlank()) continue;
                projectTagRepository.save(ProjectTag.builder()
                        .project(saved)
                        .tag(tag)
                        .build());
            }
        }

        // 필수 스킬
        saveSkills(saved, req.getRequiredSkills(), true);
        // 우대 스킬
        saveSkills(saved, req.getPreferredSkills(), false);

        // 7개 계약 협의 모듈 자동 시드 (PROJECT_MODULES) — 프로젝트 등록 정보로부터 파생
        try {
            contractModuleSeeder.seedForProject(saved);
        } catch (Exception e) {
            // 모듈 시드 실패가 프로젝트 등록 자체를 막지는 않도록 swallow
            org.slf4j.LoggerFactory.getLogger(ProjectService.class)
                    .warn("[ProjectService] contract module seed failed for project {}: {}", saved.getId(), e.getMessage());
        }
        // AI chat 등에서 contractTerms 가 함께 들어왔으면 해당 모듈 data 를 AI 내용으로 덮어쓴다.
        // (기본 시드값 → AI 협의 내용 우선)
        try {
            if (req.getContractTerms() != null && !req.getContractTerms().isEmpty()) {
                contractModuleSeeder.applyContractTerms(saved, req.getContractTerms());
            }
        } catch (Exception e) {
            org.slf4j.LoggerFactory.getLogger(ProjectService.class)
                    .warn("[ProjectService] contractTerms 적용 실패 projectId={}: {}", saved.getId(), e.getMessage());
        }

        // 마일스톤은 7개 모듈 협의완료 여부와 무관하게 schedule/payment 모듈 데이터로 즉시 시드.
        // AI 채팅으로 만들어진 contractTerms 가 이미 모듈에 반영되어 있으므로, 등록 직후
        // 진행 관리 대시보드에 마일스톤·금액·완료기준이 채워진 상태로 보임.
        try {
            milestoneSeedingService.seedIfNeeded(saved.getId());
        } catch (Exception e) {
            org.slf4j.LoggerFactory.getLogger(ProjectService.class)
                    .warn("[ProjectService] 마일스톤 시드 실패 projectId={}: {}", saved.getId(), e.getMessage());
        }

        List<String> savedTags = projectTagRepository.findByProject(saved).stream()
                .map(ProjectTag::getTag)
                .collect(Collectors.toList());
        List<ProjectSkillMapping> savedMappings = projectSkillMappingRepository.findByProject(saved);
        return toSummary(saved, savedTags, savedMappings, null);
    }

    /** 프로젝트 삭제 (작성자 본인만 가능). */
    @Transactional
    public void delete(Long userId, Long projectId) {
        Project p = projectRepository.findById(projectId)
                .orElseThrow(() -> new RuntimeException("프로젝트를 찾을 수 없습니다. id=" + projectId));
        if (p.getUser() == null || !Objects.equals(p.getUser().getId(), userId)) {
            throw new RuntimeException("본인이 등록한 프로젝트만 삭제할 수 있습니다.");
        }
        // 연관 데이터 정리
        projectTagRepository.deleteAll(projectTagRepository.findByProject(p));
        projectSkillMappingRepository.deleteAll(projectSkillMappingRepository.findByProject(p));
        projectRepository.delete(p);
    }

    /** 프로젝트 status 만 단순 변경 (작성자 본인만). */
    @Transactional
    public ProjectSummaryResponse updateStatus(Long userId, Long projectId, String statusName) {
        Project p = projectRepository.findById(projectId)
                .orElseThrow(() -> new RuntimeException("프로젝트를 찾을 수 없습니다. id=" + projectId));
        if (p.getUser() == null || !Objects.equals(p.getUser().getId(), userId)) {
            throw new RuntimeException("본인이 등록한 프로젝트만 변경할 수 있습니다.");
        }
        Project.ProjectStatus target;
        try {
            target = Project.ProjectStatus.valueOf(statusName);
        } catch (IllegalArgumentException e) {
            throw new RuntimeException("알 수 없는 status: " + statusName);
        }
        // IN_PROGRESS 전이는 7개 협의 모듈이 모두 "협의완료"여야 허용
        // (RECRUITING/CLOSED/COMPLETED 전이엔 적용되지 않음)
        if (target == Project.ProjectStatus.IN_PROGRESS) {
            List<ProjectModule> mods = projectModuleRepository.findByProjectId(projectId);
            long agreed = mods.stream()
                    .filter(m -> "협의완료".equals(m.getStatus()))
                    .count();
            if (mods.size() < 7 || agreed < 7) {
                throw new RuntimeException(
                        "7개 협의 모듈(범위·산출물·일정·결제·수정·완료·조항)이 모두 '협의완료'되어야 진행 상태로 전이할 수 있습니다. (현재 협의완료: "
                                + agreed + "/7)");
            }
        }
        p.setStatus(target);
        Project saved = projectRepository.save(p);

        // IN_PROGRESS 전이 시: 협의 모듈(schedule.phases + payment.stages + deliverable.deliverables) 로부터
        // 마일스톤이 비어 있으면 자동 시드. 멱등(이미 있으면 skip).
        if (target == Project.ProjectStatus.IN_PROGRESS) {
            try { milestoneSeedingService.seedIfNeeded(projectId); }
            catch (Exception e) { log.warn("[ProjectService] 마일스톤 자동 시드 실패 projectId={}: {}", projectId, e.getMessage()); }
        }
        List<String> tags = projectTagRepository.findByProject(saved).stream()
                .map(t -> t.getTag()).toList();
        List<ProjectSkillMapping> mappings = projectSkillMappingRepository.findByProject(saved);
        return toSummary(saved, tags, mappings, null);
    }

    /** 프로젝트 수정 (작성자 본인만 가능). 태그/스킬은 delete-then-insert 방식. */
    @Transactional
    public ProjectSummaryResponse update(Long userId, Long projectId, ProjectCreateRequest req) {
        Project p = projectRepository.findById(projectId)
                .orElseThrow(() -> new RuntimeException("프로젝트를 찾을 수 없습니다. id=" + projectId));
        if (p.getUser() == null || !Objects.equals(p.getUser().getId(), userId)) {
            throw new RuntimeException("본인이 등록한 프로젝트만 수정할 수 있습니다.");
        }

        if (req.getProjectType() != null) p.setProjectType(EnumMapper.projectType(req.getProjectType()));
        if (req.getTitle() != null) p.setTitle(req.getTitle());
        p.setSlogan(req.getSlogan());
        p.setSloganSub(req.getSloganSub());
        p.setDesc(req.getDesc());
        p.setDetailContent(req.getDetailContent());
        p.setServiceField(req.getServiceField());
        if (req.getGrade() != null) p.setGrade(EnumMapper.grade(req.getGrade()));
        p.setWorkScope(toJson(req.getWorkScope()));
        p.setCategory(toJson(req.getCategory()));
        p.setReferenceFileUrl(req.getReferenceFileUrl());
        if (req.getVisibility() != null) p.setVisibility(EnumMapper.visibility(req.getVisibility()));
        p.setBudgetMin(req.getBudgetMin());
        p.setBudgetMax(req.getBudgetMax());
        p.setBudgetAmount(req.getBudgetAmount());
        p.setIsPartnerFree(req.getIsPartnerFree());
        p.setStartDateNegotiable(req.getStartDateNegotiable());
        p.setStartDate(req.getStartDate());
        p.setDurationMonths(req.getDurationMonths());
        p.setScheduleNegotiable(req.getScheduleNegotiable());
        p.setMeetingType(EnumMapper.meetingType(req.getMeetingType()));
        p.setMeetingFreq(EnumMapper.meetingFreq(req.getMeetingFreq()));
        p.setMeetingTools(toJson(req.getMeetingTools()));
        p.setDeadline(req.getDeadline());
        p.setGovSupport(req.getGovSupport());
        p.setReqTags(toJson(req.getReqTags()));
        p.setQuestions(toJson(req.getQuestions()));
        p.setItExp(req.getItExp());
        p.setCollabPlanning(req.getCollabPlanning());
        p.setCollabDesign(req.getCollabDesign());
        p.setCollabPublishing(req.getCollabPublishing());
        p.setCollabDev(req.getCollabDev());
        p.setAdditionalFileUrl(req.getAdditionalFileUrl());
        p.setAdditionalComment(req.getAdditionalComment());
        if (req.getAvatarColor() != null) p.setAvatarColor(req.getAvatarColor());
        p.setOutsourceProjectType(EnumMapper.outsourceProjectType(req.getOutsourceProjectType()));
        p.setReadyStatus(EnumMapper.readyStatus(req.getReadyStatus()));
        p.setWorkStyle(EnumMapper.workStyle(req.getWorkStyle()));
        p.setWorkLocation(req.getWorkLocation());
        p.setWorkDays(EnumMapper.workDays(req.getWorkDays()));
        p.setWorkHours(EnumMapper.workHours(req.getWorkHours()));
        p.setContractMonths(req.getContractMonths());
        p.setMonthlyRate(req.getMonthlyRate());
        p.setDevStage(EnumMapper.devStage(req.getDevStage()));
        p.setTeamSize(EnumMapper.teamSize(req.getTeamSize()));
        p.setCurrentStacks(toJson(req.getCurrentStacks()));
        p.setCurrentStatus(req.getCurrentStatus());
        p.setContractTerms(toJsonObject(req.getContractTerms()));

        Project saved = projectRepository.save(p);

        // 태그/스킬 재구성 (delete-then-insert)
        projectTagRepository.deleteAll(projectTagRepository.findByProject(saved));
        if (req.getTags() != null) {
            for (String tag : req.getTags()) {
                if (tag == null || tag.isBlank()) continue;
                projectTagRepository.save(ProjectTag.builder().project(saved).tag(tag).build());
            }
        }
        projectSkillMappingRepository.deleteAll(projectSkillMappingRepository.findByProject(saved));
        saveSkills(saved, req.getRequiredSkills(), true);
        saveSkills(saved, req.getPreferredSkills(), false);

        List<String> savedTags = projectTagRepository.findByProject(saved).stream()
                .map(ProjectTag::getTag)
                .collect(Collectors.toList());
        List<ProjectSkillMapping> savedMappings = projectSkillMappingRepository.findByProject(saved);
        return toSummary(saved, savedTags, savedMappings, null);
    }

    private void saveSkills(Project project, List<String> skillNames, boolean isRequired) {
        if (skillNames == null) return;
        for (String name : skillNames) {
            if (name == null || name.isBlank()) continue;
            SkillMaster sm = skillMasterRepository.findByName(name)
                    .orElseGet(() -> skillMasterRepository.save(SkillMaster.builder().name(name).build()));
            try {
                projectSkillMappingRepository.save(ProjectSkillMapping.builder()
                        .project(project)
                        .skill(sm)
                        .isRequired(isRequired)
                        .build());
            } catch (Exception ignored) {
                // unique 제약 위반 (동일 스킬 중복 입력) 무시
            }
        }
    }

    private static String toJson(List<String> list) {
        if (list == null || list.isEmpty()) return null;
        try {
            return OM.writeValueAsString(list);
        } catch (Exception e) {
            return null;
        }
    }

    /** 임의 Map/Object → JSON 스트링. */
    private static String toJsonObject(Object obj) {
        if (obj == null) return null;
        try {
            return OM.writeValueAsString(obj);
        } catch (Exception e) {
            return null;
        }
    }

    /** JSON 스트링 → Map (실패 시 null). */
    @SuppressWarnings("unchecked")
    private static java.util.Map<String, Object> fromJsonMap(String json) {
        if (json == null || json.isBlank()) return null;
        try {
            return OM.readValue(json, java.util.Map.class);
        } catch (Exception e) {
            return null;
        }
    }

    /**
     * project_modules 테이블의 7개 row 를 projectId → {moduleKey: data(JSON parsed)} 형태로 묶어 반환.
     * findAll() / findAllByUserId() 에서 N+1 방지용으로 한 번에 fetch.
     */
    private Map<Long, Map<String, Object>> loadModulesGrouped(List<Long> projectIds) {
        if (projectIds == null || projectIds.isEmpty()) return Collections.emptyMap();
        Map<Long, Map<String, Object>> result = new HashMap<>();
        for (Long pid : projectIds) {
            List<ProjectModule> mods = projectModuleRepository.findByProjectId(pid);
            if (mods.isEmpty()) continue;
            Map<String, Object> map = new LinkedHashMap<>();
            for (ProjectModule m : mods) {
                Object parsed = fromJsonMap(m.getData());
                if (parsed == null) continue;
                map.put(m.getModuleKey(), parsed);
            }
            if (!map.isEmpty()) result.put(pid, map);
        }
        return result;
    }

    /**
     * contractTerms 응답 결정:
     *   1) projects.contract_terms 컬럼이 있으면 그대로 사용 (기존 등록 흐름 호환)
     *   2) 없으면 project_modules 7개 row 로 합성한 map 반환
     */
    private Map<String, Object> resolveContractTerms(Project p, Map<String, Object> moduleMap) {
        Map<String, Object> fromColumn = fromJsonMap(p.getContractTerms());
        if (fromColumn != null && !fromColumn.isEmpty()) return fromColumn;
        return moduleMap;
    }

    private ProjectSummaryResponse toSummary(Project p, List<String> tags, List<ProjectSkillMapping> mappings, Map<String, Object> moduleMap) {
        User author = p.getUser();

        List<String> required = mappings.stream()
                .filter(m -> Boolean.TRUE.equals(m.getIsRequired()))
                .map(m -> m.getSkill().getName())
                .collect(Collectors.toList());
        List<String> preferred = mappings.stream()
                .filter(m -> !Boolean.TRUE.equals(m.getIsRequired()))
                .map(m -> m.getSkill().getName())
                .collect(Collectors.toList());
        List<String> all = mappings.stream()
                .map(m -> m.getSkill().getName())
                .collect(Collectors.toList());

        Integer durationDays = p.getDurationMonths() != null ? p.getDurationMonths() * 30 : null;

        return ProjectSummaryResponse.builder()
                .id(p.getId())
                .clientId(author != null ? author.getUsername() : null)
                .avatarColor(p.getAvatarColor())
                .title(p.getTitle())
                .slogan(p.getSlogan())
                .sloganSub(p.getSloganSub())
                .desc(p.getDesc())
                .tags(tags)
                .serviceField(p.getServiceField())
                .workPref(workPrefLabel(p))
                .priceType(Boolean.TRUE.equals(p.getIsPartnerFree()) ? "무료" : "유료")
                .remote(p.getWorkStyle() == Project.WorkStyle.REMOTE
                        || p.getWorkStyle() == Project.WorkStyle.HYBRID)
                .level("전체")
                .grade(p.getGrade() != null ? p.getGrade().name().toLowerCase() : "silver")
                .match(computeMatch(p))
                .price(formatPrice(p))
                .period(p.getDurationMonths() != null ? p.getDurationMonths() + "개월" : "협의")
                .verifications(Collections.emptyList())
                .status(statusLabel(p.getStatus()))
                .budgetMin(p.getBudgetMin())
                .budgetMax(p.getBudgetMax())
                .durationDays(durationDays)
                .deadline(p.getDeadline())
                .expectedStartDate(p.getStartDate())
                .workPrefCode(workPrefCode(p))
                .projectType(p.getProjectType() != null ? p.getProjectType().name().toLowerCase() : "outsource")
                .requiredSkills(required)
                .preferredSkills(preferred)
                .skillSet(all)
                .contractTerms(resolveContractTerms(p, moduleMap))
                .build();
    }

    private static String workPrefLabel(Project p) {
        if (p.getWorkStyle() != null) {
            return switch (p.getWorkStyle()) {
                case ONSITE -> "상주";
                case REMOTE -> "재택";
                case HYBRID -> "하이브리드";
            };
        }
        // 외주 프로젝트는 work_style 없음
        return "협의";
    }

    private static Integer workPrefCode(Project p) {
        if (p.getWorkStyle() == null) return 2; // 협의
        return switch (p.getWorkStyle()) {
            case REMOTE -> 1;
            case HYBRID -> 2;
            case ONSITE -> 0;
        };
    }

    private static String statusLabel(Project.ProjectStatus s) {
        if (s == null) return "모집중";
        return switch (s) {
            case RECRUITING -> "모집중";
            case IN_PROGRESS -> "진행중";
            case COMPLETED -> "완료";
            case CLOSED -> "마감";
        };
    }

    private static String formatPrice(Project p) {
        // budget_min/budget_max 는 만원 단위 저장 (seed SQL 기준).
        // budget_amount/monthly_rate 는 원 단위 저장 → 표시 시 /10000.
        if (p.getBudgetMin() != null && p.getBudgetMax() != null) {
            if (p.getBudgetMin() == 0 && p.getBudgetMax() == 0) return "협의";
            return String.format("%,d~%,d만원", p.getBudgetMin(), p.getBudgetMax());
        }
        if (p.getBudgetAmount() != null && p.getBudgetAmount() > 0) {
            return String.format("%,d만원", p.getBudgetAmount() / 10000);
        }
        if (p.getMonthlyRate() != null) {
            return String.format("%,d만원/월", p.getMonthlyRate() / 10000);
        }
        return "협의";
    }

    private static Integer computeMatch(Project p) {
        if (p == null || p.getId() == null) return 70;
        return 60 + (int) ((p.getId() * 11 + 7) % 40);
    }

}

