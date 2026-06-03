"""
DevBridge 목업 데이터 생성기 v2
- mockPartners.json : 3,000명
- mockClients.json  : 3,000명
- mockProjects.json : 3,000개

AI 추천 알고리즘 구조:
  1. 통일된 스킬 택소노미 + 카테고리 벡터 (Jaccard/코사인 유사도 계산용)
  2. 숫자형 예산 필드 budgetMin/Max (만원) — 범위 비교
  3. levelCode 1-4 숫자 인코딩 (거리 계산 가능)
  4. workPrefCode 0-2 (외주=1, 상주=2, 무관=0)
  5. requirements 객체 (프로젝트) & matchProfile 객체 (파트너) — 3방향 매칭 지원
  6. responseRate / repeatRate — 신뢰도 가중치
  7. 도메인별 스킬 코히어런스 (서비스 분야 → 스킬 선택이 현실적)
"""
import json, random, math, os
from datetime import datetime, timedelta

random.seed(2025)

# ────────────────────────────────────────────────────────────────────────────
# 1. 스킬 택소노미 (카테고리 → 스킬 목록)
# ────────────────────────────────────────────────────────────────────────────
SKILL_CAT = {
    "frontend"   : ["React","Vue.js","Next.js","Nuxt.js","Angular","TypeScript","Svelte",
                    "Tailwind CSS","Storybook","Gatsby","Vite","Webpack","Redux","Zustand",
                    "MobX","React Query","GraphQL Client"],
    "backend"    : ["Node.js","Express","NestJS","Spring Boot","Django","FastAPI","Flask",
                    "Go","Rust","Phoenix","Laravel","ASP.NET","Ruby on Rails","gRPC","GraphQL"],
    "mobile"     : ["React Native","Flutter","Swift","SwiftUI","Kotlin","Dart","Ionic",
                    "Xamarin","Kotlin Multiplatform"],
    "devops"     : ["Docker","Kubernetes","AWS","GCP","Azure","Terraform","Ansible",
                    "Jenkins","GitHub Actions","CircleCI","ArgoCD","Helm","Prometheus",
                    "Grafana","Nginx","Linux"],
    "data_ml"    : ["Python","TensorFlow","PyTorch","Scikit-learn","Pandas","Spark",
                    "Airflow","dbt","MLflow","LangChain","Hugging Face","LLM","Kafka",
                    "Elasticsearch","Hadoop","Flink","OpenCV","YOLO","XGBoost","Jupyter"],
    "database"   : ["PostgreSQL","MySQL","MongoDB","Redis","DynamoDB","Cassandra",
                    "Firebase","Supabase","SQLite","Oracle","ClickHouse","Pinecone"],
    "design"     : ["Figma","Adobe XD","Framer","Zeplin","Photoshop","Illustrator",
                    "Sketch","InVision","Lottie"],
    "blockchain" : ["Solidity","Web3.js","Ethereum","Hardhat","Truffle","IPFS","Rust"],
    "lang"       : ["Java","C#","C++","Python","Go","Rust","Kotlin","Swift","Scala","Perl"],
}

ALL_SKILLS = [s for cats in SKILL_CAT.values() for s in cats]

def skill_cats_of(skills):
    """스킬 목록 → 포함된 카테고리 목록"""
    cats = set()
    for cat, pool in SKILL_CAT.items():
        if any(s in pool for s in skills):
            cats.add(cat)
    return sorted(cats)

# ────────────────────────────────────────────────────────────────────────────
# 2. 서비스 분야 → 스킬 매핑 (코히어런스)
#    파트너 serviceField: PartnerSearch 필터값 사용
#    프로젝트 serviceField: ProjectSearch 필터값 사용
# ────────────────────────────────────────────────────────────────────────────
PARTNER_SERVICE_FIELDS = ["IT","SaaS","웹사이트","AI","앱 제작","유지보수",
                          "클라우드","커머스","디자인/기획","게임","핀테크","헬스케어","교육","블록체인"]
PROJECT_SERVICE_FIELDS = ["IT 서비스","업무 시스템","웹사이트","AI","앱 제작","유지보수",
                          "클라우드","커머스","디자인/기획","보안/인프라","핀테크","헬스케어"]

