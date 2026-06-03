import React, { useState, useRef, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  Play, FileText, Plus, Send, Settings as SettingsIcon, AlertTriangle,
  MessageSquare, BarChart3, Activity, ShieldCheck, ScrollText,
  ShoppingCart, RefreshCw, CheckCircle2, XCircle, Link2,
} from "lucide-react";
import {
  listWorkspaces, getWorkspace, createWorkspace,
  fetchChat, sendChat, runBacktest, runRegime, runTrust,
  fetchDecisionLog, formalize,
  listBrokerAccounts, getBrokerBalance, getBrokerQuote,
  previewBrokerOrder, placeBrokerOrder,
} from "../alpha/alphaApi";

/**
 * StrategyWorkspace — 실제 백엔드(KIS / vectorbt / yfinance) 연동 MVP
 * 좌: 워크스페이스 리스트 (DB: alpha_workspace)
 * 중 탭: AI 대화 / Backtest / Regime / Trust / Decision Log / Order
 * 우: 전략요약 / Regime / Trust Score
 */
const F = "'Inter','Pretendard',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif";

const TABS = [
  { key: "chat",   label: "AI 대화",      Icon: MessageSquare },
  { key: "back",   label: "Backtest",     Icon: BarChart3 },
  { key: "regime", label: "Regime",       Icon: Activity },
  { key: "trust",  label: "Trust Score",  Icon: ShieldCheck },
  { key: "log",    label: "Decision Log", Icon: ScrollText },
  { key: "order",  label: "Order",        Icon: ShoppingCart },
];

function healthFromTrust(t) {
  if (t == null) return { label: "미측정", color: "#94A3B8" };
  if (t >= 75)   return { label: "Stable",  color: "#10B981" };
  if (t >= 60)   return { label: "Normal",  color: "#3B82F6" };
  return                { label: "Caution", color: "#F59E0B" };
}

