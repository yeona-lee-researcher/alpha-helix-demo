# -*- coding: utf-8 -*-
"""
Diverse seed generator for DevBridge.

산출물:
  backend/docs/seed_diverse_300.sql

내용:
  Part A: hyleeyou(id=3043) / client_hylee(id=3044) 와 그들의 프로젝트(1165~1170)
          및 관련 row 만 남기고 모든 사용자/프로필/프로젝트/모듈을 삭제.
          (사용자가 직접 실행해야 하는 DELETE 블록)
  Part B: 파트너 200명 + 클라이언트 100명 + 클라이언트당 프로젝트 1개 + 프로젝트당
          7개 모듈(scope/deliverable/schedule/payment/revision/completion/terms)
          + 학력/경력/수상/포트폴리오/스킬/인증/리뷰/태그 다양화 INSERT.

주의:
  - hyleeyou(3043), client_hylee(3044) 및 그들의 모든 관련 row 는 절대 건드리지 않는다.
  - skill_master 는 그대로 둔다 (1~60 사용).
  - 새 user id 는 AUTO_INCREMENT 가 알아서 부여하지만 본 스크립트는 명시적으로
    @uid 변수를 잡아 자식 테이블에 사용한다.
"""

import os
import random
import textwrap
from datetime import date, timedelta

random.seed(20260424)

OUT_DIR = os.path.join(os.path.dirname(__file__), "..", "docs")
OUT_PATH = os.path.abspath(os.path.join(OUT_DIR, "seed_diverse_300.sql"))

# ---------------------------------------------------------------- 보호 데이터
HYLEE_PARTNER_ID = 3043
HYLEE_CLIENT_ID = 3044
HYLEE_PROJECT_IDS = (1165, 1166, 1167, 1168, 1169, 1170)
KEEP_USERS = (HYLEE_PARTNER_ID, HYLEE_CLIENT_ID)

PASSWORD_HASH = "$2b$10$mockHashedPassword"  # 기존 mock 과 동일

# ---------------------------------------------------------------- 풀 데이터
ADJ = [
    "fast","calm","bold","silent","cyber","neo","quantum","lunar","solar","prime",
    "swift","clever","brave","sharp","gentle","mighty","fluent","vivid","novel","bright",
    "quiet","royal","dynamic","stellar","nimble","crisp","fresh","keen","peak","epic",
]
NOUN = [
    "fox","wolf","lynx","whale","otter","eagle","falcon","tiger","panda","koala",
    "dragon","griffin","phoenix","owl","sparrow","raven","stag","bison","ibis","koi",
    "loon","crane","heron","puma","cobra","drake","shrike","mantis","oriole","seal",
]
ROLES_POOL = [
    "프론트엔드","백엔드","풀스택","AI/ML","데이터엔지니어","DevOps","모바일",
    "iOS","Android","UI/UX","QA","PM","데이터분석가","블록체인","게임개발",
    "보안","임베디드","클라우드","SRE","MLOps",
]
SERVICE_FIELDS = [
    "웹사이트","모바일","SaaS","핀테크","의료","교육","커머스","게임","미디어",
    "물류","HR테크","프롭테크","에듀테크","애드테크","블록체인","AI/ML","IoT",
    "유지보수","공공/B2G","스타트업MVP",
]
HASHTAG_POOL = [
    "#빠른소통","#품질우선","#성실","#장기협업","#열정","#기술력","#문서화","#테스트주도",
    "#클린코드","#리팩토링","#디자인감각","#사용자중심","#데이터기반","#문제해결","#멘토링",
    "#오픈소스","#스타트업경험","#대규모트래픽","#보안중시","#성능튜닝",
]
COMM_POOL = ["슬랙","디스코드","카카오톡","줌","구글미트","노션","지라","팀즈","이메일"]
HOURS_POOL = ["평일 오전","평일 오후","평일 저녁","주말 오전","주말 오후","평일 야간","상시"]
HERO_KEYS = ["teacher","meeting","student","coding","developer","check","default"]
DEV_LEVELS = ["JUNIOR","MIDDLE","SENIOR_5_7Y","SENIOR_7_10Y","LEAD"]
DEV_EXPS = ["UND_1Y","EXP_1_3Y","EXP_3_5Y","EXP_5_7Y","OVER_7Y"]
PARTNER_TYPES = ["INDIVIDUAL","TEAM","CORPORATION","SOLE_PROPRIETOR"]
WORK_CATEGORIES = ["PLANNING","DESIGN","DEVELOP","DISTRIBUTION"]
WORK_PREFERENCES = ["REMOTE","ONSITE","HYBRID"]
PREF_PROJECT_TYPES = ["FREELANCE","CONTRACT_BASED"]
GRADES = ["SILVER","GOLD","PLATINUM","DIAMOND"]
CLIENT_TYPES = ["INDIVIDUAL","TEAM","CORPORATION","SOLE_PROPRIETOR"]
INDUSTRIES = [
    "핀테크","이커머스","에듀테크","헬스케어","미디어","SaaS","B2B 솔루션","공공기관",
    "프롭테크","HR테크","스마트팩토리","O2O 플랫폼","게임","애드테크","블록체인",
]

