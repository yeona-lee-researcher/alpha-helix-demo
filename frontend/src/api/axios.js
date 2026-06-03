/**
 * 글로벌 axios 인스턴스.
 * - baseURL: '/api' → dev에선 vite proxy(localhost:9091), 운영에선 같은 도메인.
 * - withCredentials: true → 백엔드가 set한 HttpOnly 쿠키를 자동 전송.
 *
 * 인증 흐름:
 *   Access Token (1h, DEVBRIDGE_TOKEN) 만료 → 401 수신
 *   → POST /api/auth/refresh (DEVBRIDGE_REFRESH 쿠키 자동 포함)
 *   → 성공: 새 Access Token 쿠키 발급 + 원본 요청 재시도
 *   → 실패: localStorage 정리 + /login 리다이렉트
 */
import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  timeout: 30000,
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
});

// --- Request 인터셉터: 레거시 호환 (구 세션의 localStorage 토큰만 헤더로 부착) ---
api.interceptors.request.use(
  (config) => {
    const legacy = localStorage.getItem('accessToken');
    if (legacy) {
      config.headers.Authorization = `Bearer ${legacy}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// refresh 중복 호출 방지
let isRefreshing = false;
let failedQueue = [];

function processQueue(error) {
  failedQueue.forEach(({ resolve, reject }) => {
    if (error) reject(error);
    else resolve();
  });
  failedQueue = [];
}

function clearAuthState() {
  localStorage.removeItem('accessToken');
  localStorage.removeItem('dbId');
  localStorage.removeItem('userId');
  localStorage.removeItem('userType');
  try {
    const raw = localStorage.getItem('devbridge-storage');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed?.state) {
        parsed.state.loginUser = null;
        parsed.state.loginType = null;
        parsed.state.userRole = null;
        localStorage.setItem('devbridge-storage', JSON.stringify(parsed));
      }
    }
  } catch { /* ignore */ }
}

function redirectToLogin() {
  if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/login')) {
    window.location.assign('/login');
  }
}

// refresh 요청 자체는 interceptor 재진입 방지
const SKIP_REFRESH_PATTERNS = [
  /\/auth\/refresh/,
  /\/auth\/login/,
  /\/auth\/signup/,
];

// 401 받아도 자동 refresh 시도 없이 조용히 실패할 URL
const SILENT_401_PATTERNS = [
  /\/bank\//,
  /\/interests(\/|\?|$)/,
  /\/applications(\/|\?|$)/,
  /\/applications\/me/,
  /\/projects\/me/,
  /\/projects\/\d+\/dashboard/,
  /\/projects\/\d+\/milestones/,
  /\/projects\/\d+\/escrows/,
  /\/projects\/\d+\/modules/,
  /\/projects\/\d+\/attachments/,
  /\/projects\/\d+\/meeting/,
  /\/chat\/token/,
  /\/profiles?\/me/,
  /\/auth\/me/,
];

// --- Response 인터셉터: 401 → refresh → retry ---
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const status  = error.response?.status;
    const reqUrl  = error.config?.url || '';
    const originalRequest = error.config;

    if (status !== 401) return Promise.reject(error);

    // refresh/login/signup 자체 401은 바로 실패
    if (SKIP_REFRESH_PATTERNS.some(re => re.test(reqUrl))) {
      return Promise.reject(error);
    }

    // 조용히 실패할 패턴
    if (SILENT_401_PATTERNS.some(re => re.test(reqUrl))) {
      return Promise.reject(error);
    }

    // 이미 retry 했던 요청(무한루프 방지)
    if (originalRequest._retry) {
      clearAuthState();
      redirectToLogin();
      return Promise.reject(error);
    }

    // 다른 요청이 refresh 중이면 완료 기다렸다가 재시도
    if (isRefreshing) {
      return new Promise((resolve, reject) => {
        failedQueue.push({ resolve, reject });
      }).then(() => {
        originalRequest._retry = true;
        return api(originalRequest);
      }).catch(err => Promise.reject(err));
    }

    originalRequest._retry = true;
    isRefreshing = true;

    try {
      await axios.post('/api/auth/refresh', {}, { withCredentials: true });
      processQueue(null);
      return api(originalRequest);
    } catch (refreshError) {
      processQueue(refreshError);
      clearAuthState();
      if (import.meta.env.DEV) {
        console.warn('[api] Refresh token 만료 — 로그인 페이지로 이동');
      }
      redirectToLogin();
      return Promise.reject(refreshError);
    } finally {
      isRefreshing = false;
    }
  }
);

export default api;
