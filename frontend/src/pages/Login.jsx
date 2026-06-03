import { useMemo, useRef, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useGoogleLogin } from "@react-oauth/google";
import { Mail, Lock, Eye, EyeOff } from "lucide-react";
import useStore from "../store/useStore";
import { authApi } from "../api";
import bannerVideo from "../assets/배너후보.mp4";
import { useLanguage } from "../i18n/LanguageContext";

const BASE_FONT = "'Inter', 'Pretendard', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";

function Login() {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const { setLogin, setUserRole, setUser, setUsername, setDbId } = useStore();

  const videoRef = useRef(null);
  useEffect(() => {
    if (videoRef.current) videoRef.current.playbackRate = 0.55;
  }, []);

  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [touched, setTouched] = useState({ email: false, pw: false });
  const [_agreedToTerms, _setAgreedToTerms] = useState(false);
  const [showSignupConfirm, setShowSignupConfirm] = useState(false);
  const [googleOAuthState] = useState(() => crypto.randomUUID());

  const emailError = useMemo(() => {
    if (!touched.email) return "";
    if (!email.trim()) return t("login.emailPlaceholder");
    return "";
  }, [email, touched.email]);

  const pwError = useMemo(() => {
    if (!touched.pw) return "";
    if (!pw.trim()) return t("login.pwPlaceholder");
    return "";
  }, [pw, touched.pw]);

  // 로그인 성공 후 redirect 처리 — 단일 '투자자' 뷰로 통합 (파트너/클라이언트 구분 폐기)
  const handleAfterLogin = (_role) => {
    const redirect = sessionStorage.getItem("loginRedirect");
    sessionStorage.removeItem("loginRedirect");
    if (redirect === "portfolio") {
      navigate("/client_portfolio", { replace: true });
    } else if (redirect === "project_register") {
      navigate("/project_register", { replace: true });
    } else {
      navigate("/home", { replace: true });
    }
  };

  const login = async () => {
    setTouched({ email: true, pw: true });
    if (!email.trim() || !pw.trim()) return;

    try {
      const data = await authApi.login({ email, password: pw });
      // ===== 사용자 식별 정보 저장 =====
      // JWT 토큰은 백엔드가 HttpOnly 쿠키(DEVBRIDGE_TOKEN)로 자동 set — JS 저장 불필요/금지(XSS 방어).
      // 용어: dbId = 백엔드 User PK(숫자), username = 회원가입 시 입력한 로그인 핸들
      // 잔존 레거시 토큰 정리 (이전 로그인 세션이 남긴 localStorage 토큰 제거)
      localStorage.removeItem('accessToken');
      if (data.userId != null) {
        localStorage.setItem('dbId', String(data.userId));      // PK (비민감)
        localStorage.setItem('username', data.username ?? '');   // 핸들 (비민감)
        localStorage.setItem('userType', data.userType ?? '');
      }
      setLogin(data.email, "local");
      const roleLc = data.userType.toLowerCase(); // PARTNER/CLIENT -> partner/client
      setUserRole(roleLc);
      // username 저장 (회원가입 시 입력한 고정 핸들)
      setUser({ username: data.username, email: data.email, dbId: data.userId, userType: data.userType, githubUsername: data.githubUsername || "" });
      setUsername(data.username); // top-level username (단일 진실 소스 — 모든 페이지/Stream Chat 공통)
      setDbId(data.userId);       // top-level dbId (백엔드 API 용 PK)
      // 서버에서 프로필 상세 로드 (실패해도 로그인 흐름은 진행)
      try {
        const s = useStore.getState();
        await s.loadProfileDetailFromServer?.(roleLc);
      } catch { /* noop */ }
      alert(data.message);
      handleAfterLogin(roleLc);
    } catch (error) {
      const msg = error?.response?.data?.message || t("login.serverError");
      console.error("Login error:", error);
      alert(msg);
    }
  };

  // 역할(role)은 서버 응답(data.userType)에서만 취득한다. 과거 하드코딩 EMAIL_ROLE_MAP(실명 Gmail PII)은 제거됨.
  const googleLogin = useGoogleLogin({
    state: googleOAuthState,
    onSuccess: async (tokenResponse) => {
      if (tokenResponse.state !== googleOAuthState) {
        alert("보안 오류가 발생했습니다. 다시 시도해주세요.");
        return;
      }
      const accessToken = tokenResponse.access_token;

      try {
        // Google userinfo API로 실제 이메일 확인
        const res = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        const info = await res.json();
        const userEmail = info.email || "google";

        // BE 에 소셜 로그인 요청 → JWT 발급
        try {
          // 보안: 클라이언트가 email 을 정하지 않고 accessToken 을 보내 백엔드가 Google 에 직접 검증.
          const data = await authApi.socialLogin({ accessToken, provider: "google" });
          // JWT는 HttpOnly 쿠키로 자동 set — 잔존 레거시 토큰 정리만.
          localStorage.removeItem('accessToken');
          if (data.userId != null) {
            localStorage.setItem('dbId', String(data.userId));     // PK (비민감)
            localStorage.setItem('username', data.username ?? '');  // 핸들
            localStorage.setItem('userType', data.userType ?? '');
          }
          const role = (data.userType || '').toLowerCase();
          setLogin(data.email, "google");
          if (role) setUserRole(role);
          // username 저장 (회원가입 시 입력한 고정 핸들)
          setUser({ username: data.username, email: data.email, dbId: data.userId, userType: data.userType, githubUsername: data.githubUsername || "" });
          setUsername(data.username); // top-level username (단일 진실 소스)
          setDbId(data.userId);       // top-level dbId (백엔드 API 용 PK)
          // 서버에서 프로필 상세 + 관심목록 로드
          try {
            const s = useStore.getState();
            await Promise.all([
              s.loadProfileDetailFromServer?.(role),
              s.loadInterests?.(),
            ]);
          } catch { /* noop */ }
          handleAfterLogin(role || 'partner');
          return;
        } catch (apiErr) {
          // 미가입 이메일 → 회원가입 안내 팝업
          const status = apiErr?.response?.status;
          if (status === 400) {
            setLogin(userEmail, "google");
            // 하드코딩 매핑이 있으면 해당 역할로 우선 적용 (개발 편의)
            const mappedRole = EMAIL_ROLE_MAP[userEmail];
            if (mappedRole) setUserRole(mappedRole);
            setShowSignupConfirm(true);
            return;
          }
          throw apiErr;
        }
      } catch (e) {
        console.error("Google login error:", e);
        alert(t("login.googleError"));
      }
    },
    onError: () => alert(t("login.googleFail")),
  });

  const handleKakaoLogin = () => {
    const kakaoClientId = import.meta.env.VITE_KAKAO_REST_KEY;
    if (!kakaoClientId) { alert("VITE_KAKAO_REST_KEY가 .env에 없습니다."); return; }
    const redirectUri = `${window.location.origin}/oauth/kakao/callback`;
    const state = crypto.randomUUID();
    sessionStorage.setItem("kakao_oauth_state", state);
    const kakaoAuthUrl =
      "https://kauth.kakao.com/oauth/authorize" +
      `?client_id=${kakaoClientId}` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}` +
      `&response_type=code` +
      `&state=${encodeURIComponent(state)}`;
    window.location.assign(kakaoAuthUrl);
  };

  const handleGithubLogin = () => {
    const clientId = import.meta.env.VITE_GITHUB_CLIENT_ID;
    if (!clientId) { alert("VITE_GITHUB_CLIENT_ID가 .env에 없습니다."); return; }
    const redirectUri = `${window.location.origin}/oauth/github/callback`;
    const state = crypto.randomUUID();
    sessionStorage.setItem("github_oauth_state", state);
    const githubAuthUrl =
      "https://github.com/login/oauth/authorize" +
      `?client_id=${clientId}` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}` +
      `&scope=user:email%20repo` +
      `&state=${encodeURIComponent(state)}`;
    window.location.assign(githubAuthUrl);
  };

  const handleNaverLogin = () => alert(t("login.facebookAlert"));

  const SOCIALS = [
    {
      name: "google",
      bg: "#fff",
      border: "#E5E7EB",
      icon: (
        <svg width="22" height="22" viewBox="0 0 48 48">
          <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
          <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
          <path fill="#FBBC05" d="M10.53 28.59a14.5 14.5 0 0 1 0-9.18l-7.98-6.19a24.0 24.0 0 0 0 0 21.56l7.98-6.19z"/>
          <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
        </svg>
      ),
      onClick: () => {
        googleLogin();
      },
      hidden: !import.meta.env.VITE_GOOGLE_CLIENT_ID,
    },
    {
      name: "kakao",
      bg: "#FFE812",
      border: "transparent",
      icon: (
        <svg width="22" height="22" viewBox="0 0 48 48">
          <rect width="48" height="48" rx="12" fill="#FFE812"/>
          <path fill="#3C1E1E" d="M24 12c-8.84 0-16 5.55-16 12.4 0 4.42 2.94 8.3 7.36 10.5l-1.5 5.56c-.1.37.33.67.65.46l6.5-4.3c.98.14 1.97.21 2.99.21 8.84 0 16-5.55 16-12.4S32.84 12 24 12z"/>
        </svg>
      ),
      onClick: handleKakaoLogin,
      hidden: true,
    },
    {
      name: "github",
      bg: "#24292F",
      border: "transparent",
      icon: (
        <svg width="22" height="22" viewBox="0 0 48 48" fill="white">
          <path d="M24 2C11.95 2 2 11.95 2 24c0 9.73 6.31 17.97 15.06 20.88 1.1.2 1.5-.48 1.5-1.06 0-.52-.02-1.9-.03-3.73-6.13 1.33-7.42-2.96-7.42-2.96-1-2.55-2.45-3.23-2.45-3.23-2-.37.15-.36.15-.36 2.22.16 3.39 2.28 3.39 2.28 1.97 3.37 5.16 2.4 6.42 1.83.2-1.42.77-2.4 1.4-2.95-4.9-.56-10.05-2.45-10.05-10.9 0-2.41.86-4.38 2.27-5.92-.23-.56-.98-2.8.22-5.83 0 0 1.85-.59 6.06 2.26a21.07 21.07 0 0 1 11.08 0c4.2-2.85 6.05-2.26 6.05-2.26 1.2 3.03.45 5.27.22 5.83 1.42 1.54 2.27 3.51 2.27 5.92 0 8.47-5.16 10.34-10.08 10.88.79.68 1.5 2.03 1.5 4.1 0 2.96-.03 5.35-.03 6.07 0 .59.4 1.27 1.52 1.06C39.69 41.97 46 33.73 46 24 46 11.95 36.05 2 24 2z"/>
        </svg>
      ),
      onClick: handleGithubLogin,
      hidden: !import.meta.env.VITE_GITHUB_CLIENT_ID,
    },
    {
      name: "facebook",
      bg: "#1877F2",
      border: "transparent",
      icon: (
        <svg width="22" height="22" viewBox="0 0 48 48" fill="white">
          <path d="M24 2C11.95 2 2 11.95 2 24s9.95 22 22 22 22-9.95 22-22S36.05 2 24 2zm3.17 22h-2.17v8h-3v-8h-2v-3h2v-1.75C22 18.98 23.07 17 25.75 17H28v3h-1.55c-.83 0-1.28.4-1.28 1.15V21h3l-.5 3z"/>
        </svg>
      ),
      onClick: () => alert(t("login.facebookAlert")),
      hidden: true,
    },
    {
      name: "naver",
      bg: "#03C75A",
      border: "transparent",
      icon: (
        <svg width="22" height="22" viewBox="0 0 48 48" fill="white">
          <rect width="48" height="48" rx="12" fill="#03C75A"/>
          <path fill="white" d="M28.3 24.6 19.3 12h-5.3v24h5.7V23.4L28.7 36H34V12h-5.7z"/>
        </svg>
      ),
      onClick: handleNaverLogin,
      hidden: true,
    },
  ].filter(s => !s.hidden);

  return (
    <div style={{
      minHeight: "100vh", display: "flex", flexDirection: "column",
      fontFamily: BASE_FONT, position: "relative",
    }}>
      {/* 배경 비디오 (블러) */}
      <video
        ref={videoRef}
        src={bannerVideo}
        autoPlay
        loop
        muted
        playsInline
        style={{
          position: "fixed", inset: 0, zIndex: 0,
          width: "100%", height: "100%",
          objectFit: "cover",
          filter: "blur(12px) brightness(0.6)",
          transform: "scale(1.05)",
        }}
      />
      {/* 다크 그라디언트 오버레이 */}
      <div style={{
        position: "fixed", inset: 0, zIndex: 1,
        background: "linear-gradient(to bottom, rgba(0,0,0,0.35) 0%, rgba(0,0,0,0.55) 100%)",
      }} />

      {/* 메인 콘텐츠 */}
      <div style={{
        flex: 1, display: "flex", justifyContent: "center", alignItems: "center",
        position: "relative", zIndex: 2, padding: "40px 20px 20px",
      }}>
        <div style={{
          width: "100%", maxWidth: 460, background: "white",
          borderRadius: 24, padding: "48px 40px 40px",
          boxShadow: "0 20px 60px rgba(0,0,0,0.15)",
        }}>
          {/* 타이틀 */}
          <h1 style={{
            textAlign: "center", fontSize: 28, fontWeight: 900,
            color: "#111", marginBottom: 40, letterSpacing: "-0.5px",
          }}>
            <span style={{
              background: "linear-gradient(135deg, #60a5fa 0%, #3b82f6 50%, #6366f1 100%)",
              WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
              backgroundClip: "text",
            }}>Alpha-Helix</span> {t("login.title")}
          </h1>

          {/* 이메일 입력 */}
          <div style={{ marginBottom: 16 }}>
            <div style={{
              display: "flex", alignItems: "center", gap: 12,
              border: "1px solid #E5E7EB", borderRadius: 14,
              padding: "0 18px", height: 54, backgroundColor: "#fff",
              transition: "border-color 0.2s",
            }}>
              <Mail size={18} color="#9CA3AF" strokeWidth={1.8} />
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onBlur={() => setTouched((p) => ({ ...p, email: true }))}
                placeholder={t("login.emailPlaceholder")}
                style={{
                  flex: 1, border: "none", outline: "none", fontSize: 14,
                  color: "#111", backgroundColor: "transparent", fontFamily: BASE_FONT,
                }}
              />
            </div>
            {emailError && <p style={{ fontSize: 11, color: "#EF4444", marginTop: 6, marginLeft: 4 }}>{emailError}</p>}
          </div>

          {/* 비밀번호 입력 */}
          <div style={{ marginBottom: 28 }}>
            <div style={{
              display: "flex", alignItems: "center", gap: 12,
              border: "1px solid #E5E7EB", borderRadius: 14,
              padding: "0 18px", height: 54, backgroundColor: "#fff",
              transition: "border-color 0.2s",
            }}>
              <Lock size={18} color="#9CA3AF" strokeWidth={1.8} />
              <input
                type={showPw ? "text" : "password"}
                value={pw}
                onChange={(e) => setPw(e.target.value)}
                onBlur={() => setTouched((p) => ({ ...p, pw: true }))}
                placeholder={t("login.pwPlaceholder")}
                style={{
                  flex: 1, border: "none", outline: "none", fontSize: 14,
                  color: "#111", backgroundColor: "transparent", fontFamily: BASE_FONT,
                }}
              />
              <button
                type="button"
                onClick={() => setShowPw((v) => !v)}
                style={{
                  border: "none", background: "transparent", cursor: "pointer",
                  padding: 0, display: "flex", alignItems: "center",
                }}
              >
                {showPw
                  ? <EyeOff size={18} color="#9CA3AF" strokeWidth={1.8} />
                  : <Eye size={18} color="#9CA3AF" strokeWidth={1.8} />
                }
              </button>
            </div>
            {pwError && <p style={{ fontSize: 11, color: "#EF4444", marginTop: 6, marginLeft: 4 }}>{pwError}</p>}
          </div>

          {/* 로그인하기 버튼 */}
          <button
            onClick={login}
            disabled={!email.trim() || !pw.trim()}
            style={{
              width: "100%", height: 56, borderRadius: 14, border: "none",
              background: email.trim() && pw.trim()
                ? "linear-gradient(135deg, #60a5fa 0%, #3b82f6 50%, #6366f1 100%)"
                : "#B0B0B0",
              color: "white",
              fontSize: 16, fontWeight: 800,
              cursor: email.trim() && pw.trim() ? "pointer" : "not-allowed",
              fontFamily: BASE_FONT, transition: "opacity 0.2s",
              marginBottom: 14,
            }}
            onMouseEnter={(e) => { if (email.trim() && pw.trim()) e.currentTarget.style.opacity = "0.88"; }}
            onMouseLeave={(e) => { e.currentTarget.style.opacity = "1"; }}
          >
            {t("login.loginBtn")}
          </button>

          {/* 이메일 회원가입 */}
          <button
            onClick={() => navigate("/signup")}
            style={{
              width: "100%", height: 56, borderRadius: 14,
              border: "1px solid #E5E7EB", backgroundColor: "white",
              color: "#111", fontSize: 16, fontWeight: 800,
              cursor: "pointer", fontFamily: BASE_FONT,
              transition: "background-color 0.2s", marginBottom: 20,
            }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#F9FAFB")}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "white")}
          >
            {t("login.signupBtn")}
          </button>

          {/* 비밀번호 재설정 / 메인 홈 */}
          <div style={{
            display: "flex", justifyContent: "space-between",
            marginBottom: 32,
          }}>
            <button
              onClick={() => navigate("/find-password")}
              style={{
                border: "none", background: "transparent", cursor: "pointer",
                color: "#6B7280", fontSize: 13, fontFamily: BASE_FONT, padding: 0,
              }}
            >
              {t("login.resetPwBtn")}
            </button>
            <button
              onClick={() => navigate("/home")}
              style={{
                border: "none", background: "transparent", cursor: "pointer",
                color: "#6B7280", fontSize: 13, fontFamily: BASE_FONT, padding: 0,
              }}
            >
              {t("login.homeBtn")}
            </button>
          </div>

          {/* SNS 로그인 */}
          <p style={{
            textAlign: "center", fontSize: 13, color: "#9CA3AF",
            marginBottom: 24,
          }}>
            {t("login.snsTitle")}
          </p>

          {/* 동의 체크박스 → 제거: 동의는 회원가입 시에만. 로그인 시엔 링크만 노출 */}

          <div style={{
            display: "flex", justifyContent: "center", gap: 16,
          }}>
            {SOCIALS.map((s) => (
              <div
                key={s.name}
                onClick={s.onClick}
                style={{
                  display: "flex", flexDirection: "column", alignItems: "center", gap: 8,
                  cursor: "pointer",
                }}
              >
                <div
                  style={{
                    width: 52, height: 52, borderRadius: 16,
                    backgroundColor: s.bg,
                    border: s.border !== "transparent" ? `1px solid ${s.border}` : "none",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    transition: "transform 0.2s, box-shadow 0.2s",
                    boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.boxShadow = "0 4px 14px rgba(0,0,0,0.12)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.boxShadow = "0 2px 8px rgba(0,0,0,0.06)"; }}
                >
                  {s.icon}
                </div>
                <span style={{ fontSize: 11, color: "#6B7280", fontWeight: 500 }}>{s.name}</span>
              </div>
            ))}
          </div>

          {/* 약관 / 개인정보처리방침 링크 */}
          <p style={{ textAlign: "center", marginTop: 20, fontSize: 12, color: "#9CA3AF", fontFamily: BASE_FONT }}>
            <a href="/terms" target="_blank" rel="noopener noreferrer"
              style={{ color: "#6B7280", fontWeight: 600, textDecoration: "underline" }}>이용약관</a>
            {"  ·  "}
            <a href="/privacy" target="_blank" rel="noopener noreferrer"
              style={{ color: "#6B7280", fontWeight: 600, textDecoration: "underline" }}>개인정보처리방침</a>
          </p>
        </div>
      </div>

      {/* 미등록 계정 확인 팝업 */}
      {showSignupConfirm && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 9999,
          display: "flex", alignItems: "center", justifyContent: "center",
          backgroundColor: "rgba(0,0,0,0.45)",
        }}>
          <div style={{
            background: "white", borderRadius: 20,
            padding: "36px 32px 28px", maxWidth: 360, width: "90%",
            boxShadow: "0 20px 60px rgba(0,0,0,0.2)",
            textAlign: "center", fontFamily: BASE_FONT,
          }}>
            <p style={{ fontSize: 16, fontWeight: 700, color: "#111", marginBottom: 10 }}>
              {t("login.notRegistered")}
            </p>
            <p style={{ fontSize: 14, color: "#6B7280", marginBottom: 28 }}>
              {t("login.askSignup")}
            </p>
            <div style={{ display: "flex", gap: 12 }}>
              <button
                onClick={() => setShowSignupConfirm(false)}
                style={{
                  flex: 1, height: 48, borderRadius: 12,
                  border: "1px solid #E5E7EB", background: "white",
                  color: "#374151", fontSize: 15, fontWeight: 600,
                  cursor: "pointer", fontFamily: BASE_FONT,
                }}
              >
                {t("login.cancel")}
              </button>
              <button
                onClick={() => { setShowSignupConfirm(false); navigate("/signup"); }}
                style={{
                  flex: 1, height: 48, borderRadius: 12,
                  border: "none",
                  background: "linear-gradient(135deg, #60a5fa 0%, #3b82f6 50%, #6366f1 100%)",
                  color: "white", fontSize: 15, fontWeight: 700,
                  cursor: "pointer", fontFamily: BASE_FONT,
                }}
              >
                {t("login.signup")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 하단 Footer */}
      <div style={{
        position: "relative", zIndex: 2,
        textAlign: "center", padding: "20px 0 24px",
      }}>
        <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 12, color: "rgba(255,255,255,0.85)", cursor: "pointer" }}>{t("login.terms")}</span>
          <span style={{ fontSize: 12, color: "rgba(255,255,255,0.5)" }}>|</span>
          <span style={{ fontSize: 12, color: "rgba(255,255,255,0.85)", cursor: "pointer" }}>{t("login.privacy")}</span>
          <span style={{ fontSize: 12, color: "rgba(255,255,255,0.5)" }}>|</span>
          <span style={{ fontSize: 12, color: "rgba(255,255,255,0.85)", cursor: "pointer" }}>{t("login.faqContact")}</span>
        </div>
      </div>
    </div>
  );
}

export default Login;
