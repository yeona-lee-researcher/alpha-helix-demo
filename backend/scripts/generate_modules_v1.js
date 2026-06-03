// generate_modules_v1.js — 1165~1270 프로젝트 7개 모듈을 ContractModals schema 로 생성
// 출력: backend/docs/seed_modules_v1.sql (UPDATE 문)
const fs = require('fs');
const path = require('path');

// ─── 입력 데이터 (DB SELECT 결과) ───
const INPUT_FILE = path.join(__dirname, 'projects_input.json');
const projects = JSON.parse(fs.readFileSync(INPUT_FILE, 'utf8'));

// ─── 유틸 ───
const seedRand = (seed) => {
  let s = seed;
  return () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
};
const pick = (rng, arr) => arr[Math.floor(rng() * arr.length)];
const pickN = (rng, arr, n) => {
  const c = [...arr], out = [];
  for (let i = 0; i < n && c.length; i++) out.push(c.splice(Math.floor(rng() * c.length), 1)[0]);
  return out;
};
const fmt = (n) => Number(n).toLocaleString('ko-KR');
const addMonths = (d, m) => { const x = new Date(d); x.setMonth(x.getMonth() + m); return x; };
const ymd = (d) => `${d.getFullYear()}.${String(d.getMonth()+1).padStart(2,'0')}.${String(d.getDate()).padStart(2,'0')}`;