export default function StrategyWorkspace() {
  const nav = useNavigate();
  const { id: paramId } = useParams();

  const [workspaces, setWorkspaces] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [activeTab, setActiveTab] = useState("chat");
  const [busy, setBusy] = useState(false);
  const [globalErr, setGlobalErr] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const list = await listWorkspaces();
        setWorkspaces(list);
        const initial = paramId && list.find(w => String(w.id) === String(paramId))
          ? paramId
          : (list[0]?.id ?? null);
        setActiveId(initial);
      } catch (e) {
        setGlobalErr("워크스페이스 로드 실패: " + (e?.response?.data?.error || e.message));
      }
    })();
  }, []);

  const reloadDetail = async () => {
    if (!activeId) { setDetail(null); return; }
    try {
      const d = await getWorkspace(activeId);
      setDetail(d);
    } catch (e) {
      setGlobalErr("워크스페이스 상세 로드 실패: " + (e?.response?.data?.error || e.message));
    }
  };
  useEffect(() => { reloadDetail(); /* eslint-disable-next-line */ }, [activeId]);

  // Heli 도크/Developer Studio 가 "지금 보고 있는 워크스페이스"를 인지하도록 lastWsId 동기화
  // (이게 없으면 /strategy/:id 화면에서 Heli 가 전략을 못 찾아 "전략 코드가 없다"고 답함)
  useEffect(() => {
    if (activeId != null) {
      try { localStorage.setItem("alpha.lastWsId", String(activeId)); } catch { /* noop */ }
    }
  }, [activeId]);

  const trustScore = detail?.lastTrust?.trust_score ?? null;
  const trustBreak = detail?.lastTrust?.sub_scores ?? null;
  const regimeInfo = detail?.lastRegime ?? null;
  const lastBacktest = detail?.lastBacktest ?? null;
  const goal = (detail?.goalProfile && typeof detail.goalProfile === "object")
    ? (detail.goalProfile.목표 || detail.goalProfile.goal || detail.goalProfile.summary)
    : null;
  const cfg = detail?.strategyConfig || null;
  const health = healthFromTrust(trustScore);

  const onNewStrategy = async () => {
    const name = window.prompt("새 전략 워크스페이스 이름");
    if (!name?.trim()) return;
    try {
      const w = await createWorkspace(name.trim());
      const list = await listWorkspaces();
      setWorkspaces(list);
      setActiveId(w.id);
      setActiveTab("chat");
    } catch (e) {
      alert("생성 실패: " + (e?.response?.data?.error || e.message));
    }
  };

  const runBacktestNow = async () => {
    if (!activeId) return;
    setBusy(true);
    try { await runBacktest(activeId); await reloadDetail(); setActiveTab("back"); }
    catch (e) { alert("Backtest 실패: " + (e?.response?.data?.error || e.message)); }
    finally { setBusy(false); }
  };
  const runRegimeNow = async () => {
    if (!activeId) return;
    setBusy(true);
    try { await runRegime(activeId); await reloadDetail(); setActiveTab("regime"); }
    catch (e) { alert("Regime 실패: " + (e?.response?.data?.error || e.message)); }
    finally { setBusy(false); }
  };
  const runTrustNow = async () => {
    if (!activeId) return;
    setBusy(true);
    try { await runTrust(activeId); await reloadDetail(); setActiveTab("trust"); }
    catch (e) { alert("Trust 실패: " + (e?.response?.data?.error || e.message)); }
    finally { setBusy(false); }
  };

  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: "240px 1fr 320px",
      height: "calc(100vh - 44px)",
      background: "#FAFAFA",
      fontFamily: F,
      color: "#0F172A",
    }}>
      {/* LEFT */}
      <aside style={{
        background: "#FFFFFF", borderRight: "1px solid #E5E7EB",
        padding: "20px 16px", display: "flex", flexDirection: "column",
        gap: 6, overflowY: "auto",
      }}>
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 12, color: "#94A3B8", marginBottom: 2 }}>Freedom Goal</div>
          <div style={{ fontSize: 13, color: "#334155", fontWeight: 500 }}>
            {goal || "목표 미설정"}
          </div>
        </div>

        <div style={{
          fontSize: 11, fontWeight: 700, color: "#64748B",
          textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6,
        }}>Strategies</div>

        {workspaces.length === 0 && (
          <div style={{ fontSize: 12, color: "#94A3B8", padding: "8px 4px" }}>
            아직 워크스페이스가 없습니다.
          </div>
        )}
        {workspaces.map(w => {
          const active = String(activeId) === String(w.id);
          return (
            <button key={w.id} onClick={() => setActiveId(w.id)}
              style={{
                textAlign: "left", border: "1px solid",
                borderColor: active ? "#0F172A" : "#E5E7EB",
                background: active ? "#F8FAFC" : "white",
                borderRadius: 10, padding: "10px 12px", cursor: "pointer",
                marginBottom: 4,
              }}>
              <div style={{ fontSize: 13.5, fontWeight: active ? 700 : 600, color: "#0F172A" }}>{w.name}</div>
              <div style={{ fontSize: 11, color: "#94A3B8", marginTop: 2 }}>
                #{w.id} · {w.status || "—"}
              </div>
            </button>
          );
        })}

        <button onClick={onNewStrategy}
          style={{
            marginTop: 6, padding: "10px 12px", borderRadius: 10,
            border: "1px dashed #CBD5E1", background: "white",
            display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6,
            color: "#64748B", fontSize: 13, fontWeight: 600, cursor: "pointer",
          }}>
          <Plus size={14} /> New Strategy
        </button>

        <div style={{ flex: 1 }} />
        <button onClick={() => nav("/settings/broker")}
          style={{
            padding: "8px 10px", borderRadius: 8, border: "1px solid #E5E7EB",
            background: "white", color: "#0F172A", fontSize: 12, fontWeight: 600, cursor: "pointer",
            display: "inline-flex", alignItems: "center", gap: 6, justifyContent: "center",
          }}>
          <Link2 size={12} /> KIS 계좌 설정
        </button>
      </aside>

      {/* CENTER */}
      <main style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "16px 24px", borderBottom: "1px solid #E5E7EB", background: "white",
        }}>
          <div style={{ fontSize: 18, fontWeight: 800, color: "#0F172A" }}>
            {detail?.name || "워크스페이스를 선택하세요"}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={runBacktestNow} disabled={!activeId || busy} style={pillBtn(true, busy)}>
              <Play size={14} /> {busy ? "실행 중…" : "Backtest"}
            </button>
            <button onClick={runTrustNow} disabled={!activeId || busy} style={pillBtn(false, busy)}>
              <ShieldCheck size={14} /> Trust
            </button>
            <button onClick={runRegimeNow} disabled={!activeId || busy} style={pillBtn(false, busy)}>
              <Activity size={14} /> Regime
            </button>
          </div>
        </div>

        {globalErr && (
          <div style={{ padding: "10px 16px", background: "#FEF2F2", color: "#B91C1C", fontSize: 13, borderBottom: "1px solid #FECACA" }}>
            {globalErr}
          </div>
        )}

        <div style={{
          display: "flex", gap: 4, padding: "0 24px",
          borderBottom: "1px solid #E5E7EB", background: "white",
        }}>
          {TABS.map(t => {
            const active = activeTab === t.key;
            const { Icon } = t;
            return (
              <button key={t.key} onClick={() => setActiveTab(t.key)}
                style={{
                  padding: "12px 14px", background: "transparent", border: "none",
                  cursor: "pointer", fontSize: 13,
                  color: active ? "#2563EB" : "#64748B",
                  fontWeight: active ? 700 : 500,
                  borderBottom: active ? "2px solid #2563EB" : "2px solid transparent",
                  marginBottom: -1,
                  display: "inline-flex", alignItems: "center", gap: 6,
                }}>
                <Icon size={14} /> {t.label}
              </button>
            );
          })}
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: "24px 28px", minHeight: 0 }}>
          {!activeId && (
            <PlaceholderPanel icon={<MessageSquare size={26} />}
              title="워크스페이스를 선택하거나 새로 만드세요"
              desc="좌측 + New Strategy 로 새 전략 워크스페이스를 생성할 수 있습니다." />
          )}
          {activeId && activeTab === "chat"   && <ChatPanel id={activeId} cfg={cfg} onAfterFormalize={reloadDetail} />}
          {activeId && activeTab === "back"   && <BacktestPanel data={lastBacktest} onRun={runBacktestNow} busy={busy} />}
          {activeId && activeTab === "regime" && <RegimePanel data={regimeInfo} onRun={runRegimeNow} busy={busy} />}
          {activeId && activeTab === "trust"  && <TrustPanel data={detail?.lastTrust} onRun={runTrustNow} busy={busy} />}
          {activeId && activeTab === "log"    && <DecisionLogPanel id={activeId} />}
          {activeId && activeTab === "order"  && <OrderPanel id={activeId} detail={detail} />}
        </div>
      </main>

      {/* RIGHT */}
      <aside style={{
        background: "white", borderLeft: "1px solid #E5E7EB",
        padding: "20px 18px", overflowY: "auto", display: "flex", flexDirection: "column", gap: 16,
      }}>
        <Section title="전략 요약">
          <div style={{ fontSize: 13.5, fontWeight: 700, color: "#0F172A", marginBottom: 6 }}>{detail?.name || "—"}</div>
          {goal && <div style={{ fontSize: 12, color: "#64748B", marginBottom: 8 }}>{goal}</div>}
          {cfg?.assets && (
            <>
              <div style={{ fontSize: 11, color: "#94A3B8" }}>자산</div>
              <div style={{ fontSize: 13, color: "#0F172A" }}>
                {Array.isArray(cfg.assets) ? cfg.assets.join(" / ") : String(cfg.assets)}
              </div>
            </>
          )}
        </Section>

        <Section title="현재 REGIME">
          {regimeInfo?.regime_label ? (
            <div style={{
              border: "1px solid #FDE68A", background: "#FFFBEB",
              borderRadius: 10, padding: "10px 12px",
            }}>
              <div style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "#92400E", fontWeight: 700, fontSize: 13 }}>
                <AlertTriangle size={14} /> {regimeInfo.regime_label}
              </div>
              {regimeInfo?.narrative && (
                <div style={{ fontSize: 12, color: "#78350F", marginTop: 4 }}>{regimeInfo.narrative}</div>
              )}
            </div>
          ) : (
            <div style={{ fontSize: 12, color: "#94A3B8" }}>Regime 미실행</div>
          )}
        </Section>

        <Section title="TRUST SCORE">
          <div style={{ textAlign: "center", marginBottom: 12 }}>
            <div style={{ fontSize: 32, fontWeight: 900, color: "#0F172A", lineHeight: 1 }}>
              {trustScore ?? "—"}
            </div>
            <div style={{ fontSize: 11, color: "#94A3B8" }}>
              / 100 · <span style={{ color: health.color, fontWeight: 700 }}>{health.label}</span>
            </div>
          </div>
          {trustBreak && Object.entries(trustBreak).map(([k, v]) => (
            <div key={k} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
              <div style={{ fontSize: 11, color: "#64748B", width: 120, flex: "0 0 auto", textTransform: "capitalize" }}>{String(k).replace(/_/g, " ")}</div>
              <div style={{ flex: 1, height: 4, background: "#F1F5F9", borderRadius: 2, overflow: "hidden" }}>
                <div style={{ width: `${Math.max(0, Math.min(100, Number(v)))}%`, height: "100%", background: "#0F172A" }} />
              </div>
              <div style={{ fontSize: 11, color: "#0F172A", fontWeight: 700, width: 24, textAlign: "right" }}>{Math.round(Number(v))}</div>
            </div>
          ))}
        </Section>

        {detail?.lastTrust?.narrative && (
          <Section title="주요 리스크">
            <div style={{
              border: "1px solid #E5E7EB", background: "#FAFAFA",
              borderRadius: 8, padding: "8px 10px",
              fontSize: 12, color: "#475569", lineHeight: 1.5, whiteSpace: "pre-wrap",
            }}>
              {detail.lastTrust.narrative}
            </div>
          </Section>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: "auto" }}>
          <button onClick={() => setActiveTab("order")} style={{ ...rightBtn, background: "#0F172A", color: "white", border: "none" }}>
            <ShoppingCart size={14} /> 매수/매도 실행
          </button>
        </div>
      </aside>
    </div>
  );
}

