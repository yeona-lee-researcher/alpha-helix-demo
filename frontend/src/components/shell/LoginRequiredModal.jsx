import { useNavigate } from "react-router-dom";
import { X, LogIn } from "lucide-react";

/**
 * 비로그인 사용자가 사이드바의 인증 필요 항목 클릭 시 표시되는 모달.
 */
export default function LoginRequiredModal({ open, onClose }) {
  const nav = useNavigate();
  if (!open) return null;

  const goLogin = () => { onClose?.(); nav("/login"); };

  return (
    <div onClick={onClose} style={{
      position: "fixed", inset: 0, background: "rgba(15, 23, 42, 0.55)",
      display: "flex", alignItems: "center", justifyContent: "center", zIndex: 2000,
      backdropFilter: "blur(4px)",
    }}>
      <div onClick={(e) => e.stopPropagation()} style={{
        background: "white", borderRadius: 16, padding: 32, maxWidth: 400, width: "90%",
        boxShadow: "0 20px 60px rgba(0,0,0,0.25)", position: "relative",
      }}>
        <button onClick={onClose} style={{
          position: "absolute", top: 12, right: 12, background: "none", border: "none",
          cursor: "pointer", color: "#94A3B8", padding: 6, borderRadius: 6,
        }}>
          <X size={20} />
        </button>

        <div style={{
          width: 56, height: 56, margin: "0 auto 16px", borderRadius: "50%",
          background: "linear-gradient(135deg, #DBEAFE, #E0E7FF)",
          display: "inline-flex", alignItems: "center", justifyContent: "center",
        }}>
          <LogIn size={26} color="#6366F1" />
        </div>

        <h3 style={{
          fontSize: 18, fontWeight: 700, color: "#0F172A",
          textAlign: "center", margin: "0 0 8px",
        }}>로그인이 필요합니다</h3>
        <p style={{
          fontSize: 13, color: "#64748B", textAlign: "center",
          lineHeight: 1.6, margin: "0 0 24px",
        }}>
          이 기능을 사용하려면 로그인 후 이용해 주세요.<br />
          전략 만들기, 워크스페이스, 포트폴리오는 회원 전용입니다.
        </p>

        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={onClose} style={{
            flex: 1, padding: "12px 18px", fontSize: 14, fontWeight: 600,
            background: "#F1F5F9", color: "#475569",
            border: "1px solid #E2E8F0", borderRadius: 10, cursor: "pointer",
          }}>닫기</button>
          <button onClick={goLogin} style={{
            flex: 2, padding: "12px 18px", fontSize: 14, fontWeight: 700,
            background: "linear-gradient(135deg, #60a5fa, #6366f1)",
            color: "white", border: "none", borderRadius: 10, cursor: "pointer",
          }}>로그인 하러 가기</button>
        </div>
      </div>
    </div>
  );
}
