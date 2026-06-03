import { useNavigate, useSearchParams } from "react-router-dom";

/**
 * 토스페이먼츠 결제창에서 결제 실패 시 failUrl 로 리다이렉트되는 페이지.
 * 쿼리스트링: code, message, orderId
 */
export default function TossPaymentFail() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const code = params.get("code") || "";
  const message = params.get("message") || "결제가 취소되었거나 실패했습니다.";

  let back = "/";
  try { back = JSON.parse(sessionStorage.getItem("toss_pending_escrow") || "{}").returnTo || "/"; }
  catch { /* ignore parse error */ }

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
      background: "#F8FAFC", fontFamily: "'Pretendard',sans-serif" }}>
      <div style={{ background: "white", borderRadius: 20, padding: "40px 48px", width: 480, maxWidth: "90%",
        boxShadow: "0 8px 32px rgba(0,0,0,0.08)", textAlign: "center" }}>
        <div style={{ fontSize: 56, marginBottom: 12 }}>❌</div>
        <h2 style={{ fontSize: 22, fontWeight: 800, color: "#EF4444", marginBottom: 12 }}>결제 실패</h2>
        <p style={{ fontSize: 14, color: "#64748B", lineHeight: 1.6, marginBottom: 8 }}>{message}</p>
        {code && <p style={{ fontSize: 12, color: "#94A3B8", marginBottom: 24 }}>코드: {code}</p>}
        <button onClick={() => { sessionStorage.removeItem("toss_pending_escrow"); navigate(back, { replace: true }); }}
          style={{ padding: "12px 28px", borderRadius: 10, border: "none",
            background: "linear-gradient(135deg, #60a5fa, #6366f1)", color: "white",
            fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
          돌아가기
        </button>
      </div>
    </div>
  );
}
