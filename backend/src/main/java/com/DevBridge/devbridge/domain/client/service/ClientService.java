package com.DevBridge.devbridge.domain.client.service;

import com.DevBridge.devbridge.domain.user.entity.User;
import com.DevBridge.devbridge.domain.user.entity.UserProfileDetail;
import com.DevBridge.devbridge.domain.client.entity.ClientProfile;
import com.DevBridge.devbridge.domain.client.dto.ClientSummaryResponse;
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
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.*;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class ClientService {

    private final ClientProfileRepository clientProfileRepository;
    private final ClientProfileStatsRepository clientProfileStatsRepository;
    private final ClientPreferredSkillRepository clientPreferredSkillRepository;
    private final UserProfileDetailRepository userProfileDetailRepository;

    private static final ObjectMapper OM = new ObjectMapper();

    /** SQL-level 페이지네이션 — limit/offset 만큼만 client_profile 에서 조회. */
    @Transactional(readOnly = true)
    public List<ClientSummaryResponse> findPage(int limit, int offset, String sort) {
        int safeLimit  = Math.max(1, Math.min(limit, 1000));
        int safeOffset = Math.max(0, offset);
        Sort.Direction dir = "latest".equalsIgnoreCase(sort) ? Sort.Direction.DESC : Sort.Direction.ASC;
        int pageIndex = safeOffset / safeLimit;
        var pageable = PageRequest.of(pageIndex, safeLimit, Sort.by(dir, "id"));
        return enrichAndMap(clientProfileRepository.findAllWithUserPaged(pageable));
    }

    private List<ClientSummaryResponse> enrichAndMap(List<ClientProfile> all) {
        if (all.isEmpty()) return Collections.emptyList();
        Map<Long, List<String>> skillsByProfile = clientPreferredSkillRepository
                .findAllByClientProfiles(all).stream()
                .collect(Collectors.groupingBy(
                        ps -> ps.getClientProfile().getId(),
                        Collectors.mapping(ps -> ps.getSkill().getName(), Collectors.toList())));
        Map<Long, ClientProfileStats> statsByProfile = clientProfileStatsRepository
                .findAllByClientProfiles(all).stream()
                .collect(Collectors.toMap(s -> s.getClientProfile().getId(), s -> s));
        List<Long> userIds = all.stream()
                .map(cp -> cp.getUser() != null ? cp.getUser().getId() : null)
                .filter(Objects::nonNull)
                .collect(Collectors.toList());
        Map<Long, String> shortBioByUserId = userIds.isEmpty()
                ? Collections.emptyMap()
                : userProfileDetailRepository.findAllByUserIdIn(userIds).stream()
                        .filter(d -> d.getUser() != null && d.getShortBio() != null && !d.getShortBio().isBlank())
                        .collect(Collectors.toMap(d -> d.getUser().getId(), UserProfileDetail::getShortBio, (a, b) -> a));
        return all.stream()
                .map(cp -> toSummary(cp,
                        skillsByProfile.getOrDefault(cp.getId(), Collections.emptyList()),
                        statsByProfile.get(cp.getId()),
                        cp.getUser() != null ? shortBioByUserId.get(cp.getUser().getId()) : null))
                .collect(Collectors.toList());
    }

    @Transactional(readOnly = true)
    public List<ClientSummaryResponse> findAll() {
        List<ClientProfile> all = clientProfileRepository.findAllWithUser();
        if (all.isEmpty()) return Collections.emptyList();

        Map<Long, List<String>> skillsByProfile = clientPreferredSkillRepository
                .findAllByClientProfiles(all).stream()
                .collect(Collectors.groupingBy(
                        ps -> ps.getClientProfile().getId(),
                        Collectors.mapping(ps -> ps.getSkill().getName(), Collectors.toList())));

        Map<Long, ClientProfileStats> statsByProfile = clientProfileStatsRepository
                .findAllByClientProfiles(all).stream()
                .collect(Collectors.toMap(s -> s.getClientProfile().getId(), s -> s));

        // UserProfileDetail.shortBio (사용자가 프로필 편집기에서 입력한 한줄 자기소개) 우선 사용
        List<Long> userIds = all.stream()
                .map(cp -> cp.getUser() != null ? cp.getUser().getId() : null)
                .filter(Objects::nonNull)
                .collect(Collectors.toList());
        Map<Long, String> shortBioByUserId = userIds.isEmpty()
                ? Collections.emptyMap()
                : userProfileDetailRepository.findAllByUserIdIn(userIds).stream()
                        .filter(d -> d.getUser() != null && d.getShortBio() != null && !d.getShortBio().isBlank())
                        .collect(Collectors.toMap(d -> d.getUser().getId(), UserProfileDetail::getShortBio, (a, b) -> a));

        return all.stream()
                .map(cp -> toSummary(cp,
                        skillsByProfile.getOrDefault(cp.getId(), Collections.emptyList()),
                        statsByProfile.get(cp.getId()),
                        cp.getUser() != null ? shortBioByUserId.get(cp.getUser().getId()) : null))
                .collect(Collectors.toList());
    }

    @Transactional(readOnly = true)
    public ClientSummaryResponse findById(Long id) {
        ClientProfile cp = clientProfileRepository.findById(id)
                .orElseThrow(() -> new RuntimeException("클라이언트를 찾을 수 없습니다. id=" + id));
        List<String> prefSkills = clientPreferredSkillRepository.findByClientProfile(cp).stream()
                .map(s -> s.getSkill().getName())
                .collect(Collectors.toList());
        ClientProfileStats stats = clientProfileStatsRepository.findByClientProfile(cp).orElse(null);
        String detailShortBio = cp.getUser() != null
                ? userProfileDetailRepository.findByUserId(cp.getUser().getId())
                        .map(UserProfileDetail::getShortBio)
                        .filter(s -> s != null && !s.isBlank())
                        .orElse(null)
                : null;
        return toSummary(cp, prefSkills, stats, detailShortBio);
    }

    private ClientSummaryResponse toSummary(ClientProfile cp, List<String> prefSkills, ClientProfileStats stats, String detailShortBio) {
        User user = cp.getUser();
        List<String> prefLevels = parseJsonStringList(cp.getPreferredLevels());

        Double effectiveRating = stats != null ? stats.getRating() : null;

        // 표시명은 항상 username 으로 통일 (회원가입 시 이름 입력 없음)
        String username = user != null ? user.getUsername() : null;

        // Hero 이미지 경로 생성
        String heroPath = cp.getHeroKey() != null && !cp.getHeroKey().isBlank()
                ? "/hero/" + cp.getHeroKey()
                : "/hero/hero_check.png";

        return ClientSummaryResponse.builder()
                .id(cp.getId())
                .username(username)
                .name(username)
                .sloganSub(cp.getSloganSub())
                .shortBio(detailShortBio != null ? detailShortBio : cp.getShortBio())
                .bio(cp.getBio())
                .strengthDesc(cp.getStrengthDesc())
                .industry(cp.getIndustry())
                .clientType(clientTypeLabel(cp.getClientType()))
                .grade(cp.getGrade() != null ? cp.getGrade().name().toLowerCase() : "silver")
                .preferredLevels(prefLevels)
                .preferredWorkType(cp.getPreferredWorkType())
                .workPrefLabel(workPrefLabel(cp.getPreferredWorkType()))
                .remote(cp.getPreferredWorkType() != null && cp.getPreferredWorkType() == 1)
                .budgetMin(cp.getBudgetMin())
                .budgetMax(cp.getBudgetMax())
                .avgProjectBudget(cp.getAvgProjectBudget())
                .avatarColor(cp.getAvatarColor())
                .heroImg(heroPath)
                .profileImageUrl(user != null ? user.getProfileImageUrl() : null)
                .preferredSkills(prefSkills)
                .match(computeMatch(cp, stats))
                .rating(effectiveRating)
                .completedProjects(stats != null ? stats.getCompletedProjects() : 0)
                .postedProjects(stats != null ? stats.getPostedProjects() : 0)
                .repeatRate(stats != null ? stats.getRepeatRate() : 0)
                .email(user != null ? (user.getContactEmail() != null ? user.getContactEmail() : user.getEmail()) : null)
                .phone(user != null ? user.getPhone() : null)
                .build();
    }

    private static String clientTypeLabel(ClientProfile.ClientType t) {
        if (t == null) return "개인";
        return switch (t) {
            case INDIVIDUAL -> "개인";
            case TEAM -> "팀";
            case SOLE_PROPRIETOR -> "개인사업자";
            case CORPORATION -> "법인사업자";
        };
    }

    private static String workPrefLabel(Integer code) {
        if (code == null) return "대면 선호";
        return switch (code) {
            case 1 -> "원격 선호";
            case 2 -> "혼합 가능";
            default -> "대면 선호";
        };
    }

    /** 매칭 점수: rating * 6 + completedProjects * 0.3, 60~99 클램프. */
    private static Integer computeMatch(ClientProfile cp, ClientProfileStats stats) {
        double rating = stats != null && stats.getRating() != null ? stats.getRating() : 4.0;
        int completed = stats != null && stats.getCompletedProjects() != null ? stats.getCompletedProjects() : 0;
        long base = (cp.getId() != null ? cp.getId() : 0L);
        int score = (int) Math.round(60 + rating * 6 + completed * 0.3 + (base % 5));
        return Math.min(99, Math.max(60, score));
    }

    @SuppressWarnings("unchecked")
    private static List<String> parseJsonStringList(String json) {
        if (json == null || json.isBlank()) return Collections.emptyList();
        try {
            return OM.readValue(json, new TypeReference<List<String>>() {});
        } catch (Exception e) {
            return Collections.emptyList();
        }
    }
}

