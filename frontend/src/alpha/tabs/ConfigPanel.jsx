import React, { useEffect, useState } from "react";
import { useTheme } from "../ThemeContext";
import {
  formalize, runBacktest, selectStrategyCandidate,
  listBrokerAccounts, linkWorkspaceBroker, setBrokerTrading,
  updateGoalProfile, patchBrokerLimits,
} from "../alphaApi";
import { Play } from "lucide-react";
import { PanelHeader, Card, Empty, primaryBtn, DonutChart } from "./helpers";

// ─── GoalProfileSummary ──────────────────────────────────────────────
function GoalProfileSummary({ profile, theme, wsId, onChange }) {
  const [currency, setCurrency] = useState("KRW");
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);
  const FX = 1380;
  if (!profile || typeof profile !== "object") return null;
  const fmtMoney = (v) => {
    if (v == null || v === "") return "—";
    const n = Number(v);
    if (currency === "USD") return `$${(n / FX).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
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
  const castNum = (s) => { const n = Number(String(s).replace(/[,\s₩$]/g, "")); return isNaN(n) ? null : n; };
  const castStr = (s) => String(s);

  const rows = [
    { label: "🎯 목표", key: "goal", value: profile.goal || "—", raw: profile.goal, type: "text", wide: true },
    { label: "⏳ 투자 기간", key: "horizon_years", value: profile.horizon_years != null ? `${profile.horizon_years}년` : "—", raw: profile.horizon_years, type: "num" },
    { label: "💰 초기 투자금", key: "initial_capital_krw", value: fmtMoney(profile.initial_capital_krw), raw: profile.initial_capital_krw, type: "num" },
    { label: "📅 월 적립금", key: "monthly_contribution_krw", value: fmtMoney(profile.monthly_contribution_krw), raw: profile.monthly_contribution_krw, type: "num" },
    { label: "💢 투자 성향", key: "risk_tolerance", value: riskLabel, raw: profile.risk_tolerance, type: "text" },
    {
      label: " 하루 매수 한도", key: "daily_buy_limit_krw",
      value: profile.daily_buy_limit_krw != null && profile.daily_buy_limit_krw !== ""
        ? fmtMoney(profile.daily_buy_limit_krw)
        : (Number(profile.initial_capital_krw) > 0 ? `추천 ${fmtMoney(Math.round(Number(profile.initial_capital_krw) * 0.01))}` : "—"),
      raw: profile.daily_buy_limit_krw, type: "num",
      hint: "보통 자산의 1% 권장",
      muted: profile.daily_buy_limit_krw == null || profile.daily_buy_limit_krw === "",
    },
    {
      label: "🏷️ 하루 매도 한도", key: "daily_sell_limit_krw",
      value: profile.daily_sell_limit_krw != null && profile.daily_sell_limit_krw !== ""
        ? fmtMoney(profile.daily_sell_limit_krw)
        : (Number(profile.initial_capital_krw) > 0 ? `추천 ${fmtMoney(Math.round(Number(profile.initial_capital_krw) * 0.01))}` : "—"),
      raw: profile.daily_sell_limit_krw, type: "num",
      hint: "보통 자산의 1% 권장",
      muted: profile.daily_sell_limit_krw == null || profile.daily_sell_limit_krw === "",
    },
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
                <div style={{ fontSize: 13, color: r.muted ? theme.textMuted : theme.text, fontWeight: r.muted ? 600 : 700, fontStyle: r.muted ? "italic" : "normal" }}>
                  {r.value}
                </div>
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
        const cashPct = profile.cash_pct != null
          ? Number(profile.cash_pct)
          : Math.max(0, 100 - rawSum);
        const items = rawItems.map((it) => ({
          ...it,
          value: cashPct > 0.01 ? (it.value / rawSum) * (100 - cashPct) : it.value,
        }));
        if (cashPct > 0.01) items.push({ label: "현금", value: cashPct, color: "#22c55e" });
        const totalKrw = Number(profile.initial_capital_krw || 0);
        const totalLabel = totalKrw > 0
          ? (currency === "USD"
              ? `$${(totalKrw / FX).toLocaleString("en-US", { maximumFractionDigits: 0 })}`
              : `₩${totalKrw.toLocaleString("ko-KR")}`)
          : `${items.length}종`;
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
              <DonutChart items={items} centerLabel="총 자산" centerValue={totalLabel} theme={theme} size={160} thickness={32} amountOf={amountOf} />
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

// ─── BrokerLimitsCard ────────────────────────────────────────────────
function BrokerLimitsCard({ theme }) {
  const [accts, setAccts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
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

// ─── ConfigPanel (default export) ────────────────────────────────────
export default function ConfigPanel({ id, ws, onChange, setTab, topSummary }) {
  const { theme } = useTheme();
  const [busy, setBusy] = useState(false);
  const [btBusy, setBtBusy] = useState(false);
  const [accounts, setAccounts] = useState([]);
  const [linking, setLinking] = useState(false);

  useEffect(() => {
    listBrokerAccounts().then(setAccounts).catch(() => setAccounts([]));
  }, []);

  const sc = ws.strategyConfig;
  const candidates = (sc && Array.isArray(sc.candidates))
    ? sc.candidates
    : (sc && typeof sc === "object" && (sc.strategy_name || sc.strategy_type))
        ? [{ ...sc, id: "cand-1" }]
        : [];
  const selectedId = sc?.selectedId || candidates[0]?.id || null;

  const onFormalize = async () => {
    if (busy) return;
    setBusy(true);
    try { await formalize(id); onChange(); }
    catch (e) { alert("정형화 실패: " + (e?.response?.data?.error || e.message)); }
    finally { setBusy(false); }
  };

  const onSelect = async (candId) => {
    try { await selectStrategyCandidate(id, candId); onChange(); }
    catch (e) { alert("선택 실패: " + (e?.response?.data?.error || e.message)); }
  };

  const onRunBacktest = async (candId) => {
    if (btBusy) return;
    setBtBusy(true);
    try {
      if (candId && candId !== selectedId) await selectStrategyCandidate(id, candId);
      await runBacktest(id);
      await onChange();
      if (setTab) setTab("report");
    } catch (e) {
      alert("백테스트 실패: " + (e?.response?.data?.error || e.message));
    } finally { setBtBusy(false); }
  };

  const onLink = async (e) => {
    const v = e.target.value;
    const newId = v === "" ? null : Number(v);
    setLinking(true);
    try {
      await linkWorkspaceBroker(id, newId);
      if (newId != null) {
        const picked = accounts.find(a => a.id === newId);
        if (picked && picked.env === "MOCK" && !picked.tradingEnabled) {
          try { await setBrokerTrading("MOCK", true); } catch { /* noop */ }
        }
      }
      onChange();
    } catch (err) {
      alert("계정 연결 실패: " + (err?.response?.data?.error || err.message));
    } finally {
      setLinking(false);
    }
  };

  const headerBtnLabel = busy ? "변환 중…" : (candidates.length > 0 ? "후보 다시 생성" : "Goal → Strategy");

  return (
    <div>
      <PanelHeader
        icon="🧩"
        title="Strategy Card"
        description="Goal Profile로 LLM이 6개 템플릿 중 3개 후보를 제시합니다. 후보 중 하나를 선택해 백테스트를 실행하세요."
        theme={theme}
        action={
          <button onClick={onFormalize} disabled={!ws.goalProfile || busy} style={primaryBtn(theme, busy)}>
            <Play size={14} /> {headerBtnLabel}
          </button>
        }
      />

      {topSummary}

      <div style={{ display: "grid", gap: 16, gridTemplateColumns: "1fr 1fr" }}>
        <Card title="Goal Profile (사용자 목표 구조화)" theme={theme}>
          {ws.goalProfile
            ? <GoalProfileSummary profile={ws.goalProfile} theme={theme} wsId={id} onChange={onChange} />
            : <Empty msg="오른쪽 Heli 대화창에서 8가지 항목(목표/기간/초기금/적립금/성향/MDD/자산/방향)을 채워주세요" theme={theme} />}
        </Card>
        <Card title="Strategy 후보 (선택 → 백테스트)" theme={theme}>
          {candidates.length === 0 ? (
            <Empty msg="Goal Profile이 채워지면 상단의 Goal → Strategy 버튼으로 3개 후보를 생성합니다" theme={theme} />
          ) : (
            <div style={{ display: "grid", gap: 10 }}>
              {candidates.map((c) => {
                const isSel = c.id === selectedId;
                return (
                  <div key={c.id} style={{
                    border: `1px solid ${isSel ? theme.accent : theme.panelBorder}`,
                    background: isSel ? `${theme.accent}10` : theme.bg,
                    borderRadius: 10, padding: 12,
                  }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                      <div style={{ fontWeight: 700, color: theme.text, fontSize: 14 }}>
                        {c.strategy_name || c.strategy_type}
                        {c.risk_tone && (
                          <span style={{
                            marginLeft: 8, fontSize: 11, padding: "2px 8px", borderRadius: 999,
                            background: theme.panelBorder, color: theme.textMuted, fontWeight: 600,
                          }}>{c.risk_tone}</span>
                        )}
                      </div>
                      {isSel && <span style={{ fontSize: 11, color: theme.accent, fontWeight: 700 }}>✓ 선택됨</span>}
                    </div>
                    <div style={{ fontSize: 12, color: theme.textMuted, marginBottom: 6, lineHeight: 1.55 }}>
                      <b>{c.strategy_type}</b> · 자산: {Array.isArray(c.assets) ? c.assets.join(", ") : "-"}
                    </div>
                    {c.rationale && (
                      <div style={{ fontSize: 12, color: theme.text, marginBottom: 10, lineHeight: 1.6 }}>
                        {c.rationale}
                      </div>
                    )}
                    <div style={{ display: "flex", gap: 6 }}>
                      {!isSel && (
                        <button onClick={() => onSelect(c.id)} style={{
                          flex: 1, padding: "7px 10px", borderRadius: 7,
                          border: `1px solid ${theme.panelBorder}`, background: "white",
                          color: theme.text, fontSize: 12, fontWeight: 600, cursor: "pointer",
                        }}>이 후보 선택</button>
                      )}
                      <button onClick={() => onRunBacktest(c.id)} disabled={btBusy} style={{
                        flex: 1, padding: "7px 10px", borderRadius: 7, border: "none",
                        background: theme.accentGradient || theme.accent, color: "white",
                        fontSize: 12, fontWeight: 700, cursor: btBusy ? "wait" : "pointer",
                      }}>
                        <Play size={11} style={{ display: "inline", verticalAlign: "middle", marginRight: 4 }} />
                        {btBusy ? "실행 중…" : "이 전략으로 백테스트"}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        <Card title="🔗 자동주문 BrokerAccount 연결" theme={theme}>
          <p style={{ fontSize: 12, color: theme.textMuted, marginTop: 0, marginBottom: 12, lineHeight: 1.6 }}>
            이 워크스페이스의 시그널이 BUY를 발사하면 선택된 계정 앞으로 <b>PENDING 제안</b>이 만들어집니다.
            승인은 좌측 사이드바 인박스에서 수동으로 해야 KIS로 전송됩니다.
          </p>
          <select
            value={ws.brokerAccountId || ""}
            onChange={onLink}
            disabled={linking}
            style={{
              width: "100%", padding: "10px 12px", borderRadius: 8,
              border: `1px solid ${theme.panelBorder}`, background: theme.bg,
              color: theme.text, fontSize: 13,
            }}>
            <option value="">— 연결 안 함 (자동주문 비활성) —</option>
            {accounts.map(a => (
              <option key={a.id} value={a.id}>
                [{a.env}] {a.cano} {a.env === "MOCK" ? "· 모의" : (a.tradingEnabled ? "✓ 거래허용" : "✗ 거래잠김")}
              </option>
            ))}
          </select>
          {ws.brokerAccount && (
            <div style={{ marginTop: 10, fontSize: 12, color: theme.textMuted, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <span>현재 연결: <b>{ws.brokerAccount.env}</b> · {ws.brokerAccount.cano}
                {ws.brokerAccount.tradingEnabled
                  ? <span style={{ color: "#059669", marginLeft: 6, fontWeight: 700 }}>· ✓ 거래 열림</span>
                  : <span style={{ color: "#B91C1C", marginLeft: 6 }}>· ⚠️ 거래 잠김 — <b>계좌 탭</b>에서 토글하세요</span>}
              </span>
            </div>
          )}
          {accounts.length === 0 && (
            <div style={{ marginTop: 10, fontSize: 12, color: theme.textMuted }}>
              등록된 BrokerAccount가 없습니다. <b>계좌 · 주문</b> 페이지에서 먼저 등록하세요.
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
