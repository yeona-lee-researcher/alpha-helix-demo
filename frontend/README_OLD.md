# 🌉 DevBridge — IT 파트너십 플랫폼

> **클라이언트**와 **IT 파트너(프리랜서·팀·기업)**를 연결하는 AI 기반 매칭·계약 플랫폼  
> React 19 + Vite 7 + Zustand 5 + TailwindCSS 4 SPA

---

## 0. 오늘 업데이트 (2026-04-15)

- 대시보드 미팅 구조 고도화: `진행 프로젝트 미팅` 탭을 클라이언트/파트너 대시보드에 추가하고, 프로젝트 상세의 `미팅으로 이동하기` 버튼에서 해당 채팅방으로 바로 이동하도록 연결했습니다.
- 계약 협의 상태 규칙 정리: `계약 여부 논의 미팅`은 진행률 90% 이하 항목 기준으로 분리하고, 진행 프로젝트는 85% 이상 합의 완료(확정/협의완료) 기준으로 상태 계산을 통일했습니다.
- 계약 모달 표시 개선: 모듈 상세에서 `협의완료` 상태를 명확히 반영하고, 진행 프로젝트 미팅 컨텍스트에서는 상단 상태 표시를 문맥에 맞게 축소했습니다.
- 클라이언트 찾기 데이터 확장 반영: `ClientSearch` 필터(클라이언트 유형/분야/예산/등급/선호 레벨/선호 기술/원격 선호)와 `mockClients.json`의 확장 필드를 기준으로 클라이언트 ERD를 파트너 수준으로 세분화했습니다.
- 솔루션 마켓 히어로 UI 보강: 상단 통계 카드에 레이어드(전면 카드 + 후면 보조 레이어) 스타일을 적용해 가독성과 입체감을 높였습니다.

---

## 목차

