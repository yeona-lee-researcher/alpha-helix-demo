"""
ERD(erd_ex.png) 스키마에 완벽히 맞춘 mock 데이터 생성기.
frontend/src/data/erd/ 하위에 JSON 파일들을 생성한다.

사용:
    python frontend/scripts/generateMockData_v3.py
"""
from __future__ import annotations

import json
import os
import random
from datetime import datetime, timedelta
from pathlib import Path

random.seed(42)

OUT_DIR = Path(__file__).resolve().parent.parent / "src" / "data" / "erd"
OUT_DIR.mkdir(parents=True, exist_ok=True)

# ─────────────────────────────────────────────────────────────
# 상수 (등록 폼 / ERD enum 기준)
# ─────────────────────────────────────────────────────────────
USER_TYPES = ["client", "partner"]
GENDERS = ["male", "female", "other"]
CLIENT_TYPES = ["personal", "business", "corporate"]

PROJECT_TYPES = ["outsource", "fulltime"]  # 외주 / 상주
OUTSOURCE_PROJECT_TYPES = ["new", "maintenance"]  # 신규 / 유지보수
READY_STATUSES = ["idea", "document", "design", "code"]
VISIBILITIES = ["public", "applicants", "private"]
WORK_STYLES = ["onsite", "remote", "hybrid"]
WORK_DAYS = ["3days", "4days", "5days", "flexible"]
WORK_HOURS = ["morning", "afternoon", "flexible", "fulltime"]
DEV_STAGES = ["planning", "development", "beta", "operating", "maintenance"]
TEAM_SIZES = ["1-5", "6-10", "11-30", "31-50", "50+"]
MEETING_TYPES = ["online", "offline", "hybrid"]
MEETING_FREQS = ["daily", "weekly", "biweekly", "monthly"]
MEETING_TOOLS_POOL = ["Slack", "Notion", "Jira", "Zoom", "Google Meet", "Discord", "Teams", "Figma"]
PROJECT_STATUSES = ["recruiting", "in_progress", "completed", "closed"]

WORK_SCOPES = ["planning", "design", "publishing", "dev"]
CATEGORIES = ["web", "android", "ios", "pc", "embedded", "etc"]

# partner_profile enums
PARTNER_WORK_CATEGORIES = ["planning", "design", "publishing", "dev"]
PARTNER_TYPES = ["individual", "team", "company"]
PREFERRED_PROJECT_TYPES = ["outsource", "fulltime", "both"]
DEV_LEVELS = ["junior", "middle", "senior", "lead"]
DEV_EXPERIENCES = ["0-1", "1-3", "3-5", "5-10", "10+"]
WORK_PREFERENCES = ["onsite", "remote", "hybrid", "any"]
GRADES = ["bronze", "silver", "gold", "platinum", "diamond"]

ADV_PROFICIENCY = ["beginner", "intermediate", "advanced", "expert"]
ADV_EXPERIENCE = ["0-1", "1-3", "3-5", "5+"]

# skill_master (40개)
SKILLS = [
    "React", "Next.js", "Vue.js", "Angular", "Svelte",
    "TypeScript", "JavaScript", "HTML/CSS", "TailwindCSS",
    "Node.js", "Express", "NestJS", "Django", "FastAPI", "Flask",
    "Spring", "Spring Boot", "Java", "Kotlin",
    "Python", "Go", "Rust", "C++", "C#",
    "MySQL", "PostgreSQL", "MongoDB", "Redis",
    "AWS", "GCP", "Azure", "Docker", "Kubernetes",
    "Figma", "Sketch", "Adobe XD",
    "Flutter", "React Native", "Swift", "Objective-C",
]

