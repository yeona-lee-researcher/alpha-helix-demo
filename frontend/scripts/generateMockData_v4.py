"""
ERD v2 (docs/ERD_v2.md) 스키마에 100% 맞춘 mock 데이터 생성기.
frontend/src/data/erd/ 하위에 24개 테이블 JSON 파일 생성.

실행:
    python frontend/scripts/generateMockData_v4.py
"""
from __future__ import annotations

import json
import random
from datetime import datetime, timedelta
from pathlib import Path

random.seed(42)

OUT_DIR = Path(__file__).resolve().parent.parent / "src" / "data" / "erd"
OUT_DIR.mkdir(parents=True, exist_ok=True)

NOW = datetime(2026, 4, 17, 10, 0, 0)


def dt(off_days=0, off_hours=0):
    return (NOW + timedelta(days=off_days, hours=off_hours)).strftime("%Y-%m-%d %H:%M:%S")


def date_only(off):
    return (NOW + timedelta(days=off)).strftime("%Y-%m-%d")


def write_json(name, data):
    path = OUT_DIR / name
    with path.open("w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    print(f"  ✓ {name:<36} {len(data):>4} rows")


# ─────────────────────────────────────────────────────────────
# 상수
# ─────────────────────────────────────────────────────────────
GENDERS = ["male", "female", "other"]
CLIENT_TYPES = ["personal", "business", "corporate"]
GRADES = ["bronze", "silver", "gold", "platinum", "diamond"]

VERIFICATION_TYPES = ["identity", "business", "evaluation"]
VERIFICATION_STATUSES = ["pending", "verified", "rejected"]

PARTNER_WORK_CATEGORIES = ["planning", "design", "publishing", "dev"]
PARTNER_TYPES = ["individual", "team", "company"]
PREFERRED_PROJECT_TYPES = ["outsource", "fulltime", "both"]
DEV_LEVELS = ["junior", "middle", "senior", "lead"]
DEV_EXPERIENCES = ["0-1", "1-3", "3-5", "5-10", "10+"]
WORK_PREFERENCES = ["onsite", "remote", "hybrid", "any"]

ADV_PROFICIENCY = ["beginner", "intermediate", "advanced", "expert"]
ADV_EXPERIENCE = ["0-1", "1-3", "3-5", "5+"]

PROJECT_TYPES = ["outsource", "fulltime"]
OUTSOURCE_PROJECT_TYPES = ["new", "maintenance"]
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

HERO_KEYS = ["meeting", "teacher", "student", "check", "default"]

SKILLS = [
    ("React", "frontend"), ("Next.js", "frontend"), ("Vue.js", "frontend"), ("Angular", "frontend"),
    ("Svelte", "frontend"), ("TypeScript", "lang"), ("JavaScript", "lang"),
    ("HTML/CSS", "frontend"), ("TailwindCSS", "frontend"),
    ("Node.js", "backend"), ("Express", "backend"), ("NestJS", "backend"),
    ("Django", "backend"), ("FastAPI", "backend"), ("Flask", "backend"),
    ("Spring", "backend"), ("Spring Boot", "backend"),
    ("Java", "lang"), ("Kotlin", "lang"), ("Python", "lang"),
    ("Go", "lang"), ("Rust", "lang"), ("C++", "lang"), ("C#", "lang"),
    ("MySQL", "database"), ("PostgreSQL", "database"), ("MongoDB", "database"), ("Redis", "database"),
    ("AWS", "devops"), ("GCP", "devops"), ("Azure", "devops"),
    ("Docker", "devops"), ("Kubernetes", "devops"),
    ("Figma", "design"), ("Sketch", "design"), ("Adobe XD", "design"),
    ("Flutter", "mobile"), ("React Native", "mobile"), ("Swift", "mobile"), ("Objective-C", "mobile"),
]

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

JOB_ROLES = [
    "프론트엔드 개발자", "백엔드 개발자", "풀스택 개발자", "모바일 개발자",
    "AI 엔지니어", "데이터 엔지니어", "DevOps 엔지니어",
    "UI/UX 디자이너", "BX 디자이너", "기획자", "PM", "QA",
]

K_LAST = ["김", "이", "박", "최", "정", "강", "조", "윤", "장", "임", "한", "오", "서", "신", "권"]
K_FIRST = ["민수", "지훈", "서연", "지우", "하준", "예준", "서윤", "주원", "도윤", "민준",
           "지호", "현우", "수빈", "유진", "시우", "윤서", "채원", "지아", "하린", "나은"]

ORG_NAMES = [
    "넥스트소프트", "스마트컴퍼니", "디지털클라우드", "퓨처테크", "알파핀테크",
    "블루리테일", "크립토시스템즈", "네오뱅크스튜디오", "그린로지스", "클라우드네스트",
    "하이퍼스케일", "리테일플러스", "에듀웨이브", "코어랩스", "노바텍",
    "모멘텀소프트", "바인드웍스", "솔라시스템", "오로라디지털", "브릿지테크",
    "씨드소프트", "엔진룸", "테라벤처스", "유니크스튜디오", "정글웍스",
    "카이로스", "타이탄랩", "제니스테크", "엑시온", "바움소프트",
]

INDUSTRIES = ["SaaS", "웹사이트", "AI", "커머스", "유지보수", "핀테크", "블록체인", "모바일", "교육", "의료"]
REGIONS = ["서울시 강남구", "서울시 마포구", "경기도 성남시", "부산시 해운대구", "대전시 유성구"]
LOCATIONS = [
    "서울시 강남구 테헤란로 427",
    "서울시 성동구 성수이로 113",
    "경기도 성남시 분당구 판교로 253",
    "서울시 서초구 서초대로 396",
    "서울시 영등포구 여의대로 108",
]

AVATAR_COLORS = ["#F59E0B", "#22D3EE", "#7C3AED", "#D97706", "#2DD4BF", "#EA580C",
                 "#38BDF8", "#EF4444", "#10B981", "#6366F1", "#EC4899", "#14B8A6"]

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

PARTNER_TITLES = [
    "Prisma 아키텍처 설계부터 React 배포까지 원스톱",
    "웹사이트 품질 보증 · TypeScript+React CI/CD 파이프라인",
    "AI 추천 엔진 End-to-End 구축 전문가",
    "핀테크 결제 모듈 리팩토링 시니어",
    "크로스플랫폼 모바일 앱 Flutter 전문가",
    "백엔드 아키텍처 설계 & MSA 전환",
    "데이터 엔지니어 · Airflow·Spark 경험",
    "UI/UX 디자인 시스템 구축 리드",
    "DevOps 파이프라인 & 쿠버네티스 운영",
    "프론트엔드 성능 최적화 전문",
]

REVIEW_COMMENTS = [
    "의사결정이 빠르고 요구사항이 명확했습니다.",
    "피드백이 구체적이라 방향 정리가 쉬웠습니다.",
    "업무 범위가 명확하고 일정 공유가 체계적이었습니다.",
    "협업 과정에서 높은 이해도를 보여주셨습니다.",
    "프로젝트 목표와 KPI 정의가 명확했습니다.",
    "기술적 깊이와 커뮤니케이션 모두 훌륭했습니다.",
]

# ─────────────────────────────────────────────────────────────
# 1. skill_master
# ─────────────────────────────────────────────────────────────
skill_master = [{"id": i + 1, "name": s[0], "category": s[1]} for i, s in enumerate(SKILLS)]

# 2. project_field_master
project_field_master = [
    {"id": i + 1, "parent_category": p, "field_name": n} for i, (p, n) in enumerate(FIELDS)
]

# ─────────────────────────────────────────────────────────────
# 3. users (60)
# ─────────────────────────────────────────────────────────────
users = []
for i in range(1, 61):
    is_client = i <= 30
    prefix = "client" if is_client else "partner"
    users.append({
        "id": i,
        "email": f"{prefix}_{i:05d}@devbridge.com",
        "phone": f"010-{random.randint(1000,9999)}-{random.randint(1000,9999)}",
        "username": f"{prefix}_{i:05d}",
        "password": "$2b$10$mockHashedPassword",
        "user_type": "client" if is_client else "partner",
        "interests": "웹 개발, AI, 커머스" if random.random() < 0.5 else "모바일, 디자인",
        "contact_email": f"{prefix}_{i:05d}@devbridge.com",
        "gender": random.choice(GENDERS),
        "birth_date": f"{random.randint(1980, 2000)}-{random.randint(1,12):02d}-{random.randint(1,28):02d}",
        "region": random.choice(REGIONS),
        "tax_email": f"tax_{i:05d}@devbridge.com" if is_client else None,
        "fax_number": None,
        "bank_name": random.choice(["국민은행", "신한은행", "우리은행", "하나은행", "카카오뱅크"]),
        "bank_account_number": f"{random.randint(100,999)}-{random.randint(100000,999999)}-{random.randint(10,99)}",
        "bank_account_holder_name": random.choice(K_LAST) + random.choice(K_FIRST),
        "profile_image_url": f"https://cdn.devbridge.com/avatar/{i}.png",
    })

# ─────────────────────────────────────────────────────────────
# 4. user_verifications
# ─────────────────────────────────────────────────────────────
user_verifications = []
uv_id = 1
for u in users:
    # 각 사용자 identity/business/evaluation 중 1~3개 verified
    n = random.randint(1, 3)
    types = random.sample(VERIFICATION_TYPES, k=n)
    for t in types:
        # business는 client만 주로
        if t == "business" and u["user_type"] == "partner" and random.random() < 0.5:
            continue
        user_verifications.append({
            "id": uv_id,
            "user_id": u["id"],
            "verification_type": t,
            "status": "verified" if random.random() < 0.85 else random.choice(["pending", "rejected"]),
            "verified_at": dt(-random.randint(30, 300)),
        })
        uv_id += 1

# ─────────────────────────────────────────────────────────────
# 5. client_profile (30)
# ─────────────────────────────────────────────────────────────
client_users = [u for u in users if u["user_type"] == "client"]
client_profile = []
for idx, u in enumerate(client_users, start=1):
    budget_min = random.randint(500, 3000)
    budget_max = budget_min + random.randint(500, 2000)
    client_profile.append({
        "id": idx,
        "user_id": u["id"],
        "client_type": random.choice(CLIENT_TYPES),
        "org_name": ORG_NAMES[idx - 1],
        "industry": random.choice(INDUSTRIES),
        "manager_name": random.choice(K_LAST) + random.choice(K_FIRST),
        "grade": random.choice(GRADES),
        "slogan": f"{random.choice(INDUSTRIES)} 분야 디지털 혁신 파트너를 찾습니다",
        "slogan_sub": f"{random.choice(CLIENT_TYPES)} | 예산 {budget_min:,}~{budget_max:,}만원",
        "bio": f"{ORG_NAMES[idx - 1]}는 고객 중심의 제품 개발과 빠른 시장 대응을 핵심 가치로 삼는 기업입니다.",
        "strength_desc": "빠른 의사결정과 명확한 요구 사항 전달이 강점입니다.",
        "preferred_levels": random.sample(["주니어", "미들", "시니어", "리드"], k=random.randint(1, 2)),
        "preferred_work_type": random.randint(0, 2),
        "budget_min": budget_min,
        "budget_max": budget_max,
        "avg_project_budget": (budget_min + budget_max) // 2,
        "avatar_color": random.choice(AVATAR_COLORS),
    })

# ─────────────────────────────────────────────────────────────
# 6. client_profile_detail (30)
# ─────────────────────────────────────────────────────────────
client_profile_detail = []
for cp in client_profile:
    client_profile_detail.append({
        "id": cp["id"],
        "client_profile_id": cp["id"],
        "show_intro": True,
        "show_skills": random.choice([True, False]),
        "show_career": random.choice([True, False]),
        "show_education": random.choice([True, False]),
        "show_certificates": random.choice([True, False]),
        "show_awards": random.choice([True, False]),
        "show_portfolio": True,
        "show_client_reviews": True,
        "show_active_projects": True,
        "experience_json": [
            {
                "company": cp["org_name"],
                "jobTitle": "CTO",
                "startDate": "2019-01",
                "endDate": "",
                "isCurrent": True,
                "employmentType": "정규직",
                "role": "기술이사",
                "level": "임원",
                "description": "회사 전체 기술 전략 수립 및 개발팀 관리.",
            }
        ],
        "education_json": [
            {"schoolName": "서울대학교", "major": "경영학", "degree": "학사", "graduationDate": "2010-02"}
        ],
        "certificates_json": [],
        "awards_json": [
            {"awardName": "2024 혁신 IT 기업 대상", "awarding": "한국IT서비스산업협회", "awardDate": "2024-05-20"}
        ] if random.random() < 0.5 else [],
        "created_at": dt(-random.randint(30, 365)),
        "updated_at": dt(-random.randint(0, 20)),
    })

# ─────────────────────────────────────────────────────────────
# 7. client_profile_stats (30)
# ─────────────────────────────────────────────────────────────
client_profile_stats = []
for cp in client_profile:
    completed = random.randint(3, 30)
    client_profile_stats.append({
        "id": cp["id"],
        "client_profile_id": cp["id"],
        "completed_projects": completed,
        "posted_projects": completed + random.randint(0, 8),
        "rating": round(random.uniform(3.0, 5.0), 1),
        "repeat_rate": random.randint(10, 80),
    })

# ─────────────────────────────────────────────────────────────
# 8. client_skill / 9. client_advanced_skills / 10. client_preferred_skill
# ─────────────────────────────────────────────────────────────
client_skill = []
client_advanced_skills = []
client_preferred_skill = []
cs_id = cas_id = cps_id = 1
for cp in client_profile:
    for sid in random.sample(range(1, len(skill_master) + 1), k=random.randint(2, 5)):
        client_skill.append({"id": cs_id, "client_profile_id": cp["id"], "skill_id": sid})
        cs_id += 1
    if random.random() < 0.5:
        for sid in random.sample(range(1, len(skill_master) + 1), k=random.randint(1, 2)):
            client_advanced_skills.append({
                "id": cas_id,
                "client_profile_id": cp["id"],
                "skill_id": sid,
                "custom_skill_name": None,
                "proficiency_level": random.choice(ADV_PROFICIENCY),
                "experience_years": random.choice(ADV_EXPERIENCE),
                "created_at": dt(-random.randint(10, 365)),
            })
            cas_id += 1
    for sid in random.sample(range(1, len(skill_master) + 1), k=random.randint(2, 4)):
        client_preferred_skill.append({"id": cps_id, "client_profile_id": cp["id"], "skill_id": sid})
        cps_id += 1

# ─────────────────────────────────────────────────────────────
# 11. partner_profile (30)
# ─────────────────────────────────────────────────────────────
partner_users = [u for u in users if u["user_type"] == "partner"]
partner_profile = []
for idx, u in enumerate(partner_users, start=1):
    salary_h = random.randint(30_000, 120_000)
    salary_m = salary_h * 160
    partner_profile.append({
        "id": idx,
        "user_id": u["id"],
        "name": random.choice(K_LAST) + random.choice(K_FIRST),
        "title": PARTNER_TITLES[(idx - 1) % len(PARTNER_TITLES)],
        "hero_key": random.choice(HERO_KEYS),
        "service_field": random.choice(INDUSTRIES),
        "work_category": random.choice(PARTNER_WORK_CATEGORIES),
        "job_roles": random.sample(JOB_ROLES, k=random.randint(1, 3)),
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
        "slogan": PARTNER_TITLES[(idx - 1) % len(PARTNER_TITLES)],
        "slogan_sub": f"{random.choice(DEV_LEVELS)} · {random.choice(DEV_EXPERIENCES)}년 경험",
        "salary_hour": salary_h,
        "salary_month": salary_m,
        "github_url": f"https://github.com/{u['username']}",
        "blog_url": None,
        "youtube_url": None,
        "portfolio_file_url": f"https://cdn.devbridge.com/portfolio/{u['id']}.pdf",
        "portfolio_file_tag": random.sample(["웹", "백엔드", "모바일", "디자인", "AI"], k=2),
        "bio_file_url": f"https://cdn.devbridge.com/bio/{u['id']}.pdf",
        "bio_file_tag": ["경력", "포트폴리오"],
        "hashtags": random.sample(["#열정", "#성실", "#빠른소통", "#품질우선", "#장기협업"], k=3),
        "bio": "다양한 도메인에서 실무 경험을 쌓아온 개발자입니다.",
        "strength_desc": "분산 시스템 설계, 성능 튜닝, 팀 리딩에 강점이 있습니다.",
        "avatar_color": random.choice(AVATAR_COLORS),
        "grade": random.choice(GRADES),
    })

# ─────────────────────────────────────────────────────────────
# 12. partner_profile_detail
# ─────────────────────────────────────────────────────────────
partner_profile_detail = []
for pp in partner_profile:
    partner_profile_detail.append({
        "id": pp["id"],
        "partner_profile_id": pp["id"],
        "show_intro": True,
        "show_skills": True,
        "show_career": True,
        "show_education": random.choice([True, False]),
        "show_certificates": random.choice([True, False]),
        "show_awards": random.choice([True, False]),
        "show_portfolio": True,
        "show_client_reviews": True,
        "show_active_projects": True,
        "detailed_bio": "다수의 스타트업에서 리드 엔지니어로 근무했습니다.",
        "core_strengths": "문제 정의 능력, 빠른 프로토타이핑, 팀 커뮤니케이션.",
        "experience_json": [
            {
                "companyName": "TechCorp",
                "jobTitle": "Senior Engineer",
                "startDate": "2022-03",
                "endDate": "2024-06",
                "isCurrent": False,
                "employmentType": "정규직",
                "role": "풀스택 개발자",
                "level": "시니어",
                "description": "SaaS 플랫폼 메인 개발자로 근무.",
                "projects": [
                    {"name": "SaaS 구독 결제 시스템", "desc": "Stripe API 연동", "period": "2022.03 ~ 2022.09"}
                ],
            }
        ],
        "education_json": [
            {"schoolName": "한국대학교", "major": "컴퓨터공학", "degree": "학사", "graduationDate": "2018-02"}
        ],
        "certificates_json": [
            {"certName": "정보처리기사", "issuer": "한국산업인력공단", "acquiredDate": "2020-11-20"}
        ],
        "awards_json": [],
        "created_at": dt(-random.randint(30, 365)),
        "updated_at": dt(-random.randint(0, 20)),
    })

# ─────────────────────────────────────────────────────────────
# 13. partner_profile_stats
# ─────────────────────────────────────────────────────────────
partner_profile_stats = []
for pp in partner_profile:
    exp_years = {"0-1": 1, "1-3": 2, "3-5": 4, "5-10": 7, "10+": 12}[pp["dev_experience"]]
    partner_profile_stats.append({
        "id": pp["id"],
        "partner_profile_id": pp["id"],
        "experience_years": exp_years,
        "completed_projects": random.randint(5, 40),
        "rating": round(random.uniform(3.5, 5.0), 1),
        "response_rate": random.randint(60, 98),
        "repeat_rate": random.randint(30, 85),
        "availability_days": random.randint(3, 20),
    })

# ─────────────────────────────────────────────────────────────
# 14-15. partner_skill / partner_advanced_skills
# ─────────────────────────────────────────────────────────────
partner_skill = []
partner_advanced_skills = []
ps_id = pas_id = 1
for pp in partner_profile:
    for sid in random.sample(range(1, len(skill_master) + 1), k=random.randint(3, 6)):
        partner_skill.append({"id": ps_id, "partner_profile_id": pp["id"], "skill_id": sid})
        ps_id += 1
    if random.random() < 0.6:
        for sid in random.sample(range(1, len(skill_master) + 1), k=random.randint(1, 3)):
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
# 16. partner_reviews
# ─────────────────────────────────────────────────────────────
partner_reviews = []
pr_id = 1
client_user_ids = [u["id"] for u in client_users]
for pp in partner_profile:
    n = random.randint(2, 4)
    for _ in range(n):
        partner_reviews.append({
            "id": pr_id,
            "partner_profile_id": pp["id"],
            "reviewer_user_id": random.choice(client_user_ids),
            "rating": round(random.uniform(3.5, 5.0), 1),
            "comment": random.choice(REVIEW_COMMENTS),
            "project_id": None,  # 아래에서 projects 생성 후 다시 채울 수도 있음
            "created_at": dt(-random.randint(10, 200)),
        })
        pr_id += 1

# ─────────────────────────────────────────────────────────────
# 19. projects (30)
# ─────────────────────────────────────────────────────────────
projects = []
for i in range(1, 31):
    is_outsource = i <= 15
    project_type = "outsource" if is_outsource else "fulltime"
    title = (PROJECT_TITLES_OUTSOURCE if is_outsource else PROJECT_TITLES_FULLTIME)[
        i - 1 if is_outsource else i - 16
    ]
    budget_min = random.randint(500, 4000)
    budget_max = budget_min + random.randint(300, 3000)
    duration = random.randint(2, 12)
    start_off = random.randint(7, 60)
    deadline_off = random.randint(3, 30)

    projects.append({
        "id": i,
        "user_id": random.choice(client_user_ids),
        "project_type": project_type,
        "title": title,
        "slogan": title,
        "slogan_sub": f"예산 {budget_min:,}~{budget_max:,}만원 | 기간 {duration}개월",
        "desc": f"{title} - 핵심 기능 구현과 성능 최적화를 진행합니다.",
        "detail_content": f"{title}에 대한 상세 업무 설명입니다. 레거시 시스템 개선, 신규 기능 개발, 성능 튜닝 및 운영 자동화까지 포함됩니다.",
        "service_field": random.choice(INDUSTRIES),
        "grade": random.choice(GRADES),
        "work_scope": random.sample(WORK_SCOPES, k=random.randint(1, 3)),
        "category": random.sample(CATEGORIES, k=random.randint(1, 2)),
        "tags": random.sample(["#AI/ML", "#Python", "#Fintech", "#Mobile", "#Web", "#Flutter",
                               "#Blockchain", "#React", "#Spring"], k=random.randint(2, 4)),
        "reference_file_url": f"https://cdn.devbridge.com/projects/{i}/ref.pdf" if random.random() < 0.5 else None,
        "visibility": random.choice(VISIBILITIES),
        "budget_min": budget_min,
        "budget_max": budget_max,
        "budget_amount": (budget_min + budget_max) * 10_000 // 2,
        "is_partner_free": random.random() < 0.2,
        "start_date_negotiable": random.random() < 0.4,
        "start_date": date_only(start_off),
        "duration_months": duration,
        "schedule_negotiable": random.random() < 0.5,
        "meeting_type": random.choice(MEETING_TYPES),
        "meeting_freq": random.choice(MEETING_FREQS),
        "meeting_tools": random.sample(MEETING_TOOLS_POOL, k=random.randint(2, 4)),
        "deadline": date_only(deadline_off),
        "gov_support": random.random() < 0.15,
        "req_tags": random.sample(["신입가능", "경력우대", "원격가능", "정규직전환", "장기계약"], k=random.randint(1, 3)),
        "questions": [
            "해당 도메인에서의 실무 경험을 간단히 소개해 주세요.",
            "가장 어려웠던 기술적 문제와 해결 과정을 설명해 주세요.",
        ] if random.random() < 0.7 else [],
        "it_exp": random.random() < 0.5,
        "collab_planning": random.randint(0, 2),
        "collab_design": random.randint(0, 2),
        "collab_publishing": random.randint(0, 1),
        "collab_dev": random.randint(1, 4),
        "additional_file_url": None,
        "additional_comment": None,
        "status": random.choice(PROJECT_STATUSES),
        "avatar_color": random.choice(AVATAR_COLORS),
        "created_at": dt(-random.randint(5, 90)),
        "updated_at": dt(-random.randint(0, 4)),
        # 외주 전용
        "outsource_project_type": random.choice(OUTSOURCE_PROJECT_TYPES) if is_outsource else None,
        "ready_status": random.choice(READY_STATUSES) if is_outsource else None,
        # 상주 전용
        "work_style": random.choice(WORK_STYLES) if not is_outsource else None,
        "work_location": random.choice(LOCATIONS) if not is_outsource else None,
        "work_days": random.choice(WORK_DAYS) if not is_outsource else None,
        "work_hours": random.choice(WORK_HOURS) if not is_outsource else None,
        "contract_months": duration if not is_outsource else None,
        "monthly_rate": random.randint(400, 900) if not is_outsource else None,
        "dev_stage": random.choice(DEV_STAGES) if not is_outsource else None,
        "team_size": random.choice(TEAM_SIZES) if not is_outsource else None,
        "current_stacks": random.sample([s[0] for s in SKILLS], k=random.randint(2, 5)) if not is_outsource else None,
        "current_status": "현재 MVP 완료 단계이며 운영 안정화와 신규 기능 개발을 병행 중입니다." if not is_outsource else None,
    })

# ─────────────────────────────────────────────────────────────
# 20. project_recruit_roles
# ─────────────────────────────────────────────────────────────
project_recruit_roles = []
prr_id = 1
for p in projects:
    n = random.randint(1, 3) if p["project_type"] == "fulltime" else random.randint(0, 2)
    for _ in range(n):
        project_recruit_roles.append({
            "id": prr_id,
            "project_id": p["id"],
            "role_job": random.choice(JOB_ROLES),
            "experience": random.choice(["신입", "1-3년", "3-5년", "5-10년", "10년 이상"]),
            "level": random.choice(["주니어", "미드레벨", "시니어", "리드/매니저"]),
            "salary": f"{random.randint(400, 900)}만원",
            "skills": random.sample([s[0] for s in SKILLS], k=random.randint(2, 4)),
            "requirement": "해당 도메인 실무 경험 및 원활한 커뮤니케이션 능력 보유자",
            "headcount": random.randint(1, 3),
        })
        prr_id += 1

# ─────────────────────────────────────────────────────────────
# 21. project_skill_mapping
# ─────────────────────────────────────────────────────────────
project_skill_mapping = []
psm_id = 1
for p in projects:
    required_ids = random.sample(range(1, len(skill_master) + 1), k=random.randint(2, 3))
    preferred_ids = random.sample(
        [x for x in range(1, len(skill_master) + 1) if x not in required_ids],
        k=random.randint(1, 3),
    )
    for sid in required_ids:
        project_skill_mapping.append({"id": psm_id, "project_id": p["id"], "skill_id": sid, "is_required": True})
        psm_id += 1
    for sid in preferred_ids:
        project_skill_mapping.append({"id": psm_id, "project_id": p["id"], "skill_id": sid, "is_required": False})
        psm_id += 1

# ─────────────────────────────────────────────────────────────
# 22. project_field_mapping
# ─────────────────────────────────────────────────────────────
project_field_mapping = []
pfm_id = 1
for p in projects:
    for fid in random.sample(range(1, len(project_field_master) + 1), k=random.randint(1, 2)):
        project_field_mapping.append({"id": pfm_id, "project_id": p["id"], "field_id": fid})
        pfm_id += 1

# ─────────────────────────────────────────────────────────────
# 23. project_tags
# ─────────────────────────────────────────────────────────────
project_tags = []
pt_id = 1
for p in projects:
    for t in p["tags"]:
        project_tags.append({"id": pt_id, "project_id": p["id"], "tag": t})
        pt_id += 1

# partner_reviews에 project_id 채우기
project_ids = [p["id"] for p in projects]
for pr in partner_reviews:
    if random.random() < 0.7:
        pr["project_id"] = random.choice(project_ids)

# ─────────────────────────────────────────────────────────────
# 24. user_interest_projects / user_interest_partners
# ─────────────────────────────────────────────────────────────
user_interest_projects = []
uip_id = 1
for u in users:
    for pid in random.sample(project_ids, k=random.randint(1, 3)):
        user_interest_projects.append({
            "id": uip_id,
            "user_id": u["id"],
            "project_id": pid,
            "created_at": dt(-random.randint(1, 60)),
        })
        uip_id += 1

user_interest_partners = []
uipa_id = 1
partner_profile_ids = [p["id"] for p in partner_profile]
for u in users:
    for ppid in random.sample(partner_profile_ids, k=random.randint(1, 3)):
        user_interest_partners.append({
            "id": uipa_id,
            "user_id": u["id"],
            "partner_profile_id": ppid,
            "created_at": dt(-random.randint(1, 60)),
        })
        uipa_id += 1

# ─────────────────────────────────────────────────────────────
# 저장 (24개)
# ─────────────────────────────────────────────────────────────
print(f"Writing to: {OUT_DIR}\n")
write_json("users.json", users)
write_json("user_verifications.json", user_verifications)
write_json("user_interest_projects.json", user_interest_projects)
write_json("user_interest_partners.json", user_interest_partners)
write_json("client_profile.json", client_profile)
write_json("client_profile_detail.json", client_profile_detail)
write_json("client_profile_stats.json", client_profile_stats)
write_json("client_skill.json", client_skill)
write_json("client_advanced_skills.json", client_advanced_skills)
write_json("client_preferred_skill.json", client_preferred_skill)
write_json("partner_profile.json", partner_profile)
write_json("partner_profile_detail.json", partner_profile_detail)
write_json("partner_profile_stats.json", partner_profile_stats)
write_json("partner_skill.json", partner_skill)
write_json("partner_advanced_skills.json", partner_advanced_skills)
write_json("partner_reviews.json", partner_reviews)
write_json("skill_master.json", skill_master)
write_json("project_field_master.json", project_field_master)
write_json("projects.json", projects)
write_json("project_recruit_roles.json", project_recruit_roles)
write_json("project_skill_mapping.json", project_skill_mapping)
write_json("project_field_mapping.json", project_field_mapping)
write_json("project_tags.json", project_tags)

total = sum(f.stat().st_size for f in OUT_DIR.glob("*.json"))
print(f"\nTotal: {total:,} bytes ({total/1024:.1f} KB)")
