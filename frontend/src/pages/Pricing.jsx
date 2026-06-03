import { useEffect, useState } from "react";
import { Crown, Check, Sparkles, Database, Brain } from "lucide-react";
import { fetchSubscription } from "../lib/aiClient";

/**
 * Pro 구독 결제 페이지.
 * Toss Payments v1 Widget을 CDN으로 동적 로드 → 결제창 띄우기.
 * 결제 성공 시 /subscription/success 로 redirect → 거기서 /api/subscription/confirm 호출.
 */
export default function Pricing() {
  const [sub, setSub] = useState({ tier: "FREE", priceKrw: 9900 });
  const [tossReady, setTossReady] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetchSubscription().then(setSub).catch(() => {});
  }, []);

  // Toss Payments SDK CDN 동적 로드
  useEffect(() => {
    if (window.TossPayments) { setTossReady(true); return; }
    const s = document.createElement("script");
    s.src = "https://js.tosspayments.com/v1/payment";
    s.async = true;
    s.onload = () => setTossReady(true);
    s.onerror = () => alert("결제 모듈 로드 실패. 새로고침 해주세요.");
    document.body.appendChild(s);
    return () => { try { document.body.removeChild(s); } catch (_) {} };
  }, []);

  const startPayment = async () => {
    if (!tossReady) { alert("결제 모듈 로드 중입니다."); return; }
    if (sub.tier === "PRO") { alert("이미 Pro 구독중입니다."); return; }

    const clientKey = import.meta.env.VITE_TOSS_CLIENT_KEY;
    if (!clientKey) { alert("VITE_TOSS_CLIENT_KEY 환경변수가 설정되지 않았습니다."); return; }

    setBusy(true);
    try {
      const tp = window.TossPayments(clientKey);
      const orderId = "ah_pro_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8);
      // 주문ID는 successUrl로 그대로 전달됨 → 거기서 confirm 호출
      await tp.requestPayment("카드", {
        amount: sub.priceKrw,
        orderId,
        orderName: "Alpha-Helix Pro 1개월",
        successUrl: window.location.origin + "/subscription/success",
        failUrl: window.location.origin + "/subscription/fail",
      });
    } catch (e) {
      console.error(e);
      alert("결제 시작 실패: " + (e.message || e));
    } finally {
      setBusy(false);
    }
  };

  const isPro = sub.tier === "PRO";

  return (
    <div style={{ maxWidth: 1100, margin: "60px auto", padding: "0 24px", fontFamily: "Pretendard, sans-serif" }}>
      <h1 style={{ fontSize: 32, fontWeight: 800, marginBottom: 8, color: "#0F172A" }}>
        Alpha-Helix 요금제
      </h1>
      <p style={{ fontSize: 14, color: "#64748B", marginBottom: 40 }}>
        4개의 AI를 각자의 강점에 맞게 활용하세요. 무료로도 충분히 시작할 수 있습니다.
      </p>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
        {/* FREE */}
        <div style={{
          background: "white", border: "1px solid #E2E8F0", borderRadius: 16,
          padding: 32, display: "flex", flexDirection: "column",
        }}>
          <div style={{ fontSize: 18, fontWeight: 700, color: "#0F172A" }}>Free</div>
          <div style={{ fontSize: 36, fontWeight: 800, marginTop: 12, color: "#0F172A" }}>
            ₩0<span style={{ fontSize: 13, color: "#94A3B8", fontWeight: 500 }}> / 월</span>
          </div>
          <div style={{ marginTop: 24, display: "flex", flexDirection: "column", gap: 10 }}>
            <Feat>Gemini 2.5 Flash 무제한급 (200k tok/월)</Feat>
            <Feat>GPT-4o mini (100k tok/월)</Feat>
            <Feat>전체 백테스트 / Trust Score / Regime</Feat>
            <Feat>Goal → Strategy 정형화</Feat>
            <Feat>KIS 모의계좌 연동</Feat>
          </div>
          <button disabled style={{
            marginTop: "auto", padding: "12px 18px", fontSize: 14, fontWeight: 700,
            background: "#F1F5F9", color: "#94A3B8", border: "none", borderRadius: 10,
            cursor: "not-allowed",
          }}>현재 플랜</button>
        </div>

        {/* PRO */}
        <div style={{
          background: "linear-gradient(135deg, #EFF6FF 0%, #F5F3FF 100%)",
          border: "2px solid #6366F1", borderRadius: 16, padding: 32,
          display: "flex", flexDirection: "column", position: "relative",
        }}>
          <div style={{
            position: "absolute", top: -12, right: 24,
            background: "linear-gradient(135deg, #6366F1, #8B5CF6)", color: "white",
            fontSize: 11, fontWeight: 700, padding: "4px 12px", borderRadius: 999,
            display: "inline-flex", alignItems: "center", gap: 4,
          }}>
            <Sparkles size={11} /> 추천
          </div>
          <div style={{ fontSize: 18, fontWeight: 700, color: "#0F172A", display: "inline-flex", alignItems: "center", gap: 6 }}>
            <Crown size={18} color="#A16207" /> Pro
          </div>
          <div style={{ fontSize: 36, fontWeight: 800, marginTop: 12, color: "#0F172A" }}>
            ₩{sub.priceKrw.toLocaleString()}<span style={{ fontSize: 13, color: "#64748B", fontWeight: 500 }}> / 월 (30일)</span>
          </div>
          <div style={{ marginTop: 24, display: "flex", flexDirection: "column", gap: 10 }}>
            <Feat strong><Brain size={14} /> Claude Sonnet 4 — 코드/전략 정밀 (300k tok)</Feat>
            <Feat strong><Brain size={14} /> Claude Opus 4 — 최고 품질 (100k tok)</Feat>
            <Feat strong>GPT-4o — 자연스러운 전략 설명 (300k tok)</Feat>
            <Feat strong><Database size={14} /> Perplexity Sonar — 실시간 출처 (200k tok)</Feat>
            <Feat strong><Database size={14} /> Perplexity Sonar Pro — 심층 리서치 (80k tok)</Feat>
            <Feat strong>Gemini 2.5 Pro — 정밀 추론 (500k tok)</Feat>
            <Feat>모든 Free 기능 포함</Feat>
          </div>
          <button onClick={startPayment} disabled={isPro || busy || !tossReady} style={{
            marginTop: "auto", padding: "14px 18px", fontSize: 14, fontWeight: 800,
            background: isPro ? "#22C55E" : "linear-gradient(135deg, #60a5fa, #6366f1)",
            color: "white", border: "none", borderRadius: 10,
            cursor: isPro || busy ? "default" : "pointer",
            display: "inline-flex", justifyContent: "center", alignItems: "center", gap: 6,
          }}>
            {isPro ? <><Check size={16} /> 활성화됨</> : busy ? "결제 진행…" : <><Crown size={14} /> Pro 시작하기</>}
          </button>
        </div>
      </div>

      <div style={{ marginTop: 40, padding: 20, background: "#F8FAFC", borderRadius: 12, fontSize: 12, color: "#64748B", lineHeight: 1.7 }}>
        <strong>각 모델의 강점</strong>
        <div>• <b>Claude</b> — 코드 작성/리팩터링, 전략 알고리즘 정밀 구현에 압도적</div>
        <div>• <b>GPT</b> — 대화하듯 쉬운 전략 설계, 자연스러운 설명</div>
        <div>• <b>Perplexity</b> — 전략 결정 시 실시간 시장 데이터 + 출처 제공으로 확신</div>
        <div>• <b>Gemini</b> — 빠른 응답, 범용 작업, 무료 한도 큼</div>
      </div>
    </div>
  );
}

function Feat({ children, strong }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: strong ? "#0F172A" : "#475569", fontWeight: strong ? 600 : 400 }}>
      <Check size={14} color="#10B981" /> {children}
    </div>
  );
}
