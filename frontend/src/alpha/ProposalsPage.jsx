import React, { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  Inbox, CheckCircle2, XCircle, Clock, AlertTriangle, Loader2, RefreshCw,
} from "lucide-react";
import { useTheme, BRAND_GRADIENT } from "./ThemeContext";
import { useLanguage } from "../i18n/LanguageContext";
import { listProposals, approveProposal, rejectProposal } from "./alphaApi";
import OrderConfirmModal from "./OrderConfirmModal";

/**
 * 자동주문 승인 큐.
 * SIGNAL이 만든 PENDING 제안 + 사용자 수동 제안을 모두 표시.
 * 승인 = 즉시 KIS 주문 (BrokerAccount.tradingEnabled 필수).
 */

const STATUS_ICONS = {
  PENDING:     { color: "#D97706", bg: "#FEF3C7", Icon: Clock },
  APPROVED:    { color: "#0369A1", bg: "#DBEAFE", Icon: CheckCircle2 },
  EXECUTED:    { color: "#15803D", bg: "#DCFCE7", Icon: CheckCircle2 },
  REJECTED:    { color: "#6B7280", bg: "#F3F4F6", Icon: XCircle },
  EXPIRED:     { color: "#6B7280", bg: "#F3F4F6", Icon: Clock },
  EXEC_FAILED: { color: "#B91C1C", bg: "#FEE2E2", Icon: AlertTriangle },
  ALL:         { color: "#6B7280", bg: "#F3F4F6", Icon: Clock },
};

