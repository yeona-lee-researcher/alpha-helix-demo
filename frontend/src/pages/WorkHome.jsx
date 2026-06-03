import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, TrendingUp, Sparkles, ArrowRight, Pencil, Check, X, Layers } from "lucide-react";
import { listWorkspaces, getWorkspace, runBriefing, createWorkspace } from "../alpha/alphaApi";
import { useTheme } from "../alpha/ThemeContext";
import { useLanguage } from "../i18n/LanguageContext";

/**
 * WorkHome — 실제 백엔드(alpha_workspace) 데이터를 읽어 "오늘의 전략 상태 요약"을 표시.
 * - listWorkspaces → 각 워크스페이스 getWorkspace → last_trust_json 읽음 (Trust Score · Status)
 * - 첫 워크스페이스에서 runBriefing 실행 → Today's Living Briefing 요약 렌더링
 * - + New Strategy Workspace → 이름 입력 후 실제 행 생성 → /strategy/:id
 */
const F = "'Inter', 'Pretendard', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

function healthFromTrust(score) {
  if (score == null) return { key: "unmeasured", color: "#94A3B8", bg: "#F1F5F9", gradient: "linear-gradient(90deg,#CBD5E1,#E2E8F0)" };
  if (score >= 75)   return { key: "stable",     color: "#10B981", bg: "#ECFDF5", gradient: "linear-gradient(90deg,#10B981,#34D399)" };
  if (score >= 60)   return { key: "normal",     color: "#3B82F6", bg: "#EFF6FF", gradient: "linear-gradient(90deg,#3B82F6,#60A5FA)" };
  return                    { key: "caution",    color: "#F59E0B", bg: "#FFFBEB", gradient: "linear-gradient(90deg,#F59E0B,#FCD34D)" };
}