// ─── Hand-crafted 3개: 1165 / 1166 / 1167 ───
const HANDCRAFTED = {
  1165: {
    scope: {
      included: [
        "React + Vite 프론트엔드 SPA 구축",
        "Spring Boot 기반 백엔드 API 설계 및 구현",
        "OpenAI GPT-4 API 연동 (자산 분석 / 투자 추천)",
        "사용자 소비 패턴 분석 알고리즘",
        "실시간 주식 시세 데이터 연동",
        "자산 현황 대시보드 UI/UX 구현",
        "회원 가입/로그인 (OAuth2 소셜 로그인 포함)",
      ],
      excluded: [
        "iOS / Android 네이티브 앱 개발",
        "AWS 인프라 신규 구축 및 운영",
        "투자 종목별 백테스팅 엔진 (별도 견적)",
        "유료 결제 모듈 (PG 연동) 구현",
      ],
      memo: "OpenAI API 키는 클라이언트 계정 사용. 운영 인프라는 클라이언트가 보유한 AWS 계정을 활용합니다.",
    },
    deliverable: {
      deliverables: [
        { icon: "💻", label: "GitHub 소스코드 (프론트 + 백엔드 monorepo)" },
        { icon: "🌐", label: "배포된 웹 서비스 URL (운영/스테이징)" },
        { icon: "📘", label: "OpenAPI 명세서 (Swagger)" },
        { icon: "📊", label: "ERD 및 시스템 아키텍처 다이어그램" },
        { icon: "📝", label: "사용자 가이드 PDF" },
        { icon: "🧪", label: "테스트 케이스 문서 (Postman / JUnit)" },
      ],
      formats: ["GitHub URL", "Swagger JSON", "PDF", ".drawio / .png"],
      delivery: ["GitHub Private Repo Invite", "DevBridge 채팅 첨부", "최종 산출물은 ZIP 으로 별도 전달"],
      notes: ["전달물에 한글 README 포함", "운영 환경 배포는 클라이언트 승인 후 진행"],
    },
    schedule: {
      phases: [
        { num: "PHASE 01", title: "기획/설계", desc: "요구사항 정의서, ERD, UI 와이어프레임 확정", date: "2025.02.05", weeks: "3주 소요" },
        { num: "PHASE 02", title: "핵심 개발", desc: "사용자/자산 도메인 + 대시보드 UI 구현", date: "2025.05.10", weeks: "13주 소요" },
        { num: "PHASE 03", title: "AI 통합/테스트", desc: "GPT-4 통합, 투자 추천 알고리즘, QA", date: "2025.06.30", weeks: "7주 소요" },
        { num: "PHASE 04", title: "배포/안정화", desc: "운영 배포, 모니터링, 버그 수정", date: "2025.07.15", weeks: "2주 소요" },
      ],
      startDate: "2025.01.15", endDate: "2025.07.15", launchDate: "2025.07.20",
      reviewRules: [
        { label: "마일스톤별 검토 기간", value: "영업일 기준 5일 이내" },
        { label: "무상 수정 횟수", value: "총 3회 (디자인/기능 포함)" },
        { label: "피드백 지연 대응", value: "지연 일수만큼 자동 연장" },
      ],
    },
    payment: {
      total: "65,000,000",
      vatNote: "VAT 별도",
      stages: [
        { label: "착수금 (23%)", tag: "Initial", amount: "₩15,000,000", desc: "계약 후 + 설계 완료 시" },
        { label: "중도금 (46%)", tag: null, amount: "₩30,000,000", desc: "핵심 기능 개발 완료 시" },
        { label: "잔금 (31%)", tag: null, amount: "₩20,000,000", desc: "최종 배포 및 검수 완료 후" },
      ],
      bankName: "기업은행 010-2345-6789",
      bankNote: "계좌 이체 · 일반 과세",
      extraPolicies: ["범위 외 요청: Man-month 실비 정산", "긴급 수정: 일괄 20% 할증 적용"],
    },
    revision: {
      freeItems: [
        "최종 납품 후 30일 이내 발견된 명백한 버그",
        "경미한 UI 수정 (텍스트/색상/위치) 2회까지",
        "GPT-4 프롬프트 튜닝 1회 무상",
      ],
      paidItems: [
        "기획안에 없던 신규 화면/기능 추가",
        "UI 전면 리디자인 또는 컨셉 변경",
        "백엔드 도메인 모델 또는 DB 스키마 변경",
      ],
      memo: "무상 수정 횟수는 총 3회로 제한됩니다. 횟수 초과 시 또는 유상 수정 기준에 해당하는 요청의 경우, 작업량 산정 후 별도의 추가 비용이 발생할 수 있습니다.",
    },
    completion: {
      steps: [
        { n: 1, title: "결과물 제출", desc: "작업자가 마일스톤 완료 후 GitHub PR + 배포 URL 제출" },
        { n: 2, title: "상호 검수 및 수정", desc: "클라이언트 피드백 수렴 → 버그 수정 / 보완 작업" },
        { n: 3, title: "최종 승인 확정", desc: "검수 완료 → 의뢰자 최종 완료 버튼 클릭 → 잔금 정산" },
      ],
      criteria: [
        "핵심 기능(자산 분석, AI 추천, 대시보드) 정상 작동",
        "OpenAI API 응답 시간 5초 이내",
        "Lighthouse 성능 점수 85점 이상",
        "모바일 반응형 (iPhone / Android Chrome) 정상 동작",
      ],
      categories: [
        { n: 1, title: "API 명세서 전달", desc: "Swagger 기반 모든 핵심 API 명세 전달" },
        { n: 2, title: "기획/UI/UX 정밀 검수", desc: "PRD, Figma 최종안 전달 완료" },
        { n: 3, title: "소스코드 리포지토리 전달", desc: "GitHub Private Repo 의 모든 코드 + 배포 스크립트 푸시" },
        { n: 4, title: "운영 환경 테스트 완료", desc: "QA 시나리오 + 베타 테스트 보고서 제출 + 버그 수정 완료" },
      ],
    },
    terms: {
      intro: "프로젝트의 원활한 진행과 상호 권리 보호를 위해 아래의 추가 특약 사항을 협의합니다.",
      terms: [
        { id: "nda", icon: "🛡", title: "보안 및 기밀 유지 (NDA)", enabled: true,
          items: ["프로젝트 관련 자료의 제3자 유출 금지", "위반 시 실손해 배상 책임"] },
        { id: "ip", icon: "©", title: "지식재산권 귀속", enabled: true,
          items: ["최종 대금 지급 완료 시 산출물 저작권은 클라이언트에게 귀속", "작업자 비상업적 포트폴리오 활용 권한 인정"] },
        { id: "warranty", icon: "🔧", title: "유지보수 (2개월 무상)", enabled: true,
          items: ["배포 후 2개월간 명백한 버그 무상 수정", "이후 별도 유지보수 계약"] },
        { id: "api", icon: "🔑", title: "외부 API 키 관리", enabled: true,
          items: ["OpenAI API 키는 클라이언트 제공", "사용량 모니터링 및 비용은 클라이언트 부담"] },
      ],
    },
  },

  1166: {
    scope: {
      included: [
        "기존 결제 시스템 성능 진단 및 개선",
        "PG사 멀티 연동 (토스페이먼츠 / 나이스페이)",
        "결제 취소 / 환불 로직 고도화",
        "트랜잭션 로그 모니터링 시스템 구축",
        "부정 결제 탐지 (Fraud Detection) 알고리즘 적용",
        "OWASP 기준 보안 취약점 진단 및 보강",
      ],
      excluded: [
        "신규 결제 수단 (가상화폐 등) 추가",
        "PG사 신규 계약 협상 (클라이언트 직접)",
        "타 시스템 (CRM/ERP) 연동",
        "프론트엔드 결제 UI 신규 개발",
      ],
      memo: "기존 시스템과의 호환성을 우선합니다. PG사 정책 변경에 따른 추가 개발은 별도 협의입니다.",
    },
    deliverable: {
      deliverables: [
        { icon: "💻", label: "개선된 결제 모듈 소스코드" },
        { icon: "📘", label: "API 명세서 (Swagger)" },
        { icon: "📊", label: "부하 테스트 리포트 (k6 / JMeter)" },
        { icon: "🛡", label: "보안 점검 리포트 (OWASP Top 10)" },
        { icon: "📖", label: "운영 매뉴얼 + 장애 대응 가이드" },
      ],
      formats: ["GitHub URL", "Swagger JSON", "PDF (리포트)"],
      delivery: ["GitHub Private Repo Invite", "DevBridge 채팅 첨부"],
      notes: ["보안 리포트는 NDA 적용", "장애 대응 가이드는 운영팀 별도 교육 1회 포함"],
    },
    schedule: {
      phases: [
        { num: "PHASE 01", title: "분석/설계", desc: "기존 시스템 진단, 개선안 도출", date: "2025.02.15", weeks: "2주 소요" },
        { num: "PHASE 02", title: "개발", desc: "PG 연동 / 환불 로직 / 모니터링 개발", date: "2025.04.15", weeks: "8주 소요" },
        { num: "PHASE 03", title: "보안 테스트", desc: "OWASP 점검 + 부하 테스트", date: "2025.05.10", weeks: "3주 소요" },
        { num: "PHASE 04", title: "운영 이관", desc: "운영팀 교육 + 무중단 배포", date: "2025.05.30", weeks: "3주 소요" },
      ],
      startDate: "2025.02.01", endDate: "2025.05.30", launchDate: "2025.06.01",
      reviewRules: [
        { label: "마일스톤별 검토 기간", value: "영업일 기준 5일 이내" },
        { label: "무상 수정 횟수", value: "총 2회 (보안/성능 포함)" },
        { label: "피드백 지연 대응", value: "지연 일수만큼 자동 연장" },
      ],
    },
    payment: {
      total: "50,000,000",
      vatNote: "VAT 별도",
      stages: [
        { label: "착수금 (20%)", tag: "Initial", amount: "₩10,000,000", desc: "분석 완료 시" },
        { label: "중도금 (50%)", tag: null, amount: "₩25,000,000", desc: "개발 완료 시" },
        { label: "잔금 (30%)", tag: null, amount: "₩15,000,000", desc: "운영 이관 완료 후" },
      ],
      bankName: "신한은행 110-456-789012",
      bankNote: "계좌 이체 · 일반 과세",
      extraPolicies: ["PG사 정책 변경에 의한 추가 개발은 별도 견적", "긴급 핫픽스: 50% 할증"],
    },
    revision: {
      freeItems: [
        "운영 이관 후 60일 이내 발견된 명백한 버그",
        "OWASP 점검 결과 발견된 취약점 보강",
        "성능 이슈 (TPS 미달) 튜닝 1회",
      ],
      paidItems: [
        "PG사 정책 변경에 따른 신규 연동 작업",
        "신규 결제 수단 추가 (가상화폐, 페이팔 등)",
        "타 시스템과의 추가 연동",
      ],
      memo: "운영 이관 후 2개월간 무상 유지보수가 포함됩니다. 이후 발생하는 PG사 외부 정책 변경 등은 별도 견적으로 진행됩니다.",
    },
    completion: {
      steps: [
        { n: 1, title: "결과물 제출", desc: "개발 완료 후 스테이징 환경 배포 + 테스트 리포트 제출" },
        { n: 2, title: "상호 검수 및 수정", desc: "보안 점검 + 부하 테스트 결과 검토 → 보완" },
        { n: 3, title: "최종 승인 확정", desc: "운영 이관 완료 + 안정화 1주 모니터링 → 잔금 정산" },
      ],
      criteria: [
        "결제 성공률 99.5% 이상 (운영 1주 평균)",
        "평균 결제 처리 시간 2초 이내",
        "동시 접속 1만 TPS 처리 가능 (k6 테스트)",
        "OWASP Top 10 취약점 0건",
      ],
      categories: [
        { n: 1, title: "API 명세서 전달", desc: "Swagger 기반 결제 모듈 전체 API 명세" },
        { n: 2, title: "보안 리포트 전달", desc: "OWASP Top 10 점검 결과 + 보강 내역" },
        { n: 3, title: "소스코드 + 운영 가이드 전달", desc: "Private Repo + 장애 대응 가이드" },
        { n: 4, title: "운영 환경 테스트 완료", desc: "k6 부하 테스트 + 안정화 모니터링 보고서" },
      ],
    },
    terms: {
      intro: "결제 시스템의 특성상 보안과 운영 안정성을 최우선으로 합니다.",
      terms: [
        { id: "nda", icon: "🛡", title: "보안 및 기밀 유지 (NDA)", enabled: true,
          items: ["결제 트랜잭션 / 사용자 데이터 외부 유출 절대 금지", "위반 시 형사 책임 포함"] },
        { id: "ip", icon: "©", title: "지식재산권 귀속", enabled: true,
          items: ["최종 대금 지급 완료 시 소스코드 / DB 스키마 클라이언트 귀속"] },
        { id: "warranty", icon: "🔧", title: "유지보수 (3개월 무상)", enabled: true,
          items: ["운영 이관 후 3개월간 무상 유지보수", "장애 대응 SLA: 4시간 이내 1차 응답"] },
        { id: "pg", icon: "💳", title: "PG사 계약 책임", enabled: true,
          items: ["PG사 (토스/나이스) 계약 및 API 키 발급은 클라이언트 직접 관리"] },
      ],
    },
  },

  1167: {
    scope: {
      included: [
        "React Native 기반 iOS / Android 앱 전면 리뉴얼",
        "UI/UX 재설계 (Figma 디자인 시스템 구축)",
        "계좌 조회 / 이체 / 결제 기능 고도화",
        "생체 인증 (지문 / 얼굴인식) 연동",
        "푸시 알림 / 보안 키패드 적용",
        "앱 성능 최적화 (TTI 3초 이내)",
        "App Store / Play Store 심사 대응",
      ],
      excluded: [
        "백엔드 / 코어뱅킹 시스템 변경",
        "신규 금융 상품 화면 추가",
        "ATM 연동 / OTP 발급 연동",
        "콜센터 / 챗봇 시스템 구축",
      ],
      memo: "스토어 개발자 계정은 클라이언트가 제공합니다. OS 보안 정책 변화에 따른 추가 대응은 1년간 무상 포함됩니다.",
    },
    deliverable: {
      deliverables: [
        { icon: "📱", label: "iOS / Android 앱 바이너리 (스토어 배포본)" },
        { icon: "💻", label: "React Native 소스코드" },
        { icon: "🎨", label: "Figma 디자인 파일 + 디자인 시스템" },
        { icon: "📘", label: "API 연동 문서 (백엔드 인터페이스)" },
        { icon: "🧪", label: "앱 테스트 리포트 (단말 매트릭스)" },
        { icon: "📖", label: "운영 가이드" },
      ],
      formats: ["IPA / AAB", "GitHub URL", "Figma 링크", "PDF"],
      delivery: ["App Store Connect / Play Console 업로드", "GitHub Private Repo", "Figma 공유 링크"],
      notes: ["스토어 심사 대응 (반려 시 재제출 2회 포함)", "디자인 시스템은 향후 확장을 고려한 토큰 기반"],
    },
    schedule: {
      phases: [
        { num: "PHASE 01", title: "디자인", desc: "디자인 시스템 + 핵심 화면 Figma 확정", date: "2025.03.31", weeks: "4주 소요" },
        { num: "PHASE 02", title: "UI 구현", desc: "디자인 → React Native 컴포넌트화", date: "2025.06.15", weeks: "11주 소요" },
        { num: "PHASE 03", title: "기능 개발", desc: "이체/결제/생체인증/푸시 통합", date: "2025.09.10", weeks: "13주 소요" },
        { num: "PHASE 04", title: "테스트/배포", desc: "단말 QA + 스토어 심사 대응", date: "2025.10.31", weeks: "8주 소요" },
      ],
      startDate: "2025.03.01", endDate: "2025.10.31", launchDate: "2025.11.05",
      reviewRules: [
        { label: "마일스톤별 검토 기간", value: "영업일 기준 5일 이내" },
        { label: "무상 수정 횟수", value: "총 3회 (디자인 2회 + 기능 1회)" },
        { label: "피드백 지연 대응", value: "지연 일수만큼 자동 연장" },
      ],
    },
    payment: {
      total: "120,000,000",
      vatNote: "VAT 별도",
      stages: [
        { label: "착수금 (25%)", tag: "Initial", amount: "₩30,000,000", desc: "디자인 완료 시" },
        { label: "중도금 1차 (33%)", tag: null, amount: "₩40,000,000", desc: "UI 구현 완료 시" },
        { label: "중도금 2차 (25%)", tag: null, amount: "₩30,000,000", desc: "기능 개발 완료 시" },
        { label: "잔금 (17%)", tag: null, amount: "₩20,000,000", desc: "스토어 배포 완료 시" },
      ],
      bankName: "국민은행 123-45-678901",
      bankNote: "계좌 이체 · 일반 과세",
      extraPolicies: ["스토어 반려 3회 초과 시 추가 견적", "OS 메이저 업데이트 대응 (1년 무상)"],
    },
    revision: {
      freeItems: [
        "스토어 배포 후 90일 이내 크리티컬 버그",
        "디자인 마이너 변경 2회까지",
        "OS 보안 패치 대응 (1년)",
      ],
      paidItems: [
        "신규 화면 추가 (예: 외환 거래, 보험 상품 등)",
        "디자인 컨셉 전면 변경",
        "백엔드 API 인터페이스 변경 대응",
      ],
      memo: "스토어 배포 후 90일간 크리티컬 버그 무상 수정. OS 메이저 업데이트 (iOS / Android 신규 버전) 대응은 1년간 무상 포함됩니다.",
    },
    completion: {
      steps: [
        { n: 1, title: "결과물 제출", desc: "스토어 심사용 빌드 + 테스트 리포트 제출" },
        { n: 2, title: "상호 검수 및 수정", desc: "단말 매트릭스 QA → 버그 수정 → 재빌드" },
        { n: 3, title: "최종 승인 확정", desc: "스토어 정식 배포 → 1주 안정화 → 잔금 정산" },
      ],
      criteria: [
        "핵심 기능 (계좌조회 / 이체 / 결제 / 생체인증) 정상 작동",
        "iOS / Android 스토어 정식 심사 통과",
        "앱 크래시율 0.1% 이하 (Firebase Crashlytics 기준)",
        "TTI (앱 시작 시간) 3초 이내",
      ],
      categories: [
        { n: 1, title: "API 명세서 전달", desc: "백엔드 연동 인터페이스 명세서" },
        { n: 2, title: "기획/UI/UX 정밀 검수", desc: "Figma 디자인 시스템 + 화면별 명세 전달" },
        { n: 3, title: "소스코드 리포지토리 전달", desc: "React Native 풀 소스 + 빌드 스크립트" },
        { n: 4, title: "운영 환경 테스트 완료", desc: "단말 매트릭스 QA + 스토어 정식 배포 완료" },
      ],
    },
    terms: {
      intro: "금융 앱의 특성상 보안 / 안정성 / OS 정책 대응을 최우선으로 합니다.",
      terms: [
        { id: "nda", icon: "🛡", title: "보안 및 기밀 유지 (NDA)", enabled: true,
          items: ["사용자 금융 정보 외부 유출 절대 금지", "위반 시 금융감독원 신고 + 형사 책임"] },
        { id: "ip", icon: "©", title: "지식재산권 귀속", enabled: true,
          items: ["최종 대금 지급 완료 시 소스코드 + 디자인 파일 클라이언트 귀속"] },
        { id: "warranty", icon: "🔧", title: "유지보수 (1년 무상)", enabled: true,
          items: ["스토어 배포 후 1년간 OS 업데이트 대응 무상", "크리티컬 버그 핫픽스 SLA: 24시간"] },
        { id: "store", icon: "📱", title: "스토어 심사 대응", enabled: true,
          items: ["스토어 반려 시 재제출 2회 포함", "스토어 개발자 계정은 클라이언트 제공"] },
      ],
    },
  },
};