SLOGAN_TEMPLATES = [
    "{tech} 기반 {domain} 서비스를 6주만에 런칭한 {role}",
    "스타트업 0→1 단계 {tech} {role} 풀패키지",
    "{domain} 도메인에서 {years}년 차 시니어 {role}",
    "{tech} 아키텍처 설계부터 운영까지 책임지는 {role}",
    "{domain} 산업에 특화된 {tech} {role}",
    "Daily Active 100K 이상 {domain} 서비스 운영 경험",
    "{tech} + Cloud 마이그레이션 전담 {role}",
    "MVP 부터 시리즈A 까지 함께한 {role}",
    "{domain} 분야 AI 모델 상용화 경험 {years}년",
    "{tech} 코드리뷰·멘토링 가능한 리드 {role}",
    "디자인 시스템부터 결제까지 책임지는 {tech} 풀스택",
    "10ms 이내 응답하는 {domain} API 설계 전문",
    "테스트 커버리지 80% 이상을 유지하는 {role}",
    "엔지니어링 블로그 운영 중인 {tech} {role}",
    "{domain} 분야 컴플라이언스(보안/개인정보) 대응 경험",
]
SLOGAN_SUB_POOL = [
    "고객 만족 1순위, 일정 준수 100%",
    "기술과 비즈니스를 함께 고민합니다",
    "유지보수까지 책임지는 파트너",
    "리팩토링과 문서화를 사랑하는 개발자",
    "스타트업 PM·CTO 경험 보유",
    "사이드 프로젝트로 본인 SaaS 운영 중",
    "오픈소스 컨트리뷰터 (별 1k+)",
    "기술 블로그 월 5만 PV",
    "TDD/DDD/클린아키텍처 적용 경험",
    "GCP/AWS 양쪽 인프라 운영",
    "Payments PCI-DSS 준수 시스템 구축",
    "GIS/Map 기반 위치 데이터 처리 경험",
    "추천 알고리즘 A/B 테스트 운영",
    "음성/영상 스트리밍 파이프라인 경험",
    "B2B SaaS Multi-tenant 설계 경험",
]
TECH_FOR_SLOGAN = [
    "React","Next.js","Vue","Spring Boot","Django","FastAPI","Node.js","Nest.js","Flutter",
    "Kotlin","Swift","Go","TensorFlow","PyTorch","GraphQL","Kafka","Kubernetes","AWS Lambda",
]
DOMAIN_FOR_SLOGAN = [
    "핀테크","커머스","교육","의료","게임","물류","SNS","B2B","미디어","HR","프롭테크","공공","구독",
]
SHORT_BIO_TEMPLATES = [
    "{years}년차 {role} · {tech} 전문",
    "{role} | {tech} | {domain}",
    "다양한 도메인에서 {tech} 활용 경험 풍부한 {role}",
    "{tech} 코어 컨트리뷰터 / {domain} 도메인 {years}년차",
    "조용히 코드로 말하는 {role}",
]

UNIVERSITIES = [
    "서울대학교","연세대학교","고려대학교","KAIST","POSTECH","UNIST","DGIST","GIST",
    "성균관대학교","한양대학교","서강대학교","중앙대학교","경희대학교","이화여자대학교",
    "숙명여자대학교","한국외국어대학교","건국대학교","동국대학교","홍익대학교","국민대학교",
    "세종대학교","숭실대학교","아주대학교","인하대학교","부산대학교","경북대학교","전남대학교",
    "충남대학교","충북대학교","제주대학교","Stanford University","UC Berkeley","MIT",
    "Carnegie Mellon","University of Tokyo","NUS","HKUST","ETH Zurich","TUM","TU Delft",
]
MAJORS = [
    "컴퓨터공학","소프트웨어학","전자공학","산업공학","수학","통계학","경영학","디자인학",
    "정보통신공학","산업디자인","뇌인지과학","데이터사이언스","인공지능학","미디어학","경제학",
    "물리학","화학공학","기계공학","로봇공학","산업경영공학","정보보호","HCI","융합소프트웨어",
]
SCHOOL_TYPES = ["대학교","대학원(석사)","대학원(박사)","고등학교","부트캠프"]
DEGREE_TYPES = ["학사","석사","박사","수료","고졸","부트캠프 수료"]

COMPANIES = [
    "네이버","카카오","쿠팡","우아한형제들","당근","토스","뱅크샐러드","비바리퍼블리카","라인",
    "삼성전자","LG전자","SK텔레콤","KT","현대오토에버","NHN","넥슨","엔씨소프트","스마일게이트",
    "마켓컬리","무신사","오늘의집","야놀자","리디","왓챠","SOCAR","Hyperconnect","센드버드",
    "Channel.io","Riiid","Lunit","뤼이드","뱅크샐러드","Wadiz","스푼라디오","드라마앤컴퍼니",
    "Toss Lab","Klaytn","두나무","빗썸","업비트","Naver Cloud","KakaoBank","TmaxSoft",
    "Coupang Eats","마이리얼트립","스타일쉐어","직방","호갱노노","열매컴퍼니","Spoon",
    "Wantedly","11번가","이베이코리아","Snow",
]
JOB_TITLES = [
    "프론트엔드 엔지니어","백엔드 엔지니어","풀스택 엔지니어","Android 엔지니어","iOS 엔지니어",
    "ML 엔지니어","데이터 엔지니어","DevOps 엔지니어","SRE","플랫폼 엔지니어",
    "보안 엔지니어","QA 엔지니어","PM","UX 디자이너","UI 디자이너","테크리드","CTO",
]
LEVELS = ["인턴","사원","주임","대리","과장","팀장","리드","파트장","책임","수석","상무"]
EMP_TYPES = ["정규직","계약직","인턴","프리랜서","스타트업 공동창업"]
ROLE_DETAIL = [
    "신규 결제 모듈 설계 및 구현","고객 대시보드 리뉴얼","검색 추천 시스템 개선",
    "쿠폰/이벤트 백오피스 개발","대규모 로그 파이프라인 구축","CI/CD 파이프라인 정비",
    "온보딩 플로우 개선","결제 실패 대응 자동화","글로벌 다국어 i18n 구축","모니터링 시스템 도입",
]
COMPANY_DESC_TEMPLATES = [
    "{role}로 합류하여 {tech} 기반 시스템을 {months}개월간 리드. 핵심 지표 {metric} 달성.",
    "{role} 포지션에서 {tech} 마이그레이션 프로젝트 진행, {metric} 의 비용 절감.",
    "{role}로서 신규 서비스의 {tech} 백엔드를 0→1 구축. {metric} 사용자 확보.",
    "기존 시스템의 {tech} 기반 리팩토링 및 성능 튜닝. {metric} 응답속도 개선.",
    "사내 {tech} 표준 가이드 작성 및 코드리뷰 문화 정착. 팀 생산성 {metric} 향상.",
]
METRICS = ["20%","35%","2배","5배","월 100만","월 50만","DAU 10만","p95 50ms","에러율 0.1%","비용 30%"]