export default function ProposalsPage() {
  const { theme } = useTheme();
  const { t } = useLanguage();
  const [filter, setFilter] = useState("ALL");
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState(null);
  const [confirming, setConfirming] = useState(null); // proposal
  const [modalErr, setModalErr] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await listProposals(filter === "ALL" ? null : filter);
      setRows(data);
    } catch (e) {
      setError(e?.response?.data?.error || e.message);
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => { load(); }, [load]);

  const onApprove = (p) => {
    setModalErr(null);
    setConfirming(p);
  };

  const onConfirmApprove = async () => {
    if (!confirming) return;
    setBusyId(confirming.id);
    setModalErr(null);
    try {
      await approveProposal(confirming.id);
      setConfirming(null);
      await load();
    } catch (e) {
      setModalErr(e?.response?.data?.error || e.message);
    } finally {
      setBusyId(null);
    }
  };

  const onReject = async (p) => {
    const reason = window.prompt(t("proposals.rejectPrompt"), "");
    if (reason === null) return;
    setBusyId(p.id);
    try {
      await rejectProposal(p.id, reason);
      await load();
    } catch (e) {
      alert(t("proposals.rejectFailed").replace("{err}", e?.response?.data?.error || e.message));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="alpha-proposals" style={{ padding: "36px 40px 80px", background: "#F8FAFC", minHeight: "calc(100vh - 44px)" }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 32, flexWrap: "wrap", gap: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <div style={{
            width: 54, height: 54, borderRadius: 17, flexShrink: 0,
            background: "linear-gradient(135deg,#60a5fa 0%,#6366f1 100%)",
            display: "flex", alignItems: "center", justifyContent: "center",
            boxShadow: "0 6px 20px rgba(99,102,241,0.32)",
          }}>
            <Inbox size={24} color="white" strokeWidth={2.2} />
          </div>
          <div>
            <h1 style={{
              margin: 0, fontSize: 26, fontWeight: 800, lineHeight: 1.15,
              background: "linear-gradient(90deg,#3b82f6 0%,#6366f1 100%)",
              WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
            }}>
              {t("proposals.title")}
            </h1>
            <p style={{ margin: "5px 0 0", fontSize: 13, color: "#64748B", fontWeight: 500 }}>
              {t("proposals.subtitle")}
            </p>
          </div>
        </div>
        <button onClick={load} disabled={loading}
          style={{
            background: "white", border: "1.5px solid #E2E8F0",
            color: "#475569", padding: "9px 18px", borderRadius: 12,
            cursor: "pointer", display: "flex", alignItems: "center", gap: 6, fontSize: 13,
            fontWeight: 600, boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
          }}>
          {loading ? <Loader2 size={14} className="spin" /> : <RefreshCw size={14} />}
          {t("proposals.refresh")}
        </button>
      </div>

      {/* 필터 */}
      <div className="filter-row" style={{ display: "flex", gap: 6, marginBottom: 18 }}>
        {["ALL", "PENDING", "EXECUTED", "REJECTED", "EXEC_FAILED"].map(s => (
          <button key={s} onClick={() => setFilter(s)}
            style={{
              padding: "6px 14px", borderRadius: 999, fontSize: 12, fontWeight: 600,
              background: filter === s ? theme.accent : theme.panel,
              color: filter === s ? "#fff" : theme.text,
              border: `1px solid ${filter === s ? theme.accent : theme.panelBorder}`,
              cursor: "pointer",
            }}>
            {STATUS_ICONS[s]?.Icon ? (() => { const I = STATUS_ICONS[s].Icon; return <I size={11} />; })() : null}
            {t(`proposals.status.${s}`) || s}
          </button>
        ))}
      </div>

      {error && (
        <div style={{
          padding: 12, background: "#FEE2E2", color: "#B91C1C",
          borderRadius: 8, fontSize: 13, marginBottom: 12,
        }}>{t("proposals.error").replace("{err}", error)}</div>
      )}

      {/* 카드 목록 */}
      {rows.length === 0 && !loading && (
        <div style={{
          padding: 40, textAlign: "center", color: theme.textMuted, fontSize: 14,
          background: theme.panel, borderRadius: 12, border: `1px dashed ${theme.panelBorder}`,
        }}>
          {t("proposals.noItems")}
        </div>
      )}

      <div style={{ display: "grid", gap: 10 }}>
        {rows.map(p => {
          const meta = STATUS_ICONS[p.status] || { color: "#6B7280", bg: "#F3F4F6", Icon: Clock };
          const SideIcon = meta.Icon;
          const isPending = p.status === "PENDING";
          return (
            <div key={p.id} className="prop-card"
              style={{
                background: theme.panel, border: `1px solid ${theme.panelBorder}`,
                borderRadius: 12, padding: 14, display: "flex", alignItems: "center", gap: 14,
              }}>
              <div style={{
                background: meta.bg, color: meta.color,
                padding: "4px 10px", borderRadius: 999, fontSize: 11, fontWeight: 700,
                display: "inline-flex", alignItems: "center", gap: 4, whiteSpace: "nowrap",
              }}>
                <SideIcon size={12} />{t(`proposals.status.${p.status}`) || p.status}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 14, color: theme.text, marginBottom: 2 }}>
                  <span style={{
                    color: p.side === "BUY" ? "#15803D" : "#B91C1C",
                    marginRight: 6,
                  }}>{p.side}</span>
                  {p.qtyDecimal != null ? `${p.qtyDecimal} · ${p.ticker}` : `${p.qty}주 · ${p.ticker}`}
                  {p.limitPrice && <span style={{ color: theme.textMuted, fontWeight: 500, marginLeft: 8 }}>
                    @ {p.qtyDecimal != null ? `${Number(p.limitPrice)} USDT` : `$${Number(p.limitPrice).toFixed(2)}`}
                  </span>}
                </div>
                <div style={{ fontSize: 12, color: theme.textMuted, marginBottom: 2 }}>
                  {p.rationale || t("proposals.noReason")}
                </div>
                <div style={{ fontSize: 11, color: theme.textMuted, opacity: 0.8 }}>
                  source={p.source}
                  {p.sourceSignalId && ` · signal#${p.sourceSignalId}`}
                  {" · "}broker#{p.brokerAccountId}
                  {" · "}{new Date(p.createdAt).toLocaleString("ko-KR")}
                  {p.kisOrderNo && ` · ${p.qtyDecimal != null ? "Binance" : "KIS"}#${p.kisOrderNo}`}
                  {p.execError && (
                    <span style={{ color: "#B91C1C", marginLeft: 8 }}>· {p.execError}</span>
                  )}
                </div>
              </div>
              {isPending && (
                <div className="prop-actions" style={{ display: "flex", gap: 6 }}>
                  <button disabled={busyId === p.id} onClick={() => onApprove(p)}
                    style={{
                      background: "linear-gradient(135deg, #60a5fa 0%, #3b82f6 50%, #6366f1 100%)",
                      color: "#fff", fontWeight: 700, fontSize: 12,
                      border: "none", borderRadius: 8, padding: "8px 14px",
                      cursor: busyId === p.id ? "wait" : "pointer",
                    }}>
                    {busyId === p.id ? "..." : t("proposals.approve")}
                  </button>
                  <button disabled={busyId === p.id} onClick={() => onReject(p)}
                    style={{
                      background: "#fff", color: "#374151", fontWeight: 600, fontSize: 12,
                      border: "1px solid #E5E7EB", borderRadius: 8, padding: "8px 12px",
                      cursor: busyId === p.id ? "wait" : "pointer",
                    }}>
                    {t("proposals.reject")}
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
      <style>{`
        .spin { animation: spin 1s linear infinite; }
        @keyframes spin { from { transform: rotate(0); } to { transform: rotate(360deg); } }
        @media (max-width: 768px) {
          .alpha-proposals { padding: 16px 12px !important; }
          .alpha-proposals h1 { font-size: 22px !important; }
          .alpha-proposals .filter-row { overflow-x: auto; flex-wrap: nowrap !important; -webkit-overflow-scrolling: touch; }
          .alpha-proposals .filter-row button { white-space: nowrap; flex-shrink: 0; }
          .alpha-proposals .prop-card { flex-wrap: wrap !important; }
          .alpha-proposals .prop-card .prop-actions { width: 100%; margin-top: 8px; }
          .alpha-proposals .prop-card .prop-actions button { flex: 1; min-height: 44px; font-size: 13px !important; }
        }
      `}</style>
      <OrderConfirmModal
        open={!!confirming}
        proposal={confirming}
        loading={busyId === confirming?.id}
        error={modalErr}
        onConfirm={onConfirmApprove}
        onClose={() => { if (busyId !== confirming?.id) { setConfirming(null); setModalErr(null); } }}
      />
    </div>
  );
}