FIELD_SKILLS = {
    # 파트너 분야
    "AI"         : {"p": ["Python","TensorFlow","PyTorch","LangChain","Hugging Face","LLM","Scikit-learn","MLflow","Pandas","FastAPI"],
                    "s": ["Docker","AWS","Kafka","Spark","Airflow","PostgreSQL","Redis","Flask","Elasticsearch","Jupyter"]},
    "SaaS"       : {"p": ["React","TypeScript","Next.js","NestJS","Node.js","PostgreSQL","Prisma","Stripe"],
                    "s": ["AWS","Docker","Kubernetes","Redis","GraphQL","Tailwind CSS","Supabase","Vite"]},
    "웹사이트"    : {"p": ["React","Vue.js","TypeScript","Node.js","Next.js","MySQL","PostgreSQL"],
                    "s": ["AWS","Docker","Tailwind CSS","Figma","Redis","Nginx","Gatsby"]},
    "IT"         : {"p": ["Spring Boot","Java","PostgreSQL","Docker","Kubernetes","AWS"],
                    "s": ["Kafka","Redis","Jenkins","Angular","TypeScript","Oracle","MSA 설계"]},
    "앱 제작"    : {"p": ["React Native","Flutter","Swift","SwiftUI","Kotlin","Dart","Firebase"],
                    "s": ["Node.js","AWS","TypeScript","Redux","MobX","GraphQL","Supabase"]},
    "유지보수"   : {"p": ["Docker","Linux","Nginx","PostgreSQL","MySQL","Python","Bash"],
                    "s": ["AWS","Prometheus","Grafana","Jenkins","Redis","Node.js","Spring Boot"]},
    "클라우드"   : {"p": ["AWS","GCP","Azure","Kubernetes","Terraform","Docker","Ansible"],
                    "s": ["Python","Jenkins","GitHub Actions","ArgoCD","Prometheus","Grafana","Helm","Linux"]},
    "커머스"     : {"p": ["React","Next.js","Node.js","PostgreSQL","Redis","Elasticsearch"],
                    "s": ["TypeScript","AWS","Docker","MySQL","Kafka","Spring Boot","Python"]},
    "디자인/기획": {"p": ["Figma","Adobe XD","Framer","Zeplin","Sketch","InVision"],
                    "s": ["React","TypeScript","Lottie","Storybook","CSS","Photoshop","Illustrator"]},
    "게임"       : {"p": ["Unity","C#","Unreal Engine","C++","Blender"],
                    "s": ["Node.js","PostgreSQL","AWS","Redis","Python","WebSocket"]},
    "핀테크"     : {"p": ["Spring Boot","Java","PostgreSQL","AWS","Kafka","Docker"],
                    "s": ["React","TypeScript","Kubernetes","Redis","Oracle","Jenkins","MSA 설계"]},
    "헬스케어"   : {"p": ["Python","React","Spring Boot","PostgreSQL","AWS","FastAPI"],
                    "s": ["Node.js","Docker","MySQL","TypeScript","TensorFlow","MongoDB"]},
    "교육"       : {"p": ["React","Vue.js","Node.js","MySQL","AWS","Firebase"],
                    "s": ["TypeScript","Python","Docker","MongoDB","Spring Boot","WebRTC"]},
    "블록체인"   : {"p": ["Solidity","Web3.js","Ethereum","Hardhat","TypeScript"],
                    "s": ["React","Node.js","IPFS","Rust","Go","GraphQL","AWS"]},
    # 프로젝트 전용 분야 (파트너 기술과 겹치게)
    "IT 서비스"  : {"p": ["Spring Boot","Java","PostgreSQL","Docker","AWS","Kafka"],
                    "s": ["React","TypeScript","Kubernetes","Redis","Jenkins","Oracle"]},
    "업무 시스템": {"p": ["Spring Boot","Java","Oracle","PostgreSQL","Docker","Kafka"],
                    "s": ["Kubernetes","AWS","Jenkins","Angular","TypeScript","Redis"]},
    "보안/인프라": {"p": ["Linux","Docker","Kubernetes","AWS","Python","Terraform"],
                    "s": ["Ansible","Prometheus","Grafana","Nginx","Jenkins","Go","Rust"]},
}

def pick_skills(field, n_primary=3, n_secondary=2):
    """서비스 분야 기반 코히어런트 스킬 선택"""
    cfg = FIELD_SKILLS.get(field, FIELD_SKILLS["IT"])
    p_pool = cfg["p"]
    s_pool = cfg["s"]
    np_ = min(n_primary, len(p_pool))
    ns_ = min(n_secondary, len(s_pool))
    primary   = random.sample(p_pool, np_)
    secondary = random.sample([x for x in s_pool if x not in primary], min(ns_, len(s_pool)))
    return primary + secondary

