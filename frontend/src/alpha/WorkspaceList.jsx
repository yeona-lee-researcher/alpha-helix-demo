import React, { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Plus, Trash2, ArrowRight, MessageSquare, Star, BookOpen, ChevronRight, Zap, TrendingUp, Bitcoin, Layers, X } from "lucide-react";
import { useTheme, BRAND_GRADIENT } from "./ThemeContext";
import { listWorkspaces, createWorkspace, deleteWorkspace, updateWorkspaceStatus } from "./alphaApi";

const PRIMARY_KEY = "alpha.primaryWsId";

const STATUS_LABEL = {
  DRAFT:      "초안",
  GOAL_SET:   "목표 설정됨",
  FORMALIZED: "전략 정형화",
  TESTED:     "백테스트 완료",
  LIVE:       "운용 중",
};

const STATUS_COLOR = {
  DRAFT:      { bar: "#94A3B8", bg: "#F1F5F9", text: "#475569" },
  GOAL_SET:   { bar: "#3B82F6", bg: "#EFF6FF", text: "#1D4ED8" },
  FORMALIZED: { bar: "#8B5CF6", bg: "#F5F3FF", text: "#6D28D9" },
  TESTED:     { bar: "#10B981", bg: "#ECFDF5", text: "#047857" },
  LIVE:       { bar: "#F59E0B", bg: "#FFFBEB", text: "#B45309" },
};

