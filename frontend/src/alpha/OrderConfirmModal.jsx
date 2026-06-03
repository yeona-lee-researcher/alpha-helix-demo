import React, { useEffect, useState, useMemo } from "react";
import { X, AlertTriangle, CheckCircle2, Loader2, Settings2 } from "lucide-react";
import { useTheme, BRAND_GRADIENT } from "./ThemeContext";
import { listBrokerAccounts, patchBrokerLimits } from "./alphaApi";

/**
 * 주문 승인 확인 모달.
 *  - 데스크탑(>=768px): 중앙 모달
 *  - 모바일(<768px):    하단 bottom-sheet (iOS/iPad 친화)
 *
 * Props:
 *   open: boolean
 *   proposal: { id, ticker, side, qty, limitPrice, rationale, brokerAccountId }
 *   loading: boolean
 *   error: string|null
 *   onConfirm(): Promise<void>
 *   onClose(): void
 */
export default function OrderConfirmModal({ open, proposal, loading, error, onConfirm, onClose }) {
  const { theme } = useTheme();
  const [isMobile, setIsMobile] = useState(
    typeof window !== "undefined" && window.matchMedia("(max-width: 768px)").matches
  );

  // ── 한도 인라인 편집용 상태 ───────────────────────────────────
  const [brokerEnv, setBrokerEnv] = useState(null);   // "MOCK" | "REAL"
  const [brokerType, setBrokerType] = useState(null); // "KIS" | "BINANCE" — 한도조정 라우팅(Binance 제안이 KIS 계좌를 잘못 건드리는 것 방지)
  const [currentMax, setCurrentMax] = useState(null); // 현재 1건당 한도
  const [currentDaily, setCurrentDaily] = useState(null); // 현재 일일 한도
  const [newMax, setNewMax] = useState("");           // 사용자가 입력 중인 값
  const [saving, setSaving] = useState(false);
  const [saveErr, setSaveErr] = useState(null);

  // error 메시지에서 어떤 한도가 깨졌는지 판별
  const limitKind = useMemo(() => {
    if (!error) return null;
    const s = String(error);
    if (s.includes("일일 누적 한도")) return "daily";
    if (s.includes("1건당 한도")) return "per_order";
    return null;
  }, [error]);
  const isLimitErr = limitKind != null;
  // 깨진 한도를 위한 추천값 계산 (오늘 사용량 + 신규를 안전히 수용)
  const parseExceeded = useMemo(() => {
    if (!error) return null;
    const s = String(error);
    // 예: "일일 누적 한도(USD 5000) 초과: 오늘 0.0 + 신규 124931.92"
    const todayMatch = s.match(/오늘\s+([\d.]+)\s*\+\s*신규\s+([\d.]+)/);
    if (todayMatch) {
      return { today: Number(todayMatch[1]), neu: Number(todayMatch[2]) };
    }
    return null;
  }, [error]);

  // 한도 초과 에러가 발생하면 brokerAccountId 로 env / 현재 한도 조회
  useEffect(() => {
    if (!isLimitErr || !proposal?.brokerAccountId) return;
    let aborted = false;
    (async () => {
      try {
        const list = await listBrokerAccounts();
        if (aborted) return;
        const acct = list.find(b => b.id === proposal.brokerAccountId);
        if (!acct) return;
        setBrokerEnv(acct.env);
        setBrokerType(acct.brokerType);
        setCurrentMax(acct.maxOrderUsd);
        setCurrentDaily(acct.dailyOrderUsd);
        // 깨진 한도 종류에 따라 추천값 산출
        const est = proposal?.limitPrice ? Number(proposal.limitPrice) * (proposal.qtyDecimal != null ? Number(proposal.qtyDecimal) : Number(proposal.qty)) : 0;
        let suggested;
        if (limitKind === "daily") {
          // 오늘 사용량 + 신규를 1.2배 여유로 수용
          const needed = parseExceeded
            ? (parseExceeded.today + parseExceeded.neu)
            : (est || acct.dailyOrderUsd || 5000);
          suggested = Math.max(1000, Math.ceil(needed * 1.2 / 100) * 100);
        } else {
          // 1건당: 예상 총액을 1.2배
          const needed = est || acct.maxOrderUsd || 1000;
          suggested = Math.max(1000, Math.ceil(needed * 1.2 / 100) * 100);
        }
        setNewMax(String(suggested));
      } catch (_) { /* ignore */ }
    })();
    return () => { aborted = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLimitErr, limitKind, proposal?.brokerAccountId]);

  const onSaveLimit = async () => {
    if (!brokerEnv || !limitKind) return;
    const v = parseInt(newMax, 10);
    if (!Number.isFinite(v) || v <= 0) { setSaveErr("0보다 큰 정수를 입력하세요"); return; }
    if (brokerEnv === "REAL") {
      if (limitKind === "per_order" && v > 50000) { setSaveErr("실전계좌 1건당 한도는 USD 50,000 이하"); return; }
      if (limitKind === "daily" && v > 200000) { setSaveErr("실전계좌 일일 한도는 USD 200,000 이하"); return; }
    }
    setSaving(true); setSaveErr(null);
    try {
      const key = limitKind === "daily" ? "dailyOrderUsd" : "maxOrderUsd";
      await patchBrokerLimits(brokerEnv, { [key]: v }, brokerType);
      if (limitKind === "daily") setCurrentDaily(v); else setCurrentMax(v);
      // 한도 저장 성공 → 바로 주문 재시도
      await onConfirm();
    } catch (e) {
      setSaveErr(e?.response?.data?.error || e.message);
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(max-width: 768px)");
    const handler = (e) => setIsMobile(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  // ESC 닫기
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === "Escape" && !loading) onClose(); };
    window.addEventListener("keydown", onKey);
    // 모바일 스크롤 잠금
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, loading, onClose]);

  if (!open || !proposal) return null;

  const isBuy = proposal.side === "BUY";
  const sideColor = isBuy ? "#15803D" : "#B91C1C";
  const sideBg = isBuy ? "#DCFCE7" : "#FEE2E2";
  const isCrypto = proposal.qtyDecimal != null;   // Binance 분수수량 제안
  const qtyNum = isCrypto ? Number(proposal.qtyDecimal) : Number(proposal.qty);
  const qtyLabel = isCrypto ? `${proposal.qtyDecimal} · ${proposal.ticker}` : `${proposal.qty}주 · ${proposal.ticker}`;
  const estUsd = proposal.limitPrice
    ? Number(proposal.limitPrice) * qtyNum
    : null;
  const sheet = {
    background: theme.panel,
    color: theme.text,
    boxShadow: "0 -8px 30px rgba(0,0,0,0.25)",
    padding: 24,
    width: "100%",
    boxSizing: "border-box",
    ...(isMobile
      ? {
          borderTopLeftRadius: 20,
          borderTopRightRadius: 20,
          paddingBottom: "calc(24px + env(safe-area-inset-bottom))",
          maxHeight: "85vh",
          overflowY: "auto",
        }
      : {
          borderRadius: 16,
          maxWidth: 440,
          margin: "auto",
        }),
  };

  const overlay = {
    position: "fixed",
    inset: 0,
    zIndex: 9999,
    background: "rgba(0,0,0,0.5)",
    display: "flex",
    alignItems: isMobile ? "flex-end" : "center",
    justifyContent: "center",
    padding: isMobile ? 0 : 16,
  };

  return (
    <div style={overlay} onClick={() => !loading && onClose()}>
      <div style={sheet} onClick={(e) => e.stopPropagation()}>
        {/* 모바일 핸들 */}
        {isMobile && (
          <div style={{
            width: 40, height: 4, background: "#9CA3AF", opacity: 0.5,
            borderRadius: 999, margin: "0 auto 16px",
          }} />
        )}

        <div style={{ display: "flex", alignItems: "center", marginBottom: 16 }}>
          <h2 style={{
            margin: 0, fontSize: 20, fontWeight: 900, letterSpacing: -0.3,
            background: BRAND_GRADIENT,
            WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
            backgroundClip: "text",
          }}>
            주문 승인 확인
          </h2>
          <button onClick={onClose} disabled={loading}
            aria-label="닫기"
            style={{
              marginLeft: "auto", background: "transparent", border: "none",
              cursor: loading ? "wait" : "pointer", padding: 6, color: theme.textMuted,
            }}>
            <X size={20} />
          </button>
        </div>

        <div style={{
          background: theme.bg, border: `1px solid ${theme.panelBorder}`,
          borderRadius: 12, padding: 16, marginBottom: 14,
        }}>
          <div style={{
            display: "inline-block",
            background: sideBg, color: sideColor,
            padding: "4px 12px", borderRadius: 999,
            fontSize: 12, fontWeight: 800, marginBottom: 10,
          }}>
            {isBuy ? "매수 BUY" : "매도 SELL"}
          </div>
          <div style={{ fontSize: 26, fontWeight: 900, marginBottom: 4, letterSpacing: -0.5 }}>
            {qtyLabel}
          </div>
          {proposal.limitPrice && (
            <div style={{ fontSize: 14, color: theme.textMuted }}>
              지정가 {isCrypto ? `${Number(proposal.limitPrice)} USDT` : `$${Number(proposal.limitPrice).toFixed(2)}`}
              {estUsd && (
                <span style={{ marginLeft: 10, color: theme.text, fontWeight: 700 }}>
                  예상 ${estUsd.toLocaleString("en-US", { maximumFractionDigits: 2 })}
                </span>
              )}
            </div>
          )}
          {proposal.rationale && (
            <div style={{
              marginTop: 10, fontSize: 13, color: theme.textMuted,
              borderTop: `1px dashed ${theme.panelBorder}`, paddingTop: 10,
            }}>
              {proposal.rationale}
            </div>
          )}
        </div>

        {/* 경고 박스 */}
        <div style={{
          display: "flex", alignItems: "flex-start", gap: 8,
          background: "#FEF3C7", color: "#92400E",
          border: "1px solid #FCD34D", borderRadius: 8,
          padding: 10, fontSize: 12, lineHeight: 1.5, marginBottom: 14,
        }}>
          <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: 1 }} />
          <div>
            승인 시 즉시 {isCrypto ? "Binance" : "KIS"} 계좌로 주문이 전송됩니다.
            {isCrypto
              ? " 크립토 시장은 24시간 거래되며, 시장가 주문은 즉시 체결됩니다."
              : " 전송 후 취소는 KIS 영업시간 내에서만 가능합니다."}
          </div>
        </div>

        {error && (
          <div style={{
            background: "#FEE2E2", color: "#B91C1C", border: "1px solid #FCA5A5",
            borderRadius: 8, padding: 10, fontSize: 12, marginBottom: 12,
            wordBreak: "break-word",
          }}>
            {error}
          </div>
        )}

        {/* 한도 초과 시 인라인 편집 — 모달 닫지 않고 바로 한도 올리고 재시도 (1건당 + 일일 누적 모두 지원) */}
        {isLimitErr && brokerEnv && (
          <div style={{
            background: "#EFF6FF", color: "#1E3A8A", border: "1px solid #BFDBFE",
            borderRadius: 10, padding: 12, marginBottom: 12, boxSizing: "border-box", overflow: "hidden",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 700, marginBottom: 6 }}>
              <Settings2 size={14} />
              {limitKind === "daily" ? "일일 누적 한도" : "1건당 한도"} 즉시 조정 ({brokerEnv === "REAL" ? "실전" : "모의"})
            </div>
            <div style={{ fontSize: 11, color: "#475569", marginBottom: 8, lineHeight: 1.5 }}>
              현재: <b>USD {Number((limitKind === "daily" ? currentDaily : currentMax) || 0).toLocaleString("en-US")}</b>
              {limitKind === "daily" && parseExceeded && (
                <> · 오늘 사용 <b>${parseExceeded.today.toLocaleString("en-US",{maximumFractionDigits:0})}</b> + 신규 <b>${parseExceeded.neu.toLocaleString("en-US",{maximumFractionDigits:0})}</b></>
              )}
              {limitKind === "per_order" && estUsd && (
                <> · 예상 총액 <b>USD {estUsd.toLocaleString("en-US", { maximumFractionDigits: 0 })}</b></>
              )}
              {brokerEnv === "REAL" && <> · 실전 최대 {limitKind === "daily" ? "200,000" : "50,000"}</>}
            </div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "stretch" }}>
              <div style={{
                display: "flex", alignItems: "center", width: 150, flexShrink: 0,
                background: "#fff", border: "1px solid #BFDBFE", borderRadius: 8,
                padding: "0 8px", minHeight: 38,
              }}>
                <span style={{ color: "#64748B", fontSize: 12, marginRight: 4 }}>USD</span>
                <input
                  type="number" min="1" step="100" value={newMax}
                  onChange={(e) => setNewMax(e.target.value)}
                  disabled={saving || loading}
                  style={{
                    flex: 1, border: "none", outline: "none", background: "transparent",
                    fontSize: 13, fontWeight: 700, color: "#0F172A", minWidth: 0, width: "100%",
                  }}
                />
              </div>
              <button onClick={onSaveLimit} disabled={saving || loading}
                style={{
                  flex: 1, minWidth: 0,
                  background: "linear-gradient(135deg, #60a5fa 0%, #3b82f6 50%, #6366f1 100%)",
                  color: "#fff", fontWeight: 800, fontSize: 13,
                  border: "none", borderRadius: 8, padding: "0 10px", minHeight: 38,
                  cursor: (saving || loading) ? "wait" : "pointer", whiteSpace: "nowrap",
                  display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6,
                }}>
                {saving ? <Loader2 size={14} className="spin" /> : <CheckCircle2 size={14} />}
                {saving ? "저장 중…" : "한도수정 재시도"}
              </button>
            </div>
            {saveErr && (
              <div style={{ marginTop: 8, fontSize: 12, color: "#B91C1C" }}>{saveErr}</div>
            )}
          </div>
        )}

        <div style={{ display: "flex", gap: 8, flexDirection: isMobile ? "column-reverse" : "row" }}>
          <button onClick={onClose} disabled={loading}
            style={{
              flex: 1, padding: "14px 16px", borderRadius: 10,
              background: "#fff", color: "#374151", fontWeight: 700, fontSize: 14,
              border: "1px solid #E5E7EB", cursor: loading ? "wait" : "pointer",
              minHeight: 48,
            }}>
            취소
          </button>
          <button onClick={onConfirm} disabled={loading}
            style={{
              flex: 1, padding: "14px 16px", borderRadius: 10,
              background: "linear-gradient(135deg, #60a5fa 0%, #3b82f6 50%, #6366f1 100%)",
              color: "#fff", fontWeight: 800, fontSize: 14,
              border: "none", cursor: loading ? "wait" : "pointer",
              display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
              minHeight: 48,
            }}>
            {loading ? <Loader2 size={16} className="spin" /> : <CheckCircle2 size={16} />}
            {loading ? "전송 중..." : "승인하고 주문 보내기"}
          </button>
        </div>
      </div>
      <style>{`
        @keyframes spin { from { transform: rotate(0); } to { transform: rotate(360deg); } }
        .spin { animation: spin 1s linear infinite; }
      `}</style>
    </div>
  );
}