/* =========================== Panels =========================== */

function ChatPanel({ id, cfg, onAfterFormalize }) {
  const [msgs, setMsgs] = useState([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef(null);

  const load = async () => {
    try {
      const list = await fetchChat(id);
      setMsgs(Array.isArray(list) ? list : (list?.messages || []));
    } catch (_) { /* empty */ }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [id]);
  useEffect(() => { if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight; }, [msgs]);

  const onSend = async () => {
    const t = input.trim();
    if (!t || busy) return;
    setBusy(true);
    setInput("");
    setMsgs(prev => [...prev, { role: "user", text: t }]);
    try {
      const res = await sendChat(id, t);
      if (res && Array.isArray(res.messages)) setMsgs(res.messages);
      else await load();
    } catch (e) {
      setMsgs(prev => [...prev, { role: "system", text: "전송 실패: " + (e?.response?.data?.error || e.message) }]);
    } finally { setBusy(false); }
  };

  const onFormalize = async () => {
    if (!window.confirm("현재 대화를 바탕으로 전략을 확정(formalize)합니다. 진행할까요?")) return;
    setBusy(true);
    try {
      await formalize(id);
      await onAfterFormalize?.();
      alert("전략이 확정되었습니다. 이제 Backtest / Trust / Order 가 가능합니다.");
    } catch (e) {
      alert("확정 실패: " + (e?.response?.data?.error || e.message));
    } finally { setBusy(false); }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div ref={scrollRef} style={{ flex: 1, overflowY: "auto", paddingBottom: 8 }}>
        {msgs.length === 0 && (
          <div style={{ color: "#94A3B8", fontSize: 13, padding: "12px 4px" }}>
            아직 대화가 없습니다. 아래에 전략 아이디어를 입력하세요. (예: "QQQ 와 SCHD 를 쥐고 싶고 MDD 20% 이하였으면 좋겠어")
          </div>
        )}
        {msgs.map((m, i) => <Bubble key={i} role={m.role} text={m.text || m.content} />)}
        {cfg && (
          <div style={{
            marginTop: 12,
            background: "white", border: "1px solid #E5E7EB", borderRadius: 12,
            padding: "16px 20px",
          }}>
            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>Strategy Card</div>
            {Object.entries(cfg).slice(0, 6).map(([k, v]) => (
              <Row key={k} k={k} v={Array.isArray(v) ? v.join(" / ") : (typeof v === "object" ? JSON.stringify(v) : String(v))} />
            ))}
            <div style={{ marginTop: 14 }}>
              <button onClick={onFormalize} disabled={busy} style={cardBtn}>전략 확정 (formalize)</button>
            </div>
          </div>
        )}
      </div>
      <div style={{
        padding: "12px 0 0", borderTop: "1px solid #E5E7EB",
        display: "flex", gap: 8,
      }}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.nativeEvent.isComposing) return; if (e.key === "Enter") onSend(); }}
          placeholder="전략을 수정하거나 질문해보세요…"
          disabled={busy}
          style={{
            flex: 1, padding: "10px 14px", borderRadius: 8,
            border: "1px solid #E5E7EB", background: "#FAFAFA",
            fontSize: 14, outline: "none", color: "#0F172A",
          }}
        />
        <button onClick={onSend} disabled={busy}
          style={{
            padding: "10px 18px", borderRadius: 8, border: "none",
            background: "#0F172A", color: "white",
            fontSize: 13, fontWeight: 600, cursor: busy ? "wait" : "pointer",
            display: "inline-flex", alignItems: "center", gap: 6,
          }}>
          <Send size={14} /> {busy ? "전송…" : "전송"}
        </button>
      </div>
    </div>
  );
}

