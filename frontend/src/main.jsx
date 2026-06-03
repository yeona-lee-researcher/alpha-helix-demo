import React, { useEffect } from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, useLocation } from "react-router-dom";
import App from "./App.jsx";
import ErrorBoundary from "./components/ErrorBoundary.jsx";
import { LanguageProvider } from "./i18n/LanguageContext.jsx";
import "./index.css";

// HTTP(비보안 컨텍스트) 폴리필 — crypto.randomUUID 는 HTTPS/localhost 에서만 존재한다.
// HTTP 로 배포된 서버(예: http://<EC2-IP>)에서 Login/Signup 이 즉시 크래시하던 것 방지.
if (typeof crypto !== "undefined" && typeof crypto.randomUUID !== "function") {
  try {
    crypto.randomUUID = () =>
      "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
        const r = crypto.getRandomValues
          ? crypto.getRandomValues(new Uint8Array(1))[0] % 16
          : Math.floor(Math.random() * 16);
        const v = c === "x" ? r : (r & 0x3) | 0x8;
        return v.toString(16);
      });
  } catch { /* 할당 불가 환경은 무시 */ }
}

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => { window.scrollTo(0, 0); }, [pathname]);
  return null;
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ErrorBoundary>
      <LanguageProvider>
        <BrowserRouter>
          <ScrollToTop />
          <App />
        </BrowserRouter>
      </LanguageProvider>
    </ErrorBoundary>
  </React.StrictMode>
);
