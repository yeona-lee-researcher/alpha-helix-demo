import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Sparkles, RefreshCw, TrendingUp, ShieldCheck, Activity, ArrowRight, AlertCircle } from "lucide-react";
import { listWorkspaces, getWorkspace, runBriefing } from "../alpha/alphaApi";
import { useTheme } from "../alpha/ThemeContext";
import { useLanguage } from "../i18n/LanguageContext";

const F = "'Inter', 'Pretendard', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
const COOLDOWN_MS = 3 * 60 * 60 * 1000;
const cacheKey = (id) => `alpha.briefing.cache.${id}`;

function extractAssets(cfg) {
  if (!cfg) return [];
  const cand = cfg.assets || cfg.tickers || cfg.symbols || cfg.universe || cfg.portfolio?.assets || [];
  if (Array.isArray(cand)) return cand.map(x => (typeof x === "string" ? x : x?.ticker || x?.symbol || "")).filter(Boolean);
  if (typeof cand === "string") return cand.split(/[,\s/]+/).filter(Boolean);
  return [];
}

function extractKeywords(cfg) {
  if (!cfg || typeof cfg !== "object") return [];
  const out = new Set();
  const push = (v) => { if (typeof v === "string" && v.trim() && v.length <= 30) out.add(v.trim()); };
  push(cfg.strategy_type); push(cfg.style); push(cfg.regime); push(cfg.timeframe);
  push(cfg.benchmark); push(cfg.rebalance); push(cfg.signal_type);
  if (Array.isArray(cfg.tags)) cfg.tags.forEach(push);
  if (Array.isArray(cfg.factors)) cfg.factors.forEach(push);
  return Array.from(out).slice(0, 8);
}

// 경량 인라인 마크다운: **굵게** → <strong>, `코드` → 강조. (줄바꿈은 pre-wrap 이 유지)
function MarkdownLite({ text }) {
  if (!text) return null;
  const parts = String(text).split(/(\*\*[^*\n]+\*\*|`[^`\n]+`)/g);
  return parts.map((p, i) => {
    const b = p.match(/^\*\*([^*\n]+)\*\*$/);
    if (b) return <strong key={i} style={{ fontWeight: 800, color: "#0F172A" }}>{b[1]}</strong>;
    const c = p.match(/^`([^`\n]+)`$/);
    if (c) return <code key={i} style={{ background: "#E2E8F0", borderRadius: 4, padding: "1px 5px", fontSize: "0.9em" }}>{c[1]}</code>;
    return <React.Fragment key={i}>{p}</React.Fragment>;
  });
}