0. [오늘 업데이트 (2026-04-15)](#0-오늘-업데이트-2026-04-15)
1. [프로젝트 개요](#1-프로젝트-개요)
2. [기술 스택](#2-기술-스택)
3. [프로젝트 구조](#3-프로젝트-구조)
4. [라우트 & 페이지 명세](#4-라우트--페이지-명세)
5. [기능 명세](#5-기능-명세)
6. [데이터 모델 (ERD)](#6-데이터-모델-erd)
7. [상태 관리 (Zustand Store)](#7-상태-관리-zustand-store)
8. [컴포넌트 명세](#8-컴포넌트-명세)
9. [개발 환경 셋업](#9-개발-환경-셋업)

---

## 1. 프로젝트 개요

DevBridge는 두 유형의 사용자를 연결합니다.

| 역할 | 설명 |
|------|------|
| **클라이언트 (Client)** | IT 프로젝트를 발주하거나 솔루션을 구매하는 기업·개인 |
| **파트너 (Partner)** | 개인 프리랜서·팀·기업 형태로 IT 용역을 수행하는 개발자/디자이너 |

주요 제공 가치:
- **AI 매칭** — 프로젝트 요구사항 기반 파트너 자동 추천 (AI 매칭 스코어)
- **AI 챗봇** — 프로젝트 등록 / 파트너 프로필 생성을 AI 대화로 자동화
- **전자 계약** — 7개 항목 (작업 범위, 결과물, 일정, 금액, 수정, 완료 기준, 특약) 디지털 계약
- **솔루션 마켓** — 카테고리별 패키지 솔루션 탐색·구매
- **대시보드** — FullCalendar 기반 일정 관리 + 진행 프로젝트 현황

---

## 2. 기술 스택

### Core
| 라이브러리 | 버전 | 용도 |
|-----------|------|------|
| React | 19.x | UI 프레임워크 |
| Vite | 7.x | 빌드/개발 서버 |
| React Router DOM | 7.x | SPA 라우팅 |
| Zustand | 5.x | 전역 상태 관리 (persist 미들웨어) |

### UI / 스타일
| 라이브러리 | 용도 |
|-----------|------|
| TailwindCSS 4 | 유틸리티 CSS |
| lucide-react | 아이콘 |
| Pretendard | 기본 폰트 (로컬 서빙) |

### 기능 라이브러리
| 라이브러리 | 용도 |
|-----------|------|
| @fullcalendar/react (+ daygrid, timegrid, interaction) | 대시보드 캘린더 |
| @googlemaps/js-api-loader | Google Maps |
| @react-oauth/google | Google OAuth 로그인 |
| date-fns | 날짜 계산 |
| react-day-picker | 날짜 선택 UI |

---

## 3. 프로젝트 구조

```
src/
├── App.jsx                  # 라우터 루트, Footer·ChatBot 전역 렌더
├── main.jsx
├── index.css
│
├── assets/                  # 이미지, 비디오 등 정적 에셋
│
├── components/
│   ├── AppHeader.jsx         # 로그인 여부 무관 공용 헤더
│   ├── ChatBot.jsx           # 전역 플로팅 AI 챗봇
│   ├── ClientBannerCard.jsx  # 클라이언트 프로필 배너
│   ├── PartnerBannerCard.jsx # 파트너 프로필 배너
│   ├── ContractModals.jsx    # 계약서 7개 항목 모달 컴포넌트
│   ├── Header_home.jsx       # 비로그인 헤더
│   ├── Header_client.jsx     # 클라이언트 로그인 헤더
│   ├── Header_partner.jsx    # 파트너 로그인 헤더
│   └── ui/
│       ├── button.jsx
│       ├── calendar.jsx
│       ├── card.jsx
│       └── Footer.jsx
│
├── data/
│   ├── mockPartners.json     # 파트너 목업 데이터
│   └── mockProjects.json     # 프로젝트 목업 데이터
│
├── lib/
│   ├── googleMaps.js
│   └── utils.js
│
├── pages/
│   ├── LandingPage.jsx          # 인트로 비디오 애니메이션 → /home
│   ├── Home.jsx                 # 메인 홈
│   ├── Login.jsx                # 로그인
│   ├── Signup.jsx               # 회원가입
│   ├── OAuthKakaoCallback.jsx   # 카카오 OAuth 콜백
│   ├── Loading.jsx              # 로딩 스피너
│   ├── Mypage.jsx               # 마이페이지
│   ├── PartnerRegister.jsx      # 파트너 등록 (4단계)
│   ├── ClientRegister.jsx       # 클라이언트 등록
│   ├── Partner_Home.jsx         # 파트너 전용 홈
│   ├── Client_Home.jsx          # 클라이언트 전용 홈
│   ├── PartnerSearch.jsx        # 파트너 검색
│   ├── ProjectSearch.jsx        # 프로젝트 검색
│   ├── PartnerProfile.jsx       # 파트너 프로필 상세
│   ├── Client_Profile.jsx       # 클라이언트 프로필 상세
│   ├── Partner_Portfolio.jsx    # 파트너 포트폴리오 관리
│   ├── Client_Portfolio.jsx     # 클라이언트 발주 포트폴리오
│   ├── PortfolioDetailEditor.jsx# 포트폴리오 항목 편집
│   ├── PortfolioProjectPreview.jsx # 포트폴리오 미리보기
│   ├── ProjectRegister.jsx      # 프로젝트 직접 등록
│   ├── AIchatProject.jsx        # AI 챗봇 기반 프로젝트 등록
│   ├── AIchatProfile.jsx        # AI 챗봇 기반 프로필 생성
│   ├── PartnerDashboard.jsx     # 파트너 대시보드
│   ├── ClientDashboard.jsx      # 클라이언트 대시보드
│   ├── SolutionMarket.jsx       # 솔루션 마켓 (84개 솔루션, 7개 대카테고리)
│   ├── SolutionDetail.jsx       # 솔루션 상세 (패키지 선택, 탭 내비)
│   └── UsageGuide.jsx           # 이용 가이드
│
└── store/
    └── useStore.js           # Zustand 전역 스토어
```

---

## 4. 라우트 & 페이지 명세

| 경로 | 컴포넌트 | 접근 권한 | 설명 |
|------|---------|----------|------|
| `/` | `LandingPage` | 전체 | 인트로 비디오 애니메이션 → `/home` 자동 이동 |
| `/home` | `Home` | 전체 | 메인 홈 (카테고리 탐색, 추천 프로젝트, 파트너사 목록) |
| `/login` | `Login` | 비로그인 | 이메일·Google·Kakao 로그인 |
| `/signup` | `Signup` | 비로그인 | 회원가입 |
| `/oauth/kakao/callback` | `OAuthKakaoCallback` | - | 카카오 OAuth 콜백 처리 |
| `/loading` | `Loading` | - | 로딩 스피너 페이지 |
| `/mypage` | `Mypage` | 로그인 | 내 정보 수정 (이름, 생년월일, 전화번호, 계좌 등) |
| `/partner_register` | `PartnerRegister` | 회원 | 파트너 등록 4단계 폼 |
| `/client_register` | `ClientRegister` | 회원 | 클라이언트 등록 폼 |
| `/partner_home` | `Partner_Home` | 파트너 | 파트너 전용 홈 |
| `/client_home` | `Client_Home` | 클라이언트 | 클라이언트 전용 홈 |
| `/partner_search` | `PartnerSearch` | 전체 | 파트너 검색·필터·AI 매칭 |
| `/client_search` | `ClientSearch` | 전체 | 클라이언트 검색·필터·AI 매칭 |
| `/project_search` | `ProjectSearch` | 전체 | 프로젝트 검색·필터·AI 매칭 |
| `/partner_profile` | `PartnerProfile` | 전체 | 파트너 프로필 상세 |
| `/client_profile` | `Client_Profile` | 전체 | 클라이언트 프로필 상세 |
| `/partner_portfolio` | `Partner_Portfolio` | 파트너 | 파트너 포트폴리오 관리 |
| `/client_portfolio` | `Client_Portfolio` | 클라이언트 | 클라이언트 발주 포트폴리오 |
| `/portfolio_detail_editor` | `PortfolioDetailEditor` | 파트너 | 포트폴리오 항목 상세 편집기 |
| `/portfolio_project_preview` | `PortfolioProjectPreview` | 파트너 | 포트폴리오 미리보기 |
| `/project_register` | `ProjectRegister` | 클라이언트 | 프로젝트 직접 등록 폼 |
| `/ai_chat_project` | `AIchatProject` | 클라이언트 | AI 챗봇 기반 프로젝트 등록 |
| `/ai_chat_profile` | `AIchatProfile` | 파트너 | AI 챗봇 기반 프로필 생성 |
| `/partner_dashboard` | `PartnerDashboard` | 파트너 | 파트너 대시보드 (캘린더·계약·진행현황) |
| `/client_dashboard` | `ClientDashboard` | 클라이언트 | 클라이언트 대시보드 (캘린더·계약·진행현황) |
| `/solution_market` | `SolutionMarket` | 전체 | 솔루션 마켓 (대카테고리·소카테고리 필터·카드 목록·페이지네이션) |
| `/solution_detail` | `SolutionDetail` | 전체 | 솔루션 상세 (탭 내비·패키지 선택·리뷰·FAQ·파트너 정보) |
| `/usage_guide` | `UsageGuide` | 전체 | 이용 가이드 (클라이언트/파트너 단계별 안내 + FAQ) |

---

## 5. 기능 명세

### 5-1. 인증 & 회원가입
- **이메일 로그인**: 로컬 Zustand store 기반 (email/pw 검증)
- **Google OAuth**: `@react-oauth/google` → `useGoogleLogin()` 훅
- **Kakao OAuth**: 인가 코드 방식 → `/oauth/kakao/callback` 콜백 처리
- 로그인 후 `sessionStorage.loginRedirect` 값에 따라 이전 진입 경로로 복귀
- 역할 분기: `userRole = 'client' | 'partner'`

### 5-2. 파트너 등록 (4단계)
| 단계 | 내용 |
|------|------|
| STEP 1 | 파트너 유형 선택 (개인 / 팀 / 기업) |
| STEP 2 | 기술 스택 & 희망 연봉 |
| STEP 3 | 경력 & 포트폴리오 링크 (GitHub, 블로그, YouTube) + 파일 업로드 |
| STEP 4 | 자기소개 & 업무 스타일 |

### 5-3. 파트너 검색 (`/partner_search`)
- 텍스트 검색 (실시간 필터)
- 필터 항목:
  - **등급**: 💎 다이아몬드 / 🌙 플래티넘 / 🟡 골드 / ⚫ 실버
  - **파트너 유형**: 개인 / 팀 / 기업
  - **레벨**: 주니어 / 미들 / 시니어
  - **기술 스택**: 태그 입력
  - **예산 슬라이더**
  - **원격 근무 여부**
- 정렬: AI 매칭순 / 평점순 / 최신순
- 페이지네이션 (3개/페이지)

### 5-4. 프로젝트 찾기 (`/project_search`)
- 동일 필터 구조 + 클라이언트 인증 배지 필터 (본인인증 완료 / 사업자등록 완료 / 평가 우수)
- URL 파라미터 `?field=` 로 초기 카테고리 필터 설정 가능

### 5-5. AI 챗봇 기반 등록
- **`/ai_chat_project`** (AI 행운이 챗봇): 클라이언트가 자연어로 프로젝트 요건 입력 → 자동 분석 및 정리
- **`/ai_chat_profile`**: 파트너가 대화형으로 프로필 정보 입력
- **전역 ChatBot** (`ChatBot.jsx`): 모든 페이지 우하단 플로팅 버튼 (랜딩 제외)

### 5-6. 전자 계약 (ContractModals)
대시보드 내 계약 협의 버튼 클릭 시 7개 모달 순차 진행:

| 번호 | 항목 | 컴포넌트 |
|------|------|---------|
| 1 | 작업 범위 | `ScopeModal` |
| 2 | 최종 전달 결과물 정의 | `DeliverablesModal` |
| 3 | 일정 및 마감일 | `ScheduleModal` |
| 4 | 총 금액 및 정산 방식 | `PaymentModal` |
| 5 | 수정 가능 범위 | `RevisionModal` |
| 6 | 완료 기준 | `CompletionModal` |
| 7 | 추가 특약 (선택) | `SpecialTermsModal` |

각 모달: 조회 / 수정 모드 토글, 양측 확인 상태 배지 표시

### 5-7. 대시보드 (파트너 / 클라이언트 공통 구조)
- **FullCalendar** (daygrid + timegrid + interaction): 구글 캘린더 테마
  - 토요일 파스텔 파랑 / 일요일 파스텔 빨강
  - 툴바 직접 커스텀 (월 이동, 뷰 전환 버튼)
- **진행 중 프로젝트 카드** (`PartnerBannerCard` / `ClientBannerCard`)
- **계약서 바로가기** 버튼 → ContractModalLauncher

### 5-8. 솔루션 마켓 (`/solution_market`, `/solution_detail`)
- 히어로 배너 + 검색 입력 + 통계 (등록된 솔루션 320+, 검증 파트너 180+, 평균 별점 4.8★)
- **대카테고리 탭** (7개): 중개 플랫폼 / IT 서비스 구축 / 내부 업무시스템 / AI·머신러닝 / 커머스·쇼핑몰 / 웹사이트 제작 / 마케팅
- **소카테고리 pill 필터**: 카테고리별 4~13개 세부 분류
- 카드 그리드 (`SolutionCard`): 소카테고리 배지, 제목, 설명(2줄), 해시태그, 별점, 납기, 가격, 파트너명, 북마크 토글
- 페이지네이션 (6개/페이지)
- **상세 페이지** (`/solution_detail`):
  - 상단 히어로 이미지 + 제목 + 별점
  - 탭 내비게이션 (스크롤 연동): 솔루션 소개 / 포트폴리오 / 금액 정보 / 리뷰 / 진행 절차 / FAQ
  - 우측 사이드바: STANDARD / PROFESSIONAL / ENTERPRISE 패키지 선택 + 신청하기 버튼 (sticky)
  - 파트너 정보 카드: 포트폴리오 보기 / 문의하기

### 5-9. 이용 가이드 (`/usage_guide`)
- 클라이언트 5단계 / 파트너 5단계 이용 흐름 탭 전환
- 각 단계별 팁 아코디언
- FAQ 섹션 (아코디언 방식)

### 5-10. 마이페이지 (`/mypage`)
- 프로필 이미지 업로드 (카메라 아이콘)
- 개인정보 수정: 이름, 생년월일, 전화번호
- 계좌 정보: 은행 선택 드롭다운 (21개 은행), 계좌번호
- 저장 시 Toast 팝업 피드백

### 5-11. 포트폴리오
- **`/partner_portfolio`**: 파트너의 프로젝트 이력 카드 목록, 추가/편집/삭제
- **`/portfolio_detail_editor`**: 포트폴리오 항목 상세 편집 (이미지, 설명, 기술 스택 등)
- **`/portfolio_project_preview`**: 편집 결과 미리보기

---

## 6. 데이터 모델 (ERD)

> 프론트엔드 폼 입력 필드, 목업 데이터, 에스크로 결제 흐름 전체 기준 스키마 (백엔드 연동 시 참조)

### ERD 다이어그램

```mermaid
erDiagram
    USER {
        string id PK "이메일 (로그인 ID)"
        string pw
        string name
        string phone
        string extraEmail "추가 연락 이메일"
        string taxEmail "세금계산서 이메일"
        string faxNumber "팩스 번호"
        string userId "사용자 핸들"
        string memberType "클라이언트|파트너"
        string detailType "개인|팀|개인사업자|법인사업자"
        string birthDate "생년월일"
        string bankName "은행명 (국민|기업|농협 등)"
        string bankAccount "계좌번호"
        string profileImage "base64"
    }

    PARTNER {
        number id PK
        string userId FK
        string jobCategory "개발|기획|디자인|배포"
        string jobTypes "[] pm/기획|UI/UX|프론트엔드|백엔드|QA|ML_AI|유지보수|클라우드"
        string partnerType "개인|팀|개인사업자|법인사업자"
        string projectType "외주|기간제 근무"
        string workTimes "[]"
        string channels "[]"
        string skills "[]"
        string devLevel "Junior|Mid-level|Senior|Lead"
        string experienceYears
        string workStyle "Remote|On-site|Hybrid"
        number salaryHour "시급 (원)"
        number salaryMonth "월급 (원)"
        string githubUrl "GitHub 프로필 URL"
        string githubTag "GitHub 고정 URL (github.com/{handle})"
        string portfolioUrl "포트폴리오 링크 URL"
        string portfolioTag "포트폴리오 고정 URL (등록 시 자동 생성)"
        string blogUrl
        string youtubeUrl
        string portfolioFile
        string slogan
        string hashtags "[]"
        string selfIntro
        string bio "자기소개 (프로필 관리)"
        string strengthDesc "주요 강점 설명 (프로필 관리)"
        string grade "diamond|platinum|gold|silver"
        number rating
        number completedProjects
    }

    PARTNER_SKILL {
        number id PK
        string partnerId FK
        string techName "기술명"
        string customTech "직접 입력 기술명"
        string proficiency "전문가|고급|중급|초급"
        string experience "1년 미만|1년|2년|3년|5년 이상"
    }

    PARTNER_CAREER {
        number id PK
        string partnerId FK
        string companyName "회사명"
        string jobTitle "직함"
        string startDate "시작연월 (YYYY-MM)"
        string endDate "종료연월 (YYYY-MM, isCurrent=true이면 null)"
        boolean isCurrent "재직 중 여부"
        string employmentType "정규직|계약직|인턴|프리랜서"
        string role "역할 설명"
        string level "Junior|Mid|Senior|Lead"
        string description "담당 업무 상세"
    }

    PARTNER_EDUCATION {
        number id PK
        string partnerId FK
        string schoolType "4년제 대학교|전문대학|고등학교|대학원|기타"
        string schoolName "학교명"
        string major "전공"
        string track "세부 트랙"
        string degreeType "학사|석사|박사|전문학사"
        string status "재학중|졸업|중퇴|휴학"
        string admissionDate "입학연월 (YYYY-MM)"
        string graduationDate "졸업연월 (YYYY-MM)"
        boolean isEnrolled "재학 중 여부"
    }

    PARTNER_CERTIFICATION {
        number id PK
        string partnerId FK
        string certName "자격증명"
        string issuer "발급 기관"
        string acquiredDate "취득일 (YYYY-MM)"
    }

    PARTNER_AWARD {
        number id PK
        string partnerId FK
        string awardName "수상명"
        string awarding "수여 기관"
        string awardDate "수상일 (YYYY-MM)"
        string description "수상 내용 설명"
    }

    AI_MATCH_SCORE {
        number id PK
        string userId FK "조회한 사용자 (클라이언트 or 파트너)"
        string targetId FK "매칭 대상 ID (파트너 or 프로젝트)"
        string targetType "partner|project"
        string filterSnapshot "조회 당시 필터 조건 JSON"
        number score "AI 매칭 점수 0-100"
        string calculatedAt "계산 일시"
    }

    CLIENT {
        number id PK
        string userId FK
        string clientType "법인사업자|개인사업자|개인|팀"
        string orgName "회사명/단체명"
        string managerName
        string managerPhone
        string managerEmail
        string industry "SaaS|웹사이트|AI|앱 제작|유지보수|IT"
        string sloganTitle
        string sloganSub
        string grade "diamond|platinum|gold|silver"
        string verifications "[]"
        number completedProjects
        number postedProjects
        number rating
        number repeatRate
        number budgetMin
        number budgetMax
        number avgProjectBudget
        string preferredWorkType "0:대면|1:원격|2:혼합"
        string avatarColor "HEX"
        string bio
        string strengthDesc
    }

    CLIENT_PREFERRED_SKILL {
        number id PK
        number clientId FK
        string techName "선호 기술"
    }

    CLIENT_PREFERRED_LEVEL {
        number id PK
        number clientId FK
        string level "주니어|미들|시니어"
    }

    CLIENT_MENU_TOGGLE {
        number id PK
        number clientId FK
        boolean intro
        boolean skills
        boolean career
        boolean education
        boolean certificates
        boolean awards
        boolean portfolio
        boolean clientReviews
        boolean activeProjects
    }

    CLIENT_SKILL {
        number id PK
        number clientId FK
        string techName "기술명"
        string proficiency "전문가|고급|중급|초급"
        string experience "6개월~1년|1~2년|3~5년|5년 이상"
    }

    CLIENT_CAREER {
        number id PK
        number clientId FK
        string companyName "회사명"
        string jobTitle "직함"
        string startDate "시작연월 (YYYY-MM)"
        string endDate "종료연월 (YYYY-MM)"
        boolean isCurrent "재직 중 여부"
        string employmentType "정규직|계약직|인턴|프리랜서"
        string role "역할 설명"
        string level "주니어|미들|시니어|리드|임원"
        string description "담당 업무 상세"
    }

    CLIENT_EDUCATION {
        number id PK
        number clientId FK
        string schoolType "4년제 대학교|전문대학|고등학교|대학원|기타"
        string schoolName "학교명"
        string major "전공"
        string degree "학사|석사|박사|전문학사"
        string graduationDate "졸업연월 (YYYY-MM)"
        boolean isEnrolled "재학 중 여부"
    }

    CLIENT_CERTIFICATION {
        number id PK
        number clientId FK
        string certName "자격증명"
        string issuer "발급 기관"
        string acquiredDate "취득일 (YYYY-MM)"
    }

    CLIENT_AWARD {
        number id PK
        number clientId FK
        string awardName "수상명"
        string awarding "수여 기관"
        string awardDate "수상일 (YYYY-MM)"
        string description "수상 내용 설명"
    }

    PROJECT {
        number id PK
        string clientId FK
        string title
        string scope "[]"
        string categories "[]"
        string projectType2 "new|maintain"
        string readyStatus "[]"
        string referenceFile
        string visibility "전체공개|파트너에게만|비공개"
        string fieldCategory
        string projectDescription
        number budgetMin
        number budgetMax
        string startDate
        string endDate
        string deadline
        string meetingType "온라인|오프라인|혼합"
        string requiredSkills "[]"
        string requiredLevel "주니어|미들|시니어"
        number requiredCount
        string workType "외주|기간제"
        string workLocation
        string workStyleFull
        number teamSize
        string badge "유료|무료"
        number progress "진행률 0-100"
    }

    CONTRACT {
        number id PK
        string projectId FK
        string partnerId FK
        string clientId FK
        string status "협의중|체결완료|이행중|완료|해지"
        boolean partnerConfirmed
        boolean clientConfirmed
        string createdAt
    }

    CONTRACT_SCOPE {
        number id PK
        number contractId FK
        string workItems "[]"
        string exclusions "[]"
        string notes
    }

    CONTRACT_DELIVERABLES {
        number id PK
        number contractId FK
        string items "[]"
        string format
        string notes
    }

    CONTRACT_SCHEDULE {
        number id PK
        number contractId FK
        string startDate
        string endDate
    }

    CONTRACT_PAYMENT {
        number id PK
        number contractId FK
        number total "총 계약금"
        string method "일시불|단계별|선금후불"
        string stages "[]"
    }

    CONTRACT_REVISION {
        number id PK
        number contractId FK
        number count "수정 가능 횟수"
        string scope
        string period
    }

    CONTRACT_COMPLETION {
        number id PK
        number contractId FK
        string criteria "[]"
        string checkMethod
    }

    CONTRACT_TERMS {
        number id PK
        number contractId FK
        string content
    }

    MILESTONE {
        number id PK
        number contractId FK
        number orderIndex "정렬 순서"
        string title
        string startDate
        string endDate
        string badge "완료|진행 중|재작업|대기"
        string extra "추가 메모"
        string statusLabel "Completed|Ongoing|Rework|Pending"
        string statusColor "HEX"
        string btnLabel "버튼 레이블"
        string btnStyle "outline|primary|danger"
    }

    ESCROW {
        number id PK
        number milestoneId FK
        number contractId FK
        number amount "예치 금액 (원)"
        string status "결제 대기|에스크로 보관 중|납품 검수 중|정산 완료"
        string paidAt "예치 일시"
        string submittedAt "납품 제출 일시"
        string approvedAt "클라이언트 승인 일시"
        string settledAt "파트너 정산 완료 일시"
    }

    MILESTONE_SUBMISSION {
        number id PK
        number milestoneId FK
        string partnerId FK
        string memo
        string submitLinks "[]"
        string submittedAt
    }

    MILESTONE_SUBMISSION_FILE {
        number id PK
        number submissionId FK
        string name
        string size
        string fileType
    }

    PROJECT_FILE {
        number id PK
        number contractId FK
        string uploaderId FK
        string name
        string fileType "pdf|fig|docx|zip|etc"
        string size
        string message
        string downloadUrl
        string uploadedAt
    }

    PROJECT_LINK {
        number id PK
        number contractId FK
        string addedById FK
        string title
        string url
        string description
        string addedAt
    }

    PROJECT_MEETING {
        number id PK
        number contractId FK
        string date "미팅 일시"
        string location "Virtual(Zoom)|오프라인 주소"
        string type "온라인|오프라인|혼합"
        string agenda
        string frequency "정기: 주 1회|비정기"
    }

    CONTRACT_DISCUSSION {
        number id PK
        number contractId FK
        string clientId FK
        string partnerId FK
        string lastMessageAt
        number unreadCount
    }

    CONTRACT_DISCUSSION_MESSAGE {
        number id PK
        number discussionId FK
        string senderId FK
        string text
        string sentAt
    }

    CONTRACT_AGREEMENT_ITEM {
        number id PK
        number discussionId FK
        number itemIndex "0-6"
        string label "작업 범위|전달물|일정|금액|수정|완료기준|특약"
        string status "논의 중|미확정|완료|제안됨"
    }

    CALENDAR_EVENT {
        number id PK
        string userId FK
        string title
        string start "ISO datetime"
        string end "ISO datetime"
        string color "HEX"
        boolean allDay
        number contractId FK "nullable"
    }

    ALARM {
        number id PK
        string userId FK
        number contractId FK "nullable"
        number milestoneId FK "nullable"
        string type "meeting_proposal|milestone_review|file_received|escrow_paid|escrow_settled"
        string title
        string desc
        boolean isRead
        string createdAt
    }

    PORTFOLIO_ITEM {
        number id PK
        string partnerId FK
        string title
        string titleColor "HEX"
        string company
        string desc
        string tags "[]"
    }

    SOLUTION {
        number id PK
        string majorCategory "중개플랫폼|IT서비스구축|내부업무시스템|AI머신러닝|커머스|웹사이트제작|마케팅"
        string subCategory "세부 카테고리"
        string title
        string description
        string tags "[]"
        string partner "파트너명 (표시용)"
        string price "₩25,000,000~ 형식"
        string duration "4개월|2주|상시 형식"
        number rating
        number reviews
    }

    SOLUTION_PACKAGE {
        number id PK
        number solutionId FK
        string tier "standard|professional|enterprise"
        string price
        string description
        string period
        string features "[]"
    }

    PROJECT_APPLICATION {
        number id PK
        number projectId FK
        string projectTitle
        string projectTags "[]"
        string projectWorkPref
        string projectPrice
        string projectPeriod
        string clientId FK
        string partnerName "파트너 표시명"
        string appliedAt
        string status "검토 중|합격|불합격"
    }

    PAYMENT_TRANSACTION {
        number id PK
        number escrowId FK
        string payerId FK "결제 클라이언트 userId"
        string method "카드|계좌이체|가상계좌"
        number amount "결제 금액 (원)"
        string pgTxId "PG사 거래 ID"
        string status "대기|완료|취소|실패"
        string createdAt "거래 생성 일시"
        string confirmedAt "결제 확인 일시"
    }

    PLATFORM_FEE {
        number id PK
        number contractId FK
        number contractAmount "최종 계약 금액"
        number feeRate "계약 수수료율 (기본 10%)"
        number feeAmount "수수료 금액"
        number vatAmount "VAT (별도)"
        number partnerFeeRate "파트너 정산 수수료율 (5.5% VAT포함)"
        number partnerFeeAmount "실제 공제 수수료"
        number settleAmount "파트너 실수령액"
        string status "미정산|정산완료"
        string settledAt "정산 완료 일시"
    }

    %% ─── 사용자 / 역할 ───────────────────────────────────
    USER ||--o| PARTNER : "파트너 등록"
    USER ||--o| CLIENT : "클라이언트 등록"

    %% ─── 프로젝트 / 계약 ─────────────────────────────────
    CLIENT ||--o{ PROJECT : "발주"
    PROJECT ||--o| CONTRACT : "체결"
    PARTNER ||--o{ CONTRACT : "수주"
    CLIENT ||--o{ CONTRACT : "의뢰"

    %% ─── 계약 세부 항목 (7개) ────────────────────────────
    CONTRACT ||--|| CONTRACT_SCOPE : "작업 범위"
    CONTRACT ||--|| CONTRACT_DELIVERABLES : "전달물"
    CONTRACT ||--|| CONTRACT_SCHEDULE : "일정"
    CONTRACT ||--|| CONTRACT_PAYMENT : "금액/정산"
    CONTRACT ||--|| CONTRACT_REVISION : "수정 범위"
    CONTRACT ||--|| CONTRACT_COMPLETION : "완료 기준"
    CONTRACT ||--o| CONTRACT_TERMS : "추가 특약(선택)"

    %% ─── 마일스톤 / 에스크로 ────────────────────────────
    CONTRACT ||--o{ MILESTONE : "마일스톤 목록"
    MILESTONE ||--|| ESCROW : "에스크로 결제"
    MILESTONE ||--o{ MILESTONE_SUBMISSION : "납품 제출"
    MILESTONE_SUBMISSION ||--o{ MILESTONE_SUBMISSION_FILE : "첨부 파일"

    %% ─── 프로젝트 공유 자료 ──────────────────────────────
    CONTRACT ||--o{ PROJECT_FILE : "공유 파일"
    CONTRACT ||--o{ PROJECT_LINK : "공유 링크"
    CONTRACT ||--o{ PROJECT_MEETING : "정기 미팅"

    %% ─── 계약 협의 채팅 ──────────────────────────────────
    CONTRACT ||--o{ CONTRACT_DISCUSSION : "협의 대화"
    CONTRACT_DISCUSSION ||--o{ CONTRACT_DISCUSSION_MESSAGE : "채팅 메시지"
    CONTRACT_DISCUSSION ||--o{ CONTRACT_AGREEMENT_ITEM : "7개 합의 항목"

    %% ─── 대시보드 부가 기능 ──────────────────────────────
    USER ||--o{ CALENDAR_EVENT : "캘린더 이벤트"
    USER ||--o{ ALARM : "알림"

    %% ─── 파트너 프로필 관리 세부 항목 ───────────────────
    PARTNER ||--o{ PARTNER_SKILL : "보유 기술"
    PARTNER ||--o{ PARTNER_CAREER : "경력"
    PARTNER ||--o{ PARTNER_EDUCATION : "학력"
    PARTNER ||--o{ PARTNER_CERTIFICATION : "자격증"
    PARTNER ||--o{ PARTNER_AWARD : "수상이력"

    %% ─── 클라이언트 프로필 관리 세부 항목 ───────────────
    CLIENT ||--o{ CLIENT_PREFERRED_SKILL : "선호 기술"
    CLIENT ||--o{ CLIENT_PREFERRED_LEVEL : "선호 레벨"
    CLIENT ||--|| CLIENT_MENU_TOGGLE : "프로필 섹션 노출"
    CLIENT ||--o{ CLIENT_SKILL : "보유 기술"
    CLIENT ||--o{ CLIENT_CAREER : "경력"
    CLIENT ||--o{ CLIENT_EDUCATION : "학력"
    CLIENT ||--o{ CLIENT_CERTIFICATION : "자격증"
    CLIENT ||--o{ CLIENT_AWARD : "수상이력"

    %% ─── 파트너 콘텐츠 ───────────────────────────────────
    PARTNER ||--o{ PORTFOLIO_ITEM : "포트폴리오"
    PARTNER ||--o{ SOLUTION : "솔루션 등록"

    %% ─── 솔루션 패키지 ──────────────────────────────────
    SOLUTION ||--o{ SOLUTION_PACKAGE : "패키지 구성"

    %% ─── 프로젝트 지원 ──────────────────────────────────
    PARTNER ||--o{ PROJECT_APPLICATION : "프로젝트 지원"
    PROJECT ||--o{ PROJECT_APPLICATION : "지원 접수"

    %% ─── AI 매칭 스코어 (필터별 동적 생성) ──────────────
    USER ||--o{ AI_MATCH_SCORE : "매칭 조회"

    %% ─── 결제 ────────────────────────────────────────────
    ESCROW ||--o{ PAYMENT_TRANSACTION : "결제 거래"
    CONTRACT ||--|| PLATFORM_FEE : "플랫폼 수수료"
```

### 에스크로 결제 흐름 (상태 머신)

```
[클라이언트]  결제 대기
                 │ 결제 예치하기 클릭 → EscrowPayModal 확인
                 ▼
             에스크로 보관 중  ────── DevBridge 플랫폼 보관
                 │ (파트너 납품 제출 → MilestoneSubmitModal)
                 ▼
             납품 검수 중     ────── 파트너 제출 완료, 클라이언트 검수 대기
                 │ 결과물 검수 클릭 → MilestoneReviewModal → 승인 완료
                 ▼
             정산 완료        ────── 파트너에게 금액 지급
```

| 에스크로 상태 | 클라이언트 화면 | 파트너 화면 |
|---|---|---|
| 결제 대기 | **결제 예치하기** 버튼 | 🕐 클라이언트 결제 대기 중... |
| 에스크로 보관 중 | ⏳ 파트너 작업 진행 중... | 🔒 에스크로 확인됨 — 납품 후 정산 |
| 납품 검수 중 | **결과물 검수** 버튼 | 🔍 납품 제출 완료 — 클라이언트 검수 중... |
| 정산 완료 | ✅ 정산 지급 완료 | ✅ ₩{amount} 정산 완료 |

### 엔티티 상세 스키마

#### USER

| 필드 | 타입 | 설명 |
|------|------|------|
| id | string | PK — 이메일 (로그인 ID) |
| pw | string | 비밀번호 |
| name | string | 이름 |
| phone | string | 전화번호 |
| extraEmail | string | 추가 연락 이메일 |
| userId | string | 사용자 핸들 |
| memberType | string | `클라이언트` \| `파트너` |
| detailType | string | `개인` \| `팀` \| `개인사업자` \| `법인사업자` |
| birthDate | string | 생년월일 `YYYY-MM-DD` |
| bank | string | 은행명 (21개 중 선택) |
| bankAccount | string | 계좌번호 |
| profileImage | string | 프로필 이미지 base64 |

#### PARTNER

**STEP 1 — 파트너 유형**

| 필드 | 타입 | 설명 |
|------|------|------|
| jobCategory | string | `개발` \| `기획` \| `디자인` \| `배포` |
| jobTypes | string[] | pm/기획, UI/UX 디자인, 프론트엔드, 백엔드, QA, ML/AI, 유지보수, 클라우드 |
| partnerType | string | `개인` \| `팀` \| `개인사업자` \| `법인사업자` |
| projectType | string | `외주` \| `기간제 근무` |
| workTimes | string[] | `오전` \| `오후` \| `심야` |
| channels | string[] | 카카오톡, 전화, 디스코드, 슬랙, 데브브릿지 DM |

**STEP 2 — 기술 스택 & 연봉**

| 필드 | 타입 | 설명 |
|------|------|------|
| skills | string[] | 선택된 기술 스택 |
| devLevel | string | Junior(0-2y) \| Mid-level(2-5y) \| Senior(5-7y) \| Lead/Principal |
| experienceYears | string | `< 1 year` \| `1-2 years` \| `3-5 years` \| `5-7 years` \| `7+ years` |
| workStyle | string | `Remote` \| `On-site` \| `Hybrid` |
| salaryMin | number | 희망 연봉 최소 (만원) |
| salaryMax | number | 희망 연봉 최대 (만원) |

**STEP 3 — Career & Portfolio**

| 필드 | 타입 | 설명 |
|------|------|------|
| githubUrl | string | GitHub 프로필 URL |
| blogUrl | string | 블로그 URL |
| youtubeUrl | string | YouTube 채널 URL |
| portfolioFile | string | 포트폴리오 파일명 (PDF/DOCX, 최대 10MB) |

**STEP 4 — 자기소개**

| 필드 | 타입 | 설명 |
|------|------|------|
| slogan | string | 나를 소개하는 한 줄 슬로건 |
| hashtags | string[] | `#키워드` 형태 해시태그 |
| selfIntro | string | 자기소개 텍스트 |
| selfIntroFile | string | 자기소개서 파일명 |

**목업 데이터 추가 필드**

| 필드 | 타입 | 설명 |
|------|------|------|
| grade | string | `diamond` \| `platinum` \| `gold` \| `silver` |
| match | number | AI 매칭 스코어 (0~100) |
| completedProjects | number | 완료 프로젝트 수 |
| rating | number | 평점 (0~5) |

#### CLIENT

| 필드 | 타입 | 설명 |
|------|------|------|
| clientType | string | `법인사업자` \| `개인사업자` \| `개인` \| `팀` |
| orgName | string | 회사명/단체명 |
| managerName | string | 담당자 성함 |
| phone | string | 연락처 |
| email | string | 이메일 |
| sloganTitle | string | 프로젝트 관리 슬로건 제목 |
| sloganSub | string | 슬로건 부제 |
| grade | string | `diamond` \| `platinum` \| `gold` \| `silver` |
| verifications | string[] | `본인인증 완료` \| `사업자등록 완료` \| `평가 우수` |

#### PROJECT

| 필드 | 타입 | 설명 |
|------|------|------|
| title | string | 프로젝트 제목 |
| scope | string[] | `기획` \| `디자인` \| `퍼블리싱` \| `개발` |
| categories | string[] | `웹` \| `안드로이드` \| `iOS` \| `PC 프로그램` \| `임베디드` \| `기타` |
| projectType2 | string | `new` (신규) \| `maintain` (유지보수) |
| readyStatus | string[] | `idea` \| `doc` \| `design` \| `code` |
| visibility | string | `전체 공개` \| `파트너에게만 공개` \| `비공개` |
| fieldCategory | string | IT서비스구축 \| 내부업무시스템 \| AI·머신러닝 \| 커머스 \| 웹사이트 \| 클라우드 \| 컨설팅 \| 유지보수 \| 기타 |
| budgetMin / budgetMax | number | 예산 범위 (만원) |
| deadline | string | 모집 마감 기한 |
| meetingType | string | `온라인` \| `오프라인` \| `혼합` |
| requiredLevel | string | `주니어` \| `미들` \| `시니어` |
| requiredCount | number | 모집 인원 |
| workType | string | `외주` \| `기간제` |
| badge | string | `유료` \| `무료` |
| progress | number | 진행률 (0~100) |

#### CONTRACT

| 필드 | 타입 | 설명 |
|------|------|------|
| projectId | string | FK → PROJECT |
| partnerId | string | FK → PARTNER |
| clientId | string | FK → CLIENT |
| status | string | `협의중` \| `체결완료` \| `이행중` \| `완료` \| `해지` |
| partnerConfirmed | boolean | 파트너 최종 확인 여부 |
| clientConfirmed | boolean | 클라이언트 최종 확인 여부 |
| createdAt | string | 계약 생성 일시 |

#### CONTRACT 세부 항목 (7개)

| 항목 | 엔티티 | 주요 필드 |
|------|--------|----------|
| 1. 작업 범위 | `CONTRACT_SCOPE` | `workItems[]`, `exclusions[]`, `notes` |
| 2. 최종 결과물 | `CONTRACT_DELIVERABLES` | `items[]`, `format`, `notes` |
| 3. 일정 | `CONTRACT_SCHEDULE` | `startDate`, `endDate` |
| 4. 금액/정산 | `CONTRACT_PAYMENT` | `total`, `method`, `stages[]` |
| 5. 수정 범위 | `CONTRACT_REVISION` | `count`, `scope`, `period` |
| 6. 완료 기준 | `CONTRACT_COMPLETION` | `criteria[]`, `checkMethod` |
| 7. 추가 특약 | `CONTRACT_TERMS` | `content` (선택) |

#### MILESTONE

| 필드 | 타입 | 설명 |
|------|------|------|
| contractId | number | FK → CONTRACT |
| orderIndex | number | 정렬 순서 (1, 2, 3…) |
| title | string | 마일스톤 제목 |
| startDate / endDate | string | 기간 |
| badge | string | `완료` \| `진행 중` \| `재작업` \| `대기` |
| extra | string | 추가 메모 (예: "산출물 제출: 2024.03.12") |
| statusLabel | string | `Completed` \| `Ongoing` \| `Rework` \| `Pending` |
| btnLabel | string | UI 버튼 텍스트 |
| btnStyle | string | `outline` \| `primary` \| `danger` |

#### ESCROW

| 필드 | 타입 | 설명 |
|------|------|------|
| milestoneId | number | FK → MILESTONE (1:1) |
| contractId | number | FK → CONTRACT |
| amount | number | 예치 금액 (원) |
| status | string | `결제 대기` \| `에스크로 보관 중` \| `납품 검수 중` \| `정산 완료` |
| paidAt | string | 클라이언트 결제 예치 일시 |
| submittedAt | string | 파트너 납품 제출 일시 |
| approvedAt | string | 클라이언트 승인 일시 |
| settledAt | string | 파트너 정산 완료 일시 |

#### MILESTONE_SUBMISSION

| 필드 | 타입 | 설명 |
|------|------|------|
| milestoneId | number | FK → MILESTONE |
| partnerId | string | FK → PARTNER |
| memo | string | 작업 메모 |
| submitLinks | string[] | 외부 링크 (GitHub, Figma 등) |
| submittedAt | string | 제출 일시 |

파트너가 `MilestoneSubmitModal`을 통해 파일 + 링크 + 메모를 제출하면 해당 마일스톤의 ESCROW 상태가 `에스크로 보관 중 → 납품 검수 중`으로 전환됨.

#### PROJECT_FILE

| 필드 | 타입 | 설명 |
|------|------|------|
| contractId | number | FK → CONTRACT |
| uploaderId | string | FK → USER |
| name | string | 파일명 |
| fileType | string | `pdf` \| `fig` \| `docx` \| `zip` \| 기타 |
| size | string | "2.4 MB / PDF" 형태 |
| message | string | 업로드 메시지 |
| downloadUrl | string | 다운로드 경로 |
| uploadedAt | string | 업로드 일시 |

#### PROJECT_LINK

| 필드 | 타입 | 설명 |
|------|------|------|
| contractId | number | FK → CONTRACT |
| addedById | string | FK → USER |
| title | string | 링크 제목 |
| url | string | 링크 URL |
| description | string | 링크 설명 |
| addedAt | string | 추가 일시 |

#### PROJECT_MEETING

| 필드 | 타입 | 설명 |
|------|------|------|
| contractId | number | FK → CONTRACT |
| date | string | 미팅 일시 ("2024년 5월 18일 · 14:00") |
| location | string | 장소 (예: "Virtual (Zoom)") |
| type | string | `온라인` \| `오프라인` \| `혼합` |
| agenda | string | 미팅 안건 |
| frequency | string | `정기: 주 1회` \| `비정기` |

#### CONTRACT_DISCUSSION (계약 협의 채팅)

대시보드 **계약 협의 미팅** 탭의 파트너↔클라이언트 채팅 스레드.

| 필드 | 타입 | 설명 |
|------|------|------|
| contractId | number | FK → CONTRACT |
| clientId | string | FK → CLIENT |
| partnerId | string | FK → PARTNER |
| unreadCount | number | 미읽음 메시지 수 |
| lastMessageAt | string | 마지막 메시지 시각 |

#### CONTRACT_DISCUSSION_MESSAGE

| 필드 | 타입 | 설명 |
|------|------|------|
| discussionId | number | FK → CONTRACT_DISCUSSION |
| senderId | string | FK → USER |
| text | string | 메시지 내용 |
| sentAt | string | 전송 일시 |

#### CONTRACT_AGREEMENT_ITEM

계약 협의 탭에서 7개 합의 항목별 협의 상태를 추적.

| 필드 | 타입 | 설명 |
|------|------|------|
| discussionId | number | FK → CONTRACT_DISCUSSION |
| itemIndex | number | 0~6 (7개 항목 순서) |
| label | string | `작업 범위` \| `최종 전달물 정의서` \| `마감 일정 및 마일스톤` \| `총 금액` \| `수정 가능 범위` \| `완료 기준` \| `추가 특약` |
| status | string | `논의 중` \| `미확정` \| `완료` \| `제안됨` |

#### CALENDAR_EVENT

| 필드 | 타입 | 설명 |
|------|------|------|
| userId | string | FK → USER |
| title | string | 이벤트 제목 |
| start / end | string | ISO datetime |
| color | string | HEX 색상 |
| allDay | boolean | 종일 이벤트 여부 |
| contractId | number | FK → CONTRACT (nullable, 계약 연관 일정) |

#### ALARM

| 필드 | 타입 | 설명 |
|------|------|------|
| userId | string | FK → USER |
| contractId | number | FK → CONTRACT (nullable) |
| milestoneId | number | FK → MILESTONE (nullable) |
| type | string | `meeting_proposal` \| `milestone_review` \| `file_received` \| `escrow_paid` \| `escrow_settled` |
| title | string | 알림 제목 |
| desc | string | 알림 내용 |
| isRead | boolean | 읽음 여부 |
| createdAt | string | 알림 생성 일시 |

#### SOLUTION

| 필드 | 타입 | 설명 |
|------|------|------|
| majorCategory | string | `중개 플랫폼` \| `IT 서비스 구축` \| `내부 업무시스템` \| `AI / 머신러닝` \| `커머스 / 쇼핑몰` \| `웹사이트 제작` \| `마케팅` |
| subCategory | string | 대카테고리 하위 세부 분류 |
| title | string | 솔루션 제목 |
| description | string | 솔루션 설명 |
| tags | string[] | 기술 태그 |
| partner | string | 파트너명 (표시용) |
| price | string | `₩25,000,000~` 형식 문자열 |
| duration | string | `4개월`, `2주`, `상시` 등 문자열 |
| rating / reviews | number | 평점 / 리뷰 수 |

#### SOLUTION_PACKAGE

솔루션 상세 페이지의 패키지 선택 옵션.

| 필드 | 타입 | 설명 |
|------|------|------|
| solutionId | number | FK → SOLUTION |
| tier | string | `standard` \| `professional` \| `enterprise` |
| price | string | 가격 표시 문자열 |
| description | string | 패키지 설명 |
| period | string | 예상 기간 (예: `예상 기간: 4주`) |
| features | string[] | 패키지 포함 기능 목록 |

#### PROJECT_APPLICATION

파트너가 클라이언트 프로젝트에 지원할 때 생성되는 지원 내역.

| 필드 | 타입 | 설명 |
|------|------|------|
| projectId | number | FK → PROJECT |
| projectTitle | string | 프로젝트 제목 (스냅샷) |
| projectTags | string[] | 프로젝트 기술 태그 (스냅샷) |
| projectWorkPref | string | 근무 형태 (스냅샷) |
| projectPrice | string | 예산 (스냅샷) |
| projectPeriod | string | 기간 (스냅샷) |
| clientId | string | FK → CLIENT |
| partnerName | string | 지원 파트너 표시명 |
| appliedAt | string | 지원 일시 |
| status | string | `검토 중` \| `합격` \| `불합격` |

#### PORTFOLIO_ITEM

| 필드 | 타입 | 설명 |
|------|------|------|
| partnerId | string | FK → PARTNER |
| title | string | 프로젝트 제목 |
| titleColor | string | HEX 제목 색상 |
| company | string | 관련 회사명 |
| desc | string | 프로젝트 설명 |
| tags | string[] | 사용 기술 태그 |

#### BANK_ACCOUNT

> `Mypage.jsx` `BankCard` 컴포넌트에서 등록 · 관리하는 정산 계좌 정보

| 필드 | 타입 | 설명 |
|------|------|------|
| id | number | PK |
| userId | string | FK → USER |
| bankName | string | 은행명 (국민·기업·농협 등 21개 중 선택) |
| accountNumber | string | 계좌번호 |
| accountHolder | string | 예금주명 |
| bankContact | string | 은행 연락처 |
| bankFax | string | 팩스번호 |
| isDefault | boolean | 기본 정산 계좌 여부 |
| registeredAt | string | 등록 일시 |

#### PAYMENT_TRANSACTION

> 에스크로 예치 시 발생하는 실제 결제 거래 내역 (`EscrowPayModal` 결제 확인 연동)

| 필드 | 타입 | 설명 |
|------|------|------|
| id | number | PK |
| escrowId | number | FK → ESCROW |
| payerId | string | FK → USER (결제 클라이언트) |
| method | string | `카드` \| `계좌이체` \| `가상계좌` |
| amount | number | 결제 금액 (원) |
| pgTxId | string | PG사 거래 고유 ID |
| status | string | `대기` \| `완료` \| `취소` \| `실패` |
| createdAt | string | 거래 생성 일시 |
| confirmedAt | string | 결제 확인 일시 |

#### PLATFORM_FEE

> 계약 체결 시 생성되는 플랫폼 수수료 및 파트너 정산 수수료 내역

| 필드 | 타입 | 설명 |
|------|------|------|
| id | number | PK |
| contractId | number | FK → CONTRACT |
| contractAmount | number | 최종 계약 금액 (원) |
| feeRate | number | 플랫폼 계약 수수료율 (기본 **10%**, VAT 별도) |
| feeAmount | number | 수수료 금액 |
| vatAmount | number | 부가가치세 (VAT) 금액 |
| partnerFeeRate | number | 파트너 정산 시 공제 수수료율 (**5.5%** VAT 포함) |
| partnerFeeAmount | number | 파트너 정산 공제 금액 |
| settleAmount | number | 파트너 실수령액 |
| status | string | `미정산` \| `정산완료` |
| settledAt | string | 정산 완료 일시 (납품 승인 후 2영업일 이내) |

---

### 🗄️ 백엔드 DB 스키마 (Excel ERD 기준)

> 백엔드 API 개발 시 참조하는 실제 DB 테이블 명세.  
> `⚠️` 표시는 ERD에 누락되어 **프론트엔드 구현 기준으로 추가가 필요한 테이블/컬럼**임.

---

#### 📦 Tab 1 — 사용자 & 인증

##### USERS

| 컬럼명 | 타입 | 제약 | 설명 |
|-------|------|------|------|
| user_id | BIGINT | PK | 자동 증가 |
| login_id | VARCHAR(100) | UK, NOT NULL | 이메일 (로그인 ID) |
| password_hash | VARCHAR(255) | NULL | 소셜 로그인 시 NULL |
| name | VARCHAR(50) | NOT NULL | |
| phone | VARCHAR(20) | NULL | |
| extra_email | VARCHAR(100) | NULL | 추가 연락 이메일 |
| member_type | ENUM | NOT NULL | `CLIENT` \| `PARTNER` |
| detail_type | ENUM | NULL | `INDIVIDUAL` \| `TEAM` \| `SOLE_PROPRIETOR` \| `CORPORATION` |
| birthdate | DATE | NULL | |
| gender | ENUM | NULL | `MALE` \| `FEMALE` \| `OTHER` |
| region | VARCHAR(100) | NULL | 활동 지역 |
| tax_email | VARCHAR(100) | NULL | 세금계산서 이메일 |
| contact | VARCHAR(20) | NULL | 추가 연락처 |
| fax | VARCHAR(20) | NULL | 팩스 번호 |
| `⚠️ profile_image_url` | VARCHAR(1000) | NULL | **ERD 누락** — 프로필 사진 S3 URL (`Mypage.jsx` heroImage) |
| created_at | DATETIME | NOT NULL | |

##### OAUTH_ACCOUNT

| 컬럼명 | 타입 | 제약 | 설명 |
|-------|------|------|------|
| oauth_account_id | BIGINT | PK | |
| user_id | BIGINT | FK→USERS | |
| provider | ENUM | NOT NULL | `GOOGLE` \| `KAKAO` \| `NAVER` |
| provider_user_id | VARCHAR(200) | NOT NULL | OAuth 제공자 측 고유 ID |
| access_token | TEXT | NULL | |
| refresh_token | TEXT | NULL | |
| expires_at | DATETIME | NULL | 토큰 만료 일시 |

##### BANK_ACCOUNT

| 컬럼명 | 타입 | 제약 | 설명 |
|-------|------|------|------|
| bank_account_id | BIGINT | PK | |
| user_id | BIGINT | FK→USERS | |
| bank_name | VARCHAR(50) | NOT NULL | 은행명 (21개 선택) |
| account_number | VARCHAR(30) | NOT NULL | 계좌번호 |
| account_holder | VARCHAR(50) | NOT NULL | 예금주명 |
| is_verified | BOOLEAN | DEFAULT FALSE | 1원 인증 완료 여부 |
| verified_at | DATETIME | NULL | |
| is_default | BOOLEAN | DEFAULT FALSE | 기본 정산 계좌 여부 |

##### BANK_VERIFICATION

| 컬럼명 | 타입 | 제약 | 설명 |
|-------|------|------|------|
| bank_verification_id | BIGINT | PK | |
| user_id | BIGINT | FK→USERS | |
| amount | INT | NOT NULL | 검증 입금액 (1원 인증) |
| verified_code | VARCHAR(10) | NULL | 인증 코드 |
| verified_at | DATETIME | NULL | |
| status | ENUM | NOT NULL | `PENDING` \| `SUCCESS` \| `EXPIRED` |

##### EMAIL_VERIFICATION_TOKEN

| 컬럼명 | 타입 | 제약 | 설명 |
|-------|------|------|------|
| token_id | BIGINT | PK | |
| user_id | BIGINT | FK→USERS | |
| token | VARCHAR(100) | UK, NOT NULL | 이메일 인증 토큰 |
| expires_at | DATETIME | NOT NULL | |
| used_at | DATETIME | NULL | 사용된 경우 일시 |

---

#### 📦 Tab 2 — 파트너 프로필

##### PARTNER_PROFILE

| 컬럼명 | 타입 | 제약 | 설명 |
|-------|------|------|------|
| partner_profile_id | BIGINT | PK | |
| user_id | BIGINT | FK→USERS, UK | |
| partner_type | ENUM | NOT NULL | `INDIVIDUAL` \| `TEAM` \| `SOLE_PROPRIETOR` \| `CORPORATION` |
| job_category | ENUM | NOT NULL | `DEV` \| `PLANNING` \| `DESIGN` \| `DEPLOY` |
| job_types | JSON | NULL | 직종 코드 배열 |
| project_type | ENUM | NULL | `OUTSOURCE` \| `FULLTIME` |
| work_times | JSON | NULL | `MORNING` / `AFTERNOON` / `NIGHT` 배열 |
| channels | JSON | NULL | 소통 채널 배열 |
| dev_level | ENUM | NULL | `JUNIOR` \| `MID` \| `SENIOR` \| `LEAD` |
| experience_years | VARCHAR(20) | NULL | |
| hourly_rate | INT | NULL | 시간당 단가 (원) |
| monthly_rate | INT | NULL | 월 기본급 (원) |
| work_style | ENUM | NULL | `REMOTE` \| `ON_SITE` \| `HYBRID` |
| github_url | VARCHAR(500) | NULL | |
| blog_url | VARCHAR(500) | NULL | |
| website_url | VARCHAR(500) | NULL | |
| portfolio_file_url | VARCHAR(1000) | NULL | S3 URL |
| bio | TEXT | NULL | 한 줄 슬로건 |
| tags | JSON | NULL | 해시태그 배열 |
| grade | ENUM | NULL | `DIAMOND` \| `PLATINUM` \| `GOLD` \| `SILVER` |
| match_score | DECIMAL(5,2) | NULL | AI 매칭 스코어 |
| created_at | DATETIME | NOT NULL | |

##### PARTNER_INTRODUCTION

| 컬럼명 | 타입 | 제약 | 설명 |
|-------|------|------|------|
| introduction_id | BIGINT | PK | |
| partner_profile_id | BIGINT | FK→PARTNER_PROFILE, UK | |
| self_intro | TEXT | NULL | 자기소개 (최대 5000자) |
| main_expertise | TEXT | NULL | 주 전문 분야 (최대 5000자) |

##### SKILL_MASTER

| 컬럼명 | 타입 | 제약 | 설명 |
|-------|------|------|------|
| skill_id | BIGINT | PK | |
| skill_name | VARCHAR(100) | UK, NOT NULL | |
| skill_category | VARCHAR(50) | NULL | 기술 분류 |
| skill_icon_url | VARCHAR(500) | NULL | |

##### PARTNER_SKILL

| 컬럼명 | 타입 | 제약 | 설명 |
|-------|------|------|------|
| partner_skill_id | BIGINT | PK | |
| partner_profile_id | BIGINT | FK→PARTNER_PROFILE | |
| skill_id | BIGINT | FK→SKILL_MASTER, NULL | 공식 기술 (직접 입력 시 NULL) |
| custom_skill_name | VARCHAR(100) | NULL | 직접 입력 기술명 |
| proficiency | ENUM | NOT NULL | `EXPERT` \| `ADVANCED` \| `INTERMEDIATE` \| `BEGINNER` |
| experience | ENUM | NOT NULL | `LESS_THAN_1Y` \| `1_TO_3Y` \| `3_TO_5Y` \| `5Y_PLUS` |

##### HASHTAG_MASTER

| 컬럼명 | 타입 | 제약 | 설명 |
|-------|------|------|------|
| hashtag_id | BIGINT | PK | |
| tag_name | VARCHAR(100) | UK, NOT NULL | `#` 포함 해시태그 |
| usage_count | INT | DEFAULT 0 | |

---

#### 📦 Tab 3 — 클라이언트 프로필

##### CLIENT_PROFILE

| 컬럼명 | 타입 | 제약 | 설명 |
|-------|------|------|------|
| client_profile_id | BIGINT | PK | |
| user_id | BIGINT | FK→USERS, UK | |
| client_type | ENUM | NOT NULL | `CORPORATION` \| `SOLE_PROPRIETOR` \| `INDIVIDUAL` \| `TEAM` |
| company_name | VARCHAR(200) | NOT NULL | 회사명/단체명 |
| manager_name | VARCHAR(50) | NOT NULL | |
| manager_phone | VARCHAR(20) | NOT NULL | |
| manager_email | VARCHAR(100) | NOT NULL | |
| slogan | VARCHAR(200) | NULL | 슬로건 제목 |
| subtitle | VARCHAR(300) | NULL | 슬로건 부제 |
| logo_url | VARCHAR(1000) | NULL | S3 URL |
| verification_status | JSON | NULL | 인증 배지 배열 |

##### CLIENT_PROFILE_STATS

| 컬럼명 | 타입 | 제약 | 설명 |
|-------|------|------|------|
| stats_id | BIGINT | PK | |
| client_profile_id | BIGINT | FK→CLIENT_PROFILE, UK | |
| grade | ENUM | NULL | `DIAMOND` \| `PLATINUM` \| `GOLD` \| `SILVER` |
| completed_projects | INT | DEFAULT 0 | |
| rating | DECIMAL(3,2) | NULL | |
| total_spend | BIGINT | DEFAULT 0 | 누적 지출 (원) |

##### CLIENT_ONBOARDING

| 컬럼명 | 타입 | 제약 | 설명 |
|-------|------|------|------|
| onboarding_id | BIGINT | PK | |
| client_profile_id | BIGINT | FK→CLIENT_PROFILE, UK | |
| step_completed | INT | DEFAULT 0 | 완료된 온보딩 단계 수 |
| completed_at | DATETIME | NULL | |

##### CLIENT_PREFERRED_SKILL

| 컬럼명 | 타입 | 제약 | 설명 |
|-------|------|------|------|
| client_preferred_skill_id | BIGINT | PK | |
| client_profile_id | BIGINT | FK→CLIENT_PROFILE | |
| tech_name | VARCHAR(100) | NOT NULL | 선호 기술 스택 (`TypeScript`, `Flutter`, `Docker` 등) |

##### CLIENT_PREFERRED_LEVEL

| 컬럼명 | 타입 | 제약 | 설명 |
|-------|------|------|------|
| client_preferred_level_id | BIGINT | PK | |
| client_profile_id | BIGINT | FK→CLIENT_PROFILE | |
| level | ENUM | NOT NULL | `JUNIOR` \| `MID` \| `SENIOR` |

##### CLIENT_MENU_TOGGLE

| 컬럼명 | 타입 | 제약 | 설명 |
|-------|------|------|------|
| client_menu_toggle_id | BIGINT | PK | |
| client_profile_id | BIGINT | FK→CLIENT_PROFILE, UK | |
| show_intro | BOOLEAN | DEFAULT TRUE | 소개 섹션 노출 |
| show_skills | BOOLEAN | DEFAULT TRUE | 기술 섹션 노출 |
| show_career | BOOLEAN | DEFAULT TRUE | 경력 섹션 노출 |
| show_education | BOOLEAN | DEFAULT TRUE | 학력 섹션 노출 |
| show_certificates | BOOLEAN | DEFAULT FALSE | 자격증 섹션 노출 |
| show_awards | BOOLEAN | DEFAULT FALSE | 수상 섹션 노출 |
| show_portfolio | BOOLEAN | DEFAULT TRUE | 포트폴리오 섹션 노출 |
| show_client_reviews | BOOLEAN | DEFAULT TRUE | 리뷰 섹션 노출 |
| show_active_projects | BOOLEAN | DEFAULT TRUE | 진행 프로젝트 섹션 노출 |

##### CLIENT_SKILL

| 컬럼명 | 타입 | 제약 | 설명 |
|-------|------|------|------|
| client_skill_id | BIGINT | PK | |
| client_profile_id | BIGINT | FK→CLIENT_PROFILE | |
| tech_name | VARCHAR(100) | NOT NULL | 보유 기술 |
| proficiency | ENUM | NULL | `EXPERT` \| `ADVANCED` \| `INTERMEDIATE` \| `BEGINNER` |
| experience | ENUM | NULL | `LESS_THAN_1Y` \| `1_TO_3Y` \| `3_TO_5Y` \| `5Y_PLUS` |

##### CLIENT_CAREER

| 컬럼명 | 타입 | 제약 | 설명 |
|-------|------|------|------|
| client_career_id | BIGINT | PK | |
| client_profile_id | BIGINT | FK→CLIENT_PROFILE | |
| company_name | VARCHAR(200) | NOT NULL | |
| job_title | VARCHAR(100) | NULL | |
| start_date | DATE | NULL | |
| end_date | DATE | NULL | 현재 재직이면 NULL |
| is_current | BOOLEAN | DEFAULT FALSE | |
| employment_type | ENUM | NULL | `FULL_TIME` \| `CONTRACT` \| `INTERN` \| `FREELANCE` |
| role | VARCHAR(300) | NULL | |
| level | VARCHAR(50) | NULL | 직급/레벨 |
| description | TEXT | NULL | |

##### CLIENT_EDUCATION

| 컬럼명 | 타입 | 제약 | 설명 |
|-------|------|------|------|
| client_education_id | BIGINT | PK | |
| client_profile_id | BIGINT | FK→CLIENT_PROFILE | |
| school_type | ENUM | NULL | `UNIVERSITY_4Y` \| `COLLEGE_2Y` \| `HIGH_SCHOOL` \| `GRAD_SCHOOL` \| `ETC` |
| school_name | VARCHAR(200) | NULL | |
| major | VARCHAR(100) | NULL | |
| degree | ENUM | NULL | `ASSOCIATE` \| `BACHELOR` \| `MASTER` \| `DOCTOR` |
| graduation_date | DATE | NULL | |
| is_enrolled | BOOLEAN | DEFAULT FALSE | |

##### CLIENT_CERTIFICATION

| 컬럼명 | 타입 | 제약 | 설명 |
|-------|------|------|------|
| client_certification_id | BIGINT | PK | |
| client_profile_id | BIGINT | FK→CLIENT_PROFILE | |
| cert_name | VARCHAR(200) | NOT NULL | |
| issuer | VARCHAR(200) | NULL | |
| acquired_date | DATE | NULL | |

##### CLIENT_AWARD

| 컬럼명 | 타입 | 제약 | 설명 |
|-------|------|------|------|
| client_award_id | BIGINT | PK | |
| client_profile_id | BIGINT | FK→CLIENT_PROFILE | |
| award_name | VARCHAR(200) | NOT NULL | |
| awarding_org | VARCHAR(200) | NULL | |
| award_date | DATE | NULL | |
| description | TEXT | NULL | |

---

#### 📦 Tab 4 — 프로젝트

##### PROJECT

| 컬럼명 | 타입 | 제약 | 설명 |
|-------|------|------|------|
| project_id | BIGINT | PK | |
| client_profile_id | BIGINT | FK→CLIENT_PROFILE | |
| title | VARCHAR(300) | NOT NULL | |
| `⚠️ category` | ENUM | NOT NULL | **타입 불일치** — ERD는 단일 ENUM, 프론트는 배열 (여러 개 선택 가능) |
| description | TEXT | NULL | |
| work_scopes | JSON | NULL | `기획` / `디자인` / `퍼블리싱` / `개발` 배열 |
| `⚠️ preparation_status` | ENUM | NULL | **타입 불일치** — ERD는 단일 ENUM, 프론트는 배열 (`idea`/`doc`/`design`/`code`) |
| reference_file_url | VARCHAR(1000) | NULL | S3 URL |
| visibility | ENUM | NOT NULL | `PUBLIC` \| `PARTNER_ONLY` \| `PRIVATE` |
| budget_min | INT | NULL | (원) |
| budget_max | INT | NULL | (원) |
| budget_negotiable | BOOLEAN | DEFAULT FALSE | |
| expected_start_date | DATE | NULL | |
| expected_duration_days | INT | NULL | 예상 기간 (일) |
| deposit_pct | TINYINT | NULL | 선금 비율 (%) |
| interim_pct | TINYINT | NULL | 중도금 비율 (%) |
| balance_pct | TINYINT | NULL | 잔금 비율 (%) |
| pre_meeting_type | ENUM | NULL | `ONLINE` \| `OFFLINE` |
| meeting_frequency | VARCHAR(100) | NULL | |
| client_location | VARCHAR(200) | NULL | |
| recruitment_deadline | DATE | NULL | |
| government_support | BOOLEAN | DEFAULT FALSE | |
| it_experience | BOOLEAN | DEFAULT FALSE | |
| revision_free_count | INT | NULL | 무상 수정 횟수 |
| revision_free_scope | TEXT | NULL | |
| revision_paid_criteria | TEXT | NULL | |
| status | ENUM | NOT NULL DEFAULT `DRAFT` | `DRAFT` \| `OPEN` \| `IN_PROGRESS` \| `COMPLETED` \| `CANCELLED` |
| created_at | DATETIME | NOT NULL | |

##### PROJECT_TECH

| 컬럼명 | 타입 | 제약 | 설명 |
|-------|------|------|------|
| project_tech_id | BIGINT | PK | |
| project_id | BIGINT | FK→PROJECT | |
| tech_name | VARCHAR(100) | NOT NULL | 기술 스택 태그 |

##### PROJECT_DOMAIN

| 컬럼명 | 타입 | 제약 | 설명 |
|-------|------|------|------|
| project_domain_id | BIGINT | PK | |
| project_id | BIGINT | FK→PROJECT | |
| domain_name | VARCHAR(100) | NOT NULL | 산업 도메인 분류 |

---

#### 📦 Tab 5 — 계약 & 결제

##### CONTRACT_NEGOTIATION

| 컬럼명 | 타입 | 제약 | 설명 |
|-------|------|------|------|
| negotiation_id | BIGINT | PK | |
| `⚠️ project_application_id` | BIGINT | FK, NOT NULL | **ERD에 정의 없음** → PROJECT_APPLICATION 테이블 필요 |
| project_id | BIGINT | FK→PROJECT | |
| partner_user_id | BIGINT | FK→USERS | |
| client_user_id | BIGINT | FK→USERS | |
| status | ENUM | NOT NULL | `IN_PROGRESS` \| `AGREED` \| `CANCELLED` |
| created_at | DATETIME | NOT NULL | |
| updated_at | DATETIME | NOT NULL | |

##### CONTRACT_ITEM

| 컬럼명 | 타입 | 제약 | 설명 |
|-------|------|------|------|
| item_id | BIGINT | PK | |
| negotiation_id | BIGINT | FK→CONTRACT_NEGOTIATION | |
| item_type | ENUM | NOT NULL | `SCOPE` \| `DELIVERABLES` \| `SCHEDULE` \| `PAYMENT` \| `REVISION` \| `COMPLETION` \| `TERMS` |
| title | VARCHAR(200) | NOT NULL | |
| content | TEXT | NULL | JSON 또는 텍스트 |
| partner_confirmed | BOOLEAN | DEFAULT FALSE | |
| client_confirmed | BOOLEAN | DEFAULT FALSE | |
| updated_at | DATETIME | NOT NULL | |

##### CONTRACT

| 컬럼명 | 타입 | 제약 | 설명 |
|-------|------|------|------|
| contract_id | BIGINT | PK | |
| negotiation_id | BIGINT | FK→CONTRACT_NEGOTIATION, UK | |
| project_id | BIGINT | FK→PROJECT | |
| partner_user_id | BIGINT | FK→USERS | |
| client_user_id | BIGINT | FK→USERS | |
| total_amount | BIGINT | NOT NULL | 총 계약액 (원) |
| deposit_amount | BIGINT | NULL | 선금 (원) |
| interim_amount | BIGINT | NULL | 중도금 (원) |
| balance_amount | BIGINT | NULL | 잔금 (원) |
| start_date | DATE | NULL | |
| end_date | DATE | NULL | |
| status | ENUM | NOT NULL | `ACTIVE` \| `COMPLETED` \| `TERMINATED` |
| signed_at | DATETIME | NULL | |
| created_at | DATETIME | NOT NULL | |

##### MILESTONE

| 컬럼명 | 타입 | 제약 | 설명 |
|-------|------|------|------|
| milestone_id | BIGINT | PK | |
| contract_id | BIGINT | FK→CONTRACT | |
| order_index | INT | NOT NULL | 순서 (1, 2, 3…) |
| title | VARCHAR(200) | NOT NULL | |
| start_date | DATE | NULL | |
| end_date | DATE | NULL | |
| amount | BIGINT | NULL | 마일스톤 금액 (원) |
| status | ENUM | NOT NULL | `PENDING` \| `IN_PROGRESS` \| `REWORK` \| `COMPLETED` |
| payment_status | ENUM | NOT NULL | `UNPAID` \| `HELD` \| `REVIEWING` \| `SETTLED` |
| submitted_at | DATETIME | NULL | 납품 제출 일시 |
| approved_at | DATETIME | NULL | 클라이언트 승인 일시 |

---

#### 📦 Tab 6 — 포트폴리오 & 수입

##### PORTFOLIO

| 컬럼명 | 타입 | 제약 | 설명 |
|-------|------|------|------|
| portfolio_id | BIGINT | PK | |
| partner_profile_id | BIGINT | FK→PARTNER_PROFILE | |
| title | VARCHAR(300) | NOT NULL | |
| period_start | DATE | NULL | |
| period_end | DATE | NULL | |
| my_role | VARCHAR(200) | NULL | 역할 |
| thumbnail_url | VARCHAR(1000) | NULL | S3 URL |
| project_description | TEXT | NULL | 프로젝트 설명 (최대 5000자) |
| project_vision | TEXT | NULL | |
| tech_challenge | TEXT | NULL | 기술 챌린지 |
| tech_solution | TEXT | NULL | 해결 방법 |
| github_url | VARCHAR(500) | NULL | |
| external_url | VARCHAR(500) | NULL | 배포 URL |
| is_visible | BOOLEAN | DEFAULT TRUE | |
| created_at | DATETIME | NOT NULL | |

##### PORTFOLIO_TECH

| 컬럼명 | 타입 | 제약 | 설명 |
|-------|------|------|------|
| portfolio_tech_id | BIGINT | PK | |
| portfolio_id | BIGINT | FK→PORTFOLIO | |
| tech_name | VARCHAR(100) | NOT NULL | |

##### PORTFOLIO_CORE_FEATURE

| 컬럼명 | 타입 | 제약 | 설명 |
|-------|------|------|------|
| feature_id | BIGINT | PK | |
| portfolio_id | BIGINT | FK→PORTFOLIO | |
| order_index | INT | NOT NULL | 표시 순서 |
| feature_title | VARCHAR(200) | NOT NULL | 핵심 기능 제목 |
| feature_description | TEXT | NULL | |

##### WISHLIST_PROJECT

| 컬럼명 | 타입 | 제약 | 설명 |
|-------|------|------|------|
| wishlist_id | BIGINT | PK | |
| partner_profile_id | BIGINT | FK→PARTNER_PROFILE | |
| project_id | BIGINT | FK→PROJECT | |
| created_at | DATETIME | NOT NULL | |

##### WISHLIST_PARTNER

| 컬럼명 | 타입 | 제약 | 설명 |
|-------|------|------|------|
| wishlist_id | BIGINT | PK | |
| client_profile_id | BIGINT | FK→CLIENT_PROFILE | |
| partner_profile_id | BIGINT | FK→PARTNER_PROFILE | |
| created_at | DATETIME | NOT NULL | |

##### INCOME_RECORD

| 컬럼명 | 타입 | 제약 | 설명 |
|-------|------|------|------|
| income_id | BIGINT | PK | |
| partner_profile_id | BIGINT | FK→PARTNER_PROFILE | |
| contract_id | BIGINT | FK→CONTRACT | |
| amount | BIGINT | NOT NULL | 정산 금액 (원) |
| income_date | DATE | NOT NULL | |
| memo | TEXT | NULL | |

---

#### ⚠️ ERD 누락 테이블 (프론트엔드 구현 기준 — 백엔드 추가 필요)

> 아래 테이블들은 Excel ERD에 **정의되어 있지 않으나** 프론트엔드에 이미 완전하게 구현된 기능들입니다.  
> 백엔드 개발 시 **반드시 추가**해야 합니다.

##### ⚠️ CAREER (`PartnerProfile.jsx` 경력 탭)

| 컬럼명 | 타입 | 제약 | 설명 |
|-------|------|------|------|
| career_id | BIGINT | PK | |
| partner_profile_id | BIGINT | FK→PARTNER_PROFILE, NOT NULL | |
| company | VARCHAR(200) | NOT NULL | 회사명 |
| main_tech | VARCHAR(200) | NOT NULL | 대표 기술 |
| start_date | DATE | NOT NULL | 입사 월 |
| end_date | DATE | NULL | 퇴사 월 (is_current=TRUE면 NULL) |
| is_current | BOOLEAN | DEFAULT FALSE | 재직 중 여부 |
| career_type | ENUM | NOT NULL | `FULL_TIME` \| `CONTRACT` \| `FREELANCE` \| `INTERN` |
| role | ENUM | NOT NULL | `PLANNING` \| `DESIGN` \| `DEV` \| `OPS_PM` |
| level | ENUM | NOT NULL | `JUNIOR` \| `MID` \| `SENIOR_MID` \| `SENIOR` |
| description | TEXT | NULL | |

##### ⚠️ CAREER_PROJECT (`PartnerProfile.jsx` 경력 내 세부 프로젝트)

| 컬럼명 | 타입 | 제약 | 설명 |
|-------|------|------|------|
| career_project_id | BIGINT | PK | |
| career_id | BIGINT | FK→CAREER, NOT NULL | |
| name | VARCHAR(200) | NOT NULL | 프로젝트명 |
| start_date | DATE | NULL | |
| end_date | DATE | NULL | |
| description | TEXT | NULL | |

##### ⚠️ EDUCATION (`Mypage.jsx` + `PartnerProfile.jsx` 학력 탭)

| 컬럼명 | 타입 | 제약 | 설명 |
|-------|------|------|------|
| education_id | BIGINT | PK | |
| partner_profile_id | BIGINT | FK→PARTNER_PROFILE, NOT NULL | |
| school_type | ENUM | NOT NULL | `HIGH_SCHOOL` \| `BACHELOR` \| `MASTER` \| `DOCTOR` |
| school_name | VARCHAR(200) | NOT NULL | |
| track | VARCHAR(100) | NULL | 고등학교 계열/전공 |
| major | VARCHAR(100) | NULL | 대학교/대학원 전공 |
| degree_type | ENUM | NULL | `BACHELOR` \| `ASSOCIATE` \| `MASTER` \| `DOCTOR` \| `HON_DOCTOR` |
| status | ENUM | NOT NULL | `GRADUATED` \| `ENROLLED` \| `DROPPED` |
| admission_date | DATE | NULL | 입학 연월 |
| graduation_date | DATE | NULL | 졸업 연월 |
| gpa | DECIMAL(4,2) | NULL | 학점 |
| gpa_scale | ENUM | NULL | `4.5` \| `4.3` \| `4.0` \| `100` |
| research_topic | TEXT | NULL | 논문 제목 (대학원 전용) |

##### ⚠️ CERTIFICATION (`PartnerProfile.jsx` 자격증 탭)

| 컬럼명 | 타입 | 제약 | 설명 |
|-------|------|------|------|
| certification_id | BIGINT | PK | |
| partner_profile_id | BIGINT | FK→PARTNER_PROFILE, NOT NULL | |
| name | VARCHAR(200) | NOT NULL | 자격증명 |
| issuing_org | VARCHAR(200) | NOT NULL | 발급 기관 |
| acquired_date | DATE | NOT NULL | 취득일 |

##### ⚠️ AWARD (`PartnerProfile.jsx` 수상이력 탭)

| 컬럼명 | 타입 | 제약 | 설명 |
|-------|------|------|------|
| award_id | BIGINT | PK | |
| partner_profile_id | BIGINT | FK→PARTNER_PROFILE, NOT NULL | |
| name | VARCHAR(200) | NOT NULL | 상훈명 |
| org | VARCHAR(200) | NOT NULL | 수여기관 |
| award_date | DATE | NOT NULL | 수상일 |
| description | TEXT | NULL | 수상 내역 및 역할 (최대 500자) |

##### ⚠️ PROJECT_APPLICATION (지원 이력 / `CONTRACT_NEGOTIATION.project_application_id` FK 참조)

| 컬럼명 | 타입 | 제약 | 설명 |
|-------|------|------|------|
| application_id | BIGINT | PK | |
| project_id | BIGINT | FK→PROJECT, NOT NULL | |
| partner_user_id | BIGINT | FK→USERS, NOT NULL | 지원 파트너 |
| status | ENUM | NOT NULL | `PENDING` \| `ACCEPTED` \| `REJECTED` |
| cover_letter | TEXT | NULL | 지원서 내용 |
| applied_at | DATETIME | NOT NULL | |

> `CONTRACT_NEGOTIATION.project_application_id`가 이 테이블을 FK로 참조함.

##### ⚠️ PARTNER_REVIEW (`PartnerProfile.jsx` 클라이언트 평가 탭)

| 컬럼명 | 타입 | 제약 | 설명 |
|-------|------|------|------|
| review_id | BIGINT | PK | |
| project_id | BIGINT | FK→PROJECT, NOT NULL | |
| partner_user_id | BIGINT | FK→USERS, NOT NULL | |
| client_user_id | BIGINT | FK→USERS, NOT NULL | |
| rating | DECIMAL(3,2) | NOT NULL | 종합 평점 (0~5) |
| expertise_score | DECIMAL(3,2) | NULL | 전문성 |
| schedule_score | DECIMAL(3,2) | NULL | 일정 준수 |
| communication_score | DECIMAL(3,2) | NULL | 소통 능력 |
| proactivity_score | DECIMAL(3,2) | NULL | 적극성 |
| title | VARCHAR(200) | NULL | 리뷰 제목 |
| review_text | TEXT | NULL | 후기 내용 |
| budget | VARCHAR(100) | NULL | 계약 금액 표시 |
| duration | VARCHAR(100) | NULL | 진행 기간 표시 |
| tags | JSON | NULL | 태그 배열 |
| completed_at | DATE | NULL | 완료 날짜 |

---

#### 갭 분석 요약

| 구분 | 대상 | 비고 |
|------|------|------|
| 🟢 일치 | USERS, OAUTH_ACCOUNT, BANK_ACCOUNT, BANK_VERIFICATION, PARTNER_PROFILE, PARTNER_INTRODUCTION, PARTNER_SKILL, SKILL_MASTER, CLIENT_PROFILE, CLIENT_PROFILE_STATS, PROJECT, PROJECT_TECH, PROJECT_DOMAIN, CONTRACT_NEGOTIATION, CONTRACT_ITEM, CONTRACT, MILESTONE, PORTFOLIO, PORTFOLIO_TECH, PORTFOLIO_CORE_FEATURE, WISHLIST_PROJECT, WISHLIST_PARTNER, INCOME_RECORD | 백엔드 그대로 구현 |
| 🔴 ERD 누락 (추가 필요) | CAREER, CAREER_PROJECT, EDUCATION, CERTIFICATION, AWARD, PROJECT_APPLICATION, PARTNER_REVIEW | 전부 프론트엔드에 구현됨 |
| 🟡 컬럼 누락 | `USERS.profile_image_url` | `Mypage.jsx` heroImage 연동 필요 |
| 🟡 타입 불일치 | `PROJECT.category`, `PROJECT.preparation_status` | ERD=단일 ENUM, 프론트=배열 → JSON 타입 또는 별도 조인 테이블로 변경 권장 |

---

## 7. 상태 관리 (Zustand Store)

`src/store/useStore.js` — `persist` 미들웨어로 localStorage에 영속 저장

| 상태 키 | 타입 | 설명 |
|---------|------|------|
| `user` | `object \| null` | 가입 유저 정보 `{ id, pw, ... }` |
| `loginUser` | `string \| null` | 현재 로그인 사용자 식별자 |
| `loginType` | `'local' \| 'google' \| 'kakao' \| 'naver' \| null` | 로그인 수단 |
| `userRole` | `'client' \| 'partner' \| null` | 역할 |
| `googleAccessToken` | `string \| null` | Google OAuth 토큰 |
| `kakaoAuthCode` | `string \| null` | Kakao 인가 코드 |
| `partnerProfile` | `object \| null` | 파트너 등록 정보 |
| `partnerSubTitle` | `string` | 파트너 배너 부제목 |
| `partnerDropdowns` | `{ category, type, location, workStyle }` | 파트너 배너 메타 |
| `clientBannerBg` | `string \| null` | 클라이언트 배너 배경 (base64) |
| `userId` | `string \| null` | 회원가입 시 입력한 고정 핸들 (변경 불가) |
| `projectApplications` | `ProjectApplication[]` | 파트너가 지원한 프로젝트 목록 |
| `partnerBannerBg` | `string \| null` | 파트너 배너 배경 (base64) |

**주요 액션**

```js
setLogin(loginUser, loginType)    // 로그인
clearLogin()                      // 로그아웃
setUserRole(role)                 // 역할 설정
setPartnerProfile(profile)        // 파트너 프로필 저장
clearAll()                        // 전체 초기화
```

---

## 8. 컴포넌트 명세

### Header (3종)

| 컴포넌트 | 사용 조건 | 네비게이션 항목 |
|---------|----------|--------------|
| `Header_home` | 비로그인 | 프로젝트 등록, 프로젝트 찾기, 파트너 찾기, 포트폴리오, 솔루션 마켓, 이용 가이드 센터 + 로그인 버튼 |
| `Header_client` | 클라이언트 로그인 | 동일 + 대시보드, 마이페이지, 로그아웃 |
| `Header_partner` | 파트너 로그인 | 동일 + 대시보드, 마이페이지, 로그아웃 |

### ContractModals

- `ContractModalLauncher` — 7개 버튼 그리드, 각 버튼 클릭 시 해당 모달 오픈
- 각 모달 공통 구조: 고정 헤더 + 스크롤 바디 + 고정 푸터(저장/닫기)
- 수정 모드 진입 시 인라인 폼 렌더, 작업자·의뢰자 각각 확인 배지 표시

### ChatBot (전역)

- 우하단 플로팅 토글 버튼
- 개폐 가능한 채팅 패널
- 랜딩 페이지(`/`)에서는 미표시

---

## 9. 개발 환경 셋업

```bash
# 의존성 설치
npm install

# 개발 서버 시작 (기본 http://localhost:5173)
npm run dev

# 프로덕션 빌드
npm run build

# 빌드 결과물 미리보기
npm run preview
```

### 환경 변수 (필요 시 `.env` 생성)

```env
VITE_GOOGLE_CLIENT_ID=your_google_oauth_client_id
VITE_KAKAO_CLIENT_ID=your_kakao_rest_api_key
VITE_GOOGLE_MAPS_API_KEY=your_google_maps_api_key
```

---

## 디자인 시스템

### 버튼 색상 규칙

| 유형 | 배경 | 글자 |
|------|------|------|
| **Primary** (최고 강조) | `linear-gradient(135deg, #60a5fa, #3b82f6, #6366f1)` | white, bold |
| **Secondary** (상세보기) | `#DBEAFE` | `#1e3a5f` |
| **Default** | `#ffffff` + border `#E5E7EB` | `#374151` |
| Default hover | `#FEF9C3` | `#713f12` |

### 파트너 등급 배지

| 등급 | 배경 | 글자 |
|------|------|------|
| 💎 다이아몬드 | `#DBEAFE` | `#1E3A8A` |
| 🌙 플래티넘 | `#EDE9FE` | `#4C1D95` |
| 🟡 골드 | `#FEF3C7` | `#78350F` |
| ⚫ 실버 | `#F1F5F9` | `#374151` |

---

**Made with ❤️ by DevBridge Team**
