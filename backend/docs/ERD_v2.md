# DevBridge ERD v2

> 프론트엔드의 mock 데이터(`mockClients.json`, `mockPartners.json`, `mockProjects.json`, `mockInterestProjects.json`, `mockInterestPartners.json`) 요구사항을 **모두** 반영한 스키마.
> 원본 ERD(`erd_ex.png`) 테이블명을 최대한 유지하면서, 프론트에서 필요한 도메인을 보완한 v2.
>
> Mock JSON 위치: `frontend/src/data/erd/*.json`

---

## 테이블 목록 (24개)

### [User 도메인]
1. [users](#1-users)
2. [user_verifications](#2-user_verifications) *NEW*
3. [user_interest_projects](#3-user_interest_projects) *NEW*
4. [user_interest_partners](#4-user_interest_partners) *NEW*

### [Client 도메인]
5. [client_profile](#5-client_profile) *확장*
6. [client_profile_detail](#6-client_profile_detail) *NEW*
7. [client_profile_stats](#7-client_profile_stats) *NEW*
8. [client_skill](#8-client_skill) *NEW*
9. [client_advanced_skills](#9-client_advanced_skills) *NEW*
10. [client_preferred_skill](#10-client_preferred_skill) *NEW*

### [Partner 도메인]
11. [partner_profile](#11-partner_profile) *확장*
12. [partner_profile_detail](#12-partner_profile_detail)
13. [partner_profile_stats](#13-partner_profile_stats) *NEW*
14. [partner_skill](#14-partner_skill)
15. [partner_advanced_skills](#15-partner_advanced_skills)
16. [partner_reviews](#16-partner_reviews) *NEW*

### [Master]
17. [skill_master](#17-skill_master)
18. [project_field_master](#18-project_field_master)

### [Project 도메인]
19. [projects](#19-projects) *확장*
20. [project_recruit_roles](#20-project_recruit_roles)
21. [project_skill_mapping](#21-project_skill_mapping)
22. [project_field_mapping](#22-project_field_mapping)
23. [project_tags](#23-project_tags) *NEW*
24. [project_verifications_view](#24-project_verifications_view) — 뷰(조인)

---

## Enum 정의

```
users_user_type_enum         : client | partner
users_gender_enum            : male | female | other

client_profile_client_type_enum : personal | business | corporate
user_grade_enum              : bronze | silver | gold | platinum | diamond

verification_type_enum       : identity | business | evaluation
verification_status_enum     : pending | verified | rejected

partner_work_category_enum   : planning | design | publishing | dev
partner_type_enum            : individual | team | company
preferred_project_type_enum  : outsource | fulltime | both
dev_level_enum               : junior | middle | senior | lead
dev_experience_enum          : 0-1 | 1-3 | 3-5 | 5-10 | 10+
work_preference_enum         : onsite | remote | hybrid | any

advanced_proficiency_enum    : beginner | intermediate | advanced | expert
advanced_experience_enum     : 0-1 | 1-3 | 3-5 | 5+

project_type_enum            : outsource | fulltime
outsource_project_type_enum  : new | maintenance
ready_status_enum            : idea | document | design | code
visibility_enum              : public | applicants | private
work_style_enum              : onsite | remote | hybrid
work_days_enum               : 3days | 4days | 5days | flexible
work_hours_enum              : morning | afternoon | flexible | fulltime
dev_stage_enum               : planning | development | beta | operating | maintenance
team_size_enum               : 1-5 | 6-10 | 11-30 | 31-50 | 50+
meeting_type_enum            : online | offline | hybrid
meeting_freq_enum            : daily | weekly | biweekly | monthly
project_status_enum          : recruiting | in_progress | completed | closed
```

---

## [User 도메인]

### 1. `users`

원본 ERD 그대로.

| 컬럼 | 타입 | NN | 설명 |
|---|---|---|---|
| id | BIGINT | ✓ PK | |
| email | VARCHAR(100) | ✓ | |
| phone | VARCHAR(20) | ✓ | |
| username | VARCHAR(50) | ✓ | 예: `client_00001`, `partner_00001` |
| password | VARCHAR(255) | ✓ | bcrypt hash |
| user_type | enum | ✓ | client / partner |
| interests | TEXT | ✓ | 관심 분야 자유 텍스트 |
| contact_email | VARCHAR(100) | | |
| gender | enum | | |
| birth_date | DATE | | |
| region | VARCHAR(50) | | |
| tax_email | VARCHAR(100) | | 세금계산서 이메일 |
| fax_number | VARCHAR(50) | | |
| bank_name | VARCHAR(50) | | |
| bank_account_number | VARCHAR(50) | | |
| bank_account_holder_name | VARCHAR(50) | | |
| profile_image_url | VARCHAR(512) | | |

### 2. `user_verifications` *NEW*

`mock*.verifications[]` ("본인인증 완료", "사업자등록 완료", "평가 우수") 정규화.

| 컬럼 | 타입 | NN | 설명 |
|---|---|---|---|
| id | BIGINT | ✓ PK | |
| user_id | BIGINT | ✓ FK→users | |
| verification_type | enum | ✓ | identity / business / evaluation |
| status | enum | ✓ | pending / verified / rejected |
| verified_at | DATETIME | | |

### 3. `user_interest_projects` *NEW*

프론트의 `mockInterestProjects.json` (관심 프로젝트 찜).

| 컬럼 | 타입 | NN |
|---|---|---|
| id | BIGINT | ✓ PK |
| user_id | BIGINT | ✓ FK→users |
| project_id | BIGINT | ✓ FK→projects |
| created_at | DATETIME | ✓ |

### 4. `user_interest_partners` *NEW*

`mockInterestPartners.json`.

| 컬럼 | 타입 | NN |
|---|---|---|
| id | BIGINT | ✓ PK |
| user_id | BIGINT | ✓ FK→users |
| partner_profile_id | BIGINT | ✓ FK→partner_profile |
| created_at | DATETIME | ✓ |

---

## [Client 도메인]

### 5. `client_profile` *확장*

원본의 `slogan` + mockClients.json 필드 흡수.

| 컬럼 | 타입 | NN | 설명 |
|---|---|---|---|
| id | BIGINT | ✓ PK | |
| user_id | BIGINT | ✓ FK→users | |
| client_type | enum | ✓ | personal/business/corporate |
| org_name | VARCHAR(100) | | 회사명 (`name`/`orgName`) |
| industry | VARCHAR(50) | | SaaS, 웹사이트 등 |
| manager_name | VARCHAR(50) | | 담당자 |
| grade | enum | | bronze~diamond |
| slogan | VARCHAR(255) | ✓ | |
| slogan_sub | VARCHAR(255) | | 부제 |
| bio | TEXT | | |
| strength_desc | TEXT | | |
| preferred_levels | JSON | | ["시니어", "미들"] |
| preferred_work_type | INT | | `preferredWorkType` (0/1/2) |
| budget_min | INT | | 만원 단위 |
| budget_max | INT | | |
| avg_project_budget | INT | | |
| avatar_color | VARCHAR(16) | | "#F59E0B" |

### 6. `client_profile_detail` *NEW* (partner_profile_detail와 대칭)

`mockClients.json.profileMenuToggles{}` + 상세 JSON 정보.

| 컬럼 | 타입 | NN |
|---|---|---|
| id | BIGINT | ✓ PK |
| client_profile_id | BIGINT | ✓ FK |
| show_intro | BOOLEAN | |
| show_skills | BOOLEAN | |
| show_career | BOOLEAN | |
| show_education | BOOLEAN | |
| show_certificates | BOOLEAN | |
| show_awards | BOOLEAN | |
| show_portfolio | BOOLEAN | |
| show_client_reviews | BOOLEAN | |
| show_active_projects | BOOLEAN | |
| experience_json | JSON | `careers[]` |
| education_json | JSON | `educations[]` |
| certificates_json | JSON | `certifications[]` |
| awards_json | JSON | `awards[]` |
| created_at | DATETIME | ✓ |
| updated_at | DATETIME | ✓ |

### 7. `client_profile_stats` *NEW*

집계 수치 (캐시성).

| 컬럼 | 타입 | NN |
|---|---|---|
| id | BIGINT | ✓ PK |
| client_profile_id | BIGINT | ✓ FK UNIQUE |
| completed_projects | INT | |
| posted_projects | INT | |
| rating | DECIMAL(3,1) | |
| repeat_rate | INT | 재계약률 % |

### 8. `client_skill` *NEW* (partner_skill 대칭)

| 컬럼 | 타입 | NN |
|---|---|---|
| id | BIGINT | ✓ PK |
| client_profile_id | BIGINT | ✓ FK |
| skill_id | BIGINT | ✓ FK→skill_master |

### 9. `client_advanced_skills` *NEW*

| 컬럼 | 타입 | NN |
|---|---|---|
| id | BIGINT | ✓ PK |
| client_profile_id | BIGINT | ✓ FK |
| skill_id | BIGINT | |
| custom_skill_name | VARCHAR(100) | |
| proficiency_level | enum | |
| experience_years | enum | |
| created_at | DATETIME | |

### 10. `client_preferred_skill` *NEW*

| 컬럼 | 타입 | NN |
|---|---|---|
| id | BIGINT | ✓ PK |
| client_profile_id | BIGINT | ✓ FK |
| skill_id | BIGINT | ✓ FK→skill_master |

---

## [Partner 도메인]

### 11. `partner_profile` *확장*

| 컬럼 | 타입 | NN | 설명 |
|---|---|---|---|
| id | BIGINT | ✓ PK | |
| user_id | BIGINT | ✓ FK | |
| name | VARCHAR(50) | ✓ | `mockPartners.name` |
| title | VARCHAR(200) | | 한줄 직함 |
| hero_key | VARCHAR(30) | | 캐릭터 이미지 키 (`meeting`, `teacher`, `student`...) |
| service_field | VARCHAR(50) | | SaaS, 웹사이트 등 |
| work_category | enum | ✓ | |
| job_roles | JSON | ✓ | |
| partner_type | enum | ✓ | |
| preferred_project_type | enum | ✓ | |
| work_available_hours | JSON | ✓ | |
| communication_channels | JSON | ✓ | |
| dev_level | enum | | |
| dev_experience | enum | | |
| work_preference | enum | | |
| slogan | VARCHAR(200) | ✓ | |
| slogan_sub | VARCHAR(255) | | |
| salary_hour | INT | | |
| salary_month | INT | | |
| github_url | VARCHAR(500) | | |
| blog_url | VARCHAR(500) | | |
| youtube_url | VARCHAR(500) | | |
| portfolio_file_url | VARCHAR(1000) | | |
| portfolio_file_tag | JSON | | |
| bio_file_url | VARCHAR(1000) | | |
| bio_file_tag | JSON | | |
| hashtags | JSON | | |
| bio | TEXT | | |
| strength_desc | TEXT | | `mockPartners.strengthDesc` |
| avatar_color | VARCHAR(16) | | |
| grade | enum | | |

### 12. `partner_profile_detail`

원본 유지 + 토글 키 프론트와 맞춤.

| 컬럼 | 타입 | NN |
|---|---|---|
| id | BIGINT | ✓ PK |
| partner_profile_id | BIGINT | ✓ FK |
| show_intro | BOOLEAN | |
| show_skills | BOOLEAN | |
| show_career | BOOLEAN | |
| show_education | BOOLEAN | |
| show_certificates | BOOLEAN | |
| show_awards | BOOLEAN | |
| show_portfolio | BOOLEAN | |
| show_client_reviews | BOOLEAN | |
| show_active_projects | BOOLEAN | |
| detailed_bio | TEXT | |
| core_strengths | TEXT | |
| experience_json | JSON | `careers[]` with nested `projects[]` |
| education_json | JSON | |
| certificates_json | JSON | |
| awards_json | JSON | |
| created_at | DATETIME | |
| updated_at | DATETIME | |

### 13. `partner_profile_stats` *NEW*

| 컬럼 | 타입 | NN |
|---|---|---|
| id | BIGINT | ✓ PK |
| partner_profile_id | BIGINT | ✓ FK UNIQUE |
| experience_years | INT | `experience` 숫자 |
| completed_projects | INT | |
| rating | DECIMAL(3,1) | |
| response_rate | INT | |
| repeat_rate | INT | |
| availability_days | INT | |

### 14. `partner_skill`

원본 유지.

| 컬럼 | 타입 | NN |
|---|---|---|
| id | BIGINT | ✓ PK |
| partner_profile_id | BIGINT | ✓ FK |
| skill_id | BIGINT | ✓ FK |

### 15. `partner_advanced_skills`

원본 유지.

| 컬럼 | 타입 | NN |
|---|---|---|
| id | BIGINT | ✓ PK |
| partner_profile_id | BIGINT | ✓ FK |
| skill_id | BIGINT | |
| custom_skill_name | VARCHAR(100) | |
| proficiency_level | enum | |
| experience_years | enum | |
| created_at | DATETIME | |

### 16. `partner_reviews` *NEW*

| 컬럼 | 타입 | NN |
|---|---|---|
| id | BIGINT | ✓ PK |
| partner_profile_id | BIGINT | ✓ FK |
| reviewer_user_id | BIGINT | ✓ FK→users |
| rating | DECIMAL(3,1) | ✓ |
| comment | TEXT | |
| project_id | BIGINT | FK→projects |
| created_at | DATETIME | ✓ |

---

## [Master]

### 17. `skill_master`

| 컬럼 | 타입 | NN |
|---|---|---|
| id | BIGINT | ✓ PK |
| name | VARCHAR(100) | ✓ |
| category | VARCHAR(50) | frontend/backend/devops/mobile/data_ml/database/design 등 |

### 18. `project_field_master`

| 컬럼 | 타입 | NN |
|---|---|---|
| id | INT | ✓ PK |
| parent_category | VARCHAR(100) | ✓ |
| field_name | VARCHAR(100) | ✓ |

---

## [Project 도메인]

### 19. `projects` *확장*

등록 폼(ProjectRegister.jsx) + mockProjects.json 필드 전부 수용.

**공통 필드**

| 컬럼 | 타입 | NN | 설명 |
|---|---|---|---|
| id | BIGINT | ✓ PK | |
| user_id | BIGINT | ✓ FK | 클라이언트 |
| project_type | enum | ✓ | outsource / fulltime |
| title | VARCHAR(255) | ✓ | |
| slogan | VARCHAR(255) | | 카드 한줄 |
| slogan_sub | VARCHAR(255) | | 부제 |
| desc | VARCHAR(500) | | 카드 설명 (`mockProjects.desc`) |
| detail_content | TEXT | ✓ | 상세 업무 내용 |
| service_field | VARCHAR(50) | | SaaS, 웹사이트 등 |
| grade | enum | | 프로젝트 등급 |
| work_scope | JSON | ✓ | [planning, design, publishing, dev] |
| category | JSON | ✓ | [web, android, ios, …] |
| tags | JSON | | `#AI/ML`, `#Python` 같은 해시태그 |
| reference_file_url | VARCHAR(1000) | | |
| visibility | enum | | |
| budget_min | INT | | 만원 |
| budget_max | INT | | 만원 |
| budget_amount | INT | | 단일값 (옵션) |
| is_partner_free | BOOLEAN | | |
| start_date_negotiable | BOOLEAN | | |
| start_date | DATE | | |
| duration_months | INT | | |
| schedule_negotiable | BOOLEAN | | |
| meeting_type | enum | | |
| meeting_freq | enum | | |
| meeting_tools | JSON | | |
| deadline | DATE | ✓ | |
| gov_support | BOOLEAN | | |
| req_tags | JSON | | |
| questions | JSON | | |
| it_exp | BOOLEAN | | |
| collab_planning | INT | | |
| collab_design | INT | | |
| collab_publishing | INT | | |
| collab_dev | INT | | |
| additional_file_url | VARCHAR(1000) | | |
| additional_comment | TEXT | | |
| status | enum | | |
| avatar_color | VARCHAR(16) | | |
| created_at | DATETIME | ✓ | |
| updated_at | DATETIME | ✓ | |

**외주 전용 (`project_type = outsource`)**

| 컬럼 | 타입 | |
|---|---|---|
| outsource_project_type | enum | new / maintenance |
| ready_status | enum | idea / document / design / code |

**상주 전용 (`project_type = fulltime`)**

| 컬럼 | 타입 | |
|---|---|---|
| work_style | enum | onsite/remote/hybrid |
| work_location | VARCHAR(255) | |
| work_days | enum | |
| work_hours | enum | |
| contract_months | INT | |
| monthly_rate | INT | 월 보수(만원) |
| dev_stage | enum | |
| team_size | enum | |
| current_stacks | JSON | |
| current_status | TEXT | 인수인계 |

### 20. `project_recruit_roles`

원본 유지 (상주 모집 직무별).

| 컬럼 | 타입 | NN |
|---|---|---|
| id | BIGINT | ✓ PK |
| project_id | BIGINT | ✓ FK |
| role_job | VARCHAR(100) | ✓ |
| experience | VARCHAR(100) | |
| level | VARCHAR(100) | |
| salary | VARCHAR(100) | |
| skills | JSON | |
| requirement | TEXT | |
| headcount | INT | |

### 21. `project_skill_mapping`

| 컬럼 | 타입 | NN |
|---|---|---|
| id | BIGINT | ✓ PK |
| project_id | BIGINT | ✓ FK |
| skill_id | BIGINT | ✓ FK |
| is_required | BOOLEAN | required/preferred 구분 |

### 22. `project_field_mapping`

| 컬럼 | 타입 | NN |
|---|---|---|
| id | BIGINT | ✓ PK |
| project_id | BIGINT | ✓ FK |
| field_id | INT | ✓ FK |

### 23. `project_tags` *NEW*

`mockProjects.tags` ("#AI/ML" 등) 태그 정규화 (옵션 — projects.tags JSON과 중복 가능, 둘 중 택1).

| 컬럼 | 타입 | NN |
|---|---|---|
| id | BIGINT | ✓ PK |
| project_id | BIGINT | ✓ FK |
| tag | VARCHAR(50) | ✓ |

### 24. `project_verifications_view` (뷰)

`mockProjects.verifications[]`는 실제로는 **클라이언트의 인증 상태**를 프로젝트 카드에 노출하는 것.
별도 테이블이 아니라 다음과 같이 조인:

```sql
SELECT p.id AS project_id, v.verification_type, v.status
FROM projects p
JOIN user_verifications v ON v.user_id = p.user_id;
```

---

## 관계 요약 (ERD 다이어그램용)

```
users 1 ──< client_profile 1 ──< client_profile_detail
                            └──< client_profile_stats
                            └──< client_skill >── skill_master
                            └──< client_advanced_skills >── skill_master
                            └──< client_preferred_skill >── skill_master

users 1 ──< partner_profile 1 ──< partner_profile_detail
                             └──< partner_profile_stats
                             └──< partner_skill >── skill_master
                             └──< partner_advanced_skills >── skill_master
                             └──< partner_reviews

users 1 ──< user_verifications
      └──< user_interest_projects >── projects
      └──< user_interest_partners >── partner_profile

users 1 ──< projects 1 ──< project_recruit_roles
                      └──< project_skill_mapping >── skill_master
                      └──< project_field_mapping >── project_field_master
                      └──< project_tags
```

---

## Mock 데이터 규모 (v2)

| 테이블 | 행수 |
|---|---:|
| users | 60 (client 30 + partner 30) |
| user_verifications | ~120 |
| user_interest_projects | ~60 |
| user_interest_partners | ~60 |
| client_profile | 30 |
| client_profile_detail | 30 |
| client_profile_stats | 30 |
| client_skill | ~100 |
| client_advanced_skills | ~30 |
| client_preferred_skill | ~90 |
| partner_profile | 30 |
| partner_profile_detail | 30 |
| partner_profile_stats | 30 |
| partner_skill | ~150 |
| partner_advanced_skills | ~40 |
| partner_reviews | ~90 |
| skill_master | 40 |
| project_field_master | 15 |
| projects | 30 (외주 15 + 상주 15) |
| project_recruit_roles | ~40 |
| project_skill_mapping | ~100 |
| project_field_mapping | ~50 |
| project_tags | ~100 |

총 ~300 KB 예상.