# ────────────────────────────────────────────────────────────────────────────
# 3. 레벨 설정
# ────────────────────────────────────────────────────────────────────────────
LEVELS = ["주니어","미들","시니어","리드"]
LEVEL_CODE = {"주니어":1, "미들":2, "시니어":3, "리드":4}
LEVEL_CFG = {
    "주니어": {"exp": (1,3),  "hourly": (30000,60000),  "monthly": (280,500),  "w": 30},
    "미들"  : {"exp": (3,7),  "hourly": (60000,100000), "monthly": (500,900),  "w": 40},
    "시니어": {"exp": (7,15), "hourly": (95000,160000), "monthly": (850,1600), "w": 22},
    "리드"  : {"exp": (10,20),"hourly": (150000,250000),"monthly": (1400,2800),"w": 8},
}

def pick_level():
    ws = [LEVEL_CFG[l]["w"] for l in LEVELS]
    return random.choices(LEVELS, weights=ws, k=1)[0]

# ────────────────────────────────────────────────────────────────────────────
# 4. 이름 / 회사명 생성
# ────────────────────────────────────────────────────────────────────────────
SURNAMES   = list("김이박최정강조윤장임한오서신권황안송류전홍고문양손배백허유남심노하곽성차우구민진")
FIRST_M    = ["준혁","성민","태원","동현","진혁","민준","서준","도윤","예준","시우","주원","하준","지호","지훈","지환","현우","민재","건우","현진","선우","우진","민혁","준영","재원","재현","재민","용준","태준","세준","경민","현성","재성","성준","민성","정우","영민","영준","영재","영호","지성","준서","준성","혁진","기준","기현","성호","동준","대현","기영","재혁","현수","현석","현철","성철","민철","동철","대철","정현","상훈","민섭","태양","성욱"]
FIRST_F    = ["지연","소연","하영","민지","유나","은지","예린","수진","지원","서현","지현","서연","유진","민서","지아","서영","예원","수빈","다은","가은","나은","하은","채원","지은","소은","세연","예지","민아","지민","수민","가영","다혜","혜린","예슬","수현","미래","소현","태희","은혜","은비","혜원","채린","혜진","현정","소정","수정","아름","나래","해원","별이","하람","보라","다인","아인","다현","보현","가희","사랑","예나","소희","한빛"]

CO_PRE  = ["테크","넥스트","스마트","디지털","글로벌","넥서스","알파","오픈","클라우드","데이터",
           "아이오","솔루션","이노베이션","플랫폼","AI","블루","그린","코어","비트","코드","소프트",
           "네트","링크","스타","프라임","맥스","비전","제로","에이","비","씨","디","원","투","쓰리",
           "파이브","식스","세상","미래","신세계","하이","히어로","에이스","원더","유니","트리플"]
CO_SUF  = ["랩스","테크","솔루션스","코퍼레이션","파트너스","스튜디오","웍스","소프트","시스템즈",
           "커뮤니케이션","홀딩스","그룹","벤처스","인크","컴퍼니","디지털","플랫폼","서비스",
           "네트웍스","캐피탈","리서치","클라우드","이노베이션","인터렉티브","크리에이티브"]

COLORS = ["#6366F1","#0EA5E9","#10B981","#F59E0B","#8B5CF6","#EF4444","#06B6D4",
          "#F97316","#84CC16","#EC4899","#A78BFA","#22D3EE","#4ADE80","#FB923C",
          "#38BDF8","#34D399","#FBBF24","#F472B6","#C084FC","#2DD4BF","#818CF8",
          "#4F46E5","#7C3AED","#DB2777","#DC2626","#EA580C","#D97706","#65A30D"]
HERO_KEYS = ["default","student","money","vacation","teacher","check","meeting"]
GRADES    = ["diamond","platinum","gold","silver"]
GRADE_W   = [5,12,40,43]
VERIF_OPT = ["본인인증 완료","사업자등록 완료","평가 우수"]

def rname(i):
    g = "M" if i % 2 == 0 else "F"
    s = SURNAMES[i % len(SURNAMES)]
    f = (FIRST_M if g == "M" else FIRST_F)[i % (len(FIRST_M) if g=="M" else len(FIRST_F))]
    return s + f

def co_name(i):
    return CO_PRE[i % len(CO_PRE)] + CO_SUF[(i * 7) % len(CO_SUF)]

def phone(i):
    return f"010-{(i%9000+1000):04d}-{(i*7%9000+1000):04d}"

def email(uid):
    doms = ["tech.kr","dev.io","labs.kr","studio.io","works.dev","pro.dev","team.kr","code.kr"]
    return f"{uid}@{doms[hash(uid)%len(doms)]}"

