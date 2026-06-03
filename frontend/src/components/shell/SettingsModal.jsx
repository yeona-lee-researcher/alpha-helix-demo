import { useState, useEffect, useMemo } from "react";
import {
  X, Search, Settings as SettingsIcon, Layout, Bell,
  Keyboard, Code, Sparkles, ShieldCheck, User, Maximize2,
  BarChart2, TrendingUp,
} from "lucide-react";
import { useLanguage } from "../../i18n/LanguageContext";

/**
 * VS Code 스타일 설정 모달 — Alpha-Helix 전용 설정
 * - localStorage (ah.settings.*) 저장
 * - 변경 시 "ah:settingsChanged" 커스텀 이벤트 발행 → 다른 컴포넌트 즉시 반영
 */

const CATEGORIES = [
  {
    key: "general", label: "일반", Icon: SettingsIcon,
    sub: [{ key: "startup", label: "시작" }, { key: "language", label: "언어" }],
  },
  {
    key: "editor", label: "편집기 (Developer Studio)", Icon: Code,
    sub: [
      { key: "font", label: "글꼴" },
      { key: "format", label: "서식" },
      { key: "view", label: "보기" },
    ],
  },
  {
    key: "workbench", label: "워크벤치", Icon: Layout,
    sub: [
      { key: "layout", label: "레이아웃" },
      { key: "appearance", label: "모양" },
      { key: "workspace", label: "Alpha 워크스페이스" },
    ],
  },
  { key: "window",   label: "창",          Icon: Maximize2 },
  { key: "chat",     label: "채팅 / AI",   Icon: Sparkles  },
  { key: "backtest", label: "백테스트",    Icon: BarChart2 },
  { key: "trading",  label: "트레이딩",    Icon: TrendingUp },
  { key: "notify",   label: "알림",        Icon: Bell      },
  { key: "shortcut", label: "바로 가기 키",Icon: Keyboard  },
  { key: "security", label: "보안",        Icon: ShieldCheck },
  { key: "account",  label: "계정",        Icon: User      },
];