export default function WorkHome() {
  const nav = useNavigate();
  const { theme } = useTheme();
  const { t } = useLanguage();
  const username = (typeof window !== "undefined" && (localStorage.getItem("username") || localStorage.getItem("dbName"))) || "trader";
  const [strategies, setStrategies] = useState([]); // [{ id, name, trust, status, color, label, goal, progress }]
  const [briefing, setBriefing] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const list = await listWorkspaces();
        const fulls = await Promise.all(list.map(w => getWorkspace(w.id).catch(() => null)));
        const items = (fulls.filter(Boolean)).map(w => {
          const trust = (w.lastTrust && typeof w.lastTrust === "object") ? (w.lastTrust.trust_score ?? null) : null;
          const h = healthFromTrust(trust);
          const goal = (w.goalProfile && typeof w.goalProfile === "object")
            ? (w.goalProfile.목표 || w.goalProfile.goal || w.goalProfile.summary || null) : null;
          return { id: w.id, name: w.name, trust, status: w.status, healthKey: h.key, color: h.color, bg: h.bg, gradient: h.gradient, goal };
        });
        setStrategies(items);

        // 첫 워크스페이스에서 오늘의 브리핑 시도 (실패해도 페이지 렌더링은 계속)
        if (items.length > 0) {
          try {
            const b = await runBriefing(items[0].id);
            setBriefing(b);
          } catch (_) { /* ignore */ }
        }
      } catch (e) {
        setErr(e?.response?.data?.error || e.message);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const firstGoal = strategies.find(s => s.goal)?.goal;
  const firstWs = strategies[0];
  const [slogan, setSlogan] = useState("");
  const [editGoal, setEditGoal] = useState(false);
  const [draft, setDraft] = useState("");
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [createModalName, setCreateModalName] = useState("");
  const [creating, setCreating] = useState(false);


  const startEdit = () => {
    setDraft(slogan || firstGoal || "");
    setEditGoal(true);
  };
  const saveEdit = () => {
    const next = draft.trim();
    setSlogan(next);
    setEditGoal(false);
  };

  const onNewWs = () => { setCreateModalName(""); setCreateModalOpen(true); };

  const onConfirmCreate = async () => {
    if (!createModalName.trim()) return;
    setCreateModalOpen(false);
    setCreating(true);
    try {
      const w = await createWorkspace(createModalName.trim());
      nav(`/alpha/w/${w.id}`);
    } catch (e) {
      alert(t("workhome.createFailed", { err: e?.response?.data?.error || e.message }));
    } finally {
      setCreating(false);
    }
  };

  return (
    <div style={{
      padding: "36px 40px 80px",
      background: "#F8FAFC",
      minHeight: "calc(100vh - 44px)",
      fontFamily: F,
      color: "#0F172A",
    }}>
      {/* 헤더 */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 32, flexWrap: "wrap", gap: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <div style={{
            width: 54, height: 54, borderRadius: 17, flexShrink: 0,
            background: "linear-gradient(135deg,#60a5fa 0%,#6366f1 100%)",
            display: "flex", alignItems: "center", justifyContent: "center",
            boxShadow: "0 6px 20px rgba(99,102,241,0.32)",
          }}>
            <TrendingUp size={24} color="white" strokeWidth={2.2} />
          </div>
          <div>
            <h1 style={{
              margin: 0, fontSize: 26, fontWeight: 800, lineHeight: 1.15,
              background: "linear-gradient(90deg,#3b82f6 0%,#6366f1 100%)",
              WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
            }}>
              {greeting()}, {username}
            </h1>
            <p style={{ margin: "5px 0 0", fontSize: 13, color: "#64748B", fontWeight: 500 }}>
              {t("workhome.subtitle")}
            </p>
          </div>
        </div>
      </div>

      {/* 상단 2-column 카드 */}
      <div style={{
        display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20,
        marginBottom: 36,
      }}>
        {/* Freedom Goal Card */}
        <section style={cardStyle}>
          <div style={cardHeader}>
            <span style={{ ...iconBubble, color: "#10B981", background: "#ECFDF5" }}>
              <TrendingUp size={18} />
            </span>
            <h3 style={cardTitle}>Freedom Goal</h3>
          </div>
          <div style={{ fontSize: 16, color: "#64748B", margin: "6px 0 18px", paddingLeft: 36, display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ flexShrink: 0 }}>{t("workhome.goal")}</span>
            {editGoal ? (
              <>
                <input
                  value={draft}
                  onChange={e => setDraft(e.target.value)}
                  onKeyDown={e => { if (e.nativeEvent.isComposing) return; if (e.key === "Enter") saveEdit(); if (e.key === "Escape") setEditGoal(false); }}
                  disabled={false}
                  style={{
                    flex: 1, padding: "6px 10px", borderRadius: 8,
                    border: "1px solid #CBD5E1", fontSize: 16, color: "#0F172A",
                    outline: "none", background: "white",
                  }}
                  autoFocus
                />
                <button onClick={saveEdit} disabled={false} title={t("common.save")} style={iconBtn("#10B981")}>
                  <Check size={14} />
                </button>
                <button onClick={() => setEditGoal(false)} disabled={false} title={t("common.cancel")} style={iconBtn("#94A3B8")}>
                  <X size={14} />
                </button>
              </>
            ) : (
              <>
                <span style={{ color: "#0F172A", flex: 1, wordBreak: "break-all" }}>
                  {slogan || firstGoal || (loading ? t("workhome.loading") : t("workhome.sloganEmpty"))}
                </span>
                <button onClick={startEdit} title={t("common.edit")} style={iconBtn("#64748B")}>
                  <Pencil size={13} />
                </button>
              </>
            )}
          </div>
          <div style={{ paddingLeft: 36 }}>
            <button onClick={() => nav("/vision_board")}
              style={{
                background: "transparent", border: "none",
                color: theme.accent, fontSize: 13, fontWeight: 700,
                cursor: "pointer", padding: 0,
                display: "inline-flex", alignItems: "center", gap: 4,
              }}>
              {t("workhome.visionBoard")} <ArrowRight size={14} />
            </button>
          </div>
        </section>

        {/* Today's Living Briefing */}
        <section style={cardStyle}>
          <div style={cardHeader}>
            <span style={{ ...iconBubble, color: "#6366f1", background: "#EEF2FF" }}>
              <Sparkles size={18} />
            </span>
            <h3 style={cardTitle}>Today's Living Briefing</h3>
          </div>
          <p style={{ fontSize: 13.5, color: "#334155", lineHeight: 1.65, margin: "8px 0 18px", paddingLeft: 36, whiteSpace: "pre-wrap" }}>
            {briefing?.briefing
              ? (briefing.briefing.split(/\n+/).map(s => s.trim().replace(/["""'']/g, "").replace(/,\s*$/, "")).find(l => l.length >= 10) || briefing.briefing.slice(0, 160))
              : (loading ? t("workhome.briefingLoading") : t("workhome.briefingEmpty"))}
          </p>
          <button onClick={() => nav("/briefing")}
            style={{
              marginLeft: 36, background: "transparent", border: "none",
              color: theme.accent, fontSize: 13, fontWeight: 700,
              cursor: "pointer",
              display: "inline-flex", alignItems: "center", gap: 4,
              padding: 0,
            }}>
            {t("workhome.viewBriefing")} <ArrowRight size={14} />
          </button>
        </section>
      </div>

      {/* Strategy Health Cards */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        marginBottom: 16,
      }}>
        <h2 style={{ fontSize: 22, fontWeight: 800, margin: 0, color: "#0F172A" }}>
          Strategy Health Cards
        </h2>
        <button onClick={onNewWs}
          style={{
            display: "inline-flex", alignItems: "center", gap: 6,
            background: theme.accentGradient || theme.accent, color: "white", border: "none",
            padding: "10px 16px", borderRadius: 10, fontSize: 13, fontWeight: 700,
            cursor: "pointer", boxShadow: "0 4px 12px rgba(59,130,246,0.25)",
          }}
          onMouseEnter={e => e.currentTarget.style.filter = "brightness(1.05)"}
          onMouseLeave={e => e.currentTarget.style.filter = "none"}
        >
          <Plus size={15} /> {t("workhome.newWorkspace")}
        </button>
      </div>

      <div style={{
        display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
        gap: 16,
      }}>
        {err && (
          <div style={{ gridColumn: "1/-1", padding: 14, background: "#FEF2F2", color: "#B91C1C", border: "1px solid #FECACA", borderRadius: 10, fontSize: 13 }}>
            {t("workhome.loadFailed", { err })}
          </div>
        )}
        {!err && !loading && strategies.length === 0 && (
          <div style={{ gridColumn: "1/-1", padding: 28, background: "#F8FAFC", border: "1px dashed #CBD5E1", borderRadius: 12, textAlign: "center", color: "#64748B", fontSize: 14 }}>
            {t("workhome.noWorkspace")}
          </div>
        )}
        {loading && strategies.length === 0 && (
          <div style={{ gridColumn: "1/-1", padding: 20, color: "#94A3B8", fontSize: 13 }}>{t("workhome.loading")}</div>
        )}
        {strategies.map(s => {
          return (
            <div key={s.id} onClick={() => nav(`/alpha/w/${s.id}`)}
              style={{
                background: "white", border: "1px solid #E2E8F0",
                borderRadius: 14, cursor: "pointer",
                transition: "transform 0.15s, box-shadow 0.15s",
                boxShadow: "0 1px 4px rgba(15,23,42,0.06)",
              }}
              onMouseEnter={e => {
                e.currentTarget.style.boxShadow = "0 8px 24px rgba(15,23,42,0.10)";
                e.currentTarget.style.transform = "translateY(-2px)";
              }}
              onMouseLeave={e => {
                e.currentTarget.style.boxShadow = "0 1px 4px rgba(15,23,42,0.06)";
                e.currentTarget.style.transform = "translateY(0)";
              }}
            >
              <div style={{ padding: "16px 18px 18px" }}>
                <div style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 15, fontWeight: 700, color: "#0F172A", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {s.name}
                  </div>
                </div>
                {s.goal && (
                  <div style={{
                    fontSize: 12, color: "#64748B", marginBottom: 12, lineHeight: 1.5,
                    overflow: "hidden", textOverflow: "ellipsis", display: "-webkit-box",
                    WebkitLineClamp: 2, WebkitBoxOrient: "vertical",
                  }}>
                    {s.goal}
                  </div>
                )}
                <div style={{ marginBottom: 12 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 5 }}>
                    <span style={{ fontSize: 11, color: "#94A3B8", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em" }}>Trust Score</span>
                    <span style={{ fontSize: 18, fontWeight: 800, color: "#0F172A" }}>{s.trust ?? "—"}</span>
                  </div>
                  <div style={{ height: 5, borderRadius: 999, background: "#F1F5F9", overflow: "hidden" }}>
                    <div style={{
                      height: "100%", borderRadius: 999, background: s.gradient,
                      width: s.trust != null ? `${Math.min(s.trust, 100)}%` : "0%",
                      transition: "width 0.6s ease",
                    }} />
                  </div>
                </div>
                <div style={{
                  display: "inline-flex", alignItems: "center", gap: 4,
                  background: s.bg, color: s.color,
                  padding: "3px 10px", borderRadius: 999, fontSize: 11, fontWeight: 700,
                }}>
                  {t(`workhome.health.${s.healthKey}`)}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* 새 워크스페이스 생성 모달 */}
      {createModalOpen && (
        <div onClick={() => setCreateModalOpen(false)} style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 3000,
          display: "flex", alignItems: "center", justifyContent: "center", padding: 24,
        }}>
          <div onClick={e => e.stopPropagation()} style={{
            background: "white", borderRadius: 20, width: "100%", maxWidth: 460,
            boxShadow: "0 24px 64px rgba(0,0,0,0.22)", overflow: "hidden",
          }}>
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
                  <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: "#1e3a8a", fontFamily: F }}>{t("workhome.modal.title")}</h2>
                  <p style={{ margin: "3px 0 0", fontSize: 12, color: "#475569", fontFamily: F }}>{t("workhome.modal.subtitle")}</p>
                </div>
              </div>
              <button onClick={() => setCreateModalOpen(false)} style={{
                width: 30, height: 30, borderRadius: "50%", border: "1px solid #C7D2FE",
                background: "white", cursor: "pointer", display: "flex",
                alignItems: "center", justifyContent: "center", color: "#475569", flexShrink: 0,
              }}><X size={14} /></button>
            </div>
            <div style={{ padding: "24px 28px" }}>
              <label style={{ fontSize: 12, fontWeight: 700, color: "#374151", display: "block", marginBottom: 8, fontFamily: F }}>
                {t("workhome.modal.label")}
              </label>
              <input
                autoFocus
                value={createModalName}
                onChange={e => setCreateModalName(e.target.value)}
                onKeyDown={e => { if (e.nativeEvent.isComposing) return; if (e.key === "Enter") onConfirmCreate(); if (e.key === "Escape") setCreateModalOpen(false); }}
                placeholder={t("workhome.modal.placeholder")}
                style={{
                  width: "100%", padding: "12px 14px", borderRadius: 10,
                  border: "1.5px solid #C7D2FE", fontSize: 14, outline: "none",
                  boxSizing: "border-box", color: "#0F172A", fontFamily: F,
                  transition: "border-color 0.15s",
                }}
                onFocus={e => e.target.style.borderColor = "#6366f1"}
                onBlur={e => e.target.style.borderColor = "#C7D2FE"}
              />
              <p style={{ margin: "10px 0 0", fontSize: 12, color: "#94A3B8", lineHeight: 1.6, fontFamily: F }}>
                {t("workhome.modal.hint")}
              </p>
            </div>
            <div style={{ padding: "0 28px 24px", display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button onClick={() => setCreateModalOpen(false)} style={{
                padding: "10px 20px", borderRadius: 10,
                border: "1px solid #E2E8F0", background: "white", color: "#374151",
                fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: F,
              }}>{t("workhome.modal.cancel")}</button>
              <button onClick={onConfirmCreate} disabled={!createModalName.trim()} style={{
                padding: "10px 20px", borderRadius: 10, border: "none",
                background: createModalName.trim()
                  ? "linear-gradient(135deg,#60a5fa 0%,#3b82f6 50%,#6366f1 100%)"
                  : "#E2E8F0",
                color: createModalName.trim() ? "white" : "#94A3B8",
                fontSize: 13, fontWeight: 700, fontFamily: F,
                cursor: createModalName.trim() ? "pointer" : "not-allowed",
              }}>{t("workhome.modal.create")}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const cardStyle = {
  background: "white",
  border: "1px solid #E2E8F0",
  borderRadius: 14,
  padding: "22px 24px",
};
const cardHeader = { display: "flex", alignItems: "center", gap: 10, marginBottom: 4 };
const cardTitle = { fontSize: 17, fontWeight: 700, margin: 0, color: "#0F172A" };
const iconBubble = {
  width: 28, height: 28, borderRadius: 8,
  display: "inline-flex", alignItems: "center", justifyContent: "center",
};
const iconBtn = (color) => ({
  width: 26, height: 26, borderRadius: 6,
  border: "1px solid #E2E8F0", background: "white", color,
  display: "inline-flex", alignItems: "center", justifyContent: "center",
  cursor: "pointer", flexShrink: 0,
});
