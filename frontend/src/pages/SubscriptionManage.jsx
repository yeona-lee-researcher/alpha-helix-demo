import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Crown, Check, Zap, Calendar, CreditCard, RefreshCw, AlertCircle } from "lucide-react";
import { fetchSubscription } from "../lib/aiClient";

const BASE = "'Inter','Pretendard',-apple-system,sans-serif";
const GRAD = "linear-gradient(135deg,#60a5fa 0%,#3b82f6 50%,#6366f1 100%)";

function Row({ label, value, highlight }) {
  return (
    <div style={{
      display: "flex", justifyContent: "space-between", alignItems: "center",
      padding: "12px 0", borderBottom: "1px solid #F3F4F6",
    }}>
      <span style={{ fontSize: 13, color: "#6B7280", fontFamily: BASE }}>{label}</span>
      <span style={{
        fontSize: 13, fontWeight: 700,
        color: highlight ? "#6366F1" : "#1F2937",
        fontFamily: BASE,
      }}>{value}</span>
    </div>
  );
}

function Badge({ tier }) {
  if (tier === "PRO") return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 4,
      padding: "3px 10px", borderRadius: 999,
      background: "linear-gradient(135deg,#EDE9FE,#DBEAFE)",
      border: "1px solid #C7D2FE",
      fontSize: 12, fontWeight: 800, color: "#4338CA", fontFamily: BASE,
    }}>
      <Crown size={11} /> PRO
    </span>
  );
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 4,
      padding: "3px 10px", borderRadius: 999,
      background: "#F1F5F9", border: "1px solid #E2E8F0",
      fontSize: 12, fontWeight: 700, color: "#64748B", fontFamily: BASE,
    }}>
      FREE
    </span>
  );
}

