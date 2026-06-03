package com.DevBridge.devbridge.global.util;

import com.DevBridge.devbridge.domain.client.entity.ClientProfile;
import com.DevBridge.devbridge.domain.project.entity.Project;
import com.DevBridge.devbridge.domain.user.entity.User;

/**
 * ERD v2 JSON의 소문자 enum 문자열을 백엔드 UPPERCASE enum으로 변환.
 * - 정합표: docs/ERD_v2_enum_alignment.md
 */
public final class EnumMapper {

    private EnumMapper() {}

    public static User.UserType userType(String s) {
        if (s == null) return null;
        return switch (s.toLowerCase()) {
            case "client", "user", "free" -> User.UserType.FREE;
            case "partner", "pro", "standard" -> User.UserType.STANDARD;
            case "premium" -> User.UserType.PREMIUM;
            default -> null;
        };
    }

    public static User.Gender gender(String s) {
        if (s == null) return null;
        return switch (s.toLowerCase()) {
            case "male" -> User.Gender.MALE;
            case "female" -> User.Gender.FEMALE;
            case "other" -> User.Gender.OTHER;
            default -> null;
        };
    }

    /**
     * ERD: personal/business/corporate → 백엔드 4단계.
     * personal → INDIVIDUAL (기본), business → SOLE_PROPRIETOR, corporate → CORPORATION.
     */
    public static ClientProfile.ClientType clientType(String s) {
        if (s == null) return ClientProfile.ClientType.INDIVIDUAL;
        return switch (s.toLowerCase()) {
            case "personal" -> ClientProfile.ClientType.INDIVIDUAL;
            case "business" -> ClientProfile.ClientType.SOLE_PROPRIETOR;
            case "corporate" -> ClientProfile.ClientType.CORPORATION;
            case "team" -> ClientProfile.ClientType.TEAM;
            default -> ClientProfile.ClientType.INDIVIDUAL;
        };
    }

    public static ClientProfile.Grade grade(String s) {
        if (s == null) return ClientProfile.Grade.SILVER;
        return switch (s.toLowerCase()) {
            case "bronze", "silver" -> ClientProfile.Grade.SILVER;
            case "gold" -> ClientProfile.Grade.GOLD;
            case "platinum" -> ClientProfile.Grade.PLATINUM;
            case "diamond" -> ClientProfile.Grade.DIAMOND;
            default -> ClientProfile.Grade.SILVER;
        };
    }


    // ========== Project enums ==========

    public static Project.ProjectType projectType(String s) {
        if (s == null) return Project.ProjectType.OUTSOURCE;
        return switch (s.toLowerCase()) {
            case "outsource" -> Project.ProjectType.OUTSOURCE;
            case "fulltime" -> Project.ProjectType.FULLTIME;
            default -> Project.ProjectType.OUTSOURCE;
        };
    }

    public static Project.OutsourceProjectType outsourceProjectType(String s) {
        if (s == null) return null;
        return switch (s.toLowerCase()) {
            case "new" -> Project.OutsourceProjectType.NEW;
            case "maintenance" -> Project.OutsourceProjectType.MAINTENANCE;
            default -> null;
        };
    }

    public static Project.ReadyStatus readyStatus(String s) {
        if (s == null) return null;
        return switch (s.toLowerCase()) {
            case "idea" -> Project.ReadyStatus.IDEA;
            case "document" -> Project.ReadyStatus.DOCUMENT;
            case "design" -> Project.ReadyStatus.DESIGN;
            case "code" -> Project.ReadyStatus.CODE;
            default -> null;
        };
    }

    public static Project.Visibility visibility(String s) {
        if (s == null) return Project.Visibility.PUBLIC;
        return switch (s.toLowerCase()) {
            case "public" -> Project.Visibility.PUBLIC;
            case "applicants" -> Project.Visibility.APPLICANTS;
            case "private" -> Project.Visibility.PRIVATE;
            default -> Project.Visibility.PUBLIC;
        };
    }

    public static Project.WorkStyle workStyle(String s) {
        if (s == null) return null;
        return switch (s.toLowerCase()) {
            case "onsite" -> Project.WorkStyle.ONSITE;
            case "remote" -> Project.WorkStyle.REMOTE;
            case "hybrid" -> Project.WorkStyle.HYBRID;
            default -> null;
        };
    }

    public static Project.WorkDays workDays(String s) {
        if (s == null) return null;
        return switch (s.toLowerCase()) {
            case "3", "three", "three_days" -> Project.WorkDays.THREE_DAYS;
            case "4", "four", "four_days" -> Project.WorkDays.FOUR_DAYS;
            case "5", "five", "five_days" -> Project.WorkDays.FIVE_DAYS;
            case "flexible" -> Project.WorkDays.FLEXIBLE;
            default -> null;
        };
    }

    public static Project.WorkHours workHours(String s) {
        if (s == null) return null;
        return switch (s.toLowerCase()) {
            case "morning" -> Project.WorkHours.MORNING;
            case "afternoon" -> Project.WorkHours.AFTERNOON;
            case "flexible" -> Project.WorkHours.FLEXIBLE;
            case "fulltime" -> Project.WorkHours.FULLTIME;
            default -> null;
        };
    }

    public static Project.DevStage devStage(String s) {
        if (s == null) return null;
        return switch (s.toLowerCase()) {
            case "planning" -> Project.DevStage.PLANNING;
            case "development" -> Project.DevStage.DEVELOPMENT;
            case "beta" -> Project.DevStage.BETA;
            case "operating" -> Project.DevStage.OPERATING;
            case "maintenance" -> Project.DevStage.MAINTENANCE;
            default -> null;
        };
    }

    public static Project.TeamSize teamSize(String s) {
        if (s == null) return null;
        return switch (s.toLowerCase()) {
            case "1-5", "size_1_5" -> Project.TeamSize.SIZE_1_5;
            case "6-10", "size_6_10" -> Project.TeamSize.SIZE_6_10;
            case "11-30", "size_11_30" -> Project.TeamSize.SIZE_11_30;
            case "31-50", "size_31_50" -> Project.TeamSize.SIZE_31_50;
            case "50+", "size_50_plus" -> Project.TeamSize.SIZE_50_PLUS;
            default -> null;
        };
    }

    public static Project.MeetingType meetingType(String s) {
        if (s == null) return null;
        return switch (s.toLowerCase()) {
            case "online" -> Project.MeetingType.ONLINE;
            case "offline" -> Project.MeetingType.OFFLINE;
            case "hybrid" -> Project.MeetingType.HYBRID;
            default -> null;
        };
    }

    public static Project.MeetingFreq meetingFreq(String s) {
        if (s == null) return null;
        return switch (s.toLowerCase()) {
            case "daily" -> Project.MeetingFreq.DAILY;
            case "weekly" -> Project.MeetingFreq.WEEKLY;
            case "biweekly" -> Project.MeetingFreq.BIWEEKLY;
            case "monthly" -> Project.MeetingFreq.MONTHLY;
            default -> null;
        };
    }

    public static Project.ProjectStatus projectStatus(String s) {
        if (s == null) return Project.ProjectStatus.RECRUITING;
        return switch (s.toLowerCase()) {
            case "recruiting" -> Project.ProjectStatus.RECRUITING;
            case "in_progress" -> Project.ProjectStatus.IN_PROGRESS;
            case "completed" -> Project.ProjectStatus.COMPLETED;
            case "closed" -> Project.ProjectStatus.CLOSED;
            default -> Project.ProjectStatus.RECRUITING;
        };
    }
}

