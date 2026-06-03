import { useSearchParams, useNavigate } from "react-router-dom";
import { X } from "lucide-react";

export default function SubscriptionFail() {
  const [params] = useSearchParams();
  const nav = useNavigate();
  const message = params.get("message") || "결제가 취소되었거나 일시적인 오류가 발생했습니다.";

  const goBack = () => {
    nav("/workhome");
    // 짧은 딜레이 후 구독 모달 자동 오픈
    setTimeout(() => window.dispatchEvent(new CustomEvent("alpha:open-subscription")), 300);
  };

  return (
    <div style={{ maxWidth: 520, margin: "120px auto", padding: 32, textAlign: "center", fontFamily: "Pretendard, sans-serif" }}>
      <div style={{ width: 72, height: 72, margin: "0 auto", borderRadius: "50%", background: "#FEE2E2", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
        <X size={36} color="#DC2626" />
      </div>
      <h2 style={{ marginTop: 20, fontSize: 22, fontWeight: 800, color: "#0F172A" }}>결제 실패</h2>
      <p style={{ marginTop: 8, color: "#475569", fontSize: 14 }}>{message}</p>
      <button onClick={goBack} style={{
        marginTop: 28, padding: "12px 28px", fontSize: 14, fontWeight: 700,
        background: "linear-gradient(135deg, #60a5fa, #6366f1)",
        color: "white", border: "none", borderRadius: 10, cursor: "pointer",
      }}>다시 시도하기</button>
    </div>
  );
}
