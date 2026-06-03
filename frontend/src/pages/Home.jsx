import React, { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  Layers, MessageSquare, FlaskConical,
  ShieldCheck, TrendingUp, ArrowRight,
  BarChart3, Brain, Zap, Check,
} from "lucide-react";
import bannerVideo from "../assets/배너후보.mp4";
import { useLanguage } from "../i18n/LanguageContext";
import translations from "../i18n/translations";
import LoginRequiredModal from "../components/shell/LoginRequiredModal";

const BASE_FONT = "'Inter', 'Pretendard', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";

const REVEAL_THRESHOLD = 0.12;

function useReveal() {
  const ref  = useRef(null);
  const [on, setOn] = useState(false);
  useEffect(() => {
    const obs = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) { setOn(true); obs.disconnect(); } },
      { threshold: REVEAL_THRESHOLD }
    );
    if (ref.current) obs.observe(ref.current);
    return () => obs.disconnect();
  }, []);
  return [ref, on];
}

function Reveal({ children, delay = 0, y = 28, style = {} }) {
  const [ref, on] = useReveal();
  return (
    <div ref={ref} style={{
      ...style,
      opacity: on ? 1 : 0,
      transform: on ? "translateY(0)" : `translateY(${y}px)`,
      transition: `opacity 0.6s ease ${delay}ms, transform 0.6s ease ${delay}ms`,
    }}>
      {children}
    </div>
  );
}