function cleanBriefing(raw) {
  if (!raw) return raw;
  // 객체면 재귀로 문자열 추출
  if (typeof raw === "object") {
    return Object.values(raw).map(v => cleanBriefing(v)).filter(Boolean).join("\n\n");
  }
  const s = String(raw);
  // JSON 문자열이면 파싱 후 재처리
  try {
    const parsed = JSON.parse(s);
    return cleanBriefing(parsed);
  } catch (_) {}
  // 그냥 문자열: { } [ ] " 제거, 남은 콤마+공백 정리
  return s
    .replace(/[{}\[\]"]/g, "")
    .replace(/,\s*\n/g, "\n")
    .replace(/^\s*,|,\s*$/gm, "")
    .trim();
}

export default function BriefingPage() {
  const nav = useNavigate();
  const { theme } = useTheme();
  const { t } = useLanguage();
  const username = (typeof window !== "undefined" && (localStorage.getItem("username") || localStorage.getItem("dbName"))) || "trader";

  const [strategies, setStrategies] = useState([]); // [{id,name,status,assets,keywords,trust,goal}]
  const [briefings, setBriefings] = useState({}); // { [wsId]: { briefing, generatedAt } | { error } }
  const [busyId, setBusyId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);

  const loadAll = async () => {
    setLoading(true); setErr(null);
    try {
      const list = await listWorkspaces();
      const fulls = await Promise.all(list.map(w => getWorkspace(w.id).catch(() => null)));
      const items = fulls.filter(Boolean).map(w => {
        const cfg = w.strategyConfig || {};
        const trust = (w.lastTrust && typeof w.lastTrust === "object") ? (w.lastTrust.trust_score ?? null) : null;
        const goal = (w.goalProfile && typeof w.goalProfile === "object") ? (w.goalProfile.목표 || w.goalProfile.goal || null) : null;
        return {
          id: w.id, name: w.name, status: w.status,
          assets: extractAssets(cfg), keywords: extractKeywords(cfg),
          trust, goal,
        };
      });
      setStrategies(items);

      // 캐시에 있는 브리핑 우선 복원
      const cached = {};
      items.forEach(s => {
        try {
          const raw = localStorage.getItem(cacheKey(s.id));
          if (raw) cached[s.id] = JSON.parse(raw);
        } catch (_) {}
      });
      setBriefings(cached);
    } catch (e) {
      setErr(e?.response?.data?.error || e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadAll(); }, []);

  const refreshOne = async (wsId) => {
    setBusyId(wsId);
    try {
      const b = await runBriefing(wsId);
      const rec = { ...b, generatedAt: Date.now() };
      setBriefings(prev => ({ ...prev, [wsId]: rec }));
      try { localStorage.setItem(cacheKey(wsId), JSON.stringify(rec)); } catch (_) {}
    } catch (e) {
      setBriefings(prev => ({ ...prev, [wsId]: { error: e?.response?.data?.error || e.message } }));
    } finally {
      setBusyId(null);
    }
  };

  const handleRefreshOne = (wsId) => {
    const existing = briefings[wsId];
    if (existing?.generatedAt && Date.now() - existing.generatedAt < COOLDOWN_MS) {
      const remainMin = Math.ceil((COOLDOWN_MS - (Date.now() - existing.generatedAt)) / 60000);
      const h = Math.floor(remainMin / 60), m = remainMin % 60;
      const time = h > 0 ? `${h}h ${m}m` : `${m}m`;
      alert(t("briefing.cooldownAlert", { time }));
      return;
    }
    refreshOne(wsId);
  };

  const liveOnly = strategies.filter(s => s.status === "LIVE");
  const showList = liveOnly.length > 0 ? liveOnly : strategies;

  return (
    <div style={{ padding: "36px 40px 80px", background: "#F8FAFC", minHeight: "calc(100vh - 44px)", fontFamily: F, color: "#0F172A" }}>
      {/* 헤더 */}
      <div style={{ display: "flex", alignItems: "center", gap: 18, marginBottom: 28 }}>
        <div style={{
          width: 54, height: 54, borderRadius: 17, flexShrink: 0,
          background: "linear-gradient(135deg,#a78bfa 0%,#6366f1 100%)",
          display: "flex", alignItems: "center", justifyContent: "center",
          boxShadow: "0 6px 20px rgba(99,102,241,0.32)",
        }}>
          <Sparkles size={24} color="white" strokeWidth={2.2} />
        </div>
        <div style={{ flex: 1 }}>
          <h1 style={{
            margin: 0, fontSize: 26, fontWeight: 800, lineHeight: 1.15,
            background: "linear-gradient(90deg,#6366f1 0%,#a78bfa 100%)",
            WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
          }}>
            {t("briefing.title")}
          </h1>
          <p style={{ margin: "5px 0 0", fontSize: 13, color: "#64748B", fontWeight: 500 }}>
            {t("briefing.subtitle", { name: username })}
          </p>
        </div>
        <button onClick={loadAll} disabled={loading} style={{
          display: "inline-flex", alignItems: "center", gap: 6,
          padding: "9px 14px", borderRadius: 9, border: "1px solid #E5E7EB",
          background: "white", color: "#0F172A", fontSize: 13, fontWeight: 600,
          cursor: loading ? "wait" : "pointer",
        }}>
          <RefreshCw size={14} /> {loading ? t("briefing.loading") : t("briefing.refresh")}
        </button>
      </div>

      {err && (
        <div style={{ padding: 12, background: "rgba(220,38,38,0.08)", border: "1px solid rgba(220,38,38,0.25)", borderRadius: 10, color: "#b91c1c", fontSize: 13, marginBottom: 16 }}>
          {err}
        </div>
      )}

      {/* 안내 배너 */}
      {!loading && strategies.length === 0 && (
        <div style={{ padding: 24, background: "white", border: "1px solid #E2E8F0", borderRadius: 14, textAlign: "center" }}>
          <AlertCircle size={28} color="#94A3B8" style={{ marginBottom: 8 }} />
          <div style={{ fontSize: 14, color: "#475569", marginBottom: 12 }}>
            {t("briefing.noWorkspace")}
          </div>
          <button onClick={() => nav("/alpha?new=1")} style={{
            padding: "10px 16px", borderRadius: 9, border: "none",
            background: "linear-gradient(135deg,#60a5fa 0%,#3b82f6 50%,#6366f1 100%)",
            color: "white", fontSize: 13, fontWeight: 700, cursor: "pointer",
            display: "inline-flex", alignItems: "center", gap: 6,
          }}>
            <ArrowRight size={14} /> {t("briefing.createWorkspace")}
          </button>
        </div>
      )}

      {!loading && strategies.length > 0 && liveOnly.length === 0 && (
        <div style={{ padding: "12px 16px", background: "#FEF9C3", border: "1px solid #FCD34D", borderRadius: 10, color: "#713f12", fontSize: 13, marginBottom: 16, fontWeight: 500 }}>
          {t("briefing.noLive")}
        </div>
      )}

      {/* 전략 카드 리스트 */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 18 }}>
        {showList.map(s => {
          const b = briefings[s.id];
          const busy = busyId === s.id;
          return (
            <section key={s.id} style={{
              background: "white", border: "1px solid #E2E8F0", borderRadius: 14,
              padding: "20px 22px", boxShadow: "0 1px 2px rgba(15,23,42,0.04)",
            }}>
              {/* 카드 헤더 */}
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: 12, flexWrap: "wrap" }}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                    <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: "#0F172A" }}>{s.name}</h2>
                    {s.status === "LIVE" && (
                      <span style={{ fontSize: 10.5, fontWeight: 700, color: "#16A34A", background: "#DCFCE7", border: "1px solid #16A34A", borderRadius: 999, padding: "2px 8px" }}>● LIVE</span>
                    )}
                    {s.trust != null && (
                      <span style={{ fontSize: 11.5, fontWeight: 700, color: "#1d4ed8", background: "#DBEAFE", borderRadius: 999, padding: "2px 8px", display: "inline-flex", alignItems: "center", gap: 4 }}>
                        <ShieldCheck size={11} /> Trust {s.trust}
                      </span>
                    )}
                  </div>
                  {s.goal && (
                    <div style={{ fontSize: 12.5, color: "#64748B", marginBottom: 6 }}>🎯 {s.goal}</div>
                  )}
                  {/* 핵심 키워드 chip */}
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 4 }}>
                    {s.assets.slice(0, 8).map(a => (
                      <span key={`a-${a}`} style={{ fontSize: 11.5, fontWeight: 700, color: "#0369a1", background: "#E0F2FE", borderRadius: 6, padding: "3px 8px" }}>{a}</span>
                    ))}
                    {s.keywords.map(k => (
                      <span key={`k-${k}`} style={{ fontSize: 11.5, fontWeight: 600, color: "#5b21b6", background: "#EDE9FE", borderRadius: 6, padding: "3px 8px" }}>#{k}</span>
                    ))}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <button onClick={() => handleRefreshOne(s.id)} disabled={busy} style={{
                    display: "inline-flex", alignItems: "center", gap: 6,
                    padding: "8px 12px", borderRadius: 8, border: "1px solid #E5E7EB",
                    background: "white", color: "#0F172A", fontSize: 12.5, fontWeight: 600,
                    cursor: busy ? "wait" : "pointer",
                  }}>
                    <RefreshCw size={12} /> {busy ? t("briefing.generating") : (b?.briefing ? t("briefing.regenerate") : t("briefing.generate"))}
                  </button>
                  <button onClick={() => nav(`/alpha/w/${s.id}`)} style={{
                    display: "inline-flex", alignItems: "center", gap: 4,
                    padding: "8px 12px", borderRadius: 8, border: "none",
                    background: "#DBEAFE", color: "#1e3a5f", fontSize: 12.5, fontWeight: 600, cursor: "pointer",
                  }}>
                    {t("briefing.openWorkspace")} <ArrowRight size={12} />
                  </button>
                </div>
              </div>

              {/* 브리핑 본문 */}
              <div style={{
                background: "#F8FAFC", borderRadius: 10, padding: "14px 16px",
                fontSize: 14, color: "#0F172A", lineHeight: 1.7, whiteSpace: "pre-wrap",
                minHeight: 64,
              }}>
                {b?.briefing
                  ? <MarkdownLite text={cleanBriefing(b.briefing)} />
                  : b?.error
                    ? <span style={{ color: "#b91c1c" }}>⚠ {b.error}</span>
                    : <span style={{ color: "#94A3B8" }}>{busy ? t("briefing.generating") : t("briefing.generate")}</span>}
              </div>

              {Array.isArray(b?.references) && b.references.length > 0 && (
                <div style={{ marginTop: 12 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "#475569", marginBottom: 6 }}>
                    📚 {t("briefing.refsTitle", { count: b.references.length })}
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                    {b.references.map((r, i) => (
                      <a key={i} href={r.url} target="_blank" rel="noopener noreferrer"
                        style={{
                          display: "flex", alignItems: "baseline", gap: 7, textDecoration: "none",
                          padding: "6px 10px", borderRadius: 8, background: "#F1F5F9", border: "1px solid #E2E8F0",
                        }}>
                        <span style={{ fontSize: 11, color: "#64748B", flexShrink: 0 }}>{i + 1}.</span>
                        <span style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
                          <span style={{ fontSize: 12.5, color: "#2563EB", fontWeight: 600 }}>{r.title} ↗</span>
                          {r.why && <span style={{ fontSize: 11, color: "#64748B", marginTop: 1 }}>{r.why}</span>}
                        </span>
                      </a>
                    ))}
                  </div>
                </div>
              )}

              {b?.generatedAt && (
                <div style={{ fontSize: 11, color: "#94A3B8", marginTop: 8, textAlign: "right" }}>
                  {t("briefing.generatedAt")} {new Date(b.generatedAt).toLocaleString()}
                </div>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}
