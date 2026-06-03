import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import useStore from "../store/useStore";
import { authApi } from "../api";

export default function OAuthGithubCallback() {
  const navigate = useNavigate();
  const handledRef = useRef(false);
  const { setLogin, setUserRole, setUser, setUsername, setDbId } = useStore();

  useEffect(() => {
    // React StrictMode에서 useEffect 2번 실행 방지
    if (handledRef.current) return;
    handledRef.current = true;

    const url = new URL(window.location.href);
    const code = url.searchParams.get("code");
    const error = url.searchParams.get("error");
    const errorDescription = url.searchParams.get("error_description");

    if (error || !code) {
      alert(`GitHub 로그인 실패\nerror: ${error ?? "(없음)"}\n${errorDescription ?? ""}`);
      navigate("/login", { replace: true });
      return;
    }

    const state = url.searchParams.get("state");
    const savedState = sessionStorage.getItem("github_oauth_state");
    sessionStorage.removeItem("github_oauth_state");
    if (savedState && state !== savedState) {
      alert("GitHub 로그인 검증 실패 (state 불일치)");
      navigate("/login", { replace: true });
      return;
    }

    const redirectUri = `${window.location.origin}/oauth/github/callback`;

    authApi.githubLogin({ code, redirectUri })
      .then((data) => {
        localStorage.removeItem("accessToken");
        if (data.userId != null) {
          localStorage.setItem("dbId", String(data.userId));
          localStorage.setItem("username", data.username ?? "");
          localStorage.setItem("userType", data.userType ?? "");
        }
        const role = (data.userType || "").toLowerCase();
        setLogin(data.email, "github");
        if (role) setUserRole(role);
        setUser({ username: data.username, email: data.email, dbId: data.userId });
        setUsername(data.username);
        setDbId(data.userId);
        try {
          const s = useStore.getState();
          Promise.all([
            s.loadProfileDetailFromServer?.(role),
            s.loadInterests?.(),
          ]).catch(() => {});
        } catch { /* noop */ }
        navigate("/home", { replace: true });
      })
      .catch((err) => {
        const msg = err?.response?.data?.message || "서버 오류";
        alert("GitHub 로그인 실패: " + msg);
        navigate("/login", { replace: true });
      });
  }, [navigate, setLogin, setUserRole, setUser, setUsername, setDbId]);

  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "center",
      height: "100vh", fontSize: 14, color: "#6B7280",
    }}>
      GitHub 로그인 처리 중...
    </div>
  );
}