AWARD_NAMES = [
    "대학생 프로그래밍 경진대회 대상","SW 마에스트로 우수상","해커톤 최우수상","Junction Asia 1위",
    "ACM-ICPC 본선 진출","ETRI 인공지능 챌린지 입상","2023 오픈소스 컨트리뷰톤 수상",
    "구글 코드페스티벌 참가","네이버 부스트캠프 수료 우수상","카카오 코드페스티벌 본선",
    "정보처리기사 합격","AWS Certified Solutions Architect","Google Cloud Professional",
    "ICPC 동상","Kaggle 메달","교내 우수 졸업상","사내 MVP 수상","스타트업 IR 데모데이 1위",
    "한국정보과학회 우수논문상","올해의 개발자상",
]
AWARDING_ORGS = [
    "과학기술정보통신부","삼성SDS","네이버","카카오","구글코리아","AWS","교육부","ETRI",
    "한국정보화진흥원","Junction","ACM","Kaggle","사내","KOSME","KISA","TIPS",
]

PORTFOLIO_TITLES = [
    "AI 챗봇 SaaS 'Convoy'","B2B HR Analytics 대시보드","개인정보 비식별화 SaaS",
    "MZ세대 중고거래 앱 'ReSell'","실시간 주식 시뮬레이터","의료영상 AI 분석 도구",
    "스마트팜 IoT 모니터링","교육용 인터랙티브 코스 플랫폼","대학생 시간표 공유 앱",
    "암호화폐 포트폴리오 트래커","렌탈 차량 GPS 관제","감성 일기 SNS 'Mood'",
    "패션 코디 추천 앱","베이커리 주문 POS","공공 데이터 시각화 대시보드",
    "여행 일정 자동 생성 도구","법률 문서 검색 엔진","NFT 마켓플레이스",
    "팀 회고 보드 'Reflect'","구독 결제 통합 SaaS",
]
PORTFOLIO_ROLES = ["풀스택","프론트엔드","백엔드","ML 엔지니어","PM","UX 디자이너","DevOps","모바일"]
PORTFOLIO_PERIODS = ["3개월","6개월","9개월","1년","1년 6개월","2년"]

# 프로젝트 (클라이언트)용
PROJECT_TITLES = [
    "AI 기반 고객 응대 챗봇 구축","온라인 쇼핑몰 풀 리뉴얼","B2B 결제 SaaS 신규 개발",
    "물류 트래킹 모바일 앱","의료기록 클라우드 마이그레이션","스마트팜 IoT 대시보드",
    "교육 LMS 플랫폼 고도화","핀테크 KYC 모듈 개발","O2O 예약 플랫폼 MVP",
    "프롭테크 매물 추천 엔진","HR 평가 자동화 시스템","구독 결제 게이트웨이",
    "공공 데이터 시각화 포털","B2C 영상 스트리밍 앱","글로벌 e-Commerce 다국어 지원",
    "블록체인 기반 NFT 마켓","SNS 광고 분석 SaaS","의료 영상 AI 진단 보조",
    "스마트 팩토리 MES 모듈","AI 추천 음악 스트리밍","법률 문서 자동 요약",
    "주식 시뮬레이터 백엔드","대학생 매칭 동아리 앱","친환경 중고거래 플랫폼",
    "도서관 좌석 예약 시스템","음식 배달 라이더 앱","렌터카 예약 플랫폼",
    "하이브리드 워크 관리 SaaS","사내 위키 검색 엔진","고객 CS 통합 콘솔",
]
PROJECT_DESC_TEMPLATES = [
    "{title} 프로젝트입니다. 주요 사용자는 {target} 이며, 핵심 가치는 {value} 입니다. "
    "{months}개월 내 {milestone} 까지 도달하는 것이 목표입니다.",
    "기존 시스템의 한계를 극복하고 {value} 를 제공하기 위한 {title}. "
    "{tech} 기반 아키텍처로 {milestone} 달성을 목표로 합니다.",
    "{target} 를 위한 신규 {title}. {tech} 스택으로 {months}개월 내 베타 오픈, "
    "{milestone} 까지 확장 예정.",
]
TARGETS = ["B2C 일반 사용자","중소기업 담당자","대학생 및 사회 초년생","핀테크 사업자",
           "병원/의료진","공공기관 담당자","스타트업 창업가","해외 바이어","프리랜서","교사 및 학부모"]
VALUES = ["개인화된 추천","처리 속도 10배 향상","월 운영비 50% 절감","규제 준수 자동화",
          "사용자 이탈률 감소","결제 전환율 개선","현장 업무 디지털 전환","데이터 기반 의사결정",
          "글로벌 다국어 지원","실시간 모니터링"]
MILESTONES = ["MVP 런칭","유료 고객 100사 확보","월 거래액 10억","DAU 1만","글로벌 1차 출시",
              "공공 입찰 통과","ISO 27001 인증","앱스토어 Top 10","유료 전환률 5% 달성","시리즈A 투자 유치"]

PROJECT_TYPES = ["FULLTIME","OUTSOURCE"]
WORK_DAYS = ["FIVE_DAYS","FOUR_DAYS","THREE_DAYS","FLEXIBLE"]
WORK_HOURS = ["FULLTIME","MORNING","AFTERNOON","FLEXIBLE"]
WORK_STYLES = ["REMOTE","ONSITE","HYBRID"]
DEV_STAGES = ["PLANNING","DEVELOPMENT","BETA","OPERATING","MAINTENANCE"]
TEAM_SIZES = ["SIZE_1_5","SIZE_6_10","SIZE_11_30","SIZE_31_50","SIZE_50_PLUS"]
MEETING_FREQS = ["DAILY","WEEKLY","BIWEEKLY","MONTHLY"]
MEETING_TYPES = ["ONLINE","OFFLINE","HYBRID"]
OUTSOURCE_TYPES = ["NEW","MAINTENANCE"]
READY_STATUSES = ["IDEA","DOCUMENT","DESIGN","CODE"]
VISIBILITIES = ["PUBLIC","APPLICANTS","PRIVATE"]
PROJECT_STATUSES = ["RECRUITING","IN_PROGRESS","COMPLETED","CLOSED"]
AVATAR_COLORS = ["#3B82F6","#10B981","#F59E0B","#EF4444","#8B5CF6","#EC4899","#14B8A6",
                 "#F97316","#6366F1","#84CC16","#06B6D4","#A855F7"]

