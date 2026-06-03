// Seed projects generator
// - 교육/의료 service_field 제거
// - 디자인/기획, 유지보수, 클라우드 각각 35건 추가
// 실행: node scripts/generate_seed_projects.js
import fs from 'node:fs';
import path from 'node:path';

const SEED_PATH = path.resolve('frontend/src/data/erd/projects.json');
const raw = JSON.parse(fs.readFileSync(SEED_PATH, 'utf8'));

// 1) 교육 / 의료 제외
const REMOVE_FIELDS = new Set(['교육', '의료']);
const kept = raw.filter((p) => !REMOVE_FIELDS.has(p.service_field));

// 2) 새 프로젝트 제너레이터
const clientUserIds = Array.from({ length: 30 }, (_, i) => i + 1); // 1~30 (client)

const AVATAR_COLORS = [
  '#14B8A6', '#38BDF8', '#F97316', '#A78BFA', '#F472B6',
  '#10B981', '#6366F1', '#EF4444', '#FACC15', '#22C55E',
  '#8B5CF6', '#EC4899', '#06B6D4', '#F59E0B', '#3B82F6',
];

const GRADES = ['platinum', 'gold', 'silver', 'bronze'];
const STATUSES = ['recruiting', 'recruiting', 'in_progress', 'completed', 'closed'];
const MEETING_TYPES = ['online', 'offline', 'hybrid'];
const MEETING_FREQ = ['daily', 'weekly', 'biweekly', 'monthly'];
const OUTSOURCE_TYPES = ['new_build', 'renewal', 'maintenance', 'consulting'];
const READY_STATUSES = ['idea', 'planning', 'design', 'in_dev'];
const WORK_STYLES = ['onsite', 'remote', 'hybrid'];
const WORK_DAYS = ['3days', '4days', '5days', 'flexible'];
const WORK_HOURS = ['9to6', 'flexible', 'shift'];
const DEV_STAGES = ['idea', 'planning', 'design', 'dev', 'mvp', 'running'];
const TEAM_SIZES = ['solo', '2-5', '6-10', '11-30', '30+'];
const LOCATIONS = [
  '서울시 강남구 테헤란로 152', '서울시 성동구 성수이로 113', '서울시 마포구 월드컵북로 396',
  '서울시 중구 을지로 170', '경기도 성남시 분당구 판교역로 235', '부산시 해운대구 센텀서로 30',
  '대전시 유성구 대학로 291', '서울시 송파구 올림픽로 300', '인천시 연수구 센트럴로 160',
  '서울시 서초구 서초대로 396',
];