# project_field_master (15개) — parent_category, field_name
FIELDS = [
    ("IT 서비스 구축", "웹 서비스"),
    ("IT 서비스 구축", "모바일 앱"),
    ("IT 서비스 구축", "백오피스"),
    ("내부 업무시스템", "ERP"),
    ("내부 업무시스템", "그룹웨어"),
    ("AI·머신러닝", "추천 시스템"),
    ("AI·머신러닝", "자연어 처리"),
    ("AI·머신러닝", "컴퓨터 비전"),
    ("커머스·쇼핑몰", "B2C 쇼핑몰"),
    ("커머스·쇼핑몰", "마켓플레이스"),
    ("웹사이트 제작", "브랜드 사이트"),
    ("클라우드 도입", "인프라 마이그레이션"),
    ("컨설팅·PMO", "기술 컨설팅"),
    ("유지보수·운영", "레거시 리팩토링"),
    ("기타", "기타"),
]

JOB_ROLES_POOL = [
    "프론트엔드 개발자", "백엔드 개발자", "풀스택 개발자", "모바일 개발자",
    "AI 엔지니어", "데이터 엔지니어", "DevOps 엔지니어",
    "UI/UX 디자이너", "BX 디자이너", "기획자", "PM", "QA",
]

KOREAN_FIRST = ["민수", "지훈", "서연", "지우", "하준", "예준", "서윤", "주원", "도윤", "민준",
                "지호", "현우", "수빈", "유진", "시우", "윤서", "채원", "지아", "하린", "나은"]
KOREAN_LAST = ["김", "이", "박", "최", "정", "강", "조", "윤", "장", "임", "한", "오", "서", "신", "권"]
ENG_FIRST = ["Alex", "Sarah", "James", "Emma", "Liam", "Olivia", "Noah", "Ava", "Ethan", "Mia"]
ENG_LAST = ["Miller", "Chen", "Kim", "Park", "Lee", "Smith", "Brown", "Wilson", "Taylor", "Moore"]

COMPANY_NAMES = ["Alpha FinTech", "Blue Retail Co.", "Crypto Systems", "NeoBank Studio",
                 "Future Soft Tech", "GreenLogis", "CloudNest", "HyperScale", "RetailPlus", "EduWave"]

# ─────────────────────────────────────────────────────────────
# 유틸
# ─────────────────────────────────────────────────────────────
NOW = datetime(2026, 4, 17, 10, 0, 0)


def dt(offset_days: int = 0, offset_hours: int = 0) -> str:
    return (NOW + timedelta(days=offset_days, hours=offset_hours)).strftime("%Y-%m-%d %H:%M:%S")


def date_only(offset_days: int) -> str:
    return (NOW + timedelta(days=offset_days)).strftime("%Y-%m-%d")


