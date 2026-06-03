import React, { useEffect, useState } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import {
  MessageSquare, Layers, BarChart3, Activity, ShieldCheck,
  ScrollText, Play, ChevronLeft, RefreshCw,
  AlertTriangle, FileText, Bot,
} from "lucide-react";
import { useTheme, BRAND_GRADIENT } from "./ThemeContext";
import {
  getWorkspace, runBacktest,
  listWorkspaces,
} from "./alphaApi";
import ConfigPanel from "./tabs/ConfigPanel";
import ReportPanel from "./tabs/ReportPanel";
import RegimePanel from "./tabs/RegimePanel";
import TrustPanel from "./tabs/TrustPanel";
import LogPanel from "./tabs/LogPanel";
import TabHelpCard from "./tabs/TabHelpCard";

// 메인 탭(상단 가운데) — AI 대화 탭은 우측 Heli 패널로 상시 노출되어 제거
const TABS = [
  { key: "config",   label: "전략 카드",        Icon: Layers },
  { key: "report",   label: "Backtest",          Icon: BarChart3 },
  { key: "regime",   label: "Regime",            Icon: Activity },
  { key: "trust",    label: "Trust Score",       Icon: ShieldCheck },
  { key: "log",      label: "Decision Log",      Icon: ScrollText },
];

// 우측 패널의 "전략 요약"용: strategyConfig에서 자산 추출
function extractAssets(strategyConfig) {
  if (!strategyConfig) return [];
  const cand =
    strategyConfig.assets ||
    strategyConfig.tickers ||
    strategyConfig.symbols ||
    strategyConfig.universe ||
    strategyConfig.portfolio?.assets ||
    [];
  if (Array.isArray(cand)) {
    return cand.map(x => (typeof x === "string" ? x : x?.ticker || x?.symbol || "")).filter(Boolean);
  }
  if (typeof cand === "string") return cand.split(/[,\s/]+/).filter(Boolean);
  return [];
}

const STATUS_LABEL = {
  DRAFT: "초안",
  GOAL_SET: "목표 설정됨",
  FORMALIZED: "전략 정형화",
  TESTED: "백테스트 완료",
  LIVE: "운용 중",
};