const SETTINGS = [
  // ── 일반 / 시작 ────────────────────────────────────────────────────────────
  {
    cat: "general", group: "시작",
    key: "ah.startup.openLastWs", label: "마지막 워크스페이스 자동 열기",
    desc: "앱 시작 시 마지막으로 사용한 Alpha-Helix 워크스페이스를 자동으로 엽니다.",
    type: "boolean", def: true,
  },
  {
    cat: "general", group: "시작",
    key: "ah.startup.startPage", label: "시작 페이지",
    desc: "로그인 후 처음 이동할 페이지를 선택합니다.",
    type: "select", def: "workhome",
    options: [
      { value: "home",     label: "홈" },
      { value: "workhome", label: "워크홈 (실시간 전략 요약)" },
      { value: "strategy", label: "마지막 전략 워크스페이스" },
      { value: "alpha",    label: "Alpha 워크스페이스 목록" },
    ],
  },

  // ── 일반 / 언어 ────────────────────────────────────────────────────────────
  {
    cat: "general", group: "언어",
    key: "ah.lang.code", label: "표시 언어",
    desc: "UI 표시 언어를 변경합니다. 일부 화면은 재진입 후 반영됩니다.",
    type: "select", def: "ko",
    options: [
      { value: "ko", label: "한국어" },
      { value: "en", label: "English" },
    ],
    syncWith: "language",
  },

  // ── 편집기 / 글꼴 ──────────────────────────────────────────────────────────
  {
    cat: "editor", group: "글꼴",
    key: "ah.editor.fontSize", label: "글꼴 크기 (px)",
    desc: "Developer Studio 편집 영역의 기본 글꼴 크기입니다.",
    type: "number", def: 13, min: 10, max: 28,
  },
  {
    cat: "editor", group: "글꼴",
    key: "ah.editor.fontFamily", label: "글꼴",
    desc: "편집기에서 사용할 글꼴을 지정합니다.",
    type: "string", def: "'Fira Code','Cascadia Code','Consolas',monospace",
  },

  // ── 편집기 / 서식 ──────────────────────────────────────────────────────────
  {
    cat: "editor", group: "서식",
    key: "ah.editor.tabSize", label: "Tab 크기",
    desc: "한 Tab이 차지하는 공백 수입니다.",
    type: "number", def: 4, min: 1, max: 8,
  },
  {
    cat: "editor", group: "서식",
    key: "ah.editor.insertSpaces", label: "Tab → 공백 변환",
    desc: "Tab 입력 시 공백 문자로 변환합니다.",
    type: "boolean", def: true,
  },
  {
    cat: "editor", group: "서식",
    key: "ah.editor.wordWrap", label: "자동 줄바꿈",
    desc: "긴 줄을 화면 너비에 맞춰 자동으로 줄바꿈합니다.",
    type: "boolean", def: false,
  },

  // ── 편집기 / 보기 ──────────────────────────────────────────────────────────
  {
    cat: "editor", group: "보기",
    key: "ah.editor.minimap", label: "미니맵 표시",
    desc: "편집기 우측에 코드 미니맵을 표시합니다.",
    type: "boolean", def: true,
  },
  {
    cat: "editor", group: "보기",
    key: "ah.editor.lineNumbers", label: "줄 번호 표시",
    desc: "편집기 좌측에 줄 번호를 표시합니다.",
    type: "boolean", def: true,
  },

  // ── 워크벤치 / 레이아웃 ────────────────────────────────────────────────────
  {
    cat: "workbench", group: "레이아웃",
    key: "ah.workbench.compact", label: "컴팩트 모드",
    desc: "좌측 사이드바와 상단바를 더 좁게 표시합니다.",
    type: "boolean", def: false,
  },

  // ── 워크벤치 / 모양 ────────────────────────────────────────────────────────
  {
    cat: "workbench", group: "모양",
    key: "ah.workbench.density", label: "표시 밀도",
    desc: "리스트·카드 여백 밀도를 조절합니다.",
    type: "select", def: "comfortable",
    options: [
      { value: "compact",     label: "Compact (조밀)" },
      { value: "comfortable", label: "Comfortable (보통)" },
      { value: "spacious",    label: "Spacious (여유)" },
    ],
  },
  {
    cat: "workbench", group: "모양",
    key: "ah.workbench.guideAutoOpen", label: "처음 방문 시 Alpha 가이드 열기",
    desc: "처음 방문 시 이용 가이드 도크를 자동으로 엽니다.",
    type: "boolean", def: false,
  },

  // ── 워크벤치 / Alpha 워크스페이스 ─────────────────────────────────────────
  {
    cat: "workbench", group: "Alpha 워크스페이스",
    key: "ah.workbench.defaultTab", label: "기본 탭",
    desc: "워크스페이스 진입 시 자동으로 열릴 탭을 선택합니다.",
    type: "select", def: "config",
    options: [
      { value: "chat",    label: "채팅 (AI Heli)" },
      { value: "config",  label: "전략 설정" },
      { value: "report",  label: "백테스트 리포트" },
      { value: "regime",  label: "레짐 분석" },
      { value: "trust",   label: "Trust Score" },
      { value: "briefing",label: "브리핑" },
      { value: "log",     label: "로그" },
    ],
  },
  {
    cat: "workbench", group: "Alpha 워크스페이스",
    key: "ah.workbench.sidePanelWidth", label: "사이드 패널 기본 너비 (px)",
    desc: "Developer Studio 좌측 파일 탐색기·Git 패널의 초기 너비입니다.",
    type: "number", def: 220, min: 160, max: 400,
  },

  // ── 창 ─────────────────────────────────────────────────────────────────────
  {
    cat: "window", group: null,
    key: "ah.window.openInNewTab", label: "외부 링크 새 탭으로 열기",
    desc: "외부 사이트 링크를 새 탭에서 엽니다.",
    type: "boolean", def: true,
  },
  {
    cat: "window", group: null,
    key: "ah.window.closeOnOverlay", label: "모달 배경 클릭 시 닫기",
    desc: "모달 뒤 어두운 오버레이를 클릭하면 모달을 닫습니다.",
    type: "boolean", def: true,
  },

  // ── 채팅 / AI ──────────────────────────────────────────────────────────────
  {
    cat: "chat", group: null,
    key: "ah.chat.model", label: "기본 AI 모델",
    desc: "AI 채팅(Heli)에서 기본으로 사용할 모델입니다. 채팅 창에서도 변경 가능합니다.",
    type: "select", def: "gemini-2.5-flash",
    options: [
      { value: "gemini-2.5-flash", label: "Gemini 2.5 Flash (기본·빠름)" },
      { value: "gemini-1.5-pro",   label: "Gemini 1.5 Pro (정확)" },
      { value: "gpt-4o",           label: "GPT-4o (OpenAI)" },
      { value: "claude-sonnet",    label: "Claude Sonnet (Anthropic)" },
      { value: "perplexity",       label: "Perplexity (검색 특화)" },
    ],
  },
  {
    cat: "chat", group: null,
    key: "ah.chat.sendOnEnter", label: "Enter 로 전송",
    desc: "켜면 Enter = 전송, Shift+Enter = 줄바꿈. 끄면 Ctrl+Enter = 전송.",
    type: "boolean", def: true,
  },
  {
    cat: "chat", group: null,
    key: "ah.chat.streaming", label: "AI 응답 스트리밍",
    desc: "AI 답변을 토큰 단위로 실시간 표시합니다.",
    type: "boolean", def: true,
  },
  {
    cat: "chat", group: null,
    key: "ah.chat.autoAnalysis", label: "백테스트 완료 후 AI 자동 분석",
    desc: "백테스트가 완료되면 AI가 결과를 자동으로 요약·분석합니다.",
    type: "boolean", def: true,
  },
  {
    cat: "chat", group: null,
    key: "ah.chat.quotaWarning", label: "AI 쿼터 경고 표시",
    desc: "시간당 20회 사용 한도에 근접하면 UI 경고를 표시합니다.",
    type: "boolean", def: true,
  },

  // ── 백테스트 / 기본값 ─────────────────────────────────────────────────────
  {
    cat: "backtest", group: "기본값",
    key: "ah.backtest.period", label: "기본 백테스트 기간",
    desc: "전략 워크스페이스에서 새 백테스트 실행 시 기본으로 사용할 기간입니다.",
    type: "select", def: "3y",
    options: [
      { value: "1y",  label: "1년" },
      { value: "3y",  label: "3년" },
      { value: "5y",  label: "5년" },
      { value: "10y", label: "10년" },
      { value: "all", label: "전체" },
    ],
  },
  {
    cat: "backtest", group: "기본값",
    key: "ah.backtest.strategy", label: "기본 전략 유형",
    desc: "새 백테스트 시 기본으로 선택할 전략 유형입니다.",
    type: "select", def: "sma_cross",
    options: [
      { value: "sma_cross",       label: "SMA 교차" },
      { value: "rsi_meanrev",     label: "RSI 평균회귀" },
      { value: "macd",            label: "MACD 모멘텀" },
      { value: "momentum_12_1",   label: "모멘텀 12-1" },
      { value: "vix_risk_off",    label: "VIX 리스크오프" },
      { value: "infinite_buying", label: "무한매수법" },
    ],
  },

  // ── 백테스트 / 표시 ───────────────────────────────────────────────────────
  {
    cat: "backtest", group: "표시",
    key: "ah.backtest.showCost", label: "수수료·슬리피지 항상 표시",
    desc: "백테스트 결과 카드에 수수료(0.25%)·슬리피지(0.1%) 비용을 항상 표시합니다.",
    type: "boolean", def: true,
  },
  {
    cat: "backtest", group: "표시",
    key: "ah.backtest.showBenchmark", label: "벤치마크(SPY) 비교선 표시",
    desc: "수익률 차트에 SPY 벤치마크 비교선을 표시합니다.",
    type: "boolean", def: true,
  },

  // ── 트레이딩 / 주문 ───────────────────────────────────────────────────────
  {
    cat: "trading", group: "주문",
    key: "ah.trading.defaultMode", label: "기본 거래 모드",
    desc: "OrderProposal 생성 시 기본으로 사용할 거래 모드입니다. 실거래는 KIS 계좌 연결 후 별도 승인이 필요합니다.",
    type: "select", def: "mock",
    options: [
      { value: "mock", label: "모의투자 (안전)" },
      { value: "real", label: "실거래 (주의 필요)" },
    ],
  },
  {
    cat: "trading", group: "주문",
    key: "ah.trading.doubleConfirm", label: "실거래 주문 승인 전 2차 확인",
    desc: "실거래 OrderProposal 승인 링크 클릭 시 재확인 다이얼로그를 표시합니다.",
    type: "boolean", def: true,
  },
  {
    cat: "trading", group: "주문",
    key: "ah.trading.expiryAlert", label: "주문 제안 만료 알림",
    desc: "OrderProposal TTL 만료 1시간 전에 알림을 발송합니다.",
    type: "boolean", def: true,
  },

  // ── 트레이딩 / 시그널 ─────────────────────────────────────────────────────
  {
    cat: "trading", group: "시그널",
    key: "ah.trading.dailySignal", label: "일일 XGBoost 시그널 수신",
    desc: "매일 22:30 KST에 생성되는 XGBoost 시그널을 자동으로 수신합니다.",
    type: "boolean", def: true,
  },
  {
    cat: "trading", group: "시그널",
    key: "ah.trading.trustScoreThreshold", label: "Trust Score 경고 임계값",
    desc: "Trust Score가 이 값 이하이면 UI에 경고를 표시합니다. (0–100)",
    type: "number", def: 40, min: 0, max: 100,
  },

  // ── 알림 ──────────────────────────────────────────────────────────────────
  {
    cat: "notify", group: null,
    key: "ah.notify.desktop", label: "데스크톱 알림",
    desc: "백테스트 완료·주문 체결 등 알림을 데스크톱에 띄웁니다.",
    type: "boolean", def: false,
  },
  {
    cat: "notify", group: null,
    key: "ah.notify.sound", label: "알림 소리",
    desc: "주요 이벤트 발생 시 소리 알림을 사용합니다.",
    type: "boolean", def: false,
  },
  {
    cat: "notify", group: null,
    key: "ah.notify.backtest", label: "백테스트 완료 알림",
    desc: "백테스트가 완료되면 알림을 표시합니다.",
    type: "boolean", def: true,
  },
  {
    cat: "notify", group: null,
    key: "ah.notify.orderFill", label: "주문 체결 알림",
    desc: "KIS를 통한 주문이 체결되면 알림을 표시합니다.",
    type: "boolean", def: true,
  },
  {
    cat: "notify", group: null,
    key: "ah.notify.proposalExpiry", label: "OrderProposal 만료 알림",
    desc: "주문 제안이 만료되기 전에 알림을 표시합니다.",
    type: "boolean", def: true,
  },
  {
    cat: "notify", group: null,
    key: "ah.notify.subscriptionExpiry", label: "구독 만료 예정 알림",
    desc: "구독이 만료되기 7일 전부터 갱신 알림을 표시합니다.",
    type: "boolean", def: true,
  },

  // ── 바로 가기 키 ──────────────────────────────────────────────────────────
  {
    cat: "shortcut", group: null,
    key: "__readonly__shortcuts", label: "주요 단축키", type: "info",
    desc:
      "Ctrl+K        기능 검색 (Top Bar)\n" +
      "Ctrl+B        좌측 사이드바 토글\n" +
      "Ctrl+/        AI 채팅(Heli) 토글\n" +
      "Ctrl+,        설정 열기\n" +
      "Ctrl+Enter    백테스트 실행 (전략 워크스페이스)\n" +
      "Ctrl+S        코드 저장 (Developer Studio)\n" +
      "Ctrl+`        터미널 열기 (Developer Studio)\n" +
      "Esc           모달 닫기",
  },

  // ── 보안 ──────────────────────────────────────────────────────────────────
  {
    cat: "security", group: null,
    key: "ah.security.lockOnIdle", label: "유휴 시 자동 잠금",
    desc: "10분간 활동이 없으면 화면을 잠그고 다시 로그인하도록 요구합니다.",
    type: "boolean", def: false,
  },
  {
    cat: "security", group: null,
    key: "ah.security.maskKeys", label: "API 키 마스킹",
    desc: "API·시크릿 키를 표시할 때 일부만 보입니다.",
    type: "boolean", def: true,
  },
  {
    cat: "security", group: null,
    key: "ah.security.maskKisKeys", label: "KIS API 자격증명 숨김",
    desc: "거래 계좌 페이지에서 KIS 앱키·시크릿을 마스킹합니다.",
    type: "boolean", def: true,
  },
  {
    cat: "security", group: null,
    key: "ah.security.showKillSwitch", label: "Kill-Switch 상태 상단 표시",
    desc: "TRADING_KILL_SWITCH 활성 여부를 상단바에 뱃지로 표시합니다.",
    type: "boolean", def: true,
  },

  // ── 계정 ──────────────────────────────────────────────────────────────────
  {
    cat: "account", group: null,
    key: "__readonly__account", label: "계정 정보", type: "info",
    desc:
      "프로필·구독 플랜·결제 내역은 마이페이지에서 확인하세요.\n" +
      "KIS 거래 계좌 연결은 Alpha > 거래 계좌 페이지에서 관리합니다.",
  },
];

