/**
 * 프로필 세부 정보 API.
 * - 백엔드: ProfileController (/api/profile/**)
 * - PartnerProfile.jsx, Client_Profile.jsx 의 "전체 설정 저장하기" / AIchatProfile 결과 저장에서 사용.
 */
import api from './axios';

export const profileApi = {
  /** 내 프로필 세부 정보 조회 (UserProfileDetailResponse). */
  getMyDetail: () => api.get('/profile/me/detail').then((r) => r.data),

  /** 내 프로필 세부 정보 일괄 저장 (upsert). UserProfileDetailRequest 와 동일 스키마. */
  saveMyDetail: (payload) => api.put('/profile/me/detail', payload).then((r) => r.data),

  /** 마이페이지에서 사용자 기본 정보 업데이트 (phone, birthDate, region, serviceField/industry 등). */
  updateBasicInfo: (payload) => api.put('/profile/me/basic', payload).then((r) => r.data),

  /** 다른 사용자의 프로필 세부 정보 조회 (username 기준). PartnerProfileView/ClientProfileView 에서 사용. */
  getDetailByUsername: (username) =>
    api.get(`/profile/${encodeURIComponent(username)}/detail`).then((r) => r.data),
};