// ─── 1168~1170 도 hand-craft 스타일로 작성 (Festory / Alpha-Helix / DevBridge Platform) ───
const HANDCRAFTED_EXTRA = {
  1168: { // Festory — 축제 정보 통합 플랫폼
    scope: {
      included: ["전국 축제 데이터 크롤링/수집", "위치 기반 축제 추천 알고리즘", "축제 상세 정보 페이지 (지도/사진/리뷰)", "사용자 즐겨찾기/리뷰 기능", "관리자 백오피스"],
      excluded: ["네이티브 모바일 앱 (PWA 만 제공)", "유료 결제 모듈", "다국어 지원 (한국어 only)"],
      memo: "공공 축제 데이터 API 활용. 사진 저작권은 출처 표기로 처리.",
    },
    deliverable: {
      deliverables: [{icon:"💻",label:"GitHub 소스코드"},{icon:"🌐",label:"운영 URL (PWA)"},{icon:"📘",label:"API 명세 (Swagger)"},{icon:"📊",label:"ERD"},{icon:"📝",label:"운영자 매뉴얼"}],
      formats: ["GitHub URL","Swagger JSON","PDF"],
      delivery: ["GitHub Invite","DevBridge 채팅"],
      notes: ["크롤러 운영 가이드 포함","공공 데이터 API 키는 클라이언트 발급"],
    },
    schedule: {
      phases: [
        {num:"PHASE 01",title:"기획/설계",desc:"데이터 수집 범위 + UI 와이어프레임",date:"2024.05.20",weeks:"3주 소요"},
        {num:"PHASE 02",title:"백엔드 개발",desc:"크롤러 + 추천 알고리즘 + API",date:"2024.07.31",weeks:"10주 소요"},
        {num:"PHASE 03",title:"프론트 개발",desc:"PWA + 백오피스 UI",date:"2024.09.30",weeks:"9주 소요"},
        {num:"PHASE 04",title:"안정화/배포",desc:"QA + 운영 배포 + 1주 모니터링",date:"2024.10.31",weeks:"4주 소요"},
      ],
      startDate:"2024.05.01",endDate:"2024.10.31",launchDate:"2024.11.05",
      reviewRules:[{label:"마일스톤별 검토",value:"영업일 5일 이내"},{label:"무상 수정",value:"총 2회"},{label:"피드백 지연",value:"자동 연장"}],
    },
    payment: {
      total:"65,000,000", vatNote:"VAT 별도",
      stages:[
        {label:"착수금 (30%)",tag:"Initial",amount:"₩19,500,000",desc:"계약 후 즉시"},
        {label:"중도금 (40%)",tag:null,amount:"₩26,000,000",desc:"백엔드 개발 완료 시"},
        {label:"잔금 (30%)",tag:null,amount:"₩19,500,000",desc:"운영 배포 완료 후"},
      ],
      bankName:"카카오뱅크 3333-01-1234567", bankNote:"계좌 이체 · 일반 과세",
      extraPolicies:["크롤러 추가 사이트는 사이트당 50만원","긴급 수정 30% 할증"],
    },
    revision: {
      freeItems:["배포 후 60일 이내 버그","크롤러 사이트 구조 변경 대응 1회"],
      paidItems:["신규 사이트 크롤러 추가","유료 결제 모듈 추가","다국어 지원"],
      memo:"무상 수정 2회 한도. 크롤링 대상 사이트가 구조를 변경할 경우 1회는 무상 대응합니다.",
    },
    completion: {
      steps:[{n:1,title:"결과물 제출",desc:"배포 URL + 소스 PR"},{n:2,title:"검수 및 수정",desc:"피드백 → 수정"},{n:3,title:"최종 승인",desc:"잔금 정산"}],
      criteria:["수집 데이터 일일 갱신 정상","Lighthouse 90점 이상","PWA 설치 가능"],
      categories:[
        {n:1,title:"API 명세서 전달",desc:"Swagger 전체 API"},
        {n:2,title:"디자인 자산 전달",desc:"PWA UI 디자인 파일"},
        {n:3,title:"소스코드 전달",desc:"GitHub Private Repo"},
        {n:4,title:"운영 테스트 완료",desc:"1주 안정화 보고서"},
      ],
    },
    terms: {
      intro:"공공 데이터 활용 및 사진 저작권 정책을 준수합니다.",
      terms:[
        {id:"nda",icon:"🛡",title:"보안 및 기밀 유지",enabled:true,items:["내부 자료 제3자 유출 금지"]},
        {id:"ip",icon:"©",title:"지식재산권 귀속",enabled:true,items:["대금 지급 완료 시 소스코드 클라이언트 귀속","포트폴리오 활용 권한 인정"]},
        {id:"warranty",icon:"🔧",title:"유지보수 (2개월 무상)",enabled:true,items:["배포 후 2개월 무상 버그 수정"]},
      ],
    },
  },

  1169: { // Alpha-Helix — 단백질 구조 분석 AI 플랫폼
    scope: {
      included:["AlphaFold 모델 통합 추론 파이프라인","단백질 서열 입력 → 구조 예측 결과 시각화","연구실 단위 사용자 관리","대용량 결과 데이터 저장 (S3)","Jupyter 노트북 연동"],
      excluded:["AlphaFold 자체 학습 (사전 학습 모델만 사용)","WET-lab 실험 데이터 통합","유료 결제 모듈"],
      memo:"GPU 인프라는 클라이언트가 보유한 학교 워크스테이션 활용. 모델 가중치 다운로드는 클라이언트가 사전 진행.",
    },
    deliverable: {
      deliverables:[{icon:"💻",label:"GitHub 소스코드"},{icon:"🐳",label:"Docker 이미지 + Compose 파일"},{icon:"📘",label:"API 명세"},{icon:"📓",label:"예제 Jupyter 노트북"},{icon:"📖",label:"연구원용 가이드"}],
      formats:["GitHub URL","Docker Hub","PDF","ipynb"],
      delivery:["GitHub Invite","Docker Hub Private","DevBridge 채팅"],
      notes:["GPU 환경 설정 가이드 포함","논문 인용용 BibTeX 제공"],
    },
    schedule: {
      phases:[
        {num:"PHASE 01",title:"환경 구축",desc:"AlphaFold 도커 환경 + GPU 검증",date:"2024.07.15",weeks:"2주 소요"},
        {num:"PHASE 02",title:"파이프라인",desc:"입력→추론→결과 저장 자동화",date:"2024.09.15",weeks:"8주 소요"},
        {num:"PHASE 03",title:"시각화/UI",desc:"3D 단백질 뷰어 + 사용자 관리",date:"2024.10.31",weeks:"6주 소요"},
      ],
      startDate:"2024.07.01",endDate:"2024.10.31",launchDate:"2024.11.10",
      reviewRules:[{label:"마일스톤별 검토",value:"영업일 5일 이내"},{label:"무상 수정",value:"총 2회"},{label:"피드백 지연",value:"자동 연장"}],
    },
    payment: {
      total:"150,000,000",vatNote:"VAT 별도",
      stages:[
        {label:"착수금 (25%)",tag:"Initial",amount:"₩37,500,000",desc:"환경 구축 완료 시"},
        {label:"중도금 (50%)",tag:null,amount:"₩75,000,000",desc:"파이프라인 완료 시"},
        {label:"잔금 (25%)",tag:null,amount:"₩37,500,000",desc:"최종 검수 완료 후"},
      ],
      bankName:"하나은행 123-456-78901",bankNote:"계좌 이체 · 일반 과세",
      extraPolicies:["GPU 추가 노드 통합은 노드당 200만원","논문 공동 저자 등재 시 별도 협의"],
    },
    revision: {
      freeItems:["배포 후 60일 내 버그","연구원 사용 가이드 보완 1회"],
      paidItems:["신규 모델 통합 (ESMFold 등)","WET-lab 데이터 연동","대규모 사용자 관리 기능 추가"],
      memo:"학술 연구 목적 무상 수정 2회 한도. 신규 모델 통합 또는 추가 데이터 소스 연동은 별도 견적입니다.",
    },
    completion: {
      steps:[{n:1,title:"결과물 제출",desc:"Docker 이미지 + 운영 가이드"},{n:2,title:"검수",desc:"테스트 단백질 5종 추론 검증"},{n:3,title:"최종 승인",desc:"연구원 교육 1회 후 잔금 정산"}],
      criteria:["AlphaFold 추론 파이프라인 정상 작동","100개 단백질 배치 추론 성공","3D 뷰어 정상 렌더링"],
      categories:[
        {n:1,title:"기술 문서 전달",desc:"파이프라인 아키텍처 + API 문서"},
        {n:2,title:"학습 자료 전달",desc:"Jupyter 예제 + 연구원 가이드"},
        {n:3,title:"소스코드 전달",desc:"GitHub Private Repo + Docker 이미지"},
        {n:4,title:"검수 완료",desc:"테스트 단백질 추론 + 연구원 교육 완료"},
      ],
    },
    terms: {
      intro:"학술 연구 프로젝트의 특성을 고려한 특약 사항입니다.",
      terms:[
        {id:"nda",icon:"🛡",title:"연구 데이터 기밀 유지",enabled:true,items:["연구실 내부 데이터 외부 유출 금지","논문 공개 전 발표 금지"]},
        {id:"ip",icon:"©",title:"지식재산권",enabled:true,items:["소스코드 IP는 연구실 귀속","개발자는 비상업 포트폴리오 활용 가능"]},
        {id:"paper",icon:"📄",title:"논문 공동 저자",enabled:true,items:["기여도에 따른 공동 저자 등재 가능 (별도 협의)"]},
        {id:"warranty",icon:"🔧",title:"유지보수 (3개월)",enabled:true,items:["배포 후 3개월 버그 수정 무상"]},
      ],
    },
  },

  1170: { // DevBridge Platform — 매칭 플랫폼
    scope: {
      included:["AI 매칭 알고리즘 (파트너↔클라이언트)","실시간 채팅 (WebSocket)","포트폴리오 관리 페이지","프로젝트 등록/검색/지원","에스크로 결제 연동","리뷰 시스템"],
      excluded:["네이티브 앱 (웹 only)","오프라인 결제","해외 결제 / 다국어"],
      memo:"MVP 범위입니다. 추후 기능 확장은 단계별 후속 계약으로 진행.",
    },
    deliverable: {
      deliverables:[{icon:"💻",label:"GitHub 소스코드 (모노레포)"},{icon:"🌐",label:"운영 URL"},{icon:"📘",label:"API 명세 (Swagger)"},{icon:"📊",label:"ERD + 시스템 아키텍처"},{icon:"🎨",label:"Figma 디자인 시스템"},{icon:"📝",label:"관리자/사용자 가이드"}],
      formats:["GitHub URL","Swagger JSON","Figma 링크","PDF"],
      delivery:["GitHub Invite","Figma 공유","DevBridge 채팅"],
      notes:["관리자 백오피스 별도 계정 발급","SaaS 모니터링 대시보드 인계"],
    },
    schedule: {
      phases:[
        {num:"PHASE 01",title:"기획/디자인",desc:"PRD 확정 + Figma 디자인 시스템",date:"2025.10.31",weeks:"4주 소요"},
        {num:"PHASE 02",title:"코어 개발",desc:"인증/매칭/채팅/프로젝트 도메인",date:"2026.01.15",weeks:"11주 소요"},
        {num:"PHASE 03",title:"결제/리뷰",desc:"에스크로 + 리뷰 + 알림",date:"2026.02.28",weeks:"6주 소요"},
        {num:"PHASE 04",title:"안정화/배포",desc:"QA + 운영 배포 + 모니터링",date:"2026.03.31",weeks:"4주 소요"},
      ],
      startDate:"2025.10.01",endDate:"2026.03.31",launchDate:"2026.04.05",
      reviewRules:[{label:"마일스톤별 검토",value:"영업일 5일 이내"},{label:"무상 수정",value:"총 3회"},{label:"피드백 지연",value:"자동 연장"}],
    },
    payment: {
      total:"210,000,000",vatNote:"VAT 별도",
      stages:[
        {label:"착수금 (20%)",tag:"Initial",amount:"₩42,000,000",desc:"디자인 완료 시"},
        {label:"중도금 1차 (35%)",tag:null,amount:"₩73,500,000",desc:"코어 개발 완료 시"},
        {label:"중도금 2차 (25%)",tag:null,amount:"₩52,500,000",desc:"결제/리뷰 완료 시"},
        {label:"잔금 (20%)",tag:null,amount:"₩42,000,000",desc:"운영 배포 완료 후"},
      ],
      bankName:"우리은행 1002-123-456789",bankNote:"계좌 이체 · 일반 과세",
      extraPolicies:["향후 기능 확장은 별도 견적","긴급 핫픽스 50% 할증"],
    },
    revision: {
      freeItems:["배포 후 90일 내 명백한 버그","UI 마이너 수정 3회","매칭 알고리즘 가중치 튜닝 1회"],
      paidItems:["신규 사용자 유형 추가","해외 결제 / 다국어 지원","네이티브 앱 추가"],
      memo:"운영 배포 후 90일간 무상 유지보수 및 매칭 알고리즘 1회 튜닝이 포함됩니다.",
    },
    completion: {
      steps:[{n:1,title:"결과물 제출",desc:"운영 URL + 관리자 계정"},{n:2,title:"검수",desc:"전체 시나리오 QA + 부하 테스트"},{n:3,title:"최종 승인",desc:"운영 배포 후 1주 모니터링"}],
      criteria:["전체 사용자 시나리오 정상 동작","Lighthouse 85점 이상","동시 접속 1,000명 안정 처리","에스크로 결제 정상 동작"],
      categories:[
        {n:1,title:"API 명세서 전달",desc:"Swagger 전체 API"},
        {n:2,title:"디자인 시스템 전달",desc:"Figma + 디자인 토큰"},
        {n:3,title:"소스코드 + 인프라 전달",desc:"GitHub + AWS 배포 스크립트"},
        {n:4,title:"운영 테스트 완료",desc:"부하 테스트 + 1주 안정화 보고서"},
      ],
    },
    terms: {
      intro:"플랫폼 비즈니스의 특성상 데이터 보호와 운영 안정성을 우선합니다.",
      terms:[
        {id:"nda",icon:"🛡",title:"사용자 데이터 보호",enabled:true,items:["사용자 개인정보 유출 금지","위반 시 개인정보보호법 책임"]},
        {id:"ip",icon:"©",title:"지식재산권 귀속",enabled:true,items:["대금 지급 완료 시 소스코드/디자인 클라이언트 귀속"]},
        {id:"warranty",icon:"🔧",title:"유지보수 (3개월 무상)",enabled:true,items:["배포 후 3개월 무상 유지보수","장애 SLA: 4시간 이내 응답"]},
        {id:"escrow",icon:"💳",title:"에스크로 정책",enabled:true,items:["에스크로 사업자 등록 및 PG 계약은 클라이언트 직접"]},
      ],
    },
  },
};

