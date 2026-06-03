/**
 * 찜하기 API (프로젝트/파트너).
 * - 백엔드: InterestController (/api/interests/**)
 * - 모든 엔드포인트 JWT 필수.
 */
import api from './axios';

export const interestsApi = {
  // ===== 프로젝트 =====
  myProjects: () => api.get('/interests/projects').then((r) => r.data.projectIds || []),
  addProject: (projectId) => api.post(`/interests/projects/${projectId}`).then((r) => r.data),
  removeProject: (projectId) => api.delete(`/interests/projects/${projectId}`).then((r) => r.data),

  // ===== 파트너 =====
  myPartners: () => api.get('/interests/partners').then((r) => r.data.partnerIds || []),
  addPartner: (partnerId) => api.post(`/interests/partners/${partnerId}`).then((r) => r.data),
  removePartner: (partnerId) => api.delete(`/interests/partners/${partnerId}`).then((r) => r.data),
};