# ---------------------------------------------------------------- 유틸
def sql_str(s):
    if s is None:
        return "NULL"
    return "'" + str(s).replace("\\", "\\\\").replace("'", "''") + "'"

def sql_json(obj):
    if obj is None:
        return "NULL"
    import json
    return "'" + json.dumps(obj, ensure_ascii=False).replace("\\", "\\\\").replace("'", "''") + "'"

def sql_bool(b):
    return "1" if b else "0"

def sql_date(d):
    if d is None:
        return "NULL"
    return f"'{d.isoformat()}'"

def pick(lst, k=1):
    if k == 1:
        return random.choice(lst)
    return random.sample(lst, k=min(k, len(lst)))

def make_username(idx, used):
    while True:
        u = f"{random.choice(ADJ)}_{random.choice(NOUN)}_{random.randint(100, 9999)}"
        if u not in used:
            used.add(u)
            return u

def make_email(username):
    domains = ["devbridge-mock.com","example.com","test.io","mock.dev","sample.kr"]
    return f"{username}@{random.choice(domains)}"

def random_phone():
    return f"010-{random.randint(2000,9999):04d}-{random.randint(1000,9999):04d}"

def random_date(start_y, end_y):
    start = date(start_y, 1, 1)
    end = date(end_y, 12, 28)
    return start + timedelta(days=random.randint(0, (end - start).days))

# ---------------------------------------------------------------- SQL 생성
lines = []
def w(s=""):
    lines.append(s)

w("-- ============================================================")
w("-- DevBridge: 다양화된 시드 (파트너 200 + 클라이언트 100)")
w("-- 생성: scripts/generate_diverse_seed.py")
w("-- 보호: hyleeyou(id=3043), client_hylee(id=3044), 그들의 프로젝트(1165~1170)")
w("--       및 관련 row 는 절대 삭제하지 않습니다.")
w("-- ============================================================")
w("SET NAMES utf8mb4;")
w("SET FOREIGN_KEY_CHECKS=1;")
w("")

# ---------------- Part A: 정리 ----------------
w("-- ============================================================")
w("-- PART A. 정리 (사용자 확인 후 실행)")
w("-- 주의: 아래 DELETE 는 hyleeyou/client_hylee 데이터를 제외한 모든 시드를 제거합니다.")
w("-- ============================================================")
w("START TRANSACTION;")
w("")
KU = f"({HYLEE_PARTNER_ID},{HYLEE_CLIENT_ID})"
HP = f"({','.join(map(str, HYLEE_PROJECT_IDS))})"

# 자식 → 부모 순서로 삭제
w("-- 1) 프로젝트의 자식 row 들 (hylee 프로젝트 제외)")
for tbl in [
    "project_application","project_attachments","project_escrows","project_meetings",
    "project_milestones","project_modules","project_skill_mapping","project_tags",
]:
    w(f"DELETE FROM {tbl} WHERE project_id NOT IN {HP};")
w("")
w("-- 2) 리뷰 (hylee 와 무관한 것만)")
w(f"DELETE FROM partner_review WHERE (project_id IS NULL OR project_id NOT IN {HP}) AND reviewer_user_id NOT IN {KU} AND partner_profile_id NOT IN (SELECT id FROM partner_profile WHERE user_id IN {KU});")
w(f"DELETE FROM client_review  WHERE (project_id IS NULL OR project_id NOT IN {HP}) AND reviewer_user_id NOT IN {KU} AND client_profile_id  NOT IN (SELECT id FROM client_profile  WHERE user_id IN {KU});")
w("")
w("-- 3) 관심/장바구니류")
w(f"DELETE FROM user_interest_partners WHERE user_id NOT IN {KU} AND partner_profile_id NOT IN (SELECT id FROM partner_profile WHERE user_id IN {KU});")
w(f"DELETE FROM user_interest_projects WHERE user_id NOT IN {KU} AND project_id NOT IN {HP};")
w("")
w("-- 4) 사용자 부가 정보 (hylee 제외)")
for tbl in [
    "user_award","user_career","user_certification","user_education",
    "user_profile_detail","user_skill_detail","payment_methods","notification",
]:
    w(f"DELETE FROM {tbl} WHERE user_id NOT IN {KU};")
w("")
w("-- 5) 포트폴리오 (hylee 본인 제외)")
w(f"DELETE FROM partner_portfolios WHERE user_id NOT IN {KU};")
w("")
w("-- 6) 채팅방 (hylee 가 참여하지 않는 모든 채팅방)")
w(f"DELETE FROM chat_room WHERE user1_id NOT IN {KU} AND user2_id NOT IN {KU};")
w("")
w("-- 7) 프로필 자식 → 프로필 (hylee 제외)")
w(f"DELETE FROM partner_skill          WHERE partner_profile_id NOT IN (SELECT id FROM partner_profile WHERE user_id IN {KU});")
w(f"DELETE FROM partner_profile_stats  WHERE partner_profile_id NOT IN (SELECT id FROM partner_profile WHERE user_id IN {KU});")
w(f"DELETE FROM client_preferred_skill WHERE client_profile_id  NOT IN (SELECT id FROM client_profile  WHERE user_id IN {KU});")
w(f"DELETE FROM client_profile_stats   WHERE client_profile_id  NOT IN (SELECT id FROM client_profile  WHERE user_id IN {KU});")
w("")
w("-- 8) 프로젝트 (hylee 프로젝트 제외)")
w(f"DELETE FROM projects WHERE id NOT IN {HP};")
w("")
w("-- 9) 프로필 (hylee 제외)")
w(f"DELETE FROM partner_profile WHERE user_id NOT IN {KU};")
w(f"DELETE FROM client_profile  WHERE user_id NOT IN {KU};")
w("")
w("-- 10) 사용자 (hylee 제외)")
w(f"DELETE FROM users WHERE id NOT IN {KU};")
w("")
w("COMMIT;")
w("")

