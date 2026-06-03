import { useState, useEffect, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import {
  Home, Layers, BarChart3, Activity, ShieldCheck,
  ScrollText, Sparkles, Wallet, Inbox, MessageSquare, Image as ImageIcon, Bell,
  Globe, Settings, MoreHorizontal, Palette, UserCircle, ChevronRight, Check, LogOut,
  Code2, Laptop, FileCode, Database, TerminalSquare, FolderOpen, CreditCard,
} from "lucide-react";
import logoIcon from "../../assets/main_logo.png";
import { HEROES, getCurrentHeroKey, getCurrentHeroSrc, setCurrentHeroKey } from "../../alpha/heroAssets";
import { listWorkspaces } from "../../alpha/alphaApi";
import LoginRequiredModal from "./LoginRequiredModal";
import SettingsModal from "./SettingsModal";
import SubscriptionModal from "./SubscriptionModal";
import { useLanguage } from "../../i18n/LanguageContext";
import { useTheme } from "../../alpha/ThemeContext";
import { authApi } from "../../api/auth.api";
import useStore from "../../store/useStore";

// Alpha-Helix 테마 프리셋 (ThemeContext 와 키 동일하게 유지)
const THEME_PRESETS = [
  { key: "heli",  name: "Heli (기본)",    swatch: "linear-gradient(135deg,#BFDBFE,#A5B4FC,#C4B5FD)" },
  { key: "sky",   name: "Sky (브랜드)",   swatch: "linear-gradient(135deg,#60a5fa,#6366f1)" },
  { key: "alpha", name: "Alpha (노을)",   swatch: "linear-gradient(135deg,#FCA5A5,#F59E0B)" },
  { key: "dev",   name: "Dev (Dracula)",  swatch: "linear-gradient(135deg,#FF79C6,#BD93F9)" },
];

const TABS = [
  { key: "home",      tKey: "nav.home",         Icon: Home,           route: "/workhome" },
  { key: "config",    tKey: "nav.config",        Icon: Layers,         route: "/alpha" },
  { key: "report",    tKey: "nav.report",        Icon: BarChart3,      tab: "report",   sub: true },
  { key: "regime",    tKey: "nav.regime",        Icon: Activity,       tab: "regime",   sub: true },
  { key: "trust",     tKey: "nav.trust",         Icon: ShieldCheck,    tab: "trust",    sub: true },
  { key: "log",       tKey: "nav.log",           Icon: ScrollText,     tab: "log",      sub: true },
  { key: "developer",    tKey: "nav.developer",     Icon: Laptop,         route: "/alpha/developer" },
  { key: "dev_explorer", tKey: "nav.dev_explorer",  Icon: FolderOpen,     route: "/alpha/developer", devPanel: "explorer", devSub: true },
  { key: "dev_code",     tKey: "nav.dev_code",      Icon: FileCode,       route: "/alpha/developer", devPanel: "code",     devSub: true },
  { key: "dev_data",     tKey: "nav.dev_data",      Icon: Database,       route: "/alpha/developer", devPanel: "data",     devSub: true },
  { key: "dev_report",   tKey: "nav.dev_report",    Icon: BarChart3,      route: "/alpha/developer", devPanel: "report",   devSub: true },
  { key: "dev_console",  tKey: "nav.dev_console",   Icon: TerminalSquare, route: "/alpha/developer", devPanel: "console",  devSub: true },
  { key: "vision",    tKey: "nav.vision",        Icon: ImageIcon,      route: "/vision_board" },
  { key: "account",   tKey: "nav.account",       Icon: Wallet,         route: "/alpha/account" },
  { key: "proposals", tKey: "nav.proposals",     Icon: Inbox,          route: "/alpha/proposals" },
];

const WS_SUBMENUS = [
  { key: "config",  tKey: "nav.configSub",  Icon: Layers },
  { key: "report",  tKey: "nav.reportSub",  Icon: BarChart3 },
  { key: "regime",  tKey: "nav.regime",     Icon: Activity },
  { key: "trust",   tKey: "nav.trust",      Icon: ShieldCheck },
  { key: "log",     tKey: "nav.log",        Icon: ScrollText },
];

const DEV_SUBMENUS = [
  { key: "explorer", tKey: "nav.dev_explorer", Icon: FolderOpen },
  { key: "code",     tKey: "nav.dev_code",     Icon: FileCode },
  { key: "data",     tKey: "nav.dev_data",     Icon: Database },
  { key: "report",   tKey: "nav.dev_report",   Icon: BarChart3 },
  { key: "console",  tKey: "nav.dev_console",  Icon: TerminalSquare },
];

const LANGS = [
  { code: "ko", label: "한국어" },
  { code: "en", label: "English" },
  { code: "jp", label: "日本語" },
  { code: "zh", label: "中文" },
];

export default function LeftSidebar({ width = 52, onToggleGuide, guideOpen }) {
  const nav = useNavigate();
  const loc = useLocation();
  const { theme, themeKey, setThemeKey } = useTheme();
  const [showLogin, setShowLogin] = useState(false);
  const [langOpen, setLangOpen] = useState(false);
  const [gearOpen, setGearOpen] = useState(false);
  const [themeSubOpen, setThemeSubOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [subOpen, setSubOpen] = useState(false);
  const [heroOpen, setHeroOpen] = useState(false);
  const [heroKey, setHeroKey] = useState(() => getCurrentHeroKey());
  const [wsMenuOpen, setWsMenuOpen] = useState(false);
  const [wsTabSel, setWsTabSel] = useState(null);
  const [workspaces, setWorkspaces] = useState([]);
  const [wsBtnTop, setWsBtnTop] = useState(100);
  const [devMenuOpen, setDevMenuOpen] = useState(false);
  const [devBtnTop, setDevBtnTop] = useState(160);
  const langRef = useRef(null);
  const gearRef = useRef(null);
  const heroRef = useRef(null);
  const wsBtnRef = useRef(null);
  const wsFlyoutRef = useRef(null);
  const wsHoverOpenTimer = useRef(null);
  const wsHoverCloseTimer = useRef(null);
  const themeCloseTimer = useRef(null);
  const devBtnRef = useRef(null);
  const devFlyoutRef = useRef(null);
  const devHoverOpenTimer = useRef(null);
  const devHoverCloseTimer = useRef(null);
  const onWsAreaEnter = () => {
    if (wsHoverCloseTimer.current) { clearTimeout(wsHoverCloseTimer.current); wsHoverCloseTimer.current = null; }
  };
  const onWsAreaLeave = () => {
    if (wsHoverOpenTimer.current) { clearTimeout(wsHoverOpenTimer.current); wsHoverOpenTimer.current = null; }
    wsHoverCloseTimer.current = setTimeout(() => setWsMenuOpen(false), 200);
  };
  const onWsBtnEnter = () => {
    onWsAreaEnter();
    if (!isAuthed || wsMenuOpen) return;
    const rect = wsBtnRef.current?.getBoundingClientRect();
    if (rect) setWsBtnTop(rect.top);
    wsHoverOpenTimer.current = setTimeout(() => setWsMenuOpen(true), 500);
  };
  const onDevAreaEnter = () => {
    if (devHoverCloseTimer.current) { clearTimeout(devHoverCloseTimer.current); devHoverCloseTimer.current = null; }
  };
  const onDevBtnEnter = () => {
    onDevAreaEnter();
    if (!isAuthed || devMenuOpen) return;
    const rect = devBtnRef.current?.getBoundingClientRect();
    if (rect) setDevBtnTop(rect.top);
    devHoverOpenTimer.current = setTimeout(() => setDevMenuOpen(true), 500);
  };
  const onDevAreaLeave = () => {
    // 열기 예약만 취소하고, 자동 닫기는 하지 않는다 — 드롭다운은 바깥을 클릭할 때만 닫힘
    // (탭을 고르며 마우스가 잠깐 벗어나도 유지: 여러 패널 연속 선택).
    if (devHoverOpenTimer.current) { clearTimeout(devHoverOpenTimer.current); devHoverOpenTimer.current = null; }
  };

  const openThemeSub = () => {
    if (themeCloseTimer.current) { clearTimeout(themeCloseTimer.current); themeCloseTimer.current = null; }
    setThemeSubOpen(true);
  };
  const scheduleCloseThemeSub = () => {
    if (themeCloseTimer.current) clearTimeout(themeCloseTimer.current);
    themeCloseTimer.current = setTimeout(() => setThemeSubOpen(false), 220);
  };
  const isAuthed = !!localStorage.getItem("dbId");
  const { lang, setLang, t } = useLanguage();
  // sub-tab(세부 탭)은 /alpha 라우트(전략 카드 또는 워크스페이스) 안에 있을 때만 노출
  const inAlpha = loc.pathname === "/alpha" || loc.pathname.startsWith("/alpha/w/");
  const inDeveloper = loc.pathname === "/alpha/developer" || loc.pathname.startsWith("/alpha/developer/");

  useEffect(() => {
    const onDoc = (e) => {
      if (langRef.current && !langRef.current.contains(e.target)) setLangOpen(false);
      if (gearRef.current && !gearRef.current.contains(e.target)) {
        setGearOpen(false);
        setThemeSubOpen(false);
      }
      if (heroRef.current && !heroRef.current.contains(e.target)) setHeroOpen(false);
      const inBtn = wsBtnRef.current && wsBtnRef.current.contains(e.target);
      const inFly = wsFlyoutRef.current && wsFlyoutRef.current.contains(e.target);
      if (!inBtn && !inFly) { setWsMenuOpen(false); setWsTabSel(null); }
      const inDevBtn = devBtnRef.current && devBtnRef.current.contains(e.target);
      const inDevFly = devFlyoutRef.current && devFlyoutRef.current.contains(e.target);
      if (!inDevBtn && !inDevFly) { setDevMenuOpen(false); }
    };
    document.addEventListener("mousedown", onDoc);
    const onHeroChange = (e) => setHeroKey(e?.detail?.key || getCurrentHeroKey());
    window.addEventListener("alpha:hero-change", onHeroChange);
    const onOpenSub = () => setSubOpen(true);
    window.addEventListener("alpha:open-subscription", onOpenSub);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      window.removeEventListener("alpha:hero-change", onHeroChange);
      if (wsHoverOpenTimer.current) clearTimeout(wsHoverOpenTimer.current);
      if (wsHoverCloseTimer.current) clearTimeout(wsHoverCloseTimer.current);
      if (devHoverOpenTimer.current) clearTimeout(devHoverOpenTimer.current);
      if (devHoverCloseTimer.current) clearTimeout(devHoverCloseTimer.current);
    };
  }, []);

  useEffect(() => {
    if (wsMenuOpen && isAuthed) {
      listWorkspaces()
        .then(r => setWorkspaces(Array.isArray(r) ? r : (r?.content || [])))
        .catch(() => setWorkspaces([]));
    }
  }, [wsMenuOpen]);

  const applyTheme = (k) => {
    setThemeKey(k);
    try {
      localStorage.setItem("alpha.theme", k);
      // 다른 ThemeProvider 인스턴스에도 즉시 반영
      window.dispatchEvent(new CustomEvent("alpha:theme-change", { detail: { key: k } }));
    } catch (_) {}
    setThemeSubOpen(false);
    setGearOpen(false);
  };

  const go = (t) => {
    if (!isAuthed) { setShowLogin(true); return; }
    if (t.devSub) { nav(`/alpha/developer?panel=${t.devPanel}`); return; }
    if (t.route) { nav(t.route); return; }
    if (t.tab === null) { nav("/alpha"); return; }
    const primaryId = localStorage.getItem("alpha.primaryWsId");
    const lastWsId = primaryId || localStorage.getItem("alpha.lastWsId");
    if (lastWsId) nav(`/alpha/w/${lastWsId}?tab=${t.tab}`);
    else nav("/alpha");
  };

  const isActive = (t) => {
    const params = new URLSearchParams(loc.search);
    const wsMatch = loc.pathname.match(/^\/alpha\/w\/(\d+)/);
    const currentTab = params.get("tab") || "chat";
    const currentPanel = params.get("panel") || "explorer";
    if (t.devSub) return inDeveloper && currentPanel === t.devPanel;
    if (t.key === "developer") return inDeveloper;
    if (t.route) {
      if (t.route === "/alpha") {
        return loc.pathname === "/alpha" || loc.pathname.startsWith("/alpha/w/");
      }
      return loc.pathname === t.route || loc.pathname.startsWith(t.route + "/");
    }
    if (t.tab === null) return loc.pathname === "/alpha";
    return wsMatch && currentTab === t.tab;
  };

  return (
    <>
      <aside style={{
        position: "fixed", top: 0, left: 0, bottom: 0, width,
        background: theme.sidebar,
        borderRight: "1px solid rgba(255,255,255,0.08)",
        display: "flex", flexDirection: "column", alignItems: "center",
        paddingTop: 6, paddingBottom: 8, gap: 3, zIndex: 1000,
      }}>
        <button onClick={() => nav("/home")} title="Alpha-Helix 홈" style={{
          width: 38, height: 38, marginBottom: 6, borderRadius: 9, border: "none",
          background: "white", cursor: "pointer", display: "inline-flex",
          alignItems: "center", justifyContent: "center", padding: 0, overflow: "hidden",
          boxShadow: "0 2px 6px rgba(0,0,0,0.15)",
        }}>
          <img src={logoIcon} alt="Alpha-Helix" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
        </button>

        {/* home 탭 */}
        {TABS.filter(tab => tab.key === "home").map(tab => (
          <SideIconBtn key={tab.key} title={t(tab.tKey)} active={isActive(tab)} onClick={() => go(tab)}>
            {isActive(tab) && <ActiveIndicator />}
            <tab.Icon size={22} strokeWidth={isActive(tab) ? 2.4 : 1.9} />
          </SideIconBtn>
        ))}
        {/* 워크스페이스 플라이아웃 버튼 */}
        <div ref={wsBtnRef} onMouseEnter={onWsBtnEnter} onMouseLeave={onWsAreaLeave}>
          <SideIconBtn
            title={t("nav.workspace")}
            active={wsMenuOpen || inAlpha}
            onClick={() => {
              if (!isAuthed) { setShowLogin(true); return; }
              nav("/alpha");
            }}
          >
            {(wsMenuOpen || inAlpha) && <ActiveIndicator />}
            <Layers size={22} strokeWidth={(wsMenuOpen || inAlpha) ? 2.4 : 1.9} />
          </SideIconBtn>
        </div>
        {/* home·config·developer 제외 나머지 탭 */}
        {TABS.filter(tab => tab.key !== "home" && tab.key !== "config" && tab.key !== "developer" && !tab.sub && !tab.devSub).map(tab => (
          <SideIconBtn key={tab.key} title={t(tab.tKey)} active={isActive(tab)} onClick={() => go(tab)}>
            {isActive(tab) && <ActiveIndicator />}
            <tab.Icon size={22} strokeWidth={isActive(tab) ? 2.4 : 1.9} />
          </SideIconBtn>
        ))}
        {/* Developer Studio 플라이아웃 버튼 */}
        <div ref={devBtnRef} onMouseEnter={onDevBtnEnter} onMouseLeave={onDevAreaLeave}>
          <SideIconBtn
            title="Developer Studio"
            active={devMenuOpen || inDeveloper}
            onClick={() => {
              if (!isAuthed) { setShowLogin(true); return; }
              const rect = devBtnRef.current?.getBoundingClientRect();
              if (rect) setDevBtnTop(rect.top);
              nav("/alpha/developer");
            }}
          >
            {(devMenuOpen || inDeveloper) && <ActiveIndicator />}
            <Laptop size={22} strokeWidth={(devMenuOpen || inDeveloper) ? 2.4 : 1.9} />
          </SideIconBtn>
        </div>
        {/* developer 하위 탭: DeveloperLab 내부 Activity Bar로 이동됨 */}

        <div style={{ marginTop: "auto", display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
          <SideIconBtn title="전체 브리핑" active={loc.pathname === "/briefing"} onClick={() => { if (!isAuthed) { setShowLogin(true); return; } nav("/briefing"); }}>
            {loc.pathname === "/briefing" && <ActiveIndicator />}
            <Sparkles size={22} strokeWidth={loc.pathname === "/briefing" ? 2.4 : 1.9} />
          </SideIconBtn>
          <SideIconBtn title="알림함" active={loc.pathname === "/notifications"} onClick={() => { if (!isAuthed) { setShowLogin(true); return; } nav("/notifications"); }}>
            <Bell size={22} />
          </SideIconBtn>
          <SideIconBtn title="이용 가이드" active={!!guideOpen} onClick={onToggleGuide}>
            <MoreHorizontal size={22} />
          </SideIconBtn>

          <div ref={langRef} style={{ position: "relative" }}>
            <SideIconBtn title="언어 변경" active={langOpen} onClick={() => setLangOpen(o => !o)}>
              <Globe size={22} />
            </SideIconBtn>
            {langOpen && (
              <div style={{
                position: "absolute", left: 44, bottom: 0,
                background: "white", border: "1px solid #E2E8F0", borderRadius: 10,
                boxShadow: "0 12px 30px rgba(0,0,0,0.15)", padding: 6, zIndex: 1100,
                minWidth: 140,
              }}>
                {LANGS.map(L => (
                  <button key={L.code} onClick={() => { setLang(L.code); setLangOpen(false); }}
                    style={{
                      display: "block", width: "100%", textAlign: "left",
                      padding: "8px 12px", borderRadius: 6, border: "none",
                      background: lang === L.code ? "#EFF6FF" : "transparent",
                      color: lang === L.code ? "#1d4ed8" : "#0F172A",
                      fontSize: 13, fontWeight: lang === L.code ? 700 : 500,
                      cursor: "pointer",
                    }}
                    onMouseEnter={(e) => { if (lang !== L.code) e.currentTarget.style.background = "#F8FAFC"; }}
                    onMouseLeave={(e) => { if (lang !== L.code) e.currentTarget.style.background = "transparent"; }}
                  >
                    {lang === L.code && "✓ "}{L.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div ref={gearRef} style={{ position: "relative" }}>
            <SideIconBtn title="설정" active={gearOpen} onClick={() => { setGearOpen(o => !o); setThemeSubOpen(false); }}>
              <Settings size={22} />
            </SideIconBtn>
            {gearOpen && (
              <div style={{
                position: "absolute", left: 44, bottom: 0,
                background: "white", border: "1px solid #E2E8F0", borderRadius: 10,
                boxShadow: "0 12px 30px rgba(0,0,0,0.18)", padding: 6, zIndex: 1100,
                minWidth: 200,
              }}>
                {/* Theme 팔레트 (서브메뉴) */}
                <div style={{ position: "relative" }}
                  onMouseEnter={openThemeSub}
                  onMouseLeave={scheduleCloseThemeSub}
                >
                  <MenuItem
                    icon={<Palette size={15} />}
                    label="Theme 팔레트"
                    right={<ChevronRight size={14} style={{ color: "#94A3B8" }} />}
                    onClick={() => setThemeSubOpen(s => !s)}
                  />
                  {themeSubOpen && (
                    <div
                      onMouseEnter={openThemeSub}
                      onMouseLeave={scheduleCloseThemeSub}
                      style={{
                        position: "absolute", left: "100%", bottom: 0, marginLeft: 0,
                        paddingLeft: 8,
                        background: "transparent", zIndex: 1101,
                        minWidth: 208,
                      }}
                    >
                    <div style={{
                      background: "white", border: "1px solid #E2E8F0", borderRadius: 10,
                      boxShadow: "0 12px 30px rgba(0,0,0,0.18)", padding: 6,
                    }}>
                      <div style={{
                        padding: "4px 10px 8px", fontSize: 11, color: "#64748B",
                        fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.4,
                      }}>
                        Alpha-Helix 테마
                      </div>
                      {THEME_PRESETS.map(t => (
                        <button key={t.key} onClick={() => applyTheme(t.key)}
                          style={{
                            display: "flex", alignItems: "center", gap: 10,
                            width: "100%", padding: "7px 10px", borderRadius: 6,
                            border: "none", background: themeKey === t.key ? "#EFF6FF" : "transparent",
                            color: themeKey === t.key ? "#1d4ed8" : "#0F172A",
                            fontSize: 13, fontWeight: themeKey === t.key ? 700 : 500,
                            cursor: "pointer", textAlign: "left",
                          }}
                          onMouseEnter={(e) => { if (themeKey !== t.key) e.currentTarget.style.background = "#F8FAFC"; }}
                          onMouseLeave={(e) => { if (themeKey !== t.key) e.currentTarget.style.background = "transparent"; }}
                        >
                          <span style={{
                            width: 18, height: 18, borderRadius: 4,
                            background: t.swatch, border: "1px solid rgba(0,0,0,0.1)",
                            flex: "0 0 auto",
                          }} />
                          <span style={{ flex: 1 }}>{t.name}</span>
                          {themeKey === t.key && <Check size={14} />}
                        </button>
                      ))}
                    </div>
                    </div>
                  )}
                </div>

                <MenuItem
                  icon={<Settings size={15} />}
                  label="설정"
                  hint="Ctrl+,"
                  onClick={() => { setGearOpen(false); setSettingsOpen(true); }}
                />
                <MenuItem
                  icon={<CreditCard size={15} />}
                  label="구독 관리"
                  onClick={() => { setGearOpen(false); setSubOpen(true); }}
                />
              </div>
            )}
          </div>

          {isAuthed && (
            <div ref={heroRef} style={{ position: "relative" }}>
              <button onClick={() => setHeroOpen(o => !o)} title="내 Hero / 마이페이지"
                style={{
                  width: 34, height: 34, borderRadius: "50%", background: "white",
                  border: heroOpen ? "2px solid #6366f1" : "none", cursor: "pointer",
                  display: "inline-flex", alignItems: "center", justifyContent: "center",
                  boxShadow: "0 2px 6px rgba(0,0,0,0.15)", overflow: "hidden", padding: 0,
                }}>
                <img src={getCurrentHeroSrc()} alt="me"
                  style={{ width: 30, height: 30, objectFit: "contain" }} />
              </button>
              {heroOpen && (
                <div style={{
                  position: "absolute", left: 44, bottom: 0,
                  background: "white", border: "1px solid #E2E8F0", borderRadius: 10,
                  boxShadow: "0 12px 30px rgba(0,0,0,0.18)", padding: 8, zIndex: 1100,
                  minWidth: 240,
                }}>
                  <MenuItem icon={<UserCircle size={15} />} label="마이페이지 이동"
                    onClick={() => { setHeroOpen(false); nav("/mypage"); }} />
                  <div style={{
                    padding: "6px 10px 4px", fontSize: 11, color: "#64748B",
                    fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.4,
                    marginTop: 4, borderTop: "1px solid #F1F5F9",
                  }}>Hero 이미지 변경</div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 6, padding: 6 }}>
                    {HEROES.map(h => (
                      <button key={h.key} onClick={() => { setCurrentHeroKey(h.key); setHeroKey(h.key); }}
                        title={h.label}
                        style={{
                          width: 44, height: 44, padding: 2, borderRadius: 8,
                          background: heroKey === h.key ? "#EFF6FF" : "transparent",
                          border: heroKey === h.key ? "2px solid #6366f1" : "1px solid #E2E8F0",
                          cursor: "pointer", display: "inline-flex",
                          alignItems: "center", justifyContent: "center",
                        }}>
                        <img src={h.src} alt={h.label}
                          style={{ width: "100%", height: "100%", objectFit: "contain" }} />
                      </button>
                    ))}
                  </div>
                  <div style={{ borderTop: "1px solid #F1F5F9", marginTop: 4, paddingTop: 4 }}>
                    <MenuItem
                      icon={<LogOut size={15} />}
                      label="로그아웃"
                      danger
                      onClick={async () => {
                        setHeroOpen(false);
                        try { await authApi.logout(); } catch (_) {}
                        try {
                          localStorage.removeItem("accessToken");
                          localStorage.removeItem("dbId");
                          localStorage.removeItem("username");
                          localStorage.removeItem("userType");
                        } catch (_) {}
                        try { useStore.getState().clearUser?.(); } catch (_) {}
                        try { useStore.getState().clearLogin?.(); } catch (_) {}
                        nav("/home");
                      }}
                    />
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </aside>

      <LoginRequiredModal open={showLogin} onClose={() => setShowLogin(false)} />
      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <SubscriptionModal open={subOpen} onClose={() => setSubOpen(false)} />

      {/* ── 워크스페이스 플라이아웃 ── */}
      {wsMenuOpen && (
        <div ref={wsFlyoutRef} onMouseEnter={onWsAreaEnter} onMouseLeave={onWsAreaLeave} style={{
          position: "fixed", left: 58, top: wsBtnTop, zIndex: 1200,
          display: "flex", gap: 4,
        }}>
          {/* Panel 1 — 서브메뉴 */}
          <div style={{
            background: "white", border: "1px solid #E2E8F0", borderRadius: 12,
            boxShadow: "0 12px 32px rgba(0,0,0,0.18)", padding: 6, minWidth: 186,
          }}>
            <div style={{ padding: "4px 10px 8px", fontSize: 11, color: "#64748B", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.4 }}>
              워크스페이스
            </div>
            {WS_SUBMENUS.map(item => {
              const active = wsTabSel === item.key || (item.route && loc.pathname === item.route);
              return (
                <button key={item.key}
                  onClick={() => {
                    if (item.route) {
                      nav(item.route);
                      setWsMenuOpen(false);
                      setWsTabSel(null);
                    } else {
                      setWsTabSel(prev => prev === item.key ? null : item.key);
                    }
                  }}
                  style={{
                    display: "flex", alignItems: "center", gap: 10,
                    width: "100%", padding: "8px 10px", borderRadius: 8,
                    border: "none", background: active ? "#EFF6FF" : "transparent",
                    color: active ? "#1d4ed8" : "#0F172A",
                    fontSize: 13, fontWeight: active ? 700 : 500,
                    cursor: "pointer", textAlign: "left",
                  }}
                  onMouseEnter={e => { if (!active) e.currentTarget.style.background = "#F8FAFC"; }}
                  onMouseLeave={e => { if (!active) e.currentTarget.style.background = active ? "#EFF6FF" : "transparent"; }}
                >
                  <item.Icon size={15} color={active ? "#1d4ed8" : "#475569"} />
                  <span style={{ flex: 1 }}>{t(item.tKey)}</span>
                  {!item.route && <ChevronRight size={13} color="#94A3B8" />}
                </button>
              );
            })}
          </div>

          {/* Panel 2 — 전략 선택 */}
          {wsTabSel && (
            <div style={{
              background: "white", border: "1px solid #E2E8F0", borderRadius: 12,
              boxShadow: "0 12px 32px rgba(0,0,0,0.18)", padding: 6, minWidth: 224,
            }}>
              <div style={{ padding: "4px 10px 8px", fontSize: 11, color: "#64748B", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.4 }}>
                전략 선택
              </div>
              {workspaces.length === 0 ? (
                <div style={{ padding: "16px 10px", fontSize: 13, color: "#94A3B8", textAlign: "center" }}>
                  워크스페이스 없음
                </div>
              ) : workspaces.map(ws => (
                <button key={ws.id}
                  onClick={() => {
                    nav(`/alpha/w/${ws.id}?tab=${wsTabSel}`);
                    setWsMenuOpen(false);
                    setWsTabSel(null);
                  }}
                  style={{
                    display: "flex", flexDirection: "column", alignItems: "flex-start",
                    width: "100%", padding: "9px 10px", borderRadius: 8,
                    border: "none", background: "transparent",
                    color: "#0F172A", cursor: "pointer", textAlign: "left",
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = "#F8FAFC"}
                  onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                >
                  <span style={{ fontSize: 13, fontWeight: 600 }}>{ws.name || `전략 #${ws.id}`}</span>
                  {ws.trust != null && (
                    <span style={{ fontSize: 11, color: "#94A3B8", marginTop: 2 }}>Trust {ws.trust}</span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Developer Studio 플라이아웃 ── */}
      {devMenuOpen && (
        <div ref={devFlyoutRef} onMouseEnter={onDevAreaEnter} onMouseLeave={onDevAreaLeave} style={{
          position: "fixed", left: 58, top: devBtnTop, zIndex: 1200,
          display: "flex", gap: 4,
        }}>
          <div style={{
            background: "white", border: "1px solid #E2E8F0", borderRadius: 12,
            boxShadow: "0 12px 32px rgba(0,0,0,0.18)", padding: 6, minWidth: 200,
          }}>
            <div style={{ padding: "4px 10px 8px", fontSize: 11, color: "#64748B", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.4 }}>
              Developer Studio
            </div>
            {DEV_SUBMENUS.map(item => {
              const params = new URLSearchParams(loc.search);
              const currentPanel = params.get("panel") || "explorer";
              const active = inDeveloper && currentPanel === item.key;
              return (
                <button key={item.key}
                  onClick={() => {
                    // 패널을 바꿔도 드롭다운은 유지 — 여러 탭을 연속 선택할 수 있게(닫기는 바깥 클릭으로만).
                    nav(`/alpha/developer?panel=${item.key}`);
                  }}
                  style={{
                    display: "flex", alignItems: "center", gap: 10,
                    width: "100%", padding: "8px 10px", borderRadius: 8,
                    border: "none", background: active ? "#EFF6FF" : "transparent",
                    color: active ? "#1d4ed8" : "#0F172A",
                    fontSize: 13, fontWeight: active ? 700 : 500,
                    cursor: "pointer", textAlign: "left",
                  }}
                  onMouseEnter={e => { if (!active) e.currentTarget.style.background = "#F8FAFC"; }}
                  onMouseLeave={e => { if (!active) e.currentTarget.style.background = active ? "#EFF6FF" : "transparent"; }}
                >
                  <item.Icon size={15} color={active ? "#1d4ed8" : "#475569"} />
                  <span style={{ flex: 1 }}>{t(item.tKey)}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </>
  );
}

function MenuItem({ icon, label, hint, right, onClick, danger = false }) {
  return (
    <button onClick={onClick}
      style={{
        display: "flex", alignItems: "center", gap: 10,
        width: "100%", padding: "8px 10px", borderRadius: 6,
        border: "none", background: "transparent",
        color: danger ? "#DC2626" : "#0F172A",
        fontSize: 13, fontWeight: 500, cursor: "pointer", textAlign: "left",
      }}
      onMouseEnter={(e) => e.currentTarget.style.background = danger ? "#FEF2F2" : "#F1F5F9"}
      onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
    >
      <span style={{ color: danger ? "#DC2626" : "#475569", display: "inline-flex" }}>{icon}</span>
      <span style={{ flex: 1 }}>{label}</span>
      {hint && <span style={{ fontSize: 11, color: "#94A3B8", fontFamily: "monospace" }}>{hint}</span>}
      {right}
    </button>
  );
}

function SideIconBtn({ children, title, onClick, active = false, sub = false }) {
  return (
    <button
      onClick={onClick} title={title}
      style={{
        width: sub ? 28 : 36, height: sub ? 28 : 36, borderRadius: 8, border: "none",
        background: active ? "rgba(255,255,255,0.22)" : "transparent",
        color: "white", cursor: "pointer", display: "inline-flex",
        alignItems: "center", justifyContent: "center",
        position: "relative", transition: "background 0.15s",
        opacity: active ? 1 : 0.85,
        marginLeft: sub ? 14 : 0,
        alignSelf: sub ? "flex-start" : "center",
      }}
      onMouseEnter={(e) => {
        if (!active) e.currentTarget.style.background = "rgba(255,255,255,0.13)";
        e.currentTarget.style.opacity = 1;
      }}
      onMouseLeave={(e) => {
        if (!active) e.currentTarget.style.background = "transparent";
        e.currentTarget.style.opacity = active ? 1 : 0.85;
      }}
    >
      {children}
    </button>
  );
}

function ActiveIndicator() {
  return (
    <span style={{
      position: "absolute", left: -7, top: 6, bottom: 6, width: 3,
      background: "white", borderRadius: 2,
    }} />
  );
}
