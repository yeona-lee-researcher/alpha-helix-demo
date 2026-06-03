"""
DevBridge 목업 데이터 생성기
- mockPartners.json: 500명
- mockProjects.json: 1000개
- mockClients.json:  300명
"""
import json, random, math, os

random.seed(42)

# ─── 공통 풀 ──────────────────────────────────────────────────────────────────
COLORS = [
    "#6366F1","#0EA5E9","#10B981","#F59E0B","#8B5CF6",
    "#EF4444","#06B6D4","#F97316","#84CC16","#EC4899",
    "#A78BFA","#22D3EE","#4ADE80","#FB923C","#38BDF8",
    "#34D399","#FBBF24","#F472B6","#C084FC","#2DD4BF",
]
HERO_KEYS = ["default","student","money","vacation","teacher","check","meeting"]
GRADES = ["diamond","platinum","gold","silver"]
GRADE_W = [5, 15, 40, 40]
LEVELS = ["주니어","미들","시니어"]
LEVEL_W = [30, 45, 25]
PARTNER_TYPES = ["개인","팀","기업"]
PARTNER_TYPE_W = [50, 30, 20]
WORK_PREF_PARTNER = ["외주 선호","상주 선호"]
SERVICE_FIELDS = [
    "AI","업무 시스템","IT 서비스","앱 제작","웹사이트",
    "디자인/기획","커머스","클라우드","블록체인","SaaS",
    "핀테크","헬스케어","교육","게임","IoT",
]
CLIENT_TYPES = ["법인사업자","개인사업자","개인","팀"]
VERIF_OPTIONS = ["본인인증 완료","사업자등록 완료","평가 우수"]

# 기술 스택
TECH_POOL = [
    "React","Vue.js","Next.js","Nuxt.js","Angular","TypeScript","JavaScript","Svelte",
    "Python","FastAPI","Django","Flask","Node.js","Express","NestJS",
    "Spring Boot","Java","Kotlin","Go","Rust","C#","ASP.NET",
    "Swift","SwiftUI","React Native","Flutter","Dart","Kotlin Multiplatform",
    "PostgreSQL","MySQL","MongoDB","Redis","Elasticsearch","DynamoDB","SQLite",
    "AWS","GCP","Azure","Docker","Kubernetes","Terraform","Ansible",
    "Kafka","RabbitMQ","gRPC","GraphQL","REST API",
    "TensorFlow","PyTorch","Scikit-learn","MLflow","Hugging Face","LangChain","LLM",
    "Figma","Adobe XD","Framer","Zeplin","Storybook",
    "Prisma","Supabase","Firebase","Vercel","Netlify",
    "Jenkins","GitHub Actions","CircleCI","ArgoCD",
    "Unity","Unreal Engine","Solidity","Web3.js","Ethereum",
]

# 한국 이름
SURNAMES = ["김","이","박","최","정","강","조","윤","장","임","한","오","서","신","권","황","안","송","류","전","홍","고","문","양","손","배","백","허","유","남","심","노","정","하","곽","성","차","우","구","민","진","지","엄","채","원","천","방","공","현","함","변","염","여","추","도","소","설","석","선","마","길","주","연","표","명","기","반","왕","나","금","옥"]
FIRST_NAMES_M = ["준혁","성민","태원","동현","진혁","민준","서준","도윤","예준","시우","주원","하준","지호","지훈","지환","지원","현우","민재","건우","현진","선우","우진","민혁","준영","재원","재현","재민","용준","태준","태양","세준","경민","현성","태성","재성","성준","민성","정우","영민","영준","영재","영호","지성","준서","준성","준혁","혁진","기준","기현","성호","동준","대현","기영","재혁","현수","현석","현철","성철","민철","동철","대철"]
FIRST_NAMES_F = ["지연","소연","하영","민지","유나","은지","예린","수진","지원","서현","지현","서연","유진","민서","지아","서영","예원","수빈","다은","가은","나은","하은","채원","지은","소은","세연","예지","민아","지민","수민","가영","다혜","혜린","예슬","수현","미래","소현","태희","은혜","은비","혜원","채린","혜진","현정","소정","수정","아름","나래","해원","별이","하람","보라","다인","아인","다현","보현"]

