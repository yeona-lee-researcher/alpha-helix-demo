import { useEffect, useState, useCallback } from "react";
import {
  X, Crown, Check, Zap, TrendingUp, Code2, Infinity,
  Bot, Wallet, ShieldCheck, Star,
} from "lucide-react";
import { fetchSubscription } from "../../lib/aiClient";

const FONT = "'Pretendard','Inter',-apple-system,sans-serif";

/* ─────────────────────── 플랜 정의 ─────────────────────── */
const PLANS = [
  {
    id: "FREE",
    name: "Free",
    badge: null,
    price: 0,
    free: true,
    desc: "무료로 AI 투자 분석을 시작하세요",
    color: "#64748B",
    grad: "linear-gradient(135deg,#F8FAFC,#F1F5F9)",
    border: "#CBD5E1",
    features: [
      { icon: <Bot size={14}/>,      text: "Gemini 2.5 Flash (200k tok/월)", highlight: true },
      { icon: <Bot size={14}/>,      text: "GPT-4o mini (100k tok/월)", highlight: true },
      { icon: <TrendingUp size={14}/>, text: "전략 백테스트 무제한" },
      { icon: <Star size={14}/>,     text: "Regime · Trust Score 기본 분석" },
      { icon: <ShieldCheck size={14}/>, text: "AI 토큰 200,000 tok / 월" },
    ],
    limit: "토큰 200k / 월",
  },
  {
    id: "STANDARD",
    name: "Standard",
    badge: null,
    price: 9900,
    desc: "계좌 연동 & 자동 매매를 시작하는 첫 걸음",
    color: "#3B82F6",
    grad: "linear-gradient(135deg,#DBEAFE,#EFF6FF)",
    border: "#93C5FD",
    features: [
      { icon: <Wallet size={14}/>, text: "증권 계좌 연동 (1개)", highlight: true },
      { icon: <Zap size={14}/>,    text: "자동 매수 / 매도 활성화", highlight: true },
      { icon: <TrendingUp size={14}/>, text: "전략 백테스트 무제한" },
      { icon: <Bot size={14}/>,    text: "AI 모델 기본 4종 (Flash, mini 등)" },
      { icon: <ShieldCheck size={14}/>, text: "AI 토큰 500,000 tok / 월" },
      { icon: <Star size={14}/>,   text: "Regime · Trust · Briefing 분석" },
    ],
    limit: "토큰 500k / 월",
  },
  {
    id: "PREMIUM",
    name: "Premium",
    badge: "인기",
    price: 19900,
    desc: "무제한 AI와 고급 모델로 전략을 완성하세요",
    color: "#6366F1",
    grad: "linear-gradient(135deg,#EDE9FE,#F0F9FF)",
    border: "#A5B4FC",
    features: [
      { icon: <Wallet size={14}/>, text: "증권 계좌 연동 (3개)", highlight: true },
      { icon: <Zap size={14}/>,    text: "자동 매수 / 매도 활성화", highlight: true },
      { icon: <Infinity size={14}/>, text: "AI 토큰 무제한", highlight: true },
      { icon: <Bot size={14}/>,    text: "GPT-4o · Claude Sonnet 4 · Gemini 2.5 Pro 포함" },
      { icon: <TrendingUp size={14}/>, text: "전략 백테스트 무제한" },
      { icon: <Star size={14}/>,   text: "Regime · Trust · Briefing 분석" },
      { icon: <ShieldCheck size={14}/>, text: "우선 고객 지원" },
    ],
    limit: "토큰 무제한",
  },
  {
    id: "EXPERT",
    name: "Expert",
    badge: "출시 예정",
    price: 39900,
    desc: "퀀트 개발자를 위한 코딩 전용 탭과 최상위 모델",
    color: "#7C3AED",
    grad: "linear-gradient(135deg,#F5F3FF,#EDE9FE)",
    border: "#C4B5FD",
    comingSoon: true,
    features: [
      { icon: <Code2 size={14}/>,  text: "개발자 전용 퀀트 코딩 탭 (Python)", highlight: true },
      { icon: <Wallet size={14}/>, text: "증권 계좌 연동 무제한", highlight: true },
      { icon: <Zap size={14}/>,    text: "자동 매수 / 매도 활성화", highlight: true },
      { icon: <Infinity size={14}/>, text: "AI 토큰 무제한", highlight: true },
      { icon: <Bot size={14}/>,    text: "Claude Opus 4 · GPT-4o · Gemini 2.5 Pro 포함" },
      { icon: <TrendingUp size={14}/>, text: "전략 백테스트 + 커스텀 팩터 라이브러리" },
      { icon: <ShieldCheck size={14}/>, text: "전담 기술 지원 + 베타 기능 우선 접근" },
    ],
    limit: "토큰 무제한",
  },
];

