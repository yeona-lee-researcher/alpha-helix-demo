import { useEffect, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { Check, X, Loader } from "lucide-react";

const PLAN_NAMES = {
  STANDARD: "Standard",
  PREMIUM:  "Premium",
  EXPERT:   "Expert",
};

/**
 * Toss 결제 successUrl 콜백 페이지.
 * 쿼리: paymentKey, orderId, amount, plan → 백엔드 /api/subscription/confirm 호출
 */
export default function SubscriptionSuccess() {
  const [params] = useSearchParams();
  const nav = useNavigate();
  const [state, setState] = useState({ loading: true, ok: false, msg: "", tier: "" });

  useEffect(() => {
    const paymentKey = params.get("paymentKey");
    const orderId    = params.get("orderId");
    const amount     = Number(params.get("amount") || 0);
    const plan       = params.get("plan") || "STANDARD"; // SubscriptionModal이 successUrl에 plan= 포함
    if (!paymentKey || !orderId || !amount) {
      setState({ loading: false, ok: false, msg: "잘못된 콜백 파라미터입니다.", tier: "" });
      return;
    }

    fetch("/api/subscription/confirm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ paymentKey, orderId, amount }),
    })
      .then(async r => {
        const data = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(data.error || `HTTP ${r.status}`);
        const tierDisplay = PLAN_NAMES[data.tier] || data.tier || PLAN_NAMES[plan] || plan;
        setState({
          loading: false,
          ok: true,
          msg: `만료일: ${data.expiresAt ? data.expiresAt.substring(0, 10) : "-"}`,
          tier: tierDisplay,
        });
      })
      .catch(e => setState({ loading: false, ok: false, msg: e.message || String(e), tier: "" }));
  }, [params]);

  return (
    <div style={{ maxWidth: 520, margin: "120px auto", padding: 32, textAlign: "center", fontFamily: "Pretendard, sans-serif" }}>
      {state.loading && <>
        <Loader size={48} className="spin" color="#6366F1" />
        <h2 style={{ marginTop: 16, fontSize: 20, color: "#0F172A" }}>결제 확인 중…</h2>
      </>}
      {!state.loading && state.ok && <>
        <div style={{ width: 72, height: 72, margin: "0 auto", borderRadius: "50%", background: "#DCFCE7", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
          <Check size={36} color="#16A34A" />
        </div>
        <h2 style={{ marginTop: 20, fontSize: 22, fontWeight: 800, color: "#0F172A" }}>결제 완료 🎉</h2>
        <p style={{ marginTop: 8, color: "#475569", fontSize: 15, fontWeight: 600 }}>
          Alpha-Helix <strong>{state.tier}</strong> 구독이 활성화되었습니다.
        </p>
        <p style={{ marginTop: 4, color: "#94A3B8", fontSize: 13 }}>{state.msg}</p>
        <button onClick={() => nav("/workhome")} style={{
          marginTop: 28, padding: "12px 20px", fontSize: 14, fontWeight: 700,
          background: "linear-gradient(135deg, #60a5fa, #6366f1)", color: "white",
          border: "none", borderRadius: 10, cursor: "pointer",
        }}>Alpha-Helix로 이동</button>
      </>}
      {!state.loading && !state.ok && <>
        <div style={{ width: 72, height: 72, margin: "0 auto", borderRadius: "50%", background: "#FEE2E2", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
          <X size={36} color="#DC2626" />
        </div>
        <h2 style={{ marginTop: 20, fontSize: 22, fontWeight: 800, color: "#0F172A" }}>결제 실패</h2>
        <p style={{ marginTop: 8, color: "#475569", fontSize: 14 }}>{state.msg}</p>
        <button onClick={() => { nav("/workhome"); setTimeout(() => window.dispatchEvent(new CustomEvent("alpha:open-subscription")), 300); }} style={{
          marginTop: 28, padding: "12px 20px", fontSize: 14, fontWeight: 700,
          background: "linear-gradient(135deg, #60a5fa, #6366f1)", color: "white",
          border: "none", borderRadius: 10, cursor: "pointer",
        }}>다시 시도하기</button>
      </>}
      <style>{`.spin { animation: spin 1s linear infinite; } @keyframes spin { from { transform: rotate(0); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