# ---------------- Part B: INSERT ----------------
w("-- ============================================================")
w("-- PART B. 다양화 INSERT (파트너 200 + 클라이언트 100 + 프로젝트 100)")
w("-- ============================================================")
w("START TRANSACTION;")
w("")

used_usernames = set(["hyleeyou", "client_hylee"])

# ---------- 파트너 200 ----------
PARTNER_COUNT = 200
CLIENT_COUNT = 100

w(f"-- ----- 파트너 {PARTNER_COUNT} 명 -----")
for i in range(PARTNER_COUNT):
    username = make_username(i, used_usernames)
    email = make_email(username)
    name = f"파트너{i+1:03d}"
    gender = random.choice(["MALE","FEMALE"])
    birth = random_date(1980, 2000)
    region = random.choice(["서울","경기","인천","부산","대구","대전","광주","울산","세종","제주","해외"])

    # users
    w("INSERT INTO users (username,email,password,phone,user_type,interests,gender,birth_date,region,contact_email,bank_verified,created_at,updated_at) VALUES")
    w(f"  ({sql_str(username)},{sql_str(email)},{sql_str(PASSWORD_HASH)},{sql_str(random_phone())},'PARTNER','[]','{gender}',{sql_date(birth)},{sql_str(region)},{sql_str(email)},0,NOW(),NOW());")
    w("SET @uid := LAST_INSERT_ID();")

    # partner_profile
    role = pick(ROLES_POOL)
    tech = pick(TECH_FOR_SLOGAN)
    domain = pick(DOMAIN_FOR_SLOGAN)
    years = random.randint(1, 12)
    slogan = pick(SLOGAN_TEMPLATES).format(tech=tech, role=role, domain=domain, years=years)
    slogan_sub = pick(SLOGAN_SUB_POOL)
    short_bio = pick(SHORT_BIO_TEMPLATES).format(years=years, role=role, tech=tech, domain=domain)
    job_roles = pick(ROLES_POOL, k=random.randint(1,3))
    if isinstance(job_roles, str):
        job_roles = [job_roles]
    hashtags = pick(HASHTAG_POOL, k=random.randint(2,4))
    if isinstance(hashtags, str):
        hashtags = [hashtags]
    comm = pick(COMM_POOL, k=random.randint(2,4))
    if isinstance(comm, str): comm = [comm]
    hours = pick(HOURS_POOL, k=random.randint(1,3))
    if isinstance(hours, str): hours = [hours]
    bio = (
        f"{years}년차 {role} 개발자입니다. {tech} 기반 {domain} 서비스 구축 경험이 풍부하며, "
        f"코드 품질과 사용자 경험을 모두 중요하게 생각합니다. 최근에는 {pick(MILESTONES)} 를 목표로 한 "
        f"프로젝트를 리드했습니다."
    )
    strength = (
        f"강점: {pick(['빠른 의사결정','꼼꼼한 문서화','TDD 적용','실시간 모니터링','데이터 기반 의사결정'])}, "
        f"{pick(['오픈소스 기여','멘토링','기술 블로그 운영','컨퍼런스 발표','대규모 트래픽 경험'])}, "
        f"{pick(['보안 감사 대응','글로벌 다국어 대응','퍼포먼스 튜닝','PM 경험','클라우드 비용 최적화'])}."
    )

    w("INSERT INTO partner_profile ("
      "user_id,name,slogan,slogan_sub,short_bio,bio,strength_desc,hashtags,communication_channels,"
      "work_available_hours,job_roles,partner_type,dev_level,dev_experience,work_category,work_preference,"
      "preferred_project_type,salary_hour,salary_month,service_field,grade,hero_key,avatar_color,"
      "github_url,blog_url,youtube_url,title) VALUES")
    w(
        f"  (@uid,{sql_str(name)},{sql_str(slogan)},{sql_str(slogan_sub)},{sql_str(short_bio)},"
        f"{sql_str(bio)},{sql_str(strength)},{sql_json(hashtags)},{sql_json(comm)},"
        f"{sql_json(hours)},{sql_json(job_roles)},'{pick(PARTNER_TYPES)}','{pick(DEV_LEVELS)}',"
        f"'{pick(DEV_EXPS)}','{pick(WORK_CATEGORIES)}','{pick(WORK_PREFERENCES)}','{pick(PREF_PROJECT_TYPES)}',"
        f"{random.randint(20000,150000)},{random.randint(3000000,18000000)},"
        f"{sql_str(pick(SERVICE_FIELDS))},'{pick(GRADES)}',{sql_str(pick(HERO_KEYS))},"
        f"{sql_str(pick(AVATAR_COLORS))},"
        f"{sql_str(f'https://github.com/{username}')},{sql_str(f'https://{username}.tistory.com')},"
        f"NULL,{sql_str(role + ' Specialist')});"
    )
    w("SET @pp := LAST_INSERT_ID();")

    # partner_profile_stats
    w("INSERT INTO partner_profile_stats (partner_profile_id,availability_days,completed_projects,experience_years,rating,repeat_rate,response_rate) VALUES")
    w(f"  (@pp,{random.randint(20,30)},{random.randint(3,40)},{years},{round(random.uniform(3.8,5.0),1)},{random.randint(30,90)},{random.randint(70,100)});")

    # partner_skill (4~7개)
    skill_ids = random.sample(range(1, 61), k=random.randint(4, 7))
    for sid in skill_ids:
        w(f"INSERT INTO partner_skill (partner_profile_id,skill_id) VALUES (@pp,{sid});")

    # user_education (1~2개)
    for so in range(random.randint(1, 2)):
        sch = pick(UNIVERSITIES)
        major = pick(MAJORS)
        st = pick(SCHOOL_TYPES)
        deg = pick(DEGREE_TYPES)
        admit = random_date(2005, 2018)
        grad = admit + timedelta(days=365 * random.randint(2, 6))
        gpa = round(random.uniform(2.8, 4.4), 2)
        w("INSERT INTO user_education (user_id,school_name,school_type,degree_type,major,track,admission_date,graduation_date,gpa,gpa_scale,status,sort_order,verified_school) VALUES")
        w(f"  (@uid,{sql_str(sch)},{sql_str(st)},{sql_str(deg)},{sql_str(major)},{sql_str(pick(['일반','심화','글로벌','산학협력','연계전공']))},{sql_str(admit.strftime('%Y-%m'))},{sql_str(grad.strftime('%Y-%m'))},{sql_str(str(gpa))},'4.5',{sql_str(pick(['졸업','재학','수료','휴학']))},{so},{random.randint(0,1)});")

    # user_career (1~3개)
    for so in range(random.randint(1, 3)):
        comp = pick(COMPANIES)
        jt = pick(JOB_TITLES)
        lvl = pick(LEVELS)
        emp = pick(EMP_TYPES)
        start = random_date(2014, 2023)
        end = start + timedelta(days=365 * random.randint(1, 5))
        is_current = (so == 0 and random.random() < 0.4)
        end_str = "NULL" if is_current else sql_str(end.strftime('%Y-%m'))
        desc = pick(COMPANY_DESC_TEMPLATES).format(
            role=jt, tech=pick(TECH_FOR_SLOGAN),
            months=random.randint(6, 36), metric=pick(METRICS)
        )
        w("INSERT INTO user_career (user_id,company_name,job_title,level,employment_type,role,main_tech,start_date,end_date,is_current,description,sort_order,verified_company) VALUES")
        w(f"  (@uid,{sql_str(comp)},{sql_str(jt)},{sql_str(lvl)},{sql_str(emp)},{sql_str(pick(ROLE_DETAIL))},{sql_str(', '.join(pick(TECH_FOR_SLOGAN, k=3)))},{sql_str(start.strftime('%Y-%m'))},{end_str},{sql_bool(is_current)},{sql_str(desc)},{so},{random.randint(0,1)});")

    # user_award (0~3개)
    for so in range(random.randint(0, 3)):
        ad = random_date(2018, 2024)
        w("INSERT INTO user_award (user_id,award_name,awarding,award_date,description,sort_order) VALUES")
        w(f"  (@uid,{sql_str(pick(AWARD_NAMES))},{sql_str(pick(AWARDING_ORGS))},{sql_str(ad.strftime('%Y-%m'))},{sql_str(pick(['독립 프로젝트로 수상','팀 프로젝트로 수상','개인 트랙 1위','부문 우수상'])) },{so});")

    # partner_portfolios (1~3개)
    for pf_idx in range(random.randint(1, 3)):
        pt = pick(PORTFOLIO_TITLES)
        pr = pick(PORTFOLIO_ROLES)
        pp = pick(PORTFOLIO_PERIODS)
        techs = pick(TECH_FOR_SLOGAN, k=random.randint(3, 5))
        if isinstance(techs, str): techs = [techs]
        wc = (
            f"{pt} 개발에 참여하여 {pr} 역할로 {pp} 동안 진행했습니다. "
            f"주요 작업: {pick(ROLE_DETAIL)}. 핵심 기술 스택: {', '.join(techs)}."
        )
        vision = f"사용자가 {pick(VALUES)} 를 누릴 수 있는 서비스를 만드는 것을 비전으로 삼았습니다."
        core = f"핵심 기능: {pick(['결제','검색','추천','대시보드','채팅','알림','분석','OAuth 로그인'])}, " \
               f"{pick(['실시간 동기화','오프라인 모드','다국어','PWA','Drag&Drop','음성인식'])}."
        chal = f"기술적 도전: {pick(['대량 트래픽 대응','복잡한 결제 플로우','외부 API 안정성','데이터 일관성','보안 감사 통과'])}."
        sol = f"해결: {pick(['Redis 캐시 도입','이벤트 소싱 적용','RDB→NoSQL 일부 분리','메시지큐 도입','회로 차단기 패턴 도입'])}."
        w("INSERT INTO partner_portfolios (user_id,source_key,source_project_id,title,period,role,thumbnail_url,work_content,vision,core_features,technical_challenge,solution,tech_tags,is_added,is_public,created_at,updated_at) VALUES")
        w(f"  (@uid,{sql_str(f'manual-{pf_idx}-{random.randint(1000,9999)}')},NULL,{sql_str(pt)},{sql_str(pp)},{sql_str(pr)},NULL,{sql_str(wc)},{sql_str(vision)},{sql_str(core)},{sql_str(chal)},{sql_str(sol)},{sql_str(', '.join(techs))},1,1,NOW(),NOW());")

    if (i + 1) % 20 == 0:
        w(f"-- progress: partner {i+1}/{PARTNER_COUNT}")

