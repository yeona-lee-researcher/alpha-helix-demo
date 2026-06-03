import { useEffect, useState, useRef } from "react";
import { ChevronDown, Lock, Crown, Check } from "lucide-react";
import { fetchAiModels } from "../../lib/aiClient";

/**
 * AI 모델 선택기 (VS Code 스타일).
 * - props.value : 현재 선택된 modelId
 * - props.onChange(modelId) : 변경 콜백
 * - props.compact : 작은 버튼 모드
 *
 * 잠긴 모델 클릭 시 Pro 안내 + /pricing 이동 옵션.
 */
export default function ModelPicker({ value, onChange, compact = false, glass = false }) {
  const [open, setOpen] = useState(false);
  const [models, setModels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const ref = useRef(null);
  const btnRef = useRef(null);
  const popRef = useRef(null);

  useEffect(() => {
    fetchAiModels().then(ms => { setModels(ms); setLoading(false); });
  }, []);

  useEffect(() => {
    const onClick = (e) => {
      if (ref.current && ref.current.contains(e.target)) return;
      if (popRef.current && popRef.current.contains(e.target)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  // 드롭다운 위치 계산 — 부모 overflow에 안 잘리도록 fixed로 띄움.
  // 오른쪽 정렬 + 화면 밖으로 넘치면 왼쪽 정렬로 자동 전환.
  useEffect(() => {
    if (!open || !btnRef.current) return;
    const recompute = () => {
      const r = btnRef.current.getBoundingClientRect();
      const W = 320; // 드롭다운 너비
      const margin = 8;
      let left = r.right - W;            // 기본: 우측 정렬
      if (left < margin) left = r.left;  // 좁아서 왼쪽으로 빠지면 좌측 정렬
      if (left + W > window.innerWidth - margin) left = window.innerWidth - W - margin;
      setPos({ top: r.bottom + 6, left });
    };
    recompute();
    window.addEventListener("scroll", recompute, true);
    window.addEventListener("resize", recompute);
    return () => {
      window.removeEventListener("scroll", recompute, true);
      window.removeEventListener("resize", recompute);
    };
  }, [open]);

  const current = models.find(m => m.modelId === value) || models.find(m => m.usable) || models[0];

  const goPricing = () => {
    setOpen(false);
    window.dispatchEvent(new CustomEvent("alpha:open-subscription"));
  };

  return (
    <div ref={ref} style={{ position: "relative", display: "inline-block" }}>
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen(o => !o)}
        title={current ? current.displayName : "모델 선택"}
        style={{
          display: "inline-flex", alignItems: "center", gap: 6,
          padding: compact ? "4px 8px" : "6px 12px",
          fontSize: compact ? 11 : 12, fontWeight: 600,
          background: glass ? "transparent" : "#F1F5F9",
          color: glass ? "rgba(255,255,255,0.9)" : "#0F172A",
          border: glass ? "none" : "1px solid #CBD5E1",
          borderRadius: 8, cursor: "pointer",
          maxWidth: 220, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
        }}
      >
        {loading ? "모델 로드 중…" : (current ? current.displayName : "모델 선택")}
        <ChevronDown size={12} />
      </button>

      {open && (
        <div ref={popRef} style={{
          position: "fixed", top: pos.top, left: pos.left,
          background: "white", border: "1px solid #E2E8F0", borderRadius: 10,
          boxShadow: "0 10px 30px rgba(0,0,0,0.12)", width: 320, zIndex: 100000,
          maxHeight: 420, overflowY: "auto",
        }}>
          <div style={{ padding: "10px 14px", borderBottom: "1px solid #F1F5F9", fontSize: 11, color: "#64748B" }}>
            모델 선택 (각 모델의 강점에 맞게 사용)
          </div>
          {models.length === 0 && (
            <div style={{ padding: 16, fontSize: 12, color: "#94A3B8", textAlign: "center" }}>
              로그인하면 여러 모델을 사용할 수 있어요.
            </div>
          )}
          {models.map(m => {
            const isSelected = m.modelId === value;
            const remainingTxt = m.remaining === -1 ? "무제한"
                : m.quota === 0 ? "Pro 전용"
                : `${formatNum(m.remaining)} / ${formatNum(m.quota)} tok`;
            return (
              <button
                key={m.modelId}
                onClick={() => {
                  if (!m.usable) {
                    if (m.lockReason === "Pro 전용" || m.lockReason === "Free 한도 초과") goPricing();
                    return;
                  }
                  onChange?.(m.modelId);
                  setOpen(false);
                }}
                disabled={!m.usable && m.lockReason !== "Pro 전용" && m.lockReason !== "Free 한도 초과"}
                style={{
                  width: "100%", textAlign: "left", border: "none", background: isSelected ? "#F0F9FF" : "white",
                  padding: "10px 14px", cursor: m.usable ? "pointer" : (m.lockReason === "Pro 전용" || m.lockReason === "Free 한도 초과" ? "pointer" : "not-allowed"),
                  display: "flex", flexDirection: "column", gap: 2,
                  borderBottom: "1px solid #F8FAFC", opacity: m.usable ? 1 : 0.7,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 600, color: "#0F172A" }}>
                  {isSelected && <Check size={12} color="#3B82F6" />}
                  {m.displayName}
                  {!m.usable && m.lockReason === "Pro 전용" && (
                    <span style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 3, fontSize: 10, fontWeight: 700, color: "#A16207", background: "#FEF3C7", padding: "1px 6px", borderRadius: 999 }}>
                      <Crown size={10} /> Pro
                    </span>
                  )}
                  {!m.usable && m.lockReason === "API 키 미설정" && (
                    <span style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 3, fontSize: 10, color: "#94A3B8" }}>
                      <Lock size={10} /> 비활성
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 11, color: "#64748B" }}>{m.strength}</div>
                <div style={{ fontSize: 10, color: "#94A3B8" }}>
                  {m.provider} · {remainingTxt}
                </div>
              </button>
            );
          })}
          <div style={{ padding: "10px 14px", borderTop: "1px solid #F1F5F9", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: 11, color: "#64748B" }}>더 많은 모델이 필요해요?</span>
            <button onClick={goPricing} style={{
              fontSize: 11, fontWeight: 700, background: "linear-gradient(135deg, #60a5fa, #6366f1)",
              color: "white", border: "none", padding: "5px 10px", borderRadius: 6, cursor: "pointer",
              display: "inline-flex", alignItems: "center", gap: 4,
            }}><Crown size={11} /> Pro 보기</button>
          </div>
        </div>
      )}
    </div>
  );
}

function formatNum(n) {
  if (n === -1) return "∞";
  if (n >= 1000) return (n / 1000).toFixed(0) + "k";
  return String(n);
}