def wc(items, weights):
    return random.choices(items, weights=weights, k=1)[0]

# ────────────────────────────────────────────────────────────────────────────
# 5. 텍스트 템플릿
# ────────────────────────────────────────────────────────────────────────────
PARTNER_SLOGAN_T = [
    "{f} 전문 {l} 개발자 — {s0}∙{s1} 핵심 역량",
    "{s0}와 {s1}로 {f} 서비스를 혁신합니다",
    "{l} {f} 전문가 — 실무 {e}년 완료 프로젝트 {c}건",
    "{s0} 아키텍처 설계부터 {s1} 배포까지 원스톱",
    "{f} 도메인 {e}년 경험 · {s0}∙{s1} 자동화 전문",
    "데이터 기반 {f} 솔루션 · {s0}+{s1} 최적화",
    "{s0} 기반 {f} SaaS 플랫폼 구축 전문 팀",
    "글로벌 {f} 프로젝트 경험 — {s0}∙{s1} 리드",
    "{l} {s0} 엔지니어 — {f} 레퍼런스 다수 보유",
    "{f} 품질 보증 · {s0}+{s1} CI/CD 파이프라인",
]
PARTNER_SUB_T = [
    "{s0} 전문 · {l} · 경력 {e}년 · 완료 {c}건",
    "주요 기술: {s0}, {s1} | {wt} 선호 | {e}년 경험",
    "{f} 레퍼런스 {c}건 · {s0}∙{s1} 코드 품질 우선",
    "응답률 {rr}% | 재계약률 {rep}% | {l} 등급",
    "{wt} 가능 · {s0}∙{s1}∙{s2} 풀스택 커버",
]
PROJECT_SLOGAN_T = [
    "{f} 기반 {s0}∙{s1} 플랫폼 구축",
    "{s0} 서비스 {s1} 고도화 프로젝트",
    "{f} 시스템 {s0} 전환 및 최적화",
    "{s0} 활용 {f} 앱·API 개발",
    "{f} 대시보드 {s0} 구현 프로젝트",
    "{s0} 자동화 파이프라인 구축 ({f})",
    "{s0}∙{s1} 연동 {f} 백엔드 API 개발",
    "{f} 기능 고도화 및 {s0} 리팩터링",
    "{s0} 도입 {f} 마이그레이션 프로젝트",
    "{f} 분석 인사이트 시스템 ({s0}∙{s1})",
]
PROJECT_SUB_T = [
    "{s0}∙{s1} 전문 {l} 파트너 모집 | 예산 {b}만원",
    "{f} 프로젝트 · {s0} 필수 · {wt} · {dur}",
    "{l} 이상 {s0} 개발자 모집 · {f} 레퍼런스 우대",
    "예산 {b}만원 | 기간 {dur} | {s0}∙{s1} 필수",
    "{f} 분야 {s0}+{s1} 풀스택 개발 · {l} 우대",
]
DESC_T = [
    "{s0}를 활용하여 {f} 도메인의 핵심 기능을 구현하고 성능을 최적화하는 프로젝트입니다.",
    "{s0} 기반으로 {f} 서비스의 사용자 경험을 혁신하고 확장성을 높이는 작업입니다.",
    "{s0}와 {s1}를 결합해 실시간 데이터 처리와 안정적인 {f} 서비스를 제공합니다.",
    "{s0} 아키텍처로 {f} 시스템을 재설계하여 유지보수성과 생산성을 높입니다.",
    "{f} 플랫폼 위에서 {s0} 기능을 고도화하고 운영 효율을 극대화합니다.",
    "{s0}를 도입하여 {f} 업무 프로세스를 자동화하고 비용을 절감합니다.",
    "{s0}∙{s1} 기술로 {f} 분야 MVP를 빠르게 론칭하는 프로젝트입니다.",
    "{s0} 데이터 파이프라인 구축과 {f} 분석 대시보드 개발을 병행합니다.",
    "{f} 레거시 시스템을 {s0} 마이크로서비스로 전환하는 대규모 프로젝트입니다.",
    "{s0} 기반 {f} 추천 엔진과 개인화 시스템을 구현합니다.",
]

def fmt_slogan(t, field, skills, level, exp, comp, workpref, rate, rep):
    s = skills + ["기타","기타","기타"]
    wt = "외주" if workpref == 1 else ("상주" if workpref == 2 else "무관")
    return t.format(f=field, s0=s[0], s1=s[1], s2=s[2],
                    l=level, e=exp, c=comp, wt=wt, rr=rate, rep=rep)