function BacktestPanel({ data, onRun, busy }) {
  if (!data) {
    return (
      <PlaceholderPanel
        icon={<BarChart3 size={26} />}
        title="Backtest 리포트"
        desc="상단 Backtest 버튼을 눌러 실제 vectorbt 엔진으로 백테스트를 실행합니다. 결과는 DB(alpha_workspace.last_backtest_json) 에 저장됩니다."
        action={<button onClick={onRun} disabled={busy} style={cardBtn}>{busy ? "실행 중…" : "Backtest 실행"}</button>}
      />
    );
  }
  const stats = data.stats || {};
  const risk = data.risk_metrics || {};
  const bh = data.buy_and_hold_metrics || {};
  return (
    <div>
      <h3 style={{ margin: "0 0 12px", fontSize: 16, fontWeight: 700 }}>
        Backtest — {data.ticker || "—"} · {data.strategy || "—"}
      </h3>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 16 }}>
        <Metric label="Total Return" value={pct(stats.total_return ?? stats.totalReturn)} />
        <Metric label="CAGR"         value={pct(stats.cagr)} />
        <Metric label="Sharpe"       value={fmt(stats.sharpe_ratio ?? stats.sharpe, 2)} />
        <Metric label="Sortino"      value={fmt(risk.sortino ?? stats.sortino, 2)} />
        <Metric label="Max Drawdown" value={pct(risk.max_drawdown ?? stats.max_drawdown ?? stats.maxDrawdown)} negative />
        <Metric label="Win Rate"     value={pct(stats.win_rate ?? stats.winRate)} />
      </div>
      <h4 style={{ margin: "0 0 8px", fontSize: 13, fontWeight: 700, color: "#64748B" }}>vs Buy &amp; Hold</h4>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 16 }}>
        <Metric label="B&H Return"   value={pct(bh.total_return ?? bh.totalReturn)} subtle />
        <Metric label="B&H CAGR"     value={pct(bh.cagr)} subtle />
        <Metric label="B&H Sharpe"   value={fmt(bh.sharpe_ratio ?? bh.sharpe, 2)} subtle />
      </div>
      <details style={{ background: "#F8FAFC", border: "1px solid #E2E8F0", borderRadius: 8, padding: "10px 12px" }}>
        <summary style={{ cursor: "pointer", fontSize: 13, fontWeight: 600, color: "#0F172A" }}>원본 JSON 펼치기</summary>
        <pre style={{ marginTop: 10, fontSize: 11, color: "#475569", overflow: "auto", maxHeight: 320 }}>
{JSON.stringify(data, null, 2)}
        </pre>
      </details>
      <div style={{ marginTop: 12 }}>
        <button onClick={onRun} disabled={busy} style={cardBtn}>{busy ? "재실행 중…" : "Backtest 다시 실행"}</button>
      </div>
    </div>
  );
}