export default function Workspace() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { theme } = useTheme();
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = searchParams.get("tab") || localStorage.getItem("ah.workbench.defaultTab") || "config";
  const setTab = (t) => setSearchParams({ tab: t }, { replace: true });
  const [ws, setWs] = useState(null);
  const [err, setErr] = useState(null);
  const [siblings, setSiblings] = useState([]); // 좌측 사이드바: 다른 워크스페이스 리스트
  const [creating, setCreating] = useState(false);
  const [runningBT, setRunningBT] = useState(false);
  const [newStrategyOpen, setNewStrategyOpen] = useState(false);
  const [newStrategyName, setNewStrategyName] = useState("");

  // 우측 전략 요약 패널 가로 폭 (드래그로 조절)
  const [rightW, setRightW] = useState(() => {
    const v = Number(localStorage.getItem("alpha.rightPanelWidth"));
    return Number.isFinite(v) && v >= 280 && v <= 720 ? v : 380;
  });
  useEffect(() => { localStorage.setItem("alpha.rightPanelWidth", String(rightW)); }, [rightW]);
  const startRightResize = (e) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = rightW;
    const onMove = (ev) => {
      // 좌측으로 이동 = 패널 넓어짐 (drag left = wider)
      const next = Math.min(720, Math.max(280, startW - (ev.clientX - startX)));
      setRightW(next);
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  };

  useEffect(() => { localStorage.setItem("alpha.lastWsId", id); }, [id]);

  // Heli 대화창(RightChatDock)이 현재 어떤 탭에 있는지 알 수 있도록 브로드캐스트
  useEffect(() => {
    localStorage.setItem("alpha.activeTab", tab);
    window.dispatchEvent(new CustomEvent("alpha:tabChanged", { detail: { tab } }));
  }, [tab]);
  const reload = () => getWorkspace(id).then(setWs).catch(e => setErr(e.message));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { reload(); }, [id]);


  // Alpha Ezer 라이브 패치 후 자동 리로드
  useEffect(() => {
    const onReload = (e) => {
      if (!e?.detail || Number(e.detail.wsId) === Number(id)) reload();
    };
    window.addEventListener("alphaWorkspaceReload", onReload);
    return () => window.removeEventListener("alphaWorkspaceReload", onReload);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // 좌측 사이드바용 전체 워크스페이스 로드 + 각 ws의 trust 머지
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const list = await listWorkspaces();
        const fulls = await Promise.all(
          list.map(w => getWorkspace(w.id).catch(() => ({ id: w.id, name: w.name, status: w.status, lastTrust: null })))
        );
        if (cancelled) return;
        setSiblings(fulls.map(w => ({
          id: w.id,
          name: w.name,
          status: w.status,
          trust: (w.lastTrust && typeof w.lastTrust === "object") ? (w.lastTrust.trust_score ?? null) : null,
        })));
      } catch { /* noop */ }
    })();
    return () => { cancelled = true; };
  }, [id]);

  const onNewStrategy = () => {
    setNewStrategyName("");
    setNewStrategyOpen(true);
  };

  const onConfirmNewStrategy = async () => {
    if (!newStrategyName.trim()) return;
    setCreating(true);
    setNewStrategyOpen(false);
    try {
      navigate(`/alpha?new=${encodeURIComponent(newStrategyName.trim())}`);
    } finally { setCreating(false); }
  };

  const onTopBacktest = async () => {
    if (runningBT) return;
    if (!ws?.strategyConfig) {
      alert("먼저 Strategy를 정형화해야 백테스트를 실행할 수 있어요. (파라미터 수정 → Goal → Strategy)");
      setTab("config");
      return;
    }
    setRunningBT(true);
    try { await runBacktest(id); await reload(); setTab("report"); }
    catch (e) { alert("백테스트 실패: " + (e?.response?.data?.error || e.message)); }
    finally { setRunningBT(false); }
  };

  if (!ws && !err) return <div style={{ padding: 40, color: theme.textMuted }}>로딩 중…</div>;
  if (err) return <div style={{ padding: 40, color: theme.danger }}>{err}</div>;

  const trust = ws.lastTrust;
  const trustScore = trust?.trust_score;
  const subScores = trust?.sub_scores || {};
  const assets = extractAssets(ws.strategyConfig);
  const template = ws.strategyConfig?.template || ws.strategyConfig?.name || ws.name;
  const hasGoal = !!(ws.goalProfile?.target || ws.goalProfile?.objective || ws.goalProfile?.summary || ws.goalProfile?.goal);
  const goalSummary =
    ws.goalProfile?.target ||
    ws.goalProfile?.objective ||
    ws.goalProfile?.summary ||
    ws.goalProfile?.goal ||
    "목표가 아직 설정되지 않았습니다.";

  // 단순 regime 표시 (lastRegime 필드가 백엔드에 없는 경우 placeholder)
  const regimeText = ws.lastRegime?.current_label || ws.lastRegime?.label || "정상 (Normal)";
  const isHighVol = /high.*vol|위험|warning|⚡/i.test(regimeText);

  // Strategy Card 탭 상단 가로 요약 바 (기존 우측 4구역을 컴팩트하게 재구성)
  const topSummaryBar = (
    <div style={{
      display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 10,
      marginBottom: 18,
    }}>
      <div style={topCard(theme)}>
        <div style={topCardLabel(theme)}>목표</div>
        {hasGoal ? (
          <div style={{ fontSize: 13.5, fontWeight: 800, color: theme.text, marginTop: 2, marginBottom: 4, lineHeight: 1.35, display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
            {goalSummary}
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 4 }}>
            <div style={{ fontSize: 11, color: theme.textMuted, lineHeight: 1.4 }}>
              목표가 아직 설정되지 않았습니다.
            </div>
            <button
              onClick={() => window.dispatchEvent(new CustomEvent("alpha:open-chat", { detail: { goal: true } }))}
              style={{
                display: "inline-flex", alignItems: "center", gap: 5,
                padding: "5px 10px", borderRadius: 8, border: "none",
                background: "linear-gradient(135deg,#dbeafe,#ede9fe)",
                color: "#3730a3", fontSize: 11, fontWeight: 700, cursor: "pointer",
                alignSelf: "flex-start",
              }}
            >
              <Bot size={12} /> AI와 목표 설정하기
            </button>
          </div>
        )}
        <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          <span style={{ padding: "2px 8px", borderRadius: 999, background: theme.accentSoft, color: theme.accent, fontSize: 10.5, fontWeight: 700 }}>
            {STATUS_LABEL[ws.status] || ws.status}
          </span>
          {assets.length > 0 && (
            <span style={{ fontSize: 11, color: theme.text, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {assets.slice(0, 3).join(" / ")}{assets.length > 3 ? ` +${assets.length - 3}` : ""}
            </span>
          )}
        </div>
      </div>

      <div style={{
        ...topCard(theme),
        background: isHighVol ? "#FEF9C3" : topCard(theme).background,
        borderColor: isHighVol ? "#FDE68A" : topCard(theme).borderColor,
      }}>
        <div style={topCardLabel(theme)}>현재 REGIME</div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4, fontSize: 13, fontWeight: 800, color: isHighVol ? "#92400E" : theme.text }}>
          <AlertTriangle size={14} /> {regimeText}
        </div>
        <div style={{ fontSize: 11, color: isHighVol ? "#92400E" : theme.textMuted, marginTop: 6 }}>
          {isHighVol ? "Risk-off 조건 모니터링 중" : "Regime 탭에서 분석 실행"}
        </div>
      </div>

      <div style={topCard(theme)}>
        <div style={topCardLabel(theme)}>TRUST SCORE</div>
        <div style={{ display: "flex", alignItems: "baseline", gap: 4, marginTop: 4 }}>
          <span style={{ fontSize: 26, fontWeight: 900, color: theme.text, lineHeight: 1 }}>
            {trustScore != null ? trustScore : "—"}
          </span>
          <span style={{ fontSize: 11, color: theme.textMuted }}>/ 100</span>
        </div>
        {trustScore == null ? (
          <button onClick={() => setTab("trust")} style={{
            marginTop: 8, width: "100%", padding: "5px 8px", borderRadius: 6, border: `1px solid ${theme.panelBorder}`,
            background: "white", color: theme.text, fontSize: 11, fontWeight: 600, cursor: "pointer",
          }}>측정하기</button>
        ) : (
          <div style={{ marginTop: 6, fontSize: 10.5, color: theme.textMuted }}>
            세부 점수는 Trust 탭에서 확인
          </div>
        )}
      </div>

      <div style={topCard(theme)}>
        <div style={topCardLabel(theme)}>주요 리스크</div>
        <div style={{ fontSize: 11.5, color: theme.text, marginTop: 4, lineHeight: 1.5, display: "-webkit-box", WebkitLineClamp: 4, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
          {trust?.narrative || "Trust Score 측정 후 자동 분석된 리스크 요약이 표시됩니다."}
        </div>
      </div>
    </div>
  );

  return (
    <>
    <style>{`
      @keyframes wsfade { from { opacity: 0; } to { opacity: 1; } }
    `}</style>
    <div style={{ display: "grid", gridTemplateColumns: "240px 1fr", height: "100vh", background: theme.bg }}>
      {/* ============================== 왼쪽 사이드바 ============================== */}
      <aside style={{
        borderRight: `1px solid ${theme.panelBorder}`, background: theme.panel,
        padding: "20px 16px", display: "flex", flexDirection: "column", gap: 18, overflow: "auto",
      }}>
        <button onClick={() => navigate("/alpha")} style={{
          background: "transparent", border: "none", color: theme.textMuted, cursor: "pointer",
          display: "inline-flex", alignItems: "center", gap: 4, fontSize: 13, fontWeight: 600, padding: 0, alignSelf: "flex-start",
        }}><ChevronLeft size={14} /> 워크스페이스 목록</button>


        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: theme.textMuted, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 8 }}>전략 목록</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {siblings.map(s => {
              const active = String(s.id) === String(id);
              const tier = s.trust == null ? { label: "미측정", color: "#94A3B8", bar: "#CBD5E1" } :
                           s.trust >= 75    ? { label: "Stable",  color: "#10B981", bar: "#10B981" } :
                           s.trust >= 60    ? { label: "Normal",  color: "#3B82F6", bar: "#3B82F6" } :
                                              { label: "Caution", color: "#F59E0B", bar: "#F59E0B" };
              return (
                <button key={s.id} onClick={() => navigate(`/alpha/w/${s.id}`)}
                  style={{
                    textAlign: "left", padding: "10px 12px", borderRadius: 10,
                    cursor: "pointer", width: "100%",
                    background: active ? theme.accentSoft : "white",
                    border: active ? `1.5px solid ${theme.accent}` : "1.5px solid #E2E8F0",
                    boxShadow: active ? `0 2px 8px ${theme.accent}30` : "0 1px 3px rgba(0,0,0,0.06)",
                    transition: "box-shadow 0.15s, border-color 0.15s",
                  }}
                  onMouseEnter={e => { if (!active) { e.currentTarget.style.borderColor = "#C7D2FE"; e.currentTarget.style.boxShadow = "0 2px 8px rgba(99,102,241,0.12)"; } }}
                  onMouseLeave={e => { if (!active) { e.currentTarget.style.borderColor = "#E2E8F0"; e.currentTarget.style.boxShadow = "0 1px 3px rgba(0,0,0,0.06)"; } }}
                >
                  <div style={{
                    fontSize: 12.5, fontWeight: 700, marginBottom: 5,
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    color: active ? theme.accent : "#0F172A",
                  }}>{s.name}</div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{
                      display: "inline-block", width: 7, height: 7, borderRadius: "50%",
                      background: tier.bar, flexShrink: 0,
                    }} />
                    <span style={{ fontSize: 10.5, color: tier.color, fontWeight: 700 }}>{tier.label}</span>
                    {s.trust != null && (
                      <span style={{ fontSize: 10.5, color: "#94A3B8", marginLeft: 2 }}>
                        · {s.trust}점
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>

          <button onClick={onNewStrategy} disabled={creating} style={{
            marginTop: 10, width: "100%", padding: "10px 12px", borderRadius: 10,
            background: "transparent", border: `1px dashed ${theme.panelBorder}`,
            color: theme.textMuted, cursor: creating ? "wait" : "pointer", fontSize: 12.5, fontWeight: 600,
          }}>+ New Strategy</button>
        </div>

        {/* 탭별 도움말 — 이미지의 파란 안내 창을 여기로 이동 */}
        <TabHelpCard tab={tab} theme={theme} />
      </aside>

      {/* ============================== 가운데 본문 ============================== */}
      <main key={id} style={{ display: "flex", flexDirection: "column", overflow: "hidden", animation: "wsfade 0.25s ease" }}>
        {/* 상단: 전략 이름 + 액션 */}
        <div style={{
          padding: "18px 28px", borderBottom: `1px solid ${theme.panelBorder}`,
          display: "flex", alignItems: "center", gap: 10, background: theme.panel,
        }}>
          <h2 style={{
            margin: 0, fontSize: 22, fontWeight: 900, flex: 1, letterSpacing: -0.4,
            background: theme.accentGradient || BRAND_GRADIENT,
            WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text",
          }}>{String(template).replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{1F000}-\u{1F2FF}]/gu, "").trim()}</h2>
          <button onClick={onTopBacktest} disabled={runningBT} style={{
            display: "inline-flex", alignItems: "center", gap: 6,
            padding: "9px 16px", borderRadius: 10, border: "none",
            background: theme.accentGradient || theme.accent, color: "white", fontSize: 13, fontWeight: 700,
            cursor: runningBT ? "wait" : "pointer", opacity: runningBT ? 0.7 : 1,
            boxShadow: "0 3px 10px rgba(59,130,246,0.25)",
          }}>
            <Play size={14} /> {runningBT ? "실행 중…" : "Backtest"}
          </button>
          <button onClick={() => setTab("report")} style={{
            display: "inline-flex", alignItems: "center", gap: 6,
            padding: "9px 16px", borderRadius: 10, border: `1px solid ${theme.panelBorder}`,
            background: "white", color: theme.text, fontSize: 13, fontWeight: 600, cursor: "pointer",
          }}>
            <FileText size={14} /> Full Report
          </button>
          <button onClick={reload} title="새로고침" style={{
            background: "transparent", border: `1px solid ${theme.panelBorder}`,
            padding: 8, borderRadius: 8, color: theme.text, cursor: "pointer",
          }}><RefreshCw size={14} /></button>
        </div>

        {/* 탭 strip (언더라인 스타일) — 스크롤 없이 wrap */}
        <div style={{
          display: "flex", gap: 2, padding: "0 20px",
          borderBottom: `1px solid ${theme.panelBorder}`, background: theme.panel,
          flexShrink: 0, flexWrap: "wrap",
        }}>
          {TABS.map(({ key, label, Icon }) => {
            const active = tab === key;
            return (
              <button key={key} onClick={() => setTab(key)} style={{
                display: "inline-flex", alignItems: "center", gap: 5,
                padding: "12px 11px", border: "none", background: "transparent",
                color: active ? theme.accent : theme.textMuted, fontSize: 14.5, fontWeight: 700, cursor: "pointer",
                borderBottom: `2px solid ${active ? theme.accent : "transparent"}`,
                marginBottom: -1, whiteSpace: "nowrap", flexShrink: 0,
              }}>
                <Icon size={14} /> {label}
              </button>
            );
          })}
        </div>

        {/* 본문 */}
        <div style={{
          flex: 1, overflow: "auto", padding: "28px 32px 64px",
          minHeight: 0, background: "#F8FAFC",
        }}>
          {tab === "config"   && <ConfigPanel id={id} ws={ws} onChange={reload} setTab={setTab} topSummary={topSummaryBar} />}
          {tab === "report"   && <ReportPanel id={id} ws={ws} onChange={reload} />}
          {tab === "regime"   && <RegimePanel id={id} ws={ws} onChange={reload} />}
          {tab === "trust"    && <TrustPanel id={id} ws={ws} onChange={reload} />}
          {tab === "log"      && <LogPanel id={id} ws={ws} />}
        </div>
      </main>
    </div>

    <NewStrategyModal
      open={newStrategyOpen}
      name={newStrategyName}
      onChange={setNewStrategyName}
      onConfirm={onConfirmNewStrategy}
      onClose={() => setNewStrategyOpen(false)}
      theme={theme}
    />
    </>
  );
}

// Strategy Card 탭 상단 가로 요약 바 스타일 헬퍼
function topCard(theme) {
  return {
    background: "white", border: `1px solid ${theme.panelBorder}`, borderRadius: 12,
    padding: "10px 12px", borderColor: theme.panelBorder,
    minHeight: 92, display: "flex", flexDirection: "column",
  };
}
function topCardLabel(theme) {
  return {
    fontSize: 10.5, fontWeight: 800, color: theme.textMuted,
    letterSpacing: 0.6, textTransform: "uppercase",
  };
}

// 우측 사이드 패널 스타일 헬퍼 (현재는 미사용 — 추후 재활용 가능)
function sideTitle(theme) {
  return { fontSize: 11, fontWeight: 800, color: theme.textMuted, letterSpacing: 0.6, textTransform: "uppercase", marginBottom: 6 };
}
function sideCard(theme) {
  return { background: "white", border: `1px solid ${theme.panelBorder}`, borderRadius: 12, padding: "12px 14px" };
}
function sideBtn(theme) {
  return {
    display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6,
    padding: "9px 12px", borderRadius: 10, border: `1px solid ${theme.panelBorder}`,
    background: "white", color: theme.text, fontSize: 12.5, fontWeight: 600, cursor: "pointer",
  };
}

// ============================================================ CHAT

// 매우 가벼운 인라인 마크다운: **bold**, *italic*, `code` 만 지원.
// XSS 방지 위해 분할 후 React 노드로 직접 합성 (dangerouslySetInnerHTML 미사용).
function renderInlineMarkdown(text) {
  if (text == null) return null;
  const s = String(text);
  // 토큰: **...**, *...*, `...`
  const re = /(\*\*[^*\n]+\*\*|\*[^*\n]+\*|`[^`\n]+`)/g;
  const parts = s.split(re);
  return parts.map((p, i) => {
    if (!p) return null;
    if (p.startsWith("**") && p.endsWith("**")) {
      return <strong key={i} style={{ fontWeight: 700 }}>{p.slice(2, -2)}</strong>;
    }
    if (p.startsWith("`") && p.endsWith("`")) {
      return <code key={i} style={{
        fontFamily: "monospace", background: "rgba(0,0,0,0.06)",
        padding: "1px 5px", borderRadius: 4, fontSize: "0.92em",
      }}>{p.slice(1, -1)}</code>;
    }
    if (p.startsWith("*") && p.endsWith("*") && p.length > 2) {
      return <em key={i}>{p.slice(1, -1)}</em>;
    }
    return <span key={i}>{p}</span>;
  });
}

// JSON 시맨틱 하이라이트 — 키(파랑)/문자열(초록)/숫자(주황)/키워드(보라)
function highlightJson(code) {
  const parts = [];
  const re = /("(?:\\.|[^"\\])*")(\s*:)?|(\b-?\d+(?:\.\d+)?\b)|(\btrue\b|\bfalse\b|\bnull\b)/g;
  let last = 0; let m; let key = 0;
  while ((m = re.exec(code)) !== null) {
    if (m.index > last) parts.push(<span key={`p${key++}`}>{code.slice(last, m.index)}</span>);
    if (m[1]) {
      const isKey = !!m[2];
      parts.push(<span key={`p${key++}`} style={{ color: isKey ? "#60a5fa" : "#86efac" }}>{m[1]}</span>);
      if (isKey) parts.push(<span key={`p${key++}`}>{m[2]}</span>);
    } else if (m[3]) {
      parts.push(<span key={`p${key++}`} style={{ color: "#fcd34d" }}>{m[3]}</span>);
    } else if (m[4]) {
      parts.push(<span key={`p${key++}`} style={{ color: "#c084fc" }}>{m[4]}</span>);
    }
    last = m.index + m[0].length;
  }
  if (last < code.length) parts.push(<span key={`p${key++}`}>{code.slice(last)}</span>);
  return parts;
}

// balanced { ··· } 영역을 텍스트에서 모두 찾는다 (설명 없는 bare JSON용)
function findBareJsonRanges(s) {
  const ranges = [];
  for (let i = 0; i < s.length; i++) {
    if (s[i] !== "{") continue;
    let depth = 0; let inStr = false; let esc = false;
    for (let j = i; j < s.length; j++) {
      const c = s[j];
      if (inStr) {
        if (esc) { esc = false; continue; }
        if (c === "\\") { esc = true; continue; }
        if (c === '"') inStr = false;
        continue;
      }
      if (c === '"') { inStr = true; continue; }
      if (c === "{") depth++;
      else if (c === "}") {
        depth--;
        if (depth === 0) {
          const body = s.slice(i, j + 1);
          if (/"\s*:\s*/.test(body) && body.length >= 8) ranges.push({ start: i, end: j + 1, body });
          i = j;
          break;
        }
      }
    }
  }
  return ranges;
}

// 구조화 응답 섹션 헤더 — 백엔드 시스템 프롬프트와 정확히 일치해야 한다.
const STRUCT_SECTIONS = [
  { re: /^##\s*🧠\s*AI가\s*이해한\s*전략\s*$/, key: "understand", title: "🧠 AI가 이해한 전략", bg: "linear-gradient(135deg,#eff6ff,#dbeafe)", border: "#93c5fd", color: "#1e3a8a" },
  { re: /^##\s*❓\s*확인이\s*필요한\s*규칙\s*$/, key: "questions", title: "❓ 확인이 필요한 규칙", bg: "linear-gradient(135deg,#fef3c7,#fde68a)", border: "#fbbf24", color: "#78350f" },
  { re: /^##\s*▶\s*다음\s*단계\s*$/, key: "next", title: "▶ 다음 단계", bg: "linear-gradient(135deg,#ede9fe,#ddd6fe)", border: "#a78bfa", color: "#4c1d95" },
];

function detectStructured(text) {
  const lines = String(text).split("\n");
  const sections = [];
  let cur = null;
  const preamble = [];
  for (const ln of lines) {
    const trimmed = ln.trim();
    const hit = STRUCT_SECTIONS.find((h) => h.re.test(trimmed));
    if (hit) {
      if (cur) sections.push(cur);
      cur = { ...hit, body: [] };
    } else if (cur) {
      cur.body.push(ln);
    } else {
      preamble.push(ln);
    }
  }
  if (cur) sections.push(cur);
  if (sections.length === 0) return null;
  return {
    preamble: preamble.join("\n").trim(),
    sections: sections.map((s) => ({ ...s, body: s.body.join("\n").trim() })),
  };
}

// [BTN:라벨|액션] 토큰을 버튼으로 치환해 React 노드 배열을 만든다.
function renderBodyWithButtons(body, onAction) {
  if (!body) return null;
  const re = /\[BTN:([^|\]]+)\|([a-z_]+)\]/g;
  const out = [];
  let last = 0; let m; let k = 0;
  while ((m = re.exec(body)) !== null) {
    if (m.index > last) {
      out.push(<span key={`bt-${k++}`}>{renderInlineMarkdown(body.slice(last, m.index))}</span>);
    }
    const label = m[1].trim();
    const action = m[2].trim();
    out.push(
      <button
        key={`b-${k++}`}
        onClick={(e) => { e.preventDefault(); onAction && onAction(action, label); }}
        style={{
          display: "inline-flex", alignItems: "center", gap: 6,
          margin: "4px 6px 4px 0", padding: "7px 14px",
          fontSize: 12, fontWeight: 800, cursor: "pointer",
          background: "linear-gradient(135deg,#dbeafe 0%,#e0e7ff 50%,#ede9fe 100%)",
          color: "#1e3a8a", border: "1px solid #c7d2fe", borderRadius: 999,
          boxShadow: "0 2px 6px rgba(99,102,241,0.18)",
        }}
      >
        {label}
      </button>
    );
    last = m.index + m[0].length;
  }
  if (last < body.length) {
    out.push(<span key={`bt-${k++}`}>{renderInlineMarkdown(body.slice(last))}</span>);
  }
  return out;
}

function StructuredAssistantMessage({ data, onAction }) {
  // 🧠, ❓ 섹션은 기본 접힘 / ▶ 다음단계는 항상 펼쳐서 버튼 노출
  const [collapsed, setCollapsed] = useState({ understand: true, questions: true });
  return (
    <div style={{ display: "grid", gap: 10 }}>
      {data.preamble && (
        <div style={{ fontSize: 13, lineHeight: 1.6, whiteSpace: "pre-wrap" }}>
          {renderInlineMarkdown(data.preamble)}
        </div>
      )}
      {data.sections.map((sec) => {
        const isNext = sec.key === "next";
        const isCollapsed = isNext ? false : !!collapsed[sec.key];
        return (
          <div key={sec.key} style={{
            background: sec.bg, border: `1px solid ${sec.border}`,
            borderRadius: 12, overflow: "hidden",
          }}>
            {isNext ? (
              // ▶ 다음 단계 — 항상 표시, 접기 없음
              <div style={{ padding: "10px 14px" }}>
                <div style={{ fontSize: 12, fontWeight: 800, color: sec.color, marginBottom: 8 }}>{sec.title}</div>
                <div style={{ fontSize: 13, lineHeight: 1.6, color: sec.color, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                  {renderBodyWithButtons(sec.body, onAction)}
                </div>
              </div>
            ) : (
              <>
                <button
                  onClick={() => setCollapsed((c) => ({ ...c, [sec.key]: !c[sec.key] }))}
                  style={{
                    width: "100%", textAlign: "left", padding: "10px 14px",
                    background: "transparent", border: "none", cursor: "pointer",
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    fontSize: 13, fontWeight: 800, color: sec.color,
                  }}
                >
                  <span>{sec.title}</span>
                  <span style={{ fontSize: 11, opacity: 0.65 }}>{isCollapsed ? "▼ 펼치기" : "▲ 접기"}</span>
                </button>
                {!isCollapsed && (
                  <div style={{
                    padding: "0 14px 12px 14px", fontSize: 13, lineHeight: 1.6,
                    color: sec.color, whiteSpace: "pre-wrap", wordBreak: "break-word",
                  }}>
                    {renderBodyWithButtons(sec.body, onAction)}
                  </div>
                )}
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}

/**
 * AI 응답을 ```json ... ``` 코드블록 / 일반 텍스트로 분할 후 각각 렌더.
 * JSON(bare / fenced)은 사용자에게 노출하지 않고 숨김 — 내부 상태 동기화 용도.
 * opts.onAction(action, label) — [BTN:...] 토큰 클릭 핸들러.
 */
function renderAssistantMessage(text, opts = {}) {
  if (text == null) return null;
  // 구조화 응답(섹션 헤더 포함)이면 카드 형태로 렌더
  const structured = detectStructured(String(text));
  if (structured) {
    return <StructuredAssistantMessage data={structured} onAction={opts.onAction} />;
  }
  const s = String(text);
  // 1) ```lang? ... ``` 명시 코드블록
  const re = /```(\w+)?\n?([\s\S]*?)```/g;
  const matches = [];
  let m;
  while ((m = re.exec(s)) !== null) {
    matches.push({ start: m.index, end: m.index + m[0].length, lang: m[1] || "code", code: m[2].replace(/\n$/, "") });
  }
  // 2) bare JSON: balanced brace 로 수집
  const bare = findBareJsonRanges(s);
  for (const r of bare) {
    if (matches.some(x => r.start >= x.start && r.end <= x.end)) continue;
    matches.push({ start: r.start, end: r.end, lang: "json", code: r.body });
  }
  matches.sort((a, b) => a.start - b.start);

  const out = [];
  let last = 0; let key = 0;
  for (const x of matches) {
    if (x.start > last) {
      out.push(<span key={`t-${key++}`}>{renderInlineMarkdown(s.slice(last, x.start))}</span>);
    }
    const isJson = x.lang === "json";
    // JSON 은 채팅창에서 숨김 (LLM 내부 상태 동기화 페이로드)
    if (isJson) { last = x.end; continue; }
    let codeContent = x.code;
    out.push(
      <div key={`c-${key++}`} style={{
        marginTop: 8, marginBottom: 8,
        background: "#1e293b", color: "#f1f5f9",
        borderRadius: 10, padding: "12px 14px",
        fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
        fontSize: 12.5, lineHeight: 1.65,
        whiteSpace: "pre-wrap", wordBreak: "break-word",
        overflowX: "auto", maxWidth: "100%",
        border: "1px solid rgba(255,255,255,0.06)",
      }}>
        <div style={{
          display: "inline-block",
          fontSize: 10, marginBottom: 6, padding: "2px 8px",
          borderRadius: 4, letterSpacing: 0.6, fontWeight: 700,
          background: "#334155",
          color: "white", textTransform: "uppercase",
        }}>{x.lang}</div>
        <div>{codeContent}</div>
      </div>
    );
    last = x.end;
  }
  if (last < s.length) {
    out.push(<span key={`t-${key++}`}>{renderInlineMarkdown(s.slice(last))}</span>);
  }
  // JSON 제거 후 남은 가시적 텍스트가 없으면 (공백/개행만 존재) null 반환→ 빈 버블 방지
  let visible = "";
  let lastV = 0;
  for (const x of matches) {
    if (x.start > lastV) visible += s.slice(lastV, x.start);
    if (x.lang !== "json") visible += "x"; // 코드블록 표시됨
    lastV = x.end;
  }
  if (lastV < s.length) visible += s.slice(lastV);
  if (!visible.replace(/\s/g, "")) return null;
  return out;
}


function NewStrategyModal({ open, name, onChange, onConfirm, onClose, theme }) {
  if (!open) return null;
  return (
    <div onClick={onClose} style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 3000,
      display: "flex", alignItems: "center", justifyContent: "center", padding: 24,
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: "white", borderRadius: 20, width: "100%", maxWidth: 440,
        boxShadow: "0 24px 64px rgba(0,0,0,0.22)", overflow: "hidden",
      }}>
        {/* 헤더 */}
        <div style={{
          padding: "24px 28px 20px",
          background: "linear-gradient(135deg,#eff6ff 0%,#e0e7ff 100%)",
          borderBottom: "1px solid #E2E8F0",
          display: "flex", alignItems: "center", gap: 14,
        }}>
          <div style={{
            width: 44, height: 44, borderRadius: 14, flexShrink: 0,
            background: "linear-gradient(135deg,#60a5fa,#6366f1)",
            display: "flex", alignItems: "center", justifyContent: "center",
            boxShadow: "0 4px 12px rgba(99,102,241,0.3)",
          }}>
            <Layers size={20} color="white" />
          </div>
          <div>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: "#1e3a8a" }}>새 전략 만들기</h2>
            <p style={{ margin: "3px 0 0", fontSize: 12, color: "#475569" }}>전략 이름을 입력하고 AI와 대화를 시작하세요</p>
          </div>
        </div>
        {/* 본문 */}
        <div style={{ padding: "24px 28px" }}>
          <label style={{ fontSize: 12, fontWeight: 700, color: "#374151", display: "block", marginBottom: 8 }}>
            전략 이름
          </label>
          <input
            autoFocus
            value={name}
            onChange={e => onChange(e.target.value)}
            onKeyDown={e => { if (e.nativeEvent.isComposing) return; if (e.key === "Enter") onConfirm(); if (e.key === "Escape") onClose(); }}
            placeholder="예: 미국 배당 성장 전략"
            style={{
              width: "100%", padding: "12px 14px", borderRadius: 10,
              border: "1.5px solid #C7D2FE", fontSize: 14, outline: "none",
              boxSizing: "border-box", color: "#0F172A",
              transition: "border-color 0.15s",
            }}
            onFocus={e => e.target.style.borderColor = "#6366f1"}
            onBlur={e => e.target.style.borderColor = "#C7D2FE"}
          />
        </div>
        {/* 푸터 */}
        <div style={{
          padding: "0 28px 24px", display: "flex", gap: 8, justifyContent: "flex-end",
        }}>
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
          }}>전략 생성하기</button>
        </div>
      </div>
    </div>
  );
}

function healthLevel(trust) {
  if (trust == null) return { label: "미측정", color: "#94A3B8", Icon: AlertTriangle };
  if (trust >= 75)   return { label: "Stable",  color: "#10B981", Icon: TrendingUp };
  if (trust >= 60)   return { label: "Normal",  color: "#3B82F6", Icon: TrendingUp };
  return                    { label: "Caution", color: "#F59E0B", Icon: AlertTriangle };
}

// ============================================================ SHARED PRIMITIVES
function Card({ title, children, theme, action, badge }) {
  return (
    <div style={{
      background: "white", border: `1px solid ${theme.panelBorder}`,
      borderRadius: 14, padding: "16px 18px", marginBottom: 12,
      boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <h3 style={{ margin: 0, fontSize: 13, fontWeight: 800, color: theme.text }}>
          {title}{badge && <span style={{ marginLeft: 8, padding: "2px 8px", borderRadius: 999, background: theme.accent, color: "white", fontSize: 10 }}>{badge}</span>}
        </h3>
        {action}
      </div>
      {children}
    </div>
  );
}
function Empty({ msg, theme }) {
  return <p style={{ fontSize: 12, color: theme.textMuted, margin: 0, fontStyle: "italic" }}>{msg}</p>;
}
function Json({ value, theme }) {
  return (
    <pre style={{
      margin: 0, padding: 10, background: theme.codeBg, color: theme.code,
      borderRadius: 6, fontSize: 11, overflow: "auto", maxHeight: 400, lineHeight: 1.5,
    }}>{typeof value === "string" ? value : JSON.stringify(value, null, 2)}</pre>
  );
}

/* Goal Profile 카드형 요약 — JSON 대신 사람이 읽기 쉽게 */
function GoalProfileSummary({ profile, theme, wsId, onChange }) {
  const [currency, setCurrency] = useState("KRW"); // KRW | USD
  const [editing, setEditing] = useState(null); // { key, value }
  const [saving, setSaving] = useState(false);
  const FX = 1380; // 단순 환산 (1 USD = 1380 KRW)
  if (!profile || typeof profile !== "object") return null;
  const fmtMoney = (v) => {
    if (v == null || v === "") return "—";
    const n = Number(v);
    if (currency === "USD") {
      return `$${(n / FX).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
    }
    return `₩${n.toLocaleString("ko-KR")}`;
  };
  const RISK = { 보수적: "🛡️ 보수적", 중립: "⚖️ 중립", 공격적: "🔥 공격적", conservative: "🛡️ 보수적", moderate: "⚖️ 중립", aggressive: "🔥 공격적" };
  const DIR = {
    infinite_buying: "♾️ 무한매수법",
    "추세추종": "📈 추세추종",
    "평균회귀": "🔁 평균회귀",
    "모멘텀": "🚀 모멘텀",
    "변동성조절": "🎚️ 변동성조절",
    "잘모름": "🤔 미정",
  };
  const assets = Array.isArray(profile.assets) ? profile.assets : [];
  const alloc = profile.asset_allocation && typeof profile.asset_allocation === "object" ? profile.asset_allocation : null;
  const dir = profile.initial_strategy_direction || "";
  const dirLabel = DIR[dir] || (dir ? `🧭 ${dir}` : "—");
  const risk = profile.risk_tolerance || "";
  const riskLabel = RISK[risk] || (risk ? `⚖️ ${risk}` : "—");

  const startEdit = (key, raw) => setEditing({ key, value: raw == null ? "" : String(raw) });
  const cancelEdit = () => setEditing(null);
  const saveEdit = async (cast) => {
    if (!editing || !wsId) { setEditing(null); return; }
    setSaving(true);
    try {
      const v = cast(editing.value);
      await updateGoalProfile(wsId, { [editing.key]: v });
      setEditing(null);
      if (onChange) await onChange();
    } catch (e) {
      alert("저장 실패: " + (e?.response?.data?.error || e.message));
    } finally { setSaving(false); }
  };
  const castNum = (s) => {
    const n = Number(String(s).replace(/[,\s₩$]/g, ""));
    return isNaN(n) ? null : n;
  };
  const castStr = (s) => String(s);

  const rows = [
    { label: "🎯 목표", key: "goal", value: profile.goal || "—", raw: profile.goal, type: "text", wide: true },
    { label: "⏳ 투자 기간", key: "horizon_years", value: profile.horizon_years != null ? `${profile.horizon_years}년` : "—", raw: profile.horizon_years, type: "num" },
    { label: "💰 초기 투자금", key: "initial_capital_krw", value: fmtMoney(profile.initial_capital_krw), raw: profile.initial_capital_krw, type: "num" },
    { label: "📅 월 적립금", key: "monthly_contribution_krw", value: fmtMoney(profile.monthly_contribution_krw), raw: profile.monthly_contribution_krw, type: "num" },
    { label: "💢 투자 성향", key: "risk_tolerance", value: riskLabel, raw: profile.risk_tolerance, type: "text" },
    { label: " 하루 매수 한도", key: "daily_buy_limit_krw", value: profile.daily_buy_limit_krw != null && profile.daily_buy_limit_krw !== "" ? fmtMoney(profile.daily_buy_limit_krw) : (Number(profile.initial_capital_krw) > 0 ? `추천 ${fmtMoney(Math.round(Number(profile.initial_capital_krw) * 0.01))}` : "—"), raw: profile.daily_buy_limit_krw, type: "num", hint: "보통 자산의 1% 권장", muted: profile.daily_buy_limit_krw == null || profile.daily_buy_limit_krw === "" },
    { label: "🏷️ 하루 매도 한도", key: "daily_sell_limit_krw", value: profile.daily_sell_limit_krw != null && profile.daily_sell_limit_krw !== "" ? fmtMoney(profile.daily_sell_limit_krw) : (Number(profile.initial_capital_krw) > 0 ? `추천 ${fmtMoney(Math.round(Number(profile.initial_capital_krw) * 0.01))}` : "—"), raw: profile.daily_sell_limit_krw, type: "num", hint: "보통 자산의 1% 권장", muted: profile.daily_sell_limit_krw == null || profile.daily_sell_limit_krw === "" },
    {
      label: "📉 MDD 허용 · 전략 방향",
      key: "max_drawdown_target_pct",
      type: "num",
      raw: profile.max_drawdown_target_pct,
      value: (
        <span style={{ display: "inline-flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span>{profile.max_drawdown_target_pct != null ? `${profile.max_drawdown_target_pct}%` : "—"}</span>
          <span style={{
            padding: "2px 10px", borderRadius: 999, fontSize: 11, fontWeight: 700,
            background: "linear-gradient(135deg,#dbeafe 0%,#ede9fe 100%)",
            color: "#3730a3", border: "1px solid #c7d2fe",
          }}>{dirLabel}</span>
        </span>
      ),
      wide: true,
    },
  ];

  return (
    <div style={{ display: "grid", gap: 10 }}>
      {/* 통화 토글 */}
      <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 6 }}>
        <span style={{ fontSize: 11, color: theme.textMuted }}>표시 통화</span>
        <div style={{ display: "inline-flex", borderRadius: 999, border: `1px solid ${theme.panelBorder}`, overflow: "hidden" }}>
          {["KRW", "USD"].map((c) => (
            <button key={c} onClick={() => setCurrency(c)} style={{
              padding: "4px 12px", fontSize: 11, fontWeight: 700, cursor: "pointer", border: "none",
              background: currency === c ? "linear-gradient(135deg,#dbeafe,#ede9fe)" : "white",
              color: currency === c ? "#3730a3" : theme.textMuted,
            }}>{c === "KRW" ? "₩ 원" : "$ 달러"}</button>
          ))}
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        {rows.map((r) => {
          const isEditing = editing && editing.key === r.key;
          return (
            <div key={r.label} style={{
              gridColumn: r.wide ? "1 / -1" : "auto",
              padding: "10px 12px", borderRadius: 8,
              background: theme.codeBg || "#f8fafc",
              border: `1px solid ${theme.panelBorder}`,
              cursor: wsId && !isEditing ? "pointer" : "default",
            }}
            onClick={() => { if (wsId && !isEditing) startEdit(r.key, r.raw); }}
            title={wsId ? "클릭해서 수정" : ""}
            >
              <div style={{ fontSize: 11, color: theme.textMuted, marginBottom: 3, fontWeight: 600, display: "flex", justifyContent: "space-between" }}>
                <span>{r.label}</span>
                {wsId && !isEditing && <span style={{ opacity: 0.5 }}>✏️</span>}
              </div>
              {isEditing ? (
                <div style={{ display: "flex", gap: 4 }} onClick={(e) => e.stopPropagation()}>
                  <input
                    autoFocus
                    value={editing.value}
                    onChange={(e) => setEditing({ ...editing, value: e.target.value })}
                    onKeyDown={(e) => {
                      if (e.nativeEvent.isComposing) return;
                      if (e.key === "Enter") saveEdit(r.type === "num" ? castNum : castStr);
                      if (e.key === "Escape") cancelEdit();
                    }}
                    style={{
                      flex: 1, padding: "4px 8px", fontSize: 13, fontWeight: 700,
                      border: `1px solid ${theme.accent}`, borderRadius: 6, outline: "none", color: theme.text,
                    }}
                  />
                  <button onClick={() => saveEdit(r.type === "num" ? castNum : castStr)} disabled={saving} style={{
                    padding: "4px 10px", fontSize: 11, fontWeight: 700, cursor: "pointer",
                    background: theme.accent, color: "white", border: "none", borderRadius: 6,
                  }}>저장</button>
                  <button onClick={cancelEdit} style={{
                    padding: "4px 8px", fontSize: 11, cursor: "pointer",
                    background: "white", color: theme.textMuted, border: `1px solid ${theme.panelBorder}`, borderRadius: 6,
                  }}>✕</button>
                </div>
              ) : (
                <div style={{ fontSize: 13, color: r.muted ? theme.textMuted : theme.text, fontWeight: r.muted ? 600 : 700, fontStyle: r.muted ? "italic" : "normal" }}>{r.value}</div>
              )}
            </div>
          );
        })}
      </div>
      {assets.length > 0 && (() => {
        const PALETTE = ["#60a5fa", "#a78bfa", "#f472b6", "#fbbf24", "#fb7185", "#22d3ee", "#facc15", "#fb923c"];
        const rawItems = assets.map((a, i) => ({
          label: a,
          value: alloc?.[a] != null ? Number(alloc[a]) : Math.round(100 / assets.length),
          color: PALETTE[i % PALETTE.length],
        }));
        const rawSum = rawItems.reduce((s, x) => s + x.value, 0) || 1;
        // cash_pct 가 있으면 alloc 항목들을 (100 - cash) 비중으로 재정규화 → 자산 비율은 유지
        const cashPct = profile.cash_pct != null
          ? Number(profile.cash_pct)
          : Math.max(0, 100 - rawSum);
        const items = rawItems.map((it) => ({
          ...it,
          value: cashPct > 0.01
            ? (it.value / rawSum) * (100 - cashPct)
            : it.value,
        }));
        if (cashPct > 0.01) {
          items.push({ label: "현금", value: cashPct, color: "#22c55e" });
        }
        const totalKrw = Number(profile.initial_capital_krw || 0);
        const totalLabel = totalKrw > 0
          ? (currency === "USD"
              ? `$${(totalKrw / FX).toLocaleString("en-US", { maximumFractionDigits: 0 })}`
              : `₩${totalKrw.toLocaleString("ko-KR")}`)
          : `${items.length}종`;
        // 각 항목의 현재기준 금액 (initial_capital_krw 기준)
        const amountOf = (pct) => {
          if (!totalKrw) return null;
          const krw = totalKrw * pct / 100;
          return currency === "USD"
            ? `$${(krw / FX).toLocaleString("en-US", { maximumFractionDigits: 0 })}`
            : `₩${Math.round(krw).toLocaleString("ko-KR")}`;
        };
        return (
          <div style={{
            gridColumn: "1 / -1",
            padding: "14px 16px", borderRadius: 10,
            background: theme.codeBg || "#f8fafc",
            border: `1px solid ${theme.panelBorder}`,
          }}>
            <div style={{ fontSize: 12, color: theme.textMuted, marginBottom: 10, fontWeight: 700, display: "flex", justifyContent: "space-between" }}>
              <span>📊 관심 자산 · 배분 비율</span>
              {totalKrw > 0 && (
                <span style={{ fontSize: 11, color: theme.text, fontWeight: 800 }}>
                  총 {currency === "USD" ? `$${(totalKrw/FX).toLocaleString("en-US",{maximumFractionDigits:0})}` : `₩${totalKrw.toLocaleString("ko-KR")}`}
                </span>
              )}
            </div>
            <div style={{ display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap" }}>
              <DonutChart
                items={items}
                centerLabel="총 자산"
                centerValue={totalLabel}
                theme={theme}
                size={160}
                thickness={32}
                amountOf={amountOf}
              />
              <div style={{ flex: 1, minWidth: 180, display: "grid", gap: 6 }}>
                {items.map((it) => (
                  <div key={it.label} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12 }}>
                    <span style={{ width: 10, height: 10, borderRadius: 3, background: it.color, flexShrink: 0 }} />
                    <span style={{ flex: 1, color: theme.text, fontWeight: 600 }}>{it.label}</span>
                    <span style={{ color: theme.textMuted, fontWeight: 700 }}>{it.value.toFixed(0)}%</span>
                    {amountOf(it.value) && (
                      <span style={{ color: theme.text, fontWeight: 800, minWidth: 90, textAlign: "right" }}>
                        {amountOf(it.value)}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        );
      })()}
      {/* 브로커 한도 카드 — 자동 큐 주문이 막히는 진짜 원인을 한눈에 + 즉시 수정 */}
      {wsId && <BrokerLimitsCard theme={theme} />}
      {profile.notes && (
        <div style={{
          padding: "10px 12px", borderRadius: 8,
          background: theme.codeBg || "#f8fafc",
          border: `1px solid ${theme.panelBorder}`, fontSize: 12, color: theme.textMuted, lineHeight: 1.6,
        }}>
          📝 {profile.notes}
        </div>
      )}
    </div>
  );
}

/**
 * 브로커(KIS) 계좌 한도 — 자동 큐 주문이 막히는 진짜 원인.
 * 카드 표시 + 인라인 즉시 수정 (모의/실전 모두).
 */
function BrokerLimitsCard({ theme }) {
  const [accts, setAccts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null); // { env, key, value }
  const [saving, setSaving] = useState(false);

  const reload = async () => {
    setLoading(true);
    try { setAccts(await listBrokerAccounts()); }
    catch { setAccts([]); }
    finally { setLoading(false); }
  };
  useEffect(() => { reload(); }, []);

  const startEdit = (brokerType, env, key, raw) => setEditing({ brokerType, env, key, value: raw == null ? "" : String(raw) });
  const cancel = () => setEditing(null);
  const save = async () => {
    if (!editing) return;
    const v = parseInt(String(editing.value).replace(/[,\s$]/g, ""), 10);
    if (!Number.isFinite(v) || v < 0) { alert("0 이상 정수를 입력하세요"); return; }
    setSaving(true);
    try {
      await patchBrokerLimits(editing.env, { [editing.key]: v }, editing.brokerType);
      setEditing(null);
      await reload();
    } catch (e) {
      alert("저장 실패: " + (e?.response?.data?.error || e.message));
    } finally { setSaving(false); }
  };

  if (loading) return null;
  if (!accts || accts.length === 0) {
    return (
      <div style={{
        gridColumn: "1 / -1",
        padding: "10px 12px", borderRadius: 8,
        background: "#FEF3C7", border: "1px solid #FCD34D",
        fontSize: 12, color: "#92400E",
      }}>
        ⚠️ KIS 브로커 계좌가 등록되지 않았습니다. 자동 큐 주문을 사용하려면 먼저 <b>설정 → 브로커 키</b>에서 KIS 모의/실전 계좌를 등록하세요.
      </div>
    );
  }
  return (
    <div style={{
      gridColumn: "1 / -1",
      padding: "14px 16px", borderRadius: 10,
      background: theme.codeBg || "#f8fafc",
      border: `1px solid ${theme.panelBorder}`,
    }}>
      <div style={{ fontSize: 12, color: theme.textMuted, marginBottom: 10, fontWeight: 700 }}>
        🏦 브로커 주문 한도 (KIS) — 자동 큐 매수가 막히는 가장 흔한 원인
      </div>
      <div style={{ display: "grid", gap: 10 }}>
        {accts.map((b) => (
          <div key={b.id} style={{
            display: "grid", gridTemplateColumns: "auto 1fr 1fr", gap: 10, alignItems: "center",
            padding: "8px 10px", background: "white", borderRadius: 8,
            border: `1px solid ${theme.panelBorder}`,
          }}>
            <span style={{
              padding: "3px 10px", borderRadius: 999, fontSize: 11, fontWeight: 800,
              background: b.env === "REAL" ? "linear-gradient(135deg,#fecaca,#fca5a5)" : "linear-gradient(135deg,#bae6fd,#7dd3fc)",
              color: b.env === "REAL" ? "#7f1d1d" : "#075985",
            }}>{(b.brokerType === "BINANCE" ? "Binance " : "KIS ") + (b.env === "REAL" ? "실전" : "모의")}</span>
            {["maxOrderUsd", "dailyOrderUsd"].map((key) => {
              const label = key === "maxOrderUsd" ? "1건당 한도" : "일일 누적 한도";
              const isEditing = editing && editing.brokerType === b.brokerType && editing.env === b.env && editing.key === key;
              return (
                <div key={key} style={{ display: "flex", flexDirection: "column" }}>
                  <span style={{ fontSize: 10, color: theme.textMuted, fontWeight: 600 }}>{label}</span>
                  {isEditing ? (
                    <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                      <span style={{ fontSize: 11, color: theme.textMuted }}>USD</span>
                      <input autoFocus type="number" min="0" step="100"
                        value={editing.value}
                        onChange={(e) => setEditing({ ...editing, value: e.target.value })}
                        onKeyDown={(e) => { if (e.nativeEvent.isComposing) return; if (e.key === "Enter") save(); if (e.key === "Escape") cancel(); }}
                        style={{
                          flex: 1, padding: "3px 8px", fontSize: 13, fontWeight: 700,
                          border: `1px solid ${theme.accent}`, borderRadius: 6, outline: "none", minWidth: 0,
                        }} />
                      <button onClick={save} disabled={saving} style={{
                        padding: "3px 8px", fontSize: 11, fontWeight: 700, cursor: "pointer",
                        background: theme.accent, color: "white", border: "none", borderRadius: 6,
                      }}>{saving ? "..." : "저장"}</button>
                      <button onClick={cancel} style={{
                        padding: "3px 6px", fontSize: 11, cursor: "pointer",
                        background: "white", color: theme.textMuted, border: `1px solid ${theme.panelBorder}`, borderRadius: 6,
                      }}>✕</button>
                    </div>
                  ) : (
                    <div onClick={() => startEdit(b.brokerType, b.env, key, b[key])}
                      title="클릭해서 수정"
                      style={{
                        display: "flex", justifyContent: "space-between", alignItems: "center",
                        fontSize: 14, fontWeight: 800, color: theme.text, cursor: "pointer",
                      }}>
                      <span>USD {Number(b[key] || 0).toLocaleString("en-US")}</span>
                      <span style={{ opacity: 0.45, fontSize: 11 }}>✏️</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>
      <div style={{ marginTop: 8, fontSize: 11, color: theme.textMuted, lineHeight: 1.5 }}>
        💡 자동 큐 주문 1건의 예상 총액이 위 <b>1건당 한도</b>를 넘으면 거부됩니다. 클릭해서 즉시 수정하세요.
        실전 계좌는 안전을 위해 1건당 USD 50,000 / 일일 USD 200,000 상한이 적용됩니다.
      </div>
    </div>
  );
}
function Stat({ label, value, unit = "", theme, positive, negative }) {
  const v = typeof value === "number" ? value.toFixed(2) : (value ?? "—");
  let color = theme.text;
  if (positive && typeof value === "number" && value > 0) color = theme.success;
  if (negative && typeof value === "number" && value < 0) color = theme.danger;
  return (
    <div style={{ padding: 10, background: theme.codeBg, borderRadius: 8 }}>
      <div style={{ fontSize: 11, color: theme.textMuted }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 800, color }}>{v}{unit}</div>
    </div>
  );
}
function Row({ k, v, theme }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "2px 0" }}>
      <span style={{ color: theme.textMuted }}>{k}</span>
      <b>{v}</b>
    </div>
  );
}
function SubScoreBar({ label, value, theme }) {
  const KO = {
    generalization: "일반화 (OOS 일관성)",
    regime_robustness: "시장국면 견고성",
    parameter_stability: "파라미터 안정성",
    risk_control: "리스크 통제",
    statistical_confidence: "통계적 유의성",
  };
  const HINT = {
    generalization: "Walk-Forward 검증에서 과거 구간(In-Sample) 성과가 미래 구간(Out-of-Sample)에서도 유지되는지. 과거에만 맞춘 과적합일수록 낮아집니다.",
    regime_robustness: "상승/하락/횡보/고변동 4가지 시장 국면 중 '가장 안좋은 국면'의 Sharpe로 평가. 특정 국면에만 강한 전략은 낮게 나옵니다.",
    parameter_stability: "주요 파라미터를 ±10% 흔들었을 때 Sharpe가 얼마나 안정적인지. 파라미터에 민감하면 운 좋은 설계일 가능성이 높아 낮게 나옵니다.",
    risk_control: "목표 MDD 대비 실제 MDD 비율. 목표보다 손실이 작으면 높은 점수, 초과하면 낮은 점수.",
    statistical_confidence: "일별 수익률 평균이 0과 통계적으로 유의하게 다른지 (t-statistic). 시운 이상의 실증적 우위성.",
  };
  const hint = HINT[label] || "";
  return (
    <div style={{ marginBottom: 10 }} title={hint}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginBottom: 4 }}>
        <span style={{ color: theme.text, fontWeight: 600, display: "inline-flex", alignItems: "center", gap: 4, cursor: "help" }}>
          {KO[label] || label}
          {hint && (
            <span style={{
              display: "inline-flex", alignItems: "center", justifyContent: "center",
              width: 13, height: 13, borderRadius: 999,
              background: theme.codeBg || "#eef2ff", color: theme.textMuted || "#64748b",
              fontSize: 9, fontWeight: 800,
            }}>?</span>
          )}
        </span>
        <b style={{ color: theme.accent }}>{value}/100</b>
      </div>
      <div style={{ height: 6, background: theme.codeBg, borderRadius: 3, overflow: "hidden" }}>
        <div style={{ width: `${value}%`, height: "100%", background: theme.accent, transition: "width 0.4s" }} />
      </div>
    </div>
  );
}
function primaryBtn(theme, busy) {
  return {
    display: "inline-flex", alignItems: "center", gap: 6,
    padding: "10px 16px", background: theme.accentGradient || theme.accent, color: "white", border: "none",
    borderRadius: 8, fontSize: 14, fontWeight: 700, cursor: busy ? "wait" : "pointer",
    opacity: busy ? 0.7 : 1,
    boxShadow: "0 3px 10px rgba(59,130,246,0.25)",
  };
}

/**
 * 패널 상단 통합 헤더 — 그라데이션 제목 + 설명 + 우측 액션
 */
export function PanelHeader({ icon, title, description, action, theme }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h2 style={{
            margin: 0, fontSize: 26, fontWeight: 900, lineHeight: 1.25, letterSpacing: -0.5,
            background: theme.accentGradient || BRAND_GRADIENT,
            WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
            backgroundClip: "text",
            display: "inline-flex", alignItems: "center", gap: 8,
          }}>
            {icon && <span style={{ WebkitTextFillColor: "initial" }}>{icon}</span>}
            {title}
          </h2>
          {description && (
            <p style={{ margin: "6px 0 0", fontSize: 14, color: theme.textMuted, lineHeight: 1.55 }}>
              {description}
            </p>
          )}
        </div>
        {action && <div style={{ flexShrink: 0 }}>{action}</div>}
      </div>
    </div>
  );
}

// ============================================================ Reusable charts (SVG, no deps)

/**
 * 도넛 차트 — items: [{label, value, color}]
 * value 합이 100이 아니어도 정규화해서 표시.
 */
function DonutChart({ items, size = 180, thickness = 26, centerLabel, centerValue, theme, amountOf }) {
  const [hoverIdx, setHoverIdx] = useState(null);
  const arr = (items || []).filter((x) => x && Number(x.value) > 0);
  const sum = arr.reduce((s, x) => s + Number(x.value), 0) || 1;
  const cx = size / 2, cy = size / 2, r = (size - thickness) / 2;
  const C = 2 * Math.PI * r;
  // acc를 렌더 외부에서 미리 계산해 slices 배열로 만든다 (JSX 내 재할당 금지)
  const slices = useMemo(() => {
    let offset = 0;
    return arr.map((it) => {
      const frac = Number(it.value) / sum;
      const dash = frac * C;
      const off = -offset;
      offset += dash;
      return { frac, dash, off };
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [arr.length, sum, C, JSON.stringify(arr.map(x => x.value))]);
  const hovered = hoverIdx != null ? arr[hoverIdx] : null;
  const hoveredPct = hovered ? (Number(hovered.value) / sum) * 100 : 0;
  return (
    <div style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap", position: "relative" }}>
      <div style={{ position: "relative" }}>
        <svg width={size} height={size} style={{ display: "block" }}>
          <circle cx={cx} cy={cy} r={r} fill="none" stroke={theme?.codeBg || "#f1f5f9"} strokeWidth={thickness} />
          {arr.map((it, i) => {
            const { frac, dash, off } = slices[i] || { frac: 0, dash: 0, off: 0 };
            const isHover = hoverIdx === i;
            const dim = hoverIdx != null && !isHover;
            return (
              <circle
                key={i}
                cx={cx} cy={cy} r={r} fill="none"
                stroke={it.color}
                strokeWidth={thickness}
                strokeDasharray={`${dash} ${C - dash}`}
                strokeDashoffset={off}
                transform={`rotate(-90 ${cx} ${cy})`}
                opacity={dim ? 0.35 : 0.88}
                onMouseEnter={() => setHoverIdx(i)}
                onMouseLeave={() => setHoverIdx(null)}
                style={{ transition: "opacity .15s ease, stroke-dasharray .5s ease", cursor: "pointer" }}
              >
                <title>{`${it.label} · ${((frac) * 100).toFixed(1)}%`}</title>
              </circle>
            );
          })}
          <text x={cx} y={cy - 4} textAnchor="middle" fontSize={10} fill={theme?.textMuted || "#94a3b8"} style={{ pointerEvents: "none" }}>
            {centerLabel || "배분"}
          </text>
          <text x={cx} y={cy + 12} textAnchor="middle" fontSize={10} fontWeight={800} fill={theme?.text || "#0f172a"} style={{ pointerEvents: "none" }}>
            {centerValue || `${arr.length}종`}
          </text>
        </svg>
        {hovered && (
          <div style={{
            position: "absolute", top: -8, left: "50%", transform: "translate(-50%, -100%)",
            padding: "6px 10px", borderRadius: 6, background: "rgba(15,23,42,0.92)", color: "white",
            fontSize: 11, fontWeight: 700, whiteSpace: "nowrap", pointerEvents: "none",
            boxShadow: "0 4px 12px rgba(0,0,0,0.15)", zIndex: 10,
          }}>
            <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 2, background: hovered.color, marginRight: 6 }} />
            {hovered.label} · {hoveredPct.toFixed(1)}%{amountOf && amountOf(hoveredPct) ? ` · ${amountOf(hoveredPct)}` : ""}
          </div>
        )}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 120 }}>
        {arr.map((it, i) => {
          const pct = (Number(it.value) / sum) * 100;
          return (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12 }}>
              <span style={{
                width: 12, height: 12, borderRadius: 3,
                background: it.color, flexShrink: 0,
              }} />
              <span style={{ color: theme?.text, fontWeight: 700, flex: 1 }}>{it.label}</span>
              <span style={{ color: theme?.textMuted, fontVariantNumeric: "tabular-nums" }}>{pct.toFixed(1)}%</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * 추세 라인차트 — series: [{name, color, points: [{x:Date|number, y:number}]}]
 * 가로축은 인덱스 기반. hover 시 세로 가이드라인 + 각 시리즈 값 표시.
 */
function TrendLineChart({ series, height = 240, theme }) {
  const [hoverIdx, setHoverIdx] = useState(null);
  const W = 720, H = height, PADL = 50, PADR = 16, PADT = 16, PADB = 32;
  const valid = (series || []).filter((s) => s && Array.isArray(s.points) && s.points.length > 1);
  if (valid.length === 0) {
    return <div style={{ padding: 20, textAlign: "center", color: theme?.textMuted, fontSize: 12 }}>표시할 데이터가 없습니다.</div>;
  }
  // x: 인덱스 0..N-1 (모든 시리즈가 같은 길이를 가진다는 가정으로 첫 시리즈 기준)
  const base = valid[0].points;
  const N = base.length;
  let yMin = Infinity, yMax = -Infinity;
  valid.forEach((s) => s.points.forEach((p) => {
    if (p.y == null || Number.isNaN(p.y)) return;
    if (p.y < yMin) yMin = p.y;
    if (p.y > yMax) yMax = p.y;
  }));
  if (!isFinite(yMin) || !isFinite(yMax)) return null;
  const yPad = (yMax - yMin) * 0.05 || 1;
  yMin -= yPad; yMax += yPad;
  const xAt = (i) => PADL + (i / Math.max(1, N - 1)) * (W - PADL - PADR);
  const yAt = (v) => PADT + (1 - (v - yMin) / (yMax - yMin)) * (H - PADT - PADB);
  const pathFor = (pts) => pts.map((p, i) => `${i === 0 ? "M" : "L"} ${xAt(i).toFixed(1)} ${yAt(p.y).toFixed(1)}`).join(" ");
  const xTicks = Array.from({ length: 5 }, (_, k) => Math.round(k * (N - 1) / 4));
  const yTicks = 4;
  const onMove = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const rel = ((e.clientX - rect.left) / rect.width) * W;
    const i = Math.round(((rel - PADL) / (W - PADL - PADR)) * (N - 1));
    setHoverIdx(Math.max(0, Math.min(N - 1, i)));
  };
  const onLeave = () => setHoverIdx(null);
  const fmt = (v) => (v == null ? "—" : v >= 1000 ? v.toLocaleString("en-US", { maximumFractionDigits: 0 }) : v.toFixed(2));
  return (
    <div style={{ position: "relative", width: "100%" }}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} onMouseMove={onMove} onMouseLeave={onLeave} style={{ cursor: "crosshair" }}>
        {/* y grid */}
        {Array.from({ length: yTicks + 1 }, (_, k) => {
          const v = yMin + ((yMax - yMin) * k) / yTicks;
          const y = yAt(v);
          return (
            <g key={k}>
              <line x1={PADL} x2={W - PADR} y1={y} y2={y} stroke={theme?.panelBorder || "#e2e8f0"} strokeWidth={0.6} />
              <text x={PADL - 6} y={y + 3} textAnchor="end" fontSize={10} fill={theme?.textMuted || "#94a3b8"}>{fmt(v)}</text>
            </g>
          );
        })}
        {/* x ticks */}
        {xTicks.map((i) => {
          const lbl = base[i]?.x;
          const label = lbl instanceof Date ? `${lbl.getFullYear()}.${String(lbl.getMonth() + 1).padStart(2, "0")}` :
            (typeof lbl === "string" ? lbl.slice(0, 7) : String(lbl ?? ""));
          return (
            <text key={i} x={xAt(i)} y={H - 10} textAnchor="middle" fontSize={10} fill={theme?.textMuted || "#94a3b8"}>{label}</text>
          );
        })}
        {/* paths */}
        {valid.map((s, idx) => (
          <path key={idx} d={pathFor(s.points)} fill="none" stroke={s.color} strokeWidth={s.width || 1.8} opacity={s.opacity ?? 0.95}>
            <title>{s.name}</title>
          </path>
        ))}
        {/* hover guide */}
        {hoverIdx != null && (
          <line x1={xAt(hoverIdx)} x2={xAt(hoverIdx)} y1={PADT} y2={H - PADB} stroke={theme?.accent || "#3b82f6"} strokeDasharray="3 3" strokeWidth={1} opacity={0.7} />
        )}
        {hoverIdx != null && valid.map((s, idx) => {
          const p = s.points[hoverIdx];
          if (!p || p.y == null) return null;
          return <circle key={idx} cx={xAt(hoverIdx)} cy={yAt(p.y)} r={3.5} fill={s.color} stroke="white" strokeWidth={1.5} />;
        })}
      </svg>
      {/* legend + tooltip */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 6, fontSize: 11 }}>
        {valid.map((s, idx) => {
          const v = hoverIdx != null ? s.points[hoverIdx]?.y : s.points[s.points.length - 1]?.y;
          return (
            <span key={idx} style={{ display: "inline-flex", alignItems: "center", gap: 6, color: theme?.text }}>
              <span style={{ width: 14, height: 3, background: s.color, borderRadius: 2 }} />
              <b>{s.name}</b>
              <span style={{ color: theme?.textMuted }}>· {fmt(v)}</span>
            </span>
          );
        })}
        {hoverIdx != null && (
          <span style={{ color: theme?.textMuted }}>
            ({(() => {
              const lbl = base[hoverIdx]?.x;
              return lbl instanceof Date ? lbl.toISOString().slice(0, 10) : String(lbl ?? "");
            })()})
          </span>
        )}
      </div>
    </div>
  );
}

/**
 * 단순 이동평균 (간격 동일한 시계열). null/NaN은 건너뜀.
 */
function calcSMA(values, window) {
  const out = new Array(values.length).fill(null);
  let sum = 0, cnt = 0;
  const buf = [];
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (v != null && !Number.isNaN(v)) { sum += v; buf.push(v); cnt++; } else { buf.push(null); }
    if (buf.length > window) {
      const old = buf.shift();
      if (old != null) { sum -= old; cnt--; }
    }
    if (buf.length === window && cnt >= window * 0.7) out[i] = sum / cnt;
  }
  return out;
}

/**
 * hover 시 설명 툴팁이 뜨는 라벨.
 */
function HelpLabel({ children, hint, theme }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, cursor: "help", position: "relative" }} title={hint}>
      {children}
      <span style={{
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        width: 14, height: 14, borderRadius: 999,
        background: theme?.codeBg || "#eef2ff", color: theme?.textMuted || "#64748b",
        fontSize: 9, fontWeight: 800,
      }}>?</span>
    </span>
  );
}

/**
 * Trust details (walk_forward / regime / parameter / statistical) — 친화적 카드 표시
 */
function TrustDetailsCard({ details, theme }) {
  if (!details || typeof details !== "object") return null;
  const wf = details.walk_forward || details.walkForward || details.wf;
  const rg = details.regime || details.regime_robustness;
  const pr = details.parameter || details.parameter_stability;
  const st = details.statistical || details.statistical_confidence;
  const rk = details.risk || details.risk_control;
  const num = (v, d = 2) => (typeof v === "number" ? v.toFixed(d) : (v ?? "-"));
  const pct = (v) => (typeof v === "number" ? `${v.toFixed(2)}%` : (v ?? "-"));
  const box = {
    padding: "10px 12px", borderRadius: 10, background: theme.codeBg || "#f8fafc",
    border: `1px solid ${theme.panelBorder}`,
  };
  const k = { fontSize: 11, color: theme.textMuted, marginBottom: 2, display: "flex", alignItems: "center", gap: 4 };
  const v = { fontSize: 14, fontWeight: 700, color: theme.text };
  return (
    <Card title="🔍 검증 상세" theme={theme}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 12 }}>
        {wf && (
          <div style={box}>
            <div style={{ fontWeight: 700, color: theme.text, marginBottom: 6 }}>🚶 Walk-Forward</div>
            <div style={k}><HelpLabel hint="In-Sample(과거 훈련구간) Sharpe" theme={theme}>IS Sharpe</HelpLabel></div>
            <div style={v}>{num(wf.is_sharpe ?? wf.in_sample_sharpe)}</div>
            <div style={{ ...k, marginTop: 8 }}><HelpLabel hint="Out-of-Sample(미래 검증구간) Sharpe — 진짜 일반화 성능" theme={theme}>OOS Sharpe</HelpLabel></div>
            <div style={v}>{num(wf.oos_sharpe ?? wf.out_of_sample_sharpe)}</div>
            <div style={{ ...k, marginTop: 8 }}><HelpLabel hint="IS와 OOS 차이. 0에 가까울수록 일반화 잘됨, 크면 과적합" theme={theme}>IS↔OOS 차이</HelpLabel></div>
            <div style={v}>{num(wf.gap ?? wf.train_oos_gap)}</div>
          </div>
        )}
        {rg && (
          <div style={box}>
            <div style={{ fontWeight: 700, color: theme.text, marginBottom: 6 }}>🌐 시장국면</div>
            <div style={k}><HelpLabel hint="4가지 국면 중 가장 약했던 국면 이름" theme={theme}>취약 국면</HelpLabel></div>
            <div style={v}>{rg.weakest ?? rg.weakest_regime ?? "-"}</div>
            <div style={{ ...k, marginTop: 8 }}><HelpLabel hint="가장 약한 국면의 Sharpe" theme={theme}>최약 Sharpe</HelpLabel></div>
            <div style={v}>{num(rg.weakest_sharpe ?? rg.min_sharpe)}</div>
            <div style={{ ...k, marginTop: 8 }}><HelpLabel hint="국면 간 Sharpe 표준편차 — 작을수록 모든 시장에서 균일" theme={theme}>국면 분산</HelpLabel></div>
            <div style={v}>{num(rg.sharpe_std ?? rg.dispersion)}</div>
          </div>
        )}
        {pr && (
          <div style={box}>
            <div style={{ fontWeight: 700, color: theme.text, marginBottom: 6 }}>🎛 파라미터</div>
            <div style={k}><HelpLabel hint="파라미터 ±10% 변경 시 Sharpe 변화의 크기. 작을수록 안정" theme={theme}>민감도</HelpLabel></div>
            <div style={v}>{num(pr.sensitivity)}</div>
            <div style={{ ...k, marginTop: 8 }}><HelpLabel hint="흔든 파라미터 조합에서의 Sharpe 범위(최대-최소)" theme={theme}>Sharpe 범위</HelpLabel></div>
            <div style={v}>{num(pr.sharpe_range ?? pr.range)}</div>
          </div>
        )}
        {rk && (
          <div style={box}>
            <div style={{ fontWeight: 700, color: theme.text, marginBottom: 6 }}>🛡 리스크</div>
            <div style={k}><HelpLabel hint="실제 MDD (낮을수록 좋음)" theme={theme}>실제 MDD</HelpLabel></div>
            <div style={v}>{pct(rk.actual_mdd ?? rk.mdd)}</div>
            <div style={{ ...k, marginTop: 8 }}><HelpLabel hint="목표 MDD 한도" theme={theme}>목표 MDD</HelpLabel></div>
            <div style={v}>{pct(rk.target_mdd)}</div>
            <div style={{ ...k, marginTop: 8 }}><HelpLabel hint="실제/목표 비율. 1.0 이하면 목표 안에서 잘 통제" theme={theme}>달성 비율</HelpLabel></div>
            <div style={v}>{num(rk.ratio, 2)}</div>
          </div>
        )}
        {st && (
          <div style={box}>
            <div style={{ fontWeight: 700, color: theme.text, marginBottom: 6 }}>📐 통계</div>
            <div style={k}><HelpLabel hint="일별 수익률 평균이 0과 다른지 검정한 t-통계량 (절댓값 2 이상이면 유의)" theme={theme}>t-statistic</HelpLabel></div>
            <div style={v}>{num(st.t_stat ?? st.t_statistic)}</div>
            <div style={{ ...k, marginTop: 8 }}><HelpLabel hint="유의확률 (낮을수록 우연이 아님)" theme={theme}>p-value</HelpLabel></div>
            <div style={v}>{num(st.p_value, 4)}</div>
            <div style={{ ...k, marginTop: 8 }}><HelpLabel hint="표본 수 (거래일 수)" theme={theme}>표본 수</HelpLabel></div>
            <div style={v}>{st.n_samples ?? st.n ?? "-"}</div>
          </div>
        )}
      </div>
    </Card>
  );
}