def rname(gender=None):
    s = random.choice(SURNAMES)
    if gender == "M": return s + random.choice(FIRST_NAMES_M)
    if gender == "F": return s + random.choice(FIRST_NAMES_F)
    return s + random.choice(FIRST_NAMES_M + FIRST_NAMES_F)

def gender_of(name):
    return "M" if any(name[-2:] == n[-2:] for n in FIRST_NAMES_M) else "F"

COMPANY_PREFIXES = [
    "테크","넥스트","스마트","디지털","글로벌","넥서스","알파","베타","오픈","클라우드",
    "데이터","아이오","솔루션","이노베이션","플랫폼","AI","블루","그린","레드","코어",
    "신한","현대","대우","두산","롯데","SK","KT","LG","제일","삼성","우리","국민",
    "비트","코드","소프트","네트","링크","스타","프라임","맥스","인피","비전",
]
COMPANY_SUFFIXES = ["랩스","테크","솔루션스","코퍼레이션","파트너스","스튜디오","웍스","소프트","시스템즈","커뮤니케이션","홀딩스","그룹","인베스트먼트","벤처스","인크","코","컴퍼니","디지털","플랫폼","서비스","네트웍스","캐피탈","리서치","클라우드","이노베이션"]

def company_name():
    return random.choice(COMPANY_PREFIXES) + random.choice(COMPANY_SUFFIXES)

def price_str(mn, mx):
    v = random.randint(mn, mx) * 100
    if v >= 10000:
        return f"{v//10000}억 {(v%10000)//100}백만원" if v % 10000 else f"{v//10000}억원"
    return f"{v//100:,}만원"

def period_str():
    choices = ["2주","3주","4주","5주","6주","2개월","3개월","4개월","5개월","6개월","8개월","1년","연장가능"]
    w = [3,3,5,3,5,10,15,10,8,8,5,3,5]
    return random.choices(choices, weights=w, k=1)[0]

def phone_str(i):
    return f"010-{(i%9000+1000):04d}-{(i*7%9000+1000):04d}"

def email_str(uid):
    domains = ["techbridge.kr","dev.io","labs.kr","studio.io","works.dev","mail.com","code.kr","soft.io","team.kr","pro.dev"]
    return f"{uid}@{random.choice(domains)}"

def pick_tags(n=None):
    n = n or random.randint(2, 5)
    return random.sample(TECH_POOL, min(n, len(TECH_POOL)))

def weighted_choice(items, weights):
    return random.choices(items, weights=weights, k=1)[0]

# ─── 슬로건/설명 템플릿 ───────────────────────────────────────────────────────
PARTNER_SLOGANS = [
    "{}와 {}의 경계를 허무는 풀스택 엔지니어",
    "{} 기반의 고성능 {} 시스템을 구축합니다",
    "{} 전문가 — 실무 {}년 경험",
    "{}로 사용자 경험을 극대화하는 개발자",
    "{} 아키텍처 설계부터 {} 배포까지",
    "{}와 {} 통합 자동화 전문",
    "글로벌 {} 서비스를 위한 {} 엔지니어",
    "{} 기반 {} 도메인 전문 개발 팀",
    "{} 최적화와 {} 연동 경험 다수",
    "{}로 {} 플랫폼을 혁신합니다",
]
PROJECT_SLOGANS = [
    "{} 기반 {} 플랫폼 구축",
    "{} 서비스 {} 고도화 프로젝트",
    "{} 시스템 {} 전환 및 최적화",
    "{} 앱 {} 기능 개발",
    "{} 대시보드 {} 구현",
    "{} 자동화 {} 파이프라인 구축",
    "{} 연동 {} API 개발",
    "{} 기능 고도화 및 {} 리팩터링",
    "{} 도입을 위한 {} 마이그레이션",
    "{} 분석 {} 인사이트 시스템 개발",
]

