/**
 * 인증 관련 API.
 * - 백엔드: AuthController (/api/auth/**)
 */
import api from './axios';

export const authApi = {
  /**
   * 회원가입
   * @param {object} payload SignupRequest 형식
   * @returns {Promise<{email, username, userType, message}>}
   */
  signup: (payload) => api.post('/auth/signup', payload).then((r) => r.data),

  /**
   * 로그인
   * @param {{email: string, password: string}} payload
   */
  login: (payload) => api.post('/auth/login', payload).then((r) => r.data),

  /**
   * 소셜 로그인 (구글 등). OAuth 제공자에서 검증한 이메일을 BE 로 전달하여 JWT 발급.
   * 미가입 이메일은 400 응답 → 호출부에서 회원가입 안내.
   * @param {{email: string, provider?: string}} payload
   */
  socialLogin: (payload) => api.post('/auth/social-login', payload).then((r) => r.data),

  /**
   * 로그아웃: 백엔드가 HttpOnly 쿠키(DEVBRIDGE_TOKEN)를 즉시 만료시킴.
   * JS에서 직접 쿠키를 지울 수 없으므로 반드시 이 엔드포인트를 호출해야 함.
   * 네트워크 실패해도 클라이언트 측 정리는 진행해야 하므로 catch하여 swallow.
   */
  logout: () => api.post('/auth/logout').then((r) => r.data).catch(() => null),

  /**
   * GitHub OAuth 로그인. 인가 코드(code)를 백엔드로 전달하여 access_token 교환 + JWT 발급.
   * 미가입 이메일은 400 응답 → 호출부에서 회원가입 안내.
   * @param {{code: string, redirectUri: string}} payload
   */
  githubLogin: (payload) => api.post('/auth/github', payload).then((r) => r.data),
};