export default function SubscriptionManage() {
  const nav = useNavigate();
  const [sub, setSub]           = useState({ tier: "FREE", priceKrw: 9900 });
  const [subDetail, setDetail]  = useState(null); // { expiresAt, status }
  const [tossReady, setTossReady] = useState(false);
  const [busy, setBusy]         = useState(false);
  const [msg, setMsg]           = useState("");

  // 현재 구독 조회
  useEffect(() => {
    fetchSubscription()
      .then(d => {
        setSub(d);
        if (d.expiresAt) setDetail({ expiresAt: d.expiresAt, status: d.status });
      })
      .catch(() => {});
  }, []);

  // Toss Payments SDK CDN 동적 로드
  useEffect(() => {
    if (window.TossPayments) { setTossReady(true); return; }
    const s = document.createElement("script");
    s.src = "https://js.tosspayments.com/v1/payment";
    s.async = true;
    s.onload  = () => setTossReady(true);
    s.onerror = () => setMsg("결제 모듈 로드 실패. 새로고침 해주세요.");
    document.body.appendChild(s);
    return () => { try { document.body.removeChild(s); } catch (_) {} };
  }, []);

  const startPayment = async () => {
    if (!tossReady) { setMsg("결제 모듈 로드 중입니다. 잠시 후 다시 시도해주세요."); return; }
    if (sub.tier === "PRO") { setMsg("이미 Pro 구독 중입니다."); return; }
    const clientKey = import.meta.env.VITE_TOSS_CLIENT_KEY;
    if (!clientKey) { setMsg("결제 키 설정 오류. 관리자에게 문의해주세요."); return; }
    setBusy(true); setMsg("");
    try {
      const tp = window.TossPayments(clientKey);
      const orderId = "ah_pro_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8);
      await tp.requestPayment("카드", {
        amount: sub.priceKrw,
        orderId,
        orderName: "Alpha-Helix Pro 1개월",
        successUrl: window.location.origin + "/subscription/success",
        failUrl:    window.location.origin + "/subscription/fail",
      });
    } catch (e) {
      setMsg("결제 시작 실패: " + (e?.message || String(e)));
    } finally {
      setBusy(false);
    }
  };

  const isPro = sub.tier === "PRO";

  const fmtDate = (iso) => {
    if (!iso) return "-";
    try { return new Date(iso).toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric" }); }
    catch { return iso; }
  };

  return (
    <div style={{
      maxWidth: 820, margin: "0 auto", padding: "48px 24px",
      fontFamily: BASE, minHeight: "calc(100vh - 120px)",
    }}>
      {/* 헤더 */}
      <div style={{ marginBottom: 36 }}>
        <p style={{ color: "#6366F1", fontWeight: 700, fontSize: 13, marginBottom: 4 }}>
          SUBSCRIPTION
        </p>
        <h1 style={{ fontSize: 28, fontWeight: 900, color: "#0F172A", margin: 0 }}>
          구독 관리
        </h1>
        <p style={{ fontSize: 14, color: "#6B7280", marginTop: 6 }}>
          현재 플랜 확인 및 Pro 업그레이드
        </p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, alignItems: "start" }}>
        {/* 현재 상태 카드 */}
        <div style={{
          background: "white", borderRadius: 20, padding: 28,
          boxShadow: "0 2px 20px rgba(0,0,0,0.07)", border: "1px solid #F3F4F6",
        }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
            <h2 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: "#0F172A" }}>
              현재 구독
            </h2>
            <Badge tier={sub.tier} />
          </div>

          <Row label="플랜" value={isPro ? "Alpha-Helix Pro" : "Alpha-Helix Free"} highlight={isPro} />
          <Row label="월 요금" value={isPro ? `₩${sub.priceKrw?.toLocaleString()} / 월` : "무료"} />
          {isPro && subDetail?.expiresAt && (
            <Row label="만료일" value={fmtDate(subDetail.expiresAt)} />
          )}
          <Row label="상태" value={isPro ? "활성" : "무료 플랜"} highlight={isPro} />

          {isPro && (
            <div style={{
              marginTop: 20, padding: "12px 16px", borderRadius: 12,
              background: "linear-gradient(135deg,#EFF6FF,#EDE9FE)",
              border: "1px solid #C7D2FE",
              display: "flex", alignItems: "flex-start", gap: 10,
            }}>
              <Calendar size={16} color="#6366F1" style={{ flexShrink: 0, marginTop: 2 }} />
              <p style={{ margin: 0, fontSize: 12, color: "#4338CA", lineHeight: 1.5 }}>
                구독은 만료일 이후 자동 갱신되지 않습니다. 연장하려면 아래 갱신 버튼을 눌러주세요.
              </p>
            </div>
          )}
        </div>

        {/* 플랜 비교 + 업그레이드 카드 */}
        <div style={{
          background: isPro
            ? "linear-gradient(135deg,#F0FDF4,#ECFDF5)"
            : "linear-gradient(135deg,#EFF6FF,#F5F3FF)",
          borderRadius: 20, padding: 28,
          border: isPro ? "2px solid #86EFAC" : "2px solid #6366F1",
          boxShadow: "0 2px 20px rgba(99,102,241,0.12)",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
            <Crown size={22} color={isPro ? "#16A34A" : "#6366F1"} />
            <span style={{ fontSize: 18, fontWeight: 900, color: isPro ? "#15803D" : "#4338CA" }}>
              {isPro ? "Pro 구독 중" : "Pro 플랜"}
            </span>
          </div>
          <div style={{ fontSize: 28, fontWeight: 800, color: isPro ? "#15803D" : "#0F172A", marginBottom: 20 }}>
            ₩{(sub.priceKrw || 9900).toLocaleString()}
            <span style={{ fontSize: 13, fontWeight: 500, color: "#94A3B8" }}> / 월</span>
          </div>

          {[
            "Gemini 2.5 Flash 무제한급",
            "GPT-4o mini 확장 토큰",
            "Claude Sonnet (고급 분석)",
            "Perplexity 실시간 시장 검색",
            "전략 워크스페이스 무제한",
            "KIS 실전계좌 연동",
            "우선 지원",
          ].map(f => (
            <div key={f} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
              <div style={{
                width: 18, height: 18, borderRadius: "50%",
                background: isPro ? "#DCFCE7" : "linear-gradient(135deg,#DBEAFE,#EDE9FE)",
                display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
              }}>
                <Check size={11} color={isPro ? "#16A34A" : "#6366F1"} />
              </div>
              <span style={{ fontSize: 13, color: "#374151" }}>{f}</span>
            </div>
          ))}

          {/* 버튼 */}
          {!isPro ? (
            <button
              onClick={startPayment}
              disabled={busy}
              style={{
                marginTop: 20, width: "100%", padding: "14px 0",
                borderRadius: 12, border: "none", cursor: busy ? "not-allowed" : "pointer",
                background: busy ? "#CBD5E1" : GRAD,
                color: "white", fontSize: 15, fontWeight: 800,
                display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                transition: "opacity 0.2s",
                opacity: busy ? 0.7 : 1,
              }}
            >
              {busy ? <RefreshCw size={16} className="spin" /> : <CreditCard size={16} />}
              {busy ? "처리 중…" : `Pro 구독하기 · ₩${(sub.priceKrw || 9900).toLocaleString()}/월`}
            </button>
          ) : (
            <button
              onClick={startPayment}
              disabled={busy}
              style={{
                marginTop: 20, width: "100%", padding: "14px 0",
                borderRadius: 12, border: "none", cursor: busy ? "not-allowed" : "pointer",
                background: busy ? "#CBD5E1" : "linear-gradient(135deg,#BBF7D0,#86EFAC)",
                color: "#15803D", fontSize: 15, fontWeight: 800,
                display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                opacity: busy ? 0.7 : 1,
              }}
            >
              {busy ? <RefreshCw size={16} className="spin" /> : <RefreshCw size={16} />}
              {busy ? "처리 중…" : "Pro 갱신하기"}
            </button>
          )}

          <p style={{ margin: "12px 0 0", fontSize: 11, color: "#94A3B8", textAlign: "center" }}>
            토스페이먼츠 PCI-DSS 인증 보안 결제 · 자동 갱신 없음
          </p>
        </div>
      </div>

      {/* 에러/안내 메시지 */}
      {msg && (
        <div style={{
          marginTop: 20, padding: "12px 16px", borderRadius: 12,
          background: "#FEF2F2", border: "1px solid #FECACA",
          display: "flex", alignItems: "flex-start", gap: 10,
        }}>
          <AlertCircle size={16} color="#DC2626" style={{ flexShrink: 0, marginTop: 2 }} />
          <p style={{ margin: 0, fontSize: 13, color: "#DC2626" }}>{msg}</p>
        </div>
      )}

      {/* Mypage로 돌아가기 + 요금제 상세 링크 */}
      <div style={{ display: "flex", gap: 12, marginTop: 28 }}>
        <button
          onClick={() => nav("/mypage")}
          style={{
            padding: "10px 20px", borderRadius: 10,
            border: "1px solid #E5E7EB", background: "white",
            fontSize: 13, fontWeight: 600, color: "#374151", cursor: "pointer",
          }}
        >
          ← 마이페이지
        </button>
        <button
          onClick={() => nav("/pricing")}
          style={{
            padding: "10px 20px", borderRadius: 10,
            border: "1px solid #C7D2FE", background: "#EEF2FF",
            fontSize: 13, fontWeight: 600, color: "#4338CA", cursor: "pointer",
          }}
        >
          <Zap size={13} style={{ marginRight: 4, verticalAlign: "middle" }} />
          요금제 상세 비교
        </button>
      </div>
    </div>
  );
}