/* ─────────────────────── 유틸 ─────────────────────── */
function priceLabel(p) {
  return "₩" + p.toLocaleString("ko-KR");
}

/* ─────────────────────── 서브 컴포넌트 ─────────────────────── */
function PlanCard({ plan, isCurrent, onSelect, busy }) {
  const [hover, setHover] = useState(false);

  const btnLabel = plan.comingSoon
    ? "출시 알림 받기"
    : isCurrent
      ? plan.free ? "현재 플랜" : "현재 구독 중"
      : plan.free ? "무료로 시작"
      : `${plan.name} 시작하기`;

  const btnStyle = {
    width: "100%",
    padding: "11px 0",
    borderRadius: 10,
    border: "none",
    fontFamily: FONT,
    fontWeight: 700,
    fontSize: 14,
    cursor: plan.comingSoon || isCurrent || plan.free ? "default" : "pointer",
    transition: "opacity 0.15s",
    opacity: busy ? 0.7 : 1,
    background: isCurrent
      ? plan.free ? "#F1F5F9" : "#E0F2FE"
      : plan.comingSoon
        ? "#F3F4F6"
        : plan.free
          ? "#F1F5F9"
          : `linear-gradient(135deg, ${plan.color}, ${plan.id === "PREMIUM" ? "#8B5CF6" : plan.color + "CC"})`,
    color: isCurrent
      ? plan.free ? "#64748B" : "#0369A1"
      : plan.comingSoon || plan.free ? "#9CA3AF" : "white",
  };

  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        background: plan.grad,
        border: `2px solid ${isCurrent || hover ? plan.color : plan.border}`,
        borderRadius: 16,
        padding: "24px 20px",
        display: "flex",
        flexDirection: "column",
        gap: 0,
        transition: "border-color 0.15s, box-shadow 0.15s",
        boxShadow: hover && !plan.comingSoon ? `0 8px 24px ${plan.color}22` : "none",
        position: "relative",
        flex: 1,
        minWidth: 0,
      }}
    >
      {/* 배지 — 오버레이보다 위에 (zIndex 4) */}
      {plan.badge && (
        <span style={{
          position: "absolute", top: -13, left: "50%", transform: "translateX(-50%)",
          background: plan.comingSoon
            ? "linear-gradient(135deg,#9CA3AF,#6B7280)"
            : "linear-gradient(135deg,#F59E0B,#EF4444)",
          color: "white", fontSize: 10, fontWeight: 800,
          padding: "3px 10px", borderRadius: 999, whiteSpace: "nowrap",
          fontFamily: FONT, letterSpacing: 0.3,
          zIndex: 4,
        }}>
          {plan.badge}
        </span>
      )}

      {/* 현재 구독 표시 */}
      {isCurrent && (
        <span style={{
          position: "absolute", top: 12, right: 12,
          background: "#0EA5E9", color: "white",
          fontSize: 10, fontWeight: 800,
          padding: "2px 8px", borderRadius: 999, fontFamily: FONT,
        }}>
          ✓ 구독 중
        </span>
      )}

      {/* 불투명 오버레이 (Expert) — 자물쇠/텍스트 없이 */}
      {plan.comingSoon && (
        <div style={{
          position: "absolute", inset: 0, borderRadius: 14,
          background: "rgba(255,255,255,0.50)",
          backdropFilter: "blur(1px)", zIndex: 2,
          /* 헤더 영역(name+price+desc)= ~120px 제외, 기능 시작 지점부터 더 불투명 */
        }} />
      )}
      {plan.comingSoon && (
        <div style={{
          position: "absolute", top: 120, bottom: 0, left: 0, right: 0,
          borderRadius: "0 0 14px 14px",
          background: "rgba(255,255,255,0.20)",
          zIndex: 3, pointerEvents: "none",
        }} />
      )}

      {/* 플랜 이름 + 가격 */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
        <span style={{ fontSize: 16, fontWeight: 800, color: plan.color, fontFamily: FONT }}>{plan.name}</span>
        {plan.id === "PREMIUM" && <Crown size={15} color={plan.color} />}
        {plan.id === "EXPERT"  && <Code2 size={15} color={plan.color} />}
        {plan.id === "FREE"    && <Star  size={15} color={plan.color} />}
      </div>
      <div style={{ fontSize: 26, fontWeight: 900, color: "#0F172A", fontFamily: FONT, marginBottom: 2 }}>
        {priceLabel(plan.price)}
        <span style={{ fontSize: 12, color: "#6B7280", fontWeight: 500 }}> / 월</span>
      </div>
      <p style={{ fontSize: 12, color: "#64748B", fontFamily: FONT, marginBottom: 16, minHeight: 32 }}>
        {plan.desc}
      </p>

      {/* 기능 목록 */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 20, flex: 1 }}>
        {plan.features.map((f, i) => (
          <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
            <span style={{ color: f.highlight ? plan.color : "#94A3B8", marginTop: 1, flexShrink: 0 }}>{f.icon}</span>
            <span style={{
              fontSize: 12, fontFamily: FONT,
              color: f.highlight ? "#1E293B" : "#475569",
              fontWeight: f.highlight ? 600 : 400,
              lineHeight: 1.4,
            }}>
              {f.text}
            </span>
          </div>
        ))}
      </div>

      {/* 토큰 한도 칩 */}
      <div style={{
        display: "inline-flex", alignItems: "center", gap: 5,
        background: "rgba(255,255,255,0.7)", border: `1px solid ${plan.border}`,
        borderRadius: 8, padding: "5px 10px", fontSize: 11, fontWeight: 700,
        color: plan.color, fontFamily: FONT, marginBottom: 16, alignSelf: "flex-start",
      }}>
        <ShieldCheck size={11} /> {plan.limit}
      </div>

      {/* CTA 버튼 */}
      <button
        disabled={busy || isCurrent || plan.comingSoon || plan.free}
        onClick={() => !plan.comingSoon && !isCurrent && !plan.free && onSelect(plan)}
        style={btnStyle}
      >
        {busy ? "처리 중…" : btnLabel}
      </button>
    </div>
  );
}