// 1168~1170 hand-crafted 도 같이 사용
Object.assign(HANDCRAFTED, HANDCRAFTED_EXTRA);

// ─── 자동 생성 (1171~1270): 프로젝트별 정보 활용 ───
const STACK_DETAIL = {
  "React": "React 18 SPA","Next.js":"Next.js 14 (App Router)","Vue":"Vue 3 + Pinia",
  "Spring Boot":"Spring Boot 3.x","Node.js":"Node.js 20","Nest.js":"NestJS 10",
  "Django":"Django 5","FastAPI":"FastAPI + Pydantic v2","Go":"Go 1.22 (Gin)",
  "Kotlin":"Kotlin (Android Native)","Swift":"Swift (iOS Native)","Flutter":"Flutter 3.x",
  "GraphQL":"Apollo GraphQL","Kafka":"Apache Kafka","Kubernetes":"EKS / GKE",
  "AWS Lambda":"AWS Lambda + API Gateway","TensorFlow":"TensorFlow 2.x","PyTorch":"PyTorch 2.x",
};

function genAutoModules(p) {
  const id = Number(p.id);
  const rng = seedRand(id * 31 + 7);
  const title = p.title;
  const months = Number(p.contract_months || p.duration_months || 6);
  const budget = Number(p.budget_amount || 3000) * 10000; // 만원 → 원
  const stacks = JSON.parse(p.current_stacks || "[]");
  const workScope = JSON.parse(p.work_scope || "[\"개발\"]");
  const field = p.service_field || "기타";

  const stackText = stacks.map(s => STACK_DETAIL[s] || s).slice(0,4).join(", ") || "주요 기술 스택 협의";

  // ── scope ──
  const baseIncluded = [
    `${title} 핵심 기능 설계 및 구현`,
    `${stackText} 기반 백엔드/프론트 개발`,
    `${field} 도메인 비즈니스 로직 구현`,
    `REST API 또는 GraphQL 인터페이스 제공`,
    `유닛 테스트 + 통합 테스트 작성`,
  ];
  if (workScope.includes("디자인")) baseIncluded.push("UI/UX 디자인 가이드 적용");
  if (workScope.includes("배포")) baseIncluded.push("CI/CD 파이프라인 구축 및 운영 배포");
  if (workScope.includes("QA")) baseIncluded.push("QA 시나리오 작성 및 회귀 테스트 수행");

  const baseExcluded = pickN(rng, [
    "신규 모바일 네이티브 앱 개발",
    "운영 인프라 구축 (클라이언트 환경 활용)",
    "외부 시스템 (CRM/ERP) 추가 연동",
    "다국어 / 글로벌 결제 모듈",
    "오프라인 마케팅 / 영업 지원",
    "데이터 마이그레이션 (별도 견적)",
  ], 3);

  const scope = {
    included: baseIncluded,
    excluded: baseExcluded,
    memo: `프로젝트 기간 ${months}개월 내 ${field} 도메인 핵심 기능 구현에 집중합니다. 범위 외 요청은 별도 견적으로 진행됩니다.`,
  };

  // ── deliverable ──
  const deliverable = {
    deliverables: [
      {icon:"💻",label:"GitHub 소스코드 (Private Repo)"},
      {icon:"🌐",label:"배포된 운영/스테이징 URL"},
      {icon:"📘",label:"API 명세서 (Swagger / OpenAPI)"},
      {icon:"📊",label:"ERD 및 시스템 아키텍처 다이어그램"},
      {icon:"📖",label:"운영 매뉴얼 + 관리자 가이드"},
      {icon:"🎬",label:"기능 시연 영상"},
    ],
    formats: ["GitHub URL","Swagger JSON","PDF",".drawio / .png","MP4"],
    delivery: ["GitHub Private Repo Invite","DevBridge 채팅 첨부","최종 산출물 ZIP 별도 전달"],
    notes: [
      `주요 기술 스택: ${stackText}`,
      "운영 환경 배포는 클라이언트 승인 후 진행",
    ],
  };

  // ── schedule ──
  const startDate = new Date(2026, 0 + (id % 6), 1 + (id % 20));
  const phaseCount = months >= 6 ? 4 : 3;
  const perPhase = Math.max(1, Math.floor(months / phaseCount));
  const phaseLabels = phaseCount === 4
    ? [["기획/설계","요구사항 + ERD + 와이어프레임 확정"],["개발 1차","핵심 도메인 + API 구현"],["개발 2차","UI 통합 + 부가 기능 + 테스트"],["배포/안정화","운영 배포 + 1주 모니터링"]]
    : [["기획/설계","요구사항 + 설계 확정"],["개발","전체 기능 구현 + 테스트"],["배포/안정화","운영 배포 + 안정화"]];
  let cur = startDate;
  const phases = phaseLabels.map(([t, d], i) => {
    cur = addMonths(cur, perPhase);
    return { num:`PHASE 0${i+1}`, title:t, desc:d, date: ymd(cur), weeks:`${perPhase * 4}주 소요` };
  });
  const endDate = ymd(cur);
  const schedule = {
    phases,
    startDate: ymd(startDate),
    endDate,
    launchDate: ymd(addMonths(cur, 0)),
    reviewRules: [
      {label:"마일스톤별 검토 기간",value:"영업일 5일 이내"},
      {label:"무상 수정 횟수",value:"총 2회"},
      {label:"피드백 지연 대응",value:"지연 일수만큼 자동 연장"},
    ],
  };

  // ── payment ──
  const initial = Math.round(budget * 0.3);
  const middle  = Math.round(budget * 0.4);
  const final   = budget - initial - middle;
  const payment = {
    total: fmt(budget),
    vatNote: "VAT 별도",
    stages: [
      {label:"착수금 (30%)", tag:"Initial", amount:`₩${fmt(initial)}`, desc:"계약 후 3일 이내"},
      {label:"중도금 (40%)", tag:null, amount:`₩${fmt(middle)}`,  desc:"중간 산출물 검수 완료 시"},
      {label:"잔금 (30%)",   tag:null, amount:`₩${fmt(final)}`,   desc:"최종 납품 및 검수 완료 후"},
    ],
    bankName: pick(rng, ["기업은행 010-2345-6789","신한은행 110-456-789012","카카오뱅크 3333-01-1234567","국민은행 123-45-678901","우리은행 1002-123-456789"]),
    bankNote: "계좌 이체 · 일반 과세",
    extraPolicies: ["범위 외 요청: Man-month 실비 정산", "긴급 수정: 일괄 20% 할증"],
  };

  // ── revision ──
  const revision = {
    freeItems: [
      "배포 후 60일 이내 발견된 명백한 버그",
      "단순 텍스트/이미지 교체",
      "마이너 UI 스타일 조정 2회까지",
    ],
    paidItems: [
      "기획안에 없던 신규 화면/기능 추가",
      "전체 디자인 컨셉 변경",
      "DB 스키마 또는 핵심 도메인 모델 변경",
    ],
    memo: "무상 수정은 총 2회로 제한됩니다. 횟수 초과 또는 유상 수정 기준에 해당하는 요청은 작업량 산정 후 별도 견적으로 진행됩니다.",
  };

  // ── completion ──
  const completion = {
    steps: [
      {n:1, title:"결과물 제출", desc:"마일스톤 완료 후 작업자가 결과물을 시스템에 업로드"},
      {n:2, title:"상호 검수 및 수정", desc:"의뢰자 피드백에 따른 오류 수정 및 보완"},
      {n:3, title:"최종 승인 확정", desc:"모든 조건 충족 시 의뢰자가 최종 완료 버튼 클릭"},
    ],
    criteria: [
      `${title} 핵심 기능 정상 동작`,
      "QA 시나리오 통과율 95% 이상",
      "운영 환경 무중단 배포 검증",
      "주요 브라우저 (Chrome / Safari) 호환성 확보",
    ],
    categories: [
      {n:1, title:"API 명세서 전달", desc:"Swagger 기반 모든 핵심/부가 API 명세서 전달 완료"},
      {n:2, title:"기획/UI/UX 정밀 검수", desc:"PRD + UI/UX 디자인 최종안 전달 완료"},
      {n:3, title:"소스코드 리포지토리 전달", desc:"GitHub Private Repo 의 모든 코드 + 배포 스크립트 푸시 완료"},
      {n:4, title:"운영 환경 테스트 완료", desc:"QA 시나리오 + 베타 테스터 결과 보고서 제출 + 버그 수정 완료"},
    ],
  };

  // ── terms ──
  const terms = {
    intro: "프로젝트의 원활한 진행과 상호 권리 보호를 위해 아래의 추가 특약 사항을 협의합니다.",
    terms: [
      {id:"nda", icon:"🛡", title:"보안 및 기밀 유지 (NDA)", enabled:true,
        items:["프로젝트 관련 모든 자료 및 산출물의 제3자 유출 금지", "위반 시 발생한 실손해에 대한 배상 책임"]},
      {id:"ip", icon:"©", title:"지식재산권 귀속", enabled:true,
        items:["최종 대금 지급 완료 시 산출물 저작권은 클라이언트에게 귀속", "작업자의 비상업적 포트폴리오 활용 권한 인정"]},
      {id:"warranty", icon:"🔧", title:"유지보수 (3개월 무상)", enabled:true,
        items:["배포 후 3개월간 명백한 버그 무상 수정", "이후 별도 유지보수 계약 가능"]},
      {id:"comm", icon:"💬", title:"커뮤니케이션", enabled:true,
        items:["주 1회 정기 미팅 (온라인)", "DevBridge 채팅으로 일상 소통"]},
    ],
  };

  return { scope, deliverable, schedule, payment, revision, completion, terms };
}

