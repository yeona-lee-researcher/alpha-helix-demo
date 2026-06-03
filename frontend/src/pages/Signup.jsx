import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useGoogleLogin } from "@react-oauth/google";
import useStore from "../store/useStore";
import { authApi } from "../api";
import { Phone, Mail, User, Lock, Eye, EyeOff, Building2, UserSearch } from "lucide-react";
import bannerVideo from "../assets/배너후보.mp4";
import { useLanguage } from "../i18n/LanguageContext";

const F = "'Inter', 'Pretendard', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
const PRIMARY_GRAD = "linear-gradient(135deg, #60a5fa 0%, #3b82f6 50%, #6366f1 100%)";
const ACTIVE_STYLE = { background: PRIMARY_GRAD, color: "white", cursor: "pointer", boxShadow: "0 4px 16px rgba(99,102,241,0.32)" };
const DISABLED_STYLE = { background: "#E5E7EB", color: "#9CA3AF", cursor: "not-allowed" };

const INPUT_STYLE = {
  width: "100%", padding: "13px 14px 13px 40px", borderRadius: 12,
  border: "1.5px solid #E2E8F0", fontSize: 14, fontWeight: 500,
  color: "#111827", fontFamily: F, outline: "none",
  boxSizing: "border-box", backgroundColor: "#F8FAFC", transition: "border 0.15s",
};

function InputIcon({ icon: Icon, type = "text", placeholder, value, onChange, right, readOnly = false }) {
  const style = readOnly
    ? { ...INPUT_STYLE, backgroundColor: "#F1F5F9", color: "#64748B", cursor: "not-allowed", border: "1.5px solid #E2E8F0" }
    : INPUT_STYLE;
  return (
    <div style={{ position: "relative" }}>
      <Icon size={15} color="#94A3B8" style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }} />
      <input type={type} placeholder={placeholder} value={value}
        readOnly={readOnly}
        onChange={e => !readOnly && onChange(e.target.value)}
        style={style}
        onFocus={e => { if (!readOnly) e.target.style.border = "1.5px solid #60A5FA"; }}
        onBlur={e => { if (!readOnly) e.target.style.border = "1.5px solid #E2E8F0"; }}
      />
      {right && <div style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)" }}>{right}</div>}
    </div>
  );
}

function MemberCard({ icon: Icon, label, selected, onClick }) {
  return (
    <button onClick={onClick} style={{
      flex: 1, padding: "24px 12px 18px", borderRadius: 14,
      border: selected ? "2.5px solid #3B82F6" : "1.5px solid #E2E8F0",
      background: selected ? "linear-gradient(135deg,#EFF6FF,#DBEAFE)" : "#F8FAFC",
      cursor: "pointer", fontFamily: F,
      display: "flex", flexDirection: "column", alignItems: "center", gap: 10,
      transition: "all 0.15s",
    }}>
      <Icon size={28} color={selected ? "#3B82F6" : "#64748B"} strokeWidth={1.5} />
      <span style={{ fontSize: 14, fontWeight: selected ? 700 : 500, color: selected ? "#2563EB" : "#374151" }}>{label}</span>
    </button>
  );
}