function RegimePanel({ data, onRun, busy }) {
  if (!data) {
    return (
      <PlaceholderPanel
        icon={<Activity size={26} />}
        title="Regime 분석"
        desc="상단 Regime 버튼을 눌러 실제 시장 데이터로 시장 국면을 분류합니다."
        action={<button onClick={onRun} disabled={busy} style={cardBtn}>{busy ? "실행 중…" : "Regime 실행"}</button>}
      />
    );
  }
  return (
    <div>
      <h3 style={{ margin: "0 0 12px", fontSize: 16, fontWeight: 700 }}>현재 Regime</h3>
      <div style={{
        background: "#FFFBEB", border: "1px solid #FDE68A", borderRadius: 10,
        padding: "14px 16px", marginBottom: 14,
      }}>
        <div style={{ fontSize: 15, fontWeight: 800, color: "#92400E" }}>{data.regime_label || data.label || "—"}</div>
        {data.narrative && <div style={{ fontSize: 13, color: "#78350F", marginTop: 6, lineHeight: 1.6 }}>{data.narrative}</div>}
      </div>
      <details style={{ background: "#F8FAFC", border: "1px solid #E2E8F0", borderRadius: 8, padding: "10px 12px" }}>
        <summary style={{ cursor: "pointer", fontSize: 13, fontWeight: 600, color: "#0F172A" }}>원본 JSON 펼치기</summary>
        <pre style={{ marginTop: 10, fontSize: 11, color: "#475569", overflow: "auto", maxHeight: 320 }}>
{JSON.stringify(data, null, 2)}
        </pre>
      </details>
      <div style={{ marginTop: 12 }}>
        <button onClick={onRun} disabled={busy} style={cardBtn}>{busy ? "재실행 중…" : "Regime 다시 실행"}</button>
      </div>
    </div>
  );
}

function TrustPanel({ data, onRun, busy }) {
  if (!data) {
    return (
      <PlaceholderPanel
        icon={<ShieldCheck size={26} />}
        title="Trust Score"
        desc="상단 Trust 버튼을 눌러 백테스트 결과 기반 신뢰도를 계산합니다. 결과는 DB(alpha_workspace.last_trust_json) 에 저장됩니다."
        action={<button onClick={onRun} disabled={busy} style={cardBtn}>{busy ? "실행 중…" : "Trust 계산"}</button>}
      />
    );
  }
  return (
    <div>
      <h3 style={{ margin: "0 0 12px", fontSize: 16, fontWeight: 700 }}>Trust Score: {data.trust_score ?? "—"}</h3>
      {data.narrative && (
        <div style={{ fontSize: 13, color: "#334155", lineHeight: 1.7, marginBottom: 12, whiteSpace: "pre-wrap" }}>
          {data.narrative}
        </div>
      )}
      {data.sub_scores && Object.entries(data.sub_scores).map(([k, v]) => (
        <div key={k} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
          <div style={{ fontSize: 12, color: "#64748B", width: 180, textTransform: "capitalize" }}>{String(k).replace(/_/g, " ")}</div>
          <div style={{ flex: 1, height: 6, background: "#F1F5F9", borderRadius: 3, overflow: "hidden" }}>
            <div style={{ width: `${Math.max(0, Math.min(100, Number(v)))}%`, height: "100%", background: "#0F172A" }} />
          </div>
          <div style={{ fontSize: 12, color: "#0F172A", fontWeight: 700, width: 32, textAlign: "right" }}>{Math.round(Number(v))}</div>
        </div>
      ))}
      <details style={{ marginTop: 14, background: "#F8FAFC", border: "1px solid #E2E8F0", borderRadius: 8, padding: "10px 12px" }}>
        <summary style={{ cursor: "pointer", fontSize: 13, fontWeight: 600, color: "#0F172A" }}>원본 JSON 펼치기</summary>
        <pre style={{ marginTop: 10, fontSize: 11, color: "#475569", overflow: "auto", maxHeight: 320 }}>
{JSON.stringify(data, null, 2)}
        </pre>
      </details>
      <div style={{ marginTop: 12 }}>
        <button onClick={onRun} disabled={busy} style={cardBtn}>{busy ? "재계산 중…" : "Trust 다시 계산"}</button>
      </div>
    </div>
  );
}