w("")
# ---------- 클라이언트 100 + 프로젝트 1개씩 ----------
w(f"-- ----- 클라이언트 {CLIENT_COUNT} 명 + 프로젝트 1개/모듈 7개 -----")
for i in range(CLIENT_COUNT):
    username = make_username(i, used_usernames)
    email = make_email(username)
    name = f"클라이언트{i+1:03d}"
    gender = random.choice(["MALE","FEMALE"])
    region = random.choice(["서울","경기","인천","부산","대구","대전","광주","울산","세종","제주"])

    w("INSERT INTO users (username,email,password,phone,user_type,interests,gender,birth_date,region,contact_email,bank_verified,created_at,updated_at) VALUES")
    w(f"  ({sql_str(username)},{sql_str(email)},{sql_str(PASSWORD_HASH)},{sql_str(random_phone())},'CLIENT','[]','{gender}',{sql_date(random_date(1975,1995))},{sql_str(region)},{sql_str(email)},0,NOW(),NOW());")
    w("SET @uid := LAST_INSERT_ID();")

    industry = pick(INDUSTRIES)
    org = f"{industry} 스타트업 {chr(65+random.randint(0,25))}{random.randint(10,99)}"
    cl_slogan = f"{industry} 도메인의 {pick(['혁신','새로운 시도','다음 세대 서비스','빠른 실행'])} 을 함께할 파트너를 찾습니다"
    cl_sub = pick(["진정성 있는 협업을 원합니다","장기 파트너십 환영","빠른 실행을 중시합니다","시리즈A 직후입니다","공공 사업 다수 보유"])
    bio = f"{org} 입니다. {industry} 산업에서 {random.randint(2,15)}년 운영 중이며, 누적 고객 {random.randint(500, 50000)}명을 보유하고 있습니다."
    strength = f"강점: {pick(['신속한 의사결정','명확한 요구사항','넉넉한 예산','체계적인 프로세스','우수한 디자인 가이드'])}."

    w("INSERT INTO client_profile (user_id,client_type,industry,org_name,manager_name,slogan,slogan_sub,short_bio,bio,strength_desc,grade,avatar_color,budget_min,budget_max,avg_project_budget,preferred_levels,preferred_work_type,hero_key) VALUES")
    w(
        f"  (@uid,'{pick(CLIENT_TYPES)}',{sql_str(industry)},{sql_str(org)},{sql_str(name)},"
        f"{sql_str(cl_slogan)},{sql_str(cl_sub)},{sql_str(bio[:180])},{sql_str(bio)},{sql_str(strength)},"
        f"'{pick(GRADES)}',{sql_str(pick(AVATAR_COLORS))},{random.randint(500,2000)*10000},{random.randint(3000,15000)*10000},"
        f"{random.randint(1000,8000)*10000},{sql_json(pick(['JUNIOR','MIDDLE','SENIOR','LEAD'], k=random.randint(1,3)) if True else None)},"
        f"{random.randint(0,2)},{sql_str(pick(HERO_KEYS))});"
    )
    w("SET @cp := LAST_INSERT_ID();")
    w("INSERT INTO client_profile_stats (client_profile_id,completed_projects,posted_projects,rating,repeat_rate) VALUES")
    w(f"  (@cp,{random.randint(0,30)},{random.randint(1,40)},{round(random.uniform(3.7,5.0),1)},{random.randint(20,80)});")

    # 클라이언트당 프로젝트 1개
    title = pick(PROJECT_TITLES) + f" #{i+1:03d}"
    p_type = pick(PROJECT_TYPES)
    is_outsource = (p_type == "OUTSOURCE")
    months = random.randint(2, 12)
    desc = pick(PROJECT_DESC_TEMPLATES).format(
        title=title, target=pick(TARGETS), value=pick(VALUES),
        months=months, milestone=pick(MILESTONES), tech=pick(TECH_FOR_SLOGAN),
    )
    detail = (
        f"# 프로젝트 개요\n{desc}\n\n"
        f"# 핵심 요구사항\n- {pick(ROLE_DETAIL)}\n- {pick(ROLE_DETAIL)}\n- {pick(ROLE_DETAIL)}\n\n"
        f"# 기술 스택\n주요 스택은 {', '.join(pick(TECH_FOR_SLOGAN, k=4))} 입니다.\n\n"
        f"# 일정\n총 {months}개월 (착수 ~ 베타 ~ 정식 오픈)."
    )
    slogan_p = pick(["3개월 내 MVP 런칭","글로벌 다국어 지원","유료 전환률 5% 달성","월 거래액 10억 돌파","ISO 27001 인증 획득"])
    slogan_sub_p = pick(["빠른 실행 가능한 파트너 환영","장기 협업 우대","시리즈A 직후, 안정적 예산","공공 사업 사전 자격 보유"])
    budget_min = random.randint(500, 3000) * 10000
    budget_max = budget_min + random.randint(500, 5000) * 10000
    budget_amount = (budget_min + budget_max) // 2
    monthly = random.randint(400, 1200) * 10000
    contract_months = random.randint(3, 12)
    start = random_date(2026, 2026)
    deadline = start + timedelta(days=30 * months)
    work_scope = pick([["기획","디자인","개발","배포"], ["디자인","개발"], ["개발","유지보수"], ["기획","개발","QA"]])
    category = pick([["웹","모바일"], ["웹"], ["모바일"], ["AI/ML","웹"], ["B2B","SaaS"]])
    current_stacks = pick(TECH_FOR_SLOGAN, k=random.randint(2, 4))
    if isinstance(current_stacks, str): current_stacks = [current_stacks]
    meeting_tools = pick(COMM_POOL, k=random.randint(2, 4))
    if isinstance(meeting_tools, str): meeting_tools = [meeting_tools]
    req_tags = pick(HASHTAG_POOL, k=random.randint(2, 4))
    if isinstance(req_tags, str): req_tags = [req_tags]
    questions = [
        {"q": "유사 프로젝트 경험이 있나요?", "required": True},
        {"q": "예상 인력 구성과 일정을 제안해 주세요.", "required": True},
        {"q": "포트폴리오 링크를 공유해 주세요.", "required": False},
    ]
    contract_terms = {"nda": True, "ip_owner": "CLIENT", "warranty_months": 6}

    w("INSERT INTO projects ("
      "user_id,title,`desc`,detail_content,slogan,slogan_sub,project_type,outsource_project_type,"
      "ready_status,dev_stage,team_size,status,visibility,grade,avatar_color,service_field,"
      "category,work_scope,current_stacks,current_status,req_tags,meeting_tools,meeting_type,meeting_freq,"
      "work_style,work_location,work_days,work_hours,contract_months,monthly_rate,duration_months,"
      "budget_min,budget_max,budget_amount,gov_support,is_partner_free,it_exp,schedule_negotiable,start_date_negotiable,"
      "start_date,deadline,questions,contract_terms,collab_planning,collab_design,collab_dev,collab_publishing,"
      "additional_comment,reference_file_url,additional_file_url,created_at,updated_at) VALUES")
    w(
        "  (@uid,"
        f"{sql_str(title)},{sql_str(desc)},{sql_str(detail)},{sql_str(slogan_p)},{sql_str(slogan_sub_p)},"
        f"'{p_type}',{('NULL' if not is_outsource else f"'{pick(OUTSOURCE_TYPES)}'")},"
        f"'{pick(READY_STATUSES)}','{pick(DEV_STAGES)}','{pick(TEAM_SIZES)}','{pick(PROJECT_STATUSES)}',"
        f"'{pick(VISIBILITIES)}','{pick(GRADES)}',{sql_str(pick(AVATAR_COLORS))},{sql_str(pick(SERVICE_FIELDS))},"
        f"{sql_json(category)},{sql_json(work_scope)},{sql_json(current_stacks)},"
        f"{sql_str(pick(['초기 설계 단계','데모 완료','베타 운영중','일부 기능 구현 완료']))},"
        f"{sql_json(req_tags)},{sql_json(meeting_tools)},'{pick(MEETING_TYPES)}','{pick(MEETING_FREQS)}',"
        f"'{pick(WORK_STYLES)}',{sql_str(pick(['서울 강남구','서울 성수동','경기 판교','부산 센텀시티','원격 가능']))},"
        f"'{pick(WORK_DAYS)}','{pick(WORK_HOURS)}',{contract_months},{monthly},{months},"
        f"{budget_min},{budget_max},{budget_amount},{sql_bool(random.random()<0.3)},{sql_bool(random.random()<0.2)},"
        f"{sql_bool(random.random()<0.5)},{sql_bool(random.random()<0.6)},{sql_bool(random.random()<0.4)},"
        f"{sql_date(start)},{sql_date(deadline)},{sql_json(questions)},{sql_json(contract_terms)},"
        f"{random.randint(0,3)},{random.randint(0,3)},{random.randint(1,5)},{random.randint(0,2)},"
        f"{sql_str('추가로 논의하고 싶은 사항은 미팅에서 말씀드리겠습니다.')},NULL,NULL,NOW(),NOW());"
    )
    w("SET @pid := LAST_INSERT_ID();")

    # project_tags (3~5개)
    tags = pick(HASHTAG_POOL, k=random.randint(3, 5))
    if isinstance(tags, str): tags = [tags]
    for t in tags:
        w(f"INSERT INTO project_tags (project_id,tag) VALUES (@pid,{sql_str(t.replace('#',''))});")

    # project_skill_mapping (필수 3~5, 우대 2~4)
    req_skills = random.sample(range(1, 61), k=random.randint(3, 5))
    pref_skills = random.sample([x for x in range(1, 61) if x not in req_skills], k=random.randint(2, 4))
    for sid in req_skills:
        w(f"INSERT INTO project_skill_mapping (project_id,skill_id,is_required) VALUES (@pid,{sid},1);")
    for sid in pref_skills:
        w(f"INSERT INTO project_skill_mapping (project_id,skill_id,is_required) VALUES (@pid,{sid},0);")

    # project_modules: 7개
    module_texts = {
        "scope": f"{title} 의 작업 범위는 다음과 같습니다. {pick(ROLE_DETAIL)}, {pick(ROLE_DETAIL)}. 핵심 스택은 {', '.join(current_stacks)} 이며, 외부 연동은 {pick(['Stripe','Toss','Iamport','Naver Cloud','AWS S3','OpenAI API'])} 을 사용합니다.",
        "deliverable": f"최종 산출물: GitHub 소스코드, 배포 환경(Docker/{pick(['AWS','GCP','Azure'])}), API 문서(Swagger), ERD, 운영 매뉴얼, 시연 영상.",
        "schedule": f"전체 {months}개월 일정. 1단계 기획/설계 {max(1,months//4)}개월, 2단계 개발 {max(2,months//2)}개월, 3단계 QA/배포 {max(1,months//4)}개월. 시작 {start.isoformat()} / 마감 {deadline.isoformat()}.",
        "payment": f"총 계약금액 {budget_amount:,}원. 착수금 30% / 중도금 40% / 잔금 30%. 마일스톤별 검수 후 지급.",
        "revision": f"배포 후 {random.choice([30,60,90])}일 이내 발견된 버그 무상 수정. 추가 기능 개선 요청은 별도 견적.",
        "completion": f"완료 기준: 핵심 KPI({pick(MILESTONES)}) 달성, QA 시나리오 통과율 95% 이상, 운영 환경 무중단 배포 검증.",
        "terms": f"소스코드 IP 는 클라이언트 귀속, NDA 적용. {random.choice([3,6,12])}개월 무상 유지보수 포함, 이후 별도 계약."
    }
    for mk, txt in module_texts.items():
        w(f"INSERT INTO project_modules (project_id,module_key,status,data,created_at,updated_at,last_modifier_id,last_modifier_name) VALUES")
        w(f"  (@pid,{sql_str(mk)},'미확정',{sql_json({'text': txt})},NOW(),NOW(),@uid,{sql_str(name)});")

    if (i + 1) % 20 == 0:
        w(f"-- progress: client {i+1}/{CLIENT_COUNT}")

w("")
w("COMMIT;")
w("")
w("-- ============================================================")
w("-- 끝")
w("-- ============================================================")

os.makedirs(OUT_DIR, exist_ok=True)
with open(OUT_PATH, "w", encoding="utf-8") as f:
    f.write("\n".join(lines))

print(f"Wrote: {OUT_PATH}  ({len(lines)} lines)")