export default function WorkspaceList() {
  const { theme } = useTheme();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [items, setItems] = useState(null);
  const [err, setErr] = useState(null);
  const [creating, setCreating] = useState(false);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [createModalName, setCreateModalName] = useState("");
  const [deleteTarget, setDeleteTarget] = useState(null); // { id, name }
  const [primaryTarget, setPrimaryTarget] = useState(null); // { id, name } — 대표 설정 확인 모달
  const [primaryId, setPrimaryId] = useState(() => {
    const v = localStorage.getItem(PRIMARY_KEY);
    return v ? Number(v) : null;
  });
  const autoPromptedRef = useRef(false);

  const setPrimary = (id) => {
    setPrimaryId(id);
    try {
      localStorage.setItem(PRIMARY_KEY, String(id));
      localStorage.setItem("alpha.lastWsId", String(id));
      window.dispatchEvent(new CustomEvent("alpha:primary-change", { detail: { id } }));
    } catch (_) {}
  };

  const onConfirmPrimary = () => {
    if (!primaryTarget) return;
    setPrimary(primaryTarget.id);
    setPrimaryTarget(null);
  };

  const load = () => {
    listWorkspaces().then(setItems).catch(e => setErr(e?.response?.data?.error || e.message));
  };
  useEffect(load, []);

  const onCreate = (prefill = "") => {
    setCreateModalName(prefill);
    setCreateModalOpen(true);
  };

  const onConfirmCreate = async () => {
    if (!createModalName.trim()) return;
    setCreateModalOpen(false);
    setCreating(true);
    try {
      const w = await createWorkspace(createModalName.trim());
      navigate(`/alpha/w/${w.id}`);
    } catch (e) {
      alert("생성 실패: " + (e?.response?.data?.error || e.message));
    } finally {
      setCreating(false);
    }
  };

  // WorkHome 의 + New Strategy Workspace 클릭 시 /alpha?new=1 로 이동 → 자동 prompt
  useEffect(() => {
    if (autoPromptedRef.current) return;
    const newParam = searchParams.get("new");
    if (newParam) {
      autoPromptedRef.current = true;
      setSearchParams({}, { replace: true });
      onCreate(newParam === "1" ? "" : decodeURIComponent(newParam));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const onDelete = (id, name) => setDeleteTarget({ id, name });

  const onToggleLive = async (w) => {
    const next = w.status === "LIVE" ? "TESTED" : "LIVE";
    // 낙관적 업데이트
    setItems(prev => (prev || []).map(it => it.id === w.id ? { ...it, status: next } : it));
    try {
      await updateWorkspaceStatus(w.id, next);
    } catch (e) {
      alert("상태 변경 실패: " + (e?.response?.data?.error || e.message));
      load();
    }
  };

  const onConfirmDelete = async () => {
    if (!deleteTarget) return;
    try { await deleteWorkspace(deleteTarget.id); load(); }
    catch (e) { alert("삭제 실패: " + (e?.response?.data?.error || e.message)); }
    finally { setDeleteTarget(null); }
  };

  return (
    <div style={{ padding: "36px 40px 80px", background: "#F8FAFC", minHeight: "calc(100vh - 44px)" }}>
      <style>{`
        @keyframes liveBlink {
          0%, 100% { opacity: 1; }
          50%      { opacity: 0.35; }
        }
      `}</style>
      {/* 헤더 */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 32, flexWrap: "wrap", gap: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <div style={{
            width: 54, height: 54, borderRadius: 17, flexShrink: 0,
            background: "linear-gradient(135deg,#60a5fa 0%,#6366f1 100%)",
            display: "flex", alignItems: "center", justifyContent: "center",
            boxShadow: "0 6px 20px rgba(99,102,241,0.32)",
          }}>
            <Layers size={24} color="white" strokeWidth={2.2} />
          </div>
          <div>
            <h1 style={{
              margin: 0, fontSize: 26, fontWeight: 800, lineHeight: 1.15,
              background: "linear-gradient(90deg,#3b82f6 0%,#6366f1 100%)",
              WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
            }}>
              Alpha-Helix
            </h1>
            <p style={{ margin: "5px 0 0", fontSize: 13, color: "#64748B", fontWeight: 500 }}>
              삶의 목표를 투자 전략으로 — 퍼스널 퀀트 매니저
            </p>
          </div>
        </div>
        <button onClick={() => onCreate()} disabled={creating}
          style={{
            display: "inline-flex", alignItems: "center", gap: 6,
            padding: "10px 16px", borderRadius: 10,
            background: theme.accentGradient || theme.accent, color: "white", border: "none",
            fontSize: 13, fontWeight: 700, cursor: creating ? "wait" : "pointer",
            boxShadow: "0 4px 12px rgba(59,130,246,0.25)",
          }}>
          <Plus size={16} /> {creating ? "생성 중…" : "새 워크스페이스"}
        </button>
      </div>

      {err && (
        <div style={{
          padding: 12, background: "rgba(220,38,38,0.1)", border: "1px solid rgba(220,38,38,0.3)",
          borderRadius: 10, color: theme.danger, fontSize: 13, margin: "16px 0",
        }}>{err}</div>
      )}

      {items === null && <p style={{ color: theme.textMuted, marginTop: 30 }}>로딩 중…</p>}

      {items?.length === 0 && (
        <div style={{
          marginTop: 40, padding: 40, textAlign: "center",
          background: theme.panel, border: `1px dashed ${theme.panelBorder}`, borderRadius: 16,
        }}>
          <MessageSquare size={32} style={{ color: theme.accent, marginBottom: 12 }} />
          <h3 style={{ margin: "0 0 6px", color: theme.text }}>첫 워크스페이스를 만들어보세요</h3>
          <p style={{ fontSize: 13, color: theme.textMuted, margin: "0 0 18px" }}>
            "5년 안에 월 300만원 현금흐름" 같은 목표를 입력하면 AI가 전략으로 변환합니다
          </p>
          <button onClick={() => onCreate()} style={{
            padding: "10px 20px", background: theme.accent, color: "white", border: "none",
            borderRadius: 10, fontWeight: 700, cursor: "pointer",
          }}>+ 워크스페이스 시작</button>
        </div>
      )}

      {/* ====== 내 워크스페이스 목록 ====== */}
      <div style={{ display: "grid", gap: 10, marginTop: 24 }}>
        {(items || [])
          .slice()
          .sort((a, b) => {
            if (a.id === primaryId) return -1;
            if (b.id === primaryId) return 1;
            return 0;
          })
          .map(w => {
            const isPrimary = w.id === primaryId;
            const sc = STATUS_COLOR[w.status] || STATUS_COLOR.DRAFT;
            return (
          <div key={w.id}
            style={{
              background: "#ffffff",
              border: isPrimary ? "none" : "1px solid #E2E8F0",
              borderRadius: 14,
              display: "flex", alignItems: "stretch",
              boxShadow: isPrimary
                ? "0 0 15px rgba(251,191,36,0.35), 0 0 40px rgba(251,191,36,0.2), 0 0 80px rgba(251,191,36,0.1)"
                : "0 2px 8px rgba(0,0,0,0.06)",
              overflow: "hidden",
              transition: "box-shadow 0.15s, transform 0.15s",
            }}
            onMouseEnter={e => { e.currentTarget.style.boxShadow = isPrimary ? "0 0 20px rgba(251,191,36,0.45), 0 0 55px rgba(251,191,36,0.25), 0 0 100px rgba(251,191,36,0.12)" : "0 4px 16px rgba(0,0,0,0.10)"; e.currentTarget.style.transform = "translateY(-1px)"; }}
            onMouseLeave={e => { e.currentTarget.style.boxShadow = isPrimary ? "0 0 15px rgba(251,191,36,0.35), 0 0 40px rgba(251,191,36,0.2), 0 0 80px rgba(251,191,36,0.1)" : "0 2px 8px rgba(0,0,0,0.06)"; e.currentTarget.style.transform = "translateY(0)"; }}
          >
            {/* 본문 */}
            <div style={{ flex: 1, minWidth: 0, padding: "16px 18px", display: "flex", alignItems: "center", gap: 14 }}>
              {/* 상태 아이콘 원형 */}
              <div style={{
                width: 42, height: 42, borderRadius: 12, flexShrink: 0,
                background: isPrimary ? "#FEF3C7" : sc.bg,
                display: "flex", alignItems: "center", justifyContent: "center",
                boxShadow: "none",
              }}>
                <Layers size={18} color={isPrimary ? "#B45309" : sc.bar} strokeWidth={2.2} />
              </div>

              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 5, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 15, fontWeight: 800, color: "#0F172A" }}>{w.name}</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  {w.status !== "LIVE" && (
                    <span style={{
                      fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 999,
                      background: isPrimary ? "#FFF8E1" : sc.bg,
                      color: isPrimary ? "#1C1400" : sc.text,
                      border: `1px solid ${isPrimary ? "#FFBE0B" : sc.bar}55`,
                    }}>{STATUS_LABEL[w.status] || w.status}</span>
                  )}
                  <span style={{ fontSize: 11, color: "#94A3B8" }}>
                    수정 {new Date(w.updatedAt).toLocaleDateString("ko-KR")}
                  </span>
                </div>
              </div>

              {/* 액션 버튼 */}
              <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                <button
                  onClick={() => onToggleLive(w)}
                  title={w.status === "LIVE" ? "LIVE 해제" : "LIVE로 전환"}
                  style={{
                    display: "inline-flex", alignItems: "center", gap: 6,
                    padding: "7px 12px", borderRadius: 8,
                    background: w.status === "LIVE"
                      ? "linear-gradient(135deg,#86efac 0%,#22c55e 100%)"
                      : "#F0FDF4",
                    color: w.status === "LIVE" ? "white" : "#16A34A",
                    border: w.status === "LIVE" ? "none" : "1px solid #BBF7D0",
                    fontSize: 11.5, fontWeight: 700, cursor: "pointer",
                    boxShadow: w.status === "LIVE" ? "0 2px 8px rgba(34,197,94,0.30)" : "none",
                  }}>
                  <span style={{
                    width: 8, height: 8, borderRadius: "50%",
                    background: w.status === "LIVE" ? "white" : "#22C55E",
                    boxShadow: w.status === "LIVE"
                      ? "0 0 0 2px rgba(255,255,255,0.45)"
                      : "0 0 0 2px rgba(34,197,94,0.20)",
                    animation: w.status === "LIVE" ? "liveBlink 1.4s ease-in-out infinite" : "none",
                    display: "inline-block",
                  }} />
                  LIVE
                </button>
                <button
                  onClick={() => { if (!isPrimary) setPrimaryTarget({ id: w.id, name: w.name }); }}
                  title={isPrimary ? "대표 전략" : "대표로 선택"}
                  style={{
                    display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 5,
                    minWidth: 92,
                    padding: "7px 12px", borderRadius: 8,
                    background: isPrimary
                      ? "linear-gradient(135deg,#fde68a 0%,#f59e0b 100%)"
                      : "white",
                    color: isPrimary ? "white" : "#475569",
                    border: isPrimary ? "none" : "1px solid #E2E8F0",
                    fontSize: 11.5, fontWeight: 700, cursor: "pointer",
                    boxShadow: isPrimary ? "0 2px 8px rgba(245,158,11,0.30)" : "none",
                  }}>
                  {/* 통통한 별 SVG — 선택 시 노란 채움, 비선택 시 노란 외곽선만 */}
                  <svg width="14" height="14" viewBox="0 0 24 24" style={{ display: "block" }}>
                    <path
                      d="M12 2.5l2.95 5.98 6.6.96-4.78 4.65 1.13 6.57L12 17.55l-5.9 3.11 1.13-6.57L2.45 9.44l6.6-.96L12 2.5z"
                      fill={isPrimary ? "#FFFFFF" : "none"}
                      stroke={isPrimary ? "#FFFFFF" : "#F59E0B"}
                      strokeWidth="2"
                      strokeLinejoin="round"
                    />
                  </svg>
                  {isPrimary ? "대표" : "대표 선택"}
                </button>
                <button onClick={e => {
                  const btn = e.currentTarget;
                  btn.style.transform = "scale(0.94)";
                  btn.style.opacity = "0.8";
                  setTimeout(() => navigate(`/alpha/w/${w.id}`), 120);
                }} style={{
                  padding: "7px 14px",
                  background: "linear-gradient(135deg,#60a5fa 0%,#6366f1 100%)",
                  color: "white", border: "none", borderRadius: 8,
                  fontSize: 11.5, fontWeight: 700, cursor: "pointer",
                  display: "inline-flex", alignItems: "center", gap: 4,
                  boxShadow: "0 2px 8px rgba(99,102,241,0.25)",
                  transition: "transform 0.12s, opacity 0.12s",
                }}>열기 <ArrowRight size={13} /></button>
                <button onClick={() => onDelete(w.id, w.name)} title="삭제" style={{
                  padding: "7px 8px", background: "transparent",
                  color: "#EF4444", border: "1px solid #FECACA",
                  borderRadius: 8, cursor: "pointer", display: "inline-flex",
                }}>
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          </div>
            );
          })}
      </div>

      <CreateWorkspaceModal
        open={createModalOpen}
        name={createModalName}
        onChange={setCreateModalName}
        onConfirm={onConfirmCreate}
        onClose={() => setCreateModalOpen(false)}
        theme={theme}
      />
      <DeleteWorkspaceModal
        target={deleteTarget}
        onConfirm={onConfirmDelete}
        onClose={() => setDeleteTarget(null)}
        theme={theme}
      />
      <SetPrimaryModal
        target={primaryTarget}
        onConfirm={onConfirmPrimary}
        onClose={() => setPrimaryTarget(null)}
      />
    </div>
  );
}

function CreateWorkspaceModal({ open, name, onChange, onConfirm, onClose, theme }) {
  if (!open) return null;
  return (
    <div onClick={onClose} style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 3000,
      display: "flex", alignItems: "center", justifyContent: "center", padding: 24,
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: "white", borderRadius: 20, width: "100%", maxWidth: 460,
        boxShadow: "0 24px 64px rgba(0,0,0,0.22)", overflow: "hidden",
      }}>
        {/* 헤더 */}
        <div style={{
          padding: "24px 28px 20px",
          background: "linear-gradient(135deg,#eff6ff 0%,#e0e7ff 100%)",
          borderBottom: "1px solid #E2E8F0",
          display: "flex", alignItems: "center", justifyContent: "space-between",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div style={{
              width: 44, height: 44, borderRadius: 14, flexShrink: 0,
              background: "linear-gradient(135deg,#60a5fa,#6366f1)",
              display: "flex", alignItems: "center", justifyContent: "center",
              boxShadow: "0 4px 12px rgba(99,102,241,0.3)",
            }}>
              <Layers size={20} color="white" />
            </div>
            <div>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: "#1e3a8a" }}>새 워크스페이스</h2>
              <p style={{ margin: "3px 0 0", fontSize: 12, color: "#475569" }}>삶의 목표를 투자 전략으로 변환합니다</p>
            </div>
          </div>
          <button onClick={onClose} style={{
            width: 30, height: 30, borderRadius: "50%", border: "1px solid #C7D2FE",
            background: "white", cursor: "pointer", display: "flex",
            alignItems: "center", justifyContent: "center", color: "#475569", flexShrink: 0,
          }}><X size={14} /></button>
        </div>

        {/* 본문 */}
        <div style={{ padding: "24px 28px" }}>
          <label style={{ fontSize: 12, fontWeight: 700, color: "#374151", display: "block", marginBottom: 8 }}>
            워크스페이스 이름
          </label>
          <input
            autoFocus
            value={name}
            onChange={e => onChange(e.target.value)}
            onKeyDown={e => { if (e.nativeEvent.isComposing) return; if (e.key === "Enter") onConfirm(); if (e.key === "Escape") onClose(); }}
            placeholder="예: 5년 후 월 300만원 현금흐름"
            style={{
              width: "100%", padding: "12px 14px", borderRadius: 10,
              border: "1.5px solid #C7D2FE", fontSize: 14, outline: "none",
              boxSizing: "border-box", color: "#0F172A",
              transition: "border-color 0.15s",
            }}
            onFocus={e => e.target.style.borderColor = "#6366f1"}
            onBlur={e => e.target.style.borderColor = "#C7D2FE"}
          />
          <p style={{ margin: "10px 0 0", fontSize: 12, color: "#94A3B8", lineHeight: 1.6 }}>
            이름은 나중에 AI와 대화하면서 자동으로 목표에 맞게 구체화됩니다.
          </p>
        </div>

        {/* 푸터 */}
        <div style={{ padding: "0 28px 24px", display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button onClick={onClose} style={{
            padding: "10px 20px", borderRadius: 10,
            border: "1px solid #E2E8F0", background: "white", color: "#374151",
            fontSize: 13, fontWeight: 600, cursor: "pointer",
          }}>취소</button>
          <button onClick={onConfirm} disabled={!name.trim()} style={{
            padding: "10px 20px", borderRadius: 10, border: "none",
            background: name.trim()
              ? "linear-gradient(135deg,#60a5fa 0%,#3b82f6 50%,#6366f1 100%)"
              : "#E2E8F0",
            color: name.trim() ? "white" : "#94A3B8",
            fontSize: 13, fontWeight: 700,
            cursor: name.trim() ? "pointer" : "not-allowed",
            boxShadow: name.trim() ? "0 3px 10px rgba(99,102,241,0.3)" : "none",
          }}>워크스페이스 생성</button>
        </div>
      </div>
    </div>
  );
}

function DeleteWorkspaceModal({ target, onConfirm, onClose, theme }) {
  if (!target) return null;
  return (
    <div onClick={onClose} style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 3000,
      display: "flex", alignItems: "center", justifyContent: "center", padding: 24,
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: "white", borderRadius: 20, width: "100%", maxWidth: 420,
        boxShadow: "0 24px 64px rgba(0,0,0,0.22)", overflow: "hidden",
      }}>
        <div style={{
          padding: "24px 28px 20px",
          background: "linear-gradient(135deg,#fef2f2 0%,#fee2e2 100%)",
          borderBottom: "1px solid #FECACA",
          display: "flex", alignItems: "center", gap: 14,
        }}>
          <div style={{
            width: 44, height: 44, borderRadius: 14, flexShrink: 0,
            background: "linear-gradient(135deg,#f87171,#ef4444)",
            display: "flex", alignItems: "center", justifyContent: "center",
            boxShadow: "0 4px 12px rgba(239,68,68,0.3)",
          }}>
            <Trash2 size={20} color="white" />
          </div>
          <div>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: "#7f1d1d" }}>워크스페이스 삭제</h2>
            <p style={{ margin: "3px 0 0", fontSize: 12, color: "#991b1b" }}>이 작업은 되돌릴 수 없습니다</p>
          </div>
        </div>
        <div style={{ padding: "24px 28px" }}>
          <p style={{ margin: 0, fontSize: 14, color: "#374151", lineHeight: 1.7 }}>
            <b style={{ color: "#111827" }}>"{target.name}"</b> 워크스페이스를 삭제할까요?
          </p>
          <div style={{
            marginTop: 14, padding: "12px 14px", borderRadius: 10,
            background: "#FEF2F2", border: "1px solid #FECACA",
            fontSize: 12.5, color: "#991b1b", lineHeight: 1.65,
          }}>
            ⚠️ AI 대화 내역, 전략 설정, Decision Log 등 모든 데이터가 <b>영구 삭제</b>됩니다.
          </div>
        </div>
        <div style={{ padding: "0 28px 24px", display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button onClick={onClose} style={{
            padding: "10px 20px", borderRadius: 10,
            border: "1px solid #E2E8F0", background: "white", color: "#374151",
            fontSize: 13, fontWeight: 600, cursor: "pointer",
          }}>취소</button>
          <button onClick={onConfirm} style={{
            padding: "10px 20px", borderRadius: 10, border: "none",
            background: "linear-gradient(135deg,#f87171,#ef4444)",
            color: "white", fontSize: 13, fontWeight: 700, cursor: "pointer",
            boxShadow: "0 3px 10px rgba(239,68,68,0.3)",
          }}>삭제하기</button>
        </div>
      </div>
    </div>
  );
}