def fmt_proj_slogan(t, field, skills, level, budget, dur, workpref):
    s = skills + ["기타","기타","기타"]
    wt = "외주" if workpref == 1 else ("상주" if workpref == 2 else "무관")
    return t.format(f=field, s0=s[0], s1=s[1], l=level, b=f"{budget:,}", dur=dur, wt=wt)

def fmt_desc(t, field, skills):
    s = skills + ["기타","기타"]
    return t.format(f=field, s0=s[0], s1=s[1])

# ────────────────────────────────────────────────────────────────────────────
# 6. 예산/기간 헬퍼
# ────────────────────────────────────────────────────────────────────────────
DURATIONS = [
    ("2주",14),("3주",21),("1개월",30),("6주",42),("2개월",60),
    ("3개월",90),("4개월",120),("5개월",150),("6개월",180),
    ("8개월",240),("1년",365),("장기(1년+)",400),
]
DUR_W = [3,3,5,4,10,15,12,8,8,5,3,2]

def pick_duration():
    choice = random.choices(DURATIONS, weights=DUR_W, k=1)[0]
    return choice[0], choice[1]

def price_display(mn, mx):
    if mn == mx:
        return f"{mn:,}만원"
    return f"{mn:,}~{mx:,}만원"

def monthly_to_budget(monthly_mn, monthly_mx, dur_days):
    """월 단가 × 기간 → 프로젝트 예산 범위"""
    months = max(1, dur_days / 30)
    b_mn = int(monthly_mn * months * 0.8)
    b_mx = int(monthly_mx * months * 1.2)
    return max(100, b_mn), max(200, b_mx)

# ────────────────────────────────────────────────────────────────────────────
# 7. 파트너 생성
# ────────────────────────────────────────────────────────────────────────────
def gen_partners(n=3000):
    partners = []
    for i in range(1, n + 1):
        uid  = f"partner_{i:05d}"
        name = rname(i)
        sf   = PARTNER_SERVICE_FIELDS[i % len(PARTNER_SERVICE_FIELDS)]
        lv   = pick_level()
        lcfg = LEVEL_CFG[lv]
        exp  = random.randint(*lcfg["exp"])
        comp = int(exp * random.uniform(2.2, 4.5))
        rat  = round(max(3.0, min(5.0, 3.5 + exp * 0.1 + random.gauss(0.3, 0.25))), 1)
        grade    = wc(GRADES, GRADE_W)
        monthly  = random.randint(*lcfg["monthly"])
        hourly   = random.randint(*lcfg["hourly"])
        pref_mn  = int(monthly * 0.7)
        pref_mx  = int(monthly * 3.5)
        workpref = wc([1,2,0], [40,35,25])   # 1=외주,2=상주,0=무관
        remote   = random.random() < 0.55
        resp_r   = random.randint(70, 100)
        rep_r    = random.randint(30, 85)
        avail    = random.randint(0, 60)      # 며칠 후 투입 가능

        # 스킬 (primary 3-4개, secondary 1-3개)
        np_ = random.randint(3, 4)
        ns_ = random.randint(1, 3)
        skills = pick_skills(sf, np_, ns_)
        skill_categories = skill_cats_of(skills)

        pt_code = wc([0,1,2], [50,30,20])
        pt_label = ["개인","팀","기업"][pt_code]
        wp_label = ["무관","외주","상주"][workpref] + " 선호"

        # 텍스트
        slogan  = fmt_slogan(random.choice(PARTNER_SLOGAN_T), sf, skills, lv, exp, comp, workpref, resp_r, rep_r)
        slogan_sub = fmt_slogan(random.choice(PARTNER_SUB_T), sf, skills, lv, exp, comp, workpref, resp_r, rep_r)
        desc    = fmt_desc(random.choice(DESC_T), sf, skills)

        # 'price' 문자열 — 기존 필터 `parseInt(p.price.replace(/[^0-9]/g,""),10)*10000` 파싱 대응
        price_str  = f"{monthly:,}만원/월"

        # match = 품질 기반 점수 (50~99)
        match_score = min(99, int(45 + (exp/20)*25 + (rat-3.0)*15 + (comp/80)*10 + random.randint(0,10)))

        partners.append({
            # ── 기존 프론트엔드 필드 (호환 유지) ──
            "id"               : i,
            "userId"           : uid,
            "name"             : name,
            "title"            : slogan,          # PartnerSearch query 검색용
            "avatarColor"      : random.choice(COLORS),
            "heroKey"          : random.choice(HERO_KEYS),
            "slogan"           : slogan,
            "sloganSub"        : slogan_sub,
            "desc"             : desc,
            "tags"             : skills[:4],       # 필터 tech 검색용 (최대 4개)
            "serviceField"     : sf,
            "partnerType"      : pt_label,
            "type"             : pt_label,         # 타입 필터 p.type
            "workPref"         : wp_label,
            "remote"           : remote,
            "level"            : lv,
            "grade"            : grade,
            "match"            : match_score,
            "price"            : price_str,        # 예산 필터 parseInt 파싱용
            "period"           : pick_duration()[0],
            "email"            : email(uid),
            "phone"            : phone(i),
            "experience"       : exp,
            "completedProjects": comp,
            "rating"           : rat,
            # ── AI 매칭 필드 ──
            "skillSet"         : skills,           # 전체 스킬 (Jaccard 계산용)
            "skillCategories"  : skill_categories, # 카테고리 벡터
            "levelCode"        : LEVEL_CODE[lv],   # 1-4 숫자 (거리 계산)
            "hourlyRate"       : hourly,           # 원/시간
            "monthlyRate"      : monthly,          # 만원/월
            "responseRate"     : resp_r,           # 응답률 %
            "repeatRate"       : rep_r,            # 재계약률 %
            "availabilityDays" : avail,            # 투입 가능 D-day
            "workPrefCode"     : workpref,         # 0=무관,1=외주,2=상주
            "matchProfile"     : {
                "skillSet"       : skills,
                "skillCategories": skill_categories,
                "levelCode"      : LEVEL_CODE[lv],
                "remotePreferred": remote,
                "workPrefCode"   : workpref,
                "budgetRange"    : [pref_mn, pref_mx],   # 만원
                "serviceFields"  : [sf],
            },
        })
    return partners


