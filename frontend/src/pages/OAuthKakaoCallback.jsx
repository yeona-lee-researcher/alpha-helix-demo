import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import useStore from "../store/useStore";

export default function OAuthKakaoCallback() {
  const navigate = useNavigate();
  const handledRef = useRef(false);
  const { setLogin, setKakaoAuthCode, loginType } = useStore();

  useEffect(() => {
    // ✅ StrictMode(dev)에서 useEffect 2번 실행되는 것 방지
    if (handledRef.current) return;
    handledRef.current = true;

    const url = new URL(window.location.href);
    const code = url.searchParams.get("code");

    const error = url.searchParams.get("error");
    const errorDescription = url.searchParams.get("error_description");

    console.log("KAKAO CALLBACK URL:", window.location.href);
    console.log({ code, error, errorDescription });

    // ✅ 이미 성공 처리한 적 있으면 바로 홈으로 (중복 방지)
    if (loginType === "kakao") {
      navigate("/home", { replace: true });
      return;
    }

    if (!code) {
      alert(
        `카카오 로그인 실패\n` +
          `error: ${error ?? "(없음)"}\n` +
          `description: ${errorDescription ?? "(없음)"}\n\n` +
          `주소창 URL을 확인해보세요.`
      );
      navigate("/login", { replace: true });
      return;
    }

    const state = url.searchParams.get("state");
    const savedState = sessionStorage.getItem("kakao_oauth_state");
    if (savedState && state !== savedState) {
      alert("카카오 로그인 검증 실패 (state 불일치)");
      navigate("/login", { replace: true });
      return;
    }

    // ✅ FE만 단계: 성공 처리
    setLogin("kakao", "kakao");
    setKakaoAuthCode(code);

    alert("카카오 로그인 성공!");
    navigate("/home", { replace: true });
  }, [navigate, loginType, setLogin, setKakaoAuthCode]);

  return <div style={{ padding: 20 }}>카카오 로그인 처리 중...</div>;
}