// 분야별 프로젝트 제목/설명/태그/스택
const BUCKETS = {
  '디자인/기획': {
    tagPool: ['#UI/UX', '#Figma', '#BX', '#Branding', '#Prototype', '#DesignSystem', '#UXResearch', '#IA', '#Accessibility', '#Wireframe'],
    stackPool: ['Figma', 'Adobe XD', 'Sketch', 'Protopie', 'Framer', 'Illustrator', 'Photoshop', 'Webflow'],
    workScope: ['plan', 'design'],
    catPool: ['web', 'mobile', 'etc'],
    projects: [
      { title: '로컬 농산물 D2C 브랜드 BX 및 패키지 리디자인', desc: '지역 농가와 직거래하는 D2C 브랜드의 BI/BX 및 제품 패키지를 통합 리디자인합니다.', detail: '고객 페르소나 분석, 브랜드 핵심 가치 정의, 로고/컬러/타이포 시스템 수립, 5개 SKU 패키지 포토 촬영 가이드 제작까지 진행합니다.' },
      { title: '반려동물 장례 플랫폼 UX 리서치 및 프로토타입', desc: '민감한 감정 경험을 다루는 서비스의 UX 리서치 + 프로토타입 제작.', detail: '심층 인터뷰 12건, 저니맵 3종, 감정 곡선 기반 플로우 설계 후 Figma 고충실 프로토타입을 산출합니다.' },
      { title: 'MZ 러닝 커뮤니티 앱 UI/UX 리디자인', desc: '러닝 기록 + 챌린지 커뮤니티의 UI를 Z세대 취향 기반으로 리디자인.', detail: '컬러 시스템, 모션 가이드, 주요 8개 화면 리디자인 및 컴포넌트 라이브러리 개편.' },
      { title: '시니어 금융 앱 정보구조(IA) 재설계', desc: '60대 이상 사용자를 위한 은행 앱 IA 개편 프로젝트.', detail: '카드 소트 20명, 트리 테스트, 가독성 보장 텍스트 레벨 재설계, 핵심 플로우 3종 개선.' },
      { title: '국립공원 탐방 가이드 모바일 UX 기획', desc: '오프라인 환경에서도 동작하는 탐방 가이드 앱의 UX 설계.', detail: '코스별 카드 UI, 지도 오프라인 싱크, 위치기반 알림 UX 등 전반 플로우 기획.' },
      { title: '독립서점 통합 큐레이션 플랫폼 서비스 기획', desc: '전국 독립서점을 한 번에 탐색·예약·배송 요청할 수 있는 플랫폼 기획.', detail: '비즈니스 모델 캔버스, 와이어프레임 40컷, 런칭 로드맵 및 KPI 정의.' },
      { title: '보이스 커머스 홈쇼핑 UX 가이드라인 수립', desc: 'AI 스피커 기반 쇼핑 시 음성 인터랙션 가이드라인 제작.', detail: '보이스 UX 원칙 12개, 발화 시나리오 30종, 에러 핸들링 패턴 정립.' },
      { title: '헬스트레이너 매칭 플랫폼 브랜드 아이덴티티 개발', desc: '전문가 매칭을 강조한 서비스의 BI 전면 개발.', detail: '네이밍 단계부터 로고, 컬러, 타이포, 이미지 스타일, 30+ 터치포인트 가이드 제작.' },
      { title: '전통시장 딜리버리 앱 UX 개선 및 프로토타입', desc: '전통시장 내 상점 주문/배송 앱의 사용성 이슈 해결.', detail: '휴리스틱 평가, 개선 포인트 22개 도출, 고충실 프로토타입 및 사용성 테스트 2R 진행.' },
      { title: '청각장애인 의료상담 서비스 접근성 UX 설계', desc: '텍스트/수어 영상 기반 의료상담 앱의 접근성 UX 설계.', detail: 'WCAG 2.2 AA 기준 준수, 수어 영상 삽입 UI, 한 손 조작 플로우 설계.' },
      { title: '기업 CRM 대시보드 시각화 시스템 디자인', desc: '영업/마케팅 지표를 통합한 CRM 대시보드 디자인 시스템 구축.', detail: '차트 컴포넌트 28종, 데이터 밀도 기준 가이드, 다크모드 컬러토큰 정의.' },
      { title: '스마트팜 모니터링 태블릿 UI 디자인 시스템', desc: '온실 센서 데이터를 한눈에 보는 태블릿용 UI 디자인 시스템.', detail: '대형 화면용 그리드, 센서 카드 템플릿 12종, 알림 상태 시각화 가이드.' },
      { title: '메타버스 전시관 공간 UX 기획 및 와이어프레임', desc: '3D 메타버스 전시관의 공간 동선 및 UX 설계.', detail: '3D 공간 구성도, 동선 시뮬레이션, 인터랙션 핫스팟 20종 와이어프레임.' },
      { title: '푸드테크 스타트업 리브랜딩 및 패키지 통합', desc: '3개 서브 브랜드를 가진 푸드테크의 마스터 브랜드 리브랜딩.', detail: '브랜드 감사, 브랜드 아키텍처 재정의, 마스터/서브 로고, 메뉴 카드/패키지 10종.' },
      { title: '라이브커머스 진행자 컨트롤 패널 UX 리디자인', desc: '방송 진행자(호스트)용 제어 패널의 단축 워크플로우 재설계.', detail: '호스트 관찰 조사, 핫키 맵, 상황별 모드(상품설명/주문유입/종료) UX 분기 설계.' },
      { title: '공공 키오스크 접근성 UX/UI 리디자인', desc: '민원 키오스크의 휠체어/시각 약자 접근성을 개선.', detail: '물리 높이 가이드, 고대비 컬러토큰, 음성 안내 스크립트, 터치 목표 크기 기준.' },
      { title: '웨딩플랜 SaaS B2B 어드민 UI 개편', desc: '웨딩업체용 관리 SaaS의 어드민 전면 개편.', detail: '복잡도 높은 예약/결제 테이블 재구성, 필터/검색 패턴 표준화, 모달→인라인 전환.' },
      { title: '근거리 중고거래 앱 온보딩 플로우 재설계', desc: '첫 7일 이탈률 감소를 목표로 한 온보딩 재설계.', detail: '이탈 구간 분석, 3단계 온보딩 변형 A/B 안 3종 설계 및 프로토타입.' },
      { title: '전기차 충전소 지도 UX 개선 프로젝트', desc: '충전기 가용 상태와 가격을 직관적으로 보여주는 지도 UX 개선.', detail: '상태 배지 디자인, 필터 UI, 경로+충전 조합 탐색 UX 설계.' },
      { title: '기부 크라우드펀딩 플랫폼 스토리텔링 UX 기획', desc: '기부자의 몰입을 높이는 스토리텔링 기반 캠페인 페이지 UX 기획.', detail: '스토리 블록 10종 템플릿, 진행률 시각화, 후속 알림 시퀀스 정의.' },
      { title: '개발자 이력서 빌더 서비스 UX 프로토타입', desc: '이력서를 블록 단위로 조립하는 서비스 프로토타입 제작.', detail: '드래그앤드롭 상호작용, 템플릿 8종, PDF 내보내기 레이아웃 설계.' },
      { title: '모바일 은행 송금 플로우 UX 감사 및 개선', desc: '기존 송금 플로우의 UX 진단 및 단축 설계.', detail: '휴리스틱 평가, 마찰 포인트 17개 개선, 지문/얼굴인식 연동 시점 재정의.' },
      { title: '반려식물 케어 앱 캐릭터 IP 및 BX 디자인', desc: '식물 의인화 캐릭터 IP 개발과 BX 가이드라인 제작.', detail: '캐릭터 7종 시트, 보이스톤 정의, 스토리 프레임 5편, 굿즈 템플릿 제공.' },
      { title: '중소기업 인사관리 SaaS 온보딩 UX 설계', desc: '첫 접속 후 30분 내 핵심 기능 체험까지의 온보딩 설계.', detail: '역할별 온보딩 3종, 체크리스트 위젯, 진입 동기별 가지 분기 UX.' },
      { title: '공연 굿즈 커머스 브랜드 스타일가이드 구축', desc: '공연 IP 기반 굿즈샵의 통합 스타일가이드 구축.', detail: '포스터/상세페이지/SNS용 템플릿, 타이포 위계, 컬러 팔레트 70색 정의.' },
      { title: '아트 마켓플레이스 작가 포트폴리오 템플릿 디자인', desc: '작가별 개성을 살리면서 일관된 탐색을 돕는 템플릿 디자인.', detail: '레이아웃 5종, 작품 카드 변형, 태그 필터 패턴 정립.' },
      { title: '가정간편식 구독 서비스 구독플로우 UX 기획', desc: '식단 조합 → 구독 → 변경까지의 라이프사이클 플로우 기획.', detail: '플로우 다이어그램, 빠른 건너뛰기 단축 경로, 결제 실패 회복 UX 설계.' },
      { title: '글로벌 K-뷰티 쇼핑몰 다국어 UI 가이드 정비', desc: '8개 언어 대응을 위한 텍스트 확장/축소 대응 가이드 수립.', detail: '언어별 폰트 페어링, 긴 문자열 대응 컴포넌트, RTL 변형 규칙 포함.' },
      { title: '전자책 독서 트래커 앱 모션 인터랙션 설계', desc: '독서 진행 상태를 시각화하는 모션 인터랙션 설계.', detail: '미세 인터랙션 18종, Lottie 소스 10개, 성능 기준 60fps 가이드.' },
      { title: '부동산 매물 비교 서비스 대시보드 UX 리뉴얼', desc: '다수 매물을 한 화면에서 비교하는 대시보드 재설계.', detail: '정렬/필터 규칙, 비교 슬롯 최대 4개 UI, 핵심 KPI 상단 고정 설계.' },
      { title: '공익제보 플랫폼 신뢰감 강화 리디자인', desc: '제보자 보호 느낌을 주는 시각 언어와 설명 플로우 리디자인.', detail: '신뢰 시각 큐 10개, 익명 상태 표시 UI, 단계별 안심 메시지 작성.' },
      { title: '디지털 명함 공유 앱 브랜딩 및 UX 리뉴얼', desc: '종이 명함 대체를 목표로 한 공유 앱의 브랜딩 + UX 전면 개편.', detail: 'NFC/QR 인터랙션, 명함 카드 템플릿 10종, 기업 프리셋 UI 구성.' },
      { title: '전시회 도슨트 오디오 가이드 앱 UX 기획', desc: '전시장 위치 기반 오디오 가이드 앱의 사용성 기획.', detail: '블루투스 비콘 신호 기반 자동재생 UX, 도슨트 요약 카드 UI 설계.' },
      { title: '프리랜서 세무 도움 서비스 랜딩페이지 리디자인', desc: '전환율 20% 개선을 목표로 한 랜딩 전면 리디자인.', detail: 'CRO 원칙 적용, 히어로 카피 A/B 3안, 후기/FAQ 블록 신규 구성.' },
      { title: '다이어리 SNS 서비스 뷰 컴포넌트 디자인시스템 구축', desc: '피드/상세/작성 전반을 커버하는 디자인시스템 구축.', detail: '기본 컴포넌트 70개, 상태 변형 규칙, 스토리북 문서화까지 포함.' },
    ],
  },
  '유지보수': {
    tagPool: ['#Legacy', '#Refactoring', '#Spring', '#Java', '#DevOps', '#Migration', '#Performance', '#Bugfix', '#Monitoring', '#CI/CD'],
    stackPool: ['Java', 'Spring', 'Node.js', 'MySQL', 'PostgreSQL', 'Redis', 'Docker', 'Nginx', 'PHP', 'Python'],
    workScope: ['dev'],
    catPool: ['web', 'etc', 'pc'],
    projects: [
      { title: '10년 된 쇼핑몰 PHP → Spring 마이그레이션 유지보수', desc: '구형 PHP 기반 쇼핑몰을 Spring Boot 로 점진 이관하면서 운영도 병행.', detail: '카테고리 단위 이관 전략, 공용 인증/결제 모듈 우선 교체, 롤백 플랜 포함 위탁 운영 24개월.' },
      { title: '레거시 ERP 시스템 모니터링 및 긴급대응 상시 운영', desc: '20년 된 ERP 의 장애 대응과 모니터링 상시 위탁.', detail: 'SLA 99.5% 기준, 장애 대응 MTTR 30분 목표, Zabbix + Grafana 모니터링 대시보드 구축 포함.' },
      { title: 'jQuery 기반 어드민 React 점진 마이그레이션', desc: '레거시 jQuery 어드민을 React 로 단계적 전환.', detail: '모듈별 샌드박스 전환 전략, iframe 코브라 방식, 공용 컴포넌트 라이브러리 설계 후 본격 이관.' },
      { title: '사내 그룹웨어 부하 증가 대응 성능 튜닝', desc: '사용자 2천 명 규모 그룹웨어의 응답속도 개선.', detail: '슬로우 쿼리 분석 200건, 인덱스 재구성, Tomcat 스레드풀 튜닝, 캐시 전략 도입.' },
      { title: '대형 물류사 WMS 시스템 장애 모니터링 및 안정화', desc: '물류 창고 관리 시스템의 장애 대응 및 로그 기반 재발 방지.', detail: '에러 트렌드 분석, 알림 라우팅 재설계, 서킷브레이커 도입으로 장애 파급 차단.' },
      { title: '공공기관 민원 포털 크로스브라우저 호환성 개선', desc: 'IE/구형 브라우저까지 지원하는 포털의 호환성 이슈 상시 수정.', detail: 'polyfill 전략 재정의, 취약 컴포넌트 리라이트, 자동화 브라우저 매트릭스 테스트 구성.' },
      { title: 'Oracle → PostgreSQL DB 마이그레이션 및 운영', desc: '상용 DB 비용 절감을 위한 PostgreSQL 이관 프로젝트.', detail: '스키마/트리거 이관, PL/SQL → PL/pgSQL 변환, 이관 후 6개월 안정화 운영 포함.' },
      { title: '구형 AngularJS SPA → Vue3 전환 유지보수', desc: 'AngularJS 1.x 앱을 Vue3 로 점진 전환하면서 운영 유지.', detail: '모노레포 내 공존 전략, 라우터 교차 매핑, 공용 상태 스토어 브리지 구현.' },
      { title: 'IE 지원 종료 대응 ActiveX 기반 결제 모듈 교체', desc: 'ActiveX 결제 모듈을 표준 Web API 기반으로 교체.', detail: '표준 브라우저 결제 API 대체, PG 연동 테스트 3종, 서명/암호화 모듈 재작성 포함.' },
      { title: 'MySQL 5.7 → 8.0 업그레이드 및 쿼리 튜닝', desc: 'EOL 도래한 MySQL 을 8.0 으로 업그레이드.', detail: '호환성 진단, 문자셋 통일(utf8mb4), 윈도우 함수로 쿼리 재작성, 부하 테스트 3R 수행.' },
      { title: '교회 행정 시스템 연간 운영 및 기능 개선 위탁', desc: '교회 교적/회계 시스템 연 단위 운영 + 소폭 기능 개선.', detail: '월간 보고서, 백업/복구 점검, 신규 기능 월 1건 수준 개발 포함.' },
      { title: '모바일 앱 크래시 대응 및 Sentry 모니터링 세팅', desc: '크래시율 2% → 0.5% 로 개선하는 프로젝트.', detail: 'Sentry 도입, 릴리즈 게이팅 설정, 우선순위 크래시 30건 분석·수정.' },
      { title: '구독형 미디어 서비스 API 레이트리밋 개선 유지', desc: '트래픽 급증 대비 레이트리밋/백프레셔 전략 구축.', detail: '토큰버킷 구현, Redis 기반 글로벌 카운터, 사용자 등급별 정책 적용.' },
      { title: '대학교 수강신청 시스템 피크타임 스케일링 개선', desc: '학기 초 피크 대비 오토스케일 + 대기열 구축.', detail: '대기열 큐 도입, 읽기 전용 슬레이브 확충, 부하시험 (4만 TPS) 수행.' },
      { title: '레거시 Ruby on Rails 4 → 7 업그레이드', desc: '구형 Rails 앱의 메이저 업그레이드.', detail: 'deprecation 대응 400건, Zeitwerk 전환, 테스트 커버리지 75% 확보.' },
      { title: '온라인 전시관 CMS 접근성 이슈 상시 수정', desc: 'WCAG 2.1 AA 위반 항목 상시 대응 위탁.', detail: '대체 텍스트 누락 해결, 키보드 포커스 순서 교정, 스크린리더 테스트 시나리오 제공.' },
      { title: 'B2B 주문 관리 시스템 장애 대응 SLA 운영', desc: '고객사 10곳 이상이 사용하는 주문 시스템의 SLA 기반 운영.', detail: '장애 등급 체계(P1~P4), 에스컬레이션 룰, 월간 RCA 리포트 제공.' },
      { title: 'Node 12 → Node 20 런타임 업그레이드 및 호환 수정', desc: 'EOL Node 12 에서 20 LTS 로 이관.', detail: '모듈 호환성 점검, OpenSSL 3 이슈 대응, 메모리 누수 3건 발견 및 수정.' },
      { title: '공장 MES 시스템 센서 연동 오류 해결 유지', desc: '공장 설비(PLC) 센서 연동 장애 상시 대응.', detail: 'OPC-UA 프로토콜 디버깅, 패킷 드랍 이중화, 공장 원격지원 프로세스 구축.' },
      { title: '영상 스트리밍 서비스 CDN 캐시 전략 개선', desc: '비디오 세그먼트 HIT-RATE 를 90%+ 로 개선.', detail: 'HLS TTL 세분화, 프리페치 정책, origin shield 도입 및 비용-성능 트레이드오프 분석.' },
      { title: '은행 텔러용 내부 웹앱 보안패치 및 CVE 대응', desc: '내부 업무 시스템의 CVE 대응 및 보안 패치.', detail: '분기별 Dependabot 리뷰, 고위험 CVE 15건 대응, 보안 코드 리뷰 체크리스트 수립.' },
      { title: '여행사 예약 엔진 날짜 처리 버그 상시 수정 위탁', desc: '타임존/DST 이슈로 인한 예약 날짜 오류 상시 대응.', detail: 'Luxon 전면 도입, 예약 도메인 전반 테스트 케이스 보강, 엣지 버그 20건 수정.' },
      { title: '병원 수술실 스케줄러 리팩토링 및 안정화', desc: '수술실/장비/인력 스케줄러의 대규모 리팩토링.', detail: '도메인 모델 재정리, 오버부킹 방지 동시성 제어, 성능 튜닝 후 월별 장애 0건 유지.' },
      { title: '호텔 체인 PMS 신용카드 3DS 2.0 대응 유지', desc: 'PCI-DSS 및 3DS 2.0 대응 유지보수.', detail: '카드사별 3DS 플로우 12종 테스트, 페이먼트 로그 마스킹 강화.' },
      { title: '전자정부 프레임워크 업그레이드 및 점검', desc: 'eGovFrame 버전 업 + 공공 코드 인스펙션 대응.', detail: '표준 프레임워크 4.x 로 업그레이드, 보안 점검 항목 대응, 운영 매뉴얼 갱신.' },
      { title: '기업 블로그 WordPress → Headless CMS 이관', desc: '마케팅 블로그를 Headless (Contentful + Next.js) 로 이관.', detail: '컨텐츠 모델링, 300+ 포스트 이관 스크립트, SEO 리다이렉트 맵 1:1 매핑.' },
      { title: '스타트업 SaaS 대시보드 기술부채 단계적 상환', desc: '누적된 기술부채를 3개월에 걸쳐 상환.', detail: '부채 티켓 백로그 50건 정리, 테스트 보강, 코어 모듈 3종 리팩토링.' },
      { title: 'AWS 월 과금 최적화 및 리소스 정리 상시 운영', desc: '월 1천만원 규모 AWS 계정의 비용 최적화 운영.', detail: 'Reserved Instance 전략, 미사용 EIP/EBS 정리, 월간 FinOps 리포트 제공.' },
      { title: '결제 PG 장애 대응 및 이중화 개선 유지보수', desc: '단일 PG 의존도를 낮추기 위한 이중화 구축 + 유지.', detail: 'PG 2개사 라우팅 로직, 대체 결제 failover, 결제 실패율 월간 리뷰 운영.' },
      { title: '렌터카 업체 차량 예약 시스템 엣지 버그 핸들링', desc: '날짜/시간/지역 조합 엣지 케이스 상시 대응.', detail: '예약 충돌 케이스 15개 정리, 리소스 락 전략 재설계, 고객사 핫라인 운영.' },
      { title: '오래된 Java 1.8 배치 시스템 Kotlin 재작성 유지', desc: '야간 배치 시스템을 Kotlin + Spring Batch 로 재작성.', detail: '배치 30개 리라이트, 관측성 개선, 실패시 자동 재시도/알림 정책 도입.' },
      { title: '사내 메신저 서버 Spring 업그레이드 및 안정화', desc: '1만 명 규모 사내 메신저의 프레임워크 업그레이드.', detail: 'Spring Boot 2 → 3, Java 17 로 이관, WebSocket 세션 안정화, 메모리 이슈 해소.' },
      { title: '리테일 키오스크 OS 업데이트 대응 소프트웨어 패치', desc: '매장 키오스크 OS 업데이트 이후 호환성 패치.', detail: '300대 키오스크 원격 업데이트, 결제 리더기 드라이버 호환 테스트, 롤백 절차 수립.' },
      { title: '부동산 중개 SaaS 성능 이슈 및 SQL 쿼리 최적화', desc: '페이지 로드 3초 → 1초 미만으로 개선.', detail: 'N+1 쿼리 제거, 인덱스 재편, 서버사이드 캐시 도입, APM 모니터링 구축.' },
      { title: '중소 제조사 공장 생산관리 시스템 2년 운영 위탁', desc: '24/7 생산관리 시스템의 장기 운영 위탁.', detail: '장애 대응 당직, 월간 기능 개선 1건, 분기별 가용성 리포트 포함 2년 계약.' },
    ],
  },
  '클라우드': {
    tagPool: ['#AWS', '#GCP', '#Azure', '#Kubernetes', '#Terraform', '#DevOps', '#Serverless', '#Observability', '#FinOps', '#SRE'],
    stackPool: ['AWS', 'GCP', 'Azure', 'Kubernetes', 'Terraform', 'Docker', 'ArgoCD', 'Datadog', 'Grafana', 'Istio'],
    workScope: ['dev'],
    catPool: ['etc', 'pc', 'web'],
    projects: [
      { title: 'AWS EKS 기반 마이크로서비스 인프라 구축', desc: 'EKS 기반 MSA 인프라를 처음부터 구축.', detail: 'Terraform 으로 VPC/EKS/ALB 구성, ArgoCD GitOps, 샘플 서비스 3개 배포까지 포함.' },
      { title: '멀티 리전 Aurora 글로벌 DB 구성', desc: '서울/도쿄 리전에 걸친 Aurora Global DB 구축.', detail: '리더/라이터 라우팅, 장애조치 시나리오, RPO < 1s 검증, 애플리케이션 교차 리전 캐시 전략.' },
      { title: 'GCP → AWS 멀티 클라우드 이전 프로젝트', desc: '기존 GCP 워크로드를 AWS 로 이전하면서 하이브리드 운영.', detail: 'GKE → EKS 전환, BigQuery → Redshift 이관, 단계적 트래픽 전환 (Weighted DNS).' },
      { title: 'Kubernetes 기반 GitOps (ArgoCD) 파이프라인 구축', desc: 'ArgoCD + Helm 기반 GitOps 파이프라인 구축.', detail: 'App-of-Apps 패턴, Sync Wave 정의, 모니터링 Webhook, 프로덕션 2차 검수 절차 포함.' },
      { title: 'Datadog APM 도입 및 Observability 플랫폼 정비', desc: 'Datadog APM/Logs/Synthetic 통합 도입.', detail: '90개 서비스 계측, SLO 대시보드 20종, 장애 대응 북 작성, 월 $ 상한 가드레일 설정.' },
      { title: '서버리스 Lambda + API Gateway 이벤트 파이프라인', desc: '서버리스 기반 실시간 이벤트 처리 파이프라인 구축.', detail: 'EventBridge → Lambda → Kinesis 파이프라인, DLQ, 재처리 정책, 비용 모니터링 포함.' },
      { title: 'Terraform 으로 IaC 표준화 및 모듈화', desc: '조직 전반의 Terraform 표준화.', detail: '공용 모듈 12종, 버전 관리 전략(tfstate remote + locking), pre-commit hook 세트 구축.' },
      { title: 'AWS 비용 절감 30% 목표 FinOps 컨설팅', desc: 'AWS 월 5천만원 계정의 비용 30% 절감.', detail: 'RI/SP 포트폴리오 재구성, 유휴 리소스 정리, 데이터 전송비용 최적화, 월간 FinOps 리포트.' },
      { title: 'EKS + Istio 서비스 메시 도입', desc: '서비스 메시 도입으로 트래픽 정책/관측성 강화.', detail: 'sidecar 주입 전략, mTLS 적용, Canary/Blue-Green 라우팅, 관측성 대시보드 구성.' },
      { title: 'Azure DevOps → GitHub Actions CI/CD 이관', desc: '기존 Azure DevOps 파이프라인을 GitHub Actions 로 이관.', detail: '300+ 파이프라인 변환, 공용 Reusable Workflow 작성, Self-hosted Runner 구축.' },
      { title: '보안감사 대응 클라우드 CSPM 도구 구축', desc: 'Prowler / Wiz 기반 CSPM 도구 구축 및 운영.', detail: '정책 템플릿 200개, 취약점 자동 티켓팅, 위험도 우선순위 알고리즘 설계.' },
      { title: '실시간 주문처리 SQS + Step Functions 오케스트레이션', desc: '주문 워크플로우를 Step Functions 로 오케스트레이션.', detail: '상태 머신 설계, 보상 트랜잭션(SAGA), 재시도 전략, 모니터링 및 알람 설정.' },
      { title: 'Redis 클러스터 HA 구성 및 세션 스토어 분리', desc: '단일 Redis 를 ElastiCache 클러스터로 전환.', detail: '세션 이관 전략, Failover 훈련, Client-side Caching 적용, SLA 99.99% 달성.' },
      { title: '로그 통합 파이프라인 Fluentbit + OpenSearch 구축', desc: '전사 로그를 통합 수집/검색 가능한 플랫폼 구축.', detail: 'Fluentbit DaemonSet, OpenSearch 샤딩 설계, 로그 보존 정책, 감사 로그 분리.' },
      { title: '멀티테넌트 SaaS 를 위한 VPC 분리 아키텍처', desc: '테넌트별 격리가 필요한 SaaS 의 VPC 분리 설계.', detail: 'Tenant Isolation Model 분석, Transit Gateway, 데이터 격리 검증, 운영 자동화 스크립트.' },
      { title: 'Snowflake 기반 데이터 웨어하우스 구축', desc: '산발된 데이터를 Snowflake 로 통합.', detail: '소스 15종 수집 파이프라인, dbt 기반 모델링, RBAC, 비용 가드레일 설정.' },
      { title: 'AI 모델 서빙용 SageMaker 추론 파이프라인 구축', desc: 'ML 모델 서빙 파이프라인 구축.', detail: 'BYO Container, Multi-Model Endpoint, Auto Scaling 정책, Canary 배포 파이프라인 구성.' },
      { title: 'GCP BigQuery + Looker 임원 대시보드 구축', desc: '경영진용 KPI 대시보드 구축.', detail: 'dbt 로 메트릭 계층화, Looker LookML 작성, 행 단위 보안(RLS), 분기별 지표 리뷰 정례화.' },
      { title: 'CI/CD 빌드 속도 50% 단축 파이프라인 최적화', desc: '평균 빌드 20분 → 10분 이하로 단축.', detail: '캐시 재설계, 병렬화 전략, 테스트 분할(Split), Docker Layer 캐시 hit 개선.' },
      { title: '온프레미스 VMware → AWS 마이그레이션', desc: '데이터센터 100VM 규모를 AWS 로 이전.', detail: 'AWS SMS 활용, 네트워크 재설계, DB는 DMS 로 이관, 롤백 플랜 및 컷오버 리허설 포함.' },
      { title: 'K8s CronJob → Airflow DAG 전환', desc: '흩어진 Cron 배치를 Airflow 로 통합.', detail: 'DAG 70개 리팩토링, 의존성/백필 정책 수립, 실패 알림 Slack 연동 자동화.' },
      { title: '쿠버네티스 오토스케일링 HPA/VPA 정책 튜닝', desc: '비용-성능 균형을 위한 오토스케일 정책 재설계.', detail: 'HPA 메트릭 재선정, Karpenter 적용, 주기별 스팟 전략, 피크 부하 시뮬레이션.' },
      { title: 'IAM 권한 체계 재설계 및 최소권한 원칙 적용', desc: '과도하게 허용된 IAM 정책을 최소권한으로 재정렬.', detail: 'Access Analyzer, Policy Simulation, 역할 기반 권한 모델 설계, 분기별 정기 감사.' },
      { title: '멀티 클라우드 재해복구(DR) 시나리오 구축', desc: 'AWS / GCP 간 재해복구 시나리오 구축 및 모의훈련.', detail: 'RPO/RTO 목표 정의, 데이터 복제, 주기적 DR 드릴, 사후 리포트 포맷 수립.' },
      { title: 'CloudFront + Lambda@Edge 글로벌 엣지 최적화', desc: '글로벌 사용자 대상 엣지 최적화.', detail: 'Lambda@Edge 라우팅, 지역별 캐시 TTL, 성능 KPI 대시보드 구성, 비용 분석 리포트.' },
      { title: 'EFK → OpenSearch + Grafana 전환', desc: 'EFK 스택을 OpenSearch 와 Grafana 로 전환.', detail: 'Beats 에이전트 전환, 대시보드 30개 마이그레이션, 알림 규칙 리팩토링.' },
      { title: '트래픽 급증 대응 CDN 및 오토스케일 튜닝 컨설팅', desc: '프로모션 트래픽 10배 대비 튜닝 컨설팅.', detail: '부하 예측, CDN 캐시 정책, 오토스케일 파라미터 튜닝, 부하시험 2R 수행.' },
      { title: '프라이빗 도커 이미지 레지스트리 Harbor 구축', desc: '사내 보안 감사 통과를 위한 Harbor 레지스트리 구축.', detail: 'Harbor HA 구성, Trivy 연계 스캔, 프로젝트별 권한 분리, 이미지 GC 정책.' },
      { title: '서비스 장애 대응 카오스 엔지니어링 도입', desc: 'Gremlin 기반 카오스 실험 도입.', detail: '실험 시나리오 20종, 조직 승인 프로세스, 장애 복원력 KPI 정의 및 측정.' },
      { title: '컨테이너 보안 스캐닝 Trivy/Snyk 파이프라인 통합', desc: 'CI 파이프라인에 컨테이너 보안 스캔 통합.', detail: '실패 기준 정책, 허용/차단 목록, 보안팀 리포트 자동 발행 워크플로우 구성.' },
      { title: 'Postgres → DynamoDB 부분 이관 및 설계', desc: '읽기 집중 일부 도메인을 DynamoDB 로 이관.', detail: '접근 패턴 기반 설계, GSI 전략, 데이터 동기화 스크립트, 비용/성능 비교 리포트.' },
      { title: 'Azure AKS + Azure Monitor 통합 모니터링 구축', desc: 'AKS 기반 워크로드 통합 모니터링 구축.', detail: 'Azure Monitor + Log Analytics 통합, 대시보드 15종, Action Group 기반 알림 트리거 구성.' },
      { title: '사내 개발자 플랫폼(IDP) Backstage 구축', desc: 'Spotify Backstage 기반 내부 개발자 플랫폼 구축.', detail: '카탈로그/템플릿 20종, TechDocs, 플러그인 통합(GitHub/ArgoCD/Datadog), 권한 체계 설계.' },
      { title: 'Kafka → MSK 마이그레이션 및 스트림 처리 파이프라인', desc: '자체 Kafka 를 AWS MSK 로 이전하면서 스트림 처리도 재설계.', detail: 'MSK Serverless 검토, Connect Worker 재구성, Flink 기반 스트림 처리 파이프라인 3종 구축.' },
      { title: 'Zero Trust Network 기반 사내 접근 정책 구현', desc: 'Zero Trust 원칙 기반으로 사내 접근 제어 재설계.', detail: 'IAP 도입, 디바이스 포스처 검증, SaaS 접근 SSO 통합, 감사 로그 중앙화.' },
    ],
  },
};