def write_json(name: str, data) -> None:
    path = OUT_DIR / name
    with path.open("w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    print(f"  ✓ {name}: {len(data)} rows")


def random_korean_name() -> str:
    return random.choice(KOREAN_LAST) + random.choice(KOREAN_FIRST)


def random_eng_name() -> str:
    return f"{random.choice(ENG_FIRST)} {random.choice(ENG_LAST)}"


# ─────────────────────────────────────────────────────────────
# 1. skill_master (40)
# ─────────────────────────────────────────────────────────────
skill_master = [{"id": i + 1, "name": s} for i, s in enumerate(SKILLS)]

# ─────────────────────────────────────────────────────────────
# 2. project_field_master (15)
# ─────────────────────────────────────────────────────────────
project_field_master = [
    {"id": i + 1, "parent_category": parent, "field_name": name}
    for i, (parent, name) in enumerate(FIELDS)
]

# ─────────────────────────────────────────────────────────────
# 3. users (60: 클라 30 + 파트너 30)
# ─────────────────────────────────────────────────────────────
users = []
for i in range(1, 61):
    is_client = i <= 30
    uname_prefix = "client" if is_client else "partner"
    users.append({
        "id": i,
        "email": f"{uname_prefix}_{i:03d}@example.com",
        "phone": f"010-{random.randint(1000,9999)}-{random.randint(1000,9999)}",
        "username": f"{uname_prefix}_{i:03d}",
        "password": "$2b$10$hashedpasswordplaceholder",  # 실제 해시 X (mock)
        "user_type": "client" if is_client else "partner",
        "interests": "웹 개발, AI, 커머스" if random.random() < 0.5 else "모바일, 디자인",
        "contact_email": f"{uname_prefix}_{i:03d}@example.com",
        "gender": random.choice(GENDERS),
        "birth_date": f"{random.randint(1980, 2000)}-{random.randint(1,12):02d}-{random.randint(1,28):02d}",
        "region": random.choice(["서울시 강남구", "서울시 마포구", "경기도 성남시", "부산시 해운대구", "대전시 유성구"]),
        "tax_email": f"tax_{i:03d}@example.com" if is_client else None,
        "fax_number": None,
        "bank_name": random.choice(["국민은행", "신한은행", "우리은행", "하나은행", "카카오뱅크"]),
        "bank_account_number": f"{random.randint(100,999)}-{random.randint(100000,999999)}-{random.randint(10,99)}",
        "bank_account_holder_name": random_korean_name(),
        "profile_image_url": f"https://cdn.example.com/avatar/{i}.png",
        "created_at": dt(-random.randint(30, 365)),
        "updated_at": dt(-random.randint(0, 20)),
    })

# ─────────────────────────────────────────────────────────────
# 4. client_profile (30)
# ─────────────────────────────────────────────────────────────
client_profile = []
for idx, u in enumerate([u for u in users if u["user_type"] == "client"], start=1):
    client_profile.append({
        "id": idx,
        "user_id": u["id"],
        "client_type": random.choice(CLIENT_TYPES),
        "slogan": random.choice([
            "빠르고 정확한 협업을 추구합니다.",
            "기술로 비즈니스 문제를 해결합니다.",
            "장기 파트너십을 선호합니다.",
            "데이터 기반 의사결정을 중시합니다.",
        ]),
    })

# ─────────────────────────────────────────────────────────────
# 5. partner_profile (30) + partner_profile_detail (30)
# ─────────────────────────────────────────────────────────────
partner_profile = []
partner_profile_detail = []
partner_users = [u for u in users if u["user_type"] == "partner"]
for idx, u in enumerate(partner_users, start=1):
    salary_h = random.randint(30_000, 120_000)
    salary_m = salary_h * 160
    partner_profile.append({
        "id": idx,
        "user_id": u["id"],
        "work_category": random.choice(PARTNER_WORK_CATEGORIES),
        "job_roles": random.sample(JOB_ROLES_POOL, k=random.randint(1, 3)),
        "partner_type": random.choice(PARTNER_TYPES),
        "preferred_project_type": random.choice(PREFERRED_PROJECT_TYPES),
        "work_available_hours": {
            "weekday": random.choice(["오전", "오후", "풀타임", "유연"]),
            "weekend": random.choice([True, False]),
        },
        "communication_channels": random.sample(MEETING_TOOLS_POOL, k=random.randint(2, 4)),
        "dev_level": random.choice(DEV_LEVELS),
        "dev_experience": random.choice(DEV_EXPERIENCES),
        "work_preference": random.choice(WORK_PREFERENCES),
        "slogan": random.choice([
            "안정적인 백엔드 아키텍처를 구축합니다.",
            "사용자 경험을 최우선으로 생각합니다.",
            "빠른 MVP 개발을 지원합니다.",
            "데이터 기반 AI 모델링 전문가입니다.",
        ]),
        "salary_hour": salary_h,
        "salary_month": salary_m,
        "github_url": f"https://github.com/{u['username']}",
        "blog_url": None,
        "youtube_url": None,
        "portfolio_file_url": f"https://cdn.example.com/portfolio/{u['id']}.pdf",
        "portfolio_file_tag": ["웹", "백엔드"] if random.random() < 0.5 else ["모바일", "디자인"],
        "bio_file_url": f"https://cdn.example.com/bio/{u['id']}.pdf",
        "bio_file_tag": ["경력", "포트폴리오"],
        "hashtags": random.sample(["#열정", "#성실", "#빠른소통", "#품질우선", "#장기협업"], k=3),
        "bio": "다양한 도메인에서 실무 경험을 쌓아온 개발자입니다.",
        "grade": random.choice(GRADES),
    })
    partner_profile_detail.append({
        "id": idx,
        "partner_profile_id": idx,
        "show_bio": True,
        "show_skills": True,
        "show_experience": True,
        "show_education": random.choice([True, False]),
        "show_certificates": random.choice([True, False]),
        "show_awards": random.choice([True, False]),
        "show_portfolio": True,
        "show_evaluations": True,
        "detailed_bio": "다수의 프로젝트에서 리드 역할을 수행했습니다.",
        "core_strengths": "문제 정의 능력, 빠른 프로토타이핑, 팀 커뮤니케이션.",
        "experience_json": [
            {"company": "TechCorp", "role": "Senior Engineer", "period": "2022-2024"},
            {"company": "StartupX", "role": "Full-Stack Dev", "period": "2020-2022"},
        ],
        "education_json": [
            {"school": "OO대학교", "major": "컴퓨터공학", "period": "2014-2018"},
        ],
        "certificates_json": [
            {"name": "정보처리기사", "issuer": "한국산업인력공단", "year": 2019},
        ],
        "awards_json": [],
        "created_at": dt(-random.randint(30, 365)),
        "updated_at": dt(-random.randint(0, 20)),
    })

# ─────────────────────────────────────────────────────────────
# 6. partner_skill (다대다)
# ─────────────────────────────────────────────────────────────
partner_skill = []
pk_id = 1
for pp in partner_profile:
    k = random.randint(3, 6)
    for sid in random.sample(range(1, len(skill_master) + 1), k=k):
        partner_skill.append({
            "id": pk_id,
            "partner_profile_id": pp["id"],
            "skill_id": sid,
        })
        pk_id += 1

# ─────────────────────────────────────────────────────────────
# 7. partner_advanced_skills (일부만)
# ─────────────────────────────────────────────────────────────
partner_advanced_skills = []
pas_id = 1
for pp in partner_profile:
    if random.random() < 0.6:
        k = random.randint(1, 3)
        for sid in random.sample(range(1, len(skill_master) + 1), k=k):
            partner_advanced_skills.append({
                "id": pas_id,
                "partner_profile_id": pp["id"],
                "skill_id": sid,
                "custom_skill_name": None,
                "proficiency_level": random.choice(ADV_PROFICIENCY),
                "experience_years": random.choice(ADV_EXPERIENCE),
                "created_at": dt(-random.randint(10, 365)),
            })
            pas_id += 1

# ─────────────────────────────────────────────────────────────
# 8. projects (30: 외주 15 + 상주 15)
# ─────────────────────────────────────────────────────────────
PROJECT_TITLES_OUTSOURCE = [
    "AI 기반 이상 거래 탐지 시스템 고도화",
    "이커머스 플랫폼 모바일 앱 리뉴얼",
    "블록체인 기반 공급망 관리 시스템 구축",
    "DevBridge 협업 매칭 플랫폼 2차 고도화",
    "금융 상품 추천 엔진 개발",
    "SaaS 대시보드 UI/UX 리디자인",
    "병원 예약 시스템 모바일 앱 개발",
    "스마트팩토리 모니터링 웹 구축",
    "실시간 번역 챗봇 프로토타입",
    "부동산 매물 관리 백오피스",
    "교육 콘텐츠 스트리밍 플랫폼",
    "NFT 마켓플레이스 MVP",
    "크로스보더 결제 게이트웨이 연동",
    "물류 경로 최적화 알고리즘 개발",
    "AI 고객상담 봇 구축",
]
PROJECT_TITLES_FULLTIME = [
    "핀테크 결제 모듈 리팩토링 (상주)",
    "실시간 데이터 파이프라인 구축 (상주)",
    "모빌리티 플랫폼 백엔드 확장 (상주)",
    "헬스케어 앱 iOS 개발 기간제",
    "B2B SaaS 풀스택 개발자 기간제 채용",
    "대기업 ERP 유지보수 상주",
    "AI 추천 시스템 MLOps 상주",
    "핀테크 프론트엔드 React 상주",
    "글로벌 쇼핑몰 백엔드 상주 1년",
    "클라우드 마이그레이션 DevOps 상주",
    "병원 데이터 웨어하우스 상주",
    "게임 서버 개발 상주 6개월",
    "보안 솔루션 엔지니어 상주",
    "스마트시티 IoT 상주 개발",
    "대형 커머스 QA 엔지니어 상주",
]

projects = []
client_user_ids = [u["id"] for u in users if u["user_type"] == "client"]
for i in range(1, 31):
    is_outsource = i <= 15
    project_type = "outsource" if is_outsource else "fulltime"
    title = (PROJECT_TITLES_OUTSOURCE if is_outsource else PROJECT_TITLES_FULLTIME)[i - 1 if is_outsource else i - 16]
    budget = random.randint(500, 8000) * 10_000  # 500만원 ~ 8000만원
    duration = random.randint(2, 12)
    start_off = random.randint(7, 60)
    deadline_off = random.randint(3, 30)

    project = {
        "id": i,
        "user_id": random.choice(client_user_ids),
        "project_type": project_type,
        "title": title,
        "work_scope": random.sample(WORK_SCOPES, k=random.randint(1, 3)),
        "category": random.sample(CATEGORIES, k=random.randint(1, 2)),
        "outsource_project_type": random.choice(OUTSOURCE_PROJECT_TYPES) if is_outsource else None,
        "ready_status": random.choice(READY_STATUSES) if is_outsource else None,
        "reference_file_url": f"https://cdn.example.com/projects/{i}/ref.pdf" if random.random() < 0.5 else None,
        "visibility": random.choice(VISIBILITIES),
        # 상주 전용
        "work_style": random.choice(WORK_STYLES) if not is_outsource else None,
        "work_location": random.choice(["서울시 강남구 테헤란로 427", "서울시 성동구 성수이로 113", "경기도 성남시 분당구 판교로 253"]) if not is_outsource else None,
        "work_days": random.choice(WORK_DAYS) if not is_outsource else None,
        "work_hours": random.choice(WORK_HOURS) if not is_outsource else None,
        "contract_months": duration if not is_outsource else None,
        "monthly_rate": random.randint(400, 900) * 10_000 if not is_outsource else None,
        # 공통
        "detail_content": f"{title}에 대한 상세 업무 설명입니다. 레거시 시스템 개선, 신규 기능 개발, 성능 튜닝 및 운영 자동화까지 포함됩니다.",
        "budget_amount": budget,
        "is_partner_free": random.random() < 0.2,
        "start_date_negotiable": random.random() < 0.4,
        "start_date": date_only(start_off),
        "duration_months": duration,
        "schedule_negotiable": random.random() < 0.5,
        # 상주 전용 추가
        "dev_stage": random.choice(DEV_STAGES) if not is_outsource else None,
        "team_size": random.choice(TEAM_SIZES) if not is_outsource else None,
        "current_stacks": random.sample(SKILLS, k=random.randint(2, 5)) if not is_outsource else None,
        "current_status": "현재 MVP 완료 단계이며 운영 안정화와 신규 기능 개발을 병행 중입니다." if not is_outsource else None,
        # 미팅
        "meeting_type": random.choice(MEETING_TYPES),
        "meeting_freq": random.choice(MEETING_FREQS),
        "meeting_tools": random.sample(MEETING_TOOLS_POOL, k=random.randint(2, 4)),
        # 모집
        "deadline": date_only(deadline_off),
        "gov_support": random.random() < 0.15,
        "req_tags": random.sample(["신입가능", "경력우대", "원격가능", "정규직전환", "장기계약"], k=random.randint(1, 3)),
        "questions": [
            "해당 도메인에서의 실무 경험을 간단히 소개해 주세요.",
            "가장 어려웠던 기술적 문제와 해결 과정을 설명해 주세요.",
        ] if random.random() < 0.7 else [],
        "it_exp": random.random() < 0.5,
        # 협업 인력 구성
        "collab_planning": random.randint(0, 2),
        "collab_design": random.randint(0, 2),
        "collab_publishing": random.randint(0, 1),
        "collab_dev": random.randint(1, 4),
        # 기타
        "additional_file_url": None,
        "additional_comment": None,
        "status": random.choice(PROJECT_STATUSES),
        "created_at": dt(-random.randint(5, 90)),
        "updated_at": dt(-random.randint(0, 4)),
    }
    projects.append(project)

# ─────────────────────────────────────────────────────────────
# 9. project_recruit_roles (상주 프로젝트 위주)
# ─────────────────────────────────────────────────────────────
project_recruit_roles = []
prr_id = 1
for p in projects:
    # 상주는 1~3개, 외주는 0~2개
    n_roles = random.randint(1, 3) if p["project_type"] == "fulltime" else random.randint(0, 2)
    for _ in range(n_roles):
        skills_sample = random.sample(SKILLS, k=random.randint(2, 4))
        project_recruit_roles.append({
            "id": prr_id,
            "project_id": p["id"],
            "role_job": random.choice(JOB_ROLES_POOL),
            "experience": random.choice(["신입", "1-3년", "3-5년", "5-10년", "10년 이상"]),
            "level": random.choice(["주니어", "미드레벨", "시니어", "리드/매니저"]),
            "salary": f"{random.randint(400, 900)}만원",
            "skills": skills_sample,
            "requirement": "해당 도메인 실무 경험 및 원활한 커뮤니케이션 능력 보유자",
            "headcount": random.randint(1, 3),
        })
        prr_id += 1

# ─────────────────────────────────────────────────────────────
# 10. project_skill_mapping
# ─────────────────────────────────────────────────────────────
project_skill_mapping = []
psm_id = 1
for p in projects:
    k = random.randint(2, 5)
    for sid in random.sample(range(1, len(skill_master) + 1), k=k):
        project_skill_mapping.append({
            "id": psm_id,
            "project_id": p["id"],
            "skill_id": sid,
        })
        psm_id += 1

# ─────────────────────────────────────────────────────────────
# 11. project_field_mapping
# ─────────────────────────────────────────────────────────────
project_field_mapping = []
pfm_id = 1
for p in projects:
    k = random.randint(1, 2)
    for fid in random.sample(range(1, len(project_field_master) + 1), k=k):
        project_field_mapping.append({
            "id": pfm_id,
            "project_id": p["id"],
            "field_id": fid,
        })
        pfm_id += 1

# ─────────────────────────────────────────────────────────────
# 저장
# ─────────────────────────────────────────────────────────────
print(f"Writing to: {OUT_DIR}")
write_json("users.json", users)
write_json("client_profile.json", client_profile)
write_json("partner_profile.json", partner_profile)
write_json("partner_profile_detail.json", partner_profile_detail)
write_json("partner_skill.json", partner_skill)
write_json("partner_advanced_skills.json", partner_advanced_skills)
write_json("skill_master.json", skill_master)
write_json("projects.json", projects)
write_json("project_recruit_roles.json", project_recruit_roles)
write_json("project_skill_mapping.json", project_skill_mapping)
write_json("project_field_master.json", project_field_master)
write_json("project_field_mapping.json", project_field_mapping)

# 총 용량 측정
total_bytes = sum(f.stat().st_size for f in OUT_DIR.glob("*.json"))
print(f"\nTotal: {total_bytes:,} bytes ({total_bytes/1024:.1f} KB)")