function Signup() {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const { loginUser, loginType, setLogin, setUsername, setUser, setUserRole, signupFormData, setSignupFormData, clearSignupFormData } = useStore();
  const googleEmail = loginType === "google" ? loginUser : "";

  const videoRef = useRef(null);
  useEffect(() => {
    if (videoRef.current) videoRef.current.playbackRate = 0.55;
  }, []);

  const [form, setFormRaw] = useState(() => signupFormData || {
    idEmail: googleEmail || "",
    phone: "",
    extraEmail: "",
    username: "",
    pw: "",
    pwConfirm: "",
    memberType: "클라이언트",
    birthdate: "",
  });
  const [showPw, setShowPw] = useState(false);
  const [showPwC, setShowPwC] = useState(false);
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [googleOAuthState] = useState(() => crypto.randomUUID());

  const set = (f, v) => setFormRaw(prev => ({ ...prev, [f]: v }));

  const googleSignup = useGoogleLogin({
    state: googleOAuthState,
    onSuccess: async (tokenResponse) => {
      if (tokenResponse.state !== googleOAuthState) {
        alert("보안 오류가 발생했습니다. 다시 시도해주세요.");
        return;
      }
      const accessToken = tokenResponse.access_token;
      try {
        const res = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        const info = await res.json();
        const userEmail = info.email || "";
        setLogin(userEmail, "google");
        set("idEmail", userEmail);
      } catch {
        setLogin("google", "google");
      }
    },
    onError: () => alert(t("login.googleFail")),
  });

  const isValid = !!(
    form.idEmail.trim() &&
    form.phone.trim().length >= 9 &&
    form.username.trim() &&
    form.pw.length >= 8 &&
    form.pw === form.pwConfirm &&
    form.memberType &&
    agreedToTerms
  );

  const handleNext = async () => {
    if (!isValid) return;
    setUsername(form.username);
    setSignupFormData({ ...form });

    // 이전에 존재하던 ClientRegister(클라이언트 형태/슬로건) 단계는 제거.
    // 공통 회원가입 완료 후 바로 로그인 상태로 홈으로.
    const payload = {
      email: form.idEmail,
      phone: form.phone,
      username: form.username,
      password: form.pw,
      userType: "CLIENT",
      birthDate: form.birthdate || null,
    };

    try {
      const data = await authApi.signup(payload);
      localStorage.removeItem('accessToken');
      if (data.userId != null) {
        localStorage.setItem('dbId', String(data.userId));
        localStorage.setItem('username', data.username ?? '');
        localStorage.setItem('userType', data.userType ?? '');
      }
      setUser({
        email: data.email,
        username: data.username,
        dbId: data.userId,
        phone: data.phone,
        birthdate: data.birthDate,
        role: '클라이언트'
      });
      setLogin(data.email, "local");
      setUserRole("client");
      clearSignupFormData();
      if (data.message) alert(data.message);
      navigate("/home");
    } catch (error) {
      const msg = error?.response?.data?.message || "서버와 통신 중 오류가 발생했습니다.";
      console.error("Signup error:", error);
      alert(msg);
    }
  };

  const LBL = ({ children }) => (
    <p style={{ fontSize: 13, fontWeight: 700, color: "#111827", margin: "0 0 8px", fontFamily: F }}>
      {children.endsWith(" *")
        ? <>{children.slice(0,-2)}<span style={{ color: "#EF4444", marginLeft: 2 }}>*</span></>
        : children}
    </p>
  );

  return (
    <div style={{ minHeight: "100vh", fontFamily: F, position: "relative" }}>
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

      {/* 카드 */}
      <div style={{
        position: "relative", zIndex: 2,
        display: "flex", justifyContent: "center", alignItems: "flex-start",
        minHeight: "100vh", padding: "40px 20px 64px",
      }}>
        <div style={{
          backgroundColor: "white", borderRadius: 24,
          boxShadow: "0 12px 48px rgba(0,0,0,0.13)",
          padding: "36px 44px 32px",
          width: "100%", maxWidth: 560,
        }}>
          {/* 타이틀 */}
          <h2 style={{ fontSize: 26, fontWeight: 800, color: "#0F172A", margin: "0 0 4px", fontFamily: F, textAlign: "center" }}>
            <span style={{
              background: "linear-gradient(135deg, #60a5fa 0%, #3b82f6 50%, #6366f1 100%)",
              WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
              backgroundClip: "text",
            }}>Alpha-Helix</span>{" "}{t("signup.title")}
          </h2>
          <p style={{ fontSize: 13, color: "#94A3B8", margin: "0 0 20px", fontFamily: F, textAlign: "center" }}>{t("signup.welcome")}</p>

          {/* SNS 간편 시작 — 소셜 OAuth 키가 설정된 경우만 노출(미설정 시 이메일 가입만 보이게) */}
          {(import.meta.env.VITE_GOOGLE_CLIENT_ID || import.meta.env.VITE_GITHUB_CLIENT_ID) && (
          <div style={{ marginBottom: 20 }}>
            <p style={{ textAlign: "center", fontSize: 12, color: "#94A3B8", margin: "0 0 14px", fontFamily: F, fontWeight: 500 }}>{t("signup.snsTitle")}</p>
            <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
              {/* Google */}
              <button onClick={() => googleSignup()} title="google" style={{ width: 46, height: 46, borderRadius: "50%", border: "1.5px solid #E5E7EB", background: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", padding: 0, transition: "box-shadow 0.15s" }} onMouseEnter={e => e.currentTarget.style.boxShadow = "0 2px 12px rgba(0,0,0,0.12)"} onMouseLeave={e => e.currentTarget.style.boxShadow = "none"}>
                <svg width="22" height="22" viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59a14.5 14.5 0 0 1 0-9.18l-7.98-6.19a24.0 24.0 0 0 0 0 21.56l7.98-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>
              </button>
              {/* GitHub */}
              <button onClick={() => alert(t("login.githubAlert"))} title="github" style={{ width: 46, height: 46, borderRadius: "50%", border: "none", background: "#24292F", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", padding: 0, transition: "box-shadow 0.15s" }} onMouseEnter={e => e.currentTarget.style.boxShadow = "0 2px 12px rgba(0,0,0,0.20)"} onMouseLeave={e => e.currentTarget.style.boxShadow = "none"}>
                <svg width="22" height="22" viewBox="0 0 48 48" fill="white"><path d="M24 2C11.95 2 2 11.95 2 24c0 9.73 6.31 17.97 15.06 20.88 1.1.2 1.5-.48 1.5-1.06 0-.52-.02-1.9-.03-3.73-6.13 1.33-7.42-2.96-7.42-2.96-1-2.55-2.45-3.23-2.45-3.23-2-.37.15-.36.15-.36 2.22.16 3.39 2.28 3.39 2.28 1.97 3.37 5.16 2.4 6.42 1.83.2-1.42.77-2.4 1.4-2.95-4.9-.56-10.05-2.45-10.05-10.9 0-2.41.86-4.38 2.27-5.92-.23-.56-.98-2.8.22-5.83 0 0 1.85-.59 6.06 2.26a21.07 21.07 0 0 1 11.08 0c4.2-2.85 6.05-2.26 6.05-2.26 1.2 3.03.45 5.27.22 5.83 1.42 1.54 2.27 3.51 2.27 5.92 0 8.47-5.16 10.34-10.08 10.88.79.68 1.5 2.03 1.5 4.1 0 2.96-.03 5.35-.03 6.07 0 .59.4 1.27 1.52 1.06C39.69 41.97 46 33.73 46 24 46 11.95 36.05 2 24 2z"/></svg>
              </button>
            </div>
            {/* 구분선 */}
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 18 }}>
              <div style={{ flex: 1, height: 1, background: "#E2E8F0" }} />
              <span style={{ fontSize: 11, color: "#94A3B8", fontFamily: F, whiteSpace: "nowrap" }}>{t("signup.orDirect")}</span>
              <div style={{ flex: 1, height: 1, background: "#E2E8F0" }} />
            </div>
          </div>
          )}

          <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>

            {/* 이메일 아이디 */}
            <div>
              <LBL>Email ID *</LBL>
              <InputIcon
                icon={Mail}
                type="email"
                placeholder="your_id_@email.com"
                value={form.idEmail}
                onChange={v => set("idEmail", v)}
                readOnly={!!googleEmail}
              />
              {googleEmail && (
                <p style={{ fontSize: 11, color: "#10B981", margin: "4px 0 0", fontFamily: F }}>{t("signup.googleEmail")}</p>
              )}
            </div>

            {/* 유선 연락처 + 생년월일 */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div>
                <LBL>{t("signup.phone")}</LBL>
                <InputIcon icon={Phone} placeholder="+82 (10)-0000-0000" value={form.phone}
                  onChange={v => set("phone", v.replace(/[^0-9+\-() ]/g, ""))} />
              </div>
              <div>
                <LBL>{t("signup.birthday")}</LBL>
                <InputIcon icon={Mail} type="date" placeholder="YYYY-MM-DD" value={form.birthdate}
                  onChange={v => set("birthdate", v)} />
              </div>
            </div>

            {/* 추가 연락처 */}
            <div>
              <LBL>{t("signup.additionalEmail")}</LBL>
              <InputIcon icon={Mail} type="email" placeholder="name@company.com" value={form.extraEmail}
                onChange={v => set("extraEmail", v)} />
            </div>

            {/* 닉네임 */}
            <div>
              <LBL>{t("signup.userId")}</LBL>
              <InputIcon icon={User} placeholder={t("signup.userIdPlaceholder")} value={form.username}
                onChange={v => set("username", v)} />
            </div>

            {/* 비밀번호 + 확인 */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div>
                <LBL>{t("signup.password")}</LBL>
                <InputIcon
                  icon={Lock}
                  type={showPw ? "text" : "password"}
                  placeholder="········"
                  value={form.pw}
                  onChange={v => set("pw", v)}
                  right={
                    <button onClick={() => setShowPw(p => !p)} style={{ background: "none", border: "none", cursor: "pointer", padding: 0, display: "flex" }}>
                      {showPw ? <Eye size={15} color="#94A3B8" /> : <EyeOff size={15} color="#94A3B8" />}
                    </button>
                  }
                />
              </div>
              <div>
                <LBL>{t("signup.confirmPassword")}</LBL>
                <InputIcon
                  icon={Lock}
                  type={showPwC ? "text" : "password"}
                  placeholder="········"
                  value={form.pwConfirm}
                  onChange={v => set("pwConfirm", v)}
                  right={
                    <button onClick={() => setShowPwC(p => !p)} style={{ background: "none", border: "none", cursor: "pointer", padding: 0, display: "flex" }}>
                      {showPwC ? <Eye size={15} color="#94A3B8" /> : <EyeOff size={15} color="#94A3B8" />}
                    </button>
                  }
                />
                {form.pw && form.pw.length < 8 && (
                  <p style={{ fontSize: 11, color: "#EF4444", margin: "4px 0 0" }}>{t("signup.pwMinLength")}</p>
                )}
                {form.pwConfirm && form.pw !== form.pwConfirm && (
                  <p style={{ fontSize: 11, color: "#EF4444", margin: "4px 0 0" }}>{t("signup.pwMismatch")}</p>
                )}
              </div>
            </div>

            {/* 회원 유형 — Alpha-Helix는 단일 투자자 로 고정 (선택지 수조) */}
            <div style={{ display: "none" }}>
              <LBL>{t("signup.memberType")}</LBL>
              <div style={{ display: "flex", gap: 12 }}>
                <MemberCard icon={Building2} label={t("signup.client")}
                  selected={form.memberType === "클라이언트"}
                  onClick={() => set("memberType", "클라이언트")} />
                <MemberCard icon={UserSearch} label={t("signup.partner")}
                  selected={form.memberType === "파트너"}
                  onClick={() => set("memberType", "파트너")} />
              </div>
            </div>

          </div>

          {/* 동의 체크박스 */}
          <label style={{
            display: "flex", alignItems: "flex-start", gap: 10,
            marginTop: 20, cursor: "pointer",
          }}>
            <input
              type="checkbox"
              checked={agreedToTerms}
              onChange={e => setAgreedToTerms(e.target.checked)}
              style={{ marginTop: 2, width: 16, height: 16, accentColor: "#3B82F6", cursor: "pointer", flexShrink: 0 }}
            />
            <span style={{ fontSize: 12, color: "#6B7280", lineHeight: 1.6, fontFamily: F }}>
              <a href="/terms" target="_blank" rel="noopener noreferrer"
                style={{ color: "#2563EB", fontWeight: 700, textDecoration: "underline" }}>
                이용약관
              </a>
              {" "}및{" "}
              <a href="/privacy" target="_blank" rel="noopener noreferrer"
                style={{ color: "#2563EB", fontWeight: 700, textDecoration: "underline" }}>
                개인정보처리방침
              </a>
              에 동의합니다. <span style={{ color: "#EF4444" }}>*</span>
            </span>
          </label>

          {/* 다음 단계 버튼 */}
          <button
            onClick={handleNext}
            disabled={!isValid}
            style={{
              width: "100%", marginTop: 28, padding: "16px 0", borderRadius: 12,
              border: "none", fontSize: 15, fontWeight: 700, fontFamily: F,
              transition: "all 0.25s",
              ...(isValid ? ACTIVE_STYLE : DISABLED_STYLE),
            }}
          >
            {t("signup.nextStep")}
          </button>

          <p style={{ textAlign: "center", fontSize: 13, color: "#64748B", marginTop: 16, fontFamily: F }}>
            이미 계정이 있나요?{" "}
            <span onClick={() => navigate("/login")}
              style={{ color: "#3B82F6", fontWeight: 700, cursor: "pointer" }}>로그인</span>
          </p>
        </div>
      </div>
    </div>
  );
}

export default Signup;