// ─── SQL escape ───
const sqlEsc = (s) => s.replace(/\\/g, '\\\\').replace(/'/g, "''");

// ─── 메인 ───
const lines = [];
lines.push("-- seed_modules_v1.sql — 1165~1270 프로젝트 7개 모듈 구조화 데이터");
lines.push("-- 자동 생성: backend/scripts/generate_modules_v1.js");
lines.push("SET NAMES utf8mb4;");
lines.push("");

let updateCount = 0;
for (const p of projects) {
  const pid = Number(p.id);
  const mods = HANDCRAFTED[pid] || genAutoModules(p);
  for (const key of ["scope","deliverable","schedule","payment","revision","completion","terms"]) {
    const data = mods[key];
    const json = JSON.stringify(data);
    lines.push(`UPDATE project_modules SET data = '${sqlEsc(json)}' WHERE project_id = ${pid} AND module_key = '${key}';`);
    updateCount++;
  }
}

const outFile = path.join(__dirname, '..', 'docs', 'seed_modules_v1.sql');
fs.writeFileSync(outFile, lines.join('\n'), 'utf8');
console.log(`✅ Wrote ${updateCount} UPDATE statements → ${outFile}`);
console.log(`   Hand-crafted: ${Object.keys(HANDCRAFTED).length} projects (1165~1170)`);
console.log(`   Auto-generated: ${projects.length - Object.keys(HANDCRAFTED).length} projects (1171~1270)`);