// 안정적 pseudo-random 을 위한 시드 함수
function mulberry32(seed) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rnd = mulberry32(42);
const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
const pickN = (arr, n) => {
  const copy = [...arr];
  const out = [];
  while (out.length < n && copy.length) {
    const i = Math.floor(rnd() * copy.length);
    out.push(copy.splice(i, 1)[0]);
  }
  return out;
};
const pad2 = (n) => String(n).padStart(2, '0');
const fmtDate = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const fmtDateTime = (d) =>
  `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;

function buildProject(id, field, tpl) {
  const isOutsource = rnd() < 0.78;
  const budgetMin = 800 + Math.floor(rnd() * 4000);
  const budgetMax = budgetMin + 500 + Math.floor(rnd() * 4500);
  const durationMonths = 1 + Math.floor(rnd() * 12);
  const bucket = BUCKETS[field];

  const tags = pickN(bucket.tagPool, 3 + Math.floor(rnd() * 2));
  const cats = pickN(bucket.catPool, 1 + Math.floor(rnd() * 2));
  const tools = pickN(['Figma', 'Notion', 'Slack', 'Discord', 'Google Meet', 'Jira', 'Miro'], 2 + Math.floor(rnd() * 2));

  // 2026-02 ~ 2026-09 범위에서 created_at 생성
  const createdAt = new Date(2026, 1 + Math.floor(rnd() * 7), 1 + Math.floor(rnd() * 28), 10, 0, 0);
  const updatedAt = new Date(createdAt.getTime() + (1 + Math.floor(rnd() * 25)) * 24 * 3600 * 1000);
  const startDate = new Date(createdAt.getTime() + (30 + Math.floor(rnd() * 60)) * 24 * 3600 * 1000);
  const deadline = new Date(createdAt.getTime() + (20 + Math.floor(rnd() * 30)) * 24 * 3600 * 1000);

  const base = {
    id,
    user_id: pick(clientUserIds),
    project_type: isOutsource ? 'outsource' : 'fulltime',
    title: tpl.title,
    slogan: tpl.title,
    slogan_sub: `예산 ${budgetMin.toLocaleString()}~${budgetMax.toLocaleString()}만원 | 기간 ${durationMonths}개월`,
    desc: tpl.desc,
    detail_content: tpl.detail,
    service_field: field,
    grade: pick(GRADES),
    work_scope: bucket.workScope,
    category: cats,
    tags,
    reference_file_url: rnd() < 0.4 ? `https://cdn.devbridge.com/projects/${id}/ref.pdf` : null,
    visibility: 'public',
    budget_min: budgetMin,
    budget_max: budgetMax,
    budget_amount: Math.floor((budgetMin + budgetMax) / 2) * 10000,
    is_partner_free: rnd() < 0.15,
    start_date_negotiable: rnd() < 0.5,
    start_date: fmtDate(startDate),
    duration_months: durationMonths,
    schedule_negotiable: rnd() < 0.5,
    meeting_type: pick(MEETING_TYPES),
    meeting_freq: pick(MEETING_FREQ),
    meeting_tools: tools,
    deadline: fmtDate(deadline),
    gov_support: rnd() < 0.2,
    req_tags: pickN(['원격가능', '장기계약', '정규직전환', '경력우대', '야간없음'], 1 + Math.floor(rnd() * 2)),
    questions:
      rnd() < 0.6
        ? [
            '해당 도메인에서의 실무 경험을 간단히 소개해 주세요.',
            '가장 어려웠던 기술적 문제와 해결 과정을 설명해 주세요.',
          ]
        : [],
    it_exp: rnd() < 0.35,
    collab_planning: 1 + Math.floor(rnd() * 3),
    collab_design: 1 + Math.floor(rnd() * 3),
    collab_publishing: 1 + Math.floor(rnd() * 3),
    collab_dev: 1 + Math.floor(rnd() * 3),
    additional_file_url: null,
    additional_comment: null,
    status: pick(STATUSES),
    avatar_color: pick(AVATAR_COLORS),
    created_at: fmtDateTime(createdAt),
    updated_at: fmtDateTime(updatedAt),
  };

  if (isOutsource) {
    base.outsource_project_type = pick(OUTSOURCE_TYPES);
    base.ready_status = pick(READY_STATUSES);
    base.work_style = null;
    base.work_location = null;
    base.work_days = null;
    base.work_hours = null;
    base.contract_months = null;
    base.monthly_rate = null;
    base.dev_stage = null;
    base.team_size = null;
    base.current_stacks = null;
    base.current_status = null;
  } else {
    base.outsource_project_type = null;
    base.ready_status = null;
    base.work_style = pick(WORK_STYLES);
    base.work_location = pick(LOCATIONS);
    base.work_days = pick(WORK_DAYS);
    base.work_hours = pick(WORK_HOURS);
    base.contract_months = durationMonths;
    base.monthly_rate = 400 + Math.floor(rnd() * 700);
    base.dev_stage = pick(DEV_STAGES);
    base.team_size = pick(TEAM_SIZES);
    base.current_stacks = pickN(bucket.stackPool, 2 + Math.floor(rnd() * 2));
    base.current_status = `현재 ${pick(['초기 설계', '운영 안정화', 'MVP 배포', '파일럿 진행', '재구조화'])} 단계이며 ${pick(['신규 기능 개발', '기술부채 상환', '성능 개선'])}을 병행 중입니다.`;
  }

  return base;
}

// 3) 105건 생성 (ID는 kept 중 최대 id + 1 부터)
const maxId = kept.reduce((m, p) => Math.max(m, p.id), 0);
let nextId = maxId + 1;
const added = [];
for (const field of ['디자인/기획', '유지보수', '클라우드']) {
  for (const tpl of BUCKETS[field].projects) {
    added.push(buildProject(nextId++, field, tpl));
  }
}

const final = [...kept, ...added];

// 4) Write back
fs.writeFileSync(SEED_PATH, JSON.stringify(final, null, 2) + '\n', 'utf8');

// 5) 요약 출력
const dist = {};
for (const p of final) dist[p.service_field] = (dist[p.service_field] || 0) + 1;
console.log(`총 ${final.length}건 (제거 ${raw.length - kept.length}건, 추가 ${added.length}건)`);
console.log('service_field 분포:');
for (const [k, v] of Object.entries(dist).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${k}: ${v}`);
}
