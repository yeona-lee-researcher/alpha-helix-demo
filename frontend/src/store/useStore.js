import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { interestsApi } from '../api/interests.api';
import { profileApi } from '../api/profile.api';

// ─── 백엔드 프로필 자동 저장 디바운스 제거 (현업 관행: 명시적 저장만 사용) ─────────────────
// Zustand는 클라이언트 상태 관리 전용, 서버 상태는 명시적 API 호출로 처리

const useStore = create(
  persist(
    (set, get) => ({
      // 사용자 정보
      user: null,
      setUser: (user) => set({ user }),
      clearUser: () => set({ user: null, userRole: null }),

      // 로그인 상태
      loginUser: null,
      loginType: null, // 'local' | 'google' | 'kakao' | 'naver'
      username: null,  // display username (회원가입 시 입력한 핸들 — 표시/Stream Chat 용)
      dbId: null,      // DB PK (백엔드 API 용 — /api/chat/token?userId=, /api/chat/rooms?userId= 등)
      setLogin: (loginUser, loginType) => set({ loginUser, loginType }),
      setUsername: (name) => set({ username: name }),
      setDbId: (id) => set({ dbId: id == null ? null : Number(id) }),
      clearLogin: () => set({ loginUser: null, loginType: null, username: null, dbId: null }),

      // 회원 역할 ('client' | 'partner' | null)
      userRole: null,
      setUserRole: (role) => set({ userRole: role }),
      clearUserRole: () => set({ userRole: null }),

      // Google 토큰
      googleAccessToken: null,
      setGoogleAccessToken: (token) => set({ googleAccessToken: token }),
      clearGoogleAccessToken: () => set({ googleAccessToken: null }),

      // 카카오 인증 코드
      kakaoAuthCode: null,
      setKakaoAuthCode: (code) => set({ kakaoAuthCode: code }),
      clearKakaoAuthCode: () => set({ kakaoAuthCode: null }),

      // 회원 아이디(핸들)는 위의 `username` 필드 하나로 통일 (단일 진실 소스).
      // 주의: DB PK(숫자)는 user.dbId 에 저장합니다. username 과 혼동 금지.

      // 회원가입 폼 임시 저장 (이전 단계 복원용)
      signupFormData: null,
      setSignupFormData: (data) => set({ signupFormData: data }),
      clearSignupFormData: () => set({ signupFormData: null }),

      // AI 챗(행운이)이 추출한 프로젝트 등록 초안 — ProjectRegister 폴백 입력 소스
      aiProjectDraft: null,
      setAiProjectDraft: (draft) => set({ aiProjectDraft: draft }),
      clearAiProjectDraft: () => set({ aiProjectDraft: null }),

      // 파트너 회원가입 등록 정보
      partnerProfile: null,
      setPartnerProfile: (profile) => set({ partnerProfile: profile }),

      // 파트너 프로필 관리 상세 데이터 (프로필 관리 페이지에서 저장)
      partnerProfileDetail: {
        profileMenuToggles: {
          intro: true, skills: true, career: true, education: true,
          certificates: false, awards: false, portfolio: true,
          clientReviews: true, activeProjects: true,
        },
        bio: "",
        strengthDesc: "",
        githubUrl: "",
        skills: [],          // [{id, techName, customTech, proficiency, experience}]
        careers: [],         // [{id, companyName, jobTitle, startDate, endDate, isCurrent, employmentType, role, level, description, projects:[]}]
        educations: [],      // [{id, schoolType, schoolName, major, degree, graduationDate, isEnrolled}]
        certifications: [],  // [{id, certName, issuer, acquiredDate}]
        awards: [],          // [{id, awardName, awarding, awardDate, description}]
      },
      setPartnerProfileDetail: (detail) => {
        set({ partnerProfileDetail: detail });
        // 자동 저장 제거: 명시적 syncProfileDetailToServer 호출로 저장
      },
      updatePartnerProfileDetail: (patch) => {
        set((state) => ({
          partnerProfileDetail: { ...state.partnerProfileDetail, ...patch },
        }));
        // 자동 저장 제거: 명시적 syncProfileDetailToServer 호출로 저장
      },

      // 클라이언트 프로필 관리 상세 데이터
      clientProfileDetail: {
        profileMenuToggles: {
          intro: true, skills: true, career: true, education: true,
          certificates: false, awards: false, portfolio: true,
          clientReviews: true, activeProjects: true,
        },
        bio: "",
        strengthDesc: "",
        githubUrl: "",
        skills: [],
        careers: [],
        educations: [],
        certifications: [],
        awards: [],
      },
      setClientProfileDetail: (detail) => {
        set({ clientProfileDetail: detail });
        // 자동 저장 제거: 명시적 syncProfileDetailToServer 호출로 저장
      },
      updateClientProfileDetail: (patch) => {
        set((state) => ({
          clientProfileDetail: { ...state.clientProfileDetail, ...patch },
        }));
        // 자동 저장 제거: 명시적 syncProfileDetailToServer 호출로 저장
      },

      // 프로필 갱신 트리거 ─ 저장 시 bump되어 BannerCard 등 구독 컴포넌트가 재조회
      profileRefreshTrigger: 0,
      bumpProfileRefresh: () => set((state) => ({ profileRefreshTrigger: state.profileRefreshTrigger + 1 })),

      // 프로필 세부 정보 백엔드 동기화 ─ "전체 설정 저장하기" 버튼에서 호출
      // role: 'partner' | 'client' (생략 시 userRole 사용)
      syncProfileDetailToServer: async (role) => {
        // 로그인 여부는 비민감 식별자 dbId 로 판단 (JWT 는 HttpOnly 쿠키라 JS 접근 불가).
        // 실제 인증은 axios withCredentials + 쿠키로 자동 처리, 401 시 응답에서 catch.
        const dbId = typeof window !== 'undefined' ? localStorage.getItem('dbId') : null;
        if (!dbId) return { ok: false, reason: 'unauthenticated' };

        const state = get();
        const r = role || state.userRole;
        const detail = r === 'client' ? state.clientProfileDetail : state.partnerProfileDetail;
        if (!detail) return { ok: false, reason: 'no-detail' };

        // 스토어 스키마 → 백엔드 UserProfileDetailRequest 매핑
        const payload = {
          bio: detail.bio || '',
          strengthDesc: detail.strengthDesc || '',
          shortBio: detail.shortBio || '',
          industry: detail.industry || '',
          githubUrl: detail.githubUrl || '',
          githubHandle: detail.githubHandle || '',
          githubRepoUrl: detail.githubRepoUrl || '',
          profileMenuToggles: detail.profileMenuToggles || {},
          verifiedEmail: detail.verifiedEmail
            ? {
                type: detail.verifiedEmail.type || detail.verifiedEmailType || null,
                email: detail.verifiedEmail.email || detail.verifiedEmail || null,
              }
            : null,
          skills: (detail.skills || []).map((s) => ({
            techName: s.techName || '',
            customTech: s.customTech || '',
            proficiency: s.proficiency || '',
            experience: s.experience || '',
            mode: s.mode || 'saved',
          })),
          careers: (detail.careers || []).map((c) => ({
            companyName: c.companyName || c.company || '',
            mainTech: c.mainTech || '',
            jobTitle: c.jobTitle || '',
            startDate: c.startDate || '',
            endDate: c.endDate || '',
            isCurrent: !!c.isCurrent,
            employmentType: c.employmentType || '',
            role: c.role || '',
            level: c.level || '',
            description: c.description || '',
            projects: Array.isArray(c.projects) ? c.projects : [],
            verifiedCompany: !!c.verifiedCompany,
            verifiedEmail: c.verifiedEmail || '',
          })),
          educations: (detail.educations || []).map((e) => ({
            schoolType: e.schoolType || '',
            schoolName: e.schoolName || '',
            track: e.track || '',
            major: e.major || '',
            degreeType: e.degreeType || e.degree || '',
            status: e.status || (e.isEnrolled ? '재학' : '졸업'),
            admissionDate: e.admissionDate || '',
            graduationDate: e.graduationDate || '',
            gpa: e.gpa || '',
            gpaScale: e.gpaScale || '',
            researchTopic: e.researchTopic || '',
            verifiedSchool: !!e.verifiedSchool,
            verifiedEmail: e.verifiedEmail || '',
          })),
          awards: (detail.awards || []).map((a) => ({
            awardName: a.awardName || '',
            awarding: a.awarding || '',
            awardDate: a.awardDate || '',
            description: a.description || '',
          })),
          certifications: (detail.certifications || []).map((c) => ({
            certName: c.certName || '',
            issuer: c.issuer || '',
            acquiredDate: c.acquiredDate || '',
          })),
        };

        try {
          const res = await profileApi.saveMyDetail(payload);
          // 저장 성공 시 갱신 트리거 bump → BannerCard 등 자동 재조회
          set((state) => ({ profileRefreshTrigger: state.profileRefreshTrigger + 1 }));
          return { ok: true, data: res };
        } catch (e) {
          console.warn('[profile] sync 실패:', e?.response?.status || e?.message);
          return { ok: false, reason: 'network', error: e };
        }
      },

      /**
       * 서버 → 스토어 초기 로드 (로그인 직후 1회 호출).
       * 백엔드 응답을 스토어 스키마(partnerProfileDetail / clientProfileDetail)로 채움.
       * 디바운스 sync 트리거를 피하기 위해 set 으로 직접 주입.
       */
      loadProfileDetailFromServer: async (role) => {
        // dbId 기반 로그인 체크 (JWT 는 쿠키, JS 접근 불가)
        const dbId = typeof window !== 'undefined' ? localStorage.getItem('dbId') : null;
        if (!dbId) return { ok: false, reason: 'unauthenticated' };

        const state = get();
        const r = role || state.userRole;
        try {
          const data = await profileApi.getMyDetail();
          if (!data) return { ok: false, reason: 'empty' };

          const base = r === 'client' ? state.clientProfileDetail : state.partnerProfileDetail;
          const merged = {
            ...base,
            bio: data.bio ?? base.bio ?? '',
            strengthDesc: data.strengthDesc ?? base.strengthDesc ?? '',
            shortBio: data.shortBio ?? base.shortBio ?? '',
            sloganSub: data.sloganSub ?? base.sloganSub ?? '',
            heroImage: data.profileImageUrl ?? base.heroImage ?? '',
            githubUrl: data.githubUrl ?? base.githubUrl ?? '',
            githubHandle: data.githubHandle ?? base.githubHandle ?? '',
            githubRepoUrl: data.githubRepoUrl ?? base.githubRepoUrl ?? '',
            profileMenuToggles: data.profileMenuToggles || base.profileMenuToggles || {},
            verifiedEmail: data.verifiedEmail || base.verifiedEmail || null,
            skills: Array.isArray(data.skills) ? data.skills : (base.skills || []),
            careers: Array.isArray(data.careers) ? data.careers : (base.careers || []),
            educations: Array.isArray(data.educations) ? data.educations : (base.educations || []),
            certifications: Array.isArray(data.certifications) ? data.certifications : (base.certifications || []),
            awards: Array.isArray(data.awards) ? data.awards : (base.awards || []),
          };
          if (r === 'client') set({ clientProfileDetail: merged });
          else set({ partnerProfileDetail: merged });
          return { ok: true, data: merged };
        } catch (e) {
          console.warn('[profile] load 실패:', e?.response?.status || e?.message);
          return { ok: false, reason: 'network', error: e };
        }
      },

      // 파트너 배너 공유 상태 (Portfolio ↔ PartnerProfile 동기화)
      partnerSubTitle: "풀스택 개발과 AI/ML 기술에 실력이 있는 편이죠 🥳",
      setPartnerSubTitle: (val) => set({ partnerSubTitle: val }),
      partnerDropdowns: { category: "개발", type: "주니어", location: "서울", workStyle: "상주선호" },
      setPartnerDropdown: (key, val) => set((state) => ({
        partnerDropdowns: { ...state.partnerDropdowns, [key]: val }
      })),

      // 배너 배경 이미지 (로컬 파일 → base64 persist)
      clientBannerBg: null,
      setClientBannerBg: (val) => set({ clientBannerBg: val }),
      partnerBannerBg: null,
      setPartnerBannerBg: (val) => set({ partnerBannerBg: val }),

      // 프로젝트 지원 내역 (파트너 → 클라이언트 프로젝트)
      projectApplications: [],
      addProjectApplication: (application) => set((state) => ({
        projectApplications: [...state.projectApplications, application],
      })),

      // ===== 찜(관심) 상태 =====
      interestedProjectIds: [],   // 숫자 배열 (Set 대신 직렬화 가능한 배열로 유지)
      interestedPartnerIds: [],


      // 프로젝트 찜 토글
      // - UI 상태는 즉시 반영 + localStorage persist로 새로고침해도 유지
      // - 서버 호출 실패해도 롤백하지 않음 (사용자 의도 존중)
      // - 다음 loadInterests 호출 때 서버 기준으로 재동기화
      toggleProjectInterest: async (projectId) => {
        const prev = get().interestedProjectIds;
        const isLiked = prev.includes(projectId);
        const next = isLiked ? prev.filter(id => id !== projectId) : [...prev, projectId];
        set({ interestedProjectIds: next });

        const dbId = typeof window !== 'undefined' ? localStorage.getItem('dbId') : null;
        if (!dbId) return;  // 비로그인 — 로컬 저장만

        try {
          if (isLiked) await interestsApi.removeProject(projectId);
          else await interestsApi.addProject(projectId);
        } catch (e) {
          console.warn('[interest] project toggle 서버 동기화 실패 (로컬 상태는 유지):', e?.response?.status || e?.message);
        }
      },

      // 파트너 찜 토글 (동일 패턴)
      togglePartnerInterest: async (partnerId) => {
        const prev = get().interestedPartnerIds;
        const isLiked = prev.includes(partnerId);
        const next = isLiked ? prev.filter(id => id !== partnerId) : [...prev, partnerId];
        set({ interestedPartnerIds: next });

        const dbId = typeof window !== 'undefined' ? localStorage.getItem('dbId') : null;
        if (!dbId) return;

        try {
          if (isLiked) await interestsApi.removePartner(partnerId);
          else await interestsApi.addPartner(partnerId);
        } catch (e) {
          console.warn('[interest] partner toggle 서버 동기화 실패 (로컬 상태는 유지):', e?.response?.status || e?.message);
        }
      },

      // 전체 초기화 (로그아웃 / 회원탈퇴 시 사용)
      clearAll: () => set({
        user: null,
        loginUser: null,
        loginType: null,
        username: null,
        dbId: null,
        googleAccessToken: null,
        kakaoAuthCode: null,
        userRole: null,
        signupFormData: null,
        partnerProfile: null,
        partnerSubTitle: "풀스택 개발과 AI/ML 기술에 실력이 있는 편이죠 🤩",
        partnerDropdowns: { category: "개발", type: "주니어", location: "서울", workStyle: "상주선호" },
        clientBannerBg: null,
        partnerBannerBg: null,
        projectApplications: [],
        interestedProjectIds: [],
        interestedPartnerIds: [],
        partnerProfileDetail: {
          profileMenuToggles: { intro:true, skills:true, career:true, education:true, certificates:false, awards:false, portfolio:true, clientReviews:true, activeProjects:true },
          bio:"", strengthDesc:"", skills:[], careers:[], educations:[], certifications:[], awards:[],
        },
        clientProfileDetail: {
          profileMenuToggles: { intro:true, skills:true, career:true, education:true, certificates:false, awards:false, portfolio:true, clientReviews:true, activeProjects:true },
          bio:"", strengthDesc:"", skills:[], careers:[], educations:[], certifications:[], awards:[],
        },
      }),

    }),
    {
      name: 'devbridge-storage',
      partialize: (state) => ({
        user: state.user,
        userRole: state.userRole,
        loginUser: state.loginUser,
        loginType: state.loginType,
        username: state.username,
        dbId: state.dbId,
        googleAccessToken: state.googleAccessToken,
        kakaoAuthCode: state.kakaoAuthCode,
        partnerProfile: state.partnerProfile,
        partnerSubTitle: state.partnerSubTitle,
        partnerDropdowns: state.partnerDropdowns,
        clientBannerBg: state.clientBannerBg,
        partnerBannerBg: state.partnerBannerBg,
        projectApplications: state.projectApplications,
        partnerProfileDetail: state.partnerProfileDetail,
        clientProfileDetail: state.clientProfileDetail,
        interestedProjectIds: state.interestedProjectIds,
        interestedPartnerIds: state.interestedPartnerIds,
        aiProjectDraft: state.aiProjectDraft,
      }),
    }
  )
);

export default useStore;