# ────────────────────────────────────────────────────────────────────────────
# 8. 클라이언트 생성
# ────────────────────────────────────────────────────────────────────────────
CLIENT_TYPES = ["법인사업자","개인사업자","개인","팀"]
CLIENT_TYPE_W = [30,30,22,18]

INDUSTRY_BUDGET = {
    "AI":        (1500,12000), "SaaS":       (800,8000),
    "웹사이트":   (300,4000),   "IT":         (2000,15000),
    "앱 제작":   (600,5000),   "유지보수":   (200,3000),
    "클라우드":  (1500,10000), "커머스":     (500,6000),
    "핀테크":    (2000,15000), "헬스케어":   (1500,10000),
    "교육":      (400,5000),   "게임":       (800,8000),
    "블록체인":  (1000,8000),  "디자인/기획": (200,3000),
}

CLIENT_SLOGAN_T = [
    "{f} 분야 디지털 혁신 파트너를 찾습니다",
    "{f} 서비스 구축을 위한 전문 개발팀 모집",
    "{f} 플랫폼 개발 파트너 모집",
    "{f} 도메인 레퍼런스 있는 팀·기업 파트너 환영",
    "{f} 신규 서비스 MVP 개발 파트너 모집",
    "{f} 기술 고도화 및 운영 파트너를 찾습니다",
]

