import { ChevronRight, ExternalLink } from "lucide-react";
import { useNavigate } from "react-router-dom";

const SECTIONS = [
  { title: "시작하기", items: [
    { label: "Alpha-Helix 한눈에 보기", to: "/alpha_guide#overview" },
    { label: "첫 워크스페이스 만들기", to: "/alpha_guide#workspace" },
  ]},
  { title: "전략 설계", items: [
    { label: "Goal Chat (목표 → 전략)", to: "/alpha_guide#goal-chat" },
    { label: "전략 카드 편집",          to: "/alpha_guide#config" },
  ]},
  { title: "검증 & 운영", items: [
    { label: "백테스트 리포트 보는 법", to: "/alpha_guide#backtest" },
    { label: "Trust Score 의미",       to: "/alpha_guide#trust" },
    { label: "주문 제안 승인 큐",      to: "/alpha_guide#orders" },
  ]},
  { title: "정책", items: [
    { label: "개인정보 처리방침", to: "/alpha_privacy" },
    { label: "이용약관",         to: "/alpha_terms" },
  ]},
];

/**
 * 우측 도크형 이용 가이드 패널.
 * - LeftSidebar 의 ⋯ 버튼이 토글
 * - 항목 클릭 시 새 탭에서 가이드 페이지 열림 (vscode 도움말 패널 패턴)
 */
export default function GuideDock({ open, onClose, width = 320 }) {
  const nav = useNavigate();

  const goItem = (to) => {
    window.open(to, "_blank", "noopener");
  };

  return (
    <aside style={{
      position: "fixed", left: open ? 52 : 0, top: 0, bottom: 0,
      width: open ? width : 0,
      background: "white",
      borderRight: open ? "1px solid #E2E8F0" : "none",
      boxShadow: open ? "8px 0 24px rgba(15,23,42,0.06)" : "none",
      transition: "width 0.18s ease, left 0.18s ease",
      overflow: "hidden", zIndex: 940,
      fontFamily: "'Inter', 'Pretendard', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    }}>
      <div style={{
        height: 44, padding: "0 14px",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        borderBottom: "1px solid #F1F5F9",
      }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: "#0F172A" }}>이용 가이드</span>
        <button onClick={onClose} title="닫기" style={{
          background: "transparent", border: "none", cursor: "pointer",
          color: "#94A3B8", padding: 4, borderRadius: 6,
          display: "inline-flex", alignItems: "center", justifyContent: "center",
        }}>
          <ChevronRight size={18} style={{ transform: "rotate(180deg)" }} />
        </button>
      </div>

      <div style={{ padding: "12px 8px", overflowY: "auto", height: "calc(100% - 44px)" }}>
        {SECTIONS.map((sec, si) => (
          <div key={si} style={{ marginBottom: 14 }}>
            <div style={{
              padding: "4px 10px", fontSize: 11, fontWeight: 700,
              color: "#64748B", textTransform: "uppercase", letterSpacing: 0.5,
            }}>{sec.title}</div>
            {sec.items.map((it, ii) => (
              <button key={ii} onClick={() => goItem(it.to)}
                style={{
                  width: "100%", textAlign: "left",
                  padding: "8px 10px", borderRadius: 6, border: "none",
                  background: "transparent", color: "#0F172A",
                  fontSize: 13, cursor: "pointer",
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = "#F1F5F9"; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
              >
                <span>{it.label}</span>
                <ExternalLink size={12} style={{ color: "#94A3B8" }} />
              </button>
            ))}
          </div>
        ))}

        <div style={{ padding: "12px 10px", borderTop: "1px solid #F1F5F9", marginTop: 8 }}>
          <button onClick={() => nav("/alpha_guide")} style={{
            width: "100%", padding: "8px 12px", borderRadius: 8,
            background: "linear-gradient(135deg, #60a5fa, #6366f1)",
            color: "white", border: "none", cursor: "pointer",
            fontSize: 12.5, fontWeight: 700,
          }}>전체 가이드 페이지로</button>
        </div>
      </div>
    </aside>
  );
}