/* ─────────────────────── 메인 모달 ─────────────────────── */
export default function SubscriptionModal({ open, onClose }) {
  const [sub, setSub]         = useState({ tier: "FREE" });
  const [tossReady, setReady] = useState(false);
  const [busy, setBusy]       = useState(false);
  const [msg, setMsg]         = useState("");
  const [notifyPlan, setNotifyPlan] = useState(null); // Expert 알림 등록

  /* 구독 현황 조회 */
  useEffect(() => {
    if (!open) return;
    fetchSubscription()
      .then(d => setSub(d))
      .catch(() => {});
  }, [open]);

  /* Toss Payments v1 SDK 준비 확인
   * index.html에서 v1 SDK를 선로드하고 window.__tossV1에 캡처함.
   * 여기서는 준비 여부만 확인하면 됨.
   */
  useEffect(() => {
    if (!open) return;
    if (window.__tossV1 && typeof window.__tossV1 === "function") {
      setReady(true);
    } else {
      setMsg("결제 모듈이 로드되지 않았습니다. 페이지를 새로고침 해주세요.");
    }
  }, [open]);

  /* ESC 닫기 */
  useEffect(() => {
    if (!open) return;
    const handler = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onClose]);

  /* 결제 시작 */
  const startPayment = useCallback(async (plan) => {
    if (!tossReady || !window.__tossV1) {
      setMsg("결제 모듈 준비 중입니다. 잠시 후 다시 시도해주세요.");
      return;
    }

    const clientKey = import.meta.env.VITE_TOSS_CLIENT_KEY;
    if (!clientKey) {
      setMsg("결제 키가 설정되지 않았습니다. 관리자에게 문의해주세요.");
      return;
    }

    // 로그인한 사용자 정보 (있으면 포함)
    const dbEmail = localStorage.getItem("dbEmail") || "";
    const dbName  = localStorage.getItem("dbName")  || "Alpha-Helix 회원";

    setBusy(true);
    setMsg("");
    try {
      const tp = window.__tossV1(clientKey);
      // v1 인스턴스 검증: requestPayment 없으면 v2 SDK가 잘못 캡처된 것
      if (!tp || typeof tp.requestPayment !== "function") {
        setBusy(false);
        setMsg("결제 모듈 버전 오류입니다. 페이지를 새로고침 해주세요.");
        return;
      }
      // orderId: 영숫자+하이픈, 6~64자 (Toss v1 요구사항)
      const ts   = Date.now().toString(36).toUpperCase();
      const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
      const orderId = `AH-${plan.id}-${ts}-${rand}`;
      await tp.requestPayment("카드", {
        amount: plan.price,
        orderId,
        orderName: `Alpha-Helix ${plan.name} 1개월`,
        customerName: dbName || undefined,
        customerEmail: dbEmail || undefined,
        successUrl: window.location.origin + `/subscription/success?plan=${plan.id}`,
        failUrl:    window.location.origin + `/subscription/fail?plan=${plan.id}`,
      });
    } catch (e) {
      if (e?.code !== "USER_CANCEL") {
        setMsg("결제 중 오류가 발생했습니다: " + (e?.message || String(e)));
      }
    } finally {
      setBusy(false);
    }
  }, [tossReady]);

  if (!open) return null;

  // 백엔드는 "STANDARD" | "PREMIUM" | "FREE" 반환.
  // 구버전 호환: "PRO" → "STANDARD"로 매핑
  const currentTier = sub.tier === "PRO" ? "STANDARD" : (sub.tier || "FREE");

  return (
    <>
      {/* 딤 오버레이 */}
      <div
        onClick={onClose}
        style={{
          position: "fixed", inset: 0,
          background: "rgba(15,23,42,0.5)",
          backdropFilter: "blur(3px)",
          zIndex: 9000,
        }}
      />

      {/* 모달 */}
      <div style={{
        position: "fixed",
        top: "50%", left: "50%",
        transform: "translate(-50%, -50%)",
        width: "min(96vw, 1360px)",
        maxHeight: "92vh",
        background: "white",
        borderRadius: 20,
        boxShadow: "0 24px 60px rgba(0,0,0,0.25)",
        zIndex: 9001,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        fontFamily: FONT,
      }}>
        {/* 헤더 */}
        <div style={{
          padding: "24px 28px 18px",
          borderBottom: "1px solid #F1F5F9",
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          flexShrink: 0,
        }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
              <Crown size={20} color="#6366f1" />
              <h2 style={{
                fontSize: 20, fontWeight: 900, margin: 0,
                background: "linear-gradient(135deg, #60a5fa 0%, #3b82f6 50%, #6366f1 100%)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                backgroundClip: "text",
              }}>
                Alpha-Helix 구독 플랜
              </h2>
            </div>
            <p style={{ fontSize: 13, color: "#64748B", margin: 0 }}>
              나에게 맞는 플랜을 선택하고 AI 자동 투자를 시작하세요.
              {currentTier !== "FREE" && (
                <span style={{ marginLeft: 8, fontWeight: 700, color: "#6366F1" }}>
                  현재: {currentTier} 구독 중
                </span>
              )}
            </p>
          </div>
          <button
            onClick={onClose}
            style={{
              background: "none", border: "none", cursor: "pointer",
              color: "#94A3B8", padding: 4, borderRadius: 6,
              display: "inline-flex", alignItems: "center",
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* 플랜 카드 영역 */}
        <div style={{
          padding: "24px 28px",
          display: "flex",
          gap: 16,
          overflowY: "auto",
          flex: 1,
          alignItems: "stretch",
        }}>
          {PLANS.map(plan => (
            <PlanCard
              key={plan.id}
              plan={plan}
              isCurrent={currentTier === plan.id}
              onSelect={startPayment}
              busy={busy}
            />
          ))}
        </div>

        {/* 하단 메시지 + 비교표 링크 */}
        <div style={{
          padding: "14px 28px",
          borderTop: "1px solid #F1F5F9",
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          flexWrap: "wrap",
        }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {msg && (
              <p style={{ fontSize: 12, color: "#EF4444", margin: 0, fontWeight: 600 }}>{msg}</p>
            )}
            <p style={{ fontSize: 11, color: "#94A3B8", margin: 0 }}>
              구독은 매월 자동 갱신됩니다. 언제든지 해지할 수 있습니다.
              Toss Payments 보안 결제로 카드 정보를 안전하게 처리합니다.
            </p>
          </div>
          <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
            <FeatureCompare />
          </div>
        </div>
      </div>
    </>
  );
}

/* ─────────────────────── 기능 비교 아코디언 ─────────────────────── */
function FeatureCompare() {
  const [open, setOpen] = useState(false);
  const rows = [
    { label: "계좌 연동",          free: "—",       std: "1개",    pre: "3개",    exp: "무제한" },
    { label: "자동 매수/매도",      free: "—",        std: "✓",      pre: "✓",      exp: "✓" },
    { label: "AI 토큰",            free: "200k/월",  std: "500k/월", pre: "무제한", exp: "무제한" },
    { label: "고급 AI 모델",        free: "—",        std: "—",      pre: "✓",      exp: "✓" },
    { label: "Claude Opus 4",       free: "—",        std: "—",      pre: "—",      exp: "✓" },
    { label: "퀀트 코딩 탭",        free: "—",        std: "—",      pre: "—",      exp: "✓" },
    { label: "백테스트",            free: "✓",        std: "✓",      pre: "✓",      exp: "✓" },
    { label: "우선 지원",           free: "—",        std: "—",      pre: "✓",      exp: "✓ (전담)" },
  ];

  const cellStyle = (v) => ({
    textAlign: "center", fontSize: 11, fontWeight: v === "—" ? 400 : 700,
    color: v === "—" ? "#CBD5E1" : v === "✓" || v.includes("✓") ? "#10B981" : "#374151",
    padding: "6px 8px", fontFamily: FONT,
  });

  return (
    <div style={{ position: "relative" }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          fontSize: 11, fontWeight: 600, color: "#6366F1",
          background: "none", border: "1px solid #E0E7FF",
          borderRadius: 6, padding: "5px 12px", cursor: "pointer", fontFamily: FONT,
        }}
      >
        {open ? "▲ 기능 비교 닫기" : "▼ 전체 기능 비교 보기"}
      </button>
      {open && (
        <div style={{
          position: "absolute", bottom: "calc(100% + 8px)", right: 0,
          background: "white", border: "1px solid #E2E8F0", borderRadius: 12,
          boxShadow: "0 -12px 40px rgba(0,0,0,0.12)",
          minWidth: 440, zIndex: 10,
          overflow: "hidden",
        }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "#F8FAFC" }}>
                {["기능", "Free", "Standard", "Premium", "Expert"].map(h => (
                  <th key={h} style={{
                    padding: "8px 8px", fontSize: 11, fontWeight: 800, color: "#374151",
                    textAlign: h === "기능" ? "left" : "center", fontFamily: FONT,
                    borderBottom: "2px solid #E2E8F0",
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} style={{ background: i % 2 === 0 ? "white" : "#FAFAFA" }}>
                  <td style={{ padding: "6px 8px", fontSize: 11, color: "#374151", fontWeight: 600, fontFamily: FONT }}>
                    {r.label}
                  </td>
                  <td style={cellStyle(r.free)}>{r.free}</td>
                  <td style={cellStyle(r.std)}>{r.std}</td>
                  <td style={cellStyle(r.pre)}>{r.pre}</td>
                  <td style={cellStyle(r.exp)}>{r.exp}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