/* ── 백테스트 미니 차트 ── */
function MiniBacktestChart() {
  const pts = [0,68, 40,62, 80,55, 120,58, 160,45, 200,38, 240,28, 280,20, 300,12];
  const path = pts.reduce((acc, v, i) => i % 2 === 0 ? acc + `${i === 0 ? "M" : "L"} ${v} ` : acc + `${v} `, "");
  const area = path + `L 300 80 L 0 80 Z`;
  return (
    <div style={{ padding: "14px 16px", borderRadius: 12, background: "#F8FAFF", border: "1px solid #DBEAFE" }}>
      <div style={{ fontSize: 10.5, fontWeight: 600, color: "#64748b", marginBottom: 10 }}>SPY · SMA Cross · 5년 백테스트</div>
      <svg width="100%" viewBox="0 0 300 80" style={{ display: "block", marginBottom: 10 }}>
        <defs>
          <linearGradient id="eq" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.18" />
            <stop offset="100%" stopColor="#3b82f6" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[20,40,60,80].map(y => <line key={y} x1="0" x2="300" y1={y} y2={y} stroke="#E2E8F0" strokeWidth="0.6" />)}
        <path d={area} fill="url(#eq)" />
        <path d={path} fill="none" stroke="#3b82f6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <div style={{ display: "flex", gap: 16 }}>
        {[["총 수익률", "+127.4%", "#10b981"], ["Sharpe", "1.82", "#3b82f6"], ["MDD", "-18.3%", "#ef4444"]].map(([label, val, color]) => (
          <div key={label}>
            <div style={{ fontSize: 10, color: "#94a3b8", marginBottom: 2 }}>{label}</div>
            <div style={{ fontSize: 15, fontWeight: 800, color }}>{val}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Trust Score 미니 게이지 ── */
function MiniTrustScore() {
  const score = 72;
  const r = 28, c = 2 * Math.PI * r;
  const offset = c - (score / 100) * c;
  const metrics = [
    { label: "일반화", val: 68, color: "#6366f1" },
    { label: "국면 견고성", val: 55, color: "#3b82f6" },
    { label: "파라미터 안정성", val: 88, color: "#10b981" },
    { label: "리스크 통제", val: 79, color: "#f59e0b" },
    { label: "통계 유의성", val: 62, color: "#ec4899" },
  ];
  return (
    <div style={{ padding: "14px 16px", borderRadius: 12, background: "#F8FAFF", border: "1px solid #D1FAE5" }}>
      <div style={{ fontSize: 10.5, fontWeight: 600, color: "#64748b", marginBottom: 12 }}>Trust Score 분석 결과</div>
      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        <div style={{ position: "relative", width: 72, height: 72, flexShrink: 0 }}>
          <svg width="72" height="72" viewBox="0 0 72 72">
            <circle cx="36" cy="36" r={r} stroke="#E2E8F0" strokeWidth="6" fill="none" />
            <circle cx="36" cy="36" r={r} stroke="#10b981" strokeWidth="6" fill="none"
              strokeDasharray={c} strokeDashoffset={offset} strokeLinecap="round"
              transform="rotate(-90 36 36)" style={{ transition: "stroke-dashoffset 0.6s" }} />
          </svg>
          <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
            <span style={{ fontSize: 18, fontWeight: 900, color: "#0f172a", lineHeight: 1 }}>{score}</span>
            <span style={{ fontSize: 9, color: "#94a3b8" }}>/ 100</span>
          </div>
        </div>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 5 }}>
          {metrics.map(m => (
            <div key={m.label}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "#64748b", marginBottom: 2 }}>
                <span>{m.label}</span><span style={{ fontWeight: 700, color: m.color }}>{m.val}</span>
              </div>
              <div style={{ height: 3, background: "#E2E8F0", borderRadius: 2 }}>
                <div style={{ width: `${m.val}%`, height: "100%", background: m.color, borderRadius: 2 }} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ── KIS 주문 카드 ── */
function MiniOrderCard() {
  return (
    <div style={{ padding: "14px 16px", borderRadius: 12, background: "#F8FAFF", border: "1px solid #FEF3C7" }}>
      <div style={{ fontSize: 10.5, fontWeight: 600, color: "#64748b", marginBottom: 10 }}>📧 주문 승인 요청 — 이메일 수신</div>
      <div style={{ background: "white", borderRadius: 10, border: "1px solid #E2E8F0", overflow: "hidden" }}>
        <div style={{ padding: "10px 14px", borderBottom: "1px solid #F1F5F9", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 800, color: "#0f172a" }}>삼성전자 <span style={{ fontSize: 10, color: "#64748b" }}>005930</span></div>
            <div style={{ fontSize: 11, color: "#64748b", marginTop: 1 }}>모의투자 · KIS OpenAPI</div>
          </div>
          <span style={{ padding: "3px 10px", borderRadius: 999, background: "#DBEAFE", color: "#1d4ed8", fontSize: 11, fontWeight: 700 }}>매수</span>
        </div>
        <div style={{ padding: "10px 14px", display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, borderBottom: "1px solid #F1F5F9" }}>
          {[["수량", "10주"], ["단가", "₩78,500"], ["총액", "₩785,000"]].map(([k, v]) => (
            <div key={k}>
              <div style={{ fontSize: 9, color: "#94a3b8", marginBottom: 2 }}>{k}</div>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#0f172a" }}>{v}</div>
            </div>
          ))}
        </div>
        <div style={{ padding: "10px 14px", display: "flex", gap: 8 }}>
          <button style={{ flex: 1, padding: "7px", borderRadius: 7, border: "none", background: "#10b981", color: "white", fontSize: 12, fontWeight: 700, cursor: "default" }}>✓ 승인</button>
          <button style={{ flex: 1, padding: "7px", borderRadius: 7, border: "1px solid #E2E8F0", background: "white", color: "#64748b", fontSize: 12, fontWeight: 600, cursor: "default" }}>✗ 거절</button>
        </div>
      </div>
    </div>
  );
}

const FLOW_STEPS = [
  { icon: <MessageSquare size={22} color="#818cf8" />, step: "01", title: "자연어로 전략 입력",  desc: '"SPY에 RSI 전략으로 투자하고 싶어" — AI가 전략 파라미터를 자동 구성합니다.' },
  { icon: <FlaskConical   size={22} color="#818cf8" />, step: "02", title: "백테스트 실행",       desc: "vectorbt 엔진으로 7가지 전략을 과거 데이터로 검증. 수수료·슬리피지까지 반영합니다." },
  { icon: <ShieldCheck    size={22} color="#818cf8" />, step: "03", title: "AI 신뢰도 분석",     desc: "Walk-Forward · Regime HMM · 파라미터 섭동으로 전략의 Trust Score를 산출합니다." },
  { icon: <TrendingUp     size={22} color="#818cf8" />, step: "04", title: "실주문 연결",         desc: "KIS OpenAPI로 모의투자 → 실거래까지 원클릭. Kill-Switch 안전장치가 항상 작동합니다." },
];

const STATS = [
  { value: "7+",      label: "백테스트 전략" },
  { value: "5-State", label: "Regime HMM 분석" },
  { value: "3단계",   label: "Trust Score 검증" },
  { value: "실시간",  label: "KIS 실거래 연동" },
];

const FEATURE_TABS = [
  {
    key: "ai", Icon: Brain, label: "멀티 LLM AI 대화",
    emoji: "🧠", color: "#6366f1", soft: "#EEF2FF",
    quotes: [
      { role: "user", text: "SPY에 RSI 전략으로 3년 투자하고 싶어" },
      { role: "ai",   text: "목표 설정 완료! RSI(14) 기반 전략으로 구성할게요 →" },
      { role: "user", text: "RSI 기간을 좀 더 줄여줘" },
    ],
    headline: "코딩 몰라도 됩니다. 말만 하세요.",
    body: "퀀트 투자는 원래 수학·코딩 전문가의 영역이었습니다. Alpha-Helix는 그 장벽을 없앴습니다. 'SPY에 RSI 전략으로 3년 투자하고 싶어'처럼 평소 말하듯 입력하면, AI가 투자 목표·기간·리스크 성향을 파악해 전략 파라미터를 자동으로 구성해 줍니다. 전략을 바꾸고 싶을 때도 'RSI 기간을 14로 줄여줘' 한 마디면 즉시 반영됩니다. 처음엔 어떤 전략을 골라야 할지 막막하더라도 괜찮습니다. AI가 먼저 질문을 던지며 당신의 투자 성향을 파악하고, 그에 맞는 전략을 함께 설계해 나갑니다.",
    points: [
      "자연어 → 전략 자동 구성 — 코드 한 줄 없이 파라미터까지 완성",
      "투자 목표 자동 파악 — 기간·초기자금·월 적립금·리스크 성향을 대화에서 추출",
      "Gemini · OpenAI · Anthropic · Perplexity 4개 AI 자동 폴백 — 한 곳이 느려도 끊김 없음",
      "대화 맥락 유지 — 앞서 나눈 이야기를 기억하고 전략을 단계적으로 다듬음",
    ],
  },
  {
    key: "backtest", Icon: BarChart3, label: "백테스트 엔진",
    emoji: "📊", color: "#3b82f6", soft: "#DBEAFE", Visual: MiniBacktestChart,
    headline: "\"이 전략, 과거에도 통했을까?\" — 수초 안에 확인",
    body: "백테스트란 내가 만든 전략을 과거 데이터에 적용해 '실제로 투자했다면 어땠을까'를 시뮬레이션하는 것입니다. Alpha-Helix는 최대 30년치 데이터를 수초 안에 돌려 총 수익률·최대 손실폭(MDD)·샤프 지수 등을 한눈에 보여줍니다. 수수료와 슬리피지(체결 미끄러짐)까지 반영해 현실적인 결과를 제공합니다. 특히 MDD(최대 낙폭)는 '내가 가장 운 나쁜 타이밍에 투자했다면 얼마나 잃었을까'를 보여주는 지표로, 전략의 위험성을 직관적으로 파악하는 데 핵심적인 역할을 합니다.",
    points: [
      "7가지 전략 지원 — SMA Cross · RSI · MACD · Momentum · VIX Risk-off · 무한매수법 · Buy & Hold",
      "MDD(최대 손실폭) 표시 — '최악의 경우 얼마나 잃을 수 있는지' 미리 확인",
      "수수료 0.25% + 슬리피지 0.1% 자동 반영 — 현실과 가장 가까운 시뮬레이션",
      "QuantStats 리포트 자동 생성 — 전문 투자자 수준의 성과 분석서를 한 번에",
    ],
  },
  {
    key: "trust", Icon: ShieldCheck, label: "Trust Score",
    emoji: "🛡️", color: "#10b981", soft: "#D1FAE5", Visual: MiniTrustScore,
    headline: "백테스트 수익률이 높아도 믿으면 안 되는 이유",
    body: "백테스트 수익률이 높다고 해서 실전에서도 잘 된다는 보장은 없습니다. 과거 데이터에 지나치게 맞춰진 전략(과적합)은 실전에서 오히려 큰 손실을 낼 수 있습니다. Trust Score는 '이 전략이 미래에도 통할 가능성이 얼마나 되는지'를 0~100점으로 채점합니다. 예를 들어 상승장에서만 잘 되는 전략인지, 하락장이 와도 버텨낼 수 있는 전략인지를 5가지 시장 환경으로 나눠 검증합니다. 점수가 낮다면 전략을 더 다듬어야 한다는 신호이고, 높다면 실전 투자를 고려할 준비가 된 것입니다.",
    points: [
      "과적합 자동 탐지 — 과거에만 잘 맞춰진 전략인지 미래 구간으로 검증",
      "5가지 시장 국면 분석 — 상승장·하락장·횡보장 등 다양한 환경에서의 성과를 따로 평가",
      "파라미터 민감도 검사 — 설정값을 조금만 바꿔도 결과가 크게 달라지면 위험 신호",
      "0~100점 종합 신뢰도 — 강점·보완점·현재 국면 조언까지 한 화면에 정리",
    ],
  },
  {
    key: "kis", Icon: Zap, label: "KIS 실주문 자동화",
    emoji: "⚡", color: "#f59e0b", soft: "#FEF3C7", Visual: MiniOrderCard,
    headline: "검증 끝난 전략, 이제 실제 시장에 연결하세요",
    body: "전략이 충분히 검증됐다면 한국투자증권(KIS) OpenAPI를 통해 실제 주문을 자동화할 수 있습니다. 처음에는 가상 돈으로 연습하는 '모의투자'로 시작하고, 준비가 됐을 때만 실거래로 전환할 수 있도록 여러 단계의 안전장치가 설계되어 있습니다. 실수로 주문이 나가는 일은 절대 없습니다. 주문이 발생할 때마다 이메일로 승인 링크가 전송되며, 본인이 직접 확인하고 승인해야만 실제 매매가 이루어집니다. 시장이 급변하는 상황에서는 Kill-Switch 하나로 모든 자동 주문을 즉시 멈출 수도 있습니다.",
    points: [
      "모의투자 → 실거래 명시적 전환 — 본인이 직접 승인해야만 실주문 가능",
      "이메일 승인 링크 — 주문 전 본인 확인 단계를 거쳐 실수 주문 원천 차단",
      "긴급 Kill-Switch — 시장 이상 감지 시 모든 실주문을 즉시 중단하는 안전장치",
      "API 키 암호화 저장 — 증권사 로그인 정보를 서버에 안전하게 보관",
    ],
  },
];

const PROJECTS_TAGS = [
  ["#SMA Cross", "#백테스트", "#KIS"],
  ["#RSI", "#TrustScore", "#Regime"],
  ["#MACD", "#무한매수법", "#AI전략"],
];

export default function Home() {
  const navigate  = useNavigate();
  const { t, lang } = useLanguage();
  const videoRef  = useRef(null);
  const [hoveredProject, setHoveredProject] = useState(null);
  const [activeTab, setActiveTab] = useState("ai");
  const [showLogin, setShowLogin] = useState(false);
  const [newWsOpen, setNewWsOpen]  = useState(false);
  const [newWsName, setNewWsName]  = useState("");

  const isAuthed = !!localStorage.getItem("dbId");
  const tr = translations[lang]?.home || translations.en.home;
  const projects = tr.projectSection.projects;
  const activeFeature = FEATURE_TABS.find(f => f.key === activeTab);

  useEffect(() => {
    if (videoRef.current) videoRef.current.playbackRate = 0.55;
  }, []);

  const handleBriefing    = () => { if (!isAuthed) { setShowLogin(true); return; } navigate("/workhome"); };
  const handleNewStrategy = () => { if (!isAuthed) { setShowLogin(true); return; } setNewWsName(""); setNewWsOpen(true); };
  const confirmNewWs      = () => { if (!newWsName.trim()) return; setNewWsOpen(false); navigate(`/alpha?new=${encodeURIComponent(newWsName.trim())}`); };

  return (
    <>
    <div style={{ minHeight: "100vh", backgroundColor: "#fff", fontFamily: BASE_FONT }}>

      {/* ── HERO ── */}
      <section style={{ position: "relative", width: "100%", height: 580, overflow: "hidden" }}>
        <video
          ref={videoRef} src={bannerVideo} autoPlay loop muted playsInline
          style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "center", display: "block" }}
        />
        {/* 다크 그라데이션 */}
        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(160deg, rgba(10,15,30,0.35) 0%, rgba(10,15,30,0.50) 100%)" }} />
        {/* 미묘한 도트 그리드 오버레이 */}
        <div style={{
          position: "absolute", inset: 0,
          backgroundImage: "radial-gradient(circle, rgba(255,255,255,0.06) 1px, transparent 1px)",
          backgroundSize: "36px 36px",
        }} />

        <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "0 20px" }}>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", maxWidth: 680 }}>

            {/* 상단 태그 */}
            <div style={{
              display: "inline-flex", alignItems: "center", gap: 8, marginBottom: 24,
              background: "rgba(255,255,255,0.08)", backdropFilter: "blur(12px)",
              border: "1px solid rgba(255,255,255,0.15)", borderRadius: 999,
              padding: "6px 18px",
            }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#818cf8", flexShrink: 0 }} />
              <span style={{ fontSize: 12, color: "rgba(255,255,255,0.85)", fontWeight: 600, letterSpacing: 0.4 }}>AI 기반 퀀트 투자 워크스페이스</span>
            </div>

            <h1 style={{ fontSize: 48, fontWeight: 900, color: "white", lineHeight: 1.2, marginBottom: 20, textShadow: "0 2px 24px rgba(0,0,0,0.5)", fontFamily: BASE_FONT }}>
              {isAuthed
                ? <>{t("home.clientHeroTitle1")}<br />{t("home.clientHeroTitle2")}</>
                : <>{t("home.heroTitle1")}<br />{t("home.heroTitle2")}</>
              }
            </h1>

            {/* 서브타이틀 — 글라스 pill */}
            <div style={{
              background: "rgba(255,255,255,0.07)", backdropFilter: "blur(14px)",
              border: "1px solid rgba(255,255,255,0.12)", borderRadius: 12,
              padding: "14px 28px", marginBottom: 32,
            }}>
              <p style={{ fontSize: 15, color: "rgba(255,255,255,0.82)", fontFamily: BASE_FONT, fontWeight: 400, margin: 0, lineHeight: 1.7 }}>
                자연어 프롬프트 한 줄로 전략 구성부터<br />백테스트, 실주문까지 한 흐름으로 연결됩니다.
              </p>
            </div>

            <div style={{ display: "flex", gap: 12 }}>
              <button onClick={handleBriefing} style={{
                padding: "13px 30px", borderRadius: 9, border: "none",
                background: "linear-gradient(135deg, #6366f1, #4f46e5)",
                color: "white", fontWeight: 700, fontSize: 15, cursor: "pointer",
                fontFamily: BASE_FONT, boxShadow: "0 4px 18px rgba(99,102,241,0.45)",
                transition: "transform 0.15s, opacity 0.15s",
              }}
                onMouseEnter={e => { e.currentTarget.style.opacity = "0.9"; e.currentTarget.style.transform = "translateY(-1px)"; }}
                onMouseLeave={e => { e.currentTarget.style.opacity = "1"; e.currentTarget.style.transform = "none"; }}
              >
                {isAuthed ? t("home.clientBtnFind") : t("home.btnUpgrade")}
              </button>
              <button onClick={handleNewStrategy} style={{
                padding: "13px 30px", borderRadius: 9,
                border: "1px solid rgba(255,255,255,0.3)",
                background: "rgba(255,255,255,0.08)", backdropFilter: "blur(10px)",
                color: "white", fontWeight: 600, fontSize: 15, cursor: "pointer",
                fontFamily: BASE_FONT, transition: "transform 0.15s, background 0.15s",
              }}
                onMouseEnter={e => { e.currentTarget.style.background = "rgba(255,255,255,0.16)"; e.currentTarget.style.transform = "translateY(-1px)"; }}
                onMouseLeave={e => { e.currentTarget.style.background = "rgba(255,255,255,0.08)"; e.currentTarget.style.transform = "none"; }}
              >
                {t("home.clientBtnRegister")}
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* ── HOW IT WORKS ── */}
      <section style={{
        background: "#F0F9FF",
        backgroundImage: "linear-gradient(rgba(99,102,241,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(99,102,241,0.04) 1px, transparent 1px)",
        backgroundSize: "48px 48px",
        padding: "80px 20px",
      }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <Reveal>
          <div style={{ textAlign: "center", marginBottom: 56 }}>
            <p style={{ fontSize: 11, fontWeight: 700, color: "#6366f1", letterSpacing: 2, textTransform: "uppercase", marginBottom: 12 }}>How it works</p>
            <h2 style={{ fontSize: 30, fontWeight: 800, color: "#0f172a", margin: "0 0 12px", fontFamily: BASE_FONT }}>네 단계로 완성되는 퀀트 투자</h2>
            <p style={{ fontSize: 14, color: "#475569", maxWidth: 420, margin: "0 auto", lineHeight: 1.8 }}>
              복잡한 코딩 없이, 자연어 한 줄로 전문가 수준의<br />퀀트 전략을 구성하고 실행하세요.
            </p>
          </div>
          </Reveal>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16 }}>
            {FLOW_STEPS.map((s, i) => (
              <Reveal key={i} delay={i * 100} style={{ height: "100%" }}>
              <div style={{ position: "relative", height: "100%" }}>
                {i < FLOW_STEPS.length - 1 && (
                  <div style={{
                    position: "absolute", top: 28, right: -12, zIndex: 1,
                    width: 24, display: "flex", alignItems: "center",
                  }}>
                    <div style={{ flex: 1, height: 1, background: "rgba(99,102,241,0.25)" }} />
                    <div style={{ width: 4, height: 4, borderRadius: "50%", background: "#6366f1", flexShrink: 0 }} />
                  </div>
                )}
                <div style={{
                  background: "white",
                  border: "1px solid #E2E8F0",
                  borderRadius: 14, padding: "28px 22px",
                  height: "100%", boxSizing: "border-box",
                  boxShadow: "0 2px 12px rgba(99,102,241,0.06)",
                }}>
                  <div style={{
                    width: 48, height: 48, borderRadius: 12, marginBottom: 18,
                    background: "#EEF2FF", border: "1px solid #C7D2FE",
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}>
                    {s.icon}
                  </div>
                  <div style={{ fontSize: 10, fontWeight: 700, color: "#94a3b8", letterSpacing: 2, marginBottom: 8, fontFamily: BASE_FONT }}>STEP {s.step}</div>
                  <h3 style={{ fontSize: 14, fontWeight: 700, color: "#0f172a", marginBottom: 10, fontFamily: BASE_FONT, lineHeight: 1.4 }}>{s.title}</h3>
                  <p style={{ fontSize: 13, color: "#64748b", lineHeight: 1.75, margin: 0 }}>{s.desc}</p>
                </div>
              </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── STATS BAR ── */}
      <section style={{
        background: "linear-gradient(90deg, #1e3a8a 0%, #1e1b4b 50%, #1e3a8a 100%)",
        borderTop: "1px solid rgba(99,102,241,0.3)",
        borderBottom: "1px solid rgba(99,102,241,0.3)",
        padding: "44px 20px",
      }}>
        <div style={{ maxWidth: 860, margin: "0 auto", display: "grid", gridTemplateColumns: "repeat(4, 1fr)" }}>
          {STATS.map((s, i) => (
            <div key={i} style={{
              textAlign: "center",
              borderRight: i < STATS.length - 1 ? "1px solid rgba(255,255,255,0.1)" : "none",
              padding: "0 20px",
            }}>
              <Reveal delay={i * 80} y={18}>
                <div style={{ fontSize: 34, fontWeight: 900, color: "white", fontFamily: BASE_FONT, lineHeight: 1 }}>{s.value}</div>
                <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", marginTop: 8, letterSpacing: 0.3 }}>{s.label}</div>
              </Reveal>
            </div>
          ))}
        </div>
      </section>

      {/* ── FEATURES (탭) ── */}
      <section style={{ padding: "88px 20px", background: "#F8FAFC" }}>
        <div style={{ maxWidth: 1000, margin: "0 auto" }}>
          <Reveal>
          <div style={{ textAlign: "center", marginBottom: 52 }}>
            <p style={{ fontSize: 11, fontWeight: 700, color: "#6366f1", letterSpacing: 2, textTransform: "uppercase", marginBottom: 12 }}>Features</p>
            <h2 style={{ fontSize: 30, fontWeight: 800, color: "#0f172a", margin: "0 0 12px", fontFamily: BASE_FONT }}>Alpha-Helix가 특별한 이유</h2>
            <p style={{ fontSize: 14, color: "#64748b", maxWidth: 420, margin: "0 auto", lineHeight: 1.8 }}>
              AI 대화부터 실주문까지, 퀀트 투자의 전 과정을 하나의 워크스페이스에서.
            </p>
          </div>
          </Reveal>

          {/* 탭 바 */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", borderBottom: "1.5px solid #E2E8F0", marginBottom: 0 }}>
            {FEATURE_TABS.map(f => {
              const isActive = activeTab === f.key;
              return (
              <button key={f.key} onClick={() => setActiveTab(f.key)} style={{
                display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                padding: "13px 12px",
                border: "none",
                background: isActive
                  ? "linear-gradient(135deg, #DBEAFE 0%, #E0E7FF 50%, #EDE9FE 100%)"
                  : "none",
                fontSize: 16, fontWeight: isActive ? 700 : 500,
                color: isActive ? "#4f46e5" : "#64748b",
                cursor: "pointer", fontFamily: BASE_FONT,
                borderBottom: isActive ? "2px solid #818cf8" : "2px solid transparent",
                borderTopLeftRadius: 8, borderTopRightRadius: 8,
                marginBottom: -1.5, transition: "color 0.15s, background 0.2s", whiteSpace: "nowrap",
              }}
                onMouseEnter={e => { if (!isActive) e.currentTarget.style.color = "#374151"; }}
                onMouseLeave={e => { if (!isActive) e.currentTarget.style.color = "#64748b"; }}
              >
                <f.Icon size={17} />
                {f.label}
              </button>
              );
            })}
          </div>

          {/* 탭 콘텐츠 */}
          {activeFeature && (
            <div style={{
              background: "white",
              border: "1.5px solid #E2E8F0", borderTop: "none",
              borderRadius: "0 0 16px 16px",
              overflow: "hidden",
              boxShadow: "0 8px 32px rgba(0,0,0,0.06)",
            }}>
              {/* 상단 컬러 accent bar */}
              <div style={{ height: 4, background: `linear-gradient(90deg, ${activeFeature.color}, ${activeFeature.color}88)` }} />

              <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)", gap: 0 }}>
                {/* 왼쪽: 설명 */}
                <div style={{ padding: "36px 32px", borderRight: "1px solid #F1F5F9" }}>
                  {/* 기능 태그 */}
                  <div style={{
                    display: "inline-flex", alignItems: "center", gap: 6, marginBottom: 16,
                    padding: "5px 12px", borderRadius: 999,
                    background: activeFeature.soft,
                    fontSize: 12, fontWeight: 700, color: activeFeature.color,
                  }}>
                    <span>{activeFeature.emoji}</span>
                    {activeFeature.label}
                  </div>

                  <h3 style={{
                    fontSize: 20, fontWeight: 800, lineHeight: 1.4, marginBottom: 16,
                    fontFamily: BASE_FONT, color: "#0f172a",
                  }}>
                    {activeFeature.headline}
                  </h3>

                  {/* 구분선 */}
                  <div style={{ width: 36, height: 3, borderRadius: 2, background: activeFeature.color, marginBottom: 16 }} />

                  {/* 말풍선 예시 */}
                  {activeFeature.quotes && (
                    <div style={{
                      marginBottom: 18, padding: "14px 16px", borderRadius: 12,
                      background: "#F8FAFF", border: "1px solid #E2E8F0",
                      display: "flex", flexDirection: "column", gap: 8,
                    }}>
                      {activeFeature.quotes.map((q, i) => (
                        <div key={i} style={{
                          display: "flex",
                          justifyContent: q.role === "user" ? "flex-end" : "flex-start",
                        }}>
                          <div style={{
                            maxWidth: "80%", padding: "7px 12px", borderRadius: q.role === "user" ? "12px 12px 2px 12px" : "12px 12px 12px 2px",
                            background: q.role === "user" ? activeFeature.color : "white",
                            border: q.role === "ai" ? `1px solid ${activeFeature.soft}` : "none",
                            color: q.role === "user" ? "white" : "#334155",
                            fontSize: 12.5, fontWeight: q.role === "user" ? 600 : 500,
                            lineHeight: 1.5,
                            boxShadow: "0 1px 4px rgba(0,0,0,0.07)",
                          }}>
                            {q.role === "ai" && <span style={{ fontSize: 10, fontWeight: 700, color: activeFeature.color, display: "block", marginBottom: 2 }}>Heli AI</span>}
                            {q.text}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {activeFeature.Visual && (
                    <div style={{ marginBottom: 16 }}>
                      <activeFeature.Visual />
                    </div>
                  )}

                  <p style={{ fontSize: 13.5, color: "#475569", lineHeight: 1.9, margin: 0 }}>
                    {activeFeature.body}
                  </p>
                </div>

                {/* 오른쪽: 포인트 */}
                <div style={{ padding: "36px 32px", background: "#FAFBFF", display: "flex", flexDirection: "column", gap: 12, justifyContent: "center" }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>
                    주요 기능
                  </div>
                  {activeFeature.points.map((pt, i) => {
                    const [title, ...rest] = pt.split(" — ");
                    const desc = rest.join(" — ");
                    return (
                      <div key={i} style={{
                        display: "flex", alignItems: "flex-start", gap: 12,
                        padding: "12px 14px", borderRadius: 10,
                        background: "white", border: "1px solid #E2E8F0",
                        boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
                      }}>
                        <div style={{
                          width: 22, height: 22, borderRadius: 6, flexShrink: 0,
                          background: activeFeature.soft,
                          display: "flex", alignItems: "center", justifyContent: "center",
                          fontSize: 11, fontWeight: 800, color: activeFeature.color, marginTop: 1,
                        }}>
                          {i + 1}
                        </div>
                        <div>
                          {desc ? (
                            <>
                              <div style={{ fontSize: 12.5, fontWeight: 700, color: "#0f172a", lineHeight: 1.4 }}>{title}</div>
                              <div style={{ fontSize: 12, color: "#64748b", lineHeight: 1.6, marginTop: 2 }}>{desc}</div>
                            </>
                          ) : (
                            <div style={{ fontSize: 12.5, color: "#1e293b", lineHeight: 1.6 }}>{pt}</div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* ── 전략 템플릿 ── */}
      <section style={{ padding: "80px 20px", background: "white" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <Reveal>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 40 }}>
            <div>
              <p style={{ fontSize: 11, fontWeight: 700, color: "#6366f1", letterSpacing: 2, textTransform: "uppercase", marginBottom: 10 }}>Templates</p>
              <h2 style={{ fontSize: 28, fontWeight: 800, color: "#0f172a", margin: "0 0 8px", fontFamily: BASE_FONT }}>검증된 전략 템플릿</h2>
              <p style={{ fontSize: 14, color: "#64748b", margin: 0 }}>바로 쓸 수 있는 퀀트 전략으로 빠르게 시작하세요.</p>
            </div>
            <button onClick={() => navigate("/alpha?lib=1")} style={{
              display: "flex", alignItems: "center", gap: 6,
              padding: "9px 18px", borderRadius: 8,
              border: "1.5px solid #E2E8F0", background: "white",
              color: "#374151", fontSize: 13, fontWeight: 600,
              cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0,
              transition: "border-color 0.15s, color 0.15s",
            }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = "#6366f1"; e.currentTarget.style.color = "#4f46e5"; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = "#E2E8F0"; e.currentTarget.style.color = "#374151"; }}
            >
              전체 보기 <ArrowRight size={13} />
            </button>
          </div>
          </Reveal>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 24 }}>
            {projects.map((proj, i) => (
              <Reveal key={i} delay={i * 100}>
              <div onClick={() => navigate("/alpha?lib=1")} style={{
                borderRadius: 14, overflow: "hidden",
                border: hoveredProject === i ? "1.5px solid #c7d2fe" : "1.5px solid #F1F5F9",
                backgroundColor: "white", cursor: "pointer",
                transform: hoveredProject === i ? "translateY(-4px)" : "translateY(0)",
                boxShadow: hoveredProject === i ? "0 16px 40px rgba(99,102,241,0.12)" : "0 2px 8px rgba(0,0,0,0.05)",
                transition: "all 0.2s",
              }}
                onMouseEnter={() => setHoveredProject(i)}
                onMouseLeave={() => setHoveredProject(null)}
              >
                <div style={{ padding: "18px 20px 22px" }}>
                  <h3 style={{ fontSize: 14, fontWeight: 700, color: "#111827", marginBottom: 8, fontFamily: BASE_FONT, lineHeight: 1.4 }}>{proj.title}</h3>
                  <p style={{ fontSize: 13, color: "#6B7280", lineHeight: 1.75, marginBottom: 14 }}>{proj.desc}</p>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {[...proj.badge.split(" "), ...PROJECTS_TAGS[i]].map(tag => (
                      <span key={tag} style={{
                        fontSize: 11, color: "#4f46e5", fontWeight: 600,
                        background: "#EEF2FF", borderRadius: 4, padding: "2px 8px",
                      }}>{tag}</span>
                    ))}
                  </div>
                </div>
              </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section style={{
        background: "#080d18",
        backgroundImage: "radial-gradient(ellipse 80% 50% at 50% 100%, rgba(99,102,241,0.15) 0%, transparent 70%)",
        padding: "96px 20px", textAlign: "center",
        borderTop: "1px solid rgba(255,255,255,0.05)",
      }}>
        <div style={{ maxWidth: 560, margin: "0 auto" }}>
          <Reveal>
          <h2 style={{ fontSize: 32, fontWeight: 800, color: "white", lineHeight: 1.3, marginBottom: 14, fontFamily: BASE_FONT }}>
            첫 번째 전략을 지금 만들어보세요
          </h2>
          <p style={{ fontSize: 14, color: "#4b5563", lineHeight: 1.8, marginBottom: 36 }}>
            복잡한 코드 없이도 됩니다. AI에게 원하는 전략을 말하면,<br />백테스트부터 실주문까지 Alpha-Helix가 함께합니다.
          </p>
          <button onClick={handleNewStrategy} style={{
            padding: "14px 36px", borderRadius: 10, border: "none",
            background: "linear-gradient(135deg, #6366f1, #4f46e5)",
            color: "white", fontWeight: 700, fontSize: 15,
            cursor: "pointer", fontFamily: BASE_FONT,
            boxShadow: "0 4px 20px rgba(99,102,241,0.4)",
            transition: "transform 0.15s, opacity 0.15s",
          }}
            onMouseEnter={e => { e.currentTarget.style.opacity = "0.9"; e.currentTarget.style.transform = "translateY(-1px)"; }}
            onMouseLeave={e => { e.currentTarget.style.opacity = "1"; e.currentTarget.style.transform = "none"; }}
          >
            전략 만들기 시작 →
          </button>
          </Reveal>
        </div>
      </section>

    </div>

    <LoginRequiredModal open={showLogin} onClose={() => setShowLogin(false)} />

    {newWsOpen && (
      <div onClick={() => setNewWsOpen(false)} style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 3000,
        display: "flex", alignItems: "center", justifyContent: "center", padding: 24,
        backdropFilter: "blur(4px)",
      }}>
        <div onClick={e => e.stopPropagation()} style={{
          background: "white", borderRadius: 20, width: "100%", maxWidth: 440,
          boxShadow: "0 24px 64px rgba(0,0,0,0.3)", overflow: "hidden",
        }}>
          <div style={{
            padding: "24px 28px 20px",
            background: "linear-gradient(135deg,#eff6ff 0%,#e0e7ff 100%)",
            borderBottom: "1px solid #E2E8F0",
            display: "flex", alignItems: "center", gap: 14,
          }}>
            <div style={{
              width: 44, height: 44, borderRadius: 12, flexShrink: 0,
              background: "linear-gradient(135deg,#6366f1,#4f46e5)",
              display: "flex", alignItems: "center", justifyContent: "center",
              boxShadow: "0 4px 12px rgba(99,102,241,0.3)",
            }}>
              <Layers size={20} color="white" />
            </div>
            <div>
              <h2 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: "#1e3a8a" }}>새 전략 만들기</h2>
              <p style={{ margin: "3px 0 0", fontSize: 12, color: "#475569" }}>전략 이름을 입력하고 AI와 대화를 시작하세요</p>
            </div>
          </div>
          <div style={{ padding: "24px 28px" }}>
            <label style={{ fontSize: 12, fontWeight: 700, color: "#374151", display: "block", marginBottom: 8 }}>전략 이름</label>
            <input
              autoFocus value={newWsName}
              onChange={e => setNewWsName(e.target.value)}
              onKeyDown={e => { if (e.nativeEvent.isComposing) return; if (e.key === "Enter") confirmNewWs(); if (e.key === "Escape") setNewWsOpen(false); }}
              placeholder="예: 미국 배당 성장 전략"
              style={{
                width: "100%", padding: "12px 14px", borderRadius: 10,
                border: "1.5px solid #C7D2FE", fontSize: 14, outline: "none",
                boxSizing: "border-box", color: "#0F172A", transition: "border-color 0.15s",
              }}
              onFocus={e => e.target.style.borderColor = "#6366f1"}
              onBlur={e => e.target.style.borderColor = "#C7D2FE"}
            />
          </div>
          <div style={{ padding: "0 28px 24px", display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button onClick={() => setNewWsOpen(false)} style={{
              padding: "10px 20px", borderRadius: 9,
              border: "1px solid #E2E8F0", background: "white", color: "#374151",
              fontSize: 13, fontWeight: 600, cursor: "pointer",
            }}>취소</button>
            <button onClick={confirmNewWs} disabled={!newWsName.trim()} style={{
              padding: "10px 20px", borderRadius: 9, border: "none",
              background: newWsName.trim() ? "linear-gradient(135deg,#6366f1,#4f46e5)" : "#E2E8F0",
              color: newWsName.trim() ? "white" : "#94A3B8",
              fontSize: 13, fontWeight: 700,
              cursor: newWsName.trim() ? "pointer" : "not-allowed",
              boxShadow: newWsName.trim() ? "0 3px 10px rgba(99,102,241,0.3)" : "none",
            }}>전략 생성하기</button>
          </div>
        </div>
      </div>
    )}
    </>
  );
}
