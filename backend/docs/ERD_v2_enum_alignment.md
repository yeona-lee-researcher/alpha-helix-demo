# ERD v2 ↔ 기존 백엔드 Enum 정합표

> **방침**: 기존 백엔드 Java enum 값을 **그대로 유지**하고, ERD v2 문서/시드 JSON/프론트엔드를 이 표에 맞춰 정렬한다.
> (2026-04-18 결정)

---

## 1. User 도메인

### `users.user_type`
| ERD v2 (이전) | **백엔드 enum (기준)** | 매핑 |
|---|---|---|
| `client` | `CLIENT` | `User.UserType.CLIENT` |
| `partner` | `PARTNER` | `User.UserType.PARTNER` |

### `users.gender`
| ERD v2 (이전) | **백엔드 enum (기준)** |
|---|---|
| `male` | `MALE` |
| `female` | `FEMALE` |
| `other` | `OTHER` |

### `users` 컬럼 정합
- ❗ ERD v2 명세에 `created_at`, `updated_at` 컬럼 **없음**으로 되어 있으나, 기존 엔티티에는 `@CreatedDate`, `@UpdateTimestamp`로 존재 → **기존 엔티티 유지**.

---

## 2. Client 도메인

### `client_profile.client_type`
ERD v2의 3가지(`personal/business/corporate`)는 기존 4종으로 **세분화**된 형태를 유지한다.

| ERD v2 | **백엔드 enum (기준)** | AuthService 한글 매핑 |
|---|---|---|
| `personal` | `INDIVIDUAL` | "개인" |
| `personal` | `TEAM` | "팀" |
| `business` | `SOLE_PROPRIETOR` | "개인 사업자" |
| `corporate` | `CORPORATION` | "법인사업자" |

### `client_profile.grade` (ERD v2 NEW)
| ERD v2 | **백엔드 enum (PartnerProfile.Grade 재사용)** |
|---|---|
| `bronze` | (도입 보류, 기존 4단계 사용) |
| `silver` | `SILVER` |
| `gold` | `GOLD` |
| `platinum` | `PLATINUM` |
| `diamond` | `DIAMOND` |

> 추후 `bronze` 추가 필요시 `Grade` enum에 한 줄 추가만 하면 됨.

---

## 3. Partner 도메인

### `partner_profile.work_category`
| ERD v2 | **백엔드 enum (기준)** | 한글 매핑 |
|---|---|---|
| `dev` | `DEVELOP` | "개발" |
| `planning` | `PLANNING` | "기획" |
| `design` | `DESIGN` | "디자인" |
| `publishing` | `DISTRIBUTION` | "배포" |

### `partner_profile.partner_type`
| ERD v2 | **백엔드 enum** |
|---|---|
| `individual` | `INDIVIDUAL` |
| `team` | `TEAM` |
| `company` | `SOLE_PROPRIETOR` 또는 `CORPORATION` |

### `partner_profile.preferred_project_type`
| ERD v2 | **백엔드 enum** |
|---|---|
| `outsource` | `FREELANCE` |
| `fulltime` | `CONTRACT_BASED` |
| `both` | (도입 보류) |

### `partner_profile.dev_level`
| ERD v2 | **백엔드 enum (5단계 유지)** |
|---|---|
| `junior` | `JUNIOR` |
| `middle` | `MIDDLE` |
| `senior` | `SENIOR_5_7Y`, `SENIOR_7_10Y` (2단계로 세분화) |
| `lead` | `LEAD` |

### `partner_profile.dev_experience`
| ERD v2 | **백엔드 enum** |
|---|---|
| `0-1` | `UND_1Y` |
| `1-3` | `EXP_1_3Y` |
| `3-5` | `EXP_3_5Y` |
| `5-10` | `EXP_5_7Y` |
| `10+` | `OVER_7Y` |

### `partner_profile.work_preference`
| ERD v2 | **백엔드 enum** |
|---|---|
| `remote` | `REMOTE` |
| `onsite` | `ONSITE` |
| `hybrid` | `HYBRID` |
| `any` | (도입 보류) |

### `partner_profile.grade` (이미 엔티티 존재)
- `SILVER`, `GOLD`, `PLATINUM`, `DIAMOND` (4단계, default=`SILVER`)

---

## 4. Project 도메인 (신규 도입 예정)

다음 enum은 **신규 도입**하며, 기존 패턴(UPPER_SNAKE_CASE)을 따른다.

```java
// projects.project_type
public enum ProjectType { OUTSOURCE, FULLTIME }

// projects.outsource_project_type (외주 전용)
public enum OutsourceProjectType { NEW, MAINTENANCE }

// projects.ready_status (외주 전용)
public enum ReadyStatus { IDEA, DOCUMENT, DESIGN, CODE }

// projects.visibility
public enum Visibility { PUBLIC, APPLICANTS, PRIVATE }

// projects.work_style (상주 전용)
public enum WorkStyle { ONSITE, REMOTE, HYBRID }

// projects.work_days (상주 전용)
public enum WorkDays { THREE_DAYS, FOUR_DAYS, FIVE_DAYS, FLEXIBLE }

// projects.work_hours (상주 전용)
public enum WorkHours { MORNING, AFTERNOON, FLEXIBLE, FULLTIME }

// projects.dev_stage (상주 전용)
public enum DevStage { PLANNING, DEVELOPMENT, BETA, OPERATING, MAINTENANCE }

// projects.team_size (상주 전용)
public enum TeamSize { SIZE_1_5, SIZE_6_10, SIZE_11_30, SIZE_31_50, SIZE_50_PLUS }

// projects.meeting_type
public enum MeetingType { ONLINE, OFFLINE, HYBRID }

// projects.meeting_freq
public enum MeetingFreq { DAILY, WEEKLY, BIWEEKLY, MONTHLY }

// projects.status
public enum ProjectStatus { RECRUITING, IN_PROGRESS, COMPLETED, CLOSED }
```

---

## 5. 신규 검증/스킬 enum

```java
// user_verifications.verification_type
public enum VerificationType { IDENTITY, BUSINESS, EVALUATION }

// user_verifications.status
public enum VerificationStatus { PENDING, VERIFIED, REJECTED }

// *_advanced_skills.proficiency_level
public enum ProficiencyLevel { BEGINNER, INTERMEDIATE, ADVANCED, EXPERT }

// *_advanced_skills.experience_years (DevExperience와 별개로 단순화 5단계)
public enum AdvancedExperience { EXP_0_1, EXP_1_3, EXP_3_5, EXP_5_PLUS }
```

---

## 시드 JSON 변환 가이드

`frontend/src/data/erd/*.json`을 백엔드로 시드할 때:

1. **소문자 enum (예: `"client"`)** → `request.toUpperCase()` 후 `valueOf()` 사용
2. **하이픈 포함 (예: `"3-5"`)** → `mapDevExperience()` 같은 헬퍼로 변환
3. **세분화 필요한 값**:
   - `client_type=personal` → mock 데이터 컨텍스트(개인/팀)에 따라 `INDIVIDUAL` 또는 `TEAM` 선택
   - `client_type=business` → 기본 `SOLE_PROPRIETOR`
   - `dev_level=senior` → 기본 `SENIOR_5_7Y`
4. **누락 enum** (`bronze`, `both`, `any`) → 가장 가까운 기존 값으로 매핑하거나 `null`