def partner_slogan(tags, sf):
    tmpl = random.choice(PARTNER_SLOGANS)
    aa = [tags[0] if tags else sf, tags[1] if len(tags) > 1 else sf]
    return tmpl.format(*aa)

def project_slogan(tags, sf):
    tmpl = random.choice(PROJECT_SLOGANS)
    aa = [tags[0] if tags else sf, tags[1] if len(tags) > 1 else sf]
    return tmpl.format(*aa)

DESC_TEMPLATES = [
    "{}를 활용하여 {} 도메인의 핵심 기능을 구현하고 성능을 최적화하는 프로젝트입니다.",
    "{} 기반으로 {} 서비스의 사용자 경험을 혁신하고 확장성을 높이는 작업입니다.",
    "{}와 {} 기술을 결합해 실시간 데이터 처리와 안정적인 서비스를 제공합니다.",
    "{} 아키텍처로 {} 시스템을 재설계하여 유지보수성과 개발 생산성을 높입니다.",
    "{} 플랫폼 위에서 {} 기능을 고도화하고 운영 효율을 극대화하는 프로젝트입니다.",
    "{}를 도입하여 {} 업무 프로세스를 자동화하고 비용을 절감합니다.",
    "{} 기술로 {} 분야의 신규 서비스를 빠르게 MVP 형태로 론칭합니다.",
    "{} 데이터 파이프라인 구축과 {} 분석 대시보드 개발을 병행하는 프로젝트입니다.",
]

def make_desc(tags):
    t = random.choice(DESC_TEMPLATES)
    aa = [tags[0] if tags else "최신 기술", tags[1] if len(tags) > 1 else "서비스"]
    return t.format(*aa)

# ─── 생성 함수 ────────────────────────────────────────────────────────────────

