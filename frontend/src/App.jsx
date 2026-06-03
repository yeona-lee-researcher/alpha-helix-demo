import { lazy, Suspense } from "react";
import { Routes, Route, Navigate, Outlet, useLocation } from "react-router-dom";
import { GoogleOAuthProvider } from "@react-oauth/google";
import AppShell from "./components/shell/AppShell";

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;
// 구글 키가 빌드에 없으면(예: HTTP 자가배포) OAuth 초기화가 "Missing required parameter client_id" 로
// 렌더 중 크래시한다. 더미(형식만 유효한) client_id 로 크래시만 막고, 실제 구글 버튼은 Login 에서 숨긴다.
export const GOOGLE_ENABLED = !!GOOGLE_CLIENT_ID;
const SAFE_GOOGLE_CLIENT_ID = GOOGLE_CLIENT_ID || "000000000000-unconfigured.apps.googleusercontent.com";
function WithGoogle({ children }) {
  return <GoogleOAuthProvider clientId={SAFE_GOOGLE_CLIENT_ID}>{children}</GoogleOAuthProvider>;
}

function RedirectKeepQuery({ to }) {
  const loc = useLocation();
  return <Navigate to={`${to}${loc.search}${loc.hash}`} replace />;
}

function ShelledLayout() {
  return (
    <ThemeProvider>
      <AppShell>
        <Outlet />
      </AppShell>
    </ThemeProvider>
  );
}

// 페이지 컴포넌트를 lazy load → 라우트별 청크 분리, 초기 번들 최소화
const LandingPage           = lazy(() => import("./pages/LandingPage"));
const Home                  = lazy(() => import("./pages/Home"));
const Login                 = lazy(() => import("./pages/Login"));
const Pricing               = lazy(() => import("./pages/Pricing"));
const SubscriptionSuccess   = lazy(() => import("./pages/SubscriptionSuccess"));
const SubscriptionFail      = lazy(() => import("./pages/SubscriptionFail"));
const SubscriptionManage    = lazy(() => import("./pages/SubscriptionManage"));
const Signup                = lazy(() => import("./pages/Signup"));
const OAuthKakaoCallback    = lazy(() => import("./pages/OAuthKakaoCallback"));
const OAuthGithubCallback   = lazy(() => import("./pages/OAuthGithubCallback"));
const Mypage                = lazy(() => import("./pages/Mypage"));
const Loading               = lazy(() => import("./pages/Loading"));
const FindPassword          = lazy(() => import("./pages/FindPassword"));
const PrivacyPolicy         = lazy(() => import("./pages/PrivacyPolicy"));
const TermsOfService        = lazy(() => import("./pages/TermsOfService"));
const TossPaymentFail       = lazy(() => import("./pages/TossPaymentFail"));
const WorkHome              = lazy(() => import("./pages/WorkHome"));
const StrategyWorkspace     = lazy(() => import("./pages/StrategyWorkspace"));
const VisionBoard           = lazy(() => import("./pages/VisionBoard"));
const NotificationsPage     = lazy(() => import("./pages/NotificationsPage"));

// ─── Alpha-Helix
import { ThemeProvider } from "./alpha/ThemeContext";
const AlphaShell         = lazy(() => import("./alpha/AlphaShell"));
const AlphaWorkspaceList = lazy(() => import("./alpha/WorkspaceList"));
const AlphaAccountPage   = lazy(() => import("./alpha/AccountPage"));
const AlphaProposalsPage = lazy(() => import("./alpha/ProposalsPage"));
const AlphaWorkspace     = lazy(() => import("./alpha/Workspace"));
const AlphaDeveloperLab  = lazy(() => import("./alpha/DeveloperLab"));
const AlphaGuide         = lazy(() => import("./pages/AlphaGuide"));
const BriefingPage       = lazy(() => import("./pages/BriefingPage"));
const AlphaPrivacyPolicy = lazy(() => import("./pages/AlphaPrivacyPolicy"));
const AlphaTermsOfService = lazy(() => import("./pages/AlphaTermsOfService"));

function App() {
  return (
    <Suspense fallback={<div style={{ display:"flex", alignItems:"center", justifyContent:"center", height:"100vh", fontSize:14, color:"#6B7280" }}>Loading...</div>}>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/partner_home" element={<RedirectKeepQuery to="/home" />} />

        {/* ShelledLayout: 네비게이션해도 LeftSidebar/TopBar 상태 유지 */}
        <Route element={<ShelledLayout />}>
          <Route path="/home"                  element={<Home />} />
          <Route path="/workhome"              element={<WorkHome />} />
          <Route path="/mypage"                element={<Mypage />} />
          <Route path="/subscription/manage"  element={<SubscriptionManage />} />
          <Route path="/vision_board"          element={<VisionBoard />} />
          <Route path="/notifications"         element={<NotificationsPage />} />
          <Route path="/strategy"              element={<StrategyWorkspace />} />
          <Route path="/strategy/:id"          element={<StrategyWorkspace />} />
          <Route path="/alpha_guide"           element={<AlphaGuide />} />
          <Route path="/briefing"              element={<BriefingPage />} />
          <Route path="/alpha_privacy"         element={<AlphaPrivacyPolicy />} />
          <Route path="/alpha_terms"           element={<AlphaTermsOfService />} />

          {/* Alpha-Helix */}
          <Route path="/alpha" element={<AlphaShell />}>
            <Route index                       element={<AlphaWorkspaceList />} />
            <Route path="w/:id"                element={<AlphaWorkspace />} />
            <Route path="account"              element={<AlphaAccountPage />} />
            <Route path="proposals"            element={<AlphaProposalsPage />} />
            <Route path="developer"            element={<AlphaDeveloperLab />} />
          </Route>
        </Route>

        <Route path="/login"                   element={<WithGoogle><Login /></WithGoogle>} />
        <Route path="/signup"                  element={<WithGoogle><Signup /></WithGoogle>} />
        <Route path="/oauth/kakao/callback"    element={<OAuthKakaoCallback />} />
        <Route path="/oauth/github/callback"   element={<OAuthGithubCallback />} />
        <Route path="/loading"                 element={<Loading />} />
        <Route path="/find-password"           element={<FindPassword />} />
        <Route path="/pricing"                 element={<Pricing />} />
        <Route path="/subscription/success"    element={<SubscriptionSuccess />} />
        <Route path="/subscription/fail"       element={<SubscriptionFail />} />
        <Route path="/privacy"                 element={<PrivacyPolicy />} />
        <Route path="/terms"                   element={<TermsOfService />} />
        <Route path="/payments/toss/fail"      element={<TossPaymentFail />} />
      </Routes>
    </Suspense>
  );
}

export default App;