function DecisionLogPanel({ id }) {
  const [logs, setLogs] = useState(null);
  const [err, setErr] = useState(null);
  useEffect(() => {
    (async () => {
      try { setLogs(await fetchDecisionLog(id)); }
      catch (e) { setErr(e?.response?.data?.error || e.message); }
    })();
  }, [id]);
  if (err) return <PlaceholderPanel icon={<ScrollText size={26} />} title="Decision Log" desc={"불러오기 실패: " + err} />;
  if (logs == null) return <PlaceholderPanel icon={<ScrollText size={26} />} title="Decision Log" desc="불러오는 중…" />;
  const arr = Array.isArray(logs) ? logs : (logs.items || []);
  if (arr.length === 0) {
    return <PlaceholderPanel icon={<ScrollText size={26} />} title="Decision Log" desc="이 전략의 의사결정 이력(시그널 발생, 진입/청산, 사용자 승인)이 여기에 표시됩니다." />;
  }
  return (
    <div>
      <h3 style={{ margin: "0 0 12px", fontSize: 16, fontWeight: 700 }}>Decision Log</h3>
      {arr.map((row, i) => (
        <div key={i} style={{
          padding: "12px 14px", background: "white", border: "1px solid #E5E7EB",
          borderRadius: 10, marginBottom: 8,
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
            <span style={{ fontSize: 13, fontWeight: 700 }}>{row.action || row.event || row.type || "—"}</span>
            <span style={{ fontSize: 11, color: "#94A3B8" }}>{row.createdAt || row.timestamp || ""}</span>
          </div>
          <div style={{ fontSize: 12, color: "#475569", whiteSpace: "pre-wrap" }}>
            {row.summary || row.message || row.detail || JSON.stringify(row).slice(0, 200)}
          </div>
        </div>
      ))}
    </div>
  );
}

/* =========================== Order (KIS) =========================== */
function OrderPanel({ id, detail }) {
  const [accounts, setAccounts] = useState([]);
  const [env, setEnv] = useState("MOCK"); // "MOCK" | "REAL"
  const [balance, setBalance] = useState(null);
  const [ticker, setTicker] = useState("");
  const [side, setSide] = useState("BUY");
  const [qty, setQty] = useState(1);
  const [price, setPrice] = useState("");
  const [orderType, setOrderType] = useState("LIMIT");
  const [quote, setQuote] = useState(null);
  const [preview, setPreview] = useState(null);
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  useEffect(() => {
    const lb = detail?.lastBacktest;
    if (lb?.ticker && !ticker) setTicker(String(lb.ticker).toUpperCase());
    const cfg = detail?.strategyConfig;
    if (!ticker && cfg?.assets) {
      const first = Array.isArray(cfg.assets) ? cfg.assets[0] : String(cfg.assets).split(/[\s,/]+/)[0];
      if (first) setTicker(String(first).toUpperCase());
    }
    // eslint-disable-next-line
  }, [detail]);

  const loadAccounts = async () => {
    try {
      const list = await listBrokerAccounts();
      setAccounts(Array.isArray(list) ? list : []);
    } catch (e) {
      setErr("KIS 계좌 조회 실패: " + (e?.response?.data?.error || e.message));
    }
  };
  useEffect(() => { loadAccounts(); }, []);

  const accountForEnv = accounts.find(a => a.env === env);
  const accountReady = !!accountForEnv;
  const tradingEnabled = !!accountForEnv?.tradingEnabled;

  const onLoadBalance = async () => {
    setBusy(true); setErr(null);
    try { setBalance(await getBrokerBalance(env)); }
    catch (e) { setErr("잔고 조회 실패: " + (e?.response?.data?.error || e.message)); }
    finally { setBusy(false); }
  };

  const onQuote = async () => {
    if (!ticker) return;
    setBusy(true); setErr(null);
    try {
      const q = await getBrokerQuote(env, ticker.toUpperCase());
      setQuote(q);
      if (q?.price && !price) setPrice(String(q.price));
    } catch (e) { setErr("시세 조회 실패: " + (e?.response?.data?.error || e.message)); }
    finally { setBusy(false); }
  };

  const onPreview = async () => {
    setBusy(true); setErr(null); setPreview(null); setResult(null);
    try {
      const body = {
        ticker: ticker.toUpperCase(), side, qty: Number(qty),
        orderType, limitPrice: orderType === "LIMIT" ? Number(price) : null,
      };
      setPreview(await previewBrokerOrder(env, body));
    } catch (e) { setErr("주문 검증 실패: " + (e?.response?.data?.error || e.message)); }
    finally { setBusy(false); }
  };

  const onPlace = async () => {
    if (!window.confirm(
      `[${env === "REAL" ? "🔴 실전계좌" : "🟢 모의계좌"}] ${ticker.toUpperCase()} ${side} ${qty}주 ` +
      (orderType === "LIMIT" ? `@ $${price}` : "(시장가)") + `\n정말 주문하시겠습니까?`
    )) return;
    setBusy(true); setErr(null); setResult(null);
    try {
      const body = {
        ticker: ticker.toUpperCase(), side, qty: Number(qty),
        orderType, limitPrice: orderType === "LIMIT" ? Number(price) : null,
        workspaceId: id,
      };
      setResult(await placeBrokerOrder(env, body));
      await onLoadBalance();
    } catch (e) { setErr("주문 실행 실패: " + (e?.response?.data?.error || e.message)); }
    finally { setBusy(false); }
  };

  if (!accountReady) {
    return (
      <div>
        <h3 style={{ margin: "0 0 12px", fontSize: 16, fontWeight: 700 }}>Order — KIS 한국투자증권</h3>
        <EnvTabs env={env} setEnv={setEnv} />
        <div style={{
          background: "#FFFBEB", border: "1px solid #FDE68A", borderRadius: 10,
          padding: "14px 16px", marginTop: 12,
        }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: "#92400E", marginBottom: 6 }}>
            <AlertTriangle size={14} style={{ verticalAlign: -2, marginRight: 6 }} />
            {env === "MOCK" ? "모의투자" : "실전투자"} 계좌가 등록되지 않았습니다
          </div>
          <div style={{ fontSize: 12, color: "#78350F", lineHeight: 1.6 }}>
            좌측 메뉴 <b>KIS 계좌 설정</b> 또는 아래 버튼으로 이동해 App Key / App Secret / 계좌번호(CANO · acntPrdtCd) 를 등록해 주세요. 등록 후 <b>Trading Enabled</b> 토글을 켜야 주문이 가능합니다.
          </div>
          <button onClick={() => window.location.href = "/settings/broker"} style={{ ...cardBtn, marginTop: 10 }}>
            <Link2 size={14} style={{ verticalAlign: -2, marginRight: 6 }} /> KIS 계좌 설정으로 이동
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>Order — KIS 한국투자증권</h3>
        <button onClick={onLoadBalance} disabled={busy} style={{ ...cardBtn, padding: "6px 10px", fontSize: 12 }}>
          <RefreshCw size={12} style={{ verticalAlign: -2, marginRight: 4 }} /> 잔고 새로고침
        </button>
      </div>
      <EnvTabs env={env} setEnv={setEnv} />

      <div style={{
        marginTop: 12, padding: "10px 14px",
        background: tradingEnabled ? "#ECFDF5" : "#FEF2F2",
        border: `1px solid ${tradingEnabled ? "#86EFAC" : "#FECACA"}`,
        borderRadius: 10, fontSize: 12, color: tradingEnabled ? "#065F46" : "#991B1B",
      }}>
        {tradingEnabled
          ? <><CheckCircle2 size={13} style={{ verticalAlign: -2, marginRight: 6 }} />Trading Enabled — 계좌 {accountForEnv.cano}-{accountForEnv.acntPrdtCd} · 1회 최대 ${accountForEnv.maxOrderUsd}</>
          : <><XCircle size={13} style={{ verticalAlign: -2, marginRight: 6 }} />주문 비활성화 상태입니다. KIS 계좌 설정에서 Trading Enabled 토글을 켜주세요.</>}
      </div>

      {balance && (
        <div style={{ marginTop: 12, padding: "12px 14px", background: "white", border: "1px solid #E5E7EB", borderRadius: 10 }}>
          <div style={{ fontSize: 12, color: "#64748B", marginBottom: 6 }}>잔고 (USD)</div>
          <div style={{ fontSize: 18, fontWeight: 800, color: "#0F172A" }}>
            ${fmt(balance.cashUsd ?? balance.cash ?? balance.totalUsd ?? 0, 2)}
          </div>
          {Array.isArray(balance.positions) && balance.positions.length > 0 && (
            <div style={{ marginTop: 10 }}>
              <div style={{ fontSize: 11, color: "#94A3B8", marginBottom: 4 }}>보유종목</div>
              {balance.positions.map((p, i) => (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, padding: "4px 0", borderBottom: "1px solid #F1F5F9" }}>
                  <span style={{ fontWeight: 600 }}>{p.ticker || p.symbol}</span>
                  <span>{p.qty || p.shares} 주 · ${fmt(p.avgPrice ?? p.avg, 2)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div style={{ marginTop: 14, padding: "16px", background: "white", border: "1px solid #E5E7EB", borderRadius: 10 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 100px 100px", gap: 8, marginBottom: 10 }}>
          <div>
            <label style={lblSt}>티커 (해외주식)</label>
            <input value={ticker} onChange={e => setTicker(e.target.value.toUpperCase())} placeholder="예: QQQ" style={inpSt} />
          </div>
          <div>
            <label style={lblSt}>구분</label>
            <select value={side} onChange={e => setSide(e.target.value)} style={inpSt}>
              <option value="BUY">매수</option>
              <option value="SELL">매도</option>
            </select>
          </div>
          <div>
            <label style={lblSt}>수량</label>
            <input type="number" min="1" value={qty} onChange={e => setQty(e.target.value)} style={inpSt} />
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "100px 1fr 110px", gap: 8, marginBottom: 10 }}>
          <div>
            <label style={lblSt}>주문방식</label>
            <select value={orderType} onChange={e => setOrderType(e.target.value)} style={inpSt}>
              <option value="LIMIT">지정가</option>
              <option value="MARKET">시장가</option>
            </select>
          </div>
          <div>
            <label style={lblSt}>지정가 (USD)</label>
            <input type="number" step="0.01" disabled={orderType !== "LIMIT"} value={price} onChange={e => setPrice(e.target.value)}
              placeholder={orderType === "LIMIT" ? "예: 480.50" : "시장가"} style={inpSt} />
          </div>
          <div style={{ display: "flex", alignItems: "flex-end" }}>
            <button onClick={onQuote} disabled={!ticker || busy} style={{ ...cardBtn, width: "100%" }}>
              현재가 조회
            </button>
          </div>
        </div>
        {quote && (
          <div style={{ marginBottom: 10, padding: "8px 12px", background: "#F8FAFC", borderRadius: 8, fontSize: 12, color: "#334155" }}>
            {ticker} 현재가: <b>${fmt(quote.price ?? quote.last ?? quote.close, 2)}</b>
            {quote.changePercent != null && <span style={{ marginLeft: 8, color: quote.changePercent >= 0 ? "#059669" : "#DC2626" }}>{quote.changePercent >= 0 ? "+" : ""}{fmt(quote.changePercent, 2)}%</span>}
          </div>
        )}
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={onPreview} disabled={!ticker || !qty || busy || (orderType === "LIMIT" && !price)} style={{ ...cardBtn, flex: 1 }}>
            {busy ? "검증 중…" : "주문 검증 (Preview)"}
          </button>
          <button onClick={onPlace} disabled={!preview || !tradingEnabled || busy}
            style={{
              flex: 1, padding: "10px 12px", borderRadius: 8, border: "none",
              background: env === "REAL" ? "#DC2626" : "#0F172A",
              color: "white", fontSize: 13, fontWeight: 700,
              cursor: (!preview || !tradingEnabled || busy) ? "not-allowed" : "pointer",
              opacity: (!preview || !tradingEnabled || busy) ? 0.5 : 1,
            }}>
            {busy ? "전송 중…" : `${env === "REAL" ? "🔴 실전" : "🟢 모의"} 주문 실행`}
          </button>
        </div>

        {preview && (
          <div style={{ marginTop: 10, padding: "10px 12px", background: "#ECFEFF", border: "1px solid #A5F3FC", borderRadius: 8, fontSize: 12, color: "#155E75" }}>
            <div style={{ fontWeight: 700, marginBottom: 4 }}>주문 검증 통과</div>
            <pre style={{ margin: 0, fontSize: 11, whiteSpace: "pre-wrap" }}>{JSON.stringify(preview, null, 2)}</pre>
          </div>
        )}
        {result && (
          <div style={{ marginTop: 10, padding: "10px 12px", background: "#F0FDF4", border: "1px solid #86EFAC", borderRadius: 8, fontSize: 12, color: "#166534" }}>
            <div style={{ fontWeight: 700, marginBottom: 4 }}>✅ KIS 주문 접수 완료</div>
            <pre style={{ margin: 0, fontSize: 11, whiteSpace: "pre-wrap" }}>{JSON.stringify(result, null, 2)}</pre>
          </div>
        )}
        {err && (
          <div style={{ marginTop: 10, padding: "10px 12px", background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 8, fontSize: 12, color: "#991B1B" }}>
            {err}
          </div>
        )}
      </div>
    </div>
  );
}

function EnvTabs({ env, setEnv }) {
  return (
    <div style={{ display: "inline-flex", padding: 4, background: "#F1F5F9", borderRadius: 10, gap: 4 }}>
      {[{ k: "MOCK", l: "🟢 모의투자" }, { k: "REAL", l: "🔴 실전투자" }].map(o => (
        <button key={o.k} onClick={() => setEnv(o.k)}
          style={{
            padding: "6px 14px", borderRadius: 8, border: "none",
            background: env === o.k ? "white" : "transparent",
            color: env === o.k ? "#0F172A" : "#64748B",
            fontSize: 12, fontWeight: 700, cursor: "pointer",
            boxShadow: env === o.k ? "0 1px 2px rgba(0,0,0,0.06)" : "none",
          }}>
          {o.l}
        </button>
      ))}
    </div>
  );
}

/* =========================== small =========================== */
function Bubble({ role, text }) {
  if (!text) return null;
  const isUser = role === "user";
  const isSystem = role === "system";
  return (
    <div style={{ display: "flex", justifyContent: isUser ? "flex-end" : "flex-start", marginBottom: 12 }}>
      <div style={{
        maxWidth: "82%",
        padding: "10px 14px", borderRadius: 12,
        background: isUser ? "#0F172A" : isSystem ? "#FEE2E2" : "#FEF3C7",
        color: isUser ? "white" : isSystem ? "#991B1B" : "#78350F",
        fontSize: 13.5, lineHeight: 1.55, whiteSpace: "pre-wrap",
        boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
      }}>
        {text}
      </div>
    </div>
  );
}

function Row({ k, v }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid #F1F5F9", fontSize: 13 }}>
      <span style={{ color: "#64748B" }}>{k}</span>
      <span style={{ color: "#0F172A", fontWeight: 600, textAlign: "right", maxWidth: "60%", wordBreak: "break-word" }}>{v}</span>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div>
      <div style={{
        fontSize: 11, fontWeight: 700, color: "#64748B",
        textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8,
      }}>{title}</div>
      {children}
    </div>
  );
}

function PlaceholderPanel({ icon, title, desc, action }) {
  return (
    <div style={{
      border: "1px dashed #CBD5E1", background: "white",
      borderRadius: 12, padding: "40px 24px", textAlign: "center", color: "#64748B",
    }}>
      <div style={{ display: "inline-flex", marginBottom: 10, color: "#94A3B8" }}>{icon}</div>
      <div style={{ fontSize: 15, fontWeight: 700, color: "#0F172A", marginBottom: 6 }}>{title}</div>
      <div style={{ fontSize: 13, lineHeight: 1.6, marginBottom: action ? 14 : 0 }}>{desc}</div>
      {action}
    </div>
  );
}

function Metric({ label, value, negative, subtle }) {
  return (
    <div style={{
      padding: "12px 14px", background: subtle ? "#F8FAFC" : "white",
      border: "1px solid #E5E7EB", borderRadius: 10,
    }}>
      <div style={{ fontSize: 11, color: "#64748B", marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 800, color: negative ? "#DC2626" : "#0F172A" }}>{value}</div>
    </div>
  );
}

function fmt(v, digits = 2) {
  if (v == null || v === "" || isNaN(Number(v))) return "—";
  return Number(v).toFixed(digits);
}
function pct(v) {
  if (v == null || v === "" || isNaN(Number(v))) return "—";
  const n = Number(v);
  const scaled = Math.abs(n) <= 1 ? n * 100 : n;
  return `${scaled.toFixed(2)}%`;
}

const cardBtn = {
  padding: "10px 12px", borderRadius: 8, border: "1px solid #E5E7EB",
  background: "#F8FAFC", color: "#0F172A", fontSize: 13, fontWeight: 600, cursor: "pointer",
};
const rightBtn = {
  display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6,
  padding: "10px 12px", borderRadius: 8, border: "1px solid #E5E7EB",
  background: "white", color: "#0F172A", fontSize: 13, fontWeight: 600, cursor: "pointer",
};
const inpSt = {
  width: "100%", padding: "8px 10px", borderRadius: 6,
  border: "1px solid #E5E7EB", fontSize: 13, color: "#0F172A", background: "white", outline: "none",
};
const lblSt = { display: "block", fontSize: 11, color: "#64748B", marginBottom: 4, fontWeight: 600 };

function pillBtn(filled, busy) {
  return {
    display: "inline-flex", alignItems: "center", gap: 6,
    padding: "8px 14px", borderRadius: 8,
    border: filled ? "none" : "1px solid #E5E7EB",
    background: filled ? "#0F172A" : "white",
    color: filled ? "white" : "#0F172A",
    fontSize: 13, fontWeight: 600,
    cursor: busy ? "wait" : "pointer",
    opacity: busy ? 0.7 : 1,
  };
}