def gen_clients(n=3000):
    clients = []
    for i in range(1, n + 1):
        ct     = wc(CLIENT_TYPES, CLIENT_TYPE_W)
        is_org = ct in ["법인사업자","개인사업자","팀"]
        org    = co_name(i) if is_org else rname(i)
        cid    = f"client_{i:05d}"
        sf     = PARTNER_SERVICE_FIELDS[i % len(PARTNER_SERVICE_FIELDS)]
        brange = INDUSTRY_BUDGET.get(sf, (500,5000))
        b_mn   = random.randint(brange[0]//200, brange[1]//200) * 100
        b_mx   = b_mn + random.randint(2, 20) * 200
        grade  = wc(GRADES, GRADE_W)
        nv     = random.randint(1, 3)
        verifs = random.sample(VERIF_OPT, nv)
        comp   = random.randint(0, 25)
        rat    = round(random.uniform(3.2, 5.0), 1) if comp > 0 else None
        rep_r  = random.randint(20, 80)
        mgr    = rname(i + 10000)

        pref_skills  = pick_skills(sf, 2, 2)
        pref_levels  = random.sample(LEVELS[:3], random.randint(1,2))
        pref_wt_code = wc([0,1,2],[30,40,30])

        slogan     = fmt_proj_slogan(
            random.choice(CLIENT_SLOGAN_T),
            sf, pref_skills, random.choice(pref_levels), b_mn, "", pref_wt_code
        )
        slogan_sub = f"{ct} | {sf} 분야 | 예산 {b_mn:,}~{b_mx:,}만원"

        clients.append({
            "id"                : i,
            "clientId"          : cid,
            "name"              : org,
            "orgName"           : org,
            "avatarColor"       : random.choice(COLORS),
            "clientType"        : ct,
            "industry"          : sf,
            "managerName"       : mgr,
            "phone"             : phone(i + 5000),
            "email"             : email(cid),
            "slogan"            : slogan,
            "sloganSub"         : slogan_sub,
            "grade"             : grade,
            "verifications"     : verifs,
            "completedProjects" : comp,
            "postedProjects"    : comp + random.randint(0, 5),
            "rating"            : rat,
            "repeatRate"        : rep_r,
            # AI 매칭 필드
            "preferredSkills"   : pref_skills,
            "preferredLevels"   : pref_levels,
            "preferredWorkType" : pref_wt_code,
            "budgetMin"         : b_mn,
            "budgetMax"         : b_mx,
            "avgProjectBudget"  : int((b_mn + b_mx) / 2),
        })
    return clients


# ────────────────────────────────────────────────────────────────────────────
# 9. 프로젝트 생성
# ────────────────────────────────────────────────────────────────────────────
WORK_PREF_LABELS = {0:"무관",1:"외주",2:"상주"}

def gen_projects(n=3000, clients=None):
    client_ids = [c["clientId"] for c in clients] if clients else [f"client_{i:05d}" for i in range(1,3001)]
    client_map = {c["clientId"]: c for c in (clients or [])}

    projects = []
    today = datetime(2025, 4, 14)

    for i in range(1, n + 1):
        # 랜덤 클라이언트 선택 (같은 클라이언트가 여러 프로젝트 가능)
        cid    = random.choice(client_ids)
        cl     = client_map.get(cid, {})
        sf     = PROJECT_SERVICE_FIELDS[i % len(PROJECT_SERVICE_FIELDS)]

        # 스킬 (필수 2-3개, 우대 1-3개)
        req_n  = random.randint(2, 3)
        pref_n = random.randint(1, 3)
        req_skills  = pick_skills(sf, req_n, 0)
        pref_skills = pick_skills(sf, 0, pref_n)
        pref_skills = [s for s in pref_skills if s not in req_skills]
        all_skills  = req_skills + pref_skills

        lv     = wc(LEVELS[:3], [30,40,30])   # 리드는 프로젝트에 없음
        lv2    = wc(LEVELS[:3], [25,45,30])   # 2nd preferred level (occasionally same)
        lvs    = list({lv, lv2})              # 1-2개 가능 레벨
        lv_display = lvs[0] if len(lvs)==1 else f"{min(lvs, key=lambda x: LEVEL_CODE[x])} 이상"

        workpref   = wc([1,2,0],[40,35,25])
        remote_ok  = random.random() < 0.55
        grade      = wc(GRADES, GRADE_W)
        pr_type    = wc(["유료","무료/팀모임"],[85,15])

        dur_str, dur_days = pick_duration()

        # 예산 — 레벨 기반 현실적 범위
        lcfg   = LEVEL_CFG[lv]
        b_mn, b_mx = monthly_to_budget(lcfg["monthly"][0], lcfg["monthly"][1], dur_days)
        # client 예산 상한 반영
        cl_mx  = cl.get("budgetMax", b_mx)
        b_mx   = min(b_mx, cl_mx + random.randint(0, 500))
        b_mn   = min(b_mn, b_mx - 100)

        price_str = price_display(b_mn, b_mx) if pr_type == "유료" else "팀 모임"

        # 날짜
        deadline_dt  = today + timedelta(days=random.randint(7, 60))
        start_dt     = deadline_dt + timedelta(days=random.randint(7, 30))
        deadline_str = deadline_dt.strftime("%Y-%m-%d")
        start_str    = start_dt.strftime("%Y-%m-%d")

        # 상태 (70% 모집중, 20% 진행중, 10% 완료)
        status = wc(["모집중","진행중","완료"], [70,20,10])

        # 검증 (클라이언트 것 상속 or 새로 뽑기)
        nv     = random.randint(1, 3)
        verifs = cl.get("verifications") or random.sample(VERIF_OPT, nv)

        # match score
        match_score = min(99, int(50 + (LEVEL_CODE[lv]/4)*20 + random.randint(0,28)))

        slogan     = fmt_proj_slogan(random.choice(PROJECT_SLOGAN_T),
                                     sf, all_skills, lv, b_mn, dur_str, workpref)
        slogan_sub = fmt_proj_slogan(random.choice(PROJECT_SUB_T),
                                     sf, all_skills, lv, b_mn, dur_str, workpref)
        desc       = fmt_desc(random.choice(DESC_T), sf, all_skills)

        wt_label   = WORK_PREF_LABELS[workpref]

        projects.append({
            # ── 기존 프론트엔드 필드 (호환 유지) ──
            "id"           : i,
            "clientId"     : cid,
            "avatarColor"  : cl.get("avatarColor") or random.choice(COLORS),
            "slogan"       : slogan,
            "sloganSub"    : slogan_sub,
            "desc"         : desc,
            "tags"         : all_skills[:4],       # tech 필터용 (최대 4개)
            "serviceField" : sf,
            "workPref"     : wt_label,
            "priceType"    : pr_type,
            "remote"       : remote_ok,
            "level"        : lv_display if len(lvs)==1 else lv,  # 단일 문자열 — 레벨 필터 대응
            "grade"        : grade,
            "match"        : match_score,
            "price"        : price_str,
            "period"       : dur_str,
            "verifications": verifs,
            "status"       : status,
            # ── AI 매칭 필드 ──
            "budgetMin"         : b_mn if pr_type=="유료" else 0,
            "budgetMax"         : b_mx if pr_type=="유료" else 0,
            "durationDays"      : dur_days,
            "deadline"          : deadline_str,
            "expectedStartDate" : start_str,
            "workPrefCode"      : workpref,         # 0=무관,1=외주,2=상주
            "requirements"      : {
                "requiredSkills"  : req_skills,
                "preferredSkills" : pref_skills,
                "skillSet"        : all_skills,     # 합집합 (Jaccard 분모)
                "skillCategories" : skill_cats_of(all_skills),
                "levelCodes"      : [LEVEL_CODE[l] for l in lvs],
                "budgetRange"     : [b_mn, b_mx],
                "remoteAllowed"   : remote_ok,
                "workPrefCode"    : workpref,
                "durationDays"    : dur_days,
            },
        })
    return projects


# ────────────────────────────────────────────────────────────────────────────
# 10. 실행
# ────────────────────────────────────────────────────────────────────────────
BASE = os.path.join(os.path.dirname(__file__), "..", "src", "data")
os.makedirs(BASE, exist_ok=True)

print("▶ 파트너 3,000명 생성 중...")
partners = gen_partners(3000)
with open(os.path.join(BASE, "mockPartners.json"), "w", encoding="utf-8") as f:
    json.dump(partners, f, ensure_ascii=False, indent=2)
print(f"  ✅ mockPartners.json → {len(partners):,}명")

print("▶ 클라이언트 3,000명 생성 중...")
clients = gen_clients(3000)
with open(os.path.join(BASE, "mockClients.json"), "w", encoding="utf-8") as f:
    json.dump(clients, f, ensure_ascii=False, indent=2)
print(f"  ✅ mockClients.json  → {len(clients):,}명")

print("▶ 프로젝트 3,000개 생성 중...")
projects = gen_projects(3000, clients)
with open(os.path.join(BASE, "mockProjects.json"), "w", encoding="utf-8") as f:
    json.dump(projects, f, ensure_ascii=False, indent=2)
print(f"  ✅ mockProjects.json → {len(projects):,}개")

# ── 간단 통계 출력 ──
from collections import Counter
p_grades  = Counter(p["grade"]  for p in partners)
p_levels  = Counter(p["level"]  for p in partners)
p_fields  = Counter(p["serviceField"] for p in partners)
pr_status = Counter(p["status"] for p in projects)
print(f"""
📊 생성 통계
  파트너 등급: {dict(p_grades)}
  파트너 레벨: {dict(p_levels)}
  파트너 분야 (top5): {dict(Counter(p["serviceField"] for p in partners).most_common(5))}
  프로젝트 상태: {dict(pr_status)}
  프로젝트 분야 (top5): {dict(Counter(p["serviceField"] for p in projects).most_common(5))}
  평균 예산: {sum(p["budgetMin"] for p in projects if p["budgetMin"])//max(1,sum(1 for p in projects if p["budgetMin"])):,}만원 ~ {sum(p["budgetMax"] for p in projects if p["budgetMax"])//max(1,sum(1 for p in projects if p["budgetMax"])):,}만원
""")
print("🎉 완료!")