function SetPrimaryModal({ target, onConfirm, onClose }) {
  if (!target) return null;
  return (
    <div onClick={onClose} style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 3000,
      display: "flex", alignItems: "center", justifyContent: "center", padding: 24,
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: "#ffffff", borderRadius: 20, width: "100%", maxWidth: 420,
        border: "none", overflow: "hidden",
        boxShadow: "0 0 12px rgba(251,191,36,0.3), 0 0 30px rgba(251,191,36,0.15)",
      }}>
        <div style={{
          padding: "24px 28px 20px",
          background: "#ffffff",
          borderBottom: "1px solid #F1F5F9",
          display: "flex", alignItems: "center", gap: 14,
        }}>
          <div style={{
            width: 44, height: 44, borderRadius: 14, flexShrink: 0,
            background: "#FEF3C7",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <Star size={20} color="#B45309" />
          </div>
          <div>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: "#0F172A" }}>대표 워크스페이스 설정</h2>
            <p style={{ margin: "3px 0 0", fontSize: 12, color: "#64748B" }}>홈 화면 브리핑 및 요약에 사용됩니다</p>
          </div>
        </div>
        <div style={{ padding: "24px 28px" }}>
          <p style={{ margin: 0, fontSize: 14, color: "#374151", lineHeight: 1.7 }}>
            <b style={{ color: "#111827" }}>"{target.name}"</b>을 대표 워크스페이스로 설정할까요?
          </p>
          <div style={{
            marginTop: 14, padding: "12px 14px", borderRadius: 10,
            background: "#FFFBEB", border: "1px solid #FDE68A",
            fontSize: 12.5, color: "#78350F", lineHeight: 1.65,
          }}>
            ★ 대표 워크스페이스는 홈 브리핑·오늘의 요약 등에 우선 표시됩니다.
          </div>
        </div>
        <div style={{ padding: "0 28px 24px", display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button onClick={onClose} style={{
            padding: "10px 20px", borderRadius: 10,
            border: "1px solid #E2E8F0", background: "white", color: "#374151",
            fontSize: 13, fontWeight: 600, cursor: "pointer",
          }}>취소</button>
          <button
            onClick={onConfirm}
            onMouseEnter={e => e.currentTarget.style.background = "#FEF3C7"}
            onMouseLeave={e => e.currentTarget.style.background = "#FFFBEB"}
            style={{
              padding: "10px 20px", borderRadius: 10,
              border: "1px solid #FDE68A",
              background: "#FFFBEB",
              color: "#92400E", fontSize: 13, fontWeight: 700, cursor: "pointer",
            }}>대표로 설정</button>
        </div>
      </div>
    </div>
  );
}