// localStorage에서 설정값 읽기
function readVal(s) {
  try {
    const raw = localStorage.getItem(s.key);
    if (raw === null || raw === undefined) return s.def;
    if (s.type === "boolean") return raw === "true";
    if (s.type === "number") { const n = Number(raw); return Number.isFinite(n) ? n : s.def; }
    return raw;
  } catch { return s.def; }
}

export default function SettingsModal({ open, onClose }) {
  const [activeCat, setActiveCat] = useState("general");
  const [query, setQuery]         = useState("");
  const [scope, setScope]         = useState("user");
  // 아직 적용하지 않은 변경분 { [key]: rawValue }
  const [pending, setPending]     = useState({});
  const lang = (() => { try { return useLanguage(); } catch { return null; } })();

  // 모달 열릴 때 pending 초기화
  useEffect(() => { if (open) setPending({}); }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === "Escape") { setPending({}); onClose?.(); } };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // pending을 먼저 확인, 없으면 localStorage
  const readCurrent = (s) => {
    if (s.key in pending) {
      const raw = String(pending[s.key]);
      if (s.type === "boolean") return raw === "true";
      if (s.type === "number") { const n = Number(raw); return Number.isFinite(n) ? n : s.def; }
      return raw;
    }
    // Language setting: read from LanguageContext (source of truth) not ah.lang.code
    if (s.syncWith === "language" && lang?.lang !== undefined) return lang.lang;
    return readVal(s);
  };

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return SETTINGS.filter(s => s.cat === activeCat);
    return SETTINGS.filter(s =>
      (s.label && s.label.toLowerCase().includes(q)) ||
      (s.desc  && s.desc.toLowerCase().includes(q))  ||
      (s.key   && s.key.toLowerCase().includes(q))
    );
  }, [activeCat, query]);

  if (!open) return null;

  // 변경사항을 pending에만 저장 (아직 localStorage에 쓰지 않음)
  const onChange = (s, v) => {
    setPending(prev => ({ ...prev, [s.key]: v }));
  };

  // pending → localStorage 반영 + 이벤트 발행
  const applyPending = () => {
    Object.entries(pending).forEach(([key, value]) => {
      try { localStorage.setItem(key, String(value)); } catch (_) {}
      const s = SETTINGS.find(x => x.key === key);
      if (s?.syncWith === "language" && lang?.setLang) {
        try { lang.setLang(value); } catch (_) {}
      }
      window.dispatchEvent(new CustomEvent("ah:settingsChanged", { detail: { key, value: String(value) } }));
    });
    setPending({});
  };

  const handleApply  = () => applyPending();
  const handleOk     = () => { applyPending(); onClose?.(); };
  const handleCancel = () => { setPending({}); onClose?.(); };

  const hasPending = Object.keys(pending).length > 0;

  const grouped = visible.reduce((acc, s) => {
    const g = s.group || "_";
    (acc[g] ||= []).push(s);
    return acc;
  }, {});

  // X 버튼 (pending 버리고 닫기)
  const handleClose = handleCancel;

  return (
    <div
      onClick={handleClose}
      style={{
        position: "fixed", inset: 0, background: "rgba(15,23,42,0.55)",
        backdropFilter: "blur(4px)", zIndex: 4000,
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 24,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(1180px, 96vw)", height: "min(780px, 92vh)",
          background: "#1E1E1E", color: "#CCCCCC",
          borderRadius: 10, boxShadow: "0 30px 80px rgba(0,0,0,0.5)",
          display: "flex", flexDirection: "column", overflow: "hidden",
          fontFamily: "'Inter','Pretendard',-apple-system,'Segoe UI',sans-serif",
          border: "1px solid #3C3C3C",
        }}
      >
        {/* 타이틀바 */}
        <div style={{
          height: 36, background: "#252526", borderBottom: "1px solid #3C3C3C",
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "0 12px", flex: "0 0 auto",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "#CCCCCC" }}>
            <SettingsIcon size={14} />
            <span>설정</span>
            {hasPending && (
              <span style={{
                fontSize: 10, padding: "1px 6px", borderRadius: 8,
                background: "rgba(0,122,204,0.25)", color: "#007ACC", fontWeight: 600,
              }}>
                {Object.keys(pending).length}개 미적용
              </span>
            )}
          </div>
          <button onClick={handleClose}
            style={{
              width: 26, height: 26, borderRadius: 4, border: "none",
              background: "transparent", color: "#CCCCCC", cursor: "pointer",
              display: "inline-flex", alignItems: "center", justifyContent: "center",
            }}
            onMouseEnter={e => e.currentTarget.style.background = "#3C3C3C"}
            onMouseLeave={e => e.currentTarget.style.background = "transparent"}
          >
            <X size={16} />
          </button>
        </div>

        {/* 검색바 + 탭 */}
        <div style={{
          padding: "10px 14px", borderBottom: "1px solid #3C3C3C",
          background: "#252526", flex: "0 0 auto",
        }}>
          <div style={{ position: "relative", marginBottom: 8 }}>
            <Search size={14} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "#858585" }} />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="설정 검색"
              style={{
                width: "100%", padding: "7px 10px 7px 32px", boxSizing: "border-box",
                background: "#3C3C3C", border: "1px solid #3C3C3C", color: "#CCCCCC",
                borderRadius: 3, fontSize: 13, outline: "none",
              }}
              onFocus={(e) => e.currentTarget.style.borderColor = "#007ACC"}
              onBlur={(e)  => e.currentTarget.style.borderColor = "#3C3C3C"}
            />
          </div>
          <div style={{ display: "flex", gap: 4, fontSize: 12 }}>
            {[{ k: "user", label: "사용자" }, { k: "workspace", label: "작업 영역" }].map(t => (
              <button key={t.k} onClick={() => setScope(t.k)}
                style={{
                  padding: "5px 12px", border: "none", cursor: "pointer",
                  background: "transparent", color: scope === t.k ? "#FFFFFF" : "#858585",
                  borderBottom: scope === t.k ? "2px solid #007ACC" : "2px solid transparent",
                  fontSize: 12, fontWeight: scope === t.k ? 600 : 400,
                }}
              >{t.label}</button>
            ))}
            {scope === "workspace" && (
              <div style={{ marginLeft: "auto", color: "#858585", fontSize: 11, alignSelf: "center" }}>
                작업 영역 설정은 현재 사용자 설정을 따릅니다.
              </div>
            )}
          </div>
        </div>

        {/* 본문 */}
        <div style={{ display: "flex", flex: "1 1 0", minHeight: 0 }}>
          {/* 좌측 카테고리 */}
          <div style={{
            width: 240, background: "#252526", borderRight: "1px solid #3C3C3C",
            overflowY: "auto", padding: "8px 0", flex: "0 0 auto",
          }}>
            {CATEGORIES.map(c => {
              const active = activeCat === c.key && !query;
              return (
                <div key={c.key}>
                  <button onClick={() => { setActiveCat(c.key); setQuery(""); }}
                    style={{
                      width: "100%", textAlign: "left", border: "none",
                      background: active ? "#37373D" : "transparent",
                      color: active ? "#FFFFFF" : "#CCCCCC",
                      padding: "6px 12px", cursor: "pointer",
                      display: "flex", alignItems: "center", gap: 8,
                      fontSize: 13, fontWeight: active ? 600 : 400,
                    }}
                    onMouseEnter={e => { if (!active) e.currentTarget.style.background = "#2A2D2E"; }}
                    onMouseLeave={e => { if (!active) e.currentTarget.style.background = "transparent"; }}
                  >
                    <c.Icon size={14} />
                    <span>{c.label}</span>
                  </button>
                  {active && c.sub && c.sub.map(sb => (
                    <div key={sb.key} style={{ padding: "4px 12px 4px 34px", fontSize: 12, color: "#858585" }}>
                      {sb.label}
                    </div>
                  ))}
                </div>
              );
            })}
          </div>

          {/* 우측 설정 패널 */}
          <div style={{
            flex: "1 1 0", overflowY: "auto", padding: "20px 28px",
            background: "#1E1E1E", minWidth: 0,
          }}>
            {!query && (
              <h2 style={{ fontSize: 22, fontWeight: 600, color: "#FFFFFF", margin: "0 0 18px" }}>
                {CATEGORIES.find(c => c.key === activeCat)?.label}
              </h2>
            )}
            {query && (
              <div style={{ fontSize: 13, color: "#858585", marginBottom: 14 }}>
                검색 결과: <b style={{ color: "#CCCCCC" }}>{visible.length}</b>건
              </div>
            )}
            {visible.length === 0 && (
              <div style={{ color: "#858585", fontSize: 13 }}>일치하는 설정이 없습니다.</div>
            )}
            {Object.entries(grouped).map(([gName, items]) => (
              <div key={gName} style={{ marginBottom: 24 }}>
                {gName !== "_" && (
                  <div style={{
                    fontSize: 11, fontWeight: 700, color: "#858585",
                    textTransform: "uppercase", letterSpacing: 0.5,
                    margin: "8px 0 12px",
                    borderBottom: "1px solid #3C3C3C", paddingBottom: 6,
                  }}>
                    {gName}
                  </div>
                )}
                {items.map(s => (
                  <SettingRow
                    key={s.key} s={s}
                    value={readCurrent(s)}
                    pending={s.key in pending}
                    onChange={(v) => onChange(s, v)}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>

        {/* 하단 버튼 바 */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "flex-end",
          gap: 8, padding: "10px 16px",
          background: "#252526", borderTop: "1px solid #3C3C3C",
          flex: "0 0 auto",
        }}>
          {hasPending && (
            <span style={{ fontSize: 11, color: "#858585", marginRight: "auto" }}>
              변경사항 {Object.keys(pending).length}개가 적용 대기 중입니다.
            </span>
          )}
          <button onClick={handleCancel}
            style={{
              padding: "6px 18px", fontSize: 12, fontWeight: 500,
              border: "1px solid #3C3C3C", borderRadius: 4,
              background: "transparent", color: "#CCCCCC", cursor: "pointer",
            }}
            onMouseEnter={e => e.currentTarget.style.background = "#3C3C3C"}
            onMouseLeave={e => e.currentTarget.style.background = "transparent"}
          >
            취소
          </button>
          <button onClick={handleOk}
            style={{
              padding: "6px 18px", fontSize: 12, fontWeight: 600,
              border: "1px solid #3C3C3C", borderRadius: 4,
              background: hasPending ? "#0e639c" : "#3C3C3C",
              color: "#FFFFFF", cursor: "pointer",
              transition: "background 0.15s",
            }}
            onMouseEnter={e => e.currentTarget.style.background = hasPending ? "#1177bb" : "#4C4C4C"}
            onMouseLeave={e => e.currentTarget.style.background = hasPending ? "#0e639c" : "#3C3C3C"}
          >
            확인
          </button>
          <button onClick={handleApply}
            disabled={!hasPending}
            style={{
              padding: "6px 18px", fontSize: 12, fontWeight: 600,
              border: "none", borderRadius: 4,
              background: hasPending ? "#007ACC" : "#3C3C3C",
              color: hasPending ? "#FFFFFF" : "#858585",
              cursor: hasPending ? "pointer" : "not-allowed",
              transition: "background 0.15s",
            }}
            onMouseEnter={e => { if (hasPending) e.currentTarget.style.background = "#1a8edb"; }}
            onMouseLeave={e => { if (hasPending) e.currentTarget.style.background = "#007ACC"; }}
          >
            적용
          </button>
        </div>
      </div>
    </div>
  );
}

function SettingRow({ s, value, pending: isPending, onChange }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: "#FFFFFF" }}>{s.label}</span>
        {isPending && (
          <span style={{
            width: 6, height: 6, borderRadius: "50%", background: "#007ACC",
            display: "inline-block", flexShrink: 0,
          }} title="적용 대기 중" />
        )}
      </div>
      {s.desc && s.type !== "info" && (
        <div style={{ fontSize: 12, color: "#9CA3AF", lineHeight: 1.55, marginBottom: 8 }}>
          {s.desc}
        </div>
      )}
      {s.type === "boolean" && (
        <label style={{ display: "inline-flex", alignItems: "center", gap: 8, cursor: "pointer", color: "#CCCCCC", fontSize: 13 }}>
          <input type="checkbox" checked={!!value} onChange={(e) => onChange(e.target.checked)}
            style={{ width: 14, height: 14, accentColor: "#007ACC", cursor: "pointer" }} />
          <span>{value ? "사용함" : "사용 안 함"}</span>
        </label>
      )}
      {s.type === "number" && (
        <input type="number" value={value} min={s.min} max={s.max}
          onChange={(e) => onChange(Number(e.target.value))}
          style={inputStyle(180)} />
      )}
      {s.type === "string" && (
        <input type="text" value={value}
          onChange={(e) => onChange(e.target.value)}
          style={inputStyle(420)} />
      )}
      {s.type === "select" && (
        <select value={value} onChange={(e) => onChange(e.target.value)} style={inputStyle(280)}>
          {s.options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      )}
      {s.type === "info" && (
        <div style={{
          fontSize: 12, color: "#CCCCCC", background: "#252526",
          border: "1px solid #3C3C3C", padding: "10px 14px", borderRadius: 4,
          fontFamily: "'JetBrains Mono',Consolas,monospace",
          whiteSpace: "pre-line", lineHeight: 1.9,
        }}>{s.desc}</div>
      )}
    </div>
  );
}

function inputStyle(w) {
  return {
    width: w, padding: "6px 10px",
    background: "#3C3C3C", border: "1px solid #3C3C3C", color: "#CCCCCC",
    borderRadius: 3, fontSize: 13, outline: "none",
  };
}