def gen_partners(n=500):
    partners = []
    for i in range(1, n + 1):
        gnd = "M" if i % 2 == 0 else "F"
        name = rname(gnd)
        uid = f"partner_{i:04d}"
        sf = random.choice(SERVICE_FIELDS)
        tags = pick_tags()
        grade = weighted_choice(GRADES, GRADE_W)
        level = weighted_choice(LEVELS, LEVEL_W)
        pt = weighted_choice(PARTNER_TYPES, PARTNER_TYPE_W)
        exp = random.randint(1, 16)
        comp = min(int(exp * random.uniform(2.5, 5.0)), 80)
        rat = round(random.uniform(3.8, 5.0), 1)
        mn = random.randint(3, 20) * 100   # 만원 단위
        mx = mn + random.randint(5, 30) * 100
        slogan = partner_slogan(tags, sf)
        slogan_sub = f"{tags[0]} 전문 · {level} · {exp}년 경험 · 완료 프로젝트 {comp}건"
        partners.append({
            "id": i,
            "userId": uid,
            "name": name,
            "avatarColor": random.choice(COLORS),
            "heroKey": random.choice(HERO_KEYS),
            "slogan": slogan,
            "sloganSub": slogan_sub,
            "desc": make_desc(tags),
            "tags": tags,
            "serviceField": sf,
            "partnerType": pt,
            "workPref": random.choice(WORK_PREF_PARTNER),
            "match": random.randint(50, 99),
            "price": price_str(mn // 100, mx // 100),
            "period": period_str(),
            "type": pt,
            "remote": random.choice([True, False]),
            "level": level,
            "grade": grade,
            "email": email_str(uid),
            "phone": phone_str(i),
            "experience": exp,
            "completedProjects": comp,
            "rating": rat,
        })
    return partners


def gen_clients(n=300):
    clients = []
    for i in range(1, n + 1):
        ct = weighted_choice(CLIENT_TYPES, [30, 30, 25, 15])
        is_corp = ct in ["법인사업자", "개인사업자", "팀"]
        org = company_name() if is_corp else rname()
        cid = f"client_{i:04d}"
        grade = weighted_choice(GRADES, GRADE_W)
        nv = random.randint(1, 3)
        verifs = random.sample(VERIF_OPTIONS, nv)
        comp = random.randint(0, 30)
        rat = round(random.uniform(3.5, 5.0), 1) if comp > 0 else None
        mgr = rname()
        clients.append({
            "id": i,
            "clientId": cid,
            "name": org,
            "avatarColor": random.choice(COLORS),
            "orgName": org,
            "clientType": ct,
            "managerName": mgr,
            "phone": phone_str(i + 5000),
            "email": email_str(cid),
            "slogan": f"{org}의 디지털 혁신 파트너를 찾습니다",
            "sloganSub": f"{ct} | {random.choice(SERVICE_FIELDS)} 분야 프로젝트 발주",
            "grade": grade,
            "verifications": verifs,
            "completedProjects": comp,
            "rating": rat,
        })
    return clients


def gen_projects(n=1000, clients=None):
    client_ids = [c["clientId"] for c in clients] if clients else [f"client_{i:04d}" for i in range(1, 301)]
    projects = []
    for i in range(1, n + 1):
        sf = random.choice(SERVICE_FIELDS)
        tags = pick_tags()
        grade = weighted_choice(GRADES, GRADE_W)
        level = weighted_choice(LEVELS, LEVEL_W)
        wp = random.choice(["외주", "상주"])
        pt = random.choice(["유료", "무료"])
        mn = random.randint(3, 20) * 100
        mx = mn + random.randint(5, 30) * 100
        slogan = project_slogan(tags, sf)
        slogan_sub = f"{tags[0]} · {tags[1] if len(tags) > 1 else sf} · {level} 수준 파트너 모집"
        nv = random.randint(1, 3)
        verifs = random.sample(VERIF_OPTIONS, nv)
        projects.append({
            "id": i,
            "clientId": random.choice(client_ids),
            "avatarColor": random.choice(COLORS),
            "slogan": slogan,
            "sloganSub": slogan_sub,
            "desc": make_desc(tags),
            "tags": tags,
            "serviceField": sf,
            "workPref": wp,
            "priceType": pt,
            "match": random.randint(50, 99),
            "price": price_str(mn // 100, mx // 100) if pt == "유료" else "팀 모임",
            "period": period_str(),
            "remote": random.choice([True, False]),
            "level": level,
            "grade": grade,
            "verifications": verifs,
        })
    return projects


# ─── 실행 ──────────────────────────────────────────────────────────────────────
BASE = os.path.join(os.path.dirname(__file__), "..", "src", "data")
os.makedirs(BASE, exist_ok=True)

print("▶ 파트너 500명 생성 중...")
partners = gen_partners(500)
with open(os.path.join(BASE, "mockPartners.json"), "w", encoding="utf-8") as f:
    json.dump(partners, f, ensure_ascii=False, indent=2)
print(f"  ✅ mockPartners.json → {len(partners)}명")

print("▶ 클라이언트 300명 생성 중...")
clients = gen_clients(300)
with open(os.path.join(BASE, "mockClients.json"), "w", encoding="utf-8") as f:
    json.dump(clients, f, ensure_ascii=False, indent=2)
print(f"  ✅ mockClients.json → {len(clients)}명")

print("▶ 프로젝트 1000개 생성 중...")
projects = gen_projects(1000, clients)
with open(os.path.join(BASE, "mockProjects.json"), "w", encoding="utf-8") as f:
    json.dump(projects, f, ensure_ascii=False, indent=2)
print(f"  ✅ mockProjects.json → {len(projects)}개")

print("\n🎉 완료! src/data/ 에 3개 파일이 생성되었습니다.")
